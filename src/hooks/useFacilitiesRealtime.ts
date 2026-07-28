import { useEffect, useState, useCallback, useRef } from 'react';
import { database, realtimeManager } from '../lib/supabase';
import { Facility } from '../types';
import { useNotification } from '../context/NotificationContext';

export function useFacilitiesRealtime() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<any>(null);

  let notifyToast: ((toast: { title: string; message: string; type: 'info' | 'success' | 'warning' | 'error'; duration?: number }) => void) | null = null;
  try {
    const notify = useNotification();
    notifyToast = notify.addToast;
  } catch {
    notifyToast = null;
  }

  const isFirstLoadRef = useRef(true);

  const fetchFacilities = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent && isFirstLoadRef.current) {
        setLoading(true);
      }
      const data = await database.fetchMasterFacilities();
      setFacilities(data || []);
      setError(null);
    } catch (err) {
      console.error('Error in useFacilitiesRealtime:', err);
      setError(err);
    } finally {
      if (!isSilent && isFirstLoadRef.current) {
        setLoading(false);
        isFirstLoadRef.current = false;
      }
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchFacilities();

    // Subscribe to real-time updates on 'facilities' table in Supabase
    const unsubscribe = realtimeManager.subscribe('facilities', {}, (payload: any) => {
      console.log('[useFacilitiesRealtime] Real-time event received for facilities table:', payload);

      // Automatically refresh the master facility list
      fetchFacilities(true);

      if (payload.eventType === 'POLLING_REFRESH') return;

      const { eventType, new: newRow, old: oldRow } = payload;
      const facilityName = newRow?.name || oldRow?.name || 'Fasilitas';

      if (notifyToast) {
        if (eventType === 'INSERT') {
          notifyToast({
            title: '✨ Master Fasilitas Baru',
            message: `Fasilitas "${facilityName}" telah ditambahkan.`,
            type: 'success',
            duration: 5000,
          });
        } else if (eventType === 'UPDATE') {
          notifyToast({
            title: '🔄 Master Fasilitas Diperbarui',
            message: `Data fasilitas "${facilityName}" telah diperbarui secara real-time.`,
            type: 'info',
            duration: 5000,
          });
        } else if (eventType === 'DELETE') {
          notifyToast({
            title: '🗑️ Fasilitas Dihapus',
            message: `Fasilitas "${facilityName}" telah dihapus dari Master Fasilitas.`,
            type: 'error',
            duration: 5000,
          });
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [fetchFacilities]);

  return {
    facilities,
    loading,
    error,
    refetch: fetchFacilities,
  };
}

export default useFacilitiesRealtime;
