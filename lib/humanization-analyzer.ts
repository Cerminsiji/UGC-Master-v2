export interface HumanizationSuggestion {
  id: string;
  category: 'deep_scan' | 'jitter' | 'warmth' | 'grain' | 'metadata' | 'sei';
  title: string;
  description: string;
  recommendedPreset: string;
  priority: 'high' | 'medium' | 'info';
}

export interface HumanizationAnalysisReport {
  humanizationScore: number; // 0 to 100%
  aiRiskLevel: 'HIGH_AI_RISK' | 'SUSPICIOUS_SIGNALS' | 'CLEAN_ORGANIC';
  detectedMarkers: string[];
  suggestions: HumanizationSuggestion[];
  breakdown: {
    metadataCleanliness: number; // 0-25
    bitstreamEntropy: number;    // 0-25
    motionNaturalness: number;   // 0-25
    audioAcousticAir: number;    // 0-25
  };
}

export function analyzeVideoHumanization(probe: any): HumanizationAnalysisReport {
  if (!probe) {
    return {
      humanizationScore: 50,
      aiRiskLevel: 'SUSPICIOUS_SIGNALS',
      detectedMarkers: ['Belum di-probe'],
      suggestions: [
        {
          id: 's_probe',
          category: 'deep_scan',
          title: 'Lakukan Deep Scan & Probe',
          description: 'Jalankan analisis mendalam untuk mendeteksi tanda-tanda AI dan menentukan profil humanisasi yang tepat.',
          recommendedPreset: 'full_human',
          priority: 'high',
        },
      ],
      breakdown: { metadataCleanliness: 12, bitstreamEntropy: 12, motionNaturalness: 13, audioAcousticAir: 13 },
    };
  }

  const cleanliness = probe.cleanliness || {};
  const seiReport = probe.seiReport || {};
  const av = probe.audioVisualForensics || {};
  const uuidClaims = probe.uuidClaims || [];
  const jumbf = probe.jumbfManifests || [];

  const markers: string[] = [];
  if (seiReport.totalSeiUnits > 0) markers.push(`${seiReport.totalSeiUnits} SEI NAL Units`);
  if (uuidClaims.length > 0) markers.push(`${uuidClaims.length} UUID Claims`);
  if (jumbf.length > 0) markers.push(`${jumbf.length} C2PA JUMBF Manifests`);
  if (!cleanliness.isZeroAiVendor) markers.push('AI Generator / Encoder Vendor Tag');
  if (av.visual && av.visual.isPlasticZeroGrain) markers.push('Hiper-Smooth Plastic Background (Zero-Grain)');
  if (av.visual && av.visual.hasPulldownDuplicates) markers.push('AI Frame Interpolation / Pulldown Artifacts');
  if (av.audio && av.audio.airCliffDb < -22) markers.push('Vocoder Audio High-Freq Cliff (>17.5kHz)');

  let metadataScore = cleanliness.isZeroUuid && cleanliness.isZeroSei && cleanliness.isZeroJumbf ? 25 : 8;
  let entropyScore = av.visual && !av.visual.isPlasticZeroGrain ? 23 : 10;
  let motionScore = av.visual && av.visual.hasBFrames && !av.visual.hasPulldownDuplicates ? 24 : 12;
  let audioScore = av.audio && av.audio.audioClean ? 24 : 14;

  if (cleanliness.overallClean) {
    metadataScore = 25;
    entropyScore = 24;
    motionScore = 25;
    audioScore = 25;
  }

  const totalScore = Math.min(100, Math.max(5, metadataScore + entropyScore + motionScore + audioScore));
  const aiRiskLevel = totalScore >= 90 ? 'CLEAN_ORGANIC' : totalScore >= 70 ? 'SUSPICIOUS_SIGNALS' : 'HIGH_AI_RISK';

  const suggestions: HumanizationSuggestion[] = [];

  if (!cleanliness.isZeroSei || !cleanliness.isZeroUuid || !cleanliness.isZeroJumbf) {
    suggestions.push({
      id: 's_meta',
      category: 'metadata',
      title: 'Pembersihan Metadata & Zero-SEI Remux',
      description: 'Ditemukan sisa signature SEI, UUID, atau C2PA. Disarankan menjalankan pembersihan metadata total.',
      recommendedPreset: 'full_human',
      priority: 'high',
    });
  }

  if (av.visual?.isPlasticZeroGrain || totalScore < 85) {
    suggestions.push({
      id: 's_grain',
      category: 'grain',
      title: 'Suntikkan Organic CMOS Grain',
      description: 'Video terlihat terlalu steril atau mulus khas AI. Menambahkan grain sensor kamera mengurangi kesan buatan.',
      recommendedPreset: 'grain',
      priority: 'medium',
    });
  }

  if (av.visual?.hasPulldownDuplicates || !av.visual?.hasBFrames) {
    suggestions.push({
      id: 's_jitter',
      category: 'jitter',
      title: 'Aktifkan Handheld Cam Jitter',
      description: 'Gerakan kamera terlalu mulus atau kaku (khas generator Sora/Veo/Kling). Suntikan jitter kamera genggam.',
      recommendedPreset: 'handheld',
      priority: 'medium',
    });
  }

  if (av.audio && (!av.audio.audioClean || av.audio.airCliffDb < -20)) {
    suggestions.push({
      id: 's_warmth',
      category: 'warmth',
      title: 'Koreksi Skin Tone Warmth & Acoustic Room Air',
      description: 'Spektrum audio atau warna tampak sintetis. Disarankan menerapkan profil koreksi warna & room air.',
      recommendedPreset: 'warmth',
      priority: 'medium',
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      id: 's_perfect',
      category: 'deep_scan',
      title: 'Video Telah Sepenuhnya Organik',
      description: 'Tidak ditemukan indikator AI yang signifikan. Video lolos audit humanisasi tingkat lanjut.',
      recommendedPreset: 'none',
      priority: 'info',
    });
  }

  return {
    humanizationScore: totalScore,
    aiRiskLevel,
    detectedMarkers: markers.length > 0 ? markers : ['Tidak ada marker AI terdeteksi'],
    suggestions,
    breakdown: {
      metadataCleanliness: metadataScore,
      bitstreamEntropy: entropyScore,
      motionNaturalness: motionScore,
      audioAcousticAir: audioScore,
    },
  };
}
