import { useRealtimeTable } from './useRealtimeTable';
import { transactionService } from '../services/transactionService';
import { Booking, Survey } from '../types';

export function useTransactions(trigger: number = 0) {
  const { data: bookings, loading: bookingsLoading, refetch: refetchBookings } = useRealtimeTable<Booking>(
    'bookings',
    () => transactionService.getAllBookings(),
    trigger
  );

  const { data: surveys, loading: surveysLoading, refetch: refetchSurveys } = useRealtimeTable<Survey>(
    'surveys',
    () => transactionService.getAllSurveys(),
    trigger
  );

  const refetchAll = () => {
    refetchBookings();
    refetchSurveys();
  };

  return { 
    bookings, 
    surveys, 
    loading: bookingsLoading || surveysLoading, 
    refetch: refetchAll 
  };
}
export default useTransactions;
