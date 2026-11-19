import { NextRequest, NextResponse } from 'next/server';
import { Type } from '@google/genai';
import {
  generateWithFallback,
  parseSafeJson,
  formatShortCaption,
  buildNicheHashtags,
  fitCaptionWithHashtags,
  getVoiceToneDirective,
} from '@/lib/gemini-ugc';
import { UGC_CATEGORIES } from '@/data/categories';

const CAPTION_ANGLES = [
  {
    name: 'Curiosity Gap (Penasaran)',
    directive: 'Buka dengan fakta unik atau rahasia pemakaian yang bikin penonton kepo cek keranjang.',
  },
  {
    name: 'Honest Confession (Pengakuan Jujur)',
    directive: 'Nada curhat tulus ala "nyesel baru tahu sekarang" atau "awalnya skeptis ternyata kepake banget".',
  },
  {
    name: 'FOMO Restock & Urgency',
    directive: 'Tekankan stok sering ludes / mumpung promo & voucher gratis ongkir masih aktif hari ini.',
  },
  {
    name: 'Reply Netizen ("Yang Kemarin Nanya...")',
    directive: 'Gaya membalas pertanyaan DM/komentar penonton sambil mengarahkan langsung ke keranjang.',
  },
  {
    name: 'Smart Buyer / Value Math',
    directive: 'Sorot perbandingan kualitas mewah vs harga hemat yang bikin pembeli merasa cerdas.',
  },
  {
    name: 'Micro-Pain Relief',
    directive: 'Sentuh kerepotan harian spesifik yang langsung beres berkat produk ini.',
  },
  {
    name: 'Social Spill (Ditanyain Teman)',
    directive: 'Cerita singkat ditanya orang kantor/sahabat gara-gara hasil nyata pemakaian produk.',
  },
  {
    name: 'Direct Punchy CTA',
    directive: 'Kalimat super ringkas, padat, langsung sebut manfaat utama + ajakan klik keranjang.',
  },
];

