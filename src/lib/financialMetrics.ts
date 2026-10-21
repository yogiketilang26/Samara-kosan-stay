/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SAMARA STAY ERP v16 - SHARED FINANCIAL METRICS ENGINE
 * 
 * Modul terpusat untuk kalkulasi metrik finansial, okupansi, NOI,
 * dan pipeline pendapatan agar konsisten di seluruh dashboard (Admin & Owner Portal).
 */

export interface OccupancyResult {
  totalRooms: number;
  occupiedRooms: number;
  availableRooms: number;
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

/**
 * Menghitung tingkat okupansi kamar
 */
export function calculateOccupancy(rooms: any[] = []): OccupancyResult {
  const totalRooms = rooms.length;
  if (totalRooms === 0) {
    return { totalRooms: 0, occupiedRooms: 0, availableRooms: 0, ratePercentage: 0 };
  }
  const occupiedRooms = rooms.filter(r => r.status === 'occupied' || r.is_occupied).length;
  const availableRooms = totalRooms - occupiedRooms;
  const ratePercentage = Math.round((occupiedRooms / totalRooms) * 100);

  return {
    totalRooms,
    occupiedRooms,
    availableRooms,
    ratePercentage
  };
}

/**
 * Menghitung total arus kas masuk (pemasukan riil yang telah settled)
 */
function isPostedTx(t: any): boolean {
  const s = String(t?.status || 'posted').toLowerCase();
  return !['void', 'deleted', 'cancelled', 'rejected', 'failed'].includes(s);
}

function isRealRevenueTx(t: any): boolean {
  if (!isPostedTx(t)) return false;
  const txType = String(t?.type || '').toLowerCase();
  if (txType !== 'income' && txType !== 'revenue') return false;
  const refType = String(t?.reference_type || '').toLowerCase();
  if (refType === 'bank_reconciliation' || refType === 'bank_unreconcile' || refType === 'survey_refund' || refType === 'bank_unreconcile_fee') {
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

function isRealExpenseTx(t: any): boolean {
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

export function calculateTotalInflow(
  transactions: any[] = [],
  payments: any[] = []
): number {
  const incomeTx = transactions.filter(isRealRevenueTx);
  if (incomeTx.length > 0) {
    return incomeTx.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  }

  // Fallback ke tabel payments dengan status 'paid' hanya bila belum ada baris financial_transactions sama sekali
  if (transactions.length === 0) {
    const paidPayments = payments.filter(p => p.status === 'paid');
    return paidPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  }
  return 0;
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

export interface COAExpenseItem {
  code: string;
  name: string;
  amount: number;
  isEstimated: boolean;
}

/**
 * Menghitung rincian pengeluaran COA terperinci dengan klasifikasi akun resmi (tanpa fabrikasi angka)
 */
export function calculateDetailedCOAExpenseBreakdown(
  transactions: any[] = [],
  _totalExpenses: number = 0,
  totalMdrFee: number = 0,
  maintenanceCost: number = 0
): COAExpenseItem[] {
  const realExpenses = transactions.filter(isRealExpenseTx);

  const utilTx = realExpenses.filter(t => t.category?.toLowerCase().includes('listrik') || t.category?.toLowerCase().includes('air') || t.category?.toLowerCase().includes('utilitas'));
  const internetTx = realExpenses.filter(t => t.category?.toLowerCase().includes('wifi') || t.category?.toLowerCase().includes('internet'));
  const cleanTx = realExpenses.filter(t => t.category?.toLowerCase().includes('bersih') || t.category?.toLowerCase().includes('sampah'));
  const salaryTx = realExpenses.filter(t => t.category?.toLowerCase().includes('gaji') || t.category?.toLowerCase().includes('staff') || t.category?.toLowerCase().includes('karyawan'));

  const utilAmount = utilTx.reduce((s, t) => s + Number(t.amount || 0), 0);
  const internetAmount = internetTx.reduce((s, t) => s + Number(t.amount || 0), 0);
  const cleanAmount = cleanTx.reduce((s, t) => s + Number(t.amount || 0), 0);
  const salaryAmount = salaryTx.reduce((s, t) => s + Number(t.amount || 0), 0);

  return [
    { code: '5000', name: 'Beban Listrik, Air & Utilitas Gedung', amount: utilAmount, isEstimated: false },
    { code: '5010', name: 'Beban Internet & WiFi High-Speed', amount: internetAmount, isEstimated: false },
    { code: '5020', name: 'Beban Kebersihan & Sanitasi Lingkungan', amount: cleanAmount, isEstimated: false },
    { code: '5030', name: 'Biaya Layanan Midtrans Gateway (MDR)', amount: totalMdrFee, isEstimated: false },
    { code: '5100', name: 'Beban Pemeliharaan & Perbaikan Gedung', amount: maintenanceCost, isEstimated: false },
    { code: '5200', name: 'Beban Gaji Karyawan & Penjaga Kos', amount: salaryAmount, isEstimated: false },
  ];
}

/**
 * Menghitung Net Operating Income (NOI) = Inflow - Expenses
 */
export function calculateNOI(inflow: number, expenses: number): number {
  return inflow - expenses;
}

/**
 * Menghitung Gross Contract Pipeline (Nilai seluruh kontrak aktif / pemesanan berjalan)
 */
export function calculateGrossPipeline(bookings: any[] = []): number {
  return bookings
    .filter(b => b.status === 'approved' || b.status === 'pending' || b.status === 'confirmed')
    .reduce((sum, b) => sum + Number(b.total_price || 0), 0);
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
