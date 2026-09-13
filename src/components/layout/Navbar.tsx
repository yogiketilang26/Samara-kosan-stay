import React, { useState } from 'react';
import { Home, Shield, RefreshCw, Database, Building2, LogOut, Key, UserCheck, ChevronDown, DoorOpen } from 'lucide-react';
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

  const rawRole = (user?.raw_role || user?.role || '').trim().toLowerCase();
  const isSuper = Boolean(user && (rawRole === 'super' || rawRole === 'super_admin'));
  const isOwner = Boolean(user && rawRole === 'owner');
  const isStaff = Boolean(user && rawRole === 'staff');

  const handleResetSandbox = () => {
    if (window.confirm("Ingin me-reset ulang data sandbox ke stelan default bawaan? Semua data transaksi percobaan saat ini akan dibersihkan.")) {
      database.resetPlayground();
      onRefresh();
    }
  };

  const handleLogout = async () => {
    await logout();
    if (currentView !== 'user') {
      setView('user');
    }
  };

  return (
    <nav className="sticky top-0 bg-[#3A444D] border-b border-white/10 z-50 text-sm py-3 px-4 md:px-8 shadow-lg text-white" id="parent-navbar">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Brand identity */}
        <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8 w-full md:w-auto">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('user')}>
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-[#2E6F40] select-none shadow-md border border-white/10">
              <svg viewBox="0 0 100 100" className="w-7 h-7" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Top roof part */}
                <path d="M 15 48 Q 50 20 85 48 Z" fill="currentColor" />
                {/* Lower base part */}
                <path d="M 25 50 Q 50 39 75 50 L 75 74 Q 75 78 71 75 L 58 64 Q 50 57 42 64 L 29 75 Q 25 78 25 74 Z" fill="currentColor" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-white font-display text-lg tracking-tight">SAMARA</span>
                <span className="font-extrabold text-emerald-400 font-display text-lg tracking-tight">STAY</span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium font-mono uppercase tracking-wider">Hunian Eksklusif Premium</p>
            </div>
          </div>

          {/* Quick Menu Links (User View Only) */}
          {currentView === 'user' && (
            <div className="flex items-center gap-4 md:gap-5 text-xs font-bold text-slate-200 uppercase tracking-wider pl-1 md:pl-2">
              <button 
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('samara-navigate', { detail: { page: 'map' } }));
                }}
                className="hover:text-emerald-400 transition-colors cursor-pointer flex items-center gap-1 text-emerald-300"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                Peta & Lokasi
              </button>
              <button 
                onClick={() => {
                  const el = document.getElementById('cabang-samara-stay-section');
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  } else {
                    window.location.hash = 'cabang-samara-stay-section';
                  }
                }}
                className="hover:text-emerald-400 transition-colors cursor-pointer"
              >
                Cabang
              </button>
              <button 
                onClick={() => {
                  const el = document.getElementById('tentang-section');
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  } else {
                    window.location.hash = 'tentang-section';
                  }
                }}
                className="hover:text-emerald-400 transition-colors cursor-pointer"
              >
                Tentang
              </button>
              <button 
                onClick={() => {
                  const el = document.getElementById('faq-section');
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  } else {
                    window.location.hash = 'faq-section';
                  }
                }}
                className="hover:text-emerald-400 transition-colors cursor-pointer"
              >
                FAQ
              </button>
              <button 
                onClick={() => {
                  const el = document.getElementById('kontak-section');
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  } else {
                    window.location.hash = 'kontak-section';
                  }
                }}
                className="hover:text-emerald-400 transition-colors cursor-pointer"
              >
                Kontak
              </button>
            </div>
          )}
        </div>

        {/* Right side controls: DB Status, RBAC View Switchers & Session Controls */}
        <div className="flex flex-wrap items-center justify-end gap-3">
          
          {/* Credentials and Sandbox status badge */}
          <div className={`px-2.5 py-1 rounded-full text-[11px] font-semibold font-mono flex items-center gap-1.5 border ${
            isSupabaseConfigured 
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
              : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
          }`}>
            <div className={`w-2 h-2 rounded-full ${isSupabaseConfigured ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
            <Database size={12} />
            {isSupabaseConfigured ? 'SUPABASE ACTIVE' : 'SANDBOX SIMULATOR'}
          </div>

          <button 
            onClick={handleResetSandbox}
            className="p-1 px-2.5 rounded-lg border border-white/10 text-slate-400 hover:bg-white/5 hover:text-white cursor-pointer transition-colors flex items-center gap-1 text-xs"
            title="Reset data sandboxed kembali ke setelan default pabrikan"
          >
            <RefreshCw size={11} />
            Reset Data
          </button>

          {/* Strict Role-Based View Navigation Switcher */}
          <div className="bg-white/5 p-1 rounded-xl flex items-center border border-white/10">
            {/* 1. User Website (Always accessible to all) */}
            <button
              onClick={() => setView('user')}
              className={`px-3 sm:px-4 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 sm:gap-2 transition-all cursor-pointer ${
                currentView === 'user' 
                  ? 'bg-[#2E6F40] text-white shadow-lg' 
                  : 'text-slate-200 hover:text-white hover:bg-white/5'
              }`}
            >
              <Home size={14} />
              User Website
            </button>

            {/* 2. Staff Admin Panel (Dedicated Operational View) */}
            {(isStaff || isSuper || rawRole === 'admin' || currentView === 'staff') && (
              <button
                onClick={() => setView('staff')}
                className={`px-3 sm:px-4 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 sm:gap-2 transition-all cursor-pointer ${
                  currentView === 'staff' 
                    ? 'bg-teal-600 text-white shadow-lg shadow-teal-900/40' 
                    : 'text-teal-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <DoorOpen size={14} className="text-teal-400" />
                Staff Admin
              </button>
            )}

            {/* 3. Super Admin Panel (Strictly shown ONLY for super/admin role or when active) */}
            {(isSuper || rawRole === 'admin' || currentView === 'admin') && (
              <button
                onClick={() => setView('admin')}
                className={`px-3 sm:px-4 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 sm:gap-2 transition-all cursor-pointer ${
                  currentView === 'admin' 
                    ? 'bg-[#2E6F40] text-white shadow-lg' 
                    : 'text-slate-200 hover:text-white hover:bg-white/5'
                }`}
              >
                <Shield size={14} />
                Admin Panel
              </button>
            )}

            {/* 4. Owner Portal (Strictly shown for owner role, super admin, or when active) */}
            {(isOwner || isSuper || currentView === 'owner') && (
              <button
                onClick={() => setView('owner')}
                className={`px-3 sm:px-4 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 sm:gap-2 transition-all cursor-pointer ${
                  currentView === 'owner' 
                    ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/40' 
                    : 'text-amber-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <Building2 size={14} className="text-amber-400" />
                Owner Portal
              </button>
            )}

            {/* 5. Portal Selector for Anonymous / Non-Logged In Users */}
            {!user && currentView === 'user' && (
              <div className="relative">
                <button
                  onClick={() => setShowPortalDropdown(!showPortalDropdown)}
                  className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-white/5 rounded-lg font-medium flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Key size={13} className="text-amber-400" />
                  <span>Portal Operator</span>
                  <ChevronDown size={12} />
                </button>

                {showPortalDropdown && (
                  <div className="absolute right-0 mt-2 w-52 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-1.5 z-50 text-xs">
                    <button
                      onClick={() => {
                        setShowPortalDropdown(false);
                        setView('staff');
                      }}
                      className="w-full px-3 py-2 text-left text-slate-200 hover:bg-slate-800 hover:text-teal-400 flex items-center gap-2 cursor-pointer font-medium"
                    >
                      <DoorOpen size={14} className="text-teal-400" />
                      <span>Masuk Staff Admin</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowPortalDropdown(false);
                        setView('admin');
                      }}
                      className="w-full px-3 py-2 text-left text-slate-200 hover:bg-slate-800 hover:text-emerald-400 flex items-center gap-2 cursor-pointer font-medium"
                    >
                      <Shield size={14} className="text-emerald-400" />
                      <span>Masuk Admin Panel</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowPortalDropdown(false);
                        setView('owner');
                      }}
                      className="w-full px-3 py-2 text-left text-slate-200 hover:bg-slate-800 hover:text-amber-400 flex items-center gap-2 cursor-pointer font-medium"
                    >
                      <Building2 size={14} className="text-amber-400" />
                      <span>Masuk Owner Portal</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* User Session Info & Logout Control */}
          {user && (
            <div className="flex items-center gap-2 bg-slate-900/80 border border-white/10 px-2.5 py-1 rounded-xl">
              <div className="flex items-center gap-1.5">
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                  isSuper 
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                    : isOwner 
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                    : 'bg-slate-700 text-slate-300'
                }`}>
                  {rawRole ? rawRole.toUpperCase() : 'USER'}
                </span>
                <span className="text-[11px] text-slate-300 font-mono hidden xl:inline-block max-w-[140px] truncate">
                  {user.email}
                </span>
              </div>

              <button
                onClick={handleLogout}
                className="p-1 px-2 text-[11px] bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/20 rounded-lg cursor-pointer transition-colors flex items-center gap-1 font-semibold"
                title="Keluar Sesi (Logout)"
              >
                <LogOut size={12} />
                <span>Keluar</span>
              </button>
            </div>
          )}

        </div>

      </div>
    </nav>
  );
}
export { Navbar };
