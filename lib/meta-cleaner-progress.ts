import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';

export const META_CLEANER_AUTO_CLEAN_MS = 5 * 60 * 1000; // 5 minutes
export const META_CLEANER_UPLOAD_IDLE_MS = 30 * 60 * 1000; // 30 minutes for unfinished/idle uploads & long encodes

const ALLOWED_VIDEO_EXTENSIONS = new Set([
  'mp4',
  'mov',
  'webm',
  'mkv',
  'avi',
  'm4v',
  '3gp',
]);

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
  uploadId?: string;
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
  completedAt?: string;
  expiresAt?: string;
  ttlSeconds?: number;
  expired?: boolean;
  cleanedUpAt?: string;
  error?: string;
  outputSizeBytes?: number;
  downloadUrl?: string;
  appliedFilter?: string;
  resyncCount?: number;
  lastResyncAt?: string;
  resultReady?: boolean;
}

export interface UploadedVideoMeta {
  uploadId: string;
  filename: string;
  ext: string;
  sizeBytes: number;
  filePath: string;
  uploadedAt: string;
  expiresAt: string;
  completedAt?: string;
}

export function sanitizeJobId(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

export function sanitizeVideoExtension(rawNameOrExt: string | null | undefined): string {
  const raw = (rawNameOrExt || '').split('.').pop() || '';
  const clean = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  return ALLOWED_VIDEO_EXTENSIONS.has(clean) ? clean : 'mp4';
}

export function resolveConfinedTmpPath(fileNameOrRel: string): string {
  const baseDir = path.resolve(os.tmpdir());
  const cleanName = path.basename(fileNameOrRel);
  const resolved = path.resolve(baseDir, cleanName);
  if (!resolved.startsWith(baseDir + path.sep)) {
    throw new Error('Invalid temporary file path.');
  }
  return resolved;
}

export function getProgressFilePath(jobId: string): string {
  const safe = sanitizeJobId(jobId) || 'default';
  return resolveConfinedTmpPath(`metacleaner_progress_${safe}.json`);
}

export function getResultFilePath(jobId: string): string {
  const safe = sanitizeJobId(jobId) || 'default';
  return resolveConfinedTmpPath(`metacleaner_result_${safe}.mp4`);
}

export function getUploadMetaPath(uploadId: string): string {
  const safe = sanitizeJobId(uploadId) || 'default';
  return resolveConfinedTmpPath(`metacleaner_upload_meta_${safe}.json`);
}

export function getUploadFilePath(uploadId: string, ext = 'mp4'): string {
  const safe = sanitizeJobId(uploadId) || 'default';
  const safeExt = sanitizeVideoExtension(ext);
  return resolveConfinedTmpPath(`metacleaner_upload_${safe}.${safeExt}`);
}

export function getUploadChunkDir(uploadId: string): string {
  const safe = sanitizeJobId(uploadId) || 'default';
  return resolveConfinedTmpPath(`metacleaner_chunks_${safe}`);
}

export async function writeUploadMeta(meta: UploadedVideoMeta): Promise<void> {
  const safeId = sanitizeJobId(meta.uploadId);
  if (!safeId) return;
  const metaPath = getUploadMetaPath(safeId);
  const tmpPath = `${metaPath}.tmp.${process.pid}.${Date.now()}`;
  const payload = JSON.stringify({ ...meta, uploadId: safeId });
  try {
    await fs.writeFile(tmpPath, payload, 'utf8');
    await fs.rename(tmpPath, metaPath);
  } catch {
    try {
      await fs.unlink(tmpPath);
    } catch {}
  }
}

export async function findUploadedFile(uploadId: string): Promise<UploadedVideoMeta | null> {
  const safeId = sanitizeJobId(uploadId);
  if (!safeId) return null;
  const metaPath = getUploadMetaPath(safeId);
  try {
    const raw = await fs.readFile(metaPath, 'utf8');
    const parsed = JSON.parse(raw) as UploadedVideoMeta;
    const expectedPath = getUploadFilePath(safeId, parsed.ext || 'mp4');
    const expMs = Date.parse(parsed.expiresAt || '');
    if (Number.isFinite(expMs) && Date.now() >= expMs) {
      await cleanupUploadArtifacts(safeId);
      return null;
    }
    const stat = await fs.stat(expectedPath).catch(() => null);
    if (!stat || !stat.isFile() || stat.size < 256) {
      return null;
    }
    return {
      ...parsed,
      uploadId: safeId,
      filePath: expectedPath,
      sizeBytes: stat.size,
    };
  } catch {
    return null;
  }
}

export async function setUploadAutoCleanDeadline(
  uploadId: string,
  ttlMs: number = META_CLEANER_AUTO_CLEAN_MS
): Promise<string | null> {
  const safeId = sanitizeJobId(uploadId);
  if (!safeId) return null;
  const metaPath = getUploadMetaPath(safeId);
  try {
    const raw = await fs.readFile(metaPath, 'utf8');
    const parsed = JSON.parse(raw) as UploadedVideoMeta;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
    await writeUploadMeta({
      ...parsed,
      completedAt: now.toISOString(),
      expiresAt,
    });
    return expiresAt;
  } catch {
    return null;
  }
}

export async function cleanupUploadArtifacts(uploadId: string): Promise<void> {
  const safeId = sanitizeJobId(uploadId);
  if (!safeId) return;

  const metaPath = getUploadMetaPath(safeId);
  try {
    if (fsSync.existsSync(metaPath)) {
      const raw = await fs.readFile(metaPath, 'utf8').catch(() => '');
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<UploadedVideoMeta>;
          if (parsed.ext) {
            await fs.unlink(getUploadFilePath(safeId, parsed.ext)).catch(() => {});
          }
        } catch {}
      }
      await fs.unlink(metaPath).catch(() => {});
    }
  } catch {}

  for (const ext of ALLOWED_VIDEO_EXTENSIONS) {
    await fs.unlink(getUploadFilePath(safeId, ext)).catch(() => {});
  }

  const chunkDir = getUploadChunkDir(safeId);
  await fs.rm(chunkDir, { recursive: true, force: true }).catch(() => {});
}

