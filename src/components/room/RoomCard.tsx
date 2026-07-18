import React from 'react';
import { Room } from '../../types';
import { formatRupiah } from '../../utils/formatCurrency';
import RoomAvailabilityBadge from './RoomAvailabilityBadge';
import { Layers, Maximize } from 'lucide-react';

interface RoomCardProps {
  room: Room;
  onSelect: () => void;
}

export const RoomCard: React.FC<RoomCardProps> = ({ room, onSelect }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-4 hover:border-slate-700 transition-all shadow-lg font-sans overflow-hidden">
      {room.image_url && (
        <div className="h-40 -mx-4 -mt-4 mb-1 relative overflow-hidden rounded-t-2xl">
          <img 
            src={room.image_url || null} 
            alt={`Kamar ${room.room_number}`}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
          />
        </div>
      )}
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-sm text-white font-display uppercase">Kamar {room.room_number}</span>
            <RoomAvailabilityBadge status={room.status as any} />
          </div>
          <p className="text-[10px] text-slate-400 font-mono mt-0.5 mt-1">Kelas: {room.room_type}</p>
        </div>
        
        {room.is_daily_enabled && (
          <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-md text-[8px] font-extrabold uppercase font-mono tracking-wider">
            BISA HARIAN
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 border-y border-slate-850 py-2 text-[10px] text-slate-400 font-mono">
        <div className="flex items-center gap-1">
          <Layers size={11} className="text-amber-500" />
          <span>Lantai {room.floor}</span>
        </div>
        <div className="flex items-center gap-1">
          <Maximize size={11} className="text-amber-500" />
          <span>Luas {room.size_sqm} m²</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {(room.facilities || []).slice(0, 3).map((f: any, idx) => (
          <span key={f.id || idx} className="bg-slate-850 text-slate-350 text-[9px] px-1.5 py-0.5 rounded border border-slate-750">
            {f.name}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between pt-2">
        <div className="flex flex-col">
          <span className="text-[8px] font-bold text-slate-400 uppercase font-mono">Tarif Sewa</span>
          <span className="text-[11px] font-bold text-white font-mono mt-0.5">{formatRupiah(room.price)}<span className="text-[9px] font-normal text-slate-500 font-sans">/bln</span></span>
          {room.is_daily_enabled && room.daily_price && (
            <span className="text-[9px] text-indigo-400 font-mono mt-0.5">D: {formatRupiah(room.daily_price)}/hari</span>
          )}
        </div>

        <button
          onClick={onSelect}
          disabled={room.status !== 'available'}
          className={`px-3 py-1.5 rounded-xl font-bold uppercase text-[9px] tracking-wider transition-all cursor-pointer ${
            room.status === 'available'
              ? 'bg-amber-500 hover:bg-amber-450 text-black shadow-md'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'
          }`}
        >
          {room.status === 'available' ? 'Pesan Kamar' : 'Tidak Tersedia'}
        </button>
      </div>
    </div>
  );
};

export default RoomCard;
