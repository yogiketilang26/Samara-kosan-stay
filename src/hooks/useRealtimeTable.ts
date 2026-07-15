import { useEffect, useState, useRef } from 'react';
import { realtimeManager, getIsSupabaseConfigured, getSupabaseClient } from '../lib/supabase';

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

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetchFnRef.current();
      setData(res);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial fetch
    loadData();

    const isConfigured = getIsSupabaseConfigured();
    const client = getSupabaseClient();

    if (isConfigured && client) {
      const handleRealtimeEvent = (payload: any) => {
        if (payload.eventType === 'POLLING_REFRESH') {
          console.log(`[useRealtimeTable] Backup polling triggered loadData for ${tableName}`);
          loadData();
          return;
        }

        console.log(`[useRealtimeTable Event] Received differential update for ${tableName}:`, payload);
        
        setData((currentData) => {
          const { eventType, new: newRow, old: oldRow } = payload;
          
          if (eventType === 'INSERT') {
            const exists = currentData.some((item: any) => (item as any).id === newRow.id);
            if (exists) return currentData;
            return [...currentData, newRow];
          }
          
          if (eventType === 'UPDATE') {
            return currentData.map((item: any) => (item as any).id === newRow.id ? { ...item, ...newRow } : item);
          }
          
          if (eventType === 'DELETE') {
            const targetId = oldRow?.id || newRow?.id;
            return currentData.filter((item: any) => (item as any).id !== targetId);
          }
          
          return currentData;
        });
      };

      // Subscribe via central manager to prevent duplicate websocket channels and leak-free lifecycle
      const unsubscribe = realtimeManager.subscribe(tableName, {}, handleRealtimeEvent);

      return () => {
        unsubscribe();
      };
    } else {
      // Offline fallback: if Supabase is completely unavailable, run a local timer
      console.log(`[useRealtimeTable Fallback] Offline/unconfigured. Polling locally for table: ${tableName}`);
      const timer = setInterval(() => {
        loadData();
      }, 15000);
      return () => clearInterval(timer);
    }
  }, [tableName, dependencyTrigger]);

  return { data, loading, error, refetch: loadData };
}

export default useRealtimeTable;
