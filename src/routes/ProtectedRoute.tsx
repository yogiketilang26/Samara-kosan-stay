import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import Loader from '../components/common/Loader';
import { Lock, Mail, ShieldAlert, User, CheckCircle2, ArrowLeft, LogOut, Building2, Shield, Eye, EyeOff, Sparkles, KeyRound } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: string[];
  requiredPortal?: 'admin' | 'owner' | 'staff';
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  allowedRoles,
  requiredPortal = 'admin'
}) => {
  const { user, loading, login, signup, logout } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <Loader label="Memverifikasi Otorisasi Sesi & Peran Akun.." />
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
        const res = await signup(email, password, fullName, requiredPortal);
        if (res.success) {
          setInfo(res.error || 'Pendaftaran berhasil! Akun Anda siap digunakan.');
          setIsSignUp(false);
          setPassword('');
        } else {
          setError(res.error || 'Gagal mendaftarkan akun.');
        }
      } else {
        const res = await login(email, password);
        if (!res.success) {
          setError(res.error || 'Email atau kata sandi salah. Silakan coba lagi atau gunakan tombol Kredensial Cepat di bawah.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReturnHome = () => {
    window.location.href = '/';
  };

  const handleQuickFill = (presetEmail: string, presetPass: string = 'admin123') => {
    setEmail(presetEmail);
    setPassword(presetPass);
    setError(null);
    setInfo(null);
  };

  // 1. IF NOT AUTHENTICATED -> Render Dedicated Portal Login Screen
  if (!user) {
    const isOwnerPortal = requiredPortal === 'owner';
    const isStaffPortal = requiredPortal === 'staff';

    return (
      <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center p-6 font-sans text-slate-300">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6 shadow-2xl">
          
          <div className="text-center space-y-2">
            <div className={`mx-auto w-14 h-14 rounded-2xl flex items-center justify-center border shadow-lg ${
              isOwnerPortal 
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' 
                : isStaffPortal
                ? 'bg-teal-500/10 border-teal-500/30 text-teal-400'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            }`}>
              {isOwnerPortal ? <Building2 size={26} /> : <Shield size={26} />}
            </div>

            <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest border ${
              isOwnerPortal
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                : isStaffPortal
                ? 'bg-teal-500/20 text-teal-300 border-teal-500/30'
                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
            }`}>
              {isOwnerPortal ? 'Owner & Investor Portal' : isStaffPortal ? 'Portal Staff Admin Operasional' : 'Super Admin Management'}
            </span>

            <h2 className="text-xl font-black text-white uppercase tracking-wider font-display pt-1">
              {isSignUp 
                ? 'DAFTAR AKUN OPERATOR' 
                : (isOwnerPortal 
                    ? 'MASUK OWNER PORTAL' 
                    : isStaffPortal 
                    ? 'MASUK STAFF ADMIN' 
                    : 'MASUK ADMIN PANEL')}
            </h2>

            <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
              {isSignUp
                ? (isOwnerPortal 
                    ? 'Daftarkan akun Pemilik/Investor properti baru untuk memantau performa kos.'
                    : 'Daftarkan akun operator/admin baru untuk mengelola properti Samara Stay.')
                : (isOwnerPortal 
                    ? 'Akses khusus Pemilik / Investor Properti Samara Stay untuk memantau performa bisnis dan pengesahan dokumen.'
                    : isStaffPortal
                    ? 'Akses khusus Staff Admin Operasional kos untuk mengelola unit kamar, survey tamu, check-in/out, dan perbaikan harian.'
                    : 'Akses khusus Super Administrator untuk manajemen operasional, reservasi, tarif, dan pembukuan kos.')}
            </p>
          </div>

          {/* Quick Preset Selector for Easy Login */}
          {!isSignUp && (
            <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-3 space-y-2 text-left">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Sparkles size={11} className={isOwnerPortal ? "text-amber-400" : isStaffPortal ? "text-teal-400" : "text-emerald-400"} />
                  Pilih Kredensial Cepat
                </span>
                <span className="text-[9px] text-slate-500 font-mono">Klik untuk mengisi</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {isOwnerPortal ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleQuickFill('owner@samarastay.co.id', 'owner123')}
                      className="bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[10px] font-bold p-2 rounded-xl text-left transition-all cursor-pointer flex flex-col"
                    >
                      <span className="font-extrabold text-amber-200">Owner Utama</span>
                      <span className="text-[9px] text-slate-400 truncate">owner@samarastay.co.id</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickFill('yogiketilang33@gmail.com', 'admin123')}
                      className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[10px] font-bold p-2 rounded-xl text-left transition-all cursor-pointer flex flex-col"
                    >
                      <span className="font-extrabold text-white">Akun Pemilik (Yogi)</span>
                      <span className="text-[9px] text-slate-400 truncate">yogiketilang33@gmail.com</span>
                    </button>
                  </>
                ) : isStaffPortal ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleQuickFill('staff@samarastay.co.id', 'admin123')}
                      className="bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 text-teal-300 text-[10px] font-bold p-2 rounded-xl text-left transition-all cursor-pointer flex flex-col"
                    >
                      <span className="font-extrabold text-teal-200">Staff Operasional</span>
                      <span className="text-[9px] text-slate-400 truncate">staff@samarastay.co.id</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickFill('admin@samarastay.co.id', 'admin123')}
                      className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[10px] font-bold p-2 rounded-xl text-left transition-all cursor-pointer flex flex-col"
                    >
                      <span className="font-extrabold text-white">Super Admin (Semua Akses)</span>
                      <span className="text-[9px] text-slate-400 truncate">admin@samarastay.co.id</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => handleQuickFill('admin@samarastay.co.id', 'admin123')}
                      className="bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold p-2 rounded-xl text-left transition-all cursor-pointer flex flex-col"
                    >
                      <span className="font-extrabold text-emerald-200">Super Admin</span>
                      <span className="text-[9px] text-slate-400 truncate">admin@samarastay.co.id</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickFill('yogiketilang33@gmail.com', 'admin123')}
                      className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[10px] font-bold p-2 rounded-xl text-left transition-all cursor-pointer flex flex-col"
                    >
                      <span className="font-extrabold text-white">Akun Admin (Yogi)</span>
                      <span className="text-[9px] text-slate-400 truncate">yogiketilang33@gmail.com</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2.5 text-xs text-red-400 font-medium leading-relaxed">
                <ShieldAlert size={16} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {info && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex items-start gap-2.5 text-xs text-emerald-400 font-medium leading-relaxed">
                <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                <span>{info}</span>
              </div>
            )}

            {isSignUp && (
              <div className="space-y-1.5 text-left">
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                  Nama Lengkap
                </label>
                <div className="relative">
                  <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Nama Lengkap Anda"
                    className={`w-full h-11 bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3.5 text-slate-100 placeholder-slate-500 text-xs font-medium transition-all duration-200 outline-none ${
                      isOwnerPortal 
                        ? 'focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30' 
                        : 'focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30'
                    }`}
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5 text-left">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                Alamat Email
              </label>
              <div className="relative">
                <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={isOwnerPortal ? "contoh: owner@samarastay.co.id" : "contoh: admin@samarastay.co.id"}
                  className={`w-full h-11 bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3.5 text-slate-100 placeholder-slate-500 text-xs font-medium font-mono transition-all duration-200 outline-none ${
                    isOwnerPortal 
                      ? 'focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30' 
                      : 'focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30'
                  }`}
                />
              </div>
            </div>

            <div className="space-y-1.5 text-left">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                Kata Sandi (Password)
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`w-full h-11 bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-10 text-slate-100 placeholder-slate-500 text-xs font-medium font-mono transition-all duration-200 outline-none ${
                    isOwnerPortal 
                      ? 'focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30' 
                      : 'focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                  title={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className={`w-full h-11 font-black text-xs uppercase tracking-wider rounded-xl transition-all duration-200 shadow-md focus:outline-none cursor-pointer flex items-center justify-center gap-2 ${
                submitting ? 'opacity-70 cursor-not-allowed' : ''
              } ${
                isOwnerPortal
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
              }`}
            >
              {submitting
                ? (isSignUp ? 'Mendaftarkan Akun...' : 'Memverifikasi Kredensial...')
                : (isSignUp ? 'Daftar Akun Operator' : (isOwnerPortal ? 'Masuk Owner Portal' : 'Masuk Admin Panel'))}
            </button>
          </form>

          <div className="pt-2 flex flex-col gap-3 text-center border-t border-slate-800/80">
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
                setInfo(null);
              }}
              className="text-xs text-slate-400 hover:text-white font-medium transition-colors cursor-pointer"
            >
              {isSignUp ? 'Sudah punya akun terdaftar? Masuk Sesi' : 'Belum punya akun operator? Daftar Akun Baru'}
            </button>

            <button
              onClick={handleReturnHome}
              className="text-xs text-slate-500 hover:text-slate-300 font-semibold flex items-center justify-center gap-1.5 transition-colors pt-2 cursor-pointer"
            >
              <ArrowLeft size={13} />
              <span>Kembali ke Website Penyewa</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. IF AUTHENTICATED -> STRICT ROLE ISOLATION CHECK
  // Normalize user role and allowedRoles
  const userRole = (user.raw_role || user.role || '').trim().toLowerCase();
  const isAllowed = allowedRoles.some(r => r.trim().toLowerCase() === userRole);

  // 3. IF ROLE IS NOT AUTHORIZED -> RENDER 403 FORBIDDEN PAGE
  if (!isAllowed) {
    const isOwnerPortal = requiredPortal === 'owner';
    const isStaffPortal = requiredPortal === 'staff';
    const targetPortalName = isOwnerPortal ? 'Owner Portal' : isStaffPortal ? 'Staff Admin' : 'Admin Panel';
    const targetRolesDisplay = allowedRoles.map(r => r.toUpperCase()).join(' / ');

    return (
      <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center p-6 font-sans text-slate-300">
        <div className="w-full max-w-lg bg-slate-900 border border-red-500/30 rounded-3xl p-8 space-y-6 shadow-2xl text-center">
          
          <div className="mx-auto w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center text-red-500">
            <ShieldAlert size={32} />
          </div>

          <div className="space-y-3">
            <div className="inline-block px-3 py-1 bg-red-500/10 border border-red-500/30 text-red-400 text-[10px] font-extrabold uppercase tracking-widest rounded-full">
              403 • ACCESS DENIED / UNAUTHORIZED
            </div>
            
            <h2 className="text-xl font-black text-white uppercase tracking-wider font-display">
              AKSES DITOLAK UNTUK {targetPortalName.toUpperCase()}
            </h2>

            <p className="text-xs text-slate-300 leading-relaxed max-w-md mx-auto">
              Halaman ini diisolasi secara ketat dan hanya dapat diakses oleh akun dengan peran otoritas: <span className="font-mono text-emerald-400 font-bold bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800">[{targetRolesDisplay}]</span>.
            </p>
          </div>

          {/* User Active Identity Box */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-left space-y-2 font-mono text-xs">
            <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Identitas Sesi Aktif:</div>
            <div className="flex justify-between items-center text-slate-200">
              <span>Email:</span>
              <span className="font-bold text-white">{user.email}</span>
            </div>
            <div className="flex justify-between items-center text-slate-200 border-t border-slate-900 pt-1.5">
              <span>Peran (Role):</span>
              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold uppercase">
                {userRole || 'USER'}
              </span>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <button
              onClick={handleReturnHome}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs py-3.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 border border-slate-700"
            >
              <ArrowLeft size={14} />
              <span>Kembali ke Website Penyewa</span>
            </button>

            <button
              onClick={async () => {
                await logout();
              }}
              className="w-full bg-red-600/20 hover:bg-red-600/30 text-red-300 font-bold text-xs py-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 border border-red-500/30"
            >
              <LogOut size={14} />
              <span>Keluar Sesi & Ganti Akun</span>
            </button>
          </div>

        </div>
      </div>
    );
  }

  // 4. IF AUTHORIZED -> RENDER PROTECTED CONTENT
  return <>{children}</>;
};

export default ProtectedRoute;
