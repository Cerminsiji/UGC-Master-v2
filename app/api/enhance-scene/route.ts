import { NextRequest, NextResponse } from 'next/server';
import { Type } from '@google/genai';
import type { ReferenceRole, VisualContinuityBible } from '@/types';
import {
  generateWithFallback,
  parseSafeJson,
  getVoiceToneDirective,
  REFERENCE_ROLE_OPTIONS,
  getReferenceRoleLabel,
  selectSceneReferenceIndexes,
  formatReferenceTagsForScene,
} from '@/lib/gemini-ugc';

interface SceneSummaryInput {
  order?: number;
  cameraAngle?: string;
  visualAction?: string;
  popupText?: string;
  dialogVO?: string;
  soundEffect?: string;
  notesMood?: string;
  duration?: number;
  transitionBridge?: string;
  referencedImageIndexes?: number[];
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)] || items[0];
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
      referenceImages: rawReferenceImages = [],
      referenceRoles: rawReferenceRoles = [],
      visualBible: rawVisualBible = null,
    } = body || {};

    const allReferenceImages: string[] = Array.isArray(rawReferenceImages)
      ? rawReferenceImages.filter((x: unknown) => typeof x === 'string' && x.trim().length > 0)
      : [];
    const validRoleSet = new Set<ReferenceRole>(REFERENCE_ROLE_OPTIONS.map((r) => r.value));
    const refTotal = Math.max(1, allReferenceImages.length);
    const normalizedRoles: ReferenceRole[] = Array.from({ length: refTotal }, (_, idx) => {
      const candidate = Array.isArray(rawReferenceRoles) ? rawReferenceRoles[idx] : undefined;
      if (candidate && validRoleSet.has(candidate)) return candidate as ReferenceRole;
      return idx === 0 ? 'product' : 'detail';
    });
    const visualBible: Partial<VisualContinuityBible> | null =
      rawVisualBible && typeof rawVisualBible === 'object' ? rawVisualBible : null;

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
  - Transisi Pose: ${s.transitionBridge || '-'}
  - Pop-up: ${s.popupText || '-'}
  - VO/Dialog: "${s.dialogVO || '-'}"
  - SFX: ${s.soundEffect || '-'}`;
            })
            .join('\n\n')
        : `Adegan saat ini (${scene.duration || 3}s | ${scene.cameraAngle || 'Medium Shot'}):
  - Visual: ${scene.visualAction || '-'}
  - Transisi Pose: ${scene.transitionBridge || '-'}
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

    const toneDirective = getVoiceToneDirective(tone);

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
4. ANTI-MONOTON SUDUT KAMERA, VO & POP-UP:
   - Gunakan sudut kamera yang BERBEDA dan kontras dari ${prevScene ? `"${prevScene.cameraAngle}"` : 'adegan lain'} maupun ${nextScene ? `"${nextScene.cameraAngle}"` : 'adegan akhir'} agar potongan visual terasa dinamis!
   - Buat popupText yang singkat, punchy, variatif, dan tidak mengulang teks pop-up adegan lain (hindari teks generik "KEUNGGULAN: ..." atau "SOLUSI TERBAIK").
   - Variasikan gaya bahasa dialogVO sesuai persona "${persona || 'Kreator UGC Natural'}" dan tone "${tone || 'Santai & Relatable'}" (${toneDirective}) dengan Bahasa Indonesia percakapan sehari-hari yang natural.`;

    const physicsMandate = enforcePhysics
      ? `
