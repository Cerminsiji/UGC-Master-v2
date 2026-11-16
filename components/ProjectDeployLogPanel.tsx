'use client';

import React, { useState, useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Cpu,
  Database,
  Eraser,
  ExternalLink,
  Ghost,
  HardDrive,
  History,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  DuplicateProjectGroup,
  GhostDataItem,
  StorageAuditReport,
  StorageDeployAction,
  StorageDeployLogEntry,
  StoryboardProject,
} from '../types';
import { formatBytes } from '../utils/storyboardStorage';

interface ProjectDeployLogPanelProps {
  projects: StoryboardProject[];
  currentProjectId: string;
  audit: StorageAuditReport | null;
  logs: StorageDeployLogEntry[];
  isAuditing: boolean;
  isCleaningGhosts: boolean;
  isDeduplicating: boolean;
  onRunAudit: () => Promise<void> | void;
  onCleanupGhosts: () => Promise<void> | void;
  onDeduplicateProjects: () => Promise<void> | void;
  onDeleteProjectById: (projectId: string) => void;
  onSelectProjectById: (projectId: string) => void;
  onClearLogs: () => void;
}

const ACTION_LABELS: Record<StorageDeployAction, string> = {
  save: 'Simpan Storage',
  hydrate: 'Hidrasi Awal',
  create: 'Buat Naskah',
  duplicate: 'Duplikat Naskah',
  delete: 'Hapus Naskah',
  clear_all: 'Clear Semua',
  clear_others: 'Sisakan Aktif',
  cleanup_ghosts: 'Bersihkan Ghost',
  deduplicate: 'Deduplikasi',
  sync_repair: 'Perbaikan Sync',
};

const GHOST_TYPE_LABELS: Record<GhostDataItem['type'], string> = {
  legacy_key: 'Key Lama (v3)',
  idb_orphan: 'Orphan IndexedDB',
  ls_orphan: 'Orphan LocalStorage',
  memory_orphan: 'Belum Tersinkron',
  dangling_active_pointer: 'Pointer Aktif Yatim',
  broken_payload: 'Payload Korup',
};

const DUPLICATE_REASON_LABELS: Record<DuplicateProjectGroup['reason'], string> = {
  duplicate_id: 'Konflik ID Ganda',
  identical_title_product: 'Judul & Produk Identik',
  copy_clone: 'Salinan Clone (Copy)',
};

function formatIsoTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export const ProjectDeployLogPanel: React.FC<ProjectDeployLogPanelProps> = ({
  projects,
  currentProjectId,
  audit,
  logs,
  isAuditing,
  isCleaningGhosts,
  isDeduplicating,
  onRunAudit,
  onCleanupGhosts,
  onDeduplicateProjects,
  onDeleteProjectById,
  onSelectProjectById,
  onClearLogs,
}) => {
  const [logFilter, setLogFilter] = useState<'all' | 'issues' | 'ghosts_dups'>('all');
  const [logQuery, setLogQuery] = useState('');

  const issueLogsCount = useMemo(
    () => logs.filter((l) => l.status === 'warning' || l.status === 'error').length,
    [logs]
  );

  const ghostDupLogsCount = useMemo(
    () => logs.filter((l) => l.ghostCount > 0 || l.duplicateCount > 0).length,
    [logs]
  );

  const filteredLogs = useMemo(() => {
    const q = logQuery.trim().toLowerCase();
    return logs.filter((entry) => {
      if (logFilter === 'issues' && entry.status === 'success') return false;
      if (logFilter === 'ghosts_dups' && entry.ghostCount === 0 && entry.duplicateCount === 0) {
        return false;
      }
      if (!q) return true;
      const actionLabel = ACTION_LABELS[entry.action]?.toLowerCase() || '';
      const detailsText = (entry.details || []).join(' ').toLowerCase();
      return (
        entry.message.toLowerCase().includes(q) ||
        actionLabel.includes(q) ||
        (entry.tier || '').toLowerCase().includes(q) ||
        detailsText.includes(q)
      );
    });
  }, [logs, logFilter, logQuery]);

  const totalGhosts = audit?.totalGhostCount || 0;
  const totalDuplicates = audit?.totalDuplicateCount || 0;
  const needsSyncRepair = Boolean(audit && (totalGhosts > 0 || !audit.isSynced));

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-6 bg-[#0b0f1a] custom-scrollbar">
      {/* Top Action & Overall Health Banner */}
      <div className="bg-[#101626] border border-[#1d273e] rounded-2xl p-4 md:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            {audit?.health === 'critical' ? (
              <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
            ) : audit?.health === 'warning' ? (
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            ) : (
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            )}
            <h3 className="text-sm md:text-base font-bold text-white tracking-tight">
              Audit Storage &amp; Riwayat Status Deploy Proyek
            </h3>
            <span
              className={`text-xs font-semibold ${
                audit?.health === 'critical'
                  ? 'text-rose-300'
                  : audit?.health === 'warning'
                  ? 'text-amber-300'
                  : 'text-emerald-300'
              }`}
            >
              {!audit
                ? 'Memindai storage...'
                : audit.health === 'critical'
                ? 'Terdeteksi Sisa Ghost / Konflik'
                : audit.health === 'warning'
                ? 'Perlu Pembersihan / Sinkronisasi'
                : 'Semua Layer Tersinkron Bersih'}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap text-xs text-slate-400 font-mono tabular-nums">
            <span>Ghost: {totalGhosts}</span>
            <span aria-hidden="true">·</span>
            <span>Duplikat: {totalDuplicates}</span>
            <span aria-hidden="true">·</span>
            <span>Total Log: {logs.length}</span>
            {audit?.auditedAt && (
              <>
                <span aria-hidden="true">·</span>
                <span>Audit terakhir: {formatIsoTime(audit.auditedAt)}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void onRunAudit()}
            disabled={isAuditing}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#161f34] hover:bg-[#1e2a45] text-slate-200 border border-[#263455] text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${isAuditing ? 'animate-spin' : ''}`} />
            <span>{isAuditing ? 'Memindai...' : 'Audit Ulang'}</span>
          </button>

          <button
            type="button"
            onClick={() => void onCleanupGhosts()}
            disabled={isCleaningGhosts || isAuditing || !needsSyncRepair}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-200 border border-amber-500/40 text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
            title="Hapus sisa key lama, bersihkan data orphan di IndexedDB/LocalStorage, dan sinkronkan ulang"
          >
            <Eraser className="w-3.5 h-3.5 text-amber-400" />
            <span>
              {isCleaningGhosts
                ? 'Membersihkan...'
                : `Bersihkan Ghost & Sinkronkan (${totalGhosts})`}
            </span>
          </button>

          <button
            type="button"
            onClick={() => void onDeduplicateProjects()}
            disabled={isDeduplicating || isAuditing || totalDuplicates === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-200 border border-rose-500/40 text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
            title="Hapus project ganda dan pertahankan naskah aktif / versi terbaru"
          >
            <Copy className="w-3.5 h-3.5 text-rose-400" />
            <span>
              {isDeduplicating
                ? 'Menghapus Duplikat...'
                : `Bersihkan Ganda (${totalDuplicates})`}
            </span>
          </button>
        </div>
      </div>

      {/* 3-Layer Storage Comparison Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Layer 1: Memory State */}
        <div className="bg-[#101626] border border-[#1d273e] rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <Cpu className="w-4 h-4 text-purple-400 shrink-0" />
              <span>Editor Memory (Aktif)</span>
            </div>
            <span className="text-xs font-mono tabular-nums text-emerald-400 font-semibold">
              Aktif
            </span>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-2xl font-extrabold font-mono tabular-nums text-white">
              {audit ? audit.memory.projectCount : projects.length}
            </span>
            <span className="text-xs font-mono tabular-nums text-slate-400">
              {audit ? formatBytes(audit.memory.bytesUsed) : '-'}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 font-mono truncate pt-1 border-t border-[#182136]">
            Pointer: {audit?.memory.activeProjectId || currentProjectId || '-'}
          </div>
        </div>

        {/* Layer 2: LocalStorage */}
        <div className="bg-[#101626] border border-[#1d273e] rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <HardDrive className="w-4 h-4 text-sky-400 shrink-0" />
              <span>Browser LocalStorage</span>
            </div>
            <span
              className={`text-xs font-mono tabular-nums font-semibold ${
                audit?.localStorage.error
                  ? 'text-rose-400'
                  : audit && audit.localStorage.projectCount !== audit.memory.projectCount
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              {audit?.localStorage.error
                ? 'Error'
                : audit && audit.localStorage.projectCount !== audit.memory.projectCount
                ? 'Selisih'
                : 'Sinkron'}
            </span>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-2xl font-extrabold font-mono tabular-nums text-white">
              {audit ? audit.localStorage.projectCount : '-'}
            </span>
            <span className="text-xs font-mono tabular-nums text-slate-400">
              {audit ? formatBytes(audit.localStorage.bytesUsed) : '-'}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 font-mono truncate pt-1 border-t border-[#182136]">
            {audit?.localStorage.error
              ? audit.localStorage.error
              : `Pointer: ${audit?.localStorage.activeProjectId || 'kosong'}`}
          </div>
        </div>

        {/* Layer 3: IndexedDB */}
        <div className="bg-[#101626] border border-[#1d273e] rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <Database className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>IndexedDB (Media &amp; Backup)</span>
            </div>
            <span
              className={`text-xs font-mono tabular-nums font-semibold ${
                !audit?.indexedDB.available || audit?.indexedDB.error
                  ? 'text-rose-400'
                  : audit && audit.indexedDB.projectCount !== audit.memory.projectCount
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              {!audit?.indexedDB.available
                ? 'Nonaktif'
                : audit?.indexedDB.error
                ? 'Error'
                : audit && audit.indexedDB.projectCount !== audit.memory.projectCount
                ? 'Selisih'
                : 'Sinkron'}
            </span>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-2xl font-extrabold font-mono tabular-nums text-white">
              {audit ? audit.indexedDB.projectCount : '-'}
            </span>
            <span className="text-xs font-mono tabular-nums text-slate-400">
              {audit ? formatBytes(audit.indexedDB.bytesUsed) : '-'}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 font-mono truncate pt-1 border-t border-[#182136]">
            {audit?.indexedDB.error
              ? audit.indexedDB.error
              : `Pointer: ${audit?.indexedDB.activeProjectId || 'kosong'}`}
          </div>
        </div>
      </div>

      {/* Section: Ghost Data & Duplicate Project Inspector */}
      <div className="bg-[#101626] border border-[#1d273e] rounded-2xl overflow-hidden">
        <div className="px-4 py-3.5 border-b border-[#1a2337] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Ghost className="w-4 h-4 text-amber-400 shrink-0" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Deteksi Data Ghost &amp; Project Ganda
            </h4>
          </div>
          <div className="text-xs text-slate-400 font-mono tabular-nums">
            {totalGhosts} Ghost · {totalDuplicates} Duplikat
          </div>
        </div>

        {isAuditing && !audit ? (
          <div className="p-6 space-y-3">
            <div className="h-10 rounded-xl bg-[#151d31] animate-pulse" />
            <div className="h-10 rounded-xl bg-[#151d31] animate-pulse" />
          </div>
        ) : totalGhosts === 0 && totalDuplicates === 0 && audit?.isSynced ? (
          <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-white">
                  Tidak ada sisa data ghost atau project ganda yang tersangkut.
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Memory, LocalStorage, dan IndexedDB menyimpan jumlah dan ID naskah yang identik.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void onRunAudit()}
              className="text-xs font-semibold text-sky-300 hover:text-sky-200 px-3 py-1.5 rounded-lg bg-[#161f34] border border-[#263455] cursor-pointer shrink-0"
            >
              Verifikasi Ulang
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[#1a2337]">
            {/* Ghost Items List */}
            {audit?.ghostItems.map((ghost) => (
              <div
                key={ghost.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#131b2e]/60 transition-colors"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="text-xs font-bold text-white truncate">
                      {ghost.title}
                    </span>
                    <span className="text-[11px] font-mono text-amber-300">
                      {GHOST_TYPE_LABELS[ghost.type]}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{ghost.reason}</p>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono tabular-nums flex-wrap">
                    <span>Layer: {ghost.layer}</span>
                    <span aria-hidden="true">·</span>
                    <span className="truncate max-w-xs">Key/ID: {ghost.keyOrProjectId}</span>
                    {typeof ghost.sizeBytes === 'number' && ghost.sizeBytes > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Ukuran: {formatBytes(ghost.sizeBytes)}</span>
                      </>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void onCleanupGhosts()}
                  disabled={isCleaningGhosts}
                  className="px-3 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-200 border border-amber-500/40 text-xs font-semibold transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                >
                  {isCleaningGhosts ? 'Membersihkan...' : 'Bersihkan & Sinkronkan'}
                </button>
              </div>
            ))}

            {/* Duplicate Project Groups */}
            {audit?.duplicateGroups.map((group) => (
              <div key={group.signature} className="p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Copy className="w-4 h-4 text-rose-400 shrink-0" />
                    <span className="text-xs font-bold text-white truncate">{group.label}</span>
                    <span className="text-[11px] font-mono text-rose-300 shrink-0">
                      {DUPLICATE_REASON_LABELS[group.reason]} ({group.duplicateProjects.length} item)
                    </span>
                  </div>
                </div>

                <div className="divide-y divide-[#182136] border border-[#1a2337] rounded-xl bg-[#0b0f1a]">
                  {group.duplicateProjects.map((member, idx) => {
                    const isKept = member.id === group.keepProjectId && idx === 0;
                    const isActive = member.id === currentProjectId;
                    return (
                      <div
                        key={`${member.id}_${idx}`}
                        className="px-3 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-100 truncate">
                              {member.title}
                            </span>
                            <span
                              className={`text-[11px] font-semibold ${
                                isKept ? 'text-emerald-400' : 'text-rose-300'
                              }`}
                            >
                              {isKept ? 'Dipertahankan' : 'Kandidat Duplikat'}
                            </span>
                            {isActive && (
                              <span className="text-[11px] font-semibold text-purple-300">
                                · Sedang Dibuka
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono tabular-nums flex-wrap">
                            <span>ID: {member.id}</span>
                            <span aria-hidden="true">·</span>
                            <span>{member.sceneCount} Adegan</span>
                            {member.updatedAt && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>Diubah {formatIsoTime(member.updatedAt)}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => onSelectProjectById(member.id)}
                            className="px-2.5 py-1 rounded-lg bg-[#141c2e] hover:bg-[#1c2842] text-slate-200 border border-[#243250] text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <ExternalLink className="w-3 h-3 text-purple-400" />
                            <span>Buka</span>
                          </button>
                          {!isKept && projects.length > 1 && (
                            <button
                              type="button"
                              onClick={() => onDeleteProjectById(member.id)}
                              className="px-2.5 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900/70 text-rose-200 border border-rose-700/50 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3 text-rose-400" />
                              <span>Hapus</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section: Chronological Deploy & Sync History Logs */}
      <div className="bg-[#101626] border border-[#1d273e] rounded-2xl overflow-hidden">
        <div className="px-4 py-3.5 border-b border-[#1a2337] flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-purple-400 shrink-0" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Riwayat Status Deploy &amp; Sinkronisasi ({filteredLogs.length})
            </h4>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Segmented Filter Controls */}
            <div className="flex items-center gap-1 p-1 bg-[#090d18] border border-[#1a2337] rounded-xl">
              <button
                type="button"
                onClick={() => setLogFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  logFilter === 'all'
                    ? 'bg-purple-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Semua ({logs.length})
              </button>
              <button
                type="button"
                onClick={() => setLogFilter('issues')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  logFilter === 'issues'
                    ? 'bg-amber-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Peringatan/Gagal ({issueLogsCount})
              </button>
              <button
                type="button"
                onClick={() => setLogFilter('ghosts_dups')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  logFilter === 'ghosts_dups'
                    ? 'bg-rose-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Ghost/Ganda ({ghostDupLogsCount})
              </button>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={logQuery}
                onChange={(e) => setLogQuery(e.target.value)}
                placeholder="Cari log deploy..."
                className="bg-[#090d18] border border-[#1d273e] focus:border-purple-500 rounded-xl py-1.5 pl-8 pr-3 text-xs text-white placeholder-slate-500 outline-none w-44"
              />
            </div>

            {logs.length > 0 && (
              <button
                type="button"
                onClick={onClearLogs}
                className="px-2.5 py-1.5 rounded-xl bg-[#151d31] hover:bg-rose-950/60 text-slate-300 hover:text-rose-200 border border-[#23304d] hover:border-rose-700/50 text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                Bersihkan Log
              </button>
            )}
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <Activity className="w-6 h-6 text-slate-500 mx-auto" />
            <p className="text-xs font-semibold text-slate-300">
              {logs.length === 0
                ? 'Belum ada riwayat status deploy atau sinkronisasi yang tercatat.'
                : 'Tidak ada entri log yang cocok dengan filter saat ini.'}
            </p>
            <p className="text-xs text-slate-500">
              Setiap aksi simpan, buat, duplikat, hapus, atau pembersihan ghost akan otomatis dicatat di sini.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#182136] max-h-[360px] overflow-y-auto custom-scrollbar">
            {filteredLogs.map((entry) => {
              const StatusIcon =
                entry.status === 'error'
                  ? XCircle
                  : entry.status === 'warning'
                  ? AlertTriangle
                  : CheckCircle2;
              const statusTextClass =
                entry.status === 'error'
                  ? 'text-rose-400'
                  : entry.status === 'warning'
                  ? 'text-amber-400'
                  : 'text-emerald-400';
              const statusLabel =
                entry.status === 'error'
                  ? 'Gagal'
                  : entry.status === 'warning'
                  ? 'Peringatan'
                  : 'Berhasil';

              return (
                <div
                  key={entry.id}
                  className="px-4 py-3.5 hover:bg-[#131b2e]/50 transition-colors space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusIcon className={`w-4 h-4 shrink-0 ${statusTextClass}`} />
                      <span className={`text-xs font-bold ${statusTextClass}`}>
                        {statusLabel}
                      </span>
                      <span aria-hidden="true" className="text-slate-600">
                        ·
                      </span>
                      <span className="text-xs font-bold text-white">
                        {ACTION_LABELS[entry.action] || entry.action}
                      </span>
                      {entry.tier && (
                        <>
                          <span aria-hidden="true" className="text-slate-600">
                            ·
                          </span>
                          <span className="text-[11px] font-mono text-purple-300">
                            {entry.tier}
                          </span>
                        </>
                      )}
                    </div>

                    <span className="text-[11px] font-mono tabular-nums text-slate-400">
                      {formatIsoTime(entry.timestamp)}
                    </span>
                  </div>

                  <p className="text-xs text-slate-200 leading-relaxed">{entry.message}</p>

                  <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono tabular-nums text-slate-400">
                    <span>Memory: {entry.memoryCount}</span>
                    <span aria-hidden="true">·</span>
                    <span>LocalStorage: {entry.localCount}</span>
                    <span aria-hidden="true">·</span>
                    <span>IndexedDB: {entry.idbCount === null ? '-' : entry.idbCount}</span>
                    <span aria-hidden="true">·</span>
                    <span className={entry.ghostCount > 0 ? 'text-amber-300 font-semibold' : ''}>
                      Ghost: {entry.ghostCount}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className={entry.duplicateCount > 0 ? 'text-rose-300 font-semibold' : ''}>
                      Ganda: {entry.duplicateCount}
                    </span>
                  </div>

                  {entry.details && entry.details.length > 0 && (
                    <ul className="pt-1 space-y-0.5 text-[11px] text-slate-400">
                      {entry.details.map((d, i) => (
                        <li key={i} className="font-mono">
                          • {d}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
