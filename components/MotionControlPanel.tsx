'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Clapperboard,
  Camera,
  Sparkles,
  Music,
  Video,
  Upload,
  X,
  Copy,
  Check,
  Wand2,
  Info,
  Sliders,
  UserCheck,
  Package,
  Clock,
  Film,
  Zap,
} from 'lucide-react';
import type { Scene, SceneMotionControl } from '@/types';
import { copyToClipboard } from '@/utils/helpers';

export const DANCE_STYLE_OPTIONS = [
  'Tanpa Dance (Demo Produk Natural)',
  'Viral TikTok Hand-Sync & Bounce',
  'K-Pop / Pop Beat Choreography',
  'Afrobeats / Groovy Hip-Sway Showcase',
  'Jedag-Jedug Beat Drop Head-Nod & Pointing',
  'OOTD Runway Walk & 360° Spin',
  'Fashion Pose & Hair Flip Transition',
  'Match-Cut Hand-Snap Outfit / Product Swap',
  'POV Unboxing & Dynamic Hand Grab',
  'Mirror Fit-Check Pose & Groove',
  'Fitness / Energetic Workout Move',
  'Snap-Finger Outfit / Product Reveal',
  'Lifestyle Slow-Motion Aesthetic Sway',
  'Dual-Creator Sync Dance & High-Five',
];

export const CAMERA_MOVEMENT_OPTIONS = [
  'Handheld Natural UGC Micro-Shake',
  '0.5x Ultra-Wide Dynamic Follow',
  'Smooth Dolly In (Hero Product)',
  'Pull-Back Reveal (Wide Opening)',
  '360° Orbital Arc Around Subject',
  'Whip Pan / Fast-Cut Transition',
  'Match-Cut Lens-Cover Zoom Out',
  'Crash Zoom / Beat Drop Punch-In',
  'Low-Angle Tracking Follow',
  'Top-Down Overhead Glide',
  'Dutch Tilt Energy Shift',
  'Static Tripod Clean Frame',
];

export const AESTHETIC_EFFECT_OPTIONS = [
  'Natural Daylight / Clean Commercial Studio',
  'Raw iPhone Handheld 2026 Aesthetic',
  'Golden Hour Warm Glow',
  'Neon Cyberpunk / RGB Rim Light',
  'Y2K Flash Camcorder & Retro Film Grain',
  'Editorial Softbox High-Fashion Clean',
  'Soft Bokeh Cinematic Depth',
  'Crisp High-Contrast Marketplace Ad',
  'Dreamy Pastel Soft Mist (Glow Skin)',
  'Beat-Synced Speed Ramp & Motion Blur',
  'Teal & Orange Cinematic Vlog Grade',
  'Dark Luxury Studio Rim Light',
];

const INTENSITY_OPTIONS: Array<NonNullable<SceneMotionControl['motionIntensity']>> = [
  'Subtle',
  'Medium',
  'Dynamic',
  'High Energy',
];

const TEMPO_OPTIONS: Array<NonNullable<SceneMotionControl['beatTempo']>> = [
  'Slow (70-90 BPM)',
  'Medium (100-120 BPM)',
  'Fast (125-140 BPM)',
];

const ASPECT_OPTIONS: Array<NonNullable<SceneMotionControl['aspectRatio']>> = ['9:16', '16:9', '1:1'];

interface MotionControlPanelProps {
  scenes: Scene[];
  projectTitle: string;
  productName?: string;
  persona?: string;
  referenceImages?: string[];
  onUpdateScene: (updatedScene: Scene) => void;
  onBatchUpdateScenes?: (updater: (scenes: Scene[]) => Scene[]) => void;
  onNotify?: (message: string) => void;
}

