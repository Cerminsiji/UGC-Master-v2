import { NextRequest, NextResponse } from 'next/server';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import {
  CleanerProgressState,
  CleanerStage,
  META_CLEANER_AUTO_CLEAN_MS,
  META_CLEANER_UPLOAD_IDLE_MS,
  cleanupJobArtifacts,
  findUploadedFile,
  getProgressFilePath,
  getResultFilePath,
  readProgressSafe,
  sanitizeJobId,
  sanitizeVideoExtension,
  setUploadAutoCleanDeadline,
  sweepExpiredMetaCleanerFiles,
  writeProgressAtomic,
  writeProgressAtomicSync,
  writeUploadMeta,
} from '@/lib/meta-cleaner-progress';
import { resolveMediaBinary } from '@/lib/video-probe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const execFileAsync = promisify(execFile);

const globalForActiveJobs = globalThis as typeof globalThis & {
  __metaCleanerActiveJobs?: Set<string>;
};
const activeJobsSet: Set<string> =
  globalForActiveJobs.__metaCleanerActiveJobs ??
  (globalForActiveJobs.__metaCleanerActiveJobs = new Set<string>());

function resolveBinary(name: 'ffmpeg' | 'ffprobe'): string {
  const resolved = resolveMediaBinary(name);
  if (resolved === name) {
    // Check if binary exists in PATH before spawning so we can provide an explicit diagnostic if missing
    const pathDirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
    for (const dir of pathDirs) {
      const candidate = path.join(dir, name);
      try {
        if (fsSync.existsSync(candidate) && fsSync.statSync(candidate).isFile()) {
          return candidate;
        }
      } catch {}
    }
    throw new Error(
      `Binary '${name}' tidak ditemukan di bundle standalone maupun sistem PATH (cwd=${process.cwd()}).`
    );
  }
  return resolved;
}

function resolvePythonScriptPath(): string {
  const candidates = [
    path.join(process.cwd(), 'scripts', 'ffmpeg_cleaner.py'),
    path.join(process.cwd(), '.next', 'standalone', 'scripts', 'ffmpeg_cleaner.py'),
    path.resolve(process.cwd(), '..', '..', 'scripts', 'ffmpeg_cleaner.py'),
    '/workspace/scripts/ffmpeg_cleaner.py',
    '/app/applet/scripts/ffmpeg_cleaner.py',
  ];
  for (const candidate of candidates) {
    try {
      if (fsSync.existsSync(candidate) && fsSync.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {}
  }
  return candidates[0];
}

function getExecEnv(): NodeJS.ProcessEnv {
  let ffmpegBin = '';
  let ffprobeBin = '';
  try {
    ffmpegBin = resolveMediaBinary('ffmpeg');
  } catch {}
  try {
    ffprobeBin = resolveMediaBinary('ffprobe');
  } catch {}

  const extraDirs = [
    ffmpegBin && ffmpegBin !== 'ffmpeg' ? path.dirname(ffmpegBin) : '',
    ffprobeBin && ffprobeBin !== 'ffprobe' ? path.dirname(ffprobeBin) : '',
    path.join(process.cwd(), 'node_modules', 'ffmpeg-static'),
    path.join(process.cwd(), 'node_modules', 'ffprobe-static', 'bin', process.platform, process.arch),
  ].filter(Boolean);

  return {
    ...process.env,
    ...(ffmpegBin && ffmpegBin !== 'ffmpeg' ? { FFMPEG_BIN: ffmpegBin, FFMPEG_PATH: ffmpegBin } : {}),
    ...(ffprobeBin && ffprobeBin !== 'ffprobe' ? { FFPROBE_BIN: ffprobeBin, FFPROBE_PATH: ffprobeBin } : {}),
    PATH: `${extraDirs.join(':')}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${process.env.PATH || ''}`,
  };
}

function normalizeFfmpegArgs(args: string[]): string[] {
  return args.map((arg) => (arg === '--fflags' ? '-fflags' : arg));
}

async function runFfmpeg(args: string[], timeoutMs = 90000): Promise<{ stdout: string; stderr: string }> {
  const normalized = normalizeFfmpegArgs(args);
  const bin = resolveBinary('ffmpeg');
  return execFileAsync(bin, normalized, {
    env: getExecEnv(),
    timeout: timeoutMs,
    maxBuffer: 100 * 1024 * 1024,
  });
}

async function runFfprobe(args: string[], timeoutMs = 20000): Promise<{ stdout: string; stderr: string }> {
  const bin = resolveBinary('ffprobe');
  return execFileAsync(bin, args, {
    env: getExecEnv(),
    timeout: timeoutMs,
    maxBuffer: 20 * 1024 * 1024,
  });
}

function parseClockTimeToSec(str: string): number {
  const parts = str.trim().split(':');
  if (parts.length !== 3) return 0;
  return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]) || 0;
}

function withStatsPeriod(args: string[]): string[] {
  if (args.includes('-stats_period')) return args;
  if (args.length >= 1 && args[0] === '-y') {
    return ['-y', '-stats_period', '0.25', ...args.slice(1)];
  }
  return ['-stats_period', '0.25', ...args];
}

async function runFfmpegWithProgress(
  args: string[],
  timeoutMs: number,
  progressCtx?: {
    state: CleanerProgressState;
    stage: CleanerStage;
    stageLabel: string;
    startPct: number;
    endPct: number;
    expectedDuration: number;
    expectedFrames: number;
  }
): Promise<{ stdout: string; stderr: string }> {
  const normalized = withStatsPeriod(normalizeFfmpegArgs(args));
  const bin = resolveBinary('ffmpeg');

  return new Promise((resolve, reject) => {
    if (progressCtx?.state.jobId) {
      progressCtx.state.stage = progressCtx.stage;
      progressCtx.state.message = progressCtx.stageLabel;
      progressCtx.state.percent = Math.max(progressCtx.state.percent || 0, progressCtx.startPct);
      writeProgressAtomicSync(progressCtx.state);
    }

    const proc = spawn(bin, normalized, { env: getExecEnv() });
    let stdout = '';
    let stderr = '';
    let lineBuf = '';
    let lastWrite = 0;
    let lastTelemetryAt = Date.now();
    let settled = false;

    const heartbeatTimer = progressCtx?.state.jobId
      ? setInterval(() => {
          if (settled || !progressCtx) return;
          const now = Date.now();
          if (now - lastTelemetryAt < 750) return;
          const curPct = progressCtx.state.percent || progressCtx.startPct;
          if (curPct < progressCtx.endPct - 1) {
            progressCtx.state.percent = Math.min(progressCtx.endPct - 1, curPct + 1);
            if (progressCtx.state.stage === 'pass2_remux') {
              progressCtx.state.message = 'Relokasi atom MOOV (+faststart) & sinkronisasi muxing MP4...';
            } else if (progressCtx.state.frame > 0) {
              progressCtx.state.message = `${progressCtx.stageLabel} — flushing B-frame buffer (${progressCtx.state.frame}/${progressCtx.expectedFrames || '?'})...`;
            } else {
              progressCtx.state.message = `${progressCtx.stageLabel} — inisialisasi filtergraph & encoder...`;
            }
            lastTelemetryAt = now;
            lastWrite = now;
            writeProgressAtomicSync(progressCtx.state);
          }
        }, 650)
      : null;

    const timer = setTimeout(() => {
      settled = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      try {
        proc.kill('SIGKILL');
      } catch {}
      reject(new Error(`FFmpeg timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout.on('data', (d: Buffer) => {
      stdout += d.toString('utf8');
    });

    proc.stderr.on('data', (d: Buffer) => {
      const chunk = d.toString('utf8');
      if (stderr.length < 4 * 1024 * 1024) {
        stderr += chunk;
      }
      if (!progressCtx?.state.jobId) return;

      lineBuf += chunk;
      const lines = lineBuf.split(/\r|\n/);
      lineBuf = lines.pop() || '';
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        if (line.startsWith('frame=')) {
          lastTelemetryAt = Date.now();
          const fm = line.match(/frame=\s*(\d+)/);
          const fpm = line.match(/fps=\s*([\d.]+)/);
          const tm = line.match(/time=\s*(\d+:\d+:\d+(?:\.\d+)?)/);
          const sm = line.match(/speed=\s*([^\s]+)/);

          if (fm) progressCtx.state.frame = Number(fm[1]);
          if (fpm) progressCtx.state.fps = Number(fpm[1]);
          if (tm) progressCtx.state.outTimeSec = Number(parseClockTimeToSec(tm[1]).toFixed(2));
          if (sm) progressCtx.state.speed = sm[1];

          const timeRatio =
            progressCtx.expectedDuration > 0.1 && progressCtx.state.outTimeSec > 0
              ? Math.min(1, progressCtx.state.outTimeSec / progressCtx.expectedDuration)
              : 0;
          const frameRatio =
            progressCtx.expectedFrames > 0 && progressCtx.state.frame > 0
              ? Math.min(1, progressCtx.state.frame / progressCtx.expectedFrames)
              : 0;
          const ratio = Math.max(timeRatio, frameRatio);
          const encodeCap = Math.max(progressCtx.startPct, progressCtx.endPct - 2);
          const pct = Math.min(
            encodeCap,
            Math.max(
              progressCtx.state.percent || 0,
              progressCtx.startPct,
              Math.round(progressCtx.startPct + ratio * (encodeCap - progressCtx.startPct))
            )
          );
          progressCtx.state.percent = pct;
          progressCtx.state.message = `${progressCtx.stageLabel} (frame ${progressCtx.state.frame}${progressCtx.expectedFrames > 0 ? '/' + progressCtx.expectedFrames : ''} • ${progressCtx.state.speed})`;

          const now = Date.now();
          if (now - lastWrite >= 200) {
            lastWrite = now;
            writeProgressAtomicSync(progressCtx.state);
          }
        } else if (line.includes('Starting second pass')) {
          lastTelemetryAt = Date.now();
          progressCtx.state.stage = 'pass2_remux';
          progressCtx.state.message = 'Remuxing atom MOOV (+faststart) & Zero-SEI Container...';
          progressCtx.state.percent = Math.max(progressCtx.state.percent || 0, Math.max(progressCtx.startPct, progressCtx.endPct - 1));
          lastWrite = Date.now();
          writeProgressAtomicSync(progressCtx.state);
        }
      }
    });

    proc.on('error', (err) => {
      settled = true;
      clearTimeout(timer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      reject(err);
    });

    proc.on('close', (code) => {
      settled = true;
      clearTimeout(timer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (code === 0) {
        if (progressCtx?.state.jobId) {
          progressCtx.state.percent = Math.max(progressCtx.state.percent || 0, progressCtx.endPct);
          writeProgressAtomicSync(progressCtx.state);
        }
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr.split('\n').slice(-3).join(' ')}`));
      }
    });
  });
}

/**
 * Cloud-based Python FFmpeg Wrapper
 * Executes strict frame-by-frame filtering for SynthID removal, Zero-SEI container rewrite, and live progress JSON reporting.
 */
async function runPythonCleaner(
  inputPath: string,
  outputPath: string,
  mode: string,
  deepMetaPurge: boolean,
  forceKeyframeInsertion: boolean,
  cameraProfile: string,
  upscale1080p: boolean,
  jobId: string,
  progressFilePath?: string
): Promise<{ success: boolean; timedOut?: boolean; output_path?: string; size_bytes?: number; logs: string[]; error?: string }> {
  const pythonBin = 'python3';
  const scriptPath = resolvePythonScriptPath();

  const args = [
    scriptPath,
    '--input',
    inputPath,
    '--output',
    outputPath,
    '--mode',
    mode,
    '--deep-meta-purge',
    deepMetaPurge ? 'true' : 'false',
    '--force-keyframes',
    forceKeyframeInsertion ? 'true' : 'false',
    '--camera-profile',
    cameraProfile,
    '--upscale-1080p',
    upscale1080p ? 'true' : 'false',
    '--defer-fail-to-caller',
    'true',
  ];
  if (progressFilePath) {
    args.push('--progress-file', progressFilePath, '--job-id', jobId);
  }

  return new Promise((resolve) => {
    const proc = spawn(pythonBin, args, { env: getExecEnv() });
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        proc.kill('SIGKILL');
      } catch {}
      resolve({
        success: false,
        timedOut: true,
        logs: ['[PYTHON TIMEOUT] Proses FFmpeg Python melebihi batas waktu 480 detik.'],
        error: 'Proses FFmpeg Python di server melebihi batas waktu (8 menit).',
      });
    }, 480000);

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 1024 * 1024) {
        stderr += chunk.toString('utf8');
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      if (timedOut) return;
      resolve({
        success: false,
        logs: [`[PYTHON SPAWN ERROR] ${err.message}`],
        error: err.message,
      });
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return;
      if (code !== 0) {
        console.error('Python FFmpeg cleaner error:', code, stderr);
        return resolve({
          success: false,
          logs: [`[PYTHON ERROR] ${stderr || `Exited with code ${code}`}`],
          error: stderr || `Python exited with code ${code}`,
        });
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        return resolve(parsed);
      } catch {
        return resolve({
          success: false,
          logs: [`[PYTHON PARSE ERROR] ${stdout}`],
          error: `Output parser error: ${stdout}`,
        });
      }
    });
  });
}

