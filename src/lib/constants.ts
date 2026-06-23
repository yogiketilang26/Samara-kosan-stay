export const PROPERTY_TYPES = {
  ALL: 'all',
  PUTRA: 'putra',
  PUTRI: 'putri',
  CAMPUR: 'campur'
} as const;

export const BOOKING_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
} as const;

export const SURVEY_STATUSES = {
  SURVEY_CONFIRMED: 'survey_confirmed',
  SURVEY_COMPLETED: 'survey_completed',
  NO_SHOW: 'no_show'
} as const;

export const PAYMENT_STATUSES = {
  PENDING: 'pending',
  PAID: 'paid',
  OVERDUE: 'overdue'
} as const;

export const ACCOUNTS_COA = [
  { id: 1010, name: 'Kas Utama Bank Mandiri', type: 'asset', balance: 0 },
  { id: 1020, name: 'Kas Kecil (Petty Cash)', type: 'asset', balance: 0 },
  { id: 1100, name: 'Piutang Sewa Tenant', type: 'asset', balance: 0 },
  { id: 2100, name: 'Hutang Pajak PBJT Daerah (10%)', type: 'liability', balance: 0 },
  { id: 3000, name: 'Modal Awal Pemilik', type: 'equity', balance: 0 },
  { id: 4000, name: 'Pendapatan Sewa Bulanan', type: 'revenue', balance: 0 },
  { id: 4100, name: 'Pendapatan Sewa Harian', type: 'revenue', balance: 0 },
  { id: 4200, name: 'Pendapatan DP Survey Hangus', type: 'revenue', balance: 0 },
  { id: 5010, name: 'Biaya Air Bersih PAM & Listrik', type: 'expense', balance: 0 },
  { id: 5020, name: 'Biaya Internet Fiber Wifi', type: 'expense', balance: 0 },
  { id: 5050, name: 'Biaya Kebersihan & Gaji Operator', type: 'expense', balance: 0 }
];
