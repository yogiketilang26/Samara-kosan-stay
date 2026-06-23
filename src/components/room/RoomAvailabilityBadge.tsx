import React from 'react';

interface RoomAvailabilityBadgeProps {
  status: 'available' | 'occupied' | 'reserved' | 'maintenance';
}

export const RoomAvailabilityBadge: React.FC<RoomAvailabilityBadgeProps> = ({ status }) => {
  const styles = {
    available: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    occupied: 'bg-red-500/10 text-red-400 border border-red-500/20',
    reserved: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    maintenance: 'bg-slate-700/30 text-slate-400 border border-slate-750'
  };

  const labels = {
    available: 'Tersedia',
    occupied: 'Terisi',
    reserved: 'Dipesan',
    maintenance: 'Perawatan'
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[8px] font-extrabold uppercase font-mono tracking-wider border ${styles[status]}`}>
      {labels[status]}
    </span>
  );
};

export default RoomAvailabilityBadge;
