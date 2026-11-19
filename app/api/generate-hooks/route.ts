import { NextRequest, NextResponse } from 'next/server';
import { Type } from '@google/genai';
import { generateWithFallback, parseSafeJson } from '@/lib/gemini-ugc';

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
];

async function handleGenerateHooksRequest(body: any) {
  try {
    const {
      productName = 'Produk',
      category = 'Before & After',
      productDescription = '',
      keySellingPoints = '',
      persona = '',
      targetPlatform = 'TikTok Shop',
    } = body || {};

    const formulaListText = HOOK_FORMULA_BLUEPRINTS.map(
      (f, idx) => `${idx + 1}. type: "${f.type}" | formulaGroup: "${f.formulaGroup}" — ${f.directive}`
    ).join('\n');

    const prompt = `Buatkan 8 variasi Hook 3 detik pertama (A/B/C Testing Viral Formula) untuk produk "${productName}" dalam kategori "${category}".
KONTEKS PRODUK:
- Deskripsi: ${productDescription || '-'}
- Keunggulan Utama (USP): ${keySellingPoints || 'Kualitas premium, praktis, hasil nyata'}
- Persona Talent: ${persona || 'Kreator UGC Natural Indonesia'}
- Platform Target: ${targetPlatform}

ATURAN MUTLAK ANTI-KLISE & ANTI-MONOTON:
1. DILARANG KERAS memakai kalimat klise "Stop scrolling!", "Jangan skip dulu!", "Tunggu dulu jangan di-scroll!", atau format berhitung "3 alasan kenapa..."!
2. Setiap hook HARUS punya gaya kalimat pembuka, sudut visual, popupText, dan efek suara yang SANGAT BERBEDA satu sama lain (jangan pakai pola kata yang mirip-mirip!).
3. Gunakan Bahasa Indonesia lisan yang natural, segar, emosional, dan relevan dengan persona "${persona || 'Kreator UGC'}".
4. MANDATORI HUKUM FISIKA & REALISME VISUAL: Setiap visualAction wajib mematuhi gravitasi nyata, inersia massa, genggaman 5 jari normal tanpa clipping/tembus, dan pencahayaan konsisten dengan bayangan jatuh realistis.

Buatkan tepat 8 variasi mengikuti formula berikut:
${formulaListText}

Format output JSON array of objects dengan field: type, formulaGroup, hookDialog, visualAction, popupText, sfx.`;

    const config = {
      responseMimeType: 'application/json',
      systemInstruction:
        'Anda adalah pakar UGC Viral Retention Strategist. Buat 8 variasi formula hook 3 detik yang sangat kontras, non-monoton, bebas klise "Stop scrolling" dan "3 alasan", serta mematuhi hukum fisika dunia nyata pada visualAction.',
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
                'Aksi visual konkret yang mematuhi hukum fisika nyata, inersia massa, kontak fisik solid tanpa clipping, 5 jari realistis, dan pencahayaan terarah konsisten.',
            },
            popupText: { type: Type.STRING },
            sfx: { type: Type.STRING },
          },
          required: ['type', 'formulaGroup', 'hookDialog', 'visualAction', 'popupText', 'sfx'],
        },
      },
    };

    const rawText = await generateWithFallback(prompt, config);
    const parsedHooks = parseSafeJson<any[]>(rawText);

    if (parsedHooks && Array.isArray(parsedHooks) && parsedHooks.length > 0) {
      return NextResponse.json({ success: true, hooks: parsedHooks });
    }

    const uspFirst = keySellingPoints ? keySellingPoints.split(/[,.;]/)[0]?.trim() : 'kualitasnya nyata banget';
    const prod = productName || 'Produk Ini';

    // Diverse 8-formula fallback hooks (shuffled lightly or distinct per formulaGroup)
    return NextResponse.json({
      success: true,
      hooks: [
        {
          type: 'Visual Shock & Contrast',
          formulaGroup: 'Visual & Proof',
          hookDialog: `Lihat langsung bedanya sebelum sama sesudah pakai ${prod}, beneran gak perlu nunggu lama!`,
          visualAction: `Kamera close-up menyorot perbandingan nyata di depan lensa saat tangan memegang kemasan asli ${prod} dengan kontak 5 jari solid dan cahaya studio hangat konsisten.`,
          popupText: 'BANDINGIN BEDANYA DETIK INI! ⚡',
          sfx: 'Snap-zoom bass hit & Sparkle magic ting',
        },
        {
          type: 'Negative Warning / Reverse Psychology',
          formulaGroup: 'Psikologi & FOMO',
          hookDialog: `Serius, jangan checkout ${prod} dulu kalau kalian belum siap ditanyain temen sekantor pakai apa!`,
          visualAction: `Kreator mencondongkan wajah dengan tatapan serius ke lensa 0.5x sambil menggenggam ${prod} dengan bobot fisik nyata di bawah cahaya jendela samping.`,
          popupText: 'JANGAN CHECKOUT SEBELUM TAHU INI ⚠️',
          sfx: 'Record scratch freeze & Dramatic riser',
        },
        {
          type: 'Curiosity Gap / Rahasia Tersembunyi',
          formulaGroup: 'Psikologi & FOMO',
          hookDialog: `Baru ngeh ternyata ada satu detail kecil di ${prod} yang bikin orang selalu repeat order...`,
          visualAction: `Tangan menunjuk bagian detail label/fitur pada fisik ${prod} dari sudut makro dengan bayangan jatuh tajam dan konsisten di atas meja kayu.`,
          popupText: 'DETAIL RAHASIA YANG JARANG DISADARI 🤫',
          sfx: 'Whisper mic brush & Mystery chime',
        },
        {
          type: 'Social Proof & Ditanyain Teman',
          formulaGroup: 'Cerita & Relatable',
          hookDialog: `Barusan pas lagi ngumpul, tiga temen langsung minta link ${prod} ini gara-gara lihat hasilnya langsung!`,
          visualAction: `Kreator mengeluarkan ${prod} dari tas jinjing dengan gerakan tangan natural dan senyum antusias di depan pencahayaan ruangan hangat.`,
          popupText: 'DITANYAIN 3 TEMEN SEKALIGUS! 💬',
          sfx: 'Bag zipper & iPhone notification ping',
        },
        {
          type: 'Relatable Micro-Pain Point',
          formulaGroup: 'Cerita & Relatable',
          hookDialog: `Capek gak sih tiap pagi harus ribet ngulang hal yang sama? Untung kemarin nemu ${prod} ini.`,
          visualAction: `Kreator menghela napas lega sambil meletakkan ${prod} dengan mantap di atas meja menggunakan lima jari alami tanpa efek melayang.`,
          popupText: 'SOLUSI ANTI-RIBET TIAP PAGI ⏰',
          sfx: 'Heartbeat thud & Soft pop',
        },
        {
          type: 'Myth-Busting / Plot Twist',
          formulaGroup: 'Edukasi & Twist',
          hookDialog: `Tadinya aku kira ${prod} cuma menang viral doang—ternyata pas diuji soal ${uspFirst.toLowerCase()}, malah kebalikannya!`,
          visualAction: `Tangan memutar kemasan ${prod} 45 derajat di depan latar bersih, memantulkan highlight cahaya alami tanpa distorsi label.`,
          popupText: 'KIRAIN GIMMICK, TERNYATA... 🤯',
          sfx: 'Vine boom & Level up victory chime',
        },
        {
          type: 'Live Stress-Test (Tanpa Cut)',
          formulaGroup: 'Visual & Proof',
          hookDialog: `Katanya ${prod} ${uspFirst.toLowerCase()}? Oke, kita tes langsung tanpa cut di depan kamera sekarang!`,
          visualAction: `Sudut POV over-the-shoulder menyorot tangan langsung mendemonstrasikan pemakaian ${prod} secara real-time di atas meja dengan kontak fisik solid.`,
          popupText: 'LIVE TEST TANPA FILTER & CUT! 🔍',
          sfx: 'Boxing bell ring & Camera shutter click',
        },
        {
          type: 'Smart Buyer Value Math',
          formulaGroup: 'Edukasi & Twist',
          hookDialog: `Ngapain keluar duit berkali lipat kalau ${prod} ini udah ngasih hasil setara produk jutaan?`,
          visualAction: `Split komposisi tangan meletakkan ${prod} berdampingan dengan properti minimalis di atas meja linen dengan bayangan kontak seragam.`,
          popupText: 'HEMAT 70% KUALITAS JUARA 💎',
          sfx: 'Cha-ching cash register & Fast whip whoosh',
        },
      ],
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
