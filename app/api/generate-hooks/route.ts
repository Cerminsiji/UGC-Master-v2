import { NextRequest, NextResponse } from 'next/server';
import { Type } from '@google/genai';
import { generateWithFallback, parseSafeJson } from '@/lib/gemini-ugc';

async function handleGenerateHooksRequest(body: any) {
  try {
    const { productName = 'Produk', category = 'Before & After' } = body || {};

    const prompt = `Buatkan 5 variasi Hook 3 detik pertama hasil riset psikologi audiens (R&D UGC) untuk video produk "${productName}" dalam kategori "${category}".
PENTING: DILARANG KERAS menggunakan kalimat klise yang monoton seperti "Stop scrolling!" atau "Jangan skip dulu!", dan DILARANG KERAS menggunakan format listicle seperti "3 alasan kenapa...", "3 hal yang bikin...", atau menghitung angka di hook pembuka! Buat kalimat pembuka yang spesifik, emosional, segar, dan langsung relevan dengan manfaat/masalah produk "${productName}".
Berikan 5 jenis pendekatan berbeda:
1. Visual Shock (Bukti visual / perbandingan instan di detik pertama)
2. Negative Hook (Reverse psychology / peringatan anti-nyesel tanpa gimik)
3. Curiosity / Mystery Gap (Pertanyaan spesifik yang memicu rasa penasaran tinggi)
4. FOMO / Secret Reveal (Trik / detail rahasia yang jarang orang tahu)
5. Relatable Pain Point (Situasi masalah mikro sehari-hari yang sangat relate dengan audiens)

Format JSON: array of objects dengan field: type, hookDialog, visualAction, popupText, sfx.`;

    const config = {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING },
            hookDialog: { type: Type.STRING },
            visualAction: { type: Type.STRING },
            popupText: { type: Type.STRING },
            sfx: { type: Type.STRING },
          },
          required: ['type', 'hookDialog', 'visualAction', 'popupText', 'sfx'],
        },
      },
    };

    const rawText = await generateWithFallback(prompt, config);
    const parsedHooks = parseSafeJson<any[]>(rawText);

    if (parsedHooks && Array.isArray(parsedHooks) && parsedHooks.length > 0) {
      return NextResponse.json({ success: true, hooks: parsedHooks });
    }

    // Default fallback hooks
    return NextResponse.json({
      success: true,
      hooks: [
        {
          type: 'Visual Shock',
          hookDialog: 'Jangan kaget kalau dalam 3 hari perubahannya bisa se-drastis ini!',
          visualAction: `Menutup kamera dengan telapak tangan lalu transisi cepat ke hasil produk ${productName}.`,
          popupText: 'JANGAN KAGET DULU! 😱',
          sfx: 'Vine boom & Swoosh',
        },
        {
          type: 'Negative Hook',
          hookDialog: `JANGAN pernah beli ${productName} kalau kalian belum siap ketagihan sama hasilnya!`,
          visualAction: 'Kreator menggelengkan kepala dengan ekspresi serius di depan kamera.',
          popupText: `JANGAN DIBELI DULU ⚠️`,
          sfx: 'Record scratch & Warning buzzer',
        },
        {
          type: 'Curiosity / Question',
          hookDialog: `Pernah gak sih kalian mikir, kenapa produk ini bisa selalu sold out dalam hitungan menit?`,
          visualAction: `Memperlihatkan box kemasan ${productName} yang baru dibuka dari paket.`,
          popupText: `KENAPA BISA VIRAL BANGET? 🤔`,
          sfx: 'Ding question chime',
        },
        {
          type: 'Secret / FOMO',
          hookDialog: `Ini rahasia yang gak pernah dibocorin sama brand besar tapi beneran ampuh!`,
          visualAction: 'Mendekat ke mikrofon dengan gesture berbisik rahasia.',
          popupText: `RAHASIA GAK BOLEH BOCOR 🤫`,
          sfx: 'Whisper ASMR & Mystery chime',
        },
        {
          type: 'Relatable Pain Point',
          hookDialog: 'Capek gak sih buang-buang uang buat nyobain yang gak ada hasilnya?',
          visualAction: 'Memegang kepala dengan ekspresi lelah dan frustrasi menatap dompet/cermin.',
          popupText: 'CAPEK GAGAL MULU?! 😫',
          sfx: 'Heartbeat & Dramatic bass',
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

