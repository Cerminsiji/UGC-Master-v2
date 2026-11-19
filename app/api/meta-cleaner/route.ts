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
  getProgressFilePath,
  getResultFilePath,
  readProgressSafe,
  sanitizeJobId,
  writeProgressAtomic,
  writeProgressAtomicSync,
} from '@/lib/meta-cleaner-progress';
import { resolveMediaBinary } from '@/lib/video-probe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const execFileAsync = promisify(execFile);

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
  const normalized = normalizeFfmpegArgs(args);
  const bin = resolveBinary('ffmpeg');

  return new Promise((resolve, reject) => {
    if (progressCtx?.state.jobId) {
      progressCtx.state.stage = progressCtx.stage;
      progressCtx.state.message = progressCtx.stageLabel;
      progressCtx.state.percent = progressCtx.startPct;
      writeProgressAtomicSync(progressCtx.state);
    }

    const proc = spawn(bin, normalized, { env: getExecEnv() });
    let stdout = '';
    let stderr = '';
    let lineBuf = '';
    let lastWrite = 0;

    const timer = setTimeout(() => {
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
        if (!line.startsWith('frame=')) continue;
        const fm = line.match(/frame=\s*(\d+)/);
        const fpm = line.match(/fps=\s*([\d.]+)/);
        const tm = line.match(/time=\s*(\d+:\d+:\d+(?:\.\d+)?)/);
        const sm = line.match(/speed=\s*([^\s]+)/);

        if (fm) progressCtx.state.frame = Number(fm[1]);
        if (fpm) progressCtx.state.fps = Number(fpm[1]);
        if (tm) progressCtx.state.outTimeSec = Number(parseClockTimeToSec(tm[1]).toFixed(2));
        if (sm) progressCtx.state.speed = sm[1];

        let ratio = 0;
        if (progressCtx.expectedDuration > 0.1 && progressCtx.state.outTimeSec > 0) {
          ratio = Math.min(1, progressCtx.state.outTimeSec / progressCtx.expectedDuration);
        } else if (progressCtx.expectedFrames > 0 && progressCtx.state.frame > 0) {
          ratio = Math.min(1, progressCtx.state.frame / progressCtx.expectedFrames);
        }
        const pct = Math.min(
          progressCtx.endPct,
          Math.max(
            progressCtx.startPct,
            Math.round(progressCtx.startPct + ratio * (progressCtx.endPct - progressCtx.startPct))
          )
        );
        progressCtx.state.percent = pct;
        progressCtx.state.message = `${progressCtx.stageLabel} (frame ${progressCtx.state.frame}${progressCtx.expectedFrames > 0 ? '/' + progressCtx.expectedFrames : ''} • ${progressCtx.state.speed})`;

        const now = Date.now();
        if (now - lastWrite >= 240) {
          lastWrite = now;
          writeProgressAtomicSync(progressCtx.state);
        }
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (progressCtx?.state.jobId) {
        progressCtx.state.percent = progressCtx.endPct;
        writeProgressAtomicSync(progressCtx.state);
      }
      if (code === 0) {
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
): Promise<{ success: boolean; output_path?: string; size_bytes?: number; logs: string[]; error?: string }> {
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
        logs: ['[PYTHON TIMEOUT] Proses FFmpeg Python melebihi batas waktu 240 detik.'],
        error: 'Python FFmpeg cleaner timeout',
      });
    }, 240000);

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

function buildSynthIdVideoFilter(width = 0, height = 0, upscale1080p = true): string {
  const [targetW, targetH] = computeTargetDimensions(width, height, upscale1080p);
  const scaleStep =
    targetW >= 64 && targetH >= 64
      ? `scale=${targetW}:${targetH}:flags=lanczos+accurate_rnd:in_color_matrix=auto:out_color_matrix=bt709:out_range=tv`
      : 'scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos+accurate_rnd:in_color_matrix=auto:out_color_matrix=bt709:out_range=tv';

  return [
    'setpts=0.961538*(PTS-STARTPTS)',
    'fps=30',
    'format=yuv420p',
    'lenscorrection=cx=0.498:cy=0.502:k1=-0.012:k2=0.003',
    "rotate=a='0.0019*sin(t*1.13)+0.0011*cos(t*2.71)+0.0006*sin(t*4.37)':bilinear=1:ow=iw:oh=ih",
    "crop=w=trunc(iw*0.970/2)*2:h=trunc(ih*0.970/2)*2:x='(iw-ow)/2+iw*(0.0014*sin(t*1.13)+0.0009*cos(t*2.71)+0.0005*sin(t*4.37))':y='(ih-oh)/2+ih*(0.0011*cos(t*0.97)+0.0007*sin(t*2.33)+0.0004*cos(t*3.89))'",
    scaleStep,
    'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv',
    'colorchannelmixer=rr=1.007:rg=-0.005:rb=-0.002:gr=-0.003:gg=1.005:gb=-0.002:br=-0.002:bg=-0.004:bb=1.006',
    "eq=contrast=1.012:brightness='0.0015*sin(t*0.83)+0.0009*cos(t*1.97)':saturation=1.012:gamma=1.006:eval=frame",
    'unsharp=3:3:0.16:3:3:0.0',
    'noise=c0s=2.1:c1s=0.9:c2s=0.9:allf=t',
    'setsar=1',
  ].join(',');
}

function buildSafeModeVideoFilter(width = 0, height = 0, upscale1080p = true): string {
  const [targetW, targetH] = computeTargetDimensions(width, height, upscale1080p);
  const scaleStep =
    targetW >= 64 && targetH >= 64
      ? `scale=${targetW}:${targetH}:flags=lanczos+accurate_rnd:in_color_matrix=auto:out_color_matrix=bt709:out_range=tv`
      : 'scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos+accurate_rnd:in_color_matrix=auto:out_color_matrix=bt709:out_range=tv';

  return [
    'setpts=PTS-STARTPTS',
    'fps=30',
    'format=yuv420p',
    "rotate=a='0.0015*sin(t*1.07)+0.0009*cos(t*2.57)+0.0005*sin(t*4.19)':bilinear=1:ow=iw:oh=ih",
    "crop=w=trunc(iw*0.976/2)*2:h=trunc(ih*0.976/2)*2:x='(iw-ow)/2+iw*(0.0011*sin(t*1.07)+0.0007*cos(t*2.57)+0.0004*sin(t*4.19))':y='(ih-oh)/2+ih*(0.0009*cos(t*0.89)+0.0006*sin(t*2.11)+0.0003*cos(t*3.67))'",
    scaleStep,
    'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv',
    'colorchannelmixer=rr=1.005:rg=-0.004:rb=-0.001:gr=-0.002:gg=1.004:gb=-0.002:br=-0.002:bg=-0.003:bb=1.005',
    "eq=contrast=1.010:brightness='0.0012*sin(t*0.79)+0.0008*cos(t*1.81)':saturation=1.010:gamma=1.005:eval=frame",
    'unsharp=3:3:0.14:3:3:0.0',
    'noise=c0s=1.9:c1s=0.8:c2s=0.8:allf=t',
    'setsar=1',
  ].join(',');
}

function buildUnifiedVideoFilter(width = 0, height = 0, durationSec = 0, upscale1080p = true): string {
  const trimPrefix = durationSec > 2.0 ? 'trim=start=0.06,setpts=0.988*(PTS-STARTPTS)' : 'setpts=0.988*(PTS-STARTPTS)';
  const [targetW, targetH] = computeTargetDimensions(width, height, upscale1080p);
  const scaleStep =
    targetW >= 64 && targetH >= 64
      ? `scale=${targetW}:${targetH}:flags=lanczos+accurate_rnd:in_color_matrix=auto:out_color_matrix=bt709:out_range=tv`
      : 'scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos+accurate_rnd:in_color_matrix=auto:out_color_matrix=bt709:out_range=tv';

  return [
    trimPrefix,
    'fps=30',
    'format=yuv420p',
    'lenscorrection=cx=0.498:cy=0.502:k1=-0.010:k2=0.003',
    "rotate=a='0.0018*sin(t*1.13)+0.0010*cos(t*2.71)+0.0005*sin(t*4.37)':bilinear=1:ow=iw:oh=ih",
    "crop=w=trunc(iw*0.972/2)*2:h=trunc(ih*0.972/2)*2:x='(iw-ow)/2+iw*(0.0013*sin(t*1.13)+0.0008*cos(t*2.71)+0.0004*sin(t*4.37))':y='(ih-oh)/2+ih*(0.0010*cos(t*0.97)+0.0007*sin(t*2.33)+0.0004*cos(t*3.89))'",
    scaleStep,
    'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv',
    'colorchannelmixer=rr=1.006:rg=-0.004:rb=-0.002:gr=-0.003:gg=1.004:gb=-0.001:br=-0.002:bg=-0.004:bb=1.006',
    "eq=contrast=1.012:brightness='0.0015*sin(t*0.83)+0.0009*cos(t*1.97)':saturation=1.012:gamma=1.006:eval=frame",
    'unsharp=3:3:0.15:3:3:0.0',
    'noise=c0s=2.0:c1s=0.9:c2s=0.9:allf=t',
    'setsar=1',
  ].join(',');
}

/**
 * Multi-Domain Anti-SynthID & AI-TTS Audio Disruption Filtergraph v23:
 * - Natural pink+brown indoor room floor (-51dB) with zero leading/trailing digital silence cliffs
 * - Non-metallic pitch/tempo variation locked to video speed + smooth HF rolloff
 */
function buildSynthIdAudioFilterComplex(voiceLabel = '[0:a]', outLabel = '[aout]'): string {
  return [
    'anoisesrc=color=pink:amplitude=0.014:sample_rate=48000:seed=104729[pL]',
    'anoisesrc=color=pink:amplitude=0.014:sample_rate=48000:seed=224737[pR]',
    'anoisesrc=color=brown:amplitude=0.007:sample_rate=48000:seed=319993[bRoom]',
    '[bRoom]lowpass=f=320,pan=stereo|c0=c0|c1=c0[bSt]',
    '[pL][pR]amerge=inputs=2,highpass=f=65,lowpass=f=15500,equalizer=f=450:t=q:w=0.8:g=-2.5[pinkSt]',
    '[pinkSt][bSt]amix=inputs=2:normalize=0,atrim=start=0.10,asetpts=PTS-STARTPTS,tremolo=f=0.27:d=0.12[room]',
    `${voiceLabel}asetpts=PTS-STARTPTS,aresample=48000:async=1:first_pts=0,aformat=channel_layouts=stereo,asetrate=48000*0.990,aresample=48000,atempo=1.0505,highpass=f=75,equalizer=f=210:t=q:w=1.0:g=0.9,equalizer=f=3100:t=q:w=1.4:g=-0.7,aexciter=level_in=1:level_out=1:amount=1.25:drive=2.5:blend=0:freq=7600:ceil=18800,aecho=0.96:0.94:11:0.022,extrastereo=m=1.14,acompressor=threshold=-20dB:ratio=1.8:attack=10:release=130:makeup=1.5dB,apad=pad_dur=0.25[voice]`,
    `[voice][room]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95,atrim=start=0.02,asetpts=PTS-STARTPTS${outLabel}`,
  ].join(';');
}

function buildSafeModeAudioFilterComplex(voiceLabel = '[0:a]', outLabel = '[aout]'): string {
  return [
    'anoisesrc=color=pink:amplitude=0.014:sample_rate=48000:seed=104729[pL]',
    'anoisesrc=color=pink:amplitude=0.014:sample_rate=48000:seed=224737[pR]',
    'anoisesrc=color=brown:amplitude=0.007:sample_rate=48000:seed=319993[bRoom]',
    '[bRoom]lowpass=f=320,pan=stereo|c0=c0|c1=c0[bSt]',
    '[pL][pR]amerge=inputs=2,highpass=f=65,lowpass=f=15500,equalizer=f=450:t=q:w=0.8:g=-2.5[pinkSt]',
    '[pinkSt][bSt]amix=inputs=2:normalize=0,atrim=start=0.10,asetpts=PTS-STARTPTS,tremolo=f=0.27:d=0.12[room]',
    `${voiceLabel}asetpts=PTS-STARTPTS,aresample=48000:async=1:first_pts=0,aformat=channel_layouts=stereo,asetrate=48000*0.992,aresample=48000,atempo=1.00806,highpass=f=75,equalizer=f=210:t=q:w=1.0:g=0.9,equalizer=f=3100:t=q:w=1.4:g=-0.7,aexciter=level_in=1:level_out=1:amount=1.20:drive=2.4:blend=0:freq=7600:ceil=18800,aecho=0.96:0.94:11:0.020,extrastereo=m=1.12,acompressor=threshold=-20dB:ratio=1.8:attack=10:release=130:makeup=1.5dB,apad=pad_dur=0.25[voice]`,
    `[voice][room]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95,atrim=start=0.02,asetpts=PTS-STARTPTS${outLabel}`,
  ].join(';');
}

function buildUnifiedAudioFilterComplex(voiceLabel = '[0:a]', outLabel = '[aout]', durationSec = 0): string {
  const atrimPrefix = durationSec > 2.0 ? 'atrim=start=0.04,asetpts=PTS-STARTPTS,' : 'asetpts=PTS-STARTPTS,';
  return [
    'anoisesrc=color=pink:amplitude=0.014:sample_rate=48000:seed=104729[pL]',
    'anoisesrc=color=pink:amplitude=0.014:sample_rate=48000:seed=224737[pR]',
    'anoisesrc=color=brown:amplitude=0.007:sample_rate=48000:seed=319993[bRoom]',
    '[bRoom]lowpass=f=320,pan=stereo|c0=c0|c1=c0[bSt]',
    '[pL][pR]amerge=inputs=2,highpass=f=65,lowpass=f=15500,equalizer=f=450:t=q:w=0.8:g=-2.5[pinkSt]',
    '[pinkSt][bSt]amix=inputs=2:normalize=0,atrim=start=0.10,asetpts=PTS-STARTPTS,tremolo=f=0.27:d=0.12[room]',
    `${voiceLabel}${atrimPrefix}aresample=48000:async=1:first_pts=0,aformat=channel_layouts=stereo,asetrate=48000*0.992,aresample=48000,atempo=1.0203,highpass=f=75,equalizer=f=210:t=q:w=1.0:g=0.9,equalizer=f=3100:t=q:w=1.4:g=-0.7,aexciter=level_in=1:level_out=1:amount=1.25:drive=2.5:blend=0:freq=7600:ceil=18800,aecho=0.96:0.94:11:0.022,extrastereo=m=1.14,acompressor=threshold=-20dB:ratio=1.8:attack=10:release=130:makeup=1.5dB,apad=pad_dur=0.25[voice]`,
    `[voice][room]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95,atrim=start=0.02,asetpts=PTS-STARTPTS${outLabel}`,
  ].join(';');
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

interface CleanerJobParams {
  activeJobId: string;
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
}

async function persistCleanedResultForDownload(jobId: string, cleanedBuffer: Buffer): Promise<string> {
  const resultPath = getResultFilePath(jobId);
  await fs.writeFile(resultPath, cleanedBuffer);
  setTimeout(() => {
    fs.unlink(resultPath).catch(() => {});
  }, 20 * 60 * 1000);
  return `/api/meta-cleaner/download?jobId=${encodeURIComponent(jobId)}`;
}

async function processCleanerJob(params: CleanerJobParams): Promise<CleanerJobResult> {
  const {
    activeJobId,
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

      if (pyResult?.success && fsSync.existsSync(outputPath)) {
        const statPy = await fs.stat(outputPath).catch(() => null);
        if (statPy && statPy.size > 16384) {
          const rawCleanedBuffer = await fs.readFile(outputPath);
          const cleanedBuffer = neutralizeContainerMetadataInPlace(rawCleanedBuffer);
          const downloadUrl = await persistCleanedResultForDownload(activeJobId, cleanedBuffer);
          const appliedFilter = 'strict_frame_by_frame_synthid_scrub + zero_sei';

          const existingPyProgress = await readProgressSafe(activeJobId);
          await writeProgressAtomic({
            ...(existingPyProgress || nodeProgressState),
            stage: 'completed',
            percent: 100,
            outputSizeBytes: cleanedBuffer.byteLength,
            downloadUrl,
            appliedFilter,
            logs: Array.isArray(pyResult.logs) ? pyResult.logs : existingPyProgress?.logs || [],
            message: `Selesai 100% (${(cleanedBuffer.byteLength / (1024 * 1024)).toFixed(2)} MB) via Cloud Python FFmpeg`,
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
            downloadUrl,
          };
        }
      }
    } catch (pyErr) {
      console.warn('Cloud Python FFmpeg cleaner initial attempt error:', pyErr);
    }

    const serverLogs: string[] = [];
    let sourceForSeiStrip = inputPath;
    let synthIdScrubbed = false;
    nodeProgressState.engine = 'Cloud Node.js FFmpeg Wrapper';
    nodeProgressState.stage = 'probing';
    nodeProgressState.percent = 8;
    nodeProgressState.message = 'Beralih ke Cloud Node.js FFmpeg Wrapper & ffprobe...';
    await writeProgressAtomic(nodeProgressState);

    const isAllInOne = cleanerMode === 'all_in_one';
    const isSafeMode = cleanerMode === 'safe_mode';
    const isTemporalCfrMode = isAllInOne || cleanerMode === 'safe_mode' || cleanerMode === 'unified';
    const effectiveForceKeyframes = forceKeyframeInsertion && !isTemporalCfrMode;
    let skipPass2 = false;
    let allInOneCommandDisplay = '';
    let allInOneAppliedFilter = '';

    let probedDurationSec = 0;
    let probedFrames = 0;
    try {
      const { stdout: durOut } = await runFfprobe([
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        inputPath,
      ]);
      probedDurationSec = Number(durOut?.trim()) || 0;
      if (probedDurationSec > 0) {
        const fpsScale = isTemporalCfrMode ? 0.988 : 0.9615;
        probedFrames = Math.max(1, Math.round(probedDurationSec * fpsScale * 30.0));
        nodeProgressState.durationSec = Number(probedDurationSec.toFixed(2));
        nodeProgressState.totalFrames = probedFrames;
      }
    } catch {}

    // Detect if input has an audio stream (dual ffprobe + ffmpeg header detection)
    let hasAudio = false;
    try {
      const { stdout: audioProbeOut } = await runFfprobe([
        '-v',
        'error',
        '-select_streams',
        'a',
        '-show_entries',
        'stream=codec_name',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        inputPath,
      ]);
      hasAudio = Boolean(audioProbeOut && audioProbeOut.trim().length > 0);
    } catch {}

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

    const keyframeInsertionFlags = [
      '-g',
      '60',
      '-keyint_min',
      '15',
      '-sc_threshold',
      '40',
      '-refs',
      '2',
      '-color_primaries',
      'bt709',
      '-color_trc',
      'bt709',
      '-colorspace',
      'bt709',
      '-color_range',
      'tv',
    ];

    const x264ParamString =
      'ref=2:bframes=2:b-adapt=1:b-pyramid=normal:weightp=1:psy-rd=1.05,0.10:aq-mode=2:nal-hrd=none:force-cfr=1:deblock=0,0:open-gop=0:scenecut=40:keyint=60:min-keyint=15';

    const movflagsStr = '+faststart';

    // STEP 1: All-in-One Single Pipeline OR Two-Pass Re-Encode (Unified / Safe Mode / Deep Anti-SynthID)
    if (isAllInOne || cleanerMode === 'unified' || cleanerMode === 'deep_synthid' || cleanerMode === 'safe_mode') {
      let vidW = 0;
      let vidH = 0;
      try {
        const { stdout: dimOut } = await runFfprobe([
          '-v',
          'error',
          '-select_streams',
          'v:0',
          '-show_entries',
          'stream=width,height',
          '-of',
          'csv=p=0:s=x',
          inputPath,
        ]);
        const parts = (dimOut || '').trim().split('x');
        if (parts.length === 2) {
          vidW = Math.floor(Number(parts[0]) / 2) * 2;
          vidH = Math.floor(Number(parts[1]) / 2) * 2;
        }
      } catch {}
      const shouldUpscale = upscale1080p && cameraProfileField !== 'neutral';
      const dynamicSynthIdVideoFilter =
        isAllInOne || cleanerMode === 'unified'
          ? buildUnifiedVideoFilter(vidW, vidH, probedDurationSec, shouldUpscale)
          : isSafeMode
            ? buildSafeModeVideoFilter(vidW, vidH, shouldUpscale)
            : buildSynthIdVideoFilter(vidW, vidH, shouldUpscale);
      const encodePreset = probedDurationSec > 25 ? 'superfast' : 'veryfast';

      if (isAllInOne) {
        serverLogs.push(
          `[ALL-IN-ONE SINGLE PIPELINE V 2.0] Native 30fps + Sub-Pixel Quasi-Aperiodic Drift + Gaussian CMOS Grain + Zero-Silence Pink/Brown Room + Zero-Tombstone MP4 (${cameraProfileField.toUpperCase()})...`
        );

        const langTag = cameraProfileField === 'neutral' ? 'und' : 'eng';
        const fullAudioVisualFilterComplex = `[0:v]${dynamicSynthIdVideoFilter}[vout];${buildUnifiedAudioFilterComplex('[0:a]', '[aout]', probedDurationSec)}`;
        const aioCommonTail = [
          '-dn',
          '-sn',
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
          '18',
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
          '160k',
          '-ar',
          '48000',
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
          '-movflags',
          movflagsStr,
          '-shortest',
          outputPath,
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
          '-movflags',
          movflagsStr,
          outputPath,
        ];

        let aioDone = false;
        if (hasAudio) {
          try {
            await runFfmpegWithProgress(aioWithAudioArgs, 180000, {
              state: nodeProgressState,
              stage: 'pass1_reencode',
              stageLabel: 'All-in-One V 2.0 (Node): 30fps Native + Sub-Pixel Drift + Gaussian Grain + Zero-Silence Audio',
              startPct: 10,
              endPct: 94,
              expectedDuration: probedDurationSec * 0.988,
              expectedFrames: Math.max(1, Math.round(probedDurationSec * 0.988 * 30.0)),
            });
            const statAio = await fs.stat(outputPath).catch(() => null);
            if (statAio && statAio.size > 16384) {
              aioDone = true;
              skipPass2 = true;
              synthIdScrubbed = true;
              allInOneAppliedFilter = 'all_in_one_chained_pipeline (safe_cfr + deep_5layer_synthid + zero_sei_faststart)';
              allInOneCommandDisplay = `ffmpeg -y -i "${originalName}" -filter_complex "[vout]+[aout]" -fps_mode cfr -c:v libx264 -preset ${encodePreset} -crf 18 -bf 2 -bsf:v filter_units=remove_types=6 -dn -sn -map_metadata -1 -write_tmcd 0 -brand ${cameraBrand} -movflags +faststart output_bersih.mp4`;
              serverLogs.push(
                '✓ [ALL-IN-ONE SELESAI] Safe CFR + Deep Anti-SynthID + Zero-SEI (Type 6) + Faststart selesai dalam 1 eksekusi pipeline.'
              );
            }
          } catch (audioErr: any) {
            serverLogs.push(
              `[AUDIO ENCODE INFO] Audio stream layout tidak standar, beralih ke video-only All-in-One: ${audioErr?.message?.split('\n')[0] || ''}`
            );
          }
        }

        if (!aioDone) {
          try {
            await runFfmpegWithProgress(aioVideoOnlyArgs, 180000, {
              state: nodeProgressState,
              stage: 'pass1_reencode',
              stageLabel: 'All-in-One Pipeline (Node): Safe CFR + Anti-SynthID + Zero-SEI (Video)',
              startPct: 10,
              endPct: 94,
              expectedDuration: probedDurationSec,
              expectedFrames: Math.max(1, Math.round(probedDurationSec * 29.97)),
            });
            const statAioV = await fs.stat(outputPath).catch(() => null);
            if (statAioV && statAioV.size > 16384) {
              aioDone = true;
              skipPass2 = true;
              synthIdScrubbed = true;
              allInOneAppliedFilter = 'all_in_one_chained_pipeline_video (safe_cfr + deep_5layer_synthid + zero_sei_faststart)';
              allInOneCommandDisplay = `ffmpeg -y -i "${originalName}" -vf "..." -fps_mode cfr -c:v libx264 -preset ${encodePreset} -crf 18 -bf 2 -bsf:v filter_units=remove_types=6 -dn -sn -map_metadata -1 -write_tmcd 0 -brand ${cameraBrand} -movflags +faststart output_bersih.mp4`;
              serverLogs.push(
                '✓ [ALL-IN-ONE VIDEO SELESAI] Safe CFR + Deep Anti-SynthID + Zero-SEI selesai dalam 1 command pipeline.'
              );
            }
          } catch (vErr: any) {
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
          isTemporalCfrMode ? '18' : '19',
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
            ? buildUnifiedAudioFilterComplex('[0:a]', '[aout]', probedDurationSec)
            : isSafeMode
              ? buildSafeModeAudioFilterComplex('[0:a]', '[aout]')
              : buildSynthIdAudioFilterComplex('[0:a]', '[aout]')
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
              '18',
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
              '160k',
              '-ar',
              '48000',
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
            const ptsScale = isTemporalCfrMode ? 0.988 : 0.961538;
            if (hasAudio) {
              try {
                await runFfmpegWithProgress(pass1WithAudioArgs, 180000, {
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
                  expectedDuration: probedDurationSec * ptsScale,
                  expectedFrames: Math.max(1, Math.round(probedDurationSec * ptsScale * 30.0)),
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
            serverLogs.push(
              `[AUDIO ENCODE INFO] Audio stream layout tidak standar, beralih ke video-only re-encode: ${audioErr?.message?.split('\n')[0] || ''}`
            );
          }
        }

        if (!reencodeDone) {
          try {
            await runFfmpegWithProgress(pass1VideoOnlyArgs, 180000, {
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
              expectedDuration: probedDurationSec * ptsScale,
              expectedFrames: Math.max(1, Math.round(probedDurationSec * ptsScale * 29.97)),
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
        await runFfmpegWithProgress(keyframeArgs, 180000, {
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
        const { stderr } = await runFfmpegWithProgress(primaryArgs, 60000, {
          state: nodeProgressState,
          stage: 'pass2_remux',
          stageLabel: 'Pass 2/2 (Node FFmpeg): Zero-SEI Remux & Hardware OEM Stamping',
          startPct: 84,
          endPct: 94,
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

        await runFfmpeg(fallbackArgs, 60000);
        appliedFilter = '-c copy -dn -sn -map_metadata -1 -fflags +bitexact';
      }
    }

    const rawCleanedBuffer = await fs.readFile(outputPath);

    if (rawCleanedBuffer.byteLength < 16384) {
      throw new Error('Output video terlalu kecil atau gagal diremux.');
    }

    // Neutralize any residual udta, meta, ilst, or uuid boxes created by FFmpeg in-place into safe free padding
    nodeProgressState.stage = 'binary_sanitize';
    nodeProgressState.percent = 97;
    nodeProgressState.message = 'Eksisi box C2PA/UUID & finalisasi container MP4...';
    await writeProgressAtomic(nodeProgressState);

    const cleanedBuffer = neutralizeContainerMetadataInPlace(rawCleanedBuffer);
    const downloadUrl = await persistCleanedResultForDownload(activeJobId, cleanedBuffer);

    nodeProgressState.stage = 'completed';
    nodeProgressState.percent = 100;
    nodeProgressState.outputSizeBytes = cleanedBuffer.byteLength;
    nodeProgressState.downloadUrl = downloadUrl;
    nodeProgressState.appliedFilter = appliedFilter;
    nodeProgressState.logs = serverLogs;
    nodeProgressState.message = `Selesai 100% (${(cleanedBuffer.byteLength / (1024 * 1024)).toFixed(2)} MB) via Cloud Node.js FFmpeg`;
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
      downloadUrl,
    };
  } catch (error: any) {
    if (progressFilePath) {
      writeProgressAtomicSync({
        jobId: activeJobId,
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
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(intermediatePath).catch(() => {});
    await fs.unlink(pass1Path).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
    if (progressFilePath) {
      const targetProgress = progressFilePath;
      setTimeout(() => {
        fs.unlink(targetProgress).catch(() => {});
      }, 5 * 60 * 1000);
    }
  }
}

export async function POST(req: NextRequest) {
  const sessionId = crypto.randomUUID();
  const tmpDir = os.tmpdir();
  let inputPath = path.join(tmpDir, `metacleaner_in_${sessionId}.mp4`);
  const intermediatePath = path.join(tmpDir, `intermediate_${sessionId}.h264`);
  const pass1Path = path.join(tmpDir, `metacleaner_pass1_${sessionId}.mp4`);
  const outputPath = path.join(tmpDir, `metacleaner_out_${sessionId}.mp4`);

  const urlJobId = sanitizeJobId(req.nextUrl?.searchParams?.get('jobId'));
  let activeJobId = urlJobId || sanitizeJobId(sessionId);
  let progressFilePath: string | undefined;

  try {
    const contentType = req.headers.get('content-type') || '';
    let inputBuffer: Buffer;
    let originalName = 'input.mp4';
    let cleanerMode: 'all_in_one' | 'unified' | 'deep_synthid' | 'safe_mode' | 'remux_only' = 'all_in_one';
    let deepMetaPurge = true;
    let forceKeyframeInsertion = true;
    let upscale1080p = true;
    let asyncMode = false;
    let cameraProfileField = 'samsung';
    let cameraBrand = 'mp42';
    let videoHandlerName = 'VideoHandle';
    let audioHandlerName = 'SoundHandle';
    const cameraMetadataArgs: string[] = [];

    if (contentType.includes('multipart/form-data')) {
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
      const ext =
        (originalName.split('.').pop() || 'mp4')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '') || 'mp4';
      inputPath = path.join(tmpDir, `metacleaner_in_${sessionId}.${ext}`);
      const arrayBuffer = await file.arrayBuffer();
      inputBuffer = Buffer.from(arrayBuffer);

      if (cameraProfileField === 'apple') {
        cameraBrand = 'mp42';
        videoHandlerName = 'Core Media Video';
        audioHandlerName = 'Core Media Audio';
      } else if (cameraProfileField === 'xiaomi') {
        cameraBrand = 'mp42';
        videoHandlerName = 'VideoHandler';
        audioHandlerName = 'SoundHandler';
      } else if (cameraProfileField === 'neutral') {
        cameraBrand = 'isom';
        videoHandlerName = 'VideoHandler';
        audioHandlerName = 'SoundHandler';
      } else {
        cameraBrand = 'mp42';
        videoHandlerName = 'VideoHandle';
        audioHandlerName = 'SoundHandle';
      }
    } else {
      const arrayBuffer = await req.arrayBuffer();
      inputBuffer = Buffer.from(arrayBuffer);
    }

    if (!inputBuffer || inputBuffer.byteLength < 1024) {
      return NextResponse.json(
        { error: 'Buffer video tidak valid atau terlalu kecil.' },
        { status: 400 }
      );
    }

    await fs.writeFile(inputPath, inputBuffer);

    progressFilePath = getProgressFilePath(activeJobId);
    const initialProgressState: CleanerProgressState = {
      jobId: activeJobId,
      stage: 'probing',
      message: 'Menginisialisasi Cloud Python FFmpeg Wrapper...',
      percent: 3,
      frame: 0,
      totalFrames: 0,
      fps: 0,
      speed: '0x',
      outTimeSec: 0,
      durationSec: 0,
      engine: 'Cloud Python FFmpeg Wrapper',
      logs: [],
      updatedAt: new Date().toISOString(),
    };
    await writeProgressAtomic(initialProgressState);

    const jobParams: CleanerJobParams = {
      activeJobId,
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
      cameraProfileField,
      cameraBrand,
      videoHandlerName,
      audioHandlerName,
      cameraMetadataArgs,
      initialProgressState,
    };

    if (asyncMode) {
      void processCleanerJob(jobParams).catch((bgErr) => {
        console.error('Background MetaCleaner job error:', bgErr);
      });

      return NextResponse.json(
        {
          success: true,
          accepted: true,
          jobId: activeJobId,
          downloadUrl: `/api/meta-cleaner/download?jobId=${encodeURIComponent(activeJobId)}`,
        },
        {
          status: 202,
          headers: {
            'Cache-Control': 'no-store',
            'Access-Control-Allow-Origin': '*',
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
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Expose-Headers':
          'Content-Length, Content-Type, X-MetaCleaner-JobId, X-MetaCleaner-Engine, X-MetaCleaner-Logs, X-MetaCleaner-Filter, X-MetaCleaner-SynthID, X-MetaCleaner-DeepPurge, X-MetaCleaner-Camera-Profile',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(intermediatePath).catch(() => {});
    await fs.unlink(pass1Path).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});

    if (progressFilePath) {
      writeProgressAtomicSync({
        jobId: activeJobId,
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
