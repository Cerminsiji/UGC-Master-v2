import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Copy,
  Printer,
  Check,
  Eye,
  Type,
  Mic,
  Music2,
  Clock,
  Video
} from 'lucide-react';
import { Scene } from '../types';
import { copyToClipboard, formatDuration } from '../utils/helpers';

interface ScriptTableViewProps {
  scenes: Scene[];
  title: string;
  categoryName: string;
  caption?: string;
}

export const ScriptTableView: React.FC<ScriptTableViewProps> = ({
  scenes,
  title,
  categoryName,
  caption,
}) => {
  const [copied, setCopied] = useState(false);

  const totalDuration = scenes.reduce((sum, sc) => sum + (Number(sc.duration) || 0), 0);

  const handleCopyMarkdownTable = async () => {
    let md = `# Storyboard Naskah: ${title} (${categoryName})\n`;
    md += `Total Durasi: ${totalDuration} detik (${formatDuration(totalDuration)})\n\n`;
    md += `| # | Durasi | Angle & Visual | Teks Pop-up | Voice Over / Dialog | SFX | Catatan / Mood |\n`;
    md += `|---|--------|----------------|-------------|---------------------|-----|----------------|\n`;

    scenes.forEach((sc, i) => {
      md += `| Adegan ${i + 1} | ${sc.duration}s | **${sc.cameraAngle}**: ${sc.visualAction.replace(/\|/g, '/')} | ${sc.popupText.replace(/\|/g, '/')} | ${sc.dialogVO.replace(/\|/g, '/')} | ${sc.soundEffect.replace(/\|/g, '/')} | ${sc.notesMood.replace(/\|/g, '/')} |\n`;
    });

    if (caption) {
      md += `\n### Auto Caption & Hashtags:\n${caption}\n`;
    }

    const ok = await copyToClipboard(md);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="bg-[#0f1422] border border-[#1e293f] rounded-2xl p-5 shadow-2xl space-y-4">
      {/* Table Header Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-[#1c273e]">
        <div>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-bold text-white tracking-tight">
              Tabel Breakdown Naskah & Syuting
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Format ringkas tabel adegan siap diprint atau dikirim ke klien & tim editor.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyMarkdownTable}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-[#161f31] hover:bg-[#202c46] text-purple-300 border border-purple-800/40 transition-all active:scale-95"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Tabel Tersalin!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Salin Format Markdown</span>
              </>
            )}
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-[#161f31] hover:bg-[#202c46] text-slate-300 border border-[#212c44] transition-all active:scale-95"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Naskah</span>
          </button>
        </div>
      </div>

      {/* Script Table */}
      <div className="overflow-x-auto rounded-xl border border-[#1c273e] bg-[#0c101a]">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-[#121927] text-slate-300 border-b border-[#1c273e]">
              <th className="p-3 font-bold uppercase tracking-wider text-[10px] w-14">#</th>
              <th className="p-3 font-bold uppercase tracking-wider text-[10px] w-20">Durasi</th>
              <th className="p-3 font-bold uppercase tracking-wider text-[10px] min-w-[200px]">Angle & Aksi Visual</th>
              <th className="p-3 font-bold uppercase tracking-wider text-[10px] min-w-[160px]">Teks Pop-up Layar</th>
              <th className="p-3 font-bold uppercase tracking-wider text-[10px] min-w-[220px]">Voice Over / Dialog</th>
              <th className="p-3 font-bold uppercase tracking-wider text-[10px] min-w-[140px]">SFX (Sound)</th>
              <th className="p-3 font-bold uppercase tracking-wider text-[10px] min-w-[150px]">Catatan / Mood</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#182133]">
            {scenes.map((scene, index) => {
              const wordCount = (scene.dialogVO || '').trim().split(/\s+/).filter(Boolean).length;

              return (
                <tr
                  key={scene.id}
                  className="hover:bg-[#121827] transition-colors"
                >
                  <td className="p-3 font-bold text-purple-400 align-top">
                    {index + 1}
                  </td>

                  <td className="p-3 align-top">
                    <span className="font-mono font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40 whitespace-nowrap">
                      {scene.duration}s
                    </span>
                  </td>

                  <td className="p-3 align-top space-y-1">
                    {scene.cameraAngle && (
                      <span className="inline-block text-[10px] font-bold text-purple-300 bg-purple-950/80 px-2 py-0.5 rounded border border-purple-800/40 mr-1.5">
                        {scene.cameraAngle}
                      </span>
                    )}
                    <p className="text-slate-200 leading-relaxed">
                      {scene.visualAction || '-'}
                    </p>
                  </td>

                  <td className="p-3 align-top">
                    {scene.popupText ? (
                      <span className="inline-block font-bold text-sky-300 bg-sky-950/50 border border-sky-800/40 px-2 py-1 rounded-lg">
                        {scene.popupText}
                      </span>
                    ) : (
                      <span className="text-slate-500 italic">-</span>
                    )}
                  </td>

                  <td className="p-3 align-top space-y-1">
                    <p className="text-slate-100 font-medium leading-relaxed">
                      &ldquo;{scene.dialogVO || '-'}&rdquo;
                    </p>
                    {wordCount > 0 && (
                      <span className="inline-block text-[10px] text-slate-400">
                        {wordCount} kata ({Math.round((wordCount / (scene.duration || 1)) * 60)} WPM)
                      </span>
                    )}
                  </td>

                  <td className="p-3 align-top">
                    {scene.soundEffect ? (
                      <span className="text-amber-300 italic">
                        {scene.soundEffect}
                      </span>
                    ) : (
                      <span className="text-slate-500">-</span>
                    )}
                  </td>

                  <td className="p-3 align-top text-slate-400">
                    {scene.notesMood || '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {caption && (
        <div className="p-3.5 bg-[#121927] border border-[#1e2a42] rounded-xl text-xs space-y-1">
          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
            Auto Caption & Hashtags Video
          </span>
          <p className="text-slate-200">{caption}</p>
        </div>
      )}
    </div>
  );
};
