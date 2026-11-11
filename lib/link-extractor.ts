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
  if (lower.includes('shopee.co.id') || lower.includes('shope.ee') || lower.includes('shopee.com') || lower.includes('s.shopee.co.id')) return 'Shopee';
  if (lower.includes('lazada.co.id') || lower.includes('s.lazada.co.id')) return 'Lazada';
  if (lower.includes('blibli.com') || lower.includes('blibli.app.link')) return 'Blibli';
  return 'General';
}

/**
 * Known Indonesian & Global Brands Registry for high-accuracy brand recognition
 */
export const KNOWN_BRANDS: string[] = [
  // Skincare & Beauty
  'Somethinc', 'Skintific', 'Wardah', 'Glad2Glow', 'Scarlett', 'The Originote', 'Avoskin',
  'Kahf', 'Emina', 'Make Over', 'Hanasui', 'Bioaqua', 'Azarine', 'Whitelab', 'Implora',
  'Dazzle Me', 'Madame Gie', 'NPURE', 'Dear Me Beauty', 'Studio Tropik', 'Facetology',
  'Labore', 'True to Skin', 'COSRX', 'Barenbliss', 'Skinsena', 'Sensatia Botanicals',
  'Skin Game', 'Rose All Day', 'Luxcrime', 'BLP Beauty', 'Mother of Pearl', 'Maybelline',
  'Garnier', 'Nivea', 'Vaseline', 'Cetaphil', 'Cerave', 'Innisfree', 'Laneige',
  // Diet & Health Supplements
  'Sago', 'Flimty', 'Beaudelab', 'Evolene', 'Fitlife', 'Muscle First', 'Tropicana Slim',
  'Anlene', 'Herbilogy', 'Noera', 'Slimfit', 'Youvit', 'Nutrimax', 'Blackmores',
  'Natur-E', 'Vitalong C', 'Enervon-C', 'Green Coffee',
  // Fashion & Apparel
  'Erigo', 'Roughneck', 'Aerostreet', 'Ventela', 'Compass', 'Geoff Max', 'Thanksinsomnia',
  'Screamous', '3Second', 'Cottonology', 'Brodo', 'Heymale', 'Jiniso', 'Hamlin',
  'Guten Inc', 'Maternal Disaster', 'Public Culture', 'Tenue de Attire', 'Uniqlo',
  // Tech & Gadgets
  'Baseus', 'Ugreen', 'Anker', 'Robot', 'Acmic', 'Aukey', 'Orico', 'Soundcore', 'Rexus',
  'Fantech', 'Keychron', 'Logitech', 'Xiaomi', 'Redmi', 'Poco', 'Infinix', 'Realme',
  'Samsung', 'Apple', 'iPhone', 'iPad', 'Asus', 'Lenovo', 'Edifier', 'Vention', 'KiiP', 'Sandisk',
  // Mom & Baby
  'Moell', 'Cussons', 'Pigeon', "Mama's Choice", 'Makuku', 'Sweety', 'MamyPoko', 'Pure Baby', 'Zwitsal',
  // Otomotif & Home
  'RS31', 'Meguiars', 'Turtle Wax', 'Kit', 'Bullsone', 'Motul', 'Lock&Lock', 'Goto', 'Bolde', 'Deerma', 'Tyeso', 'Stanley', 'Philips'
];

export function detectKnownBrand(text: string): string | undefined {
  if (!text) return undefined;
  const lower = ` ${text.toLowerCase()} `;
  for (const b of KNOWN_BRANDS) {
    const brandRegex = new RegExp(`\\b${b.toLowerCase()}\\b`, 'i');
    if (brandRegex.test(lower)) {
      return b;
    }
  }
  return undefined;
}

/**
 * Helper to infer a brand or collection name from a clean Indonesian product title
 * when not found in KNOWN_BRANDS (e.g. "Setelan Arsyilla Klok (Restock)" -> "Arsyilla")
 */
