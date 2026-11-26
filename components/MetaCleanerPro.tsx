'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createFile } from 'mp4box';
import {
  Activity,
  AlertTriangle,
  Bug,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Cpu,
  Download,
  Eye,
  FileSearch,
  Layers,
  RefreshCw,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Trash2,
  UploadCloud,
  Volume2,
  WifiOff,
  Zap,
} from 'lucide-react';
import type { ExternalProbeReport } from '@/lib/video-probe';
import type { CleanerProgressState } from '@/lib/meta-cleaner-progress';
import { WatermarkNoiseVisualizer } from './WatermarkNoiseVisualizer';
import { analyzeVideoHumanization } from '@/lib/humanization-analyzer';

interface LogEntry {
  id: string;
  time: string;
  text: string;
  color: 'slate' | 'emerald' | 'indigo' | 'amber' | 'rose';
}

interface InspectionState {
  synthId: string;
  synthIdClean: boolean | null;
  c2pa: string;
  c2paClean: boolean | null;
  uuid: string;
  uuidClean: boolean | null;
  encoder: string;
  encoderClean: boolean | null;
  sei: string;
  seiClean: boolean | null;
  seiCount: number;
  hex: string;
  containerType: string;
  containerClean: boolean | null;
  riskText: string;
  riskClean: boolean | null;
  badgeText: string;
  badgeClean: boolean | null;
}

const INITIAL_BEFORE_STATE: InspectionState = {
  synthId: 'Menunggu berkas...',
  synthIdClean: null,
  c2pa: 'Menunggu berkas...',
  c2paClean: null,
  uuid: 'Menunggu berkas...',
  uuidClean: null,
  encoder: 'Menunggu berkas...',
  encoderClean: null,
  sei: 'Menunggu berkas...',
  seiClean: null,
  seiCount: 0,
  hex: '-',
  containerType: 'Menunggu berkas...',
  containerClean: null,
  riskText: 'Belum Dianalisis',
  riskClean: null,
  badgeText: 'STANDBY',
  badgeClean: null,
};

const INITIAL_AFTER_STATE: InspectionState = {
  synthId: 'Menunggu proses...',
  synthIdClean: null,
  c2pa: 'Menunggu proses...',
  c2paClean: null,
  uuid: 'Menunggu proses...',
  uuidClean: null,
  encoder: 'Menunggu proses...',
  encoderClean: null,
  sei: 'Menunggu proses...',
  seiClean: null,
  seiCount: 0,
  hex: '-',
  containerType: 'Menunggu proses...',
  containerClean: null,
  riskText: 'Belum Diproses',
  riskClean: null,
  badgeText: 'MENUNGGU PROSES',
  badgeClean: null,
};

const VENDOR_SIGNATURES = [
  'Lavf',
  'Lavc',
  'x264 - core',
  'SHOPEE',
  's264',
  'garena',
  'live-tech',
  'SynthID',
  'DeepMind',
  'Google Inc',
  'ISO Media file produced by',
  'Created on:',
  'Veo',
  'Sora',
  'Kling',
  'Runway',
  'Pika',
  'Luma',
  'Hailuo',
  'Midjourney',
  'Seedance',
  'ElevenLabs',
  'com.ai.generator',
  'ai-studio',
  'stable-video',
  'trainedAlgorithmicMedia',
];

const SEI_ASCII_SIGNATURES = [
  'x264 - core',
  'SHOPEE',
  's264',
  'garena',
  'live-tech',
  'Lavf',
  'Lavc',
  'com.ai.generator',
  'ai-studio',
  'runway',
  'pika',
  'sora',
  'veo',
  'seedance',
  'elevenlabs',
  'stable-video',
  'SynthID',
];

const VALID_TOP_BOXES = new Set(['ftyp', 'moov', 'mdat', 'free', 'wide', 'styp', 'skip']);

function validateMp4Buffer(
  bytes: Uint8Array,
  sourceByteLength: number
): { valid: boolean; reason?: string } {
  if (!bytes || bytes.byteLength < 512) {
    return {
      valid: false,
      reason: `Buffer output terlalu kecil (${bytes?.byteLength ?? 0} bytes).`,
    };
  }

  const decoder = new TextDecoder('ascii', { fatal: false });
  if (
    bytes[0] === 0x3c ||
    (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf && bytes[3] === 0x3c)
  ) {
    const snippet = decoder.decode(bytes.subarray(0, 120)).replace(/\s+/g, ' ').trim();
    return {
      valid: false,
      reason: `Server mengembalikan respons non-MP4 (${snippet.slice(0, 70)}...).`,
    };
  }

  if (bytes[0] === 0x7b || bytes[0] === 0x5b) {
    try {
      const parsed = JSON.parse(new TextDecoder('utf-8').decode(bytes));
      if (parsed?.error) return { valid: false, reason: String(parsed.error) };
    } catch {}
    return { valid: false, reason: 'Respons server bukan stream MP4 biner.' };
  }

  const firstBoxType = decoder.decode(bytes.subarray(4, 8));
  if (!VALID_TOP_BOXES.has(firstBoxType)) {
    return { valid: false, reason: `Header MP4 tidak valid ("${firstBoxType}").` };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let hasMoov = false;
  let hasMdat = false;
  let offset = 0;

  while (offset + 8 <= bytes.byteLength) {
    let size = view.getUint32(offset, false);
    const type = decoder.decode(bytes.subarray(offset + 4, offset + 8));
    let headerSize = 8;
    if (size === 1) {
      if (offset + 16 > bytes.byteLength) break;
      size = view.getUint32(offset + 8, false) * 4294967296 + view.getUint32(offset + 12, false);
      headerSize = 16;
    } else if (size === 0) {
      size = bytes.byteLength - offset;
    }
    if (size < headerSize || offset + size > bytes.byteLength) break;
    if (type === 'moov') hasMoov = true;
    else if (type === 'mdat') hasMdat = true;
    offset += size;
  }

  const minRequiredBytes = Math.min(8192, Math.max(1024, Math.floor(sourceByteLength * 0.05)));
  if (!hasMoov && !hasMdat) {
    return { valid: false, reason: 'Atom moov/mdat tidak ditemukan dalam output MP4.' };
  }
  if (bytes.byteLength < minRequiredBytes) {
    return { valid: false, reason: `Ukuran output (${bytes.byteLength}B) di bawah batas minimum.` };
  }
  return { valid: true };
}

function findMdatRanges(bytes: Uint8Array): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder('ascii', { fatal: false });
  let offset = 0;

  while (offset + 8 <= bytes.length) {
    let size = view.getUint32(offset, false);
    const type = decoder.decode(bytes.subarray(offset + 4, offset + 8));
    let headerSize = 8;
    if (size === 1) {
      if (offset + 16 > bytes.length) break;
      size = view.getUint32(offset + 8, false) * 4294967296 + view.getUint32(offset + 12, false);
      headerSize = 16;
    } else if (size === 0) {
      size = bytes.length - offset;
    }
    if (size < headerSize || offset + size > bytes.length) break;
    if (type === 'mdat') ranges.push({ start: offset + headerSize, end: offset + size });
    offset += size;
  }

  return ranges;
}

