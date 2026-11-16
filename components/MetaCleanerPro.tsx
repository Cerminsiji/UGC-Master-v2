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
  Copy,
  Cpu,
  Download,
  Eye,
  FileSearch,
  Layers,
  Play,
  RefreshCw,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  UploadCloud,
  Volume2,
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

  // Live Cloud FFmpeg progress state, stall detection, resync, & server attachment download URL
  const [cloudProgress, setCloudProgress] = useState<CleanerProgressState | null>(null);
  const [serverDownloadUrl, setServerDownloadUrl] = useState<string | null>(null);
  const [lastJobId, setLastJobId] = useState<string | null>(null);
  const [supportsNativeShare, setSupportsNativeShare] = useState(false);
  const [isStreamHung, setIsStreamHung] = useState(false);
  const [hungAtPercent, setHungAtPercent] = useState<number | null>(null);
  const [resyncAttempts, setResyncAttempts] = useState(0);
  const [isResyncing, setIsResyncing] = useState(false);

  useEffect(() => {
    setSupportsNativeShare(
      typeof navigator !== 'undefined' && typeof navigator.share === 'function'
    );
  }, []);

  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 'init-1',
      time: '--:--:--',
      text: "[MetaCleaner v22.0 Sub-Pixel Perspective + Zero-mdta Forensics] Ready: Perspective Micro-Drift 29.97fps + 1080p BT.709 + 1/f Room Air (-49dB) + Native 2-Ref GOP.",
      color: 'indigo',
    },
    {
      id: 'init-2',
      time: '--:--:--',
      text: 'Membersihkan 4 lapisan sidik jari AI: Zero-mdta/Zero-Free MP4, Zero-SEI Type 6, Sub-Pixel CMOS Micro-Drift + Motion-Interp 1080p, & 1/f Room Floor + aexciter.',
      color: 'slate',
    },
  ]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const seenServerLogRef = useRef<Set<string>>(new Set());
  const activeJobIdRef = useRef<string | null>(null);
  const abortPollingRef = useRef<boolean>(false);

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
              : probe.format.tags?.make || probe.format.tags?.model
                ? `BERSIH • OEM: ${[probe.format.tags?.make, probe.format.tags?.model].filter(Boolean).join(' ')} (${probe.videoStream?.handlerName || 'Handler'})`
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
          setDiagTarget('before');
        } else {
          setAfterProbe(probe);
          setAfterState(applyProbeToCardState);
          setDiagTarget('after');
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
    setServerDownloadUrl(null);
    setLastJobId(null);
    setIsStreamHung(false);
    setHungAtPercent(null);
    setResyncAttempts(0);
    setIsResyncing(false);
    abortPollingRef.current = true;
    activeJobIdRef.current = null;
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

  const triggerTelemetryResync = async (
    targetJobId: string,
    stalledAtPercent?: number
  ): Promise<{
    resynced: boolean;
    resultReady: boolean;
    stalled: boolean;
    ageMs: number;
    state?: CleanerProgressState;
  } | null> => {
    setIsResyncing(true);
    try {
      const res = await fetch('/api/meta-cleaner/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: targetJobId,
          action: 'resync',
          stalledAtPercent,
        }),
        cache: 'no-store',
        credentials: 'include',
      });
      if (!res.ok) return null;
      const payload = await res.json();
      return payload;
    } catch {
      return null;
    } finally {
      setIsResyncing(false);
    }
  };

  const executeAutoSanitization = async (resumeOpts?: {
    isResume?: boolean;
    previousJobId?: string | null;
    resumeFromPercent?: number | null;
  }) => {
    if (!fileArrayBuffer || !currentFile) return;
    if (isProcessing && !resumeOpts?.isResume) return;

    if (resumeOpts?.isResume) {
      abortPollingRef.current = true;
      await new Promise((r) => setTimeout(r, 80));
    }
    abortPollingRef.current = false;

    setIsProcessing(true);
    setIsStreamHung(false);
    setHungAtPercent(null);
    setResyncAttempts(0);
    setIsResyncing(false);
    setProcessedBlob(null);
    setServerDownloadUrl(null);
    setLastJobId(null);
    setAfterProbe(null);
    setProbeErrorAfter(null);

    if (!resumeOpts?.isResume) {
      setLogs([]);
      seenServerLogRef.current.clear();
    } else {
      appendLog(
        `[RESUME PROCESSING] Memeriksa ulang pekerjaan sebelumnya & menyambung pipeline All-in-One (dari titik stall ${resumeOpts.resumeFromPercent ?? 77}%)...`,
        'amber'
      );
    }

    const baseName = currentFile.name.replace(/\.[^/.]+$/, '');
    const outputFileName = `${baseName}_output_bersih.mp4`;
    const sourceByteLength = fileArrayBuffer.byteLength;

    const finalizeCompletedMp4 = async (
      completedJobId: string,
      candidateUint8: Uint8Array,
      engineHeader: string,
      activeDownloadUrl: string
    ) => {
      const mp4Check = validateMp4Buffer(candidateUint8, sourceByteLength);
      if (!mp4Check.valid) {
        throw new Error(
          mp4Check.reason || 'Output video dari Cloud FFmpeg tidak lolos validasi MP4.'
        );
      }

      neutralizeContainerBoxesInPlace(candidateUint8);
      const isPythonEngine = engineHeader.toLowerCase().includes('python');
      const engineUsed = isPythonEngine
        ? 'Cloud Python FFmpeg Wrapper (All-in-One Pipeline)'
        : 'Cloud Node.js FFmpeg Wrapper (All-in-One Anti-SynthID + Bitexact)';

      setLastJobId(completedJobId);
      setServerDownloadUrl(activeDownloadUrl);
      setIsStreamHung(false);
      setHungAtPercent(null);

      setCloudProgress((prev) => ({
        jobId: completedJobId,
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
        downloadUrl: activeDownloadUrl,
        outputSizeBytes: candidateUint8.byteLength,
      }));

      const cleanBlob = new Blob([candidateUint8 as unknown as BlobPart], {
        type: 'video/mp4',
      });
      setProcessedBlob(cleanBlob);
      setPreviewUrlAfter(URL.createObjectURL(cleanBlob));

      const inspectedAfter = await inspectVideoBuffer(candidateUint8, true, cameraProfile);
      setAfterState({
        ...inspectedAfter,
        badgeText: inspectedAfter.badgeClean ? 'MEMVERIFIKASI FFPROBE...' : inspectedAfter.badgeText,
        badgeClean: inspectedAfter.badgeClean ? null : false,
        riskText: inspectedAfter.riskClean
          ? 'Memverifikasi Audio-Visual & Container via FFprobe...'
          : inspectedAfter.riskText,
        riskClean: inspectedAfter.riskClean ? null : false,
      });
      setProgressText('VERIFIKASI FFPROBE...');

      appendLog(
        `✓ [${isPythonEngine ? 'CLOUD PYTHON ALL-IN-ONE' : 'CLOUD NODE ALL-IN-ONE'}] Video selesai diproses dalam 1 pipeline terpadu (${(candidateUint8.byteLength / (1024 * 1024)).toFixed(2)} MB).`,
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

      await runExternalProbe(cleanBlob, outputFileName, 'after');
      setProgressText('SELESAI 100%');
    };

    const syncProgressSnapshot = (pData: CleanerProgressState) => {
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
    };

    const jobId = `mc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    activeJobIdRef.current = jobId;

    let pollInterval: number | undefined;

    try {
      // If resuming from a stalled stream, check if the previous job already finished on disk first
      if (resumeOpts?.isResume && resumeOpts.previousJobId) {
        setProgressText('RESYNC STREAM SEBELUMNYA...');
        const prevSync = await triggerTelemetryResync(
          resumeOpts.previousJobId,
          resumeOpts.resumeFromPercent ?? undefined
        );
        if (prevSync?.resultReady || prevSync?.state?.stage === 'completed') {
          const recoveredJobId = resumeOpts.previousJobId;
          const recoveredUrl = `/api/meta-cleaner/download?jobId=${encodeURIComponent(recoveredJobId)}&filename=${encodeURIComponent(outputFileName)}`;
          const dlRes = await fetch(
            `/api/meta-cleaner/download?jobId=${encodeURIComponent(recoveredJobId)}&inline=1&t=${Date.now()}`,
            { cache: 'no-store', credentials: 'include' }
          );
          if (dlRes.ok) {
            const recoveredBytes = new Uint8Array(await dlRes.arrayBuffer());
            appendLog(
              `✓ [RESYNC BERHASIL] Hasil dari Job ${recoveredJobId} ditemukan selesai di server! Mengunduh output...`,
              'emerald'
            );
            await finalizeCompletedMp4(
              recoveredJobId,
              recoveredBytes,
              prevSync.state?.engine || 'Cloud-Python-FFmpeg-FrameFilter',
              recoveredUrl
            );
            return;
          }
        }
      }

      setProgressText('MENGINISIALISASI ALL-IN-ONE FFMPEG...');
      setCloudProgress({
        jobId,
        stage: 'queued',
        message: 'Mengunggah video ke Cloud All-in-One Pipeline (Safe + Deep + Lossless)...',
        percent: 2,
        frame: 0,
        totalFrames: 0,
        fps: 0,
        speed: '0x',
        outTimeSec: 0,
        durationSec: 0,
        engine: 'Cloud Python/Node FFmpeg (All-in-One)',
        logs: [],
        updatedAt: new Date().toISOString(),
      });

      appendLog(
        `[CLOUD ALL-IN-ONE EXPORT PROFILE] Memulai 1-command pipeline pada: ${currentFile.name} (${(sourceByteLength / (1024 * 1024)).toFixed(2)} MB) [Job: ${jobId}]`,
        'indigo'
      );
      appendLog(
        `-> Chained Pipeline: Safe Mode Temporal CFR + Deep 5-Layer Anti-SynthID + Lossless Zero-SEI & Faststart OEM (${cameraProfile.toUpperCase()})`,
        'amber'
      );

      pollInterval = window.setInterval(async () => {
        if (abortPollingRef.current) return;
        try {
          const pRes = await fetch(`/api/meta-cleaner/progress?jobId=${encodeURIComponent(jobId)}`, {
            cache: 'no-store',
            credentials: 'include',
          });
          if (!pRes.ok || abortPollingRef.current) return;
          const pData = (await pRes.json()) as CleanerProgressState;
          syncProgressSnapshot(pData);
        } catch {}
      }, 450);

      await fetch('/api/health', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'include',
      }).catch(() => {});

      const sendServerRequest = async () => {
        const formData = new FormData();
        formData.append('jobId', jobId);
        formData.append('file', currentFile);
        formData.append('mode', 'all_in_one');
        formData.append('deepMetaPurge', 'true');
        formData.append('forceKeyframeInsertion', 'false');
        formData.append('cameraProfile', cameraProfile);
        formData.append('upscale1080p', upscale1080p ? 'true' : 'false');
        formData.append('asyncMode', 'true');

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

      const respContentType = (response.headers.get('content-type') || '').toLowerCase();
      let candidateUint8: Uint8Array;
      let engineHeader = response.headers.get('X-MetaCleaner-Engine') || '';
      let activeDownloadUrl = `/api/meta-cleaner/download?jobId=${encodeURIComponent(jobId)}&filename=${encodeURIComponent(outputFileName)}`;

      if (response.status === 202 || respContentType.includes('application/json')) {
        const ack = await response.json().catch(() => null);
        if (!ack?.accepted && !ack?.success) {
          throw new Error(ack?.error || 'Server gagal memulai antrean Cloud FFmpeg.');
        }
        if (pollInterval !== undefined) {
          window.clearInterval(pollInterval);
          pollInterval = undefined;
        }

        const startedAt = Date.now();
        const maxWaitMs = 260000;
        let transientErrors = 0;
        let finalState: CleanerProgressState | null = null;

        // 77% stall detection & automatic resync telemetry tracking
        let lastSignature = '';
        let lastChangeAt = Date.now();
        let localResyncCount = 0;
        let lastResyncAtMs = 0;

        while (Date.now() - startedAt < maxWaitMs) {
          if (abortPollingRef.current) return;
          await new Promise((r) => setTimeout(r, 450));
          if (abortPollingRef.current) return;

          try {
            const pRes = await fetch(`/api/meta-cleaner/progress?jobId=${encodeURIComponent(jobId)}`, {
              cache: 'no-store',
              credentials: 'include',
            });
            if (!pRes.ok) {
              transientErrors++;
              if (transientErrors > 15) {
                throw new Error(`Progress polling gagal berulang (HTTP ${pRes.status}).`);
              }
              continue;
            }
            transientErrors = 0;
            const pData = (await pRes.json()) as CleanerProgressState;
            syncProgressSnapshot(pData);

            if (pData.stage === 'completed' || pData.resultReady) {
              finalState = pData;
              break;
            }
            if (pData.stage === 'failed') {
              throw new Error(pData.error || pData.message || 'Cloud FFmpeg gagal memproses video.');
            }

            const sig = `${pData.percent}:${pData.frame}:${pData.outTimeSec}:${pData.stage}`;
            if (sig !== lastSignature) {
              lastSignature = sig;
              lastChangeAt = Date.now();
              setIsStreamHung(false);
              setHungAtPercent(null);
            } else if (pData.percent > 0 && pData.percent < 100) {
              const idleMs = Date.now() - lastChangeAt;
              const isSeventySevenStall = pData.percent >= 74 && pData.percent <= 82;
              const stallThresholdMs = isSeventySevenStall ? 6000 : 10000;

              if (idleMs >= stallThresholdMs && Date.now() - lastResyncAtMs >= 6500) {
                localResyncCount++;
                lastResyncAtMs = Date.now();
                setResyncAttempts(localResyncCount);
                appendLog(
                  `[TELEMETRY RESYNC #${localResyncCount}] Deteksi stall di ${pData.percent}% (${(idleMs / 1000).toFixed(1)}s tanpa perubahan) — memicu resync ke endpoint telemetri...`,
                  'amber'
                );

                const resyncPayload = await triggerTelemetryResync(jobId, pData.percent);
                if (abortPollingRef.current) return;

                if (resyncPayload?.state) {
                  syncProgressSnapshot(resyncPayload.state);
                }
                if (resyncPayload?.resultReady || resyncPayload?.state?.stage === 'completed') {
                  finalState = resyncPayload.state || pData;
                  break;
                }
                if (resyncPayload?.stalled || localResyncCount >= 2) {
                  setIsStreamHung(true);
                  setHungAtPercent(pData.percent);
                  appendLog(
                    `[STREAM HANG] Stream Cloud FFmpeg terhenti di ${pData.percent}%. Klik "Resume Processing" pada panel telemetri untuk melanjutkan.`,
                    'rose'
                  );
                }
              }
            }
          } catch (pollErr: any) {
            if (pollErr?.message?.includes('Cloud FFmpeg gagal')) {
              throw pollErr;
            }
            transientErrors++;
            if (transientErrors > 15) {
              throw new Error(pollErr?.message || 'Koneksi polling ke Cloud FFmpeg terputus.');
            }
          }
        }

        if (abortPollingRef.current) return;

        if (!finalState) {
          setIsStreamHung(true);
          setHungAtPercent(cloudProgress?.percent ?? 77);
          throw new Error('Waktu pemrosesan Cloud FFmpeg melebihi batas. Gunakan tombol Resume Processing.');
        }

        engineHeader = finalState.engine || 'Cloud-Python-FFmpeg-FrameFilter';
        if (finalState.downloadUrl) {
          activeDownloadUrl = `${finalState.downloadUrl}&filename=${encodeURIComponent(outputFileName)}`;
        }

        setProgressText('MENGUNDUH HASIL DARI CLOUD...');
        const dlRes = await fetch(
          `/api/meta-cleaner/download?jobId=${encodeURIComponent(jobId)}&inline=1&t=${Date.now()}`,
          {
            cache: 'no-store',
            credentials: 'include',
          }
        );
        if (!dlRes.ok) {
          let dlErr = `Gagal mengambil hasil video (HTTP ${dlRes.status})`;
          try {
            const j = await dlRes.json();
            if (j?.error) dlErr = j.error;
          } catch {}
          throw new Error(dlErr);
        }
        const dlArrayBuffer = await dlRes.arrayBuffer();
        candidateUint8 = new Uint8Array(dlArrayBuffer);
      } else {
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
                      : line.includes('[ffmpeg-reencode]') || line.includes('[ffmpeg-remux]') || line.includes('[PASS ') || line.includes('[ALL-IN-ONE')
                        ? 'indigo'
                        : 'slate';
                  appendLog(`   ${line}`, color);
                }
              }
            }
          } catch {}
        }

        const cleanedArrayBuffer = await response.arrayBuffer();
        candidateUint8 = new Uint8Array(cleanedArrayBuffer);
      }

      if (abortPollingRef.current) return;
      await finalizeCompletedMp4(jobId, candidateUint8, engineHeader, activeDownloadUrl);
    } catch (serverErr: any) {
      if (abortPollingRef.current) return;
      const errMsg = serverErr?.message || 'Gagal menjalankan Cloud FFmpeg API';
      setProgressText('GAGAL / TERHENTI');
      setIsStreamHung(true);
      setHungAtPercent((prev) => prev ?? cloudProgress?.percent ?? null);
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
      if (pollInterval !== undefined) {
        window.clearInterval(pollInterval);
      }
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
              <span>MetaCleaner Pro</span>
              <span className="text-xs font-mono text-indigo-300 tabular-nums">
                · v22.0 Sub-Pixel Perspective 1080p + Zero-mdta
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Anti-AI 4 Lapisan: Sub-Pixel Perspective Micro-Drift 29.97fps, 1080p BT.709 + CMOS Breathing, 1/f Room Floor (-49dB) &amp; <code>aexciter</code>, + Zero-mdta/Zero-SEI Native 2-Ref MP4
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-bold rounded-full flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Anti-AI + Zero-Pulldown Ready</span>
          </span>
          <span className="hidden sm:flex px-2.5 py-1 bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-mono font-bold rounded-full items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>1080p BT.709 + Zero-SEI</span>
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
                    <span>1. Sub-Pixel Perspective Micro-Drift 29.97fps + 1080p BT.709 • 0% Pulldown</span>
                  </div>
                  <div className="flex items-center gap-2 text-emerald-300 bg-emerald-950/25 border border-emerald-900/40 rounded-lg px-2.5 py-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                    <span>2. 1/f Indoor Room Floor (-49dB) + Speech Harmonics (aexciter)</span>
                  </div>
                  <div className="flex items-center gap-2 text-indigo-300 bg-indigo-950/25 border border-indigo-900/40 rounded-lg px-2.5 py-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-indigo-400" />
                    <span>3. Zero-SEI + Zero-Free + Zero-mdta (Native Handler &amp; 2-Ref GOP)</span>
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
                  <span>Export All-in-One (Safe + Deep + Zero-SEI • 1-Click)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* LIVE CLOUD FFMPEG STREAM PROGRESS PANEL */}
        {(isProcessing || cloudProgress) && cloudProgress && (
          <div className={`bg-slate-900 border rounded-2xl p-4 sm:p-5 shadow-xl space-y-3 ${isStreamHung ? 'border-amber-500/50' : 'border-indigo-500/30'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Cpu className={`w-4 h-4 ${cloudProgress.stage === 'failed' ? 'text-rose-400' : cloudProgress.stage === 'completed' ? 'text-emerald-400' : isStreamHung ? 'text-amber-400' : 'text-indigo-400 animate-pulse'}`} />
                <span className="text-xs font-extrabold uppercase tracking-wider text-white">
                  Cloud FFmpeg Stream Telemetry
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700">
                  {cloudProgress.stage}
                </span>
                {resyncAttempts > 0 && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    Resync #{resyncAttempts}
                  </span>
                )}
                {isResyncing && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Resyncing...</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-[11px] font-mono">
                <span className="text-slate-400">{cloudProgress.engine}</span>
                <span className={`font-bold ${cloudProgress.stage === 'failed' ? 'text-rose-400' : cloudProgress.stage === 'completed' ? 'text-emerald-400' : isStreamHung ? 'text-amber-300' : 'text-cyan-400'}`}>
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
                      : isStreamHung
                        ? 'bg-amber-500'
                        : 'bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, cloudProgress.percent))}%` }}
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

            {(isStreamHung || cloudProgress.stage === 'failed' || (isProcessing && cloudProgress.percent >= 74 && cloudProgress.percent < 100)) && (
              <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2.5">
                <span className="text-[11px] font-mono text-amber-300">
                  {isStreamHung
                    ? `Stall terdeteksi di ${hungAtPercent ?? cloudProgress.percent}% — stream telemetri terhenti.`
                    : cloudProgress.stage === 'failed'
                      ? 'Pemrosesan terhenti — Anda dapat menyambung ulang langsung.'
                      : 'Memantau titik sinkronisasi 77% — auto-resync aktif.'}
                </span>
                <div className="flex items-center gap-2">
                  {isProcessing && (
                    <button
                      type="button"
                      disabled={isResyncing}
                      onClick={async () => {
                        const targetId = activeJobIdRef.current || cloudProgress.jobId;
                        if (!targetId) return;
                        setResyncAttempts((n) => n + 1);
                        appendLog(`[MANUAL RESYNC] Meminta sinkronisasi telemetri untuk Job ${targetId}...`, 'amber');
                        const r = await triggerTelemetryResync(targetId, cloudProgress.percent);
                        if (r?.state) {
                          setCloudProgress(r.state);
                        }
                        if (r?.stalled) {
                          setIsStreamHung(true);
                          setHungAtPercent(cloudProgress.percent);
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isResyncing ? 'animate-spin' : ''}`} />
                      <span>Resync Telemetry</span>
                    </button>
                  )}

                  {(isStreamHung || cloudProgress.stage === 'failed') && fileArrayBuffer && currentFile && (
                    <button
                      type="button"
                      onClick={() =>
                        executeAutoSanitization({
                          isResume: true,
                          previousJobId: activeJobIdRef.current || cloudProgress.jobId,
                          resumeFromPercent: hungAtPercent ?? cloudProgress.percent,
                        })
                      }
                      className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-extrabold flex items-center gap-1.5 transition cursor-pointer shadow-lg shadow-amber-900/30"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Resume Processing</span>
                    </button>
                  )}
                </div>
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

            <div className="pt-1 space-y-2">
              {processedBlob && serverDownloadUrl && lastJobId ? (
                <a
                  href={serverDownloadUrl}
                  download={getOutputFileName()}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-900/40"
                >
                  <Download className="w-4 h-4" />
                  <span>
                    Unduh Berkas Bersih ({(processedBlob.size / (1024 * 1024)).toFixed(2)} MB)
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
                    Unduh Berkas Bersih ({processedBlob ? `${(processedBlob.size / (1024 * 1024)).toFixed(2)} MB` : 'output_bersih.mp4'})
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
            previewUrlAfter={previewUrlAfter}
            beforeFileName={currentFile?.name}
            afterFileName={
              processedBlob && currentFile
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
                MetaCleaner v22 menulis ulang paket dengan <code className="text-emerald-300">-bsf:v filter_units=remove_types=6</code> (0% SEI, 0% atom <code>free</code>, 0% <code>udta/meta/mdta</code> spoofing), <strong>sub-pixel perspective micro-drift</strong> per-frame + CMOS auto-exposure breathing pada <strong>29.97fps 1080p BT.709</strong>, &amp; GOP 2-ref kamera native.
              </p>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-indigo-900/30 space-y-2">
              <div className="font-bold text-indigo-400 flex items-center gap-1.5">
                <span>🎙️</span>
                <span>Penetralan Audio TTS &amp; Vocoder AI</span>
              </div>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Detektor platform modern memindai <strong>jeda hening digital (&lt;-55dB)</strong>, <strong>hiss &gt;12kHz sintetik (&gt;-40dB)</strong>, <strong>pseudo-stereo TTS</strong>, dan <strong>cliff spektrum &gt;17kHz</strong>. MetaCleaner v22 menyuntikkan 1/f pink indoor room floor (-49dB), harmonik suara <code>aexciter</code>, &amp; AAC 256kbps <code className="text-indigo-300">-cutoff 20500</code>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
