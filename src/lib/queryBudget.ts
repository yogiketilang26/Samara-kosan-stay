/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Samara Stay ERP — Egress Control & Query Budget Module (E1–E11, C2, C3)
 */

export const REALTIME_TABLES: readonly string[] = [
  'properties',
  'rooms',
  'facilities',
  'property_facilities',
  'room_facilities',
  'nearby_amenities',
  'coupons',
  'settings',
  'bookings',
  'surveys',
  'tenants',
  'contract_extensions',
  'payments',
  'maintenance',
  'accounts',
  'financial_transactions',
  'journal_entries',
  'midtrans_clearing_transactions',
  'bank_statement_items',
  'bank_reconciliation_matches',
  'petty_cash_requests',
  'fixed_assets',
  'budgets',
  'vendors',
  'purchase_orders',
  'inventory_items',
  'users',
  'activity_logs'
] as const;

export const LOG_TABLES = new Set([
  'activity_logs',
  'sent_emails',
  'financial_audit_logs'
]);

export const PII_SENSITIVE_CACHE_TABLES = new Set([
  'bookings',
  'tenants',
  'surveys',
  'users',
  'profiles',
  'payments',
  'contract_extensions'
]);

// ============================================================================
// G6: ALLOWLIST KOLOM URUT (ORDERABLE_COLUMNS)
// ============================================================================
export const ORDERABLE_COLUMNS: Record<string, readonly string[]> = {
  properties: ['id', 'created_at', 'name', 'total_rooms', 'available_rooms'],
  rooms: ['id', 'created_at', 'room_number', 'floor', 'price', 'status', 'property_id'],
  facilities: ['id', 'created_at', 'name', 'category'],
  property_facilities: ['id', 'property_id', 'facility_id'],
  room_facilities: ['id', 'room_id', 'facility_id'],
  nearby_amenities: ['id', 'property_id', 'name', 'distance_km'],
  coupons: ['id', 'created_at', 'code', 'valid_until', 'is_active'],
  settings: ['id', 'updated_at'],
  bookings: ['id', 'created_at', 'booking_date', 'check_in_date', 'total_price', 'status', 'property_id', 'room_number'],
  surveys: ['id', 'created_at', 'survey_date', 'status', 'property_id', 'room_number'],
  tenants: ['id', 'created_at', 'start_date', 'duration_months', 'status', 'payment_status', 'property_id', 'room_number', 'full_name'],
  contract_extensions: ['id', 'created_at', 'paid_at', 'total_amount', 'status', 'tenant_id', 'property_id'],
  payments: ['id', 'created_at', 'payment_date', 'amount', 'status', 'property_id'],
  maintenance: ['id', 'created_at', 'date', 'priority', 'status', 'cost', 'property_id'],
  accounts: ['id', 'code', 'name', 'type', 'balance'],
  financial_transactions: ['id', 'created_at', 'transaction_date', 'transaction_no', 'amount', 'type', 'category', 'property_id'],
  journal_entries: ['id', 'created_at', 'journal_no', 'transaction_id', 'account_id', 'debit', 'credit'],
  midtrans_clearing_transactions: ['id', 'created_at', 'settled_at', 'reconciled_at', 'gross_amount', 'net_amount', 'clearing_status', 'property_id'],
  bank_statement_items: ['id', 'created_at', 'statement_date', 'amount', 'status'],
  bank_reconciliation_matches: ['id', 'created_at', 'matched_at', 'matched_amount'],
  petty_cash_requests: ['id', 'created_at', 'date', 'amount', 'status'],
  fixed_assets: ['id', 'created_at', 'name', 'cost', 'property_id', 'next_maintenance_date'],
  budgets: ['id', 'created_at', 'category', 'allocated', 'spent', 'period'],
  vendors: ['id', 'created_at', 'name', 'category', 'status'],
  purchase_orders: ['id', 'created_at', 'date', 'amount', 'status'],
  inventory_items: ['id', 'created_at', 'name', 'stock', 'min_stock'],
  users: ['id', 'created_at', 'name', 'email', 'role', 'property_id'],
  activity_logs: ['id', 'created_at', 'timestamp', 'action', 'user_name']
};

export function resolveOrderColumn(
  table: string,
  requestedCol?: string | null,
  fallbackCol?: string
): string {
  const cleanTable = String(table || '').trim().toLowerCase();
  const defaultCol =
    fallbackCol ||
    (cleanTable === 'bookings' || cleanTable === 'surveys' ? 'created_at' : 'id');
  if (!requestedCol) return defaultCol;
  const cleanCol = String(requestedCol).trim();
  const allowed = ORDERABLE_COLUMNS[cleanTable] || ['id', 'created_at'];
  return allowed.includes(cleanCol) ? cleanCol : defaultCol;
}