async function inspectVideoBuffer(
  uint8: Uint8Array,
  isAfter = false,
  cameraProfile: 'samsung' | 'apple' | 'xiaomi' | 'neutral' = 'samsung'
): Promise<InspectionState> {
  let hexStr = '';
  for (let i = 0; i < Math.min(24, uint8.length); i++) {
    hexStr += uint8[i].toString(16).padStart(2, '0').toUpperCase() + ' ';
  }

  const isFtypHeader =
    uint8.length >= 12 &&
    uint8[4] === 0x66 &&
    uint8[5] === 0x74 &&
    uint8[6] === 0x79 &&
    uint8[7] === 0x70;

  const textDecoder = new TextDecoder('ascii', { fatal: false });
  let detectedBrand = 'isom';
  if (isFtypHeader && uint8.length >= 12) {
    const rawBrand = textDecoder.decode(uint8.subarray(8, 12)).replace(/[^a-zA-Z0-9]/g, '');
    if (rawBrand.length >= 3) detectedBrand = rawBrand;
  }

  let rawC2paFound = false;
  let rawUuidFound = false;
  let rawUdtaMetaFound = false;
  const rawVendors: string[] = [];

  let atomPos = 0;
  while (atomPos + 8 <= uint8.length) {
    let size =
      ((uint8[atomPos] << 24) >>> 0) +
      ((uint8[atomPos + 1] << 16) >>> 0) +
      ((uint8[atomPos + 2] << 8) >>> 0) +
      (uint8[atomPos + 3] >>> 0);
    const type = textDecoder.decode(uint8.subarray(atomPos + 4, atomPos + 8));
    let hdr = 8;
    if (size === 1) {
      if (atomPos + 16 > uint8.length) break;
      const hi =
        ((uint8[atomPos + 8] << 24) >>> 0) +
        ((uint8[atomPos + 9] << 16) >>> 0) +
        ((uint8[atomPos + 10] << 8) >>> 0) +
        (uint8[atomPos + 11] >>> 0);
      const lo =
        ((uint8[atomPos + 12] << 24) >>> 0) +
        ((uint8[atomPos + 13] << 16) >>> 0) +
        ((uint8[atomPos + 14] << 8) >>> 0) +
        (uint8[atomPos + 15] >>> 0);
      size = hi * 4294967296 + lo;
      hdr = 16;
    } else if (size === 0) {
      size = uint8.length - atomPos;
    }
    if (size < hdr || atomPos + size > uint8.length) break;

    if (type === 'uuid') {
      rawUuidFound = true;
      const uuidHex = Array.from(uint8.subarray(atomPos + hdr, Math.min(atomPos + hdr + 16, uint8.length)))
        .map((x) => x.toString(16).padStart(2, '0'))
        .join('');
      if (uuidHex.toLowerCase().includes('d8fec3d3')) rawC2paFound = true;
    } else if (type === 'c2pa' || type === 'jumb' || type === 'c2ma' || type === 'c2cl') {
      rawC2paFound = true;
    } else if (type === 'moov') {
      const moovEnd = atomPos + size;
      let mPos = atomPos + hdr;
      while (mPos + 8 <= moovEnd) {
        const mSize =
          ((uint8[mPos] << 24) >>> 0) +
          ((uint8[mPos + 1] << 16) >>> 0) +
          ((uint8[mPos + 2] << 8) >>> 0) +
          (uint8[mPos + 3] >>> 0);
        const mType = textDecoder.decode(uint8.subarray(mPos + 4, mPos + 8));
        if (mSize < 8 || mPos + mSize > moovEnd) break;
        if (mType === 'udta' || mType === 'meta') {
          const sampleSlice = textDecoder.decode(uint8.subarray(mPos + 8, Math.min(mPos + mSize, mPos + 2048)));
          for (const vs of VENDOR_SIGNATURES) {
            if (sampleSlice.includes(vs)) {
              rawVendors.push(vs);
              rawUdtaMetaFound = true;
            }
          }
        }
        mPos += mSize;
      }
    }
    atomPos += size;
  }

  const mdatRanges = findMdatRanges(uint8);
  let directMdatSeiCount = 0;
  const detectedSeiDetails: string[] = [];

  for (const range of mdatRanges) {
    let pos = range.start;
    const scanLimit = Math.min(range.end, range.start + 25 * 1024 * 1024);
    while (pos + 8 <= scanLimit) {
      const nalLen =
        ((uint8[pos] << 24) >>> 0) +
        ((uint8[pos + 1] << 16) >>> 0) +
        ((uint8[pos + 2] << 8) >>> 0) +
        (uint8[pos + 3] >>> 0);
      if (nalLen < 4 || pos + 4 + nalLen > range.end) {
        pos++;
        continue;
      }
      const nalHdr = uint8[pos + 4];
      const nalType = nalHdr & 0x1f;
      if ((nalType === 6 && (nalHdr & 0xe0) === 0) || nalType === 39 || nalType === 40) {
        const payloadType = uint8[pos + 5];
        if (payloadType === 5 || payloadType === 4 || payloadType === 0) {
          directMdatSeiCount++;
          const payloadSlice = textDecoder.decode(uint8.subarray(pos + 5, Math.min(pos + 4 + nalLen, pos + 120)));
          for (const sig of SEI_ASCII_SIGNATURES) {
            if (payloadSlice.includes(sig) && !detectedSeiDetails.includes(sig)) {
              detectedSeiDetails.push(sig);
            }
          }
        }
      }
      pos += 4 + nalLen;
    }
  }

  const nonMdatSlices: Uint8Array[] = [];
  let nonMdatCursor = 0;
  for (const r of mdatRanges) {
    const boxHeaderStart = Math.max(0, r.start - 8);
    if (boxHeaderStart > nonMdatCursor) nonMdatSlices.push(uint8.subarray(nonMdatCursor, boxHeaderStart));
    nonMdatCursor = Math.max(nonMdatCursor, r.end);
  }
  if (nonMdatCursor < uint8.length) nonMdatSlices.push(uint8.subarray(nonMdatCursor, uint8.length));
  const containerLower = nonMdatSlices.map((s) => textDecoder.decode(s)).join('\n').toLowerCase();
  for (const vs of VENDOR_SIGNATURES) {
    if (containerLower.includes(vs.toLowerCase()) && !rawVendors.includes(vs)) rawVendors.push(vs);
  }

  const mp4Analysis = await new Promise<{
    c2paFound: boolean;
    uuidFound: boolean;
    udtaMetaFound: boolean;
    uniqueVendors: string[];
    seiNalCount: number;
    samplesProcessed: number;
  }>((resolve) => {
    try {
      const mp4boxfile = createFile();
      const ab = uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength) as any;
      ab.fileStart = 0;

      let c2paFound = rawC2paFound;
      let uuidFound = rawUuidFound;
      let udtaMetaFound = rawUdtaMetaFound;
      const detectedVendors = [...rawVendors];
      let seiNalCount = directMdatSeiCount;
      let samplesProcessed = 0;
      let resolved = false;

      const finish = () => {
        if (!resolved) {
          resolved = true;
          try {
            mp4boxfile.stop();
          } catch {}
          resolve({
            c2paFound,
            uuidFound,
            udtaMetaFound,
            uniqueVendors: Array.from(new Set(detectedVendors)),
            seiNalCount,
            samplesProcessed,
          });
        }
      };

      mp4boxfile.onError = () => finish();
      mp4boxfile.onReady = (info: any) => {
        if (Array.isArray(info.tracks)) {
          for (const trk of info.tracks) {
            const trkName = String(trk.name || '');
            if (/Google|Veo|SynthID|com\.ai\.generator|SHOPEE/i.test(trkName)) {
              detectedVendors.push('Google/Veo Handler');
            }
          }
        }
        const vTrack = info.tracks?.find((t: any) => t.video);
        if (vTrack) {
          mp4boxfile.setExtractionOptions(vTrack.id, null, { nbSamples: 200 });
          mp4boxfile.start();
        } else {
          finish();
        }
      };

      mp4boxfile.onSamples = (_trackId: number, _ref: any, samples: any[]) => {
        samplesProcessed += samples.length;
        for (const sample of samples) {
          const d = sample.data as Uint8Array;
          if (!d) continue;
          let off = 0;
          while (off + 4 < d.length) {
            const nalLen =
              ((d[off] << 24) >>> 0) +
              ((d[off + 1] << 16) >>> 0) +
              ((d[off + 2] << 8) >>> 0) +
              (d[off + 3] >>> 0);
            if (nalLen <= 0 || off + 4 + nalLen > d.length) break;
            const nalType = d[off + 4] & 0x1f;
            if (nalType === 6 || nalType === 39 || nalType === 40) {
              const pt = d[off + 5];
              if (pt === 5 || pt === 4 || pt === 0) seiNalCount++;
            }
            off += 4 + nalLen;
          }
        }
        if (samplesProcessed >= 150) finish();
      };

      mp4boxfile.appendBuffer(ab);
      mp4boxfile.flush();
      setTimeout(finish, 700);
    } catch {
      resolve({
        c2paFound: rawC2paFound,
        uuidFound: rawUuidFound,
        udtaMetaFound: rawUdtaMetaFound,
        uniqueVendors: Array.from(new Set(rawVendors)),
        seiNalCount: directMdatSeiCount,
        samplesProcessed: 0,
      });
    }
  });

  const totalSeiUnits = mp4Analysis.samplesProcessed > 0 ? mp4Analysis.seiNalCount : directMdatSeiCount;
  const allVendors = Array.from(new Set([...mp4Analysis.uniqueVendors, ...rawVendors]));
  const seiFound = totalSeiUnits > 0;
  const hasThreat =
    mp4Analysis.c2paFound ||
    mp4Analysis.uuidFound ||
    mp4Analysis.udtaMetaFound ||
    seiFound ||
    allVendors.length > 0;

  let encoderStatusText = 'BERSIH (Standard Handler)';
  if (allVendors.length > 0) {
    encoderStatusText = `TERDETEKSI (${allVendors.join(', ')})`;
  } else if (isAfter) {
    encoderStatusText =
      cameraProfile === 'apple'
        ? 'Apple iPhone 15 Pro (Core Media Video)'
        : cameraProfile === 'samsung'
          ? 'Samsung Galaxy S24 Ultra (VideoHandle)'
          : cameraProfile === 'xiaomi'
            ? 'Xiaomi 14 Ultra (HyperOS / Leica)'
            : 'Standar Bitexact Clean';
  }

  return {
    synthId: hasThreat
      ? 'TERDETEKSI (SynthID / Marker AI)'
      : isAfter
        ? 'BERSIH (Watermark & Marker Dihapus)'
        : 'BERSIH / TIDAK TERDETEKSI HEADER',
    synthIdClean: !hasThreat,
    c2pa: mp4Analysis.c2paFound ? 'TERDETEKSI (c2pa/jumb)' : '0 Box (Bersih)',
    c2paClean: !mp4Analysis.c2paFound,
    uuid: mp4Analysis.uuidFound
      ? 'TERDETEKSI (uuid Manifest)'
      : mp4Analysis.udtaMetaFound
        ? 'TERDETEKSI (udta AI Tag)'
        : '0 Box (Bersih)',
    uuidClean: !mp4Analysis.uuidFound && !mp4Analysis.udtaMetaFound,
    encoder: encoderStatusText,
    encoderClean: allVendors.length === 0,
    sei: seiFound
      ? `TERDETEKSI (${totalSeiUnits} unit${detectedSeiDetails.length > 0 ? ` • ${detectedSeiDetails.join('/')}` : ''})`
      : '0 Unit SEI (Bersih)',
    seiClean: !seiFound,
    seiCount: totalSeiUnits,
    hex: hexStr.trim() || '-',
    containerType: isFtypHeader ? `ftyp ${detectedBrand}` : 'ISO Base Media',
    containerClean: true,
    riskText: hasThreat
      ? `Terdeteksi AI (${seiFound ? 'SEI Bitstream' : mp4Analysis.c2paFound || mp4Analysis.uuidFound ? 'C2PA / UUID' : 'Vendor Tag'})`
      : isAfter
        ? `AMAN / LOLOS DETEKTOR AI (${cameraProfile.toUpperCase()})`
        : 'AMAN HEADER (Menunggu Audit Audio-Visual)',
    riskClean: !hasThreat,
    badgeText: hasThreat
      ? 'JEJAK AI TERDETEKSI'
      : isAfter
        ? 'CLEAN ORGANIC (100%)'
        : 'HEADER BERSIH',
    badgeClean: !hasThreat,
  };
}

