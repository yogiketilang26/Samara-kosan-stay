import React, { useState } from 'react';
import { 
  Users, Wrench, Wallet, AlertTriangle, CheckCircle2, Clock, 
  MessageSquare, ShieldCheck, BedDouble, Calendar, ArrowUpRight,
  Filter, Search, RefreshCw, Send, Check, X, Sparkles
} from 'lucide-react';
import { Maintenance, PettyCashRequest, ActivityLog, Property, Room } from '../../types';
import { formatRupiah } from '../../utils/formatCurrency';

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
          <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 font-display">
                <Wrench size={16} className="text-amber-600" />
                Laporan Kerusakan & Perbaikan
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Keluhan unit yang dilaporkan staf operasional kos.
              </p>
            </div>
            <span className="text-xs font-black px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full font-mono">
              {filteredMaintenance.length}
            </span>
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
                <div key={ticket.id} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-bold text-teal-700 font-mono bg-teal-100/60 px-1.5 py-0.5 rounded">
                        Kamar {ticket.room || 'Umum'}
                      </span>
                      <h4 className="text-xs font-bold text-slate-800 mt-1">
                        {ticket.title}
                      </h4>
                    </div>
                    <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase ${
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

                  <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1.5 border-t border-slate-200/60 font-mono">
                    <span>Teknisi: <strong className="text-slate-700 font-sans">{ticket.tech || 'In-House'}</strong></span>
                    <span>Biaya: <strong className="text-slate-800">{Number(ticket.cost) > 0 ? formatRupiah(ticket.cost) : 'Rp 0'}</strong></span>
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

    </div>
  );
};
