import React from 'react';
import { 
  TrendingUp, TrendingDown, Users, BedDouble, 
  Coins, Wallet, Building, ArrowUpRight, CheckCircle2 
} from 'lucide-react';
import { formatRupiah } from '../../utils/formatCurrency';

interface ExecutiveKpiCardsProps {
  grossRevenue: number; // Realized cash inflow (Rp 189.825.000)
  totalContractRevenue?: number; // Total contract pipeline (Rp 262.655.000)
  totalExpenses: number;
  netOperatingIncome: number;
  distributableDividend: number;
  totalRooms: number;
  occupiedRooms: number;
  occupancyRate: number;
  avgRevenuePerRoom: number;
  pendingMidtransClearing: number;
}

export const ExecutiveKpiCards: React.FC<ExecutiveKpiCardsProps> = ({
  grossRevenue,
  totalContractRevenue,
  totalExpenses,
  netOperatingIncome,
  distributableDividend,
  totalRooms,
  occupiedRooms,
  occupancyRate,
  avgRevenuePerRoom,
  pendingMidtransClearing
}) => {
  const profitMargin = grossRevenue > 0 ? (netOperatingIncome / grossRevenue) * 100 : (totalExpenses === 0 ? 100 : 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
      
      {/* 1. Gross Revenue / Total Inflow */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-sm relative overflow-hidden min-w-0 flex flex-col justify-between group hover:shadow-md transition-all">
        <div className="flex items-start justify-between gap-2 min-w-0">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono leading-snug min-w-0 break-words">
            Total Pendapatan (Inflow)
          </span>
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shrink-0">
            <TrendingUp size={18} />
          </div>
        </div>
        <div className="mt-3 min-w-0">
          <div className="text-lg sm:text-xl xl:text-2xl font-extrabold text-slate-900 font-display tracking-tight tabular-nums break-words leading-tight">
            {formatRupiah(grossRevenue)}
          </div>
          <div className="flex flex-col gap-0.5 mt-2 text-xs text-slate-500 min-w-0">
            <div className="flex items-center justify-between gap-1 min-w-0">
              <span className="text-emerald-600 font-bold flex items-center gap-0.5 text-[11px] truncate">
                <ArrowUpRight size={12} className="shrink-0" />
                <span className="truncate">Arus Kas Masuk Real-Time</span>
              </span>
            </div>
            {totalContractRevenue && totalContractRevenue > 0 ? (
              <span className="text-[10px] text-slate-400 font-mono tabular-nums break-words">
                Akumulasi Kontrak: {formatRupiah(totalContractRevenue)}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* 2. Portfolio Occupancy Rate */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-sm relative overflow-hidden min-w-0 flex flex-col justify-between group hover:shadow-md transition-all">
        <div className="flex items-start justify-between gap-2 min-w-0">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono leading-snug min-w-0 break-words">
            Tingkat Okupansi Kamar
          </span>
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shrink-0">
            <BedDouble size={18} />
          </div>
        </div>
        <div className="mt-3 min-w-0">
          <div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5 min-w-0">
            <span className="text-lg sm:text-xl xl:text-2xl font-extrabold text-slate-900 font-display tracking-tight tabular-nums">
              {Math.round(occupancyRate)}%
            </span>
            <span className="text-[11px] font-semibold text-slate-500 tabular-nums break-words">
              ({occupiedRooms} terisi dari {totalRooms} unit)
            </span>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-slate-100 h-2 rounded-full mt-2.5 overflow-hidden">
            <div 
              className="bg-blue-600 h-full rounded-full transition-all duration-500" 
              style={{ width: `${Math.min(100, Math.max(0, occupancyRate))}%` }}
            />
          </div>
        </div>
      </div>

      {/* 3. Net Operating Income (NOI) */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-sm relative overflow-hidden min-w-0 flex flex-col justify-between group hover:shadow-md transition-all">
        <div className="flex items-start justify-between gap-2 min-w-0">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono leading-snug min-w-0 break-words">
            Laba Bersih Operasional (NOI)
          </span>
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100 shrink-0">
            <Coins size={18} />
          </div>
        </div>
        <div className="mt-3 min-w-0">
          <div className="text-lg sm:text-xl xl:text-2xl font-extrabold text-emerald-600 font-display tracking-tight tabular-nums break-words leading-tight">
            {formatRupiah(netOperatingIncome)}
          </div>
          <div className="flex items-center justify-between flex-wrap gap-1.5 mt-2 text-xs min-w-0">
            <span className="text-slate-500 text-[11px] tabular-nums break-words min-w-0">Beban: {formatRupiah(totalExpenses)}</span>
            <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md text-[10px] tabular-nums shrink-0">
              Marjin {profitMargin.toFixed(0)}%
            </span>
          </div>
        </div>
      </div>

      {/* 4. Distributable Cash / Dividen Estimasi */}
      <div className="bg-gradient-to-br from-[#2E6F40] to-[#1E4D2B] text-white rounded-2xl p-4 sm:p-5 shadow-lg shadow-emerald-900/20 relative overflow-hidden min-w-0 flex flex-col justify-between">
        <div className="flex items-start justify-between gap-2 min-w-0">
          <span className="text-[11px] font-bold text-emerald-200 uppercase tracking-wider font-mono leading-snug min-w-0 break-words">
            Dana Siap Bagi Hasil / Dividen
          </span>
          <div className="w-9 h-9 rounded-xl bg-white/10 text-emerald-300 flex items-center justify-center backdrop-blur-sm border border-white/10 shrink-0">
            <Wallet size={18} />
          </div>
        </div>
        <div className="mt-3 min-w-0">
          <div className="text-lg sm:text-xl xl:text-2xl font-black text-white font-display tracking-tight tabular-nums break-words leading-tight">
            {formatRupiah(distributableDividend)}
          </div>
          <div className="flex items-center justify-between flex-wrap gap-1.5 mt-2 text-[11px] text-emerald-100/90 font-medium min-w-0">
            <span className="tabular-nums break-words min-w-0">Kliring Midtrans: {formatRupiah(pendingMidtransClearing)}</span>
            <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded font-mono font-bold text-white shrink-0">
              Cair Otomatis
            </span>
          </div>
        </div>
      </div>

    </div>
  );
};
