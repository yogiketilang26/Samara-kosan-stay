import React from 'react';
import * as LucideIcons from 'lucide-react';
import { 
  Search, SlidersHorizontal, Info, CheckCircle2, DollarSign, Filter, Layers
} from 'lucide-react';
import { StandardFacility } from '../../types';

interface PremiumSearchFilterProps {
  searchLocation: string;
  setSearchLocation: (val: string) => void;
  selectedType: 'all' | 'putra' | 'putri' | 'campur';
  setSelectedType: (val: 'all' | 'putra' | 'putri' | 'campur') => void;
  searchDurationType: 'monthly' | 'daily';
  setSearchDurationType: (val: 'monthly' | 'daily') => void;
  searchMode: 'building' | 'room';
  setSearchMode: (val: 'building' | 'room') => void;
  selectedFacilities: string[];
  setSelectedFacilities: (facilities: string[]) => void;
  masterFacilities: StandardFacility[];
  priceRange: number;
  setPriceRange: (val: number) => void;
  onlyAvailable: boolean;
  setOnlyAvailable: (val: boolean) => void;
  onClearFilters?: () => void;
  resultsCount: number;
}

const renderFacilityIcon = (iconName: string) => {
  const IconComponent = (LucideIcons as any)[iconName];
  if (IconComponent) {
    return <IconComponent size={14} />;
  }
  return <LucideIcons.Info size={14} />;
};

