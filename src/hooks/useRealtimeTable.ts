import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export function useRealtimeTable<T>(
  tableName: string, 
  fetchFn: () => Promise<T[]>, 
  dependencyTrigger: number = 0
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetchFn();
      setData(res);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    if (isSupabaseConfigured && supabase) {
      const channel = supabase
        .channel(`public:${tableName}-changes`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: tableName },
          () => {
            loadData();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } else {
      // Fallback: poll every 10 seconds in design sandbox to simulate real-time feed updates
      const timer = setInterval(() => {
        loadData();
      }, 10000);
      return () => clearInterval(timer);
    }
  }, [tableName, dependencyTrigger]);

  return { data, loading, error, refetch: loadData };
}
export default useRealtimeTable;
