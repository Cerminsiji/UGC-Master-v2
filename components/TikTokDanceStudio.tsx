'use client';

import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Music,
  Sparkles,
  Flame,
  Camera,
  Shirt,
  Clock,
  Copy,
  Check,
  PlusCircle,
  ArrowRightCircle,
  Loader2,
  Volume2,
  Type,
  Zap,
  Users,
  CheckCircle2,
  Layers,
} from 'lucide-react';
import type { DanceStoryboardResult, DanceStoryboardScene } from '@/types';
import { copyToClipboard, postJsonWithRetry } from '@/utils/helpers';

interface TikTokDanceStudioProps {
  currentProjectTitle: string;
  currentProductName?: string;
  currentBrandName?: string;
  currentKeySellingPoints?: string;
  currentPersona?: string;
  currentPlatform?: string;
  onCreateProjectFromDance: (result: DanceStoryboardResult) => void;
  onApplyToCurrentProject: (result: DanceStoryboardResult) => void;
  onNotify?: (msg: string) => void;
}

const DANCE_MODES = [
  {
    id: 'Dance + Soft-Sell Produk',
    label: 'Dance + Soft-Sell Produk',
    desc: 'Koreografi viral sambil menonjolkan produk secara natural & closing CTA.',
  },
  {
    id: 'Outfit / Fit-Check Transition',
    label: 'Outfit / Fit-Check Transition',
    desc: 'Dance ringan + transisi match-cut ganti gaya/OOTD tepat di beat drop.',
  },
  {
    id: 'Pure Viral Dance Trend',
    label: 'Pure Viral Dance Trend',
    desc: 'Fokus 100% koreografi FYP untuk awareness, engagement, duet & stitch.',
  },
];

const TIKTOK_DANCE_PRESETS = [
  {
    name: 'Viral TikTok Hand-Sync & Bounce',
    bpm: '105-120 BPM',
    level: 'Pemula Ramah',
    desc: 'Fokus gerakan tangan presisi, finger tutting ringan & bounce bahu di depan kamera.',
  },
  {
    name: 'Jedag-Jedug Beat Drop & Pointing',
    bpm: '130-142 BPM',
    level: 'High Hype',
    desc: 'Pukulan bass cepat, head-nod tegas, crash zoom & transisi match-cut ekspresif.',
  },
  {
    name: 'K-Pop / Pop Chorus Choreography',
    bpm: '118-130 BPM',
    level: 'Enerjik',
    desc: 'Koreo chorus penuh energi dengan koordinasi lengan, footwork & ekspresi stage.',
  },
  {
    name: 'Afrobeats / Groovy Hip-Sway Showcase',
    bpm: '98-112 BPM',
    level: 'Groovy Santai',
    desc: 'Alunan pinggul & langkah kaki santai yang bikin video super replayable.',
  },
  {
    name: 'OOTD Runway Walk & 360° Spin',
    bpm: '110-124 BPM',
    level: 'Fashion Fit',
    desc: 'Jalan percaya diri ke lensa, putaran 360° pamer siluet outfit & hair flip.',
  },
  {
    name: 'Chair / Desk Seated TikTok Dance',
    bpm: '95-115 BPM',
    level: 'Tanpa Berdiri',
    desc: 'Koreo duduk di meja/kursi, cocok untuk review desk setup, skincare, atau unboxing.',
  },
  {
    name: 'Match-Cut Hand-Cover Glow Up',
    bpm: '115-128 BPM',
    level: 'Transisi Viral',
    desc: 'Tangan menutup kamera lalu reveal transformasi look/produk tepat saat beat pecah.',
  },
  {
    name: 'Duo / Bestie Mirror Sync Dance',
    bpm: '105-125 BPM',
    level: 'Collab Duet',
    desc: 'Gerakan serempak berdua atau gaya cermin, memancing penonton untuk stitch/duet.',
  },
];

const MUSIC_VIBES = [
  'Upbeat Viral FYP (120-130 BPM)',
  'Jedag-Jedug Remix / Bass Drop (135-145 BPM)',
  'Groovy Pop / R&B Chill (95-115 BPM)',
  'Slow Aesthetic / Acoustic Groove (75-90 BPM)',
];

const CAMERA_CHOREO_OPTIONS = [
  '0.5x Ultra-Wide Dynamic Follow',
  'Crash Zoom / Beat Drop Punch-In',
  'Match-Cut Lens Cover & Whip Pan',
  'Static Tripod Clean Full-Body',
  'POV Mirror Reflection Sync',
];

