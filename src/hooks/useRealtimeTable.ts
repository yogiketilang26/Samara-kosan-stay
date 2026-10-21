import { useEffect, useState, useRef, useCallback } from 'react';
import { realtimeManager, isQuotaRestrictionActive } from '../lib/supabase';
import { queryBudget, visibilityCoordinator } from '../lib/queryBudget';
import { normalizeCoordinatePair } from '../utils/mapCoordinates';

export interface UseRealtimeTableOptions {
  enabled?: boolean;
  hasRelations?: boolean;
  debounceMs?: number;
  columns?: string | readonly string[];
  limit?: number;
  isCritical?: boolean;
}

// Tables that fetch nested relations (e.g. room_facilities, property_facilities) where raw realtime row doesn't have expanded fields
const DEFAULT_RELATIONAL_TABLES = new Set(['rooms', 'properties']);

// Core lifecycle session used by useRealtimeTable (also directly testable in Node unit tests for G8)
export function attachRealtimeTableSession<T>(params: {
  tableName: string;
  hasRelations?: boolean;
  debounceMs?: number;
  onPatch?: (updater: (currentData: T[]) => T[]) => void;
  onRefetch: () => void | Promise<void>;
  onVisibilityStale?: () => void;
}) {
  const {
    tableName,
    hasRelations = DEFAULT_RELATIONAL_TABLES.has(tableName),
    debounceMs = 2000,
    onPatch,
    onRefetch,
    onVisibilityStale
  } = params;

  let debounceTimer: any = null;

  const triggerDebounced = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      onRefetch();
    }, debounceMs);
  };

  const handleRealtimeEvent = (payload: any) => {
    if (onPatch) {
      if (payload && payload.new && payload.eventType === 'INSERT') {
        const newItem = { ...payload.new };
        onPatch((currentData) => {
          if (newItem.id !== undefined && currentData.some((item: any) => String(item?.id) === String(newItem.id))) {
            return currentData.map((item: any) => String(item?.id) === String(newItem.id) ? { ...item, ...newItem } : item);
          }
          return [newItem, ...currentData];
        });
      } else if (payload && payload.new && payload.eventType === 'UPDATE') {
        let updatedItem = { ...payload.new };
        if (tableName === 'properties' && (updatedItem.lat !== undefined || updatedItem.latitude !== undefined)) {
          const norm = normalizeCoordinatePair(
            updatedItem.lat ?? updatedItem.latitude,
            updatedItem.lng ?? updatedItem.longitude
          );
          if (norm) {
            updatedItem.lat = norm.lat;
            updatedItem.lng = norm.lng;
          }
        }
        onPatch((currentData) => {
          const exists = currentData.some((item: any) => String(item?.id) === String(payload.new.id));
          if (!exists && payload.new.id !== undefined) {
            return [updatedItem, ...currentData];
          }
          return currentData.map((item: any) =>
            String((item as any)?.id) === String(payload.new.id) ? { ...item, ...updatedItem } : item
          );
        });
      } else if (payload && (payload.old || payload.new) && payload.eventType === 'DELETE') {
        const targetId = payload.old?.id ?? payload.new?.id;
        if (targetId !== undefined) {
          onPatch((currentData) =>
            currentData.filter((item: any) => String((item as any)?.id) !== String(targetId))
          );
        }
      }
    }

    // Only refetch if table has complex nested relations (e.g. rooms with facilities)
    if (hasRelations) {
      triggerDebounced();
    }
  };

  const unsubscribe = realtimeManager.subscribe(tableName, {}, handleRealtimeEvent);
  const unregisterVisibility = visibilityCoordinator.register(tableName, () => {
    if (onVisibilityStale) {
      onVisibilityStale();
    }
  });

  return () => {
    unsubscribe();
    unregisterVisibility();
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  };
}

export function useRealtimeTable<T>(
  tableName: string, 
  fetchFn: () => Promise<T[]>, 
  dependencyTriggerOrOptions: number | UseRealtimeTableOptions = 0
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [updatesLimited, setUpdatesLimited] = useState(false);

  const options: UseRealtimeTableOptions = typeof dependencyTriggerOrOptions === 'object' && dependencyTriggerOrOptions !== null
    ? dependencyTriggerOrOptions
    : {};
  const dependencyTrigger = typeof dependencyTriggerOrOptions === 'number' ? dependencyTriggerOrOptions : 0;
  const enabled = options.enabled !== false;
  const hasRelations = options.hasRelations ?? DEFAULT_RELATIONAL_TABLES.has(tableName);
  const debounceMs = Math.max(2000, options.debounceMs ?? 2000);
  const isCritical = Boolean(options.isCritical);
  
  // Keep the latest fetch function in a ref to avoid stale closure issues in callbacks
  const fetchFnRef = useRef(fetchFn);
  useEffect(() => {
    fetchFnRef.current = fetchFn;
  }, [fetchFn]);

  const isFirstLoadRef = useRef(true);
  const debounceTimerRef = useRef<any>(null);
  const lastFetchedAt = useRef<number>(0);

  const loadData = useCallback(async (isSilent = false, isManual = false) => {
    if (!enabled) return;

    // E10: Check sliding-window query budget on background silent refetches (never block initial load, manual refetch, or critical flows)
    if (isSilent && !isFirstLoadRef.current && !isManual && !isCritical) {
      const budgetRes = queryBudget.check(tableName, { isManual: false, isCritical: false });
      setUpdatesLimited(budgetRes.updatesLimited);
      if (!budgetRes.allowed) {
        return;
      }
    } else if (isManual || isCritical) {
      queryBudget.check(tableName, { isManual: true, isCritical });
      setUpdatesLimited(false);
    }

    try {
      if (!isSilent && isFirstLoadRef.current) {
        setLoading(true);
      }
      const res = await fetchFnRef.current();
      if (Array.isArray(res)) {
        setData(res);
      }
      lastFetchedAt.current = Date.now();
      setError(null);
    } catch (err: any) {
      console.warn(`[useRealtimeTable:${tableName}] Fetch notice:`, err?.message || err);
      setError(err);
    } finally {
      if (!isSilent && isFirstLoadRef.current) {
        setLoading(false);
        isFirstLoadRef.current = false;
      }
    }
  }, [tableName, enabled, isCritical]);

  const manualRefetch = useCallback(async (isSilent = false) => {
    return loadData(isSilent, true);
  }, [loadData]);

  const triggerDebouncedRefetch = useCallback(() => {
    if (!enabled) return;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      loadData(true, false);
    }, debounceMs);
  }, [loadData, debounceMs, enabled]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    // Initial fetch (counted as critical initial load, never blocked)
    loadData(false, true);

    const detach = attachRealtimeTableSession<T>({
      tableName,
      hasRelations,
      debounceMs,
      onPatch: (updater) => setData(updater),
      onRefetch: () => loadData(true, false),
      onVisibilityStale: () => {
        if (!isQuotaRestrictionActive()) {
          const now = Date.now();
          if (now - lastFetchedAt.current >= 60000) {
            triggerDebouncedRefetch();
          }
        }
      }
    });

    return () => {
      detach();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [tableName, dependencyTrigger, enabled, hasRelations, debounceMs, loadData, triggerDebouncedRefetch]);

  return { data, loading, error, refetch: manualRefetch, updatesLimited };
}

export default useRealtimeTable;

