import React from 'react';
import { Building2, Calendar, RefreshCw, Printer, Download, Sparkles, Filter } from 'lucide-react';
import { Property } from '../../types';

interface OwnerHeaderProps {
  properties: Property[];
  selectedPropertyId: string;
  onSelectProperty: (id: string) => void;
  selectedPeriod: 'this_month' | 'last_month' | 'this_quarter' | 'ytd';
  onSelectPeriod: (period: 'this_month' | 'last_month' | 'this_quarter' | 'ytd') => void;
  onRefresh: () => void;
  isLoading: boolean;
  onPrint: () => void;
}

export const OwnerHeader: React.FC<OwnerHeaderProps> = ({
  properties,
  selectedPropertyId,
  onSelectProperty,
  selectedPeriod,
  onSelectPeriod,
  onRefresh,
  isLoading,
  onPrint
}) => {
  return (
    <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border-b border-slate-800 text-white p-6 md:p-8">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        
        {/* Title & Badge */}
        <div>
          <div className="flex items-center gap-2.5 mb-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
              <Sparkles size={11} className="text-amber-400" />
              Executive Investor Portal
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Live Realtime Data
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black font-display tracking-tight text-white flex items-center gap-3">
            <Building2 className="text-emerald-400" size={28} />
            Dashboard Pemilik & Investor
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Pantau performa portofolio properti, arus kas masuk dari Midtrans, rasio okupansi kamar, dan kalkulasi bagi hasil/dividen secara transparan.
          </p>
        </div>

        {/* Filters & Actions */}
        <div className="flex flex-wrap items-center gap-3">
          
          {/* Property Selector */}
          <div className="relative">
            <select
              value={selectedPropertyId}
              onChange={(e) => onSelectProperty(e.target.value)}
              className="bg-slate-800/90 text-white border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:outline-none focus:border-emerald-500 pr-8 appearance-none cursor-pointer hover:bg-slate-750 transition-colors shadow-inner"
            >
              <option value="all">🏢 Semua Cabang ({properties.length} Properti)</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  📍 {p.name}
                </option>
              ))}
            </select>
            <Filter size={12} className="absolute right-3 top-3.5 text-slate-400 pointer-events-none" />
          </div>

          {/* Period Selector */}
          <div className="relative">
            <select
              value={selectedPeriod}
              onChange={(e) => onSelectPeriod(e.target.value as any)}
              className="bg-slate-800/90 text-white border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:outline-none focus:border-emerald-500 pr-8 appearance-none cursor-pointer hover:bg-slate-750 transition-colors shadow-inner"
            >
              <option value="this_month">📅 Bulan Ini (M-T-D)</option>
              <option value="last_month">📅 Bulan Lalu</option>
              <option value="this_quarter">📊 Kuartal Ini (QTD)</option>
              <option value="ytd">📈 Tahun Berjalan (YTD)</option>
            </select>
            <Calendar size={12} className="absolute right-3 top-3.5 text-slate-400 pointer-events-none" />
          </div>

          {/* Refresh Button */}
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Refresh data dari Supabase"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin text-emerald-400' : ''} />
            <span className="hidden sm:inline">Sinkronisasi</span>
          </button>

          {/* Print / Export Report */}
          <button
            onClick={onPrint}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-emerald-900/30 cursor-pointer"
            title="Cetak atau unduh laporan eksekutif pemilik"
          >
            <Printer size={14} />
            <span>Cetak Laporan</span>
          </button>

        </div>

      </div>
    </div>
  );
};