export const MetaCleanerPro: React.FC = () => {
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [previewUrlBefore, setPreviewUrlBefore] = useState<string | null>(null);
  const [previewUrlAfter, setPreviewUrlAfter] = useState<string | null>(null);
  const [cameraProfile, setCameraProfile] = useState<'samsung' | 'apple' | 'xiaomi' | 'neutral'>('samsung');
  const [upscale1080p, setUpscale1080p] = useState<boolean>(true);

  const [fileStatus, setFileStatus] = useState<{ text: string; color: 'amber' | 'emerald' | 'rose' }>({
    text: 'Menunggu Berkas',
    color: 'amber',
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState('SIAP');
  const [isDragging, setIsDragging] = useState(false);

  const [beforeState, setBeforeState] = useState<InspectionState>(INITIAL_BEFORE_STATE);
  const [afterState, setAfterState] = useState<InspectionState>(INITIAL_AFTER_STATE);

  const [beforeProbe, setBeforeProbe] = useState<ExternalProbeReport | null>(null);
  const [afterProbe, setAfterProbe] = useState<ExternalProbeReport | null>(null);
  const [isProbingBefore, setIsProbingBefore] = useState(false);
  const [isProbingAfter, setIsProbingAfter] = useState(false);
  const [probeErrorBefore, setProbeErrorBefore] = useState<string | null>(null);
  const [probeErrorAfter, setProbeErrorAfter] = useState<string | null>(null);

  // Single collapsed Forensic Audit & Log drawer (collapsed by default for clean AIO UX)
  const [showAuditDrawer, setShowAuditDrawer] = useState(false);
  const [auditTab, setAuditTab] = useState<'av' | 'diag' | 'heatmap' | 'logs'>('av');
  const [diagTarget, setDiagTarget] = useState<'before' | 'after'>('after');
  const [showRawProbeJson, setShowRawProbeJson] = useState(false);
  const [copiedDiag, setCopiedDiag] = useState(false);

  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'uploaded' | 'error'>('idle');
  const [uploadPercent, setUploadPercent] = useState<number>(0);
  const [uploadedBytes, setUploadedBytes] = useState<number>(0);
  const [uploadChunkInfo, setUploadChunkInfo] = useState<{ current: number; total: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [serverUploadId, setServerUploadId] = useState<string | null>(null);

  const [cloudProgress, setCloudProgress] = useState<CleanerProgressState | null>(null);
  const [displayedPercent, setDisplayedPercent] = useState<number>(0);
  const [serverDownloadUrl, setServerDownloadUrl] = useState<string | null>(null);
  const [lastJobId, setLastJobId] = useState<string | null>(null);
  const [supportsNativeShare, setSupportsNativeShare] = useState(false);
  const [networkWarning, setNetworkWarning] = useState<string | null>(null);
  const [autoCleanExpiresAt, setAutoCleanExpiresAt] = useState<string | null>(null);
  const [autoCleanRemainingSec, setAutoCleanRemainingSec] = useState<number | null>(null);
  const [isServerCleanedUp, setIsServerCleanedUp] = useState(false);
  const [isCleaningServerNow, setIsCleaningServerNow] = useState(false);
  const [isSweepingDormant, setIsSweepingDormant] = useState(false);

  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 'init-1',
      time: '--:--:--',
      text: '[MetaCleaner AIO] Pipeline terpadu aktif: Deep Scrambler + Zero-SEI Remux + Organic CMOS Grain + Dual-Mic Stereo Air.',
      color: 'indigo',
    },
  ]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const seenServerLogRef = useRef<Set<string>>(new Set());
  const activeJobIdRef = useRef<string | null>(null);
  const abortPollingRef = useRef<boolean>(false);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const serverUploadIdRef = useRef<string | null>(null);
  const lastJobIdRef = useRef<string | null>(null);

  useEffect(() => {
    serverUploadIdRef.current = serverUploadId;
  }, [serverUploadId]);

  useEffect(() => {
    lastJobIdRef.current = lastJobId;
  }, [lastJobId]);

  useEffect(() => {
    setSupportsNativeShare(
      typeof navigator !== 'undefined' && typeof navigator.share === 'function'
    );
  }, []);

  useEffect(() => {
    const target = cloudProgress ? Math.min(100, Math.max(0, cloudProgress.percent || 0)) : 0;
    if (!cloudProgress) {
      setDisplayedPercent(0);
      return;
    }
    if (cloudProgress.stage === 'failed' || cloudProgress.stage === 'completed') {
      setDisplayedPercent(target);
      return;
    }
    if (displayedPercent >= target) return;
    const step = target - displayedPercent > 8 ? 2 : 1;
    const t = setTimeout(() => {
      setDisplayedPercent((prev) => Math.min(target, prev + step));
    }, 85);
    return () => clearTimeout(t);
  }, [cloudProgress, displayedPercent]);

  const appendLog = useCallback((text: string, color: LogEntry['color'] = 'slate') => {
    const time = new Date().toLocaleTimeString('id-ID');
    setLogs((prev) => [
      ...prev.slice(-120),
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, time, text, color },
    ]);
  }, []);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs, showAuditDrawer, auditTab]);

  useEffect(() => {
    return () => {
      if (previewUrlBefore?.startsWith('blob:')) URL.revokeObjectURL(previewUrlBefore);
      if (previewUrlAfter?.startsWith('blob:')) URL.revokeObjectURL(previewUrlAfter);
    };
  }, [previewUrlBefore, previewUrlAfter]);

  const cleanupServerFilesNow = useCallback(
    async (opts?: { jobId?: string | null; uploadId?: string | null; silent?: boolean }) => {
      const targetJobId = opts?.jobId ?? lastJobIdRef.current;
      const targetUploadId = opts?.uploadId ?? serverUploadIdRef.current;
      if (!targetJobId && !targetUploadId) return;
      if (!opts?.silent) setIsCleaningServerNow(true);
      try {
        const params = new URLSearchParams();
        if (targetJobId) params.set('jobId', targetJobId);
        if (targetUploadId) params.set('uploadId', targetUploadId);
        await fetch(`/api/meta-cleaner/download?${params.toString()}`, {
          method: 'DELETE',
          credentials: 'include',
          cache: 'no-store',
        }).catch(() => {});

        if (!opts?.silent) {
          setIsServerCleanedUp(true);
          setAutoCleanRemainingSec(0);
          setServerDownloadUrl(null);
          setServerUploadId(null);
          setUploadStatus('idle');
          setUploadPercent(0);
          try {
            sessionStorage.removeItem('metacleaner_active_job');
          } catch {}
          appendLog('✓ [SERVER CLEANED] File input & hasil dibersihkan dari server.', 'emerald');
        }
      } finally {
        if (!opts?.silent) setIsCleaningServerNow(false);
      }
    },
    [appendLog]
  );

  const sweepDormantServerNow = useCallback(async () => {
    setIsSweepingDormant(true);
    try {
      const res = await fetch('/api/meta-cleaner/download?sweep=dormant', {
        method: 'DELETE',
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) {
        appendLog('⚠️ Gagal membersihkan file dormant pada server.', 'amber');
        return;
      }
      const data = (await res.json()) as { removedCount?: number; freedBytes?: number };
      const count = data.removedCount ?? 0;
      const freedMb = ((data.freedBytes ?? 0) / (1024 * 1024)).toFixed(2);
      appendLog(
        count > 0
          ? `✓ [SERVER SWEEP] ${count} file dormant (${freedMb} MB) dibersihkan dari server.`
          : '✓ [SERVER SWEEP] Direktori temporary server sudah bersih (0 file dormant).',
        'emerald'
      );
    } catch {
      appendLog('⚠️ Gagal menghubungi server saat sweeping dormant.', 'amber');
    } finally {
      setIsSweepingDormant(false);
    }
  }, [appendLog]);

  useEffect(() => {
    if (!autoCleanExpiresAt || isServerCleanedUp) return;
    const updateTimer = () => {
      const expiresMs = Date.parse(autoCleanExpiresAt);
      if (!Number.isFinite(expiresMs)) return;
      const diffSec = Math.max(0, Math.ceil((expiresMs - Date.now()) / 1000));
      setAutoCleanRemainingSec(diffSec);
      if (diffSec <= 0) {
        setIsServerCleanedUp(true);
        setServerDownloadUrl(null);
        setServerUploadId(null);
        setUploadStatus('idle');
        setUploadPercent(0);
        try {
          sessionStorage.removeItem('metacleaner_active_job');
        } catch {}
        const expiredJobId = lastJobIdRef.current;
        if (expiredJobId) {
          void fetch(`/api/meta-cleaner/progress?jobId=${encodeURIComponent(expiredJobId)}`, {
            cache: 'no-store',
            credentials: 'include',
          }).catch(() => {});
        }
        appendLog('✓ [AUTO-CLEAN 5 MENIT] File video di server telah dihapus otomatis.', 'emerald');
      }
    };
    updateTimer();
    const timer = window.setInterval(updateTimer, 1000);
    return () => window.clearInterval(timer);
  }, [autoCleanExpiresAt, isServerCleanedUp, appendLog]);

  const formatCountdown = (seconds: number | null): string => {
    if (seconds === null || !Number.isFinite(seconds)) return '05:00';
    const s = Math.max(0, Math.floor(seconds));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  const runExternalProbe = useCallback(
    async (
      source: { uploadId?: string; jobId?: string; blob?: Blob; filename: string },
      target: 'before' | 'after'
    ) => {
      if (target === 'before') {
        setIsProbingBefore(true);
        setProbeErrorBefore(null);
      } else {
        setIsProbingAfter(true);
        setProbeErrorAfter(null);
      }

      try {
        let data: any = null;
        let lastErr: Error | null = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            let res: Response;
            if (source.jobId || source.uploadId) {
              res = await fetch('/api/meta-cleaner/probe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  ...(source.jobId ? { jobId: source.jobId } : {}),
                  ...(source.uploadId ? { uploadId: source.uploadId } : {}),
                }),
                cache: 'no-store',
                credentials: 'include',
                signal: AbortSignal.timeout(45000),
              });
            } else if (source.blob) {
              const fd = new FormData();
              fd.append('file', source.blob, source.filename);
              res = await fetch('/api/meta-cleaner/probe', {
                method: 'POST',
                body: fd,
                credentials: 'include',
                signal: AbortSignal.timeout(60000),
              });
            } else {
              throw new Error('Sumber video probe tidak tersedia.');
            }

            const json = await res.json();
            if (!res.ok || !json?.success || !json?.probe) {
              throw new Error(json?.error || `FFprobe status ${res.status}`);
            }
            data = json;
            break;
          } catch (err: any) {
            lastErr = err instanceof Error ? err : new Error(String(err));
            if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 1200));
          }
        }

        if (!data?.probe) throw lastErr || new Error('Gagal menjalankan ffprobe server.');
        const probe = data.probe as ExternalProbeReport;
        const av = probe.audioVisualForensics;

        const mapProbeState = (prev: InspectionState): InspectionState => {
          const seiTotal = probe.seiReport.totalSeiUnits;
          const isOverallClean = probe.cleanliness.overallClean;
          const asciiHint = probe.seiReport.asciiTraces.slice(0, 2).join(', ');
          const avSummary = av
            ? `Risk ${av.aiRiskScore}/100 • ${av.visual.fps}fps${av.visual.hasBFrames ? ' (B-Frame)' : ' (0 B-Frame)'}${av.audio.hasAudio ? ` • Air>17k=${av.audio.highBand17kDb}dB` : ''}`
            : '';

          return {
            ...prev,
            synthId:
              !av.visual.visualClean || !av.audio.audioClean
                ? `TERDETEKSI SINYAL AI (${[...av.visual.visualAiFlags, ...av.audio.audioAiFlags].length} indikator)`
                : target === 'after'
                  ? 'BERSIH TOTAL (Visual + Audio Organik)'
                  : 'BERSIH / ORGANIK',
            synthIdClean: av.visual.visualClean && av.audio.audioClean,
            c2pa: probe.cleanliness.isZeroJumbf ? '0 Box (Bersih)' : `TERDETEKSI (${probe.jumbfManifests.length} manifes)`,
            c2paClean: probe.cleanliness.isZeroJumbf,
            uuid: probe.cleanliness.isZeroUuid ? '0 Box (Bersih)' : `TERDETEKSI (${probe.uuidClaims.length} UUID)`,
            uuidClean: probe.cleanliness.isZeroUuid,
            encoder: !probe.cleanliness.isZeroAiVendor
              ? `TERDETEKSI (${probe.cleanliness.flaggedReasons.find((r) => r.includes('vendor') || r.includes('ASCII')) || 'Vendor Tag'})`
              : `${probe.videoStream?.handlerName || 'VideoHandle'} • Bebas Lavf`,
            encoderClean: probe.cleanliness.isZeroAiVendor,
            sei:
              seiTotal > 0
                ? `TERDETEKSI (${seiTotal} unit${asciiHint ? ` • ${asciiHint}` : ''})`
                : '0 Unit SEI (Bersih)',
            seiClean: seiTotal === 0,
            seiCount: seiTotal,
            riskText: isOverallClean ? `LOLOS 100% (${avSummary})` : `TERDETEKSI AI • ${avSummary}`,
            riskClean: isOverallClean,
            badgeText: isOverallClean
              ? 'CLEAN ORGANIC (0 RISK)'
              : `${av.aiVerdict} (${av.aiRiskScore}/100)`,
            badgeClean: isOverallClean,
          };
        };

        if (target === 'before') {
          setBeforeProbe(probe);
          setBeforeState((prev) => mapProbeState(prev));
        } else {
          setAfterProbe(probe);
          setAfterState((prev) => mapProbeState(prev));
          setDiagTarget('after');
        }

        appendLog(
          `[PROBE ${target.toUpperCase()}] AI Risk=${av.aiRiskScore}/100 (${av.aiVerdict}) | SEI=${probe.seiReport.totalSeiUnits} | FPS=${av.visual.fps} | Silence=${av.audio.digitalSilenceCount} | Air>17k=${av.audio.highBand17kDb}dB | Cliff=${av.audio.airCliffDb}dB | SideGap=${av.audio.stereoSideGapDb}dB`,
          probe.cleanliness.overallClean ? 'emerald' : 'amber'
        );
      } catch (err: any) {
        const msg = err?.message || 'Gagal menjalankan ffprobe server';
        if (target === 'before') setProbeErrorBefore(msg);
        else setProbeErrorAfter(msg);
        appendLog(`[PROBE WARNING (${target.toUpperCase()})] ${msg}`, 'amber');
      } finally {
        if (target === 'before') setIsProbingBefore(false);
        else setIsProbingAfter(false);
      }
    },
    [appendLog]
  );

  // Restore session after reload
  useEffect(() => {
    let cancelled = false;
    const restoreSessionJob = async () => {
      let savedRaw: string | null = null;
      try {
        savedRaw = sessionStorage.getItem('metacleaner_active_job');
      } catch {
        return;
      }
      if (!savedRaw) return;
      let parsed: { jobId?: string; uploadId?: string; fileName?: string } | null = null;
      try {
        parsed = JSON.parse(savedRaw);
      } catch {
        return;
      }
      if (!parsed?.jobId) return;

      try {
        const res = await fetch(`/api/meta-cleaner/progress?jobId=${encodeURIComponent(parsed.jobId)}`, {
          cache: 'no-store',
          credentials: 'include',
          signal: AbortSignal.timeout(12000),
        });
        if (!res.ok || cancelled) return;
        const pData = (await res.json()) as CleanerProgressState;
        if (cancelled || !pData || pData.expired) {
          try {
            sessionStorage.removeItem('metacleaner_active_job');
          } catch {}
          return;
        }
        const outName = parsed.fileName
          ? `${parsed.fileName.replace(/\.[^/.]+$/, '')}_output_bersih.mp4`
          : 'video_output_bersih.mp4';
        setLastJobId(parsed.jobId);
        if (parsed.uploadId) setServerUploadId(parsed.uploadId);
        setCloudProgress(pData);

        if (pData.resultReady || (pData.stage === 'completed' && Boolean(pData.downloadUrl))) {
          setAutoCleanExpiresAt(pData.expiresAt || new Date(Date.now() + 5 * 60 * 1000).toISOString());
          setIsServerCleanedUp(false);
          setServerDownloadUrl(
            `/api/meta-cleaner/download?jobId=${encodeURIComponent(parsed.jobId)}&filename=${encodeURIComponent(outName)}`
          );
          setPreviewUrlAfter(
            `/api/meta-cleaner/download?jobId=${encodeURIComponent(parsed.jobId)}&inline=1&t=${Date.now()}`
          );
          setProgressText('SELESAI 100%');
          void runExternalProbe({ jobId: parsed.jobId, filename: outName }, 'after');
        }
      } catch {}
    };
    void restoreSessionJob();
    return () => {
      cancelled = true;
    };
  }, [runExternalProbe]);

  const uploadVideoToServer = useCallback(
    async (file: File, reuseUploadId?: string): Promise<string> => {
      uploadAbortRef.current?.abort();
      const abortCtrl = new AbortController();
      uploadAbortRef.current = abortCtrl;

      const uploadId = reuseUploadId || `up_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      setServerUploadId(uploadId);
      setUploadStatus('uploading');
      setUploadError(null);
      setIsServerCleanedUp(false);

      const CHUNK_SIZE = file.size > 12 * 1024 * 1024 ? 1 * 1024 * 1024 : 2 * 1024 * 1024;
      const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
      setUploadChunkInfo({ current: 0, total: totalChunks });

      const buildVerifySignal = (ms: number): AbortSignal => {
        const timeoutSig = AbortSignal.timeout(ms);
        const abortSigAny = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
        return typeof abortSigAny === 'function' ? abortSigAny([abortCtrl.signal, timeoutSig]) : timeoutSig;
      };

      const alreadyReceived = new Set<number>();
      if (reuseUploadId) {
        try {
          const checkRes = await fetch(`/api/meta-cleaner/upload?uploadId=${encodeURIComponent(uploadId)}`, {
            cache: 'no-store',
            credentials: 'include',
            signal: buildVerifySignal(10000),
          });
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            if (checkData?.assembled) {
              setUploadedBytes(file.size);
              setUploadPercent(100);
              setUploadStatus('uploaded');
              setUploadChunkInfo({ current: totalChunks, total: totalChunks });
              return uploadId;
            }
            if (Array.isArray(checkData?.receivedChunks)) {
              for (const idx of checkData.receivedChunks) alreadyReceived.add(Number(idx));
            }
          }
        } catch {}
      }

      let completedBytes = 0;
      for (let i = 0; i < totalChunks; i++) {
        if (alreadyReceived.has(i)) {
          completedBytes += Math.min(file.size, (i + 1) * CHUNK_SIZE) - i * CHUNK_SIZE;
        }
      }
      setUploadedBytes(completedBytes);
      setUploadPercent(Math.min(99, Math.round((completedBytes / file.size) * 100)));

      const sendChunkXhr = (chunkIndex: number, chunkBlob: Blob, chunkStartBytes: number): Promise<any> =>
        new Promise((resolve, reject) => {
          if (abortCtrl.signal.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }
          const xhr = new XMLHttpRequest();
          const onAbort = () => xhr.abort();
          abortCtrl.signal.addEventListener('abort', onAbort, { once: true });
          xhr.open('POST', '/api/meta-cleaner/upload', true);
          xhr.withCredentials = true;
          xhr.timeout = 60000;
          xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable) {
              const currentTotal = chunkStartBytes + ev.loaded;
              setUploadedBytes(Math.min(file.size, currentTotal));
              setUploadPercent(Math.min(99, Math.max(1, Math.round((currentTotal / file.size) * 100))));
            }
          };
          xhr.onload = () => {
            abortCtrl.signal.removeEventListener('abort', onAbort);
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                resolve(JSON.parse(xhr.responseText || '{}'));
              } catch {
                resolve({ success: true });
              }
            } else {
              let msg = `HTTP ${xhr.status}`;
              try {
                const parsed = JSON.parse(xhr.responseText || '{}');
                if (parsed?.error) msg = parsed.error;
              } catch {}
              reject(new Error(msg));
            }
          };
          xhr.onerror = () => {
            abortCtrl.signal.removeEventListener('abort', onAbort);
            reject(new Error('Koneksi terputus saat upload chunk.'));
          };
          xhr.ontimeout = () => {
            abortCtrl.signal.removeEventListener('abort', onAbort);
            reject(new Error('Timeout saat upload chunk.'));
          };
          const fd = new FormData();
          fd.append('uploadId', uploadId);
          fd.append('chunkIndex', String(chunkIndex));
          fd.append('totalChunks', String(totalChunks));
          fd.append('filename', file.name);
          fd.append('fileSize', String(file.size));
          fd.append('chunk', chunkBlob, file.name);
          xhr.send(fd);
        });

      try {
        for (let idx = 0; idx < totalChunks; idx++) {
          if (abortCtrl.signal.aborted) throw new DOMException('Aborted', 'AbortError');
          if (alreadyReceived.has(idx)) {
            setUploadChunkInfo({ current: idx + 1, total: totalChunks });
            continue;
          }
          const start = idx * CHUNK_SIZE;
          const end = Math.min(file.size, start + CHUNK_SIZE);
          const chunkBlob = file.slice(start, end);
          setUploadChunkInfo({ current: idx + 1, total: totalChunks });

          let chunkUploaded = false;
          let lastChunkErr: Error | null = null;
          for (let attempt = 1; attempt <= 8; attempt++) {
            if (abortCtrl.signal.aborted) throw new DOMException('Aborted', 'AbortError');
            try {
              await sendChunkXhr(idx, chunkBlob, completedBytes);
              chunkUploaded = true;
              break;
            } catch (err: any) {
              if (err?.name === 'AbortError') throw err;
              lastChunkErr = err instanceof Error ? err : new Error(String(err));
              try {
                const verifyRes = await fetch(`/api/meta-cleaner/upload?uploadId=${encodeURIComponent(uploadId)}`, {
                  cache: 'no-store',
                  credentials: 'include',
                  signal: buildVerifySignal(10000),
                });
                if (verifyRes.ok) {
                  const vData = await verifyRes.json();
                  if (vData?.assembled || (Array.isArray(vData?.receivedChunks) && vData.receivedChunks.includes(idx))) {
                    chunkUploaded = true;
                    break;
                  }
                }
              } catch {}
              if (attempt < 8) {
                setUploadError(`Koneksi lambat bagian ${idx + 1}/${totalChunks} — retry ${attempt}/8...`);
                await new Promise((r) => setTimeout(r, Math.min(10000, attempt * 1500)));
              }
            }
          }
          if (!chunkUploaded) throw lastChunkErr || new Error(`Gagal upload bagian ${idx + 1}/${totalChunks}.`);
          setUploadError(null);
          completedBytes += end - start;
          setUploadedBytes(completedBytes);
          setUploadPercent(Math.min(100, Math.round((completedBytes / file.size) * 100)));
        }

        setUploadPercent(100);
        setUploadedBytes(file.size);
        setUploadStatus('uploaded');
        setUploadError(null);
        appendLog(`✓ [UPLOAD SELESAI] "${file.name}" siap di server.`, 'emerald');
        return uploadId;
      } catch (err: any) {
        if (err?.name === 'AbortError') throw err;
        const msg = err?.message || 'Gagal mengunggah video ke server.';
        setUploadStatus('error');
        setUploadError(msg);
        appendLog(`[UPLOAD ERROR] ${msg}`, 'rose');
        throw err;
      }
    },
    [appendLog]
  );

  const handleFileSelected = async (file: File | null | undefined) => {
    if (!file) return;

    uploadAbortRef.current?.abort();
    abortPollingRef.current = true;
    activeJobIdRef.current = null;
    if (serverUploadIdRef.current || lastJobIdRef.current) {
      void cleanupServerFilesNow({ silent: true });
    }

    if (previewUrlBefore?.startsWith('blob:')) URL.revokeObjectURL(previewUrlBefore);
    if (previewUrlAfter?.startsWith('blob:')) URL.revokeObjectURL(previewUrlAfter);

    setCurrentFile(file);
    setProcessedBlob(null);
    setPreviewUrlAfter(null);
    setServerDownloadUrl(null);
    setLastJobId(null);
    setServerUploadId(null);
    setUploadStatus('idle');
    setUploadPercent(0);
    setUploadedBytes(0);
    setUploadChunkInfo(null);
    setUploadError(null);
    setNetworkWarning(null);
    setAutoCleanExpiresAt(null);
    setAutoCleanRemainingSec(null);
    setIsServerCleanedUp(false);
    setAfterState(INITIAL_AFTER_STATE);
    setBeforeProbe(null);
    setAfterProbe(null);
    setProbeErrorBefore(null);
    setProbeErrorAfter(null);
    setCloudProgress(null);
    setPreviewUrlBefore(URL.createObjectURL(file));
    setFileStatus({ text: 'Memindai Header...', color: 'amber' });

    try {
      const inspectSlice = file.slice(0, 16 * 1024 * 1024);
      const buffer = await inspectSlice.arrayBuffer();
      setFileStatus({ text: 'Siap Upload ke Server', color: 'emerald' });

      const inspected = await inspectVideoBuffer(new Uint8Array(buffer), false);
      setBeforeState(inspected);
      appendLog(`[FILE LOADED] "${file.name}" (${(file.size / (1024 * 1024)).toFixed(2)} MB)`, 'indigo');

      try {
        const upId = await uploadVideoToServer(file);
        void runExternalProbe({ uploadId: upId, filename: file.name }, 'before');
      } catch (upErr: any) {
        if (upErr?.name !== 'AbortError') setFileStatus({ text: 'Upload Tertunda', color: 'amber' });
      }
    } catch (err: any) {
      setFileStatus({ text: 'Gagal Membaca', color: 'rose' });
      appendLog(`[ERROR] ${err?.message || 'Gagal membaca berkas'}`, 'rose');
    }
  };

  const executeAutoSanitization = async () => {
    if (!currentFile || isProcessing) return;

    abortPollingRef.current = false;
    setIsProcessing(true);
    setNetworkWarning(null);
    setProcessedBlob(null);
    if (previewUrlAfter?.startsWith('blob:')) URL.revokeObjectURL(previewUrlAfter);
    setPreviewUrlAfter(null);
    setServerDownloadUrl(null);
    setLastJobId(null);
    setAfterProbe(null);
    setProbeErrorAfter(null);
    setAutoCleanExpiresAt(null);
    setAutoCleanRemainingSec(null);
    setIsServerCleanedUp(false);
    seenServerLogRef.current.clear();

    const baseName = currentFile.name.replace(/\.[^/.]+$/, '');
    const outputFileName = `${baseName}_output_bersih.mp4`;
    const sourceByteLength = currentFile.size;
    let maxUiPercent = 0;

    const syncProgressSnapshot = (pData: CleanerProgressState, holdAtVerification = false) => {
      if (!pData || !pData.stage) return;
      const clampedPct =
        pData.stage === 'failed'
          ? pData.percent
          : holdAtVerification
            ? Math.min(99, Math.max(maxUiPercent, pData.percent || 0))
            : Math.max(maxUiPercent, pData.percent || 0);
      if (pData.stage !== 'failed') maxUiPercent = clampedPct;
      const nextState: CleanerProgressState = holdAtVerification
        ? {
            ...pData,
            stage: 'binary_sanitize',
            percent: clampedPct,
            message: 'Memverifikasi 0 SEI, atom MOOV & kesiapan file bersih...',
          }
        : { ...pData, percent: clampedPct };
      setCloudProgress(nextState);
      const framePart =
        nextState.frame > 0
          ? ` • Frame ${nextState.frame}${nextState.totalFrames > 0 ? `/${nextState.totalFrames}` : ''}`
          : '';
      setProgressText(`${clampedPct}%${framePart}`);

      if (Array.isArray(pData.logs)) {
        for (const line of pData.logs) {
          if (!seenServerLogRef.current.has(line)) {
            seenServerLogRef.current.add(line);
            appendLog(`   ${line}`, line.startsWith('✓') ? 'emerald' : 'indigo');
          }
        }
      }
    };

    const jobId = `mc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    activeJobIdRef.current = jobId;

    try {
      let activeUploadId = serverUploadIdRef.current;
      if (!activeUploadId || uploadStatus !== 'uploaded' || isServerCleanedUp) {
        setProgressText('MENGUNGGAH KE SERVER...');
        activeUploadId = await uploadVideoToServer(
          currentFile,
          activeUploadId && !isServerCleanedUp ? activeUploadId : undefined
        );
      }
      if (abortPollingRef.current) return;

      if (!beforeProbe && !isProbingBefore) {
        void runExternalProbe({ uploadId: activeUploadId, filename: currentFile.name }, 'before');
      }

      setProgressText('MEMULAI PROSES AIO...');
      setCloudProgress({
        jobId,
        uploadId: activeUploadId,
        stage: 'queued',
        message: 'Memulai pembersihan All-in-One di server...',
        percent: 3,
        frame: 0,
        totalFrames: 0,
        fps: 0,
        speed: '0x',
        outTimeSec: 0,
        durationSec: 0,
        engine: 'MetaCleaner AIO Server Pipeline',
        logs: [],
        updatedAt: new Date().toISOString(),
        ttlSeconds: 300,
      });

      let startAck: any = null;
      let startErr: Error | null = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        if (attempt > 1) {
          try {
            const verifyJobRes = await fetch(`/api/meta-cleaner/progress?jobId=${encodeURIComponent(jobId)}`, {
              cache: 'no-store',
              credentials: 'include',
              signal: AbortSignal.timeout(10000),
            });
            if (verifyJobRes.ok) {
              const existingState = (await verifyJobRes.json()) as CleanerProgressState;
              if (existingState?.stage && existingState.stage !== 'queued' && existingState.stage !== 'failed') {
                startAck = { accepted: true };
                break;
              }
            }
          } catch {}
        }

        try {
          const startRes = await fetch('/api/meta-cleaner', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              uploadId: activeUploadId,
              jobId,
              mode: 'all_in_one',
              deepMetaPurge: true,
              forceKeyframeInsertion: false,
              cameraProfile,
              upscale1080p,
              deepScan: true,
              humanizationPreset: 'full_human',
              synthidScrambleMode: 'aggressive',
            }),
            cache: 'no-store',
            credentials: 'include',
            signal: AbortSignal.timeout(25000),
          });
          const json = await startRes.json().catch(() => null);
          if (!startRes.ok || !json?.accepted) {
            if (startRes.status === 404) {
              activeUploadId = await uploadVideoToServer(currentFile);
              continue;
            }
            throw new Error(json?.error || `Gagal memulai job (HTTP ${startRes.status}).`);
          }
          startAck = json;
          break;
        } catch (err: any) {
          startErr = err instanceof Error ? err : new Error(String(err));
          if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 1500));
        }
      }

      if (!startAck?.accepted) throw startErr || new Error('Server gagal memulai antrean MetaCleaner AIO.');

      try {
        sessionStorage.setItem(
          'metacleaner_active_job',
          JSON.stringify({ jobId, uploadId: activeUploadId, fileName: currentFile.name, cameraProfile })
        );
      } catch {}

      const startedAt = Date.now();
      const maxWaitMs = 15 * 60 * 1000;
      let finalState: CleanerProgressState | null = null;
      let lastServerSig = '';
      let lastProgressAdvanceAt = Date.now();
      let latestServerStage = 'queued';

      while (Date.now() - startedAt < maxWaitMs) {
        if (abortPollingRef.current) return;
        const pollDelayMs =
          maxUiPercent >= 75 || latestServerStage === 'pass2_remux' || latestServerStage === 'binary_sanitize'
            ? 300
            : 450;
        await new Promise((r) => setTimeout(r, pollDelayMs));
        if (abortPollingRef.current) return;

        try {
          const needResync = Date.now() - lastProgressAdvanceAt > 18000;
          const pRes = await fetch(
            `/api/meta-cleaner/progress?jobId=${encodeURIComponent(jobId)}${needResync ? '&resync=1' : ''}`,
            { cache: 'no-store', credentials: 'include', signal: AbortSignal.timeout(12000) }
          );
          if (!pRes.ok) {
            setNetworkWarning(`Koneksi lambat (HTTP ${pRes.status}) — proses tetap berjalan di server...`);
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }

          setNetworkWarning(null);
          const rawJson = await pRes.json();
          const pData = (rawJson?.state ? rawJson.state : rawJson) as CleanerProgressState;
          if (pData?.stage) latestServerStage = pData.stage;
          const sig = `${pData.stage}:${pData.percent}:${pData.frame}:${pData.message}`;
          if (sig !== lastServerSig) {
            lastServerSig = sig;
            lastProgressAdvanceAt = Date.now();
          }

          if (pData.expired) {
            setIsServerCleanedUp(true);
            throw new Error('File melewati batas 5 menit dan sudah dihapus otomatis di server.');
          }

          const isTerminalReady =
            Boolean(pData.resultReady) && pData.stage === 'completed' && Boolean(pData.downloadUrl);

          syncProgressSnapshot(pData, isTerminalReady);
          if (isTerminalReady) {
            finalState = pData;
            break;
          }
          if (pData.stage === 'failed') {
            throw new Error(pData.error || pData.message || 'Server FFmpeg gagal memproses video.');
          }
        } catch (pollErr: any) {
          if (
            pollErr?.message?.includes('FFmpeg gagal') ||
            pollErr?.message?.includes('Auto-Clean') ||
            pollErr?.message?.includes('Worker server berhenti') ||
            pollErr?.message?.includes('batas 5 menit')
          ) {
            throw pollErr;
          }
          setNetworkWarning('Koneksi terganggu — menunggu jaringan kembali...');
          await new Promise((r) => setTimeout(r, 1500));
        }
      }

      if (abortPollingRef.current) return;
      if (!finalState) throw new Error('Waktu pemantauan server melebihi batas.');

      setProgressText('VERIFIKASI HASIL (99%)...');
      let downloadHeaderVerified = false;
      for (let hAttempt = 1; hAttempt <= 4; hAttempt++) {
        if (abortPollingRef.current) return;
        try {
          const headProbeRes = await fetch(
            `/api/meta-cleaner/download?jobId=${encodeURIComponent(jobId)}&inline=1`,
            {
              headers: { Range: 'bytes=0-31' },
              cache: 'no-store',
              credentials: 'include',
              signal: AbortSignal.timeout(10000),
            }
          );
          if (headProbeRes.ok || headProbeRes.status === 206) {
            const headerBuf = new Uint8Array(await headProbeRes.arrayBuffer());
            if (
              headerBuf.length >= 8 &&
              headerBuf[4] === 0x66 &&
              headerBuf[5] === 0x74 &&
              headerBuf[6] === 0x79 &&
              headerBuf[7] === 0x70
            ) {
              downloadHeaderVerified = true;
              break;
            }
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 400 * hAttempt));
      }
      if (!downloadHeaderVerified) throw new Error('Struktur MP4 hasil gagal diverifikasi di server.');

      setProgressText('AUDIT FORENSIK SERVER (99%)...');
      await runExternalProbe({ jobId, filename: outputFileName }, 'after');
      if (abortPollingRef.current) return;

      const expiresAtIso = finalState.expiresAt || new Date(Date.now() + 5 * 60 * 1000).toISOString();
      const inlineStreamUrl = `/api/meta-cleaner/download?jobId=${encodeURIComponent(jobId)}&inline=1&t=${Date.now()}`;
      const downloadAttachmentUrl = `/api/meta-cleaner/download?jobId=${encodeURIComponent(jobId)}&filename=${encodeURIComponent(outputFileName)}`;

      let cachedBlob: Blob | null = null;
      const shouldCacheInBrowserRam =
        typeof finalState.outputSizeBytes === 'number' &&
        finalState.outputSizeBytes > 0 &&
        finalState.outputSizeBytes <= 25 * 1024 * 1024;
      if (shouldCacheInBrowserRam) {
        for (let dlAttempt = 1; dlAttempt <= 3; dlAttempt++) {
          if (abortPollingRef.current) return;
          try {
            const dlRes = await fetch(inlineStreamUrl, {
              cache: 'no-store',
              credentials: 'include',
              signal: AbortSignal.timeout(45000),
            });
            if (dlRes.ok) {
              const candidateUint8 = new Uint8Array(await dlRes.arrayBuffer());
              if (validateMp4Buffer(candidateUint8, sourceByteLength).valid) {
                cachedBlob = new Blob([candidateUint8 as unknown as BlobPart], { type: 'video/mp4' });
                setProcessedBlob(cachedBlob);
                setPreviewUrlAfter(URL.createObjectURL(cachedBlob));
                const inspectedAfter = await inspectVideoBuffer(candidateUint8, true, cameraProfile);
                setAfterState((prev) =>
                  prev.riskClean !== null
                    ? { ...prev, hex: inspectedAfter.hex, containerType: inspectedAfter.containerType }
                    : inspectedAfter
                );
                break;
              }
            }
          } catch {
            if (dlAttempt < 3) await new Promise((r) => setTimeout(r, dlAttempt * 1500));
          }
        }
      }

      setLastJobId(jobId);
      setServerDownloadUrl(downloadAttachmentUrl);
      setAutoCleanExpiresAt(expiresAtIso);
      setIsServerCleanedUp(false);
      setNetworkWarning(null);
      if (!cachedBlob) setPreviewUrlAfter(inlineStreamUrl);

      setCloudProgress({ ...finalState, stage: 'completed', percent: 100 });
      setDisplayedPercent(100);
      setProgressText('SELESAI 100%');
      appendLog(
        `✓ [AIO SELESAI 100%] Output terverifikasi (${((finalState.outputSizeBytes || 0) / (1024 * 1024)).toFixed(2)} MB).`,
        'emerald'
      );
    } catch (serverErr: any) {
      if (abortPollingRef.current) return;
      const errMsg = serverErr?.message || 'Gagal menjalankan MetaCleaner AIO.';
      setProgressText('GAGAL');
      setNetworkWarning(null);
      setCloudProgress((prev) =>
        prev ? { ...prev, stage: 'failed', message: `Gagal: ${errMsg}`, error: errMsg } : null
      );
      appendLog(`[ERROR] ${errMsg}`, 'rose');
    } finally {
      if (!abortPollingRef.current) setIsProcessing(false);
    }
  };

  const getOutputFileName = () =>
    `${currentFile ? currentFile.name.replace(/\.[^/.]+$/, '') : 'video'}_output_bersih.mp4`;

  const downloadFromMemoryBlob = () => {
    if (!processedBlob) return;
    const url = URL.createObjectURL(processedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = getOutputFileName();
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (a.parentNode) document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 60000);
  };

  const shareCleanFileMobile = async () => {
    if (!processedBlob) return;
    const fileName = getOutputFileName();
    try {
      const fileObj = new File([processedBlob], fileName, { type: 'video/mp4' });
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' &&
        (typeof navigator.canShare !== 'function' || navigator.canShare({ files: [fileObj] }))
      ) {
        await navigator.share({ files: [fileObj], title: fileName });
        return;
      }
      downloadFromMemoryBlob();
    } catch (err: any) {
      if (err?.name !== 'AbortError') downloadFromMemoryBlob();
    }
  };

  const beforeHumanReport = beforeProbe ? analyzeVideoHumanization(beforeProbe) : null;
  const afterHumanReport = afterProbe ? analyzeVideoHumanization(afterProbe) : null;
  const activeAuditProbe = diagTarget === 'after' && afterProbe ? afterProbe : beforeProbe || afterProbe;
  const activeHumanReport = afterHumanReport || beforeHumanReport;
  const outBytes = processedBlob?.size ?? cloudProgress?.outputSizeBytes ?? 0;

  return (
    <div className="bg-slate-950 text-slate-100 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
      {/* HEADER AIO */}
      <div className="bg-slate-900/90 backdrop-blur border-b border-slate-800 px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-cyan-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-900/30">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-base sm:text-lg leading-tight text-white flex items-center gap-2 flex-wrap">
              <span>MetaCleaner AIO</span>
              <span className="text-[11px] font-mono text-emerald-300">· All-in-One Anti-AI &amp; Zero-SEI</span>
            </h2>
            <p className="text-xs text-slate-400">
              1-Klik pembersihan menyeluruh: Purge SEI/C2PA/UUID, SynthID Scrambler, Organic CMOS &amp; Stereo Room Air.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono font-bold">
          <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 rounded-full flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Upload-First</span>
          </span>
          <span className="hidden sm:flex px-2.5 py-1 bg-cyan-500/10 border border-cyan-500/25 text-cyan-300 rounded-full items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            <span>Auto-Clean 5m</span>
          </span>
        </div>
      </div>

      <div className="p-4 sm:p-6 flex flex-col gap-5">
        {/* UNIFIED AIO UPLOAD & ACTION CARD */}
        <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* DROPZONE */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files?.[0]) handleFileSelected(e.dataTransfer.files[0]);
            }}
            className={`lg:col-span-7 border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition bg-slate-950/60 flex flex-col items-center justify-center gap-2.5 ${
              isDragging ? 'border-emerald-500 bg-emerald-950/20' : 'border-slate-700 hover:border-emerald-500/70'
            }`}
          >
            <div className="w-11 h-11 bg-emerald-500/15 text-emerald-400 rounded-full flex items-center justify-center">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="text-xs sm:text-sm font-semibold text-slate-200">
                {currentFile ? currentFile.name : 'Pilih atau Tarik Berkas Video ke Sini'}
              </p>
              <p className="text-[11px] text-slate-400">
                MP4, MOV, WebM, MKV — {currentFile ? `${(currentFile.size / (1024 * 1024)).toFixed(2)} MB • ` : ''}
                <span className="text-emerald-400 font-semibold">{fileStatus.text}</span>
              </p>
            </div>

            {currentFile && uploadStatus === 'uploading' && (
              <div className="w-full max-w-md bg-slate-900 border border-cyan-500/30 rounded-lg p-2.5 space-y-1.5 text-left" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between text-[10px] font-mono text-cyan-300">
                  <span>Upload Server ({uploadChunkInfo?.current ?? 1}/{uploadChunkInfo?.total ?? 1})</span>
                  <span className="font-bold tabular-nums">{uploadPercent}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all" style={{ width: `${uploadPercent}%` }} />
                </div>
                <div className="text-[10px] font-mono text-slate-400 flex justify-between">
                  <span>{(uploadedBytes / (1024 * 1024)).toFixed(2)} / {(currentFile.size / (1024 * 1024)).toFixed(2)} MB</span>
                  {uploadError && <span className="text-amber-300">{uploadError}</span>}
                </div>
              </div>
            )}

            {currentFile && uploadStatus === 'error' && (
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    const upId = await uploadVideoToServer(currentFile, serverUploadId || undefined);
                    setFileStatus({ text: 'Siap Diproses', color: 'emerald' });
                    void runExternalProbe({ uploadId: upId, filename: currentFile.name }, 'before');
                  } catch {}
                }}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] flex items-center gap-1.5 cursor-pointer"
              >
                <WifiOff className="w-3.5 h-3.5" />
                <span>Lanjutkan Upload Tertunda</span>
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => handleFileSelected(e.target.files?.[0])}
            />
          </div>

          {/* 2 COMPACT AIO CONTROLS + 1-CLICK CTA */}
          <div className="lg:col-span-5 flex flex-col justify-between gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-400 font-semibold">Profil Kamera OEM</span>
                <select
                  value={cameraProfile}
                  onChange={(e) => setCameraProfile(e.target.value as any)}
                  className="bg-slate-900 border border-slate-700 text-cyan-300 text-[11px] font-bold rounded-lg px-2.5 py-1.5 outline-none focus:border-cyan-500 cursor-pointer"
                >
                  <option value="samsung">Samsung Galaxy S24 Ultra</option>
                  <option value="apple">Apple iPhone 15 Pro</option>
                  <option value="xiaomi">Xiaomi 14 Ultra</option>
                  <option value="neutral">Netral Bitexact Clean</option>
                </select>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-400 font-semibold">Resolusi Output</span>
                <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => setUpscale1080p(true)}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition cursor-pointer ${
                      upscale1080p ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    1080p Full-HD
                  </button>
                  <button
                    type="button"
                    onClick={() => setUpscale1080p(false)}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition cursor-pointer ${
                      !upscale1080p ? 'bg-cyan-600/30 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Resolusi Asli
                  </button>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-900/40 text-[10px] font-mono text-emerald-300/90 leading-relaxed">
                Otomatis Aktif: Zero-SEI/C2PA/UUID • SynthID CSPRNG Scramble + Hue Drift • 30fps Shutter Blend + CMOS Grain • Dual-Mic Room Air Audio (192k AAC).
              </div>
            </div>

            <button
              type="button"
              onClick={() => executeAutoSanitization()}
              disabled={!currentFile || isProcessing || uploadStatus === 'uploading'}
              className={
                !currentFile || isProcessing || uploadStatus === 'uploading'
                  ? 'w-full py-3 bg-slate-800 text-slate-500 font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-not-allowed'
                  : 'w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-900/30 transition flex items-center justify-center gap-2 cursor-pointer'
              }
            >
              {isProcessing ? (
                <>
                  <Activity className="w-4 h-4 animate-spin" />
                  <span>{progressText}</span>
                </>
              ) : uploadStatus === 'uploading' ? (
                <>
                  <UploadCloud className="w-4 h-4 animate-pulse" />
                  <span>Mengunggah ({uploadPercent}%)...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Bersihkan Video (All-in-One)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* LIVE CLOUD PROGRESS */}
        {(isProcessing || cloudProgress) && cloudProgress && (
          <div className={`bg-slate-900 border rounded-2xl p-4 space-y-2.5 ${networkWarning ? 'border-amber-500/50' : 'border-indigo-500/30'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <Cpu className={`w-4 h-4 ${cloudProgress.stage === 'failed' ? 'text-rose-400' : cloudProgress.stage === 'completed' ? 'text-emerald-400' : 'text-cyan-400 animate-pulse'}`} />
                <span className="font-bold text-white">{cloudProgress.message}</span>
              </div>
              <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
                {cloudProgress.totalFrames > 0 && (
                  <span>Frame {cloudProgress.frame}/{cloudProgress.totalFrames} • {cloudProgress.speed || '0x'}</span>
                )}
                <span className={`font-extrabold tabular-nums ${cloudProgress.stage === 'failed' ? 'text-rose-400' : cloudProgress.stage === 'completed' ? 'text-emerald-400' : 'text-cyan-400'}`}>
                  {displayedPercent}%
                </span>
              </div>
            </div>

            <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
              <div
                className={`h-full transition-all duration-150 ${
                  cloudProgress.stage === 'failed'
                    ? 'bg-rose-500'
                    : cloudProgress.stage === 'completed'
                      ? 'bg-emerald-500'
                      : 'bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, displayedPercent))}%` }}
              />
            </div>

            {networkWarning && (
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-amber-300">
                <WifiOff className="w-3.5 h-3.5 shrink-0" />
                <span>{networkWarning}</span>
              </div>
            )}

            {cloudProgress.stage === 'failed' && currentFile && (
              <button
                type="button"
                onClick={() => executeAutoSanitization()}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-extrabold flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Coba Proses Ulang</span>
              </button>
            )}
          </div>
        )}

        {/* UNIFIED BEFORE VS AFTER RESULT CARDS */}
        {(currentFile || afterProbe || processedBlob || (lastJobId && !isServerCleanedUp)) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* BEFORE CARD */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 flex flex-col">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2 text-xs font-extrabold text-rose-400 uppercase tracking-wider">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>Sebelum (Input Asli)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {beforeHumanReport && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-200 tabular-nums">
                      Skor {beforeHumanReport.humanizationScore}%
                    </span>
                  )}
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                    beforeState.badgeClean === null
                      ? 'bg-slate-800 text-slate-400'
                      : beforeState.badgeClean
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-rose-500/15 text-rose-400'
                  }`}>
                    {isProbingBefore ? 'MEMINDAI...' : beforeState.badgeText}
                  </span>
                </div>
              </div>

              <div className="bg-slate-950 rounded-xl border border-slate-800 p-3 text-[11px] font-mono space-y-1.5 flex-1">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">SEI / C2PA / UUID:</span>
                  <span className={beforeState.seiClean && beforeState.c2paClean && beforeState.uuidClean ? 'text-emerald-400' : 'text-rose-400 font-bold'}>
                    {beforeProbe
                      ? `${beforeProbe.seiReport.totalSeiUnits} SEI • ${beforeProbe.jumbfManifests.length} C2PA • ${beforeProbe.uuidClaims.length} UUID`
                      : `${beforeState.seiCount} SEI`}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Vendor / Container:</span>
                  <span className="text-slate-200 truncate max-w-[200px]">{beforeState.encoder}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Visual &amp; FPS:</span>
                  <span className={beforeProbe?.audioVisualForensics.visual.visualClean ? 'text-emerald-400' : 'text-amber-300'}>
                    {beforeProbe
                      ? `${beforeProbe.audioVisualForensics.visual.width}x${beforeProbe.audioVisualForensics.visual.height} • ${beforeProbe.audioVisualForensics.visual.fps}fps (${beforeProbe.audioVisualForensics.visual.visualClean ? 'Organik' : 'AI Signal'})`
                      : beforeState.containerType}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Audio &amp; Spektrum:</span>
                  <span className={beforeProbe?.audioVisualForensics.audio.audioClean ? 'text-emerald-400' : 'text-amber-300'}>
                    {beforeProbe
                      ? beforeProbe.audioVisualForensics.audio.hasAudio
                        ? `Air ${beforeProbe.audioVisualForensics.audio.highBand17kDb}dB • Gap ${beforeProbe.audioVisualForensics.audio.stereoSideGapDb}dB (${beforeProbe.audioVisualForensics.audio.audioClean ? 'Organik' : 'AI Audio'})`
                        : 'Tanpa Audio'
                      : 'Menunggu Probe'}
                  </span>
                </div>
                <div className="flex justify-between gap-2 pt-1 border-t border-slate-800/70">
                  <span className="text-slate-500">Status Detektor:</span>
                  <span className={beforeState.riskClean ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold truncate max-w-[210px]'}>
                    {beforeState.riskText}
                  </span>
                </div>
              </div>

              {previewUrlBefore && (
                <video src={previewUrlBefore} controls playsInline className="w-full max-h-48 rounded-xl bg-black object-contain border border-slate-800" />
              )}
            </div>

            {/* AFTER CARD */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 flex flex-col">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-400 uppercase tracking-wider">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>Sesudah (Output AIO)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {afterHumanReport && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 tabular-nums">
                      {beforeHumanReport ? `${beforeHumanReport.humanizationScore}% → ` : ''}
                      {afterHumanReport.humanizationScore}%
                    </span>
                  )}
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                    afterState.badgeClean === null
                      ? 'bg-slate-800 text-slate-400'
                      : afterState.badgeClean
                        ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300'
                        : 'bg-rose-500/20 text-rose-400'
                  }`}>
                    {isProbingAfter ? 'VERIFIKASI...' : afterState.badgeText}
                  </span>
                </div>
              </div>

              <div className="bg-slate-950 rounded-xl border border-slate-800 p-3 text-[11px] font-mono space-y-1.5 flex-1">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">SEI / C2PA / UUID:</span>
                  <span className={afterState.seiClean && afterState.c2paClean && afterState.uuidClean ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                    {afterProbe
                      ? `${afterProbe.seiReport.totalSeiUnits} SEI • ${afterProbe.jumbfManifests.length} C2PA • ${afterProbe.uuidClaims.length} UUID`
                      : afterState.sei}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Kamera OEM:</span>
                  <span className="text-slate-200 truncate max-w-[200px]">{afterState.encoder}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Visual &amp; FPS:</span>
                  <span className={afterProbe?.audioVisualForensics.visual.visualClean ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                    {afterProbe
                      ? `${afterProbe.audioVisualForensics.visual.width}x${afterProbe.audioVisualForensics.visual.height} • ${afterProbe.audioVisualForensics.visual.fps}fps (${afterProbe.audioVisualForensics.visual.visualClean ? 'Organik' : 'Perlu Cek'})`
                      : 'Menunggu proses'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Audio &amp; Spektrum:</span>
                  <span className={afterProbe?.audioVisualForensics.audio.audioClean ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                    {afterProbe
                      ? afterProbe.audioVisualForensics.audio.hasAudio
                        ? `Air ${afterProbe.audioVisualForensics.audio.highBand17kDb}dB • Gap ${afterProbe.audioVisualForensics.audio.stereoSideGapDb}dB (${afterProbe.audioVisualForensics.audio.audioClean ? 'Organik' : 'Perlu Cek'})`
                        : 'Tanpa Audio'
                      : 'Menunggu proses'}
                  </span>
                </div>
                <div className="flex justify-between gap-2 pt-1 border-t border-slate-800/70">
                  <span className="text-slate-500">Ukuran &amp; Status:</span>
                  <span className={afterState.riskClean ? 'text-emerald-400 font-bold' : 'text-slate-300'}>
                    {outBytes > 0 && currentFile?.size
                      ? `${(currentFile.size / (1024 * 1024)).toFixed(2)} MB → ${(outBytes / (1024 * 1024)).toFixed(2)} MB • ${afterProbe?.audioVisualForensics.aiVerdict || 'SIAP'}`
                      : afterState.riskText}
                  </span>
                </div>
              </div>

              {previewUrlAfter && (!isServerCleanedUp || previewUrlAfter.startsWith('blob:')) && (
                <video src={previewUrlAfter} controls playsInline className="w-full max-h-48 rounded-xl bg-black object-contain border border-emerald-800/40" />
              )}

              {(lastJobId || isServerCleanedUp) && (
                <div className={`px-3 py-2 rounded-xl border text-[11px] font-mono flex flex-wrap items-center justify-between gap-2 ${
                  isServerCleanedUp ? 'bg-emerald-950/25 border-emerald-500/30 text-emerald-300' : 'bg-amber-950/25 border-amber-500/35 text-amber-200'
                }`}>
                  {!isServerCleanedUp && autoCleanExpiresAt ? (
                    <>
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        Auto-Clean <strong className="tabular-nums">{formatCountdown(autoCleanRemainingSec)}</strong>
                      </span>
                      <button
                        type="button"
                        disabled={isCleaningServerNow}
                        onClick={() => void cleanupServerFilesNow()}
                        className="px-2 py-1 rounded-md bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 font-bold text-[10px] flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>{isCleaningServerNow ? 'Menghapus...' : 'Hapus Server'}</span>
                      </button>
                    </>
                  ) : (
                    <span>✓ File server telah dibersihkan (Auto-Clean 5m).</span>
                  )}
                </div>
              )}

              <div className="space-y-2">
                {serverDownloadUrl && lastJobId && !isServerCleanedUp ? (
                  <a
                    href={serverDownloadUrl}
                    download={getOutputFileName()}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/40"
                  >
                    <Download className="w-4 h-4" />
                    <span>Unduh Video Bersih ({outBytes > 0 ? `${(outBytes / (1024 * 1024)).toFixed(2)} MB` : getOutputFileName()})</span>
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled={!processedBlob}
                    onClick={downloadFromMemoryBlob}
                    className={
                      processedBlob
                        ? 'w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer'
                        : 'w-full py-2.5 bg-slate-800 text-slate-500 font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-not-allowed'
                    }
                  >
                    <Download className="w-4 h-4" />
                    <span>{processedBlob ? `Unduh Video Bersih (${(processedBlob.size / (1024 * 1024)).toFixed(2)} MB)` : 'Menunggu Hasil Proses'}</span>
                  </button>
                )}

                {processedBlob && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={downloadFromMemoryBlob}
                      className="flex-1 py-1.5 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-[11px] rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Simpan Offline</span>
                    </button>
                    {supportsNativeShare && (
                      <button
                        type="button"
                        onClick={shareCleanFileMobile}
                        className="flex-1 py-1.5 px-3 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-bold text-[11px] rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        <span>Bagikan (HP)</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* COLLAPSIBLE FORENSIC AUDIT & LOG DRAWER (COLLAPSED BY DEFAULT) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setShowAuditDrawer((v) => !v)}
              className="flex items-center gap-2 text-xs font-bold text-slate-200 hover:text-white cursor-pointer"
            >
              {showAuditDrawer ? <ChevronUp className="w-4 h-4 text-cyan-400" /> : <ChevronDown className="w-4 h-4 text-cyan-400" />}
              <FileSearch className="w-4 h-4 text-cyan-400" />
              <span>Audit Forensik &amp; Log</span>
              {activeAuditProbe && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                  {activeAuditProbe.cleanliness.overallClean
                    ? '0 SEI • 0 C2PA • CLEAN'
                    : `${activeAuditProbe.ffprobeDiagnostic?.aiTriggerChecklist.length ?? 0} Pemicu AI`}
                </span>
              )}
            </button>

            <div className="flex items-center gap-2">
              {currentFile && (
                <button
                  type="button"
                  disabled={isProbingBefore || uploadStatus === 'uploading'}
                  onClick={() =>
                    runExternalProbe(
                      serverUploadId && !isServerCleanedUp
                        ? { uploadId: serverUploadId, filename: currentFile.name }
                        : { blob: currentFile, filename: currentFile.name },
                      'before'
                    )
                  }
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-slate-300 flex items-center gap-1 cursor-pointer disabled:opacity-40"
                >
                  <RefreshCw className={`w-3 h-3 ${isProbingBefore ? 'animate-spin' : ''}`} />
                  <span>Probe Input</span>
                </button>
              )}
              {((lastJobId && !isServerCleanedUp) || processedBlob) && (
                <button
                  type="button"
                  disabled={isProbingAfter}
                  onClick={() =>
                    lastJobId && !isServerCleanedUp
                      ? void runExternalProbe({ jobId: lastJobId, filename: getOutputFileName() }, 'after')
                      : processedBlob && void runExternalProbe({ blob: processedBlob, filename: getOutputFileName() }, 'after')
                  }
                  className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-[10px] font-bold text-emerald-300 flex items-center gap-1 cursor-pointer disabled:opacity-40"
                >
                  <RefreshCw className={`w-3 h-3 ${isProbingAfter ? 'animate-spin' : ''}`} />
                  <span>Probe Output</span>
                </button>
              )}
              <button
                type="button"
                disabled={isSweepingDormant}
                onClick={() => void sweepDormantServerNow()}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-bold text-slate-300 flex items-center gap-1 cursor-pointer disabled:opacity-40"
                title="Bersihkan sisa file temporary dormant di server"
              >
                <Trash2 className={`w-3 h-3 text-amber-400 ${isSweepingDormant ? 'animate-pulse' : ''}`} />
                <span>{isSweepingDormant ? 'Membersihkan...' : 'Bersihkan Server'}</span>
              </button>
            </div>
          </div>

          {showAuditDrawer && (
            <div className="border-t border-slate-800 p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      { id: 'av', label: 'Skor & Audio-Visual' },
                      { id: 'diag', label: 'SEI & Atom MP4' },
                      { id: 'heatmap', label: 'Heatmap Noise' },
                      { id: 'logs', label: `Log Server (${logs.length})` },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setAuditTab(tab.id)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                        auditTab === tab.id
                          ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {(auditTab === 'av' || auditTab === 'diag') && (beforeProbe || afterProbe) && (
                  <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                    <button
                      type="button"
                      disabled={!beforeProbe}
                      onClick={() => setDiagTarget('before')}
                      className={`px-2.5 py-1 rounded text-[10px] font-bold cursor-pointer disabled:opacity-40 ${
                        diagTarget === 'before' ? 'bg-rose-500/20 text-rose-300' : 'text-slate-400'
                      }`}
                    >
                      Input
                    </button>
                    <button
                      type="button"
                      disabled={!afterProbe}
                      onClick={() => setDiagTarget('after')}
                      className={`px-2.5 py-1 rounded text-[10px] font-bold cursor-pointer disabled:opacity-40 ${
                        diagTarget === 'after' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400'
                      }`}
                    >
                      Output
                    </button>
                  </div>
                )}
              </div>

              {auditTab === 'av' && (
                <div className="space-y-4">
                  {(probeErrorBefore || probeErrorAfter) && (
                    <div className="p-2.5 rounded-lg bg-rose-950/30 border border-rose-500/30 text-[11px] text-rose-300">
                      {probeErrorAfter || probeErrorBefore}
                    </div>
                  )}
                  {activeHumanReport ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                      {Object.entries(activeHumanReport.breakdown).map(([k, v]) => (
                        <div key={k} className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 space-y-1">
                          <div className="text-[10px] font-mono text-slate-400 uppercase">{k}</div>
                          <div className="text-sm font-extrabold text-slate-100">{v} / 25</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 py-4 text-center">Unggah video untuk melihat rincian forensik.</div>
                  )}

                  {activeAuditProbe && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] font-mono">
                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1.5">
                        <div className="font-bold text-cyan-300 flex items-center gap-1.5 pb-1 border-b border-slate-800">
                          <Eye className="w-3.5 h-3.5" />
                          <span>Forensik Visual ({diagTarget === 'after' && afterProbe ? 'Output' : 'Input'})</span>
                        </div>
                        <div className="flex justify-between"><span className="text-slate-500">Cadence / B-Frames:</span><span>{activeAuditProbe.audioVisualForensics.visual.fps}fps • bf={activeAuditProbe.videoStream?.hasBFrames ?? 0}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">CMOS Grain Static Δ:</span><span>{activeAuditProbe.audioVisualForensics.visual.staticPatchTemporalDiff}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Duplikat Pulldown:</span><span>{((activeAuditProbe.audioVisualForensics.visual.nearDuplicateFrameRatio ?? 0) * 100).toFixed(1)}%</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Moov Free Tombstone:</span><span>{activeAuditProbe.audioVisualForensics.visual.moovFreeBoxCount} box</span></div>
                      </div>

                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1.5">
                        <div className="font-bold text-indigo-300 flex items-center gap-1.5 pb-1 border-b border-slate-800">
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>Forensik Audio ({diagTarget === 'after' && afterProbe ? 'Output' : 'Input'})</span>
                        </div>
                        <div className="flex justify-between"><span className="text-slate-500">Stereo Mid-Side Gap:</span><span>{activeAuditProbe.audioVisualForensics.audio.stereoSideGapDb} dB</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Noise Floor:</span><span>{activeAuditProbe.audioVisualForensics.audio.noiseFloorDb} dB</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">High Band &gt;17kHz:</span><span>{activeAuditProbe.audioVisualForensics.audio.highBand17kDb} dB (Cliff {activeAuditProbe.audioVisualForensics.audio.airCliffDb} dB)</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Jeda Hening Digital:</span><span>{activeAuditProbe.audioVisualForensics.audio.digitalSilenceCount} segmen</span></div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {auditTab === 'diag' && activeAuditProbe?.ffprobeDiagnostic && (
                <div className="space-y-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-mono text-[11px]">
                      <Bug className="w-4 h-4 text-amber-400" />
                      <span>
                        {activeAuditProbe.ffprobeDiagnostic.aiTriggerChecklist.length} Pemicu AI •{' '}
                        {activeAuditProbe.ffprobeDiagnostic.isolatedSeiUnits.length} SEI •{' '}
                        {activeAuditProbe.ffprobeDiagnostic.isolatedMetadataBlocks.length} C2PA/UUID
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowRawProbeJson((v) => !v)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-cyan-300 cursor-pointer"
                      >
                        {showRawProbeJson ? 'Tutup JSON' : 'Lihat Raw JSON'}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(activeAuditProbe.ffprobeDiagnostic!.rawFfprobeSummaryText);
                            setCopiedDiag(true);
                            setTimeout(() => setCopiedDiag(false), 1500);
                          } catch {}
                        }}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-slate-200 flex items-center gap-1 cursor-pointer"
                      >
                        {copiedDiag ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedDiag ? 'Tersalin' : 'Salin Laporan'}</span>
                      </button>
                    </div>
                  </div>

                  {activeAuditProbe.ffprobeDiagnostic.aiTriggerChecklist.length === 0 ? (
                    <div className="p-3 rounded-xl bg-emerald-950/25 border border-emerald-500/30 text-emerald-300 flex items-center gap-2 text-xs">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>0 pemicu AI, 0 SEI NAL Unit, dan 0 blok provenance C2PA/UUID.</span>
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-60 overflow-y-auto">
                      {activeAuditProbe.ffprobeDiagnostic.aiTriggerChecklist.map((t) => (
                        <div key={t.id} className="p-2.5 rounded-lg bg-slate-950 border border-rose-900/40 text-[11px] font-mono">
                          <div className="font-bold text-rose-300">{t.title}</div>
                          <div className="text-slate-400">{t.detail}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeAuditProbe.ffprobeDiagnostic.isolatedSeiUnits.length > 0 && (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      <div className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Unit SEI Terisolasi</span>
                      </div>
                      {activeAuditProbe.ffprobeDiagnostic.isolatedSeiUnits.map((u) => (
                        <div key={`${u.index}-${u.source}`} className="p-2 rounded bg-slate-950 border border-slate-800 text-[10px] font-mono text-slate-300">
                          SEI #{u.index} Type {u.nalUnitType} ({u.payloadTypeLabel}): {u.decodedAscii}
                        </div>
                      ))}
                    </div>
                  )}

                  {showRawProbeJson && (
                    <pre className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-[10px] font-mono text-slate-300 max-h-56 overflow-auto">
                      {JSON.stringify(activeAuditProbe, null, 2)}
                    </pre>
                  )}
                </div>
              )}

              {auditTab === 'heatmap' && (
                previewUrlBefore ? (
                  <WatermarkNoiseVisualizer
                    previewUrlBefore={previewUrlBefore}
                    previewUrlAfter={!isServerCleanedUp || previewUrlAfter?.startsWith('blob:') ? previewUrlAfter : null}
                    beforeFileName={currentFile?.name}
                    afterFileName={currentFile ? getOutputFileName() : undefined}
                  />
                ) : (
                  <div className="text-xs text-slate-500 py-4 text-center">Unggah video untuk memindai heatmap noise watermark.</div>
                )
              )}

              {auditTab === 'logs' && (
                <div
                  ref={terminalRef}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 font-mono text-[11px] text-slate-300 h-52 overflow-y-auto space-y-1 leading-relaxed"
                >
                  <div className="flex items-center gap-1.5 text-slate-500 pb-1 border-b border-slate-800/80 mb-1">
                    <Terminal className="w-3.5 h-3.5" />
                    <span>Log Eksekusi MetaCleaner AIO</span>
                  </div>
                  {logs.map((entry) => (
                    <div
                      key={entry.id}
                      className={
                        entry.color === 'emerald'
                          ? 'text-emerald-400 font-bold'
                          : entry.color === 'indigo'
                            ? 'text-indigo-400'
                            : entry.color === 'amber'
                              ? 'text-amber-300'
                              : entry.color === 'rose'
                                ? 'text-rose-400 font-bold'
                                : 'text-slate-300'
                      }
                    >
                      <span className="text-slate-600">[{entry.time}]</span> {entry.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
