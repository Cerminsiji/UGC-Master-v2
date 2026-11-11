'use client';

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Link2,
  Sparkles,
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  ShoppingBag,
  Tag,
  ArrowRight,
  X,
  Camera,
  Layers,
  Check,
  User,
  Upload,
  Image as ImageIcon,
  Plus,
} from 'lucide-react';
import { AutoDetectResult } from '@/types';
import { extractUrlFromInput } from '@/lib/link-extractor';
import { postJsonWithRetry, filesToReferenceImages } from '@/utils/helpers';
import { heuristicAutoDetect } from '@/lib/gemini-ugc';

interface DirectLinkExtractorBarProps {
  onApplyToProject: (data: AutoDetectResult) => void;
  onGenerateWithData: (data: AutoDetectResult) => Promise<void>;
  onOpenGeneratorModalWithInput: (input: string) => void;
  isGenerating?: boolean;
}

const PRESET_SAMPLE_LINKS = [
  {
    label: '🎬 TikTok Affiliate: Sago Coffee',
    platform: 'TikTok',
    sample: 'https://vt.tiktok.com/ZS2mSagoDiet/',
  },
  {
    label: '🛍️ Tokopedia Affiliate: Somethinc',
    platform: 'Tokopedia',
    sample: 'https://tokopedia.link/somethinc-niacinamide-barrier-serum',
  },
  {
    label: '💄 Shopee Share: Setelan Arsyilla',
    platform: 'Shopee',
    sample: 'Cek Setelan Arsyilla Klok (Restock) dengan harga Rp155.000. Dapatkan di Shopee sekarang! https://s.shopee.co.id/LoXUMhlJb',
  },
  {
    label: '📋 Teks Share Tokopedia Mobile',
    platform: 'Tokopedia',
    sample: 'Beli Somethinc Niacinamide Serum 20ml di Somethinc Official Tokopedia https://tokopedia.link/3ZkIq7m',
  },
];

