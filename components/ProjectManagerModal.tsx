import React, { useState } from 'react';
import {
  X,
  Plus,
  FolderOpen,
  Trash2,
  Copy,
  Clock,
  CheckCircle2,
  FileVideo,
  Sparkles,
  ExternalLink,
  Tag,
  User,
  Volume2,
  Share2,
  FileText,
  Layers,
  ArrowRight,
  Check,
  Smartphone,
  Info
} from 'lucide-react';
import { StoryboardProject, PublicAppUser } from '../types';
import { formatDuration, copyToClipboard } from '../utils/helpers';
import { UGC_CATEGORIES } from '../data/categories';
import { sanitizeTabName } from '../utils/storyboardStorage';

interface ProjectManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: StoryboardProject[];
  currentProjectId: string;
  onSelectProject: (projectId: string) => void;
  onCreateNewProject: () => void;
  onDuplicateProject: (project: StoryboardProject) => void;
  onDeleteProject: (projectId: string) => void;
  currentUser?: PublicAppUser | null;
}

export const ProjectManagerModal: React.FC<ProjectManagerModalProps> = ({
  isOpen,
  onClose,
  projects,
  currentProjectId,
  onSelectProject,
  onCreateNewProject,
  onDuplicateProject,
  onDeleteProject,
  currentUser,
}) => {
  const [selectedId, setSelectedId] = useState<string>(currentProjectId || (projects[0]?.id || ''));
  const [activeTab, setActiveTab] = useState<'all' | 'deskripsi' | 'usp' | 'caption' | 'adegan'>('all');
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Sync selected project during render when currentProjectId changes
  const [prevCurrentProjectId, setPrevCurrentProjectId] = useState(currentProjectId);
  if (prevCurrentProjectId !== currentProjectId) {
    setPrevCurrentProjectId(currentProjectId);
    if (currentProjectId && projects.some((p) => p.id === currentProjectId)) {
      setSelectedId(currentProjectId);
    } else if (projects[0]) {
      setSelectedId(projects[0].id);
    }
  }

  if (!isOpen) return null;

  const activeProject = projects.find((p) => p.id === selectedId) || projects[0];
  const categoryInfo = UGC_CATEGORIES.find((c) => c.id === activeProject?.categoryId);

  const totalSeconds = activeProject?.scenes.reduce(
    (sum, sc) => sum + (Number(sc.duration) || 0),
    0
  ) || 0;

  // Copy full script as formatted text
  const handleCopyFullScript = async () => {
    if (!activeProject) return;

    let text = `==============================\n`;
    text += `NASKAH STORYBOARD UGC: ${activeProject.title.toUpperCase()}\n`;
    text += `Produk: ${activeProject.productName || '-'}\n`;
    if (activeProject.productUrl) text += `Link Produk: ${activeProject.productUrl}\n`;
    if (activeProject.persona) text += `Persona Talent: ${activeProject.persona}\n`;
    if (activeProject.tone) text += `Voice Tone: ${activeProject.tone}\n`;
    if (activeProject.keySellingPoints) text += `USP: ${activeProject.keySellingPoints}\n`;
    text += `Total Durasi: ${totalSeconds} Detik (${activeProject.scenes.length} Adegan)\n`;
    text += `==============================\n\n`;

    text += `[CAPTION & HASHTAGS]\n`;
    text += `${activeProject.caption || '-'}\n\n`;

    text += `[RINCIAN SEMUA ADEGAN]\n`;
    activeProject.scenes.forEach((sc, idx) => {
      text += `----------------------------------------\n`;
      text += `ADEGAN ${idx + 1} (${sc.duration}s) [${sc.cameraAngle}]\n`;
      text += `Visual / Action : ${sc.visualAction}\n`;
      text += `Voiceover (VO)  : "${sc.dialogVO}"\n`;
      text += `Pop-up Text     : ${sc.popupText}\n`;
      text += `Sound Effect    : ${sc.soundEffect}\n`;
      if (sc.notesMood) text += `Catatan / Mood  : ${sc.notesMood}\n`;
    });

    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2000);
    }
  };

  const handleCopyCaption = async () => {
    if (!activeProject?.caption) return;
    const ok = await copyToClipboard(activeProject.caption);
    if (ok) {
      setCopiedCaption(true);
      setTimeout(() => setCopiedCaption(false), 2000);
    }
  };

  const handleCopyUrl = async () => {
    if (!activeProject?.productUrl) return;
    const ok = await copyToClipboard(activeProject.productUrl);
    if (ok) {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-md animate-fadeIn font-['Plus_Jakarta_Sans',sans-serif]">
      <div className="bg-[#0c101c] border border-[#212d47] rounded-3xl w-full max-w-5xl h-[92vh] max-h-[900px] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Modal Header */}
        <div className="p-4 md:p-5 border-b border-[#1c273e] flex items-center justify-between bg-gradient-to-r from-[#111728] via-[#0f1524] to-[#0d1220]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-700 to-indigo-600 border border-purple-500/40 flex items-center justify-center text-white shadow-lg shadow-purple-950/50">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-extrabold text-white tracking-tight">
                  Project & Storyboard Manager (Naskah Saya)
                </h2>
                <span className="text-[11px] font-mono tabular-nums text-purple-300 bg-purple-950/80 border border-purple-700/60 px-2 py-0.5 rounded font-bold">
                  {projects.length} Naskah
                </span>
                {currentUser && (
                  <span className="text-[11px] font-mono text-emerald-300 bg-emerald-950/70 border border-emerald-700/50 px-2 py-0.5 rounded font-semibold">
                    Sheet: {currentUser.sheetTabName || sanitizeTabName(currentUser.username)}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Pusat data naskah Google Sheets: link produk, informasi produk, USP, persona, durasi, angle kamera, tone, caption, dan adegan.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onCreateNewProject}
              className="flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow-md shadow-purple-950/50 transition-all active:scale-95 border border-purple-400/30"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Buat Naskah Baru</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-[#182236] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Main Content: 2-Column Split */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          
          {/* LEFT COLUMN: Project List */}
          <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-[#1a2337] bg-[#090d18] flex flex-col shrink-0">
            <div className="p-3 border-b border-[#182136] bg-[#0c101d] flex items-center justify-between text-xs text-slate-400 font-semibold">
              <span className="uppercase tracking-wider text-[10px] font-bold text-slate-300">
                Daftar Naskah
              </span>
              <span>{projects.length} Total</span>
            </div>

            <div className="flex-1 overflow-y-auto p-2.5 space-y-2 custom-scrollbar">
              {projects.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  Belum ada naskah tersimpan.
                </div>
              ) : (
                projects.map((proj) => {
                  const isSelected = proj.id === selectedId;
                  const isCurrentActive = proj.id === currentProjectId;
                  const projSecs = proj.scenes.reduce(
                    (sum, sc) => sum + (Number(sc.duration) || 0),
                    0
                  );

                  return (
                    <div
                      key={proj.id}
                      onClick={() => setSelectedId(proj.id)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer relative group ${
                        isSelected
                          ? 'bg-gradient-to-r from-purple-950/60 to-indigo-950/40 border-purple-500/80 shadow-lg shadow-purple-950/40 ring-1 ring-purple-500/30'
                          : 'bg-[#101625] border-[#1c273e] hover:border-[#2a3a5c] hover:bg-[#141b2c]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1 mb-1.5">
                        <h4 className="text-xs font-bold text-white group-hover:text-purple-300 transition-colors line-clamp-1">
                          {proj.title}
                        </h4>
                        {isCurrentActive && (
                          <span className="text-[9px] bg-emerald-950 text-emerald-300 border border-emerald-700/60 px-1.5 py-0.2 rounded font-bold shrink-0">
                            Aktif di Editor
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mb-2">
                        <span className="text-purple-400 font-bold uppercase tracking-wider">
                          {proj.categoryId}
                        </span>
                        <span>•</span>
                        <span>{proj.scenes.length} Adegan</span>
                        <span>•</span>
                        <span className="font-mono text-emerald-400 font-bold">
                          {formatDuration(projSecs)}
                        </span>
                      </div>

                      {/* Snippet / Persona / Product */}
                      <div className="text-[10px] text-slate-400 line-clamp-1">
                        {proj.productName ? (
                          <span className="text-slate-300 font-medium">
                            📦 {proj.productName}
                          </span>
                        ) : (
                          <span className="italic">Naskah UGC Siap Syuting</span>
                        )}
                      </div>

                      {/* Quick duplicate/delete row on hover */}
                      <div className="flex items-center justify-between pt-2 mt-2 border-t border-[#1a2336] text-[10px]">
                        <span className="text-slate-500">
                          {proj.createdAt ? new Date(proj.createdAt).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                          }) : 'Baru saja'}
                        </span>

                        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDuplicateProject(proj);
                            }}
                            className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#1f2b45] transition-colors"
                            title="Duplikat naskah"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteProject(proj.id);
                            }}
                            disabled={projects.length <= 1}
                            className="p-1 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-950/50 transition-colors disabled:opacity-20"
                            title="Hapus naskah"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Comprehensive Inspector / Storyboard Detail */}
          {activeProject ? (
            <div className="flex-1 flex flex-col min-w-0 bg-[#0c101d] overflow-hidden">
              
              {/* Top Banner of Selected Project */}
              <div className="p-4 md:p-5 border-b border-[#1b253b] bg-gradient-to-r from-[#12182a] to-[#0f1423] flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="min-w-0">
                  <div className="flex items-center flex-wrap gap-2 mb-1">
                    <span className="text-[10px] bg-purple-950 text-purple-300 border border-purple-700/60 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                      {categoryInfo?.name || activeProject.categoryId}
                    </span>
                    {activeProject.persona && (
                      <span className="text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-700/60 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                        <User className="w-3 h-3" />
                        <span>Persona: {activeProject.persona}</span>
                      </span>
                    )}
                    {activeProject.tone && (
                      <span className="text-[10px] bg-amber-950 text-amber-300 border border-amber-700/60 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                        <Volume2 className="w-3 h-3" />
                        <span>{activeProject.tone}</span>
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-2 py-0.5 rounded-full font-bold">
                      ⏱ {formatDuration(totalSeconds)} • {activeProject.scenes.length} Adegan
                    </span>
                  </div>

                  <h3 className="text-lg font-black text-white truncate tracking-tight">
                    {activeProject.title}
                  </h3>
                  {activeProject.productName && (
                    <p className="text-xs text-slate-300 font-medium mt-0.5">
                      Produk: <span className="text-purple-300 font-bold">{activeProject.productName}</span>
                    </p>
                  )}
                </div>

                {/* Primary Actions for This Project */}
                <div className="flex items-center flex-wrap gap-2">
                  <button
                    onClick={handleCopyFullScript}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-[#141c2e] hover:bg-[#1b263e] text-slate-200 border border-[#23304d] transition-all active:scale-95 shadow-sm"
                    title="Salin seluruh naskah dan dialog ke clipboard"
                  >
                    {copiedScript ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-300">Naskah Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-purple-400" />
                        <span>Salin Naskah (TXT)</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      onSelectProject(activeProject.id);
                      onClose();
                    }}
                    className="flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-lg shadow-purple-950/50 transition-all active:scale-95 border border-purple-400/40"
                  >
                    <span>Muat ke Editor</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Detail Navigation Tabs */}
              <div className="flex items-center gap-1 px-4 py-2 border-b border-[#182136] bg-[#0a0e19] overflow-x-auto custom-scrollbar">
                {[
                  { id: 'all', label: 'Ringkasan Lengkap' },
                  { id: 'deskripsi', label: 'Deskripsi & Link Produk' },
                  { id: 'usp', label: 'Parameter UGC & USP' },
                  { id: 'caption', label: 'Caption & Hashtags' },
                  { id: 'adegan', label: `Semua Adegan (${activeProject.scenes.length})` },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'bg-purple-600 text-white shadow-sm shadow-purple-900/40'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-[#131a2b]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Inspector Content Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
                
                {/* SECTION 1: Deskripsi Produk & Link Hasil Ekstraksi */}
                {(activeTab === 'all' || activeTab === 'deskripsi') && (
                  <div className="bg-[#101626] border border-[#1d273e] rounded-2xl p-4 shadow-sm space-y-3">
                    <div className="flex items-center justify-between border-b border-[#182136] pb-2.5">
                      <div className="flex items-center gap-2">
                        <div className="p-1 rounded-lg bg-purple-600/20 text-purple-400 border border-purple-500/30">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </div>
                        <h4 className="text-xs font-black text-white uppercase tracking-wider">
                          Data Deskripsi & Link Hasil Ekstraksi
                        </h4>
                      </div>
                      {activeProject.productUrl && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={handleCopyUrl}
                            className="text-[11px] font-semibold text-purple-300 hover:text-white bg-purple-950/70 border border-purple-700/50 px-2 py-0.5 rounded-lg flex items-center gap-1"
                          >
                            {copiedUrl ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedUrl ? 'Tersalin' : 'Salin Link'}</span>
                          </button>
                          <a
                            href={activeProject.productUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] font-semibold text-indigo-300 hover:text-white bg-indigo-950/70 border border-indigo-700/50 px-2 py-0.5 rounded-lg flex items-center gap-1"
                          >
                            <span>Buka Link</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                          Nama Produk
                        </label>
                        <div className="p-2.5 rounded-xl bg-[#090d18] border border-[#1c263c] text-xs font-bold text-white">
                          {activeProject.productName || 'Belum diisi'}
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                          Link Ekstraksi Asli
                        </label>
                        <div className="p-2.5 rounded-xl bg-[#090d18] border border-[#1c263c] text-xs text-purple-300 font-mono truncate">
                          {activeProject.productUrl || 'Tidak ada URL (Input manual naskah)'}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        Deskripsi Lengkap Produk
                      </label>
                      <div className="p-3 rounded-xl bg-[#090d18] border border-[#1c263c] text-xs text-slate-300 leading-relaxed">
                        {activeProject.productDescription ||
                          'Kopi hijau herbal penurun berat badan alami dengan ekstrak sago yang mengontrol nafsu makan seharian.'}
                      </div>
                    </div>
                  </div>
                )}

                {/* SECTION 2: Parameter UGC & Data USP */}
                {(activeTab === 'all' || activeTab === 'usp') && (
                  <div className="bg-[#101626] border border-[#1d273e] rounded-2xl p-4 shadow-sm space-y-3">
                    <div className="flex items-center gap-2 border-b border-[#182136] pb-2.5">
                      <div className="p-1 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                        <Tag className="w-3.5 h-3.5" />
                      </div>
                      <h4 className="text-xs font-black text-white uppercase tracking-wider">
                        Data USP & Parameter UGC
                      </h4>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                      <div className="p-3 rounded-xl bg-[#090d18] border border-[#1c263c]">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                          Persona Talent
                        </span>
                        <div className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{activeProject.persona || 'Wanita'}</span>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-[#090d18] border border-[#1c263c]">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                          Voice Tone
                        </span>
                        <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                          <Volume2 className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{activeProject.tone || 'Santai & Meyakinkan'}</span>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-[#090d18] border border-[#1c263c]">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                          Target Platform
                        </span>
                        <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                          <Smartphone className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{activeProject.targetPlatform || 'TikTok Shop'}</span>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-[#090d18] border border-[#1c263c]">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                          Target Durasi
                        </span>
                        <div className="text-xs font-bold font-mono tabular-nums text-sky-300 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          <span>{activeProject.targetDuration || totalSeconds} Detik</span>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-[#090d18] border border-[#1c263c]">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                          Angle Kamera
                        </span>
                        <div className="text-xs font-bold text-purple-300 truncate">
                          {activeProject.cameraAngleStyle || 'Dinamis Multi-Angle'}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                          Poin Penjualan Utama (USP / Parameter UGC)
                        </span>
                        <div className="p-3 rounded-xl bg-[#090d18] border border-[#1c263c] text-xs text-slate-200 leading-relaxed font-medium">
                          {activeProject.keySellingPoints ||
                            'Rasa enak gak pahit, bikin kenyang lebih lama, aman lambung, BPOM & Halal.'}
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                          Target Audiens
                        </span>
                        <div className="p-3 rounded-xl bg-[#090d18] border border-[#1c263c] text-xs text-slate-300 leading-relaxed">
                          {activeProject.targetAudience ||
                            'Pria dan wanita usia 22-45 tahun yang ingin badan lebih ramping tanpa diet menyiksa.'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* SECTION 3: Caption & Hashtags Postingan */}
                {(activeTab === 'all' || activeTab === 'caption') && (
                  <div className="bg-[#101626] border border-[#1d273e] rounded-2xl p-4 shadow-sm space-y-3">
                    <div className="flex items-center justify-between border-b border-[#182136] pb-2.5">
                      <div className="flex items-center gap-2">
                        <div className="p-1 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          <Sparkles className="w-3.5 h-3.5" />
                        </div>
                        <h4 className="text-xs font-black text-white uppercase tracking-wider">
                          Caption & Hashtags Postingan
                        </h4>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full border ${
                            (activeProject.caption || '').length <= 150
                              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/50'
                              : 'bg-red-950/80 text-red-300 border-red-700/50'
                          }`}
                        >
                          {(activeProject.caption || '').length} / 150 Karakter
                        </span>

                        <button
                          type="button"
                          onClick={handleCopyCaption}
                          className="text-[11px] font-bold text-purple-300 hover:text-white bg-purple-950/70 border border-purple-700/50 px-2.5 py-1 rounded-lg flex items-center gap-1 active:scale-95 transition-all"
                        >
                          {copiedCaption ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedCaption ? 'Tersalin!' : 'Salin Caption'}</span>
                        </button>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-[#090d18] border border-[#1c263c] text-xs text-slate-200 leading-relaxed font-medium">
                      {activeProject.caption ||
                        'Cobain Sago Green Coffee! Bikin makin pede & hasil nyata. Klik keranjang di bawah mumpung promo! ✨ #fyp #viral'}
                    </div>
                  </div>
                )}

                {/* SECTION 4: Semua Adegan Storyboard */}
                {(activeTab === 'all' || activeTab === 'adegan') && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-1 rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
                          <Layers className="w-3.5 h-3.5" />
                        </div>
                        <h4 className="text-xs font-black text-white uppercase tracking-wider">
                          Semua Adegan Storyboard ({activeProject.scenes.length} Adegan)
                        </h4>
                      </div>

                      <span className="text-xs text-slate-400">
                        Total durasi: <strong className="text-emerald-400 font-mono">{formatDuration(totalSeconds)}</strong>
                      </span>
                    </div>

                    <div className="space-y-3">
                      {activeProject.scenes.map((scene, idx) => (
                        <div
                          key={scene.id || idx}
                          className="bg-[#101626] border border-[#1d273e] hover:border-purple-500/40 rounded-2xl p-4 shadow-sm transition-all"
                        >
                          <div className="flex items-center justify-between border-b border-[#182136] pb-2.5 mb-3">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-lg bg-purple-950 border border-purple-700/60 text-purple-300 text-xs font-black flex items-center justify-center">
                                {idx + 1}
                              </span>
                              <span className="text-xs font-bold text-white">
                                Adegan {idx + 1}
                              </span>
                              <span className="text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-700/50 px-2 py-0.5 rounded-full font-bold">
                                {scene.cameraAngle || 'Medium Shot'}
                              </span>
                              {idx === 0 && (
                                <span className="text-[10px] bg-amber-950 text-amber-300 border border-amber-700/50 px-2 py-0.5 rounded-full font-bold">
                                  🔥 Viral Hook 3s
                                </span>
                              )}
                            </div>

                            <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/70 border border-emerald-800/40 px-2 py-0.5 rounded-lg">
                              {scene.duration}s
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                            <div className="space-y-1">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                Visual / Action Talent
                              </span>
                              <p className="text-slate-200 leading-relaxed p-2.5 rounded-xl bg-[#090d18] border border-[#1a2338]">
                                {scene.visualAction}
                              </p>
                            </div>

                            <div className="space-y-1">
                              <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">
                                Dialog / Voiceover (VO)
                              </span>
                              <p className="text-purple-200 font-medium leading-relaxed p-2.5 rounded-xl bg-purple-950/20 border border-purple-800/30">
                                &ldquo;{scene.dialogVO}&rdquo;
                              </p>
                            </div>

                            <div className="space-y-1">
                              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                                Pop-up Text Overlay
                              </span>
                              <p className="text-amber-200 font-bold p-2 rounded-xl bg-amber-950/20 border border-amber-800/30 text-[11px]">
                                {scene.popupText || '-'}
                              </p>
                            </div>

                            <div className="space-y-1">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                Sound Effect (SFX) & Mood
                              </span>
                              <p className="text-slate-300 p-2 rounded-xl bg-[#090d18] border border-[#1a2338] text-[11px]">
                                🎵 {scene.soundEffect || '-'} {scene.notesMood ? `• ${scene.notesMood}` : ''}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            </div>
          ) : null}

        </div>

      </div>
    </div>
  );
};
