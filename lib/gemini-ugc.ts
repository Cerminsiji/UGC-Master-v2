import { GoogleGenAI, Type } from '@google/genai';
import {
  detectKnownBrand,
  isGenericMarketplaceFallback,
  isLikelyShortcodeOrHash,
  cleanMarketplaceProductName,
  extractShareTextIntelligence,
  inferProductBrandOrCollection,
} from './link-extractor';

// List of supported Gemini models with automatic cascading fallback
export const CANDIDATE_MODELS = [
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
  'gemini-flash-latest',
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

// High-speed multi-model generator with clean config, strict timeouts, and multimodal referenceImages support
export async function generateWithFallback(
  prompt: string,
  config: any,
  systemInstruction?: string,
  timeoutMs = 15000,
  referenceImages?: string[]
): Promise<string | null> {
  const ai = getGeminiClient();
  if (!ai) return null;

  const requestConfig = {
    ...config,
    ...(systemInstruction ? { systemInstruction } : {}),
  };

  // Extract valid base64 inlineData parts if referenceImages are provided
  const inlineImageParts: Array<{ inlineData: { mimeType: string; data: string } }> = [];
  if (Array.isArray(referenceImages) && referenceImages.length > 0) {
    for (const imgStr of referenceImages.slice(0, 6)) {
      if (typeof imgStr === 'string' && imgStr.startsWith('data:image/')) {
        const match = imgStr.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
        if (match && match[1] && match[2]) {
          inlineImageParts.push({
            inlineData: {
              mimeType: match[1],
              data: match[2],
            },
          });
        }
      }
    }
  }

  const contentsPayload: any =
    inlineImageParts.length > 0
      ? [
          {
            role: 'user',
            parts: [...inlineImageParts, { text: prompt }],
          },
        ]
      : prompt;

  for (const model of CANDIDATE_MODELS) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model,
          contents: contentsPayload,
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

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)] || items[0];
}

export function getVoiceToneDirective(tone: string = ''): string {
  const t = tone.toLowerCase();
  if (t.includes('enerjik') || t.includes('hype') || t.includes('spill')) {
    return 'Nada bicara cepat, lincah, penuh antusiasme khas konten Spill FYP; kalimat pendek-pendek dan punchy.';
  }
  if (t.includes('skeptis') || t.includes('plot twist') || t.includes('jujur')) {
    return 'Mulai dengan keraguan objektif/kritis, tampilkan fakta pembuktian nyata, lalu tutup dengan rasa takjub yang tulus.';
  }
  if (t.includes('storytelling') || t.includes('emosional') || t.includes('problem')) {
    return 'Alur naratif hangat penuh empati: ceritakan kendala nyata lebih dulu sebelum memunculkan momen kelegaan berkat produk.';
  }
  if (t.includes('edukatif') || t.includes('dokter') || t.includes('expert') || t.includes('lab')) {
    return 'Bahasa informatif, tenang, kredibel, menjelaskan cara kerja/bahan tanpa klaim berlebihan atau bahasa lebay.';
  }
  if (t.includes('gen-z') || t.includes('witty') || t.includes('sat-set') || t.includes('sarkas')) {
    return 'Diksi Gen-Z lincah ("jujurly", "sat-set", "no drama", "valid"), witty, dan langsung ke inti tanpa bertele-tele.';
  }
  if (t.includes('asmr') || t.includes('bisik') || t.includes('soft-spoken') || t.includes('calming')) {
    return 'Gunakan kalimat pendek lembut seperti bisikan dekat mic, fokus pada detail bunyi foley dan sensasi tekstur.';
  }
  if (t.includes('live') || t.includes('fomo') || t.includes('mendesak')) {
    return 'Energi host live shopping yang persuasif, menyorot promo/stok terbatas dan ajakan klik keranjang secara aktif.';
  }
  if (t.includes('komedi') || t.includes('lucu') || t.includes('blunder') || t.includes('sketsa')) {
    return 'Gaya dialog humoris, reaksi kaget spontan, atau percakapan dua sisi yang mengundang tawa dan komentar.';
  }
  if (t.includes('elegan') || t.includes('luxury') || t.includes('mewah') || t.includes('eksklusif')) {
    return 'Pemilihan kata berkelas, tenang, halus, menonjolkan kualitas craftsmanship dan pengalaman premium.';
  }
  if (t.includes('smart buyer') || t.includes('hemat') || t.includes('value')) {
    return 'Sentuh logika penghematan biaya/waktu per hari dan rasio kualitas vs harga agar terasa sebagai keputusan cerdas.';
  }
  if (t.includes('komentar') || t.includes('q&a') || t.includes('netizen') || t.includes('reply')) {
    return 'Dialog interaktif dua arah seolah sedang langsung menjawab pertanyaan di kolom komentar penonton.';
  }
  if (t.includes('aesthetic') || t.includes('poetic') || t.includes('hangat')) {
    return 'Kalimat mengalir lembut, hangat, slightly poetic, menyatu dengan visual cozy morning/night routine.';
  }
  if (t.includes('hard-selling') || t.includes('to-the-point') || t.includes('direct')) {
    return 'Padat, tegas, bebas basa-basi: masalah-bukti-keunggulan-CTA checkout dalam tempo cepat.';
  }
  return 'Bahasa Indonesia percakapan sehari-hari yang hangat, santai, mengalir natural seperti curhat ke sahabat dekat.';
}

export interface UgcHookArchetype {
  id: string;
  name: string;
  psychology: string;
  promptDirective: string;
  buildSceneOne: (params: {
    productName: string;
    usp: string;
    category: string;
    isHandsOnly: boolean;
    tone?: string;
  }) => {
    cameraAngle: string;
    visualAction: string;
    popupText: string;
    soundEffect: string;
    dialogVO: string;
    notesMood: string;
  };
}

/**
 * 22 Research-Backed UGC Hook Archetypes with randomized multi-variant templates
 * designed to eliminate monotonous "3 Alasan" listicles, "Stop scrolling!" openings, and repetitive VO/popups.
 */
