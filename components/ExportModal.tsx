import React, { useState, useEffect } from 'react';
import {
  X,
  FileText,
  Printer,
  Copy,
  Download,
  Upload,
  Check,
  Code,
  FileSpreadsheet,
  Sparkles,
  Loader2,
  AlertCircle,
  Video,
  Film,
  Wand2,
  Image as ImageIcon
} from 'lucide-react';
import { Scene, HookVariant } from '../types';
import { copyToClipboard, formatDuration } from '../utils/helpers';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  categoryName: string;
  referenceImage?: string;
  caption?: string;
  scenes: Scene[];
  hookVariants?: HookVariant[];
  initialTab?: 'table' | 'caption' | 'script' | 'capcut' | 'json' | 'googleflow';
  onImportJSON: (importedScenes: Scene[], importedTitle?: string) => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  title,
  categoryName,
  referenceImage,
  caption: initialCaption,
  scenes,
  hookVariants,
  initialTab = 'table',
  onImportJSON,
}) => {
  const [activeTab, setActiveTab] = useState<'table' | 'caption' | 'script' | 'capcut' | 'json' | 'googleflow'>(initialTab);
  const [prevTab, setPrevTab] = useState(initialTab);
  if (prevTab !== initialTab) {
    setPrevTab(initialTab);
    setActiveTab(initialTab);
  }

  const [caption, setCaption] = useState(initialCaption || '');
  const [prevCap, setPrevCap] = useState(initialCaption);
  if (prevCap !== initialCaption) {
    setPrevCap(initialCaption);
    setCaption(initialCaption || '');
  }

  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [isGeneratingCaption, setIsGeneratingCaption] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  if (!isOpen) return null;

  const totalDuration = scenes.reduce((sum, sc) => sum + (Number(sc.duration) || 0), 0);

  // Generate plain voiceover script
  const getPlainScript = () => {
    let output = `# ${title.toUpperCase()}\n`;
    output += `Kategori: ${categoryName} | Durasi Total: ${formatDuration(totalDuration)}\n\n`;
    output += `--------------------------------------------------------\n`;
    scenes.forEach((sc, i) => {
      output += `[ADEGAN ${i + 1} - ${sc.duration}s | ${sc.cameraAngle || 'Shot'}]\n`;
      output += `Visual: ${sc.visualAction}\n`;
      if (sc.popupText) output += `Teks Layar: ${sc.popupText}\n`;
      if (sc.soundEffect) output += `SFX: ${sc.soundEffect}\n`;
      output += `DIALOG: "${sc.dialogVO}"\n`;
      if (sc.notesMood) output += `Catatan/Mood: ${sc.notesMood}\n`;
      output += `\n`;
    });
    return output;
  };

  // Generate CapCut subtitle and sticker cue
  const getCapCutCueText = () => {
    let output = `🎬 FORMAT CAPCUT & TIKTOK VIDEO EDITOR: ${title.toUpperCase()}\n`;
    output += `Total Durasi: ${totalDuration}s\n\n`;
    output += `=== 📌 1. STIKER TEKS POP-UP LAYAR (TEMPEL KE CAPCUT TEXT TRACK) ===\n`;
    let accumulatedTime = 0;
    scenes.forEach((sc, i) => {
      const start = accumulatedTime;
      const end = accumulatedTime + (Number(sc.duration) || 3);
      accumulatedTime = end;
      const startStr = `00:${String(start).padStart(2, '0')}`;
      const endStr = `00:${String(end).padStart(2, '0')}`;
      output += `[${startStr} - ${endStr}] Adegan ${i + 1}: ${sc.popupText || '(Tanpa Teks)'}\n`;
    });

    output += `\n=== 🎙️ 2. SUBTITLE / VOICE OVER TRACK ===\n`;
    accumulatedTime = 0;
    scenes.forEach((sc, i) => {
      const start = accumulatedTime;
      const end = accumulatedTime + (Number(sc.duration) || 3);
      accumulatedTime = end;
      const startStr = `00:${String(start).padStart(2, '0')}`;
      const endStr = `00:${String(end).padStart(2, '0')}`;
      output += `[${startStr} - ${endStr}] Adegan ${i + 1}: "${sc.dialogVO || ''}"\n`;
      if (sc.soundEffect) {
        output += `  ↳ SFX: ${sc.soundEffect}\n`;
      }
    });

    return output;
  };

  // Generate Google Flow Video UGC AI Prompts
  const getGoogleFlowPromptsText = () => {
    let output = `🌊 GOOGLE FLOW VIDEO UGC - AI PROMPTS LIST: ${title.toUpperCase()}\n`;
    output += `Total Adegan: ${scenes.length} Scenes | Durasi: ${totalDuration}s\n`;
    output += `Referensi Image: ${referenceImage ? referenceImage : 'Gunakan gambar produk/kemasan resmi'}\n`;
    output += `Panduan: Unggah referensi image produk ke Google Flow / Veo / AI Video generator, lalu masukkan prompt tiap adegan.\n`;
    output += `--------------------------------------------------------\n\n`;

    scenes.forEach((sc, i) => {
      const popupText = sc.popupText && sc.popupText.trim() && sc.popupText.trim() !== '-'
        ? sc.popupText.trim()
        : (() => {
            const match = sc.googleFlowPrompt?.match(/On-Screen Pop-up Text Overlay:\s*["']?([^"'\-\}\]]+)["']?/i);
            if (match && match[1]) return match[1].trim();
            return i === 0 ? 'JANGAN SKIP DULU! 🔥' : `SOLUSI: ${title.toUpperCase()}`;
          })();

      let flowPrompt = sc.googleFlowPrompt && sc.googleFlowPrompt.trim() ? sc.googleFlowPrompt.trim() : '';
      if (!flowPrompt) {
        flowPrompt = `[Image 1 Reference: ${title}] Scene ${i + 1} (${sc.cameraAngle || 'Medium Shot'}): ${sc.visualAction} - On-Screen Pop-up Text Overlay: "${popupText}" - Follow physical packaging in reference image, vertical 9:16 smartphone UGC video, photorealistic 4k 60fps.`;
      } else if (!/on-screen pop-up text overlay|text overlay|popup text/i.test(flowPrompt)) {
        flowPrompt = `${flowPrompt} - On-Screen Pop-up Text Overlay: "${popupText}"`;
      }

      output += `=== ADEGAN ${i + 1} (${sc.duration}s | ${sc.cameraAngle || 'Shot'}) ===\n`;
      output += `Prompt Google Flow (Image-to-Video):\n`;
      output += `${flowPrompt}\n`;
      output += `Teks Pop-up Layar: "${popupText}"\n`;
      output += `Kepatuhan Referensi Image: ${sc.imageReferenceNote || 'Pastikan Produk sesuai Gambar referensi yang sudah di upload'}\n`;
      output += `Dialog VO: "${sc.dialogVO}"\n`;
      output += `SFX: ${sc.soundEffect || '-'}\n\n`;
    });

    return output;
  };

  const getGoogleFlowJSON = () => {
    return JSON.stringify(
      {
        projectName: title,
        category: categoryName,
        referenceImage: referenceImage || 'Pastikan Produk sesuai Gambar referensi yang sudah di upload',
        totalDuration,
        googleFlowPipeline: scenes.map((sc, i) => {
          const popupText = sc.popupText && sc.popupText.trim() && sc.popupText.trim() !== '-'
            ? sc.popupText.trim()
            : (() => {
                const match = sc.googleFlowPrompt?.match(/On-Screen Pop-up Text Overlay:\s*["']?([^"'\-\}\]]+)["']?/i);
                if (match && match[1]) return match[1].trim();
                return i === 0 ? 'JANGAN SKIP DULU! 🔥' : 'SOLUSI TERBAIK ✨';
              })();

          let flowPrompt = sc.googleFlowPrompt && sc.googleFlowPrompt.trim() ? sc.googleFlowPrompt.trim() : '';
          if (!flowPrompt) {
            flowPrompt = `[Image 1 Reference: ${title}] Scene ${i + 1} (${sc.cameraAngle || 'Medium Shot'}): ${sc.visualAction} - On-Screen Pop-up Text Overlay: "${popupText}" - Follow reference image packaging, vertical 9:16 smartphone UGC video, 4k 60fps.`;
          } else if (!/on-screen pop-up text overlay|text overlay|popup text/i.test(flowPrompt)) {
            flowPrompt = `${flowPrompt} - On-Screen Pop-up Text Overlay: "${popupText}"`;
          }

          return {
            sceneNumber: i + 1,
            cameraAngle: sc.cameraAngle || 'Medium Shot',
            duration: Number(sc.duration) || 3,
            popupText,
            googleFlowPrompt: flowPrompt,
            imageReferenceNote: sc.imageReferenceNote || 'Pastikan Produk sesuai Gambar referensi yang sudah di upload',
            visualAction: sc.visualAction,
            dialogVO: sc.dialogVO,
            soundEffect: sc.soundEffect || '-',
          };
        }),
        exportedAt: new Date().toISOString(),
      },
      null,
      2
    );
  };

  const handleDownloadGoogleFlowJSON = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(getGoogleFlowJSON());
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute(
      'download',
      `${title.toLowerCase().replace(/\s+/g, '_')}_google_flow.json`
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleCopyText = async (text: string, type: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 2000);
    }
  };

  const getFullStoryboardJSON = () => {
    return JSON.stringify(
      {
        title,
        category: categoryName,
        totalDuration,
        caption,
        hookVariants,
        scenes: scenes.map((sc, i) => {
          const popupText = sc.popupText && sc.popupText.trim() && sc.popupText.trim() !== '-'
            ? sc.popupText.trim()
            : (() => {
                const match = sc.googleFlowPrompt?.match(/On-Screen Pop-up Text Overlay:\s*["']?([^"'\-\}\]]+)["']?/i);
                if (match && match[1]) return match[1].trim();
                return i === 0 ? 'JANGAN SKIP DULU! 🔥' : 'SOLUSI TERBAIK ✨';
              })();

          let flowPrompt = sc.googleFlowPrompt && sc.googleFlowPrompt.trim() ? sc.googleFlowPrompt.trim() : '';
          if (!flowPrompt) {
            flowPrompt = `[Image 1 Reference: ${title}] Scene ${i + 1} (${sc.cameraAngle || 'Medium Shot'}): ${sc.visualAction} - On-Screen Pop-up Text Overlay: "${popupText}" - Follow physical packaging in reference image, vertical 9:16 smartphone UGC video, photorealistic 4k 60fps.`;
          } else if (!/on-screen pop-up text overlay|text overlay|popup text/i.test(flowPrompt)) {
            flowPrompt = `${flowPrompt} - On-Screen Pop-up Text Overlay: "${popupText}"`;
          }

          return {
            ...sc,
            order: sc.order || i + 1,
            popupText,
            imageReferenceNote: sc.imageReferenceNote || 'Pastikan Produk sesuai Gambar referensi yang sudah di upload',
            googleFlowPrompt: flowPrompt,
          };
        }),
        exportedAt: new Date().toISOString(),
      },
      null,
      2
    );
  };

  const handleDownloadJSON = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(getFullStoryboardJSON());
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${title.toLowerCase().replace(/\s+/g, '_')}_storyboard.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (Array.isArray(parsed.scenes)) {
          onImportJSON(parsed.scenes, parsed.title);
          onClose();
        } else if (Array.isArray(parsed)) {
          onImportJSON(parsed);
          onClose();
        } else {
          setUploadError('Format JSON tidak sesuai: harus berisi array adegan (scenes).');
        }
      } catch {
        setUploadError('Format file JSON tidak valid. Pastikan file berformat JSON.');
      }
    };
    reader.readAsText(file);
  };

  const handleGenerateCaption = async () => {
    setIsGeneratingCaption(true);
    try {
      const res = await fetch('/api/generate-caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: title,
          category: categoryName,
          keySellingPoints: scenes.map((s) => s.popupText).filter(Boolean).slice(0, 3).join(', '),
        }),
      });
      const data = await res.json();
      if (data.success && data.caption) {
        setCaption(data.caption);
      }
    } catch (e) {
      console.error('Failed to generate caption:', e);
    } finally {
      setIsGeneratingCaption(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#0f1422] border border-[#23304d] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-4 md:p-5 border-b border-[#1f2a42] flex items-center justify-between bg-[#131929]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-950 border border-purple-800/60 flex items-center justify-center text-purple-300">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Export & Bagikan Storyboard
              </h2>
              <p className="text-xs text-slate-400">
                Cetak Shooting Board, format CapCut timeline cue, salin Voiceover script, atau simpan JSON.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#1a2338]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="px-5 pt-3 border-b border-[#1f2a42] bg-[#111726] flex items-center gap-2 overflow-x-auto custom-scrollbar">
          <button
            onClick={() => setActiveTab('table')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-colors flex items-center gap-1.5 border-b-2 whitespace-nowrap ${
              activeTab === 'table'
                ? 'text-purple-400 border-purple-500 bg-[#161f31]'
                : 'text-slate-400 border-transparent hover:text-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Shooting Board (PDF Ready)</span>
          </button>

          <button
            onClick={() => setActiveTab('capcut')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-colors flex items-center gap-1.5 border-b-2 whitespace-nowrap ${
              activeTab === 'capcut'
                ? 'text-purple-400 border-purple-500 bg-[#161f31]'
                : 'text-slate-400 border-transparent hover:text-slate-200'
            }`}
          >
            <Video className="w-3.5 h-3.5 text-sky-400" />
            <span>Format CapCut & Editor</span>
          </button>

          <button
            onClick={() => setActiveTab('caption')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-colors flex items-center gap-1.5 border-b-2 whitespace-nowrap ${
              activeTab === 'caption'
                ? 'text-purple-400 border-purple-500 bg-[#161f31]'
                : 'text-slate-400 border-transparent hover:text-slate-200'
            }`}
          >
            <span className="text-amber-400">✨</span>
            <span>Caption & Hashtags (≤150 Karakter)</span>
          </button>

          <button
            onClick={() => setActiveTab('script')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-colors flex items-center gap-1.5 border-b-2 whitespace-nowrap ${
              activeTab === 'script'
                ? 'text-purple-400 border-purple-500 bg-[#161f31]'
                : 'text-slate-400 border-transparent hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Naskah VO / Script Talent</span>
          </button>

          <button
            onClick={() => setActiveTab('googleflow')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-colors flex items-center gap-1.5 border-b-2 whitespace-nowrap ${
              activeTab === 'googleflow'
                ? 'text-cyan-400 border-cyan-500 bg-[#121c2d]'
                : 'text-slate-400 border-transparent hover:text-slate-200'
            }`}
          >
            <span className="text-cyan-400">🌊</span>
            <span>Google Flow Video UGC</span>
            <span className="text-[9px] bg-cyan-950 text-cyan-300 border border-cyan-800/60 px-1.5 py-0.2 rounded font-mono">
              AI Video Prompts
            </span>
          </button>

          <button
            onClick={() => setActiveTab('json')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-colors flex items-center gap-1.5 border-b-2 whitespace-nowrap ${
              activeTab === 'json'
                ? 'text-purple-400 border-purple-500 bg-[#161f31]'
                : 'text-slate-400 border-transparent hover:text-slate-200'
            }`}
          >
            <Code className="w-3.5 h-3.5 text-emerald-400" />
            <span>JSON Storyboard</span>
            <span className="text-[9px] bg-emerald-950 text-emerald-300 border border-emerald-800/40 px-1.5 py-0.2 rounded font-mono">
              Salin / Unduh
            </span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-4 md:p-6 overflow-y-auto max-h-[calc(90vh-140px)] custom-scrollbar">
          
          {/* TAB 1: SHOOTING BOARD TABLE */}
          {activeTab === 'table' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Pratinjau lembar produksi video untuk tim syuting dan klien.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopyText(getPlainScript(), 'table')}
                    className="flex items-center gap-1 bg-[#182133] hover:bg-[#202c42] text-slate-300 text-xs font-bold px-3 py-1.5 rounded-lg border border-[#222e47] transition-all"
                  >
                    {copiedType === 'table' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Teks</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={handlePrint}
                    className="flex items-center gap-1 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow transition-all"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Cetak / Simpan PDF</span>
                  </button>
                </div>
              </div>

              {/* Printable Table */}
              <div className="p-5 bg-white text-slate-900 rounded-xl overflow-x-auto shadow" id="printable-board">
                <div className="border-b pb-3 mb-4 flex items-center justify-between">
                  <div>
                    <h1 className="text-lg font-black tracking-tight">{title}</h1>
                    <p className="text-xs text-slate-500">
                      Kategori: {categoryName} • Total Durasi: {formatDuration(totalDuration)} ({totalDuration} detik)
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold bg-purple-100 text-purple-800 px-2.5 py-1 rounded-md">
                      Shooting Storyboard
                    </span>
                  </div>
                </div>

                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b-2 border-slate-300 text-slate-700">
                      <th className="py-2 px-2 font-bold w-12">#</th>
                      <th className="py-2 px-2 font-bold w-16">Durasi</th>
                      <th className="py-2 px-2 font-bold w-48">Angle & Visual</th>
                      <th className="py-2 px-2 font-bold w-36">Teks Pop-up</th>
                      <th className="py-2 px-2 font-bold">Voiceover / Dialog</th>
                      <th className="py-2 px-2 font-bold w-28">SFX</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {scenes.map((sc, i) => (
                      <tr key={sc.id} className="align-top">
                        <td className="py-2.5 px-2 font-bold text-purple-700">{i + 1}</td>
                        <td className="py-2.5 px-2 font-mono font-bold text-emerald-700">{sc.duration}s</td>
                        <td className="py-2.5 px-2">
                          {sc.cameraAngle && (
                            <span className="inline-block bg-slate-100 text-slate-700 font-bold px-1.5 py-0.5 rounded text-[10px] mr-1">
                              {sc.cameraAngle}
                            </span>
                          )}
                          <p className="mt-0.5">{sc.visualAction}</p>
                        </td>
                        <td className="py-2.5 px-2 font-bold text-sky-800">{sc.popupText || '-'}</td>
                        <td className="py-2.5 px-2 italic font-medium">&ldquo;{sc.dialogVO || '-'}&rdquo;</td>
                        <td className="py-2.5 px-2 text-amber-700 text-[11px]">{sc.soundEffect || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: CAPCUT & VIDEO EDITOR FORMAT */}
          {activeTab === 'capcut' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">
                    Cue Sheet CapCut & Premiere Pro (Timeline & Subtitle)
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Tinggal salin dan paste ke CapCut Text Sticker tanpa perlu mengetik ulang!
                  </span>
                </div>

                <button
                  onClick={() => handleCopyText(getCapCutCueText(), 'capcut')}
                  className="flex items-center gap-1.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white text-xs font-bold px-3.5 py-1.5 rounded-xl shadow-md transition-all active:scale-95"
                >
                  {copiedType === 'capcut' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Format CapCut Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Salin Semua Cue CapCut</span>
                    </>
                  )}
                </button>
              </div>

              <pre className="p-4 rounded-xl bg-[#0b0e17] border border-[#212c44] text-xs font-mono text-sky-200 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto custom-scrollbar">
                {getCapCutCueText()}
              </pre>
            </div>
          )}

          {/* TAB 3: CAPTION */}
          {activeTab === 'caption' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Caption postingan TikTok / Shopee Video (Maksimal 150 Karakter).
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleGenerateCaption}
                    disabled={isGeneratingCaption}
                    className="flex items-center gap-1 bg-[#182133] hover:bg-[#202c42] text-purple-300 text-xs font-bold px-3 py-1.5 rounded-lg border border-purple-800/40 transition-all disabled:opacity-50"
                  >
                    {isGeneratingCaption ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span>Buat Ulang Caption</span>
                  </button>

                  <button
                    onClick={() => handleCopyText(caption, 'caption')}
                    className="flex items-center gap-1 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow transition-all"
                  >
                    {copiedType === 'caption' ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Caption</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <textarea
                  rows={4}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  className="w-full bg-[#0a0e18] border border-[#1e2a42] focus:border-purple-500 rounded-xl p-3 text-xs sm:text-sm text-slate-100 outline-none leading-relaxed transition-all resize-y"
                  placeholder="Ketik caption video..."
                />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Maksimal 150 karakter untuk TikTok Affiliate.</span>
                  <span
                    className={`font-mono font-bold px-2 py-0.5 rounded ${
                      caption.length <= 150
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/40'
                        : 'bg-rose-950 text-rose-300 border border-rose-800/40'
                    }`}
                  >
                    {caption.length} / 150 Karakter
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SCRIPT TALENT */}
          {activeTab === 'script' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Naskah dialog talent / voiceover untuk dibaca saat recording.
                </span>
                <button
                  onClick={() => handleCopyText(getPlainScript(), 'script')}
                  className="flex items-center gap-1 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow transition-all"
                >
                  {copiedType === 'script' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Salin Naskah</span>
                    </>
                  )}
                </button>
              </div>

              <pre className="p-4 rounded-xl bg-[#0b0e17] border border-[#212c44] text-xs font-mono text-slate-200 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto custom-scrollbar">
                {getPlainScript()}
              </pre>
            </div>
          )}

          {/* TAB: GOOGLE FLOW VIDEO UGC */}
          {activeTab === 'googleflow' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#0c1322] border border-cyan-800/50 p-3.5 rounded-xl">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-cyan-300 flex items-center gap-1.5">
                      <span>🌊 Prompt AI Video Google Flow</span>
                      <span className="text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-700/60 px-2 py-0.5 rounded font-mono">
                        9:16 UGC Vertikal
                      </span>
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Prompt AI Video yang selalu mengikuti referensi image produk secara ketat dan bebas dari typo.
                  </p>
                  {referenceImage && (
                    <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-cyan-200/90 bg-cyan-950/60 border border-cyan-800/60 px-2 py-0.5 rounded-lg max-w-xl truncate">
                      <ImageIcon className="w-3.5 h-3.5 shrink-0 text-cyan-400" />
                      <span className="truncate">Referensi Image: {referenceImage}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <button
                    onClick={() => handleCopyText(getGoogleFlowJSON(), 'googleflow_json')}
                    className="flex items-center gap-1.5 bg-[#101b2e] hover:bg-[#182845] text-cyan-300 text-xs font-bold px-3 py-2 rounded-lg border border-cyan-700/50 transition-all active:scale-95"
                    title="Salin format JSON lengkap dengan Teks Pop-up untuk integrasi Google Flow"
                  >
                    {copiedType === 'googleflow_json' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>JSON Flow Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin JSON Google Flow</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleDownloadGoogleFlowJSON}
                    className="flex items-center gap-1.5 bg-[#101b2e] hover:bg-[#182845] text-slate-300 text-xs font-bold px-3 py-2 rounded-lg border border-cyan-800/40 transition-all active:scale-95"
                    title="Download file JSON pipeline Google Flow"
                  >
                    <Download className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Download JSON Flow</span>
                  </button>

                  <button
                    onClick={() => handleCopyText(getGoogleFlowPromptsText(), 'googleflow_all')}
                    className="flex items-center gap-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow-md shadow-cyan-950/50 transition-all active:scale-95 border border-cyan-400/30"
                  >
                    {copiedType === 'googleflow_all' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-300" />
                        <span>Semua Prompt Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Semua Prompt Google Flow</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Per-Scene Prompt Cards */}
              <div className="space-y-3">
                {scenes.map((sc, i) => (
                  <div
                    key={sc.id || i}
                    className="bg-[#0b101d] border border-cyan-900/40 rounded-xl p-3.5 space-y-2 hover:border-cyan-600/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800/80 px-2 py-0.5 rounded uppercase font-mono">
                          Adegan {i + 1} • {sc.duration}s
                        </span>
                        <span className="text-xs font-semibold text-slate-300">
                          {sc.cameraAngle || 'Sudut Kamera'}
                        </span>
                      </div>

                      <button
                        onClick={() => handleCopyText(sc.googleFlowPrompt || `[Image 1 Reference: ${title}] Scene ${i + 1}: ${sc.visualAction}`, `flow_sc_${i}`)}
                        className="flex items-center gap-1 text-[11px] font-bold text-cyan-300 hover:text-cyan-200 bg-[#121c2e] hover:bg-[#18263e] px-2.5 py-1 rounded-lg border border-cyan-800/60 transition-colors"
                      >
                        {copiedType === `flow_sc_${i}` ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span>Tersalin!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Salin Prompt Scene {i + 1}</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Teks Pop-up Layar */}
                    <div className="flex items-center justify-between bg-[#0a1526] border border-cyan-800/40 px-3 py-1.5 rounded-lg text-xs">
                      <div className="flex items-center gap-2 truncate">
                        <span className="text-cyan-400 font-bold uppercase text-[10px] tracking-wider shrink-0">
                          💬 Teks Pop-up:
                        </span>
                        <span className="font-extrabold text-cyan-100 truncate">
                          {sc.popupText || '(Tanpa Teks Pop-up)'}
                        </span>
                      </div>
                      {sc.popupText && (
                        <button
                          onClick={() => handleCopyText(sc.popupText, `flow_popup_${i}`)}
                          className="text-[10px] font-bold text-cyan-300 hover:text-cyan-100 flex items-center gap-1 font-mono shrink-0 ml-2 bg-cyan-950 hover:bg-cyan-900 border border-cyan-800/60 px-2 py-0.5 rounded transition-colors"
                        >
                          {copiedType === `flow_popup_${i}` ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span>Tersalin!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Salin Teks</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    <div className="bg-[#060a12] p-2.5 rounded-lg border border-cyan-950">
                      <p className="text-xs font-mono text-cyan-200/90 leading-relaxed whitespace-pre-wrap">
                        {sc.googleFlowPrompt || `[Image 1 Reference: ${title}] Scene ${i + 1} (${sc.cameraAngle}): ${sc.visualAction}. Follow reference image packaging, photorealistic 9:16 vertical smartphone camera video, 4k 60fps.`}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 italic">
                      <span className="text-cyan-400 font-semibold not-italic">🎯 Kepatuhan Visual:</span>
                      <span>{sc.imageReferenceNote || 'Pastikan Produk sesuai Gambar referensi yang sudah di upload'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: JSON */}
          {activeTab === 'json' && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                  <span className="text-xs font-bold text-slate-200 block">
                    Data Struktur JSON Storyboard
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Format lengkap untuk integrasi AI, generator, backup, atau import ke project lain.
                  </span>
                </div>

                <div className="flex items-center flex-wrap gap-2">
                  <label className="flex items-center gap-1 bg-[#182133] hover:bg-[#202c42] text-slate-300 text-xs font-bold px-3 py-1.5 rounded-lg border border-[#222e47] cursor-pointer transition-all active:scale-95">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Import JSON</span>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>

                  <button
                    onClick={handleDownloadJSON}
                    className="flex items-center gap-1 bg-[#182133] hover:bg-[#202c42] text-slate-300 text-xs font-bold px-3 py-1.5 rounded-lg border border-[#222e47] transition-all active:scale-95"
                    title="Unduh file .json ke komputer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .json</span>
                  </button>

                  <button
                    onClick={() => handleCopyText(getGoogleFlowJSON(), 'googleflow_json_tab')}
                    className="flex items-center gap-1 bg-[#101b2e] hover:bg-[#182845] text-cyan-300 text-xs font-bold px-3 py-1.5 rounded-lg border border-cyan-700/50 transition-all active:scale-95"
                    title="Salin JSON khusus pipeline Google Flow Video AI lengkap dengan Teks Pop-up"
                  >
                    {copiedType === 'googleflow_json_tab' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-300">JSON Flow Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Salin JSON Google Flow</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() =>
                      handleCopyText(
                        JSON.stringify(
                          scenes.map((sc, i) => {
                            const popupText = sc.popupText && sc.popupText.trim() && sc.popupText.trim() !== '-'
                              ? sc.popupText.trim()
                              : (() => {
                                  const match = sc.googleFlowPrompt?.match(/On-Screen Pop-up Text Overlay:\s*["']?([^"'\-\}\]]+)["']?/i);
                                  if (match && match[1]) return match[1].trim();
                                  return i === 0 ? 'JANGAN SKIP DULU! 🔥' : 'SOLUSI TERBAIK ✨';
                                })();
                            return {
                              ...sc,
                              order: sc.order || i + 1,
                              popupText,
                              imageReferenceNote: sc.imageReferenceNote || 'Pastikan Produk sesuai Gambar referensi yang sudah di upload',
                            };
                          }),
                          null,
                          2
                        ),
                        'scenes_only'
                      )
                    }
                    className="flex items-center gap-1 bg-[#182133] hover:bg-[#202c42] text-purple-300 text-xs font-bold px-3 py-1.5 rounded-lg border border-purple-800/40 transition-all active:scale-95"
                    title="Hanya salin array daftar adegan"
                  >
                    {copiedType === 'scenes_only' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-300">Adegan Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Array Adegan</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => handleCopyText(getFullStoryboardJSON(), 'json_full')}
                    className="flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg shadow-md shadow-purple-950/50 transition-all active:scale-95 border border-purple-400/30"
                    title="Salin data JSON lengkap Storyboard (Judul, Durasi, Caption, Variasi Hook, dan Adegan)"
                  >
                    {copiedType === 'json_full' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-300" />
                        <span>JSON Lengkap Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin JSON Storyboard</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {uploadError && (
                <div className="p-3 bg-rose-950/60 border border-rose-800/80 rounded-xl flex items-center gap-2 text-rose-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{uploadError}</span>
                </div>
              )}

              <div className="relative">
                <div className="absolute top-2.5 right-2.5 flex items-center gap-2 z-10">
                  <span className="text-[10px] font-mono font-bold bg-[#141b2c] border border-slate-700/60 text-slate-400 px-2 py-0.5 rounded">
                    {scenes.length} Scenes • {totalDuration}s Total
                  </span>
                </div>
                <pre className="p-4 rounded-xl bg-[#0b0e17] border border-[#212c44] text-xs font-mono text-purple-300 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto custom-scrollbar">
                  {getFullStoryboardJSON()}
                </pre>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
