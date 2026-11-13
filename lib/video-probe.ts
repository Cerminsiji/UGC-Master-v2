import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';

const execFileAsync = promisify(execFile);

export interface UuidClaimEntry {
  offset: number;
  size: number;
  uuidHex: string;
  parentPath: string;
  signatureMatches: string[];
}

export interface JumbfManifestEntry {
  boxType: string;
  offset: number;
  size: number;
  parentPath: string;
  signatureMatches: string[];
  previewAscii: string;
}

export interface VendorTagEntry {
  source: string;
  key: string;
  value: string;
  flagged: boolean;
}

export interface VisualAiForensics {
  fps: number;
  frameRateStr: string;
  hasBFrames: boolean;
  isAiFramerate: boolean;
  isZeroBFrames: boolean;
  lumaEntropyAvg: number;
  chromaUEntropyAvg: number;
  startTimeSec: number;
  refsCount: number;
  hasZeroCreationTime: boolean;
  hasFfmpegMuxerBrand: boolean;
  visualAiFlags: string[];
  visualClean: boolean;
}

export interface AudioAiForensics {
  hasAudio: boolean;
  sampleRateHz: number;
  channels: number;
  digitalSilenceCount: number;
  digitalSilenceSec: number;
  overallRmsDb: number;
  noiseFloorDb: number;
  lowBandRmsDb: number;
  highBand14kDb: number;
  highBand17kDb: number;
  airCliffDb: number;
  midRmsDb: number;
  sideRmsDb: number;
  stereoSideGapDb: number;
  audioAiFlags: string[];
  audioClean: boolean;
}

export interface AudioVisualForensicsReport {
  visual: VisualAiForensics;
  audio: AudioAiForensics;
  aiRiskScore: number;
  aiVerdict: 'CLEAN_ORGANIC' | 'SUSPICIOUS_SIGNALS' | 'HIGH_AI_RISK';
}

export interface ExternalProbeReport {
  probedAt: string;
  probeEngine: string;
  ffprobeBinary: string;
  fileSizeBytes: number;
  format: {
    formatName: string;
    majorBrand: string;
    minorVersion: string;
    compatibleBrands: string;
    durationSec: number;
    bitRate: number;
    nbStreams: number;
    tags: Record<string, string>;
  };
  videoStream: {
    codecName: string;
    profile: string;
    width: number;
    height: number;
    avgFrameRate: string;
    rFrameRate: string;
    pixFmt: string;
    nbFrames: number;
    hasBFrames: number;
    handlerName: string;
    tags: Record<string, string>;
  } | null;
  audioStream: {
    codecName: string;
    sampleRate: string;
    channels: number;
    handlerName: string;
    tags: Record<string, string>;
  } | null;
  seiReport: {
    totalSeiUnits: number;
    nalUnitType6Count: number;
    nalUnitType39Count: number;
    nalUnitType40Count: number;
    payloadTypes: number[];
    asciiTraces: string[];
    traceSamples: string[];
    traceMethod: string;
  };
  uuidClaims: UuidClaimEntry[];
  jumbfManifests: JumbfManifestEntry[];
  vendorTags: VendorTagEntry[];
  boxTreeSummary: Array<{ type: string; offset: number; size: number }>;
  audioVisualForensics: AudioVisualForensicsReport;
  cleanliness: {
    isZeroSei: boolean;
    isZeroUuid: boolean;
    isZeroJumbf: boolean;
    isZeroAiVendor: boolean;
    isVisualAiClean: boolean;
    isAudioAiClean: boolean;
    overallClean: boolean;
    flaggedReasons: string[];
  };
}

export function resolveMediaBinary(name: 'ffmpeg' | 'ffprobe'): string {
  const candidates: string[] = [];

  if (name === 'ffmpeg') {
    if (process.env.FFMPEG_PATH) candidates.push(process.env.FFMPEG_PATH);
    try {
      const staticFfmpeg = require('ffmpeg-static');
      const staticPath = typeof staticFfmpeg === 'string' ? staticFfmpeg : staticFfmpeg?.path;
      if (staticPath) candidates.push(staticPath);
    } catch {}
    try {
      const resolvedPkgDir = path.dirname(require.resolve('ffmpeg-static/package.json'));
      candidates.push(path.join(resolvedPkgDir, 'ffmpeg'));
    } catch {}
  } else {
    if (process.env.FFPROBE_PATH) candidates.push(process.env.FFPROBE_PATH);
    try {
      const staticProbe = require('ffprobe-static');
      const probePath = staticProbe?.path || (typeof staticProbe === 'string' ? staticProbe : null);
      if (probePath) candidates.push(probePath);
    } catch {}
    try {
      const resolvedPkgDir = path.dirname(require.resolve('ffprobe-static/package.json'));
      candidates.push(path.join(resolvedPkgDir, 'bin', process.platform, process.arch, 'ffprobe'));
    } catch {}
  }

  const roots = [
    process.cwd(),
    path.join(process.cwd(), '.next', 'standalone'),
    path.resolve(process.cwd(), '..', '..'),
    '/workspace',
    '/app/applet',
  ];

  for (const root of roots) {
    if (name === 'ffmpeg') {
      candidates.push(path.join(root, 'node_modules', 'ffmpeg-static', 'ffmpeg'));
    } else {
      candidates.push(
        path.join(root, 'node_modules', 'ffprobe-static', 'bin', process.platform, process.arch, 'ffprobe'),
        path.join(root, 'node_modules', 'ffprobe-static', 'bin', 'linux', 'x64', 'ffprobe')
      );
    }
  }

  candidates.push(`/usr/bin/${name}`, `/usr/local/bin/${name}`, `/bin/${name}`);

  for (const p of candidates) {
    if (!p) continue;
    try {
      if (fsSync.existsSync(p) && fsSync.statSync(p).isFile()) {
        try {
          fsSync.accessSync(p, fsSync.constants.X_OK);
        } catch {
          try {
            fsSync.chmodSync(p, 0o755);
          } catch {}
        }
        return p;
      }
    } catch {}
  }

  return name;
}