export const UGC_RD_HOOK_ARCHETYPES: UgcHookArchetype[] = [
  {
    id: 'relatable_micro_pain',
    name: 'Micro-Problem & Empati Spesifik',
    psychology: 'Membuka dengan situasi masalah mikro sehari-hari yang sangat spesifik dan langsung dirasakan audiens tanpa kesan iklan.',
    promptDirective:
      'Buka Adegan 1 dengan situasi masalah mikro yang sangat spesifik dan relatable dengan keseharian target audiens, lalu perlihatkan produk sebagai jawaban praktisnya.',
    buildSceneOne: ({ productName, isHandsOnly }) => ({
      cameraAngle: isHandsOnly ? 'POV Hands-Only (Hanya Tangan & Produk)' : 'Front Camera / Selfie Mode (Curhat Langsung)',
      visualAction: isHandsOnly
        ? `Kamera POV menyorot tangan talent yang langsung mengambil kemasan ${productName} di meja kerja saat menghadapi masalah harian, sesuai gambar referensi.`
        : `Kreator membuka video dengan ekspresi jujur saat mengalami masalah sehari-hari, lalu mengangkat ${productName} ke dekat lensa kamera sesuai gambar referensi.`,
      popupText: pickRandom([
        'PERNAH NGALAMIN INI JUGA? 🤔',
        'YANG SERING RIBET TIAP PAGI MERAPAT! ⏰',
        'MASALAH SEPELE TAPI BIKIN BADMOOD 😤',
      ]),
      soundEffect: pickRandom(['Camera shutter & Soft pop', 'Skeptical eyebrow pop & Notification ping', 'Fast whip whoosh & Heartbeat thud']),
      dialogVO: pickRandom([
        `Siapa di sini yang sering ngalamin hal sama pas lagi buru-buru? Semenjak sedia ${productName}, urusan langsung beres.`,
        `Kenapa ya baru sekarang kepikiran buat nyetok ${productName}? Padahal masalah ini tuh kejadian hampir tiap hari.`,
        `Kalau pagi-pagi kamu masih suka keteteran soal ini, cobain deh trik simpel pakai ${productName}.`,
      ]),
      notesMood: pickRandom([
        'Gaya teks: Chat Bubble Relatable. Pencahayaan natural realistis.',
        'Gaya teks: TikTok Question Sticker. Raw iPhone handheld natural.',
        'Gaya teks: Minimalist Warm Tag. Cahaya jendela pagi realistis.',
      ]),
    }),
  },
  {
    id: 'sensory_macro_first_frame',
    name: 'Sensory Macro / ASMR First-Frame',
    psychology: 'Memikat mata & telinga di detik ke-1 lewat detail fisik/tekstur produk sebelum penonton sempat berpikir.',
    promptDirective:
      'Buka Adegan 1 langsung dengan Extreme Macro Close-up tekstur, detail fisik, atau bunyi ASMR produk yang sangat memuaskan mata (satisfying visual first-frame).',
    buildSceneOne: ({ productName, isHandsOnly }) => ({
      cameraAngle: 'Extreme Close-up / Macro (Tekstur & Detail)',
      visualAction: isHandsOnly
        ? `Sorotan super makro jari tangan membuka dan memperlihatkan tekstur serta detail fisik ${productName} di bawah cahaya jernih sesuai gambar referensi.`
        : `Kamera langsung fokus makro ke detail fisik dan tekstur ${productName} saat dibuka pertama kali, memperlihatkan kualitas aslinya sesuai gambar referensi.`,
      popupText: 'LIHAT DETAIL & TEKSTURNYA! ✨',
      soundEffect: 'Crisp plastic peel & Sparkle magic ting',
      dialogVO: `Lihat sendiri deh detail dan kualitas fisik ${productName} dari dekat, pantesan review-nya rata-rata bintang lima.`,
      notesMood: 'Gaya teks: Minimalist Clean. Fokus makro tajam 4K.',
    }),
  },
  {
    id: 'skeptic_turned_believer',
    name: 'Skeptic-Turned-Believer (Review Jujur Eksperimen)',
    psychology: 'Membangun kredibilitas instan dengan mengakui rasa skeptis di awal sebelum membuktikan hasilnya.',
    promptDirective:
      'Buka Adegan 1 dengan sudut pandang orang yang awalnya ragu/skeptis karena produk ini sering lewat di FYP, lalu memutuskan membuktikan sendiri.',
    buildSceneOne: ({ productName, isHandsOnly }) => ({
      cameraAngle: isHandsOnly ? 'Top-Down Hands-Only (Tangan di Atas Meja)' : 'Medium Close-up (Dada ke Atas)',
      visualAction: isHandsOnly
        ? `Tangan meletakkan ${productName} di atas meja estetik sambil memutar kemasannya untuk mengecek detail label dan kualitas asli sesuai referensi image.`
        : `Kreator menatap kamera dengan raut wajah jujur dan objektif sambil memutar kemasan ${productName} di tangan sesuai gambar referensi.`,
      popupText: 'AWALNYA KIRA CUMA GIMMICK... 🤨',
      soundEffect: 'Ding notification & Fast whip whoosh',
      dialogVO: `Jujur awalnya aku kira ${productName} ini cuma viral sesaat doang, sampai akhirnya aku buktiin sendiri selama seminggu penuh.`,
      notesMood: 'Gaya teks: Honest Review Tag. Tone bicara tenang & meyakinkan.',
    }),
  },
  {
    id: 'instant_proof_comparison',
    name: 'Instant Visual Proof / Side-by-Side Reveal',
    psychology: 'Memberikan bukti hasil nyata di detik pertama untuk memicu rasa ingin tahu bagaimana caranya.',
    promptDirective:
      'Buka Adegan 1 dengan langsung memamerkan hasil akhir atau perbandingan nyata sebelum vs sesudah memakai produk di detik pertama.',
    buildSceneOne: ({ productName, usp, isHandsOnly }) => ({
      cameraAngle: isHandsOnly ? 'Hand Swatch & Application (Tangan Mengoles Produk)' : 'Close-up (Face / Ekspresi)',
      visualAction: isHandsOnly
        ? `Tangan langsung memperlihatkan perbandingan nyata area yang sudah memakai ${productName} vs yang belum, dengan kemasan produk tampak jelas sesuai gambar referensi.`
        : `Kreator langsung menunjukkan bukti hasil pemakaian ${productName} di depan kamera dengan pencahayaan jernih, memegang kemasan sesuai gambar referensi.`,
      popupText: 'BEDANYA KELIHATAN JELAS! 📈',
      soundEffect: 'Finger snap click & Level up victory chime',
      dialogVO: `Bandingin deh bedanya sebelum dan sesudah pakai ${productName}. ${usp.split(',')[0] || 'Hasilnya langsung kelihatan nyata'}.`,
      notesMood: 'Gaya teks: Split Comparison Badge. Visual kontras terang.',
    }),
  },
  {
    id: 'social_spill_storytime',
    name: 'Social Curiosity / "Ditanyain Teman" Storytime',
    psychology: 'Menggunakan validasi sosial (ditanya orang sekitar) untuk memicu efek ingin punya.',
    promptDirective:
      'Buka Adegan 1 dengan cerita singkat kejadian nyata saat teman/rekan kerja menanyakan rahasia produk yang dipakai.',
    buildSceneOne: ({ productName, isHandsOnly }) => ({
      cameraAngle: isHandsOnly ? 'POV Hands-Only (Hanya Tangan & Produk)' : 'POV / Handheld (First-Person)',
      visualAction: isHandsOnly
        ? `Tangan mengeluarkan ${productName} dari dalam tas kerja estetik di atas meja sambil memperlihatkan kemasannya ke kamera sesuai referensi image.`
        : `Kreator merekam secara handheld sambil mengeluarkan ${productName} dari tas dengan senyum antusias seperti sedang bercerita ke sahabat dekat.`,
      popupText: 'DITANYAIN TEMEN SEKANTOR TERUS! 💬',
      soundEffect: 'Bag zipper & Ding notification',
      dialogVO: `Kemarin sampai ditanyain tiga orang di kantor gara-gara pakai ${productName} ini, akhirnya aku spill di sini ya.`,
      notesMood: 'Gaya teks: Storytime Pill. Suasana akrab dan natural.',
    }),
  },
  {
    id: 'live_stress_test',
    name: 'Live Stress-Test / Uji Klaim Ekstrem',
    psychology: 'Menguji klaim terkuat produk secara langsung di depan kamera tanpa rekayasa.',
    promptDirective:
      'Buka Adegan 1 dengan langsung menguji klaim utama produk secara ekstrem atau real-time di depan kamera tanpa basa-basi.',
    buildSceneOne: ({ productName, usp, isHandsOnly }) => ({
      cameraAngle: isHandsOnly ? 'Hand Swatch & Application (Tangan Mengoles Produk)' : 'Over the Shoulder (OTS)',
      visualAction: isHandsOnly
        ? `Tangan langsung melakukan uji coba nyata pada ${productName} dari jarak dekat untuk membuktikan klaim produk sesuai gambar referensi.`
        : `Kreator langsung melakukan tes pembuktian klaim ${productName} dari jarak dekat di depan lensa kamera sesuai gambar referensi.`,
      popupText: 'KITA TES LANGSUNG SEKARANG! 🔍',
      soundEffect: 'Heavy cinematic swoosh & Camera flash click',
      dialogVO: `Katanya ${productName} ini punya keunggulan ${usp.split(',')[0]?.toLowerCase() || 'kualitas juara'}? Yuk kita tes langsung di kamera tanpa cut!`,
      notesMood: 'Gaya teks: Live Test Lab. Fokus tajam tanpa filter.',
    }),
  },
  {
    id: 'mistake_correction_hack',
    name: 'Pro-Tip & Kesalahan Umum (Educational Hack)',
    psychology: 'Memberikan edukasi bernilai tinggi sehingga penonton merasa mendapatkan trik cerdas yang belum diketahui.',
    promptDirective:
      'Buka Adegan 1 dengan membongkar kebiasaan atau kesalahan umum yang sering bikin rugi, dan bagaimana produk ini menyelesaikannya dengan cerdas.',
    buildSceneOne: ({ productName, isHandsOnly }) => ({
      cameraAngle: isHandsOnly ? 'Top-Down Hands-Only (Tangan di Atas Meja)' : 'Eye-Level (Natural Eye)',
      visualAction: isHandsOnly
        ? `Tangan menunjuk detail fitur unggulan pada kemasan ${productName} di atas meja dengan gerakan edukatif yang rapi sesuai referensi image.`
        : `Kreator berbicara ramah namun informatif sambil menunjuk fitur utama pada kemasan ${productName} sesuai gambar referensi.`,
      popupText: 'CARA CERDAS BIAR MAKSIMAL 💡',
      soundEffect: 'Sparkle magic ting & Bubble pop sound',
      dialogVO: `Ternyata masih banyak yang belum tahu kalau ${productName} ini bisa bikin rutinitas harian jadi dua kali lebih efisien.`,
      notesMood: 'Gaya teks: Pro-Tip Card. Pencahayaan bersih profesional.',
    }),
  },
  {
    id: 'smart_buyer_value_math',
    name: 'Smart Buyer Math / Rasio Kualitas vs Harga',
    psychology: 'Menyentuh logika penghematan uang dan waktu dibanding alternatif yang mahal atau boros.',
    promptDirective:
      'Buka Adegan 1 dengan perbandingan penghematan biaya atau waktu yang cerdas ketika beralih menggunakan produk ini.',
    buildSceneOne: ({ productName, isHandsOnly }) => ({
      cameraAngle: isHandsOnly ? 'POV Hands-Only (Hanya Tangan & Produk)' : 'Medium Shot (Setengah Badan)',
      visualAction: isHandsOnly
        ? `Tangan mengetuk kemasan ${productName} dengan mantap di atas meja rapi, menampilkan proporsi produk sesuai gambar referensi.`
        : `Kreator memegang ${productName} sambil tersenyum cerdas dan menatap kamera dengan percaya diri.`,
      popupText: 'SOLUSI HEMAT KUALITAS JUARA 💎',
      soundEffect: 'Cha-ching cash register & Fast whip whoosh',
      dialogVO: `Daripada keluar biaya mahal berkali-kali tapi hasilnya biasa aja, mending beralih ke ${productName} yang udah jelas terbukti.`,
      notesMood: 'Gaya teks: Smart Value Badge. Tone warna hangat.',
    }),
  },
  {
    id: 'unboxing_first_impression',
    name: 'POV First-Touch Unboxing & Seal Break',
    psychology: 'Memicu dopamin penonton lewat momen membuka kemasan/segel barang baru yang memuaskan.',
    promptDirective:
      'Buka Adegan 1 dengan momen memuaskan saat membuka segel produk pertama kali dan reaksi spontan terhadap build quality aslinya.',
    buildSceneOne: ({ productName, isHandsOnly }) => ({
      cameraAngle: isHandsOnly ? 'Unboxing Hands-Only (Buka Paket Tangan Saja)' : 'Flat Lay / Top-down (Meja Estetik)',
      visualAction: isHandsOnly
        ? `Tangan membuka kotak kemasan dan mengangkat fisik asli ${productName} ke arah cahaya, memperlihatkan detail presisi sesuai gambar referensi.`
        : `Kamera menyorot momen kreator membuka box dan mengangkat ${productName} dengan ekspresi puas melihat kemasan aslinya.`,
      popupText: `UNBOXING ${productName.toUpperCase().slice(0, 22)} 📦✨`,
      soundEffect: 'Tape slicing crisp & Paper crinkle ASMR',
      dialogVO: `Paket ${productName} yang paling aku tunggu akhirnya sampai! Pas pertama kali dipegang langsung kerasa build quality-nya niat banget.`,
      notesMood: 'Gaya teks: Aesthetic Unboxing. Cahaya pagi natural.',
    }),
  },
  {
    id: 'reverse_psychology_warning',
    name: 'Reverse Psychology / Peringatan Anti-Nyesel',
    psychology: 'Memicu rasa penasaran tinggi dengan peringatan provokatif yang menantang rasa ingin tahu penonton.',
    promptDirective:
      'Buka Adegan 1 dengan gaya reverse psychology (misal: "Jangan buru-buru beli produk ini kalau kamu belum siap dengan efeknya...").',
    buildSceneOne: ({ productName, isHandsOnly }) => ({
      cameraAngle: isHandsOnly ? 'POV Hands-Only (Hanya Tangan & Produk)' : 'Front Camera / Selfie Mode (Curhat Langsung)',
      visualAction: isHandsOnly
        ? `Tangan memegang kemasan ${productName} dengan latar belakang gelap elegan, lalu mencondongkan produk ke arah kamera sesuai referensi image.`
        : `Kreator menatap kamera dengan ekspresi serius dan menggelengkan kepala pelan sambil memegang kemasan ${productName} sesuai referensi image.`,
      popupText: 'JANGAN BURU-BURU BELI DULU! ⚠️',
      soundEffect: 'Record scratch & Warning buzzer',
      dialogVO: `Jangan buru-buru beli ${productName} ini kalau kalian belum siap rutinitas harian kalian berubah jadi jauh lebih praktis.`,
      notesMood: 'Gaya teks: Warning Sign Pill. Pencahayaan kontras dramatis.',
    }),
  },
  {
    id: 'confession_late_adopter',
    name: 'Late-Adopter Confession / Penyesalan Baru Tahu',
    psychology: 'Menyentuh empati dan FOMO penonton lewat pengakuan rasa penyesalan kenapa baru memakai produk ini sekarang.',
    promptDirective:
      'Buka Adegan 1 dengan pengakuan jujur bahwa kreator merasa menyesal kenapa baru menemukan produk ini setelah sekian lama mencoba cara yang merepotkan.',
    buildSceneOne: ({ productName, isHandsOnly }) => ({
      cameraAngle: isHandsOnly ? 'Top-Down Hands-Only (Tangan di Atas Meja)' : 'Medium Close-up (Dada ke Atas)',
      visualAction: isHandsOnly
        ? `Tangan menepuk meja pelan di samping kemasan ${productName} seolah mengekspresikan rasa geregetan kenapa baru memilikinya sekarang.`
        : `Kreator memegang kening dengan ekspresi geregetan sambil memegang ${productName} menghadap ke kamera sesuai referensi image.`,
      popupText: 'NYESEL BANGET BARU NEMU SEKARANG! 🤦‍♂️',
      soundEffect: 'Ding notification & Deep bass boom',
      dialogVO: `Asli nyesel banget kenapa baru tahu ada ${productName} ini sekarang, padahal kalau dari dulu udah hemat banyak waktu dan tenaga.`,
      notesMood: 'Gaya teks: Relatable Confession Card. Nada bicara bersahabat.',
    }),
  },
  {
    id: 'blind_comparison_battle',
    name: 'Head-to-Head Battle / Uji Nyata vs Produk Serupa',
    psychology: 'Menyajikan perbandingan langsung yang objektif untuk membuktikan keunggulan produk di hadapan kompetitor.',
    promptDirective:
      'Buka Adegan 1 dengan tantangan perbandingan langsung antara produk ini dengan produk sejenis di pasaran tanpa menyebut merek lain.',
    buildSceneOne: ({ productName, usp, isHandsOnly }) => ({
      cameraAngle: isHandsOnly ? 'Top-Down Hands-Only (Tangan di Atas Meja)' : 'Over the Shoulder (OTS)',
      visualAction: isHandsOnly
        ? `Tangan meletakkan ${productName} berdampingan dengan wadah alternatif netral di meja, menunjuk langsung keunggulan fisik produk sesuai gambar referensi.`
        : `Kreator memegang ${productName} di satu tangan dan produk pembanding netral di tangan lain, menatap kamera dengan ekspresi penasaran.`,
      popupText: 'BATTLE PRODUK: WORTH IT MANA? ⚖️',
      soundEffect: 'Boxing bell ring & Whoosh transition',
      dialogVO: `Banyak yang penasaran apa bener ${productName} ini sebanding sama produk yang harganya jauh lebih mahal? Yuk kita bandingin langsung!`,
      notesMood: 'Gaya teks: Battle Split Card. Visual dinamis.',
    }),
  },
  {
    id: 'viral_fomo_restock',
    name: 'Restock Alert & Perburuan Barang Viral',
    psychology: 'Memanfaatkan social proof dan rasa takut ketinggalan (FOMO) terhadap barang yang cepat habis.',
    promptDirective:
      'Buka Adegan 1 dengan momen kebahagiaan akhirnya berhasil mengamankan stok produk yang selama berminggu-minggu selalu ludes.',
    buildSceneOne: ({ productName, isHandsOnly }) => ({
      cameraAngle: isHandsOnly ? 'POV Hands-Only (Hanya Tangan & Produk)' : 'Front Camera / Selfie Mode (Curhat Langsung)',
      visualAction: isHandsOnly
        ? `Tangan memegang erat kemasan ${productName} yang baru tiba, mengarahkannya ke kamera dengan gerakan gembira sesuai gambar referensi.`
        : `Kreator tersenyum lebar dengan mata berbinar sambil memeluk kemasan ${productName} di depan kamera dengan penuh rasa syukur.`,
      popupText: 'AKHIRNYA KEBAGIAN RESTOCK! 😭🎉',
      soundEffect: 'Level up victory chime & Sparkle magic ting',
      dialogVO: `Setelah bolak-balik ngecek tiap hari gara-gara kehabisan terus, akhirnya ${productName} ini berhasil aku amankan juga!`,
      notesMood: 'Gaya teks: Bouncy Glow Celebration. Nada bicara ceria & antusias.',
    }),
  },
  {
    id: 'extreme_curiosity_gap',
    name: 'Extreme Curiosity Gap / Rahasia Detail Tersembunyi',
    psychology: 'Membuka celah informasi misterius yang memicu otak penonton harus bertahan menonton sampai tahu jawabannya.',
    promptDirective:
      'Buka Adegan 1 dengan mengungkap detail rahasia atau fakta unik yang jarang disadari orang di balik produk ini.',
    buildSceneOne: ({ productName, isHandsOnly }) => ({
      cameraAngle: 'Extreme Close-up / Macro (Tekstur & Detail)',
      visualAction: isHandsOnly
        ? `Tangan menunjuk bagian detail tersembunyi pada fisik kemasan ${productName} dari jarak sangat dekat dengan pencahayaan dramatis.`
        : `Kreator memegang ${productName} sambil berbisik ke arah mikrofon dan mengarahkan perhatian penonton ke detail produk sesuai referensi image.`,
      popupText: 'RAHASIA YANG JARANG DISADARI 🤫',
      soundEffect: 'Mystery ambient shimmer & Soft tick',
      dialogVO: `Ternyata ada satu alasan kenapa ${productName} ini selalu dapat respon positif, dan hampir gak ada yang ngeh soal detail ini.`,
      notesMood: 'Gaya teks: Mystery Glow. Nuansa penasaran & eksklusif.',
    }),
  },
  {
    id: 'problem_breakthrough_moment',
    name: 'The "Aha!" Breakthrough / Solusi Masalah Menahun',
    psychology: 'Menyajikan momen pencerahan instan saat sebuah masalah yang mengganggu akhirnya selesai.',
    promptDirective:
      'Buka Adegan 1 dengan momen kelegaan menemukan solusi nyata setelah sekian lama frustrasi dengan metode lama.',
    buildSceneOne: ({ productName, usp, isHandsOnly }) => ({
      cameraAngle: isHandsOnly ? 'POV Hands-Only (Hanya Tangan & Produk)' : 'Medium Close-up (Dada ke Atas)',
      visualAction: isHandsOnly
        ? `Tangan mengangkat ${productName} dari atas meja dengan percaya diri, menonjolkan fitur produk sesuai gambar referensi.`
        : `Kreator menghela napas lega dengan senyum puas sambil menunjukkan ${productName} ke arah lensa kamera sesuai gambar referensi.`,
      popupText: 'AKHIRNYA NEMU YANG BENERAN AMPUH! 💡',
      soundEffect: 'Lightbulb click & Soft atmospheric swell',
      dialogVO: `Udah coba berbagai cara tapi hasilnya nihil, sampai akhirnya nemu ${productName} yang beneran ngasih solusi instan.`,
      notesMood: 'Gaya teks: Clean Bright Badge. Transisi cerah melegakan.',
    }),
  },
  {
    id: 'daily_routine_lifesaver',
    name: 'Daily Lifesaver / Penyelamat Hari Sibuk',
    psychology: 'Menghubungkan produk langsung ke skenario nyata hari yang sibuk sebagai kebutuhan esensial.',
    promptDirective:
      'Buka Adegan 1 dengan momen hari sibuk di mana produk ini menjadi penyelamat utama yang mempermudah hidup.',
    buildSceneOne: ({ productName, isHandsOnly }) => ({
      cameraAngle: isHandsOnly ? 'POV Hands-Only (Hanya Tangan & Produk)' : 'POV / Handheld (First-Person)',
      visualAction: isHandsOnly
        ? `Tangan meraih ${productName} di meja yang rapi di tengah aktivitas padat harian, memperlihatkan kemasan asli sesuai referensi image.`
        : `Kreator merekam handheld dengan latar suasana rutinitas harian yang dinamis, menunjukkan ${productName} sebagai perlengkapan wajib.`,
      popupText: 'PENYELAMAT RUTINITAS HARIAN! ⏰⚡',
      soundEffect: 'Fast whip whoosh & Snap click',
      dialogVO: `Kalau lagi jadwal padat dan butuh serba cepat, ${productName} ini bener-bener jadi penyelamat yang gak boleh ketinggalan.`,
      notesMood: 'Gaya teks: Fast Action Pill. Tempo enerjik dan produktif.',
    }),
  },
  {
    id: 'spontaneous_reaction_first_try',
    name: 'Raw First-Try Spontaneous Reaction',
    psychology: 'Menampilkan reaksi spontan dan ekspresi alami saat mencoba produk untuk pertama kalinya.',
    promptDirective:
      'Buka Adegan 1 dengan reaksi spontan takjub saat pertama kali mencoba produk secara langsung di depan kamera.',
    buildSceneOne: ({ productName, usp, isHandsOnly }) => ({
      cameraAngle: isHandsOnly ? 'Hand Swatch & Application (Tangan Mengoles Produk)' : 'Close-up (Face / Ekspresi)',
      visualAction: isHandsOnly
        ? `Tangan langsung mengaplikasikan atau mencoba ${productName} di depan kamera, memperlihatkan hasil instan dengan kemasan terlihat jelas.`
        : `Kreator mencoba ${productName} di depan lensa dan matanya melebar takjub melihat hasilnya seketika tanpa rekayasa.`,
      popupText: pickRandom(['REAKSI ASLI FIRST TRY! 🤯', 'DETIK KE-1 LANGSUNG KAGET 😳', 'REAL REACTION NO SCRIPT ⚡']),
      soundEffect: pickRandom(['Vine boom & Sparkle magic ting', 'Anime gasp & Bubble pop', 'Snap-zoom bass hit & Chime']),
      dialogVO: pickRandom([
        `Tunggu dulu... ini beneran? Baru pertama kali nyoba ${productName} langsung kelihatan sejelas ini bedanya!`,
        `Bentar deh, kok bisa ya ${productName} langsung ngasih hasil senyata ini padahal baru sekali coba?`,
        `Reaksi jujur pas pertama pegang dan tes ${productName}: oke, ini di luar ekspektasi sih!`,
      ]),
      notesMood: 'Gaya teks: Spontaneous Reaction Bubble. Momen asli tanpa skrip kaku.',
    }),
  },
  {
    id: 'comment_reply_spill',
    name: 'Balas Komentar Netizen ("Kak Spill Dong!")',
    psychology: 'Memanfaatkan format reply komentar TikTok yang terasa sangat organik, personal, dan membangun bukti ketertarikan audiens.',
    promptDirective:
      'Buka Adegan 1 seolah sedang membalas langsung pertanyaan spesifik netizen di kolom komentar video sebelumnya sambil langsung menyorot produk.',
    buildSceneOne: ({ productName, isHandsOnly }) => ({
      cameraAngle: isHandsOnly ? 'POV Hands-Only (Hanya Tangan & Produk)' : '0.5x Ultra-Wide Gen-Z Selfie (Ekspresif & Dekat)',
      visualAction: isHandsOnly
        ? `Tangan talent mengangkat kemasan ${productName} di dekat stiker balasan komentar atas layar dengan pencahayaan kamar estetik.`
        : `Kreator menunjuk stiker komentar netizen di bagian atas frame lalu langsung memperlihatkan fisik ${productName} ke arah lensa.`,
      popupText: pickRandom([
        'BALAS KOMEN: "KAK SPILL DONG!" 💬',
        'YANG KEMARIN NANYAIN INI MERAPAT 👇',
        'JAWABAN JUJUR BUAT KOLOM KOMENTAR ✍️',
      ]),
      soundEffect: pickRandom(['Comment pop-up bloop & iPhone ping', 'Ding notification & Fast whip whoosh', 'Bubble pop sound & Click snap']),
      dialogVO: pickRandom([
        `Buat yang kemarin ramai nanyain ${productName} ini di komentar awet atau gak, sini aku buktiin langsung!`,
        `Akhirnya ku-spill juga nih ${productName} yang dari kemarin ditanyain terus di DM dan kolom komentar.`,
        `Biar gak penasaran lagi buat kakak yang komen kemarin, kita cek langsung hasil aslinya bareng-bareng.`,
      ]),
      notesMood: 'Gaya teks: TikTok Reply Comment Sticker. Raw natural lighting.',
    }),
  },
  {
    id: 'unpopular_opinion_hot_take',
    name: 'Unpopular Opinion / Hot Take Berani',
    psychology: 'Opini jujur yang sedikit menantang tren umum memicu rasa ingin tahu sekaligus diskusi aktif di kolom komentar.',
    promptDirective:
      'Buka Adegan 1 dengan opini jujur yang menantang kebiasaan umum pembeli (unpopular opinion), lalu tunjukkan kenapa produk ini pilihan yang lebih masuk akal.',
    buildSceneOne: ({ productName, isHandsOnly }) => ({
      cameraAngle: isHandsOnly ? 'Top-Down Hands-Only (Tangan di Atas Meja)' : 'Medium Close-up (Dada ke Atas)',
      visualAction: isHandsOnly
        ? `Tangan meletakkan ${productName} secara tegas di atas meja bersih lalu memutar label ke arah kamera sesuai referensi.`
        : `Kreator menatap kamera dengan ekspresi jujur sedikit skeptis sambil memegang ${productName} di depan dada.`,
      popupText: pickRandom([
        'OPINI JUJUR YANG JARANG ORANG BILANG 🔥',
        'MAAF NIH, TAPI INI FAKTANYA... 👀',
        'STOP FOMO PRODUK MAHAL DULU! ✋',
      ]),
      soundEffect: pickRandom(['Record scratch freeze & Bass drop', 'Skeptical eyebrow pop & Camera shutter', 'Dramatic dun dun dun']),
      dialogVO: pickRandom([
        `Maaf ya, tapi menurutku gak perlu beli yang ratusan ribu kalau ${productName} aja udah nyelesain masalah yang sama.`,
        `Opini jujur: kebanyakan produk viral cuma menang kemasan, kecuali ${productName} satu ini yang beneran kepake.`,
        `Jangan asal ikut tren dulu—dengerin dulu review objektifku soal ${productName} sebelum kamu checkout.`,
      ]),
      notesMood: 'Gaya teks: Bold Editorial Contrast. Tone bicara tegas & jujur.',
    }),
  },
  {
    id: 'price_shock_dupe_alert',
    name: 'Price Shock & Dupe Alert (Murah Rasa Mewah)',
    psychology: 'Kontras antara harga terjangkau dan performa/tampilan premium memicu dorongan beli instan.',
    promptDirective:
      'Buka Adegan 1 dengan momen kaget membandingkan kualitas mewah produk dengan harganya yang jauh lebih hemat dibanding ekspektasi.',
    buildSceneOne: ({ productName, isHandsOnly }) => ({
      cameraAngle: isHandsOnly ? 'Split-Screen Multi-Angle (Dua Sudut Sekaligus)' : 'Close-up (Face / Ekspresi)',
      visualAction: isHandsOnly
        ? `Tangan menyorot detail finishing ${productName} dari dekat untuk memamerkan kesan premiumnya di atas meja estetik.`
        : `Kreator memperlihatkan ${productName} ke kamera dengan ekspresi kaget senang karena detailnya terasa jauh lebih mahal dari harganya.`,
      popupText: pickRandom([
        'HARGA SEGINI DAPET KUALITAS BEGINI?! 💸',
        'DUPE ALERT: HEMAT 70% TAPI MIRIP! 💎',
        'SERIUS INI UNDER HARGA PASARAN? 😱',
      ]),
      soundEffect: pickRandom(['Cha-ching cash register & Anime gasp', 'Cashier barcode beep & Sparkle ting', 'Sub-bass beat drop hit']),
      dialogVO: pickRandom([
        `Masih gak percaya ${productName} dengan kualitas finishing serapi ini harganya semasuk akal itu!`,
        `Kalau tahu dari awal ada ${productName} yang kualitasnya setara versi mahal, udah hemat banyak dari kemarin.`,
        `Coba tebak harganya sebelum aku spill—beneran kaget pas tahu ${productName} ini ramah banget di kantong.`,
      ]),
      notesMood: 'Gaya teks: Price Tag Pop & Luxury Gold. Visual tajam menyorot detail.',
    }),
  },
  {
    id: 'time_lapse_progress_diary',
    name: 'Catatan Progres Harian (Hari ke-1 vs ke-14)',
    psychology: 'Dokumentasi timeline progres memberi bukti kredibilitas jangka waktu nyata yang jauh lebih dipercaya daripada klaim instan kosong.',
    promptDirective:
      'Buka Adegan 1 dengan format catatan progres nyata pemakaian dari hari pertama hingga beberapa hari kemudian.',
    buildSceneOne: ({ productName, isHandsOnly }) => ({
      cameraAngle: isHandsOnly ? 'Time-Lapse Transformation Cut (Harian / Progres)' : 'Mirror Reflection Shot (Kaca GRWM)',
      visualAction: isHandsOnly
        ? `Tangan menunjukkan produk ${productName} berdampingan dengan catatan progres harian di atas meja terang.`
        : `Kreator merekam update kondisi nyata hari pertama dan membandingkannya dengan kondisi terbaru sambil memegang ${productName}.`,
      popupText: pickRandom([
        'UPDATE HARI KE-1 VS KE-14 📅📈',
        'HASIL PEMAKAIAN RUTIN 2 MINGGU! ✨',
        'DIARY JUJUR TANPA FILTER 🔍',
      ]),
      soundEffect: pickRandom(['Camera shutter click & Level up chime', 'Clock tick riser & Sparkle ting', 'Match-cut hand slap whoosh']),
      dialogVO: pickRandom([
        `Ini catatan jujur pemakaian ${productName} dari hari pertama sampai minggu kedua—lihat sendiri perubahannya.`,
        `Biar adil, aku dokumentasiin langsung progres pakai ${productName} selama beberapa hari berturut-turut.`,
        `Banyak yang nanya efek jangka pendek vs rutinnya ${productName}, nah ini bukti dokumentasiku sendiri.`,
      ]),
      notesMood: 'Gaya teks: Step Progress Timeline & Date Stamp.',
    }),
  },
  {
    id: 'emergency_last_minute_save',
    name: 'Penyelamat Momen Genting (5 Menit Sebelum Acara)',
    psychology: 'Situasi mendesak sebelum rapat, kencan, atau pergi menciptakan urgensi emosional dan memamerkan kepraktisan instan.',
    promptDirective:
      'Buka Adegan 1 dengan skenario genting saat waktu mepet sebelum berangkat atau acara penting, lalu produk menyelamatkan keadaan dalam hitungan detik.',
    buildSceneOne: ({ productName, isHandsOnly }) => ({
      cameraAngle: isHandsOnly ? 'Match-Cut Hand Transition (Tutup Lensa & Reveal)' : 'Walk-and-Talk Gimbal Follow (Jalan Santai Estetik)',
      visualAction: isHandsOnly
        ? `Tangan buru-buru meraih ${productName} di atas meja persiapan dengan gerakan cepat bertenaga namun tetap solid.`
        : `Kreator bersiap-siap dengan tempo cepat sebelum keluar rumah sambil langsung menyambar ${productName}.`,
      popupText: pickRandom([
        '5 MENIT LAGI BERANGKAT, UNTUNG ADA INI! ⚡',
        'PENYELAMAT SAAT WAKTU MEPET 🚨',
        'SAT-SET ANTI PANIK SEBELUM KELUAR 🏃‍♀️',
      ]),
      soundEffect: pickRandom(['Clock alarm beep & Fast whip whoosh', 'Finger snap click & Heroic fanfare', 'Sub-bass beat drop hit']),
      dialogVO: pickRandom([
        `Tinggal lima menit lagi jalan tapi persiapan belum kelar? Untung selalu sedia ${productName} di meja!`,
        `Kalau lagi mepet waktu sebelum meeting atau ketemu orang, ${productName} ini beneran penyelamat hidup.`,
        `Gak perlu panik lagi pas telat bangun—cukup andalin ${productName} dalam hitungan detik langsung beres.`,
      ]),
      notesMood: 'Gaya teks: Fast-Cut Kinetic Timer. Ritme cepat enerjik.',
    }),
  },
];

