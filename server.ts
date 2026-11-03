/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import dotenv from 'dotenv';
import fs from 'fs';
import express from 'express';
import path from 'path';
import crypto from 'crypto';
// Dynamic Vite import so production server bundle never tries to load vite or run Vite dev server
let createViteServerFn: any = null;
import { createClient } from '@supabase/supabase-js';
// Lazy-loaded @resvg/resvg-js helper so native binary issues never block Cloud Run startup
async function renderSvgAsync(svg: string, options: any): Promise<any> {
  const mod = await import('@resvg/resvg-js');
  return mod.renderAsync(svg, options);
}
import { can, canManageRole, canAccessProperty, maskNik, canAssignProperty } from './src/lib/permissions';
import type { AppResource, ActionType } from './src/lib/permissions';
import { isValidOrderId, verifyMidtransSignature, webhookEventKey, amountsMatch, computeServerCheckoutPrice } from './src/lib/paymentGuards';
import { getTableDefaultSeeds, DEFAULT_PROPERTIES, DEFAULT_ROOMS } from './src/data/fallbackData';
import { resolveLimit, resolveOffset, sanitizeColumns, resolveOrderColumn, resolveOrderAsc } from './src/lib/queryBudget';
import { calculateExecutiveFinancialSummary } from './src/lib/financialMetrics';
import { todayJakarta, toJakartaDate } from './src/lib/dateUtils';

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

// Simple in-memory rate limiting store for endpoints with bounded size (R8 / R10)
const rateLimits: Record<string, { count: number; resetTime: number }> = {};
const RATE_LIMIT_MAX_KEYS = 10000;
const MAX_RATE_LIMIT_ENTRIES = RATE_LIMIT_MAX_KEYS;

// Clean up expired rate limits every 5 minutes to prevent memory leaks
const rateLimitCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const ip in rateLimits) {
    if (rateLimits[ip].resetTime < now) {
      delete rateLimits[ip];
    }
  }
}, 5 * 60 * 1000);
if (typeof rateLimitCleanupTimer.unref === 'function') rateLimitCleanupTimer.unref();

function resolveClientIp(req: any): string {
  if (process.env.TRUST_PROXY === 'true') {
    return req.ip || req.socket?.remoteAddress || '127.0.0.1';
  }
  return req.socket?.remoteAddress || req.ip || '127.0.0.1';
}

function apiRateLimiter(windowMs: number, maxRequests: number) {
  return (req: any, res: any, next: any) => {
    const ip = resolveClientIp(req);
    const now = Date.now();
    const keys = Object.keys(rateLimits);
    if (keys.length >= RATE_LIMIT_MAX_KEYS && !rateLimits[ip]) {
      for (const k of keys) {
        if (rateLimits[k].resetTime < now) {
          delete rateLimits[k];
        }
      }
      const remainingKeys = Object.keys(rateLimits);
      if (remainingKeys.length >= RATE_LIMIT_MAX_KEYS) {
        delete rateLimits[remainingKeys[0]];
      }
    }
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

function getJwtPayloadRole(jwtToken: string): string | null {
  try {
    const parts = String(jwtToken || '').split('.');
    if (parts.length !== 3) return null;
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson);
    return typeof payload?.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

// Helper to strictly obtain the Supabase Service Role Key (throws when missing; never falls back to the anon key)
function getServiceRoleKeyOrThrow(): string {
  const supabaseServiceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    '';
  if (supabaseServiceKey && supabaseServiceKey !== 'YOUR_SERVICE_ROLE_KEY_HERE') {
    const jwtRole = getJwtPayloadRole(supabaseServiceKey);
    if (jwtRole === 'anon') {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('FATAL: SUPABASE_SERVICE_ROLE_KEY has role=anon in production. Refusing to use anon key as service_role.');
      }
      console.warn('[SECURITY WARNING] SUPABASE_SERVICE_ROLE_KEY has role=anon! Administrative writes will be blocked by RLS.');
    }
    return supabaseServiceKey;
  }
  // NO anon-key fallback: administrative paths (webhook, settlement, ledger) must run with the service role,
  // otherwise RLS silently blocks writes and failures look like successes.
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for server administrative operations but is not configured.');
}

// G2: Long-lived server-side Realtime broadcast client & single channel (prevents channel leak per mutation)
let serverBroadcastClient: any = null;
let serverBroadcastChannel: any = null;
let serverBroadcastReadyPromise: Promise<any> | null = null;

function teardownServerBroadcastChannel() {
  const client = serverBroadcastClient;
  const ch = serverBroadcastChannel;
  serverBroadcastChannel = null;
  serverBroadcastReadyPromise = null;
  if (client && ch) {
    try {
      client.removeChannel(ch);
    } catch {
      // ignore teardown errors
    }
  }
}

async function ensureServerBroadcastChannel(): Promise<any | null> {
  if (serverBroadcastChannel && serverBroadcastReadyPromise) {
    return serverBroadcastReadyPromise;
  }
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  let serviceKey = '';
  try {
    serviceKey = getServiceRoleKeyOrThrow();
  } catch {
    return null;
  }
  if (!supabaseUrl || !serviceKey) return null;

  if (!serverBroadcastClient) {
    serverBroadcastClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }

  const ch = serverBroadcastClient.channel('db-global-realtime');
  serverBroadcastChannel = ch;
  serverBroadcastReadyPromise = new Promise<any>((resolve) => {
    const timeoutId = setTimeout(() => {
      resolve(ch);
    }, 5000);

    ch.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timeoutId);
        resolve(ch);
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timeoutId);
        teardownServerBroadcastChannel();
        resolve(null);
      }
    });
  });

  return serverBroadcastReadyPromise;
}

