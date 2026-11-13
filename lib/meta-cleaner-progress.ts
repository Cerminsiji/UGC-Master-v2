import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';

export type CleanerStage =
  | 'queued'
  | 'probing'
  | 'pass1_reencode'
  | 'pass2_remux'
  | 'binary_sanitize'
  | 'completed'
  | 'failed';

export interface CleanerProgressState {
  jobId: string;
  stage: CleanerStage;
  message: string;
  percent: number;
  frame: number;
  totalFrames: number;
  fps: number;
  speed: string;
  outTimeSec: number;
  durationSec: number;
  engine: string;
  logs: string[];
  updatedAt: string;
  error?: string;
}

export function sanitizeJobId(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

export function getProgressFilePath(jobId: string): string {
  const safe = sanitizeJobId(jobId) || 'default';
  return path.join(os.tmpdir(), `metacleaner_progress_${safe}.json`);
}

export async function writeProgressAtomic(state: CleanerProgressState): Promise<void> {
  const safeId = sanitizeJobId(state.jobId);
  if (!safeId) return;
  const targetPath = getProgressFilePath(safeId);
  const tmpPath = `${targetPath}.tmp.${process.pid}.${Date.now()}`;
  const payload = JSON.stringify({
    ...state,
    jobId: safeId,
    updatedAt: new Date().toISOString(),
  });
  try {
    await fs.writeFile(tmpPath, payload, 'utf8');
    await fs.rename(tmpPath, targetPath);
  } catch {
    try {
      await fs.unlink(tmpPath);
    } catch {}
  }
}

export function writeProgressAtomicSync(state: CleanerProgressState): void {
  const safeId = sanitizeJobId(state.jobId);
  if (!safeId) return;
  const targetPath = getProgressFilePath(safeId);
  const tmpPath = `${targetPath}.tmp.${process.pid}.${Date.now()}`;
  const payload = JSON.stringify({
    ...state,
    jobId: safeId,
    updatedAt: new Date().toISOString(),
  });
  try {
    fsSync.writeFileSync(tmpPath, payload, 'utf8');
    fsSync.renameSync(tmpPath, targetPath);
  } catch {
    try {
      fsSync.unlinkSync(tmpPath);
    } catch {}
  }
}

export async function readProgressSafe(jobId: string): Promise<CleanerProgressState | null> {
  const safeId = sanitizeJobId(jobId);
  if (!safeId) return null;
  const targetPath = getProgressFilePath(safeId);
  try {
    const raw = await fs.readFile(targetPath, 'utf8');
    return JSON.parse(raw) as CleanerProgressState;
  } catch {
    return null;
  }
}
