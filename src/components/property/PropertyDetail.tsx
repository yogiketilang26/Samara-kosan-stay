import React from 'react';
import { Property, Room } from '../../types';
import { formatRupiah } from '../../utils/formatCurrency';
import { MapPin, Shield, Map, Wifi, Sparkles, ChevronLeft, Building2 } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import PremiumRoomCard from '../premium/PremiumRoomCard';
import EmptyState from '../common/EmptyState';

interface PropertyDetailProps {
  property: Property;
  rooms: Room[];
  onBack: () => void;
  onSelectRoom: (room: Room) => void;
}

export const PropertyDetail: React.FC<PropertyDetailProps> = ({
  property,
  rooms,
  onBack,
  onSelectRoom
}) => {
  const propertyRooms = rooms.filter(r => r.property_id === property.id && r.status === 'available');

  return (
    <div className="space-y-6 font-sans">
      {/* Back to catalog index button */}
      <button 
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white font-bold cursor-pointer transition-colors px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900/60"
      >
        <ChevronLeft size={14} />
        Kembali ke Seluruh Katalog Kosan
      </button>

      {/* Main product gallery structure */}
      <div className="bg-slate-905 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="relative h-64 md:h-80 bg-slate-950 overflow-hidden flex items-center justify-center">
          {property.image_url ? (
            <img 
              src={property.image_url || null} 
              alt={property.name}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover select-none"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-930 to-slate-950 flex flex-col items-center justify-center text-slate-550 p-4">
              <Building2 className="text-amber-500 mb-2 opacity-50" size={48} />
              <span className="text-xs font-mono uppercase tracking-widest font-extrabold text-slate-400">Gedung Tanpa Gambar Utama</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 to-transparent opacity-85" />
          
          <div className="absolute bottom-6 left-6 right-6 space-y-2">
            <span className="bg-amber-500 text-black text-[9px] font-extrabold uppercase font-mono tracking-widest px-2.5 py-0.5 rounded-full">
              Kosan {property.type}
            </span>
            <h1 className="text-xl md:text-2xl font-black text-white font-display uppercase tracking-tight">{property.name}</h1>
            <p className="text-xs text-slate-300 flex items-center gap-1.5 leading-relaxed">
              <MapPin size={13} className="text-amber-500 shrink-0" />
              {property.address}
            </p>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            <div className="space-y-2 border-b border-slate-850 pb-4">
              <h3 className="text-xs font-bold text-slate-450 uppercase tracking-wider font-mono">Fasilitas Kompleks Kosan</h3>
              <div className="flex flex-wrap gap-2 pt-1 font-medium text-xs">
                {(property.facilities || []).map((f: any, idx) => {
                  const IconComp = (LucideIcons as any)[f.icon] || LucideIcons.Sparkles;
                  return (
                    <span key={f.id || idx} className="bg-slate-900 border border-slate-800 text-slate-200 px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 capitalize font-semibold shadow-sm">
                      <IconComp size={12} className="text-amber-500" />
                      {f.name}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-amber-500" />
                <h3 className="text-xs font-bold text-slate-450 uppercase tracking-wider font-mono">Peta Lokasi & Keamanan</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed font-light">
                Terletak di kawasan premium, tenang, nyaman, dan strategis dekat dengan pusat transportasi publik, kampus, dan kuliner favorit. Dilengkapi pengamanan CCTV 24 jam dengan kovenan pengurus kos terpercaya.
              </p>
              
              <div className="bg-slate-950/50 border border-slate-800 p-4 rounded-2xl flex items-center gap-3">
                <Map size={18} className="text-indigo-400" />
                <div>
                  <h4 className="text-[11px] font-bold text-white uppercase font-mono">Peta Koordinat GPS</h4>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">Latitude: {property.lat} | Longitude: {property.lng}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[#0f0f12] border border-slate-800 p-5 rounded-2xl space-y-4 h-fit">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono border-b border-slate-800 pb-2">Tarif Sewa Kamar</h4>
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-450 font-mono">Mulai Dari</span>
              <div className="text-lg font-black text-amber-500 font-mono">{formatRupiah(property.price)}<span className="text-xs text-slate-500 font-normal font-sans">/bln</span></div>
            </div>
            
            <div className="space-y-2 border-t border-slate-800 pt-3">
              <span className="text-[10px] uppercase font-bold text-slate-450 font-mono flex items-center gap-1.5">
                <Shield size={12} className="text-brand-success" />
                Jaminan Kepatuhan PBJT
              </span>
              <p className="text-[9px] text-slate-400 leading-relaxed font-light">
                Tarif kamar bersifat transparan dan telah diformulasikan untuk penyisihan pajak PBJT (10%) untuk kontribusi daerah kabupaten/kota masing-masing.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Available individual units block */}
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-bold font-display text-slate-100 uppercase tracking-tight">Ketersediaan Unit Di Kosan Ini</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Pilih salah satu unit kamar di bawah ini untuk memulai janji survey (DP Rp 500rb) atau booking sewa langsung.</p>
        </div>

        {propertyRooms.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {propertyRooms.map(room => (
              <PremiumRoomCard 
                key={room.id}
                room={room}
                onSelect={() => onSelectRoom(room)}
              />
            ))}
          </div>
        ) : (
          <EmptyState message="Tidak ada unit kamar berstatus tersedia (available) saat ini di komplek kosan ini." />
        )}
      </div>

    </div>
  );
};

export default PropertyDetail;
