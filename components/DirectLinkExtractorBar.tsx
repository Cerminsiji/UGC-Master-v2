'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';
import { AutoDetectResult } from '@/types';
import { extractUrlFromInput } from '@/lib/link-extractor';

interface DirectLinkExtractorBarProps {
  onApplyToProject: (data: AutoDetectResult) => void;
  onGenerateWithData: (data: AutoDetectResult) => Promise<void>;
  onOpenGeneratorModalWithInput: (input: string) => void;
  isGenerating?: boolean;
}

const PRESET_SAMPLE_LINKS = [
  {
    label: '🎬 TikTok Affiliate: Sago Slimming Coffee',
    platform: 'TikTok',
    sample: 'https://vt.tiktok.com/ZS2mSagoDiet/ - Kopi hijau penurun berat badan alami & diet sehat',
  },
  {
    label: '🛍️ Tokopedia: Somethinc Niacinamide Serum',
    platform: 'Tokopedia',
    sample: 'https://tokopedia.link/somethinc-niacinamide-barrier-serum - Somethinc Niacinamide 10% Barrier Serum 20ml',
  },
  {
    label: '💄 Shopee: Skintific 5X Ceramide Barrier',
    platform: 'Shopee',
    sample: 'https://s.shopee.co.id/skintific-5x-ceramide - Skintific 5X Ceramide Barrier Moisture Gel 30g',
  },
];

export function DirectLinkExtractorBar({
  onApplyToProject,
  onGenerateWithData,
  onOpenGeneratorModalWithInput,
  isGenerating = false,
}: DirectLinkExtractorBarProps) {
  const [inputValue, setInputValue] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractStep, setExtractStep] = useState('');
  const [extractedResult, setExtractedResult] = useState<AutoDetectResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isApplied, setIsApplied] = useState(false);

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
    if (!raw) {
      setErrorMsg('Masukkan atau tempel link affiliate TikTok Shop / Tokopedia terlebih dahulu.');
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
        : '🔍 Menganalisis link & scraping data spesifikasi produk...'
    );

    const timer1 = setTimeout(() => {
      setExtractStep('⚡ Mengekstrak Nama Produk, Brand Resmi, USP & Harga...');
    }, 600);

    const timer2 = setTimeout(() => {
      setExtractStep('✨ Memetakan persona talent, sudut kamera, dan alur konversi UGC...');
    }, 1300);

    try {
      const res = await fetch('/api/auto-detect-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: raw }),
      });

      clearTimeout(timer1);
      clearTimeout(timer2);

      const json = await res.json();
      if (!res.ok || !json.data) {
        throw new Error(json.error || 'Gagal mengekstrak data dari link tersebut.');
      }

      const result: AutoDetectResult = json.data;
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

        {/* Action Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#1a243a]">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
            <span>Ekstraksi mencakup: Judul, Brand, USP, Harga, Persona, Durasi & Sudut Kamera.</span>
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
              <span>{isExtracting ? 'Mengekstrak Link...' : 'Ekstrak Data Link'}</span>
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

              {/* Specs & Highlights Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-2 border-t border-[#192338] text-[11px]">
                <div className="bg-[#0e1424] p-2.5 rounded-lg border border-[#1b263e]">
                  <span className="font-semibold text-slate-400 block mb-0.5">Keunggulan Utama (USP):</span>
                  <p className="text-slate-200 font-medium line-clamp-2">
                    {extractedResult.keySellingPoints || 'Kualitas terjamin, hasil nyata terbukti.'}
                  </p>
                </div>

                <div className="bg-[#0e1424] p-2.5 rounded-lg border border-[#1b263e]">
                  <span className="font-semibold text-slate-400 block mb-0.5">Rekomendasi Format & Durasi:</span>
                  <p className="text-purple-300 font-semibold">
                    Kategori: {extractedResult.category} ({extractedResult.targetDuration} detik)
                  </p>
                  <p className="text-slate-400 text-[10px] mt-0.5">
                    Target: {extractedResult.targetAudience}
                  </p>
                </div>

                <div className="bg-[#0e1424] p-2.5 rounded-lg border border-[#1b263e]">
                  <span className="font-semibold text-slate-400 block mb-0.5">Gaya Angle Kamera & Talent:</span>
                  <p className="text-sky-300 font-semibold flex items-center gap-1">
                    <Camera className="w-3 h-3 text-sky-400" />
                    <span>{extractedResult.cameraAngleStyle || 'Dinamis & Multi-Angle'}</span>
                  </p>
                  <p className="text-slate-400 text-[10px] mt-0.5">
                    Persona: {extractedResult.persona || 'Semua (Netral)'}
                  </p>
                </div>
              </div>

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
