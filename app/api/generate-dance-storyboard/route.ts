import { NextRequest, NextResponse } from 'next/server';
import { Type } from '@google/genai';
import {
  generateWithFallback,
  parseSafeJson,
  buildNicheHashtags,
  fitCaptionWithHashtags,
} from '@/lib/gemini-ugc';
import type { DanceStoryboardResult, DanceStoryboardScene } from '@/types';

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
  talentPersona: string;
  targetDuration: number;
  targetSceneCount: number;
  targetPlatform: string;
  physicsConsistencyCheck: boolean;
}): DanceStoryboardResult {
  const {
    danceMode,
    danceStyle,
    musicVibe,
    cameraDynamic,
    productName,
    outfitWardrobe,
    talentPersona,
    targetDuration,
    targetSceneCount,
    targetPlatform,
    physicsConsistencyCheck,
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

  const baseSegments: Array<{
    beatLabel: string;
    choreo: string;
    cam: string;
    cameraAngle: string;
    visual: string;
    sfx: string;
    mood: string;
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
        ? `${talentPersona} masuk frame dengan pose pembuka enerjik sambil memegang ${safeProd} secara solid, menatap lensa di bawah cahaya natural.`
        : `${talentPersona} membuka frame dengan pose siap dance penuh energi, tatapan tajam ke kamera dan gerakan bahu sinkron ketukan intro.`,
      sfx: 'Intro riser whoosh & Finger snap click',
      mood: 'Pure visual dance intro. Pencahayaan natural stabil, tempo intro membangun antisipasi.',
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
        : `Puncak koreografi ${danceStyle} penuh energi di ruang terbuka/studio dengan gerakan kaki dan tangan serempak bersama irama bass drop.`,
      sfx: 'Heavy sub-bass beat drop hit & Crowd cheer shimmer',
      mood: 'Dynamic micro-zoom di tiap bass hit. Tanpa teks overlay & tanpa VO.',
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
    },
    {
      beatLabel: 'Outro • Freeze Pose & Seamless Loop',
      choreo: 'Freeze pose ikonik (peace sign / heart / pose stylish) mengikuti irama ketukan terakhir sebelum kembali ke posisi pembuka.',
      cam: 'Smooth Pull-Back Reveal perlahan dengan framing bersih vertikal 9:16.',
      cameraAngle: 'Front Camera / Selfie Mode (Clean Framing)',
      visual: isProductMode
        ? `${talentPersona} melakukan pose penutup elegan sambil menampilkan ${safeProd} secara utuh di bawah cahaya terarah konsisten.`
        : `${talentPersona} menahan pose ikonik penutup selama 1 detik agar video bisa looping mulus ke detik pertama.`,
      sfx: 'Final beat chime & Sparkle magic ting',
      mood: 'Loop-ready end frame tanpa teks layar maupun voice over.',
    },
    {
      beatLabel: 'Bridge Breakdown • Slow-Mo Wave',
      choreo: 'Body wave lambat dari bahu ke pinggul lalu isolate leher kiri-kanan seiring melodi bridge sebelum naik lagi.',
      cam: '360° Orbital Arc mengitari 45 derajat di sisi kiri penari.',
      cameraAngle: '360° Product Orbit / Spin (Putaran Produk)',
      visual: `Gerakan slow-motion halus menonjolkan kontrol tubuh ${talentPersona} dengan ${outfitWardrobe} di bawah rim light lembut.`,
      sfx: 'Slow-motion bass sweep & Synth shimmer',
      mood: 'Speed ramp 0.5x ke 1x, pencahayaan rim light bersih.',
    },
    {
      beatLabel: 'Encore Pose • Quick Turn Loop',
      choreo: 'Putar badan cepat menghadap belakang lalu menoleh balik ke kamera siap menyambung ke ketukan pertama.',
      cam: 'Whip Pan kiri ke kanan untuk menciptakan seamless loop.',
      cameraAngle: 'Panning & Whip Pan (Transisi Cepat)',
      visual: `${talentPersona} berputar mulus kembali ke posisi awal pembuka agar video terputar ulang mulus.`,
      sfx: 'Whip pan whoosh & Beat restart tick',
      mood: 'Loop continuity frame, tanpa floating text.',
    },
  ];

  const extraPool = baseSegments.slice(-2);
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
      imageReferenceNote: isProductMode
        ? 'Pastikan Produk & Outfit sesuai Gambar referensi yang sudah di attached'
        : 'Pastikan karakter & outfit penari konsisten dengan referensi visual',
      googleFlowPrompt: `[TikTok Dance Ref: ${danceStyle}] Scene ${idx + 1} (${seg.beatLabel}) - ${seg.cameraAngle}, ${seg.cam} - Dancer Action: ${seg.choreo}. ${seg.visual} - Tempo: ${beatTempo}, Intensity: ${intensity}, ${pureVisualToken}, ${physicsSnippet}, 9:16 vertical 60fps crisp smartphone video.`,
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
    talentPersona = 'Wanita Muda / Gen Z',
    targetDuration = 20,
    targetSceneCount = 6,
    targetPlatform = 'TikTok Shop',
    physicsConsistencyCheck = true,
  } = body || {};

  const isProductMode = danceMode !== 'Pure Viral Dance Trend';
  const sceneTarget = Math.max(4, Math.min(8, Number(targetSceneCount) || 6));
  const durationTarget = Math.max(10, Math.min(60, Number(targetDuration) || 20));
  const beatTempo = mapTempoToMotionEnum(musicVibe);
  const intensity = mapIntensityToMotionEnum(danceStyle, musicVibe);

  try {
    const prompt = `Kamu adalah Koreografer Viral TikTok & Creative Video Director profesional Indonesia.
Buatkan **Storyboard Dance ala TikTok Style** yang lengkap per bar/ketukan (beat-synced), enerjik, variatif, tidak monoton, dan mudah langsung dieksekusi syuting oleh kreator!

PARAMETER KOREOGRAFI & PRODUKSI:
- Mode Konten: "${danceMode}"
- Gaya Dance Utama: "${danceStyle}"
- Vibe Musik & Tempo: "${musicVibe}" (Estimasi: ${beatTempo})
- Gaya Kamera Utama: "${cameraDynamic}"
- Persona Penari: "${talentPersona}"
- Wardrobe / OOTD & Latar: "${outfitWardrobe}"
${isProductMode ? `- Produk yang Terintegrasi ke Dance: "${productName || 'Produk Utama'}" ${brandName ? `(Brand: ${brandName})` : ''} | USP: "${keySellingPoints || 'Nyaman, estetik, layak spill'}"` : '- Fokus: Murni tarian/koreografi viral & transisi tanpa jualan keras.'}
- Target Platform: "${targetPlatform}"
- Total Durasi: ${durationTarget} detik
- Jumlah Segmen Beat/Adegan: WAJIB TEPAT ${sceneTarget} segmen (jumlah integer durasi mendekati ${durationTarget}s)

ATURAN MUTLAK TIKTOK DANCE STORYBOARD (TANPA FLOATING TEXT & TANPA VOICE OVER):
1. DILARANG KERAS MEMBUAT NARASI FLOATING TEXT / POP-UP TEXT DI LAYAR! Video dance ini 100% bersih tanpa teks stiker melayang atau subtitle overlay.
2. DILARANG KERAS MEMBUAT NARASI VOICE OVER (VO) ATAU DIALOG UCAPAN! Fokus penuh hanya pada gerakan fisik koreografi, sinkronisasi ketukan musik, ekspresi visual, pergerakan kamera, pencahayaan, dan cue SFX beat.
3. Adegan 1 WAJIB menjadi Hook Visual 2-3 detik (pose pembuka, tatapan kamera, hand-snap atau gerakan antisipasi menuju beat drop).
4. Setiap segmen WAJIB memiliki:
   - \`beatCue\`: Penanda musik & hitungan tari yang jelas (misal: "Intro 1x8 (Ketukan 1-4)", "Pre-Chorus Match-Cut", "CHORUS BEAT DROP! (Ketukan 1-8)", "Outro Seamless Loop").
   - \`choreographyMove\`: Instruksi detail gerakan badan, koordinasi tangan/jari, bahu, pinggul, dan footwork agar mudah ditiru.
   - \`cameraChoreo\`: Instruksi spesifik gerakan kamera mengikuti ketukan (misal: "0.5x Ultra-Wide push-in di ketukan 4", "Crash zoom tiap kick drum", "Match-cut hand cover + whip pan").
   - \`soundEffect\`: Cue SFX/Foley beat musik yang hidup (misal: "Finger snap & Sub-bass drop", "Match-cut whoosh & Snare clap").
   - \`googleFlowPrompt\`: Prompt siap video AI yang WAJIB menyertakan "no floating text, no on-screen text overlay, no subtitles, no voiceover dialogue" dan dilarang menyebut overlay teks.
5. ${physicsConsistencyCheck ? 'PHYSICS & ANATOMY MANDATE: Semua gerakan tari wajib mematuhi batas biomekanika sendi manusia, kontak kaki dengan lantai yang solid, inersia tubuh realistis, genggaman 5 jari normal bila memegang barang, tanpa clipping/melayang di visualAction & googleFlowPrompt.' : ''}
6. \`caption\`: Buatkan 1 caption postingan media sosial ala TikTok Dance lengkap dengan 3-4 hashtag relevan (WAJIB <= 150 karakter total!).

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
                'googleFlowPrompt',
              ],
            },
          },
        },
        required: ['title', 'choreoConcept', 'soundRecommendation', 'outfitNotes', 'caption', 'scenes'],
      },
    };

    const raw = await generateWithFallback(
      prompt,
      config,
      'You are an elite TikTok Viral Dance Choreographer & Video Director. Create energetic, beat-synced pure visual dance storyboards with ZERO floating text overlays and ZERO voiceover dialogue. Enforce strict human biomechanics and physics in every scene.',
      20000
    );

    const parsed = parseSafeJson<any>(raw);
    if (parsed && Array.isArray(parsed.scenes) && parsed.scenes.length > 0) {
      const normalizedScenes: DanceStoryboardScene[] = parsed.scenes.map((sc: any, idx: number) => {
        const baseFlow =
          sc.googleFlowPrompt ||
          `[TikTok Dance Ref: ${danceStyle}] Scene ${idx + 1} (${sc.beatCue || ''}) - ${sc.visualAction || sc.choreographyMove} - Camera: ${sc.cameraChoreo || cameraDynamic} - natural human biomechanics, realistic inertia, 9:16 vertical 60fps.`;
        const cleanedFlow = baseFlow
          .replace(/\s*-?\s*On-Screen Pop-up Text Overlay:\s*["']?[^"'\-]+["']?/gi, '')
          .trim();
        const finalFlow = /no floating text|no on-screen text/i.test(cleanedFlow)
          ? cleanedFlow
          : `${cleanedFlow} - no floating text, no on-screen text overlay, no subtitles, no voiceover dialogue, pure visual dance & camera motion`;

        return {
          id: `dance_sc_${Date.now()}_${idx + 1}`,
          order: idx + 1,
          beatCue: sc.beatCue || `Bar ${idx + 1} • Ketukan 1–8`,
          choreographyMove: sc.choreographyMove || sc.visualAction || '',
          cameraChoreo: sc.cameraChoreo || cameraDynamic,
          cameraAngle: sc.cameraAngle || 'Medium Shot (Setengah Badan)',
          visualAction: sc.visualAction || sc.choreographyMove || '',
          popupText: '',
          soundEffect: sc.soundEffect || 'Sub-bass beat drop hit',
          dialogVO: '',
          notesMood: sc.notesMood || 'Pure visual beat-synced choreography.',
          duration: Math.max(1, Number(sc.duration) || 3),
          googleFlowPrompt: finalFlow,
          imageReferenceNote: isProductMode
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
      talentPersona,
      targetDuration: durationTarget,
      targetSceneCount: sceneTarget,
      targetPlatform,
      physicsConsistencyCheck: physicsConsistencyCheck !== false,
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
      talentPersona,
      targetDuration: durationTarget,
      targetSceneCount: sceneTarget,
      targetPlatform,
      physicsConsistencyCheck: physicsConsistencyCheck !== false,
    });
    return NextResponse.json({ success: true, data: fallbackResult, source: 'smart-dance-template' });
  }
}
