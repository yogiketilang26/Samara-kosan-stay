import React from 'react';
import { Property } from '../../types';
import { formatRupiah } from '../../utils/formatCurrency';
import { MapPin, Sparkles, Building2 } from 'lucide-react';

interface PropertyCardProps {
  property: Property;
  onSelect: (prop: Property) => void;
}

export const PropertyCard: React.FC<PropertyCardProps> = ({ property, onSelect }) => {
  return (
    <div 
      className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl hover:-translate-y-1 hover:border-slate-750 transition-all duration-300 flex flex-col cursor-pointer"
      onClick={() => onSelect(property)}
    >
      <div className="relative h-48 bg-slate-950 overflow-hidden flex items-center justify-center">
        {property.image_url ? (
          <img 
            src={property.image_url} 
            alt={property.name}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover select-none transition-transform duration-500 hover:scale-105"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-930 to-slate-950 flex flex-col items-center justify-center text-slate-550 p-4">
            <Building2 className="text-amber-500 mb-2 opacity-60 animate-pulse" size={32} />
            <span className="text-[10px] font-mono uppercase tracking-wider font-extrabold text-slate-400">Gedung Tanpa Gambar</span>
          </div>
        )}
        {property.type && (
          <span className={`absolute top-3 left-3 text-[9px] font-extrabold uppercase font-mono tracking-widest px-2 py-0.5 rounded-full border shadow-sm ${
            property.type === 'putri' 
              ? 'bg-pink-500/10 text-pink-400 border-pink-500/20' 
              : property.type === 'putra' 
                ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' 
                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
          }`}>
            KOS {property.type}
          </span>
        )}
      </div>

      <div className="p-4 flex-1 flex flex-col justify-between space-y-3 font-sans">
        <div>
          <h3 className="text-slate-100 font-bold text-xs font-display tracking-tight hover:text-amber-500 transition-colors uppercase line-clamp-1">{property.name}</h3>
          <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5" title={property.address}>
            <MapPin size={11} className="text-amber-500 shrink-0" />
            <span className="truncate">{property.address}</span>
          </p>
        </div>

        {/* Facilities badge pills */}
        <div className="flex flex-wrap gap-1">
          {property.facilities.slice(0, 3).map((f, idx) => (
            <span key={idx} className="bg-slate-850 text-slate-300 text-[8px] font-semibold px-2 py-0.5 rounded-md border border-slate-750 font-sans">
              {f}
            </span>
          ))}
          {property.facilities.length > 3 && (
            <span className="bg-slate-850 text-slate-400 text-[8px] font-semibold px-1.5 py-0.5 rounded-md border border-slate-750 font-sans">
              +{property.facilities.length - 3}
            </span>
          )}
        </div>

        <div className="border-t border-slate-850 pt-2.5 flex items-center justify-between mt-auto">
          <div className="flex flex-col">
            <span className="text-[8px] font-bold text-slate-400 uppercase font-mono">Tarif Mulai</span>
            <span className="text-[11px] font-extrabold text-amber-500 font-mono mt-0.5">
              {formatRupiah(property.price)}<span className="text-[9px] text-slate-500 font-sans font-normal">/bln</span>
            </span>
          </div>
          
          <span className="text-[9px] text-emerald-400 bg-emerald-500/5 px-2 py-0.5 rounded-full border border-emerald-500/10 font-bold font-mono">
            Tersedia {property.available_rooms} unit
          </span>
        </div>
      </div>
    </div>
  );
};

export default PropertyCard;
