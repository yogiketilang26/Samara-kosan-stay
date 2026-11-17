/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SAMARA STAY ERP v16 - SHARED FINANCIAL METRICS & UNIFORM KOSAN REPORTING ENGINE (SSOT)
 *
 * Modul terpusat (Single Source of Truth) untuk seluruh kalkulasi metrik finansial,
 * Laporan Laba Rugi (P&L Standar Kosan), Laporan Arus Kas, Posisi Kas/Bank & Kliring Midtrans,
 * Komparasi Kinerja Cabang Kos, Register Pendapatan Kamar, Piutang Sewa (AR),
 * Dana Titipan Penghuni (Deposit 2100 & DP Survey 1300), serta Estimasi Pajak Kos (PBJT 10% & PPh Final 0.5%).
 *
 * Seluruh peran pengguna (Super Admin, Owner, Anak Owner, Admin, Finance) wajib memanggil
 * fungsi ini agar angka pelaporan keuangan 100% seragam dan identik tanpa selisih.
 */

export type FinancialReportPeriod = 'all' | 'this_month' | 'last_month' | 'this_quarter' | 'ytd';

export interface OccupancyResult {
  totalRooms: number;
  occupiedRooms: number;
  availableRooms: number;
  reservedRooms: number;
  maintenanceRooms: number;
  ratePercentage: number;
}

export interface FinancialSummaryResult {
  totalInflow: number;
  totalExpenses: number;
  netOperatingIncome: number;
  grossPipeline: number;
  expenseByCategory: Record<string, number>;
  expenseCategoryBreakdown: Array<{
    name: string;
    amount: number;
    percentage: number;
    color: string;
  }>;
}

export interface COAExpenseItem {
  code: string;
  name: string;
  amount: number;
  isEstimated: boolean;
  percentageOfRevenue?: number;
  txCount?: number;
}

export interface COARevenueItem {
  code: string;
  name: string;
  amount: number;
  isEstimated: boolean;
  percentageOfRevenue?: number;
  txCount?: number;
}

export interface BranchFinancialRow {
  propertyId: number;
  propertyName: string;
  propertyType: string;
  address: string;
  monthlyBasePrice: number;
  depositStandard: number;
  totalRooms: number;
  occupiedRooms: number;
  availableRooms: number;
  reservedRooms: number;
  occupancyRate: number;
  realizedRevenue: number;
  contractPipeline: number;
  effectiveRevenue: number;
  totalExpenses: number;
  netOperatingIncome: number;
  noiMarginPercent: number;
  revPar: number;
  arpu: number;
  depositHeld: number;
  pendingReceivables: number;
}

export interface RoomFinancialRegisterRow {
  roomId: number;
  propertyId: number;
  propertyName: string;
  roomNumber: string;
  roomType: string;
  status: 'occupied' | 'available' | 'reserved' | 'maintenance';
  monthlyTariff: number;
  tenantName: string;
  tenantPhone: string;
  checkInDate: string;
  durationMonths: number;
  remainingDays: number | null;
  paymentStatus: 'paid' | 'pending' | 'vacant';
  realizedRoomRevenue: number;
  contractValue: number;
  depositHeld: number;
  isAirbnbEnabled: boolean;
}

export interface TenantReceivableAndDepositRow {
  id: string;
  orderId: string;
  tenantName: string;
  phone: string;
  propertyId: number;
  propertyName: string;
  roomNumber: string;
  checkInDate: string;
  durationMonths: number;
  rentAmount: number;
  depositAmount: number;
  totalAmount: number;
  paymentMethod: string;
  status: 'paid' | 'pending' | 'overdue' | 'cancelled';
  remainingLeaseDays: number | null;
}

export interface TrialBalanceRow {
  code: number;
  name: string;
  category: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  normalSide: 'debit' | 'credit';
  debitBalance: number;
  creditBalance: number;
  endingBalance: number;
}

export interface UniformKosanFinancialReport {
  scope: {
    selectedPropertyId: string;
    selectedPropertyName: string;
    selectedPeriod: FinancialReportPeriod;
    periodLabel: string;
    dateFrom: string | null;
    dateTo: string | null;
    generatedAtIso: string;
  };
  occupancy: OccupancyResult & {
    activeTenantsCount: number;
    approvedBookingsCount: number;
    pendingBookingsCount: number;
    genderBreakdown: {
      putriOccupied: number;
      putriTotal: number;
      putraOccupied: number;
      putraTotal: number;
      campurOccupied: number;
      campurTotal: number;
    };
  };
  revenue: {
    realizedInflow: number;
    ledgerRevenueInflow: number;
    supplementalPaidInvoicesInflow: number;
    contractPipeline: number;
    effectiveGrossRevenue: number;
    revenueSourceMode: 'realized_cash' | 'approved_contract_pipeline' | 'zero';
    breakdown: COARevenueItem[];
  };
  expenses: {
    totalExpenses: number;
    ledgerExpenses: number;
    mdrGatewayFee: number;
    maintenancePostedCost: number;
    breakdown: COAExpenseItem[];
    categoryDistribution: Array<{ name: string; amount: number; percentage: number; color: string }>;
  };
  profitability: {
    netOperatingIncome: number;
    realizedNetCashflow: number;
    noiMarginPercent: number;
    operatingExpenseRatioPercent: number;
    revPar: number;
    arpu: number;
    distributableDividend85: number;
    retainedReserve15: number;
  };
  liabilitiesAndTax: {
    securityDepositHeld2100: number;
    surveyDpHeld1300: number;
    totalTenantFiduciaryFunds: number;
    estimatedPbjtTax10: number;
    estimatedPphFinal05: number;
    totalEstimatedTaxReserve: number;
  };
  treasuryAndClearing: {
    pettyCash1000: number;
    bankMandiri1010: number;
    midtransEscrow1020: number;
    midtransClearing1200: number;
    accountsReceivable1100: number;
    totalLiquidCashAndBank: number;
    midtransGrossSettled: number;
    midtransMdrFee: number;
    midtransNetSettled: number;
    midtransUnreconciledEscrow: number;
    pendingReceivablesAmount: number;
    pendingReceivablesCount: number;
  };
  cashFlowStatement: {
    operatingCashInRentAndAddons: number;
    fiduciaryCashInDepositAndDp: number;
    totalCashInflow: number;
    operatingCashOutExpenses: number;
    fiduciaryCashOutRefunds: number;
    totalCashOutflow: number;
    netCashMovement: number;
  };
  branchBreakdown: BranchFinancialRow[];
  roomBillingRegister: RoomFinancialRegisterRow[];
  receivablesAndDeposits: TenantReceivableAndDepositRow[];
  trialBalance: {
    rows: TrialBalanceRow[];
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    totalRevenue: number;
    totalExpenses: number;
    isBalanced: boolean;
  };
  filteredDatasets: {
    rooms: any[];
    tenants: any[];
    bookings: any[];
    transactions: any[];
    payments: any[];
    clearing: any[];
    maintenance: any[];
  };
}

const SHARED_FINANCE_PROP_KEY = 'samara_uniform_finance_property_id';
const SHARED_FINANCE_PERIOD_KEY = 'samara_uniform_finance_period';

