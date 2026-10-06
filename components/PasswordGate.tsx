import React, { useState } from 'react';
import { Lock, Eye, EyeOff, Sparkles, ShieldCheck, AlertCircle, ArrowRight } from 'lucide-react';

interface PasswordGateProps {
  onSuccess: () => void;
}

export const AUTH_STORAGE_KEY = 'ugc_master_auth_v1';
export const CORRECT_PASSWORD = 'Ilalang@27';

export const PasswordGate: React.FC<PasswordGateProps> = ({ onSuccess }) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setIsSubmitting(true);
    if (password === CORRECT_PASSWORD) {
      setError(false);
      try {
        localStorage.setItem(AUTH_STORAGE_KEY, 'true');
      } catch (err) {
        console.error('Storage error:', err);
      }
      setTimeout(() => {
        setIsSubmitting(false);
        onSuccess();
      }, 300);
    } else {
      setTimeout(() => {
        setIsSubmitting(false);
        setError(true);
      }, 200);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#070a12] text-slate-100 font-sans">
      {/* Decorative ambient background glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-purple-600/15 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[350px] h-[350px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative w-full max-w-md bg-[#0e1424]/90 backdrop-blur-xl border border-[#1e2a44] rounded-3xl p-8 shadow-2xl shadow-purple-950/40">
        
        {/* Brand & Lock Badge */}
        <div className="flex flex-col items-center text-center mb-7">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-900 to-indigo-800 border border-purple-500/40 flex items-center justify-center text-purple-300 shadow-lg shadow-purple-900/50 mb-4 ring-4 ring-purple-500/10">
            <Lock className="w-7 h-7 text-purple-200" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-950/70 border border-purple-700/50 text-[11px] font-bold text-purple-300 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-purple-300" />
            <span>UGC MASTER CREATOR STUDIO</span>
          </div>

          <h1 className="text-2xl font-black text-white tracking-tight">
            Akses Terproteksi
          </h1>
          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed max-w-xs">
            Masukkan kata sandi studio untuk membuka generator storyboard & naskah UGC viral.
          </p>
        </div>

        {/* Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
              Kata Sandi Akses
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                autoFocus
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(false);
                }}
                placeholder="Masukkan kata sandi..."
                className={`w-full bg-[#090d18] border rounded-2xl py-3 pl-4 pr-12 text-sm text-white placeholder-slate-500 outline-none transition-all ${
                  error
                    ? 'border-red-500/80 focus:border-red-500 ring-2 ring-red-500/20'
                    : 'border-[#212d47] focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex items-center justify-between text-[11px] pt-1 text-slate-400">
              <span>Default Studio Password:</span>
              <button
                type="button"
                onClick={() => {
                  setPassword(CORRECT_PASSWORD);
                  setError(false);
                }}
                className="text-purple-400 hover:text-purple-300 font-semibold underline underline-offset-2 flex items-center gap-1 cursor-pointer"
              >
                <span>Gunakan {CORRECT_PASSWORD}</span>
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-950/60 border border-red-800/60 text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>Kata sandi salah. Silakan periksa kembali.</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !password.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-purple-950/60 transition-all active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <span>{isSubmitting ? 'Memverifikasi...' : 'Masuk ke Studio'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-[#192338] flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Akses Kreator Eksklusif</span>
          </div>
          <span>v2.2 Pro</span>
        </div>

      </div>
    </div>
  );
};
