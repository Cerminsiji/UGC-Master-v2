import { NextRequest, NextResponse } from 'next/server';
import { Type } from '@google/genai';
import {
  generateWithFallback,
  parseSafeJson,
  buildNicheHashtags,
  fitCaptionWithHashtags,
  REFERENCE_ROLE_OPTIONS,
  getReferenceRoleLabel,
  selectSceneReferenceIndexes,
  formatReferenceTagsForScene,
} from '@/lib/gemini-ugc';
import type {
  DanceStoryboardResult,
  DanceStoryboardScene,
  ReferenceRole,
  VisualContinuityBible,
} from '@/types';

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)] || items[0];
}

function mapTempoToMotionEnum(musicVibe: string): 'Slow (70-90 BPM)' | 'Medium (100-120 BPM)' | 'Fast (125-140 BPM)' {
  const lower = (musicVibe || '').toLowerCase();
  if (lower.includes('slow') || lower.includes('75') || lower.includes('80') || lower.includes('90')) {
    return 'Slow (70-90 BPM)';
  }
  if (lower.includes('jedag') || lower.includes('135') || lower.includes('140') || lower.includes('fast') || lower.includes('125')) {
    return 'Fast (125-140 BPM)';
  }
  return 'Medium (100-120 BPM)';
}

function mapIntensityToMotionEnum(
  danceStyle: string,
  musicVibe: string
): 'Subtle' | 'Medium' | 'Dynamic' | 'High Energy' {
  const combined = `${danceStyle} ${musicVibe}`.toLowerCase();
  if (combined.includes('jedag') || combined.includes('k-pop') || combined.includes('fitness') || combined.includes('135')) {
    return 'High Energy';
  }
  if (combined.includes('hand-sync') || combined.includes('runway') || combined.includes('match-cut') || combined.includes('afro')) {
    return 'Dynamic';
  }
  if (combined.includes('aesthetic') || combined.includes('slow')) {
    return 'Subtle';
  }
  return 'Medium';
}

