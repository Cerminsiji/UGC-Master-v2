import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import {
  META_CLEANER_UPLOAD_IDLE_MS,
  cleanupJobArtifacts,
  cleanupUploadArtifacts,
  findUploadedFile,
  getUploadChunkDir,
  getUploadFilePath,
  sanitizeJobId,
  sanitizeVideoExtension,
  sweepExpiredMetaCleanerFiles,
  writeUploadMeta,
} from '@/lib/meta-cleaner-progress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_CHUNK_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_CHUNKS = 1000;

function getChunkPartPath(chunkDir: string, chunkIndex: number): string {
  const partName = `part_${String(chunkIndex).padStart(5, '0')}`;
  const resolved = path.resolve(chunkDir, partName);
  if (!resolved.startsWith(path.resolve(chunkDir) + path.sep)) {
    throw new Error('Invalid chunk path.');
  }
  return resolved;
}

export async function GET(req: NextRequest) {
  await sweepExpiredMetaCleanerFiles();

  const url = new URL(req.url);
  const uploadId = sanitizeJobId(url.searchParams.get('uploadId'));
  if (!uploadId) {
    return NextResponse.json({ error: 'Parameter uploadId tidak valid.' }, { status: 400 });
  }

  const existing = await findUploadedFile(uploadId);
  if (existing) {
    return NextResponse.json(
      {
        success: true,
        uploadId,
        assembled: true,
        filename: existing.filename,
        ext: existing.ext,
        sizeBytes: existing.sizeBytes,
        uploadedAt: existing.uploadedAt,
        expiresAt: existing.expiresAt,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const chunkDir = getUploadChunkDir(uploadId);
  const receivedChunks: number[] = [];
  if (fsSync.existsSync(chunkDir)) {
    const entries = await fs.readdir(chunkDir).catch(() => []);
    for (const entry of entries) {
      const m = entry.match(/^part_(\d{5})$/);
      if (m) {
        const idx = parseInt(m[1], 10);
        if (Number.isFinite(idx)) receivedChunks.push(idx);
      }
    }
    receivedChunks.sort((a, b) => a - b);
  }

  return NextResponse.json(
    {
      success: true,
      uploadId,
      assembled: false,
      receivedChunks,
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(req: NextRequest) {
  await sweepExpiredMetaCleanerFiles();

  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        { error: 'Gunakan multipart/form-data untuk upload video ke server.' },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const rawUploadId = formData.get('uploadId') as string | null;
    const uploadId = sanitizeJobId(rawUploadId);
    if (!uploadId) {
      return NextResponse.json(
        { error: 'uploadId tidak valid.' },
        { status: 400 }
      );
    }

    const chunkBlob = (formData.get('chunk') || formData.get('file')) as Blob | null;
    if (!chunkBlob) {
      return NextResponse.json(
        { error: 'Payload chunk video tidak ditemukan.' },
        { status: 400 }
      );
    }

    const rawFilename = String(
      formData.get('filename') ||
        ((chunkBlob as File)?.name ? (chunkBlob as File).name : 'input.mp4')
    );
    const filename = path.basename(rawFilename).slice(0, 180) || 'input.mp4';
    const ext = sanitizeVideoExtension(filename);

    const chunkIndex = Number.parseInt(String(formData.get('chunkIndex') ?? '0'), 10);
    const totalChunks = Number.parseInt(String(formData.get('totalChunks') ?? '1'), 10);

    if (
      !Number.isFinite(chunkIndex) ||
      !Number.isFinite(totalChunks) ||
      totalChunks < 1 ||
      totalChunks > MAX_TOTAL_CHUNKS ||
      chunkIndex < 0 ||
      chunkIndex >= totalChunks
    ) {
      return NextResponse.json(
        { error: 'Indeks chunk upload tidak valid.' },
        { status: 400 }
      );
    }

    const chunkArrayBuf = await chunkBlob.arrayBuffer();
    if (chunkArrayBuf.byteLength === 0 || chunkArrayBuf.byteLength > MAX_CHUNK_BYTES) {
      return NextResponse.json(
        { error: 'Ukuran chunk tidak valid atau melebihi batas 25 MB per chunk.' },
        { status: 400 }
      );
    }
    const chunkBuf = Buffer.from(chunkArrayBuf);

    // Fast path for single-chunk upload
    if (totalChunks === 1) {
      const targetPath = getUploadFilePath(uploadId, ext);
      const tmpWritePath = `${targetPath}.tmp.${process.pid}.${Date.now()}`;
      await fs.writeFile(tmpWritePath, chunkBuf);
      await fs.rename(tmpWritePath, targetPath);

      const now = new Date();
      const expiresAt = new Date(now.getTime() + META_CLEANER_UPLOAD_IDLE_MS).toISOString();
      await writeUploadMeta({
        uploadId,
        filename,
        ext,
        sizeBytes: chunkBuf.byteLength,
        filePath: targetPath,
        uploadedAt: now.toISOString(),
        expiresAt,
      });

      setTimeout(() => {
        sweepExpiredMetaCleanerFiles(true).catch(() => {});
      }, META_CLEANER_UPLOAD_IDLE_MS + 1000);

      return NextResponse.json(
        {
          success: true,
          uploadId,
          assembled: true,
          chunkIndex: 0,
          totalChunks: 1,
          filename,
          ext,
          sizeBytes: chunkBuf.byteLength,
          uploadedAt: now.toISOString(),
          expiresAt,
        },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const chunkDir = getUploadChunkDir(uploadId);
    await fs.mkdir(chunkDir, { recursive: true });
    const partPath = getChunkPartPath(chunkDir, chunkIndex);
    const tmpPartPath = `${partPath}.tmp.${process.pid}.${Date.now()}`;
    await fs.writeFile(tmpPartPath, chunkBuf);
    await fs.rename(tmpPartPath, partPath);

    // Check if all chunks 0..totalChunks-1 exist
    let allPresent = true;
    for (let i = 0; i < totalChunks; i++) {
      if (!fsSync.existsSync(getChunkPartPath(chunkDir, i))) {
        allPresent = false;
        break;
      }
    }

    if (!allPresent) {
      return NextResponse.json(
        {
          success: true,
          uploadId,
          assembled: false,
          chunkIndex,
          totalChunks,
          receivedBytes: chunkBuf.byteLength,
        },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Assemble chunks sequentially to avoid double-buffering the whole video in memory
    const targetPath = getUploadFilePath(uploadId, ext);
    const tmpAssembledPath = `${targetPath}.assembling.${process.pid}.${Date.now()}`;
    let totalSize = 0;
    const outHandle = await fs.open(tmpAssembledPath, 'w');
    try {
      for (let i = 0; i < totalChunks; i++) {
        const partBytes = await fs.readFile(getChunkPartPath(chunkDir, i));
        await outHandle.write(partBytes);
        totalSize += partBytes.byteLength;
      }
    } finally {
      await outHandle.close();
    }

    await fs.rename(tmpAssembledPath, targetPath);
    await fs.rm(chunkDir, { recursive: true, force: true }).catch(() => {});

    const now = new Date();
    const expiresAt = new Date(now.getTime() + META_CLEANER_UPLOAD_IDLE_MS).toISOString();
    await writeUploadMeta({
      uploadId,
      filename,
      ext,
      sizeBytes: totalSize,
      filePath: targetPath,
      uploadedAt: now.toISOString(),
      expiresAt,
    });

    setTimeout(() => {
      sweepExpiredMetaCleanerFiles(true).catch(() => {});
    }, META_CLEANER_UPLOAD_IDLE_MS + 1000);

    return NextResponse.json(
      {
        success: true,
        uploadId,
        assembled: true,
        chunkIndex,
        totalChunks,
        filename,
        ext,
        sizeBytes: totalSize,
        uploadedAt: now.toISOString(),
        expiresAt,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Gagal mengunggah video ke server.',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const uploadId = sanitizeJobId(url.searchParams.get('uploadId'));
  const jobId = sanitizeJobId(url.searchParams.get('jobId'));

  if (!uploadId && !jobId) {
    return NextResponse.json(
      { error: 'uploadId atau jobId diperlukan.' },
      { status: 400 }
    );
  }

  if (uploadId) {
    await cleanupUploadArtifacts(uploadId);
  }
  if (jobId) {
    await cleanupJobArtifacts(jobId, {
      reasonMessage: 'File video dihapus manual dari server.',
    });
  }

  return NextResponse.json(
    { success: true, cleaned: true, uploadId: uploadId || null, jobId: jobId || null },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
