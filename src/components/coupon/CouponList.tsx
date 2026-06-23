import React from 'react';
import { Coupon } from '../../types';
import { formatRupiah } from '../../utils/formatCurrency';
import CouponBadge from './CouponBadge';

interface CouponListProps {
  coupons: Coupon[];
  onSelectCoupon?: (coupon: Coupon) => void;
}

export const CouponList: React.FC<CouponListProps> = ({ coupons, onSelectCoupon }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {coupons.map(c => (
        <div 
          key={c.id} 
          className={`bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-3 ${
            c.is_active ? 'hover:border-slate-700' : 'opacity-50'
          }`}
        >
          <div className="flex justify-between items-start">
            <CouponBadge code={c.code} />
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
              c.is_active 
                ? 'bg-emerald-500/10 text-emerald-450 border-emerald-500/20' 
                : 'bg-slate-800 text-slate-500 border-slate-750'
            }`}>
              {c.is_active ? 'AKTIF' : 'NON-AKTIF'}
            </span>
          </div>

          <div className="space-y-1 font-sans">
            <h5 className="font-bold text-[11px] text-white uppercase">{c.description}</h5>
            <p className="text-[10px] text-slate-400 font-mono">
              Potongan: {c.discount_type === 'percentage' ? `${c.discount_value}%` : formatRupiah(c.discount_value)}
              {c.max_discount_amount && ` (Max: ${formatRupiah(c.max_discount_amount)})`}
            </p>
          </div>

          {onSelectCoupon && c.is_active && (
            <button
              onClick={() => onSelectCoupon(c)}
              className="w-full py-1.5 bg-slate-850 hover:bg-slate-800 text-slate-200 border border-slate-750 rounded-xl font-bold uppercase text-[9px] cursor-pointer"
            >
              Gunakan Kupon Promo
            </button>
          )}

        </div>
      ))}
    </div>
  );
};

export default CouponList;
