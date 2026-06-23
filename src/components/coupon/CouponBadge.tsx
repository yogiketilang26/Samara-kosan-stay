import React from 'react';
import { Tag } from 'lucide-react';

interface CouponBadgeProps {
  code: string;
}

export const CouponBadge: React.FC<CouponBadgeProps> = ({ code }) => {
  return (
    <span className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-500 border border-amber-500/30 px-2 py-0.5 rounded-md text-[9px] font-extrabold font-mono uppercase tracking-wider">
      <Tag size={10} className="shrink-0" />
      {code}
    </span>
  );
};

export default CouponBadge;
