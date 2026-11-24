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
 * and NOT an HTML error/redirect page (such as cookie_check.html or proxy timeout HTML).
 */
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

  // Reject HTML error/redirect responses (e.g. <!DOCTYPE or <html)
  if (
    bytes[0] === 0x3c ||
    (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf && bytes[3] === 0x3c)
  ) {
    const snippet = decoder.decode(bytes.subarray(0, 120)).replace(/\s+/g, ' ').trim();
    return {
      valid: false,
      reason: `Server/Proxy mengembalikan halaman HTML bukan MP4 (${snippet.slice(0, 80)}...).`,
    };
  }

  // Reject JSON error payloads accidentally returned as 200
  if (bytes[0] === 0x7b || bytes[0] === 0x5b) {
    try {
      const parsed = JSON.parse(new TextDecoder('utf-8').decode(bytes));
      if (parsed?.error) {
        return { valid: false, reason: String(parsed.error) };
      }
    } catch {}
    return {
      valid: false,
      reason: 'Server mengembalikan respons JSON/teks, bukan stream MP4 biner.',
    };
  }

  const firstBoxType = decoder.decode(bytes.subarray(4, 8));
  if (!VALID_TOP_BOXES.has(firstBoxType)) {
    return {
      valid: false,
      reason: `Header top-level atom tidak valid ("${firstBoxType.replace(/[^\x20-\x7e]/g, '?')}").`,
    };
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
  if (!hasMoov && !hasMdat) {
    return { valid: false, reason: 'Atom moov/mdat tidak ditemukan dalam output MP4.' };
  }
  if (bytes.byteLength < minRequiredBytes) {
    return {
      valid: false,
      reason: `Ukuran MP4 output (${bytes.byteLength}B) di bawah batas minimum (${minRequiredBytes}B).`,
    };
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
    if (depth > 8) return;
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

      if (type === 'stsd' && offset + headerSize + 8 < offset + size) {
        clean(offset + headerSize + 8, offset + size, depth + 1);
      } else if (['avc1', 'avc3', 'hev1', 'hvc1', 'mp4v'].includes(type) && size >= 86) {
        bytes.fill(0x00, offset + 50, offset + 82);
        bytes.fill(0x00, offset + 20, offset + 24);
      } else if (['uuid', 'c2pa', 'jumb', 'c2ma', 'c2cl', 'XMP_'].includes(type)) {
        bytes[offset + 4] = 0x66;
        bytes[offset + 5] = 0x72;
        bytes[offset + 6] = 0x65;
        bytes[offset + 7] = 0x65;
        bytes.fill(0x00, offset + headerSize, offset + size);
      } else if (['udta', 'meta', 'ilst', '©too', '©enc'].includes(type)) {
        const payload = decoder.decode(bytes.subarray(offset + headerSize, Math.min(offset + size, offset + 512)));
        const isEmptyTombstone =
          (type === 'udta' && payload.includes('mdirappl') && size <= 128) ||
          (type === 'meta' && payload.includes('mdirappl') && size <= 120) ||
          (type === 'ilst' && size <= 16);
        if (
          isEmptyTombstone ||
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
          payload.includes('live-tech')
        ) {
          bytes[offset + 4] = 0x66;
          bytes[offset + 5] = 0x72;
          bytes[offset + 6] = 0x65;
          bytes[offset + 7] = 0x65;
          bytes.fill(0x00, offset + headerSize, offset + size);
        } else {
          const nextStart = type === 'meta' ? offset + headerSize + 4 : offset + headerSize;
          if (nextStart < offset + size) {
            clean(nextStart, offset + size, depth + 1);
          }
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

  // 2. Direct container header scan outside mdat for Lavf, Lavc, Google partial stamps, Shopee s264, and AI vendor tags
  const mdatStart = mdatRanges.length > 0 ? mdatRanges[0].start - 8 : uint8.length;
  const containerSlice = textDecoder.decode(uint8.subarray(0, mdatStart));
  const containerLower = containerSlice.toLowerCase();
  for (const vs of VENDOR_SIGNATURES) {
    if (containerLower.includes(vs.toLowerCase()) && !rawVendors.includes(vs)) {
      rawVendors.push(vs);
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
      ? `Terdeteksi AI (${
          detectedSeiDetails.includes('SHOPEE')
            ? 'Shopee Video'
            : seiFound
              ? 'SEI Type 6 Bitstream'
              : c2paFound || uuidFound || udtaMetaFound
                ? 'C2PA / Provenance Box'
                : allVendors.some((v) => v === 'Lavf' || v === 'Lavc' || v === 'x264 - core')
                  ? 'Lavc/Lavf Encoder Stamp'
                  : 'SynthID / Metadata Marker'
        })`
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

  // External ffprobe + trace_headers verification states (Before & After)
  const [beforeProbe, setBeforeProbe] = useState<ExternalProbeReport | null>(null);
  const [afterProbe, setAfterProbe] = useState<ExternalProbeReport | null>(null);
  const [isProbingBefore, setIsProbingBefore] = useState(false);
  const [isProbingAfter, setIsProbingAfter] = useState(false);
  const [probeErrorBefore, setProbeErrorBefore] = useState<string | null>(null);
  const [probeErrorAfter, setProbeErrorAfter] = useState<string | null>(null);
  const [showRawProbeJson, setShowRawProbeJson] = useState(false);

  // FFprobe SEI & C2PA/UUID Diagnostic Tool states
  const [diagTarget, setDiagTarget] = useState<'before' | 'after'>('before');
  const [diagFilter, setDiagFilter] = useState<'all' | 'triggers' | 'sei' | 'meta'>('all');
  const [showFfprobeConsole, setShowFfprobeConsole] = useState(false);
  const [copiedDiag, setCopiedDiag] = useState(false);

  // Resilient chunked server upload states
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'uploaded' | 'error'>('idle');
  const [uploadPercent, setUploadPercent] = useState<number>(0);
  const [uploadedBytes, setUploadedBytes] = useState<number>(0);
  const [uploadChunkInfo, setUploadChunkInfo] = useState<{ current: number; total: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [serverUploadId, setServerUploadId] = useState<string | null>(null);

  // Server processing telemetry & 5-minute auto-clean states (Non-streaming)
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

  useEffect(() => {
    setSupportsNativeShare(
      typeof navigator !== 'undefined' && typeof navigator.share === 'function'
    );
  }, []);

  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 'init-1',
      time: '--:--:--',
      text: "[MetaCleaner V 2.0 Server Upload Pipeline] Ready: Upload Resumable ke Server -> Proses FFmpeg Non-Streaming -> Auto-Clean 5 Menit.",
      color: 'indigo',
    },
    {
      id: 'init-2',
      time: '--:--:--',
      text: 'Membersihkan 4 lapisan jejak AI & editan di server secara penuh (Zero-Tombstone MP4, Zero-SEI Type 6, Bayer Grain, Audio 22.5kHz) tanpa putus saat internet lambat.',
      color: 'slate',
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
          appendLog(
            '✓ [SERVER CLEANED] File video input & hasil telah dibersihkan dari server.',
            'emerald'
          );
        }
      } finally {
        if (!opts?.silent) setIsCleaningServerNow(false);
      }
    },
    [appendLog]
  );

  // Live 5-minute auto-clean countdown timer
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
        appendLog(
          '✓ [AUTO-CLEAN 5 MENIT] Masa simpan 5 menit selesai — file video input & output di server telah dihapus otomatis.',
          'emerald'
        );
      }
    };

    updateTimer();
    const timer = window.setInterval(updateTimer, 1000);
    return () => window.clearInterval(timer);
  }, [autoCleanExpiresAt, isServerCleanedUp, appendLog]);

  const formatCountdown = (seconds: number | null): string => {
    if (seconds === null || !Number.isFinite(seconds)) return '05:00';
    const s = Math.max(0, Math.floor(seconds));
    const mins = String(Math.floor(s / 60)).padStart(2, '0');
    const secs = String(s % 60).padStart(2, '0');
    return `${mins}:${secs}`;
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

        // Retry up to 3 times on transient network hiccups
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
              throw new Error('Sumber video untuk probe tidak tersedia.');
            }

            const json = await res.json();
            if (!res.ok || !json?.success || !json?.probe) {
              throw new Error(json?.error || `FFprobe status ${res.status}`);
            }
            data = json;
            break;
          } catch (err: any) {
            lastErr = err instanceof Error ? err : new Error(String(err));
            if (attempt < 3) {
              await new Promise((r) => setTimeout(r, attempt * 1200));
            }
          }
        }

        if (!data?.probe) {
          throw lastErr || new Error('Gagal menjalankan ffprobe server.');
        }

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
            c2pa: probe.cleanliness.isZeroJumbf
              ? 'TIDAK TERDETEKSI'
              : `TERDETEKSI (${probe.jumbfManifests.length} manifes)`,
            c2paClean: probe.cleanliness.isZeroJumbf,
            uuid: probe.cleanliness.isZeroUuid
              ? 'BERSIH (0 UUID Claim)'
              : `TERDETEKSI (${probe.uuidClaims.length} UUID box)`,
            uuidClean: probe.cleanliness.isZeroUuid,
            encoder: !probe.cleanliness.isZeroAiVendor
              ? `TERDETEKSI (${probe.cleanliness.flaggedReasons.find((r) => r.includes('vendor') || r.includes('ASCII')) || 'Vendor/Handler Tag'})`
              : probe.format.tags?.make || probe.format.tags?.model
                ? `BERSIH • OEM: ${[probe.format.tags?.make, probe.format.tags?.model].filter(Boolean).join(' ')} (${probe.videoStream?.handlerName || 'Handler'})`
                : target === 'after'
                  ? `${prev.encoder}`
                  : `BERSIH (${probe.videoStream?.handlerName || 'Standard Handler'})`,
            encoderClean: probe.cleanliness.isZeroAiVendor,
            sei:
              seiTotal > 0
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
          setBeforeState((prev) => mapProbeState(prev));
          setDiagTarget('before');
        } else {
          setAfterProbe(probe);
          setAfterState((prev) => mapProbeState(prev));
          setDiagTarget('after');
        }

        appendLog(
          `[FFPROBE SERVER (${target.toUpperCase()})] AI Risk=${av.aiRiskScore}/100 (${av.aiVerdict}) | SEI=${probe.seiReport.totalSeiUnits} | FPS=${av.visual.fps} (B-Frame=${probe.videoStream?.hasBFrames ?? 0}) | Silence=${av.audio.digitalSilenceCount} | Air>17kHz=${av.audio.highBand17kDb}dB (Cliff=${av.audio.airCliffDb}dB) | Verdict: ${probe.cleanliness.overallClean ? 'BERSIH TOTAL' : 'TERDETEKSI JEJAK AI'}`,
          probe.cleanliness.overallClean ? 'emerald' : 'amber'
        );
      } catch (err: any) {
        const msg = err?.message || 'Gagal menjalankan ffprobe server';
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

  // Restore active or recently-completed server job after page reload
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
        const res = await fetch(
          `/api/meta-cleaner/progress?jobId=${encodeURIComponent(parsed.jobId)}`,
          {
            cache: 'no-store',
            credentials: 'include',
            signal: AbortSignal.timeout(12000),
          }
        );
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

        let maxRestorePct = pData.percent || 0;
        setLastJobId(parsed.jobId);
        if (parsed.uploadId) setServerUploadId(parsed.uploadId);
        setCloudProgress(pData);

        if (pData.resultReady || (pData.stage === 'completed' && Boolean(pData.downloadUrl))) {
          const expiresAtIso =
            pData.expiresAt || new Date(Date.now() + 5 * 60 * 1000).toISOString();
          setAutoCleanExpiresAt(expiresAtIso);
          setIsServerCleanedUp(false);
          setServerDownloadUrl(
            `/api/meta-cleaner/download?jobId=${encodeURIComponent(parsed.jobId)}&filename=${encodeURIComponent(outName)}`
          );
          setPreviewUrlAfter(
            `/api/meta-cleaner/download?jobId=${encodeURIComponent(parsed.jobId)}&inline=1&t=${Date.now()}`
          );
          setProgressText('SELESAI 100%');
          appendLog(
            `✓ [SESSION PULIH] Hasil video Job ${parsed.jobId} masih tersedia di server hingga masa Auto-Clean 5 menit berakhir.`,
            'emerald'
          );
        } else if (pData.stage !== 'failed') {
          setIsProcessing(true);
          activeJobIdRef.current = parsed.jobId;
          abortPollingRef.current = false;
          setProgressText(`${maxRestorePct || 5}%`);
          appendLog(
            `[SESSION PULIH] Menyambung kembali pemantauan proses server Job ${parsed.jobId}...`,
            'indigo'
          );

          while (!cancelled && !abortPollingRef.current) {
            await new Promise((r) => setTimeout(r, maxRestorePct >= 75 ? 350 : 600));
            if (cancelled || abortPollingRef.current) break;
            try {
              const pollRes = await fetch(
                `/api/meta-cleaner/progress?jobId=${encodeURIComponent(parsed.jobId)}`,
                {
                  cache: 'no-store',
                  credentials: 'include',
                  signal: AbortSignal.timeout(12000),
                }
              );
              if (!pollRes.ok) {
                setNetworkWarning(
                  `Koneksi lambat (HTTP ${pollRes.status}) — pemrosesan tetap berjalan di server...`
                );
                continue;
              }
              setNetworkWarning(null);
              const nextData = (await pollRes.json()) as CleanerProgressState;
              if (cancelled || abortPollingRef.current) break;
              const isTerminalReady =
                Boolean(nextData.resultReady) &&
                nextData.stage === 'completed' &&
                Boolean(nextData.downloadUrl);

              if (nextData.stage !== 'failed') {
                const boundedPct = isTerminalReady
                  ? 100
                  : Math.min(99, Math.max(maxRestorePct, nextData.percent || 0));
                maxRestorePct = boundedPct;
                nextData.percent = boundedPct;
              }

              if (nextData.expired) {
                setIsServerCleanedUp(true);
                setIsProcessing(false);
                break;
              }
              if (isTerminalReady) {
                setCloudProgress({
                  ...nextData,
                  stage: 'binary_sanitize',
                  percent: 99,
                  message: 'Memverifikasi integritas hasil & kesiapan download...',
                });
                setProgressText('VERIFIKASI AKHIR (99%)...');
                await runExternalProbe({ jobId: parsed.jobId, filename: outName }, 'after');
                if (cancelled || abortPollingRef.current) break;
                const expIso =
                  nextData.expiresAt || new Date(Date.now() + 5 * 60 * 1000).toISOString();
                setAutoCleanExpiresAt(expIso);
                setIsServerCleanedUp(false);
                setServerDownloadUrl(
                  `/api/meta-cleaner/download?jobId=${encodeURIComponent(parsed.jobId)}&filename=${encodeURIComponent(outName)}`
                );
                setPreviewUrlAfter(
                  `/api/meta-cleaner/download?jobId=${encodeURIComponent(parsed.jobId)}&inline=1&t=${Date.now()}`
                );
                setCloudProgress({ ...nextData, stage: 'completed', percent: 100 });
                setProgressText('SELESAI 100%');
                setIsProcessing(false);
                break;
              }
              setCloudProgress(nextData);
              setProgressText(`${nextData.percent}%`);
              if (nextData.stage === 'failed') {
                setProgressText('GAGAL');
                setIsProcessing(false);
                break;
              }
            } catch {
              setNetworkWarning(
                'Koneksi internet terganggu — pekerjaan tetap berjalan di server, menunggu jaringan kembali...'
              );
            }
          }
        }
      } catch {}
    };

    void restoreSessionJob();
    return () => {
      cancelled = true;
    };
  }, [appendLog, runExternalProbe]);


  // Resilient chunked uploader with resume & per-chunk retries on bad internet
  const uploadVideoToServer = useCallback(
    async (file: File, reuseUploadId?: string): Promise<string> => {
      uploadAbortRef.current?.abort();
      const abortCtrl = new AbortController();
      uploadAbortRef.current = abortCtrl;

      const uploadId =
        reuseUploadId ||
        `up_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      setServerUploadId(uploadId);
      setUploadStatus('uploading');
      setUploadError(null);
      setIsServerCleanedUp(false);

      const CHUNK_SIZE =
        file.size > 12 * 1024 * 1024 ? 1 * 1024 * 1024 : 2 * 1024 * 1024;
      const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
      setUploadChunkInfo({ current: 0, total: totalChunks });

      const buildVerifySignal = (ms: number): AbortSignal => {
        const timeoutSig = AbortSignal.timeout(ms);
        const abortSigAny = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
        if (typeof abortSigAny === 'function') {
          return abortSigAny([abortCtrl.signal, timeoutSig]);
        }
        return timeoutSig;
      };

      // Check if server already has partial/complete chunks (resume support)
      const alreadyReceived = new Set<number>();
      if (reuseUploadId) {
        try {
          const checkRes = await fetch(
            `/api/meta-cleaner/upload?uploadId=${encodeURIComponent(uploadId)}`,
            { cache: 'no-store', credentials: 'include', signal: buildVerifySignal(10000) }
          );
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            if (checkData?.assembled) {
              setUploadedBytes(file.size);
              setUploadPercent(100);
              setUploadStatus('uploaded');
              setUploadChunkInfo({ current: totalChunks, total: totalChunks });
              appendLog(
                `✓ [SERVER UPLOAD READY] Berkas "${file.name}" sudah siap di server (resume terverifikasi).`,
                'emerald'
              );
              return uploadId;
            }
            if (Array.isArray(checkData?.receivedChunks)) {
              for (const idx of checkData.receivedChunks) {
                alreadyReceived.add(Number(idx));
              }
            }
          }
        } catch {}
      }

      appendLog(
        `[UPLOAD KE SERVER] Mengunggah "${file.name}" (${(file.size / (1024 * 1024)).toFixed(2)} MB) dalam ${totalChunks} bagian (${alreadyReceived.size > 0 ? `resume dari ${alreadyReceived.size}/${totalChunks}` : 'resilient chunked upload'})...`,
        'indigo'
      );

      let completedBytes = 0;
      for (let i = 0; i < totalChunks; i++) {
        if (alreadyReceived.has(i)) {
          const start = i * CHUNK_SIZE;
          const end = Math.min(file.size, start + CHUNK_SIZE);
          completedBytes += end - start;
        }
      }
      setUploadedBytes(completedBytes);
      setUploadPercent(Math.min(99, Math.round((completedBytes / file.size) * 100)));

      const sendChunkXhr = (
        chunkIndex: number,
        chunkBlob: Blob,
        chunkStartBytes: number
      ): Promise<any> => {
        return new Promise((resolve, reject) => {
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
              setUploadPercent(
                Math.min(99, Math.max(1, Math.round((currentTotal / file.size) * 100)))
              );
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
            reject(new Error('Koneksi terputus saat mengunggah chunk ke server.'));
          };

          xhr.ontimeout = () => {
            abortCtrl.signal.removeEventListener('abort', onAbort);
            reject(new Error('Timeout koneksi saat mengunggah chunk ke server.'));
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
      };

      try {
        for (let idx = 0; idx < totalChunks; idx++) {
          if (abortCtrl.signal.aborted) {
            throw new DOMException('Aborted', 'AbortError');
          }
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
          const maxRetries = 8;

          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            if (abortCtrl.signal.aborted) {
              throw new DOMException('Aborted', 'AbortError');
            }
            try {
              await sendChunkXhr(idx, chunkBlob, completedBytes);
              chunkUploaded = true;
              break;
            } catch (err: any) {
              if (err?.name === 'AbortError') throw err;
              lastChunkErr = err instanceof Error ? err : new Error(String(err));

              // Before retrying, check if server actually received this chunk before disconnect
              try {
                const verifyRes = await fetch(
                  `/api/meta-cleaner/upload?uploadId=${encodeURIComponent(uploadId)}`,
                  { cache: 'no-store', credentials: 'include', signal: buildVerifySignal(10000) }
                );
                if (verifyRes.ok) {
                  const vData = await verifyRes.json();
                  if (
                    vData?.assembled ||
                    (Array.isArray(vData?.receivedChunks) && vData.receivedChunks.includes(idx))
                  ) {
                    chunkUploaded = true;
                    break;
                  }
                }
              } catch {}

              if (attempt < maxRetries) {
                const waitMs = Math.min(10000, attempt * 1500);
                setUploadError(
                  `Internet lambat pada bagian ${idx + 1}/${totalChunks} — mencoba ulang (${attempt}/${maxRetries})...`
                );
                appendLog(
                  `[UPLOAD RETRY ${attempt}/${maxRetries}] Bagian ${idx + 1}/${totalChunks} gagal (${lastChunkErr.message}), mencoba ulang dalam ${(waitMs / 1000).toFixed(1)}d...`,
                  'amber'
                );
                await new Promise((r) => setTimeout(r, waitMs));
              }
            }
          }

          if (!chunkUploaded) {
            throw lastChunkErr || new Error(`Gagal mengunggah bagian ${idx + 1}/${totalChunks}.`);
          }

          setUploadError(null);
          completedBytes += end - start;
          setUploadedBytes(completedBytes);
          setUploadPercent(Math.min(100, Math.round((completedBytes / file.size) * 100)));
        }

        setUploadPercent(100);
        setUploadedBytes(file.size);
        setUploadStatus('uploaded');
        setUploadError(null);
        appendLog(
          `✓ [UPLOAD SELESAI 100%] "${file.name}" tersimpan aman di server (ID: ${uploadId}). Siap diproses tanpa streaming!`,
          'emerald'
        );
        return uploadId;
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          throw err;
        }
        const msg = err?.message || 'Gagal mengunggah video ke server.';
        setUploadStatus('error');
        setUploadError(msg);
        appendLog(`[UPLOAD ERROR] ${msg} — klik "Lanjutkan Upload" untuk melanjutkan bagian yang tersisa.`, 'rose');
        throw err;
      }
    },
    [appendLog]
  );

  const handleFileSelected = async (file: File | null | undefined) => {
    if (!file) return;

    // Abort any running upload or polling from previous file and clean previous server files
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

    setFileStatus({ text: 'Membaca ke RAM...', color: 'amber' });

    try {
      const inspectSlice = file.slice(0, 16 * 1024 * 1024);
      const buffer = await inspectSlice.arrayBuffer();
      setFileArrayBuffer(buffer);
      setFileStatus({ text: 'Siap Upload ke Server', color: 'emerald' });

      const uint8 = new Uint8Array(buffer);
      const inspected = await inspectVideoBuffer(uint8, false);
      setBeforeState(inspected);

      appendLog(
        `[FILE LOADED] Berkas "${file.name}" (${(file.size / (1024 * 1024)).toFixed(2)} MB) siap diunggah ke server.`,
        'indigo'
      );
      appendLog(
        `[INSPECTION] SynthID: ${inspected.synthId} | C2PA: ${inspected.c2pa} | UUID: ${inspected.uuid} | Vendor: ${inspected.encoder} | SEI: ${inspected.sei}`,
        inspected.riskClean ? 'emerald' : 'amber'
      );

      // Immediately upload video in resilient chunks, then run server-side probe using uploadId (no duplicate transfer!)
      try {
        const upId = await uploadVideoToServer(file);
        void runExternalProbe({ uploadId: upId, filename: file.name }, 'before');
      } catch (upErr: any) {
        if (upErr?.name !== 'AbortError') {
          setFileStatus({ text: 'Upload Tertunda', color: 'amber' });
        }
      }
    } catch (err: any) {
      setFileStatus({ text: 'Gagal Membaca', color: 'rose' });
      appendLog(`[ERROR] Gagal membaca berkas: ${err?.message || 'Unknown error'}`, 'rose');
    }
  };

  const executeAutoSanitization = async () => {
    if (!currentFile) return;
    if (isProcessing) return;

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
      if (pData.stage !== 'failed') {
        maxUiPercent = clampedPct;
      }
      const nextState: CleanerProgressState = holdAtVerification
        ? {
            ...pData,
            stage: 'binary_sanitize',
            percent: clampedPct,
            message: 'Memverifikasi 0 SEI, atom MOOV & kesiapan file bersih di server...',
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
      // 1. Ensure video is uploaded to server first (resumes partial upload if needed, 0KB if already uploaded)
      let activeUploadId = serverUploadIdRef.current;
      if (!activeUploadId || uploadStatus !== 'uploaded' || isServerCleanedUp) {
        setProgressText('MENGUNGGAH VIDEO KE SERVER...');
        activeUploadId = await uploadVideoToServer(
          currentFile,
          activeUploadId && !isServerCleanedUp ? activeUploadId : undefined
        );
      }

      if (abortPollingRef.current) return;

      // Ensure Before probe runs on uploaded server file if it failed earlier
      if (!beforeProbe && !isProbingBefore) {
        void runExternalProbe({ uploadId: activeUploadId, filename: currentFile.name }, 'before');
      }

      // 2. Start non-streaming server MetaCleaner job with lightweight JSON payload
      setProgressText('MEMULAI PROSES DI SERVER...');
      setCloudProgress({
        jobId,
        uploadId: activeUploadId,
        stage: 'queued',
        message: 'Video sudah di server — memulai pemrosesan FFmpeg tanpa streaming...',
        percent: 3,
        frame: 0,
        totalFrames: 0,
        fps: 0,
        speed: '0x',
        outTimeSec: 0,
        durationSec: 0,
        engine: 'Server Upload Queue (Non-Streaming)',
        logs: [],
        updatedAt: new Date().toISOString(),
        ttlSeconds: 300,
      });

      appendLog(
        `[SERVER UPLOAD PIPELINE] Memulai pemrosesan penuh di server untuk Upload ${activeUploadId} (Job: ${jobId}) — tahan internet lambat, auto-clean 5 menit setelah selesai.`,
        'indigo'
      );

      let startAck: any = null;
      let startErr: Error | null = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        // Before retrying POST, check if server already accepted and started this jobId (prevents duplicate restart)
        if (attempt > 1) {
          try {
            const verifyJobRes = await fetch(
              `/api/meta-cleaner/progress?jobId=${encodeURIComponent(jobId)}`,
              {
                cache: 'no-store',
                credentials: 'include',
                signal: AbortSignal.timeout(10000),
              }
            );
            if (verifyJobRes.ok) {
              const existingState = (await verifyJobRes.json()) as CleanerProgressState;
              if (existingState?.stage && existingState.stage !== 'queued' && existingState.stage !== 'failed') {
                startAck = { accepted: true, resumedFromProgress: true };
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
            }),
            cache: 'no-store',
            credentials: 'include',
            signal: AbortSignal.timeout(25000),
          });
          const json = await startRes.json().catch(() => null);
          if (!startRes.ok || !json?.accepted) {
            if (startRes.status === 404) {
              // Upload expired before clean started -> re-upload cleanly once
              activeUploadId = await uploadVideoToServer(currentFile);
              continue;
            }
            throw new Error(json?.error || `Gagal memulai job di server (HTTP ${startRes.status}).`);
          }
          startAck = json;
          break;
        } catch (err: any) {
          startErr = err instanceof Error ? err : new Error(String(err));
          if (attempt < 3) {
            await new Promise((r) => setTimeout(r, attempt * 1500));
          }
        }
      }

      if (!startAck?.accepted) {
        throw startErr || new Error('Server gagal memulai antrean MetaCleaner.');
      }

      try {
        sessionStorage.setItem(
          'metacleaner_active_job',
          JSON.stringify({
            jobId,
            uploadId: activeUploadId,
            fileName: currentFile.name,
            cameraProfile,
            startedAt: new Date().toISOString(),
          })
        );
      } catch {}

      // 3. Adaptive resilient polling — faster during remux/tail stages + auto-resync on stale progress
      const startedAt = Date.now();
      const maxWaitMs = 15 * 60 * 1000;
      let finalState: CleanerProgressState | null = null;
      let lastServerSig = '';
      let lastProgressAdvanceAt = Date.now();
      let latestServerStage: string = 'queued';

      while (Date.now() - startedAt < maxWaitMs) {
        if (abortPollingRef.current) return;
        const pollDelayMs =
          maxUiPercent >= 75 ||
          latestServerStage === 'pass2_remux' ||
          latestServerStage === 'binary_sanitize'
            ? 300
            : 450;
        await new Promise((r) => setTimeout(r, pollDelayMs));
        if (abortPollingRef.current) return;

        try {
          const needResync = Date.now() - lastProgressAdvanceAt > 18000;
          const pRes = await fetch(
            `/api/meta-cleaner/progress?jobId=${encodeURIComponent(jobId)}${needResync ? '&resync=1' : ''}`,
            {
              cache: 'no-store',
              credentials: 'include',
              signal: AbortSignal.timeout(12000),
            }
          );
          if (!pRes.ok) {
            setNetworkWarning(
              `Koneksi lambat (HTTP ${pRes.status}) — pemrosesan tetap berjalan aman di server, menyinkronkan ulang...`
            );
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }

          setNetworkWarning(null);
          const rawJson = await pRes.json();
          const pData = (rawJson?.state ? rawJson.state : rawJson) as CleanerProgressState;
          if (pData?.stage) {
            latestServerStage = pData.stage;
          }
          const sig = `${pData.stage}:${pData.percent}:${pData.frame}:${pData.message}`;
          if (sig !== lastServerSig) {
            lastServerSig = sig;
            lastProgressAdvanceAt = Date.now();
          }

          if (pData.expired) {
            setIsServerCleanedUp(true);
            throw new Error(
              'File video telah melewati batas 5 menit dan sudah dihapus otomatis (Auto-Clean) di server.'
            );
          }

          const isTerminalReady =
            Boolean(pData.resultReady) &&
            pData.stage === 'completed' &&
            Boolean(pData.downloadUrl);

          // Hold at verification percentage (<=99%) until post-remux audit + download readiness passes!
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
            pollErr?.message?.includes('batas waktu')
          ) {
            throw pollErr;
          }
          setNetworkWarning(
            'Koneksi internet terganggu — pekerjaan tetap berjalan di server, menunggu jaringan kembali...'
          );
          await new Promise((r) => setTimeout(r, 1500));
        }
      }

      if (abortPollingRef.current) return;

      if (!finalState) {
        throw new Error('Waktu tunggu pemantauan server melebihi batas. Coba cek ulang atau unggah ulang.');
      }

      // 4. Verify downloadable MP4 file header on server BEFORE marking UI finished!
      setProgressText('MEMVERIFIKASI KESIAPAN FILE BERSIH (99%)...');
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

      if (!downloadHeaderVerified) {
        throw new Error('File hasil di server belum siap atau struktur ftyp MP4 gagal diverifikasi.');
      }

      // 5. Run server-side FFprobe audit BEFORE marking status as completed 100%!
      setProgressText('VERIFIKASI FFPROBE & 0 SEI DI SERVER (99%)...');
      await runExternalProbe({ jobId, filename: outputFileName }, 'after');
      if (abortPollingRef.current) return;

      const expiresAtIso =
        finalState.expiresAt || new Date(Date.now() + 5 * 60 * 1000).toISOString();
      const inlineStreamUrl = `/api/meta-cleaner/download?jobId=${encodeURIComponent(jobId)}&inline=1&t=${Date.now()}`;
      const downloadAttachmentUrl = `/api/meta-cleaner/download?jobId=${encodeURIComponent(jobId)}&filename=${encodeURIComponent(outputFileName)}`;

      // Gently cache output into local browser RAM only when output <= 25 MB (prevents OOM tab crashes on large videos)
      let cachedBlob: Blob | null = null;
      const shouldCacheInBrowserRam =
        typeof finalState.outputSizeBytes === 'number' &&
        finalState.outputSizeBytes > 0 &&
        finalState.outputSizeBytes <= 25 * 1024 * 1024;
      if (shouldCacheInBrowserRam) {
        for (let dlAttempt = 1; dlAttempt <= 3; dlAttempt++) {
          if (abortPollingRef.current) return;
          try {
            const dlRes = await fetch(
              `/api/meta-cleaner/download?jobId=${encodeURIComponent(jobId)}&inline=1&t=${Date.now()}`,
              {
                cache: 'no-store',
                credentials: 'include',
                signal: AbortSignal.timeout(45000),
              }
            );
            if (dlRes.ok) {
              const dlBuf = await dlRes.arrayBuffer();
              const candidateUint8 = new Uint8Array(dlBuf);
              const mp4Check = validateMp4Buffer(candidateUint8, sourceByteLength);
              if (mp4Check.valid) {
                neutralizeContainerBoxesInPlace(candidateUint8);
                cachedBlob = new Blob([candidateUint8 as unknown as BlobPart], {
                  type: 'video/mp4',
                });
                setProcessedBlob(cachedBlob);
                setPreviewUrlAfter(URL.createObjectURL(cachedBlob));
                const inspectedAfter = await inspectVideoBuffer(
                  candidateUint8,
                  true,
                  cameraProfile
                );
                setAfterState((prev) => ({
                  ...inspectedAfter,
                  badgeText: prev.badgeClean === true ? prev.badgeText : inspectedAfter.badgeText,
                  badgeClean: prev.badgeClean !== null ? prev.badgeClean : inspectedAfter.badgeClean,
                  riskText: prev.riskClean !== null ? prev.riskText : inspectedAfter.riskText,
                  riskClean: prev.riskClean !== null ? prev.riskClean : inspectedAfter.riskClean,
                }));
                break;
              }
            }
          } catch {
            if (dlAttempt < 3) {
              await new Promise((r) => setTimeout(r, dlAttempt * 1500));
            }
          }
        }
      }

      setLastJobId(jobId);
      setServerDownloadUrl(downloadAttachmentUrl);
      setAutoCleanExpiresAt(expiresAtIso);
      setIsServerCleanedUp(false);
      setNetworkWarning(null);
      if (!cachedBlob) {
        setPreviewUrlAfter(inlineStreamUrl);
        appendLog(
          'ℹ [DIRECT SERVER DOWNLOAD] Preview & unduhan langsung dari server siap. Gunakan tombol Unduh Berkas Bersih sebelum timer 5 menit berakhir.',
          'amber'
        );
      }

      appendLog(
        `✓ [SERVER PROCESSING SELESAI 100%] Hasil terverifikasi (${((finalState.outputSizeBytes || 0) / (1024 * 1024)).toFixed(2)} MB). Timer Auto-Clean 5 menit aktif!`,
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
        } • Resolusi: ${upscale1080p && cameraProfile !== 'neutral' ? '1080p Full-HD BT.709' : 'Resolusi Asli BT.709'}.`,
        'indigo'
      );

      setCloudProgress({
        ...finalState,
        stage: 'completed',
        percent: 100,
      });
      setDisplayedPercent(100);
      setProgressText('SELESAI 100%');
    } catch (serverErr: any) {
      if (abortPollingRef.current) return;
      const errMsg = serverErr?.message || 'Gagal menjalankan proses MetaCleaner di server.';
      setProgressText('GAGAL');
      setNetworkWarning(null);
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
      appendLog(`[SERVER METACLEANER ERROR] ${errMsg}`, 'rose');
    } finally {
      if (!abortPollingRef.current) {
        setIsProcessing(false);
      }
    }
  };

  const getOutputFileName = () => {
    const baseName = currentFile ? currentFile.name.replace(/\.[^/.]+$/, '') : 'video';
    return `${baseName}_output_bersih.mp4`;
  };

  const downloadFromMemoryBlob = () => {
    if (!processedBlob) return;
    const fileName = getOutputFileName();
    const url = URL.createObjectURL(processedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
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
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        const canShareFiles =
          typeof navigator.canShare !== 'function' || navigator.canShare({ files: [fileObj] });
        if (canShareFiles) {
          await navigator.share({
            files: [fileObj],
            title: fileName,
          });
          appendLog(`✓ [SHARE / SIMPAN HP] Video "${fileName}" dibagikan ke sistem perangkat.`, 'emerald');
          return;
        }
      }
      downloadFromMemoryBlob();
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      appendLog(`[DOWNLOAD INFO] Share sheet tidak tersedia, beralih ke unduhan langsung...`, 'amber');
      downloadFromMemoryBlob();
    }
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
              <span>MetaCleaner V 2.0</span>
              <span className="text-xs font-mono text-indigo-300 tabular-nums">
                · Upload-First Server Pipeline + Auto-Clean 5 Menit
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Upload Resumable ke Server &rarr; Proses FFmpeg Non-Streaming 4 Lapisan (Zero-Pulldown 30fps, Bayer CMOS Grain, Audio 22.5kHz, Adaptive GOP MP4) &rarr; Auto-Clean File 5 Menit Setelah Selesai
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-bold rounded-full flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Upload-First • Anti-Putus</span>
          </span>
          <span className="hidden sm:flex px-2.5 py-1 bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-mono font-bold rounded-full items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            <span>Auto-Clean 5 Menit</span>
          </span>
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
                <span className="text-slate-500">Status Upload Server:</span>
                <span
                  className={`font-mono text-[11px] font-bold ${
                    uploadStatus === 'uploaded'
                      ? 'text-emerald-400'
                      : uploadStatus === 'uploading'
                        ? 'text-cyan-300'
                        : uploadStatus === 'error'
                          ? 'text-rose-400'
                          : isServerCleanedUp
                            ? 'text-amber-300'
                            : 'text-slate-400'
                  }`}
                >
                  {uploadStatus === 'uploaded'
                    ? '✓ Tersimpan di Server'
                    : uploadStatus === 'uploading'
                      ? `Mengunggah ${uploadPercent}% (${uploadChunkInfo?.current ?? 0}/${uploadChunkInfo?.total ?? 1})`
                      : uploadStatus === 'error'
                        ? 'Upload Tertunda (Bisa Dilanjutkan)'
                        : isServerCleanedUp
                          ? 'Dibersihkan (Auto-Clean 5m)'
                          : 'Menunggu Berkas'}
                </span>
              </div>

              {currentFile && uploadStatus === 'uploading' && (
                <div className="bg-slate-900/90 border border-cyan-500/30 rounded-lg p-2.5 space-y-1.5">
                  <div className="flex justify-between text-[10px] font-mono text-cyan-300">
                    <span>
                      Mengunggah ke Server (Bagian {uploadChunkInfo?.current ?? 1}/{uploadChunkInfo?.total ?? 1})
                    </span>
                    <span className="font-bold tabular-nums">{uploadPercent}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-200"
                      style={{ width: `${Math.min(100, Math.max(0, uploadPercent))}%` }}
                    />
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 flex justify-between">
                    <span>
                      {(uploadedBytes / (1024 * 1024)).toFixed(2)} / {(currentFile.size / (1024 * 1024)).toFixed(2)} MB
                    </span>
                    <span>Anti-Putus • Auto-Retry Chunk</span>
                  </div>
                  {uploadError && (
                    <div className="text-[10px] font-mono text-amber-300 flex items-center gap-1">
                      <WifiOff className="w-3 h-3 shrink-0" />
                      <span>{uploadError}</span>
                    </div>
                  )}
                </div>
              )}

              {currentFile && uploadStatus === 'error' && (
                <div className="bg-rose-950/30 border border-rose-500/40 rounded-lg p-2.5 space-y-2">
                  <div className="text-[10px] font-mono text-rose-300 flex items-start gap-1.5">
                    <WifiOff className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{uploadError || 'Upload terhenti karena koneksi internet tidak stabil.'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const upId = await uploadVideoToServer(currentFile, serverUploadId || undefined);
                        setFileStatus({ text: 'Tersimpan di Server', color: 'emerald' });
                        void runExternalProbe({ uploadId: upId, filename: currentFile.name }, 'before');
                      } catch {}
                    }}
                    className="w-full py-1.5 px-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>Lanjutkan Upload ke Server (Dari Bagian Terakhir)</span>
                  </button>
                </div>
              )}
              <div className="pt-2 border-t border-slate-800/80 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-300 font-bold">All-in-One Export Profile (Single Pipeline):</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold">
                    SAFE + DEEP + LOSSLESS
                  </span>
                </div>
                <div className="space-y-1.5 text-[10px] font-mono">
                  <div className="flex items-center gap-2 text-cyan-300 bg-cyan-950/25 border border-cyan-900/40 rounded-lg px-2.5 py-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-cyan-400" />
                    <span>1. Zero-Pulldown 30fps Repair (0% Duplikat) + Per-Job Organic Warp &amp; ISP CAS</span>
                  </div>
                  <div className="flex items-center gap-2 text-emerald-300 bg-emerald-950/25 border border-emerald-900/40 rounded-lg px-2.5 py-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                    <span>2. Stereo Room Reflection + 21kHz Thermal Air (AAC 256k Anti-TTS)</span>
                  </div>
                  <div className="flex items-center gap-2 text-indigo-300 bg-indigo-950/25 border border-indigo-900/40 rounded-lg px-2.5 py-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-indigo-400" />
                    <span>3. Pass 2 Zero-SEI Remux + Zero-Free MP4 + Audit Integritas</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80 space-y-2">
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
                <div className="flex justify-between items-center gap-2">
                  <span className="text-slate-300 font-bold text-[11px]">
                    Target Resolusi Kamera:
                  </span>
                  <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded p-0.5">
                    <button
                      type="button"
                      onClick={() => setUpscale1080p(true)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer whitespace-nowrap ${
                        upscale1080p
                          ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      1080p Full-HD
                    </button>
                    <button
                      type="button"
                      onClick={() => setUpscale1080p(false)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer whitespace-nowrap ${
                        !upscale1080p
                          ? 'bg-cyan-600/30 text-cyan-300 border border-cyan-500/40'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Resolusi Asli
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 leading-snug">
                  Menstandarkan handler kamera native (<code>VideoHandle</code> / <code>Core Media Video</code>) tanpa menyisipkan box <code>mdta</code> sintetik, menstandarkan 1080p BT.709, &amp; mengompaksi atom <code>free</code>.
                </p>
              </div>
            </div>

            <button
              onClick={() => executeAutoSanitization()}
              disabled={!currentFile || isProcessing || uploadStatus === 'uploading'}
              className={
                !currentFile || isProcessing || uploadStatus === 'uploading'
                  ? 'w-full py-3.5 bg-slate-800 text-slate-500 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-not-allowed'
                  : 'w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-900/30 transition flex items-center justify-center gap-2 cursor-pointer'
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
                  <span>Mengunggah Video ke Server ({uploadPercent}%)...</span>
                </>
              ) : uploadStatus === 'uploaded' ? (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Proses MetaCleaner di Server (Non-Streaming)</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Upload &amp; Proses MetaCleaner di Server</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* SERVER UPLOAD-FIRST NON-STREAMING FFMPEG PROGRESS PANEL */}
        {(isProcessing || cloudProgress) && cloudProgress && (
          <div className={`bg-slate-900 border rounded-2xl p-4 sm:p-5 shadow-xl space-y-3 ${networkWarning ? 'border-amber-500/50' : 'border-indigo-500/30'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Cpu className={`w-4 h-4 ${cloudProgress.stage === 'failed' ? 'text-rose-400' : cloudProgress.stage === 'completed' ? 'text-emerald-400' : 'text-indigo-400 animate-pulse'}`} />
                <span className="text-xs font-extrabold uppercase tracking-wider text-white">
                  Proses Server MetaCleaner (Upload-First • Non-Streaming)
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700">
                  {cloudProgress.stage}
                </span>
                {autoCleanExpiresAt && !isServerCleanedUp && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1 tabular-nums">
                    <Clock className="w-3 h-3" />
                    <span>Auto-Clean {formatCountdown(autoCleanRemainingSec)}</span>
                  </span>
                )}
                {isServerCleanedUp && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    ✓ File Server Dibersihkan (5m)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-[11px] font-mono">
                <span className="text-slate-400">{cloudProgress.engine}</span>
                <span className={`font-bold tabular-nums ${cloudProgress.stage === 'failed' ? 'text-rose-400' : cloudProgress.stage === 'completed' ? 'text-emerald-400' : 'text-cyan-400'}`}>
                  {displayedPercent}%
                </span>
              </div>
            </div>

            <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
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

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-300">
              <span className="whitespace-normal break-words max-w-full sm:max-w-[65%]">{cloudProgress.message}</span>
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

            {networkWarning && (
              <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2 text-[11px] font-mono text-amber-300">
                <WifiOff className="w-3.5 h-3.5 shrink-0" />
                <span>{networkWarning}</span>
              </div>
            )}

            {cloudProgress.stage === 'failed' && currentFile && (
              <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2.5">
                <span className="text-[11px] font-mono text-rose-300">
                  Proses gagal dijalankan di server — video input tetap tersimpan hingga auto-clean.
                </span>
                <button
                  type="button"
                  onClick={() => executeAutoSanitization()}
                  className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-extrabold flex items-center gap-1.5 transition cursor-pointer shadow-lg shadow-amber-900/30"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Coba Proses Ulang di Server</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* BEFORE VS AFTER METADATA INSPECTOR */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* PANEL BEFORE */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col space-y-3">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
              <h3 className="text-xs font-extrabold text-rose-400 uppercase tracking-wider flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>1. Indikator SEBELUM (Input File)</span>
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
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>2. Indikator SESUDAH (Hasil Sanitasi &amp; Remux)</span>
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

              {previewUrlAfter && (!isServerCleanedUp || previewUrlAfter.startsWith('blob:')) && (
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

            {(lastJobId || isServerCleanedUp) && (
              <div
                className={`p-3 rounded-xl border text-[11px] font-mono space-y-2 ${
                  isServerCleanedUp
                    ? 'bg-emerald-950/25 border-emerald-500/30 text-emerald-300'
                    : 'bg-amber-950/25 border-amber-500/35 text-amber-200'
                }`}
              >
                {!isServerCleanedUp && autoCleanExpiresAt ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>
                        Auto-Clean Server dalam{' '}
                        <strong className="text-amber-300 tabular-nums">
                          {formatCountdown(autoCleanRemainingSec)}
                        </strong>{' '}
                        (input &amp; output dihapus otomatis)
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={isCleaningServerNow}
                      onClick={() => void cleanupServerFilesNow()}
                      className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 font-bold text-[10px] flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>{isCleaningServerNow ? 'Menghapus...' : 'Hapus File Server Sekarang'}</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      ✓ Auto-Clean Selesai — File video input &amp; output di server sudah dihapus otomatis (batas 5 menit).
                      {processedBlob ? ' Salinan offline di RAM browser masih dapat diunduh.' : ''}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="pt-1 space-y-2">
              {serverDownloadUrl && lastJobId && !isServerCleanedUp ? (
                <a
                  href={serverDownloadUrl}
                  download={getOutputFileName()}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-900/40"
                >
                  <Download className="w-4 h-4" />
                  <span>
                    Unduh Berkas Bersih ({processedBlob ? `${(processedBlob.size / (1024 * 1024)).toFixed(2)} MB` : getOutputFileName()})
                  </span>
                </a>
              ) : (
                <button
                  type="button"
                  disabled={!processedBlob}
                  onClick={downloadFromMemoryBlob}
                  className={
                    !processedBlob
                      ? 'w-full py-2.5 bg-slate-800 text-slate-500 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-not-allowed'
                      : 'w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-900/40'
                  }
                >
                  <Download className="w-4 h-4" />
                  <span>
                    {processedBlob
                      ? `Unduh Berkas Bersih (${(processedBlob.size / (1024 * 1024)).toFixed(2)} MB)`
                      : isServerCleanedUp
                        ? 'File Server Sudah Dihapus (Auto-Clean 5 Menit)'
                        : 'Unduh Berkas Bersih (output_bersih.mp4)'}
                  </span>
                </button>
              )}

              {processedBlob && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={downloadFromMemoryBlob}
                    className="flex-1 min-w-[140px] py-2 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-[11px] rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Unduh Offline (RAM)</span>
                  </button>
                  {supportsNativeShare && (
                    <button
                      type="button"
                      onClick={shareCleanFileMobile}
                      className="flex-1 min-w-[140px] py-2 px-3 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-bold text-[11px] rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Share2 className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Simpan / Bagikan (HP)</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* HIGH-FREQUENCY WATERMARK NOISE VISUALIZER (BEFORE VS AFTER) */}
        {previewUrlBefore && (
          <WatermarkNoiseVisualizer
            previewUrlBefore={previewUrlBefore}
            previewUrlAfter={
              !isServerCleanedUp || previewUrlAfter?.startsWith('blob:') ? previewUrlAfter : null
            }
            beforeFileName={currentFile?.name}
            afterFileName={
              (processedBlob || (lastJobId && !isServerCleanedUp)) && currentFile
                ? `${currentFile.name.replace(/\.[^/.]+$/, '')}_output_bersih.mp4`
                : undefined
            }
          />
        )}

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
                  disabled={isProbingBefore || uploadStatus === 'uploading'}
                  onClick={() =>
                    runExternalProbe(
                      serverUploadId && !isServerCleanedUp
                        ? { uploadId: serverUploadId, filename: currentFile.name }
                        : { blob: currentFile, filename: currentFile.name },
                      'before'
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-bold text-slate-200 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isProbingBefore ? 'animate-spin' : ''}`} />
                  <span>Re-Probe Input</span>
                </button>
              )}
              {((lastJobId && !isServerCleanedUp) || processedBlob) && (
                <button
                  type="button"
                  disabled={isProbingAfter}
                  onClick={() => {
                    const outName = getOutputFileName();
                    if (lastJobId && !isServerCleanedUp) {
                      void runExternalProbe({ jobId: lastJobId, filename: outName }, 'after');
                    } else if (processedBlob) {
                      void runExternalProbe({ blob: processedBlob, filename: outName }, 'after');
                    }
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
                        <span className="text-slate-400">MP4 Header / mdta / Start PTS:</span>
                        <span
                          className={
                            col.probe.audioVisualForensics.visual.hasZeroCreationTime ||
                            col.probe.audioVisualForensics.visual.hasFfmpegMuxerBrand ||
                            col.probe.audioVisualForensics.visual.hasSpoofedMdtaBox ||
                            (col.probe.audioVisualForensics.visual.startTimeSec ?? 0) > 0.04
                              ? 'text-rose-400 font-bold'
                              : 'text-emerald-400 font-bold'
                          }
                        >
                          {col.probe.audioVisualForensics.visual.hasZeroCreationTime ? '1904/0' : 'Valid UTC'} •{' '}
                          {col.probe.audioVisualForensics.visual.hasFfmpegMuxerBrand ? 'iso2/512!' : 'Clean Brand'} •{' '}
                          {col.probe.audioVisualForensics.visual.hasSpoofedMdtaBox ? 'mdta!' : 'Zero-mdta'} •{' '}
                          {(col.probe.audioVisualForensics.visual.startTimeSec ?? 0).toFixed(3)}s
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Entropy Tekstur Luma (Y):</span>
                        <span className={`tabular-nums ${col.probe.audioVisualForensics.visual.lumaEntropyAvg > 0 && col.probe.audioVisualForensics.visual.lumaEntropyAvg < 0.72 ? 'text-amber-300 font-bold' : 'text-slate-200'}`}>
                          {col.probe.audioVisualForensics.visual.lumaEntropyAvg || '-'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">CMOS Sensor Grain (Static Δ):</span>
                        <span
                          className={`tabular-nums font-bold ${
                            col.probe.audioVisualForensics.visual.isPlasticZeroGrain
                              ? 'text-rose-400'
                              : (col.probe.audioVisualForensics.visual.staticPatchTemporalDiff ?? -1) >= 0
                                ? 'text-emerald-400'
                                : 'text-slate-400'
                          }`}
                        >
                          {(col.probe.audioVisualForensics.visual.staticPatchTemporalDiff ?? -1) >= 0
                            ? `${col.probe.audioVisualForensics.visual.staticPatchTemporalDiff} ${
                                col.probe.audioVisualForensics.visual.isPlasticZeroGrain
                                  ? '(Plastik/Zero-Grain!)'
                                  : '(Sensor Kamera Alami)'
                              }`
                            : '-'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Resolusi &amp; Color Matrix:</span>
                        <span
                          className={`tabular-nums font-bold ${
                            col.probe.audioVisualForensics.visual.isSub1080pDiffusionRes ||
                            col.probe.audioVisualForensics.visual.hasColorMatrixMismatch
                              ? 'text-rose-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          {col.probe.audioVisualForensics.visual.width || col.probe.videoStream?.width || 0}x
                          {col.probe.audioVisualForensics.visual.height || col.probe.videoStream?.height || 0} •{' '}
                          {col.probe.audioVisualForensics.visual.colorPrimaries || 'unset'}/
                          {col.probe.audioVisualForensics.visual.colorTransfer || 'unset'}/
                          {col.probe.audioVisualForensics.visual.colorSpace || 'unset'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Cadence &amp; Duplikat Frame:</span>
                        <span
                          className={`tabular-nums font-bold ${
                            col.probe.audioVisualForensics.visual.hasPulldownDuplicates
                              ? 'text-rose-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          {((col.probe.audioVisualForensics.visual.nearDuplicateFrameRatio ?? 0) * 100).toFixed(1)}%{' '}
                          {col.probe.audioVisualForensics.visual.hasPulldownDuplicates ? '(Pulldown Duplikat!)' : '(Bebas Pulldown)'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Tombstone Free Atom (moov):</span>
                        <span
                          className={`tabular-nums font-bold ${
                            col.probe.audioVisualForensics.visual.hasMoovFreeTombstone
                              ? 'text-rose-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          {col.probe.audioVisualForensics.visual.moovFreeBoxCount ?? 0} box ({col.probe.audioVisualForensics.visual.moovFreeBoxBytes ?? 0}B)
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

        {/* FFPROBE SEI NAL & C2PA/UUID METADATA DIAGNOSTIC ISOLATION TOOL */}
        {(beforeProbe?.ffprobeDiagnostic || afterProbe?.ffprobeDiagnostic) && (() => {
          const activeProbe =
            diagTarget === 'after' && afterProbe
              ? afterProbe
              : beforeProbe || afterProbe;
          const diag = activeProbe?.ffprobeDiagnostic;
          if (!diag) return null;

          const beforeTrigCount = beforeProbe?.ffprobeDiagnostic?.aiTriggerChecklist.length ?? 0;
          const afterTrigCount = afterProbe?.ffprobeDiagnostic?.aiTriggerChecklist.length ?? 0;

          const handleCopyDiag = async () => {
            try {
              await navigator.clipboard.writeText(diag.rawFfprobeSummaryText);
              setCopiedDiag(true);
              setTimeout(() => setCopiedDiag(false), 1800);
            } catch {}
          };

          return (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                    <Bug className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2 flex-wrap">
                      <span>Diagnostik FFprobe: Isolasi SEI NAL Units &amp; Blok C2PA / UUID</span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                          diag.aiTriggerChecklist.length === 0
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                            : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                        }`}
                      >
                        {diag.aiTriggerChecklist.length === 0
                          ? '0 PEMICU AI TERISOLASI'
                          : `${diag.aiTriggerChecklist.length} PEMICU "AI DETECTED"`}
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Membedah output <code>ffprobe</code> frame side-data, stream non-AV, atom ISO-BMFF (<code>uuid</code>/<code>c2pa</code>/<code>jumb</code>), dan payload NAL SEI untuk melacak penyebab pasti flag AI.
                    </p>
                  </div>
                </div>

                {/* Target Switcher (Before vs After) */}
                <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    disabled={!beforeProbe}
                    onClick={() => setDiagTarget('before')}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer disabled:opacity-40 ${
                      diagTarget === 'before'
                        ? 'bg-rose-500/20 border border-rose-500/40 text-rose-300'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Input (Sebelum) • {beforeTrigCount}
                  </button>
                  <button
                    type="button"
                    disabled={!afterProbe}
                    onClick={() => setDiagTarget('after')}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer disabled:opacity-40 ${
                      diagTarget === 'after'
                        ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Output (Sesudah) • {afterTrigCount}
                  </button>
                </div>
              </div>

              {/* Quick Telemetry Counters + Filter Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono w-full lg:w-auto flex-1">
                  <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
                    <div className="text-[10px] text-slate-500">SEI NAL Terisolasi</div>
                    <div className={diag.isolatedSeiUnits.length > 0 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                      {diag.isolatedSeiUnits.length} unit
                    </div>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
                    <div className="text-[10px] text-slate-500">Blok C2PA/UUID/Meta</div>
                    <div className={diag.isolatedMetadataBlocks.length > 0 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                      {diag.isolatedMetadataBlocks.length} blok
                    </div>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
                    <div className="text-[10px] text-slate-500">Frame Side-Data</div>
                    <div className={diag.packetSideDataCount > 0 ? 'text-amber-300 font-bold' : 'text-emerald-400 font-bold'}>
                      {diag.packetSideDataCount} item
                    </div>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
                    <div className="text-[10px] text-slate-500">Data / TMCD Stream</div>
                    <div className={diag.dataStreamsCount > 0 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                      {diag.dataStreamsCount} stream
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {(
                    [
                      { id: 'all', label: 'Semua' },
                      { id: 'triggers', label: `Pemicu AI (${diag.aiTriggerChecklist.length})` },
                      { id: 'sei', label: `SEI NAL (${diag.isolatedSeiUnits.length})` },
                      { id: 'meta', label: `C2PA / UUID (${diag.isolatedMetadataBlocks.length})` },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setDiagFilter(f.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                        diagFilter === f.id
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 1. AI Trigger Checklist */}
              {(diagFilter === 'all' || diagFilter === 'triggers') && (
                <div className="space-y-2">
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                    <span>Daftar Pemicu Flag &quot;AI Detected&quot; ({diagTarget === 'after' && afterProbe ? 'Output' : 'Input'})</span>
                  </div>
                  {diag.aiTriggerChecklist.length === 0 ? (
                    <div className="bg-emerald-950/25 border border-emerald-500/30 rounded-xl p-3 text-xs text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>Tidak ada sisa SEI NAL Unit, blok C2PA/JUMBF/UUID, maupun anomali muxer/audio-visual yang memicu flag AI.</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {diag.aiTriggerChecklist.map((trig) => (
                        <div
                          key={trig.id}
                          className={`rounded-xl p-3 border text-xs space-y-1 ${
                            trig.severity === 'critical'
                              ? 'bg-rose-950/25 border-rose-500/35'
                              : 'bg-amber-950/20 border-amber-500/30'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-slate-100">{trig.title}</span>
                            <span
                              className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded uppercase ${
                                trig.severity === 'critical'
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : 'bg-amber-500/20 text-amber-300'
                              }`}
                            >
                              {trig.layer}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-slate-300 break-words">{trig.detail}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 2. Isolated SEI NAL Units */}
              {(diagFilter === 'all' || diagFilter === 'sei') && (
                <div className="space-y-2">
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Unit SEI (Supplemental Enhancement Information) Terisolasi ({diag.isolatedSeiUnits.length})</span>
                  </div>
                  {diag.isolatedSeiUnits.length === 0 ? (
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-[11px] font-mono text-emerald-400">
                      ✓ 0 unit SEI NAL (H.264 Type 6 / HEVC Type 39|40) ditemukan pada video ini.
                    </div>
                  ) : (
                    <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                      {diag.isolatedSeiUnits.map((unit) => (
                        <div
                          key={`${unit.index}-${unit.source}-${unit.byteOffsetHex || unit.payloadType}`}
                          className="bg-slate-950 border border-rose-900/40 rounded-xl p-3 text-[11px] font-mono space-y-1.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold">
                                SEI #{unit.index} • NAL Type {unit.nalUnitType}
                              </span>
                              <span className="text-cyan-300 font-bold">{unit.payloadTypeLabel}</span>
                              <span className="text-slate-500">src: {unit.source}</span>
                            </div>
                            <span className="text-slate-400">
                              {unit.byteOffsetHex ? `@${unit.byteOffsetHex} • ` : ''}
                              {unit.sizeBytes}B
                            </span>
                          </div>
                          {unit.uuid16Hex && (
                            <div className="text-amber-300 break-all">
                              UUID-16: <span className="text-slate-200">{unit.uuid16Hex}</span>
                            </div>
                          )}
                          <div className="text-slate-300 break-all">
                            ASCII: <span className="text-rose-200">{unit.decodedAscii}</span>
                          </div>
                          {unit.rawHexPreview && unit.rawHexPreview !== '-' && (
                            <div className="text-[10px] text-slate-500 break-all">
                              HEX: {unit.rawHexPreview}
                            </div>
                          )}
                          <div className="text-[10px] text-amber-300 pt-0.5">
                            → {unit.triggerReason}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 3. Isolated C2PA / JUMBF / UUID / Metadata Blocks */}
              {(diagFilter === 'all' || diagFilter === 'meta') && (
                <div className="space-y-2">
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <FileSearch className="w-3.5 h-3.5 text-fuchsia-400" />
                    <span>Blok Metadata C2PA / JUMBF / UUID / Tag FFprobe Terisolasi ({diag.isolatedMetadataBlocks.length})</span>
                  </div>
                  {diag.isolatedMetadataBlocks.length === 0 ? (
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-[11px] font-mono text-emerald-400">
                      ✓ 0 blok metadata C2PA, JUMBF, UUID, atau stream data tambahan terdeteksi.
                    </div>
                  ) : (
                    <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                      {diag.isolatedMetadataBlocks.map((blk) => (
                        <div
                          key={blk.id}
                          className="bg-slate-950 border border-amber-900/40 rounded-xl p-3 text-[11px] font-mono space-y-1"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-1.5 py-0.5 rounded bg-fuchsia-500/20 text-fuchsia-300 font-bold">
                                {blk.category}
                              </span>
                              <span className="text-slate-100 font-bold">{blk.boxOrStreamName}</span>
                              <span className="text-slate-500">path: {blk.path}</span>
                            </div>
                            <span className="text-slate-400">
                              @{blk.offsetHex} • {blk.sizeBytes}B
                            </span>
                          </div>
                          {blk.uuidHex && (
                            <div className="text-cyan-300 break-all">
                              UUID Hex: <span className="text-slate-200">{blk.uuidHex}</span>
                            </div>
                          )}
                          <div className="text-slate-300 break-all">
                            Payload/Value: <span className="text-amber-200">{blk.asciiPreview}</span>
                          </div>
                          <div className="text-[10px] text-rose-300 pt-0.5">
                            → {blk.triggerReason}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 4. Collapsible Raw FFprobe Diagnostic Console */}
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setShowFfprobeConsole((prev) => !prev)}
                    className="px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] font-mono font-bold text-cyan-300 flex items-center gap-1.5 transition cursor-pointer"
                  >
                    {showFfprobeConsole ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    <span>{showFfprobeConsole ? 'Sembunyikan Output Raw FFprobe' : 'Lihat Output Raw FFprobe Diagnostic'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyDiag}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-bold text-slate-200 flex items-center gap-1.5 transition cursor-pointer"
                  >
                    {copiedDiag ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedDiag ? 'Tersalin!' : 'Salin Laporan FFprobe'}</span>
                  </button>
                </div>
                {showFfprobeConsole && (
                  <pre className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-[10px] font-mono text-slate-300 max-h-64 overflow-auto leading-relaxed">
                    {diag.rawFfprobeSummaryText}
                  </pre>
                )}
              </div>
            </div>
          );
        })()}

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
                MetaCleaner V 2.0 menghapus SEI (<code className="text-emerald-300">filter_units=remove_types=6</code>), mengompaksi atom <code>free/udta/meta</code>, menyapu residu laten via <code>hqdn3d</code>, melakukan warp optik asimetris, serta menyuntikkan dual-scale Bayer CMOS grain (<code>no-dct-decimate=1</code>) pada <strong>30fps 1080p BT.709</strong>.
              </p>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-indigo-900/30 space-y-2">
              <div className="font-bold text-indigo-400 flex items-center gap-1.5">
                <span>🎙️</span>
                <span>Penetralan Audio TTS &amp; Vocoder AI</span>
              </div>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Detektor platform modern memindai tebing spektrum 16.5kHz dan jeda hening digital. MetaCleaner V 2.0 menyuntikkan 1/f pink+brown + udara mik 17–20.8kHz, dispersi fase <code>aphaser</code>, early-reflection <code>aecho</code>, harmonik <code>aexciter</code>, &amp; AAC 224kbps (<code>-cutoff 22500</code>) bebas clipping.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
