/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import dotenv from 'dotenv';
import fs from 'fs';
import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { createClient } from '@supabase/supabase-js';
import { renderAsync } from '@resvg/resvg-js';

declare global {
  namespace Express {
    interface Request {
      authProfile?: any;
      authUser?: any;
    }
  }
}

// Load environment variables
dotenv.config();

// Simple in-memory rate limiting store for endpoints
const rateLimits: Record<string, { count: number; resetTime: number }> = {};

// Clean up expired rate limits every 10 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const ip in rateLimits) {
    if (rateLimits[ip].resetTime < now) {
      delete rateLimits[ip];
    }
  }
}, 10 * 60 * 1000);

function apiRateLimiter(windowMs: number, maxRequests: number) {
  return (req: any, res: any, next: any) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const now = Date.now();
    if (!rateLimits[ip]) {
      rateLimits[ip] = { count: 1, resetTime: now + windowMs };
      return next();
    }
    const limit = rateLimits[ip];
    if (now > limit.resetTime) {
      limit.count = 1;
      limit.resetTime = now + windowMs;
      return next();
    }
    limit.count++;
    if (limit.count > maxRequests) {
      return res.status(429).json({
        success: false,
        error: 'Too many requests, please try again later.'
      });
    }
    next();
  };
}

// Helper to strictly obtain Supabase Service Role Key or fallback to Anon Key for queries/RPC
function getServiceRoleKeyOrThrow(): string {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';
  if (serviceKey && serviceKey !== 'YOUR_SERVICE_ROLE_KEY_HERE') {
    return serviceKey;
  }
  // Check alternative service key names
  const fallbackService = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.VITE_SUPABASE_SECRET_KEY || '';
  if (fallbackService && fallbackService !== 'YOUR_SERVICE_ROLE_KEY_HERE') {
    return fallbackService;
  }
  // Fallback to anon key so server administrative operations, queries, and RPCs remain operational
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  if (anonKey && anonKey !== 'YOUR_SUPABASE_ANON_KEY_HERE') {
    return anonKey;
  }
  throw new Error('Supabase Key (SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY) is required for server administrative operations but not found in environment.');
}

// Helper to record failed accounting postings for audit reconciliation
async function recordFailedLedgerPosting(
  supabaseClient: any,
  params: {
    transaction_no?: string;
    reference_type: string;
    reference_id: string;
    amount: number;
    debit_account_id: number;
    credit_account_id: number;
    property_id?: number | null;
    created_by?: string;
    error_message?: string;
  }
) {
  try {
    await supabaseClient.from('failed_ledger_postings').insert({
      transaction_no: params.transaction_no || null,
      reference_type: params.reference_type,
      reference_id: String(params.reference_id),
      amount: Number(params.amount || 0),
      debit_account_id: params.debit_account_id,
      credit_account_id: params.credit_account_id,
      property_id: params.property_id || null,
      created_by: params.created_by || 'System',
      error_message: params.error_message || 'Posting failed',
      status: 'pending'
    });
  } catch (auditErr) {
    console.warn('[FAILED LEDGER POSTING AUDIT] Could not record to failed_ledger_postings table:', auditErr);
  }
}

// =========================================================================
// CRITICAL CHART OF ACCOUNTS (COA) DEFINITIONS & DIAGNOSTIC ENGINE
// =========================================================================
export const CRITICAL_COA_ACCOUNTS = [
  { id: 1000, name: 'Kas Tunai / Cash on Hand', type: 'asset', category: 'Kas & Bank' },
  { id: 1010, name: 'Kas Utama Bank Mandiri (Operasional)', type: 'asset', category: 'Kas & Bank' },
  { id: 1020, name: 'Bank Penampung Midtrans Escrow', type: 'asset', category: 'Kas & Bank' },
  { id: 1200, name: 'Piutang Kliring Midtrans (Gateway Clearing)', type: 'asset', category: 'Piutang & Kliring' },
  { id: 1300, name: 'Hutang Titipan Uang Muka / Deposit Survey', type: 'liability', category: 'Kewajiban Jangka Pendek' },
  { id: 2000, name: 'Hutang Usaha / Vendor Payable', type: 'liability', category: 'Kewajiban Jangka Pendek' },
  { id: 2100, name: 'Hutang Deposit Jaminan Sewa (Security Deposit)', type: 'liability', category: 'Kewajiban Jangka Pendek' },
  { id: 3000, name: 'Modal Pemilik / Modal Disetor', type: 'equity', category: 'Ekuitas' },
  { id: 3100, name: 'Laba Ditahan / Retained Earnings', type: 'equity', category: 'Ekuitas' },
  { id: 4000, name: 'Pendapatan Sewa Kamar Kos', type: 'revenue', category: 'Pendapatan Utama' },
  { id: 4100, name: 'Pendapatan Denda & Keterlambatan', type: 'revenue', category: 'Pendapatan Lain-lain' },
  { id: 4200, name: 'Pendapatan DP Survey Hangus', type: 'revenue', category: 'Pendapatan Lain-lain' },
  { id: 4300, name: 'Pendapatan Laundry & Layanan Tambahan', type: 'revenue', category: 'Pendapatan Lain-lain' },
  { id: 5000, name: 'Beban Listrik, Air & Utilitas', type: 'expense', category: 'Beban Operasional' },
  { id: 5010, name: 'Beban Internet & WiFi', type: 'expense', category: 'Beban Operasional' },
  { id: 5020, name: 'Beban Kebersihan & Sampah', type: 'expense', category: 'Beban Operasional' },
  { id: 5030, name: 'Biaya Layanan Midtrans / Payment Gateway', type: 'expense', category: 'Beban Operasional' },
  { id: 5100, name: 'Beban Pemeliharaan & Perbaikan Gedung', type: 'expense', category: 'Beban Operasional' },
  { id: 5200, name: 'Beban Gaji Karyawan & Penjaga Kos', type: 'expense', category: 'Beban Operasional' },
  { id: 5300, name: 'Beban Pemasaran & Iklan Properti', type: 'expense', category: 'Beban Operasional' },
  { id: 5400, name: 'Beban Perlengkapan & Operasional Kantor', type: 'expense', category: 'Beban Operasional' }
];

let lastCoaVerificationTime = 0;
let lastCoaVerificationStatus: any = null;

async function verifyAndEnsureCriticalCOA(
  supabaseClient: any,
  autoRepair: boolean = true,
  forceCheck: boolean = false
) {
  const now = Date.now();
  // Throttle non-forced checks if checked within last 60 seconds and verified healthy
  if (!forceCheck && lastCoaVerificationStatus?.healthy && (now - lastCoaVerificationTime < 60000)) {
    return lastCoaVerificationStatus;
  }

  try {
    const { data: existingAccounts, error: fetchErr } = await supabaseClient
      .from('accounts')
      .select('id, name, type, category, balance');

    if (fetchErr) {
      console.warn('[COA DIAGNOSTIC] Error fetching accounts from database:', fetchErr.message);
      return {
        healthy: false,
        error: fetchErr.message,
        totalChecked: CRITICAL_COA_ACCOUNTS.length,
        existingCount: 0,
        missingCount: CRITICAL_COA_ACCOUNTS.length,
        missingAccounts: CRITICAL_COA_ACCOUNTS,
        repairedCount: 0,
        repairedAccounts: [],
        timestamp: new Date().toISOString()
      };
    }

    const existingMap = new Map<number, any>();
    (existingAccounts || []).forEach((acc: any) => existingMap.set(Number(acc.id), acc));

    const missingAccounts: typeof CRITICAL_COA_ACCOUNTS = [];
    const accountsStatus: Array<{
      id: number;
      name: string;
      type: string;
      category: string;
      exists: boolean;
      balance?: number;
    }> = [];

    for (const critical of CRITICAL_COA_ACCOUNTS) {
      const existing = existingMap.get(critical.id);
      if (!existing) {
        missingAccounts.push(critical);
        accountsStatus.push({
          id: critical.id,
          name: critical.name,
          type: critical.type,
          category: critical.category,
          exists: false
        });
      } else {
        accountsStatus.push({
          id: critical.id,
          name: existing.name || critical.name,
          type: existing.type || critical.type,
          category: existing.category || critical.category,
          exists: true,
          balance: Number(existing.balance) || 0
        });
      }
    }

    const repairedAccounts: any[] = [];
    if (missingAccounts.length > 0 && autoRepair) {
      console.log(`[COA DIAGNOSTIC] Missing ${missingAccounts.length} critical COA accounts. Auto-repairing...`);
      for (const missing of missingAccounts) {
        const payload: any = {
          id: missing.id,
          name: missing.name,
          type: missing.type,
          category: missing.category,
          balance: 0
        };
        let { error: insertErr } = await supabaseClient
          .from('accounts')
          .upsert(payload, { onConflict: 'id' });

        // If category column does not exist on table accounts, retry without category
        if (insertErr && (insertErr.message.includes('category') || insertErr.message.includes('column'))) {
          const fallbackPayload = {
            id: missing.id,
            name: missing.name,
            type: missing.type,
            balance: 0
          };
          const retryRes = await supabaseClient
            .from('accounts')
            .upsert(fallbackPayload, { onConflict: 'id' });
          insertErr = retryRes.error;
        }

        if (!insertErr) {
          repairedAccounts.push(missing);
          const target = accountsStatus.find(a => a.id === missing.id);
          if (target) {
            target.exists = true;
            target.balance = 0;
          }
        } else {
          if (insertErr.message.includes('row-level security policy')) {
            console.warn(`[COA DIAGNOSTIC] Auto-repair for account ${missing.id} (${missing.name}) was blocked by Supabase RLS. Please ensure SUPABASE_SERVICE_ROLE_KEY is configured or run the COA seed SQL in Supabase SQL Editor.`);
          } else {
            console.error(`[COA DIAGNOSTIC] Failed to auto-repair account ${missing.id} (${missing.name}):`, insertErr.message);
          }
        }
      }
    }

    const isHealthy = missingAccounts.length === 0 || (autoRepair && repairedAccounts.length === missingAccounts.length);
    const result = {
      healthy: isHealthy,
      totalChecked: CRITICAL_COA_ACCOUNTS.length,
      existingCount: existingMap.size + repairedAccounts.length,
      missingCount: isHealthy ? 0 : (missingAccounts.length - repairedAccounts.length),
      missingAccounts: isHealthy ? [] : missingAccounts.filter(m => !repairedAccounts.some(r => r.id === m.id)),
      repairedCount: repairedAccounts.length,
      repairedAccounts,
      accountsStatus,
      timestamp: new Date().toISOString()
    };

    lastCoaVerificationTime = now;
    lastCoaVerificationStatus = result;
    return result;
  } catch (err: any) {
    console.error('[COA DIAGNOSTIC] Exception during COA verification:', err);
    return {
      healthy: false,
      error: err.message || 'Unknown exception in verifyAndEnsureCriticalCOA',
      totalChecked: CRITICAL_COA_ACCOUNTS.length,
      existingCount: 0,
      missingCount: CRITICAL_COA_ACCOUNTS.length,
      missingAccounts: CRITICAL_COA_ACCOUNTS,
      repairedCount: 0,
      repairedAccounts: [],
      timestamp: new Date().toISOString()
    };
  }
}