const STATIC_DIR_FFMPEG = path.join(process.cwd(), 'node_modules', 'ffmpeg-static');
const STATIC_DIR_FFPROBE = path.join(
  process.cwd(),
  'node_modules',
  'ffprobe-static',
  'bin',
  process.platform,
  process.arch
);

const EXEC_ENV = {
  ...process.env,
  PATH: `${STATIC_DIR_FFMPEG}:${STATIC_DIR_FFPROBE}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${process.env.PATH || ''}`,
};

const FLAGGED_KEYWORDS = [
  'synthid',
  'c2pa',
  'jumb',
  'trainedalgorithmicmedia',
  'veo',
  'sora',
  'kling',
  'runway',
  'pika',
  'luma',
  'hailuo',
  'midjourney',
  'deepmind',
  'google inc',
  'iso media file produced by',
  'created on:',
  'com.ai.generator',
  'ai-studio',
  'stable-video',
  'seedance',
  'elevenlabs',
  'lavf',
  'lavc',
  'x264 - core',
  'x264',
  'libx264',
  'ffmpeg',
  'libav',
  'shopee',
  's264',
  'garena',
  'live-tech',
  'd8fec3d3',
];

const C2PA_UUID_HEX_PREFIXES = ['d8fec3d3', '63327061', '6a756d62'];

const ISO_CONTAINER_BOXES = new Set([
  'moov',
  'trak',
  'mdia',
  'minf',
  'stbl',
  'edts',
  'dinf',
  'udta',
  'meta',
  'ilst',
]);

function extractAsciiKeywords(buf: Uint8Array, extraTargets: string[] = []): string[] {
  const text = new TextDecoder('ascii', { fatal: false }).decode(buf);
  const lower = text.toLowerCase();
  const hits: string[] = [];
  for (const kw of [...FLAGGED_KEYWORDS, ...extraTargets]) {
    if (lower.includes(kw.toLowerCase()) && !hits.includes(kw)) {
      hits.push(kw);
    }
  }
  return hits;
}

function sanitizeAsciiPreview(buf: Uint8Array, maxLen = 120): string {
  const slice = buf.subarray(0, Math.min(buf.length, maxLen));
  let out = '';
  for (let i = 0; i < slice.length; i++) {
    const ch = slice[i];
    if (ch >= 32 && ch <= 126) {
      out += String.fromCharCode(ch);
    } else if (out.length > 0 && !out.endsWith(' ')) {
      out += ' ';
    }
  }
  return out.trim();
}

