import { NextRequest, NextResponse } from 'next/server';
import { Type } from '@google/genai';
import { generateWithFallback, parseSafeJson } from '@/lib/gemini-ugc';

async function handleGenerateHooksRequest(body: any) {
  try {
    const { productName = 'Produk', category = 'Before & After' } = body || {};

    const prompt = `Buatkan 5 variasi Hook 3 detik pertama hasil riset psikologi audiens (R&D UGC) untuk video produk "${productName}" dalam kategori "${category}".
PENTING: DILARANG KERAS menggunakan kalimat klise yang monoton seperti "Stop scrolling!" atau "Jangan skip dulu!", dan DILARANG KERAS menggunakan format listicle seperti "3 alasan kenapa...", "3 hal yang bikin...", atau menghitung angka di hook pembuka! Buat kalimat pembuka yang spesifik, emosional, segar, dan langsung relevan dengan manfaat/masalah produk "${productName}".

MANDATORI HUKUM FISIKA & REALISME VISUAL (ANTI-AI DETECTION):
Setiap 'visualAction' WAJIB mematuhi hukum fisika nyata, biomekanik gerak alami, dan pencahayaan konsisten:
1. Hukum Fisika Nyata: Gravitasi alami, inersia massa produk saat digerakkan, interaksi benda padat tanpa tembus/clipping, genggaman 5 jari tangan yang proporsional dan realistis, viskositas cairan alami jika ada cairan.
2. Biomekanik Gerakan Realistis: Akselerasi & deselerasi alami tubuh manusia, ketiadaan morphing/glitch tekstur, gerakan kamera handheld dengan micro-inertia nyata.
3. Pencahayaan & Bayangan Konsisten: Satu sumber cahaya utama yang terarah konsisten, bayangan jatuh (cast shadow) yang presisi sesuai posisi lampu/jendela, dan pantulan specular yang natural.

Berikan 5 jenis pendekatan berbeda:
1. Visual Shock (Bukti visual / perbandingan instan di detik pertama)
2. Negative Hook (Reverse psychology / peringatan anti-nyesel tanpa gimik)
3. Curiosity / Mystery Gap (Pertanyaan spesifik yang memicu rasa penasaran tinggi)
4. FOMO / Secret Reveal (Trik / detail rahasia yang jarang orang tahu)
5. Relatable Pain Point (Situasi masalah mikro sehari-hari yang sangat relate dengan audiens)

Format JSON: array of objects dengan field: type, hookDialog, visualAction, popupText, sfx.`;

    const config = {
      responseMimeType: 'application/json',
      systemInstruction:
        'Anda adalah pakar UGC Creative Strategist. Seluruh skenario aksi visual (visualAction) WAJIB mematuhi hukum fisika dunia nyata (gravitasi, bobot, kontak solid tanpa clipping, 5 jari realistis), gerakan biomekanik alami tanpa morphing, dan pencahayaan konsisten dengan bayangan jatuh nyata.',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING },
            hookDialog: { type: Type.STRING },
            visualAction: {
              type: Type.STRING,
              description:
                'Aksi visual konkret yang mematuhi hukum fisika nyata, bobot inersia, kontak fisik solid tanpa tembus/clipping, anatomi tangan 5 jari, dan pencahayaan terarah dengan bayangan jatuh konsisten.',
            },
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

    // Default fallback hooks with authentic physics & consistent lighting
    return NextResponse.json({
      success: true,
      hooks: [
        {
          type: 'Visual Shock',
          hookDialog: 'Jangan kaget kalau dalam 3 hari perubahannya bisa se-drastis ini!',
          visualAction: `Tangan dengan 5 jari alami mengangkat kemasan asli ${productName} secara bertahap melawan gravitasi di bawah pencahayaan directional hangat dengan bayangan jatuh presisi di atas meja.`,
          popupText: 'JANGAN KAGET DULU! 😱',
          sfx: 'Vine boom & Swoosh',
        },
        {
          type: 'Negative Hook',
          hookDialog: `JANGAN pernah beli ${productName} kalau kalian belum siap ketagihan sama hasilnya!`,
          visualAction: `Kreator menggelengkan kepala dengan deselerasi kepala alami, memegang kemasan ${productName} dengan kontak genggaman jari solid tanpa clipping di bawah cahaya studio lembut.`,
          popupText: `JANGAN DIBELI DULU ⚠️`,
          sfx: 'Record scratch & Warning buzzer',
        },
        {
          type: 'Curiosity / Question',
          hookDialog: `Pernah gak sih kalian mikir, kenapa produk ini bisa selalu sold out dalam hitungan menit?`,
          visualAction: `Tangan meletakkan box kemasan ${productName} di atas meja kayu dengan sentuhan fisik nyata dan inersia natural, bayangan lembut jatuh konsisten ke kanan bawah.`,
          popupText: `KENAPA BISA VIRAL BANGET? 🤔`,
          sfx: 'Ding question chime',
        },
        {
          type: 'Secret / FOMO',
          hookDialog: `Ini rahasia yang gak pernah dibocorin sama brand besar tapi beneran ampuh!`,
          visualAction: `Kreator mendekat ke mikrofon dengan micro-movement wajar, memegang produk ${productName} sejajar dada dengan pantulan cahaya specular alami pada kemasan.`,
          popupText: `RAHASIA GAK BOLEH BOCOR 🤫`,
          sfx: 'Whisper ASMR & Mystery chime',
        },
        {
          type: 'Relatable Pain Point',
          hookDialog: 'Capek gak sih buang-buang uang buat nyobain yang gak ada hasilnya?',
          visualAction: `Kreator menatap cermin dengan ekspresi lelah realistis, tangan merogoh meja mengambil ${productName} dengan interaksi fisik solid dan pencahayaan kamar natural.`,
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

