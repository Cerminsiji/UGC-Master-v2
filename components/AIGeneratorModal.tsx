import React, { useState } from 'react';
import {
  Sparkles,
  X,
  Zap,
  Target,
  Clock,
  Smartphone,
  Check,
  Flame,
  ArrowRight,
  Link as LinkIcon,
  FileText,
  Loader2,
  Tag,
  CheckCircle2,
  AlertCircle,
  User,
  Camera,
  Layers,
  Video,
  Sliders,
  Eye,
  Info,
  Search,
  RotateCcw
} from 'lucide-react';
import {
  UGC_CATEGORIES,
  CAMERA_ANGLE_STYLES,
  CAMERA_ANGLE_PRESETS,
  EXTENDED_PERSONAS,
  CameraAngleStyleOption,
  ExtendedPersonaOption
} from '../data/categories';
import { AIGenerateParams, AutoDetectResult, UGCPersona } from '../types';

interface AIGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCategoryName: string;
  onGenerate: (params: AIGenerateParams) => Promise<void>;
  isGenerating: boolean;
  initialSmartInput?: string;
}

export const AIGeneratorModal: React.FC<AIGeneratorModalProps> = ({
  isOpen,
  onClose,
  currentCategoryName,
  onGenerate,
  isGenerating,
  initialSmartInput,
}) => {
  // Input states
  const [category, setCategory] = useState(currentCategoryName || 'Before & After');
  const [productName, setProductName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [productUrl, setProductUrl] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [keySellingPoints, setKeySellingPoints] = useState('');
  const [detectedPrice, setDetectedPrice] = useState<string | null>(null);
  const [detectedPlatformName, setDetectedPlatformName] = useState<string | null>(null);
  
  // Expanded Persona states (24 options)
  const [persona, setPersona] = useState<UGCPersona>('Wanita Muda / Gen Z');
  const [personaFilter, setPersonaFilter] = useState<'Semua' | 'Wanita' | 'Pria' | 'Niche & Profesi'>('Semua');
  const [personaSearch, setPersonaSearch] = useState('');
  const [isCustomPersonaOpen, setIsCustomPersonaOpen] = useState(false);
  const [customPersonaText, setCustomPersonaText] = useState('');

  // Camera Angle states
  const [cameraAngleStyle, setCameraAngleStyle] = useState<string>('Dinamis & Multi-Angle (Viral Fast-Cut)');
  const [preferredCameraAngles, setPreferredCameraAngles] = useState<string[]>([
    'POV / Handheld (First-Person)',
    'Extreme Close-up / Macro (Tekstur & Detail)',
    'Over the Shoulder (OTS)',
    'Medium Shot (Setengah Badan)',
    'Front Camera / Selfie Mode (Curhat Langsung)',
  ]);
  const [angleFilter, setAngleFilter] = useState<'Semua' | 'Hanya Tangan / Faceless' | 'Close-up' | 'POV / Wide' | 'Gerak / Dinamis'>('Semua');

  const [tone, setTone] = useState('Santai, Mengalir & Natural (Teman Curhat)');
  const [targetDuration, setTargetDuration] = useState(30);
  const [targetSceneCount, setTargetSceneCount] = useState<number>(0); // 0 = Auto, or 3-9
  const [targetPlatform, setTargetPlatform] = useState('TikTok Shop');
  const [language, setLanguage] = useState<'id' | 'en'>('id');

  const [prevCategoryName, setPrevCategoryName] = useState(currentCategoryName);
  if (prevCategoryName !== currentCategoryName) {
    setPrevCategoryName(currentCategoryName);
    if (currentCategoryName) {
      setCategory(currentCategoryName);
    }
  }

  // Auto-detect unified state
  const [smartInput, setSmartInput] = useState(initialSmartInput || '');
  const [prevInitialInput, setPrevInitialInput] = useState(initialSmartInput || '');
  if (initialSmartInput && initialSmartInput !== prevInitialInput) {
    setPrevInitialInput(initialSmartInput);
    setSmartInput(initialSmartInput);
  }
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectStep, setDetectStep] = useState('Menganalisis...');
  const [detectSuccess, setDetectSuccess] = useState<string | null>(null);
  const [detectTags, setDetectTags] = useState<string[]>([]);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [highlightFields, setHighlightFields] = useState(false);

  if (!isOpen) return null;

  // Handle camera style preset selection
  const handleSelectCameraStyle = (style: CameraAngleStyleOption) => {
    setCameraAngleStyle(style.name);
    setPreferredCameraAngles(style.recommendedAngles);
  };

  // Toggle specific camera angle chip
  const handleToggleCameraAngle = (angle: string) => {
    setPreferredCameraAngles((prev) => {
      if (prev.includes(angle)) {
        // Keep at least 1
        if (prev.length <= 1) return prev;
        return prev.filter((a) => a !== angle);
      } else {
        return [...prev, angle];
      }
    });
  };

  // Filtered personas with search & group categories
  const filteredPersonas = EXTENDED_PERSONAS.filter((p) => {
    if (personaFilter !== 'Semua' && p.genderGroup !== personaFilter) {
      return false;
    }
    if (personaSearch.trim()) {
      const q = personaSearch.toLowerCase().trim();
      return (
        p.name.toLowerCase().includes(q) ||
        p.badge.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.sampleGreeting.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Filtered camera angles by category
  const filteredAngles = CAMERA_ANGLE_PRESETS.filter((angle) => {
    if (angleFilter === 'Semua') return true;
    const lower = angle.toLowerCase();
    if (angleFilter === 'Hanya Tangan / Faceless') {
      return (
        lower.includes('tangan') ||
        lower.includes('hand') ||
        lower.includes('faceless') ||
        lower.includes('swatch') ||
        lower.includes('unboxing')
      );
    }
    if (angleFilter === 'Close-up') {
      return lower.includes('close') || lower.includes('macro') || lower.includes('detail');
    }
    if (angleFilter === 'POV / Wide') {
      return lower.includes('pov') || lower.includes('wide') || lower.includes('shoulder') || lower.includes('flat') || lower.includes('bird');
    }
    if (angleFilter === 'Gerak / Dinamis') {
      return (
        lower.includes('orbit') ||
        lower.includes('tracking') ||
        lower.includes('pan') ||
        lower.includes('zoom') ||
        lower.includes('dutch') ||
        lower.includes('low') ||
        lower.includes('split') ||
        lower.includes('worm') ||
        lower.includes('mirror')
      );
    }
    return true;
  });

  // Handle Smart AI Auto-Detection from 1 single input (link + notes)
  const handleAutoDetect = async (shouldAutoGenerateAfterDetect = false) => {
    const trimmedInput = smartInput.trim();
    if (!trimmedInput && !productName.trim()) {
      setDetectError('Masukkan link produk atau keterangan produk pada kolom di atas.');
      return;
    }

    // Extract URL if present in input
    const urlMatch = trimmedInput.match(/https?:\/\/[^\s]+/i);
    const extractedUrl = urlMatch ? urlMatch[0] : productUrl;
    if (extractedUrl) setProductUrl(extractedUrl);

    setIsDetecting(true);
    const isTikTok = extractedUrl?.toLowerCase().includes('tiktok');
    const isTokopedia = extractedUrl?.toLowerCase().includes('tokopedia') || extractedUrl?.toLowerCase().includes('tkp.me');
    const isShopee = extractedUrl?.toLowerCase().includes('shopee') || extractedUrl?.toLowerCase().includes('shope.ee');

    setDetectStep(
      isTikTok
        ? '🔍 Mengakses link affiliate TikTok Shop & scraping info produk...'
        : isTokopedia
        ? '🔍 Mengakses link Tokopedia & scraping info produk...'
        : isShopee
        ? '🔍 Mengakses link Shopee & scraping info produk...'
        : '🔍 Menganalisis link & scraping data produk...'
    );
    setDetectError(null);
    setDetectSuccess(null);

    const stepTimer1 = setTimeout(() => {
      setDetectStep('⚡ Mengekstrak Nama Produk, USP, & Spesifikasi...');
    }, 600);

    const stepTimer2 = setTimeout(() => {
      setDetectStep('✨ Menyiapkan Rekomendasi Sudut Kamera & Alur UGC...');
    }, 1400);

    try {
      const response = await fetch('/api/auto-detect-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: trimmedInput || productName,
        }),
      });

      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);

      const rawText = await response.text();
      let resData: any = {};
      try {
        resData = JSON.parse(rawText);
      } catch {
        throw new Error('Respons server tidak valid. Silakan coba lagi sebentar.');
      }

      if (!response.ok || !resData.data) {
        throw new Error(resData.error || 'Gagal menganalisis produk.');
      }

      const detected: AutoDetectResult = resData.data;

      // Apply detected values
      if (detected.productName) setProductName(detected.productName);
      if (detected.brandName) setBrandName(detected.brandName);
      if (detected.productUrl || extractedUrl) setProductUrl(detected.productUrl || extractedUrl);
      if (detected.category) {
        const catMatch = UGC_CATEGORIES.find(
          (c) =>
            c.name.toLowerCase() === detected.category?.toLowerCase() ||
            c.id.toLowerCase() === detected.category?.toLowerCase() ||
            c.badgeText.toLowerCase() === detected.category?.toLowerCase()
        );
        setCategory(catMatch ? catMatch.name : detected.category);
      }
      if (detected.productDescription) setProductDescription(detected.productDescription);
      if (detected.targetAudience) setTargetAudience(detected.targetAudience);
      if (detected.keySellingPoints) setKeySellingPoints(detected.keySellingPoints);
      if (detected.persona) setPersona(detected.persona);
      if (detected.tone) setTone(detected.tone);
      if (detected.cameraAngleStyle) {
        setCameraAngleStyle(detected.cameraAngleStyle);
        const styleMatch = CAMERA_ANGLE_STYLES.find((s) => s.name === detected.cameraAngleStyle);
        if (styleMatch) setPreferredCameraAngles(styleMatch.recommendedAngles);
      }
      if ((detected as any).preferredCameraAngles && Array.isArray((detected as any).preferredCameraAngles)) {
        setPreferredCameraAngles((detected as any).preferredCameraAngles);
      }
      if (detected.targetPlatform) setTargetPlatform(detected.targetPlatform);
      if (detected.targetDuration) setTargetDuration(detected.targetDuration);
      if (detected.detectedTags && Array.isArray(detected.detectedTags)) {
        setDetectTags(detected.detectedTags);
      }
      if (detected.price) setDetectedPrice(detected.price);
      if (detected.platform) setDetectedPlatformName(detected.platform);

      setDetectSuccess(detected.detectionSummary || `Berhasil mendeteksi "${detected.productName}"`);
      setHighlightFields(true);
      setTimeout(() => setHighlightFields(false), 2500);

      // Auto-generate directly if requested
      if (shouldAutoGenerateAfterDetect && detected.productName) {
        const catMatch = UGC_CATEGORIES.find(
          (c) =>
            c.name.toLowerCase() === detected.category?.toLowerCase() ||
            c.id.toLowerCase() === detected.category?.toLowerCase()
        );
        const resolvedCategory = catMatch ? catMatch.name : (detected.category || category);

        await onGenerate({
          category: resolvedCategory,
          productName: detected.productName.trim(),
          brandName: (detected.brandName || brandName).trim(),
          productUrl: extractedUrl,
          productDescription: (detected.productDescription || '').trim(),
          targetAudience: (detected.targetAudience || '').trim(),
          keySellingPoints: (detected.keySellingPoints || '').trim(),
          persona: detected.persona || persona,
          tone: detected.tone || tone,
          cameraAngleStyle: detected.cameraAngleStyle || cameraAngleStyle,
          preferredCameraAngles,
          targetDuration: detected.targetDuration || targetDuration,
          targetSceneCount: targetSceneCount > 0 ? targetSceneCount : undefined,
          targetPlatform: detected.targetPlatform || targetPlatform,
          language,
        });
        onClose();
      }
    } catch (err: any) {
      console.error('Auto detect error:', err);
      setDetectError(err.message || 'Gagal mengekstrak data dari link.');
    } finally {
      setIsDetecting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim()) {
      setDetectError('Nama produk wajib diisi.');
      return;
    }

    let activeUrl = productUrl;
    if (!activeUrl && smartInput.trim()) {
      const match = smartInput.match(/https?:\/\/[^\s]+/i);
      if (match) activeUrl = match[0];
    }

    const finalPersona = isCustomPersonaOpen && customPersonaText.trim()
      ? customPersonaText.trim()
      : persona;

    await onGenerate({
      category,
      productName: productName.trim() || 'Produk Unggulan',
      brandName: brandName.trim(),
      productUrl: activeUrl,
      productDescription: productDescription.trim(),
      targetAudience: targetAudience.trim(),
      keySellingPoints: keySellingPoints.trim(),
      persona: finalPersona,
      tone,
      cameraAngleStyle,
      preferredCameraAngles,
      targetDuration,
      targetSceneCount: targetSceneCount > 0 ? targetSceneCount : undefined,
      targetPlatform,
      language,
    });
    onClose();
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setSmartInput(text);
        setDetectError(null);
      }
    } catch (err) {
      console.warn('Clipboard read failed:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-md animate-fadeIn font-sans">
      <div className="bg-[#0f1422] border border-[#23304d] rounded-3xl w-full max-w-4xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Modal Header */}
        <div className="p-4 md:p-5 border-b border-[#1f2a42] flex items-center justify-between bg-gradient-to-r from-[#141b2e] via-[#111728] to-[#101625]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 border border-purple-400/40 flex items-center justify-center text-white shadow-lg shadow-purple-900/40">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white tracking-tight flex items-center gap-2">
                <span>Studio Deteksi & Generator Naskah UGC</span>
                <span className="text-[10px] bg-purple-950 text-purple-300 border border-purple-700/50 px-2 py-0.5 rounded-full font-bold">
                  AI PRO
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Deteksi otomatis link & produk, pilih sudut kamera (termasuk mode Hands-Only), dan sesuaikan persona talent.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-[#1a2338] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 custom-scrollbar">
          
          {/* UNIFIED INPUT BOX: Link & Keterangan Produk */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-[#121929] to-[#0e1322] border border-purple-500/40 shadow-lg relative overflow-hidden">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-purple-600/30 border border-purple-500/50 flex items-center justify-center text-purple-300">
                    <Zap className="w-3.5 h-3.5" />
                  </div>
                  <label className="text-xs font-bold text-white uppercase tracking-wider">
                    Input Link / Keterangan Produk (Deteksi Otomatis)
                  </label>
                </div>
                
                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  className="text-[11px] font-semibold text-purple-300 hover:text-purple-200 bg-purple-950/60 hover:bg-purple-900/60 border border-purple-700/40 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
                >
                  <span>Tempel Clipboard</span>
                </button>
              </div>

              <div className="relative">
                <textarea
                  rows={2}
                  value={smartInput}
                  onChange={(e) => {
                    setSmartInput(e.target.value);
                    if (detectError) setDetectError(null);
                  }}
                  placeholder="Paste link TikTok Shop, Shopee Video, Tokopedia, atau ketik nama & manfaat produk di sini..."
                  className="w-full bg-[#090d17] border border-[#212c44] focus:border-purple-500 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 outline-none leading-relaxed transition-all resize-y"
                />
              </div>

              {/* Quick Sample Link Pills */}
              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                <span className="text-[10px] text-slate-500 font-semibold">Contoh Link:</span>
                <button
                  type="button"
                  onClick={() => {
                    setSmartInput('https://vt.tiktok.com/ZS2mSagoDiet/ - Sago Slimming Green Coffee diet sehat');
                    if (detectError) setDetectError(null);
                  }}
                  className="text-[10px] text-slate-300 hover:text-purple-200 bg-[#141b2b] hover:bg-purple-950/60 border border-[#23304d] px-2 py-0.5 rounded-lg transition-colors"
                >
                  🎬 TikTok: Sago Coffee
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSmartInput('https://tokopedia.link/somethinc-serum - Somethinc Niacinamide 10% Barrier Serum');
                    if (detectError) setDetectError(null);
                  }}
                  className="text-[10px] text-slate-300 hover:text-purple-200 bg-[#141b2b] hover:bg-purple-950/60 border border-[#23304d] px-2 py-0.5 rounded-lg transition-colors"
                >
                  🛍️ Tokopedia: Somethinc Serum
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSmartInput('https://s.shopee.co.id/skintific-gel - Skintific 5X Ceramide Barrier Moisture Gel');
                    if (detectError) setDetectError(null);
                  }}
                  className="text-[10px] text-slate-300 hover:text-purple-200 bg-[#141b2b] hover:bg-purple-950/60 border border-[#23304d] px-2 py-0.5 rounded-lg transition-colors"
                >
                  💄 Shopee: Skintific Gel
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  <span>Mengekstrak otomatis: Nama, USP, Persona, Target Durasi, dan Angle Kamera.</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleAutoDetect(false)}
                    disabled={isDetecting || isGenerating}
                    className="flex items-center gap-1.5 bg-[#172033] hover:bg-[#1f2b45] text-purple-200 border border-purple-500/40 text-xs font-bold px-3 py-1.5 rounded-xl transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isDetecting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                    ) : (
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                    )}
                    <span>{isDetecting ? 'Menganalisis...' : 'Deteksi Otomatis'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAutoDetect(true)}
                    disabled={isDetecting || isGenerating}
                    className="flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold px-3.5 py-1.5 rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50 border border-purple-400/40"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-purple-200" />
                    <span>Deteksi & Langsung Generate</span>
                  </button>
                </div>
              </div>

              {/* Status / Feedback Banner */}
              {isDetecting && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-purple-950/40 border border-purple-500/30 text-xs text-purple-200 animate-pulse">
                  <Loader2 className="w-4 h-4 animate-spin text-purple-400 shrink-0" />
                  <span>{detectStep}</span>
                </div>
              )}

              {detectSuccess && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-600/40 text-xs text-emerald-200">
                  <div className="flex items-center gap-2 flex-1 truncate">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div className="truncate">
                      <span className="font-bold">Berhasil: </span>
                      <span>{detectSuccess}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                    {detectedPlatformName && (
                      <span className="text-[10px] bg-purple-900/60 text-purple-200 px-1.5 py-0.5 rounded border border-purple-700/50 font-bold">
                        {detectedPlatformName}
                      </span>
                    )}
                    {detectedPrice && (
                      <span className="text-[10px] bg-amber-900/60 text-amber-200 px-1.5 py-0.5 rounded border border-amber-700/50 font-bold">
                        💰 {detectedPrice}
                      </span>
                    )}
                    {detectTags.length > 0 && (
                      <>
                        {detectTags.map((tag, i) => (
                          <span key={i} className="text-[10px] bg-emerald-900/60 text-emerald-300 px-1.5 py-0.2 rounded border border-emerald-700/50">
                            #{tag}
                          </span>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              )}

              {detectError && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-950/60 border border-rose-600/40 text-xs text-rose-200">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{detectError}</span>
                </div>
              )}
            </div>
          </div>

          {/* PARAMETERS FORM SECTION */}
          <form onSubmit={handleSubmit} className="space-y-5">
            
            {/* PARAMETER PRODUK & KONTEN */}
            <div className="p-4 rounded-2xl bg-[#111726] border border-[#1e2940] space-y-3.5">
              <div className="flex items-center justify-between border-b border-[#1c273e] pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-purple-950/80 border border-purple-600/50 flex items-center justify-center text-purple-300">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white tracking-tight">
                      Informasi Produk (Hasil Deteksi Otomatis / Input Manual)
                    </span>
                    <p className="text-[11px] text-slate-400">
                      AI menggunakan data ini untuk merancang dialog voiceover, naskah hook, dan visual adegan secara natural.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Nama Produk */}
                  <div className="md:col-span-1">
                    <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                      Nama Produk <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      placeholder="e.g. Somethinc Niacinamide Serum"
                      className={`w-full bg-[#141b2b] border rounded-xl px-3 py-2 text-sm text-slate-100 outline-none font-medium transition-all ${
                        highlightFields ? 'border-purple-400 bg-purple-950/30' : 'border-[#23304d] focus:border-purple-500'
                      }`}
                    />
                  </div>

                  {/* Brand / Merk Resmi */}
                  <div className="md:col-span-1">
                    <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                      Brand / Merk Resmi (Opsional)
                    </label>
                    <input
                      type="text"
                      value={brandName}
                      onChange={(e) => setBrandName(e.target.value)}
                      placeholder="e.g. Somethinc, Scarlett, Erigo"
                      className="w-full bg-[#141b2b] border border-[#23304d] focus:border-purple-500 rounded-xl px-3 py-2 text-xs text-slate-100 outline-none transition-all"
                    />
                  </div>

                  {/* Link Asal Produk */}
                  <div className="md:col-span-1">
                    <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                      Link Rujukan / Asal Produk (Opsional)
                    </label>
                    <input
                      type="url"
                      value={productUrl}
                      onChange={(e) => setProductUrl(e.target.value)}
                      placeholder="https://tiktok.com/... atau https://shopee.co.id/..."
                      className="w-full bg-[#141b2b] border border-[#23304d] focus:border-purple-500 rounded-xl px-3 py-2 text-xs text-purple-300 outline-none transition-all font-mono"
                    />
                  </div>
                </div>

                {/* Deskripsi & USP */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                      Deskripsi Ringkas Produk
                    </label>
                    <textarea
                      rows={2}
                      value={productDescription}
                      onChange={(e) => setProductDescription(e.target.value)}
                      placeholder="Jelaskan produk secara ringkas, manfaat atau fungsinya..."
                      className={`w-full bg-[#141b2b] border rounded-xl px-3 py-2 text-xs text-slate-100 outline-none transition-all ${
                        highlightFields ? 'border-purple-400 bg-purple-950/30' : 'border-[#23304d] focus:border-purple-500'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                      Poin Penjualan Utama (USP / Keunggulan)
                    </label>
                    <textarea
                      rows={2}
                      value={keySellingPoints}
                      onChange={(e) => setKeySellingPoints(e.target.value)}
                      placeholder="e.g. Hasil cepat 7 hari, diskon 50%, BPOM & Halal, praktis..."
                      className={`w-full bg-[#141b2b] border rounded-xl px-3 py-2 text-xs text-slate-100 outline-none transition-all ${
                        highlightFields ? 'border-purple-400 bg-purple-950/30' : 'border-[#23304d] focus:border-purple-500'
                      }`}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* FITUR 2: OPSI SUDUT KAMERA (CAMERA ANGLES) DALAM PEMBUATAN STORYBOARD OTOMATIS */}
            <div className="p-4 rounded-2xl bg-[#111726] border border-[#1e2940] space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1c273e] pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-sky-950/80 border border-sky-600/50 flex items-center justify-center text-sky-300">
                    <Camera className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <span>Opsi Sudut Kamera Storyboard (Camera Angles)</span>
                      <span className="text-[10px] bg-sky-900/60 text-sky-300 px-1.5 py-0.5 rounded font-mono font-semibold">
                        9 Gaya & 23 Sudut
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Pilih gaya komposisi kamera otomatis untuk video vertikal TikTok/Reels 9:16
                    </p>
                  </div>
                </div>

                <span className="text-[10px] bg-sky-950 text-sky-300 border border-sky-700/50 px-2.5 py-0.5 rounded-full font-bold self-start sm:self-auto">
                  {cameraAngleStyle}
                </span>
              </div>

              {/* 9 Preset Gaya Kamera */}
              <div>
                <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1.5">
                  1. Pilih Gaya Sinematik Kamera Utama:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {CAMERA_ANGLE_STYLES.map((style) => {
                    const isSelected = cameraAngleStyle === style.name;
                    return (
                      <button
                        key={style.id}
                        type="button"
                        onClick={() => handleSelectCameraStyle(style)}
                        className={`p-2.5 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'bg-sky-950/80 border-sky-500 text-white shadow-md shadow-sky-950/60 ring-1 ring-sky-500/40'
                            : 'bg-[#141b2b] border-[#222e47] text-slate-400 hover:text-slate-200 hover:bg-[#1a2338]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-xs font-bold text-white leading-tight">{style.name}</span>
                          <span className="text-[9px] bg-sky-900/60 text-sky-300 px-1.5 py-0.5 rounded font-mono font-semibold shrink-0">
                            {style.badge}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">
                          {style.description}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {/* Banner Hands-Only / Faceless Mode */}
                {(cameraAngleStyle.toLowerCase().includes('tangan') ||
                  cameraAngleStyle.toLowerCase().includes('hand') ||
                  persona.toLowerCase().includes('tangan') ||
                  preferredCameraAngles.some((a) => a.toLowerCase().includes('tangan') || a.toLowerCase().includes('faceless'))) && (
                  <div className="mt-2 p-2.5 rounded-xl bg-amber-950/40 border border-amber-500/50 flex items-center gap-2 text-amber-200 text-xs">
                    <span className="text-base shrink-0">🤲</span>
                    <div>
                      <span className="font-bold text-amber-300">Mode Kamera Hanya Tangan (Faceless UGC Aktif):</span>{' '}
                      <span className="text-amber-200/90 text-[11px]">
                        AI akan merancang seluruh adegan 100% tanpa wajah/muka, fokus penuh pada interaksi tangan memegang produk, unboxing, demo tekstur swatch, dan meja estetik.
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Angle Multi-Select Chips with Quick Filters */}
              <div className="pt-2 border-t border-[#1a2338] space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-300 font-semibold">2. Sudut Kamera Spesifik per Adegan:</span>
                    <span className="text-sky-400 font-mono text-[10px] font-bold bg-sky-950 px-2 py-0.5 rounded-full border border-sky-800">
                      {preferredCameraAngles.length} sudut aktif
                    </span>
                  </div>

                  {/* Quick Filter Buttons */}
                  <div className="flex items-center gap-1 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setPreferredCameraAngles([...CAMERA_ANGLE_PRESETS])}
                      className="text-[10px] font-semibold text-sky-300 hover:text-white px-2 py-0.5 rounded bg-sky-950 border border-sky-800 hover:bg-sky-900 transition-colors"
                      title="Pilih semua variasi sudut untuk video multi-angle dinamis"
                    >
                      Pilih Semua
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const styleMatch = CAMERA_ANGLE_STYLES.find((s) => s.name === cameraAngleStyle);
                        if (styleMatch) setPreferredCameraAngles(styleMatch.recommendedAngles);
                      }}
                      className="text-[10px] font-semibold text-slate-300 hover:text-white px-2 py-0.5 rounded bg-[#141b2c] border border-[#212d44] hover:bg-[#1b253b] transition-colors flex items-center gap-1"
                      title="Kembalikan ke rekomendasi sudut untuk gaya kamera ini"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span>Sesuai Gaya</span>
                    </button>
                  </div>
                </div>

                {/* Filter Category Chips for angles */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(['Semua', 'Hanya Tangan / Faceless', 'Close-up', 'POV / Wide', 'Gerak / Dinamis'] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setAngleFilter(cat)}
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-lg border transition-all ${
                        angleFilter === cat
                          ? 'bg-sky-600 text-white border-sky-400 shadow-sm'
                          : 'bg-[#121827] text-slate-400 border-[#202b40] hover:text-slate-200'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Angle Chips */}
                <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto custom-scrollbar p-1 bg-[#0b0f19] rounded-xl border border-[#182337]">
                  {filteredAngles.map((angle) => {
                    const isChecked = preferredCameraAngles.includes(angle);
                    return (
                      <button
                        key={angle}
                        type="button"
                        onClick={() => handleToggleCameraAngle(angle)}
                        className={`text-[11px] font-medium px-2.5 py-1 rounded-lg border transition-all active:scale-95 flex items-center gap-1 ${
                          isChecked
                            ? 'bg-sky-900/60 text-sky-200 border-sky-500/60 shadow-sm ring-1 ring-sky-500/30'
                            : 'bg-[#131a29] text-slate-400 border-[#202c44] hover:text-slate-300 hover:bg-[#192236]'
                        }`}
                      >
                        {isChecked && <Check className="w-3 h-3 text-sky-400" />}
                        <span>{angle}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* FITUR 3: PERLUAS PERSONA TALENT KREATOR (EXTENDED 24 PERSONAS) */}
            <div className="p-4 rounded-2xl bg-[#111726] border border-[#1e2940] space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1c273e] pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-purple-950/80 border border-purple-600/50 flex items-center justify-center text-purple-300">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <span>Persona Karakter Talent Kreator (24 Pilihan Diperluas)</span>
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Sesuaikan gaya bicara, emosi, diksi gaul/santai, dan penampilan talent dengan produk
                    </p>
                  </div>
                </div>

                <span className="text-[10px] bg-purple-950 text-purple-300 border border-purple-700/50 px-2.5 py-0.5 rounded-full font-bold self-start sm:self-auto">
                  Aktif: {persona}
                </span>
              </div>

              {/* Search Bar & Category Filter */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                {/* Search Box */}
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={personaSearch}
                    onChange={(e) => setPersonaSearch(e.target.value)}
                    placeholder="Cari persona (e.g. dokter, busui, kosan, gym, tech)..."
                    className="w-full bg-[#141b2b] border border-[#222e47] focus:border-purple-500 rounded-xl pl-8 pr-7 py-1.5 text-xs text-white placeholder-slate-500 outline-none"
                  />
                  {personaSearch && (
                    <button
                      type="button"
                      onClick={() => setPersonaSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Group Filter Tabs */}
                <div className="flex items-center gap-1 flex-wrap">
                  {(['Semua', 'Wanita', 'Pria', 'Niche & Profesi'] as const).map((group) => (
                    <button
                      key={group}
                      type="button"
                      onClick={() => setPersonaFilter(group)}
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all ${
                        personaFilter === group
                          ? 'bg-purple-600 text-white border-purple-400 shadow-sm'
                          : 'bg-[#141b2a] text-slate-400 border-[#222e47] hover:text-slate-200'
                      }`}
                    >
                      {group}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grid 24 Persona Pilihan */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
                {filteredPersonas.map((item) => {
                  const isSelected = persona === item.name && !isCustomPersonaOpen;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setPersona(item.name);
                        setIsCustomPersonaOpen(false);
                      }}
                      className={`p-2.5 rounded-xl border text-left transition-all relative ${
                        isSelected
                          ? 'bg-purple-950/80 border-purple-500 text-white shadow-md shadow-purple-950/60 ring-1 ring-purple-500/40'
                          : 'bg-[#141b2b] border-[#222e47] text-slate-400 hover:text-slate-200 hover:bg-[#1a2338]'
                      }`}
                    >
                      <div className="flex items-start gap-2 mb-1.5">
                        <span className="text-xl shrink-0">{item.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-white truncate">{item.name}</div>
                          <span className="text-[9px] bg-purple-900/60 text-purple-300 px-1.5 py-0.2 rounded font-mono font-semibold">
                            {item.badge}
                          </span>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">
                        {item.description}
                      </p>
                      <p className="text-[10px] text-purple-300/90 italic mt-1.5 line-clamp-2 border-t border-[#1a243a] pt-1">
                        &ldquo;{item.sampleGreeting}&rdquo;
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Custom Persona Toggle Option */}
              <div className="pt-2 border-t border-[#1a2338] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setIsCustomPersonaOpen(!isCustomPersonaOpen)}
                  className="text-xs font-semibold text-purple-400 hover:text-purple-300 flex items-center gap-1.5 self-start"
                >
                  <span>{isCustomPersonaOpen ? '− Gunakan Persona Pilihan Di Atas' : '+ Ketik Persona Kustom Sendiri...'}</span>
                </button>

                {isCustomPersonaOpen && (
                  <input
                    type="text"
                    value={customPersonaText}
                    onChange={(e) => setCustomPersonaText(e.target.value)}
                    placeholder="e.g. Dokter Kulit Spesialis, Barista Kopi Hits, Ibu Mertua Cerewet..."
                    className="flex-1 bg-[#141b2b] border border-purple-500 rounded-xl px-3 py-1.5 text-xs text-white outline-none"
                  />
                )}
              </div>
            </div>

            {/* Row: Category & Target Platform */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Format / Kategori UGC
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className={`w-full bg-[#141b2b] border rounded-xl px-3 py-2 text-xs text-slate-100 outline-none transition-all ${
                    highlightFields ? 'border-purple-400 bg-purple-950/30' : 'border-[#23304d] focus:border-purple-500'
                  }`}
                >
                  {UGC_CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.name}>
                      {cat.name} ({cat.recommendedDuration}s)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Target Platform
                </label>
                <select
                  value={targetPlatform}
                  onChange={(e) => setTargetPlatform(e.target.value)}
                  className="w-full bg-[#141b2b] border border-[#23304d] focus:border-purple-500 rounded-xl px-3 py-2 text-xs text-slate-100 outline-none transition-all"
                >
                  <option value="TikTok Shop">TikTok Shop (Rasio 9:16)</option>
                  <option value="Shopee Video">Shopee Video (Rasio 9:16)</option>
                  <option value="Instagram Reels">Instagram Reels (Rasio 9:16)</option>
                  <option value="YouTube Shorts">YouTube Shorts (Rasio 9:16)</option>
                </select>
              </div>
            </div>

            {/* Row: Target Audience & Voice Tone */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Target Audiens
                </label>
                <input
                  type="text"
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="e.g. Mahasiswa, Ibu muda, Pekerja kantoran"
                  className={`w-full bg-[#141b2b] border rounded-xl px-3 py-2 text-xs text-slate-100 outline-none transition-all ${
                    highlightFields ? 'border-purple-400 bg-purple-950/30' : 'border-[#23304d] focus:border-purple-500'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>Voice Tone (Gaya Bicara Kreator)</span>
                </label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className={`w-full bg-[#141b2b] border rounded-xl px-3 py-2 text-xs text-slate-100 outline-none transition-all ${
                    highlightFields ? 'border-purple-400 bg-purple-950/30' : 'border-[#23304d] focus:border-purple-500'
                  }`}
                >
                  <option value="Santai, Mengalir & Natural (Teman Curhat)">Santai, Mengalir & Natural (Teman Curhat)</option>
                  <option value="Excited, Hype & Ceria (Racun Belanja)">Excited, Hype & Ceria (Racun Belanja TikTok)</option>
                  <option value="Storytelling & Emosional (Problem Solver)">Storytelling & Emosional (Problem Solver Nyata)</option>
                  <option value="Edukatif, Informatif & Berwibawa (Dokter / Expert)">Edukatif, Informatif & Berwibawa (Dokter / Expert)</option>
                  <option value="Soft-Spoken, Calming & Aesthetic (ASMR Vibe)">Soft-Spoken, Calming & Aesthetic (ASMR Vibe)</option>
                  <option value="Lucu, Sarkas & Blunder (Komedi Viral)">Lucu, Sarkas & Blunder (Komedi Viral)</option>
                  <option value="FOMO & Mendesak (Promo Kilat / Keranjang Kuning)">FOMO & Mendesak (Promo Kilat / Keranjang Kuning)</option>
                  <option value="Elegan, Mewah & Eksklusif (High-End Lifestyle)">Elegan, Mewah & Eksklusif (High-End Lifestyle)</option>
                  <option value="To-The-Point & Solutif (Hard-Selling Langsung)">To-The-Point & Solutif (Hard-Selling Langsung)</option>
                </select>
              </div>
            </div>

            {/* Target Duration & Scene Count */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Target Durasi Video
                  </label>
                  <span className="text-[11px] font-bold text-purple-400 font-mono">
                    {targetDuration} Detik
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {[10, 15, 30, 45, 60].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setTargetDuration(d)}
                      className={`py-2 rounded-xl text-xs font-bold transition-all border ${
                        targetDuration === d
                          ? 'bg-purple-600 text-white border-purple-400 shadow-md shadow-purple-900/40'
                          : 'bg-[#141b2b] text-slate-400 border-[#23304d] hover:bg-[#1a2338]'
                      }`}
                    >
                      {d}s
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Jumlah Adegan
                  </label>
                  <span className="text-[11px] font-bold text-indigo-400 font-mono">
                    {targetSceneCount === 0 ? 'Otomatis' : `${targetSceneCount} Adegan`}
                  </span>
                </div>
                <div className="grid grid-cols-8 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTargetSceneCount(0)}
                    className={`col-span-2 py-2 rounded-xl text-xs font-bold transition-all border text-center ${
                      targetSceneCount === 0
                        ? 'bg-purple-600 text-white border-purple-400 shadow-md shadow-purple-900/40'
                        : 'bg-[#141b2b] text-slate-400 border-[#23304d] hover:bg-[#1a2338]'
                    }`}
                  >
                    Auto
                  </button>
                  {[3, 4, 5, 6, 7, 8].map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setTargetSceneCount(count)}
                      className={`col-span-1 py-2 rounded-xl text-xs font-bold transition-all border ${
                        targetSceneCount === count
                          ? 'bg-purple-600 text-white border-purple-400 shadow-md shadow-purple-900/40'
                          : 'bg-[#141b2b] text-slate-400 border-[#23304d] hover:bg-[#1a2338]'
                      }`}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom Submit Action */}
            <div className="pt-4 border-t border-[#1c273e] flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
                <span>Format storyboard lengkap dengan visual, VO dialog, SFX, dan pop-up text.</span>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-[#23304d] text-slate-400 hover:text-white text-xs font-semibold hover:bg-[#161f33] transition-colors"
                >
                  Batal
                </button>

                <button
                  type="submit"
                  disabled={isGenerating || !productName.trim()}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-purple-950/60 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-purple-200" />
                      <span>Merancang Storyboard...</span>
                    </>
                  ) : (
                    <>
                      <span>Generate Storyboard Sekarang</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>

          </form>

        </div>
      </div>
    </div>
  );
};
