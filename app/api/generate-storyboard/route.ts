import { NextRequest, NextResponse } from 'next/server';
import { Type } from '@google/genai';
import {
  generateWithFallback,
  parseSafeJson,
  formatShortCaption,
  generateRichFallback,
} from '@/lib/gemini-ugc';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      category = 'Before & After',
      productName = 'Produk Unggulan',
      brandName = '',
      productDescription = '',
      targetAudience = 'Pengguna TikTok / Reels usia 18-35 tahun',
      keySellingPoints = '',
      persona = 'Wanita Muda / Gen Z',
      tone = 'Santai, Mengalir & Natural (Teman Curhat)',
      cameraAngleStyle = 'Dinamis & Multi-Angle (Viral Fast-Cut)',
      preferredCameraAngles = [],
      targetDuration = 30,
      targetSceneCount = 0,
      platform = 'TikTok / Reels',
      language = 'id',
    } = body;

    const sceneCountText = targetSceneCount && targetSceneCount >= 2 && targetSceneCount <= 9
      ? `WAJIB BUAT TEPAT ${targetSceneCount} ADEGAN (meskipun durasi hanya ${targetDuration} detik, buat ${targetSceneCount} adegan bergaya fast-cut mikro yang dinamis!).`
      : `Buat 5 sampai 7 adegan yang proporsional, kaya, dan variatif agar alur video memikat dan tidak monoton.`;

    const cameraInstructions = preferredCameraAngles && preferredCameraAngles.length > 0
      ? `ATURAN KHUSUS SUDUT KAMERA (CAMERA ANGLE):
Gaya Utama: "${cameraAngleStyle}".
WAJIB prioritaskan dan variasikan pilihan sudut kamera berikut di setiap adegan: ${preferredCameraAngles.join(', ')}.
PENTING: Setiap adegan harus memiliki field cameraAngle yang spesifik (misal: 'POV / Handheld (First-Person)', 'Extreme Close-up / Macro (Tekstur & Detail)', 'Over the Shoulder (OTS)', 'Front Camera / Selfie Mode (Curhat Langsung)', 'Low Angle (Hero / Powerful)', 'Flat Lay / Top-down (Meja Estetik)'). Jangan gunakan sudut yang sama beruntun!`
      : `ATURAN KHUSUS SUDUT KAMERA (CAMERA ANGLE):
Gaya Utama Komposisi Kamera: "${cameraAngleStyle}".
Sesuaikan sudut kamera di setiap adegan dengan gaya ini secara sinematik vertikal (9:16 TikTok/Reels/Shorts). Berikan variasi sudut yang hidup dan dinamis (misal: POV / Handheld, Close-up Macro, Over the Shoulder, Front Camera / Selfie, Low Angle Hero, Flat Lay).`;

    const productBrief = `PRODUK YANG DIPROMOSIKAN:
- Nama Produk: "${productName}" ${brandName ? `(Brand: "${brandName}")` : ''}
- Deskripsi: "${productDescription || '-'}"
- Keunggulan Utama (USP): "${keySellingPoints || 'Kualitas terjamin, hasil nyata terbukti'}"`;

    const isHandsOnly =
      (cameraAngleStyle && (cameraAngleStyle.toLowerCase().includes('hand') || cameraAngleStyle.toLowerCase().includes('tangan'))) ||
      (persona && persona.toLowerCase().includes('tangan')) ||
      (preferredCameraAngles && preferredCameraAngles.some((a: string) => a.toLowerCase().includes('tangan') || a.toLowerCase().includes('hand')));

    const handsOnlyInstruction = isHandsOnly
      ? `\nATURAN MUTLAK KAMERA HANYA TANGAN SAJA (FACELESS UGC - 100% TANPA WAJAH):
- Kamera HANYA merekam gerakan tangan dan interaksi produk (unboxing, membuka segel, memegang kemasan, mengoleskan tekstur/swatch, menunjuk keranjang kuning).
- DILARANG KERAS memunculkan wajah, ekspresi muka, tatapan mata, atau kepala talent di dalam deskripsi adegan visualAction!
- Semua visualAction WAJIB diawali dengan aksi tangan (misal: "Tangan talent memegang...", "Kamera menyorot tangan talent yang sedang...", "Tangan talent mengoles tekstur produk di atas meja estetik...").`
      : '';

    const prompt = `Kamu adalah pakar Creative Director & Scriptwriter UGC (User-Generated Content) viral TikTok Shop, Shopee Video, dan Instagram Reels di Indonesia.
Buatkan storyboard UGC video lengkap yang terbukti memiliki Conversion Rate & Retention Rate tinggi untuk produk berikut:

${productBrief}
${handsOnlyInstruction}

Kategori Konten: ${category}
Target Audiens: ${targetAudience}
Persona Talent Kreator: "${persona}" (Sesuaikan gaya bicara VO, diksi gaul/santai/elegan, ekspresi visual, dan OOTD talent dengan persona "${persona}" ini secara mendalam agar sangat otentik!)
Tone of Voice: ${tone}
${cameraInstructions}
Target Durasi Total: ${targetDuration} detik
Jumlah Adegan yang Diminta: ${sceneCountText}
Platform: ${platform}
Bahasa: ${language === 'id' ? 'Bahasa Indonesia (Gaya bicara kreator UGC TikTok santai, luwes, natural, tidak kaku)' : 'English (Casual UGC creator style)'}

Syarat Wajib Format Storyboard:
1. Adegan 1 WAJIB HOOK 3 DETIK PERTAMA (Visual + Audio/SFX + On-Screen Text) yang bikin orang stop scrolling.
2. Adegan berikutnya mendemonstrasikan masalah / unboxing / tutorial / sebelum vs sesudah / manfaat nyata produk secara dinamis.
3. Adegan terakhir WAJIB Call To Action (CTA) yang jelas dan mendesak (misal: checkout di keranjang kuning mumpung promo diskon & gratis ongkir).
4. Sudut kamera (cameraAngle) di setiap adegan WAJIB disesuaikan dengan instruksi sudut kamera di atas.
5. Berikan Sound Effect (SFX) yang KAYA, BERVARIASI, dan SPESIFIK di setiap adegan (kombinasi ASMR nyata, meme viral, bass drop, swoosh, cash register, ding, crunch, water swirl, heartbeat). DILARANG menggunakan SFX yang sama berulang-ulang di tiap adegan.
6. Naskah Voiceover (VO) harus BERVARIASI SECARA EMOSIONAL dan intonasi alami: dari penasaran, heboh, curhat, hingga meyakinkan saat closing CTA. Sesuaikan panjang kata dengan durasi adegan agar tidak terburu-buru.
7. Pop-up Text harus huruf kapital mencolok & singkat.
8. Durasi setiap adegan (dalam integer detik) jika dijumlahkan WAJIB bernilai total mendekati ${targetDuration} detik. Jika durasi pendek (${targetDuration}s) dan adegan banyak (hingga 9 adegan), gunakan durasi fast-cut 1-2 detik per adegan.
9. BUATKAN AUTO CAPTION DENGAN HASHTAG: Tulis 1 caption postingan media sosial yang menarik dan menjual, LENGKAP dengan 2-4 hashtag trending.
   PENTING: TOTAL PANJANG KARAKTER CAPTION TERMASUK HASHTAG HARUS MAKSIMAL 150 KARAKTER!`;

    const config = {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: 'Judul storyboard yang menarik (e.g. Storyboard Before & After - Nama Produk)',
          },
          targetAudienceSummary: {
            type: Type.STRING,
            description: 'Ringkasan singkat target audiens',
          },
          hookTip: {
            type: Type.STRING,
            description: 'Alasan kenapa hook ini dipilih',
          },
          caption: {
            type: Type.STRING,
            description: 'Auto caption posting media sosial lengkap dengan 2-4 hashtag viral. PENTING: Total panjang karakter WAJIB MAKSIMAL 150 KARAKTER.',
          },
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                cameraAngle: {
                  type: Type.STRING,
                  description: 'Sudut kamera (e.g., Medium Shot, Close-up, POV / Handheld, Wide Shot, Extreme Close-up)',
                },
                visualAction: {
                  type: Type.STRING,
                  description: 'Deskripsi aksi fisik, ekspresi wajah, dan pergerakan objek di depan kamera.',
                },
                popupText: {
                  type: Type.STRING,
                  description: 'Teks pop-up overlay di layar video (huruf kapital tebal).',
                },
                soundEffect: {
                  type: Type.STRING,
                  description: 'Efek suara / SFX (e.g., Phone ring & sigh, Swoosh, Cha-ching, Vine boom, Ting).',
                },
                dialogVO: {
                  type: Type.STRING,
                  description: 'Dialog yang diucapkan talent atau suara Voice Over (VO).',
                },
                notesMood: {
                  type: Type.STRING,
                  description: 'Catatan teknis, gaya animasi teks (Chat Bubble/Bouncy), pencahayaan atau mood.',
                },
                duration: {
                  type: Type.INTEGER,
                  description: 'Durasi adegan dalam detik (integer, misal 1, 2, 3, 4, 5).',
                },
              },
              required: [
                'cameraAngle',
                'visualAction',
                'popupText',
                'soundEffect',
                'dialogVO',
                'notesMood',
                'duration',
              ],
            },
          },
        },
        required: ['title', 'scenes'],
      },
    };

    const rawText = await generateWithFallback(
      prompt,
      config,
      'You are an elite UGC video strategist and storyboard scriptwriter. Always return strictly valid JSON matching the schema. Keep caption under 150 characters.'
    );

    const parsedData = parseSafeJson<any>(rawText);
    if (parsedData && Array.isArray(parsedData.scenes) && parsedData.scenes.length > 0) {
      if (!parsedData.caption || typeof parsedData.caption !== 'string') {
        parsedData.caption = formatShortCaption(productName, category, keySellingPoints);
      } else if (parsedData.caption.length > 150) {
        parsedData.caption = parsedData.caption.slice(0, 147) + '...';
      }

      return NextResponse.json({
        success: true,
        data: parsedData,
        source: 'gemini',
      });
    }

    // High quality offline fallback generator
    const fallbackData = generateRichFallback(
      category,
      productName,
      targetDuration,
      targetAudience,
      keySellingPoints,
      targetSceneCount,
      cameraAngleStyle,
      preferredCameraAngles
    );

    return NextResponse.json({
      success: true,
      data: fallbackData,
      source: 'smart-template',
    });
  } catch (error: any) {
    console.error('Server error in generate-storyboard:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
