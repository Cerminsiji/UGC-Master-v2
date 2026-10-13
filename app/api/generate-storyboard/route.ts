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
      referenceImage = '',
      productDescription = '',
      targetAudience = 'Pengguna TikTok / Reels usia 18-35 tahun',
      keySellingPoints = '',
      persona = 'Wanita Muda / Gen Z',
      tone = 'Santai, Mengalir & Natural (Teman Curhat)',
      cameraAngleStyle = 'Dinamis & Multi-Angle (Viral Fast-Cut)',
      preferredCameraAngles = [],
      targetDuration = 30,
      targetSceneCount = 0,
      language = 'id',
    } = body;

    const rawPlatform = body.targetPlatform || body.platform || 'TikTok Shop';
    const platform = typeof rawPlatform === 'string' ? rawPlatform.trim() : 'TikTok Shop';
    const isShopee = platform.toLowerCase().includes('shopee');
    const isTikTok = platform.toLowerCase().includes('tiktok');

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
- Keunggulan Utama (USP): "${keySellingPoints || 'Kualitas terjamin, hasil nyata terbukti'}"
- Referensi Gambar Produk (Google Flow Reference Image): "${referenceImage || `Visual kemasan dan fisik asli produk ${productName}`}"`;

    const isHandsOnly =
      (cameraAngleStyle && (cameraAngleStyle.toLowerCase().includes('hand') || cameraAngleStyle.toLowerCase().includes('tangan'))) ||
      (persona && persona.toLowerCase().includes('tangan')) ||
      (preferredCameraAngles && preferredCameraAngles.some((a: string) => a.toLowerCase().includes('tangan') || a.toLowerCase().includes('hand')));

    const handsOnlyInstruction = isHandsOnly
      ? `\nATURAN MUTLAK KAMERA HANYA TANGAN SAJA (FACELESS UGC - 100% TANPA WAJAH):
- Kamera HANYA merekam gerakan tangan dan interaksi produk (unboxing, membuka segel, memegang kemasan, mengoleskan tekstur/swatch, menunjuk ${isShopee ? 'keranjang oren' : (isTikTok ? 'keranjang kuning atau keranjang di bawah' : 'keranjang di bawah')}).
- DILARANG KERAS memunculkan wajah, ekspresi muka, tatapan mata, atau kepala talent di dalam deskripsi adegan visualAction!
- Semua visualAction WAJIB diawali dengan aksi tangan (misal: "Tangan talent memegang...", "Kamera menyorot tangan talent yang sedang...", "Tangan talent mengoles tekstur produk di atas meja estetik...").`
      : '';

    const platformCtaRule = isShopee
      ? `\n=== ATURAN MUTLAK CTA & NARASI PLATFORM SHOPEE (ANTI KERANJANG KUNING) ===
- Target Platform saat ini: SHOPEE (${platform}).
- WAJIB gunakan istilah "Keranjang Oren" (Orange Cart) ATAU kalimat global seperti "Klik keranjang di bawah" / "keranjang di bawah".
- DILARANG KERAS menyebut atau menulis "keranjang kuning"! Jika target Shopee, sebutan kuning adalah kesalahan fatal.
- Voiceover (dialogVO) adegan penutup / CTA: "Langsung checkout di keranjang oren ya!", "Mumpung lagi promo & free ongkir, klik keranjang oren sekarang!", atau "Langsung klik keranjang di bawah ya!"
- Floating / Pop-up Text (popupText): "KLIK KERANJANG OREN SEKARANG! 🛒👇", "CEK KERANJANG OREN DI BAWAH! 🛒👇", atau "KLIK KERANJANG DI BAWAH! 🛒👇"
- Narasi Aksi Visual (visualAction): Talent menunjuk ke arah pojok kiri bawah ke arah keranjang oren Shopee / menunjuk keranjang di bawah.`
      : (isTikTok
        ? `\n=== ATURAN CTA & NARASI PLATFORM TIKTOK SHOP ===