function extractHashtagsFromText(text: string): string[] {
  const matches = (text || '').match(/#[a-zA-Z0-9_]+/g);
  return matches ? Array.from(new Set(matches)) : [];
}

async function handleGenerateCaptionRequest(body: any = {}) {
  try {
    const {
      productName = 'Produk Viral',
      category = 'UGC',
      keySellingPoints = '',
      targetAudience = '',
      tone = '',
      hookDialog = '',
      preferredAngle = '',
      detectedTags = [],
    } = body || {};

    const rawPlatform = body.targetPlatform || body.platform || 'TikTok Shop';
    const platform = typeof rawPlatform === 'string' ? rawPlatform.trim() : 'TikTok Shop';
    const isShopee = platform.toLowerCase().includes('shopee');
    const isTikTok = platform.toLowerCase().includes('tiktok');
    const ctaCart = isShopee
      ? 'keranjang oren / klik keranjang di bawah (DILARANG KERAS menyebut keranjang kuning)'
      : isTikTok
      ? 'keranjang kuning / klik keranjang di bawah'
      : 'klik keranjang di bawah / link bio';

    const catMatch = UGC_CATEGORIES.find(
      (c) =>
        c.name.toLowerCase() === String(category).toLowerCase() ||
        c.id.toLowerCase() === String(category).toLowerCase()
    );
    const categoryTags = catMatch?.categoryHashtags || [];
    const extraTags = [
      ...categoryTags,
      ...(Array.isArray(detectedTags) ? detectedTags : []),
    ];

    const nicheAndPlatformTags = buildNicheHashtags(
      productName,
      category,
      keySellingPoints,
      platform,
      extraTags
    );

    const shuffledAngles = [...CAPTION_ANGLES].sort(() => Math.random() - 0.5);
    const chosenAngle =
      CAPTION_ANGLES.find((a) => a.name.toLowerCase() === String(preferredAngle).toLowerCase()) ||
      shuffledAngles[0];
    const altAngles = shuffledAngles.filter((a) => a.name !== chosenAngle.name).slice(0, 2);
    const toneDirective = getVoiceToneDirective(tone);

    const prompt = `Buatkan 1 caption utama + 2 variasi alternatif (total 3 variasi sudut copywriting berbeda) untuk media sosial (${platform}) yang super menjual, natural, non-monoton, ada CTA ke ${ctaCart}, dan 3-4 hashtag campuran platform + niche (${nicheAndPlatformTags.join(' ')}):

DATA PRODUK:
- Produk: ${productName}
- Kategori: ${category}
- USP: ${keySellingPoints || 'Kualitas unggulan, praktis, hasil nyata'}
- Target Audiens: ${targetAudience || 'Pengguna media sosial Indonesia'}
${hookDialog ? `- Hook Adegan 1 (harus nyambung): "${hookDialog}"` : ''}
- Voice Tone Kreator: ${tone || 'Santai & Natural'} (${toneDirective})

ANGLE UTAMA YANG DIPILIH: ${chosenAngle.name} — ${chosenAngle.directive}
ANGLE VARIASI TAMBAHAN:
1. ${altAngles[0]?.name}: ${altAngles[0]?.directive}
2. ${altAngles[1]?.name}: ${altAngles[1]?.directive}

ATURAN PALING KRUSIAL:
1. TOTAL PANJANG KARAKTER MASING-MASING CAPTION TERMASUK HASHTAG DAN SPASI WAJIB MAKSIMAL 150 KARAKTER (<= 150 karakter)!
2. JANGAN memotong kata atau hashtag di tengah. Campurkan hashtag platform (${isShopee ? '#ShopeeVideo #ShopeeHaul' : isTikTok ? '#TikTokShop #fyp' : '#ReelsViral #fyp'}) dan hashtag niche spesifik produk/kategori.
3. ${isShopee ? 'WAJIB gunakan "keranjang oren" atau "klik keranjang di bawah". DILARANG KERAS menulis "keranjang kuning"!' : 'Gunakan call-to-action yang relevan dengan platform.'}
4. Pastikan setiap variasi terdengar seperti manusia/kreator asli Indonesia, tidak kaku dan tidak berulang polanya.`;

    const config = {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          caption: {
            type: Type.STRING,
            description: 'Caption utama lengkap dengan hashtag (MAKSIMAL 150 KARAKTER)',
          },
          angleUsed: {
            type: Type.STRING,
            description: 'Nama angle viral yang dipakai',
          },
          hashtags: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Daftar hashtag yang disertakan',
          },
          variations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '3 variasi caption berbeda sudut (masing-masing MAKSIMAL 150 KARAKTER)',
          },
        },
        required: ['caption', 'hashtags'],
      },
    };

    const raw = await generateWithFallback(
      prompt,
      config,
      'You are an expert Indonesian social media UGC copywriter. Create varied, non-monotonous viral captions strictly <= 150 characters with balanced platform + niche hashtags. Never truncate hashtags mid-word.'
    );

    const parsed = parseSafeJson<any>(raw);

    const sanitizeOneCaption = (rawCap: string, tagsFallback: string[]): string => {
      const cleaned = (rawCap || '').replace(/\s+/g, ' ').trim();
      if (!cleaned) {
        return formatShortCaption(productName, category, keySellingPoints, platform, tone);
      }
      if (cleaned.length <= 150) return cleaned;
      const inlineTags = extractHashtagsFromText(cleaned);
      const bodyOnly = cleaned.replace(/#[a-zA-Z0-9_]+/g, '').trim();
      return fitCaptionWithHashtags(
        bodyOnly,
        inlineTags.length > 0 ? inlineTags : tagsFallback,
        150
      );
    };

    const primaryCaption = parsed?.caption
      ? sanitizeOneCaption(parsed.caption, nicheAndPlatformTags)
      : formatShortCaption(productName, category, keySellingPoints, platform, tone);

    const rawVariations: string[] = Array.isArray(parsed?.variations) ? parsed.variations : [];
    const normalizedVariations = [
      primaryCaption,
      ...rawVariations.map((v) => sanitizeOneCaption(v, nicheAndPlatformTags)),
      formatShortCaption(productName, category, keySellingPoints, platform, tone),
      formatShortCaption(productName, category, keySellingPoints, platform, 'Spill Racun Enerjik'),
    ];
    const uniqueVariations = Array.from(new Set(normalizedVariations.filter(Boolean))).slice(0, 3);

    const finalHashtags = Array.from(
      new Set([
        ...extractHashtagsFromText(primaryCaption),
        ...(Array.isArray(parsed?.hashtags)
          ? parsed.hashtags.map((t: string) => (t.startsWith('#') ? t : `#${t.replace(/^#+/, '')}`))
          : []),
        ...nicheAndPlatformTags,
      ])
    ).slice(0, 5);

    return NextResponse.json({
      success: true,
      caption: primaryCaption,
      characterCount: primaryCaption.length,
      hashtags: finalHashtags,
      angleUsed: parsed?.angleUsed || chosenAngle.name,
      variations: uniqueVariations,
    });
  } catch (error: any) {
    const rawPlatform = body?.targetPlatform || body?.platform || 'TikTok Shop';
    const fallback1 = formatShortCaption(
      body?.productName || 'Produk',
      body?.category || '',
      body?.keySellingPoints || '',
      rawPlatform,
      body?.tone || ''
    );
    const fallback2 = formatShortCaption(
      body?.productName || 'Produk',
      body?.category || '',
      body?.keySellingPoints || '',
      rawPlatform,
      'Skeptis Jadi Yakin'
    );
    const fallback3 = formatShortCaption(
      body?.productName || 'Produk',
      body?.category || '',
      body?.keySellingPoints || '',
      rawPlatform,
      'Edukatif'
    );
    const fallbackTags = buildNicheHashtags(
      body?.productName || 'Produk',
      body?.category || '',
      body?.keySellingPoints || '',
      rawPlatform
    );
    return NextResponse.json({
      success: true,
      caption: fallback1,
      characterCount: fallback1.length,
      hashtags: fallbackTags,
      angleUsed: 'Smart Viral Rotation',
      variations: Array.from(new Set([fallback1, fallback2, fallback3])),
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    return await handleGenerateCaptionRequest(body);
  } catch {
    return await handleGenerateCaptionRequest({});
  }
}

export async function GET(req: NextRequest) {
  try {
    const payloadParam = req.nextUrl.searchParams.get('payload');
    const body = payloadParam ? JSON.parse(payloadParam) : {};
    return await handleGenerateCaptionRequest(body);
  } catch {
    return await handleGenerateCaptionRequest({});
  }
}
