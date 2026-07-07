import React, { useState } from 'react';
import { Room } from '../../types';
import PremiumRoomCard from './PremiumRoomCard';
import { LayoutGrid, HelpCircle, AlertCircle, Compass } from 'lucide-react';

interface PremiumRoomGridProps {
  rooms: Room[];
  onSelectRoom: (room: Room) => void;
  title?: string;
  subtitle?: string;
}

export const PremiumRoomGrid: React.FC<PremiumRoomGridProps> = ({ 
  rooms, 
  onSelectRoom,
  title = "Pilihan Kamar Eksklusif",
  subtitle = "Temukan kamar kos impian Anda dengan fasilitas terlengkap dan jaminan kenyamanan tingkat tinggi."
}) => {
  const [filterType, setFilterType] = useState<'all' | 'Standard' | 'Deluxe' | 'Premium'>('all');

  const filteredRooms = filterType === 'all' 
    ? rooms 
    : rooms.filter(room => room.room_type === filterType);

  return (
    <div className="bg-[#F8FAFC] py-12 px-4 sm:px-6 lg:px-8 rounded-[32px] space-y-10" id="premium-room-grid-section">
      {/* Premium Header Block */}
      <div className="max-w-3xl mx-auto text-center space-y-3">
        <span className="text-xs font-bold text-[#0D9488] tracking-[0.25em] uppercase font-mono bg-[#E6F4F1] px-4 py-1.5 rounded-full inline-block">
          REKOMENDASI KAMAR
        </span>
        <h2 className="text-2xl sm:text-3.5xl font-extrabold text-[#3A444D] tracking-tight leading-tight">
          {title}
        </h2>
        <p className="text-sm text-[#64748B] max-w-xl mx-auto font-normal leading-relaxed">
          {subtitle}
        </p>
      </div>

      {/* Quick Category Tab Filter Bar */}
      <div className="flex flex-wrap justify-center gap-2 max-w-md mx-auto">
        {(['all', 'Standard', 'Deluxe', 'Premium'] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setFilterType(type)}
            className={`px-4 py-2 rounded-full text-xs font-bold transition-all duration-300 cursor-pointer ${
              filterType === type
                ? 'bg-[#0D9488] text-white shadow-sm'
                : 'bg-white border border-[#E2E8F0] text-[#3A444D] hover:border-[#0D9488] hover:text-[#0D9488]'
            }`}
          >
            {type === 'all' ? 'Semua Kamar' : `${type} Class`}
          </button>
        ))}
      </div>

      {/* Responsive Grid Section */}
      {filteredRooms.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto pt-4">
          {filteredRooms.map((room) => (
            <PremiumRoomCard 
              key={room.id}
              room={room}
              onSelect={onSelectRoom}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-[24px] p-12 text-center max-w-md mx-auto shadow-sm space-y-4">
          <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6 text-amber-500" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-[#3A444D]">Kamar Tidak Ditemukan</h4>
            <p className="text-xs text-[#64748B]">Kamar untuk kelas "{filterType}" saat ini sedang penuh atau belum tersedia di cabang ini.</p>
          </div>
        </div>
      )}

      {/* Extra Service Standards Disclaimer */}
      <div className="max-w-4xl mx-auto border border-[#E2E8F0] bg-white rounded-[24px] p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm text-left">
        <div className="flex gap-3.5 items-start">
          <div className="w-10 h-10 bg-[#E6F4F1] text-[#0D9488] rounded-xl flex items-center justify-center shrink-0 mt-0.5">
            <Compass className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-[#3A444D]">Butuh bantuan menentukan kamar?</h4>
            <p className="text-xs text-[#64748B]">Tim representative kami siap mendampingi Anda untuk virtual tour ataupun survey langsung di lokasi.</p>
          </div>
        </div>
        <a 
          href="https://wa.me/628123456789" 
          target="_blank" 
          rel="noopener noreferrer" 
          className="inline-flex items-center justify-center px-5 py-2.5 bg-[#0D9488] hover:bg-[#115E59] text-white font-bold text-xs rounded-xl shadow-sm transition-colors shrink-0"
        >
          Hubungi Konsultan Kami
        </a>
      </div>
    </div>
  );
};

export default PremiumRoomGrid;