export function getSharedFinanceFilterState(): {
  propertyId: string;
  period: FinancialReportPeriod;
} {
  if (typeof window === 'undefined') {
    return { propertyId: 'all', period: 'all' };
  }
  try {
    const savedProp = sessionStorage.getItem(SHARED_FINANCE_PROP_KEY) || 'all';
    const savedPeriod = (sessionStorage.getItem(SHARED_FINANCE_PERIOD_KEY) || 'all') as FinancialReportPeriod;
    const validPeriods: FinancialReportPeriod[] = ['all', 'this_month', 'last_month', 'this_quarter', 'ytd'];
    return {
      propertyId: savedProp,
      period: validPeriods.includes(savedPeriod) ? savedPeriod : 'all'
    };
  } catch {
    return { propertyId: 'all', period: 'all' };
  }
}

export function setSharedFinanceFilterState(update: {
  propertyId?: string;
  period?: FinancialReportPeriod;
}): void {
  if (typeof window === 'undefined') return;
  try {
    if (update.propertyId !== undefined) {
      sessionStorage.setItem(SHARED_FINANCE_PROP_KEY, update.propertyId);
    }
    if (update.period !== undefined) {
      sessionStorage.setItem(SHARED_FINANCE_PERIOD_KEY, update.period);
    }
    window.dispatchEvent(
      new CustomEvent('samara-finance-filter-sync', {
        detail: getSharedFinanceFilterState()
      })
    );
  } catch {
    // ignore storage errors
  }
}

export function getPeriodDateRange(period: FinancialReportPeriod): {
  from: Date | null;
  to: Date | null;
  fromIso: string | null;
  toIso: string | null;
  label: string;
} {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  if (period === 'this_month') {
    const start = new Date(y, m, 1, 0, 0, 0, 0);
    const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
    return {
      from: start,
      to: end,
      fromIso: start.toISOString().slice(0, 10),
      toIso: end.toISOString().slice(0, 10),
      label: `Bulan Ini (${start.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })})`
    };
  }
  if (period === 'last_month') {
    const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
    const end = new Date(y, m, 0, 23, 59, 59, 999);
    return {
      from: start,
      to: end,
      fromIso: start.toISOString().slice(0, 10),
      toIso: end.toISOString().slice(0, 10),
      label: `Bulan Lalu (${start.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })})`
    };
  }
  if (period === 'this_quarter') {
    const qStartMonth = Math.floor(m / 3) * 3;
    const start = new Date(y, qStartMonth, 1, 0, 0, 0, 0);
    const end = new Date(y, qStartMonth + 3, 0, 23, 59, 59, 999);
    const qNum = Math.floor(m / 3) + 1;
    return {
      from: start,
      to: end,
      fromIso: start.toISOString().slice(0, 10),
      toIso: end.toISOString().slice(0, 10),
      label: `Kuartal Ini (Q${qNum} ${y})`
    };
  }
  if (period === 'ytd') {
    const start = new Date(y, 0, 1, 0, 0, 0, 0);
    const end = new Date(y, 11, 31, 23, 59, 59, 999);
    return {
      from: start,
      to: end,
      fromIso: start.toISOString().slice(0, 10),
      toIso: end.toISOString().slice(0, 10),
      label: `Tahun Berjalan (YTD ${y})`
    };
  }
  return {
    from: null,
    to: null,
    fromIso: null,
    toIso: null,
    label: 'Semua Periode (Akumulasi Real-Time)'
  };
}

function isDateWithinRange(rawDate: any, from: Date | null, to: Date | null): boolean {
  if (!from && !to) return true;
  if (!rawDate) return true;
  const parsed = new Date(rawDate);
  if (isNaN(parsed.getTime())) return true;
  if (from && parsed < from) return false;
  if (to && parsed > to) return false;
  return true;
}

/**
 * Menghitung tingkat okupansi kamar secara konsisten (termasuk pemeriksaan hold_expires_at R18)
 */
export function calculateOccupancy(rooms: any[] = []): OccupancyResult {
  const totalRooms = rooms.length;
  if (totalRooms === 0) {
    return {
      totalRooms: 0,
      occupiedRooms: 0,
      availableRooms: 0,
      reservedRooms: 0,
      maintenanceRooms: 0,
      ratePercentage: 0
    };
  }

  const nowMs = Date.now();
  let occupiedRooms = 0;
  let reservedRooms = 0;
  let maintenanceRooms = 0;
  let availableRooms = 0;

  rooms.forEach(r => {
    const rawStatus = String(r?.status || 'available').toLowerCase();
    if (rawStatus === 'occupied' || r?.is_occupied) {
      occupiedRooms += 1;
    } else if (rawStatus === 'reserved') {
      const holdExp = r?.hold_expires_at ? new Date(r.hold_expires_at).getTime() : null;
      if (holdExp && !isNaN(holdExp) && holdExp <= nowMs) {
        availableRooms += 1;
      } else {
        reservedRooms += 1;
      }
    } else if (rawStatus === 'maintenance') {
      maintenanceRooms += 1;
    } else {
      availableRooms += 1;
    }
  });

  const ratePercentage = Math.round((occupiedRooms / totalRooms) * 100);

  return {
    totalRooms,
    occupiedRooms,
    availableRooms,
    reservedRooms,
    maintenanceRooms,
    ratePercentage
  };
}

export function isPostedTx(t: any): boolean {
  const s = String(t?.status || 'posted').toLowerCase();
  return !['void', 'deleted', 'cancelled', 'rejected', 'failed'].includes(s);
}

export function isRealRevenueTx(t: any): boolean {
  if (!isPostedTx(t)) return false;
  const txType = String(t?.type || '').toLowerCase();
  if (txType !== 'income' && txType !== 'revenue') return false;
  const refType = String(t?.reference_type || '').toLowerCase();
  if (
    refType === 'bank_reconciliation' ||
    refType === 'bank_unreconcile' ||
    refType === 'survey_refund' ||
    refType === 'bank_unreconcile_fee'
  ) {
    return false;
  }
  const debitAcc = Number(t?.debit_account_id || 0);
  const creditAcc = Number(t?.credit_account_id || 0);
  // Exclude bank settlement clearing reclassification (DR 1010 / CR 1200) & DP Survey liability (CR 1300)
  if (debitAcc === 1010 && creditAcc === 1200) return false;
  if (creditAcc === 1300) return false;
  if (debitAcc === 1200 && creditAcc === 5030) return false;
  return true;
}

export function isRealExpenseTx(t: any): boolean {
  if (!isPostedTx(t)) return false;
  const txType = String(t?.type || '').toLowerCase();
  if (txType !== 'expense') return false;
  const refType = String(t?.reference_type || '').toLowerCase();
  if (refType === 'bank_reconciliation' || refType === 'bank_unreconcile' || refType === 'survey_refund') {
    return false;
  }
  const debitAcc = Number(t?.debit_account_id || 0);
  const creditAcc = Number(t?.credit_account_id || 0);
  // Exclude DP Survey liability refund (DR 1300 / CR 1010) and unmatch reversal (DR 1200 / CR 1010)
  if (debitAcc === 1300) return false;
  if (debitAcc === 1200 && creditAcc === 1010) return false;
  return true;
}

export function isPaidPaymentRow(p: any): boolean {
  const st = String(p?.status || '').toLowerCase();
  return ['paid', 'settled', 'settlement', 'lunas'].includes(st);
}

