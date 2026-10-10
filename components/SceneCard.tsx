import React, { useState } from 'react';
import {
  Video,
  Eye,
  Type,
  Music2,
  Mic,
  FileText,
  Clock,
  ArrowUp,
  ArrowDown,
  Copy,
  Trash2,
  Sparkles,
  ChevronDown,
  Plus,
  Minus,
  Check,
  Flame,
  AlertCircle,
  Layers,
  Image as ImageIcon,
  Wand2
} from 'lucide-react';
import { Scene, HookVariant } from '../types';
import { copyToClipboard } from '../utils/helpers';
import {
  CAMERA_ANGLE_PRESETS,
  SFX_PRESETS,
  SFX_CATEGORIES,
  VO_TONE_PRESETS,
  MOOD_PRESETS,
} from '../data/categories';

interface SceneCardProps {
  scene: Scene;
  index: number;
  totalScenes: number;
  onUpdate: (updatedScene: Scene) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onEnhanceAI: (scene: Scene) => void;
  onOpenHooksModal?: () => void;
  isEnhancing?: boolean;
  hookVariants?: HookVariant[];
  activeHookIndex?: number;
  onSelectHookVariant?: (variantIndex: number) => void;
  onAddHookVariant?: () => void;
}

export const SceneCard: React.FC<SceneCardProps> = ({
  scene,
  index,
  totalScenes,
  onUpdate,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
  onEnhanceAI,
  onOpenHooksModal,
  isEnhancing = false,
  hookVariants = [],
  activeHookIndex = 0,
  onSelectHookVariant,
  onAddHookVariant,
}) => {
  const [showAngleMenu, setShowAngleMenu] = useState(false);
  const [showSfxMenu, setShowSfxMenu] = useState(false);
  const [showMoodMenu, setShowMoodMenu] = useState(false);
  const [showVoMenu, setShowVoMenu] = useState(false);
  const [selectedSfxCat, setSelectedSfxCat] = useState<string>('Semua');
  const [copiedFlow, setCopiedFlow] = useState(false);

  const handleChange = (field: keyof Scene, value: any) => {
    onUpdate({
      ...scene,
      [field]: value,
    });
  };

  const handleDurationChange = (delta: number) => {
    const newDuration = Math.max(1, Math.min(60, (Number(scene.duration) || 1) + delta));
    handleChange('duration', newDuration);
  };

  // Dialog Speech Pacing Calculator (Standard Indo speech ~2.5 - 3 words per second)
  const dialogWords = (scene.dialogVO || '').trim().split(/\s+/).filter(Boolean);
  const wordCount = dialogWords.length;
  const currentDuration = Number(scene.duration) || 3;
  const estimatedSeconds = wordCount > 0 ? (wordCount / 2.7).toFixed(1) : '0';
  const isTooFast = wordCount > 0 && wordCount / currentDuration > 3.8;

  return (
    <div
      id={`scene-card-${scene.id}`}
      className={`bg-[#0f1422] border rounded-2xl p-4 sm:p-5 transition-all shadow-xl relative ${
        index === 0
          ? 'border-purple-600/60 shadow-purple-950/20'
          : 'border-[#1e293f] hover:border-[#2b3a58]'
      }`}
    >
      {/* Card Header: Scene Number Badge, Scene Type, Timing Stepper, and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 mb-4 border-b border-[#1c273e]">
        <div className="flex items-center flex-wrap gap-2">
          {/* Adegan Badge */}
          <span className="bg-gradient-to-r from-purple-800 to-indigo-800 text-purple-200 border border-purple-500/50 text-xs font-black px-3 py-1 rounded-lg uppercase tracking-wider shadow-sm">
            ADEGAN {index + 1}
          </span>

          {/* Special Hook Badge for Scene 1 */}
          {index === 0 && (
            <div className="flex items-center gap-1.5 bg-amber-950/80 text-amber-300 border border-amber-600/40 text-[11px] font-bold px-2.5 py-0.5 rounded-lg shadow-sm">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>Hook 3 Detik (Penentu FYP)</span>
            </div>
          )}

          {/* Closing / CTA Badge for Last Scene */}
          {index === totalScenes - 1 && totalScenes > 1 && (
            <span className="bg-emerald-950/80 text-emerald-300 border border-emerald-600/40 text-[11px] font-bold px-2.5 py-0.5 rounded-lg">
              🛒 Call to Action (Keranjang Kuning)
            </span>
          )}
        </div>

        {/* Right Header: Duration Stepper & Action Icons */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {/* Quick Duration Stepper */}
          <div className="flex items-center gap-1.5 bg-[#141b2b] border border-[#222e47] rounded-xl px-2.5 py-1">
            <Clock className="w-3 h-3 text-slate-400" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">
              Durasi:
            </span>

            <button
              type="button"
              onClick={() => handleDurationChange(-1)}
              className="w-5 h-5 rounded bg-[#1c263b] hover:bg-purple-900/60 text-slate-300 hover:text-white flex items-center justify-center text-xs transition-colors"
              title="Kurangi 1 detik"
            >
              <Minus className="w-2.5 h-2.5" />
            </button>

            <span className="font-mono font-bold text-xs text-emerald-400 min-w-[28px] text-center">
              {scene.duration}s
            </span>

            <button
              type="button"
              onClick={() => handleDurationChange(1)}
              className="w-5 h-5 rounded bg-[#1c263b] hover:bg-purple-900/60 text-slate-300 hover:text-white flex items-center justify-center text-xs transition-colors"
              title="Tambah 1 detik"
            >
              <Plus className="w-2.5 h-2.5" />
            </button>
          </div>

          {/* Move, Duplicate, AI Enhance, Delete */}
          <div className="flex items-center gap-0.5 bg-[#141b2b] border border-[#222e47] rounded-xl p-0.5">
            <button
              onClick={onMoveUp}
              disabled={index === 0}
              className={`p-1.5 rounded-lg transition-colors ${
                index === 0
                  ? 'text-slate-600 cursor-not-allowed'
                  : 'text-slate-400 hover:text-white hover:bg-[#1e2840]'
              }`}
              title="Pindahkan ke atas"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={onMoveDown}
              disabled={index === totalScenes - 1}
              className={`p-1.5 rounded-lg transition-colors ${
                index === totalScenes - 1
                  ? 'text-slate-600 cursor-not-allowed'
                  : 'text-slate-400 hover:text-white hover:bg-[#1e2840]'
              }`}
              title="Pindahkan ke bawah"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={onDuplicate}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1e2840] transition-colors"
              title="Duplikat adegan"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => onEnhanceAI(scene)}
              disabled={isEnhancing}
              className="p-1.5 rounded-lg text-purple-400 hover:text-purple-200 hover:bg-purple-950 transition-colors"
              title="Poles deskripsi & dialog adegan ini dengan AI"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isEnhancing ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={onDelete}
              disabled={totalScenes <= 1}
              className={`p-1.5 rounded-lg transition-colors ${
                totalScenes <= 1
                  ? 'text-slate-600 cursor-not-allowed'
                  : 'text-rose-400 hover:text-rose-200 hover:bg-rose-950/50'
              }`}
              title="Hapus adegan"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* A/B Hook Testing Variant Bar (Exclusively for Scene 1) */}
      {index === 0 && (
        <div className="mb-4 p-3 rounded-xl bg-gradient-to-r from-[#141b2c] to-[#0e1422] border border-amber-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1 mr-1">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span>A/B Hook Testing:</span>
            </span>

            {/* Hook Variant Buttons */}
            {(hookVariants.length > 0
              ? hookVariants
              : [
                  {
                    id: 'hook_a',
                    name: 'Hook A (Utama)',
                    type: 'FOMO',
                    dialogVO: scene.dialogVO,
                    visualAction: scene.visualAction,
                    popupText: scene.popupText,
                    soundEffect: scene.soundEffect,
                    duration: scene.duration,
                  },
                ]
            ).map((variant, vIdx) => (
              <button
                key={variant.id || vIdx}
                type="button"
                onClick={() => onSelectHookVariant && onSelectHookVariant(vIdx)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  activeHookIndex === vIdx
                    ? 'bg-amber-400 text-black shadow-md font-black scale-105'
                    : 'bg-[#192236] text-slate-300 hover:text-white border border-[#2a3854]'
                }`}
              >
                {variant.name || `Hook ${String.fromCharCode(65 + vIdx)}`}
              </button>
            ))}

            {onAddHookVariant && hookVariants.length < 3 && (
              <button
                type="button"
                onClick={onAddHookVariant}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-purple-300 hover:text-white bg-purple-950/80 hover:bg-purple-900 border border-purple-700/50 transition-colors flex items-center gap-1"
                title="Tambah varian hook pembuka (maksimal 3 variasi)"
              >
                <Plus className="w-3 h-3" />
                <span>+ Varian Hook</span>
              </button>
            )}
          </div>

          {onOpenHooksModal && (
            <button
              type="button"
              onClick={onOpenHooksModal}
              className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1.5 transition-colors self-end sm:self-auto bg-amber-950/50 px-2.5 py-1 rounded-lg border border-amber-500/30"
            >
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>Pilih Formula Hook Viral</span>
            </button>
          )}
        </div>
      )}

      {/* Card Content organized into 3 Visual Zones */}
      <div className="space-y-3.5">
        
        {/* ZONE 1: VISUAL & SCREEN (Apa yang dilihat penonton) */}
        <div className="p-3 rounded-xl bg-[#121826] border border-[#1d273e] space-y-3">
          <div className="flex items-center gap-2 text-[11px] font-bold text-indigo-300 uppercase tracking-wider">
            <Video className="w-3.5 h-3.5 text-indigo-400" />
            <span>1. Visual & Layar Smartphone</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            {/* Camera Angle */}
            <div className="lg:col-span-4 relative">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Eye className="w-3 h-3 text-purple-400" />
                  <span>Angle Kamera</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowAngleMenu(!showAngleMenu)}
                  className="text-[10px] text-purple-400 hover:text-purple-300 flex items-center gap-0.5 font-medium"
                >
                  <span>Pilihan</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>

              <input
                type="text"
                value={scene.cameraAngle}
                onChange={(e) => handleChange('cameraAngle', e.target.value)}
                placeholder="e.g. Medium Shot, POV, Close-up"
                className="w-full bg-[#0c101a] border border-[#202c44] focus:border-purple-500 rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 outline-none transition-colors"
              />

              {showAngleMenu && (
                <div className="absolute left-0 top-full mt-1.5 w-72 bg-[#121929] border border-[#2b3a58] rounded-xl shadow-2xl z-30 p-1.5 space-y-0.5 max-h-64 overflow-y-auto custom-scrollbar">
                  <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 mb-1 flex items-center justify-between">
                    <span>Pilihan Sudut Kamera ({CAMERA_ANGLE_PRESETS.length})</span>
                    <button
                      type="button"
                      onClick={() => setShowAngleMenu(false)}
                      className="text-slate-400 hover:text-white"
                    >
                      ✕
                    </button>
                  </div>
                  {CAMERA_ANGLE_PRESETS.map((angle) => (
                    <button
                      key={angle}
                      type="button"
                      onClick={() => {
                        handleChange('cameraAngle', angle);
                        setShowAngleMenu(false);
                      }}
                      className="w-full text-left text-xs px-2.5 py-1.5 rounded-lg text-slate-200 hover:bg-purple-900/40 hover:text-purple-200 transition-colors flex items-center justify-between"
                    >
                      <span className="truncate">{angle}</span>
                      {scene.cameraAngle === angle && (
                        <Check className="w-3 h-3 text-purple-400 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Visual Action Description */}
            <div className="lg:col-span-8">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Aksi Visual Talent / Produk
              </label>
              <textarea
                rows={2}
                value={scene.visualAction}
                onChange={(e) => handleChange('visualAction', e.target.value)}
                placeholder="Deskripsikan pergerakan talent, ekspresi, interaksi produk, dan lighting..."
                className="w-full bg-[#0c101a] border border-[#202c44] focus:border-purple-500 rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 outline-none transition-colors leading-relaxed resize-y"
              />
            </div>
          </div>

          {/* On-screen Popup Text */}
          <div>
            <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              <Type className="w-3 h-3 text-sky-400" />
              <span>Teks Pop-up di Layar (Overlay TikTok)</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={scene.popupText}
                onChange={(e) => handleChange('popupText', e.target.value)}
                placeholder="e.g. JANGAN SKIP DULU! 😱 atau HASIL 7 HARI!"
                className="flex-1 bg-[#0c101a] border border-[#202c44] focus:border-sky-500 rounded-xl px-3 py-1.5 text-xs font-bold text-sky-300 placeholder-slate-500 outline-none transition-colors"
              />
              {scene.popupText && (
                <span className="hidden sm:inline-block text-[10px] bg-sky-950 text-sky-300 border border-sky-700/40 px-2 py-1 rounded-lg shrink-0 font-mono">
                  Preview: {scene.popupText}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ZONE 2: AUDIO & NARRATION (Apa yang didengar penonton) */}
        <div className="p-3 rounded-xl bg-[#121826] border border-[#1d273e] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[11px] font-bold text-rose-300 uppercase tracking-wider">
              <Mic className="w-3.5 h-3.5 text-rose-400" />
              <span>2. Audio, Dialog & Efek Suara</span>
            </div>

            {/* Smart Voiceover Pacing Indicator */}
            {wordCount > 0 && (
              <div className="flex items-center gap-1.5 text-[10px]">
                <span className="text-slate-400 font-mono">{wordCount} kata</span>
                <span>•</span>
                <span
                  className={`font-semibold px-2 py-0.5 rounded-full border ${
                    isTooFast
                      ? 'bg-red-950/80 text-red-300 border-red-700/50'
                      : 'bg-emerald-950/80 text-emerald-300 border-emerald-700/50'
                  }`}
                >
                  {isTooFast ? '⚠️ Terlalu Cepat untuk Durasi Ini' : '✅ Pacing Natural (~' + estimatedSeconds + 's)'}
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            {/* Dialog / Voice Over */}
            <div className="lg:col-span-8 relative">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Dialog / Narasi Voice Over
                </label>
                <button
                  type="button"
                  onClick={() => setShowVoMenu(!showVoMenu)}
                  className="text-[10px] text-rose-300 hover:text-white flex items-center gap-1 font-semibold bg-rose-950/60 hover:bg-rose-900 border border-rose-700/50 px-2 py-0.5 rounded-lg transition-colors active:scale-95"
                  title="Pilih inspirasi gaya bicara atau tone voiceover"
                >
                  <span>🎙️ Variasi Gaya VO</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>
              <textarea
                rows={2}
                value={scene.dialogVO}
                onChange={(e) => handleChange('dialogVO', e.target.value)}
                placeholder="Kalimat yang diucapkan kreator atau voiceover pada adegan ini..."
                className="w-full bg-[#0c101a] border border-[#202c44] focus:border-rose-500 rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 outline-none transition-colors leading-relaxed resize-y"
              />

              {showVoMenu && (
                <div className="absolute left-0 top-full mt-1.5 w-full sm:w-[420px] bg-[#121929] border border-[#2b3a58] rounded-xl shadow-2xl z-30 p-2.5 space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
                  <div className="text-[11px] font-bold text-slate-200 pb-1.5 border-b border-slate-800 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span>🎙️ Pustaka Gaya Bicara & Tone VO ({VO_TONE_PRESETS.length} Gaya):</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowVoMenu(false)}
                      className="text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded hover:bg-slate-800"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    {VO_TONE_PRESETS.map((t) => (
                      <button
                        key={t.name}
                        type="button"
                        onClick={() => {
                          handleChange('dialogVO', t.example);
                          handleChange('notesMood', `Tone VO: ${t.name}. ${scene.notesMood || ''}`.trim());
                          setShowVoMenu(false);
                        }}
                        className="w-full text-left p-2 rounded-xl bg-[#0d121f] hover:bg-rose-950/40 border border-[#1e293f] hover:border-rose-600/50 transition-all group"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-bold text-rose-300 group-hover:text-rose-200">{t.name}</span>
                          <span className="text-[9px] bg-rose-950 text-rose-300 border border-rose-800/40 px-1.5 py-0.5 rounded font-bold font-mono">
                            {t.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300 italic mb-1">&ldquo;{t.example}&rdquo;</p>
                        <p className="text-[10px] text-slate-500 group-hover:text-slate-400">{t.style}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sound Effect (SFX) */}
            <div className="lg:col-span-4 relative">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Music2 className="w-3 h-3 text-amber-400" />
                  <span>Efek Suara (SFX)</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowSfxMenu(!showSfxMenu)}
                  className="text-[10px] text-amber-300 hover:text-white flex items-center gap-1 font-semibold bg-amber-950/60 hover:bg-amber-900 border border-amber-700/50 px-2 py-0.5 rounded-lg transition-colors active:scale-95"
                >
                  <span>SFX Viral</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>

              <input
                type="text"
                value={scene.soundEffect}
                onChange={(e) => handleChange('soundEffect', e.target.value)}
                placeholder="e.g. Vine boom, Bell chime"
                className="w-full bg-[#0c101a] border border-[#202c44] focus:border-amber-500 rounded-xl px-3 py-1.5 text-xs text-amber-300 placeholder-slate-500 outline-none transition-colors italic"
              />

              {showSfxMenu && (
                <div className="absolute right-0 top-full mt-1.5 w-72 sm:w-80 max-h-72 overflow-y-auto bg-[#121929] border border-[#2b3a58] rounded-xl shadow-2xl z-30 p-2.5 space-y-2 custom-scrollbar">
                  <div className="text-[11px] font-bold text-amber-300 pb-1.5 border-b border-slate-800 flex items-center justify-between">
                    <span>Pustaka SFX Viral ({SFX_PRESETS.length} Efek):</span>
                    <button
                      type="button"
                      onClick={() => setShowSfxMenu(false)}
                      className="text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded hover:bg-slate-800"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Category Pills */}
                  <div className="flex flex-wrap gap-1 pb-1">
                    {['Semua', ...SFX_CATEGORIES.map((c) => c.category.split(' ')[0])].map((catName) => (
                      <button
                        key={catName}
                        type="button"
                        onClick={() => setSelectedSfxCat(catName)}
                        className={`text-[9px] px-2 py-0.5 rounded-md font-bold transition-all ${
                          selectedSfxCat === catName
                            ? 'bg-amber-400 text-black shadow-sm'
                            : 'bg-[#0d121f] text-slate-400 hover:text-slate-200 border border-slate-800'
                        }`}
                      >
                        {catName}
                      </button>
                    ))}
                  </div>

                  {/* Grouped SFX Items */}
                  <div className="space-y-2.5">
                    {SFX_CATEGORIES.filter(
                      (c) => selectedSfxCat === 'Semua' || c.category.includes(selectedSfxCat)
                    ).map((group) => (
                      <div key={group.category} className="space-y-1">
                        <span className="text-[9px] font-bold text-amber-400/90 uppercase tracking-wider block px-1">
                          {group.category}
                        </span>
                        <div className="space-y-0.5">
                          {group.items.map((sfx) => (
                            <button
                              key={sfx}
                              type="button"
                              onClick={() => {
                                handleChange('soundEffect', sfx);
                                setShowSfxMenu(false);
                              }}
                              className="w-full text-left text-xs px-2.5 py-1.5 rounded-lg text-amber-200 hover:bg-amber-950/50 hover:text-amber-100 transition-colors flex items-center justify-between group"
                            >
                              <span className="truncate">{sfx}</span>
                              {scene.soundEffect === sfx && (
                                <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 ml-1" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ZONE 3: MOOD & PRODUCTION NOTES */}
        <div className="relative">
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <FileText className="w-3 h-3 text-slate-400" />
              <span>Catatan Khusus / Style & Mood Video</span>
            </label>
            <button
              type="button"
              onClick={() => setShowMoodMenu(!showMoodMenu)}
              className="text-[10px] text-slate-400 hover:text-slate-300 flex items-center gap-0.5"
            >
              <span>Preset Style</span>
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>

          <input
            type="text"
            value={scene.notesMood}
            onChange={(e) => handleChange('notesMood', e.target.value)}
            placeholder="e.g. Gaya teks: Bold Red. Pencahayaan natural warm. Gerakan kamera cepat."
            className="w-full bg-[#121826] border border-[#1e293f] focus:border-purple-500 rounded-xl px-3 py-1.5 text-xs text-slate-300 placeholder-slate-500 outline-none transition-colors"
          />

          {showMoodMenu && (
            <div className="absolute left-0 top-full mt-1.5 w-72 max-h-52 overflow-y-auto bg-[#121929] border border-[#2b3a58] rounded-xl shadow-2xl z-20 p-1.5 space-y-0.5 custom-scrollbar">
              {MOOD_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    handleChange('notesMood', m);
                    setShowMoodMenu(false);
                  }}
                  className="w-full text-left text-xs px-2.5 py-1.5 rounded-lg text-slate-300 hover:bg-[#1a2336] hover:text-white transition-colors"
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ZONE 4: GOOGLE FLOW VIDEO UGC (PROMPT AI VIDEO BERDASARKAN REFERENSI IMAGE) */}
        <div className="pt-2 border-t border-[#1a233a]/80">
          <div className="bg-gradient-to-r from-[#0d1627] to-[#121626] border border-cyan-500/30 rounded-xl p-3 space-y-2.5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-md bg-cyan-950 border border-cyan-600/50 flex items-center justify-center text-cyan-400">
                  <Wand2 className="w-3 h-3" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-cyan-300 flex items-center gap-1.5">
                    <span>Google Flow Video UGC</span>
                    <span className="text-[9px] bg-cyan-950 text-cyan-300 border border-cyan-800/60 px-1.5 py-0.2 rounded font-mono font-medium">
                      Mengikuti Referensi Image
                    </span>
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={async () => {
                  if (scene.googleFlowPrompt) {
                    const ok = await copyToClipboard(scene.googleFlowPrompt);
                    if (ok) {
                      setCopiedFlow(true);
                      setTimeout(() => setCopiedFlow(false), 2000);
                    }
                  }
                }}
                className="flex items-center gap-1 bg-[#101c2e] hover:bg-[#16273f] text-cyan-300 text-[10px] font-bold px-2 py-1 rounded-lg border border-cyan-800/60 transition-colors"
                title="Salin Prompt Google Flow untuk Scene ini"
              >
                {copiedFlow ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span>Tersalin!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 text-cyan-400" />
                    <span>Salin Prompt</span>
                  </>
                )}
              </button>
            </div>

            {/* Prompt input / editor */}
            <div className="space-y-1">
              <textarea
                value={scene.googleFlowPrompt || ''}
                onChange={(e) => handleChange('googleFlowPrompt', e.target.value)}
                placeholder="[Image 1 Reference: Produk] Handheld POV 9:16 vertical UGC video..."
                rows={2}
                className="w-full bg-[#080d17] border border-cyan-950 focus:border-cyan-500 rounded-lg p-2 text-xs font-mono text-cyan-200 placeholder-slate-600 outline-none resize-none leading-relaxed"
              />
            </div>

            {/* Catatan Kepatuhan Referensi Image */}
            <div className="flex items-start sm:items-center gap-1.5 bg-[#09101b] border border-cyan-900/40 rounded-lg px-2.5 py-1.5 text-[10px]">
              <ImageIcon className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5 sm:mt-0" />
              <input
                type="text"
                value={scene.imageReferenceNote || ''}
                onChange={(e) => handleChange('imageReferenceNote', e.target.value)}
                placeholder="Pastikan Produk sesuai Gambar referensi yang sudah di upload"
                className="flex-1 bg-transparent text-slate-300 placeholder-slate-500 outline-none text-[10px]"
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
