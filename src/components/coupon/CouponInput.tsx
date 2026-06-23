import React from 'react';
import CouponBadge from './CouponBadge';

interface CouponInputProps {
  value: string;
  onChange: (val: string) => void;
  onApply: () => void;
  error?: string;
  appliedCode?: string;
}

export const CouponInput: React.FC<CouponInputProps> = ({
  value,
  onChange,
  onApply,
  error,
  appliedCode
}) => {
  return (
    <div className="space-y-1.5 font-sans">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="KODE PROMO"
          className="flex-1 bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-205 outline-none font-mono font-bold uppercase text-[10px]"
        />
        <button
          type="button"
          onClick={onApply}
          className="bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-xl border border-slate-750 text-slate-300 font-bold max-h-fit text-[10px] cursor-pointer"
        >
          Pasang
        </button>
      </div>
      {error && <p className="text-[9px] text-red-500 font-mono">{error}</p>}
      {appliedCode && (
        <div className="flex items-center gap-1.5 pt-1">
          <span className="text-[9px] text-slate-400">Promo Aktif:</span>
          <CouponBadge code={appliedCode} />
        </div>
      )}
    </div>
  );
};

export default CouponInput;