- Target Platform saat ini: TIKTOK SHOP (${platform}).
- Gunakan istilah "Keranjang Kuning" ATAU kalimat global seperti "Klik keranjang di bawah" / "Cek keranjang di bawah sekarang".
- Voiceover (dialogVO) CTA: "Langsung klik keranjang kuning ya!" atau "Langsung klik keranjang di bawah ya!"
- Floating / Pop-up Text (popupText): "CEK KERANJANG KUNING SEKARANG! 🛒👇" atau "KLIK KERANJANG DI BAWAH! 🛒👇"
- Narasi Aksi Visual (visualAction): Talent menunjuk ke arah keranjang kuning / keranjang di bawah.`
        : `\n=== ATURAN CTA & NARASI PLATFORM GLOBAL (${platform}) ===
- Target Platform saat ini: ${platform}.
- WAJIB gunakan kalimat global / universal: "Klik keranjang di bawah", "Cek keranjang di bawah", "Checkout lewat keranjang di bawah ya!"
- DILARANG menyebut keranjang kuning untuk platform ini.
- Floating / Pop-up Text (popupText): "KLIK KERANJANG DI BAWAH SEKARANG! 🛒👇"
- Narasi Aksi Visual (visualAction): Talent menunjuk ke arah keranjang di bawah.`);

    const googleFlowReferenceInstruction = `
=== ATURAN MUTLAK KEPATUHAN REFERENSI IMAGE PADA GOOGLE FLOW VIDEO UGC ===
Format ini WAJIB kompatibel dengan pipeline Google Flow Video UGC (Image-to-Video Workflow).
Referensi Gambar Produk: "${referenceImage || `Kemasan dan visual asli produk ${productName}`}".

SETIAP ADEGAN WAJIB:
1. Selalu mengikuti referensi image (Product & Character Consistency): Bentuk kemasan, warna brand, proporsi kemasan, detail label, tekstur produk, dan lighting harus selalu konsisten dengan referensi image produk di atas tanpa distorsi visual.
2. Menghasilkan 'googleFlowPrompt' (Prompt video AI untuk Google Flow / Veo / Runway / Kling):
   Format prompt Google Flow:
   "[Image 1 Reference: ${productName}] {Shot Type & Camera Motion} - {Subject Action & Talent Expression} - {Product Physical Interaction} - {Lighting & Background Environment} - {On-Screen Pop-up Text Overlay: popupText} - {Aesthetic Style: Photorealistic 9:16 vertical smartphone UGC video, raw camera sensor texture, crisp focus, 4K 60fps, no morphing, no artifacts}"
3. Menghasilkan 'imageReferenceNote':
   Wajib persis bernilai: "Pastikan Produk sesuai Gambar referensi yang sudah di attached"
   Agar setiap adegan selalu mengunci konsistensi gambar referensi produk di pipeline Google Flow tanpa kesalahan.
4. Menghasilkan 'popupText' (Teks Pop-up Layar):
   Wajib SELALU MUNCUL di dalam JSON pada setiap adegan, berupa stiker teks pop-up kapital tebal yang mencolok dan selaras dengan perintah overlay teks pada Google Flow.

=== ATURAN BEBAS TYPO & KESALAHAN EJAAN (ZERO TYPO DISCIPLINE) ===
- DILARANG KERAS ADA TYPO ATAU SALAH KETIK pada dialogVO, popupText, visualAction, soundEffect, notesMood, maupun googleFlowPrompt!
- Gunakan tata bahasa Indonesia yang rapi, natural, dan ejaan yang tepat (PUEBI/EYD) untuk narasi, serta diksi gaul UGC yang tepat tanpa singkatan rusak.
- Jangan ada huruf tertinggal atau dobel yang tidak disengaja.`;

    const prompt = `Kamu adalah pakar Creative Director & Scriptwriter UGC (User-Generated Content) viral TikTok Shop, Shopee Video, dan Instagram Reels di Indonesia.
Buatkan storyboard UGC video lengkap yang terbukti memiliki Conversion Rate & Retention Rate tinggi untuk produk berikut:

${productBrief}
${googleFlowReferenceInstruction}
${handsOnlyInstruction}
${platformCtaRule}

