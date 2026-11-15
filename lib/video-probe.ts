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

export interface IsolatedSeiUnit {
  index: number;
  source: 'ffprobe_side_data' | 'trace_headers' | 'mdat_nal';
  nalUnitType: number;
  payloadType: number;
  payloadTypeLabel: string;
  byteOffsetHex?: string;
  sizeBytes: number;
  uuid16Hex?: string;
  decodedAscii: string;
  rawHexPreview: string;
  matchedAiMarkers: string[];
  isAiTrigger: boolean;
  triggerReason: string;
}

export interface IsolatedMetadataBlock {
  id: string;
  category: 'C2PA_JUMBF' | 'UUID_CLAIM' | 'UDTA_META' | 'DATA_STREAM' | 'FFPROBE_TAG';
  boxOrStreamName: string;
  path: string;
  offsetHex: string;
  sizeBytes: number;
  uuidHex?: string;
  asciiPreview: string;
  matchedKeywords: string[];
  isAiTrigger: boolean;
  triggerReason: string;
}

export interface FfprobeDiagnosticReport {
  commandExecuted: string;
  rawFfprobeSummaryText: string;
  packetSideDataCount: number;
  dataStreamsCount: number;
  isolatedSeiUnits: IsolatedSeiUnit[];
  isolatedMetadataBlocks: IsolatedMetadataBlock[];
  aiTriggerChecklist: Array<{
    id: string;
    layer: 'SEI_NAL' | 'C2PA_JUMBF' | 'UUID_BOX' | 'VENDOR_TAG' | 'CONTAINER_MUXER';
    severity: 'critical' | 'warning';
    title: string;
    detail: string;
  }>;
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
  ffprobeDiagnostic: FfprobeDiagnosticReport;
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

function getSeiPayloadLabel(payloadType: number): string {
  switch (payloadType) {
    case 0:
      return 'buffering_period (0)';
    case 1:
      return 'pic_timing (1)';
    case 4:
      return 'user_data_registered_itu_t_t35 (4)';
    case 5:
      return 'user_data_unregistered (5)';
    case 6:
      return 'recovery_point (6)';
    case 137:
      return 'mastering_display_colour_volume (137)';
    case 144:
      return 'content_light_level_info (144)';
    default:
      return `sei_payload_type_${payloadType}`;
  }
}

function bytesToHexPreview(slice: Uint8Array, maxBytes = 24): string {
  return Array.from(slice.subarray(0, Math.min(slice.length, maxBytes)))
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
}

function scanIsoBmffAndSei(buf: Buffer, codecName: string) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const dec = new TextDecoder('ascii', { fatal: false });
  const boxTreeSummary: Array<{ type: string; offset: number; size: number }> = [];
  const uuidClaims: UuidClaimEntry[] = [];
  const jumbfManifests: JumbfManifestEntry[] = [];
  const mdatRanges: Array<{ start: number; end: number }> = [];
  const isolatedMetadataBlocks: IsolatedMetadataBlock[] = [];
  const isolatedSeiUnits: IsolatedSeiUnit[] = [];
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
      const offsetHex = `0x${offset.toString(16).toUpperCase()}`;

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
        const asciiPreview = sanitizeAsciiPreview(bodySample, 140);
        const isC2paUuid = C2PA_UUID_HEX_PREFIXES.some((p) => uuidHex.toLowerCase().startsWith(p));
        if (isC2paUuid) {
          if (!matches.includes('c2pa-uuid')) matches.unshift('c2pa-uuid');
          jumbfManifests.push({
            boxType: 'uuid(c2pa)',
            offset,
            size,
            parentPath: currentPath,
            signatureMatches: matches,
            previewAscii: asciiPreview,
          });
        }
        uuidClaims.push({
          offset,
          size,
          uuidHex,
          parentPath: currentPath,
          signatureMatches: matches,
        });
        if (isolatedMetadataBlocks.length < 40) {
          isolatedMetadataBlocks.push({
            id: `box_${offsetHex}_${type}`,
            category: isC2paUuid ? 'C2PA_JUMBF' : 'UUID_CLAIM',
            boxOrStreamName: isC2paUuid ? 'uuid (C2PA/JUMBF)' : 'uuid',
            path: currentPath,
            offsetHex,
            sizeBytes: size,
            uuidHex,
            asciiPreview: asciiPreview || '(binary UUID payload)',
            matchedKeywords: matches,
            isAiTrigger: true,
            triggerReason: isC2paUuid
              ? `C2PA Content Credentials UUID (${uuidHex.slice(0, 16)}...) memicu flag AI`
              : `Box UUID kustom (${uuidHex.slice(0, 16)}...) terdeteksi di container MP4`,
          });
        }
      } else if (type === 'c2pa' || type === 'jumb' || type === 'c2ma' || type === 'c2cl' || type === 'XMP_') {
        const bodySample = buf.subarray(offset + hdr, Math.min(offset + size, offset + hdr + 4096));
        const matches = extractAsciiKeywords(bodySample);
        const asciiPreview = sanitizeAsciiPreview(bodySample, 140);
        jumbfManifests.push({
          boxType: type,
          offset,
          size,
          parentPath: currentPath,
          signatureMatches: matches.length > 0 ? matches : [type],
          previewAscii: asciiPreview,
        });
        if (isolatedMetadataBlocks.length < 40) {
          isolatedMetadataBlocks.push({
            id: `box_${offsetHex}_${type}`,
            category: 'C2PA_JUMBF',
            boxOrStreamName: type,
            path: currentPath,
            offsetHex,
            sizeBytes: size,
            asciiPreview: asciiPreview || `(binary ${type} manifest)`,
            matchedKeywords: matches.length > 0 ? matches : [type],
            isAiTrigger: true,
            triggerReason: `Manifes provenance ${type.toUpperCase()} / C2PA terdeteksi`,
          });
        }
      } else if (type === 'udta' || type === 'meta' || type === 'ilst' || type === '©too' || type === '©enc' || type === 'tmcd') {
        const bodySample = buf.subarray(offset + hdr, Math.min(offset + size, offset + hdr + 2048));
        const matches = extractAsciiKeywords(bodySample);
        const asciiPreview = sanitizeAsciiPreview(bodySample, 140);
        if ((matches.length > 0 || type === 'tmcd') && isolatedMetadataBlocks.length < 40) {
          isolatedMetadataBlocks.push({
            id: `box_${offsetHex}_${type}`,
            category: 'UDTA_META',
            boxOrStreamName: type,
            path: currentPath,
            offsetHex,
            sizeBytes: size,
            asciiPreview: asciiPreview || '(metadata atom)',
            matchedKeywords: matches.length > 0 ? matches : [type],
            isAiTrigger: matches.length > 0 || type === 'tmcd',
            triggerReason:
              type === 'tmcd'
                ? 'Timecode track atom (tmcd) tertinggal'
                : `Atom ${type} memuat signature terflagging: ${matches.join(', ')}`,
          });
        }
        if (ISO_CONTAINER_BOXES.has(type)) {
          const nextOffset = type === 'meta' ? offset + hdr + 4 : offset + hdr;
          if (nextOffset < offset + size) {
            walk(nextOffset, offset + size, currentPath, depth + 1);
          }
        }
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

  // Extract exact video-track sample offsets (stco/co64 + stsc + stsz) so AAC audio bytes in mdat are NEVER misparsed as SEI NALs
  const videoSampleRanges: Array<{ start: number; end: number }> = [];
  try {
    const parseVideoTrakSamples = (moovStart: number, moovEnd: number) => {
      let mOff = moovStart;
      while (mOff + 8 <= moovEnd) {
        const mSz = view.getUint32(mOff, false);
        const mType = dec.decode(buf.subarray(mOff + 4, mOff + 8));
        if (mSz < 8 || mOff + mSz > moovEnd) break;
        if (mType === 'trak') {
          let isVideoTrak = false;
          let stcoOffsets: number[] = [];
          let stscEntries: Array<{ firstChunk: number; samplesPerChunk: number }> = [];
          let stszSizes: number[] = [];

          const walkTrak = (s: number, e: number, d: number) => {
            if (d > 6) return;
            let p = s;
            while (p + 8 <= e) {
              const sz = view.getUint32(p, false);
              const tp = dec.decode(buf.subarray(p + 4, p + 8));
              if (sz < 8 || p + sz > e) break;
              if (tp === 'hdlr' && p + 20 <= p + sz) {
                const handlerType = dec.decode(buf.subarray(p + 16, p + 20));
                if (handlerType === 'vide') isVideoTrak = true;
              } else if (tp === 'stco' && p + 16 <= p + sz) {
                const count = view.getUint32(p + 12, false);
                for (let i = 0; i < count && p + 16 + i * 4 + 4 <= p + sz; i++) {
                  stcoOffsets.push(view.getUint32(p + 16 + i * 4, false));
                }
              } else if (tp === 'co64' && p + 16 <= p + sz) {
                const count = view.getUint32(p + 12, false);
                for (let i = 0; i < count && p + 16 + i * 8 + 8 <= p + sz; i++) {
                  const hi = view.getUint32(p + 16 + i * 8, false);
                  const lo = view.getUint32(p + 16 + i * 8 + 4, false);
                  stcoOffsets.push(hi * 4294967296 + lo);
                }
              } else if (tp === 'stsc' && p + 16 <= p + sz) {
                const count = view.getUint32(p + 12, false);
                for (let i = 0; i < count && p + 16 + i * 12 + 12 <= p + sz; i++) {
                  stscEntries.push({
                    firstChunk: view.getUint32(p + 16 + i * 12, false),
                    samplesPerChunk: view.getUint32(p + 16 + i * 12 + 4, false),
                  });
                }
              } else if (tp === 'stsz' && p + 20 <= p + sz) {
                const fixedSz = view.getUint32(p + 12, false);
                const count = view.getUint32(p + 16, false);
                if (fixedSz > 0) {
                  for (let i = 0; i < count; i++) stszSizes.push(fixedSz);
                } else {
                  for (let i = 0; i < count && p + 20 + i * 4 + 4 <= p + sz; i++) {
                    stszSizes.push(view.getUint32(p + 20 + i * 4, false));
                  }
                }
              } else if (ISO_CONTAINER_BOXES.has(tp)) {
                walkTrak(p + 8, p + sz, d + 1);
              }
              p += sz;
            }
          };

          walkTrak(mOff + 8, mOff + mSz, 0);
          if (isVideoTrak && stcoOffsets.length > 0 && stszSizes.length > 0) {
            let sampleIdx = 0;
            for (let chunkIdx = 0; chunkIdx < stcoOffsets.length && sampleIdx < stszSizes.length; chunkIdx++) {
              const chunkNum = chunkIdx + 1;
              let spc = 1;
              for (let eIdx = stscEntries.length - 1; eIdx >= 0; eIdx--) {
                if (chunkNum >= stscEntries[eIdx].firstChunk) {
                  spc = stscEntries[eIdx].samplesPerChunk;
                  break;
                }
              }
              let curPos = stcoOffsets[chunkIdx];
              for (let sInChunk = 0; sInChunk < spc && sampleIdx < stszSizes.length; sInChunk++) {
                const sLen = stszSizes[sampleIdx++];
                if (curPos >= 0 && curPos + sLen <= buf.length) {
                  videoSampleRanges.push({ start: curPos, end: curPos + sLen });
                }
                curPos += sLen;
              }
            }
            return;
          }
        }
        mOff += mSz;
      }
    };

    const moovBox = boxTreeSummary.find((b) => b.type === 'moov');
    if (moovBox) {
      parseVideoTrakSamples(moovBox.offset + 8, Math.min(buf.length, moovBox.offset + moovBox.size));
    }
  } catch {}

  // Scan exact video-track samples (or fallback cleanly without mid-stream byte drift) for H.264 Type 6 / HEVC Type 39|40 SEI
  const isHevc = codecName.toLowerCase().includes('hevc') || codecName.toLowerCase().includes('h265');
  let binarySeiCount = 0;
  let binaryType6 = 0;
  let binaryType39 = 0;
  let binaryType40 = 0;
  const payloadTypes = new Set<number>();
  const asciiTraces = new Set<string>();

  const rangesToScan = videoSampleRanges.length > 0 ? videoSampleRanges : mdatRanges;
  for (const r of rangesToScan) {
    let pos = r.start;
    while (pos + 6 <= r.end) {
      const nalLen =
        ((buf[pos] << 24) >>> 0) +
        ((buf[pos + 1] << 16) >>> 0) +
        ((buf[pos + 2] << 8) >>> 0) +
        (buf[pos + 3] >>> 0);
      if (nalLen < 2 || pos + 4 + nalLen > r.end) {
        break;
      }
      const hdr0 = buf[pos + 4];
      if (!isHevc) {
        const nalType = hdr0 & 0x1f;
        const nalRefIdc = (hdr0 >> 5) & 0x03;
        if (nalType === 6 && (hdr0 & 0x80) === 0 && nalRefIdc === 0 && pos + 5 < r.end) {
          const pType = buf[pos + 5];
          binarySeiCount++;
          binaryType6++;
          payloadTypes.add(pType);
          const slice = buf.subarray(pos + 5, Math.min(pos + 4 + nalLen, pos + 512));
          const hits = extractAsciiKeywords(slice);
          for (const hit of hits) {
            asciiTraces.add(hit);
          }
          if (isolatedSeiUnits.length < 30) {
            const uuid16Hex =
              pType === 5 && pos + 23 <= r.end && nalLen >= 19
                ? Array.from(buf.subarray(pos + 7, pos + 23))
                    .map((b) => b.toString(16).padStart(2, '0'))
                    .join('')
                : undefined;
            const ascii = sanitizeAsciiPreview(slice, 120);
            const isTrigger = pType === 5 || pType === 4 || hits.length > 0;
            isolatedSeiUnits.push({
              index: isolatedSeiUnits.length + 1,
              source: 'mdat_nal',
              nalUnitType: 6,
              payloadType: pType,
              payloadTypeLabel: getSeiPayloadLabel(pType),
              byteOffsetHex: `0x${pos.toString(16).toUpperCase()}`,
              sizeBytes: nalLen,
              uuid16Hex,
              decodedAscii: ascii || '(binary SEI payload)',
              rawHexPreview: bytesToHexPreview(buf.subarray(pos + 4, pos + 4 + nalLen), 24),
              matchedAiMarkers: hits,
              isAiTrigger: isTrigger,
              triggerReason:
                hits.length > 0
                  ? `SEI Type 6 memuat string watermark/encoder: ${hits.join(', ')}`
                  : pType === 5
                    ? `SEI unregistered user data (UUID: ${uuid16Hex || 'unknown'})`
                    : `SEI NAL Type 6 (payload_type=${pType})`,
            });
          }
        }
      } else {
        const nalType = (hdr0 >> 1) & 0x3f;
        if ((nalType === 39 || nalType === 40) && (hdr0 & 0x80) === 0 && pos + 6 < r.end) {
          const pType = buf[pos + 6];
          binarySeiCount++;
          if (nalType === 39) binaryType39++;
          if (nalType === 40) binaryType40++;
          payloadTypes.add(pType);
          const slice = buf.subarray(pos + 6, Math.min(pos + 4 + nalLen, pos + 512));
          const hits = extractAsciiKeywords(slice);
          for (const hit of hits) {
            asciiTraces.add(hit);
          }
          if (isolatedSeiUnits.length < 30) {
            const uuid16Hex =
              pType === 5 && pos + 24 <= r.end && nalLen >= 20
                ? Array.from(buf.subarray(pos + 8, pos + 24))
                    .map((b) => b.toString(16).padStart(2, '0'))
                    .join('')
                : undefined;
            const ascii = sanitizeAsciiPreview(slice, 120);
            isolatedSeiUnits.push({
              index: isolatedSeiUnits.length + 1,
              source: 'mdat_nal',
              nalUnitType: nalType,
              payloadType: pType,
              payloadTypeLabel: getSeiPayloadLabel(pType),
              byteOffsetHex: `0x${pos.toString(16).toUpperCase()}`,
              sizeBytes: nalLen,
              uuid16Hex,
              decodedAscii: ascii || '(binary HEVC SEI payload)',
              rawHexPreview: bytesToHexPreview(buf.subarray(pos + 4, pos + 4 + nalLen), 24),
              matchedAiMarkers: hits,
              isAiTrigger: pType === 5 || pType === 4 || hits.length > 0,
              triggerReason:
                hits.length > 0
                  ? `HEVC SEI Type ${nalType} memuat marker: ${hits.join(', ')}`
                  : `HEVC SEI NAL Type ${nalType} (payload_type=${pType})`,
            });
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
    isolatedMetadataBlocks,
    isolatedSeiUnits,
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
      ['-v', 'error', '-show_format', '-show_streams', '-show_chapters', '-of', 'json', filePath],
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

  // Run ffprobe frame-level side_data inspection to catch embedded SEI / ITU-T T.35 / unregistered user data
  let ffprobeFramesSideData: Array<{ frameIndex: number; ptsTime: string; sideData: any }> = [];
  const ffprobeCommandStr = `ffprobe -v error -show_format -show_streams -show_frames -select_streams v:0 -read_intervals %+#45 -of json`;
  try {
    const { stdout: frameProbeOut } = await execFileAsync(
      ffprobeBin,
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_frames',
        '-read_intervals',
        '%+#45',
        '-of',
        'json',
        filePath,
      ],
      { env: EXEC_ENV, timeout: 15000, maxBuffer: 15 * 1024 * 1024 }
    );
    const frameJson = JSON.parse(frameProbeOut || '{}');
    const frames: any[] = Array.isArray(frameJson.frames) ? frameJson.frames : [];
    frames.forEach((fr, idx) => {
      if (Array.isArray(fr.side_data_list)) {
        for (const sd of fr.side_data_list) {
          ffprobeFramesSideData.push({
            frameIndex: idx,
            ptsTime: String(fr.pkt_pts_time || fr.best_effort_timestamp_time || '0'),
            sideData: sd,
          });
        }
      }
    });
  } catch {
    ffprobeFramesSideData = [];
  }

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

  // Merge ffprobe side_data SEI entries + trace_headers fallback if mdat scan found fewer
  const isolatedSeiUnits: IsolatedSeiUnit[] = [...bmff.isolatedSeiUnits];
  for (const item of ffprobeFramesSideData) {
    const sdType = String(item.sideData?.side_data_type || 'Unknown Side Data');
    const isSeiSd = /sei|unregistered|t\.35|user_data/i.test(sdType);
    if (isSeiSd && isolatedSeiUnits.length < 36) {
      const jsonDump = JSON.stringify(item.sideData);
      const matches = FLAGGED_KEYWORDS.filter((kw) => jsonDump.toLowerCase().includes(kw));
      isolatedSeiUnits.unshift({
        index: 0,
        source: 'ffprobe_side_data',
        nalUnitType: codecName.includes('hevc') ? 39 : 6,
        payloadType: sdType.toLowerCase().includes('unregistered') ? 5 : 4,
        payloadTypeLabel: `${sdType} (Frame #${item.frameIndex} @${item.ptsTime}s)`,
        sizeBytes: jsonDump.length,
        decodedAscii: jsonDump.slice(0, 140),
        rawHexPreview: '-',
        matchedAiMarkers: matches,
        isAiTrigger: true,
        triggerReason: `ffprobe frame side_data mendeteksi ${sdType}`,
      });
    }
  }
  if (isolatedSeiUnits.length === 0 && traceRes.seiCount > 0) {
    traceRes.traceSamples.forEach((sample, idx) => {
      isolatedSeiUnits.push({
        index: idx + 1,
        source: 'trace_headers',
        nalUnitType: codecName.includes('hevc') ? 39 : 6,
        payloadType: traceRes.payloadTypes[0] ?? 5,
        payloadTypeLabel: getSeiPayloadLabel(traceRes.payloadTypes[0] ?? 5),
        sizeBytes: 0,
        decodedAscii: traceRes.traceAsciiStrings[idx] || sample,
        rawHexPreview: '-',
        matchedAiMarkers: traceRes.traceAsciiStrings.slice(0, 3),
        isAiTrigger: true,
        triggerReason: 'Terdeteksi oleh ffmpeg -bsf:v trace_headers',
      });
    });
  }
  isolatedSeiUnits.forEach((u, idx) => {
    u.index = idx + 1;
  });

  // Add ffprobe non-AV data/timecode streams & flagged format/stream tags to isolatedMetadataBlocks
  const isolatedMetadataBlocks: IsolatedMetadataBlock[] = [...bmff.isolatedMetadataBlocks];
  const dataStreams = streams.filter((s) => s.codec_type !== 'video' && s.codec_type !== 'audio');
  for (const ds of dataStreams) {
    isolatedMetadataBlocks.push({
      id: `stream_${ds.index}_${ds.codec_tag_string || ds.codec_type}`,
      category: 'DATA_STREAM',
      boxOrStreamName: `Stream #${ds.index} (${ds.codec_type}/${ds.codec_tag_string || ds.codec_name || 'data'})`,
      path: `ffprobe/streams[${ds.index}]`,
      offsetHex: `stream:${ds.index}`,
      sizeBytes: 0,
      asciiPreview: JSON.stringify(ds.tags || {}).slice(0, 140),
      matchedKeywords: [String(ds.codec_tag_string || ds.codec_type || 'data')],
      isAiTrigger: true,
      triggerReason: `Track data/timecode tambahan (${ds.codec_tag_string || ds.codec_type}) terdeteksi oleh ffprobe`,
    });
  }
  for (const vt of vendorTags) {
    if (vt.flagged) {
      isolatedMetadataBlocks.push({
        id: `tag_${vt.source}_${vt.key}`,
        category: 'FFPROBE_TAG',
        boxOrStreamName: `${vt.source}.${vt.key}`,
        path: `ffprobe/${vt.source}/tags/${vt.key}`,
        offsetHex: 'header',
        sizeBytes: vt.value.length,
        asciiPreview: `${vt.key}=${vt.value}`,
        matchedKeywords: FLAGGED_KEYWORDS.filter((kw) => `${vt.key} ${vt.value}`.toLowerCase().includes(kw)),
        isAiTrigger: true,
        triggerReason: `Tag metadata ffprobe terflagging AI/Encoder: ${vt.key}="${vt.value}"`,
      });
    }
  }

  const flaggedReasons: string[] = [];
  const aiTriggerChecklist: FfprobeDiagnosticReport['aiTriggerChecklist'] = [];

  if (totalSeiUnits > 0) {
    const msg = `SEI NAL Units terdeteksi (${totalSeiUnits} unit${combinedPayloadTypes.length ? `, payload_type=${combinedPayloadTypes.join(',')}` : ''})`;
    flaggedReasons.push(msg);
    aiTriggerChecklist.push({
      id: 'trig_sei',
      layer: 'SEI_NAL',
      severity: 'critical',
      title: `${totalSeiUnits} SEI NAL Unit (${type6Count > 0 ? 'H.264 Type 6' : 'HEVC Type 39/40'})`,
      detail: `Payload types: [${combinedPayloadTypes.join(', ') || 'unregistered'}]${combinedAsciiTraces.length ? ` • Jejak: ${combinedAsciiTraces.slice(0, 3).join(', ')}` : ''}`,
    });
  }
  if (bmff.uuidClaims.length > 0) {
    const msg = `${bmff.uuidClaims.length} box UUID claim terdeteksi`;
    flaggedReasons.push(msg);
    aiTriggerChecklist.push({
      id: 'trig_uuid',
      layer: 'UUID_BOX',
      severity: 'critical',
      title: `${bmff.uuidClaims.length} UUID Claim Box Tertinggal`,
      detail: bmff.uuidClaims.map((u) => `uuid @0x${u.offset.toString(16)} (${u.uuidHex.slice(0, 16)}...)`).slice(0, 3).join('; '),
    });
  }
  if (bmff.jumbfManifests.length > 0) {
    const msg = `${bmff.jumbfManifests.length} manifes C2PA / JUMBF terdeteksi`;
    flaggedReasons.push(msg);
    aiTriggerChecklist.push({
      id: 'trig_c2pa',
      layer: 'C2PA_JUMBF',
      severity: 'critical',
      title: `${bmff.jumbfManifests.length} Manifes C2PA / JUMBF Content Credentials`,
      detail: bmff.jumbfManifests.map((j) => `${j.boxType} @0x${j.offset.toString(16)} (${j.size}B)`).slice(0, 3).join('; '),
    });
  }
  const flaggedVendorEntries = vendorTags.filter((t) => t.flagged);
  if (flaggedVendorEntries.length > 0) {
    const msg = `Tag vendor/encoder mencurigakan (${flaggedVendorEntries.map((t) => `${t.key}=${t.value}`).slice(0, 3).join('; ')})`;
    flaggedReasons.push(msg);
    aiTriggerChecklist.push({
      id: 'trig_vendor',
      layer: 'VENDOR_TAG',
      severity: 'critical',
      title: 'Signature Encoder / Vendor AI pada Format/Stream Tags',
      detail: flaggedVendorEntries.map((t) => `${t.source}.${t.key}=${t.value}`).slice(0, 4).join(' | '),
    });
  }
  if (combinedAsciiTraces.length > 0) {
    flaggedReasons.push(`Jejak ASCII di bitstream/container: ${combinedAsciiTraces.join(', ')}`);
  }
  for (const vf of avForensics.visual.visualAiFlags) {
    flaggedReasons.push(`[Visual AI] ${vf}`);
    aiTriggerChecklist.push({
      id: `trig_vis_${aiTriggerChecklist.length}`,
      layer: 'CONTAINER_MUXER',
      severity: 'warning',
      title: 'Anomali Forensik Visual / Muxer MP4',
      detail: vf,
    });
  }
  for (const af of avForensics.audio.audioAiFlags) {
    flaggedReasons.push(`[Audio AI] ${af}`);
    aiTriggerChecklist.push({
      id: `trig_aud_${aiTriggerChecklist.length}`,
      layer: 'CONTAINER_MUXER',
      severity: 'warning',
      title: 'Anomali Forensik Audio / Vocoder AI',
      detail: af,
    });
  }

  // Build readable raw ffprobe diagnostic summary text
  const rawSummaryLines: string[] = [
    `$ ${ffprobeCommandStr}`,
    `[FORMAT] name=${fmt.format_name || 'mp4'} | brand=${fmtTags.major_brand || '-'} (minor=${fmtTags.minor_version || '-'}, compat=${fmtTags.compatible_brands || '-'}) | streams=${fmt.nb_streams || streams.length} | duration=${Number(fmt.duration || 0).toFixed(3)}s`,
    `[FORMAT.TAGS] ${Object.entries(fmtTags).map(([k, v]) => `${k}="${v}"`).join(', ') || '(none)'}`,
    ...streams.map(
      (s) =>
        `[STREAM #${s.index}] type=${s.codec_type} codec=${s.codec_name} handler="${s.tags?.handler_name || '-'}" fps=${s.r_frame_rate || '-'} b_frames=${s.has_b_frames ?? '-'} start=${s.start_time ?? '0'} tags=${JSON.stringify(s.tags || {})}`
    ),
    `[FRAME SIDE_DATA] count=${ffprobeFramesSideData.length}${ffprobeFramesSideData.length > 0 ? ' -> ' + ffprobeFramesSideData.slice(0, 3).map((x) => `${x.sideData?.side_data_type}@${x.ptsTime}s`).join(', ') : ' (none)'}`,
    `[BITSTREAM SEI] total=${totalSeiUnits} (H264_T6=${type6Count}, HEVC_T39=${type39Count}, HEVC_T40=${type40Count}) payload_types=[${combinedPayloadTypes.join(',') || 'none'}]`,
    ...isolatedSeiUnits.slice(0, 6).map(
      (u) => `  - SEI #${u.index} [${u.source}] nal=${u.nalUnitType} pt=${u.payloadType} size=${u.sizeBytes}B uuid=${u.uuid16Hex || '-'} ascii="${u.decodedAscii}"`
    ),
    `[C2PA/UUID/META BOXES] total=${isolatedMetadataBlocks.length} (UUID=${bmff.uuidClaims.length}, JUMBF=${bmff.jumbfManifests.length}, DATA_STREAMS=${dataStreams.length})`,
    ...isolatedMetadataBlocks.slice(0, 8).map(
      (b) => `  - [${b.category}] ${b.boxOrStreamName} @${b.offsetHex} (${b.sizeBytes}B) -> ${b.triggerReason}`
    ),
  ];

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
    ffprobeDiagnostic: {
      commandExecuted: ffprobeCommandStr,
      rawFfprobeSummaryText: rawSummaryLines.join('\n'),
      packetSideDataCount: ffprobeFramesSideData.length,
      dataStreamsCount: dataStreams.length,
      isolatedSeiUnits,
      isolatedMetadataBlocks,
      aiTriggerChecklist,
    },
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
