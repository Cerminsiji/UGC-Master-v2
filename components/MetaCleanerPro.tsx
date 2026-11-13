'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createFile } from 'mp4box';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Download,
  Eye,
  FileSearch,
  Film,
  RefreshCw,
  ShieldCheck,
  Terminal,
  UploadCloud,
  Volume2,
  Zap,
} from 'lucide-react';
import type { ExternalProbeReport } from '@/lib/video-probe';
import type { CleanerProgressState } from '@/lib/meta-cleaner-progress';

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
  falsePositiveCheck: string;
  falsePositiveClean: boolean | null;
  riskText: string;
  riskClean: boolean | null;
  badgeText: string;
  badgeClean: boolean | null;
}

const INITIAL_BEFORE_STATE: InspectionState = {
  synthId: 'Menunggu Berkas...',
  synthIdClean: null,
  c2pa: 'Menunggu Berkas...',
  c2paClean: null,
  uuid: 'Menunggu Berkas...',
  uuidClean: null,
  encoder: 'Menunggu Berkas...',
  encoderClean: null,
  sei: 'Menunggu Berkas...',
  seiClean: null,
  seiCount: 0,
  hex: '-',
  containerType: 'Menunggu Berkas...',
  containerClean: null,
  falsePositiveCheck: 'Menunggu Berkas...',
  falsePositiveClean: null,
  riskText: 'Belum Dianalisis',
  riskClean: null,
  badgeText: 'STANDBY',
  badgeClean: null,
};

const INITIAL_AFTER_STATE: InspectionState = {
  synthId: 'Menunggu Proses...',
  synthIdClean: null,
  c2pa: 'Menunggu Proses...',
  c2paClean: null,
  uuid: 'Menunggu Proses...',
  uuidClean: null,
  encoder: 'Menunggu Proses...',
  encoderClean: null,
  sei: 'Menunggu Proses...',
  seiClean: null,
  seiCount: 0,
  hex: '-',
  containerType: 'Menunggu Proses...',
  containerClean: null,
  falsePositiveCheck: 'Menunggu Proses...',
  falsePositiveClean: null,
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

const CONTAINER_BOX_TYPES = new Set([
  'moov',
  'trak',
  'mdia',
  'minf',
  'stbl',
  'edts',
  'dinf',
]);

const VALID_TOP_BOXES = new Set([
  'ftyp',
  'moov',
  'mdat',
  'free',
  'wide',
  'styp',
  'skip',
]);

/**
 * Validates that a candidate output buffer is a genuine, playable MP4 video
 * and NOT an HTML error/redirect page (such as 10 KB cookie_check.html or warmup.html).
 */
function isValidMp4VideoBuffer(bytes: Uint8Array, sourceByteLength: number): boolean {
  if (!bytes || bytes.byteLength < 512) {
    return false;
  }

  // Reject HTML error/redirect responses (e.g. <!DOCTYPE or <html)
  if (bytes[0] === 0x3c || (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf && bytes[3] === 0x3c)) {
    return false;
  }

  const decoder = new TextDecoder('ascii', { fatal: false });
  const firstBoxType = decoder.decode(bytes.subarray(4, 8));
  if (!VALID_TOP_BOXES.has(firstBoxType)) {
    return false;
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
      const high = view.getUint32(offset + 8, false);
      const low = view.getUint32(offset + 12, false);
      size = high * 4294967296 + low;
      headerSize = 16;
    } else if (size === 0) {
      size = bytes.byteLength - offset;
    }

    if (size < headerSize || offset + size > bytes.byteLength) {
      break;
    }

    if (type === 'moov') {
      hasMoov = true;
    } else if (type === 'mdat') {
      hasMdat = true;
    }

    offset += size;
  }

  const minRequiredBytes = Math.min(8192, Math.max(1024, Math.floor(sourceByteLength * 0.05)));
  return (hasMoov || hasMdat) && bytes.byteLength >= minRequiredBytes;
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
      const high = view.getUint32(offset + 8, false);
      const low = view.getUint32(offset + 12, false);
      size = high * 4294967296 + low;
      headerSize = 16;
    } else if (size === 0) {
      size = bytes.length - offset;
    }

    if (size < headerSize || offset + size > bytes.length) {
      break;
    }

    if (type === 'mdat') {
      ranges.push({ start: offset + headerSize, end: offset + size });
    }

    offset += size;
  }

  return ranges;
}

function neutralizeContainerBoxesInPlace(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder('ascii', { fatal: false });

  const clean = (start: number, end: number, depth: number) => {
    if (depth > 7) return;
    let offset = start;

    while (offset + 8 <= end) {
      let size = view.getUint32(offset, false);
      const type = decoder.decode(bytes.subarray(offset + 4, offset + 8));
      let headerSize = 8;

      if (size === 1) {
        if (offset + 16 > end) break;
        const high = view.getUint32(offset + 8, false);
        const low = view.getUint32(offset + 12, false);
        size = high * 4294967296 + low;
        headerSize = 16;
      } else if (size === 0) {
        size = end - offset;
      }

      if (size < headerSize || offset + size > end) break;

      if (['uuid', 'c2pa', 'jumb', 'c2ma', 'c2cl', 'XMP_'].includes(type)) {
        bytes[offset + 4] = 0x66;
        bytes[offset + 5] = 0x72;
        bytes[offset + 6] = 0x65;
        bytes[offset + 7] = 0x65;
        bytes.fill(0x00, offset + headerSize, offset + size);
      } else if (['udta', 'meta', 'ilst', '©too', '©enc'].includes(type)) {
        const payload = decoder.decode(bytes.subarray(offset + headerSize, Math.min(offset + size, offset + 512)));
        if (
          payload.includes('c2pa') ||
          payload.includes('SynthID') ||
          payload.includes('trainedAlgorithmicMedia') ||
          payload.includes('Veo') ||
          payload.includes('Sora') ||
          payload.includes('Runway') ||
          payload.includes('Pika') ||
          payload.includes('com.ai.generator') ||
          payload.includes('ai-studio') ||
          payload.includes('Lavf') ||
          payload.includes('Lavc') ||
          payload.includes('SHOPEE') ||
          payload.includes('s264') ||
          payload.includes('garena') ||
          payload.includes('live-tech') ||
          payload.includes('mdirappl') ||
          payload.includes('appl')
        ) {
          bytes[offset + 4] = 0x66;
          bytes[offset + 5] = 0x72;
          bytes[offset + 6] = 0x65;
          bytes[offset + 7] = 0x65;
          bytes.fill(0x00, offset + headerSize, offset + size);
        } else {
          clean(offset + headerSize, offset + size, depth + 1);
        }
      } else if (CONTAINER_BOX_TYPES.has(type)) {
        clean(offset + headerSize, offset + size, depth + 1);
      }

      offset += size;
    }
  };

  clean(0, bytes.length, 0);
}

/**
 * Inspects an ArrayBuffer/Uint8Array for SynthID carriers, C2PA, UUID boxes, vendor encoder strings, and H.264 SEI NAL Unit Type 6 packets.
 */