Kategori Konten: ${category}
Target Audiens: ${targetAudience}
Persona Talent Kreator: "${persona}" (Sesuaikan gaya bicara VO, diksi gaul/santai/elegan, ekspresi visual, dan OOTD talent dengan persona "${persona}" ini secara mendalam agar sangat otentik!)
Tone of Voice: ${tone}
${cameraInstructions}
Target Durasi Total: ${targetDuration} detik
Jumlah Adegan yang Diminta: ${sceneCountText}
Platform: ${platform}
Bahasa: ${language === 'id' ? 'Bahasa Indonesia (Gaya bicara kreator UGC TikTok santai, luwes, natural, tidak kaku, tanpa typo)' : 'English (Casual UGC creator style, zero typos)'}

Syarat Wajib Format Storyboard:
1. Adegan 1 WAJIB HOOK 3 DETIK PERTAMA (Visual + Audio/SFX + On-Screen Text) yang bikin orang stop scrolling.
2. Adegan berikutnya mendemonstrasikan masalah / unboxing / tutorial / sebelum vs sesudah / manfaat nyata produk secara dinamis.
3. Adegan terakhir WAJIB Call To Action (CTA) yang jelas dan mendesak: ${isShopee ? 'checkout di keranjang oren (BUKAN keranjang kuning!) atau gunakan kalimat global "klik keranjang di bawah"' : (isTikTok ? 'checkout di keranjang kuning atau klik keranjang di bawah' : 'checkout lewat keranjang di bawah')} mumpung promo diskon & gratis ongkir.
4. Sudut kamera (cameraAngle) di setiap adegan WAJIB disesuaikan dengan instruksi sudut kamera di atas.
5. Berikan Sound Effect (SFX) yang KAYA, BERVARIASI, dan SPESIFIK di setiap adegan (kombinasi ASMR nyata, meme viral, bass drop, swoosh, cash register, ding, crunch, water swirl, heartbeat). DILARANG menggunakan SFX yang sama berulang-ulang di tiap adegan.
6. Naskah Voiceover (VO) harus BERVARIASI SECARA EMOSIONAL dan intonasi alami: dari penasaran, heboh, curhat, hingga meyakinkan saat closing CTA. Sesuaikan panjang kata dengan durasi adegan agar tidak terburu-buru.
7. Pop-up Text (popupText) WAJIB SELALU TERISI di setiap adegan berupa huruf kapital mencolok & singkat, dan sinkron dengan overlay pada prompt Google Flow.
8. Durasi setiap adegan (dalam integer detik) jika dijumlahkan WAJIB bernilai total mendekati ${targetDuration} detik. Jika durasi pendek (${targetDuration}s) dan adegan banyak (hingga 9 adegan), gunakan durasi fast-cut 1-2 detik per adegan.
9. BUATKAN AUTO CAPTION DENGAN HASHTAG: Tulis 1 caption postingan media sosial yang menarik dan menjual (sesuaikan CTA: ${isShopee ? 'keranjang oren / klik keranjang di bawah' : (isTikTok ? 'keranjang kuning / klik keranjang di bawah' : 'klik keranjang di bawah')}), LENGKAP dengan 2-4 hashtag trending (${isShopee ? '#ShopeeVideo #ShopeeHaul' : '#TikTokShop #fyp'}).
   PENTING: TOTAL PANJANG KARAKTER CAPTION TERMASUK HASHTAG HARUS MAKSIMAL 150 KARAKTER!