export function DirectLinkExtractorBar({
  onApplyToProject,
  onGenerateWithData,
  onOpenGeneratorModalWithInput,
  isGenerating = false,
}: DirectLinkExtractorBarProps) {
  const [inputValue, setInputValue] = useState('');
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [isUploadingRefs, setIsUploadingRefs] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractStep, setExtractStep] = useState('');
  const [extractedResult, setExtractedResult] = useState<AutoDetectResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isApplied, setIsApplied] = useState(false);

  const handleUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploadingRefs(true);
    try {
      const urls = await filesToReferenceImages(files, 8);
      if (urls.length > 0) {
        setReferenceImages((prev) => [...prev, ...urls].slice(0, 8));
        setErrorMsg(null);
      }
    } finally {
      setIsUploadingRefs(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveRefImage = (idx: number) => {
    setReferenceImages((prev) => prev.filter((_, i) => i !== idx));
  };

  // Handle Clipboard Paste
  const handlePaste = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        const text = await navigator.clipboard.readText();
        if (text) {
          setInputValue(text);
          setErrorMsg(null);
        }
      }
    } catch {
      setErrorMsg('Gunakan shortcut Ctrl+V / Cmd+V untuk menempel link.');
    }
  };

  // Perform Real Live Extraction
  const handleExtract = async (shouldAutoGenerate = false) => {
    const raw = inputValue.trim();
    if (!raw && referenceImages.length === 0) {
      setErrorMsg('Masukkan link affiliate TikTok Shop / Tokopedia / Shopee atau upload foto referensi terlebih dahulu.');
      return;
    }

    setIsExtracting(true);
    setErrorMsg(null);
    setIsApplied(false);

    const detectedUrl = extractUrlFromInput(raw) || raw;
    const lower = detectedUrl.toLowerCase();
    const isTikTok = lower.includes('tiktok');
    const isTokopedia = lower.includes('tokopedia') || lower.includes('tkp.me');
    const isShopee = lower.includes('shopee') || lower.includes('shope.ee');

    setExtractStep(
      isTikTok
        ? '🔍 Mengakses shortlink TikTok Shop & mengambil data video/produk...'
        : isTokopedia
        ? '🔍 Mengakses Tokopedia Affiliate & scraping metadata produk...'
        : isShopee
        ? '🔍 Mengakses Shopee & mengambil detail produk...'
        : '🔍 Menganalisis link, teks & foto referensi produk...'
    );

    const timer1 = setTimeout(() => {
      setExtractStep('⚡ Mengekstrak Nama Produk, Brand Resmi, USP & Harga...');
    }, 600);

    const timer2 = setTimeout(() => {
      setExtractStep('✨ Memetakan persona talent, sudut kamera, dan alur konversi UGC...');
    }, 1300);

    try {
      const json = await postJsonWithRetry<{ success?: boolean; data?: AutoDetectResult; error?: string }>(
        '/api/auto-detect-product',
        {
          input: raw,
          referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
        }
      );

      clearTimeout(timer1);
      clearTimeout(timer2);

      const baseResult: AutoDetectResult =
        json && json.data
          ? json.data
          : (heuristicAutoDetect(raw, detectedUrl, raw) as unknown as AutoDetectResult);

      const mergedRefs =
        referenceImages.length > 0
          ? referenceImages
          : baseResult.referenceImage || baseResult.imageUrl
          ? [baseResult.referenceImage || baseResult.imageUrl!]
          : undefined;

      const result: AutoDetectResult = {
        ...baseResult,
        referenceImages: mergedRefs,
        referenceImage: mergedRefs?.[0] || baseResult.referenceImage || baseResult.imageUrl,
      };

      setExtractedResult(result);

      if (shouldAutoGenerate) {
        await onGenerateWithData(result);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal mengekstrak data produk dari link.');
    } finally {
      setIsExtracting(false);
    }
  };

  // Apply to active project
  const handleApply = () => {
    if (!extractedResult) return;
    onApplyToProject(extractedResult);
    setIsApplied(true);
    setTimeout(() => setIsApplied(false), 2500);
  };

  return (
    <div className="bg-gradient-to-br from-[#0c1322] via-[#0f172a] to-[#090d18] border border-purple-500/30 rounded-2xl p-4 md:p-5 shadow-xl relative overflow-hidden">
      {/* Decorative ambient glow */}
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="space-y-3.5 relative z-10">
        {/* Header & Supported Platform Badges */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-purple-600/20 shrink-0">
              <Link2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-white tracking-tight">
                  Ekstraktor Link Produk & Affiliate
                </h3>
                <span className="text-[10px] bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Auto-Scrape Aktif
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Kirim link affiliate TikTok Shop, Tokopedia, atau Shopee — sistem otomatis membaca produk & merancang storyboard!
              </p>
            </div>
          </div>

          {/* Supported platform pills */}
          <div className="flex items-center gap-1.5 flex-wrap self-start sm:self-auto">
            <span className="text-[10px] bg-black/60 text-slate-300 border border-slate-700/60 px-2 py-0.5 rounded-lg font-semibold flex items-center gap-1">
              <span className="text-rose-400 font-bold">♪</span> TikTok Shop
            </span>
            <span className="text-[10px] bg-emerald-950/50 text-emerald-300 border border-emerald-700/50 px-2 py-0.5 rounded-lg font-semibold flex items-center gap-1">
              <ShoppingBag className="w-2.5 h-2.5 text-emerald-400" /> Tokopedia
            </span>
            <span className="text-[10px] bg-amber-950/50 text-amber-300 border border-amber-700/50 px-2 py-0.5 rounded-lg font-semibold">
              Shopee
            </span>
          </div>
        </div>

        {/* Input Bar with Paste, Clear & Action Buttons */}
        <div className="space-y-2">
          <div className="relative flex items-center">
            <div className="absolute left-3.5 text-purple-400 pointer-events-none">
              <Zap className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isExtracting) {
                  handleExtract(false);
                }
              }}
              placeholder="Tempel link di sini: https://vt.tiktok.com/... atau https://tokopedia.link/... atau ketik nama produk..."
              className="w-full bg-[#070b14] border border-[#23314d] focus:border-purple-500 rounded-xl pl-10 pr-28 py-2.5 text-xs text-slate-100 placeholder-slate-500 outline-none transition-all shadow-inner font-mono text-ellipsis"
            />

            <div className="absolute right-2 flex items-center gap-1">
              {inputValue && (
                <button
                  type="button"
                  onClick={() => {
                    setInputValue('');
                    setExtractedResult(null);
                    setErrorMsg(null);
                  }}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  title="Hapus input"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={handlePaste}
                className="text-[11px] font-semibold text-purple-300 hover:text-white bg-purple-950/70 hover:bg-purple-900 border border-purple-700/50 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 active:scale-95"
                title="Tempel dari Clipboard"
              >
                <span>Tempel</span>
              </button>
            </div>
          </div>

          {/* Quick Preset Example Buttons */}
          <div className="flex items-center gap-2 flex-wrap pt-0.5">
            <span className="text-[11px] text-slate-500 font-semibold">Contoh Link Cepat:</span>
            {PRESET_SAMPLE_LINKS.map((preset, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setInputValue(preset.sample);
                  setErrorMsg(null);
                }}
                className="text-[10px] text-slate-300 hover:text-purple-200 bg-[#131b2e] hover:bg-purple-950/60 border border-[#23304d] hover:border-purple-600/50 px-2 py-1 rounded-lg transition-all active:scale-95"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Action Controls & Multi-Image Upload */}
        <div className="space-y-2.5 pt-1.5 border-t border-[#1a243a]">
          {/* Multi-Image Reference Strip */}
          {referenceImages.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap bg-[#080e1a] border border-cyan-900/50 rounded-xl p-2">
              <span className="text-[10px] font-bold text-cyan-300 flex items-center gap-1 px-1">
                <ImageIcon className="w-3.5 h-3.5 text-cyan-400" />
                <span>{referenceImages.length} Foto Referensi (Storyboard & Google Flow):</span>
              </span>
              {referenceImages.map((src, i) => (
                <div
                  key={i}
                  className="relative group w-11 h-11 rounded-lg overflow-hidden border border-cyan-700/60 bg-black shrink-0"
                >
                  <img src={src} alt={`Ref ${i + 1}`} className="w-full h-full object-cover" />
                  <span className="absolute bottom-0 left-0 right-0 bg-black/80 text-cyan-200 text-[8px] font-mono font-bold text-center">
                    Img {i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveRefImage(i)}
                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/80 hover:bg-red-600 text-white flex items-center justify-center"
                    title="Hapus foto ini"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
              {referenceImages.length < 8 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-11 h-11 rounded-lg border border-dashed border-cyan-700/60 hover:border-cyan-400 flex flex-col items-center justify-center text-cyan-400 hover:bg-cyan-950/30 transition-colors"
                  title="Tambah foto referensi lagi"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => handleUploadFiles(e.target.files)}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingRefs}
                className="flex items-center gap-1.5 bg-cyan-950/70 hover:bg-cyan-900/80 text-cyan-200 border border-cyan-600/50 text-xs font-bold px-3 py-1.5 rounded-xl transition-all active:scale-95 shadow-sm cursor-pointer"
                title="Upload banyak gambar produk sebagai referensi pembuatan Storyboard & Google Flow"
              >
                {isUploadingRefs ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-300" />
                ) : (
                  <Upload className="w-3.5 h-3.5 text-cyan-400" />
                )}
                <span>
                  {referenceImages.length > 0
                    ? `Tambah Foto Referensi (${referenceImages.length})`
                    : 'Upload Foto Referensi (Bisa Banyak)'}
                </span>
              </button>
              <span className="text-[11px] text-slate-400 hidden md:inline">
                • Gambar otomatis menjadi rujukan Storyboard & Google Flow
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleExtract(false)}
                disabled={isExtracting || isGenerating}
                className="flex items-center gap-1.5 bg-[#172136] hover:bg-[#202c47] text-purple-200 border border-purple-500/40 text-xs font-bold px-3 py-1.5 rounded-xl transition-all active:scale-95 disabled:opacity-50 shadow-sm"
              >
                {isExtracting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                ) : (
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                )}
                <span>{isExtracting ? 'Mengekstrak Link...' : 'Ekstrak Link Produk'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleExtract(true)}
                disabled={isExtracting || isGenerating}
                className="flex items-center gap-1.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold px-3.5 py-1.5 rounded-xl shadow-md shadow-purple-600/20 transition-all active:scale-95 disabled:opacity-50 border border-purple-400/40"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Ekstrak & Buat Storyboard Langsung</span>
              </button>
            </div>
          </div>
        </div>

        {/* Loading Progress Feedback */}
        <AnimatePresence>
          {isExtracting && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex items-center gap-2.5 p-3 rounded-xl bg-purple-950/40 border border-purple-500/40 text-xs text-purple-200"
            >
              <Loader2 className="w-4 h-4 animate-spin text-purple-400 shrink-0" />
              <div className="flex-1">
                <span className="font-semibold">{extractStep}</span>
                <div className="w-full bg-purple-950/60 h-1 rounded-full overflow-hidden mt-1.5">
                  <div className="bg-gradient-to-r from-purple-400 to-indigo-400 h-full w-2/3 animate-pulse" />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error Feedback */}
        {errorMsg && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-950/60 border border-rose-600/40 text-xs text-rose-200">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <div className="flex-1">
              <span className="font-bold">Gagal Ekstraksi: </span>
              <span>{errorMsg}</span>
            </div>
          </div>
        )}

        {/* Extracted Product Live Preview Card */}
        <AnimatePresence>
          {extractedResult && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 8 }}
              className="p-4 rounded-xl bg-[#090e1a] border border-emerald-500/40 shadow-lg space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-950 text-emerald-300 border border-emerald-700/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      Hasil Ekstraksi Link Berhasil
                    </span>

                    {extractedResult.platform && (
                      <span className="text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-700/50 px-2 py-0.5 rounded-full">
                        Platform: {extractedResult.platform}
                      </span>
                    )}

                    {extractedResult.price && (
                      <span className="text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-700/50 px-2 py-0.5 rounded-full">
                        💰 {extractedResult.price}
                      </span>
                    )}
                  </div>

                  <h4 className="text-sm font-bold text-white tracking-tight">
                    {extractedResult.productName}
                  </h4>

                  {extractedResult.brandName && (
                    <p className="text-xs text-slate-400 font-medium">
                      Brand / Toko Resmi: <span className="text-purple-300 font-semibold">{extractedResult.brandName}</span>
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleApply}
                    className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border transition-all active:scale-95 ${
                      isApplied
                        ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
                        : 'bg-[#151f33] hover:bg-[#1d2a45] text-emerald-300 border-emerald-600/40'
                    }`}
                  >
                    {isApplied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Diterapkan!</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Terapkan ke Naskah</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => onGenerateWithData(extractedResult)}
                    disabled={isGenerating}
                    className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-md border border-purple-400/40 transition-all active:scale-95 disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-purple-200" />
                    <span>Generate Storyboard</span>
                  </button>
                </div>
              </div>

              {/* Specs & Highlights Grid (4 Columns) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2 border-t border-[#192338] text-[11px]">
                <div className="bg-[#0e1424] p-2.5 rounded-lg border border-[#1b263e]">
                  <span className="font-semibold text-slate-400 block mb-0.5">Keunggulan Utama (USP):</span>
                  <p className="text-slate-200 font-medium line-clamp-2">
                    {extractedResult.keySellingPoints || 'Kualitas terjamin, hasil nyata terbukti.'}
                  </p>
                </div>

                <div className="bg-[#0e1424] p-2.5 rounded-lg border border-[#1b263e]">
                  <span className="font-semibold text-slate-400 block mb-0.5">Format & Durasi Video:</span>
                  <p className="text-purple-300 font-semibold">
                    Kategori: {extractedResult.category} ({extractedResult.targetDuration}s)
                  </p>
                  <p className="text-slate-400 text-[10px] mt-0.5 line-clamp-1">
                    Target: {extractedResult.targetAudience}
                  </p>
                </div>

                {/* Sudut Kamera Storyboard Terdeteksi */}
                <div className="bg-[#0e1424] p-2.5 rounded-lg border border-sky-900/50 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sky-400 flex items-center gap-1">
                      <Camera className="w-3 h-3 text-sky-400" />
                      <span>Sudut Kamera Terdeteksi:</span>
                    </span>
                    <span className="text-[9px] bg-sky-950 text-sky-300 border border-sky-800 px-1.5 py-0.2 rounded font-bold">
                      Auto
                    </span>
                  </div>
                  <p className="text-white font-bold text-xs truncate">
                    {extractedResult.cameraAngleStyle || 'Dinamis & Multi-Angle (Fast-Cut)'}
                  </p>
                  {extractedResult.cameraStyleExplanation && (
                    <p className="text-[10px] text-sky-200/80 italic line-clamp-1">
                      {extractedResult.cameraStyleExplanation}
                    </p>
                  )}
                  {extractedResult.preferredCameraAngles && extractedResult.preferredCameraAngles.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap pt-0.5">
                      {extractedResult.preferredCameraAngles.slice(0, 2).map((ang, i) => (
                        <span key={i} className="text-[9px] bg-[#141d30] text-sky-300 border border-sky-900/60 px-1.5 py-0.5 rounded truncate max-w-[130px]">
                          {ang}
                        </span>
                      ))}
                      {extractedResult.preferredCameraAngles.length > 2 && (
                        <span className="text-[9px] text-slate-500">+{extractedResult.preferredCameraAngles.length - 2} sudut</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Persona Karakter Talent Kreator Terdeteksi */}
                <div className="bg-[#0e1424] p-2.5 rounded-lg border border-purple-900/50 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-purple-400 flex items-center gap-1">
                      <User className="w-3 h-3 text-purple-400" />
                      <span>Persona Talent Kreator:</span>
                    </span>
                    <span className="text-[9px] bg-purple-950 text-purple-300 border border-purple-800 px-1.5 py-0.2 rounded font-bold">
                      Auto
                    </span>
                  </div>
                  <p className="text-white font-bold text-xs truncate">
                    {extractedResult.persona || 'Semua (Netral Universal)'}
                  </p>
                  {extractedResult.personaExplanation ? (
                    <p className="text-[10px] text-purple-200/80 italic line-clamp-1">
                      {extractedResult.personaExplanation}
                    </p>
                  ) : (
                    <p className="text-slate-400 text-[10px] line-clamp-1">
                      Tone: <span className="text-slate-300 font-medium">{extractedResult.tone || 'Santai & Natural'}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Status Referensi Image Google Flow */}
              {(extractedResult.referenceImage || extractedResult.imageUrl) && (
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#09111e] border border-cyan-800/50 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-400 font-bold flex items-center gap-1 shrink-0">
                      <span>🌊 Google Flow:</span>
                    </span>
                    <span className="text-slate-300 truncate">
                      Referensi image produk aktif. Setiap adegan storyboard & prompt AI video otomatis sinkron mengikuti kemasan ini tanpa typo.
                    </span>
                  </div>
                  <span className="text-[9px] bg-cyan-950 text-cyan-300 border border-cyan-700/60 px-2 py-0.5 rounded font-mono font-bold shrink-0">
                    Image-to-Video Ready
                  </span>
                </div>
              )}

              {/* Action Link to Full Studio Modal */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-400">
                  {extractedResult.detectionSummary}
                </span>

                <button
                  type="button"
                  onClick={() => onOpenGeneratorModalWithInput(inputValue)}
                  className="text-[11px] font-semibold text-purple-300 hover:text-white flex items-center gap-1 hover:underline"
                >
                  <span>Edit Parameter Lengkap di Studio AI</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
