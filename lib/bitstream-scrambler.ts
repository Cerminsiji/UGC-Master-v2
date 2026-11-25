export type SynthIdScrambleMode = 'aggressive' | 'balanced' | 'off';

export interface BitstreamScrambleResult {
  seiUnitsDetected: number;
  seiPayloadsScrambled: number;
  watermarkAtomsScrambled: number;
  vendorHeadersWiped: number;
  totalBytesScrambled: number;
  targetedMarkers: string[];
  samplesScanned: number;
  entropyDigestHex: string;
}

const WATERMARK_MARKERS = [
  'synthid',
  'c2pa',
  'jumb',
  'trainedalgorithmicmedia',
  'google',
  'deepmind',
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
  'stable-video',
];

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

function fillCryptoRandomBytes(target: Uint8Array, safeNalPayload = false): number {
  const len = target.length;
  if (len <= 0) return 0;

  if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
    const step = 65536;
    for (let i = 0; i < len; i += step) {
      const slice = target.subarray(i, Math.min(len, i + step));
      globalThis.crypto.getRandomValues(slice);
    }
  } else {
    let seed = (Date.now() ^ (len * 2654435761)) >>> 0;
    for (let i = 0; i < len; i++) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      target[i] = seed & 0xff;
    }
  }

  if (safeNalPayload) {
    // Keep values inside [0x04..0xFE] so scrambled SEI RBSP never creates accidental 0x000000..0x000003 start-code sequences
    for (let i = 0; i < len; i++) {
      target[i] = 0x04 + (target[i] % 250);
    }
  }
  return len;
}

function extractVideoSampleRanges(bytes: Uint8Array): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  if (bytes.length < 16) return ranges;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder('ascii', { fatal: false });

  // Locate top-level moov
  let moovStart = -1;
  let moovEnd = -1;
  let topPos = 0;
  while (topPos + 8 <= bytes.length) {
    let sz = view.getUint32(topPos, false);
    const tp = decoder.decode(bytes.subarray(topPos + 4, topPos + 8));
    let hdr = 8;
    if (sz === 1 && topPos + 16 <= bytes.length) {
      const hi = view.getUint32(topPos + 8, false);
      const lo = view.getUint32(topPos + 12, false);
      sz = hi * 4294967296 + lo;
      hdr = 16;
    } else if (sz === 0) {
      sz = bytes.length - topPos;
    }
    if (sz < hdr || topPos + sz > bytes.length) break;
    if (tp === 'moov') {
      moovStart = topPos + hdr;
      moovEnd = topPos + sz;
      break;
    }
    topPos += sz;
  }

  if (moovStart < 0) return ranges;

  let mOff = moovStart;
  while (mOff + 8 <= moovEnd) {
    let mSz = view.getUint32(mOff, false);
    const mType = decoder.decode(bytes.subarray(mOff + 4, mOff + 8));
    let mHdr = 8;
    if (mSz === 1 && mOff + 16 <= moovEnd) {
      const hi = view.getUint32(mOff + 8, false);
      const lo = view.getUint32(mOff + 12, false);
      mSz = hi * 4294967296 + lo;
      mHdr = 16;
    } else if (mSz === 0) {
      mSz = moovEnd - mOff;
    }
    if (mSz < mHdr || mOff + mSz > moovEnd) break;

    if (mType === 'trak') {
      let isVideoTrak = false;
      const stcoOffsets: number[] = [];
      const stscEntries: Array<{ firstChunk: number; samplesPerChunk: number }> = [];
      const stszSizes: number[] = [];

      const walkTrak = (s: number, e: number, d: number) => {
        if (d > 6) return;
        let p = s;
        while (p + 8 <= e) {
          let sz = view.getUint32(p, false);
          const tp = decoder.decode(bytes.subarray(p + 4, p + 8));
          let hdr = 8;
          if (sz === 1 && p + 16 <= e) {
            const hi = view.getUint32(p + 8, false);
            const lo = view.getUint32(p + 12, false);
            sz = hi * 4294967296 + lo;
            hdr = 16;
          } else if (sz === 0) {
            sz = e - p;
          }
          if (sz < hdr || p + sz > e) break;

          if (tp === 'hdlr' && p + hdr + 12 <= p + sz) {
            const handlerType = decoder.decode(bytes.subarray(p + hdr + 8, p + hdr + 12));
            if (handlerType === 'vide') isVideoTrak = true;
          } else if (tp === 'stco' && p + hdr + 8 <= p + sz) {
            const count = view.getUint32(p + hdr + 4, false);
            for (let i = 0; i < count && p + hdr + 8 + i * 4 + 4 <= p + sz; i++) {
              stcoOffsets.push(view.getUint32(p + hdr + 8 + i * 4, false));
            }
          } else if (tp === 'co64' && p + hdr + 8 <= p + sz) {
            const count = view.getUint32(p + hdr + 4, false);
            for (let i = 0; i < count && p + hdr + 8 + i * 8 + 8 <= p + sz; i++) {
              const hi = view.getUint32(p + hdr + 8 + i * 8, false);
              const lo = view.getUint32(p + hdr + 8 + i * 8 + 4, false);
              stcoOffsets.push(hi * 4294967296 + lo);
            }
          } else if (tp === 'stsc' && p + hdr + 8 <= p + sz) {
            const count = view.getUint32(p + hdr + 4, false);
            for (let i = 0; i < count && p + hdr + 8 + i * 12 + 12 <= p + sz; i++) {
              stscEntries.push({
                firstChunk: view.getUint32(p + hdr + 8 + i * 12, false),
                samplesPerChunk: view.getUint32(p + hdr + 8 + i * 12 + 4, false),
              });
            }
          } else if (tp === 'stsz' && p + hdr + 12 <= p + sz) {
            const fixedSz = view.getUint32(p + hdr + 4, false);
            const count = view.getUint32(p + hdr + 8, false);
            if (fixedSz > 0) {
              for (let i = 0; i < count; i++) stszSizes.push(fixedSz);
            } else {
              for (let i = 0; i < count && p + hdr + 12 + i * 4 + 4 <= p + sz; i++) {
                stszSizes.push(view.getUint32(p + hdr + 12 + i * 4, false));
              }
            }
          } else if (ISO_CONTAINER_BOXES.has(tp)) {
            walkTrak(p + hdr, p + sz, d + 1);
          }

          p += sz;
        }
      };

      walkTrak(mOff + mHdr, mOff + mSz, 0);
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
            if (curPos >= 0 && curPos + sLen <= bytes.length) {
              ranges.push({ start: curPos, end: curPos + sLen });
            }
            curPos += sLen;
          }
        }
        return ranges;
      }
    }

    mOff += mSz;
  }

  return ranges;
}

