import React, { useState } from 'react';
import { 
  Users, Wrench, Wallet, AlertTriangle, CheckCircle2, Clock, 
  MessageSquare, ShieldCheck, BedDouble, Calendar, ArrowUpRight,
  Filter, Search, RefreshCw, Send, Check, X, Sparkles, Plus, DollarSign
} from 'lucide-react';
import { Maintenance, PettyCashRequest, ActivityLog, Property, Room } from '../../types';
import { formatRupiah } from '../../utils/formatCurrency';
import { database } from '../../lib/supabase';

interface StaffOperationsSectionProps {
  properties: Property[];
  rooms: Room[];
  maintenanceList: Maintenance[];
  pettyCashList: PettyCashRequest[];
  activityLogs: ActivityLog[];
  selectedPropertyId: string;
  onRefresh?: () => void;
}

export const StaffOperationsSection: React.FC<StaffOperationsSectionProps> = ({
  properties,
  rooms,
  maintenanceList,
  pettyCashList,
  activityLogs,
  selectedPropertyId,
  onRefresh
}) => {
  const [filterType, setFilterType] = useState<'all' | 'shift' | 'maintenance' | 'petty' | 'checkin'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isUpdatingStatusId, setIsUpdatingStatusId] = useState<number | null>(null);
  const [showCreateMaintenanceModal, setShowCreateMaintenanceModal] = useState(false);
  const [isSubmittingMaintenance, setIsSubmittingMaintenance] = useState(false);
  const [maintenanceForm, setMaintenanceForm] = useState({
    property_id: properties[0]?.id || 1,
    room: '',
    title: '',
    priority: 'Normal' as 'Normal' | 'High' | 'Critical',
    desc_field: '',
    tech: 'Teknisi In-House',
    reported_by: 'Staf Operasional',
    cost: '' as string | number,
    post_to_finance: true,
    credit_account_id: 1010
  });

  // Modal: Input / Update Biaya Perbaikan & Laporan Keuangan
  const [costModalTicket, setCostModalTicket] = useState<Maintenance | null>(null);
  const [ticketCostInput, setTicketCostInput] = useState<string>('');
  const [ticketCostPostToFinance, setTicketCostPostToFinance] = useState<boolean>(true);
  const [ticketCostCreditAccount, setTicketCostCreditAccount] = useState<number>(1010);
  const [isSubmittingCost, setIsSubmittingCost] = useState<boolean>(false);

  const handleUpdateMaintenanceStatus = async (ticket: Maintenance, newStatus: 'in-progress' | 'completed' | 'open') => {
    // If completing ticket and cost is currently 0, offer to input cost
    if (newStatus === 'completed' && Number(ticket.cost || 0) === 0) {
      setCostModalTicket(ticket);
      setTicketCostInput('');
      setTicketCostPostToFinance(true);
      setTicketCostCreditAccount(1010);
      return;
    }

    try {
      setIsUpdatingStatusId(ticket.id);
      await database.saveMaintenance({
        ...ticket,
        status: newStatus
      });
      await database.logActivity(
        'Staff / Admin Ops',
        'UPDATE_MAINTENANCE',
        `Status tiket perbaikan Kamar ${ticket.room} (${ticket.title}) diubah ke "${newStatus}"`
      );
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error('Failed to update maintenance status:', err);
    } finally {
      setIsUpdatingStatusId(null);
    }
  };

  const handleCreateMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!maintenanceForm.room || !maintenanceForm.title) return;
    try {
      setIsSubmittingMaintenance(true);
      const parsedCost = Number(maintenanceForm.cost) || 0;
      const willPostToFinance = Boolean(maintenanceForm.post_to_finance && parsedCost > 0);

      const newTicket: Partial<Maintenance> & {
        post_to_finance?: boolean;
        debit_account_id?: number;
        credit_account_id?: number;
      } = {
        property_id: Number(maintenanceForm.property_id),
        room: maintenanceForm.room.trim(),
        title: maintenanceForm.title.trim(),
        priority: maintenanceForm.priority,
        desc_field: maintenanceForm.desc_field.trim() || 'Laporan operasional fasilitas staf',
        tech: maintenanceForm.tech.trim() || 'Teknisi In-House',
        reported_by: maintenanceForm.reported_by.trim() || 'Staf Lapangan',
        cost: parsedCost,
        status: 'open',
        date: new Date().toISOString().split('T')[0],
        post_to_finance: willPostToFinance,
        debit_account_id: 5100,
        credit_account_id: maintenanceForm.credit_account_id || 1010
      };
      await database.saveMaintenance(newTicket);
      await database.logActivity(
        'Staff Ops',
        'CREATE_MAINTENANCE',
        `Tiket Perbaikan Kamar ${newTicket.room}: ${newTicket.title} (Pelapor: ${newTicket.reported_by}, Teknisi: ${newTicket.tech}${parsedCost > 0 ? `, Biaya: Rp ${parsedCost.toLocaleString('id-ID')}` : ''}${willPostToFinance ? ' [Masuk Laporan Keuangan]' : ''})`
      );
      setShowCreateMaintenanceModal(false);
      setMaintenanceForm({
        property_id: properties[0]?.id || 1,
        room: '',
        title: '',
        priority: 'Normal',
        desc_field: '',
        tech: 'Teknisi In-House',
        reported_by: 'Staf Operasional',
        cost: '',
        post_to_finance: true,
        credit_account_id: 1010
      });
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error('Failed to create maintenance ticket:', err);
    } finally {
      setIsSubmittingMaintenance(false);
    }
  };

  const handleSaveTicketCost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!costModalTicket) return;
    try {
      setIsSubmittingCost(true);
      const parsedCost = Number(ticketCostInput) || 0;
      const willPostToFinance = Boolean(ticketCostPostToFinance && parsedCost > 0);

      await database.saveMaintenance({
        ...costModalTicket,
        cost: parsedCost,
        status: 'completed',
        post_to_finance: willPostToFinance,
        debit_account_id: 5100,
        credit_account_id: ticketCostCreditAccount || 1010
      });

      await database.logActivity(
        'Staff / Admin Ops',
        'UPDATE_MAINTENANCE_COST',
        `Biaya perbaikan Kamar ${costModalTicket.room} (${costModalTicket.title}) selesai Rp ${parsedCost.toLocaleString('id-ID')}${willPostToFinance ? ' [Masuk Laporan Keuangan]' : ''}`
      );

      setCostModalTicket(null);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error('Failed to save maintenance cost:', err);
    } finally {
      setIsSubmittingCost(false);
    }
  };

  // Filtered maintenance
  const filteredMaintenance = maintenanceList.filter(m => {
    const matchProp = selectedPropertyId === 'all' || String(m.property_id) === String(selectedPropertyId);
    const matchSearch = !searchTerm || 
      (m.title && m.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (m.room && m.room.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchProp && matchSearch;
  });

  // Filtered petty cash
  const filteredPettyCash = pettyCashList.filter(p => {
    return !searchTerm || 
      (p.applicant && p.applicant.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.purpose && p.purpose.toLowerCase().includes(searchTerm.toLowerCase()));
  });

  // Filtered staff logs from activity_logs
  const staffLogs = activityLogs.filter(log => {
    const isStaffAction = 
      log.action?.startsWith('STAFF_') || 
      log.action === 'CHECK_IN_TENANT' || 
      log.action === 'CHECK_OUT_TENANT' || 
      log.action === 'UPDATE_ROOM_STATUS' || 
      log.action === 'CREATE_MAINTENANCE' ||
      log.action === 'PETTY_CASH_REQUEST' ||
      log.admin_name?.toLowerCase().includes('staff');
    
    if (!isStaffAction) return false;

    if (filterType === 'shift') return log.action.includes('SHIFT') || log.action.includes('MEMO');
    if (filterType === 'maintenance') return log.action.includes('MAINTENANCE');
    if (filterType === 'petty') return log.action.includes('PETTY');
    if (filterType === 'checkin') return log.action.includes('CHECK_');
    
    return true;
  });

  // Summary Metrics
  const openMaintenanceCount = filteredMaintenance.filter(m => m.status === 'open' || m.status === 'in-progress').length;
  const totalMaintenanceCost = filteredMaintenance.reduce((sum, m) => sum + Number(m.cost || 0), 0);
  const pendingPettyCash = filteredPettyCash.filter(p => p.status === 'pending');
  const totalPendingPettyAmount = pendingPettyCash.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const roomsInMaintenance = rooms.filter(r => r.status === 'maintenance').length;
  const roomsCleaning = rooms.filter(r => (r.status as any) === 'cleaning').length;

  return (
    <div className="space-y-6">
      
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-r from-teal-900 via-slate-900 to-teal-950 p-6 rounded-3xl text-white border border-teal-800/60 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Users size={160} />
        </div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-teal-500/20 text-teal-300 border border-teal-500/40 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse"></span>
                Terkoneksi Langsung ke Staff Admin
              </span>
              <span className="text-[11px] font-mono text-slate-300">Live Transparansi Lapangan</span>
            </div>
            <h2 className="text-xl md:text-2xl font-black font-display tracking-tight text-white flex items-center gap-2.5">
              <Users className="text-teal-400" size={24} />
              Operasional Staf & Pemantauan Lapangan
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Pantau laporan serah terima shift harian staf admin, tiket perbaikan fasilitas kamar, 
              pengajuan kas kecil operasional, dan kepatuhan prosedur check-in/check-out secara transparan.
            </p>
          </div>

          {onRefresh && (
            <button
              onClick={onRefresh}
              className="flex items-center gap-2 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all self-start md:self-center cursor-pointer border border-white/10"
            >
              <RefreshCw size={13} />
              Segarkan Data
            </button>
          )}
        </div>
      </div>

      {/* 2. Operational KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Tiket Perbaikan Aktif</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <Wrench size={16} />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 font-display">
            {openMaintenanceCount} <span className="text-xs font-normal text-slate-500">tiket aktif</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {roomsInMaintenance} unit kamar sedang diperbaiki
          </p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Pengajuan Kas Kecil</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Wallet size={16} />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 font-display">
            {pendingPettyCash.length} <span className="text-xs font-normal text-slate-500">menunggu admin</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 font-mono">
            Total: {formatRupiah(totalPendingPettyAmount)}
          </p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Turnover & Kebersihan</span>
            <div className="p-2 bg-teal-50 text-teal-600 rounded-xl">
              <BedDouble size={16} />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 font-display">
            {roomsCleaning} <span className="text-xs font-normal text-slate-500">unit dibersihkan</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Persiapan unit untuk tenant berikutnya
          </p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Log Lapangan Terkoneksi</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <ShieldCheck size={16} />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-600 font-display">
            {staffLogs.length} <span className="text-xs font-normal text-slate-500">aktivitas staf</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Sinkronisasi audit trail 100% realtime
          </p>
        </div>

      </div>

      {/* 3. Main Operational Content (Two Columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column (7 Cols): Catatan Serah Terima Shift & Log Harian Staf */}
        <div className="lg:col-span-7 bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3.5">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 font-display">
                <MessageSquare size={16} className="text-teal-600" />
                Catatan Serah Terima Shift & Laporan Staf
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Pesan operasional, catatan serah terima kunci, dan update harian yang diinput staf admin.
              </p>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {[
                { id: 'all', label: 'Semua' },
                { id: 'shift', label: 'Shift Handover' },
                { id: 'maintenance', label: 'Perbaikan' },
                { id: 'petty', label: 'Kas Kecil' },
                { id: 'checkin', label: 'Check-In/Out' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilterType(f.id as any)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                    filterType === f.id
                      ? 'bg-teal-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Logs Stream */}
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
            {staffLogs.length === 0 ? (
              <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <MessageSquare size={32} className="mx-auto mb-2 opacity-30 text-slate-400" />
                <p className="text-xs font-bold text-slate-600">Belum ada catatan aktivitas staf lapangan</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Catatan serah terima shift atau aktivitas staf akan otomatis muncul di sini.</p>
              </div>
            ) : (
              staffLogs.map(log => {
                const isUrgent = log.action?.includes('URGENT');
                const isShift = log.action?.includes('SHIFT');
                const isMaintenance = log.action?.includes('MAINTENANCE');
                const isCheckIn = log.action?.includes('CHECK_IN');
                const isCheckOut = log.action?.includes('CHECK_OUT');

                return (
                  <div 
                    key={log.id} 
                    className={`p-4 rounded-2xl border transition-all ${
                      isUrgent 
                        ? 'bg-red-50/70 border-red-200 shadow-xs' 
                        : isShift 
                        ? 'bg-teal-50/50 border-teal-200' 
                        : 'bg-slate-50/70 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-xs text-slate-900">
                          {log.admin_name || 'Staff Lapangan'}
                        </span>
                        <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                          isUrgent
                            ? 'bg-red-600 text-white'
                            : isShift
                            ? 'bg-teal-600 text-white'
                            : isMaintenance
                            ? 'bg-amber-600 text-white'
                            : isCheckIn
                            ? 'bg-emerald-600 text-white'
                            : isCheckOut
                            ? 'bg-purple-600 text-white'
                            : 'bg-slate-700 text-white'
                        }`}>
                          {log.action}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {log.created_at ? new Date(log.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : (log.time || 'Baru Saja')}
                      </span>
                    </div>

                    <p className="text-xs text-slate-700 leading-relaxed font-sans">
                      {log.detail}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column (5 Cols): Status Kerusakan Fasilitas & Tiket Lapangan */}
        <div className="lg:col-span-5 bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 gap-2">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 font-display">
                <Wrench size={16} className="text-amber-600" />
                Laporan Kerusakan & Perbaikan
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Keluhan unit yang dilaporkan staf operasional kos.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCreateMaintenanceModal(true)}
                className="px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-teal-700 text-xs font-bold rounded-lg border border-teal-200 flex items-center gap-1 transition-colors cursor-pointer"
                title="Tambah tiket perbaikan baru"
              >
                <Plus size={13} />
                <span>Catat Tiket</span>
              </button>
              <span className="text-xs font-black px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full font-mono">
                {filteredMaintenance.length}
              </span>
            </div>
          </div>

          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
            {filteredMaintenance.length === 0 ? (
              <div className="text-center py-10 text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <CheckCircle2 size={28} className="mx-auto mb-2 text-emerald-500 opacity-60" />
                <p className="text-xs font-bold text-slate-700">Tidak ada keluhan perbaikan fasilitas</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Seluruh unit kamar beroperasi normal.</p>
              </div>
            ) : (
              filteredMaintenance.slice(0, 10).map(ticket => (
                <div key={ticket.id} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-bold text-teal-700 font-mono bg-teal-100/60 px-1.5 py-0.5 rounded">
                          Kamar {ticket.room || 'Umum'}
                        </span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          ticket.priority === 'Critical' 
                            ? 'bg-rose-100 text-rose-700' 
                            : ticket.priority === 'High' 
                            ? 'bg-amber-100 text-amber-700' 
                            : 'bg-slate-150 text-slate-600'
                        }`}>
                          {ticket.priority}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-slate-800 mt-1">
                        {ticket.title}
                      </h4>
                    </div>
                    <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase shrink-0 ${
                      ticket.status === 'completed'
                        ? 'bg-emerald-100 text-emerald-800'
                        : ticket.status === 'in-progress'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {ticket.status === 'completed' ? 'Selesai' : ticket.status === 'in-progress' ? 'Dikerjakan' : 'Menunggu'}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-600 line-clamp-2">
                    {ticket.desc_field || 'Laporan operasional fasilitas staf'}
                  </p>

                  {/* Detail Nama Teknisi & Siapa yang Melaporkan */}
                  <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500 pt-2 border-t border-slate-200/60 bg-white/70 p-2 rounded-xl border border-slate-100">
                    <div>
                      <span className="text-[9px] text-slate-400 font-bold uppercase block font-sans">Teknisi:</span>
                      <strong className="text-slate-800 font-sans truncate block">{ticket.tech || 'Teknisi In-House'}</strong>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 font-bold uppercase block font-sans">Pelapor:</span>
                      <strong className="text-teal-700 font-sans truncate block">{ticket.reported_by || 'Staf Operasional'}</strong>
                    </div>
                  </div>

                  {/* Status Biaya & Sinkron Laporan Keuangan */}
                  <div className="flex items-center justify-between text-[11px] pt-1 px-1">
                    <span className="text-[10px] text-slate-400 font-mono">Tgl: {ticket.date}</span>
                    {Number(ticket.cost) > 0 ? (
                      <div className="text-right">
                        <span className="font-bold text-amber-700 text-xs font-mono">
                          Rp {Number(ticket.cost).toLocaleString('id-ID')}
                        </span>
                        <span className="ml-1 px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          Keuangan
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">Belum ada biaya perbaikan</span>
                    )}
                  </div>

                  {/* Action Buttons: Button Proses, Biaya, dan Selesai */}
                  <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/60 gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Button Proses */}
                      <button
                        disabled={ticket.status === 'in-progress' || isUpdatingStatusId === ticket.id}
                        onClick={() => handleUpdateMaintenanceStatus(ticket, 'in-progress')}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                          ticket.status === 'in-progress'
                            ? 'bg-blue-600 text-white cursor-default shadow-xs'
                            : 'bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs'
                        }`}
                        title="Klik untuk memproses perbaikan ini"
                      >
                        <Wrench size={11} />
                        <span>{ticket.status === 'in-progress' ? 'Diproses' : 'Proses'}</span>
                      </button>

                      {/* Button Input/Ubah Biaya */}
                      <button
                        onClick={() => {
                          setCostModalTicket(ticket);
                          setTicketCostInput(ticket.cost ? String(ticket.cost) : '');
                          setTicketCostPostToFinance(true);
                          setTicketCostCreditAccount(1010);
                        }}
                        className="px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 bg-white hover:bg-teal-50 text-teal-700 border border-teal-200 shadow-2xs transition-all cursor-pointer"
                        title="Input atau perbarui biaya perbaikan & otomatis catat ke laporan keuangan"
                      >
                        <DollarSign size={11} />
                        <span>{Number(ticket.cost) > 0 ? 'Biaya' : '+ Biaya'}</span>
                      </button>

                      {/* Button Selesai */}
                      <button
                        disabled={ticket.status === 'completed' || isUpdatingStatusId === ticket.id}
                        onClick={() => handleUpdateMaintenanceStatus(ticket, 'completed')}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                          ticket.status === 'completed'
                            ? 'bg-emerald-600 text-white cursor-default shadow-xs'
                            : 'bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs'
                        }`}
                        title="Klik jika perbaikan telah rampung"
                      >
                        <CheckCircle2 size={11} />
                        <span>{ticket.status === 'completed' ? 'Selesai' : 'Selesai'}</span>
                      </button>
                    </div>

                    <span className="text-[10px] text-slate-400 font-mono">
                      {ticket.date}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* 4. Bottom Section: Transparansi Pengajuan Kas Kecil Staf Lapangan */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 font-display">
              <Wallet size={16} className="text-blue-600" />
              Transparansi Pengajuan Kas Kecil & Belanja Operasional Staf
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Permohonan belanja darurat / operasional (bohlam, perlengkapan kebersihan, pulsa listrik) yang diajukan staf ke Super Admin.
            </p>
          </div>
          <span className="text-xs text-slate-500 font-mono">
            {filteredPettyCash.length} permohonan tercatat
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 uppercase text-[10px] font-mono tracking-wider">
                <th className="py-2.5 px-3">Tanggal</th>
                <th className="py-2.5 px-3">Pemohon (Staf)</th>
                <th className="py-2.5 px-3">Keperluan / Kebutuhan</th>
                <th className="py-2.5 px-3 text-right">Nominal</th>
                <th className="py-2.5 px-3 text-center">Status Otorisasi Super Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPettyCash.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 text-xs">
                    Belum ada pengajuan kas kecil dari staf lapangan.
                  </td>
                </tr>
              ) : (
                filteredPettyCash.slice(0, 10).map(p => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                      {p.date || 'Hari ini'}
                    </td>
                    <td className="py-3 px-3 font-bold text-slate-800">
                      {p.applicant || 'Staff Admin'}
                    </td>
                    <td className="py-3 px-3 text-slate-700">
                      {p.purpose}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                      {formatRupiah(p.amount)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                        p.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : p.status === 'rejected'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {p.status === 'approved' && <Check size={11} />}
                        {p.status === 'rejected' && <X size={11} />}
                        {p.status === 'pending' && <Clock size={11} />}
                        {p.status === 'approved' ? 'Disetujui Admin' : p.status === 'rejected' ? 'Ditolak Admin' : 'Menunggu Approval'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Catat Tiket Perbaikan Baru */}
      {showCreateMaintenanceModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-150 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 font-display flex items-center gap-2">
                  <Wrench size={18} className="text-teal-600" />
                  Catat Tiket Perbaikan Fasilitas
                </h3>
                <p className="text-xs text-slate-500">
                  Form registrasi keluhan unit dan penugasan teknisi.
                </p>
              </div>
              <button
                onClick={() => setShowCreateMaintenanceModal(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateMaintenance} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Gedung Kos
                </label>
                <select
                  value={maintenanceForm.property_id}
                  onChange={(e) => setMaintenanceForm({ ...maintenanceForm, property_id: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 outline-none focus:border-teal-500"
                >
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                    Nomor Kamar
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="contoh: 101"
                    value={maintenanceForm.room}
                    onChange={(e) => setMaintenanceForm({ ...maintenanceForm, room: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                    Prioritas
                  </label>
                  <select
                    value={maintenanceForm.priority}
                    onChange={(e) => setMaintenanceForm({ ...maintenanceForm, priority: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 outline-none focus:border-teal-500"
                  >
                    <option value="Normal">Normal</option>
                    <option value="High">Tinggi (High)</option>
                    <option value="Critical">Mendesak (Critical)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Judul Keluhan / Masalah
                </label>
                <input
                  type="text"
                  required
                  placeholder="contoh: AC Tidak Dingin / Kran Air Bocor"
                  value={maintenanceForm.title}
                  onChange={(e) => setMaintenanceForm({ ...maintenanceForm, title: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                    Nama Teknisi
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="contoh: Pak Bambang (AC) / Teknisi In-House"
                    value={maintenanceForm.tech}
                    onChange={(e) => setMaintenanceForm({ ...maintenanceForm, tech: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                    Siapa yang Melaporkan
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="contoh: Penghuni Kmr 101 / Staf Shift Pagi"
                    value={maintenanceForm.reported_by}
                    onChange={(e) => setMaintenanceForm({ ...maintenanceForm, reported_by: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Keterangan Tambahan
                </label>
                <textarea
                  rows={3}
                  placeholder="Rincian masalah atau catatan pekerjaan..."
                  value={maintenanceForm.desc_field}
                  onChange={(e) => setMaintenanceForm({ ...maintenanceForm, desc_field: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 outline-none focus:border-teal-500 resize-none"
                />
              </div>

              {/* Biaya Perbaikan (Opsional) & Sinkron Laporan Keuangan */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-teal-700 uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <DollarSign size={13} className="text-teal-600" />
                    <span>Biaya Perbaikan / Sparepart (Opsional)</span>
                  </label>
                  <span className="text-[10px] text-slate-500">Kosongkan jika belum diketahui / gratis</span>
                </div>

                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 font-mono">
                    Rp
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    placeholder="0 (Contoh: 150000)"
                    value={maintenanceForm.cost}
                    onChange={(e) => setMaintenanceForm({ ...maintenanceForm, cost: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-3 text-slate-800 text-xs font-mono outline-none focus:border-teal-500"
                  />
                </div>

                {Number(maintenanceForm.cost) > 0 && (
                  <div className="space-y-2.5 pt-2 border-t border-slate-200">
                    <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={maintenanceForm.post_to_finance}
                        onChange={(e) => setMaintenanceForm({ ...maintenanceForm, post_to_finance: e.target.checked })}
                        className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500 bg-white"
                      />
                      <span>
                        <strong className="text-teal-700">Otomatis Catat ke Laporan Keuangan</strong>
                        <span className="block text-[11px] text-slate-500 mt-0.5">
                          Masuk sebagai Beban Pemeliharaan & Perbaikan (Akun 5100) di Laporan Laba Rugi & Buku Besar
                        </span>
                      </span>
                    </label>

                    {maintenanceForm.post_to_finance && (
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider font-mono mb-1">
                          Sumber Dana Pengeluaran (Kredit)
                        </label>
                        <select
                          value={maintenanceForm.credit_account_id}
                          onChange={(e) => setMaintenanceForm({ ...maintenanceForm, credit_account_id: Number(e.target.value) })}
                          className="w-full bg-white border border-slate-200 rounded-xl p-2 text-slate-800 text-xs outline-none focus:border-teal-500"
                        >
                          <option value={1010}>Kas Operasional Kos (1010)</option>
                          <option value={1020}>Bank Mandiri Utama (1020)</option>
                          <option value={1030}>Kas Kecil / Petty Cash (1030)</option>
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateMaintenanceModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-500 hover:text-slate-800 font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingMaintenance}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingMaintenance ? 'Menyimpan...' : 'Simpan Tiket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: INPUT / UPDATE BIAYA PERBAIKAN & LAPORAN KEUANGAN */}
      {costModalTicket && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md space-y-4 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 font-display flex items-center gap-2">
                  <DollarSign size={18} className="text-teal-600" />
                  <span>Biaya Perbaikan & Laporan Keuangan</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Kamar {costModalTicket.room} — {costModalTicket.title}
                </p>
              </div>
              <button
                onClick={() => setCostModalTicket(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveTicketCost} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono mb-1">
                  Nominal Biaya Perbaikan (Rp)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 font-mono">
                    Rp
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    required
                    placeholder="Contoh: 250000"
                    value={ticketCostInput}
                    onChange={(e) => setTicketCostInput(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-3 text-slate-900 text-sm font-mono font-bold outline-none focus:border-teal-500"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Isi nominal biaya teknisi / suku cadang yang dikeluarkan untuk unit ini.
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-2.5">
                <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={ticketCostPostToFinance}
                    onChange={(e) => setTicketCostPostToFinance(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500 bg-white"
                  />
                  <span>
                    <strong className="text-teal-700">Otomatis Masuk Laporan Keuangan</strong>
                    <span className="block text-[11px] text-slate-500 mt-0.5">
                      Tercatat langsung di Laporan Laba Rugi, Buku Besar, dan Jurnal Umum (Beban Perbaikan 5100).
                    </span>
                  </span>
                </label>

                {ticketCostPostToFinance && Number(ticketCostInput) > 0 && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider font-mono mb-1">
                      Akun Sumber Pengeluaran
                    </label>
                    <select
                      value={ticketCostCreditAccount}
                      onChange={(e) => setTicketCostCreditAccount(Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2 text-slate-800 text-xs outline-none focus:border-teal-500"
                    >
                      <option value={1010}>Kas Operasional Kos (1010)</option>
                      <option value={1020}>Bank Mandiri Utama (1020)</option>
                      <option value={1030}>Kas Kecil / Petty Cash (1030)</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCostModalTicket(null)}
                  className="px-4 py-2 rounded-xl text-slate-500 hover:text-slate-800 font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCost}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingCost ? 'Menyimpan...' : 'Simpan & Sinkron Keuangan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