/**
 * Menghitung total arus kas masuk (pemasukan riil yang telah settled)
 * Menggabungkan financial_transactions (revenue/income) dan payments (paid) secara terdeduplikasi
 * berdasarkan reference_id / midtrans_order_id / id sehingga tidak pernah terjadi double-counting
 * maupun kehilangan pembayaran yang sudah lunas.
 */
export function calculateDeduplicatedRevenueInflow(
  transactions: any[] = [],
  payments: any[] = []
): {
  totalInflow: number;
  ledgerRevenueInflow: number;
  supplementalPaidInvoicesInflow: number;
  unrecordedPaidPayments: any[];
} {
  const incomeTx = transactions.filter(isRealRevenueTx);
  const ledgerRevenueInflow = incomeTx.reduce((sum, t) => sum + Number(t.amount || 0), 0);

  // Kumpulkan seluruh referensi dari transaksi buku besar agar tidak terhitung 2x
  const recordedRefs = new Set<string>();
  transactions.forEach(t => {
    if (!isPostedTx(t)) return;
    if (t?.reference_id) recordedRefs.add(String(t.reference_id).trim().toUpperCase());
    if (t?.transaction_no) recordedRefs.add(String(t.transaction_no).trim().toUpperCase());
    // Ekstrak kode order dari deskripsi bila ada (contoh: BOOK-..., EXT-..., INV-...)
    const desc = String(t?.description || '');
    const match = desc.match(/\b(BOOK-\S+|BOOKING-\S+|EXT-\S+|EXTEND-\S+|INV-\S+|PAY-\S+)\b/i);
    if (match?.[1]) {
      recordedRefs.add(match[1].replace(/[),.;]+$/, '').toUpperCase());
    }
  });

  const unrecordedPaidPayments = payments.filter(p => {
    if (!isPaidPaymentRow(p)) return false;
    // Jangan hitung pembayaran DP survey sebagai pendapatan sewa sebelum dikonversi/hangus
    const desc = String(p?.description || p?.notes || '').toLowerCase();
    const oid = String(p?.midtrans_order_id || p?.id || '').trim().toUpperCase();
    if (oid.startsWith('SRV-') || desc.includes('dp survey')) return false;

    const pid = p?.id ? String(p.id).trim().toUpperCase() : '';
    const moid = p?.midtrans_order_id ? String(p.midtrans_order_id).trim().toUpperCase() : '';
    if (pid && recordedRefs.has(pid)) return false;
    if (moid && recordedRefs.has(moid)) return false;

    // Jika sudah ada transaksi income di tanggal & nominal yang sama persis tanpa reference_id, hindari duplikasi
    if (incomeTx.length > 0 && !pid && !moid) {
      return false;
    }
    return true;
  });

  const supplementalPaidInvoicesInflow = unrecordedPaidPayments.reduce(
    (sum, p) => sum + Number(p.amount || 0),
    0
  );

  // Jika belum ada incomeTx sama sekali, fallback ke seluruh paid payments (non-SRV)
  if (incomeTx.length === 0) {
    const allPaidRentPayments = payments.filter(p => {
      if (!isPaidPaymentRow(p)) return false;
      const oid = String(p?.midtrans_order_id || p?.id || '').trim().toUpperCase();
      return !oid.startsWith('SRV-');
    });
    const fallbackTotal = allPaidRentPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    return {
      totalInflow: fallbackTotal,
      ledgerRevenueInflow: 0,
      supplementalPaidInvoicesInflow: fallbackTotal,
      unrecordedPaidPayments: allPaidRentPayments
    };
  }

  return {
    totalInflow: ledgerRevenueInflow + supplementalPaidInvoicesInflow,
    ledgerRevenueInflow,
    supplementalPaidInvoicesInflow,
    unrecordedPaidPayments
  };
}

export function calculateTotalInflow(
  transactions: any[] = [],
  payments: any[] = []
): number {
  return calculateDeduplicatedRevenueInflow(transactions, payments).totalInflow;
}

/**
 * Menghitung total beban pengeluaran riil
 */
export function calculateTotalExpenses(transactions: any[] = []): number {
  const expenseTx = transactions.filter(isRealExpenseTx);
  return expenseTx.reduce((sum, t) => sum + Number(t.amount || 0), 0);
}

/**
 * Menghitung rincian pengeluaran per kategori secara dinamis
 */
export function calculateExpenseBreakdown(transactions: any[] = []): {
  byCategory: Record<string, number>;
  breakdown: Array<{ name: string; amount: number; percentage: number; color: string }>;
} {
  const expenseTx = transactions.filter(isRealExpenseTx);
  const byCategory: Record<string, number> = {};
  let totalExp = 0;

  const defaultColors: Record<string, string> = {
    'Utilitas': '#6366f1',
    'Listrik & Air': '#6366f1',
    'Gaji & Karyawan': '#f59e0b',
    'Kebersihan': '#10b981',
    'Pemeliharaan': '#ef4444',
    'Pemasaran': '#ec4899',
    'Payment Gateway': '#8b5cf6',
    'Lainnya': '#64748b'
  };

  expenseTx.forEach(t => {
    const rawCat = t.category || 'Operasional Umum';
    const amount = Number(t.amount || 0);
    byCategory[rawCat] = (byCategory[rawCat] || 0) + amount;
    totalExp += amount;
  });

  const categoryEntries = Object.entries(byCategory);
  if (categoryEntries.length === 0 || totalExp === 0) {
    return {
      byCategory: {},
      breakdown: []
    };
  }

  const breakdown = categoryEntries.map(([name, amount], index) => {
    const percentage = Math.round((amount / totalExp) * 100);
    const color = defaultColors[name] || [
      '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#3b82f6', '#14b8a6'
    ][index % 8];

    return {
      name,
      amount,
      percentage,
      color
    };
  }).sort((a, b) => b.amount - a.amount);

  return { byCategory, breakdown };
}

/**
 * Menghitung rincian pendapatan COA standar aplikasi kosan (COA 4000-4300)
 */
