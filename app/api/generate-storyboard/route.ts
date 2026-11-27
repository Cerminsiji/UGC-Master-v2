import { NextRequest, NextResponse } from 'next/server';
import { Type } from '@google/genai';
import type { ReferenceRole, VisualContinuityBible } from '@/types';
import {
  generateWithFallback,
  parseSafeJson,
  formatShortCaption,
  generateRichFallback,
  pickDynamicHookArchetype,
  sanitizeClicheSceneOne,
  getVoiceToneDirective,
  ensureVariedStoryboardScenes,
  buildNicheHashtags,
  fitCaptionWithHashtags,
  REFERENCE_ROLE_OPTIONS,
  getReferenceRoleLabel,
  selectSceneReferenceIndexes,
  formatReferenceTagsForScene,
} from '@/lib/gemini-ugc';

async function handleGenerateStoryboardRequest(body: any) {
  try {
    const {
      category = 'Before & After',
      productName = 'Produk Unggulan',
      brandName = '',
      referenceImage: rawReferenceImage = '',
      referenceImages: rawReferenceImages = [],
      referenceRoles: rawReferenceRoles = [],
      referenceImageCount = 0,
      productDescription = '',
      targetAudience = 'Pengguna TikTok / Reels usia 18-35 tahun',
      keySellingPoints = '',
      persona = 'Wanita Muda / Gen Z',
      tone = 'Santai, Mengalir & Natural (Teman Curhat)',
      cameraAngleStyle = 'Dinamis & Multi-Angle (Viral Fast-Cut)',
      preferredCameraAngles = [],
      targetDuration = 30,
      targetSceneCount = 0,
      language = 'id',
      physicsConsistencyCheck = true,
    } = body || {};
    const enforcePhysicsCheck = physicsConsistencyCheck !== false;

    const allReferenceImages: string[] = Array.isArray(rawReferenceImages) && rawReferenceImages.length > 0
      ? rawReferenceImages.filter(Boolean)
      : (rawReferenceImage ? [rawReferenceImage] : []);

    const validRoleSet = new Set<ReferenceRole>(REFERENCE_ROLE_OPTIONS.map((r) => r.value));
    const totalRefCount = Math.max(
      allReferenceImages.length,
      Number(referenceImageCount) || (rawReferenceImage ? 1 : 0)
    );
    const normalizedRoles: ReferenceRole[] = Array.from({ length: Math.max(1, totalRefCount) }, (_, idx) => {
      const candidate = Array.isArray(rawReferenceRoles) ? rawReferenceRoles[idx] : undefined;
      if (candidate && validRoleSet.has(candidate)) return candidate as ReferenceRole;
      return idx === 0 ? 'product' : 'detail';
    });

    const referenceInventoryLines =
      totalRefCount > 0
        ? Array.from({ length: totalRefCount }, (_, idx) => {
            const roleMeta =
              REFERENCE_ROLE_OPTIONS.find((r) => r.value === normalizedRoles[idx]) || REFERENCE_ROLE_OPTIONS[0];
            return `  * Image #${idx + 1} -> Peran: ${roleMeta.label} (${roleMeta.promptHint})`;
          }).join('\n')
        : `  * Image #1 -> Peran: Produk Utama (Kemasan fisik ${productName})`;

    const referenceImage =
      typeof rawReferenceImage === 'string' && rawReferenceImage.startsWith('data:')
        ? `Gambar Referensi Produk ${productName} (${Math.max(1, totalRefCount)} foto referensi terlampir)`
        : (rawReferenceImage || (totalRefCount > 0 ? `${totalRefCount} Gambar Referensi Produk ${productName}` : ''));

    const rawPlatform = body?.targetPlatform || body?.platform || 'TikTok Shop';
    const platform = typeof rawPlatform === 'string' ? rawPlatform.trim() : 'TikTok Shop';
    const isShopee = platform.toLowerCase().includes('shopee');
    const isTikTok = platform.toLowerCase().includes('tiktok');

    const sceneCountText = targetSceneCount && targetSceneCount >= 2 && targetSceneCount <= 9
      ? `WAJIB BUAT TEPAT ${targetSceneCount} ADEGAN (meskipun durasi hanya ${targetDuration} detik, buat ${targetSceneCount} adegan bergaya fast-cut mikro yang dinamis!).`
      : `Buat 5 sampai 7 adegan yang proporsional, kaya, dan variatif agar alur video memikat dan tidak monoton.`;

    const cameraInstructions = preferredCameraAngles && preferredCameraAngles.length > 0
      ? `ATURAN KHUSUS SUDUT KAMERA (CAMERA ANGLE):
Gaya Utama: "${cameraAngleStyle}".
WAJIB prioritaskan dan variasikan pilihan sudut kamera berikut di setiap adegan: ${preferredCameraAngles.join(', ')}.
PENTING: Setiap adegan harus memiliki field cameraAngle yang spesifik (misal: 'POV / Handheld (First-Person)', 'Extreme Close-up / Macro (Tekstur & Detail)', 'Over the Shoulder (OTS)', 'Front Camera / Selfie Mode (Curhat Langsung)', 'Low Angle (Hero / Powerful)', 'Flat Lay / Top-down (Meja Estetik)'). Jangan gunakan sudut yang sama beruntun!`
      : `ATURAN KHUSUS SUDUT KAMERA (CAMERA ANGLE):
Gaya Utama Komposisi Kamera: "${cameraAngleStyle}".
Sesuaikan sudut kamera di setiap adegan dengan gaya ini secara sinematik vertikal (9:16 TikTok/Reels/Shorts). Berikan variasi sudut yang hidup dan dinamis (misal: POV / Handheld, Close-up Macro, Over the Shoulder, Front Camera / Selfie, Low Angle Hero, Flat Lay).`;

    const productBrief = `PRODUK YANG DIPROMOSIKAN:
- Nama Produk: "${productName}" ${brandName ? `(Brand: "${brandName}")` : ''}
- Deskripsi: "${productDescription || '-'}"
- Keunggulan Utama (USP): "${keySellingPoints || 'Kualitas terjamin, hasil nyata terbukti'}"
- Referensi Gambar Produk (Google Flow Reference Image): "${referenceImage || `Visual kemasan dan fisik asli produk ${productName}`}"`;

    const isHandsOnly =
      (cameraAngleStyle && (cameraAngleStyle.toLowerCase().includes('hand') || cameraAngleStyle.toLowerCase().includes('tangan'))) ||
      (persona && persona.toLowerCase().includes('tangan')) ||
      (preferredCameraAngles && preferredCameraAngles.some((a: string) => a.toLowerCase().includes('tangan') || a.toLowerCase().includes('hand')));

    const chosenHookArchetype = pickDynamicHookArchetype(category, productName);

    const rdHookInstruction = `
=== RISET & PENGEMBANGAN (R&D) HOOK ADEGAN 1 — ANTI-MONOTON & ANTI "3 ALASAN" & ANTI "STOP SCROLLING" ===
- Arketipe Hook Terpilih: "${chosenHookArchetype.name}" (${chosenHookArchetype.psychology})
- Arahan R&D Adegan 1: ${chosenHookArchetype.promptDirective}
- LARANGAN MUTLAK 1 (ANTI LISTICLE & ANTI "3 ALASAN"): DILARANG KERAS membuat hook pembuka bertipe listicle monoton seperti "3 alasan kenapa...", "3 alasan wajib punya...", "Ini 3 alasan...", "3 hal yang bikin...", atau format menghitung poin/jari di Adegan 1! Format "3 alasan" sudah usang, klise, dan membuat audiens bosan.
- LARANGAN MUTLAK 2 (ANTI "STOP SCROLLING"): DILARANG KERAS memulai Adegan 1 dengan kalimat klise yang monoton seperti "Stop scrolling!", "Jangan skip dulu!", "Tunggu dulu jangan di-scroll!", atau aksi visual klise "gesture tangan menyetop layar"!
- SEBAGAI GANTINYA: Adegan 1 WAJIB langsung masuk secara alami, organik, dan emosional ke substansi produk "${productName}" sesuai arketipe "${chosenHookArchetype.name}" (misal: visual shock hasil nyata sebelum/sesudah, empati masalah spesifik sehari-hari, rasa penasaran misterius / curiosity gap, cerita pengalaman nyata ditanya orang kantor, uji klaim ekstrem tanpa cut di depan lensa, atau reverse psychology peringatan anti-nyesel).`;

    const handsOnlyInstruction = isHandsOnly
      ? `\nATURAN MUTLAK KAMERA HANYA TANGAN SAJA (FACELESS UGC - 100% TANPA WAJAH):
- Kamera HANYA merekam gerakan tangan dan interaksi produk (unboxing, membuka segel, memegang kemasan, mengoleskan tekstur/swatch, menunjuk ${isShopee ? 'keranjang oren' : (isTikTok ? 'keranjang kuning atau keranjang di bawah' : 'keranjang di bawah')}).
- DILARANG KERAS memunculkan wajah, ekspresi muka, tatapan mata, atau kepala talent di dalam deskripsi adegan visualAction!
- Semua visualAction WAJIB diawali dengan aksi tangan (misal: "Tangan talent memegang...", "Kamera menyorot tangan talent yang sedang...", "Tangan talent mengoles tekstur produk di atas meja estetik...").`
      : '';

    const platformCtaRule = isShopee
      ? `\n=== ATURAN MUTLAK CTA & NARASI PLATFORM SHOPEE (ANTI KERANANG KUNING) ===
- Target Platform saat ini: SHOPEE (${platform}).
- WAJIB gunakan istilah "Keranjang Oren" (Orange Cart) ATAU kalimat global seperti "Klik keranjang di bawah" / "keranjang di bawah".
- DILARANG KERAS menyebut atau menulis "keranjang kuning"! Jika target Shopee, sebutan kuning adalah kesalahan fatal.
- Voiceover (dialogVO) adegan penutup / CTA: "Langsung checkout di keranjang oren ya!", "Mumpung lagi promo & free ongkir, klik keranjang oren sekarang!", atau "Langsung klik keranjang di bawah ya!"
- Floating / Pop-up Text (popupText): "KLIK KERANJANG OREN SEKARANG! 🛒👇", "CEK KERANJANG OREN DI BAWAH! 🛒👇", atau "KLIK KERANJANG DI BAWAH! 🛒👇"
- Narasi Aksi Visual (visualAction): Talent menunjuk ke arah pojok kiri bawah ke arah keranjang oren Shopee / menunjuk keranjang di bawah.`
      : (isTikTok
        ? `\n=== ATURAN CTA & NARASI PLATFORM TIKTOK SHOP ===
- Target Platform saat ini: TIKTOK SHOP (${platform}).
- Gunakan istilah "Keranjang Kuning" ATAU kalimat global seperti "Klik keranjang di bawah" / "Cek keranjang di bawah sekarang".
- Voiceover (dialogVO) CTA: "Langsung klik keranjang kuning ya!" atau "Langsung klik keranjang di bawah ya!"
- Floating / Pop-up Text (popupText): "CEK KERANJANG KUNING SEKARANG! 🛒👇" atau "KLIK KERANJANG DI BAWAH! 🛒👇"
- Narasi Aksi Visual (visualAction): Talent menunjuk ke arah keranjang kuning / keranjang di bawah.`
        : `\n=== ATURAN CTA & NARASI PLATFORM GLOBAL (${platform}) ===
- Target Platform saat ini: ${platform}.
- WAJIB gunakan kalimat global / universal: "Klik keranjang di bawah", "Cek keranjang di bawah", "Checkout lewat keranjang di bawah ya!"
- DILARANG menyebut keranjang kuning untuk platform ini.
- Floating / Pop-up Text (popupText): "KLIK KERANJANG DI BAWAH SEKARANG! 🛒👇"
- Narasi Aksi Visual (visualAction): Talent menunjuk ke arah keranjang di bawah.`);

    const physicalLawsAndLightingMandate = enforcePhysicsCheck
      ? `
=== PHYSICS CONSISTENCY CHECK MODULE (ANTI-FLOATY MOTION & AUTHENTIC PHYSICS ENFORCEMENT) ===
Semua deskripsi visualAction dan googleFlowPrompt WAJIB lolos "Physics Consistency Check" guna mencegah artefak gerakan melayang (floaty/zero-G motion) yang memicu detektor AI:
1. REALISTIC MASS INERTIA (INERSIA MASSA & GRAVITASI NYATA):
   - Produk "${productName}" memiliki bobot, inersia, dan momentum fisik nyata (realistic mass inertia). Benda padat tidak pernah melayang, berhenti mendadak tanpa gaya, atau bergerak tanpa gravitasi.
   - Setiap perpindahan produk (diangkat, diletakkan di meja, digoyang) harus menampakkan akselerasi dan deselerasi wajar sesuai massa benda.
2. BIOMECHANICAL CONSTRAINT ADHERENCE (KEPATUHAN BATAS BIOMEKANIK MANUSIA):
   - Tangan, pergelangan, siku, dan 5 jari talent WAJIB tunduk pada batas sendi anatomis nyata (biomechanical constraint adherence): sudut tekuk sendi wajar, genggaman dengan ketegangan otot & tekanan permukaan alami, tanpa jari berlebih atau sendi patah/melentur mustahil.
   - Solid Contact Mechanics (Anti-Clipping): Jari dan permukaan produk saling bersentuhan padat tanpa tembus/clipping atau ruang kosong mengambang.
   - Zero-Morphing: Bentuk fisik produk, label, dan anatomi tangan tetap kaku dan konsisten di setiap frame gerakan.
3. PENCAHAYAAN KONSISTEN (CONSISTENT DIRECTIONAL LIGHTING & CAST SHADOWS):
   - Sumber cahaya arah tunggal terpadu (misal: cahaya jendela 45° atau softbox utama) dengan bayangan kontak (cast shadows) dan ambient occlusion yang sejajar serta refleksi specular konsisten.
   - WAJIB sertakan frasa eksplisit "realistic mass inertia" dan "biomechanical constraint adherence" di dalam setiap googleFlowPrompt!`
      : `
=== PANDUAN VISUAL STANDAR ===
Jaga agar setiap adegan visualAction dan googleFlowPrompt tetap konsisten dengan pencahayaan produk, komposisi rapi, dan referensi gambar produk.`;

    const googleFlowReferenceInstruction = `
=== ATURAN MUTLAK KEPATUHAN MULTI-REFERENSI ROLE-BASED & VISUAL CONTINUITY BIBLE ===
Format ini WAJIB kompatibel dengan pipeline Google Flow Video UGC (Image-to-Video & Multi-Image Ingredients Workflow).
Jumlah Gambar Referensi Terlampir: ${Math.max(1, totalRefCount)} gambar.
Peta Peran Masing-Masing Referensi (WAJIB DIPATUHI):
${referenceInventoryLines}

ATURAN KUNCI REFERENSI & KONTINUITAS VISUAL:
1. EKSTRAKSI VISUAL CONTINUITY BIBLE (visualBible):
   Analisis semua gambar referensi di atas secara teliti dan isi object \`visualBible\` berisi:
   - \`packagingColors\`: warna dominan kemasan & aksen spesifik sesuai gambar referensi.
   - \`exactLabelText\`: teks merek/label persis yang tertulis pada produk "${productName}"${brandName ? ` (${brandName})` : ''} agar tidak berubah menjadi teks ngawur saat render AI.
   - \`productShapeMaterial\`: bentuk fisik wadah (botol/tube/jar/box/pouch), jenis tutup/aplikator, dan tekstur material.
   - \`talentAppearance\`: konsistensi wajah, rambut/hijab, pakaian talent (atau spesifikasi tangan bersih 5 jari jika Faceless/Hands-Only) sesuai referensi Talent.
   - \`environmentLighting\`: arah cahaya tunggal terpadu (misal: cahaya jendela 45° dari kiri) dan suasana latar ruangan sesuai referensi Lokasi.
   - \`negativePromptGlobal\`: daftar larangan visual dalam bahasa Inggris (no altered brand text, no gibberish label, no extra fingers, no clipping, no floating zero-G motion, no lighting jump).
2. PEMETAAN MULTI-REFERENSI PER ADEGAN (referencedImageIndexes):
   - Tentukan angka indeks (1-based, misal [1] atau [1, 3]) gambar referensi mana yang WAJIB menjadi acuan pada adegan tersebut sesuai perannya (JANGAN rotasi acak!).
   - Contoh: adegan bicara/selfie memakai [Produk Utama + Karakter/Talent + Lokasi]; adegan makro tekstur memakai [Produk Utama + Detail/Label].
3. TRANSITION BRIDGE (Start Pose -> End Pose):
   - Di setiap adegan, isi \`transitionBridge\` untuk mengunci kesinambungan posisi objek, tangan, dan arah gerak dari akhir adegan sebelumnya menuju awal adegan berikutnya (anti jump-cut membingungkan).
4. GOOGLE FLOW PROMPT & NEGATIVE PROMPT:
   Format \`googleFlowPrompt\` wajib memuat tag \`[Image X (Peran): ${productName}]\` sesuai \`referencedImageIndexes\`, merujuk detail \`visualBible\` (warna kemasan, teks label persis "${productName}", konsistensi talent & pencahayaan tunggal), serta On-Screen Pop-up Text Overlay.
   Isi juga \`negativePrompt\` spesifik adegan dalam bahasa Inggris.
5. \`imageReferenceNote\`: catat indeks gambar referensi yang dipakai adegan tersebut, misal "Kunci visual mengikuti Gambar Referensi #1 (Produk)".
6. \`popupText\`: WAJIB SELALU MUNCUL huruf kapital tebal singkat & mencolok di setiap adegan.

=== ATURAN BEBAS TYPO & KESALAHAN EJAAN (ZERO TYPO DISCIPLINE) ===
- DILARANG KERAS ADA TYPO ATAU SALAH KETIK pada dialogVO, popupText, visualAction, soundEffect, notesMood, maupun googleFlowPrompt!
- Gunakan tata bahasa Indonesia yang rapi, natural, dan ejaan yang tepat.`;

    const prompt = `Kamu adalah pakar Creative Director & R&D Scriptwriter UGC (User-Generated Content) viral TikTok Shop, Shopee Video, dan Instagram Reels di Indonesia.
Buatkan storyboard UGC video lengkap yang kaya riset produk, variatif, tidak monoton, dan terbukti memiliki Conversion Rate & Retention Rate tinggi untuk produk berikut:

${productBrief}
${rdHookInstruction}
${physicalLawsAndLightingMandate}
${googleFlowReferenceInstruction}
${handsOnlyInstruction}
${platformCtaRule}

Kategori Konten: ${category}
Target Audiens: ${targetAudience}
Persona Talent Kreator: "${persona}" (Sesuaikan gaya bicara VO, diksi gaul/santai/elegan, ekspresi visual, dan OOTD talent dengan persona "${persona}" ini secara mendalam agar sangat otentik!)
Tone of Voice: ${tone}
Panduan Gaya Bicara & Pacing VO: ${getVoiceToneDirective(tone)}
${cameraInstructions}
Target Durasi Total: ${targetDuration} detik
Jumlah Adegan yang Diminta: ${sceneCountText}
Platform: ${platform}
Bahasa: ${language === 'id' ? 'Bahasa Indonesia (Gaya bicara kreator UGC natural, luwes, spesifik membahas manfaat produk, tanpa kalimat klise "Stop scrolling", tanpa typo)' : 'English (Casual UGC creator style, zero clichés, zero typos)'}

Syarat Wajib Format Storyboard:
1. Adegan 1 WAJIB menerapkan strategi R&D Hook "${chosenHookArchetype.name}" (${chosenHookArchetype.promptDirective}). JANGAN gunakan kata "Stop scrolling", "Jangan skip dulu", dan DILARANG KERAS menggunakan format "3 alasan" atau listicle berhitung angka di Adegan 1!
2. Adegan berikutnya membedah masalah spesifik, demonstrasi pemakaian nyata, tekstur/fitur fisik produk, dan bukti hasil secara dinamis. Pastikan setiap adegan MENYAMBUNG secara naratif dari adegan sebelumnya ke adegan berikutnya.
3. ${enforcePhysicsCheck ? 'PHYSICS CONSISTENCY CHECK WAJIB AKTIF: Semua aksi visual (visualAction) dan googleFlowPrompt WAJIB menyertakan dan mematuhi "realistic mass inertia", "biomechanical constraint adherence", kontak solid tanpa tembus, pencahayaan arah tunggal konsisten dengan bayangan jatuh nyata, serta ZERO floaty motion / morphing!' : 'Pastikan visualAction dan googleFlowPrompt mendeskripsikan adegan produk dengan pencahayaan natural dan jelas.'}
4. Adegan terakhir WAJIB Call To Action (CTA) yang jelas dan mendesak: ${isShopee ? 'checkout di keranjang oren (BUKAN keranjang kuning!) atau gunakan kalimat global "klik keranjang di bawah"' : (isTikTok ? 'checkout di keranjang kuning atau klik keranjang di bawah' : 'checkout lewat keranjang di bawah')} mumpung promo diskon & gratis ongkir.
5. Sudut kamera (cameraAngle) di setiap adegan WAJIB bervariasi mengikuti gaya "${cameraAngleStyle}" (jangan pakai sudut yang sama di dua adegan berurutan; gunakan variasi modern seperti 0.5x Ultra-Wide, Match-Cut Hand Transition, Snap-Zoom Product Punch, Macro Texture, OTS, Mirror Shot).
6. Berikan Sound Effect (SFX) yang KAYA, BERVARIASI, dan SPESIFIK di setiap adegan (kombinasi ASMR nyata, foley produk, beat drop hit, riser tension, swoosh, camera shutter, ding, water swirl, cash register). DILARANG menggunakan SFX yang sama berulang-ulang di tiap adegan.
7. ANTI-MONOTON NASKAH VOICEOVER (dialogVO): Variasikan pembukaan kalimat, ritme, dan emosi tiap adegan agar terdengar seperti kreator manusia asli yang bercerita mengalir (gabungkan reaksi spontan, kalimat tanya/sambungan natural, plot twist, atau fakta spesifik produk)—DILARANG mengulang pola kalimat yang sama atau terdengar seperti iklan kaku berulang.
8. ANTI-MONOTON POP-UP TEXT (popupText): WAJIB SELALU TERISI di setiap adegan dengan gaya stiker yang bervariasi (misal: kutipan reaksi singkat, angka/fakta uji nyata, badge kualitas, perbandingan kontras, CTA urgensi)—DILARANG memakai format generik berulang seperti "KEUNGGULAN: ..." atau "SOLUSI: ...".
9. Catatan Style & Mood (notesMood): Berikan variasi gaya teks overlay dan estetika visual modern (misal: TikTok Reply Comment Sticker, Kinetic Typography Fast-Cut, Y2K Flash Camcorder, Raw iPhone Handheld, Clean Editorial Softbox, Split-Screen Scoreboard).
10. Durasi setiap adegan (dalam integer detik) jika dijumlahkan WAJIB bernilai total mendekati ${targetDuration} detik. Jika durasi pendek (${targetDuration}s) dan adegan banyak (hingga 9 adegan), gunakan durasi fast-cut 1-2 detik per adegan.
11. BUATKAN AUTO CAPTION DENGAN HASHTAG: Tulis 1 caption postingan media sosial yang menarik dan menjual (sesuaikan CTA: ${isShopee ? 'keranjang oren / klik keranjang di bawah' : (isTikTok ? 'keranjang kuning / klik keranjang di bawah' : 'klik keranjang di bawah')}), LENGKAP dengan 2-4 hashtag trending (${isShopee ? '#ShopeeVideo #ShopeeHaul' : '#TikTokShop #fyp'}).
    PENTING: TOTAL PANJANG KARAKTER CAPTION TERMASUK HASHTAG HARUS MAKSIMAL 150 KARAKTER!
12. SETIAP ADEGAN WAJIB menyertakan googleFlowPrompt (mengacu ketat ke referensi image [Image 1 Reference: ProductName]${enforcePhysicsCheck ? ', Physics Consistency Check: realistic mass inertia & biomechanical constraint adherence, serta pencahayaan konsisten' : ''}, dan On-Screen Pop-up Text Overlay) dan imageReferenceNote bernilai persis: "Pastikan Produk sesuai Gambar referensi yang sudah di attached"! Bebas dari segala typo.`;

    const config = {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: 'Judul storyboard yang menarik (e.g. Storyboard Before & After - Nama Produk)',
          },
          targetAudienceSummary: {
            type: Type.STRING,
            description: 'Ringkasan singkat target audiens',
          },
          hookTip: {
            type: Type.STRING,
            description: 'Penjelasan psikologi R&D kenapa hook Adegan 1 ini efektif menahan penonton tanpa klise',
          },
          caption: {
            type: Type.STRING,
            description: 'Auto caption posting media sosial lengkap dengan 2-4 hashtag viral. PENTING: Total panjang karakter WAJIB MAKSIMAL 150 KARAKTER.',
          },
          visualBible: {
            type: Type.OBJECT,
            description: 'Visual Continuity Bible yang diekstrak dari gambar referensi & brief produk untuk mengunci konsistensi di semua adegan.',
            properties: {
              packagingColors: { type: Type.STRING },
              exactLabelText: { type: Type.STRING },
              productShapeMaterial: { type: Type.STRING },
              talentAppearance: { type: Type.STRING },
              environmentLighting: { type: Type.STRING },
              negativePromptGlobal: { type: Type.STRING },
            },
            required: [
              'packagingColors',
              'exactLabelText',
              'productShapeMaterial',
              'talentAppearance',
              'environmentLighting',
              'negativePromptGlobal',
            ],
          },
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                cameraAngle: {
                  type: Type.STRING,
                  description: 'Sudut kamera (e.g., Medium Shot, Close-up, POV / Handheld, Wide Shot, Extreme Close-up)',
                },
                visualAction: {
                  type: Type.STRING,
                  description: 'Deskripsi aksi fisik, ekspresi wajah, dan pergerakan objek di depan kamera. WAJIB patuh hukum fisika dan konsisten dengan visualBible.',
                },
                popupText: {
                  type: Type.STRING,
                  description: 'Teks pop-up overlay di layar video (huruf kapital tebal, bukan "JANGAN SKIP DULU").',
                },
                soundEffect: {
                  type: Type.STRING,
                  description: 'Efek suara / SFX (e.g., Crisp plastic peel, Camera shutter, Swoosh, Cha-ching, Sparkle chime).',
                },
                dialogVO: {
                  type: Type.STRING,
                  description: 'Dialog yang diucapkan talent atau suara Voice Over (VO) tanpa kalimat klise "Stop scrolling". Bebas typo.',
                },
                notesMood: {
                  type: Type.STRING,
                  description: 'Catatan teknis, gaya animasi teks (Chat Bubble/Bouncy), pencahayaan konsisten atau mood.',
                },
                duration: {
                  type: Type.INTEGER,
                  description: 'Durasi adegan dalam detik (integer, misal 1, 2, 3, 4, 5).',
                },
                referencedImageIndexes: {
                  type: Type.ARRAY,
                  items: { type: Type.INTEGER },
                  description: 'Array indeks 1-based dari gambar referensi yang relevan untuk adegan ini (misal [1] atau [1, 3]).',
                },
                transitionBridge: {
                  type: Type.STRING,
                  description: 'Jembatan visual Start Pose -> End Pose agar transisi antar adegan menyambung mulus tanpa jump-cut.',
                },
                negativePrompt: {
                  type: Type.STRING,
                  description: 'Negative prompt bahasa Inggris spesifik adegan untuk mencegah distorsi label, jari berlebih, clipping, atau perubahan warna.',
                },
                googleFlowPrompt: {
                  type: Type.STRING,
                  description: 'Prompt video AI untuk Google Flow / Veo / Runway / Kling yang mengikuti referensi image sesuai peran & visualBible, 9:16 vertical.',
                },
                imageReferenceNote: {
                  type: Type.STRING,
                  description: 'Catatan kepatuhan gambar referensi yang dipakai adegan ini.',
                },
              },
              required: [
                'cameraAngle',
                'visualAction',
                'popupText',
                'soundEffect',
                'dialogVO',
                'notesMood',
                'duration',
                'referencedImageIndexes',
                'transitionBridge',
                'negativePrompt',
                'googleFlowPrompt',
                'imageReferenceNote',
              ],
            },
          },
        },
        required: ['title', 'visualBible', 'scenes'],
      },
    };

    const systemPrompt = enforcePhysicsCheck
      ? 'You are an elite UGC video R&D strategist and storyboard scriptwriter. You strictly extract a Visual Continuity Bible from attached role-labeled reference images (product packaging colors, exact label text, shape/material, talent appearance, unified lighting) and lock every scene to it while enforcing Physics Consistency Check (realistic mass inertia, biomechanical constraint adherence, solid-contact mechanics without clipping, zero floaty motion). Never use generic "Stop scrolling" or "Jangan skip dulu" clichés in Scene 1. Return strictly valid JSON matching the schema.'
      : 'You are an elite UGC video R&D strategist and storyboard scriptwriter. Extract a Visual Continuity Bible from attached role-labeled reference images and keep every scene consistent with it. Never use generic "Stop scrolling" or "Jangan skip dulu" clichés in Scene 1. Return strictly valid JSON matching the schema.';

    const rawText = await generateWithFallback(
      prompt,
      config,
      systemPrompt,
      20000,
      allReferenceImages,
      normalizedRoles
    );

    const parsedData = parseSafeJson<any>(rawText);
    if (parsedData && Array.isArray(parsedData.scenes) && parsedData.scenes.length > 0) {
      if (!parsedData.caption || typeof parsedData.caption !== 'string') {
        parsedData.caption = formatShortCaption(productName, category, keySellingPoints, platform, tone);
      } else if (parsedData.caption.length > 150) {
        const inlineTags = parsedData.caption.match(/#[a-zA-Z0-9_]+/g) || [];
        const bodyOnly = parsedData.caption.replace(/#[a-zA-Z0-9_]+/g, '').trim();
        const nicheTags = buildNicheHashtags(productName, category, keySellingPoints, platform);
        parsedData.caption = fitCaptionWithHashtags(
          bodyOnly,
          inlineTags.length > 0 ? inlineTags : nicheTags,
          150
        );
      }

      // Sanitize Scene 1 if the model accidentally slipped in any "Stop scrolling" / "Jangan skip" cliché
      const sanitizedScenes = sanitizeClicheSceneOne(
        parsedData.scenes,
        productName,
        keySellingPoints,
        category,
        isHandsOnly
      );

      const refTotal = Math.max(1, totalRefCount);
      const vbRaw = parsedData.visualBible || {};
      const visualBible: VisualContinuityBible = {
        packagingColors:
          typeof vbRaw.packagingColors === 'string' && vbRaw.packagingColors.trim()
            ? vbRaw.packagingColors.trim()
            : `Warna & aksen kemasan asli ${productName} sesuai foto referensi terlampir`,
        exactLabelText:
          typeof vbRaw.exactLabelText === 'string' && vbRaw.exactLabelText.trim()
            ? vbRaw.exactLabelText.trim()
            : brandName
            ? `${brandName} ${productName}`
            : productName,
        productShapeMaterial:
          typeof vbRaw.productShapeMaterial === 'string' && vbRaw.productShapeMaterial.trim()
            ? vbRaw.productShapeMaterial.trim()
            : `Bentuk fisik, tutup, dan material kemasan asli ${productName} tanpa distorsi`,
        talentAppearance:
          typeof vbRaw.talentAppearance === 'string' && vbRaw.talentAppearance.trim()
            ? vbRaw.talentAppearance.trim()
            : isHandsOnly
            ? 'Faceless (hanya tangan rapi dengan 5 jari anatomis proporsional)'
            : `Talent persona ${persona} konsisten wajah, gaya rambut/hijab, dan pakaian dari awal hingga akhir`,
        environmentLighting:
          typeof vbRaw.environmentLighting === 'string' && vbRaw.environmentLighting.trim()
            ? vbRaw.environmentLighting.trim()
            : 'Single unified 45° directional window/softbox light, warm natural ambient occlusion, matching cast shadows',
        negativePromptGlobal:
          typeof vbRaw.negativePromptGlobal === 'string' && vbRaw.negativePromptGlobal.trim()
            ? vbRaw.negativePromptGlobal.trim()
            : 'no altered brand text, no gibberish label, no packaging distortion, no extra fingers, no clipping, no floating zero-G motion, no lighting jump',
      };
      parsedData.visualBible = visualBible;

      // Ensure every scene has popupText, role-mapped referencedImageIndexes, transitionBridge, negativePrompt, googleFlowPrompt & imageReferenceNote
      parsedData.scenes = sanitizedScenes.map((sc: any, idx: number) => {
        const angle = sc.cameraAngle || 'Medium Shot';
        const rawIndexes = Array.isArray(sc.referencedImageIndexes)
          ? sc.referencedImageIndexes
              .map((n: any) => Number(n))
              .filter((n: number, pos: number, arr: number[]) => Number.isInteger(n) && n >= 1 && n <= refTotal && arr.indexOf(n) === pos)
          : [];
        const referencedImageIndexes =
          rawIndexes.length > 0
            ? rawIndexes
            : selectSceneReferenceIndexes(angle, normalizedRoles, refTotal, idx, sanitizedScenes.length);
        const refTag = formatReferenceTagsForScene(referencedImageIndexes, normalizedRoles, productName);

        let popupText =
          sc.popupText && typeof sc.popupText === 'string' && sc.popupText.trim() && sc.popupText.trim() !== '-'
            ? sc.popupText.trim()
            : '';

        if (!popupText) {
          const overlayMatch = sc.googleFlowPrompt && typeof sc.googleFlowPrompt === 'string'
            ? sc.googleFlowPrompt.match(/On-Screen Pop-up Text Overlay:\s*["']?([^"'\-\}\]]+)["']?/i) ||
              sc.googleFlowPrompt.match(/Text Overlay:\s*["']?([^"'\-\}\]]+)["']?/i) ||
              sc.googleFlowPrompt.match(/popup text:\s*["']?([^"'\-\}\]]+)["']?/i)
            : null;
          if (overlayMatch && overlayMatch[1] && overlayMatch[1].trim()) {
            popupText = overlayMatch[1].trim();
          } else {
            popupText =
              idx === 0
                ? chosenHookArchetype.buildSceneOne({
                    productName,
                    usp: keySellingPoints,
                    category,
                    isHandsOnly,
                    tone,
                  }).popupText
                : idx === sanitizedScenes.length - 1
                ? (isShopee ? 'KLIK KERANJANG OREN DI BAWAH! 🛒👇' : (isTikTok ? 'CEK KERANJANG KUNING SEKARANG! 🛒👇' : 'KLIK KERANJANG DI BAWAH SEKARANG! 🛒👇'))
                : '';
          }
        }

        const visual = sc.visualAction || 'Kreator memperlihatkan manfaat produk secara otentik.';
        const negativePrompt =
          typeof sc.negativePrompt === 'string' && sc.negativePrompt.trim()
            ? sc.negativePrompt.trim()
            : visualBible.negativePromptGlobal;
        const transitionBridge =
          typeof sc.transitionBridge === 'string' && sc.transitionBridge.trim()
            ? sc.transitionBridge.trim()
            : idx === 0
            ? `Mulai dengan fokus ${productName} → arahkan ke transisi detail adegan berikutnya.`
            : idx === sanitizedScenes.length - 1
            ? `Sambung pose produk dari adegan ${idx} → akhiri menunjuk keranjang sambil mengunci posisi kemasan.`
            : `Lanjutkan pose akhir adegan ${idx} dengan pencahayaan seragam → siapkan transisi menuju adegan ${idx + 2}.`;

        const physicsTokens = enforcePhysicsCheck
          ? 'strict physical laws, realistic mass inertia, biomechanical constraint adherence, solid-contact gravity without clipping, consistent directional lighting with matching cast shadows, authentic camera motion, zero floaty artifacts, zero morphing, photorealistic 9:16 vertical 4k 60fps'
          : 'natural product showcase, consistent lighting, photorealistic 9:16 vertical 4k 60fps';

        let flowPrompt = sc.googleFlowPrompt && typeof sc.googleFlowPrompt === 'string' ? sc.googleFlowPrompt.trim() : '';
        if (!flowPrompt) {
          flowPrompt = `${refTag} Scene ${idx + 1} (${angle}): ${visual} - Visual Lock: exact label "${visualBible.exactLabelText}", colors (${visualBible.packagingColors}), lighting (${visualBible.environmentLighting}) - On-Screen Pop-up Text Overlay: "${popupText}" - ${physicsTokens}.`;
        } else {
          if (/\[Image\s+\d+[^\]]*\]/i.test(flowPrompt)) {
            flowPrompt = flowPrompt.replace(/(?:\[Image\s+\d+[^\]]*\]\s*)+/i, `${refTag} `);
          } else {
            flowPrompt = `${refTag} ${flowPrompt}`;
          }
          if (!/exact label|packaging|visual lock/i.test(flowPrompt)) {
            flowPrompt = `${flowPrompt} - Visual Lock: exact label "${visualBible.exactLabelText}" (${visualBible.packagingColors})`;
          }
          const hasOverlay = /on-screen pop-up text overlay|text overlay|popup text/i.test(flowPrompt);
          if (!hasOverlay) {
            flowPrompt = `${flowPrompt} - On-Screen Pop-up Text Overlay: "${popupText}"`;
          }
          if (
            enforcePhysicsCheck &&
            (!/realistic mass inertia/i.test(flowPrompt) || !/biomechanical constraint adherence/i.test(flowPrompt))
          ) {
            flowPrompt = `${flowPrompt} - ${physicsTokens}`;
          }
        }

        const refDesc = referencedImageIndexes
          .map((n: number) => `#${n} (${getReferenceRoleLabel(normalizedRoles[n - 1], true)})`)
          .join(', ');
        const defaultRefNote =
          refTotal > 1
            ? `Kunci visual mengikuti Gambar Referensi ${refDesc}`
            : 'Pastikan Produk sesuai Gambar referensi yang sudah di attached';

        return {
          ...sc,
          cameraAngle: angle,
          visualAction: visual,
          popupText,
          referencedImageIndexes,
          transitionBridge,
          negativePrompt,
          googleFlowPrompt: flowPrompt,
          imageReferenceNote: defaultRefNote,
        };
      });

      parsedData.scenes = ensureVariedStoryboardScenes(
        parsedData.scenes,
        productName,
        keySellingPoints,
        platform
      );

      return NextResponse.json({
        success: true,
        data: parsedData,
        source: 'gemini',
        physicsConsistencyCheck: enforcePhysicsCheck,
      });
    }

    // High quality offline fallback generator
    const fallbackData = generateRichFallback(
      category,
      productName,
      targetDuration,
      targetAudience,
      keySellingPoints,
      targetSceneCount,
      cameraAngleStyle,
      preferredCameraAngles,
      referenceImage,
      platform,
      allReferenceImages.length > 0
        ? allReferenceImages
        : Array.from({ length: Math.max(1, totalRefCount) }, (_, i) => `Image ${i + 1}`),
      enforcePhysicsCheck,
      tone,
      normalizedRoles
    );

    return NextResponse.json({
      success: true,
      data: fallbackData,
      source: 'smart-template',
    });
  } catch (error: any) {
    console.error('Server error in generate-storyboard:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    return await handleGenerateStoryboardRequest(body);
  } catch (error: any) {
    return await handleGenerateStoryboardRequest({});
  }
}

export async function GET(req: NextRequest) {
  try {
    const payloadParam = req.nextUrl.searchParams.get('payload');
    const body = payloadParam ? JSON.parse(payloadParam) : {};
    return await handleGenerateStoryboardRequest(body);
  } catch (error: any) {
    return await handleGenerateStoryboardRequest({});
  }
}