/**
 * Targets and cryptographically scrambles SynthID / C2PA / SEI watermarking payloads
 * inside ISO-BMFF container boxes and H.264/HEVC mdat bitstream NAL units.
 */
export function scrambleWatermarkBitstreamsInPlace(
  bytes: Uint8Array,
  options?: {
    scrambleSeiPayloads?: boolean;
    codecHint?: 'h264' | 'hevc' | 'auto';
  }
): BitstreamScrambleResult {
  const scrambleSeiPayloads = options?.scrambleSeiPayloads !== false;
  const codecHint = options?.codecHint || 'auto';

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder('ascii', { fatal: false });
  const markerSet = new Set<string>();

  let seiUnitsDetected = 0;
  let seiPayloadsScrambled = 0;
  let watermarkAtomsScrambled = 0;
  let vendorHeadersWiped = 0;
  let totalBytesScrambled = 0;
  let detectedHevc = codecHint === 'hevc';

  const containerWalk = (start: number, end: number, depth: number) => {
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

      if (type === 'hev1' || type === 'hvc1') {
        detectedHevc = true;
      }

      if (type === 'stsd' && offset + headerSize + 8 < offset + size) {
        containerWalk(offset + headerSize + 8, offset + size, depth + 1);
      } else if (['avc1', 'avc3', 'hev1', 'hvc1', 'mp4v'].includes(type) && size >= 86) {
        const compSlice = bytes.subarray(offset + 50, offset + 82);
        const hasComp = compSlice.some((b) => b !== 0);
        const hasVendor = bytes.subarray(offset + 20, offset + 24).some((b) => b !== 0);
        if (hasComp) {
          const compStr = decoder.decode(compSlice).toLowerCase();
          for (const m of WATERMARK_MARKERS) {
            if (compStr.includes(m)) markerSet.add(m);
          }
          bytes.fill(0x00, offset + 50, offset + 82);
          vendorHeadersWiped++;
          totalBytesScrambled += 32;
        }
        if (hasVendor) {
          bytes.fill(0x00, offset + 20, offset + 24);
          vendorHeadersWiped++;
          totalBytesScrambled += 4;
        }
        if (offset + 86 < offset + size) {
          containerWalk(offset + 86, offset + size, depth + 1);
        }
      } else if (['uuid', 'c2pa', 'jumb', 'c2ma', 'c2cl', 'XMP_', '©too', '©enc', 'tmcd'].includes(type)) {
        const sample = decoder.decode(bytes.subarray(offset + headerSize, Math.min(offset + size, offset + 2048))).toLowerCase();
        for (const m of WATERMARK_MARKERS) {
          if (sample.includes(m)) markerSet.add(m);
        }
        markerSet.add(type);
        bytes[offset + 4] = 0x66; // 'f'
        bytes[offset + 5] = 0x72; // 'r'
        bytes[offset + 6] = 0x65; // 'e'
        bytes[offset + 7] = 0x65; // 'e'
        totalBytesScrambled += fillCryptoRandomBytes(bytes.subarray(offset + headerSize, offset + size), false);
        watermarkAtomsScrambled++;
      } else if (['udta', 'meta', 'ilst'].includes(type)) {
        const payload = decoder
          .decode(bytes.subarray(offset + headerSize, Math.min(offset + size, offset + 2048)))
          .toLowerCase();
        const isEmptyTombstone =
          (type === 'udta' && payload.includes('mdirappl') && size <= 128) ||
          (type === 'meta' && payload.includes('mdirappl') && size <= 120) ||
          (type === 'ilst' && size <= 16);

        let hitAny = isEmptyTombstone;
        for (const m of WATERMARK_MARKERS) {
          if (payload.includes(m)) {
            markerSet.add(m);
            hitAny = true;
          }
        }

        if (hitAny) {
          bytes[offset + 4] = 0x66;
          bytes[offset + 5] = 0x72;
          bytes[offset + 6] = 0x65;
          bytes[offset + 7] = 0x65;
          totalBytesScrambled += fillCryptoRandomBytes(bytes.subarray(offset + headerSize, offset + size), false);
          watermarkAtomsScrambled++;
        } else {
          const nextStart = type === 'meta' ? offset + headerSize + 4 : offset + headerSize;
          if (nextStart < offset + size) {
            containerWalk(nextStart, offset + size, depth + 1);
          }
        }
      } else if (ISO_CONTAINER_BOXES.has(type)) {
        const nextStart = type === 'meta' ? offset + headerSize + 4 : offset + headerSize;
        if (nextStart < offset + size) {
          containerWalk(nextStart, offset + size, depth + 1);
        }
      }

      offset += size;
    }
  };

  containerWalk(0, bytes.length, 0);

  // Extract exact video sample ranges so audio frames in mdat are never corrupted
  const videoRanges = extractVideoSampleRanges(bytes);
  const samplesScanned = videoRanges.length;

  if (scrambleSeiPayloads && videoRanges.length > 0) {
    const isHevc = codecHint === 'hevc' || (codecHint === 'auto' && detectedHevc);

    for (const r of videoRanges) {
      let pos = r.start;
      while (pos + 6 <= r.end) {
        const nalLen =
          ((bytes[pos] << 24) >>> 0) +
          ((bytes[pos + 1] << 16) >>> 0) +
          ((bytes[pos + 2] << 8) >>> 0) +
          (bytes[pos + 3] >>> 0);

        if (nalLen < 2 || pos + 4 + nalLen > r.end) {
          break;
        }

        const nalStart = pos + 4;
        const nalEnd = nalStart + nalLen;
        const hdr0 = bytes[nalStart];
        const forbiddenBit = (hdr0 & 0x80) !== 0;

        let isSei = false;
        let payloadCursor = nalStart + 1;

        if (!isHevc) {
          const nalType = hdr0 & 0x1f;
          const nalRefIdc = (hdr0 >> 5) & 0x03;
          if (!forbiddenBit && nalType === 6 && nalRefIdc === 0 && payloadCursor + 1 < nalEnd) {
            isSei = true;
          }
        } else {
          const nalType = (hdr0 >> 1) & 0x3f;
          if (!forbiddenBit && (nalType === 39 || nalType === 40) && nalStart + 3 < nalEnd) {
            isSei = true;
            payloadCursor = nalStart + 2;
          }
        }

        if (isSei && payloadCursor + 2 < nalEnd) {
          // Decode SEI payload_type & payload_size headers (0xFF extensions)
          let seiOffset = payloadCursor;
          let pType = 0;
          while (seiOffset < nalEnd - 1 && bytes[seiOffset] === 0xff) {
            pType += 255;
            seiOffset++;
          }
          if (seiOffset < nalEnd) {
            pType += bytes[seiOffset++];
          }
          while (seiOffset < nalEnd - 1 && bytes[seiOffset] === 0xff) {
            seiOffset++;
          }
          if (seiOffset < nalEnd) {
            seiOffset++;
          }

          seiUnitsDetected++;
          const payloadText = decoder
            .decode(bytes.subarray(payloadCursor, Math.min(nalEnd, payloadCursor + 512)))
            .toLowerCase();
          for (const m of WATERMARK_MARKERS) {
            if (payloadText.includes(m)) {
              markerSet.add(m);
            }
          }

          // Target watermark / unregistered / registered / buffering SEI payloads for cryptographic scrambling
          const scrambleStart = Math.min(seiOffset, nalEnd - 1);
          const scrambleEnd = bytes[nalEnd - 1] === 0x80 ? Math.max(scrambleStart, nalEnd - 1) : nalEnd;
          if (scrambleEnd > scrambleStart && (pType === 5 || pType === 4 || pType === 0 || pType === 1 || markerSet.size > 0)) {
            totalBytesScrambled += fillCryptoRandomBytes(bytes.subarray(scrambleStart, scrambleEnd), true);
            seiPayloadsScrambled++;
          }
        }

        pos = nalEnd;
      }
    }
  }

  const digestSeed = new Uint8Array(4);
  fillCryptoRandomBytes(digestSeed, false);
  const entropyDigestHex = Array.from(digestSeed)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

  return {
    seiUnitsDetected,
    seiPayloadsScrambled,
    watermarkAtomsScrambled,
    vendorHeadersWiped,
    totalBytesScrambled,
    targetedMarkers: Array.from(markerSet),
    samplesScanned,
    entropyDigestHex,
  };
}