async function runTraceHeadersStream(
  ffmpegBin: string,
  filePath: string,
  codecName: string
): Promise<{
  seiCount: number;
  type6Count: number;
  type39Count: number;
  type40Count: number;
  payloadTypes: number[];
  traceAsciiStrings: string[];
  traceSamples: string[];
}> {
  return new Promise((resolve) => {
    let seiCount = 0;
    let type6Count = 0;
    let type39Count = 0;
    let type40Count = 0;
    const payloadTypeSet = new Set<number>();
    const traceSamples: string[] = [];
    const traceAsciiStrings: string[] = [];
    let currentUnitIsSei = false;
    let currentSeiBytes: number[] = [];

    const flushSeiAscii = () => {
      if (currentSeiBytes.length > 0) {
        const printable = currentSeiBytes
          .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : ' '))
          .join('')
          .replace(/\s+/g, ' ')
          .trim();
        if (printable.length >= 3 && !traceAsciiStrings.includes(printable)) {
          traceAsciiStrings.push(printable.slice(0, 140));
        }
        currentSeiBytes = [];
      }
    };

    const proc = spawn(
      ffmpegBin,
      ['-hide_banner', '-loglevel', 'info', '-i', filePath, '-c:v', 'copy', '-bsf:v', 'trace_headers', '-f', 'null', '-'],
      { env: EXEC_ENV }
    );

    const timer = setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {}
    }, 18000);

    let leftover = '';
    const processChunk = (chunk: Buffer) => {
      const text = leftover + chunk.toString('utf8');
      const lines = text.split(/\r?\n/);
      leftover = lines.pop() || '';
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        if (line.includes('nal_unit_type') || line.includes('Supplemental enhancement')) {
          flushSeiAscii();
          const m = line.match(/nal_unit_type\s*(?:=|\s+[01]+\s*=)\s*(\d+)/i);
          if (m) {
            const nType = Number(m[1]);
            if (
              nType === 6 ||
              (codecName.includes('hevc') && (nType === 39 || nType === 40)) ||
              (!codecName.includes('h264') && (nType === 39 || nType === 40))
            ) {
              currentUnitIsSei = true;
              seiCount++;
              if (nType === 6) type6Count++;
              if (nType === 39) type39Count++;
              if (nType === 40) type40Count++;
              if (traceSamples.length < 8) {
                traceSamples.push(line.slice(0, 180));
              }
            } else {
              currentUnitIsSei = false;
            }
          } else if (/Supplemental enhancement information/i.test(line)) {
            currentUnitIsSei = true;
            if (traceSamples.length < 8) {
              traceSamples.push(line.slice(0, 180));
            }
          }
        } else if (currentUnitIsSei && /payload_type/i.test(line)) {
          const pm = line.match(/payload_type\s*(?:=|[01]+\s*=)\s*(\d+)/i);
          if (pm) {
            payloadTypeSet.add(Number(pm[1]));
          }
          if (traceSamples.length < 10) {
            traceSamples.push(line.slice(0, 180));
          }
        } else if (currentUnitIsSei && /user_data_payload_byte\[\d+\]/i.test(line)) {
          const bm = line.match(/=\s*(\d+)\s*$/);
          if (bm && currentSeiBytes.length < 512) {
            currentSeiBytes.push(Number(bm[1]));
          }
        }
      }
    };

    proc.stderr.on('data', processChunk);
    proc.stdout.on('data', () => {});
    proc.on('close', () => {
      clearTimeout(timer);
      if (leftover) {
        processChunk(Buffer.from('\n'));
      }
      flushSeiAscii();
      resolve({
        seiCount,
        type6Count,
        type39Count,
        type40Count,
        payloadTypes: Array.from(payloadTypeSet).sort((a, b) => a - b),
        traceAsciiStrings,
        traceSamples,
      });
    });
    proc.on('error', () => {
      clearTimeout(timer);
      resolve({
        seiCount: 0,
        type6Count: 0,
        type39Count: 0,
        type40Count: 0,
        payloadTypes: [],
        traceAsciiStrings: [],
        traceSamples: [],
      });
    });
  });
}