10. SETIAP ADEGAN WAJIB menyertakan googleFlowPrompt (mengacu ketat ke referensi image [Image 1 Reference: ProductName] serta On-Screen Pop-up Text Overlay) dan imageReferenceNote bernilai persis: "Pastikan Produk sesuai Gambar referensi yang sudah di attached"! Bebas dari segala typo.`;

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
                  description: 'Dialog yang diucapkan talent atau suara Voice Over (VO). Bebas typo.',
                },
                notesMood: {
                  type: Type.STRING,
                  description: 'Catatan teknis, gaya animasi teks (Chat Bubble/Bouncy), pencahayaan atau mood.',
                },
                duration: {
                  type: Type.INTEGER,
                  description: 'Durasi adegan dalam detik (integer, misal 1, 2, 3, 4, 5).',
                },
                googleFlowPrompt: {
                  type: Type.STRING,
                  description: 'Prompt video AI untuk Google Flow / Veo / Runway / Kling yang mengikuti referensi image secara ketat ([Image 1 Reference: ProductName]), dengan camera motion, action, lighting, 9:16 vertical.',
                },
                imageReferenceNote: {
                  type: Type.STRING,
                  description: 'Wajib bernilai persis: "Pastikan Produk sesuai Gambar referensi yang sudah di attached"',
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
                'googleFlowPrompt',
                'imageReferenceNote',
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
      'You are an elite UGC video strategist and storyboard scriptwriter. Always return strictly valid JSON matching the schema. Follow reference image consistency on Google Flow and ensure zero typos in all languages.'
    );

    const parsedData = parseSafeJson<any>(rawText);
    if (parsedData && Array.isArray(parsedData.scenes) && parsedData.scenes.length > 0) {
      if (!parsedData.caption || typeof parsedData.caption !== 'string') {
        parsedData.caption = formatShortCaption(productName, category, keySellingPoints, platform);
      } else if (parsedData.caption.length > 150) {
        parsedData.caption = parsedData.caption.slice(0, 147) + '...';
      }

      // Ensure every scene has popupText, googleFlowPrompt & imageReferenceNote in JSON
      parsedData.scenes = parsedData.scenes.map((sc: any, idx: number) => {
        let popupText =
          sc.popupText && typeof sc.popupText === 'string' && sc.popupText.trim() && sc.popupText.trim() !== '-'
            ? sc.popupText.trim()
            : '';

        // If popupText is missing or empty, extract from googleFlowPrompt if available, or generate a punchy contextual hook/benefit
        if (!popupText) {
          const overlayMatch = sc.googleFlowPrompt && typeof sc.googleFlowPrompt === 'string'
            ? sc.googleFlowPrompt.match(/On-Screen Pop-up Text Overlay:\s*["']?([^"'\-\}\]]+)["']?/i) ||
              sc.googleFlowPrompt.match(/Text Overlay:\s*["']?([^"'\-\}\]]+)["']?/i) ||
              sc.googleFlowPrompt.match(/popup text:\s*["']?([^"'\-\}\]]+)["']?/i)
            : null;
          if (overlayMatch && overlayMatch[1] && overlayMatch[1].trim()) {
            popupText = overlayMatch[1].trim();
          } else {
            popupText =
              idx === 0
                ? 'JANGAN SKIP DULU! 🔥'
                : idx === parsedData.scenes.length - 1
                ? (isShopee ? 'KLIK KERANJANG OREN DI BAWAH! 🛒👇' : (isTikTok ? 'CEK KERANJANG KUNING SEKARANG! 🛒👇' : 'KLIK KERANJANG DI BAWAH SEKARANG! 🛒👇'))
                : `SOLUSI: ${productName.toUpperCase()}`;
          }
        }

        const visual = sc.visualAction || 'Kreator memperlihatkan manfaat produk secara otentik.';
        const angle = sc.cameraAngle || 'Medium Shot';

        let flowPrompt = sc.googleFlowPrompt && typeof sc.googleFlowPrompt === 'string' ? sc.googleFlowPrompt.trim() : '';
        if (!flowPrompt) {
          flowPrompt = `[Image 1 Reference: ${productName}] Scene ${idx + 1} (${angle}): ${visual} - On-Screen Pop-up Text Overlay: "${popupText}" - Follow physical packaging and branding in reference image, vertical 9:16 UGC smartphone camera, photorealistic 4k.`;
        } else {
          // Guarantee that Google Flow command always includes On-Screen Pop-up Text Overlay matching popupText
          const hasOverlay = /on-screen pop-up text overlay|text overlay|popup text/i.test(flowPrompt);
          if (!hasOverlay) {
            flowPrompt = `${flowPrompt} - On-Screen Pop-up Text Overlay: "${popupText}"`;
          }
        }

        return {
          ...sc,
          cameraAngle: angle,
          visualAction: visual,
          popupText,
          googleFlowPrompt: flowPrompt,
          imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
        };
      });

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
      preferredCameraAngles,
      referenceImage,
      platform
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
