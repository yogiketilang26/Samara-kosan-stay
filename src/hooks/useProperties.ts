import { useRealtimeTable } from './useRealtimeTable';
import { propertyService } from '../services/propertyService';
import { Property } from '../types';

export function useProperties(trigger: number = 0) {
  const { data: properties, loading, error, refetch } = useRealtimeTable<Property>(
    'properties',
    () => propertyService.getAll(),
    trigger
  );

  return { properties, loading, error, refetch };
}
export default useProperties;
