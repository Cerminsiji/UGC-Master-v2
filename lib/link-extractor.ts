/**
 * Link Extractor Utility for UGC Video Script & Storyboard Generator
 * Specializes in extracting real product metadata from TikTok Shop, Tokopedia, Shopee,
 * and eCommerce affiliate links.
 */

export interface ExtractedLinkData {
  originalUrl: string;
  finalUrl: string;
  platform: 'TikTok' | 'Tokopedia' | 'Shopee' | 'Lazada' | 'Blibli' | 'General';
  title?: string;
  ogTitle?: string;
  ogDescription?: string;
  metaDescription?: string;
  ogImage?: string;
  productName?: string;
  brand?: string;
  price?: string;
  currency?: string;
  rating?: string;
  rawJsonLd?: any;
  cleanedSummary?: string;
  success: boolean;
  error?: string;
}

// Decode basic HTML entities
function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
    .trim();
}

/**
 * Extract URL from input string.
 * Supports standard https:// links as well as domain-only shortlinks like
 * vt.tiktok.com/XYZ, tokopedia.link/XYZ, shope.ee/XYZ.
 */
export function extractUrlFromInput(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // 1. Standard http(s) link
  const httpMatch = trimmed.match(/https?:\/\/[^\s"'<>]+/i);
  if (httpMatch) {
    return httpMatch[0].replace(/[.,;:!?)]+$/, '');
  }

  // 2. Domain-only link (common in mobile copy-paste)
  const domainMatch = trimmed.match(
    /\b((?:[a-z0-9-]+\.)*(?:vt\.tiktok\.com|tiktok\.com|tokopedia\.link|tokopedia\.com|tkp\.me|shopee\.co\.id|shope\.ee|s\.shopee\.co\.id|lazada\.co\.id|blibli\.com|blibli\.app\.link)\/[^\s"'<>]*)/i
  );
  if (domainMatch) {
    return `https://${domainMatch[1].replace(/[.,;:!?)]+$/, '')}`;
  }

  return null;
}

/**
 * Identify eCommerce platform from URL
 */
export function detectPlatform(url: string): ExtractedLinkData['platform'] {
  const lower = url.toLowerCase();
  if (lower.includes('tiktok.com') || lower.includes('vt.tiktok.com')) return 'TikTok';
  if (lower.includes('tokopedia.com') || lower.includes('tokopedia.link') || lower.includes('tkp.me')) return 'Tokopedia';
  if (lower.includes('shopee.co.id') || lower.includes('shope.ee') || lower.includes('shopee.com')) return 'Shopee';
  if (lower.includes('lazada.co.id') || lower.includes('s.lazada.co.id')) return 'Lazada';
  if (lower.includes('blibli.com') || lower.includes('blibli.app.link')) return 'Blibli';
  return 'General';
}

/**
 * Extract product & shop intelligence from Indonesian marketplace share-text
 * (e.g. "Beli [Produk] di [Toko] Tokopedia", "Dapatkan [Produk] seharga Rp... di Shopee")
 */
export function extractShareTextIntelligence(input: string): {
  shareProductName?: string;
  shareBrand?: string;
  sharePrice?: string;
} {
  if (!input) return {};

  // Tokopedia share pattern: "Beli Somethinc Niacinamide Serum 20ml di Somethinc Official Tokopedia..."
  const tokoMatch = input.match(/Beli\s+(.+?)\s+di\s+(.+?)(?:\s+Tokopedia|\.|\s+https?)/i);
  if (tokoMatch && tokoMatch[1]) {
    const rawProd = tokoMatch[1].replace(/^(produk|barang)\s+/i, '').trim();
    const rawBrand = tokoMatch[2] ? tokoMatch[2].replace(/Tokopedia.*$/i, '').trim() : undefined;
    return {
      shareProductName: cleanMarketplaceProductName(rawProd, 'Tokopedia'),
      shareBrand: rawBrand,
    };
  }

  // Shopee share pattern: "Dapatkan Skintific 5X Ceramide seharga Rp129.000 hanya di Shopee! ..."
  const shopeeMatch = input.match(/(?:Dapatkan|Beli)\s+(.+?)(?:\s+seharga\s+(Rp[\d.,]+))?(?:\s+hanya di Shopee|\s+di Shopee|\.|\s+https?)/i);
  if (shopeeMatch && shopeeMatch[1]) {
    return {
      shareProductName: cleanMarketplaceProductName(shopeeMatch[1], 'Shopee'),
      sharePrice: shopeeMatch[2] ? shopeeMatch[2].replace(/[^\d]/g, '') : undefined,
    };
  }

  return {};
}

/**
 * Extract slug intelligence from URL paths (e.g. tokopedia.com/store/product-name-slug)
 */
function extractSlugIntelligence(url: string, platform: string): { slugName?: string; shopName?: string } {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    const segments = pathname.split('/').filter(Boolean);

    if (platform === 'Tokopedia' && segments.length >= 2) {
      const shopName = segments[0].replace(/[-_]/g, ' ');
      const rawSlug = segments[1];
      const slugName = rawSlug
        .replace(/[-_]/g, ' ')
        .replace(/\b(promo|diskon|termurah|terlaris|original|bpom|ready|terbaru|official|store)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
      return { slugName: capitalizeWords(slugName), shopName: capitalizeWords(shopName) };
    }

    if (platform === 'Shopee') {
      const lastSegment = segments[segments.length - 1] || '';
      if (lastSegment && !lastSegment.startsWith('i.')) {
        const slugName = lastSegment
          .replace(/-i\.\d+\.\d+/g, '')
          .replace(/[-_]/g, ' ')
          .trim();
        return { slugName: capitalizeWords(slugName) };
      }
    }

    // Generic last path segment
    if (segments.length > 0) {
      const candidate = segments[segments.length - 1]
        .replace(/\.(html|php|jsp)$/i, '')
        .replace(/[-_]/g, ' ')
        .trim();
      if (candidate.length > 5 && !/^\d+$/.test(candidate)) {
        return { slugName: capitalizeWords(candidate) };
      }
    }
  } catch {
    // Ignore invalid url parse
  }
  return {};
}

function capitalizeWords(str: string): string {
  if (!str) return '';
  return str
    .split(' ')
    .filter(Boolean)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ');
}

// Check if a candidate name is merely a generic boilerplate marketplace title
const JUNK_TITLES = [
  'tokopedia',
  'situs jual beli online terlengkap',
  'situs belanja online terlengkap',
  'tiktok - make your day',
  'tiktok',
  'shopee indonesia',
  'shopee',
  'access denied',
  'robot check',
  'just a moment',
  'security challenge',
  'halaman tidak ditemukan',
  '404 not found',
  'attention required',
  'jual beli online',
];

function isJunkTitle(title: string): boolean {
  if (!title) return true;
  const lower = title.toLowerCase().trim();
  if (lower.length < 3) return true;
  return JUNK_TITLES.some((junk) => lower === junk || lower.startsWith(junk) || lower.includes('make your day'));
}

/**
 * Clean marketplace titles of standard spam prefixes and trailing brand boilerplate
 */
export function cleanMarketplaceProductName(rawTitle: string, platform?: string): string {
  if (!rawTitle) return '';
  let cleaned = decodeHtmlEntities(rawTitle);

  // Remove platform-specific trailing branding
  cleaned = cleaned
    .replace(/\|\s*Tokopedia.*$/i, '')
    .replace(/-\s*Tokopedia.*$/i, '')
    .replace(/\|\s*TikTok Shop.*$/i, '')
    .replace(/-\s*TikTok Shop.*$/i, '')
    .replace(/\|\s*TikTok.*$/i, '')
    .replace(/-\s*TikTok.*$/i, '')
    .replace(/\|\s*Shopee Indonesia.*$/i, '')
    .replace(/-\s*Shopee Indonesia.*$/i, '')
    .replace(/\|\s*Lazada Indonesia.*$/i, '')
    .replace(/\|\s*Blibli.*$/i, '');

  // Remove common Indonesian eCommerce prefix words
  cleaned = cleaned
    .replace(/^(Jual|Beli|Promo|Diskon|Dapatkan|Grosir|Ready|Murah|Spill|COD|Racun)\s+/gi, '')
    .replace(/^(Jual\s+|Beli\s+)/gi, '');

  // Remove location/city prefixes or suffixes often inserted by Tokopedia (e.g. "- Jakarta Barat - Official Store")
  cleaned = cleaned.replace(/-\s*(Kota\s+[A-Za-z\s]+|Jakarta\s+[A-Za-z]+|Bandung|Surabaya|Medan|Semarang)\s*-\s*[^|]+/gi, '');

  // Clean trailing dashes or bars
  cleaned = cleaned.replace(/[\-|–]\s*$/, '').trim();

  // Remove excessive whitespace & clean up
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

/**
 * Deep extract link metadata with redirects, shortlink resolution, social crawlers,
 * TikTok oEmbed, and HTML head analysis.
 */
export async function extractProductFromLink(
  rawInputUrl: string,
  timeoutMs = 8500
): Promise<ExtractedLinkData> {
  const urlCandidate = extractUrlFromInput(rawInputUrl) || rawInputUrl.trim();
  const normalizedUrl = urlCandidate.startsWith('http://') || urlCandidate.startsWith('https://')
    ? urlCandidate
    : `https://${urlCandidate}`;

  const platform = detectPlatform(normalizedUrl);

  const result: ExtractedLinkData = {
    originalUrl: normalizedUrl,
    finalUrl: normalizedUrl,
    platform,
    success: false,
  };

  // 1. Check share text intelligence from the original input if it contained accompanying text
  const shareIntel = extractShareTextIntelligence(rawInputUrl);
  if (shareIntel.shareProductName) {
    result.productName = shareIntel.shareProductName;
    result.success = true;
  }
  if (shareIntel.shareBrand) {
    result.brand = shareIntel.shareBrand;
  }
  if (shareIntel.sharePrice) {
    result.price = shareIntel.sharePrice;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Social media preview crawler user agent (Facebook/WhatsApp/Googlebot)
    // Most platforms eagerly return OpenGraph HTML & JSON-LD to social crawlers
    const headers = {
      'User-Agent':
        'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php) Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      'Cache-Control': 'no-cache',
    };

    // Step A: Perform fetch with redirect follow
    const response = await fetch(normalizedUrl, {
      method: 'GET',
      headers,
      redirect: 'follow',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    result.finalUrl = response.url || normalizedUrl;
    result.platform = detectPlatform(result.finalUrl);

    // If response was redirected, check if location header was present
    const responseLocation = response.headers.get('location');
    if (responseLocation) {
      result.finalUrl = responseLocation;
      result.platform = detectPlatform(result.finalUrl);
    }

    // Step B: For TikTok links, also try TikTok official oEmbed API
    if (result.platform === 'TikTok') {
      try {
        const oembedTarget = result.finalUrl || normalizedUrl;
        const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(oembedTarget)}`;
        const oembedRes = await fetch(oembedUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(3500),
        });
        if (oembedRes.ok) {
          const oembedData = await oembedRes.json();
          if (oembedData.title) {
            const cleanTitle = cleanMarketplaceProductName(oembedData.title, 'TikTok');
            if (cleanTitle && !isJunkTitle(cleanTitle)) {
              result.ogTitle = cleanTitle;
              if (!result.productName) result.productName = cleanTitle;
            }
          }
          if (oembedData.author_name && !result.brand) {
            result.brand = oembedData.author_name;
          }
          if (oembedData.thumbnail_url && !result.ogImage) {
            result.ogImage = oembedData.thumbnail_url;
          }
        }
      } catch {
        // oEmbed error non-blocking
      }
    }

    // Read initial HTML text (read up to 300KB for fast response)
    const rawHtml = await response.text();
    const htmlSlice = rawHtml.slice(0, 300000);

    // 1. Extract <title>
    const titleMatch = htmlSlice.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      const candidateTitle = decodeHtmlEntities(titleMatch[1].trim());
      if (!isJunkTitle(candidateTitle)) {
        result.title = candidateTitle;
      }
    }

    // 2. Extract OpenGraph & Twitter Meta tags
    const metaTagRegex =
      /<meta\s+[^>]*(?:property|name)=["']([^"']+)["'][^>]*content=["']([^"']*)["'][^>]*>|<meta\s+[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']([^"']+)["'][^>]*>/gi;
    let match;
    const metaMap: Record<string, string> = {};

    while ((match = metaTagRegex.exec(htmlSlice)) !== null) {
      const key = (match[1] || match[4] || '').toLowerCase();
      const val = match[2] || match[3] || '';
      if (key && val && !metaMap[key]) {
        metaMap[key] = decodeHtmlEntities(val.trim());
      }
    }

    if (metaMap['og:title'] && !isJunkTitle(metaMap['og:title'])) {
      result.ogTitle = metaMap['og:title'];
    }
    if (metaMap['twitter:title'] && !result.ogTitle && !isJunkTitle(metaMap['twitter:title'])) {
      result.ogTitle = metaMap['twitter:title'];
    }

    if (metaMap['og:description']) result.ogDescription = metaMap['og:description'];
    if (metaMap['description']) result.metaDescription = metaMap['description'];
    if (metaMap['twitter:description'] && !result.ogDescription) {
      result.ogDescription = metaMap['twitter:description'];
    }

    if (metaMap['og:image']) result.ogImage = metaMap['og:image'];
    if (metaMap['product:price:amount']) result.price = metaMap['product:price:amount'];
    if (metaMap['product:price:currency']) result.currency = metaMap['product:price:currency'];
    if (metaMap['product:brand'] && !result.brand) result.brand = metaMap['product:brand'];

    // 3. Extract JSON-LD Schema.org data
    const jsonLdRegex = /<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let jsonMatch;
    while ((jsonMatch = jsonLdRegex.exec(htmlSlice)) !== null) {
      try {
        const parsedJson = JSON.parse(jsonMatch[1]);
        const items = Array.isArray(parsedJson) ? parsedJson : [parsedJson];
        for (const item of items) {
          if (
            item['@type'] === 'Product' ||
            (typeof item['@type'] === 'string' && item['@type'].toLowerCase().includes('product'))
          ) {
            result.rawJsonLd = item;
            if (item.name && !result.productName && !isJunkTitle(item.name)) {
              result.productName = item.name;
            }
            if (item.description && !result.metaDescription) {
              result.metaDescription = item.description;
            }
            if (item.brand && !result.brand) {
              result.brand = typeof item.brand === 'string' ? item.brand : item.brand.name || result.brand;
            }
            if (item.image && !result.ogImage) {
              result.ogImage = Array.isArray(item.image) ? item.image[0] : item.image;
            }
            if (item.offers) {
              const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
              if (offer && offer.price) result.price = String(offer.price);
              if (offer && offer.priceCurrency) result.currency = String(offer.priceCurrency);
            }
            break;
          }
        }
      } catch {
        // Skip malformed json-ld
      }
    }

    // 4. Slug intelligence from resolved final URL
    const { slugName, shopName } = extractSlugIntelligence(result.finalUrl, result.platform);
    if (shopName && !result.brand) {
      result.brand = shopName;
    }

    // 5. Determine best Product Name candidate
    let candidateName = result.productName || result.ogTitle || result.title || '';
    if (isJunkTitle(candidateName) && slugName) {
      candidateName = slugName;
    }
    if (!candidateName && slugName) {
      candidateName = slugName;
    }

    if (candidateName && !isJunkTitle(candidateName)) {
      result.productName = cleanMarketplaceProductName(candidateName, result.platform);
      result.success = true;
    }

    // Compile a cleaned summary for prompt / UI display
    const summaryParts: string[] = [];
    if (result.productName) summaryParts.push(`Nama Produk: ${result.productName}`);
    if (result.brand) summaryParts.push(`Brand / Toko: ${result.brand}`);
    if (result.price) summaryParts.push(`Harga: ${result.currency || 'Rp'} ${result.price}`);
    if (result.ogDescription || result.metaDescription) {
      summaryParts.push(`Deskripsi Produk: ${result.ogDescription || result.metaDescription}`);
    }
    if (slugName && slugName !== result.productName) {
      summaryParts.push(`Slug URL: ${slugName}`);
    }

    result.cleanedSummary = summaryParts.join('\n');
    return result;
  } catch (err: any) {
    // If network fetch fails (e.g. timeout or blocked IP), extract slug from URL string itself
    const { slugName, shopName } = extractSlugIntelligence(normalizedUrl, platform);
    if (slugName) {
      result.productName = cleanMarketplaceProductName(slugName, platform);
      if (shopName) result.brand = shopName;
      result.cleanedSummary = `Nama Produk (ekstraksi slug): ${result.productName}${shopName ? ` | Toko: ${shopName}` : ''}`;
      result.success = true;
      return result;
    }

    result.error = err.message || 'Gagal mengambil data dari URL';
    return result;
  }
}
