import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { probeVideoFile } from '@/lib/video-probe';
import {
  findUploadedFile,
  getResultFilePath,
  sanitizeJobId,
  sanitizeVideoExtension,
  sweepExpiredMetaCleanerFiles,
} from '@/lib/meta-cleaner-progress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  await sweepExpiredMetaCleanerFiles();

  const sessionId = crypto.randomUUID();
  const tmpDir = os.tmpdir();
  let tmpPath = path.join(tmpDir, `metacleaner_probe_${sessionId}.mp4`);
  let shouldUnlinkTmp = false;

  try {
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => ({}));
      const uploadId = sanitizeJobId(body?.uploadId);
      const jobId = sanitizeJobId(body?.jobId);

      let targetPath = '';
      if (jobId) {
        const resultPath = getResultFilePath(jobId);
        if (!fsSync.existsSync(resultPath)) {
          return NextResponse.json(
            {
              success: false,
              error: 'File hasil tidak ditemukan atau sudah auto-clean setelah 5 menit.',
            },
            { status: 404 }
          );
        }
        targetPath = resultPath;
      } else if (uploadId) {
        const uploaded = await findUploadedFile(uploadId);
        if (!uploaded) {
          return NextResponse.json(
            {
              success: false,
              error: 'File video upload tidak ditemukan atau masa simpan telah habis.',
            },
            { status: 404 }
          );
        }
        targetPath = uploaded.filePath;
      } else {
        return NextResponse.json(
          { success: false, error: 'Parameter uploadId atau jobId diperlukan.' },
          { status: 400 }
        );
      }

      const probe = await probeVideoFile(targetPath);
      return NextResponse.json(
        { success: true, probe },
        {
          status: 200,
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    let buffer: Buffer;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return NextResponse.json(
          { success: false, error: 'File video tidak ditemukan.' },
          { status: 400 }
        );
      }
      const ext = sanitizeVideoExtension(file.name);
      tmpPath = path.join(tmpDir, `metacleaner_probe_${sessionId}.${ext}`);
      buffer = Buffer.from(await file.arrayBuffer());
    } else {
      buffer = Buffer.from(await req.arrayBuffer());
    }

    if (!buffer || buffer.byteLength < 256) {
      return NextResponse.json(
        { success: false, error: 'Buffer video tidak valid.' },
        { status: 400 }
      );
    }

    shouldUnlinkTmp = true;
    await fs.writeFile(tmpPath, buffer);
    const probe = await probeVideoFile(tmpPath);

    return NextResponse.json(
      { success: true, probe },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Gagal menjalankan ffprobe eksternal pada video.',
      },
      { status: 500 }
    );
  } finally {
    if (shouldUnlinkTmp) {
      await fs.unlink(tmpPath).catch(() => {});
    }
  }
}
