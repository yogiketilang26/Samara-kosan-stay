/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { realtimeManager } from './supabase';

export interface ApiMetric {
  id: string;
  endpoint: string;
  method: string;
  type: 'supabase' | 'app-api';
  duration: number;
  status: number;
  timestamp: string;
}

export interface ErrorLog {
  id: string;
  message: string;
  stack?: string;
  timestamp: string;
  url: string;
  userEmail?: string;
}

export interface RenderCount {
  componentName: string;
  count: number;
  lastRendered: string;
}

class ObservabilitySystem {
  private apiMetrics: ApiMetric[] = [];
  private errorLogs: ErrorLog[] = [];
  private renderCounts: Map<string, { count: number; lastRendered: string }> = new Map();
  private maxLogsLimit = 200;
  private listeners: Set<() => void> = new Set();
  
  // Custom user email context
  private currentUserEmail: string = 'yogiketilang33@gmail.com';

  constructor() {
    this.setupGlobalErrorHandler();
    this.setupFetchInterceptor();
  }

  public subscribeToChanges(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notify() {
    this.listeners.forEach((cb) => {
      try { cb(); } catch (e) { console.error('Error notifying observability listener:', e); }
    });
  }

  // Set active user email for error tracking context
  public setUserContext(email: string) {
    this.currentUserEmail = email;
  }

  // --- API MONITORING ---
  private setupFetchInterceptor() {
    if (typeof window === 'undefined') return;

    try {
      const originalFetch = window.fetch;
      if (!originalFetch) return;
      const self = this;

      const interceptedFetch = async function (this: any, input: RequestInfo | URL, init?: RequestInit) {
        const startTime = performance.now();
        const method = init?.method || 'GET';
        const urlString = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : input.url);
        
        let type: 'supabase' | 'app-api' = 'app-api';
        if (urlString.includes('supabase.co') || urlString.includes('/rest/v1')) {
          type = 'supabase';
        }

        // Simplify endpoint name for aggregation
        let endpoint = urlString;
        try {
          const parsedUrl = new URL(urlString, window.location.origin);
          endpoint = parsedUrl.pathname;
          // Keep some query parameter context if it's app API
          if (type === 'app-api' && parsedUrl.search) {
            endpoint = `${parsedUrl.pathname}${parsedUrl.search.slice(0, 30)}`;
          }
        } catch (e) {
          // Fallback
        }

        try {
          const response = await originalFetch.call(this, input, init);
          const duration = Math.round(performance.now() - startTime);
          
          self.recordApiMetric({
            id: `api-${Math.random().toString(36).slice(2, 9)}`,
            endpoint,
            method,
            type,
            duration,
            status: response.status,
            timestamp: new Date().toISOString(),
          });

          return response;
        } catch (error: any) {
          const duration = Math.round(performance.now() - startTime);
          self.recordApiMetric({
            id: `api-${Math.random().toString(36).slice(2, 9)}`,
            endpoint,
            method,
            type,
            duration,
            status: 0, // 0 indicates network failure / crashed fetch
            timestamp: new Date().toISOString(),
          });

          // Log this fetch error too
          self.recordError({
            message: `Fetch failed to ${method} ${endpoint}: ${error?.message || error}`,
            stack: error?.stack,
            url: window.location.href,
          });

          throw error;
        }
      };

      try {
        Object.defineProperty(window, 'fetch', {
          value: interceptedFetch,
          writable: true,
          configurable: true,
          enumerable: true
        });
      } catch (defineError) {
        try {
          // Fallback to standard property assignment if defineProperty fails or is restricted
          (window as any).fetch = interceptedFetch;
        } catch (assignError) {
          console.warn('[OBSERVABILITY] Unable to override window.fetch due to strict environment constraints:', assignError);
        }
      }
    } catch (err) {
      console.warn('[OBSERVABILITY] Failed to initialize fetch interceptor wrapper:', err);
    }
  }

  private recordApiMetric(metric: ApiMetric) {
    this.apiMetrics.unshift(metric);
    if (this.apiMetrics.length > this.maxLogsLimit) {
      this.apiMetrics.pop();
    }
    this.notify();
  }

  public getApiMetrics(): ApiMetric[] {
    return this.apiMetrics;
  }

