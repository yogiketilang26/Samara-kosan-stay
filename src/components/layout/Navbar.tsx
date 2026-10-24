import React, { useState, useEffect } from 'react';
import { Home, Shield, RefreshCw, Database, Building2, LogOut, Key, UserCheck, ChevronDown, DoorOpen, Menu, X } from 'lucide-react';
import { isSupabaseConfigured, database } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

interface NavbarProps {
  currentView: 'user' | 'admin' | 'owner' | 'staff';
  setView: (view: 'user' | 'admin' | 'owner' | 'staff') => void;
  onRefresh: () => void;
}

export default function Navbar({ currentView, setView, onRefresh }: NavbarProps) {
  const { user, logout } = useAuth();
  const [showPortalDropdown, setShowPortalDropdown] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [simulatedRole, setSimulatedRole] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('role') || new URLSearchParams(window.location.search).get('portal');
      if (p === 'anak_owner') return 'anak_owner';
      return localStorage.getItem('samara_simulated_role');
    }
    return null;
  });

  useEffect(() => {
    const handler = (e: any) => {
      setSimulatedRole(e.detail?.role || null);
    };
    window.addEventListener('samara-role-simulate', handler);
    return () => window.removeEventListener('samara-role-simulate', handler);
  }, []);

  const rawRole = (user?.raw_role || user?.role || '').trim().toLowerCase();
  const userAccess = ((user as any)?.access || '').toLowerCase();
  const isSuper = Boolean(user && (rawRole === 'super' || rawRole === 'super_admin'));
  const isAnakOwner = Boolean(user && (rawRole === 'anak_owner' || rawRole === 'anak owner' || userAccess.includes('anak owner')));
  const isOwner = Boolean(user && rawRole === 'owner');
  const isStaff = Boolean(user && rawRole === 'staff');

  const handleResetSandbox = () => {
    if (window.confirm("Ingin me-reset ulang data sandbox ke stelan default bawaan? Semua data transaksi percobaan saat ini akan dibersihkan.")) {
      database.resetPlayground();
      onRefresh();
      setMobileMenuOpen(false);
    }
  };

  const handleLogout = async () => {
    setMobileMenuOpen(false);
    await logout();
    if (currentView !== 'user') {
      setView('user');
    }
  };

  const switchToSuperAdmin = () => {
    setShowPortalDropdown(false);
    setMobileMenuOpen(false);
    localStorage.removeItem('samara_simulated_role');
    setSimulatedRole(null);
    window.dispatchEvent(new CustomEvent('samara-role-simulate', { detail: { role: null } }));
    window.history.pushState({ view: 'admin' }, '', '/admin');
    setView('admin');
  };

  const switchToAnakOwner = () => {
    setShowPortalDropdown(false);
    setMobileMenuOpen(false);
    localStorage.setItem('samara_simulated_role', 'anak_owner');
    setSimulatedRole('anak_owner');
    window.dispatchEvent(new CustomEvent('samara-role-simulate', { detail: { role: 'anak_owner' } }));
    window.history.pushState({ view: 'admin' }, '', '/admin?role=anak_owner');
    setView('admin');
  };

  const switchToStaff = () => {
    setShowPortalDropdown(false);
    setMobileMenuOpen(false);
    localStorage.removeItem('samara_simulated_role');
    setSimulatedRole(null);
    window.dispatchEvent(new CustomEvent('samara-role-simulate', { detail: { role: null } }));
    setView('staff');
  };

  const switchToOwner = () => {
    setShowPortalDropdown(false);
    setMobileMenuOpen(false);
    localStorage.removeItem('samara_simulated_role');
    setSimulatedRole(null);
    window.dispatchEvent(new CustomEvent('samara-role-simulate', { detail: { role: null } }));
    setView('owner');
  };

  const switchToUser = () => {
    setShowPortalDropdown(false);
    setMobileMenuOpen(false);
    setView('user');
  };

  const scrollToSection = (sectionId: string) => {
    setMobileMenuOpen(false);
    if (currentView !== 'user') {
      setView('user');
    }
    setTimeout(() => {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.location.hash = sectionId;
      }
    }, 60);
  };

  const activePortalBadge = (() => {
    if (currentView === 'staff') return { label: 'Staff Admin', cls: 'bg-teal-500/20 text-teal-300 border-teal-500/30' };
    if (currentView === 'owner') return { label: 'Owner Portal', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
    if (currentView === 'admin') {
      if (isAnakOwner || simulatedRole === 'anak_owner') {
        return { label: 'Anak Owner', cls: 'bg-purple-500/20 text-purple-300 border-purple-500/30' };
      }
      return { label: 'Super Admin', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' };
    }
    return { label: 'Website Penyewa', cls: 'bg-white/10 text-slate-200 border-white/15' };
  })();

  return (
    <nav className="sticky top-0 bg-[#3A444D] border-b border-white/10 z-50 text-sm py-2.5 px-4 sm:px-6 lg:px-8 shadow-lg text-white" id="parent-navbar">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 min-h-[44px]">
        
        {/* Left: Brand Identity + Desktop Quick Links */}
        <div className="flex items-center gap-4 xl:gap-7 min-w-0">
          <div className="flex items-center gap-2.5 sm:gap-3 cursor-pointer shrink-0" onClick={switchToUser}>
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white flex items-center justify-center text-[#2E6F40] select-none shadow-md border border-white/10 shrink-0">
              <svg viewBox="0 0 100 100" className="w-6 h-6 sm:w-7 sm:h-7" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M 15 48 Q 50 20 85 48 Z" fill="currentColor" />
                <path d="M 25 50 Q 50 39 75 50 L 75 74 Q 75 78 71 75 L 58 64 Q 50 57 42 64 L 29 75 Q 25 78 25 74 Z" fill="currentColor" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-white font-display text-base sm:text-lg tracking-tight leading-none">SAMARA</span>
                <span className="font-extrabold text-emerald-400 font-display text-base sm:text-lg tracking-tight leading-none">STAY</span>
              </div>
              <p className="text-[9px] sm:text-[10px] text-slate-300 font-medium font-mono uppercase tracking-wider mt-0.5">
                Hunian Eksklusif
              </p>
            </div>
          </div>

          {/* Desktop Quick Menu Links (User View Only) */}
          {currentView === 'user' && (
            <div className="hidden xl:flex items-center gap-4 text-xs font-bold text-slate-200 uppercase tracking-wider pl-2 border-l border-white/10">
              <button 
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('samara-navigate', { detail: { page: 'map' } }));
                }}
                className="hover:text-emerald-400 transition-colors cursor-pointer flex items-center gap-1.5 text-emerald-300 whitespace-nowrap shrink-0"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                Peta & Lokasi
              </button>
              <button 
                onClick={() => scrollToSection('cabang-samara-stay-section')}
                className="hover:text-emerald-400 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Cabang
              </button>
              <button 
                onClick={() => scrollToSection('tentang-section')}
                className="hover:text-emerald-400 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Tentang
              </button>
              <button 
                onClick={() => scrollToSection('faq-section')}
                className="hover:text-emerald-400 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                FAQ
              </button>
              <button 
                onClick={() => scrollToSection('kontak-section')}
                className="hover:text-emerald-400 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Kontak
              </button>
            </div>
          )}
        </div>

        {/* Desktop Right Side Controls (Visible on lg and above) */}
        <div className="hidden lg:flex items-center justify-end gap-2.5 shrink-0">
          
          {/* Credentials and Sandbox status badge */}
          <div className={`px-2.5 py-1 rounded-full text-[10px] font-semibold font-mono hidden xl:flex items-center gap-1.5 border whitespace-nowrap shrink-0 ${
            isSupabaseConfigured 
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
              : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${isSupabaseConfigured ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
            <Database size={11} />
            {isSupabaseConfigured ? 'SUPABASE ACTIVE' : 'SANDBOX'}
          </div>

          <button 
            onClick={handleResetSandbox}
            className="p-1.5 px-2.5 rounded-lg border border-white/10 text-slate-300 hover:bg-white/5 hover:text-white cursor-pointer transition-colors flex items-center gap-1 text-[11px] whitespace-nowrap shrink-0"
            title="Reset data sandboxed kembali ke setelan default pabrikan"
          >
            <RefreshCw size={11} />
            <span className="hidden xl:inline">Reset Data</span>
          </button>

          {/* Strict Role-Based View Navigation Switcher */}
          <div className="bg-white/5 p-1 rounded-xl flex items-center gap-0.5 border border-white/10">
            {/* 1. User Website */}
            <button
              onClick={switchToUser}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                currentView === 'user' 
                  ? 'bg-[#2E6F40] text-white shadow-md' 
                  : 'text-slate-200 hover:text-white hover:bg-white/5'
              }`}
            >
              <Home size={13} />
              <span>User Website</span>
            </button>

            {/* 2. Staff Admin Panel */}
            {(isStaff || isSuper || isAnakOwner || rawRole === 'admin' || currentView === 'staff') && (
              <button
                onClick={switchToStaff}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  currentView === 'staff' 
                    ? 'bg-teal-600 text-white shadow-md shadow-teal-900/40' 
                    : 'text-teal-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <DoorOpen size={13} className={currentView === 'staff' ? 'text-white' : 'text-teal-400'} />
                <span>Staff Admin</span>
              </button>
            )}

            {/* 3. Super Admin Panel */}
            {(isSuper || (!isAnakOwner && simulatedRole !== 'anak_owner' && (rawRole === 'admin' || currentView === 'admin'))) && (
              <button
                onClick={switchToSuperAdmin}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  currentView === 'admin' && simulatedRole !== 'anak_owner' && !isAnakOwner
                    ? 'bg-[#2E6F40] text-white shadow-md' 
                    : 'text-slate-200 hover:text-white hover:bg-white/5'
                }`}
                title="Masuk ke Super Admin Panel (Semua Modul Teknis & Manajemen)"
              >
                <Shield size={13} />
                <span>{isSuper ? 'Admin Panel (Super)' : 'Admin Panel'}</span>
              </button>
            )}

            {/* 3b. Panel Anak Owner */}
            {(isSuper || isAnakOwner || simulatedRole === 'anak_owner' || rawRole === 'admin') && (
              <button
                onClick={switchToAnakOwner}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  currentView === 'admin' && (isAnakOwner || simulatedRole === 'anak_owner')
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40' 
                    : 'text-purple-300 hover:text-white hover:bg-purple-500/10'
                }`}
                title="Panel Anak Owner: Akses Operasional Kamar, Reservasi & Keuangan"
              >
                <UserCheck size={13} className={currentView === 'admin' && (isAnakOwner || simulatedRole === 'anak_owner') ? 'text-white' : 'text-purple-400'} />
                <span>Panel Anak Owner</span>
              </button>
            )}

            {/* 4. Owner Portal */}
            {(isOwner || isSuper || isAnakOwner || currentView === 'owner') && (
              <button
                onClick={switchToOwner}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  currentView === 'owner' 
                    ? 'bg-amber-600 text-white shadow-md shadow-amber-900/40' 
                    : 'text-amber-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <Building2 size={13} className={currentView === 'owner' ? 'text-white' : 'text-amber-400'} />
                <span>Owner Portal</span>
              </button>
            )}

            {/* 5. Portal Selector for Anonymous / Non-Logged In Users */}
            {!user && (
              <div className="relative">
                <button
                  onClick={() => setShowPortalDropdown(!showPortalDropdown)}
                  className="px-2.5 py-1.5 text-xs text-slate-200 hover:text-white hover:bg-white/5 rounded-lg font-semibold flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap shrink-0"
                >
                  <Key size={13} className="text-amber-400" />
                  <span>Pilih Portal Role</span>
                  <ChevronDown size={12} />
                </button>

                {showPortalDropdown && (
                  <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-1.5 z-50 text-xs divide-y divide-white/5">
                    <div className="px-3 py-1.5 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                      Pilihan Portal Operator (Supabase)
                    </div>
                    <div className="py-1">
                      <button
                        onClick={switchToStaff}
                        className="w-full px-3 py-2 text-left text-slate-200 hover:bg-slate-800 hover:text-teal-400 flex items-center justify-between cursor-pointer font-medium"
                      >
                        <div className="flex items-center gap-2">
                          <DoorOpen size={14} className="text-teal-400" />
                          <span>Staff Operasional</span>
                        </div>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 font-mono">staff</span>
                      </button>
                      
                      <button
                        onClick={switchToSuperAdmin}
                        className="w-full px-3 py-2 text-left text-slate-200 hover:bg-slate-800 hover:text-emerald-400 flex items-center justify-between cursor-pointer font-medium"
                      >
                        <div className="flex items-center gap-2">
                          <Shield size={14} className="text-emerald-400" />
                          <span>Super Administrator</span>
                        </div>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">super</span>
                      </button>

                      <button
                        onClick={switchToAnakOwner}
                        className="w-full px-3 py-2 text-left text-purple-200 hover:bg-purple-950/50 hover:text-purple-300 flex items-center justify-between cursor-pointer font-medium"
                      >
                        <div className="flex items-center gap-2">
                          <UserCheck size={14} className="text-purple-400" />
                          <span className="font-bold">Panel Anak Owner</span>
                        </div>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono font-bold">anak_owner</span>
                      </button>

                      <button
                        onClick={switchToOwner}
                        className="w-full px-3 py-2 text-left text-slate-200 hover:bg-slate-800 hover:text-amber-400 flex items-center justify-between cursor-pointer font-medium"
                      >
                        <div className="flex items-center gap-2">
                          <Building2 size={14} className="text-amber-400" />
                          <span>Owner & Investor</span>
                        </div>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">owner</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* User Session Info & Logout Control */}
          {user && (
            <div className="flex items-center gap-2 bg-slate-900/80 border border-white/10 px-2.5 py-1 rounded-xl shrink-0">
              <div className="flex items-center gap-1.5">
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider whitespace-nowrap ${
                  isSuper 
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                    : isAnakOwner
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                    : isOwner 
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                    : isStaff
                    ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                    : 'bg-slate-700 text-slate-300'
                }`}>
                  {isAnakOwner ? 'ANAK OWNER' : isSuper ? 'SUPER ADMIN' : rawRole ? rawRole.toUpperCase() : 'USER'}
                </span>
                <span className="text-[11px] text-slate-300 font-mono hidden 2xl:inline-block max-w-[130px] truncate">
                  {user.email}
                </span>
              </div>

              <button
                onClick={handleLogout}
                className="p-1 px-2 text-[11px] bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/20 rounded-lg cursor-pointer transition-colors flex items-center gap-1 font-semibold whitespace-nowrap"
                title="Keluar Sesi (Logout)"
              >
                <LogOut size={12} />
                <span>Keluar</span>
              </button>
            </div>
          )}

        </div>

        {/* Mobile & Tablet Right Controls (Visible below lg) */}
        <div className="flex lg:hidden items-center gap-2 shrink-0">
          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider border whitespace-nowrap ${activePortalBadge.cls}`}>
            {activePortalBadge.label}
          </span>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 flex items-center justify-center text-white cursor-pointer transition-colors"
            aria-label="Toggle Menu Navigasi"
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

      </div>

      {/* Mobile & Tablet Responsive Drawer Panel (Visible below lg when open) */}
      {mobileMenuOpen && (
        <div className="lg:hidden mt-2.5 pt-3 border-t border-white/10 space-y-3 max-h-[80vh] overflow-y-auto no-scrollbar pb-2">
          
          {/* Quick Website Links when on User View */}
          {currentView === 'user' && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 px-1">
                Menu Navigasi Halaman
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    window.dispatchEvent(new CustomEvent('samara-navigate', { detail: { page: 'map' } }));
                  }}
                  className="min-h-[40px] px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-emerald-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                  <span>Peta & Lokasi</span>
                </button>
                <button
                  onClick={() => scrollToSection('cabang-samara-stay-section')}
                  className="min-h-[40px] px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-bold text-left cursor-pointer"
                >
                  Cabang Kos
                </button>
                <button
                  onClick={() => scrollToSection('tentang-section')}
                  className="min-h-[40px] px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-bold text-left cursor-pointer"
                >
                  Tentang Kami
                </button>
                <button
                  onClick={() => scrollToSection('faq-section')}
                  className="min-h-[40px] px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-bold text-left cursor-pointer"
                >
                  Tanya Jawab (FAQ)
                </button>
                <button
                  onClick={() => scrollToSection('kontak-section')}
                  className="min-h-[40px] px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-bold text-left cursor-pointer col-span-2 sm:col-span-1"
                >
                  Hubungi Kontak
                </button>
              </div>
            </div>
          )}

          {/* Portal Role Switcher Grid */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 px-1 flex items-center justify-between">
              <span>Pilih Tampilan & Portal Operator</span>
              <span className="text-emerald-400 flex items-center gap-1">
                <Database size={10} />
                {isSupabaseConfigured ? 'Supabase Live' : 'Sandbox'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              <button
                onClick={switchToUser}
                className={`min-h-[44px] px-3.5 py-2.5 rounded-xl font-bold text-xs flex items-center justify-between transition-all cursor-pointer border ${
                  currentView === 'user'
                    ? 'bg-[#2E6F40] text-white border-emerald-400/40 shadow-md'
                    : 'bg-white/5 text-slate-200 border-white/10 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Home size={15} />
                  <span>User Website (Penyewa)</span>
                </div>
                <span className="text-[9px] font-mono uppercase px-2 py-0.5 rounded bg-black/25">Publik</span>
              </button>

              <button
                onClick={switchToStaff}
                className={`min-h-[44px] px-3.5 py-2.5 rounded-xl font-bold text-xs flex items-center justify-between transition-all cursor-pointer border ${
                  currentView === 'staff'
                    ? 'bg-teal-600 text-white border-teal-400/40 shadow-md'
                    : 'bg-white/5 text-teal-300 border-white/10 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-2">
                  <DoorOpen size={15} />
                  <span>Portal Staff Admin</span>
                </div>
                <span className="text-[9px] font-mono uppercase px-2 py-0.5 rounded bg-black/25">staff</span>
              </button>

              <button
                onClick={switchToAnakOwner}
                className={`min-h-[44px] px-3.5 py-2.5 rounded-xl font-bold text-xs flex items-center justify-between transition-all cursor-pointer border ${
                  currentView === 'admin' && (isAnakOwner || simulatedRole === 'anak_owner')
                    ? 'bg-purple-600 text-white border-purple-400/40 shadow-md'
                    : 'bg-white/5 text-purple-300 border-white/10 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-2">
                  <UserCheck size={15} />
                  <span>Panel Anak Owner</span>
                </div>
                <span className="text-[9px] font-mono uppercase px-2 py-0.5 rounded bg-black/25">anak_owner</span>
              </button>

              <button
                onClick={switchToOwner}
                className={`min-h-[44px] px-3.5 py-2.5 rounded-xl font-bold text-xs flex items-center justify-between transition-all cursor-pointer border ${
                  currentView === 'owner'
                    ? 'bg-amber-600 text-white border-amber-400/40 shadow-md'
                    : 'bg-white/5 text-amber-300 border-white/10 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Building2 size={15} />
                  <span>Owner & Investor Portal</span>
                </div>
                <span className="text-[9px] font-mono uppercase px-2 py-0.5 rounded bg-black/25">owner</span>
              </button>

              <button
                onClick={switchToSuperAdmin}
                className={`min-h-[44px] px-3.5 py-2.5 rounded-xl font-bold text-xs flex items-center justify-between transition-all cursor-pointer border sm:col-span-2 ${
                  currentView === 'admin' && simulatedRole !== 'anak_owner' && !isAnakOwner
                    ? 'bg-[#2E6F40] text-white border-emerald-400/40 shadow-md'
                    : 'bg-white/5 text-emerald-300 border-white/10 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Shield size={15} />
                  <span>Admin Panel (Super Administrator)</span>
                </div>
                <span className="text-[9px] font-mono uppercase px-2 py-0.5 rounded bg-black/25">super</span>
              </button>
            </div>
          </div>

          {/* Session & Utility Footer Row */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10">
            <button
              onClick={handleResetSandbox}
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-white/10 text-slate-300 hover:bg-white/5 hover:text-white cursor-pointer transition-colors flex items-center gap-1.5 text-xs font-semibold"
            >
              <RefreshCw size={12} />
              <span>Reset Data</span>
            </button>

            {user && (
              <div className="flex items-center gap-2 bg-slate-900/90 border border-white/10 px-3 py-1.5 rounded-xl">
                <div className="text-left">
                  <div className="text-[10px] font-extrabold uppercase text-emerald-400 leading-none">
                    {isAnakOwner ? 'ANAK OWNER' : isSuper ? 'SUPER ADMIN' : rawRole ? rawRole.toUpperCase() : 'USER'}
                  </div>
                  <div className="text-[10px] font-mono text-slate-300 truncate max-w-[150px] mt-0.5">
                    {user.email}
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="min-h-[34px] px-2.5 py-1 text-xs bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 rounded-lg cursor-pointer transition-colors flex items-center gap-1 font-bold"
                >
                  <LogOut size={12} />
                  <span>Keluar</span>
                </button>
              </div>
            )}
          </div>

        </div>
      )}
    </nav>
  );
}
export { Navbar };

