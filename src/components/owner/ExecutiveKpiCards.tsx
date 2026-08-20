import React from 'react';
import { 
  TrendingUp, TrendingDown, Users, BedDouble, 
  Coins, Wallet, Building, ArrowUpRight, CheckCircle2 
} from 'lucide-react';
import { formatRupiah } from '../../utils/formatCurrency';

interface ExecutiveKpiCardsProps {
  grossRevenue: number;
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
  totalExpenses,
  netOperatingIncome,
  distributableDividend,
  totalRooms,
  occupiedRooms,
  occupancyRate,
  avgRevenuePerRoom,
  pendingMidtransClearing
}) => {
  const profitMargin = grossRevenue > 0 ? (netOperatingIncome / grossRevenue) * 100 : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
      
      {/* 1. Gross Revenue / Total Omzet */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm relative overflow-hidden flex flex-col justify-between group hover:shadow-md transition-all">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">
            Total Omzet Pendapatan
          </span>
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
            <TrendingUp size={18} />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-extrabold text-slate-900 font-display tracking-tight">
            {formatRupiah(grossRevenue)}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-500">
            <span className="text-emerald-600 font-bold flex items-center">
              <ArrowUpRight size={13} />
              Sewa & DP
            </span>
            <span>• Seluruh transaksi masuk</span>
          </div>
        </div>
      </div>

      {/* 2. Portfolio Occupancy Rate */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm relative overflow-hidden flex flex-col justify-between group hover:shadow-md transition-all">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">
            Tingkat Okupansi Kamar
          </span>
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
            <BedDouble size={18} />
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-slate-900 font-display tracking-tight">
              {occupancyRate.toFixed(1)}%
            </span>
            <span className="text-xs font-semibold text-slate-500">
              ({occupiedRooms}/{totalRooms} Unit Terisi)
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
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm relative overflow-hidden flex flex-col justify-between group hover:shadow-md transition-all">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">
            Laba Bersih Operasional (NOI)
          </span>
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
            <Coins size={18} />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-extrabold text-emerald-600 font-display tracking-tight">
            {formatRupiah(netOperatingIncome)}
          </div>
          <div className="flex items-center justify-between mt-2 text-xs">
            <span className="text-slate-500">Beban: {formatRupiah(totalExpenses)}</span>
            <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
              Margin {profitMargin.toFixed(0)}%
            </span>
          </div>
        </div>
      </div>

      {/* 4. Distributable Cash / Dividen Estimasi */}
      <div className="bg-gradient-to-br from-[#2E6F40] to-[#1E4D2B] text-white rounded-2xl p-5 shadow-lg shadow-emerald-900/20 relative overflow-hidden flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-emerald-200 uppercase tracking-wider font-mono">
            Dana Siap Bagi Hasil / Dividen
          </span>
          <div className="w-9 h-9 rounded-xl bg-white/10 text-emerald-300 flex items-center justify-center backdrop-blur-sm border border-white/10">
            <Wallet size={18} />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-black text-white font-display tracking-tight">
            {formatRupiah(distributableDividend)}
          </div>
          <div className="flex items-center justify-between mt-2 text-xs text-emerald-100/90 font-medium">
            <span>Kliring Midtrans: {formatRupiah(pendingMidtransClearing)}</span>
            <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded font-mono font-bold text-white">
              Cair Otomatis
            </span>
          </div>
        </div>
      </div>

    </div>
  );
};
