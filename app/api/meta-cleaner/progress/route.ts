import { NextRequest, NextResponse } from 'next/server';
import * as fsSync from 'fs';
import * as fs from 'fs/promises';
import {
  CleanerProgressState,
  META_CLEANER_AUTO_CLEAN_MS,
  cleanupJobArtifacts,
  getResultFilePath,
  readProgressSafe,
  sanitizeJobId,
  sweepExpiredMetaCleanerFiles,
  writeProgressAtomic,
} from '@/lib/meta-cleaner-progress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function buildDefaultState(jobId: string): CleanerProgressState {
  return {
    jobId,
    stage: 'queued',
    message: 'Menunggu inisialisasi worker cloud FFmpeg...',
    percent: 0,
    frame: 0,
    totalFrames: 0,
    fps: 0,
    speed: '0x',
    outTimeSec: 0,
    durationSec: 0,
    engine: 'Cloud Python/Node FFmpeg',
    logs: [],
    updatedAt: new Date().toISOString(),
  };
}

async function reconcileStateWithDisk(jobId: string): Promise<{
  state: CleanerProgressState;
  resultReady: boolean;
  ageMs: number;
}> {
  let state = (await readProgressSafe(jobId)) || buildDefaultState(jobId);
  const resultPath = getResultFilePath(jobId);
  const now = Date.now();

  // Enforce 5-minute auto-clean expiration on completed jobs
  if (state.stage === 'completed') {
    const expiresMs = state.expiresAt ? Date.parse(state.expiresAt) : NaN;
    const isExpiredByTime = Number.isFinite(expiresMs) && now >= expiresMs;
    const fileExists = fsSync.existsSync(resultPath);

    if (isExpiredByTime || state.expired || !fileExists) {
      if (fileExists || !state.expired) {
        await cleanupJobArtifacts(jobId, {
          reasonMessage:
            'Auto-Clean 5 Menit: File video input & output telah dihapus otomatis dari server.',
        });
        state = (await readProgressSafe(jobId)) || {
          ...state,
          resultReady: false,
          expired: true,
          cleanedUpAt: state.cleanedUpAt || new Date().toISOString(),
        };
      }
      return { state, resultReady: false, ageMs: 0 };
    }
  }

  let resultReady = false;
  let resultSize = 0;

  try {
    if (fsSync.existsSync(resultPath)) {
      const stat = await fs.stat(resultPath);
      if (stat.size > 16384) {
        if (now - stat.mtimeMs >= META_CLEANER_AUTO_CLEAN_MS) {
          await cleanupJobArtifacts(jobId);
          state = (await readProgressSafe(jobId)) || {
            ...state,
            resultReady: false,
            expired: true,
            cleanedUpAt: new Date().toISOString(),
          };
          return { state, resultReady: false, ageMs: 0 };
        }
        resultReady = true;
        resultSize = stat.size;
      }
    }
  } catch {}

  if (resultReady && state.stage !== 'completed') {
    const completedAt = state.completedAt || new Date().toISOString();
    const expiresAt =
      state.expiresAt || new Date(now + META_CLEANER_AUTO_CLEAN_MS).toISOString();
    state = {
      ...state,
      stage: 'completed',
      percent: 100,
      resultReady: true,
      completedAt,
      expiresAt,
      ttlSeconds: Math.round(META_CLEANER_AUTO_CLEAN_MS / 1000),
      expired: false,
      outputSizeBytes: resultSize,
      downloadUrl: `/api/meta-cleaner/download?jobId=${encodeURIComponent(jobId)}`,
      message: `Output siap (${(resultSize / (1024 * 1024)).toFixed(2)} MB) • Auto-Clean dalam 5 menit`,
      updatedAt: new Date().toISOString(),
    };
    await writeProgressAtomic(state);
  } else if (resultReady) {
    state = {
      ...state,
      resultReady: true,
      expired: false,
      ttlSeconds: state.ttlSeconds || Math.round(META_CLEANER_AUTO_CLEAN_MS / 1000),
      outputSizeBytes: state.outputSizeBytes || resultSize,
      downloadUrl:
        state.downloadUrl || `/api/meta-cleaner/download?jobId=${encodeURIComponent(jobId)}`,
    };
  }

  const updatedMs = Date.parse(state.updatedAt || '');
  const ageMs = Number.isFinite(updatedMs) ? Math.max(0, now - updatedMs) : 0;

  // Detect crashed/OOM-killed worker so polling UI never spins forever on a dead job
  const isActiveStage =
    state.stage === 'queued' ||
    state.stage === 'probing' ||
    state.stage === 'pass1_reencode' ||
    state.stage === 'pass2_remux' ||
    state.stage === 'binary_sanitize';
  if (!resultReady && isActiveStage && ageMs > 180_000) {
    state = {
      ...state,
      stage: 'failed',
      error: 'Worker server berhenti merespons (>3 menit tanpa update progres).',
      message:
        'Gagal: Proses FFmpeg di server terhenti di tengah jalan (timeout/memori). Silakan coba ulang.',
      updatedAt: new Date().toISOString(),
    };
    await writeProgressAtomic(state);
    return { state, resultReady: false, ageMs };
  }

  return { state, resultReady, ageMs };
}

export async function GET(req: NextRequest) {
  await sweepExpiredMetaCleanerFiles();

  const url = new URL(req.url);
  const jobId = sanitizeJobId(url.searchParams.get('jobId'));
  const wantResync = url.searchParams.get('resync') === '1';

  if (!jobId) {
    return NextResponse.json({ error: 'jobId diperlukan' }, { status: 400 });
  }

  const { state, resultReady, ageMs } = await reconcileStateWithDisk(jobId);

  if (wantResync) {
    const nextResyncCount = (state.resyncCount || 0) + 1;
    const stalled =
      !resultReady && state.stage !== 'completed' && state.stage !== 'failed' && ageMs > 45000;
    const updatedState: CleanerProgressState = {
      ...state,
      resyncCount: nextResyncCount,
      lastResyncAt: new Date().toISOString(),
      resultReady,
    };
    await writeProgressAtomic(updatedState);
    return NextResponse.json(
      {
        resynced: true,
        resultReady,
        stalled,
        ageMs,
        state: updatedState,
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }

  return NextResponse.json(state, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(req: NextRequest) {
  await sweepExpiredMetaCleanerFiles();

  try {
    const body = await req.json().catch(() => ({}));
    const jobId = sanitizeJobId(body?.jobId);

    if (!jobId) {
      return NextResponse.json({ error: 'Parameter jobId tidak valid.' }, { status: 400 });
    }

    const { state, resultReady, ageMs } = await reconcileStateWithDisk(jobId);
    const stalled =
      !resultReady && state.stage !== 'completed' && state.stage !== 'failed' && ageMs > 45000;

    return NextResponse.json(
      {
        resynced: true,
        resultReady,
        stalled,
        ageMs,
        state,
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Gagal memeriksa status pekerjaan di server.' },
      { status: 500 }
    );
  }
}
