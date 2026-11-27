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
  Volume2,
  FlipHorizontal2,
  Link2,
  Square,
} from 'lucide-react';
import { Scene } from '../types';

interface TeleprompterModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  scenes: Scene[];
}

type FontSizePreset = 'S' | 'M' | 'L' | 'XL';

const FONT_SIZE_CLASS: Record<FontSizePreset, string> = {
  S: 'text-lg md:text-2xl',
  M: 'text-2xl md:text-3xl',
  L: 'text-3xl md:text-4xl',
  XL: 'text-4xl md:text-5xl',
};

export const TeleprompterModal: React.FC<TeleprompterModalProps> = ({
  isOpen,
  onClose,
  title,
  scenes,
}) => {
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isMirrored, setIsMirrored] = useState(false);
  const [fontSize, setFontSize] = useState<FontSizePreset>('M');
  const [isSpeakingVO, setIsSpeakingVO] = useState(false);
  const [ttsDurationSec, setTtsDurationSec] = useState<number | null>(null);
  const ttsStartTimeRef = useRef<number | null>(null);

  const activeScene = scenes[currentSceneIndex] || scenes[0];
  const [secondsRemaining, setSecondsRemaining] = useState(Number(activeScene?.duration) || 2);
  const [prevSceneIndex, setPrevSceneIndex] = useState(currentSceneIndex);
  if (prevSceneIndex !== currentSceneIndex) {
    setPrevSceneIndex(currentSceneIndex);
    setSecondsRemaining(Number(scenes[currentSceneIndex]?.duration) || 2);
    setTtsDurationSec(null);
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeakingVO(false);
  }

  useEffect(() => {
    let timer: any = null;
    if (isPlaying) {
      timer = setInterval(() => {
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
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

  // Stop speech synthesis on modal close or unmount
  useEffect(() => {
    if (!isOpen && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeakingVO(false);
    }
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isOpen]);

  if (!isOpen || !scenes.length) return null;

  const stopSpeech = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeakingVO(false);
  };

  const handleToggleTtsTest = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (isSpeakingVO) {
      stopSpeech();
      return;
    }

    const voText = (activeScene?.dialogVO || '').trim();
    if (!voText) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(voText);
    utterance.lang = 'id-ID';
    utterance.rate = 1.05;
    ttsStartTimeRef.current = performance.now();
    setTtsDurationSec(null);

    utterance.onend = () => {
      if (ttsStartTimeRef.current) {
        const elapsed = (performance.now() - ttsStartTimeRef.current) / 1000;
        setTtsDurationSec(Number(elapsed.toFixed(1)));
      }
      setIsSpeakingVO(false);
    };
    utterance.onerror = () => {
      setIsSpeakingVO(false);
    };

    setIsSpeakingVO(true);
    window.speechSynthesis.speak(utterance);
  };

  const handleNext = () => {
    stopSpeech();
    if (currentSceneIndex < scenes.length - 1) {
      setCurrentSceneIndex((i) => i + 1);
    }
  };

  const handlePrev = () => {
    stopSpeech();
    if (currentSceneIndex > 0) {
      setCurrentSceneIndex((i) => i - 1);
    }
  };

  const handleRestart = () => {
    stopSpeech();
    setCurrentSceneIndex(0);
    setSecondsRemaining(Number(scenes[0]?.duration) || 2);
    setIsPlaying(false);
  };

  const handleCloseModal = () => {
    stopSpeech();
    onClose();
  };

  const canSpeak =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    Boolean((activeScene?.dialogVO || '').trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/90 backdrop-blur-md animate-fadeIn">
      <div className={`bg-[#0d121c] border border-[#23304d] rounded-2xl w-full flex flex-col shadow-2xl overflow-hidden ${
        isFullScreen ? 'h-full max-h-full max-w-full' : 'max-w-4xl max-h-[92vh]'
      }`}>
        
        {/* Header */}
        <div className="p-4 border-b border-[#1f2a42] flex flex-wrap items-center justify-between gap-2 bg-[#111726]">
          <div className="flex items-center gap-3 min-w-0">
            <span className="bg-purple-900/80 text-purple-200 border border-purple-600/40 text-xs font-black px-3 py-1 rounded-md uppercase tracking-wider shrink-0">
              TELEPROMPTER &amp; SHOOTING
            </span>
            <h2 className="text-sm font-bold text-white truncate max-w-xs md:max-w-md">
              {title}
            </h2>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Font Size S / M / L / XL */}
            <div className="flex items-center gap-0.5 bg-[#0a0f1a] border border-[#22304c] rounded-lg p-0.5">
              {(['S', 'M', 'L', 'XL'] as FontSizePreset[]).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setFontSize(sz)}
                  className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors cursor-pointer ${
                    fontSize === sz
                      ? 'bg-purple-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title={`Ukuran teks ${sz}`}
                >
                  {sz}
                </button>
              ))}
            </div>

            {/* Mirror Flip Toggle */}
            <button
              type="button"
              onClick={() => setIsMirrored((prev) => !prev)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-colors cursor-pointer ${
                isMirrored
                  ? 'bg-cyan-950 text-cyan-200 border-cyan-500/60'
                  : 'bg-[#141c2e] text-slate-300 border-[#243250] hover:text-white'
              }`}
              title="Balik teks horizontal (Mirror mode untuk kamera depan / teleprompter glass)"
            >
              <FlipHorizontal2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Mirror</span>
            </button>

            {/* Tes Tempo VO (TTS) */}
            {canSpeak && (
              <button
                type="button"
                onClick={handleToggleTtsTest}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-colors cursor-pointer ${
                  isSpeakingVO
                    ? 'bg-rose-950 text-rose-200 border-rose-500/60'
                    : 'bg-[#141c2e] text-emerald-300 border-emerald-700/50 hover:bg-emerald-950/60'
                }`}
                title="Tes kecepatan baca VO (bahasa Indonesia) dibanding durasi adegan"
              >
                {isSpeakingVO ? (
                  <>
                    <Square className="w-3 h-3 fill-current" />
                    <span>Stop TTS</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Tes Tempo VO</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsFullScreen(!isFullScreen)}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#1a2338]"
              title={isFullScreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={handleCloseModal}
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
        <div className="flex-1 overflow-y-auto p-6 md:p-8 flex flex-col justify-between space-y-5 custom-scrollbar bg-gradient-to-b from-[#0d121c] to-[#101724]">
          
          {/* Top Cue Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-[#141b2b] border border-[#212c44] rounded-xl p-3 flex items-center gap-2.5">
              <Eye className="w-4 h-4 text-purple-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] uppercase font-bold text-slate-400">Angle Kamera</div>
                <div className="text-xs font-semibold text-white truncate">{activeScene.cameraAngle || 'Medium Shot'}</div>
              </div>
            </div>

            <div className="bg-[#141b2b] border border-[#212c44] rounded-xl p-3 flex items-center gap-2.5">
              <Type className="w-4 h-4 text-sky-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] uppercase font-bold text-slate-400">Teks Pop-up Layar</div>
                <div className="text-xs font-bold text-sky-300 truncate">{activeScene.popupText || '-'}</div>
              </div>
            </div>

            <div className="bg-[#141b2b] border border-[#212c44] rounded-xl p-3 flex items-center gap-2.5">
              <Music2 className="w-4 h-4 text-amber-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] uppercase font-bold text-slate-400">Efek Suara (SFX)</div>
                <div className="text-xs font-medium text-amber-300 italic truncate">{activeScene.soundEffect || '-'}</div>
              </div>
            </div>
          </div>

          {/* Transisi Pose Strip (if set) */}
          {activeScene.transitionBridge && (
            <div className="bg-[#11192b] border border-indigo-500/40 rounded-xl px-4 py-2.5 flex items-center gap-2 text-xs text-indigo-200">
              <Link2 className="w-4 h-4 text-indigo-400 shrink-0" />
              <span className="font-bold text-indigo-300 uppercase text-[10px] tracking-wider shrink-0">
                Transisi Pose:
              </span>
              <span className="font-medium">{activeScene.transitionBridge}</span>
            </div>
          )}

          {/* Visual Action Alert Box */}
          <div className="bg-[#131b2c] border border-indigo-900/40 rounded-2xl p-4 flex items-start gap-3 shadow-inner">
            <Video className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-indigo-300 mb-1">
                Aksi Visual &amp; Pergerakan Talent:
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
              {isMirrored && (
                <span className="text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-700/50 px-1.5 py-0.5 rounded">
                  MIRROR
                </span>
              )}
            </div>

            <div className={isMirrored ? 'scale-x-[-1]' : ''}>
              <p className={`${FONT_SIZE_CLASS[fontSize]} font-extrabold text-white leading-relaxed px-4 text-balance`}>
                &ldquo;{activeScene.dialogVO || '(Aksi visual tanpa suara dialog)'}&rdquo;
              </p>
            </div>

            {activeScene.notesMood && (
              <p className="text-xs text-slate-400 italic pt-2">
                Mood: {activeScene.notesMood}
              </p>
            )}

            {/* Countdown + Optional TTS Timing Badge */}
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <div className="inline-flex items-center gap-2 bg-purple-950/80 border border-purple-600/50 text-purple-200 px-4 py-1.5 rounded-full font-mono text-base font-bold shadow-lg">
                <span>Sisa Durasi Adegan:</span>
                <span className="text-emerald-400 text-lg">{secondsRemaining}s</span>
              </div>

              {ttsDurationSec !== null && (
                <div
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-xs font-bold border ${
                    ttsDurationSec > (Number(activeScene.duration) || 3)
                      ? 'bg-rose-950/80 border-rose-600/50 text-rose-200'
                      : 'bg-emerald-950/80 border-emerald-600/50 text-emerald-200'
                  }`}
                >
                  <span>Tempo TTS: ~{ttsDurationSec}s</span>
                  <span>vs</span>
                  <span>{activeScene.duration}s</span>
                </div>
              )}
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
