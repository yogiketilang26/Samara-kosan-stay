import React from 'react';
import { Property } from '../../types';
import PropertyCard from './PropertyCard';
import { EmptyState } from '../common/EmptyState';

interface PropertyListProps {
  properties: Property[];
  onSelectProperty: (prop: Property) => void;
  selectedType: string;
  setSelectedType: (type: any) => void;
  priceRange: number;
  setPriceRange: (price: number) => void;
}

export const PropertyList: React.FC<PropertyListProps> = ({
  properties,
  onSelectProperty,
  selectedType,
  setSelectedType,
  priceRange,
  setPriceRange
}) => {
  const filtered = properties.filter(p => {
    const matchType = selectedType === 'all' || p.type === selectedType;
    const matchPrice = p.price <= priceRange;
    return matchType && matchPrice;
  });

  return (
    <div className="space-y-6">
      {/* Dynamic filter panel tools */}
      <div className="bg-[#0f0f12] p-5 rounded-3xl border border-slate-800 shadow-xl flex flex-col md:flex-row gap-4 justify-between items-center text-xs font-sans">
        {/* Gender category badges */}
        <div className="flex bg-slate-900 border border-slate-750 p-1 rounded-2xl w-full md:w-auto">
          {['all', 'putra', 'putri', 'campur'].map((t) => (
            <button
              key={t}
              onClick={() => setSelectedType(t)}
              className={`flex-1 md:flex-none px-4 py-1.5 rounded-xl font-bold uppercase text-[9px] tracking-wider cursor-pointer transition-all ${
                selectedType === t 
                  ? 'bg-amber-500 text-black shadow-md' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              KOS {t}
            </button>
          ))}
        </div>

        {/* Budget pricing sliders */}
        <div className="w-full md:w-72 space-y-2 font-mono">
          <div className="flex justify-between items-center text-[10px] text-slate-450 uppercase font-bold tracking-wider">
            <span>Filter Anggaran Maksimal</span>
            <span className="text-amber-500 font-extrabold text-[11px]">
              Rp {new Intl.NumberFormat('id-ID').format(priceRange)}
            </span>
          </div>
          <input 
            type="range"
            min={1000000}
            max={properties.length > 0 ? Math.max(20000000, ...properties.map(p => p.price)) : 20000000}
            step={100000}
            value={priceRange}
            onChange={(e) => setPriceRange(Number(e.target.value))}
            className="w-full select-none accent-amber-500 bg-slate-800 h-1 rounded-lg cursor-pointer"
          />
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(p => (
            <PropertyCard 
              key={p.id} 
              property={p} 
              onSelect={onSelectProperty} 
            />
          ))}
        </div>
      ) : (
        <EmptyState message="Maaf, tidak ada kosan yang sesuai dengan filter pencarian atau budget anggaran Anda." />
      )}
    </div>
  );
};

export default PropertyList;
