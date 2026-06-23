import React from 'react';

interface BadgeProps {
  label: string;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'slate';
}

export const Badge: React.FC<BadgeProps> = ({ label, variant = 'slate' }) => {
  const styles = {
    success: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    danger: 'bg-red-500/10 text-red-400 border border-red-500/20',
    info: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
    slate: 'bg-slate-850 text-slate-300 border border-slate-750'
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase font-mono tracking-wider ${styles[variant]}`}>
      {label}
    </span>
  );
};

export default Badge;
