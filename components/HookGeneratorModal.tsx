import React, { useState, useEffect } from 'react';
import {
  Flame,
  X,
  Sparkles,
  Check,
  Music2,
  Type,
  Video,
  ArrowRight,
  RefreshCw
} from 'lucide-react';
import { AIHookOption } from '../types';

interface HookGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  productName: string;
  category: string;
  onSelectHook: (hook: AIHookOption) => void;
}

export const HookGeneratorModal: React.FC<HookGeneratorModalProps> = ({
  isOpen,
  onClose,
  productName,
  category,
  onSelectHook,
}) => {
  const [hooks, setHooks] = useState<AIHookOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchHooks = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/generate-hooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName, category }),
      });
      const rawText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(rawText);
      } catch {
        data = {};
      }
      if (data.success && data.hooks) {
        setHooks(data.hooks);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#0f1422] border border-[#23304d] rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-5 border-b border-[#1f2a42] flex items-center justify-between bg-gradient-to-r from-[#141b2e] to-[#101625]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-600 flex items-center justify-center text-white shadow-lg shadow-amber-900/40">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>5 Variasi Hook 3 Detik Viral</span>
                <span className="text-[10px] bg-amber-950 text-amber-300 border border-amber-700/50 px-2 py-0.5 rounded-full font-bold">
                  Stop-Scroll Formula
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Pilih hook terbaik untuk mengganti Adegan 1 dan meningkatkan retensi penonton.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchHooks}
              disabled={isLoading}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#1a2338] transition-colors"
              title="Generate variasi baru"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#1a2338] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 custom-scrollbar">
          {isLoading ? (
            <div className="py-16 text-center space-y-3">
              <Sparkles className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
              <p className="text-sm font-semibold text-slate-300">
                Menyusun 5 hook viral untuk &ldquo;{productName || 'Produk'}&rdquo;...
              </p>
            </div>
          ) : (
            hooks.map((h, i) => (
              <div
                key={i}
                className="p-4 rounded-xl bg-[#131a29] border border-[#212d47] hover:border-amber-500/50 transition-all group relative"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-md bg-amber-950/80 text-amber-300 border border-amber-600/30 tracking-wider">
                    {h.type}
                  </span>
                  <button
                    onClick={() => {
                      onSelectHook(h);
                      onClose();
                    }}
                    className="flex items-center gap-1 text-xs font-bold text-amber-400 hover:text-amber-200 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-500/30 px-3 py-1.5 rounded-lg transition-all active:scale-95"
                  >
                    <span>Gunakan Hook Ini</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="text-sm font-bold text-white mb-2 leading-snug">
                  &ldquo;{h.hookDialog}&rdquo;
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-2 border-t border-[#1b253b] text-xs">
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