export function resolveOrderAsc(
  requestedAsc?: string | boolean | null,
  defaultAsc: boolean = false
): boolean {
  if (requestedAsc === undefined || requestedAsc === null || requestedAsc === '') {
    return defaultAsc;
  }
  if (typeof requestedAsc === 'boolean') return requestedAsc;
  const s = String(requestedAsc).trim().toLowerCase();
  if (s === 'true') return true;
  if (s === 'false') return false;
  return defaultAsc;
}

// ============================================================================
// G10: PROYEKSI KOLOM UNTUK LIST VIEW TERBESAR
// ============================================================================
export const LIST_COLUMNS_BOOKINGS = [
  'id', 'property_id', 'room_id', 'room_number', 'tenant_name', 'phone', 'email', 'nik',
  'booking_date', 'check_in_date', 'duration_months', 'booking_type', 'duration_days',
  'total_price', 'status', 'payment_method', 'midtrans_order_id', 'is_dp', 'dp_amount',
  'coupon_code', 'discount_amount', 'is_for_other', 'occupant_name', 'occupant_phone',
  'occupant_email', 'occupant_nik', 'occupant_arrival_status', 'is_occupant_verified',
  'signature_url', 'is_married', 'marriage_certificate_url', 'spouse_name', 'spouse_nik',
  'spouse_phone', 'spouse_relation', 'created_at'
] as const;

export const LIST_COLUMNS_TENANTS = [
  'id', 'full_name', 'phone', 'email', 'nik', 'job', 'address', 'property_id',
  'room_number', 'start_date', 'duration_months', 'payment_status', 'status',
  'avatar_initials', 'avatar_color', 'signature_url', 'is_married',
  'marriage_certificate_url', 'spouse_name', 'spouse_nik', 'spouse_phone',
  'spouse_relation', 'created_at'
] as const;

export const LIST_COLUMNS_FINANCIAL_TRANSACTIONS = [
  'id', 'transaction_no', 'transaction_date', 'date', 'category', 'description',
  'amount', 'type', 'reference_type', 'reference_id', 'debit_account_id',
  'credit_account_id', 'status', 'created_by', 'property_id', 'created_at'
] as const;

export const LIST_COLUMNS_PAYMENTS = [
  'id', 'tenant_name', 'property_id', 'amount', 'method', 'status',
  'payment_date', 'midtrans_order_id', 'transaction_id', 'proof_url', 'created_at'
] as const;

export const LIST_COLUMNS_CONTRACT_EXTENSIONS = [
  'id', 'tenant_id', 'tenant_name', 'property_id', 'room_number',
  'old_start_date', 'old_duration_months', 'extension_months', 'monthly_rate',
  'total_amount', 'payment_method', 'status', 'midtrans_order_id',
  'transaction_id', 'invoice_id', 'paid_at', 'notes', 'created_at'
] as const;

export const LIST_COLUMNS_MIDTRANS_CLEARING = [
  'id', 'booking_id', 'midtrans_order_id', 'midtrans_transaction_id',
  'gross_amount', 'fee_amount', 'net_amount', 'reconciled_amount',
  'outstanding_amount', 'clearing_status', 'property_id', 'tenant_name',
  'settled_at', 'reconciled_at', 'created_at'
] as const;

export interface TableLimitPolicy {
  defaultLimit: number;
  maxLimit: number;
}

export function getTableLimitPolicy(table: string): TableLimitPolicy {
  const clean = String(table || '').trim().toLowerCase();
  if (clean === 'settings') {
    return { defaultLimit: 1, maxLimit: 10 };
  }
  if (LOG_TABLES.has(clean)) {
    return { defaultLimit: 50, maxLimit: 200 };
  }
  // Operational & financial tables preserve default 1000 for aggregation parity, capped at 1000 (E7/E8)
  return { defaultLimit: 1000, maxLimit: 1000 };
}

export function resolveLimit(table: string, requestedLimit?: number | string | null): number {
  const policy = getTableLimitPolicy(table);
  if (requestedLimit === undefined || requestedLimit === null || requestedLimit === '') {
    return policy.defaultLimit;
  }
  const parsed = Math.floor(Number(requestedLimit));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return policy.defaultLimit;
  }
  return Math.max(1, Math.min(parsed, policy.maxLimit));
}

