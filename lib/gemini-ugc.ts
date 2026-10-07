import { GoogleGenAI, Type } from '@google/genai';

// List of supported Gemini models with automatic cascading fallback
export const CANDIDATE_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-3.1-pro-preview',
];

// Lazy-safe Gemini AI client helper
export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Timeout helper
export function withTimeout<T>(promise: Promise<T>, ms: number, errorMessage = 'Request timed out'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMessage)), ms)),
  ]);
}

// High-speed multi-model generator with clean config & strict timeouts
export async function generateWithFallback(
  prompt: string,
  config: any,
  systemInstruction?: string,
  timeoutMs = 25000
): Promise<string | null> {
  const ai = getGeminiClient();
  if (!ai) return null;

  const requestConfig = {
    ...config,
    ...(systemInstruction ? { systemInstruction } : {}),
  };

  for (const model of CANDIDATE_MODELS) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model,
          contents: prompt,
          config: requestConfig,
        }),
        timeoutMs,
        `Timeout on model ${model}`
      );

      const text = response.text?.trim();
      if (text) {
        return text;
      }
    } catch (err: any) {
      const isQuota =
        err?.status === 429 ||
        err?.message?.includes('429') ||
        err?.message?.includes('Quota exceeded') ||
        err?.message?.includes('RESOURCE_EXHAUSTED');
      const isUnavailable =
        err?.status === 503 ||
        err?.message?.includes('503') ||
        err?.message?.includes('UNAVAILABLE') ||
        err?.message?.includes('high demand');

      if (isQuota) {
        console.log(`[Gemini AI] Quota limit reached for ${model}, switching to next candidate.`);
      } else if (isUnavailable) {
        console.log(`[Gemini AI] Model ${model} temporarily unavailable, switching to next candidate.`);
      } else {
        console.log(`[Gemini AI] Model ${model} fallback: ${err?.message || err}`);
      }
    }
  }

  return null;
}

