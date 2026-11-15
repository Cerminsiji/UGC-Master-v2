import { NextRequest, NextResponse } from 'next/server';
import * as fsSync from 'fs';
import * as fs from 'fs/promises';
import {
  CleanerProgressState,
  getResultFilePath,
  readProgressSafe,
  sanitizeJobId,
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
  let resultReady = false;
  let resultSize = 0;

  try {
    if (fsSync.existsSync(resultPath)) {
      const stat = await fs.stat(resultPath);
      if (stat.size > 16384) {
        resultReady = true;
        resultSize = stat.size;
      }
    }
  } catch {}

  if (resultReady && state.stage !== 'completed') {
    state = {
      ...state,
      stage: 'completed',
      percent: 100,
      resultReady: true,
      outputSizeBytes: resultSize,
      downloadUrl: `/api/meta-cleaner/download?jobId=${encodeURIComponent(jobId)}`,
      message: `Resync berhasil: Output siap (${(resultSize / (1024 * 1024)).toFixed(2)} MB)`,
      updatedAt: new Date().toISOString(),
    };
    await writeProgressAtomic(state);
  } else if (resultReady) {
    state = {
      ...state,
      resultReady: true,
      outputSizeBytes: state.outputSizeBytes || resultSize,
      downloadUrl: state.downloadUrl || `/api/meta-cleaner/download?jobId=${encodeURIComponent(jobId)}`,
    };
  }

  const updatedMs = Date.parse(state.updatedAt || '');
  const ageMs = Number.isFinite(updatedMs) ? Math.max(0, Date.now() - updatedMs) : 0;

  return { state, resultReady, ageMs };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const jobId = sanitizeJobId(url.searchParams.get('jobId'));
  const wantStream =
    url.searchParams.get('stream') === '1' ||
    (req.headers.get('accept') || '').includes('text/event-stream');
  const wantResync = url.searchParams.get('resync') === '1';

  if (!jobId) {
    return NextResponse.json({ error: 'jobId diperlukan' }, { status: 400 });
  }

  if (wantResync) {
    const { state, resultReady, ageMs } = await reconcileStateWithDisk(jobId);
    const nextResyncCount = (state.resyncCount || 0) + 1;
    const stalled = !resultReady && state.stage !== 'completed' && state.stage !== 'failed' && ageMs > 12000;
    const updatedState: CleanerProgressState = {
      ...state,
      resyncCount: nextResyncCount,
      lastResyncAt: new Date().toISOString(),
      resultReady,
    };
    if (!resultReady && state.stage !== 'completed' && state.stage !== 'failed') {
      const existingLogs = Array.isArray(updatedState.logs) ? [...updatedState.logs] : [];
      existingLogs.push(
        `[TELEMETRY RESYNC #${nextResyncCount}] Sinkronisasi status pada ${updatedState.percent}% (idle ${(ageMs / 1000).toFixed(1)}s)...`
      );
      updatedState.logs = existingLogs.slice(-24);
      await writeProgressAtomic(updatedState);
    }
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

  if (!wantStream) {
    const { state } = await reconcileStateWithDisk(jobId);
    return NextResponse.json(state, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let lastSerialized = '';
      let ticks = 0;
      const maxTicks = 240;

      const sendEvent = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const interval = setInterval(async () => {
        ticks++;
        try {
          const { state } = await reconcileStateWithDisk(jobId);
          const serialized = JSON.stringify(state);
          if (serialized !== lastSerialized) {
            lastSerialized = serialized;
            sendEvent(state);
          }
          if (state.stage === 'completed' || state.stage === 'failed') {
            clearInterval(interval);
            controller.close();
            return;
          }
          if (ticks >= maxTicks) {
            clearInterval(interval);
            controller.close();
          }
        } catch {
          clearInterval(interval);
          try {
            controller.close();
          } catch {}
        }
      }, 500);

      req.signal.addEventListener('abort', () => {
        clearInterval(interval);
        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const jobId = sanitizeJobId(body?.jobId);
    const action = typeof body?.action === 'string' ? body.action : 'resync';
    const stalledAtPercent =
      typeof body?.stalledAtPercent === 'number' ? body.stalledAtPercent : undefined;

    if (!jobId) {
      return NextResponse.json({ error: 'Parameter jobId tidak valid.' }, { status: 400 });
    }

    const { state, resultReady, ageMs } = await reconcileStateWithDisk(jobId);
    const nextResyncCount = (state.resyncCount || 0) + 1;
    const stalled =
      !resultReady && state.stage !== 'completed' && state.stage !== 'failed' && ageMs > 12000;

    if (action === 'resync') {
      const updatedState: CleanerProgressState = {
        ...state,
        resyncCount: nextResyncCount,
        lastResyncAt: new Date().toISOString(),
        resultReady,
      };

      if (!resultReady && state.stage !== 'completed' && state.stage !== 'failed') {
        const pctLabel = stalledAtPercent ?? updatedState.percent;
        const existingLogs = Array.isArray(updatedState.logs) ? [...updatedState.logs] : [];
        existingLogs.push(
          `[TELEMETRY RESYNC #${nextResyncCount}] Deteksi stall di ${pctLabel}% (idle ${(ageMs / 1000).toFixed(1)}s) — memverifikasi worker & buffer hasil...`
        );
        updatedState.logs = existingLogs.slice(-24);
        await writeProgressAtomic(updatedState);
      }

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

    return NextResponse.json(
      {
        resynced: false,
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
      { error: err?.message || 'Gagal melakukan resync telemetri.' },
      { status: 500 }
    );
  }
}
