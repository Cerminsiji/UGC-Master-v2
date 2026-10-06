import { NextRequest, NextResponse } from 'next/server';
import { Type } from '@google/genai';
import {
  generateWithFallback,
  parseSafeJson,
  formatShortCaption,
} from '@/lib/gemini-ugc';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      productName = 'Produk Viral',
      category = 'UGC',
      keySellingPoints = '',
      targetAudience = '',
      platform = 'TikTok Shop',
    } = body;

    const prompt = `Buatkan 1 caption postingan media sosial (${platform}) yang super menjual, catchy, ada call-to-action ke keranjang kuning/bio, dan 2-4 hashtag trending untuk:
Produk: ${productName}
Kategori: ${category}
USP: ${keySellingPoints}
Target Audiens: ${targetAudience}

ATURAN PALING KRUSIAL:
TOTAL PANJANG KARAKTER CAPTION TERMASUK HASHTAG DAN SPASI HARUS MAKSIMAL 150 KARAKTER (Character Count <= 150).`;

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
    let finalCaption = parsed?.caption || formatShortCaption(productName, category, keySellingPoints);
    if (finalCaption.length > 150) {
      finalCaption = finalCaption.slice(0, 147) + '...';
    }

    return NextResponse.json({
      success: true,
      caption: finalCaption,
      characterCount: finalCaption.length,
      hashtags: parsed?.hashtags || ['#RacunTikTok', '#fyp', '#TikTokShop'],
    });
  } catch (error: any) {
    const fallbackCaption = formatShortCaption('Produk');
    return NextResponse.json({
      success: true,
      caption: fallbackCaption,
      characterCount: fallbackCaption.length,
      hashtags: ['#RacunTikTok', '#fyp', '#TikTokShop'],
    });
  }
}
