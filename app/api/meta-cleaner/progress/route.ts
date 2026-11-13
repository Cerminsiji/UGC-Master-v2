import { NextRequest, NextResponse } from 'next/server';
import { readProgressSafe, sanitizeJobId } from '@/lib/meta-cleaner-progress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const jobId = sanitizeJobId(url.searchParams.get('jobId'));
  const wantStream =
    url.searchParams.get('stream') === '1' ||
    (req.headers.get('accept') || '').includes('text/event-stream');

  if (!jobId) {
    return NextResponse.json({ error: 'jobId diperlukan' }, { status: 400 });
  }

  if (!wantStream) {
    const state = await readProgressSafe(jobId);
    if (!state) {
      return NextResponse.json(
        {
          jobId,
          stage: 'queued',
          message: 'Menunggu inisialisasi worker cloud FFmpeg...',
          percent: 0,
          frame: 0,
          totalFrames: 0,
          fps: 0,
          speed: '0x',
          outTimeSec: 0,
          durationSec: 0,
          engine: 'Cloud Python/Node FFmpeg',
          logs: [],
          updatedAt: new Date().toISOString(),
        },
        {
          status: 200,
          headers: { 'Cache-Control': 'no-store' },
        }
      );
    }
    return NextResponse.json(state, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let lastSerialized = '';
      let ticks = 0;
      const maxTicks = 240; // ~120s

      const sendEvent = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const interval = setInterval(async () => {
        ticks++;
        try {
          const state = await readProgressSafe(jobId);
          if (state) {
            const serialized = JSON.stringify(state);
            if (serialized !== lastSerialized) {
              lastSerialized = serialized;
              sendEvent(state);
            }
            if (state.stage === 'completed' || state.stage === 'failed') {
              clearInterval(interval);
              controller.close();
              return;
            }
          }
          if (ticks >= maxTicks) {
            clearInterval(interval);
            controller.close();
          }
        } catch {
          clearInterval(interval);
          try {
            controller.close();
          } catch {}
        }
      }, 500);

      req.signal.addEventListener('abort', () => {
        clearInterval(interval);
        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
