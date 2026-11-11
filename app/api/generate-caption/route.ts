import { NextRequest, NextResponse } from 'next/server';
import { Type } from '@google/genai';
import {
  generateWithFallback,
  parseSafeJson,
  formatShortCaption,
} from '@/lib/gemini-ugc';

async function handleGenerateCaptionRequest(body: any = {}) {
  try {
    const {
      productName = 'Produk Viral',
      category = 'UGC',
      keySellingPoints = '',
      targetAudience = '',
    } = body || {};

    const rawPlatform = body.targetPlatform || body.platform || 'TikTok Shop';
    const platform = typeof rawPlatform === 'string' ? rawPlatform.trim() : 'TikTok Shop';
    const isShopee = platform.toLowerCase().includes('shopee');
    const isTikTok = platform.toLowerCase().includes('tiktok');
    const ctaCart = isShopee
      ? 'keranjang oren / klik keranjang di bawah (DILARANG KERAS menyebut keranjang kuning)'
      : (isTikTok ? 'keranjang kuning / klik keranjang di bawah' : 'klik keranjang di bawah / link bio');

    const prompt = `Buatkan 1 caption postingan media sosial (${platform}) yang super menjual, catchy, ada call-to-action ke ${ctaCart}, dan 2-4 hashtag trending (${isShopee ? '#ShopeeVideo #ShopeeHaul' : (isTikTok ? '#TikTokShop #fyp' : '#fyp #viral')}) untuk:
Produk: ${productName}
Kategori: ${category}
USP: ${keySellingPoints}
Target Audiens: ${targetAudience}

ATURAN PALING KRUSIAL:
1. TOTAL PANJANG KARAKTER CAPTION TERMASUK HASHTAG DAN SPASI HARUS MAKSIMAL 150 KARAKTER (Character Count <= 150).
${isShopee ? '2. Karena platform adalah Shopee, WAJIB gunakan "keranjang oren" atau "klik keranjang di bawah". JANGAN PERNAH gunakan istilah "keranjang kuning"!' : '2. Gunakan call-to-action yang relevan dengan platform.'}`;

    const config = {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          caption: {
            type: Type.STRING,
            description: 'Caption lengkap dengan hashtag (MAKSIMAL 150 KARAKTER)',
          },
          characterCount: {
            type: Type.INTEGER,
            description: 'Jumlah karakter dalam caption',
          },
          hashtags: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Daftar hashtag yang disertakan',
          },
        },
        required: ['caption'],
      },
    };

    const raw = await generateWithFallback(
      prompt,
      config,
      'You are an expert social media copywriter. Keep caption length strictly under 150 characters.'
    );

    const parsed = parseSafeJson<any>(raw);
    let finalCaption = parsed?.caption || formatShortCaption(productName, category, keySellingPoints, platform);
    if (finalCaption.length > 150) {
      finalCaption = finalCaption.slice(0, 147) + '...';
    }

    const defaultHashtags = isShopee
      ? ['#ShopeeVideo', '#ShopeeHaul', '#SpillRacunShopee']
      : ['#TikTokShop', '#RacunTikTok', '#fyp'];

    return NextResponse.json({
      success: true,
      caption: finalCaption,
      characterCount: finalCaption.length,
      hashtags: parsed?.hashtags || defaultHashtags,
    });
  } catch (error: any) {
    const rawPlatform = body?.targetPlatform || body?.platform || 'TikTok Shop';
    const fallbackCaption = formatShortCaption('Produk', '', '', rawPlatform);
    const isShopee = String(rawPlatform).toLowerCase().includes('shopee');
    return NextResponse.json({
      success: true,
      caption: fallbackCaption,
      characterCount: fallbackCaption.length,
      hashtags: isShopee ? ['#ShopeeVideo', '#ShopeeHaul'] : ['#TikTokShop', '#RacunTikTok', '#fyp'],
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