/**
 * Picks a diverse R&D hook archetype based on category, product name, and random rotation
 * so repeated generations NEVER repeat the same opening scene and NEVER default to "3 alasan".
 */
export function pickDynamicHookArchetype(category: string = '', productName: string = ''): UgcHookArchetype {
  const normCat = (category || '').toLowerCase();
  let preferredPool = UGC_RD_HOOK_ARCHETYPES;

  if (normCat.includes('unboxing')) {
    preferredPool = UGC_RD_HOOK_ARCHETYPES.filter((a) =>
      [
        'unboxing_first_impression',
        'sensory_macro_first_frame',
        'viral_fomo_restock',
        'confession_late_adopter',
        'skeptic_turned_believer',
        'extreme_curiosity_gap',
        'spontaneous_reaction_first_try',
        'price_shock_dupe_alert',
      ].includes(a.id)
    );
  } else if (normCat.includes('before') || normCat.includes('problem')) {
    preferredPool = UGC_RD_HOOK_ARCHETYPES.filter((a) =>
      [
        'instant_proof_comparison',
        'relatable_micro_pain',
        'problem_breakthrough_moment',
        'live_stress_test',
        'confession_late_adopter',
        'smart_buyer_value_math',
        'time_lapse_progress_diary',
        'emergency_last_minute_save',
      ].includes(a.id)
    );
  } else if (normCat.includes('tutorial') || normCat.includes('hack') || normCat.includes('edukasi') || normCat.includes('mitos')) {
    preferredPool = UGC_RD_HOOK_ARCHETYPES.filter((a) =>
      [
        'mistake_correction_hack',
        'extreme_curiosity_gap',
        'live_stress_test',
        'instant_proof_comparison',
        'daily_routine_lifesaver',
        'unpopular_opinion_hot_take',
        'comment_reply_spill',
      ].includes(a.id)
    );
  } else if (normCat.includes('asmr') || normCat.includes('sensory') || normCat.includes('routine')) {
    preferredPool = UGC_RD_HOOK_ARCHETYPES.filter((a) =>
      [
        'sensory_macro_first_frame',
        'unboxing_first_impression',
        'daily_routine_lifesaver',
        'extreme_curiosity_gap',
        'spontaneous_reaction_first_try',
      ].includes(a.id)
    );
  } else if (normCat.includes('review') || normCat.includes('ulasan') || normCat.includes('testimoni') || normCat.includes('battle') || normCat.includes('dupe')) {
    preferredPool = UGC_RD_HOOK_ARCHETYPES.filter((a) =>
      [
        'skeptic_turned_believer',
        'blind_comparison_battle',
        'live_stress_test',
        'social_spill_storytime',
        'reverse_psychology_warning',
        'unpopular_opinion_hot_take',
        'price_shock_dupe_alert',
        'time_lapse_progress_diary',
      ].includes(a.id)
    );
  } else if (normCat.includes('komentar') || normCat.includes('q&a') || normCat.includes('story')) {
    preferredPool = UGC_RD_HOOK_ARCHETYPES.filter((a) =>
      [
        'comment_reply_spill',
        'social_spill_storytime',
        'confession_late_adopter',
        'relatable_micro_pain',
        'emergency_last_minute_save',
      ].includes(a.id)
    );
  } else if (normCat.includes('lifestyle') || normCat.includes('daily') || normCat.includes('vlog') || normCat.includes('grwm')) {
    preferredPool = UGC_RD_HOOK_ARCHETYPES.filter((a) =>
      [
        'social_spill_storytime',
        'daily_routine_lifesaver',
        'emergency_last_minute_save',
        'relatable_micro_pain',
        'viral_fomo_restock',
        'price_shock_dupe_alert',
      ].includes(a.id)
    );
  }

  const pool = preferredPool.length > 0 ? preferredPool : UGC_RD_HOOK_ARCHETYPES;
  const randomIndex = Math.floor(Math.random() * pool.length);
  return pool[randomIndex] || UGC_RD_HOOK_ARCHETYPES[0];
}