function scanIsoBmffAndSei(buf: Buffer, codecName: string) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const dec = new TextDecoder('ascii', { fatal: false });
  const boxTreeSummary: Array<{ type: string; offset: number; size: number }> = [];
  const uuidClaims: UuidClaimEntry[] = [];
  const jumbfManifests: JumbfManifestEntry[] = [];
  const mdatRanges: Array<{ start: number; end: number }> = [];
  let hasZeroCreationTime = false;

  const walk = (start: number, end: number, parentPath: string, depth: number) => {
    if (depth > 8) return;
    let offset = start;
    while (offset + 8 <= end) {
      let size = view.getUint32(offset, false);
      const type = dec.decode(buf.subarray(offset + 4, offset + 8));
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

      if (depth === 0) {
        boxTreeSummary.push({ type, offset, size });
      }

      const currentPath = parentPath ? `${parentPath}/${type}` : type;

      if (type === 'mvhd' && offset + hdr + 12 <= offset + size) {
        const ver = buf[offset + hdr];
        if (ver === 0 && offset + hdr + 8 <= offset + size) {
          if (view.getUint32(offset + hdr + 4, false) === 0) {
            hasZeroCreationTime = true;
          }
        } else if (ver === 1 && offset + hdr + 12 <= offset + size) {
          if (
            view.getUint32(offset + hdr + 4, false) === 0 &&
            view.getUint32(offset + hdr + 8, false) === 0
          ) {
            hasZeroCreationTime = true;
          }
        }
      } else if (type === 'mdat' && depth === 0) {
        mdatRanges.push({ start: offset + hdr, end: offset + size });
      } else if (type === 'uuid') {
        const uuidSlice = buf.subarray(offset + hdr, Math.min(offset + hdr + 16, offset + size));
        const uuidHex = Array.from(uuidSlice)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        const bodySample = buf.subarray(offset + hdr, Math.min(offset + size, offset + hdr + 4096));
        const matches = extractAsciiKeywords(bodySample);
        if (C2PA_UUID_HEX_PREFIXES.some((p) => uuidHex.toLowerCase().startsWith(p))) {
          if (!matches.includes('c2pa-uuid')) matches.unshift('c2pa-uuid');
          jumbfManifests.push({
            boxType: 'uuid(c2pa)',
            offset,
            size,
            parentPath: currentPath,
            signatureMatches: matches,
            previewAscii: sanitizeAsciiPreview(bodySample),
          });
        }
        uuidClaims.push({
          offset,
          size,
          uuidHex,
          parentPath: currentPath,
          signatureMatches: matches,
        });
      } else if (type === 'c2pa' || type === 'jumb' || type === 'c2ma' || type === 'c2cl' || type === 'XMP_') {
        const bodySample = buf.subarray(offset + hdr, Math.min(offset + size, offset + hdr + 4096));
        const matches = extractAsciiKeywords(bodySample);
        jumbfManifests.push({
          boxType: type,
          offset,
          size,
          parentPath: currentPath,
          signatureMatches: matches.length > 0 ? matches : [type],
          previewAscii: sanitizeAsciiPreview(bodySample),
        });
      } else if (ISO_CONTAINER_BOXES.has(type)) {
        const nextOffset = type === 'meta' ? offset + hdr + 4 : offset + hdr;
        if (nextOffset < offset + size) {
          walk(nextOffset, offset + size, currentPath, depth + 1);
        }
      }

      offset += size;
    }
  };

  walk(0, buf.length, '', 0);

  // Also scan mdat length-prefixed NALs for H.264 Type 6 / HEVC Type 39|40 SEI & ASCII traces
  const isHevc = codecName.toLowerCase().includes('hevc') || codecName.toLowerCase().includes('h265');
  let binarySeiCount = 0;
  let binaryType6 = 0;
  let binaryType39 = 0;
  let binaryType40 = 0;
  const payloadTypes = new Set<number>();
  const asciiTraces = new Set<string>();

  for (const r of mdatRanges) {
    let pos = r.start;
    const limit = Math.min(r.end, r.start + 35 * 1024 * 1024);
    while (pos + 6 <= limit) {
      const nalLen =
        ((buf[pos] << 24) >>> 0) +
        ((buf[pos + 1] << 16) >>> 0) +
        ((buf[pos + 2] << 8) >>> 0) +
        (buf[pos + 3] >>> 0);
      if (nalLen < 2 || pos + 4 + nalLen > r.end) {
        pos++;
        continue;
      }
      const hdr0 = buf[pos + 4];
      if (!isHevc) {
        const nalType = hdr0 & 0x1f;
        if (nalType === 6 && (hdr0 & 0x80) === 0 && pos + 5 < r.end) {
          const pType = buf[pos + 5];
          if (pType === 5 || pType === 4 || pType === 0 || pType === 1) {
            binarySeiCount++;
            binaryType6++;
            payloadTypes.add(pType);
            const slice = buf.subarray(pos + 5, Math.min(pos + 4 + nalLen, pos + 512));
            for (const hit of extractAsciiKeywords(slice)) {
              asciiTraces.add(hit);
            }
          }
        }
      } else {
        const nalType = (hdr0 >> 1) & 0x3f;
        if ((nalType === 39 || nalType === 40) && pos + 6 < r.end) {
          const pType = buf[pos + 6];
          binarySeiCount++;
          if (nalType === 39) binaryType39++;
          if (nalType === 40) binaryType40++;
          payloadTypes.add(pType);
          const slice = buf.subarray(pos + 6, Math.min(pos + 4 + nalLen, pos + 512));
          for (const hit of extractAsciiKeywords(slice)) {
            asciiTraces.add(hit);
          }
        }
      }
      pos += 4 + nalLen;
    }
  }

  const containerAsciiHits = new Set<string>();
  for (const b of boxTreeSummary) {
    if (b.type !== 'mdat' && b.size <= 4 * 1024 * 1024) {
      const boxSlice = buf.subarray(b.offset, Math.min(buf.length, b.offset + b.size));
      for (const hit of extractAsciiKeywords(boxSlice)) {
        containerAsciiHits.add(hit);
      }
    }
  }

  return {
    boxTreeSummary,
    uuidClaims,
    jumbfManifests,
    hasZeroCreationTime,
    binarySeiCount,
    binaryType6,
    binaryType39,
    binaryType40,
    binaryPayloadTypes: Array.from(payloadTypes),
    asciiTraces: Array.from(asciiTraces),
    containerAsciiHits: Array.from(containerAsciiHits),
  };
}

function parseFrameRateString(rateStr: string): number {
  if (!rateStr) return 0;
  if (rateStr.includes('/')) {
    const [numStr, denStr] = rateStr.split('/');
    const num = Number(numStr);
    const den = Number(denStr);
    if (num > 0 && den > 0) return num / den;
  }
  const n = Number(rateStr);
  return Number.isFinite(n) ? n : 0;
}