export function buildMotionControlPrompt(
  scene: Scene,
  productName?: string,
  persona?: string,
  hasCharacterRef?: boolean,
  hasMotionVideoRef?: boolean
): string {
  const mc = scene.motionControl || {};
  const dance = mc.danceStyle || DANCE_STYLE_OPTIONS[0];
  const camera = mc.cameraMovement || CAMERA_MOVEMENT_OPTIONS[0];
  const aesthetic = mc.aestheticEffect || AESTHETIC_EFFECT_OPTIONS[0];
  const intensity = mc.motionIntensity || 'Medium';
  const tempo = mc.beatTempo || 'Medium (100-120 BPM)';
  const ratio = mc.aspectRatio || '9:16';

  const refs: string[] = [];
  if (productName) refs.push(`[Product Ref: ${productName}]`);
  if (hasCharacterRef) refs.push(`[Character Ref: Uploaded Talent]`);
  if (hasMotionVideoRef) refs.push(`[Motion Video Ref: Choreography Guide]`);

  const parts = [
    refs.length > 0 ? refs.join(' ') : `[Scene ${scene.order}]`,
    `Duration: ${scene.duration}s | Aspect: ${ratio}`,
    `Dance & Body Motion: ${dance} (${intensity} intensity, ${tempo})`,
    `Camera Movement: ${camera} (${scene.cameraAngle || 'Medium Shot'})`,
    `Aesthetic & Lighting: ${aesthetic}`,
    scene.visualAction ? `Action: ${scene.visualAction}` : '',
    persona ? `Talent Persona: ${persona}` : '',
    mc.customMotionNotes ? `Notes: ${mc.customMotionNotes}` : '',
    `No floating text, no on-screen text overlay, no subtitles, no voiceover dialogue, pure visual choreography and camera motion.`,
    `Strict physics consistency: realistic mass inertia, biomechanical constraint adherence, solid contact, zero morphing.`,
  ].filter(Boolean);

  return parts.join(' • ');
}

