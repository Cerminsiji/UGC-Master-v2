import { NextRequest, NextResponse } from 'next/server';
import { Type } from '@google/genai';
import { generateWithFallback, parseSafeJson } from '@/lib/gemini-ugc';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      scene,
      instruction = 'make it more viral and catchy',
      category = 'UGC',
      productName = '',
      cameraAngleStyle = ''
    } = body;

    const productInstruction = productName
      ? `Produk: "${productName}". Pastikan aksi visual dan dialog tetap relevan dengan produk ini.`
      : '';

    const angleInstruction = cameraAngleStyle
      ? `Gaya kamera yang diinginkan: "${cameraAngleStyle}". Pastikan cameraAngle adegan ini jelas dan dinamis.`
      : '';

    const prompt = `Kamu adalah Creative UGC Director profesional. Tingkatkan adegan storyboard video berikut agar lebih viral, natural, dan memicu konversi tinggi.
Instruksi perbaikan: "${instruction}"
Kategori video: "${category}"
${productInstruction}
${angleInstruction}

Adegan saat ini:
- Sudut kamera: ${scene.cameraAngle || 'Medium Shot'}
- Aksi visual: ${scene.visualAction || ''}
- Teks pop-up layar: ${scene.popupText || ''}
- Efek suara (SFX): ${scene.soundEffect || ''}
- Dialog / VO: ${scene.dialogVO || ''}
- Catatan / Mood: ${scene.notesMood || ''}
- Durasi: ${scene.duration || 3} detik

Tulis ulang adegan ini dalam format JSON yang ditingkatkan. Berikan efek suara SFX yang spesifik dan sudut kamera yang terdefinisi dengan jelas.`;

    const config = {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          cameraAngle: { type: Type.STRING },
          visualAction: { type: Type.STRING },
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

    const rawText = await generateWithFallback(prompt, config);
    const parsedScene = parseSafeJson<any>(rawText);

    if (parsedScene && parsedScene.visualAction) {
      return NextResponse.json({ success: true, scene: parsedScene });
    }

    // Rule-based enhancement fallback
    return NextResponse.json({
      success: true,
      scene: {
        cameraAngle: scene.cameraAngle || 'Close-up Dynamic',
        visualAction: scene.visualAction
          ? `${scene.visualAction} (Gerakan tangan dipertegas, mimik ekspresif)`
          : 'Kreator menunjukkan produk dengan gesture ekspresif.',
        popupText: scene.popupText ? `${scene.popupText.toUpperCase()} 🔥` : 'RAHASIA VIRAL TERUNGKAP! ✨',
        soundEffect: scene.soundEffect ? `${scene.soundEffect} + Bass boost` : 'Swoosh & Cha-ching',
        dialogVO: scene.dialogVO
          ? `${scene.dialogVO} Beneran gak nyangka sebagus ini!`
          : 'Gak nyangka nemu barang sebagus ini!',
        notesMood: scene.notesMood || 'Gaya teks: Dynamic Bouncy. Pencahayaan terang kontras.',
        duration: Number(scene.duration) || 3,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