const DANCER_PERSONAS = [
  'Wanita Muda / Gen Z (Lincah & Ekspresif)',
  'Hijaber Trendy / Modis (Anggun & Enerjik)',
  'Cowok Streetwear / Gen Z Bro (Cool & Santai)',
  'Duo Bestie / Pasangan Serempak',
  'Fashion Stylist / OOTD Model',
];

export const TikTokDanceStudio: React.FC<TikTokDanceStudioProps> = ({
  currentProjectTitle,
  currentProductName = '',
  currentBrandName = '',
  currentKeySellingPoints = '',
  currentPersona = '',
  currentPlatform = 'TikTok Shop',
  onCreateProjectFromDance,
  onApplyToCurrentProject,
  onNotify,
}) => {
  const [danceMode, setDanceMode] = useState<string>(DANCE_MODES[0].id);
  const [danceStyle, setDanceStyle] = useState<string>(TIKTOK_DANCE_PRESETS[0].name);
  const [musicVibe, setMusicVibe] = useState<string>(MUSIC_VIBES[0]);
  const [cameraDynamic, setCameraDynamic] = useState<string>(CAMERA_CHOREO_OPTIONS[0]);
  const [productName, setProductName] = useState<string>(currentProductName || '');
  const [outfitWardrobe, setOutfitWardrobe] = useState<string>(
    'Streetwear kasual cerah / clean aesthetic di kamar terang atau studio minimalis'
  );
  const [talentPersona, setTalentPersona] = useState<string>(
    currentPersona || DANCER_PERSONAS[0]
  );
  const [targetPlatform, setTargetPlatform] = useState<string>(currentPlatform || 'TikTok Shop');
  const [targetDuration, setTargetDuration] = useState<number>(20);
  const [targetSceneCount, setTargetSceneCount] = useState<number>(6);
  const [physicsConsistencyCheck, setPhysicsConsistencyCheck] = useState<boolean>(true);

  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<DanceStoryboardResult | null>(null);
  const [sourceTag, setSourceTag] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleUseCurrentProduct = () => {
    if (currentProductName) {
      setProductName(currentProductName);
      onNotify?.(`Produk aktif "${currentProductName}" dimuat ke Dance Studio.`);
    } else {
      setProductName(currentProjectTitle || 'Produk Viral');
      onNotify?.(`Judul proyek aktif dimuat ke kolom produk.`);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const response = await postJsonWithRetry<{
        success?: boolean;
        data?: DanceStoryboardResult;
        source?: string;
      }>('/api/generate-dance-storyboard', {
        danceMode,
        danceStyle,
        musicVibe,
        cameraDynamic,
        productName: productName.trim() || currentProductName || 'Produk Pilihan',
        brandName: currentBrandName,
        keySellingPoints: currentKeySellingPoints,
        outfitWardrobe,
        talentPersona,
        targetPlatform,
        targetDuration,
        targetSceneCount,
        physicsConsistencyCheck,
      });

      if (response?.success && response.data) {
        setResult(response.data);
        setSourceTag(response.source || 'ai');
        onNotify?.(`💃 Storyboard TikTok Dance (${response.data.scenes.length} segmen beat) berhasil dibuat!`);
      }
    } catch (err) {
      console.error('Dance storyboard error:', err);
      onNotify?.('Gagal membuat storyboard dance. Coba lagi sebentar.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async (text: string, id: string, label: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedId(id);
      onNotify?.(`📋 ${label} berhasil disalin!`);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleEditSceneField = (
    idx: number,
    field: keyof DanceStoryboardScene,
    value: string
  ) => {
    if (!result) return;
    const nextScenes = result.scenes.map((sc, i) =>
      i === idx ? { ...sc, [field]: value } : sc
    );
    setResult({ ...result, scenes: nextScenes });
  };

  const getAllChoreoSheetText = () => {
    if (!result) return '';
    let out = `# ${result.title.toUpperCase()}\n`;
    out += `Gaya: ${result.danceStyle} | Tempo: ${result.bpmRange}\n`;
    out += `Sound: ${result.soundRecommendation}\n`;
    out += `OOTD & Setting: ${result.outfitNotes}\n\n`;
    let acc = 0;
    result.scenes.forEach((sc, i) => {
      const s = acc;
      const e = acc + (Number(sc.duration) || 3);
      acc = e;
      out += `[00:${String(s).padStart(2, '0')} - 00:${String(e).padStart(2, '0')}] SEGMEN ${i + 1} (${sc.beatCue || ''})\n`;
      out += `  • Koreo Tubuh: ${sc.choreographyMove || sc.visualAction}\n`;
      out += `  • Kamera: ${sc.cameraChoreo || sc.cameraAngle}\n`;
      out += `  • Pop-up Teks: ${sc.popupText}\n`;
      out += `  • Lip-Sync/VO: ${sc.dialogVO}\n`;
      out += `  • SFX/Beat Cue: ${sc.soundEffect}\n\n`;
    });
    if (result.caption) {
      out += `CAPTION: ${result.caption}\n`;
    }
    return out;
  };

  const getAllFlowPromptsText = () => {
    if (!result) return '';
    return result.scenes
      .map(
        (sc, i) =>
          `=== SEGMEN ${i + 1} (${sc.duration}s | ${sc.beatCue || ''}) ===\n${sc.googleFlowPrompt || ''}`
      )
      .join('\n\n');
  };

  const totalResultDuration = result
    ? result.scenes.reduce((sum, sc) => sum + (Number(sc.duration) || 0), 0)
    : 0;

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Studio Banner & Controls */}
      <div className="bg-[#0e1422] border border-pink-500/30 rounded-2xl p-5 shadow-xl relative overflow-hidden">
        <div className="absolute -right-24 -top-24 w-64 h-64 bg-pink-600/10 blur-3xl rounded-full pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#1c273e]">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-pink-600 via-fuchsia-600 to-amber-500 flex items-center justify-center text-white shadow-lg shadow-pink-950/60 shrink-0">
              <Music className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base md:text-lg font-extrabold text-white tracking-tight">
                  TikTok Dance Storyboard Generator
                </h2>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-pink-950 text-pink-300 border border-pink-700/50">
                  Beat-Synced Studio
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Buat naskah koreografi dance ala TikTok per bar/ketukan (1–8 count), gerakan kamera, transisi match-cut, pop-up lirik, &amp; integrasi produk siap kirim ke Storyboard Utama atau Motion Control.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-pink-600 via-fuchsia-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white text-xs font-extrabold px-5 py-2.5 rounded-xl shadow-lg shadow-pink-950/60 transition-all active:scale-95 disabled:opacity-60 cursor-pointer shrink-0"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Menyusun Koreo &amp; Beat...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Generate Storyboard Dance</span>
              </>
            )}
          </button>
        </div>

        {/* Mode Selector */}
        <div className="pt-4 space-y-4">
          <div>
            <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2 block">
              1. Pilih Mode Konten Dance
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {DANCE_MODES.map((m) => {
                const active = danceMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setDanceMode(m.id)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      active
                        ? 'bg-pink-950/60 border-pink-500 text-white ring-1 ring-pink-500/40'
                        : 'bg-[#121929] border-[#212d47] text-slate-300 hover:border-pink-500/40'
                    }`}
                  >
                    <div className="text-xs font-bold text-white mb-0.5">{m.label}</div>
                    <p className="text-[11px] text-slate-400 leading-snug">{m.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 8 TikTok Dance Presets */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                2. Gaya Koreografi TikTok Style ({TIKTOK_DANCE_PRESETS.length} Preset Viral)
              </label>
              <span className="text-[10px] font-mono text-pink-300 bg-pink-950/70 border border-pink-700/40 px-2 py-0.5 rounded">
                {danceStyle}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {TIKTOK_DANCE_PRESETS.map((preset) => {
                const selected = danceStyle === preset.name;
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => setDanceStyle(preset.name)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      selected
                        ? 'bg-fuchsia-950/70 border-fuchsia-400 text-white shadow-md shadow-fuchsia-950/40'
                        : 'bg-[#121929] border-[#212d47] text-slate-300 hover:bg-[#161f33]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[11px] font-bold text-white leading-tight line-clamp-1">
                        {preset.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[9px] font-mono bg-amber-950/80 text-amber-300 border border-amber-700/40 px-1.5 py-0.2 rounded">
                        {preset.bpm}
                      </span>
                      <span className="text-[9px] font-semibold text-fuchsia-300">
                        {preset.level}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 line-clamp-2 leading-snug">
                      {preset.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Detail Parameters Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-1">
            {danceMode !== 'Pure Viral Dance Trend' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                    Produk / Outfit yang Di-Spill
                  </label>
                  <button
                    type="button"
                    onClick={handleUseCurrentProduct}
                    className="text-[10px] text-pink-300 hover:text-pink-200 font-semibold cursor-pointer"
                  >
                    Pakai Produk Aktif
                  </button>
                </div>
                <input
                  type="text"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="Contoh: Setelan Linen Arsyilla, Lip Tint..."
                  className="w-full bg-[#131a2b] border border-[#23304d] focus:border-pink-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>
            )}

            <div>
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1 block">
                Vibe Musik &amp; Tempo Beat
              </label>
              <select
                value={musicVibe}
                onChange={(e) => setMusicVibe(e.target.value)}
                className="w-full bg-[#131a2b] border border-[#23304d] focus:border-pink-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
              >
                {MUSIC_VIBES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1 block">
                Gaya Kamera Koreografi
              </label>
              <select
                value={cameraDynamic}
                onChange={(e) => setCameraDynamic(e.target.value)}
                className="w-full bg-[#131a2b] border border-[#23304d] focus:border-pink-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
              >
                {CAMERA_CHOREO_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1 block">
                Persona Penari
              </label>
              <select
                value={talentPersona}
                onChange={(e) => setTalentPersona(e.target.value)}
                className="w-full bg-[#131a2b] border border-[#23304d] focus:border-pink-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
              >
                {!DANCER_PERSONAS.includes(talentPersona) && (
                  <option value={talentPersona}>{talentPersona}</option>
                )}
                {DANCER_PERSONAS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1 block">
                OOTD / Latar Ruangan
              </label>
              <input
                type="text"
                value={outfitWardrobe}
                onChange={(e) => setOutfitWardrobe(e.target.value)}
                placeholder="Misal: Hoodie oversize + lampu sunset kamar"
                className="w-full bg-[#131a2b] border border-[#23304d] focus:border-pink-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1 block">
                  Durasi Video
                </label>
                <select
                  value={targetDuration}
                  onChange={(e) => setTargetDuration(Number(e.target.value))}
                  className="w-full bg-[#131a2b] border border-[#23304d] focus:border-pink-500 rounded-xl px-2.5 py-2 text-xs text-white outline-none"
                >
                  <option value={15}>15 Detik (Snappy)</option>
                  <option value={20}>20 Detik (Ideal Dance)</option>
                  <option value={30}>30 Detik (Full Chorus)</option>
                  <option value={45}>45 Detik (Story + Dance)</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1 block">
                  Jumlah Bar Beat
                </label>
                <select
                  value={targetSceneCount}
                  onChange={(e) => setTargetSceneCount(Number(e.target.value))}
                  className="w-full bg-[#131a2b] border border-[#23304d] focus:border-pink-500 rounded-xl px-2.5 py-2 text-xs text-white outline-none"
                >
                  <option value={4}>4 Segmen Beat</option>
                  <option value={5}>5 Segmen Beat</option>
                  <option value={6}>6 Segmen Beat</option>
                  <option value={7}>7 Segmen Beat</option>
                  <option value={8}>8 Segmen Beat</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold text-slate-400">Target Platform:</span>
              {['TikTok Shop', 'TikTok FYP', 'Shopee Video', 'Instagram Reels', 'YouTube Shorts'].map((plat) => (
                <button
                  key={plat}
                  type="button"
                  onClick={() => setTargetPlatform(plat)}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                    targetPlatform === plat
                      ? 'bg-pink-600 text-white border-pink-400'
                      : 'bg-[#131a2b] text-slate-400 border-[#23304d] hover:text-slate-200'
                  }`}
                >
                  {plat}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={physicsConsistencyCheck}
                onChange={(e) => setPhysicsConsistencyCheck(e.target.checked)}
                className="accent-pink-500 rounded"
              />
              <span>Physics &amp; Biomechanical Joint Check (Anti-Morphing AI Video)</span>
            </label>
          </div>
        </div>
      </div>

      {/* Empty State Prompt */}
      {!result && !isGenerating && (
        <div className="bg-[#0d121f] border border-dashed border-[#243250] rounded-2xl p-8 text-center space-y-2.5">
          <div className="w-12 h-12 rounded-2xl bg-pink-950/70 border border-pink-700/40 flex items-center justify-center text-pink-300 mx-auto">
            <Flame className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-white">
            Siap Merancang Koreografi Dance TikTok Style?
          </h3>
          <p className="text-xs text-slate-400 max-w-xl mx-auto leading-relaxed">
            Pilih mode konten dan gaya dance di atas lalu klik <strong className="text-pink-300">Generate Storyboard Dance</strong>. Hasilnya langsung terpecah rapi per ketukan musik (1–8 count), lengkap dengan arahan kamera, transisi match-cut, pop-up lirik, serta prompt Google Flow &amp; Motion Control.
          </p>
        </div>
      )}

      {/* Result Area */}
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Result Header & Studio Sync Bar */}
          <div className="bg-[#0e1422] border border-fuchsia-500/40 rounded-2xl p-4 md:p-5 space-y-4 shadow-lg">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-[#1c273e] pb-3.5">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-extrabold text-white">{result.title}</h3>
                  <span className="text-[10px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-700/50 px-2 py-0.5 rounded">
                    {result.bpmRange}
                  </span>
                  <span className="text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-700/50 px-2 py-0.5 rounded">
                    {result.scenes.length} Segmen • {totalResultDuration}s
                  </span>
                  {sourceTag === 'gemini' && (
                    <span className="text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-700/50 px-2 py-0.5 rounded">
                      AI Choreo Director
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">{result.choreoConcept}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onApplyToCurrentProject(result)}
                  className="flex items-center gap-1.5 text-xs font-bold bg-[#172138] hover:bg-[#1f2c4a] text-sky-300 border border-sky-500/40 px-3 py-2 rounded-xl transition-all cursor-pointer"
                >
                  <ArrowRightCircle className="w-3.5 h-3.5" />
                  <span>Pasang ke Naskah Aktif</span>
                </button>
                <button
                  type="button"
                  onClick={() => onCreateProjectFromDance(result)}
                  className="flex items-center gap-1.5 text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-3.5 py-2 rounded-xl shadow-md transition-all cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Simpan Jadi Project Baru</span>
                </button>
              </div>
            </div>

            {/* Production Brief Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-[#0a0f1c] border border-[#1d273e] space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-pink-300 text-[11px] uppercase tracking-wider">
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Rekomendasi Sound &amp; Tempo</span>
                </div>
                <p className="text-slate-300 leading-snug">{result.soundRecommendation}</p>
              </div>

              <div className="p-3 rounded-xl bg-[#0a0f1c] border border-[#1d273e] space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-300 text-[11px] uppercase tracking-wider">
                  <Shirt className="w-3.5 h-3.5" />
                  <span>Wardrobe &amp; Lighting Cue</span>
                </div>
                <p className="text-slate-300 leading-snug">{result.outfitNotes}</p>
              </div>

              <div className="p-3 rounded-xl bg-[#0a0f1c] border border-[#1d273e] space-y-1">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-bold text-emerald-300 text-[11px] uppercase tracking-wider">
                    <Zap className="w-3.5 h-3.5" />
                    <span>Auto Caption ({result.caption.length}/150)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(result.caption, 'dance_caption', 'Caption Dance')}
                    className="text-[10px] font-bold text-purple-300 hover:text-white flex items-center gap-1 cursor-pointer"
                  >
                    {copiedId === 'dance_caption' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>Salin</span>
                  </button>
                </div>
                <p className="text-slate-200 leading-snug">{result.caption}</p>
              </div>
            </div>

            {/* Proportional Beat Timeline Strip + Quick Export Copies */}
            <div className="space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-fuchsia-400" />
                  <span>Timeline Segmen Beat ({totalResultDuration} Detik)</span>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopy(getAllChoreoSheetText(), 'choreo_sheet', 'Choreo Cue Sheet')}
                    className="flex items-center gap-1 text-[11px] font-bold bg-[#141c2f] hover:bg-[#1b2640] text-slate-200 border border-[#243250] px-2.5 py-1 rounded-lg cursor-pointer"
                  >
                    {copiedId === 'choreo_sheet' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>Salin Choreo Cue</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy(getAllFlowPromptsText(), 'flow_all', 'Semua Prompt Google Flow')}
                    className="flex items-center gap-1 text-[11px] font-bold bg-[#141c2f] hover:bg-[#1b2640] text-cyan-300 border border-cyan-800/50 px-2.5 py-1 rounded-lg cursor-pointer"
                  >
                    {copiedId === 'flow_all' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>Salin Semua Prompt Flow</span>
                  </button>
                </div>
              </div>

              <div className="flex items-stretch gap-1 w-full overflow-x-auto pb-1">
                {result.scenes.map((sc, i) => (
                  <div
                    key={sc.id}
                    style={{ flexGrow: Math.max(1, Number(sc.duration) || 2) }}
                    className="min-w-[95px] p-2 rounded-xl bg-[#12192b] border border-[#222f4d] flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between gap-1 text-[10px]">
                      <span className="font-extrabold text-pink-300">Bar {i + 1}</span>
                      <span className="font-mono text-emerald-300">{sc.duration}s</span>
                    </div>
                    <div className="text-[10px] text-slate-300 line-clamp-1 mt-0.5 font-semibold">
                      {sc.beatCue || sc.cameraAngle}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Per-Segment Choreo Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {result.scenes.map((sc, idx) => (
              <div
                key={sc.id}
                className="bg-[#0e1422] border border-[#1f2b44] hover:border-pink-500/40 rounded-2xl p-4 space-y-3 transition-all shadow-md"
              >
                <div className="flex items-center justify-between gap-2 border-b border-[#1a2338] pb-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="w-6 h-6 rounded-lg bg-gradient-to-tr from-pink-600 to-purple-600 text-white text-xs font-extrabold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-bold text-amber-300">
                      {sc.beatCue || `Segmen ${idx + 1}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono bg-[#141d31] text-sky-300 border border-sky-800/40 px-2 py-0.5 rounded">
                      {sc.cameraAngle}
                    </span>
                    <span className="text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800/40 px-2 py-0.5 rounded flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {sc.duration}s
                    </span>
                  </div>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div>
                    <label className="text-[10px] font-bold text-pink-300 uppercase tracking-wider flex items-center gap-1 mb-1">
                      <Users className="w-3 h-3" />
                      <span>Gerakan Koreografi (Tubuh &amp; Tangan)</span>
                    </label>
                    <textarea
                      rows={2}
                      value={sc.choreographyMove || sc.visualAction}
                      onChange={(e) => handleEditSceneField(idx, 'choreographyMove', e.target.value)}
                      className="w-full bg-[#090d17] border border-[#1d273e] focus:border-pink-500 rounded-xl p-2 text-xs text-slate-100 outline-none resize-y leading-relaxed"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] font-bold text-sky-300 uppercase tracking-wider flex items-center gap-1 mb-1">
                        <Camera className="w-3 h-3" />
                        <span>Koreo Kamera &amp; Transisi</span>
                      </label>
                      <input
                        type="text"
                        value={sc.cameraChoreo || sc.cameraAngle}
                        onChange={(e) => handleEditSceneField(idx, 'cameraChoreo', e.target.value)}
                        className="w-full bg-[#090d17] border border-[#1d273e] focus:border-sky-500 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1 mb-1">
                        <Type className="w-3 h-3" />
                        <span>Pop-up Teks / Stiker Beat</span>
                      </label>
                      <input
                        type="text"
                        value={sc.popupText}
                        onChange={(e) => handleEditSceneField(idx, 'popupText', e.target.value)}
                        className="w-full bg-[#090d17] border border-[#1d273e] focus:border-amber-500 rounded-xl px-2.5 py-1.5 text-xs font-bold text-amber-200 outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] font-bold text-purple-300 uppercase tracking-wider mb-1 block">
                        Lip-Sync / VO Cue
                      </label>
                      <input
                        type="text"
                        value={sc.dialogVO}
                        onChange={(e) => handleEditSceneField(idx, 'dialogVO', e.target.value)}
                        className="w-full bg-[#090d17] border border-[#1d273e] focus:border-purple-500 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider mb-1 block">
                        SFX &amp; Beat Drop Cue
                      </label>
                      <input
                        type="text"
                        value={sc.soundEffect}
                        onChange={(e) => handleEditSceneField(idx, 'soundEffect', e.target.value)}
                        className="w-full bg-[#090d17] border border-[#1d273e] focus:border-emerald-500 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 italic outline-none"
                      />
                    </div>
                  </div>

                  <div className="pt-1 border-t border-[#182135] flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-400 truncate">
                      {sc.notesMood}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(
                          sc.googleFlowPrompt || '',
                          `flow_${sc.id}`,
                          `Prompt Flow Segmen ${idx + 1}`
                        )
                      }
                      className="flex items-center gap-1 text-[10px] font-bold text-cyan-300 hover:text-white bg-cyan-950/50 border border-cyan-800/50 px-2 py-1 rounded-lg shrink-0 cursor-pointer"
                    >
                      {copiedId === `flow_${sc.id}` ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      <span>Salin Prompt AI Video</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
};
