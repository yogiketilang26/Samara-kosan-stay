/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';

export interface TableEgressStat {
  table: string;
  requestCount: number;
  totalBytes: number;
  lastBytes: number;
  avgBytes: number;
  lastRowCount: number;
  lastUpdated: string;
}

export interface EgressMetric {
  id: string;
  table: string;
  bytes: number;
  rowCount: number;
  source: 'supabase' | 'rest-fallback' | 'local-cache' | 'realtime-event';
  timestamp: string;
}

export interface RealtimeListenerStat {
  table: string;
  listenerCount: number;
  receivedEventsCount: number;
  totalEventBytes: number;
  lastEventTime: string | null;
  lastPayloadBytes: number;
}

export interface EgressGuardSnapshot {
  totalBytes: number;
  formattedTotal: string;
  totalRequests: number;
  tableStats: Record<string, TableEgressStat>;
  recentMetrics: EgressMetric[];
  realtimeStats: {
    connectionStatus: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING';
    totalListeners: number;
    activeChannelsCount: number;
    listenersByTable: Record<string, number>;
    totalRealtimeBytes: number;
    formattedRealtimeBytes: string;
    totalRealtimeEvents: number;
    lastEventTime: string | null;
    tableDetails: Record<string, RealtimeListenerStat>;
  };
}

/**
 * Utility to calculate byte size of an object or JSON string using TextEncoder with UTF-8 precision.
 */
export function measureJsonSize(data: any): number {
  if (data === null || data === undefined) return 0;
  try {
    const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(jsonStr).length;
    }
    // Fallback: UTF-8 byte estimate
    return encodeURI(jsonStr).split(/%..|./).length - 1;
  } catch (err) {
    console.warn('[EgressGuard] Failed to measure payload size:', err);
    return 0;
  }
}

/**
 * Format bytes into human-readable string (B, KB, MB, GB).
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const idx = Math.min(i, sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, idx)).toFixed(dm))} ${sizes[idx]}`;
}

/**
 * Inspect whether a payload contains huge data, such as base64 images that should
 * be pushed to Supabase Storage instead of database columns.
 */
export function inspectPayloadForBase64(data: any, thresholdBytes: number = 50 * 1024): { isBloated: boolean; sizeBytes: number; warnings: string[] } {
  const sizeBytes = measureJsonSize(data);
  const warnings: string[] = [];

  if (sizeBytes > thresholdBytes) {
    warnings.push(`Payload size (${formatBytes(sizeBytes)}) melebihi batas anjuran (${formatBytes(thresholdBytes)}).`);
  }

  // Detect base64 data URIs
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  const base64Matches = str.match(/data:image\/[a-zA-Z]+;base64,[A-Za-z0-9+/=]{100,}/g);
  if (base64Matches && base64Matches.length > 0) {
    warnings.push(`Ditemukan ${base64Matches.length} raw base64 image data dalam payload. Simpan file ke Supabase Storage untuk menghemat database egress!`);
  }

  return {
    isBloated: warnings.length > 0,
    sizeBytes,
    warnings
  };
}

class EgressGuard {
  private stats: Map<string, TableEgressStat> = new Map();
  private recentMetrics: EgressMetric[] = [];
  private maxHistory: number = 100;
  private listeners: Set<() => void> = new Set();

  // Active Realtime Listeners & Egress tracking
  private activeListeners: Map<string, number> = new Map();
  private realtimeTableStats: Map<string, RealtimeListenerStat> = new Map();
  private totalRealtimeEvents: number = 0;
  private totalRealtimeBytes: number = 0;
  private lastRealtimeEventTime: string | null = null;
  private realtimeConnectionStatus: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' = 'DISCONNECTED';

  /**
   * Set realtime connection status.
   */
  public setRealtimeStatus(status: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING'): void {
    if (this.realtimeConnectionStatus !== status) {
      this.realtimeConnectionStatus = status;
      this.notify();
    }
  }

  /**
   * Update the count of active listeners registered for a specific table.
   */
  public updateTableListenerCount(table: string, count: number): void {
    if (count <= 0) {
      this.activeListeners.delete(table);
    } else {
      this.activeListeners.set(table, count);
    }
    
    const existing = this.realtimeTableStats.get(table) || {
      table,
      listenerCount: 0,
      receivedEventsCount: 0,
      totalEventBytes: 0,
      lastEventTime: null,
      lastPayloadBytes: 0
    };
    existing.listenerCount = count;
    this.realtimeTableStats.set(table, existing);

    this.notify();
  }