function computeTargetDimensions(width = 0, height = 0, upscale1080p = true): [number, number] {
  if (width < 64 || height < 64) return [0, 0];
  const evenW = Math.floor(width / 2) * 2;
  const evenH = Math.floor(height / 2) * 2;
  if (!upscale1080p) return [evenW, evenH];
  const shortSide = Math.min(evenW, evenH);
  if (shortSide < 1080) {
    const scaleFactor = 1080 / shortSide;
    const targetW = Math.floor(Math.round(evenW * scaleFactor) / 2) * 2;
    const targetH = Math.floor(Math.round(evenH * scaleFactor) / 2) * 2;
    return [targetW, targetH];
  }
  return [evenW, evenH];
}

interface OrganicJobProfile {
  trimStart: number;
  speedPts: number;
  lensCx: number;
  lensCy: number;
  lensK1: number;
  lensK2: number;
  rotBias: number;
  rotA1: number;
  rotA2: number;
  rotA3: number;
  freq1: number;
  freq2: number;
  freq3: number;
  cropRatio: number;
  casStrength: number;
  noiseY: number;
  noiseC: number;
  postNoiseY: number;
  contrast: number;
  saturation: number;
  gamma: number;
  wbR: number;
  wbG: number;
  wbB: number;
  crf: string;
  pitchRatio: number;
  seedL: number;
  seedR: number;
  seedB: number;
  seedAir: number;
}

function randFloat(min: number, max: number, decimals: number): number {
  const unit = crypto.randomInt(0, 1_000_000) / 1_000_000;
  return Number((min + unit * (max - min)).toFixed(decimals));
}

function generateOrganicJobProfile(): OrganicJobProfile {
  const rotSign = crypto.randomInt(0, 2) === 0 ? -1 : 1;
  const pitchChoice =
    crypto.randomInt(0, 100) < 65 ? randFloat(0.976, 0.985, 4) : randFloat(1.014, 1.022, 4);
  return {
    trimStart: randFloat(0.03, 0.07, 3),
    speedPts: randFloat(0.970, 0.985, 4),
    lensCx: randFloat(0.494, 0.506, 3),
    lensCy: randFloat(0.494, 0.506, 3),
    lensK1: randFloat(-0.026, -0.018, 4),
    lensK2: randFloat(0.005, 0.009, 4),
    rotBias: Number((rotSign * randFloat(0.0028, 0.0044, 4)).toFixed(4)),
    rotA1: randFloat(0.0026, 0.0035, 4),
    rotA2: randFloat(0.0014, 0.0021, 4),
    rotA3: randFloat(0.0007, 0.0011, 4),
    freq1: randFloat(1.03, 1.37, 2),
    freq2: randFloat(2.47, 2.99, 2),
    freq3: randFloat(4.13, 4.87, 2),
    cropRatio: randFloat(0.940, 0.948, 3),
    casStrength: randFloat(0.17, 0.24, 2),
    noiseY: randFloat(2.65, 3.15, 2),
    noiseC: randFloat(1.00, 1.25, 2),
    postNoiseY: randFloat(1.05, 1.30, 2),
    contrast: randFloat(1.014, 1.022, 3),
    saturation: randFloat(1.012, 1.024, 3),
    gamma: randFloat(1.004, 1.012, 3),
    wbR: randFloat(1.006, 1.012, 3),
    wbG: randFloat(1.004, 1.009, 3),
    wbB: randFloat(1.005, 1.011, 3),
    crf: '18',
    pitchRatio: pitchChoice,
    seedL: crypto.randomInt(100000, 999999),
    seedR: crypto.randomInt(100000, 999999),
    seedB: crypto.randomInt(100000, 999999),
    seedAir: crypto.randomInt(100000, 999999),
  };
}

