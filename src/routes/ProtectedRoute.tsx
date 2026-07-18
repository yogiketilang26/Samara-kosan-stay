import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import Loader from '../components/common/Loader';
import { Lock, Mail, ShieldAlert, User, CheckCircle2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading, login, signup } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('yogiketilang33@gmail.com');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <Loader label="Memeriksa Otorisasi Sesi.." />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      if (isSignUp) {
        if (!fullName.trim()) {
          setError('Nama lengkap wajib diisi.');
          setSubmitting(false);
          return;
        }
        const res = await signup(email, password, fullName);
        if (res.success) {
          setInfo(res.error || 'Pendaftaran berhasil! Akun Anda siap digunakan.');
          setIsSignUp(false); // Switch to sign in
          setPassword('');
        } else {
          setError(res.error || 'Gagal mendaftarkan akun.');
        }
      } else {
        const res = await login(email, password);
        if (!res.success) {
          setError(res.error || 'Email atau password salah.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center p-6 font-sans text-slate-300">
        <div className="w-full max-w-md bg-slate-900 border border-slate-805 rounded-3xl p-8 space-y-6 shadow-2xl">
          <div className="text-center space-y-2">
            <div className="mx-auto w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center text-amber-500">
              <Lock size={20} />
            </div>
            <h2 className="text-lg font-black text-white uppercase tracking-wider font-display">
              {isSignUp ? 'DAFTAR AKUN BARU' : 'SAMARA STAY OPERATOR'}
            </h2>
            <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
              {isSignUp
                ? 'Daftarkan akun operator/admin baru untuk mengelola properti Samara Stay.'
                : 'Silakan masuk menggunakan kredensial pengurus / fungsionaris kos untuk mengakses dashboard manajemen.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2.5 text-[10px] text-red-400 font-medium">
                <ShieldAlert size={14} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {info && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex items-start gap-2.5 text-[10px] text-emerald-400 font-medium">
                <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                <span>{info}</span>
              </div>
            )}

            {isSignUp && (
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                  Nama Lengkap
                </label>
                <div className="relative">
                  <User size={13} className="absolute left-3.5 top-3.5 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Nama Lengkap Anda"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3.5 py-3 text-white text-xs font-medium focus:border-amber-500 focus:outline-none transition-all"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                Alamat Email
              </label>
              <div className="relative">
                <Mail size={13} className="absolute left-3.5 top-3.5 text-slate-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contoh: admin@samarastay.co.id"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3.5 py-3 text-white text-xs font-medium focus:border-amber-500 focus:outline-none transition-all font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                Kata Sandi (Password)
              </label>
              <div className="relative">
                <Lock size={13} className="absolute left-3.5 top-3.5 text-slate-500" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3.5 py-3 text-white text-xs font-medium focus:border-amber-500 focus:outline-none transition-all font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-amber-500 hover:bg-amber-450 text-black font-extrabold text-[10px] uppercase py-3.5 rounded-xl transition-all shadow-md focus:outline-none cursor-pointer flex items-center justify-center gap-2"
            >
              {submitting
                ? (isSignUp ? 'Mendaftarkan Akun...' : 'Memproses Masuk Sesi...')
                : (isSignUp ? 'Daftar Akun Operator' : 'Verifikasi & Masuk Dashboard')}
            </button>
          </form>

          <div className="pt-4 text-center">
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
                setInfo(null);
              }}
              className="text-[10px] text-amber-500 hover:underline font-bold uppercase tracking-wider"
            >
              {isSignUp ? 'Sudah punya akun? Masuk Sesi' : 'Belum punya akun? Daftar Akun Baru'}
            </button>
          </div>

          <div className="border-t border-slate-800/60 pt-4 text-center space-y-1">
            <p className="text-[9px] text-slate-500">
              Mendaftarkan akun baru akan mengotorisasi email Anda sebagai Staff (Akses Terbatas). Hubungi Administrator Utama untuk peningkatan hak akses.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