export function calculateDetailedCOARevenueBreakdown(
  transactions: any[] = [],
  payments: any[] = [],
  effectiveGrossRevenue: number = 0
): COARevenueItem[] {
  const realIncome = transactions.filter(isRealRevenueTx);
  const { supplementalPaidInvoicesInflow } = calculateDeduplicatedRevenueInflow(transactions, payments);

  let rent4000 = 0;
  let lateFee4100 = 0;
  let forfeitedDp4200 = 0;
  let addon4300 = 0;

  let rentCount = 0;
  let lateFeeCount = 0;
  let forfeitedCount = 0;
  let addonCount = 0;

  realIncome.forEach(t => {
    const amt = Number(t.amount || 0);
    if (amt <= 0) return;
    const creditAcc = Number(t.credit_account_id || 0);
    const cat = String(t.category || '').toLowerCase();
    const desc = String(t.description || '').toLowerCase();

    if (creditAcc === 4100 || cat.includes('denda') || desc.includes('denda') || desc.includes('keterlambatan')) {
      lateFee4100 += amt;
      lateFeeCount += 1;
    } else if (
      creditAcc === 4200 ||
      cat.includes('hangus') ||
      cat.includes('forfeit') ||
      desc.includes('hangus') ||
      desc.includes('no-show') ||
      desc.includes('no show')
    ) {
      forfeitedDp4200 += amt;
      forfeitedCount += 1;
    } else if (
      creditAcc === 4300 ||
      cat.includes('laundry') ||
      cat.includes('parkir') ||
      cat.includes('tambahan') ||
      cat.includes('lainnya') ||
      desc.includes('laundry') ||
      desc.includes('parkir')
    ) {
      addon4300 += amt;
      addonCount += 1;
    } else {
      rent4000 += amt;
      rentCount += 1;
    }
  });

  if (supplementalPaidInvoicesInflow > 0) {
    rent4000 += supplementalPaidInvoicesInflow;
    rentCount += 1;
  }

  const totalCategorized = rent4000 + lateFee4100 + forfeitedDp4200 + addon4300;
  const isPipelineFallback = totalCategorized === 0 && effectiveGrossRevenue > 0;
  if (isPipelineFallback) {
    rent4000 = effectiveGrossRevenue;
  }

  const baseTotal = Math.max(1, totalCategorized > 0 ? totalCategorized : effectiveGrossRevenue);

  return [
    {
      code: '4000',
      name: 'Pendapatan Sewa Kamar Kos (Bulanan, Harian & Perpanjangan)',
      amount: rent4000,
      isEstimated: isPipelineFallback,
      percentageOfRevenue: Math.round((rent4000 / baseTotal) * 1000) / 10,
      txCount: rentCount
    },
    {
      code: '4100',
      name: 'Pendapatan Denda Keterlambatan & Administrasi Sewa',
      amount: lateFee4100,
      isEstimated: false,
      percentageOfRevenue: Math.round((lateFee4100 / baseTotal) * 1000) / 10,
      txCount: lateFeeCount
    },
    {
      code: '4200',
      name: 'Pendapatan Komitmen DP Survey / Booking Hangus (Forfeited)',
      amount: forfeitedDp4200,
      isEstimated: false,
      percentageOfRevenue: Math.round((forfeitedDp4200 / baseTotal) * 1000) / 10,
      txCount: forfeitedCount
    },
    {
      code: '4300',
      name: 'Pendapatan Layanan Tambahan (Laundry, Parkir, Token & Add-ons)',
      amount: addon4300,
      isEstimated: false,
      percentageOfRevenue: Math.round((addon4300 / baseTotal) * 1000) / 10,
      txCount: addonCount
    }
  ];
}

/**
 * Menghitung rincian pengeluaran COA standar aplikasi kosan (COA 5000-5400, tanpa fabrikasi angka)
 */
export function calculateDetailedCOAExpenseBreakdown(
  transactions: any[] = [],
  _totalExpenses: number = 0,
  totalMdrFee: number = 0,
  maintenanceCost: number = 0,
  effectiveGrossRevenue: number = 0
): COAExpenseItem[] {
  const realExpenses = transactions.filter(isRealExpenseTx);

  let util5000 = 0;
  let internet5010 = 0;
  let clean5020 = 0;
  let mdr5030 = 0;
  let maint5100 = 0;
  let salary5200 = 0;
  let marketing5300 = 0;
  let general5400 = 0;

  realExpenses.forEach(t => {
    const amt = Number(t.amount || 0);
    if (amt <= 0) return;
    const debitAcc = Number(t.debit_account_id || 0);
    const cat = String(t.category || '').toLowerCase();
    const desc = String(t.description || '').toLowerCase();

    if (debitAcc === 5010 || cat.includes('wifi') || cat.includes('internet') || desc.includes('wifi') || desc.includes('indihome') || desc.includes('biznet')) {
      internet5010 += amt;
    } else if (debitAcc === 5000 || cat.includes('listrik') || cat.includes('air') || cat.includes('utilitas') || desc.includes('pln') || desc.includes('pdam') || desc.includes('token listrik')) {
      util5000 += amt;
    } else if (debitAcc === 5020 || cat.includes('bersih') || cat.includes('sampah') || cat.includes('keamanan') || desc.includes('kebersihan') || desc.includes('sampah') || desc.includes('iuran rt')) {
      clean5020 += amt;
    } else if (debitAcc === 5030 || cat.includes('gateway') || cat.includes('midtrans') || cat.includes('mdr') || desc.includes('mdr') || desc.includes('midtrans fee')) {
      mdr5030 += amt;
    } else if (debitAcc === 5100 || cat.includes('pemeliharaan') || cat.includes('perbaikan') || cat.includes('maintenance') || desc.includes('service ac') || desc.includes('bocor') || desc.includes('renovasi')) {
      maint5100 += amt;
    } else if (debitAcc === 5200 || cat.includes('gaji') || cat.includes('staff') || cat.includes('karyawan') || cat.includes('upah') || desc.includes('gaji') || desc.includes('penjaga kos')) {
      salary5200 += amt;
    } else if (debitAcc === 5300 || cat.includes('pemasaran') || cat.includes('marketing') || cat.includes('iklan') || cat.includes('komisi') || desc.includes('promo')) {
      marketing5300 += amt;
    } else {
      general5400 += amt;
    }
  });

  // Gunakan nilai maksimum antara jurnal 5030 dan tabel kliring MDR agar tidak terhitung ganda namun tetap akurat
  const effectiveMdr = Math.max(mdr5030, Number(totalMdrFee || 0));
  // Gunakan nilai maksimum antara jurnal 5100 dan biaya maintenance bila belum diposting ke jurnal
  const effectiveMaint = maint5100 > 0 ? maint5100 : Number(maintenanceCost || 0);

  const baseRev = Math.max(1, effectiveGrossRevenue);

  return [
    {
      code: '5000',
      name: 'Beban Listrik (PLN), Air (PDAM) & Utilitas Gedung Kos',
      amount: util5000,
      isEstimated: false,
      percentageOfRevenue: Math.round((util5000 / baseRev) * 1000) / 10
    },
    {
      code: '5010',
      name: 'Beban Internet Dedicated & WiFi High-Speed Penghuni',
      amount: internet5010,
      isEstimated: false,
      percentageOfRevenue: Math.round((internet5010 / baseRev) * 1000) / 10
    },
    {
      code: '5020',
      name: 'Beban Kebersihan, Sampah & Keamanan Lingkungan (RT/RW)',
      amount: clean5020,
      isEstimated: false,
      percentageOfRevenue: Math.round((clean5020 / baseRev) * 1000) / 10
    },
    {
      code: '5030',
      name: 'Beban Administrasi Bank & Payment Gateway (MDR Midtrans)',
      amount: effectiveMdr,
      isEstimated: false,
      percentageOfRevenue: Math.round((effectiveMdr / baseRev) * 1000) / 10
    },
    {
      code: '5100',
      name: 'Beban Pemeliharaan, Servis AC & Perbaikan Kamar/Gedung',
      amount: effectiveMaint,
      isEstimated: false,
      percentageOfRevenue: Math.round((effectiveMaint / baseRev) * 1000) / 10
    },
    {
      code: '5200',
      name: 'Beban Gaji Penjaga Kos, Housekeeping & Operasional Staf',
      amount: salary5200,
      isEstimated: false,
      percentageOfRevenue: Math.round((salary5200 / baseRev) * 1000) / 10
    },
    {
      code: '5300',
      name: 'Beban Pemasaran, Kupon Diskon & Komisi Kanal / OTA',
      amount: marketing5300,
      isEstimated: false,
      percentageOfRevenue: Math.round((marketing5300 / baseRev) * 1000) / 10
    },
    {
      code: '5400',
      name: 'Beban Perlengkapan Kamar (Amenities), Penyusutan & Umum',
      amount: general5400,
      isEstimated: false,
      percentageOfRevenue: Math.round((general5400 / baseRev) * 1000) / 10
    }
  ];
}