export function resolveOffset(requestedOffset?: number | string | null): number {
  if (requestedOffset === undefined || requestedOffset === null || requestedOffset === '') {
    return 0;
  }
  const parsed = Math.floor(Number(requestedOffset));
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

export interface SanitizedColumnsResult {
  selectExpr: string;
  columnsParam: string;
  isProjected: boolean;
}

const SAFE_COLUMN_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function sanitizeColumns(
  table: string,
  requestedColumns?: string | readonly string[] | null,
  allowedSchemas?: Record<string, string[]>
): SanitizedColumnsResult {
  if (!requestedColumns) {
    return { selectExpr: '*', columnsParam: '', isProjected: false };
  }

  const rawList = Array.isArray(requestedColumns)
    ? requestedColumns
    : String(requestedColumns)
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);

  if (rawList.length === 0 || (rawList.length === 1 && rawList[0] === '*')) {
    return { selectExpr: '*', columnsParam: '', isProjected: false };
  }

  const allowedSet = allowedSchemas && allowedSchemas[table]
    ? new Set(allowedSchemas[table])
    : null;

  const validCols: string[] = [];
  for (const col of rawList) {
    const clean = String(col).trim();
    if (!SAFE_COLUMN_IDENT.test(clean)) continue;
    if (allowedSet && !allowedSet.has(clean)) continue;
    if (!validCols.includes(clean)) {
      validCols.push(clean);
    }
  }

  if (validCols.length === 0) {
    return { selectExpr: '*', columnsParam: '', isProjected: false };
  }

  // Always include 'id' if valid in schema so React keys & realtime diffing never break
  if ((!allowedSet || allowedSet.has('id')) && !validCols.includes('id')) {
    validCols.unshift('id');
  }

  const joined = validCols.join(',');
  return {
    selectExpr: joined,
    columnsParam: joined,
    isProjected: true
  };
}

// ============================================================================
// E9: IN-FLIGHT REQUEST DEDUPLICATION
// ============================================================================
const inflightPromises = new Map<string, Promise<any>>();

export function dedupeInflight<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = inflightPromises.get(key);
  if (existing) {
    queryBudget.recordDeduped(key);
    return existing as Promise<T>;
  }

  const promise = Promise.resolve()
    .then(() => factory())
    .finally(() => {
      inflightPromises.delete(key);
    });

  inflightPromises.set(key, promise);
  return promise;
}

export function getInflightCount(): number {
  return inflightPromises.size;
}

// ============================================================================
// E3: EXPONENTIAL/STEPPED BACKOFF POLLING HELPER
// ============================================================================
export interface PollWithBackoffOptions<T> {
  fn: (attempt: number) => Promise<T>;
  isTerminal?: (result: T) => boolean;
  baseIntervalMs?: number;
  maxIntervalMs?: number;
  hiddenTabMultiplier?: number;
  maxAttempts?: number;
  isHidden?: () => boolean;
  onResult?: (result: T, attempt: number) => void;
  onError?: (err: any, attempt: number) => boolean | void; // return true to stop
}

export interface PollController {
  stop: () => void;
  readonly attempts: number;
  readonly stopped: boolean;
  readonly promise: Promise<void>;
}

export function pollWithBackoff<T>(options: PollWithBackoffOptions<T>): PollController {
  const baseIntervalMs = Math.max(500, options.baseIntervalMs ?? 2500);
  const maxIntervalMs = Math.max(baseIntervalMs, options.maxIntervalMs ?? 15000);
  const hiddenMultiplier = Math.max(1, options.hiddenTabMultiplier ?? 2);
  const maxAttempts = Math.max(1, options.maxAttempts ?? 25);

  let attempts = 0;
  let stopped = false;
  let timer: any = null;
  let resolveDone: (() => void) | null = null;
  const promise = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const isTabHidden = () => {
    if (options.isHidden) return options.isHidden();
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return true;
    }
    return false;
  };

  const stop = () => {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (resolveDone) {
      const r = resolveDone;
      resolveDone = null;
      r();
    }
  };

  const scheduleNext = () => {
    if (stopped || attempts >= maxAttempts) {
      stop();
      return;
    }
    // Stepped backoff: 2.5s -> 3.5s -> 5s -> 7.5s -> 10s -> 15s
    const rawDelay = Math.min(maxIntervalMs, Math.round(baseIntervalMs * Math.pow(1.28, attempts)));
    const delay = isTabHidden() ? Math.min(maxIntervalMs * hiddenMultiplier, rawDelay * hiddenMultiplier) : rawDelay;

    timer = setTimeout(async () => {
      if (stopped) return;
      attempts++;
      try {
        const res = await options.fn(attempts);
        if (stopped) return;
        if (options.onResult) {
          options.onResult(res, attempts);
        }
        if (options.isTerminal && options.isTerminal(res)) {
          stop();
          return;
        }
      } catch (err: any) {
        const status = Number(err?.status || err?.statusCode || 0);
        if (status >= 400 && status < 500 && status !== 429) {
          // Stop immediately on 4xx client errors (except 429 Too Many Requests which retries with backoff)
          stop();
          return;
        }
        if (options.onError && options.onError(err, attempts) === true) {
          stop();
          return;
        }
      }
      scheduleNext();
    }, delay);
  };

  scheduleNext();

  return {
    stop,
    promise,
    get attempts() {
      return attempts;
    },
    get stopped() {
      return stopped;
    }
  };
}

