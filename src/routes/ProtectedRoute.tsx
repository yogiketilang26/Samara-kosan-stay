import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { isSupabaseConfigured } from '../lib/supabase';
import Loader from '../components/common/Loader';
import {
  Lock,
  Mail,
  ShieldAlert,
  User,
  CheckCircle2,
  ArrowLeft,
  LogOut,
  Building2,
  Shield,
  Eye,
  EyeOff,
  Sparkles,
  Database,
  DoorOpen,
  UserCheck,
  KeyRound
} from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: string[];
  requiredPortal?: 'admin' | 'owner' | 'staff';
}

interface SupabasePortalAccount {
  id?: string;
  email: string;
  full_name: string;
  role: string;
  access?: string;
  property_id?: number | null;
  defaultPass?: string;
}

const DEFAULT_SUPABASE_ACCOUNTS: SupabasePortalAccount[] = [
  {
    email: 'staff@samarastay.co.id',
    full_name: 'Staff Operasional',
    role: 'staff',
    access: 'Akses Operasional Asrama & Check-In/Out (Staff)',
    defaultPass: 'admin123'
  },
  {
    email: 'anakowner@samarastay.co.id',
    full_name: 'Anak Owner',
    role: 'anak_owner',
    access: 'Akses Operasional, Hunian & Keuangan (Anak Owner)',
    defaultPass: 'admin123'
  },
  {
    email: 'sabita@samarastay.co',
    full_name: 'Sabita (Anak Owner)',
    role: 'anak_owner',
    access: 'Akses Operasional, Hunian & Keuangan (Anak Owner)',
    defaultPass: 'admin123'
  },
  {
    email: 'owner@samarastay.co.id',
    full_name: 'Owner / Pemilik Properti',
    role: 'owner',
    access: 'Semua Properti (Owner Investor Portfolio)',
    defaultPass: 'admin123'
  },
  {
    email: 'owner@samarastay.com',
    full_name: 'Owner Investor',
    role: 'owner',
    access: 'Semua Properti (Owner Investor Portfolio)',
    defaultPass: 'admin123'
  },
  {
    email: 'admin@samarastay.co.id',
    full_name: 'Samara Admin (Super)',
    role: 'super',
    access: 'Semua Properti (Super Admin)',
    defaultPass: 'admin123'
  },
  {
    email: 'yogiketilang33@gmail.com',
    full_name: 'Super Admin Utama (Yogi)',
    role: 'super',
    access: 'Semua Properti (Super Admin)',
    defaultPass: 'admin123'
  }
];

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  allowedRoles,
  requiredPortal = 'admin'
}) => {
  const { user, loading, login, signup, logout } = useAuth();

  const detectAnakOwnerMode = (): boolean => {
    if (typeof window === 'undefined') return false;
    return (
      window.location.search.includes('anak_owner') ||
      window.location.hash.includes('anak_owner') ||
      localStorage.getItem('samara_simulated_role') === 'anak_owner'
    );
  };

  const [isAnakOwnerPortal, setIsAnakOwnerPortal] = useState<boolean>(() =>
    requiredPortal === 'admin' && detectAnakOwnerMode()
  );
  const [isSignUp, setIsSignUp] = useState(false);
  const [isResetPassword, setIsResetPassword] = useState(false);
  const [email, setEmail] = useState(() => {
    if (requiredPortal === 'owner') return 'owner@samarastay.co.id';
    if (requiredPortal === 'staff') return 'staff@samarastay.co.id';
    if (detectAnakOwnerMode()) return 'anakowner@samarastay.co.id';
    return 'admin@samarastay.co.id';
  });
  const [password, setPassword] = useState('admin123');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [supabaseAccounts, setSupabaseAccounts] = useState<SupabasePortalAccount[]>(DEFAULT_SUPABASE_ACCOUNTS);

  // Sync Anak Owner mode from Navbar / URL events
  useEffect(() => {
    const syncRoleMode = (e?: any) => {
      if (requiredPortal !== 'admin') {
        setIsAnakOwnerPortal(false);
        return;
      }
      const nextAnakOwner = e?.detail !== undefined
        ? e.detail?.role === 'anak_owner'
        : detectAnakOwnerMode();
      setIsAnakOwnerPortal(nextAnakOwner);
      setEmail(nextAnakOwner ? 'anakowner@samarastay.co.id' : 'admin@samarastay.co.id');
      setPassword('admin123');
      setError(null);
      setInfo(null);
    };

    window.addEventListener('samara-role-simulate', syncRoleMode);
    window.addEventListener('popstate', syncRoleMode);
    return () => {
      window.removeEventListener('samara-role-simulate', syncRoleMode);
      window.removeEventListener('popstate', syncRoleMode);
    };
  }, [requiredPortal]);

  // Update default email when requiredPortal prop changes
  useEffect(() => {
    if (requiredPortal === 'owner') {
      setIsAnakOwnerPortal(false);
      setEmail('owner@samarastay.co.id');
      setPassword('admin123');
    } else if (requiredPortal === 'staff') {
      setIsAnakOwnerPortal(false);
      setEmail('staff@samarastay.co.id');
      setPassword('admin123');
    } else {
      const ao = detectAnakOwnerMode();
      setIsAnakOwnerPortal(ao);
      setEmail(ao ? 'anakowner@samarastay.co.id' : 'admin@samarastay.co.id');
      setPassword('admin123');
    }
    setError(null);
    setInfo(null);
  }, [requiredPortal]);

  // Fetch live active operator accounts from Supabase public.users
  useEffect(() => {
    if (user) return;
    let mounted = true;
    fetch('/api/auth/portal-accounts')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!mounted || !data?.accounts || !Array.isArray(data.accounts) || data.accounts.length === 0) return;
        const mergedMap = new Map<string, SupabasePortalAccount>();
        for (const acc of data.accounts) {
          const clean = String(acc.email || '').trim().toLowerCase();
          if (!clean) continue;
          mergedMap.set(clean, {
            id: acc.id,
            email: clean,
            full_name: acc.full_name || clean.split('@')[0],
            role: String(acc.role || 'staff').toLowerCase(),
            access: acc.access || '',
            property_id: acc.property_id ?? null,
            defaultPass: 'admin123'
          });
        }
        for (const def of DEFAULT_SUPABASE_ACCOUNTS) {
          const clean = def.email.toLowerCase();
          if (!mergedMap.has(clean)) {
            mergedMap.set(clean, def);
          }
        }
        setSupabaseAccounts(Array.from(mergedMap.values()));
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [user]);

  const portalRelevantAccounts = useMemo(() => {
    const isOwnerPortal = requiredPortal === 'owner';
    const isStaffPortal = requiredPortal === 'staff';
    return supabaseAccounts.filter(acc => {
      const r = acc.role.toLowerCase();
      if (isOwnerPortal) return ['owner', 'super', 'super_admin'].includes(r);
      if (isStaffPortal) return ['staff', 'super', 'super_admin', 'admin'].includes(r);
      if (isAnakOwnerPortal) return ['anak_owner', 'anak owner', 'super', 'super_admin'].includes(r);
      return ['super', 'super_admin', 'admin', 'anak_owner', 'finance'].includes(r);
    });
  }, [supabaseAccounts, requiredPortal, isAnakOwnerPortal]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <Loader label="Memverifikasi Otorisasi Sesi & Peran Akun Supabase.." />
      </div>
    );
  }

  const handlePortalSwitch = (target: 'staff' | 'anak_owner' | 'owner' | 'super') => {
    setError(null);
    setInfo(null);
    setIsSignUp(false);
    setIsResetPassword(false);

    if (target === 'staff') {
      localStorage.removeItem('samara_simulated_role');
      setIsAnakOwnerPortal(false);
      window.dispatchEvent(new CustomEvent('samara-role-simulate', { detail: { role: null } }));
      window.dispatchEvent(new CustomEvent('samara-navigate-portal', { detail: { view: 'staff' } }));
      setEmail('staff@samarastay.co.id');
      setPassword('admin123');
    } else if (target === 'anak_owner') {
      localStorage.setItem('samara_simulated_role', 'anak_owner');
      setIsAnakOwnerPortal(true);
      window.history.pushState({ view: 'admin' }, '', '/admin?role=anak_owner');
      window.dispatchEvent(new CustomEvent('samara-role-simulate', { detail: { role: 'anak_owner' } }));
      window.dispatchEvent(new CustomEvent('samara-navigate-portal', { detail: { view: 'admin' } }));
      setEmail('anakowner@samarastay.co.id');
      setPassword('admin123');
    } else if (target === 'owner') {
      localStorage.removeItem('samara_simulated_role');
      setIsAnakOwnerPortal(false);
      window.dispatchEvent(new CustomEvent('samara-role-simulate', { detail: { role: null } }));
      window.dispatchEvent(new CustomEvent('samara-navigate-portal', { detail: { view: 'owner' } }));
      setEmail('owner@samarastay.co.id');
      setPassword('admin123');
    } else {
      localStorage.removeItem('samara_simulated_role');
      setIsAnakOwnerPortal(false);
      window.history.pushState({ view: 'admin' }, '', '/admin');
      window.dispatchEvent(new CustomEvent('samara-role-simulate', { detail: { role: null } }));
      window.dispatchEvent(new CustomEvent('samara-navigate-portal', { detail: { view: 'admin' } }));
      setEmail('admin@samarastay.co.id');
      setPassword('admin123');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      if (isResetPassword) {
        if (!email.trim()) {
          setError('Alamat email wajib diisi untuk pemulihan kata sandi.');
          setSubmitting(false);
          return;
        }
        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim() })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setInfo(data.message || 'Tautan pemulihan kata sandi telah dikirim melalui Supabase Auth.');
          setIsResetPassword(false);
        } else {
          setError(data.error || 'Gagal mengirim email pemulihan kata sandi.');
        }
      } else if (isSignUp) {
        if (!fullName.trim()) {
          setError('Nama lengkap wajib diisi.');
          setSubmitting(false);
          return;
        }
        const res = await signup(email, password, fullName, requiredPortal);
        if (res.success) {
          setInfo(res.error || 'Pendaftaran berhasil di Supabase! Akun Anda siap digunakan.');
          setIsSignUp(false);
          setPassword('');
        } else {
          setError(res.error || 'Gagal mendaftarkan akun.');
        }
      } else {
        const res = await login(email, password);
        if (!res.success) {
          setError(res.error || 'Email atau kata sandi salah. Silakan coba lagi atau pilih akun Supabase di bawah.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReturnHome = () => {
    window.dispatchEvent(new CustomEvent('samara-navigate-portal', { detail: { view: 'user' } }));
  };

  const handleQuickFill = (presetEmail: string, presetPass: string = 'admin123') => {
    setEmail(presetEmail);
    setPassword(presetPass);
    setError(null);
    setInfo(null);
  };

  // 1. IF NOT AUTHENTICATED -> Render Dedicated Portal Login Screen (Synced with Supabase)
  if (!user) {
    const isOwnerPortal = requiredPortal === 'owner';
    const isStaffPortal = requiredPortal === 'staff';

    const focusRingClass = isOwnerPortal
      ? 'focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30'
      : isStaffPortal
      ? 'focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30'
      : isAnakOwnerPortal
      ? 'focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30'
      : 'focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30';

    const submitButtonClass = isOwnerPortal
      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
      : isStaffPortal
      ? 'bg-teal-500 hover:bg-teal-400 text-slate-950'
      : isAnakOwnerPortal
      ? 'bg-purple-500 hover:bg-purple-400 text-white'
      : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950';

    const submitButtonLabel = isResetPassword
      ? 'Kirim Email Pemulihan Sandi'
      : isSignUp
      ? 'Daftar Akun di Supabase'
      : isOwnerPortal
      ? 'Masuk Owner Portal'
      : isStaffPortal
      ? 'Masuk Staff Admin'
      : isAnakOwnerPortal
      ? 'Masuk Panel Anak Owner'
      : 'Masuk Admin Panel (Super)';

    return (
      <div className="min-h-[calc(100vh-64px)] bg-[#09090b] flex flex-col items-center justify-center p-4 sm:p-6 font-sans text-slate-300">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 space-y-5 shadow-2xl">
          
          {/* Top Portal Role Switcher Bar (2x2 on narrow mobile, 4-col on sm+) */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-1.5 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            <button
              type="button"
              onClick={() => handlePortalSwitch('staff')}
              className={`min-h-[44px] py-2 px-2 rounded-xl text-[10px] font-extrabold uppercase tracking-wider flex flex-col items-center justify-center gap-1 transition-all cursor-pointer whitespace-nowrap ${
                isStaffPortal
                  ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <DoorOpen size={14} className={isStaffPortal ? 'text-teal-400' : 'text-slate-500'} />
              <span>Staff Admin</span>
            </button>
            <button
              type="button"
              onClick={() => handlePortalSwitch('anak_owner')}
              className={`min-h-[44px] py-2 px-2 rounded-xl text-[10px] font-extrabold uppercase tracking-wider flex flex-col items-center justify-center gap-1 transition-all cursor-pointer whitespace-nowrap ${
                !isOwnerPortal && !isStaffPortal && isAnakOwnerPortal
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <UserCheck size={14} className={!isOwnerPortal && !isStaffPortal && isAnakOwnerPortal ? 'text-purple-400' : 'text-slate-500'} />
              <span>Anak Owner</span>
            </button>
            <button
              type="button"
              onClick={() => handlePortalSwitch('owner')}
              className={`min-h-[44px] py-2 px-2 rounded-xl text-[10px] font-extrabold uppercase tracking-wider flex flex-col items-center justify-center gap-1 transition-all cursor-pointer whitespace-nowrap ${
                isOwnerPortal
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Building2 size={14} className={isOwnerPortal ? 'text-amber-400' : 'text-slate-500'} />
              <span>Owner</span>
            </button>
            <button
              type="button"
              onClick={() => handlePortalSwitch('super')}
              className={`min-h-[44px] py-2 px-2 rounded-xl text-[10px] font-extrabold uppercase tracking-wider flex flex-col items-center justify-center gap-1 transition-all cursor-pointer whitespace-nowrap ${
                !isOwnerPortal && !isStaffPortal && !isAnakOwnerPortal
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Shield size={14} className={!isOwnerPortal && !isStaffPortal && !isAnakOwnerPortal ? 'text-emerald-400' : 'text-slate-500'} />
              <span>Super Admin</span>
            </button>
          </div>

          <div className="text-center space-y-2">
            <div className={`mx-auto w-14 h-14 rounded-2xl flex items-center justify-center border shadow-lg ${
              isOwnerPortal 
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' 
                : isStaffPortal
                ? 'bg-teal-500/10 border-teal-500/30 text-teal-400'
                : isAnakOwnerPortal
                ? 'bg-purple-500/10 border-purple-500/30 text-purple-400'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            }`}>
              {isOwnerPortal ? (
                <Building2 size={26} />
              ) : isStaffPortal ? (
                <DoorOpen size={26} />
              ) : isAnakOwnerPortal ? (
                <UserCheck size={26} />
              ) : (
                <Shield size={26} />
              )}
            </div>

            <div className="flex items-center justify-center gap-2 flex-wrap">
              <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest border ${
                isOwnerPortal
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  : isStaffPortal
                  ? 'bg-teal-500/20 text-teal-300 border-teal-500/30'
                  : isAnakOwnerPortal
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
              }`}>
                {isOwnerPortal ? 'Owner & Investor Portal' : isStaffPortal ? 'Portal Staff Admin Operasional' : isAnakOwnerPortal ? 'Portal Panel Anak Owner' : 'Super Admin Management'}
              </span>

              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Database size={10} />
                {isSupabaseConfigured ? 'SUPABASE AUTH SYNCED' : 'SUPABASE READY'}
              </span>
            </div>

            <h2 className="text-xl font-black text-white uppercase tracking-wider font-display pt-1">
              {isResetPassword
                ? 'PEMULIHAN KATA SANDI'
                : isSignUp 
                ? 'DAFTAR AKUN OPERATOR' 
                : (isOwnerPortal 
                    ? 'MASUK OWNER PORTAL' 
                    : isStaffPortal 
                    ? 'MASUK STAFF ADMIN' 
                    : isAnakOwnerPortal
                    ? 'MASUK PANEL ANAK OWNER'
                    : 'MASUK ADMIN PANEL')}
            </h2>

            <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
              {isResetPassword
                ? 'Masukkan email akun Supabase Anda untuk menerima tautan reset kata sandi.'
                : isSignUp
                ? 'Daftarkan akun baru yang terintegrasi langsung dengan autentikasi Supabase Samara Stay.'
                : (isOwnerPortal 
                    ? 'Akses khusus Pemilik / Investor Properti Samara Stay untuk memantau performa bisnis dan pengesahan dokumen.'
                    : isStaffPortal
                    ? 'Akses khusus Staff Admin Operasional kos untuk mengelola unit kamar, survey tamu, check-in/out, dan perbaikan harian.'
                    : isAnakOwnerPortal
                    ? 'Akses khusus Anak Owner untuk pengawasan operasional, okupansi unit kamar, reservasi, dan pembukuan kos.'
                    : 'Akses khusus Super Administrator untuk manajemen operasional, reservasi, tarif, dan pembukuan kos.')}
            </p>
          </div>

          {/* Live Supabase Account Selector */}
          {!isSignUp && !isResetPassword && (
            <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-3 space-y-2 text-left">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Sparkles size={11} className={isOwnerPortal ? "text-amber-400" : isStaffPortal ? "text-teal-400" : isAnakOwnerPortal ? "text-purple-400" : "text-emerald-400"} />
                  Akun Terdaftar di Supabase
                </span>
                <span className="text-[9px] text-slate-500 font-mono">Klik untuk pilih akun</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pr-0.5">
                {portalRelevantAccounts.map((acc) => {
                  const isSelected = email.trim().toLowerCase() === acc.email.toLowerCase();
                  const r = acc.role.toLowerCase();
                  const badgeColor = r === 'owner'
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
                    : r === 'staff'
                    ? 'bg-teal-500/15 text-teal-300 border-teal-500/30 hover:bg-teal-500/25'
                    : (r === 'anak_owner' || r === 'anak owner')
                    ? 'bg-purple-500/15 text-purple-300 border-purple-500/30 hover:bg-purple-500/25'
                    : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25';

                  return (
                    <button
                      key={acc.email}
                      type="button"
                      onClick={() => handleQuickFill(acc.email, acc.defaultPass || 'admin123')}
                      className={`border text-[10px] font-bold p-2 rounded-xl text-left transition-all cursor-pointer flex flex-col justify-between ${badgeColor} ${
                        isSelected ? 'ring-1 ring-white/40 shadow-md' : 'opacity-90'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 w-full">
                        <span className="font-extrabold text-white truncate">{acc.full_name}</span>
                        <span className="text-[8px] font-mono uppercase px-1.5 py-0.5 rounded bg-black/30 text-slate-200 shrink-0">
                          {r === 'anak_owner' ? 'anak_owner' : r}
                        </span>
                      </div>
                      <span className="text-[9px] text-slate-300 font-mono truncate mt-0.5">{acc.email}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2.5 text-xs text-red-400 font-medium leading-relaxed text-left">
                <ShieldAlert size={16} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {info && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex items-start gap-2.5 text-xs text-emerald-400 font-medium leading-relaxed text-left">
                <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                <span>{info}</span>
              </div>
            )}

            {isSignUp && !isResetPassword && (
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
                    className={`w-full h-11 bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3.5 text-slate-100 placeholder-slate-500 text-xs font-medium transition-all duration-200 outline-none ${focusRingClass}`}
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5 text-left">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                Alamat Email (Supabase Auth)
              </label>
              <div className="relative">
                <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={
                    isOwnerPortal
                      ? "contoh: owner@samarastay.co.id"
                      : isStaffPortal
                      ? "contoh: staff@samarastay.co.id"
                      : isAnakOwnerPortal
                      ? "contoh: anakowner@samarastay.co.id"
                      : "contoh: admin@samarastay.co.id"
                  }
                  className={`w-full h-11 bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3.5 text-slate-100 placeholder-slate-500 text-xs font-medium font-mono transition-all duration-200 outline-none ${focusRingClass}`}
                />
              </div>
            </div>

            {!isResetPassword && (
              <div className="space-y-1.5 text-left">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                    Kata Sandi (Password)
                  </label>
                  {!isSignUp && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsResetPassword(true);
                        setError(null);
                        setInfo(null);
                      }}
                      className="text-[10px] text-slate-400 hover:text-white font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <KeyRound size={11} />
                      <span>Lupa Sandi?</span>
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`w-full h-11 bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-10 text-slate-100 placeholder-slate-500 text-xs font-medium font-mono transition-all duration-200 outline-none ${focusRingClass}`}
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
            )}

            <button
              type="submit"
              disabled={submitting}
              className={`w-full h-11 font-black text-xs uppercase tracking-wider rounded-xl transition-all duration-200 shadow-md focus:outline-none cursor-pointer flex items-center justify-center gap-2 ${
                submitting ? 'opacity-70 cursor-not-allowed' : ''
              } ${submitButtonClass}`}
            >
              {submitting
                ? (isResetPassword ? 'Mengirim Email...' : isSignUp ? 'Mendaftarkan Akun...' : 'Memverifikasi di Supabase...')
                : submitButtonLabel}
            </button>
          </form>

          <div className="pt-2 flex flex-col gap-2.5 text-center border-t border-slate-800/80">
            {isResetPassword ? (
              <button
                type="button"
                onClick={() => {
                  setIsResetPassword(false);
                  setError(null);
                  setInfo(null);
                }}
                className="text-xs text-slate-400 hover:text-white font-medium transition-colors cursor-pointer"
              >
                Kembali ke Form Login
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError(null);
                  setInfo(null);
                }}
                className="text-xs text-slate-400 hover:text-white font-medium transition-colors cursor-pointer"
              >
                {isSignUp ? 'Sudah punya akun terdaftar? Masuk Sesi' : 'Belum punya akun operator? Daftar Akun Baru'}
              </button>
            )}

            <button
              type="button"
              onClick={handleReturnHome}
              className="text-xs text-slate-500 hover:text-slate-300 font-semibold flex items-center justify-center gap-1.5 transition-colors pt-1 cursor-pointer"
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
  const userRole = (user.raw_role || user.role || '').trim().toLowerCase();
  const isAllowed = allowedRoles.some(r => r.trim().toLowerCase() === userRole);

  // 3. IF ROLE IS NOT AUTHORIZED -> RENDER 403 FORBIDDEN PAGE WITH 1-CLICK ROLE PORTAL REDIRECT
  if (!isAllowed) {
    const isOwnerPortal = requiredPortal === 'owner';
    const isStaffPortal = requiredPortal === 'staff';
    const targetPortalName = isOwnerPortal ? 'Owner Portal' : isStaffPortal ? 'Staff Admin' : 'Admin Panel';
    const targetRolesDisplay = allowedRoles.map(r => r.toUpperCase()).join(' / ');

    const recommendedPortalView: 'staff' | 'admin' | 'owner' | 'user' =
      userRole === 'staff'
        ? 'staff'
        : userRole === 'owner'
        ? 'owner'
        : ['super', 'super_admin', 'admin', 'anak_owner', 'anak owner', 'finance'].includes(userRole)
        ? 'admin'
        : 'user';

    const recommendedPortalLabel =
      recommendedPortalView === 'staff'
        ? 'Buka Portal Staff Admin'
        : recommendedPortalView === 'owner'
        ? 'Buka Owner Portal'
        : recommendedPortalView === 'admin'
        ? (userRole === 'anak_owner' || userRole === 'anak owner' ? 'Buka Panel Anak Owner' : 'Buka Admin Panel')
        : 'Buka Website Penyewa';

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
              Halaman ini diisolasi secara ketat dan hanya dapat diakses oleh akun dengan peran otoritas Supabase: <span className="font-mono text-emerald-400 font-bold bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800">[{targetRolesDisplay}]</span>.
            </p>
          </div>

          {/* User Active Identity Box */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-left space-y-2 font-mono text-xs">
            <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Identitas Sesi Supabase Aktif:</div>
            <div className="flex justify-between items-center text-slate-200">
              <span>Nama:</span>
              <span className="font-bold text-white">{user.name || '-'}</span>
            </div>
            <div className="flex justify-between items-center text-slate-200 border-t border-slate-900 pt-1.5">
              <span>Email:</span>
              <span className="font-bold text-white">{user.email}</span>
            </div>
            <div className="flex justify-between items-center text-slate-200 border-t border-slate-900 pt-1.5">
              <span>Peran (Role Supabase):</span>
              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold uppercase">
                {userRole || 'USER'}
              </span>
            </div>
          </div>

          <div className="space-y-2.5 pt-2">
            {recommendedPortalView !== 'user' && (
              <button
                onClick={() => {
                  if (userRole === 'anak_owner' || userRole === 'anak owner') {
                    localStorage.setItem('samara_simulated_role', 'anak_owner');
                    window.dispatchEvent(new CustomEvent('samara-role-simulate', { detail: { role: 'anak_owner' } }));
                  } else {
                    localStorage.removeItem('samara_simulated_role');
                    window.dispatchEvent(new CustomEvent('samara-role-simulate', { detail: { role: null } }));
                  }
                  window.dispatchEvent(new CustomEvent('samara-navigate-portal', { detail: { view: recommendedPortalView } }));
                }}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-3.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg"
              >
                <Shield size={14} />
                <span>{recommendedPortalLabel} (Sesuai Peran Anda)</span>
              </button>
            )}

            <button
              onClick={handleReturnHome}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs py-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 border border-slate-700"
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
              <span>Keluar Sesi & Ganti Akun di Portal Ini</span>
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
