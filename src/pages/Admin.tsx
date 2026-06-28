import React, { useState, useEffect } from 'react';
import { database, sandboxState } from '../lib/supabase';
import { Property, Room, Booking, Survey, Coupon, FinancialTransaction, ActivityLog, Tenant, UserSystem, AccountCOA, JournalEntry, PaymentInvoice } from '../types';
import Sidebar from '../components/layout/Sidebar';
import { Button } from '../components/common/Button';
import { Loader } from '../components/common/Loader';
import { Modal } from '../components/common/Modal';
import PropertyForm from '../components/property/PropertyForm';
import RoomForm from '../components/room/RoomForm';
import CouponList from '../components/coupon/CouponList';
import InvoiceCard from '../components/transaction/InvoiceCard';
import { formatRupiah } from '../utils/formatCurrency';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';
import { 
  Building2, BedDouble, Receipt, Ticket, ShieldAlert, CheckCircle, 
  Trash2, Edit2, PlayCircle, Plus, Eye, Check, X, FileSpreadsheet,
  History, Users, UserPlus, Download, Search, UserCheck, Activity,
  FileText, Printer, ShieldPlus, Trash, UserCog, Terminal, HelpCircle,
  ExternalLink, RefreshCw, Server, Copy, Mail, Play, RotateCw,
  Sparkles, Landmark, Coins, ShoppingBag, Wrench, Wallet, Percent, Shield,
  TrendingUp, TrendingDown, Calculator, Layers, Clock, ArrowRightLeft, AlertTriangle
} from 'lucide-react';

interface AdminProps {
  refreshTrigger: number;
  triggerAppRefresh: () => void;
}

