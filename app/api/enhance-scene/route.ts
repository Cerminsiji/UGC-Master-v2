import { NextRequest, NextResponse } from 'next/server';
import { Type } from '@google/genai';
import { generateWithFallback, parseSafeJson } from '@/lib/gemini-ugc';

async function handleEnhanceSceneRequest(body: any) {
  try {
    const {
      scene = {},
      instruction = 'make it more viral and catchy',
      category = 'UGC',
      productName = '',
      cameraAngleStyle = ''
    } = body || {};

    const productInstruction = productName
      ? `Produk: "${productName}". Pastikan aksi visual dan dialog tetap relevan dengan produk ini.`
      : '';

    const angleInstruction = cameraAngleStyle
      ? `Gaya kamera yang diinginkan: "${cameraAngleStyle}". Pastikan cameraAngle adegan ini jelas dan dinamis.`
      : '';

    const rawPlatform = body.targetPlatform || body.platform || '';
    const isShopee = String(rawPlatform).toLowerCase().includes('shopee') || instruction.toLowerCase().includes('shopee');
    const platformCtaRule = isShopee
      ? `ATURAN KHUSUS PLATFORM SHOPEE: Jika adegan ini berisi Call-To-Action (CTA) / ajakan beli, WAJIB gunakan "Keranjang Oren" atau kalimat global "Klik keranjang di bawah". DILARANG KERAS menggunakan istilah "keranjang kuning"!`
      : `ATURAN CTA: Jika adegan ini berisi Call-To-Action (CTA), gunakan ajakan yang tepat atau kalimat global "Klik keranjang di bawah".`;

    const prompt = `Kamu adalah Creative UGC Director profesional. Tingkatkan adegan storyboard video berikut agar lebih viral, natural, dan memicu konversi tinggi.
Instruksi perbaikan: "${instruction}"
Kategori video: "${category}"
${productInstruction}
${angleInstruction}
${platformCtaRule}

=== MANDAT MUTLAK HUKUM FISIKA, GERAKAN REALISTIS, & PENCAHAYAAN KONSISTEN ===
Adegan yang ditingkatkan WAJIB mematuhi hukum fisika nyata:
1. Gravitasi, massa benda, dan inersia nyata: produk memiliki bobot, tidak melayang tanpa tumpuan.
2. Solid contact mechanics: tangan/jari tidak boleh menembus dinding produk (anti-clipping), kontak genggaman natural dengan 5 jari normal.
3. Gerakan realistis: akselerasi dan deselerasi biomekanis alami, tanpa morphing atau distorsi objek.
4. Pencahayaan konsisten: sumber cahaya tunggal terpadu dengan bayangan kontak (cast shadows) yang nyata dan spekular highlight konsisten.

Adegan saat ini:
- Sudut kamera: ${scene.cameraAngle || 'Medium Shot'}
- Aksi visual: ${scene.visualAction || ''}
- Teks pop-up layar: ${scene.popupText || ''}
- Efek suara (SFX): ${scene.soundEffect || ''}
- Dialog / VO: ${scene.dialogVO || ''}
- Catatan / Mood: ${scene.notesMood || ''}
- Durasi: ${scene.duration || 3} detik

Tulis ulang adegan ini dalam format JSON yang ditingkatkan. Pastikan aksi visual (visualAction) mengutamakan fisika autentik, gerak alami, dan pencahayaan konsisten.`;

    const config = {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          cameraAngle: { type: Type.STRING },
          visualAction: {
            type: Type.STRING,
            description: 'Deskripsi aksi fisik yang patuh hukum fisika, bobot nyata, solid contact tanpa clipping, gerak biomekanis natural, dan pencahayaan konsisten.',
          },
          popupText: { type: Type.STRING },
          soundEffect: { type: Type.STRING },
          dialogVO: { type: Type.STRING },
          notesMood: { type: Type.STRING },
          duration: { type: Type.INTEGER },
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
    };

    const rawText = await generateWithFallback(
      prompt,
      config,
      'You are a professional UGC Creative Director. Strictly mandate adherence to physical laws, realistic motion, and consistent lighting in all enhanced visual action scenes and video prompts. Never allow floating objects, clipping/pass-through hands, or morphing glitches.'
    );
    const parsedScene = parseSafeJson<any>(rawText);

    const physicsTokens = 'strict physical laws, realistic mass inertia, biomechanical constraint adherence, solid-contact gravity without clipping, consistent directional lighting with matching cast shadows, authentic camera motion, zero floaty artifacts, zero morphing, photorealistic 9:16 vertical 4k 60fps';

    if (parsedScene && parsedScene.visualAction) {
      const popupText = parsedScene.popupText || scene.popupText || 'RAHASIA VIRAL TERUNGKAP! ✨';
      let flowPrompt = scene.googleFlowPrompt || '';
      if (!flowPrompt) {
        flowPrompt = `[Image 1 Reference: ${productName || 'Produk'}] (${parsedScene.cameraAngle || 'Medium Shot'}): ${parsedScene.visualAction} - On-Screen Pop-up Text Overlay: "${popupText}" - Follow reference image packaging, ${physicsTokens}.`;
      } else {
        if (!/on-screen pop-up text overlay|text overlay|popup text/i.test(flowPrompt)) {
          flowPrompt = `${flowPrompt} - On-Screen Pop-up Text Overlay: "${popupText}"`;
        }
        if (!/realistic mass inertia/i.test(flowPrompt) || !/biomechanical constraint adherence/i.test(flowPrompt)) {
          flowPrompt = `${flowPrompt} - ${physicsTokens}`;
        }
      }

      return NextResponse.json({
        success: true,
        scene: {
          ...parsedScene,
          popupText,
          googleFlowPrompt: flowPrompt,
          imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
        },
      });
    }

    // Rule-based enhancement fallback
    const fallbackPopupText = scene.popupText ? `${scene.popupText.toUpperCase()} 🔥` : 'RAHASIA VIRAL TERUNGKAP! ✨';
    let fallbackFlowPrompt = scene.googleFlowPrompt || '';
    if (!fallbackFlowPrompt) {
      fallbackFlowPrompt = `[Image 1 Reference: ${productName || 'Produk'}] (${scene.cameraAngle || 'Medium Shot'}): ${scene.visualAction || 'Visual'} - On-Screen Pop-up Text Overlay: "${fallbackPopupText}" - Follow reference image, ${physicsTokens}.`;
    } else {
      if (!/on-screen pop-up text overlay|text overlay|popup text/i.test(fallbackFlowPrompt)) {
        fallbackFlowPrompt = `${fallbackFlowPrompt} - On-Screen Pop-up Text Overlay: "${fallbackPopupText}"`;
      }
      if (!/physical laws|gravity|consistent.*light/i.test(fallbackFlowPrompt)) {
        fallbackFlowPrompt = `${fallbackFlowPrompt} - ${physicsTokens}`;
      }
    }

    return NextResponse.json({
      success: true,
      scene: {
        cameraAngle: scene.cameraAngle || 'Close-up Dynamic',
        visualAction: scene.visualAction
          ? `${scene.visualAction} (Pegang produk dengan bobot fisik nyata, kontak tangan solid tanpa tembus, pencahayaan terpadu konsisten)`
          : 'Kreator memegang produk dengan kontak fisik nyata, bobot kemasan terdistribusi alami di telapak tangan di bawah pencahayaan konsisten.',
        popupText: fallbackPopupText,
        soundEffect: scene.soundEffect ? `${scene.soundEffect} + Bass boost` : 'Swoosh & Cha-ching',
        dialogVO: scene.dialogVO
          ? `${scene.dialogVO} Beneran gak nyangka sebagus ini!`
          : 'Gak nyangka nemu barang sebagus ini!',
        notesMood: scene.notesMood || 'Gaya teks: Dynamic Bouncy. Pencahayaan terarah konsisten dengan bayangan kontak realistis.',
        duration: Number(scene.duration) || 3,
        googleFlowPrompt: fallbackFlowPrompt,
        imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    return await handleEnhanceSceneRequest(body);
  } catch (error: any) {
    return await handleEnhanceSceneRequest({});
  }
}

export async function GET(req: NextRequest) {
  try {
    const payloadParam = req.nextUrl.searchParams.get('payload');
    const body = payloadParam ? JSON.parse(payloadParam) : {};
    return await handleEnhanceSceneRequest(body);
  } catch (error: any) {
    return await handleEnhanceSceneRequest({});
  }
}

