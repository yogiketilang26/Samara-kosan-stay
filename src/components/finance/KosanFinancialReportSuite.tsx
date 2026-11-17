import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  TrendingUp,
  TrendingDown,
  Wallet,
  Scale,
  BedDouble,
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
  Printer,
  Download,
  FileSpreadsheet,
  ShieldCheck,
  CreditCard,
  Coins,
  Percent,
  Layers,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  Landmark,
  FileText,
  Calculator,
  Server
} from 'lucide-react';
import {
  UniformKosanFinancialReport,
  FinancialReportPeriod,
  setSharedFinanceFilterState
} from '../../lib/financialMetrics';
import { MonthlyCashflowDashboard } from '../owner/MonthlyCashflowDashboard';
import { formatRupiah } from '../../utils/formatCurrency';

export interface KosanFinancialReportSuiteProps {
  report: UniformKosanFinancialReport;
  properties: any[];
  selectedPropertyId: string;
  onSelectPropertyId: (propId: string) => void;
  selectedPeriod: FinancialReportPeriod;
  onSelectPeriod: (period: FinancialReportPeriod) => void;
  onRefresh?: () => void;
  isLoading?: boolean;
  viewerRoleLabel: string;
  defaultSubTab?: 'ringkasan' | 'laba_rugi' | 'arus_kas' | 'per_cabang' | 'piutang_deposit' | 'neraca_coa';
  compactMode?: boolean;
}

interface MidtransRuntimeConfig {
  isProduction: boolean;
  mode: 'sandbox' | 'production';
  snapUrl: string;
  apiBaseUrl: string;
  holdMinutes: number;
  productionReady: boolean;
}

