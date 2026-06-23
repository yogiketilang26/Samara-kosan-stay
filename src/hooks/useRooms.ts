import { useRealtimeTable } from './useRealtimeTable';
import { roomService } from '../services/roomService';
import { Room } from '../types';

export function useRooms(trigger: number = 0) {
  const { data: rooms, loading, error, refetch } = useRealtimeTable<Room>(
    'rooms',
    () => roomService.getAll(),
    trigger
  );

  return { rooms, loading, error, refetch };
}
export default useRooms;
