import { useRealtimeTable } from './useRealtimeTable';
import { couponService } from '../services/couponService';
import { Coupon } from '../types';

export function useCoupons(trigger: number = 0) {
  const { data: coupons, loading, error, refetch } = useRealtimeTable<Coupon>(
    'coupons',
    () => couponService.getAll(),
    trigger
  );

  return { coupons, loading, error, refetch };
}
export default useCoupons;
