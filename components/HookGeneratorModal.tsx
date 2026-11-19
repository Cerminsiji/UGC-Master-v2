import React, { useState, useEffect } from 'react';
import {
  Flame,
  X,
  Sparkles,
  Music2,
  Type,
  Video,
  ArrowRight,
  RefreshCw,
  Plus,
  Layers,
} from 'lucide-react';
import { AIHookOption } from '../types';
import { postJsonWithRetry } from '../utils/helpers';

interface HookGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  productName: string;
  category: string;
  productDescription?: string;
  keySellingPoints?: string;
  persona?: string;
  targetPlatform?: string;
  onSelectHook: (hook: AIHookOption, mode?: 'replace' | 'add_variant') => void;
}

const FORMULA_FILTERS = ['Semua', 'Visual & Proof', 'Psikologi & FOMO', 'Cerita & Relatable', 'Edukasi & Twist'] as const;

export const HookGeneratorModal: React.FC<HookGeneratorModalProps> = ({
  isOpen,
  onClose,
  productName,
  category,
  productDescription = '',
  keySellingPoints = '',
  persona = '',
  targetPlatform = 'TikTok Shop',
  onSelectHook,
}) => {
  const [hooks, setHooks] = useState<AIHookOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeGroupFilter, setActiveGroupFilter] = useState<(typeof FORMULA_FILTERS)[number]>('Semua');

  const fetchHooks = async () => {
    setIsLoading(true);
    try {
      const data = await postJsonWithRetry<{ success?: boolean; hooks?: AIHookOption[] }>(
        '/api/generate-hooks',
        {
          productName,
          category,
          productDescription,
          keySellingPoints,
          persona,
          targetPlatform,
        }
      );
      if (data && data.success && Array.isArray(data.hooks) && data.hooks.length > 0) {
        setHooks(data.hooks);
      } else {
        const safeProd = productName || 'Produk Ini';
        setHooks([
          {
            type: 'Visual Shock & Contrast',
            formulaGroup: 'Visual & Proof',
            hookDialog: `Lihat langsung bedanya sebelum sama sesudah pakai ${safeProd}, beneran gak perlu nunggu lama!`,
            visualAction: `Kamera close-up menyorot perbandingan nyata di depan lensa saat tangan memegang kemasan asli ${safeProd} dengan kontak 5 jari solid.`,
            popupText: 'BANDINGIN BEDANYA DETIK INI! ⚡',
            sfx: 'Snap-zoom bass hit & Sparkle magic ting',
          },
          {
            type: 'Negative Warning / Reverse Psychology',
            formulaGroup: 'Psikologi & FOMO',
            hookDialog: `Serius, jangan checkout ${safeProd} dulu kalau kalian belum siap ditanyain temen sekantor pakai apa!`,
            visualAction: `Kreator mencondongkan wajah dengan tatapan serius ke lensa 0.5x sambil menggenggam ${safeProd}.`,
            popupText: 'JANGAN CHECKOUT SEBELUM TAHU INI ⚠️',
            sfx: 'Record scratch freeze & Dramatic riser',
          },
          {
            type: 'Curiosity Gap / Rahasia Tersembunyi',
            formulaGroup: 'Psikologi & FOMO',
            hookDialog: `Baru ngeh ternyata ada satu detail kecil di ${safeProd} yang bikin orang selalu repeat order...`,
            visualAction: `Tangan menunjuk bagian detail fitur pada fisik ${safeProd} dari sudut makro dengan pencahayaan tajam.`,
            popupText: 'DETAIL RAHASIA YANG JARANG DISADARI 🤫',
            sfx: 'Whisper mic brush & Mystery chime',
          },
          {
            type: 'Social Proof & Ditanyain Teman',
            formulaGroup: 'Cerita & Relatable',
            hookDialog: `Barusan pas lagi ngumpul, tiga temen langsung minta link ${safeProd} ini gara-gara lihat hasilnya langsung!`,
            visualAction: `Kreator mengeluarkan ${safeProd} dari tas jinjing dengan senyum antusias di depan pencahayaan ruangan hangat.`,
            popupText: 'DITANYAIN 3 TEMEN SEKALIGUS! 💬',
            sfx: 'Bag zipper & iPhone notification ping',
          },
          {
            type: 'Relatable Micro-Pain Point',
            formulaGroup: 'Cerita & Relatable',
            hookDialog: `Capek gak sih tiap pagi harus ribet ngulang hal yang sama? Untung kemarin nemu ${safeProd} ini.`,
            visualAction: `Kreator menghela napas lega sambil meletakkan ${safeProd} dengan mantap di atas meja.`,
            popupText: 'SOLUSI ANTI-RIBET TIAP PAGI ⏰',
            sfx: 'Heartbeat thud & Soft pop',
          },
          {
            type: 'Myth-Busting / Plot Twist',
            formulaGroup: 'Edukasi & Twist',
            hookDialog: `Tadinya aku kira ${safeProd} cuma menang viral doang—ternyata pas diuji langsung, malah kebalikannya!`,
            visualAction: `Tangan memutar kemasan ${safeProd} 45 derajat di depan latar bersih tanpa distorsi.`,
            popupText: 'KIRAIN GIMMICK, TERNYATA... 🤯',
            sfx: 'Vine boom & Level up victory chime',
          },
          {
            type: 'Live Stress-Test (Tanpa Cut)',
            formulaGroup: 'Visual & Proof',
            hookDialog: `Katanya ${safeProd} kualitasnya juara? Oke, kita tes langsung tanpa cut di depan kamera sekarang!`,
            visualAction: `Sudut POV over-the-shoulder menyorot tangan langsung mendemonstrasikan pemakaian ${safeProd} secara real-time.`,
            popupText: 'LIVE TEST TANPA FILTER & CUT! 🔍',
            sfx: 'Boxing bell ring & Camera shutter click',
          },
          {
            type: 'Smart Buyer Value Math',
            formulaGroup: 'Edukasi & Twist',
            hookDialog: `Ngapain keluar duit berkali lipat kalau ${safeProd} ini udah ngasih hasil setara produk jutaan?`,
            visualAction: `Split komposisi tangan meletakkan ${safeProd} di atas meja linen dengan bayangan kontak seragam.`,
            popupText: 'HEMAT 70% KUALITAS JUARA 💎',
            sfx: 'Cha-ching cash register & Fast whip whoosh',
          },
        ]);
      }
    } catch (e) {
      console.error('Failed to load hooks:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHooks();
    }
  }, [isOpen, productName, category]);

  if (!isOpen) return null;

  const displayedHooks =
    activeGroupFilter === 'Semua'
      ? hooks
      : hooks.filter((h) => h.formulaGroup === activeGroupFilter);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#0f1422] border border-[#23304d] rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-[#1f2a42] flex items-center justify-between bg-gradient-to-r from-[#141b2e] to-[#101625]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-600 flex items-center justify-center text-white shadow-lg shadow-amber-900/40 shrink-0">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2 flex-wrap">
                <span>8 Formula Hook Viral 3 Detik (A/B/C Testing)</span>
                <span className="text-[10px] bg-amber-950 text-amber-300 border border-amber-700/50 px-2 py-0.5 rounded-full font-bold">
                  Anti-Klise R&amp;D
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Tambahkan sebagai varian A/B Hook baru atau ganti Hook aktif di Adegan 1 untuk meningkatkan retensi.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchHooks}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-amber-300 hover:text-white bg-[#172035] hover:bg-[#1e2a45] border border-amber-500/30 transition-colors cursor-pointer"
              title="Generate 8 variasi formula baru"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh Formula</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#1a2338] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Formula Filter Bar */}
        <div className="px-5 py-2.5 border-b border-[#1b253b] bg-[#0b101c] flex items-center gap-1.5 overflow-x-auto custom-scrollbar">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1 shrink-0 flex items-center gap-1">
            <Layers className="w-3 h-3 text-amber-400" />
            <span>Kategori Formula:</span>
          </span>
          {FORMULA_FILTERS.map((group) => (
            <button
              key={group}
              type="button"
              onClick={() => setActiveGroupFilter(group)}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                activeGroupFilter === group
                  ? 'bg-amber-400 text-black shadow-sm'
                  : 'bg-[#131a2b] text-slate-400 hover:text-slate-200 border border-[#222f4b]'
              }`}
            >
              {group}
            </button>
          ))}
        </div>

        {/* Content List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 custom-scrollbar">
          {isLoading ? (
            <div className="py-16 text-center space-y-3">
              <Sparkles className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
              <p className="text-sm font-semibold text-slate-300">
                Menyusun 8 formula hook viral untuk &ldquo;{productName || 'Produk'}&rdquo;...
              </p>
            </div>
          ) : (
            displayedHooks.map((h, i) => (
              <div
                key={`${h.type}-${i}`}
                className="p-4 rounded-xl bg-[#131a29] border border-[#212d47] hover:border-amber-500/50 transition-all group relative"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-md bg-amber-950/80 text-amber-300 border border-amber-600/30 tracking-wider">
                      {h.type}
                    </span>
                    {h.formulaGroup && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-purple-950/70 text-purple-300 border border-purple-700/40">
                        {h.formulaGroup}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onSelectHook(h, 'add_variant');
                        onClose();
                      }}
                      className="flex items-center gap-1 text-[11px] font-bold text-purple-200 hover:text-white bg-purple-950/70 hover:bg-purple-800/80 border border-purple-500/40 px-2.5 py-1.5 rounded-lg transition-all active:scale-95 cursor-pointer"
                      title="Simpan sebagai Varian A/B Hook baru tanpa menimpa Hook utama"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah Varian A/B</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onSelectHook(h, 'replace');
                        onClose();
                      }}
                      className="flex items-center gap-1 text-[11px] font-bold text-amber-300 hover:text-amber-100 bg-amber-950/50 hover:bg-amber-900/70 border border-amber-500/40 px-2.5 py-1.5 rounded-lg transition-all active:scale-95 cursor-pointer"
                    >
                      <span>Pakai di Hook Aktif</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="text-sm font-bold text-white mb-2.5 leading-snug">
                  &ldquo;{h.hookDialog}&rdquo;
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-2.5 border-t border-[#1b253b] text-xs">
                  <div className="flex items-start gap-1.5 text-slate-300">
                    <Video className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                    <span className="text-[11px] leading-tight text-slate-300">{h.visualAction}</span>
                  </div>
                  <div className="flex items-start gap-1.5 text-sky-300">
                    <Type className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                    <span className="text-[11px] leading-tight font-bold">{h.popupText}</span>
                  </div>
                  <div className="flex items-start gap-1.5 text-amber-300">
                    <Music2 className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span className="text-[11px] leading-tight italic">{h.sfx}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
