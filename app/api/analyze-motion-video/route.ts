import { NextRequest, NextResponse } from 'next/server';
import { Type } from '@google/genai';
import {
  extractVideoDataPart,
  generateWithMultimodalParts,
  getGeminiClient,
  parseSafeJson,
} from '@/lib/gemini-ugc';

export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Payload JSON tidak valid untuk analisis video.' },
        { status: 400 }
      );
    }

    const { videoDataUrl, productName = '', sceneCount = 6 } = body || {};

    if (!videoDataUrl || typeof videoDataUrl !== 'string') {
      return NextResponse.json(
        { error: 'File video referensi (mp4/webm/mov) wajib diunggah terlebih dahulu.' },
        { status: 400 }
      );
    }

    const videoPart = extractVideoDataPart(videoDataUrl, 15 * 1024 * 1024);
    if (!videoPart) {
      return NextResponse.json(
        {
          error:
            'Format video tidak valid atau ukuran file melebihi batas aman (maksimal 12MB MP4/WebM/MOV).',
        },
        { status: 400 }
      );
    }

    const ai = getGeminiClient();
    if (!ai) {
      return NextResponse.json(
        {
          error:
            'GEMINI_API_KEY belum dikonfigurasi di server sehingga analisis multimodal video AI tidak dapat dijalankan.',
        },
        { status: 503 }
      );
    }

    const targetSegments = Math.max(3, Math.min(8, Number(sceneCount) || 6));
    const prompt = `Analisis video referensi gerakan / dance / showcase TikTok ini secara multimodal frame-per-frame!
${productName ? `Konteks produk yang akan diintegrasikan: "${productName}".` : ''}

Tugas Anda:
1. Identifikasi gaya koreografi/gerakan utama (\`danceStyle\`), pilih salah satu yang paling mendekati atau deskripsikan secara akurat: "Viral TikTok Hand-Sync & Bounce", "Jedag-Jedug Transition & Beat Drop", "K-Pop Point Choreography & Sharp Pose", "Soft Aesthetic Lifestyle & Micro-Groove", "Fashion OOTD Runway & Spin Transition", atau "Product Showcase Rhythmic Flow".
2. Identifikasi gaya pergerakan kamera dominan (\`cameraMovement\`): misal "0.5x Ultra-Wide Dynamic Follow", "Crash Zoom / Beat Drop Punch-In", "Handheld Natural UGC Micro-Shake", "Match-Cut Hand Cover + Whip Pan", "360° Orbital Product Arc", atau "Smooth Gimbal Push-In".
3. Identifikasi estetika pencahayaan & color look (\`aestheticEffect\`): misal "Raw iPhone Handheld 2026 Aesthetic", "Clean Daylight Bedroom", "Warm Sunset Golden Hour", atau "Neon Studio RGB Contrast".
4. Klasifikasikan intensitas gerak (\`motionIntensity\`) PERSIS salah satu dari: "Subtle", "Medium", "Dynamic", "High Energy".
5. Klasifikasikan tempo ketukan (\`beatTempo\`) PERSIS salah satu dari: "Slow (70-90 BPM)", "Medium (100-120 BPM)", "Fast (125-140 BPM)".
6. Tulis \`customMotionNotes\` (2-3 kalimat padat bahasa Indonesia menjelaskan pola gerak tubuh, ketukan transisi, arah putaran, dan kontak pose utama).
7. Tulis \`loopNote\` (catatan cara mengunci frame akhir video agar looping mulus kembali ke frame pertama).
8. Pecah struktur gerakan menjadi tepat ${targetSegments} segmen (\`segments\`) berisi \`beatCue\`, \`choreographyMove\`, \`cameraChoreo\`, dan \`duration\` (integer detik).`;

    const config = {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          danceStyle: { type: Type.STRING },
          cameraMovement: { type: Type.STRING },
          aestheticEffect: { type: Type.STRING },
          motionIntensity: { type: Type.STRING },
          beatTempo: { type: Type.STRING },
          customMotionNotes: { type: Type.STRING },
          loopNote: { type: Type.STRING },
          segments: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                beatCue: { type: Type.STRING },
                choreographyMove: { type: Type.STRING },
                cameraChoreo: { type: Type.STRING },
                duration: { type: Type.INTEGER },
              },
              required: ['beatCue', 'choreographyMove', 'cameraChoreo', 'duration'],
            },
          },
        },
        required: [
          'danceStyle',
          'cameraMovement',
          'aestheticEffect',
          'motionIntensity',
          'beatTempo',
          'customMotionNotes',
          'loopNote',
          'segments',
        ],
      },
    };

    const rawText = await generateWithMultimodalParts(
      [
        {
          inlineData: {
            mimeType: videoPart.mimeType,
            data: videoPart.data,
          },
        },
        { text: prompt },
      ],
      config,
      'You are an expert TikTok choreography & camera motion analyst. Inspect the video frames accurately and extract exact tempo, intensity, camera movement, seamless loop anchor, and per-segment motion cues in JSON.',
      38000
    );

    const parsed = parseSafeJson<any>(rawText);
    if (!parsed || !parsed.danceStyle) {
      return NextResponse.json(
        {
          error:
            'Model AI gagal memproses video referensi saat ini. Coba potong video lebih singkat (3-10 detik, <= 12MB) lalu ulangi.',
        },
        { status: 502 }
      );
    }

    const allowedIntensity = ['Subtle', 'Medium', 'Dynamic', 'High Energy'];
    const allowedTempo = ['Slow (70-90 BPM)', 'Medium (100-120 BPM)', 'Fast (125-140 BPM)'];
    const safeIntensity = allowedIntensity.includes(parsed.motionIntensity)
      ? parsed.motionIntensity
      : 'Dynamic';
    const safeTempo = allowedTempo.includes(parsed.beatTempo)
      ? parsed.beatTempo
      : 'Medium (100-120 BPM)';

    return NextResponse.json({
      success: true,
      analysis: {
        danceStyle: parsed.danceStyle,
        cameraMovement: parsed.cameraMovement || 'Handheld Natural UGC Micro-Shake',
        aestheticEffect: parsed.aestheticEffect || 'Raw iPhone Handheld 2026 Aesthetic',
        motionIntensity: safeIntensity,
        beatTempo: safeTempo,
        customMotionNotes: parsed.customMotionNotes || '',
        loopNote: parsed.loopNote || 'Kunci pose akhir sejajar dengan pose pembuka detik ke-1.',
        segments: Array.isArray(parsed.segments) ? parsed.segments : [],
      },
    });
  } catch (err: any) {
    console.error('Error in /api/analyze-motion-video:', err);
    return NextResponse.json(
      { error: err?.message || 'Gagal menganalisis video motion referensi.' },
      { status: 500 }
    );
  }
}
