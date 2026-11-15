'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Grid,
  Layers,
  RefreshCw,
  ScanLine,
  Sparkles,
} from 'lucide-react';

interface WatermarkNoiseVisualizerProps {
  previewUrlBefore: string | null;
  previewUrlAfter: string | null;
  beforeFileName?: string;
  afterFileName?: string;
}

type ViewMode = 'heatmap' | 'residual' | 'grid';
type SamplePoint = 'start' | 'q1' | 'mid' | 'q3';

interface CellMetric {
  row: number;
  col: number;
  energy: number; // 0-100
  flagged: boolean;
}

interface FrameAnalysisResult {
  width: number;
  height: number;
  timestampSec: number;
  durationSec: number;
  hfNoiseDensityPct: number;
  flaggedCellsCount: number;
  totalCells: number;
  peakRegionEnergy: number;
  meanResidual: number;
  chromaResidualAvg: number;
  hotRegions: string[];
  cells: CellMetric[];
  originalPixels: Uint8ClampedArray;
  residualMap: Float32Array; // 0..1 normalized per-pixel HF residual
  chromaMap: Float32Array;
}

const GRID_ROWS = 8;
const GRID_COLS = 12;
const CELL_FLAG_THRESHOLD = 34;

async function extractVideoFramePixels(
  videoUrl: string,
  samplePoint: SamplePoint
): Promise<{
  width: number;
  height: number;
  timestampSec: number;
  durationSec: number;
  imageData: ImageData;
}> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    if (!videoUrl.startsWith('blob:') && !videoUrl.startsWith('data:')) {
      video.crossOrigin = 'anonymous';
    }

    let settled = false;
    const cleanup = () => {
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch {}
    };

    const failTimer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error('Timeout membaca frame video untuk pemindaian watermark.'));
      }
    }, 10000);

    const drawFrame = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(failTimer);
      try {
        const vw = video.videoWidth || 360;
        const vh = video.videoHeight || 640;
        const targetW = 360;
        const targetH = Math.max(120, Math.round((vh / vw) * targetW));
        const off = document.createElement('canvas');
        off.width = targetW;
        off.height = targetH;
        const ctx = off.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          cleanup();
          reject(new Error('Canvas 2D context tidak tersedia.'));
          return;
        }
        ctx.drawImage(video, 0, 0, targetW, targetH);
        const imageData = ctx.getImageData(0, 0, targetW, targetH);
        const dur = Number.isFinite(video.duration) ? video.duration : 0;
        const ts = video.currentTime || 0;
        cleanup();
        resolve({
          width: targetW,
          height: targetH,
          timestampSec: ts,
          durationSec: dur,
          imageData,
        });
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    video.onloadedmetadata = () => {
      const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 2;
      let targetTime = 0.25;
      if (samplePoint === 'start') targetTime = Math.min(0.3, dur * 0.12);
      else if (samplePoint === 'q1') targetTime = dur * 0.25;
      else if (samplePoint === 'mid') targetTime = dur * 0.5;
      else if (samplePoint === 'q3') targetTime = dur * 0.75;
      targetTime = Math.max(0.05, Math.min(dur - 0.05, targetTime));

      if (Math.abs(video.currentTime - targetTime) < 0.02) {
        if (video.readyState >= 2) drawFrame();
        else video.oncanplay = () => drawFrame();
      } else {
        video.onseeked = () => drawFrame();
        video.currentTime = targetTime;
      }
    };

    video.onerror = () => {
      if (!settled) {
        settled = true;
        window.clearTimeout(failTimer);
        cleanup();
        reject(new Error('Gagal mendekode stream frame video.'));
      }
    };

    video.src = videoUrl;
  });
}

/**
 * Computes pixel-level High-Pass Laplacian residual + Chroma (Cb/Cr) residual
 * attenuated on strong Sobel object edges so spread-spectrum AI watermark regions
 * stand out cleanly from natural scene boundaries.
 */