export function inferProductBrandOrCollection(productName: string): string | undefined {
  if (!productName) return undefined;
  const known = detectKnownBrand(productName);
  if (known) return known;

  const cleaned = productName
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = cleaned.split(' ').filter(Boolean);
  if (words.length < 2) return undefined;

  const categoryNouns = new Set([
    'setelan', 'oneset', 'gamis', 'hijab', 'jilbab', 'pashmina', 'bergo', 'khimar', 'mukena',
    'tunik', 'dress', 'abaya', 'kaftan', 'kebaya', 'daster', 'kemeja', 'kaos', 'blouse',
    'kulot', 'celana', 'rok', 'jaket', 'hoodie', 'sweater', 'cardigan', 'outer', 'rompi',
    'sepatu', 'sandal', 'sneakers', 'heels', 'flatshoes', 'tas', 'dompet', 'ransel', 'slingbag',
    'parfum', 'serum', 'moisturizer', 'sunscreen', 'toner', 'cushion', 'lip', 'liptint', 'lipcream',
    'sabun', 'shampoo', 'lotion', 'bodywash', 'kopi', 'teh', 'madu', 'susu', 'helm', 'jam',
    'baju', 'pakaian', 'koko', 'sarung', 'ciput', 'manset',
  ]);

  const genericAdjectives = new Set([
    'wanita', 'pria', 'cewek', 'cowok', 'anak', 'bayi', 'dewasa', 'remaja', 'muslim', 'muslimah',
    'syari', 'jumbo', 'oversize', 'bigsize', 'murah', 'premium', 'original', 'ori', 'import',
    'lokal', 'korea', 'korean', 'terbaru', 'viral', 'kekinian', 'polos', 'motif', 'bunga',
    'salur', 'garis', 'kotak', 'crinkle', 'airflow', 'rayon', 'katun', 'cotton', 'rajut', 'knit',
    'jeans', 'denim', 'kulit', 'ceruty', 'babydoll', 'silk', 'satin', 'linen', 'fleece',
    'panjang', 'pendek', 'lebaran', 'kondangan', 'kerja', 'kantor', 'santai', 'harian', 'tidur',
    'olahraga', 'busui', 'wudhu', 'friendly', 'klok', 'mayung', 'rempel', 'plisket', 'cargo',
    'highwaist', 'cutbray', 'set', 'one', 'paket', 'bundle', 'isi', 'pcs', 'gram', 'ml',
  ]);

  // If first word is a category noun (e.g., "Setelan Arsyilla Klok"), inspect the second word
  const firstLower = words[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  if (categoryNouns.has(firstLower) && words[1]) {
    const secondClean = words[1].replace(/[^a-zA-Z0-9']/g, '');
    const secondLower = secondClean.toLowerCase();
    if (
      secondClean.length >= 3 &&
      /^[A-Z]/.test(secondClean) &&
      !genericAdjectives.has(secondLower) &&
      !categoryNouns.has(secondLower)
    ) {
      return secondClean;
    }
  }

  // Or if first word itself is a proper noun not in categoryNouns or genericAdjectives
  const firstClean = words[0].replace(/[^a-zA-Z0-9']/g, '');
  if (
    firstClean.length >= 3 &&
    /^[A-Z]/.test(firstClean) &&
    !categoryNouns.has(firstLower) &&
    !genericAdjectives.has(firstLower)
  ) {
    return firstClean;
  }

  return undefined;
}

/**
 * Checks if a string is a meaningless shortcode/hash instead of a product name
 * (e.g. "3ZkIq7m", "LoXUMhlJb", "Lo Xumhl Jb", "8u19xz")
 */
export function isLikelyShortcodeOrHash(str: string): boolean {
  if (!str) return true;
  const trimmed = str.trim();
  if (!trimmed) return true;

  // Check if multi-word string is actually a camelCase-split shortlink hash like "Lo Xumhl Jb"
  if (trimmed.includes(' ')) {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    const joined = parts.join('');
    if (parts.length >= 2 && parts.length <= 4 && joined.length <= 14 && /^[a-zA-Z0-9]+$/.test(joined)) {
      const hasVowelLessPart = parts.some((p) => !/[aeiouAEIOU]/.test(p));
      const shortPartsCount = parts.filter((p) => p.length <= 2).length;
      const weirdConsonantCluster = parts.some((p) => /[bcdfghjklmnpqrstvwxyz]{4,}/i.test(p));
      if (hasVowelLessPart || shortPartsCount >= 2 || weirdConsonantCluster) {
        return true;
      }
    }
    if (parts.length >= 2) {
      return false;
    }
  }

  // Single token <= 15 chars with mixed case or digits and no spaces
  if (/^[a-zA-Z0-9_-]{3,15}$/.test(trimmed)) {
    const lower = trimmed.toLowerCase();
    // Known single-word products/brands are not hashes
    if (KNOWN_BRANDS.some((b) => b.toLowerCase() === lower)) return false;
    return true;
  }
  return false;
}

/**
 * Checks if a text snippet is generic marketplace app/homepage boilerplate
 */
export function isGenericMarketplaceFallback(text: string): boolean {
  if (!text) return true;
  const lower = text.toLowerCase().trim();
  if (lower.length < 4) return true;

  const genericSnippets = [
    'aplikasi tokopedia',
    'buka dan kelola toko online',
    'seluruh penjual di indonesia',
    'jutaan produk yang diinginkan langsung dari iphone',
    'situs jual beli online terlengkap',
    'situs belanja online terlengkap',
    'tiktok - make your day',
    'shopee indonesia | situs belanja',
    'jual beli online aman dan nyaman',
    'download tokopedia app',
    'access denied',
    'robot check',
    'just a moment',
    'security challenge',
    'halaman tidak ditemukan',
    '404 not found',
    'attention required',
    'jual beli online',
    'login untuk melanjutkan',
  ];

  return genericSnippets.some((snippet) => lower.includes(snippet));
}

/**
 * Extract product, brand & price intelligence from Indonesian marketplace share-text
 * Supports Shopee, Tokopedia, TikTok Shop, Lazada share formats:
 * - "Cek Setelan Arsyilla Klok (Restock) dengan harga Rp155.000. Dapatkan di Shopee sekarang! https://s.shopee.co.id/LoXUMhlJb"
 * - "Temukan [Produk] seharga Rp... hanya di Shopee!"
 * - "Beli [Produk] di [Toko] Tokopedia..."
 * - "Dapatkan [Produk] seharga Rp... di Shopee"
 */
export function extractShareTextIntelligence(input: string): {
  shareProductName?: string;
  shareBrand?: string;
  sharePrice?: string;
} {
  if (!input) return {};

  // Extract price anywhere in the share text (e.g. "dengan harga Rp155.000", "seharga Rp 129.000", "Rp155.000")
  const priceMatch =
    input.match(/(?:dengan\s+harga|seharga|harga\s+mulai|harga|cuma|hanya)\s*Rp\.?\s*([\d.,]+)/i) ||
    input.match(/\bRp\.?\s*([\d.,]{3,})\b/i);
  const extractedPrice = priceMatch?.[1]
    ? priceMatch[1].replace(/[.,]+$/, '').trim()
    : undefined;

  // 1. Shopee / Universal "Cek / Temukan / Dapatkan [Produk] dengan harga / seharga Rp... Dapatkan di Shopee sekarang!"
  const shopeePriceShareMatch = input.match(
    /(?:Cek|Temukan|Dapatkan|Lihat|Beli)\s+(.+?)\s+(?:dengan\s+harga|seharga|harga\s+mulai|hanya\s+Rp|sekarang\s+hanya\s+Rp)\s*(?:Rp\.?\s*[\d.,]+)?/i
  );
  if (shopeePriceShareMatch && shopeePriceShareMatch[1]) {
    const cleanProd = cleanMarketplaceProductName(shopeePriceShareMatch[1], 'Shopee');
    if (cleanProd && cleanProd.length >= 3 && !isGenericMarketplaceFallback(cleanProd) && !isLikelyShortcodeOrHash(cleanProd)) {
      return {
        shareProductName: cleanProd,
        shareBrand: inferProductBrandOrCollection(cleanProd),
        sharePrice: extractedPrice,
      };
    }
  }

  // 2. Tokopedia share pattern: "Beli Somethinc Niacinamide Serum 20ml di Somethinc Official Tokopedia..."
  const tokoMatch = input.match(/Beli\s+(.+?)\s+di\s+(.+?)(?:\s+Tokopedia|\.|\s+https?)/i);
  if (tokoMatch && tokoMatch[1]) {
    const rawProd = tokoMatch[1].replace(/^(produk|barang)\s+/i, '').trim();
    const rawBrand = tokoMatch[2] ? tokoMatch[2].replace(/Tokopedia.*$/i, '').trim() : undefined;
    const cleanProd = cleanMarketplaceProductName(rawProd, 'Tokopedia');
    if (cleanProd && !isGenericMarketplaceFallback(cleanProd) && !isLikelyShortcodeOrHash(cleanProd)) {
      return {
        shareProductName: cleanProd,
        shareBrand: rawBrand || inferProductBrandOrCollection(cleanProd),
        sharePrice: extractedPrice,
      };
    }
  }

  // 3. Simpler Tokopedia share: "Beli Somethinc Serum di Tokopedia https://..."
  const tokoSimpleMatch = input.match(/Beli\s+(.+?)\s+di\s+Tokopedia/i);
  if (tokoSimpleMatch && tokoSimpleMatch[1]) {
    const cleanProd = cleanMarketplaceProductName(tokoSimpleMatch[1], 'Tokopedia');
    if (cleanProd && !isGenericMarketplaceFallback(cleanProd) && !isLikelyShortcodeOrHash(cleanProd)) {
      return {
        shareProductName: cleanProd,
        shareBrand: inferProductBrandOrCollection(cleanProd),
        sharePrice: extractedPrice,
      };
    }
  }

  // 4. Shopee share pattern: "Dapatkan Skintific 5X Ceramide seharga Rp129.000 hanya di Shopee! ..."
  const shopeeMatch = input.match(
    /(?:Dapatkan|Beli|Temukan|Cek)\s+(.+?)(?:\s+(?:seharga|dengan\s+harga)\s*Rp\.?\s*([\d.,]+))?(?:\.\s*Dapatkan\s+di\s+Shopee|\s+hanya\s+di\s+Shopee|\s+di\s+Shopee|\s+sekarang!|\s+https?)/i
  );
  if (shopeeMatch && shopeeMatch[1]) {
    const cleanProd = cleanMarketplaceProductName(shopeeMatch[1], 'Shopee');
    if (cleanProd && !isGenericMarketplaceFallback(cleanProd) && !isLikelyShortcodeOrHash(cleanProd)) {
      return {
        shareProductName: cleanProd,
        shareBrand: inferProductBrandOrCollection(cleanProd),
        sharePrice: shopeeMatch[2] ? shopeeMatch[2].replace(/[.,]+$/, '').trim() : extractedPrice,
      };
    }
  }

  // 5. "Lihat/Cek [Produk] di TikTok/Shopee/Tokopedia: ..."
  const genericShareMatch = input.match(
    /(?:Lihat|Cek|Temukan|Rekomendasi|Spill)\s+(.+?)(?:\s+dengan\s+harga\s+Rp[\d.,]+|\s+seharga\s+Rp[\d.,]+|\.\s*Dapatkan\s+di|\s+di\s+(?:TikTok|Tokopedia|Shopee|Lazada)|\s+https?)/i
  );
  if (genericShareMatch && genericShareMatch[1]) {
    const cleanProd = cleanMarketplaceProductName(genericShareMatch[1]);
    if (cleanProd && cleanProd.length >= 3 && !isGenericMarketplaceFallback(cleanProd) && !isLikelyShortcodeOrHash(cleanProd)) {
      return {
        shareProductName: cleanProd,
        shareBrand: inferProductBrandOrCollection(cleanProd),
        sharePrice: extractedPrice,
      };
    }
  }

  // 6. Clean text stripped of URL & share boilerplate
  const noUrls = input
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\b(?:s\.shopee\.co\.id|shope\.ee|vt\.tiktok\.com|tokopedia\.link|tkp\.me|s\.lazada\.co\.id)\/\S+/gi, '')
    .replace(/[#@][\w-]+/g, '')
    .trim();

  if (noUrls && noUrls.length >= 4 && !isGenericMarketplaceFallback(noUrls)) {
    const cleanedLine = cleanMarketplaceProductName(noUrls);
    const firstCleanLine = cleanedLine.split(/[\n–—]/)[0]?.trim();
    if (firstCleanLine && firstCleanLine.length >= 3 && firstCleanLine.length <= 100 && !isLikelyShortcodeOrHash(firstCleanLine)) {
      return {
        shareProductName: firstCleanLine,
        shareBrand: inferProductBrandOrCollection(firstCleanLine),
        sharePrice: extractedPrice,
      };
    }
  }

  return {};
}

/**
 * Parse path or slug words (including camelCase or hyphenated tokens)
 * E.g. "ZS2mSagoDiet" -> "Sago Diet", "somethinc-niacinamide" -> "Somethinc Niacinamide"
 * NEVER splits random shortlink hashes like "LoXUMhlJb" or "3ZkIq7m"!
 */
export function parsePathOrSlugWords(token: string): { parsedName?: string; brand?: string } {
  if (!token) return {};
  let str = token.trim();

  // Strip common shortcode prefixes (like vt.tiktok.com's ZSxx prefix)
  if (/^ZS[a-zA-Z0-9]{2,3}/.test(str)) {
    str = str.replace(/^ZS[a-zA-Z0-9]{2,3}/, '');
  }

  // If token has hyphens or underscores (real product URL slug)
  if (str.includes('-') || str.includes('_')) {
    const spaced = str.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
    if (spaced.length >= 4 && !isLikelyShortcodeOrHash(spaced)) {
      return {
        parsedName: capitalizeWords(spaced),
        brand: detectKnownBrand(spaced),
      };
    }
  }

  // Guard against random shortlink base62 hashes (e.g., "LoXUMhlJb", "3ZkIq7m", "aB9xYz"):
  // If a single token without hyphens contains consecutive uppercase letters (e.g. "XUM"),
  // or digits mixed in a short token, or is <= 12 chars without a known brand, do NOT camelCase split!
  const hasConsecutiveUpper = /[A-Z]{2,}/.test(str);
  const hasDigitsInShortToken = /\d/.test(str) && str.length <= 14;
  if (!hasConsecutiveUpper && !hasDigitsInShortToken) {
    const splitWords = str.replace(/([a-z])([A-Z])/g, '$1 $2').split(' ').filter(Boolean);
    // Only accept camelCase split if every word is >= 4 letters and contains a vowel (e.g. "Sago Diet", "Green Coffee")
    const allWordsValid =
      splitWords.length >= 2 &&
      splitWords.every((w) => w.length >= 4 && /[aeiouAEIOU]/.test(w) && !/[bcdfghjklmnpqrstvwxyz]{4,}/i.test(w));

    if (allWordsValid) {
      const combined = splitWords.join(' ');
      return {
        parsedName: capitalizeWords(combined),
        brand: detectKnownBrand(combined),
      };
    }
  }

  // Single word known brand
  const brand = detectKnownBrand(str);
  if (brand) {
    return { parsedName: brand, brand };
  }

  return {};
}

/**
 * Extract slug intelligence from URL paths (e.g. tokopedia.com/store/product-name-slug)
 */
function extractSlugIntelligence(url: string, platform: string): { slugName?: string; shopName?: string } {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;
    const segments = pathname.split('/').filter(Boolean);

    // Shortlink redirect hosts only carry random IDs in single-segment paths unless hyphenated
    const isShortlinkDomain = [
      's.shopee.co.id',
      'shope.ee',
      'shp.ee',
      'id.shp.ee',
      'vt.tiktok.com',
      'vm.tiktok.com',
      'tokopedia.link',
      'tkp.me',
      's.lazada.co.id',
      'blibli.app.link',
    ].some((d) => hostname === d || hostname.endsWith(`.${d}`));

    if (isShortlinkDomain) {
      const lastSeg = segments[segments.length - 1] || '';
      const parsedShort = parsePathOrSlugWords(lastSeg);
      if (parsedShort.parsedName && !isLikelyShortcodeOrHash(parsedShort.parsedName)) {
        return { slugName: parsedShort.parsedName, shopName: parsedShort.brand };
      }
      return {};
    }

    // Tokopedia full product url: /shop-name/product-name-slug
    if (platform === 'Tokopedia' && segments.length >= 2) {
      const firstSeg = segments[0].toLowerCase();
      // Avoid non-product routes like /p/category or /discovery
      if (!['p', 'discovery', 'find', 'promo', 'search', 'hot'].includes(firstSeg)) {
        const shopName = segments[0].replace(/[-_]/g, ' ');
        const rawSlug = segments[1];
        if (rawSlug.includes('-') && rawSlug.length > 5) {
          const slugName = rawSlug
            .replace(/[-_]/g, ' ')
            .replace(/\b(promo|diskon|termurah|terlaris|original|bpom|ready|terbaru|official|store)\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
          return { slugName: capitalizeWords(slugName), shopName: capitalizeWords(shopName) };
        }
      }
    }

    // Shopee product url: /Product-Name-Slug-i.1234.5678
    if (platform === 'Shopee') {
      const lastSegment = segments[segments.length - 1] || '';
      if (lastSegment && lastSegment.includes('-') && !lastSegment.startsWith('i.')) {
        const slugName = lastSegment
          .replace(/-i\.\d+\.\d+/g, '')
          .replace(/[-_]/g, ' ')
          .trim();
        if (slugName.length > 4 && !isLikelyShortcodeOrHash(slugName)) {
          return { slugName: capitalizeWords(slugName) };
        }
      }
    }

    // Generic multi-word slug with hyphens (e.g. /product/somethinc-serum-20ml)
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i];
      const parsedPath = parsePathOrSlugWords(seg);
      if (parsedPath.parsedName && !isLikelyShortcodeOrHash(parsedPath.parsedName)) {
        return { slugName: parsedPath.parsedName, shopName: parsedPath.brand };
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
  'aplikasi tokopedia',
];

function isJunkTitle(title: string): boolean {
  if (!title) return true;
  const lower = title.toLowerCase().trim();
  if (lower.length < 3) return true;
  if (isGenericMarketplaceFallback(lower)) return true;
  return JUNK_TITLES.some((junk) => lower === junk || lower.startsWith(junk) || lower.includes('make your day'));
}

/**
 * Clean marketplace titles and share sentences of standard spam prefixes, prices, and trailing CTA boilerplate
 */
export function cleanMarketplaceProductName(rawTitle: string, platform?: string): string {
  if (!rawTitle) return '';
  let cleaned = decodeHtmlEntities(rawTitle);

  // Strip embedded URLs if any
  cleaned = cleaned
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\b(?:s\.shopee\.co\.id|shope\.ee|vt\.tiktok\.com|tokopedia\.link|tkp\.me|s\.lazada\.co\.id)\/\S+/gi, '');

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
    .replace(/\|\s*Shopee.*$/i, '')
    .replace(/-\s*Shopee.*$/i, '')
    .replace(/\|\s*Lazada Indonesia.*$/i, '')
    .replace(/\|\s*Blibli.*$/i, '');

  // Strip marketplace share-text price & CTA suffixes:
  // e.g. "dengan harga Rp155.000. Dapatkan di Shopee sekarang!"
  // e.g. "seharga Rp129.000 hanya di Shopee!"
  cleaned = cleaned
    .replace(/\s+(?:dengan\s+harga|seharga|harga\s+mulai|dengan\s+promo|cuma\s+Rp|hanya\s+Rp)\s*(?:Rp\.?\s*)?[\d.,]+.*$/i, '')
    .replace(/[.,!?\s]+(?:Dapatkan|Beli|Temukan|Cek|Checkout|Belanja)\s+(?:produk\s+ini\s+)?(?:sekarang\s+)?(?:hanya\s+)?di\s+(?:Shopee(?:\s+Video)?|Tokopedia|TikTok(?:\s+Shop)?|Lazada|Blibli).*$/i, '')
    .replace(/\s+(?:hanya\s+di|di)\s+(?:Shopee(?:\s+Video)?|Tokopedia|TikTok(?:\s+Shop)?|Lazada|Blibli)(?:\s+sekarang)?[!.\s]*$/i, '');

  // Remove common Indonesian eCommerce share prefix words
  cleaned = cleaned
    .replace(/^(?:Cek|Lihat|Temukan|Jual|Beli|Promo|Diskon|Dapatkan|Grosir|Ready|Murah|Spill|COD|Racun|Cobain|Rekomendasi)\s+/gi, '')
    .replace(/^(?:Cek\s+|Lihat\s+|Temukan\s+|Jual\s+|Beli\s+)/gi, '');

  // Remove location/city prefixes or suffixes often inserted by Tokopedia (e.g. "- Jakarta Barat - Official Store")
  cleaned = cleaned.replace(/-\s*(Kota\s+[A-Za-z\s]+|Jakarta\s+[A-Za-z]+|Bandung|Surabaya|Medan|Semarang)\s*-\s*[^|]+/gi, '');

  // Clean trailing punctuation, dashes or bars
  cleaned = cleaned.replace(/[.\-|–!?,:]+\s*$/, '').trim();

  // Remove excessive whitespace & clean up
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

/**
 * Clean TikTok caption to isolate real product title
 * (e.g. "Cobain Sago Green Coffee penurun berat badan #sagocoffee #fyp" -> "Sago Green Coffee Slimming")
 */
function cleanTikTokCaption(caption: string): string {
  if (!caption) return '';
  // 1. Remove generic viral hashtags
  let text = caption.replace(/#(fyp|foryou|viral|trending|xyzbca|racuntiktok|tiktokshop|serunyabelajar|affiliate)\b/gi, '');
  
  // 2. Extract specific product hashtag if present (e.g. #sagocoffee, #skintific)
  const productHashtags = text.match(/#([a-zA-Z0-9]+)/g) || [];
  text = text.replace(/#\w+/g, '').trim();

  // 3. Remove creator opening chatter
  text = text.replace(/^(cobain|review jujur|stop scrolling|rekomendasi|spill|akhirnya nemu|jujur ini)\s+/gi, '');

  // 4. Clean trailing exclamation or emojis
  text = text.split(/[\n–—!]/)[0]?.trim() || text;
  text = cleanMarketplaceProductName(text, 'TikTok');

  if (text.length >= 4 && !isJunkTitle(text)) {
    return text;
  }

  // Fallback to hashtag candidate if caption had a brand tag
  for (const tag of productHashtags) {
    const rawTag = tag.replace('#', '');
    const brand = detectKnownBrand(rawTag);
    if (brand) {
      return `${brand} Product`;
    }
  }

  return text;
}

/**
 * Deep extract link metadata with redirects, shortlink resolution, social crawlers,
 * TikTok oEmbed, Branch.io deep link parsing, and HTML head analysis.
 */
export async function extractProductFromLink(
  rawInputUrl: string,
  timeoutMs = 7000
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

  // 2. Inspect URL path for embedded product keywords / slug (e.g. vt.tiktok.com/ZS2mSagoDiet/)
  const urlObj = (() => {
    try {
      return new URL(normalizedUrl);
    } catch {
      return null;
    }
  })();

  if (urlObj) {
    const pathSegments = urlObj.pathname.split('/').filter(Boolean);
    const lastSeg = pathSegments[pathSegments.length - 1] || '';
    if (lastSeg) {
      const pathIntel = parsePathOrSlugWords(lastSeg);
      if (pathIntel.parsedName && !isLikelyShortcodeOrHash(pathIntel.parsedName)) {
        if (!result.productName) {
          result.productName = pathIntel.parsedName;
        }
        if (pathIntel.brand && !result.brand) {
          result.brand = pathIntel.brand;
        }
      }
    }
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Multi-platform crawler headers (Facebook/WhatsApp preview crawler bypasses mobile gates)
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

    // Step B: For TikTok links, call official TikTok oEmbed API
    if (result.platform === 'TikTok') {
      try {
        const oembedTarget = result.finalUrl || normalizedUrl;
        const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(oembedTarget)}`;
        const oembedRes = await fetch(oembedUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
          signal: AbortSignal.timeout(3500),
        });
        if (oembedRes.ok) {
          const oembedData = await oembedRes.json();
          if (oembedData.title) {
            const cleanTitle = cleanTikTokCaption(oembedData.title);
            if (cleanTitle && !isJunkTitle(cleanTitle) && !isGenericMarketplaceFallback(cleanTitle)) {
              result.ogTitle = cleanTitle;
              if (!result.productName) result.productName = cleanTitle;
              result.success = true;
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

    // Read initial HTML text (read up to 250KB for fast response)
    const rawHtml = await response.text();
    const htmlSlice = rawHtml.slice(0, 250000);

    // 1. Extract <title>
    const titleMatch = htmlSlice.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      const candidateTitle = decodeHtmlEntities(titleMatch[1].trim());
      if (!isJunkTitle(candidateTitle) && !isGenericMarketplaceFallback(candidateTitle)) {
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

    if (metaMap['og:title'] && !isJunkTitle(metaMap['og:title']) && !isGenericMarketplaceFallback(metaMap['og:title'])) {
      result.ogTitle = metaMap['og:title'];
    }
    if (metaMap['twitter:title'] && !result.ogTitle && !isJunkTitle(metaMap['twitter:title']) && !isGenericMarketplaceFallback(metaMap['twitter:title'])) {
      result.ogTitle = metaMap['twitter:title'];
    }

    // Check description
    if (metaMap['og:description'] && !isGenericMarketplaceFallback(metaMap['og:description'])) {
      result.ogDescription = metaMap['og:description'];
    }
    if (metaMap['description'] && !isGenericMarketplaceFallback(metaMap['description'])) {
      result.metaDescription = metaMap['description'];
    }

    // Image & Price
    if (metaMap['og:image'] && !metaMap['og:image'].includes('branch-assets')) {
      result.ogImage = metaMap['og:image'];
    }
    if (metaMap['product:price:amount']) result.price = metaMap['product:price:amount'];
    if (metaMap['product:price:currency']) result.currency = metaMap['product:price:currency'];
    if (metaMap['product:brand'] && !result.brand) result.brand = metaMap['product:brand'];

    // 3. Extract Canonical URL & Branch.io deep link payload (Tokopedia & Shopee)
    const canonicalLinkMatch = htmlSlice.match(/<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) ||
      htmlSlice.match(/<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i);
    const branchCanonicalMatch = htmlSlice.match(/"(?:\$canonical_url|canonical_url|desktop_url)":\s*"([^"]+)"/i);
    const branchTitleMatch = htmlSlice.match(/"(?:\$og_title|og_title)":\s*"([^"]+)"/i);
    const branchDescMatch = htmlSlice.match(/"(?:\$og_description|og_description)":\s*"([^"]+)"/i);

    const resolvedCanonical = branchCanonicalMatch?.[1] || canonicalLinkMatch?.[1];
    if (resolvedCanonical && resolvedCanonical.startsWith('http')) {
      result.finalUrl = resolvedCanonical;
      result.platform = detectPlatform(resolvedCanonical);
    }

    if (branchTitleMatch?.[1] && !isJunkTitle(branchTitleMatch[1]) && !isGenericMarketplaceFallback(branchTitleMatch[1])) {
      const cleanBranchTitle = cleanMarketplaceProductName(branchTitleMatch[1], result.platform);
      if (cleanBranchTitle && !isLikelyShortcodeOrHash(cleanBranchTitle)) {
        result.ogTitle = cleanBranchTitle;
        if (!result.productName) result.productName = cleanBranchTitle;
      }
    }

    if (branchDescMatch?.[1] && !isGenericMarketplaceFallback(branchDescMatch[1])) {
      result.ogDescription = branchDescMatch[1];
    }

    // 4. Extract JSON-LD Schema.org data
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
            if (item.name && !result.productName && !isJunkTitle(item.name) && !isGenericMarketplaceFallback(item.name)) {
              result.productName = item.name;
            }
            if (item.description && !result.metaDescription && !isGenericMarketplaceFallback(item.description)) {
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

    // 5. Slug intelligence from resolved final URL
    const { slugName, shopName } = extractSlugIntelligence(result.finalUrl, result.platform);
    if (shopName && !result.brand) {
      result.brand = shopName;
    }

    // 6. Determine best Product Name candidate
    let candidateName = result.productName || result.ogTitle || result.title || '';
    if ((!candidateName || isJunkTitle(candidateName) || isGenericMarketplaceFallback(candidateName)) && slugName) {
      candidateName = slugName;
    }

    // If still empty, check if input contained known or inferred brand
    if (!result.brand) {
      result.brand = inferProductBrandOrCollection(candidateName || rawInputUrl);
    }

    if (candidateName && !isJunkTitle(candidateName) && !isGenericMarketplaceFallback(candidateName) && !isLikelyShortcodeOrHash(candidateName)) {
      result.productName = cleanMarketplaceProductName(candidateName, result.platform);
      result.success = true;
    }

    // Format price if clean number
    if (result.price && /^\d+$/.test(result.price.replace(/[.,\s]/g, ''))) {
      const numPrice = Number(result.price.replace(/[^\d]/g, ''));
      if (numPrice > 0) {
        result.price = numPrice.toLocaleString('id-ID');
        if (!result.currency) result.currency = 'Rp';
      }
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
    // If share text intelligence already extracted the product name, preserve it!
    if (result.productName && !isLikelyShortcodeOrHash(result.productName)) {
      if (!result.brand) {
        result.brand = inferProductBrandOrCollection(result.productName);
      }
      if (result.price && /^\d+$/.test(result.price.replace(/[.,\s]/g, ''))) {
        const numPrice = Number(result.price.replace(/[^\d]/g, ''));
        if (numPrice > 0) {
          result.price = numPrice.toLocaleString('id-ID');
          if (!result.currency) result.currency = 'Rp';
        }
      }
      const summaryParts: string[] = [`Nama Produk: ${result.productName}`];
      if (result.brand) summaryParts.push(`Brand / Toko: ${result.brand}`);
      if (result.price) summaryParts.push(`Harga: ${result.currency || 'Rp'} ${result.price}`);
      result.cleanedSummary = summaryParts.join('\n');
      result.success = true;
      return result;
    }

    // Otherwise, if network fetch fails (e.g. timeout or blocked IP), extract slug from URL string itself
    const { slugName, shopName } = extractSlugIntelligence(normalizedUrl, platform);
    if (slugName && !isLikelyShortcodeOrHash(slugName)) {
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
