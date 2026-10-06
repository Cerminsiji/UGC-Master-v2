import React, { useState } from 'react';
import {
  Sparkles,
  Download,
  FolderOpen,
  Plus,
  Tv,
  Coins,
  LayoutGrid,
  FileSpreadsheet,
  Pencil,
  Code,
  Check,
  Flame,
  Zap,
  Lock
} from 'lucide-react';
import { StoryboardViewMode, Scene } from '../types';
import { formatDuration } from '../utils/helpers';

interface HeaderProps {
  title: string;
  categoryBadge: string;
  scenes: Scene[];
  viewMode: StoryboardViewMode;
  onViewModeChange: (mode: StoryboardViewMode) => void;
  onTitleChange: (newTitle: string) => void;
  onOpenAIGenerator: () => void;
  onOpenHooksModal: () => void;
  onOpenTeleprompter: () => void;
  onOpenExportModal: () => void;
  onOpenProjectsModal: () => void;
  onAddScene: () => void;
  onCopyJSON?: () => void;
  isJsonCopied?: boolean;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  categoryBadge,
  scenes,
  viewMode,
  onViewModeChange,
  onTitleChange,
  onOpenAIGenerator,
  onOpenHooksModal,
  onOpenTeleprompter,
  onOpenExportModal,
  onOpenProjectsModal,
  onAddScene,
  onCopyJSON,
  isJsonCopied,
  onLogout,
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState(title);

  const totalDuration = scenes.reduce((sum, sc) => sum + (Number(sc.duration) || 0), 0);

  const handleTitleSubmit = () => {
    if (tempTitle.trim()) {
      onTitleChange(tempTitle.trim());
    } else {
      setTempTitle(title);
    }
    setIsEditingTitle(false);
  };

  return (
    <header className="sticky top-0 z-30 bg-[#0a0e17]/95 backdrop-blur-md border-b border-[#1b253b] px-4 lg:px-6 py-2.5 font-['Plus_Jakarta_Sans',sans-serif]">
      <div className="max-w-[1700px] mx-auto flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
        
        {/* Left: Brand Identity & Active Storyboard Title */}
        <div className="flex items-center justify-between xl:justify-start gap-3.5">
          <div className="flex items-center gap-2.5 pr-3.5 border-r border-[#1e293f]">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white font-black text-sm shadow-md shadow-purple-900/40">
              U
            </div>
            <div>
              <div className="text-white font-extrabold text-sm tracking-tight leading-none flex items-center gap-1.5">
                <span>UGC Master Studio</span>
                <span className="text-[9px] bg-purple-950 text-purple-300 border border-purple-700/50 px-1.5 py-0.2 rounded font-bold">
                  PRO
                </span>
              </div>
              <div className="text-[9px] font-semibold text-purple-400 tracking-wider uppercase mt-0.5">
                Arsitek Naskah & Storyboard Viral
              </div>
            </div>
          </div>

          {/* Editable Title */}
          <div className="flex flex-col">
            {isEditingTitle ? (
              <input
                type="text"
                value={tempTitle}
                onChange={(e) => setTempTitle(e.target.value)}
                onBlur={handleTitleSubmit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleTitleSubmit();
                  if (e.key === 'Escape') {
                    setTempTitle(title);
                    setIsEditingTitle(false);
                  }
                }}
                autoFocus
                className="text-sm md:text-base font-bold text-white bg-[#141c2c] border border-purple-500 rounded-lg px-2.5 py-0.5 outline-none"
              />
            ) : (
              <div
                onClick={() => {
                  setTempTitle(title);
                  setIsEditingTitle(true);
                }}
                className="group flex items-center gap-2 cursor-pointer"
                title="Klik untuk mengganti nama naskah"
              >
                <h1 className="text-white font-bold text-sm md:text-base tracking-tight group-hover:text-purple-300 transition-colors line-clamp-1 max-w-[240px] sm:max-w-xs md:max-w-sm">
                  {title}
                </h1>
                <Pencil className="w-3 h-3 text-slate-500 group-hover:text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </div>
            )}
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[9px] font-bold text-purple-400 bg-purple-950/80 border border-purple-800/40 px-1.5 py-0.2 rounded uppercase tracking-wider">
                {categoryBadge}
              </span>
              <span className="text-[10px] text-slate-400">
                • {scenes.length} Adegan
              </span>
            </div>
          </div>
        </div>

