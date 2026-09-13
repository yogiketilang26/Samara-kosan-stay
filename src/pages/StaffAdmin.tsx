import React, { useState, useMemo } from 'react';
import { 
  Building2, Bed, CheckCircle2, Clock, AlertTriangle, Wrench, 
  Key, Phone, UserCheck, Plus, Search, Filter, Calendar, 
  FileText, RefreshCw, MessageSquare, Send, Check, X, 
  ExternalLink, Sparkles, UserX, AlertCircle, ArrowUpRight,
  ChevronRight, ArrowRightLeft, Brush, DoorOpen, Shield,
  Wallet, ShieldCheck, Megaphone, Radio
} from 'lucide-react';
import { useRealtimeTable } from '../hooks/useRealtimeTable';
import { database } from '../lib/supabase';
import { Room, Tenant, Survey, Maintenance, Property, ContractExtension, PettyCashRequest, ActivityLog } from '../types';
import { useAuth } from '../hooks/useAuth';
import { formatRupiah } from '../utils/formatCurrency';

export default function StaffAdmin() {
  const { user } = useAuth();

  // 1. Live Realtime Data Subscriptions
  const { data: properties = [] } = useRealtimeTable<Property>('properties', () => database.fetchProperties());
  const { data: rooms = [], refetch: refetchRooms } = useRealtimeTable<Room>('rooms', () => database.fetchRooms());
  const { data: tenants = [], refetch: refetchTenants } = useRealtimeTable<Tenant>('tenants', () => database.fetchTenants());
  const { data: surveys = [], refetch: refetchSurveys } = useRealtimeTable<Survey>('surveys', () => database.fetchSurveys());
  const { data: maintenanceList = [], refetch: refetchMaintenance } = useRealtimeTable<Maintenance>('maintenance', () => database.fetchMaintenance());
  const { data: extensions = [], refetch: refetchExtensions } = useRealtimeTable<ContractExtension>('contract_extensions', () => database.fetchContractExtensions());
  const { data: pettyCashList = [], refetch: refetchPettyCash } = useRealtimeTable<PettyCashRequest>('petty_cash_requests', () => database.fetchPettyCashRequests());
  const { data: activityLogs = [], refetch: refetchActivityLogs } = useRealtimeTable<ActivityLog>('activity_logs', () => database.fetchActivityLogs({ limit: 100 }));

  // 2. Local Navigation & Filtering States
  const [activeTab, setActiveTab] = useState<'rooms' | 'surveys' | 'tenants' | 'maintenance' | 'petty_cash' | 'shift_log'>('rooms');
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('all');
  const [roomFilterStatus, setRoomFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // 3. Operational Modals State
  // Modal: Change Room Status
  const [selectedRoomForStatus, setSelectedRoomForStatus] = useState<Room | null>(null);
  const [newRoomStatus, setNewRoomStatus] = useState<string>('available');

  // Modal: Maintenance Ticket
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [maintenanceForm, setMaintenanceForm] = useState({
    property_id: properties[0]?.id || 1,
    room: '',
    title: '',
    priority: 'Normal' as 'Normal' | 'High' | 'Critical',
    desc_field: '',
    tech: 'Teknisi In-House'
  });

  // Modal: Contract Extension
  const [showExtensionModal, setShowExtensionModal] = useState(false);
  const [selectedTenantForExtension, setSelectedTenantForExtension] = useState<Tenant | null>(null);
  const [extensionMonths, setExtensionMonths] = useState(1);
  const [extensionMonthlyRate, setExtensionMonthlyRate] = useState(1500000);
  const [extensionPaymentMethod, setExtensionPaymentMethod] = useState<'Tunai' | 'Transfer Bank' | 'Midtrans SNAP'>('Tunai');
  const [extensionNotes, setExtensionNotes] = useState('');
  const [isSubmittingExtension, setIsSubmittingExtension] = useState(false);

  // Modal: Check-In Form
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [selectedRoomForCheckIn, setSelectedRoomForCheckIn] = useState<Room | null>(null);
  const [checkInForm, setCheckInForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    nik: '',
    duration_months: 1,
    key_received: true,
    smartcard_given: true,
    room_inspection_done: true,
    notes: 'Kunci fisik & smart card diserahkan saat check-in.'
  });

  // Modal: Check-Out Form
  const [showCheckOutModal, setShowCheckOutModal] = useState(false);
  const [selectedTenantForCheckOut, setSelectedTenantForCheckOut] = useState<Tenant | null>(null);
  const [checkOutForm, setCheckOutForm] = useState({
    key_returned: true,
    smartcard_returned: true,
    room_condition: 'bersih', // 'bersih' | 'rusak_ringan' | 'perlu_perbaikan'
    notes: 'Penghuni telah mengembalikan kunci unit.'
  });

  // Modal: Petty Cash Request
  const [showPettyCashModal, setShowPettyCashModal] = useState(false);
  const [pettyCashForm, setPettyCashForm] = useState({
    amount: '',
    purpose: '',
    date: new Date().toISOString().split('T')[0]
  });
  const [isSubmittingPetty, setIsSubmittingPetty] = useState(false);

  // Modal: Urgent Memo to Super Admin & Owner
  const [showUrgentMemoModal, setShowUrgentMemoModal] = useState(false);
  const [urgentMemoForm, setUrgentMemoForm] = useState({
    title: '',
    detail: '',
    severity: 'high' as 'high' | 'critical'
  });
  const [isSendingMemo, setIsSendingMemo] = useState(false);

  // Shift Log (Handover Notes) Stored in Local State with Timestamp
  const [shiftLogs, setShiftLogs] = useState<{ id: string; author: string; time: string; text: string; urgent: boolean }[]>([
    {
      id: 'log-1',
      author: 'Ahmad (Staff Pagi)',
      time: 'Hari ini, 08:30 WIB',
      text: 'Semua kunci master kamar lantai 1 & 2 lengkap di meja resepsionis. Tamu survey kamar 204 dijadwalkan jam 11:00.',
      urgent: false
    },
    {
      id: 'log-2',
      author: 'Siti (Staff Sore)',
      time: 'Hari ini, 12:45 WIB',
      text: 'AC kamar 105 sudah dicek teknisi, freon sudah diisi ulang dan berfungsi normal.',
      urgent: false
    }
  ]);
  const [newLogText, setNewLogText] = useState('');
  const [newLogUrgent, setNewLogUrgent] = useState(false);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetchRooms(),
        refetchTenants(),
        refetchSurveys(),
        refetchMaintenance(),
        refetchExtensions(),
        refetchPettyCash(),
        refetchActivityLogs()
      ]);
      showToast('Data operasional staf, kas kecil, & log berhasil disinkronkan.');
    } catch (e) {
      showToast('Gagal memuat ulang data.', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Filtered Properties & Rooms
  const filteredRooms = useMemo(() => {
    return rooms.filter(room => {
      const matchProp = selectedPropertyId === 'all' || String(room.property_id) === String(selectedPropertyId);
      const matchStatus = roomFilterStatus === 'all' || room.status === roomFilterStatus;
      const matchSearch = !searchQuery || 
        room.room_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (room.current_tenant_name && room.current_tenant_name.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchProp && matchStatus && matchSearch;
    });
  }, [rooms, selectedPropertyId, roomFilterStatus, searchQuery]);

  // Operational Room Counts
  const roomMetrics = useMemo(() => {
    const scopeRooms = selectedPropertyId === 'all' 
      ? rooms 
      : rooms.filter(r => String(r.property_id) === String(selectedPropertyId));

    const total = scopeRooms.length;
    const occupied = scopeRooms.filter(r => r.status === 'occupied').length;
    const available = scopeRooms.filter(r => r.status === 'available').length;
    const maintenance = scopeRooms.filter(r => r.status === 'maintenance').length;
    const cleaning = scopeRooms.filter(r => (r.status as any) === 'cleaning' || (r.status as any) === 'reserved').length;
    const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0;

    return { total, occupied, available, maintenance, cleaning, occupancyRate };
  }, [rooms, selectedPropertyId]);

  // Filtered Surveys
  const filteredSurveys = useMemo(() => {
    return surveys.filter(s => {
      const matchProp = selectedPropertyId === 'all' || String(s.property_id) === String(selectedPropertyId);
      const matchSearch = !searchQuery || 
        s.tenant_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.phone.includes(searchQuery) ||
        (s.room_number && s.room_number.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchProp && matchSearch;
    });
  }, [surveys, selectedPropertyId, searchQuery]);

  // Filtered Tenants
  const filteredTenants = useMemo(() => {
    return tenants.filter(t => {
      const matchProp = selectedPropertyId === 'all' || String(t.property_id) === String(selectedPropertyId);
      const matchSearch = !searchQuery || 
        t.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.phone.includes(searchQuery) ||
        t.room_number.toLowerCase().includes(searchQuery.toLowerCase());
      return matchProp && matchSearch;
    });
  }, [tenants, selectedPropertyId, searchQuery]);

  // Filtered Maintenance Tickets
  const filteredMaintenance = useMemo(() => {
    return maintenanceList.filter(m => {
      const matchProp = selectedPropertyId === 'all' || String(m.property_id) === String(selectedPropertyId);
      const matchSearch = !searchQuery || 
        m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.room.toLowerCase().includes(searchQuery.toLowerCase());
      return matchProp && matchSearch;
    });
  }, [maintenanceList, selectedPropertyId, searchQuery]);

  // Open WhatsApp Helper
  const handleOpenWhatsApp = (rawPhone: string, defaultMsg: string = '') => {
    let clean = (rawPhone || '').replace(/\D/g, '');
    if (clean.startsWith('0')) {
      clean = '62' + clean.slice(1);
    } else if (!clean.startsWith('62') && clean.length > 5) {
      clean = '62' + clean;
    }
    const url = `https://wa.me/${clean}?text=${encodeURIComponent(defaultMsg)}`;
    window.open(url, '_blank');
  };

  // Quick Room Status Update
  const handleUpdateRoomStatus = async () => {
    if (!selectedRoomForStatus) return;
    try {
      const updated = { ...selectedRoomForStatus, status: newRoomStatus as any };
      await database.saveRoom(updated);
      await database.logActivity(
        user?.name || 'Staff Lapangan',
        'UPDATE_ROOM_STATUS',
        `Kamar ${selectedRoomForStatus.room_number}: Status diperbarui menjadi "${newRoomStatus}"`
      );
      showToast(`Status Kamar ${selectedRoomForStatus.room_number} diubah menjadi "${newRoomStatus}".`);
      setSelectedRoomForStatus(null);
      await Promise.all([refetchRooms(), refetchActivityLogs()]);
    } catch (err: any) {
      showToast(err.message || 'Gagal mengubah status kamar.', 'error');
    }
  };

  // Submit New Maintenance Ticket
  const handleCreateMaintenanceTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!maintenanceForm.room || !maintenanceForm.title) {
      showToast('Nomor kamar dan keluhan wajib diisi.', 'error');
      return;
    }

    try {
      const newTicket: Partial<Maintenance> = {
        property_id: Number(maintenanceForm.property_id),
        room: maintenanceForm.room.trim(),
        title: maintenanceForm.title.trim(),
        priority: maintenanceForm.priority,
        desc_field: maintenanceForm.desc_field.trim() || 'Laporan operasional staf kos',
        tech: maintenanceForm.tech.trim() || 'Teknisi In-House',
        cost: 0,
        status: 'open',
        date: new Date().toISOString().split('T')[0]
      };

      await database.saveMaintenance(newTicket);
      await database.logActivity(
        user?.name || 'Staff Lapangan',
        'CREATE_MAINTENANCE',
        `Tiket Perbaikan Kamar ${maintenanceForm.room}: ${maintenanceForm.title} (Prioritas: ${maintenanceForm.priority})`
      );
      showToast(`Tiket perbaikan untuk Kamar ${maintenanceForm.room} berhasil dicatat.`);
      setShowMaintenanceModal(false);
      setMaintenanceForm({
        property_id: properties[0]?.id || 1,
        room: '',
        title: '',
        priority: 'Normal',
        desc_field: '',
        tech: 'Teknisi In-House'
      });
      await Promise.all([refetchMaintenance(), refetchActivityLogs()]);
    } catch (err: any) {
      showToast(err.message || 'Gagal membuat tiket perbaikan.', 'error');
    }
  };

  // Quick Update Maintenance Status
  const handleUpdateMaintenanceStatus = async (ticket: Maintenance, newStatus: 'open' | 'in-progress' | 'completed') => {
    try {
      await database.saveMaintenance({
        ...ticket,
        status: newStatus
      });
      await database.logActivity(
        user?.name || 'Staff Lapangan',
        'UPDATE_MAINTENANCE',
        `Status tiket perbaikan Kamar ${ticket.room} (${ticket.title}) diperbarui ke "${newStatus}"`
      );
      showToast(`Tiket ${ticket.title} diperbarui ke status "${newStatus}".`);
      await Promise.all([refetchMaintenance(), refetchActivityLogs()]);
    } catch (err: any) {
      showToast('Gagal memperbarui status perbaikan.', 'error');
    }
  };

  // Submit Contract Extension
  const handleSubmitExtension = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenantForExtension) return;

    setIsSubmittingExtension(true);
    try {
      const totalAmount = Number(extensionMonthlyRate) * Number(extensionMonths);
      const orderId = `EXT-${selectedTenantForExtension.id}-${Date.now()}`;

      await database.settleContractExtension({
        tenantId: selectedTenantForExtension.id,
        extensionMonths: Number(extensionMonths),
        totalAmount,
        paymentMethod: extensionPaymentMethod,
        midtransOrderId: orderId,
        notes: extensionNotes || `Perpanjangan sewa meja staf: ${extensionMonths} bulan`
      });

      await database.logActivity(
        user?.name || 'Staff Lapangan',
        'EXTEND_CONTRACT',
        `Perpanjangan sewa: ${selectedTenantForExtension.full_name} (${extensionMonths} bulan - Rp ${totalAmount.toLocaleString('id-ID')})`
      );

      showToast(`Perpanjangan kontrak penghuni ${selectedTenantForExtension.full_name} berhasil dicatat!`);
      setShowExtensionModal(false);
      await Promise.all([refetchTenants(), refetchExtensions(), refetchRooms(), refetchActivityLogs()]);
    } catch (err: any) {
      showToast(err.message || 'Gagal memproses perpanjangan kontrak.', 'error');
    } finally {
      setIsSubmittingExtension(false);
    }
  };

  // Submit Check-In
  const handleSubmitCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoomForCheckIn || !checkInForm.full_name || !checkInForm.phone) {
      showToast('Nama penghuni dan nomor HP wajib diisi.', 'error');
      return;
    }

    try {
      const propId = selectedRoomForCheckIn.property_id;
      const newTenant: Partial<Tenant> = {
        property_id: propId,
        room_number: selectedRoomForCheckIn.room_number,
        full_name: checkInForm.full_name.trim(),
        phone: checkInForm.phone.trim(),
        email: checkInForm.email.trim() || `${checkInForm.phone.trim()}@samarastay.co.id`,
        nik: checkInForm.nik.trim() || '3174092803930005',
        duration_months: Number(checkInForm.duration_months) || 1,
        start_date: new Date().toISOString().split('T')[0],
        status: 'active',
        payment_status: 'paid',
        job: 'Penghuni Kos'
      };

      await database.saveTenant(newTenant);
      
      // Update room status to occupied
      await database.saveRoom({
        ...selectedRoomForCheckIn,
        status: 'occupied',
        current_tenant_name: checkInForm.full_name.trim()
      });

      await database.logActivity(
        user?.name || 'Staff Lapangan',
        'CHECK_IN_TENANT',
        `Check-In Penghuni Baru: ${checkInForm.full_name} di Kamar ${selectedRoomForCheckIn.room_number}`
      );

      showToast(`Check-In berhasil! Kamar ${selectedRoomForCheckIn.room_number} kini terisi.`);
      setShowCheckInModal(false);
      await Promise.all([refetchRooms(), refetchTenants(), refetchActivityLogs()]);
    } catch (err: any) {
      showToast(err.message || 'Gagal memproses check-in.', 'error');
    }
  };

  // Submit Check-Out
  const handleSubmitCheckOut = async () => {
    if (!selectedTenantForCheckOut) return;

    try {
      // 1. Update tenant status to checkout
      await database.saveTenant({
        ...selectedTenantForCheckOut,
        status: 'checkout'
      });

      // 2. Find room and change status to 'available' or 'cleaning'
      const targetRoom = rooms.find(
        r => r.property_id === selectedTenantForCheckOut.property_id && 
             r.room_number === selectedTenantForCheckOut.room_number
      );

      if (targetRoom) {
        await database.saveRoom({
          ...targetRoom,
          status: 'available',
          current_tenant_name: ''
        });
      }

      await database.logActivity(
        user?.name || 'Staff Lapangan',
        'CHECK_OUT_TENANT',
        `Check-Out Penghuni: ${selectedTenantForCheckOut.full_name} dari Kamar ${selectedTenantForCheckOut.room_number}`
      );

      showToast(`Check-Out selesai untuk ${selectedTenantForCheckOut.full_name}. Kamar telah dikosongkan.`);
      setShowCheckOutModal(false);
      await Promise.all([refetchTenants(), refetchRooms(), refetchActivityLogs()]);
    } catch (err: any) {
      showToast(err.message || 'Gagal memproses check-out.', 'error');
    }
  };

  // Submit Petty Cash Request to Super Admin
  const handleSubmitPettyCash = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = Number(pettyCashForm.amount);
    if (!amountNum || amountNum <= 0 || !pettyCashForm.purpose.trim()) {
      showToast('Harap isi nominal dan rincian keperluan kas kecil.', 'error');
      return;
    }

    setIsSubmittingPetty(true);
    try {
      const applicantName = user?.name || user?.email?.split('@')[0] || 'Staff Lapangan';
      await database.savePettyCashRequest({
        applicant: applicantName,
        amount: amountNum,
        purpose: pettyCashForm.purpose.trim(),
        status: 'pending',
        date: pettyCashForm.date || new Date().toISOString().split('T')[0]
      });

      await database.logActivity(
        applicantName,
        'PETTY_CASH_REQUEST',
        `Pengajuan Kas Kecil Rp ${amountNum.toLocaleString('id-ID')} untuk ${pettyCashForm.purpose.trim()}`
      );

      showToast('Pengajuan kas kecil berhasil terkirim ke Super Admin!');
      setShowPettyCashModal(false);
      setPettyCashForm({
        amount: '',
        purpose: '',
        date: new Date().toISOString().split('T')[0]
      });
      await Promise.all([refetchPettyCash(), refetchActivityLogs()]);
    } catch (err: any) {
      showToast(err.message || 'Gagal mengirim pengajuan kas kecil.', 'error');
    } finally {
      setIsSubmittingPetty(false);
    }
  };

  // Submit Urgent Memo to Super Admin & Owner
  const handleSendUrgentMemo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urgentMemoForm.title.trim() || !urgentMemoForm.detail.trim()) {
      showToast('Judul dan pesan memo wajib diisi.', 'error');
      return;
    }

    setIsSendingMemo(true);
    try {
      const authorName = user?.name || user?.email?.split('@')[0] || 'Staff Lapangan';
      const actionType = urgentMemoForm.severity === 'critical' ? 'STAFF_MEMO_CRITICAL' : 'STAFF_MEMO_URGENT';
      const formattedLog = `[${urgentMemoForm.title.trim().toUpperCase()}] ${urgentMemoForm.detail.trim()}`;

      await database.logActivity(authorName, actionType, formattedLog);

      // Also append to shift logs for immediate visibility
      const newLog = {
        id: `memo-${Date.now()}`,
        author: `${authorName} (Memo Prioritas)`,
        time: `Hari ini, ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB`,
        text: formattedLog,
        urgent: true
      };
      setShiftLogs(prev => [newLog, ...prev]);

      showToast('Memo darurat berhasil disiarkan ke Super Admin & Owner!', 'success');
      setShowUrgentMemoModal(false);
      setUrgentMemoForm({
        title: '',
        detail: '',
        severity: 'high'
      });
      await refetchActivityLogs();
    } catch (err: any) {
      showToast(err.message || 'Gagal mengirim memo darurat.', 'error');
    } finally {
      setIsSendingMemo(false);
    }
  };

  // Add Shift Handover Log
  const handleAddShiftLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLogText.trim()) return;

    const authorName = user?.name || user?.email?.split('@')[0] || 'Staff Operasional';
    const actionTag = newLogUrgent ? 'STAFF_MEMO_URGENT' : 'STAFF_SHIFT_LOG';

    try {
      await database.logActivity(authorName, actionTag, newLogText.trim());
      await refetchActivityLogs();
    } catch (err) {
      console.warn('Logging activity failed:', err);
    }

    const newLog = {
      id: `log-${Date.now()}`,
      author: authorName,
      time: `Hari ini, ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB`,
      text: newLogText.trim(),
      urgent: newLogUrgent
    };

    setShiftLogs(prev => [newLog, ...prev]);
    setNewLogText('');
    setNewLogUrgent(false);
    showToast(newLogUrgent 
      ? 'Peringatan penting terkirim ke Super Admin & Owner!' 
      : 'Catatan shift berhasil ditambahkan dan tersinkron ke Super Admin & Owner.'
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-24">
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs font-semibold border backdrop-blur-md transition-all ${
          toastMessage.type === 'error'
            ? 'bg-rose-950/90 text-rose-200 border-rose-700/50'
            : toastMessage.type === 'info'
            ? 'bg-sky-950/90 text-sky-200 border-sky-700/50'
            : 'bg-emerald-950/90 text-emerald-200 border-emerald-700/50'
        }`}>
          {toastMessage.type === 'error' ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Top Header Banner */}
      <header className="bg-slate-900/90 border-b border-slate-800 sticky top-[57px] z-40 backdrop-blur-md px-4 lg:px-8 py-3.5 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400 shadow-sm">
              <Shield size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-white text-base tracking-tight font-display">PORTAL OPERASIONAL STAFF ADMIN</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  Front Office
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Pusat manajemen operasional unit kamar, resepsionis survey, check-in/out, dan tiket perbaikan harian
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Property Filter Dropdown */}
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300">
              <Building2 size={14} className="text-teal-400" />
              <select
                value={selectedPropertyId}
                onChange={(e) => setSelectedPropertyId(e.target.value)}
                className="bg-transparent border-none text-xs text-white font-medium focus:outline-none cursor-pointer pr-2"
              >
                <option value="all" className="bg-slate-900 text-white">Semua Gedung Kos</option>
                {properties.map(p => (
                  <option key={p.id} value={String(p.id)} className="bg-slate-900 text-white">
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Live Sync Status with Super Admin & Owner */}
            <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-teal-950/60 border border-teal-800/40 text-[11px] font-semibold text-teal-300">
              <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse"></span>
              <span>Terhubung ke Super Admin & Owner</span>
            </div>

            {/* Quick Action: Urgent Memo */}
            <button
              onClick={() => setShowUrgentMemoModal(true)}
              className="px-3 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
              title="Kirim peringatan darurat ke Super Admin & Owner"
            >
              <Megaphone size={13} />
              <span>Memo Darurat</span>
            </button>

            {/* Quick Action: Petty Cash */}
            <button
              onClick={() => setShowPettyCashModal(true)}
              className="px-3 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
              title="Ajukan kas kecil belanja operasional"
            >
              <Wallet size={13} />
              <span>Ajukan Kas Kecil</span>
            </button>

            {/* Sync Refresh Button */}
            <button
              onClick={handleRefreshAll}
              disabled={isRefreshing}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
              title="Perbarui seluruh data secara realtime"
            >
              <RefreshCw size={13} className={isRefreshing ? 'animate-spin text-teal-400' : ''} />
              <span className="hidden sm:inline">Sinkron Data</span>
            </button>

            {/* Quick Action: New Maintenance */}
            <button
              onClick={() => setShowMaintenanceModal(true)}
              className="px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
            >
              <Wrench size={13} />
              <span>Tiket Kerusakan</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 lg:px-8 pt-6 space-y-6">

        {/* Operational Metrics Cards */}
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Total Rooms */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">Total Kamar</span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-white font-display">{roomMetrics.total}</span>
              <span className="text-xs font-bold text-teal-400">{roomMetrics.occupancyRate}% Terisi</span>
            </div>
          </div>

          {/* Occupied */}
          <div className="bg-slate-900 border border-sky-900/40 rounded-2xl p-4 flex flex-col justify-between">
            <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider font-mono flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
              Terisi (Occupied)
            </span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-sky-200 font-display">{roomMetrics.occupied}</span>
              <span className="text-[11px] text-slate-400">Penghuni Aktif</span>
            </div>
          </div>

          {/* Available */}
          <div className="bg-slate-900 border border-emerald-900/40 rounded-2xl p-4 flex flex-col justify-between">
            <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider font-mono flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              Siap Huni
            </span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-emerald-200 font-display">{roomMetrics.available}</span>
              <span className="text-[11px] text-emerald-400 font-semibold">Tersedia</span>
            </div>
          </div>

          {/* Maintenance */}
          <div className="bg-slate-900 border border-amber-900/40 rounded-2xl p-4 flex flex-col justify-between">
            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider font-mono flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
              Perbaikan / Rusak
            </span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-amber-200 font-display">{roomMetrics.maintenance}</span>
              <span className="text-[11px] text-amber-400">Maintenance</span>
            </div>
          </div>

          {/* Cleaning / Reserved */}
          <div className="bg-slate-900 border border-purple-900/40 rounded-2xl p-4 flex flex-col justify-between">
            <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider font-mono flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
              Dibersihkan
            </span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-purple-200 font-display">{roomMetrics.cleaning}</span>
              <span className="text-[11px] text-purple-300">Siap Inspeksi</span>
            </div>
          </div>

          {/* Survey Today */}
          <div className="bg-slate-900 border border-teal-900/40 rounded-2xl p-4 flex flex-col justify-between">
            <span className="text-[11px] font-bold text-teal-400 uppercase tracking-wider font-mono flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400"></span>
              Jadwal Survey
            </span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-teal-200 font-display">{surveys.length}</span>
              <span className="text-[11px] text-slate-400">Calon Penyewa</span>
            </div>
          </div>
        </section>

        {/* Operational Navigation Tabs & Search Toolbar */}
        <section className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-2">
          {/* Sub Tabs */}
          <div className="flex flex-wrap items-center gap-1">
            <button
              onClick={() => setActiveTab('rooms')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'rooms'
                  ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Bed size={15} />
              <span>Status & Kontrol Kamar</span>
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-950/40 text-current font-black">
                {filteredRooms.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('surveys')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'surveys'
                  ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Calendar size={15} />
              <span>Buku Tamu Survey</span>
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-950/40 text-current font-black">
                {filteredSurveys.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('tenants')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'tenants'
                  ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <UserCheck size={15} />
              <span>Penghuni & Serah Kunci</span>
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-950/40 text-current font-black">
                {filteredTenants.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('maintenance')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'maintenance'
                  ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Wrench size={15} />
              <span>Laporan Kerusakan</span>
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-950/40 text-current font-black">
                {filteredMaintenance.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('petty_cash')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'petty_cash'
                  ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Wallet size={15} />
              <span>Kas Kecil & Belanja Staf</span>
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-950/40 text-current font-black">
                {pettyCashList.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('shift_log')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'shift_log'
                  ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <FileText size={15} />
              <span>Catatan Serah Terima Shift</span>
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-950/40 text-current font-black">
                {shiftLogs.length}
              </span>
            </button>
          </div>

          {/* Search Input */}
          <div className="relative w-full md:w-64">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari kamar / nama penghuni..."
              className="w-full h-9 bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-teal-500 font-medium"
            />
          </div>
        </section>

        {/* TAB 1: KONTROL & DENAH STATUS KAMAR */}
        {activeTab === 'rooms' && (
          <div className="space-y-4">
            {/* Status Filter Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: 'all', label: 'Semua Status' },
                  { id: 'available', label: 'Siap Huni (Available)', color: 'text-emerald-400' },
                  { id: 'occupied', label: 'Terisi (Occupied)', color: 'text-sky-400' },
                  { id: 'maintenance', label: 'Dalam Perbaikan', color: 'text-amber-400' },
                  { id: 'cleaning', label: 'Pembersihan / Kotor', color: 'text-purple-400' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setRoomFilterStatus(tab.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                      roomFilterStatus === tab.id
                        ? 'bg-slate-800 border-teal-500/50 text-white shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900'
                    }`}
                  >
                    <span className={tab.color || ''}>{tab.label}</span>
                  </button>
                ))}
              </div>

              <div className="text-xs text-slate-400">
                Menampilkan <strong className="text-white">{filteredRooms.length}</strong> unit kamar
              </div>
            </div>

            {/* Room Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredRooms.map(room => {
                const propertyName = properties.find(p => p.id === room.property_id)?.name || 'Samara Stay';
                const isOccupied = room.status === 'occupied';
                const isAvailable = room.status === 'available';
                const isMaintenance = room.status === 'maintenance';
                const isCleaning = (room.status as any) === 'cleaning';

                // Find active tenant in this room
                const tenantInRoom = tenants.find(
                  t => t.property_id === room.property_id && 
                       t.room_number.toLowerCase() === room.room_number.toLowerCase() &&
                       t.status === 'active'
                );

                return (
                  <div 
                    key={room.id}
                    className={`bg-slate-900 rounded-2xl border p-4 flex flex-col justify-between transition-all duration-200 hover:border-slate-700 shadow-lg ${
                      isOccupied 
                        ? 'border-sky-900/50' 
                        : isAvailable 
                        ? 'border-emerald-900/50' 
                        : isMaintenance 
                        ? 'border-amber-900/50'
                        : 'border-purple-900/50'
                    }`}
                  >
                    <div>
                      {/* Card Header: Room Number & Status Badge */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-extrabold text-xl text-white font-display tracking-tight">
                              Kamar {room.room_number}
                            </h3>
                            <span className="text-[10px] text-slate-400 font-mono">
                              Lt. {room.floor || 1}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 truncate max-w-[170px] mt-0.5">
                            {propertyName}
                          </p>
                        </div>

                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                          isOccupied
                            ? 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                            : isAvailable
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : isMaintenance
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            : 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                        }`}>
                          {room.status === 'occupied' ? 'Terisi' : room.status === 'available' ? 'Siap Huni' : room.status === 'maintenance' ? 'Perbaikan' : 'Cleaning'}
                        </span>
                      </div>

                      {/* Room Occupant Information */}
                      <div className="mt-3.5 bg-slate-950 rounded-xl p-3 border border-slate-850 space-y-1.5 text-xs">
                        {isOccupied ? (
                          <>
                            <div className="flex items-center justify-between text-slate-300">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Penghuni:</span>
                              <span className="font-bold text-white truncate max-w-[120px]">
                                {room.current_tenant_name || tenantInRoom?.full_name || 'Penghuni Aktif'}
                              </span>
                            </div>

                            {tenantInRoom && (
                              <div className="flex items-center justify-between pt-1 border-t border-slate-900">
                                <span className="text-[10px] text-slate-400">Masa Sewa:</span>
                                <span className="font-mono text-[11px] text-teal-400">
                                  {tenantInRoom.duration_months} Bulan
                                </span>
                              </div>
                            )}

                            {tenantInRoom?.phone && (
                              <button
                                onClick={() => handleOpenWhatsApp(
                                  tenantInRoom.phone, 
                                  `Halo Kak ${tenantInRoom.full_name}, kami dari staf pengelola ${propertyName} mengonfirmasi terkait unit Kamar ${room.room_number}.`
                                )}
                                className="w-full mt-1.5 py-1.5 px-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-emerald-500/20"
                              >
                                <Phone size={11} />
                                <span>Hubungi WhatsApp</span>
                              </button>
                            )}
                          </>
                        ) : (
                          <div className="py-2 text-center text-slate-400">
                            <span className="text-xs font-medium">Unit kamar kosong / tidak ada penghuni</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Quick Operational Actions */}
                    <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                      {/* Change Status Button */}
                      <button
                        onClick={() => {
                          setSelectedRoomForStatus(room);
                          setNewRoomStatus(room.status);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer border border-slate-700"
                        title="Ubah status ketersediaan kamar"
                      >
                        <ArrowRightLeft size={11} />
                        <span>Status</span>
                      </button>

                      {/* Check-In / Check-Out Action */}
                      {isAvailable && (
                        <button
                          onClick={() => {
                            setSelectedRoomForCheckIn(room);
                            setCheckInForm({
                              full_name: '',
                              phone: '',
                              email: '',
                              nik: '',
                              duration_months: 1,
                              key_received: true,
                              smartcard_given: true,
                              room_inspection_done: true,
                              notes: 'Kunci fisik & smart card diserahkan saat check-in.'
                            });
                            setShowCheckInModal(true);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-sm"
                        >
                          <DoorOpen size={12} />
                          <span>Check-In</span>
                        </button>
                      )}

                      {isOccupied && tenantInRoom && (
                        <button
                          onClick={() => {
                            setSelectedTenantForCheckOut(tenantInRoom);
                            setShowCheckOutModal(true);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <UserX size={12} />
                          <span>Check-Out</span>
                        </button>
                      )}

                      {/* Report Damage */}
                      <button
                        onClick={() => {
                          setMaintenanceForm({
                            property_id: room.property_id,
                            room: room.room_number,
                            title: `Perbaikan Kamar ${room.room_number}`,
                            priority: 'Normal',
                            desc_field: '',
                            tech: 'Teknisi In-House'
                          });
                          setShowMaintenanceModal(true);
                        }}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-amber-500/20 text-slate-400 hover:text-amber-400 transition-colors cursor-pointer"
                        title="Laporkan kerusakan unit ini"
                      >
                        <Wrench size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: BUKU TAMU & JADWAL SURVEY */}
        {activeTab === 'surveys' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
            <div className="p-4 sm:p-6 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-white uppercase tracking-wider font-display flex items-center gap-2">
                  <Calendar size={18} className="text-teal-400" />
                  <span>Daftar Pemesan Jadwal Survey Kamar</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Verifikasi kedatangan tamu survey langsung di meja resepsionis kos
                </p>
              </div>

              <span className="text-xs text-slate-400">
                Total: <strong className="text-white">{filteredSurveys.length}</strong> Reservasi Survey
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 font-mono text-[11px] uppercase tracking-wider border-b border-slate-800">
                    <th className="py-3 px-4">Calon Penyewa</th>
                    <th className="py-3 px-4">Unit & Gedung</th>
                    <th className="py-3 px-4">Jadwal Kunjungan</th>
                    <th className="py-3 px-4">DP Survey</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Aksi Resepsionis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredSurveys.map(s => {
                    const propertyName = properties.find(p => p.id === s.property_id)?.name || 'Samara Stay';
                    const isPending = s.status === 'pending';
                    const isConfirmed = s.status === 'confirmed';
                    const isDone = s.status === 'done' || s.status === 'completed';

                    return (
                      <tr key={s.id} className="hover:bg-slate-850/50 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-white text-sm">{s.tenant_name}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{s.phone}</div>
                          {s.email && <div className="text-[10px] text-slate-400">{s.email}</div>}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-teal-300">Kamar {s.room_number || 'Sembarang'}</div>
                          <div className="text-[11px] text-slate-400">{propertyName}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-slate-200">{s.survey_date || 'Hari ini'}</div>
                          <div className="text-[11px] text-teal-400 font-mono">{s.survey_time_slot || 'Jam kerja'}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-mono font-bold text-slate-200">
                            {Number(s.dp_amount) > 0 ? `Rp ${Number(s.dp_amount).toLocaleString('id-ID')}` : 'Gratis'}
                          </div>
                          <div className="text-[10px] text-slate-400">{s.payment_method || 'Tanpa DP'}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                            isDone 
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : isConfirmed
                              ? 'bg-teal-500/10 text-teal-400 border-teal-500/30'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          }`}>
                            {s.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* WhatsApp Button */}
                            <button
                              onClick={() => handleOpenWhatsApp(
                                s.phone,
                                `Halo Kak ${s.tenant_name}, kami dari pengelola ${propertyName} mengonfirmasi jadwal survey kamar kos Anda pada ${s.survey_date} jam ${s.survey_time_slot}. Apakah jadwal tersebut sesuai?`
                              )}
                              className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-colors cursor-pointer"
                              title="Chat WhatsApp calon penyewa"
                            >
                              <Phone size={13} />
                            </button>

                            {/* Mark Confirmed / Done */}
                            {isPending && (
                              <button
                                onClick={async () => {
                                  await database.saveSurvey({ ...s, status: 'confirmed' });
                                  showToast(`Survey ${s.tenant_name} dikonfirmasi.`);
                                  await refetchSurveys();
                                }}
                                className="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold text-[11px] transition-colors cursor-pointer"
                              >
                                Konfirmasi
                              </button>
                            )}

                            {isConfirmed && (
                              <button
                                onClick={async () => {
                                  await database.saveSurvey({ ...s, status: 'completed' as any });
                                  showToast(`Survey ${s.tenant_name} ditandai selesai.`);
                                  await refetchSurveys();
                                }}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] transition-colors cursor-pointer"
                              >
                                Selesai
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {filteredSurveys.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        Tidak ada data jadwal survey saat ini.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: DAFTAR PENGHUNI & SERAH TERIMA KUNCI */}
        {activeTab === 'tenants' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
            <div className="p-4 sm:p-6 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-white uppercase tracking-wider font-display flex items-center gap-2">
                  <UserCheck size={18} className="text-teal-400" />
                  <span>Direktori Penghuni Kos Aktif</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Kontrol kontrak sewa, kontak darurat, check-in serah terima kunci, dan perpanjangan sewa
                </p>
              </div>

              <span className="text-xs text-slate-400">
                Total: <strong className="text-white">{filteredTenants.length}</strong> Penghuni
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 font-mono text-[11px] uppercase tracking-wider border-b border-slate-800">
                    <th className="py-3 px-4">Penghuni Kos</th>
                    <th className="py-3 px-4">Kamar & Gedung</th>
                    <th className="py-3 px-4">Masa Kontrak</th>
                    <th className="py-3 px-4">Status Pembayaran</th>
                    <th className="py-3 px-4 text-right">Aksi Operasional</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredTenants.map(t => {
                    const propertyName = properties.find(p => p.id === t.property_id)?.name || 'Samara Stay';
                    const isActive = t.status === 'active';

                    return (
                      <tr key={t.id} className="hover:bg-slate-850/50 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-white text-sm">{t.full_name}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{t.phone}</div>
                          {t.job && <div className="text-[10px] text-slate-400">{t.job}</div>}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-extrabold text-teal-300 text-sm">Kamar {t.room_number}</div>
                          <div className="text-[11px] text-slate-400">{propertyName}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-200">
                            Mulai: {t.start_date || 'Tidak tercatat'}
                          </div>
                          <div className="text-[11px] text-teal-400 font-mono">
                            Durasi: {t.duration_months} Bulan
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                            t.payment_status === 'paid'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          }`}>
                            {t.payment_status === 'paid' ? 'Lunas' : 'Tertunda'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* WhatsApp Button */}
                            <button
                              onClick={() => handleOpenWhatsApp(
                                t.phone,
                                `Halo Kak ${t.full_name}, kami dari staf pengelola Samara Stay Kamar ${t.room_number}. Ada yang bisa kami bantu mengenai kenyamanan hunian Anda?`
                              )}
                              className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-colors cursor-pointer"
                              title="Chat WhatsApp penghuni"
                            >
                              <Phone size={13} />
                            </button>

                            {/* Extension Button */}
                            <button
                              onClick={() => {
                                setSelectedTenantForExtension(t);
                                setExtensionMonths(1);
                                setExtensionMonthlyRate(1800000);
                                setShowExtensionModal(true);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold text-[11px] transition-colors cursor-pointer"
                            >
                              Perpanjang
                            </button>

                            {/* Check-Out Button */}
                            {isActive && (
                              <button
                                onClick={() => {
                                  setSelectedTenantForCheckOut(t);
                                  setShowCheckOutModal(true);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-900/40 text-rose-300 border border-slate-700 hover:border-rose-700/50 font-bold text-[11px] transition-colors cursor-pointer"
                              >
                                Check-Out
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {filteredTenants.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        Tidak ada data penghuni kos aktif yang cocok.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: LAPORAN KERUSAKAN & MAINTENANCE */}
        {activeTab === 'maintenance' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-black text-white uppercase tracking-wider font-display flex items-center gap-2">
                  <Wrench size={18} className="text-teal-400" />
                  <span>Tiket Pemeliharaan & Kerusakan Kamar</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Pantau dan perbarui keluhan fasilitas AC, listrik, air, dan sanitasi
                </p>
              </div>

              <button
                onClick={() => setShowMaintenanceModal(true)}
                className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-md"
              >
                <Plus size={14} />
                <span>Buat Tiket Baru</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMaintenance.map(item => {
                const propertyName = properties.find(p => p.id === item.property_id)?.name || 'Samara Stay';
                const isOpen = item.status === 'open';
                const isInProgress = item.status === 'in-progress';
                const isCompleted = item.status === 'completed';

                return (
                  <div 
                    key={item.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-lg hover:border-slate-700 transition-all"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                          item.priority === 'Critical'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            : item.priority === 'High'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            : 'bg-slate-800 text-slate-300 border-slate-700'
                        }`}>
                          Prioritas {item.priority}
                        </span>

                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                          isCompleted
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : isInProgress
                            ? 'bg-teal-500/10 text-teal-400 border-teal-500/30'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        }`}>
                          {item.status}
                        </span>
                      </div>

                      <h3 className="font-bold text-white text-base mt-2.5 font-display">{item.title}</h3>
                      <div className="flex items-center gap-2 text-xs text-teal-400 font-bold mt-1">
                        <span>Kamar {item.room}</span>
                        <span className="text-slate-600">•</span>
                        <span className="text-slate-400 font-normal">{propertyName}</span>
                      </div>

                      {item.desc_field && (
                        <p className="text-xs text-slate-300 mt-2 bg-slate-950 p-2.5 rounded-xl border border-slate-850 leading-relaxed">
                          {item.desc_field}
                        </p>
                      )}

                      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                        <span>Teknisi: <strong className="text-slate-200">{item.tech || 'In-House'}</strong></span>
                        <span>{item.date}</span>
                      </div>
                    </div>

                    {/* Maintenance Action Buttons */}
                    <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                      {isOpen && (
                        <button
                          onClick={() => handleUpdateMaintenanceStatus(item, 'in-progress')}
                          className="px-3 py-1.5 rounded-lg bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 border border-teal-600/30 text-xs font-bold transition-colors cursor-pointer"
                        >
                          Mulai Pengerjaan
                        </button>
                      )}

                      {isInProgress && (
                        <button
                          onClick={() => handleUpdateMaintenanceStatus(item, 'completed')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors cursor-pointer"
                        >
                          Selesai & Tutup Tiket
                        </button>
                      )}

                      {isCompleted && (
                        <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 size={13} />
                          <span>Telah Diperbaiki</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredMaintenance.length === 0 && (
                <div className="col-span-full py-12 text-center text-slate-400 bg-slate-900 border border-slate-800 rounded-3xl">
                  Tidak ada laporan kerusakan atau tiket maintenance aktif.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: BUKU LOG OPERASIONAL & SERAH TERIMA SHIFT */}
        {activeTab === 'shift_log' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Log Input Form */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
              <div>
                <h2 className="text-base font-black text-white uppercase tracking-wider font-display flex items-center gap-2">
                  <FileText size={18} className="text-teal-400" />
                  <span>Tambah Catatan Shift</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tuliskan pesan serah terima untuk staf jaga shift berikutnya
                </p>
              </div>

              <form onSubmit={handleAddShiftLog} className="space-y-3">
                <div>
                  <textarea
                    rows={4}
                    required
                    value={newLogText}
                    onChange={(e) => setNewLogText(e.target.value)}
                    placeholder="Tuliskan catatan kejadian penting, titipan paket penghuni, atau instruksi serah terima shift..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 outline-none focus:border-teal-500 resize-none font-medium leading-relaxed"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="urgent-log"
                    checked={newLogUrgent}
                    onChange={(e) => setNewLogUrgent(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-800 text-rose-500 focus:ring-rose-500/20 bg-slate-950 cursor-pointer"
                  />
                  <label htmlFor="urgent-log" className="text-xs font-bold text-rose-400 cursor-pointer">
                    Tandai Sebagai Instruksi Mendesak / Prioritas
                  </label>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-md"
                >
                  <Send size={13} />
                  <span>Simpan ke Buku Log Shift</span>
                </button>
              </form>
            </div>

            {/* Shift Logs Timeline List */}
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-black text-white uppercase tracking-wider font-display flex items-center gap-2">
                  <Radio size={16} className="text-teal-400 animate-pulse" />
                  <span>Riwayat Serah Terima Jaga & Memo Masuk</span>
                </h2>
                <span className="text-xs text-slate-400 font-mono">
                  {activityLogs.filter(l => l.action.includes('STAFF_') || l.action.includes('SHIFT') || l.action.includes('MEMO')).length + shiftLogs.length} Catatan Aktif
                </span>
              </div>

              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {/* Live Activity Logs with action matching shift/memo */}
                {activityLogs
                  .filter(l => l.action.includes('STAFF_') || l.action.includes('SHIFT') || l.action.includes('MEMO'))
                  .map(log => {
                    const isUrgent = log.action === 'STAFF_MEMO_URGENT' || log.action === 'STAFF_MEMO_CRITICAL';
                    return (
                      <div 
                        key={`act-${log.id}`}
                        className={`p-4 rounded-2xl border transition-all ${
                          isUrgent
                            ? 'bg-rose-950/30 border-rose-700/60 text-slate-100 shadow-lg'
                            : 'bg-slate-950/80 border-slate-800 text-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-xs">{log.user_name || 'Staff Lapangan'}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                              isUrgent 
                                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse' 
                                : 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
                            }`}>
                              {isUrgent ? 'URGENT MEMO' : 'LIVE SYNC'}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {new Date(log.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                          </span>
                        </div>
                        <p className="text-xs mt-2 leading-relaxed text-slate-200 font-medium">
                          {log.details}
                        </p>
                      </div>
                    );
                  })}

                {shiftLogs.map(log => (
                  <div 
                    key={log.id}
                    className={`p-4 rounded-2xl border transition-all ${
                      log.urgent
                        ? 'bg-rose-950/20 border-rose-800/40 text-slate-200'
                        : 'bg-slate-950 border-slate-800 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-xs">{log.author}</span>
                        {log.urgent && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/30">
                            Urgent
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">{log.time}</span>
                    </div>

                    <p className="text-xs mt-2 leading-relaxed text-slate-200 font-medium">
                      {log.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: KAS KECIL & BELANJA OPERASIONAL STAF */}
        {activeTab === 'petty_cash' && (
          <div className="space-y-6">
            {/* Header Banner */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 font-bold uppercase font-mono tracking-wider px-2.5 py-0.5 rounded-full">
                    Finance Integration
                  </span>
                </div>
                <h2 className="text-lg font-black text-white uppercase tracking-wider font-display mt-1 flex items-center gap-2">
                  <Wallet size={20} className="text-emerald-400" />
                  <span>Pengajuan Kas Kecil Staf & Biaya Operasional</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                  Ajukan dana kas kecil untuk pembelian darurat kos (lampu, kebersihan, servis cepat). Terhubung langsung ke <strong>Super Admin</strong> untuk persetujuan & pencatatan jurnal umum otomatis.
                </p>
              </div>

              <button
                onClick={() => setShowPettyCashModal(true)}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 transition-all shadow-md cursor-pointer shrink-0"
              >
                <Plus size={14} />
                <span>Buat Pengajuan Kas Kecil</span>
              </button>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Total Pengajuan</span>
                <div className="text-xl font-black text-white font-display mt-1">{pettyCashList.length}</div>
              </div>

              <div className="bg-slate-900 border border-amber-900/40 rounded-2xl p-4">
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                  Menunggu Persetujuan
                </span>
                <div className="text-xl font-black text-amber-300 font-display mt-1">
                  {pettyCashList.filter(r => r.status === 'pending').length}
                </div>
              </div>

              <div className="bg-slate-900 border border-emerald-900/40 rounded-2xl p-4">
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                  <CheckCircle2 size={12} />
                  Disetujui Super Admin
                </span>
                <div className="text-xl font-black text-emerald-300 font-display mt-1">
                  {pettyCashList.filter(r => r.status === 'approved').length}
                </div>
              </div>

              <div className="bg-slate-900 border border-teal-900/40 rounded-2xl p-4">
                <span className="text-[10px] font-bold text-teal-400 uppercase tracking-wider font-mono">Total Dana Disetujui</span>
                <div className="text-xl font-black text-teal-300 font-display mt-1">
                  {formatRupiah(pettyCashList.filter(r => r.status === 'approved').reduce((acc, c) => acc + (c.amount || 0), 0))}
                </div>
              </div>
            </div>

            {/* Requests Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
              <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
                <h3 className="text-sm font-bold text-white font-display">Daftar Pengajuan Kas Kecil Staf</h3>
                <span className="text-xs text-slate-400">Sinkronisasi Real-time dengan Supabase</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/60 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4 font-bold">ID / Tanggal</th>
                      <th className="py-3 px-4 font-bold">Pemohon</th>
                      <th className="py-3 px-4 font-bold">Keperluan Pengeluaran</th>
                      <th className="py-3 px-4 font-bold text-right">Nominal (Rp)</th>
                      <th className="py-3 px-4 font-bold text-center">Status Super Admin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium">
                    {pettyCashList.map(req => {
                      const isPending = req.status === 'pending';
                      const isApproved = req.status === 'approved';
                      const isRejected = req.status === 'rejected';

                      return (
                        <tr key={req.id} className="hover:bg-slate-850/50 transition-colors">
                          <td className="py-3.5 px-4 font-mono text-slate-400">
                            <span className="font-bold text-white">#{req.id}</span>
                            <span className="block text-[10px] text-slate-500">{req.date}</span>
                          </td>
                          <td className="py-3.5 px-4 font-bold text-slate-200">
                            {req.applicant}
                          </td>
                          <td className="py-3.5 px-4 text-slate-300">
                            {req.purpose}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-400">
                            {formatRupiah(req.amount)}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            {isPending && (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30 inline-flex items-center gap-1.5">
                                <Clock size={11} />
                                Menunggu Persetujuan
                              </span>
                            )}
                            {isApproved && (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 inline-flex items-center gap-1.5">
                                <CheckCircle2 size={11} />
                                Disetujui (Dana Siap)
                              </span>
                            )}
                            {isRejected && (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-300 border border-rose-500/30 inline-flex items-center gap-1.5">
                                <X size={11} />
                                Ditolak
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {pettyCashList.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500">
                          Belum ada pengajuan kas kecil saat ini. Klik "Buat Pengajuan Kas Kecil" untuk menambahkan.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* ========================================================================= */}
      {/* MODAL: CHANGE ROOM STATUS                                                 */}
      {/* ========================================================================= */}
      {selectedRoomForStatus && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white font-display">
                Ubah Status Kamar {selectedRoomForStatus.room_number}
              </h3>
              <button 
                onClick={() => setSelectedRoomForStatus(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider">
                Pilih Status Operasional:
              </label>
              {[
                { id: 'available', label: 'Siap Huni (Available)', desc: 'Kamar bersih dan siap ditempati penyewa baru' },
                { id: 'occupied', label: 'Terisi (Occupied)', desc: 'Kamar sedang disewa oleh penghuni kos' },
                { id: 'cleaning', label: 'Pembersihan (Cleaning)', desc: 'Kamar kotor dan perlu dibersihkan housekeeping' },
                { id: 'maintenance', label: 'Perbaikan (Maintenance)', desc: 'Fasilitas kamar sedang rusak/diperbaiki teknisi' }
              ].map(opt => (
                <label 
                  key={opt.id}
                  onClick={() => setNewRoomStatus(opt.id)}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    newRoomStatus === opt.id 
                      ? 'bg-teal-500/10 border-teal-500/40 text-white' 
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-850'
                  }`}
                >
                  <input 
                    type="radio" 
                    name="roomStatus" 
                    checked={newRoomStatus === opt.id} 
                    onChange={() => {}}
                    className="mt-0.5 text-teal-500" 
                  />
                  <div>
                    <div className="text-xs font-bold">{opt.label}</div>
                    <div className="text-[11px] text-slate-400">{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setSelectedRoomForStatus(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
              >
                Batal
              </button>
              <button
                onClick={handleUpdateRoomStatus}
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-md cursor-pointer"
              >
                Simpan Status
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE MAINTENANCE TICKET                                          */}
      {/* ========================================================================= */}
      {showMaintenanceModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white font-display flex items-center gap-2">
                <Wrench size={16} className="text-teal-400" />
                <span>Buat Tiket Kerusakan Fasilitas</span>
              </h3>
              <button 
                onClick={() => setShowMaintenanceModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateMaintenanceTicket} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-1">
                  Gedung Kos
                </label>
                <select
                  value={maintenanceForm.property_id}
                  onChange={(e) => setMaintenanceForm({ ...maintenanceForm, property_id: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none focus:border-teal-500"
                >
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-1">
                    Nomor Kamar
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="contoh: 101"
                    value={maintenanceForm.room}
                    onChange={(e) => setMaintenanceForm({ ...maintenanceForm, room: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-1">
                    Prioritas
                  </label>
                  <select
                    value={maintenanceForm.priority}
                    onChange={(e) => setMaintenanceForm({ ...maintenanceForm, priority: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none focus:border-teal-500"
                  >
                    <option value="Normal">Normal</option>
                    <option value="High">Tinggi (High)</option>
                    <option value="Critical">Mendesak (Critical)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-1">
                  Judul Keluhan / Masalah
                </label>
                <input
                  type="text"
                  required
                  placeholder="contoh: AC Tidak Dingin / Kran Air Patah"
                  value={maintenanceForm.title}
                  onChange={(e) => setMaintenanceForm({ ...maintenanceForm, title: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-1">
                  Keterangan Tambahan
                </label>
                <textarea
                  rows={3}
                  placeholder="Rincian kerusakan atau instruksi untuk teknisi..."
                  value={maintenanceForm.desc_field}
                  onChange={(e) => setMaintenanceForm({ ...maintenanceForm, desc_field: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none focus:border-teal-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowMaintenanceModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold shadow-md cursor-pointer"
                >
                  Catat Tiket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CONTRACT EXTENSION FORM                                            */}
      {/* ========================================================================= */}
      {showExtensionModal && selectedTenantForExtension && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white font-display">
                Perpanjang Kontrak Kamar {selectedTenantForExtension.room_number}
              </h3>
              <button 
                onClick={() => setShowExtensionModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-850 text-xs space-y-1">
              <div className="text-slate-400">Penghuni: <strong className="text-white">{selectedTenantForExtension.full_name}</strong></div>
              <div className="text-slate-400">Masa Sewa Saat Ini: <strong className="text-teal-400">{selectedTenantForExtension.duration_months} Bulan</strong></div>
            </div>

            <form onSubmit={handleSubmitExtension} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-1">
                    Durasi Perpanjangan
                  </label>
                  <select
                    value={extensionMonths}
                    onChange={(e) => setExtensionMonths(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none focus:border-teal-500"
                  >
                    <option value={1}>1 Bulan</option>
                    <option value={3}>3 Bulan</option>
                    <option value={6}>6 Bulan</option>
                    <option value={12}>12 Bulan (1 Tahun)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-1">
                    Tarif Bulanan (Rp)
                  </label>
                  <input
                    type="number"
                    value={extensionMonthlyRate}
                    onChange={(e) => setExtensionMonthlyRate(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none focus:border-teal-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-1">
                  Metode Pembayaran
                </label>
                <select
                  value={extensionPaymentMethod}
                  onChange={(e) => setExtensionPaymentMethod(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none focus:border-teal-500"
                >
                  <option value="Tunai">Tunai / Diterima Staf di Kasir</option>
                  <option value="Transfer Bank">Transfer Bank Manual</option>
                  <option value="Midtrans SNAP">Midtrans QRIS / Virtual Account</option>
                </select>
              </div>

              <div className="bg-teal-950/40 border border-teal-800/40 p-3 rounded-xl flex items-center justify-between font-mono">
                <span className="text-teal-300 font-bold">Total Pelunasan:</span>
                <span className="text-base font-black text-emerald-300">
                  Rp {(Number(extensionMonthlyRate) * Number(extensionMonths)).toLocaleString('id-ID')}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowExtensionModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingExtension}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold shadow-md cursor-pointer"
                >
                  {isSubmittingExtension ? 'Memproses...' : 'Konfirmasi Pelunasan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CHECK-IN FORM                                                      */}
      {/* ========================================================================= */}
      {showCheckInModal && selectedRoomForCheckIn && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white font-display flex items-center gap-2">
                <DoorOpen size={18} className="text-emerald-400" />
                <span>Form Check-In Kamar {selectedRoomForCheckIn.room_number}</span>
              </h3>
              <button 
                onClick={() => setShowCheckInModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitCheckIn} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-1">
                  Nama Lengkap Penghuni
                </label>
                <input
                  type="text"
                  required
                  placeholder="Nama sesuai KTP"
                  value={checkInForm.full_name}
                  onChange={(e) => setCheckInForm({ ...checkInForm, full_name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-1">
                    Nomor WhatsApp / HP
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="08xxxxxxxxxx"
                    value={checkInForm.phone}
                    onChange={(e) => setCheckInForm({ ...checkInForm, phone: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none focus:border-teal-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-1">
                    Durasi Sewa
                  </label>
                  <select
                    value={checkInForm.duration_months}
                    onChange={(e) => setCheckInForm({ ...checkInForm, duration_months: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none focus:border-teal-500"
                  >
                    <option value={1}>1 Bulan</option>
                    <option value={3}>3 Bulan</option>
                    <option value={6}>6 Bulan</option>
                    <option value={12}>12 Bulan</option>
                  </select>
                </div>
              </div>

              {/* Checklist Serah Terima Kunci */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-850 space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                  Checklist Serah Terima Fisik:
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={checkInForm.key_received}
                    onChange={(e) => setCheckInForm({ ...checkInForm, key_received: e.target.checked })}
                    className="w-4 h-4 rounded text-teal-500"
                  />
                  <span>Kunci fisik kamar telah diserahkan</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={checkInForm.smartcard_given}
                    onChange={(e) => setCheckInForm({ ...checkInForm, smartcard_given: e.target.checked })}
                    className="w-4 h-4 rounded text-teal-500"
                  />
                  <span>Smart Card / Akses pintu utama diserahkan</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={checkInForm.room_inspection_done}
                    onChange={(e) => setCheckInForm({ ...checkInForm, room_inspection_done: e.target.checked })}
                    className="w-4 h-4 rounded text-teal-500"
                  />
                  <span>Inspeksi kondisi kamar bersama penghuni OK</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCheckInModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-md cursor-pointer"
                >
                  Selesaikan Check-In
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CHECK-OUT CONFIRMATION                                             */}
      {/* ========================================================================= */}
      {showCheckOutModal && selectedTenantForCheckOut && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white font-display flex items-center gap-2">
                <UserX size={18} className="text-rose-400" />
                <span>Konfirmasi Check-Out Penghuni</span>
              </h3>
              <button 
                onClick={() => setShowCheckOutModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-850 text-xs space-y-1">
              <div className="text-slate-400">Penghuni: <strong className="text-white">{selectedTenantForCheckOut.full_name}</strong></div>
              <div className="text-slate-400">Unit: <strong className="text-teal-400">Kamar {selectedTenantForCheckOut.room_number}</strong></div>
            </div>

            <div className="space-y-2 text-xs">
              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={checkOutForm.key_returned}
                  onChange={(e) => setCheckOutForm({ ...checkOutForm, key_returned: e.target.checked })}
                  className="w-4 h-4 rounded text-teal-500"
                />
                <span>Kunci fisik & smart card telah dikembalikan lengkap</span>
              </label>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-1">
                  Kondisi Kamar Setelah Pengosongan:
                </label>
                <select
                  value={checkOutForm.room_condition}
                  onChange={(e) => setCheckOutForm({ ...checkOutForm, room_condition: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none focus:border-teal-500"
                >
                  <option value="bersih">Kamar Bersih & Rapi</option>
                  <option value="rusak_ringan">Perlu Pembersihan Housekeeping</option>
                  <option value="perlu_perbaikan">Ada Kerusakan Perlu Maintenance</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCheckOutModal(false)}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white font-bold"
              >
                Batal
              </button>
              <button
                onClick={handleSubmitCheckOut}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold shadow-md cursor-pointer"
              >
                Konfirmasi Check-Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: PETTY CASH REQUEST                                                 */}
      {/* ========================================================================= */}
      {showPettyCashModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white font-display flex items-center gap-2">
                <Wallet size={18} className="text-emerald-400" />
                <span>Pengajuan Kas Kecil Staf</span>
              </h3>
              <button 
                onClick={() => setShowPettyCashModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Formulir pengajuan dana belanja operasional mendesak. Data ini akan diteruskan ke <strong>Super Admin</strong> untuk persetujuan.
            </p>

            <form onSubmit={handleSubmitPettyCash} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-1">
                  Nominal Pengajuan (Rp):
                </label>
                <input
                  type="number"
                  required
                  min={1000}
                  step={1000}
                  value={pettyCashForm.amount}
                  onChange={(e) => setPettyCashForm({ ...pettyCashForm, amount: e.target.value })}
                  placeholder="Contoh: 150000"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-emerald-300 font-mono font-bold outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-1">
                  Rincian Keperluan Belanja:
                </label>
                <textarea
                  required
                  rows={3}
                  value={pettyCashForm.purpose}
                  onChange={(e) => setPettyCashForm({ ...pettyCashForm, purpose: e.target.value })}
                  placeholder="Contoh: Beli 4 pcs lampu bohlam LED untuk koridor lantai 2 & sabun pel lantai"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none focus:border-emerald-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-1">
                  Tanggal Pengajuan:
                </label>
                <input
                  type="date"
                  value={pettyCashForm.date}
                  onChange={(e) => setPettyCashForm({ ...pettyCashForm, date: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none focus:border-emerald-500"
                />
              </div>

              <div className="bg-emerald-950/30 border border-emerald-800/40 p-3 rounded-xl flex items-center gap-2 text-emerald-300 text-[11px]">
                <CheckCircle2 size={15} className="shrink-0" />
                <span>Pengajuan ini langsung terhubung secara realtime ke portal Super Admin.</span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPettyCashModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPetty}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  {isSubmittingPetty ? 'Mengirim...' : 'Kirim ke Super Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: URGENT MEMO TO SUPER ADMIN & OWNER                                 */}
      {/* ========================================================================= */}
      {showUrgentMemoModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-900/50 rounded-3xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white font-display flex items-center gap-2">
                <Megaphone size={18} className="text-rose-400" />
                <span>Siarkan Memo Darurat / Peringatan Staf</span>
              </h3>
              <button 
                onClick={() => setShowUrgentMemoModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Memo darurat ini akan langsung muncul di log aktivitas dan notifikasi <strong>Super Admin</strong> serta <strong>Owner</strong> secara instan.
            </p>

            <form onSubmit={handleSendUrgentMemo} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-1">
                  Tingkat Urgensi:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setUrgentMemoForm({ ...urgentMemoForm, severity: 'high' })}
                    className={`py-2 px-3 rounded-xl font-bold border transition-all text-center cursor-pointer ${
                      urgentMemoForm.severity === 'high'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    ⚠️ Prioritas Tinggi
                  </button>
                  <button
                    type="button"
                    onClick={() => setUrgentMemoForm({ ...urgentMemoForm, severity: 'critical' })}
                    className={`py-2 px-3 rounded-xl font-bold border transition-all text-center cursor-pointer ${
                      urgentMemoForm.severity === 'critical'
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    🚨 Sangat Kritis
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-1">
                  Judul Ringkas Memo:
                </label>
                <input
                  type="text"
                  required
                  value={urgentMemoForm.title}
                  onChange={(e) => setUrgentMemoForm({ ...urgentMemoForm, title: e.target.value })}
                  placeholder="Contoh: Pompa Air Utama Mati / Token Listrik Habis"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none focus:border-rose-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-1">
                  Keterangan Lengkap:
                </label>
                <textarea
                  required
                  rows={3}
                  value={urgentMemoForm.detail}
                  onChange={(e) => setUrgentMemoForm({ ...urgentMemoForm, detail: e.target.value })}
                  placeholder="Tuliskan detail kejadian, dampak bagi penghuni, dan tindakan sementara yang sudah diambil..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none focus:border-rose-500 font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUrgentMemoModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSendingMemo}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <Send size={13} />
                  <span>{isSendingMemo ? 'Menyiarkan...' : 'Siarkan Sekarang'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
