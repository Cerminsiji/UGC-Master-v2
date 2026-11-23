import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import {
  META_CLEANER_AUTO_CLEAN_MS,
  cleanupJobArtifacts,
  cleanupUploadArtifacts,
  getResultFilePath,
  readProgressSafe,
  sanitizeJobId,
  sweepExpiredMetaCleanerFiles,
} from '@/lib/meta-cleaner-progress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sanitizeDownloadFilename(raw: string | null): string {
  const cleaned = (raw || 'video_output_bersih.mp4')
    .replace(/[\x00-\x1f\x7f/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120);
  return cleaned.toLowerCase().endsWith('.mp4') ? cleaned : `${cleaned}.mp4`;
}

export async function GET(req: NextRequest) {
  await sweepExpiredMetaCleanerFiles();

  const url = new URL(req.url);
  const jobId = sanitizeJobId(url.searchParams.get('jobId'));
  if (!jobId) {
    return NextResponse.json({ error: 'Parameter jobId tidak valid.' }, { status: 400 });
  }

  const filePath = getResultFilePath(jobId);
  if (!fsSync.existsSync(filePath)) {
    return NextResponse.json(
      {
        error:
          'File video hasil sudah dihapus otomatis (Auto-Clean 5 Menit) atau tidak ditemukan.',
      },
      { status: 404 }
    );
  }

  const stat = await fs.stat(filePath);
  const progress = await readProgressSafe(jobId);
  const expiresMs = progress?.expiresAt ? Date.parse(progress.expiresAt) : NaN;
  const isExpired = Number.isFinite(expiresMs)
    ? Date.now() >= expiresMs
    : Date.now() - stat.mtimeMs >= META_CLEANER_AUTO_CLEAN_MS;

  if (isExpired) {
    await cleanupJobArtifacts(jobId);
    return NextResponse.json(
      {
        error:
          'Masa simpan 5 menit berakhir — file video telah dibersihkan otomatis (Auto-Clean) dari server.',
      },
      { status: 410 }
    );
  }

  const totalSize = stat.size;
  const isInline = url.searchParams.get('inline') === '1';
  const safeFilename = sanitizeDownloadFilename(url.searchParams.get('filename'));
  const disposition = isInline
    ? `inline; filename="${safeFilename}"`
    : `attachment; filename="${safeFilename}"`;

  const rangeHeader = req.headers.get('range');
  if (rangeHeader && rangeHeader.startsWith('bytes=')) {
    const match = rangeHeader.replace('bytes=', '').match(/^(\d*)-(\d*)$/);
    if (match) {
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? Math.min(totalSize - 1, parseInt(match[2], 10)) : totalSize - 1;
      if (start <= end && start < totalSize) {
        const chunkLen = end - start + 1;
        const fh = await fs.open(filePath, 'r');
        try {
          const buf = Buffer.alloc(chunkLen);
          await fh.read(buf, 0, chunkLen, start);
          return new NextResponse(new Uint8Array(buf), {
            status: 206,
            headers: {
              'Content-Type': 'video/mp4',
              'Content-Range': `bytes ${start}-${end}/${totalSize}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': String(chunkLen),
              'Content-Disposition': disposition,
              'Cache-Control': 'no-store',
            },
          });
        } finally {
          await fh.close();
        }
      }
    }
  }

  const fullBuffer = await fs.readFile(filePath);
  return new NextResponse(new Uint8Array(fullBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(fullBuffer.byteLength),
      'Accept-Ranges': 'bytes',
      'Content-Disposition': disposition,
      'Cache-Control': 'no-store',
    },
  });
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const jobId = sanitizeJobId(url.searchParams.get('jobId'));
  const uploadId = sanitizeJobId(url.searchParams.get('uploadId'));

  if (!jobId && !uploadId) {
    return NextResponse.json(
      { error: 'Parameter jobId atau uploadId diperlukan.' },
      { status: 400 }
    );
  }

  if (jobId) {
    await cleanupJobArtifacts(jobId, {
      reasonMessage: 'File video dibersihkan manual dari server oleh pengguna.',
    });
  }
  if (uploadId) {
    await cleanupUploadArtifacts(uploadId);
  }

  return NextResponse.json(
    { success: true, cleaned: true },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
