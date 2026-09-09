import React, { useState, useMemo } from 'react';
import { Room, Property } from '../../types';
import { formatRupiah } from '../../utils/formatCurrency';
import { 
  Building2, 
  Bed, 
  CheckCircle2, 
  Wrench, 
  User, 
  Search, 
  Layers, 
  Maximize, 
  Edit2, 
  Trash2, 
  Plus, 
  RotateCw, 
  X, 
  ChevronDown, 
  Check, 
  Grid, 
  List, 
  ArrowUpDown, 
  Sparkles, 
  Calendar,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';

export type RoomStatusType = 'available' | 'occupied' | 'maintenance' | 'reserved';

interface RoomSelectionListProps {
  rooms: Room[];
  properties: Property[];
  onQuickStatusToggle: (room: Room, newStatus: RoomStatusType, tenantName?: string | null) => Promise<void>;
  onEditRoom: (room: Room) => void;
  onDeleteRoom: (roomId: number) => void;
  onAddRoom?: () => void;
  onSelectRoom?: (room: Room) => void;
  selectedRoomId?: number | null;
  selectionMode?: boolean;
  processingRoomId?: number | null;
  processingItems?: Record<string | number, boolean>;
  isRefreshing?: boolean;
}

const STATUS_CONFIG: Record<RoomStatusType, {
  label: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  dotColor: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  description: string;
}> = {
  available: {
    label: 'Tersedia',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-700',
    badgeBorder: 'border-emerald-200',
    dotColor: 'bg-emerald-500',
    icon: CheckCircle2,
    description: 'Unit siap disewa / dihuni'
  },
  occupied: {
    label: 'Terisi',
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-700',
    badgeBorder: 'border-blue-200',
    dotColor: 'bg-blue-500',
    icon: User,
    description: 'Sedang dihuni penghuni aktif'
  },
  maintenance: {
    label: 'Perbaikan',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-800',
    badgeBorder: 'border-amber-200',
    dotColor: 'bg-amber-500',
    icon: Wrench,
    description: 'Pemeliharaan / tidak dapat dibooking'
  },
  reserved: {
    label: 'Dipesan',
    badgeBg: 'bg-purple-50',
    badgeText: 'text-purple-700',
    badgeBorder: 'border-purple-200',
    dotColor: 'bg-purple-500',
    icon: Calendar,
    description: 'Direservasi / menunggu survey/check-in'
  }
};

export const RoomSelectionList: React.FC<RoomSelectionListProps> = ({
  rooms,
  properties,
  onQuickStatusToggle,
  onEditRoom,
  onDeleteRoom,
  onAddRoom,
  onSelectRoom,
  selectedRoomId = null,
  selectionMode = false,
  processingRoomId = null,
  processingItems = {},
  isRefreshing = false
}) => {
  // Local filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPropertyId, setSelectedPropertyId] = useState<number | 'all'>('all');
  const [selectedStatus, setSelectedStatus] = useState<RoomStatusType | 'all'>('all');
  const [selectedFloor, setSelectedFloor] = useState<number | 'all'>('all');
  const [sortBy, setSortBy] = useState<'number-asc' | 'number-desc' | 'price-asc' | 'price-desc' | 'floor'>('number-asc');
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');

  // Tenant editing modal for 'occupied' status
  const [tenantPromptRoom, setTenantPromptRoom] = useState<Room | null>(null);
  const [tenantInputName, setTenantInputName] = useState('');
  const [statusDropdownOpenId, setStatusDropdownOpenId] = useState<number | null>(null);

  // Derive unique floors available in current rooms
  const availableFloors = useMemo(() => {
    const floors = Array.from(new Set(rooms.map(r => r.floor))).sort((a, b) => a - b);
    return floors;
  }, [rooms]);

  // Overall metrics calculation
  const metrics = useMemo(() => {
    const total = rooms.length;
    const available = rooms.filter(r => r.status === 'available' || !r.status).length;
    const occupied = rooms.filter(r => r.status === 'occupied').length;
    const maintenance = rooms.filter(r => r.status === 'maintenance').length;
    const reserved = rooms.filter(r => r.status === 'reserved').length;
    const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0;
    const availabilityRate = total > 0 ? Math.round((available / total) * 100) : 0;

    return { total, available, occupied, maintenance, reserved, occupancyRate, availabilityRate };
  }, [rooms]);

  // Filtered and sorted rooms
  const filteredRooms = useMemo(() => {
    return rooms.filter(r => {
      // 1. Property filter
      if (selectedPropertyId !== 'all' && r.property_id !== selectedPropertyId) {
        return false;
      }
      // 2. Status filter
      const roomStatus: RoomStatusType = (r.status as RoomStatusType) || 'available';
      if (selectedStatus !== 'all' && roomStatus !== selectedStatus) {
        return false;
      }
      // 3. Floor filter
      if (selectedFloor !== 'all' && r.floor !== selectedFloor) {
        return false;
      }
      // 4. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const numMatch = r.room_number.toLowerCase().includes(q);
        const typeMatch = (r.room_type || '').toLowerCase().includes(q);
        const tenantMatch = (r.current_tenant_name || '').toLowerCase().includes(q);
        const propName = properties.find(p => p.id === r.property_id)?.name.toLowerCase() || '';
        const propMatch = propName.includes(q);

        if (!numMatch && !typeMatch && !tenantMatch && !propMatch) {
          return false;
        }
      }
      return true;
    }).sort((a, b) => {
      if (sortBy === 'number-asc') {
        return a.room_number.localeCompare(b.room_number, undefined, { numeric: true });
      }
      if (sortBy === 'number-desc') {
        return b.room_number.localeCompare(a.room_number, undefined, { numeric: true });
      }
      if (sortBy === 'price-asc') {
        return a.price - b.price;
      }
      if (sortBy === 'price-desc') {
        return b.price - a.price;
      }
      if (sortBy === 'floor') {
        return a.floor - b.floor;
      }
      return 0;
    });
  }, [rooms, selectedPropertyId, selectedStatus, selectedFloor, searchQuery, sortBy, properties]);

  // Handler for quick status toggle
  const handleInitiateStatusChange = (room: Room, targetStatus: RoomStatusType) => {
    setStatusDropdownOpenId(null);
    if (targetStatus === 'occupied') {
      // Prompt for tenant name
      setTenantPromptRoom(room);
      setTenantInputName(room.current_tenant_name || '');
    } else {
      // Instant toggle
      onQuickStatusToggle(room, targetStatus, targetStatus === 'available' ? null : room.current_tenant_name);
    }
  };

  const handleConfirmOccupiedStatus = () => {
    if (tenantPromptRoom) {
      onQuickStatusToggle(tenantPromptRoom, 'occupied', tenantInputName.trim() || null);
      setTenantPromptRoom(null);
      setTenantInputName('');
    }
  };

  return (
    <div className="space-y-4 font-sans text-left">
      {/* 1. TOP STATS BAR: Realtime Availability Overview */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#F1F5F9] pb-3.5">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#0D9488] animate-ping" />
              <h3 className="text-sm font-black text-[#3A444D] uppercase tracking-tight font-display">
                Ringkasan Ketersediaan Kamar
              </h3>
              {isRefreshing && (
                <span className="text-[10px] text-teal-600 bg-teal-50 border border-teal-100 px-2 py-0.5 rounded-md flex items-center gap-1 font-medium">
                  <RotateCw size={10} className="animate-spin" />
                  Syncing
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#64748B] mt-0.5">
              Pantau status ketersediaan unit dan lakukan pembaruan status instan untuk staf operasional.
            </p>
          </div>

          {onAddRoom && (
            <button 
              type="button"
              onClick={onAddRoom}
              className="bg-[#0D9488] hover:bg-[#115E59] text-white font-extrabold text-xs uppercase px-4 py-2.5 rounded-xl flex items-center gap-1.5 cursor-pointer transition-all shadow-xs self-start md:self-auto shrink-0"
            >
              <Plus size={14} />
              Tambah Kamar
            </button>
          )}
        </div>

        {/* Status Breakdown Chips (Clickable as fast filters) */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-3.5">
          {/* Total Units */}
          <div 
            onClick={() => setSelectedStatus('all')}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
              selectedStatus === 'all'
                ? 'bg-slate-100 border-slate-300 ring-1 ring-slate-400/20'
                : 'bg-[#F8FAFC] border-[#E2E8F0] hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">Total Unit</span>
              <Bed size={13} className="text-[#64748B]" />
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-lg font-black text-[#3A444D] font-display">{metrics.total}</span>
              <span className="text-[10px] text-[#64748B] font-mono">Kamar</span>
            </div>
          </div>

          {/* Tersedia (Available) */}
          <div 
            onClick={() => setSelectedStatus('available')}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
              selectedStatus === 'available'
                ? 'bg-emerald-50 border-emerald-300 ring-1 ring-emerald-500/30'
                : 'bg-emerald-50/40 border-emerald-100 hover:bg-emerald-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Tersedia
              </span>
              <CheckCircle2 size={13} className="text-emerald-600" />
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-lg font-black text-emerald-800 font-display">{metrics.available}</span>
              <span className="text-[10px] font-bold text-emerald-600 font-mono">({metrics.availabilityRate}%)</span>
            </div>
          </div>

          {/* Terisi (Occupied) */}
          <div 
            onClick={() => setSelectedStatus('occupied')}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
              selectedStatus === 'occupied'
                ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-500/30'
                : 'bg-blue-50/40 border-blue-100 hover:bg-blue-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                Terisi
              </span>
              <User size={13} className="text-blue-600" />
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-lg font-black text-blue-800 font-display">{metrics.occupied}</span>
              <span className="text-[10px] font-bold text-blue-600 font-mono">({metrics.occupancyRate}%)</span>
            </div>
          </div>

          {/* Pemeliharaan (Maintenance) */}
          <div 
            onClick={() => setSelectedStatus('maintenance')}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
              selectedStatus === 'maintenance'
                ? 'bg-amber-50 border-amber-300 ring-1 ring-amber-500/30'
                : 'bg-amber-50/40 border-amber-100 hover:bg-amber-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Perbaikan
              </span>
              <Wrench size={13} className="text-amber-600" />
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-lg font-black text-amber-900 font-display">{metrics.maintenance}</span>
              <span className="text-[10px] text-amber-700 font-mono">Unit</span>
            </div>
          </div>

          {/* Direservasi (Reserved) */}
          <div 
            onClick={() => setSelectedStatus('reserved')}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
              selectedStatus === 'reserved'
                ? 'bg-purple-50 border-purple-300 ring-1 ring-purple-500/30'
                : 'bg-purple-50/40 border-purple-100 hover:bg-purple-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                Dipesan
              </span>
              <Calendar size={13} className="text-purple-600" />
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-lg font-black text-purple-900 font-display">{metrics.reserved}</span>
              <span className="text-[10px] text-purple-700 font-mono">Unit</span>
            </div>
          </div>
        </div>

        {/* Visual Progress Ribbon */}
        {metrics.total > 0 && (
          <div className="mt-3 w-full bg-slate-100 h-2 rounded-full overflow-hidden flex" title="Rasio Ketersediaan Kamar">
            <div 
              style={{ width: `${(metrics.available / metrics.total) * 100}%` }} 
              className="bg-emerald-500 h-full transition-all duration-500" 
              title={`Tersedia: ${metrics.available} unit (${metrics.availabilityRate}%)`}
            />
            <div 
              style={{ width: `${(metrics.occupied / metrics.total) * 100}%` }} 
              className="bg-blue-500 h-full transition-all duration-500" 
              title={`Terisi: ${metrics.occupied} unit (${metrics.occupancyRate}%)`}
            />
            <div 
              style={{ width: `${(metrics.maintenance / metrics.total) * 100}%` }} 
              className="bg-amber-500 h-full transition-all duration-500" 
              title={`Perbaikan: ${metrics.maintenance} unit`}
            />
            <div 
              style={{ width: `${(metrics.reserved / metrics.total) * 100}%` }} 
              className="bg-purple-500 h-full transition-all duration-500" 
              title={`Direservasi: ${metrics.reserved} unit`}
            />
          </div>
        )}
      </div>

      {/* 2. SEARCH & FILTER TOOLBAR */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-3.5 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search input */}
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari no kamar (misal: 101), penghuni, atau tipe..."
            className="w-full pl-8 pr-7 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-xs text-[#3A444D] placeholder:text-slate-400 focus:outline-none focus:border-[#0D9488] focus:bg-white transition"
          />
          {searchQuery && (
            <button 
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Filters Group */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          {/* Property Selector */}
          <div className="relative">
            <select
              value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="py-2 pl-2.5 pr-7 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl font-bold text-[#3A444D] text-xs focus:outline-none focus:border-[#0D9488] appearance-none cursor-pointer"
            >
              <option value="all">Semua Properti ({properties.length})</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] pointer-events-none" />
          </div>

          {/* Floor Selector */}
          {availableFloors.length > 1 && (
            <div className="relative">
              <select
                value={selectedFloor}
                onChange={(e) => setSelectedFloor(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="py-2 pl-2.5 pr-7 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl font-bold text-[#3A444D] text-xs focus:outline-none focus:border-[#0D9488] appearance-none cursor-pointer"
              >
                <option value="all">Semua Lantai</option>
                {availableFloors.map(f => (
                  <option key={f} value={f}>Lantai {f}</option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] pointer-events-none" />
            </div>
          )}

          {/* Sort Selector */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="py-2 pl-2.5 pr-7 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl font-bold text-[#3A444D] text-xs focus:outline-none focus:border-[#0D9488] appearance-none cursor-pointer"
            >
              <option value="number-asc">Nomor Kamar (A-Z)</option>
              <option value="number-desc">Nomor Kamar (Z-A)</option>
              <option value="price-asc">Tarif Termurah</option>
              <option value="price-desc">Tarif Termahal</option>
              <option value="floor">Urut Lantai</option>
            </select>
            <ArrowUpDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] pointer-events-none" />
          </div>

          {/* View mode toggle (Compact Card vs Compact List) */}
          <div className="flex items-center bg-[#F1F5F9] p-0.5 rounded-xl border border-[#E2E8F0]">
            <button
              type="button"
              onClick={() => setViewMode('card')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'card'
                  ? 'bg-white text-[#0D9488] shadow-xs'
                  : 'text-[#64748B] hover:text-[#3A444D]'
              }`}
              title="Tampilan Kartu Ringkas"
            >
              <Grid size={14} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-white text-[#0D9488] shadow-xs'
                  : 'text-[#64748B] hover:text-[#3A444D]'
              }`}
              title="Tampilan Daftar Baris Ringkas"
            >
              <List size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Quick Filter Status Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
        <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mr-1">Status:</span>
        <button
          type="button"
          onClick={() => setSelectedStatus('all')}
          className={`px-3 py-1 rounded-lg font-bold transition-all text-xs cursor-pointer border ${
            selectedStatus === 'all'
              ? 'bg-[#3A444D] text-white border-[#3A444D]'
              : 'bg-white text-[#64748B] border-[#E2E8F0] hover:bg-slate-50'
          }`}
        >
          Semua ({rooms.length})
        </button>
        <button
          type="button"
          onClick={() => setSelectedStatus('available')}
          className={`px-3 py-1 rounded-lg font-bold transition-all text-xs cursor-pointer border flex items-center gap-1.5 ${
            selectedStatus === 'available'
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Tersedia ({metrics.available})
        </button>
        <button
          type="button"
          onClick={() => setSelectedStatus('occupied')}
          className={`px-3 py-1 rounded-lg font-bold transition-all text-xs cursor-pointer border flex items-center gap-1.5 ${
            selectedStatus === 'occupied'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
          Terisi ({metrics.occupied})
        </button>
        <button
          type="button"
          onClick={() => setSelectedStatus('maintenance')}
          className={`px-3 py-1 rounded-lg font-bold transition-all text-xs cursor-pointer border flex items-center gap-1.5 ${
            selectedStatus === 'maintenance'
              ? 'bg-amber-600 text-white border-amber-600'
              : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          Perbaikan ({metrics.maintenance})
        </button>
        <button
          type="button"
          onClick={() => setSelectedStatus('reserved')}
          className={`px-3 py-1 rounded-lg font-bold transition-all text-xs cursor-pointer border flex items-center gap-1.5 ${
            selectedStatus === 'reserved'
              ? 'bg-purple-600 text-white border-purple-600'
              : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
          Dipesan ({metrics.reserved})
        </button>

        {filteredRooms.length !== rooms.length && (
          <span className="ml-auto text-[11px] font-mono text-[#64748B]">
            Menampilkan <strong className="text-[#3A444D]">{filteredRooms.length}</strong> dari {rooms.length} kamar
          </span>
        )}
      </div>

      {/* 3. ROOM CARDS / LIST CONTAINER */}
      {filteredRooms.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
            <Bed size={20} />
          </div>
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-[#3A444D] uppercase">Tidak Ada Kamar Ditemukan</h4>
            <p className="text-[11px] text-[#64748B]">
              Tidak ada unit yang sesuai dengan kriteria filter atau pencarian Anda saat ini.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedPropertyId('all');
              setSelectedStatus('all');
              setSelectedFloor('all');
            }}
            className="text-xs font-bold text-[#0D9488] hover:underline cursor-pointer"
          >
            Reset Semua Filter
          </button>
        </div>
      ) : viewMode === 'card' ? (
        /* COMPACT CARD GRID VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {filteredRooms.map((room) => {
            const propName = properties.find(p => p.id === room.property_id)?.name || 'Properti N/A';
            const statusKey: RoomStatusType = (room.status as RoomStatusType) || 'available';
            const statusInfo = STATUS_CONFIG[statusKey] || STATUS_CONFIG.available;
            const StatusIcon = statusInfo.icon;
            const isProcessing = processingRoomId === room.id || !!processingItems[room.id];
            const isSelected = selectedRoomId === room.id;
            const isDropdownOpen = statusDropdownOpenId === room.id;

            return (
              <div
                key={room.id}
                onClick={() => {
                  if (selectionMode && onSelectRoom) {
                    onSelectRoom(room);
                  }
                }}
                className={`bg-white border rounded-2xl p-3.5 flex flex-col justify-between gap-3 transition-all duration-200 shadow-xs relative text-left group ${
                  isSelected 
                    ? 'border-[#0D9488] ring-2 ring-[#0D9488]/20 bg-teal-50/20' 
                    : 'border-[#E2E8F0] hover:border-[#0D9488]/60 hover:shadow-sm'
                } ${isProcessing ? 'opacity-70 pointer-events-none' : ''}`}
              >
                {/* Processing Overlay */}
                {isProcessing && (
                  <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] rounded-2xl flex items-center justify-center z-20">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#0D9488] bg-white px-3 py-1.5 rounded-xl border border-teal-200 shadow-sm">
                      <RotateCw size={13} className="animate-spin" />
                      <span>Menyimpan...</span>
                    </div>
                  </div>
                )}

                {/* Top Row: Room Number, Type, and Quick Status Indicator */}
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-black text-sm text-[#3A444D] font-display uppercase tracking-tight">
                        Unit {room.room_number}
                      </span>
                      <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 font-mono">
                        {room.room_type}
                      </span>
                    </div>

                    {/* Floor & Dimension Badge */}
                    <span className="text-[10px] font-mono text-[#64748B] shrink-0">
                      Lt {room.floor} • {room.size_sqm}m²
                    </span>
                  </div>

                  {/* Property Name */}
                  <p className="text-[11px] text-[#64748B] truncate font-medium flex items-center gap-1">
                    <Building2 size={11} className="shrink-0 text-slate-400" />
                    <span className="truncate">{propName}</span>
                  </p>
                </div>

                {/* Middle Row: Tenant or Status Detail */}
                <div className="bg-[#F8FAFC] border border-[#F1F5F9] rounded-xl p-2 text-[11px]">
                  {statusKey === 'occupied' ? (
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 text-blue-800 font-semibold truncate">
                        <User size={12} className="shrink-0 text-blue-600" />
                        <span className="truncate">{room.current_tenant_name || 'Penghuni Aktif'}</span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTenantPromptRoom(room);
                          setTenantInputName(room.current_tenant_name || '');
                        }}
                        className="text-[10px] text-blue-600 hover:text-blue-800 font-bold shrink-0 underline cursor-pointer"
                        title="Edit nama penghuni"
                      >
                        Ubah
                      </button>
                    </div>
                  ) : statusKey === 'maintenance' ? (
                    <div className="flex items-center gap-1.5 text-amber-800 font-semibold">
                      <Wrench size={12} className="shrink-0 text-amber-600" />
                      <span>Sedang Perbaikan / Non-Aktif</span>
                    </div>
                  ) : statusKey === 'reserved' ? (
                    <div className="flex items-center gap-1.5 text-purple-800 font-semibold">
                      <Calendar size={12} className="shrink-0 text-purple-600" />
                      <span>Menunggu Survey / Check-in</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                      <Sparkles size={12} className="shrink-0 text-emerald-600" />
                      <span>Siap Huni (Kamar Kosong)</span>
                    </div>
                  )}
                </div>

                {/* Pricing & Daily Badge */}
                <div className="flex items-center justify-between text-xs pt-0.5">
                  <div>
                    <span className="text-[10px] text-[#64748B] block font-mono">Tarif Sewa</span>
                    <span className="font-extrabold text-xs text-[#3A444D] font-mono">
                      {formatRupiah(room.price)}
                      <span className="text-[9px] font-normal text-slate-500 font-sans">/bln</span>
                    </span>
                  </div>
                  {room.is_daily_enabled && (
                    <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded font-mono">
                      Harian
                    </span>
                  )}
                </div>

                {/* BOTTOM ROW: QUICK STATUS TOGGLE FOR STAFF + ACTION BUTTONS */}
                <div className="border-t border-[#F1F5F9] pt-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-1.5 relative">
                    <span className="text-[9px] font-bold text-[#64748B] uppercase tracking-wider">Status:</span>

                    {/* Interactive Quick Status Toggle Trigger */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setStatusDropdownOpenId(isDropdownOpen ? null : room.id);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase font-mono tracking-wider border flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${statusInfo.badgeBg} ${statusInfo.badgeText} ${statusInfo.badgeBorder} hover:opacity-90`}
                        title="Klik untuk ubah status ketersediaan secara cepat"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dotColor}`} />
                        <span>{statusInfo.label}</span>
                        <ChevronDown size={11} className="opacity-70" />
                      </button>

                      {/* Dropdown Menu for Quick Status Toggling */}
                      {isDropdownOpen && (
                        <>
                          <div 
                            className="fixed inset-0 z-30" 
                            onClick={(e) => {
                              e.stopPropagation();
                              setStatusDropdownOpenId(null);
                            }} 
                          />
                          <div 
                            className="absolute right-0 bottom-full mb-1 w-44 bg-white rounded-xl shadow-xl border border-[#E2E8F0] p-1.5 z-40 space-y-1 text-left animate-fade-in"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                              Ubah Status Cepat
                            </div>
                            {(['available', 'occupied', 'maintenance', 'reserved'] as RoomStatusType[]).map((st) => {
                              const conf = STATUS_CONFIG[st];
                              const isCurrent = st === statusKey;
                              return (
                                <button
                                  key={st}
                                  type="button"
                                  onClick={() => handleInitiateStatusChange(room, st)}
                                  className={`w-full px-2 py-1.5 rounded-lg text-xs font-bold flex items-center justify-between gap-2 transition cursor-pointer ${
                                    isCurrent 
                                      ? `${conf.badgeBg} ${conf.badgeText}` 
                                      : 'hover:bg-slate-50 text-slate-700'
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span className={`w-2 h-2 rounded-full ${conf.dotColor}`} />
                                    <span>{conf.label}</span>
                                  </div>
                                  {isCurrent && <Check size={12} className={conf.badgeText} />}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions: Edit & Delete */}
                  <div className="flex items-center gap-1.5 pt-1">
                    {selectionMode && onSelectRoom && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectRoom(room);
                        }}
                        className={`flex-1 py-1.5 px-2.5 rounded-xl font-extrabold text-[10px] uppercase transition cursor-pointer flex items-center justify-center gap-1 ${
                          isSelected 
                            ? 'bg-[#0D9488] text-white' 
                            : 'bg-teal-50 hover:bg-teal-100 text-[#0D9488] border border-teal-200'
                        }`}
                      >
                        <Check size={11} />
                        {isSelected ? 'Terpilih' : 'Pilih Unit'}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditRoom(room);
                      }}
                      className="flex-1 py-1.5 px-2 bg-white hover:bg-slate-50 text-slate-700 rounded-xl border border-[#E2E8F0] font-bold text-[10px] flex items-center justify-center gap-1 transition cursor-pointer"
                      title="Edit detail kamar"
                    >
                      <Edit2 size={11} className="text-slate-500" />
                      <span>Edit</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteRoom(room.id);
                      }}
                      className="p-1.5 bg-red-50 hover:bg-red-500 text-red-600 hover:text-white rounded-xl border border-red-100 hover:border-red-500 transition cursor-pointer"
                      title="Hapus kamar"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* COMPACT LIST / ROW VIEW */
        <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden shadow-xs divide-y divide-[#F1F5F9]">
          {filteredRooms.map((room) => {
            const propName = properties.find(p => p.id === room.property_id)?.name || 'Properti N/A';
            const statusKey: RoomStatusType = (room.status as RoomStatusType) || 'available';
            const statusInfo = STATUS_CONFIG[statusKey] || STATUS_CONFIG.available;
            const isProcessing = processingRoomId === room.id || !!processingItems[room.id];
            const isSelected = selectedRoomId === room.id;
            const isDropdownOpen = statusDropdownOpenId === room.id;

            return (
              <div
                key={room.id}
                onClick={() => {
                  if (selectionMode && onSelectRoom) {
                    onSelectRoom(room);
                  }
                }}
                className={`p-3 sm:px-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs transition-colors relative ${
                  isSelected ? 'bg-teal-50/40' : 'hover:bg-[#F8FAFC]'
                } ${isProcessing ? 'opacity-60 pointer-events-none' : ''}`}
              >
                {/* Room identity */}
                <div className="flex items-center gap-3 min-w-[200px]">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex flex-col items-center justify-center shrink-0">
                    <span className="text-[11px] font-black text-[#3A444D] font-display">
                      {room.room_number}
                    </span>
                    <span className="text-[8px] font-mono text-slate-500 uppercase">Lt {room.floor}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h4 className="font-extrabold text-[#3A444D] text-xs">
                        Unit {room.room_number}
                      </h4>
                      <span className="text-[8px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200 font-mono">
                        {room.room_type}
                      </span>
                    </div>
                    <p className="text-[10px] text-[#64748B] font-mono mt-0.5 truncate">
                      {propName} • {room.size_sqm} m²
                    </p>
                  </div>
                </div>

                {/* Tenant / Occupancy Info */}
                <div className="min-w-[180px]">
                  {statusKey === 'occupied' ? (
                    <div className="flex items-center gap-1.5 text-blue-800 text-[11px] font-semibold">
                      <User size={12} className="text-blue-600 shrink-0" />
                      <span className="truncate">{room.current_tenant_name || 'Penghuni Aktif'}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTenantPromptRoom(room);
                          setTenantInputName(room.current_tenant_name || '');
                        }}
                        className="text-[9px] text-blue-600 underline font-bold"
                      >
                        Ubah
                      </button>
                    </div>
                  ) : statusKey === 'maintenance' ? (
                    <span className="text-amber-800 text-[11px] font-semibold flex items-center gap-1">
                      <Wrench size={11} className="text-amber-600" /> Perbaikan
                    </span>
                  ) : statusKey === 'reserved' ? (
                    <span className="text-purple-800 text-[11px] font-semibold flex items-center gap-1">
                      <Calendar size={11} className="text-purple-600" /> Direservasi
                    </span>
                  ) : (
                    <span className="text-emerald-700 text-[11px] font-semibold flex items-center gap-1">
                      <Sparkles size={11} className="text-emerald-600" /> Siap Huni
                    </span>
                  )}
                </div>

                {/* Rate */}
                <div className="text-left sm:text-right min-w-[110px]">
                  <span className="font-extrabold text-xs text-[#3A444D] font-mono">
                    {formatRupiah(room.price)}
                  </span>
                  <span className="text-[10px] text-slate-400 font-sans block">/bulan</span>
                </div>

                {/* Quick Status Toggler & Actions */}
                <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                  {/* Status Dropdown Trigger */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setStatusDropdownOpenId(isDropdownOpen ? null : room.id);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase font-mono tracking-wider border flex items-center gap-1.5 transition cursor-pointer ${statusInfo.badgeBg} ${statusInfo.badgeText} ${statusInfo.badgeBorder}`}
                      title="Ubah status kamar"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dotColor}`} />
                      <span>{statusInfo.label}</span>
                      <ChevronDown size={11} />
                    </button>

                    {/* Dropdown Menu */}
                    {isDropdownOpen && (
                      <>
                        <div 
                          className="fixed inset-0 z-30" 
                          onClick={(e) => {
                            e.stopPropagation();
                            setStatusDropdownOpenId(null);
                          }} 
                        />
                        <div 
                          className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl shadow-xl border border-[#E2E8F0] p-1.5 z-40 space-y-1 text-left animate-fade-in"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                            Ubah Status Cepat
                          </div>
                          {(['available', 'occupied', 'maintenance', 'reserved'] as RoomStatusType[]).map((st) => {
                            const conf = STATUS_CONFIG[st];
                            const isCurrent = st === statusKey;
                            return (
                              <button
                                key={st}
                                type="button"
                                onClick={() => handleInitiateStatusChange(room, st)}
                                className={`w-full px-2 py-1.5 rounded-lg text-xs font-bold flex items-center justify-between gap-2 transition cursor-pointer ${
                                  isCurrent 
                                    ? `${conf.badgeBg} ${conf.badgeText}` 
                                    : 'hover:bg-slate-50 text-slate-700'
                                }`}
                              >
                                <div className="flex items-center gap-1.5">
                                  <span className={`w-2 h-2 rounded-full ${conf.dotColor}`} />
                                  <span>{conf.label}</span>
                                </div>
                                {isCurrent && <Check size={12} className={conf.badgeText} />}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Edit */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditRoom(room);
                    }}
                    className="p-1.5 bg-white hover:bg-slate-50 text-slate-700 rounded-xl border border-[#E2E8F0] transition cursor-pointer"
                    title="Edit Kamar"
                  >
                    <Edit2 size={12} />
                  </button>

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteRoom(room.id);
                    }}
                    className="p-1.5 bg-red-50 hover:bg-red-500 text-red-600 hover:text-white rounded-xl border border-red-100 transition cursor-pointer"
                    title="Hapus Kamar"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: INPUT TENANT NAME WHEN TOGGLING TO 'OCCUPIED' */}
      {tenantPromptRoom && (
        <div 
          className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setTenantPromptRoom(null)}
        >
          <div 
            className="bg-white rounded-2xl p-5 max-w-sm w-full border border-[#E2E8F0] shadow-xl space-y-4 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider font-mono">
                  Ubah Status ke Terisi
                </span>
                <h3 className="text-sm font-black text-[#3A444D] font-display uppercase mt-0.5">
                  Unit {tenantPromptRoom.room_number}
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => setTenantPromptRoom(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[#3A444D]">
                Nama Penghuni (Opsional):
              </label>
              <input
                type="text"
                value={tenantInputName}
                onChange={(e) => setTenantInputName(e.target.value)}
                placeholder="Contoh: Budi Santoso"
                autoFocus
                className="w-full px-3 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-xs text-[#3A444D] focus:outline-none focus:border-blue-500 focus:bg-white"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleConfirmOccupiedStatus();
                  }
                }}
              />
              <p className="text-[10px] text-[#64748B]">
                Nama ini akan dicantumkan sebagai penanggung jawab unit di dashboard operasional.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#F1F5F9]">
              <button
                type="button"
                onClick={() => setTenantPromptRoom(null)}
                className="px-3 py-2 rounded-xl text-xs font-bold text-[#64748B] hover:bg-slate-100 transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmOccupiedStatus}
                className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-blue-600 hover:bg-blue-700 text-white transition cursor-pointer shadow-xs"
              >
                Setel Terisi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoomSelectionList;
