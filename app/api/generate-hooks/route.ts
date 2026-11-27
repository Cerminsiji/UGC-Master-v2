import { NextRequest, NextResponse } from 'next/server';
import { Type } from '@google/genai';
import type { ReferenceRole, VisualContinuityBible } from '@/types';
import {
  generateWithFallback,
  parseSafeJson,
  getVoiceToneDirective,
  REFERENCE_ROLE_OPTIONS,
} from '@/lib/gemini-ugc';

const HOOK_FORMULA_BLUEPRINTS = [
  {
    type: 'Visual Shock & Contrast',
    formulaGroup: 'Visual & Proof',
    directive: 'Langsung tunjukkan kontras hasil ekstrem atau bukti fisik paling mencolok di frame detik pertama.',
  },
  {
    type: 'Negative Warning / Reverse Psychology',
    formulaGroup: 'Psikologi & FOMO',
    directive: 'Beri peringatan unik/terbalik yang memancing rasa penasaran (tanpa kalimat klise "Stop scrolling").',
  },
  {
    type: 'Curiosity Gap / Rahasia Tersembunyi',
    formulaGroup: 'Psikologi & FOMO',
    directive: 'Ungkap fakta atau detail tersembunyi pada produk yang jarang disadari 90% orang.',
  },
  {
    type: 'Social Proof & Ditanyain Teman',
    formulaGroup: 'Cerita & Relatable',
    directive: 'Buka dengan pengalaman nyata ditanya orang kantor/sahabat atau baru kebagian restock viral.',
  },
  {
    type: 'Relatable Micro-Pain Point',
    formulaGroup: 'Cerita & Relatable',
    directive: 'Sentuh masalah mikro sehari-hari yang spesifik dan bikin penonton langsung mengangguk setuju.',
  },
  {
    type: 'Myth-Busting / Plot Twist',
    formulaGroup: 'Edukasi & Twist',
    directive: 'Patahkan anggapan umum yang keliru atau mulai dengan "Awalnya kira gimmick, ternyata..."',
  },
  {
    type: 'Live Stress-Test (Tanpa Cut)',
    formulaGroup: 'Visual & Proof',
    directive: 'Tantang dan uji klaim produk secara live real-time di depan lensa dalam 3 detik pertama.',
  },
  {
    type: 'Smart Buyer Value Math',
    formulaGroup: 'Edukasi & Twist',
    directive: 'Bandingkan penghematan biaya/waktu atau kualitas vs harga produk yang jauh lebih mahal.',
  },
  {
    type: 'Balas Komentar Netizen ("Kak Spill!")',
    formulaGroup: 'Interaktif & Tren',
    directive: 'Mulai seolah membalas komentar spesifik penonton di video sebelumnya dengan stiker reply comment.',
  },
  {
    type: 'Unpopular Opinion / Hot Take',
    formulaGroup: 'Interaktif & Tren',
    directive: 'Berikan opini jujur berani yang menantang tren umum pembeli mahal lalu arahkan ke produk ini.',
  },
  {
    type: 'Price Shock & Dupe Alert',
    formulaGroup: 'Psikologi & FOMO',
    directive: 'Sorot keterkejutan kualitas premium/mewah yang ternyata punya harga jauh lebih hemat dari versi mahal.',
  },
  {
    type: 'Catatan Progres Harian (Hari ke-1 vs ke-14)',
    formulaGroup: 'Cerita & Relatable',
    directive: 'Tunjukkan dokumentasi progres pemakaian rutin dari hari pertama sampai perubahan nyatanya terlihat.',
  },
];

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)] || items[0];
}