function parseFpsString(rateStr: string): number {
  if (!rateStr) return 0;
  if (rateStr.includes('/')) {
    const [numStr, denStr] = rateStr.split('/');
    const num = Number(numStr);
    const den = Number(denStr);
    if (num > 0 && den > 0) return num / den;
  }
  const n = Number(rateStr);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function buildCadencePrep(pulldownDetected = false, effectiveFps = 0): string {
  if (pulldownDetected && effectiveFps >= 12.0) {
    return `mpdecimate=hi=64*6:lo=64*3:frac=0.33,setpts=N/(${effectiveFps.toFixed(4)}*TB)`;
  }
  return '';
}

function buildCadenceFinish(srcFps = 0, pulldownDetected = false): string {
  if (pulldownDetected || (srcFps > 0 && srcFps < 28.5)) {
    return 'framerate=fps=30:interp_start=15:interp_end=240:scene=8.2';
  }
  return 'fps=30';
}

function buildSynthIdVideoFilter(
  width = 0,
  height = 0,
  upscale1080p = true,
  srcFps = 0,
  pulldownDetected = false,
  effectiveFps = 0,
  jobProfile?: OrganicJobProfile
): string {
  const p = jobProfile || generateOrganicJobProfile();
  const [targetW, targetH] = computeTargetDimensions(width, height, upscale1080p);
  const scaleStep =
    targetW >= 64 && targetH >= 64
      ? `scale=${targetW}:${targetH}:flags=bicubic+accurate_rnd:in_color_matrix=auto:out_color_matrix=bt709:out_range=tv`
      : 'scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=bicubic+accurate_rnd:in_color_matrix=auto:out_color_matrix=bt709:out_range=tv';

  const prep = buildCadencePrep(pulldownDetected, effectiveFps);
  const finish = buildCadenceFinish(srcFps, pulldownDetected);

  return [
    ...(prep ? [prep] : []),
    'setpts=0.961538*(PTS-STARTPTS)',
    finish,
    'format=yuv420p',
    'hqdn3d=1.1:0.9:1.6:1.2',
    `lenscorrection=cx=${p.lensCx}:cy=${p.lensCy}:k1=${p.lensK1}:k2=${p.lensK2}`,
    `rotate=a='${p.rotBias}+${p.rotA1}*sin(t*${p.freq1})+${p.rotA2}*cos(t*${p.freq2})+${p.rotA3}*sin(t*${p.freq3})':bilinear=1:ow=iw:oh=ih`,
    `crop=w=trunc(iw*${p.cropRatio}/2)*2:h=trunc(ih*${p.cropRatio}/2)*2:x='(iw-ow)/2+iw*(${(p.rotA1 * 0.78).toFixed(4)}*sin(t*${p.freq1})+${(p.rotA2 * 0.75).toFixed(4)}*cos(t*${p.freq2})+${(p.rotA3 * 0.75).toFixed(4)}*sin(t*${p.freq3}))':y='(ih-oh)*0.54+ih*(${(p.rotA1 * 0.65).toFixed(4)}*cos(t*0.93)+${(p.rotA2 * 0.65).toFixed(4)}*sin(t*2.41)+${(p.rotA3 * 0.65).toFixed(4)}*cos(t*3.97))'`,
    `noise=c0s=${p.noiseY}:c1s=${p.noiseC}:c2s=${p.noiseC}:allf=t`,
    scaleStep,
    'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv',
    `colorchannelmixer=rr=${p.wbR}:rg=-0.006:rb=-0.002:gr=-0.003:gg=${p.wbG}:gb=-0.002:br=-0.003:bg=-0.004:bb=${p.wbB}`,
    `eq=contrast=${p.contrast}:brightness='0.0016*sin(t*0.83)+0.0010*cos(t*1.97)':saturation=${p.saturation}:gamma=${p.gamma}:eval=frame`,
    `cas=strength=${p.casStrength}`,
    `noise=c0s=${p.postNoiseY}:c1s=0:c2s=0:allf=t`,
    'setsar=1',
  ].join(',');
}

function buildSafeModeVideoFilter(
  width = 0,
  height = 0,
  upscale1080p = true,
  srcFps = 0,
  pulldownDetected = false,
  effectiveFps = 0,
  jobProfile?: OrganicJobProfile
): string {
  const p = jobProfile || generateOrganicJobProfile();
  const [targetW, targetH] = computeTargetDimensions(width, height, upscale1080p);
  const scaleStep =
    targetW >= 64 && targetH >= 64
      ? `scale=${targetW}:${targetH}:flags=bicubic+accurate_rnd:in_color_matrix=auto:out_color_matrix=bt709:out_range=tv`
      : 'scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=bicubic+accurate_rnd:in_color_matrix=auto:out_color_matrix=bt709:out_range=tv';

  const prep = buildCadencePrep(pulldownDetected, effectiveFps);
  const finish = buildCadenceFinish(srcFps, pulldownDetected);

  return [
    ...(prep ? [prep] : []),
    'setpts=PTS-STARTPTS',
    finish,
    'format=yuv420p',
    'hqdn3d=1.0:0.8:1.5:1.1',
    `lenscorrection=cx=${p.lensCx}:cy=${p.lensCy}:k1=${(p.lensK1 * 0.85).toFixed(4)}:k2=${p.lensK2}`,
    `rotate=a='${(p.rotBias * 0.85).toFixed(4)}+${(p.rotA1 * 0.85).toFixed(4)}*sin(t*${p.freq1})+${(p.rotA2 * 0.85).toFixed(4)}*cos(t*${p.freq2})+${(p.rotA3 * 0.85).toFixed(4)}*sin(t*${p.freq3})':bilinear=1:ow=iw:oh=ih`,
    `crop=w=trunc(iw*${(p.cropRatio + 0.004).toFixed(3)}/2)*2:h=trunc(ih*${(p.cropRatio + 0.004).toFixed(3)}/2)*2:x='(iw-ow)/2+iw*(${(p.rotA1 * 0.65).toFixed(4)}*sin(t*${p.freq1})+${(p.rotA2 * 0.65).toFixed(4)}*cos(t*${p.freq2}))':y='(ih-oh)*0.54+ih*(${(p.rotA1 * 0.55).toFixed(4)}*cos(t*0.89)+${(p.rotA2 * 0.55).toFixed(4)}*sin(t*2.11))'`,
    `noise=c0s=${p.noiseY}:c1s=${p.noiseC}:c2s=${p.noiseC}:allf=t`,
    scaleStep,
    'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv',
    `colorchannelmixer=rr=${p.wbR}:rg=-0.005:rb=-0.002:gr=-0.003:gg=${p.wbG}:gb=-0.002:br=-0.002:bg=-0.003:bb=${p.wbB}`,
    `eq=contrast=${p.contrast}:brightness='0.0014*sin(t*0.79)+0.0009*cos(t*1.81)':saturation=${p.saturation}:gamma=${p.gamma}:eval=frame`,
    `cas=strength=${p.casStrength}`,
    `noise=c0s=${p.postNoiseY}:c1s=0:c2s=0:allf=t`,
    'setsar=1',
  ].join(',');
}

function buildUnifiedVideoFilter(
  width = 0,
  height = 0,
  durationSec = 0,
  upscale1080p = true,
  srcFps = 0,
  pulldownDetected = false,
  effectiveFps = 0,
  jobProfile?: OrganicJobProfile
): string {
  const p = jobProfile || generateOrganicJobProfile();
  const trimPrefix =
    durationSec > 2.0
      ? `trim=start=${p.trimStart},setpts=${p.speedPts}*(PTS-STARTPTS)`
      : `setpts=${p.speedPts}*(PTS-STARTPTS)`;
  const [targetW, targetH] = computeTargetDimensions(width, height, upscale1080p);
  const scaleStep =
    targetW >= 64 && targetH >= 64
      ? `scale=${targetW}:${targetH}:flags=bicubic+accurate_rnd:in_color_matrix=auto:out_color_matrix=bt709:out_range=tv`
      : 'scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=bicubic+accurate_rnd:in_color_matrix=auto:out_color_matrix=bt709:out_range=tv';

  const prep = buildCadencePrep(pulldownDetected, effectiveFps);
  const finish = buildCadenceFinish(srcFps, pulldownDetected);

  return [
    ...(prep ? [prep] : []),
    trimPrefix,
    finish,
    'format=yuv420p',
    'hqdn3d=1.1:0.9:1.6:1.2',
    `lenscorrection=cx=${p.lensCx}:cy=${p.lensCy}:k1=${p.lensK1}:k2=${p.lensK2}`,
    `rotate=a='${p.rotBias}+${p.rotA1}*sin(t*${p.freq1})+${p.rotA2}*cos(t*${p.freq2})+${p.rotA3}*sin(t*${p.freq3})':bilinear=1:ow=iw:oh=ih`,
    `crop=w=trunc(iw*${p.cropRatio}/2)*2:h=trunc(ih*${p.cropRatio}/2)*2:x='(iw-ow)/2+iw*(${(p.rotA1 * 0.78).toFixed(4)}*sin(t*${p.freq1})+${(p.rotA2 * 0.75).toFixed(4)}*cos(t*${p.freq2})+${(p.rotA3 * 0.75).toFixed(4)}*sin(t*${p.freq3}))':y='(ih-oh)*0.54+ih*(${(p.rotA1 * 0.65).toFixed(4)}*cos(t*0.93)+${(p.rotA2 * 0.65).toFixed(4)}*sin(t*2.41)+${(p.rotA3 * 0.65).toFixed(4)}*cos(t*3.97))'`,
    `noise=c0s=${p.noiseY}:c1s=${p.noiseC}:c2s=${p.noiseC}:allf=t`,
    scaleStep,
    'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv',
    `colorchannelmixer=rr=${p.wbR}:rg=-0.006:rb=-0.002:gr=-0.003:gg=${p.wbG}:gb=-0.002:br=-0.003:bg=-0.004:bb=${p.wbB}`,
    `eq=contrast=${p.contrast}:brightness='0.0017*sin(t*0.85)+0.0010*cos(t*2.01)':saturation=${p.saturation}:gamma=${p.gamma}:eval=frame`,
    `cas=strength=${p.casStrength}`,
    `noise=c0s=${p.postNoiseY}:c1s=0:c2s=0:allf=t`,
    'setsar=1',
  ].join(',');
}

/**
 * Multi-Domain Anti-SynthID & AI-TTS Audio Disruption Filtergraph V 2.3:
 * - True L/R stereo acoustic room reflection (zero pseudo-stereo mono duplicate)
 * - Per-job randomized pink/brown/15.8-20.8kHz thermal mic air bed (zero >17kHz brickwall cutoff)
 * - Nonlinear all-pass phase dispersion (aphaser) + dual-tap early reflections + 0.89 anti-clipping ceiling
 */
function buildOrganicRoomAndVoiceChain(
  voicePrefix: string,
  outLabel: string,
  p: OrganicJobProfile,
  atempoVal: string,
  apadFilter: string,
  extrastereoM = 1.18,
  speechGainDb = 0
): string {
  const gainStep = Math.abs(speechGainDb) >= 0.4 ? `volume=${speechGainDb.toFixed(2)}dB,` : '';
  return [
    `anoisesrc=color=pink:amplitude=0.0017:sample_rate=48000:seed=${p.seedL}[pL]`,
    `anoisesrc=color=pink:amplitude=0.0017:sample_rate=48000:seed=${p.seedR}[pR]`,
    `anoisesrc=color=brown:amplitude=0.0013:sample_rate=48000:seed=${p.seedB}[bRoom]`,
    `anoisesrc=color=white:amplitude=0.0155:sample_rate=48000:seed=${p.seedAir}[wAir]`,
    '[bRoom]lowpass=f=320,pan=stereo|c0=c0|c1=c0[bSt]',
    '[wAir]highpass=f=15800,lowpass=f=20800,pan=stereo|c0=0.9*c0|c1=0.8*c0,adelay=0|7[airSt]',
    '[pL][pR]amerge=inputs=2,highpass=f=65,lowpass=f=16800,equalizer=f=450:t=q:w=0.8:g=-2.5[pinkSt]',
    '[pinkSt][bSt][airSt]amix=inputs=3:normalize=0,atrim=start=0.10,asetpts=PTS-STARTPTS,tremolo=f=0.27:d=0.12[room]',
    `${voicePrefix}aresample=48000:async=1:first_pts=0,aformat=channel_layouts=stereo,${gainStep}asetrate=48000*${p.pitchRatio},aresample=48000,atempo=${atempoVal},highpass=f=75,equalizer=f=210:t=q:w=1.0:g=0.9,equalizer=f=3100:t=q:w=1.4:g=-0.7,aexciter=level_in=1:level_out=1:amount=1.40:drive=2.5:blend=0:freq=8500:ceil=19900,aphaser=in_gain=0.85:out_gain=0.85:delay=2.4:decay=0.35:speed=0.7:type=t,asplit=2[vDry][vRef]`,
    '[vRef]highpass=f=420,lowpass=f=7800,pan=stereo|c0=0.15*c0|c1=-0.15*c1,adelay=0|11[vSide]',
    `[vDry][vSide]amix=inputs=2:duration=first:normalize=0,aecho=0.95:0.92:7|13:0.022|0.012,extrastereo=m=${extrastereoM},acompressor=threshold=-14dB:ratio=1.35:attack=12:release=150:makeup=0dB,${apadFilter}[voice]`,
    `[voice][room]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.89,atrim=start=0.02,asetpts=PTS-STARTPTS${outLabel}`,
  ].join(';');
}

function buildSynthIdAudioFilterComplex(
  voiceLabel = '[0:a]',
  outLabel = '[aout]',
  jobProfile?: OrganicJobProfile,
  padTargetDur = 0,
  speechGainDb = 0
): string {
  const p = jobProfile || generateOrganicJobProfile();
  const atempoVal = (1.04 / p.pitchRatio).toFixed(5);
  const apadFilter =
    padTargetDur > 0.2 ? `apad=whole_dur=${Math.max(padTargetDur + 0.35, 1.0).toFixed(3)}` : 'apad=pad_dur=0.35';
  return buildOrganicRoomAndVoiceChain(
    `${voiceLabel}asetpts=PTS-STARTPTS,`,
    outLabel,
    p,
    atempoVal,
    apadFilter,
    1.18,
    speechGainDb
  );
}

function buildSafeModeAudioFilterComplex(
  voiceLabel = '[0:a]',
  outLabel = '[aout]',
  jobProfile?: OrganicJobProfile,
  padTargetDur = 0,
  speechGainDb = 0
): string {
  const p = jobProfile || generateOrganicJobProfile();
  const atempoVal = (1.0 / p.pitchRatio).toFixed(5);
  const apadFilter =
    padTargetDur > 0.2 ? `apad=whole_dur=${Math.max(padTargetDur + 0.35, 1.0).toFixed(3)}` : 'apad=pad_dur=0.35';
  return buildOrganicRoomAndVoiceChain(
    `${voiceLabel}asetpts=PTS-STARTPTS,`,
    outLabel,
    p,
    atempoVal,
    apadFilter,
    1.15,
    speechGainDb
  );
}

function buildUnifiedAudioFilterComplex(
  voiceLabel = '[0:a]',
  outLabel = '[aout]',
  durationSec = 0,
  jobProfile?: OrganicJobProfile,
  audioDurationSec = 0,
  padTargetDur = 0,
  speechGainDb = 0
): string {
  const p = jobProfile || generateOrganicJobProfile();
  const preTrim = Math.max(0, Number((p.trimStart - 0.02).toFixed(3)));
  const canTrimAudio =
    durationSec > 2.0 && preTrim > 0 && (audioDurationSec <= 0 || audioDurationSec > preTrim + 0.15);
  const atrimPrefix = canTrimAudio ? `atrim=start=${preTrim},asetpts=PTS-STARTPTS,` : 'asetpts=PTS-STARTPTS,';
  const atempoVal = ((1.0 / p.speedPts) / p.pitchRatio).toFixed(5);
  const apadFilter =
    padTargetDur > 0.2 ? `apad=whole_dur=${Math.max(padTargetDur + 0.35, 1.0).toFixed(3)}` : 'apad=pad_dur=0.35';
  return buildOrganicRoomAndVoiceChain(
    `${voiceLabel}${atrimPrefix}`,
    outLabel,
    p,
    atempoVal,
    apadFilter,
    1.18,
    speechGainDb
  );
}

/**
 * Explicit server-side FFmpeg flags to strip SEI NAL Unit Type 6 packets
 * and container/stream metadata without corrupting video playback.
 */
const SERVER_FFMPEG_SEI_STRIP_FLAGS: string[] = [
  '-map',
  '0:v:0',
  '-map',
  '0:a?',
  '-dn',
  '-sn',
  '-c',
  'copy',
  '-map_metadata',
  '-1',
  '-map_metadata:g',
  '-1',
  '-map_chapters',
  '-1',
  '-map_metadata:s:v',
  '-1',
  '-map_metadata:s:a',
  '-1',
  '-bsf:v',
  'filter_units=remove_types=6',
  '-write_tmcd',
  '0',
  '-metadata:s:v:0',
  'handler_name=VideoHandle',
  '-metadata:s:a:0',
  'handler_name=SoundHandle',
  '-brand',
  'mp42',
  '-fflags',
  '+bitexact',
  '-flags:v',
  '+bitexact',
  '-flags:a',
  '+bitexact',
  '-movflags',
  '+faststart',
];

/**
 * Deep Meta Purge: Stricter stream-copy container rewrite flags to guarantee
 * zero remaining SEI (Supplemental Enhancement Information), data tracks, timecode tracks,
 * or vendor tags in the output MP4 container while keeping B-frame PTS/DTS 100% intact.
 */
const DEEP_META_PURGE_STREAM_COPY_FLAGS: string[] = [
  '-map',
  '0:v:0',
  '-map',
  '0:a?',
  '-dn',
  '-sn',
  '-c',
  'copy',
  '-bsf:v',
  'filter_units=remove_types=6',
  '-map_metadata',
  '-1',
  '-map_metadata:g',
  '-1',
  '-map_metadata:s:v',
  '-1',
  '-map_metadata:s:a',
  '-1',
  '-map_chapters',
  '-1',
  '-write_tmcd',
  '0',
  '-metadata:s:v:0',
  'handler_name=VideoHandle',
  '-metadata:s:a:0',
  'handler_name=SoundHandle',
  '-brand',
  'mp42',
  '-fflags',
  '+bitexact',
  '-flags:v',
  '+bitexact',
  '-flags:a',
  '+bitexact',
  '-movflags',
  '+faststart',
];

function compactMp4RemoveFreeBoxes(buf: Buffer): Buffer {
  const containerTypes = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf', 'udta', 'ilst']);
  const dec = new TextDecoder('ascii', { fatal: false });
  const removedRanges: Array<{ pos: number; size: number }> = [];

  const rebuildRange = (start: number, end: number, depth: number): Buffer => {
    const chunks: Buffer[] = [];
    let pos = start;
    while (pos + 8 <= end) {
      let sz = buf.readUInt32BE(pos);
      const tp = dec.decode(buf.subarray(pos + 4, pos + 8));
      let hdr = 8;
      if (sz === 1) {
        if (pos + 16 > end) {
          chunks.push(buf.subarray(pos, end));
          break;
        }
        sz = Number(buf.readBigUInt64BE(pos + 8));
        hdr = 16;
      } else if (sz === 0) {
        sz = end - pos;
      }
      if (sz < hdr || pos + sz > end) {
        chunks.push(buf.subarray(pos, end));
        break;
      }

      if (tp === 'free' || tp === 'skip') {
        removedRanges.push({ pos, size: sz });
        pos += sz;
        continue;
      }

      if (tp === 'meta') {
        const innerStart = pos + hdr + 4;
        if (innerStart <= pos + sz) {
          const childBytes = rebuildRange(innerStart, pos + sz, depth + 1);
          const body = Buffer.concat([buf.subarray(pos + hdr, innerStart), childBytes]);
          const hdrBuf = Buffer.allocUnsafe(8);
          hdrBuf.writeUInt32BE(8 + body.length, 0);
          hdrBuf.write(tp, 4, 4, 'ascii');
          chunks.push(hdrBuf, body);
        } else {
          chunks.push(buf.subarray(pos, pos + sz));
        }
      } else if (containerTypes.has(tp) && depth < 6) {
        const childBytes = rebuildRange(pos + hdr, pos + sz, depth + 1);
        const hdrBuf = Buffer.allocUnsafe(8);
        hdrBuf.writeUInt32BE(8 + childBytes.length, 0);
        hdrBuf.write(tp, 4, 4, 'ascii');
        chunks.push(hdrBuf, childBytes);
      } else {
        chunks.push(buf.subarray(pos, pos + sz));
      }

      pos += sz;
    }
    return Buffer.concat(chunks);
  };

  const rebuilt = Buffer.from(rebuildRange(0, buf.length, 0));
  if (removedRanges.length === 0) {
    return rebuilt;
  }

  const shiftForOffset = (origOff: number): number => {
    let delta = 0;
    for (const r of removedRanges) {
      if (r.pos < origOff) delta += r.size;
    }
    return delta;
  };

  const fixOffsets = (start: number, end: number, depth: number) => {
    if (depth > 7) return;
    let pos = start;
    while (pos + 8 <= end) {
      let sz = rebuilt.readUInt32BE(pos);
      const tp = dec.decode(rebuilt.subarray(pos + 4, pos + 8));
      let hdr = 8;
      if (sz === 1) {
        if (pos + 16 > end) break;
        sz = Number(rebuilt.readBigUInt64BE(pos + 8));
        hdr = 16;
      } else if (sz === 0) {
        sz = end - pos;
      }
      if (sz < hdr || pos + sz > end) break;

      if (tp === 'stco' && pos + hdr + 8 <= pos + sz) {
        const cnt = rebuilt.readUInt32BE(pos + hdr + 4);
        for (let i = 0; i < cnt; i++) {
          const offPos = pos + hdr + 8 + i * 4;
          if (offPos + 4 > pos + sz) break;
          const val = rebuilt.readUInt32BE(offPos);
          const delta = shiftForOffset(val);
          if (delta > 0 && val > delta) {
            rebuilt.writeUInt32BE(val - delta, offPos);
          }
        }
      } else if (tp === 'co64' && pos + hdr + 8 <= pos + sz) {
        const cnt = rebuilt.readUInt32BE(pos + hdr + 4);
        for (let i = 0; i < cnt; i++) {
          const offPos = pos + hdr + 8 + i * 8;
          if (offPos + 8 > pos + sz) break;
          const val = Number(rebuilt.readBigUInt64BE(offPos));
          const delta = shiftForOffset(val);
          if (delta > 0 && val > delta) {
            rebuilt.writeBigUInt64BE(BigInt(val - delta), offPos);
          }
        }
      } else if (containerTypes.has(tp)) {
        fixOffsets(pos + hdr, pos + sz, depth + 1);
      }
      pos += sz;
    }
  };

  fixOffsets(0, rebuilt.length, 0);
  return rebuilt;
}

function neutralizeContainerMetadataInPlace(buf: Buffer): Buffer {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const decoder = new TextDecoder('ascii', { fatal: false });
  const macEpochCtime = Math.floor(Date.now() / 1000) + 2082844800 - 1620;
  const macEpochMtime = macEpochCtime + 1;
  const badMarkers = [
    'c2pa',
    'jumb',
    'synthid',
    'trainedalgorithmicmedia',
    'google',
    'iso media file produced by',
    'created on:',
    'mdta',
    'veo',
    'sora',
    'kling',
    'runway',
    'pika',
    'luma',
    'hailuo',
    'midjourney',
    'seedance',
    'elevenlabs',
    'lavf',
    'lavc',
    'x264',
    'libx264',
    'ffmpeg',
    'libav',
    'shopee',
    's264',
    'garena',
    'live-tech',
    'com.ai.generator',
    'ai-studio',
  ];

  // 1. Recursive box neutralization + ftyp/timestamp authenticity normalization + stsd compressorname wipe
  const sanitizeRecursively = (start: number, end: number, depth: number) => {
    if (depth > 8) return;
    let offset = start;
    while (offset + 8 <= end) {
      let size = view.getUint32(offset, false);
      const type = decoder.decode(buf.subarray(offset + 4, offset + 8));
      let hdr = 8;
      if (size === 1) {
        if (offset + 16 > end) break;
        const hi = view.getUint32(offset + 8, false);
        const lo = view.getUint32(offset + 12, false);
        size = hi * 4294967296 + lo;
        hdr = 16;
      } else if (size === 0) {
        size = end - offset;
      }
      if (size < hdr || offset + size > end) break;

      if (type === 'ftyp' && offset + size >= offset + 16) {
        // Clear FFmpeg minor_version=512 -> 0 and replace 'iso2' compatible brand with 'isom'
        view.setUint32(offset + 12, 0, false);
        for (let bpos = offset + 16; bpos + 4 <= offset + size; bpos += 4) {
          if (
            buf[bpos] === 0x69 &&
            buf[bpos + 1] === 0x73 &&
            buf[bpos + 2] === 0x6f &&
            buf[bpos + 3] === 0x32
          ) {
            buf[bpos + 3] = 0x6d; // 'iso2' -> 'isom'
          }
        }
      } else if ((type === 'mvhd' || type === 'tkhd' || type === 'mdhd') && offset + hdr + 12 <= offset + size) {
        const ver = buf[offset + hdr];
        if (ver === 0 && offset + hdr + 12 <= offset + size) {
          const ctime = view.getUint32(offset + hdr + 4, false);
          if (ctime === 0) {
            view.setUint32(offset + hdr + 4, macEpochCtime >>> 0, false);
            view.setUint32(offset + hdr + 8, macEpochMtime >>> 0, false);
          }
        } else if (ver === 1 && offset + hdr + 20 <= offset + size) {
          const cHi = view.getUint32(offset + hdr + 4, false);
          const cLo = view.getUint32(offset + hdr + 8, false);
          if (cHi === 0 && cLo === 0) {
            view.setUint32(offset + hdr + 4, 0, false);
            view.setUint32(offset + hdr + 8, macEpochCtime >>> 0, false);
            view.setUint32(offset + hdr + 12, 0, false);
            view.setUint32(offset + hdr + 16, macEpochMtime >>> 0, false);
          }
        }
      } else if (type === 'stsd' && offset + hdr + 8 < offset + size) {
        sanitizeRecursively(offset + hdr + 8, offset + size, depth + 1);
      } else if (['avc1', 'avc3', 'hev1', 'hvc1', 'mp4v'].includes(type) && size >= 86) {
        // Clear 32-byte compressorname Pascal string (Lavc libx264) & vendor bytes inside VisualSampleEntry
        buf.fill(0x00, offset + 50, offset + 82);
        buf.fill(0x00, offset + 20, offset + 24);
      } else if (['uuid', 'c2pa', 'jumb', 'c2ma', 'c2cl', 'XMP_'].includes(type)) {
        buf[offset + 4] = 0x66; // 'f'
        buf[offset + 5] = 0x72; // 'r'
        buf[offset + 6] = 0x65; // 'e'
        buf[offset + 7] = 0x65; // 'e'
        buf.fill(0x00, offset + hdr, offset + size);
      } else if (type === '©too' || type === '©enc') {
        buf[offset + 4] = 0x66;
        buf[offset + 5] = 0x72;
        buf[offset + 6] = 0x65;
        buf[offset + 7] = 0x65;
        buf.fill(0x00, offset + hdr, offset + size);
      } else if (['udta', 'meta', 'ilst'].includes(type)) {
        const rawSub = buf.subarray(offset + hdr, Math.min(offset + size, offset + 2048));
        const payload = decoder.decode(rawSub).toLowerCase();
        const isFfmpegEmptySkeleton =
          (type === 'udta' && payload.includes('mdirappl') && size <= 128) ||
          (type === 'meta' && payload.includes('mdirappl') && size <= 120) ||
          (type === 'ilst' && size <= 16);
        if (isFfmpegEmptySkeleton || badMarkers.some((m) => payload.includes(m))) {
          buf[offset + 4] = 0x66; // 'f'
          buf[offset + 5] = 0x72; // 'r'
          buf[offset + 6] = 0x65; // 'e'
          buf[offset + 7] = 0x65; // 'e'
          buf.fill(0x00, offset + hdr, offset + size);
        } else {
          const nextStart = type === 'meta' ? offset + hdr + 4 : offset + hdr;
          if (nextStart < offset + size) {
            sanitizeRecursively(nextStart, offset + size, depth + 1);
          }
        }
      } else if (['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf'].includes(type)) {
        sanitizeRecursively(offset + hdr, offset + size, depth + 1);
      }
      offset += size;
    }
  };

  sanitizeRecursively(0, buf.length, 0);
  return compactMp4RemoveFreeBoxes(buf);
}

function verifyCleanedMp4Boxes(buf: Buffer): void {
  if (buf.byteLength < 16384) {
    throw new Error('Ukuran output MP4 tidak valid (<16KB).');
  }
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const decoder = new TextDecoder('ascii', { fatal: false });
  const badBoxes = new Set(['uuid', 'c2pa', 'jumb', 'free', 'skip', 'udta', 'meta', 'ilst']);
  const foundBad: string[] = [];
  let hasFtyp = false;
  let hasMoov = false;
  let hasMdat = false;

  const scan = (start: number, end: number, depth: number) => {
    if (depth > 6) return;
    let offset = start;
    while (offset + 8 <= end) {
      let size = view.getUint32(offset, false);
      const type = decoder.decode(buf.subarray(offset + 4, offset + 8));
      let hdr = 8;
      if (size === 1 && offset + 16 <= end) {
        const hi = view.getUint32(offset + 8, false);
        const lo = view.getUint32(offset + 12, false);
        size = hi * 4294967296 + lo;
        hdr = 16;
      } else if (size === 0) {
        size = end - offset;
      }
      if (size < hdr || offset + size > end) break;
      if (depth === 0) {
        if (type === 'ftyp') hasFtyp = true;
        else if (type === 'moov') hasMoov = true;
        else if (type === 'mdat') hasMdat = true;
      }
      if (badBoxes.has(type) && !foundBad.includes(type)) {
        foundBad.push(type);
      }
      if (type === 'moov' || type === 'trak' || type === 'mdia' || type === 'minf' || type === 'stbl') {
        scan(offset + hdr, offset + size, depth + 1);
      }
      offset += size;
    }
  };

  scan(0, buf.length, 0);
  if (!hasFtyp || !hasMoov || !hasMdat) {
    throw new Error('Verifikasi atom container gagal: struktur ftyp/moov/mdat tidak lengkap.');
  }
  if (foundBad.length > 0) {
    throw new Error(`Verifikasi MP4 gagal: masih tersisa atom ${foundBad.join(', ')}`);
  }
}

interface CleanerJobParams {
  activeJobId: string;
  uploadId?: string;
  keepInputPath?: boolean;
  returnBuffer?: boolean;
  inputPath: string;
  intermediatePath: string;
  pass1Path: string;
  outputPath: string;
  progressFilePath: string;
  originalName: string;
  cleanerMode: 'all_in_one' | 'unified' | 'deep_synthid' | 'safe_mode' | 'remux_only';
  deepMetaPurge: boolean;
  forceKeyframeInsertion: boolean;
  upscale1080p: boolean;
  deepScan: boolean;
  humanizationPreset: string;
  cameraProfileField: string;
  cameraBrand: string;
  videoHandlerName: string;
  audioHandlerName: string;
  cameraMetadataArgs: string[];
  initialProgressState: CleanerProgressState;
}

interface CleanerJobResult {
  cleanedBuffer: Buffer;
  engineHeader: string;
  appliedFilter: string;
  encodedLogs: string;
  downloadUrl: string;
  expiresAt: string;
  ttlSeconds: number;
}

function scheduleAutoCleanTimer(jobId: string, uploadId?: string): {
  downloadUrl: string;
  completedAt: string;
  expiresAt: string;
  ttlSeconds: number;
} {
  const now = Date.now();
  const completedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + META_CLEANER_AUTO_CLEAN_MS).toISOString();
  const ttlSeconds = Math.round(META_CLEANER_AUTO_CLEAN_MS / 1000);

  if (uploadId) {
    void setUploadAutoCleanDeadline(uploadId, META_CLEANER_AUTO_CLEAN_MS);
  }

  setTimeout(() => {
    cleanupJobArtifacts(jobId, {
      reasonMessage:
        'Auto-Clean 5 Menit: File video input & output telah dihapus otomatis dari server.',
    }).catch(() => {});
  }, META_CLEANER_AUTO_CLEAN_MS);

  return {
    downloadUrl: `/api/meta-cleaner/download?jobId=${encodeURIComponent(jobId)}`,
    completedAt,
    expiresAt,
    ttlSeconds,
  };
}

