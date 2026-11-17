import React from 'react';
import { Building2, Calendar, RefreshCw, Printer, Download, Sparkles, Filter, PenTool, ShieldCheck } from 'lucide-react';
import { Property } from '../../types';
import { FinancialReportPeriod } from '../../lib/financialMetrics';

interface OwnerHeaderProps {
  properties: Property[];
  selectedPropertyId: string;
  onSelectProperty: (id: string) => void;
  selectedPeriod: FinancialReportPeriod;
  onSelectPeriod: (period: FinancialReportPeriod) => void;
  onRefresh: () => void;
  isLoading: boolean;
  onPrint: () => void;
  onOpenSignatureTab?: () => void;
  pendingSignatureCount?: number;
}

export const OwnerHeader: React.FC<OwnerHeaderProps> = ({
  properties,
  selectedPropertyId,
  onSelectProperty,
  selectedPeriod,
  onSelectPeriod,
  onRefresh,
  isLoading,
  onPrint,
  onOpenSignatureTab,
  pendingSignatureCount = 0
}) => {
  return (
    <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border-b border-slate-800 text-white px-4 py-5 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
        
        {/* Title & Badge */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1 whitespace-nowrap">
              <Sparkles size={11} className="text-amber-400" />
              Executive Investor Portal
            </span>
            <span className="text-[11px] sm:text-xs text-slate-400 font-mono flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block shrink-0"></span>
              <span>Live Realtime Supabase & MailerSend</span>
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-black font-display tracking-tight text-white flex items-center gap-2.5">
            <Building2 className="text-emerald-400 shrink-0" size={26} />
            <span>Dashboard Pemilik & Investor</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Pantau performa portofolio properti, arus kas masuk dari Midtrans, rasio okupansi kamar, dan pengesahan tanda tangan digital kontrak sewa.
          </p>
        </div>

        {/* Filters & Actions */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2.5 w-full lg:w-auto">
          
          {/* Property Selector */}
          <div className="relative col-span-2 sm:col-span-1 sm:w-auto">
            <select
              value={selectedPropertyId}
              onChange={(e) => onSelectProperty(e.target.value)}
              className="w-full sm:w-auto bg-slate-800/90 text-white border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:outline-none focus:border-emerald-500 pr-8 appearance-none cursor-pointer hover:bg-slate-750 transition-colors shadow-inner"
            >
              <option value="all">🏢 Semua Cabang ({properties.length} Properti)</option>
              {properties.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  📍 {p.name}
                </option>
              ))}
            </select>
            <Filter size={12} className="absolute right-3 top-3.5 text-slate-400 pointer-events-none" />
          </div>

          {/* Period Selector */}
          <div className="relative col-span-2 sm:col-span-1 sm:w-auto">
            <select
              value={selectedPeriod}
              onChange={(e) => onSelectPeriod(e.target.value as FinancialReportPeriod)}
              className="w-full sm:w-auto bg-slate-800/90 text-white border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:outline-none focus:border-emerald-500 pr-8 appearance-none cursor-pointer hover:bg-slate-750 transition-colors shadow-inner"
            >
              <option value="all">♾️ Semua Periode (Akumulasi)</option>
              <option value="this_month">📅 Bulan Ini (M-T-D)</option>
              <option value="last_month">📅 Bulan Lalu</option>
              <option value="this_quarter">📊 Kuartal Ini (QTD)</option>
              <option value="ytd">📈 Tahun Berjalan (YTD)</option>
            </select>
            <Calendar size={12} className="absolute right-3 top-3.5 text-slate-400 pointer-events-none" />
          </div>

          {/* TTD Owner Quick Shortcut */}
          {onOpenSignatureTab && (
            <button
              onClick={onOpenSignatureTab}
              className="col-span-2 sm:col-span-1 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-emerald-400 hover:text-emerald-300 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-inner relative whitespace-nowrap shrink-0"
              title="Buka Menu Tanda Tangan Digital & Pengesahan Dokumen"
            >
              <PenTool size={13} className="shrink-0" />
              <span>TTD Digital Owner</span>
              {pendingSignatureCount > 0 && (
                <span className="px-1.5 py-0.2 bg-amber-500 text-slate-950 font-black rounded-full text-[9px] animate-pulse">
                  {pendingSignatureCount}
                </span>
              )}
            </button>
          )}

          {/* Refresh Button */}
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
            title="Refresh data dari Supabase"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin text-emerald-400' : ''} />
            <span>Sinkronisasi</span>
          </button>

          {/* Print / Export Report */}
          <button
            onClick={onPrint}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30 cursor-pointer whitespace-nowrap shrink-0"
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
