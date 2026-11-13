import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { probeVideoFile } from '@/lib/video-probe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const sessionId = crypto.randomUUID();
  const tmpDir = os.tmpdir();
  let tmpPath = path.join(tmpDir, `metacleaner_probe_${sessionId}.mp4`);

  try {
    const contentType = req.headers.get('content-type') || '';
    let buffer: Buffer;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return NextResponse.json({ success: false, error: 'File video tidak ditemukan.' }, { status: 400 });
      }
      const ext =
        (file.name.split('.').pop() || 'mp4')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '') || 'mp4';
      tmpPath = path.join(tmpDir, `metacleaner_probe_${sessionId}.${ext}`);
      buffer = Buffer.from(await file.arrayBuffer());
    } else {
      buffer = Buffer.from(await req.arrayBuffer());
    }

    if (!buffer || buffer.byteLength < 256) {
      return NextResponse.json({ success: false, error: 'Buffer video tidak valid.' }, { status: 400 });
    }

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
    await fs.unlink(tmpPath).catch(() => {});
  }
}
