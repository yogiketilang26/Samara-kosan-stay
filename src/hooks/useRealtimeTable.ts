import { useEffect, useState, useRef, useCallback } from 'react';
import { realtimeManager } from '../lib/supabase';

export function useRealtimeTable<T>(
  tableName: string, 
  fetchFn: () => Promise<T[]>, 
  dependencyTrigger: number = 0
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  
  // Keep the latest fetch function in a ref to avoid stale closure issues in callbacks
  const fetchFnRef = useRef(fetchFn);
  useEffect(() => {
    fetchFnRef.current = fetchFn;
  }, [fetchFn]);

  const isFirstLoadRef = useRef(true);
  const debounceTimerRef = useRef<any>(null);

  const loadData = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent && isFirstLoadRef.current) {
        setLoading(true);
      }
      const res = await fetchFnRef.current();
      setData(res);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      if (!isSilent && isFirstLoadRef.current) {
        setLoading(false);
        isFirstLoadRef.current = false;
      }
    }
  }, []);

  const triggerDebouncedRefetch = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      loadData(true);
    }, 80);
  }, [loadData]);

  useEffect(() => {
    // Initial fetch
    loadData();

    const handleRealtimeEvent = (payload: any) => {
      console.log(`[useRealtimeTable Event] Received differential update for ${tableName}:`, payload);
      
      // Always trigger debounced fresh load to guarantee full consistency with relational queries and sorting
      triggerDebouncedRefetch();
      
      // Also apply optimistic differential patch if raw row is provided
      if (payload && payload.new && payload.eventType === 'UPDATE') {
        setData((currentData) =>
          currentData.map((item: any) =>
            (item as any)?.id === payload.new.id ? { ...item, ...payload.new } : item
          )
        );
      } else if (payload && payload.old && payload.eventType === 'DELETE') {
        const targetId = payload.old?.id || payload.new?.id;
        if (targetId !== undefined) {
          setData((currentData) =>
            currentData.filter((item: any) => (item as any)?.id !== targetId)
          );
        }
      }
    };

    // Subscribe via central manager to prevent duplicate websocket channels and leak-free lifecycle
    const unsubscribe = realtimeManager.subscribe(tableName, {}, handleRealtimeEvent);

    // Dynamic visibility & focus synchronization: whenever user returns to or focuses this tab
    const handleFocusOrVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        triggerDebouncedRefetch();
      }
    };

    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);

    // Dynamic heartbeat sync (every 6 seconds if document is visible) to guarantee zero-latency drift
    const heartbeatInterval = setInterval(() => {
      if (typeof document !== 'undefined' && !document.hidden) {
        loadData(true);
      }
    }, 6000);

    return () => {
      unsubscribe();
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
      clearInterval(heartbeatInterval);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [tableName, dependencyTrigger, loadData, triggerDebouncedRefetch]);

  return { data, loading, error, refetch: loadData };
}

export default useRealtimeTable;