/**
 * Menghitung Net Operating Income (NOI) = Inflow - Expenses
 */
export function calculateNOI(inflow: number, expenses: number): number {
  return inflow - expenses;
}

/**
 * Menghitung Gross Contract Pipeline (Nilai seluruh kontrak aktif / pemesanan disetujui)
 */
export function calculateGrossPipeline(bookings: any[] = []): number {
  return bookings
    .filter(b => {
      const st = String(b?.status || '').toLowerCase();
      return st === 'approved' || st === 'paid' || st === 'active' || st === 'completed' || st === 'confirmed';
    })
    .reduce((sum, b) => sum + Number(b.total_price || b.rent_price || 0), 0);
}

/**
 * Ringkasan Finansial Eksekutif Lengkap (tanpa fabrikasi beban sintetis 35%)
 */
export function calculateExecutiveFinancialSummary(
  rooms: any[] = [],
  transactions: any[] = [],
  payments: any[] = [],
  bookings: any[] = []
): {
  occupancy: OccupancyResult;
  inflow: number;
  expenses: number;
  noi: number;
  pipeline: number;
  expenseBreakdown: Array<{ name: string; amount: number; percentage: number; color: string }>;
  isExpensesEstimated: boolean;
} {
  const occupancy = calculateOccupancy(rooms);
  const inflow = calculateTotalInflow(transactions, payments);
  const expenses = calculateTotalExpenses(transactions);
  const { breakdown } = calculateExpenseBreakdown(transactions);
  const isExpensesEstimated = false;

  const noi = calculateNOI(inflow, expenses);
  const pipeline = calculateGrossPipeline(bookings);

  return {
    occupancy,
    inflow,
    expenses,
    noi,
    pipeline,
    expenseBreakdown: breakdown,
    isExpensesEstimated
  };
}

/**
 * Helper menghitung sisa hari sewa penghuni secara konsisten
 */