// Clean JSON response helper
export function parseSafeJson<T>(rawText: string | null): T | null {
  if (!rawText) return null;
  try {
    let clean = rawText.trim();
    if (clean.startsWith('```json')) {
      clean = clean.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    } else if (clean.startsWith('```')) {
      clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    return JSON.parse(clean) as T;
  } catch (err) {
    console.error('Failed to parse JSON text from Gemini:', err, rawText);
    return null;
  }
}

// Category-specific rich fallback generator with dynamic target duration allocation & up to 9 scenes
export function formatShortCaption(productName: string, category: string = '', usp: string = ''): string {
  const cleanName = (productName || 'Produk Ini').replace(/\s+/g, ' ').trim().slice(0, 28);
  const options = [
    `Cobain ${cleanName}! Bikin makin pede & hasil nyata. Cek keranjang kuning mumpung promo! ✨ #RacunTikTok #fyp #TikTokShop`,
    `Stop scrolling! Ini rahasia ${cleanName} yang viral. Checkout sekarang mumpung diskon! 🔥 #TikTokShop #fyp #Viral`,
    `Jujur ${cleanName} ini worth it banget! Hasilnya terbukti nyata. Link di keranjang kuning ya 🛒 #RacunShop #fyp #Viral`,
    `Akhirnya nemu ${cleanName}! Praktis & kualitas juara. Cuss amankan di keranjang kuning! ⚡ #TikTokShop #fyp #UGC`,
  ];
  const chosen = options[Math.floor(Math.random() * options.length)];
  return chosen.length <= 150 ? chosen : chosen.slice(0, 147) + '...';
}

export function generateRichFallback(
  category: string,
  productName: string,
  targetDuration: number = 30,
  targetAudience: string = '',
  keySellingPoints: string = '',
  requestedSceneCount: number = 0,
  cameraAngleStyle: string = '',
  preferredCameraAngles: string[] = []
) {
  const normCat = (category || '').toLowerCase();
  const safeName = productName || 'Produk Pilihan';
  const safeUSP = keySellingPoints || 'Hasil terbukti nyata, praktis & aman bersertifikasi BPOM';

  // Rich 9-step template library
  const full9Scenes = [
    {
      cameraAngle: 'POV / Handheld (First-Person)',
      visualAction: `Kreator menatap kamera dengan tatapan kaget dan gesture tangan menyetop scroll sambil memperlihatkan kemasan ${safeName}.`,
      popupText: 'JANGAN SKIP DULU! 😱',
      soundEffect: 'Record scratch & Vine boom',
      dialogVO: `Stop scrolling! Ada satu rahasia ${safeName} yang wajib kalian tahu hari ini!`,
      notesMood: 'Gaya teks: Bold Red/Yellow. High energy expression.',
    },
    {
      cameraAngle: 'Extreme Close-up / Macro (Tekstur & Detail)',
      visualAction: `Zoom cepat ke ekspresi penasaran/masalah yang dialami audiens, lalu transisi cepat ke siluet ${safeName}.`,
      popupText: 'PERNAH ALAMI INI? 😫',
      soundEffect: 'Dramatic swoosh',
      dialogVO: `Dulu sering banget kesel sama masalah ini sampai akhirnya nemu solusi yang tepat.`,
      notesMood: 'Gaya teks: Chat Bubble. Pencahayaan dramatis.',
    },
    {
      cameraAngle: 'Medium Shot (Setengah Badan)',
      visualAction: `Kreator tersenyum lega sambil mengangkat kemasan asli ${safeName} sejajar wajah.`,
      popupText: `SOLUSI: ${safeName.toUpperCase()} ✨`,
      soundEffect: 'Sparkle chime & Ding',
      dialogVO: `Kenalin ${safeName}! Ini dia produk viral yang beneran ngerubah rutinitas harianku!`,
      notesMood: 'Gaya teks: Bouncy Glow. Transisi cerah.',
    },
    {
      cameraAngle: 'Close-up (Face / Ekspresi)',
      visualAction: `Sorotan tajam kemasan, segel, dan ciri visual khas ${safeName} dalam genggaman tangan.`,
      popupText: 'KUALITAS BINTANG 5 ⭐⭐⭐⭐⭐',
      soundEffect: 'Camera shutter & Pop',
      dialogVO: `Packaging dan build quality ${safeName} beneran rapi dan berkelas banget.`,
      notesMood: 'Gaya teks: Gold Badge. Detail kemasan produk.',
    },
    {
      cameraAngle: 'POV / Handheld (First-Person)',
      visualAction: `Demonstrasi membuka / mengaplikasikan tekstur ${safeName} secara detail dan higienis.`,
      popupText: 'TEKSTUR MEWAH & NYAMAN 🌿',
      soundEffect: 'ASMR Crisp & Smooth Whoosh',
      dialogVO: `Cara pakainya super gampang, teksturnya langsung nyaman dan kerasa bedanya dari pertama coba.`,
      notesMood: 'Gaya teks: Minimalist Subtitle. Lighting jernih.',
    },
    {
      cameraAngle: 'Side Profile 45° (Angle Samping)',
      visualAction: `Aksi pemakaian langsung ${safeName} dengan gestur santai dan ekspresi sangat menikmati.`,
      popupText: `${safeUSP.toUpperCase().slice(0, 30)} ⚡`,
      soundEffect: 'Ting sparkle',
      dialogVO: `${safeUSP}. Beneran ngebuktiin kalau klaimnya bukan sekadar omong kosong.`,
      notesMood: 'Gaya teks: Clean bullet points. Natural smile.',
    },
    {
      cameraAngle: 'Front Camera / Selfie Mode (Curhat Langsung)',
      visualAction: `Reaksi wajah puas tersenyum lebar dengan ekspresi terkesima melihat hasil ${safeName}.`,
      popupText: 'JUJUR GAK NYANGKA! 😍',
      soundEffect: 'Cheer & Success chime',
      dialogVO: `Hasilnya di luar dugaan, beneran ngebantu banget dan bikin makin pede!`,
      notesMood: 'Gaya teks: Heart pop emoji. Warm studio tone.',
    },
    {
      cameraAngle: 'Over the Shoulder (OTS)',
      visualAction: `Kreator memegang ${safeName} di samping wajah sambil memberikan gestur jempol mantap.`,
      popupText: 'SUPER WORTH IT! 💯',
      soundEffect: 'Cha-ching cash register',
      dialogVO: `Buat kalian yang mau coba ${safeName}, menurut aku ini 10/10 dan beneran wajib punya.`,
      notesMood: 'Gaya teks: Green verified badge.',
    },
    {
      cameraAngle: 'Low Angle (Hero / Powerful)',
      visualAction: `Kreator tersenyum antusias menunjuk ke pojok kiri bawah layar ke arah keranjang kuning dengan produk ${safeName}.`,
      popupText: 'BURUAN CHECKOUT DISKON! 🛒',
      soundEffect: 'Bell ring & Cha-ching',
      dialogVO: `Mumpung ${safeName} lagi ada voucher diskon & gratis ongkir, langsung klik keranjang kuning ya!`,
      notesMood: 'Gaya teks: Pulsing CTA Button. Urgent offer.',
    },
  ];

  const isHandsOnly =
    cameraAngleStyle.toLowerCase().includes('hand') ||
    cameraAngleStyle.toLowerCase().includes('tangan') ||
    cameraAngleStyle.toLowerCase().includes('faceless') ||
    (preferredCameraAngles && preferredCameraAngles.some((a) => a.toLowerCase().includes('tangan') || a.toLowerCase().includes('faceless')));

  const handsOnly9Scenes = [
    {
      cameraAngle: 'POV Hands-Only (Hanya Tangan & Produk)',
      visualAction: `Kamera sudut pandang pertama (POV) menyorot kedua tangan talent di atas meja estetik, memegang paket ${safeName} siap di-unboxing. 100% tanpa wajah.`,
      popupText: 'UNBOXING TIME! 📦✨',
      soundEffect: 'Box tape tear & Pop',
      dialogVO: `Akhirnya paket ${safeName} yang ditunggu-tunggu sampai juga! Yuk kita unboxing bareng.`,
      notesMood: 'Gaya teks: Minimalist Subtitle. Meja estetik rapi, tanpa muka.',
    },
    {
      cameraAngle: 'Top-Down Hands-Only (Tangan di Atas Meja)',
      visualAction: `Sudut kamera 90° tegak lurus ke meja. Tangan talent membuka segel box dan mengeluarkan kemasan fisik ${safeName} secara rapi dan satisfying.`,
      popupText: `OFFICIAL UNBOXING: ${safeName.toUpperCase()}`,
      soundEffect: 'ASMR Paper unwrap & Chime',
      dialogVO: `Begitu dibuka, kemasan aslinya beneran estetik dan premium banget.`,
      notesMood: 'Gaya teks: Clean Bouncy. Flat lay meja bersih.',
    },
    {
      cameraAngle: 'Extreme Close-up / Macro (Tekstur & Detail)',
      visualAction: `Close-up super makro. Jari-jemari tangan memutar kemasan ${safeName}, memperlihatkan segel resmi, detail aplikator, dan label original.`,
      popupText: 'DETAIL KEMASAN 100% ORI 🔍',
      soundEffect: 'Camera shutter click',
      dialogVO: `Perhatiin detail segel dan ciri kemasannya, rapi dan build quality-nya berkelas.`,
      notesMood: 'Gaya teks: Gold Badge. Pencahayaan makro tajam.',
    },
    {
      cameraAngle: 'Hand Swatch & Application (Tangan Mengoles Produk)',
      visualAction: `Tangan talent mengaplikasikan/mengoleskan tekstur produk ${safeName} langsung di punggung tangan atau permukaan uji secara satisfying.`,
      popupText: 'TEKSTUR SUPER SATISFYING 🌿',
      soundEffect: 'ASMR Crisp Glide & Swirl',
      dialogVO: `Nah ini yang paling satisfying! Teksturnya langsung nyaman, gampang diratakan, dan gak lengket sama sekali.`,
      notesMood: 'Gaya teks: Glassmorphism Tag. Fokus gerakan jari.',
    },
    {
      cameraAngle: 'Hands-Only / Tangan Saja (Faceless / Tanpa Wajah)',
      visualAction: `Kedua tangan memperagakan cara pemakaian praktis ${safeName}, mendemonstrasikan keunggulan ${safeUSP}.`,
      popupText: `${safeUSP.toUpperCase().slice(0, 30)} ⚡`,
      soundEffect: 'Sparkle Ding',
      dialogVO: `Tinggal diaplikasikan secukupnya, hasilnya instan kerasa bedanya.`,
      notesMood: 'Gaya teks: Bullet point checklist. Aksi tangan jelas.',
    },
    {
      cameraAngle: 'POV Hands-Only (Hanya Tangan & Produk)',
      visualAction: `Tangan kanan memegang produk ${safeName}, tangan kiri memberikan gestur jempol puas di depan meja estetik.`,
      popupText: 'RATING: 10/10 MUST BUY! ⭐',
      soundEffect: 'Success bell & Cha-ching',
      dialogVO: `Jujur dari segi performa dan kualitas, ini beneran melebihi ekspektasi.`,
      notesMood: 'Gaya teks: Star Rating Badge. Gestur tangan puas.',
    },
    {
      cameraAngle: 'Top-Down Hands-Only (Tangan di Atas Meja)',
      visualAction: `Tangan talent menjejerkan produk ${safeName} dengan rapi di atas meja di sebelah aksesoris estetik.`,
      popupText: 'SUPER AESTHETIC & WORTH IT 💯',
      soundEffect: 'Soft pop & Chime',
      dialogVO: `Wajar kalau produk ini sering sold out di mana-mana.`,
      notesMood: 'Gaya teks: Verified badge.',
    },
    {
      cameraAngle: 'Hand Swatch & Application (Tangan Mengoles Produk)',
      visualAction: `Tangan mengetuk-ngetuk kemasan produk (ASMR Tapping) lalu menunjukkan sisa pemakaian yang bersih dan higienis.`,
      popupText: 'ASMR TAPPING SATISFYING 🎧',
      soundEffect: 'Crisp ASMR Tapping',
      dialogVO: `Praktis dibawa ke mana-mana dan gak ribet sama sekali.`,
      notesMood: 'Gaya teks: Floating glow text.',
    },
    {
      cameraAngle: 'Hands-Only / Tangan Saja (Faceless / Tanpa Wajah)',
      visualAction: `Tangan talent memegang produk ${safeName} dan jari telunjuk menunjuk langsung ke pojok kiri bawah layar ke arah ikon keranjang kuning TikTok Shop.`,
      popupText: 'KLIK KERANJANG KUNING SEKARANG! 🛒👇',
      soundEffect: 'Cash register cha-ching & Bell',
      dialogVO: `Mumpung lagi diskon & gratis ongkir, langsung checkout di keranjang kuning sekarang sebelum kehabisan!`,
      notesMood: 'Gaya teks: Pulsing CTA Button. Tangan menunjuk keranjang kuning.',
    },
  ];

  // If specific camera angles or style requested, dynamically customize camera angles
  const availableAngles = preferredCameraAngles && preferredCameraAngles.length > 0
    ? preferredCameraAngles
    : cameraAngleStyle.toLowerCase().includes('hand') || cameraAngleStyle.toLowerCase().includes('tangan') || cameraAngleStyle.toLowerCase().includes('faceless')
    ? ['Hands-Only / Tangan Saja (Faceless / Tanpa Wajah)', 'POV Hands-Only (Hanya Tangan & Produk)', 'Top-Down Hands-Only (Tangan di Atas Meja)', 'Hand Swatch & Application (Tangan Mengoles Produk)', 'Unboxing Hands-Only (Buka Paket Tangan Saja)', 'Extreme Close-up / Macro (Tekstur & Detail)']
    : cameraAngleStyle.toLowerCase().includes('macro')
    ? ['Extreme Close-up / Macro (Tekstur & Detail)', 'Flat Lay / Top-down (Meja Estetik)', 'Slow Zoom-In Push (Dramatis Fokus)', 'Close-up (Face / Ekspresi)']
    : cameraAngleStyle.toLowerCase().includes('pov')
    ? ['POV / Handheld (First-Person)', 'Over the Shoulder (OTS)', 'Close-up (Face / Ekspresi)', 'Medium Close-up (Dada ke Atas)']
    : cameraAngleStyle.toLowerCase().includes('flat')
    ? ['Flat Lay / Top-down (Meja Estetik)', 'Bird\'s Eye View (Overhead 90°)', 'Extreme Close-up / Macro (Tekstur & Detail)', 'Over the Shoulder (OTS)']
    : cameraAngleStyle.toLowerCase().includes('front') || cameraAngleStyle.toLowerCase().includes('selfie')
    ? ['Front Camera / Selfie Mode (Curhat Langsung)', 'Eye-Level (Natural Eye)', 'Close-up (Face / Ekspresi)', 'Side Profile 45° (Angle Samping)']
    : cameraAngleStyle.toLowerCase().includes('cinematic') || cameraAngleStyle.toLowerCase().includes('orbit')
    ? ['360° Product Orbit / Spin (Putaran Produk)', 'Tracking Following Shot (Gerak Mengikuti)', 'Low Angle (Hero / Powerful)', 'Slow Zoom-In Push (Dramatis Fokus)']
    : cameraAngleStyle.toLowerCase().includes('hero') || cameraAngleStyle.toLowerCase().includes('low')
    ? ['Low Angle (Hero / Powerful)', 'Worm\'s Eye View (Ground-Level Dramatis)', 'Medium Shot (Setengah Badan)', 'Tracking Following Shot (Gerak Mengikuti)']
    : cameraAngleStyle.toLowerCase().includes('dutch')
    ? ['Dutch Angle (Tilted / Shock Dramatis)', 'Crash Zoom-Out (Efek Kaget / Reveal)', 'POV / Handheld (First-Person)', 'Close-up (Face / Ekspresi)']
    : cameraAngleStyle.toLowerCase().includes('mirror')
    ? ['Mirror Reflection Shot (Kaca GRWM)', 'Side Profile 45° (Angle Samping)', 'Eye-Level (Natural Eye)', 'Close-up (Face / Ekspresi)']
    : ['POV / Handheld (First-Person)', 'Extreme Close-up / Macro (Tekstur & Detail)', 'Over the Shoulder (OTS)', 'Medium Shot (Setengah Badan)', 'Front Camera / Selfie Mode (Curhat Langsung)'];

  // Determine scene count (user can specify up to 9 scenes even for 10s)
  let desiredCount = requestedSceneCount && requestedSceneCount >= 2 && requestedSceneCount <= 9
    ? requestedSceneCount
    : (normCat.includes('before') ? 6 : 5);

  if (requestedSceneCount >= 2 && requestedSceneCount <= 9) {
    desiredCount = requestedSceneCount;
  }

  const source9Scenes = isHandsOnly ? handsOnly9Scenes : full9Scenes;

  // Select evenly spaced scenes from source9Scenes
  let selectedBase: typeof source9Scenes = [];
  if (desiredCount === 9) {
    selectedBase = source9Scenes;
  } else if (desiredCount === 8) {
    selectedBase = [source9Scenes[0], source9Scenes[1], source9Scenes[2], source9Scenes[3], source9Scenes[4], source9Scenes[5], source9Scenes[6], source9Scenes[8]];
  } else if (desiredCount === 7) {
    selectedBase = [source9Scenes[0], source9Scenes[1], source9Scenes[2], source9Scenes[4], source9Scenes[5], source9Scenes[6], source9Scenes[8]];
  } else if (desiredCount === 6) {
    selectedBase = [source9Scenes[0], source9Scenes[1], source9Scenes[2], source9Scenes[4], source9Scenes[6], source9Scenes[8]];
  } else if (desiredCount === 5) {
    selectedBase = [source9Scenes[0], source9Scenes[2], source9Scenes[4], source9Scenes[6], source9Scenes[8]];
  } else if (desiredCount === 4) {
    selectedBase = [source9Scenes[0], source9Scenes[2], source9Scenes[5], source9Scenes[8]];
  } else if (desiredCount === 3) {
    selectedBase = [source9Scenes[0], source9Scenes[4], source9Scenes[8]];
  } else {
    selectedBase = [source9Scenes[0], source9Scenes[8]];
  }

  const dur = Math.max(5, Number(targetDuration) || 30);
  const baseDur = Math.max(1, Math.floor(dur / selectedBase.length));
  let remainingTime = dur - (baseDur * selectedBase.length);

  const scenes = selectedBase.map((sc, i) => {
    let sceneDuration = baseDur;
    if (i === selectedBase.length - 1 && remainingTime > 0) {
      sceneDuration += remainingTime;
    } else if (remainingTime > 0 && i % 2 === 1) {
      sceneDuration += 1;
      remainingTime -= 1;
    }

    // Apply preferred camera angle if specified
    let angle = sc.cameraAngle;
    if (availableAngles.length > 0) {
      angle = availableAngles[i % availableAngles.length];
    }

    return {
      ...sc,
      cameraAngle: angle,
      duration: sceneDuration,
    };
  });

  return {
    title: `Storyboard ${category || 'UGC'} - ${safeName}`,
    targetAudienceSummary: targetAudience || 'Pengguna aktif TikTok & Reels yang mencari produk viral berkualitas',
    hookTip: 'Hook visual 3 detik pertama dengan ekspresi ekspresif & text overlay kontras tinggi untuk memicu retensi.',
    caption: formatShortCaption(safeName, category, safeUSP),
    scenes,
  };
}

export function heuristicAutoDetect(rawInputCombined: string, inputUrl = '', inputNotes = '', linkData?: any) {
  const combined = (rawInputCombined + ' ' + (linkData?.cleanedSummary || '')).toLowerCase();
  const cleanTextNoUrls = rawInputCombined.replace(/https?:\/\/\S+/gi, '').replace(/[#@][\w-]+/g, '').trim();
  const urlMatch = rawInputCombined.match(/https?:\/\/\S+/i);
  const detectedUrl = linkData?.finalUrl || (urlMatch ? urlMatch[0] : inputUrl);

  let detectedPersona = 'Semua (Netral Universal)';
  let detectedCameraStyle = 'Dinamis & Multi-Angle (Viral Fast-Cut)';
  let preferredCameraAngles: string[] = [
    'POV / Handheld (First-Person)',
    'Extreme Close-up / Macro (Tekstur & Detail)',
    'Over the Shoulder (OTS)',
    'Medium Shot (Setengah Badan)',
    'Front Camera / Selfie Mode (Curhat Langsung)',
  ];

  if (
    combined.includes('tangan') ||
    combined.includes('faceless') ||
    combined.includes('tanpa wajah') ||
    combined.includes('tanpa muka') ||
    combined.includes('hands-only') ||
    combined.includes('hands only') ||
    combined.includes('hand-only') ||
    combined.includes('swatch tangan')
  ) {
    detectedPersona = 'Kreator Faceless / Hanya Tangan (Tanpa Muka)';
    detectedCameraStyle = 'Hands-Only / Hanya Tangan (Faceless UGC)';
    preferredCameraAngles = [
      'Hands-Only / Tangan Saja (Faceless / Tanpa Wajah)',
      'POV Hands-Only (Hanya Tangan & Produk)',
      'Top-Down Hands-Only (Tangan di Atas Meja)',
      'Hand Swatch & Application (Tangan Mengoles Produk)',
      'Unboxing Hands-Only (Buka Paket Tangan Saja)',
      'Extreme Close-up / Macro (Tekstur & Detail)',
    ];
  } else if (combined.includes('dokter') || combined.includes('klinis') || combined.includes('medis') || combined.includes('kemenkes') || combined.includes('ahli')) {
    detectedPersona = 'Dokter / Tenaga Medis / Ahli Edukasi';
    detectedCameraStyle = 'Front Camera / Selfie Talk (Vlog Santai)';
    preferredCameraAngles = ['Front Camera / Selfie Mode (Curhat Langsung)', 'Eye-Level (Natural Eye)', 'Close-up (Face / Ekspresi)', 'Medium Close-up (Dada ke Atas)'];
  } else if (combined.includes('kos') || combined.includes('kosan') || combined.includes('anak kos') || combined.includes('mahasiswa') || combined.includes('hemat') || combined.includes('murah')) {
    detectedPersona = 'Mahasiswa Hemat / Anak Kosan';
    detectedCameraStyle = 'POV & Handheld Dominan (Teman Curhat)';
    preferredCameraAngles = ['POV / Handheld (First-Person)', 'Close-up (Face / Ekspresi)', 'Over the Shoulder (OTS)', 'Medium Shot (Setengah Badan)'];
  } else if (combined.includes('busui') || combined.includes('hamil') || combined.includes('menyusui') || combined.includes('pejuang asi') || combined.includes('bayi')) {
    detectedPersona = 'Ibu Hamil & Menyusui (Busui)';
    detectedCameraStyle = 'POV & Handheld Dominan (Teman Curhat)';
    preferredCameraAngles = ['POV / Handheld (First-Person)', 'Close-up (Face / Ekspresi)', 'Extreme Close-up / Macro (Tekstur & Detail)', 'Over the Shoulder (OTS)'];
  } else if (combined.includes('hijab') || combined.includes('hijaber') || combined.includes('gamis') || combined.includes('kerudung') || combined.includes('muslimah')) {
    detectedPersona = 'Hijaber Trendy / Muslimah Modern';
    detectedCameraStyle = 'Mirror Reflection Shot & GRWM (Get Ready With Me)';
    preferredCameraAngles = ['Mirror Reflection Shot (Kaca GRWM)', 'Side Profile 45° (Angle Samping)', 'Eye-Level (Natural Eye)', 'Close-up (Face / Ekspresi)'];
  } else if (combined.includes('ibu') || combined.includes('anak') || combined.includes('dapur') || combined.includes('rumahtangga') || combined.includes('masak')) {
    detectedPersona = 'Ibu Muda / Mama Hemat Cerdas';
    detectedCameraStyle = 'POV & Handheld Dominan (Teman Curhat)';
    preferredCameraAngles = ['POV / Handheld (First-Person)', 'Over the Shoulder (OTS)', 'Close-up (Face / Ekspresi)', 'Medium Shot (Setengah Badan)'];
  } else if (combined.includes('serum') || combined.includes('skincare') || combined.includes('jerawat') || combined.includes('acne') || combined.includes('glowing') || combined.includes('brightening') || combined.includes('kulit')) {
    detectedPersona = 'Beauty & Skincare Junkie';
    detectedCameraStyle = 'Macro & Extreme Close-up Detail (Tekstur & Formula)';
    preferredCameraAngles = ['Extreme Close-up / Macro (Tekstur & Detail)', 'Flat Lay / Top-down (Meja Estetik)', 'Slow Zoom-In Push (Dramatis Fokus)', 'Split-Screen Multi-Angle (Dua Sudut Sekaligus)'];
  } else if (combined.includes('kantor') || combined.includes('wfh') || combined.includes('kerja') || combined.includes('corporate') || combined.includes('scbd')) {
    detectedPersona = 'Wanita Karir / Corporate Office';
    detectedCameraStyle = 'Front Camera / Selfie Talk (Vlog Santai)';
    preferredCameraAngles = ['Front Camera / Selfie Mode (Curhat Langsung)', 'Eye-Level (Natural Eye)', 'Close-up (Face / Ekspresi)', 'Medium Shot (Setengah Badan)'];
  } else if (combined.includes('gym') || combined.includes('otot') || combined.includes('workout') || combined.includes('fitness') || combined.includes('creatine') || combined.includes('whey')) {
    detectedPersona = 'Cowok Gym & Fitness Bro';
    detectedCameraStyle = 'Low-Angle & Dynamic Hero Shot (Keren & Berwibawa)';
    preferredCameraAngles = ['Low Angle (Hero / Powerful)', 'Tracking Following Shot (Gerak Mengikuti)', 'Medium Shot (Setengah Badan)', "Worm's Eye View (Ground-Level Dramatis)"];
  } else if (combined.includes('motor') || combined.includes('mobil') || combined.includes('bikers') || combined.includes('otomotif') || combined.includes('helm') || combined.includes('kinclong')) {
    detectedPersona = 'Otomotif & Bikers / Car Enthusiast';
    detectedCameraStyle = 'Cinematic Commercial & 360° Orbit (Iklan Mewah)';
    preferredCameraAngles = ['360° Product Orbit / Spin (Putaran Produk)', 'Tracking Following Shot (Gerak Mengikuti)', 'Low Angle (Hero / Powerful)', 'Slow Zoom-In Push (Dramatis Fokus)'];
  } else if (combined.includes('gaming') || combined.includes('streamer') || combined.includes('game') || combined.includes('rgb') || combined.includes('setup')) {
    detectedPersona = 'Gamer & Streamer';
    detectedCameraStyle = 'Flat Lay & Top-Down (Unboxing Meja Estetik)';
    preferredCameraAngles = ['Flat Lay / Top-down (Meja Estetik)', "Bird's Eye View (Overhead 90°)", 'Over the Shoulder (OTS)', 'Close-up (Face / Ekspresi)'];
  } else if (combined.includes('gadget') || combined.includes('keyboard') || combined.includes('unboxing') || combined.includes('elektronik') || combined.includes('mouse') || combined.includes('tws') || combined.includes('headset')) {
    detectedPersona = 'Tech & Gadget Enthusiast';
    detectedCameraStyle = 'Flat Lay & Top-Down (Unboxing Meja Estetik)';
    preferredCameraAngles = ['Flat Lay / Top-down (Meja Estetik)', 'Extreme Close-up / Macro (Tekstur & Detail)', "Bird's Eye View (Overhead 90°)", 'Slow Zoom-In Push (Dramatis Fokus)'];
  } else if (combined.includes('makanan') || combined.includes('camilan') || combined.includes('snack') || combined.includes('pedas') || combined.includes('keripik') || combined.includes('kuliner')) {
    detectedPersona = 'Foodie & Kuliner / Home Chef';
    detectedCameraStyle = 'Macro & Extreme Close-up Detail (Tekstur & Formula)';
    preferredCameraAngles = ['Extreme Close-up / Macro (Tekstur & Detail)', 'Flat Lay / Top-down (Meja Estetik)', 'POV / Handheld (First-Person)', 'Close-up (Face / Ekspresi)'];
  } else if (combined.includes('kucing') || combined.includes('anjing') || combined.includes('anabul') || combined.includes('pet')) {
    detectedPersona = 'Pet Parent / Pecinta Hewan';
    detectedCameraStyle = 'POV & Handheld Dominan (Teman Curhat)';
    preferredCameraAngles = ['POV / Handheld (First-Person)', 'Close-up (Face / Ekspresi)', 'Over the Shoulder (OTS)', 'Medium Shot (Setengah Badan)'];
  } else if (combined.includes('travel') || combined.includes('koper') || combined.includes('liburan') || combined.includes('gunung')) {
    detectedPersona = 'Traveler / Backpacker & Petualang';
    detectedCameraStyle = 'POV & Handheld Dominan (Teman Curhat)';
    preferredCameraAngles = ['POV / Handheld (First-Person)', 'Wide Shot (Ruangan / Full Body)', 'Tracking Following Shot (Gerak Mengikuti)', 'Front Camera / Selfie Mode (Curhat Langsung)'];
  } else if (combined.includes('pomade') || combined.includes('parfum pria') || combined.includes('cukur') || combined.includes('grooming') || combined.includes('gentleman')) {
    detectedPersona = 'Pria Grooming & Maskulin';
    detectedCameraStyle = 'Mirror Reflection Shot & GRWM (Get Ready With Me)';
    preferredCameraAngles = ['Mirror Reflection Shot (Kaca GRWM)', 'Side Profile 45° (Angle Samping)', 'Close-up (Face / Ekspresi)', 'Low Angle (Hero / Powerful)'];
  } else if (combined.includes('bapak') || combined.includes('buncit') || combined.includes('kopi')) {
    detectedPersona = 'Pria Dewasa / Bapak Relatable';
    detectedCameraStyle = 'Front Camera / Selfie Talk (Vlog Santai)';
    preferredCameraAngles = ['Front Camera / Selfie Mode (Curhat Langsung)', 'Eye-Level (Natural Eye)', 'Close-up (Face / Ekspresi)', 'Medium Shot (Setengah Badan)'];
  } else if (combined.includes('pria') || combined.includes('cowok')) {
    detectedPersona = 'Pria Muda / Gen Z Bro';
    detectedCameraStyle = 'POV & Handheld Dominan (Teman Curhat)';
    preferredCameraAngles = ['POV / Handheld (First-Person)', 'Over the Shoulder (OTS)', 'Close-up (Face / Ekspresi)', 'Medium Shot (Setengah Badan)'];
  } else if (combined.includes('fashion') || combined.includes('hoodie') || combined.includes('outfit') || combined.includes('baju')) {
    detectedPersona = 'Fashion Stylist / OOTD Enthusiast';
    detectedCameraStyle = 'Mirror Reflection Shot & GRWM (Get Ready With Me)';
    preferredCameraAngles = ['Mirror Reflection Shot (Kaca GRWM)', 'Wide Shot (Ruangan / Full Body)', 'Side Profile 45° (Angle Samping)', 'Close-up (Face / Ekspresi)'];
  } else {
    detectedPersona = 'Semua (Netral Universal)';
    detectedCameraStyle = 'Dinamis & Multi-Angle (Viral Fast-Cut)';
    preferredCameraAngles = ['POV / Handheld (First-Person)', 'Extreme Close-up / Macro (Tekstur & Detail)', 'Over the Shoulder (OTS)', 'Medium Shot (Setengah Badan)', 'Front Camera / Selfie Mode (Curhat Langsung)'];
  }

  // Determine Product Name candidate
  let detectedName = linkData?.productName || '';
  if (!detectedName && cleanTextNoUrls) {
    const firstPhrase = cleanTextNoUrls.split(/[\n,\.\-–—!]/)[0]?.trim();
    if (firstPhrase && firstPhrase.length >= 3 && firstPhrase.length <= 60) {
      detectedName = firstPhrase;
    }
  }
  if (!detectedName) detectedName = 'Produk Unggulan Pilihan';

  let detectedBrand = linkData?.brand || '';
  let detectedDesc = linkData?.ogDescription || linkData?.metaDescription || (cleanTextNoUrls || inputNotes || 'Produk viral yang banyak dicari di media sosial dengan ulasan positif.');
  let detectedCat = 'Review';
  let detectedPlatform = linkData?.platform === 'Shopee' ? 'Shopee Video' : linkData?.platform === 'Tokopedia' ? 'Tokopedia' : 'TikTok Shop';
  let detectedDuration = 30;
  let detectedTone = 'Santai, Relatable & Meyakinkan';
  let detectedUSP = 'Kualitas terjamin, harga terjangkau, dan hasil nyata terbukti.';
  let detectedAudience = 'Pengguna aktif TikTok & Shopee usia 18-35 tahun';
  const detectedTags: string[] = [];

  if (cleanTextNoUrls) {
    const firstPhrase = cleanTextNoUrls.split(/[\n,\.\-–—!]/)[0]?.trim();
    if (firstPhrase && firstPhrase.length >= 3 && firstPhrase.length <= 60) {
      detectedName = firstPhrase;
    }
  }

  if (combined.includes('shopee')) {
    detectedPlatform = 'Shopee Video';
    detectedTags.push('Shopee Racun');
  } else if (combined.includes('instagram')) {
    detectedPlatform = 'Instagram Reels';
    detectedTags.push('Instagram Reels');
  } else if (combined.includes('youtube')) {
    detectedPlatform = 'YouTube Shorts';
    detectedTags.push('Shorts');
  } else if (combined.includes('tokopedia')) {
    detectedPlatform = 'TikTok Shop';
    detectedTags.push('Tokopedia');
  } else {
    detectedPlatform = 'TikTok Shop';
    detectedTags.push('TikTok Shop');
  }

  if (combined.includes('unboxing') || combined.includes('haul') || combined.includes('buka paket')) {
    detectedCat = 'Unboxing';
    detectedUSP = 'Packaging aman premium, kelengkapan lengkap, garansi resmi.';
  } else if (combined.includes('sebelum') || combined.includes('sesudah') || combined.includes('diet') || combined.includes('slimming') || combined.includes('jerawat') || combined.includes('flek')) {
    detectedCat = 'Before & After';
    detectedUSP = 'Hasil nyata terlihat dalam hitungan hari, aman dan bersertifikasi.';
  } else if (combined.includes('tutorial') || combined.includes('cara pakai') || combined.includes('step')) {
    detectedCat = 'Tutorial';
    detectedUSP = 'Sangat mudah diaplikasikan, praktis untuk pemula sehari-hari.';
  } else if (combined.includes('review') || combined.includes('honest') || combined.includes('jujur')) {
    detectedCat = 'Review';
    detectedUSP = 'Formula berkualitas tinggi, rating 4.9/5 dari ribuan pembeli.';
  } else if (combined.includes('daily') || combined.includes('vlog') || combined.includes('rutinitas')) {
    detectedCat = 'Daily Vlog';
  } else if (combined.includes('grwm') || combined.includes('makeup') || combined.includes('outfit')) {
    detectedCat = 'GRWM';
  }

  if (combined.includes('kopi') || combined.includes('coffee') || combined.includes('diet') || combined.includes('slimming') || combined.includes('langsing')) {
    if (!cleanTextNoUrls || detectedName === 'Produk Unggulan Pilihan') detectedName = 'Sago Slimming Green Coffee';
    detectedCat = 'Before & After';
    detectedDesc = 'Kopi herbal penurun nafsu makan alami untuk menjaga berat badan ideal tanpa rasa pahit.';
    detectedUSP = 'Bikin kenyang lebih lama, metabolisme lancar, aman di lambung & bersertifikasi BPOM.';
    detectedAudience = 'Pria & wanita usia 22-45 tahun yang ingin badan lebih fit dan ramping.';
    detectedTags.push('Diet Sehat', 'Herbal Coffee');
  } else if (combined.includes('serum') || combined.includes('skincare') || combined.includes('jerawat') || combined.includes('acne') || combined.includes('glowing') || combined.includes('brightening')) {
    if (!cleanTextNoUrls || detectedName === 'Produk Unggulan Pilihan') detectedName = 'Glow Niacinamide Barrier Serum';
    detectedCat = 'Review';
    detectedDesc = 'Serum pencerah wajah dengan 10% Niacinamide murni yang merawat skin barrier dan memudarkan flek.';
    detectedUSP = 'Mencerahkan dalam 7 hari, tekstur ringan cepat meresap, non-comedogenic.';
    detectedAudience = 'Wanita & pria 18-35 tahun dengan masalah kulit kusam atau bekas jerawat.';
    detectedTags.push('Skincare Viral', 'Glowing Skin');
  } else if (combined.includes('keyboard') || combined.includes('headset') || combined.includes('tws') || combined.includes('gadget') || combined.includes('mouse')) {
    if (!cleanTextNoUrls || detectedName === 'Produk Unggulan Pilihan') detectedName = 'Wireless Ergonomic Mechanical Keyboard';
    detectedCat = 'Unboxing';
    detectedDesc = 'Keyboard wireless multi-device dengan tactile switch empuk dan lampu RGB estetik.';
    detectedUSP = 'Baterai awet hingga 3 bulan, switch hening, koneksi bluetooth stabil 3 perangkat.';
    detectedAudience = 'Pekerja WFH, content creator, dan gamers usia 18-35 tahun.';
    detectedTags.push('Setup Desk', 'Tech Gadget');
  } else if (combined.includes('baju') || combined.includes('hoodie') || combined.includes('outfit') || combined.includes('fashion') || combined.includes('dress')) {
    if (!cleanTextNoUrls || detectedName === 'Produk Unggulan Pilihan') detectedName = 'Korean Oversized Fleece Hoodie';
    detectedCat = 'Haul';
    detectedDesc = 'Hoodie streetwear bahan fleece tebal premium dengan potongan oversize korean style.';
    detectedUSP = 'Bahan lembut tidak panas, jahitan rapi kuat, promo diskon voucher toko.';
    detectedAudience = 'Gen Z dan remaja 16-28 tahun yang suka mix and match outfit kekinian.';
    detectedTags.push('OOTD', 'Korean Fashion');
  }

  return {
    productName: detectedName,
    brandName: detectedBrand,
    productUrl: detectedUrl,
    category: detectedCat,
    productDescription: detectedDesc,
    targetAudience: detectedAudience,
    keySellingPoints: detectedUSP,
    persona: detectedPersona,
    tone: detectedTone,
    cameraAngleStyle: detectedCameraStyle,
    preferredCameraAngles,
    targetPlatform: detectedPlatform,
    targetDuration: detectedDuration,
    detectedTags,
    detectionSummary: `Berhasil mendeteksi otomatis produk "${detectedName}" untuk kategori ${detectedCat}.`,
  };
}