function analyzeFrameHighFreqNoise(
  imageData: ImageData,
  timestampSec: number,
  durationSec: number
): FrameAnalysisResult {
  const { width, height, data } = imageData;
  const totalPixels = width * height;
  const luma = new Float32Array(totalPixels);
  const cb = new Float32Array(totalPixels);
  const cr = new Float32Array(totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    luma[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    cb[i] = -0.1687 * r - 0.3313 * g + 0.5 * b;
    cr[i] = 0.5 * r - 0.4187 * g - 0.0813 * b;
  }

  const residualMap = new Float32Array(totalPixels);
  const chromaMap = new Float32Array(totalPixels);

  const cellSums = new Float64Array(GRID_ROWS * GRID_COLS);
  const cellCounts = new Uint32Array(GRID_ROWS * GRID_COLS);

  let sumResidual = 0;
  let sumChroma = 0;
  let highFreqPixelCount = 0;
  let interiorCount = 0;

  for (let y = 1; y < height - 1; y++) {
    const rowIdx = Math.min(GRID_ROWS - 1, Math.floor((y / height) * GRID_ROWS));
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x;
      const c = luma[p];
      const n = luma[p - width];
      const s = luma[p + width];
      const w = luma[p - 1];
      const e = luma[p + 1];
      const nw = luma[p - width - 1];
      const ne = luma[p - width + 1];
      const sw = luma[p + width - 1];
      const se = luma[p + width + 1];

      // 8-neighbor Laplacian isolates pixel-level spread-spectrum high-frequency jitter
      const laplacian = Math.abs(8 * c - (n + s + w + e + nw + ne + sw + se)) / 8;

      // Chroma high-pass residual (AI watermarks frequently modulate Cb/Cr imperceptibly)
      const cbLap = Math.abs(4 * cb[p] - (cb[p - 1] + cb[p + 1] + cb[p - width] + cb[p + width])) / 4;
      const crLap = Math.abs(4 * cr[p] - (cr[p - 1] + cr[p + 1] + cr[p - width] + cr[p + width])) / 4;
      const chromaRes = (cbLap + crLap) * 0.5;

      // Sobel gradient (luma + chroma) to attenuate legitimate object silhouettes & colorful sharp graphic overlays
      const gx = -nw + ne - 2 * w + 2 * e - sw + se;
      const gy = -nw - 2 * n - ne + sw + 2 * s + se;
      const cbx = Math.abs(cb[p + 1] - cb[p - 1]) + Math.abs(cb[p + width] - cb[p - width]);
      const crx = Math.abs(cr[p + 1] - cr[p - 1]) + Math.abs(cr[p + width] - cr[p - width]);
      const edgeMag = Math.max(Math.sqrt(gx * gx + gy * gy) / 8, (cbx + crx) * 0.42);
      const edgeAttenuation = 1 / (1 + Math.pow(edgeMag / 13, 1.8));

      const rawCombined = (laplacian * 0.65 + chromaRes * 1.15) * edgeAttenuation;
      const normalized = Math.min(1, rawCombined / 9.5);

      residualMap[p] = normalized;
      chromaMap[p] = Math.min(1, (chromaRes * edgeAttenuation) / 6.0);

      sumResidual += normalized;
      sumChroma += chromaMap[p];
      interiorCount++;
      if (normalized >= 0.24) {
        highFreqPixelCount++;
      }

      const colIdx = Math.min(GRID_COLS - 1, Math.floor((x / width) * GRID_COLS));
      const cellId = rowIdx * GRID_COLS + colIdx;
      cellSums[cellId] += normalized;
      cellCounts[cellId]++;
    }
  }

  const cells: CellMetric[] = [];
  let peakRegionEnergy = 0;
  let flaggedCellsCount = 0;

  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const cellId = r * GRID_COLS + c;
      const avg = cellCounts[cellId] > 0 ? cellSums[cellId] / cellCounts[cellId] : 0;
      const energy = Math.min(100, Math.round(avg * 165));
      const flagged = energy >= CELL_FLAG_THRESHOLD;
      if (flagged) flaggedCellsCount++;
      if (energy > peakRegionEnergy) peakRegionEnergy = energy;
      cells.push({ row: r, col: c, energy, flagged });
    }
  }

  const hotRegions = [...cells]
    .sort((a, b) => b.energy - a.energy)
    .slice(0, 3)
    .filter((c) => c.energy >= 20)
    .map((c) => `R${c.row + 1}·C${c.col + 1} (${c.energy}%)`);

  const hfNoiseDensityPct =
    interiorCount > 0 ? Number(((highFreqPixelCount / interiorCount) * 100).toFixed(1)) : 0;

  return {
    width,
    height,
    timestampSec,
    durationSec,
    hfNoiseDensityPct,
    flaggedCellsCount,
    totalCells: GRID_ROWS * GRID_COLS,
    peakRegionEnergy,
    meanResidual: interiorCount > 0 ? Number(((sumResidual / interiorCount) * 100).toFixed(1)) : 0,
    chromaResidualAvg: interiorCount > 0 ? Number(((sumChroma / interiorCount) * 100).toFixed(1)) : 0,
    hotRegions,
    cells,
    originalPixels: data,
    residualMap,
    chromaMap,
  };
}