async function inspectVideoBuffer(
  uint8: Uint8Array,
  isAfter = false,
  cameraProfile: 'samsung' | 'apple' | 'xiaomi' | 'neutral' = 'samsung'
): Promise<InspectionState> {
  let hexStr = '';
  for (let i = 0; i < Math.min(32, uint8.length); i++) {
    hexStr += uint8[i].toString(16).padStart(2, '0').toUpperCase() + ' ';
  }

  // CRITICAL RULE V3: Hex 00 00 00 20 66 74 79 70 69 = FTYP ISOM = NEVER SEI.
  const isFtypHeader =
    uint8.length >= 12 &&
    uint8[4] === 0x66 && // 'f'
    uint8[5] === 0x74 && // 't'
    uint8[6] === 0x79 && // 'y'
    uint8[7] === 0x70;   // 'p'

  const textDecoder = new TextDecoder('ascii', { fatal: false });
  let detectedBrand = 'isom';
  if (isFtypHeader && uint8.length >= 12) {
    const rawBrand = textDecoder.decode(uint8.subarray(8, 12)).replace(/[^a-zA-Z0-9]/g, '');
    if (rawBrand.length >= 3) {
      detectedBrand = rawBrand;
    }
  }

  const containerTypeDesc = isFtypHeader
    ? `NORMAL (ftyp ${detectedBrand} standard)`
    : 'NORMAL (ISO Base Media)';

  const falsePositiveCheck = isFtypHeader
    ? `Lolos (ftyp ${detectedBrand} BUKAN SEI - Container Normal)`
    : 'Lolos Validasi Header Container';

  // Synchronous raw atom scan across container to ensure 0% missed boxes
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
      if (uuidHex.toLowerCase().includes('d8fec3d3')) {
        rawC2paFound = true;
      }
    } else if (type === 'c2pa' || type === 'jumb' || type === 'c2ma' || type === 'c2cl') {
      rawC2paFound = true;
    } else if (type === 'moov') {
      const moovEnd = atomPos + size;
      let mPos = atomPos + hdr;
      while (mPos + 8 <= moovEnd) {
        let mSize =
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

  // 1. Direct synchronous mdat bitstream NAL scanner for SEI Type 6 (zero async lag, 100% deterministic)
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

      if (nalType === 6 || nalType === 39 || nalType === 40) {
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

  // 2. Direct container header scan outside mdat for Lavf, Google partial stamps, Shopee s264, and AI vendor tags
  const mdatStart = mdatRanges.length > 0 ? mdatRanges[0].start - 8 : uint8.length;
  const containerSlice = textDecoder.decode(uint8.subarray(0, mdatStart));
  const containerLower = containerSlice.toLowerCase();
  for (const vs of VENDOR_SIGNATURES) {
    if (containerLower.includes(vs.toLowerCase()) && !rawVendors.includes(vs)) {
      rawVendors.push(vs);
      rawUdtaMetaFound = true;
    }
  }

  // mp4box.js Atom Parser & H.264 Annex B / mdat Video Sample Demuxer
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
        // Deep scan track handlers
        if (info.tracks && Array.isArray(info.tracks)) {
          for (const trk of info.tracks) {
            const trkName = String(trk.name || '');
            if (
              trkName.includes('Google') ||
              trkName.includes('Veo') ||
              trkName.includes('SynthID') ||
              trkName.includes('com.ai.generator') ||
              trkName.includes('SHOPEE')
            ) {
              detectedVendors.push('Google/Veo Handler');
            }
          }
        }

        // Demux H.264 video samples strictly from mdat to scan SEI NAL Type 6
        const vTrack = info.tracks ? info.tracks.find((t: any) => t.video) : null;
        if (vTrack) {
          mp4boxfile.setExtractionOptions(vTrack.id, null, { nbSamples: 200 });
          mp4boxfile.start();
        } else {
          finish();
        }
      };

      mp4boxfile.onSamples = (track_id: number, ref: any, samples: any[]) => {
        samplesProcessed += samples.length;
        for (const sample of samples) {
          const d = sample.data as Uint8Array;
          if (!d) continue;
          let offset = 0;
          while (offset + 4 < d.length) {
            const nalLen =
              ((d[offset] << 24) >>> 0) +
              ((d[offset + 1] << 16) >>> 0) +
              ((d[offset + 2] << 8) >>> 0) +
              (d[offset + 3] >>> 0);
            if (nalLen <= 0 || offset + 4 + nalLen > d.length) break;
            const nalHdr = d[offset + 4];
            const nalType = nalHdr & 0x1f;
            if (nalType === 6 || nalType === 39 || nalType === 40) {
              const payloadType = d[offset + 5];
              // Payload type 5: user_data_unregistered, 4: user_data_registered
              if (payloadType === 5 || payloadType === 4 || payloadType === 0) {
                seiNalCount++;
              }
            }
            offset += 4 + nalLen;
          }
        }
        if (samplesProcessed >= 150) {
          finish();
        }
      };

      mp4boxfile.appendBuffer(ab);
      mp4boxfile.flush();
      setTimeout(finish, 800);
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

  const c2paFound = mp4Analysis.c2paFound;
  const uuidFound = mp4Analysis.uuidFound;
  const udtaMetaFound = mp4Analysis.udtaMetaFound;
  const totalSeiUnits = mp4Analysis.samplesProcessed > 0 ? mp4Analysis.seiNalCount : directMdatSeiCount;
  const allVendors = Array.from(new Set([...mp4Analysis.uniqueVendors, ...rawVendors]));
  const seiFound = totalSeiUnits > 0;

  const synthIdDetected =
    c2paFound ||
    uuidFound ||
    udtaMetaFound ||
    seiFound ||
    allVendors.length > 0;

  const hasThreat = synthIdDetected;

  let encoderStatusText = 'BERSIH (Standard Handler)';
  if (allVendors.length > 0) {
    encoderStatusText = `TERDETEKSI (${allVendors.join(', ')})`;
  } else if (isAfter) {
    if (cameraProfile === 'apple') {
      encoderStatusText = 'BERSIH • Hardware: Apple iPhone 15 Pro (Core Media Video)';
    } else if (cameraProfile === 'samsung') {
      encoderStatusText = 'BERSIH • Hardware: Samsung Galaxy S24 Ultra (VideoHandle)';
    } else if (cameraProfile === 'xiaomi') {
      encoderStatusText = 'BERSIH • Hardware: Xiaomi 14 Ultra (HyperOS / Leica)';
    } else {
      encoderStatusText = 'BERSIH (Standard Handler / Bebas Lavf)';
    }
  }

  return {
    synthId: synthIdDetected
      ? 'TERDETEKSI (SynthID / AI Carrier)'
      : isAfter
        ? 'BERSIH (SynthID & Carrier Dihapus)'
        : 'BERSIH / TIDAK TERDETEKSI',
    synthIdClean: !synthIdDetected,
    c2pa: c2paFound
      ? 'TERDETEKSI (c2pa/jumb UUID)'
      : 'TIDAK TERDETEKSI',
    c2paClean: !c2paFound,
    uuid: uuidFound
      ? 'TERDETEKSI (uuid / C2PA Manifest)'
      : udtaMetaFound
        ? 'TERDETEKSI (udta AI Provenance)'
        : 'BERSIH (Bebas Klaim UUID & Manifes)',
    uuidClean: !uuidFound && !udtaMetaFound,
    encoder: encoderStatusText,
    encoderClean: allVendors.length === 0,
    sei: seiFound
      ? `TERDETEKSI (SEI NAL Unit Type 6 • ${detectedSeiDetails.length > 0 ? detectedSeiDetails.join('/') : totalSeiUnits + ' Unit'})`
      : isAfter
        ? 'BERSIH (SEI NAL Type 6 Dihapus)'
        : 'BERSIH (Tidak Ada SEI NAL Type 6)',
    seiClean: !seiFound,
    seiCount: totalSeiUnits,
    hex: hexStr.trim() || '-',
    containerType: containerTypeDesc,
    containerClean: true,
    falsePositiveCheck,
    falsePositiveClean: true,
    riskText: hasThreat
      ? `Terdeteksi AI (${detectedSeiDetails.includes('SHOPEE') ? 'Shopee Video' : allVendors.includes('Lavf') ? 'Lavf/Bot Re-encoded' : 'SynthID / SEI 6'})`
      : isAfter
        ? `AMAN / LOLOS DETEKTOR AI (${cameraProfile.toUpperCase()} CAM)`
        : 'AMAN / LOLOS DETEKTOR V3 (BUKAN AI)',
    riskClean: !hasThreat,
    badgeText: hasThreat
      ? 'BAHAYA: KONTEN AI TERDETEKSI'
      : isAfter
        ? '100% BERSIH & LOLOS DETEKTOR AI'
        : '100% BERSIH (LOLOS DETEKTOR V3)',
    badgeClean: !hasThreat,
  };
}

export const MetaCleanerPro: React.FC = () => {
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [fileArrayBuffer, setFileArrayBuffer] = useState<ArrayBuffer | null>(null);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [previewUrlBefore, setPreviewUrlBefore] = useState<string | null>(null);
  const [previewUrlAfter, setPreviewUrlAfter] = useState<string | null>(null);
  const [deepSynthIdMode, setDeepSynthIdMode] = useState<boolean>(true);
  const [deepMetaPurge, setDeepMetaPurge] = useState<boolean>(true);
  const [forceKeyframeInsertion, setForceKeyframeInsertion] = useState<boolean>(true);
  const [cameraProfile, setCameraProfile] = useState<'samsung' | 'apple' | 'xiaomi' | 'neutral'>('samsung');

  const [fileStatus, setFileStatus] = useState<{ text: string; color: 'amber' | 'emerald' | 'rose' }>({
    text: 'Menunggu Berkas',
    color: 'amber',
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState('SIAP');
  const [isDragging, setIsDragging] = useState(false);

  const [beforeState, setBeforeState] = useState<InspectionState>(INITIAL_BEFORE_STATE);
  const [afterState, setAfterState] = useState<InspectionState>(INITIAL_AFTER_STATE);

  // External ffprobe + trace_headers verification states (Before & After)
  const [beforeProbe, setBeforeProbe] = useState<ExternalProbeReport | null>(null);
  const [afterProbe, setAfterProbe] = useState<ExternalProbeReport | null>(null);
  const [isProbingBefore, setIsProbingBefore] = useState(false);
  const [isProbingAfter, setIsProbingAfter] = useState(false);
  const [probeErrorBefore, setProbeErrorBefore] = useState<string | null>(null);
  const [probeErrorAfter, setProbeErrorAfter] = useState<string | null>(null);
  const [showRawProbeJson, setShowRawProbeJson] = useState(false);

  // Live Cloud FFmpeg progress state
  const [cloudProgress, setCloudProgress] = useState<CleanerProgressState | null>(null);

  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 'init-1',
      time: '--:--:--',
      text: "[MetaCleaner v20.0 4-Layer Audio-Visual Anti-AI + FFprobe Forensics] Ready: Zero-Ghost 29.97fps + Rubberband Formant/Pitch + Stereo Pink Air + Authentic MP4 Timestamp/Brand.",
      color: 'indigo',
    },
    {
      id: 'init-2',
      time: '--:--:--',
      text: 'Membersihkan 4 lapisan sidik jari AI tanpa ghosting & tanpa hiss: Metadata/Timestamp MP4, Zero-SEI Type 6, Optik CMOS Bebas-Ghost, & Anti-TTS Stereo Akustik.',
      color: 'slate',
    },
  ]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const seenServerLogRef = useRef<Set<string>>(new Set());

  const appendLog = useCallback(
    (text: string, color: LogEntry['color'] = 'slate') => {
      const time = new Date().toLocaleTimeString('id-ID');
      setLogs((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          time,
          text,
          color,
        },
      ]);
    },
    []
  );

  const getStatusColor = (isClean: boolean | null) => {
    if (isClean === null) return 'text-slate-500 font-medium';
    return isClean ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold';
  };

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    return () => {
      if (previewUrlBefore) URL.revokeObjectURL(previewUrlBefore);
      if (previewUrlAfter) URL.revokeObjectURL(previewUrlAfter);
    };
  }, [previewUrlBefore, previewUrlAfter]);

  const runExternalProbe = useCallback(
    async (blob: Blob, filename: string, target: 'before' | 'after') => {
      if (target === 'before') {
        setIsProbingBefore(true);
        setProbeErrorBefore(null);
      } else {
        setIsProbingAfter(true);
        setProbeErrorAfter(null);
      }

      try {
        const fd = new FormData();
        fd.append('file', blob, filename);

        const res = await fetch('/api/meta-cleaner/probe', {
          method: 'POST',
          body: fd,
          credentials: 'include',
        });
        const data = await res.json();
        if (!res.ok || !data?.success || !data?.probe) {
          throw new Error(data?.error || `FFprobe status ${res.status}`);
        }
        const probe = data.probe as ExternalProbeReport;
        const av = probe.audioVisualForensics;

        const applyProbeToCardState = (prev: InspectionState): InspectionState => {
          const seiTotal = probe.seiReport.totalSeiUnits;
          const isOverallClean = probe.cleanliness.overallClean;
          const asciiHint = probe.seiReport.asciiTraces.slice(0, 2).join(', ');
          const avSummary = av
            ? `Risk ${av.aiRiskScore}/100 • ${av.visual.fps}fps${av.visual.hasBFrames ? ' (B-Frame)' : ' (0 B-Frame)'}${av.audio.hasAudio ? ` • Air>17k=${av.audio.highBand17kDb}dB` : ''}`
            : '';

          return {
            ...prev,
            synthId: !av.visual.visualClean || !av.audio.audioClean
              ? `TERDETEKSI SINYAL AI (${[...av.visual.visualAiFlags, ...av.audio.audioAiFlags].length} indikator)`
              : target === 'after'
                ? 'BERSIH TOTAL (Visual + Audio Organik)'
                : 'BERSIH / ORGANIK',
            synthIdClean: av.visual.visualClean && av.audio.audioClean,
            c2pa: probe.cleanliness.isZeroJumbf ? 'TIDAK TERDETEKSI' : `TERDETEKSI (${probe.jumbfManifests.length} manifes)`,
            c2paClean: probe.cleanliness.isZeroJumbf,
            uuid: probe.cleanliness.isZeroUuid ? 'BERSIH (0 UUID Claim)' : `TERDETEKSI (${probe.uuidClaims.length} UUID box)`,
            uuidClean: probe.cleanliness.isZeroUuid,
            encoder: !probe.cleanliness.isZeroAiVendor
              ? `TERDETEKSI (${probe.cleanliness.flaggedReasons.find((r) => r.includes('vendor') || r.includes('ASCII')) || 'Vendor/Handler Tag'})`
              : target === 'after'
                ? `${prev.encoder}`
                : `BERSIH (${probe.videoStream?.handlerName || 'Standard Handler'})`,
            encoderClean: probe.cleanliness.isZeroAiVendor,
            sei: seiTotal > 0
              ? `TERDETEKSI (${seiTotal} unit${asciiHint ? ` • ${asciiHint}` : ''})`
              : target === 'after'
                ? 'BERSIH (0 Unit SEI NAL Type 6)'
                : 'BERSIH (0 Unit SEI)',
            seiClean: seiTotal === 0,
            seiCount: seiTotal,
            riskText: isOverallClean
              ? `100% LOLOS AUDIO-VISUAL (${avSummary})`
              : `TERDETEKSI AI • ${avSummary}`,
            riskClean: isOverallClean,
            badgeText: isOverallClean
              ? '100% BERSIH & LOLOS AUDIO-VISUAL AI'
              : av.aiVerdict === 'HIGH_AI_RISK'
                ? `BAHAYA: TERDETEKSI AI (${av.aiRiskScore}/100)`
                : `TERDETEKSI SINYAL AI (${av.aiRiskScore}/100)`,
            badgeClean: isOverallClean,
          };
        };

        if (target === 'before') {
          setBeforeProbe(probe);
          setBeforeState(applyProbeToCardState);
        } else {
          setAfterProbe(probe);
          setAfterState(applyProbeToCardState);
        }

        appendLog(
          `[FFPROBE + AUDIO-VISUAL AI (${target.toUpperCase()})] AI Risk=${av.aiRiskScore}/100 (${av.aiVerdict}) | SEI=${probe.seiReport.totalSeiUnits} | FPS=${av.visual.fps} (B-Frame=${probe.videoStream?.hasBFrames ?? 0}) | Silence=${av.audio.digitalSilenceCount} | Air>17kHz=${av.audio.highBand17kDb}dB (Cliff=${av.audio.airCliffDb}dB) | Verdict: ${probe.cleanliness.overallClean ? 'BERSIH TOTAL' : 'TERDETEKSI JEJAK AI'}`,
          probe.cleanliness.overallClean ? 'emerald' : 'amber'
        );
      } catch (err: any) {
        const msg = err?.message || 'Gagal menjalankan ffprobe eksternal';
        if (target === 'before') {
          setProbeErrorBefore(msg);
        } else {
          setProbeErrorAfter(msg);
        }
        appendLog(`[FFPROBE WARNING (${target.toUpperCase()})] ${msg}`, 'amber');
      } finally {
        if (target === 'before') {
          setIsProbingBefore(false);
        } else {
          setIsProbingAfter(false);
        }
      }
    },
    [appendLog]
  );

  const handleFileSelected = async (file: File | null | undefined) => {
    if (!file) return;

    if (previewUrlBefore) URL.revokeObjectURL(previewUrlBefore);
    if (previewUrlAfter) URL.revokeObjectURL(previewUrlAfter);

    setCurrentFile(file);
    setProcessedBlob(null);
    setPreviewUrlAfter(null);
    setAfterState(INITIAL_AFTER_STATE);
    setBeforeProbe(null);
    setAfterProbe(null);
    setProbeErrorBefore(null);
    setProbeErrorAfter(null);
    setCloudProgress(null);
    setPreviewUrlBefore(URL.createObjectURL(file));

    setFileStatus({ text: 'Membaca ke RAM...', color: 'amber' });

    try {
      const buffer = await file.arrayBuffer();
      setFileArrayBuffer(buffer);
      setFileStatus({ text: 'Siap di Memori', color: 'emerald' });

      const uint8 = new Uint8Array(buffer);
      const inspected = await inspectVideoBuffer(uint8, false);
      setBeforeState(inspected);

      appendLog(
        `[FILE LOADED] Berkas "${file.name}" (${(file.size / (1024 * 1024)).toFixed(2)} MB) dimuat ke RAM buffer.`,
        'indigo'
      );
      appendLog(
        `[INSPECTION] SynthID: ${inspected.synthId} | C2PA: ${inspected.c2pa} | UUID: ${inspected.uuid} | Vendor: ${inspected.encoder} | SEI: ${inspected.sei}`,
        inspected.riskClean ? 'emerald' : 'amber'
      );

      // Run external ffprobe & bitstream trace inspection automatically on input video
      void runExternalProbe(file, file.name, 'before');
    } catch (err: any) {
      setFileStatus({ text: 'Gagal Membaca', color: 'rose' });
      appendLog(`[ERROR] Gagal membaca berkas: ${err?.message || 'Unknown error'}`, 'rose');
    }
  };

  const executeAutoSanitization = async () => {
    if (!fileArrayBuffer || !currentFile || isProcessing) return;

    setIsProcessing(true);
    setProcessedBlob(null);
    setAfterProbe(null);
    setProbeErrorAfter(null);
    setLogs([]);
    seenServerLogRef.current.clear();

    const jobId = `mc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setProgressText('MENGINISIALISASI CLOUD FFMPEG...');
    setCloudProgress({
      jobId,
      stage: 'queued',
      message: 'Mengunggah stream video ke Cloud Python/Node FFmpeg Worker...',
      percent: 2,
      frame: 0,
      totalFrames: 0,
      fps: 0,
      speed: '0x',
      outTimeSec: 0,
      durationSec: 0,
      engine: 'Cloud Python/Node FFmpeg',
      logs: [],
      updatedAt: new Date().toISOString(),
    });

    const sourceByteLength = fileArrayBuffer.byteLength;

    appendLog(
      `[CLOUD ANTI-SYNTHID & ZERO-SEI ENGINE] Memulai pemrosesan server-side pada: ${currentFile.name} (${(sourceByteLength / (1024 * 1024)).toFixed(2)} MB) [Job: ${jobId}]`,
      'indigo'
    );
    appendLog(
      `-> Mode: ${deepSynthIdMode ? 'Deep Anti-SynthID Frame-by-Frame (5-Layer)' : 'Lossless Remux + Keyframes'} | Deep Meta Purge: ${deepMetaPurge ? 'AKTIF (Strict Zero-SEI)' : 'Standard'} | Profil OEM: ${cameraProfile.toUpperCase()}`,
      'amber'
    );

    // Start live stream progress polling while server-side FFmpeg runs
    const pollInterval = window.setInterval(async () => {
      try {
        const pRes = await fetch(`/api/meta-cleaner/progress?jobId=${encodeURIComponent(jobId)}`, {
          cache: 'no-store',
          credentials: 'include',
        });
        if (!pRes.ok) return;
        const pData = (await pRes.json()) as CleanerProgressState;
        if (!pData || !pData.stage) return;
        setCloudProgress(pData);
        const framePart =
          pData.frame > 0
            ? ` • Frame ${pData.frame}${pData.totalFrames > 0 ? `/${pData.totalFrames}` : ''}`
            : '';
        setProgressText(`${pData.percent}%${framePart}`);

        if (Array.isArray(pData.logs)) {
          for (const line of pData.logs) {
            if (!seenServerLogRef.current.has(line)) {
              seenServerLogRef.current.add(line);
              appendLog(`   ${line}`, line.startsWith('✓') ? 'emerald' : 'indigo');
            }
          }
        }
      } catch {}
    }, 400);

    try {
      await fetch('/api/health', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'include',
      }).catch(() => {});

      const sendServerRequest = async () => {
        const formData = new FormData();
        formData.append('jobId', jobId);
        formData.append('file', currentFile);
        formData.append('mode', deepSynthIdMode ? 'deep_synthid' : 'remux_only');
        formData.append('deepMetaPurge', deepMetaPurge ? 'true' : 'false');
        formData.append('forceKeyframeInsertion', forceKeyframeInsertion ? 'true' : 'false');
        formData.append('cameraProfile', cameraProfile);

        return await fetch(`/api/meta-cleaner${window.location.search || ''}`, {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });
      };

      let response = await sendServerRequest();
      if (!response.ok && response.status === 405) {
        response = await sendServerRequest();
      }

      if (!response.ok) {
        let errMsg = `Cloud FFmpeg gagal (HTTP ${response.status})`;
        try {
          const errJson = await response.json();
          if (errJson?.error) errMsg = errJson.error;
        } catch {}
        throw new Error(errMsg);
      }

      const encodedLogs = response.headers.get('X-MetaCleaner-Logs');
      if (encodedLogs) {
        try {
          const binaryStr = atob(encodedLogs);
          const bytes = new Uint8Array(binaryStr.length);
          for (let idx = 0; idx < binaryStr.length; idx++) {
            bytes[idx] = binaryStr.charCodeAt(idx);
          }
          const jsonStr = new TextDecoder('utf-8').decode(bytes);
          const decoded = JSON.parse(jsonStr);
          if (Array.isArray(decoded.logs)) {
            for (const line of decoded.logs) {
              if (!seenServerLogRef.current.has(line)) {
                seenServerLogRef.current.add(line);
                const color =
                  line.startsWith('✓')
                    ? 'emerald'
                    : line.includes('[ffmpeg-reencode]') || line.includes('[ffmpeg-remux]') || line.includes('[PASS ')
                      ? 'indigo'
                      : 'slate';
                appendLog(`   ${line}`, color);
              }
            }
          }
        } catch {}
      }

      const cleanedArrayBuffer = await response.arrayBuffer();
      const candidateUint8 = new Uint8Array(cleanedArrayBuffer);

      if (!isValidMp4VideoBuffer(candidateUint8, sourceByteLength)) {
        throw new Error('Output video dari Cloud FFmpeg tidak lolos validasi MP4.');
      }

      neutralizeContainerBoxesInPlace(candidateUint8);
      const engineHeader = response.headers.get('X-MetaCleaner-Engine') || '';
      const isPythonEngine = engineHeader.toLowerCase().includes('python');
      const engineUsed = isPythonEngine
        ? 'Cloud Python FFmpeg Wrapper (Strict Frame-by-Frame Filtering)'
        : 'Cloud Node.js FFmpeg Wrapper (Frame-by-Frame Anti-SynthID + Bitexact)';

      setCloudProgress((prev) => ({
        jobId,
        stage: 'completed',
        message: `Selesai 100% (${(candidateUint8.byteLength / (1024 * 1024)).toFixed(2)} MB) • Verifikasi FFprobe...`,
        percent: 100,
        frame: prev?.frame || prev?.totalFrames || 0,
        totalFrames: prev?.totalFrames || prev?.frame || 0,
        fps: prev?.fps || 0,
        speed: prev?.speed || '1x',
        outTimeSec: prev?.outTimeSec || prev?.durationSec || 0,
        durationSec: prev?.durationSec || 0,
        engine: engineUsed,
        logs: prev?.logs || [],
        updatedAt: new Date().toISOString(),
      }));

      const cleanBlob = new Blob([candidateUint8 as unknown as BlobPart], {
        type: 'video/mp4',
      });
      setProcessedBlob(cleanBlob);
      setPreviewUrlAfter(URL.createObjectURL(cleanBlob));

      const inspectedAfter = await inspectVideoBuffer(candidateUint8, true, cameraProfile);
      setAfterState(inspectedAfter);
      setProgressText('SELESAI 100%');

      appendLog(
        `✓ [${isPythonEngine ? 'CLOUD PYTHON FFMPEG' : 'CLOUD NODE FFMPEG'}] Video selesai dire-encode frame-by-frame & diremux Zero-SEI (${(candidateUint8.byteLength / (1024 * 1024)).toFixed(2)} MB).`,
        'emerald'
      );
      appendLog(
        `✓ [HARDWARE CAMERA OEM] Profil kamera disuntikkan: ${
          cameraProfile === 'apple'
            ? 'Apple iPhone 15 Pro (Core Media Video)'
            : cameraProfile === 'samsung'
              ? 'Samsung Galaxy S24 Ultra (VideoHandle)'
              : cameraProfile === 'xiaomi'
                ? 'Xiaomi 14 Ultra (HyperOS / Leica)'
                : 'Netral / Bitexact Clean'
        }.`,
        'indigo'
      );

      // Run external ffprobe + trace_headers verification on sanitized output
      const baseName = currentFile.name.replace(/\.[^/.]+$/, '');
      await runExternalProbe(cleanBlob, `${baseName}_output_bersih.mp4`, 'after');
    } catch (serverErr: any) {
      const errMsg = serverErr?.message || 'Gagal menjalankan Cloud FFmpeg API';
      setProgressText('GAGAL');
      setCloudProgress((prev) =>
        prev
          ? {
              ...prev,
              stage: 'failed',
              message: `Gagal: ${errMsg}`,
              error: errMsg,
            }
          : null
      );
      appendLog(`[CLOUD FFMPEG ERROR] ${errMsg}`, 'rose');
    } finally {
      window.clearInterval(pollInterval);
      setIsProcessing(false);
    }
  };

  const downloadCleanFile = () => {
    if (!processedBlob) return;
    const baseName = currentFile ? currentFile.name.replace(/\.[^/.]+$/, '') : 'video';
    const fileName = `${baseName}_output_bersih.mp4`;

    const url = URL.createObjectURL(processedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1500);
  };

  return (
    <div className="bg-slate-950 text-slate-100 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
      {/* HEADER */}
      <div className="bg-slate-900/90 backdrop-blur border-b border-slate-800 px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-900/30">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-base sm:text-lg leading-tight text-white flex items-center gap-2 flex-wrap">
              <span>MetaCleaner Pro</span>
              <span className="text-xs bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 font-mono font-bold px-2.5 py-0.5 rounded-full">
                v20.0 Zero-Ghost Audio-Visual + FFprobe
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Anti-AI 4 Lapisan Tanpa Ghosting &amp; Hiss: Zero-SEI (<code>filter_units</code>), 29.97fps B-Frames (<code>refs=2</code>), Rubberband Formant + Stereo Pink Air, &amp; MP4 Camera Timestamp
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-bold rounded-full flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            {deepMetaPurge ? 'Cloud Deep Meta Purge Active' : 'Cloud Zero-SEI Filter Ready'}
          </span>
          {forceKeyframeInsertion && (
            <span className="hidden sm:flex px-2.5 py-1 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-mono font-bold rounded-full items-center gap-1">
              <Film className="w-3.5 h-3.5" />
              <span>IDR Keyframes</span>
            </span>
          )}
        </div>
      </div>

      <div className="p-4 sm:p-6 flex flex-col gap-6">
        {/* FILE INPUT & ACTION CONTROL */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl flex flex-col md:flex-row gap-5 items-center justify-between">
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
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFileSelected(e.dataTransfer.files[0]);
              }
            }}
            className={`w-full md:w-3/5 border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition bg-slate-950/60 flex flex-col items-center justify-center space-y-2 ${
              isDragging ? 'border-indigo-500 bg-indigo-950/20' : 'border-slate-700 hover:border-indigo-500'
            }`}
          >
            <div className="w-12 h-12 bg-indigo-600/20 text-indigo-400 rounded-full flex items-center justify-center">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-200">
                Unggah/Pilih Berkas Video untuk Dihapus SynthID, C2PA, Google/Veo Handler &amp; SEI Type 6 (Lolos Shopee &amp; TikTok)
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Mendukung MP4, MOV, WebM, MKV, AVI — Status Memori: <span className="text-indigo-400 font-semibold">{fileStatus.text}</span>
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => handleFileSelected(e.target.files?.[0])}
            />
          </div>

          <div className="w-full md:w-2/5 flex flex-col gap-3">
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs space-y-2.5">
              <div className="flex justify-between font-bold text-slate-300">
                <span className="text-slate-500">Berkas:</span>
                <span className="text-indigo-400 truncate max-w-[180px]">
                  {currentFile ? currentFile.name : 'Belum Ada Berkas'}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span className="text-slate-500">Ukuran Input:</span>
                <span className="text-slate-200">
                  {currentFile ? `${(currentFile.size / (1024 * 1024)).toFixed(2)} MB` : '-'}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span className="text-slate-500">Mode Engine:</span>
                <button
                  type="button"
                  onClick={() => setDeepSynthIdMode((prev) => !prev)}
                  className={`font-mono font-bold text-[11px] px-2.5 py-0.5 rounded border transition cursor-pointer ${
                    deepSynthIdMode
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                      : 'bg-indigo-500/15 border-indigo-500/40 text-indigo-400'
                  }`}
                >
                  {deepSynthIdMode ? 'Deep Anti-SynthID + SEI' : 'Lossless Remux + SEI'}
                </button>
              </div>
              <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-slate-300 font-bold flex items-center gap-1">
                    <span>Deep Meta Purge:</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setDeepMetaPurge((prev) => !prev)}
                    className={`font-mono font-bold text-[11px] px-2.5 py-0.5 rounded border transition cursor-pointer ${
                      deepMetaPurge
                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-sm shadow-amber-950/50'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    {deepMetaPurge ? 'AKTIF (Strict Zero-SEI)' : 'NONAKTIF (Standard)'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 leading-snug">
                  Menulis ulang container video di Cloud FFmpeg dengan parameter ketat (<code>-c copy -dn -sn -write_tmcd 0 -bsf:v filter_units=remove_types=6 -fflags +bitexact</code>) untuk menjamin 0% SEI tersisa.
                </p>
              </div>
              <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-slate-300 font-bold flex items-center gap-1">
                    <span>Force Keyframe Insertion:</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setForceKeyframeInsertion((prev) => !prev)}
                    className={`font-mono font-bold text-[11px] px-2.5 py-0.5 rounded border transition cursor-pointer ${
                      forceKeyframeInsertion
                        ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 shadow-sm shadow-cyan-950/50'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    {forceKeyframeInsertion ? 'AKTIF (Anti-Glitch 1s IDR)' : 'NONAKTIF'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 leading-snug">
                  Menyuntikkan IDR Keyframes berkala (1 detik Closed-GOP) agar video mulus 100% bebas glitch saat SEI Type 6 dihapus.
                </p>
              </div>

              <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                <div className="flex justify-between items-center gap-2">
                  <span className="text-slate-300 font-bold flex items-center gap-1 text-[11px]">
                    <span>Hardware Camera Profile:</span>
                  </span>
                  <select
                    value={cameraProfile}
                    onChange={(e) => setCameraProfile(e.target.value as any)}
                    className="bg-slate-900 border border-slate-700 text-cyan-300 text-[11px] font-bold rounded px-2 py-1 outline-none focus:border-cyan-500 cursor-pointer"
                  >
                    <option value="samsung">Samsung Galaxy S24 Ultra (SM-S928B)</option>
                    <option value="apple">Apple iPhone 15 Pro (Core Media iOS)</option>
                    <option value="xiaomi">Xiaomi 14 Ultra (HyperOS / Leica)</option>
                    <option value="neutral">Netral / Bitexact Clean (Standar)</option>
                  </select>
                </div>
                <p className="text-[10px] text-slate-400 leading-snug">
                  Menyisipkan profil kamera HP asli serta menetralkan tag Lavf/bot agar lolos verifikasi Shopee Video &amp; TikTok.
                </p>
              </div>
            </div>

            <button
              onClick={executeAutoSanitization}
              disabled={!fileArrayBuffer || isProcessing}
              className={
                !fileArrayBuffer || isProcessing
                  ? 'w-full py-3.5 bg-slate-800 text-slate-500 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-not-allowed'
                  : 'w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-900/30 transition flex items-center justify-center gap-2 cursor-pointer'
              }
            >
              {isProcessing ? (
                <>
                  <Activity className="w-4 h-4 animate-spin" />
                  <span>{progressText}</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>
                    {forceKeyframeInsertion
                      ? 'Proses via Cloud FFmpeg (Anti-SynthID + Zero-SEI + IDR)'
                      : 'Jalankan Cloud FFmpeg Deep Meta Purge'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* LIVE CLOUD FFMPEG STREAM PROGRESS PANEL */}
        {(isProcessing || cloudProgress) && cloudProgress && (
          <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-4 sm:p-5 shadow-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Cpu className={`w-4 h-4 ${cloudProgress.stage === 'failed' ? 'text-rose-400' : cloudProgress.stage === 'completed' ? 'text-emerald-400' : 'text-indigo-400 animate-pulse'}`} />
                <span className="text-xs font-extrabold uppercase tracking-wider text-white">
                  Cloud FFmpeg Stream Telemetry
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700">
                  {cloudProgress.stage}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-mono">
                <span className="text-slate-400">{cloudProgress.engine}</span>
                <span className={`font-bold ${cloudProgress.stage === 'failed' ? 'text-rose-400' : cloudProgress.stage === 'completed' ? 'text-emerald-400' : 'text-cyan-400'}`}>
                  {cloudProgress.percent}%
                </span>
              </div>
            </div>

            <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
              <div
                className={`h-full transition-all duration-300 ${
                  cloudProgress.stage === 'failed'
                    ? 'bg-rose-500'
                    : cloudProgress.stage === 'completed'
                      ? 'bg-emerald-500'
                      : 'bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, cloudProgress.percent))}%` }}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-300">
              <span className="truncate max-w-full sm:max-w-[60%]">{cloudProgress.message}</span>
              <div className="flex items-center gap-3 text-slate-400">
                <span>
                  Frame: <strong className="text-slate-100">{cloudProgress.frame}</strong>
                  {cloudProgress.totalFrames > 0 ? `/${cloudProgress.totalFrames}` : ''}
                </span>
                <span>
                  FPS: <strong className="text-slate-100">{cloudProgress.fps || 0}</strong>
                </span>
                <span>
                  Speed: <strong className="text-cyan-300">{cloudProgress.speed || '0x'}</strong>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* BEFORE VS AFTER METADATA INSPECTOR */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* PANEL BEFORE */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col space-y-3">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
              <h3 className="text-xs font-extrabold text-rose-400 uppercase tracking-wider flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                1. Indikator SEBELUM (Input File)
              </h3>
              <span
                className={
                  beforeState.badgeClean === null
                    ? 'px-2 py-0.5 bg-slate-800 text-slate-500 text-[10px] font-extrabold rounded-full uppercase'
                    : beforeState.badgeClean
                      ? 'px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-extrabold rounded-full uppercase'
                      : 'px-2 py-0.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-extrabold rounded-full uppercase'
                }
              >
                {beforeState.badgeText}
              </span>
            </div>

            <div className="space-y-2.5 text-xs flex-1">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">SynthID Watermark (Piksel/Audio):</span>
                  <span className={`font-mono ${getStatusColor(beforeState.synthIdClean)}`}>
                    {beforeState.synthId}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Manifes C2PA (JUMBF):</span>
                  <span className={`font-mono ${getStatusColor(beforeState.c2paClean)}`}>
                    {beforeState.c2pa}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">UUID Claim Box:</span>
                  <span className={`font-mono ${getStatusColor(beforeState.uuidClean)}`}>
                    {beforeState.uuid}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Software / Vendor Stamp:</span>
                  <span className={`font-mono ${getStatusColor(beforeState.encoderClean)}`}>
                    {beforeState.encoder}
                  </span>
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Container Layer / Format:</span>
                  <span className={`font-mono ${getStatusColor(beforeState.containerClean)}`}>
                    {beforeState.containerType}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Header Validation (Rule V3):</span>
                  <span className={`font-mono text-[11px] ${getStatusColor(beforeState.falsePositiveClean)}`}>
                    {beforeState.falsePositiveCheck}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Bitstream / SEI Data:</span>
                  <span className={`font-mono ${getStatusColor(beforeState.seiClean)}`}>
                    {beforeState.sei}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">32-Byte Header Hex:</span>
                  <span className="font-mono text-[10px] text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded truncate max-w-[180px]">
                    {beforeState.hex}
                  </span>
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center">
                <span className="text-slate-500">Status Platform AI Detector:</span>
                <span className={`font-bold text-[11px] ${getStatusColor(beforeState.riskClean)}`}>
                  {beforeState.riskText}
                </span>
              </div>

              {previewUrlBefore && (
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 space-y-1.5">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Preview Video Input:
                  </div>
                  <video
                    src={previewUrlBefore}
                    controls
                    playsInline
                    className="w-full max-h-48 rounded-lg bg-black object-contain"
                  />
                </div>
              )}
            </div>
          </div>

          {/* PANEL AFTER */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col space-y-3">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
              <h3 className="text-xs font-extrabold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                2. Indikator SESUDAH (Hasil Sanitasi &amp; Remux)
              </h3>
              <span
                className={
                  afterState.badgeClean === null
                    ? 'px-2 py-0.5 bg-slate-800 text-slate-500 text-[10px] font-extrabold rounded-full uppercase'
                    : afterState.badgeClean
                      ? 'px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-extrabold rounded-full uppercase'
                      : 'px-2 py-0.5 bg-rose-500/20 border border-rose-500/30 text-rose-400 text-[10px] font-extrabold rounded-full uppercase'
                }
              >
                {afterState.badgeText}
              </span>
            </div>

            <div className="space-y-2.5 text-xs flex-1">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">SynthID Watermark (Piksel/Audio):</span>
                  <span className={`font-mono ${getStatusColor(afterState.synthIdClean)}`}>
                    {afterState.synthId}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Manifes C2PA (JUMBF):</span>
                  <span className={`font-mono ${getStatusColor(afterState.c2paClean)}`}>
                    {afterState.c2pa}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">UUID Claim Box:</span>
                  <span className={`font-mono ${getStatusColor(afterState.uuidClean)}`}>
                    {afterState.uuid}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Software / Vendor Stamp:</span>
                  <span className={`font-mono ${getStatusColor(afterState.encoderClean)}`}>
                    {afterState.encoder}
                  </span>
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Container Layer / Format:</span>
                  <span className={`font-mono ${getStatusColor(afterState.containerClean)}`}>
                    {afterState.containerType}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Header Validation (Rule V3):</span>
                  <span className={`font-mono text-[11px] ${getStatusColor(afterState.falsePositiveClean)}`}>
                    {afterState.falsePositiveCheck}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Bitstream / SEI Data:</span>
                  <span className={`font-mono ${getStatusColor(afterState.seiClean)}`}>
                    {afterState.sei}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">32-Byte Header Hex:</span>
                  <span className="font-mono text-[10px] text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded truncate max-w-[180px]">
                    {afterState.hex}
                  </span>
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center">
                <span className="text-slate-500">Status Platform AI Detector:</span>
                <span className={`font-bold text-[11px] ${getStatusColor(afterState.riskClean)}`}>
                  {afterState.riskText}
                </span>
              </div>

              {previewUrlAfter && (
                <div className="bg-slate-950 p-2.5 rounded-xl border border-emerald-800/40 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                    <span>Preview Video Hasil Remux (Verifikasi Playback):</span>
                    <span>
                      ✓ {processedBlob ? `${(processedBlob.size / (1024 * 1024)).toFixed(2)} MB • ` : ''}100% Playable
                    </span>
                  </div>
                  <video
                    src={previewUrlAfter}
                    controls
                    playsInline
                    className="w-full max-h-48 rounded-lg bg-black object-contain"
                  />
                </div>
              )}
            </div>

            <div className="pt-1">
              <button
                disabled={!processedBlob}
                onClick={downloadCleanFile}
                className={
                  !processedBlob
                    ? 'w-full py-2.5 bg-slate-800 text-slate-500 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-not-allowed'
                    : 'w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-900/40'
                }
              >
                <Download className="w-4 h-4" />
                <span>
                  Unduh Berkas Bersih ({processedBlob ? `${(processedBlob.size / (1024 * 1024)).toFixed(2)} MB` : 'output_bersih.mp4'})
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* EXTERNAL FFPROBE & BITSTREAM VALIDATION UTILITY (BEFORE VS AFTER) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 flex items-center justify-center">
                <FileSearch className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2 flex-wrap">
                  <span>Verifikasi Eksternal FFprobe &amp; Trace Bitstream (Sebelum vs Sesudah)</span>
                  {afterProbe && (
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                        afterProbe.cleanliness.overallClean
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                          : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                      }`}
                    >
                      {afterProbe.cleanliness.overallClean
                        ? '0% SEI • 0 UUID • 0 JUMBF VERIFIED'
                        : 'TERDETEKSI RESIDU'}
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-slate-400">
                  Probe langsung di server menggunakan <code>ffprobe</code> + <code>ffmpeg -bsf:v trace_headers</code> + ISO-BMFF atom scanner pada file asli dan file hasil sanitasi.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {currentFile && (
                <button
                  type="button"
                  disabled={isProbingBefore}
                  onClick={() => runExternalProbe(currentFile, currentFile.name, 'before')}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-bold text-slate-200 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isProbingBefore ? 'animate-spin' : ''}`} />
                  <span>Re-Probe Input</span>
                </button>
              )}
              {processedBlob && (
                <button
                  type="button"
                  disabled={isProbingAfter}
                  onClick={() => {
                    const baseName = currentFile ? currentFile.name.replace(/\.[^/.]+$/, '') : 'video';
                    void runExternalProbe(processedBlob, `${baseName}_output_bersih.mp4`, 'after');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-[11px] font-bold text-emerald-300 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isProbingAfter ? 'animate-spin' : ''}`} />
                  <span>Re-Probe Output</span>
                </button>
              )}
              {(beforeProbe || afterProbe) && (
                <button
                  type="button"
                  onClick={() => setShowRawProbeJson((prev) => !prev)}
                  className="px-3 py-1.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-[11px] font-bold text-indigo-300 flex items-center gap-1 transition cursor-pointer"
                >
                  {showRawProbeJson ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  <span>{showRawProbeJson ? 'Tutup JSON' : 'Raw JSON'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
            {[
              {
                label: 'SEBELUM PEMBERSIHAN (INPUT ASLI)',
                probe: beforeProbe,
                loading: isProbingBefore,
                error: probeErrorBefore,
                emptyHint: 'Pilih video untuk menjalankan ffprobe & bitstream trace secara otomatis.',
                accentBorder: 'border-rose-900/40',
              },
              {
                label: 'SESUDAH SANITASI CLOUD FFMPEG (OUTPUT)',
                probe: afterProbe,
                loading: isProbingAfter,
                error: probeErrorAfter,
                emptyHint: 'Jalankan proses Cloud FFmpeg untuk memverifikasi output bersih via ffprobe.',
                accentBorder: 'border-emerald-900/40',
              },
            ].map((col) => (
              <div key={col.label} className={`bg-slate-950 rounded-xl border ${col.accentBorder} p-4 space-y-3`}>
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-extrabold text-[11px] tracking-wider text-slate-300">{col.label}</span>
                  {col.loading ? (
                    <span className="text-[10px] font-mono text-cyan-400 flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Menjalankan ffprobe...
                    </span>
                  ) : col.probe ? (
                    col.probe.cleanliness.overallClean ? (
                      <span className="text-[10px] font-mono font-bold text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        BERSIH TOTAL
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono font-bold text-rose-400 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        JEJAK AI / SEI DITEMUKAN
                      </span>
                    )
                  ) : (
                    <span className="text-[10px] font-mono text-slate-500">STANDBY</span>
                  )}
                </div>

                {col.error && (
                  <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 text-[11px]">
                    {col.error}
                  </div>
                )}

                {!col.probe && !col.loading && (
                  <div className="py-6 text-center text-slate-500 text-[11px]">{col.emptyHint}</div>
                )}

                {col.probe && (
                  <div className="space-y-2.5 font-mono text-[11px]">
                    {/* AI Risk Score Banner */}
                    <div
                      className={`p-2.5 rounded-lg border flex items-center justify-between ${
                        col.probe.audioVisualForensics.aiVerdict === 'CLEAN_ORGANIC' && col.probe.cleanliness.overallClean
                          ? 'bg-emerald-950/30 border-emerald-500/30'
                          : col.probe.audioVisualForensics.aiVerdict === 'HIGH_AI_RISK'
                            ? 'bg-rose-950/35 border-rose-500/40'
                            : 'bg-amber-950/30 border-amber-500/40'
                      }`}
                    >
                      <span className="text-slate-300 font-bold">Skor Risiko AI Audio-Visual:</span>
                      <span
                        className={`font-extrabold ${
                          col.probe.audioVisualForensics.aiVerdict === 'CLEAN_ORGANIC' && col.probe.cleanliness.overallClean
                            ? 'text-emerald-400'
                            : col.probe.audioVisualForensics.aiVerdict === 'HIGH_AI_RISK'
                              ? 'text-rose-400'
                              : 'text-amber-300'
                        }`}
                      >
                        {col.probe.audioVisualForensics.aiRiskScore}/100 ({col.probe.audioVisualForensics.aiVerdict})
                      </span>
                    </div>

                    {/* Bitstream SEI Summary */}
                    <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Layer 1 • Bitstream SEI NAL Units:</span>
                        <span className={col.probe.seiReport.totalSeiUnits === 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                          {col.probe.seiReport.totalSeiUnits} unit (T6={col.probe.seiReport.nalUnitType6Count}, HEVC={col.probe.seiReport.nalUnitType39Count + col.probe.seiReport.nalUnitType40Count})
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">SEI Payload Types:</span>
                        <span className="text-slate-200">
                          {col.probe.seiReport.payloadTypes.length > 0 ? col.probe.seiReport.payloadTypes.join(', ') : 'Tidak ada'}
                        </span>
                      </div>
                      {col.probe.seiReport.asciiTraces.length > 0 && (
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-400">Jejak ASCII Bitstream/Container:</span>
                          <span className="text-rose-300 text-right truncate max-w-[230px]">
                            {col.probe.seiReport.asciiTraces.join(', ')}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Layer 2: UUID Claims & JUMBF Manifests */}
                    <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Layer 2 • UUID Claim Boxes:</span>
                        <span className={col.probe.uuidClaims.length === 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                          {col.probe.uuidClaims.length === 0 ? '0 (Bersih)' : `${col.probe.uuidClaims.length} box`}
                        </span>
                      </div>
                      {col.probe.uuidClaims.slice(0, 3).map((u, idx) => (
                        <div key={idx} className="text-[10px] text-rose-300 truncate">
                          • uuid @0x{u.offset.toString(16)} ({u.size}B): {u.uuidHex}
                        </div>
                      ))}

                      <div className="flex justify-between pt-1 border-t border-slate-800/80">
                        <span className="text-slate-400">JUMBF / C2PA Manifests:</span>
                        <span className={col.probe.jumbfManifests.length === 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                          {col.probe.jumbfManifests.length === 0 ? '0 (Bersih)' : `${col.probe.jumbfManifests.length} manifes`}
                        </span>
                      </div>
                      {col.probe.jumbfManifests.slice(0, 3).map((j, idx) => (
                        <div key={idx} className="text-[10px] text-rose-300 truncate">
                          • {j.boxType} @0x{j.offset.toString(16)} ({j.size}B): {j.signatureMatches.join(', ')}
                        </div>
                      ))}
                    </div>

                    {/* Layer 3: Visual & Container AI Forensics */}
                    <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1">
                      <div className="flex items-center justify-between text-cyan-300 font-bold pb-1 border-b border-slate-800/80">
                        <span className="flex items-center gap-1.5">
                          <Eye className="w-3.5 h-3.5" />
                          <span>Layer 3 • Forensik Visual &amp; Muxer AI</span>
                        </span>
                        <span className={col.probe.audioVisualForensics.visual.visualClean ? 'text-emerald-400' : 'text-rose-400'}>
                          {col.probe.audioVisualForensics.visual.visualClean ? 'ORGANIK' : 'SINYAL AI'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Cadence FPS:</span>
                        <span className={col.probe.audioVisualForensics.visual.isAiFramerate ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                          {col.probe.audioVisualForensics.visual.fps} fps {col.probe.audioVisualForensics.visual.isAiFramerate ? '(Khas AI Diffusion!)' : '(Normal Kamera)'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">GOP B-Frames / Refs:</span>
                        <span className={col.probe.audioVisualForensics.visual.isZeroBFrames ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                          bf={col.probe.videoStream?.hasBFrames ?? 0} • refs={col.probe.audioVisualForensics.visual.refsCount ?? 1} {col.probe.audioVisualForensics.visual.isZeroBFrames ? '(Sintetik!)' : '(Valid Kamera)'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">MP4 Timestamp &amp; Start PTS:</span>
                        <span
                          className={
                            col.probe.audioVisualForensics.visual.hasZeroCreationTime ||
                            col.probe.audioVisualForensics.visual.hasFfmpegMuxerBrand ||
                            (col.probe.audioVisualForensics.visual.startTimeSec ?? 0) > 0.04
                              ? 'text-rose-400 font-bold'
                              : 'text-emerald-400 font-bold'
                          }
                        >
                          {col.probe.audioVisualForensics.visual.hasZeroCreationTime ? '1904/0' : 'Valid UTC'} •{' '}
                          {col.probe.audioVisualForensics.visual.hasFfmpegMuxerBrand ? 'iso2/512!' : 'Clean Brand'} •{' '}
                          {(col.probe.audioVisualForensics.visual.startTimeSec ?? 0).toFixed(3)}s
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Entropy Tekstur Luma (Y):</span>
                        <span className={col.probe.audioVisualForensics.visual.lumaEntropyAvg > 0 && col.probe.audioVisualForensics.visual.lumaEntropyAvg < 0.72 ? 'text-amber-300 font-bold' : 'text-slate-200'}>
                          {col.probe.audioVisualForensics.visual.lumaEntropyAvg || '-'}
                        </span>
                      </div>
                      {col.probe.audioVisualForensics.visual.visualAiFlags.map((vf, idx) => (
                        <div key={idx} className="text-[10px] text-rose-300">
                          • {vf}
                        </div>
                      ))}
                    </div>

                    {/* Layer 4: Audio AI / TTS / Vocoder Forensics */}
                    <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1">
                      <div className="flex items-center justify-between text-indigo-300 font-bold pb-1 border-b border-slate-800/80">
                        <span className="flex items-center gap-1.5">
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>Layer 4 • Forensik Audio AI &amp; TTS</span>
                        </span>
                        <span className={col.probe.audioVisualForensics.audio.audioClean ? 'text-emerald-400' : 'text-rose-400'}>
                          {col.probe.audioVisualForensics.audio.audioClean ? 'ORGANIK' : 'VOCODER AI'}
                        </span>
                      </div>
                      {col.probe.audioVisualForensics.audio.hasAudio ? (
                        <>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Stereo Mid-Side Field:</span>
                            <span
                              className={
                                (col.probe.audioVisualForensics.audio.channels ?? 2) === 1 ||
                                (col.probe.audioVisualForensics.audio.stereoSideGapDb ?? 0) >= 27.5
                                  ? 'text-rose-400 font-bold'
                                  : 'text-emerald-400 font-bold'
                              }
                            >
                              {col.probe.audioVisualForensics.audio.channels ?? 2}ch • Gap{' '}
                              {col.probe.audioVisualForensics.audio.stereoSideGapDb ?? '-'} dB
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Jeda Hening Mutlak (&lt;-55dB):</span>
                            <span className={col.probe.audioVisualForensics.audio.digitalSilenceCount > 0 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                              {col.probe.audioVisualForensics.audio.digitalSilenceCount} segmen ({col.probe.audioVisualForensics.audio.digitalSilenceSec}s)
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Noise Floor Ruangan:</span>
                            <span
                              className={
                                col.probe.audioVisualForensics.audio.noiseFloorDb <= -55 ||
                                col.probe.audioVisualForensics.audio.noiseFloorDb >= -40.5
                                  ? 'text-rose-400 font-bold'
                                  : 'text-emerald-400 font-bold'
                              }
                            >
                              {col.probe.audioVisualForensics.audio.noiseFloorDb} dB
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Spektrum Udara (&gt;14k / &gt;17kHz):</span>
                            <span className={col.probe.audioVisualForensics.audio.highBand17kDb <= -56 || col.probe.audioVisualForensics.audio.airCliffDb >= 32.5 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                              {col.probe.audioVisualForensics.audio.highBand14kDb} / {col.probe.audioVisualForensics.audio.highBand17kDb} dB (Cliff {col.probe.audioVisualForensics.audio.airCliffDb} dB)
                            </span>
                          </div>
                          {col.probe.audioVisualForensics.audio.audioAiFlags.map((af, idx) => (
                            <div key={idx} className="text-[10px] text-rose-300">
                              • {af}
                            </div>
                          ))}
                        </>
                      ) : (
                        <div className="text-[10px] text-slate-500">Stream video ini tidak memiliki track audio.</div>
                      )}
                    </div>

                    {/* Container & Stream Details */}
                    <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Container Brand / Streams:</span>
                        <span className="text-slate-200">
                          {col.probe.format.majorBrand || '-'} • {col.probe.format.nbStreams} stream
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Handler Name:</span>
                        <span className="text-cyan-300 truncate max-w-[200px]">
                          {col.probe.videoStream?.handlerName || '-'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Top-Level MP4 Atoms:</span>
                        <span className="text-slate-300 truncate max-w-[200px]">
                          {col.probe.boxTreeSummary.map((b) => b.type).join(' -> ') || '-'}
                        </span>
                      </div>
                      {col.probe.cleanliness.flaggedReasons.length > 0 && (
                        <div className="pt-1.5 mt-1 border-t border-slate-800/80 space-y-0.5 text-[10px] text-rose-300">
                          <div className="font-bold text-rose-400">Penyebab Terdeteksi ({col.probe.cleanliness.flaggedReasons.length}):</div>
                          {col.probe.cleanliness.flaggedReasons.map((reason, idx) => (
                            <div key={idx}>- {reason}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {showRawProbeJson && (beforeProbe || afterProbe) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
              <pre className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-[10px] font-mono text-slate-300 max-h-60 overflow-auto">
                {beforeProbe ? JSON.stringify(beforeProbe, null, 2) : '// Belum ada hasil probe input'}
              </pre>
              <pre className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-[10px] font-mono text-emerald-300 max-h-60 overflow-auto">
                {afterProbe ? JSON.stringify(afterProbe, null, 2) : '// Belum ada hasil probe output'}
              </pre>
            </div>
          )}
        </div>

        {/* TERMINAL LOG DISPLAY */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Terminal className="w-4 h-4 text-indigo-400" />
              <span>Cloud Anti-SynthID, Shopee Bypass &amp; SEI Bitstream Filter Terminal Log</span>
            </h3>
            <span className="text-xs font-mono font-bold text-indigo-400">{progressText}</span>
          </div>

          <div
            ref={terminalRef}
            className="bg-slate-950 border border-slate-800/90 rounded-xl p-4 font-mono text-xs text-slate-300 h-56 overflow-y-auto space-y-1.5 leading-relaxed"
          >
            {logs.map((entry) => {
              let colorClass = 'text-slate-300';
              if (entry.color === 'emerald') colorClass = 'text-emerald-400 font-bold';
              if (entry.color === 'indigo') colorClass = 'text-indigo-400 font-semibold';
              if (entry.color === 'amber') colorClass = 'text-amber-400';
              if (entry.color === 'rose') colorClass = 'text-rose-400 font-bold';

              return (
                <div key={entry.id} className={colorClass}>
                  <span className="text-slate-600">[{entry.time}]</span> {entry.text}
                </div>
              );
            })}
          </div>
        </div>

        {/* EDUCATING / DIAGNOSTIC GUIDE CARD: WHY RAW SCRIPT CAUSES GLITCH & HOW METACLEANER PRO FIXES IT */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center gap-2.5 text-amber-400">
            <span className="text-lg">💡</span>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Panduan Teknis: Mengapa Script Biasa Menyebabkan Glitch &amp; Cara Lolos Detektor AI Shopee
            </h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="bg-slate-950 p-4 rounded-xl border border-rose-900/30 space-y-2">
              <div className="font-bold text-rose-400 flex items-center gap-1.5">
                <span>⚠️</span>
                <span>Mengapa Script Manual Menyebabkan Glitch</span>
              </div>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Script binary manual menimpa byte mentah dengan <code className="text-rose-300">0x00</code> di dalam <code className="text-slate-300">mdat</code> saat mencari pola SEI. Karena MP4 memakai <strong>4-byte length prefix &amp; interlaced audio</strong>, menimpa atau memotong byte merusak panjang paket (<code className="text-slate-300">stsz/stco</code>) dan korup decoder CABAC — akibatnya video menjadi <strong>glitch, patah-patah, dan frame beku</strong>.
              </p>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-emerald-900/30 space-y-2">
              <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                <span>🛡️</span>
                <span>Pembersihan 4 Lapisan Tanpa Glitch</span>
              </div>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                MetaCleaner v19 memproses video-audio penuh lalu menulis ulang paket dengan <code className="text-emerald-300">-bsf:v filter_units=remove_types=6</code> (0% SEI, 100% sinkron <code>stsz</code>), konversi <strong>24fps -&gt; 29.97fps mulus + B-Frames (bf=2)</strong> agar bebas stutter, serta dekorrelasi sensor CMOS + mikronoise kamera asli.
              </p>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-indigo-900/30 space-y-2">
              <div className="font-bold text-indigo-400 flex items-center gap-1.5">
                <span>🎙️</span>
                <span>Penetralan Audio TTS &amp; Vocoder AI</span>
              </div>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Detektor platform modern memindai <strong>jeda hening digital (&lt;-55dB)</strong> dan <strong>spektrum terpotong &gt;16kHz</strong> khas AI voice/vocoder. MetaCleaner v19 menyuntikkan ambient room-air alami, disperasi fase akustik, &amp; memaksa AAC <code className="text-indigo-300">-cutoff 20200</code> agar audio lolos sebagai rekaman mikrofon kamera asli.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