export const MotionControlPanel: React.FC<MotionControlPanelProps> = ({
  scenes,
  projectTitle,
  productName,
  persona,
  referenceImages = [],
  onUpdateScene,
  onBatchUpdateScenes,
  onNotify,
}) => {
  const [characterPreviewUrl, setCharacterPreviewUrl] = useState<string | null>(null);
  const [characterFileName, setCharacterFileName] = useState<string>('');
  const [motionVideoUrl, setMotionVideoUrl] = useState<string | null>(null);
  const [motionVideoName, setMotionVideoName] = useState<string>('');

  const [batchDance, setBatchDance] = useState<string>(DANCE_STYLE_OPTIONS[1]);
  const [batchCamera, setBatchCamera] = useState<string>(CAMERA_MOVEMENT_OPTIONS[2]);
  const [batchAesthetic, setBatchAesthetic] = useState<string>(AESTHETIC_EFFECT_OPTIONS[0]);

  const [copiedSceneId, setCopiedSceneId] = useState<string | null>(null);
  const [syncedSceneId, setSyncedSceneId] = useState<string | null>(null);
  const [placeholderNoticeSceneIds, setPlaceholderNoticeSceneIds] = useState<Record<string, boolean>>({});

  const charInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (characterPreviewUrl) URL.revokeObjectURL(characterPreviewUrl);
      if (motionVideoUrl) URL.revokeObjectURL(motionVideoUrl);
    };
  }, [characterPreviewUrl, motionVideoUrl]);

  const handleCharacterUpload = (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    if (characterPreviewUrl) URL.revokeObjectURL(characterPreviewUrl);
    const url = URL.createObjectURL(file);
    setCharacterPreviewUrl(url);
    setCharacterFileName(file.name);
    onNotify?.(`Referensi karakter "${file.name}" dimuat untuk pratinjau Motion Control.`);
  };

  const handleMotionVideoUpload = (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    if (motionVideoUrl) URL.revokeObjectURL(motionVideoUrl);
    const url = URL.createObjectURL(file);
    setMotionVideoUrl(url);
    setMotionVideoName(file.name);
    onNotify?.(`Video referensi gerakan "${file.name}" siap dipratinjau.`);
  };

  const updateSceneMotion = (scene: Scene, patch: Partial<SceneMotionControl>) => {
    const nextMotion: SceneMotionControl = {
      danceStyle: scene.motionControl?.danceStyle || DANCE_STYLE_OPTIONS[0],
      cameraMovement: scene.motionControl?.cameraMovement || CAMERA_MOVEMENT_OPTIONS[0],
      aestheticEffect: scene.motionControl?.aestheticEffect || AESTHETIC_EFFECT_OPTIONS[0],
      motionIntensity: scene.motionControl?.motionIntensity || 'Medium',
      beatTempo: scene.motionControl?.beatTempo || 'Medium (100-120 BPM)',
      aspectRatio: scene.motionControl?.aspectRatio || '9:16',
      customMotionNotes: scene.motionControl?.customMotionNotes || '',
      ...patch,
    };

    onUpdateScene({
      ...scene,
      motionControl: nextMotion,
    });
  };

  const handleApplyBatchToAll = () => {
    if (onBatchUpdateScenes) {
      onBatchUpdateScenes((list) =>
        list.map((sc) => ({
          ...sc,
          popupText: '',
          dialogVO: '',
          motionControl: {
            ...sc.motionControl,
            danceStyle: batchDance,
            cameraMovement: batchCamera,
            aestheticEffect: batchAesthetic,
            motionIntensity: sc.motionControl?.motionIntensity || 'Dynamic',
            beatTempo: sc.motionControl?.beatTempo || 'Medium (100-120 BPM)',
            aspectRatio: sc.motionControl?.aspectRatio || '9:16',
          },
        }))
      );
    } else {
      scenes.forEach((sc) => {
        onUpdateScene({
          ...sc,
          popupText: '',
          dialogVO: '',
          motionControl: {
            ...sc.motionControl,
            danceStyle: batchDance,
            cameraMovement: batchCamera,
            aestheticEffect: batchAesthetic,
          },
        });
      });
    }
    onNotify?.(`Preset Motion Control (tanpa floating text & VO) diterapkan ke semua ${scenes.length} adegan!`);
  };

  const handleCopyPrompt = async (scene: Scene) => {
    const prompt = buildMotionControlPrompt(
      scene,
      productName,
      persona,
      Boolean(characterPreviewUrl),
      Boolean(motionVideoUrl)
    );
    const ok = await copyToClipboard(prompt);
    if (ok) {
      setCopiedSceneId(scene.id);
      onNotify?.(`Motion prompt Adegan ${scene.order} disalin ke clipboard!`);
      setTimeout(() => setCopiedSceneId((prev) => (prev === scene.id ? null : prev)), 2000);
    }
  };

  const handleSyncToGoogleFlow = (scene: Scene) => {
    const prompt = buildMotionControlPrompt(
      scene,
      productName,
      persona,
      Boolean(characterPreviewUrl),
      Boolean(motionVideoUrl)
    );
    onUpdateScene({
      ...scene,
      popupText: '',
      dialogVO: '',
      googleFlowPrompt: prompt,
    });
    setSyncedSceneId(scene.id);
    onNotify?.(`Motion Control Adegan ${scene.order} disinkronkan ke Google Flow (tanpa floating text & VO)!`);
    setTimeout(() => setSyncedSceneId((prev) => (prev === scene.id ? null : prev)), 2000);
  };

  const handleGenerateMotionVideoPlaceholder = (scene: Scene) => {
    setPlaceholderNoticeSceneIds((prev) => ({
      ...prev,
      [scene.id]: true,
    }));
    onNotify?.(
      `Placeholder "Generate Motion Video" dipicu untuk Adegan ${scene.order}. Aktifkan Paid API Key / Video Model untuk render langsung.`
    );
  };

  return (
    <div className="space-y-5 font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Studio Banner */}
      <div className="bg-gradient-to-br from-[#13182b] via-[#0e1322] to-[#0b0f1b] border border-fuchsia-500/30 rounded-2xl p-5 shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-fuchsia-600 to-purple-600 flex items-center justify-center text-white shadow-md shadow-fuchsia-950/60 shrink-0">
              <Clapperboard className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-extrabold text-white tracking-tight">
                  Motion Control & Choreography Studio
                </h2>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-fuchsia-950/90 text-fuchsia-300 border border-fuchsia-600/40 px-2 py-0.5 rounded-full">
                  {scenes.length} Adegan • {projectTitle}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                Atur gaya dance, pergerakan kamera, efek estetika, intensitas gerakan, serta lampirkan referensi produk, karakter, dan video untuk tiap adegan (pure visual motion — tanpa narasi floating text maupun voice over).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-amber-300 bg-amber-950/40 border border-amber-500/30 px-3 py-2 rounded-xl shrink-0">
            <Info className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Tombol Generate Motion Video berstatus Placeholder (render langsung menunggu aktivasi Paid Video API).</span>
          </div>
        </div>

        {/* Multimodal Reference Kit (Product + Character + Reference Motion Video) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mt-5 pt-4 border-t border-[#1e2942]">
          {/* 1. Product Reference from Project */}
          <div className="bg-[#090d18] border border-[#1d2740] rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-cyan-400" />
                <span>Referensi Produk</span>
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                {referenceImages.length} foto
              </span>
            </div>
            {referenceImages.length > 0 ? (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
                {referenceImages.map((src, idx) => (
                  <img
                    key={idx}
                    src={src}
                    alt={`Produk ${idx + 1}`}
                    className="w-12 h-12 rounded-lg object-cover border border-cyan-500/40 shrink-0"
                  />
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Belum ada foto produk. Upload lewat bar &quot;Upload Referensi Image&quot; di atas atau generator AI.
              </p>
            )}
          </div>

          {/* 2. Character / Talent Reference Upload */}
          <div className="bg-[#090d18] border border-[#1d2740] rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-purple-400" />
                <span>Referensi Karakter / Talent</span>
              </span>
              {characterPreviewUrl && (
                <button
                  type="button"
                  onClick={() => {
                    if (characterPreviewUrl) URL.revokeObjectURL(characterPreviewUrl);
                    setCharacterPreviewUrl(null);
                    setCharacterFileName('');
                  }}
                  className="text-slate-400 hover:text-rose-400 transition-colors"
                  title="Hapus referensi karakter"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <input
              ref={charInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleCharacterUpload(e.target.files)}
              className="hidden"
            />
            {characterPreviewUrl ? (
              <div className="flex items-center gap-2.5">
                <img
                  src={characterPreviewUrl}
                  alt="Referensi Karakter"
                  className="w-12 h-12 rounded-lg object-cover border border-purple-500/50 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold text-white truncate">{characterFileName}</div>
                  <button
                    type="button"
                    onClick={() => charInputRef.current?.click()}
                    className="text-[10px] text-purple-400 hover:text-purple-300 font-semibold mt-0.5"
                  >
                    Ganti Foto Karakter
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => charInputRef.current?.click()}
                className="w-full py-2.5 px-3 rounded-lg border border-dashed border-purple-500/40 hover:border-purple-400 bg-purple-950/20 hover:bg-purple-950/40 text-[11px] font-semibold text-purple-200 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-purple-400" />
                <span>Upload Foto Karakter / Model</span>
              </button>
            )}
          </div>

          {/* 3. Motion / Dance Video Reference Upload */}
          <div className="bg-[#090d18] border border-[#1d2740] rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-fuchsia-300 flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5 text-fuchsia-400" />
                <span>Video Referensi Gerakan / Dance</span>
              </span>
              {motionVideoUrl && (
                <button
                  type="button"
                  onClick={() => {
                    if (motionVideoUrl) URL.revokeObjectURL(motionVideoUrl);
                    setMotionVideoUrl(null);
                    setMotionVideoName('');
                  }}
                  className="text-slate-400 hover:text-rose-400 transition-colors"
                  title="Hapus video referensi"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              onChange={(e) => handleMotionVideoUpload(e.target.files)}
              className="hidden"
            />
            {motionVideoUrl ? (
              <div className="space-y-1.5">
                <video
                  src={motionVideoUrl}
                  controls
                  muted
                  className="w-full h-24 rounded-lg object-cover bg-black border border-fuchsia-500/40"
                />
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span className="truncate max-w-[160px]">{motionVideoName}</span>
                  <button
                    type="button"
                    onClick={() => videoInputRef.current?.click()}
                    className="text-fuchsia-400 hover:text-fuchsia-300 font-semibold shrink-0"
                  >
                    Ganti Video
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                className="w-full py-2.5 px-3 rounded-lg border border-dashed border-fuchsia-500/40 hover:border-fuchsia-400 bg-fuchsia-950/20 hover:bg-fuchsia-950/40 text-[11px] font-semibold text-fuchsia-200 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-fuchsia-400" />
                <span>Upload Video Referensi Dance</span>
              </button>
            )}
          </div>
        </div>

        {/* Batch Apply Bar */}
        <div className="mt-4 pt-4 border-t border-[#1e2942] flex flex-col xl:flex-row xl:items-end gap-3">
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Batch Gaya Dance / Gerakan
              </label>
              <select
                value={batchDance}
                onChange={(e) => setBatchDance(e.target.value)}
                className="w-full bg-[#090d18] border border-[#222f4d] focus:border-fuchsia-500 rounded-xl px-2.5 py-2 text-xs text-slate-200 outline-none"
              >
                {DANCE_STYLE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Batch Pergerakan Kamera
              </label>
              <select
                value={batchCamera}
                onChange={(e) => setBatchCamera(e.target.value)}
                className="w-full bg-[#090d18] border border-[#222f4d] focus:border-fuchsia-500 rounded-xl px-2.5 py-2 text-xs text-slate-200 outline-none"
              >
                {CAMERA_MOVEMENT_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Batch Efek Estetika
              </label>
              <select
                value={batchAesthetic}
                onChange={(e) => setBatchAesthetic(e.target.value)}
                className="w-full bg-[#090d18] border border-[#222f4d] focus:border-fuchsia-500 rounded-xl px-2.5 py-2 text-xs text-slate-200 outline-none"
              >
                {AESTHETIC_EFFECT_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={handleApplyBatchToAll}
            className="flex items-center justify-center gap-1.5 bg-[#19223a] hover:bg-fuchsia-950/60 text-fuchsia-200 border border-fuchsia-500/40 text-xs font-bold px-4 py-2 rounded-xl transition-all active:scale-95 cursor-pointer shrink-0"
          >
            <Sliders className="w-3.5 h-3.5 text-fuchsia-400" />
            <span>Terapkan ke Semua Adegan</span>
          </button>
        </div>
      </div>

      {/* Per-Scene Motion Control List */}
      <div className="space-y-4">
        {scenes.map((scene, index) => {
          const mc: SceneMotionControl = {
            danceStyle: DANCE_STYLE_OPTIONS[0],
            cameraMovement: CAMERA_MOVEMENT_OPTIONS[0],
            aestheticEffect: AESTHETIC_EFFECT_OPTIONS[0],
            motionIntensity: 'Medium',
            beatTempo: 'Medium (100-120 BPM)',
            aspectRatio: '9:16',
            customMotionNotes: '',
            ...scene.motionControl,
          };

          const compiledPrompt = buildMotionControlPrompt(
            { ...scene, motionControl: mc },
            productName,
            persona,
            Boolean(characterPreviewUrl),
            Boolean(motionVideoUrl)
          );

          const isCopied = copiedSceneId === scene.id;
          const isSynced = syncedSceneId === scene.id;
          const showPlaceholderNotice = Boolean(placeholderNoticeSceneIds[scene.id]);

          return (
            <motion.div
              key={scene.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(index * 0.04, 0.25) }}
              className="bg-[#0e1320] border border-[#1d273e] hover:border-fuchsia-500/40 rounded-2xl p-5 shadow-md transition-colors space-y-4"
            >
              {/* Scene Top Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#192238]">
                <div className="flex items-start sm:items-center gap-2.5 flex-wrap">
                  <span className="bg-gradient-to-r from-fuchsia-700 to-purple-700 text-white text-xs font-black px-2.5 py-1 rounded-lg uppercase tracking-wider tabular-nums shrink-0">
                    ADEGAN {index + 1}
                  </span>
                  <span className="flex items-center gap-1 text-xs font-mono font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-700/40 px-2 py-0.5 rounded-lg tabular-nums">
                    <Clock className="w-3 h-3" />
                    <span>{scene.duration}s</span>
                  </span>
                  <span className="text-xs font-semibold text-purple-300 bg-purple-950/60 border border-purple-700/40 px-2.5 py-0.5 rounded-lg">
                    {scene.cameraAngle || 'Medium Shot'}
                  </span>
                </div>

                {/* Placeholder Generate Motion Video Button */}
                <button
                  type="button"
                  onClick={() => handleGenerateMotionVideoPlaceholder(scene)}
                  className="flex items-center justify-center gap-2 bg-gradient-to-r from-fuchsia-600 via-purple-600 to-indigo-600 hover:from-fuchsia-500 hover:via-purple-500 hover:to-indigo-500 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-md shadow-fuchsia-950/50 border border-fuchsia-400/40 transition-all active:scale-95 cursor-pointer shrink-0"
                >
                  <Film className="w-3.5 h-3.5" />
                  <span>Generate Motion Video</span>
                  <span className="text-[9px] font-mono uppercase bg-black/35 text-fuchsia-200 px-1.5 py-0.5 rounded">
                    Placeholder
                  </span>
                </button>
              </div>

              {/* Scene Context Snippet (Pure Visual — No Floating Text or VO) */}
              <div className="bg-[#090d17] border border-[#192236] rounded-xl px-3.5 py-2.5 text-xs text-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <p className="line-clamp-2">
                  <span className="font-bold text-slate-400 uppercase text-[10px] mr-1.5">Aksi Visual:</span>
                  {scene.visualAction || 'Belum ada deskripsi aksi visual.'}
                </p>
                <span className="text-[10px] font-bold text-emerald-300 bg-emerald-950/50 border border-emerald-700/40 px-2 py-0.5 rounded shrink-0">
                  Pure Visual • No Text/VO
                </span>
              </div>

              {/* Controls Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                {/* Dance Style */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-[11px] font-bold text-fuchsia-300">
                    <Music className="w-3.5 h-3.5 text-fuchsia-400" />
                    <span>Gaya Dance / Gerakan Tubuh</span>
                  </label>
                  <select
                    value={mc.danceStyle}
                    onChange={(e) => updateSceneMotion(scene, { danceStyle: e.target.value })}
                    className="w-full bg-[#080c15] border border-[#212d49] focus:border-fuchsia-500 rounded-xl px-3 py-2 text-xs text-slate-100 outline-none"
                  >
                    {DANCE_STYLE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Camera Movement */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-[11px] font-bold text-sky-300">
                    <Camera className="w-3.5 h-3.5 text-sky-400" />
                    <span>Pergerakan Kamera</span>
                  </label>
                  <select
                    value={mc.cameraMovement}
                    onChange={(e) => updateSceneMotion(scene, { cameraMovement: e.target.value })}
                    className="w-full bg-[#080c15] border border-[#212d49] focus:border-sky-500 rounded-xl px-3 py-2 text-xs text-slate-100 outline-none"
                  >
                    {CAMERA_MOVEMENT_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Aesthetic Effect */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-[11px] font-bold text-amber-300">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Efek Estetika & Pencahayaan</span>
                  </label>
                  <select
                    value={mc.aestheticEffect}
                    onChange={(e) => updateSceneMotion(scene, { aestheticEffect: e.target.value })}
                    className="w-full bg-[#080c15] border border-[#212d49] focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-slate-100 outline-none"
                  >
                    {AESTHETIC_EFFECT_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Fine-Tune Controls: Intensity, Beat Tempo, Aspect Ratio, Custom Notes */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
                <div className="lg:col-span-4 space-y-1.5">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Intensitas Gerakan
                  </span>
                  <div className="grid grid-cols-4 gap-1 bg-[#080c15] border border-[#1d273f] p-1 rounded-xl">
                    {INTENSITY_OPTIONS.map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => updateSceneMotion(scene, { motionIntensity: level })}
                        className={`text-[10px] font-bold py-1.5 px-1 rounded-lg transition-all cursor-pointer ${
                          mc.motionIntensity === level
                            ? 'bg-fuchsia-600 text-white shadow'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="lg:col-span-3 space-y-1.5">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Tempo Beat
                  </span>
                  <select
                    value={mc.beatTempo}
                    onChange={(e) =>
                      updateSceneMotion(scene, {
                        beatTempo: e.target.value as SceneMotionControl['beatTempo'],
                      })
                    }
                    className="w-full bg-[#080c15] border border-[#212d49] focus:border-purple-500 rounded-xl px-2.5 py-2 text-xs text-slate-100 outline-none"
                  >
                    {TEMPO_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="lg:col-span-2 space-y-1.5">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Rasio
                  </span>
                  <div className="grid grid-cols-3 gap-1 bg-[#080c15] border border-[#1d273f] p-1 rounded-xl">
                    {ASPECT_OPTIONS.map((ratio) => (
                      <button
                        key={ratio}
                        type="button"
                        onClick={() => updateSceneMotion(scene, { aspectRatio: ratio })}
                        className={`text-[10px] font-mono font-bold py-1.5 rounded-lg transition-all cursor-pointer ${
                          mc.aspectRatio === ratio
                            ? 'bg-purple-600 text-white shadow'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {ratio}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="lg:col-span-3 space-y-1.5">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Catatan Gerakan Tambahan
                  </span>
                  <input
                    type="text"
                    value={mc.customMotionNotes || ''}
                    onChange={(e) => updateSceneMotion(scene, { customMotionNotes: e.target.value })}
                    placeholder="Misal: putar botol saat drop beat..."
                    className="w-full bg-[#080c15] border border-[#212d49] focus:border-fuchsia-500 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 outline-none"
                  />
                </div>
              </div>

              {/* Placeholder Alert Feedback when Generate Motion Video is clicked */}
              <AnimatePresence>
                {showPlaceholderNotice && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-3.5 flex items-start justify-between gap-3 text-xs">
                      <div className="flex items-start gap-2.5">
                        <Zap className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <div className="font-bold text-amber-200">
                            Placeholder Render Video — Adegan {index + 1}
                          </div>
                          <p className="text-[11px] text-amber-100/80 leading-relaxed">
                            Konfigurasi gerak ({mc.danceStyle}, {mc.cameraMovement}, {mc.aestheticEffect}) telah siap. Fitur render video AI langsung belum diaktifkan (memerlukan Paid API Key &amp; model video). Anda tetap dapat menyalin atau menyinkronkan Motion Prompt di bawah ke Google Flow.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setPlaceholderNoticeSceneIds((prev) => ({ ...prev, [scene.id]: false }))
                        }
                        className="text-amber-300 hover:text-white shrink-0"
                        title="Tutup notifikasi"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Compiled Motion Prompt Preview + Actions */}
              <div className="bg-[#080c16] border border-[#1a243b] rounded-xl p-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                    <Wand2 className="w-3 h-3" />
                    <span>Compiled Motion Control Prompt</span>
                  </div>
                  <p className="text-[11px] font-mono text-slate-300 leading-relaxed break-words">
                    {compiledPrompt}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                  <button
                    type="button"
                    onClick={() => handleCopyPrompt(scene)}
                    className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                      isCopied
                        ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300'
                        : 'bg-[#121a2d] hover:bg-[#1a243d] border-[#253352] text-slate-200'
                    }`}
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                        <span>Salin Prompt</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSyncToGoogleFlow(scene)}
                    className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                      isSynced
                        ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300'
                        : 'bg-purple-950/70 hover:bg-purple-900/80 border-purple-500/40 text-purple-200'
                    }`}
                    title="Simpan prompt Motion Control ini ke kolom Google Flow Prompt adegan"
                  >
                    {isSynced ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Tersinkron!</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                        <span>Sync ke Google Flow</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