export const PremiumSearchFilter: React.FC<PremiumSearchFilterProps> = ({
  searchLocation,
  setSearchLocation,
  selectedType,
  setSelectedType,
  searchDurationType,
  setSearchDurationType,
  searchMode,
  setSearchMode,
  selectedFacilities,
  setSelectedFacilities,
  masterFacilities,
  priceRange,
  setPriceRange,
  onlyAvailable,
  setOnlyAvailable,
  onClearFilters,
  resultsCount
}) => {
  return (
    <div 
      className="bg-white border border-[#E2E8F0] rounded-[32px] p-6 md:p-8 space-y-6 shadow-md text-left" 
      id="premium-search-filter-card"
    >
      {/* Header Info */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <span className="text-[10px] font-bold text-[#2E6F40] tracking-[0.2em] uppercase font-mono bg-[#EEF7F0] px-3 py-1 rounded-full inline-flex items-center gap-1.5">
            <Filter size={11} /> Filter & Pencarian Real-Time
          </span>
          <h2 className="text-xl sm:text-2xl font-extrabold text-[#3A444D] tracking-tight">
            Cari Hunian Samara Stay
          </h2>
          <p className="text-xs text-[#64748B]">
            Menampilkan <strong className="text-[#3A444D] font-bold">{resultsCount}</strong> {searchMode === 'building' ? 'gedung kos' : 'kamar'} yang sesuai filter secara real-time.
          </p>
        </div>

        {/* Search Mode Toggle (Gedung vs Kamar) */}
        <div className="flex bg-[#F8FAFC] border border-[#E2E8F0] p-1 rounded-2xl text-xs font-bold w-full md:w-auto">
          <button
            type="button"
            onClick={() => setSearchMode('building')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-xl uppercase tracking-tight transition-all duration-300 cursor-pointer flex items-center justify-center gap-1.5 ${
              searchMode === 'building' 
                ? 'bg-[#2E6F40] text-white shadow-sm' 
                : 'text-[#64748B] hover:text-[#2E6F40]'
            }`}
          >
            <Layers size={13} />
            Gedung Kos
          </button>
          <button
            type="button"
            onClick={() => setSearchMode('room')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-xl uppercase tracking-tight transition-all duration-300 cursor-pointer flex items-center justify-center gap-1.5 ${
              searchMode === 'room' 
                ? 'bg-[#2E6F40] text-white shadow-sm' 
                : 'text-[#64748B] hover:text-[#2E6F40]'
            }`}
          >
            <CheckCircle2 size={13} />
            Kamar Langsung
          </button>
        </div>
      </div>

      {/* Main Input Filters Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-end pt-2">
        
        {/* Input 1: Search Keyword Input Field */}
        <div className="md:col-span-5 space-y-2">
          <label className="block text-xs font-bold text-[#3A444D] uppercase tracking-wider font-sans">
            Kata Kunci / Cabang / Tipe Kamar
          </label>
          <div className="relative">
            <Search className="absolute left-3.5 top-3.5 text-[#64748B]" size={16} />
            <input 
              type="text"
              placeholder={searchMode === 'building' ? "Cari cabang, kota, area..." : "Cari nomor kamar, tipe (VIP/Standard), kota..."}
              value={searchLocation}
              onChange={(e) => setSearchLocation(e.target.value)}
              className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl pl-10 pr-4 py-3 text-sm text-[#3A444D] placeholder-[#94A3B8] focus:outline-none focus:border-[#2E6F40] focus:bg-white transition-all font-medium"
            />
            {searchLocation && (
              <button
                type="button"
                onClick={() => setSearchLocation('')}
                className="absolute right-3 top-3 text-xs text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Input 2: Kebijakan Tipe Hunian (Gender Policy) */}
        <div className="md:col-span-4 space-y-2">
          <label className="block text-xs font-bold text-[#3A444D] uppercase tracking-wider font-sans">
            Tipe Hunian (Gender)
          </label>
          <div className="flex bg-[#F8FAFC] border border-[#E2E8F0] p-1 rounded-2xl w-full">
            {(['all', 'putra', 'putri', 'campur'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSelectedType(t)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase transition-all duration-300 cursor-pointer ${
                  selectedType === t 
                    ? 'bg-[#2E6F40] text-white shadow-sm' 
                    : 'text-[#64748B] hover:text-[#2E6F40]'
                }`}
              >
                {t === 'all' ? 'Semua' : t}
              </button>
            ))}
          </div>
        </div>

        {/* Input 3: Durasi Sewa */}
        <div className="md:col-span-3 space-y-2">
          <label className="block text-xs font-bold text-[#3A444D] uppercase tracking-wider font-sans">
            Durasi Sewa
          </label>
          <div className="flex bg-[#F8FAFC] border border-[#E2E8F0] p-1 rounded-2xl w-full">
            <button
              type="button"
              onClick={() => setSearchDurationType('monthly')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase transition-all duration-300 cursor-pointer ${
                searchDurationType === 'monthly' 
                  ? 'bg-[#2E6F40] text-white shadow-sm' 
                  : 'text-[#64748B] hover:text-[#2E6F40]'
              }`}
            >
              Bulanan
            </button>
            <button
              type="button"
              onClick={() => setSearchDurationType('daily')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase transition-all duration-300 cursor-pointer ${
                searchDurationType === 'daily' 
                  ? 'bg-[#2E6F40] text-white shadow-sm' 
                  : 'text-[#64748B] hover:text-[#2E6F40]'
              }`}
            >
              Harian
            </button>
          </div>
        </div>

      </div>

      {/* Row 2: Price Range & Ketersediaan Real-Time */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 pt-2 border-t border-[#F1F5F9] items-center">
        
        {/* Harga Maksimum Filter Slider */}
        <div className="md:col-span-7 space-y-2">
          <div className="flex justify-between items-center text-xs font-bold text-[#3A444D]">
            <span className="uppercase tracking-wider flex items-center gap-1">
              <DollarSign size={13} className="text-[#2E6F40]" /> Max Harga Sewa
            </span>
            <span className="text-[#2E6F40] font-mono font-black text-sm bg-[#EEF7F0] px-2.5 py-0.5 rounded-lg border border-[#2E6F40]/20">
              {priceRange >= 15000000 ? 'Semua Harga' : `≤ Rp ${(priceRange).toLocaleString('id-ID')}`}
            </span>
          </div>
          <input 
            type="range"
            min={500000}
            max={15000000}
            step={500000}
            value={priceRange}
            onChange={(e) => setPriceRange(Number(e.target.value))}
            className="w-full accent-[#2E6F40] cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-400 font-mono">
            <span>Rp 500rb</span>
            <span>Rp 5 Jt</span>
            <span>Rp 10 Jt</span>
            <span>Rp 15 Jt+</span>
          </div>
        </div>

        {/* Availability Real-Time Toggle */}
        <div className="md:col-span-5 flex items-center justify-start md:justify-end">
          <label className="inline-flex items-center gap-3 bg-[#F8FAFC] border border-[#E2E8F0] p-3 rounded-2xl cursor-pointer hover:border-[#2E6F40] transition-all w-full sm:w-auto">
            <input 
              type="checkbox"
              checked={onlyAvailable}
              onChange={(e) => setOnlyAvailable(e.target.checked)}
              className="w-4 h-4 accent-[#2E6F40] rounded cursor-pointer"
            />
            <div>
              <span className="text-xs font-bold text-[#3A444D] block leading-tight">
                Hanya Kamar Tersedia (Available)
              </span>
              <span className="text-[10px] text-[#64748B] block">
                Sembunyikan unit yang sudah terisi
              </span>
            </div>
          </label>
        </div>

      </div>

      {/* Advanced Facilities Filter */}
      <div className="border-t border-[#F1F5F9] pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-bold text-[#3A444D] uppercase tracking-wider font-sans flex items-center gap-1.5">
            <SlidersHorizontal size={14} className="text-[#2E6F40]" />
            Saring Berdasarkan Fasilitas Master
          </label>
          {selectedFacilities.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedFacilities([])}
              className="text-[11px] text-[#2E6F40] font-bold hover:underline cursor-pointer"
            >
              Bersihkan Fasilitas ({selectedFacilities.length})
            </button>
          )}
        </div>
        
        <div className="flex flex-wrap gap-2">
          {masterFacilities.map((facility) => {
            const isSelected = selectedFacilities.some(
              (f) => f.toLowerCase() === facility.title.trim().toLowerCase()
            );
            return (
              <button
                key={facility.title}
                type="button"
                onClick={() => {
                  if (isSelected) {
                    setSelectedFacilities(
                      selectedFacilities.filter(
                        (f) => f.toLowerCase() !== facility.title.trim().toLowerCase()
                      )
                    );
                  } else {
                    setSelectedFacilities([
                      ...selectedFacilities,
                      facility.title.trim().toLowerCase(),
                    ]);
                  }
                }}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-semibold tracking-tight transition-all duration-300 border cursor-pointer ${
                  isSelected
                    ? 'bg-[#2E6F40] border-[#2E6F40] text-white shadow-sm shadow-[#2E6F40]/10'
                    : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#64748B] hover:border-[#2E6F40] hover:text-[#2E6F40] hover:bg-white'
                }`}
              >
                {renderFacilityIcon(facility.icon)}
                <span>{facility.title}</span>
                {facility.subtitle && (
                  <span className={`text-[9px] font-medium opacity-80 ${isSelected ? 'text-green-100' : 'text-slate-400'}`}>
                    ({facility.subtitle})
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer Info / Filter Reset Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pt-4 border-t border-[#F1F5F9] gap-3">
        <div className="flex items-center gap-2 text-xs text-[#64748B]">
          <Info size={14} className="text-[#2E6F40] shrink-0" />
          <span>Fasilitas All-Inclusive termasuk Wi-Fi, laundry, token listrik, & AC.</span>
        </div>

        {onClearFilters && (searchLocation || selectedType !== 'all' || searchDurationType !== 'monthly' || selectedFacilities.length > 0 || priceRange < 15000000 || onlyAvailable) && (
          <button
            type="button"
            onClick={onClearFilters}
            className="text-xs text-[#2E6F40] font-bold hover:text-[#235531] transition-colors flex items-center gap-1 cursor-pointer"
          >
            Bersihkan Semua Filter
          </button>
        )}
      </div>
    </div>
  );
};

export default PremiumSearchFilter;

