import { NextRequest, NextResponse } from 'next/server';
import { Type } from '@google/genai';
import {
  generateWithFallback,
  parseSafeJson,
  heuristicAutoDetect,
} from '@/lib/gemini-ugc';
import { extractProductFromLink, extractUrlFromInput } from '@/lib/link-extractor';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let { url = '', notes = '', input = '' } = body;

    // Support unified input or bare shortlinks (e.g. vt.tiktok.com/..., tokopedia.link/...)
    const foundUrl = extractUrlFromInput(input || url);
    if (foundUrl) {
      url = foundUrl;
      notes = input ? input.replace(foundUrl, '').replace(/https?:\/\/\S+/gi, '').trim() : notes;
    } else if (input && typeof input === 'string') {
      notes = input.trim();
    }

    const rawInputCombined = (input || `${url} ${notes}`).trim();

    if (!rawInputCombined && !url) {
      return NextResponse.json(
        { error: 'Masukkan link produk atau keterangan produk terlebih dahulu' },
        { status: 400 }
      );
    }

    // 1. REAL LIVE LINK EXTRACTION: Follow redirects (shortlinks), TikTok oEmbed, OpenGraph & JSON-LD
    let linkData: any = null;
    let linkContext = '';

    if (url) {
      try {
        linkData = await extractProductFromLink(rawInputCombined || url, 7500);
        if (linkData && (linkData.success || linkData.productName || linkData.title)) {
          linkContext = `
HASIL FETCH & EKSTRAKSI LANGSUNG DARI LINK PLATFORM (${linkData.platform}):
- URL Sumber: ${linkData.originalUrl}
- URL Final (Resolved Redirect): ${linkData.finalUrl}
- Nama Produk Hasil Scraping: "${linkData.productName || linkData.ogTitle || linkData.title || '-'}"
${linkData.brand ? `- Brand / Toko Resmi: "${linkData.brand}"` : ''}
${linkData.price ? `- Harga: ${linkData.currency || 'Rp'} ${linkData.price}` : ''}
${linkData.ogDescription || linkData.metaDescription ? `- Deskripsi/Snippet Halaman: "${linkData.ogDescription || linkData.metaDescription}"` : ''}
${linkData.cleanedSummary ? `- Ringkasan Terstruktur:\n${linkData.cleanedSummary}` : ''}

INSTRUKSI PENTING:
Gunakan hasil ekstraksi link di atas sebagai fakta utama produk. Bersihkan kata-kata sampah marketplace seperti "Jual", "Beli", "Promo", "Termurah", "Original 100%", "Bebas Ongkir", "COD", dsb. Ambil nama produk dan brand aslinya secara presisi!`;
        }
      } catch (scrapeErr) {
        console.warn('Scraping error (continuing with input text):', scrapeErr);
      }
    }

    const prompt = `Kamu adalah AI UGC Product & Link Analyzer profesional untuk platform TikTok Shop, Tokopedia, Shopee Video, Instagram Reels, dan YouTube Shorts.
Analisis input gabungan link produk dan/atau keterangan berikut, lalu lakukan ekstraksi data produk secara cerdas, akurat, dan mendalam:

Input Pengguna: "${rawInputCombined}"
${url ? `Terdeteksi URL: "${url}"` : ''}
${notes ? `Terdeteksi Keterangan Tambahan: "${notes}"` : ''}
${linkContext}

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
1. productName: Nama produk yang bersih, spesifik, dan siap pakai (contoh: "Somethinc Niacinamide Barrier Serum", "Sago Green Coffee Slimming", "Keychron K2 Wireless Keyboard").
2. brandName: Brand atau nama merk resmi jika terdeteksi (contoh: "Somethinc", "Erigo", "Skintific").
3. category: Pilih 1 dari 12 kategori di atas yang paling tepat untuk mempromosikan produk ini.
4. productDescription: Deskripsi produk yang menarik, menjelaskan manfaat utama dan cara kerjanya secara ringkas.
5. targetAudience: Target audiens spesifik (misal: "Wanita 20-35 tahun pekerja kantor yang ingin kulit cerah tanpa breakout").
6. keySellingPoints: Poin keunggulan utama (USP) yang persuasif dan memicu checkout di keranjang kuning.
7. tone: Nada bicara yang paling pas (pilih salah satu: "Santai, Relatable & Meyakinkan", "Hype, Heboh & Excited", "Edukatif, Tenang & Elegan", "Drama Komedi & Sketsa Lucu", atau "ASMR Bisik & Estetik").
8. targetPlatform: Platform yang cocok ("TikTok Shop", "Tokopedia", "Shopee Video", "Instagram Reels", "YouTube Shorts").
9. targetDuration: Rekomendasi durasi (integer: 10, 15, 30, 45, atau 60 detik).
10. detectedTags: Array 3-5 kata kunci relevan (misal: ["skincare", "niacinamide", "pencerah", "anti-acne"]).
11. detectionSummary: Penjelasan ringkas ramah 1 kalimat tentang apa yang berhasil dideteksi dari link ini.
12. persona: Pilih persona talent yang paling ideal dari daftar 24 persona: "Kreator Faceless / Hanya Tangan (Tanpa Muka)", "Wanita Muda / Gen Z", "Hijaber Trendy / Muslimah Modern", "Ibu Muda / Mama Hemat Cerdas", "Wanita Karir / Corporate Office", "Beauty & Skincare Junkie", "Ibu Hamil & Menyusui (Busui)", "Fashion Stylist / OOTD Enthusiast", "Gadis Desa / Hidup Asri & Alami", "Pria Dewasa / Bapak Relatable", "Pria Muda / Gen Z Bro", "Pria Grooming & Maskulin", "Cowok Gym & Fitness Bro", "Otomotif & Bikers / Car Enthusiast", "Dokter / Tenaga Medis / Ahli Edukasi", "Mahasiswa Hemat / Anak Kosan", "Tech & Gadget Enthusiast", "Gamer & Streamer", "UMKM / Owner Brand & Pejuang Usaha", "Foodie & Kuliner / Home Chef", "Traveler / Backpacker & Petualang", "Pet Parent / Pecinta Hewan", "Minimalis & Eco-Friendly Lifestyle", atau "Semua (Netral Universal)".
13. cameraAngleStyle: Rekomendasi gaya sudut kamera yang paling cocok (pilih: "Hands-Only / Hanya Tangan (Faceless UGC)", "Dinamis & Multi-Angle (Viral Fast-Cut)", "POV & Handheld Dominan (Teman Curhat)", "Macro & Extreme Close-up Detail (Tekstur & Formula)", "Flat Lay & Top-Down (Unboxing Meja Estetik)", "Front Camera / Selfie Talk (Vlog Santai)", "Cinematic Commercial & 360° Orbit (Iklan Mewah)", "Low-Angle & Dynamic Hero Shot (Keren & Berwibawa)", "Dutch Angle & Shock Dramatis (Hook Heboh)", atau "Mirror Reflection Shot & GRWM (Get Ready With Me)").
14. preferredCameraAngles: Array 3-5 sudut kamera spesifik yang paling disarankan dari daftar (misal: ["POV / Handheld (First-Person)", "Extreme Close-up / Macro (Tekstur & Detail)", "Front Camera / Selfie Mode (Curhat Langsung)"]).`;

    const config = {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          productName: { type: Type.STRING },
          brandName: { type: Type.STRING },
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
      'You are a professional UGC Ecommerce strategist in Southeast Asia. Return pure JSON with accurate product extraction from Indonesian eCommerce and TikTok links.',
      20000
    );

    const parsed = parseSafeJson<any>(rawText);
    if (parsed && parsed.productName) {
      // If linkData gave a specific product name and Gemini returned a fallback placeholder, merge them
      if (linkData?.productName && (!parsed.productName || parsed.productName.toLowerCase().includes('produk unggulan'))) {
        parsed.productName = linkData.productName;
      }
      if (linkData?.brand && !parsed.brandName) {
        parsed.brandName = linkData.brand;
      }
      if (linkData?.finalUrl) {
        parsed.productUrl = linkData.finalUrl;
      }
      if (linkData?.ogImage) {
        parsed.imageUrl = linkData.ogImage;
      }
      if (linkData?.price) {
        parsed.price = `${linkData.currency || 'Rp'} ${linkData.price}`;
      }
      if (linkData?.platform) {
        parsed.platform = linkData.platform;
      }

      return NextResponse.json({
        success: true,
        data: parsed,
        linkData: linkData || null,
        source: 'gemini',
      });
    }

    // Heuristic Offline Auto-Detector Fallback
    const heuristicData = heuristicAutoDetect(rawInputCombined, url, notes, linkData);
    if (linkData?.ogImage) {
      (heuristicData as any).imageUrl = linkData.ogImage;
    }
    if (linkData?.price) {
      (heuristicData as any).price = `${linkData.currency || 'Rp'} ${linkData.price}`;
    }
    if (linkData?.platform) {
      (heuristicData as any).platform = linkData.platform;
    }

    return NextResponse.json({
      success: true,
      data: heuristicData,
      linkData: linkData || null,
      source: 'smart-heuristic',
    });
  } catch (error: any) {
    console.error('Server error in auto-detect:', error);
    return NextResponse.json({ error: error.message || 'Gagal mendeteksi link produk' }, { status: 500 });
  }
}