/**
 * Post-processes Scene 1 to ensure it NEVER contains monotonous "Stop scrolling" or "3 Alasan" listicle clichés.
 */
export function sanitizeClicheSceneOne(
  scenes: any[],
  productName: string,
  usp: string,
  category: string,
  isHandsOnly: boolean
): any[] {
  if (!Array.isArray(scenes) || scenes.length === 0) return scenes;

  const first = scenes[0];
  const vo = String(first?.dialogVO || '');
  const popup = String(first?.popupText || '');
  const visual = String(first?.visualAction || '');
  const combined = `${vo} ${popup} ${visual}`;

  const hasStopScrollCliche =
    /stop\s*scrolling|jangan\s*skip|jangan\s*di[\s-]*skip|tunggu\s*dulu\s*jangan\s*scroll|menyetop\s*scroll|menghentikan\s*scroll/i.test(
      combined
    );

  const hasThreeReasonsCliche =
    /(^|\b)(3|tiga)\s*alasan(\s*wajib|\s*kenapa|\s*utama|\s*harus|\s*penting)?/i.test(
      `${vo} ${popup}`
    );

  if (!hasStopScrollCliche && !hasThreeReasonsCliche) {
    return scenes;
  }

  const replacementArchetype = pickDynamicHookArchetype(category, productName);
  const freshSceneOne = replacementArchetype.buildSceneOne({
    productName: productName || 'Produk Pilihan',
    usp: usp || 'Kualitas premium terbukti nyata',
    category,
    isHandsOnly,
  });

  const updatedFirst = {
    ...first,
    cameraAngle: first.cameraAngle || freshSceneOne.cameraAngle,
    visualAction:
      /menyetop\s*scroll|menghentikan\s*scroll|stop\s*scrolling|tiga\s*jari|3\s*jari/i.test(visual)
        ? freshSceneOne.visualAction
        : visual,
    popupText:
      /jangan\s*skip|stop\s*scroll|(3|tiga)\s*alasan/i.test(popup) ? freshSceneOne.popupText : popup,
    dialogVO:
      /stop\s*scrolling|jangan\s*skip|(3|tiga)\s*alasan/i.test(vo) ? freshSceneOne.dialogVO : vo,
    soundEffect: first.soundEffect || freshSceneOne.soundEffect,
    notesMood: first.notesMood || freshSceneOne.notesMood,
  };

  return [updatedFirst, ...scenes.slice(1)];
}

/**
 * Ensures scenes across the storyboard NEVER have monotonous/repeated popups,
 * consecutive duplicate SFX, or generic "KEUNGGULAN: ..." labels.
 */
export function ensureVariedStoryboardScenes(
  scenes: any[],
  productName: string,
  usp: string = '',
  platform: string = 'TikTok Shop'
): any[] {
  if (!Array.isArray(scenes) || scenes.length === 0) return scenes;

  const isShopee = (platform || '').toLowerCase().includes('shopee');
  const isTikTok = (platform || '').toLowerCase().includes('tiktok');
  const shortProd = (productName || 'Produk Ini').trim().slice(0, 22).toUpperCase();
  const uspChunk = (usp || '').split(/[,.;]/)[0]?.trim().slice(0, 26).toUpperCase();

  const middlePopupPool = [
    `DETAIL ASLI ${shortProd} 🔍`,
    '10 DETIK LANGSUNG TERASA ⚡',
    'TEKSTUR RINGAN & GAK RIBET ✨',
    'BUKTI NYATA TANPA FILTER 📈',
    uspChunk ? `${uspChunk} ✅` : 'KUALITAS JUARA DI KELASNYA 💎',
    'JUJUR INI WORTH IT BANGET 💯',
    'YANG LAIN KALAH AWET! 🏆',
    'PRAKTIS BUAT TIAP HARI 🌿',
  ];

  const ctaPopupPool = isShopee
    ? [
        'KLIK KERANJANG OREN SEKARANG! 🛒👇',
        'CEK PROMO KERANJANG OREN! 🔥🛒',
        'AMANKAN STOK DI KERANJANG OREN ⏳',
      ]
    : isTikTok
    ? [
        'CEK KERANJANG KUNING SEKARANG! 🛒👇',
        'VOUCHER GRATIS ONGKIR DI BAWAH 🏷️🛒',
        'AMANKAN DI KERANJANG KUNING! 🔥👇',
      ]
    : [
        'KLIK KERANJANG DI BAWAH SEKARANG! 🛒👇',
        'CEK LINK PRODUK DI BAWAH 🏷️🛒',
        'AMANKAN PROMO HARI INI 👇🔥',
      ];

  const fallbackSfxPool = [
    'Fast whip whoosh & Sparkle magic ting',
    'Camera shutter click & Bubble pop sound',
    'Sub-bass beat drop hit & Ting',
    'Match-cut hand slap whoosh & Chime',
    'Magnetic lid snap click & Soft pop',
    'Level up victory chime & Swoosh',
    'Crisp ASMR tapping & Bell counter ding',
  ];

  const usedPopups = new Set<string>();
  const usedSfx = new Set<string>();

  return scenes.map((sc, idx) => {
    const isFirst = idx === 0;
    const isLast = idx === scenes.length - 1;
    let popup = String(sc?.popupText || '').trim();

    const isGenericMiddlePopup =
      !popup ||
      popup === '-' ||
      /^KEUNGGULAN\s*:/i.test(popup) ||
      /^SOLUSI\s*:/i.test(popup) ||
      usedPopups.has(popup.toUpperCase());

    if (isGenericMiddlePopup) {
      if (isLast) {
        popup = pickRandom(ctaPopupPool);
      } else if (isFirst) {
        popup = `JUJUR NEMU ${shortProd} SEBAGUS INI! 🤯`;
      } else {
        const candidates = middlePopupPool.filter((p) => !usedPopups.has(p.toUpperCase()));
        popup = candidates.length > 0 ? pickRandom(candidates) : middlePopupPool[idx % middlePopupPool.length];
      }
    }
    usedPopups.add(popup.toUpperCase());

    let sfx = String(sc?.soundEffect || '').trim();
    if (!sfx || sfx === '-' || usedSfx.has(sfx.toLowerCase())) {
      const sfxCandidates = fallbackSfxPool.filter((s) => !usedSfx.has(s.toLowerCase()));
      sfx = sfxCandidates.length > 0 ? pickRandom(sfxCandidates) : fallbackSfxPool[idx % fallbackSfxPool.length];
    }
    usedSfx.add(sfx.toLowerCase());

    return {
      ...sc,
      popupText: popup,
      soundEffect: sfx,
    };
  });
}

/**
 * Generates relevant niche + trending platform hashtags based on product & category.
 */
