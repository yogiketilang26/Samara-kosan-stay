import { database } from '../lib/supabase';
import { Coupon } from '../types';

export const couponService = {
  async getAll(): Promise<Coupon[]> {
    return database.fetchCoupons();
  },
  
  async save(coupon: Partial<Coupon>): Promise<Coupon> {
    return database.saveCoupon(coupon);
  },
  
  async delete(id: number): Promise<boolean> {
    return database.deleteCoupon(id);
  },
  
  async validate(code: string): Promise<Coupon | null> {
    const coupons = await database.fetchCoupons();
    const match = coupons.find(c => c.code.toUpperCase() === code.toUpperCase() && c.is_active);
    return match || null;
  }
};
