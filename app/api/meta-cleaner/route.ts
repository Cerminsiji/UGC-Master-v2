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
  readProgressSafe,
  sanitizeJobId,
  writeProgressAtomic,
  writeProgressAtomicSync,
} from '@/lib/meta-cleaner-progress';
import { resolveMediaBinary } from '@/lib/video-probe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

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
        logs: ['[PYTHON TIMEOUT] Proses FFmpeg Python melebihi batas waktu 115 detik.'],
        error: 'Python FFmpeg cleaner timeout',
      });
    }, 115000);

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

/**
 * Multi-Domain Anti-SynthID Pixel Watermark Disruption Filtergraph:
 * - Temporal phase & cadence desynchronization (0.992x PTS shift + tmix + 29.97fps camera rate)
 * - 3D Spatiotemporal denoiser (hqdn3d) attenuating spread-spectrum watermark carriers
 * - Non-linear radial optical distortion (lenscorrection) + micro-rotation (rotate) + crop + Lanczos rescale
 * - Cross-plane chroma shift (chromashift) + hue/gamma remapping + camera sensor grain (noise)
 */
function buildSynthIdVideoFilter(width = 0, height = 0): string {
  const hasExplicitDims = width >= 64 && height >= 64;
  const targetW = hasExplicitDims ? Math.floor(width / 2) * 2 : 0;
  const targetH = hasExplicitDims ? Math.floor(height / 2) * 2 : 0;
  const preScale = hasExplicitDims
    ? []
    : ['scale=trunc(iw*1.05/2)*2:trunc(ih*1.05/2)*2:flags=bicubic'];
  const scaleStep = hasExplicitDims
    ? `scale=${targetW}:${targetH}:flags=lanczos+accurate_rnd`
    : 'scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos+accurate_rnd';

  return [
    'setpts=0.961538*(PTS-STARTPTS)',
    'fps=fps=30000/1001',
    'format=yuv420p',
    'hqdn3d=1.8:1.4:2.8:2.0',
    ...preScale,
    'lenscorrection=cx=0.495:cy=0.505:k1=-0.028:k2=0.009',
    'rotate=0.009:ow=iw:oh=ih:bilinear=1',
    'crop=trunc(iw*0.95/2)*2:trunc(ih*0.95/2)*2:trunc(iw*0.024)+trunc(1.8*sin(t*1.9)):trunc(ih*0.024)+trunc(1.8*cos(t*1.4))',
    scaleStep,
    'chromashift=cbh=1:cbv=0:crh=-1:crv=0',
    'colorchannelmixer=rr=1.014:rg=-0.011:rb=-0.003:gr=-0.007:gg=1.009:gb=-0.002:br=-0.004:bg=-0.009:bb=1.013',
    'eq=contrast=1.025:brightness=-0.003:saturation=1.02:gamma=1.015',
    'unsharp=5:5:0.42:3:3:0.15',
    'vignette=angle=PI/7',
    'noise=c0s=4.5:c1s=2.6:c2s=2.6:allf=t+u',
    'setsar=1',
  ].join(',');
}

/**
 * Multi-Domain Anti-SynthID & AI-TTS Audio Disruption Filtergraph:
 * - True dual-seed uncorrelated pink room ambiance (no static white hiss, healthy 0.38Hz breathing floor)
 * - Synced rubberband pitch/formant & 1.04x tempo matching video 0.961538x PTS shift
 * - Requires -cutoff 20200 during AAC encoding to prevent vocoder-style >16kHz spectral cliffs
 */