async function handleGenerateHooksRequest(body: any) {
  try {
    const {
      productName = 'Produk',
      category = 'Before & After',
      productDescription = '',
      keySellingPoints = '',
      persona = '',
      tone = '',
      targetPlatform = 'TikTok Shop',
      referenceImages: rawReferenceImages = [],
      referenceRoles: rawReferenceRoles = [],
      visualBible: rawVisualBible = null,
      painPoints = [],
    } = body || {};

    const allReferenceImages: string[] = Array.isArray(rawReferenceImages)
      ? rawReferenceImages.filter((x: unknown) => typeof x === 'string' && x.trim().length > 0)
      : [];
    const validRoleSet = new Set<ReferenceRole>(REFERENCE_ROLE_OPTIONS.map((r) => r.value));
    const normalizedRoles: ReferenceRole[] = Array.from(
      { length: Math.max(1, allReferenceImages.length) },
      (_, idx) => {
        const candidate = Array.isArray(rawReferenceRoles) ? rawReferenceRoles[idx] : undefined;
        if (candidate && validRoleSet.has(candidate)) return candidate as ReferenceRole;
        return idx === 0 ? 'product' : 'detail';
      }
    );
    const visualBible: Partial<VisualContinuityBible> | null =
      rawVisualBible && typeof rawVisualBible === 'object' ? rawVisualBible : null;
    const painList: string[] = Array.isArray(painPoints) ? painPoints.filter(Boolean).slice(0, 5) : [];

    // Pick 10 varied formulas from 12 blueprints in fresh randomized order per request
    const selectedBlueprints = [...HOOK_FORMULA_BLUEPRINTS]
      .sort(() => Math.random() - 0.5)
      .slice(0, 10);

    const formulaListText = selectedBlueprints
      .map((f, idx) => `${idx + 1}. type: "${f.type}" | formulaGroup: "${f.formulaGroup}" — ${f.directive}`)
      .join('\n');

    const toneDirective = getVoiceToneDirective(tone);

    const prompt = `Buatkan 10 variasi Hook 3 detik pertama (A/B/C Testing Viral Formula) untuk produk "${productName}" dalam kategori "${category}".
KONTEKS PRODUK:
- Deskripsi: ${productDescription || '-'}
- Keunggulan Utama (USP): ${keySellingPoints || 'Kualitas premium, praktis, hasil nyata'}
- Persona Talent: ${persona || 'Kreator UGC Natural Indonesia'}
- Voice Tone / Gaya Bicara: ${tone || 'Santai, Mengalir & Natural'} (${toneDirective})
- Platform Target: ${targetPlatform}
${painList.length > 0 ? `- Pain Point / Keluhan Audiens Utama: ${painList.join(' | ')}` : ''}
${visualBible ? `\nVISUAL CONTINUITY BIBLE (PATUHI KONSISTENSI VISUAL DI visualAction):\n- Warna/Kemasan: ${visualBible.packagingColors || '-'}\n- Label Persis: ${visualBible.exactLabelText || productName}\n- Talent: ${visualBible.talentAppearance || persona}\n- Pencahayaan/Lokasi: ${visualBible.environmentLighting || '-'}` : ''}

ATURAN MUTLAK ANTI-KLISE & ANTI-MONOTON:
1. DILARANG KERAS memakai kalimat klise "Stop scrolling!", "Jangan skip dulu!", "Tunggu dulu jangan di-scroll!", atau format berhitung "3 alasan kenapa..."!
2. Setiap hook HARUS punya gaya kalimat pembuka, sudut visual, popupText, dan efek suara yang SANGAT BERBEDA satu sama lain (jangan pakai pola kata pembuka yang mirip-mirip!).
3. Gunakan Bahasa Indonesia lisan yang natural, segar, emosional, selaras dengan persona "${persona || 'Kreator UGC'}" dan tone "${tone || 'Natural'}".
4. MANDATORI HUKUM FISIKA & REALISME VISUAL: Setiap visualAction wajib mematuhi gravitasi nyata, inersia massa, genggaman 5 jari normal tanpa clipping/tembus, dan pencahayaan konsisten dengan bayangan jatuh realistis serta sesuai foto referensi & Visual Continuity Bible.

Buatkan tepat 10 variasi mengikuti formula berikut:
${formulaListText}

Format output JSON array of objects dengan field: type, formulaGroup, hookDialog, visualAction, popupText, sfx.`;

    const config = {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING },
            formulaGroup: { type: Type.STRING },
            hookDialog: { type: Type.STRING },
            visualAction: {
              type: Type.STRING,
              description:
                'Aksi visual konkret yang mematuhi Visual Continuity Bible, hukum fisika nyata, inersia massa, kontak fisik solid tanpa clipping, 5 jari realistis, dan pencahayaan terarah konsisten.',
            },
            popupText: { type: Type.STRING },
            sfx: { type: Type.STRING },
          },
          required: ['type', 'formulaGroup', 'hookDialog', 'visualAction', 'popupText', 'sfx'],
        },
      },
    };

    const rawText = await generateWithFallback(
      prompt,
      config,
      'Anda adalah pakar UGC Viral Retention Strategist. Buat 10 variasi formula hook 3 detik yang sangat kontras, non-monoton, sesuai voice tone kreator dan Visual Continuity Bible, bebas klise "Stop scrolling" dan "3 alasan", serta mematuhi hukum fisika dunia nyata pada visualAction.',
      22000,
      allReferenceImages,
      normalizedRoles
    );
    const parsedHooks = parseSafeJson<any[]>(rawText);

    if (parsedHooks && Array.isArray(parsedHooks) && parsedHooks.length > 0) {
      return NextResponse.json({ success: true, hooks: parsedHooks });
    }

    const uspFirst = keySellingPoints ? keySellingPoints.split(/[,.;]/)[0]?.trim() : 'kualitasnya nyata banget';
    const prod = productName || 'Produk Ini';

    const fallbackPool = [
      {
        type: 'Visual Shock & Contrast',
        formulaGroup: 'Visual & Proof',
        hookDialog: pickRandom([
          `Lihat langsung bedanya sebelum sama sesudah pakai ${prod}, beneran gak perlu nunggu lama!`,
          `Coba perhatiin kontras hasilnya di detik ke-3 setelah kena ${prod} ini...`,
        ]),
        visualAction: `Kamera close-up menyorot perbandingan nyata di depan lensa saat tangan memegang kemasan asli ${prod} dengan kontak 5 jari solid dan cahaya studio hangat konsisten.`,
        popupText: pickRandom(['BANDINGIN BEDANYA DETIK INI! ⚡', 'REAL CONTRAST NO FILTER 👀']),
        sfx: pickRandom(['Snap-zoom bass hit & Sparkle magic ting', 'Camera shutter click & Sub-bass drop']),
      },
      {
        type: 'Negative Warning / Reverse Psychology',
        formulaGroup: 'Psikologi & FOMO',
        hookDialog: pickRandom([
          `Serius, jangan checkout ${prod} dulu kalau kalian belum siap ditanyain temen sekantor pakai apa!`,
          `Awas nyesel kalau beli ${prod} cuma satu—soalnya bakal langsung rebutan di rumah!`,
        ]),
        visualAction: `Kreator mencondongkan wajah dengan tatapan serius ke lensa 0.5x sambil menggenggam ${prod} dengan bobot fisik nyata di bawah cahaya jendela samping.`,
        popupText: pickRandom(['JANGAN CHECKOUT SEBELUM TAHU INI ⚠️', 'WARNING: BIKIN KETAGIHAN REPEAT ORDER 🚨']),
        sfx: pickRandom(['Record scratch freeze & Dramatic riser', 'Skeptical eyebrow pop & Bass drop']),
      },
      {
        type: 'Curiosity Gap / Rahasia Tersembunyi',
        formulaGroup: 'Psikologi & FOMO',
        hookDialog: pickRandom([
          `Baru ngeh ternyata ada satu detail kecil di ${prod} yang bikin orang selalu repeat order...`,
          `Pantesan ratingnya tembus ribuan—baru sadar rahasia kecil di balik ${prod} ini.`,
        ]),
        visualAction: `Tangan menunjuk bagian detail label/fitur pada fisik ${prod} dari sudut makro dengan bayangan jatuh tajam dan konsisten di atas meja kayu.`,
        popupText: pickRandom(['DETAIL RAHASIA YANG JARANG DISADARI 🤫', 'KENAPA ORANG REPEAT ORDER TERUS? 🤔']),
        sfx: pickRandom(['Whisper mic brush & Mystery chime', 'Soft pop & Clock tick tension']),
      },
      {
        type: 'Social Proof & Ditanyain Teman',
        formulaGroup: 'Cerita & Relatable',
        hookDialog: pickRandom([
          `Barusan pas lagi ngumpul, tiga temen langsung minta link ${prod} ini gara-gara lihat hasilnya langsung!`,
          `Gara-gara bawa ${prod} ke kantor tadi pagi, grup chat langsung rame minta di-spill linknya!`,
        ]),
        visualAction: `Kreator mengeluarkan ${prod} dari tas jinjing dengan gerakan tangan natural dan senyum antusias di depan pencahayaan ruangan hangat.`,
        popupText: pickRandom(['DITANYAIN 3 TEMEN SEKALIGUS! 💬', 'SATU KANTOR AUTO MINTA LINK 🔥']),
        sfx: pickRandom(['Bag zipper & iPhone notification ping', 'Bubble pop sound & Ding']),
      },
      {
        type: 'Relatable Micro-Pain Point',
        formulaGroup: 'Cerita & Relatable',
        hookDialog: pickRandom([
          `Capek gak sih tiap pagi harus ribet ngulang hal yang sama? Untung kemarin nemu ${prod} ini.`,
          `Yang sering panik pas mepet waktu sebelum berangkat, sumpah kalian butuh ${prod} ini di meja!`,
        ]),
        visualAction: `Kreator menghela napas lega sambil meletakkan ${prod} dengan mantap di atas meja menggunakan lima jari alami tanpa efek melayang.`,
        popupText: pickRandom(['SOLUSI ANTI-RIBET TIAP PAGI ⏰', 'PENYELAMAT SAAT WAKTU MEPET ⚡']),
        sfx: pickRandom(['Heartbeat thud & Soft pop', 'Fast whip whoosh & Finger snap click']),
      },
      {
        type: 'Myth-Busting / Plot Twist',
        formulaGroup: 'Edukasi & Twist',
        hookDialog: pickRandom([
          `Tadinya aku kira ${prod} cuma menang viral doang—ternyata pas diuji soal ${uspFirst.toLowerCase()}, malah kebalikannya!`,
          `Hampir gak jadi checkout karena ragu sama klaimnya, eh pas dicoba ${prod} malah di luar ekspektasi!`,
        ]),
        visualAction: `Tangan memutar kemasan ${prod} 45 derajat di depan latar bersih, memantulkan highlight cahaya alami tanpa distorsi label.`,
        popupText: pickRandom(['KIRAIN GIMMICK, TERNYATA... 🤯', 'PLOT TWIST SETELAH DICOBA SENDIRI 🔍']),
        sfx: pickRandom(['Vine boom & Level up victory chime', 'Record scratch & Sparkle ting']),
      },
      {
        type: 'Live Stress-Test (Tanpa Cut)',
        formulaGroup: 'Visual & Proof',
        hookDialog: pickRandom([
          `Katanya ${prod} ${uspFirst.toLowerCase()}? Oke, kita tes langsung tanpa cut di depan kamera sekarang!`,
          `Biar gak cuma kata iklan, ini uji coba real-time ${prod} satu take tanpa edit sama sekali.`,
        ]),
        visualAction: `Sudut POV over-the-shoulder menyorot tangan langsung mendemonstrasikan pemakaian ${prod} secara real-time di atas meja dengan kontak fisik solid.`,
        popupText: pickRandom(['LIVE TEST TANPA FILTER & CUT! 🔍', 'UJI KLAIM REAL-TIME DETIK INI 🧪']),
        sfx: pickRandom(['Boxing bell ring & Camera shutter click', 'Camera flash click & Crisp ASMR tap']),
      },
      {
        type: 'Smart Buyer Value Math',
        formulaGroup: 'Edukasi & Twist',
        hookDialog: pickRandom([
          `Ngapain keluar duit berkali lipat kalau ${prod} ini udah ngasih hasil setara produk jutaan?`,
          `Kalau dihitung cuma modal ribuan per hari, kualitas ${prod} ini beneran gak masuk akal hematnya!`,
        ]),
        visualAction: `Split komposisi tangan meletakkan ${prod} berdampingan dengan properti minimalis di atas meja linen dengan bayangan kontak seragam.`,
        popupText: pickRandom(['HEMAT 70% KUALITAS JUARA 💎', 'MODAL RECEH RASA HIGH-END 💸']),
        sfx: pickRandom(['Cha-ching cash register & Fast whip whoosh', 'Cashier barcode beep & Sparkle ting']),
      },
      {
        type: 'Balas Komentar Netizen ("Kak Spill!")',
        formulaGroup: 'Interaktif & Tren',
        hookDialog: pickRandom([
          `Buat yang kemarin ramai nanyain ${prod} awet atau gak di komentar, sini aku buktiin langsung!`,
          `Akhirnya ku-spill juga ${prod} yang dari kemarin ditanyain terus di DM sama kolom komentar.`,
        ]),
        visualAction: `Kreator menunjuk stiker komentar netizen di bagian atas frame lalu langsung memperlihatkan fisik ${prod} dekat ke lensa dengan kontak genggaman nyata.`,
        popupText: pickRandom(['BALAS KOMEN: "KAK SPILL DONG!" 💬', 'JAWABAN BUAT YANG KEMARIN NANYA 👇']),
        sfx: pickRandom(['Comment pop-up bloop & iPhone ping', 'Ding notification & Swoosh']),
      },
      {
        type: 'Unpopular Opinion / Hot Take',
        formulaGroup: 'Interaktif & Tren',
        hookDialog: pickRandom([
          `Opini jujur: kebanyakan barang viral cuma menang kemasan, kecuali ${prod} satu ini yang beneran kepake.`,
          `Maaf ya, menurutku gak perlu beli yang overpriced selama masih ada ${prod} sebagus ini.`,
        ]),
        visualAction: `Kreator menatap kamera dengan ekspresi jujur sedikit skeptis sambil meletakkan ${prod} secara mantap di atas meja terang.`,
        popupText: pickRandom(['OPINI JUJUR TANPA ENDORSE 🔥', 'STOP FOMO PRODUK OVERPRICED! ✋']),
        sfx: pickRandom(['Dramatic dun dun dun & Shutter', 'Heavy cinematic swoosh']),
      },
      {
        type: 'Price Shock & Dupe Alert',
        formulaGroup: 'Psikologi & FOMO',
        hookDialog: pickRandom([
          `Serius ${prod} dengan finishing serapi ini harganya semasuk akal itu?! Cek sendiri deh detailnya.`,
          `Nemu dupe paling niat tahun ini: ${prod} bikin hemat banyak tanpa nurunin kualitas sama sekali!`,
        ]),
        visualAction: `Sorotan makro mengitari tekstur dan detail kemasan ${prod} di bawah cahaya studio lembut yang mempertegas kesan premium.`,
        popupText: pickRandom(['DUPE ALERT: HEMAT BANYAK! 😱💎', 'HARGA SEGINI DAPET KUALITAS INI?! 💸']),
        sfx: pickRandom(['Anime gasp & Cha-ching cash register', 'Sparkle magic ting & Bass drop']),
      },
      {
        type: 'Catatan Progres Harian (Hari ke-1 vs ke-14)',
        formulaGroup: 'Cerita & Relatable',
        hookDialog: pickRandom([
          `Ini dokumentasi jujur pemakaian ${prod} dari hari pertama sampai minggu kedua—lihat sendiri bedanya!`,
          `Biar adil, aku rekam progres pemakaian ${prod} rutin beberapa hari berturut-turut tanpa filter.`,
        ]),
        visualAction: `Transisi cepat membandingkan tampilan hari ke-1 dengan kondisi terbaru sambil memegang ${prod} di depan cermin natural.`,
        popupText: pickRandom(['HARI KE-1 VS KE-14: REAL PROGRES 📅', 'DIARY PEMAKAIAN TANPA FILTER 📈']),
        sfx: pickRandom(['Clock tick riser & Level up chime', 'Match-cut hand slap whoosh & Ting']),
      },
    ];

    const shuffledFallback = [...fallbackPool].sort(() => Math.random() - 0.5).slice(0, 10);

    return NextResponse.json({
      success: true,
      hooks: shuffledFallback,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    return await handleGenerateHooksRequest(body);
  } catch {
    return await handleGenerateHooksRequest({});
  }
}

export async function GET(req: NextRequest) {
  try {
    const payloadParam = req.nextUrl.searchParams.get('payload');
    const body = payloadParam ? JSON.parse(payloadParam) : {};
    return await handleGenerateHooksRequest(body);
  } catch {
    return await handleGenerateHooksRequest({});
  }
}
