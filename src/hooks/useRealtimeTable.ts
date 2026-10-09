import { useEffect, useState, useRef, useCallback } from 'react';
import { realtimeManager, isQuotaRestrictionActive } from '../lib/supabase';
import { normalizeCoordinatePair } from '../utils/mapCoordinates';

export interface UseRealtimeTableOptions {
  enabled?: boolean;
  hasRelations?: boolean;
  debounceMs?: number;
}

// Tables that fetch nested relations (e.g. room_facilities, property_facilities) where raw realtime row doesn't have expanded fields
const DEFAULT_RELATIONAL_TABLES = new Set(['rooms', 'properties']);

export function useRealtimeTable<T>(
  tableName: string, 
  fetchFn: () => Promise<T[]>, 
  dependencyTriggerOrOptions: number | UseRealtimeTableOptions = 0
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  const options: UseRealtimeTableOptions = typeof dependencyTriggerOrOptions === 'object' && dependencyTriggerOrOptions !== null
    ? dependencyTriggerOrOptions
    : {};
  const dependencyTrigger = typeof dependencyTriggerOrOptions === 'number' ? dependencyTriggerOrOptions : 0;
  const enabled = options.enabled !== false;
  const hasRelations = options.hasRelations ?? DEFAULT_RELATIONAL_TABLES.has(tableName);
  const debounceMs = Math.max(2000, options.debounceMs ?? 2000);
  
  // Keep the latest fetch function in a ref to avoid stale closure issues in callbacks
  const fetchFnRef = useRef(fetchFn);
  useEffect(() => {
    fetchFnRef.current = fetchFn;
  }, [fetchFn]);

  const isFirstLoadRef = useRef(true);
  const debounceTimerRef = useRef<any>(null);
  const lastFetchedAt = useRef<number>(0);

  const loadData = useCallback(async (isSilent = false) => {
    if (!enabled) return;
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
  }, [tableName, enabled]);

  const triggerDebouncedRefetch = useCallback(() => {
    if (!enabled) return;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      loadData(true);
    }, debounceMs);
  }, [loadData, debounceMs, enabled]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    // Initial fetch
    loadData();

    const handleRealtimeEvent = (payload: any) => {
      // Apply optimistic differential patch first
      if (payload && payload.new && payload.eventType === 'INSERT') {
        const newItem = { ...payload.new };
        setData((currentData) => {
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
        setData((currentData) => {
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
          setData((currentData) =>
            currentData.filter((item: any) => String((item as any)?.id) !== String(targetId))
          );
        }
      }

      // Only refetch if table has complex nested relations (e.g. rooms with facilities)
      // otherwise in-memory patch is completely sufficient!
      if (hasRelations) {
        triggerDebouncedRefetch();
      }
    };

    // Subscribe via central manager to prevent duplicate websocket channels and leak-free lifecycle
    const unsubscribe = realtimeManager.subscribe(tableName, {}, handleRealtimeEvent);

    // Dynamic visibility & focus synchronization: throttled to at most once every 60 seconds
    const handleFocusOrVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        if (!isQuotaRestrictionActive()) {
          const now = Date.now();
          if (now - lastFetchedAt.current >= 60000) {
            triggerDebouncedRefetch();
          }
        }
      }
    };

    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);

    return () => {
      unsubscribe();
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [tableName, dependencyTrigger, enabled, hasRelations, loadData, triggerDebouncedRefetch]);

  return { data, loading, error, refetch: loadData };
}

export default useRealtimeTable;