function buildSynthIdAudioFilterComplex(voiceLabel = '[0:a]', outLabel = '[aout]'): string {
  return [
    'anoisesrc=color=pink:amplitude=0.0014:sample_rate=48000:seed=104729[pL]',
    'anoisesrc=color=pink:amplitude=0.0014:sample_rate=48000:seed=224737[pR]',
    '[pL][pR]amerge=inputs=2,highpass=f=160,lowpass=f=10000,equalizer=f=450:t=q:w=0.7:g=-5[room_lo]',
    'anoisesrc=color=white:amplitude=0.0128:sample_rate=48000:seed=319993[aL]',
    'anoisesrc=color=white:amplitude=0.0128:sample_rate=48000:seed=492871[aR]',
    '[aL][aR]amerge=inputs=2,highpass=f=13900,highpass=f=13900,lowpass=f=20400[room_hi]',
    '[room_lo][room_hi]amix=inputs=2:normalize=0,tremolo=f=0.38:d=0.20,volume=0.85[room]',
    `${voiceLabel}asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,afftdn=nr=11:nf=-36:tn=1,rubberband=tempo=1.04:pitch=0.966:formant=shifted,highpass=f=65,equalizer=f=185:t=q:w=1.0:g=1.4,equalizer=f=3400:t=q:w=1.2:g=-1.1,highshelf=f=9500:g=0.8,aecho=0.94:0.90:15|26:0.045|0.025,extrastereo=m=1.28,asoftclip=type=tanh:threshold=0.92,acompressor=threshold=-26dB:ratio=2.6:attack=8:release=120,asplit=2[vdry][ver_in]`,
    '[ver_in]highpass=f=280,lowpass=f=4800,adelay=8|19,volume=0.13[ver]',
    '[vdry][ver]amix=inputs=2:normalize=0[voice]',
    `[voice][room]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95${outLabel}`,
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
  '-metadata',
  'encoder=',
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
  '-metadata',
  'encoder=',
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

function neutralizeContainerMetadataInPlace(buf: Buffer): Buffer {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const decoder = new TextDecoder('ascii', { fatal: false });
  const macEpochNow = Math.floor(Date.now() / 1000) + 2082844800 - 1860;
  const badMarkers = [
    'c2pa',
    'jumb',
    'synthid',
    'trainedalgorithmicmedia',
    'google',
    'iso media file produced by',
    'created on:',
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

  // 1. Recursive box neutralization + ftyp/timestamp authenticity normalization
  const sanitizeRecursively = (start: number, end: number, depth: number) => {
    if (depth > 7) return;
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
            view.setUint32(offset + hdr + 4, macEpochNow >>> 0, false);
            view.setUint32(offset + hdr + 8, macEpochNow >>> 0, false);
          }
        } else if (ver === 1 && offset + hdr + 20 <= offset + size) {
          const cHi = view.getUint32(offset + hdr + 4, false);
          const cLo = view.getUint32(offset + hdr + 8, false);
          if (cHi === 0 && cLo === 0) {
            view.setUint32(offset + hdr + 4, 0, false);
            view.setUint32(offset + hdr + 8, macEpochNow >>> 0, false);
            view.setUint32(offset + hdr + 12, 0, false);
            view.setUint32(offset + hdr + 16, macEpochNow >>> 0, false);
          }
        }
      } else if (['uuid', 'c2pa', 'jumb', 'c2ma', 'c2cl', 'XMP_'].includes(type)) {
        buf[offset + 4] = 0x66; // 'f'
        buf[offset + 5] = 0x72; // 'r'
        buf[offset + 6] = 0x65; // 'e'
        buf[offset + 7] = 0x65; // 'e'
        buf.fill(0x00, offset + hdr, offset + size);
      } else if (['udta', 'meta', 'ilst', '©too', '©enc'].includes(type)) {
        const payload = decoder
          .decode(buf.subarray(offset + hdr, Math.min(offset + size, offset + 1024)))
          .toLowerCase();
        if (badMarkers.some((m) => payload.includes(m))) {
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
  return buf;
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
    let deepSynthIdMode = true;
    let deepMetaPurge = true;
    let forceKeyframeInsertion = true;
    let cameraProfileField = 'samsung';
    let cameraBrand = 'mp42';
    let videoHandlerName = 'VideoHandle';
    let audioHandlerName = 'SoundHandle';
    let cameraMetadataArgs: string[] = ['-metadata', 'make=samsung', '-metadata', 'model=SM-S928B'];

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      const modeField = formData.get('mode');
      const purgeField = formData.get('deepMetaPurge');
      const forceKeyframeField = formData.get('forceKeyframeInsertion');
      const formJobId = sanitizeJobId(formData.get('jobId') as string | null);
      if (formJobId) {
        activeJobId = formJobId;
      }
      cameraProfileField = (formData.get('cameraProfile') as string) || 'samsung';
      if (modeField === 'remux_only') {
        deepSynthIdMode = false;
      }
      if (purgeField === 'false') {
        deepMetaPurge = false;
      }
      if (forceKeyframeField === 'false') {
        forceKeyframeInsertion = false;
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
        cameraMetadataArgs = [
          '-metadata',
          'make=Apple',
          '-metadata',
          'model=iPhone 15 Pro',
          '-metadata',
          'software=17.5.1',
        ];
      } else if (cameraProfileField === 'xiaomi') {
        cameraBrand = 'mp42';
        videoHandlerName = 'VideoHandler';
        audioHandlerName = 'SoundHandler';
        cameraMetadataArgs = ['-metadata', 'make=Xiaomi', '-metadata', 'model=Xiaomi 14 Ultra'];
      } else if (cameraProfileField === 'neutral') {
        cameraBrand = 'isom';
        videoHandlerName = 'VideoHandler';
        audioHandlerName = 'SoundHandler';
        cameraMetadataArgs = [];
      } else {
        cameraBrand = 'mp42';
        videoHandlerName = 'VideoHandle';
        audioHandlerName = 'SoundHandle';
        cameraMetadataArgs = ['-metadata', 'make=samsung', '-metadata', 'model=SM-S928B'];
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
    const nodeProgressState: CleanerProgressState = {
      jobId: activeJobId,
      stage: 'probing',
      message: 'Menginisialisasi Cloud Python FFmpeg Wrapper...',
      percent: 2,
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
    await writeProgressAtomic(nodeProgressState);

    // PRIMARY CLOUD ENGINE: Cloud Python FFmpeg Wrapper with Strict Frame-by-Frame Filtering
    try {
      const pyResult = await runPythonCleaner(
        inputPath,
        outputPath,
        deepSynthIdMode ? 'deep_synthid' : 'remux_only',
        deepMetaPurge,
        forceKeyframeInsertion,
        cameraProfileField,
        activeJobId,
        progressFilePath
      );

      if (pyResult?.success && fsSync.existsSync(outputPath)) {
        const statPy = await fs.stat(outputPath).catch(() => null);
        if (statPy && statPy.size > 16384) {
          const rawCleanedBuffer = await fs.readFile(outputPath);
          const cleanedBuffer = neutralizeContainerMetadataInPlace(rawCleanedBuffer);

          const existingPyProgress = await readProgressSafe(activeJobId);
          await writeProgressAtomic({
            ...(existingPyProgress || nodeProgressState),
            stage: 'completed',
            percent: 100,
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

          return new NextResponse(new Uint8Array(cleanedBuffer), {
            status: 200,
            headers: {
              'Content-Type': 'video/mp4',
              'Content-Length': String(cleanedBuffer.byteLength),
              'X-MetaCleaner-JobId': activeJobId,
              'X-MetaCleaner-Engine': 'Cloud-Python-FFmpeg-FrameFilter',
              'X-MetaCleaner-Filter': 'strict_frame_by_frame_synthid_scrub + zero_sei',
              'X-MetaCleaner-SynthID': 'scrubbed',
              'X-MetaCleaner-DeepPurge': deepMetaPurge ? 'active' : 'standard',
              'X-MetaCleaner-Camera-Profile': cameraProfileField,
              'X-MetaCleaner-Logs': encodedLogs,
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
              'Access-Control-Expose-Headers':
                'Content-Length, Content-Type, X-MetaCleaner-JobId, X-MetaCleaner-Engine, X-MetaCleaner-Logs, X-MetaCleaner-Filter, X-MetaCleaner-SynthID, X-MetaCleaner-DeepPurge, X-MetaCleaner-Camera-Profile',
              'Cache-Control': 'no-store',
            },
          });
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
        probedFrames = Math.max(1, Math.round(probedDurationSec * 0.992 * 29.97));
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
      forceKeyframeInsertion ? '45' : '60',
      '-keyint_min',
      '20',
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
    ];

    const x264ParamString = forceKeyframeInsertion
      ? 'ref=2:bframes=2:b-adapt=1:nal-hrd=none:force-cfr=1:deblock=1,1:aq-mode=2:open-gop=0:scenecut=40:keyint=45:min-keyint=20'
      : 'ref=2:bframes=2:b-adapt=1:nal-hrd=none:force-cfr=1:deblock=1,1:aq-mode=2:open-gop=0:keyint=60:min-keyint=24';

    // STEP 1: Re-encode total video & audio without SEI (Anti-SynthID + Anti-TTS + Zero-SEI Bitstream Filter)
    if (deepSynthIdMode) {
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
      const dynamicSynthIdVideoFilter = buildSynthIdVideoFilter(vidW, vidH);
      const encodePreset = probedDurationSec > 25 || vidW * vidH > 1100000 ? 'superfast' : 'veryfast';

      serverLogs.push(
        forceKeyframeInsertion
          ? `[STEP 1/2 RE-ENCODE AUDIO-VISUAL v20] Re-sintesis 29.97fps Bebas-Ghost (bf=2, refs=2, -crf 19) + Rubberband Pitch/Formant + Dual-Seed Pink Room Air (-cutoff 20200)...`
          : `[STEP 1/2 RE-ENCODE AUDIO-VISUAL v20] Re-sintesis 29.97fps Bebas-Ghost + Rubberband + Dual-Seed Pink Room Air (-cutoff 20200)...`
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
        '19',
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
        '+bitexact',
        '-flags:v',
        '+bitexact',
        '-map_metadata',
        '-1',
        '-map_chapters',
        '-1',
        pass1Path,
      ];

      const fullAudioVisualFilterComplex = `[0:v]${dynamicSynthIdVideoFilter}[vout];${buildSynthIdAudioFilterComplex('[0:a]', '[aout]')}`;

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
        '19',
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
        '20500',
        '-metadata',
        'encoder=',
        ...cameraMetadataArgs,
        '-metadata:s:v:0',
        `handler_name=${videoHandlerName}`,
        '-metadata:s:a:0',
        `handler_name=${audioHandlerName}`,
        '-brand',
        cameraBrand,
        '-fflags',
        '+bitexact',
        '-flags:v',
        '+bitexact',
        '-flags:a',
        '+bitexact',
        '-map_metadata',
        '-1',
        '-map_chapters',
        '-1',
        pass1Path,
      ];

      let reencodeDone = false;
      if (hasAudio) {
        try {
          await runFfmpegWithProgress(pass1WithAudioArgs, 90000, {
            state: nodeProgressState,
            stage: 'pass1_reencode',
            stageLabel: 'Pass 1/2 (Node FFmpeg): Audio-Visual Anti-AI Filtering & B-Frame Synthesis',
            startPct: 10,
            endPct: 82,
            expectedDuration: probedDurationSec * 0.961538,
            expectedFrames: Math.max(1, Math.round(probedDurationSec * 0.961538 * 29.97)),
          });
          const stat1 = await fs.stat(pass1Path).catch(() => null);
          if (stat1 && stat1.size > 16384) {
            sourceForSeiStrip = pass1Path;
            synthIdScrubbed = true;
            reencodeDone = true;
            serverLogs.push(
              `✓ [STEP 1/2 AUDIO-VISUAL] Re-sintesis 29.97fps bebas ghost + Rubberband + Stereo Pink Room Air + 0% SEI Type 6 selesai.`
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
          await runFfmpegWithProgress(pass1VideoOnlyArgs, 90000, {
            state: nodeProgressState,
            stage: 'pass1_reencode',
            stageLabel: 'Pass 1/2 (Node FFmpeg): Filtering Frame-by-Frame Video-Only',
            startPct: 10,
            endPct: 82,
            expectedDuration: probedDurationSec * 0.961538,
            expectedFrames: Math.max(1, Math.round(probedDurationSec * 0.961538 * 29.97)),
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
    } else if (forceKeyframeInsertion) {
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
          'veryfast',
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
        await runFfmpegWithProgress(keyframeArgs, 90000, {
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

    // Substitute dynamically determined BSF argument and camera hardware OEM profile
    const activeStripFlags = baseStripFlags.map((flag, idx) => {
      if (baseStripFlags[idx - 1] === '-bsf:v') return dynamicBsfArg;
      if (baseStripFlags[idx - 1] === '-brand') return cameraBrand;
      if (baseStripFlags[idx - 1] === '-metadata:s:v:0') return `handler_name=${videoHandlerName}`;
      if (baseStripFlags[idx - 1] === '-metadata:s:a:0') return `handler_name=${audioHandlerName}`;
      return flag;
    });

    const displayCommand = deepMetaPurge
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
      ...(forceKeyframeInsertion && sourceForSeiStrip === inputPath ? ['-avoid_negative_ts', 'make_zero'] : []),
      ...activeStripFlags,
      ...cameraMetadataArgs,
      outputPath,
    ]);

    let remuxSuccess = false;
    let appliedFilter = deepMetaPurge
      ? `deep_meta_purge + -c copy -dn -sn -write_tmcd 0 -bsf:v ${dynamicBsfArg} -fflags +bitexact`
      : synthIdScrubbed
        ? `synthid_deep_scrub + -bsf:v ${dynamicBsfArg} -fflags +bitexact`
        : `-bsf:v ${dynamicBsfArg} -fflags +bitexact`;

    try {
      const { stderr } = await runFfmpegWithProgress(primaryArgs, 30000, {
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

    const rawCleanedBuffer = await fs.readFile(outputPath);

    if (rawCleanedBuffer.byteLength < 16384) {
      return NextResponse.json(
        { error: 'Output video terlalu kecil atau gagal diremux.' },
        {
          status: 500,
          headers: {
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // Neutralize any residual udta, meta, ilst, or uuid boxes created by FFmpeg in-place into safe free padding
    nodeProgressState.stage = 'binary_sanitize';
    nodeProgressState.percent = 97;
    nodeProgressState.message = 'Eksisi box C2PA/UUID & finalisasi container MP4...';
    await writeProgressAtomic(nodeProgressState);

    const cleanedBuffer = neutralizeContainerMetadataInPlace(rawCleanedBuffer);

    nodeProgressState.stage = 'completed';
    nodeProgressState.percent = 100;
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

    return new NextResponse(new Uint8Array(cleanedBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(cleanedBuffer.byteLength),
        'X-MetaCleaner-JobId': activeJobId,
        'X-MetaCleaner-Engine': deepMetaPurge
          ? 'server-ffmpeg-deep-meta-purge-bitexact'
          : 'server-ffmpeg-synthid-scrub-bitexact',
        'X-MetaCleaner-Filter': appliedFilter,
        'X-MetaCleaner-SynthID': 'scrubbed',
        'X-MetaCleaner-DeepPurge': deepMetaPurge ? 'active' : 'standard',
        'X-MetaCleaner-Camera-Profile': cameraProfileField,
        'X-MetaCleaner-Logs': encodedLogs,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Expose-Headers':
          'Content-Length, Content-Type, X-MetaCleaner-JobId, X-MetaCleaner-Engine, X-MetaCleaner-Logs, X-MetaCleaner-Filter, X-MetaCleaner-SynthID, X-MetaCleaner-DeepPurge, X-MetaCleaner-Camera-Profile',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
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
  } finally {
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(intermediatePath).catch(() => {});
    await fs.unlink(pass1Path).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
    if (progressFilePath) {
      const targetProgress = progressFilePath;
      setTimeout(() => {
        fs.unlink(targetProgress).catch(() => {});
      }, 60000);
    }
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