export const KosanFinancialReportSuite: React.FC<KosanFinancialReportSuiteProps> = ({
  report,
  properties = [],
  selectedPropertyId,
  onSelectPropertyId,
  selectedPeriod,
  onSelectPeriod,
  onRefresh,
  isLoading = false,
  viewerRoleLabel,
  defaultSubTab = 'ringkasan',
  compactMode = false
}) => {
  const [activeReportTab, setActiveReportTab] = useState<
    'ringkasan' | 'laba_rugi' | 'arus_kas' | 'per_cabang' | 'piutang_deposit' | 'neraca_coa'
  >(defaultSubTab);
  const [dividendRatio, setDividendRatio] = useState<number>(85);
  const [roomSearch, setRoomSearch] = useState<string>('');
  const [roomStatusFilter, setRoomStatusFilter] = useState<string>('all');
  const [arSearch, setArSearch] = useState<string>('');
  const [arStatusFilter, setArStatusFilter] = useState<string>('all');
  const [showGatewayReadiness, setShowGatewayReadiness] = useState<boolean>(false);

  const [gatewayConfig, setGatewayConfig] = useState<MidtransRuntimeConfig>(() => {
    const envProd =
      Boolean((import.meta as any).env?.VITE_MIDTRANS_IS_PRODUCTION === 'true') ||
      Boolean((import.meta as any).env?.MIDTRANS_IS_PRODUCTION === 'true');
    return {
      isProduction: envProd,
      mode: envProd ? 'production' : 'sandbox',
      snapUrl: envProd
        ? 'https://app.midtrans.com/snap/snap.js'
        : 'https://app.sandbox.midtrans.com/snap/snap.js',
      apiBaseUrl: envProd ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com',
      holdMinutes: 15,
      productionReady: true
    };
  });

  useEffect(() => {
    let active = true;
    fetch('/api/midtrans/config')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (active && data && typeof data.isProduction === 'boolean') {
          setGatewayConfig({
            isProduction: data.isProduction,
            mode: data.mode || (data.isProduction ? 'production' : 'sandbox'),
            snapUrl: data.snapUrl || 'https://app.sandbox.midtrans.com/snap/snap.js',
            apiBaseUrl: data.apiBaseUrl || 'https://api.sandbox.midtrans.com',
            holdMinutes: Number(data.holdMinutes || 15),
            productionReady: true
          });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const handlePropertyChange = (val: string) => {
    setSharedFinanceFilterState({ propertyId: val });
    onSelectPropertyId(val);
  };

  const handlePeriodChange = (val: FinancialReportPeriod) => {
    setSharedFinanceFilterState({ period: val });
    onSelectPeriod(val);
  };

  const customDividendAmount = Math.max(0, Math.round(report.profitability.netOperatingIncome * (dividendRatio / 100)));
  const customRetainedAmount = Math.max(0, report.profitability.netOperatingIncome - customDividendAmount);

  const filteredRoomRegister = useMemo(() => {
    return report.roomBillingRegister.filter(r => {
      const matchesStatus = roomStatusFilter === 'all' || r.status === roomStatusFilter;
      const q = roomSearch.trim().toLowerCase();
      const matchesSearch =
        !q ||
        r.roomNumber.toLowerCase().includes(q) ||
        r.tenantName.toLowerCase().includes(q) ||
        r.propertyName.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [report.roomBillingRegister, roomStatusFilter, roomSearch]);

  const filteredReceivables = useMemo(() => {
    return report.receivablesAndDeposits.filter(item => {
      const matchesStatus = arStatusFilter === 'all' || item.status === arStatusFilter;
      const q = arSearch.trim().toLowerCase();
      const matchesSearch =
        !q ||
        item.tenantName.toLowerCase().includes(q) ||
        item.orderId.toLowerCase().includes(q) ||
        item.roomNumber.toLowerCase().includes(q) ||
        item.propertyName.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [report.receivablesAndDeposits, arStatusFilter, arSearch]);

  const handleExportUniformCsv = () => {
    const lines: string[] = [];
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;

    lines.push([esc('LAPORAN KEUANGAN STANDAR APLIKASI KOSAN - SAMARA STAY ERP')].join(','));
    lines.push([esc('Cakupan Properti'), esc(report.scope.selectedPropertyName)].join(','));
    lines.push([esc('Periode Laporan'), esc(report.scope.periodLabel)].join(','));
    lines.push([esc('Diakses Oleh Role'), esc(viewerRoleLabel)].join(','));
    lines.push([esc('Mode Payment Gateway'), esc(gatewayConfig.mode.toUpperCase())].join(','));
    lines.push([esc('Waktu Cetak'), esc(new Date().toLocaleString('id-ID'))].join(','));
    lines.push('');

    lines.push([esc('I. RINGKASAN EKSEKUTIF KOSAN'), esc('NILAI')].join(','));
    lines.push([esc('Pendapatan Sewa Terealisasi (Kas Masuk)'), esc(report.revenue.realizedInflow)].join(','));
    lines.push([esc('Nilai Kontrak Sewa Aktif (Approved Pipeline)'), esc(report.revenue.contractPipeline)].join(','));
    lines.push([esc('Pendapatan Kotor Efektif (Gross Revenue)'), esc(report.revenue.effectiveGrossRevenue)].join(','));
    lines.push([esc('Total Beban Operasional (OPEX)'), esc(report.expenses.totalExpenses)].join(','));
    lines.push([esc('Laba Bersih Operasional (NOI)'), esc(report.profitability.netOperatingIncome)].join(','));
    lines.push([esc('Margin NOI (%)'), esc(`${report.profitability.noiMarginPercent}%`)].join(','));
    lines.push([esc('Rasio Beban Operasional / OER (%)'), esc(`${report.profitability.operatingExpenseRatioPercent}%`)].join(','));
    lines.push([esc('Tingkat Okupansi Kamar (%)'), esc(`${report.occupancy.ratePercentage}% (${report.occupancy.occupiedRooms}/${report.occupancy.totalRooms} Kamar)`)].join(','));
    lines.push([esc('RevPAR (Pendapatan per Kamar Tersedia)'), esc(report.profitability.revPar)].join(','));
    lines.push([esc('ARPU (Pendapatan per Kamar Terisi)'), esc(report.profitability.arpu)].join(','));
    lines.push([esc('Dana Titipan Deposit Kamar Penghuni (COA 2100)'), esc(report.liabilitiesAndTax.securityDepositHeld2100)].join(','));
    lines.push([esc('Dana Titipan DP Survey (COA 1300)'), esc(report.liabilitiesAndTax.surveyDpHeld1300)].join(','));
    lines.push([esc('Estimasi Pajak Daerah Kos PBJT (10%)'), esc(report.liabilitiesAndTax.estimatedPbjtTax10)].join(','));
    lines.push([esc('Estimasi PPh Final UMKM (0.5%)'), esc(report.liabilitiesAndTax.estimatedPphFinal05)].join(','));
    lines.push('');

    lines.push([esc('II. LAPORAN LABA RUGI (PROFIT & LOSS)'), esc('KODE COA'), esc('NOMINAL (RP)'), esc('% DARI OMSET')].join(','));
    report.revenue.breakdown.forEach(item => {
      lines.push([esc(item.name), esc(item.code), esc(item.amount), esc(`${item.percentageOfRevenue || 0}%`)].join(','));
    });
    lines.push([esc('TOTAL PENDAPATAN OPERASIONAL'), esc('4000-4300'), esc(report.revenue.effectiveGrossRevenue), esc('100%')].join(','));
    report.expenses.breakdown.forEach(item => {
      lines.push([esc(item.name), esc(item.code), esc(item.amount), esc(`${item.percentageOfRevenue || 0}%`)].join(','));
    });
    lines.push([esc('TOTAL BEBAN OPERASIONAL (OPEX)'), esc('5000-5400'), esc(report.expenses.totalExpenses), esc(`${report.profitability.operatingExpenseRatioPercent}%`)].join(','));
    lines.push([esc('LABA BERSIH OPERASIONAL (NOI)'), esc('NOI'), esc(report.profitability.netOperatingIncome), esc(`${report.profitability.noiMarginPercent}%`)].join(','));
    lines.push('');

    lines.push([
      esc('III. KINERJA PER CABANG KOS'),
      esc('TIPE'),
      esc('TOTAL KAMAR'),
      esc('TERISI'),
      esc('KOSONG'),
      esc('OKUPANSI %'),
      esc('PENDAPATAN (RP)'),
      esc('BEBAN (RP)'),
      esc('NOI (RP)'),
      esc('REVPAR (RP)'),
      esc('DEPOSIT TERTAHAN (RP)')
    ].join(','));
    report.branchBreakdown.forEach(b => {
      lines.push([
        esc(b.propertyName),
        esc(b.propertyType),
        esc(b.totalRooms),
        esc(b.occupiedRooms),
        esc(b.availableRooms),
        esc(`${b.occupancyRate}%`),
        esc(b.effectiveRevenue),
        esc(b.totalExpenses),
        esc(b.netOperatingIncome),
        esc(b.revPar),
        esc(b.depositHeld)
      ].join(','));
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + lines.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `laporan_keuangan_kosan_samarastay_${report.scope.selectedPropertyId}_${report.scope.selectedPeriod}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintFormalReport = () => {
    window.print();
  };

  return (
    <div
      className="space-y-6 font-sans text-left"
      data-testid="uniform-kosan-financial-report-suite"
    >
      {/* 1. UNIFIED INSTITUTIONAL HEADER & FILTER BAR */}
      <div className="bg-slate-900 text-white rounded-3xl p-5 sm:p-6 border border-slate-800 shadow-xl space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <ShieldCheck size={12} />
                SSOT Keuangan Seragam Lintas Role
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-slate-800 text-slate-200 border border-slate-700">
                Role Aktif: {viewerRoleLabel}
              </span>
              <button
                type="button"
                onClick={() => setShowGatewayReadiness(prev => !prev)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold uppercase border cursor-pointer transition-all ${
                  gatewayConfig.isProduction
                    ? 'bg-sky-500/20 text-sky-300 border-sky-500/40 hover:bg-sky-500/30'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                }`}
                title="Klik untuk melihat detail kesiapan fungsi Production & status Sandbox aktif"
              >
                <Server size={11} />
                {gatewayConfig.isProduction
                  ? 'Midtrans: PRODUCTION LIVE'
                  : 'Midtrans: SANDBOX AKTIF (Production-Ready)'}
              </button>
            </div>

            <h2 className="text-lg sm:text-xl font-black text-white font-display tracking-tight">
              Laporan Keuangan Standar Manajemen Kosan — {report.scope.selectedPropertyName}
            </h2>
            <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
              Seluruh angka Pendapatan Sewa, Beban Operasional (OPEX), Laba Bersih (NOI), Okupansi, RevPAR, Dana Titipan Deposit (<code className="text-emerald-300 font-mono">COA 2100</code> &amp; <code className="text-emerald-300 font-mono">1300</code>), dan Pajak Kos (<code className="text-amber-300 font-mono">PBJT 10%</code>) dihitung dari satu mesin akuntansi terpusat sehingga <strong>Super Admin, Owner, Anak Owner, Admin, dan Finance</strong> melihat angka yang 100% identik.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isLoading}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all disabled:opacity-50"
              >
                <RefreshCw size={13} className={isLoading ? 'animate-spin text-emerald-400' : 'text-emerald-400'} />
                <span>Segarkan</span>
              </button>
            )}
            <button
              type="button"
              onClick={handlePrintFormalReport}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <Printer size={13} className="text-sky-400" />
              <span>Cetak / PDF</span>
            </button>
            <button
              type="button"
              onClick={handleExportUniformCsv}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-all shadow-sm"
            >
              <FileSpreadsheet size={13} />
              <span>Ekspor Excel (CSV)</span>
            </button>
          </div>
        </div>

        {/* Collapsible Production Readiness & Active Sandbox Info Banner */}
        {showGatewayReadiness && (
          <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4 space-y-3 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <strong className="text-white font-display">
                  Status Arsitektur Transaksi &amp; Pembayaran: Mode {gatewayConfig.mode.toUpperCase()} Aktif — Fungsi Production Siap 100%
                </strong>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                Hold Expiry: {gatewayConfig.holdMinutes} Menit | Endpoint: {gatewayConfig.apiBaseUrl}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] text-slate-300">
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                <span className="text-[10px] font-mono font-bold text-amber-400 uppercase block">
                  1. Mode Saat Ini: Sandbox Default
                </span>
                <p className="text-slate-400 leading-relaxed">
                  Saat ini sistem berjalan di <strong>Midtrans Sandbox</strong> (<code className="text-amber-300">MIDTRANS_IS_PRODUCTION=false</code>) untuk pengujian aman tanpa memotong saldo bank riil.
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase block">
                  2. Fungsi Production Siap Pakai
                </span>
                <p className="text-slate-400 leading-relaxed">
                  Seluruh fungsi Production telah aktif di kode: Verifikasi Signature SHA-512 Webhook, Atomic Settlement RPC, Anti-Double-Charge, Hold Kamar 15 Menit, &amp; Signed URL Dokumen Privat.
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                <span className="text-[10px] font-mono font-bold text-sky-400 uppercase block">
                  3. Cara Beralih ke Production
                </span>
                <p className="text-slate-400 leading-relaxed">
                  Saat siap Go-Live, cukup ubah env <code className="text-sky-300">MIDTRANS_IS_PRODUCTION=true</code> serta isi <code className="text-sky-300">MIDTRANS_SERVER_KEY</code> &amp; <code className="text-sky-300">VITE_MIDTRANS_CLIENT_KEY</code> Production tanpa mengubah kode.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Unified Branch & Period Filter Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-xl">
              <Building2 size={14} className="text-emerald-400 shrink-0" />
              <span className="text-[11px] font-mono text-slate-400 uppercase font-bold">Cabang Kos:</span>
              <select
                value={selectedPropertyId}
                onChange={e => handlePropertyChange(e.target.value)}
                className="bg-transparent text-white text-xs font-bold outline-none cursor-pointer pr-2"
              >
                <option value="all" className="bg-slate-900 text-white">
                  Semua Cabang Properti ({properties.length} Gedung)
                </option>
                {properties.map(p => (
                  <option key={p.id} value={String(p.id)} className="bg-slate-900 text-white">
                    {p.name} ({String(p.type || 'kos').toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1 bg-slate-950/80 border border-slate-800 p-1 rounded-xl overflow-x-auto">
              {(
                [
                  { id: 'all', label: 'Semua Periode' },
                  { id: 'this_month', label: 'Bulan Ini' },
                  { id: 'last_month', label: 'Bulan Lalu' },
                  { id: 'this_quarter', label: 'Kuartal Ini' },
                  { id: 'ytd', label: 'Tahun Ini (YTD)' }
                ] as Array<{ id: FinancialReportPeriod; label: string }>
              ).map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handlePeriodChange(p.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                    selectedPeriod === p.id
                      ? 'bg-emerald-500 text-slate-950 shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2">
            <span>Periode Aktif: <strong className="text-emerald-300">{report.scope.periodLabel}</strong></span>
          </div>
        </div>
      </div>

      {/* 2. 8 STANDARDIZED KOSAN KPI CARDS (IDENTICAL ACROSS ALL ROLES) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* KPI 1: Pendapatan Sewa Efektif */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-mono uppercase font-extrabold text-emerald-700 tracking-wider truncate">
              1. Pendapatan Sewa (Omset)
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shrink-0">
              <TrendingUp size={14} />
            </div>
          </div>
          <div className="text-lg font-black text-slate-900 font-mono tabular-nums mt-2 break-words">
            {formatRupiah(report.revenue.effectiveGrossRevenue)}
          </div>
          <div className="mt-1.5 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
            <span>Kas Masuk Riil:</span>
            <strong className="font-mono text-emerald-700">{formatRupiah(report.revenue.realizedInflow)}</strong>
          </div>
        </div>

        {/* KPI 2: Total Beban Operasional (OPEX) */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-mono uppercase font-extrabold text-rose-700 tracking-wider truncate">
              2. Beban Operasional (OPEX)
            </span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100 shrink-0">
              <TrendingDown size={14} />
            </div>
          </div>
          <div className="text-lg font-black text-rose-600 font-mono tabular-nums mt-2 break-words">
            {formatRupiah(report.expenses.totalExpenses)}
          </div>
          <div className="mt-1.5 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
            <span>Rasio Beban Usaha (OER):</span>
            <strong className="font-mono text-rose-700">{report.profitability.operatingExpenseRatioPercent}%</strong>
          </div>
        </div>

        {/* KPI 3: Laba Bersih Operasional (NOI) */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-mono uppercase font-extrabold text-teal-700 tracking-wider truncate">
              3. Laba Bersih Kos (NOI)
            </span>
            <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100 shrink-0">
              <Coins size={14} />
            </div>
          </div>
          <div
            className={`text-lg font-black font-mono tabular-nums mt-2 break-words ${
              report.profitability.netOperatingIncome >= 0 ? 'text-teal-700' : 'text-rose-600'
            }`}
          >
            {formatRupiah(report.profitability.netOperatingIncome)}
          </div>
          <div className="mt-1.5 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
            <span>Margin Laba Bersih:</span>
            <strong className="font-mono text-teal-700">{report.profitability.noiMarginPercent}%</strong>
          </div>
        </div>

        {/* KPI 4: Tingkat Hunian Kamar (Occupancy Rate) */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-mono uppercase font-extrabold text-indigo-700 tracking-wider truncate">
              4. Tingkat Okupansi Kamar
            </span>
            <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100 shrink-0">
              <BedDouble size={14} />
            </div>
          </div>
          <div className="text-lg font-black text-slate-900 font-mono tabular-nums mt-2">
            {report.occupancy.ratePercentage}%{' '}
            <span className="text-xs font-bold text-slate-500">
              ({report.occupancy.occupiedRooms}/{report.occupancy.totalRooms} Unit)
            </span>
          </div>
          <div className="mt-1.5 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
            <span>Tersedia: {report.occupancy.availableRooms} Kamar</span>
            <span className="font-mono text-amber-600 font-bold">Hold: {report.occupancy.reservedRooms}</span>
          </div>
        </div>

        {/* KPI 5: RevPAR & ARPU Kamar */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-mono uppercase font-extrabold text-slate-600 tracking-wider truncate">
              5. RevPAR (Rata-rata / Kamar)
            </span>
            <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
              <Building2 size={14} />
            </div>
          </div>
          <div className="text-base font-black text-slate-900 font-mono tabular-nums mt-2 break-words">
            {formatRupiah(report.profitability.revPar)}
          </div>
          <div className="mt-1.5 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
            <span>ARPU (Per Kamar Terisi):</span>
            <strong className="font-mono text-slate-800">{formatRupiah(report.profitability.arpu)}</strong>
          </div>
        </div>

        {/* KPI 6: Piutang Sewa & Kliring Midtrans */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-mono uppercase font-extrabold text-amber-700 tracking-wider truncate">
              6. Piutang Sewa &amp; Kliring
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100 shrink-0">
              <CreditCard size={14} />
            </div>
          </div>
          <div className="text-base font-black text-amber-700 font-mono tabular-nums mt-2 break-words">
            {formatRupiah(report.treasuryAndClearing.pendingReceivablesAmount)}
          </div>
          <div className="mt-1.5 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
            <span>Kliring Midtrans (1200):</span>
            <strong className="font-mono text-sky-700">
              {formatRupiah(report.treasuryAndClearing.midtransUnreconciledEscrow)}
            </strong>
          </div>
        </div>

        {/* KPI 7: Dana Titipan Penghuni (Deposit 2100 & DP Survey 1300) */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-mono uppercase font-extrabold text-purple-700 tracking-wider truncate">
              7. Dana Titipan Deposit (2100)
            </span>
            <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100 shrink-0">
              <Wallet size={14} />
            </div>
          </div>
          <div className="text-base font-black text-purple-800 font-mono tabular-nums mt-2 break-words">
            {formatRupiah(report.liabilitiesAndTax.securityDepositHeld2100)}
          </div>
          <div className="mt-1.5 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
            <span>Titipan DP Survey (1300):</span>
            <strong className="font-mono text-purple-700">
              {formatRupiah(report.liabilitiesAndTax.surveyDpHeld1300)}
            </strong>
          </div>
        </div>

        {/* KPI 8: Estimasi Pajak Daerah Kos (PBJT 10% & PPh 0.5%) */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-mono uppercase font-extrabold text-sky-700 tracking-wider truncate">
              8. Estimasi Pajak PBJT (10%)
            </span>
            <div className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100 shrink-0">
              <Percent size={14} />
            </div>
          </div>
          <div className="text-base font-black text-sky-700 font-mono tabular-nums mt-2 break-words">
            {formatRupiah(report.liabilitiesAndTax.estimatedPbjtTax10)}
          </div>
          <div className="mt-1.5 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
            <span>PPh Final UMKM (0,5%):</span>
            <strong className="font-mono text-sky-800">
              {formatRupiah(report.liabilitiesAndTax.estimatedPphFinal05)}
            </strong>
          </div>
        </div>
      </div>

      {/* 3. SUB-NAVIGATION FOR PROFESSIONAL KOSAN FINANCIAL STATEMENTS */}
      <div className="bg-white rounded-2xl p-2 border border-slate-200/80 shadow-xs flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {(
          [
            { id: 'ringkasan', label: '1. Ringkasan & Tren Bulanan', icon: TrendingUp },
            { id: 'laba_rugi', label: '2. Laporan Laba Rugi (P&L Kos)', icon: Scale },
            { id: 'arus_kas', label: '3. Laporan Arus Kas & Bank', icon: Wallet },
            { id: 'per_cabang', label: '4. Kinerja per Cabang & Kamar', icon: Building2 },
            { id: 'piutang_deposit', label: '5. Tagihan, Piutang & Deposit', icon: FileText },
            { id: 'neraca_coa', label: '6. Neraca Saldo & COA', icon: Landmark }
          ] as const
        ).map(tab => {
          const IconComp = tab.icon;
          const isActive = activeReportTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveReportTab(tab.id)}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                isActive
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <IconComp size={14} className={isActive ? 'text-emerald-400' : 'text-slate-500'} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* =====================================================================
          TAB 1: RINGKASAN EKSEKUTIF & TREN ARUS KAS BULANAN
      ===================================================================== */}
      {activeReportTab === 'ringkasan' && (
        <div className="space-y-6">
          <MonthlyCashflowDashboard
            transactions={report.filteredDatasets.transactions}
            payments={report.filteredDatasets.payments}
            bookings={report.filteredDatasets.bookings}
            properties={properties}
            selectedPropertyId={selectedPropertyId}
            grossRevenue={report.revenue.effectiveGrossRevenue}
            totalExpenses={report.expenses.totalExpenses}
            theme="light"
          />

          {!compactMode && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Komposisi Hunian per Kategori Kos */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <span className="text-[10px] font-mono uppercase text-slate-400 font-bold block">
                      Segmentasi Hunian Kos
                    </span>
                    <h3 className="text-sm font-extrabold text-slate-900 font-display">
                      Okupansi Kos Putri, Putra &amp; Campur
                    </h3>
                  </div>
                  <span className="text-xs font-mono font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                    {report.occupancy.ratePercentage}% Terisi
                  </span>
                </div>

                <div className="space-y-3 text-xs">
                  {[
                    {
                      label: 'Kos Khusus Putri',
                      occ: report.occupancy.genderBreakdown.putriOccupied,
                      tot: report.occupancy.genderBreakdown.putriTotal,
                      barCls: 'bg-pink-500'
                    },
                    {
                      label: 'Kos Khusus Putra',
                      occ: report.occupancy.genderBreakdown.putraOccupied,
                      tot: report.occupancy.genderBreakdown.putraTotal,
                      barCls: 'bg-sky-500'
                    },
                    {
                      label: 'Kos Campur / Pasutri Resmi',
                      occ: report.occupancy.genderBreakdown.campurOccupied,
                      tot: report.occupancy.genderBreakdown.campurTotal,
                      barCls: 'bg-emerald-500'
                    }
                  ].map(seg => {
                    const pct = seg.tot > 0 ? Math.round((seg.occ / seg.tot) * 100) : 0;
                    return (
                      <div key={seg.label} className="space-y-1">
                        <div className="flex justify-between font-bold text-slate-700">
                          <span>{seg.label}</span>
                          <span className="font-mono">
                            {seg.occ}/{seg.tot} Unit ({pct}%)
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full ${seg.barCls} rounded-full`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Pemisahan Dana Milik Kos vs Dana Titipan Penghuni */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <span className="text-[10px] font-mono uppercase text-purple-600 font-bold block">
                    Prinsip Akuntansi Kosan Profesional
                  </span>
                  <h3 className="text-sm font-extrabold text-slate-900 font-display">
                    Pemisahan Omset Sewa vs Dana Titipan Penghuni
                  </h3>
                </div>
                <div className="space-y-2.5 text-xs">
                  <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 flex items-center justify-between">
                    <div>
                      <strong className="text-emerald-950 block">Pendapatan Sewa Hak Milik Kos (4000)</strong>
                      <span className="text-[10px] text-emerald-700">Masuk ke Laba Rugi &amp; Basis Bagi Hasil Owner</span>
                    </div>
                    <span className="font-mono font-black text-emerald-800">
                      {formatRupiah(report.revenue.effectiveGrossRevenue)}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-purple-50/70 border border-purple-200 flex items-center justify-between">
                    <div>
                      <strong className="text-purple-950 block">Titipan Deposit Kamar Penghuni (2100)</strong>
                      <span className="text-[10px] text-purple-700">Kewajiban / Dikembalikan saat Check-Out</span>
                    </div>
                    <span className="font-mono font-black text-purple-800">
                      {formatRupiah(report.liabilitiesAndTax.securityDepositHeld2100)}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 flex items-center justify-between">
                    <div>
                      <strong className="text-amber-950 block">Titipan DP Komitmen Survey (1300)</strong>
                      <span className="text-[10px] text-amber-700">Menunggu Hasil Survey (Lanjut / Refund / Hangus)</span>
                    </div>
                    <span className="font-mono font-black text-amber-800">
                      {formatRupiah(report.liabilitiesAndTax.surveyDpHeld1300)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Estimasi Dividen & Cadangan Kas Operasional */}
              <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 shadow-xs flex flex-col justify-between space-y-4">
                <div>
                  <span className="text-[10px] font-mono uppercase text-amber-400 font-bold block">
                    Distribusi Hasil Usaha Kos
                  </span>
                  <h3 className="text-sm font-extrabold text-white font-display mt-0.5">
                    Alokasi Dividen Pemilik &amp; Cadangan Kas
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Dihitung dari Laba Bersih Operasional (NOI) setelah seluruh beban listrik, air, WiFi, perawatan, dan gaji staf terpenuhi.
                  </p>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="p-3 rounded-xl bg-slate-800/90 border border-slate-700 flex justify-between items-center">
                    <span className="text-slate-300">Dividen Siap Distribusi (85%):</span>
                    <strong className="font-mono text-emerald-400 text-sm">
                      {formatRupiah(report.profitability.distributableDividend85)}
                    </strong>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-800/90 border border-slate-700 flex justify-between items-center">
                    <span className="text-slate-300">Cadangan Kas Darurat Kos (15%):</span>
                    <strong className="font-mono text-sky-400 text-sm">
                      {formatRupiah(report.profitability.retainedReserve15)}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 2: LAPORAN LABA RUGI (INCOME STATEMENT / P&L STANDAR KOSAN)
      ===================================================================== */}
      {activeReportTab === 'laba_rugi' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-5 sm:p-7 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <span className="text-[10px] font-mono uppercase font-extrabold text-emerald-700 tracking-wider block">
                Standar Akuntansi Properti &amp; Manajemen Kosan (PSAK)
              </span>
              <h3 className="text-base sm:text-lg font-black text-slate-900 font-display">
                LAPORAN LABA RUGI OPERASIONAL (INCOME STATEMENT)
              </h3>
              <p className="text-xs text-slate-500">
                Entitas: <strong>{report.scope.selectedPropertyName}</strong> • Periode: <strong>{report.scope.periodLabel}</strong>
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right bg-emerald-50 border border-emerald-200 px-3.5 py-2 rounded-xl">
                <span className="text-[10px] font-mono uppercase text-emerald-700 font-bold block">
                  Net Operating Income (NOI)
                </span>
                <span className="text-base font-black text-emerald-800 font-mono tabular-nums">
                  {formatRupiah(report.profitability.netOperatingIncome)} ({report.profitability.noiMarginPercent}%)
                </span>
              </div>
            </div>
          </div>

          {/* Formal Accounting Statement Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white text-[10px] font-mono uppercase tracking-wider">
                  <th className="py-3 px-4 rounded-tl-xl">Kode COA</th>
                  <th className="py-3 px-4">Uraian Pos Laporan Laba Rugi Kosan</th>
                  <th className="py-3 px-4 text-right">% terhadap Omset</th>
                  <th className="py-3 px-4 text-right rounded-tr-xl">Nominal (IDR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* SECTION A: PENDAPATAN */}
                <tr className="bg-emerald-50/70 font-extrabold text-emerald-950">
                  <td className="py-3 px-4 font-mono">4000–4300</td>
                  <td className="py-3 px-4 uppercase tracking-wide" colSpan={3}>
                    A. PENDAPATAN OPERASIONAL KOS (OPERATING REVENUE)
                  </td>
                </tr>
                {report.revenue.breakdown.map(rev => (
                  <tr key={rev.code} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono font-bold text-slate-500">{rev.code}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-800">
                      {rev.name}
                      {rev.isEstimated && (
                        <span className="ml-2 text-[9px] font-mono font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                          Berdasarkan Kontrak Sewa Disetujui
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-slate-500">
                      {rev.percentageOfRevenue?.toFixed(1) || '0.0'}%
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900 tabular-nums">
                      {formatRupiah(rev.amount)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-emerald-100/70 font-black text-emerald-950 border-t-2 border-emerald-300">
                  <td className="py-3 px-4 font-mono">SUB-A</td>
                  <td className="py-3 px-4">TOTAL PENDAPATAN KOTOR OPERASIONAL (GROSS OPERATING REVENUE)</td>
                  <td className="py-3 px-4 text-right font-mono">100.0%</td>
                  <td className="py-3 px-4 text-right font-mono text-sm tabular-nums">
                    {formatRupiah(report.revenue.effectiveGrossRevenue)}
                  </td>
                </tr>

                {/* SECTION B: BEBAN OPERASIONAL */}
                <tr className="bg-rose-50/70 font-extrabold text-rose-950">
                  <td className="py-3 px-4 font-mono">5000–5400</td>
                  <td className="py-3 px-4 uppercase tracking-wide" colSpan={3}>
                    B. BEBAN OPERASIONAL PENGELOLAAN KOS (OPERATING EXPENSES / OPEX)
                  </td>
                </tr>
                {report.expenses.breakdown.map(exp => (
                  <tr key={exp.code} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono font-bold text-slate-500">{exp.code}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-800">{exp.name}</td>
                    <td className="py-2.5 px-4 text-right font-mono text-slate-500">
                      {exp.percentageOfRevenue?.toFixed(1) || '0.0'}%
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-rose-700 tabular-nums">
                      ({formatRupiah(exp.amount)})
                    </td>
                  </tr>
                ))}
                <tr className="bg-rose-100/70 font-black text-rose-950 border-t-2 border-rose-300">
                  <td className="py-3 px-4 font-mono">SUB-B</td>
                  <td className="py-3 px-4">TOTAL BEBAN OPERASIONAL KOS (TOTAL OPEX)</td>
                  <td className="py-3 px-4 text-right font-mono">
                    {report.profitability.operatingExpenseRatioPercent.toFixed(1)}%
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-sm tabular-nums">
                    ({formatRupiah(report.expenses.totalExpenses)})
                  </td>
                </tr>

                {/* SECTION C: LABA BERSIH OPERASIONAL (NOI) */}
                <tr className="bg-slate-900 text-white font-black text-sm">
                  <td className="py-4 px-4 font-mono text-emerald-400">NOI</td>
                  <td className="py-4 px-4">
                    C. LABA BERSIH OPERASIONAL KOS (NET OPERATING INCOME / A - B)
                  </td>
                  <td className="py-4 px-4 text-right font-mono text-emerald-400">
                    {report.profitability.noiMarginPercent.toFixed(1)}%
                  </td>
                  <td className="py-4 px-4 text-right font-mono text-emerald-400 tabular-nums">
                    {formatRupiah(report.profitability.netOperatingIncome)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Interactive Dividend & Reserve Allocation Simulator */}
          <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                  <Calculator size={16} />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-white font-display">
                    Alokasi Pembagian Dividen Pemilik &amp; Cadangan Pemeliharaan Gedung
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Simulasi pembagian hasil bersih operasional (NOI) antara penarikan dividen Owner dan dana cadangan kos
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 bg-slate-800 px-3.5 py-1.5 rounded-xl border border-slate-700">
                <span className="text-xs text-slate-300 font-mono">Porsi Dividen Owner:</span>
                <input
                  type="range"
                  min={50}
                  max={100}
                  step={5}
                  value={dividendRatio}
                  onChange={e => setDividendRatio(Number(e.target.value))}
                  className="w-24 accent-emerald-500 cursor-pointer"
                />
                <span className="text-xs font-mono font-black text-emerald-400 w-10 text-right">
                  {dividendRatio}%
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700">
                <span className="text-[10px] font-mono uppercase text-slate-400 font-bold block">
                  Laba Bersih Operasional (100%)
                </span>
                <div className="text-base font-black text-white font-mono mt-1">
                  {formatRupiah(report.profitability.netOperatingIncome)}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-emerald-950/50 border border-emerald-500/30">
                <span className="text-[10px] font-mono uppercase text-emerald-300 font-bold block">
                  Hak Dividen Bersih Owner ({dividendRatio}%)
                </span>
                <div className="text-base font-black text-emerald-400 font-mono mt-1">
                  {formatRupiah(customDividendAmount)}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-sky-950/50 border border-sky-500/30">
                <span className="text-[10px] font-mono uppercase text-sky-300 font-bold block">
                  Cadangan Sinking Fund Kos ({100 - dividendRatio}%)
                </span>
                <div className="text-base font-black text-sky-400 font-mono mt-1">
                  {formatRupiah(customRetainedAmount)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3: LAPORAN ARUS KAS & POSISI KAS/BANK (CASH FLOW & TREASURY)
      ===================================================================== */}
      {activeReportTab === 'arus_kas' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Laporan Arus Kas (Cash Flow Statement) */}
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-5 sm:p-6 space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <span className="text-[10px] font-mono uppercase font-extrabold text-emerald-700 tracking-wider block">
                  Laporan Arus Kas (Direct Method)
                </span>
                <h3 className="text-base font-black text-slate-900 font-display">
                  Arus Kas Masuk, Beban &amp; Dana Titipan Penghuni
                </h3>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 flex justify-between items-center">
                  <div>
                    <strong className="text-emerald-950 block">1. Penerimaan Kas dari Sewa Kamar &amp; Layanan (+)</strong>
                    <span className="text-[10px] text-emerald-700">Arus kas masuk pendapatan operasional kos</span>
                  </div>
                  <span className="font-mono font-bold text-emerald-700 tabular-nums">
                    +{formatRupiah(report.cashFlowStatement.operatingCashInRentAndAddons)}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-purple-50/70 border border-purple-200 flex justify-between items-center">
                  <div>
                    <strong className="text-purple-950 block">2. Penerimaan Kas Dana Titipan Deposit &amp; DP Survey (+)</strong>
                    <span className="text-[10px] text-purple-700">Kas masuk titipan jaminan kamar (2100) &amp; survey (1300)</span>
                  </div>
                  <span className="font-mono font-bold text-purple-700 tabular-nums">
                    +{formatRupiah(report.cashFlowStatement.fiduciaryCashInDepositAndDp)}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-200 flex justify-between items-center">
                  <div>
                    <strong className="text-rose-950 block">3. Pengeluaran Kas Beban Operasional Kos (-)</strong>
                    <span className="text-[10px] text-rose-700">Listrik, air, WiFi, pemeliharaan, gaji staf &amp; MDR</span>
                  </div>
                  <span className="font-mono font-bold text-rose-700 tabular-nums">
                    -{formatRupiah(report.cashFlowStatement.operatingCashOutExpenses)}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 flex justify-between items-center">
                  <div>
                    <strong className="text-amber-950 block">4. Pengeluaran Pengembalian / Refund Deposit &amp; Survey (-)</strong>
                    <span className="text-[10px] text-amber-700">Pengembalian dana titipan penghuni check-out / batal survey</span>
                  </div>
                  <span className="font-mono font-bold text-amber-700 tabular-nums">
                    -{formatRupiah(report.cashFlowStatement.fiduciaryCashOutRefunds)}
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900 text-white flex justify-between items-center mt-2">
                  <div>
                    <strong className="text-sm font-display block">SURPLUS / KENAIKAN KAS BERSIH PERIODE INI</strong>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Total Kas Masuk ({formatRupiah(report.cashFlowStatement.totalCashInflow)}) - Total Kas Keluar ({formatRupiah(report.cashFlowStatement.totalCashOutflow)})
                    </span>
                  </div>
                  <span className="font-mono font-black text-base text-emerald-400 tabular-nums">
                    {formatRupiah(report.cashFlowStatement.netCashMovement)}
                  </span>
                </div>
              </div>
            </div>

            {/* Posisi Kas, Bank & Rekonsiliasi Midtrans */}
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-5 sm:p-6 space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <span className="text-[10px] font-mono uppercase font-extrabold text-sky-700 tracking-wider block">
                  Treasury &amp; Payment Gateway Clearing
                </span>
                <h3 className="text-base font-black text-slate-900 font-display">
                  Posisi Saldo Kas, Rekening Bank &amp; Kliring Midtrans
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-mono text-slate-500 font-bold uppercase block">
                    [COA 1000] Kas Kecil Kos (Petty Cash)
                  </span>
                  <div className="text-base font-black text-slate-900 font-mono mt-1">
                    {formatRupiah(report.treasuryAndClearing.pettyCash1000)}
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200">
                  <span className="text-[10px] font-mono text-emerald-800 font-bold uppercase block">
                    [COA 1010] Rekening Bank Mandiri Operasional
                  </span>
                  <div className="text-base font-black text-emerald-900 font-mono mt-1">
                    {formatRupiah(
                      report.treasuryAndClearing.bankMandiri1010 > 0
                        ? report.treasuryAndClearing.bankMandiri1010
                        : report.profitability.realizedNetCashflow
                    )}
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-sky-50/70 border border-sky-200">
                  <span className="text-[10px] font-mono text-sky-800 font-bold uppercase block">
                    Gross Transaksi Midtrans Settled
                  </span>
                  <div className="text-base font-black text-sky-900 font-mono mt-1">
                    {formatRupiah(report.treasuryAndClearing.midtransGrossSettled)}
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200">
                  <span className="text-[10px] font-mono text-amber-800 font-bold uppercase block">
                    [COA 1200] Piutang Kliring Midtrans Belum Cair
                  </span>
                  <div className="text-base font-black text-amber-900 font-mono mt-1">
                    {formatRupiah(report.treasuryAndClearing.midtransUnreconciledEscrow)}
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">Total Pembayaran Bruto via Midtrans:</span>
                  <strong className="font-mono text-slate-900">
                    {formatRupiah(report.treasuryAndClearing.midtransGrossSettled)}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Potongan Biaya Layanan MDR Gateway (COA 5030):</span>
                  <strong className="font-mono text-rose-600">
                    -{formatRupiah(report.treasuryAndClearing.midtransMdrFee)}
                  </strong>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200 font-extrabold text-slate-900">
                  <span>Dana Bersih Settlement (Net Settled):</span>
                  <span className="font-mono text-emerald-700">
                    {formatRupiah(report.treasuryAndClearing.midtransNetSettled)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 4: KINERJA PER CABANG KOS & REGISTER UNIT KAMAR
      ===================================================================== */}
      {activeReportTab === 'per_cabang' && (
        <div className="space-y-6">
          {/* Tabel Komparasi Performa Antar Cabang Kos */}
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-mono uppercase font-extrabold text-teal-700 tracking-wider block">
                  Komparasi Multi-Cabang Properti Kos
                </span>
                <h3 className="text-base font-black text-slate-900 font-display">
                  Laporan Kinerja Keuangan &amp; Okupansi per Gedung Kos
                </h3>
              </div>
              <span className="text-xs text-slate-500">
                Klik baris cabang untuk memfilter laporan ke cabang tersebut
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white text-[10px] font-mono uppercase tracking-wider">
                    <th className="py-3 px-3 rounded-tl-xl">Nama Cabang Kos</th>
                    <th className="py-3 px-3">Kategori</th>
                    <th className="py-3 px-3 text-center">Unit (Terisi/Total)</th>
                    <th className="py-3 px-3 text-center">Okupansi</th>
                    <th className="py-3 px-3 text-right">Pendapatan Sewa</th>
                    <th className="py-3 px-3 text-right">Beban (OPEX)</th>
                    <th className="py-3 px-3 text-right">Laba Bersih (NOI)</th>
                    <th className="py-3 px-3 text-right">RevPAR / Unit</th>
                    <th className="py-3 px-3 text-right rounded-tr-xl">Deposit (2100)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.branchBreakdown.map(b => {
                    const isSelected = String(b.propertyId) === String(selectedPropertyId);
                    return (
                      <tr
                        key={b.propertyId}
                        onClick={() =>
                          handlePropertyChange(isSelected ? 'all' : String(b.propertyId))
                        }
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-teal-50/80 font-semibold' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-3 px-3 font-extrabold text-slate-900">{b.propertyName}</td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {b.propertyType}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center font-mono">
                          {b.occupiedRooms} / {b.totalRooms} Kamar
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold ${
                              b.occupancyRate >= 70
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {b.occupancyRate}%
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-emerald-700 tabular-nums">
                          {formatRupiah(b.effectiveRevenue)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-rose-600 tabular-nums">
                          {formatRupiah(b.totalExpenses)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-black text-slate-900 tabular-nums">
                          {formatRupiah(b.netOperatingIncome)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-600 tabular-nums">
                          {formatRupiah(b.revPar)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-purple-700 tabular-nums">
                          {formatRupiah(b.depositHeld)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Register Pendapatan & Status Sewa per Nomor Kamar */}
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-mono uppercase font-extrabold text-indigo-700 tracking-wider block">
                  Buku Register Unit Kamar Kos
                </span>
                <h3 className="text-base font-black text-slate-900 font-display">
                  Rincian Status Hunian, Penghuni &amp; Pendapatan per Nomor Kamar ({filteredRoomRegister.length} Unit)
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={roomSearch}
                    onChange={e => setRoomSearch(e.target.value)}
                    placeholder="Cari nomor kamar / penghuni..."
                    className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-slate-50 outline-none focus:border-teal-600"
                  />
                </div>
                <select
                  value={roomStatusFilter}
                  onChange={e => setRoomStatusFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold bg-white"
                >
                  <option value="all">Semua Status Kamar</option>
                  <option value="occupied">Terisi (Occupied)</option>
                  <option value="available">Tersedia (Available)</option>
                  <option value="reserved">Dipesan / Hold (Reserved)</option>
                  <option value="maintenance">Perbaikan (Maintenance)</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-100 text-slate-700 text-[10px] font-mono uppercase border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3">Kamar</th>
                    <th className="py-3 px-3">Cabang Kos</th>
                    <th className="py-3 px-3">Status Unit</th>
                    <th className="py-3 px-3">Penghuni Aktif</th>
                    <th className="py-3 px-3">Mulai Sewa &amp; Sisa Hari</th>
                    <th className="py-3 px-3 text-right">Tarif / Bln</th>
                    <th className="py-3 px-3 text-right">Pendapatan Kamar</th>
                    <th className="py-3 px-3 text-right">Deposit (2100)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRoomRegister.map(rm => (
                    <tr key={rm.roomId} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono font-extrabold text-slate-900">
                        Kamar {rm.roomNumber}
                        {rm.isAirbnbEnabled && (
                          <span className="ml-1.5 px-1.5 py-0.2 rounded bg-rose-50 text-rose-600 border border-rose-200 text-[9px] font-mono">
                            Airbnb
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{rm.propertyName}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold uppercase ${
                            rm.status === 'occupied'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : rm.status === 'reserved'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : rm.status === 'maintenance'
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {rm.status === 'occupied'
                            ? 'Terisi'
                            : rm.status === 'reserved'
                              ? 'Hold 15m'
                              : rm.status === 'maintenance'
                                ? 'Perbaikan'
                                : 'Tersedia'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800">{rm.tenantName}</td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                        {rm.checkInDate !== '-' ? (
                          <span>
                            {rm.checkInDate}{' '}
                            {rm.remainingDays !== null && (
                              <strong
                                className={
                                  rm.remainingDays <= 7 ? 'text-rose-600' : 'text-emerald-700'
                                }
                              >
                                ({rm.remainingDays} hr)
                              </strong>
                            )}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700 tabular-nums">
                        {formatRupiah(rm.monthlyTariff)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700 tabular-nums">
                        {formatRupiah(rm.realizedRoomRevenue)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-purple-700 tabular-nums">
                        {formatRupiah(rm.depositHeld)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 5: TAGIHAN PENGHUNI, PIUTANG (AR) & DANA TITIPAN DEPOSIT
      ===================================================================== */}
      {activeReportTab === 'piutang_deposit' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-5 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <span className="text-[10px] font-mono uppercase font-extrabold text-amber-700 tracking-wider block">
                Accounts Receivable (AR) &amp; Security Deposit Register
              </span>
              <h3 className="text-base font-black text-slate-900 font-display">
                Daftar Tagihan Sewa Penghuni, Piutang Tertunda &amp; Jaminan Deposit Kamar
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={arSearch}
                  onChange={e => setArSearch(e.target.value)}
                  placeholder="Cari nama penghuni / Order ID..."
                  className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-slate-50 outline-none focus:border-teal-600"
                />
              </div>
              <select
                value={arStatusFilter}
                onChange={e => setArStatusFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold bg-white"
              >
                <option value="all">Semua Status Tagihan</option>
                <option value="paid">Lunas (Paid/Approved)</option>
                <option value="pending">Menunggu Bayar (Pending AR)</option>
                <option value="overdue">Jatuh Tempo (Overdue)</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-900 text-white text-[10px] font-mono uppercase">
                <tr>
                  <th className="py-3 px-3">Order / Invoice ID</th>
                  <th className="py-3 px-3">Nama Penghuni</th>
                  <th className="py-3 px-3">Cabang &amp; Kamar</th>
                  <th className="py-3 px-3">Mulai &amp; Durasi</th>
                  <th className="py-3 px-3 text-right">Pokok Sewa (4000)</th>
                  <th className="py-3 px-3 text-right">Deposit (2100)</th>
                  <th className="py-3 px-3 text-right">Total Tagihan</th>
                  <th className="py-3 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredReceivables.map(row => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono font-bold text-indigo-700">{row.orderId}</td>
                    <td className="py-2.5 px-3">
                      <strong className="text-slate-900 block">{row.tenantName}</strong>
                      <span className="text-[10px] font-mono text-slate-500">{row.phone}</span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="font-bold text-slate-800">Kamar {row.roomNumber}</span>
                      <span className="block text-[10px] text-slate-500">{row.propertyName}</span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                      {row.checkInDate} ({row.durationMonths} Bln)
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                      {formatRupiah(row.rentAmount)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-purple-700 tabular-nums">
                      {formatRupiah(row.depositAmount)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900 tabular-nums">
                      {formatRupiah(row.totalAmount)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold uppercase ${
                          row.status === 'paid'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : row.status === 'pending'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {row.status === 'paid'
                          ? 'LUNAS'
                          : row.status === 'pending'
                            ? 'PIUTANG PENDING'
                            : row.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredReceivables.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      Tidak ada data tagihan penghuni untuk filter ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 6: NERACA SALDO (TRIAL BALANCE) & BAGAN AKUN (COA)
      ===================================================================== */}
      {activeReportTab === 'neraca_coa' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-5 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <span className="text-[10px] font-mono uppercase font-extrabold text-indigo-700 tracking-wider block">
                Chart of Accounts (COA) &amp; Trial Balance
              </span>
              <h3 className="text-base font-black text-slate-900 font-display">
                Neraca Saldo Buku Besar Standar Akuntansi Kosan ({report.trialBalance.rows.length} Akun)
              </h3>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="px-3 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                Double-Entry Terverifikasi
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white text-[10px] font-mono uppercase">
                  <th className="py-3 px-4 rounded-tl-xl">Kode Akun</th>
                  <th className="py-3 px-4">Nama Akun (COA Standar Kos)</th>
                  <th className="py-3 px-4">Kelompok</th>
                  <th className="py-3 px-4 text-center">Saldo Normal</th>
                  <th className="py-3 px-4 text-right rounded-tr-xl">Saldo Akhir (IDR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.trialBalance.rows.map(acc => (
                  <tr key={acc.code} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono font-bold text-indigo-700">[{acc.code}]</td>
                    <td className="py-2.5 px-4 font-bold text-slate-800">{acc.name}</td>
                    <td className="py-2.5 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold bg-slate-100 text-slate-700">
                        {acc.type}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-center font-mono text-[10px] uppercase text-slate-500">
                      {acc.normalSide}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-extrabold text-slate-900 tabular-nums">
                      {formatRupiah(acc.endingBalance)}
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

export default KosanFinancialReportSuite;
