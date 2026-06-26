import { useEffect, useState } from 'react';
import { getSupabaseClient, getIsSupabaseConfigured } from '../lib/supabase';

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

    const isConfigured = getIsSupabaseConfigured();
    const client = getSupabaseClient();

    if (isConfigured && client) {
      console.log(`[REALTIME] Subscribing to channel for table: ${tableName}`);
      const channel = client
        .channel(`public:${tableName}-changes`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: tableName },
          (payload) => {
            console.log(`[REALTIME EVENT] Received update for ${tableName}:`, payload);
            loadData();
          }
        )
        .subscribe((status) => {
          console.log(`[REALTIME STATUS] Subscription status for ${tableName}:`, status);
        });

      return () => {
        client.removeChannel(channel);
      };
    } else {
      console.log(`[REALTIME FALLBACK] Supabase not active. Polling every 10 seconds for table: ${tableName}`);
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
