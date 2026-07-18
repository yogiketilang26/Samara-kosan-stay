import React from 'react';
import { Room } from '../../types';
import { formatRupiah } from '../../utils/formatCurrency';
import * as LucideIcons from 'lucide-react';

interface PremiumRoomCardProps {
  room: Room;
  onSelect: (room: Room) => void;
}

export const PremiumRoomCard: React.FC<PremiumRoomCardProps> = ({ room, onSelect }) => {
  const isAvailable = room.status === 'available';

  return (
    <div 
      className="bg-white border border-[#E2E8F0] rounded-[24px] p-5 flex flex-col justify-between space-y-5 hover:border-[#0D9488] hover:shadow-xl transition-all duration-300 group overflow-hidden"
      id={`premium-room-card-${room.id}`}
    >
      {/* Visual Top - Room Thumbnail with Badge */}
      <div className="relative h-48 sm:h-52 -mx-5 -mt-5 mb-1 bg-slate-100 overflow-hidden rounded-t-[24px] select-none">
        <img 
          src={room.image_url || "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=600&q=80"} 
          alt={`Kamar ${room.room_number}`}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
        />
        
        {/* Availability Badge */}
        <div className="absolute top-4 left-4">
          <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm ${
            isAvailable 
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
              : room.status === 'occupied' 
                ? 'bg-amber-50 text-amber-700 border border-amber-200' 
                : 'bg-slate-100 text-[#64748B] border border-slate-200'
          }`}>
            {isAvailable ? 'Tersedia' : room.status === 'occupied' ? 'Terisi' : 'Perawatan'}
          </span>
        </div>

        {/* Room Type Badge */}
        <div className="absolute top-4 right-4">
          <span className="bg-[#3A444D]/80 backdrop-blur-md text-white text-[10px] font-semibold px-3 py-1 rounded-full flex items-center gap-1">
            <LucideIcons.Sparkles className="w-3 h-3 text-amber-400" />
            {room.room_type}
          </span>
        </div>

        {/* Daily Option Tag */}
        {room.is_daily_enabled && (
          <div className="absolute bottom-3 left-3">
            <span className="bg-[#0D9488] text-white text-[8px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-md">
              Bisa Harian
            </span>
          </div>
        )}
      </div>

      {/* Main Metadata Section */}
      <div className="space-y-3 flex-1 text-left">
        <div className="flex justify-between items-start gap-2">
          <div>
            <h3 className="text-lg font-bold text-[#3A444D] leading-tight group-hover:text-[#0D9488] transition-colors">
              Kamar {room.room_number}
            </h3>
            <p className="text-xs text-[#64748B] mt-0.5">Tipe: Kamar {room.room_type}</p>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-[#64748B] uppercase font-semibold block">Mulai Dari</span>
            <div className="text-base font-extrabold text-[#0D9488]">
              {formatRupiah(room.price)}
              <span className="text-xs text-[#64748B] font-normal">/bln</span>
            </div>
            {room.is_daily_enabled && room.daily_price && (
              <span className="text-[10px] text-[#64748B] block mt-0.5">
                {formatRupiah(room.daily_price)}<span className="font-normal text-[9px]">/hari</span>
              </span>
            )}
          </div>
        </div>

        {/* Room Details Block */}
        <div className="grid grid-cols-2 gap-3 py-3 border-y border-[#F1F5F9] text-xs text-[#64748B]">
          <div className="flex items-center gap-2">
            <LucideIcons.Layers className="w-4 h-4 text-[#0D9488] opacity-80" />
            <span>Lantai {room.floor}</span>
          </div>
          <div className="flex items-center gap-2">
            <LucideIcons.Maximize className="w-4 h-4 text-[#0D9488] opacity-80" />
            <span>Luas {room.size_sqm} m²</span>
          </div>
        </div>

        {/* Facilities Section */}
        <div className="space-y-1.5 pt-1">
          <span className="text-[10px] font-bold text-[#3A444D] uppercase tracking-wider block">Fasilitas Unit:</span>
          <div className="flex flex-wrap gap-1.5">
            {(room.facilities || []).slice(0, 3).map((f: any, idx) => {
              const IconComp = (LucideIcons as any)[f.icon] || LucideIcons.Sparkles;
              return (
                <div 
                  key={f.id || idx} 
                  className="flex items-center gap-1 bg-[#F8FAFC] border border-[#E2E8F0] px-2.5 py-1 rounded-xl text-xs text-[#64748B] font-medium"
                >
                  <IconComp className="w-3.5 h-3.5 text-[#0D9488]" />
                  <span>{f.name}</span>
                </div>
              );
            })}
            {(room.facilities || []).length > 3 && (
              <div className="bg-[#F8FAFC] border border-[#E2E8F0] px-2 py-1 rounded-xl text-[10px] text-[#0D9488] font-bold">
                +{(room.facilities || []).length - 3} Lagi
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Button Action Block */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => onSelect(room)}
          disabled={!isAvailable}
          className={`w-full py-3 rounded-xl font-bold text-xs transition-all duration-300 cursor-pointer text-center ${
            isAvailable
              ? 'bg-[#0D9488] hover:bg-[#115E59] text-white shadow-sm hover:shadow-md'
              : 'bg-[#F1F5F9] text-[#94A3B8] cursor-not-allowed border border-[#E2E8F0]'
          }`}
        >
          {isAvailable ? 'Pesan Kamar Sekarang' : 'Kamar Tidak Tersedia'}
        </button>
      </div>
    </div>
  );
};

export default PremiumRoomCard;