function renderVisualizationToCanvas(
  canvas: HTMLCanvasElement | null,
  analysis: FrameAnalysisResult | null,
  mode: ViewMode
) {
  if (!canvas || !analysis) return;
  const { width, height, originalPixels, residualMap, chromaMap, cells } = analysis;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const out = ctx.createImageData(width, height);
  const dst = out.data;

  for (let i = 0; i < width * height; i++) {
    const p = i * 4;
    const origR = originalPixels[p];
    const origG = originalPixels[p + 1];
    const origB = originalPixels[p + 2];
    const res = residualMap[i];
    const chr = chromaMap[i];

    if (mode === 'residual') {
      // Amplified 8x HF Laplacian + Chroma map on deep obsidian backdrop
      const boosted = Math.min(1, res * 2.1);
      const cBoost = Math.min(1, chr * 2.2);
      dst[p] = Math.round(14 + boosted * 241);
      dst[p + 1] = Math.round(18 + (1 - Math.abs(boosted - 0.5) * 1.4) * boosted * 150 + cBoost * 45);
      dst[p + 2] = Math.round(32 + cBoost * 220);
      dst[p + 3] = 255;
    } else if (mode === 'heatmap') {
      // Dim background slightly and inject thermal watermark noise heatmap
      const dim = 0.68;
      const intensity = Math.max(0, (res - 0.14) / 0.65);
      const clamped = Math.min(1, intensity);
      let heatR = 0;
      let heatG = 0;
      let heatB = 0;
      if (clamped > 0.65) {
        heatR = 255;
        heatG = Math.round(60 + (1 - clamped) * 260);
        heatB = 130;
      } else if (clamped > 0.3) {
        heatR = 245;
        heatG = 165;
        heatB = 25;
      } else if (clamped > 0.04) {
        heatR = 20;
        heatG = 215;
        heatB = 200;
      }
      const alpha = clamped > 0.04 ? Math.min(0.84, 0.22 + clamped * 0.7) : 0;
      dst[p] = Math.round(origR * dim * (1 - alpha) + heatR * alpha);
      dst[p + 1] = Math.round(origG * dim * (1 - alpha) + heatG * alpha);
      dst[p + 2] = Math.round(origB * dim * (1 - alpha) + heatB * alpha);
      dst[p + 3] = 255;
    } else {
      // Grid mode: clear frame with subtle desaturation
      dst[p] = Math.round(origR * 0.85);
      dst[p + 1] = Math.round(origG * 0.85);
      dst[p + 2] = Math.round(origB * 0.85);
      dst[p + 3] = 255;
    }
  }

  ctx.putImageData(out, 0, 0);

  // Draw regional overlay boxes
  const cellW = width / GRID_COLS;
  const cellH = height / GRID_ROWS;

  if (mode === 'grid' || mode === 'heatmap') {
    for (const cell of cells) {
      const x = cell.col * cellW;
      const y = cell.row * cellH;
      if (mode === 'grid') {
        ctx.fillStyle = cell.flagged
          ? 'rgba(244, 63, 94, 0.30)'
          : cell.energy >= 22
            ? 'rgba(245, 158, 11, 0.16)'
            : 'rgba(16, 185, 129, 0.05)';
        ctx.fillRect(x, y, cellW, cellH);

        ctx.strokeStyle = cell.flagged
          ? 'rgba(251, 113, 133, 0.85)'
          : 'rgba(148, 163, 184, 0.22)';
        ctx.lineWidth = cell.flagged ? 1.5 : 0.7;
        ctx.strokeRect(x + 0.5, y + 0.5, cellW - 1, cellH - 1);

        if (cell.energy >= 20) {
          ctx.font = 'bold 9px monospace';
          ctx.fillStyle = cell.flagged ? '#fda4af' : '#fde68a';
          ctx.fillText(`${cell.energy}`, x + 3, y + 11);
        }
      } else if (cell.flagged) {
        ctx.strokeStyle = 'rgba(244, 63, 94, 0.82)';
        ctx.lineWidth = 1.4;
        ctx.strokeRect(x + 1, y + 1, cellW - 2, cellH - 2);
      }
    }
  }
}

