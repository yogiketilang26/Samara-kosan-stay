import React from 'react';
import { Home, Shield, RefreshCw, Database } from 'lucide-react';
import { isSupabaseConfigured, database } from '../../lib/supabase';

interface NavbarProps {
  currentView: 'user' | 'admin';
  setView: (view: 'user' | 'admin') => void;
  onRefresh: () => void;
}

export default function Navbar({ currentView, setView, onRefresh }: NavbarProps) {
  const handleResetSandbox = () => {
    if (window.confirm("Ingin me-reset ulang data sandbox ke stelan default bawaan? Semua data transaksi percobaan saat ini akan dibersihkan.")) {
      database.resetPlayground();
      onRefresh();
    }
  };

  return (
    <nav className="sticky top-0 bg-[#3A444D] border-b border-white/10 z-50 text-sm py-3 px-4 md:px-8 shadow-lg text-white" id="parent-navbar">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        
        {/* Brand identity */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#2E6F40] flex items-center justify-center text-white font-extrabold text-lg font-display select-none shadow-md">
            SS
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-white font-display text-lg tracking-tight">SAMARA</span>
              <span className="font-extrabold text-emerald-400 font-display text-lg tracking-tight">STAY</span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium font-mono uppercase tracking-wider">Premium Kosan Ecosystem</p>
          </div>
        </div>

        {/* Credentials and Sandbox status info badges */}
        <div className="flex flex-wrap items-center justify-center gap-3">
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
        </div>

        {/* View Switcher Controls (Stunning premium interface) */}
        <div className="bg-white/5 p-1 rounded-xl flex items-center border border-white/10">
          <button
            onClick={() => setView('user')}
            className={`px-4 py-1.5 rounded-lg font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
              currentView === 'user' 
                ? 'bg-[#2E6F40] text-white shadow-lg' 
                : 'text-slate-200 hover:text-white hover:bg-white/5'
            }`}
          >
            <Home size={14} />
            User Website
          </button>
          <button
            onClick={() => setView('admin')}
            className={`px-4 py-1.5 rounded-lg font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
              currentView === 'admin' 
                ? 'bg-[#2E6F40] text-white shadow-lg' 
                : 'text-slate-200 hover:text-white hover:bg-white/5'
            }`}
          >
            <Shield size={14} />
            Admin Panel
          </button>
        </div>

      </div>
    </nav>
  );
}
export { Navbar };
