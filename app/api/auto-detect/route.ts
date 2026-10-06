import { NextRequest, NextResponse } from 'next/server';
import { Type } from '@google/genai';
import {
  generateWithFallback,
  parseSafeJson,
  heuristicAutoDetect,
} from '@/lib/gemini-ugc';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let { url = '', notes = '', input = '' } = body;

    // Support single unified input string containing both link & notes
    if (input && typeof input === 'string') {
      const urlMatches = input.match(/(https?:\/\/[^\s]+)/gi);
      if (urlMatches && urlMatches.length > 0) {
        url = urlMatches[0];
        notes = input.replace(urlMatches[0], '').trim();
      } else {
        notes = input.trim();
      }
    }

    const rawInputCombined = (input || `${url} ${notes}`).trim();

    if (!rawInputCombined) {
      return NextResponse.json(
        { error: 'Masukkan link produk atau keterangan produk terlebih dahulu' },
        { status: 400 }
      );
    }

    const prompt = `Kamu adalah AI UGC Product & Link Analyzer profesional untuk platform TikTok Shop, Shopee Video, Instagram Reels, Tokopedia, dan YouTube Shorts.
Analisis input gabungan link produk dan/atau keterangan berikut, lalu lakukan ekstraksi otomatis secara cerdas dan mendalam:

Input Pengguna (Link & Keterangan): "${rawInputCombined}"
${url ? `Terdeteksi URL: "${url}"` : ''}
${notes ? `Terdeteksi Keterangan: "${notes}"` : ''}

Daftar 12 Kategori UGC yang WAJIB dipilih salah satu yang paling cocok:
- "Affiliate"
- "Unboxing"
- "Tutorial"
- "Review"
- "Komedi / Sketsa"
- "Daily Vlog"
- "GRWM"
- "Problem & Solution"
- "Before & After"
- "Life Hacks"
- "ASMR / Satisfying"
- "Haul"

Tugas Anda:
1. productName: Nama produk yang bersih, spesifik, dan siap pakai (contoh: "Somethinc Niacinamide Barrier Serum", "Sago Green Coffee Slimming", "Keychron K2 Wireless Mechanical Keyboard").
2. category: Pilih 1 dari 12 kategori di atas yang paling tepat untuk mempromosikan produk ini.
3. productDescription: Deskripsi produk yang menarik, menjelaskan manfaat utama dan cara kerjanya secara ringkas.
4. targetAudience: Target audiens spesifik (misal: "Wanita 20-35 tahun pekerja kantor yang ingin kulit cerah tanpa breakout").
5. keySellingPoints: Poin keunggulan utama (USP) yang persuasif dan memicu checkout di keranjang kuning.
6. tone: Nada bicara yang paling pas (pilih salah satu: "Santai, Relatable & Meyakinkan", "Hype, Heboh & Excited", "Edukatif, Tenang & Elegan", "Drama Komedi & Sketsa Lucu", atau "ASMR Bisik & Estetik").
7. targetPlatform: Platform yang cocok ("TikTok Shop", "Shopee Video", "Instagram Reels", "YouTube Shorts").
8. targetDuration: Rekomendasi durasi (integer: 10, 15, 30, 45, atau 60 detik).
9. detectedTags: Array 3-5 kata kunci relevan (misal: ["skincare", "niacinamide", "pencerah", "anti-acne"]).
10. detectionSummary: Penjelasan ringkas ramah 1 kalimat tentang apa yang berhasil dideteksi.
11. persona: Pilih persona talent yang paling ideal dari daftar 24 persona: "Kreator Faceless / Hanya Tangan (Tanpa Muka)", "Wanita Muda / Gen Z", "Hijaber Trendy / Muslimah Modern", "Ibu Muda / Mama Hemat Cerdas", "Wanita Karir / Corporate Office", "Beauty & Skincare Junkie", "Ibu Hamil & Menyusui (Busui)", "Fashion Stylist / OOTD Enthusiast", "Gadis Desa / Hidup Asri & Alami", "Pria Dewasa / Bapak Relatable", "Pria Muda / Gen Z Bro", "Pria Grooming & Maskulin", "Cowok Gym & Fitness Bro", "Otomotif & Bikers / Car Enthusiast", "Dokter / Tenaga Medis / Ahli Edukasi", "Mahasiswa Hemat / Anak Kosan", "Tech & Gadget Enthusiast", "Gamer & Streamer", "UMKM / Owner Brand & Pejuang Usaha", "Foodie & Kuliner / Home Chef", "Traveler / Backpacker & Petualang", "Pet Parent / Pecinta Hewan", "Minimalis & Eco-Friendly Lifestyle", atau "Semua (Netral Universal)". (Jika konteksnya unboxing meja, swatch tekstur tangan, atau kreator faceless tanpa muka, WAJIB pilih "Kreator Faceless / Hanya Tangan (Tanpa Muka)").
12. cameraAngleStyle: Rekomendasi gaya sudut kamera yang paling cocok (pilih: "Hands-Only / Hanya Tangan (Faceless UGC)", "Dinamis & Multi-Angle (Viral Fast-Cut)", "POV & Handheld Dominan (Teman Curhat)", "Macro & Extreme Close-up Detail (Tekstur & Formula)", "Flat Lay & Top-Down (Unboxing Meja Estetik)", "Front Camera / Selfie Talk (Vlog Santai)", "Cinematic Commercial & 360° Orbit (Iklan Mewah)", "Low-Angle & Dynamic Hero Shot (Keren & Berwibawa)", "Dutch Angle & Shock Dramatis (Hook Heboh)", atau "Mirror Reflection Shot & GRWM (Get Ready With Me)"). (Jika pengguna meminta hanya tangan atau unboxing meja estetik tanpa wajah, pilih "Hands-Only / Hanya Tangan (Faceless UGC)").
13. preferredCameraAngles: Array 3-5 sudut kamera spesifik yang paling disarankan dari daftar (misal: ["POV / Handheld (First-Person)", "Extreme Close-up / Macro (Tekstur & Detail)", "Front Camera / Selfie Mode (Curhat Langsung)"]).`;

    const config = {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          productName: { type: Type.STRING },
          category: { type: Type.STRING },
          productDescription: { type: Type.STRING },
          targetAudience: { type: Type.STRING },
          keySellingPoints: { type: Type.STRING },
          persona: { type: Type.STRING },
          tone: { type: Type.STRING },
          cameraAngleStyle: { type: Type.STRING },
          preferredCameraAngles: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          targetPlatform: { type: Type.STRING },
          targetDuration: { type: Type.INTEGER },
          detectedTags: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          detectionSummary: { type: Type.STRING },
        },
        required: [
          'productName',
          'category',
          'productDescription',
          'targetAudience',
          'keySellingPoints',
          'tone',
          'targetPlatform',
          'targetDuration',
        ],
      },
    };

    const rawText = await generateWithFallback(
      prompt,
      config,
      'You are a professional UGC Ecommerce strategist in Southeast Asia and TikTok Shop. Return pure JSON with accurate product extraction.',
      20000
    );

    const parsed = parseSafeJson<any>(rawText);
    if (parsed && parsed.productName) {
      return NextResponse.json({
        success: true,
        data: parsed,
        source: 'gemini',
      });
    }

    // Heuristic Offline Auto-Detector Fallback
    const heuristicData = heuristicAutoDetect(rawInputCombined, url, notes);

    return NextResponse.json({
      success: true,
      data: heuristicData,
      source: 'smart-heuristic',
    });
  } catch (error: any) {
    console.error('Server error in auto-detect:', error);
    return NextResponse.json({ error: error.message || 'Gagal mendeteksi link produk' }, { status: 500 });
  }
}