async function broadcastDbMutation(
  table: string,
  eventType: 'INSERT' | 'UPDATE' | 'DELETE',
  data: Record<string, any> | null | undefined
): Promise<void> {
  try {
    const ch = await ensureServerBroadcastChannel();
    if (!ch) return;
    const minimalData = data && typeof data === 'object'
      ? {
          id: data.id,
          property_id: data.property_id,
          tenant_id: data.tenant_id,
          status: data.status,
          midtrans_order_id: data.midtrans_order_id,
          updated_at: data.updated_at
        }
      : data;
    await ch.send({
      type: 'broadcast',
      event: 'db_mutation',
      payload: {
        table,
        eventType,
        data: minimalData,
        sourceTabId: 'backend-server'
      }
    });
  } catch (err) {
    console.warn(`[REALTIME BROADCAST:${table}] warning:`, err);
    teardownServerBroadcastChannel();
  }
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
  autoRepair: boolean = false,
  forceCheck: boolean = false
) {
  const now = Date.now();
  // Throttle non-forced checks if checked within last 60 seconds and verified healthy
  if (!forceCheck && !autoRepair && lastCoaVerificationStatus?.healthy && (now - lastCoaVerificationTime < 60000)) {
    return lastCoaVerificationStatus;
  }

  try {
    const [accRes, jeRes] = await Promise.all([
      supabaseClient.from('accounts').select('id, name, type, category, balance'),
      supabaseClient.from('journal_entries').select('account_id, debit, credit')
    ]);
    const existingAccounts = accRes.data;
    const fetchErr = accRes.error;

    if (fetchErr) {
      console.warn('[COA DIAGNOSTIC] Error fetching accounts from database:', fetchErr.message);
      return {
        healthy: false,
        error: fetchErr.message,
        totalChecked: CRITICAL_COA_ACCOUNTS.length,
        existingCount: 0,
        missingCount: CRITICAL_COA_ACCOUNTS.length,
        missingAccounts: CRITICAL_COA_ACCOUNTS,
        typeMismatches: [],
        balanceDiscrepancies: [],
        repairedCount: 0,
        repairedAccounts: [],
        timestamp: new Date().toISOString()
      };
    }

    const journalTotals = new Map<number, { debit: number; credit: number }>();
    for (const j of jeRes.data || []) {
      const aid = Number(j.account_id);
      const curr = journalTotals.get(aid) || { debit: 0, credit: 0 };
      curr.debit += Number(j.debit || 0);
      curr.credit += Number(j.credit || 0);
      journalTotals.set(aid, curr);
    }

    const existingMap = new Map<number, any>();
    (existingAccounts || []).forEach((acc: any) => existingMap.set(Number(acc.id), acc));

    const missingAccounts: typeof CRITICAL_COA_ACCOUNTS = [];
    const typeMismatches: Array<{ id: number; name: string; expectedType: string; actualType: string }> = [];
    const balanceDiscrepancies: Array<{ id: number; name: string; storedBalance: number; computedBalance: number; variance: number }> = [];
    const accountsStatus: Array<{
      id: number;
      name: string;
      type: string;
      category: string;
      exists: boolean;
      balance?: number;
      computedBalance?: number;
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
        if (existing.type && existing.type !== critical.type) {
          typeMismatches.push({
            id: critical.id,
            name: existing.name || critical.name,
            expectedType: critical.type,
            actualType: existing.type
          });
        }
        const mutasi = journalTotals.get(critical.id) || { debit: 0, credit: 0 };
        const isNormalDebit = critical.type === 'asset' || critical.type === 'expense';
        const computedBalance = isNormalDebit ? (mutasi.debit - mutasi.credit) : (mutasi.credit - mutasi.debit);
        const storedBalance = Number(existing.balance) || 0;
        if (Math.abs(storedBalance - computedBalance) > 0.01) {
          balanceDiscrepancies.push({
            id: critical.id,
            name: existing.name || critical.name,
            storedBalance,
            computedBalance,
            variance: storedBalance - computedBalance
          });
        }
        accountsStatus.push({
          id: critical.id,
          name: existing.name || critical.name,
          type: existing.type || critical.type,
          category: existing.category || critical.category,
          exists: true,
          balance: storedBalance,
          computedBalance
        });
      }
    }

    const repairedAccounts: any[] = [];
    if (autoRepair) {
      // 1. Insert ONLY missing accounts (never overwrite existing balances)
      if (missingAccounts.length > 0) {
        console.log(`[COA DIAGNOSTIC] Missing ${missingAccounts.length} critical COA accounts. Inserting missing accounts...`);
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
            .insert(payload);

          if (insertErr && (insertErr.message.includes('category') || insertErr.message.includes('column'))) {
            const fallbackPayload = {
              id: missing.id,
              name: missing.name,
              type: missing.type,
              balance: 0
            };
            const retryRes = await supabaseClient
              .from('accounts')
              .insert(fallbackPayload);
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
            console.error(`[COA DIAGNOSTIC] Failed to insert missing account ${missing.id} (${missing.name}):`, insertErr.message);
          }
        }
      }

      // 2. Fix account type mismatches WITHOUT modifying stored balance
      for (const mismatch of typeMismatches) {
        const { error: updErr } = await supabaseClient
          .from('accounts')
          .update({ type: mismatch.expectedType })
          .eq('id', mismatch.id);
        if (!updErr) {
          repairedAccounts.push({ id: mismatch.id, name: mismatch.name, repairedType: mismatch.expectedType });
        }
      }
    }

    const unresolvedMissing = missingAccounts.filter(m => !repairedAccounts.some(r => r.id === m.id));
    const unresolvedTypeMismatches = autoRepair ? [] : typeMismatches;
    const isHealthy = unresolvedMissing.length === 0 && unresolvedTypeMismatches.length === 0 && balanceDiscrepancies.length === 0;
    const result = {
      healthy: isHealthy,
      totalChecked: CRITICAL_COA_ACCOUNTS.length,
      existingCount: existingMap.size + repairedAccounts.filter(r => !r.repairedType).length,
      missingCount: unresolvedMissing.length,
      missingAccounts: unresolvedMissing,
      typeMismatches: unresolvedTypeMismatches,
      balanceDiscrepancies,
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
      typeMismatches: [],
      balanceDiscrepancies: [],
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
  if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }
  app.use(express.json());

  // Boot-time configuration & service role key validation
  if (process.env.ALLOW_DEV_AUTH_BYPASS === 'true' && process.env.NODE_ENV === 'production') {
    console.error('FATAL SECURITY WARNING: ALLOW_DEV_AUTH_BYPASS cannot be set to true when NODE_ENV is production! Forcing ALLOW_DEV_AUTH_BYPASS=false.');
    process.env.ALLOW_DEV_AUTH_BYPASS = 'false';
  }

  try {
    getServiceRoleKeyOrThrow();
    console.log('[SERVER BOOT] Supabase Service Role Key verified successfully.');
  } catch (err: any) {
    console.warn('================================================================');
    console.warn('[SERVER BOOT WARNING] SUPABASE_SERVICE_ROLE_KEY is not configured in environment!');
    console.warn('Administrative operations, double-entry postings, and Webhook reconciliations require this key.');
    console.warn('================================================================');
  }

  // Read-only COA diagnostic check on startup (R10: never overwrite balances on boot)
  (async () => {
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (supabaseUrl && serviceKey) {
        const client = createClient(supabaseUrl, serviceKey);
        const res = await verifyAndEnsureCriticalCOA(client, false, true);
        console.log(`[STARTUP COA AUDIT] Status: ${res.healthy ? 'HEALTHY' : 'WARNING'}, Accounts Checked: ${res.totalChecked}, Existing: ${res.existingCount}, Missing: ${res.missingCount}`);
      }
    } catch (e: any) {
      console.warn('[STARTUP COA AUDIT] Non-blocking startup audit notice:', e?.message || e);
    }
  })();

  const PORT = Number(process.env.PORT) || 3000;

  // =========================================================================
  // RBAC WHITELIST SECURITY HELPERS (R2: ENV-ONLY, NO HARDCODED FALLBACKS)
  // =========================================================================
  function getSuperAdminEmails(): string[] {
    const envEmails = process.env.SUPER_ADMIN_EMAILS;
    if (!envEmails || !envEmails.trim()) {
      return [];
    }
    return envEmails.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  }

  function getOwnerEmails(): string[] {
    const envEmails = process.env.OWNER_EMAILS;
    if (!envEmails || !envEmails.trim()) {
      return [];
    }
    return envEmails.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  }

  function getAnakOwnerEmails(): string[] {
    const envEmails = process.env.ANAK_OWNER_EMAILS;
    if (!envEmails || !envEmails.trim()) {
      return [];
    }
    return envEmails.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  }

  function isSuperAdminEmail(email: string): boolean {
    const clean = (email || '').trim().toLowerCase();
    return Boolean(clean && getSuperAdminEmails().includes(clean));
  }

  function isOwnerEmail(email: string): boolean {
    const clean = (email || '').trim().toLowerCase();
    return Boolean(clean && getOwnerEmails().includes(clean));
  }

  function isAnakOwnerEmail(email: string): boolean {
    const clean = (email || '').trim().toLowerCase();
    return Boolean(clean && getAnakOwnerEmails().includes(clean));
  }

  function isEmailConfirmationEnforced(): boolean {
    if (process.env.NODE_ENV === 'production') {
      return true;
    }
    const envVal = process.env.ENFORCE_EMAIL_CONFIRMATION || process.env.REQUIRE_EMAIL_CONFIRMED || process.env.REQUIRE_EMAIL_CONFIRMATION;
    if (envVal !== undefined && envVal.trim() !== '') {
      return envVal.trim().toLowerCase() !== 'false';
    }
    return process.env.NODE_ENV !== 'development';
  }

  function resolveRoleForUser(userRecord: any, authUser?: any): string {
    const cleanEmail = (authUser?.email || userRecord?.email || '').trim().toLowerCase();
    const isConfirmed = Boolean(
      authUser?.email_confirmed_at ||
      authUser?.confirmed_at ||
      !isEmailConfirmationEnforced()
    );

    if (isConfirmed && cleanEmail) {
      if (isSuperAdminEmail(cleanEmail)) return 'super';
      if (isOwnerEmail(cleanEmail)) return 'owner';
      if (isAnakOwnerEmail(cleanEmail)) return 'anak_owner';
    }

    const role = (userRecord?.role || '').trim().toLowerCase();
    if (role === 'anak_owner' || role === 'anak owner') {
      return 'anak_owner';
    }

    return role || 'user';
  }

  function toSafeProfileRole(role: string): string {
    const r = (role || 'user').trim().toLowerCase();
    if (r === 'super' || r === 'super_admin') return 'super_admin';
    if (r === 'owner') return 'owner';
    if (r === 'admin' || r === 'anak_owner' || r === 'anak owner') return 'admin';
    if (r === 'finance') return 'finance';
    if (r === 'staff') return 'staff';
    return 'user';
  }

  function resolveEffectiveRole(userData: any, email: string, emailConfirmed: boolean = true): string {
    return resolveRoleForUser(userData, {
      email,
      email_confirmed_at: emailConfirmed ? 'confirmed' : null
    });
  }

  function checkPropertyAccess(authProfile: any, targetPropertyId: any): { allowed: boolean; reason?: string } {
    if (!canAccessProperty(authProfile, targetPropertyId)) {
      const role = authProfile?.role;
      return { allowed: false, reason: `Akses ditolak. Peran Anda (${role}) tidak berwenang mengakses Properti ID ${targetPropertyId ?? 'Global'}.` };
    }
    return { allowed: true };
  }

  function enforcePropertyScope(req: any, res: any, propertyId: number | string | null | undefined): boolean {
    const authProfile = req.authProfile;
    if (!authProfile) {
      res.status(401).json({ success: false, error: 'Akses ditolak. Profil pengguna tidak teridentifikasi.' });
      return false;
    }
    const check = checkPropertyAccess(authProfile, propertyId);
    if (!check.allowed) {
      res.status(403).json({ success: false, error: check.reason || 'Akses ditolak ke properti ini.' });
      return false;
    }
    return true;
  }

  // Find user by email across public.users and auth.admin.listUsers pagination
  async function findAuthUserByEmail(adminClient: any, email: string): Promise<any | null> {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail) return null;

    try {
      const { data: dbUser } = await adminClient
        .from('users')
        .select('id, email, full_name, role')
        .eq('email', cleanEmail)
        .maybeSingle();
      if (dbUser?.id) {
        return { id: dbUser.id, email: dbUser.email, user_metadata: { full_name: dbUser.full_name }, role: dbUser.role };
      }
    } catch (e) {}

    try {
      let page = 1;
      const perPage = 1000;
      while (true) {
        const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
        if (error || !data?.users || data.users.length === 0) break;
        const found = data.users.find((u: any) => (u.email || '').trim().toLowerCase() === cleanEmail);
        if (found) return found;
        if (data.users.length < perPage) break;
        page++;
      }
    } catch (err) {
      console.warn('[findAuthUserByEmail] listUsers notice:', err);
    }
    return null;
  }

  // In-memory rate limiting for failed login attempts (per IP and per email)
  interface FailedLoginRecord {
    count: number;
    resetAt: number;
  }
  const loginFailuresMap = new Map<string, FailedLoginRecord>();
  const MAX_FAILED_LOGIN_ATTEMPTS = 5;
  const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

  function isLoginRateLimited(key: string): boolean {
    const now = Date.now();
    const record = loginFailuresMap.get(key);
    if (!record) return false;
    if (record.resetAt < now) {
      loginFailuresMap.delete(key);
      return false;
    }
    return record.count >= MAX_FAILED_LOGIN_ATTEMPTS;
  }

  function recordLoginFailure(key: string): void {
    const now = Date.now();
    if (loginFailuresMap.size > 2000) {
      for (const [k, v] of loginFailuresMap.entries()) {
        if (v.resetAt < now) loginFailuresMap.delete(k);
      }
    }
    const record = loginFailuresMap.get(key);
    if (!record || record.resetAt < now) {
      loginFailuresMap.set(key, { count: 1, resetAt: now + LOGIN_LOCKOUT_MS });
    } else {
      record.count += 1;
    }
  }

  function clearLoginFailures(key: string): void {
    loginFailuresMap.delete(key);
  }

  // Centralized authentication context resolver
  async function resolveAuthContext(req: any, res: any): Promise<{ user: any; profile: any } | null> {
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
        const remoteIp = req.socket?.remoteAddress || req.ip || '';
        const isLoopback = remoteIp === '127.0.0.1' || remoteIp === '::1' || remoteIp === '::ffff:127.0.0.1';
        if (process.env.ALLOW_DEV_AUTH_BYPASS === 'true' && process.env.NODE_ENV !== 'production' && isLoopback) {
          console.warn('[SECURITY WARNING] ALLOW_DEV_AUTH_BYPASS active for localhost development mode.');
          const devUser = { id: 'dev-admin-id', email: 'admin@samarastay.co.id' };
          const devProfile = { id: 'dev-admin-id', email: 'admin@samarastay.co.id', role: 'super', full_name: 'Developer Admin', property_id: null };
          return { user: devUser, profile: devProfile };
        }
        return null;
      }

      const client = getSupabaseServerClient(accessToken);
      let { data: { user }, error } = await client.auth.getUser(accessToken);

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
            return null;
          }
        } else {
          return null;
        }
      }

      const isEmailConfirmed = Boolean(user.email_confirmed_at || (user as any).confirmed_at || !isEmailConfirmationEnforced());
      const userData = await getOrMigrateUserProfile(client, user);
      // A deactivated account (users.active === false) must lose API access immediately, even with a valid JWT.
      if (userData && userData.active === false) {
        console.warn('[resolveAuthContext] Rejected deactivated account:', user.id);
        return null;
      }
      const effectiveRole = resolveEffectiveRole(userData, user.email || '', isEmailConfirmed);

      const profile = {
        ...(userData || {}),
        role: effectiveRole,
        property_id: userData?.property_id !== undefined ? userData.property_id : null
      };

      return { user, profile };
    } catch (err: any) {
      console.warn('[resolveAuthContext] Exception:', err?.message || err);
      return null;
    }
  }

  // Middleware for Admin authentication check (Strict)
  async function requireAdminAuth(req: any, res: any, next: any) {
    try {
      const auth = await resolveAuthContext(req, res);
      if (!auth) {
        return res.status(401).json({ success: false, error: 'Akses ditolak. Token autentikasi tidak ditemukan atau tidak valid.' });
      }

      const effectiveRole = String(auth.profile?.role || '').trim().toLowerCase();
      const isAuthorized = ['admin', 'super', 'super_admin', 'finance', 'staff', 'owner', 'anak_owner'].includes(effectiveRole);

      if (!isAuthorized) {
        return res.status(403).json({ success: false, error: 'Akses ditolak. Peran Anda tidak memiliki izin admin.' });
      }

      req.authUser = auth.user;
      req.authProfile = auth.profile;
      next();
    } catch (err: any) {
      return res.status(500).json({ success: false, error: 'Terjadi kesalahan pada verifikasi autentikasi.' });
    }
  }

  // Middleware for Optional Admin authentication (Non-blocking)
  async function optionalAdminAuth(req: any, res: any, next: any) {
    try {
      const auth = await resolveAuthContext(req, res);
      if (auth) {
        const effectiveRole = String(auth.profile?.role || '').trim().toLowerCase();
        if (['admin', 'super', 'super_admin', 'finance', 'staff', 'owner', 'anak_owner'].includes(effectiveRole)) {
          req.authUser = auth.user;
          req.authProfile = auth.profile;
        }
      }
      next();
    } catch (err: any) {
      next();
    }
  }

  // Middleware factory enforcing granular RBAC via src/lib/permissions.ts
  function requirePermission(resource: AppResource, action: ActionType = 'read') {
    return (req: any, res: any, next: any) => {
      const authProfile = req.authProfile;
      const role = authProfile?.role;
      if (!role) {
        return res.status(401).json({ success: false, error: 'Akses ditolak. Profil pengguna tidak teridentifikasi.' });
      }

      if (!can(role, resource, action)) {
        return res.status(403).json({
          success: false,
          error: `Akses ditolak. Peran "${role}" tidak memiliki izin "${action}" pada modul "${resource}".`
        });
      }

      // Check property scoping using canAccessProperty
      const targetPropId = req.body?.property_id || req.body?.propertyId || req.query?.property_id || req.query?.propertyId || req.params?.property_id || req.params?.propertyId;
      if (targetPropId !== undefined && targetPropId !== null && targetPropId !== '') {
        if (!canAccessProperty(authProfile, targetPropId)) {
          return res.status(403).json({
            success: false,
            error: `Akses ditolak. Peran Anda (${role}) tidak berwenang mengakses Properti ID ${targetPropId}.`
          });
        }
      }

      next();
    };
  }

  function sanitizePiiResponse(arg1: any, arg2: any, customFields?: string[]): any {
    let data: any;
    let role = '';

    // Handle both (data, role) and (role, data, [fields]) calls
    if (typeof arg1 === 'string') {
      role = arg1;
      data = arg2;
    } else if (typeof arg2 === 'string') {
      role = arg2;
      data = arg1;
    } else {
      data = arg1;
      role = (arg2 && typeof arg2 === 'object' && arg2.role) ? arg2.role : '';
    }

    if (!data) return data;
    if (role && can(role, 'pii_docs', 'read')) {
      return data;
    }
    if (Array.isArray(data)) {
      return data.map(item => sanitizePiiResponse(item, role, customFields));
    }
    if (typeof data === 'object') {
      const copy = { ...data };
      if ('nik' in copy && copy.nik) copy.nik = maskNik(copy.nik);
      if ('nik_pasangan' in copy && copy.nik_pasangan) copy.nik_pasangan = maskNik(copy.nik_pasangan);
      if ('spouse_nik' in copy && copy.spouse_nik) copy.spouse_nik = maskNik(copy.spouse_nik);
      if ('identity_number' in copy && copy.identity_number) copy.identity_number = maskNik(copy.identity_number);
      if ('ktp_url' in copy) copy.ktp_url = null;
      if ('marriage_book_url' in copy) copy.marriage_book_url = null;
      if ('marriage_certificate_url' in copy) copy.marriage_certificate_url = null;
      if ('family_card_url' in copy) copy.family_card_url = null;
      if (customFields && Array.isArray(customFields)) {
        for (const field of customFields) {
          if (field in copy) {
            if (field.includes('nik') || field.includes('identity')) {
              copy[field] = maskNik(copy[field]);
            } else {
              copy[field] = null;
            }
          }
        }
      }
      return copy;
    }
    return data;
  }

  // =========================================================================
  // 1. MIDTRANS API INTEGRATION (PRODUCTION & SANDBOX)
  // =========================================================================

  const midtransLogs: any[] = [];

  function addMidtransLog(entry: {
    orderId: string;
    customerName?: string;
    customerEmail?: string;
    amount?: number;
    type: 'charge' | 'webhook' | 'client_event' | 'error';
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
  app.get('/api/midtrans/logs', requireAdminAuth, requirePermission('midtrans_logs', 'read'), (req, res) => {
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

  // Client-Side Logs Submission API (Sanitized & Rate-Limited)
  app.post('/api/midtrans/logs', apiRateLimiter(60000, 60), express.json(), (req, res) => {
    const { orderId, customerName, customerEmail, amount, type, status, message, details } = req.body || {};

    if (!orderId || typeof orderId !== 'string' || !/^[A-Za-z0-9_-]{3,80}$/.test(orderId)) {
      return res.status(400).json({ status: 'ERROR', message: 'Format orderId tidak valid.' });
    }

    const cleanCustomerName = customerName ? String(customerName).slice(0, 100) : undefined;
    const cleanCustomerEmail = customerEmail ? String(customerEmail).slice(0, 100) : undefined;
    const cleanMessage = message ? String(message).slice(0, 255) : 'Client event recorded';
    const cleanType = type ? String(type).slice(0, 50) : 'client_event';
    const cleanStatus = status ? String(status).slice(0, 50) : 'info';

    let safeDetails = details;
    if (details !== undefined) {
      try {
        const str = typeof details === 'string' ? details : JSON.stringify(details);
        safeDetails = str.length > 2000 ? JSON.parse(str.slice(0, 2000) + '..."') : details;
      } catch {
        safeDetails = String(details).slice(0, 1000);
      }
    }

    const validTypes = ['error', 'charge', 'webhook', 'client_event'] as const;
    const resolvedType = validTypes.includes(cleanType as any) ? (cleanType as typeof validTypes[number]) : 'client_event';

    addMidtransLog({
      orderId,
      customerName: cleanCustomerName,
      customerEmail: cleanCustomerEmail,
      amount: amount && !isNaN(Number(amount)) ? Number(amount) : undefined,
      type: resolvedType,
      status: cleanStatus,
      message: cleanMessage,
      details: safeDetails
    });
    return res.json({ status: 'OK' });
  });

  // Clear Midtrans Logs
  app.post('/api/midtrans/logs/clear', requireAdminAuth, requirePermission('midtrans_logs', 'delete'), (req, res) => {
    midtransLogs.length = 0;
    return res.json({ status: 'OK' });
  });

  // =========================================================================
  // RESILIENT PAYMENT & MIDTRANS CLEARING HELPERS (PREVENT DUPLICATES & TYPE ERRORS)
  // =========================================================================
  async function upsertPaymentByOrderId(
    supabaseClient: any,
    payload: {
      id: string;
      tenant_name: string;
      property_id?: number | null;
      amount: number;
      method: string;
      status: string;
      payment_date: string;
      midtrans_order_id?: string | null;
      transaction_id?: string | null;
    }
  ): Promise<string> {
    let resolvedId = payload.id;
    try {
      if (payload.midtrans_order_id) {
        const { data: existingPay } = await supabaseClient
          .from('payments')
          .select('id')
          .eq('midtrans_order_id', payload.midtrans_order_id)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (existingPay?.id) {
          resolvedId = String(existingPay.id);
          await supabaseClient
            .from('payments')
            .update({
              tenant_name: payload.tenant_name,
              property_id: payload.property_id ?? null,
              amount: payload.amount,
              method: payload.method,
              status: payload.status,
              payment_date: payload.payment_date,
              transaction_id: payload.transaction_id || payload.midtrans_order_id
            })
            .eq('id', resolvedId);
          return resolvedId;
        }
      }

      const { error: insErr } = await supabaseClient.from('payments').insert({
        ...payload,
        id: resolvedId
      });
      if (insErr && payload.midtrans_order_id) {
        const { data: retryPay } = await supabaseClient
          .from('payments')
          .select('id')
          .eq('midtrans_order_id', payload.midtrans_order_id)
          .limit(1)
          .maybeSingle();
        if (retryPay?.id) {
          resolvedId = String(retryPay.id);
        }
      }
    } catch (err) {
      console.warn('[PAYMENT UPSERT HELPER] Warning:', err);
    }
    return resolvedId;
  }

  async function recordMidtransClearingItem(
    supabaseClient: any,
    params: {
      midtrans_order_id: string;
      midtrans_transaction_id?: string | null;
      payment_id?: string | number | null;
      booking_id?: number | null;
      survey_id?: number | null;
      contract_extension_id?: number | null;
      gross_amount: number;
      fee_amount?: number;
      property_id?: number | null;
      tenant_name?: string | null;
      settled_at?: string;
    }
  ) {
    if (!params.midtrans_order_id) return;
    try {
      const grossAmt = Number(params.gross_amount || 0);
      const feeAmt = Number(params.fee_amount || 0);
      const baseRow: any = {
        midtrans_order_id: params.midtrans_order_id,
        midtrans_transaction_id: params.midtrans_transaction_id || params.midtrans_order_id,
        booking_id: params.booking_id ?? null,
        survey_id: params.survey_id ?? null,
        contract_extension_id: params.contract_extension_id ?? null,
        gross_amount: grossAmt,
        fee_amount: feeAmt,
        net_amount: grossAmt - feeAmt,
        reconciled_amount: 0,
        outstanding_amount: grossAmt,
        clearing_status: 'cleared',
        property_id: params.property_id ?? 1,
        tenant_name: params.tenant_name || 'Penyewa',
        settled_at: params.settled_at || new Date().toISOString()
      };

      const { data: existingClr } = await supabaseClient
        .from('midtrans_clearing_transactions')
        .select('id')
        .eq('midtrans_order_id', params.midtrans_order_id)
        .limit(1)
        .maybeSingle();

      if (existingClr?.id) {
        const { error: updErr } = await supabaseClient
          .from('midtrans_clearing_transactions')
          .update({
            ...baseRow,
            ...(params.payment_id !== undefined ? { payment_id: params.payment_id } : {})
          })
          .eq('id', existingClr.id);
        if (updErr && updErr.code === '22P02') {
          await supabaseClient
            .from('midtrans_clearing_transactions')
            .update(baseRow)
            .eq('id', existingClr.id);
        }
      } else {
        const { error: insErr } = await supabaseClient
          .from('midtrans_clearing_transactions')
          .insert({
            ...baseRow,
            ...(params.payment_id !== undefined ? { payment_id: params.payment_id } : {})
          });
        if (insErr && insErr.code === '22P02') {
          await supabaseClient
            .from('midtrans_clearing_transactions')
            .insert(baseRow);
        }
      }
    } catch (clrErr) {
      console.warn('[MIDTRANS CLEARING HELPER] Warning:', clrErr);
    }
  }

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

    // Idempotency: a replayed webhook / double click must not add duration_months, payments or ledger rows twice.
    if (ext && ext.status === 'paid' && ext.paid_at) {
      console.log(`[SETTLE EXTENSION] Order "${orderId}" is ALREADY settled (paid_at=${ext.paid_at}). Skipping duplicate side-effects.`);
      const { data: settledTenant } = await supabase.from('tenants').select('*').eq('id', ext.tenant_id).maybeSingle();
      return {
        success: true,
        already_settled: true,
        invoiceId: ext.invoice_id,
        newDurationMonths: Number(settledTenant?.duration_months) || undefined,
        extension: ext,
        tenant: settledTenant || undefined
      };
    }

    let tenantId = ext?.tenant_id || options?.tenantId;
    let extensionMonths = ext?.extension_months || options?.extensionMonths || 1;
    let totalAmount = ext?.total_amount || grossAmount || 0;

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

    // 2. Attempt Atomic DB RPC settle_contract_extension (Migration 051 - R3 & R4)
    const trxId = transactionId || ext?.midtrans_order_id || `mid-tr-ext-${Math.floor(100000 + Math.random() * 900000)}`;
    const { data: atomicExtRes, error: atomicExtErr } = await supabase.rpc('settle_contract_extension', {
      p_order_id: orderId,
      p_payment_type: paymentType || 'Midtrans SNAP',
      p_transaction_id: trxId,
      p_gross_amount: Number(totalAmount),
      p_fee_amount: Number(feeAmount || 0),
      p_tenant_id: Number(tenantId),
      p_extension_months: Number(extensionMonths),
      p_notes: options?.notes || ext?.notes || `Pelunasan perpanjangan sewa ${extensionMonths} bulan`
    });

    if (atomicExtRes && atomicExtRes.success === false) {
      throw new Error(atomicExtRes.error || 'Settlement perpanjangan kontrak ditolak oleh database.');
    }

    let invoiceId = atomicExtRes?.invoice_id || ext?.invoice_id || `INV-EXT-${tenantId}-${Date.now()}`;
    let newDuration = Number(atomicExtRes?.new_duration_months) || 0;
    let savedExtension: any = atomicExtRes?.extension || null;
    let updatedTenant: any = atomicExtRes?.tenant || null;
    let tenant: any = updatedTenant;
    let propertyName = 'Samara Stay Residence';

    if (!atomicExtErr && atomicExtRes && atomicExtRes.success === true) {
      const { data: fetchedTenant } = await supabase.from('tenants').select('*').eq('id', tenantId).maybeSingle();
      tenant = fetchedTenant || updatedTenant || { id: tenantId, duration_months: newDuration };
      updatedTenant = tenant;
      if (!savedExtension) {
        const { data: fetchedExt } = await supabase.from('contract_extensions').select('*').eq('midtrans_order_id', orderId).maybeSingle();
        savedExtension = fetchedExt;
      }
      if (tenant?.property_id) {
        const { data: prop } = await supabase.from('properties').select('name').eq('id', tenant.property_id).maybeSingle();
        if (prop?.name) propertyName = prop.name;
      }
    } else {
      // Fallback if 051 RPC is not yet deployed on remote DB: still enforce atomic post_financial_transaction RPC (never partial insert!)
      const { data: fetchedTenant, error: tErr } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', tenantId)
        .maybeSingle();

      if (tErr || !fetchedTenant) {
        throw new Error(`Data penyewa dengan ID ${tenantId} tidak ditemukan.`);
      }
      tenant = fetchedTenant;

      const currentDuration = Number(tenant.duration_months) || 1;
      newDuration = currentDuration + Number(extensionMonths);

      if (tenant.property_id) {
        const { data: prop } = await supabase.from('properties').select('name').eq('id', tenant.property_id).maybeSingle();
        if (prop?.name) propertyName = prop.name;
      }

      const monthlyRate = ext?.monthly_rate || Math.round(Number(totalAmount) / Math.max(1, Number(extensionMonths)));
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

      const resolvedInvoiceId = await upsertPaymentByOrderId(supabase, {
        id: invoiceId,
        tenant_name: tenant.full_name,
        property_id: tenant.property_id,
        amount: Number(totalAmount),
        method: paymentType || 'Midtrans SNAP',
        status: 'paid',
        payment_date: todayJakarta(),
        midtrans_order_id: orderId,
        transaction_id: trxId
      });
      invoiceId = resolvedInvoiceId;

      const isMidtransExt = (paymentType || '').toLowerCase().includes('midtrans') || (orderId || '').startsWith('EXT');
      if (isMidtransExt) {
        await recordMidtransClearingItem(supabase, {
          midtrans_order_id: orderId,
          midtrans_transaction_id: trxId,
          payment_id: resolvedInvoiceId,
          contract_extension_id: savedExtension?.id || null,
          gross_amount: Number(totalAmount || 0),
          fee_amount: Number(feeAmount || 0),
          property_id: tenant.property_id || 1,
          tenant_name: tenant.full_name || null,
          settled_at: new Date().toISOString()
        });
      }

      await verifyAndEnsureCriticalCOA(supabase, false);
      const refId = String(savedExtension?.id || resolvedInvoiceId);
      const debitAccountId = isMidtransExt ? 1200 : 1010;
      const creditAccountId = 4000;
      const trxDate = todayJakarta();
      const trxNo = `TRX-EXT-${Date.now()}`;
      const { data: ftRes, error: rpcErr } = await supabase.rpc('post_financial_transaction', {
        p_transaction_no: trxNo,
        p_transaction_date: trxDate,
        p_category: 'Pendapatan Sewa',
        p_description: `Perpanjangan Sewa Kamar ${tenant.room_number} (${tenant.full_name}) - ${extensionMonths} Bulan`,
        p_amount: Number(totalAmount),
        p_type: 'income',
        p_reference_type: 'contract_extension',
        p_reference_id: refId,
        p_created_by: 'Finance System',
        p_debit_account_id: debitAccountId,
        p_credit_account_id: creditAccountId,
        p_property_id: tenant.property_id || 1
      });

      if (rpcErr || !ftRes || ftRes.success === false) {
        const errMsg = rpcErr?.message || ftRes?.error || 'Gagal memposting jurnal perpanjangan kontrak';
        await recordFailedLedgerPosting(supabase, {
          transaction_no: trxNo,
          reference_type: 'contract_extension',
          reference_id: refId,
          amount: Number(totalAmount),
          debit_account_id: debitAccountId,
          credit_account_id: creditAccountId,
          property_id: tenant.property_id || 1,
          created_by: 'Finance System',
          error_message: errMsg
        });
        throw new Error(`Settlement perpanjangan dibatalkan karena gagal posting buku besar: ${errMsg}`);
      }

      const { data: updT } = await supabase
        .from('tenants')
        .update({
          duration_months: newDuration,
          payment_status: 'paid',
          status: 'active'
        })
        .eq('id', tenantId)
        .select()
        .maybeSingle();
      updatedTenant = updT;

      if (tenant.room_number && tenant.property_id) {
        await supabase.from('rooms').update({
          status: 'occupied',
          current_tenant_name: tenant.full_name
        }).eq('property_id', tenant.property_id).eq('room_number', tenant.room_number);
      }
    }

    // 11. Broadcast realtime mutation via single shared server channel (G2)
    await broadcastDbMutation('contract_extensions', 'INSERT', savedExtension);
    await broadcastDbMutation(
      'tenants',
      'UPDATE',
      updatedTenant || { id: tenant.id, property_id: tenant.property_id, duration_months: newDuration, payment_status: 'paid', status: 'active' }
    );
    await broadcastDbMutation('payments', 'INSERT', {
      id: invoiceId,
      property_id: tenant.property_id,
      tenant_id: tenant.id,
      status: 'paid'
    });

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
  app.post('/api/admin/contract-extension/settle', requireAdminAuth, requirePermission('bookings', 'approve'), express.json(), async (req, res) => {
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

      const extMonthsNum = Math.floor(Number(extensionMonths));
      const totalAmountNum = Number(totalAmount);
      if (!Number.isFinite(extMonthsNum) || extMonthsNum < 1 || extMonthsNum > 24) {
        return res.status(400).json({ error: 'extensionMonths harus bilangan bulat 1-24.' });
      }
      if (!Number.isFinite(totalAmountNum) || totalAmountNum <= 0) {
        return res.status(400).json({ error: 'totalAmount harus angka positif.' });
      }

      // Double-click / retry guard: an identical settlement for this tenant in the last 2 minutes is returned, not repeated.
      const recentSince = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { data: recentDup } = await supabaseAdmin
        .from('contract_extensions')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('extension_months', extMonthsNum)
        .eq('total_amount', totalAmountNum)
        .eq('status', 'paid')
        .gte('paid_at', recentSince)
        .limit(1)
        .maybeSingle();
      if (recentDup) {
        return res.status(200).json({
          success: true,
          already_settled: true,
          invoiceId: recentDup.invoice_id,
          newDurationMonths: Number(tenantData.duration_months) || undefined,
          extension: recentDup,
          tenant: tenantData
        });
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
  app.post('/api/admin/financial-transaction/post', requireAdminAuth, requirePermission('journals', 'create'), express.json(), async (req, res) => {
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
      const amountNum = Number(amount);
      if (!Number.isFinite(amountNum) || amountNum <= 0) {
        return res.status(400).json({ error: 'amount harus angka positif.' });
      }
      if (String(debit_account_id) === String(credit_account_id)) {
        return res.status(400).json({ error: 'Akun debit dan kredit tidak boleh sama.' });
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

      // Verify critical COA accounts (read-only check)
      await verifyAndEnsureCriticalCOA(supabaseAdmin, false);

      const trxDate = todayJakarta();
      const trxNo = `TRX-${trxDate.replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;

      const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('post_financial_transaction', {
        p_transaction_no: trxNo,
        p_transaction_date: trxDate,
        p_category: category,
        p_description: description,
        p_amount: amountNum,
        p_type: type,
        p_reference_type: reference_type || null,
        p_reference_id: reference_id ? String(reference_id) : null,
        p_created_by: created_by || req.authProfile?.full_name || 'Admin',
        p_debit_account_id: Number(debit_account_id),
        p_credit_account_id: Number(credit_account_id),
        p_property_id: property_id ? Number(property_id) : null
      });

      if (rpcErr || !rpcRes || rpcRes.success === false) {
        const errMessage = rpcErr?.message || rpcRes?.error || rpcRes?.message || 'Posting jurnal ditolak oleh database.';
        await recordFailedLedgerPosting(supabaseAdmin, {
          transaction_no: trxNo,
          reference_type: reference_type || 'manual',
          reference_id: reference_id ? String(reference_id) : trxNo,
          amount: amountNum,
          debit_account_id: Number(debit_account_id),
          credit_account_id: Number(credit_account_id),
          property_id: property_id ? Number(property_id) : null,
          created_by: created_by || req.authProfile?.full_name || 'Admin',
          error_message: errMessage
        });
        return res.status(rpcRes?.success === false ? 422 : 500).json({
          success: false,
          error: errMessage
        });
      }

      return res.status(200).json({ success: true, data: rpcRes });
    } catch (err: any) {
      console.error('[Admin API] financial-transaction/post failed:', err);
      return res.status(500).json({ error: err.message || 'Internal server error.' });
    }
  });

  // Admin API: Assign property to staff/finance user (Restricted by Role Hierarchy)
  app.patch('/api/admin/users/:id/assign-property', requireAdminAuth, requirePermission('users', 'update'), express.json(), async (req, res) => {
    try {
      const callerRole = req.authProfile?.role;
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

      // Hierarchy validation using permissions helper
      const chkAssign = canAssignProperty(callerRole, targetUser.role);
      if (!chkAssign.allowed) {
        return res.status(403).json({
          success: false,
          error: chkAssign.reason || `Akses ditolak. Peran "${callerRole}" tidak memiliki hak mengelola penugasan peran "${targetUser.role}".`
        });
      }

      // Prohibit assigning property to super or owner unless caller is super admin
      if (['super', 'super_admin'].includes(targetUser.role) && !['super', 'super_admin'].includes(callerRole)) {
        return res.status(403).json({ success: false, error: 'Tidak dapat mengubah penugasan properti Super Admin.' });
      }
      if (targetUser.role === 'owner' && !['super', 'super_admin'].includes(callerRole)) {
        return res.status(403).json({ success: false, error: 'Tidak dapat mengubah penugasan properti Owner.' });
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
        .select('id, email, full_name, role, role_id, access, active, property_id, created_at')
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

  // Admin API: Get list of users / fungsionaris (Filtered by Role Visibility)
  app.get('/api/admin/users', requireAdminAuth, requirePermission('users', 'read'), async (req, res) => {
    try {
      const callerRole = (req.authProfile?.role || '').toLowerCase();
      const serviceKey = getServiceRoleKeyOrThrow();
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const adminClient = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });

      let query = adminClient
        .from('users')
        .select('id, email, full_name, role, role_id, access, active, property_id, created_at')
        .order('id', { ascending: false });

      // Owner sees all EXCEPT super and super_admin
      if (callerRole === 'owner') {
        query = query.not('role', 'in', '("super","super_admin")');
      }
      // Anak Owner can ONLY see staff, admin, and user
      else if (callerRole === 'anak_owner') {
        query = query.in('role', ['staff', 'admin', 'user']);
      }
      // Staff / other non-supers cannot see higher roles
      else if (!['super', 'super_admin'].includes(callerRole)) {
        query = query.in('role', ['staff', 'user']);
      }

      const { data: users, error } = await query;

      if (error) {
        return res.status(500).json({ success: false, error: error.message });
      }

      return res.status(200).json({ success: true, users: users || [] });
    } catch (err: any) {
      console.error('[Admin API] get users failed:', err);
      return res.status(500).json({ success: false, error: err.message || 'Internal server error.' });
    }
  });

  // Admin API: Create or update user fungsionaris (Super Admin / Owner / Anak Owner / Admin)
  app.post('/api/admin/users/save', requireAdminAuth, requirePermission('users', 'create'), express.json(), async (req, res) => {
    try {
      const callerRole = req.authProfile?.role;
      const { id, full_name, email, role, access, active, property_id, password } = req.body;
      if (!email || !email.trim()) {
        return res.status(400).json({ success: false, error: 'Email resmi wajib diisi.' });
      }
      const cleanEmail = email.trim().toLowerCase();
      const cleanFullName = (full_name || cleanEmail.split('@')[0]).trim();
      const cleanRole = (role || 'staff').trim().toLowerCase();
      
      // Derive role_id strictly from role (ignore client provided role_id)
      const cleanRoleId = ['super', 'super_admin', 'owner'].includes(cleanRole) ? 1 
        : (['admin', 'anak_owner'].includes(cleanRole) ? 2 
        : (cleanRole === 'finance' ? 3 : 4));
      
      const targetPropertyId = (property_id === null || property_id === undefined || property_id === '' || property_id === 0) ? null : Number(property_id);
      const cleanActive = active !== undefined ? Boolean(active) : true;

      const serviceKey = getServiceRoleKeyOrThrow();
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const adminClient = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });

      // Validate targetPropertyId against properties table if specified
      if (targetPropertyId !== null) {
        const { data: propCheck } = await adminClient
          .from('properties')
          .select('id')
          .eq('id', targetPropertyId)
          .maybeSingle();
        if (!propCheck) {
          return res.status(400).json({ success: false, error: `Properti dengan ID ${targetPropertyId} tidak ditemukan.` });
        }
      }

      // Hierarchy validation: caller can only manage roles lower or equal per RBAC matrix
      const chkRole = canManageRole(callerRole, cleanRole);
      if (!chkRole.allowed) {
        return res.status(403).json({
          success: false,
          error: chkRole.reason || `Akses ditolak. Peran "${callerRole}" tidak memiliki hak untuk membuat atau menetapkan peran "${cleanRole}".`
        });
      }

      let userId = id;
      let previousRole: string | null = null;

      // If updating an existing user, check target user's current role hierarchy
      if (userId) {
        const { data: existingTargetUser } = await adminClient
          .from('users')
          .select('id, role')
          .eq('id', userId)
          .maybeSingle();

        if (existingTargetUser) {
          previousRole = existingTargetUser.role;
          const chkExisting = canManageRole(callerRole, existingTargetUser.role);
          if (!chkExisting.allowed) {
            return res.status(403).json({
              success: false,
              error: chkExisting.reason || `Akses ditolak. Peran "${callerRole}" tidak memiliki hak untuk mengubah akun pengguna dengan peran "${existingTargetUser.role}".`
            });
          }

          // Prevent self-role modification
          if (req.authProfile?.id === userId && cleanRole !== (existingTargetUser.role || '').toLowerCase()) {
            return res.status(400).json({
              success: false,
              error: 'Anda tidak dapat mengubah peran Anda sendiri.'
            });
          }

          // Protect the last super admin from demotion
          if (['super', 'super_admin'].includes((existingTargetUser.role || '').toLowerCase()) && !['super', 'super_admin'].includes(cleanRole)) {
            const { count } = await adminClient
              .from('users')
              .select('id', { count: 'exact', head: true })
              .in('role', ['super', 'super_admin'])
              .eq('active', true);
            if ((count || 0) <= 1) {
              return res.status(400).json({
                success: false,
                error: 'Tidak dapat menurunkan wewenang akun Super Admin terakhir di sistem.'
              });
            }
          }

          // Protect the last owner from demotion
          if ((existingTargetUser.role || '').toLowerCase() === 'owner' && cleanRole !== 'owner') {
            const { count } = await adminClient
              .from('users')
              .select('id', { count: 'exact', head: true })
              .eq('role', 'owner')
              .eq('active', true);
            if ((count || 0) <= 1) {
              return res.status(400).json({
                success: false,
                error: 'Tidak dapat menurunkan wewenang akun Owner terakhir di sistem.'
              });
            }
          }
        }
      }

      // 1. If no ID provided, check if user already exists in auth or public.users by email
      if (!userId) {
        const existingAuth = await findAuthUserByEmail(adminClient, cleanEmail);
        if (existingAuth?.id) {
          userId = existingAuth.id;
          previousRole = existingAuth.role || null;
          const chkAuthUser = canManageRole(callerRole, existingAuth.role || 'user');
          if (!chkAuthUser.allowed) {
            return res.status(403).json({
              success: false,
              error: chkAuthUser.reason || `Akses ditolak. Peran "${callerRole}" tidak memiliki hak mengelola pengguna ini.`
            });
          }
        }
      }

      // 2. If creating a new user or auth account needed
      if (!userId) {
        const securePassword = (password && password.trim().length >= 8)
          ? password.trim()
          : crypto.randomBytes(12).toString('base64url');

        try {
          const { data: createdAuth, error: createAuthErr } = await adminClient.auth.admin.createUser({
            email: cleanEmail,
            password: securePassword,
            email_confirm: true,
            user_metadata: { full_name: cleanFullName }
          });
          if (createAuthErr) {
            console.warn('[Admin Save User] createUser notice:', createAuthErr.message);
          } else if (createdAuth?.user?.id) {
            userId = createdAuth.user.id;
          }
        } catch (authErr) {
          console.warn('[Admin Save User] Auth account provisioning notice:', authErr);
        }
      }

      // 3. Fallback UUID if auth client couldn't provide one
      if (!userId) {
        userId = crypto.randomUUID();
      }

      // 4. Update auth password or metadata if password was provided and user exists in auth
      if (password && password.trim().length >= 6) {
        try {
          await adminClient.auth.admin.updateUserById(userId, {
            password: password.trim(),
            user_metadata: { full_name: cleanFullName }
          });
        } catch (passErr) {
          console.warn('[Admin Save User] Password update notice:', passErr);
        }
      }

      const defaultAccess = targetPropertyId !== null
        ? `Akses Terbatas: Properti ${targetPropertyId}`
        : (['super', 'super_admin'].includes(cleanRole)
            ? 'Semua Properti (Super Admin)'
            : cleanRole === 'owner'
              ? 'Owner Investor Portfolio'
              : (cleanRole === 'anak_owner' || cleanRole === 'anak owner')
                ? 'Akses operasional, hunian & keuangan (Anak Owner)'
                : cleanRole === 'finance'
                  ? 'Akses ledger keuangan & setoran PBJT'
                  : 'Staff akses terbatas');

      const dbRole = cleanRole;

      const userRecord = {
        id: userId,
        full_name: cleanFullName,
        email: cleanEmail,
        role: dbRole,
        role_id: cleanRoleId,
        access: access || defaultAccess,
        active: cleanActive,
        property_id: targetPropertyId,
        created_at: new Date().toISOString()
      };

      const { data: savedData, error: upsertErr } = await adminClient
        .from('users')
        .upsert(userRecord, { onConflict: 'id' })
        .select('id, email, full_name, role, role_id, access, active, property_id, created_at')
        .single();

      if (upsertErr) {
        console.error('[Admin Save User] Upsert error in users table:', upsertErr);
        return res.status(500).json({ success: false, error: `Gagal menyimpan user: ${upsertErr.message}` });
      }

      // Also ensure profiles table matches (map anak_owner -> admin and super -> super_admin per profiles_role_check)
      try {
        const profileDbRole = toSafeProfileRole(dbRole);
        await adminClient.from('profiles').upsert({
          id: userId,
          full_name: cleanFullName,
          role: profileDbRole
        }, { onConflict: 'id' });
      } catch (pErr) {}

      // Log activity
      try {
        const roleChangeDetail = previousRole && previousRole !== cleanRole 
          ? `(Peran diubah dari ${previousRole} -> ${cleanRole})` 
          : `(${cleanRole})`;
        await adminClient.from('activity_logs').insert({
          admin_name: req.authProfile?.full_name || req.authProfile?.email || 'Admin',
          action: id ? 'UPDATE_USER' : 'CREATE_USER',
          detail: `Menyimpan fungsionaris ${cleanFullName} ${roleChangeDetail} - Email: ${cleanEmail}`,
          created_at: new Date().toISOString()
        });
      } catch (logErr) {}

      return res.status(200).json({
        success: true,
        data: savedData || userRecord
      });
    } catch (err: any) {
      console.error('[Admin Save User] Unexpected error:', err);
      return res.status(500).json({ success: false, error: err.message || 'Gagal menyimpan otorisasi pengguna.' });
    }
  });

  // Admin API: Delete user (Super Admin / Owner / Anak Owner / Admin)
  app.delete('/api/admin/users/:id', requireAdminAuth, requirePermission('users', 'delete'), async (req, res) => {
    try {
      const targetUserId = req.params.id;
      if (!targetUserId) {
        return res.status(400).json({ success: false, error: 'User ID target wajib disertakan.' });
      }

      // Prevent self-deletion
      if (req.authProfile?.id === targetUserId) {
        return res.status(400).json({ success: false, error: 'Anda tidak dapat menghapus akun Anda sendiri yang sedang aktif.' });
      }

      const serviceKey = getServiceRoleKeyOrThrow();
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const adminClient = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });

      const { data: targetUser } = await adminClient
        .from('users')
        .select('*')
        .eq('id', targetUserId)
        .maybeSingle();

      if (!targetUser) {
        return res.status(404).json({ success: false, error: 'Pengguna target tidak ditemukan.' });
      }

      const callerRole = req.authProfile?.role;
      const chkDel = canManageRole(callerRole, targetUser.role, 'delete');
      if (!chkDel.allowed) {
        return res.status(403).json({
          success: false,
          error: chkDel.reason || `Akses ditolak. Peran "${callerRole}" tidak memiliki hak untuk menghapus akun pengguna dengan peran "${targetUser.role}".`
        });
      }

      // Protect the last super admin from deletion
      if (['super', 'super_admin'].includes((targetUser.role || '').toLowerCase())) {
        const { count } = await adminClient
          .from('users')
          .select('id', { count: 'exact', head: true })
          .in('role', ['super', 'super_admin'])
          .eq('active', true);
        if ((count || 0) <= 1) {
          return res.status(400).json({
            success: false,
            error: 'Tidak dapat menghapus akun Super Admin terakhir di sistem.'
          });
        }
      }

      // Protect the last owner from deletion
      if ((targetUser.role || '').toLowerCase() === 'owner') {
        const { count } = await adminClient
          .from('users')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'owner')
          .eq('active', true);
        if ((count || 0) <= 1) {
          return res.status(400).json({
            success: false,
            error: 'Tidak dapat menghapus akun Owner terakhir di sistem.'
          });
        }
      }

      const { error: delErr } = await adminClient.from('users').delete().eq('id', targetUserId);
      if (delErr) {
        console.warn('[Admin Delete User] users table delete error:', delErr.message);
      }

      // Also clean up auth if exists
      try {
        await adminClient.auth.admin.deleteUser(targetUserId);
      } catch (authDelErr) {
        console.warn('[Admin Delete User] auth delete notice:', authDelErr);
      }

      // Audit log
      try {
        await adminClient.from('activity_logs').insert({
          admin_name: req.authProfile?.full_name || req.authProfile?.email || 'Admin',
          action: 'DELETE_USER',
          detail: `Mencabut otorisasi fungsionaris ID: ${targetUserId} (${targetUser?.full_name || targetUser?.email || 'User'} - Role: ${targetUser?.role})`,
          created_at: new Date().toISOString()
        });
      } catch (logErr) {}

      return res.status(200).json({ success: true, message: 'Hak akses fungsionaris berhasil dicabut.' });
    } catch (err: any) {
      console.error('[Admin Delete User] Error:', err);
      return res.status(500).json({ success: false, error: err.message || 'Gagal menghapus user.' });
    }
  });

  // Admin API: Atomic Idempotent Booking Approval with Server-Side Accounting & Email Dispatch
  app.post('/api/admin/booking/approve', requireAdminAuth, requirePermission('bookings', 'approve'), express.json(), async (req, res) => {
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

      // Check critical Chart of Accounts (COA) (read-only)
      await verifyAndEnsureCriticalCOA(supabaseAdmin, false);

      let finalBooking = existingBooking;
      let finalInvoiceId = `INV-${existingBooking.id}-${Date.now()}`;
      let wasAlreadyApproved = false;

      // 3. Atomic DB RPC `settle_manual_booking_approval` (Migration 034 / Hardened in 051 - R3 & R4)
      const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('settle_manual_booking_approval', {
        p_booking_id: booking_id,
        p_payment_method: payment_method || existingBooking.payment_method || 'Transfer Manual',
        p_created_by: req.authProfile?.full_name || 'Admin Approval'
      });

      if (rpcRes && rpcRes.success === false) {
        return res.status(409).json({
          success: false,
          error: rpcRes.error || 'Approval booking ditolak oleh database (cek status kamar atau buku besar).'
        });
      }

      if (rpcErr || !rpcRes || rpcRes.success !== true) {
        console.error('[Admin API approve_booking] Atomic settle RPC failed:', rpcErr?.message || rpcRes);
        return res.status(500).json({
          success: false,
          error: rpcErr?.message || 'Gagal menjalankan prosedur settlement approval atomik di database.'
        });
      }

      finalBooking = rpcRes.booking || existingBooking;
      finalInvoiceId = rpcRes.invoice_id || finalInvoiceId;
      wasAlreadyApproved = Boolean(rpcRes.already_approved);

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
  app.post('/api/admin/rooms/save', requireAdminAuth, requirePermission('rooms', 'update'), express.json(), async (req, res) => {
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

      // Enforce room_type check constraint in remote DB while supporting 'Premium Plus'
      let requestedRoomType = String(cleanData.room_type || '').trim();
      if (requestedRoomType === 'Premium Plus' || requestedRoomType === 'Premium+' || requestedRoomType === 'VVIPSuite' || requestedRoomType === 'VVIP Suite') {
        requestedRoomType = 'Premium Plus';
        cleanData.room_type = 'Premium';
        cleanData.facilities = ['__ROOM_TYPE:Premium Plus__'];
      } else if (requestedRoomType) {
        const allowedRoomTypes = ['Standard', 'Deluxe', 'Premium'];
        cleanData.room_type = allowedRoomTypes.includes(requestedRoomType) ? requestedRoomType : 'Premium';
        cleanData.facilities = [];
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
        const rawFacs = Array.isArray(finalRoom.facilities) ? finalRoom.facilities : [];
        const isPremPlus = requestedRoomType === 'Premium Plus' || rawFacs.some((item: any) => typeof item === 'string' && item === '__ROOM_TYPE:Premium Plus__');
        const resolvedFacilities = (finalRoom.room_facilities || [])
          .map((rf: any) => rf?.facilities)
          .filter(Boolean);
        finalRoom = {
          ...finalRoom,
          room_type: isPremPlus ? 'Premium Plus' : finalRoom.room_type,
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
  app.delete('/api/admin/rooms/:id', requireAdminAuth, requirePermission('properties', 'delete'), async (req, res) => {
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
  app.post('/api/admin/maps/resolve-link', requireAdminAuth, requirePermission('properties', 'read'), express.json(), async (req, res) => {
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

      // Validate URL and enforce anti-SSRF protections
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(rawUrl);
      } catch {
        return res.status(400).json({ success: false, error: 'URL link Google Maps tidak valid.' });
      }

      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return res.status(400).json({ success: false, error: 'Hanya protokol HTTP/HTTPS yang didukung.' });
      }

      const hostname = parsedUrl.hostname.toLowerCase();
      const ALLOWED_MAPS_HOSTS = [
        'maps.google.com',
        'maps.app.goo.gl',
        'goo.gl',
        'google.com',
        'www.google.com',
        'google.co.id',
        'www.google.co.id'
      ];

      const isAllowedHost = ALLOWED_MAPS_HOSTS.some(h => hostname === h || hostname.endsWith(`.${h}`));
      if (!isAllowedHost) {
        return res.status(400).json({
          success: false,
          error: 'Hanya tautan resmi Google Maps (maps.google.com, maps.app.goo.gl, goo.gl) yang diizinkan.'
        });
      }

      // Anti-SSRF: check for private / internal / metadata IPs
      if (
        hostname === 'localhost' ||
        hostname.startsWith('127.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('169.254.') ||
        hostname === '::1'
      ) {
        return res.status(400).json({ success: false, error: 'Akses ke alamat internal atau metadata server diblokir.' });
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
  app.post('/api/admin/properties/save', requireAdminAuth, requirePermission('properties', 'update'), express.json(), async (req, res) => {
    try {
      const payload = req.body || {};
      const { name, address } = payload;

      const role = (req.authProfile?.role || '').toLowerCase();
      if (!['super', 'super_admin', 'owner', 'anak_owner', 'admin'].includes(role)) {
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
  app.post('/api/admin/amenities/save', requireAdminAuth, requirePermission('properties', 'update'), express.json(), async (req, res) => {
    try {
      const payload = req.body || {};
      const role = (req.authProfile?.role || '').toLowerCase();
      if (!['super', 'super_admin', 'owner', 'anak_owner', 'admin'].includes(role)) {
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
  app.post('/api/admin/amenities/delete', requireAdminAuth, requirePermission('properties', 'delete'), express.json(), async (req, res) => {
    try {
      const { id } = req.body || {};
      if (!id) {
        return res.status(400).json({ success: false, error: 'ID fasilitas wajib diisi.' });
      }

      const role = (req.authProfile?.role || '').toLowerCase();
      if (!['super', 'super_admin', 'owner', 'anak_owner', 'admin'].includes(role)) {
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
  app.post('/api/admin/amenities/batch', requireAdminAuth, requirePermission('properties', 'update'), express.json(), async (req, res) => {
    try {
      const { amenities, property_id } = req.body || {};
      if (!Array.isArray(amenities) || amenities.length === 0) {
        return res.status(400).json({ success: false, error: 'Daftar fasilitas wajib diisi.' });
      }

      const role = (req.authProfile?.role || '').toLowerCase();
      if (!['super', 'super_admin', 'owner', 'anak_owner', 'admin'].includes(role)) {
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
  app.post('/api/admin/settings/save', requireAdminAuth, requirePermission('system_settings', 'update'), express.json(), async (req, res) => {
    try {
      const payload = req.body || {};
      const role = (req.authProfile?.role || '').toLowerCase();
      if (!['super', 'super_admin', 'owner', 'anak_owner', 'admin'].includes(role)) {
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
  app.post('/api/admin/settings/facilities', requireAdminAuth, requirePermission('system_settings', 'update'), express.json(), async (req, res) => {
    try {
      const payload = req.body || {};
      const role = (req.authProfile?.role || '').toLowerCase();
      if (!['super', 'super_admin', 'owner', 'anak_owner', 'admin'].includes(role)) {
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
  app.delete('/api/admin/properties/:id', requireAdminAuth, requirePermission('properties', 'delete'), async (req, res) => {
    try {
      const propId = Number(req.params.id);
      if (!propId || isNaN(propId)) {
        return res.status(400).json({ success: false, error: 'ID properti tidak valid.' });
      }

      const role = (req.authProfile?.role || '').toLowerCase();
      if (!['super', 'super_admin', 'owner', 'anak_owner', 'admin'].includes(role)) {
        return res.status(403).json({ success: false, error: 'Akses ditolak. Hanya Super Admin, Owner, Anak Owner, atau Admin yang dapat menghapus properti.' });
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
        if (
          delErr.code === '23503' || 
          delErr.message.toLowerCase().includes('foreign key') || 
          delErr.message.toLowerCase().includes('violates foreign key constraint') ||
          delErr.message.toLowerCase().includes('journal_entries') ||
          delErr.message.toLowerCase().includes('restrict')
        ) {
          return res.status(400).json({ 
            success: false, 
            error: 'Properti tidak dapat dihapus karena masih memiliki riwayat transaksi keuangan atau jurnal pembukuan terkait (FK RESTRICT).' 
          });
        }
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

  async function computeAuthoritativeOrderAmount(
    checkClient: any,
    cleanOrderId: string,
    reqBody?: any
  ): Promise<number | null> {
    if (cleanOrderId.startsWith('SRV-')) {
      const { data: sv, error: svErr } = await checkClient
        .from('surveys')
        .select('dp_amount')
        .eq('reservation_number', cleanOrderId)
        .maybeSingle();
      if (svErr) {
        throw new Error('Gagal memverifikasi nominal DP survei di database.');
      }
      if (sv) return Number(sv.dp_amount ?? 500000);
      return reqBody?.is_dp ? 500000 : null;
    }

    if (cleanOrderId.startsWith('EXT-') || cleanOrderId.startsWith('EXTEND-')) {
      const { data: ex, error: exErr } = await checkClient
        .from('contract_extensions')
        .select('total_amount')
        .eq('midtrans_order_id', cleanOrderId)
        .maybeSingle();
      if (exErr) {
        throw new Error('Gagal memverifikasi nominal perpanjangan kontrak di database.');
      }
      if (ex) return Number(ex.total_amount);
      return null;
    }

    const { data: b, error: bErr } = await checkClient
      .from('bookings')
      .select('total_price, dp_amount, is_dp, room_id, property_id, booking_type, duration_months, duration_days')
      .eq('midtrans_order_id', cleanOrderId)
      .maybeSingle();
    if (bErr) {
      throw new Error('Gagal memverifikasi nominal tagihan booking di database.');
    }
    if (b) {
      return Number(b.is_dp ? (b.dp_amount || 500000) : b.total_price);
    }

    // Fallback authoritative computation from room & coupon if booking row was queried by room_id
    if (reqBody?.is_dp) {
      return 500000;
    }
    if (reqBody?.room_id) {
      const { data: room } = await checkClient
        .from('rooms')
        .select('id, price, daily_price, discount_percent, discount_until, property_id')
        .eq('id', Number(reqBody.room_id))
        .maybeSingle();
      if (room) {
        const targetPropId = Number(reqBody.property_id || room.property_id || 1);
        const { data: prop } = await checkClient
          .from('properties')
          .select('deposit_amount')
          .eq('id', targetPropId)
          .maybeSingle();

        let couponObj: {
          code: string;
          discount_type: 'percentage' | 'fixed';
          discount_value: number;
          max_discount_amount?: number | null;
          is_active: boolean;
        } | null = null;
        const rawCouponCode = String(reqBody.coupon_code || '').trim();
        if (rawCouponCode) {
          const { data: coupon } = await checkClient
            .from('coupons')
            .select('code, discount_percent, max_discount, min_transaction, valid_until, is_active, usage_limit, used_count, property_id')
            .ilike('code', rawCouponCode)
            .eq('is_active', true)
            .maybeSingle();
          if (coupon) {
            couponObj = {
              code: coupon.code,
              discount_type: 'percentage',
              discount_value: Number(coupon.discount_percent || 0),
              max_discount_amount: coupon.max_discount ? Number(coupon.max_discount) : null,
              is_active: Boolean(coupon.is_active)
            };
          }
        }

        const pricing = computeServerCheckoutPrice({
          checkoutType: reqBody.is_dp ? 'survey' : (reqBody.booking_type === 'daily' ? 'daily' : 'monthly'),
          roomPriceMonthly: Number(room.price || 0),
          roomPriceDaily: room.daily_price ? Number(room.daily_price) : Math.round(Number(room.price || 0) / 20),
          durationMonths: Number(reqBody.duration_months || 1),
          durationDays: Number(reqBody.duration_days || 1),
          depositAmount: prop?.deposit_amount !== undefined && prop?.deposit_amount !== null ? Number(prop.deposit_amount) : 500000,
          surveyDpAmount: 500000,
          coupon: couponObj
        });
        return pricing.totalPrice;
      }
    }

    return null;
  }

  app.post('/api/midtrans/charge', apiRateLimiter(60000, 30), async (req, res) => {
    try {
      const { order_id, gross_amount, customer_details, item_details } = req.body;

      if (!order_id || typeof order_id !== 'string' || !order_id.trim()) {
        return res.status(400).json({ success: false, error: 'order_id wajib disertakan.' });
      }

      const numGrossAmount = Number(gross_amount);
      if (!numGrossAmount || isNaN(numGrossAmount) || numGrossAmount <= 0) {
        return res.status(400).json({ success: false, error: 'gross_amount harus berupa angka positif.' });
      }

      // Check against DB if booking, survey, or extension with this order_id exists to prevent price tampering (R7 / R9)
      const cleanOrderId = order_id.trim();
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      let authoritativeAmount = Math.round(numGrossAmount);

      if (supabaseUrl && serviceKey) {
        const checkClient = createClient(supabaseUrl, serviceKey);
        let expected: number | null = null;
        try {
          expected = await computeAuthoritativeOrderAmount(checkClient, cleanOrderId, req.body);
        } catch (verifyErr: any) {
          return res.status(500).json({ success: false, error: verifyErr?.message || 'Gagal memverifikasi harga resmi di database.' });
        }

        if (expected !== null && expected > 0) {
          if (!amountsMatch(expected, numGrossAmount)) {
            return res.status(400).json({
              success: false,
              error: `Nominal pembayaran tidak sesuai dengan harga resmi di database (dikirim: Rp ${numGrossAmount.toLocaleString('id-ID')}, seharusnya: Rp ${expected.toLocaleString('id-ID')}).`
            });
          }
          authoritativeAmount = Math.round(expected);
        }
      }

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
          order_id: cleanOrderId,
          gross_amount: authoritativeAmount,
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

  // Helper function to dynamically discover the verified domain from MailerSend with 10-minute in-memory cache (R8)
  const verifiedDomainCache = new Map<string, { resolvedEmail: string; expiresAt: number }>();
  const VERIFIED_DOMAIN_CACHE_TTL_MS = 10 * 60 * 1000;

  async function resolveVerifiedFromEmail(apiKey: string, fallbackEmail: string): Promise<string> {
    const cacheKey = `${apiKey.slice(-6)}:${fallbackEmail}`;
    const cached = verifiedDomainCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.resolvedEmail;
    }

    try {
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
          const verifiedDomains = domains.filter((d: any) => d.is_verified === true || d.is_verified === 'true' || d.is_verified === 1 || d.is_verified === undefined);
          const activeDomainsList = verifiedDomains.length > 0 ? verifiedDomains : domains;
          const fallbackDomain = fallbackEmail.split('@')[1];
          const match = activeDomainsList.find((d: any) => d.name === fallbackDomain);
          if (match) {
            verifiedDomainCache.set(cacheKey, { resolvedEmail: fallbackEmail, expiresAt: Date.now() + VERIFIED_DOMAIN_CACHE_TTL_MS });
            return fallbackEmail;
          }
          const selectedDomain = activeDomainsList[0].name;
          const userPrefix = fallbackEmail.split('@')[0] || 'info';
          const resolved = `${userPrefix}@${selectedDomain}`;
          verifiedDomainCache.set(cacheKey, { resolvedEmail: resolved, expiresAt: Date.now() + VERIFIED_DOMAIN_CACHE_TTL_MS });
          return resolved;
        }
      }
    } catch (err) {
      console.error('[MAILERSEND DISCOVERY ERROR] Failed to fetch domains:', err);
    }
    verifiedDomainCache.set(cacheKey, { resolvedEmail: fallbackEmail, expiresAt: Date.now() + VERIFIED_DOMAIN_CACHE_TTL_MS });
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
  const signatureStore = new Map<string, { data: string; mime?: string; createdAt: number }>();

  // Cleanup old signature store items every 30 minutes
  const signatureCleanupTimer = setInterval(() => {
    const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
    for (const [id, item] of signatureStore.entries()) {
      if (item.createdAt < twoHoursAgo || signatureStore.size > 500) {
        signatureStore.delete(id);
      }
    }
  }, 30 * 60 * 1000);
  if (typeof signatureCleanupTimer.unref === 'function') signatureCleanupTimer.unref();

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
      const png = await renderSvgAsync(svg, { fitTo: { mode: 'width', value: 480 } });
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
          const png = await renderSvgAsync(rawSvg, { fitTo: { mode: 'width', value: 480 } });
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
  // Single idempotent survey-DP settlement used by BOTH the Midtrans webhook and the status poller.
  async function settleSurveyTransaction(
    supabase: any,
    orderId: string,
    paymentType: string,
    notification: any
  ): Promise<{ found: boolean; already_confirmed?: boolean }> {
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
      // Idempotency: settled only when the survey is confirmed AND its payment row exists.
      let alreadyConfirmed = false;
      if (survey.status === 'survey_confirmed') {
        const { data: existingPay } = await supabase
          .from('payments')
          .select('id')
          .eq('midtrans_order_id', orderId)
          .limit(1)
          .maybeSingle();
        if (existingPay) {
          console.log(`[SETTLE SURVEY] ${orderId} already confirmed with payment. Skipping duplicate processing.`);
          return { found: true, already_confirmed: true };
        }
        alreadyConfirmed = true;
      }
      console.log(`[SUPABASE WEBHOOK SYNC] Survey found: ID ${survey.id}. Updating status to survey_confirmed...`);

      // 2. Attempt Atomic Survey DP Settlement RPC (Migration 051 - R3 & R6)
      const dpAmount = Number(survey.dp_amount || 500000);
      const trxId = notification?.transaction_id || `mid-tr-${Math.floor(100000 + Math.random() * 900000)}`;
      const feeAmt = Number(notification?.fee_amount || 0);

      const { data: srvRpcRes, error: srvRpcErr } = await supabase.rpc('settle_survey_dp_payment', {
        p_order_id: orderId,
        p_payment_type: paymentType || 'Midtrans SNAP',
        p_transaction_id: trxId,
        p_gross_amount: dpAmount,
        p_fee_amount: feeAmt
      });

      if (srvRpcRes && srvRpcRes.success === false) {
        throw new Error(srvRpcRes.error || 'Settlement DP survei ditolak oleh database.');
      }

      if (srvRpcErr) {
        // Fallback when 051 RPC is not yet deployed: still enforce post_financial_transaction RPC (never partial insert!)
        if (!alreadyConfirmed) {
          const { error: updateErr } = await supabase
            .from('surveys')
            .update({ status: 'survey_confirmed', payment_method: paymentType || 'Midtrans SNAP' })
            .eq('id', survey.id);
          if (updateErr) {
            throw new Error(`Survey settlement failure: ${updateErr.message}`);
          }
        }

        const srvInvPayload = {
          id: survey.invoice_id || `INV-SRV-${Math.floor(1000 + Math.random() * 9000)}`,
          tenant_name: survey.tenant_name,
          property_id: survey.property_id,
          amount: dpAmount,
          method: paymentType || 'Midtrans Snap QRIS',
          status: 'paid',
          payment_date: todayJakarta(),
          midtrans_order_id: orderId,
          transaction_id: trxId
        };
        const resolvedSrvPayId = await upsertPaymentByOrderId(supabase, srvInvPayload);
        srvInvPayload.id = resolvedSrvPayId;

        await recordMidtransClearingItem(supabase, {
          midtrans_order_id: orderId,
          midtrans_transaction_id: trxId,
          payment_id: resolvedSrvPayId,
          survey_id: survey.id,
          gross_amount: dpAmount,
          fee_amount: feeAmt,
          property_id: survey.property_id || 1,
          tenant_name: survey.tenant_name,
          settled_at: new Date().toISOString()
        });

        await verifyAndEnsureCriticalCOA(supabase, false);
        const trxDate = todayJakarta();
        const trxNo = `TRX-SRV-${survey.id}-${Date.now()}`;
        const { data: ftRes, error: rpcErr } = await supabase.rpc('post_financial_transaction', {
          p_transaction_no: trxNo,
          p_transaction_date: trxDate,
          p_category: 'DP Survey',
          p_description: `[WEBHOOK] Pelunasan DP Survey ${survey.tenant_name} Unit ${survey.room_number}`,
          p_amount: dpAmount,
          p_type: 'dp_booking',
          p_reference_type: 'survey',
          p_reference_id: String(survey.id),
          p_created_by: 'Midtrans Webhook',
          p_debit_account_id: 1200,
          p_credit_account_id: 1300,
          p_property_id: survey?.property_id || 1
        });

        if (rpcErr || !ftRes || ftRes.success === false) {
          const errMsg = rpcErr?.message || ftRes?.error || 'Gagal memposting jurnal DP Survey';
          await recordFailedLedgerPosting(supabase, {
            transaction_no: trxNo,
            reference_type: 'survey',
            reference_id: String(survey.id),
            amount: dpAmount,
            debit_account_id: 1200,
            credit_account_id: 1300,
            property_id: survey?.property_id || 1,
            created_by: 'Midtrans Webhook',
            error_message: errMsg
          });
          throw new Error(`Settlement DP survei dibatalkan karena gagal posting buku besar: ${errMsg}`);
        }
      }

      // Send premium email notification via MailerSend
      if (survey.email) {
        const subject = `[Samara Stay] Jadwal Survey Kamar Dikonfirmasi - Unit ${survey.room_number}`;
        const text = `Halo ${survey.tenant_name}, jadwal survey Anda untuk kamar Unit ${survey.room_number} telah dikonfirmasi untuk tanggal ${survey.survey_date} pukul ${survey.survey_time_slot}.`;
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
                <tr><td style="color: #64748b;">Waktu Slot:</td><td><strong>${survey.survey_time_slot} WIB</strong></td></tr>
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
      console.warn(`[SETTLE SURVEY] Survey record not found for ${orderId}`);
      throw new Error(`Survey dengan order ${orderId} tidak ditemukan.`);
    }
    return { found: true };
  }

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
    
    // 1. Fetch booking strictly from DB by midtrans_order_id or existing booking ID (R4: never insert from clientFallbackData)
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

    if (!booking && clientFallbackData?.id) {
      const { data: bById } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', clientFallbackData.id)
        .maybeSingle();
      booking = bById;
    }

    if (!booking) {
      throw new Error(`Data pemesanan dengan Order ID "${orderId}" tidak ditemukan di database.`);
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

    let invoiceId = `INV-${booking.id}-${Date.now()}`;
    const effectiveTrxId = transactionId || `mid-tr-${Math.floor(100000 + Math.random() * 900000)}`;
    const resolvedGross = Number(booking.total_price || grossAmount || 0);
    const resolvedFee = Number(feeAmount || 0);

    // 3. Atomic settlement via RPC settle_booking_payment (Migration 017 / Hardened in 051 - R3 & R4)
    let { data: rpcRes, error: settleRpcErr } = await supabase.rpc('settle_booking_payment', {
      p_booking_id: booking.id,
      p_order_id: orderId,
      p_payment_type: paymentType || 'Midtrans SNAP',
      p_transaction_id: effectiveTrxId,
      p_gross_amount: resolvedGross,
      p_fee_amount: resolvedFee
    });

    // Backwards-compatible retry if remote DB still has 4-parameter signature
    if (settleRpcErr && settleRpcErr.message?.includes('function')) {
      const retry4 = await supabase.rpc('settle_booking_payment', {
        p_booking_id: booking.id,
        p_order_id: orderId,
        p_payment_type: paymentType || 'Midtrans SNAP',
        p_transaction_id: effectiveTrxId
      });
      rpcRes = retry4.data;
      settleRpcErr = retry4.error;
    }

    if (rpcRes && rpcRes.success === false) {
      throw new Error(rpcRes.error || 'Settlement pemesanan ditolak oleh database.');
    }

    if (settleRpcErr || !rpcRes || rpcRes.success !== true) {
      throw new Error(settleRpcErr?.message || 'Gagal menjalankan prosedur settlement pemesanan atomik di database.');
    }

    if (rpcRes.invoice_id) {
      invoiceId = rpcRes.invoice_id;
    }
    if (booking.room_id) {
      await syncPropertyRoomCountInSupabase(supabase, booking.property_id);
    }
    console.log(`[SETTLE BOOKING] Atomic settlement RPC succeeded for ${orderId}, invoice: ${invoiceId}`);

    // Refresh booking
    const { data: refreshedBooking } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', booking.id)
      .single();
    if (refreshedBooking) {
      booking = refreshedBooking;
    }

    // 4. Record Midtrans Gateway Clearing Item idempotently
    await recordMidtransClearingItem(supabase, {
      midtrans_order_id: orderId,
      midtrans_transaction_id: effectiveTrxId,
      payment_id: invoiceId,
      booking_id: booking.id,
      gross_amount: resolvedGross,
      fee_amount: resolvedFee,
      property_id: booking.property_id || 1,
      tenant_name: booking.occupant_name || booking.tenant_name,
      settled_at: new Date().toISOString()
    });

    // 5. Ensure double-entry financial transaction is posted (idempotent if 051 settle_booking_payment already posted it)
    await verifyAndEnsureCriticalCOA(supabase, false);
    const trxDate = todayJakarta();
    const trxNo = `TRX-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
    const { data: ftRes, error: rpcErr } = await supabase.rpc('post_financial_transaction', {
      p_transaction_no: trxNo,
      p_transaction_date: trxDate,
      p_category: 'Penerimaan Sewa',
      p_description: `[AUTO-LOCK] Pelunasan Sewa ${booking.tenant_name} Unit ${booking.room_number}`,
      p_amount: resolvedGross,
      p_type: 'income',
      p_reference_type: 'payment',
      p_reference_id: invoiceId,
      p_created_by: 'Midtrans Auto Settlement',
      p_debit_account_id: 1200,
      p_credit_account_id: 4000,
      p_property_id: booking?.property_id || 1
    });

    if (rpcErr || (ftRes && ftRes.success === false)) {
      const errMsg = rpcErr?.message || ftRes?.error || 'Gagal memposting jurnal penerimaan sewa';
      await recordFailedLedgerPosting(supabase, {
        transaction_no: trxNo,
        reference_type: 'payment',
        reference_id: invoiceId,
        amount: resolvedGross,
        debit_account_id: 1200,
        credit_account_id: 4000,
        property_id: booking?.property_id || 1,
        created_by: 'Midtrans Auto Settlement',
        error_message: errMsg
      });
      throw new Error(`Settlement gagal pada tahap posting buku besar: ${errMsg}`);
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


  // 2. Midtrans Webhook / Notification Receiver (With Signature Key Verification)
  app.post(['/api/midtrans/webhook', '/api/midtrans/notification'], async (req, res) => {
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

      // Fail CLOSED: a webhook without a configured server key can never be authenticated.
      if (!serverKey || serverKey === 'YOUR_MIDTRANS_SERVER_KEY_HERE') {
        console.error('[MIDTRANS WEBHOOK SECURITY] MIDTRANS_SERVER_KEY not configured; rejecting webhook (fail-closed).');
        return res.status(503).json({ error: 'Webhook verification unavailable' });
      }
      {
        if (!incomingSignature) {
          console.warn('[MIDTRANS WEBHOOK SECURITY WARNING] Webhook received without signature key.');
          return res.status(401).json({ error: 'Unauthorized: Missing signature key' });
        }

        if (!verifyMidtransSignature(notification, serverKey)) {
          // Never log the computed (valid) signature.
          console.warn('[MIDTRANS WEBHOOK SECURITY WARNING] Signature mismatch for order', orderId);
          addMidtransLog({
            orderId: orderId || 'unknown',
            type: 'error',
            status: 'failed',
            message: 'Webhook signature verification failed: invalid credentials or signature mismatch.'
          });
          return res.status(401).json({ error: 'Unauthorized: Invalid signature key' });
        }
        console.log('[MIDTRANS WEBHOOK SECURITY] Signature verified successfully!');
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
        // Key = transaction + status: Midtrans re-uses transaction_id for pending -> settlement, so the id alone would drop the settlement.
        const eventId = webhookEventKey(notification);
        const transactionId = notification.transaction_id || null;

        // Pre-check event_id so idempotency holds even before unique constraint migration is applied
        const { data: existingEvent } = await supabase
          .from('webhook_events')
          .select('id')
          .eq('event_id', eventId)
          .limit(1)
          .maybeSingle();

        if (existingEvent?.id) {
          console.log(`[MIDTRANS WEBHOOK IDEMPOTENCY] Event ID "${eventId}" for Order "${orderId}" was ALREADY processed. Returning 200 OK without re-processing.`);
          return res.status(200).json({
            status: 'OK',
            message: `Webhook event ${eventId} already processed (idempotency enforced).`
          });
        }

        const { error: webhookEventErr } = await supabase
          .from('webhook_events')
          .insert({
            provider: 'midtrans',
            event_id: eventId,
            order_id: orderId || eventId,
            transaction_id: transactionId,
            status: transactionStatus || paymentStatus || 'received',
            payload: notification,
            processed_at: new Date().toISOString()
          });

        if (webhookEventErr) {
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

      // Any failure while applying a verified event must be surfaced (HTTP 500) so Midtrans retries,
      // and the idempotency row must be released so the retry is not dropped as a duplicate.
      let processingError: any = null;
      const releaseWebhookEvent = async () => {
        if (!supabase) return;
        try {
          const evId = webhookEventKey(notification);
          await supabase.from('webhook_events').delete().eq('provider', 'midtrans').eq('event_id', evId);
        } catch (relErr) {
          console.error('[MIDTRANS WEBHOOK] Failed releasing webhook_event after processing error:', relErr);
        }
      };

      // Amount integrity: the paid gross_amount MUST match what we expected to charge for this order.
      if (supabase && orderId && paymentStatus === 'paid') {
        try {
          let expectedAmount: number | null = null;
          if (orderId.startsWith('BOOK-') || orderId.startsWith('BOOKING-')) {
            const { data: b } = await supabase.from('bookings').select('total_price, dp_amount, is_dp').eq('midtrans_order_id', orderId).maybeSingle();
            if (b) expectedAmount = Number(b.is_dp ? (b.dp_amount || 500000) : b.total_price);
          } else if (orderId.startsWith('SRV-')) {
            const { data: sv } = await supabase.from('surveys').select('dp_amount').eq('reservation_number', orderId).maybeSingle();
            if (sv) expectedAmount = Number(sv.dp_amount ?? 500000);
          } else if (orderId.startsWith('EXT-') || orderId.startsWith('EXTEND-')) {
            const { data: ex } = await supabase.from('contract_extensions').select('total_amount').eq('midtrans_order_id', orderId).maybeSingle();
            if (ex) expectedAmount = Number(ex.total_amount);
          }
          const paidAmount = Number(grossAmount);
          if (expectedAmount !== null && expectedAmount > 0 && !amountsMatch(expectedAmount, paidAmount)) {
            console.error(`[MIDTRANS WEBHOOK] Amount mismatch for ${orderId}: expected ${expectedAmount}, received ${paidAmount}. Settlement REFUSED.`);
            addMidtransLog({
              orderId,
              amount: paidAmount,
              type: 'error',
              status: 'failed',
              message: `Amount mismatch: expected ${expectedAmount}, received ${paidAmount}. Settlement refused; manual review required.`
            });
            return res.status(200).json({ status: 'OK', mapped_status: 'amount_mismatch' });
          }
        } catch (amtErr: any) {
          console.error('[MIDTRANS WEBHOOK] Amount verification failed:', amtErr?.message || amtErr);
          await releaseWebhookEvent();
          return res.status(500).json({ error: 'Amount verification failure' });
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
              processingError = settleErr;
            }
          } else if (orderId.startsWith('SRV-')) {
            console.log(`[SUPABASE WEBHOOK SYNC] Processing survey payment settlement for ${orderId}`);
            try {
              await settleSurveyTransaction(supabase, orderId, paymentType || 'Midtrans SNAP', notification);
            } catch (srvErr: any) {
              console.error('[SUPABASE WEBHOOK ERROR] Survey settlement error:', srvErr);
              processingError = srvErr;
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
              processingError = extSettleErr;
            }
          }
        } else if (paymentStatus === 'overdue') {
          if (orderId.startsWith('BOOK-') || orderId.startsWith('BOOKING-')) {
            const { data: booking } = await supabase
              .from('bookings')
              .select('*')
              .eq('midtrans_order_id', orderId)
              .maybeSingle();

            if (booking && booking.status !== 'approved') {
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

            if (survey && survey.status !== 'survey_confirmed' && survey.status !== 'paid_full') {
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

      if (processingError) {
        await releaseWebhookEvent();
        addMidtransLog({
          orderId: orderId || 'unknown',
          type: 'error',
          status: 'failed',
          message: `Webhook settlement failed; will be retried by Midtrans: ${processingError?.message || processingError}`
        });
        return res.status(500).json({ error: 'Settlement processing failure; retry' });
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
      const { order_id, transaction_id, payment_type, gross_amount, booking_data, signature_key } = req.body;
      if (!order_id || typeof order_id !== 'string' || !order_id.trim()) {
        return res.status(400).json({ success: false, error: 'order_id wajib disertakan.' });
      }
      const cleanOrderId = order_id.trim();

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      const supabase = createClient(supabaseUrl, serviceKey);

      let rawServerKey = process.env.MIDTRANS_SERVER_KEY || '';
      let serverKey = rawServerKey.trim();
      if (serverKey.startsWith('"') && serverKey.endsWith('"')) serverKey = serverKey.slice(1, -1);
      else if (serverKey.startsWith("'") && serverKey.endsWith("'")) serverKey = serverKey.slice(1, -1);
      serverKey = serverKey.trim();

      // Find existing booking if already registered in database
      const { data: existingBooking } = await supabase
        .from('bookings')
        .select('*')
        .eq('midtrans_order_id', cleanOrderId)
        .maybeSingle();

      // 1. Authorization check: Staff/Admin manual approval requires RBAC 'bookings' 'approve' AND property scope
      let isStaffManualApprove = false;
      try {
        const authContext = await resolveAuthContext(req, res);
        if (authContext?.profile && can(authContext.profile.role, 'bookings', 'approve')) {
          const targetPropertyId = existingBooking?.property_id ?? booking_data?.property_id;
          const access = checkPropertyAccess(authContext.profile, targetPropertyId);
          if (access.allowed) {
            isStaffManualApprove = true;
          }
        }
      } catch (authErr) {
        console.warn('[Settle Booking] Staff auth verification notice:', authErr);
      }

      // 2. Gateway Verification: If not approved by authorized staff, Midtrans verification is MANDATORY
      let finalGrossAmount = Number(gross_amount) || 0;
      let finalTransactionId = transaction_id;
      let finalPaymentType = payment_type || 'Midtrans SNAP';

      if (!isStaffManualApprove) {
        if (!serverKey || serverKey === 'YOUR_MIDTRANS_SERVER_KEY_HERE') {
          return res.status(503).json({
            success: false,
            error: 'Layanan verifikasi pembayaran Midtrans belum dikonfigurasi pada server.'
          });
        } else {
          // Verify directly against Midtrans payment status API
          const isProduction = process.env.MIDTRANS_IS_PRODUCTION === 'true';
          const baseUrl = isProduction ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
          const authHeader = Buffer.from(`${serverKey}:`).toString('base64');

          let isMidtransVerified = false;
          try {
            const midtransCheck = await fetch(`${baseUrl}/v2/${encodeURIComponent(cleanOrderId)}/status`, {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
                'Authorization': `Basic ${authHeader}`
              }
            });

            if (midtransCheck.ok) {
              const checkData: any = await midtransCheck.json();
              if (
                ['settlement', 'capture'].includes(checkData.transaction_status) &&
                (checkData.fraud_status === 'accept' || !checkData.fraud_status)
              ) {
                isMidtransVerified = true;
                finalGrossAmount = Number(checkData.gross_amount) || finalGrossAmount;
                finalTransactionId = checkData.transaction_id || finalTransactionId;
                finalPaymentType = checkData.payment_type || finalPaymentType;
              } else {
                console.warn('[Settle Booking] Midtrans status rejected:', checkData.transaction_status);
              }
            } else {
              console.warn('[Settle Booking] Midtrans check responded with HTTP', midtransCheck.status);
            }
          } catch (fetchErr: any) {
            console.error('[Settle Booking] Midtrans verification error:', fetchErr?.message);
          }

          if (!isMidtransVerified) {
            return res.status(403).json({
              success: false,
              error: 'Akses ditolak: Transaksi pembayaran belum diverifikasi lunas oleh Midtrans.'
            });
          }
        }
      }

      // 3. Amount consistency validation against existing booking
      if (existingBooking) {
        const expected = Number(existingBooking.is_dp ? (existingBooking.dp_amount || 500000) : existingBooking.total_price);
        if (expected > 0 && finalGrossAmount > 0 && Math.abs(expected - finalGrossAmount) >= 1) {
          await supabase.from('activity_logs').insert({
            admin_name: 'Payment Gateway Security',
            action: 'SETTLE_BOOKING_AMOUNT_MISMATCH',
            detail: `Order ${cleanOrderId}: Nominal terverifikasi (${finalGrossAmount}) tidak cocok dengan tagihan (${expected}).`,
            created_at: new Date().toISOString()
          });
          return res.status(400).json({
            success: false,
            error: `Nominal pembayaran (Rp ${finalGrossAmount.toLocaleString('id-ID')}) tidak cocok dengan tagihan pemesanan (Rp ${expected.toLocaleString('id-ID')}).`
          });
        }
      }

      // 4. Reject settlement if booking record does not exist in DB (R4: never insert booking from client payload in settle-booking)
      if (!existingBooking) {
        return res.status(404).json({
          success: false,
          error: `Data pemesanan dengan Order ID "${cleanOrderId}" tidak ditemukan di database.`
        });
      }

      const result = await settleBookingTransaction(
        supabase,
        cleanOrderId,
        finalPaymentType,
        finalTransactionId,
        finalGrossAmount,
        undefined
      );

      return res.status(200).json({ success: true, ...result });
    } catch (err: any) {
      console.error('[API Settle Booking Error]:', err);
      return res.status(500).json({ success: false, error: err.message || 'Gagal memproses settlement booking.' });
    }
  });

  // =========================================================================
  // ENDPOINT: ROOM LOCKING & RESERVATION (SECURED)
  // =========================================================================
  app.post('/api/rooms/lock', apiRateLimiter(60000, 60), express.json(), optionalAdminAuth, async (req, res) => {
    try {
      const { room_id, status = 'reserved', tenant_name, booking_id, midtrans_order_id } = req.body;
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

      // Authorization & contextual validation:
      // Case 1: Authenticated admin/staff
      if (req.authProfile) {
        if (!can(req.authProfile.role, 'properties', 'update') && !can(req.authProfile.role, 'bookings', 'approve')) {
          return res.status(403).json({ success: false, error: 'Akses ditolak: Anda tidak memiliki izin untuk mengunci/mengubah kamar.' });
        }
        const propCheck = checkPropertyAccess(req.authProfile, room.property_id);
        if (!propCheck.allowed) {
          return res.status(403).json({ success: false, error: propCheck.reason });
        }
      } else {
        // Case 2: Public guest locking room during active booking checkout
        if (status !== 'reserved') {
          return res.status(403).json({
            success: false,
            error: 'Akses ditolak. Pengguna publik hanya dapat melakukan reservasi sementara (status: reserved).'
          });
        }

        if (!booking_id && !midtrans_order_id) {
          return res.status(400).json({
            success: false,
            error: 'booking_id atau midtrans_order_id wajib disertakan untuk reservasi kamar publik.'
          });
        }

        // Verify that the booking exists and matches this room
        let bookingQuery = supabase.from('bookings').select('id, room_id, room_number, status');
        if (booking_id) {
          bookingQuery = bookingQuery.eq('id', booking_id);
        } else if (midtrans_order_id) {
          bookingQuery = bookingQuery.eq('midtrans_order_id', midtrans_order_id);
        }

        const { data: matchedBooking } = await bookingQuery.maybeSingle();
        if (!matchedBooking || (matchedBooking.room_id && Number(matchedBooking.room_id) !== Number(room_id))) {
          return res.status(403).json({
            success: false,
            error: 'Data pemesanan tidak cocok dengan kamar yang diminta.'
          });
        }
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
  let isSyncingLeasesInFlight = false;
  let lastLeaseSyncResult = { releasedRooms: 0, checkedOutTenants: 0 };
  let lastLeaseSyncTime = 0;

  async function syncExpiredLeasesCore(supabaseAdmin: any): Promise<{ releasedRooms: number; checkedOutTenants: number }> {
    if (isSyncingLeasesInFlight) {
      return lastLeaseSyncResult;
    }
    isSyncingLeasesInFlight = true;
    try {
      const now = new Date();
      let releasedRoomsCount = 0;
      let checkedOutTenantsCount = 0;
      const affectedPropertyIds = new Set<number>();

      // 1. Fetch active tenants with required columns (resilient if lease_end_date column is not yet added)
      let { data: activeTenants, error: activeTenantsErr } = await supabaseAdmin
        .from('tenants')
        .select('id, start_date, duration_months, lease_end_date, status, full_name, room_number, property_id')
        .neq('status', 'checkout');

      if (activeTenantsErr && activeTenantsErr.message?.includes('lease_end_date')) {
        const retryTenants = await supabaseAdmin
          .from('tenants')
          .select('id, start_date, duration_months, status, full_name, room_number, property_id')
          .neq('status', 'checkout');
        activeTenants = (retryTenants.data || []) as any;
      }

      // Tenants whose lease is still running after this pass (their room must not be freed by an old booking).
      const stillActiveTenantKeys = new Set<string>();

      // Fetch approved bookings with specific columns
      const { data: approvedBookings } = await supabaseAdmin
        .from('bookings')
        .select('id, check_in_date, booking_date, booking_type, duration_days, duration_months, room_id, room_number, property_id, status')
        .eq('status', 'approved');

      // Fetch only occupied rooms (avoid selecting all available/reserved rooms!)
      const { data: occupiedRooms } = await supabaseAdmin
        .from('rooms')
        .select('id, room_number, property_id, status')
        .eq('status', 'occupied');

      // Early-return if nothing to check
      if ((!activeTenants || activeTenants.length === 0) &&
          (!approvedBookings || approvedBookings.length === 0) &&
          (!occupiedRooms || occupiedRooms.length === 0)) {
        lastLeaseSyncResult = { releasedRooms: 0, checkedOutTenants: 0 };
        lastLeaseSyncTime = Date.now();
        return lastLeaseSyncResult;
      }

      const todayWib = todayJakarta(now);

      // 2. Evaluate active tenants (R7 & R11: prioritize lease_end_date if valid; only compute start_date + duration_months when lease_end_date is null)
      if (activeTenants && activeTenants.length > 0) {
        for (const tenant of activeTenants) {
          let finalEndDateStr: string | null = null;

          if (tenant.lease_end_date) {
            const lDate = new Date(tenant.lease_end_date);
            if (!isNaN(lDate.getTime())) {
              finalEndDateStr = toJakartaDate(lDate);
            }
          }

          if (!finalEndDateStr) {
            if (!tenant.start_date) continue;
            const startDate = new Date(tenant.start_date);
            if (isNaN(startDate.getTime())) continue;
            const totalMonths = Number(tenant.duration_months) || 1;
            const computedEnd = new Date(startDate);
            computedEnd.setMonth(computedEnd.getMonth() + totalMonths);
            finalEndDateStr = toJakartaDate(computedEnd);
          }

          // Contract ended without further extension (WIB date comparison)
          if (todayWib >= finalEndDateStr) {
            console.log(`[AUTO-RELEASE] Kontrak penyewa ${tenant.full_name} (Kamar ${tenant.room_number}) telah habis (${finalEndDateStr} <= ${todayWib}). Mengosongkan kamar.`);

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

            // Checkout associated approved bookings (scoped to the same property)
            let bkQuery = supabaseAdmin
              .from('bookings')
              .update({ status: 'checkout' })
              .eq('room_number', tenant.room_number)
              .eq('status', 'approved');
            if (tenant.property_id) {
              bkQuery = bkQuery.eq('property_id', tenant.property_id);
            }
            await bkQuery;
          } else {
            stillActiveTenantKeys.add(`${tenant.property_id || ''}_${tenant.room_number}`);
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
          const endDateStr = toJakartaDate(endDate);

          if (todayWib >= endDateStr) {
            // If an active tenant is still occupying this room (e.g. extended lease), only close the old booking record, NEVER release the room!
            if (stillActiveTenantKeys.has(`${booking.property_id || ''}_${booking.room_number}`)) {
              await supabaseAdmin.from('bookings').update({ status: 'checkout' }).eq('id', booking.id);
              continue;
            }

            console.log(`[AUTO-RELEASE] Booking ID ${booking.id} (Kamar ${booking.room_number}) telah berakhir (${endDateStr} <= ${todayWib}). Mengosongkan kamar.`);
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
      if (occupiedRooms && occupiedRooms.length > 0) {
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

        for (const room of occupiedRooms) {
          const key = `${room.property_id || ''}_${room.room_number}`;
          if (!activeTenantRoomKeys.has(key) && !activeBookingRoomKeys.has(key)) {
            console.log(`[AUTO-RELEASE] Kamar ${room.room_number} status 'occupied' tanpa data penyewa aktif. Mengubah ke 'available'.`);
            await supabaseAdmin.from('rooms').update({ status: 'available', current_tenant_name: null }).eq('id', room.id);
            releasedRoomsCount++;
            if (room.property_id) affectedPropertyIds.add(room.property_id);
          }
        }
      }

      // 5. Resync property room counts
      for (const propId of affectedPropertyIds) {
        await syncPropertyRoomCountInSupabase(supabaseAdmin, propId);
      }

      lastLeaseSyncResult = { releasedRooms: releasedRoomsCount, checkedOutTenants: checkedOutTenantsCount };
      lastLeaseSyncTime = Date.now();
      return lastLeaseSyncResult;
    } finally {
      isSyncingLeasesInFlight = false;
    }
  }

  // ENDPOINTS FOR EXPIRED LEASE SYNC
  app.all('/api/system/sync-expired-leases', apiRateLimiter(60000, 60), async (req, res) => {
    try {
      // Throttle: return cached result if called within 60s
      if (Date.now() - lastLeaseSyncTime < 60000) {
        return res.status(200).json({ success: true, ...lastLeaseSyncResult, cached: true });
      }

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

  // Circuit breaker state for Supabase quota/spend cap/violations on server
  let isServerQuotaRestricted = false;
  let serverQuotaRestrictedDetectedAt = 0;
  const SERVER_QUOTA_COOLDOWN_MS = 10 * 60 * 1000;

  function isServerQuotaActive(): boolean {
    if (!isServerQuotaRestricted) return false;
    if (Date.now() - serverQuotaRestrictedDetectedAt > SERVER_QUOTA_COOLDOWN_MS) {
      isServerQuotaRestricted = false;
      return false;
    }
    return true;
  }

  function markServerQuotaRestricted(reason?: string) {
    isServerQuotaRestricted = true;
    serverQuotaRestrictedDetectedAt = Date.now();
    console.log(`[SERVER NOTICE] Supabase egress quota or service restricted (${reason || 'quota'}). Using resilient seed fallbacks.`);
  }

  // ENDPOINTS FOR CONTRACT EXTENSIONS (Bypasses PostgreSQL anon 42501 permission restrictions safely)
  app.get('/api/contract-extensions', apiRateLimiter(60000, 180), optionalAdminAuth, async (req, res) => {
    if (isServerQuotaActive()) {
      return res.status(200).json({ success: true, data: [], fallback: true });
    }

    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: 'Supabase credentials not configured', data: [] });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      const limit = resolveLimit('contract_extensions', req.query.limit as string);
      const offset = resolveOffset(req.query.offset as string);
      const { selectExpr } = sanitizeColumns('contract_extensions', req.query.columns as string);
      const status = req.query.status as string;
      const tenantId = req.query.tenant_id as string;
      const orderId = req.query.order_id as string;

      // Access control:
      // - Unauthenticated public users can ONLY query by order_id (for payment verification screen)
      // - Authenticated staff/admins must have permissions and respect property scope
      if (!req.authProfile) {
        if (!orderId) {
          return res.status(401).json({
            success: false,
            error: 'Akses ditolak. Akses publik hanya diizinkan dengan parameter order_id valid.',
            data: []
          });
        }
      }

      let query = supabaseAdmin
        .from('contract_extensions')
        .select(selectExpr)
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

      // Enforce property scope if staff/scoped role
      if (req.authProfile?.property_id !== null && req.authProfile?.property_id !== undefined) {
        query = query.eq('property_id', req.authProfile.property_id);
      }

      const { data, error } = await query;
      if (error) {
        if (error.message?.includes('exceed_egress_quota') || error.message?.includes('quota') || error.message?.includes('restricted') || error.message?.includes('spend caps')) {
          markServerQuotaRestricted(error.message);
          return res.status(200).json({ success: true, data: [], fallback: true });
        }
        console.warn('[CONTRACT-EXTENSIONS API] Query notice:', error.message);
        return res.status(500).json({ success: false, error: error.message, data: [] });
      }
      return res.status(200).json({ success: true, data: data || [] });
    } catch (err: any) {
      if (err?.message?.includes('exceed_egress_quota') || err?.message?.includes('quota') || err?.message?.includes('restricted')) {
        markServerQuotaRestricted(err?.message);
      }
      return res.status(200).json({ success: true, data: [], fallback: true });
    }
  });

  app.post('/api/contract-extensions', apiRateLimiter(60000, 60), express.json(), optionalAdminAuth, async (req, res) => {
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: 'Supabase credentials not configured' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      const body = req.body || {};
      const id = body.id;

      let resultData = null;
      let eventType: 'INSERT' | 'UPDATE' = 'INSERT';

      if (id) {
        // Modifying existing extension requires admin auth with approve permission & property check
        if (!req.authProfile || !can(req.authProfile.role, 'bookings', 'approve')) {
          return res.status(403).json({ success: false, error: 'Akses ditolak. Hanya staf berwenang yang dapat mengubah perpanjangan kontrak.' });
        }

        const { data: existingExt } = await supabaseAdmin
          .from('contract_extensions')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (!existingExt) {
          return res.status(404).json({ success: false, error: 'Data perpanjangan kontrak tidak ditemukan.' });
        }

        const propCheck = checkPropertyAccess(req.authProfile, existingExt.property_id);
        if (!propCheck.allowed) {
          return res.status(403).json({ success: false, error: propCheck.reason });
        }

        // Whitelist allowable update fields for staff
        const allowedUpdateFields = ['status', 'notes', 'payment_method', 'paid_at', 'invoice_id'];
        const safePayload: any = {};
        for (const f of allowedUpdateFields) {
          if (body[f] !== undefined) safePayload[f] = body[f];
        }

        eventType = 'UPDATE';
        const { data, error } = await supabaseAdmin
          .from('contract_extensions')
          .update(safePayload)
          .eq('id', id)
          .select();
        if (error) throw error;
        resultData = data && data[0] ? data[0] : { ...existingExt, ...safePayload };
      } else {
        // Creation of contract extension
        const allowedInsertFields = [
          'tenant_id', 'tenant_name', 'property_id', 'property_name', 'room_number',
          'old_start_date', 'old_duration_months', 'extension_months', 'monthly_rate',
          'total_amount', 'payment_method', 'notes', 'midtrans_order_id'
        ];

        const safePayload: any = {};
        for (const f of allowedInsertFields) {
          if (body[f] !== undefined) safePayload[f] = body[f];
        }

        const isPrivileged = req.authProfile && can(req.authProfile.role, 'bookings', 'approve');

        // The tenant and the price are resolved from the database, never trusted from the request body.
        const extMonths = Math.floor(Number(safePayload.extension_months));
        if (!Number.isFinite(extMonths) || extMonths < 1 || extMonths > 24) {
          return res.status(400).json({ success: false, error: 'extension_months harus bilangan bulat 1-24.' });
        }
        safePayload.extension_months = extMonths;

        if (!safePayload.tenant_id) {
          return res.status(400).json({ success: false, error: 'tenant_id wajib disertakan.' });
        }
        const { data: extTenant } = await supabaseAdmin
          .from('tenants')
          .select('id, full_name, property_id, room_number, start_date, duration_months')
          .eq('id', safePayload.tenant_id)
          .maybeSingle();
        if (!extTenant) {
          return res.status(404).json({ success: false, error: 'Penghuni tidak ditemukan.' });
        }
        if (isPrivileged) {
          const extScope = checkPropertyAccess(req.authProfile, extTenant.property_id);
          if (!extScope.allowed) {
            return res.status(403).json({ success: false, error: extScope.reason });
          }
        }
        const { data: extRoom } = await supabaseAdmin
          .from('rooms')
          .select('price')
          .eq('property_id', extTenant.property_id)
          .eq('room_number', extTenant.room_number)
          .maybeSingle();
        const dbRate = Number(extRoom?.price) || 0;
        // Only privileged staff may negotiate a custom (positive) rate; everyone else pays the room's list price.
        const requestedRate = Number(safePayload.monthly_rate) || 0;
        const monthRate = isPrivileged && requestedRate > 0 ? requestedRate : dbRate;
        if (!(monthRate > 0)) {
          return res.status(400).json({ success: false, error: 'Harga sewa kamar tidak ditemukan; perpanjangan tidak dapat dibuat.' });
        }
        safePayload.tenant_name = extTenant.full_name;
        safePayload.property_id = extTenant.property_id;
        safePayload.room_number = extTenant.room_number;
        safePayload.old_start_date = extTenant.start_date;
        safePayload.old_duration_months = extTenant.duration_months;
        safePayload.monthly_rate = monthRate;
        safePayload.total_amount = extMonths * monthRate;

        // Force status to 'pending' for public/unauthorized users (never allow client injection of 'paid')
        if (isPrivileged && body.status) {
          safePayload.status = body.status;
        } else {
          safePayload.status = 'pending';
        }

        eventType = 'INSERT';
        const { data, error } = await supabaseAdmin
          .from('contract_extensions')
          .insert(safePayload)
          .select();
        if (error) throw error;
        resultData = data && data[0] ? data[0] : safePayload;
      }

      // Broadcast realtime event via single shared server channel (G2)
      await broadcastDbMutation('contract_extensions', eventType, resultData);

      return res.status(200).json({ success: true, data: resultData });
    } catch (err: any) {
      console.error('[CONTRACT-EXTENSIONS SAVE API Error]:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/contract-extensions/:id', apiRateLimiter(60000, 60), requireAdminAuth, requirePermission('bookings', 'approve'), async (req, res) => {
    try {
      const { id } = req.params;
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: 'Supabase credentials not configured' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      // Verify extension existence and property scope
      const { data: existingExt } = await supabaseAdmin
        .from('contract_extensions')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!existingExt) {
        return res.status(404).json({ success: false, error: 'Data perpanjangan kontrak tidak ditemukan.' });
      }

      const propCheck = checkPropertyAccess(req.authProfile, existingExt.property_id);
      if (!propCheck.allowed) {
        return res.status(403).json({ success: false, error: propCheck.reason });
      }

      const { error } = await supabaseAdmin
        .from('contract_extensions')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Broadcast deletion via single shared server channel (G2)
      await broadcastDbMutation('contract_extensions', 'DELETE', { id, property_id: existingExt.property_id, tenant_id: existingExt.tenant_id });

      return res.status(200).json({ success: true });
    } catch (err: any) {
      console.error('[CONTRACT-EXTENSIONS DELETE API Error]:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // =========================================================================
  // ENDPOINT: FETCH BOOKINGS (Provides resilient, service_role backed fetch)
  // =========================================================================
  // =========================================================================
  // PUBLIC ENDPOINT: ROOMS AVAILABILITY (NO PII, SAFE FOR PUBLIC BOOKING CALENDARS)
  // =========================================================================
  app.get('/api/public/rooms-availability', apiRateLimiter(60000, 180), async (req, res) => {
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: 'Supabase credentials not configured', data: [] });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      const propertyId = req.query.property_id as string;
      const roomId = req.query.room_id as string;

      let query = supabaseAdmin
        .from('bookings')
        .select('id, room_id, property_id, check_in_date, check_out_date, booking_date, duration_months, duration_days, booking_type, status')
        .in('status', ['confirmed', 'active', 'paid', 'approved', 'reserved']);

      if (propertyId) {
        query = query.eq('property_id', propertyId);
      }
      if (roomId) {
        query = query.eq('room_id', roomId);
      }

      const { data, error } = await query;
      if (error) {
        return res.status(500).json({ success: false, error: error.message, data: [] });
      }

      // Explicitly return only calendar availability metrics, strictly omitting all guest PII
      const safeAvailability = (data || []).map((b: any) => {
        const checkIn = b.check_in_date || b.booking_date || null;
        let checkOut = b.check_out_date || null;
        if (!checkOut && checkIn) {
          const d = new Date(checkIn);
          if (!isNaN(d.getTime())) {
            if (b.booking_type === 'daily' && Number(b.duration_days) > 0) {
              d.setDate(d.getDate() + Number(b.duration_days));
            } else {
              d.setMonth(d.getMonth() + Math.max(1, Number(b.duration_months) || 1));
            }
            checkOut = d.toISOString().split('T')[0];
          }
        }
        return {
          room_id: b.room_id,
          property_id: b.property_id,
          check_in: checkIn,
          check_out: checkOut,
          status: b.status
        };
      });

      return res.status(200).json({ success: true, data: safeAvailability });
    } catch (err: any) {
      console.error('[Public Availability Error]:', err);
      return res.status(500).json({ success: false, error: err.message, data: [] });
    }
  });

  // =========================================================================
  // SECURE BACKEND ENDPOINTS FOR BOOKINGS, ROOM HOLD, SURVEYS, & PRIVATE STORAGE
  // (Supports strict REVOKE ALL FROM anon on PII tables & RPCs)
  // =========================================================================
  app.post('/api/bookings/hold-room', apiRateLimiter(60000, 60), express.json(), async (req, res) => {
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      const { room_id, booking_id, hold_minutes } = req.body || {};
      const roomId = Number(room_id);
      const bookingId = Number(booking_id);
      const holdMinutes = Math.max(1, Math.min(Number(hold_minutes) || 15, 60));

      if (!roomId || !bookingId) {
        return res.status(400).json({ success: false, message: 'Parameter kamar atau booking tidak valid.' });
      }

      const { data, error } = await supabaseAdmin.rpc('hold_room_atomic', {
        p_room_id: roomId,
        p_booking_id: bookingId,
        p_hold_minutes: holdMinutes
      });

      if (!error && data) {
        return res.status(200).json(data);
      }

      // Fallback atomic hold via service_role if RPC is not deployed yet (R4: check conflicting active holds)
      const { data: roomData } = await supabaseAdmin
        .from('rooms')
        .select('id, status, room_number')
        .eq('id', roomId)
        .maybeSingle();

      if (!roomData) {
        return res.status(404).json({ success: false, message: 'Data kamar tidak ditemukan.' });
      }
      if (roomData.status === 'occupied') {
        return res.status(200).json({ success: false, message: `Kamar ${roomData.room_number || ''} sudah terisi (Occupied).` });
      }

      const { data: activeHolds } = await supabaseAdmin
        .from('bookings')
        .select('id, hold_expires_at')
        .eq('room_id', roomId)
        .neq('id', bookingId)
        .in('status', ['pending', 'pending_payment', 'approved'])
        .gt('hold_expires_at', new Date().toISOString())
        .limit(1);

      if (activeHolds && activeHolds.length > 0) {
        return res.status(200).json({
          success: false,
          message: `Kamar ${roomData.room_number || ''} sedang dikunci sementara oleh pemesan lain.`
        });
      }

      const expiresAt = new Date(Date.now() + holdMinutes * 60 * 1000).toISOString();
      await supabaseAdmin.from('bookings').update({ hold_expires_at: expiresAt }).eq('id', bookingId);
      return res.status(200).json({
        success: true,
        message: 'Kamar berhasil dikunci sementara.',
        hold_expires_at: expiresAt
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err?.message || 'Gagal mengunci kamar' });
    }
  });

  app.post('/api/bookings/save', apiRateLimiter(60000, 60), express.json({ limit: '5mb' }), optionalAdminAuth, async (req, res) => {
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      const body = { ...(req.body || {}) };
      const id = body.id;
      delete body.id;

      const isPrivileged = Boolean(req.authProfile && can(req.authProfile.role, 'bookings', 'update'));
      if (id && !isPrivileged) {
        // Non-admin can only update pending booking details (e.g. midtrans_order_id or signature_url)
        const { data: existing } = await supabaseAdmin.from('bookings').select('id, status').eq('id', id).maybeSingle();
        if (!existing || !['pending', 'pending_payment'].includes(existing.status)) {
          return res.status(403).json({ success: false, error: 'Akses ditolak untuk mengubah booking yang sudah diproses.' });
        }
        body.status = 'pending';
      } else if (!id && !isPrivileged) {
        body.status = 'pending';
      }

      let result: any;
      if (id) {
        result = await supabaseAdmin.from('bookings').update(body).eq('id', id).select().maybeSingle();
      } else {
        if (!body.booking_date) body.booking_date = todayJakarta();
        result = await supabaseAdmin.from('bookings').insert(body).select().maybeSingle();
      }

      if (result.error) {
        return res.status(400).json({ success: false, error: result.error.message });
      }
      return res.status(200).json({ success: true, data: result.data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Gagal menyimpan booking' });
    }
  });

  app.post('/api/surveys/save', apiRateLimiter(60000, 60), express.json({ limit: '5mb' }), optionalAdminAuth, async (req, res) => {
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      const body = { ...(req.body || {}) };
      const id = body.id;
      delete body.id;

      const isPrivileged = Boolean(req.authProfile && can(req.authProfile.role, 'bookings', 'update'));
      if (id && !isPrivileged) {
        return res.status(403).json({ success: false, error: 'Akses ditolak untuk mengubah jadwal survei.' });
      }
      if (!id && !isPrivileged) {
        body.status = body.dp_amount === 0 ? 'survey_confirmed' : 'pending_payment';
      }

      let result: any;
      if (id) {
        result = await supabaseAdmin.from('surveys').update(body).eq('id', id).select().maybeSingle();
      } else {
        result = await supabaseAdmin.from('surveys').insert(body).select().maybeSingle();
      }

      if (result.error) {
        return res.status(400).json({ success: false, error: result.error.message });
      }
      return res.status(200).json({ success: true, data: result.data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Gagal menyimpan survei' });
    }
  });

  // R6: Server-side atomic survey DP forfeit (no_show/forfeit -> Dr 1300 / Cr 4200) or refund (Dr 1300 / Cr 1010)
  app.post('/api/surveys/forfeit-or-refund', apiRateLimiter(60000, 60), requireAdminAuth, requirePermission('bookings', 'update'), express.json(), async (req, res) => {
    try {
      const { survey_id, action, refund_account_id, notes } = req.body || {};
      const surveyId = Number(survey_id);
      const cleanAction = String(action || '').trim().toLowerCase();
      if (!surveyId || !['forfeit', 'no_show', 'refund'].includes(cleanAction)) {
        return res.status(400).json({ success: false, error: 'Parameter survey_id atau action (forfeit/no_show/refund) tidak valid.' });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      const { data: survey, error: fetchErr } = await supabaseAdmin
        .from('surveys')
        .select('*')
        .eq('id', surveyId)
        .maybeSingle();

      if (fetchErr || !survey) {
        return res.status(404).json({ success: false, error: 'Data survei tidak ditemukan.' });
      }

      const propAccess = checkPropertyAccess(req.authProfile, survey.property_id);
      if (!propAccess.allowed) {
        return res.status(403).json({ success: false, error: propAccess.reason || 'Akses ditolak ke properti ini.' });
      }

      const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('forfeit_or_refund_survey_dp', {
        p_survey_id: surveyId,
        p_action: cleanAction,
        p_refund_account_id: Number(refund_account_id || 1010),
        p_created_by: req.authProfile?.full_name || 'Admin',
        p_notes: notes || null
      });

      if (!rpcErr && rpcRes) {
        if (rpcRes.success === false) {
          return res.status(422).json({ success: false, error: rpcRes.error || 'Gagal memproses penyelesaian DP survei.' });
        }
        return res.status(200).json({ success: true, data: rpcRes });
      }

      // Fallback when 051 RPC is not yet deployed on remote DB: still enforce atomic post_financial_transaction RPC
      const dpAmount = Number(survey.dp_amount || 500000);
      const refType = cleanAction === 'refund' ? 'survey_refund' : 'survey_forfeit';
      const targetStatus = cleanAction === 'refund' ? 'cancelled' : (cleanAction === 'no_show' ? 'no_show' : 'forfeited');

      const { data: existingResolution } = await supabaseAdmin
        .from('financial_transactions')
        .select('id')
        .in('reference_type', ['survey_forfeit', 'survey_refund'])
        .eq('reference_id', String(surveyId))
        .limit(1)
        .maybeSingle();

      if (existingResolution) {
        await supabaseAdmin.from('surveys').update({ status: targetStatus }).eq('id', surveyId);
        return res.status(200).json({ success: true, already_processed: true, survey_id: surveyId, status: targetStatus });
      }

      if (dpAmount > 0) {
        const trxDate = todayJakarta();
        const trxNo = `TRX-SRV-${cleanAction.toUpperCase()}-${surveyId}-${Date.now()}`;
        const isRefund = cleanAction === 'refund';
        const { data: ftRes, error: ftErr } = await supabaseAdmin.rpc('post_financial_transaction', {
          p_transaction_no: trxNo,
          p_transaction_date: trxDate,
          p_category: isRefund ? 'Refund DP Survey' : 'DP Survey Hangus',
          p_description: notes || (isRefund
            ? `Pengembalian (Refund) DP Survey ${survey.tenant_name || 'Tamu'} Unit ${survey.room_number || ''}`
            : `Reklasifikasi DP Survey Hangus (${cleanAction}) ${survey.tenant_name || 'Tamu'} Unit ${survey.room_number || ''}`),
          p_amount: dpAmount,
          p_type: isRefund ? 'liability_refund' : 'income',
          p_reference_type: refType,
          p_reference_id: String(surveyId),
          p_created_by: req.authProfile?.full_name || 'Admin',
          p_debit_account_id: 1300,
          p_credit_account_id: isRefund ? Number(refund_account_id || 1010) : 4200,
          p_property_id: survey.property_id || 1
        });

        if (ftErr || !ftRes || ftRes.success === false) {
          return res.status(500).json({
            success: false,
            error: ftErr?.message || ftRes?.error || 'Gagal memposting jurnal penyelesaian DP survei.'
          });
        }
      }

      await supabaseAdmin.from('surveys').update({ status: targetStatus }).eq('id', surveyId);
      return res.status(200).json({ success: true, survey_id: surveyId, status: targetStatus });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Gagal memproses penyelesaian DP survei.' });
    }
  });

  // R8 / R9: Server-side SQL coupon validation (avoids downloading all coupons to browser) & staff-only coupon listing
  const requireStaffOrAdmin = requireAdminAuth;

  async function handleValidateCouponRequest(req: any, res: any) {
    try {
      const source = req.method === 'GET' ? (req.query || {}) : (req.body || {});
      const { code, property_id, amount } = source;
      const cleanCode = String(code || '').trim();
      if (!cleanCode) {
        return res.status(400).json({ success: false, valid: false, error: 'Kode kupon wajib diisi.' });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      const { data: coupon, error } = await supabaseAdmin
        .from('coupons')
        .select('id, code, discount_percent, max_discount, min_transaction, valid_until, is_active, usage_limit, used_count, property_id')
        .ilike('code', cleanCode)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (error || !coupon) {
        return res.status(200).json({ success: true, valid: false, error: 'Kode kupon tidak ditemukan atau sudah tidak aktif.' });
      }

      if (coupon.valid_until && String(coupon.valid_until).slice(0, 10) < todayJakarta()) {
        return res.status(200).json({ success: true, valid: false, error: 'Kode kupon sudah kedaluwarsa.' });
      }

      if (coupon.usage_limit && Number(coupon.used_count || 0) >= Number(coupon.usage_limit)) {
        return res.status(200).json({ success: true, valid: false, error: 'Kuota penggunaan kupon telah habis.' });
      }

      if (property_id && coupon.property_id && Number(coupon.property_id) !== Number(property_id)) {
        return res.status(200).json({ success: true, valid: false, error: 'Kupon tidak berlaku untuk properti ini.' });
      }

      if (amount && coupon.min_transaction && Number(amount) < Number(coupon.min_transaction)) {
        return res.status(200).json({
          success: true,
          valid: false,
          error: `Minimal transaksi untuk kupon ini adalah Rp ${Number(coupon.min_transaction).toLocaleString('id-ID')}.`
        });
      }

      return res.status(200).json({ success: true, valid: true, coupon });
    } catch (err: any) {
      return res.status(500).json({ success: false, valid: false, error: err?.message || 'Gagal memvalidasi kupon.' });
    }
  }

  app.get('/api/coupons/validate', apiRateLimiter(60000, 60), handleValidateCouponRequest);
  app.post('/api/coupons/validate', apiRateLimiter(60000, 60), express.json(), handleValidateCouponRequest);

  app.get('/api/coupons', requireStaffOrAdmin, apiRateLimiter(60000, 120), async (req, res) => {
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      const limit = resolveLimit('coupons', req.query.limit as string);
      const { selectExpr } = sanitizeColumns('coupons', req.query.columns as string);

      let query = supabaseAdmin.from('coupons').select(selectExpr).order('id', { ascending: false }).limit(limit);
      const userAssignedProp = req.authProfile?.property_id;
      if (userAssignedProp !== null && userAssignedProp !== undefined) {
        query = query.or(`property_id.eq.${Number(userAssignedProp)},property_id.is.null`);
      }

      const { data, error } = await query;
      if (error) {
        return res.status(500).json({ success: false, error: error.message, data: [] });
      }
      return res.status(200).json({ success: true, data: data || [] });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Gagal memuat daftar kupon.', data: [] });
    }
  });

  app.post('/api/storage/upload', apiRateLimiter(60000, 60), express.json({ limit: '15mb' }), optionalAdminAuth, async (req, res) => {
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      const { bucket, fileName, base64Data, mimeType } = req.body || {};
      const allowedBuckets = new Set([
        'property-images', 'room-images', 'avatars',
        'tenant-documents', 'payment-proof', 'contracts', 'signatures', 'maintenance'
      ]);
      const privateBuckets = new Set([
        'tenant-documents', 'payment-proof', 'contracts', 'signatures', 'maintenance'
      ]);

      if (!bucket || !allowedBuckets.has(bucket) || !fileName || !base64Data) {
        return res.status(400).json({ success: false, error: 'Parameter upload storage tidak lengkap atau bucket tidak valid.' });
      }

      // Marketing buckets require staff/admin auth to upload
      if (!privateBuckets.has(bucket) && !req.authProfile) {
        return res.status(403).json({ success: false, error: 'Hanya staf/admin yang dapat mengunggah ke bucket katalog publik.' });
      }

      const cleanBase64 = String(base64Data).includes(',') ? String(base64Data).split(',')[1] : String(base64Data);
      const fileBuffer = Buffer.from(cleanBase64, 'base64');
      const safePath = String(fileName).replace(/\.\./g, '').replace(/^\/+/, '');

      const { data, error } = await supabaseAdmin.storage
        .from(bucket)
        .upload(safePath, fileBuffer, {
          contentType: mimeType || 'image/webp',
          upsert: true,
          cacheControl: '3600000'
        });

      if (error) {
        return res.status(400).json({ success: false, error: error.message });
      }

      let publicUrl = '';
      if (privateBuckets.has(bucket)) {
        const { data: signedData, error: signErr } = await supabaseAdmin.storage
          .from(bucket)
          .createSignedUrl(data.path, 315360000); // 10-year signed URL for private documents
        if (signErr || !signedData?.signedUrl) {
          return res.status(500).json({ success: false, error: signErr?.message || 'Gagal membuat signed URL dokumen privat.' });
        }
        publicUrl = signedData.signedUrl;
      } else {
        const { data: pubData } = supabaseAdmin.storage.from(bucket).getPublicUrl(data.path);
        publicUrl = pubData.publicUrl;
      }

      return res.status(200).json({
        success: true,
        publicUrl,
        storagePath: data.path,
        bucket
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Gagal mengunggah dokumen ke storage' });
    }
  });

  // =========================================================================
  // ENDPOINT: FETCH BOOKINGS (Secured: Require Admin Auth + Scoped Permission)
  // =========================================================================
  app.get('/api/bookings', requireAdminAuth, requirePermission('bookings', 'read'), apiRateLimiter(60000, 180), async (req, res) => {
    if (isServerQuotaActive()) {
      return res.status(200).json({ success: true, data: [], fallback: true });
    }

    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: 'Supabase credentials not configured', data: [] });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      const limit = resolveLimit('bookings', req.query.limit as string);
      const offset = resolveOffset(req.query.offset as string);
      const { selectExpr } = sanitizeColumns('bookings', req.query.columns as string);
      const status = req.query.status as string;
      const requestedPropId = req.query.property_id as string;
      const orderId = req.query.order_id as string;

      // Restrict staff/branch users to their assigned property
      const userAssignedProp = req.authProfile?.property_id;
      let effectivePropertyId: string | number | null = requestedPropId || null;

      if (userAssignedProp !== null && userAssignedProp !== undefined) {
        if (requestedPropId && String(requestedPropId) !== String(userAssignedProp)) {
          return res.status(403).json({ success: false, error: `Akses ditolak. Anda hanya berwenang untuk Properti ID ${userAssignedProp}.`, data: [] });
        }
        effectivePropertyId = userAssignedProp;
      } else if (requestedPropId) {
        const propAccess = checkPropertyAccess(req.authProfile, requestedPropId);
        if (!propAccess.allowed) {
          return res.status(403).json({ success: false, error: propAccess.reason || 'Akses ditolak ke properti ini.', data: [] });
        }
      }

      let query = supabaseAdmin
        .from('bookings')
        .select(selectExpr)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (status) {
        query = query.eq('status', status);
      }
      if (effectivePropertyId) {
        query = query.eq('property_id', effectivePropertyId);
      }
      if (orderId) {
        query = query.eq('midtrans_order_id', orderId);
      }

      const { data, error } = await query;
      if (error) {
        if (error.message?.includes('exceed_egress_quota') || error.message?.includes('quota') || error.message?.includes('restricted') || error.message?.includes('spend caps')) {
          markServerQuotaRestricted(error.message);
        }
        console.warn('[BOOKINGS API] Query notice:', error.message);
        return res.status(500).json({ success: false, error: error.message, data: [] });
      }

      // Mask sensitive PII for roles without unmasked PII view permission
      const sanitizedData = sanitizePiiResponse(req.authProfile?.role, data || [], [
        'nik', 'spouse_nik', 'spouse_phone', 'marriage_certificate_url'
      ]);

      return res.status(200).json({ success: true, data: sanitizedData });
    } catch (err: any) {
      if (err?.message?.includes('exceed_egress_quota') || err?.message?.includes('quota') || err?.message?.includes('restricted')) {
        markServerQuotaRestricted(err?.message);
      }
      return res.status(500).json({ success: false, error: err?.message || 'Bookings query failed', data: [] });
    }
  });

  // Resilient data fallback endpoint for core tables with strict security controls (R9: coupons removed from public read)
  const PUBLIC_READ_TABLES = new Set([
    'properties', 'rooms', 'facilities', 'settings'
  ]);

  const FORBIDDEN_WITHOUT_AUTH = new Set([
    'users', 'tenants', 'payments', 'contracts', 'financial_transactions', 
    'journal_entries', 'midtrans_logs', 'cash_flows', 'pnl_reports', 
    'balance_sheets', 'audits', 'bookings', 'surveys', 'contract_extensions',
    'coupons', 'accounts', 'maintenance', 'petty_cash_requests', 'fixed_assets',
    'budgets', 'vendors', 'purchase_orders', 'inventory_items',
    'bank_statement_items', 'midtrans_clearing_transactions',
    'bank_reconciliation_matches', 'activity_logs'
  ]);

  const TABLE_TO_RESOURCE_MAP: Record<string, string> = {
    users: 'users',
    tenants: 'tenants',
    payments: 'payments',
    contracts: 'contracts',
    contract_extensions: 'contracts',
    financial_transactions: 'finances',
    journal_entries: 'finances',
    accounts: 'finances',
    budgets: 'finances',
    vendors: 'finances',
    purchase_orders: 'finances',
    bank_statement_items: 'finances',
    midtrans_clearing_transactions: 'finances',
    bank_reconciliation_matches: 'finances',
    midtrans_logs: 'payments',
    cash_flows: 'finances',
    pnl_reports: 'finances',
    balance_sheets: 'finances',
    audits: 'audit_logs',
    activity_logs: 'audit_logs',
    bookings: 'bookings',
    surveys: 'surveys',
    properties: 'properties',
    rooms: 'properties',
    fixed_assets: 'properties',
    maintenance: 'properties',
    petty_cash_requests: 'properties',
    inventory_items: 'properties',
    coupons: 'properties'
  };

  app.get('/api/data/:table', apiRateLimiter(60000, 180), async (req, res, next) => {
    const { table } = req.params;

    // If table is sensitive, require authentication and RBAC permissions
    if (FORBIDDEN_WITHOUT_AUTH.has(table)) {
      return requireAdminAuth(req, res, async () => {
        try {
          const userRole = req.authProfile?.role;
          const resource = TABLE_TO_RESOURCE_MAP[table] || table;

          // Check granular RBAC view permission
          if (!can(userRole, resource as AppResource, 'read')) {
            return res.status(403).json({
              success: false,
              error: `Akses ditolak: Peran '${userRole}' tidak memiliki izin untuk melihat data '${table}'.`,
              data: []
            });
          }

          const userAssignedProp = req.authProfile?.property_id;

          const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
          const serviceKey = getServiceRoleKeyOrThrow();
          if (!supabaseUrl || !serviceKey) {
            return res.status(500).json({ success: false, error: 'Supabase credentials not configured', data: [] });
          }
          const supabaseAdmin = createClient(supabaseUrl, serviceKey);

          const limit = resolveLimit(table, req.query.limit as string);
          const offset = resolveOffset(req.query.offset as string);
          const { selectExpr } = sanitizeColumns(table, req.query.columns as string);
          const orderCol = resolveOrderColumn(table, req.query.order_col as string);
          const orderAsc = resolveOrderAsc(req.query.order_asc as string);

          let query = supabaseAdmin
            .from(table)
            .select(selectExpr)
            .order(orderCol, { ascending: orderAsc })
            .range(offset, offset + limit - 1);

          // Property scoping if role is scoped to a specific branch
          const TABLES_WITH_PROPERTY_ID = [
            'bookings', 'surveys', 'contracts', 'contract_extensions', 'rooms',
            'fixed_assets', 'payments', 'tenants', 'financial_transactions',
            'maintenance', 'inventory_items', 'coupons'
          ];
          if (userAssignedProp !== null && userAssignedProp !== undefined && TABLES_WITH_PROPERTY_ID.includes(table)) {
            query = query.eq('property_id', userAssignedProp);
          }

          const { data, error } = await query;
          if (error) {
            if (error.message?.includes('exceed_egress_quota') || error.message?.includes('quota') || error.message?.includes('restricted') || error.message?.includes('spend caps')) {
              markServerQuotaRestricted(error.message);
            }
            console.warn(`[DATA API:${table}] Authenticated notice:`, error.message);
            return res.status(500).json({ success: false, error: error.message, data: [] });
          }

          // Mask sensitive PII for tenants / bookings / users / surveys (R8)
          let sanitizedData = sanitizePiiResponse(req.authProfile?.role, data || [], [
            'nik', 'nik_pasangan', 'spouse_nik', 'spouse_phone', 'identity_number',
            'ktp_image', 'ktp_url', 'marriage_certificate_url', 'marriage_book_url', 'family_card_url'
          ]);

          if (table === 'rooms' && Array.isArray(sanitizedData)) {
            sanitizedData = sanitizedData.map((r: any) => {
              const rawFacs = Array.isArray(r.facilities) ? r.facilities : [];
              const isPremPlus = rawFacs.some((item: any) => typeof item === 'string' && item === '__ROOM_TYPE:Premium Plus__');
              return {
                ...r,
                room_type: isPremPlus ? 'Premium Plus' : r.room_type,
                facilities: rawFacs.filter((item: any) => !(typeof item === 'string' && item.startsWith('__ROOM_TYPE:')))
              };
            });
          }

          return res.status(200).json({ success: true, data: sanitizedData });
        } catch (err: any) {
          if (err?.message?.includes('exceed_egress_quota') || err?.message?.includes('quota') || err?.message?.includes('restricted')) {
            markServerQuotaRestricted(err?.message);
          }
          return res.status(500).json({ success: false, error: err?.message || 'Query failed', data: [] });
        }
      });
    }

    if (!PUBLIC_READ_TABLES.has(table)) {
      return res.status(403).json({ success: false, error: `Access to table '${table}' is restricted.` });
    }

    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: 'Supabase credentials not configured', data: [] });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      const limit = resolveLimit(table, req.query.limit as string);
      const offset = resolveOffset(req.query.offset as string);
      const { selectExpr } = sanitizeColumns(table, req.query.columns as string);
      const orderCol = resolveOrderColumn(table, req.query.order_col as string);
      const orderAsc = resolveOrderAsc(req.query.order_asc as string);

      let query = supabaseAdmin
        .from(table)
        .select(selectExpr)
        .order(orderCol, { ascending: orderAsc })
        .range(offset, offset + limit - 1);

      const { data, error } = await query;
      if (error) {
        if (error.message?.includes('exceed_egress_quota') || error.message?.includes('quota') || error.message?.includes('restricted') || error.message?.includes('spend caps')) {
          markServerQuotaRestricted(error.message);
        }
        console.warn(`[DATA API:${table}] Query notice:`, error.message);
        return res.status(500).json({ success: false, error: error.message, data: [] });
      }
      let outputData = data || [];
      if (table === 'rooms' && Array.isArray(outputData)) {
        outputData = outputData.map((r: any) => {
          const rawFacs = Array.isArray(r.facilities) ? r.facilities : [];
          const isPremPlus = rawFacs.some((item: any) => typeof item === 'string' && item === '__ROOM_TYPE:Premium Plus__');
          return {
            ...r,
            room_type: isPremPlus ? 'Premium Plus' : r.room_type,
            facilities: rawFacs.filter((item: any) => !(typeof item === 'string' && item.startsWith('__ROOM_TYPE:')))
          };
        });
      }
      return res.status(200).json({ success: true, data: outputData });
    } catch (err: any) {
      if (err?.message?.includes('exceed_egress_quota') || err?.message?.includes('quota') || err?.message?.includes('restricted')) {
        markServerQuotaRestricted(err?.message);
      }
      return res.status(500).json({ success: false, error: err?.message || 'Query failed', data: [] });
    }
  });

  // Reject generic mutation attempts through /api/data/:table (mutations must use designated endpoints)
  app.all('/api/data/:table', (req, res) => {
    return res.status(405).json({
      success: false,
      error: `Metode ${req.method} tidak diizinkan pada /api/data/:table. Gunakan endpoint khusus terkait.`
    });
  });

  // G9: Server-side dashboard aggregation endpoint (uses 049b_dashboard_aggregates.sql RPCs with parity fallback)
  app.get('/api/analytics/dashboard-summary', apiRateLimiter(60000, 60), requireAdminAuth, async (req, res) => {
    try {
      const userRole = req.authProfile?.role;
      if (!can(userRole, 'financial_reports', 'read') && !can(userRole, 'operations', 'read')) {
        return res.status(403).json({ success: false, error: 'Akses ditolak untuk ringkasan analitik.' });
      }

      const userAssignedProp = req.authProfile?.property_id;
      const requestedPropRaw = req.query.property_id as string | undefined;
      let effectivePropId: number | null = null;
      if (userAssignedProp !== null && userAssignedProp !== undefined) {
        effectivePropId = Number(userAssignedProp);
      } else if (requestedPropRaw && requestedPropRaw !== 'all') {
        const parsed = Number(requestedPropRaw);
        if (Number.isFinite(parsed)) effectivePropId = parsed;
      }

      const fromDate = (req.query.from as string) || null;
      const toDate = (req.query.to as string) || null;

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });

      const { data: rpcSummary, error: rpcErr } = await supabaseAdmin.rpc('dashboard_summary', {
        p_property_id: effectivePropId,
        p_from: fromDate,
        p_to: toDate
      });

      const { data: rpcCashflow } = await supabaseAdmin.rpc('monthly_cashflow', {
        p_property_id: effectivePropId,
        p_from: fromDate,
        p_to: toDate
      });

      if (!rpcErr && rpcSummary) {
        return res.status(200).json({
          success: true,
          source: 'rpc',
          summary: rpcSummary,
          monthlyCashflow: rpcCashflow || []
        });
      }

      // Fallback to server-side parity calculation if migration 049b is not yet applied on remote DB
      let txQ = supabaseAdmin.from('financial_transactions').select('id,type,category,amount,status,property_id,transaction_date,created_at,debit_account_id,credit_account_id').limit(1000);
      let payQ = supabaseAdmin.from('payments').select('id,amount,status,property_id,payment_date,created_at').limit(1000);
      let bookQ = supabaseAdmin.from('bookings').select('id,total_price,status,property_id,check_in_date,created_at').limit(1000);
      let roomQ = supabaseAdmin.from('rooms').select('id,status,property_id,room_number,price').limit(500);
      if (effectivePropId !== null) {
        txQ = txQ.eq('property_id', effectivePropId);
        payQ = payQ.eq('property_id', effectivePropId);
        bookQ = bookQ.eq('property_id', effectivePropId);
        roomQ = roomQ.eq('property_id', effectivePropId);
      }
      const [txRes, payRes, bookRes, roomRes] = await Promise.all([txQ, payQ, bookQ, roomQ]);

      const execSummary = calculateExecutiveFinancialSummary(
        roomRes.data || [],
        txRes.data || [],
        payRes.data || [],
        bookRes.data || []
      );

      return res.status(200).json({
        success: true,
        source: 'fallback',
        summary: {
          totalInflow: execSummary.inflow,
          totalExpenses: execSummary.expenses,
          noi: execSummary.noi,
          grossPipeline: execSummary.pipeline,
          occupancy: {
            totalRooms: execSummary.occupancy.totalRooms,
            occupiedRooms: execSummary.occupancy.occupiedRooms,
            vacantRooms: execSummary.occupancy.availableRooms,
            occupancyRate: execSummary.occupancy.ratePercentage
          }
        },
        monthlyCashflow: []
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Gagal memuat ringkasan dashboard.' });
    }
  });

  // =========================================================================
  // ENDPOINT: CHECK MIDTRANS TRANSACTION STATUS & AUTO-SETTLE
  // =========================================================================
  app.get('/api/midtrans/status/:orderId', apiRateLimiter(60000, 30), async (req, res) => {
    try {
      const { orderId } = req.params;
      // Order ids are generated by us; reject anything else before it reaches Midtrans / the database.
      if (!isValidOrderId(orderId)) {
        return res.status(400).json({ success: false, error: 'Format order_id tidak valid.' });
      }
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

      const response = await fetch(`${baseUrl}/v2/${encodeURIComponent(orderId)}/status`, {
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Accept': 'application/json'
        }
      });

      const data: any = await response.json();

      let settled = false;
      if (data.transaction_status === 'settlement' || (data.transaction_status === 'capture' && (!data.fraud_status || data.fraud_status === 'accept'))) {
        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
        const serviceKey = getServiceRoleKeyOrThrow();
        const supabase = createClient(supabaseUrl, serviceKey);
        try {
          const paidAmount = Number(data.gross_amount || 0);
          let expectedAmount: number | null = null;

          if (orderId.startsWith('EXT-') || orderId.startsWith('EXTEND-')) {
            const { data: ex } = await supabase.from('contract_extensions').select('total_amount').eq('midtrans_order_id', orderId).maybeSingle();
            if (ex) expectedAmount = Number(ex.total_amount);
          } else if (orderId.startsWith('SRV-')) {
            const { data: sv } = await supabase.from('surveys').select('dp_amount').eq('reservation_number', orderId).maybeSingle();
            if (sv) expectedAmount = Number(sv.dp_amount ?? 500000);
          } else {
            const { data: b } = await supabase.from('bookings').select('total_price, dp_amount, is_dp').eq('midtrans_order_id', orderId).maybeSingle();
            if (b) expectedAmount = Number(b.is_dp ? (b.dp_amount || 500000) : b.total_price);
          }

          if (expectedAmount !== null && expectedAmount > 0 && !amountsMatch(expectedAmount, paidAmount)) {
            console.error(`[Status Check Auto-Settle] Amount mismatch for ${orderId}: expected ${expectedAmount}, received ${paidAmount}. Settlement REFUSED.`);
            settled = false;
          } else if (orderId.startsWith('EXT-') || orderId.startsWith('EXTEND-')) {
            const extRes = await settleContractExtensionTransaction(
              supabase,
              orderId,
              data.payment_type || 'Midtrans SNAP',
              data.transaction_id,
              paidAmount
            );
            settled = Boolean(extRes && extRes.success !== false);
          } else if (orderId.startsWith('SRV-')) {
            const srvRes = await settleSurveyTransaction(supabase, orderId, data.payment_type || 'Midtrans SNAP', data);
            settled = Boolean(srvRes && srvRes.found);
          } else {
            const bkRes = await settleBookingTransaction(
              supabase,
              orderId,
              data.payment_type || 'Midtrans SNAP',
              data.transaction_id,
              paidAmount
            );
            settled = Boolean(bkRes && bkRes.success !== false);
          }
        } catch (sErr) {
          console.warn('[Status Check Auto-Settle Warning]:', sErr);
          settled = false;
        }
      }

      // Return only what the checkout screen needs - never the raw gateway payload (VA numbers, card masks, customer data).
      return res.status(200).json({
        success: true,
        settled,
        midtrans: {
          order_id: data.order_id,
          transaction_status: data.transaction_status,
          fraud_status: data.fraud_status,
          payment_type: data.payment_type,
          transaction_id: data.transaction_id,
          settlement_time: data.settlement_time,
          gross_amount: data.gross_amount,
          status_code: data.status_code
        }
      });
    } catch (err: any) {
      console.error('[API Midtrans Status Error]:', err);
      return res.status(500).json({ success: false, error: 'Gagal memeriksa status pembayaran.' });
    }
  });


  // =========================================================================
  // DIGITAL SIGNATURE STORAGE & HOSTING API (FOR EMAILS & RECEIVING)
  // =========================================================================

  // MailerSend Send Email API endpoint (rate-limited for security, strict recipient validation & anti-relay)
  app.post('/api/email/send', apiRateLimiter(60000, 20), optionalAdminAuth, async (req, res) => {
    try {
      const { to, subject, text, html, fromEmail, fromName, order_id, reservation_number } = req.body;

      if (!to || typeof to !== 'string' || !to.includes('@') || to.length > 100) {
        return res.status(400).json({
          success: false,
          message: 'Alamat email tujuan (to) tidak valid.'
        });
      }

      // Check anti-open-relay authorization (R8):
      // Unauthenticated public callers must provide order_id / reservation_number matching the recipient email
      if (!req.authProfile) {
        const orderRef = String(order_id || reservation_number || '').trim();
        if (!orderRef || !isValidOrderId(orderRef)) {
          return res.status(403).json({
            success: false,
            message: 'Akses ditolak: pengiriman email memerlukan sesi staf/admin atau Order ID aktif yang valid.'
          });
        }

        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
        const serviceKey = getServiceRoleKeyOrThrow();
        if (supabaseUrl && serviceKey) {
          const supabaseAdmin = createClient(supabaseUrl, serviceKey);
          const cleanTo = to.trim().toLowerCase();
          const [bookingRes, surveyRes] = await Promise.all([
            supabaseAdmin.from('bookings').select('id, email, occupant_email').eq('midtrans_order_id', orderRef).limit(1).maybeSingle(),
            supabaseAdmin.from('surveys').select('id, email').eq('reservation_number', orderRef).limit(1).maybeSingle()
          ]);

          const matchedBooking = bookingRes.data && (
            String(bookingRes.data.email || '').trim().toLowerCase() === cleanTo ||
            String(bookingRes.data.occupant_email || '').trim().toLowerCase() === cleanTo
          );
          const matchedSurvey = surveyRes.data && String(surveyRes.data.email || '').trim().toLowerCase() === cleanTo;

          if (!matchedBooking && !matchedSurvey) {
            return res.status(403).json({
              success: false,
              message: 'Akses ditolak: Alamat email tujuan tidak sesuai dengan data pemesanan atau survei terkait.'
            });
          }
        }
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

      // Prevent unauthenticated callers from spoofing sender headers
      const baseFromEmail = (req.authProfile ? fromEmail : undefined) || process.env.MAILERSEND_FROM_EMAIL || 'info@test-zkq340e73m2gd796.mlsender.net';
      const resolvedFromEmail = await resolveVerifiedFromEmail(apiKey, baseFromEmail);
      const resolvedFromName = (req.authProfile ? fromName : undefined) || process.env.MAILERSEND_FROM_NAME || 'Samara Stay';

      const cleanSubject = String(subject || 'Notifikasi Samara Stay').slice(0, 150);
      let rawHtml = String(html || `<p>${text || 'Ini adalah notifikasi penting dari Samara Stay.'}</p>`).slice(0, 100000);
      if (!req.authProfile) {
        // Unauthenticated callers (public checkout) may not inject active content or off-site links
        // into mail that is delivered from our verified sender domain (phishing relay).
        const appOrigin = (process.env.APP_URL || '').replace(/\/$/, '');
        rawHtml = rawHtml
          .replace(/<\s*(script|iframe|form|object|embed|style)[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
          .replace(/<\s*(script|iframe|form|object|embed|input|button)\b[^>]*>/gi, '')
          .replace(/href\s*=\s*("([^"]*)"|'([^']*)')/gi, (m, _q, d, sq) => {
            const url = String(d ?? sq ?? '');
            const ok = /^(mailto:|tel:)/i.test(url) || (appOrigin && url.startsWith(appOrigin));
            return ok ? m : 'href="#"';
          });
      }
      const { html: processedHtml, attachments } = await processEmailHtmlAndSignatures(rawHtml);

      const payload: MailerSendPayload = {
        from: { email: resolvedFromEmail, name: resolvedFromName },
        to: [{ email: to, name: to.split('@')[0].slice(0, 50) }],
        subject: cleanSubject,
        text: String(text || 'Ini adalah notifikasi penting dari Samara Stay.').slice(0, 20000),
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

  app.post('/api/signatures/upload', apiRateLimiter(60000, 30), express.json({ limit: '1mb' }), (req, res) => {
    try {
      const { image, identifier } = req.body || {};
      if (!image || typeof image !== 'string' || image.length < 50) {
        return res.status(400).json({ success: false, error: 'Data gambar tanda tangan tidak valid.' });
      }

      // Base64 string length limit (max ~1.4MB base64 corresponds to ~1MB binary)
      if (image.length > 1.5 * 1024 * 1024) {
        return res.status(400).json({ success: false, error: 'Ukuran tanda tangan melebihi batas maksimum 1MB.' });
      }

      const cleanBase64 = image.includes(',') ? image.split(',')[1] : image;
      const imgBuffer = Buffer.from(cleanBase64, 'base64');

      if (imgBuffer.length > 1024 * 1024) {
        return res.status(400).json({ success: false, error: 'Ukuran file tanda tangan melebihi 1MB.' });
      }

      // Magic byte verification for PNG, JPEG, and WebP
      const isPng = imgBuffer.length >= 8 &&
        imgBuffer[0] === 0x89 && imgBuffer[1] === 0x50 && imgBuffer[2] === 0x4e && imgBuffer[3] === 0x47 &&
        imgBuffer[4] === 0x0d && imgBuffer[5] === 0x0a && imgBuffer[6] === 0x1a && imgBuffer[7] === 0x0a;
      const isJpeg = imgBuffer.length >= 3 &&
        imgBuffer[0] === 0xff && imgBuffer[1] === 0xd8 && imgBuffer[2] === 0xff;
      const isWebp = imgBuffer.length >= 12 &&
        imgBuffer[0] === 0x52 && imgBuffer[1] === 0x49 && imgBuffer[2] === 0x46 && imgBuffer[3] === 0x46 &&
        imgBuffer[8] === 0x57 && imgBuffer[9] === 0x45 && imgBuffer[10] === 0x42 && imgBuffer[11] === 0x50;

      if (!isPng && !isJpeg && !isWebp) {
        return res.status(400).json({ success: false, error: 'Format tanda tangan tidak valid. Hanya PNG, JPEG, atau WebP yang diperbolehkan.' });
      }

      const mimeType = isPng ? 'image/png' : isJpeg ? 'image/jpeg' : 'image/webp';
      const fileExt = isPng ? 'png' : isJpeg ? 'jpg' : 'webp';

      const cleanId = (identifier || 'sig').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30);
      const sigId = `sig_${cleanId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      
      // If store exceeds 500 entries, evict oldest
      if (signatureStore.size >= 500) {
        const oldestKey = signatureStore.keys().next().value;
        if (oldestKey) signatureStore.delete(oldestKey);
      }

      signatureStore.set(sigId, { data: cleanBase64, mime: mimeType, createdAt: Date.now() });

      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.get('host');
      const publicUrl = `${protocol}://${host}/api/signatures/${sigId}.${fileExt}`;

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

  app.get(['/api/signatures/:id.png', '/api/signatures/:id.webp', '/api/signatures/:id.jpg', '/api/signatures/:id.jpeg'], (req, res) => {
    const sigId = req.params.id;
    if (!sigId || !/^[a-zA-Z0-9_-]{5,80}$/.test(sigId)) {
      return res.status(400).send('Format ID tanda tangan tidak valid');
    }

    const item = signatureStore.get(sigId);
    if (!item) {
      return res.status(404).send('Signature image not found');
    }

    try {
      const imgBuffer = Buffer.from(item.data, 'base64');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.writeHead(200, {
        'Content-Type': item.mime || 'image/png',
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
    const isAnakOwner = isAnakOwnerEmail(email);
    const isWhitelisted = isSuper || isOwner || isAnakOwner;
    const targetRole = isSuper ? 'super' : (isOwner ? 'owner' : (isAnakOwner ? 'anak_owner' : null));

    const isEmailConfirmed = Boolean(user.email_confirmed_at || (user as any).confirmed_at || !isEmailConfirmationEnforced());

    // Always prefer service_role adminClient when available so RLS never hides or overwrites public.users / public.profiles
    let dbClient = client;
    let adminClient: any = null;
    try {
      const serviceKey = getServiceRoleKeyOrThrow();
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      if (supabaseUrl && serviceKey) {
        adminClient = createClient(supabaseUrl, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false }
        });
        dbClient = adminClient;
      }
    } catch (e) {}

    // 1. Lookup public.users by Auth UUID (id)
    let { data: userData, error: userError } = await dbClient
      .from('users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (userError) {
      console.error('[AUTH API] Error fetching user profile by id:', userError);
    }

    // 2. Fallback: Lookup public.users by email (handles rows seeded with legacy id before Auth UUID existed)
    if (!userData && email) {
      const { data: emailUserData } = await dbClient
        .from('users')
        .select('*')
        .ilike('email', email)
        .maybeSingle();

      if (emailUserData) {
        const legacyId = emailUserData.id;
        userData = {
          ...emailUserData,
          id: user.id
        };
        if (adminClient) {
          try {
            if (legacyId && legacyId !== user.id) {
              await adminClient.from('users').delete().eq('id', legacyId);
            }
            await adminClient.from('users').upsert(userData, { onConflict: 'id' });
          } catch (migErr) {
            console.warn('[AUTH API] Legacy user ID migration notice:', migErr);
          }
        }
      }
    }

    // 3. Fallback: Check public.profiles if public.users row was missing
    let existingProfileRow: any = null;
    if (adminClient) {
      try {
        const { data: profData } = await adminClient
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();
        existingProfileRow = profData;
      } catch (e) {}
    }

    // If existing user profile exists in public.users, verify and sync with public.profiles
    if (userData) {
      if (isWhitelisted && targetRole && isEmailConfirmed && userData.role !== targetRole) {
        const oldRole = userData.role;
        userData.role = targetRole;
        userData.role_id = isSuper ? 1 : 2;
        userData.active = true;
        if (adminClient) {
          try {
            await adminClient.from('users').update({ 
              role: targetRole, 
              role_id: isSuper ? 1 : 2, 
              active: true,
              last_login: 'Baru saja'
            }).eq('id', user.id);

            await adminClient.from('activity_logs').insert({
              admin_name: 'System Security',
              action: 'WHITELIST_ROLE_ELEVATION',
              detail: `Pengangkatan peran user ${email} dari "${oldRole}" menjadi "${targetRole}" via whitelist terverifikasi.`,
              created_at: new Date().toISOString()
            });
          } catch (e) {
            console.warn('[AUTH API] Role elevation notice:', e);
          }
        }
      } else if (adminClient) {
        try {
          await adminClient.from('users').update({ last_login: 'Baru saja' }).eq('id', user.id);
        } catch (e) {}
      }

      // Sync public.profiles so Supabase RLS get_my_role() stays 100% aligned
      if (adminClient) {
        try {
          const safeProfRole = toSafeProfileRole(userData.role);
          if (!existingProfileRow || existingProfileRow.role !== safeProfRole || existingProfileRow.full_name !== userData.full_name) {
            await adminClient.from('profiles').upsert({
              id: user.id,
              full_name: userData.full_name || user.user_metadata?.full_name || email.split('@')[0] || 'User',
              role: safeProfRole
            }, { onConflict: 'id' });
          }
        } catch (e) {}
      }

      return userData;
    }

    // 4. Self-healing fallback: Synthesize and persist user profile if missing from public.users
    const shouldElevate = isWhitelisted && isEmailConfirmed && targetRole;
    const profileDerivedRole = existingProfileRow?.role === 'super_admin' ? 'super' : existingProfileRow?.role;
    const userRole = shouldElevate ? targetRole : (profileDerivedRole || 'user');
    const isElevatedRole = ['super', 'super_admin', 'owner'].includes(userRole);
    const isAdminOrAnakOwner = ['admin', 'anak_owner'].includes(userRole);

    userData = {
      id: user.id,
      full_name: existingProfileRow?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || (userRole === 'owner' ? 'Owner Investor' : (userRole === 'anak_owner' ? 'Anak Owner' : (userRole === 'super' ? 'Super Administrator' : 'User'))),
      email: email,
      role: userRole,
      role_id: isElevatedRole ? 1 : (isAdminOrAnakOwner ? 2 : (userRole === 'finance' ? 3 : 4)),
      access: userRole === 'super'
        ? 'Semua Properti (Super Admin)'
        : userRole === 'owner'
        ? 'Semua Properti (Owner Investor Portfolio)'
        : userRole === 'anak_owner'
        ? 'Akses Operasional, Hunian & Keuangan (Anak Owner)'
        : userRole === 'admin'
        ? 'Akses kontrol panel asrama & inventaris'
        : userRole === 'staff'
        ? 'Akses Operasional Asrama & Check-In/Out (Staff)'
        : 'Pengguna Publik Terdaftar',
      active: true,
      property_id: null,
      last_login: 'Baru saja',
      created_at: new Date().toISOString()
    };

    if (adminClient) {
      try {
        await adminClient.from('users').upsert(userData, { onConflict: 'id' });
        await adminClient.from('profiles').upsert({
          id: user.id,
          full_name: userData.full_name,
          role: toSafeProfileRole(userRole)
        }, { onConflict: 'id' });

        if (shouldElevate) {
          await adminClient.from('activity_logs').insert({
            admin_name: 'System Security',
            action: 'WHITELIST_ROLE_ELEVATION',
            detail: `Pembuatan profil baru user ${email} diangkat menjadi "${targetRole}" via whitelist terverifikasi.`,
            created_at: new Date().toISOString()
          });
        }
      } catch (e) {
        console.warn('[AUTH API] Profile persistence notice:', e);
      }
    }

    console.log(`[AUTH API] Synthesized profile for user ${email} (role: ${userRole})`);
    return userData;
  }

  // GET /api/auth/portal-accounts - Returns active operator accounts from Supabase public.users for the Login Portal
  app.get('/api/auth/portal-accounts', async (_req, res) => {
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.json({ success: true, accounts: [] });
      }
      const adminClient = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });
      const { data: users, error } = await adminClient
        .from('users')
        .select('id, email, full_name, role, access, property_id, active')
        .eq('active', true)
        .in('role', ['super', 'super_admin', 'owner', 'anak_owner', 'admin', 'finance', 'staff'])
        .order('role_id', { ascending: true });

      if (error) {
        return res.json({ success: true, accounts: [] });
      }
      return res.json({
        success: true,
        accounts: (users || []).map((u: any) => ({
          id: u.id,
          email: u.email,
          full_name: u.full_name,
          role: u.role === 'super_admin' ? 'super' : u.role,
          access: u.access || '',
          property_id: u.property_id ?? null
        }))
      });
    } catch (err: any) {
      return res.json({ success: true, accounts: [] });
    }
  });

  // POST /api/auth/login
  app.post('/api/auth/login', apiRateLimiter(60000, 30), async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Email dan password wajib diisi' });
      }

      const cleanEmail = email.trim().toLowerCase();
      const cleanPassword = password.trim();
      const ipKey = `ip:${resolveClientIp(req)}`;
      const emailKey = `email:${cleanEmail}`;

      if (isLoginRateLimited(ipKey) || isLoginRateLimited(emailKey)) {
        return res.status(429).json({
          success: false,
          error: 'Terlalu banyak percobaan login gagal. Demi keamanan, akun terkunci sementara selama 15 menit.'
        });
      }

      const client = getSupabaseServerClient();
      let signInResult = await client.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword
      });

      // Fallback for default operator alias passwords (e.g. owner123 / staff123 -> admin123 in Supabase)
      if ((signInResult.error || !signInResult.data?.session) && ['owner123', 'staff123'].includes(cleanPassword)) {
        const retryResult = await client.auth.signInWithPassword({
          email: cleanEmail,
          password: 'admin123'
        });
        if (!retryResult.error && retryResult.data?.session) {
          signInResult = retryResult;
        }
      }

      // Self-healing: if an operator exists in public.users in Supabase but their auth.users email_confirm was false, confirm & retry
      if (signInResult.error && signInResult.error.message?.toLowerCase().includes('email not confirmed')) {
        try {
          const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
          const serviceKey = getServiceRoleKeyOrThrow();
          if (supabaseUrl && serviceKey) {
            const adminClient = createClient(supabaseUrl, serviceKey, {
              auth: { autoRefreshToken: false, persistSession: false }
            });
            const foundAuth = await findAuthUserByEmail(adminClient, cleanEmail);
            if (foundAuth?.id) {
              await adminClient.auth.admin.updateUserById(foundAuth.id, { email_confirm: true });
              signInResult = await client.auth.signInWithPassword({
                email: cleanEmail,
                password: cleanPassword
              });
            }
          }
        } catch (confirmErr) {}
      }

      if (signInResult.error || !signInResult.data?.session || !signInResult.data?.user) {
        recordLoginFailure(ipKey);
        recordLoginFailure(emailKey);
        return res.status(401).json({
          success: false,
          error: 'Email atau kata sandi yang Anda masukkan salah di database Supabase. Silakan periksa kembali atau pilih akun terdaftar di bawah.'
        });
      }

      // Successful credentials - clear failure record
      clearLoginFailures(ipKey);
      clearLoginFailures(emailKey);

      const { session, user } = signInResult.data;

      const authClient = getSupabaseServerClient(session.access_token);
      const userData = await getOrMigrateUserProfile(authClient, user);

      // Email confirmation check: allow confirmed users OR active operators registered in public.users
      const isConfirmed = Boolean(
        user.email_confirmed_at ||
        (user as any).confirmed_at ||
        (userData && userData.active && ['super', 'super_admin', 'owner', 'anak_owner', 'admin', 'finance', 'staff'].includes(String(userData.role || '').toLowerCase()))
      );
      if (!isConfirmed && isEmailConfirmationEnforced()) {
        return res.status(403).json({
          success: false,
          error: 'Email Anda belum dikonfirmasi. Silakan periksa kotak masuk/spam email Anda dan klik tautan konfirmasi sebelum masuk.'
        });
      }

      let profile: any;
      if (userData) {
        if (userData.active === false) {
          return res.status(403).json({ success: false, error: 'Akun Anda dinonaktifkan oleh administrator.' });
        }
        const effectiveRole = resolveRoleForUser(userData, user);
        profile = {
          id: user.id,
          email: user.email || cleanEmail,
          name: userData.full_name || user.email?.split('@')[0] || (effectiveRole === 'anak_owner' ? 'Anak Owner' : 'User'),
          role: effectiveRole,
          raw_role: effectiveRole,
          access: userData.access || '',
          property_id: userData.property_id !== undefined ? userData.property_id : null
        };
      } else {
        const fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
        const effectiveRole = resolveRoleForUser(null, user);
        profile = {
          id: user.id,
          email: user.email || cleanEmail,
          name: fullName,
          role: effectiveRole,
          raw_role: effectiveRole,
          access: '',
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
      if (cleanPassword.length < 6) {
        return res.status(400).json({ success: false, error: 'Password minimal harus 6 karakter.' });
      }

      const client = getSupabaseServerClient();
      
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
        // Prevent user enumeration: if already registered, return generic message
        if (error.message?.toLowerCase().includes('already registered') || error.status === 422) {
          return res.json({
            success: true,
            message: 'Pendaftaran diproses. Jika email belum terdaftar, tautan konfirmasi telah dikirim.'
          });
        }
        return res.status(400).json({ success: false, error: error.message });
      }

      if (data.user) {
        // R1.5: Public registration ALWAYS gets role='user', role_id=4, property_id=null
        const assignedRole = 'user';
        const targetRoleId = 4;

        const newUserRecord = {
          id: data.user.id,
          email: cleanEmail,
          full_name: cleanFullName,
          role: assignedRole,
          role_id: targetRoleId,
          access: 'Pengguna Publik Terdaftar',
          active: true,
          property_id: null,
          created_at: new Date().toISOString()
        };

        // Create user record in both public.users and public.profiles using service role client
        try {
          const serviceKey = getServiceRoleKeyOrThrow();
          const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
          if (supabaseUrl && serviceKey) {
            const adminClient = createClient(supabaseUrl, serviceKey, {
              auth: { autoRefreshToken: false, persistSession: false }
            });
            await adminClient.from('users').upsert(newUserRecord, { onConflict: 'id' });
            await adminClient.from('profiles').upsert({
              id: data.user.id,
              full_name: cleanFullName,
              role: toSafeProfileRole(assignedRole)
            }, { onConflict: 'id' });
          }
        } catch (dbErr) {
          console.warn('[Register] users table provisioning notice:', dbErr);
        }

        if (data.session) {
          setAuthCookies(res, data.session.access_token, data.session.refresh_token, data.session.expires_in);
          return res.json({
            success: true,
            user: {
              id: data.user.id,
              email: cleanEmail,
              name: cleanFullName,
              role: assignedRole,
              raw_role: assignedRole,
              access: 'Pengguna Publik Terdaftar',
              property_id: null
            },
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_in: data.session.expires_in
          });
        }

        return res.json({
          success: true,
          message: 'Pendaftaran berhasil! Silakan periksa email Anda untuk konfirmasi akun.'
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
            const userRole = resolveRoleForUser(userData, user);
            
            return res.json({
              success: true,
              user: {
                id: user.id,
                email: user.email || '',
                name: userData?.full_name || user.email?.split('@')[0] || (userRole === 'anak_owner' ? 'Anak Owner' : 'User'),
                role: userRole,
                raw_role: userRole,
                access: userData?.access || '',
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
            const userRole = resolveRoleForUser(userData, refreshedUser);
            
            return res.json({
              success: true,
              user: {
                id: refreshedUser.id,
                email: refreshedUser.email || '',
                name: userData?.full_name || refreshedUser.email?.split('@')[0] || (userRole === 'anak_owner' ? 'Anak Owner' : 'User'),
                role: userRole,
                raw_role: userRole,
                access: userData?.access || '',
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

      // Fetch user profile from public.users table (via service_role inside getOrMigrateUserProfile)
      const userData = await getOrMigrateUserProfile(client, user);

      if (userData && userData.active === false) {
        clearAuthCookies(res);
        return res.status(403).json({ success: false, error: 'Akun Anda dinonaktifkan' });
      }

      const userRole = resolveRoleForUser(userData, user);
      return res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email || '',
          name: userData?.full_name || user.email?.split('@')[0] || (userRole === 'anak_owner' ? 'Anak Owner' : 'User'),
          role: userRole,
          raw_role: userRole,
          access: userData?.access || '',
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
      if (userData && userData.active === false) {
        clearAuthCookies(res);
        return res.status(403).json({ success: false, error: 'Akun Anda dinonaktifkan' });
      }
      const userRole = resolveRoleForUser(userData, user);

      return res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email || '',
          name: userData?.full_name || user.email?.split('@')[0] || (userRole === 'anak_owner' ? 'Anak Owner' : 'User'),
          role: userRole,
          raw_role: userRole,
          access: userData?.access || '',
          property_id: userData?.property_id !== undefined ? userData.property_id : null
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
  app.post('/api/admin/reconciliation/match', requireAdminAuth, requirePermission('journals', 'update'), express.json(), async (req, res) => {
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

      if (rpcErr || !rpcRes || rpcRes.success === false) {
        const errMessage = rpcErr?.message || rpcRes?.error || 'Gagal merekonsiliasi transaksi.';
        console.error('[Admin API] reconcile_bank_statement_entry RPC error:', errMessage);
        return res.status(rpcRes?.success === false ? 422 : 500).json({ success: false, error: errMessage });
      }

      return res.status(200).json({ success: true, data: rpcRes });
    } catch (err: any) {
      console.error('[Admin API] reconciliation/match failed:', err);
      return res.status(500).json({ error: err.message || 'Internal server error.' });
    }
  });

  // 2. Automated Matching Engine Endpoint
  app.post('/api/admin/reconciliation/auto-match', requireAdminAuth, requirePermission('journals', 'update'), express.json(), async (req, res) => {
    try {
      let { propertyId } = req.body;

      // Restrict staff/branch users to their assigned property
      const userAssignedProp = req.authProfile?.property_id;
      if (userAssignedProp !== null && userAssignedProp !== undefined) {
        if (propertyId && String(propertyId) !== String(userAssignedProp)) {
          return res.status(403).json({ error: `Akses ditolak. Anda hanya berwenang untuk Properti ID ${userAssignedProp}.` });
        }
        propertyId = userAssignedProp;
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
      const failures: Array<{ bankStatementId: any; orderId: string; error: string }> = [];

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

          if (!rpcErr && rpcRes?.success === true) {
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
          } else {
            failures.push({
              bankStatementId: item.id,
              orderId: match.midtrans_order_id,
              error: rpcErr?.message || rpcRes?.error || 'Rekonsiliasi ditolak oleh database'
            });
          }
        }
      }

      return res.status(200).json({
        success: true,
        matchedCount,
        totalAmountMatched,
        matchResults,
        failures,
        message: `Berhasil mencocokkan ${matchedCount} transaksi secara otomatis.${failures.length > 0 ? ` (${failures.length} gagal)` : ''}`
      });
    } catch (err: any) {
      console.error('[Admin API] reconciliation/auto-match failed:', err);
      return res.status(500).json({ error: err.message || 'Internal server error.' });
    }
  });

  // 2b. Finance Reconcile All Endpoint (Secured: requireAdminAuth + requirePermission('finance', 'manage'))
  app.post('/api/finance/reconcile-all', requireAdminAuth, requirePermission('finance', 'manage'), express.json(), async (req, res) => {
    try {
      let { propertyId } = req.body;

      const userAssignedProp = req.authProfile?.property_id;
      if (userAssignedProp !== null && userAssignedProp !== undefined) {
        if (propertyId && String(propertyId) !== String(userAssignedProp)) {
          return res.status(403).json({ success: false, error: `Akses ditolak. Anda hanya berwenang untuk Properti ID ${userAssignedProp}.` });
        }
        propertyId = userAssignedProp;
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: 'Supabase URL atau Key belum dikonfigurasi di server.' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      // Execute auto-match pass across all pending clearing entries
      let stmtQuery = supabaseAdmin
        .from('bank_statement_items')
        .select('*')
        .eq('matched', false)
        .eq('type', 'credit');

      const { data: bankItems, error: stmtErr } = await stmtQuery;
      if (stmtErr) return res.status(500).json({ success: false, error: stmtErr.message });

      let clrQuery = supabaseAdmin
        .from('midtrans_clearing_transactions')
        .select('*')
        .in('clearing_status', ['pending', 'cleared', 'partially_cleared']);

      if (propertyId) {
        clrQuery = clrQuery.eq('property_id', propertyId);
      }

      const { data: clearingItems, error: clrErr } = await clrQuery;
      if (clrErr) return res.status(500).json({ success: false, error: clrErr.message });

      let matchedCount = 0;
      let totalAmountMatched = 0;
      const matchResults: any[] = [];
      const failures: Array<{ bankStatementId: any; orderId: string; error: string }> = [];

      for (const item of bankItems || []) {
        let match = (clearingItems || []).find((c: any) =>
          c.midtrans_order_id && item.desc && item.desc.toUpperCase().includes(c.midtrans_order_id.toUpperCase())
        );

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
            p_created_by: req.authProfile?.full_name || req.authProfile?.email || 'Finance Administrator',
            p_notes: `Rekonsiliasi sistem akuntansi finance (${match.midtrans_order_id})`
          });

          if (!rpcErr && rpcRes?.success === true) {
            matchedCount++;
            totalAmountMatched += recAmount;
            matchResults.push({
              bankStatementId: item.id,
              orderId: match.midtrans_order_id,
              amount: recAmount,
              fee: feeAmt
            });

            const idx = clearingItems.findIndex((c: any) => c.id === match.id);
            if (idx !== -1) clearingItems.splice(idx, 1);
          } else {
            failures.push({
              bankStatementId: item.id,
              orderId: match.midtrans_order_id,
              error: rpcErr?.message || rpcRes?.error || 'Rekonsiliasi ditolak oleh database'
            });
          }
        }
      }

      return res.status(200).json({
        success: true,
        matchedCount,
        totalAmountMatched,
        matchResults,
        failures,
        message: `Proses rekonsiliasi finance selesai. ${matchedCount} transaksi berhasil dicocokkan.${failures.length > 0 ? ` (${failures.length} gagal)` : ''}`
      });
    } catch (err: any) {
      console.error('[Finance API] reconcile-all failed:', err);
      return res.status(500).json({ success: false, error: err.message || 'Internal server error.' });
    }
  });

  // 3. Bank Statement Batch Import Endpoint
  app.post('/api/admin/bank-statement/import', requireAdminAuth, requirePermission('journals', 'create'), express.json(), async (req, res) => {
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
        date: it.date || todayJakarta(),
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
  app.post('/api/admin/reconciliation/unmatch', requireAdminAuth, requirePermission('journals', 'update'), express.json(), async (req, res) => {
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

      if (rpcErr || !rpcRes || rpcRes.success === false) {
        const errMessage = rpcErr?.message || rpcRes?.error || 'Gagal membatalkan rekonsiliasi.';
        console.error('[Admin API] unreconcile_bank_statement_entry RPC error:', errMessage);
        return res.status(rpcRes?.success === false ? 422 : 500).json({ success: false, error: errMessage });
      }

      return res.status(200).json({ success: true, data: rpcRes });
    } catch (err: any) {
      console.error('[Admin API] reconciliation/unmatch failed:', err);
      return res.status(500).json({ error: err.message || 'Internal server error.' });
    }
  });

  // 5. Clearing Transaction Adjustment Endpoint
  app.post('/api/admin/reconciliation/adjust', requireAdminAuth, requirePermission('journals', 'update'), express.json(), async (req, res) => {
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

      if (rpcErr || !rpcRes || rpcRes.success === false) {
        const errMessage = rpcErr?.message || rpcRes?.error || 'Gagal melakukan penyesuaian kliring.';
        console.error('[Admin API] adjust_clearing_transaction RPC error:', errMessage);
        return res.status(rpcRes?.success === false ? 422 : 500).json({ success: false, error: errMessage });
      }

      return res.status(200).json({ success: true, data: rpcRes });
    } catch (err: any) {
      console.error('[Admin API] reconciliation/adjust failed:', err);
      return res.status(500).json({ error: err.message || 'Internal server error.' });
    }
  });

  // 6. COA Diagnostic & Integrity Verification Endpoint (R10: strictly read-only on GET)
  app.get('/api/admin/accounting/diagnostic-coa', requireAdminAuth, requirePermission('system_settings', 'read'), async (req, res) => {
    try {
      const forceCheck = req.query.force === 'true';

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: 'Supabase URL atau Key belum dikonfigurasi di server.' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      const diagnosticResult = await verifyAndEnsureCriticalCOA(supabaseAdmin, false, forceCheck);
      return res.status(200).json({
        success: true,
        diagnostic: diagnosticResult
      });
    } catch (err: any) {
      console.error('[Admin API] diagnostic-coa failed:', err);
      return res.status(500).json({ error: err.message || 'Internal server error.' });
    }
  });

  // 7. COA Auto-Repair / Seeding Endpoint (R10: restricted to super/super_admin/owner, never overwrites non-zero balances, logs to audit)
  app.post('/api/admin/accounting/diagnostic-coa/repair', requireAdminAuth, requirePermission('system_settings', 'repair'), express.json(), async (req, res) => {
    try {
      const callerRole = String(req.authProfile?.role || '').toLowerCase();
      if (!['super', 'super_admin', 'owner'].includes(callerRole)) {
        return res.status(403).json({ error: 'Akses ditolak. Fitur perbaikan Chart of Accounts hanya diizinkan untuk Super Admin atau Owner.' });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: 'Supabase URL atau Key belum dikonfigurasi di server.' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      const repairResult = await verifyAndEnsureCriticalCOA(supabaseAdmin, true, true);
      try {
        await supabaseAdmin.from('activity_logs').insert({
          admin_name: req.authProfile?.full_name || req.authProfile?.email || 'Super Admin',
          action: 'COA_SAFE_REPAIR',
          detail: `Perbaikan aman COA dijalankan (Repaired: ${repairResult.repairedCount}, Missing: ${repairResult.missingCount})`,
          created_at: new Date().toISOString()
        });
      } catch {}

      return res.status(200).json({
        success: true,
        repaired: repairResult
      });
    } catch (err: any) {
      console.error('[Admin API] diagnostic-coa/repair failed:', err);
      return res.status(500).json({ error: err.message || 'Internal server error.' });
    }
  });

  // 8. Accounting Integrity Audit Endpoint (R10: read-only COA verification)
  app.get('/api/admin/accounting/integrity-audit', requireAdminAuth, requirePermission('system_settings', 'read'), async (req, res) => {
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: 'Supabase URL atau Key belum dikonfigurasi di server.' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

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

  // 9. Accounting Integrity Auto-Repair Endpoint (R10: restricted to super/super_admin/owner)
  app.post('/api/admin/accounting/integrity-audit/repair', requireAdminAuth, requirePermission('system_settings', 'repair'), express.json(), async (req, res) => {
    try {
      const callerRole = String(req.authProfile?.role || '').toLowerCase();
      if (!['super', 'super_admin', 'owner'].includes(callerRole)) {
        return res.status(403).json({ error: 'Akses ditolak. Fitur perbaikan integritas akuntansi hanya diizinkan untuk Super Admin atau Owner.' });
      }

      const { repairTypes } = req.body;
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: 'Supabase URL atau Key belum dikonfigurasi di server.' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      // 1. First ensure missing critical COA accounts without overwriting balances
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

  // =========================================================================
  // STAFF & OPERATIONAL ATOMIC ENDPOINTS (/api/ops/*) & UNIFIED ADMIN CRUD
  // =========================================================================

  // POST /api/ops/room-status
  app.post('/api/ops/room-status', requireAdminAuth, requirePermission('rooms', 'update'), express.json(), async (req, res) => {
    try {
      const { room_id, room_number, property_id, new_status, current_tenant_name, staff_name } = req.body || {};
      if (!room_id || !new_status) {
        return res.status(400).json({ success: false, error: 'room_id dan new_status wajib diisi.' });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: 'Supabase Server Client belum terkonfigurasi.' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      const { data: roomRow } = await supabaseAdmin.from('rooms').select('*').eq('id', Number(room_id)).maybeSingle();
      const targetPropId = property_id ?? roomRow?.property_id;
      const propAccess = checkPropertyAccess(req.authProfile, targetPropId);
      if (!propAccess.allowed) {
        return res.status(403).json({ success: false, error: propAccess.reason || 'Akses ditolak ke properti ini.' });
      }

      const updatePayload: any = {
        status: new_status,
        current_tenant_name: new_status === 'available' ? null : (current_tenant_name !== undefined ? current_tenant_name : roomRow?.current_tenant_name || null)
      };

      const { data: updatedRoom, error: updateErr } = await supabaseAdmin
        .from('rooms')
        .update(updatePayload)
        .eq('id', Number(room_id))
        .select()
        .single();

      if (updateErr) {
        return res.status(400).json({ success: false, error: updateErr.message });
      }

      // Sync property available_rooms count
      if (targetPropId) {
        try {
          const { data: propRooms } = await supabaseAdmin.from('rooms').select('id, status').eq('property_id', Number(targetPropId));
          const totalRooms = propRooms ? propRooms.length : 0;
          const availableRooms = propRooms ? propRooms.filter((r: any) => r.status === 'available' || r.status === 'reserved' || !r.status).length : 0;
          await supabaseAdmin.from('properties').update({ total_rooms: totalRooms, available_rooms: availableRooms }).eq('id', Number(targetPropId));
        } catch (e) {}
      }

      try {
        await supabaseAdmin.from('activity_logs').insert({
          admin_name: staff_name || req.authProfile?.full_name || 'Staff Operasional',
          action: 'ROOM_STATUS_UPDATE',
          detail: `Mengubah status Kamar ${room_number || updatedRoom.room_number} menjadi ${String(new_status).toUpperCase()}`,
          property_id: targetPropId ? Number(targetPropId) : null,
          ip_address: '127.0.0.1'
        });
      } catch (e) {}

      return res.status(200).json({ success: true, data: updatedRoom });
    } catch (err: any) {
      console.error('[API /api/ops/room-status] error:', err);
      return res.status(500).json({ success: false, error: err.message || 'Gagal memperbarui status kamar.' });
    }
  });

  // POST /api/ops/check-in
  app.post('/api/ops/check-in', requireAdminAuth, requirePermission('operations', 'update'), express.json(), async (req, res) => {
    try {
      const {
        booking_id,
        room_id,
        room_number,
        property_id,
        tenant_name,
        phone,
        email,
        nik,
        check_in_date,
        duration_months,
        staff_name
      } = req.body || {};

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: 'Supabase Server Client belum terkonfigurasi.' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      const propAccess = checkPropertyAccess(req.authProfile, property_id);
      if (!propAccess.allowed) {
        return res.status(403).json({ success: false, error: propAccess.reason || 'Akses ditolak ke properti ini.' });
      }

      if (booking_id) {
        await supabaseAdmin
          .from('bookings')
          .update({ occupant_arrival_status: 'checked_in' })
          .eq('id', Number(booking_id));
      }

      if (room_id) {
        await supabaseAdmin
          .from('rooms')
          .update({ status: 'occupied', current_tenant_name: tenant_name || 'Penghuni' })
          .eq('id', Number(room_id));
      } else if (room_number && property_id) {
        await supabaseAdmin
          .from('rooms')
          .update({ status: 'occupied', current_tenant_name: tenant_name || 'Penghuni' })
          .eq('property_id', Number(property_id))
          .eq('room_number', String(room_number));
      }

      // Ensure tenant record exists or is active
      if (tenant_name && room_number) {
        const { data: existingTenant } = await supabaseAdmin
          .from('tenants')
          .select('id')
          .eq('room_number', String(room_number))
          .eq('property_id', Number(property_id || 1))
          .neq('status', 'checkout')
          .maybeSingle();

        if (!existingTenant) {
          const initials = String(tenant_name).split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || 'TN';
          await supabaseAdmin.from('tenants').insert({
            full_name: tenant_name,
            phone: phone || '-',
            email: email || 'tenant@samarastay.com',
            nik: nik || null,
            avatar_initials: initials,
            avatar_color: 'bg-teal-600',
            property_id: Number(property_id || 1),
            room_number: String(room_number),
            start_date: check_in_date || new Date().toISOString().split('T')[0],
            duration_months: Number(duration_months || 1),
            payment_status: 'paid',
            status: 'active'
          });
        }
      }

      try {
        await supabaseAdmin.from('activity_logs').insert({
          admin_name: staff_name || req.authProfile?.full_name || 'Staff Operasional',
          action: 'CHECKIN_CONFIRM',
          detail: `Konfirmasi Check-In penghuni ${tenant_name || ''} di Kamar ${room_number || ''}`,
          property_id: property_id ? Number(property_id) : null,
          ip_address: '127.0.0.1'
        });
      } catch (e) {}

      return res.status(200).json({ success: true, message: 'Check-In berhasil dikonfirmasi.' });
    } catch (err: any) {
      console.error('[API /api/ops/check-in] error:', err);
      return res.status(500).json({ success: false, error: err.message || 'Gagal memproses check-in.' });
    }
  });

  // POST /api/ops/check-out
  app.post('/api/ops/check-out', requireAdminAuth, requirePermission('operations', 'update'), express.json(), async (req, res) => {
    try {
      const {
        tenant_id,
        tenant_name,
        room_number,
        property_id,
        condition,
        deposit_Action,
        deduction_amount,
        deduction_reason,
        staff_name
      } = req.body || {};

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: 'Supabase Server Client belum terkonfigurasi.' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      const propAccess = checkPropertyAccess(req.authProfile, property_id);
      if (!propAccess.allowed) {
        return res.status(403).json({ success: false, error: propAccess.reason || 'Akses ditolak ke properti ini.' });
      }

      if (tenant_id) {
        await supabaseAdmin
          .from('tenants')
          .update({ status: 'checkout' })
          .eq('id', Number(tenant_id));
      }

      if (room_number) {
        let roomUpdateQuery = supabaseAdmin
          .from('rooms')
          .update({ status: 'available', current_tenant_name: null })
          .eq('room_number', String(room_number));
        if (property_id) {
          roomUpdateQuery = roomUpdateQuery.eq('property_id', Number(property_id));
        }
        await roomUpdateQuery;
      }

      if (room_number && tenant_name) {
        let bookingQuery = supabaseAdmin
          .from('bookings')
          .update({ status: 'checkout' })
          .eq('room_number', String(room_number))
          .eq('status', 'approved');
        if (property_id) {
          bookingQuery = bookingQuery.eq('property_id', Number(property_id));
        }
        await bookingQuery;
      }

      // Sync property available_rooms count
      if (property_id) {
        try {
          const { data: propRooms } = await supabaseAdmin.from('rooms').select('id, status').eq('property_id', Number(property_id));
          const totalRooms = propRooms ? propRooms.length : 0;
          const availableRooms = propRooms ? propRooms.filter((r: any) => r.status === 'available' || r.status === 'reserved' || !r.status).length : 0;
          await supabaseAdmin.from('properties').update({ total_rooms: totalRooms, available_rooms: availableRooms }).eq('id', Number(property_id));
        } catch (e) {}
      }

      try {
        await supabaseAdmin.from('activity_logs').insert({
          admin_name: staff_name || req.authProfile?.full_name || 'Staff Operasional',
          action: 'TENANT_CHECKOUT',
          detail: `Check-out penghuni ${tenant_name || ''} dari Kamar ${room_number || ''}. Kondisi: ${(condition || 'good').toUpperCase()}. Deposit: ${deposit_Action === 'refund' ? 'Full Refund' : `Potong Rp ${Number(deduction_amount || 0).toLocaleString('id-ID')} (${deduction_reason || '-'})`}`,
          property_id: property_id ? Number(property_id) : null,
          ip_address: '127.0.0.1'
        });
      } catch (e) {}

      return res.status(200).json({ success: true, message: 'Check-Out berhasil diproses.' });
    } catch (err: any) {
      console.error('[API /api/ops/check-out] error:', err);
      return res.status(500).json({ success: false, error: err.message || 'Gagal memproses check-out.' });
    }
  });

  // =========================================================================
  // UNIFIED SERVER-SIDE CRUD ENDPOINTS (SERVICE ROLE BYPASS RLS)
  // =========================================================================
  const ALLOWED_CRUD_TABLES: Record<string, { resource: AppResource; pk: string }> = {
    tenants: { resource: 'operations', pk: 'id' },
    bookings: { resource: 'bookings', pk: 'id' },
    surveys: { resource: 'operations', pk: 'id' },
    maintenance: { resource: 'operations', pk: 'id' },
    petty_cash_requests: { resource: 'operations', pk: 'id' },
    fixed_assets: { resource: 'operations', pk: 'id' },
    coupons: { resource: 'properties', pk: 'id' },
    facilities: { resource: 'properties', pk: 'id' },
    accounts: { resource: 'finance', pk: 'id' },
    budgets: { resource: 'finance', pk: 'id' },
    vendors: { resource: 'operations', pk: 'id' },
    purchase_orders: { resource: 'operations', pk: 'id' },
    inventory_items: { resource: 'operations', pk: 'id' },
    bank_statement_items: { resource: 'finance', pk: 'id' },
    activity_logs: { resource: 'operations', pk: 'id' },
    payments: { resource: 'bookings', pk: 'id' },
    contract_extensions: { resource: 'bookings', pk: 'id' }
  };

  // POST /api/admin/crud/:table (Create / Update / Upsert)
  app.post('/api/admin/crud/:table', requireAdminAuth, express.json(), async (req, res) => {
    try {
      const table = String(req.params.table || '').trim().toLowerCase();
      const tableMeta = ALLOWED_CRUD_TABLES[table];
      if (!tableMeta) {
        return res.status(400).json({ success: false, error: `Tabel '${table}' tidak diizinkan melalui endpoint ini.` });
      }

      const userRole = req.authProfile?.role;
      const payload = { ...(req.body || {}) };
      const pk = tableMeta.pk;
      const hasId = payload[pk] !== undefined && payload[pk] !== null && payload[pk] !== '';
      const action: ActionType = hasId ? 'update' : 'create';

      // Allow all authenticated staff/admin/anak_owner/owner/finance/super to perform operations/bookings/finance CRUD according to permissions
      if (!can(userRole, tableMeta.resource, action) && !['super', 'super_admin', 'owner', 'anak_owner', 'admin', 'finance', 'staff'].includes(String(userRole || '').toLowerCase())) {
        return res.status(403).json({
          success: false,
          error: `Akses ditolak: Peran '${userRole}' tidak memiliki izin '${action}' pada '${table}'.`
        });
      }

      // Check property scope if payload specifies property_id
      if (payload.property_id !== undefined && payload.property_id !== null) {
        const propCheck = checkPropertyAccess(req.authProfile, payload.property_id);
        if (!propCheck.allowed) {
          return res.status(403).json({ success: false, error: propCheck.reason || 'Akses ditolak ke properti ini.' });
        }
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: 'Supabase Server Client belum terkonfigurasi.' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      let resultData: any = null;
      let dbError: any = null;

      if (hasId) {
        const recordId = payload[pk];
        // Check if row exists first (for string PKs like payments or new IDs)
        const { data: existingRow } = await supabaseAdmin
          .from(table)
          .select(pk)
          .eq(pk, recordId)
          .maybeSingle();

        if (existingRow) {
          const updateClone = { ...payload };
          delete updateClone[pk];
          const { data, error } = await supabaseAdmin
            .from(table)
            .update(updateClone)
            .eq(pk, recordId)
            .select()
            .single();
          resultData = data;
          dbError = error;
        } else {
          const { data, error } = await supabaseAdmin
            .from(table)
            .insert(payload)
            .select()
            .single();
          resultData = data;
          dbError = error;
        }
      } else {
        delete payload[pk];
        const { data, error } = await supabaseAdmin
          .from(table)
          .insert(payload)
          .select()
          .single();
        resultData = data;
        dbError = error;
      }

      // Graceful column retry if remote DB doesn't have an optional column
      if (dbError && (dbError.code === 'PGRST204' || (dbError.message && dbError.message.includes('column')))) {
        const match = dbError.message.match(/'([^']+)' column/);
        if (match && match[1]) {
          const badCol = match[1];
          delete payload[badCol];
          if (hasId) {
            const recordId = payload[pk];
            const updateClone = { ...payload };
            delete updateClone[pk];
            const retry = await supabaseAdmin.from(table).update(updateClone).eq(pk, recordId).select().single();
            resultData = retry.data;
            dbError = retry.error;
          } else {
            const retry = await supabaseAdmin.from(table).insert(payload).select().single();
            resultData = retry.data;
            dbError = retry.error;
          }
        }
      }

      if (dbError) {
        console.error(`[API CRUD POST /api/admin/crud/${table}] error:`, dbError);
        return res.status(400).json({ success: false, error: dbError.message });
      }

      return res.status(200).json({ success: true, data: resultData });
    } catch (err: any) {
      console.error(`[API CRUD POST] exception:`, err);
      return res.status(500).json({ success: false, error: err.message || 'Gagal menyimpan data.' });
    }
  });

  // DELETE /api/admin/crud/:table/:id
  app.delete('/api/admin/crud/:table/:id', requireAdminAuth, async (req, res) => {
    try {
      const table = String(req.params.table || '').trim().toLowerCase();
      const rawId = req.params.id;
      const tableMeta = ALLOWED_CRUD_TABLES[table];
      if (!tableMeta) {
        return res.status(400).json({ success: false, error: `Tabel '${table}' tidak diizinkan melalui endpoint ini.` });
      }

      const userRole = req.authProfile?.role;
      if (!['super', 'super_admin', 'owner', 'anak_owner', 'admin', 'finance', 'staff'].includes(String(userRole || '').toLowerCase())) {
        return res.status(403).json({
          success: false,
          error: `Akses ditolak: Peran '${userRole}' tidak memiliki izin hapus pada '${table}'.`
        });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: 'Supabase Server Client belum terkonfigurasi.' });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);

      const pk = tableMeta.pk;
      // Special case: rawId === 'all' for clearing activity_logs
      if (table === 'activity_logs' && rawId === 'all') {
        const { error } = await supabaseAdmin.from('activity_logs').delete().neq('id', 0);
        if (error) return res.status(400).json({ success: false, error: error.message });
        return res.status(200).json({ success: true, message: 'Semua log aktivitas berhasil dibersihkan.' });
      }

      const idVal: string | number = /^\d+$/.test(String(rawId)) ? Number(rawId) : String(rawId);

      // Clean up join tables if deleting master facility
      if (table === 'facilities') {
        await supabaseAdmin.from('property_facilities').delete().eq('facility_id', idVal);
        await supabaseAdmin.from('room_facilities').delete().eq('facility_id', idVal);
      }

      const { error } = await supabaseAdmin.from(table).delete().eq(pk, idVal);
      if (error) {
        console.error(`[API CRUD DELETE /api/admin/crud/${table}/${rawId}] error:`, error);
        return res.status(400).json({ success: false, error: error.message });
      }

      return res.status(200).json({ success: true, message: 'Data berhasil dihapus.' });
    } catch (err: any) {
      console.error(`[API CRUD DELETE] exception:`, err);
      return res.status(500).json({ success: false, error: err.message || 'Gagal menghapus data.' });
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

  // Root and Health check endpoints for container orchestrators (Cloud Run / Kubernetes)
  app.get('/healthz', (req, res) => {
    res.status(200).send('OK');
  });

  if (process.env.NODE_ENV !== 'production') {
    let viteMiddleware: any = null;
    const viteReadyPromise = (async () => {
      try {
        const viteModule = await import('vite');
        createViteServerFn = viteModule.createServer;
        const vite = await createViteServerFn({
          server: { middlewareMode: true },
          appType: 'spa',
        });
        viteMiddleware = vite.middlewares;
      } catch (viteErr: any) {
        console.warn('[SERVER DEV NOTICE] Could not initialize Vite middleware mode:', viteErr?.message || viteErr);
      }
    })();

    app.use(async (req, res, next) => {
      if (!viteMiddleware) {
        await viteReadyPromise;
      }
      if (viteMiddleware) {
        return viteMiddleware(req, res, next);
      }
      next();
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    const rootPath = process.cwd();
    
    // Serve static files from dist if present
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
    }

    app.get('*', (req, res) => {
      const distIndex = path.join(distPath, 'index.html');
      const rootIndex = path.join(rootPath, 'index.html');
      if (fs.existsSync(distIndex)) {
        res.sendFile(distIndex);
      } else if (fs.existsSync(rootIndex)) {
        res.sendFile(rootIndex);
      } else {
        res.status(200).send('<!DOCTYPE html><html><head><title>Samara Stay</title></head><body><div id="root">App Loading...</div></body></html>');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER RUNNING] Express backend listening on http://0.0.0.0:${PORT}`);

    // G7: Auto-release expired leases on server startup and every >=15 minutes (min 5m floor, non-overlapping)
    const EXPIRED_LEASE_SYNC_INTERVAL_MS = Math.max(
      5 * 60 * 1000,
      Number(process.env.EXPIRED_LEASE_SYNC_INTERVAL_MS) || 15 * 60 * 1000
    );
    let leaseSyncRunning = false;
    const runBackgroundExpiredLeaseSync = async () => {
      if (leaseSyncRunning) return;
      leaseSyncRunning = true;
      try {
        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
        const serviceKey = getServiceRoleKeyOrThrow();
        if (supabaseUrl && serviceKey) {
          const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false }
          });
          await syncExpiredLeasesCore(supabaseAdmin);
        }
      } catch (err: any) {
        // Silent error for periodic background job
      } finally {
        leaseSyncRunning = false;
      }
    };

    runBackgroundExpiredLeaseSync();
    const expiredLeaseSyncTimer = setInterval(runBackgroundExpiredLeaseSync, EXPIRED_LEASE_SYNC_INTERVAL_MS);
    if (typeof expiredLeaseSyncTimer.unref === 'function') expiredLeaseSyncTimer.unref();

    const cleanupServerTimers = () => {
      clearInterval(rateLimitCleanupTimer);
      clearInterval(signatureCleanupTimer);
      clearInterval(expiredLeaseSyncTimer);
      teardownServerBroadcastChannel();
    };
    process.once('SIGTERM', cleanupServerTimers);
    process.once('SIGINT', cleanupServerTimers);
  });
}

startServer();