async function analyzeAudioVisualForensics(
  ffmpegBin: string,
  filePath: string,
  rawVideo: any,
  rawAudio: any,
  fmtTags: Record<string, string>,
  hasZeroCreationTime: boolean
): Promise<AudioVisualForensicsReport> {
  const frameRateStr = String(rawVideo?.r_frame_rate || rawVideo?.avg_frame_rate || '0');
  const fps = Number(parseFrameRateString(frameRateStr).toFixed(3));
  const hasBFramesCount = Number(rawVideo?.has_b_frames ?? 0);
  const hasBFrames = hasBFramesCount > 0;
  const startTimeSec = Number(Number(rawVideo?.start_time || 0).toFixed(4));
  const refsCount = Number(rawVideo?.refs ?? 1);
  const compatBrands = String(fmtTags?.compatible_brands || '').toLowerCase();
  const minorVer = String(fmtTags?.minor_version || '');
  const hasFfmpegMuxerBrand = compatBrands.includes('iso2') && minorVer === '512';

  const hasAudio = Boolean(rawAudio);
  const sampleRateHz = Number(rawAudio?.sample_rate || 0);
  const channels = Number(rawAudio?.channels || 0);

  // Measure normalized luma/chroma entropy (sample first 14s) + audio silence/spectral cutoff/stereo field
  let lumaEntropyAvg = 0;
  let chromaUEntropyAvg = 0;
  let digitalSilenceCount = 0;
  let digitalSilenceSec = 0;
  let overallRmsDb = -60;
  let noiseFloorDb = -80;
  let lowBandRmsDb = -60;
  let highBand14kDb = -80;
  let highBand17kDb = -80;
  let midRmsDb = -60;
  let sideRmsDb = -60;

  try {
    const { stdout: vOut, stderr: vErr } = await execFileAsync(
      ffmpegBin,
      [
        '-hide_banner',
        '-t',
        '14',
        '-i',
        filePath,
        '-vf',
        'fps=4,entropy,metadata=mode=print:file=-',
        '-an',
        '-f',
        'null',
        '-',
      ],
      { env: EXEC_ENV, timeout: 15000, maxBuffer: 8 * 1024 * 1024 }
    ).catch((e) => ({ stdout: e?.stdout || '', stderr: e?.stderr || '' }));

    const combinedV = `${String(vOut || '')}\n${String(vErr || '')}`;
    const yMatches = Array.from(combinedV.matchAll(/lavfi\.entropy\.normalized_entropy\.normal\.Y=([\d.]+)/g)).map(
      (m) => Number(m[1])
    );
    const uMatches = Array.from(combinedV.matchAll(/lavfi\.entropy\.normalized_entropy\.normal\.U=([\d.]+)/g)).map(
      (m) => Number(m[1])
    );
    if (yMatches.length > 0) {
      lumaEntropyAvg = Number((yMatches.reduce((a, b) => a + b, 0) / yMatches.length).toFixed(4));
    }
    if (uMatches.length > 0) {
      chromaUEntropyAvg = Number((uMatches.reduce((a, b) => a + b, 0) / uMatches.length).toFixed(4));
    }
  } catch {}

  if (hasAudio) {
    try {
      const filterBranches = [
        '[0:a]silencedetect=noise=-55dB:d=0.10,astats=measure_perchannel=0[raw]',
        '[0:a]lowpass=f=4000,astats=measure_perchannel=0:measure_overall=RMS_level[low]',
        '[0:a]highpass=f=14000,astats=measure_perchannel=0:measure_overall=RMS_level[hi14]',
        '[0:a]highpass=f=17000,astats=measure_perchannel=0:measure_overall=RMS_level[hi17]',
      ];
      const mapArgs = [
        '-map', '[raw]', '-f', 'null', '-',
        '-map', '[low]', '-f', 'null', '-',
        '-map', '[hi14]', '-f', 'null', '-',
        '-map', '[hi17]', '-f', 'null', '-',
      ];
      if (channels >= 2) {
        filterBranches.push(
          '[0:a]pan=mono|c0=0.5*c0+0.5*c1,astats=measure_perchannel=0:measure_overall=RMS_level[mid]',
          '[0:a]pan=mono|c0=0.5*c0-0.5*c1,astats=measure_perchannel=0:measure_overall=RMS_level[side]'
        );
        mapArgs.push(
          '-map', '[mid]', '-f', 'null', '-',
          '-map', '[side]', '-f', 'null', '-'
        );
      }

      const { stderr: aErr } = await execFileAsync(
        ffmpegBin,
        [
          '-hide_banner',
          '-t',
          '18',
          '-i',
          filePath,
          '-filter_complex',
          filterBranches.join(';'),
          ...mapArgs,
        ],
        { env: EXEC_ENV, timeout: 15000, maxBuffer: 8 * 1024 * 1024 }
      ).catch((e) => ({ stdout: e?.stdout || '', stderr: e?.stderr || '' }));

      const errText = String(aErr || '');
      const silenceStarts = Array.from(errText.matchAll(/silence_start:/g)).length;
      const silenceDurs = Array.from(errText.matchAll(/silence_duration:\s*([\d.]+)/g)).map((m) => Number(m[1]));
      digitalSilenceCount = Math.max(silenceStarts, silenceDurs.length);
      digitalSilenceSec = Number(silenceDurs.reduce((a, b) => a + b, 0).toFixed(2));

      const rmsMatches = Array.from(errText.matchAll(/Parsed_astats_(\d+)[^\n]*\n(?:[^\n]*\n){0,8}?[^\n]*RMS level dB:\s*([-\d.]+|-inf)/gi));
      const branchRms = new Map<number, number>();
      for (const rm of rmsMatches) {
        const idx = Number(rm[1]);
        const val = rm[2] === '-inf' ? -96 : Number(rm[2]);
        if (Number.isFinite(val)) {
          branchRms.set(idx, val);
        }
      }
      if (branchRms.size === 0) {
        const allRms = Array.from(errText.matchAll(/RMS level dB:\s*([-\d.]+|-inf)/gi)).map((m) =>
          m[1] === '-inf' ? -96 : Number(m[1])
        );
        if (allRms.length >= 6 && channels >= 2) {
          sideRmsDb = Number(allRms[0].toFixed(2));
          midRmsDb = Number(allRms[1].toFixed(2));
          highBand17kDb = Number(allRms[2].toFixed(2));
          highBand14kDb = Number(allRms[3].toFixed(2));
          lowBandRmsDb = Number(allRms[4].toFixed(2));
          overallRmsDb = Number(allRms[5].toFixed(2));
        } else if (allRms.length >= 4) {
          highBand17kDb = Number(allRms[0].toFixed(2));
          highBand14kDb = Number(allRms[1].toFixed(2));
          lowBandRmsDb = Number(allRms[2].toFixed(2));
          overallRmsDb = Number(allRms[3].toFixed(2));
        }
      } else {
        // Filter node indices: 1=raw, 3=low, 5=hi14, 7=hi17, 9=mid, 11=side
        if (branchRms.has(1)) overallRmsDb = Number(branchRms.get(1)!.toFixed(2));
        if (branchRms.has(3)) lowBandRmsDb = Number(branchRms.get(3)!.toFixed(2));
        if (branchRms.has(5)) highBand14kDb = Number(branchRms.get(5)!.toFixed(2));
        if (branchRms.has(7)) highBand17kDb = Number(branchRms.get(7)!.toFixed(2));
        if (branchRms.has(9)) midRmsDb = Number(branchRms.get(9)!.toFixed(2));
        if (branchRms.has(11)) sideRmsDb = Number(branchRms.get(11)!.toFixed(2));
      }

      const nfMatch = errText.match(/Noise floor dB:\s*([-\d.]+|-inf)/i);
      if (nfMatch) {
        noiseFloorDb = nfMatch[1] === '-inf' ? -96 : Number(Number(nfMatch[1]).toFixed(2));
      }
    } catch {}
  }

  const airCliffDb = Number((lowBandRmsDb - highBand17kDb).toFixed(2));
  const stereoSideGapDb = channels >= 2 ? Number((midRmsDb - sideRmsDb).toFixed(2)) : 99;
  const isAiFramerate =
    (fps >= 23.9 && fps <= 24.1) ||
    Math.abs(fps - 16) < 0.2 ||
    Math.abs(fps - 12) < 0.2 ||
    Math.abs(fps - 8) < 0.2 ||
    Math.abs(fps - 15) < 0.2;
  const isZeroBFrames = !hasBFrames;

  const visualAiFlags: string[] = [];
  if (isAiFramerate) {
    visualAiFlags.push(`Framerate khas AI Diffusion (${fps} fps)`);
  }
  if (isZeroBFrames) {
    visualAiFlags.push('Zero B-Frames (GOP Sintetik non-kamera)');
  }
  if (lumaEntropyAvg > 0 && lumaEntropyAvg < 0.72) {
    visualAiFlags.push(`Tekstur piksel terdeteksi terlalu halus/sintetik (Entropy Y=${lumaEntropyAvg})`);
  }
  if (hasZeroCreationTime) {
    visualAiFlags.push('Creation Timestamp Kosong / 1904-01-01 (Ciri Stripping FFmpeg Bitexact)');
  }
  if (hasFfmpegMuxerBrand) {
    visualAiFlags.push(`Signature Muxer FFmpeg pada Header Brand (${compatBrands} • minor=${minorVer})`);
  }
  if (startTimeSec > 0.04) {
    visualAiFlags.push(`PTS/ELST Start-Time Drift (${startTimeSec}s • Artefak Remux)`);
  }

  const audioAiFlags: string[] = [];
  if (hasAudio) {
    if (channels === 1) {
      audioAiFlags.push('Channel Audio Mono Tunggal (Ciri AI TTS / Non-Kamera Stereo)');
    } else if (stereoSideGapDb >= 27.5) {
      audioAiFlags.push(`Audio Pseudo-Stereo / Mono Duplikat (Mid-Side ${stereoSideGapDb} dB • Ciri AI TTS)`);
    }
    if (digitalSilenceCount > 0) {
      audioAiFlags.push(`Jeda Hening Digital Mutlak <-55dB (${digitalSilenceCount} segmen, ${digitalSilenceSec}s • Ciri AI TTS)`);
    }
    if (highBand17kDb <= -56 || airCliffDb >= 32.5) {
      audioAiFlags.push(`Pemotongan Spektrum Vocoder AI >17kHz (${highBand17kDb} dB • cliff ${airCliffDb} dB)`);
    } else if (highBand14kDb <= -52) {
      audioAiFlags.push(`Energi Udara >14kHz sangat rendah (${highBand14kDb} dB)`);
    }
    if (noiseFloorDb <= -55) {
      audioAiFlags.push(`Noise Floor Audio Sintetik (${noiseFloorDb} dB)`);
    } else if (noiseFloorDb >= -40.5) {
      audioAiFlags.push(`Noise Floor Terlalu Tinggi / Hiss White-Noise Sintetik (${noiseFloorDb} dB)`);
    }
  }

  let riskScore = 0;
  if (isAiFramerate) riskScore += 28;
  if (isZeroBFrames) riskScore += 18;
  if (lumaEntropyAvg > 0 && lumaEntropyAvg < 0.72) riskScore += 14;
  if (hasZeroCreationTime) riskScore += 16;
  if (hasFfmpegMuxerBrand) riskScore += 15;
  if (startTimeSec > 0.04) riskScore += 10;
  if (hasAudio && (channels === 1 || stereoSideGapDb >= 27.5)) riskScore += 16;
  if (hasAudio && digitalSilenceCount > 0) riskScore += 20;
  if (hasAudio && (highBand17kDb <= -56 || airCliffDb >= 32.5)) riskScore += 20;
  if (hasAudio && (noiseFloorDb <= -55 || noiseFloorDb >= -40.5)) riskScore += 14;
  riskScore = Math.min(100, riskScore);

  const visualClean = visualAiFlags.length === 0;
  const audioClean = !hasAudio || audioAiFlags.length === 0;
  const aiVerdict: AudioVisualForensicsReport['aiVerdict'] =
    riskScore >= 40 ? 'HIGH_AI_RISK' : riskScore >= 15 ? 'SUSPICIOUS_SIGNALS' : 'CLEAN_ORGANIC';

  return {
    visual: {
      fps,
      frameRateStr,
      hasBFrames,
      isAiFramerate,
      isZeroBFrames,
      lumaEntropyAvg,
      chromaUEntropyAvg,
      startTimeSec,
      refsCount,
      hasZeroCreationTime,
      hasFfmpegMuxerBrand,
      visualAiFlags,
      visualClean,
    },
    audio: {
      hasAudio,
      sampleRateHz,
      channels,
      digitalSilenceCount,
      digitalSilenceSec,
      overallRmsDb,
      noiseFloorDb,
      lowBandRmsDb,
      highBand14kDb,
      highBand17kDb,
      airCliffDb,
      midRmsDb,
      sideRmsDb,
      stereoSideGapDb,
      audioAiFlags,
      audioClean,
    },
    aiRiskScore: riskScore,
    aiVerdict,
  };
}

