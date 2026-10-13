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

    const prompt = `Kamu adalah AI UGC Product & Link Analyzer profesional dengan tingkat akurasi tinggi untuk platform TikTok Shop, Tokopedia, Shopee Video, Instagram Reels, dan YouTube Shorts.
Analisis input link produk dan/atau keterangan berikut, lalu lakukan ekstraksi data produk secara spesifik, akurat, dan mendalam:

Input Pengguna: "${rawInputCombined}"
${url ? `Terdeteksi URL: "${url}"` : ''}
${notes ? `Terdeteksi Keterangan Tambahan: "${notes}"` : ''}
${linkContext}

ATURAN UTAMA:
1. DILARANG KERAS menghasilkan nama generik seperti "Produk Unggulan Pilihan", "Produk Pilihan", atau "Produk Ini" jika input atau URL memuat indikasi nama barang (contoh: Sago, Coffee, Diet, Somethinc, Skintific, Serum, Ceramide, Keyboard, dsb).
2. Jika ada nama brand resmi (misal: Sago, Somethinc, Skintific, Erigo, Aerostreet, Baseus, Wardah, Kahf), cantumkan brand di "brandName" dan nama produk lengkap di "productName".
3. Bersihkan kata-kata sampah marketplace seperti "Jual", "Beli", "Termurah", "Original 100%", "Bebas Ongkir", "COD", "Ready Stock".

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

Daftar 24 Persona Talent Kreator yang WAJIB dipilih 1 yang paling otentik:
1. "Wanita Muda / Gen Z" (Mahasiswi/remaja aktif, bahasa gaul santai, vibes FYP)
2. "Hijaber Trendy / Muslimah Modern" (Anggun, sopan, modis, islami modern halal)
3. "Ibu Muda / Mama Hemat Cerdas" (Fokus kepraktisan keluarga, hemat budget, ramah solutif)
4. "Wanita Karir / Corporate Office" (Profesional, waktu padat, butuh serba cepat & efisien)
5. "Beauty & Skincare Junkie" (Obsesif tekstur, kandungan aktif, hasil kulit glowing)
6. "Ibu Hamil & Menyusui (Busui)" (Relatable bagi bumil/busui, keamanan bahan & kenyamanan)
7. "Fashion Stylist / OOTD Enthusiast" (Pencinta mix and match outfit, trendi kekinian)
8. "Gadis Desa / Hidup Asri & Alami" (Sederhana, hangat, natural, suasana tenang dan asri)
9. "Pria Dewasa / Bapak Relatable" (Santai, humor bapak-bapak, fokus fungsi nyata & tahan lama)
10. "Pria Muda / Gen Z Bro" (Nongkrong, streetwear, santai blak-blakan)
11. "Pria Grooming & Maskulin" (Peduli penampilan, rapi, wangi, maskulin modern)
12. "Cowok Gym & Fitness Bro" (Disiplin olahraga, nutrisi otot, badan bugar)
13. "Otomotif & Bikers / Car Enthusiast" (Penggemar motor/mobil, detail part & perawatan kendaraan)
14. "Dokter / Tenaga Medis / Ahli Edukasi" (Penjelasan ilmiah terpercaya, berbasis fakta tanpa overclaim)
15. "Mahasiswa Hemat / Anak Kosan" (Solusi murah meriah, serbaguna, ramah kantong akhir bulan)
16. "Tech & Gadget Enthusiast" (Spesifikasi tajam, performa perangkat, build quality)
17. "Gamer & Streamer" (Sensasi seru gaming, no-delay, setup RGB)
18. "UMKM / Owner Brand & Pejuang Usaha" (Inspiratif, cerita di balik layar, ulet pantang menyerah)
19. "Foodie & Kuliner / Home Chef" (Pecinta rasa gurih pedas, ASMR mengunyah, resep praktis)
20. "Traveler / Backpacker & Petualang" (Ringkas, tahan banting, perlengkapan outdoor & liburan)
21. "Pet Parent / Pecinta Hewan" (Penyayang anabul kucing/anjing, kenyamanan peliharaan)
22. "Minimalis & Eco-Friendly Lifestyle" (Zero waste, ramah lingkungan, hidup simpel tertata)
23. "Kreator Faceless / Hanya Tangan (Tanpa Muka)" (100% tanpa wajah, fokus interaksi tangan dan produk)
24. "Semua (Netral Universal)" (Gaya umum netral fleksibel)

Daftar 10 Gaya Sudut Kamera Storyboard (Camera Angle Style) yang WAJIB dipilih 1 yang paling pas:
1. "Dinamis & Multi-Angle (Viral Fast-Cut)" (Kombinasi cepat hook POV, close-up, OTS, selfie)
2. "Hands-Only / Hanya Tangan (Faceless UGC)" (Kamera 100% menyorot tangan & produk, tanpa menampakkan muka)
3. "POV & Handheld Dominan (Teman Curhat)" (First-person pemegang produk, hangat seperti ngobrol)
4. "Macro & Extreme Close-up Detail (Tekstur & Formula)" (Tekstur, packaging mewah, butiran/tetesan, swatch)
5. "Flat Lay & Top-Down (Unboxing Meja Estetik)" (Kamera atas meja rapi estetik, paket dibuka bertahap)
6. "Front Camera / Selfie Talk (Vlog Santai)" (Kamera depan HP vertikal menatap penonton langsung)
7. "Cinematic Commercial & 360° Orbit (Iklan Mewah)" (Gerakan tracking, putaran 360°, lighting premium)
8. "Low-Angle & Dynamic Hero Shot (Keren & Berwibawa)" (Kamera bawah mendongak, produk terlihat gagah)
9. "Mirror Reflection Shot & GRWM (Get Ready With Me)" (Pantulan cermin aesthetic memperlihatkan rutinitas)
10. "Dutch Angle & Shock Dramatis (Hook Heboh)" (Sudut kamera miring sengaja untuk efek kehebohan visual)

Tugas Anda:
1. productName: Nama produk yang bersih, spesifik, dan siap pakai (contoh: "Somethinc Niacinamide Barrier Serum", "Sago Slimming Green Coffee Diet", "Keychron K2 Wireless Keyboard").
2. brandName: Brand atau nama merk resmi jika terdeteksi (contoh: "Somethinc", "Sago", "Skintific", "Erigo").
3. category: Pilih 1 dari 12 kategori di atas yang paling tepat untuk mempromosikan produk ini.
4. productDescription: Deskripsi produk yang menarik, menjelaskan manfaat utama dan cara kerjanya secara ringkas.
5. targetAudience: Target audiens spesifik (misal: "Pria dan wanita 20-35 tahun yang ingin badan ideal tanpa lapar").
6. keySellingPoints: Poin keunggulan utama (USP) yang persuasif dan memicu checkout di keranjang belanja / klik keranjang di bawah.
7. tone: Nada bicara yang paling pas ("Santai, Relatable & Meyakinkan", "Hype, Heboh & Excited", "Edukatif, Tenang & Elegan", "Drama Komedi & Sketsa Lucu", atau "ASMR Bisik & Estetik").
8. targetPlatform: Platform yang cocok ("TikTok Shop", "Tokopedia", "Shopee Video", "Instagram Reels", "YouTube Shorts").
9. targetDuration: Rekomendasi durasi (integer: 15, 30, 45, atau 60 detik).
10. detectedTags: Array 3-5 kata kunci relevan (misal: ["dietsehat", "kopidiet", "slimming", "racuntiktok"]).
11. detectionSummary: Penjelasan ringkas ramah 1 kalimat tentang apa yang berhasil dideteksi dari link ini.
12. persona: Pilih 1 persona talent yang paling ideal dari daftar 24 persona di atas.
13. personaExplanation: 1 kalimat penjelasan singkat mengapa persona talent ini sangat cocok untuk membawakan produk tersebut.
14. cameraAngleStyle: Pilih 1 gaya sudut kamera dari daftar 10 gaya di atas yang paling sesuai untuk visualisasi produk ini.
15. cameraStyleExplanation: 1 kalimat penjelasan singkat mengapa gaya sudut kamera ini memaksimalkan visualisasi dan conversion rate produk.
16. preferredCameraAngles: Array 3-5 sudut kamera spesifik yang disarankan (contoh: ["Extreme Close-up / Macro (Tekstur & Detail)", "POV / Handheld (First-Person)", "Over the Shoulder (OTS)", "Front Camera / Selfie Mode (Curhat Langsung)"]).`;

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
          personaExplanation: { type: Type.STRING },
          tone: { type: Type.STRING },
          cameraAngleStyle: { type: Type.STRING },
          cameraStyleExplanation: { type: Type.STRING },
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
          'persona',
          'personaExplanation',
          'cameraAngleStyle',
          'cameraStyleExplanation',
          'preferredCameraAngles',
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
    if (linkData?.finalUrl || url) {
      (heuristicData as any).productUrl = linkData?.finalUrl || url;
    }
    if (linkData?.brand && !(heuristicData as any).brandName) {
      (heuristicData as any).brandName = linkData.brand;
    }
    if (linkData?.ogImage) {
      (heuristicData as any).imageUrl = linkData.ogImage;
    }
    if (linkData?.price) {
      (heuristicData as any).price = String(linkData.price).startsWith('Rp')
        ? linkData.price
        : `${linkData.currency || 'Rp'} ${linkData.price}`;
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
