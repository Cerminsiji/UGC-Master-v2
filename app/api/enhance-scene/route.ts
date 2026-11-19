import { NextRequest, NextResponse } from 'next/server';
import { Type } from '@google/genai';
import { generateWithFallback, parseSafeJson } from '@/lib/gemini-ugc';

interface SceneSummaryInput {
  order?: number;
  cameraAngle?: string;
  visualAction?: string;
  popupText?: string;
  dialogVO?: string;
  soundEffect?: string;
  notesMood?: string;
  duration?: number;
}

async function handleEnhanceSceneRequest(body: any) {
  try {
    const {
      scene = {},
      sceneIndex = -1,
      allScenes = [],
      instruction = 'make it more viral, natural, varied, and strictly connected to surrounding scenes',
      category = 'UGC',
      productName = '',
      productDescription = '',
      keySellingPoints = '',
      persona = '',
      tone = '',
      cameraAngleStyle = '',
      targetPlatform = '',
      targetAudience = '',
      physicsConsistencyCheck = true,
    } = body || {};

    const enforcePhysics = physicsConsistencyCheck !== false;
    const normalizedScenes: SceneSummaryInput[] = Array.isArray(allScenes) ? allScenes : [];
    const resolvedIndex =
      typeof sceneIndex === 'number' && sceneIndex >= 0
        ? sceneIndex
        : Math.max(
            0,
            normalizedScenes.findIndex((s) => Number(s.order) === Number(scene.order))
          );

    const prevScene: SceneSummaryInput | null =
      resolvedIndex > 0 && normalizedScenes[resolvedIndex - 1]
        ? normalizedScenes[resolvedIndex - 1]
        : null;
    const nextScene: SceneSummaryInput | null =
      resolvedIndex >= 0 && resolvedIndex < normalizedScenes.length - 1 && normalizedScenes[resolvedIndex + 1]
        ? normalizedScenes[resolvedIndex + 1]
        : null;
    const totalCount = normalizedScenes.length || 1;
    const scenePositionLabel = `Adegan ${resolvedIndex >= 0 ? resolvedIndex + 1 : scene.order || 1} dari ${totalCount}`;

    const fullTimelineContext =
      normalizedScenes.length > 0
        ? normalizedScenes
            .map((s, idx) => {
              const marker = idx === resolvedIndex ? '  >>> [TARGET YANG SEDANG DIPOLES] <<<' : '';
              return `Adegan ${idx + 1} (${s.duration || 3}s | ${s.cameraAngle || 'Shot'})${marker}:
  - Visual: ${s.visualAction || '-'}
  - Pop-up: ${s.popupText || '-'}
  - VO/Dialog: "${s.dialogVO || '-'}"
  - SFX: ${s.soundEffect || '-'}`;
            })
            .join('\n\n')
        : `Adegan saat ini (${scene.duration || 3}s | ${scene.cameraAngle || 'Medium Shot'}):
  - Visual: ${scene.visualAction || '-'}
  - Pop-up: ${scene.popupText || '-'}
  - VO/Dialog: "${scene.dialogVO || '-'}"
  - SFX: ${scene.soundEffect || '-'}`;

    const rawPlatform = targetPlatform || body.platform || '';
    const isShopee = String(rawPlatform).toLowerCase().includes('shopee') || instruction.toLowerCase().includes('shopee');
    const isTikTok = String(rawPlatform).toLowerCase().includes('tiktok');
    const platformCtaRule = isShopee
      ? `ATURAN PLATFORM SHOPEE: Jika adegan ini (terutama adegan terakhir) berisi CTA, WAJIB gunakan "Keranjang Oren" atau "Klik keranjang di bawah". DILARANG KERAS menulis "keranjang kuning"!`
      : isTikTok
      ? `ATURAN PLATFORM TIKTOK SHOP: Jika adegan ini berisi CTA, gunakan "Keranjang Kuning" atau "Klik keranjang di bawah".`
      : `ATURAN CTA: Jika adegan ini berisi CTA, gunakan kalimat universal "Klik keranjang di bawah".`;

    const continuityMandate = `
=== KONTEKS ALUR STORYBOARD LENGKAP (${scenePositionLabel}) ===
${fullTimelineContext}

ATURAN WAJIB KESINAMBUNGAN ANTAR-ADEGAN (SCENE-TO-SCENE CONTINUITY):
1. Kamu sedang memoles **${scenePositionLabel}**. Hasil polesan WAJIB nyambung mulus dengan seluruh alur cerita di atas!
2. ${
      prevScene
        ? `SAMBUNGKAN DARI ADEGAN SEBELUMNYA (Adegan ${resolvedIndex}): Adegan sebelumnya membahas "${prevScene.dialogVO || prevScene.visualAction}". Kalimat VO dan aksi visual adegan ini harus terasa sebagai kelanjutan alami (bridge kalimat mengalir, bukan mulai dari nol) dan JANGAN mengulang kata/poin yang sudah diucapkan di adegan sebelumnya!`
        : 'Ini adalah ADEGAN PEMBUKA (Hook): buat pancingan 3 detik pertama yang segar, non-klise (tanpa "Stop scrolling" / "3 alasan"), dan mengantar penonton ke Adegan 2.'
    }
3. ${
      nextScene
        ? `ANTARKAN KE ADEGAN BERIKUTNYA (Adegan ${resolvedIndex + 2}): Adegan sesudahnya berbunyi "${nextScene.dialogVO || nextScene.visualAction}". Akhiri adegan ini dengan transisi visual & jembatan narasi yang mengantar masuk ke adegan berikutnya secara logis!`
        : 'Ini adalah ADEGAN PENUTUP (Closing/CTA): simpulkan pembuktian dari adegan-adegan sebelumnya dan arahkan penonton untuk checkout sekarang.'
    }
4. ANTI-MONOTON SUDUT KAMERA & POP-UP:
   - Gunakan sudut kamera yang BERBEDA dan kontras dari ${prevScene ? `"${prevScene.cameraAngle}"` : 'adegan lain'} maupun ${nextScene ? `"${nextScene.cameraAngle}"` : 'adegan akhir'} agar potongan visual terasa dinamis!
   - Buat popupText yang singkat, punchy, variatif, dan tidak mengulang teks pop-up adegan lain.
   - Variasikan gaya bahasa dialogVO agar selaras dengan persona "${persona || 'Kreator UGC Natural'}" dan tone "${tone || 'Santai & Relatable'}", menggunakan Bahasa Indonesia percakapan sehari-hari yang natural (bukan bahasa robot/iklan kaku).`;

    const physicsMandate = enforcePhysics
      ? `
=== MANDAT HUKUM FISIKA, GERAKAN REALISTIS & PENCAHAYAAN KONSISTEN ===
- Gravitasi, massa benda, dan inersia nyata (realistic mass inertia): produk punya bobot dan tidak melayang.
- Biomechanical constraint adherence: genggaman 5 jari normal, kontak fisik solid tanpa clipping/tembus.
- Pencahayaan arah tunggal konsisten dengan bayangan jatuh (cast shadows) serasi dan zero morphing.`
      : '';

    const prompt = `Kamu adalah Creative UGC Director profesional. Tingkatkan **${scenePositionLabel}** pada storyboard berikut agar jauh lebih hidup, bervariasi, tidak monoton, dan menyatu mulus dengan seluruh adegan lainnya.

DETAIL PRODUK & KONTEKS:
- Nama Produk: "${productName || 'Produk Unggulan'}"
- Deskripsi Produk: "${productDescription || '-'}"
- Keunggulan Utama (USP): "${keySellingPoints || '-'}"
- Kategori Konten: "${category}"
- Persona Talent: "${persona || 'Kreator UGC Natural'}"
- Tone Suara / Gaya VO: "${tone || 'Santai, Mengalir & Natural'}"
- Target Audiens: "${targetAudience || 'Pengguna media sosial Indonesia'}"
- Gaya Kamera Utama: "${cameraAngleStyle || 'Dinamis & Multi-Angle'}"
- Instruksi Tambahan: "${instruction}"
${platformCtaRule}
${continuityMandate}
${physicsMandate}

Data awal adegan yang akan dipoles (${scenePositionLabel}):
- Sudut kamera: ${scene.cameraAngle || 'Medium Shot'}
- Aksi visual: ${scene.visualAction || ''}
- Teks pop-up: ${scene.popupText || ''}
- Efek suara (SFX): ${scene.soundEffect || ''}
- Dialog / VO: ${scene.dialogVO || ''}
- Catatan / Mood: ${scene.notesMood || ''}
- Durasi: ${scene.duration || 3} detik

Tulis ulang adegan ini dalam format JSON yang ditingkatkan dan menyatu kuat dengan konteks seluruh storyboard.`;

    const config = {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          cameraAngle: { type: Type.STRING },
          visualAction: {
            type: Type.STRING,
            description:
              'Deskripsi aksi fisik yang menyambung mulus dengan adegan sebelum/sesudahnya, patuh hukum fisika nyata, kontak solid tanpa clipping, dan pencahayaan konsisten.',
          },
          popupText: { type: Type.STRING },
          soundEffect: { type: Type.STRING },
          dialogVO: {
            type: Type.STRING,
            description:
              'Narasi VO natural yang menyambung langsung dari kalimat adegan sebelumnya dan mengantar ke adegan berikutnya sesuai persona.',
          },
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
      'You are an elite UGC Creative Director. When polishing a middle or specific scene, you strictly preserve narrative continuity, logical pacing, and visual contrast with the previous and next scenes in the storyboard while keeping physical laws and lighting consistency intact.'
    );
    const parsedScene = parseSafeJson<any>(rawText);

    const physicsTokens = enforcePhysics
      ? 'strict physical laws, realistic mass inertia, biomechanical constraint adherence, solid-contact gravity without clipping, consistent directional lighting with matching cast shadows, authentic camera motion, zero floaty artifacts, zero morphing, photorealistic 9:16 vertical 4k 60fps'
      : 'natural product showcase, consistent lighting, photorealistic 9:16 vertical 4k 60fps';

    if (parsedScene && parsedScene.visualAction) {
      const popupText = parsedScene.popupText || scene.popupText || 'HASIL NYATA TERBUKTI ✨';
      const angle = parsedScene.cameraAngle || scene.cameraAngle || 'Medium Shot';
      const flowPrompt = `[Image 1 Reference: ${productName || 'Produk'}] Scene ${
        resolvedIndex >= 0 ? resolvedIndex + 1 : scene.order || 1
      } (${angle}): ${parsedScene.visualAction} - On-Screen Pop-up Text Overlay: "${popupText}" - Follow reference image packaging, ${physicsTokens}.`;

      return NextResponse.json({
        success: true,
        scene: {
          ...parsedScene,
          cameraAngle: angle,
          popupText,
          duration: Number(parsedScene.duration) || Number(scene.duration) || 3,
          googleFlowPrompt: flowPrompt,
          imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
        },
      });
    }

    // Context-aware fallback when Gemini is offline/unavailable
    const fallbackAnglePool = [
      'Extreme Close-up / Macro (Tekstur & Detail)',
      'Over the Shoulder (OTS)',
      '0.5x Ultra-Wide Gen-Z Selfie (Ekspresif & Dekat)',
      'POV / Handheld (First-Person)',
      'Side Profile 45° (Angle Samping)',
      'Snap-Zoom Product Punch (Zoom Cepat Beat Drop)',
    ].filter((a) => a !== prevScene?.cameraAngle && a !== nextScene?.cameraAngle);
    const chosenAngle =
      scene.cameraAngle &&
      scene.cameraAngle !== prevScene?.cameraAngle &&
      scene.cameraAngle !== nextScene?.cameraAngle
        ? scene.cameraAngle
        : fallbackAnglePool[0] || 'Over the Shoulder (OTS)';

    const uspSnippet = keySellingPoints ? keySellingPoints.split(/[,.;]/)[0]?.trim() : '';
    const bridgeIntro = prevScene
      ? resolvedIndex === totalCount - 1
        ? `Nah, dari semua pembuktian tadi`
        : `Lanjut dari situ`
      : `Jujur`;
    const bridgeOutro = nextScene
      ? resolvedIndex === 0
        ? `Makanya lihat langsung detailnya!`
        : `Nah, bagian paling kerasa ada di tahap berikutnya.`
      : isShopee
      ? `Langsung checkout di keranjang oren sekarang ya!`
      : `Langsung cek di keranjang di bawah sekarang ya!`;

    const enhancedDialog = scene.dialogVO
      ? prevScene
        ? `${bridgeIntro}, ${scene.dialogVO.charAt(0).toLowerCase()}${scene.dialogVO.slice(1)}${
            uspSnippet && !scene.dialogVO.toLowerCase().includes(uspSnippet.toLowerCase())
              ? ` Apalagi ${uspSnippet.toLowerCase()}.`
              : ''
          }`
        : scene.dialogVO
      : `${bridgeIntro}, ${productName || 'produk ini'} beneran ngebantu banget. ${bridgeOutro}`;

    const enhancedVisual = scene.visualAction
      ? `${scene.visualAction} (Menyambung transisi dari ${
          prevScene ? `adegan ${resolvedIndex}` : 'pembuka'
        } dengan genggaman 5 jari solid, inersia bobot nyata, dan pencahayaan terarah konsisten)`
      : `Kreator menampilkan detail ${productName || 'produk'} secara natural menyambung dari adegan sebelumnya dengan kontak fisik solid dan pencahayaan konsisten.`;

    const fallbackPopup = scene.popupText
      ? scene.popupText
      : nextScene
      ? 'DETAIL & BUKTI NYATA ✨'
      : 'KLIK KERANJANG DI BAWAH! 🛒👇';

    const fallbackFlowPrompt = `[Image 1 Reference: ${productName || 'Produk'}] Scene ${
      resolvedIndex >= 0 ? resolvedIndex + 1 : scene.order || 1
    } (${chosenAngle}): ${enhancedVisual} - On-Screen Pop-up Text Overlay: "${fallbackPopup}" - Follow reference image packaging, ${physicsTokens}.`;

    return NextResponse.json({
      success: true,
      scene: {
        cameraAngle: chosenAngle,
        visualAction: enhancedVisual,
        popupText: fallbackPopup,
        soundEffect: scene.soundEffect
          ? `${scene.soundEffect} + Smooth Riser`
          : 'Match-cut whoosh & Sparkle ting',
        dialogVO: enhancedDialog,
        notesMood:
          scene.notesMood ||
          'Gaya teks: Kinetic Typography Fast-Cut. Pencahayaan terarah konsisten dengan bayangan kontak realistis.',
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
  } catch {
    return await handleEnhanceSceneRequest({});
  }
}

export async function GET(req: NextRequest) {
  try {
    const payloadParam = req.nextUrl.searchParams.get('payload');
    const body = payloadParam ? JSON.parse(payloadParam) : {};
    return await handleEnhanceSceneRequest(body);
  } catch {
    return await handleEnhanceSceneRequest({});
  }
}