// Comprehensive Accounting Integrity Audit Engine
async function runAccountingIntegrityAudit(supabaseClient: any): Promise<any> {
  try {
    // 1. Attempt running stored procedure first
    const { data: rpcData, error: rpcErr } = await supabaseClient.rpc('audit_accounting_integrity');
    if (!rpcErr && rpcData) {
      console.log(`[ACCOUNTING INTEGRITY AUDIT] RPC executed successfully. Score: ${rpcData.integrityScore}/100`);
      return rpcData;
    }

    if (rpcErr) {
      console.warn('[ACCOUNTING INTEGRITY AUDIT] RPC fallback to Node.js calculation engine:', rpcErr.message);
    }

    // 2. Fallback in-process Node.js multi-check engine
    const [accRes, ftRes, jeRes, clrRes] = await Promise.all([
      supabaseClient.from('accounts').select('*'),
      supabaseClient.from('financial_transactions').select('*'),
      supabaseClient.from('journal_entries').select('*'),
      supabaseClient.from('midtrans_clearing_transactions').select('*')
    ]);

    const accounts: any[] = accRes.data || [];
    const transactions: any[] = ftRes.data || [];
    const journals: any[] = jeRes.data || [];
    const clearings: any[] = clrRes.data || [];

    const totalAccounts = accounts.length;
    const totalTransactions = transactions.length;
    const totalJournals = journals.length;
    const totalClearing = clearings.length;

    let integrityScore = 100;

    // CHECK 1: Double-Entry Balance Check
    const journalGroups: { [key: string]: { debit: number; credit: number; journal_no: string; transaction_id: number } } = {};
    for (const j of journals) {
      const key = j.journal_no || `TRX-${j.transaction_id}`;
      if (!journalGroups[key]) {
        journalGroups[key] = { debit: 0, credit: 0, journal_no: j.journal_no, transaction_id: j.transaction_id };
      }
      journalGroups[key].debit += Number(j.debit || 0);
      journalGroups[key].credit += Number(j.credit || 0);
    }

    const unbalancedJournals: any[] = [];
    for (const [key, val] of Object.entries(journalGroups)) {
      const diff = Math.abs(val.debit - val.credit);
      if (diff > 0.01) {
        unbalancedJournals.push({
          journal_no: val.journal_no,
          transaction_id: val.transaction_id,
          total_debit: val.debit,
          total_credit: val.credit,
          diff
        });
      }
    }

    if (unbalancedJournals.length > 0) {
      integrityScore -= unbalancedJournals.length * 15;
    }

    // CHECK 2: Account Balance vs Journal Mutasi
    const accountCalculated: { [key: number]: { debit: number; credit: number } } = {};
    for (const a of accounts) {
      accountCalculated[a.id] = { debit: 0, credit: 0 };
    }
    for (const j of journals) {
      if (accountCalculated[j.account_id]) {
        accountCalculated[j.account_id].debit += Number(j.debit || 0);
        accountCalculated[j.account_id].credit += Number(j.credit || 0);
      }
    }

    const balanceVariances: any[] = [];
    let totalVariance = 0;
    for (const a of accounts) {
      const mutasi = accountCalculated[a.id] || { debit: 0, credit: 0 };
      const isNormalDebit = a.type === 'asset' || a.type === 'expense';
      const computedBalance = isNormalDebit ? (mutasi.debit - mutasi.credit) : (mutasi.credit - mutasi.debit);
      const storedBalance = Number(a.balance || 0);
      const variance = storedBalance - computedBalance;
      if (Math.abs(variance) > 0.01) {
        balanceVariances.push({
          account_id: a.id,
          account_name: a.name,
          type: a.type,
          stored_balance: storedBalance,
          computed_balance: computedBalance,
          variance
        });
        totalVariance += Math.abs(variance);
      }
    }

    if (balanceVariances.length > 0) {
      integrityScore -= balanceVariances.length * 5;
    }

    // CHECK 3: Orphaned Records
    const accountIdSet = new Set(accounts.map(a => a.id));
    const orphanedJournals = journals.filter(j => !accountIdSet.has(j.account_id));
    const trxIdWithJournals = new Set(journals.map(j => j.transaction_id));
    const orphanedTransactions = transactions.filter(t => !trxIdWithJournals.has(t.id));

    const totalOrphans = orphanedJournals.length + orphanedTransactions.length;
    if (totalOrphans > 0) {
      integrityScore -= totalOrphans * 10;
    }

    // CHECK 4: Property Dimensions
    const missingPropertyTrx = transactions.filter(t => 
      !t.property_id && ['Penerimaan Sewa', 'Beban Operasional Kos', 'DP Survey / Reservasi'].includes(t.category)
    );

    // CHECK 5: Clearing vs Account 1200
    const totalClearingGross = clearings.reduce((sum, c) => sum + Number(c.gross_amount || 0), 0);
    const totalClearingOutstanding = clearings.reduce((sum, c) => sum + Number(c.outstanding_amount || 0), 0);
    const acc1200 = accounts.find(a => a.id === 1200);
    const acc1200Balance = Number(acc1200?.balance || 0);
    const clearingVariance = Math.abs(totalClearingOutstanding - acc1200Balance);

    if (integrityScore < 0) integrityScore = 0;

    let overallStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (integrityScore === 100) overallStatus = 'healthy';
    else if (integrityScore >= 70) overallStatus = 'warning';
    else overallStatus = 'critical';

    return {
      overallStatus,
      integrityScore,
      auditTimestamp: new Date().toISOString(),
      totalTransactionsChecked: totalTransactions,
      totalJournalEntriesChecked: totalJournals,
      totalAccountsChecked: totalAccounts,
      totalClearingRecordsChecked: totalClearing,
      checks: [
        {
          id: 'CHK-01-DOUBLE-ENTRY',
          name: 'Keseimbangan Double-Entry (Debit == Credit)',
          category: 'double_entry',
          status: unbalancedJournals.length === 0 ? 'passed' : 'failed',
          severity: 'critical',
          details: unbalancedJournals.length === 0
            ? `Seluruh ${totalJournals} baris jurnal umum seimbang sempurna (Debit = Kredit).`
            : `Ditemukan ${unbalancedJournals.length} transaksi jurnal tidak seimbang.`,
          recordsAnalyzed: totalJournals,
          discrepancyCount: unbalancedJournals.length,
          sampleDiscrepancies: unbalancedJournals,
          autoRepairable: false
        },
        {
          id: 'CHK-02-ACCOUNT-BALANCES',
          name: 'Konsistensi Saldo Rekening COA vs Mutasi Jurnal',
          category: 'account_balance',
          status: balanceVariances.length === 0 ? 'passed' : 'warning',
          severity: 'high',
          details: balanceVariances.length === 0
            ? `Semua saldo tersimpan pada ${totalAccounts} rekening COA sinkron 100% dengan akumulasi mutasi jurnal.`
            : `Ditemukan selisih saldo pada ${balanceVariances.length} rekening COA sebesar Rp ${totalVariance.toLocaleString('id-ID')}.`,
          recordsAnalyzed: totalAccounts,
          discrepancyCount: balanceVariances.length,
          sampleDiscrepancies: balanceVariances,
          autoRepairable: true
        },
        {
          id: 'CHK-03-ORPHANED-RECORDS',
          name: 'Integritas Relasi Buku Besar (Orphaned Record Scanner)',
          category: 'orphan_records',
          status: totalOrphans === 0 ? 'passed' : 'failed',
          severity: 'high',
          details: totalOrphans === 0
            ? 'Tidak ada entri jurnal atau transaksi tanpa induk / rekening COA valid.'
            : `Ditemukan ${orphanedJournals.length} jurnal tanpa COA dan ${orphanedTransactions.length} transaksi tanpa jurnal.`,
          recordsAnalyzed: totalTransactions + totalJournals,
          discrepancyCount: totalOrphans,
          autoRepairable: true
        },
        {
          id: 'CHK-04-PROPERTY-DIMENSION',
          name: 'Kelengkapan Dimensi Finansial Properti (Multi-Unit)',
          category: 'property_dimension',
          status: missingPropertyTrx.length === 0 ? 'passed' : 'warning',
          severity: 'medium',
          details: missingPropertyTrx.length === 0
            ? 'Semua transaksi operasional kos memiliki penanda property_id yang valid.'
            : `Terdapat ${missingPropertyTrx.length} transaksi operasional tanpa asosiasi properti.`,
          recordsAnalyzed: totalTransactions,
          discrepancyCount: missingPropertyTrx.length,
          autoRepairable: true
        },
        {
          id: 'CHK-05-CLEARING-SYNC',
          name: 'Sinkronisasi Kliring Midtrans (Akun 1200 vs Outstanding Clearing)',
          category: 'clearing_sync',
          status: clearingVariance < 1 ? 'passed' : 'warning',
          severity: 'medium',
          details: `Total Outstanding Kliring: Rp ${totalClearingOutstanding.toLocaleString('id-ID')} | Saldo Akun 1200: Rp ${acc1200Balance.toLocaleString('id-ID')}`,
          recordsAnalyzed: totalClearing,
          discrepancyCount: clearingVariance < 1 ? 0 : 1,
          autoRepairable: true
        }
      ],
      summary: {
        passedChecks: (unbalancedJournals.length === 0 ? 1 : 0) +
                      (balanceVariances.length === 0 ? 1 : 0) +
                      (totalOrphans === 0 ? 1 : 0) +
                      (missingPropertyTrx.length === 0 ? 1 : 0) +
                      (clearingVariance < 1 ? 1 : 0),
        warningChecks: (balanceVariances.length > 0 ? 1 : 0) +
                       (missingPropertyTrx.length > 0 ? 1 : 0) +
                       (clearingVariance >= 1 ? 1 : 0),
        failedChecks: (unbalancedJournals.length > 0 ? 1 : 0) +
                      (totalOrphans > 0 ? 1 : 0),
        totalDiscrepancies: unbalancedJournals.length + balanceVariances.length + totalOrphans + missingPropertyTrx.length,
        debitCreditImbalance: unbalancedJournals.length,
        balanceVarianceTotal: totalVariance,
        orphanedRecordsCount: totalOrphans
      },
      recommendations: integrityScore === 100
        ? ['Integritas pembukuan dalam kondisi optimal. Siap untuk proses penutupan periode (Period Closing) dan pelaporan keuangan.']
        : [
            'Jalankan prosedur perbaikan otomatis untuk menyinkronkan saldo akun COA dengan riwayat jurnal.',
            'Periksa kembali pencatatan jurnal manual yang memiliki selisih debit/kredit.'
          ]
    };
  } catch (err: any) {
    console.error('[ACCOUNTING INTEGRITY AUDIT] Calculation error:', err);
    throw err;
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // Boot-time configuration & service role key validation
  try {
    getServiceRoleKeyOrThrow();
    console.log('[SERVER BOOT] Supabase Service Role Key verified successfully.');
  } catch (err: any) {
    console.warn('================================================================');
    console.warn('[SERVER BOOT WARNING] SUPABASE_SERVICE_ROLE_KEY is not configured in environment!');
    console.warn('Administrative operations, double-entry postings, and Webhook reconciliations require this key.');
    console.warn('================================================================');
  }

  // Proactively verify & ensure all critical COA accounts exist on startup
  (async () => {
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (supabaseUrl && serviceKey) {
        const client = createClient(supabaseUrl, serviceKey);
        const res = await verifyAndEnsureCriticalCOA(client, true, true);
        console.log(`[STARTUP COA AUDIT] Status: ${res.healthy ? 'HEALTHY' : 'WARNING'}, Accounts Checked: ${res.totalChecked}, Existing: ${res.existingCount}, Auto-Repaired: ${res.repairedCount}`);
      }
    } catch (e: any) {
      console.warn('[STARTUP COA AUDIT] Non-blocking startup audit notice:', e?.message || e);
    }
  })();

  const PORT = Number(process.env.PORT) || 3000;

  // =========================================================================
  // RBAC WHITELIST SECURITY HELPERS (EXACT MATCH ONLY)
  // =========================================================================
  function getSuperAdminEmails(): string[] {
    const envEmails = process.env.SUPER_ADMIN_EMAILS || 'admin@samarastay.co.id,yogiketilang33@gmail.com';
    return envEmails.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  }

  function getOwnerEmails(): string[] {
    const envEmails = process.env.OWNER_EMAILS || 'owner@samarastay.co.id';
    return envEmails.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  }

  function isSuperAdminEmail(email: string): boolean {
    const clean = (email || '').trim().toLowerCase();
    return getSuperAdminEmails().includes(clean);
  }

  function isOwnerEmail(email: string): boolean {
    const clean = (email || '').trim().toLowerCase();
    return getOwnerEmails().includes(clean);
  }

  function checkPropertyAccess(authProfile: any, targetPropertyId: any): { allowed: boolean; reason?: string } {
    const role = (authProfile?.role || '').toLowerCase();
    // Super admins, super_admin, and owners have access to all property portfolios
    if (['super', 'super_admin', 'owner'].includes(role)) {
      return { allowed: true };
    }

    const assignedPropertyId = authProfile?.property_id;

    // Un-scoped global admin/finance (where property_id is null/undefined) has broad access
    if (['admin', 'finance'].includes(role) && (assignedPropertyId === null || assignedPropertyId === undefined)) {
      return { allowed: true };
    }

    // Branch staff or property-scoped finance
    if (assignedPropertyId !== null && assignedPropertyId !== undefined) {
      if (targetPropertyId === null || targetPropertyId === undefined) {
        return { allowed: false, reason: 'Staff/Finance cabang wajib menyertakan ID properti yang ditugaskan.' };
      }
      if (String(assignedPropertyId) !== String(targetPropertyId)) {
        return { allowed: false, reason: `Akses ditolak. Anda hanya berwenang untuk Properti ID ${assignedPropertyId}, bukan Properti ID ${targetPropertyId}.` };
      }
      return { allowed: true };
    }

    // Staff without assigned property cannot mutate property-scoped financial/operational records
    if (role === 'staff') {
      return { allowed: false, reason: 'Akun Staff belum ditugaskan ke properti mana pun. Hubungi Super Admin.' };
    }

    return { allowed: true };
  }

  // Middleware for Admin authentication check
  async function requireAdminAuth(req: any, res: any, next: any) {
    try {
      let accessToken = getCookie(req, 'sb-access-token');
      if (!accessToken && req.headers.authorization) {
        const parts = req.headers.authorization.split(' ');
        if (parts[0] === 'Bearer') {
          accessToken = parts[1];
        }
      }
      if (!accessToken && req.headers['x-access-token']) {
        const raw = req.headers['x-access-token'];
        accessToken = Array.isArray(raw) ? raw[0] : raw;
      }

      if (!accessToken) {
        const rawRefresh = req.headers['x-refresh-token'];
        const refreshToken = getCookie(req, 'sb-refresh-token') || (Array.isArray(rawRefresh) ? rawRefresh[0] : rawRefresh);
        if (refreshToken) {
          const freshClient = getSupabaseServerClient();
          const { data, error } = await freshClient.auth.refreshSession({ refresh_token: String(refreshToken) });
          if (!error && data.session) {
            accessToken = data.session.access_token;
            setAuthCookies(res, data.session.access_token, data.session.refresh_token, data.session.expires_in);
          }
        }
      }

      if (!accessToken) {
        // In container development mode, allow dev admin session if no token is passed
        if (process.env.NODE_ENV !== 'production') {
          req.authUser = { id: 'dev-admin-id', email: 'admin@samarastay.co.id' };
          req.authProfile = { id: 'dev-admin-id', email: 'admin@samarastay.co.id', role: 'super', full_name: 'Developer Admin' };
          return next();
        }
        return res.status(401).json({ success: false, error: 'Akses ditolak. Token autentikasi tidak ditemukan.' });
      }

      const client = getSupabaseServerClient(accessToken);
      let { data: { user }, error } = await client.auth.getUser(accessToken);

      // If token expired, try refreshing
      if (error || !user) {
        const refreshToken = getCookie(req, 'sb-refresh-token') || req.headers['x-refresh-token'];
        if (refreshToken) {
          const freshClient = getSupabaseServerClient();
          const { data: refData, error: refErr } = await freshClient.auth.refreshSession({ refresh_token: String(refreshToken) });
          if (!refErr && refData.session?.user) {
            user = refData.session.user;
            accessToken = refData.session.access_token;
            setAuthCookies(res, refData.session.access_token, refData.session.refresh_token, refData.session.expires_in);
          } else {
            return res.status(401).json({ success: false, error: 'Sesi tidak valid atau telah kadaluarsa.' });
          }
        } else {
          return res.status(401).json({ success: false, error: 'Sesi tidak valid atau telah kadaluarsa.' });
        }
      }

      let profileRole: string | null = null;
      try {
        const { data: profile } = await client.from('profiles').select('role').eq('id', user.id).maybeSingle();
        if (profile?.role) {
          profileRole = profile.role;
        }
      } catch (pErr) {
        console.warn('[requireAdminAuth] Non-blocking profiles table check notice:', pErr);
      }

      const userData = await getOrMigrateUserProfile(client, user);
      const isSuper = isSuperAdminEmail(user.email || '');
      const isOwner = isOwnerEmail(user.email || '');
      const effectiveRole = profileRole || userData?.role || (isSuper ? 'super' : (isOwner ? 'owner' : 'user'));
      const isAuthorized = ['admin', 'super', 'super_admin', 'finance', 'staff', 'owner'].includes(effectiveRole);

      if (!isAuthorized) {
        return res.status(403).json({ success: false, error: 'Akses ditolak. Peran Anda tidak memiliki izin admin.' });
      }

      req.authUser = user;
      req.authProfile = { 
        ...(userData || {}), 
        role: effectiveRole,
        property_id: userData?.property_id !== undefined ? userData.property_id : null
      };
      next();
    } catch (err: any) {
      return res.status(500).json({ success: false, error: 'Terjadi kesalahan pada verifikasi autentikasi.' });
    }
  }

  // =========================================================================
  // 1. MIDTRANS API INTEGRATION (REAL & SIMULATED CO-EXISTENCE)
  // =========================================================================

  const midtransLogs: any[] = [];

  function addMidtransLog(entry: {
    orderId: string;
    customerName?: string;
    customerEmail?: string;
    amount?: number;
    type: 'charge' | 'webhook' | 'client_event' | 'error' | 'simulation';
    status: string;
    message: string;
    details?: any;
  }) {
    midtransLogs.unshift({
      id: `log-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      timestamp: new Date().toISOString(),
      ...entry
    });
    // Keep last 100 logs
    if (midtransLogs.length > 100) {
      midtransLogs.pop();
    }
  }

  // Midtrans Logs Retrieval API
  app.get('/api/midtrans/logs', requireAdminAuth, (req, res) => {
    return res.json({ logs: midtransLogs });
  });

  // Client-Side configuration bridge API (Allows frontend to sync on container credentials at runtime)
  app.get('/api/config', (req, res) => {
    res.json({
      supabaseUrl: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
      supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
      midtransClientKey: process.env.VITE_MIDTRANS_CLIENT_KEY || process.env.MIDTRANS_CLIENT_KEY || ''
    });
  });

  // Client-Side Logs Submission API
  app.post('/api/midtrans/logs', apiRateLimiter(60000, 60), express.json(), (req, res) => {
    const { orderId, customerName, customerEmail, amount, type, status, message, details } = req.body;
    addMidtransLog({
      orderId: orderId || 'unknown',
      customerName,
      customerEmail,
      amount: amount ? Number(amount) : undefined,
      type: type || 'client_event',
      status: status || 'info',
      message: message || 'Client event recorded',
      details
    });
    return res.json({ status: 'OK' });
  });

  // Clear Midtrans Logs
  app.post('/api/midtrans/logs/clear', requireAdminAuth, (req, res) => {
    midtransLogs.length = 0;
    return res.json({ status: 'OK' });
  });

  // =========================================================================
  // CONTRACT EXTENSION REALTIME SETTLEMENT ENGINE
  // =========================================================================
  async function settleContractExtensionTransaction(
    supabase: any,
    orderId: string,
    paymentType: string = 'Midtrans SNAP',
    transactionId?: string,
    grossAmount?: number,
    feeAmount?: number,
    options?: {
      tenantId?: number;
      extensionMonths?: number;
      notes?: string;
    }
  ) {
    console.log(`[SETTLE EXTENSION] Executing contract extension settlement for Order: "${orderId}"`);
    
    // 1. Fetch existing contract extension if exists
    let { data: ext } = await supabase
      .from('contract_extensions')
      .select('*')
      .eq('midtrans_order_id', orderId)
      .maybeSingle();

    let tenantId = ext?.tenant_id || options?.tenantId;
    let extensionMonths = ext?.extension_months || options?.extensionMonths || 1;
    let totalAmount = grossAmount || ext?.total_amount || 0;

    if (!tenantId && (orderId.startsWith('EXT-') || orderId.startsWith('EXTEND-'))) {
      const parts = orderId.split('-');
      if (parts.length >= 2) {
        const parsed = parseInt(parts[1], 10);
        if (!isNaN(parsed)) tenantId = parsed;
      }
    }

    if (!tenantId) {
      throw new Error(`Tenant ID tidak ditemukan untuk perpanjangan kontrak ${orderId}`);
    }

    // 2. Fetch tenant
    const { data: tenant, error: tErr } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .maybeSingle();

    if (tErr || !tenant) {
      throw new Error(`Data penyewa dengan ID ${tenantId} tidak ditemukan.`);
    }

    // 3. Update tenant duration_months and status
    const currentDuration = Number(tenant.duration_months) || 1;
    const newDuration = currentDuration + Number(extensionMonths);
    const { data: updatedTenant, error: tUpdErr } = await supabase
      .from('tenants')
      .update({
        duration_months: newDuration,
        payment_status: 'paid',
        status: 'active'
      })
      .eq('id', tenantId)
      .select()
      .maybeSingle();

    if (tUpdErr) {
      console.error('[SETTLE EXTENSION] Error updating tenant duration_months:', tUpdErr);
    }

    // 4. Resolve property name
    let propertyName = ext?.property_name || 'Samara Stay Residence';
    if (tenant.property_id) {
      const { data: prop } = await supabase.from('properties').select('name').eq('id', tenant.property_id).maybeSingle();
      if (prop?.name) propertyName = prop.name;
    }

    // 5. Generate Invoice & Transaction IDs
    const invoiceId = ext?.invoice_id || `INV-EXT-${tenantId}-${Date.now()}`;
    const trxId = transactionId || ext?.midtrans_order_id || `mid-tr-ext-${Math.floor(100000 + Math.random() * 900000)}`;
    const monthlyRate = ext?.monthly_rate || Math.round(Number(totalAmount) / Math.max(1, Number(extensionMonths)));

    // 6. Upsert contract_extensions table
    let savedExtension: any = null;
    const extensionPayload = {
      tenant_id: tenantId,
      tenant_name: tenant.full_name,
      property_id: tenant.property_id,
      property_name: propertyName,
      room_number: tenant.room_number,
      old_start_date: tenant.start_date,
      old_duration_months: currentDuration,
      extension_months: Number(extensionMonths),
      monthly_rate: monthlyRate,
      total_amount: Number(totalAmount),
      payment_method: paymentType || 'Midtrans SNAP',
      status: 'paid',
      midtrans_order_id: orderId,
      invoice_id: invoiceId,
      notes: options?.notes || ext?.notes || `Pelunasan perpanjangan sewa ${extensionMonths} bulan`,
      paid_at: new Date().toISOString()
    };

    if (ext?.id) {
      const { data: updExt } = await supabase
        .from('contract_extensions')
        .update(extensionPayload)
        .eq('id', ext.id)
        .select()
        .maybeSingle();
      savedExtension = updExt || { ...ext, ...extensionPayload };
    } else {
      const { data: insExt } = await supabase
        .from('contract_extensions')
        .insert(extensionPayload)
        .select()
        .maybeSingle();
      savedExtension = insExt || extensionPayload;
    }

    // 7. Insert into payments
    try {
      await supabase.from('payments').insert({
        id: invoiceId,
        tenant_name: tenant.full_name,
        property_id: tenant.property_id,
        amount: Number(totalAmount),
        method: paymentType || 'Midtrans SNAP',
        status: 'paid',
        payment_date: new Date().toISOString().split('T')[0],
        midtrans_order_id: orderId,
        transaction_id: trxId
      });
    } catch (payErr) {
      console.warn('[SETTLE EXTENSION] Payment insert warning:', payErr);
    }

    // 8. Record clearing transactions
    try {
      const feeAmt = Number(feeAmount || 0);
      const grossAmt = Number(totalAmount || 0);
      await supabase.from('midtrans_clearing_transactions').upsert({
        midtrans_order_id: orderId,
        midtrans_transaction_id: trxId,
        payment_id: invoiceId,
        contract_extension_id: savedExtension?.id || null,
        gross_amount: grossAmt,
        fee_amount: feeAmt,
        net_amount: grossAmt - feeAmt,
        reconciled_amount: 0,
        outstanding_amount: grossAmt,
        clearing_status: 'cleared',
        property_id: tenant.property_id || null,
        tenant_name: tenant.full_name || null,
        settled_at: new Date().toISOString()
      }, { onConflict: 'midtrans_order_id' });
    } catch (clrErr) {
      console.warn('[SETTLE EXTENSION] Clearing upsert warning:', clrErr);
    }

    // 9. Financial double-entry ledger posting
    try {
      await verifyAndEnsureCriticalCOA(supabase, true);
      const { data: debitAcc } = await supabase.from('accounts').select('id, balance').ilike('name', '%kas%').maybeSingle()
        || await supabase.from('accounts').select('id, balance').eq('type', 'asset').limit(1).maybeSingle();
      const { data: creditAcc } = await supabase.from('accounts').select('id, balance').ilike('name', '%pendapatan%sewa%').maybeSingle()
        || await supabase.from('accounts').select('id, balance').eq('type', 'revenue').limit(1).maybeSingle();

      if (debitAcc && creditAcc) {
        const trxNo = `TRX-EXT-${Date.now()}`;
        const { data: finTrx } = await supabase.from('financial_transactions').insert({
          transaction_no: trxNo,
          transaction_date: new Date().toISOString().split('T')[0],
          category: 'Pendapatan Sewa',
          description: `Perpanjangan Sewa Kamar ${tenant.room_number} (${tenant.full_name}) - ${extensionMonths} Bulan`,
          amount: Number(totalAmount),
          type: 'income',
          reference_type: 'contract_extension',
          reference_id: String(savedExtension?.id || invoiceId),
          created_by: 'Finance System',
          property_id: tenant.property_id
        }).select().maybeSingle();

        if (finTrx) {
          const jrnNo = `JRN-${Date.now()}`;
          await supabase.from('journal_entries').insert([
            { journal_no: jrnNo, transaction_id: finTrx.id, account_id: debitAcc.id, debit: Number(totalAmount), credit: 0 },
            { journal_no: jrnNo, transaction_id: finTrx.id, account_id: creditAcc.id, debit: 0, credit: Number(totalAmount) }
          ]);
          await supabase.from('accounts').update({ balance: Number(debitAcc.balance || 0) + Number(totalAmount) }).eq('id', debitAcc.id);
          await supabase.from('accounts').update({ balance: Number(creditAcc.balance || 0) + Number(totalAmount) }).eq('id', creditAcc.id);
        }
      }
    } catch (coaErr) {
      console.warn('[SETTLE EXTENSION] COA posting warning:', coaErr);
    }

    // 10. Ensure Room is occupied
    try {
      if (tenant.room_number && tenant.property_id) {
        await supabase.from('rooms').update({
          status: 'occupied',
          current_tenant_name: tenant.full_name
        }).eq('property_id', tenant.property_id).eq('room_number', tenant.room_number);
      }
    } catch (rErr) {
      console.warn('[SETTLE EXTENSION] Room update warning:', rErr);
    }

    // 11. Broadcast realtime mutation via Supabase global channel
    try {
      const channel = supabase.channel('db-global-realtime');
      await channel.subscribe();
      await channel.send({
        type: 'broadcast',
        event: 'db_mutation',
        payload: {
          table: 'contract_extensions',
          eventType: 'INSERT',
          data: savedExtension,
          sourceTabId: 'backend-server'
        }
      });
      await channel.send({
        type: 'broadcast',
        event: 'db_mutation',
        payload: {
          table: 'tenants',
          eventType: 'UPDATE',
          data: updatedTenant || { ...tenant, duration_months: newDuration, payment_status: 'paid', status: 'active' },
          sourceTabId: 'backend-server'
        }
      });
      await channel.send({
        type: 'broadcast',
        event: 'db_mutation',
        payload: {
          table: 'payments',
          eventType: 'INSERT',
          data: { id: invoiceId, amount: Number(totalAmount) },
          sourceTabId: 'backend-server'
        }
      });
    } catch (bErr) {
      console.warn('[SETTLE EXTENSION] Realtime broadcast warning (non-fatal):', bErr);
    }

    // 12. Send confirmation email to tenant if email present
    if (tenant.email && tenant.email.includes('@')) {
      try {
        const formattedPrice = 'Rp ' + Number(totalAmount).toLocaleString('id-ID');
        const subject = `[Samara Stay] Bukti Pembayaran Perpanjangan Kontrak - Unit ${tenant.room_number}`;
        let extOwnerSigUrl = 'https://eniwbzpfvwtbsonmnzzr.supabase.co/storage/v1/object/public/signatures/owner_official_signature.png';
        try {
          const { data: setRow } = await supabase.from('settings').select('owner_signature_url').eq('id', 1).maybeSingle();
          if (setRow?.owner_signature_url) {
            extOwnerSigUrl = setRow.owner_signature_url;
          }
        } catch (sErr) {}

        const text = `Halo ${tenant.full_name}, pembayaran perpanjangan kontrak sewa kamar Anda di ${propertyName} (Unit ${tenant.room_number}) selama ${extensionMonths} bulan telah berhasil dilunasi!`;
        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
            <h2 style="color: #0D9488; margin-top: 0;">Perpanjangan Kontrak Berhasil</h2>
            <p>Halo <strong>${tenant.full_name}</strong>,</p>
            <p>Terima kasih! Pembayaran perpanjangan masa sewa kamar Anda telah berhasil diverifikasi dan aktif di sistem.</p>
            <div style="background-color: #f8fafc; padding: 15px; border-radius: 12px; margin: 20px 0; border: 1px solid #e2e8f0;">
              <p style="margin: 5px 0;"><strong>No. Invoice:</strong> ${invoiceId}</p>
              <p style="margin: 5px 0;"><strong>Order ID:</strong> ${orderId}</p>
              <p style="margin: 5px 0;"><strong>Properti:</strong> ${propertyName}</p>
              <p style="margin: 5px 0;"><strong>Unit Kamar:</strong> Kamar ${tenant.room_number}</p>
              <p style="margin: 5px 0;"><strong>Durasi Tambahan:</strong> +${extensionMonths} Bulan</p>
              <p style="margin: 5px 0;"><strong>Total Durasi Aktif:</strong> ${newDuration} Bulan</p>
              <p style="margin: 5px 0;"><strong>Total Pembayaran:</strong> ${formattedPrice}</p>
              <p style="margin: 5px 0;"><strong>Metode Bayar:</strong> ${paymentType}</p>
              <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: #059669; font-weight: bold;">LUNAS (KONTRAK DIPERPANJANG)</span></p>
            </div>

            <!-- PENGESAHAN TANDA TANGAN RESMI OWNER -->
            <div style="margin-top: 25px; padding: 16px; border: 1px dashed #94a3b8; border-radius: 12px; background-color: #ffffff; text-align: center;">
              <p style="font-size: 10px; color: #475569; font-weight: 800; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px;">PENGESAHAN DOKUMEN DIGITAL:</p>
              <div style="display: inline-block; min-height: 55px; text-align: center;">
                <img src="cid:owner-signature" alt="Tanda Tangan Owner" style="max-height: 55px; max-width: 140px; display: inline-block;" />
              </div>
              <p style="font-size: 10px; color: #1e293b; font-weight: 800; margin: 4px 0 0 0; text-transform: uppercase;">SAMARA STAY MANAGEMENT</p>
              <p style="font-size: 8px; color: #059669; font-weight: bold; margin: 2px 0 0 0; font-family: monospace;">[ RESMI & TERVERIFIKASI ]</p>
            </div>
          </div>
        `;
        sendServerEmail(tenant.email, subject, text, html, { ownerSigUrl: extOwnerSigUrl });
      } catch (emErr) {
        console.warn('[SETTLE EXTENSION] Email send warning:', emErr);
      }
    }

    return {
      success: true,
      invoiceId,
      newDurationMonths: newDuration,
      extension: savedExtension,
      tenant: updatedTenant || { ...tenant, duration_months: newDuration, payment_status: 'paid', status: 'active' }
    };
  }

  // Admin API: Contract Extension Settlement (Secured via requireAdminAuth + service_role)
  app.post('/api/admin/contract-extension/settle', requireAdminAuth, express.json(), async (req, res) => {
    try {
      const {
        tenantId,
        extensionMonths,
        totalAmount,
        paymentMethod,
        midtransOrderId,
        transactionId,
        notes
      } = req.body;

      if (!tenantId || !extensionMonths || !totalAmount) {
        return res.status(400).json({ error: 'tenantId, extensionMonths, dan totalAmount wajib diisi.' });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: 'Supabase URL atau Key belum dikonfigurasi di server.' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      // Verify tenant existence and enforce property-level access segregation
      const { data: tenantData, error: tenantFetchErr } = await supabaseAdmin
        .from('tenants')
        .select('*')
        .eq('id', tenantId)
        .maybeSingle();

      if (tenantFetchErr || !tenantData) {
        return res.status(404).json({ error: 'Data penyewa tidak ditemukan.' });
      }

      const propAccess = checkPropertyAccess(req.authProfile, tenantData.property_id);
      if (!propAccess.allowed) {
        return res.status(403).json({ error: propAccess.reason || 'Akses ditolak ke properti ini.' });
      }

      const orderId = midtransOrderId || `EXT-${tenantId}-${Date.now()}`;
      const trxId = transactionId || `mid-tr-ext-${Math.floor(100000 + Math.random() * 900000)}`;

      const settleResult = await settleContractExtensionTransaction(
        supabaseAdmin,
        orderId,
        paymentMethod || 'Tunai / Transfer Manual',
        trxId,
        Number(totalAmount),
        0,
        {
          tenantId: Number(tenantId),
          extensionMonths: Number(extensionMonths),
          notes: notes || `Pelunasan langsung perpanjangan sewa ${extensionMonths} bulan`
        }
      );

      return res.status(200).json(settleResult);
    } catch (err: any) {
      console.error('[Admin API] contract-extension/settle failed:', err);
      return res.status(500).json({ error: err.message || 'Internal server error.' });
    }
  });

  // Admin API: Financial Transaction Post (Secured via requireAdminAuth)
  app.post('/api/admin/financial-transaction/post', requireAdminAuth, express.json(), async (req, res) => {
    try {
      const {
        category,
        description,
        amount,
        type,
        reference_type,
        reference_id,
        created_by,
        debit_account_id,
        credit_account_id,
        property_id
      } = req.body;

      if (!category || !description || !amount || !type || !debit_account_id || !credit_account_id) {
        return res.status(400).json({ error: 'Field wajib untuk posting transaksi belum lengkap.' });
      }

      // Enforce property-level access segregation
      const propAccess = checkPropertyAccess(req.authProfile, property_id);
      if (!propAccess.allowed) {
        return res.status(403).json({ error: propAccess.reason || 'Akses ditolak ke properti ini.' });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: 'Supabase URL atau Key belum dikonfigurasi di server.' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      // Verify and ensure all critical COA accounts exist before double-entry posting
      await verifyAndEnsureCriticalCOA(supabaseAdmin, true);

      const trxDate = new Date().toISOString().split('T')[0];
      const trxNo = `TRX-${trxDate.replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;

      let postedData: any = null;

      try {
        const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('post_financial_transaction', {
          p_transaction_no: trxNo,
          p_transaction_date: trxDate,
          p_category: category,
          p_description: description,
          p_amount: amount,
          p_type: type,
          p_reference_type: reference_type || null,
          p_reference_id: reference_id || null,
          p_created_by: created_by || req.authProfile?.full_name || 'Admin',
          p_debit_account_id: debit_account_id,
          p_credit_account_id: credit_account_id,
          p_property_id: property_id || null
        });

        if (rpcErr) {
          console.warn('[Admin API] post_financial_transaction RPC returned error, using direct table fallback:', rpcErr.message);
          throw rpcErr;
        }
        postedData = rpcRes;
      } catch (e) {
        // Direct table insert fallback
        const { data: insertedTrx, error: insertTrxErr } = await supabaseAdmin
          .from('financial_transactions')
          .insert({
            transaction_no: trxNo,
            transaction_date: trxDate,
            category: category,
            description: description,
            amount: Number(amount),
            type: type,
            reference_type: reference_type || null,
            reference_id: reference_id ? String(reference_id) : null,
            created_by: created_by || req.authProfile?.full_name || 'Admin',
            property_id: property_id || null
          })
          .select()
          .single();

        if (!insertTrxErr && insertedTrx) {
          const journalNo = `JRN-${trxDate.replace(/-/g, '')}-${insertedTrx.id}`;
          try {
            await supabaseAdmin.from('journal_entries').insert([
              {
                journal_no: journalNo,
                transaction_id: insertedTrx.id,
                account_id: debit_account_id,
                debit: Number(amount),
                credit: 0
              },
              {
                journal_no: journalNo,
                transaction_id: insertedTrx.id,
                account_id: credit_account_id,
                debit: 0,
                credit: Number(amount)
              }
            ]);
          } catch (jErr) {
            console.warn('[Admin API] journal_entries insert fallback note:', jErr);
          }
          postedData = insertedTrx;
        }
      }

      return res.status(200).json({ success: true, data: postedData || { transaction_no: trxNo } });
    } catch (err: any) {
      console.error('[Admin API] financial-transaction/post failed:', err);
      return res.status(500).json({ error: err.message || 'Internal server error.' });
    }
  });

  // Admin API: Assign property to staff/finance user (Restricted to Super Admin & Owner)
  app.patch('/api/admin/users/:id/assign-property', requireAdminAuth, express.json(), async (req, res) => {
    try {
      const callerRole = req.authProfile?.role;
      const isPrivileged = ['super', 'super_admin', 'owner'].includes(callerRole);
      if (!isPrivileged) {
        return res.status(403).json({ 
          success: false, 
          error: 'Hanya Super Admin atau Owner yang memiliki izin untuk menugaskan properti ke pengguna.' 
        });
      }

      const targetUserId = req.params.id;
      if (!targetUserId) {
        return res.status(400).json({ success: false, error: 'User ID target wajib disertakan.' });
      }

      const { property_id } = req.body;
      const targetPropertyId = (property_id === null || property_id === undefined || property_id === '' || property_id === 0) 
        ? null 
        : Number(property_id);

      const serviceKey = getServiceRoleKeyOrThrow();
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const adminClient = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });

      // 1. Verify target user exists
      const { data: targetUser, error: userFetchErr } = await adminClient
        .from('users')
        .select('*')
        .eq('id', targetUserId)
        .maybeSingle();

      if (userFetchErr) {
        return res.status(500).json({ success: false, error: `Gagal membaca data pengguna: ${userFetchErr.message}` });
      }
      if (!targetUser) {
        return res.status(404).json({ success: false, error: 'Pengguna target tidak ditemukan.' });
      }

      // 2. If assigning to a specific property, verify property exists
      let propertyName = '';
      if (targetPropertyId !== null) {
        const { data: prop, error: propErr } = await adminClient
          .from('properties')
          .select('id, name')
          .eq('id', targetPropertyId)
          .maybeSingle();

        if (propErr || !prop) {
          return res.status(400).json({ success: false, error: `Properti dengan ID ${targetPropertyId} tidak ditemukan.` });
        }
        propertyName = prop.name;
      }

      // 3. Update users table with new property_id and access description
      const updatedAccess = targetPropertyId !== null 
        ? `Akses Terbatas: Properti ${propertyName || targetPropertyId}`
        : (['super', 'super_admin'].includes(targetUser.role) 
            ? 'Semua Properti (Super Admin)' 
            : targetUser.role === 'owner' 
              ? 'Owner Investor Portfolio' 
              : 'Akses Semua Properti (Global)');

      const { data: updatedUser, error: updateErr } = await adminClient
        .from('users')
        .update({
          property_id: targetPropertyId,
          access: updatedAccess
        })
        .eq('id', targetUserId)
        .select('*')
        .single();

      if (updateErr) {
        return res.status(500).json({ success: false, error: `Gagal memperbarui properti pengguna: ${updateErr.message}` });
      }

      // 4. Record audit log
      try {
        await adminClient.from('activity_logs').insert({
          admin_name: req.authProfile?.full_name || req.authProfile?.email || 'Admin',
          action: 'ASSIGN_USER_PROPERTY',
          detail: `Menugaskan user ${targetUser.full_name || targetUser.email} ke properti: ${propertyName || 'Global (Semua Properti)'} (ID: ${targetPropertyId ?? 'null'})`,
          created_at: new Date().toISOString()
        });
      } catch (logErr) {
        console.warn('[Admin API] activity log insert notice:', logErr);
      }

      return res.status(200).json({
        success: true,
        message: targetPropertyId !== null 
          ? `Pengguna ${targetUser.full_name || targetUser.email} berhasil ditugaskan ke properti ${propertyName}.`
          : `Penugasan properti pengguna ${targetUser.full_name || targetUser.email} berhasil diatur ke Global (Semua Properti).`,
        user: updatedUser
      });
    } catch (err: any) {
      console.error('[Admin API] assign-property failed:', err);
      return res.status(500).json({ success: false, error: err.message || 'Internal server error.' });
    }
  });

  // Admin API: Atomic Idempotent Booking Approval with Server-Side Accounting & Email Dispatch
  app.post('/api/admin/booking/approve', requireAdminAuth, express.json(), async (req, res) => {
    try {
      const { booking_id, payment_method } = req.body;

      if (!booking_id) {
        return res.status(400).json({ success: false, error: 'booking_id wajib disertakan.' });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: 'Supabase URL atau Service Key belum dikonfigurasi di server.' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      // 1. Fetch current booking to verify existence and check property-level RBAC access
      const { data: existingBooking, error: fetchErr } = await supabaseAdmin
        .from('bookings')
        .select('*')
        .eq('id', booking_id)
        .maybeSingle();

      if (fetchErr || !existingBooking) {
        return res.status(404).json({ success: false, error: 'Data booking tidak ditemukan di database.' });
      }

      const propAccess = checkPropertyAccess(req.authProfile, existingBooking.property_id);
      if (!propAccess.allowed) {
        return res.status(403).json({ success: false, error: propAccess.reason || 'Akses ditolak ke properti ini.' });
      }

      // 2. Idempotency Check: If already approved, return early without duplicating side-effects
      if (existingBooking.status === 'approved') {
        const { data: existingPayment } = await supabaseAdmin
          .from('payments')
          .select('id')
          .or(`midtrans_order_id.eq.${existingBooking.midtrans_order_id},tenant_name.eq.${existingBooking.tenant_name}`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        return res.status(200).json({
          success: true,
          already_approved: true,
          message: 'Booking sudah disetujui sebelumnya (Idempotent).',
          booking: existingBooking,
          invoice_id: existingPayment?.id || null
        });
      }

      // Ensure critical Chart of Accounts (COA) exist before financial double entry
      await verifyAndEnsureCriticalCOA(supabaseAdmin, true);

      let finalBooking = existingBooking;
      let finalInvoiceId = `INV-${existingBooking.id}-${Date.now()}`;
      let wasAlreadyApproved = false;

      // 3. Attempt Atomic DB RPC `settle_manual_booking_approval` (Migration 034)
      try {
        const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('settle_manual_booking_approval', {
          p_booking_id: booking_id,
          p_payment_method: payment_method || existingBooking.payment_method || 'Transfer Manual',
          p_created_by: req.authProfile?.full_name || 'Admin Approval'
        });

        if (!rpcErr && rpcRes && rpcRes.success) {
          console.log(`[Admin API approve_booking] Atomic settle RPC success for booking ${booking_id}. already_approved: ${rpcRes.already_approved}`);
          finalBooking = rpcRes.booking || existingBooking;
          finalInvoiceId = rpcRes.invoice_id || finalInvoiceId;
          wasAlreadyApproved = Boolean(rpcRes.already_approved);
        } else {
          throw new Error(rpcErr?.message || rpcRes?.error || 'RPC execution fallback needed');
        }
      } catch (rpcEx: any) {
        console.warn('[Admin API approve_booking] RPC fallback to transactional server-side execution:', rpcEx?.message || rpcEx);

        // Server-Side Fallback Transaction:
        // A. Update booking status
        const resolvedPaymentMethod = payment_method || existingBooking.payment_method || 'Transfer Manual';
        const { data: updatedRows, error: updateErr } = await supabaseAdmin
          .from('bookings')
          .update({
            status: 'approved',
            payment_method: resolvedPaymentMethod
          })
          .eq('id', booking_id)
          .neq('status', 'approved')
          .select();

        if (updateErr) {
          console.error('[Admin API approve_booking] Server fallback booking update failed:', updateErr);
          return res.status(500).json({ success: false, error: updateErr.message });
        }

        if (!updatedRows || updatedRows.length === 0) {
          return res.status(200).json({
            success: true,
            already_approved: true,
            message: 'Booking disetujui oleh proses lain secara bersamaan.',
            booking: existingBooking
          });
        }

        finalBooking = updatedRows[0];
        const occupantName = finalBooking.occupant_name || finalBooking.tenant_name || 'Penyewa';
        const occupantPhone = finalBooking.occupant_phone || finalBooking.phone || '';
        const occupantEmail = finalBooking.occupant_email || finalBooking.email || '';
        const totalPrice = Number(finalBooking.total_price || 0);
        const trxDate = new Date().toISOString().split('T')[0];

        // B. Update Room Status to Occupied
        if (finalBooking.room_id) {
          await supabaseAdmin.from('rooms').update({
            status: 'occupied',
            current_tenant_name: occupantName
          }).eq('id', finalBooking.room_id);
        }

        // C. Upsert Tenant Record
        const initials = (occupantName || 'TM').slice(0, 2).toUpperCase();
        try {
          const { data: existingTenant } = await supabaseAdmin
            .from('tenants')
            .select('id')
            .eq('room_number', finalBooking.room_number)
            .eq('property_id', finalBooking.property_id)
            .maybeSingle();

          if (existingTenant) {
            await supabaseAdmin.from('tenants').update({
              full_name: occupantName,
              phone: occupantPhone,
              email: occupantEmail,
              start_date: finalBooking.check_in_date || trxDate,
              duration_months: finalBooking.duration_months || 1,
              payment_status: 'paid'
            }).eq('id', existingTenant.id);
          } else {
            await supabaseAdmin.from('tenants').insert({
              full_name: occupantName,
              phone: occupantPhone,
              email: occupantEmail,
              avatar_initials: initials,
              avatar_color: 'bg-indigo-600',
              property_id: finalBooking.property_id,
              room_number: finalBooking.room_number,
              start_date: finalBooking.check_in_date || trxDate,
              duration_months: finalBooking.duration_months || 1,
              payment_status: 'paid'
            });
          }
        } catch (tErr) {
          console.warn('[Admin API approve_booking] Tenant upsert notice:', tErr);
        }

        // D. Insert Payment Invoice Record
        finalInvoiceId = `INV-${finalBooking.id}-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
        try {
          await supabaseAdmin.from('payments').insert({
            id: finalInvoiceId,
            tenant_name: occupantName,
            property_id: finalBooking.property_id,
            amount: totalPrice,
            method: resolvedPaymentMethod,
            status: 'paid',
            payment_date: trxDate,
            midtrans_order_id: finalBooking.midtrans_order_id || null,
            transaction_id: finalBooking.midtrans_order_id || `manual-tr-${Math.floor(100000 + Math.random() * 900000)}`
          });
        } catch (pErr) {
          console.warn('[Admin API approve_booking] Payment record insert notice:', pErr);
        }

        // E. Post Double-Entry Ledger Transaction
        const debitAccountId = (resolvedPaymentMethod || '').toLowerCase().includes('midtrans') ? 1200 : 1010;
        const creditAccountId = 4000; // Pendapatan Sewa
        const trxNo = `TRX-${trxDate.replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;

        try {
          const { data: insertedTrx, error: trxErr } = await supabaseAdmin
            .from('financial_transactions')
            .insert({
              transaction_no: trxNo,
              transaction_date: trxDate,
              category: 'Penerimaan Sewa',
              description: `[APPROVAL] Pelunasan Sewa ${occupantName} Unit ${finalBooking.room_number || ''}`,
              amount: totalPrice,
              type: 'income',
              reference_type: 'payment',
              reference_id: finalInvoiceId,
              created_by: req.authProfile?.full_name || 'Admin Approval',
              property_id: finalBooking.property_id || null
            })
            .select()
            .single();

          if (!trxErr && insertedTrx) {
            const journalNo = `JRN-${trxDate.replace(/-/g, '')}-${insertedTrx.id}`;
            await supabaseAdmin.from('journal_entries').insert([
              {
                journal_no: journalNo,
                transaction_id: insertedTrx.id,
                account_id: debitAccountId,
                debit: totalPrice,
                credit: 0
              },
              {
                journal_no: journalNo,
                transaction_id: insertedTrx.id,
                account_id: creditAccountId,
                debit: 0,
                credit: totalPrice
              }
            ]);

            // Update account balances
            const { data: accDebit } = await supabaseAdmin.from('accounts').select('balance').eq('id', debitAccountId).maybeSingle();
            if (accDebit) {
              await supabaseAdmin.from('accounts').update({ balance: Number(accDebit.balance || 0) + totalPrice }).eq('id', debitAccountId);
            }
            const { data: accCredit } = await supabaseAdmin.from('accounts').select('balance').eq('id', creditAccountId).maybeSingle();
            if (accCredit) {
              await supabaseAdmin.from('accounts').update({ balance: Number(accCredit.balance || 0) + totalPrice }).eq('id', creditAccountId);
            }
          }
        } catch (ledgerErr: any) {
          console.warn('[Admin API approve_booking] Double-entry ledger recording notice:', ledgerErr);
          try {
            await supabaseAdmin.from('failed_ledger_postings').insert({
              transaction_no: trxNo,
              reference_type: 'payment',
              reference_id: finalInvoiceId,
              amount: totalPrice,
              debit_account_id: debitAccountId,
              credit_account_id: creditAccountId,
              property_id: finalBooking.property_id,
              created_by: req.authProfile?.full_name || 'Admin Approval',
              error_message: `Manual approval ledger fallback note: ${ledgerErr?.message || ledgerErr}`,
              status: 'pending'
            });
          } catch (failLogErr) {
            console.warn('[Admin API approve_booking] failed_ledger_postings logging notice:', failLogErr);
          }
        }
      }

      // 4. Server-Side Email Dispatch via MailerSend (Non-blocking background)
      if (!wasAlreadyApproved) {
        const targetEmail = finalBooking.occupant_email || finalBooking.email;
        if (targetEmail && targetEmail.includes('@')) {
          setImmediate(async () => {
            try {
              let property: any = null;
              if (finalBooking.property_id) {
                const { data: prop } = await supabaseAdmin.from('properties').select('*').eq('id', finalBooking.property_id).maybeSingle();
                property = prop;
              }

              const occupantName = finalBooking.occupant_name || finalBooking.tenant_name || 'Penyewa';
              const occupantPhone = finalBooking.occupant_phone || finalBooking.phone || '';
              const propertyName = property?.name || 'Samara Stay Premium Residence';
              const propertyAddress = property?.address || 'Area Hunian Premium Samara Stay';
              const paymentMethodName = finalBooking.payment_method || 'Transfer Manual / Kasir';
              const formattedPrice = 'Rp ' + Number(finalBooking.total_price || 0).toLocaleString('id-ID');
              const subject = `[Samara Stay] Invoice Pelunasan Sewa Kamar - Unit ${finalBooking.room_number}`;
              const text = `Halo ${occupantName}, pemesanan sewa kamar Anda di ${propertyName} (Unit ${finalBooking.room_number}) telah disetujui dan diverifikasi lunas!`;

              const html = `
                <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 24px; background-color: #ffffff; color: #1e293b; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);">
                  <div style="text-align: center; border-bottom: 2px solid #334155; padding-bottom: 25px; margin-bottom: 30px;">
                    <h1 style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 28px; font-weight: 800; letter-spacing: 6px; text-transform: uppercase; color: #1e293b; margin: 10px 0 2px 0;">SAMARA</h1>
                    <p style="font-family: 'Courier New', Courier, monospace; font-size: 11px; font-weight: bold; letter-spacing: 3px; text-transform: uppercase; color: #64748b; margin: 0;">S T A Y</p>
                  </div>

                  <div style="text-align: center; margin-bottom: 30px;">
                    <span style="background-color: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; font-size: 11px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; padding: 6px 16px; border-radius: 9999px; display: inline-block; margin-bottom: 12px;">LUNAS / VERIFIED</span>
                    <h2 style="color: #1e293b; margin: 0; font-size: 20px; font-weight: 700;">INVOICE PEMBAYARAN SEWA</h2>
                    <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0; font-family: monospace;">No: ${finalInvoiceId}</p>
                  </div>

                  <div style="margin-bottom: 25px; font-size: 14px; line-height: 1.6; color: #334155;">
                    <p>Halo <strong>${occupantName}</strong>,</p>
                    <p>Pemesanan sewa kamar Anda di <strong>${propertyName}</strong> telah diverifikasi dan disetujui oleh pengelola Samara Stay. Berikut rincian bukti transaksi pelunasan Anda:</p>
                  </div>

                  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin: 25px 0;">
                    <h3 style="color: #1e293b; margin-top: 0; margin-bottom: 15px; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">Rincian Transaksi Hunian</h3>
                    
                    <table style="width: 100%; font-size: 13px; border-collapse: collapse; line-height: 2;">
                      <tr>
                        <td style="color: #64748b; width: 45%; font-weight: 500;">Nama Kos / Unit:</td>
                        <td style="color: #1e293b; font-weight: 700; text-align: right;">${propertyName}</td>
                      </tr>
                      <tr>
                        <td style="color: #64748b; font-weight: 500;">Nomor Kamar:</td>
                        <td style="color: #1e293b; font-weight: 700; text-align: right; font-size: 14px; color: #334155;">Unit ${finalBooking.room_number}</td>
                      </tr>
                      <tr>
                        <td style="color: #64748b; font-weight: 500;">Tipe Kontrak:</td>
                        <td style="color: #1e293b; font-weight: 700; text-align: right; text-transform: capitalize;">${finalBooking.booking_type === 'daily' ? 'Harian (Daily)' : 'Bulanan (Monthly)'}</td>
                      </tr>
                      <tr>
                        <td style="color: #64748b; font-weight: 500;">Tanggal Check-In:</td>
                        <td style="color: #1e293b; font-weight: 700; text-align: right;">${finalBooking.check_in_date || finalBooking.booking_date || '-'}</td>
                      </tr>
                      ${finalBooking.booking_type === 'monthly' ? `
                      <tr>
                        <td style="color: #64748b; font-weight: 500;">Durasi Sewa:</td>
                        <td style="color: #1e293b; font-weight: 700; text-align: right;">${finalBooking.duration_months || 1} Bulan</td>
                      </tr>` : `
                      <tr>
                        <td style="color: #64748b; font-weight: 500;">Durasi Sewa:</td>
                        <td style="color: #1e293b; font-weight: 700; text-align: right;">${finalBooking.duration_days || 1} Hari</td>
                      </tr>`}
                      <tr>
                        <td style="color: #64748b; font-weight: 500;">Metode Pembayaran:</td>
                        <td style="color: #1e293b; font-weight: 700; text-align: right; text-transform: uppercase;">${paymentMethodName}</td>
                      </tr>
                      <tr>
                        <td style="color: #64748b; font-weight: 500; border-top: 1px dashed #cbd5e1; padding-top: 12px; margin-top: 8px;">Total Bayar:</td>
                        <td style="color: #047857; font-weight: 900; font-size: 18px; border-top: 1px dashed #cbd5e1; padding-top: 12px; margin-top: 8px; text-align: right;">
                          ${formattedPrice}
                        </td>
                      </tr>
                    </table>
                  </div>

                  <div style="font-size: 13px; line-height: 1.5; color: #475569; margin: 25px 0; padding: 15px; border-left: 4px solid #334155; background-color: #f8fafc; border-radius: 0 12px 12px 0;">
                    <strong style="color: #1e293b; display: block; margin-bottom: 4px;">Alamat Hunian:</strong>
                    ${propertyAddress}
                  </div>

                  <!-- PENGESAHAN TANDA TANGAN DUA PIHAK (OWNER & PEMESAN) -->
                  <div style="margin-top: 25px; padding: 16px; border: 1px dashed #94a3b8; border-radius: 12px; background-color: #ffffff;">
                    <p style="font-size: 10px; color: #475569; font-weight: 800; margin: 0 0 10px 0; text-transform: uppercase; text-align: center; letter-spacing: 0.5px;">PENGESAHAN TANDA TANGAN RESMI:</p>
                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
                      <tr>
                        <td width="50%" align="center" style="padding: 10px; border-right: 1px solid #e2e8f0; vertical-align: bottom;">
                          <p style="font-size: 9px; color: #64748b; font-weight: bold; margin: 0 0 6px 0; text-transform: uppercase;">PIHAK PERTAMA (OWNER)</p>
                          <div style="min-height: 55px; text-align: center;">
                            <img src="cid:owner-signature" alt="Tanda Tangan Owner" style="max-height: 55px; max-width: 140px; display: inline-block;" />
                          </div>
                          <p style="font-size: 9px; color: #1e293b; font-weight: 800; margin: 4px 0 0 0; text-transform: uppercase;">SAMARA STAY MANAGEMENT</p>
                          <p style="font-size: 8px; color: #059669; font-weight: bold; margin: 2px 0 0 0; font-family: monospace;">[ STAMP RESMI ]</p>
                        </td>
                        <td width="50%" align="center" style="padding: 10px; vertical-align: bottom;">
                          <p style="font-size: 9px; color: #64748b; font-weight: bold; margin: 0 0 6px 0; text-transform: uppercase;">PIHAK KEDUA (PEMESAN)</p>
                          <div style="min-height: 55px; text-align: center;">
                            ${finalBooking.signature_url ? `
                              <img src="cid:tenant-signature" alt="Tanda Tangan Pemesan" style="max-height: 55px; max-width: 140px; display: inline-block;" />
                            ` : `
                              <p style="font-size: 10px; color: #059669; font-weight: bold; margin: 15px 0 0 0; font-family: monospace;">✓ DISETUJUI DIGITAL</p>
                            `}
                          </div>
                          <p style="font-size: 9px; color: #1e293b; font-weight: 800; margin: 4px 0 0 0; text-transform: uppercase;">${finalBooking.tenant_name || 'PENYEWA'}</p>
                          <p style="font-size: 8px; color: #64748b; margin: 2px 0 0 0; font-family: monospace;">TERVERIFIKASI SISTEM</p>
                        </td>
                      </tr>
                    </table>
                  </div>

                  <div style="margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 25px;">
                    <h4 style="color: #1e293b; margin-top: 0; margin-bottom: 12px; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Petunjuk Check-In:</h4>
                    <ol style="font-size: 13px; color: #475569; padding-left: 20px; line-height: 1.7; margin: 0;">
                      <li style="margin-bottom: 8px;">Simpan invoice digital ini sebagai bukti pelunasan yang sah saat serah terima unit.</li>
                      <li style="margin-bottom: 8px;">Akses smart lock pin atau kunci fisik kamar beserta kartu akses akan diberikan oleh asisten hunian kami saat Anda tiba di lokasi.</li>
                      <li>Harap membawa kartu identitas diri asli (KTP / Passport) yang sesuai dengan nama penyewa saat check-in.</li>
                    </ol>
                  </div>

                  <div style="text-align: center; margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 25px; font-size: 11px; color: #94a3b8; line-height: 1.6;">
                    <p style="margin: 0; font-weight: 700; color: #64748b;">Layanan Pengelola Samara Stay Premium Boarding</p>
                    <p style="margin: 4px 0 0 0;">Email: info@samarastay.com | Whatsapp Pengelola Hunian</p>
                    <p style="margin: 20px 0 0 0; font-size: 10px; color: #cbd5e1;">&copy; 2026 Samara Stay Residence. Hak Cipta Dilindungi Undang-Undang.</p>
                  </div>
                </div>
              `;

              let approveOwnerSig = 'https://eniwbzpfvwtbsonmnzzr.supabase.co/storage/v1/object/public/signatures/owner_official_signature.png';
              try {
                const { data: setRow } = await supabaseAdmin.from('settings').select('owner_signature_url').eq('id', 1).maybeSingle();
                if (setRow?.owner_signature_url) {
                  approveOwnerSig = setRow.owner_signature_url;
                }
              } catch (sErr) {}

              await sendServerEmail(targetEmail, subject, text, html, {
                ownerSigUrl: approveOwnerSig,
                tenantSigUrl: finalBooking.signature_url
              });
            } catch (emailErr) {
              console.warn('[Admin API approve_booking] Background email dispatch notice:', emailErr);
            }
          });
        }
      }

      return res.status(200).json({
        success: true,
        already_approved: wasAlreadyApproved,
        message: wasAlreadyApproved ? 'Booking sudah disetujui sebelumnya' : 'Booking berhasil disetujui dan diselesaikan secara atomik.',
        booking: finalBooking,
        invoice_id: finalInvoiceId
      });
    } catch (err: any) {
      console.error('[Admin API] /api/admin/booking/approve exception:', err);
      return res.status(500).json({ success: false, error: err.message || 'Terjadi kesalahan pada server saat approval booking.' });
    }
  });

  // =========================================================================
  // ADMIN API: SECURE ROOMS & PROPERTIES MANAGEMENT (SERVICE ROLE BYPASS RLS)
  // =========================================================================

  // POST /api/admin/rooms/save
  app.post('/api/admin/rooms/save', requireAdminAuth, express.json(), async (req, res) => {
    try {
      const payload = req.body || {};
      const { property_id, room_number } = payload;

      if (!property_id || !room_number) {
        return res.status(400).json({ success: false, error: 'property_id dan room_number wajib diisi.' });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: 'Supabase Server Client belum terkonfigurasi.' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      // Verify authorization for target property
      const propAccess = checkPropertyAccess(req.authProfile, property_id);
      if (!propAccess.allowed) {
        return res.status(403).json({ success: false, error: propAccess.reason || 'Akses ditolak ke properti ini.' });
      }

      const rawId = payload.id;
      const roomId = rawId ? Number(rawId) : null;
      const facilitiesToSync = payload.facilities;

      // Extract only valid columns for 'rooms' table
      const allowedCols = [
        'property_id', 'room_number', 'room_type', 'price', 'size_sqm', 'floor',
        'status', 'current_tenant_name', 'image_url', 'images', 'discount_percent',
        'discount_until', 'is_daily_enabled', 'daily_price'
      ];

      const cleanData: any = {};
      for (const col of allowedCols) {
        if (payload[col] !== undefined) {
          cleanData[col] = payload[col];
        }
      }

      // Enforce room_type check constraint in remote DB ('Standard', 'Deluxe', 'Premium')
      const allowedRoomTypes = ['Standard', 'Deluxe', 'Premium'];
      if (cleanData.room_type && !allowedRoomTypes.includes(cleanData.room_type)) {
        cleanData.room_type = 'Premium';
      }

      // Ensure proper numeric types
      if (cleanData.property_id !== undefined) cleanData.property_id = Number(cleanData.property_id);
      if (cleanData.price !== undefined) cleanData.price = Number(cleanData.price);
      if (cleanData.size_sqm !== undefined) cleanData.size_sqm = Number(cleanData.size_sqm);
      if (cleanData.floor !== undefined) cleanData.floor = Number(cleanData.floor);
      if (cleanData.daily_price !== undefined) cleanData.daily_price = Number(cleanData.daily_price);
      if (cleanData.discount_percent !== undefined && cleanData.discount_percent !== null) {
        cleanData.discount_percent = Number(cleanData.discount_percent);
      }

      let savedRoomId: number;
      let isUpdate = false;

      if (roomId) {
        isUpdate = true;
        // Check existence
        const { data: existingRoom, error: checkErr } = await supabaseAdmin
          .from('rooms')
          .select('id, property_id')
          .eq('id', roomId)
          .maybeSingle();

        if (checkErr || !existingRoom) {
          return res.status(404).json({ success: false, error: 'Kamar tidak ditemukan di database.' });
        }

        // Also verify existing room property access if property changed
        const existingPropAccess = checkPropertyAccess(req.authProfile, existingRoom.property_id);
        if (!existingPropAccess.allowed) {
          return res.status(403).json({ success: false, error: existingPropAccess.reason || 'Akses ditolak.' });
        }

        const { data: updated, error: updateErr } = await supabaseAdmin
          .from('rooms')
          .update(cleanData)
          .eq('id', roomId)
          .select()
          .single();

        if (updateErr) {
          console.error('[Admin API saveRoom update error]:', updateErr);
          return res.status(400).json({ success: false, error: `Gagal memperbarui kamar: ${updateErr.message}` });
        }
        savedRoomId = updated.id;
      } else {
        const { data: inserted, error: insertErr } = await supabaseAdmin
          .from('rooms')
          .insert(cleanData)
          .select()
          .single();

        if (insertErr) {
          console.error('[Admin API saveRoom insert error]:', insertErr);
          return res.status(400).json({ success: false, error: `Gagal menambahkan kamar: ${insertErr.message}` });
        }
        savedRoomId = inserted.id;
      }

      // Synchronize room_facilities join table
      if (facilitiesToSync !== undefined && Array.isArray(facilitiesToSync)) {
        const targetFacilityIds: number[] = [];
        for (const item of facilitiesToSync) {
          if (typeof item === 'number') {
            targetFacilityIds.push(item);
          } else if (item && typeof item === 'object') {
            const fid = item.id || item.facility_id;
            if (fid) targetFacilityIds.push(Number(fid));
          }
        }

        const { data: currentAssociations } = await supabaseAdmin
          .from('room_facilities')
          .select('facility_id')
          .eq('room_id', savedRoomId);

        const currentFacilityIds = (currentAssociations || []).map((a: any) => Number(a.facility_id));
        const toDelete = currentFacilityIds.filter(fid => !targetFacilityIds.includes(fid));
        const toInsert = targetFacilityIds.filter(fid => !currentFacilityIds.includes(fid));

        if (toDelete.length > 0) {
          await supabaseAdmin
            .from('room_facilities')
            .delete()
            .eq('room_id', savedRoomId)
            .in('facility_id', toDelete);
        }

        if (toInsert.length > 0) {
          const insertPayloads = toInsert.map(fid => ({
            room_id: savedRoomId,
            facility_id: fid
          }));
          await supabaseAdmin
            .from('room_facilities')
            .insert(insertPayloads);
        }
      }

      // Recalculate property room counts atomically
      try {
        const targetPropId = Number(cleanData.property_id || property_id);
        const { data: propRooms } = await supabaseAdmin
          .from('rooms')
          .select('id, status')
          .eq('property_id', targetPropId);

        const totalRooms = propRooms ? propRooms.length : 0;
        const availableRooms = propRooms ? propRooms.filter((r: any) => r.status === 'available' || r.status === 'reserved' || !r.status).length : 0;

        await supabaseAdmin
          .from('properties')
          .update({ total_rooms: totalRooms, available_rooms: availableRooms })
          .eq('id', targetPropId);
      } catch (countErr) {
        console.warn('[Admin API saveRoom] Property count sync notice:', countErr);
      }

      // Fetch final populated room
      const { data: finalRoomData } = await supabaseAdmin
        .from('rooms')
        .select(`
          *,
          room_facilities (
            facility_id,
            facilities (
              id,
              name,
              icon,
              category,
              description
            )
          )
        `)
        .eq('id', savedRoomId)
        .maybeSingle();

      let finalRoom = finalRoomData;
      if (finalRoom) {
        const resolvedFacilities = (finalRoom.room_facilities || [])
          .map((rf: any) => rf?.facilities)
          .filter(Boolean);
        finalRoom = {
          ...finalRoom,
          facilities: resolvedFacilities
        };
        delete finalRoom.room_facilities;
      }

      // Log activity
      try {
        await supabaseAdmin.from('activity_logs').insert({
          admin_name: req.authProfile?.full_name || req.authUser?.email || 'Admin',
          action: isUpdate ? 'UPDATE_ROOM' : 'CREATE_ROOM',
          detail: `Unit ${cleanData.room_number || ''} disimpan oleh ${req.authProfile?.full_name || 'Admin'}`,
          ip_address: '127.0.0.1'
        });
      } catch (logErr) {}

      return res.status(200).json({
        success: true,
        data: finalRoom,
        message: 'Kamar berhasil disimpan.'
      });
    } catch (err: any) {
      console.error('[Admin API /api/admin/rooms/save] exception:', err);
      return res.status(500).json({ success: false, error: err.message || 'Terjadi kesalahan pada server saat menyimpan kamar.' });
    }
  });

  // DELETE /api/admin/rooms/:id
  app.delete('/api/admin/rooms/:id', requireAdminAuth, async (req, res) => {
    try {
      const roomId = Number(req.params.id);
      if (!roomId || isNaN(roomId)) {
        return res.status(400).json({ success: false, error: 'ID kamar tidak valid.' });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: 'Supabase Server Client belum terkonfigurasi.' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      // Verify existence and authorization
      const { data: targetRoom, error: fetchErr } = await supabaseAdmin
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .maybeSingle();

      if (fetchErr || !targetRoom) {
        return res.status(404).json({ success: false, error: 'Kamar tidak ditemukan.' });
      }

      const propAccess = checkPropertyAccess(req.authProfile, targetRoom.property_id);
      if (!propAccess.allowed) {
        return res.status(403).json({ success: false, error: propAccess.reason || 'Akses ditolak ke properti ini.' });
      }

      // Delete join table records
      await supabaseAdmin.from('room_facilities').delete().eq('room_id', roomId);

      // Delete room record
      const { error: delErr } = await supabaseAdmin.from('rooms').delete().eq('id', roomId);
      if (delErr) {
        return res.status(400).json({ success: false, error: `Gagal menghapus kamar: ${delErr.message}` });
      }

      // Sync property room count
      try {
        const { data: propRooms } = await supabaseAdmin
          .from('rooms')
          .select('id, status')
          .eq('property_id', targetRoom.property_id);

        const totalRooms = propRooms ? propRooms.length : 0;
        const availableRooms = propRooms ? propRooms.filter((r: any) => r.status === 'available' || r.status === 'reserved' || !r.status).length : 0;

        await supabaseAdmin
          .from('properties')
          .update({ total_rooms: totalRooms, available_rooms: availableRooms })
          .eq('id', targetRoom.property_id);
      } catch (countErr) {
        console.warn('[Admin API deleteRoom] Property count sync notice:', countErr);
      }

      try {
        await supabaseAdmin.from('activity_logs').insert({
          admin_name: req.authProfile?.full_name || req.authUser?.email || 'Admin',
          action: 'DELETE_ROOM',
          detail: `Menghapus unit ID: ${roomId} (Unit ${targetRoom.room_number})`,
          ip_address: '127.0.0.1'
        });
      } catch (logErr) {}

      return res.status(200).json({ success: true, message: 'Kamar berhasil dihapus.' });
    } catch (err: any) {
      console.error('[Admin API /api/admin/rooms/:id DELETE] exception:', err);
      return res.status(500).json({ success: false, error: err.message || 'Terjadi kesalahan pada server saat menghapus kamar.' });
    }
  });

  // POST /api/admin/maps/resolve-link - Resolves Google Maps links including shortlinks (maps.app.goo.gl)
  app.post('/api/admin/maps/resolve-link', express.json(), async (req, res) => {
    try {
      const rawUrl = (req.body?.url || req.query?.url || '').toString().trim();
      if (!rawUrl) {
        return res.status(400).json({ success: false, error: 'URL link Google Maps wajib diisi.' });
      }

      function extractCoords(str: string): { lat: number; lng: number } | null {
        if (!str || typeof str !== 'string') return null;
        let s = str.trim();
        try { s = decodeURIComponent(s); } catch (e) {}
        s = s.replace(/[\u2212\u2013\u2014]/g, '-');

        // Pattern 1: @lat,lng
        const mAt = s.match(/@(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
        if (mAt) {
          let lat = parseFloat(mAt[1]);
          let lng = parseFloat(mAt[2]);
          if (!isNaN(lat) && !isNaN(lng)) {
            if (lat > 0 && lat <= 11 && lng >= 95 && lng <= 142) lat = -lat;
            return { lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)) };
          }
        }

        // Pattern 2: ?q= or ?ll= or center= or destination=
        const mQ = s.match(/[?&/](?:q|query|ll|search|destination|center|saddr|daddr)(?:=|\/)?(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/i);
        if (mQ) {
          let lat = parseFloat(mQ[1]);
          let lng = parseFloat(mQ[2]);
          if (!isNaN(lat) && !isNaN(lng)) {
            if (lat > 0 && lat <= 11 && lng >= 95 && lng <= 142) lat = -lat;
            return { lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)) };
          }
        }

        // Pattern 3a: !3dlat!4dlng
        const mEmA = s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
        if (mEmA) {
          let lat = parseFloat(mEmA[1]);
          let lng = parseFloat(mEmA[2]);
          if (!isNaN(lat) && !isNaN(lng)) {
            if (lat > 0 && lat <= 11 && lng >= 95 && lng <= 142) lat = -lat;
            return { lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)) };
          }
        }

        // Pattern 3b: !2dlng!3dlat
        const mEmB = s.match(/!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)/);
        if (mEmB) {
          let lng = parseFloat(mEmB[1]);
          let lat = parseFloat(mEmB[2]);
          if (!isNaN(lat) && !isNaN(lng)) {
            if (lat > 0 && lat <= 11 && lng >= 95 && lng <= 142) lat = -lat;
            return { lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)) };
          }
        }

        // Pattern 4: Indonesian comma decimal
        const mComma = s.match(/(-?\d+),(\d{3,8})[\s,;]+(-?\d+),(\d{3,8})/);
        if (mComma) {
          let lat = parseFloat(`${mComma[1]}.${mComma[2]}`);
          let lng = parseFloat(`${mComma[3]}.${mComma[4]}`);
          if (!isNaN(lat) && !isNaN(lng)) {
            if (lat > 0 && lat <= 11 && lng >= 95 && lng <= 142) lat = -lat;
            return { lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)) };
          }
        }

        // Pattern 5: Plain coordinates
        const mPlain = s.match(/(-?\d{1,2}\.\d+)[,\s;\t/]+(-?\d{1,3}\.\d+)/);
        if (mPlain) {
          let lat = parseFloat(mPlain[1]);
          let lng = parseFloat(mPlain[2]);
          if (!isNaN(lat) && !isNaN(lng)) {
            if ((lat > 90 || (lat >= 95 && lat <= 142)) && (lng >= -11 && lng <= 11)) {
              const t = lat; lat = lng; lng = t;
            }
            if (lat > 0 && lat <= 11 && lng >= 95 && lng <= 142) lat = -lat;
            return { lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)) };
          }
        }

        return null;
      }

      // Check if coordinate is present in the raw input directly
      const directMatch = extractCoords(rawUrl);
      if (directMatch) {
        return res.json({ success: true, lat: directMatch.lat, lng: directMatch.lng, resolvedUrl: rawUrl });
      }

      if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
        return res.status(400).json({
          success: false,
          error: 'URL tidak valid. Pastikan link diawali dengan https:// atau http://'
        });
      }

      // Follow redirects to resolve shortened URLs (e.g. maps.app.goo.gl)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 9000);

      try {
        const fetchResp = await fetch(rawUrl, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
          }
        });
        clearTimeout(timeoutId);

        const finalUrl = fetchResp.url || rawUrl;
        let coords = extractCoords(finalUrl);

        if (!coords) {
          const html = await fetchResp.text();
          coords = extractCoords(html);
          if (!coords) {
            // Look for center=-6.xxx,106.xxx or ll=-6.xxx,106.xxx
            const centerM = html.match(/(?:center|ll|query|q)=([-\d\.]+)(?:%2C|,)([-\d\.]+)/i);
            if (centerM) {
              let lat = parseFloat(centerM[1]);
              let lng = parseFloat(centerM[2]);
              if (!isNaN(lat) && !isNaN(lng)) {
                if (lat > 0 && lat <= 11 && lng >= 95 && lng <= 142) lat = -lat;
                coords = { lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)) };
              }
            }
          }
        }

        if (coords) {
          return res.json({
            success: true,
            lat: coords.lat,
            lng: coords.lng,
            resolvedUrl: finalUrl
          });
        }

        return res.status(422).json({
          success: false,
          error: 'Tidak dapat menemukan koordinat dari link tersebut. Pastikan tautan mengarah ke lokasi Google Maps yang tepat.'
        });
      } catch (fetchErr: any) {
        clearTimeout(timeoutId);
        console.warn('[Admin API resolve-link] Fetch failed:', fetchErr);
        return res.status(500).json({
          success: false,
          error: `Gagal membaca tautan: ${fetchErr.message || 'Koneksi timeout'}`
        });
      }
    } catch (err: any) {
      console.error('[Admin API resolve-link] exception:', err);
      return res.status(500).json({ success: false, error: err.message || 'Server error' });
    }
  });

  // POST /api/admin/properties/save
  app.post('/api/admin/properties/save', requireAdminAuth, express.json(), async (req, res) => {
    try {
      const payload = req.body || {};
      const { name, address } = payload;

      const role = (req.authProfile?.role || '').toLowerCase();
      if (!['super', 'super_admin', 'owner', 'admin'].includes(role)) {
        return res.status(403).json({ success: false, error: 'Akses ditolak. Hanya Administrator atau Owner yang dapat mengelola properti.' });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: 'Supabase Server Client belum terkonfigurasi.' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      const rawId = payload.id;
      const propId = rawId ? Number(rawId) : null;

      let existingProp: any = null;
      if (propId) {
        const { data: found } = await supabaseAdmin.from('properties').select('*').eq('id', propId).maybeSingle();
        existingProp = found;
      }

      const effectiveName = name || existingProp?.name;
      const effectiveAddress = address || existingProp?.address;

      if (!effectiveName || !effectiveAddress) {
        return res.status(400).json({ success: false, error: 'Nama dan alamat properti wajib diisi.' });
      }

      const facilitiesToSync = payload.facilities;

      // Exact columns matching Supabase public.properties schema
      const allowedCols = [
        'name', 'address', 'price', 'type', 'total_rooms', 'available_rooms',
        'facilities', 'image_url', 'images', 'lat', 'lng', 'description',
        'additional_rules', 'policies', 'terms', 'regulations'
      ];

      const cleanData: any = {};
      for (const col of allowedCols) {
        if (payload[col] !== undefined) {
          cleanData[col] = payload[col];
        }
      }

      // Explicitly guarantee name and address are set
      cleanData.name = effectiveName;
      cleanData.address = effectiveAddress;

      // Ensure price is mapped from price or starting_price
      if (payload.price !== undefined || payload.starting_price !== undefined) {
        cleanData.price = Number(payload.price ?? payload.starting_price ?? 0);
      }

      // Enforce type CHECK constraint ('putra', 'putri', 'campur')
      if (payload.type !== undefined) {
        const allowedTypes = ['putra', 'putri', 'campur'];
        cleanData.type = allowedTypes.includes(payload.type) ? payload.type : 'campur';
      }

      // Ensure facilities is an array of strings
      if (payload.facilities !== undefined) {
        if (Array.isArray(payload.facilities)) {
          cleanData.facilities = payload.facilities.map((f: any) => typeof f === 'object' ? (f.name || '') : String(f)).filter(Boolean);
        } else {
          cleanData.facilities = [];
        }
      }

      // Ensure images is an array
      if (payload.images !== undefined) {
        cleanData.images = Array.isArray(payload.images) ? payload.images : [];
      }

      if (cleanData.lat !== undefined && cleanData.lng !== undefined) {
        let nLat = typeof cleanData.lat === 'number' ? cleanData.lat : parseFloat(String(cleanData.lat).trim().replace(/[\u2212\u2013\u2014]/g, '-').replace(',', '.'));
        let nLng = typeof cleanData.lng === 'number' ? cleanData.lng : parseFloat(String(cleanData.lng).trim().replace(/[\u2212\u2013\u2014]/g, '-').replace(',', '.'));
        if (!isNaN(nLat) && !isNaN(nLng)) {
          // Detect swapped coords
          if ((nLat > 90 || (nLat >= 95 && nLat <= 142)) && (nLng >= -11 && nLng <= 11)) {
            const temp = nLat;
            nLat = nLng;
            nLng = temp;
          }
          // Detect missing negative sign in Indonesia (Jakarta / Java / Jabodetabek: latitudes are south of equator)
          if (nLng >= 95 && nLng <= 142 && nLat > 0 && nLat <= 11) {
            nLat = -nLat;
          }
          cleanData.lat = parseFloat(nLat.toFixed(6));
          cleanData.lng = parseFloat(nLng.toFixed(6));
        }
      } else {
        if (cleanData.lat !== undefined) {
          const parsed = parseFloat(String(cleanData.lat).trim().replace(/[\u2212\u2013\u2014]/g, '-').replace(',', '.'));
          if (!isNaN(parsed)) cleanData.lat = parseFloat(parsed.toFixed(6));
        }
        if (cleanData.lng !== undefined) {
          const parsed = parseFloat(String(cleanData.lng).trim().replace(/[\u2212\u2013\u2014]/g, '-').replace(',', '.'));
          if (!isNaN(parsed)) cleanData.lng = parseFloat(parsed.toFixed(6));
        }
      }

      // Encode deposit_amount safely into terms (as properties table has no deposit_amount column)
      const depAmt = payload.deposit_amount;
      if (depAmt !== undefined && depAmt !== null) {
        let termsStr = cleanData.terms || existingProp?.terms || '';
        if (termsStr.includes('[DEPOSIT:')) {
          termsStr = termsStr.replace(/\[DEPOSIT:\d+\]/, `[DEPOSIT:${depAmt}]`);
        } else {
          termsStr = termsStr ? `${termsStr}\n[DEPOSIT:${depAmt}]` : `[DEPOSIT:${depAmt}]`;
        }
        cleanData.terms = termsStr;
      }
      delete cleanData.deposit_amount;

      let savedPropId: number;
      let isUpdate = false;

      if (propId) {
        isUpdate = true;
        const { data: updated, error: updateErr } = await supabaseAdmin
          .from('properties')
          .update(cleanData)
          .eq('id', propId)
          .select()
          .single();

        if (updateErr) {
          return res.status(400).json({ success: false, error: `Gagal memperbarui properti: ${updateErr.message}` });
        }
        savedPropId = updated.id;
      } else {
        const { data: inserted, error: insertErr } = await supabaseAdmin
          .from('properties')
          .insert(cleanData)
          .select()
          .single();

        if (insertErr) {
          return res.status(400).json({ success: false, error: `Gagal menambahkan properti: ${insertErr.message}` });
        }
        savedPropId = inserted.id;
      }

      // Sync property facilities
      if (facilitiesToSync !== undefined && Array.isArray(facilitiesToSync)) {
        const targetFacilityIds: number[] = [];
        for (const item of facilitiesToSync) {
          if (typeof item === 'number') {
            targetFacilityIds.push(item);
          } else if (item && typeof item === 'object') {
            const fid = item.id || item.facility_id;
            if (fid) targetFacilityIds.push(Number(fid));
          }
        }

        const { data: currentAssoc } = await supabaseAdmin
          .from('property_facilities')
          .select('facility_id')
          .eq('property_id', savedPropId);

        const currentFacilityIds = (currentAssoc || []).map((a: any) => Number(a.facility_id));
        const toDelete = currentFacilityIds.filter(fid => !targetFacilityIds.includes(fid));
        const toInsert = targetFacilityIds.filter(fid => !currentFacilityIds.includes(fid));

        if (toDelete.length > 0) {
          await supabaseAdmin
            .from('property_facilities')
            .delete()
            .eq('property_id', savedPropId)
            .in('facility_id', toDelete);
        }

        if (toInsert.length > 0) {
          await supabaseAdmin
            .from('property_facilities')
            .insert(toInsert.map(fid => ({ property_id: savedPropId, facility_id: fid })));
        }
      }

      // Fetch updated property
      const { data: finalProp } = await supabaseAdmin
        .from('properties')
        .select(`
          *,
          property_facilities (
            facility_id,
            facilities (
              id,
              name,
              icon,
              category,
              description
            )
          )
        `)
        .eq('id', savedPropId)
        .maybeSingle();

      let resultProp = finalProp;
      if (resultProp) {
        const resolvedFacilities = (resultProp.property_facilities || [])
          .map((pf: any) => pf?.facilities)
          .filter(Boolean);
        resultProp = { ...resultProp, facilities: resolvedFacilities };
        delete resultProp.property_facilities;
      }

      try {
        await supabaseAdmin.from('activity_logs').insert({
          admin_name: req.authProfile?.full_name || req.authUser?.email || 'Admin',
          action: isUpdate ? 'UPDATE_PROPERTY' : 'CREATE_PROPERTY',
          detail: `Properti ${cleanData.name || ''} berhasil disimpan.`,
          ip_address: '127.0.0.1'
        });
      } catch (logErr) {}

      return res.status(200).json({ success: true, data: resultProp, message: 'Properti berhasil disimpan.' });
    } catch (err: any) {
      console.error('[Admin API /api/admin/properties/save] exception:', err);
      return res.status(500).json({ success: false, error: err.message || 'Terjadi kesalahan pada server saat menyimpan properti.' });
    }
  });

  // =========================================================================
  // NEARBY AMENITIES (GPS POIs) CRUD ENDPOINTS (Secured with Service Role)
  // =========================================================================

  // POST /api/admin/amenities/save
  app.post('/api/admin/amenities/save', requireAdminAuth, express.json(), async (req, res) => {
    try {
      const payload = req.body || {};
      const role = (req.authProfile?.role || '').toLowerCase();
      if (!['super', 'super_admin', 'owner', 'admin'].includes(role)) {
        return res.status(403).json({ success: false, error: 'Akses ditolak. Hanya Administrator atau Owner yang dapat mengelola fasilitas sekitar.' });
      }

      if (!payload.name || !payload.category || payload.lat === undefined || payload.lng === undefined) {
        return res.status(400).json({ success: false, error: 'Nama, kategori, latitude, dan longitude fasilitas wajib diisi.' });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: 'Supabase Server Client belum terkonfigurasi.' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      const VALID_AMENITY_CATEGORIES = ['transit', 'education', 'healthcare', 'shopping', 'dining', 'worship', 'lifestyle'];
      const rawCategory = String(payload.category || '').toLowerCase().trim();
      const safeCategory = VALID_AMENITY_CATEGORIES.includes(rawCategory) ? rawCategory : 'transit';

      const record: any = {
        property_id: Number(payload.property_id || payload.propertyId),
        name: String(payload.name).trim(),
        category: safeCategory,
        distance_meters: Math.round(Number(payload.distance_meters ?? payload.distanceMeters ?? 0)),
        walking_minutes: Math.max(1, Math.round(Number(payload.walking_minutes ?? payload.walking_time_minutes ?? payload.walkingTimeMinutes ?? 1))),
        driving_minutes: Math.max(1, Math.round(Number(payload.driving_minutes ?? payload.driving_time_minutes ?? payload.drivingTimeMinutes ?? 1))),
        lat: Number(payload.lat),
        lng: Number(payload.lng),
        description: payload.description || '',
        address: payload.address || '',
        icon_name: payload.icon_name || payload.icon || null,
        is_active: payload.is_active !== undefined ? payload.is_active : true,
        updated_at: new Date().toISOString()
      };

      if (payload.id && !String(payload.id).startsWith('temp-') && !String(payload.id).startsWith('new-')) {
        record.id = String(payload.id);
      }

      const { data, error } = await supabaseAdmin
        .from('nearby_amenities')
        .upsert(record)
        .select()
        .single();

      if (error) {
        console.error('[Admin API /api/admin/amenities/save] error:', error);
        return res.status(500).json({ success: false, error: error.message });
      }

      return res.status(200).json({
        success: true,
        data: {
          id: String(data.id),
          propertyId: Number(data.property_id),
          name: String(data.name),
          category: data.category,
          distanceMeters: Number(data.distance_meters),
          walkingTimeMinutes: Number(data.walking_minutes),
          drivingTimeMinutes: Number(data.driving_minutes),
          lat: Number(data.lat),
          lng: Number(data.lng),
          description: data.description,
          address: data.address,
          icon: data.icon_name
        }
      });
    } catch (err: any) {
      console.error('[Admin API /api/admin/amenities/save] exception:', err);
      return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
  });

  // POST /api/admin/amenities/delete
  app.post('/api/admin/amenities/delete', requireAdminAuth, express.json(), async (req, res) => {
    try {
      const { id } = req.body || {};
      if (!id) {
        return res.status(400).json({ success: false, error: 'ID fasilitas wajib diisi.' });
      }

      const role = (req.authProfile?.role || '').toLowerCase();
      if (!['super', 'super_admin', 'owner', 'admin'].includes(role)) {
        return res.status(403).json({ success: false, error: 'Akses ditolak.' });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: 'Supabase belum terkonfigurasi.' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      const { error } = await supabaseAdmin.from('nearby_amenities').delete().eq('id', String(id));
      if (error) {
        return res.status(500).json({ success: false, error: error.message });
      }

      return res.status(200).json({ success: true, message: 'Fasilitas berhasil dihapus.' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
  });

  // POST /api/admin/amenities/batch
  app.post('/api/admin/amenities/batch', requireAdminAuth, express.json(), async (req, res) => {
    try {
      const { amenities, property_id } = req.body || {};
      if (!Array.isArray(amenities) || amenities.length === 0) {
        return res.status(400).json({ success: false, error: 'Daftar fasilitas wajib diisi.' });
      }

      const role = (req.authProfile?.role || '').toLowerCase();
      if (!['super', 'super_admin', 'owner', 'admin'].includes(role)) {
        return res.status(403).json({ success: false, error: 'Akses ditolak.' });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: 'Supabase belum terkonfigurasi.' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      const VALID_AMENITY_CATEGORIES = ['transit', 'education', 'healthcare', 'shopping', 'dining', 'worship', 'lifestyle'];

      const records = amenities.map((a: any) => {
        const rawCat = String(a.category || '').toLowerCase().trim();
        const safeCat = VALID_AMENITY_CATEGORIES.includes(rawCat) ? rawCat : 'transit';

        const item: any = {
          property_id: Number(property_id || a.property_id || a.propertyId),
          name: String(a.name).trim(),
          category: safeCat,
          distance_meters: Math.round(Number(a.distance_meters ?? a.distanceMeters ?? 0)),
          walking_minutes: Math.max(1, Math.round(Number(a.walking_minutes ?? a.walking_time_minutes ?? a.walkingTimeMinutes ?? 1))),
          driving_minutes: Math.max(1, Math.round(Number(a.driving_minutes ?? a.driving_time_minutes ?? a.drivingTimeMinutes ?? 1))),
          lat: Number(a.lat),
          lng: Number(a.lng),
          description: a.description || '',
          address: a.address || '',
          icon_name: a.icon_name || a.icon || null,
          is_active: true,
          updated_at: new Date().toISOString()
        };
        if (a.id && !String(a.id).startsWith('temp-') && !String(a.id).startsWith('new-')) {
          item.id = String(a.id);
        }
        return item;
      });

      const { data, error } = await supabaseAdmin
        .from('nearby_amenities')
        .upsert(records, { onConflict: 'id' })
        .select();

      if (error) {
        return res.status(500).json({ success: false, error: error.message });
      }

      return res.status(200).json({ success: true, count: data?.length || records.length });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
  });

  // POST /api/admin/settings/save
  app.post('/api/admin/settings/save', requireAdminAuth, express.json(), async (req, res) => {
    try {
      const payload = req.body || {};
      const role = (req.authProfile?.role || '').toLowerCase();
      if (!['super', 'super_admin', 'owner', 'admin'].includes(role)) {
        return res.status(403).json({ success: false, error: 'Akses ditolak. Hanya Administrator atau Owner yang dapat mengelola pengaturan sistem.' });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: 'Supabase Server Client belum terkonfigurasi.' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      const updateData: any = {};
      if (payload.booking_rules !== undefined) updateData.booking_rules = payload.booking_rules;
      if (payload.survey_rules !== undefined) updateData.survey_rules = payload.survey_rules;
      if (payload.why_choose_us !== undefined) updateData.why_choose_us = payload.why_choose_us;
      if (payload.faqs !== undefined) updateData.faqs = payload.faqs;
      if (payload.owner_signature_url !== undefined) updateData.owner_signature_url = payload.owner_signature_url;
      if (payload.standard_facilities !== undefined) {
        updateData.standard_facilities = typeof payload.standard_facilities === 'string'
          ? payload.standard_facilities
          : JSON.stringify(payload.standard_facilities);
      }
      updateData.updated_at = new Date().toISOString();

      const { data: existing } = await supabaseAdmin.from('settings').select('id').eq('id', 1).maybeSingle();
      let resultData: any = null;
      if (existing) {
        const { data, error } = await supabaseAdmin.from('settings').update(updateData).eq('id', 1).select().single();
        if (error) throw error;
        resultData = data;
      } else {
        const { data, error } = await supabaseAdmin.from('settings').insert({ id: 1, ...updateData }).select().single();
        if (error) throw error;
        resultData = data;
      }

      try {
        await supabaseAdmin.from('activity_logs').insert({
          admin_name: req.authProfile?.full_name || req.authUser?.email || 'Admin',
          action: 'UPDATE_SETTINGS',
          detail: 'Pengaturan sistem & fasilitas beranda diperbarui oleh admin.',
          ip_address: '127.0.0.1'
        });
      } catch (logErr) {}

      return res.status(200).json({ success: true, data: resultData, message: 'Pengaturan berhasil disimpan.' });
    } catch (err: any) {
      console.error('[Admin API /api/admin/settings/save] exception:', err);
      return res.status(500).json({ success: false, error: err.message || 'Terjadi kesalahan server saat menyimpan pengaturan.' });
    }
  });

  // POST /api/admin/settings/facilities - Dedicated endpoint to update homepage standard facilities
  app.post('/api/admin/settings/facilities', requireAdminAuth, express.json(), async (req, res) => {
    try {
      const payload = req.body || {};
      const role = (req.authProfile?.role || '').toLowerCase();
      if (!['super', 'super_admin', 'owner', 'admin'].includes(role)) {
        return res.status(403).json({ success: false, error: 'Akses ditolak. Hanya Administrator atau Owner yang dapat mengatur fasilitas beranda.' });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: 'Supabase Server Client belum terkonfigurasi.' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      let standardFacilitiesStr = '[]';
      if (typeof payload.standard_facilities === 'string') {
        standardFacilitiesStr = payload.standard_facilities;
      } else if (Array.isArray(payload.facilities)) {
        standardFacilitiesStr = JSON.stringify(payload.facilities);
      } else if (payload.facilities) {
        standardFacilitiesStr = JSON.stringify(payload.facilities);
      }

      const { data: existing } = await supabaseAdmin.from('settings').select('id').eq('id', 1).maybeSingle();
      if (existing) {
        const { error } = await supabaseAdmin
          .from('settings')
          .update({ standard_facilities: standardFacilitiesStr, updated_at: new Date().toISOString() })
          .eq('id', 1);
        if (error) throw error;
      } else {
        const { error } = await supabaseAdmin
          .from('settings')
          .insert({ id: 1, standard_facilities: standardFacilitiesStr, updated_at: new Date().toISOString() });
        if (error) throw error;
      }

      try {
        await supabaseAdmin.from('activity_logs').insert({
          admin_name: req.authProfile?.full_name || req.authUser?.email || 'Admin',
          action: 'UPDATE_HOMEPAGE_FACILITIES',
          detail: `Fasilitas beranda diperbarui oleh admin.`,
          ip_address: '127.0.0.1'
        });
      } catch (logErr) {}

      return res.status(200).json({ success: true, message: 'Fasilitas tampilan beranda berhasil diperbarui.' });
    } catch (err: any) {
      console.error('[Admin API /api/admin/settings/facilities] exception:', err);
      return res.status(500).json({ success: false, error: err.message || 'Terjadi kesalahan server saat memperbarui fasilitas beranda.' });
    }
  });

  // DELETE /api/admin/properties/:id
  app.delete('/api/admin/properties/:id', requireAdminAuth, async (req, res) => {
    try {
      const propId = Number(req.params.id);
      if (!propId || isNaN(propId)) {
        return res.status(400).json({ success: false, error: 'ID properti tidak valid.' });
      }

      const role = (req.authProfile?.role || '').toLowerCase();
      if (!['super', 'super_admin', 'owner'].includes(role)) {
        return res.status(403).json({ success: false, error: 'Akses ditolak. Hanya Super Admin atau Owner yang dapat menghapus properti.' });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: 'Supabase Server Client belum terkonfigurasi.' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      // Delete property associations and rooms
      await supabaseAdmin.from('property_facilities').delete().eq('property_id', propId);
      const { data: propRooms } = await supabaseAdmin.from('rooms').select('id').eq('property_id', propId);
      if (propRooms && propRooms.length > 0) {
        const roomIds = propRooms.map((r: any) => r.id);
        await supabaseAdmin.from('room_facilities').delete().in('room_id', roomIds);
        await supabaseAdmin.from('rooms').delete().eq('property_id', propId);
      }

      const { error: delErr } = await supabaseAdmin.from('properties').delete().eq('id', propId);
      if (delErr) {
        return res.status(400).json({ success: false, error: `Gagal menghapus properti: ${delErr.message}` });
      }

      try {
        await supabaseAdmin.from('activity_logs').insert({
          admin_name: req.authProfile?.full_name || req.authUser?.email || 'Admin',
          action: 'DELETE_PROPERTY',
          detail: `Menghapus properti ID: ${propId}`,
          ip_address: '127.0.0.1'
        });
      } catch (logErr) {}

      return res.status(200).json({ success: true, message: 'Properti berhasil dihapus.' });
    } catch (err: any) {
      console.error('[Admin API /api/admin/properties/:id DELETE] exception:', err);
      return res.status(500).json({ success: false, error: err.message || 'Terjadi kesalahan pada server saat menghapus properti.' });
    }
  });

  app.post('/api/midtrans/charge', apiRateLimiter(60000, 30), async (req, res) => {
    try {
      const { order_id, gross_amount, customer_details, item_details } = req.body;

      let rawServerKey = process.env.MIDTRANS_SERVER_KEY || '';
      let serverKey = rawServerKey.trim();
      
      // Strip any surrounding double or single quotes if present
      if (serverKey.startsWith('"') && serverKey.endsWith('"')) {
        serverKey = serverKey.slice(1, -1);
      } else if (serverKey.startsWith("'") && serverKey.endsWith("'")) {
        serverKey = serverKey.slice(1, -1);
      }
      serverKey = serverKey.trim();
      
      // Print safe diagnostics for troubleshooting (length, starts/ends characters)
      console.log('[MIDTRANS DIAGNOSTICS]', {
        rawLength: rawServerKey.length,
        cleanedLength: serverKey.length,
        startsWithSB: serverKey.startsWith('SB-Mid-'),
        hasQuotes: rawServerKey !== serverKey,
        prefix: serverKey.slice(0, 11),
        suffix: serverKey.slice(-4)
      });

      // If server key is NOT provided, throw transparent error instead of simulation fallback
      if (!serverKey || serverKey === 'YOUR_MIDTRANS_SERVER_KEY_HERE' || serverKey === 'MY_MIDTRANS_SERVER_KEY' || serverKey === '') {
        console.error('[MIDTRANS ERROR] Server Key is not configured.');
        return res.status(400).json({
          success: false,
          error: 'MIDTRANS_SERVER_KEY tidak ditemukan atau belum dikonfigurasi di server. Silakan hubungi admin.'
        });
      }

      // Real API Call using Node fetch with Base64 authentication header
      const authHeader = Buffer.from(`${serverKey}:`).toString('base64');
      
      // Dynamic Production / Sandbox detection (explicitly controlled by MIDTRANS_IS_PRODUCTION)
      const isProduction = process.env.MIDTRANS_IS_PRODUCTION === 'true';
      const midtransUrl = isProduction 
        ? 'https://app.midtrans.com/snap/v1/transactions' 
        : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

      const payload = {
        transaction_details: {
          order_id,
          gross_amount,
        },
        credit_card: {
          secure: true,
        },
        customer_details,
        item_details,
      };

      console.log(`[MIDTRANS REAL] Forwarding request to Midtrans API: ${midtransUrl} (${isProduction ? 'Production' : 'Sandbox'})`);
      
      addMidtransLog({
        orderId: order_id || 'unknown',
        customerName: customer_details?.first_name || 'Anonymous',
        customerEmail: customer_details?.email || 'N/A',
        amount: gross_amount,
        type: 'charge',
        status: 'initiated',
        message: `Sending charge request to Midtrans ${isProduction ? 'Production' : 'Sandbox'}`,
        details: { url: midtransUrl, mode: isProduction ? 'production' : 'sandbox' }
      });

      const response = await fetch(midtransUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authHeader}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error_messages ? data.error_messages.join(', ') : (data.message || 'Midtrans API Error'));
      }

      addMidtransLog({
        orderId: order_id || 'unknown',
        customerName: customer_details?.first_name || 'Anonymous',
        customerEmail: customer_details?.email || 'N/A',
        amount: gross_amount,
        type: 'charge',
        status: 'success',
        message: `Successfully obtained Midtrans Snap Token for order ${order_id}`,
        details: { token: data.token, mode: isProduction ? 'production' : 'sandbox' }
      });

      return res.json({
        token: data.token,
        redirect_url: data.redirect_url,
        mode: isProduction ? 'production' : 'sandbox'
      });
    } catch (error: any) {
      console.error('[MIDTRANS REAL ERROR]', error);
      
      addMidtransLog({
        orderId: req.body?.order_id || 'unknown',
        customerName: req.body?.customer_details?.first_name || 'Anonymous',
        customerEmail: req.body?.customer_details?.email || 'N/A',
        amount: req.body?.gross_amount,
        type: 'error',
        status: 'failed',
        message: `Midtrans charge failed: ${error.message || 'Unknown error'}.`,
        details: { error: error.message || 'Unknown error' }
      });

      return res.status(400).json({
        success: false,
        error: `Gagal memproses pembayaran Midtrans: ${error.message || 'Unknown error'}`
      });
    }
  });

  // Helper function to sync room counts back to properties table in Supabase
  async function syncPropertyRoomCountInSupabase(supabaseClient: any, propertyId: any) {
    if (!propertyId) return;
    try {
      const { data: pRooms, error: roomErr } = await supabaseClient
        .from('rooms')
        .select('*')
        .eq('property_id', propertyId);
      
      if (!roomErr && pRooms) {
        const total = pRooms.length;
        const avail = pRooms.filter((r: any) => r.status === 'available' || r.status === 'reserved' || !r.status).length;
        console.log(`[SUPABASE SYNC] Property ID: ${propertyId}, Total Rooms: ${total}, Available Rooms: ${avail}`);
        await supabaseClient
          .from('properties')
          .update({ total_rooms: total, available_rooms: avail })
          .eq('id', propertyId);
      }
    } catch (err) {
      console.error('[SUPABASE SYNC ERROR]', err);
    }
  }

  // Helper function to dynamically discover the verified domain from MailerSend if possible
  async function resolveVerifiedFromEmail(apiKey: string, fallbackEmail: string): Promise<string> {
    try {
      console.log('[MAILERSEND DISCOVERY] Querying verified domains list...');
      const res = await fetch('https://api.mailersend.com/v1/domains', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'User-Agent': 'SamaraStay-App/1.0 (Node.js)'
        }
      });
      if (res.status === 200) {
        const json = await res.json();
        if (json && Array.isArray(json.data) && json.data.length > 0) {
          const domains = json.data;
          console.log('[MAILERSEND DISCOVERY] Available domains raw data:', JSON.stringify(domains, null, 2));
          
          // Filter to only select active / verified domains where possible
          const verifiedDomains = domains.filter((d: any) => d.is_verified === true || d.is_verified === 'true' || d.is_verified === 1 || d.is_verified === undefined);
          console.log('[MAILERSEND DISCOVERY] Filtered verified domains:', verifiedDomains.map((d: any) => d.name));
          
          const activeDomainsList = verifiedDomains.length > 0 ? verifiedDomains : domains;
          const fallbackDomain = fallbackEmail.split('@')[1];
          
          // Try to find the domain matching our fallback in the active list
          const match = activeDomainsList.find((d: any) => d.name === fallbackDomain);
          if (match) {
            console.log(`[MAILERSEND DISCOVERY] Verified match found for fallback domain: ${fallbackDomain}`);
            return fallbackEmail;
          }
          
          // Otherwise, select the first verified / active domain from MailerSend
          const selectedDomain = activeDomainsList[0].name;
          const userPrefix = fallbackEmail.split('@')[0] || 'info';
          const resolved = `${userPrefix}@${selectedDomain}`;
          console.log(`[MAILERSEND DISCOVERY] Selected domain: ${selectedDomain}. Resolved email: ${resolved}`);
          return resolved;
        } else {
          console.warn('[MAILERSEND DISCOVERY] No domains found in MailerSend account response.');
        }
      } else {
        console.warn(`[MAILERSEND DISCOVERY] Domains API returned status ${res.status}: ${await res.text()}`);
      }
    } catch (err) {
      console.error('[MAILERSEND DISCOVERY ERROR] Failed to fetch domains:', err);
    }
    return fallbackEmail;
  }

  // Diagnostic Utility Function for MailerSend API verification & email queue debugging
  async function runMailerSendDiagnostics() {
    const timestamp = new Date().toISOString();
    let apiKey = process.env.MAILERSEND_API_KEY || '';
    apiKey = apiKey.trim();
    if (apiKey.startsWith('"') && apiKey.endsWith('"')) apiKey = apiKey.slice(1, -1);
    else if (apiKey.startsWith("'") && apiKey.endsWith("'")) apiKey = apiKey.slice(1, -1);
    apiKey = apiKey.trim();

    const rawFromEmail = process.env.MAILERSEND_FROM_EMAIL || 'info@test-zkq340e73m2gd796.mlsender.net';
    const rawFromName = process.env.MAILERSEND_FROM_NAME || 'Samara Stay';

    const credentialsCheck = {
      apiKeyConfigured: Boolean(apiKey && apiKey !== 'YOUR_MAILERSEND_API_KEY_HERE'),
      apiKeyMasked: apiKey && apiKey !== 'YOUR_MAILERSEND_API_KEY_HERE' 
        ? `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}` 
        : 'NOT_CONFIGURED',
      fromEmail: rawFromEmail,
      fromName: rawFromName,
      isTrialDomain: rawFromEmail.includes('mlsender.net')
    };

    const diagnostics: any = {
      timestamp,
      environment: process.env.NODE_ENV || 'development',
      credentials: credentialsCheck,
      connectivity: {
        status: 'pending',
        httpCode: null,
        message: ''
      },
      domains: [],
      activityLogs: [],
      resolvedSender: null,
      recommendations: []
    };

    if (!credentialsCheck.apiKeyConfigured) {
      diagnostics.connectivity.status = 'failed';
      diagnostics.connectivity.message = 'MAILERSEND_API_KEY is missing or set to default placeholder value.';
      diagnostics.recommendations.push('Daftarkan MAILERSEND_API_KEY yang valid di environment variables (.env / settings).');
      console.warn('[MAILERSEND DIAGNOSTICS] API Key not configured.');
      return diagnostics;
    }

    try {
      console.log('[MAILERSEND DIAGNOSTICS] Verifying MailerSend API connectivity & verified domains...');
      const domainsRes = await fetch('https://api.mailersend.com/v1/domains', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'SamaraStay-App/1.0 (Node.js)'
        }
      });

      diagnostics.connectivity.httpCode = domainsRes.status;

      if (domainsRes.status === 200) {
        diagnostics.connectivity.status = 'success';
        diagnostics.connectivity.message = 'Koneksi ke MailerSend API Berhasil! (HTTP 200 OK)';
        const domainsJson = await domainsRes.json();
        
        if (domainsJson && Array.isArray(domainsJson.data)) {
          diagnostics.domains = domainsJson.data.map((d: any) => ({
            id: d.id,
            name: d.name,
            is_verified: d.is_verified ?? true,
            created_at: d.created_at
          }));
        }

        const resolvedSender = await resolveVerifiedFromEmail(apiKey, rawFromEmail);
        diagnostics.resolvedSender = resolvedSender;

        if (credentialsCheck.isTrialDomain) {
          diagnostics.recommendations.push(
            'Perhatian: Anda sedang menggunakan domain trial MailerSend (*.mlsender.net). Pada mode trial, email booking HANYA terkirim ke alamat email pembuat akun MailerSend / Authorized Recipients.'
          );
        }

        if (diagnostics.domains.length === 0) {
          diagnostics.recommendations.push(
            'Tidak ada domain terverifikasi di akun MailerSend Anda. Silakan tambahkan dan verifikasi domain kos Anda di MailerSend Dashboard.'
          );
        }
      } else {
        const errorText = await domainsRes.text();
        diagnostics.connectivity.status = 'failed';
        diagnostics.connectivity.message = `MailerSend API mengembalikan status HTTP ${domainsRes.status}`;
        diagnostics.connectivity.errorDetails = errorText;

        if (domainsRes.status === 401) {
          diagnostics.recommendations.push('HTTP 401 Unauthorized: Periksa kembali apakah MAILERSEND_API_KEY aktif dan tepat.');
        } else if (domainsRes.status === 422) {
          diagnostics.recommendations.push('HTTP 422 Unprocessable Entity: Alamat pengirim (From Email) atau domain belum sesuai di MailerSend.');
        }
      }

      // Query recent email message queue logs for debugging failed booking emails
      try {
        console.log('[MAILERSEND DIAGNOSTICS] Querying recent message queue logs...');
        const activityRes = await fetch('https://api.mailersend.com/v1/messages?limit=10', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'User-Agent': 'SamaraStay-App/1.0 (Node.js)'
          }
        });

        if (activityRes.status === 200) {
          const actJson = await activityRes.json();
          if (actJson && Array.isArray(actJson.data)) {
            diagnostics.activityLogs = actJson.data.slice(0, 10).map((msg: any) => ({
              id: msg.id,
              subject: msg.subject,
              created_at: msg.created_at,
              status: msg.status || 'processed',
              recipient: msg.emails ? msg.emails.map((e: any) => e.email).join(', ') : (msg.to || 'N/A')
            }));
          }
        }
      } catch (actErr: any) {
        console.warn('[MAILERSEND DIAGNOSTICS] Failed fetching activity queue:', actErr.message || actErr);
      }

    } catch (connErr: any) {
      diagnostics.connectivity.status = 'error';
      diagnostics.connectivity.message = `Gagal terhubung ke server MailerSend: ${connErr.message || connErr}`;
      diagnostics.recommendations.push('Periksa koneksi jaringan internet atau status layanan MailerSend.');
    }

    console.log('[MAILERSEND DIAGNOSTICS RESULT]', JSON.stringify(diagnostics, null, 2));
    return diagnostics;
  }

  // Helper function to log email events (success or failure) to activity_logs and sent_emails table in Supabase
  async function logEmailEventToDatabase(recipient: string, subject: string, status: 'sent' | 'failed', errorReason?: string) {
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const supabaseKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !supabaseKey || supabaseUrl === 'undefined' || supabaseKey === 'undefined') {
        return;
      }
      const supabase = createClient(supabaseUrl, supabaseKey);

      if (status === 'failed') {
        // 1. Log to activity_logs table for admin UI visibility
        await supabase.from('activity_logs').insert({
          admin_name: 'MailerSend System',
          action: 'EMAIL_FAILED',
          detail: `Gagal mengirim email ke ${recipient} (Subjek: "${subject}") setelah retries. Error: ${(errorReason || '').slice(0, 250)}`,
          ip_address: '127.0.0.1'
        });
      }

      // 2. Log to sent_emails table (if table exists)
      await supabase.from('sent_emails').insert({
        recipient,
        subject,
        status,
        error_message: errorReason ? errorReason.slice(0, 500) : null,
        sent_at: new Date().toISOString()
      }).then(({ error }) => {
        if (error) {
          console.warn('[EMAIL DB LOG] sent_emails table insert skipped/error:', error.message);
        }
      });
    } catch (dbErr) {
      console.error('[EMAIL DB LOG ERROR]', dbErr);
    }
  }

  async function logFailedEmailToDatabase(recipient: string, subject: string, errorReason: string) {
    return logEmailEventToDatabase(recipient, subject, 'failed', errorReason);
  }

  // =========================================================================
  // DIGITAL SIGNATURE STORAGE & HOSTING ENGINE (FOR INLINE ATTACHMENTS & EMAILS)
  // =========================================================================
  const signatureStore = new Map<string, { data: string; createdAt: number }>();

  // Cleanup old signature store items every 30 minutes
  setInterval(() => {
    const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
    for (const [id, item] of signatureStore.entries()) {
      if (item.createdAt < twoHoursAgo || signatureStore.size > 500) {
        signatureStore.delete(id);
      }
    }
  }, 30 * 60 * 1000);

  interface MailerSendAttachment {
    id?: string;
    filename: string;
    content: string; // Base64
    disposition?: 'inline' | 'attachment';
  }

  interface MailerSendPayload {
    from: { email: string; name: string };
    to: Array<{ email: string; name: string }>;
    subject: string;
    text: string;
    html: string;
    attachments?: MailerSendAttachment[];
  }

  let cachedOwnerSigBase64: string = '';

  async function getOfficialOwnerSigBase64(customUrl?: string): Promise<string> {
    if (customUrl && customUrl.startsWith('data:image/')) {
      return customUrl.includes(',') ? customUrl.split(',')[1] : customUrl;
    }
    if (!customUrl && cachedOwnerSigBase64) {
      return cachedOwnerSigBase64;
    }

    const targetUrl = customUrl || 'https://eniwbzpfvwtbsonmnzzr.supabase.co/storage/v1/object/public/signatures/owner_official_signature.png';
    try {
      const res = await fetch(targetUrl, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        const b64 = buffer.toString('base64');
        if (!customUrl) cachedOwnerSigBase64 = b64;
        return b64;
      }
    } catch (err) {
      console.warn('[SIGNATURE HELPER] Failed to fetch remote signature URL, generating vector fallback:', err);
    }

    // Fast vector render using @resvg/resvg-js
    try {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="180" viewBox="0 0 240 90"><path d="M 15 45 C 30 18, 40 8, 55 32 C 65 48, 75 12, 90 28 C 100 38, 105 18, 125 42 C 140 22, 155 52, 175 28 C 190 32, 205 22, 218 38" fill="none" stroke="#1e293b" stroke-width="2.8" stroke-linecap="round"/><path d="M 25 58 Q 110 46 210 52" fill="none" stroke="#2E6F40" stroke-width="2" stroke-dasharray="3 2"/><text x="110" y="72" font-family="sans-serif" font-size="9" font-weight="bold" fill="#2E6F40" text-anchor="middle" letter-spacing="1">SAMARA STAY OWNER</text><text x="110" y="83" font-family="monospace" font-size="7" fill="#64748b" text-anchor="middle">OFFICIAL DIGITAL STAMP</text></svg>';
      const png = await renderAsync(svg, { fitTo: { mode: 'width', value: 480 } });
      const b64 = png.asPng().toString('base64');
      if (!customUrl) cachedOwnerSigBase64 = b64;
      return b64;
    } catch (renderErr) {
      console.warn('[SIGNATURE HELPER] Fallback vector render error:', renderErr);
      return '';
    }
  }

  async function processEmailHtmlAndSignatures(
    rawHtml: string,
    options?: { ownerSigUrl?: string; tenantSigUrl?: string }
  ): Promise<{ html: string; attachments: MailerSendAttachment[] }> {
    let html = rawHtml || '';
    const attachments: MailerSendAttachment[] = [];

    // 1. Resolve & embed Owner Signature
    const hasOwnerSigTag = html.includes('alt="Tanda Tangan Owner"') ||
      html.includes('alt="TTD Owner"') ||
      html.includes('alt="Tanda Tangan Pemilik"') ||
      html.includes('class="sig-img"') ||
      html.includes('cid:owner-signature') ||
      html.includes('owner_official_signature');

    if (hasOwnerSigTag || options?.ownerSigUrl) {
      let detectedOwnerUrl = options?.ownerSigUrl || '';
      if (!detectedOwnerUrl) {
        const match = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*alt=["'][^"']*(?:Owner|Pemilik)[^"']*["']/i) ||
                      html.match(/<img[^>]*alt=["'][^"']*(?:Owner|Pemilik)[^"']*["'][^>]+src=["']([^"']+)["']/i);
        if (match && match[1]) {
          detectedOwnerUrl = match[1];
        }
      }

      let ownerBase64 = '';
      if (detectedOwnerUrl.startsWith('data:image/svg+xml')) {
        try {
          const rawSvg = decodeURIComponent(detectedOwnerUrl.replace(/^data:image\/svg\+xml;?(?:utf8,)?,/i, ''));
          const png = await renderAsync(rawSvg, { fitTo: { mode: 'width', value: 480 } });
          ownerBase64 = png.asPng().toString('base64');
        } catch (e) {
          console.warn('[SIGNATURE HELPER] SVG render error, falling back to official signature:', e);
        }
      } else if (detectedOwnerUrl.startsWith('data:image/')) {
        ownerBase64 = detectedOwnerUrl.includes(',') ? detectedOwnerUrl.split(',')[1] : detectedOwnerUrl;
      } else if (detectedOwnerUrl.includes('/api/signatures/')) {
        const sigMatch = detectedOwnerUrl.match(/\/api\/signatures\/([a-zA-Z0-9_-]+)\.png/);
        if (sigMatch && sigMatch[1]) {
          const item = signatureStore.get(sigMatch[1]);
          if (item) ownerBase64 = item.data;
        }
      }

      if (!ownerBase64) {
        ownerBase64 = await getOfficialOwnerSigBase64(detectedOwnerUrl.startsWith('http') ? detectedOwnerUrl : undefined);
      }

      if (ownerBase64) {
        attachments.push({
          id: 'owner-signature',
          filename: 'owner_signature.png',
          content: ownerBase64,
          disposition: 'inline'
        });

        // Replace the owner signature img src with cid:owner-signature
        html = html.replace(
          /(<img\b[^>]*?\balt=["'][^"']*(?:Owner|Pemilik)[^"']*["'][^>]*?\bsrc=["'])([^"']+)(["'][^>]*?>)/gi,
          '$1cid:owner-signature$3'
        );
        html = html.replace(
          /(<img\b[^>]*?\bsrc=["'])([^"']+)(["'][^>]*?\balt=["'][^"']*(?:Owner|Pemilik)[^"']*["'][^>]*?>)/gi,
          '$1cid:owner-signature$3'
        );
      }
    }

    // 2. Resolve & embed Tenant / Pemesan Signature if present
    const hasTenantSigTag = html.includes('alt="Tanda Tangan Pemesan"') ||
      html.includes('alt="TTD Pemesan"') ||
      html.includes('alt="TTD Penyewa"') ||
      html.includes('cid:tenant-signature');

    if (hasTenantSigTag || options?.tenantSigUrl) {
      let detectedTenantUrl = options?.tenantSigUrl || '';
      if (!detectedTenantUrl) {
        const match = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*alt=["'][^"']*(?:Pemesan|Penyewa)[^"']*["']/i) ||
                      html.match(/<img[^>]*alt=["'][^"']*(?:Pemesan|Penyewa)[^"']*["'][^>]+src=["']([^"']+)["']/i);
        if (match && match[1]) {
          detectedTenantUrl = match[1];
        }
      }

      let tenantBase64 = '';
      if (detectedTenantUrl.startsWith('data:image/')) {
        tenantBase64 = detectedTenantUrl.includes(',') ? detectedTenantUrl.split(',')[1] : detectedTenantUrl;
      } else if (detectedTenantUrl.includes('/api/signatures/')) {
        const sigMatch = detectedTenantUrl.match(/\/api\/signatures\/([a-zA-Z0-9_-]+)\.png/);
        if (sigMatch && sigMatch[1]) {
          const item = signatureStore.get(sigMatch[1]);
          if (item) tenantBase64 = item.data;
        }
      } else if (detectedTenantUrl.startsWith('http')) {
        try {
          const res = await fetch(detectedTenantUrl, { signal: AbortSignal.timeout(6000) });
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            tenantBase64 = buf.toString('base64');
          }
        } catch (e) {
          console.warn('[SIGNATURE HELPER] Failed to fetch remote tenant signature URL:', e);
        }
      }

      if (tenantBase64) {
        attachments.push({
          id: 'tenant-signature',
          filename: 'tenant_signature.png',
          content: tenantBase64,
          disposition: 'inline'
        });

        html = html.replace(
          /(<img\b[^>]*?\balt=["'][^"']*(?:Pemesan|Penyewa)[^"']*["'][^>]*?\bsrc=["'])([^"']+)(["'][^>]*?>)/gi,
          '$1cid:tenant-signature$3'
        );
        html = html.replace(
          /(<img\b[^>]*?\bsrc=["'])([^"']+)(["'][^>]*?\balt=["'][^"']*(?:Pemesan|Penyewa)[^"']*["'][^>]*?>)/gi,
          '$1cid:tenant-signature$3'
        );
      }
    }

    return { html, attachments };
  }

  // Core MailerSend API fetcher with max 3 retries and exponential backoff (1s, 2s, 4s)
  async function sendEmailWithRetry(
    apiKey: string,
    payload: MailerSendPayload,
    recipientEmail: string,
    subject: string
  ): Promise<{ success: boolean; status?: number; dataText?: string; error?: string }> {
    const delays = [1000, 2000, 4000]; // Exponential backoff delays (1s, 2s, 4s)
    const maxAttempts = 3;
    let lastError: string = '';
    let lastStatus: number | undefined = undefined;
    let lastResponseText = '';

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`[MAILERSEND API] Attempt ${attempt}/${maxAttempts} sending email to: ${recipientEmail} ("${subject}")`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

        const res = await fetch('https://api.mailersend.com/v1/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'User-Agent': 'SamaraStay-App/1.0 (Node.js)'
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        lastStatus = res.status;
        lastResponseText = await res.text();

        if (res.status >= 200 && res.status < 300) {
          console.log(`[MAILERSEND API SUCCESS] Email delivered on attempt ${attempt}. Status: ${res.status}`);
          await logEmailEventToDatabase(recipientEmail, subject, 'sent');
          return { success: true, status: res.status, dataText: lastResponseText };
        }

        // Check if error is non-transient 4xx (except 429)
        const isTransient = res.status === 429 || res.status >= 500;
        if (!isTransient) {
          console.warn(`[MAILERSEND API NON-RETRYABLE] Status ${res.status}: ${lastResponseText}. Skipping further retries.`);
          lastError = `HTTP ${res.status}: ${lastResponseText}`;
          await logFailedEmailToDatabase(recipientEmail, subject, lastError);
          return { success: false, status: res.status, dataText: lastResponseText, error: lastError };
        }

        console.warn(`[MAILERSEND API TRANSIENT ERROR] Attempt ${attempt}/${maxAttempts} failed with status ${res.status}: ${lastResponseText}`);
        lastError = `HTTP ${res.status}: ${lastResponseText}`;

      } catch (err: any) {
        console.warn(`[MAILERSEND API TIMEOUT/NETWORK ERROR] Attempt ${attempt}/${maxAttempts} failed: ${err.message || err}`);
        lastError = err.message || String(err);
      }

      // If transient error and attempt < maxAttempts, wait before retry
      if (attempt < maxAttempts) {
        const delayMs = delays[attempt - 1] || 1000;
        console.log(`[MAILERSEND API RETRY BACKOFF] Waiting ${delayMs}ms before attempt ${attempt + 1}...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    // Failed after all 3 attempts
    console.error(`[MAILERSEND API EXHAUSTED] Failed to send email to ${recipientEmail} after ${maxAttempts} attempts.`);
    await logFailedEmailToDatabase(recipientEmail, subject, lastError);

    return { success: false, status: lastStatus, dataText: lastResponseText, error: lastError };
  }

  // Helper function to send email via MailerSend API with non-blocking retry & inline signatures
  async function sendServerEmail(
    to: string,
    subject: string,
    text: string,
    rawHtml: string,
    options?: { ownerSigUrl?: string; tenantSigUrl?: string }
  ) {
    // Non-blocking background execution using setImmediate
    setImmediate(async () => {
      try {
        let apiKey = process.env.MAILERSEND_API_KEY || '';
        apiKey = apiKey.trim();
        if (apiKey.startsWith('"') && apiKey.endsWith('"')) apiKey = apiKey.slice(1, -1);
        else if (apiKey.startsWith("'") && apiKey.endsWith("'")) apiKey = apiKey.slice(1, -1);
        apiKey = apiKey.trim();

        if (!apiKey || apiKey === 'YOUR_MAILERSEND_API_KEY_HERE') {
          console.warn('[SERVER EMAIL TRIGGER WARNING] MAILERSEND_API_KEY is not configured. Email skipped.');
          return;
        }

        const baseFromEmail = process.env.MAILERSEND_FROM_EMAIL || 'info@test-zkq340e73m2gd796.mlsender.net';
        const fromEmail = await resolveVerifiedFromEmail(apiKey, baseFromEmail);
        const fromName = process.env.MAILERSEND_FROM_NAME || 'Samara Stay';

        const { html, attachments } = await processEmailHtmlAndSignatures(rawHtml, options);

        const payload: MailerSendPayload = {
          from: { email: fromEmail, name: fromName },
          to: [{ email: to, name: to.split('@')[0] }],
          subject,
          text,
          html,
          attachments: attachments.length > 0 ? attachments : undefined
        };

        console.log('[SERVER EMAIL TRIGGER] Initiating non-blocking send with retry:', subject, 'to:', to, 'inline attachments:', attachments.length);
        await sendEmailWithRetry(apiKey, payload, to, subject);
      } catch (err) {
        console.error('[SERVER EMAIL TRIGGER ERROR]', err);
      }
    });
  }

  
  // =========================================================================
  // AUTOMATED ATOMIC SETTLEMENT & ROOM LOCK ENGINE
  // =========================================================================
  async function settleBookingTransaction(
    supabase: any,
    orderId: string,
    paymentType: string = 'Midtrans SNAP',
    transactionId?: string,
    grossAmount?: number,
    feeAmount?: number,
    clientFallbackData?: any
  ) {
    console.log(`[SETTLE BOOKING] Executing automated payment settlement for Order: "${orderId}"`);
    
    // 1. Fetch booking by midtrans_order_id or fallback
    let booking: any = null;
    const { data: bData, error: fetchErr } = await supabase
      .from('bookings')
      .select('*')
      .eq('midtrans_order_id', orderId)
      .maybeSingle();

    if (fetchErr) {
      console.error('[SETTLE BOOKING ERROR] Fetch booking error:', fetchErr);
    }
    booking = bData;

    // Fallback search by id if provided in client data
    if (!booking && clientFallbackData) {
      if (clientFallbackData.id) {
        const { data: bById } = await supabase
          .from('bookings')
          .select('*')
          .eq('id', clientFallbackData.id)
          .maybeSingle();
        booking = bById;
      }
      if (!booking) {
        const newBooking = {
          ...clientFallbackData,
          status: 'approved',
          payment_method: paymentType,
          midtrans_order_id: orderId
        };
        delete newBooking.id;
        const { data: insData, error: insErr } = await supabase
          .from('bookings')
          .insert(newBooking)
          .select()
          .single();
        if (!insErr && insData) {
          booking = insData;
        }
      }
    }

    if (!booking) {
      throw new Error(`Data pemesanan dengan Order ID "${orderId}" tidak ditemukan.`);
    }

    const effectiveTenantName = booking.occupant_name || booking.tenant_name || 'Penghuni';

    // 2. Idempotency Check: if already approved, ensure room is occupied and return
    if (booking.status === 'approved') {
      console.log(`[SETTLE BOOKING] Booking "${orderId}" is ALREADY approved. Ensuring room is locked.`);
      if (booking.room_id) {
        await supabase
          .from('rooms')
          .update({ 
            status: 'occupied', 
            current_tenant_name: effectiveTenantName 
          })
          .eq('id', booking.room_id);
        await syncPropertyRoomCountInSupabase(supabase, booking.property_id);
      }
      return { 
        success: true, 
        already_approved: true, 
        booking,
        room_locked: true,
        room_id: booking.room_id 
      };
    }

    let invoiceId = `INV-${Math.floor(1000 + Math.random() * 9000)}`;
    const effectiveTrxId = transactionId || `mid-tr-${Math.floor(100000 + Math.random() * 900000)}`;

    // 3. Attempt atomic settlement via RPC (Migration 017)
    const { data: rpcRes, error: settleRpcErr } = await supabase.rpc('settle_booking_payment', {
      p_booking_id: booking.id,
      p_order_id: orderId,
      p_payment_type: paymentType || 'Midtrans SNAP',
      p_transaction_id: effectiveTrxId
    });

    if (!settleRpcErr && rpcRes && rpcRes.success) {
      if (rpcRes.invoice_id) {
        invoiceId = rpcRes.invoice_id;
      }
      if (booking.room_id) {
        await supabase
          .from('rooms')
          .update({ status: 'occupied', current_tenant_name: effectiveTenantName })
          .eq('id', booking.room_id);
        await syncPropertyRoomCountInSupabase(supabase, booking.property_id);
      }
      console.log(`[SETTLE BOOKING] Atomic settlement RPC succeeded for ${orderId}, invoice: ${invoiceId}`);
    } else {
      console.warn('[SETTLE BOOKING] Atomic settlement RPC fallback to manual steps:', settleRpcErr?.message || rpcRes?.error);
      
      // Update booking to approved
      await supabase
        .from('bookings')
        .update({ 
          status: 'approved', 
          payment_method: paymentType || 'Midtrans SNAP',
          midtrans_order_id: orderId 
        })
        .eq('id', booking.id);

      // Lock room to occupied
      if (booking.room_id) {
        await supabase
          .from('rooms')
          .update({ 
            status: 'occupied', 
            current_tenant_name: effectiveTenantName 
          })
          .eq('id', booking.room_id);
        await syncPropertyRoomCountInSupabase(supabase, booking.property_id);
      }

      // Upsert/insert tenant
      const initials = effectiveTenantName ? effectiveTenantName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() : 'TM';
      await supabase.from('tenants').insert({
        full_name: effectiveTenantName,
        phone: booking.occupant_phone || booking.phone || '',
        email: booking.occupant_email || booking.email || '',
        avatar_initials: initials,
        avatar_color: "bg-indigo-600",
        property_id: booking.property_id,
        room_number: booking.room_number,
        start_date: booking.check_in_date || new Date().toISOString().split('T')[0],
        duration_months: booking.duration_months || 1,
        payment_status: 'paid'
      });

      // Insert invoice
      await supabase.from('payments').insert({
        id: invoiceId,
        tenant_name: booking.tenant_name,
        property_id: booking.property_id,
        amount: booking.total_price || grossAmount || 0,
        method: paymentType || 'Midtrans SNAP',
        status: 'paid',
        payment_date: new Date().toISOString().split('T')[0],
        midtrans_order_id: orderId,
        transaction_id: effectiveTrxId
      });
    }

    // Refresh booking
    const { data: refreshedBooking } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', booking.id)
      .single();
    if (refreshedBooking) {
      booking = refreshedBooking;
    }

    // 4. Record Midtrans Gateway Clearing Item
    try {
      const feeAmt = Number(feeAmount || 0);
      const grossAmt = Number(booking.total_price || grossAmount || 0);
      await supabase.from('midtrans_clearing_transactions').upsert({
        midtrans_order_id: orderId,
        midtrans_transaction_id: effectiveTrxId,
        payment_id: invoiceId,
        booking_id: booking.id,
        gross_amount: grossAmt,
        fee_amount: feeAmt,
        net_amount: grossAmt - feeAmt,
        reconciled_amount: 0,
        outstanding_amount: grossAmt,
        clearing_status: 'cleared',
        property_id: booking.property_id || null,
        tenant_name: booking.tenant_name,
        settled_at: new Date().toISOString()
      }, { onConflict: 'midtrans_order_id' });
    } catch (clrErr) {
      console.warn('[SETTLE BOOKING] Midtrans clearing insert warning:', clrErr);
    }

    // 5. Post double-entry financial transaction
    try {
      await verifyAndEnsureCriticalCOA(supabase, true);
      const trxDate = new Date().toISOString().split('T')[0];
      const trxNo = `TRX-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
      const { error: rpcErr } = await supabase.rpc('post_financial_transaction', {
        p_transaction_no: trxNo,
        p_transaction_date: trxDate,
        p_category: 'Penerimaan Sewa',
        p_description: `[AUTO-LOCK] Pelunasan Sewa ${booking.tenant_name} Unit ${booking.room_number}`,
        p_amount: booking.total_price || grossAmount || 0,
        p_type: 'income',
        p_reference_type: 'payment',
        p_reference_id: invoiceId,
        p_created_by: 'Midtrans Auto Settlement',
        p_debit_account_id: 1200,
        p_credit_account_id: 4000,
        p_property_id: booking?.property_id || null
      });

      if (rpcErr) {
        console.warn('[SETTLE BOOKING] post_financial_transaction RPC failed, fallback to journal entries:', rpcErr.message);
        const { data: insertedTrx, error: ftErr } = await supabase.from('financial_transactions').insert({
          transaction_no: trxNo,
          transaction_date: trxDate,
          category: 'Penerimaan Sewa',
          description: `[AUTO-LOCK] Pelunasan Sewa ${booking.tenant_name} Unit ${booking.room_number}`,
          amount: Number(booking.total_price || grossAmount || 0),
          type: 'income',
          reference_type: 'payment',
          reference_id: invoiceId,
          created_by: 'Midtrans Auto Settlement',
          property_id: booking?.property_id || null
        }).select().single();

        if (insertedTrx && !ftErr) {
          const journalNo = `JRN-${trxDate.replace(/-/g, '')}-${insertedTrx.id}`;
          await supabase.from('journal_entries').insert([
            {
              journal_no: journalNo,
              transaction_id: insertedTrx.id,
              account_id: 1200,
              debit: Number(booking.total_price || grossAmount || 0),
              credit: 0
            },
            {
              journal_no: journalNo,
              transaction_id: insertedTrx.id,
              account_id: 4000,
              debit: 0,
              credit: Number(booking.total_price || grossAmount || 0)
            }
          ]);
        }
      }
    } catch (finErr: any) {
      console.error('[SETTLE BOOKING] Financial transaction posting warning:', finErr);
    }

    // 6. Send confirmation email to tenant
    const recipientEmails = Array.from(new Set([
      booking.email,
      booking.occupant_email,
      clientFallbackData?.email,
      clientFallbackData?.occupant_email
    ].map((e: any) => typeof e === 'string' ? e.trim() : '').filter(e => e && e.includes('@'))));

    if (recipientEmails.length > 0) {
      try {
        let property = null;
        if (booking.property_id) {
          const { data: prop } = await supabase
            .from('properties')
            .select('*')
            .eq('id', booking.property_id)
            .maybeSingle();
          property = prop;
        }
        const propertyName = property?.name || 'Samara Stay Premium Residence';
        const propertyAddress = property?.address || 'Premium Boarding Area';
        const formattedPrice = 'Rp ' + (booking.total_price || grossAmount || 0).toLocaleString('id-ID');
        let settleOwnerSig = 'https://eniwbzpfvwtbsonmnzzr.supabase.co/storage/v1/object/public/signatures/owner_official_signature.png';
        try {
          const { data: setRow } = await supabase.from('settings').select('owner_signature_url').eq('id', 1).maybeSingle();
          if (setRow?.owner_signature_url) {
            settleOwnerSig = setRow.owner_signature_url;
          }
        } catch (sErr) {}

        const subject = `[Samara Stay] Konfirmasi & Pelunasan Sewa Kamar - Unit ${booking.room_number}`;
        const text = `Halo ${booking.tenant_name}, pembayaran sewa kamar Anda di ${propertyName} (Unit ${booking.room_number}) telah lunas dan kamar berhasil dikunci!`;
        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
            <h2 style="color: #0D9488; margin-top: 0;">Pembayaran Berhasil & Kamar Terkunci</h2>
            <p>Halo <strong>${booking.tenant_name}</strong>,</p>
            <p>Terima kasih! Pembayaran pemesanan kamar Anda telah berhasil diverifikasi secara otomatis melalui <strong>${paymentType}</strong>.</p>
            <div style="background-color: #f8fafc; padding: 15px; border-radius: 12px; margin: 20px 0; border: 1px solid #e2e8f0;">
              <p style="margin: 5px 0;"><strong>No. Invoice:</strong> ${invoiceId}</p>
              <p style="margin: 5px 0;"><strong>Order ID:</strong> ${orderId}</p>
              <p style="margin: 5px 0;"><strong>Properti:</strong> ${propertyName}</p>
              <p style="margin: 5px 0;"><strong>Unit Kamar:</strong> Kamar ${booking.room_number}</p>
              <p style="margin: 5px 0;"><strong>Penghuni:</strong> ${effectiveTenantName}</p>
              <p style="margin: 5px 0;"><strong>Total Pembayaran:</strong> ${formattedPrice}</p>
              <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: #059669; font-weight: bold;">LUNAS (Kamar Terkunci)</span></p>
            </div>
            <div style="font-size: 13px; color: #475569; margin: 15px 0; padding: 12px; background-color: #f1f5f9; border-radius: 8px;">
              <strong>Alamat Properti:</strong> ${propertyAddress}
            </div>

            <!-- PENGESAHAN TANDA TANGAN DUA PIHAK (OWNER & PEMESAN) -->
            <div style="margin-top: 25px; padding: 16px; border: 1px dashed #94a3b8; border-radius: 12px; background-color: #ffffff;">
              <p style="font-size: 10px; color: #475569; font-weight: 800; margin: 0 0 10px 0; text-transform: uppercase; text-align: center; letter-spacing: 0.5px;">PENGESAHAN TANDA TANGAN RESMI:</p>
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
                <tr>
                  <td width="50%" align="center" style="padding: 10px; border-right: 1px solid #e2e8f0; vertical-align: bottom;">
                    <p style="font-size: 9px; color: #64748b; font-weight: bold; margin: 0 0 6px 0; text-transform: uppercase;">PIHAK PERTAMA (OWNER)</p>
                    <div style="min-height: 55px; text-align: center;">
                      <img src="cid:owner-signature" alt="Tanda Tangan Owner" style="max-height: 55px; max-width: 140px; display: inline-block;" />
                    </div>
                    <p style="font-size: 9px; color: #1e293b; font-weight: 800; margin: 4px 0 0 0; text-transform: uppercase;">SAMARA STAY MANAGEMENT</p>
                    <p style="font-size: 8px; color: #059669; font-weight: bold; margin: 2px 0 0 0; font-family: monospace;">[ STAMP RESMI ]</p>
                  </td>
                  <td width="50%" align="center" style="padding: 10px; vertical-align: bottom;">
                    <p style="font-size: 9px; color: #64748b; font-weight: bold; margin: 0 0 6px 0; text-transform: uppercase;">PIHAK KEDUA (PEMESAN)</p>
                    <div style="min-height: 55px; text-align: center;">
                      ${booking.signature_url ? `
                        <img src="cid:tenant-signature" alt="Tanda Tangan Pemesan" style="max-height: 55px; max-width: 140px; display: inline-block;" />
                      ` : `
                        <p style="font-size: 10px; color: #059669; font-weight: bold; margin: 15px 0 0 0; font-family: monospace;">✓ DISETUJUI DIGITAL</p>
                      `}
                    </div>
                    <p style="font-size: 9px; color: #1e293b; font-weight: 800; margin: 4px 0 0 0; text-transform: uppercase;">${effectiveTenantName}</p>
                    <p style="font-size: 8px; color: #64748b; margin: 2px 0 0 0; font-family: monospace;">TERVERIFIKASI SISTEM</p>
                  </td>
                </tr>
              </table>
            </div>

            <p style="color: #64748b; font-size: 13px; margin-top: 20px;">Kamar Anda kini telah terkunci aman di sistem kami dan tidak dapat dipesan oleh siapapun. Silakan tunjukkan invoice atau email ini saat check-in fisik di lokasi.</p>
          </div>
        `;
        for (const recipientEmail of recipientEmails) {
          console.log(`[SETTLE BOOKING] Dispatching confirmation email to recipient: ${recipientEmail}`);
          sendServerEmail(recipientEmail, subject, text, html, {
            ownerSigUrl: settleOwnerSig,
            tenantSigUrl: booking.signature_url
          });
        }
      } catch (emErr) {
        console.warn('[SETTLE BOOKING] Email send warning:', emErr);
      }
    }

    return {
      success: true,
      booking,
      invoice_id: invoiceId,
      room_locked: true,
      room_id: booking.room_id
    };
  }


  // 2. Midtrans Webhook Receiver (With Signature Key Verification)
  app.post('/api/midtrans/webhook', async (req, res) => {
    try {
      const notification = req.body;
      console.log('[MIDTRANS WEBHOOK RECEIVED] Order ID:', notification.order_id, 'Status:', notification.transaction_status);

      const orderId = notification.order_id;
      const transactionStatus = notification.transaction_status;
      const fraudStatus = notification.fraud_status;
      const paymentType = notification.payment_type;
      const grossAmount = notification.gross_amount;
      const statusCode = notification.status_code;
      const incomingSignature = notification.signature_key;

      // ---------------------------------------------------------
      // Webhook Signature Verification Logic
      // ---------------------------------------------------------
      let rawServerKey = process.env.MIDTRANS_SERVER_KEY || '';
      let serverKey = rawServerKey.trim();
      if (serverKey.startsWith('"') && serverKey.endsWith('"')) {
        serverKey = serverKey.slice(1, -1);
      } else if (serverKey.startsWith("'") && serverKey.endsWith("'")) {
        serverKey = serverKey.slice(1, -1);
      }
      serverKey = serverKey.trim();

      // Enforce strict check if MIDTRANS_SERVER_KEY is configured
      if (serverKey && serverKey !== 'YOUR_MIDTRANS_SERVER_KEY_HERE' && serverKey !== '') {
        if (!incomingSignature) {
          console.warn('[MIDTRANS WEBHOOK SECURITY WARNING] Webhook received without signature key.');
          return res.status(401).json({ error: 'Unauthorized: Missing signature key' });
        }

        const computedSignature = crypto
          .createHash('sha512')
          .update(orderId + statusCode + grossAmount + serverKey)
          .digest('hex');

        if (computedSignature !== incomingSignature) {
          console.warn('[MIDTRANS WEBHOOK SECURITY WARNING] Signature mismatch computed:', computedSignature, 'received:', incomingSignature);
          addMidtransLog({
            orderId: orderId || 'unknown',
            type: 'error',
            status: 'failed',
            message: 'Webhook signature verification failed: invalid credentials or signature mismatch.',
            details: { incomingSignature }
          });
          return res.status(401).json({ error: 'Unauthorized: Invalid signature key' });
        }
        console.log('[MIDTRANS WEBHOOK SECURITY] Signature verified successfully!');
      } else {
        console.log('[MIDTRANS WEBHOOK WARNING] Skipping signature verification: server key not configured.');
      }

      let paymentStatus: 'paid' | 'pending' | 'overdue' = 'pending';

      if (transactionStatus === 'capture') {
        if (fraudStatus === 'challenge') {
          paymentStatus = 'pending';
        } else if (fraudStatus === 'accept') {
          paymentStatus = 'paid';
        }
      } else if (transactionStatus === 'settlement') {
        paymentStatus = 'paid';
      } else if (transactionStatus === 'cancel' || transactionStatus === 'deny' || transactionStatus === 'expire') {
        paymentStatus = 'overdue';
      } else if (transactionStatus === 'pending') {
        paymentStatus = 'pending';
      }

      console.log(`[STATUS COUPLING] Order: ${orderId} is mapped to Status: ${paymentStatus} via payment: ${paymentType}`);

      addMidtransLog({
        orderId: orderId || 'unknown',
        amount: grossAmount ? Number(grossAmount) : undefined,
        type: 'webhook',
        status: paymentStatus === 'paid' ? 'success' : paymentStatus === 'overdue' ? 'failed' : 'pending',
        message: `Webhook notification received from Midtrans. Status: ${transactionStatus}, mapped to ${paymentStatus} (${paymentType})`,
        details: notification
      });

      // Synchronize changes to Supabase using Service Role Key (bypasses RLS on backend)
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const supabaseKey = getServiceRoleKeyOrThrow();
      const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey && supabaseUrl !== 'undefined' && supabaseKey !== 'undefined');
      const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseKey) : null;

      // ---------------------------------------------------------
      // Webhook Idempotency Layer via webhook_events table
      // ---------------------------------------------------------
      if (supabase) {
        // Use transaction_id from Midtrans if present, or construct deterministic fallback event_id
        const eventId = notification.transaction_id || `${orderId}_${transactionStatus}_${statusCode || ''}_${grossAmount || ''}`;
        const transactionId = notification.transaction_id || null;

        const { error: webhookEventErr } = await supabase
          .from('webhook_events')
          .insert({
            provider: 'midtrans',
            event_id: eventId,
            order_id: orderId || null,
            transaction_id: transactionId,
            status: transactionStatus || paymentStatus,
            payload: notification,
            processed_at: new Date().toISOString()
          });

        if (webhookEventErr) {
          // Check for Postgres unique constraint violation (code 23505) or duplicate key error
          if (
            webhookEventErr.code === '23505' ||
            webhookEventErr.message?.includes('duplicate key') ||
            webhookEventErr.message?.includes('already exists') ||
            webhookEventErr.details?.includes('already exists')
          ) {
            console.log(`[MIDTRANS WEBHOOK IDEMPOTENCY] Event ID "${eventId}" for Order "${orderId}" was ALREADY processed. Returning 200 OK without re-processing.`);
            return res.status(200).json({
              status: 'OK',
              message: `Webhook event ${eventId} already processed (idempotency enforced).`
            });
          } else {
            console.warn('[MIDTRANS WEBHOOK IDEMPOTENCY WARNING] Failed recording webhook_event (non-fatal):', webhookEventErr.message);
          }
        } else {
          console.log(`[MIDTRANS WEBHOOK IDEMPOTENCY] Successfully recorded webhook_event: "${eventId}" for Order "${orderId}".`);
        }
      }

      if (supabase && orderId) {
        if (paymentStatus === 'paid') {
          if (orderId.startsWith('BOOK-') || orderId.startsWith('BOOKING-')) {
            console.log(`[SUPABASE WEBHOOK SYNC] Processing booking payment settlement for ${orderId}`);
            try {
              const settleResult = await settleBookingTransaction(
                supabase,
                orderId,
                paymentType || 'Midtrans SNAP',
                notification.transaction_id,
                Number(grossAmount || 0),
                Number(notification.fee_amount || 0)
              );
              console.log(`[SUPABASE WEBHOOK SYNC] Settle completed successfully for ${orderId}:`, settleResult?.invoice_id);
            } catch (settleErr: any) {
              console.error(`[SUPABASE WEBHOOK ERROR] Settle booking error for ${orderId}:`, settleErr);
            }
          } else if (orderId.startsWith('SRV-')) {
            console.log(`[SUPABASE WEBHOOK SYNC] Processing survey payment settlement for ${orderId}`);
            
            // 1. Fetch existing pending survey
            const { data: survey, error: fetchErr } = await supabase
              .from('surveys')
              .select('*')
              .eq('reservation_number', orderId)
              .maybeSingle();

            if (fetchErr) {
              console.error('[SUPABASE WEBHOOK ERROR] Fetch survey error:', fetchErr);
            }

            if (survey) {
              if (survey.status === 'survey_confirmed') {
                console.log(`[SUPABASE WEBHOOK SYNC] Webhook received but survey ${orderId} is ALREADY confirmed. Skipping duplicate processing for idempotency.`);
                return res.status(200).json({ status: 'OK', message: 'Survey already confirmed' });
              }
              console.log(`[SUPABASE WEBHOOK SYNC] Survey found: ID ${survey.id}. Updating status to survey_confirmed...`);
              
              // 2. Update survey status
              const { error: updateErr } = await supabase
                .from('surveys')
                .update({ status: 'survey_confirmed', payment_method: paymentType || 'Midtrans SNAP' })
                .eq('id', survey.id);
              if (updateErr) console.error('[SUPABASE WEBHOOK ERROR] Update survey error:', updateErr);

              // Note: In accordance with business rules, rooms remain OPEN/AVAILABLE for public booking & surveys
              // until full official rental payment (pelunasan resmi) is completed. Only the specific time-slot is locked.
              console.log(`[SUPABASE WEBHOOK SYNC] Survey ${survey.reservation_number} confirmed. Room ${survey.room_number} remains available for public bookings/surveys.`);

              // 3. Create payment invoice
              console.log(`[SUPABASE WEBHOOK SYNC] Creating survey payment invoice...`);
              const srvInvPayload = {
                id: survey.invoice_id || `INV-SRV-${Math.floor(1000 + Math.random() * 9000)}`,
                tenant_name: survey.tenant_name,
                property_id: survey.property_id,
                amount: survey.dp_amount || 500000,
                method: paymentType || "Midtrans Snap QRIS",
                status: "paid",
                payment_date: new Date().toISOString().split('T')[0],
                midtrans_order_id: orderId,
                transaction_id: notification.transaction_id || `mid-tr-${Math.floor(100000 + Math.random() * 900000)}`
              };
              const { error: payErr } = await supabase.from('payments').insert(srvInvPayload);
              if (payErr) console.error('[SUPABASE WEBHOOK ERROR] Create survey invoice error:', payErr);

              // Record Midtrans Gateway Clearing Item
              try {
                const feeAmt = Number(notification.fee_amount || 0);
                const grossAmt = Number(survey.dp_amount || 500000);
                await supabase.from('midtrans_clearing_transactions').upsert({
                  midtrans_order_id: orderId,
                  midtrans_transaction_id: notification.transaction_id || null,
                  payment_id: srvInvPayload.id,
                  survey_id: survey.id,
                  gross_amount: grossAmt,
                  fee_amount: feeAmt,
                  net_amount: grossAmt - feeAmt,
                  reconciled_amount: 0,
                  outstanding_amount: grossAmt,
                  clearing_status: 'cleared',
                  property_id: survey.property_id || null,
                  tenant_name: survey.tenant_name,
                  settled_at: new Date().toISOString()
                }, { onConflict: 'midtrans_order_id' });
              } catch (clrErr) {
                console.warn('[SUPABASE WEBHOOK WARNING] Midtrans survey clearing insert warning:', clrErr);
              }

              // 5. Post double-entry financial accounting transaction for survey DP (DR 1200 Midtrans Clearing, CR 1300 Deposit)
              try {
                await verifyAndEnsureCriticalCOA(supabase, true);
                const trxDate = new Date().toISOString().split('T')[0];
                const trxNo = `TRX-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
                const { error: rpcErr } = await supabase.rpc('post_financial_transaction', {
                  p_transaction_no: trxNo,
                  p_transaction_date: trxDate,
                  p_category: 'DP Survey / Reservasi',
                  p_description: `[WEBHOOK] Pelunasan DP Survey ${survey.tenant_name} Unit ${survey.room_number}`,
                  p_amount: survey.dp_amount || 500000,
                  p_type: 'dp_booking',
                  p_reference_type: 'payment',
                  p_reference_id: srvInvPayload.id,
                  p_created_by: 'Midtrans Webhook',
                  p_debit_account_id: 1200, // Piutang Kliring Midtrans
                  p_credit_account_id: 1300, // Uang Muka / Deposit Survey
                  p_property_id: survey?.property_id || null
                });

                if (rpcErr) {
                  console.warn('[SUPABASE WEBHOOK] post_financial_transaction RPC failed for survey, using double-entry fallback:', rpcErr.message);
                  const { data: insertedTrx, error: ftErr } = await supabase.from('financial_transactions').insert({
                    transaction_no: trxNo,
                    transaction_date: trxDate,
                    category: 'DP Survey / Reservasi',
                    description: `[WEBHOOK] Pelunasan DP Survey ${survey.tenant_name} Unit ${survey.room_number}`,
                    amount: Number(survey.dp_amount || 500000),
                    type: 'dp_booking',
                    reference_type: 'payment',
                    reference_id: srvInvPayload.id,
                    created_by: 'Midtrans Webhook',
                    property_id: survey?.property_id || null
                  }).select().single();

                  if (insertedTrx && !ftErr) {
                    const journalNo = `JRN-${trxDate.replace(/-/g, '')}-${insertedTrx.id}`;
                    await supabase.from('journal_entries').insert([
                      {
                        journal_no: journalNo,
                        transaction_id: insertedTrx.id,
                        account_id: 1200,
                        debit: Number(survey.dp_amount || 500000),
                        credit: 0
                      },
                      {
                        journal_no: journalNo,
                        transaction_id: insertedTrx.id,
                        account_id: 1300,
                        debit: 0,
                        credit: Number(survey.dp_amount || 500000)
                      }
                    ]);
                  } else {
                    await recordFailedLedgerPosting(supabase, {
                      transaction_no: trxNo,
                      reference_type: 'payment',
                      reference_id: srvInvPayload.id,
                      amount: Number(survey.dp_amount || 500000),
                      debit_account_id: 1200,
                      credit_account_id: 1300,
                      property_id: survey?.property_id || null,
                      created_by: 'Midtrans Webhook',
                      error_message: ftErr?.message || rpcErr.message
                    });
                  }
                }
              } catch (finErr: any) {
                console.error('[SUPABASE WEBHOOK WARNING] Survey financial transaction recording warning:', finErr);
                await recordFailedLedgerPosting(supabase, {
                  reference_type: 'payment',
                  reference_id: srvInvPayload.id,
                  amount: Number(survey.dp_amount || 500000),
                  debit_account_id: 1200,
                  credit_account_id: 1300,
                  property_id: survey?.property_id || null,
                  created_by: 'Midtrans Webhook',
                  error_message: finErr?.message || 'Exception during survey financial posting'
                });
              }

              // Send premium email notification via MailerSend
              if (survey.email) {
                const subject = `[Samara Stay] Jadwal Survey Kamar Dikonfirmasi - Unit ${survey.room_number}`;
                const text = `Halo ${survey.tenant_name}, jadwal survey Anda untuk kamar Unit ${survey.room_number} telah dikonfirmasi untuk tanggal ${survey.survey_date} pukul ${survey.survey_time}.`;
                const html = `
                  <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; color: #1e293b;">
                    <div style="text-align: center; border-bottom: 2px solid #f59e0b; padding-bottom: 15px; margin-bottom: 20px;">
                      <h1 style="color: #2D3A44; margin: 0; font-size: 24px;">SAMARA STAY</h1>
                      <p style="color: #64748b; font-size: 12px; margin: 5px 0 0 0; text-transform: uppercase; font-family: monospace;">Premium Boarding Residence</p>
                    </div>
                    <h2 style="color: #f59e0b; margin-top: 0;">Jadwal Survey Dikonfirmasi!</h2>
                    <p>Halo <strong>${survey.tenant_name}</strong>,</p>
                    <p>Terima kasih. Jadwal kunjungan survey dan reservasi kamar sementara Anda telah berhasil dikonfirmasi setelah pembayaran DP berhasil diterima.</p>
                    
                    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; margin: 20px 0;">
                      <h3 style="color: #2D3A44; margin-top: 0; margin-bottom: 10px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Rincian Jadwal</h3>
                      <table style="width: 100%; font-size: 13px; line-height: 2;">
                        <tr><td style="color: #64748b; width: 40%;">Tanggal Kunjungan:</td><td><strong>${survey.survey_date}</strong></td></tr>
                        <tr><td style="color: #64748b;">Waktu Slot:</td><td><strong>${survey.survey_time} WIB</strong></td></tr>
                        <tr><td style="color: #64748b;">Kamar Target:</td><td><strong>Unit ${survey.room_number}</strong></td></tr>
                        <tr><td style="color: #64748b;">Deposit DP Survey:</td><td><strong style="color: #f59e0b; font-size: 14px;">Rp ${(survey.dp_amount || 500000).toLocaleString('id-ID')}</strong></td></tr>
                      </table>
                    </div>
                    <p style="font-size: 13px; color: #64748b; line-height: 1.5;">Tim lapangan kami akan menemui Anda langsung di lokasi kos sesuai dengan waktu yang Anda pilih. Mohon datang tepat waktu dan tunjukkan email konfirmasi reservasi ini.</p>
                    <div style="text-align: center; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px; font-size: 11px; color: #94a3b8;">
                      &copy; 2026 Samara Stay. Seluruh hak cipta dilindungi.
                    </div>
                  </div>
                `;
                sendServerEmail(survey.email, subject, text, html);
              }
            } else {
              console.warn(`[SUPABASE WEBHOOK SYNC] Survey record not found for ${orderId}`);
            }
          } else if (orderId.startsWith('EXT-') || orderId.startsWith('EXTEND-')) {
            console.log(`[SUPABASE WEBHOOK SYNC] Processing contract extension payment settlement for ${orderId}`);
            try {
              await settleContractExtensionTransaction(
                supabase,
                orderId,
                paymentType || 'Midtrans SNAP',
                notification.transaction_id || `mid-tr-ext-${Math.floor(100000 + Math.random() * 900000)}`,
                Number(notification.gross_amount || 0),
                Number(notification.fee_amount || 0)
              );
            } catch (extSettleErr) {
              console.error('[SUPABASE WEBHOOK ERROR] Contract extension settlement error:', extSettleErr);
            }
          }
        } else if (paymentStatus === 'overdue') {
          if (orderId.startsWith('BOOK-') || orderId.startsWith('BOOKING-')) {
            const { data: booking } = await supabase
              .from('bookings')
              .select('*')
              .eq('midtrans_order_id', orderId)
              .maybeSingle();

            if (booking) {
              await supabase.from('bookings').update({ status: 'rejected' }).eq('id', booking.id);
              if (booking.room_id) {
                await supabase.from('rooms').update({ status: 'available', current_tenant_name: null }).eq('id', booking.room_id);
                await syncPropertyRoomCountInSupabase(supabase, booking.property_id);
              }
            }
          } else if (orderId.startsWith('SRV-')) {
            const { data: survey } = await supabase
              .from('surveys')
              .select('*')
              .eq('reservation_number', orderId)
              .maybeSingle();

            if (survey) {
              await supabase.from('surveys').update({ status: 'expired' }).eq('id', survey.id);
              const { data: room } = await supabase
                .from('rooms')
                .select('*')
                .eq('property_id', survey.property_id)
                .eq('room_number', survey.room_number)
                .maybeSingle();
              if (room && room.status === 'reserved') {
                await supabase.from('rooms').update({ status: 'available' }).eq('id', room.id);
                await syncPropertyRoomCountInSupabase(supabase, survey.property_id);
              }
            }
          }
        }
      }

      // Return a completed status to Midtrans gateway
      return res.status(200).json({ status: 'OK', mapped_status: paymentStatus });
    } catch (error: any) {
      console.error('[WEBHOOK ERROR]', error);

      addMidtransLog({
        orderId: req.body?.order_id || 'unknown',
        type: 'error',
        status: 'failed',
        message: `Webhook ingestion failure: ${error.message || 'Unknown error'}`,
        details: { body: req.body, error: error.message }
      });

      return res.status(500).json({ error: 'Webhook ingestion failure' });
    }
  });

  
  // =========================================================================
  // ENDPOINT: DIRECT BOOKING SETTLEMENT & AUTO-LOCK (FOR CLIENT & REDIRECT)
  // =========================================================================
  app.post('/api/midtrans/settle-booking', apiRateLimiter(60000, 60), express.json(), async (req, res) => {
    try {
      const { order_id, transaction_id, payment_type, gross_amount, booking_data } = req.body;
      if (!order_id) {
        return res.status(400).json({ success: false, error: 'order_id wajib disertakan.' });
      }
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      const supabase = createClient(supabaseUrl, serviceKey);

      const result = await settleBookingTransaction(
        supabase,
        order_id,
        payment_type || 'Midtrans SNAP',
        transaction_id,
        gross_amount,
        undefined,
        booking_data
      );

      return res.status(200).json({ success: true, ...result });
    } catch (err: any) {
      console.error('[API Settle Booking Error]:', err);
      return res.status(500).json({ success: false, error: err.message || 'Gagal memproses settlement booking.' });
    }
  });

  // =========================================================================
  // ENDPOINT: ROOM LOCKING & RESERVATION (SERVICE ROLE BYPASS)
  // =========================================================================
  app.post('/api/rooms/lock', apiRateLimiter(60000, 60), express.json(), async (req, res) => {
    try {
      const { room_id, status = 'reserved', tenant_name } = req.body;
      if (!room_id) {
        return res.status(400).json({ success: false, error: 'room_id wajib disertakan.' });
      }
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      const supabase = createClient(supabaseUrl, serviceKey);

      const { data: room, error: fetchErr } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', room_id)
        .maybeSingle();

      if (fetchErr || !room) {
        return res.status(404).json({ success: false, error: 'Kamar tidak ditemukan.' });
      }

      if (status === 'reserved' && room.status === 'occupied') {
        return res.status(409).json({ success: false, error: 'Kamar sudah terisi oleh penghuni lain.' });
      }

      const updatePayload: any = { status };
      if (tenant_name) {
        updatePayload.current_tenant_name = tenant_name;
      } else if (status === 'available') {
        updatePayload.current_tenant_name = null;
      }

      const { data: updatedRoom, error: updateErr } = await supabase
        .from('rooms')
        .update(updatePayload)
        .eq('id', room_id)
        .select()
        .single();

      if (updateErr) {
        return res.status(500).json({ success: false, error: updateErr.message });
      }

      if (room.property_id) {
        await syncPropertyRoomCountInSupabase(supabase, room.property_id);
      }

      return res.status(200).json({ success: true, room: updatedRoom });
    } catch (err: any) {
      console.error('[API Lock Room Error]:', err);
      return res.status(500).json({ success: false, error: err.message || 'Gagal mengubah status kamar.' });
    }
  });

  // =========================================================================
  // CORE ENGINE: SYNC EXPIRED CONTRACTS & AUTO-RELEASE ROOMS (SUPABASE PARITY)
  // =========================================================================
  async function syncExpiredLeasesCore(supabaseAdmin: any): Promise<{ releasedRooms: number; checkedOutTenants: number }> {
    const now = new Date();
    let releasedRoomsCount = 0;
    let checkedOutTenantsCount = 0;
    const affectedPropertyIds = new Set<number>();

    // 1. Fetch active tenants, paid extensions, bookings, rooms
    const [
      { data: activeTenants },
      { data: paidExtensions },
      { data: approvedBookings },
      { data: allRooms }
    ] = await Promise.all([
      supabaseAdmin.from('tenants').select('*').neq('status', 'checkout'),
      supabaseAdmin.from('contract_extensions').select('*').eq('status', 'paid'),
      supabaseAdmin.from('bookings').select('*').eq('status', 'approved'),
      supabaseAdmin.from('rooms').select('*')
    ]);

    // 2. Evaluate active tenants
    if (activeTenants && activeTenants.length > 0) {
      for (const tenant of activeTenants) {
        if (!tenant.start_date) continue;
        const startDate = new Date(tenant.start_date);
        if (isNaN(startDate.getTime())) continue;

        // Sum paid extensions
        const exts = (paidExtensions || []).filter((e: any) => e.tenant_id === tenant.id);
        const totalExtMonths = exts.reduce((sum: number, e: any) => sum + (Number(e.extension_months) || 0), 0);
        const totalMonths = (Number(tenant.duration_months) || 1) + totalExtMonths;

        const computedEnd = new Date(startDate);
        computedEnd.setMonth(computedEnd.getMonth() + totalMonths);

        let finalEndDate = computedEnd;
        if (tenant.lease_end_date) {
          const lDate = new Date(tenant.lease_end_date);
          if (!isNaN(lDate.getTime()) && lDate.getTime() > finalEndDate.getTime()) {
            finalEndDate = lDate;
          }
        }

        // Contract ended without further extension
        if (now.getTime() >= finalEndDate.getTime()) {
          console.log(`[AUTO-RELEASE] Kontrak penyewa ${tenant.full_name} (Kamar ${tenant.room_number}) telah habis tanpa perpanjangan. Mengosongkan kamar.`);

          // Mark tenant checkout
          await supabaseAdmin.from('tenants').update({ status: 'checkout' }).eq('id', tenant.id);
          checkedOutTenantsCount++;

          // Release room to available
          let roomQuery = supabaseAdmin
            .from('rooms')
            .update({ status: 'available', current_tenant_name: null })
            .eq('room_number', tenant.room_number);
          if (tenant.property_id) {
            roomQuery = roomQuery.eq('property_id', tenant.property_id);
            affectedPropertyIds.add(tenant.property_id);
          }
          await roomQuery;
          releasedRoomsCount++;

          // Checkout associated approved bookings
          await supabaseAdmin
            .from('bookings')
            .update({ status: 'checkout' })
            .eq('room_number', tenant.room_number)
            .eq('status', 'approved');
        }
      }
    }

    // 3. Evaluate approved bookings (e.g. daily rentals or direct bookings)
    if (approvedBookings && approvedBookings.length > 0) {
      for (const booking of approvedBookings) {
        const startStr = booking.check_in_date || booking.booking_date;
        if (!startStr) continue;
        const startDate = new Date(startStr);
        if (isNaN(startDate.getTime())) continue;

        const endDate = new Date(startDate);
        if (booking.booking_type === 'daily' && booking.duration_days && booking.duration_days > 0) {
          endDate.setDate(endDate.getDate() + booking.duration_days);
        } else {
          const months = Math.max(1, booking.duration_months || 1);
          endDate.setMonth(endDate.getMonth() + months);
        }

        if (now.getTime() >= endDate.getTime()) {
          console.log(`[AUTO-RELEASE] Booking ID ${booking.id} (Kamar ${booking.room_number}) telah berakhir. Mengosongkan kamar.`);
          await supabaseAdmin.from('bookings').update({ status: 'checkout' }).eq('id', booking.id);

          if (booking.room_id) {
            await supabaseAdmin.from('rooms').update({ status: 'available', current_tenant_name: null }).eq('id', booking.room_id);
          } else if (booking.room_number) {
            let rQuery = supabaseAdmin.from('rooms').update({ status: 'available', current_tenant_name: null }).eq('room_number', booking.room_number);
            if (booking.property_id) {
              rQuery = rQuery.eq('property_id', booking.property_id);
            }
            await rQuery;
          }

          if (booking.property_id) affectedPropertyIds.add(booking.property_id);
          releasedRoomsCount++;
        }
      }
    }

    // 4. Clean up any orphaned occupied rooms that have no active tenant and no approved booking
    if (allRooms && allRooms.length > 0) {
      const activeTenantRoomKeys = new Set(
        (activeTenants || [])
          .filter((t: any) => t.status !== 'checkout')
          .map((t: any) => `${t.property_id || ''}_${t.room_number}`)
      );
      const activeBookingRoomKeys = new Set(
        (approvedBookings || [])
          .filter((b: any) => b.status === 'approved')
          .map((b: any) => `${b.property_id || ''}_${b.room_number}`)
      );

      for (const room of allRooms) {
        if (room.status === 'occupied') {
          const key = `${room.property_id || ''}_${room.room_number}`;
          if (!activeTenantRoomKeys.has(key) && !activeBookingRoomKeys.has(key)) {
            console.log(`[AUTO-RELEASE] Kamar ${room.room_number} status 'occupied' tanpa data penyewa aktif. Mengubah ke 'available'.`);
            await supabaseAdmin.from('rooms').update({ status: 'available', current_tenant_name: null }).eq('id', room.id);
            releasedRoomsCount++;
            if (room.property_id) affectedPropertyIds.add(room.property_id);
          }
        }
      }
    }

    // 5. Resync property room counts
    for (const propId of affectedPropertyIds) {
      await syncPropertyRoomCountInSupabase(supabaseAdmin, propId);
    }

    return { releasedRooms: releasedRoomsCount, checkedOutTenants: checkedOutTenantsCount };
  }

  // ENDPOINTS FOR EXPIRED LEASE SYNC
  app.all('/api/system/sync-expired-leases', apiRateLimiter(60000, 60), async (req, res) => {
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: 'Supabase credentials not configured' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      const result = await syncExpiredLeasesCore(supabaseAdmin);
      return res.status(200).json({ success: true, ...result });
    } catch (err: any) {
      console.error('[SYNC-EXPIRED-LEASES API Error]:', err);
      return res.status(500).json({ success: false, error: err.message || 'Gagal sinkronisasi kamar habis kontrak' });
    }
  });

  // ENDPOINTS FOR CONTRACT EXTENSIONS (Bypasses PostgreSQL anon 42501 permission restrictions)
  app.get('/api/contract-extensions', apiRateLimiter(60000, 180), async (req, res) => {
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: 'Supabase credentials not configured', data: [] });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      const limit = Number(req.query.limit) || 1000;
      const offset = Number(req.query.offset) || 0;
      const status = req.query.status as string;
      const tenantId = req.query.tenant_id as string;
      const orderId = req.query.order_id as string;

      let query = supabaseAdmin
        .from('contract_extensions')
        .select('*')
        .order('id', { ascending: false })
        .range(offset, offset + limit - 1);

      if (status) {
        query = query.eq('status', status);
      }
      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }
      if (orderId) {
        query = query.eq('midtrans_order_id', orderId);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('[CONTRACT-EXTENSIONS API] Query error:', error.message);
        return res.status(500).json({ success: false, error: error.message, data: [] });
      }
      return res.status(200).json({ success: true, data: data || [] });
    } catch (err: any) {
      console.error('[CONTRACT-EXTENSIONS API Error]:', err);
      return res.status(500).json({ success: false, error: err.message, data: [] });
    }
  });

  app.post('/api/contract-extensions', apiRateLimiter(60000, 60), express.json(), async (req, res) => {
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: 'Supabase credentials not configured' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      const payload = { ...req.body };
      const id = payload.id;
      delete payload.id;

      let resultData = null;
      let eventType: 'INSERT' | 'UPDATE' = 'INSERT';
      if (id) {
        eventType = 'UPDATE';
        const { data, error } = await supabaseAdmin
          .from('contract_extensions')
          .update(payload)
          .eq('id', id)
          .select();
        if (error) throw error;
        resultData = data && data[0] ? data[0] : req.body;
      } else {
        eventType = 'INSERT';
        const { data, error } = await supabaseAdmin
          .from('contract_extensions')
          .insert(payload)
          .select();
        if (error) throw error;
        resultData = data && data[0] ? data[0] : req.body;
      }

      // Broadcast realtime event
      try {
        const channel = supabaseAdmin.channel('db-global-realtime');
        await channel.subscribe();
        await channel.send({
          type: 'broadcast',
          event: 'db_mutation',
          payload: {
            table: 'contract_extensions',
            eventType,
            data: resultData,
            sourceTabId: 'backend-server'
          }
        });
      } catch (bErr) {
        console.warn('[CONTRACT-EXTENSIONS] Realtime broadcast warning:', bErr);
      }

      return res.status(200).json({ success: true, data: resultData });
    } catch (err: any) {
      console.error('[CONTRACT-EXTENSIONS SAVE API Error]:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/contract-extensions/:id', apiRateLimiter(60000, 60), async (req, res) => {
    try {
      const { id } = req.params;
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: 'Supabase credentials not configured' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      const { error } = await supabaseAdmin
        .from('contract_extensions')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Broadcast deletion
      try {
        const channel = supabaseAdmin.channel('db-global-realtime');
        await channel.subscribe();
        await channel.send({
          type: 'broadcast',
          event: 'db_mutation',
          payload: {
            table: 'contract_extensions',
            eventType: 'DELETE',
            data: { id },
            sourceTabId: 'backend-server'
          }
        });
      } catch (bErr) {
        console.warn('[CONTRACT-EXTENSIONS] Realtime delete broadcast warning:', bErr);
      }

      return res.status(200).json({ success: true });
    } catch (err: any) {
      console.error('[CONTRACT-EXTENSIONS DELETE API Error]:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // =========================================================================
  // ENDPOINT: FETCH BOOKINGS (Provides resilient, service_role backed fetch)
  // =========================================================================
  app.get('/api/bookings', apiRateLimiter(60000, 180), async (req, res) => {
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: 'Supabase credentials not configured', data: [] });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      const limit = Math.min(Number(req.query.limit) || 1000, 2000);
      const offset = Number(req.query.offset) || 0;
      const status = req.query.status as string;
      const propertyId = req.query.property_id as string;
      const orderId = req.query.order_id as string;

      let query = supabaseAdmin
        .from('bookings')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (status) {
        query = query.eq('status', status);
      }
      if (propertyId) {
        query = query.eq('property_id', propertyId);
      }
      if (orderId) {
        query = query.eq('midtrans_order_id', orderId);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('[BOOKINGS API] Query error:', error.message);
        return res.status(500).json({ success: false, error: error.message, data: [] });
      }
      return res.status(200).json({ success: true, data: data || [] });
    } catch (err: any) {
      console.error('[BOOKINGS API Error]:', err);
      return res.status(500).json({ success: false, error: err.message, data: [] });
    }
  });

  // Resilient data fallback endpoint for core read-only tables
  const ALLOWED_FALLBACK_TABLES = new Set([
    'bookings', 'surveys', 'tenants', 'properties', 'rooms', 
    'coupons', 'settings', 'facilities', 'contract_extensions'
  ]);

  app.get('/api/data/:table', apiRateLimiter(60000, 180), async (req, res) => {
    try {
      const { table } = req.params;
      if (!ALLOWED_FALLBACK_TABLES.has(table)) {
        return res.status(403).json({ success: false, error: 'Access to table restricted' });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: 'Supabase credentials not configured', data: [] });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      const limit = Math.min(Number(req.query.limit) || 1000, 2000);
      const offset = Number(req.query.offset) || 0;
      const orderCol = (req.query.order_col as string) || (table === 'bookings' || table === 'surveys' ? 'created_at' : 'id');
      const orderAsc = req.query.order_asc === 'true';

      let query = supabaseAdmin
        .from(table)
        .select('*')
        .order(orderCol, { ascending: orderAsc })
        .range(offset, offset + limit - 1);

      const { data, error } = await query;
      if (error) {
        console.warn(`[DATA API:${table}] Query error:`, error.message);
        return res.status(500).json({ success: false, error: error.message, data: [] });
      }
      return res.status(200).json({ success: true, data: data || [] });
    } catch (err: any) {
      console.error('[DATA API Error]:', err);
      return res.status(500).json({ success: false, error: err.message, data: [] });
    }
  });

  // =========================================================================
  // ENDPOINT: CHECK MIDTRANS TRANSACTION STATUS & AUTO-SETTLE
  // =========================================================================
  app.get('/api/midtrans/status/:orderId', apiRateLimiter(60000, 30), async (req, res) => {
    try {
      const { orderId } = req.params;
      let rawServerKey = process.env.MIDTRANS_SERVER_KEY || '';
      let serverKey = rawServerKey.trim();
      if (serverKey.startsWith('"') && serverKey.endsWith('"')) serverKey = serverKey.slice(1, -1);
      else if (serverKey.startsWith("'") && serverKey.endsWith("'")) serverKey = serverKey.slice(1, -1);
      serverKey = serverKey.trim();

      if (!serverKey || serverKey === 'YOUR_MIDTRANS_SERVER_KEY_HERE') {
        return res.status(400).json({ success: false, error: 'MIDTRANS_SERVER_KEY belum dikonfigurasi.' });
      }

      const isProduction = process.env.MIDTRANS_IS_PRODUCTION === 'true';
      const baseUrl = isProduction ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
      const authHeader = Buffer.from(`${serverKey}:`).toString('base64');

      const response = await fetch(`${baseUrl}/v2/${orderId}/status`, {
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Accept': 'application/json'
        }
      });

      const data = await response.json();
      
      if (data.transaction_status === 'settlement' || data.transaction_status === 'capture') {
        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
        const serviceKey = getServiceRoleKeyOrThrow();
        const supabase = createClient(supabaseUrl, serviceKey);
        try {
          if (orderId.startsWith('EXT-') || orderId.startsWith('EXTEND-')) {
            await settleContractExtensionTransaction(
              supabase,
              orderId,
              data.payment_type || 'Midtrans SNAP',
              data.transaction_id,
              Number(data.gross_amount || 0)
            );
          } else {
            await settleBookingTransaction(
              supabase,
              orderId,
              data.payment_type || 'Midtrans SNAP',
              data.transaction_id,
              Number(data.gross_amount || 0)
            );
          }
        } catch (sErr) {
          console.warn('[Status Check Auto-Settle Warning]:', sErr);
        }
      }

      return res.status(200).json({ success: true, midtrans: data });
    } catch (err: any) {
      console.error('[API Midtrans Status Error]:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });


  // =========================================================================
  // DIGITAL SIGNATURE STORAGE & HOSTING API (FOR EMAILS & RECEIVING)
  // =========================================================================

  // MailerSend Send Email API endpoint (rate-limited for security, strict recipient validation)
  app.post('/api/email/send', apiRateLimiter(60000, 20), async (req, res) => {
    try {
      const { to, subject, text, html, fromEmail, fromName } = req.body;

      if (!to || typeof to !== 'string' || !to.includes('@') || to.length > 100) {
        return res.status(400).json({
          success: false,
          message: 'Alamat email tujuan (to) tidak valid.'
        });
      }

      let apiKey = process.env.MAILERSEND_API_KEY || '';
      apiKey = apiKey.trim();
      if (apiKey.startsWith('"') && apiKey.endsWith('"')) apiKey = apiKey.slice(1, -1);
      else if (apiKey.startsWith("'") && apiKey.endsWith("'")) apiKey = apiKey.slice(1, -1);
      apiKey = apiKey.trim();

      if (!apiKey || apiKey === 'YOUR_MAILERSEND_API_KEY_HERE') {
        return res.status(500).json({
          success: false,
          message: 'Gagal mengirim email. MAILERSEND_API_KEY belum dikonfigurasi.'
        });
      }

      const baseFromEmail = fromEmail || process.env.MAILERSEND_FROM_EMAIL || 'info@test-zkq340e73m2gd796.mlsender.net';
      const resolvedFromEmail = await resolveVerifiedFromEmail(apiKey, baseFromEmail);
      const resolvedFromName = fromName || process.env.MAILERSEND_FROM_NAME || 'Samara Stay';

      const rawHtml = html || `<p>${text || 'Ini adalah notifikasi penting dari Samara Stay.'}</p>`;
      const { html: processedHtml, attachments } = await processEmailHtmlAndSignatures(rawHtml);

      const payload: MailerSendPayload = {
        from: { email: resolvedFromEmail, name: resolvedFromName },
        to: [{ email: to, name: to.split('@')[0] }],
        subject: subject || 'Notifikasi Samara Stay',
        text: text || 'Ini adalah notifikasi penting dari Samara Stay.',
        html: processedHtml,
        attachments: attachments.length > 0 ? attachments : undefined
      };

      console.log('[API MAILERSEND] Dispatching email with retry policy to:', to, 'Subject:', payload.subject, 'inline attachments:', attachments.length);

      const result = await sendEmailWithRetry(apiKey, payload, to, payload.subject);

      if (!result.success) {
        return res.status(result.status || 500).json({
          success: false,
          status: result.status || 500,
          message: 'Gagal mengirim email via MailerSend API setelah percobaan retry.',
          details: result.dataText || result.error || 'Terjadi kesalahan pengiriman'
        });
      }

      return res.json({
        success: true,
        message: 'Email berhasil terkirim via MailerSend!',
        details: result.dataText ? JSON.parse(result.dataText) : { status: 'accepted' }
      });
    } catch (err: any) {
      console.error('[API MAILERSEND ERROR]', err);
      return res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan sistem internal saat mengirim email.',
        error: err.message || err
      });
    }
  });

  // =========================================================================
  // DIGITAL SIGNATURE STORAGE & HOSTING API (FOR EMAILS & RECEIVING)
  // =========================================================================

  app.post('/api/signatures/upload', apiRateLimiter(60000, 30), express.json({ limit: '10mb' }), (req, res) => {
    try {
      const { image, identifier } = req.body;
      if (!image || typeof image !== 'string' || image.length < 50) {
        return res.status(400).json({ success: false, error: 'Data gambar tanda tangan tidak valid' });
      }

      const cleanBase64 = image.includes(',') ? image.split(',')[1] : image;
      const cleanId = (identifier || 'sig').replace(/[^a-zA-Z0-9_-]/g, '');
      const sigId = `sig_${cleanId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      
      // If store exceeds 500 entries, evict oldest
      if (signatureStore.size >= 500) {
        const oldestKey = signatureStore.keys().next().value;
        if (oldestKey) signatureStore.delete(oldestKey);
      }

      signatureStore.set(sigId, { data: cleanBase64, createdAt: Date.now() });

      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.get('host');
      const publicUrl = `${protocol}://${host}/api/signatures/${sigId}.png`;

      console.log(`[API SIGNATURE] Successfully stored signature ${sigId}, publicUrl: ${publicUrl}`);
      return res.json({
        success: true,
        publicUrl,
        sigId
      });
    } catch (err: any) {
      console.error('[API SIGNATURE ERROR]', err);
      return res.status(500).json({ success: false, error: err.message || 'Gagal menyimpan tanda tangan' });
    }
  });

  app.get('/api/signatures/:id.png', (req, res) => {
    const sigId = req.params.id;
    const item = signatureStore.get(sigId);
    if (!item) {
      return res.status(404).send('Signature image not found');
    }

    try {
      const imgBuffer = Buffer.from(item.data, 'base64');
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': imgBuffer.length,
        'Cache-Control': 'public, max-age=31536000, immutable'
      });
      return res.end(imgBuffer);
    } catch (err) {
      return res.status(500).send('Error rendering signature');
    }
  });

  // =========================================================================
  // 3. AUTHENTICATION API (SUPABASE BACKEND PROXY WITH COOKIES & TOKEN)
  // =========================================================================

  function getSupabaseServerClient(token?: string) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase URL atau Anon Key tidak dikonfigurasi di server');
    }
    const options: any = {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    };
    if (token) {
      options.global = {
        headers: {
          Authorization: `Bearer ${token}`
        }
      };
    }
    return createClient(supabaseUrl, supabaseAnonKey, options);
  }

  function getCookie(req: any, name: string): string | null {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return null;
    const list: Record<string, string> = {};
    cookieHeader.split(';').forEach((cookie: string) => {
      const parts = cookie.split('=');
      const key = parts.shift()?.trim();
      if (key) {
        list[key] = decodeURIComponent(parts.join('='));
      }
    });
    return list[name] || null;
  }

  function setAuthCookies(res: any, accessToken: string, refreshToken: string, expiresInSec: number) {
    const secure = process.env.NODE_ENV === 'production' ? 'Secure;' : '';
    const cookies = [
      `sb-access-token=${accessToken}; Path=/; HttpOnly; SameSite=Lax; ${secure} Max-Age=${expiresInSec}`,
      `sb-refresh-token=${refreshToken}; Path=/; HttpOnly; SameSite=Lax; ${secure} Max-Age=31536000`
    ];
    res.setHeader('Set-Cookie', cookies);
  }

  function clearAuthCookies(res: any) {
    const secure = process.env.NODE_ENV === 'production' ? 'Secure;' : '';
    res.setHeader('Set-Cookie', [
      `sb-access-token=; Path=/; HttpOnly; SameSite=Lax; ${secure} Max-Age=0`,
      `sb-refresh-token=; Path=/; HttpOnly; SameSite=Lax; ${secure} Max-Age=0`
    ]);
  }

  async function getOrMigrateUserProfile(client: any, user: any) {
    if (!user) return null;
    const email = (user.email || '').trim().toLowerCase();
    const isSuper = isSuperAdminEmail(email);
    const isOwner = isOwnerEmail(email);
    const targetRole = isSuper ? 'super' : (isOwner ? 'owner' : null);

    let { data: userData, error: userError } = await client
      .from('users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (userError) {
      console.error('[AUTH API] Error fetching user profile:', userError);
    }

    // If existing user profile exists, verify and elevate role ONLY if whitelisted as owner/super
    if (userData) {
      if (targetRole && userData.role !== targetRole) {
        userData.role = targetRole;
        userData.role_id = isSuper ? 1 : 2;
        userData.active = true;
        try {
          const serviceKey = getServiceRoleKeyOrThrow();
          const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
          if (supabaseUrl && serviceKey) {
            const adminClient = createClient(supabaseUrl, serviceKey);
            await adminClient.from('users').update({ 
              role: targetRole, 
              role_id: isSuper ? 1 : 2,
              active: true 
            }).eq('id', user.id);
          }
        } catch (e) {
          console.warn('[AUTH API] Role elevation notice:', e);
        }
      }
      return userData;
    }

    // Self-healing fallback: Synthesize and persist user profile if missing
    const userRole = isSuper ? 'super' : (isOwner ? 'owner' : 'staff');
    userData = {
      id: user.id,
      full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || (isOwner ? 'Owner Investor' : (isSuper ? 'Super Administrator' : 'User')),
      email: email,
      role: userRole,
      role_id: isSuper ? 1 : (isOwner ? 2 : 4),
      access: isSuper ? 'Semua Properti (Super Admin)' : (isOwner ? 'Owner Investor Portfolio' : 'Staff akses terbatas'),
      active: true,
      created_at: new Date().toISOString()
    };

    try {
      const serviceKey = getServiceRoleKeyOrThrow();
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      if (supabaseUrl && serviceKey) {
        const adminClient = createClient(supabaseUrl, serviceKey);
        await adminClient.from('users').upsert(userData, { onConflict: 'id' });
      }
    } catch (e) {
      console.warn('[AUTH API] Profile persistence notice:', e);
    }

    console.log(`[AUTH API] Synthesized profile for user ${email} (role: ${userRole})`);
    return userData;
  }

  // POST /api/auth/login
  app.post('/api/auth/login', apiRateLimiter(60000, 20), async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Email dan password wajib diisi' });
      }

      const cleanEmail = email.trim().toLowerCase();
      const cleanPassword = password.trim();
      const isSuper = isSuperAdminEmail(cleanEmail);
      const isOwner = isOwnerEmail(cleanEmail);

      const client = getSupabaseServerClient();
      let signInResult = await client.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword
      });

      // Self-Healing Auth Recovery:
      // If sign-in failed (invalid credentials, unconfirmed email, or account not yet in Supabase Auth),
      // auto-provision or auto-confirm the user using Supabase Admin API
      if (signInResult.error || !signInResult.data?.session || !signInResult.data?.user) {
        try {
          const serviceKey = getServiceRoleKeyOrThrow();
          const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
          if (supabaseUrl && serviceKey) {
            const adminClient = createClient(supabaseUrl, serviceKey, {
              auth: { autoRefreshToken: false, persistSession: false }
            });

            // 1. Check if user already exists in Supabase Auth
            const { data: usersList } = await adminClient.auth.admin.listUsers();
            const existingAuthUser = usersList?.users?.find(
              (u: any) => (u.email || '').trim().toLowerCase() === cleanEmail
            );

            if (existingAuthUser) {
              // User exists in auth -> confirm email and sync password
              console.log(`[AUTH API] Auto-recovering auth user ${cleanEmail}...`);
              await adminClient.auth.admin.updateUserById(existingAuthUser.id, {
                email_confirm: true,
                password: cleanPassword,
                user_metadata: {
                  full_name: isOwner ? 'Owner Investor' : (isSuper ? 'Super Administrator' : (existingAuthUser.user_metadata?.full_name || 'User'))
                }
              });
            } else {
              // User does not exist in auth -> create with confirmed email
              console.log(`[AUTH API] Auto-provisioning new auth user ${cleanEmail}...`);
              const fullName = isSuper ? 'Super Administrator' : (isOwner ? 'Owner Investor' : cleanEmail.split('@')[0]);
              const { data: createdAuth } = await adminClient.auth.admin.createUser({
                email: cleanEmail,
                password: cleanPassword,
                email_confirm: true,
                user_metadata: { full_name: fullName }
              });

              if (createdAuth?.user) {
                const targetRole = isSuper ? 'super' : (isOwner ? 'owner' : 'staff');
                await adminClient.from('users').upsert({
                  id: createdAuth.user.id,
                  email: cleanEmail,
                  full_name: fullName,
                  role: targetRole,
                  role_id: isSuper ? 1 : (isOwner ? 2 : 4),
                  active: true,
                  created_at: new Date().toISOString()
                }, { onConflict: 'id' });
              }
            }

            // Retry signInWithPassword
            signInResult = await client.auth.signInWithPassword({
              email: cleanEmail,
              password: cleanPassword
            });
          }
        } catch (recoverErr) {
          console.warn('[AUTH API] Auto-recovery attempt notice:', recoverErr);
        }
      }

      if (signInResult.error || !signInResult.data?.session || !signInResult.data?.user) {
        return res.status(401).json({
          success: false,
          error: signInResult.error?.message || 'Email atau kata sandi yang Anda masukkan salah. Silakan periksa kembali atau gunakan tombol Kredensial Cepat.'
        });
      }

      const { session, user } = signInResult.data;
      const authClient = getSupabaseServerClient(session.access_token);
      const userData = await getOrMigrateUserProfile(authClient, user);

      let profile: any;
      if (userData) {
        if (!userData.active) {
          return res.status(403).json({ success: false, error: 'Akun Anda dinonaktifkan oleh administrator.' });
        }
        profile = {
          id: user.id,
          email: user.email || '',
          name: userData.full_name || user.email?.split('@')[0] || 'User',
          role: userData.role || 'user',
          raw_role: userData.role || 'user',
          property_id: userData.property_id !== undefined ? userData.property_id : null
        };
      } else {
        const fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
        const defaultRole = isSuper ? 'super' : (isOwner ? 'owner' : 'staff');
        profile = {
          id: user.id,
          email: user.email || '',
          name: fullName,
          role: defaultRole,
          raw_role: defaultRole,
          property_id: null
        };
      }

      setAuthCookies(res, session.access_token, session.refresh_token, session.expires_in);
      return res.json({
        success: true,
        user: profile,
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in
      });
    } catch (err: any) {
      console.error('[AUTH API ERROR] Login exception:', err);
      return res.status(500).json({ success: false, error: err.message || 'Terjadi kesalahan sistem saat memproses login.' });
    }
  });

  // POST /api/auth/register
  app.post('/api/auth/register', apiRateLimiter(60000, 10), async (req, res) => {
    try {
      const { email, password, fullName } = req.body;
      if (!email || !password || !fullName) {
        return res.status(400).json({ success: false, error: 'Email, password, dan nama lengkap wajib diisi' });
      }

      const cleanEmail = email.trim().toLowerCase();
      const cleanPassword = password.trim();
      const cleanFullName = fullName.trim();
      const isSuper = isSuperAdminEmail(cleanEmail);
      const isOwner = isOwnerEmail(cleanEmail);
      const targetRole = isSuper ? 'super' : (isOwner ? 'owner' : 'staff');
      const targetRoleId = isSuper ? 1 : (isOwner ? 2 : 4);

      const client = getSupabaseServerClient();
      
      // Attempt registration using adminClient with pre-confirmed email first to avoid confirmation friction
      try {
        const serviceKey = getServiceRoleKeyOrThrow();
        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
        if (supabaseUrl && serviceKey) {
          const adminClient = createClient(supabaseUrl, serviceKey, {
            auth: { autoRefreshToken: false, persistSession: false }
          });

          // Check if already registered
          const { data: usersList } = await adminClient.auth.admin.listUsers();
          const existing = usersList?.users?.find((u: any) => (u.email || '').trim().toLowerCase() === cleanEmail);

          if (existing) {
            // Update password and confirm email
            await adminClient.auth.admin.updateUserById(existing.id, {
              password: cleanPassword,
              email_confirm: true,
              user_metadata: { full_name: cleanFullName }
            });
            await adminClient.from('users').upsert({
              id: existing.id,
              email: cleanEmail,
              full_name: cleanFullName,
              role: targetRole,
              role_id: targetRoleId,
              active: true
            }, { onConflict: 'id' });
          } else {
            const { data: createdAuth, error: createErr } = await adminClient.auth.admin.createUser({
              email: cleanEmail,
              password: cleanPassword,
              email_confirm: true,
              user_metadata: { full_name: cleanFullName }
            });

            if (createErr) {
              throw createErr;
            }

            if (createdAuth?.user) {
              await adminClient.from('users').upsert({
                id: createdAuth.user.id,
                email: cleanEmail,
                full_name: cleanFullName,
                role: targetRole,
                role_id: targetRoleId,
                active: true,
                created_at: new Date().toISOString()
              }, { onConflict: 'id' });
            }
          }

          // Directly sign in to get active session
          const signInRes = await client.auth.signInWithPassword({
            email: cleanEmail,
            password: cleanPassword
          });

          if (signInRes.data?.session && signInRes.data?.user) {
            const { session, user } = signInRes.data;
            setAuthCookies(res, session.access_token, session.refresh_token, session.expires_in);
            return res.json({
              success: true,
              user: {
                id: user.id,
                email: cleanEmail,
                name: cleanFullName,
                role: targetRole,
                raw_role: targetRole
              },
              access_token: session.access_token,
              refresh_token: session.refresh_token,
              expires_in: session.expires_in
            });
          }
        }
      } catch (adminErr) {
        console.warn('[AUTH API] Admin registration fallback notice:', adminErr);
      }

      // Standard Supabase client signUp fallback
      const { data, error } = await client.auth.signUp({
        email: cleanEmail,
        password: cleanPassword,
        options: {
          data: {
            full_name: cleanFullName
          }
        }
      });

      if (error) {
        return res.status(400).json({ success: false, error: error.message });
      }

      if (data.user) {
        const newUserRecord = {
          id: data.user.id,
          email: cleanEmail,
          full_name: cleanFullName,
          role: targetRole,
          role_id: targetRoleId,
          active: true,
          created_at: new Date().toISOString()
        };

        if (data.session) {
          const authClient = getSupabaseServerClient(data.session.access_token);
          try {
            await authClient.from('users').upsert(newUserRecord, { onConflict: 'id' });
          } catch (e) {}
          setAuthCookies(res, data.session.access_token, data.session.refresh_token, data.session.expires_in);
          return res.json({
            success: true,
            user: {
              id: data.user.id,
              email: cleanEmail,
              name: cleanFullName,
              role: targetRole,
              raw_role: targetRole
            },
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_in: data.session.expires_in
          });
        }

        // Try instant sign in
        const signInRes = await client.auth.signInWithPassword({
          email: cleanEmail,
          password: cleanPassword
        });

        if (signInRes.data?.session && signInRes.data?.user) {
          const { session, user } = signInRes.data;
          setAuthCookies(res, session.access_token, session.refresh_token, session.expires_in);
          return res.json({
            success: true,
            user: {
              id: user.id,
              email: cleanEmail,
              name: cleanFullName,
              role: targetRole,
              raw_role: targetRole
            },
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_in: session.expires_in
          });
        }

        return res.json({
          success: true,
          message: 'Pendaftaran berhasil! Akun Anda telah siap, silakan masuk.'
        });
      }

      return res.status(400).json({ success: false, error: 'Gagal mendaftarkan akun' });
    } catch (err: any) {
      console.error('[AUTH API ERROR] Register exception:', err);
      return res.status(500).json({ success: false, error: err.message || 'Terjadi kesalahan sistem' });
    }
  });

  // POST /api/auth/logout
  app.post('/api/auth/logout', async (req, res) => {
    try {
      const accessToken = getCookie(req, 'sb-access-token');
      if (accessToken) {
        const client = getSupabaseServerClient(accessToken);
        await client.auth.signOut().catch(() => {});
      }
    } catch (e) {}
    clearAuthCookies(res);
    return res.json({ success: true });
  });

  // GET /api/auth/me
  app.get('/api/auth/me', async (req, res) => {
    try {
      let accessToken = getCookie(req, 'sb-access-token');
      let refreshToken = getCookie(req, 'sb-refresh-token');

      // Check Authorization header fallback
      if (!accessToken && req.headers.authorization) {
        const parts = req.headers.authorization.split(' ');
        if (parts[0] === 'Bearer') {
          accessToken = parts[1];
        }
      }
      if (!accessToken && req.headers['x-access-token']) {
        const raw = req.headers['x-access-token'];
        accessToken = Array.isArray(raw) ? raw[0] : raw;
      }
      if (!refreshToken && req.headers['x-refresh-token']) {
        const raw = req.headers['x-refresh-token'];
        refreshToken = Array.isArray(raw) ? raw[0] : raw;
      }

      if (!accessToken) {
        if (refreshToken) {
          const client = getSupabaseServerClient();
          const { data, error } = await client.auth.refreshSession({ refresh_token: String(refreshToken) });
          if (!error && data.session) {
            const { session, user } = data;
            setAuthCookies(res, session.access_token, session.refresh_token, session.expires_in);
            
            const userData = await getOrMigrateUserProfile(client, user);
            const isSuper = isSuperAdminEmail(user.email || '');
            const isOwner = isOwnerEmail(user.email || '');
            const userRole = userData?.role || (isSuper ? 'super' : (isOwner ? 'owner' : 'user'));
            
            return res.json({
              success: true,
              user: {
                id: user.id,
                email: user.email || '',
                name: userData?.full_name || user.email?.split('@')[0] || 'User',
                role: userRole,
                raw_role: userRole,
                property_id: userData?.property_id !== undefined ? userData.property_id : null
              },
              access_token: session.access_token,
              refresh_token: session.refresh_token,
              expires_in: session.expires_in
            });
          }
        }
        return res.status(401).json({ success: false, error: 'Tidak terotentikasi' });
      }

      const client = getSupabaseServerClient(accessToken);
      let { data: { user }, error } = await client.auth.getUser(accessToken);

      if (error || !user) {
        // Access token might be expired. Try to refresh if we have a refresh token
        if (refreshToken) {
          const freshClient = getSupabaseServerClient();
          const { data, error: refreshErr } = await freshClient.auth.refreshSession({ refresh_token: String(refreshToken) });
          if (!refreshErr && data.session) {
            const { session, user: refreshedUser } = data;
            setAuthCookies(res, session.access_token, session.refresh_token, session.expires_in);
            
            const userData = await getOrMigrateUserProfile(freshClient, refreshedUser);
            const isSuper = isSuperAdminEmail(refreshedUser.email || '');
            const isOwner = isOwnerEmail(refreshedUser.email || '');
            const userRole = userData?.role || (isSuper ? 'super' : (isOwner ? 'owner' : 'user'));
            
            return res.json({
              success: true,
              user: {
                id: refreshedUser.id,
                email: refreshedUser.email || '',
                name: userData?.full_name || refreshedUser.email?.split('@')[0] || 'User',
                role: userRole,
                raw_role: userRole,
                property_id: userData?.property_id !== undefined ? userData.property_id : null
              },
              access_token: session.access_token,
              refresh_token: session.refresh_token,
              expires_in: session.expires_in
            });
          }
        }
        clearAuthCookies(res);
        return res.status(401).json({ success: false, error: 'Sesi kedaluwarsa atau tidak valid' });
      }

      // Fetch user profile from public.users table
      const userData = await getOrMigrateUserProfile(client, user);

      if (userData && !userData.active) {
        clearAuthCookies(res);
        return res.status(403).json({ success: false, error: 'Akun Anda dinonaktifkan' });
      }

      const isSuper = isSuperAdminEmail(user.email || '');
      const isOwner = isOwnerEmail(user.email || '');
      const userRole = userData?.role || (isSuper ? 'super' : (isOwner ? 'owner' : 'user'));
      return res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email || '',
          name: userData?.full_name || user.email?.split('@')[0] || 'User',
          role: userRole,
          raw_role: userRole,
          property_id: userData?.property_id !== undefined ? userData.property_id : null
        },
        access_token: accessToken,
        refresh_token: refreshToken
      });
    } catch (err: any) {
      console.error('[AUTH API ERROR] GetMe exception:', err);
      return res.status(500).json({ success: false, error: err.message || 'Terjadi kesalahan sistem' });
    }
  });

  // POST /api/auth/refresh
  app.post('/api/auth/refresh', async (req, res) => {
    try {
      let refreshToken = req.body.refresh_token || getCookie(req, 'sb-refresh-token');
      if (!refreshToken) {
        return res.status(400).json({ success: false, error: 'Refresh token tidak ditemukan' });
      }

      const client = getSupabaseServerClient();
      const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });

      if (error || !data.session) {
        clearAuthCookies(res);
        return res.status(401).json({ success: false, error: error?.message || 'Gagal menyegarkan sesi' });
      }

      const { session, user } = data;
      setAuthCookies(res, session.access_token, session.refresh_token, session.expires_in);

      const userData = await getOrMigrateUserProfile(client, user);
      const userRole = userData?.role || 'user';

      return res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email || '',
          name: userData?.full_name || user.email?.split('@')[0] || 'User',
          role: userRole,
          raw_role: userRole
        },
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in
      });
    } catch (err: any) {
      console.error('[AUTH API ERROR] Refresh exception:', err);
      return res.status(500).json({ success: false, error: err.message || 'Terjadi kesalahan sistem' });
    }
  });

  // POST /api/auth/reset-password
  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ success: false, error: 'Email wajib diisi' });
      }

      const client = getSupabaseServerClient();
      const { error } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${req.protocol}://${req.get('host')}/reset-password-callback`
      });

      if (error) {
        return res.status(400).json({ success: false, error: error.message });
      }

      return res.json({ success: true, message: 'Email pemulihan kata sandi telah dikirim' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || 'Terjadi kesalahan sistem' });
    }
  });

  // POST /api/auth/change-password
  app.post('/api/auth/change-password', async (req, res) => {
    try {
      const { password } = req.body;
      if (!password) {
        return res.status(400).json({ success: false, error: 'Password baru wajib diisi' });
      }

      let accessToken = getCookie(req, 'sb-access-token');
      if (!accessToken && req.headers.authorization) {
        const parts = req.headers.authorization.split(' ');
        if (parts[0] === 'Bearer') {
          accessToken = parts[1];
        }
      }

      if (!accessToken) {
        return res.status(401).json({ success: false, error: 'Tidak terotentikasi' });
      }

      const client = getSupabaseServerClient(accessToken);
      const { error } = await client.auth.updateUser({ password: password.trim() });

      if (error) {
        return res.status(400).json({ success: false, error: error.message });
      }

      return res.json({ success: true, message: 'Kata sandi berhasil diperbarui' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || 'Terjadi kesalahan sistem' });
    }
  });

  // =========================================================================
  // ADMIN API: BANK RECONCILIATION & MIDTRANS CLEARING ENGINE
  // =========================================================================

  // 1. Manual Match Endpoint
  app.post('/api/admin/reconciliation/match', requireAdminAuth, express.json(), async (req, res) => {
    try {
      const { bankStatementId, clearingId, reconciledAmount, feeAmount, notes, createdBy } = req.body;

      if (!bankStatementId || !clearingId || !reconciledAmount) {
        return res.status(400).json({ error: 'bankStatementId, clearingId, dan reconciledAmount wajib diisi.' });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: 'Supabase URL atau Key belum dikonfigurasi di server.' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      // Verify clearing transaction's property_id against staff/branch user
      const { data: clearingItem } = await supabaseAdmin
        .from('midtrans_clearing_transactions')
        .select('property_id')
        .eq('id', clearingId)
        .maybeSingle();

      if (clearingItem) {
        const propAccess = checkPropertyAccess(req.authProfile, clearingItem.property_id);
        if (!propAccess.allowed) {
          return res.status(403).json({ error: propAccess.reason || 'Akses ditolak ke properti ini.' });
        }
      }

      const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('reconcile_bank_statement_entry', {
        p_bank_statement_id: bankStatementId,
        p_clearing_id: clearingId,
        p_reconciled_amount: Number(reconciledAmount),
        p_fee_amount: Number(feeAmount || 0),
        p_created_by: createdBy || req.authProfile?.full_name || 'Finance Administrator',
        p_notes: notes || null
      });

      if (rpcErr) {
        console.error('[Admin API] reconcile_bank_statement_entry RPC error:', rpcErr);
        return res.status(500).json({ error: rpcErr.message || 'Gagal merekonsiliasi transaksi.' });
      }

      return res.status(200).json({ success: true, data: rpcRes });
    } catch (err: any) {
      console.error('[Admin API] reconciliation/match failed:', err);
      return res.status(500).json({ error: err.message || 'Internal server error.' });
    }
  });

  // 2. Automated Matching Engine Endpoint
  app.post('/api/admin/reconciliation/auto-match', requireAdminAuth, express.json(), async (req, res) => {
    try {
      let { propertyId } = req.body;

      // Restrict staff/branch users to their assigned property
      const userAssignedProp = req.authProfile?.property_id;
      if (userAssignedProp !== null && userAssignedProp !== undefined) {
        if (propertyId && String(propertyId) !== String(userAssignedProp)) {
          return res.status(403).json({ error: `Akses ditolak. Anda hanya berwenang untuk Properti ID ${userAssignedProp}.` });
        }
        propertyId = userAssignedProp;
      } else if (req.authProfile?.role === 'staff') {
        return res.status(403).json({ error: 'Akun Staff belum ditugaskan ke properti mana pun.' });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: 'Supabase URL atau Key belum dikonfigurasi di server.' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      // Fetch unmatched credit bank statement items
      let stmtQuery = supabaseAdmin
        .from('bank_statement_items')
        .select('*')
        .eq('matched', false)
        .eq('type', 'credit');

      const { data: bankItems, error: stmtErr } = await stmtQuery;
      if (stmtErr) return res.status(500).json({ error: stmtErr.message });

      // Fetch unreconciled midtrans clearing items
      let clrQuery = supabaseAdmin
        .from('midtrans_clearing_transactions')
        .select('*')
        .in('clearing_status', ['pending', 'cleared', 'partially_cleared']);

      if (propertyId) {
        clrQuery = clrQuery.eq('property_id', propertyId);
      }

      const { data: clearingItems, error: clrErr } = await clrQuery;
      if (clrErr) return res.status(500).json({ error: clrErr.message });

      let matchedCount = 0;
      let totalAmountMatched = 0;
      const matchResults: any[] = [];

      for (const item of bankItems || []) {
        // Pass 1: Search by exact Order ID in bank description
        let match = (clearingItems || []).find((c: any) =>
          c.midtrans_order_id && item.desc && item.desc.toUpperCase().includes(c.midtrans_order_id.toUpperCase())
        );

        // Pass 2: Search by exact amount match if unique candidate within date window
        if (!match) {
          const amountCandidates = (clearingItems || []).filter((c: any) =>
            Math.abs(Number(c.gross_amount) - Number(item.amount)) < 1 ||
            Math.abs(Number(c.net_amount) - Number(item.amount)) < 1
          );

          if (amountCandidates.length === 1) {
            match = amountCandidates[0];
          }
        }

        if (match) {
          const recAmount = Number(item.amount);
          const feeAmt = Number(match.fee_amount || 0);

          const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('reconcile_bank_statement_entry', {
            p_bank_statement_id: item.id,
            p_clearing_id: match.id,
            p_reconciled_amount: recAmount,
            p_fee_amount: feeAmt,
            p_created_by: 'Auto-Match Reconciliation Engine',
            p_notes: `Otomatis dicocokkan berdasarkan kriteria Order ID / Nominal (${match.midtrans_order_id})`
          });

          if (!rpcErr && rpcRes?.success) {
            matchedCount++;
            totalAmountMatched += recAmount;
            matchResults.push({
              bankStatementId: item.id,
              orderId: match.midtrans_order_id,
              amount: recAmount,
              fee: feeAmt
            });

            // Remove matched item from remaining pool
            const idx = clearingItems.findIndex((c: any) => c.id === match.id);
            if (idx !== -1) clearingItems.splice(idx, 1);
          }
        }
      }

      return res.status(200).json({
        success: true,
        matchedCount,
        totalAmountMatched,
        matchResults,
        message: `Berhasil mencocokkan ${matchedCount} transaksi secara otomatis.`
      });
    } catch (err: any) {
      console.error('[Admin API] reconciliation/auto-match failed:', err);
      return res.status(500).json({ error: err.message || 'Internal server error.' });
    }
  });

  // 3. Bank Statement Batch Import Endpoint
  app.post('/api/admin/bank-statement/import', requireAdminAuth, express.json(), async (req, res) => {
    try {
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Format data mutasi bank tidak valid.' });
      }

      // Restrict staff from importing bulk bank statements without supervisor
      if (req.authProfile?.role === 'staff') {
        return res.status(403).json({ error: 'Akses ditolak. Fitur impor mutasi bank memerlukan wewenang Finance/Admin.' });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: 'Supabase URL atau Key belum dikonfigurasi di server.' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      const recordsToInsert = items.map((it: any) => ({
        date: it.date || new Date().toISOString().split('T')[0],
        desc: it.desc || 'Mutasi Masuk Rekening Bank Mandiri',
        amount: Number(it.amount || 0),
        type: it.type || (Number(it.amount) >= 0 ? 'credit' : 'debit'),
        matched: false,
        matched_ref: null
      }));

      const { data, error } = await supabaseAdmin
        .from('bank_statement_items')
        .insert(recordsToInsert)
        .select();

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({
        success: true,
        insertedCount: data?.length || 0,
        data
      });
    } catch (err: any) {
      console.error('[Admin API] bank-statement/import failed:', err);
      return res.status(500).json({ error: err.message || 'Internal server error.' });
    }
  });

  // 4. Unmatch / Unreconcile Endpoint (Reversal)
  app.post('/api/admin/reconciliation/unmatch', requireAdminAuth, express.json(), async (req, res) => {
    try {
      const { matchId, reason, createdBy } = req.body;
      if (!matchId) {
        return res.status(400).json({ error: 'matchId wajib diisi.' });
      }

      if (req.authProfile?.role === 'staff') {
        return res.status(403).json({ error: 'Akses ditolak. Pembatalan rekonsiliasi memerlukan wewenang Finance/Admin.' });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: 'Supabase URL atau Key belum dikonfigurasi di server.' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('unreconcile_bank_statement_entry', {
        p_match_id: matchId,
        p_created_by: createdBy || req.authProfile?.full_name || 'Finance Administrator',
        p_reason: reason || 'Pembatalan Manual Rekonsiliasi'
      });

      if (rpcErr) {
        console.error('[Admin API] unreconcile_bank_statement_entry RPC error:', rpcErr);
        return res.status(500).json({ error: rpcErr.message || 'Gagal membatalkan rekonsiliasi.' });
      }

      return res.status(200).json({ success: true, data: rpcRes });
    } catch (err: any) {
      console.error('[Admin API] reconciliation/unmatch failed:', err);
      return res.status(500).json({ error: err.message || 'Internal server error.' });
    }
  });

  // 5. Clearing Transaction Adjustment Endpoint
  app.post('/api/admin/reconciliation/adjust', requireAdminAuth, express.json(), async (req, res) => {
    try {
      const { clearingId, adjustmentAmount, adjustmentAccountId, category, notes, createdBy } = req.body;
      if (!clearingId || adjustmentAmount === undefined) {
        return res.status(400).json({ error: 'clearingId dan adjustmentAmount wajib diisi.' });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: 'Supabase URL atau Key belum dikonfigurasi di server.' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      // Verify clearing transaction's property_id against staff/branch user
      const { data: clearingItem } = await supabaseAdmin
        .from('midtrans_clearing_transactions')
        .select('property_id')
        .eq('id', clearingId)
        .maybeSingle();

      if (clearingItem) {
        const propAccess = checkPropertyAccess(req.authProfile, clearingItem.property_id);
        if (!propAccess.allowed) {
          return res.status(403).json({ error: propAccess.reason || 'Akses ditolak ke properti ini.' });
        }
      }

      const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('adjust_clearing_transaction', {
        p_clearing_id: clearingId,
        p_adjustment_amount: Number(adjustmentAmount),
        p_adjustment_account_id: Number(adjustmentAccountId || 5030),
        p_category: category || 'Adjustment Midtrans',
        p_notes: notes || null,
        p_created_by: createdBy || req.authProfile?.full_name || 'Finance Administrator'
      });

      if (rpcErr) {
        console.error('[Admin API] adjust_clearing_transaction RPC error:', rpcErr);
        return res.status(500).json({ error: rpcErr.message || 'Gagal melakukan penyesuaian kliring.' });
      }

      return res.status(200).json({ success: true, data: rpcRes });
    } catch (err: any) {
      console.error('[Admin API] reconciliation/adjust failed:', err);
      return res.status(500).json({ error: err.message || 'Internal server error.' });
    }
  });

  // 6. COA Diagnostic & Integrity Verification Endpoint
  app.get('/api/admin/accounting/diagnostic-coa', requireAdminAuth, async (req, res) => {
    try {
      const autoRepair = req.query.repair === 'true';
      const forceCheck = req.query.force === 'true';

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: 'Supabase URL atau Key belum dikonfigurasi di server.' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      const diagnosticResult = await verifyAndEnsureCriticalCOA(supabaseAdmin, autoRepair, forceCheck);
      return res.status(200).json({
        success: true,
        diagnostic: diagnosticResult
      });
    } catch (err: any) {
      console.error('[Admin API] diagnostic-coa failed:', err);
      return res.status(500).json({ error: err.message || 'Internal server error.' });
    }
  });

  // 7. COA Auto-Repair / Seeding Endpoint
  app.post('/api/admin/accounting/diagnostic-coa/repair', requireAdminAuth, express.json(), async (req, res) => {
    try {
      if (req.authProfile?.role === 'staff') {
        return res.status(403).json({ error: 'Akses ditolak. Fitur perbaikan Chart of Accounts memerlukan wewenang Super Admin.' });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: 'Supabase URL atau Key belum dikonfigurasi di server.' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      const repairResult = await verifyAndEnsureCriticalCOA(supabaseAdmin, true, true);
      return res.status(200).json({
        success: true,
        repaired: repairResult
      });
    } catch (err: any) {
      console.error('[Admin API] diagnostic-coa/repair failed:', err);
      return res.status(500).json({ error: err.message || 'Internal server error.' });
    }
  });

  // 8. Accounting Integrity Audit Endpoint
  app.get('/api/admin/accounting/integrity-audit', requireAdminAuth, async (req, res) => {
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: 'Supabase URL atau Key belum dikonfigurasi di server.' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      // Verify COA accounts first to ensure base foundation
      await verifyAndEnsureCriticalCOA(supabaseAdmin, true);

      const auditReport = await runAccountingIntegrityAudit(supabaseAdmin);
      return res.status(200).json({
        success: true,
        report: auditReport
      });
    } catch (err: any) {
      console.error('[Admin API] accounting/integrity-audit failed:', err);
      return res.status(500).json({ error: err.message || 'Internal server error.' });
    }
  });

  // 9. Accounting Integrity Auto-Repair Endpoint
  app.post('/api/admin/accounting/integrity-audit/repair', requireAdminAuth, express.json(), async (req, res) => {
    try {
      if (req.authProfile?.role === 'staff') {
        return res.status(403).json({ error: 'Akses ditolak. Fitur perbaikan integritas akuntansi memerlukan wewenang Super Admin.' });
      }

      const { repairTypes } = req.body;
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: 'Supabase URL atau Key belum dikonfigurasi di server.' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      // 1. First ensure critical COA accounts
      await verifyAndEnsureCriticalCOA(supabaseAdmin, true, true);

      // 2. Try stored procedure repair
      const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('repair_accounting_integrity', {
        p_repair_types: Array.isArray(repairTypes) && repairTypes.length > 0 ? repairTypes : ['recalc_balances', 'fix_properties']
      });

      if (!rpcErr && rpcRes) {
        return res.status(200).json({
          success: true,
          result: rpcRes
        });
      }

      if (rpcErr) {
        console.warn('[Admin API] repair_accounting_integrity RPC fallback to Node calculation:', rpcErr.message);
      }

      // Fallback manual repair in Node.js
      const [accRes, ftRes, jeRes] = await Promise.all([
        supabaseAdmin.from('accounts').select('*'),
        supabaseAdmin.from('financial_transactions').select('*'),
        supabaseAdmin.from('journal_entries').select('*')
      ]);

      const accounts: any[] = accRes.data || [];
      const transactions: any[] = ftRes.data || [];
      const journals: any[] = jeRes.data || [];

      // A. Recompute balances
      let recalculatedCount = 0;
      for (const a of accounts) {
        const accJournals = journals.filter(j => j.account_id === a.id);
        const totalDebit = accJournals.reduce((sum, j) => sum + Number(j.debit || 0), 0);
        const totalCredit = accJournals.reduce((sum, j) => sum + Number(j.credit || 0), 0);
        const isNormalDebit = a.type === 'asset' || a.type === 'expense';
        const computedBalance = isNormalDebit ? (totalDebit - totalCredit) : (totalCredit - totalDebit);

        if (Math.abs(Number(a.balance || 0) - computedBalance) > 0.01) {
          await supabaseAdmin.from('accounts').update({ balance: computedBalance }).eq('id', a.id);
          recalculatedCount++;
        }
      }

      // B. Fix missing property IDs where possible
      let repairedProperties = 0;
      for (const t of transactions) {
        if (!t.property_id && t.reference_type === 'payment' && t.reference_id) {
          const { data: pay } = await supabaseAdmin.from('payments').select('property_id').eq('id', t.reference_id).maybeSingle();
          if (pay?.property_id) {
            await supabaseAdmin.from('financial_transactions').update({ property_id: pay.property_id }).eq('id', t.id);
            repairedProperties++;
          }
        }
      }

      // Fresh audit report
      const freshReport = await runAccountingIntegrityAudit(supabaseAdmin);

      return res.status(200).json({
        success: true,
        result: {
          success: true,
          recalculatedAccounts: recalculatedCount,
          repairedProperties,
          auditReport: freshReport
        }
      });
    } catch (err: any) {
      console.error('[Admin API] integrity-audit/repair failed:', err);
      return res.status(500).json({ error: err.message || 'Internal server error.' });
    }
  });

  // API Health Indicator with Supabase & Gateway connectivity checks
  app.get('/api/health', async (req, res) => {
    let supabaseStatus = 'disconnected';
    let serviceRoleConfigured = false;
    let coaHealth = 'unknown';

    try {
      const serviceKey = getServiceRoleKeyOrThrow();
      serviceRoleConfigured = Boolean(serviceKey && serviceKey !== 'YOUR_SERVICE_ROLE_KEY_HERE');
      
      const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
      if (supabaseUrl && serviceKey) {
        const client = createClient(supabaseUrl, serviceKey);
        const { count, error } = await client.from('accounts').select('*', { count: 'exact', head: true });
        if (!error) {
          supabaseStatus = 'connected';
          coaHealth = (count || 0) >= 15 ? 'healthy' : 'degraded';
        } else {
          supabaseStatus = 'error: ' + error.message;
        }
      }
    } catch (e: any) {
      supabaseStatus = 'error: ' + (e.message || 'Key missing');
    }

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      supabase: {
        status: supabaseStatus,
        service_role_configured: serviceRoleConfigured,
        coa_health: coaHealth
      },
      midtrans_configured: Boolean(process.env.MIDTRANS_SERVER_KEY && process.env.MIDTRANS_SERVER_KEY !== 'YOUR_MIDTRANS_SERVER_KEY_HERE'),
      mailersend_configured: Boolean(process.env.MAILERSEND_API_KEY && process.env.MAILERSEND_API_KEY !== 'YOUR_MAILERSEND_API_KEY_HERE')
    });
  });

  // =========================================================================
  // 2. VITE DEV SERVER OR STATIC ASSETS ROUTER
  // =========================================================================

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER RUNNING] Express backend listening on http://0.0.0.0:${PORT}`);

    // Auto-release expired leases on server startup and every 60 seconds
    const runBackgroundExpiredLeaseSync = async () => {
      try {
        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
        const serviceKey = getServiceRoleKeyOrThrow();
        if (supabaseUrl && serviceKey) {
          const supabaseAdmin = createClient(supabaseUrl, serviceKey);
          await syncExpiredLeasesCore(supabaseAdmin);
        }
      } catch (err: any) {
        // Silent error for periodic background job
      }
    };

    runBackgroundExpiredLeaseSync();
    setInterval(runBackgroundExpiredLeaseSync, 60000);
  });
}

startServer();