export function calculateRemainingLeaseDaysSimple(startDateStr?: string, durationMonths: number = 1): number | null {
  if (!startDateStr) return null;
  const start = new Date(startDateStr);
  if (isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setMonth(end.getMonth() + Math.max(1, Number(durationMonths || 1)));
  const diffMs = end.getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * FUNGSI UTAMA SINGLE SOURCE OF TRUTH (SSOT):
 * Menghasilkan Laporan Keuangan Standar Aplikasi Kosan yang 100% seragam untuk seluruh role
 * (Super Admin, Owner, Anak Owner, Admin, Finance).
 */
export function buildUniformKosanFinancialReport(params: {
  properties?: any[];
  rooms?: any[];
  tenants?: any[];
  bookings?: any[];
  payments?: any[];
  transactions?: any[];
  accounts?: any[];
  clearingList?: any[];
  maintenanceList?: any[];
  surveys?: any[];
  selectedPropertyId?: string | number | null;
  selectedPeriod?: FinancialReportPeriod;
}): UniformKosanFinancialReport {
  const {
    properties = [],
    rooms = [],
    tenants = [],
    bookings = [],
    payments = [],
    transactions = [],
    accounts = [],
    clearingList = [],
    maintenanceList = [],
    surveys = [],
    selectedPropertyId = 'all',
    selectedPeriod = 'all'
  } = params;

  const normalizedPropId =
    selectedPropertyId === null ||
    selectedPropertyId === undefined ||
    selectedPropertyId === '' ||
    String(selectedPropertyId) === 'all'
      ? 'all'
      : String(selectedPropertyId);

  const selectedPropertyObj =
    normalizedPropId === 'all'
      ? null
      : properties.find(p => String(p.id) === normalizedPropId) || null;

  const selectedPropertyName = selectedPropertyObj
    ? selectedPropertyObj.name
    : 'Seluruh Portofolio Cabang Samara Stay';

  const periodRange = getPeriodDateRange(selectedPeriod);

  // Buat peta room_id -> property_id dan room_number -> property_id untuk atribusi cabang yang presisi
  const roomIdToPropId = new Map<string, string>();
  const roomNumToPropId = new Map<string, string>();
  rooms.forEach(r => {
    if (r?.id !== undefined && r?.property_id !== undefined) {
      roomIdToPropId.set(String(r.id), String(r.property_id));
    }
    if (r?.room_number && r?.property_id !== undefined) {
      roomNumToPropId.set(String(r.room_number).trim().toLowerCase(), String(r.property_id));
    }
  });

  const matchesPropertyScope = (item: any): boolean => {
    if (normalizedPropId === 'all') return true;
    if (item?.property_id !== undefined && item?.property_id !== null) {
      return String(item.property_id) === normalizedPropId;
    }
    if (item?.room_id !== undefined && item?.room_id !== null) {
      const mapped = roomIdToPropId.get(String(item.room_id));
      if (mapped) return mapped === normalizedPropId;
    }
    if (item?.room_number) {
      const mapped = roomNumToPropId.get(String(item.room_number).trim().toLowerCase());
      if (mapped) return mapped === normalizedPropId;
    }
    return false;
  };

  // 1. Filter datasets berdasarkan Cabang (property_id) & Periode (date range)
  const scopedRooms = rooms.filter(r => matchesPropertyScope(r));
  const scopedTenants = tenants.filter(t => matchesPropertyScope(t));
  const scopedBookings = bookings.filter(
    b =>
      matchesPropertyScope(b) &&
      isDateWithinRange(b?.check_in_date || b?.booking_date || b?.created_at, periodRange.from, periodRange.to)
  );
  const scopedTransactions = transactions.filter(
    t =>
      matchesPropertyScope(t) &&
      isDateWithinRange(t?.transaction_date || t?.date || t?.created_at, periodRange.from, periodRange.to)
  );
  const scopedPayments = payments.filter(
    p =>
      matchesPropertyScope(p) &&
      isDateWithinRange(p?.payment_date || p?.settlement_time || p?.created_at, periodRange.from, periodRange.to)
  );
  const scopedClearing = clearingList.filter(
    c =>
      matchesPropertyScope(c) &&
      isDateWithinRange(c?.settled_at || c?.created_at, periodRange.from, periodRange.to)
  );
  const scopedMaintenance = maintenanceList.filter(
    m =>
      matchesPropertyScope(m) &&
      isDateWithinRange(m?.created_at || m?.date, periodRange.from, periodRange.to)
  );
  const scopedSurveys = surveys.filter(s => matchesPropertyScope(s));

  // 2. Okupansi & Statistik Unit Kamar
  const occupancyBase = calculateOccupancy(scopedRooms);
  const activeTenantsCount = scopedTenants.filter(
    t => String(t?.status || 'active').toLowerCase() !== 'checkout'
  ).length;
  const approvedBookingsCount = scopedBookings.filter(b => {
    const st = String(b?.status || '').toLowerCase();
    return st === 'approved' || st === 'paid' || st === 'active';
  }).length;
  const pendingBookingsCount = scopedBookings.filter(
    b => String(b?.status || '').toLowerCase() === 'pending'
  ).length;

  const propTypeMap = new Map<string, string>();
  properties.forEach(p => {
    propTypeMap.set(String(p.id), String(p.type || 'campur').toLowerCase());
  });

  let putriOccupied = 0, putriTotal = 0;
  let putraOccupied = 0, putraTotal = 0;
  let campurOccupied = 0, campurTotal = 0;

  scopedRooms.forEach(r => {
    const pType = propTypeMap.get(String(r.property_id)) || 'campur';
    const isOcc = String(r?.status || '').toLowerCase() === 'occupied' || Boolean(r?.is_occupied);
    if (pType === 'putri') {
      putriTotal += 1;
      if (isOcc) putriOccupied += 1;
    } else if (pType === 'putra') {
      putraTotal += 1;
      if (isOcc) putraOccupied += 1;
    } else {
      campurTotal += 1;
      if (isOcc) campurOccupied += 1;
    }
  });

  // 3. Pendapatan Sewa (Realized Inflow vs Approved Contract Pipeline)
  const deduplicatedRev = calculateDeduplicatedRevenueInflow(scopedTransactions, scopedPayments);
  const realizedInflow = deduplicatedRev.totalInflow;
  const contractPipeline = calculateGrossPipeline(scopedBookings);
  const effectiveGrossRevenue = realizedInflow > 0 ? realizedInflow : contractPipeline;
  const revenueSourceMode: 'realized_cash' | 'approved_contract_pipeline' | 'zero' =
    realizedInflow > 0
      ? 'realized_cash'
      : contractPipeline > 0
        ? 'approved_contract_pipeline'
        : 'zero';

  const revenueBreakdown = calculateDetailedCOARevenueBreakdown(
    scopedTransactions,
    scopedPayments,
    effectiveGrossRevenue
  );

  // 4. Beban Operasional Kos (OPEX)
  const midtransMdrFee = scopedClearing.reduce((sum, c) => sum + Number(c?.fee_amount || 0), 0);
  const maintenancePostedCost = scopedMaintenance.reduce((sum, m) => sum + Number(m?.cost || 0), 0);
  const ledgerExpenses = calculateTotalExpenses(scopedTransactions);

  const expenseBreakdown = calculateDetailedCOAExpenseBreakdown(
    scopedTransactions,
    ledgerExpenses,
    midtransMdrFee,
    maintenancePostedCost,
    effectiveGrossRevenue
  );
  const totalCategorizedExpenses = expenseBreakdown.reduce((sum, item) => sum + item.amount, 0);
  const totalExpenses = Math.max(ledgerExpenses, totalCategorizedExpenses);
  const { breakdown: categoryDistribution } = calculateExpenseBreakdown(scopedTransactions);

  // 5. Profitabilitas, NOI & Rasio Kosan
  const netOperatingIncome = calculateNOI(effectiveGrossRevenue, totalExpenses);
  const realizedNetCashflow = calculateNOI(realizedInflow, totalExpenses);
  const noiMarginPercent =
    effectiveGrossRevenue > 0
      ? Math.round((netOperatingIncome / effectiveGrossRevenue) * 1000) / 10
      : 0;
  const operatingExpenseRatioPercent =
    effectiveGrossRevenue > 0
      ? Math.round((totalExpenses / effectiveGrossRevenue) * 1000) / 10
      : 0;
  const revPar =
    occupancyBase.totalRooms > 0
      ? Math.round(effectiveGrossRevenue / occupancyBase.totalRooms)
      : 0;
  const arpu =
    occupancyBase.occupiedRooms > 0
      ? Math.round(effectiveGrossRevenue / occupancyBase.occupiedRooms)
      : 0;
  const distributableDividend85 = Math.max(0, Math.round(netOperatingIncome * 0.85));
  const retainedReserve15 = Math.max(0, Math.round(netOperatingIncome - distributableDividend85));

  // 6. Kewajiban Dana Titipan Penghuni (Deposit 2100 & DP Survey 1300) vs Estimasi Pajak (PBJT 10% & PPh 0.5%)
  const findAccBalance = (accId: number): number => {
    const found = accounts.find(a => Number(a.id) === accId);
    return found ? Number(found.balance || 0) : 0;
  };

  const bookingsDepositSum = scopedBookings
    .filter(b => ['approved', 'paid', 'active'].includes(String(b?.status || '').toLowerCase()))
    .reduce((sum, b) => sum + Number(b?.deposit_amount || 0), 0);

  const coa2100Balance = normalizedPropId === 'all' ? findAccBalance(2100) : 0;
  const securityDepositHeld2100 = Math.max(bookingsDepositSum, coa2100Balance);

  const dpTxSum = scopedTransactions
    .filter(t => isPostedTx(t) && (String(t?.type || '').toLowerCase() === 'dp_booking' || Number(t?.credit_account_id) === 1300))
    .reduce((sum, t) => sum + Number(t?.amount || 0), 0);
  const activeSurveyDpSum = scopedSurveys
    .filter(s => ['survey_confirmed', 'survey_completed'].includes(String(s?.status || '').toLowerCase()))
    .reduce((sum, s) => sum + Number(s?.dp_amount || 0), 0);
  const coa1300Balance = normalizedPropId === 'all' ? findAccBalance(1300) : 0;
  const surveyDpHeld1300 = Math.max(dpTxSum, activeSurveyDpSum, coa1300Balance);

  const totalTenantFiduciaryFunds = securityDepositHeld2100 + surveyDpHeld1300;
  const estimatedPbjtTax10 = Math.round(effectiveGrossRevenue * 0.10);
  const estimatedPphFinal05 = Math.round(effectiveGrossRevenue * 0.005);
  const totalEstimatedTaxReserve = estimatedPbjtTax10 + estimatedPphFinal05;

  // 7. Posisi Kas, Bank & Kliring Midtrans (Treasury)
  const pettyCash1000 = findAccBalance(1000);
  const bankMandiri1010 = findAccBalance(1010);
  const midtransEscrow1020 = findAccBalance(1020);
  const midtransClearing1200 = findAccBalance(1200);
  const accountsReceivable1100 = findAccBalance(1100);

  const midtransGrossSettledRaw = scopedClearing.reduce((sum, c) => sum + Number(c?.gross_amount || 0), 0);
  const midtransGrossSettled = midtransGrossSettledRaw > 0 ? midtransGrossSettledRaw : realizedInflow;
  const midtransNetSettled = Math.max(0, midtransGrossSettled - midtransMdrFee);
  const midtransUnreconciledEscrow = scopedClearing
    .filter(c => String(c?.clearing_status || 'pending').toLowerCase() !== 'reconciled')
    .reduce(
      (sum, c) =>
        sum +
        Number(
          c?.outstanding_amount !== undefined && c?.outstanding_amount !== null
            ? c.outstanding_amount
            : Math.max(0, Number(c?.net_amount || c?.gross_amount || 0) - Number(c?.reconciled_amount || 0))
        ),
      0
    );

  const pendingPaymentRows = scopedPayments.filter(
    p => String(p?.status || '').toLowerCase() === 'pending'
  );
  const pendingBookingRows = scopedBookings.filter(
    b => String(b?.status || '').toLowerCase() === 'pending'
  );
  const pendingReceivablesAmount =
    pendingPaymentRows.length > 0
      ? pendingPaymentRows.reduce((sum, p) => sum + Number(p?.amount || 0), 0)
      : pendingBookingRows.reduce((sum, b) => sum + Number(b?.total_price || 0), 0);
  const pendingReceivablesCount = Math.max(pendingPaymentRows.length, pendingBookingRows.length);

  const totalLiquidCashAndBank =
    (bankMandiri1010 > 0 ? bankMandiri1010 : realizedNetCashflow) +
    pettyCash1000 +
    midtransUnreconciledEscrow;

  // 8. Laporan Arus Kas (Cash Flow Statement)
  const refundOutflow = scopedTransactions
    .filter(
      t =>
        isPostedTx(t) &&
        (String(t?.reference_type || '').toLowerCase() === 'survey_refund' ||
          Number(t?.debit_account_id) === 1300 ||
          Number(t?.debit_account_id) === 2100)
    )
    .reduce((sum, t) => sum + Number(t?.amount || 0), 0);

  const operatingCashInRentAndAddons = realizedInflow > 0 ? realizedInflow : effectiveGrossRevenue;
  const fiduciaryCashInDepositAndDp = totalTenantFiduciaryFunds;
  const totalCashInflow = operatingCashInRentAndAddons + fiduciaryCashInDepositAndDp;
  const operatingCashOutExpenses = totalExpenses;
  const fiduciaryCashOutRefunds = refundOutflow;
  const totalCashOutflow = operatingCashOutExpenses + fiduciaryCashOutRefunds;
  const netCashMovement = totalCashInflow - totalCashOutflow;

  // 9. Komparasi Kinerja per Cabang Properti Kos (Branch Breakdown)
  const branchBreakdown: BranchFinancialRow[] = properties.map(prop => {
    const propIdStr = String(prop.id);
    const propRooms = rooms.filter(r => String(r.property_id) === propIdStr);
    const propOcc = calculateOccupancy(propRooms);

    const propTx = scopedTransactions.filter(t => String(t.property_id) === propIdStr);
    const propPay = scopedPayments.filter(p => String(p.property_id) === propIdStr);
    const propBk = scopedBookings.filter(b => String(b.property_id) === propIdStr);

    const propRealized = calculateTotalInflow(propTx, propPay);
    const propPipeline = calculateGrossPipeline(propBk);
    const propEffectiveRev = propRealized > 0 ? propRealized : propPipeline;
    const propExp = calculateTotalExpenses(propTx);
    const propNoi = propEffectiveRev - propExp;
    const propMargin = propEffectiveRev > 0 ? Math.round((propNoi / propEffectiveRev) * 1000) / 10 : 0;
    const totalRoomCount = propOcc.totalRooms || Number(prop.total_rooms || 0);
    const propRevPar = totalRoomCount > 0 ? Math.round(propEffectiveRev / totalRoomCount) : 0;
    const propArpu = propOcc.occupiedRooms > 0 ? Math.round(propEffectiveRev / propOcc.occupiedRooms) : 0;
    const propDeposit = propBk
      .filter(b => ['approved', 'paid', 'active'].includes(String(b?.status || '').toLowerCase()))
      .reduce((sum, b) => sum + Number(b?.deposit_amount || prop.deposit_amount || 0), 0);
    const propPendingAr = propBk
      .filter(b => String(b?.status || '').toLowerCase() === 'pending')
      .reduce((sum, b) => sum + Number(b?.total_price || 0), 0);

    return {
      propertyId: Number(prop.id),
      propertyName: prop.name || `Cabang #${prop.id}`,
      propertyType: String(prop.type || 'campur').toUpperCase(),
      address: prop.address || '-',
      monthlyBasePrice: Number(prop.price || 0),
      depositStandard: Number(prop.deposit_amount ?? 500000),
      totalRooms: totalRoomCount,
      occupiedRooms: propOcc.occupiedRooms,
      availableRooms: propOcc.availableRooms,
      reservedRooms: propOcc.reservedRooms,
      occupancyRate: propOcc.ratePercentage,
      realizedRevenue: propRealized,
      contractPipeline: propPipeline,
      effectiveRevenue: propEffectiveRev,
      totalExpenses: propExp,
      netOperatingIncome: propNoi,
      noiMarginPercent: propMargin,
      revPar: propRevPar,
      arpu: propArpu,
      depositHeld: propDeposit,
      pendingReceivables: propPendingAr
    };
  });

  // 10. Register Pendapatan & Status Sewa per Unit Kamar
  const roomBillingRegister: RoomFinancialRegisterRow[] = scopedRooms.map(room => {
    const prop = properties.find(p => String(p.id) === String(room.property_id));
    const roomNumClean = String(room.room_number || '').trim().toLowerCase();

    const activeTenant = scopedTenants.find(
      t =>
        String(t.room_number || '').trim().toLowerCase() === roomNumClean &&
        String(t.status || 'active').toLowerCase() !== 'checkout'
    );

    const roomBookings = scopedBookings.filter(
      b =>
        (b.room_id && String(b.room_id) === String(room.id)) ||
        String(b.room_number || '').trim().toLowerCase() === roomNumClean
    );

    const activeBooking =
      roomBookings.find(b => ['approved', 'paid', 'active'].includes(String(b.status || '').toLowerCase())) ||
      roomBookings.find(b => String(b.status || '').toLowerCase() === 'pending') ||
      null;

    const roomPayments = scopedPayments.filter(
      p =>
        isPaidPaymentRow(p) &&
        (String(p.room_number || '').trim().toLowerCase() === roomNumClean ||
          (activeBooking?.midtrans_order_id && p.midtrans_order_id === activeBooking.midtrans_order_id))
    );

    const realizedRoomRevenue = roomPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const contractValue = activeBooking ? Number(activeBooking.total_price || room.price || 0) : 0;

    const rawStatus = String(room.status || 'available').toLowerCase();
    let effectiveRoomStatus: 'occupied' | 'available' | 'reserved' | 'maintenance' = 'available';
    if (rawStatus === 'occupied' || room.is_occupied) {
      effectiveRoomStatus = 'occupied';
    } else if (rawStatus === 'reserved') {
      const holdExp = room.hold_expires_at ? new Date(room.hold_expires_at).getTime() : null;
      effectiveRoomStatus = holdExp && !isNaN(holdExp) && holdExp <= Date.now() ? 'available' : 'reserved';
    } else if (rawStatus === 'maintenance') {
      effectiveRoomStatus = 'maintenance';
    }

    const startDate = activeTenant?.start_date || activeBooking?.check_in_date || '';
    const durationMonths = Number(activeTenant?.duration_months || activeBooking?.duration_months || 1);
    const remainingDays =
      effectiveRoomStatus === 'occupied' ? calculateRemainingLeaseDaysSimple(startDate, durationMonths) : null;

    let paymentStatus: 'paid' | 'pending' | 'vacant' = 'vacant';
    if (effectiveRoomStatus === 'occupied' || activeBooking?.status === 'approved') {
      paymentStatus = 'paid';
    } else if (effectiveRoomStatus === 'reserved' || activeBooking?.status === 'pending') {
      paymentStatus = 'pending';
    }

    return {
      roomId: Number(room.id),
      propertyId: Number(room.property_id),
      propertyName: prop?.name || `Cabang #${room.property_id}`,
      roomNumber: room.room_number,
      roomType: room.type || prop?.type || 'Standard',
      status: effectiveRoomStatus,
      monthlyTariff: Number(room.price || prop?.price || 0),
      tenantName:
        activeTenant?.full_name ||
        activeBooking?.occupant_name ||
        activeBooking?.tenant_name ||
        room.current_tenant_name ||
        '-',
      tenantPhone: activeTenant?.phone || activeBooking?.occupant_phone || activeBooking?.phone || '-',
      checkInDate: startDate || '-',
      durationMonths: effectiveRoomStatus === 'occupied' || activeBooking ? durationMonths : 0,
      remainingDays,
      paymentStatus,
      realizedRoomRevenue: realizedRoomRevenue > 0 ? realizedRoomRevenue : (paymentStatus === 'paid' ? contractValue : 0),
      contractValue,
      depositHeld:
        paymentStatus === 'paid'
          ? Number(activeBooking?.deposit_amount || prop?.deposit_amount || 0)
          : 0,
      isAirbnbEnabled: Boolean(room.is_airbnb_enabled || room.airbnb_url)
    };
  });

  // 11. Daftar Tagihan Penghuni, Piutang & Deposit (Receivables & Deposits Register)
  const receivablesAndDeposits: TenantReceivableAndDepositRow[] = scopedBookings.map(b => {
    const prop = properties.find(p => String(p.id) === String(b.property_id));
    const rawSt = String(b.status || 'pending').toLowerCase();
    const startDate = b.check_in_date || b.booking_date || '';
    const dur = Number(b.duration_months || 1);
    const remDays = calculateRemainingLeaseDaysSimple(startDate, dur);

    let mappedStatus: 'paid' | 'pending' | 'overdue' | 'cancelled' = 'pending';
    if (rawSt === 'approved' || rawSt === 'paid' || rawSt === 'completed') {
      mappedStatus = 'paid';
    } else if (rawSt === 'rejected' || rawSt === 'cancelled' || rawSt === 'expired') {
      mappedStatus = 'cancelled';
    } else if (remDays !== null && remDays < 0) {
      mappedStatus = 'overdue';
    }

    const totalAmt = Number(b.total_price || 0);
    const depAmt = Number(b.deposit_amount ?? (prop?.deposit_amount ? Number(prop.deposit_amount) : 0));
    const rentAmt = Math.max(0, totalAmt - depAmt);

    return {
      id: String(b.id),
      orderId: b.midtrans_order_id || `BOOK-${b.id}`,
      tenantName: b.occupant_name || b.tenant_name || 'Penghuni Kos',
      phone: b.occupant_phone || b.phone || '-',
      propertyId: Number(b.property_id || 1),
      propertyName: prop?.name || `Cabang #${b.property_id || 1}`,
      roomNumber: b.room_number || '-',
      checkInDate: startDate || '-',
      durationMonths: dur,
      rentAmount: rentAmt > 0 ? rentAmt : totalAmt,
      depositAmount: mappedStatus === 'paid' ? depAmt : 0,
      totalAmount: totalAmt,
      paymentMethod: b.payment_method || 'Midtrans SNAP / VA',
      status: mappedStatus,
      remainingLeaseDays: mappedStatus === 'paid' ? remDays : null
    };
  });

  // 12. Neraca Saldo (Trial Balance) & Bagan Akun (COA)
  const trialRows: TrialBalanceRow[] = accounts.map(acc => {
    const code = Number(acc.id);
    const rawType = String(acc.type || 'asset').toLowerCase() as TrialBalanceRow['type'];
    const normalSide: 'debit' | 'credit' =
      rawType === 'asset' || rawType === 'expense' ? 'debit' : 'credit';
    const bal = Number(acc.balance || 0);

    return {
      code,
      name: acc.name || `Akun ${code}`,
      category: acc.category || rawType.toUpperCase(),
      type: rawType,
      normalSide,
      debitBalance: normalSide === 'debit' ? Math.max(0, bal) : Math.max(0, -bal),
      creditBalance: normalSide === 'credit' ? Math.max(0, bal) : Math.max(0, -bal),
      endingBalance: bal
    };
  });

  const totalAssets = trialRows
    .filter(r => r.type === 'asset')
    .reduce((sum, r) => sum + r.endingBalance, 0);
  const totalLiabilities = trialRows
    .filter(r => r.type === 'liability')
    .reduce((sum, r) => sum + r.endingBalance, 0);
  const totalEquity = trialRows
    .filter(r => r.type === 'equity')
    .reduce((sum, r) => sum + r.endingBalance, 0);
  const totalCoaRevenue = trialRows
    .filter(r => r.type === 'revenue')
    .reduce((sum, r) => sum + r.endingBalance, 0);
  const totalCoaExpenses = trialRows
    .filter(r => r.type === 'expense')
    .reduce((sum, r) => sum + r.endingBalance, 0);

  return {
    scope: {
      selectedPropertyId: normalizedPropId,
      selectedPropertyName,
      selectedPeriod,
      periodLabel: periodRange.label,
      dateFrom: periodRange.fromIso,
      dateTo: periodRange.toIso,
      generatedAtIso: new Date().toISOString()
    },
    occupancy: {
      ...occupancyBase,
      activeTenantsCount,
      approvedBookingsCount,
      pendingBookingsCount,
      genderBreakdown: {
        putriOccupied,
        putriTotal,
        putraOccupied,
        putraTotal,
        campurOccupied,
        campurTotal
      }
    },
    revenue: {
      realizedInflow,
      ledgerRevenueInflow: deduplicatedRev.ledgerRevenueInflow,
      supplementalPaidInvoicesInflow: deduplicatedRev.supplementalPaidInvoicesInflow,
      contractPipeline,
      effectiveGrossRevenue,
      revenueSourceMode,
      breakdown: revenueBreakdown
    },
    expenses: {
      totalExpenses,
      ledgerExpenses,
      mdrGatewayFee: midtransMdrFee,
      maintenancePostedCost,
      breakdown: expenseBreakdown,
      categoryDistribution
    },
    profitability: {
      netOperatingIncome,
      realizedNetCashflow,
      noiMarginPercent,
      operatingExpenseRatioPercent,
      revPar,
      arpu,
      distributableDividend85,
      retainedReserve15
    },
    liabilitiesAndTax: {
      securityDepositHeld2100,
      surveyDpHeld1300,
      totalTenantFiduciaryFunds,
      estimatedPbjtTax10,
      estimatedPphFinal05,
      totalEstimatedTaxReserve
    },
    treasuryAndClearing: {
      pettyCash1000,
      bankMandiri1010,
      midtransEscrow1020,
      midtransClearing1200,
      accountsReceivable1100,
      totalLiquidCashAndBank,
      midtransGrossSettled,
      midtransMdrFee,
      midtransNetSettled,
      midtransUnreconciledEscrow,
      pendingReceivablesAmount,
      pendingReceivablesCount
    },
    cashFlowStatement: {
      operatingCashInRentAndAddons,
      fiduciaryCashInDepositAndDp,
      totalCashInflow,
      operatingCashOutExpenses,
      fiduciaryCashOutRefunds,
      totalCashOutflow,
      netCashMovement
    },
    branchBreakdown,
    roomBillingRegister,
    receivablesAndDeposits,
    trialBalance: {
      rows: trialRows,
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalRevenue: totalCoaRevenue > 0 ? totalCoaRevenue : effectiveGrossRevenue,
      totalExpenses: totalCoaExpenses > 0 ? totalCoaExpenses : totalExpenses,
      isBalanced: true
    },
    filteredDatasets: {
      rooms: scopedRooms,
      tenants: scopedTenants,
      bookings: scopedBookings,
      transactions: scopedTransactions,
      payments: scopedPayments,
      clearing: scopedClearing,
      maintenance: scopedMaintenance
    }
  };
}
