'use client';

import React, { useState } from 'react';
import {
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { PublicAppUser } from '@/types';
import { sanitizeTabName } from '@/utils/storyboardStorage';

export const AUTH_STORAGE_KEY = 'ugc_studio_gate_auth_v3';
export const DEFAULT_ADMIN_USERNAME = 'admin';
export const DEFAULT_ADMIN_PASSWORD = 'Ilalang@27';
export const CORRECT_PASSWORD = DEFAULT_ADMIN_PASSWORD;

interface PasswordGateProps {
  googleToken?: string | null;
  googleEmail?: string | null;
  onGoogleConnected?: (token: string, email: string | null) => void;
  onSuccess: (user: PublicAppUser) => void;
}

export const PasswordGate: React.FC<PasswordGateProps> = ({ onSuccess }) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setErrorMessage('Kata sandi wajib diisi.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      if (password === CORRECT_PASSWORD) {
        const studioUser: PublicAppUser = {
          id: 'usr_admin_root',
          username: DEFAULT_ADMIN_USERNAME,
          displayName: 'Creator Studio',
          email: 'studio@ugcmaster.id',
          role: 'admin',
          sheetTabName: sanitizeTabName(DEFAULT_ADMIN_USERNAME),
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
        };
        onSuccess(studioUser);
        return;
      }

      setErrorMessage('Kata sandi salah. Silakan periksa kembali dan coba lagi.');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Terjadi kesalahan saat memverifikasi akses studio.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#070a12] text-slate-100 font-['Plus_Jakarta_Sans',sans-serif] overflow-y-auto">
      {/* Ambient Studio Glow Backdrop */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-purple-600/15 blur-[120px]" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-indigo-600/15 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-md bg-[#0d1322]/95 backdrop-blur-xl border border-[#1f2b47] rounded-2xl p-6 sm:p-8 shadow-2xl shadow-purple-950/30 my-auto animate-fadeIn">
        {/* Brand Logo Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-purple-900/50 mb-4 border border-purple-400/30">
            U
          </div>

          <div className="flex items-center gap-2 mb-1">
            <span className="text-white font-extrabold text-lg tracking-tight">
              UGC Master Studio
            </span>
            <span className="text-[10px] bg-purple-950 text-purple-300 border border-purple-700/50 px-2 py-0.5 rounded font-bold">
              PRO
            </span>
          </div>

          <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-3">
            Arsitek Naskah &amp; Storyboard Viral
          </span>

          <p className="text-xs text-slate-400 leading-relaxed max-w-xs">
            Masukkan kata sandi akses untuk membuka workspace storyboard UGC, AI Generator, &amp; MetaCleaner Pro.
          </p>
        </div>

        {/* Access Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
              Kata Sandi Akses Studio
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                autoFocus
                placeholder="Masukkan kata sandi studio..."
                className="w-full bg-[#090d18] border border-[#212d47] focus:border-purple-500 rounded-xl py-3 pl-10 pr-11 text-sm text-white placeholder-slate-500 outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 cursor-pointer"
                tabIndex={-1}
                aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {errorMessage && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-950/50 border border-rose-800/60 text-rose-300 text-xs leading-relaxed">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !password.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-purple-950/50 border border-purple-400/25 transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <span>{isSubmitting ? 'Memverifikasi...' : 'Buka Creator Studio'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-[#192338] flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Akses Studio Terproteksi</span>
          </div>
          <div className="flex items-center gap-1 text-purple-400/90 font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Creator Workspace</span>
          </div>
        </div>
      </div>
    </div>
  );
};
