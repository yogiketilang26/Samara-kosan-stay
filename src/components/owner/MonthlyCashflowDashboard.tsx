import React, { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  ShieldCheck,
  Calendar,
  Building2,
  Activity,
  Table
} from 'lucide-react';
import { FinancialTransaction, PaymentInvoice, Booking, Property } from '../../types';
import { formatRupiah } from '../../utils/formatCurrency';

export interface MonthlyCashflowDashboardProps {
  transactions: FinancialTransaction[];
  payments?: PaymentInvoice[];
  bookings?: Booking[];
  properties?: Property[];
  selectedPropertyId?: string;
  grossRevenue?: number;
  totalExpenses?: number;
  theme?: 'light' | 'dark';
}

interface MonthlyDataPoint {
  monthKey: string; // YYYY-MM
  label: string; // e.g. 'Mei 26'
  fullLabel: string; // e.g. 'Mei 2026'
  pemasukan: number;
  pengeluaran: number;
  arusKasBersih: number;
  marginPercent: number;
  txCount: number;
}

const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MONTH_NAMES_FULL = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const formatCompactRupiah = (value: number): string => {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000_000) {
    return `${sign}Rp ${(abs / 1_000_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000_000) {
    return `${sign}Rp ${(abs / 1_000_000).toFixed(1)}Jt`;
  }
  if (abs >= 1_000) {
    return `${sign}Rp ${(abs / 1_000).toFixed(0)}Rb`;
  }
  return `${sign}Rp ${abs}`;
};

export const MonthlyCashflowDashboard: React.FC<MonthlyCashflowDashboardProps> = ({
  transactions = [],
  payments = [],
  bookings = [],
  properties = [],
  selectedPropertyId = 'all',
  grossRevenue = 0,
  totalExpenses = 0,
  theme = 'light'
}) => {
  const [rangeMonths, setRangeMonths] = useState<6 | 12>(6);
  const [showNetBar, setShowNetBar] = useState<boolean>(true);
  const [showTableDetail, setShowTableDetail] = useState<boolean>(false);

  const isDark = theme === 'dark';

  const activePropertyName = useMemo(() => {
    if (!selectedPropertyId || selectedPropertyId === 'all') return 'Seluruh Portofolio Samara Stay';
    const found = properties.find(p => String(p.id) === String(selectedPropertyId));
    return found ? found.name : 'Cabang Terpilih';
  }, [properties, selectedPropertyId]);

  // Build monthly series from real Supabase transactions, payments & bookings
  const monthlySeries = useMemo<MonthlyDataPoint[]>(() => {
    const now = new Date();
    // Anchor to current year & month
    const buckets = new Map<string, { pemasukan: number; pengeluaran: number; txCount: number; year: number; monthIdx: number }>();

    for (let i = rangeMonths - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const key = `${y}-${String(m + 1).padStart(2, '0')}`;
      buckets.set(key, { pemasukan: 0, pengeluaran: 0, txCount: 0, year: y, monthIdx: m });
    }

    // Track if we have any dated transactions matching buckets
    const recordedOrderIds = new Set<string>();

    // 1. Aggregate Financial Transactions from Supabase
    transactions.forEach((tx) => {
      const rawDate = tx.transaction_date || tx.date || tx.created_at;
      if (!rawDate) return;
      const parsed = new Date(rawDate);
      if (isNaN(parsed.getTime())) return;

      const key = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
      const bucket = buckets.get(key);
      if (!bucket) return;

      const amt = Number(tx.amount) || 0;
      if (amt <= 0) return;

      if (tx.type === 'income' || tx.type === 'dp_booking') {
        bucket.pemasukan += amt;
        bucket.txCount += 1;
        if (tx.reference_id) recordedOrderIds.add(String(tx.reference_id));
      } else if (tx.type === 'expense') {
        bucket.pengeluaran += amt;
        bucket.txCount += 1;
      } else if (tx.type === 'expense_reversal') {
        bucket.pengeluaran = Math.max(0, bucket.pengeluaran - amt);
      }
    });

    // 2. Supplement with settled Payments not yet duplicated in financial_transactions
    payments.forEach((pay) => {
      if (pay.status !== 'paid') return;
      if (pay.id && recordedOrderIds.has(String(pay.id))) return;
      if (pay.midtrans_order_id && recordedOrderIds.has(String(pay.midtrans_order_id))) return;

      const rawDate = pay.payment_date || pay.settlement_time || pay.created_at;
      if (!rawDate) return;
      const parsed = new Date(rawDate);
      if (isNaN(parsed.getTime())) return;

      const key = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
      const bucket = buckets.get(key);
      if (!bucket) return;

      const amt = Number(pay.amount) || 0;
      if (amt > 0) {
        bucket.pemasukan += amt;
        bucket.txCount += 1;
      }
    });

    // 3. If a bucket still has 0 pemasukan, check approved bookings in that month
    bookings.forEach((bk) => {
      if (bk.status !== 'approved') return;
      const rawDate = bk.check_in_date || bk.booking_date || bk.created_at;
      if (!rawDate) return;
      const parsed = new Date(rawDate);
      if (isNaN(parsed.getTime())) return;

      const key = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
      const bucket = buckets.get(key);
      if (!bucket) return;

      // Only add booking pipeline if no direct ledger income was recorded for that month yet
      if (bucket.txCount === 0) {
        const amt = Number(bk.total_price || bk.rent_price) || 0;
        if (amt > 0) {
          bucket.pemasukan += amt;
        }
      }
    });

    const entries = Array.from(buckets.entries());
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Ensure current month reflects live grossRevenue / totalExpenses if bucket is empty
    const currentBucket = buckets.get(currentMonthKey);
    if (currentBucket && currentBucket.pemasukan === 0 && grossRevenue > 0) {
      currentBucket.pemasukan = grossRevenue;
    }
    if (currentBucket && currentBucket.pengeluaran === 0 && totalExpenses > 0) {
      currentBucket.pengeluaran = totalExpenses;
    }

    return entries.map(([key, item]) => {
      const inflow = item.pemasukan;
      const outflow = item.pengeluaran;
      const net = inflow - outflow;
      const margin = inflow > 0 ? Math.round((net / inflow) * 1000) / 10 : 0;

      return {
        monthKey: key,
        label: `${MONTH_NAMES_SHORT[item.monthIdx]} '${String(item.year).slice(-2)}`,
        fullLabel: `${MONTH_NAMES_FULL[item.monthIdx]} ${item.year}`,
        pemasukan: inflow,
        pengeluaran: outflow,
        arusKasBersih: net,
        marginPercent: margin,
        txCount: item.txCount
      };
    });
  }, [transactions, payments, bookings, rangeMonths, grossRevenue, totalExpenses]);

  // Aggregate summary metrics across the selected period
  const summaryStats = useMemo(() => {
    const totalIn = monthlySeries.reduce((acc, m) => acc + m.pemasukan, 0);
    const totalOut = monthlySeries.reduce((acc, m) => acc + m.pengeluaran, 0);
    const totalNet = totalIn - totalOut;
    const avgMargin = totalIn > 0 ? ((totalNet / totalIn) * 100) : 0;
    const expenseRatio = totalIn > 0 ? ((totalOut / totalIn) * 100) : 0;

    // Month-over-month comparison (latest month vs previous month)
    const latest = monthlySeries[monthlySeries.length - 1];
    const prev = monthlySeries.length > 1 ? monthlySeries[monthlySeries.length - 2] : null;
    const momGrowth = prev && prev.pemasukan > 0
      ? (((latest.pemasukan - prev.pemasukan) / prev.pemasukan) * 100)
      : 0;

    // Best performing month
    const bestMonth = monthlySeries.reduce(
      (best, cur) => (cur.arusKasBersih > best.arusKasBersih ? cur : best),
      monthlySeries[0]
    );

    // Health status classification
    let healthLabel = 'Sangat Sehat (Optimal)';
    let healthColor = isDark
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (avgMargin < 25) {
      healthLabel = 'Perlu Evaluasi Beban';
      healthColor = isDark
        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
        : 'bg-amber-50 text-amber-700 border-amber-200';
    } else if (avgMargin < 50) {
      healthLabel = 'Sehat & Stabil';
      healthColor = isDark
        ? 'bg-teal-500/15 text-teal-300 border-teal-500/30'
        : 'bg-teal-50 text-teal-700 border-teal-200';
    }

    return {
      totalIn,
      totalOut,
      totalNet,
      avgMargin,
      expenseRatio,
      momGrowth,
      bestMonth,
      healthLabel,
      healthColor
    };
  }, [monthlySeries, isDark]);

  // Custom Recharts Tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const dataPoint: MonthlyDataPoint = payload[0]?.payload;
    if (!dataPoint) return null;

    return (
      <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl border border-slate-700 shadow-2xl text-xs space-y-2 min-w-[220px]">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2 gap-3">
          <span className="font-extrabold text-white font-display">{dataPoint.fullLabel}</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
            dataPoint.marginPercent >= 50
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
          }`}>
            Margin {dataPoint.marginPercent.toFixed(1)}%
          </span>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
              Pemasukan:
            </span>
            <span className="font-mono font-bold text-emerald-400 tabular-nums">
              {formatRupiah(dataPoint.pemasukan)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" />
              Pengeluaran:
            </span>
            <span className="font-mono font-bold text-rose-400 tabular-nums">
              {formatRupiah(dataPoint.pengeluaran)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-4 pt-1.5 border-t border-slate-800">
            <span className="flex items-center gap-1.5 font-bold text-slate-200">
              <span className="w-2.5 h-2.5 rounded-sm bg-sky-400 inline-block" />
              Surplus Bersih:
            </span>
            <span className={`font-mono font-extrabold tabular-nums ${
              dataPoint.arusKasBersih >= 0 ? 'text-sky-300' : 'text-rose-400'
            }`}>
              {formatRupiah(dataPoint.arusKasBersih)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className={`rounded-2xl border p-4 sm:p-6 space-y-6 transition-all ${
        isDark
          ? 'bg-slate-900 border-slate-800 text-slate-100 shadow-xl'
          : 'bg-white border-slate-200/80 text-slate-900 shadow-sm'
      }`}
    >
      {/* 1. Header & Interactive Controls */}
      <div className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b pb-4 ${
        isDark ? 'border-slate-800' : 'border-slate-100'
      }`}>
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
            isDark
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : 'bg-emerald-50 text-emerald-600 border-emerald-100'
          }`}>
            <BarChart3 size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className={`text-base sm:text-lg font-extrabold font-display tracking-tight ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}>
                Dashboard Arus Kas Bulanan (Pemasukan vs Pengeluaran)
              </h2>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border flex items-center gap-1 ${summaryStats.healthColor}`}>
                <ShieldCheck size={11} />
                {summaryStats.healthLabel}
              </span>
            </div>
            <p className={`text-xs mt-0.5 flex items-center gap-1.5 flex-wrap ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}>
              <Building2 size={12} className="text-emerald-500 shrink-0" />
              <span>{activePropertyName}</span>
              <span>•</span>
              <span>Visualisasi perbandingan arus kas masuk dan beban operasional bulanan</span>
            </p>
          </div>
        </div>

        {/* Period & Bar Toggles */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Toggle Net Cashflow Bar */}
          <button
            type="button"
            onClick={() => setShowNetBar(prev => !prev)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
              showNetBar
                ? isDark
                  ? 'bg-sky-500/15 text-sky-300 border-sky-500/40'
                  : 'bg-sky-50 text-sky-700 border-sky-200'
                : isDark
                  ? 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Activity size={13} />
            <span>Surplus Bersih</span>
          </button>

          {/* Toggle Monthly Table */}
          <button
            type="button"
            onClick={() => setShowTableDetail(prev => !prev)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
              showTableDetail
                ? isDark
                  ? 'bg-teal-500/15 text-teal-300 border-teal-500/40'
                  : 'bg-teal-50 text-teal-700 border-teal-200'
                : isDark
                  ? 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Table size={13} />
            <span>Tabel Rincian</span>
          </button>

          {/* Timeframe Selector (6M / 12M) */}
          <div className={`flex items-center p-1 rounded-xl border ${
            isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
          }`}>
            {([6, 12] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setRangeMonths(m)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  rangeMonths === m
                    ? isDark
                      ? 'bg-emerald-500 text-slate-950 shadow-xs'
                      : 'bg-slate-900 text-white shadow-xs'
                    : isDark
                      ? 'text-slate-400 hover:text-white'
                      : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Calendar size={11} />
                <span>{m} Bulan</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Summary KPI Cards (4-Grid Responsive) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Card 1: Total Pemasukan */}
        <div className={`p-4 rounded-2xl border flex flex-col justify-between min-w-0 ${
          isDark
            ? 'bg-emerald-950/20 border-emerald-500/25'
            : 'bg-emerald-50/60 border-emerald-100'
        }`}>
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[10px] font-mono uppercase font-bold tracking-wider ${
              isDark ? 'text-emerald-300' : 'text-emerald-700'
            }`}>
              Total Pemasukan ({rangeMonths} Bln)
            </span>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
              isDark ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-100 text-emerald-700'
            }`}>
              <ArrowUpRight size={15} />
            </div>
          </div>
          <div className={`text-base sm:text-lg font-black font-display tracking-tight tabular-nums mt-2 break-words ${
            isDark ? 'text-emerald-300' : 'text-emerald-900'
          }`}>
            {formatRupiah(summaryStats.totalIn)}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
            <span className={`font-bold flex items-center gap-0.5 ${
              summaryStats.momGrowth >= 0
                ? isDark ? 'text-emerald-400' : 'text-emerald-700'
                : isDark ? 'text-rose-400' : 'text-rose-600'
            }`}>
              {summaryStats.momGrowth >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {summaryStats.momGrowth >= 0 ? '+' : ''}{summaryStats.momGrowth.toFixed(1)}%
            </span>
            <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>vs bulan lalu</span>
          </div>
        </div>

        {/* Card 2: Total Pengeluaran */}
        <div className={`p-4 rounded-2xl border flex flex-col justify-between min-w-0 ${
          isDark
            ? 'bg-rose-950/20 border-rose-500/25'
            : 'bg-rose-50/60 border-rose-100'
        }`}>
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[10px] font-mono uppercase font-bold tracking-wider ${
              isDark ? 'text-rose-300' : 'text-rose-700'
            }`}>
              Total Pengeluaran ({rangeMonths} Bln)
            </span>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
              isDark ? 'bg-rose-500/20 text-rose-300' : 'bg-rose-100 text-rose-700'
            }`}>
              <ArrowDownRight size={15} />
            </div>
          </div>
          <div className={`text-base sm:text-lg font-black font-display tracking-tight tabular-nums mt-2 break-words ${
            isDark ? 'text-rose-300' : 'text-rose-900'
          }`}>
            {formatRupiah(summaryStats.totalOut)}
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px]">
            <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Rasio Beban Usaha:</span>
            <span className={`font-mono font-bold ${
              isDark ? 'text-rose-300' : 'text-rose-700'
            }`}>
              {summaryStats.expenseRatio.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Card 3: Arus Kas Bersih (Surplus) */}
        <div className={`p-4 rounded-2xl border flex flex-col justify-between min-w-0 ${
          isDark
            ? 'bg-sky-950/20 border-sky-500/25'
            : 'bg-sky-50/60 border-sky-100'
        }`}>
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[10px] font-mono uppercase font-bold tracking-wider ${
              isDark ? 'text-sky-300' : 'text-sky-700'
            }`}>
              Arus Kas Bersih (Net Cashflow)
            </span>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
              isDark ? 'bg-sky-500/20 text-sky-300' : 'bg-sky-100 text-sky-700'
            }`}>
              <Wallet size={15} />
            </div>
          </div>
          <div className={`text-base sm:text-lg font-black font-display tracking-tight tabular-nums mt-2 break-words ${
            isDark ? 'text-sky-300' : 'text-sky-900'
          }`}>
            {formatRupiah(summaryStats.totalNet)}
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px]">
            <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Rata-rata / Bulan:</span>
            <span className={`font-mono font-bold ${
              isDark ? 'text-sky-300' : 'text-sky-700'
            }`}>
              {formatCompactRupiah(summaryStats.totalNet / rangeMonths)}
            </span>
          </div>
        </div>

        {/* Card 4: Efisiensi & Puncak Kinerja */}
        <div className={`p-4 rounded-2xl border flex flex-col justify-between min-w-0 ${
          isDark
            ? 'bg-slate-950/90 border-slate-800'
            : 'bg-slate-50/90 border-slate-200/80'
        }`}>
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[10px] font-mono uppercase font-bold tracking-wider ${
              isDark ? 'text-amber-400' : 'text-slate-600'
            }`}>
              Margin Kas Bersih
            </span>
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-black ${
              summaryStats.avgMargin >= 50
                ? 'bg-emerald-500/20 text-emerald-500'
                : 'bg-amber-500/20 text-amber-500'
            }`}>
              {summaryStats.avgMargin.toFixed(1)}%
            </span>
          </div>
          <div className={`text-base sm:text-lg font-black font-display tracking-tight mt-2 ${
            isDark ? 'text-white' : 'text-slate-900'
          }`}>
            {summaryStats.bestMonth?.fullLabel || '-'}
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px]">
            <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Surplus Tertinggi:</span>
            <span className="font-mono font-bold text-emerald-500">
              {formatCompactRupiah(summaryStats.bestMonth?.arusKasBersih || 0)}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Recharts BarChart Section */}
      <div className={`p-4 sm:p-5 rounded-2xl border ${
        isDark ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50/50 border-slate-100'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className={`text-xs sm:text-sm font-extrabold uppercase tracking-wider font-mono ${
              isDark ? 'text-slate-200' : 'text-slate-800'
            }`}>
              Grafik Komparasi Arus Kas Bulanan ({rangeMonths} Bulan Terakhir)
            </h3>
            <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Arahkan kursor atau ketuk batang grafik untuk melihat rincian nominal Rupiah dan margin per bulan
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 font-semibold">
              <span className="w-3 h-3 rounded-xs bg-emerald-500 inline-block" />
              <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>Pemasukan</span>
            </span>
            <span className="flex items-center gap-1.5 font-semibold">
              <span className="w-3 h-3 rounded-xs bg-rose-500 inline-block" />
              <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>Pengeluaran</span>
            </span>
            {showNetBar && (
              <span className="flex items-center gap-1.5 font-semibold">
                <span className="w-3 h-3 rounded-xs bg-sky-500 inline-block" />
                <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>Surplus Bersih</span>
              </span>
            )}
          </div>
        </div>

        <div className="w-full h-[300px] sm:h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={monthlySeries}
              margin={{ top: 10, right: 12, left: 4, bottom: 5 }}
              barGap={6}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke={isDark ? '#1E293B' : '#E2E8F0'}
              />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: isDark ? '#94A3B8' : '#64748B', fontSize: 11, fontWeight: 700 }}
                dy={6}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tickFormatter={formatCompactRupiah}
                tick={{ fill: isDark ? '#94A3B8' : '#64748B', fontSize: 11, fontWeight: 600 }}
                width={72}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)', radius: 8 }}
              />
              <Legend wrapperStyle={{ display: 'none' }} />
              <ReferenceLine y={0} stroke={isDark ? '#334155' : '#CBD5E1'} />
              <Bar
                dataKey="pemasukan"
                name="Pemasukan"
                fill="#10B981"
                radius={[6, 6, 0, 0]}
                maxBarSize={38}
              />
              <Bar
                dataKey="pengeluaran"
                name="Pengeluaran"
                fill="#F43F5E"
                radius={[6, 6, 0, 0]}
                maxBarSize={38}
              />
              {showNetBar && (
                <Bar
                  dataKey="arusKasBersih"
                  name="Surplus Bersih"
                  fill="#0EA5E9"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={38}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 4. Collapsible Monthly Breakdown Table */}
      {showTableDetail && (
        <div className={`rounded-2xl border overflow-hidden ${
          isDark ? 'border-slate-800 bg-slate-950/50' : 'border-slate-200 bg-white'
        }`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className={`border-b text-[10px] font-mono uppercase tracking-wider ${
                  isDark ? 'bg-slate-900/90 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'
                }`}>
                  <th className="py-3 px-4">Periode Bulan</th>
                  <th className="py-3 px-4 text-right">Pemasukan (Inflow)</th>
                  <th className="py-3 px-4 text-right">Pengeluaran (Outflow)</th>
                  <th className="py-3 px-4 text-right">Arus Kas Bersih</th>
                  <th className="py-3 px-4 text-center">Margin Kas</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-slate-800/70' : 'divide-slate-100'}`}>
                {monthlySeries.map((row) => (
                  <tr
                    key={row.monthKey}
                    className={isDark ? 'hover:bg-slate-900/60' : 'hover:bg-slate-50/80'}
                  >
                    <td className={`py-2.5 px-4 font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>
                      {row.fullLabel}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-semibold text-emerald-500 tabular-nums">
                      {formatRupiah(row.pemasukan)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-semibold text-rose-500 tabular-nums">
                      {formatRupiah(row.pengeluaran)}
                    </td>
                    <td className={`py-2.5 px-4 text-right font-mono font-extrabold tabular-nums ${
                      row.arusKasBersih >= 0
                        ? isDark ? 'text-sky-400' : 'text-sky-700'
                        : 'text-rose-500'
                    }`}>
                      {formatRupiah(row.arusKasBersih)}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                        row.marginPercent >= 50
                          ? isDark
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : isDark
                            ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {row.marginPercent.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default MonthlyCashflowDashboard;