  public getApiStats() {
    if (this.apiMetrics.length === 0) {
      return {
        totalRequests: 0,
        averageLatency: 0,
        errorRate: 0,
        byEndpoint: {},
        byType: { supabase: 0, 'app-api': 0 }
      };
    }

    const totalRequests = this.apiMetrics.length;
    const totalDuration = this.apiMetrics.reduce((sum, m) => sum + m.duration, 0);
    const failedRequests = this.apiMetrics.filter((m) => m.status === 0 || m.status >= 400).length;
    
    const byEndpoint: Record<string, { count: number; totalDuration: number; errors: number }> = {};
    const byType = { supabase: 0, 'app-api': 0 };

    this.apiMetrics.forEach((m) => {
      byType[m.type] = (byType[m.type] || 0) + 1;
      
      if (!byEndpoint[m.endpoint]) {
        byEndpoint[m.endpoint] = { count: 0, totalDuration: 0, errors: 0 };
      }
      const entry = byEndpoint[m.endpoint];
      entry.count++;
      entry.totalDuration += m.duration;
      if (m.status === 0 || m.status >= 400) {
        entry.errors++;
      }
    });

    const endpointStats = Object.entries(byEndpoint).map(([endpoint, data]) => ({
      endpoint,
      count: data.count,
      averageDuration: Math.round(data.totalDuration / data.count),
      errorRate: Math.round((data.errors / data.count) * 100),
    })).sort((a, b) => b.count - a.count);

    return {
      totalRequests,
      averageLatency: Math.round(totalDuration / totalRequests),
      errorRate: Math.round((failedRequests / totalRequests) * 100),
      byType,
      endpointStats: endpointStats.slice(0, 10), // Top 10 endpoints
    };
  }

  // --- ERROR TRACKING ---
  private setupGlobalErrorHandler() {
    if (typeof window === 'undefined') return;

    window.addEventListener('error', (event) => {
      this.recordError({
        message: event.message || 'Uncaught error',
        stack: event.error?.stack,
        url: window.location.href,
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      this.recordError({
        message: `Unhandled promise rejection: ${reason?.message || reason}`,
        stack: reason?.stack,
        url: window.location.href,
      });
    });
  }

  public recordError(err: Omit<ErrorLog, 'id' | 'timestamp' | 'userEmail'>) {
    const errorLog: ErrorLog = {
      id: `err-${Math.random().toString(36).slice(2, 9)}`,
      ...err,
      timestamp: new Date().toISOString(),
      userEmail: this.currentUserEmail,
    };
    
    this.errorLogs.unshift(errorLog);
    if (this.errorLogs.length > this.maxLogsLimit) {
      this.errorLogs.pop();
    }
    this.notify();
  }

  public getErrorLogs(): ErrorLog[] {
    return this.errorLogs;
  }

  // --- REACT RENDERS TRACKING ---
  public trackRender(componentName: string) {
    const current = this.renderCounts.get(componentName) || { count: 0, lastRendered: '' };
    this.renderCounts.set(componentName, {
      count: current.count + 1,
      lastRendered: new Date().toLocaleTimeString(),
    });
    
    // We notify on render tracking but throttle it a bit to avoid paint storm loops
    this.notify();
  }

  public getRenderCounts(): RenderCount[] {
    return Array.from(this.renderCounts.entries()).map(([componentName, val]) => ({
      componentName,
      count: val.count,
      lastRendered: val.lastRendered,
    })).sort((a, b) => b.count - a.count);
  }

  // --- PERFORMANCE MONITORING (LATENCY, MEMORY) ---
  public getPerformanceMetrics() {
    if (typeof window === 'undefined') return null;

    let memoryInfo = null;
    if ((performance as any).memory) {
      const mem = (performance as any).memory;
      memoryInfo = {
        usedJSHeapSize: Math.round(mem.usedJSHeapSize / 1024 / 1024), // MB
        totalJSHeapSize: Math.round(mem.totalJSHeapSize / 1024 / 1024), // MB
        jsHeapSizeLimit: Math.round(mem.jsHeapSizeLimit / 1024 / 1024), // MB
      };
    }

    // Measure page load performance if available
    let loadTime = 0;
    try {
      const [navigation] = performance.getEntriesByType('navigation') as any[];
      if (navigation) {
        loadTime = Math.round(navigation.duration);
      }
    } catch (e) {
      // Fallback
    }

    return {
      memory: memoryInfo,
      loadTime,
      screenResolution: `${window.innerWidth}x${window.innerHeight}`,
      userAgent: navigator.userAgent,
    };
  }

  // --- REALTIME HEALTH MONITOR ---
  public getRealtimeHealth() {
    const stats = (realtimeManager as any).getStatus?.() || {
      connectionStatus: 'DISCONNECTED',
      listenersCount: [],
      lastEventTime: null,
      history: [],
      recentEvents: [],
    };

    return {
      connectionStatus: stats.connectionStatus,
      activeChannelsCount: stats.connectionStatus === 'CONNECTED' ? 1 : 0, // We use a single global channel design
      tableListeners: stats.listenersCount,
      lastEventTime: stats.lastEventTime,
      history: stats.history,
      recentEvents: stats.recentEvents,
      totalListenersCount: stats.listenersCount.reduce((sum: number, l: any) => sum + l.count, 0),
    };
  }
}

export const observability = new ObservabilitySystem();

// Simple React Hook for render tracking
export function useRenderCounter(componentName: string) {
  observability.trackRender(componentName);
}