// ============================================================================
// E10: QUERY BUDGET & SLIDING WINDOW BACKGROUND REFETCH GUARD
// ============================================================================
export interface QueryBudgetCheckOptions {
  isManual?: boolean;
  isCritical?: boolean;
}

export interface QueryBudgetCheckResult {
  allowed: boolean;
  updatesLimited: boolean;
  reason?: string;
}

export interface QueryBudgetSnapshot {
  totalRequests: number;
  totalRows: number;
  dedupedRequests: number;
  blockedBackgroundRefetches: number;
  updatesLimited: boolean;
  byTable: Record<
    string,
    {
      requests: number;
      rows: number;
      deduped: number;
      blocked: number;
      windowCount: number;
    }
  >;
}

class QueryBudgetManager {
  private windowMs = 60_000;
  private maxPerTablePerWindow = 12;
  private maxGlobalPerWindow = 60;

  private tableTimestamps = new Map<string, number[]>();
  private globalTimestamps: number[] = [];

  private totalRequests = 0;
  private totalRows = 0;
  private dedupedRequests = 0;
  private blockedBackgroundRefetches = 0;
  private updatesLimited = false;

  private tableMetrics = new Map<
    string,
    { requests: number; rows: number; deduped: number; blocked: number }
  >();

  private pruneTimestamps(list: number[], now: number): number[] {
    const cutoff = now - this.windowMs;
    let idx = 0;
    while (idx < list.length && list[idx] < cutoff) {
      idx++;
    }
    return idx > 0 ? list.slice(idx) : list;
  }

  private ensureTableMetric(table: string) {
    let m = this.tableMetrics.get(table);
    if (!m) {
      m = { requests: 0, rows: 0, deduped: 0, blocked: 0 };
      this.tableMetrics.set(table, m);
    }
    return m;
  }

  public check(table: string, options?: QueryBudgetCheckOptions): QueryBudgetCheckResult {
    const cleanTable = String(table || 'unknown').trim();
    const isManual = Boolean(options?.isManual);
    const isCritical = Boolean(options?.isCritical);

    // Manual user actions and critical checkout/approval flows are NEVER blocked
    if (isManual || isCritical) {
      return { allowed: true, updatesLimited: this.updatesLimited };
    }

    const now = Date.now();
    this.globalTimestamps = this.pruneTimestamps(this.globalTimestamps, now);
    const tblList = this.pruneTimestamps(this.tableTimestamps.get(cleanTable) || [], now);
    this.tableTimestamps.set(cleanTable, tblList);

    if (
      tblList.length >= this.maxPerTablePerWindow ||
      this.globalTimestamps.length >= this.maxGlobalPerWindow
    ) {
      this.blockedBackgroundRefetches++;
      this.updatesLimited = true;
      const m = this.ensureTableMetric(cleanTable);
      m.blocked++;
      return {
        allowed: false,
        updatesLimited: true,
        reason: `Background refetch budget exceeded for ${cleanTable}`
      };
    }

    tblList.push(now);
    this.globalTimestamps.push(now);
    this.updatesLimited = false;
    return { allowed: true, updatesLimited: false };
  }

  public recordRequest(table: string, rowCount: number = 0): void {
    const cleanTable = String(table || 'unknown').trim();
    this.totalRequests++;
    this.totalRows += Math.max(0, Number(rowCount) || 0);
    const m = this.ensureTableMetric(cleanTable);
    m.requests++;
    m.rows += Math.max(0, Number(rowCount) || 0);
  }

  public recordDeduped(keyOrTable: string): void {
    const table = String(keyOrTable || 'unknown').split(':')[0];
    this.dedupedRequests++;
    const m = this.ensureTableMetric(table);
    m.deduped++;
  }

