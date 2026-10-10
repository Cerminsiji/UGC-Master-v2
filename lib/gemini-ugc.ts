import { GoogleGenAI, Type } from '@google/genai';
import { detectKnownBrand, isGenericMarketplaceFallback, isLikelyShortcodeOrHash, cleanMarketplaceProductName } from './link-extractor';

// List of supported Gemini models with automatic cascading fallback
export const CANDIDATE_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-3.8-flash',
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
  preferredCameraAngles: string[] = [],
  referenceImage: string = ''
) {
  const normCat = (category || '').toLowerCase();
  const safeName = productName || 'Produk Pilihan';
  const safeUSP = keySellingPoints || 'Hasil terbukti nyata, praktis & aman bersertifikasi BPOM';

  // Rich 9-step template library with Google Flow AI Video prompts following reference image
  const full9Scenes = [
    {
      cameraAngle: 'POV / Handheld (First-Person)',
      visualAction: `Kreator menatap kamera dengan tatapan kaget dan gesture tangan menyetop scroll sambil memperlihatkan kemasan ${safeName} sesuai referensi image.`,
      popupText: 'JANGAN SKIP DULU! 😱',
      soundEffect: 'Record scratch & Vine boom',
      dialogVO: `Stop scrolling! Ada satu rahasia ${safeName} yang wajib kalian tahu hari ini!`,
      notesMood: 'Gaya teks: Bold Red/Yellow. High energy expression.',
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] First-person POV handheld smartphone recording, UGC creator gasping with genuine excitement while holding ${safeName} packaging facing the camera, strict packaging and label consistency with reference image, dynamic 9:16 vertical video, natural warm indoor lighting, sharp focus, photorealistic 4k 60fps.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di upload',
    },
    {
      cameraAngle: 'Extreme Close-up / Macro (Tekstur & Detail)',
      visualAction: `Zoom cepat ke ekspresi penasaran/masalah yang dialami audiens, lalu transisi cepat ke siluet kemasan ${safeName} persis seperti gambar referensi.`,
      popupText: 'PERNAH ALAMI INI? 😫',
      soundEffect: 'Dramatic swoosh',
      dialogVO: `Dulu sering banget kesal sama masalah ini sampai akhirnya nemu solusi yang tepat.`,
      notesMood: 'Gaya teks: Chat Bubble. Pencahayaan dramatis.',
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] Extreme macro close-up slow zoom-in on the surface, texture, and physical details of ${safeName}, pristine cosmetic product details matching reference image, soft diffused studio light, vertical 9:16 UGC style, 4k 60fps.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di upload',
    },
    {
      cameraAngle: 'Medium Shot (Setengah Badan)',
      visualAction: `Kreator tersenyum lega sambil mengangkat kemasan asli ${safeName} sejajar wajah sesuai proporsi referensi image.`,
      popupText: `SOLUSI: ${safeName.toUpperCase()} ✨`,
      soundEffect: 'Sparkle chime & Ding',
      dialogVO: `Kenalin ${safeName}! Ini dia produk viral yang beneran mengubah rutinitas harianku!`,
      notesMood: 'Gaya teks: Bouncy Glow. Transisi cerah.',
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] Medium shot of relatable creator holding up original ${safeName} product beside their face with a relieved, happy smile, identical branding to reference image, bright aesthetic room backdrop, vertical 9:16, crisp mobile video quality.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di upload',
    },
    {
      cameraAngle: 'Close-up (Face / Ekspresi)',
      visualAction: `Sorotan tajam kemasan, segel, dan ciri visual khas ${safeName} dalam genggaman tangan, merefleksikan detail referensi image.`,
      popupText: 'KUALITAS BINTANG 5 ⭐⭐⭐⭐⭐',
      soundEffect: 'Camera shutter & Pop',
      dialogVO: `Packaging dan build quality ${safeName} beneran rapi dan berkelas banget.`,
      notesMood: 'Gaya teks: Gold Badge. Detail kemasan produk.',
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] Close-up product hero shot in creator's hand rotating slowly 45 degrees, showing authentic security seal and brand typography matching reference image, cinematic depth of field, 9:16 TikTok UGC style.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di upload',
    },
    {
      cameraAngle: 'POV / Handheld (First-Person)',
      visualAction: `Demonstrasi membuka atau mengaplikasikan tekstur ${safeName} secara detail dan higienis dengan warna konsisten terhadap referensi image.`,
      popupText: 'TEKSTUR MEWAH & NYAMAN 🌿',
      soundEffect: 'ASMR Crisp & Smooth Whoosh',
      dialogVO: `Cara pakainya super gampang, teksturnya langsung nyaman dan kerasa bedanya dari pertama coba.`,
      notesMood: 'Gaya teks: Minimalist Subtitle. Lighting jernih.',
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] Handheld POV demonstration of opening and applying formula of ${safeName}, smooth texture glide, clean aesthetic setup, visual colors and consistency matching reference image, 4k 60fps vertical 9:16.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di upload',
    },
    {
      cameraAngle: 'Side Profile 45° (Angle Samping)',
      visualAction: `Aksi pemakaian langsung ${safeName} dengan gestur santai dan ekspresi sangat menikmati, memperlihatkan kemasan produk secara natural.`,
      popupText: `${safeUSP.toUpperCase().slice(0, 30)} ⚡`,
      soundEffect: 'Ting sparkle',
      dialogVO: `${safeUSP}. Beneran membuktikan kalau klaimnya bukan sekadar omong kosong.`,
      notesMood: 'Gaya teks: Clean bullet points. Natural smile.',
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] 45-degree side profile angle, creator actively using ${safeName} with effortless natural gestures, relaxed confidence, reference image product clearly visible, natural daylight, photorealistic UGC video.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di upload',
    },
    {
      cameraAngle: 'Front Camera / Selfie Mode (Curhat Langsung)',
      visualAction: `Reaksi wajah puas tersenyum lebar dengan ekspresi terkesima melihat hasil ${safeName}, memegang produk ke arah kamera.`,
      popupText: 'JUJUR GAK NYANGKA! 😍',
      soundEffect: 'Cheer & Success chime',
      dialogVO: `Hasilnya di luar dugaan, beneran ngebantu banget dan bikin makin percaya diri!`,
      notesMood: 'Gaya teks: Heart pop emoji. Warm studio tone.',
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] Front selfie camera perspective, creator smiling broadly admiring noticeable real results from ${safeName}, holding product close to camera, packaging details match reference image, glowing warm ambiance.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di upload',
    },
    {
      cameraAngle: 'Over the Shoulder (OTS)',
      visualAction: `Kreator memegang ${safeName} di samping wajah sambil memberikan gestur jempol mantap dengan produk tampak jelas.`,
      popupText: 'SUPER WORTH IT! 💯',
      soundEffect: 'Cha-ching cash register',
      dialogVO: `Buat kalian yang mau coba ${safeName}, menurut aku ini 10/10 dan beneran wajib punya.`,
      notesMood: 'Gaya teks: Green verified badge.',
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] Over-the-shoulder perspective, creator giving an enthusiastic thumbs-up while displaying ${safeName} bottle/package to camera, accurate label colors adhering to reference image.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di upload',
    },
    {
      cameraAngle: 'Low Angle (Hero / Powerful)',
      visualAction: `Kreator tersenyum antusias menunjuk ke pojok kiri bawah layar ke arah keranjang kuning dengan produk ${safeName}.`,
      popupText: 'BURUAN CHECKOUT DISKON! 🛒',
      soundEffect: 'Bell ring & Cha-ching',
      dialogVO: `Mumpung ${safeName} lagi ada voucher diskon & gratis ongkir, langsung klik keranjang kuning ya!`,
      notesMood: 'Gaya teks: Pulsing CTA Button. Urgent offer.',
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] Low-angle dynamic hero shot, creator smiling invitingly and pointing down toward yellow cart icon while holding ${safeName}, packaging prominently featured, vibrant lighting, vertical 9:16 UGC video.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di upload',
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
      visualAction: `Kamera sudut pandang pertama (POV) menyorot kedua tangan talent di atas meja estetik, memegang paket ${safeName} siap di-unboxing sesuai gambar referensi. 100% tanpa wajah.`,
      popupText: 'UNBOXING TIME! 📦✨',
      soundEffect: 'Box tape tear & Pop',
      dialogVO: `Akhirnya paket ${safeName} yang ditunggu-tunggu sampai juga! Yuk kita unboxing bareng.`,
      notesMood: 'Gaya teks: Minimalist Subtitle. Meja estetik rapi, tanpa muka.',
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] Faceless UGC POV hands-only shot, neat manicured hands on aesthetic wooden desk holding delivered package of ${safeName}, reference image packaging match, 9:16 smartphone video, crisp soft shadows, 4k 60fps.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di upload',
    },
    {
      cameraAngle: 'Top-Down Hands-Only (Tangan di Atas Meja)',
      visualAction: `Sudut kamera 90° tegak lurus ke meja. Tangan talent membuka segel box dan mengeluarkan kemasan fisik ${safeName} secara rapi dan satisfying mengikuti referensi image.`,
      popupText: `OFFICIAL UNBOXING: ${safeName.toUpperCase()}`,
      soundEffect: 'ASMR Paper unwrap & Chime',
      dialogVO: `Begitu dibuka, kemasan aslinya beneran estetik dan premium banget.`,
      notesMood: 'Gaya teks: Clean Bouncy. Flat lay meja bersih.',
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] Flat lay 90-degree overhead top-down shot, hands smoothly sliding ${safeName} physical product out of retail box, aesthetic minimal backdrop, lighting highlights pristine finish matching reference image, vertical 9:16.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di upload',
    },
    {
      cameraAngle: 'Extreme Close-up / Macro (Tekstur & Detail)',
      visualAction: `Close-up super makro. Jari-jemari tangan memutar kemasan ${safeName}, memperlihatkan segel resmi, detail aplikator, dan label original sesuai gambar referensi.`,
      popupText: 'DETAIL KEMASAN 100% ORI 🔍',
      soundEffect: 'Camera shutter click',
      dialogVO: `Perhatikan detail segel dan ciri kemasannya, rapi dan build quality-nya berkelas.`,
      notesMood: 'Gaya teks: Gold Badge. Pencahayaan makro tajam.',
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] Extreme macro slow 360-spin in hands, fingers turning ${safeName} to display official barcode and holographic seal, razor-sharp focus on brand font matching reference image, clean 4k 60fps.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di upload',
    },
    {
      cameraAngle: 'Hand Swatch & Application (Tangan Mengoles Produk)',
      visualAction: `Tangan talent mengaplikasikan/mengoleskan tekstur produk ${safeName} langsung di punggung tangan atau permukaan uji secara satisfying.`,
      popupText: 'TEKSTUR SUPER SATISFYING 🌿',
      soundEffect: 'ASMR Crisp Glide & Swirl',
      dialogVO: `Nah ini yang paling satisfying! Teksturnya langsung nyaman, gampang diratakan, dan gak lengket sama sekali.`,
      notesMood: 'Gaya teks: Glassmorphism Tag. Fokus gerakan jari.',
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] Close-up hands-only application, finger smoothly spreading velvety formula of ${safeName} across back of hand, satisfying ASMR texture motion, lighting reveals true product viscosity, 9:16 vertical.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di upload',
    },
    {
      cameraAngle: 'Hands-Only / Tangan Saja (Faceless / Tanpa Wajah)',
      visualAction: `Kedua tangan memperagakan cara pemakaian praktis ${safeName}, mendemonstrasikan keunggulan ${safeUSP}.`,
      popupText: `${safeUSP.toUpperCase().slice(0, 30)} ⚡`,
      soundEffect: 'Sparkle Ding',
      dialogVO: `Tinggal diaplikasikan secukupnya, hasilnya instan kerasa bedanya.`,
      notesMood: 'Gaya teks: Bullet point checklist. Aksi tangan jelas.',
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] Hands demonstrating practical use of ${safeName}, elegant hand movement, steady camera angle, product front label always oriented towards camera matching reference image, 4k 60fps.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di upload',
    },
    {
      cameraAngle: 'POV Hands-Only (Hanya Tangan & Produk)',
      visualAction: `Tangan kanan memegang produk ${safeName}, tangan kiri memberikan gestur jempol puas di depan meja estetik.`,
      popupText: 'RATING: 10/10 MUST BUY! ⭐',
      soundEffect: 'Success bell & Cha-ching',
      dialogVO: `Jujur dari segi performa dan kualitas, ini beneran melebihi ekspektasi.`,
      notesMood: 'Gaya teks: Star Rating Badge. Gestur tangan puas.',
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] POV shot with right hand presenting ${safeName} bottle and left hand giving satisfied thumbs-up gesture, clean cozy aesthetic desk, packaging color accuracy locked to reference image, 9:16 vertical.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di upload',
    },
    {
      cameraAngle: 'Top-Down Hands-Only (Tangan di Atas Meja)',
      visualAction: `Tangan talent menjejerkan produk ${safeName} dengan rapi di atas meja di sebelah aksesoris estetik.`,
      popupText: 'SUPER AESTHETIC & WORTH IT 💯',
      soundEffect: 'Soft pop & Chime',
      dialogVO: `Wajar kalau produk ini sering sold out di mana-mana.`,
      notesMood: 'Gaya teks: Verified badge.',
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] Top-down flat lay view, hands placing ${safeName} gently next to aesthetic props on linen table, studio grade softbox lighting, brand label facing up matching reference image.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di upload',
    },
    {
      cameraAngle: 'Hand Swatch & Application (Tangan Mengoles Produk)',
      visualAction: `Tangan mengetuk-ngetuk kemasan produk (ASMR Tapping) lalu menunjukkan sisa pemakaian yang bersih dan higienis.`,
      popupText: 'ASMR TAPPING SATISFYING 🎧',
      soundEffect: 'Crisp ASMR Tapping',
      dialogVO: `Praktis dibawa ke mana-mana dan gak ribet sama sekali.`,
      notesMood: 'Gaya teks: Floating glow text.',
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] Close-up hands gently finger-tapping on ${safeName} bottle cap with crisp satisfying movement, pristine product condition adhering to reference image, hyperrealistic 4k.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di upload',
    },
    {
      cameraAngle: 'Hands-Only / Tangan Saja (Faceless / Tanpa Wajah)',
      visualAction: `Tangan talent memegang produk ${safeName} dan jari telunjuk menunjuk langsung ke pojok kiri bawah layar ke arah ikon keranjang kuning TikTok Shop.`,
      popupText: 'KLIK KERANJANG KUNING SEKARANG! 🛒👇',
      soundEffect: 'Cash register cha-ching & Bell',
      dialogVO: `Mumpung lagi diskon & gratis ongkir, langsung checkout di keranjang kuning sekarang sebelum kehabisan!`,
      notesMood: 'Gaya teks: Pulsing CTA Button. Tangan menunjuk keranjang kuning.',
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] Dynamic closing shot, hands holding ${safeName} with index finger pointing directly towards bottom-left corner where yellow cart button is located, product branding in crystal clear focus matching reference image, 9:16 vertical TikTok UGC.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di upload',
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

    const popupText =
      sc.popupText && typeof sc.popupText === 'string' && sc.popupText.trim() && sc.popupText.trim() !== '-'
        ? sc.popupText.trim()
        : i === 0
        ? 'JANGAN SKIP DULU! 😱'
        : `SOLUSI: ${safeName.toUpperCase()}`;

    let flowPrompt = sc.googleFlowPrompt || '';
    if (!flowPrompt) {
      flowPrompt = `[Image 1 Reference: ${safeName}] Scene ${i + 1} (${angle}): ${sc.visualAction} - On-Screen Pop-up Text Overlay: "${popupText}" - Follow reference image, 9:16 vertical, 4k 60fps.`;
    } else if (!/on-screen pop-up text overlay|text overlay|popup text/i.test(flowPrompt)) {
      flowPrompt = `${flowPrompt} - On-Screen Pop-up Text Overlay: "${popupText}"`;
    }

    return {
      ...sc,
      cameraAngle: angle,
      duration: sceneDuration,
      popupText,
      googleFlowPrompt: flowPrompt,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di upload',
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

  // 1. Resolve Platform strictly and accurately
  let detectedPlatform = 'TikTok Shop';
  if (
    linkData?.platform === 'Tokopedia' ||
    combined.includes('tokopedia') ||
    combined.includes('tkp.me')
  ) {
    detectedPlatform = 'Tokopedia';
  } else if (
    linkData?.platform === 'Shopee' ||
    combined.includes('shopee') ||
    combined.includes('shope.ee')
  ) {
    detectedPlatform = 'Shopee Video';
  } else if (combined.includes('instagram')) {
    detectedPlatform = 'Instagram Reels';
  } else if (combined.includes('youtube')) {
    detectedPlatform = 'YouTube Shorts';
  } else if (linkData?.platform && linkData.platform !== 'General') {
    detectedPlatform = linkData.platform === 'TikTok' ? 'TikTok Shop' : linkData.platform;
  }

  // 2. Resolve Product Name accurately (Never use raw shortcodes, junk titles, or hardcoded fake products!)
  let detectedName = '';

  // Candidate A: Real scraped product name from linkData
  if (
    linkData?.productName &&
    !isGenericMarketplaceFallback(linkData.productName) &&
    !isLikelyShortcodeOrHash(linkData.productName) &&
    linkData.productName.length >= 3
  ) {
    detectedName = cleanMarketplaceProductName(linkData.productName, detectedPlatform);
  }

  // Candidate B: Text provided by user (e.g. share text or input notes)
  if (!detectedName && cleanTextNoUrls) {
    // Remove marketplace prefixes like "Beli", "Jual", "Cek", "Lihat produk di..."
    const cleanedText = cleanMarketplaceProductName(cleanTextNoUrls, detectedPlatform);
    if (cleanedText && cleanedText.length >= 3 && !isGenericMarketplaceFallback(cleanedText)) {
      // Take the first meaningful title line/segment
      const firstSegment = cleanedText.split(/[\n–—\-]/)[0]?.trim();
      if (firstSegment && firstSegment.length >= 3 && !isLikelyShortcodeOrHash(firstSegment)) {
        detectedName = firstSegment;
      }
    }
  }

  // Candidate C: OgTitle or Title from linkData
  if (!detectedName && linkData?.ogTitle && !isGenericMarketplaceFallback(linkData.ogTitle)) {
    const cleanOg = cleanMarketplaceProductName(linkData.ogTitle, detectedPlatform);
    if (cleanOg && !isLikelyShortcodeOrHash(cleanOg)) {
      detectedName = cleanOg;
    }
  }

  // Fallback fallback if completely empty
  if (!detectedName || detectedName.trim().length < 2) {
    detectedName = 'Produk Unggulan Pilihan';
  }

  // 3. Resolve Brand accurately
  let detectedBrand = linkData?.brand || '';
  if (!detectedBrand) {
    detectedBrand = detectKnownBrand(detectedName + ' ' + rawInputCombined) || '';
  }
  // If still empty but name has 2+ words, first word might be the brand if recognized
  if (!detectedBrand && detectedName !== 'Produk Unggulan Pilihan') {
    const firstWord = detectedName.split(' ')[0]?.trim();
    if (firstWord && firstWord.length >= 3 && detectKnownBrand(firstWord)) {
      detectedBrand = firstWord;
    }
  }

  // 4. Default baseline properties
  let detectedCat = 'Review';
  let detectedDuration = 30;
  let detectedTone = 'Santai, Relatable & Meyakinkan';
  let detectedUSP = `Kualitas terjamin, performa optimal, dan terbukti memberikan hasil nyata.`;
  let detectedDesc = `${detectedName} merupakan solusi terpercaya dengan ulasan positif dari ribuan pengguna yang mengutamakan kualitas dan kenyamanan.`;
  let detectedAudience = `Pria dan wanita usia 18-35 tahun aktif di media sosial yang mencari produk berkualitas terbukti.`;
  const detectedTags: string[] = [detectedPlatform];

  let detectedPersona = 'Semua (Netral Universal)';
  let detectedCameraStyle = 'Dinamis & Multi-Angle (Viral Fast-Cut)';
  let personaExplanation = 'Persona Netral Universal dipilih agar pesan dan demonstrasi produk dapat diterima oleh semua kalangan audiens.';
  let cameraStyleExplanation = 'Gaya Dinamis & Multi-Angle dipilih untuk menghasilkan ritme visual yang cepat dan memikat perhatian sejak 3 detik pertama.';
  let preferredCameraAngles: string[] = [
    'POV / Handheld (First-Person)',
    'Extreme Close-up / Macro (Tekstur & Detail)',
    'Over the Shoulder (OTS)',
    'Medium Shot (Setengah Badan)',
    'Front Camera / Selfie Mode (Curhat Langsung)',
  ];

  // 5. Intelligent Multi-Niche Classifier
  const n = (detectedName + ' ' + combined).toLowerCase();

  // Mode: Hands-Only / Faceless
  if (
    n.includes('tangan') ||
    n.includes('faceless') ||
    n.includes('tanpa wajah') ||
    n.includes('tanpa muka') ||
    n.includes('hands-only') ||
    n.includes('hands only') ||
    n.includes('hand-only')
  ) {
    detectedPersona = 'Kreator Faceless / Hanya Tangan (Tanpa Muka)';
    detectedCameraStyle = 'Hands-Only / Hanya Tangan (Faceless UGC)';
    personaExplanation = 'Persona Kreator Faceless / Hanya Tangan dipilih untuk video aesthetic tanpa muka, fokus penuh pada aksi interaksi produk.';
    cameraStyleExplanation = 'Gaya Hands-Only dipilih 100% menyorot gerakan tangan, unboxing paket, dan pengolesan produk di atas meja secara estetik.';
    preferredCameraAngles = [
      'Hands-Only / Tangan Saja (Faceless / Tanpa Wajah)',
      'POV Hands-Only (Hanya Tangan & Produk)',
      'Top-Down Hands-Only (Tangan di Atas Meja)',
      'Hand Swatch & Application (Tangan Mengoles Produk)',
      'Unboxing Hands-Only (Buka Paket Tangan Saja)',
      'Extreme Close-up / Macro (Tekstur & Detail)',
    ];
  }

  // NICHE A: Lip Makeup / Lip Tint / Lip Velvet / Lip Balm
  if (n.includes('lip') || n.includes('bibir') || n.includes('lipcream') || n.includes('liptint') || n.includes('lipstick')) {
    detectedCat = 'Review';
    detectedPersona = 'Beauty & Skincare Junkie';
    detectedCameraStyle = 'Macro & Extreme Close-up Detail (Tekstur & Formula)';
    preferredCameraAngles = ['Extreme Close-up / Macro (Tekstur & Detail)', 'Front Camera / Selfie Mode (Curhat Langsung)', 'Close-up (Face / Ekspresi)'];
    detectedUSP = 'Warna intens pigmented sekali oles, ringan di bibir tanpa bikin kering, transferproof tahan seharian.';
    detectedDesc = `${detectedName} memberikan sentuhan warna segar natural dengan formula melembabkan yang nyaman dipakai dari pagi sampai malam.`;
    detectedAudience = 'Remaja & wanita usia 16-35 tahun pencinta makeup natural untuk kuliah, kerja, atau hangout.';
    detectedTags.push('RacunLipstick', 'BeautyViral');
  }
  // NICHE B: Serum & Skincare Pencerah / Skin Barrier / Retinol
  else if (n.includes('serum') || n.includes('niacinamide') || n.includes('retinol') || n.includes('brightening') || n.includes('whitening') || n.includes('glowing')) {
    detectedCat = 'Before & After';
    detectedPersona = 'Beauty & Skincare Junkie';
    detectedCameraStyle = 'Macro & Extreme Close-up Detail (Tekstur & Formula)';
    preferredCameraAngles = ['Extreme Close-up / Macro (Tekstur & Detail)', 'Flat Lay / Top-down (Meja Estetik)', 'Slow Zoom-In Push (Dramatis Fokus)'];
    detectedUSP = 'Mencerahkan flek dan bekas jerawat dalam 7-14 hari, memperkuat skin barrier, tekstur ringan cepat meresap.';
    detectedDesc = `${detectedName} diformulasikan dengan konsentrasi bahan aktif murni yang teruji klinis merawat tekstur kulit agar halus dan bercahaya sehat.`;
    detectedAudience = 'Pria dan wanita 18-35 tahun dengan masalah kulit kusam, noda hitam, atau tekstur kulit tidak merata.';
    detectedTags.push('SkincareViral', 'SkinBarrier');
  }
  // NICHE C: Pelembab / Moisturizer / Soothing Gel / Ceramide
  else if (n.includes('moisturizer') || n.includes('moisture') || n.includes('gel') || n.includes('ceramide') || n.includes('pelembab') || n.includes('aloe')) {
    detectedCat = 'Review';
    detectedPersona = 'Beauty & Skincare Junkie';
    detectedCameraStyle = 'Macro & Extreme Close-up Detail (Tekstur & Formula)';
    preferredCameraAngles = ['Extreme Close-up / Macro (Tekstur & Detail)', 'POV / Handheld (First-Person)', 'Close-up (Face / Ekspresi)'];
    detectedUSP = 'Sensasi dingin menenangkan kemerahan instan, mengunci kelembapan 24 jam, formula ringan non-comedogenic.';
    detectedDesc = `${detectedName} melembabkan kulit secara mendalam dengan tekstur gel lembut yang menyegarkan tanpa rasa lengket atau berminyak.`;
    detectedAudience = 'Pemilik kulit sensitif, dehidrasi, atau berjerawat usia 16-35 tahun yang mencari pelembab harian.';
    detectedTags.push('MoisturizerViral', 'KulitSehat');
  }
  // NICHE D: Sunscreen / Tabir Surya
  else if (n.includes('sunscreen') || n.includes('sunblock') || n.includes('spf')) {
    detectedCat = 'Tutorial';
    detectedPersona = 'Beauty & Skincare Junkie';
    detectedCameraStyle = 'Front Camera / Selfie Talk (Vlog Santai)';
    preferredCameraAngles = ['Front Camera / Selfie Mode (Curhat Langsung)', 'Eye-Level (Natural Eye)', 'Close-up (Face / Ekspresi)'];
    detectedUSP = 'Proteksi tinggi SPF 50+ PA++++, no whitecast, ringan seperti air dan tidak perih di mata.';
    detectedDesc = `${detectedName} memberikan perlindungan optimal dari bahaya sinar UV dan polusi dengan finish natural tanpa membuat wajah kusam.`;
    detectedAudience = 'Pekerja luar ruangan dan pengguna harian usia 16-40 tahun yang aktif bergerak.';
    detectedTags.push('SunscreenViral', 'ProteksiKulit');
  }
  // NICHE E: Obat Jerawat / Acne Spot / Salep
  else if (n.includes('acne') || n.includes('jerawat') || n.includes('totol') || n.includes('pimple')) {
    detectedCat = 'Problem & Solution';
    detectedPersona = 'Beauty & Skincare Junkie';
    detectedCameraStyle = 'Macro & Extreme Close-up Detail (Tekstur & Formula)';
    preferredCameraAngles = ['Extreme Close-up / Macro (Tekstur & Detail)', 'Close-up (Face / Ekspresi)', 'Slow Zoom-In Push (Dramatis Fokus)'];
    detectedUSP = 'Meredakan jerawat meradang dalam 1-3 hari, melawan bakteri p.acnes, tanpa membuat kulit mengelupas kering.';
    detectedDesc = `${detectedName} bekerja tepat sasaran pada titik jerawat aktif untuk mempercepat penyembuhan dan memudarkan kemerahan.`;
    detectedAudience = 'Remaja dan dewasa 15-32 tahun pejuang jerawat dan kulit berminyak.';
    detectedTags.push('AcneFighter', 'ObatJerawat');
  }
  // NICHE F: Kopi Diet / Slimming / Pelangsing / Detox
  else if (n.includes('kopi') || n.includes('coffee') || n.includes('slimming') || n.includes('diet') || n.includes('langsing') || n.includes('detox') || n.includes('fiber')) {
    detectedCat = 'Before & After';
    detectedPersona = 'Pria Dewasa / Bapak Relatable';
    detectedCameraStyle = 'POV & Handheld Dominan (Teman Curhat)';
    preferredCameraAngles = ['POV / Handheld (First-Person)', 'Medium Shot (Setengah Badan)', 'Close-up (Face / Ekspresi)'];
    detectedUSP = 'Membantu menahan nafsu makan lebih lama, metabolisme lancar, aman di lambung, bersertifikasi BPOM & Halal.';
    detectedDesc = `${detectedName} diformulasikan khusus dengan bahan herbal alami pilihan untuk mendampingi program penurunan berat badan tanpa rasa lemas.`;
    detectedAudience = 'Pria & wanita usia 22-45 tahun yang ingin badan lebih ramping, perut rata, dan tetap bertenaga.';
    detectedTags.push('DietSehat', 'HerbalAlami');
  }
  // NICHE G: Fitness / Whey Protein / Creatine / Gym
  else if (n.includes('whey') || n.includes('protein') || n.includes('creatine') || n.includes('gym') || n.includes('otot') || n.includes('fitness')) {
    detectedCat = 'Review';
    detectedPersona = 'Cowok Gym & Fitness Bro';
    detectedCameraStyle = 'Low-Angle & Dynamic Hero Shot (Keren & Berwibawa)';
    preferredCameraAngles = ['Low Angle (Hero / Powerful)', 'Tracking Following Shot (Gerak Mengikuti)', 'Medium Shot (Setengah Badan)'];
    detectedUSP = 'Tinggi protein murni per scoop, rasa enak tidak bikin enek, mudah larut dan mempercepat pemulihan massa otot.';
    detectedDesc = `${detectedName} mendukung kebutuhan nutrisi harian pecinta olahraga untuk memaksimalkan hasil latihan beban dan pembentukan otot kering.`;
    detectedAudience = 'Gym enthusiasts, atlet, dan pria/wanita usia 18-40 tahun yang sedang program lean bulking atau cutting.';
    detectedTags.push('GymBro', 'WheyProtein');
  }
  // NICHE H: Parfum / Wewangian / Body Mist
  else if (n.includes('parfum') || n.includes('perfume') || n.includes('fragrance') || n.includes('cologne') || n.includes('wangi') || n.includes('bodymist')) {
    detectedCat = 'Review';
    detectedPersona = 'Pria Grooming & Maskulin';
    detectedCameraStyle = 'Cinematic Commercial & 360° Orbit (Iklan Mewah)';
    preferredCameraAngles = ['360° Product Orbit / Spin (Putaran Produk)', 'Slow Zoom-In Push (Dramatis Fokus)', 'Close-up (Face / Ekspresi)'];
    detectedUSP = 'Ketahanan wangi mewah 8-12 jam, aroma semerbak elegan disukai lawan jenis, tidak berbekas di baju.';
    detectedDesc = `${detectedName} menyajikan perpaduan aroma eksklusif yang memikat, memancarkan aura karismatik di setiap momen penting.`;
    detectedAudience = 'Pria & wanita 18-38 tahun yang ingin tampil wangi berkelas di kantor, kencan, atau acara resmi.';
    detectedTags.push('ParfumViral', 'WangiMewah');
  }
  // NICHE I: Sepatu / Sneakers / Sandal
  else if (n.includes('sepatu') || n.includes('sneakers') || n.includes('shoes') || n.includes('sandal') || n.includes('slip on')) {
    detectedCat = 'Haul';
    detectedPersona = 'Fashion Stylist / OOTD Enthusiast';
    detectedCameraStyle = 'Low-Angle & Dynamic Hero Shot (Keren & Berwibawa)';
    preferredCameraAngles = ['Low Angle (Hero / Powerful)', 'Tracking Following Shot (Gerak Mengikuti)', 'Over the Shoulder (OTS)'];
    detectedUSP = 'Insole empuk anti pegal untuk jalan seharian, desain trendi cocok berbagai outfit, bahan awet sol kokoh.';
    detectedDesc = `${detectedName} memadukan estetika modern dan kenyamanan tinggi untuk menemani aktivitas harian dari kuliah hingga nongkrong.`;
    detectedAudience = 'Gen Z dan milenial 16-32 tahun pencinta gaya kasual dan OOTD kekinian.';
    detectedTags.push('SneakersLokal', 'OOTDInspo');
  }
  // NICHE J: Pakaian / Kaos / Hoodie / Kemeja / Celana
  else if (n.includes('kaos') || n.includes('hoodie') || n.includes('t-shirt') || n.includes('kemeja') || n.includes('celana') || n.includes('jaket') || n.includes('oversize') || n.includes('baju')) {
    detectedCat = 'Haul';
    detectedPersona = 'Fashion Stylist / OOTD Enthusiast';
    detectedCameraStyle = 'Mirror Reflection Shot & GRWM (Get Ready With Me)';
    preferredCameraAngles = ['Mirror Reflection Shot (Kaca GRWM)', 'Wide Shot (Ruangan / Full Body)', 'Side Profile 45° (Angle Samping)'];
    detectedUSP = 'Bahan katun premium adem menyerap keringat, jahitan rapi kuat tidak mudah melar, cuttingan pas modis.';
    detectedDesc = `${detectedName} menghadirkan siluet kasual yang nyaman dan fleksibel untuk mix-and-match gaya streetwear harian.`;
    detectedAudience = 'Remaja & dewasa muda usia 16-32 tahun penggemar fashion simpel tapi berkarakter.';
    detectedTags.push('FashionViral', 'OutfitKece');
  }
  // NICHE K: TWS / Earphone / Headphone / Audio
  else if (n.includes('tws') || n.includes('earphone') || n.includes('headset') || n.includes('headphone') || n.includes('speaker') || n.includes('audio')) {
    detectedCat = 'Unboxing';
    detectedPersona = 'Tech & Gadget Enthusiast';
    detectedCameraStyle = 'Flat Lay & Top-Down (Unboxing Meja Estetik)';
    preferredCameraAngles = ['Flat Lay / Top-down (Meja Estetik)', 'Extreme Close-up / Macro (Tekstur & Detail)', "Bird's Eye View (Overhead 90°)"];
    detectedUSP = 'Dentuman bass bertenaga dan vokal jernih, latensi rendah minim delay saat game/video, baterai awet puluhan jam.';
    detectedDesc = `${detectedName} memberikan pengalaman audio nirkabel imersif dengan koneksi bluetooth stabil dan isolasi suara sekitar yang optimal.`;
    detectedAudience = 'Gamers, penikmat podcast & musik, serta pekerja mobile usia 17-35 tahun.';
    detectedTags.push('TechReview', 'TWSMurah');
  }
  // NICHE L: Keyboard / Mouse / Setup Komputer
  else if (n.includes('keyboard') || n.includes('mouse') || n.includes('deskmat') || n.includes('setup') || n.includes('monitor')) {
    detectedCat = 'Unboxing';
    detectedPersona = 'Tech & Gadget Enthusiast';
    detectedCameraStyle = 'Flat Lay & Top-Down (Unboxing Meja Estetik)';
    preferredCameraAngles = ['Flat Lay / Top-down (Meja Estetik)', 'Extreme Close-up / Macro (Tekstur & Detail)', 'Over the Shoulder (OTS)'];
    detectedUSP = 'Switch empuk tactile nyaman untuk ngetik maraton, koneksi nirkabel multi-device responsif, desain estetik mempercantik meja kerja.';
    detectedDesc = `${detectedName} dirancang untuk menunjang kenyamanan produktivitas kerja dan gaming harian dengan build quality kokoh.`;
    detectedAudience = 'Content creator, pekerja WFH, programmer, dan gamers usia 18-35 tahun.';
    detectedTags.push('DeskSetup', 'KeyboardMekanikal');
  }
  // NICHE M: Otomotif / Helm / Pengkilap Kendaraan
  else if (n.includes('motor') || n.includes('mobil') || n.includes('helm') || n.includes('pengkilap') || n.includes('wax') || n.includes('coating') || n.includes('rantai')) {
    detectedCat = 'Before & After';
    detectedPersona = 'Otomotif & Bikers / Car Enthusiast';
    detectedCameraStyle = 'Cinematic Commercial & 360° Orbit (Iklan Mewah)';
    preferredCameraAngles = ['Low Angle (Hero / Powerful)', 'Tracking Following Shot (Gerak Mengikuti)', 'Slow Zoom-In Push (Dramatis Fokus)'];
    detectedUSP = 'Kilap basah deep wet look seketika, proteksi hidrofobik daun talas anti air hujan, melindungi cat dari baret halus.';
    detectedDesc = `${detectedName} merawat bodi kendaraan agar selalu tampil mengkilap mulus seperti baru keluar dari salon mobil/motor.`;
    detectedAudience = 'Penggemar otomotif dan pengendara motor/mobil harian usia 18-45 tahun.';
    detectedTags.push('OtomotifViral', 'MotorKinclong');
  }
  // NICHE N: Makanan / Snack / Camilan Pedas / Kuliner
  else if (n.includes('snack') || n.includes('camilan') || n.includes('keripik') || n.includes('pedas') || n.includes('sambal') || n.includes('baso') || n.includes('mie') || n.includes('makanan')) {
    detectedCat = 'ASMR / Satisfying';
    detectedPersona = 'Foodie & Kuliner / Home Chef';
    detectedCameraStyle = 'Macro & Extreme Close-up Detail (Tekstur & Formula)';
    preferredCameraAngles = ['Extreme Close-up / Macro (Tekstur & Detail)', 'Flat Lay / Top-down (Meja Estetik)', 'POV / Handheld (First-Person)'];
    detectedUSP = 'Bumbu rempah melimpah pedas gurih nampol, tekstur super renyah tidak keras, kemasan higienis ziplock aman.';
    detectedDesc = `${detectedName} menawarkan sensasi kenikmatan gurih pedas autentik yang bikin nagih dari gigitan pertama.`;
    detectedAudience = 'Pecinta kuliner pedas, penikmat camilan santai, dan anak muda segala usia 15-40 tahun.';
    detectedTags.push('KulinerViral', 'JajananEnak');
  }
  // NICHE O: Ibu, Bayi & Anak / Mom & Baby
  else if (n.includes('bayi') || n.includes('anak') || n.includes('baby') || n.includes('popok') || n.includes('telon') || n.includes('ibu') || n.includes('mama')) {
    detectedCat = 'Review';
    detectedPersona = 'Ibu Muda / Mama Hemat Cerdas';
    detectedCameraStyle = 'POV & Handheld Dominan (Teman Curhat)';
    preferredCameraAngles = ['POV / Handheld (First-Person)', 'Close-up (Face / Ekspresi)', 'Over the Shoulder (OTS)'];
    detectedUSP = 'Teruji dermatologis hypoallergenic lembut untuk kulit sensitif, bebas bahan kimia keras, harum lembut menenangkan.';
    detectedDesc = `${detectedName} memberikan perlindungan penuh kasih untuk si kecil agar nyaman beraktivitas dan tidur nyenyak sepanjang hari.`;
    detectedAudience = 'Ibu muda, orang tua baru, dan keluarga dengan anak balita usia 20-38 tahun.';
    detectedTags.push('MomAndBaby', 'AnakSehat');
  }
  // NICHE P: Hijab / Muslimah / Mukena / Gamis / Abaya
  else if (n.includes('hijab') || n.includes('jilbab') || n.includes('pashmina') || n.includes('mukena') || n.includes('gamis') || n.includes('abaya') || n.includes('muslimah')) {
    detectedCat = 'Haul';
    detectedPersona = 'Hijaber Trendy / Muslimah Modern';
    detectedCameraStyle = 'Mirror Reflection Shot & GRWM (Get Ready With Me)';
    preferredCameraAngles = ['Mirror Reflection Shot (Kaca GRWM)', 'Front Camera / Selfie Mode (Curhat Langsung)', 'Full Body Shot (Seluruh Badan & OOTD)', 'Close-up (Face / Ekspresi)'];
    detectedUSP = 'Bahan jatuh adem tidak menerawang, tegak di dahi mudah dibentuk, jahitan rapi untuk look syari modern.';
    detectedDesc = `${detectedName} menghadirkan kenyamanan berbusana muslimah anggun dengan pilihan warna lembut yang modis.`;
    detectedAudience = 'Muslimah muda, mahasiswi, dan wanita karir berhijab usia 17-38 tahun.';
    detectedTags.push('HijabOOTD', 'MuslimahFashion');
  }
  // NICHE Q: Ibu Hamil & Menyusui / Busui / Pompa ASI
  else if (n.includes('busui') || n.includes('hamil') || n.includes('menyusui') || n.includes('pompa asi') || n.includes('breastpump') || n.includes('asi booster')) {
    detectedCat = 'Review';
    detectedPersona = 'Ibu Hamil & Menyusui (Busui)';
    detectedCameraStyle = 'POV & Handheld Dominan (Teman Curhat)';
    preferredCameraAngles = ['POV / Handheld (First-Person)', 'Medium Shot (Setengah Badan)', 'Close-up (Face / Ekspresi)'];
    detectedUSP = 'Praktis tanpa sakit, membantu produksi ASI lancar melimpah, bahan food-grade aman bagi buah hati.';
    detectedDesc = `${detectedName} menjadi sahabat setia para ibu mengASIhi untuk memenuhi kebutuhan nutrisi si kecil secara tenang.`;
    detectedAudience = 'Ibu hamil dan menyusui usia 22-38 tahun yang mencari solusi praktis pumping & relaksasi.';
    detectedTags.push('PejuangASI', 'BusuiFriendly');
  }
  // NICHE R: Gamer & Streamer / Aksesoris Game
  else if (n.includes('gamer') || n.includes('gaming') || n.includes('streamer') || n.includes('game pad') || n.includes('controller') || n.includes('kursi gaming')) {
    detectedCat = 'Review';
    detectedPersona = 'Gamer & Streamer';
    detectedCameraStyle = 'Dutch Angle & Shock Dramatis (Hook Heboh)';
    preferredCameraAngles = ['Over the Shoulder (OTS)', 'Dutch Angle (Miring Dramatis)', 'Extreme Close-up / Macro (Tekstur & Detail)', 'Front Camera / Selfie Mode (Curhat Langsung)'];
    detectedUSP = 'Respon super cepat zero latency, RGB estetik futuristik, grip ergonomis anti pegal untuk mabar push rank.';
    detectedDesc = `${detectedName} mendongkrak performa bermain game dengan presisi tinggi dan sensasi imersif yang memukau.`;
    detectedAudience = 'Gamers mobile/PC, streamer, dan pecinta game usia 15-30 tahun.';
    detectedTags.push('GamerSetup', 'MabarTikTok');
  }
  // NICHE S: Dokter / Edukasi Medis / Tenaga Kesehatan
  else if (n.includes('dokter') || n.includes('medis') || n.includes('klinik') || n.includes('farmasi') || n.includes('suplemen kesehatan') || n.includes('vitamin')) {
    detectedCat = 'Tutorial';
    detectedPersona = 'Dokter / Tenaga Medis / Ahli Edukasi';
    detectedCameraStyle = 'Front Camera / Selfie Talk (Vlog Santai)';
    preferredCameraAngles = ['Eye-Level (Natural Eye)', 'Front Camera / Selfie Mode (Curhat Langsung)', 'Close-up (Face / Ekspresi)', 'Medium Shot (Setengah Badan)'];
    detectedUSP = 'Formulasi medis terstandar uji klinis, izin BPOM resmi, penjelasan transparan tanpa klaim berlebihan.';
    detectedDesc = `${detectedName} memberikan edukasi berbasis bukti ilmiah untuk menjaga kesehatan tubuh secara aman dan bertanggung jawab.`;
    detectedAudience = 'Masyarakat umum usia 20-55 tahun yang peduli kesehatan dan mencari suplemen terpercaya.';
    detectedTags.push('EdukasiKesehatan', 'TipsDokter');
  }
  // NICHE T: Mahasiswa / Anak Kosan / Hemat Murah
  else if (n.includes('kosan') || n.includes('mahasiswa') || n.includes('hemat') || n.includes('murah meriah') || n.includes('budget')) {
    detectedCat = 'Problem & Solution';
    detectedPersona = 'Mahasiswa Hemat / Anak Kosan';
    detectedCameraStyle = 'POV & Handheld Dominan (Teman Curhat)';
    preferredCameraAngles = ['POV / Handheld (First-Person)', 'Front Camera / Selfie Mode (Curhat Langsung)', 'Flat Lay / Top-down (Meja Estetik)'];
    detectedUSP = 'Harga ramah kantong anak kosan, multifungsi hemat tempat, kualitas di atas harga miring.';
    detectedDesc = `${detectedName} menjadi penyelamat budget bulanan dengan kegunaan maksimal untuk kehidupan kosan yang serba praktis.`;
    detectedAudience = 'Mahasiswa, anak kosan, dan first jobber usia 18-26 tahun yang ingin hidup hemat cerdas.';
    detectedTags.push('AnakKosan', 'RacunHemat');
  }
  // NICHE U: Hewan Peliharaan / Kucing / Anjing
  else if (n.includes('kucing') || n.includes('anjing') || n.includes('cat') || n.includes('dog') || n.includes('pet') || n.includes('pasir kucing')) {
    detectedCat = 'Review';
    detectedPersona = 'Pet Parent / Pecinta Hewan';
    detectedCameraStyle = 'POV & Handheld Dominan (Teman Curhat)';
    preferredCameraAngles = ['POV / Handheld (First-Person)', 'Low Angle (Hero / Powerful)', 'Extreme Close-up / Macro (Tekstur & Detail)'];
    detectedUSP = 'Disukai anabul, nutrisi seimbang bulu lebat tidak rontok, aroma wangi kontrol bau kotoran seketika.';
    detectedDesc = `${detectedName} diformulasikan untuk kebahagiaan dan kesehatan anabul tercinta agar selalu lincah dan ceria.`;
    detectedAudience = 'Pecinta kucing dan anjing (pet owners) usia 18-40 tahun.';
    detectedTags.push('PecintaKucing', 'AnabulGemas');
  }

  // 6. Final Category adjustments based on input cues
  if (combined.includes('unboxing') || combined.includes('buka paket')) {
    detectedCat = 'Unboxing';
  } else if (combined.includes('before after') || combined.includes('sebelum sesudah')) {
    detectedCat = 'Before & After';
  } else if (combined.includes('tutorial') || combined.includes('cara pakai')) {
    detectedCat = 'Tutorial';
  } else if (combined.includes('grwm')) {
    detectedCat = 'GRWM';
  } else if (combined.includes('vlog')) {
    detectedCat = 'Daily Vlog';
  }

  // Ensure tags are clean and unique
  const finalTags = Array.from(new Set(detectedTags.filter(Boolean))).slice(0, 5);

  return {
    productName: detectedName,
    brandName: detectedBrand,
    productUrl: detectedUrl,
    imageUrl: linkData?.imageUrl || linkData?.image || undefined,
    referenceImage: linkData?.imageUrl || linkData?.image || undefined,
    category: detectedCat,
    productDescription: detectedDesc,
    targetAudience: detectedAudience,
    keySellingPoints: detectedUSP,
    persona: detectedPersona as any,
    personaExplanation,
    tone: detectedTone,
    cameraAngleStyle: detectedCameraStyle,
    cameraStyleExplanation,
    preferredCameraAngles,
    targetPlatform: detectedPlatform,
    targetDuration: detectedDuration,
    detectedTags: finalTags,
    detectionSummary: `Berhasil mendeteksi produk "${detectedName}"${detectedBrand ? ` (${detectedBrand})` : ''} untuk platform ${detectedPlatform} kategori ${detectedCat}.`,
  };
}
