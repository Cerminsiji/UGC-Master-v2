import React, { useState } from 'react';
import {
  Calculator,
  Coins,
  Copy,
  Check,
  Sparkles,
  ShieldCheck,
  FileCheck2,
  TrendingUp,
  Zap,
  Info
} from 'lucide-react';
import { RateCardConfig } from '../types';
import { copyToClipboard } from '../utils/helpers';

interface RateCardCalculatorProps {
  projectTitle: string;
  productName?: string;
  categoryName: string;
}

export const RateCardCalculator: React.FC<RateCardCalculatorProps> = ({
  projectTitle,
  productName = 'Produk Brand',
  categoryName,
}) => {
  const [config, setConfig] = useState<RateCardConfig>({
    creatorTier: 'Nano (10k-50k)',
    basePrice: 350000,
    videoCount: 1,
    hookCount: 2, // 2 extra hooks for A/B testing
    hasRawFootage: false,
    usageRightsDays: 30,
    hasSparkCode: true,
    fastDelivery: false,
    notes: 'Termasuk 1x revisi minor. Durasi video 15-30 detik format 9:16.',
  });

  const [copied, setCopied] = useState(false);

  // Quick preset tiers
  const handleTierChange = (tier: RateCardConfig['creatorTier']) => {
    let base = 350000;
    if (tier === 'Pemula (1k-10k)') base = 250000;
    if (tier === 'Nano (10k-50k)') base = 400000;
    if (tier === 'Micro (50k-250k)') base = 750000;
    if (tier === 'Mid-Tier (250k+)') base = 1500000;

    setConfig((prev) => ({
      ...prev,
      creatorTier: tier,
      basePrice: base,
    }));
  };

  // Calculations
  const hookCostPerItem = Math.round(config.basePrice * 0.25);
  const totalHookCost = config.hookCount * hookCostPerItem;

  const baseVideosTotal = config.basePrice * config.videoCount;

  // Usage rights multiplier
  let usageRightsMultiplier = 0;
  if (config.usageRightsDays === 30) usageRightsMultiplier = 0.3;
  if (config.usageRightsDays === 60) usageRightsMultiplier = 0.5;
  if (config.usageRightsDays === 90) usageRightsMultiplier = 0.75;
  if (config.usageRightsDays === 180) usageRightsMultiplier = 1.0;
  if (config.usageRightsDays === 365) usageRightsMultiplier = 1.3;

  const usageRightsFee = Math.round(baseVideosTotal * usageRightsMultiplier);
  const rawFootageFee = config.hasRawFootage ? 200000 * config.videoCount : 0;
  const sparkCodeFee = config.hasSparkCode ? 100000 * config.videoCount : 0;
  const fastDeliveryFee = config.fastDelivery ? 150000 : 0;

  const grandTotal =
    baseVideosTotal +
    totalHookCost +
    usageRightsFee +
    rawFootageFee +
    sparkCodeFee +
    fastDeliveryFee;

  const formatIDR = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const handleCopyProposal = async () => {
    let text = `📄 *PENAWARAN RATE CARD UGC VIDEO CREATOR*\n`;
    text += `Project: *${projectTitle}* (${categoryName})\n`;
    text += `Produk: *${productName}*\n`;
    text += `--------------------------------------------------\n`;
    text += `• Paket Video: ${config.videoCount}x Video UGC 9:16 (${formatIDR(baseVideosTotal)})\n`;
    if (config.hookCount > 0) {
      text += `• Variasi Hook A/B Test: +${config.hookCount} Hook Alternatif (${formatIDR(totalHookCost)})\n`;
    }
    if (config.usageRightsDays > 0) {
      text += `• Lisensi Iklan (Paid Ads): ${config.usageRightsDays} Hari (+${formatIDR(usageRightsFee)})\n`;
    } else {
      text += `• Lisensi Iklan: Hanya Posting Organik (0 Hari)\n`;
    }
    if (config.hasSparkCode) {
      text += `• Otorisasi Spark Ads Code: Termasuk (${formatIDR(sparkCodeFee)})\n`;
    }
    if (config.hasRawFootage) {
      text += `• Hak Raw Footage (B-Roll mentah): Termasuk (${formatIDR(rawFootageFee)})\n`;
    }
    if (config.fastDelivery) {
      text += `• Fast Delivery Prioritas (24-48 jam): Termasuk (${formatIDR(fastDeliveryFee)})\n`;
    }
    text += `--------------------------------------------------\n`;
    text += `💰 *TOTAL INVESTASI: ${formatIDR(grandTotal)}*\n`;
    text += `Catatan: ${config.notes || '-'}\n\n`;
    text += `Siap produksi segera setelah produk fisik diterima. Terima kasih! 🙏`;

    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="bg-[#0f1422] border border-[#1e293f] rounded-2xl p-5 shadow-2xl space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-[#1c273e]">
        <div>
          <div className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-bold text-white tracking-tight">
              Kalkulator Rate Card UGC & Proposal Iklan
            </h3>
            <span className="text-[10px] bg-amber-950 text-amber-300 border border-amber-800/40 px-2 py-0.5 rounded-full font-bold">
              Monetisasi Kreator
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Hitung harga jasa pembuatan video UGC profesional untuk brand lengkap dengan hak iklan (Ads Usage Rights).
          </p>
        </div>

        <button
          onClick={handleCopyProposal}
          className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg transition-all active:scale-95"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4" />
              <span>Format Proposal Tersalin!</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              <span>Salin Penawaran ke WhatsApp</span>
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Form Controls */}
        <div className="lg:col-span-7 space-y-5">
          
          {/* Tier Selection */}
          <div>
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2">
              Level / Followers Kreator
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['Pemula (1k-10k)', 'Nano (10k-50k)', 'Micro (50k-250k)', 'Mid-Tier (250k+)'] as const).map(
                (tier) => (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => handleTierChange(tier)}
                    className={`p-2 rounded-xl text-xs font-bold transition-all border text-center ${
                      config.creatorTier === tier
                        ? 'bg-purple-950/80 border-purple-500 text-purple-200 shadow-md'
                        : 'bg-[#121927] border-[#1f2b42] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tier}
                  </button>
                )
              )}
            </div>
          </div>

          {/* Base Price & Video Count */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-[#121826] border border-[#1f2b42] space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Harga Dasar Per Video
              </label>
              <div className="flex items-center gap-1 text-slate-200">
                <span className="text-xs text-slate-400">Rp</span>
                <input
                  type="number"
                  step="50000"
                  value={config.basePrice}
                  onChange={(e) =>
                    setConfig({ ...config, basePrice: Math.max(50000, Number(e.target.value) || 0) })
                  }
                  className="w-full bg-[#0c101a] border border-[#222e47] rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-white outline-none"
                />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#121826] border border-[#1f2b42] space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Jumlah Video (Bundle)
              </label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 5].map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => setConfig({ ...config, videoCount: cnt })}
                    className={`flex-1 py-1 rounded-lg text-xs font-bold transition-all ${
                      config.videoCount === cnt
                        ? 'bg-purple-600 text-white'
                        : 'bg-[#1a2336] text-slate-300 hover:bg-[#202c46]'
                    }`}
                  >
                    {cnt}x
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Hook Variations Add-On */}
          <div className="p-3.5 rounded-xl bg-[#121826] border border-[#1f2b42] space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-white block">
                  Variasi Hook Tambahan (A/B Testing)
                </span>
                <span className="text-[11px] text-slate-400">
                  Syuting 1x badan video, tapi buat 2-3 opening berbeda untuk split testing iklan.
                </span>
              </div>
              <span className="text-xs font-mono font-bold text-purple-300">
                +{formatIDR(totalHookCost)}
              </span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              {[0, 1, 2, 3].map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setConfig({ ...config, hookCount: h })}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    config.hookCount === h
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'bg-[#182133] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {h === 0 ? 'Tanpa Ekstra Hook' : `+${h} Hook`}
                </button>
              ))}
            </div>
          </div>

          {/* Usage Rights (Paid Ads License) */}
          <div className="p-3.5 rounded-xl bg-[#121826] border border-[#1f2b42] space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-white block">
                  Hak Penggunaan Iklan (Paid Ads Usage Rights)
                </span>
                <span className="text-[11px] text-slate-400">
                  Biaya lisensi jika brand ingin menjalankan video Anda sebagai iklan berbayar (TikTok Ads/Meta Ads).
                </span>
              </div>
              <span className="text-xs font-mono font-bold text-emerald-400">
                +{formatIDR(usageRightsFee)}
              </span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 pt-1">
              {[
                { days: 0, label: 'Organik (0h)' },
                { days: 30, label: '30 Hari (+30%)' },
                { days: 60, label: '60 Hari (+50%)' },
                { days: 90, label: '90 Hari (+75%)' },
                { days: 365, label: '1 Tahun (+130%)' },
              ].map((item) => (
                <button
                  key={item.days}
                  type="button"
                  onClick={() => setConfig({ ...config, usageRightsDays: item.days as any })}
                  className={`p-1.5 rounded-lg text-[11px] font-bold text-center transition-all ${
                    config.usageRightsDays === item.days
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-600/60 shadow-sm'
                      : 'bg-[#182133] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Additional Checkboxes */}
          <div className="space-y-2">
            <label
              onClick={() => setConfig({ ...config, hasSparkCode: !config.hasSparkCode })}
              className="flex items-center justify-between p-3 rounded-xl bg-[#121826] border border-[#1f2b42] cursor-pointer hover:bg-[#151d2d] transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={config.hasSparkCode}
                  onChange={() => {}}
                  className="rounded border-slate-700 text-purple-600 focus:ring-0"
                />
                <div>
                  <span className="text-xs font-bold text-white block">
                    Izin Kode Spark Ads / Partnership Authorization
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Memberikan kode TikTok Spark Ads agar brand bisa boost postingan dari akun kreator.
                  </span>
                </div>
              </div>
              <span className="text-xs font-mono font-bold text-slate-300">
                +{formatIDR(config.hasSparkCode ? 100000 * config.videoCount : 0)}
              </span>
            </label>

            <label
              onClick={() => setConfig({ ...config, hasRawFootage: !config.hasRawFootage })}
              className="flex items-center justify-between p-3 rounded-xl bg-[#121826] border border-[#1f2b42] cursor-pointer hover:bg-[#151d2d] transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={config.hasRawFootage}
                  onChange={() => {}}
                  className="rounded border-slate-700 text-purple-600 focus:ring-0"
                />
                <div>
                  <span className="text-xs font-bold text-white block">
                    Penyerahan Raw Footage B-Roll (Video Mentah)
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Kirim semua file video asli tanpa edit agar tim internal brand bisa re-edit sendiri.
                  </span>
                </div>
              </div>
              <span className="text-xs font-mono font-bold text-slate-300">
                +{formatIDR(config.hasRawFootage ? 200000 * config.videoCount : 0)}
              </span>
            </label>

            <label
              onClick={() => setConfig({ ...config, fastDelivery: !config.fastDelivery })}
              className="flex items-center justify-between p-3 rounded-xl bg-[#121826] border border-[#1f2b42] cursor-pointer hover:bg-[#151d2d] transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={config.fastDelivery}
                  onChange={() => {}}
                  className="rounded border-slate-700 text-purple-600 focus:ring-0"
                />
                <div>
                  <span className="text-xs font-bold text-white block">
                    Fast Delivery Prioritas (24 - 48 Jam)
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Pengerjaan kilat diprioritaskan di atas antrean normal.
                  </span>
                </div>
              </div>
              <span className="text-xs font-mono font-bold text-slate-300">
                +{formatIDR(config.fastDelivery ? 150000 : 0)}
              </span>
            </label>
          </div>

        </div>

        {/* Right Column: Live Invoice Breakdown & Proposal Card */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-5 rounded-2xl bg-gradient-to-b from-[#141b2b] to-[#0c101a] border border-[#222e47] shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#1c273e]">
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Ringkasan Biaya Jasa
              </span>
              <span className="text-[10px] font-bold text-purple-400 bg-purple-950/80 px-2 py-0.5 rounded border border-purple-800/40">
                {config.creatorTier}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-300">
                <span>{config.videoCount}x Video Utama ({formatIDR(config.basePrice)}/video):</span>
                <span className="font-mono font-semibold">{formatIDR(baseVideosTotal)}</span>
              </div>

              {config.hookCount > 0 && (
                <div className="flex items-center justify-between text-slate-300">
                  <span>+{config.hookCount} Variasi Hook Alternatif:</span>
                  <span className="font-mono font-semibold text-purple-300">+{formatIDR(totalHookCost)}</span>
                </div>
              )}

              {config.usageRightsDays > 0 && (
                <div className="flex items-center justify-between text-slate-300">
                  <span>Hak Iklan Paid Ads ({config.usageRightsDays} Hari):</span>
                  <span className="font-mono font-semibold text-emerald-400">+{formatIDR(usageRightsFee)}</span>
                </div>
              )}

              {config.hasSparkCode && (
                <div className="flex items-center justify-between text-slate-300">
                  <span>Otorisasi Spark Ads:</span>
                  <span className="font-mono font-semibold">+{formatIDR(sparkCodeFee)}</span>
                </div>
              )}

              {config.hasRawFootage && (
                <div className="flex items-center justify-between text-slate-300">
                  <span>Akses Raw Footage Mentah:</span>
                  <span className="font-mono font-semibold">+{formatIDR(rawFootageFee)}</span>
                </div>
              )}

              {config.fastDelivery && (
                <div className="flex items-center justify-between text-slate-300">
                  <span>Pengerjaan Kilat (24-48 Jam):</span>
                  <span className="font-mono font-semibold">+{formatIDR(fastDeliveryFee)}</span>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-[#1c273e]">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400 block font-medium">Total Nilai Penawaran:</span>
                  <span className="text-xl sm:text-2xl font-black text-emerald-400 font-mono tracking-tight">
                    {formatIDR(grandTotal)}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={handleCopyProposal}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs py-2.5 px-4 rounded-xl shadow-lg transition-all active:scale-95"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Proposal Tersalin! Siap Kirim</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Salin Naskah Penawaran</span>
                </>
              )}
            </button>
          </div>

          <div className="p-3.5 rounded-xl bg-[#101625] border border-[#1c273e] text-xs text-slate-400 space-y-1">
            <div className="flex items-center gap-1.5 text-amber-300 font-bold text-[11px]">
              <Info className="w-3.5 h-3.5" />
              <span>Tips Negosiasi dengan Brand</span>
            </div>
            <p className="leading-relaxed">
              Brand lebih suka menyewa <strong>2-3 variasi Hook tambahan</strong> dibanding membeli video baru dengan harga penuh, karena mereka bisa menguji hook mana yang menghasilkan ROAS tertinggi di TikTok Ads!
            </p>
          </div>
        </div>

      </div>

    </div>
  );
};
