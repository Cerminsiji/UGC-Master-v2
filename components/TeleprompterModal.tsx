import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  SkipBack,
  Eye,
  Video,
  Type,
  Music2,
  Mic,
  Maximize2,
  Minimize2,
  Volume2
} from 'lucide-react';
import { Scene } from '../types';

interface TeleprompterModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  scenes: Scene[];
}

export const TeleprompterModal: React.FC<TeleprompterModalProps> = ({
  isOpen,
  onClose,
  title,
  scenes,
}) => {
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);

  const activeScene = scenes[currentSceneIndex] || scenes[0];
  const [secondsRemaining, setSecondsRemaining] = useState(Number(activeScene?.duration) || 2);
  const [prevSceneIndex, setPrevSceneIndex] = useState(currentSceneIndex);
  if (prevSceneIndex !== currentSceneIndex) {
    setPrevSceneIndex(currentSceneIndex);
    setSecondsRemaining(Number(scenes[currentSceneIndex]?.duration) || 2);
  }

  useEffect(() => {
    let timer: any = null;
    if (isPlaying) {
      timer = setInterval(() => {
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
            // Next scene or loop/finish
            if (currentSceneIndex < scenes.length - 1) {
              setCurrentSceneIndex((i) => i + 1);
              return Number(scenes[currentSceneIndex + 1]?.duration) || 2;
            } else {
              setIsPlaying(false);
              return 0;
            }
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isPlaying, currentSceneIndex, scenes]);

  if (!isOpen || !scenes.length) return null;

  const handleNext = () => {
    if (currentSceneIndex < scenes.length - 1) {
      setCurrentSceneIndex((i) => i + 1);
    }
  };

  const handlePrev = () => {
    if (currentSceneIndex > 0) {
      setCurrentSceneIndex((i) => i - 1);
    }
  };

  const handleRestart = () => {
    setCurrentSceneIndex(0);
    setSecondsRemaining(Number(scenes[0]?.duration) || 2);
    setIsPlaying(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/90 backdrop-blur-md animate-fadeIn">
      <div className={`bg-[#0d121c] border border-[#23304d] rounded-2xl w-full flex flex-col shadow-2xl overflow-hidden ${
        isFullScreen ? 'h-full max-h-full max-w-full' : 'max-w-4xl max-h-[92vh]'
      }`}>
        
        {/* Header */}
        <div className="p-4 border-b border-[#1f2a42] flex items-center justify-between bg-[#111726]">
          <div className="flex items-center gap-3">
            <span className="bg-purple-900/80 text-purple-200 border border-purple-600/40 text-xs font-black px-3 py-1 rounded-md uppercase tracking-wider">
              TELEPROMPTER & SHOOTING
            </span>
            <h2 className="text-sm font-bold text-white truncate max-w-xs md:max-w-md">
              {title}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsFullScreen(!isFullScreen)}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#1a2338]"
              title={isFullScreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#1a2338]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Storyboard Progress Line */}
        <div className="bg-[#161f30] px-4 py-2 border-b border-[#1f2a42] flex items-center justify-between overflow-x-auto gap-2">
          <div className="flex items-center gap-1.5 min-w-max">
            {scenes.map((s, idx) => (
              <button
                key={s.id}
                onClick={() => {
                  setCurrentSceneIndex(idx);
                  setIsPlaying(false);
                }}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  idx === currentSceneIndex
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-900/50 scale-105'
                    : idx < currentSceneIndex
                    ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                    : 'bg-[#121927] text-slate-400 hover:bg-[#1a2338]'
                }`}
              >
                ADEGAN {idx + 1} ({s.duration}s)
              </button>
            ))}
          </div>

          <div className="text-xs font-mono font-bold text-slate-400 shrink-0">
            {currentSceneIndex + 1} / {scenes.length} Adegan
          </div>
        </div>

        {/* Main Teleprompter Screen */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 flex flex-col justify-between space-y-6 custom-scrollbar bg-gradient-to-b from-[#0d121c] to-[#101724]">
          
          {/* Top Cue Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-[#141b2b] border border-[#212c44] rounded-xl p-3 flex items-center gap-2.5">
              <Eye className="w-4 h-4 text-purple-400 shrink-0" />
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400">Angle Kamera</div>
                <div className="text-xs font-semibold text-white truncate">{activeScene.cameraAngle || 'Medium Shot'}</div>
              </div>
            </div>

            <div className="bg-[#141b2b] border border-[#212c44] rounded-xl p-3 flex items-center gap-2.5">
              <Type className="w-4 h-4 text-sky-400 shrink-0" />
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400">Teks Pop-up Layar</div>
                <div className="text-xs font-bold text-sky-300 truncate">{activeScene.popupText || '-'}</div>
              </div>
            </div>

            <div className="bg-[#141b2b] border border-[#212c44] rounded-xl p-3 flex items-center gap-2.5">
              <Music2 className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400">Efek Suara (SFX)</div>
                <div className="text-xs font-medium text-amber-300 italic truncate">{activeScene.soundEffect || '-'}</div>
              </div>
            </div>
          </div>

          {/* Visual Action Alert Box */}
          <div className="bg-[#131b2c] border border-indigo-900/40 rounded-2xl p-4 flex items-start gap-3 shadow-inner">
            <Video className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-indigo-300 mb-1">
                Aksi Visual & Pergerakan Talent:
              </div>
              <p className="text-sm md:text-base text-slate-200 leading-relaxed font-medium">
                {activeScene.visualAction}
              </p>
            </div>
          </div>

          {/* Large Voiceover Script Display (Teleprompter text) */}
          <div className="bg-[#0b0e17] border border-[#25324e] rounded-2xl p-6 text-center space-y-3 relative overflow-hidden shadow-2xl">
            <div className="flex items-center justify-center gap-2 text-xs font-bold text-rose-400 uppercase tracking-widest">
              <Mic className="w-4 h-4" />
              <span>BACA DIALOG / VOICE OVER INI:</span>
            </div>

            <p className="text-2xl md:text-4xl font-extrabold text-white leading-relaxed px-4 text-balance">
              &ldquo;{activeScene.dialogVO || '(Aksi visual tanpa suara dialog)'}&rdquo;
            </p>

            {activeScene.notesMood && (
              <p className="text-xs text-slate-400 italic pt-2">
                Mood: {activeScene.notesMood}
              </p>
            )}

            {/* Countdown Badge */}
            <div className="inline-flex items-center gap-2 bg-purple-950/80 border border-purple-600/50 text-purple-200 px-4 py-1.5 rounded-full font-mono text-base font-bold shadow-lg">
              <span>Sisa Durasi Adegan:</span>
              <span className="text-emerald-400 text-lg">{secondsRemaining}s</span>
            </div>
          </div>

        </div>

        {/* Footer Player Controls */}
        <div className="p-4 border-t border-[#1f2a42] bg-[#111726] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={handleRestart}
              className="p-2.5 rounded-xl bg-[#182133] hover:bg-[#222e47] text-slate-300 transition-all"
              title="Ulangi dari Adegan 1"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={handlePrev}
              disabled={currentSceneIndex === 0}
              className="p-2.5 rounded-xl bg-[#182133] hover:bg-[#222e47] text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              title="Adegan Sebelumnya"
            >
              <SkipBack className="w-4 h-4" />
            </button>
          </div>

          {/* Main Play / Pause Button */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold px-6 py-2.5 rounded-xl shadow-lg shadow-purple-950/60 transition-all active:scale-95"
          >
            {isPlaying ? (
              <>
                <Pause className="w-5 h-5" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-5 h-5 fill-current" />
                <span>Mulai Rekam / Prompter</span>
              </>
            )}
          </button>

          <button
            onClick={handleNext}
            disabled={currentSceneIndex === scenes.length - 1}
            className="p-2.5 rounded-xl bg-[#182133] hover:bg-[#222e47] text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            title="Adegan Selanjutnya"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
};
