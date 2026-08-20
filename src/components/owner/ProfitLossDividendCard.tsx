import React, { useState } from 'react';
import { 
  Scale, PieChart as PieIcon, ArrowDownRight, ArrowUpRight, 
  Coins, Wallet, Percent, Download, Calculator, Check 
} from 'lucide-react';
import { formatRupiah } from '../../utils/formatCurrency';
import { AccountCOA } from '../../types';

interface ProfitLossDividendCardProps {
  accounts: AccountCOA[];
  grossRevenue: number;
  totalExpenses: number;
  netOperatingIncome: number;
  revenueBreakdown: { name: string; amount: number; code: string }[];
  expenseBreakdown: { name: string; amount: number; code: string }[];
}

export const ProfitLossDividendCard: React.FC<ProfitLossDividendCardProps> = ({
  accounts,
  grossRevenue,
  totalExpenses,
  netOperatingIncome,
  revenueBreakdown,
  expenseBreakdown
}) => {
  const [dividendPayoutRatio, setDividendPayoutRatio] = useState<number>(85); // 85% dividend, 15% retained reserve
  
  const dividendPool = Math.max(0, netOperatingIncome * (dividendPayoutRatio / 100));
  const retainedReserve = Math.max(0, netOperatingIncome - dividendPool);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-6">
      
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
            <Scale size={18} />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-900 font-display">
              Laporan Laba Rugi & Alokasi Dividen
            </h2>
            <p className="text-xs text-slate-500">
              Kalkulasi laba komprehensif dari Chart of Accounts (COA) resmi Supabase
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[10px] font-mono uppercase text-slate-400 font-bold block">
            Net Profit Margin
          </span>
          <span className="text-base font-black text-emerald-600 font-display">
            {grossRevenue > 0 ? ((netOperatingIncome / grossRevenue) * 100).toFixed(1) : '0'}%
          </span>
        </div>
      </div>

      {/* 2-Column P&L Table (Revenue vs Expense) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Revenue Column */}
        <div className="bg-slate-50/70 rounded-2xl p-5 border border-slate-100 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200/70 pb-2.5">
            <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-xs">
              <ArrowUpRight size={15} />
              <span>PENDAPATAN USAHA (REVENUE)</span>
            </div>
            <span className="text-xs font-black text-slate-900 font-display">
              {formatRupiah(grossRevenue)}
            </span>
          </div>

          <div className="space-y-2">
            {revenueBreakdown.map((rev) => (
              <div key={rev.code} className="flex items-center justify-between text-xs py-1">
                <div className="flex items-center gap-2 text-slate-600">
                  <span className="font-mono text-[10px] bg-slate-200/80 px-1.5 py-0.5 rounded text-slate-700 font-semibold">
                    {rev.code}
                  </span>
                  <span>{rev.name}</span>
                </div>
                <span className="font-semibold text-slate-800">
                  {formatRupiah(rev.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Expense Column */}
        <div className="bg-slate-50/70 rounded-2xl p-5 border border-slate-100 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200/70 pb-2.5">
            <div className="flex items-center gap-1.5 text-amber-700 font-bold text-xs">
              <ArrowDownRight size={15} />
              <span>BEBAN OPERASIONAL (EXPENSES)</span>
            </div>
            <span className="text-xs font-black text-amber-900 font-display">
              {formatRupiah(totalExpenses)}
            </span>
          </div>

          <div className="space-y-2">
            {expenseBreakdown.map((exp) => (
              <div key={exp.code} className="flex items-center justify-between text-xs py-1">
                <div className="flex items-center gap-2 text-slate-600">
                  <span className="font-mono text-[10px] bg-amber-100/70 px-1.5 py-0.5 rounded text-amber-800 font-semibold">
                    {exp.code}
                  </span>
                  <span className="line-clamp-1">{exp.name}</span>
                </div>
                <span className="font-semibold text-slate-800">
                  {formatRupiah(exp.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Interactive Dividend & Yield Simulator */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-850 to-slate-900 text-white rounded-2xl p-6 border border-slate-800 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <Calculator size={16} />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-white font-display">
                Simulasi Pembagian Dividen / Hasil Bersih
              </h3>
              <p className="text-xs text-slate-400">
                Atur rasio payout hasil bersih untuk distribusi dividen bulanan pemilik
              </p>
            </div>
          </div>

          {/* Slider Ratio */}
          <div className="flex items-center gap-3 bg-slate-800 px-4 py-2 rounded-xl border border-slate-700">
            <span className="text-xs text-slate-300 font-mono">Rasio Payout:</span>
            <input 
              type="range"
              min="50"
              max="100"
              step="5"
              value={dividendPayoutRatio}
              onChange={(e) => setDividendPayoutRatio(Number(e.target.value))}
              className="w-24 accent-emerald-500 cursor-pointer"
            />
            <span className="text-xs font-black text-emerald-400 font-mono w-10 text-right">
              {dividendPayoutRatio}%
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          
          <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700/80">
            <span className="text-[10px] text-slate-400 font-mono uppercase font-bold block">
              Laba Bersih Operasional (100%)
            </span>
            <div className="text-lg font-black text-white mt-1 font-display">
              {formatRupiah(netOperatingIncome)}
            </div>
          </div>

          <div className="bg-emerald-950/40 rounded-xl p-4 border border-emerald-500/30">
            <span className="text-[10px] text-emerald-300 font-mono uppercase font-bold block">
              Distribusi Dividen Pemilik ({dividendPayoutRatio}%)
            </span>
            <div className="text-lg font-black text-emerald-400 mt-1 font-display">
              {formatRupiah(dividendPool)}
            </div>
          </div>

          <div className="bg-blue-950/40 rounded-xl p-4 border border-blue-500/30">
            <span className="text-[10px] text-blue-300 font-mono uppercase font-bold block">
              Cadangan Kas / Retained ({100 - dividendPayoutRatio}%)
            </span>
            <div className="text-lg font-black text-blue-400 mt-1 font-display">
              {formatRupiah(retainedReserve)}
            </div>
          </div>

        </div>
      </div>

    </div>
  );
};