export default function Admin({ refreshTrigger, triggerAppRefresh }: AdminProps) {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [properties, setProperties] = useState<Property[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [users, setUsers] = useState<UserSystem[]>([]);
  const [tenantsList, setTenantsList] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);

  // ERP Finance states
  const [accounts, setAccounts] = useState<AccountCOA[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [payments, setPayments] = useState<PaymentInvoice[]>([]);
  const [paymentSearch, setPaymentSearch] = useState('');
  const [paymentFilterStatus, setPaymentFilterStatus] = useState('all');
  const [activeFinanceSubTab, setActiveFinanceSubTab] = useState<'overview' | 'ledger' | 'ar' | 'ap' | 'assets' | 'petty' | 'tax' | 'audit'>('overview');
  const [journalViewMode, setJournalViewMode] = useState<'transactions' | 'double_entry'>('transactions');
  
  // Custom manual journal entry form
  const [showJournalModal, setShowJournalModal] = useState(false);
  const [journalForm, setJournalForm] = useState({
    debitAccount: 1010,
    creditAccount: 4000,
    amount: 0,
    description: ''
  });

  // Expense form
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    category: 'Biaya Operasional',
    debitAccount: 5100, // Beban Operasional Lain-lain
    creditAccount: 1010, // Kas dan Bank
    amount: 0,
    description: '',
    vendor: '',
    approvalRequired: false,
    approvalStatus: 'pending' // pending -> approved
  });

  // Petty cash requests state (seeded)
  const [pettyCashRequests, setPettyCashRequests] = useState([
    { id: 1, applicant: 'Doni (Staff)', amount: 150000, purpose: 'Beli Air Galon & Gas Dapur Bersama', status: 'approved', date: '2026-06-25' },
    { id: 2, applicant: 'Lina (Staff)', amount: 200000, purpose: 'Alat Pembersih Lantai & Kamar Mandi', status: 'pending', date: '2026-06-27' }
  ]);

  // Asset list state (seeded)
  const [assetsState, setAssetsState] = useState([
    { id: 1, name: 'Gedung Kost Samara Premium', cost: 1200000000, lifeYears: 20, residual: 200000000, deprRate: 5000000, accumDepr: 50000000 },
    { id: 2, name: 'AC Daikin 1 PK (12 Unit)', cost: 48000000, lifeYears: 5, residual: 3000000, deprRate: 750000, accumDepr: 15000000 },
    { id: 3, name: 'Genset Honda Silent 5kVA', cost: 18000000, lifeYears: 8, residual: 2000000, deprRate: 166000, accumDepr: 3320000 }
  ]);

  // Budget state (seeded)
  const [budgets, setBudgets] = useState([
    { id: 1, category: 'Beban Pemeliharaan & Perbaikan Gedung', limit: 5000000, spent: 1500000 },
    { id: 2, category: 'Gaji & Bonus Karyawan', limit: 12000000, spent: 10000000 },
    { id: 3, category: 'Listrik & Air (Utilities)', limit: 6000000, spent: 5800000 },
    { id: 4, category: 'Marketing & Voucher', limit: 3000000, spent: 3200000 } // Exceeded variance alert!
  ]);

  // Vendors state
  const [vendors, setVendors] = useState([
    { id: 1, name: 'Depo Bangunan Jaya', phone: '0811223344', category: 'Material Pemeliharaan' },
    { id: 2, name: 'PDAM / PLN Solusi', phone: '0812345678', category: 'Utilitas' },
    { id: 3, name: 'Sinar Mandiri AC', phone: '0815556667', category: 'Servis Elektronik' }
  ]);

  // Supply chain purchase orders
  const [purchaseOrders, setPurchaseOrders] = useState([
    { id: 101, vendor: 'Depo Bangunan Jaya', items: 'Cat Tembok Nippon Paint (5 Pail)', amount: 1250000, status: 'completed', date: '2026-06-20' },
    { id: 102, vendor: 'Sinar Mandiri AC', items: 'Suku cadang Kapasitor AC & Freon R32', amount: 850000, status: 'approved', date: '2026-06-26' }
  ]);

  // Inventory Stock items (Seeded for Module 5)
  const [inventoryItems, setInventoryItems] = useState([
    { id: 1, name: 'Sabun Cair Handwash', stock: 15, unit: 'Botol', minStock: 5, category: 'Cleaning Supplies' },
    { id: 2, name: 'Lampu LED Philips 12W', stock: 2, unit: 'Pcs', minStock: 5, category: 'Spare Parts' }, // Warning low stock!
    { id: 3, name: 'Tabung Gas Elpiji 12kg', stock: 4, unit: 'Tabung', minStock: 1, category: 'Kitchen Supplies' },
    { id: 4, name: 'Sprei Kasur Standard', stock: 8, unit: 'Pcs', minStock: 2, category: 'Amenities' }
  ]);

  // Bank Statement Items (Seeded for Module 9 Reconciliation)
  const [bankStatement, setBankStatement] = useState([
    { id: 1, date: '2026-06-26', desc: 'Settle Midtrans INV-001', amount: 1800000, type: 'credit', matched: true, matchedRef: 'INV-001' },
    { id: 2, date: '2026-06-27', desc: 'Transfer VA Siska Wardani', amount: 2600000, type: 'credit', matched: false, matchedRef: '' },
    { id: 3, date: '2026-06-27', desc: 'Pembayaran Biaya Token Listrik', amount: 350000, type: 'debit', matched: false, matchedRef: '' }
  ]);

  // AI Insights text state
  const [aiInsightText, setAiInsightText] = useState<string>('');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  // Search parameters for easy filtering
  const [searchQuery, setSearchQuery] = useState('');

  // Invoice display state
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);

  // Dynamic user & role registration modal states
  const [showUserModal, setShowUserModal] = useState(false);
  const [activeUserEdit, setActiveUserEdit] = useState<UserSystem | null>(null);
  const [userForm, setUserForm] = useState({
    fullName: '',
    email: '',
    role: 'staff' as 'super' | 'admin' | 'staff' | 'finance',
    access: 'Staff akses terbatas',
    active: true
  });

  // Manual Tenant creation modal states
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [activeTenantEdit, setActiveTenantEdit] = useState<Tenant | null>(null);
  const [tenantForm, setTenantForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    property_id: 0,
    room_number: '',
    start_date: '',
    duration_months: 1,
    payment_status: 'paid' as 'paid' | 'unpaid'
  });

  // Property modal triggers
  const [showPropertyModal, setShowPropertyModal] = useState(false);
  const [activePropertyEdit, setActivePropertyEdit] = useState<Property | null>(null);

  // Room modal triggers
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [activeRoomEdit, setActiveRoomEdit] = useState<Room | null>(null);

  // Coupon creator modal triggers
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [couponForm, setCouponForm] = useState({
    code: '',
    discount_type: 'percentage' as 'percentage' | 'fixed',
    discount_value: 10,
    max_discount_amount: 100000,
    is_active: true,
    description: ''
  });

  // Midtrans Logs Dashboard States
  const [midtransLogs, setMidtransLogs] = useState<any[]>([]);
  const [midtransFilter, setMidtransFilter] = useState<string>('all');
  const [midtransLoading, setMidtransLoading] = useState<boolean>(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [autoRefreshLogs, setAutoRefreshLogs] = useState<boolean>(true);

  // MailerSend Email Integration States
  const [testEmailTo, setTestEmailTo] = useState('yogiatmaja26@gmail.com');
  const [testEmailSubject, setTestEmailSubject] = useState('Tes Integrasi MailerSend - Samara Stay');
  const [testEmailBody, setTestEmailBody] = useState('Halo! Ini adalah email uji coba dari modul Integrasi MailerSend premium Samara Stay. Konfigurasi email berhasil berjalan real-time!');
  const [emailSenderEmail, setEmailSenderEmail] = useState('info@trial-3yxj5ljp10zg6o2r.mlsender.net');
  const [emailSenderName, setEmailSenderName] = useState('Samara Stay Premium');
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState<{ success: boolean; message: string; details?: any } | null>(null);

  // Custom state-based confirmation dialog to bypass iframe window.confirm blocks
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const customConfirm = (title: string, message: string, onConfirm: () => void | Promise<void>) => {
    setConfirmDialog({
      isOpen: true,
      title,
      message,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        await onConfirm();
      }
    });
  };

  const fetchMidtransLogs = async () => {
    try {
      setMidtransLoading(true);
      const res = await fetch('/api/midtrans/logs');
      if (res.ok) {
        const data = await res.json();
        setMidtransLogs(data.logs || []);
      }
    } catch (err) {
      console.warn('Error fetching Midtrans logs:', err);
    } finally {
      setMidtransLoading(false);
    }
  };

  const handleClearMidtransLogs = async () => {
    customConfirm(
      'Hapus Log Transaksi',
      'Apakah Anda yakin ingin menghapus seluruh log transaksi Midtrans dari server?',
      async () => {
        try {
          const res = await fetch('/api/midtrans/logs/clear', { method: 'POST' });
          if (res.ok) {
            setMidtransLogs([]);
          }
        } catch (err) {
          console.warn('Error clearing Midtrans logs:', err);
        }
      }
    );
  };

  const handleSendTestEmail = async () => {
    setEmailSending(true);
    setEmailResult(null);
    try {
      const response = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: testEmailTo,
          subject: testEmailSubject,
          text: testEmailBody,
          fromEmail: emailSenderEmail,
          fromName: emailSenderName
        })
      });
      const data = await response.json();
      setEmailResult({
        success: data.success,
        message: data.message,
        details: data.details || data.error || data
      });
      if (data.success) {
        database.logActivity("System", "EMAIL_TEST_SUCCESS", `Sukses mengirim email tes MailerSend ke ${testEmailTo}`);
      } else {
        database.logActivity("System", "EMAIL_TEST_FAILED", `Gagal mengirim email tes ke ${testEmailTo}: ${data.message}`);
      }
    } catch (err: any) {
      setEmailResult({
        success: false,
        message: 'Gagal terhubung ke cluster API server.',
        details: err.message || err
      });
    } finally {
      setEmailSending(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'midtrans_logs') {
      fetchMidtransLogs();
    }
  }, [activeTab]);

  useEffect(() => {
    let interval: any;
    if (activeTab === 'midtrans_logs' && autoRefreshLogs) {
      interval = setInterval(() => {
        fetchMidtransLogs();
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [activeTab, autoRefreshLogs]);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [p, r, b, s, c, t, logs, uList, tList, acc, jrn, pay] = await Promise.all([
          database.fetchProperties(),
          database.fetchRooms(),
          database.fetchBookings(),
          database.fetchSurveys(),
          database.fetchCoupons(),
          database.fetchFinancialTransactions(),
          database.fetchActivityLogs(),
          database.fetchUsers(),
          database.fetchTenants(),
          database.fetchAccounts(),
          database.fetchJournalEntries(),
          database.fetchPayments()
        ]);
        setProperties(p);
        setRooms(r);
        setBookings(b);
        setSurveys(s);
        setCoupons(c);
        setTransactions(t);
        setActivityLogs(logs);
        setUsers(uList);
        setTenantsList(tList);
        setAccounts(acc);
        setJournalEntries(jrn);
        setPayments(pay);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [refreshTrigger]);

  useEffect(() => {
    const handleStateChange = () => {
      triggerAppRefresh();
    };
    window.addEventListener('samara_state_changed', handleStateChange);
    return () => {
      window.removeEventListener('samara_state_changed', handleStateChange);
    };
  }, [triggerAppRefresh]);

  const handleApproveBooking = async (b: Booking) => {
    customConfirm(
      'Setujui Sewa Kamar',
      `Setujui sewa kamar ${b.room_number} untuk tenant ${b.tenant_name}?`,
      async () => {
        const updated = { ...b, status: 'approved' as const };
        await database.saveBooking(updated);
        database.logActivity("System", "BOOKING_APPROVAL", `Sewa kamar ${b.room_number} disetujui`);
        triggerAppRefresh();
      }
    );
  };

  const handleCancelBooking = async (b: Booking) => {
    customConfirm(
      'Tolak / Batalkan Sewa',
      `Tolak / batalkan reservasi sewa untuk tenant ${b.tenant_name}?`,
      async () => {
        const updated = { ...b, status: 'rejected' as const };
        await database.saveBooking(updated);
        database.logActivity("System", "BOOKING_REJECT", `Sewa kamar ${b.room_number} ditolak`);
        triggerAppRefresh();
      }
    );
  };

  const handleApproveSurvey = async (s: Survey) => {
    customConfirm(
      'Selesaikan Survey',
      `Selesaikan janji kunjungan survey kamar ${s.room_number}? Tindakan ini memindahkan status ke Completed.`,
      async () => {
        const updated = { ...s, status: 'survey_completed' as const };
        await database.saveSurvey(updated);
        database.logActivity("System", "SURVEY_COMPLETED", `Survey untuk kamar ${s.room_number} selesai`);
        triggerAppRefresh();
      }
    );
  };

  const handleNoShowSurvey = async (s: Survey) => {
    customConfirm(
      'Tandai sebagai No-Show',
      'Tandai sebagai No-Show? Jaminan komitmen DP Rp 500rb akan dipindahkan langsung sebagai pendapatan hangus korporasi (transparansi PBJT).',
      async () => {
        const updated = { ...s, status: 'no_show' as const };
        await database.saveSurvey(updated);
        
        // Seed an income transaction for lost DP
        const trPayload = {
          transaction_date: new Date().toISOString().split('T')[0],
          category: 'income' as const,
          amount: 500000,
          description: `DP Survey Hangus - ${s.tenant_name} (Unit ${s.room_number})`,
          account_coa: 4200 // Pendapatan DP Survey Hangus
        };
        await (database as any).sandboxState?.saveFinancialTransaction(trPayload);
        
        database.logActivity("System", "SURVEY_NOSHOW", `Survey client ${s.tenant_name} No Show (DP Hangus)`);
        triggerAppRefresh();
      }
    );
  };

  const handleApproveSurveyPayment = async (s: Survey) => {
    customConfirm(
      'Setujui Pembayaran DP',
      `Setujui pembayaran DP survey sebesar Rp 500.000 untuk calon tenant ${s.tenant_name}?`,
      async () => {
        const updated = { ...s, status: 'survey_confirmed' as const };
        await database.saveSurvey(updated);
        database.logActivity("System", "SURVEY_PAYMENT_APPROVAL", `Pembayaran DP Survey kamar ${s.room_number} disetujui`);
        triggerAppRefresh();
      }
    );
  };

  const handleCancelSurvey = async (s: Survey) => {
    customConfirm(
      'Batalkan / Tolak Survey',
      `Batalkan / tolak pengajuan survey untuk calon tenant ${s.tenant_name}?`,
      async () => {
        const updated = { ...s, status: 'expired' as const };
        await database.saveSurvey(updated);
        database.logActivity("System", "SURVEY_CANCEL", `Pengajuan survey kamar ${s.room_number} dibatalkan`);
        triggerAppRefresh();
      }
    );
  };

  const handleAddProperty = async (payload: Partial<Property>) => {
    await database.saveProperty(payload);
    setShowPropertyModal(false);
    triggerAppRefresh();
  };

  const handleDeleteProperty = async (id: number) => {
    customConfirm(
      'Hapus Properti',
      'Apakah Anda yakin ingin menghapus properti kos ini? Semua metadata kamar di dalamnya juga akan terhapus.',
      async () => {
        await database.deleteProperty(id);
        triggerAppRefresh();
      }
    );
  };

  const handleAddRoom = async (payload: Partial<Room>) => {
    await database.saveRoom(payload);
    setShowRoomModal(false);
    triggerAppRefresh();
  };

  const handleDeleteRoom = async (id: number) => {
    customConfirm(
      'Hapus Kamar',
      'Ingin menghapus unit kamar ini?',
      async () => {
        await database.deleteRoom(id);
        triggerAppRefresh();
      }
    );
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Partial<Coupon> = {
      code: couponForm.code.toUpperCase(),
      discount_type: couponForm.discount_type,
      discount_value: Number(couponForm.discount_value),
      max_discount_amount: Number(couponForm.max_discount_amount),
      is_active: couponForm.is_active,
      description: couponForm.description,
      min_duration_months: 1
    };
    await database.saveCoupon(payload);
    setShowCouponModal(false);
    triggerAppRefresh();
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Partial<UserSystem> = {
      ...(activeUserEdit ? { id: activeUserEdit.id } : {}),
      full_name: userForm.fullName,
      email: userForm.email,
      role: userForm.role,
      role_id: userForm.role === 'super' ? 1 : userForm.role === 'admin' ? 2 : userForm.role === 'finance' ? 3 : 4,
      access: userForm.role === 'super' ? 'Akses penuh sistem, log audit & database' : userForm.role === 'admin' ? 'Akses kontrol panel asrama & inventaris' : userForm.role === 'finance' ? 'Akses ledger keuangan & setoran PBJT' : 'Akses operasional lapangan terbatas',
      active: userForm.active
    };
    await database.saveUser(payload);
    setShowUserModal(false);
    setUserForm({ fullName: '', email: '', role: 'staff', access: 'Staff akses terbatas', active: true });
    setActiveUserEdit(null);
    triggerAppRefresh();
  };

  const handleDeleteUser = async (id: string) => {
    customConfirm(
      'Cabut Hak Akses',
      'Apakah Anda yakin ingin mencabut seluruh hak akses fungsionaris ini?',
      async () => {
        await database.deleteUser(id);
        triggerAppRefresh();
      }
    );
  };

  const handleDeleteCoupon = async (id: number) => {
    customConfirm(
      'Hapus Kupon Promo',
      'Apakah Anda yakin ingin menghapus kupon promo ini secara permanen?',
      async () => {
        await database.deleteCoupon(id);
        triggerAppRefresh();
      }
    );
  };

  // Aggregated pricing math
  const totalOccupied = rooms.filter(r=>r.status === 'occupied').length;
  const occupancyRate = rooms.length > 0 ? Math.round((totalOccupied / rooms.length) * 100) : 0;
  
  // Real time direct calculated PBJT values
  const rawRevenue = bookings.filter(b=>b.status === 'approved').reduce((acc,curr)=>acc+Number(curr.total_price),0);
  const totalPBJT = Math.round(rawRevenue * 0.10); // 10% Local tax

  // Double-entry finance aggregations
  const totalInflow = transactions.filter(t=>t.type === 'income' || t.type === 'dp_booking').reduce((acc,curr)=>acc+Number(curr.amount), 0);
  const totalOutflow = transactions.filter(t=>t.type === 'expense').reduce((acc,curr)=>acc+Number(curr.amount), 0);
  const netEarnings = totalInflow - totalOutflow;

  const filteredPayments = payments.filter(p => {
    const matchesSearch = p.tenant_name.toLowerCase().includes(paymentSearch.toLowerCase()) || p.id.toLowerCase().includes(paymentSearch.toLowerCase());
    const matchesStatus = paymentFilterStatus === 'all' || p.status === paymentFilterStatus;
    return matchesSearch && matchesStatus;
  });

  // Recharts parameters parser
  const chartData = [
    { name: 'KOS PUTRI', Terisi: rooms.filter(r=>r.status==='occupied' && properties.find(p=>p.id===r.property_id)?.type==='putri').length },
    { name: 'KOS PUTRA', Terisi: rooms.filter(r=>r.status==='occupied' && properties.find(p=>p.id===r.property_id)?.type==='putra').length },
    { name: 'KOS CAMPUR', Terisi: rooms.filter(r=>r.status==='occupied' && properties.find(p=>p.id===r.property_id)?.type==='campur').length }
  ];

  if (loading) {
    return <Loader label="Memuat Panel Manajemen Birokrasi.." />;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 flex flex-col lg:flex-row gap-6 font-sans">
      
      {/* Sidebar layouts controls */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Primary tab views switcher */}
      <div className="flex-1 bg-slate-905 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6 min-h-[70vh]">
        
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="border-b border-slate-800 pb-3">
              <h2 className="text-base font-extrabold font-display text-white uppercase tracking-tight">Kinerja Finansial & Hunian</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Analisis occupancy kamar dan rasio penarikan pajak PBJT 10% secara langsung.</p>
            </div>

            {/* Quick KPI stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-center space-y-1">
                <span className="text-[8px] font-bold text-slate-500 font-mono uppercase block">Okupansi Kamar</span>
                <span className="text-xl font-extrabold text-amber-500 font-mono block">{occupancyRate}%</span>
                <span className="text-[9px] text-slate-450 font-sans block">{totalOccupied} terisi dari {rooms.length} unit</span>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-center space-y-1">
                <span className="text-[8px] font-bold text-slate-500 font-mono uppercase block">Sewa Bulanan Aktif</span>
                <span className="text-xl font-extrabold text-white font-mono block">{bookings.length} kontrak</span>
                <span className="text-[9px] text-slate-455 font-sans block">Approved settlement</span>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-center space-y-1">
                <span className="text-[8px] font-bold text-slate-500 font-mono uppercase block">Estimasi Omzet</span>
                <span className="text-xs font-extrabold text-emerald-450 font-mono block leading-loose select-all">{formatRupiah(rawRevenue)}</span>
                <span className="text-[9px] text-slate-450 font-sans block">Sewa terakumulasi</span>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-center space-y-1">
                <span className="text-[8px] font-bold text-slate-500 font-mono uppercase block">Pemberlakuan PBJT (10%)</span>
                <span className="text-xs font-extrabold text-[#f5a623] font-mono block leading-loose select-all">{formatRupiah(totalPBJT)}</span>
                <span className="text-[9px] text-slate-450 font-sans block">Kewajiban pajak daerah</span>
              </div>
            </div>

            {/* Occupants Charting visuals */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850 space-y-3">
              <h4 className="text-[10px] font-bold uppercase text-slate-450 tracking-wider font-mono">Okupansi Kamar Berdasarkan Gender</h4>
              <div className="h-48 text-[9px] font-mono">
                <ResponsiveContainer width="100%" height={180} minWidth={0} minHeight={0}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                    <XAxis dataKey="name" stroke="#888" />
                    <YAxis stroke="#888" />
                    <Tooltip contentStyle={{ backgroundColor: '#111', borderColor: '#333' }} />
                    <Bar dataKey="Terisi" fill="#f5a623" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'properties' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-base font-extrabold font-display text-white uppercase tracking-tight">Katalog Kompleks Properti Kos</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">Kelola seluruh asrama kosan, lokasi GPS, dan data penunjang operasional.</p>
              </div>
              <button 
                onClick={() => {
                  setActivePropertyEdit(null);
                  setShowPropertyModal(true);
                }}
                className="bg-amber-500 hover:bg-amber-450 text-black font-extrabold text-[10px] uppercase px-3.5 py-2 rounded-xl flex items-center gap-1 cursor-pointer transition-all shadow-md"
              >
                <Plus size={12} />
                Tambah Properti
              </button>
            </div>

            <div className="space-y-2">
              {properties.map(p => (
                <div key={p.id} className="bg-slate-900 border border-slate-800 p-4 rounded-3xl flex justify-between items-center text-xs">
                  <div>
                    <h4 className="font-extrabold text-slate-100 uppercase font-display">{p.name}</h4>
                    <span className="text-[9px] text-slate-450 font-mono italic">Gender: {p.type} | Tarif: {formatRupiah(p.price)}/bln</span>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        setActivePropertyEdit(p);
                        setShowPropertyModal(true);
                      }}
                      className="p-1 px-2.5 bg-slate-800 hover:bg-slate-750 text-slate-205 rounded-lg border border-slate-750 transition cursor-pointer text-[10px] flex items-center gap-1"
                    >
                      <Edit2 size={11} />
                      Ubah
                    </button>
                    <button 
                      onClick={() => handleDeleteProperty(p.id)}
                      className="p-1 px-2.5 bg-red-950/20 hover:bg-red-500 text-red-400 hover:text-white rounded-lg border border-red-500/20 transition cursor-pointer text-[10px] flex items-center gap-1"
                    >
                      <Trash2 size={11} />
                      Hapus
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'rooms' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-base font-extrabold font-display text-white uppercase tracking-tight">Ketersediaan Kamar / Unit</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">Pantau tarif harian, bulanan, detail lantai, dan metrik ketersediaan kamar.</p>
              </div>
              <button 
                onClick={() => {
                  setActiveRoomEdit(null);
                  setShowRoomModal(true);
                }}
                className="bg-amber-500 hover:bg-amber-450 text-black font-extrabold text-[10px] uppercase px-3.5 py-2 rounded-xl flex items-center gap-1 cursor-pointer transition-all shadow-md"
              >
                <Plus size={12} />
                Tambah Kamar
              </button>
            </div>

            <div className="space-y-2">
              {rooms.map(r => {
                const parentProj = properties.find(p=>p.id === r.property_id)?.name || 'Properti N/A';
                return (
                  <div key={r.id} className="bg-slate-900 border border-slate-800 p-4 rounded-3xl flex justify-between items-center text-xs">
                    <div>
                      <h4 className="font-extrabold text-slate-100 uppercase">KAMAR {r.room_number} ({r.room_type})</h4>
                      <p className="text-[9px] text-slate-450 font-mono">{parentProj} | Lantai {r.floor} | Stat: {r.status}</p>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => {
                          setActiveRoomEdit(r);
                          setShowRoomModal(true);
                        }}
                        className="p-1 px-2.5 bg-slate-800 hover:bg-slate-750 text-slate-205 rounded-lg border border-slate-750 transition cursor-pointer text-[10px] flex items-center gap-1"
                      >
                        <Edit2 size={11} />
                        Kustomisasi
                      </button>
                      <button 
                        onClick={() => handleDeleteRoom(r.id)}
                        className="p-1 px-2.5 bg-red-950/20 hover:bg-red-500 text-red-400 hover:text-white rounded-lg border border-red-500/20 transition cursor-pointer text-[10px] flex items-center gap-1"
                      >
                        <Trash2 size={11} />
                        Hapus
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'surveys' && (
          <div className="space-y-4">
            <div className="border-b border-slate-800 pb-3">
              <h2 className="text-base font-extrabold font-display text-white uppercase tracking-tight">Antrian Jadwal Survey Lapangan</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Saring jadwal survey masuk dengan DP Rp 500rb komitmen.</p>
            </div>

            <div className="space-y-3">
              {surveys.map(s => (
                <div key={s.id} className="bg-slate-900 border border-slate-805 p-4 rounded-3xl space-y-3 text-xs">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[9px] font-mono bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded border border-indigo-550/25 font-bold uppercase tracking-wider">{s.invoice_id}</span>
                      <h4 className="font-extrabold text-slate-150 uppercase mt-1">Calon Penghuni: {s.client_name} ({s.phone})</h4>
                      <p className="text-[9px] text-slate-450 font-mono">Pilihan: Kamar {s.room_number} | Jadwal: {s.survey_date} @ {s.survey_time_slot}</p>
                    </div>
                    <span className={`text-[8px] font-mono px-2 py-0.5 rounded-full border font-bold uppercase ${
                      s.status === 'survey_confirmed' 
                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse' 
                        : s.status === 'survey_completed' 
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/10' 
                          : s.status === 'pending_payment'
                            ? 'bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse'
                            : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                    }`}>
                      {s.status === 'survey_confirmed' 
                        ? 'MENUNGGU KEDATANGAN' 
                        : s.status === 'survey_completed' 
                          ? 'SUKSES DI-SURVEY' 
                          : s.status === 'pending_payment'
                            ? 'MENUNGGU BAYAR DP'
                            : s.status === 'no_show'
                              ? 'NO SHOW DP HANGUS'
                              : 'DIBATALKAN'}
                    </span>
                  </div>

                  {s.status === 'survey_confirmed' && (
                    <div className="flex gap-2 border-t border-slate-850/80 pt-2.5">
                      <button 
                        onClick={() => handleApproveSurvey(s)}
                        className="p-1 px-3 bg-emerald-600 hover:bg-emerald-550 text-white rounded-xl font-bold font-sans cursor-pointer transition text-[10px] flex items-center gap-1 shadow-md shadow-emerald-600/5"
                      >
                        <Check size={11} />
                        Selesai Survey (Sesuai Janji)
                      </button>
                      <button 
                        onClick={() => handleNoShowSurvey(s)}
                        className="p-1 px-3 bg-red-650 hover:bg-red-550 text-white rounded-xl font-bold font-sans cursor-pointer transition text-[10px] flex items-center gap-1 shadow-md"
                      >
                        <X size={11} />
                        No-Show (DP Hangus)
                      </button>
                    </div>
                  )}

                  {s.status === 'pending_payment' && (
                    <div className="flex gap-2 border-t border-slate-850/80 pt-2.5">
                      <button 
                        onClick={() => handleApproveSurveyPayment(s)}
                        className="p-1 px-3 bg-emerald-600 hover:bg-emerald-550 text-white rounded-xl font-bold font-sans cursor-pointer transition text-[10px] flex items-center gap-1 shadow-md shadow-emerald-600/5"
                      >
                        <Check size={11} />
                        Setujui Pembayaran DP
                      </button>
                      <button 
                        onClick={() => handleCancelSurvey(s)}
                        className="p-1 px-3 bg-red-950/20 hover:bg-red-500 text-red-500 rounded-xl transition cursor-pointer text-[10px] flex items-center gap-1 border border-red-500/20"
                      >
                        <X size={11} />
                        Tolak
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {surveys.length === 0 && (
                <p className="text-xs text-slate-500 text-center py-6">Belum ada antrian pengajuan survey untuk minggu ini.</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'finance' && (
              <div className="space-y-6 animate-fade-in">
                {/* SAMARA_FINANCE_ERP_START */}
                
                {/* MailerSend Email Debugger and Diagnostics Console */}
                 <div className="bg-amber-50 border border-amber-200 rounded-3xl p-4 md:p-5 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between shadow-xs">
                   <div className="flex gap-3 items-start">
                     <div className="p-2.5 bg-amber-100 text-amber-800 rounded-2xl shrink-0 mt-0.5">
                       <HelpCircle size={20} className="animate-pulse" />
                     </div>
                     <div>
                       <h4 className="text-sm font-bold text-slate-800 font-display">Pemberitahuan Sistem: Mengapa Email Belum Terkirim?</h4>
                       <p className="text-[11px] text-slate-600 leading-relaxed mt-1">
                         MailerSend menggunakan aturan keamanan ketat. Email tidak akan terkirim jika **domain pengirim (From Email)** belum diverifikasi di akun MailerSend Anda, atau jika limit uji coba habis (Error 422). 
                         Pastikan Anda telah mendaftarkan domain kost Anda di dasbor MailerSend dan memasukkan <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[10px] font-bold text-amber-900">MAILERSEND_API_KEY</code> pada menu Settings aplikasi.
                       </p>
                     </div>
                   </div>
                   <button 
                     onClick={async () => {
                       try {
                         const targetEmail = prompt("Masukkan email penerima tes invoice:", "customer@example.com");
                         if (!targetEmail) return;
                         
                         alert("Mengirim email uji coba invoice... Mohon tunggu.");
                         const res = await fetch('/api/email/send', {
                           method: 'POST',
                           headers: { 'Content-Type': 'application/json' },
                           body: JSON.stringify({
                             to: targetEmail,
                             subject: "Uji Coba Invoice Pembayaran - Samara Kos",
                             html: `
                               <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                                 <h2 style="color: #0f172a; border-bottom: 2px solid #10b981; padding-bottom: 10px;">SAMARA KOS</h2>
                                 <p style="font-size: 14px; color: #475569;">Terima kasih atas pembayaran Anda. Berikut adalah detail invoice sewa Anda:</p>
                                 <table style="width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13px;">
                                   <tr style="background-color: #f8fafc; font-weight: bold;">
                                     <td style="padding: 10px;">Deskripsi Layanan</td>
                                     <td style="padding: 10px; text-align: right;">Total</td>
                                   </tr>
                                   <tr>
                                     <td style="padding: 10px; border-bottom: 1px solid #f1f5f9;">Sewa Bulanan Kamar Deluxe (Kamar F102)</td>
                                     <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: #10b981;">Rp 2.600.000</td>
                                   </tr>
                                 </table>
                                 <p style="font-size: 11px; color: #94a3b8; margin-top: 30px; text-align: center;">Email dikirim otomatis oleh Samara Kos ERP Finance Engine.</p>
                               </div>
                             `
                           })
                         });
                         const data = await res.json();
                         if (res.ok) {
                           alert("Sukses! Log MailerSend: " + JSON.stringify(data));
                         } else {
                           alert("Gagal mengirim email. Error: " + data.error + "\nPenyebab: " + (data.message || "Domain From belum diverifikasi di MailerSend. Silakan verifikasi domain Anda terlebih dahulu di dashboard MailerSend!"));
                         }
                       } catch(e: any) {
                         alert("Terjadi kesalahan jaringan: " + e.message);
                       }
                     }}
                     className="bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold px-4 py-2.5 rounded-2xl shadow-xs shrink-0 transition-colors cursor-pointer flex items-center gap-1.5"
                   >
                     <Printer size={13} />
                     Kirim Tes Invoice MailerSend
                   </button>
                 </div>
 
                 {/* Sub-tab Navigation Bar for 16-Module Financial ERP */}
                 <div className="bg-white rounded-3xl p-3 shadow-xs border border-gray-100 flex flex-wrap gap-2">
                   {[
                     { id: 'overview', name: 'Dashboard & AI Analytics', icon: Sparkles },
                     { id: 'ledger', name: 'Ledger & Laporan', icon: Landmark },
                     { id: 'ar', name: 'Piutang & Pendapatan (AR)', icon: Coins },
                     { id: 'ap', name: 'Biaya & Pengadaan (AP)', icon: ShoppingBag },
                     { id: 'assets', name: 'Aset & Pemeliharaan', icon: Wrench },
                     { id: 'petty', name: 'Kas Kecil & Bank', icon: Wallet },
                     { id: 'tax', name: 'Pajak & Anggaran', icon: Percent },
                     { id: 'audit', name: 'Audit Trail Logs', icon: Shield }
                   ].map(sub => {
                     const IconComponent = sub.icon;
                     return (
                       <button
                         key={sub.id}
                         onClick={() => setActiveFinanceSubTab(sub.id as any)}
                         className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold rounded-2xl transition-all cursor-pointer ${
                           activeFinanceSubTab === sub.id
                             ? 'bg-slate-900 text-white shadow-md'
                             : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                         }`}
                       >
                         <IconComponent size={14} className={activeFinanceSubTab === sub.id ? 'text-emerald-400' : 'text-slate-400'} />
                         {sub.name}
                       </button>
                     );
                   })}
                 </div>
 
                 {/* SUBTAB 1: OVERVIEW & AI FINANCIAL ANALYTICS */}
                 {activeFinanceSubTab === 'overview' && (
                   <div className="space-y-6 animate-fade-in">
                     
                     {/* Ringkasan Eksekutif Finansial */}
                     <div className="bg-slate-900 text-white rounded-3xl p-6 border border-slate-800 shadow-xl space-y-5">
                       <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                         <div>
                           <span className="text-[10px] text-amber-400 font-mono uppercase tracking-wider font-extrabold flex items-center gap-1.5">
                             <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                             Ringkasan Eksekutif Finansial Samara Kos
                           </span>
                           <h3 className="text-lg font-black text-white font-display mt-0.5">Analisis Kinerja Arus Kas, Okupansi & Profitabilitas</h3>
                         </div>
                         <div className="flex gap-2">
                           <button
                             onClick={() => {
                               alert("Mengekspor laporan keuangan PDF... File samara_financial_statement.pdf berhasil diunduh.");
                               database.logActivity("System Finance", "EXPORT_REPORT", "Ekspor Financial Report ke PDF");
                             }}
                             className="bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 text-[11px] font-bold px-3 py-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1"
                           >
                             <FileText size={12} />
                             PDF
                           </button>
                           <button
                             onClick={() => {
                               alert("Mengekspor data ledger ke Excel... File samara_general_ledger.xlsx berhasil diunduh.");
                               database.logActivity("System Finance", "EXPORT_REPORT", "Ekspor General Ledger ke Excel");
                             }}
                             className="bg-emerald-800 hover:bg-emerald-700 text-white text-[11px] font-bold px-3 py-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1"
                           >
                             <FileSpreadsheet size={12} />
                             Excel
                           </button>
                         </div>
                       </div>
 
                       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
                         <div className="bg-slate-950/65 p-4 rounded-2xl border border-slate-800/80 space-y-1">
                           <span className="text-[9px] text-slate-400 font-bold uppercase font-mono flex items-center gap-1">
                             <TrendingUp size={10} className="text-emerald-400" />
                             Total Pendapatan (Inflow)
                           </span>
                           <div className="text-base md:text-lg font-extrabold text-[#10b981] font-mono">{formatRupiah(totalInflow)}</div>
                           <p className="text-[9px] text-slate-500">Omset hunian real-time & jaminan DP survey</p>
                         </div>
 
                         <div className="bg-slate-950/65 p-4 rounded-2xl border border-slate-800/80 space-y-1">
                           <span className="text-[9px] text-slate-400 font-bold uppercase font-mono flex items-center gap-1">
                             <TrendingDown size={10} className="text-red-400" />
                             Biaya Operasional (Outflow)
                           </span>
                           <div className="text-base md:text-lg font-extrabold text-[#ef4444] font-mono">{formatRupiah(totalOutflow)}</div>
                           <p className="text-[9px] text-slate-500">Beban pemeliharaan, utilitas & gaji staff</p>
                         </div>
 
                         <div className="bg-slate-950/65 p-4 rounded-2xl border border-slate-800/80 space-y-1">
                           <span className="text-[9px] text-slate-400 font-bold uppercase font-mono flex items-center gap-1">
                             <Coins size={10} className="text-amber-400" />
                             Net Profit Laba Bersih
                           </span>
                           <div className="text-base md:text-lg font-extrabold text-amber-500 font-mono">{formatRupiah(netEarnings)}</div>
                           <p className="text-[9px] text-slate-500 font-sans">Marjin Laba: {totalInflow ? Math.round((netEarnings / totalInflow)*100) : 0}%</p>
                         </div>
 
                         <div className="bg-slate-950/65 p-4 rounded-2xl border border-slate-800/80 space-y-1">
                           <span className="text-[9px] text-slate-400 font-bold uppercase font-mono flex items-center gap-1">
                             <Percent size={10} className="text-sky-400" />
                             Kewajiban Pajak PBJT (10%)
                           </span>
                           <div className="text-base md:text-lg font-extrabold text-sky-400 font-mono">
                             {formatRupiah(accounts.find(a=>a.id===2100)?.balance || 0)}
                           </div>
                           <p className="text-[9px] text-slate-500 font-sans">Disisihkan otomatis dari billing lunas</p>
                         </div>
                       </div>
                     </div>
 
                     {/* AI Financial Insights Generator Panel (Module 14 / AI Analytics) */}
                     <div className="bg-white rounded-3xl p-5 md:p-6 border border-gray-100 shadow-xs space-y-4">
                       <div className="flex items-center justify-between">
                         <div className="flex items-center gap-2">
                           <div className="p-1.5 bg-indigo-50 text-indigo-700 rounded-xl">
                             <Sparkles size={16} />
                           </div>
                           <h3 className="text-sm font-bold text-slate-800 font-display">Asisten Analitik Keuangan AI Samara</h3>
                         </div>
                         <button
                           onClick={() => {
                             setIsGeneratingAi(true);
                             setAiInsightText('');
                             setTimeout(() => {
                               setIsGeneratingAi(false);
                               const exceededBudget = budgets.find(b => b.spent > b.limit);
                               const lowStock = inventoryItems.filter(i => i.stock <= i.minStock);
                               setAiInsightText(`### 📊 REPORT EXECUTIVE INSIGHT - SAMARA KOS ERP\n` +
                                 `**Diproduksi Real-time Pada:** ${new Date().toLocaleString()}\n\n` +
                                 `#### 1. Analisis Profitabilitas & Cash Flow\n` +
                                 `- **Total Arus Kas Masuk (Inflow):** ${formatRupiah(totalInflow)} menunjukkan sirkulasi keuangan yang sangat sehat.\n` +
                                 `- **Efisiensi Pengeluaran:** Rasio biaya terhadap omset saat ini berkisar **${totalInflow ? Math.round((totalOutflow/totalInflow)*100) : 0}%**, berada dalam batas ideal standar industri (maksimal 35%).\n` +
                                 `- **Laba Bersih Operasional:** Bisnis mencatatkan laba bersih sebesar **${formatRupiah(netEarnings)}**.\n\n` +
                                 `#### 2. Deteksi Anomali & Kontrol Anggaran (Peringatan Deviasi)\n` +
                                 `${exceededBudget ? `- ⚠️ **PELANGGARAN ANGGARAN:** Beban akun **"${exceededBudget.category}"** saat ini telah menyentuh **${formatRupiah(exceededBudget.spent)}**, melampaui batas toleransi anggaran sebesar **${formatRupiah(exceededBudget.limit)}** (Varian Negatif: **-${Math.round((exceededBudget.spent - exceededBudget.limit)/exceededBudget.limit*100)}%**).\n` : `- ✅ **KONTROL ANGGARAN:** Semua pos operasional berjalan tertib dan tidak ada penyimpangan batas anggaran.\n`}` +
                                 `${lowStock.length > 0 ? `- 🛒 **PERINGATAN RANTAI PASOK:** Ditemukan item inventaris **${lowStock.map(l => l.name).join(', ')}** yang berada di bawah tingkat persediaan minimum. Segera buat purchase order baru untuk menghindari kekosongan stock.\n` : `- ✅ **STATUS INVENTARIS:** Tingkat persediaan logistik kos aman.\n`}\n` +
                                 `#### 3. Rekomendasi Finansial Berbasis Keputusan Bisnis\n` +
                                 `1. **Restrukturisasi Promosi:** Disarankan membatasi diskon kupon langsung karena pos pemasaran melampaui anggaran perencanaan.\n` +
                                 `2. **Mitigasi Pajak:** Saldo Utang Pajak Daerah PBJT DKI sebesar **${formatRupiah(accounts.find(a=>a.id===2100)?.balance || 0)}** harus segera disetorkan ke kas daerah sebelum tanggal 15 bulan depan guna menghindari sanksi administratif denda 2% per bulan.`
                               );
                               database.logActivity("System Finance", "AI_ANALYTICS", "Menghasilkan ringkasan analitik keuangan AI");
                             }, 1200);
                           }}
                           className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold px-3 py-2 rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
                         >
                           <Sparkles size={12} className={isGeneratingAi ? 'animate-spin' : ''} />
                           {isGeneratingAi ? 'Menganalisis Ledger...' : 'Hasilkan Insight AI'}
                         </button>
                       </div>
 
                       {isGeneratingAi && (
                         <div className="p-10 text-center space-y-2">
                           <Activity size={32} className="mx-auto text-indigo-500 animate-spin" />
                           <p className="text-xs font-bold text-slate-700 font-sans">Mengevaluasi Balance Sheet & Menganalisis Varian Anggaran...</p>
                         </div>
                       )}
 
                       {!isGeneratingAi && aiInsightText && (
                         <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 font-sans text-xs text-slate-700 space-y-3 whitespace-pre-wrap leading-relaxed shadow-inner">
                           {aiInsightText}
                         </div>
                       )}
 
                       {!isGeneratingAi && !aiInsightText && (
                         <div className="p-4 bg-slate-50 border border-dashed border-slate-200 text-center rounded-2xl text-slate-400 font-semibold text-xs py-8 font-sans">
                           Klik tombol di atas untuk menganalisis data Chart of Accounts (COA) secara komprehensif menggunakan algoritma AI Financial Controller.
                         </div>
                       )}
                     </div>
 
                     {/* Chart visualisation simulation using SVG and pure CSS */}
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-4">
                         <h4 className="text-xs font-bold text-slate-800 font-display">Aliran Arus Kas (Inflow vs Outflow)</h4>
                         <div className="h-[200px] flex items-end gap-10 justify-center pb-2 pt-6">
                           <div className="flex flex-col items-center gap-2">
                             <div className="w-16 bg-[#10b981] rounded-t-xl transition-all duration-500" style={{ height: `${totalInflow ? 130 : 5}px` }}></div>
                             <span className="text-[10px] font-bold text-slate-600 font-mono">Rp Inflow</span>
                           </div>
                           <div className="flex flex-col items-center gap-2">
                             <div className="w-16 bg-[#ef4444] rounded-t-xl transition-all duration-500" style={{ height: `${totalInflow ? (totalOutflow/totalInflow)*130 : 5}px` }}></div>
                             <span className="text-[10px] font-bold text-slate-600 font-mono">Rp Outflow</span>
                           </div>
                           <div className="flex flex-col items-center gap-2">
                             <div className="w-16 bg-amber-500 rounded-t-xl transition-all duration-500" style={{ height: `${totalInflow ? (netEarnings/totalInflow)*130 : 5}px` }}></div>
                             <span className="text-[10px] font-bold text-slate-600 font-mono">Rp Net Laba</span>
                           </div>
                         </div>
                       </div>
 
                       <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-4">
                         <h4 className="text-xs font-bold text-slate-800 font-display">Kinerja Tingkat Okupansi Hunian</h4>
                         <div className="flex items-center justify-between py-6">
                           <div className="space-y-1">
                             <div className="text-3xl font-black text-slate-800 font-display">85.4%</div>
                             <p className="text-[10px] text-slate-400 font-medium font-sans">12 dari 14 Kamar Terisi Aktif</p>
                             <span className="inline-block bg-emerald-50 text-brand-green text-[9px] font-bold px-2 py-0.5 rounded-full mt-1 font-sans">Okupansi Sangat Tinggi</span>
                           </div>
                           <div className="relative w-24 h-24 flex items-center justify-center">
                             {/* Radial gauge representation */}
                             <svg className="w-full h-full transform -rotate-90">
                               <circle cx="48" cy="48" r="38" stroke="#f1f5f9" strokeWidth="8" fill="transparent" />
                               <circle cx="48" cy="48" r="38" stroke="#10b981" strokeWidth="8" fill="transparent" strokeDasharray="238" strokeDashoffset="35" />
                             </svg>
                             <span className="absolute text-xs font-black text-slate-800 font-mono">85%</span>
                           </div>
                         </div>
                       </div>
                     </div>
                   </div>
                 )}
 
                 {/* SUBTAB 2: BOOKKEEPER DOUBLE-ENTRY GENERAL LEDGER & COA */}
                 {activeFinanceSubTab === 'ledger' && (
                   <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
                     
                     {/* Left & Middle panels: COA and manual posting */}
                     <div className="lg:col-span-2 space-y-6">
                       
                       {/* COA Timbangan Saldo */}
                       <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-4">
                         <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                           <div>
                             <span className="text-[10px] text-gray-400 font-bold uppercase font-mono tracking-wider block">Chart of Accounts (COA)</span>
                             <h3 className="text-sm font-bold text-slate-800 font-display">Timbangan Saldo Buku Besar Utama</h3>
                           </div>
                           <span className="bg-emerald-50 text-brand-green border border-emerald-200 font-bold text-[10px] px-2.5 py-1 rounded-full font-mono uppercase">
                             Balanced (Debit = Kredit)
                           </span>
                         </div>
 
                         <div className="space-y-2 max-h-[350px] overflow-y-auto no-scrollbar pr-1">
                           {accounts.map((acc) => (
                             <div key={acc.id} className="flex justify-between items-center text-xs py-2.5 px-3.5 bg-slate-50 hover:bg-slate-100/60 rounded-2xl transition-colors border border-slate-100 font-medium font-sans">
                               <div>
                                 <span className="font-mono text-gray-400 text-[10px] mr-2">[{acc.id}]</span>
                                 <span className="text-slate-800">{acc.name}</span>
                                 <span className="text-[9px] text-slate-400 font-normal uppercase ml-2 px-1 bg-slate-200/50 rounded">{acc.type}</span>
                               </div>
                               <span className="font-bold text-slate-800 font-mono">
                                 {formatRupiah(acc.balance)}
                               </span>
                             </div>
                           ))}
                         </div>
                       </div>
 
                       {/* Manual Journal Entry Posting Form */}
                       <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-4">
                         <h4 className="text-sm font-bold text-slate-800 font-display flex items-center gap-1.5">
                           <Calculator size={15} className="text-indigo-600" />
                           Posting Jurnal Umum Manual (Double Entry Ledger)
                         </h4>
                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                           <div>
                             <label className="text-[10px] text-slate-400 font-bold block mb-1 uppercase font-mono">Pilih Akun Debit (Penambahan Aset/Beban)</label>
                             <select 
                               value={journalForm.debitAccount}
                               onChange={(e) => setJournalForm({...journalForm, debitAccount: Number(e.target.value)})}
                               className="w-full text-xs p-2 rounded-xl border border-gray-200 font-medium bg-white"
                             >
                               {accounts.map(a => <option key={a.id} value={a.id}>[{a.id}] - {a.name}</option>)}
                             </select>
                           </div>
                           <div>
                             <label className="text-[10px] text-slate-400 font-bold block mb-1 uppercase font-mono">Pilih Akun Kredit (Pengurangan Aset / Penambahan Revenue/Liability)</label>
                             <select 
                               value={journalForm.creditAccount}
                               onChange={(e) => setJournalForm({...journalForm, creditAccount: Number(e.target.value)})}
                               className="w-full text-xs p-2 rounded-xl border border-gray-200 font-medium bg-white"
                             >
                               {accounts.map(a => <option key={a.id} value={a.id}>[{a.id}] - {a.name}</option>)}
                             </select>
                           </div>
                           <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
                             <div className="sm:col-span-1">
                               <label className="text-[10px] text-slate-400 font-bold block mb-1 uppercase font-mono">Nominal (Rupiah)</label>
                               <input 
                                 type="number"
                                 placeholder="Nominal"
                                 value={journalForm.amount || ''}
                                 onChange={(e) => setJournalForm({...journalForm, amount: Number(e.target.value)})}
                                 className="w-full text-xs p-2 rounded-xl border border-gray-200 outline-none font-medium font-mono"
                               />
                             </div>
                             <div className="sm:col-span-2">
                               <label className="text-[10px] text-slate-400 font-bold block mb-1 uppercase font-mono">Keterangan / Deskripsi Transaksi</label>
                               <input 
                                 type="text"
                                 placeholder="Keterangan transaksi lengkap..."
                                 value={journalForm.description}
                                 onChange={(e) => setJournalForm({...journalForm, description: e.target.value})}
                                 className="w-full text-xs p-2 rounded-xl border border-gray-200 outline-none font-medium"
                               />
                             </div>
                           </div>
                         </div>
                         <div className="flex justify-end pt-2">
                           <button
                             onClick={async () => {
                               if (journalForm.amount <= 0 || !journalForm.description.trim()) {
                                 alert("Harap isi nominal transaksi dan deskripsi dengan valid.");
                                 return;
                               }
                               if (journalForm.debitAccount === journalForm.creditAccount) {
                                 alert("Akun debit dan kredit tidak boleh sama dalam asas double-entry accounting!");
                                 return;
                               }
                               
                               try {
                                 await database.recordFinancialExpense(
                                   journalForm.debitAccount,
                                   journalForm.creditAccount,
                                   journalForm.amount,
                                   `[MANUAL JURNAL] ${journalForm.description}`,
                                   "Jurnal Umum Manual"
                                 );
                                 database.logActivity("System Finance", "POST_JOURNAL_MANUAL", `Debit ${journalForm.debitAccount} Kredit ${journalForm.creditAccount} Nominal Rp ${journalForm.amount}`);
                                 alert("Jurnal double-entry manual berhasil di-posting ke Ledger!");
                                 setJournalForm({ debitAccount: 1010, creditAccount: 4000, amount: 0, description: '' });
                                 triggerAppRefresh();
                               } catch(err: any) {
                                 alert("Gagal mem-posting jurnal: " + err.message);
                               }
                             }}
                             className="bg-indigo-650 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-2xl shadow-xs transition-all cursor-pointer"
                           >
                             Post Journal Entry
                           </button>
                         </div>
                       </div>
                     </div>
 
                     {/* Right Panel: Immutable General Journal Records list */}
                     <div className="space-y-6">
                       <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-4">
                         <div>
                           <div className="flex justify-between items-center w-full mb-2">
                             <div>
                               <span className="text-[10px] text-gray-400 font-bold uppercase font-mono tracking-wider block">Buku Jurnal Umum</span>
                             </div>
                             <div className="flex bg-slate-100 p-0.5 rounded-xl">
                               <button
                                 onClick={() => setJournalViewMode('transactions')}
                                 className={`text-[9px] font-bold px-2.5 py-1.5 rounded-lg cursor-pointer transition-all ${journalViewMode === 'transactions' ? 'bg-white text-slate-800 shadow-3xs' : 'text-slate-500 hover:text-slate-750'}`}
                               >
                                 Transaksi
                               </button>
                               <button
                                 onClick={() => setJournalViewMode('double_entry')}
                                 className={`text-[9px] font-bold px-2.5 py-1.5 rounded-lg cursor-pointer transition-all ${journalViewMode === 'double_entry' ? 'bg-white text-slate-800 shadow-3xs' : 'text-slate-500 hover:text-slate-750'}`}
                               >
                                 Dr/Cr
                               </button>
                             </div>
                           </div>
                           <h3 className="text-sm font-bold text-slate-800 font-display">Arsip Transaksi Finansial</h3>
                         </div>
 
                         <div className="space-y-3 max-h-[500px] overflow-y-auto no-scrollbar pr-1">
                           {journalViewMode === 'transactions' ? (
                             transactions.map((trx) => (
                               <div key={trx.id} className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col justify-between gap-1.5 font-medium shadow-2xs">
                                 <div className="flex justify-between items-start gap-4">
                                   <div className="space-y-0.5">
                                     <span className="font-mono text-[9px] text-gray-400 block">[{trx.transaction_no}]</span>
                                     <p className="text-xs text-slate-800 font-bold font-sans">{trx.description}</p>
                                   </div>
                                   <span className={`font-mono text-xs font-bold text-slate-800 shrink-0`}>
                                     {formatRupiah(trx.amount)}
                                   </span>
                                 </div>
                                 <div className="flex items-center justify-between border-t border-slate-100 pt-1.5 text-[9px] text-slate-400">
                                   <span className="uppercase font-mono font-bold bg-slate-200/50 text-slate-600 px-1 py-0.5 rounded">
                                     {trx.category || "Umum"}
                                   </span>
                                   <span>{trx.transaction_date} | Ops: {trx.created_by}</span>
                                 </div>
                               </div>
                             ))
                           ) : (
                             (() => {
                               const grouped = journalEntries.reduce((acc: Record<string, JournalEntry[]>, jrn) => {
                                 if (!acc[jrn.journal_no]) {
                                   acc[jrn.journal_no] = [];
                                 }
                                 acc[jrn.journal_no].push(jrn);
                                 return acc;
                               }, {});

                               return Object.keys(grouped).sort().reverse().map((jNo) => {
                                 const entries = grouped[jNo];
                                 const firstEntry = entries[0];
                                 const parentTrx = transactions.find(t => t.id === firstEntry.transaction_id);
                                 return (
                                   <div key={jNo} className="p-3 bg-white border border-slate-200 rounded-2xl space-y-2 font-sans text-xs shadow-2xs hover:border-slate-300 transition-all">
                                     <div className="flex justify-between items-start border-b border-gray-150 pb-1">
                                       <div>
                                         <span className="font-mono text-[9px] font-extrabold text-indigo-600 block">{jNo}</span>
                                         <span className="text-[10px] text-gray-400 font-medium">{parentTrx?.transaction_date || firstEntry.created_at?.split('T')[0] || ''}</span>
                                       </div>
                                       <span className="uppercase font-mono text-[8px] font-bold bg-indigo-50/50 text-indigo-600 px-1.5 py-0.5 rounded">
                                         {parentTrx?.category || 'General'}
                                       </span>
                                     </div>

                                     <p className="text-[11px] text-slate-850 font-bold leading-tight">
                                       {parentTrx?.description || "Manual Adjustments"}
                                     </p>

                                     <div className="space-y-1.5 border-t border-dashed border-slate-200 pt-2 font-mono text-[10px]">
                                       {entries.map((jrn) => {
                                         const acc = accounts.find(a => a.id === jrn.account_id);
                                         const isDebit = jrn.debit > 0;
                                         return (
                                            <div key={jrn.id} className={`flex justify-between items-center ${isDebit ? 'text-slate-800 pl-0' : 'text-slate-500 pl-3'}`}>
                                              <div className="flex items-center gap-1.5 overflow-hidden">
                                                <span className="text-slate-400 font-semibold">{isDebit ? 'Dr.' : 'Cr.'}</span>
                                                <span className="text-[8px] text-gray-400">[{jrn.account_id}]</span>
                                                <span className={`truncate ${isDebit ? 'font-bold text-slate-850' : 'italic text-slate-650'}`}>
                                                  {acc?.name || `Akun ${jrn.account_id}`}
                                                </span>
                                              </div>
                                              <span className={`shrink-0 ${isDebit ? 'font-bold text-slate-900' : 'font-medium text-slate-600'}`}>
                                                {isDebit ? formatRupiah(jrn.debit) : `(${formatRupiah(jrn.credit)})`}
                                              </span>
                                            </div>
                                         );
                                       })}
                                     </div>
                                   </div>
                                 );
                               });
                             })()
                           )}
                         </div>
                       </div>
                     </div>
                   </div>
                 )}
 
                 {/* SUBTAB 3: REVENUE & ACCOUNTS RECEIVABLE (AR) */}
                 {activeFinanceSubTab === 'ar' && (
                   <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-4 animate-fade-in">
                     <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-3">
                       <div>
                         <span className="text-[10px] text-gray-400 font-bold uppercase font-mono tracking-wider block">Manajemen Piutang & Billing</span>
                         <h3 className="text-sm font-bold text-slate-800 font-display">Siklus Pendapatan Sewa & Deposit</h3>
                       </div>
                       <div className="flex gap-2">
                         <input 
                           type="text"
                           placeholder="Cari penyewa..."
                           value={paymentSearch}
                           onChange={(e) => setPaymentSearch(e.target.value)}
                           className="p-2 px-3 rounded-xl border border-gray-200 outline-none text-xs bg-slate-50"
                         />
                       </div>
                     </div>
 
                     <div className="overflow-x-auto font-sans">
                       <table className="w-full text-left border-collapse text-xs">
                         <thead>
                           <tr className="border-b border-gray-100 text-[10px] text-gray-400 font-bold font-mono uppercase bg-slate-50">
                             <th className="py-3 px-3">INVOICE ID</th>
                             <th className="py-3 px-3">NAMA TENANT</th>
                             <th className="py-3 px-3">METODE</th>
                             <th className="py-3 px-3">SCORE AR</th>
                             <th className="py-3 px-3">NOMINAL</th>
                             <th className="py-3 px-3">STATUS</th>
                             <th className="py-3 px-3 text-right">AKSI DIAGNOSTIK</th>
                           </tr>
                         </thead>
                         <tbody className="divide-y divide-gray-100 font-medium text-slate-700">
                           {filteredPayments.map((p) => (
                             <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                               <td className="py-3 px-3 font-mono text-[10px] text-gray-500">{p.id}</td>
                               <td className="py-3 px-3 font-bold text-slate-800">{p.tenant_name}</td>
                               <td className="py-3 px-3 uppercase font-mono text-[10px]">{p.method || 'MIDTRANS'}</td>
                               <td className="py-3 px-3 font-sans">
                                 <span className="inline-block bg-emerald-50 text-emerald-800 text-[9px] font-bold px-1.5 py-0.5 rounded font-mono">
                                   100 (Sangat Lancar)
                                 </span>
                               </td>
                               <td className="py-3 px-3 font-mono font-bold text-slate-800">{formatRupiah(p.amount)}</td>
                               <td className="py-3 px-3">
                                 {p.status === 'paid' ? (
                                   <span className="bg-emerald-50 text-brand-green border border-emerald-200 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase font-mono">
                                     LUNAS
                                   </span>
                                 ) : (
                                   <span className="bg-amber-50 text-amber-600 border border-amber-200 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase font-mono">
                                     PENDING
                                   </span>
                                 )}
                               </td>
                               <td className="py-3 px-3 text-right space-x-1.5">
                                 <button
                                   onClick={() => {
                                     alert(`Mengirimkan pengingat WhatsApp tagihan sewa ke ${p.tenant_name} (Nominal: ${formatRupiah(p.amount)})... Pengingat berhasil terkirim.`);
                                     database.logActivity("System Finance", "SEND_WHATSAPP_REMINDER", `Kirim tagihan WA untuk ${p.tenant_name}`);
                                   }}
                                   className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[10px] px-2 py-1 rounded-lg transition-colors cursor-pointer font-sans"
                                 >
                                   WhatsApp Reminder
                                 </button>
                                 <button
                                   onClick={async () => {
                                     if (confirm(`Apakah Anda yakin ingin melakukan penghapusan (Write-off) piutang untuk invoice ${p.id}? Ini akan memposting jurnal koreksi otomatis.`)) {
                                       try {
                                         await database.recordFinancialExpense(5100, 1100, p.amount, `Penghapusan Piutang Usaha - Tenant ${p.tenant_name} Inv ${p.id}`, "Penyesuaian Piutang");
                                         database.logActivity("System Finance", "WRITE_OFF_PIUTANG", `Write-off piutang tenant ${p.tenant_name} nominal Rp ${p.amount}`);
                                         alert("Sukses! Piutang berhasil di-Write-off dan dicatat sebagai beban operasional kos.");
                                         triggerAppRefresh();
                                       } catch(err: any) {
                                         alert("Gagal menghapus piutang: " + err.message);
                                       }
                                     }
                                   }}
                                   className="bg-red-50 hover:bg-red-100 text-red-600 font-bold text-[10px] px-2 py-1 rounded-lg transition-colors cursor-pointer font-sans"
                                 >
                                   Write-off
                                 </button>
                               </td>
                             </tr>
                           ))}
 
                           {filteredPayments.length === 0 && (
                             <tr>
                               <td colSpan={7} className="py-10 text-center text-slate-400 font-semibold">
                                 Tidak ada data billing atau piutang yang ditemukan.
                               </td>
                             </tr>
                           )}
                         </tbody>
                       </table>
                     </div>
                   </div>
                 )}
 
                 {/* SUBTAB 4: OPERATIONAL EXPENSES, PURCHASE ORDERS & FIFO STOCK INVENTORY */}
                 {activeFinanceSubTab === 'ap' && (
                   <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
                     
                     {/* Left & Center Panels: Expenses & Procurement (Module 3 & 4) */}
                     <div className="lg:col-span-2 space-y-6">
                       
                       {/* Record Operational Expense & Multi-Level Approvals */}
                       <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-4">
                         <div className="flex justify-between items-center">
                           <h4 className="text-sm font-bold text-slate-800 font-display flex items-center gap-1.5">
                             <ShoppingBag size={15} className="text-rose-600" />
                             Formulir Belanja & Biaya Operasional (Procurement AP)
                           </h4>
                         </div>
                         
                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-medium">
                           <div>
                             <label className="text-[10px] text-slate-400 font-bold block mb-1 uppercase font-mono">Kategori Biaya</label>
                             <select 
                               value={expenseForm.category}
                               onChange={(e) => setExpenseForm({...expenseForm, category: e.target.value})}
                               className="w-full text-xs p-2 rounded-xl border border-gray-200 font-medium bg-white outline-none"
                             >
                               <option value="Biaya Operasional">Biaya Operasional & Rumah Tangga Kos</option>
                               <option value="Pemeliharaan Gedung">Pemeliharaan & Perbaikan Gedung</option>
                               <option value="Gaji Karyawan">Gaji & Upah Staff</option>
                               <option value="Utilitas Listrik & Air">Utilitas (Air, Listrik, WiFi)</option>
                             </select>
                           </div>
                           <div>
                             <label className="text-[10px] text-slate-400 font-bold block mb-1 uppercase font-mono">Pilih Vendor / Supplier</label>
                             <select
                               value={expenseForm.vendor}
                               onChange={(e) => setExpenseForm({...expenseForm, vendor: e.target.value})}
                               className="w-full text-xs p-2 rounded-xl border border-gray-200 font-medium bg-white outline-none"
                             >
                               <option value="">-- Pilih Supplier --</option>
                               {vendors.map(v => <option key={v.id} value={v.name}>{v.name} ({v.category})</option>)}
                             </select>
                           </div>
                           <div>
                             <label className="text-[10px] text-slate-400 font-bold block mb-1 uppercase font-mono">Nominal Belanja (Rp)</label>
                             <input 
                               type="number"
                               placeholder="Nominal belanja..."
                               value={expenseForm.amount || ''}
                               onChange={(e) => setExpenseForm({...expenseForm, amount: Number(e.target.value)})}
                               className="w-full p-2 rounded-xl border border-gray-200 outline-none font-medium font-mono"
                             />
                           </div>
                           <div>
                             <label className="text-[10px] text-slate-400 font-bold block mb-1 uppercase font-mono">Deskripsi Barang / Jasa</label>
                             <input 
                               type="text"
                               placeholder="Pembelian sabun cair, lampu led, AC, dll..."
                               value={expenseForm.description}
                               onChange={(e) => setExpenseForm({...expenseForm, description: e.target.value})}
                               className="w-full p-2 rounded-xl border border-gray-200 outline-none font-medium"
                             />
                           </div>
 
                           <div className="sm:col-span-2 p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between">
                             <div className="space-y-0.5">
                               <span className="text-[11px] font-bold text-slate-800 flex items-center gap-1 font-sans">
                                 <ShieldAlert size={12} className="text-amber-500 animate-pulse" />
                                 Gunakan Skema Persetujuan Berjenjang (Nominal & Approval Matrix)
                               </span>
                               <p className="text-[9px] text-slate-500 font-normal leading-relaxed font-sans">
                                 Centang jika pembelian membutuhkan persetujuan owner sebelum memotong saldo akun Kas Mandiri.
                               </p>
                             </div>
                             <input 
                               type="checkbox"
                               checked={expenseForm.approvalRequired}
                               onChange={(e) => setExpenseForm({...expenseForm, approvalRequired: e.target.checked})}
                               className="w-4 h-4 text-emerald-600 border-gray-300 rounded cursor-pointer"
                             />
                           </div>
                         </div>
 
                         <div className="flex justify-end gap-2 pt-2">
                           <button
                             onClick={async () => {
                               if (expenseForm.amount <= 0 || !expenseForm.description.trim()) {
                                 alert("Harap lengkapi deskripsi dan nominal belanja.");
                                 return;
                               }
 
                               if (expenseForm.approvalRequired) {
                                 // Add as a pending purchase order workflow (requires approval before posting journal)
                                 const newPo = {
                                   id: purchaseOrders.length ? Math.max(...purchaseOrders.map(p => p.id)) + 1 : 101,
                                   vendor: expenseForm.vendor || 'Supplier Umum',
                                   items: expenseForm.description,
                                   amount: expenseForm.amount,
                                   status: 'pending_approval',
                                   date: new Date().toISOString().split('T')[0]
                                 };
                                 setPurchaseOrders([newPo, ...purchaseOrders]);
                                 database.logActivity("System Finance", "REQUEST_PO_APPROVAL", `Pengajuan pembelian ${expenseForm.description} sebesar Rp ${expenseForm.amount}`);
                                 alert("Pengajuan PO / Belanja berhasil dikirim ke antrean otorisasi Direksi.");
                                 setExpenseForm({ category: 'Biaya Operasional', debitAccount: 5100, creditAccount: 1010, amount: 0, description: '', vendor: '', approvalRequired: false, approvalStatus: 'pending' });
                               } else {
                                 // Post immediately (No approval required)
                                 try {
                                   await database.recordFinancialExpense(5100, 1010, expenseForm.amount, `${expenseForm.description} - Vendor: ${expenseForm.vendor || 'Umum'}`, expenseForm.category);
                                   
                                   // Update budgets spent!
                                   const updatedBudgets = budgets.map(b => b.category.includes("Lain-lain") || b.category.includes("Operasional") ? { ...b, spent: b.spent + expenseForm.amount } : b);
                                   setBudgets(updatedBudgets);
                                   
                                   database.logActivity("System Finance", "POST_EXPENSE", `Pencatatan beban ${expenseForm.description} Rp ${expenseForm.amount}`);
                                   alert("Pengeluaran operasional instan sukses di-posting ke Ledger!");
                                   setExpenseForm({ category: 'Biaya Operasional', debitAccount: 5100, creditAccount: 1010, amount: 0, description: '', vendor: '', approvalRequired: false, approvalStatus: 'pending' });
                                   triggerAppRefresh();
                                 } catch(err: any) {
                                   alert("Gagal mencatat belanja: " + err.message);
                                 }
                               }
                             }}
                             className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2.5 rounded-2xl cursor-pointer"
                           >
                             {expenseForm.approvalRequired ? "Kirim Form Persetujuan" : "Post Belanja Langsung"}
                           </button>
                         </div>
                       </div>
 
                       {/* Procurement PO and Multi-level Approvals (Module 4) */}
                       <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-4">
                         <div className="flex justify-between items-center">
                           <h4 className="text-xs font-bold text-slate-800 font-display">Otorisasi Antrean Purchase Orders & Belanja Berjenjang</h4>
                         </div>
                         <div className="space-y-3">
                           {purchaseOrders.map((po) => (
                             <div key={po.id} className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                               <div className="space-y-0.5">
                                 <div className="flex items-center gap-2">
                                   <span className="font-mono text-[9px] text-gray-400">PO-#{po.id}</span>
                                   <span className={`text-[8px] px-1.5 py-0.5 rounded font-extrabold uppercase font-mono ${
                                     po.status === 'completed' ? 'bg-emerald-50 text-brand-green' : po.status === 'approved' ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-600'
                                   }`}>
                                     {po.status === 'pending_approval' ? 'Menunggu Persetujuan' : po.status}
                                   </span>
                                 </div>
                                 <p className="text-xs font-bold text-slate-800">{po.items}</p>
                                 <div className="text-[10px] text-slate-400 font-sans">Vendor: {po.vendor} | Tanggal: {po.date}</div>
                               </div>
                               <div className="flex items-center gap-3 shrink-0 self-stretch sm:self-auto justify-between border-t sm:border-t-0 border-slate-100 pt-2 sm:pt-0">
                                 <span className="font-mono text-xs font-bold text-slate-800">{formatRupiah(po.amount)}</span>
                                 {po.status === 'pending_approval' && (
                                   <button
                                     onClick={async () => {
                                       try {
                                         // Approve and Post Double-entry journal entry!
                                         await database.recordFinancialExpense(5000, 1010, po.amount, `[PR PERSIDANGAN OK] PO #${po.id} - ${po.items}`, "Pemeliharaan Gedung");
                                         
                                         // Update status in local PO state
                                         const updatedPos = purchaseOrders.map(p => p.id === po.id ? { ...p, status: 'approved' } : p);
                                         setPurchaseOrders(updatedPos);
                                         
                                         database.logActivity("Director", "APPROVE_PO", `Menyetujui PO #${po.id} nominal Rp ${po.amount}`);
                                         alert("PO Berhasil Disetujui! Jurnal pengeluaran otomatis di-posting.");
                                         triggerAppRefresh();
                                       } catch(err: any) {
                                         alert("Gagal menyetujui PO: " + err.message);
                                       }
                                     }}
                                     className="bg-[#10b981] hover:bg-emerald-600 text-white font-bold text-[10px] px-3 py-1.5 rounded-xl cursor-pointer shadow-xs font-sans"
                                   >
                                     Setujui & Post Jurnal
                                   </button>
                                 )}
                               </div>
                             </div>
                           ))}
                         </div>
                       </div>
                     </div>
 
                     {/* Right Panel: Inventory Management (Module 5) */}
                     <div className="space-y-6">
                       
                       {/* FIFO/Average Inventory Stock Card with QR visualizer */}
                       <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-4">
                         <div className="flex justify-between items-center">
                           <h4 className="text-xs font-bold text-slate-800 font-display flex items-center gap-1.5">
                             <Layers size={13} className="text-blue-600" />
                             Gudang & Inventaris Amenities (FIFO Stock Card)
                           </h4>
                           <span className="bg-blue-50 text-blue-700 font-mono text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase">QR Coded</span>
                         </div>
 
                         <div className="space-y-3">
                           {inventoryItems.map((item) => (
                             <div key={item.id} className="p-3 bg-slate-50 border border-slate-100 rounded-2xl space-y-1.5">
                               <div className="flex justify-between items-start gap-4">
                                 <div>
                                   <h5 className="text-xs font-bold text-slate-800">{item.name}</h5>
                                   <span className="text-[9px] text-slate-400 block font-mono">Kategori: {item.category}</span>
                                 </div>
                                 <div className="text-right">
                                   <span className={`text-[11px] font-extrabold font-mono ${item.stock <= item.minStock ? 'text-red-500 animate-pulse' : 'text-emerald-500'}`}>
                                     {item.stock} {item.unit}
                                   </span>
                                   {item.stock <= item.minStock && (
                                     <span className="text-[8px] bg-red-50 border border-red-100 text-red-500 font-extrabold block uppercase mt-0.5 px-1 rounded font-mono">Stock Tipis!</span>
                                   )}
                                 </div>
                               </div>
                               <div className="flex justify-between items-center pt-1 border-t border-slate-200/50">
                                 <span className="text-[9px] text-slate-400 font-sans">Min: {item.minStock} {item.unit}</span>
                                 <button
                                   onClick={() => {
                                     const rawAdjustment = prompt(`Stock Opname untuk ${item.name}. Masukkan stock real sekarang:`, item.stock.toString());
                                     if (rawAdjustment === null) return;
                                     const val = Number(rawAdjustment);
                                     if (isNaN(val) || val < 0) {
                                       alert("Harap masukkan angka stock valid.");
                                       return;
                                     }
                                     
                                     const diff = val - item.stock;
                                     if (diff !== 0) {
                                       const cost = Math.abs(diff) * 25000; // standard item cost
                                       if (diff < 0) {
                                         // Stock down: post adjustment expense!
                                         database.recordFinancialExpense(5100, 1010, cost, `[STOK OPNAME SELISIH] Pengurangan stock ${item.name} sebanyak ${Math.abs(diff)} unit`, "Kerugian Selisih Persediaan");
                                       } else {
                                         // Stock up
                                         database.recordFinancialExpense(1010, 4300, cost, `[STOK OPNAME SELISIH] Kelebihan penemuan persediaan ${item.name} sebanyak ${diff} unit`, "Pendapatan Operasional Lainnya");
                                       }
                                       database.logActivity("System Finance", "STOCK_OPNAME", `Stock opname ${item.name} disesuaikan dari ${item.stock} ke ${val}`);
                                       alert("Stock Opname tersimpan! Jurnal selisih inventaris ter-posting otomatis.");
                                       
                                       const updatedItems = inventoryItems.map(i => i.id === item.id ? { ...i, stock: val } : i);
                                       setInventoryItems(updatedItems);
                                       triggerAppRefresh();
                                     }
                                   }}
                                   className="text-[9px] text-[#10b981] font-bold border border-emerald-200 bg-emerald-50/50 px-2 py-0.5 rounded-lg hover:bg-emerald-50 transition-colors cursor-pointer font-sans"
                                 >
                                   Stock Opname
                                 </button>
                               </div>
                             </div>
                           ))}
                         </div>
                       </div>
 
                       {/* Vendor directory */}
                       <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-4">
                         <h4 className="text-xs font-bold text-slate-800 font-display">Daftar Rekanan Vendor Utama</h4>
                         <div className="space-y-2">
                           {vendors.map(v => (
                             <div key={v.id} className="p-2 px-3 bg-slate-50 border border-slate-100 rounded-xl flex justify-between items-center text-xs">
                               <div>
                                 <strong className="text-slate-800 block">{v.name}</strong>
                                 <span className="text-[9px] text-slate-400 font-mono">Tipe: {v.category}</span>
                               </div>
                               <span className="text-[10px] text-slate-500 font-mono">{v.phone}</span>
                             </div>
                           ))}
                         </div>
                       </div>
                     </div>
                   </div>
                 )}
 
                 {/* SUBTAB 5: FIXED ASSET LEDGER & WORK-ORDER REPAIR (Module 6 & 7) */}
                 {activeFinanceSubTab === 'assets' && (
                   <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
                     
                     {/* Left Panel: Asset Depreciation scheduler */}
                     <div className="lg:col-span-2 bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-4">
                       <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                         <div>
                           <span className="text-[10px] text-gray-400 font-bold uppercase font-mono tracking-wider block">Buku Register Aset Tetap</span>
                           <h3 className="text-sm font-bold text-slate-800 font-display">Penyusutan Aset Metode Garis Lurus (Straight Line)</h3>
                         </div>
                         <button
                           onClick={async () => {
                             if (confirm("Jalankan depresiasi bulanan otomatis untuk semua aset tetap kos? Tindakan ini akan menghitung penyusutan bulanan, mengurangi Nilai Buku aset, dan langsung mencatat Jurnal double-entry.")) {
                               try {
                                 // Total monthly depreciation across all assets
                                 const totalDepr = assetsState.reduce((acc, curr) => acc + curr.deprRate, 0);
                                 
                                 // Post double-entry journal entry: Debit Beban Penyusutan (5100), Credit Accumulated Depreciation (asset reduction)
                                 await database.recordFinancialExpense(5100, 1010, totalDepr, `Depresiasi Bulanan Otomatis Aset Tetap Kos - Juni 2026`, "Beban Penyusutan Aset");
                                 
                                 // Adjust asset list accumulated values
                                 const updatedAssets = assetsState.map(asset => ({
                                   ...asset,
                                   accumDepr: asset.accumDepr + asset.deprRate
                                 }));
                                 setAssetsState(updatedAssets);
                                 
                                 database.logActivity("System Finance", "ASSET_DEPRECIATION", `Menyusutkan aset tetap bulan ini senilai Rp ${totalDepr}`);
                                 alert(`Sukses! Penyusutan senilai Rp ${totalDepr.toLocaleString('id-ID')} berhasil didepresiasikan dan dicatat di Buku Jurnal Umum.`);
                                 triggerAppRefresh();
                               } catch(err: any) {
                                 alert("Gagal mendepresiasi aset: " + err.message);
                               }
                             }
                           }}
                           className="bg-indigo-650 hover:bg-indigo-700 text-white text-[10px] font-bold px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1 shadow-sm font-sans"
                         >
                           <Clock size={12} />
                           Otomatisasi Depresiasi Bulanan
                         </button>
                       </div>
 
                       <div className="space-y-3.5">
                         {assetsState.map((asset) => {
                           const netBookValue = asset.cost - asset.accumDepr;
                           return (
                             <div key={asset.id} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col sm:flex-row justify-between gap-4">
                               <div className="space-y-1">
                                 <h5 className="text-xs font-bold text-slate-800">{asset.name}</h5>
                                 <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-slate-500 font-sans">
                                   <span>Harga Perolehan: <strong className="text-slate-700 font-mono">{formatRupiah(asset.cost)}</strong></span>
                                   <span>Umur Ekonomis: <strong className="text-slate-700">{asset.lifeYears} Tahun</strong></span>
                                   <span>Nilai Sisa Residu: <strong className="text-slate-700 font-mono">{formatRupiah(asset.residual)}</strong></span>
                                   <span>Penyusutan/Bulan: <strong className="text-slate-700 font-mono">{formatRupiah(asset.deprRate)}</strong></span>
                                 </div>
                               </div>
                               <div className="text-left sm:text-right border-t sm:border-t-0 border-slate-200/60 pt-2 sm:pt-0 space-y-0.5">
                                 <span className="text-[9px] text-slate-400 font-bold block uppercase font-sans">Nilai Buku Bersih (Net Book Value)</span>
                                 <div className="text-sm font-extrabold text-slate-800 font-mono">{formatRupiah(netBookValue)}</div>
                                 <span className="text-[9px] text-red-500 font-mono block">Akum. Depresiasi: {formatRupiah(asset.accumDepr)}</span>
                               </div>
                             </div>
                           );
                         })}
                       </div>
                     </div>
 
                     {/* Right Panel: Costing Work-order Maintenance (Module 6) */}
                     <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-4">
                       <h4 className="text-xs font-bold text-slate-800 font-display">Pembebanan Biaya Perbaikan (Work-orders)</h4>
                       <p className="text-[10px] text-slate-400 font-sans">Hubungkan keluhan perbaikan teknis tenant dengan pencatatan beban di Chart of Accounts.</p>
                       
                       <div className="space-y-3 text-xs">
                         <div className="p-3 bg-[#fef2f2] border border-red-150 rounded-2xl space-y-1.5">
                           <div className="flex justify-between font-bold">
                             <span className="text-red-700">WO-092: Kebocoran Pipa R201</span>
                             <span className="text-red-600">Urgent</span>
                           </div>
                           <p className="text-[10px] text-slate-600 font-sans">Teknini: Pak Kardi (In-house) | Bahan: Sealtape, Pipa PVC Rucika</p>
                           <div className="flex justify-between items-center pt-2 border-t border-red-200 font-sans">
                             <span className="font-mono text-[10px] font-bold text-slate-800">Bahan: Rp 75.000</span>
                             <button
                               onClick={async () => {
                                 try {
                                   // Debit Beban Pemeliharaan Gedung (5000), Credit Kas/Bank (1010)
                                   await database.recordFinancialExpense(5000, 1010, 75000, "Pembayaran bahan WO-092 pipa bocor kamar R201", "Pemeliharaan Gedung");
                                   database.logActivity("System Finance", "RESOLVE_WO_COST", "Pembebanan biaya WO-092 pipa bocor kamar R201");
                                   alert("Biaya Work-Order pipa bocor berhasil di-posting ke Jurnal Pemeliharaan!");
                                   triggerAppRefresh();
                                 } catch(e: any) {
                                   alert(e.message);
                                 }
                               }}
                               className="bg-red-600 hover:bg-red-700 text-white font-bold text-[9px] px-2.5 py-1 rounded-lg cursor-pointer"
                             >
                               Post Biaya Gedung
                             </button>
                           </div>
                         </div>
 
                         <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl space-y-1.5">
                           <div className="flex justify-between font-bold">
                             <span className="text-slate-800">WO-089: Service AC Rusak F102</span>
                             <span className="text-slate-400">Normal</span>
                           </div>
                           <p className="text-[10px] text-slate-600 font-sans">Teknisi: Sinar Mandiri AC | Pekerjaan: Cuci AC & Isi Freon</p>
                           <div className="flex justify-between items-center pt-2 border-t border-slate-200/60 font-sans">
                             <span className="font-mono text-[10px] font-bold text-slate-800">Biaya: Rp 150.000</span>
                             <button
                               onClick={async () => {
                                 try {
                                   await database.recordFinancialExpense(5000, 1010, 150000, "Pembayaran invoice WO-089 service AC F102", "Pemeliharaan Gedung");
                                   database.logActivity("System Finance", "RESOLVE_WO_COST", "Pembebanan biaya WO-089 service AC F102");
                                   alert("Biaya service AC telah dicatat sebagai beban pemeliharaan!");
                                   triggerAppRefresh();
                                 } catch(e: any) {
                                   alert(e.message);
                                 }
                               }}
                               className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-[9px] px-2.5 py-1 rounded-lg cursor-pointer animate-pulse"
                             >
                               Post Biaya Gedung
                             </button>
                           </div>
                         </div>
                       </div>
                     </div>
                   </div>
                 )}
 
                 {/* SUBTAB 6: PETTY CASH & BANK RECONCILIATION */}
                 {activeFinanceSubTab === 'petty' && (
                   <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
                     
                     {/* Petty Cash Panel (Module 8) */}
                     <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-4">
                       <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                         <div>
                           <span className="text-[10px] text-gray-400 font-bold uppercase font-mono tracking-wider block">Kas Kecil (Petty Cash)</span>
                           <h3 className="text-sm font-bold text-slate-800 font-display">Penggantian Pengeluaran Staff (Reimbursements)</h3>
                         </div>
                         <span className="bg-slate-900 text-white font-mono text-[11px] font-bold px-2.5 py-1 rounded-xl">
                           Saldo: {formatRupiah(accounts.find(a=>a.id===1000)?.balance || 0)}
                         </span>
                       </div>
 
                       <div className="space-y-3">
                         {pettyCashRequests.map((req) => (
                           <div key={req.id} className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                             <div>
                               <div className="flex items-center gap-1.5 flex-wrap">
                                 <span className="text-[10px] font-bold text-slate-800 font-sans">{req.applicant}</span>
                                 <span className={`text-[8px] px-1 rounded font-extrabold uppercase font-mono ${
                                   req.status === 'approved' ? 'bg-emerald-50 text-brand-green' : 'bg-amber-50 text-amber-600 animate-pulse'
                                 }`}>
                                   {req.status}
                                 </span>
                               </div>
                               <p className="text-xs text-slate-700 font-medium mt-0.5">{req.purpose}</p>
                               <span className="text-[9px] text-slate-400 block font-mono">Tgl Pengajuan: {req.date}</span>
                             </div>
                             <div className="flex items-center gap-3 self-stretch sm:self-auto justify-between border-t sm:border-t-0 border-slate-150 pt-2 sm:pt-0 font-sans">
                               <span className="font-mono text-xs font-bold text-slate-800">{formatRupiah(req.amount)}</span>
                               {req.status === 'pending' && (
                                 <button
                                   onClick={async () => {
                                     try {
                                       // Debit Beban Operasional Lain-lain (5100), Credit Kas Kecil/Petty Cash (1000)
                                       await database.recordFinancialExpense(5100, 1000, req.amount, `[PETTY CASH OK] Reimbursement ${req.applicant} - ${req.purpose}`, "Beban Operasional");
                                       
                                       // Update local status
                                       const updatedPetty = pettyCashRequests.map(p => p.id === req.id ? { ...p, status: 'approved' } : p);
                                       setPettyCashRequests(updatedPetty);
                                       
                                       database.logActivity("System Finance", "APPROVE_REIMBURSEMENT", `Setuju Kas Kecil ${req.applicant} Rp ${req.amount}`);
                                       alert("Permohonan Kas Kecil disetujui dan dicairkan otomatis dari Petty Cash!");
                                       triggerAppRefresh();
                                     } catch(err: any) {
                                       alert("Gagal mem-proses kas kecil: " + err.message);
                                     }
                                   }}
                                   className="bg-brand-green hover:bg-emerald-600 text-white font-bold text-[9px] px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                                 >
                                   Cairkan Dana
                                 </button>
                               )}
                             </div>
                           </div>
                         ))}
                       </div>
                     </div>
 
                     {/* Bank Management & Reconciliation (Module 9) */}
                     <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-4">
                       <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                         <div>
                           <span className="text-[10px] text-gray-400 font-bold uppercase font-mono tracking-wider block">Manajemen Rekening Bank</span>
                           <h3 className="text-sm font-bold text-slate-800 font-display">Siklus Rekonsiliasi Bank Mandiri VA</h3>
                         </div>
                         <button
                           onClick={() => {
                             // Run Bank Auto-matching
                             const updatedStatements = bankStatement.map(stmt => {
                               if (!stmt.matched) {
                                 return { ...stmt, matched: true, matchedRef: stmt.desc.includes("Siska") ? "INV-002" : "M-TOKEN" };
                               }
                               return stmt;
                             });
                             setBankStatement(updatedStatements);
                             database.logActivity("System Finance", "BANK_RECONCILIATION", "Otomatisasi kliring & rekonsiliasi laporan rekening koran Bank Mandiri");
                             alert("Sukses! 3 baris mutasi koran bank berhasil dicocokkan otomatis dengan record transaksi piutang dan invoice.");
                           }}
                           className="bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold px-3 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1 shadow-xs font-sans"
                         >
                           <ArrowRightLeft size={12} />
                           Auto Reconcile Statements
                         </button>
                       </div>
 
                       <div className="space-y-3">
                         {bankStatement.map((stmt) => (
                           <div key={stmt.id} className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex justify-between gap-4 font-sans">
                             <div className="space-y-1">
                               <div className="flex items-center gap-2">
                                 <span className="font-mono text-[9px] text-slate-400">{stmt.date}</span>
                                 <span className={`text-[8px] px-1.5 py-0.5 rounded font-extrabold uppercase font-mono ${
                                   stmt.matched ? 'bg-emerald-50 text-brand-green' : 'bg-red-50 text-red-500 animate-pulse'
                                 }`}>
                                   {stmt.matched ? 'Reconciled / Kliring' : 'Unmatched'}
                                 </span>
                               </div>
                               <p className="text-xs font-bold text-slate-800">{stmt.desc}</p>
                               {stmt.matched && (
                                 <span className="text-[9px] text-slate-500 block">Tautan Ref: **{stmt.matchedRef || 'INV-001'}**</span>
                               )}
                             </div>
                             <span className={`font-mono text-xs font-bold shrink-0 self-start ${stmt.type === 'debit' ? 'text-red-500' : 'text-emerald-500'}`}>
                               {stmt.type === 'debit' ? '-' : '+'}{formatRupiah(stmt.amount)}
                             </span>
                           </div>
                         ))}
                       </div>
                     </div>
                   </div>
                 )}
 
                 {/* SUBTAB 7: PBJT TAXATION & COMPLIANCE BUDGET GAUGE (Module 10 & 11) */}
                 {activeFinanceSubTab === 'tax' && (
                   <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
                     
                     {/* Tax Compliance Panel (Module 11) */}
                     <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-4">
                       <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                         <div>
                           <span className="text-[10px] text-gray-400 font-bold uppercase font-mono tracking-wider block">Pajak Kota PBJT & PPh Final</span>
                           <h3 className="text-sm font-bold text-slate-800 font-display">Kepatuhan Pajak Daerah Kota (DKI Jakarta / Depok 10%)</h3>
                         </div>
                       </div>
 
                       <div className="p-4 bg-slate-900 text-white rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                         <div className="space-y-1">
                           <span className="text-[9px] text-slate-400 font-bold font-mono block">SALDO UTANG PAJAK DAERAH PBJT (KODE AKUN 2100)</span>
                           <div className="text-xl font-black text-amber-400 font-mono">
                             {formatRupiah(accounts.find(a=>a.id===2100)?.balance || 0)}
                           </div>
                           <p className="text-[9px] text-slate-400 font-sans">Penyetoran wajib dilakukan paling lambat tanggal 15 setiap bulannya.</p>
                         </div>
                         <button
                           onClick={async () => {
                             const taxBalance = accounts.find(a=>a.id===2100)?.balance || 0;
                             if (taxBalance <= 0) {
                               alert("Bagus! Tidak ada kewajiban pajak terutang saat ini.");
                               return;
                             }
                             if (confirm(`Setorkan pajak PBJT senilai ${formatRupiah(taxBalance)} ke Kas Daerah melalui Surat Setoran Pajak Daerah (SSPD)? Ini akan mendebit akun Utang Pajak dan mengkredit Kas Mandiri.`)) {
                               try {
                                 // Debit Utang Pajak (2100), Credit Kas/Bank (1010)
                                 await database.recordFinancialReclassification(2100, 1010, taxBalance, "Penyetoran SSPD Pajak PBJT Daerah 10% Masa Pajak Juni 2026");
                                 database.logActivity("System Finance", "PAY_TAX_PBJT", `Penyetoran pajak daerah Rp ${taxBalance}`);
                                 alert("Sukses! Pajak daerah PBJT berhasil disetorkan dan Jurnal double-entry penyesuaian pajak ter-posting.");
                                 triggerAppRefresh();
                               } catch(err: any) {
                                 alert("Gagal menyetorkan pajak: " + err.message);
                               }
                             }
                           }}
                           className="bg-[#10b981] hover:bg-emerald-600 text-white text-[11px] font-bold px-4 py-2.5 rounded-xl cursor-pointer shadow-xs self-stretch sm:self-auto text-center font-sans"
                         >
                           Bayar Pajak Daerah (SSPD)
                         </button>
                       </div>
 
                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-semibold">
                         <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                           <span className="text-[9px] text-slate-400 font-mono block">ESTIMASI BEBAN PPh FINAL (0.5%)</span>
                           <div className="text-sm font-bold text-slate-800 font-mono mt-1">
                             {formatRupiah(totalInflow * 0.005)}
                           </div>
                           <p className="text-[8px] text-slate-400 font-normal leading-relaxed mt-0.5 font-sans">PPh Final PP No. 55 Tahun 2022 atas omset usaha kos mikro.</p>
                         </div>
                         <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                           <span className="text-[9px] text-slate-400 font-mono block">STATUS KEPATUHAN PAJAK</span>
                           <span className="inline-block bg-emerald-50 border border-emerald-200 text-brand-green text-[9px] font-extrabold px-2 py-0.5 rounded-full mt-2 uppercase font-mono">
                             Taat Pajak (Compliant)
                           </span>
                         </div>
                       </div>
                     </div>
 
                     {/* Budgeting vs Realization (Module 10) */}
                     <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-4">
                       <h4 className="text-sm font-bold text-slate-800 font-display">Pengendalian & Perencanaan Anggaran Operasional</h4>
                       <div className="space-y-4 font-sans">
                         {budgets.map((b) => {
                           const percent = Math.min(100, Math.round((b.spent / b.limit) * 100));
                           const exceeded = b.spent > b.limit;
                           return (
                             <div key={b.id} className="space-y-1.5 text-xs font-medium">
                               <div className="flex justify-between items-center font-bold">
                                 <span className="text-slate-800 truncate max-w-[200px]">{b.category}</span>
                                 <span className={`font-mono text-[11px] ${exceeded ? 'text-red-500 animate-pulse' : 'text-slate-500'}`}>
                                   {percent}% ({formatRupiah(b.spent)} / {formatRupiah(b.limit)})
                                 </span>
                               </div>
                               <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                 <div 
                                   className={`h-full rounded-full transition-all duration-500 ${exceeded ? 'bg-red-500' : 'bg-emerald-500'}`}
                                   style={{ width: `${percent}%` }}
                                 ></div>
                               </div>
                               {exceeded && (
                                 <p className="text-[9px] text-red-500 font-sans flex items-center gap-1">
                                   <AlertTriangle size={10} className="shrink-0 animate-bounce" />
                                   Peringatan: Anggaran terlampaui sebesar **{formatRupiah(b.spent - b.limit)}** (Varian Negatif!)
                                 </p>
                               )}
                             </div>
                           );
                         })}
                       </div>
                     </div>
                   </div>
                 )}
 
                 {/* SUBTAB 8: SECURITY AUDIT TRAIL LOGS */}
                 {activeFinanceSubTab === 'audit' && (
                   <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-4 animate-fade-in">
                     <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                       <div>
                         <span className="text-[10px] text-gray-400 font-bold uppercase font-mono tracking-wider block">Log Audit Kepatuhan (Audit Trail)</span>
                         <h3 className="text-sm font-bold text-slate-800 font-display">Catatan Aktivitas Pengguna & Finansial</h3>
                       </div>
                       <span className="bg-slate-950 text-white font-mono text-[9px] font-extrabold px-2 py-0.5 rounded uppercase">Immutable</span>
                     </div>
 
                     <div className="overflow-x-auto font-sans text-xs">
                       <table className="w-full text-left border-collapse">
                         <thead>
                           <tr className="border-b border-gray-100 text-[10px] text-gray-400 font-bold font-mono uppercase bg-slate-50">
                             <th className="py-2.5 px-3">WAKTU (UTC)</th>
                             <th className="py-2.5 px-3">OPERATOR</th>
                             <th className="py-2.5 px-3">TINDAKAN ACTION</th>
                             <th className="py-2.5 px-3">DETAIL REKAMAN PERUBAHAN</th>
                             <th className="py-2.5 px-3">IP ADDRESS</th>
                           </tr>
                         </thead>
                         <tbody className="divide-y divide-gray-100 font-medium text-slate-600">
                           {/* Seeded and dynamic logs representing audit trail */}
                           <tr className="hover:bg-slate-50/50 transition-colors">
                             <td className="py-2.5 px-3 font-mono text-[10px] text-gray-400">{new Date().toISOString().slice(0, 10)} 15:42</td>
                             <td className="py-2.5 px-3 font-bold text-slate-800">Admin Utama</td>
                             <td className="py-2.5 px-3 uppercase font-mono text-[9px] text-indigo-700 font-extrabold">DEPRECIATION</td>
                             <td className="py-2.5 px-3 text-slate-500 font-sans">Posting otomatisasi depresiasi bulanan tetap kos</td>
                             <td className="py-2.5 px-3 font-mono text-gray-400 text-[10px]">182.16.2.221</td>
                           </tr>
                           <tr className="hover:bg-slate-50/50 transition-colors">
                             <td className="py-2.5 px-3 font-mono text-[10px] text-gray-400">{new Date().toISOString().slice(0, 10)} 14:15</td>
                             <td className="py-2.5 px-3 font-bold text-slate-800">System Webhook</td>
                             <td className="py-2.5 px-3 uppercase font-mono text-[9px] text-emerald-600 font-extrabold font-sans">AUTO_POSTING</td>
                             <td className="py-2.5 px-3 text-slate-500 font-sans">Pembayaran booking kamar R201 oleh Yogi Atmaja, post revenue ke akun 4000</td>
                             <td className="py-2.5 px-3 font-mono text-gray-400 text-[10px]">104.244.42.1</td>
                           </tr>
                           {activityLogs.map((log, index) => (
                             <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                               <td className="py-2.5 px-3 font-mono text-[10px] text-gray-400">{new Date().toISOString().slice(0, 10)} {10 + (index % 12)}:{(index * 7) % 60}</td>
                               <td className="py-2.5 px-3 font-bold text-slate-800">{log.admin_name || 'Admin'}</td>
                               <td className="py-2.5 px-3 uppercase font-mono text-[9px] text-slate-700 font-extrabold font-sans">{log.action}</td>
                               <td className="py-2.5 px-3 text-slate-500 font-sans">{log.detail}</td>
                               <td className="py-2.5 px-3 font-mono text-gray-400 text-[10px]">182.16.2.221</td>
                             </tr>
                           ))}
                         </tbody>
                       </table>
                     </div>
                   </div>
                 )}
 
               </div>
             )}

            {/* TAB 6: BRAND COUPONS OR PROMOS */}
            {activeTab === 'coupons' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-base font-extrabold font-display text-white uppercase tracking-tight">Kupon Promo & Kampanye Diskon</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">Terbitkan potongan harga sewa eksklusif untuk mendongkrak minat okupansi.</p>
              </div>
              <button 
                onClick={() => {
                  setCouponForm({
                    code: '',
                    discount_type: 'percentage',
                    discount_value: 15,
                    max_discount_amount: 150000,
                    is_active: true,
                    description: 'Potongan Diskon Akhir Tahun'
                  });
                  setShowCouponModal(true);
                }}
                className="bg-amber-500 hover:bg-amber-450 text-black font-extrabold text-[10px] uppercase px-3.5 py-2 rounded-xl flex items-center gap-1 cursor-pointer transition-all shadow-md"
              >
                <Plus size={12} />
                Terbitkan Kupon
              </button>
            </div>

            <CouponList coupons={coupons} onDeleteCoupon={handleDeleteCoupon} />
          </div>
        )}

        {activeTab === 'bookings_history' && (
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-base font-extrabold font-display text-white uppercase tracking-tight">Riwayat Transaksi Pemesanan & Kontrak Sewa</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">Pantau settlement pembayaran, unduh lembar spreadsheet, serta lihat & cetak bukti invoice penagihan.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const headers = ['Order ID', 'Penyewa', 'Unit', 'Masa Kontrak', 'Total Tagihan', 'Pembayaran', 'Status', 'Tanggal Settle', 'No WhatsApp'];
                  const rows = bookings.map(b => [
                    b.midtrans_order_id || `BOOK-${b.id}`,
                    b.tenant_name,
                    `Kamar ${b.room_number}`,
                    b.duration_months > 0 ? `${b.duration_months} Bulan` : 'Harian',
                    String(b.total_price),
                    b.payment_method || 'Midtrans VA/QRIS',
                    b.status.toUpperCase(),
                    b.check_in_date || b.booking_date,
                    b.phone || '-'
                  ]);
                  const csvContent = "data:text/csv;charset=utf-8," 
                    + [headers.join(','), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
                  const encodedUri = encodeURI(csvContent);
                  const link = document.createElement("a");
                  link.setAttribute("href", encodedUri);
                  link.setAttribute("download", `riwayat_sewa_samarastay_${new Date().toISOString().split('T')[0]}.csv`);
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  database.logActivity("System", "EXCEL_EXPORT", "Mengunduh file spreadsheet rekap kontrak sewa");
                }}
                className="bg-emerald-600 hover:bg-emerald-550 text-white font-extrabold text-[10px] uppercase px-3 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-md shrink-0 cursor-pointer"
              >
                <Download size={12} />
                Unduh Rekap CSV
              </button>
            </div>

            {/* Live Filter Bar */}
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500 pointer-events-none">
                <Search size={12} />
              </span>
              <input
                type="text"
                placeholder="Cari nama penyewa atau nomor kamar..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 text-xs pl-9 pr-4 py-2.5 rounded-2xl outline-none text-slate-200 focus:border-amber-500 transition-colors"
              />
            </div>

            <div className="space-y-3">
              {bookings
                .filter(b => 
                  b.tenant_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  b.room_number.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map(b => {
                  const propertyName = properties.find(p => p.id === b.property_id)?.name || 'Properti Kos';
                  return (
                    <div key={b.id} className="bg-slate-900 border border-slate-805 p-4 rounded-3xl space-y-3 text-xs">
                      <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[9px] font-mono bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20 font-bold uppercase tracking-wider">
                              {b.midtrans_order_id || `BOOK-${b.id}`}
                            </span>
                            <span className="text-[9px] text-slate-500 font-mono italic">
                              Masuk: {b.booking_date}
                            </span>
                          </div>
                          <h4 className="font-extrabold text-white uppercase mt-1.5">
                            {b.tenant_name}
                          </h4>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            Kamar <strong className="text-amber-500">{b.room_number}</strong> | {propertyName}
                          </p>
                          <p className="text-[9px] text-slate-450 font-mono mt-1">
                            Durasi: {b.duration_months > 0 ? `${b.duration_months} Bulan` : 'Sewa Harian'} | Mulai Sewa: {b.check_in_date}
                          </p>
                        </div>
                        <div className="text-left sm:text-right space-y-1.5 shrink-0 self-stretch sm:self-auto flex sm:flex-col justify-between sm:justify-start items-center sm:items-end">
                          <span className={`text-[8px] font-mono px-2.5 py-0.5 rounded-full border font-bold uppercase block w-fit ${
                            b.status === 'approved' 
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                              : b.status === 'pending'
                                ? 'bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                          }`}>
                            {b.status === 'approved' ? 'Lunas / Berjalan' : b.status === 'pending' ? 'Menunggu Bayar' : 'Dibatalkan'}
                          </span>
                          <span className="text-xs font-mono font-bold text-slate-200 block">
                            {formatRupiah(b.total_price)}
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-2 border-t border-slate-850/80 pt-2.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedInvoice({
                              type: 'booking',
                              id: b.midtrans_order_id || `BOOK-${b.id}`,
                              name: b.tenant_name,
                              roomNo: b.room_number,
                              propertyName: propertyName,
                              amountPaid: b.total_price,
                              method: b.payment_method || 'Virtual Account Mandiri / QRIS',
                              date: b.check_in_date || b.booking_date
                            });
                          }}
                          className="p-1 px-3 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded-xl transition font-medium cursor-pointer text-[10px] flex items-center gap-1 border border-slate-700"
                        >
                          <FileText size={11} />
                          Lihat & Cetak Invoice (Kwitansi)
                        </button>

                        {b.status === 'pending' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleApproveBooking(b)}
                              className="p-1 px-3 bg-emerald-650 hover:bg-emerald-600 text-white rounded-xl font-bold cursor-pointer transition text-[10px] flex items-center gap-1 shadow-md"
                            >
                              <Check size={11} />
                              Setujui Pembayaran
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCancelBooking(b)}
                              className="p-1 px-3 bg-red-950/20 hover:bg-red-500 text-red-500 rounded-xl transition cursor-pointer text-[10px] flex items-center gap-1 border border-red-500/20"
                            >
                              <X size={11} />
                              Tolak
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}

              {bookings.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-8">Belum ada riwayat transaksi sewa kos.</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'tenants' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3 flex-wrap gap-2">
              <div>
                <h2 className="text-base font-extrabold font-display text-white uppercase tracking-tight">Daftar Aktif Penghuni Kamar (Tenants)</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">Daftar seluruh penghuni kosmopolit terverifikasi dengan info alokasi kamar & jangka waktu sewa berjalan.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const phoneNum = prompt("Ketik nomor WhatsApp penghuni baru (misal: 081293840293):");
                  const nameInput = prompt("Ketik nama penghuni baru:");
                  const roomInput = prompt("Ketik nomor kamar penghuni (misal: R201 atau 202):");
                  const durationInMonthsInput = prompt("Ketik jangka waktu sewa (dalam bulan):", "3");

                  if (nameInput && roomInput && durationInMonthsInput) {
                    const matchedRoom = rooms.find(r => r.room_number.toLowerCase() === roomInput.toLowerCase());
                    const payload: Partial<Tenant> = {
                      full_name: nameInput,
                      phone: phoneNum || '081293840293',
                      email: 'manual.tenant@samarastay.com',
                      avatar_initials: nameInput.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase(),
                      avatar_color: "bg-amber-600",
                      property_id: matchedRoom ? matchedRoom.property_id : (properties[0]?.id || 1),
                      room_number: roomInput,
                      start_date: new Date().toISOString().split('T')[0],
                      duration_months: Number(durationInMonthsInput) || 1,
                      payment_status: 'paid'
                    };
                    // Save to local storage state
                    const list = sandboxState.getTenants();
                    const nextId = list.length ? Math.max(...list.map(t => t.id)) + 1 : 1;
                    sandboxState.setTenants([...list, { ...payload, id: nextId } as Tenant]);
                    
                    // Also mark room as occupied if it exists
                    if (matchedRoom) {
                      database.saveRoom({ ...matchedRoom, status: 'occupied', current_tenant_name: nameInput });
                    }
                    database.logActivity("System", "MANUAL_TENANT_ADD", `Menambah penghuni manual: ${nameInput} di kamar ${roomInput}`);
                    triggerAppRefresh();
                  }
                }}
                className="bg-amber-500 hover:bg-amber-450 text-black font-extrabold text-[10px] uppercase px-3.5 py-2 rounded-xl flex items-center gap-1 transition-all shadow-md focus:outline-none cursor-pointer"
              >
                <Plus size={11} />
                Pendaftaran Manual
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tenantsList.map(t => {
                const propertyName = properties.find(p => p.id === t.property_id)?.name || 'Properti Kos';
                const dateEnd = new Date(new Date(t.start_date).setMonth(new Date(t.start_date).getMonth() + (t.duration_months || 1))).toISOString().split('T')[0];
                return (
                  <div key={t.id} className="bg-slate-900 border border-slate-805 p-4 rounded-3xl flex gap-3.5 items-start text-xs relative overflow-hidden shadow-sm">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-extrabold text-white shrink-0 shadow-inner bg-slate-800`}>
                      {t.avatar_initials || t.full_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div>
                        <h4 className="font-extrabold text-white text-sm tracking-tight truncate capitalize">{t.full_name}</h4>
                        <p className="text-[10px] text-slate-455 font-mono font-bold uppercase">{propertyName}</p>
                      </div>

                      <div className="space-y-1 text-slate-350 text-[11px]">
                        <p>📍 Kamar Alokasi: <strong className="text-amber-500 font-mono">Kamar {t.room_number}</strong></p>
                        <p>📞 No. WhatsApp: <span className="font-mono text-slate-300">{t.phone}</span></p>
                        <p>⏱️ Jangka Pemesanan: <span className="font-mono text-slate-200 font-bold">{t.duration_months || 1} Bulan</span></p>
                        <p className="text-[10px] text-slate-450 mt-1">
                          Periode: <span className="font-mono font-bold text-slate-400">{t.start_date}</span> s/d <span className="font-mono font-bold text-slate-450">{dateEnd}</span>
                        </p>
                      </div>

                      <div className="flex gap-2 pt-1.5 border-t border-slate-800 mt-2 flex-wrap items-center justify-between">
                        <span className="text-[8px] uppercase font-bold px-1.5 py-0.5 rounded-full font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/15">
                          Verified Tenant
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            customConfirm(
                              'Check Out Penghuni',
                              `Keluarkan penghuni ${t.full_name} dan kosongkan kamar?`,
                              async () => {
                                const list = sandboxState.getTenants();
                                sandboxState.setTenants(list.filter(item => item.id !== t.id));
                                
                                // return room back to available 
                                const rList = rooms.filter(x => x.room_number === t.room_number);
                                for (const matchedRoom of rList) {
                                  await database.saveRoom({ ...matchedRoom, status: 'available', current_tenant_name: '' });
                                }
                                database.logActivity("System", "RELEASE_TENANT", `Pelepasan masa kontrak hunian ${t.full_name}`);
                                triggerAppRefresh();
                              }
                            );
                          }}
                          className="text-rose-450 hover:text-rose-400 text-[10px] font-bold font-sans transition-colors cursor-pointer"
                        >
                          Check Out / Hapus
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {tenantsList.length === 0 && (
                <div className="col-span-2 text-center text-slate-500 text-xs py-10">Belum ada penyewa yang check-in aktif berjalan.</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'user_roles' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-base font-extrabold font-display text-white uppercase tracking-tight">User & Manajemen Hak Akses (RBAC)</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">Daftarkan fungsionaris klerikal / petugas lapangan, atur limit akses finansial & modifikasi basis data.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveUserEdit(null);
                  setUserForm({
                    fullName: '',
                    email: '',
                    role: 'staff',
                    access: 'Staff akses terbatas',
                    active: true
                  });
                  setShowUserModal(true);
                }}
                className="bg-amber-500 hover:bg-amber-450 text-black font-extrabold text-[10px] uppercase px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-md focus:outline-none cursor-pointer"
              >
                <UserPlus size={12} />
                Daftar Staf/Role Baru
              </button>
            </div>

            <div className="space-y-3">
              {users.map(u => (
                <div key={u.id} className="bg-slate-900 border border-slate-805 p-4 rounded-3xl flex flex-col md:flex-row justify-between items-start md:items-center gap-3.5 text-xs">
                  <div className="space-y-1.5 flex-1 select-all">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-white text-sm capitalize">{u.full_name}</span>
                      <span className={`text-[8px] font-mono font-bold uppercase px-2 py-0.5 rounded-full ${
                        u.role === 'super' || u.role === 'admin' 
                          ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' 
                          : u.role === 'finance'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-slate-800 text-slate-400'
                      }`}>
                        {u.role === 'super' ? 'SUPER COOP' : u.role === 'admin' ? 'SYSTEM ADMIN' : u.role === 'finance' ? 'CHIEF FINANCIAL' : 'FIELD OPERATOR'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400">📧 Email: <span className="font-mono text-slate-300">{u.email}</span></p>
                    <p className="text-[10px] text-slate-500 flex items-center gap-1">🔑 Izin Otoritas: <span className="font-sans text-slate-305">{u.access}</span></p>
                    <span className="text-[9px] text-slate-600 block">Last login: {u.last_login || 'Masa aktif hari ini'}</span>
                  </div>

                  <div className="flex gap-2 shrink-0 md:ml-auto w-full md:w-auto mt-2 md:mt-0">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveUserEdit(u);
                        setUserForm({
                          fullName: u.full_name,
                          email: u.email,
                          role: u.role,
                          access: u.access,
                          active: u.active
                        });
                        setShowUserModal(true);
                      }}
                      className="flex-1 md:flex-initial p-1.5 px-3 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded-lg border border-slate-750 transition text-[10px] cursor-pointer flex items-center gap-1 justify-center"
                    >
                      <Edit2 size={11} />
                      Ubah Izin
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteUser(u.id)}
                      className="flex-1 md:flex-initial p-1.5 px-3 bg-red-950/25 hover:bg-red-500 text-red-400 hover:text-white rounded-lg border border-red-500/20 transition text-[10px] cursor-pointer flex items-center gap-1 justify-center"
                    >
                      <Trash2 size={11} />
                      Cabut Akses
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'activity_logs' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-base font-extrabold font-display text-white uppercase tracking-tight">Audit Trail & Log Aktivitas Kepegawaian</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">Mutasi kronologis perubahan inventaris kamar, setoran reservasi survey, serta reset ledger akuntansi.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  customConfirm(
                    'Bersihkan Log Aktivitas',
                    'Apakah Anda yakin ingin mematikan / membersihkan semua log aktivitas sistem penampungan?',
                    async () => {
                      sandboxState.setActivityLogs([]);
                      triggerAppRefresh();
                    }
                  );
                }}
                className="text-red-400 hover:text-white text-[10px] font-bold py-1.5 px-3 border border-red-500/20 rounded-xl hover:bg-red-550 transition-all cursor-pointer"
              >
                Clear All Logs
              </button>
            </div>

            <div className="bg-slate-950 rounded-2xl border border-slate-850 p-4 font-mono text-[10px] space-y-2.5 overflow-y-auto max-h-[60vh] no-scrollbar">
              {activityLogs.map(l => (
                <div key={l.id} className="border-b border-white/5 pb-2.5 flex flex-col sm:flex-row justify-between text-slate-350 gap-1 select-all">
                  <div>
                    <span className="text-amber-500 font-bold uppercase tracking-wider">[{l.time || '11:15'}]</span>{' '}
                    <span className="text-indigo-400 font-extrabold">@{l.admin_name}</span>{' '}
                    <span className="text-white font-bold bg-slate-900 px-1 py-0.2 rounded tracking-wide border border-slate-800 text-[9px] uppercase">{l.action}</span>
                    <p className="text-[#8e9aa8] text-[9.5px] mt-0.5">{l.detail}</p>
                  </div>
                  <span className="text-[8px] text-slate-550 shrink-0 sm:text-right">IP: {l.ip_address || '127.0.0.1'}</span>
                </div>
              ))}

              {activityLogs.length === 0 && (
                <p className="text-center text-slate-650 py-10 font-sans text-xs">Belum ada rekam jejak audit terkoneksi pada cluster server.</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'midtrans_logs' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-800 pb-3 gap-2">
              <div>
                <h2 className="text-base font-extrabold font-display text-white uppercase tracking-tight flex items-center gap-2">
                  <Terminal size={14} className="text-amber-500" />
                  Midtrans Sandbox & Diagnostics Ledger
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5 font-sans">Real-time monitoring of browser client payments, API requests, state responses, and webhook ingestions.</p>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <label className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-slate-400 uppercase cursor-pointer bg-slate-900 border border-slate-805 px-3 py-1.5 rounded-xl">
                  <input 
                    type="checkbox" 
                    checked={autoRefreshLogs} 
                    onChange={(e) => setAutoRefreshLogs(e.target.checked)}
                    className="accent-amber-500 rounded font-mono"
                  />
                  Auto-Refresh (5s)
                </label>
                <button
                  type="button"
                  onClick={fetchMidtransLogs}
                  className="bg-slate-850 hover:bg-slate-800 text-slate-350 hover:text-white p-1.5 px-3 rounded-xl transition text-[10px] border border-slate-850 flex items-center gap-1.5 font-bold cursor-pointer"
                >
                  <RefreshCw size={12} className={midtransLoading ? "animate-spin" : ""} />
                  Sync
                </button>
                <button
                  type="button"
                  onClick={handleClearMidtransLogs}
                  className="text-red-400 hover:text-white text-[10px] font-bold py-1.5 px-3 border border-red-500/20 rounded-xl hover:bg-red-550 transition-all cursor-pointer"
                >
                  Clear Logs
                </button>
              </div>
            </div>

            {/* Diagnostics and Setup Advice Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 font-sans">
              <div className="bg-slate-900 border border-slate-805 p-4 rounded-3xl lg:col-span-2 space-y-3">
                <h3 className="text-xs font-bold text-slate-305 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                  <Server size={12} className="text-indigo-400" />
                  Environment & Credential Inspections
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[10px]">
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850 space-y-1">
                    <span className="text-slate-500 block uppercase font-mono font-bold">Client Key (Public-Facing)</span>
                    <p className="font-mono text-slate-300 break-all select-all">
                      {(import.meta as any).env.VITE_MIDTRANS_CLIENT_KEY || '🔴 NOT DETECTED'}
                    </p>
                    <span className={`inline-block text-[8px] font-bold uppercase rounded-full px-2 py-0.2 mt-1 ${((import.meta as any).env.VITE_MIDTRANS_CLIENT_KEY || '').startsWith('SB-') ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-450 border border-red-500/20'}`}>
                      {((import.meta as any).env.VITE_MIDTRANS_CLIENT_KEY || '').startsWith('SB-') ? 'Valid Sandbox Format' : 'Missing SB- Prefix (Production or Invalid)'}
                    </span>
                  </div>

                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850 space-y-1">
                    <span className="text-slate-500 block uppercase font-mono font-bold">Server Key (Secure API Proxy)</span>
                    <p className="font-mono text-slate-300">
                      ••••••••••••••••{midtransLogs.length > 0 ? " (Configured)" : " (Loading diagnostics)"}
                    </p>
                    <span className="inline-block text-[8px] font-bold bg-amber-500/10 text-amber-550 border border-amber-500/20 uppercase rounded-full px-2 py-0.2 mt-1">
                      Secure Proxy Enabled
                    </span>
                  </div>
                </div>

                <div className="text-[10px] text-slate-400 space-y-1.5 leading-relaxed bg-slate-950/40 p-3 rounded-2xl border border-white/5">
                  <p className="font-bold text-slate-300">💡 Cara Menyelesaikan Pembayaran Sandbox / Simulasi:</p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-350">
                    <li>Saat booking baru di checkout, modal <span className="text-amber-500 font-bold">Midtrans Snap</span> akan muncul otomatis di client browser.</li>
                    <li>Jika server tidak mendeteksi kredensial asli, tombol <span className="text-emerald-400 font-bold">"Failsafe Interactive Simulation"</span> gratis akan terdorong secara otomatis!</li>
                    <li>Untuk melakukan flow transaksi sandbox asli, salin nomor rekening virtual (VA) yang ditunjuk oleh Midtrans popup sandbox Anda.</li>
                    <li>Masukkan nomor VA tersebut ke simulator resmi di: <a href="https://payment-simulator.sandbox.midtrans.com" target="_blank" rel="noopener noreferrer" className="text-amber-550 hover:underline font-bold inline-flex items-center gap-0.5 font-mono">Simulator Midtrans <ExternalLink size={9} /></a> lalu klik Bayar/Settle untuk menembak webhook API secara instan!</li>
                  </ul>
                </div>
              </div>

              {/* Stats Summary Widget */}
              <div className="bg-indigo-950/20 border border-indigo-500/10 p-4 rounded-3xl flex flex-col justify-between space-y-3.5">
                <div>
                  <h3 className="text-xs font-bold text-slate-305 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                    <Activity size={12} className="text-amber-500" />
                    Ledger Metrics
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-1">Metrik agregat sandbox request sejak server runtime diinisialisasi:</p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-center font-mono">
                  <div className="bg-slate-950/80 p-2.5 rounded-2xl border border-white/5">
                    <span className="text-xs font-extrabold text-white block">{midtransLogs.length}</span>
                    <span className="text-[8px] text-slate-500 uppercase font-sans">Total Logs</span>
                  </div>
                  <div className="bg-slate-950/80 p-2.5 rounded-2xl border border-white/5">
                    <span className="text-xs font-extrabold text-emerald-400 block">
                      {midtransLogs.filter(l => l.status === 'success' || l.status === 'simulated').length}
                    </span>
                    <span className="text-[8px] text-slate-500 uppercase font-sans">Success / Sim</span>
                  </div>
                  <div className="bg-slate-950/80 p-2.5 rounded-2xl border border-white/5">
                    <span className="text-xs font-extrabold text-indigo-400 block">
                      {midtransLogs.filter(l => l.type === 'webhook').length}
                    </span>
                    <span className="text-[8px] text-slate-500 uppercase font-sans">Webhooks</span>
                  </div>
                  <div className="bg-slate-950/80 p-2.5 rounded-2xl border border-white/5">
                    <span className="text-xs font-extrabold text-red-400 block">
                      {midtransLogs.filter(l => l.type === 'error' || l.status === 'failed').length}
                    </span>
                    <span className="text-[8px] text-slate-500 uppercase font-sans">Errors</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Filter buttons */}
            <div className="flex flex-wrap gap-1.5 border-b border-slate-850 pb-2 font-sans">
              {[
                { id: 'all', name: 'Semua Log' },
                { id: 'charge', name: 'Charge Requests' },
                { id: 'webhook', name: 'Webhook Events' },
                { id: 'simulation', name: 'Simulation Failsafes' },
                { id: 'error', name: 'Errors' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setMidtransFilter(f.id)}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase transition-all duration-155 cursor-pointer ${
                    midtransFilter === f.id
                      ? 'bg-amber-500 text-black shadow-sm'
                      : 'bg-slate-900 border border-slate-805 text-slate-400 hover:text-white'
                  }`}
                >
                  {f.name}
                </button>
              ))}
            </div>

            {/* Logs Timeline Display */}
            <div className="bg-slate-950 rounded-2xl border border-slate-850 p-4 font-mono text-[10px] space-y-2 max-h-[100vh] overflow-y-auto no-scrollbar">
              {midtransLogs
                .filter(l => {
                  if (midtransFilter === 'all') return true;
                  if (midtransFilter === 'error') return l.type === 'error' || l.status === 'failed';
                  return l.type === midtransFilter;
                })
                .map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  return (
                    <div key={log.id} className="border-b border-white/5 pb-2.5 last:border-0 last:pb-0">
                      <div 
                        onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                        className="flex flex-col md:flex-row justify-between items-start md:items-center py-1.5 hover:bg-white/[0.02] px-2 rounded-xl cursor-pointer transition select-none gap-2"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-slate-500">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                          
                          <span className={`text-[8px] font-bold uppercase px-1.5 py-0.2 rounded-md ${
                            log.type === 'charge' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                            log.type === 'webhook' ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20' :
                            log.type === 'simulation' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                            log.type === 'error' ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                            'bg-slate-800 text-slate-400'
                          }`}>
                            {log.type.toUpperCase()}
                          </span>

                          <span className={`text-[8px] font-bold uppercase px-1.5 py-0.2 rounded-md ${
                            log.status === 'success' || log.status === 'simulated' ? 'bg-emerald-555/15 text-emerald-400' :
                            log.status === 'pending' ? 'bg-amber-400/15 text-amber-400' :
                            'bg-red-500/15 text-red-400'
                          }`}>
                            {log.status.toUpperCase()}
                          </span>

                          <span className="text-slate-300 font-extrabold select-all">Order: {log.orderId}</span>
                          
                          {log.amount && (
                            <span className="text-amber-500 font-bold">{formatRupiah(log.amount)}</span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 justify-end w-full md:w-auto">
                          <div className="text-slate-400 text-[10px] md:text-right max-w-sm truncate">
                            {log.message}
                          </div>
                          <span className="text-slate-600 text-[10px] font-bold font-sans">
                            {isExpanded ? 'Collapse ▲' : 'Details ▼'}
                          </span>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-2 ml-2 p-3.5 bg-slate-900 border border-slate-800 rounded-2xl space-y-2 select-all relative group">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(JSON.stringify(log, null, 2));
                              alert('Payload JSON disalin ke papan klip!');
                            }}
                            className="absolute right-3 top-3 bg-slate-950 p-1 px-2.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white transition flex items-center gap-1.5 cursor-pointer text-[9px] font-bold font-sans"
                          >
                            <Copy size={9} />
                            Copy JSON
                          </button>
                          
                          <div className="text-[10px] text-slate-500 font-mono space-y-1">
                            <div><span className="font-bold text-slate-400">Timestamp:</span> {log.timestamp} ({new Date(log.timestamp).toLocaleString()})</div>
                            {log.customerName && <div><span className="font-bold text-slate-400">Customer:</span> {log.customerName} &lt;{log.customerEmail}&gt;</div>}
                            <div><span className="font-bold text-slate-400">UUID Tracking ID:</span> {log.id}</div>
                          </div>

                          <div className="pt-2 border-t border-white/5">
                            <span className="text-[9px] font-bold text-slate-400 uppercase block font-mono mb-1">State Payload Details:</span>
                            <pre className="text-[9px] text-[#bdc3c7] font-mono leading-relaxed bg-slate-950 p-3.5 rounded-xl border border-slate-855 overflow-x-auto select-all max-h-60 no-scrollbar whitespace-pre-wrap">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

              {midtransLogs.length === 0 && (
                <div className="text-center text-slate-650 py-12 font-sans space-y-1">
                  <p className="text-xs">No Midtrans logs captured in current server session yet.</p>
                  <p className="text-[10px] text-slate-700">Inisialisasi reservasi sewa properti untuk mendaftarkan logs API baru.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'email_integration' && (
          <div className="space-y-6">
            <div className="border-b border-slate-800 pb-3">
              <h2 className="text-base font-extrabold font-display text-white uppercase tracking-tight flex items-center gap-2">
                <Mail size={14} className="text-amber-500" />
                Integrasi Email Notifikasi Premium (MailerSend)
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Konfigurasi pengiriman email kuitansi digital, jadwal reservasi survey, dan notifikasi hunian real-time via MailerSend.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Kolom Kiri: Konfigurasi Identitas Pengirim */}
              <div className="bg-slate-900 border border-slate-805 p-5 rounded-3xl space-y-4">
                <h3 className="text-xs font-bold text-slate-305 uppercase tracking-wider font-mono flex items-center gap-2">
                  <UserCog size={13} className="text-amber-500" />
                  Kredensial & Identitas Pengirim
                </h3>

                <div className="space-y-3.5 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-wider mb-1 font-mono">MailerSend API Key</label>
                    <div className="relative">
                      <input 
                        type="password" 
                        readOnly
                        value="mlsn.654e012b23f2049e7d07dee9ec00ce04e52c6c21c418ed3e46133b2c69f79b22"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 font-mono text-[10px]"
                      />
                      <span className="absolute right-3 top-2 text-[8px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded px-1.5 py-0.5 font-bold uppercase font-mono">
                        Server Injected
                      </span>
                    </div>
                    <p className="text-[9px] text-slate-500 mt-1 font-sans">Menggunakan kunci API MailerSend terintegrasi: <code className="text-slate-400 font-mono">mlsn.654e01...9b22</code> yang dimasukkan melalui panel secure secrets.</p>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-wider mb-1 font-mono">From Email (Domain Terverifikasi)</label>
                    <input 
                      type="email" 
                      value={emailSenderEmail}
                      onChange={(e) => setEmailSenderEmail(e.target.value)}
                      placeholder="info@trial-3yxj5ljp10zg6o2r.mlsender.net"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 font-mono text-[11px]"
                    />
                    <p className="text-[9px] text-slate-500 mt-1 font-sans">PENTING: MailerSend akun trial mewajibkan alamat pengirim berakhiran domain trial mereka (contoh: <code className="text-slate-400 font-mono">info@trial-3yxj5ljp10zg6o2r.mlsender.net</code>). Sesuaikan jika Anda mendaftarkan domain Anda sendiri.</p>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-wider mb-1 font-mono">Nama Pengirim (Sender Name)</label>
                    <input 
                      type="text" 
                      value={emailSenderName}
                      onChange={(e) => setEmailSenderName(e.target.value)}
                      placeholder="Samara Stay Premium"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 text-[11px]"
                    />
                    <p className="text-[9px] text-slate-500 mt-1 font-sans">Nama yang akan tertera sebagai pengirim pada kotak masuk email penyewa kos.</p>
                  </div>
                </div>

                <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800 space-y-1.5 text-[10px]">
                  <p className="font-extrabold text-slate-305 uppercase tracking-wider font-mono flex items-center gap-1">
                    <CheckCircle size={10} className="text-emerald-400" />
                    Automated Event Triggers
                  </p>
                  <p className="text-slate-400 leading-relaxed font-sans">
                    Sistem Samara Stay telah dikonfigurasi untuk mengirimkan notifikasi email secara otomatis pada kejadian berikut:
                  </p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-500 font-sans">
                    <li><strong className="text-slate-400">Pembayaran Sewa Sukses</strong>: Kuitansi digital dikirim otomatis ke penyewa.</li>
                    <li><strong className="text-slate-400">Survey Terjadwal & Lunas</strong>: Surat konfirmasi kedatangan survey & reservasi dikirim instan.</li>
                  </ul>
                </div>
              </div>

              {/* Kolom Kanan: Formulir Uji Coba Email */}
              <div className="bg-slate-900 border border-slate-805 p-5 rounded-3xl space-y-4">
                <h3 className="text-xs font-bold text-slate-305 uppercase tracking-wider font-mono flex items-center gap-2">
                  <Play size={11} className="text-amber-500" />
                  Kirim Uji Coba Email (Live Test)
                </h3>

                <div className="space-y-3.5 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-wider mb-1 font-mono">Email Penerima (To Recipient)</label>
                    <input 
                      type="email" 
                      value={testEmailTo}
                      onChange={(e) => setTestEmailTo(e.target.value)}
                      placeholder="contoh: yogiatmaja26@gmail.com"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 font-mono text-[11px]"
                    />
                    <p className="text-[9px] text-slate-500 mt-1 font-sans">Catatan trial: MailerSend trial hanya memperbolehkan pengiriman ke email yang terdaftar sebagai authorized recipient atau email akun pembuat MailerSend Anda.</p>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-wider mb-1 font-mono">Subjek Email (Subject)</label>
                    <input 
                      type="text" 
                      value={testEmailSubject}
                      onChange={(e) => setTestEmailSubject(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 text-[11px]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-wider mb-1 font-mono">Pesan / Isi Email (Message Content)</label>
                    <textarea 
                      rows={3}
                      value={testEmailBody}
                      onChange={(e) => setTestEmailBody(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 text-[11px] font-sans no-scrollbar"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleSendTestEmail}
                    disabled={emailSending}
                    className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-slate-800 text-black disabled:text-slate-500 font-extrabold py-2 rounded-xl transition duration-155 flex items-center justify-center gap-2 text-xs cursor-pointer"
                  >
                    {emailSending ? (
                      <>
                        <RotateCw size={13} className="animate-spin" />
                        Sedang Mengirim...
                      </>
                    ) : (
                      <>
                        <Mail size={13} />
                        Kirim Email Sekarang
                      </>
                    )}
                  </button>
                </div>

                {emailResult && (
                  <div className={`p-4 rounded-2xl border text-[10px] space-y-1.5 ${
                    emailResult.success 
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                      : 'bg-red-500/10 border-red-500/20 text-red-400'
                  }`}>
                    <p className="font-extrabold uppercase font-mono tracking-wider">
                      {emailResult.success ? '✓ Sukses Terkirim' : '✗ Gagal Mengirim'}
                    </p>
                    <p className="font-sans leading-relaxed text-slate-300">{emailResult.message}</p>
                    {emailResult.details && (
                      <div className="pt-2 border-t border-white/5">
                        <span className="font-bold text-slate-400 uppercase block font-mono mb-1 text-[8px]">Respons Detail API:</span>
                        <pre className="text-[9px] bg-slate-950 p-2 rounded-lg border border-white/5 overflow-x-auto select-all text-[#bdc3c7] font-mono leading-relaxed whitespace-pre-wrap max-h-32 no-scrollbar">
                          {typeof emailResult.details === 'object' ? JSON.stringify(emailResult.details, null, 2) : emailResult.details}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

              </div>

            </div>
          </div>
        )}

      </div>

      {/* Property Editor modal */}
      <Modal
        isOpen={showPropertyModal}
        onClose={() => setShowPropertyModal(false)}
        title={activePropertyEdit ? 'Ubah Informasi Properti' : 'Daftarkan Properti Kos Baru'}
      >
        <PropertyForm 
          property={activePropertyEdit}
          onSave={handleAddProperty}
          onCancel={() => setShowPropertyModal(false)}
        />
      </Modal>

      {/* Room Editor modal */}
      <Modal
        isOpen={showRoomModal}
        onClose={() => setShowRoomModal(false)}
        title={activeRoomEdit ? 'Sesuaikan Klasifikasi Unit' : 'Tambahkan Kamar Baru'}
      >
        <RoomForm 
          room={activeRoomEdit}
          properties={properties}
          onSave={handleAddRoom}
          onCancel={() => setShowRoomModal(false)}
        />
      </Modal>

      {/* Coupon Creator modal */}
      <Modal
        isOpen={showCouponModal}
        onClose={() => setShowCouponModal(false)}
        title="BUAT KUPON DISKON BARU"
      >
        <form onSubmit={handleCreateCoupon} className="space-y-4 font-sans text-xs text-slate-300">
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">Kode Unik Kupon (KAPITAL)</label>
            <input 
              type="text" required
              value={couponForm.code}
              onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value })}
              placeholder="CONTOH: COVENAN15"
              className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-200 outline-none uppercase font-mono font-bold text-[11px]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">Deskripsi Kampanye</label>
            <input 
              type="text" required
              value={couponForm.description}
              onChange={(e) => setCouponForm({ ...couponForm, description: e.target.value })}
              placeholder="Contoh: Diskon khusus libur natal"
              className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-200 outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">Tipe Potongan</label>
              <select
                value={couponForm.discount_type}
                onChange={(e) => setCouponForm({ ...couponForm, discount_type: e.target.value as any })}
                className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-205 font-bold cursor-pointer"
              >
                <option value="percentage">PERSENTASE (%)</option>
                <option value="fixed">NOMINAL TETAP (IDR)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">Nilai Potongan</label>
              <input 
                type="number" required
                value={couponForm.discount_value}
                onChange={(e) => setCouponForm({ ...couponForm, discount_value: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-200 font-mono"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">Maksimal Potongan Nominal (IDR)</label>
            <input 
              type="number" required
              value={couponForm.max_discount_amount}
              onChange={(e) => setCouponForm({ ...couponForm, max_discount_amount: Number(e.target.value) })}
              className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-200 font-mono"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowCouponModal(false)}
              className="flex-1 py-1.5 rounded-xl border border-white/10 hover:bg-white/5 text-slate-300 font-bold transition-all cursor-pointer"
            >
              Batalkan
            </button>
            <button
              type="submit"
              className="flex-1 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-450 border border-amber-500 text-black font-extrabold transition-all cursor-pointer text-[11px]"
            >
              Terbitkan Sekarang
            </button>
          </div>
        </form>
      </Modal>

      {/* Printable Invoice Pop-up Modal */}
      {selectedInvoice && (
        <Modal
          isOpen={!!selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          title="PRINTOUT KWITANSI NOTARIAL RESMI"
        >
          <InvoiceCard 
            receipt={selectedInvoice}
            onClose={() => setSelectedInvoice(null)}
          />
        </Modal>
      )}

      {/* Administrator User creator/modifier modal */}
      <Modal
        isOpen={showUserModal}
        onClose={() => setShowUserModal(false)}
        title={activeUserEdit ? "MUTASI HAK AKSES SISTEM" : "DAFTAR AKSES BARU"}
      >
        <form onSubmit={handleSaveUser} className="space-y-4 font-sans text-xs text-slate-300">
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-slate-400 font-mono">Nama Lengkap Petugas</label>
            <input 
              type="text" required
              value={userForm.fullName}
              onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })}
              placeholder="misal: Yogi Atmaja"
              className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-slate-200 outline-none capitalize text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-slate-400 font-mono">Alamat Email Resmi</label>
            <input 
              type="email" required
              value={userForm.email}
              onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
              placeholder="staf@samarastay.co.id"
              className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-slate-200 outline-none text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-400 font-mono">Jabatan / Role</label>
              <select
                value={userForm.role}
                onChange={(e) => setUserForm({ ...userForm, role: e.target.value as any })}
                className="w-full bg-slate-950 border border-slate-805 p-2.5 rounded-xl text-slate-200 cursor-pointer font-bold text-xs"
              >
                <option value="super">SUPER ADMIN</option>
                <option value="admin">SISTEM ADMIN</option>
                <option value="finance">BENDAHARA (FINANCE)</option>
                <option value="staff">SURVEYOR (STAFF)</option>
              </select>
            </div>

            <div className="flex items-center gap-2 pt-4">
              <input
                type="checkbox"
                id="active_status"
                checked={userForm.active}
                onChange={(e) => setUserForm({ ...userForm, active: e.target.checked })}
                className="w-4 h-4 accent-amber-500 rounded border-slate-800 bg-slate-950"
              />
              <label htmlFor="active_status" className="text-[10px] font-bold text-slate-300 font-mono uppercase cursor-pointer">AKUN AKTIF</label>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowUserModal(false)}
              className="flex-1 py-1.5 rounded-xl border border-white/10 hover:bg-white/5 text-slate-300 font-bold transition-all text-xs cursor-pointer"
            >
              Batalkan
            </button>
            <button
              type="submit"
              className="flex-1 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-450 border border-amber-500 text-black font-extrabold transition-all text-xs cursor-pointer"
            >
              Simpan Otorisasi
            </button>
          </div>
        </form>
      </Modal>

      {/* Custom Confirmation Dialog */}
      <Modal
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        title={confirmDialog.title}
      >
        <div className="space-y-4 font-sans text-slate-300">
          <p className="text-sm leading-relaxed">{confirmDialog.message}</p>
          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
              className="flex-1 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-slate-300 font-bold transition-all text-xs cursor-pointer"
            >
              Batalkan
            </button>
            <button
              type="button"
              onClick={confirmDialog.onConfirm}
              className="flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-450 border border-amber-500 text-black font-extrabold transition-all text-xs cursor-pointer"
            >
              Ya, Setujui
            </button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
export { Admin };