        {/* Center: Creator Workflow Switcher (Cards / Table / Rate Card) */}
        <div className="flex items-center self-start xl:self-center bg-[#101625] border border-[#1e293f] p-1 rounded-xl shadow-inner overflow-x-auto max-w-full custom-scrollbar">
          <button
            onClick={() => onViewModeChange('cards')}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${
              viewMode === 'cards'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Editor Adegan</span>
          </button>

          <button
            onClick={() => onViewModeChange('table')}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${
              viewMode === 'table'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Tabel Naskah</span>
          </button>

          <button
            onClick={() => onViewModeChange('rate_card')}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${
              viewMode === 'rate_card'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Coins className="w-3.5 h-3.5" />
            <span>Rate Card UGC</span>
          </button>
        </div>

        {/* Right: Tools & Primary Actions */}
        <div className="flex items-center flex-wrap gap-2 justify-end">
          
          {/* Duration Counter Pill */}
          <div
            className="flex items-center gap-1.5 bg-[#101726] border border-[#1e2a42] rounded-xl px-2.5 py-1 text-xs"
            title="Total durasi semua adegan"
          >
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Total:
            </span>
            <span className="font-mono font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-1.5 py-0.5 rounded text-xs">
              {formatDuration(totalDuration)}
            </span>
          </div>

          {/* Quick Viral Hooks */}
          <button
            onClick={onOpenHooksModal}
            className="flex items-center gap-1 bg-[#121927] hover:bg-[#1b253b] text-amber-300 border border-amber-500/30 text-xs font-semibold px-2.5 py-1.5 rounded-xl transition-all active:scale-95 shadow-sm"
            title="Pilih variasi hook 3 detik viral"
          >
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Hook 3s</span>
          </button>

          {/* Teleprompter for Shooting */}
          <button
            onClick={onOpenTeleprompter}
            className="flex items-center gap-1 bg-[#121927] hover:bg-[#1b253b] text-indigo-300 border border-indigo-500/30 text-xs font-semibold px-2.5 py-1.5 rounded-xl transition-all active:scale-95"
            title="Buka Teleprompter layar penuh untuk rekam video"
          >
            <Tv className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden 2xl:inline">Teleprompter</span>
          </button>

          {/* 1-Click Direct Copy JSON Storyboard */}
          {onCopyJSON && (
            <button
              onClick={onCopyJSON}
              className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-xl transition-all active:scale-95 shadow-sm border ${
                isJsonCopied
                  ? 'bg-emerald-950/80 border-emerald-500/80 text-emerald-300'
                  : 'bg-[#121927] hover:bg-purple-950/40 text-purple-300 hover:text-white border-purple-500/40'
              }`}
              title="Salin data struktur JSON lengkap Storyboard ke Clipboard (1 Klik)"
            >
              {isJsonCopied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="font-bold">JSON Tersalin!</span>
                </>
              ) : (
                <>
                  <Code className="w-3.5 h-3.5 text-purple-400" />
                  <span className="font-bold hidden sm:inline">Copy JSON</span>
                </>
              )}
            </button>
          )}

          {/* Export / Share Modal */}
          <button
            onClick={onOpenExportModal}
            className="flex items-center gap-1 bg-[#121927] hover:bg-[#1b253b] text-slate-200 border border-[#222e47] text-xs font-semibold px-2.5 py-1.5 rounded-xl transition-all active:scale-95"
            title="Download PDF, Naskah TXT, CapCut Cue, atau kelola JSON"
          >
            <Download className="w-3.5 h-3.5 text-slate-300" />
            <span className="hidden sm:inline">Export</span>
          </button>

          {/* Project & Storyboard Manager (Naskah Saya) */}
          <button
            onClick={onOpenProjectsModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#121927] hover:bg-[#1b253b] text-slate-200 border border-[#222e47] text-xs font-semibold transition-all active:scale-95"
            title="Kelola semua naskah dan parameter UGC (Naskah Saya)"
          >
            <FolderOpen className="w-4 h-4 text-purple-400" />
            <span className="hidden sm:inline font-bold">Naskah Saya</span>
          </button>

          {/* Primary Action Button: Deteksi Produk */}
          <button
            onClick={onOpenAIGenerator}
            className="flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold px-3.5 py-1.5 rounded-xl shadow-md shadow-purple-950/50 transition-all active:scale-95 border border-purple-400/30"
            title="Deteksi produk dari link & buat storyboard otomatis"
          >
            <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300/30" />
            <span>Deteksi Produk</span>
          </button>

          {/* Quick Add Scene */}
          <button
            onClick={onAddScene}
            className="flex items-center gap-1 bg-purple-900/60 hover:bg-purple-800 text-purple-100 border border-purple-600/40 text-xs font-bold px-2.5 py-1.5 rounded-xl transition-all active:scale-95"
            title="Tambah adegan baru"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Adegan</span>
          </button>

          {/* Lock / Logout Button */}
          {onLogout && (
            <button
              onClick={onLogout}
              className="p-1.5 rounded-xl bg-[#121927] hover:bg-red-950/40 text-slate-400 hover:text-red-300 border border-[#222e47] hover:border-red-800/40 transition-all active:scale-95"
              title="Kunci Studio (Keluar)"
            >
              <Lock className="w-3.5 h-3.5" />
            </button>
          )}

        </div>
      </div>
    </header>
  );
};
