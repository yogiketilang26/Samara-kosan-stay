import { useEffect, useState, useRef } from 'react';
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

  const loadData = async (isSilent = false) => {
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
  };

  useEffect(() => {
    // Initial fetch
    loadData();

    const handleRealtimeEvent = (payload: any) => {
      console.log(`[useRealtimeTable Event] Received differential update for ${tableName}:`, payload);
      
      // Relational tables with joined data must do a full refetch to resolve nested relationships accurately
      if (['properties', 'rooms', 'settings', 'facilities'].includes(tableName.toLowerCase())) {
        loadData(true);
        return;
      }
      
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
  }, [tableName, dependencyTrigger]);

  return { data, loading, error, refetch: loadData };
}

export default useRealtimeTable;
