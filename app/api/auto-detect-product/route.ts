import { NextRequest, NextResponse } from 'next/server';
import { Type } from '@google/genai';
import type { ReferenceRole } from '@/types';
import {
  generateWithFallback,
  parseSafeJson,
  heuristicAutoDetect,
} from '@/lib/gemini-ugc';
import {
  extractProductFromLink,
  extractUrlFromInput,
  extractShareTextIntelligence,
  isLikelyShortcodeOrHash,
  extractPainPointsFromText,
} from '@/lib/link-extractor';
import {
  UGC_CATEGORIES,
  CAMERA_ANGLE_STYLES,
  VOICE_TONE_OPTIONS,
} from '@/data/categories';

async function handleAutoDetectRequest(body: any) {
  let { url = '', notes = '', input = '', referenceImages = [], referenceRoles = [] } = body || {};
  const attachedImages: string[] = Array.isArray(referenceImages) ? referenceImages.filter(Boolean) : [];
  const attachedRoles: ReferenceRole[] = Array.isArray(referenceRoles) ? referenceRoles : [];

  const combinedSource = (input || `${url} ${notes}`).trim();
  const foundUrl = extractUrlFromInput(combinedSource);
  if (foundUrl) {
    url = foundUrl;
    notes = combinedSource.replace(foundUrl, '').replace(/https?:\/\/\S+/gi, '').trim() || notes;
  } else if (input && typeof input === 'string') {
    notes = input.trim();
  }

  const rawInputCombined = (input || `${url} ${notes}`).trim();

  if (!rawInputCombined && !url && attachedImages.length === 0) {
    return NextResponse.json(
      { error: 'Masukkan link produk, keterangan, atau upload foto referensi terlebih dahulu' },
      { status: 400 }
    );
  }

  const shareIntel = extractShareTextIntelligence(rawInputCombined);

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
- Nama Produk Hasil Scraping/Share-Text: "${shareIntel.shareProductName || linkData.productName || linkData.ogTitle || linkData.title || '-'}"
${shareIntel.shareBrand || linkData.brand ? `- Brand / Koleksi / Toko Resmi: "${shareIntel.shareBrand || linkData.brand}"` : ''}
${shareIntel.sharePrice || linkData.price ? `- Harga Produk: Rp ${shareIntel.sharePrice || linkData.price}` : ''}
${linkData.ogDescription || linkData.metaDescription ? `- Deskripsi/Snippet Halaman: "${linkData.ogDescription || linkData.metaDescription}"` : ''}
${linkData.cleanedSummary ? `- Ringkasan Terstruktur:\n${linkData.cleanedSummary}` : ''}

INSTRUKSI PENTING:
Gunakan Nama Produk "${shareIntel.shareProductName || linkData.productName || ''}" dan fakta di atas sebagai acuan utama produk. Jangan pernah mengubah kode acak shortlink (seperti LoXUMhlJb) menjadi nama produk!`;
      }
    } catch (scrapeErr) {
      console.warn('Scraping error (continuing with input text):', scrapeErr);
    }
  }

  if (!linkContext && (shareIntel.shareProductName || shareIntel.sharePrice)) {
    linkContext = `
HASIL EKSTRAKSI KALIMAT SHARE MARKETPLACE:
${shareIntel.shareProductName ? `- Nama Produk Asli: "${shareIntel.shareProductName}"` : ''}
${shareIntel.shareBrand ? `- Brand / Koleksi: "${shareIntel.shareBrand}"` : ''}
${shareIntel.sharePrice ? `- Harga Produk: Rp ${shareIntel.sharePrice}` : ''}`;
  }

  const scrapedGallery: string[] = Array.isArray(linkData?.images)
    ? linkData.images.filter(Boolean)
    : linkData?.ogImage
    ? [linkData.ogImage]
    : [];

  const mergedGallery: string[] = [];
  for (const img of [...attachedImages, ...scrapedGallery]) {
    if (typeof img === 'string' && img.trim() && !mergedGallery.includes(img.trim())) {
      mergedGallery.push(img.trim());
    }
    if (mergedGallery.length >= 6) break;
  }

  const mergedRoles: ReferenceRole[] = mergedGallery.map(
    (_, idx) => attachedRoles[idx] || (idx === 0 ? 'product' : 'detail')
  );

  const localPainPoints = extractPainPointsFromText(
    `${rawInputCombined}\n${linkData?.ogDescription || ''}\n${linkData?.metaDescription || ''}`
  );

  const categoriesListText = UGC_CATEGORIES.map((c) => `- "${c.name}"`).join('\n');
  const cameraStylesListText = CAMERA_ANGLE_STYLES.map(
    (s, idx) => `${idx + 1}. "${s.name}" (${s.description})`
  ).join('\n');
  const voiceTonesListText = VOICE_TONE_OPTIONS.map(
    (t, idx) => `${idx + 1}. "${t.name}" (${t.description})`
  ).join('\n');

  const prompt = `Kamu adalah AI UGC Product & Link Analyzer profesional dengan tingkat akurasi tinggi untuk platform TikTok Shop, Tokopedia, Shopee Video, Instagram Reels, dan YouTube Shorts.
Analisis input link produk, ulasan/keluhan pembeli, serta foto kemasan produk (jika terlampir), lalu lakukan ekstraksi data produk secara spesifik, akurat, dan mendalam:

Input Pengguna: "${rawInputCombined}"
${url ? `Terdeteksi URL: "${url}"` : ''}
${notes ? `Terdeteksi Keterangan Tambahan / Ulasan: "${notes}"` : ''}
${linkContext}
${mergedGallery.length > 0 ? `Jumlah Foto Produk Terlampir/Terscraping: ${mergedGallery.length} foto.` : ''}

ATURAN UTAMA:
1. DILARANG KERAS menghasilkan nama generik seperti "Produk Unggulan Pilihan", "Produk Pilihan", atau "Produk Ini" jika input, foto kemasan, atau URL memuat indikasi nama barang.
2. VISION OCR KEMASAN: Jika ada foto produk terlampir, baca teks merek, varian, ukuran (ml/gr), atau klaim persis pada label kemasan lalu tulis di field "exactLabelText".
3. EKSTRAKSI PAIN POINT / ULASAN PEMBELI: Jika input atau deskripsi memuat keluhan konsumen, keraguan pembeli, atau masalah kulit/rumah tangga, ekstrak 2-4 poin singkat ke array "extractedPainPoints" dan jadikan solusi nya di "keySellingPoints".
4. Jika ada nama brand resmi, cantumkan brand di "brandName" dan nama produk lengkap di "productName".
5. Bersihkan kata-kata sampah marketplace seperti "Jual", "Beli", "Termurah", "Original 100%", "Bebas Ongkir", "COD", "Ready Stock".

Daftar ${UGC_CATEGORIES.length} Kategori UGC yang WAJIB dipilih salah satu yang paling cocok:
${categoriesListText}

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

Daftar ${CAMERA_ANGLE_STYLES.length} Gaya Sinematik Kamera Storyboard (Camera Angle Style) yang WAJIB dipilih 1 yang paling pas:
${cameraStylesListText}

Daftar ${VOICE_TONE_OPTIONS.length} Pilihan Voice Tone (Gaya Bicara Kreator) yang WAJIB dipilih 1 yang paling tepat:
${voiceTonesListText}

Tugas Anda:
1. productName: Nama produk bersih & spesifik.
2. brandName: Merk resmi jika terdeteksi.
3. exactLabelText: Teks label persis pada kemasan (hasil Vision OCR foto jika ada, atau nama produk + ukuran).
4. category: Pilih 1 persis dari ${UGC_CATEGORIES.length} kategori di atas.
5. productDescription: Deskripsi produk menarik & ringkas.
6. targetAudience: Target audiens spesifik.
7. keySellingPoints: Poin keunggulan utama (USP) yang persuasif & aman regulasi.
8. extractedPainPoints: Array 2-4 poin keluhan / masalah audiens yang diselesaikan produk ini.
9. tone: Pilih 1 nama Voice Tone PERSIS dari daftar di atas.
10. targetPlatform: Platform cocok ("TikTok Shop", "Tokopedia", "Shopee Video", "Instagram Reels", "YouTube Shorts").
11. targetDuration: Rekomendasi durasi integer (15, 30, 45, atau 60).
12. detectedTags: Array 3-5 kata kunci relevan.
13. detectionSummary: Ringkasan 1 kalimat hasil ekstraksi.
14. persona: Pilih 1 persona paling ideal dari 24 daftar di atas.
15. personaExplanation: 1 kalimat alasan pemilihan persona.
16. cameraAngleStyle: Pilih 1 nama Gaya Kamera PERSIS dari daftar di atas.
17. cameraStyleExplanation: 1 kalimat alasan gaya sudut kamera.
18. preferredCameraAngles: Array 3-5 sudut kamera spesifik.`;

  const config = {
    responseMimeType: 'application/json',
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        productName: { type: Type.STRING },
        brandName: { type: Type.STRING },
        exactLabelText: { type: Type.STRING },
        category: { type: Type.STRING },
        productDescription: { type: Type.STRING },
        targetAudience: { type: Type.STRING },
        keySellingPoints: { type: Type.STRING },
        extractedPainPoints: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
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
    'You are a professional UGC Ecommerce strategist & Vision OCR packaging reader in Southeast Asia. Analyze input links, buyer pain points/reviews, and attached packaging photos to return pure JSON.',
    22000,
    mergedGallery,
    mergedRoles
  );

  const parsed = parseSafeJson<any>(rawText);
  if (parsed && parsed.productName) {
    const bestKnownName = shareIntel.shareProductName || linkData?.productName;
    if (
      bestKnownName &&
      (!parsed.productName ||
        parsed.productName.toLowerCase().includes('produk unggulan') ||
        isLikelyShortcodeOrHash(parsed.productName))
    ) {
      parsed.productName = bestKnownName;
    }
    if ((shareIntel.shareBrand || linkData?.brand) && !parsed.brandName) {
      parsed.brandName = shareIntel.shareBrand || linkData?.brand;
    }
    if (linkData?.finalUrl || url) {
      parsed.productUrl = linkData?.finalUrl || url;
    }
    if (linkData?.ogImage || mergedGallery[0]) {
      parsed.imageUrl = linkData?.ogImage || mergedGallery[0];
    }
    if (mergedGallery.length > 0) {
      parsed.referenceImages = mergedGallery;
      parsed.referenceRoles = mergedRoles;
      if (!parsed.referenceImage) parsed.referenceImage = mergedGallery[0];
    }
    if (!parsed.exactLabelText) {
      parsed.exactLabelText = parsed.brandName
        ? `${parsed.brandName} ${parsed.productName}`.trim()
        : parsed.productName;
    }
    if (
      (!Array.isArray(parsed.extractedPainPoints) || parsed.extractedPainPoints.length === 0) &&
      localPainPoints.length > 0
    ) {
      parsed.extractedPainPoints = localPainPoints;
    }
    if (linkData?.price || shareIntel.sharePrice) {
      const rawP = linkData?.price || shareIntel.sharePrice;
      parsed.price = String(rawP).startsWith('Rp') ? rawP : `${linkData?.currency || 'Rp'} ${rawP}`;
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

  const heuristicData = heuristicAutoDetect(rawInputCombined, url, notes, linkData);
  if (linkData?.finalUrl || url) {
    (heuristicData as any).productUrl = linkData?.finalUrl || url;
  }
  if (linkData?.brand && !(heuristicData as any).brandName) {
    (heuristicData as any).brandName = linkData.brand;
  }
  if (linkData?.ogImage || mergedGallery[0]) {
    (heuristicData as any).imageUrl = linkData?.ogImage || mergedGallery[0];
  }
  if (mergedGallery.length > 0) {
    (heuristicData as any).referenceImages = mergedGallery;
    (heuristicData as any).referenceRoles = mergedRoles;
    if (!(heuristicData as any).referenceImage) {
      (heuristicData as any).referenceImage = mergedGallery[0];
    }
  }
  if (localPainPoints.length > 0 && !(heuristicData as any).extractedPainPoints?.length) {
    (heuristicData as any).extractedPainPoints = localPainPoints;
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
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    return await handleAutoDetectRequest(body);
  } catch (error: any) {
    console.error('Server error in auto-detect-product POST:', error);
    return NextResponse.json({ error: error.message || 'Gagal mendeteksi link produk' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const payloadParam = req.nextUrl.searchParams.get('payload');
    const inputParam = req.nextUrl.searchParams.get('input');
    const body = payloadParam ? JSON.parse(payloadParam) : { input: inputParam || '' };
    return await handleAutoDetectRequest(body);
  } catch (error: any) {
    console.error('Server error in auto-detect-product GET:', error);
    return NextResponse.json({ error: error.message || 'Gagal mendeteksi link produk' }, { status: 500 });
  }
}
