import React from 'react';
import { Search, MapPin, Calendar, Compass, SlidersHorizontal, Info } from 'lucide-react';

interface PremiumSearchFilterProps {
  searchLocation: string;
  setSearchLocation: (val: string) => void;
  selectedType: 'all' | 'putra' | 'putri' | 'campur';
  setSelectedType: (val: 'all' | 'putra' | 'putri' | 'campur') => void;
  searchDurationType: 'monthly' | 'daily';
  setSearchDurationType: (val: 'monthly' | 'daily') => void;
  searchMode: 'building' | 'room';
  setSearchMode: (val: 'building' | 'room') => void;
  onClearFilters?: () => void;
  resultsCount: number;
}

export const PremiumSearchFilter: React.FC<PremiumSearchFilterProps> = ({
  searchLocation,
  setSearchLocation,
  selectedType,
  setSelectedType,
  searchDurationType,
  setSearchDurationType,
  searchMode,
  setSearchMode,
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
          <span className="text-[10px] font-bold text-[#0D9488] tracking-[0.2em] uppercase font-mono bg-[#E6F4F1] px-3 py-1 rounded-full">
            Katalog Properti
          </span>
          <h2 className="text-xl sm:text-2xl font-extrabold text-[#3A444D] tracking-tight">
            Cari Hunian Samara Stay
          </h2>
          <p className="text-xs text-[#64748B]">
            Menemukan <strong className="text-[#3A444D]">{resultsCount}</strong> {searchMode === 'building' ? 'gedung kos' : 'pilihan kamar'} terbaik untuk Anda.
          </p>
        </div>

        {/* Search Mode Toggle (Gedung vs Kamar) */}
        <div className="flex bg-[#F8FAFC] border border-[#E2E8F0] p-1 rounded-2xl text-xs font-bold w-full md:w-auto">
          <button
            type="button"
            onClick={() => setSearchMode('building')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-xl uppercase tracking-tight transition-all duration-300 cursor-pointer ${
              searchMode === 'building' 
                ? 'bg-[#0D9488] text-white shadow-sm' 
                : 'text-[#64748B] hover:text-[#0D9488]'
            }`}
          >
            Gedung Kos
          </button>
          <button
            type="button"
            onClick={() => setSearchMode('room')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-xl uppercase tracking-tight transition-all duration-300 cursor-pointer ${
              searchMode === 'room' 
                ? 'bg-[#0D9488] text-white shadow-sm' 
                : 'text-[#64748B] hover:text-[#0D9488]'
            }`}
          >
            Kamar Langsung
          </button>
        </div>
      </div>

      {/* Main Input Filters Row */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end pt-2">
        {/* Input 1: Search Location / Name */}
        <div className="md:col-span-5 space-y-2">
          <label className="block text-xs font-bold text-[#3A444D] uppercase tracking-wider font-sans">
            Lokasi atau Nama Kos
          </label>
          <div className="relative">
            <Search className="absolute left-3.5 top-3.5 text-[#64748B]" size={16} />
            <input 
              type="text"
              placeholder={searchMode === 'building' ? "Cari jalan, area kemayoran, cempaka putih..." : "Cari nomor kamar, nama kos, atau kota..."}
              value={searchLocation}
              onChange={(e) => setSearchLocation(e.target.value)}
              className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl pl-10 pr-4 py-3 text-sm text-[#3A444D] placeholder-[#94A3B8] focus:outline-none focus:border-[#0D9488] focus:bg-white transition-all font-medium"
            />
          </div>
        </div>

        {/* Input 2: Kebijakan Hunian (Gender Policy) */}
        <div className="md:col-span-4 space-y-2">
          <label className="block text-xs font-bold text-[#3A444D] uppercase tracking-wider font-sans">
            Tipe Kebijakan
          </label>
          <div className="flex bg-[#F8FAFC] border border-[#E2E8F0] p-1 rounded-2xl w-full">
            {(['all', 'putra', 'putri', 'campur'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSelectedType(t)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase transition-all duration-300 cursor-pointer ${
                  selectedType === t 
                    ? 'bg-[#3A444D] text-white shadow-sm' 
                    : 'text-[#64748B] hover:text-[#3A444D]'
                }`}
              >
                {t === 'all' ? 'Semua' : t}
              </button>
            ))}
          </div>
        </div>

        {/* Input 3: Rent Period Duration */}
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
                  ? 'bg-[#0D9488] text-white shadow-sm' 
                  : 'text-[#64748B] hover:text-[#0D9488]'
              }`}
            >
              Bulanan
            </button>
            <button
              type="button"
              onClick={() => setSearchDurationType('daily')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase transition-all duration-300 cursor-pointer ${
                searchDurationType === 'daily' 
                  ? 'bg-[#0D9488] text-white shadow-sm' 
                  : 'text-[#64748B] hover:text-[#0D9488]'
              }`}
            >
              Harian
            </button>
          </div>
        </div>
      </div>

      {/* Footer Info / Filter Reset Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pt-4 border-t border-[#F1F5F9] gap-3">
        <div className="flex items-center gap-2 text-xs text-[#64748B]">
          <Info size={14} className="text-[#0D9488] shrink-0" />
          <span>Fasilitas All-Inclusive termasuk Wi-Fi, laundry, token listrik, & housekeeping berkala.</span>
        </div>

        {onClearFilters && (searchLocation || selectedType !== 'all' || searchDurationType !== 'monthly') && (
          <button
            type="button"
            onClick={onClearFilters}
            className="text-xs text-[#0D9488] font-bold hover:text-[#115E59] transition-colors flex items-center gap-1 cursor-pointer"
          >
            Bersihkan Semua Filter
          </button>
        )}
      </div>
    </div>
  );
};

export default PremiumSearchFilter;
