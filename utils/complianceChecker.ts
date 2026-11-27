export interface ComplianceIssue {
  id: string;
  severity: 'high' | 'medium';
  matchedText: string;
  category: string;
  suggestion: string;
  safeReplacement: string;
}

export interface ComplianceScanResult {
  issues: ComplianceIssue[];
  score: 'safe' | 'caution' | 'risky';
  sanitizedText: string;
}

interface ComplianceRule {
  id: string;
  pattern: RegExp;
  severity: 'high' | 'medium';
  category: string;
  suggestion: string;
  safeReplacement: string;
  platformCheck?: (targetPlatform: string) => boolean;
}

const COMPLIANCE_RULES: ComplianceRule[] = [
  {
    id: 'medical_cure',
    pattern: /\b(sembuh(?:kan)?\s*100%|menyembuhkan|mengobati|anti\s*kanker|anti\s*diabetes|bebas\s*penyakit|obat\s*mujarab)\b/gi,
    severity: 'high',
    category: 'Klaim Medis Berlebihan',
    suggestion: 'Ganti klaim menyembuhkan dengan edukasi pendukung kesehatan.',
    safeReplacement: 'membantu merawat kesehatan',
  },
  {
    id: 'instant_permanent',
    pattern: /\b(permanen\s*dalam\s*\d+\s*(?:hari|jam|menit)|putih\s*permanen|memutihkan\s*permanen|cerah\s*permanen|mulus\s*permanen|kinclong\s*permanen)\b/gi,
    severity: 'high',
    category: 'Overclaim Hasil Permanen/Instan',
    suggestion: 'TikTok & Shopee melarang janji hasil instan/permanen. Gunakan bahasa bertahap.',
    safeReplacement: 'tampak lebih cerah terawat secara bertahap',
  },
  {
    id: 'weight_loss_claim',
    pattern: /\b(kurus\s*instan|turun\s*\d+\s*kg\s*(?:dalam|seminggu|sehari)|langsing\s*instan|bakar\s*lemak\s*100%|pelangsing\s*ajaib)\b/gi,
    severity: 'high',
    category: 'Klaim Penurunan Berat Badan Ekstrem',
    suggestion: 'Hindari angka pasti kg atau kata instan; kaitkan dengan pola hidup sehat.',
    safeReplacement: 'mendukung program diet dan gaya hidup seimbang',
  },
  {
    id: 'absolute_guarantee',
    pattern: /\b(pasti\s*(?:berhasil|ampuh|sembuh|putih|kurus)|100%\s*(?:ampuh|berhasil|aman\s*tanpa\s*efek)|dijamin\s*100%|anti\s*gagal|tidak\s*mungkin\s*gagal)\b/gi,
    severity: 'high',
    category: 'Klaim Mutlak (100% / Pasti)',
    suggestion: 'Hindari kata mutlak "100% / pasti berhasil" agar lolos moderasi iklan & affiliate.',
    safeReplacement: 'terbukti nyaman dan banyak disukai pengguna',
  },
  {
    id: 'superlative_ban',
    pattern: /\b(no\.?\s*1\s*di\s*(?:indonesia|dunia)|paling\s*bagus\s*sedunia|termurah\s*se-indonesia|terbaik\s*se-asia)\b/gi,
    severity: 'medium',
    category: 'Superlatif Tanpa Bukti Resmi',
    suggestion: 'Klaim "#1 / Termurah se-Indonesia" berisiko terkena teguran konten.',
    safeReplacement: 'salah satu favorit banyak pembeli',
  },
  {
    id: 'acne_erase',
    pattern: /\b(menghilangkan\s*jerawat\s*(?:selamanya|total|100%)|basmi\s*jerawat\s*seketika)\b/gi,
    severity: 'high',
    category: 'Overclaim Perawatan Kulit',
    suggestion: 'Gunakan frasa "membantu menenangkan & merawat kulit berjerawat".',
    safeReplacement: 'membantu merawat kulit berjerawat',
  },
  {
    id: 'cross_platform_shopee_on_tiktok',
    pattern: /\b(lebih\s*murah\s*dari\s*shopee|beli\s*di\s*shopee|cek\s*shopee|keranjang\s*oren|toko\s*oren)\b/gi,
    severity: 'high',
    category: 'Menyebut Platform Kompetitor di TikTok',
    suggestion: 'Menyebut Shopee/toko oren saat posting di TikTok memicu shadowban atau limit view.',
    safeReplacement: 'keranjang kuning di bawah',
    platformCheck: (p) => !p.toLowerCase().includes('shopee'),
  },
  {
    id: 'cross_platform_tiktok_on_shopee',
    pattern: /\b(keranjang\s*kuning|cek\s*tiktok\s*shop|beli\s*di\s*tiktok)\b/gi,
    severity: 'high',
    category: 'Menyebut Platform Kompetitor di Shopee',
    suggestion: 'Saat target Shopee Video, gunakan "keranjang oren" agar video tidak diturunkan.',
    safeReplacement: 'keranjang oren di bawah',
    platformCheck: (p) => p.toLowerCase().includes('shopee'),
  },
  {
    id: 'spam_urgency',
    pattern: /\b(palsu\s*=\s*uang\s*kembali\s*\d+x|rugi\s*seumur\s*hidup|harus\s*beli\s*sekarang\s*juga)\b/gi,
    severity: 'medium',
    category: 'Urgensi Agresif / Jaminan Finansial',
    suggestion: 'Gunakan ajakan yang natural & ramah penonton agar retensi lebih tinggi.',
    safeReplacement: 'mumpung stok dan promonya masih aman',
  },
];

export function scanTextCompliance(
  text: string,
  targetPlatform: string = 'TikTok Shop'
): ComplianceScanResult {
  if (!text || !text.trim()) {
    return { issues: [], score: 'safe', sanitizedText: text || '' };
  }

  const issues: ComplianceIssue[] = [];
  let sanitized = text;
  const seenMatches = new Set<string>();

  for (const rule of COMPLIANCE_RULES) {
    if (rule.platformCheck && !rule.platformCheck(targetPlatform)) {
      continue;
    }

    const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const rawMatched = match[0];
      const dedupeKey = `${rule.id}:${rawMatched.toLowerCase()}`;
      if (!seenMatches.has(dedupeKey)) {
        seenMatches.add(dedupeKey);
        issues.push({
          id: `${rule.id}_${issues.length}`,
          severity: rule.severity,
          matchedText: rawMatched,
          category: rule.category,
          suggestion: rule.suggestion,
          safeReplacement: rule.safeReplacement,
        });
      }
    }

    sanitized = sanitized.replace(rule.pattern, rule.safeReplacement);
  }

  const hasHigh = issues.some((i) => i.severity === 'high');
  const score: ComplianceScanResult['score'] = hasHigh
    ? 'risky'
    : issues.length > 0
    ? 'caution'
    : 'safe';

  return {
    issues,
    score,
    sanitizedText: sanitized,
  };
}