function isFlaggedValue(key: string, value: string): boolean {
  const combined = `${key} ${value}`.toLowerCase();
  return FLAGGED_KEYWORDS.some((kw) => combined.includes(kw));
}

export async function probeVideoFile(filePath: string): Promise<ExternalProbeReport> {
  const ffprobeBin = resolveMediaBinary('ffprobe');
  const ffmpegBin = resolveMediaBinary('ffmpeg');
  const stat = await fs.stat(filePath);

  let parsedProbe: any = {};
  try {
    const { stdout } = await execFileAsync(
      ffprobeBin,
      ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', filePath],
      { env: EXEC_ENV, timeout: 15000, maxBuffer: 10 * 1024 * 1024 }
    );
    parsedProbe = JSON.parse(stdout || '{}');
  } catch {
    parsedProbe = {};
  }

  const fmt = parsedProbe.format || {};
  const fmtTags: Record<string, string> = fmt.tags || {};
  const streams: any[] = Array.isArray(parsedProbe.streams) ? parsedProbe.streams : [];
  const rawVideo = streams.find((s) => s.codec_type === 'video') || null;
  const rawAudio = streams.find((s) => s.codec_type === 'audio') || null;

  const codecName = String(rawVideo?.codec_name || 'h264');

  const [traceRes, fileBuf] = await Promise.all([
    runTraceHeadersStream(ffmpegBin, filePath, codecName),
    fs.readFile(filePath),
  ]);

  const bmff = scanIsoBmffAndSei(fileBuf, codecName);
  const avForensics = await analyzeAudioVisualForensics(
    ffmpegBin,
    filePath,
    rawVideo,
    rawAudio,
    fmtTags,
    bmff.hasZeroCreationTime
  );

  const vendorTags: VendorTagEntry[] = [];
  const pushTags = (source: string, tagsObj: Record<string, string> | undefined) => {
    if (!tagsObj) return;
    for (const [k, v] of Object.entries(tagsObj)) {
      const val = String(v ?? '');
      vendorTags.push({
        source,
        key: k,
        value: val,
        flagged: isFlaggedValue(k, val),
      });
    }
  };

  pushTags('format', fmtTags);
  pushTags('video_stream', rawVideo?.tags);
  pushTags('audio_stream', rawAudio?.tags);

  const combinedPayloadTypes = Array.from(
    new Set([...traceRes.payloadTypes, ...bmff.binaryPayloadTypes])
  ).sort((a, b) => a - b);

  const combinedAsciiTraces = Array.from(
    new Set([...bmff.asciiTraces, ...bmff.containerAsciiHits, ...traceRes.traceAsciiStrings])
  );

  const type6Count = Math.max(traceRes.type6Count, bmff.binaryType6);
  const type39Count = Math.max(traceRes.type39Count, bmff.binaryType39);
  const type40Count = Math.max(traceRes.type40Count, bmff.binaryType40);
  const totalSeiUnits = Math.max(traceRes.seiCount, bmff.binarySeiCount, type6Count + type39Count + type40Count);

  const flaggedReasons: string[] = [];
  if (totalSeiUnits > 0) {
    flaggedReasons.push(
      `SEI NAL Units terdeteksi (${totalSeiUnits} unit${combinedPayloadTypes.length ? `, payload_type=${combinedPayloadTypes.join(',')}` : ''})`
    );
  }
  if (bmff.uuidClaims.length > 0) {
    flaggedReasons.push(`${bmff.uuidClaims.length} box UUID claim terdeteksi`);
  }
  if (bmff.jumbfManifests.length > 0) {
    flaggedReasons.push(`${bmff.jumbfManifests.length} manifes C2PA / JUMBF terdeteksi`);
  }
  const flaggedVendorEntries = vendorTags.filter((t) => t.flagged);
  if (flaggedVendorEntries.length > 0) {
    flaggedReasons.push(
      `Tag vendor/encoder mencurigakan (${flaggedVendorEntries.map((t) => `${t.key}=${t.value}`).slice(0, 3).join('; ')})`
    );
  }
  if (combinedAsciiTraces.length > 0) {
    flaggedReasons.push(`Jejak ASCII di bitstream/container: ${combinedAsciiTraces.join(', ')}`);
  }
  for (const vf of avForensics.visual.visualAiFlags) {
    flaggedReasons.push(`[Visual AI] ${vf}`);
  }
  for (const af of avForensics.audio.audioAiFlags) {
    flaggedReasons.push(`[Audio AI] ${af}`);
  }

  let totalRiskScore = avForensics.aiRiskScore;
  if (totalSeiUnits > 0) totalRiskScore += 30;
  if (bmff.jumbfManifests.length > 0 || bmff.uuidClaims.length > 0) totalRiskScore += 30;
  if (flaggedVendorEntries.length > 0 || combinedAsciiTraces.length > 0) totalRiskScore += 25;
  avForensics.aiRiskScore = Math.min(100, totalRiskScore);
  avForensics.aiVerdict =
    avForensics.aiRiskScore >= 40
      ? 'HIGH_AI_RISK'
      : avForensics.aiRiskScore >= 15
        ? 'SUSPICIOUS_SIGNALS'
        : 'CLEAN_ORGANIC';

  const isZeroSei = totalSeiUnits === 0;
  const isZeroUuid = bmff.uuidClaims.length === 0;
  const isZeroJumbf = bmff.jumbfManifests.length === 0;
  const isZeroAiVendor = flaggedVendorEntries.length === 0 && combinedAsciiTraces.length === 0;
  const isVisualAiClean = avForensics.visual.visualClean;
  const isAudioAiClean = avForensics.audio.audioClean;

  return {
    probedAt: new Date().toISOString(),
    probeEngine: 'ffprobe + ffmpeg trace_headers + Audio-Visual AI Forensics + ISO-BMFF Scanner',
    ffprobeBinary: ffprobeBin,
    fileSizeBytes: stat.size,
    format: {
      formatName: String(fmt.format_name || 'mp4'),
      majorBrand: String(fmtTags.major_brand || ''),
      minorVersion: String(fmtTags.minor_version || ''),
      compatibleBrands: String(fmtTags.compatible_brands || ''),
      durationSec: Number(fmt.duration || 0),
      bitRate: Number(fmt.bit_rate || 0),
      nbStreams: Number(fmt.nb_streams || streams.length || 0),
      tags: fmtTags,
    },
    videoStream: rawVideo
      ? {
          codecName,
          profile: String(rawVideo.profile || ''),
          width: Number(rawVideo.width || 0),
          height: Number(rawVideo.height || 0),
          avgFrameRate: String(rawVideo.avg_frame_rate || ''),
          rFrameRate: String(rawVideo.r_frame_rate || ''),
          pixFmt: String(rawVideo.pix_fmt || ''),
          nbFrames: Number(rawVideo.nb_frames || 0),
          hasBFrames: Number(rawVideo.has_b_frames ?? 0),
          handlerName: String(rawVideo.tags?.handler_name || ''),
          tags: rawVideo.tags || {},
        }
      : null,
    audioStream: rawAudio
      ? {
          codecName: String(rawAudio.codec_name || ''),
          sampleRate: String(rawAudio.sample_rate || ''),
          channels: Number(rawAudio.channels || 0),
          handlerName: String(rawAudio.tags?.handler_name || ''),
          tags: rawAudio.tags || {},
        }
      : null,
    seiReport: {
      totalSeiUnits,
      nalUnitType6Count: type6Count,
      nalUnitType39Count: type39Count,
      nalUnitType40Count: type40Count,
      payloadTypes: combinedPayloadTypes,
      asciiTraces: combinedAsciiTraces,
      traceSamples: traceRes.traceSamples,
      traceMethod: 'ffmpeg -bsf:v trace_headers + payload ASCII decoder',
    },
    uuidClaims: bmff.uuidClaims,
    jumbfManifests: bmff.jumbfManifests,
    vendorTags,
    boxTreeSummary: bmff.boxTreeSummary,
    audioVisualForensics: avForensics,
    cleanliness: {
      isZeroSei,
      isZeroUuid,
      isZeroJumbf,
      isZeroAiVendor,
      isVisualAiClean,
      isAudioAiClean,
      overallClean:
        isZeroSei &&
        isZeroUuid &&
        isZeroJumbf &&
        isZeroAiVendor &&
        isVisualAiClean &&
        isAudioAiClean,
      flaggedReasons,
    },
  };
}