export const WatermarkNoiseVisualizer: React.FC<WatermarkNoiseVisualizerProps> = ({
  previewUrlBefore,
  previewUrlAfter,
  beforeFileName,
  afterFileName,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('heatmap');
  const [samplePoint, setSamplePoint] = useState<SamplePoint>('mid');
  const [scanTrigger, setScanTrigger] = useState(0);

  const [beforeAnalysis, setBeforeAnalysis] = useState<FrameAnalysisResult | null>(null);
  const [afterAnalysis, setAfterAnalysis] = useState<FrameAnalysisResult | null>(null);
  const [loadingBefore, setLoadingBefore] = useState(false);
  const [loadingAfter, setLoadingAfter] = useState(false);
  const [errorBefore, setErrorBefore] = useState<string | null>(null);
  const [errorAfter, setErrorAfter] = useState<string | null>(null);

  const beforeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const afterCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const runScan = useCallback(async (url: string, target: 'before' | 'after', point: SamplePoint) => {
    if (target === 'before') {
      setLoadingBefore(true);
      setErrorBefore(null);
    } else {
      setLoadingAfter(true);
      setErrorAfter(null);
    }

    try {
      const frame = await extractVideoFramePixels(url, point);
      const analyzed = analyzeFrameHighFreqNoise(frame.imageData, frame.timestampSec, frame.durationSec);
      if (target === 'before') {
        setBeforeAnalysis(analyzed);
      } else {
        setAfterAnalysis(analyzed);
      }
    } catch (err: any) {
      const msg = err?.message || 'Gagal menganalisis frame video.';
      if (target === 'before') {
        setErrorBefore(msg);
      } else {
        setErrorAfter(msg);
      }
    } finally {
      if (target === 'before') {
        setLoadingBefore(false);
      } else {
        setLoadingAfter(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!previewUrlBefore) {
      setBeforeAnalysis(null);
      return;
    }
    void runScan(previewUrlBefore, 'before', samplePoint);
  }, [previewUrlBefore, samplePoint, scanTrigger, runScan]);

  useEffect(() => {
    if (!previewUrlAfter) {
      setAfterAnalysis(null);
      return;
    }
    void runScan(previewUrlAfter, 'after', samplePoint);
  }, [previewUrlAfter, samplePoint, scanTrigger, runScan]);

  useEffect(() => {
    renderVisualizationToCanvas(beforeCanvasRef.current, beforeAnalysis, viewMode);
  }, [beforeAnalysis, viewMode]);

  useEffect(() => {
    renderVisualizationToCanvas(afterCanvasRef.current, afterAnalysis, viewMode);
  }, [afterAnalysis, viewMode]);

  const densityReductionPct =
    beforeAnalysis && afterAnalysis && beforeAnalysis.hfNoiseDensityPct > 0
      ? Number(
          (
            ((beforeAnalysis.hfNoiseDensityPct - afterAnalysis.hfNoiseDensityPct) /
              beforeAnalysis.hfNoiseDensityPct) *
            100
          ).toFixed(1)
        )
      : null;

  const flaggedCellsDelta =
    beforeAnalysis && afterAnalysis
      ? beforeAnalysis.flaggedCellsCount - afterAnalysis.flaggedCellsCount
      : null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/30 text-fuchsia-400 flex items-center justify-center">
            <ScanLine className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2 flex-wrap">
              <span>Visualisasi Lapisan Noise Watermark High-Frequency (SynthID Spatial Map)</span>
              {beforeAnalysis && afterAnalysis && (
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                    afterAnalysis.hfNoiseDensityPct <= beforeAnalysis.hfNoiseDensityPct
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                      : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                  }`}
                >
                  {densityReductionPct !== null && densityReductionPct >= 0
                    ? `REDUKSI HF ${densityReductionPct}%`
                    : `DELTA ${(afterAnalysis.hfNoiseDensityPct - beforeAnalysis.hfNoiseDensityPct).toFixed(1)}%`}
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-400">
              Menyorot region frame dengan pola noise high-frequency Laplacian &amp; residual chroma (Cb/Cr) khas SynthID / AI watermark sebelum &amp; sesudah pembersihan.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setScanTrigger((n) => n + 1)}
          disabled={loadingBefore || loadingAfter || !previewUrlBefore}
          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-bold text-slate-200 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingBefore || loadingAfter ? 'animate-spin' : ''}`} />
          <span>Pindai Ulang Frame</span>
        </button>
      </div>

      {/* Controls Bar: Mode & Sample Timestamp */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/80 border border-slate-800 rounded-xl p-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mr-1">Mode Peta:</span>
          {(
            [
              { id: 'heatmap', label: 'Heatmap Overlay', icon: Sparkles },
              { id: 'residual', label: 'High-Pass Residual (8x)', icon: Layers },
              { id: 'grid', label: 'Grid Regional 8×12', icon: Grid },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = viewMode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setViewMode(item.id)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 border transition cursor-pointer ${
                  active
                    ? 'bg-fuchsia-500/20 border-fuchsia-500/50 text-fuchsia-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mr-1">Posisi Frame:</span>
          {(
            [
              { id: 'start', label: '0.3s (Awal)' },
              { id: 'q1', label: '25%' },
              { id: 'mid', label: '50% (Tengah)' },
              { id: 'q3', label: '75%' },
            ] as const
          ).map((pt) => (
            <button
              key={pt.id}
              type="button"
              onClick={() => setSamplePoint(pt.id)}
              className={`px-2 py-1 rounded-lg text-[11px] font-mono font-bold border transition cursor-pointer ${
                samplePoint === pt.id
                  ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {pt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-slate-400 px-1">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block"></span>
            <span>Organik / Low Residual</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-cyan-400 inline-block"></span>
            <span>Tekstur Mikro Kamera</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block"></span>
            <span>Pola HF Moderat</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block"></span>
            <span>Zona Terflagging AI Watermark (Energy ≥ {CELL_FLAG_THRESHOLD}%)</span>
          </span>
        </div>
        <span>Analisis piksel Sobel-attenuated (melindungi tepi objek)</span>
      </div>

      {/* Side-by-Side Before & After Canvases */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* BEFORE */}
        <div className="bg-slate-950 border border-rose-900/40 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-[11px] font-extrabold tracking-wider text-rose-400 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" />
              <span>SEBELUM PEMBERSIHAN {beforeFileName ? `(${beforeFileName})` : ''}</span>
            </span>
            {beforeAnalysis && (
              <span className="text-[10px] font-mono text-slate-400">
                t = {beforeAnalysis.timestampSec.toFixed(2)}s
              </span>
            )}
          </div>

          <div className="relative bg-black rounded-lg overflow-hidden border border-slate-800 min-h-[210px] flex items-center justify-center">
            {loadingBefore && (
              <div className="text-xs font-mono text-cyan-400 flex items-center gap-2 py-12">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Mengekstrak spektrum high-frequency frame...</span>
              </div>
            )}
            {!loadingBefore && errorBefore && (
              <div className="text-xs text-rose-400 p-4 text-center">{errorBefore}</div>
            )}
            {!loadingBefore && !errorBefore && beforeAnalysis && (
              <canvas
                ref={beforeCanvasRef}
                className="max-h-72 w-auto max-w-full object-contain mx-auto block"
              />
            )}
          </div>

          {beforeAnalysis && (
            <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-2">
                <div className="text-[10px] text-slate-500">Kepadatan HF</div>
                <div className={beforeAnalysis.hfNoiseDensityPct > 18 ? 'text-rose-400 font-bold' : 'text-amber-300 font-bold'}>
                  {beforeAnalysis.hfNoiseDensityPct}%
                </div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-2">
                <div className="text-[10px] text-slate-500">Sel Terflagging</div>
                <div className={beforeAnalysis.flaggedCellsCount > 8 ? 'text-rose-400 font-bold' : 'text-amber-300 font-bold'}>
                  {beforeAnalysis.flaggedCellsCount} / {beforeAnalysis.totalCells}
                </div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-2">
                <div className="text-[10px] text-slate-500">Peak Energy</div>
                <div className="text-rose-300 font-bold">{beforeAnalysis.peakRegionEnergy}%</div>
              </div>
            </div>
          )}
          {beforeAnalysis && beforeAnalysis.hotRegions.length > 0 && (
            <div className="text-[10px] font-mono text-rose-300 bg-rose-950/25 border border-rose-900/40 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>Sektor Noise Tertinggi: {beforeAnalysis.hotRegions.join(' • ')}</span>
            </div>
          )}
        </div>

        {/* AFTER */}
        <div className="bg-slate-950 border border-emerald-900/40 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-[11px] font-extrabold tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" />
              <span>SESUDAH SANITASI {afterFileName ? `(${afterFileName})` : ''}</span>
            </span>
            {afterAnalysis && (
              <span className="text-[10px] font-mono text-slate-400">
                t = {afterAnalysis.timestampSec.toFixed(2)}s
              </span>
            )}
          </div>

          <div className="relative bg-black rounded-lg overflow-hidden border border-slate-800 min-h-[210px] flex items-center justify-center">
            {!previewUrlAfter && (
              <div className="text-xs text-slate-500 text-center px-6 py-12">
                Jalankan proses Cloud FFmpeg terlebih dahulu untuk melihat perbandingan visual heatmap watermark sesudah sanitasi.
              </div>
            )}
            {previewUrlAfter && loadingAfter && (
              <div className="text-xs font-mono text-emerald-400 flex items-center gap-2 py-12">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Memindai ulang residual frame hasil sanitasi...</span>
              </div>
            )}
            {previewUrlAfter && !loadingAfter && errorAfter && (
              <div className="text-xs text-rose-400 p-4 text-center">{errorAfter}</div>
            )}
            {previewUrlAfter && !loadingAfter && !errorAfter && afterAnalysis && (
              <canvas
                ref={afterCanvasRef}
                className="max-h-72 w-auto max-w-full object-contain mx-auto block"
              />
            )}
          </div>

          {afterAnalysis && (
            <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-2">
                <div className="text-[10px] text-slate-500">Kepadatan HF</div>
                <div className={afterAnalysis.flaggedCellsCount <= (beforeAnalysis?.flaggedCellsCount ?? 999) ? 'text-emerald-400 font-bold' : 'text-amber-300 font-bold'}>
                  {afterAnalysis.hfNoiseDensityPct}%
                </div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-2">
                <div className="text-[10px] text-slate-500">Sel Terflagging</div>
                <div className={afterAnalysis.flaggedCellsCount <= 8 ? 'text-emerald-400 font-bold' : 'text-amber-300 font-bold'}>
                  {afterAnalysis.flaggedCellsCount} / {afterAnalysis.totalCells}
                </div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-2">
                <div className="text-[10px] text-slate-500">Peak Energy</div>
                <div className="text-emerald-300 font-bold">{afterAnalysis.peakRegionEnergy}%</div>
              </div>
            </div>
          )}

          {beforeAnalysis && afterAnalysis && (
            <div
              className={`text-[10px] font-mono rounded-lg px-2.5 py-1.5 border flex items-center justify-between gap-2 ${
                (flaggedCellsDelta ?? 0) >= 0
                  ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                  : 'bg-amber-950/30 border-amber-500/30 text-amber-300'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Perubahan Sel Terflagging: {beforeAnalysis.flaggedCellsCount} → {afterAnalysis.flaggedCellsCount} sel
                </span>
              </span>
              <span className="font-bold">
                Peak {beforeAnalysis.peakRegionEnergy}% → {afterAnalysis.peakRegionEnergy}%
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