export function buildNicheHashtags(
  productName: string = '',
  category: string = '',
  usp: string = '',
  platform: string = 'TikTok Shop',
  extraTags: string[] = []
): string[] {
  const lowerAll = `${productName} ${category} ${usp}`.toLowerCase();
  const isShopee = (platform || '').toLowerCase().includes('shopee');
  const isTikTok = (platform || '').toLowerCase().includes('tiktok');
  const isReels = (platform || '').toLowerCase().includes('instagram') || (platform || '').toLowerCase().includes('reels');
  const isShorts = (platform || '').toLowerCase().includes('youtube') || (platform || '').toLowerCase().includes('shorts');

  const platformPool = isShopee
    ? ['#ShopeeVideo', '#ShopeeHaul', '#SpillRacunShopee', '#RacunShopee']
    : isTikTok
    ? ['#TikTokShop', '#RacunTikTok', '#fyp', '#FYPIndonesia']
    : isReels
    ? ['#ReelsViral', '#RacunBelanja', '#RekomendasiProduk', '#UGCCreator']
    : isShorts
    ? ['#ShortsViral', '#ReviewJujur', '#RekomendasiProduk', '#BelanjaHemat']
    : ['#fyp', '#RacunBelanja', '#ReviewJujur', '#ViralIndonesia'];

  const nicheTags: string[] = [];
  if (/serum|skincare|moisturizer|sunscreen|jerawat|acne|lip|glowing|ceramide|toner/.test(lowerAll)) {
    nicheTags.push('#SkincareViral', '#TipsGlowing', '#ReviewSkincare');
  } else if (/setelan|gamis|hijab|kaos|hoodie|sepatu|outfit|ootd|fashion|dress|baju|celana/.test(lowerAll)) {
    nicheTags.push('#OOTDIndonesia', '#FashionViral', '#SpillOutfit');
  } else if (/kopi|diet|slimming|whey|protein|gym|vitamin|suplemen/.test(lowerAll)) {
    nicheTags.push('#HidupSehat', '#DietSehat', '#PejuangDiet');
  } else if (/parfum|fragrance|wangi|bodymist|cologne/.test(lowerAll)) {
    nicheTags.push('#ParfumViral', '#WangiTahanLama', '#RekomendasiParfum');
  } else if (/keyboard|mouse|tws|headset|gadget|gaming|laptop|charger|desk/.test(lowerAll)) {
    nicheTags.push('#TechReview', '#DeskSetup', '#GadgetViral');
  } else if (/snack|camilan|makanan|pedas|sambal|mie|kuliner/.test(lowerAll)) {
    nicheTags.push('#KulinerViral', '#JajanEnak', '#ASMRMakanan');
  } else if (/bayi|anak|busui|mama|ibu/.test(lowerAll)) {
    nicheTags.push('#PerlengkapanBayi', '#TipsIbu', '#MomLife');
  } else if (/kucing|anjing|anabul|pet/.test(lowerAll)) {
    nicheTags.push('#AnabulGemas', '#PecintaKucing', '#PetCare');
  } else if (/motor|mobil|helm|otomotif/.test(lowerAll)) {
    nicheTags.push('#OtomotifViral', '#PerawatanMotor', '#AnakMotor');
  }

  if (lowerAll.includes('unboxing')) nicheTags.push('#UnboxingTime');
  if (lowerAll.includes('asmr')) nicheTags.push('#ASMRIndonesia');
  if (lowerAll.includes('dupe')) nicheTags.push('#DupeAlert', '#HematCerdas');
  if (lowerAll.includes('mitos')) nicheTags.push('#MitosVsFakta');
  if (lowerAll.includes('routine')) nicheTags.push('#DailyRoutine');
  if (lowerAll.includes('battle')) nicheTags.push('#BattleProduk');

  for (const tag of extraTags) {
    if (tag && typeof tag === 'string') {
      const normalized = tag.trim().replace(/^#+/, '').replace(/[^\w]/g, '');
      if (normalized.length >= 2) nicheTags.push(`#${normalized}`);
    }
  }

  // Pick 2 random platform tags + 2 niche tags for freshness & relevance
  const pickedPlatform = [
    platformPool[0],
    platformPool[1 + Math.floor(Math.random() * Math.max(1, platformPool.length - 1))],
  ];
  const uniqueNiche = Array.from(new Set(nicheTags)).filter((t) => !pickedPlatform.includes(t));
  const pickedNiche = uniqueNiche.sort(() => Math.random() - 0.5).slice(0, 2);

  return Array.from(new Set([...pickedNiche, ...pickedPlatform])).slice(0, 4);
}

/**
 * Safely fits a caption body + hashtags within maxLen (default 150) without EVER slicing a hashtag in half.
 */
export function fitCaptionWithHashtags(
  body: string,
  hashtags: string[],
  maxLen: number = 150
): string {
  const cleanBody = (body || '').replace(/\s+/g, ' ').trim();
  const cleanTags = Array.from(
    new Set(
      (hashtags || [])
        .map((t) => (t.startsWith('#') ? t : `#${t}`).replace(/\s+/g, ''))
        .filter((t) => t.length > 1)
    )
  );

  let selectedTags = [...cleanTags];
  while (selectedTags.length > 1) {
    const tagStr = selectedTags.join(' ');
    const full = `${cleanBody} ${tagStr}`.trim();
    if (full.length <= maxLen) return full;
    if (selectedTags.length > 2) {
      selectedTags.pop();
    } else {
      break;
    }
  }

  const tagStr = selectedTags.join(' ');
  const availableBodyLen = maxLen - tagStr.length - 1;
  if (availableBodyLen >= 25) {
    const trimmedBody =
      cleanBody.length > availableBodyLen
        ? cleanBody.slice(0, availableBodyLen - 3).replace(/\s+\S*$/, '') + '...'
        : cleanBody;
    return `${trimmedBody} ${tagStr}`.trim();
  }

  const fallbackTag = selectedTags[0] || '#fyp';
  const maxBodyOnly = maxLen - fallbackTag.length - 1;
  const shortened =
    cleanBody.length > maxBodyOnly
      ? cleanBody.slice(0, Math.max(10, maxBodyOnly - 3)).replace(/\s+\S*$/, '') + '...'
      : cleanBody;
  return `${shortened} ${fallbackTag}`.trim().slice(0, maxLen);
}

// Varied viral caption generator with niche + platform hashtags (never cuts hashtags mid-word)
export function formatShortCaption(
  productName: string,
  category: string = '',
  usp: string = '',
  platform: string = 'TikTok Shop',
  tone: string = ''
): string {
  const cleanName = (productName || 'Produk Ini').replace(/\s+/g, ' ').trim().slice(0, 26);
  const uspShort = (usp || '')
    .split(/[,.;]/)[0]
    ?.replace(/\s+/g, ' ')
    .trim()
    .slice(0, 32);
  const isShopee = (platform || '').toLowerCase().includes('shopee');
  const isTikTok = (platform || '').toLowerCase().includes('tiktok');
  const cartTerm = isShopee
    ? 'keranjang oren'
    : isTikTok
    ? 'keranjang kuning'
    : 'keranjang bawah';

  const hashtags = buildNicheHashtags(productName, category, usp, platform);
  const toneLower = (tone || '').toLowerCase();

  const bodyTemplates = [
    `Nyesel baru nemu ${cleanName} sekarang 😭 ${uspShort ? uspShort + '!' : 'Hasilnya nyata banget.'} Cek ${cartTerm}!`,
    `Awalnya kira gimmick, eh ${cleanName} beneran kepake tiap hari ✨ Amankan di ${cartTerm} mumpung promo!`,
    `Ditanyain terus pakai apa—nih ku-spill ${cleanName} langsung di ${cartTerm} 👇🔥`,
    `Bandingin sendiri deh kualitas ${cleanName} ini! Stok cepat ludes, buruan cek ${cartTerm} 🛒`,
    `Lagi cari yang praktis & awet? ${cleanName} jawabannya 💡 Klik ${cartTerm} sebelum kehabisan!`,
    `Review jujur ${cleanName}: bukan kaleng-kaleng! Cek harga promonya di ${cartTerm} ⚡`,
    `Balas komen yang nanyain ${cleanName} kemarin 👇 Udah ku-sematin di ${cartTerm} ya!`,
    `Jangan checkout ${cleanName} kalau belum siap repeat order 😆 Cek ${cartTerm} sekarang!`,
  ];

  if (toneLower.includes('asmr') || toneLower.includes('aesthetic') || toneLower.includes('soft')) {
    bodyTemplates.unshift(
      `Detail kecil yang bikin hari lebih tenang ✨ ${cleanName} ready di ${cartTerm} ya 🌿`,
      `Pakai headset buat dengerin ASMR ${cleanName} 🎧 Cek produk aslinya di ${cartTerm}`
    );
  } else if (toneLower.includes('edukatif') || toneLower.includes('expert') || toneLower.includes('dokter')) {
    bodyTemplates.unshift(
      `Bedah fakta ${cleanName}: ${uspShort || 'kualitas teruji nyata'} 🔍 Cek detail di ${cartTerm}`,
      `Biar gak salah pilih, ini alasan ${cleanName} layak dicoba ✅ Link resmi di ${cartTerm}`
    );
  }

  const chosenBody = pickRandom(bodyTemplates);
  return fitCaptionWithHashtags(chosenBody, hashtags, 150);
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
  referenceImage: string = '',
  platform: string = 'TikTok Shop',
  referenceImages: string[] = [],
  physicsConsistencyCheck: boolean = true,
  tone: string = 'Santai, Mengalir & Natural (Teman Curhat)'
) {
  const normCat = (category || '').toLowerCase();
  const safeName = productName || 'Produk Pilihan';
  const safeUSP = keySellingPoints || 'Hasil terbukti nyata, praktis & kualitas terjamin';
  const uspLead = safeUSP.split(/[,.;]/)[0]?.trim() || 'kualitasnya nyata banget';
  const validRefs = Array.isArray(referenceImages) && referenceImages.length > 0
    ? referenceImages.filter(Boolean)
    : (referenceImage ? [referenceImage] : []);
  const refCount = Math.max(1, validRefs.length);

  const isShopee = (platform || '').toLowerCase().includes('shopee');
  const isTikTok = (platform || '').toLowerCase().includes('tiktok');
  const cartName = isShopee
    ? 'keranjang oren'
    : (isTikTok ? 'keranjang kuning' : 'keranjang di bawah');
  const cartIconPrompt = isShopee
    ? 'orange shopping cart icon'
    : (isTikTok ? 'yellow shopping cart icon' : 'shopping cart icon below');
  const cartPopupText = isShopee
    ? pickRandom(['KLIK KERANJANG OREN SEKARANG! 🛒👇', 'CEK PROMO KERANJANG OREN! 🛒🔥'])
    : isTikTok
    ? pickRandom(['KLIK KERANJANG KUNING SEKARANG! 🛒👇', 'VOUCHER KERANJANG KUNING AKTIF! 🛒🏷️'])
    : pickRandom(['KLIK KERANJANG DI BAWAH SEKARANG! 🛒👇', 'AMANKAN DI KERANJANG BAWAH! 🛒🔥']);

  const isHandsOnly =
    cameraAngleStyle.toLowerCase().includes('hand') ||
    cameraAngleStyle.toLowerCase().includes('tangan') ||
    cameraAngleStyle.toLowerCase().includes('faceless') ||
    (preferredCameraAngles && preferredCameraAngles.some((a) => a.toLowerCase().includes('tangan') || a.toLowerCase().includes('faceless')));

  const toneLower = (tone || '').toLowerCase();
  const isAsmrTone = toneLower.includes('asmr') || toneLower.includes('bisik');
  const isHypeTone = toneLower.includes('enerjik') || toneLower.includes('hype') || toneLower.includes('live') || toneLower.includes('fomo');
  const isExpertTone = toneLower.includes('edukatif') || toneLower.includes('expert') || toneLower.includes('dokter');

  // Pick a fresh R&D Hook Archetype for Scene 1 (Zero "Stop Scrolling"!)
  const chosenArchetype = pickDynamicHookArchetype(category, safeName);
  const dynamicScene1 = chosenArchetype.buildSceneOne({
    productName: safeName,
    usp: safeUSP,
    category,
    isHandsOnly,
    tone,
  });

  const shortUpper = safeName.toUpperCase().slice(0, 22);

  // Rich 9-step multi-variant pools so offline / fallback storyboards are NEVER monotonous
  const full9Scenes = [
    {
      ...dynamicScene1,
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] ${dynamicScene1.cameraAngle}, ${dynamicScene1.visualAction}, strict packaging and label consistency with reference image, strict physical laws, realistic gravity and mass inertia, natural hand biomechanics without clipping, consistent directional lighting with matching cast shadows, authentic camera motion, zero morphing, photorealistic 9:16 vertical 4k 60fps.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
    },
    {
      cameraAngle: 'Extreme Close-up / Macro (Tekstur & Detail)',
      visualAction: `Sorotan makro memperlihatkan detail masalah yang sering dialami lalu beralih mulus ke detail fisik kemasan ${safeName} persis seperti gambar referensi, dengan interaksi tangan solid tanpa clipping dan bayangan jatuh konsisten di atas meja.`,
      popupText: pickRandom([
        'SOLUSI PRAKTIS TANPA RIBET ✨',
        'DETAILNYA BUKAN KALENG-KALENG 🔍',
        'LIHAT DEKET TEKSTUR ASLINYA! 👀',
      ]),
      soundEffect: pickRandom(['Dramatic swoosh & Sparkle magic ting', 'Camera shutter click & Crisp pop', 'Magnetic lid snap click']),
      dialogVO: isAsmrTone
        ? `(Bisik pelan) Coba perhatiin dari dekat... detail ${safeName} sehalus dan serapi ini.`
        : isExpertTone
        ? `Kalau dibedah dari detail komponennya, ${safeName} memang dirancang khusus buat mengatasi kendala itu.`
        : pickRandom([
            `Padahal kuncinya ada di detail ${safeName} yang memang dirancang buat hasil optimal.`,
            `Nah, pas dicek dari dekat ternyata finishing ${safeName} ini niat banget buat pemakaian harian.`,
            `Bedanya kerasa di sini: ${safeName} gak asal bikin, detail fisiknya beneran kepake.`,
          ]),
      notesMood: pickRandom([
        'Gaya teks: Clean Modern Card. Pencahayaan directional konsisten dengan bayangan tajam natural.',
        'Gaya teks: Minimalist Editorial. Fokus makro tajam tanpa distorsi.',
      ]),
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] Extreme macro close-up slow zoom-in on the surface, texture, and physical details of ${safeName}, realistic solid-body contact without clipping, unified directional light with matching cast shadows, zero morphing, vertical 9:16 UGC style, 4k 60fps.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
    },
    {
      cameraAngle: 'Medium Shot (Setengah Badan)',
      visualAction: `Kreator tersenyum puas sambil mengangkat kemasan asli ${safeName} sejajar bahu dengan akselerasi dan inersia massa wajar, proporsi produk sesuai gambar referensi dan pencahayaan studio terarah serasi.`,
      popupText: pickRandom([
        `KENALIN: ${shortUpper} 🌟`,
        `ANDALAN BARU DI TAS! 💼`,
        `GAK HERAN JADI FAVORIT 🔥`,
      ]),
      soundEffect: pickRandom(['Sparkle chime & Ding', 'Match-cut hand slap whoosh', 'Bubble pop sound & Ting']),
      dialogVO: isHypeTone
        ? `Ini dia ${safeName} yang bikin rutinitasku langsung berubah jadi jauh lebih sat-set!`
        : pickRandom([
            `Ini dia ${safeName}, salah satu barang yang beneran ngebantu aktivitasku jadi jauh lebih ringan.`,
            `Kenalin ${safeName}—semenjak rutin ku-pake, urusan harian jadi gak makan waktu lagi.`,
            `Yang bikin beda, ${safeName} ini langsung kerasa praktis bahkan pas pertama kali dibawa beraktivitas.`,
          ]),
      notesMood: pickRandom([
        'Gaya teks: Bouncy Glow. Transisi cerah dengan bayangan natural.',
        'Gaya teks: Kinetic Typography Fast-Cut. Cahaya studio hangat.',
      ]),
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] Medium shot of relatable creator holding up original ${safeName} product beside their face with authentic hand grip biomechanics, identical branding to reference image, consistent directional key light and ambient occlusion, vertical 9:16, crisp mobile video quality.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
    },
    {
      cameraAngle: 'Close-up (Face / Ekspresi)',
      visualAction: `Sorotan tajam kemasan, segel resmi, dan ciri visual khas ${safeName} dalam genggaman lima jari yang proporsional dan realistis, merefleksikan detail referensi image dengan pantulan cahaya specular alami.`,
      popupText: pickRandom([
        'BUILD QUALITY 10/10 NIAT POL 💎',
        'KEMASAN ORI & SEGEL RAPI ✅',
        'FINISHING HALUS TANPA CACAT ⭐',
      ]),
      soundEffect: pickRandom(['Camera shutter & Pop', 'Crisp plastic peel sound', 'Sachet tear crisp & Ting']),
      dialogVO: pickRandom([
        `Dari detail kemasan dan finishing ${safeName} aja udah kelihatan kalau produk ini digarap serius.`,
        `Pegang langsung deh—bobotsolid dan detail segel ${safeName} nunjukin kualitas aslinya gak main-main.`,
        `Satu hal yang langsung ku-notice: kemasan ${safeName} ini rapi, aman, dan gak gampang rusak.`,
      ]),
      notesMood: 'Gaya teks: Gold Badge. Detail kemasan produk dengan tekstur tajam tanpa distorsi.',
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] Close-up product hero shot in creator's hand rotating slowly 45 degrees, anatomically correct 5 fingers holding object with realistic mass inertia, official seal and typography matching reference image, cinematic depth of field, 9:16 TikTok UGC style.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
    },
    {
      cameraAngle: 'POV / Handheld (First-Person)',
      visualAction: `Demonstrasi langsung menggunakan atau mengaplikasikan ${safeName} secara rapi dengan viskositas/gesekan fisik nyata, warna konsisten terhadap referensi image, dan micro-jitter kamera handheld yang realistis.`,
      popupText: pickRandom([
        '10 DETIK LANGSUNG NYAMAN 🌿',
        'TES PEMAKAIAN REAL-TIME ⚡',
        'SAT-SET GAK PAKE LAMA! ⏱️',
      ]),
      soundEffect: pickRandom(['ASMR Crisp & Smooth Whoosh', 'Spray mist hiss crisp', 'Cream squeeze squish & Pop']),
      dialogVO: isAsmrTone
        ? `(Bisik halus) Tinggal diaplikasikan pelan... teksturnya langsung menyatu tanpa rasa risih.`
        : pickRandom([
            `Cara pakainya praktis banget, nyaman digunakan, dan langsung kerasa bedanya sejak detik pertama.`,
            `Gak perlu teknik ribet—cukup pakai secukupnya, ${safeName} langsung bekerja sesuai ekspektasi.`,
            `Lihat sendiri pas dites langsung: ringan, cepat, dan gak ninggalin rasa ganggu sama sekali.`,
          ]),
      notesMood: 'Gaya teks: Minimalist Subtitle. Lighting jernih searah.',
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] Handheld POV demonstration of using ${safeName}, authentic physical contact and natural fluid mechanics, clean aesthetic setup, visual colors and consistency matching reference image, real camera inertia, 4k 60fps vertical 9:16.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
    },
    {
      cameraAngle: 'Side Profile 45° (Angle Samping)',
      visualAction: `Aksi pemakaian ${safeName} dengan gestur santai dan ekspresi menikmati manfaatnya, memperlihatkan produk secara natural dengan bayangan jatuh realistis dari sumber cahaya jendela samping.`,
      popupText: pickRandom([
        `${uspLead.toUpperCase().slice(0, 28)} ⚡`,
        'BUKAN GIMMICK: INI BUKTINYA ✅',
        'TAHAN LAMA BUAT SEHARIAN 💯',
      ]),
      soundEffect: pickRandom(['Ting sparkle', 'Level up victory chime', 'Gentle wind gust & Chime']),
      dialogVO: isExpertTone
        ? `Poin unggul utamanya ada di ${uspLead.toLowerCase()}, makanya hasilnya tetap stabil dipakai berjam-jam.`
        : pickRandom([
            `Keunggulan yang paling berasa itu ${uspLead.toLowerCase()}. Jadi beneran terbukti kerja nyata.`,
            `Jujur bagian terbaiknya ya ${uspLead.toLowerCase()}—itu yang bikin aku susah pindah ke lain hati.`,
            `Yang bikin makin yakin, soal ${uspLead.toLowerCase()} beneran konsisten dari pagi sampai sore.`,
          ]),
      notesMood: 'Gaya teks: Clean bullet points. Natural smile & directional light.',
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] 45-degree side profile angle, creator actively using ${safeName} with effortless human biomechanics and realistic deceleration, reference image product clearly visible, natural directional daylight, photorealistic UGC video.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
    },
    {
      cameraAngle: 'Front Camera / Selfie Mode (Curhat Langsung)',
      visualAction: `Reaksi wajah puas melihat hasil nyata dari ${safeName}, sambil menunjukkan produk ke arah kamera dengan kontak fisik telapak tangan mantap dan pencahayaan wajah searah yang lembut.`,
      popupText: pickRandom([
        'HASILNYA DILUAR EKSPEKTASI! 😍',
        'REAL RESULT SETELAH RUTIN ✨',
        'AUTO JADI LANGGANAN TIAP BULAN 🔁',
      ]),
      soundEffect: pickRandom(['Cheer & Success chime', 'Anime gasp & Sparkle', 'iPhone notification ping']),
      dialogVO: pickRandom([
        `Setelah rutin pakai, hasilnya bener-bener memuaskan dan bikin aktivitas sehari-hari makin pede.`,
        `Pantesan temen-temen pada repeat order, efek nyatanya emang konsisten dan gak mengecewakan.`,
        `Sekarang udah gak pernah skip lagi karena hasilnya beneran sejelas ini di pemakaian rutin.`,
      ]),
      notesMood: 'Gaya teks: Heart pop emoji. Warm studio tone dengan bayangan realistis.',
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] Front selfie camera perspective, creator smiling broadly admiring noticeable real results from ${safeName}, holding product close to camera with solid hand contact, packaging details match reference image, unified warm key lighting, zero morphing.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
    },
    {
      cameraAngle: 'Over the Shoulder (OTS)',
      visualAction: `Kreator memegang ${safeName} dengan gestur jempol mantap dan produk tampak jelas menghadap kamera, menapak stabil di tangan tanpa efek melayang atau tembus jari.`,
      popupText: pickRandom([
        'RATING JUJUR: 9.7 / 10 ⭐',
        'MODAL RECEH RASA BUTIK 💸',
        'WORTH IT BUAT DICOBA 💯',
      ]),
      soundEffect: pickRandom(['Cha-ching cash register', 'Bell counter ding', 'Heroic fanfare / Tadaa']),
      dialogVO: pickRandom([
        `Buat kalian yang lagi cari ${safeName} berkualitas, menurutku ini pilihan yang paling layak dicoba.`,
        `Daripada coba-coba yang belum jelas, mending langsung pilih ${safeName} yang udah kebukti aman dan awet.`,
        `Kalau dihitung sama manfaat yang didapat, ${safeName} ini jelas menang telak di kelas harganya.`,
      ]),
      notesMood: 'Gaya teks: Green verified badge. Pencahayaan konsisten.',
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] Over-the-shoulder perspective, creator giving an enthusiastic thumbs-up while displaying ${safeName} bottle/package to camera, anatomically accurate fingers, accurate label colors adhering to reference image, consistent directional lighting.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
    },
    {
      cameraAngle: 'Low Angle (Hero / Powerful)',
      visualAction: `Kreator tersenyum antusias menunjuk ke pojok kiri bawah layar ke arah ${cartName} sambil memegang kemasan ${safeName} secara stabil melawan gravitasi dengan bayangan jatuh serasi.`,
      popupText: cartPopupText,
      soundEffect: pickRandom(['Bell ring & Cha-ching', 'Cashier barcode beep & Sparkle', 'Applause & Cha-ching cash register']),
      dialogVO: pickRandom([
        `Mumpung ${safeName} lagi ada voucher promo dan gratis ongkir, langsung cek di ${cartName} sekarang ya!`,
        `Sebelum stok variannya habis lagi kayak kemarin, langsung amankan ${safeName} lewat ${cartName}!`,
        `Link produk aslinya udah ku-sematin di ${cartName}, tinggal klik mumpung diskon masih nyala!`,
      ]),
      notesMood: `Gaya teks: Pulsing CTA Button. Urgent offer menunjuk ${cartName}.`,
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] Low-angle dynamic hero shot, creator smiling invitingly and pointing down toward ${cartIconPrompt} while holding ${safeName}, natural arm biomechanics, packaging prominently featured, directional key light with matching cast shadows, vertical 9:16 UGC video.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
    },
  ];

  const handsOnly9Scenes = [
    {
      ...dynamicScene1,
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] Faceless UGC ${dynamicScene1.cameraAngle}, neat hands on aesthetic desk, ${dynamicScene1.visualAction}, reference image packaging match, strict physical laws, realistic gravity and mass inertia, natural hand biomechanics without clipping, consistent directional lighting with matching cast shadows, 9:16 smartphone video, crisp soft shadows, 4k 60fps.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
    },
    {
      cameraAngle: 'Top-Down Hands-Only (Tangan di Atas Meja)',
      visualAction: `Sudut kamera 90° tegak lurus ke meja. Dua tangan talent dengan 5 jari proporsional membuka segel box dan mengeluarkan kemasan fisik ${safeName} dengan gesekan fisik dan inersia nyata di atas permukaan kayu, bayangan jatuh konsisten ke arah bawah.`,
      popupText: pickRandom([`FIRST LOOK: ${shortUpper} ✨`, 'UNBOXING RAPI & ESTETIK 📦', 'KEMASAN NIAT BANGET! 👌']),
      soundEffect: pickRandom(['ASMR Paper unwrap & Chime', 'Tape slicing crisp & Soft pop']),
      dialogVO: pickRandom([
        `Begitu dikeluarkan dari box, detail kemasan ${safeName} kelihatan rapi dan berkelas banget.`,
        `Pas segelnya dibuka di meja, langsung kerasa kalau kualitas material ${safeName} ini serius.`,
      ]),
      notesMood: 'Gaya teks: Clean Bouncy. Flat lay meja bersih dengan pencahayaan overhead terarah.',
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] Flat lay 90-degree overhead top-down shot, realistic human hands smoothly sliding ${safeName} physical product out of retail box, authentic tactile friction and gravity, aesthetic minimal backdrop, lighting highlights pristine finish matching reference image, vertical 9:16.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
    },
    {
      cameraAngle: 'Extreme Close-up / Macro (Tekstur & Detail)',
      visualAction: `Close-up super makro. Jari-jemari tangan memutar kemasan ${safeName} dengan kontak fisik padat tanpa tembus/clipping, memperlihatkan segel resmi, detail aplikator, dan label original sesuai gambar referensi di bawah pencahayaan directional tajam.`,
      popupText: pickRandom(['DETAIL KEMASAN 100% ORI 🔍', 'CEK SEGEL & LABEL RESMI ✅', 'PRESISI & KOKOH BANGET 💎']),
      soundEffect: pickRandom(['Camera shutter click', 'Magnetic lid snap click']),
      dialogVO: pickRandom([
        `Perhatikan detail segel dan ciri kemasannya, presisi dan kualitas bahannya kokoh.`,
        `Dari dekat kelihatan banget detail cetakan dan aplikatornya rapi tanpa cacat.`,
      ]),
      notesMood: 'Gaya teks: Gold Badge. Pencahayaan makro tajam dengan bayangan mikro konsisten.',
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] Extreme macro slow 360-spin in hands, anatomically correct fingers turning ${safeName} to display official barcode and holographic seal, razor-sharp focus on brand font matching reference image, solid body contact, clean 4k 60fps.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
    },
    {
      cameraAngle: 'Hand Swatch & Application (Tangan Mengoles Produk)',
      visualAction: `Tangan talent mengaplikasikan tekstur ${safeName} langsung di punggung tangan dengan kontak kulit realistis, viskositas cairan/krim alami yang mematuhi hukum fisika tanpa distorsi tekstur.`,
      popupText: pickRandom(['TEKSTUR HALUS & CEPAT MERESAP 🌿', 'TEST LANGSUNG DI KULIT ✨', 'RINGAN GAK LENGKET! 👌']),
      soundEffect: pickRandom(['ASMR Crisp Glide & Swirl', 'Cream squeeze squish & Ting']),
      dialogVO: pickRandom([
        `Pas dicoba langsung di tangan, teksturnya nyaman, mudah merata, dan tidak lengket sama sekali.`,
        `Lihat sendiri secepat apa dia menyatu pas diratakan pelan di punggung tangan.`,
      ]),
      notesMood: 'Gaya teks: Glassmorphism Tag. Fokus gerakan jari alami & pencahayaan lembut.',
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] Close-up hands-only application, finger smoothly demonstrating ${safeName} across back of hand, realistic fluid dynamics and skin friction, satisfying ASMR motion, lighting reveals true product finish, 9:16 vertical.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
    },
    {
      cameraAngle: 'Hands-Only / Tangan Saja (Faceless / Tanpa Wajah)',
      visualAction: `Kedua tangan memperagakan cara pemakaian praktis ${safeName} dengan biomekanik alami dan inersia massa nyata, mendemonstrasikan keunggulan ${safeUSP}.`,
      popupText: pickRandom([`${uspLead.toUpperCase().slice(0, 28)} ⚡`, 'PAKAI SEDIKIT UDAH BERASA 💡']),
      soundEffect: pickRandom(['Sparkle Ding', 'Finger snap click & Chime']),
      dialogVO: pickRandom([
        `Tinggal digunakan secukupnya, keunggulannya langsung terasa sejak percobaan pertama.`,
        `Gak perlu banyak-banyak, sekali pakai aja udah nunjukin efek ${uspLead.toLowerCase()}.`,
      ]),
      notesMood: 'Gaya teks: Bullet point checklist. Aksi tangan jelas tanpa glitch.',
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] Hands demonstrating practical use of ${safeName}, elegant human hand movement with realistic mass inertia, steady camera angle, product front label always oriented towards camera matching reference image, 4k 60fps.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
    },
    {
      cameraAngle: 'POV Hands-Only (Hanya Tangan & Produk)',
      visualAction: `Tangan kanan memegang produk ${safeName} dengan grip kokoh alami, tangan kiri memberikan gestur jempol puas di depan meja estetik dengan bayangan objek jatuh serasi ke sisi kanan.`,
      popupText: pickRandom(['RATING: 9.8/10 RECOMMENDED! ⭐', 'BUKTI REAL BUKAN ENDORSE 💯']),
      soundEffect: pickRandom(['Success bell & Cha-ching', 'Level up victory chime']),
      dialogVO: pickRandom([
        `Dari segi performa dan kualitas fisik, ini beneran melebihi ekspektasi di kelas harganya.`,
        `Worth it banget buat masuk daftar belanja bulanan karena kualitasnya konsisten.`,
      ]),
      notesMood: 'Gaya teks: Star Rating Badge. Gestur tangan puas dan bayangan realistis.',
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] POV shot with right hand presenting ${safeName} bottle and left hand giving satisfied thumbs-up gesture, clean cozy aesthetic desk, packaging color accuracy locked to reference image, natural directional lighting with cast shadows, 9:16 vertical.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
    },
    {
      cameraAngle: 'Top-Down Hands-Only (Tangan di Atas Meja)',
      visualAction: `Tangan talent menaruh produk ${safeName} secara presisi di atas meja linen dengan sentuhan fisik nyata dan suara kontak pelan, di sebelah properti minimalis dengan bayangan lembut yang seragam.`,
      popupText: pickRandom(['PRAKTIS & TRAVEL-FRIENDLY ✈️', 'RINGKAS MUAT DI POUCH 💯']),
      soundEffect: pickRandom(['Soft pop & Chime', 'Gentle box tapping ASMR']),
      dialogVO: pickRandom([
        `Bentuknya juga ringkas, gampang disimpan atau dibawa bepergian ke mana saja.`,
        `Ukurannya pas buat diselipin di tas harian tanpa bikin penuh.`,
      ]),
      notesMood: 'Gaya teks: Verified badge. Pencahayaan softbox terarah.',
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] Top-down flat lay view, hands placing ${safeName} gently next to aesthetic props on linen table, solid object contact with table surface, studio grade softbox lighting with matching cast shadows, brand label facing up matching reference image.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
    },
    {
      cameraAngle: 'Hand Swatch & Application (Tangan Mengoles Produk)',
      visualAction: `Tangan mengetuk ringan kemasan produk (ASMR Tapping) dengan kontak ujung kuku yang tegas lalu memperlihatkan kondisi produk yang bersih dan higienis tanpa goresan tekstur aneh.`,
      popupText: pickRandom(['HIGIENIS & AWET BERBULAN-BULAN 🎧', 'ANTI TUMPAH & AMAN ✅']),
      soundEffect: pickRandom(['Crisp ASMR Tapping', 'Whisper mic brush & Ting']),
      dialogVO: pickRandom([
        `Kemasannya aman, anti tumpah, dan isinya awet untuk pemakaian rutin.`,
        `Tutupnya rapat banget, jadi aman dibawa jalan dan gak gampang bocor.`,
      ]),
      notesMood: 'Gaya teks: Floating glow text. Gerakan stabil.',
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] Close-up hands gently finger-tapping on ${safeName} packaging with crisp satisfying realistic physics, pristine product condition adhering to reference image, consistent studio light, hyperrealistic 4k.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
    },
    {
      cameraAngle: 'Hands-Only / Tangan Saja (Faceless / Tanpa Wajah)',
      visualAction: `Tangan talent memegang produk ${safeName} dengan stabil melawan gravitasi dan jari telunjuk menunjuk langsung ke pojok kiri bawah layar ke arah ikon ${cartName} dengan gerakan tangan yang mantap dan bayangan jatuh realistis.`,
      popupText: cartPopupText,
      soundEffect: pickRandom(['Cash register cha-ching & Bell', 'Cashier barcode beep & Chime']),
      dialogVO: pickRandom([
        `Mumpung lagi ada diskon dan gratis ongkir, langsung checkout di ${cartName} sekarang ya!`,
        `Stok lagi ready di ${cartName}, klik sekarang sebelum warna atau variannya habis!`,
      ]),
      notesMood: `Gaya teks: Pulsing CTA Button. Tangan menunjuk ${cartName}.`,
      googleFlowPrompt: `[Image 1 Reference: ${safeName}] Dynamic closing shot, hands holding ${safeName} with index finger pointing directly towards bottom-left corner where ${cartIconPrompt} is located, realistic arm biomechanics, product branding in crystal clear focus matching reference image, 9:16 vertical UGC video.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
    },
  ];

  // If specific camera angles or style requested, dynamically customize camera angles
  const styleLower = cameraAngleStyle.toLowerCase();
  const availableAngles = preferredCameraAngles && preferredCameraAngles.length > 0
    ? preferredCameraAngles
    : styleLower.includes('hand') || styleLower.includes('tangan') || styleLower.includes('faceless')
    ? ['Hands-Only / Tangan Saja (Faceless / Tanpa Wajah)', 'POV Hands-Only (Hanya Tangan & Produk)', 'Top-Down Hands-Only (Tangan di Atas Meja)', 'Hand Swatch & Application (Tangan Mengoles Produk)', 'Unboxing Hands-Only (Buka Paket Tangan Saja)', 'Extreme Close-up / Macro (Tekstur & Detail)']
    : styleLower.includes('macro') && styleLower.includes('tech')
    ? ['Overhead Desk Tour Pan (Meja Rapi)', 'Macro Pour / Spray Slow-Motion (Cairan & Mist)', '360° Product Orbit / Spin (Putaran Produk)', 'Extreme Close-up / Macro (Tekstur & Detail)']
    : styleLower.includes('macro')
    ? ['Extreme Close-up / Macro (Tekstur & Detail)', 'Flat Lay / Top-down (Meja Estetik)', 'Slow Zoom-In Push (Dramatis Fokus)', 'Close-up (Face / Ekspresi)']
    : styleLower.includes('soft') || styleLower.includes('golden')
    ? ['Walk-and-Talk Gimbal Follow (Jalan Santai Estetik)', 'Flat Lay / Top-down (Meja Estetik)', 'Mirror Reflection Shot (Kaca GRWM)', 'Slow Zoom-In Push (Dramatis Fokus)']
    : styleLower.includes('live')
    ? ['Split-Frame Reaction & Product Demo', 'Front Camera / Selfie Mode (Curhat Langsung)', 'Snap-Zoom Product Punch (Zoom Cepat Beat Drop)', 'Low Angle (Hero / Powerful)']
    : styleLower.includes('narrative') || styleLower.includes('b-roll')
    ? ['Time-Lapse Transformation Cut (Harian / Progres)', 'Dolly Zoom / Vertigo Reveal (Dramatis)', 'Side Profile 45° (Angle Samping)', 'Tracking Following Shot (Gerak Mengikuti)']
    : styleLower.includes('pov')
    ? ['POV / Handheld (First-Person)', 'Over the Shoulder (OTS)', 'Close-up (Face / Ekspresi)', 'Medium Close-up (Dada ke Atas)']
    : styleLower.includes('flat')
    ? ['Flat Lay / Top-down (Meja Estetik)', 'Bird\'s Eye View (Overhead 90°)', 'Extreme Close-up / Macro (Tekstur & Detail)', 'Over the Shoulder (OTS)']
    : styleLower.includes('front') || styleLower.includes('selfie')
    ? ['Front Camera / Selfie Mode (Curhat Langsung)', 'Eye-Level (Natural Eye)', 'Close-up (Face / Ekspresi)', 'Side Profile 45° (Angle Samping)']
    : styleLower.includes('cinematic') || styleLower.includes('orbit')
    ? ['360° Product Orbit / Spin (Putaran Produk)', 'Tracking Following Shot (Gerak Mengikuti)', 'Low Angle (Hero / Powerful)', 'Slow Zoom-In Push (Dramatis Fokus)']
    : styleLower.includes('hero') || styleLower.includes('low')
    ? ['Low Angle (Hero / Powerful)', 'Worm\'s Eye View (Ground-Level Dramatis)', 'Medium Shot (Setengah Badan)', 'Tracking Following Shot (Gerak Mengikuti)']
    : styleLower.includes('dutch')
    ? ['Dutch Angle (Tilted / Shock Dramatis)', 'Crash Zoom-Out (Efek Kaget / Reveal)', 'POV / Handheld (First-Person)', 'Close-up (Face / Ekspresi)']
    : styleLower.includes('mirror')
    ? ['Mirror Reflection Shot (Kaca GRWM)', 'Side Profile 45° (Angle Samping)', 'Eye-Level (Natural Eye)', 'Close-up (Face / Ekspresi)']
    : styleLower.includes('0.5x') || styleLower.includes('gen-z')
    ? ['0.5x Ultra-Wide Gen-Z Selfie (Ekspresif & Dekat)', 'Match-Cut Hand Transition (Tutup Lensa & Reveal)', 'Snap-Zoom Product Punch (Zoom Cepat Beat Drop)', 'Whip-Pan Outfit / Result Reveal (Transisi Putar)']
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

  const physicsTokens = physicsConsistencyCheck
    ? 'strict physical laws, realistic mass inertia, biomechanical constraint adherence, real gravity and solid-contact mechanics without clipping, consistent directional lighting with matching cast shadows, natural handheld camera motion, zero floaty artifacts, zero morphing, photorealistic 9:16 vertical 4k 60fps'
    : 'natural product showcase, consistent lighting, photorealistic 9:16 vertical 4k 60fps';

  const mappedScenes = selectedBase.map((sc, i) => {
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
        ? dynamicScene1.popupText
        : `DETAIL ${safeName.toUpperCase().slice(0, 20)} ✨`;

    const refIndexForScene = (i % refCount) + 1;
    const refTag =
      refCount > 1
        ? `[Image ${refIndexForScene} of ${refCount} Reference: ${safeName}]`
        : `[Image 1 Reference: ${safeName}]`;

    let flowPrompt = sc.googleFlowPrompt || '';
    if (!flowPrompt) {
      flowPrompt = `${refTag} Scene ${i + 1} (${angle}): ${sc.visualAction} - On-Screen Pop-up Text Overlay: "${popupText}" - ${physicsTokens}.`;
    } else {
      if (refCount > 1) {
        flowPrompt = flowPrompt.replace(/\[Image 1 Reference:[^\]]*\]/i, refTag);
      }
      if (!/on-screen pop-up text overlay|text overlay|popup text/i.test(flowPrompt)) {
        flowPrompt = `${flowPrompt} - On-Screen Pop-up Text Overlay: "${popupText}"`;
      }
      if (
        physicsConsistencyCheck &&
        (!/realistic mass inertia/i.test(flowPrompt) || !/biomechanical constraint adherence/i.test(flowPrompt))
      ) {
        flowPrompt = `${flowPrompt}, ${physicsTokens}`;
      }
    }

    const refNote =
      refCount > 1
        ? `Pastikan Produk sesuai Gambar referensi #${refIndexForScene} (dari ${refCount} foto referensi terlampir)`
        : 'Pastikan Produk sesuai Gambar referensi yang sudah di attached';

    return {
      ...sc,
      cameraAngle: angle,
      duration: sceneDuration,
      popupText,
      googleFlowPrompt: flowPrompt,
      imageReferenceNote: refNote,
    };
  });

  const scenes = ensureVariedStoryboardScenes(mappedScenes, safeName, safeUSP, platform);

  return {
    title: `Storyboard ${category || 'UGC'} - ${safeName}`,
    targetAudienceSummary: targetAudience || 'Pengguna aktif TikTok & Reels yang mencari produk viral berkualitas',
    hookTip: `Strategi R&D Hook [${chosenArchetype.name}]: ${chosenArchetype.psychology}`,
    caption: formatShortCaption(safeName, category, safeUSP, platform, tone),
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

  // 2. Resolve Product Name, Brand & Price accurately (Prioritize share-text intelligence & real scraped metadata)
  const shareIntel = extractShareTextIntelligence(rawInputCombined);
  let detectedName = '';
  let detectedPrice = shareIntel.sharePrice || linkData?.price || '';
  if (detectedPrice && /^\d+$/.test(String(detectedPrice).replace(/[.,\s]/g, ''))) {
    const numPrice = Number(String(detectedPrice).replace(/[^\d]/g, ''));
    if (numPrice > 0) {
      detectedPrice = `Rp ${numPrice.toLocaleString('id-ID')}`;
    }
  } else if (detectedPrice && !String(detectedPrice).toLowerCase().startsWith('rp')) {
    detectedPrice = `Rp ${detectedPrice}`;
  }

  // Candidate A0: Explicit product name from marketplace share sentence (e.g. "Cek Setelan Arsyilla Klok (Restock) dengan harga Rp155.000...")
  if (
    shareIntel.shareProductName &&
    !isGenericMarketplaceFallback(shareIntel.shareProductName) &&
    !isLikelyShortcodeOrHash(shareIntel.shareProductName) &&
    shareIntel.shareProductName.length >= 3
  ) {
    detectedName = cleanMarketplaceProductName(shareIntel.shareProductName, detectedPlatform);
  }

  // Candidate A: Real scraped product name from linkData
  if (
    !detectedName &&
    linkData?.productName &&
    !isGenericMarketplaceFallback(linkData.productName) &&
    !isLikelyShortcodeOrHash(linkData.productName) &&
    linkData.productName.length >= 3
  ) {
    detectedName = cleanMarketplaceProductName(linkData.productName, detectedPlatform);
  }

  // Candidate B: Text provided by user (e.g. share text or input notes)
  if (!detectedName && cleanTextNoUrls) {
    const cleanedText = cleanMarketplaceProductName(cleanTextNoUrls, detectedPlatform);
    if (cleanedText && cleanedText.length >= 3 && !isGenericMarketplaceFallback(cleanedText)) {
      const firstSegment = cleanedText.split(/[\n–—]/)[0]?.trim();
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

  // Fallback if completely empty
  if (!detectedName || detectedName.trim().length < 2) {
    detectedName = 'Produk Unggulan Pilihan';
  }

  // 3. Resolve Brand accurately
  let detectedBrand = shareIntel.shareBrand || linkData?.brand || '';
  if (!detectedBrand) {
    detectedBrand =
      detectKnownBrand(detectedName + ' ' + rawInputCombined) ||
      inferProductBrandOrCollection(detectedName) ||
      '';
  }

  // 4. Default baseline properties
  const priceTagText = detectedPrice ? ` dengan harga terjangkau ${detectedPrice}` : '';
  let detectedCat = 'Review';
  let detectedDuration = 30;
  let detectedTone = 'Santai, Mengalir & Natural (Teman Curhat)';
  let detectedUSP = `Kualitas terjamin, performa optimal${priceTagText}, dan terbukti memberikan hasil nyata.`;
  let detectedDesc = `${detectedName}${detectedBrand ? ` dari ${detectedBrand}` : ''} merupakan pilihan favorit dengan ulasan positif yang mengutamakan kualitas, detail rapi, dan kenyamanan pemakaian${priceTagText}.`;
  let detectedAudience = `Pria dan wanita usia 18-35 tahun aktif di media sosial yang mencari produk berkualitas terbukti.`;
  const detectedTags: string[] = [detectedPlatform.replace(/\s+/g, '')];

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
  // NICHE J1: Setelan Wanita / One Set / Modest Wear / Klok / Tunik / Dress / Daster / Kebaya / Gamis / Hijab
  else if (
    n.includes('setelan') ||
    n.includes('oneset') ||
    n.includes('one set') ||
    n.includes('klok') ||
    n.includes('tunik') ||
    n.includes('dress') ||
    n.includes('daster') ||
    n.includes('kebaya') ||
    n.includes('gamis') ||
    n.includes('abaya') ||
    n.includes('kaftan') ||
    n.includes('hijab') ||
    n.includes('jilbab') ||
    n.includes('pashmina') ||
    n.includes('mukena') ||
    n.includes('muslimah') ||
    n.includes('khimar') ||
    n.includes('bergo') ||
    n.includes('crinkle') ||
    n.includes('rayon')
  ) {
    detectedCat = 'Haul';
    detectedPersona = 'Hijaber Trendy / Muslimah Modern';
    detectedCameraStyle = 'Mirror Reflection Shot & GRWM (Get Ready With Me)';
    personaExplanation = `Persona Hijaber Trendy / Muslimah Modern dipilih karena paling relevan untuk memamerkan jatuhnya bahan, cuttingan klok/setelan, dan kenyamanan ${detectedName} saat dipakai OOTD.`;
    cameraStyleExplanation = 'Gaya Mirror Reflection Shot & GRWM menonjolkan siluet full-body, detail ayunan bahan (flowy/klok), serta kecocokan warna pakaian secara nyata di depan cermin.';
    preferredCameraAngles = [
      'Mirror Reflection Shot (Kaca GRWM)',
      'Wide Shot (Ruangan / Full Body)',
      'Extreme Close-up / Macro (Tekstur & Detail)',
      'Front Camera / Selfie Mode (Curhat Langsung)',
    ];
    detectedUSP = `Bahan adem jatuh (flowy) dan tidak menerawang, potongan nyaman dipakai harian maupun acara spesial, jahitan rapi kualitas butik${detectedPrice ? ` dengan harga ramah kantong ${detectedPrice}` : ''}.`;
    detectedDesc = `${detectedName}${detectedBrand ? ` koleksi ${detectedBrand}` : ''} hadir dengan desain modis dan cuttingan anggun yang memberikan siluet rapi, adem di kulit, serta bebas gerak seharian${priceTagText}.`;
    detectedAudience = 'Wanita muda, mahasiswi, ibu muda, dan pencinta OOTD/fashion muslimah usia 18-40 tahun yang mengutamakan kenyamanan dan tampilan anggun.';
    detectedTags.push('OOTDSetelan', 'RacunShopee', 'FashionWanita', 'MuslimahOOTD');
  }
  // NICHE J2: Pakaian Kasual / Kaos / Hoodie / Kemeja / Celana / Kulot / Blouse / Cardigan / Outer
  else if (
    n.includes('kaos') ||
    n.includes('hoodie') ||
    n.includes('t-shirt') ||
    n.includes('kemeja') ||
    n.includes('celana') ||
    n.includes('kulot') ||
    n.includes('blouse') ||
    n.includes('cardigan') ||
    n.includes('outer') ||
    n.includes('sweater') ||
    n.includes('rok') ||
    n.includes('jaket') ||
    n.includes('oversize') ||
    n.includes('baju') ||
    n.includes('outfit') ||
    n.includes('pakaian')
  ) {
    detectedCat = 'Haul';
    detectedPersona = 'Fashion Stylist / OOTD Enthusiast';
    detectedCameraStyle = 'Mirror Reflection Shot & GRWM (Get Ready With Me)';
    personaExplanation = `Persona Fashion Stylist / OOTD Enthusiast dipilih untuk mendemonstrasikan mix-and-match dan fitting ${detectedName} secara stylish.`;
    cameraStyleExplanation = 'Gaya Mirror Reflection Shot & GRWM memperlihatkan proporsi pakaian di badan dari berbagai sudut secara estetik.';
    preferredCameraAngles = ['Mirror Reflection Shot (Kaca GRWM)', 'Wide Shot (Ruangan / Full Body)', 'Side Profile 45° (Angle Samping)'];
    detectedUSP = `Bahan adem menyerap keringat, jahitan rapi kuat tidak mudah melar, cuttingan pas modis${detectedPrice ? ` seharga ${detectedPrice}` : ''}.`;
    detectedDesc = `${detectedName} menghadirkan siluet kasual yang nyaman dan fleksibel untuk mix-and-match gaya harian${priceTagText}.`;
    detectedAudience = 'Remaja & dewasa muda usia 16-35 tahun penggemar fashion simpel tapi berkarakter.';
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

  // 6. Final Category & Tone adjustments based on input cues
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
  } else if (combined.includes('mitos') || combined.includes('fakta')) {
    detectedCat = 'Mitos vs Fakta (Bedah Klaim)';
    detectedTone = 'Skeptis Jadi Yakin (Review Jujur Tanpa Endorse)';
  } else if (combined.includes('balas komen') || combined.includes('q&a')) {
    detectedCat = 'Balas Komentar Netizen (Q&A)';
    detectedTone = 'Balas Komentar Netizen (Q&A Interaktif)';
  } else if (combined.includes('routine') || combined.includes('pagi') || combined.includes('malam')) {
    detectedCat = 'Morning / Night Routine Ritual';
    detectedTone = 'Soft Aesthetic, Hangat & Poetic Lifestyle';
  } else if (combined.includes('dupe') || combined.includes('murah rasa mewah')) {
    detectedCat = 'Dupe Hunter (Hemat Rasa Mewah)';
    detectedTone = 'Smart Buyer & Hitung-Hitungan Hemat';
  }

  if (detectedCat === 'ASMR / Satisfying') {
    detectedTone = 'Soft-Spoken, ASMR Bisik & Sensory';
  } else if (detectedCat === 'Haul' || detectedCat === 'Flash Deal & Live Energy') {
    detectedTone = 'Spill Racun Enerjik & Hype (Fast-Cut FYP)';
  } else if (detectedCat === 'Tutorial' && detectedPersona.includes('Dokter')) {
    detectedTone = 'Edukatif, Kredibel & Berwibawa (Dokter / Expert)';
  } else if (detectedCat === 'Komedi / Sketsa') {
    detectedTone = 'Komedi Ekspresif, Blunder & Drama Sketsa';
  }

  // Ensure tags are clean and unique
  const finalTags = Array.from(new Set(detectedTags.filter(Boolean))).slice(0, 5);

  return {
    productName: detectedName,
    brandName: detectedBrand,
    price: detectedPrice || undefined,
    productUrl: detectedUrl,
    imageUrl: linkData?.ogImage || linkData?.imageUrl || linkData?.image || undefined,
    referenceImage: linkData?.ogImage || linkData?.imageUrl || linkData?.image || undefined,
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
    detectionSummary: `Berhasil mendeteksi produk "${detectedName}"${detectedBrand ? ` (${detectedBrand})` : ''}${detectedPrice ? ` seharga ${detectedPrice}` : ''} untuk platform ${detectedPlatform} kategori ${detectedCat}.`,
  };
}