function buildDanceFallback(params: {
  danceMode: string;
  danceStyle: string;
  musicVibe: string;
  cameraDynamic: string;
  productName: string;
  outfitWardrobe: string;
  backgroundSetting: string;
  talentPersona: string;
  targetDuration: number;
  targetSceneCount: number;
  targetPlatform: string;
  physicsConsistencyCheck: boolean;
  refCount: number;
  normalizedRoles: ReferenceRole[];
  visualBible?: Partial<VisualContinuityBible> | null;
}): DanceStoryboardResult {
  const {
    danceMode,
    danceStyle,
    musicVibe,
    cameraDynamic,
    productName,
    outfitWardrobe,
    backgroundSetting,
    talentPersona,
    targetDuration,
    targetSceneCount,
    targetPlatform,
    physicsConsistencyCheck,
    refCount,
    normalizedRoles,
    visualBible,
  } = params;

  const isProductMode = danceMode !== 'Pure Viral Dance Trend';
  const safeProd = productName?.trim() || 'Produk / Outfit Andalan';
  const sceneCount = Math.max(4, Math.min(8, targetSceneCount || 6));
  const beatTempo = mapTempoToMotionEnum(musicVibe);
  const intensity = mapIntensityToMotionEnum(danceStyle, musicVibe);
  const isShopee = (targetPlatform || '').toLowerCase().includes('shopee');

  const physicsSnippet = physicsConsistencyCheck
    ? 'strict physical laws, realistic mass inertia, natural human joint biomechanics, solid ground contact and weight transfer, consistent directional lighting with cast shadows, zero morphing'
    : 'natural dancer motion, crisp focus, consistent lighting';

  const pureVisualToken =
    'no floating text, no on-screen text overlay, no subtitles, no voiceover dialogue, pure visual choreography and camera motion';
  const defaultNegPrompt =
    visualBible?.negativePromptGlobal ||
    'no altered brand text, no gibberish label, no extra fingers, no clipping limbs, no floating zero-G motion, no floating text overlay, no subtitles';

  const baseSegments: Array<{
    beatLabel: string;
    choreo: string;
    cam: string;
    cameraAngle: string;
    visual: string;
    sfx: string;
    mood: string;
    bridge: string;
  }> = [
    {
      beatLabel: 'Intro 1x8 (Ketukan 1–4) • Hook Pose',
      choreo: pickRandom([
        'Head-tilt tajam ke kiri lalu point dua jari mengarah langsung ke lensa tepat di ketukan ke-3, bahu bounce ringan mengikuti intro bass.',
        'Langkah masuk 2 ketukan dari samping frame, snap jari di depan wajah lalu senyum percaya diri dengan gerak ritmis bahu.',
      ]),
      cam: '0.5x Ultra-Wide Snap Push-In mengikuti gerakan tangan ke kamera.',
      cameraAngle: '0.5x Ultra-Wide Gen-Z Selfie (Ekspresif & Dekat)',
      visual: isProductMode
        ? `${talentPersona} masuk frame dengan pose pembuka enerjik sambil memegang ${safeProd} secara solid, menatap lensa di bawah cahaya natural ${backgroundSetting}.`
        : `${talentPersona} membuka frame dengan pose siap dance penuh energi, tatapan tajam ke kamera dan gerakan bahu sinkron ketukan intro di ${backgroundSetting}.`,
      sfx: 'Intro riser whoosh & Finger snap click',
      mood: 'Pure visual dance intro. Pencahayaan natural stabil, tempo intro membangun antisipasi.',
      bridge: 'Mulai dari pose tengah stabil menghadap kamera → akhiri dengan bahu miring kanan siap groove.',
    },
    {
      beatLabel: 'Verse 1x8 (Ketukan 5–8) • Hand-Sync Groove',
      choreo: pickRandom([
        'Kombinasi hand-wave menyilang dada (cross-chest), putaran pergelangan tangan 180°, dan hip-sway dua kali ke kanan-kiri sesuai snare drum.',
        'Gerakan arm-roll bergantian kanan-kiri sejajar bahu, disambung tepukan ringan tepat di ketukan ke-7 dan body drop di ketukan ke-8.',
      ]),
      cam: cameraDynamic || 'Handheld Natural UGC Micro-Shake mengikuti ayunan tubuh.',
      cameraAngle: 'Medium Shot (Setengah Badan)',
      visual: isProductMode
        ? `Penari menari sinkron ${danceStyle} sambil mengarahkan fokus gerakan tangan ke arah ${safeProd} dengan kontak genggaman nyata dan bayangan serasi.`
        : `Penari mengeksekusi kombinasi gerakan tangan ${danceStyle} dengan artikulasi jari jelas dan postur tegak di ${outfitWardrobe}.`,
      sfx: 'Crisp snare clap & Sub-bass groove',
      mood: 'Pure visual groove. Ekspresi ceria & eye-contact kuat tanpa teks layar.',
      bridge: 'Lanjut dari bahu miring kanan → akhiri dengan telapak tangan kanan terangkat mendekati lensa.',
    },
    {
      beatLabel: 'Pre-Chorus • Match-Cut Hand Cover',
      choreo: 'Telapak tangan kanan maju menutup penuh lensa kamera di ketukan ke-8, lalu badan berputar cepat 180° saat tangan ditarik mundur.',
      cam: 'Match-Cut Lens Cover Zoom-Out diikuti Whip Pan cepat searah putaran bahu.',
      cameraAngle: 'Match-Cut Hand Transition (Tutup Lensa & Reveal)',
      visual: isProductMode
        ? `Transisi tutup lensa mengungkap ${talentPersona} tampil dengan pose baru sambil memamerkan detail ${safeProd} dengan jelas.`
        : `Transisi tutup lensa mulus mengubah sudut framing dan posisi pose penari tepat saat musik naik menuju beat drop.`,
      sfx: 'Match-cut hand slap whoosh & Risers swell',
      mood: 'Speed-ramp transition tepat di frame tutup lensa. Pure visual.',
      bridge: 'Tangan menutup penuh frame → reveal posisi lutut siap drop menyambut beat chorus.',
    },
    {
      beatLabel: 'CHORUS BEAT DROP! (1x8 Ketukan Utama)',
      choreo: pickRandom([
        'Drop lutut rendah di hitungan 1, lanjut footwork side-step cepat + double shoulder pop kanan-kiri dan pointing ke kamera di ketukan 5-6.',
        'Chest pop bertenaga tepat di bass drop, ayunan lengan membentuk framing tubuh/produk, lalu spin setengah badan dengan ekspresi hype.',
      ]),
      cam: 'Crash Zoom / Beat Drop Punch-In tepat setiap pukulan kick drum (ketukan 1, 3, 5, 7).',
      cameraAngle: 'Snap-Zoom Product Punch (Zoom Cepat Beat Drop)',
      visual: isProductMode
        ? `Puncak koreografi ${danceStyle}: ${talentPersona} menari enerjik memamerkan kelenturan & siluet ${safeProd} di tengah gerakan chorus berenergi tinggi.`
        : `Puncak koreografi ${danceStyle} penuh energi di ${backgroundSetting} dengan gerakan kaki dan tangan serempak bersama irama bass drop.`,
      sfx: 'Heavy sub-bass beat drop hit & Crowd cheer shimmer',
      mood: 'Dynamic micro-zoom di tiap bass hit. Tanpa teks overlay & tanpa VO.',
      bridge: 'Mendarat dari beat drop chorus → lanjut melangkah mundur ringan masuk ke groove detail.',
    },
    {
      beatLabel: 'Post-Chorus • Detail Groove / Fit-Check',
      choreo: 'Gerakan groove santai langkah mundur dua kali (step-back bounce), memutar pinggul ringan sambil memperlihatkan detail siluet outfit/produk.',
      cam: 'Low-Angle Tracking Follow dari pinggang mendongak sedikit agar siluet penari terlihat jenjang.',
      cameraAngle: 'Low Angle (Hero / Powerful)',
      visual: isProductMode
        ? `${talentPersona} tetap bergoyang ringan mengikuti tempo sambil mendekatkan ${safeProd} ke jarak close-up natural tanpa berhenti menari.`
        : `${talentPersona} melangkah santai mengikuti groove sambil memamerkan detail ${outfitWardrobe} di pencahayaan hangat konsisten.`,
      sfx: 'Hi-hat groove & Camera shutter click',
      mood: 'Fokus proporsi gerakan tubuh & detail visual jernih.',
      bridge: 'Langkah mundur selesai → siapkan putaran torso kembali ke pose tengah untuk loop frame.',
    },
    {
      beatLabel: 'Outro • Freeze Pose & Seamless Loop',
      choreo: 'Kembali ke pose pembuka tengah dengan head-tilt & senyum percaya diri, posisi tangan dan produk kembali identik dengan frame detik ke-1 agar loop mulus.',
      cam: 'Smooth Pull-Back Reveal perlahan mengunci framing vertikal 9:16 identik dengan frame awal.',
      cameraAngle: 'Front Camera / Selfie Mode (Clean Framing)',
      visual: isProductMode
        ? `${talentPersona} mengembalikan posisi tubuh dan ${safeProd} ke pose awal pembuka di bawah cahaya terarah konsisten untuk seamless loop.`
        : `${talentPersona} kembali ke pose ikonik pembuka selama 1 detik terakhir agar video terputar ulang mulus ke ketukan ke-1.`,
      sfx: 'Final beat chime & Sparkle magic ting',
      mood: 'Loop-ready end frame tanpa teks layar maupun voice over.',
      bridge: 'Outro End Pose kembali identik dengan Intro Start Pose (Seamless Loop Lock).',
    },
    {
      beatLabel: 'Bridge Breakdown • Slow-Mo Wave',
      choreo: 'Body wave lambat dari bahu ke pinggul lalu isolate leher kiri-kanan seiring melodi bridge sebelum naik lagi.',
      cam: '360° Orbital Arc mengitari 45 derajat di sisi kiri penari.',
      cameraAngle: '360° Product Orbit / Spin (Putaran Produk)',
      visual: `Gerakan slow-motion halus menonjolkan kontrol tubuh ${talentPersona} dengan ${outfitWardrobe} di bawah rim light lembut.`,
      sfx: 'Slow-motion bass sweep & Synth shimmer',
      mood: 'Speed ramp 0.5x ke 1x, pencahayaan rim light bersih.',
      bridge: 'Akhir body wave melambat → snap kembali ke tempo penuh untuk penutup.',
    },
    {
      beatLabel: 'Encore Pose • Quick Turn Loop',
      choreo: 'Putar badan cepat 180° lalu menoleh balik ke kamera kembali tepat ke posisi frame detik pertama.',
      cam: 'Whip Pan kiri ke kanan untuk menciptakan seamless loop.',
      cameraAngle: 'Panning & Whip Pan (Transisi Cepat)',
      visual: `${talentPersona} berputar mulus kembali ke posisi awal pembuka agar video terputar ulang mulus.`,
      sfx: 'Whip pan whoosh & Beat restart tick',
      mood: 'Loop continuity frame, tanpa floating text.',
      bridge: 'Putaran 180° berhenti persis di framing & jarak kamera Intro Adegan 1.',
    },
  ];

  const extraPool = baseSegments.slice(6);
  let chosen: typeof baseSegments = [];

  if (sceneCount <= 4) {
    chosen = [baseSegments[0], baseSegments[2], baseSegments[3], baseSegments[5]];
  } else if (sceneCount === 5) {
    chosen = [baseSegments[0], baseSegments[1], baseSegments[2], baseSegments[3], baseSegments[5]];
  } else if (sceneCount === 6) {
    chosen = baseSegments.slice(0, 6);
  } else {
    chosen = [...baseSegments.slice(0, 5), ...extraPool.slice(0, sceneCount - 6), baseSegments[5]];
  }

  const perDur = Math.max(2, Math.round(targetDuration / chosen.length));
  const scenes: DanceStoryboardScene[] = chosen.map((seg, idx) => {
    const dur = idx === chosen.length - 1 ? Math.max(2, targetDuration - perDur * (chosen.length - 1)) : perDur;
    const referencedImageIndexes = selectSceneReferenceIndexes(
      seg.cameraAngle,
      normalizedRoles,
      refCount,
      idx,
      chosen.length
    );
    const refTag =
      refCount > 0
        ? formatReferenceTagsForScene(referencedImageIndexes, normalizedRoles, safeProd)
        : `[TikTok Dance Ref: ${danceStyle}]`;
    const refDesc = referencedImageIndexes
      .map((n) => `#${n} (${getReferenceRoleLabel(normalizedRoles[n - 1], true)})`)
      .join(', ');

    return {
      id: `dance_sc_${Date.now()}_${idx + 1}`,
      order: idx + 1,
      beatCue: seg.beatLabel,
      choreographyMove: seg.choreo,
      cameraChoreo: seg.cam,
      cameraAngle: seg.cameraAngle,
      visualAction: seg.visual,
      popupText: '',
      soundEffect: seg.sfx,
      dialogVO: '',
      notesMood: seg.mood,
      duration: dur,
      referencedImageIndexes,
      transitionBridge: seg.bridge,
      negativePrompt: defaultNegPrompt,
      imageReferenceNote:
        refCount > 1
          ? `Kunci visual mengikuti Gambar Referensi ${refDesc}`
          : isProductMode
          ? 'Pastikan Produk & Outfit sesuai Gambar referensi yang sudah di attached'
          : 'Pastikan karakter & outfit penari konsisten dengan referensi visual',
      googleFlowPrompt: `${refTag} [TikTok Dance: ${danceStyle}] Scene ${idx + 1} (${seg.beatLabel}) - ${seg.cameraAngle}, ${seg.cam} - Dancer Action: ${seg.choreo}. ${seg.visual} - Tempo: ${beatTempo}, Intensity: ${intensity}, ${pureVisualToken}, ${physicsSnippet}, 9:16 vertical 60fps crisp smartphone video.`,
      motionControl: {
        danceStyle,
        cameraMovement: seg.cam,
        aestheticEffect: 'Raw iPhone Handheld 2026 Aesthetic',
        motionIntensity: intensity,
        beatTempo,
        aspectRatio: '9:16',
        customMotionNotes: `${seg.beatLabel} | ${seg.choreo}`,
      },
    };
  });

  const nicheTags = buildNicheHashtags(
    isProductMode ? safeProd : danceStyle,
    `TikTok Dance ${danceStyle}`,
    outfitWardrobe,
    targetPlatform,
    ['TikTokDance', 'DanceChallenge', 'KoreoViral']
  );

  const captionBody = isProductMode
    ? pickRandom([
        `Ikutan trend ${danceStyle.split('&')[0].trim()} bareng ${safeProd.slice(0, 22)}! Cek ${isShopee ? 'keranjang oren' : 'keranjang bawah'} 💃`,
        `Gerak seaktif ini tetep nyaman pake ${safeProd.slice(0, 22)} 🔥 Yang mau kembaran cek keranjang!`,
      ])
    : pickRandom([
        `Save dulu koreo ${danceStyle.split('&')[0].trim()} ini biar gak ketinggalan FYP! Tag temen duetmu 💃🔥`,
        `Latihan 10 menit langsung on-beat! Siapa berani stitch? 🕺✨`,
      ]);

  return {
    title: isProductMode
      ? `TikTok Dance (${danceStyle.split('(')[0].trim()}) - ${safeProd}`
      : `TikTok Dance Storyboard - ${danceStyle}`,
    danceStyle,
    bpmRange: beatTempo,
    choreoConcept: `Koreografi ${danceStyle} bergaya ${danceMode} dengan tempo ${musicVibe} (pure visual dance tanpa floating text & tanpa voice over).`,
    soundRecommendation: `Gunakan sound trending kategori "${musicVibe}" (${beatTempo}) dengan ketukan bass drop jelas di detik ke-3 sampai ke-5.`,
    outfitNotes: outfitWardrobe || 'OOTD kasual streetwear/clean aesthetic dengan kontras warna mencolok terhadap latar agar gerakan tangan terbaca jelas.',
    loopAnchorNote:
      'Outro End Pose mengembalikan tubuh penari, posisi tangan/produk, serta jarak kamera 9:16 tepat ke Intro Start Pose agar loop TikTok berputar mulus tanpa jump-cut.',
    caption: fitCaptionWithHashtags(captionBody, nicheTags, 150),
    hashtags: nicheTags,
    scenes,
  };
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const {
    danceMode = 'Dance + Soft-Sell Produk',
    danceStyle = 'Viral TikTok Hand-Sync & Bounce',
    musicVibe = 'Upbeat Viral FYP (120-130 BPM)',
    cameraDynamic = '0.5x Ultra-Wide Dynamic Follow',
    productName = '',
    brandName = '',
    keySellingPoints = '',
    outfitWardrobe = 'Outfit kasual stylish warna kontras & latar kamar/studio estetik',
    backgroundSetting = 'Kamar Estetik Lampu Sunset & RGB Neon',
    talentPersona = 'Wanita Muda / Gen Z',
    targetDuration = 20,
    targetSceneCount = 6,
    targetPlatform = 'TikTok Shop',
    physicsConsistencyCheck = true,
    referenceImages: rawReferenceImages = [],
    referenceRoles: rawReferenceRoles = [],
    visualBible: rawVisualBible = null,
    videoAnalysisSummary = '',
  } = body || {};

  const allReferenceImages: string[] = Array.isArray(rawReferenceImages)
    ? rawReferenceImages.filter((x: unknown) => typeof x === 'string' && x.trim().length > 0)
    : [];
  const validRoleSet = new Set<ReferenceRole>(REFERENCE_ROLE_OPTIONS.map((r) => r.value));
  const refTotal = allReferenceImages.length;
  const normalizedRoles: ReferenceRole[] = Array.from({ length: Math.max(1, refTotal) }, (_, idx) => {
    const candidate = Array.isArray(rawReferenceRoles) ? rawReferenceRoles[idx] : undefined;
    if (candidate && validRoleSet.has(candidate)) return candidate as ReferenceRole;
    return idx === 0 ? 'product' : 'detail';
  });
  const visualBible: Partial<VisualContinuityBible> | null =
    rawVisualBible && typeof rawVisualBible === 'object' ? rawVisualBible : null;

  const isProductMode = danceMode !== 'Pure Viral Dance Trend';
  const sceneTarget = Math.max(4, Math.min(8, Number(targetSceneCount) || 6));
  const durationTarget = Math.max(10, Math.min(60, Number(targetDuration) || 20));
  const beatTempo = mapTempoToMotionEnum(musicVibe);
  const intensity = mapIntensityToMotionEnum(danceStyle, musicVibe);

  const referenceInventoryLines =
    refTotal > 0
      ? allReferenceImages
          .map((_, idx) => {
            const roleMeta =
              REFERENCE_ROLE_OPTIONS.find((r) => r.value === normalizedRoles[idx]) || REFERENCE_ROLE_OPTIONS[0];
            return `  * Image #${idx + 1} -> Peran: ${roleMeta.label} (${roleMeta.promptHint})`;
          })
          .join('\n')
      : '';

  try {
    const prompt = `Kamu adalah Koreografer Viral TikTok & Creative Video Director profesional Indonesia.
Buatkan **Storyboard Dance ala TikTok Style** yang lengkap per bar/ketukan (beat-synced), enerjik, variatif, tidak monoton, dan terhubung dengan Seamless Loop Frame Lock!

PARAMETER KOREOGRAFI & PRODUKSI:
- Mode Konten: "${danceMode}"
- Gaya Dance Utama: "${danceStyle}"
- Vibe Musik & Tempo: "${musicVibe}" (Estimasi: ${beatTempo})
- Gaya Kamera Utama: "${cameraDynamic}"
- Persona Penari: "${talentPersona}"
- Wardrobe / OOTD: "${outfitWardrobe}"
- Latar Belakang / Background: "${backgroundSetting}"
${isProductMode ? `- Produk yang Terintegrasi ke Dance: "${productName || 'Product Utama'}" ${brandName ? `(Brand: ${brandName})` : ''} | USP: "${keySellingPoints || 'Nyaman, estetik, layak spill'}"` : '- Fokus: Murni tarian/koreografi viral & transisi tanpa jualan keras.'}
- Target Platform: "${targetPlatform}"
- Total Durasi: ${durationTarget} detik
- Jumlah Segmen Beat/Adegan: WAJIB TEPAT ${sceneTarget} segmen (jumlah integer durasi mendekati ${durationTarget}s)
${videoAnalysisSummary ? `\nHASIL ANALISIS VIDEO REFERENSI (IKUTI RITME & GERAK INI):\n${videoAnalysisSummary}\n` : ''}${refTotal > 0 ? `\nREFERENSI VISUAL TERLAMPIR (${refTotal} foto):\n${referenceInventoryLines}\n` : ''}${visualBible ? `\nVISUAL CONTINUITY BIBLE AKTIF:\n- Kemasan/Warna: ${visualBible.packagingColors || '-'}\n- Label Persis: ${visualBible.exactLabelText || productName || '-'}\n- Talent: ${visualBible.talentAppearance || talentPersona}\n- Lighting/Setting: ${visualBible.environmentLighting || backgroundSetting}\n` : ''}
ATURAN MUTLAK TIKTOK DANCE STORYBOARD (TANPA FLOATING TEXT & TANPA VOICE OVER):
1. DILARANG KERAS MEMBUAT NARASI FLOATING TEXT / POP-UP TEXT DI LAYAR! Video dance ini 100% bersih tanpa teks stiker melayang atau subtitle overlay.
2. DILARANG KERAS MEMBUAT NARASI VOICE OVER (VO) ATAU DIALOG UCAPAN! Fokus penuh hanya pada gerakan fisik koreografi, sinkronisasi ketukan musik, ekspresi visual, pergerakan kamera, pencahayaan, dan cue SFX beat.
3. SEAMLESS LOOP FRAME LOCK (WAJIB):
   - Rancang \`loopAnchorNote\` yang mengunci agar Outro End Pose (segmen terakhir) kembali mulus ke posisi badan, arah pandang, dan jarak framing Intro Start Pose (segmen pertama) supaya video berputar infinite loop mulus di TikTok!
4. Setiap segmen WAJIB memiliki:
   - \`beatCue\`, \`choreographyMove\`, \`cameraChoreo\`, \`cameraAngle\`, \`visualAction\`, \`soundEffect\`, \`notesMood\`, \`duration\`
   - \`transitionBridge\`: Start Pose -> End Pose untuk menyambung mulus antar segmen (terutama Outro -> Intro loop).
   - \`referencedImageIndexes\`: Indeks 1-based dari foto referensi yang relevan${refTotal > 0 ? ` (1..${refTotal})` : ' (default [1])'}.
   - \`negativePrompt\`: Larangan visual bahasa Inggris (termasuk no floating text, no subtitles, no extra fingers, no altered label).
   - \`googleFlowPrompt\`: Prompt siap video AI yang memuat tag referensi [Image X (Peran): ...] jika relevan, WAJIB menyertakan "no floating text, no on-screen text overlay, no subtitles, no voiceover dialogue".
5. ${physicsConsistencyCheck ? 'PHYSICS & ANATOMY MANDATE: Semua gerakan tari wajib mematuhi batas biomekanika sendi manusia, kontak kaki dengan lantai yang solid, inersia tubuh realistis, genggaman 5 jari normal bila memegang barang, tanpa clipping/melayang.' : ''}
6. \`caption\`: Buatkan 1 caption TikTok Dance lengkap dengan 3-4 hashtag relevan (WAJIB <= 150 karakter total!).

Kembalikan JSON sesuai skema.`;

    const config = {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          choreoConcept: { type: Type.STRING },
          soundRecommendation: { type: Type.STRING },
          outfitNotes: { type: Type.STRING },
          loopAnchorNote: { type: Type.STRING },
          caption: { type: Type.STRING },
          hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                beatCue: { type: Type.STRING },
                choreographyMove: { type: Type.STRING },
                cameraChoreo: { type: Type.STRING },
                cameraAngle: { type: Type.STRING },
                visualAction: { type: Type.STRING },
                soundEffect: { type: Type.STRING },
                notesMood: { type: Type.STRING },
                duration: { type: Type.INTEGER },
                referencedImageIndexes: {
                  type: Type.ARRAY,
                  items: { type: Type.INTEGER },
                },
                transitionBridge: { type: Type.STRING },
                negativePrompt: { type: Type.STRING },
                googleFlowPrompt: { type: Type.STRING },
              },
              required: [
                'beatCue',
                'choreographyMove',
                'cameraChoreo',
                'cameraAngle',
                'visualAction',
                'soundEffect',
                'notesMood',
                'duration',
                'referencedImageIndexes',
                'transitionBridge',
                'negativePrompt',
                'googleFlowPrompt',
              ],
            },
          },
        },
        required: [
          'title',
          'choreoConcept',
          'soundRecommendation',
          'outfitNotes',
          'loopAnchorNote',
          'caption',
          'scenes',
        ],
      },
    };

    const raw = await generateWithFallback(
      prompt,
      config,
      'You are an elite TikTok Viral Dance Choreographer & Video Director. Create energetic, beat-synced pure visual dance storyboards locked to attached visual references, Visual Continuity Bible, and Seamless Loop framing with ZERO floating text overlays and ZERO voiceover dialogue.',
      22000,
      allReferenceImages,
      normalizedRoles
    );

    const parsed = parseSafeJson<any>(raw);
    if (parsed && Array.isArray(parsed.scenes) && parsed.scenes.length > 0) {
      const safeProd = productName?.trim() || danceStyle;
      const totalSegs = parsed.scenes.length;

      const normalizedScenes: DanceStoryboardScene[] = parsed.scenes.map((sc: any, idx: number) => {
        const angle = sc.cameraAngle || 'Medium Shot (Setengah Badan)';
        const rawIdx = Array.isArray(sc.referencedImageIndexes)
          ? sc.referencedImageIndexes
              .map((n: any) => Number(n))
              .filter(
                (n: number, pos: number, arr: number[]) =>
                  Number.isInteger(n) && n >= 1 && n <= Math.max(1, refTotal) && arr.indexOf(n) === pos
              )
          : [];
        const referencedImageIndexes =
          refTotal > 0
            ? rawIdx.length > 0
              ? rawIdx
              : selectSceneReferenceIndexes(angle, normalizedRoles, refTotal, idx, totalSegs)
            : [1];
        const refTag =
          refTotal > 0
            ? formatReferenceTagsForScene(referencedImageIndexes, normalizedRoles, safeProd)
            : `[TikTok Dance Ref: ${danceStyle}]`;

        const baseFlow =
          sc.googleFlowPrompt ||
          `${refTag} Scene ${idx + 1} (${sc.beatCue || ''}) - ${sc.visualAction || sc.choreographyMove} - Camera: ${sc.cameraChoreo || cameraDynamic} - natural human biomechanics, realistic inertia, 9:16 vertical 60fps.`;
        let cleanedFlow = baseFlow
          .replace(/\s*-?\s*On-Screen Pop-up Text Overlay:\s*["']?[^"'\-]+["']?/gi, '')
          .trim();
        if (refTotal > 0 && !/\[Image\s+\d+/i.test(cleanedFlow)) {
          cleanedFlow = `${refTag} ${cleanedFlow}`;
        }
        const finalFlow = /no floating text|no on-screen text/i.test(cleanedFlow)
          ? cleanedFlow
          : `${cleanedFlow} - no floating text, no on-screen text overlay, no subtitles, no voiceover dialogue, pure visual dance & camera motion`;

        const refDesc = referencedImageIndexes
          .map((n: number) => `#${n} (${getReferenceRoleLabel(normalizedRoles[n - 1], true)})`)
          .join(', ');

        return {
          id: `dance_sc_${Date.now()}_${idx + 1}`,
          order: idx + 1,
          beatCue: sc.beatCue || `Bar ${idx + 1} • Ketukan 1–8`,
          choreographyMove: sc.choreographyMove || sc.visualAction || '',
          cameraChoreo: sc.cameraChoreo || cameraDynamic,
          cameraAngle: angle,
          visualAction: sc.visualAction || sc.choreographyMove || '',
          popupText: '',
          soundEffect: sc.soundEffect || 'Sub-bass beat drop hit',
          dialogVO: '',
          notesMood: sc.notesMood || 'Pure visual beat-synced choreography.',
          duration: Math.max(1, Number(sc.duration) || 3),
          referencedImageIndexes,
          transitionBridge:
            sc.transitionBridge ||
            (idx === totalSegs - 1
              ? 'Outro End Pose kembali identik dengan Intro Start Pose (Seamless Loop Lock).'
              : `Sambung pose dari segmen ${idx + 1} → siapkan transisi ketukan ke segmen ${idx + 2}.`),
          negativePrompt:
            sc.negativePrompt ||
            visualBible?.negativePromptGlobal ||
            'no floating text, no subtitles, no altered brand text, no extra fingers, no clipping',
          googleFlowPrompt: finalFlow,
          imageReferenceNote:
            refTotal > 1
              ? `Kunci visual mengikuti Gambar Referensi ${refDesc}`
              : isProductMode
              ? 'Pastikan Produk & Outfit sesuai Gambar referensi yang sudah di attached'
              : 'Pastikan karakter & outfit penari konsisten dengan referensi visual',
          motionControl: {
            danceStyle,
            cameraMovement: sc.cameraChoreo || cameraDynamic,
            aestheticEffect: 'Raw iPhone Handheld 2026 Aesthetic',
            motionIntensity: intensity,
            beatTempo,
            aspectRatio: '9:16',
            customMotionNotes: `${sc.beatCue || ''} | ${sc.choreographyMove || ''}`,
          },
        };
      });

      const fallbackTags = buildNicheHashtags(
        isProductMode ? productName : danceStyle,
        `TikTok Dance ${danceStyle}`,
        outfitWardrobe,
        targetPlatform,
        ['TikTokDance', 'DanceChallenge', 'KoreoViral']
      );
      const rawCap = typeof parsed.caption === 'string' ? parsed.caption.trim() : '';
      let finalCaption = rawCap;
      if (!finalCaption) {
        finalCaption = fitCaptionWithHashtags(
          `Ikutan trend ${danceStyle.split('&')[0].trim()} ${isProductMode && productName ? `+ spill ${productName}` : ''}! 💃`,
          fallbackTags,
          150
        );
      } else if (finalCaption.length > 150) {
        const inlineTags = finalCaption.match(/#[a-zA-Z0-9_]+/g) || [];
        const bodyOnly = finalCaption.replace(/#[a-zA-Z0-9_]+/g, '').trim();
        finalCaption = fitCaptionWithHashtags(
          bodyOnly,
          inlineTags.length > 0 ? inlineTags : fallbackTags,
          150
        );
      }

      const result: DanceStoryboardResult = {
        title: parsed.title || `TikTok Dance (${danceStyle})`,
        danceStyle,
        bpmRange: beatTempo,
        choreoConcept: parsed.choreoConcept || '',
        soundRecommendation: parsed.soundRecommendation || `${musicVibe} (${beatTempo})`,
        outfitNotes: parsed.outfitNotes || outfitWardrobe,
        loopAnchorNote:
          parsed.loopAnchorNote ||
          'Outro End Pose kembali ke posisi awal Intro Start Pose untuk seamless infinite loop.',
        caption: finalCaption,
        hashtags: Array.isArray(parsed.hashtags) && parsed.hashtags.length > 0 ? parsed.hashtags : fallbackTags,
        scenes: normalizedScenes,
      };

      return NextResponse.json({ success: true, data: result, source: 'gemini' });
    }

    const fallbackResult = buildDanceFallback({
      danceMode,
      danceStyle,
      musicVibe,
      cameraDynamic,
      productName,
      outfitWardrobe,
      backgroundSetting,
      talentPersona,
      targetDuration: durationTarget,
      targetSceneCount: sceneTarget,
      targetPlatform,
      physicsConsistencyCheck: physicsConsistencyCheck !== false,
      refCount: refTotal,
      normalizedRoles,
      visualBible,
    });

    return NextResponse.json({ success: true, data: fallbackResult, source: 'smart-dance-template' });
  } catch (error: any) {
    const fallbackResult = buildDanceFallback({
      danceMode,
      danceStyle,
      musicVibe,
      cameraDynamic,
      productName,
      outfitWardrobe,
      backgroundSetting,
      talentPersona,
      targetDuration: durationTarget,
      targetSceneCount: sceneTarget,
      targetPlatform,
      physicsConsistencyCheck: physicsConsistencyCheck !== false,
      refCount: refTotal,
      normalizedRoles,
      visualBible,
    });
    return NextResponse.json({ success: true, data: fallbackResult, source: 'smart-dance-template' });
  }
}