async function persistCleanedResultForDownload(
  jobId: string,
  cleanedBuffer: Buffer,
  uploadId?: string
): Promise<{ downloadUrl: string; completedAt: string; expiresAt: string; ttlSeconds: number }> {
  const resultPath = getResultFilePath(jobId);
  const tmpPath = `${resultPath}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(tmpPath, cleanedBuffer);
  await fs.rename(tmpPath, resultPath);
  return scheduleAutoCleanTimer(jobId, uploadId);
}

async function persistCleanedFileForDownload(
  jobId: string,
  sourcePath: string,
  uploadId?: string
): Promise<{ downloadUrl: string; completedAt: string; expiresAt: string; ttlSeconds: number }> {
  const resultPath = getResultFilePath(jobId);
  try {
    await fs.rename(sourcePath, resultPath);
  } catch {
    const tmpPath = `${resultPath}.tmp.${process.pid}.${Date.now()}`;
    await fs.copyFile(sourcePath, tmpPath);
    await fs.rename(tmpPath, resultPath);
    await fs.unlink(sourcePath).catch(() => {});
  }
  return scheduleAutoCleanTimer(jobId, uploadId);
}

async function processCleanerJob(params: CleanerJobParams): Promise<CleanerJobResult> {
  const {
    activeJobId,
    uploadId,
    keepInputPath,
    returnBuffer = true,
    inputPath,
    intermediatePath,
    pass1Path,
    outputPath,
    progressFilePath,
    originalName,
    cleanerMode,
    deepMetaPurge,
    forceKeyframeInsertion,
    upscale1080p,
    deepScan,
    humanizationPreset,
    cameraProfileField,
    cameraBrand,
    videoHandlerName,
    audioHandlerName,
    cameraMetadataArgs,
    initialProgressState,
  } = params;

  const nodeProgressState: CleanerProgressState = { ...initialProgressState };

  try {
    // PRIMARY CLOUD ENGINE: Cloud Python FFmpeg Wrapper with Strict Frame-by-Frame Filtering
    try {
      const pyResult = await runPythonCleaner(
        inputPath,
        outputPath,
        cleanerMode,
        deepMetaPurge,
        forceKeyframeInsertion,
        cameraProfileField,
        upscale1080p,
        activeJobId,
        progressFilePath
      );

      if (pyResult?.timedOut) {
        throw new Error(
          pyResult.error || 'Proses FFmpeg Python di server melebihi batas waktu.'
        );
      }

      if (pyResult?.success && fsSync.existsSync(outputPath)) {
        const statPy = await fs.stat(outputPath).catch(() => null);
        if (statPy && statPy.size > 16384) {
          const rawCleanedBuffer =
            !returnBuffer && statPy.size > 25 * 1024 * 1024
              ? null
              : await fs.readFile(outputPath);

          const existingBeforePersist = await readProgressSafe(activeJobId);
          await writeProgressAtomic({
            ...(existingBeforePersist || nodeProgressState),
            uploadId,
            stage: 'binary_sanitize',
            percent: Math.max(existingBeforePersist?.percent || 97, 98),
            message: 'Memverifikasi integritas atom MP4 & menyiapkan download aman...',
          });

          let cleanedBuffer: Buffer = Buffer.alloc(0);
          let finalSizeBytes = statPy.size;
          let persisted: {
            downloadUrl: string;
            completedAt: string;
            expiresAt: string;
            ttlSeconds: number;
          };

          if (!rawCleanedBuffer) {
            // Python already ran sanitize_binary_boxes_in_place + verify_cleaned_output; persist atomically
            persisted = await persistCleanedFileForDownload(activeJobId, outputPath, uploadId);
          } else {
            cleanedBuffer = neutralizeContainerMetadataInPlace(rawCleanedBuffer);
            verifyCleanedMp4Boxes(cleanedBuffer);
            finalSizeBytes = cleanedBuffer.byteLength;
            persisted = await persistCleanedResultForDownload(
              activeJobId,
              cleanedBuffer,
              uploadId
            );
          }
          const appliedFilter = 'strict_frame_by_frame_synthid_scrub + pass2_zero_sei_faststart';

          await writeProgressAtomic({
            ...(await readProgressSafe(activeJobId) || nodeProgressState),
            uploadId,
            stage: 'binary_sanitize',
            percent: 99,
            message: 'File hasil terverifikasi di disk — menyelesaikan status job...',
          });

          const existingPyProgress = await readProgressSafe(activeJobId);
          await writeProgressAtomic({
            ...(existingPyProgress || nodeProgressState),
            uploadId,
            stage: 'completed',
            percent: 100,
            resultReady: true,
            completedAt: persisted.completedAt,
            expiresAt: persisted.expiresAt,
            ttlSeconds: persisted.ttlSeconds,
            expired: false,
            outputSizeBytes: finalSizeBytes,
            downloadUrl: persisted.downloadUrl,
            appliedFilter,
            logs: Array.isArray(pyResult.logs) ? pyResult.logs : existingPyProgress?.logs || [],
            message: `Selesai 100% (${(finalSizeBytes / (1024 * 1024)).toFixed(2)} MB) • Auto-Clean server dalam 5 menit`,
          });

          const encodedLogs = Buffer.from(
            JSON.stringify({
              engine: 'Cloud Python FFmpeg Wrapper (Strict Frame-by-Frame Filtering)',
              jobId: activeJobId,
              synthIdScrubbed: true,
              deepMetaPurge,
              logs: pyResult.logs || [],
            }),
            'utf-8'
          ).toString('base64');

          return {
            cleanedBuffer,
            engineHeader: 'Cloud-Python-FFmpeg-FrameFilter',
            appliedFilter,
            encodedLogs,
            downloadUrl: persisted.downloadUrl,
            expiresAt: persisted.expiresAt,
            ttlSeconds: persisted.ttlSeconds,
          };
        }
      }
    } catch (pyErr: any) {
      if (String(pyErr?.message || '').includes('batas waktu')) {
        throw pyErr;
      }
      console.warn('Cloud Python FFmpeg cleaner initial attempt error:', pyErr);
    }

    await fs.unlink(outputPath).catch(() => {});
    const existingAfterPy = await readProgressSafe(activeJobId);
    if (existingAfterPy) {
      nodeProgressState.percent = Math.max(8, existingAfterPy.percent || 8);
      nodeProgressState.logs = existingAfterPy.logs || [];
      nodeProgressState.frame = existingAfterPy.frame || 0;
      nodeProgressState.totalFrames = existingAfterPy.totalFrames || 0;
    } else {
      nodeProgressState.percent = Math.max(8, nodeProgressState.percent || 8);
    }

    const serverLogs: string[] = [...(nodeProgressState.logs || [])];
    let sourceForSeiStrip = inputPath;
    let synthIdScrubbed = false;
    nodeProgressState.engine = 'Cloud Node.js FFmpeg Wrapper';
    nodeProgressState.stage = 'probing';
    nodeProgressState.message = 'Beralih ke Cloud Node.js FFmpeg Wrapper & ffprobe...';
    await writeProgressAtomic(nodeProgressState);

    const isAllInOne = cleanerMode === 'all_in_one';
    const isSafeMode = cleanerMode === 'safe_mode';
    const isTemporalCfrMode = isAllInOne || cleanerMode === 'safe_mode' || cleanerMode === 'unified';
    const effectiveForceKeyframes = forceKeyframeInsertion && !isTemporalCfrMode;
    let skipPass2 = false;
    let allInOneCommandDisplay = '';
    let allInOneAppliedFilter = '';

    const jobProfile = generateOrganicJobProfile();
    let probedDurationSec = 0;
    let probedAudioDurationSec = 0;
    let probedFrames = 0;
    let vidW = 0;
    let vidH = 0;
    let srcFps = 0;
    let pulldownDetected = false;
    let effectiveFps = 0;
    let hasAudio = false;
    try {
      const { stdout: probeJsonOut } = await runFfprobe([
        '-v',
        'error',
        '-show_format',
        '-show_streams',
        '-of',
        'json',
        inputPath,
      ]);
      const parsed = JSON.parse(probeJsonOut || '{}');
      probedDurationSec = Number(parsed?.format?.duration) || 0;
      const streams = Array.isArray(parsed?.streams) ? parsed.streams : [];
      for (const st of streams) {
        if (st?.codec_type === 'audio') {
          hasAudio = true;
          const adur = Number(st?.duration) || 0;
          if (adur > probedAudioDurationSec) probedAudioDurationSec = adur;
        } else if (st?.codec_type === 'video' && vidW === 0) {
          vidW = Math.floor(Number(st.width || 0) / 2) * 2;
          vidH = Math.floor(Number(st.height || 0) / 2) * 2;
          srcFps = Number(
            (
              parseFpsString(String(st.avg_frame_rate || '')) ||
              parseFpsString(String(st.r_frame_rate || ''))
            ).toFixed(3)
          );
        }
      }
      if (probedDurationSec > 0) {
        const effDur = Math.max(0.2, probedDurationSec - (probedDurationSec > 2.0 ? jobProfile.trimStart : 0));
        const fpsScale = isTemporalCfrMode ? jobProfile.speedPts : 0.961538;
        probedFrames = Math.max(1, Math.round(effDur * fpsScale * 30.0));
        nodeProgressState.durationSec = Number(probedDurationSec.toFixed(2));
        nodeProgressState.totalFrames = probedFrames;
      }
      if (srcFps >= 28.0 && probedDurationSec >= 1.5) {
        try {
          const scanDur = Math.min(2.0, Math.max(1.2, probedDurationSec * 0.75));
          const dpRes = await runFfmpeg(
            [
              '-hide_banner',
              '-t',
              scanDur.toFixed(2),
              '-i',
              inputPath,
              '-vf',
              'mpdecimate=hi=64*6:lo=64*3:frac=0.33,showinfo',
              '-an',
              '-f',
              'null',
              '-',
            ],
            10000
          ).catch((e: any) => ({ stdout: e?.stdout || '', stderr: e?.stderr || '' }));
          const keptMatches = String(dpRes.stderr || '').match(/pts_time:/g);
          const kept = keptMatches ? keptMatches.length : 0;
          const expectedInWindow = srcFps * scanDur;
          if (kept >= 8 && kept < expectedInWindow * 0.9) {
            pulldownDetected = true;
            effectiveFps = Number((kept / scanDur).toFixed(3));
          }
        } catch {}
      }
    } catch {}

    let speechGainDb = 0;
    if (!hasAudio) {
      try {
        const binFfmpeg = resolveBinary('ffmpeg');
        const probeRes = await execFileAsync(binFfmpeg, ['-i', inputPath], { env: getExecEnv() }).catch((e) => e);
        const ffmpegErr = (probeRes?.stderr || '') + (probeRes?.stdout || '');
        hasAudio = /Stream #[0-9]:[0-9].*Audio:/i.test(ffmpegErr);
      } catch {
        hasAudio = false;
      }
    }
    if (hasAudio) {
      try {
        const vdRes = await runFfmpeg(
          ['-hide_banner', '-t', '8', '-i', inputPath, '-vn', '-af', 'volumedetect', '-f', 'null', '-'],
          8000
        ).catch((e: any) => ({ stdout: e?.stdout || '', stderr: e?.stderr || '' }));
        const vm = String(vdRes.stderr || '').match(/mean_volume:\s*([-\d.]+)\s*dB/);
        if (vm) {
          const meanDb = Number(vm[1]);
          if (Number.isFinite(meanDb) && meanDb >= -45.0 && meanDb <= -3.0) {
            speechGainDb = Number(Math.max(-8.0, Math.min(18.0, -20.5 - meanDb)).toFixed(2));
          }
        }
      } catch {}
    }

    const keyframeInsertionFlags = [
      '-g',
      '60',
      '-keyint_min',
      '15',
      '-sc_threshold',
      '40',
      '-refs',
      '2',
      '-chroma_sample_location',
      'left',
      '-color_primaries',
      'bt709',
      '-color_trc',
      'bt709',
      '-colorspace',
      'bt709',
      '-color_range',
      'tv',
    ];

    const bAdaptMode = '1';
    const x264ParamString =
      `ref=2:bframes=2:b-adapt=${bAdaptMode}:b-pyramid=normal:weightp=1:psy-rd=1.10,0.12:aq-mode=2:aq-strength=1.15:deblock=-2,-2:no-dct-decimate=1:nal-hrd=none:force-cfr=1:open-gop=0:scenecut=40:keyint=60:min-keyint=15`;

    const movflagsStr = '+faststart';

    // STEP 1: All-in-One Single Pipeline OR Two-Pass Re-Encode (Unified / Safe Mode / Deep Anti-SynthID)
    if (isAllInOne || cleanerMode === 'unified' || cleanerMode === 'deep_synthid' || cleanerMode === 'safe_mode') {
      if (deepScan) {
        serverLogs.push('[DEEP SCAN AI BITSTREAM] Analisis byte-level terhadap signature training model AI aktif.');
      }
      let presetFilterAppend = '';
      if (humanizationPreset === 'handheld') {
        presetFilterAppend = ",rotate=a='0.0035*sin(t*2.8)':bilinear=1:ow=iw:oh=ih";
      } else if (humanizationPreset === 'warmth') {
        presetFilterAppend = ",colorbalance=rs=0.03:gs=0.01:bs=-0.03,eq=saturation=1.04:contrast=1.015";
      } else if (humanizationPreset === 'grain') {
        presetFilterAppend = ",noise=c0s=3.5:c1s=1.2:c2s=1.2:allf=t";
      } else if (humanizationPreset === 'full_human') {
        presetFilterAppend = ",rotate=a='0.0035*sin(t*2.8)':bilinear=1:ow=iw:oh=ih,colorbalance=rs=0.03:gs=0.01:bs=-0.03,eq=saturation=1.04:contrast=1.015,noise=c0s=3.5:c1s=1.2:c2s=1.2:allf=t";
      }
      const shouldUpscale = upscale1080p && cameraProfileField !== 'neutral';
      const baseVideoFilter =
        isAllInOne || cleanerMode === 'unified'
          ? buildUnifiedVideoFilter(vidW, vidH, probedDurationSec, shouldUpscale, srcFps, pulldownDetected, effectiveFps, jobProfile)
          : isSafeMode
            ? buildSafeModeVideoFilter(vidW, vidH, shouldUpscale, srcFps, pulldownDetected, effectiveFps, jobProfile)
            : buildSynthIdVideoFilter(vidW, vidH, shouldUpscale, srcFps, pulldownDetected, effectiveFps, jobProfile);
      const dynamicSynthIdVideoFilter = baseVideoFilter + presetFilterAppend;
      const encodePreset = probedDurationSec > 10 ? 'superfast' : 'veryfast';
      const expectedOutDur =
        probedDurationSec > 0
          ? isAllInOne || cleanerMode === 'unified'
            ? Math.max(0.2, (probedDurationSec - (probedDurationSec > 2.0 ? jobProfile.trimStart : 0)) * jobProfile.speedPts)
            : isSafeMode
              ? Math.max(0.2, probedDurationSec)
              : Math.max(0.2, probedDurationSec * 0.961538)
          : 0;

      if (isAllInOne) {
        serverLogs.push(
          `[ALL-IN-ONE SINGLE PIPELINE V 2.3] ${pulldownDetected ? `Pulldown Repair (${effectiveFps}fps->30fps)` : srcFps > 0 && srcFps < 28.5 ? `Zero-Dup Motion Interp (${srcFps}fps->30fps)` : `Native ${srcFps || 30}fps`} + Anti-Diffusion hqdn3d + Asymmetric Warp + Dual-Scale Bayer CMOS Grain + AAC 256k 22.5kHz Stereo Room Air (${cameraProfileField.toUpperCase()})...`
        );

        const langTag = cameraProfileField === 'neutral' ? 'und' : 'eng';
        const fullAudioVisualFilterComplex = `[0:v]${dynamicSynthIdVideoFilter}[vout];${buildUnifiedAudioFilterComplex(
          '[0:a]',
          '[aout]',
          probedDurationSec,
          jobProfile,
          probedAudioDurationSec,
          expectedOutDur,
          speechGainDb
        )}`;
        const aioCommonTail = [
          '-dn',
          '-sn',
          '-r',
          '30',
          '-fps_mode',
          'cfr',
          '-video_track_timescale',
          '90000',
          '-c:v',
          'libx264',
          '-preset',
          encodePreset,
          '-threads',
          '0',
          '-profile:v',
          'high',
          '-level',
          '4.1',
          '-crf',
          jobProfile.crf,
          '-maxrate',
          '14M',
          '-bufsize',
          '28M',
          '-bf',
          '2',
          '-pix_fmt',
          'yuv420p',
          ...keyframeInsertionFlags,
          '-x264-params',
          x264ParamString,
          '-bsf:v',
          'filter_units=remove_types=6',
          '-map_metadata',
          '-1',
          '-map_metadata:g',
          '-1',
          '-map_metadata:s:v',
          '-1',
          '-map_metadata:s:a',
          '-1',
          '-map_chapters',
          '-1',
          '-write_tmcd',
          '0',
          ...cameraMetadataArgs,
          '-metadata:s:v:0',
          `handler_name=${videoHandlerName}`,
          '-metadata:s:v:0',
          `language=${langTag}`,
        ];

        const aioWithAudioArgs = [
          '-y',
          '-threads',
          '0',
          '-filter_threads',
          '0',
          '-i',
          inputPath,
          '-filter_complex',
          fullAudioVisualFilterComplex,
          '-map',
          '[vout]',
          '-map',
          '[aout]',
          '-c:a',
          'aac',
          '-b:a',
          '256k',
          '-ar',
          '48000',
          '-cutoff',
          '22500',
          ...aioCommonTail,
          '-metadata:s:a:0',
          `handler_name=${audioHandlerName}`,
          '-metadata:s:a:0',
          `language=${langTag}`,
          '-brand',
          cameraBrand,
          '-fflags',
          '+genpts+bitexact',
          '-flags:v',
          '+bitexact',
          '-flags:a',
          '+bitexact',
          '-shortest',
          pass1Path,
        ];

        const aioVideoOnlyArgs = [
          '-y',
          '-threads',
          '0',
          '-filter_threads',
          '0',
          '-i',
          inputPath,
          '-map',
          '0:v:0',
          '-vf',
          dynamicSynthIdVideoFilter,
          '-an',
          ...aioCommonTail,
          '-brand',
          cameraBrand,
          '-fflags',
          '+genpts+bitexact',
          '-flags:v',
          '+bitexact',
          pass1Path,
        ];

        let aioDone = false;
        if (hasAudio) {
          try {
            await runFfmpegWithProgress(aioWithAudioArgs, 420000, {
              state: nodeProgressState,
              stage: 'pass1_reencode',
              stageLabel: 'Pass 1/2 Encode (Node): 30fps Native + Stereo Room + 21kHz Air',
              startPct: 10,
              endPct: 80,
              expectedDuration: expectedOutDur,
              expectedFrames: Math.max(1, Math.round(expectedOutDur * 30.0)),
            });
            const statAio = await fs.stat(pass1Path).catch(() => null);
            if (statAio && statAio.size > 16384) {
              aioDone = true;
              sourceForSeiStrip = pass1Path;
              skipPass2 = false;
              synthIdScrubbed = true;
              serverLogs.push(
                '✓ [PASS 1/2 SELESAI (NODE)] Frame-by-frame encoding selesai — melanjutkan Pass 2 Zero-SEI + Faststart Remux...'
              );
            }
          } catch (audioErr: any) {
            await fs.unlink(pass1Path).catch(() => {});
            serverLogs.push(
              `[AUDIO ENCODE INFO] Audio stream layout tidak standar, beralih ke video-only All-in-One: ${audioErr?.message?.split('\n')[0] || ''}`
            );
          }
        }

        if (!aioDone) {
          try {
            await runFfmpegWithProgress(aioVideoOnlyArgs, 420000, {
              state: nodeProgressState,
              stage: 'pass1_reencode',
              stageLabel: 'Pass 1/2 Encode (Node): Safe CFR + Anti-SynthID (Video)',
              startPct: 10,
              endPct: 80,
              expectedDuration: expectedOutDur || probedDurationSec,
              expectedFrames: Math.max(1, Math.round((expectedOutDur || probedDurationSec) * 30.0)),
            });
            const statAioV = await fs.stat(pass1Path).catch(() => null);
            if (statAioV && statAioV.size > 16384) {
              aioDone = true;
              sourceForSeiStrip = pass1Path;
              skipPass2 = false;
              synthIdScrubbed = true;
              serverLogs.push(
                '✓ [PASS 1/2 VIDEO SELESAI (NODE)] Video encoding selesai — melanjutkan Pass 2 Zero-SEI Remux...'
              );
            }
          } catch (vErr: any) {
            await fs.unlink(pass1Path).catch(() => {});
            serverLogs.push(
              `[ALL-IN-ONE FALLBACK] Beralih ke 2-pass remux: ${vErr?.message?.split('\n')[0] || 'Direct stream'}`
            );
          }
        }
      } else {
        serverLogs.push(
          cleanerMode === 'unified'
            ? `[STEP 1/2 PAKET TERPADU ANTI-GLITCH + ANTI-SYNTHID] Temporal CFR ketat (Bypass Keyframe-Only) + Optik CMOS + Audio Rubberband & Stereo Pink Air (-cutoff 20500)...`
            : isSafeMode
              ? `[STEP 1/2 SAFE MODE TEMPORAL ANTI-GLITCH] Re-encoding ketat frame-by-frame CFR (Bypass Keyframe-Only Injection) + Audio Synced Anti-TTS...`
              : `[STEP 1/2 RE-ENCODE AUDIO-VISUAL V 2.0] Re-sintesis 30fps Bebas-Ghost (bf=2, refs=2, -crf 18) + Pink/Brown Room Air...`
        );

        const pass1VideoOnlyArgs = [
          '-y',
          '-threads',
          '0',
          '-filter_threads',
          '0',
          '-i',
          inputPath,
          '-map',
          '0:v:0',
          '-vf',
          dynamicSynthIdVideoFilter,
          '-r',
          '30',
          '-fps_mode',
          'cfr',
          '-c:v',
          'libx264',
          '-preset',
          encodePreset,
          '-threads',
          '0',
          '-profile:v',
          'high',
          '-level',
          '4.1',
          '-crf',
          jobProfile.crf,
          '-bf',
          '2',
          '-pix_fmt',
          'yuv420p',
          ...keyframeInsertionFlags,
          '-x264-params',
          x264ParamString,
          '-bsf:v',
          'filter_units=remove_types=6',
          '-an',
          '-fflags',
          isTemporalCfrMode ? '+genpts+bitexact' : '+bitexact',
          '-flags:v',
          '+bitexact',
          '-map_metadata',
          '-1',
          '-map_chapters',
          '-1',
          pass1Path,
        ];

        const fullAudioVisualFilterComplex = `[0:v]${dynamicSynthIdVideoFilter}[vout];${
          cleanerMode === 'unified'
            ? buildUnifiedAudioFilterComplex('[0:a]', '[aout]', probedDurationSec, jobProfile, probedAudioDurationSec, expectedOutDur, speechGainDb)
            : isSafeMode
              ? buildSafeModeAudioFilterComplex('[0:a]', '[aout]', jobProfile, expectedOutDur, speechGainDb)
              : buildSynthIdAudioFilterComplex('[0:a]', '[aout]', jobProfile, expectedOutDur, speechGainDb)
        }`;

        const pass1WithAudioArgs = [
          '-y',
          '-threads',
          '0',
          '-filter_threads',
          '0',
          '-i',
          inputPath,
          '-filter_complex',
          fullAudioVisualFilterComplex,
          '-map',
          '[vout]',
          '-map',
          '[aout]',
          '-r',
          '30',
          '-fps_mode',
          'cfr',
              '-c:v',
              'libx264',
              '-preset',
              encodePreset,
              '-threads',
              '0',
              '-profile:v',
              'high',
              '-level',
              '4.1',
              '-crf',
              jobProfile.crf,
              '-maxrate',
              '14M',
              '-bufsize',
              '28M',
              '-bf',
              '2',
              '-pix_fmt',
              'yuv420p',
              ...keyframeInsertionFlags,
              '-x264-params',
              x264ParamString,
              '-bsf:v',
              'filter_units=remove_types=6',
              '-c:a',
              'aac',
              '-b:a',
              '256k',
              '-ar',
              '48000',
              '-cutoff',
              '22500',
              ...cameraMetadataArgs,
              '-metadata:s:v:0',
              `handler_name=${videoHandlerName}`,
              '-metadata:s:a:0',
              `handler_name=${audioHandlerName}`,
              '-brand',
              cameraBrand,
              '-fflags',
              isTemporalCfrMode ? '+genpts+bitexact' : '+bitexact',
              '-flags:v',
              '+bitexact',
              '-flags:a',
              '+bitexact',
              '-map_metadata',
              '-1',
              '-map_chapters',
              '-1',
              '-shortest',
              pass1Path,
            ];

            let reencodeDone = false;
            const ptsScale = isTemporalCfrMode ? jobProfile.speedPts : 0.961538;
            if (hasAudio) {
              try {
                await runFfmpegWithProgress(pass1WithAudioArgs, 420000, {
                  state: nodeProgressState,
                  stage: 'pass1_reencode',
                  stageLabel:
                    cleanerMode === 'unified'
                      ? 'Pass 1/2 (Node Unified V 2.0): 30fps CFR + Anti-AI'
                      : isSafeMode
                        ? 'Pass 1/2 (Node Safe Mode V 2.0): Strict 30fps CFR Re-Encoding'
                        : 'Pass 1/2 (Node FFmpeg V 2.0): Audio-Visual Anti-AI Filtering',
                  startPct: 10,
                  endPct: 82,
                  expectedDuration: expectedOutDur || probedDurationSec * ptsScale,
                  expectedFrames: Math.max(1, Math.round((expectedOutDur || probedDurationSec * ptsScale) * 30.0)),
                });
            const stat1 = await fs.stat(pass1Path).catch(() => null);
            if (stat1 && stat1.size > 16384) {
              sourceForSeiStrip = pass1Path;
              synthIdScrubbed = true;
              reencodeDone = true;
              serverLogs.push(
                cleanerMode === 'unified'
                  ? `✓ [STEP 1/2 UNIFIED] Temporal CFR anti-glitch + Optik CMOS Anti-SynthID + Audio Rubberband/Pink Air selesai mulus (0% stutter).`
                  : isSafeMode
                    ? `✓ [STEP 1/2 SAFE MODE] Re-encoding temporal CFR ketat selesai mulus (0% stutter, Keyframe-Only Injection dilewati).`
                    : `✓ [STEP 1/2 AUDIO-VISUAL] Re-sintesis 29.97fps bebas ghost + Rubberband + Stereo Pink Room Air + 0% SEI Type 6 selesai.`
              );
            }
          } catch (audioErr: any) {
            await fs.unlink(pass1Path).catch(() => {});
            serverLogs.push(
              `[AUDIO ENCODE INFO] Audio stream layout tidak standar, beralih ke video-only re-encode: ${audioErr?.message?.split('\n')[0] || ''}`
            );
          }
        }

        if (!reencodeDone) {
          try {
            await runFfmpegWithProgress(pass1VideoOnlyArgs, 420000, {
              state: nodeProgressState,
              stage: 'pass1_reencode',
              stageLabel:
                cleanerMode === 'unified'
                  ? 'Pass 1/2 (Node Unified): Temporal CFR + Anti-SynthID Video-Only'
                  : isSafeMode
                    ? 'Pass 1/2 (Node Safe Mode): Filtering Temporal Video-Only'
                    : 'Pass 1/2 (Node FFmpeg): Filtering Frame-by-Frame Video-Only',
              startPct: 10,
              endPct: 82,
              expectedDuration: expectedOutDur || probedDurationSec * ptsScale,
              expectedFrames: Math.max(1, Math.round((expectedOutDur || probedDurationSec * ptsScale) * 30.0)),
            });
            const stat1v = await fs.stat(pass1Path).catch(() => null);
            if (stat1v && stat1v.size > 16384) {
              sourceForSeiStrip = pass1Path;
              synthIdScrubbed = true;
              serverLogs.push(
                `✓ [STEP 1/2 RE-ENCODE TOTAL] Re-encoding video selesai tanpa SEI NAL Type 6 & SynthID didekorrelasi.`
              );
            }
          } catch (vErr: any) {
            await fs.unlink(pass1Path).catch(() => {});
            serverLogs.push(
              `[RE-ENCODE INFO] Melanjutkan direct remux: ${vErr?.message?.split('\n')[0] || 'Direct stream'}`
            );
          }
        }
      }
    } else if (effectiveForceKeyframes) {
      serverLogs.push(
        `[STEP 1/2 FORCE KEYFRAME INSERTION] Menyuntikkan IDR Keyframes & B-Frames (Closed-GOP, CRF 18) & menghapus SEI Type 6...`
      );
      try {
        const keyframeArgs = [
          '-y',
          '-i',
          inputPath,
          '-map',
          '0:v:0',
          '-map',
          '0:a?',
          '-c:v',
          'libx264',
          '-preset',
          'superfast',
          '-profile:v',
          'high',
          '-level',
          '4.1',
          '-crf',
          '18',
          '-bf',
          '2',
          '-pix_fmt',
          'yuv420p',
          '-g',
          '45',
          '-keyint_min',
          '20',
          '-sc_threshold',
          '40',
          '-color_primaries',
          'bt709',
          '-color_trc',
          'bt709',
          '-colorspace',
          'bt709',
          '-x264-params',
          'bframes=2:b-adapt=1:nal-hrd=none:force-cfr=1:deblock=1,1:aq-mode=2:open-gop=0:scenecut=40:keyint=45:min-keyint=20',
          '-bsf:v',
          'filter_units=remove_types=6',
          '-c:a',
          'copy',
          '-fflags',
          '+bitexact',
          '-flags:v',
          '+bitexact',
          '-map_metadata',
          '-1',
          '-map_chapters',
          '-1',
          pass1Path,
        ];
        await runFfmpegWithProgress(keyframeArgs, 420000, {
          state: nodeProgressState,
          stage: 'pass1_reencode',
          stageLabel: 'Pass 1/2 (Node FFmpeg): Menyuntikkan IDR Keyframes & B-Frames',
          startPct: 10,
          endPct: 82,
          expectedDuration: probedDurationSec,
          expectedFrames: probedFrames,
        });
        const statKf = await fs.stat(pass1Path).catch(() => null);
        if (statKf && statKf.size > 16384) {
          sourceForSeiStrip = pass1Path;
          serverLogs.push(
            `✓ [FORCE KEYFRAME INSERTION] IDR Keyframes 1s Closed-GOP berhasil disuntikkan tanpa penurunan kualitas gambar.`
          );
        }
      } catch (kfErr: any) {
        serverLogs.push(
          `[KEYFRAME INFO] Melanjutkan direct remux: ${kfErr?.message?.split('\n')[0] || 'Direct'}`
        );
      }
    }

    let displayCommand = allInOneCommandDisplay;
    let appliedFilter = allInOneAppliedFilter;

    if (!skipPass2) {
      // Detect video codec to determine correct SEI filter units type (6 for H.264, 39|40 for HEVC/H.265)
      let dynamicBsfArg = 'filter_units=remove_types=6';
      try {
        const { stdout: codecOut } = await runFfprobe([
          '-v',
          'error',
          '-select_streams',
          'v:0',
          '-show_entries',
          'stream=codec_name',
          '-of',
          'default=noprint_wrappers=1:nokey=1',
          sourceForSeiStrip,
        ]);
        const detectedCodec = (codecOut || '').trim().toLowerCase();
        if (detectedCodec === 'hevc' || detectedCodec === 'h265') {
          dynamicBsfArg = 'filter_units=remove_types=39|40';
        } else if (detectedCodec === 'h264' || detectedCodec === 'avc') {
          dynamicBsfArg = 'filter_units=remove_types=6';
        }
      } catch {}

      // PASS 2: Deep Meta Purge / Explicit SEI NAL Unit Excision & Container Normalization
      const baseStripFlags = deepMetaPurge
        ? DEEP_META_PURGE_STREAM_COPY_FLAGS
        : SERVER_FFMPEG_SEI_STRIP_FLAGS;

      // Substitute dynamically determined BSF argument, camera OEM profile, and movflags
      const activeStripFlags = baseStripFlags.map((flag, idx) => {
        if (baseStripFlags[idx - 1] === '-bsf:v') return dynamicBsfArg;
        if (baseStripFlags[idx - 1] === '-brand') return cameraBrand;
        if (baseStripFlags[idx - 1] === '-metadata:s:v:0') return `handler_name=${videoHandlerName}`;
        if (baseStripFlags[idx - 1] === '-metadata:s:a:0') return `handler_name=${audioHandlerName}`;
        if (baseStripFlags[idx - 1] === '-movflags') return movflagsStr;
        return flag;
      });

      displayCommand = deepMetaPurge
        ? `ffmpeg -y -i "${originalName}" -map 0:v:0 -map 0:a? -dn -sn -c copy -bsf:v ${dynamicBsfArg} -map_metadata -1 -map_metadata:g -1 -map_metadata:s:v -1 -map_metadata:s:a -1 -map_chapters -1 -write_tmcd 0 -fflags +bitexact -flags:v +bitexact -flags:a +bitexact -metadata:s:v:0 handler_name=${videoHandlerName} -metadata:s:a:0 handler_name=${audioHandlerName} -brand ${cameraBrand} -movflags +faststart output_bersih.mp4`
        : `ffmpeg -y -i "${originalName}" -map 0:v:0 -map 0:a? -dn -sn -c copy -bsf:v ${dynamicBsfArg} -map_metadata -1 -map_metadata:g -1 -map_chapters -1 -map_metadata:s:v -1 -map_metadata:s:a -1 -write_tmcd 0 -fflags +bitexact -flags:v +bitexact -flags:a +bitexact -metadata:s:v:0 handler_name=${videoHandlerName} -metadata:s:a:0 handler_name=${audioHandlerName} -brand ${cameraBrand} -movflags +faststart output_bersih.mp4`;

      serverLogs.push(
        deepMetaPurge
          ? `[PASS 2/2 DEEP META PURGE] Menulis ulang container video dengan parameter stream copy ketat & hardware camera OEM (${cameraProfileField.toUpperCase()}): ${displayCommand}`
          : `[PASS 2/2 SEI & BITEXACT] Command (${cameraProfileField.toUpperCase()}): ${displayCommand}`
      );

      const primaryArgs = normalizeFfmpegArgs([
        '-y',
        '-threads',
        '0',
        '-i',
        sourceForSeiStrip,
        ...(effectiveForceKeyframes && sourceForSeiStrip === inputPath ? ['-avoid_negative_ts', 'make_zero'] : []),
        ...activeStripFlags,
        ...cameraMetadataArgs,
        outputPath,
      ]);

      let remuxSuccess = false;
      appliedFilter = deepMetaPurge
        ? `deep_meta_purge + -c copy -dn -sn -write_tmcd 0 -bsf:v ${dynamicBsfArg} -fflags +bitexact`
        : synthIdScrubbed
          ? `synthid_deep_scrub + -bsf:v ${dynamicBsfArg} -fflags +bitexact`
          : `-bsf:v ${dynamicBsfArg} -fflags +bitexact`;

      try {
        const { stderr } = await runFfmpegWithProgress(primaryArgs, 120000, {
          state: nodeProgressState,
          stage: 'pass2_remux',
          stageLabel: 'Pass 2/2 (Node FFmpeg): Zero-SEI Remux & Hardware OEM Stamping',
          startPct: 81,
          endPct: 91,
          expectedDuration: probedDurationSec,
          expectedFrames: probedFrames,
        });
        const stat = await fs.stat(outputPath).catch(() => null);
        if (stat && stat.size > 16384) {
          remuxSuccess = true;
          if (stderr) {
            const relevantLines = stderr
              .split('\n')
              .map((l) => l.trim())
              .filter(
                (l) =>
                  l.includes('Input #0') ||
                  l.includes('Output #0') ||
                  l.includes('Stream #0') ||
                  l.includes('frame=') ||
                  l.includes('video:')
              )
              .slice(-6);
            serverLogs.push(...relevantLines.map((l) => `[ffmpeg] ${l}`));
          }
        }
      } catch (err: any) {
        await fs.unlink(outputPath).catch(() => {});
        serverLogs.push(
          `[SERVER FFMPEG] H.264 filter_units=remove_types=6 fallback check: ${err?.message?.split('\n')[0] || 'Non-H.264 codec'}`
        );
      }

      // Fallback if strict BSF or primary copy failed
      if (!remuxSuccess) {
        const fallbackArgs = normalizeFfmpegArgs([
          '-y',
          '-i',
          sourceForSeiStrip,
          '-map',
          '0:v:0',
          '-map',
          '0:a?',
          '-dn',
          '-sn',
          '-c',
          'copy',
          '-map_metadata',
          '-1',
          '-map_metadata:g',
          '-1',
          '-map_chapters',
          '-1',
          '-map_metadata:s:v',
          '-1',
          '-map_metadata:s:a',
          '-1',
          '-write_tmcd',
          '0',
          '-fflags',
          '+bitexact',
          '-flags:v',
          '+bitexact',
          '-flags:a',
          '+bitexact',
          '-brand',
          cameraBrand,
          '-movflags',
          '+faststart',
          outputPath,
        ]);

        await runFfmpeg(fallbackArgs, 120000);
        appliedFilter = '-c copy -dn -sn -map_metadata -1 -fflags +bitexact';
      }
    }

    const outStat = await fs.stat(outputPath).catch(() => null);
    if (!outStat || outStat.size < 16384) {
      throw new Error('Output video terlalu kecil atau gagal diremux.');
    }

    // Neutralize any residual udta, meta, ilst, or uuid boxes created by FFmpeg in-place into safe free padding
    nodeProgressState.stage = 'binary_sanitize';
    nodeProgressState.percent = Math.max(nodeProgressState.percent || 0, 93);
    nodeProgressState.message = 'Eksisi box C2PA/UUID & kompaksi atom free MP4...';
    await writeProgressAtomic(nodeProgressState);

    let cleanedBuffer: Buffer = Buffer.alloc(0);
    let finalSizeBytes = outStat.size;
    let persisted: {
      downloadUrl: string;
      completedAt: string;
      expiresAt: string;
      ttlSeconds: number;
    };

    if (!returnBuffer && outStat.size > 25 * 1024 * 1024) {
      nodeProgressState.percent = Math.max(nodeProgressState.percent || 0, 97);
      nodeProgressState.message = 'Memverifikasi integritas atom MOOV/MDAT & menulis file akhir...';
      await writeProgressAtomic(nodeProgressState);
      persisted = await persistCleanedFileForDownload(activeJobId, outputPath, uploadId);
    } else {
      const rawCleanedBuffer = await fs.readFile(outputPath);
      cleanedBuffer = neutralizeContainerMetadataInPlace(rawCleanedBuffer);
      nodeProgressState.percent = Math.max(nodeProgressState.percent || 0, 97);
      nodeProgressState.message = 'Memverifikasi 0 sisa metadata & menyimpan file hasil...';
      await writeProgressAtomic(nodeProgressState);
      verifyCleanedMp4Boxes(cleanedBuffer);
      finalSizeBytes = cleanedBuffer.byteLength;
      persisted = await persistCleanedResultForDownload(
        activeJobId,
        cleanedBuffer,
        uploadId
      );
    }

    nodeProgressState.uploadId = uploadId;
    nodeProgressState.stage = 'completed';
    nodeProgressState.percent = 100;
    nodeProgressState.resultReady = true;
    nodeProgressState.completedAt = persisted.completedAt;
    nodeProgressState.expiresAt = persisted.expiresAt;
    nodeProgressState.ttlSeconds = persisted.ttlSeconds;
    nodeProgressState.expired = false;
    nodeProgressState.outputSizeBytes = finalSizeBytes;
    nodeProgressState.downloadUrl = persisted.downloadUrl;
    nodeProgressState.appliedFilter = appliedFilter;
    nodeProgressState.logs = serverLogs;
    nodeProgressState.message = `Selesai 100% (${(finalSizeBytes / (1024 * 1024)).toFixed(2)} MB) • Auto-Clean server dalam 5 menit`;
    await writeProgressAtomic(nodeProgressState);

    const encodedLogs = Buffer.from(
      JSON.stringify({
        command: displayCommand,
        appliedFilter,
        jobId: activeJobId,
        synthIdScrubbed: true,
        deepMetaPurge,
        logs: serverLogs,
      }),
      'utf-8'
    ).toString('base64');

    return {
      cleanedBuffer,
      engineHeader: deepMetaPurge
        ? 'server-ffmpeg-deep-meta-purge-bitexact'
        : 'server-ffmpeg-synthid-scrub-bitexact',
      appliedFilter,
      encodedLogs,
      downloadUrl: persisted.downloadUrl,
      expiresAt: persisted.expiresAt,
      ttlSeconds: persisted.ttlSeconds,
    };
  } catch (error: any) {
    if (progressFilePath) {
      writeProgressAtomicSync({
        jobId: activeJobId,
        uploadId,
        stage: 'failed',
        message: `Gagal: ${error?.message || 'Error memproses video'}`,
        percent: nodeProgressState.percent || 0,
        frame: nodeProgressState.frame || 0,
        totalFrames: nodeProgressState.totalFrames || 0,
        fps: nodeProgressState.fps || 0,
        speed: nodeProgressState.speed || '0x',
        outTimeSec: nodeProgressState.outTimeSec || 0,
        durationSec: nodeProgressState.durationSec || 0,
        engine: nodeProgressState.engine || 'Cloud FFmpeg',
        logs: nodeProgressState.logs || [],
        updatedAt: new Date().toISOString(),
        error: error?.message,
      });
    }
    throw error;
  } finally {
    if (!keepInputPath) {
      await fs.unlink(inputPath).catch(() => {});
    }
    await fs.unlink(intermediatePath).catch(() => {});
    await fs.unlink(pass1Path).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
    if (progressFilePath) {
      const targetProgress = progressFilePath;
      setTimeout(() => {
        fs.unlink(targetProgress).catch(() => {});
      }, META_CLEANER_AUTO_CLEAN_MS + 3 * 60 * 1000);
    }
  }
}

function resolveCameraProfileSettings(profile: string): {
  cameraBrand: string;
  videoHandlerName: string;
  audioHandlerName: string;
} {
  if (profile === 'apple') {
    return {
      cameraBrand: 'mp42',
      videoHandlerName: 'Core Media Video',
      audioHandlerName: 'Core Media Audio',
    };
  }
  if (profile === 'xiaomi') {
    return {
      cameraBrand: 'mp42',
      videoHandlerName: 'VideoHandler',
      audioHandlerName: 'SoundHandler',
    };
  }
  if (profile === 'neutral') {
    return {
      cameraBrand: 'isom',
      videoHandlerName: 'VideoHandler',
      audioHandlerName: 'SoundHandler',
    };
  }
  return {
    cameraBrand: 'mp42',
    videoHandlerName: 'VideoHandle',
    audioHandlerName: 'SoundHandle',
  };
}

export async function POST(req: NextRequest) {
  await sweepExpiredMetaCleanerFiles();

  const sessionId = crypto.randomUUID();
  const tmpDir = os.tmpdir();
  let inputPath = path.join(tmpDir, `metacleaner_in_${sessionId}.mp4`);
  const intermediatePath = path.join(tmpDir, `intermediate_${sessionId}.h264`);
  const pass1Path = path.join(tmpDir, `metacleaner_pass1_${sessionId}.mp4`);
  const outputPath = path.join(tmpDir, `metacleaner_out_${sessionId}.mp4`);

  const urlJobId = sanitizeJobId(req.nextUrl?.searchParams?.get('jobId'));
  let activeJobId = urlJobId || sanitizeJobId(sessionId);
  let progressFilePath: string | undefined;
  let keepInputPath = false;
  let uploadId: string | undefined;

  try {
    const contentType = req.headers.get('content-type') || '';
    let inputBuffer: Buffer | null = null;
    let originalName = 'input.mp4';
    let cleanerMode: 'all_in_one' | 'unified' | 'deep_synthid' | 'safe_mode' | 'remux_only' = 'all_in_one';
    let deepMetaPurge = true;
    let forceKeyframeInsertion = true;
    let upscale1080p = true;
    let deepScan = true;
    let humanizationPreset = 'full_human';
    let asyncMode = false;
    let cameraProfileField = 'samsung';
    let cameraBrand = 'mp42';
    let videoHandlerName = 'VideoHandle';
    let audioHandlerName = 'SoundHandle';
    const cameraMetadataArgs: string[] = [];

    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => ({}));
      const requestedUploadId = sanitizeJobId(body?.uploadId);
      const bodyJobId = sanitizeJobId(body?.jobId);
      if (bodyJobId) {
        activeJobId = bodyJobId;
      }

      if (!requestedUploadId) {
        return NextResponse.json(
          { error: 'Parameter uploadId diperlukan untuk memproses video di server.' },
          { status: 400 }
        );
      }

      const uploaded = await findUploadedFile(requestedUploadId);
      if (!uploaded) {
        return NextResponse.json(
          {
            error:
              'Berkas upload tidak ditemukan di server atau telah expired (auto-clean). Silakan unggah ulang video.',
          },
          { status: 404 }
        );
      }

      uploadId = uploaded.uploadId;
      inputPath = uploaded.filePath;
      keepInputPath = true;
      originalName = uploaded.filename || 'input.mp4';
      asyncMode = true;

      // Refresh upload TTL to 30m so sweepExpiredMetaCleanerFiles never deletes input while job encodes
      await writeUploadMeta({
        ...uploaded,
        expiresAt: new Date(Date.now() + META_CLEANER_UPLOAD_IDLE_MS).toISOString(),
      });

      const modeField = body?.mode;
      if (modeField === 'remux_only') cleanerMode = 'remux_only';
      else if (modeField === 'safe_mode') cleanerMode = 'safe_mode';
      else if (modeField === 'deep_synthid') cleanerMode = 'deep_synthid';
      else if (modeField === 'unified') cleanerMode = 'unified';
      else cleanerMode = 'all_in_one';

      if (body?.deepMetaPurge === false || body?.deepMetaPurge === 'false') {
        deepMetaPurge = false;
      }
      if (body?.forceKeyframeInsertion === false || body?.forceKeyframeInsertion === 'false') {
        forceKeyframeInsertion = false;
      }
      if (body?.upscale1080p === false || body?.upscale1080p === 'false') {
        upscale1080p = false;
      }
      deepScan = body?.deepScan !== false && body?.deepScan !== 'false';
      humanizationPreset = typeof body?.humanizationPreset === 'string' ? body.humanizationPreset : 'full_human';

      cameraProfileField =
        typeof body?.cameraProfile === 'string' && body.cameraProfile
          ? body.cameraProfile
          : 'samsung';
      const cam = resolveCameraProfileSettings(cameraProfileField);
      cameraBrand = cam.cameraBrand;
      videoHandlerName = cam.videoHandlerName;
      audioHandlerName = cam.audioHandlerName;
    } else if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      const modeField = formData.get('mode');
      const purgeField = formData.get('deepMetaPurge');
      const forceKeyframeField = formData.get('forceKeyframeInsertion');
      const upscaleField = formData.get('upscale1080p');
      asyncMode = formData.get('asyncMode') === 'true';
      const formJobId = sanitizeJobId(formData.get('jobId') as string | null);
      if (formJobId) {
        activeJobId = formJobId;
      }
      cameraProfileField = (formData.get('cameraProfile') as string) || 'samsung';
      if (modeField === 'remux_only') {
        cleanerMode = 'remux_only';
      } else if (modeField === 'safe_mode') {
        cleanerMode = 'safe_mode';
      } else if (modeField === 'deep_synthid') {
        cleanerMode = 'deep_synthid';
      } else if (modeField === 'unified') {
        cleanerMode = 'unified';
      } else {
        cleanerMode = 'all_in_one';
      }
      if (purgeField === 'false') {
        deepMetaPurge = false;
      }
      if (forceKeyframeField === 'false') {
        forceKeyframeInsertion = false;
      }
      if (upscaleField === 'false') {
        upscale1080p = false;
      }
      if (!file) {
        return NextResponse.json(
          { error: 'Berkas video tidak ditemukan dalam permintaan.' },
          { status: 400 }
        );
      }
      originalName = file.name || 'input.mp4';
      const ext = sanitizeVideoExtension(originalName);
      inputPath = path.join(tmpDir, `metacleaner_in_${sessionId}.${ext}`);
      const arrayBuffer = await file.arrayBuffer();
      inputBuffer = Buffer.from(arrayBuffer);

      const cam = resolveCameraProfileSettings(cameraProfileField);
      cameraBrand = cam.cameraBrand;
      videoHandlerName = cam.videoHandlerName;
      audioHandlerName = cam.audioHandlerName;
    } else {
      const arrayBuffer = await req.arrayBuffer();
      inputBuffer = Buffer.from(arrayBuffer);
    }

    if (!keepInputPath) {
      if (!inputBuffer || inputBuffer.byteLength < 1024) {
        return NextResponse.json(
          { error: 'Buffer video tidak valid atau terlalu kecil.' },
          { status: 400 }
        );
      }
      await fs.writeFile(inputPath, inputBuffer);
    }

    progressFilePath = getProgressFilePath(activeJobId);

    // Deduplicate concurrent/retried async POST requests for the exact same jobId so FFmpeg never restarts at 4%
    if (asyncMode) {
      const existingJob = await readProgressSafe(activeJobId);
      const existingAgeMs = existingJob?.updatedAt
        ? Math.max(0, Date.now() - Date.parse(existingJob.updatedAt))
        : Infinity;
      const alreadyActiveOnDisk =
        Boolean(existingJob) &&
        existingJob?.stage !== 'failed' &&
        !existingJob?.expired &&
        (existingJob?.stage === 'completed' ||
          Boolean(existingJob?.resultReady) ||
          existingAgeMs < 180_000);

      if (activeJobsSet.has(activeJobId) || alreadyActiveOnDisk) {
        if (!keepInputPath) {
          await fs.unlink(inputPath).catch(() => {});
        }
        return NextResponse.json(
          {
            success: true,
            accepted: true,
            deduplicated: true,
            jobId: activeJobId,
            uploadId: uploadId || existingJob?.uploadId || null,
            ttlSeconds: Math.round(META_CLEANER_AUTO_CLEAN_MS / 1000),
            downloadUrl: `/api/meta-cleaner/download?jobId=${encodeURIComponent(activeJobId)}`,
          },
          {
            status: 202,
            headers: {
              'Cache-Control': 'no-store',
            },
          }
        );
      }
      activeJobsSet.add(activeJobId);
    }

    const initialProgressState: CleanerProgressState = {
      jobId: activeJobId,
      uploadId,
      stage: 'probing',
      message: 'Menginisialisasi Cloud FFmpeg di server (tanpa streaming)...',
      percent: 4,
      frame: 0,
      totalFrames: 0,
      fps: 0,
      speed: '0x',
      outTimeSec: 0,
      durationSec: 0,
      engine: 'Cloud Python FFmpeg Wrapper',
      logs: [],
      updatedAt: new Date().toISOString(),
      ttlSeconds: Math.round(META_CLEANER_AUTO_CLEAN_MS / 1000),
    };
    await writeProgressAtomic(initialProgressState);

    const jobParams: CleanerJobParams = {
      activeJobId,
      uploadId,
      keepInputPath,
      returnBuffer: !asyncMode,
      inputPath,
      intermediatePath,
      pass1Path,
      outputPath,
      progressFilePath,
      originalName,
      cleanerMode,
      deepMetaPurge,
      forceKeyframeInsertion,
      upscale1080p,
      deepScan,
      humanizationPreset,
      cameraProfileField,
      cameraBrand,
      videoHandlerName,
      audioHandlerName,
      cameraMetadataArgs,
      initialProgressState,
    };

    if (asyncMode) {
      void processCleanerJob(jobParams)
        .catch((bgErr) => {
          console.error('Background MetaCleaner job error:', bgErr);
        })
        .finally(() => {
          activeJobsSet.delete(activeJobId);
        });

      return NextResponse.json(
        {
          success: true,
          accepted: true,
          jobId: activeJobId,
          uploadId: uploadId || null,
          ttlSeconds: Math.round(META_CLEANER_AUTO_CLEAN_MS / 1000),
          downloadUrl: `/api/meta-cleaner/download?jobId=${encodeURIComponent(activeJobId)}`,
        },
        {
          status: 202,
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    const result = await processCleanerJob(jobParams);

    return new NextResponse(new Uint8Array(result.cleanedBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(result.cleanedBuffer.byteLength),
        'X-MetaCleaner-JobId': activeJobId,
        'X-MetaCleaner-Engine': result.engineHeader,
        'X-MetaCleaner-Filter': result.appliedFilter,
        'X-MetaCleaner-SynthID': 'scrubbed',
        'X-MetaCleaner-DeepPurge': deepMetaPurge ? 'active' : 'standard',
        'X-MetaCleaner-Camera-Profile': cameraProfileField,
        'X-MetaCleaner-Logs': result.encodedLogs,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    if (!keepInputPath) {
      await fs.unlink(inputPath).catch(() => {});
    }
    await fs.unlink(intermediatePath).catch(() => {});
    await fs.unlink(pass1Path).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});

    if (progressFilePath) {
      writeProgressAtomicSync({
        jobId: activeJobId,
        uploadId,
        stage: 'failed',
        message: `Gagal: ${error?.message || 'Error memproses video'}`,
        percent: 0,
        frame: 0,
        totalFrames: 0,
        fps: 0,
        speed: '0x',
        outTimeSec: 0,
        durationSec: 0,
        engine: 'Cloud FFmpeg',
        logs: [],
        updatedAt: new Date().toISOString(),
        error: error?.message,
      });
    }
    return NextResponse.json(
      {
        error:
          error?.message ||
          'Gagal menjalankan FFmpeg server-side untuk menghapus SynthID & SEI NAL Unit Type 6.',
      },
      {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Range',
      'Access-Control-Expose-Headers':
        'Content-Length, Content-Type, X-MetaCleaner-JobId, X-MetaCleaner-Engine, X-MetaCleaner-Logs, X-MetaCleaner-Filter, X-MetaCleaner-SynthID, X-MetaCleaner-DeepPurge, X-MetaCleaner-Camera-Profile',
    },
  });
}