  /**
   * Record a received realtime event payload (e.g. postgres_changes or broadcast)
   */
  public recordRealtimeEvent(table: string, payload: any): number {
    const bytes = measureJsonSize(payload);
    this.totalRealtimeEvents++;
    this.totalRealtimeBytes += bytes;
    const nowTime = new Date().toLocaleTimeString('id-ID');
    this.lastRealtimeEventTime = nowTime;

    const existing = this.realtimeTableStats.get(table) || {
      table,
      listenerCount: this.activeListeners.get(table) || 0,
      receivedEventsCount: 0,
      totalEventBytes: 0,
      lastEventTime: null,
      lastPayloadBytes: 0
    };

    existing.receivedEventsCount += 1;
    existing.totalEventBytes += bytes;
    existing.lastPayloadBytes = bytes;
    existing.lastEventTime = nowTime;
    this.realtimeTableStats.set(table, existing);

    // Also register in metrics history as source 'realtime-event'
    this.recentMetrics.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      table,
      bytes,
      rowCount: 1,
      source: 'realtime-event',
      timestamp: nowTime
    });

    if (this.recentMetrics.length > this.maxHistory) {
      this.recentMetrics.pop();
    }

    this.notify();
    return bytes;
  }

  /**
   * Record egress volume for a specific table query or API response.
   */
  public recordTableEgress(
    table: string,
    sizeBytes: number,
    rowCount: number = 1,
    source: 'supabase' | 'rest-fallback' | 'local-cache' | 'realtime-event' = 'supabase'
  ): void {
    const existing = this.stats.get(table) || {
      table,
      requestCount: 0,
      totalBytes: 0,
      lastBytes: 0,
      avgBytes: 0,
      lastRowCount: 0,
      lastUpdated: new Date().toISOString()
    };

    const newRequestCount = existing.requestCount + 1;
    const newTotalBytes = existing.totalBytes + sizeBytes;

    const updated: TableEgressStat = {
      table,
      requestCount: newRequestCount,
      totalBytes: newTotalBytes,
      lastBytes: sizeBytes,
      avgBytes: Math.round(newTotalBytes / newRequestCount),
      lastRowCount: rowCount,
      lastUpdated: new Date().toLocaleTimeString('id-ID')
    };

    this.stats.set(table, updated);

    // Push into recent activity metrics
    this.recentMetrics.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      table,
      bytes: sizeBytes,
      rowCount,
      source,
      timestamp: new Date().toLocaleTimeString('id-ID')
    });

    if (this.recentMetrics.length > this.maxHistory) {
      this.recentMetrics.pop();
    }

    this.notify();
  }

  /**
   * Automatically measure any object/array payload and record table egress.
   */
  public measureAndRecord(
    table: string,
    data: any,
    source: 'supabase' | 'rest-fallback' | 'local-cache' | 'realtime-event' = 'supabase'
  ): number {
    const bytes = measureJsonSize(data);
    const rowCount = Array.isArray(data) ? data.length : 1;
    this.recordTableEgress(table, bytes, rowCount, source);
    return bytes;
  }

  /**
   * Get an aggregated snapshot of all recorded egress stats.
   */
  public getSnapshot(): EgressGuardSnapshot {
    let totalBytes = 0;
    let totalRequests = 0;
    const tableStats: Record<string, TableEgressStat> = {};

    this.stats.forEach((stat, key) => {
      totalBytes += stat.totalBytes;
      totalRequests += stat.requestCount;
      tableStats[key] = { ...stat };
    });

    const listenersByTable: Record<string, number> = {};
    let totalListeners = 0;
    this.activeListeners.forEach((count, table) => {
      listenersByTable[table] = count;
      totalListeners += count;
    });

    const tableDetails: Record<string, RealtimeListenerStat> = {};
    this.realtimeTableStats.forEach((detail, key) => {
      tableDetails[key] = { ...detail };
    });

    return {
      totalBytes,
      formattedTotal: formatBytes(totalBytes),
      totalRequests,
      tableStats,
      recentMetrics: [...this.recentMetrics],
      realtimeStats: {
        connectionStatus: this.realtimeConnectionStatus,
        totalListeners,
        activeChannelsCount: this.realtimeConnectionStatus === 'CONNECTED' ? 1 : 0,
        listenersByTable,
        totalRealtimeBytes: this.totalRealtimeBytes,
        formattedRealtimeBytes: formatBytes(this.totalRealtimeBytes),
        totalRealtimeEvents: this.totalRealtimeEvents,
        lastEventTime: this.lastRealtimeEventTime,
        tableDetails
      }
    };
  }

  /**
   * Reset all collected statistics.
   */
  public reset(): void {
    this.stats.clear();
    this.recentMetrics = [];
    this.realtimeTableStats.clear();
    this.totalRealtimeEvents = 0;
    this.totalRealtimeBytes = 0;
    this.lastRealtimeEventTime = null;
    this.notify();
  }

  /**
   * Log an organized summary of egress usage to console.
   */
  public logSummary(): void {
    const snapshot = this.getSnapshot();
    console.group(`[EGRESS GUARD SUMMARY] Total Egress: ${snapshot.formattedTotal} across ${snapshot.totalRequests} queries`);
    console.table(
      Object.values(snapshot.tableStats).map((stat) => ({
        Table: stat.table,
        Requests: stat.requestCount,
        'Total Egress': formatBytes(stat.totalBytes),
        'Avg / Req': formatBytes(stat.avgBytes),
        'Last Payload': formatBytes(stat.lastBytes),
        'Last Row Count': stat.lastRowCount,
        'Last Query': stat.lastUpdated
      }))
    );
    console.groupEnd();
  }

  /**
   * Subscribe to stats changes (for React hooks or diagnostic UIs).
   */
  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.warn('[EgressGuard] Listener error:', err);
      }
    });
  }
}

// Export singleton instance
export const egressGuard = new EgressGuard();

/**
 * Diagnostic React hook to observe egress usage in real time.
 */
export function useEgressDiagnostics(autoLogEveryMs: number = 0) {
  const [snapshot, setSnapshot] = useState<EgressGuardSnapshot>(() => egressGuard.getSnapshot());

  useEffect(() => {
    const unsubscribe = egressGuard.subscribe(() => {
      setSnapshot(egressGuard.getSnapshot());
    });

    let timer: any = null;
    if (autoLogEveryMs > 0) {
      timer = setInterval(() => {
        egressGuard.logSummary();
      }, autoLogEveryMs);
    }

    return () => {
      unsubscribe();
      if (timer) clearInterval(timer);
    };
  }, [autoLogEveryMs]);

  const logSummary = useCallback(() => {
    egressGuard.logSummary();
  }, []);

  const resetStats = useCallback(() => {
    egressGuard.reset();
  }, []);

  return {
    ...snapshot,
    logSummary,
    resetStats
  };
}

export default egressGuard;
