import React from 'react';
import * as LucideIcons from 'lucide-react';
import { 
  Search, SlidersHorizontal, Info, CheckCircle2, DollarSign, Filter, Layers, ExternalLink
} from 'lucide-react';
import { StandardFacility } from '../../types';

export const AIRBNB_SYSTEM_URL = "https://www.airbnb.co.id/users/profile/1469644070216777538?previous_page_name=PdpHomeMarketplace";

interface PremiumSearchFilterProps {
  searchLocation: string;
  setSearchLocation: (val: string) => void;
  selectedType?: 'all' | 'putra' | 'putri' | 'campur';
  setSelectedType?: (val: 'all' | 'putra' | 'putri' | 'campur') => void;
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
        <div className="md:col-span-8 space-y-2">
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

        {/* Input 2: Durasi Sewa */}
        <div className="md:col-span-4 space-y-2">
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
              onClick={() => {
                setSearchDurationType('daily');
                window.open(AIRBNB_SYSTEM_URL, '_blank', 'noopener,noreferrer');
              }}
              className={`flex-1 py-2 px-2 rounded-xl text-xs font-bold uppercase transition-all duration-300 cursor-pointer flex items-center justify-center gap-1 ${
                searchDurationType === 'daily' 
                  ? 'bg-[#FF385C] text-white shadow-sm ring-2 ring-[#FF385C]/30' 
                  : 'text-[#FF385C] hover:bg-rose-50 hover:text-[#D90B38]'
              }`}
              title="Sewa harian diarahkan ke Airbnb resmi Samara Stay"
            >
              <span>Harian</span>
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-rose-100 text-[#FF385C] border border-[#FF385C]/30 flex items-center gap-0.5">
                Airbnb <ExternalLink size={9} />
              </span>
            </button>
          </div>
        </div>

      </div>

      {/* Banner Khusus Sewa Harian Diarahkan ke Airbnb */}
      {searchDurationType === 'daily' && (
        <div className="bg-gradient-to-r from-[#FFF8F9] to-[#FFF1F3] border border-[#FF385C]/35 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-left shadow-2xs">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FF385C]/10 text-[#FF385C] flex items-center justify-center shrink-0 mt-0.5 shadow-inner">
              <svg className="w-5 h-5 fill-current" viewBox="0 0 32 32">
                <path d="M16 1c2.008 0 3.463.963 4.751 3.269l.533 1.025c1.954 3.83 6.114 12.54 7.1 14.836l.145.353c.667 1.591.91 2.472.96 3.396l.011.315c0 4.298-3.322 7.806-7.5 7.806-3.13 0-5.836-1.956-6.953-4.758l-.147-.384-.131-.383C13.782 29.28 11.027 31.25 7.8 31.25 3.522 31.25.2 27.742.2 23.444c0-1.127.283-2.222.844-3.332l.272-.505c1.036-1.84 5.37-10.824 7.382-14.814l.551-1.058C10.537 1.963 11.992 1 14 1zm0 2c-1.11 0-2.072.585-3.082 2.387l-.46.884c-1.97 3.908-6.241 12.782-7.243 14.562l-.213.394c-.426.84-.602 1.623-.602 2.217 0 3.197 2.483 5.806 5.6 5.806 2.502 0 4.678-1.637 5.385-4.084l.113-.424.113-.424C12.392 20.355 13.9 18.5 16 18.5s3.608 1.855 4.194 5.815l.113.424.113.424c.707 2.447 2.883 4.084 5.385 4.084 3.117 0 5.6-2.609 5.6-5.806 0-.594-.176-1.377-.602-2.217l-.213-.394c-1.002-1.78-5.273-10.654-7.243-14.562l-.46-.884C21.072 3.585 20.11 3 19 3zm0 17.5c-1.105 0-2 .895-2 2s.895 2 2 2 2-.895 2-2-.895-2-2-2z"/>
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs sm:text-sm font-black text-[#1E293B]">
                  Pemesanan Sewa Kamar Harian via Airbnb
                </h4>
                <span className="text-[10px] font-black text-[#FF385C] bg-rose-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Resmi Airbnb
                </span>
              </div>
              <p className="text-[11px] text-[#64748B] mt-1 leading-relaxed max-w-xl">
                Khusus sewa kamar harian (short stay), reservasi diproses melalui sistem instant booking Airbnb resmi Samara Stay (Kost Atikah Kemayoran) dengan fasilitas fully furnished, smart lock, Wi-Fi, dan check-in mandiri.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
            <button
              type="button"
              onClick={() => setSearchDurationType('monthly')}
              className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition cursor-pointer"
            >
              Bulanan
            </button>
            <a
              href={AIRBNB_SYSTEM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 sm:flex-initial bg-[#FF385C] hover:bg-[#D90B38] text-white px-4 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              <span>Buka Profil Airbnb</span>
              <ExternalLink size={13} />
            </a>
          </div>
        </div>
      )}

      {/* Row 2: Price Range & Ketersediaan Real-Time */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 pt-2 border-t border-[#F1F5F9] items-center">
        
        {/* Harga Maksimum Filter Slider */}
        <div className="md:col-span-7 space-y-2">
          <div className="flex justify-between items-center text-xs font-bold text-[#3A444D]">
            <span className="uppercase tracking-wider flex items-center gap-1">
              <DollarSign size={13} className="text-[#2E6F40]" /> Max Harga Sewa
            </span>
            <span className="text-[#2E6F40] font-mono font-black text-sm bg-[#EEF7F0] px-2.5 py-0.5 rounded-lg border border-[#2E6F40]/20">
              {priceRange >= 5000000 ? 'Semua Harga (Maks Rp 5 Jt)' : `≤ Rp ${(priceRange).toLocaleString('id-ID')}`}
            </span>
          </div>
          <input 
            type="range"
            min={500000}
            max={5000000}
            step={250000}
            value={priceRange > 5000000 ? 5000000 : priceRange}
            onChange={(e) => setPriceRange(Number(e.target.value))}
            className="w-full accent-[#2E6F40] cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-400 font-mono">
            <span>Rp 500rb</span>
            <span>Rp 2 Jt</span>
            <span>Rp 3.5 Jt</span>
            <span>Rp 5 Jt (Maks)</span>
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

        {onClearFilters && (searchLocation || selectedType !== 'all' || searchDurationType !== 'monthly' || selectedFacilities.length > 0 || priceRange < 5000000 || onlyAvailable) && (
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