  public getSnapshot(): QueryBudgetSnapshot {
    const now = Date.now();
    const byTable: QueryBudgetSnapshot['byTable'] = {};
    this.tableMetrics.forEach((m, table) => {
      const wList = this.pruneTimestamps(this.tableTimestamps.get(table) || [], now);
      byTable[table] = {
        ...m,
        windowCount: wList.length
      };
    });

    return {
      totalRequests: this.totalRequests,
      totalRows: this.totalRows,
      dedupedRequests: this.dedupedRequests,
      blockedBackgroundRefetches: this.blockedBackgroundRefetches,
      updatesLimited: this.updatesLimited,
      byTable
    };
  }

  public reset(): void {
    this.tableTimestamps.clear();
    this.globalTimestamps = [];
    this.totalRequests = 0;
    this.totalRows = 0;
    this.dedupedRequests = 0;
    this.blockedBackgroundRefetches = 0;
    this.updatesLimited = false;
    this.tableMetrics.clear();
  }
}

export const queryBudget = new QueryBudgetManager();

if (typeof window !== 'undefined') {
  (window as any).__samaraQueryBudget = () => queryBudget.getSnapshot();
}

// ============================================================================
// C2: CENTRALIZED STAGGERED VISIBILITY REFETCH COORDINATOR
// (Prevents 26 simultaneous focus/visibilitychange burst refetches in Admin/Owner)
// ============================================================================
class VisibilityRefetchCoordinator {
  private callbacks = new Map<string, Set<() => void>>();
  private isListening = false;
  private isFlushing = false;
  private lastGlobalFlushAt = 0;
  private minFlushIntervalMs = 60_000;

  private ensureListeners() {
    if (this.isListening || typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }
    this.isListening = true;

    const handleVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - this.lastGlobalFlushAt < this.minFlushIntervalMs) return;
      this.lastGlobalFlushAt = now;
      this.flushStaggered();
    };

    window.addEventListener('focus', handleVisible);
    document.addEventListener('visibilitychange', handleVisible);
  }

  private flushStaggered() {
    if (this.isFlushing) return;
    this.isFlushing = true;

    const entries = Array.from(this.callbacks.entries());
    let idx = 0;

    const runNext = () => {
      if (idx >= entries.length) {
        this.isFlushing = false;
        return;
      }
      const [, cbSet] = entries[idx++];
      // Only invoke the first representative callback per table; dedupeInflight shares the promise
      const firstCb = cbSet.values().next().value;
      if (typeof firstCb === 'function') {
        try {
          firstCb();
        } catch (e) {}
      }
      setTimeout(runNext, 200);
    };

    runNext();
  }

  public register(table: string, callback: () => void): () => void {
    this.ensureListeners();
    if (!this.callbacks.has(table)) {
      this.callbacks.set(table, new Set());
    }
    const set = this.callbacks.get(table)!;
    set.add(callback);

    return () => {
      const current = this.callbacks.get(table);
      if (current) {
        current.delete(callback);
        if (current.size === 0) {
          this.callbacks.delete(table);
        }
      }
    };
  }
}

export const visibilityCoordinator = new VisibilityRefetchCoordinator();

// ============================================================================
// C3: ROLE-SCOPED & PII-SAFE LOCALSTORAGE CACHE HELPER
// ============================================================================
let activeCacheScope = 'public';

export function setCacheRoleScope(roleOrUser?: string | null): void {
  const clean = String(roleOrUser || 'public').trim().toLowerCase();
  const nextScope = clean || 'public';
  if (activeCacheScope !== nextScope) {
    activeCacheScope = nextScope;
    if (nextScope === 'public') {
      clearSensitiveLocalCache();
    }
  }
}

export function getScopedCacheKey(tableName: string): string {
  const clean = String(tableName || '').trim().toLowerCase();
  if (PII_SENSITIVE_CACHE_TABLES.has(clean)) {
    return `samara_cache_${activeCacheScope}_${clean}`;
  }
  return `samara_cache_${clean}`;
}

export function clearSensitiveLocalCache(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith('samara_cache_')) continue;
      for (const piiTbl of PII_SENSITIVE_CACHE_TABLES) {
        if (key === `samara_cache_${piiTbl}` || key.endsWith(`_${piiTbl}`)) {
          keysToRemove.push(key);
          break;
        }
      }
    }
    keysToRemove.forEach((k) => window.localStorage.removeItem(k));
  } catch (e) {}
}