export async function cleanupJobArtifacts(
  jobId: string,
  opts?: { removeProgress?: boolean; reasonMessage?: string }
): Promise<void> {
  const safeId = sanitizeJobId(jobId);
  if (!safeId) return;

  const resultPath = getResultFilePath(safeId);
  await fs.unlink(resultPath).catch(() => {});

  const existing = await readProgressSafe(safeId);
  if (existing?.uploadId) {
    await cleanupUploadArtifacts(existing.uploadId);
  }

  const progressPath = getProgressFilePath(safeId);
  if (opts?.removeProgress) {
    await fs.unlink(progressPath).catch(() => {});
    return;
  }

  if (existing) {
    await writeProgressAtomic({
      ...existing,
      resultReady: false,
      expired: true,
      cleanedUpAt: existing.cleanedUpAt || new Date().toISOString(),
      message:
        opts?.reasonMessage ||
        'Auto-Clean 5 Menit: File video input & output telah dihapus otomatis dari server.',
    });
  }
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

let lastSweepAt = 0;

export async function sweepExpiredMetaCleanerFiles(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastSweepAt < 15000) return;
  lastSweepAt = now;

  const tmpDir = path.resolve(os.tmpdir());
  try {
    const entries = await fs.readdir(tmpDir, { withFileTypes: true });
    for (const entry of entries) {
      const name = entry.name;
      if (!name.startsWith('metacleaner_')) continue;
      const fullPath = resolveConfinedTmpPath(name);
      const stat = await fs.stat(fullPath).catch(() => null);
      if (!stat) continue;

      if (name.startsWith('metacleaner_result_') && name.endsWith('.mp4')) {
        const jobId = sanitizeJobId(
          name.slice('metacleaner_result_'.length, -'.mp4'.length)
        );
        const progress = jobId ? await readProgressSafe(jobId) : null;
        const expiresMs = progress?.expiresAt ? Date.parse(progress.expiresAt) : NaN;
        const isExpired = Number.isFinite(expiresMs)
          ? now >= expiresMs
          : now - stat.mtimeMs >= META_CLEANER_AUTO_CLEAN_MS;
        if (isExpired && jobId) {
          await cleanupJobArtifacts(jobId);
        }
      } else if (name.startsWith('metacleaner_upload_meta_') && name.endsWith('.json')) {
        const uploadId = sanitizeJobId(
          name.slice('metacleaner_upload_meta_'.length, -'.json'.length)
        );
        const raw = await fs.readFile(fullPath, 'utf8').catch(() => '');
        let expiresMs = NaN;
        if (raw) {
          try {
            const meta = JSON.parse(raw) as Partial<UploadedVideoMeta>;
            expiresMs = meta.expiresAt ? Date.parse(meta.expiresAt) : NaN;
          } catch {}
        }
        const isExpired = Number.isFinite(expiresMs)
          ? now >= expiresMs
          : now - stat.mtimeMs >= META_CLEANER_UPLOAD_IDLE_MS;
        if (isExpired && uploadId) {
          await cleanupUploadArtifacts(uploadId);
        }
      } else if (name.startsWith('metacleaner_chunks_') && entry.isDirectory()) {
        if (now - stat.mtimeMs >= META_CLEANER_UPLOAD_IDLE_MS) {
          await fs.rm(fullPath, { recursive: true, force: true }).catch(() => {});
        }
      } else if (name.startsWith('metacleaner_upload_') && !name.includes('_meta_')) {
        if (now - stat.mtimeMs >= META_CLEANER_UPLOAD_IDLE_MS) {
          await fs.unlink(fullPath).catch(() => {});
        }
      } else if (name.startsWith('metacleaner_progress_') && name.endsWith('.json')) {
        const raw = await fs.readFile(fullPath, 'utf8').catch(() => '');
        let removeFile = now - stat.mtimeMs >= META_CLEANER_UPLOAD_IDLE_MS;
        if (raw && !removeFile) {
          try {
            const p = JSON.parse(raw) as Partial<CleanerProgressState>;
            if (p.cleanedUpAt) {
              const cleanedMs = Date.parse(p.cleanedUpAt);
              if (Number.isFinite(cleanedMs) && now - cleanedMs >= 3 * 60 * 1000) {
                removeFile = true;
              }
            }
          } catch {}
        }
        if (removeFile) {
          await fs.unlink(fullPath).catch(() => {});
        }
      } else if (
        (name.startsWith('metacleaner_in_') ||
          name.startsWith('metacleaner_pass1_') ||
          name.startsWith('metacleaner_out_') ||
          name.startsWith('metacleaner_probe_')) &&
        now - stat.mtimeMs >= META_CLEANER_UPLOAD_IDLE_MS
      ) {
        await fs.unlink(fullPath).catch(() => {});
      }
    }
  } catch {}
}
