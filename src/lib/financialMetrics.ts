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
export function calculateTotalInflow(
  transactions: any[] = [],
  payments: any[] = []
): number {
  // Jika ada data di financial_transactions dengan type 'income', prioritaskan itu
  const incomeTx = transactions.filter(t => t.type === 'income');
  if (incomeTx.length > 0) {
    return incomeTx.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  }

  // Fallback ke tabel payments dengan status 'paid'
  const paidPayments = payments.filter(p => p.status === 'paid');
  return paidPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
}

/**
 * Menghitung total beban pengeluaran riil
 */
export function calculateTotalExpenses(transactions: any[] = []): number {
  const expenseTx = transactions.filter(t => t.type === 'expense');
  return expenseTx.reduce((sum, t) => sum + Number(t.amount || 0), 0);
}

/**
 * Menghitung rincian pengeluaran per kategori secara dinamis
 */
export function calculateExpenseBreakdown(transactions: any[] = []): {
  byCategory: Record<string, number>;
  breakdown: Array<{ name: string; amount: number; percentage: number; color: string }>;
} {
  const expenseTx = transactions.filter(t => t.type === 'expense');
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
 * Menghitung rincian pengeluaran COA terperinci dengan klasifikasi akun resmi
 */
export function calculateDetailedCOAExpenseBreakdown(
  transactions: any[] = [],
  totalExpenses: number = 0,
  totalMdrFee: number = 0,
  maintenanceCost: number = 0
): COAExpenseItem[] {
  const hasRealExpenses = totalExpenses > 0;

  // Filter dynamic categorized entries from transactions
  const utilTx = transactions.filter(t => t.type === 'expense' && (t.category?.toLowerCase().includes('listrik') || t.category?.toLowerCase().includes('air') || t.category?.toLowerCase().includes('utilitas')));
  const internetTx = transactions.filter(t => t.type === 'expense' && (t.category?.toLowerCase().includes('wifi') || t.category?.toLowerCase().includes('internet')));
  const cleanTx = transactions.filter(t => t.type === 'expense' && (t.category?.toLowerCase().includes('bersih') || t.category?.toLowerCase().includes('sampah')));
  const salaryTx = transactions.filter(t => t.type === 'expense' && (t.category?.toLowerCase().includes('gaji') || t.category?.toLowerCase().includes('staff') || t.category?.toLowerCase().includes('karyawan')));

  const utilAmount = utilTx.length > 0 ? utilTx.reduce((s, t) => s + Number(t.amount || 0), 0) : (hasRealExpenses ? totalExpenses * 0.4 : 0);
  const internetAmount = internetTx.length > 0 ? internetTx.reduce((s, t) => s + Number(t.amount || 0), 0) : (hasRealExpenses ? totalExpenses * 0.15 : 0);
  const cleanAmount = cleanTx.length > 0 ? cleanTx.reduce((s, t) => s + Number(t.amount || 0), 0) : (hasRealExpenses ? totalExpenses * 0.15 : 0);
  const salaryAmount = salaryTx.length > 0 ? salaryTx.reduce((s, t) => s + Number(t.amount || 0), 0) : (hasRealExpenses ? totalExpenses * 0.3 : 0);

  const isSynthetic = hasRealExpenses && utilTx.length === 0 && salaryTx.length === 0;

  return [
    { code: '5000', name: 'Beban Listrik, Air & Utilitas Gedung', amount: utilAmount, isEstimated: isSynthetic },
    { code: '5010', name: 'Beban Internet & WiFi High-Speed', amount: internetAmount, isEstimated: isSynthetic },
    { code: '5020', name: 'Beban Kebersihan & Sanitasi Lingkungan', amount: cleanAmount, isEstimated: isSynthetic },
    { code: '5030', name: 'Biaya Layanan Midtrans Gateway (MDR)', amount: totalMdrFee, isEstimated: false },
    { code: '5100', name: 'Beban Pemeliharaan & Perbaikan Gedung', amount: maintenanceCost, isEstimated: false },
    { code: '5200', name: 'Beban Gaji Karyawan & Penjaga Kos', amount: salaryAmount, isEstimated: isSynthetic },
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
 * Ringkasan Finansial Eksekutif Lengkap
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
  let expenses = calculateTotalExpenses(transactions);
  let { breakdown } = calculateExpenseBreakdown(transactions);
  let isExpensesEstimated = false;

  // Jika tidak ada data pengeluaran riil di database sama sekali,
  // berikan proyeksi estimasi 35% dari inflow dengan flag tegas
  if (expenses === 0 && inflow > 0) {
    isExpensesEstimated = true;
    expenses = Math.round(inflow * 0.35);
    breakdown = [
      { name: 'Utilitas & Listrik (Estimasi)', amount: Math.round(expenses * 0.40), percentage: 40, color: '#6366f1' },
      { name: 'Pemeliharaan Gedung (Estimasi)', amount: Math.round(expenses * 0.25), percentage: 25, color: '#ef4444' },
      { name: 'Operasional & Kebersihan (Estimasi)', amount: Math.round(expenses * 0.20), percentage: 20, color: '#10b981' },
      { name: 'Layanan Gateway & Admin (Estimasi)', amount: Math.round(expenses * 0.15), percentage: 15, color: '#f59e0b' }
    ];
  }

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