=== MANDAT HUKUM FISIKA, GERAKAN REALISTIS & PENCAHAYAAN KONSISTEN ===
- Gravitasi, massa benda, dan inersia nyata (realistic mass inertia): produk punya bobot dan tidak melayang.
- Biomechanical constraint adherence: genggaman 5 jari normal, kontak fisik solid tanpa clipping/tembus.
- Pencahayaan arah tunggal konsisten dengan bayangan jatuh (cast shadows) serasi dan zero morphing.`
      : '';

    const referenceInventoryLines =
      allReferenceImages.length > 0
        ? allReferenceImages
            .map((_, idx) => {
              const roleMeta =
                REFERENCE_ROLE_OPTIONS.find((r) => r.value === normalizedRoles[idx]) || REFERENCE_ROLE_OPTIONS[0];
              return `  * Image #${idx + 1} -> Peran: ${roleMeta.label} (${roleMeta.promptHint})`;
            })
            .join('\n')
        : `  * Image #1 -> Peran: Produk Utama (${productName || 'Produk'})`;

    const visualBibleSection = visualBible
      ? `\n=== VISUAL CONTINUITY BIBLE (WAJIB DIKUNCI & DIPERTAHANKAN) ===
- Warna Kemasan: ${visualBible.packagingColors || '-'}
- Teks Label Persis: ${visualBible.exactLabelText || productName || '-'}
- Bentuk & Material: ${visualBible.productShapeMaterial || '-'}
- Tampilan Talent: ${visualBible.talentAppearance || '-'}
- Pencahayaan & Lokasi: ${visualBible.environmentLighting || '-'}
- Negative Prompt Global: ${visualBible.negativePromptGlobal || '-'}`
      : '';

    const prompt = `Kamu adalah Creative UGC Director profesional. Tingkatkan **${scenePositionLabel}** pada storyboard berikut agar jauh lebih hidup, bervariasi, tidak monoton, dan menyatu mulus dengan seluruh adegan lainnya serta REFERENSI GAMBAR.

DETAIL PRODUK & KONTEKS:
- Nama Produk: "${productName || 'Produk Unggulan'}"
- Deskripsi Produk: "${productDescription || '-'}"
- Keunggulan Utama (USP): "${keySellingPoints || '-'}"
- Kategori Konten: "${category}"
- Persona Talent: "${persona || 'Kreator UGC Natural'}"
- Tone Suara / Gaya VO: "${tone || 'Santai, Mengalir & Natural'}" (${toneDirective})
- Target Audiens: "${targetAudience || 'Pengguna media sosial Indonesia'}"
- Gaya Kamera Utama: "${cameraAngleStyle || 'Dinamis & Multi-Angle'}"
- Instruksi Tambahan: "${instruction}"
- Daftar Referensi Gambar Terlampir (${allReferenceImages.length > 0 ? allReferenceImages.length : 1} foto):
${referenceInventoryLines}
${visualBibleSection}
${platformCtaRule}
${continuityMandate}
${physicsMandate}

Data awal adegan yang akan dipoles (${scenePositionLabel}):
- Sudut kamera: ${scene.cameraAngle || 'Medium Shot'}
- Referensi gambar terpakai sebelumnya: ${JSON.stringify(scene.referencedImageIndexes || [1])}
- Transisi Pose: ${scene.transitionBridge || '-'}
- Aksi visual: ${scene.visualAction || ''}
- Teks pop-up: ${scene.popupText || ''}
- Efek suara (SFX): ${scene.soundEffect || ''}
- Dialog / VO: ${scene.dialogVO || ''}
- Catatan / Mood: ${scene.notesMood || ''}
- Negative Prompt: ${scene.negativePrompt || ''}
- Durasi: ${scene.duration || 3} detik

Tulis ulang adegan ini dalam format JSON yang ditingkatkan dan menyatu kuat dengan konteks seluruh storyboard serta visualBible.`;

    const config = {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          cameraAngle: { type: Type.STRING },
          visualAction: {
            type: Type.STRING,
            description:
              'Deskripsi aksi fisik yang menyambung mulus dengan adegan sebelum/sesudahnya, patuh visualBible, hukum fisika nyata, kontak solid tanpa clipping, dan pencahayaan konsisten.',
          },
          popupText: { type: Type.STRING },
          soundEffect: { type: Type.STRING },
          dialogVO: {
            type: Type.STRING,
            description:
              'Narasi VO natural yang menyambung langsung dari kalimat adegan sebelumnya dan mengantar ke adegan berikutnya sesuai persona & voice tone.',
          },
          notesMood: { type: Type.STRING },
          duration: { type: Type.INTEGER },
          referencedImageIndexes: {
            type: Type.ARRAY,
            items: { type: Type.INTEGER },
            description: 'Array 1-based indeks gambar referensi yang cocok untuk adegan ini.',
          },
          transitionBridge: {
            type: Type.STRING,
            description: 'Start Pose -> End Pose untuk mengunci kesinambungan gerakan dengan adegan sebelum/sesudahnya.',
          },
          negativePrompt: {
            type: Type.STRING,
            description: 'Negative prompt bahasa Inggris agar teks label, warna produk, dan anatomi tangan tidak terdistorsi.',
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
          'referencedImageIndexes',
          'transitionBridge',
          'negativePrompt',
        ],
      },
    };

    const rawText = await generateWithFallback(
      prompt,
      config,
      'You are an elite UGC Creative Director. When polishing a specific scene, you strictly preserve the Visual Continuity Bible (exact packaging colors, label text, talent appearance, unified lighting), reference image roles, narrative continuity, and physical laws.',
      22000,
      allReferenceImages,
      normalizedRoles
    );
    const parsedScene = parseSafeJson<any>(rawText);

    const physicsTokens = enforcePhysics
      ? 'strict physical laws, realistic mass inertia, biomechanical constraint adherence, solid-contact gravity without clipping, consistent directional lighting with matching cast shadows, authentic camera motion, zero floaty artifacts, zero morphing, photorealistic 9:16 vertical 4k 60fps'
      : 'natural product showcase, consistent lighting, photorealistic 9:16 vertical 4k 60fps';

    const resolveSceneRefIndexes = (rawArr: any, angleStr: string): number[] => {
      const cleaned = Array.isArray(rawArr)
        ? rawArr
            .map((n: any) => Number(n))
            .filter((n: number, pos: number, arr: number[]) => Number.isInteger(n) && n >= 1 && n <= refTotal && arr.indexOf(n) === pos)
        : [];
      if (cleaned.length > 0) return cleaned;
      if (Array.isArray(scene.referencedImageIndexes) && scene.referencedImageIndexes.length > 0) {
        const prevValid = scene.referencedImageIndexes
          .map((n: any) => Number(n))
          .filter((n: number) => Number.isInteger(n) && n >= 1 && n <= refTotal);
        if (prevValid.length > 0) return prevValid;
      }
      return selectSceneReferenceIndexes(
        angleStr,
        normalizedRoles,
        refTotal,
        Math.max(0, resolvedIndex),
        totalCount
      );
    };

    if (parsedScene && parsedScene.visualAction) {
      const popupText = parsedScene.popupText || scene.popupText || 'BUKTI NYATA TANPA FILTER ✨';
      const angle = parsedScene.cameraAngle || scene.cameraAngle || 'Medium Shot';
      const refIndexes = resolveSceneRefIndexes(parsedScene.referencedImageIndexes, angle);
      const refTag = formatReferenceTagsForScene(refIndexes, normalizedRoles, productName || 'Produk');
      const lockSnippet = visualBible?.exactLabelText
        ? ` - Visual Lock: exact label "${visualBible.exactLabelText}" (${visualBible.packagingColors || 'match reference'})`
        : '';
      const flowPrompt = `${refTag} Scene ${
        resolvedIndex >= 0 ? resolvedIndex + 1 : scene.order || 1
      } (${angle}): ${parsedScene.visualAction}${lockSnippet} - On-Screen Pop-up Text Overlay: "${popupText}" - Follow reference image packaging, ${physicsTokens}.`;

      const refDesc = refIndexes
        .map((n: number) => `#${n} (${getReferenceRoleLabel(normalizedRoles[n - 1], true)})`)
        .join(', ');

      return NextResponse.json({
        success: true,
        scene: {
          ...parsedScene,
          cameraAngle: angle,
          popupText,
          duration: Number(parsedScene.duration) || Number(scene.duration) || 3,
          referencedImageIndexes: refIndexes,
          transitionBridge:
            parsedScene.transitionBridge ||
            scene.transitionBridge ||
            `Sambung mulus dari pose akhir ${prevScene ? `adegan ${resolvedIndex}` : 'pembuka'} → arahkan ke adegan berikutnya.`,
          negativePrompt:
            parsedScene.negativePrompt ||
            scene.negativePrompt ||
            visualBible?.negativePromptGlobal ||
            'no altered brand text, no distorted logo or label typography, no extra fingers, no clipping, no morphing',
          googleFlowPrompt: flowPrompt,
          imageReferenceNote:
            refTotal > 1
              ? `Kunci visual mengikuti Gambar Referensi ${refDesc}`
              : 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
        },
      });
    }

    // Context-aware & varied fallback when Gemini is offline/unavailable
    const usedPopups = new Set(
      normalizedScenes.map((s) => String(s.popupText || '').trim().toUpperCase()).filter(Boolean)
    );
    const usedSfx = new Set(
      normalizedScenes.map((s) => String(s.soundEffect || '').trim().toLowerCase()).filter(Boolean)
    );

    const fallbackAnglePool = [
      'Extreme Close-up / Macro (Tekstur & Detail)',
      'Over the Shoulder (OTS)',
      '0.5x Ultra-Wide Gen-Z Selfie (Ekspresif & Dekat)',
      'POV / Handheld (First-Person)',
      'Side Profile 45° (Angle Samping)',
      'Snap-Zoom Product Punch (Zoom Cepat Beat Drop)',
      'Dolly Zoom / Vertigo Reveal (Dramatis)',
    ].filter((a) => a !== prevScene?.cameraAngle && a !== nextScene?.cameraAngle);
    const chosenAngle =
      fallbackAnglePool.length > 0
        ? pickRandom(fallbackAnglePool)
        : scene.cameraAngle || 'Over the Shoulder (OTS)';

    const uspSnippet = keySellingPoints ? keySellingPoints.split(/[,.;]/)[0]?.trim() : '';
    const bridgeIntro = prevScene
      ? resolvedIndex === totalCount - 1
        ? pickRandom(['Nah, dari semua bukti tadi', 'Singkatnya', 'Biar gak kehabisan lagi'])
        : pickRandom(['Lanjut dari situ', 'Nah bagian serunya nih', 'Pas dicek lebih dekat'])
      : pickRandom(['Jujur aja', 'Awalnya sempet ragu sih', 'Beneran baru ngeh']);

    const bridgeOutro = nextScene
      ? resolvedIndex === 0
        ? pickRandom(['Lihat sendiri deh detail aslinya!', 'Sini ku-tunjukin buktinya.'])
        : pickRandom(['Dan bagian paling kerasa ada di tahap berikutnya.', 'Makanya efeknya langsung kelihatan.'])
      : isShopee
      ? pickRandom(['Langsung checkout di keranjang oren sekarang ya!', 'Amankan stoknya di keranjang oren mumpung promo!'])
      : isTikTok
      ? pickRandom(['Langsung cek keranjang kuning mumpung masih promo!', 'Klik keranjang kuning di bawah sebelum ludes!'])
      : pickRandom(['Langsung cek di keranjang di bawah sekarang ya!', 'Klik link di bawah sebelum kehabisan!']);

    const baseVoClean = (scene.dialogVO || '').trim();
    const enhancedDialog = baseVoClean
      ? prevScene
        ? `${bridgeIntro}, ${baseVoClean.charAt(0).toLowerCase()}${baseVoClean.slice(1)}${
            uspSnippet && !baseVoClean.toLowerCase().includes(uspSnippet.toLowerCase())
              ? ` Apalagi ${uspSnippet.toLowerCase()}.`
              : ''
          }`
        : baseVoClean
      : `${bridgeIntro}, ${productName || 'produk ini'} beneran ngebantu banget. ${bridgeOutro}`;

    const enhancedVisual = scene.visualAction
      ? `${scene.visualAction} (Menyambung transisi dari ${
          prevScene ? `adegan ${resolvedIndex}` : 'pembuka'
        } dengan genggaman 5 jari solid, inersia bobot nyata, dan pencahayaan terarah konsisten)`
      : `Kreator menampilkan detail ${productName || 'produk'} secara natural menyambung dari adegan sebelumnya dengan kontak fisik solid dan pencahayaan konsisten.`;

    const popupCandidates = (
      !nextScene
        ? isShopee
          ? ['KLIK KERANJANG OREN SEKARANG! 🛒👇', 'PROMO KERANJANG OREN HARI INI 🔥']
          : isTikTok
          ? ['CEK KERANJANG KUNING SEKARANG! 🛒👇', 'VOUCHER KERANJANG KUNING AKTIF 🏷️']
          : ['KLIK KERANJANG DI BAWAH SEKARANG! 🛒👇', 'AMANKAN PROMO HARI INI 🔥']
        : resolvedIndex === 0
        ? ['DETIK KE-1 LANGSUNG KAGET 😳', 'AWALNYA KIRA GIMMICK... 🤨', 'TES REAL-TIME TANPA CUT 🔍']
        : ['DETAIL NYATA BUKAN FILTER ✨', '10 DETIK LANGSUNG TERASA ⚡', 'RINGAN & PRAKTIS DIPAKAI ✅', 'BUILD QUALITY 10/10 💎']
    ).filter((p) => !usedPopups.has(p.toUpperCase()));

    const fallbackPopup =
      popupCandidates.length > 0
        ? pickRandom(popupCandidates)
        : scene.popupText || 'HASIL NYATA TANPA FILTER ✨';

    const sfxCandidates = [
      'Match-cut hand slap whoosh & Sparkle ting',
      'Camera shutter click & Bubble pop sound',
      'Sub-bass beat drop hit & Chime',
      'Fast whip whoosh & Crisp ASMR tap',
      'Level up victory chime & Soft pop',
    ].filter((s) => !usedSfx.has(s.toLowerCase()));
    const chosenSfx = sfxCandidates.length > 0 ? pickRandom(sfxCandidates) : 'Match-cut whoosh & Sparkle ting';

    const moodCandidates = [
      'Gaya teks: Kinetic Typography Fast-Cut. Pencahayaan directional konsisten dengan bayangan kontak realistis.',
      'Gaya teks: Clean Modern Pill Overlay. Fokus tajam pada tekstur & reaksi natural.',
      'Gaya teks: TikTok Reply Sticker Vibe. Cahaya jendela alami lembut.',
    ];

    const fallbackRefIndexes = resolveSceneRefIndexes(scene.referencedImageIndexes, chosenAngle);
    const fallbackRefTag = formatReferenceTagsForScene(fallbackRefIndexes, normalizedRoles, productName || 'Produk');
    const fallbackLock = visualBible?.exactLabelText
      ? ` - Visual Lock: exact label "${visualBible.exactLabelText}" (${visualBible.packagingColors || 'match reference'})`
      : '';
    const fallbackTransition =
      scene.transitionBridge ||
      `Sambung mulus dari pose akhir ${prevScene ? `adegan ${resolvedIndex}` : 'pembuka'} → akhiri dalam posisi stabil menuju ${
        nextScene ? `adegan ${resolvedIndex + 2}` : 'CTA penutup'
      }.`;
    const fallbackNegative =
      scene.negativePrompt ||
      visualBible?.negativePromptGlobal ||
      'no altered brand text, no distorted logo or label typography, no extra fingers, no clipping, no morphing';

    const fallbackFlowPrompt = `${fallbackRefTag} Scene ${
      resolvedIndex >= 0 ? resolvedIndex + 1 : scene.order || 1
    } (${chosenAngle}): ${enhancedVisual}${fallbackLock} - On-Screen Pop-up Text Overlay: "${fallbackPopup}" - Follow reference image packaging, ${physicsTokens}.`;
    const fallbackRefDesc = fallbackRefIndexes
      .map((n: number) => `#${n} (${getReferenceRoleLabel(normalizedRoles[n - 1], true)})`)
      .join(', ');

    return NextResponse.json({
      success: true,
      scene: {
        cameraAngle: chosenAngle,
        visualAction: enhancedVisual,
        popupText: fallbackPopup,
        soundEffect: chosenSfx,
        dialogVO: enhancedDialog,
        notesMood: scene.notesMood || pickRandom(moodCandidates),
        duration: Number(scene.duration) || 3,
        referencedImageIndexes: fallbackRefIndexes,
        transitionBridge: fallbackTransition,
        negativePrompt: fallbackNegative,
        googleFlowPrompt: fallbackFlowPrompt,
        imageReferenceNote:
          refTotal > 1
            ? `Kunci visual mengikuti Gambar Referensi ${fallbackRefDesc}`
            : 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
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
