/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  BarChart3, Layers, UserCheck, CalendarCheck, Landmark, Tag, Settings, CreditCard,
  Plus, Edit2, Trash2, Check, X, ShieldAlert, FileSpreadsheet, Eye, Printer, Shield, Activity,
  CheckCircle, FileText, BadgeCheck
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend
} from 'recharts';
import { Property, Room, Booking, Tenant, Survey, PaymentInvoice, AccountCOA, FinancialTransaction, SystemSettings, Coupon, ActivityLog } from '../types';
import { database, isSupabaseConfigured } from '../lib/supabase';

interface AdminDashboardProps {
  onRefreshTrigger: number;
  triggerAppRefresh: () => void;
}

type AdminTab = 'dashboard' | 'properties' | 'bookings' | 'surveys' | 'finance' | 'coupons' | 'settings';

export default function AdminDashboard({ onRefreshTrigger, triggerAppRefresh }: AdminDashboardProps) {
  // Navigation
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');

  // Loaded database state
  const [properties, setProperties] = useState<Property[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [payments, setPayments] = useState<PaymentInvoice[]>([]);
  const [accounts, setAccounts] = useState<AccountCOA[]>([]);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [rules, setRules] = useState<SystemSettings | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);

  // Payment search / filters
  const [paymentSearch, setPaymentSearch] = useState('');
  const [paymentFilterStatus, setPaymentFilterStatus] = useState('all');
  const [selectedPaymentReceipt, setSelectedPaymentReceipt] = useState<PaymentInvoice | null>(null);

  // Custom Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
    variant?: 'danger' | 'warning' | 'success' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    variant: 'info'
  });

  // Sub-states & Form modals
  const [loading, setLoading] = useState(true);

  // Property Form Modal
  const [showPropertyModal, setShowPropertyModal] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Partial<Property> | null>(null);
  const [propertyFormData, setPropertyFormData] = useState({
    name: '',
    address: '',
    price: 1500000,
    type: 'campur' as 'putra' | 'putri' | 'campur',
    facilities: '',
    image_url: ''
  });

  // Room Form Modal
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Partial<Room> | null>(null);
  const [roomFormData, setRoomFormData] = useState({
    property_id: 1,
    room_number: '',
    room_type: 'Standard' as 'Standard' | 'Deluxe' | 'Premium',
    price: 1500000,
    size_sqm: 15.0,
    floor: 1,
    status: 'available' as 'available' | 'occupied' | 'maintenance' | 'reserved',
    is_daily_enabled: false,
    daily_price: 150000
  });

  // Coupon Form Modal
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [couponFormData, setCouponFormData] = useState({
    code: '',
    discount_type: 'percentage' as 'percentage' | 'fixed',
    discount_value: 10,
    max_discount_amount: 500000,
    is_active: true,
    description: ''
  });

  // System Settings local view states
  const [editedBookingRules, setEditedBookingRules] = useState('');
  const [editedSurveyRules, setEditedSurveyRules] = useState('');

  // Initial Sync
  useEffect(() => {
    async function loadAdminData() {
      setLoading(true);
      const [p, r, b, t, s, pay, acc, trx, rul, coup, logs] = await Promise.all([
        database.fetchProperties(),
        database.fetchRooms(),
        database.fetchBookings(),
        database.fetchTenants(),
        database.fetchSurveys(),
        database.fetchPayments(),
        database.fetchAccounts(),
        database.fetchFinancialTransactions(),
        database.fetchSettings(),
        database.fetchCoupons(),
        database.fetchActivityLogs()
      ]);
      setProperties(p);
      setRooms(r);
      setBookings(b);
      setTenants(t);
      setSurveys(s);
      setPayments(pay);
      setAccounts(acc);
      setTransactions(trx);
      setRules(rul);
      setCoupons(coup);
      setActivityLogs(logs);

      if (rul) {
        setEditedBookingRules(rul.booking_rules);
        setEditedSurveyRules(rul.survey_rules);
      }
      setLoading(false);
    }
    loadAdminData();
  }, [onRefreshTrigger]);

  const formatRupiah = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(num);
  };

  const triggerConfirm = (
    title: string, 
    message: string, 
    onConfirm: () => void | Promise<void>,
    variant: 'danger' | 'warning' | 'success' | 'info' = 'info'
  ) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      onConfirm: async () => {
        try {
          await onConfirm();
        } catch (err) {
          console.error(err);
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      },
      variant
    });
  };

  const filteredPayments = payments.filter(p => {
    const matchesSearch = p.tenant_name.toLowerCase().includes(paymentSearch.toLowerCase()) || p.id.toLowerCase().includes(paymentSearch.toLowerCase());
    const matchesStatus = paymentFilterStatus === 'all' || p.status === paymentFilterStatus;
    return matchesSearch && matchesStatus;
  });

  // Recharts analytics parser
  const chartData = [
    { name: 'Jan', Pendapatan: 5400000 },
    { name: 'Feb', Pendapatan: 6800000 },
    { name: 'Mar', Pendapatan: 8200000 },
    { name: 'Apr', Pendapatan: 10200000 },
    { name: 'Mei', Pendapatan: 11800000 },
    { name: 'Jun', Pendapatan: transactions.filter(t=>t.type === 'income').reduce((acc,curr)=>acc+Number(curr.amount), 0) || 12400000 }
  ];

  // Business Action triggers
  // 1. Property CRUD
  const handleOpenAddProperty = () => {
    setEditingProperty(null);
    setPropertyFormData({
      name: '',
      address: '',
      price: 1800000,
      type: 'campur',
      facilities: 'Ac, WiFi, Kamar Mandi Dalam, Water Heater, Lemari',
      image_url: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80'
    });
    setShowPropertyModal(true);
  };

  const handleOpenEditProperty = (p: Property) => {
    setEditingProperty(p);
    setPropertyFormData({
      name: p.name,
      address: p.address,
      price: p.price,
      type: p.type,
      facilities: p.facilities.join(', '),
      image_url: p.image_url
    });
    setShowPropertyModal(true);
  };

  const handleSavePropertySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Partial<Property> = {
      ...editingProperty,
      name: propertyFormData.name,
      address: propertyFormData.address,
      price: Number(propertyFormData.price),
      type: propertyFormData.type,
      facilities: propertyFormData.facilities.split(',').map(f=>f.trim()).filter(Boolean),
      image_url: propertyFormData.image_url
    };
    await database.saveProperty(payload);
    setShowPropertyModal(false);
    triggerAppRefresh();
  };

  const handleDeletePropertyClick = (id: number) => {
    triggerConfirm(
      "Hapus Properti?",
      "Apakah Anda yakin ingin menghapus properti ini beserta semua kamar di dalamnya? Tindakan ini tidak dapat dibatalkan.",
      async () => {
        await database.deleteProperty(id);
        triggerAppRefresh();
      },
      'danger'
    );
  };

  // 2. Room CRUD
  const handleOpenAddRoom = (propertyId: number) => {
    setEditingRoom(null);
    setRoomFormData({
      property_id: propertyId,
      room_number: `R${Math.floor(100+Math.random()*900)}`,
      room_type: 'Standard',
      price: 1500000,
      size_sqm: 15.0,
      floor: 1,
      status: 'available',
      is_daily_enabled: false,
      daily_price: 150000
    });
    setShowRoomModal(true);
  };

  const handleOpenEditRoom = (r: Room) => {
    setEditingRoom(r);
    setRoomFormData({
      property_id: r.property_id,
      room_number: r.room_number,
      room_type: r.room_type,
      price: r.price,
      size_sqm: r.size_sqm,
      floor: r.floor,
      status: r.status,
      is_daily_enabled: r.is_daily_enabled,
      daily_price: r.daily_price
    });
    setShowRoomModal(true);
  };

  const handleSaveRoomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Partial<Room> = {
      ...editingRoom,
      property_id: roomFormData.property_id,
      room_number: roomFormData.room_number,
      room_type: roomFormData.room_type,
      price: Number(roomFormData.price),
      size_sqm: Number(roomFormData.size_sqm),
      floor: Number(roomFormData.floor),
      status: roomFormData.status,
      is_daily_enabled: roomFormData.is_daily_enabled,
      daily_price: Number(roomFormData.daily_price),
      facilities: roomFormData.room_type === 'Premium' 
        ? ["Ac", "WiFi", "Kamar Mandi Dalam", "Water Heater", "TV Screen", "Mini Couch"]
        : roomFormData.room_type === 'Deluxe'
          ? ["Ac", "WiFi", "Kamar Mandi Dalam", "Water Heater"]
          : ["Ac", "WiFi", "Kamar Mandi Dalam"]
    };
    await database.saveRoom(payload);
    setShowRoomModal(false);
    triggerAppRefresh();
  };

  const handleDeleteRoomClick = (id: number) => {
    triggerConfirm(
      "Hapus Kamar Hunian?",
      "Apakah Anda yakin ingin menghapus kamar ini dari aset aktif?",
      async () => {
        await database.deleteRoom(id);
        triggerAppRefresh();
      },
      'danger'
    );
  };

  // 3. Booking management approvals
  const handleApproveBooking = (id: number) => {
    triggerConfirm(
      "Setujui Kontrak Sewa?",
      "Konfirmasi penyewaan kontrak kamar? Ini akan mengubah kamar menjadi 'occupied', menyebarkan data tenant, menerbitkan faktur pembayaran, dan mendebit COA Kas Bank.",
      async () => {
        const targetB = bookings.find(b => b.id === id);
        if (targetB) {
          await database.saveBooking({ ...targetB, status: 'approved' });
          triggerAppRefresh();
        }
      },
      'success'
    );
  };

  const handleRejectBooking = (id: number) => {
    triggerConfirm(
      "Tolak/Batalkan Pesanan?",
      "Apakah Anda yakin ingin membatalkan/menolak antrian pesanan kontrak sewa ini?",
      async () => {
        const targetB = bookings.find(b => b.id === id);
        if (targetB) {
          await database.saveBooking({ ...targetB, status: 'rejected' });
          triggerAppRefresh();
        }
      },
      'warning'
    );
  };

  // 3b. Midtrans Payment approvals/rejections
  const handleApprovePayment = (id: string) => {
    triggerConfirm(
      "Setujui Pembayaran?",
      "Konfirmasi manual pembayaran ini sebagai LUNAS/PAID? Jika ada pesanan sewa (booking) yang bersangkutan, status pesanan tersebut akan diubah menjadi 'approved'.",
      async () => {
        const targetP = payments.find(p => p.id === id);
        if (targetP) {
          const updatedPayment: PaymentInvoice = { ...targetP, status: 'paid' };
          await database.savePayment(updatedPayment);
          
          // Also look for corresponding booking to auto-approve
          if (targetP.midtrans_order_id) {
            const correspondingBooking = bookings.find(b => b.midtrans_order_id === targetP.midtrans_order_id);
            if (correspondingBooking && correspondingBooking.status !== 'approved') {
              await database.saveBooking({ ...correspondingBooking, status: 'approved' });
            }
          }
          if (selectedPaymentReceipt?.id === id) {
            setSelectedPaymentReceipt(updatedPayment);
          }
          triggerAppRefresh();
        }
      },
      'success'
    );
  };

  const handleRejectPayment = (id: string) => {
    triggerConfirm(
      "Tolak/Batalkan Pembayaran?",
      "Apakah Anda yakin ingin membatalkan/menolak pembayaran ini? Status akan diubah menjadi 'overdue' (Belum Lunas).",
      async () => {
        const targetP = payments.find(p => p.id === id);
        if (targetP) {
          const updatedPayment: PaymentInvoice = { ...targetP, status: 'overdue' };
          await database.savePayment(updatedPayment);
          if (selectedPaymentReceipt?.id === id) {
            setSelectedPaymentReceipt(updatedPayment);
          }
          triggerAppRefresh();
        }
      },
      'danger'
    );
  };

  // 4. Surveys Manager mapper status
  const handleSurveyNoShow = (id: number) => {
    triggerConfirm(
      "Tarik DP Hangus (No-Show)?",
      "Calon penyewa terbukti TIDAK HADIR (No-Show)? Jaminan komitmen DP Rp 500.000 akan ditarik paksa (forfeited) dan diklasifikasi sebagai Pendapatan DP Survey Hangus (Akun 4200). Kamar kembali berstatus available.",
      async () => {
        const targetS = surveys.find(s => s.id === id);
        if (targetS) {
          await database.saveSurvey({ ...targetS, status: 'no_show'});
          triggerAppRefresh();
        }
      },
      'danger'
    );
  };

  const handleSurveyCompleted = (id: number) => {
    triggerConfirm(
      "Selesaikan Janji Survey?",
      "Apakah Anda yakin ingin menandai survey ini telah selesai dilaksanakan dengan sukses?",
      async () => {
        const targetS = surveys.find(s => s.id === id);
        if (targetS) {
          await database.saveSurvey({ ...targetS, status: 'survey_completed' });
          triggerAppRefresh();
        }
      },
      'success'
    );
  };

  // Save rules
  const handleSaveSystemSettings = async () => {
    await database.saveSettings({
      id: 1,
      booking_rules: editedBookingRules,
      survey_rules: editedSurveyRules
    });
    alert("Setelan tata tertib survey & sewa berhasil diperbarui.");
    triggerAppRefresh();
  };

  // Coupon manager callbacks
  const handleSaveCouponSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await database.saveCoupon({
      code: couponFormData.code.toUpperCase(),
      discount_type: couponFormData.discount_type,
      discount_value: Number(couponFormData.discount_value),
      max_discount_amount: couponFormData.discount_type === 'percentage' ? Number(couponFormData.max_discount_amount) : null,
      is_active: couponFormData.is_active,
      description: couponFormData.description
    });
    setShowCouponModal(false);
    triggerAppRefresh();
  };

  const handleDeleteCouponClick = (id: number) => {
    triggerConfirm(
      "Hapus Kode Promo?",
      "Apakah Anda yakin ingin menghapus kupon diskon promosi ini secara permanen?",
      async () => {
        await database.deleteCoupon(id);
        triggerAppRefresh();
      },
      'warning'
    );
  };

  // Aggregated analytics metrics calculations
  const totalInflow = transactions.filter(t=>t.type === 'income' || t.type === 'dp_booking').reduce((acc,curr)=>acc+Number(curr.amount), 0);
  const totalOutflow = transactions.filter(t=>t.type === 'expense').reduce((acc,curr)=>acc+Number(curr.amount), 0);
  const netEarnings = totalInflow - totalOutflow;

  const totalPropCount = properties.length;
  const occupiedRoomsCount = rooms.filter(r=>r.status === 'occupied').length;
  const maintenanceRoomsCount = rooms.filter(r=>r.status === 'maintenance').length;
  const availableRoomsCount = rooms.filter(r=>r.status === 'available').length;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row text-xs font-sans text-slate-700 select-none pb-12" id="admin-panel-container">
      
      {/* SIDEBAR NAVIGATION GRID */}
      <aside className="w-full md:w-64 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 shrink-0 select-none">
        <div className="p-5 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-extrabold text-white font-display text-base tracking-tight">SAMARA</span>
            <span className="font-extrabold text-brand-accent font-display text-base tracking-tight">STAY</span>
          </div>
          <span className="text-[10px] text-brand-green font-mono font-bold tracking-wider uppercase block">ADMIN CORE ENGINE</span>
        </div>

        <nav className="p-4 flex-1 space-y-1.5">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all text-left cursor-pointer ${
              activeTab === 'dashboard' ? 'bg-brand-green text-white shadow-xs' : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            <BarChart3 size={16} />
            Ringkasan Statistik
          </button>

          <button
            onClick={() => setActiveTab('properties')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all text-left cursor-pointer ${
              activeTab === 'properties' ? 'bg-brand-green text-white shadow-xs' : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Layers size={16} />
            Kelola Unit & Kamar
          </button>

          <button
            onClick={() => setActiveTab('bookings')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all text-left cursor-pointer ${
              activeTab === 'bookings' ? 'bg-brand-green text-white shadow-xs' : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            <UserCheck size={16} />
            Daftar Sewa & Tenant
          </button>

          <button
            onClick={() => setActiveTab('surveys')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all text-left cursor-pointer ${
              activeTab === 'surveys' ? 'bg-brand-green text-white shadow-xs' : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            <CalendarCheck size={16} />
            DP Survey Scheduler
          </button>

          <button
            onClick={() => setActiveTab('finance')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all text-left cursor-pointer ${
              activeTab === 'finance' ? 'bg-brand-green text-white shadow-xs' : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Landmark size={16} />
            Double Book Ledger
          </button>

          <button
            onClick={() => setActiveTab('coupons')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all text-left cursor-pointer ${
              activeTab === 'coupons' ? 'bg-brand-green text-white shadow-xs' : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Tag size={16} />
            Promosi & Voucher
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all text-left cursor-pointer ${
              activeTab === 'settings' ? 'bg-brand-green text-white shadow-xs' : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Settings size={16} />
            Aturan & Tata Tertib
          </button>
        </nav>

        {/* User footer profile inside sidebar */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/20 text-slate-400 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-slate-700 font-bold flex items-center justify-center text-white font-mono uppercase text-xs shadow-inner select-none">
              SA
            </div>
            <div>
              <div className="font-extrabold text-slate-200">Super Admin</div>
              <p className="text-[10px] text-slate-500">yogiketilang33@gmail.com</p>
            </div>
          </div>
        </div>
      </aside>

      {/* CORE CONTENT PANEL */}
      <div className="flex-1 p-6 md:p-8 space-y-6 overflow-y-auto max-h-screen">
        
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-4 border-slate-300 border-t-brand-green rounded-full animate-spin" />
            <p className="text-[11px] text-gray-400 font-mono">Sinkronisasi data dashboard admin...</p>
          </div>
        ) : (
          <>
            
            {/* Global Header with Live System Status Indicators */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900 text-white p-5 rounded-3xl border border-slate-800 shadow-xl mb-4 animate-fade-in font-medium">
              <div>
                <span className="text-[10px] text-amber-400 font-mono uppercase tracking-wider font-extrabold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                  Samara Stay Operations Panel
                </span>
                <h1 className="text-lg font-bold font-display text-white mt-1">Sistem Pemantauan Terpusat</h1>
                <p className="text-xs text-slate-400 mt-0.5">Pantau status integrasi Supabase, gateway pembayaran Midtrans SNAP, dan antrian kontrak sewa real-time.</p>
              </div>

              {/* Status Indicators list */}
              <div className="flex flex-wrap gap-2.5">
                <div className="bg-slate-950/65 border border-slate-800 px-3 py-2 rounded-2xl flex items-center gap-2 text-[10px] font-semibold font-mono tracking-wide">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-slate-400 uppercase">DATABASE:</span>
                  <span className="text-emerald-400">{isSupabaseConfigured ? 'SUPABASE ONLINE' : 'SIMULATOR ACTIVE'}</span>
                </div>

                <div className="bg-slate-950/65 border border-slate-800 px-3 py-2 rounded-2xl flex items-center gap-2 text-[10px] font-semibold font-mono tracking-wide">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-slate-400 uppercase">MIDTRANS GATEWAY:</span>
                  <span className="text-emerald-400">ACTIVE SANDBOX</span>
                </div>

                <div className="bg-slate-950/65 border border-slate-800 px-3 py-2 rounded-2xl flex items-center gap-2 text-[10px] font-semibold font-mono tracking-wide">
                  <div className={`w-1.5 h-1.5 rounded-full ${bookings.filter(b=>b.status==='pending').length > 0 ? 'bg-amber-400 animate-pulse' : 'bg-slate-500'}`} />
                  <span className="text-slate-400 uppercase">QUEUED CONTRACTS:</span>
                  <span className={`${bookings.filter(b=>b.status==='pending').length > 0 ? 'text-amber-400 font-extrabold' : 'text-slate-400'}`}>
                    {bookings.filter(b=>b.status==='pending').length} PENDING
                  </span>
                </div>
              </div>
            </div>
            
            {/* TAB 1: SUMMARY DASHBOARD RINGKASAN */}
            {activeTab === 'dashboard' && (
              <div className="space-y-6 animate-fade-in">
                
                {/* Stats indicators banner */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  
                  <div className="bg-white rounded-2xl p-4 shadow-xs border border-gray-100 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-gray-400 font-bold font-mono tracking-wider uppercase">JUMLAH PROPERTI</span>
                      <div className="text-xl font-black text-slate-900 font-display mt-0.5">{totalPropCount} <span className="text-xs font-normal text-slate-400">Gedung</span></div>
                    </div>
                    <div className="w-10 h-10 bg-emerald-50 text-brand-green rounded-xl flex items-center justify-center font-bold">
                      <Layers size={20} />
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl p-4 shadow-xs border border-gray-100 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-gray-400 font-bold font-mono tracking-wider uppercase">PENGHUNI HUNIAN</span>
                      <div className="text-xl font-black text-slate-900 font-display mt-0.5">{occupiedRoomsCount} <span className="text-xs font-normal text-slate-400">Penyewa</span></div>
                    </div>
                    <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-bold">
                      <UserCheck size={20} />
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl p-4 shadow-xs border border-gray-100 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-gray-400 font-bold font-mono tracking-wider uppercase">KAMAR TERSEDIA</span>
                      <div className="text-xl font-black text-brand-green font-display mt-0.5">{availableRoomsCount} / {rooms.length} <span className="text-xs font-normal text-slate-400">Kamar</span></div>
                    </div>
                    <div className="w-10 h-10 bg-orange-50 text-brand-accent rounded-xl flex items-center justify-center font-bold">
                      <Landmark size={20} />
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl p-4 shadow-xs border border-gray-100 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-gray-400 font-bold font-mono tracking-wider uppercase">KAS AKTIF BANK COA</span>
                      <div className="text-xl font-black text-brand-green font-display mt-0.5">{formatRupiah(accounts.find(a=>a.id===1010)?.balance || 0)}</div>
                    </div>
                    <div className="w-10 h-10 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center font-bold">
                      <Landmark size={20} />
                    </div>
                  </div>

                </div>

                {/* Main Graph panel and activities log */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  {/* Revenue Line Chart Recharts */}
                  <div className="lg:col-span-2 bg-white rounded-3xl p-5 md:p-6 shadow-xs border border-gray-100 space-y-4">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase font-mono tracking-wide">Grafik Histori Keuangan</span>
                      <h3 className="text-base font-bold text-slate-800 font-display">Simulasi Aliran Inflow Pendapatan Kosan</h3>
                    </div>
                    
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height={240} minWidth={0} minHeight={0}>
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorAmt" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#0d5c34" stopOpacity={0.2}/>
                              <stop offset="95%" stopColor="#0d5c34" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" fontSize={11} stroke="#94a3b8" />
                          <YAxis fontSize={11} stroke="#94a3b8" />
                          <Tooltip formatter={(value) => formatRupiah(value as number)} />
                          <Area type="monotone" dataKey="Pendapatan" stroke="#0d5c34" strokeWidth={2} fillOpacity={1} fill="url(#colorAmt)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* High fidelity Activities monitoring panel */}
                  <div className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100 flex flex-col justify-between">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                        <span className="font-bold text-slate-800 font-display flex items-center gap-1"><Activity size={14} className="text-slate-400" /> Logs Operasional</span>
                        <span className="text-[10px] text-slate-400 font-mono font-bold tracking-wide uppercase">Realtime Sync</span>
                      </div>

                      <div className="space-y-3 max-h-[220px] overflow-y-auto no-scrollbar">
                        {activityLogs.map((log) => (
                          <div key={log.id} className="flex gap-2.5 items-start text-[11px] font-medium leading-relaxed">
                            <span className="font-mono text-gray-400 shrink-0 mt-0.5">[{log.time || '10:15'}]</span>
                            <div className="space-y-0.5">
                              <div><strong className="text-slate-800">{log.admin_name}</strong> - <span className="font-mono bg-slate-100 text-slate-500 font-bold px-1 rounded-sm uppercase text-[9px]">{log.action}</span></div>
                              <p className="text-[10px] text-slate-400">{log.detail}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-emerald-50 text-brand-green px-3 py-2 rounded-xl border border-emerald-100 text-[11px] font-medium leading-relaxed flex gap-2">
                      <CheckCircle size={14} className="shrink-0 mt-0.5" />
                      <span>Semua sensor sinkronisasi database ke Supabase & Webhook Midtrans berjalan normal hijau.</span>
                    </div>
                  </div>

                </div>

                {/* Pending action triggers warnings list */}
                <div className="bg-white rounded-3xl p-5 md:p-6 shadow-xs border border-gray-100 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase font-mono tracking-wide">Fokus Prioritas Hari Ini</span>
                      <h3 className="text-base font-bold text-slate-800 font-display">Tugas & Antrian Disetujui Kamar</h3>
                    </div>
                    <span className="bg-red-50 text-red-700 px-2.5 py-1 rounded-full text-[10px] font-extrabold border border-red-200">
                      {bookings.filter(b=>b.status==='pending').length} PESANAN PENDING
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-gray-100 text-[10px] text-gray-400 font-bold font-mono uppercase">
                          <th className="py-3 px-2">NAMA CALON PENYEWA</th>
                          <th className="py-3 px-2">KAMAR</th>
                          <th className="py-3 px-2">METODE</th>
                          <th className="py-3 px-2">TARIF TOTAL</th>
                          <th className="py-3 px-2 text-right">AKSI CEPAT</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-medium">
                        {bookings.filter(b=>b.status==='pending').map((b) => (
                          <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-3 px-2">
                              <div className="font-extrabold text-slate-800">{b.tenant_name}</div>
                              <div className="text-[10px] text-slate-400 shrink-0 font-mono mt-0.5">{b.phone}</div>
                            </td>
                            <td className="py-3 px-2 font-semibold">Unit {b.room_number}</td>
                            <td className="py-3 px-2 uppercase font-mono text-[10px] text-slate-500">{b.payment_method}</td>
                            <td className="py-3 px-2 font-mono text-brand-green">{formatRupiah(b.total_price)}</td>
                            <td className="py-3 px-2 text-right">
                              <div className="inline-flex gap-1">
                                <button
                                  onClick={() => handleApproveBooking(b.id)}
                                  className="p-1 px-2.5 bg-emerald-50 text-brand-green border border-emerald-200 hover:bg-brand-green hover:text-white transition-colors font-bold rounded-lg cursor-pointer"
                                  title="Approve / setujui masa huni dan lunasi transaksi"
                                >
                                  Terima Kontrak
                                </button>
                                <button
                                  onClick={() => handleRejectBooking(b.id)}
                                  className="p-1 px-1.5 bg-red-50 text-red-600 border border-red-200 hover:bg-red-200 transition-colors rounded-lg cursor-pointer"
                                  title="Batalkan / Tolak antrian sewa"
                                >
                                  ✕
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}

                        {bookings.filter(b=>b.status==='pending').length === 0 && (
                          <tr>
                            <td colSpan={5} className="py-10 text-center text-slate-400 font-medium select-none">
                              Tidak ada antrian pesanan kontrak sewa pending saat ini. Semua kontrak terproses rapi!
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}

            {/* TAB 2: GEOMETRIC PROPERTY & ROOMS CRUD */}
            {activeTab === 'properties' && (
              <div className="space-y-6 animate-fade-in">
                
                {/* Header commands bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800 font-display">Fasilitas Properti & Manajemen Nomor Kamar</h2>
                    <p className="text-xs text-gray-400">Menyediakan alur kendali CRUD penuh yang terhubung real-time ke Supabase.</p>
                  </div>

                  <button
                    onClick={handleOpenAddProperty}
                    className="p-2.5 px-4 bg-brand-green hover:bg-brand-green-hover text-white transition-colors rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Plus size={16} /> Tambah Properti Baru
                  </button>
                </div>

                {/* Propery with its child Accordians Rooms list */}
                {properties.map((p) => {
                  const pRooms = rooms.filter(r => r.property_id === p.id);
                  return (
                    <div key={p.id} className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100 space-y-4">
                      
                      {/* Property header row details */}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-4">
                        <div className="flex items-start gap-4">
                          <img 
                            src={p.image_url} 
                            alt={p.name} 
                            className="w-16 h-16 object-cover rounded-2xl bg-slate-100 shrink-0" 
                            referrerPolicy="no-referrer"
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-bold text-slate-900 font-display">{p.name}</h3>
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase font-mono ${
                                p.type === 'putri' ? 'bg-pink-50 text-pink-700 border border-pink-200' : p.type === 'putra' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-orange-50 text-orange-700 border border-orange-200'
                              }`}>
                                KOS {p.type}
                              </span>
                            </div>
                            <p className="text-xs text-gray-400 mt-1">{p.address}</p>
                            <p className="text-[10px] text-brand-green font-mono font-bold mt-1">Sewa Standard: {formatRupiah(p.price)}/bulan</p>
                          </div>
                        </div>

                        {/* Management command triggers */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleOpenAddRoom(p.id)}
                            className="p-1.5 px-3 border border-brand-green text-brand-green hover:bg-emerald-50 rounded-xl font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                          >
                            <Plus size={14} /> Tambah Kamar
                          </button>
                          <button
                            onClick={() => handleOpenEditProperty(p)}
                            className="p-1.5 border border-gray-200 hover:bg-slate-50 rounded-xl text-gray-600 transition-colors cursor-pointer"
                            title="Edit Properti"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => handleDeletePropertyClick(p.id)}
                            className="p-1.5 border border-red-200 text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                            title="Hapus Properti"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Rooms inside list */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {pRooms.map((r) => (
                          <div 
                            key={r.id}
                            className={`p-3 rounded-2xl border text-left space-y-2 flex flex-col justify-between transition-all ${
                              r.status === 'occupied' 
                                ? 'bg-indigo-50/20 border-indigo-100 text-slate-800' 
                                : r.status === 'maintenance'
                                  ? 'bg-yellow-50/10 border-yellow-100 text-slate-800'
                                  : r.status === 'reserved'
                                    ? 'bg-purple-50/10 border-purple-100 text-slate-800'
                                    : 'bg-white border-gray-100 hover:shadow-xs'
                            }`}
                          >
                            <div>
                              <div className="flex justify-between items-center">
                                <span className="font-extrabold text-slate-800 text-xs font-display">{r.room_number}</span>
                                
                                {r.status === 'available' ? (
                                  <span className="w-2 h-2 rounded-full bg-emerald-500" title="Kosong" />
                                ) : r.status === 'occupied' ? (
                                  <span className="w-2 h-2 rounded-full bg-slate-400" title="Terisi" />
                                ) : r.status === 'maintenance' ? (
                                  <span className="w-2 h-2 rounded-full bg-yellow-500" title="Perbaikan" />
                                ) : (
                                  <span className="w-2 h-2 rounded-full bg-purple-500" title="Dipesan" />
                                )}
                              </div>
                              <p className="text-[10px] text-slate-400 mt-1">Lantai: {r.floor} / {r.room_type}</p>
                              <p className="text-[10px] text-brand-green font-bold font-mono mt-0.5">{formatRupiah(r.price)}</p>
                              {r.is_daily_enabled && (
                                <p className="text-[9px] text-slate-400 font-mono">D: {formatRupiah(r.daily_price)}</p>
                              )}
                            </div>

                            <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                              <span className="text-[9px] text-slate-400 uppercase tracking-wider font-mono font-bold truncate">
                                {r.status === 'occupied' ? r.current_tenant_name : r.status}
                              </span>
                              
                              <div className="inline-flex gap-1">
                                <button
                                  onClick={() => handleOpenEditRoom(r)}
                                  className="p-1 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-md transition-colors"
                                  title="Edit Kamar"
                                >
                                  <Edit2 size={10} />
                                </button>
                                <button
                                  onClick={() => handleDeleteRoomClick(r.id)}
                                  className="p-1 bg-red-50 text-red-600 hover:bg-red-100 rounded-md transition-colors"
                                  title="Hapus Kamar"
                                >
                                  <Trash2 size={10} />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}

                        {pRooms.length === 0 && (
                          <div className="col-span-full py-8 text-center text-slate-400 border border-dashed border-gray-100 rounded-xl font-medium">
                            Properti belum memiliki unit terdaftar. Klik + Tambah Kamar di atas.
                          </div>
                        )}
                      </div>

                    </div>
                  );
                })}

              </div>
            )}

            {/* TAB 3: BOOKINGS & TENANTS RECORDS */}
            {activeTab === 'bookings' && (
              <div className="bg-white rounded-3xl p-5 md:p-6 shadow-xs border border-gray-100 space-y-6 animate-fade-in">
                <div>
                  <h2 className="text-lg font-bold text-slate-800 font-display">Pemberkasan Penghuni Terdaftar</h2>
                  <p className="text-xs text-gray-400">Rangkuman riwayat sewa aktif & daftar penghuni yang menyewa kamar Anda.</p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-100 text-[10px] text-gray-400 font-bold font-mono uppercase">
                        <th className="py-3 px-2">NAMA PENGHUNI</th>
                        <th className="py-3 px-2">NOMOR HP & JOB</th>
                        <th className="py-3 px-2 font-mono">LANTAI UNIT</th>
                        <th className="py-3 px-2">MADA SEWA MULAI</th>
                        <th className="py-3 px-2">BILLING NYA</th>
                        <th className="py-3 px-2 text-right">METADATA</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium">
                      {tenants.map((t) => {
                        const tProp = properties.find(p=>p.id === t.property_id);
                        return (
                          <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-3 px-2 flex items-center gap-2.5">
                              <div className={`w-8 h-8 rounded-full ${t.avatar_color} text-white font-extrabold flex items-center justify-center font-mono`}>
                                {t.avatar_initials}
                              </div>
                              <div>
                                <div className="font-extrabold text-slate-800">{t.full_name}</div>
                                <div className="text-[10px] text-slate-400 font-mono">{t.email}</div>
                              </div>
                            </td>
                            <td className="py-3 px-2">
                              <div>{t.phone}</div>
                              <div className="text-[10px] text-slate-400">{t.job || 'Pegawai Swasta'}</div>
                            </td>
                            <td className="py-3 px-2">
                              <div className="font-bold text-slate-800">Unit {t.room_number}</div>
                              <div className="text-[10px] text-slate-400 truncate max-w-[150px]">{tProp?.name || 'Samara Stay'}</div>
                            </td>
                            <td className="py-3 px-2 font-mono text-[10px] text-slate-500">
                              <div>{t.start_date}</div>
                              <div className="text-slate-400 font-sans mt-0.5">{t.duration_months} Bulan Sewa</div>
                            </td>
                            <td className="py-3 px-2">
                              <span className="bg-emerald-50 text-brand-green border border-emerald-200 px-2.1 py-0.5 rounded-full text-[10px] font-extrabold uppercase">
                                PAID-LUNAS
                              </span>
                            </td>
                            <td className="py-3 px-2 text-right text-gray-400 text-[10px] max-w-[120px] truncate">
                              {t.emergency_contact || 'None'}
                            </td>
                          </tr>
                        );
                      })}

                      {tenants.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-400 font-semibold select-none">
                            Belum ada tenant sewa yang disetujui huni. Semua kamar masih kosong seutuhnya.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 4: COMPREHENSIVE SURVEY & DP SCHEDULER */}
            {activeTab === 'surveys' && (
              <div className="bg-white rounded-3xl p-5 md:p-6 shadow-xs border border-gray-100 space-y-6 animate-fade-in">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800 font-display">Perencanaan Jadwal & DP Survey Jaminan</h2>
                    <p className="text-xs text-gray-400">Peta kontrol and antrian survey. Status: survey_confirmed {"->"} no_show (forfeit DP Rp 500k).</p>
                  </div>

                  <div className="bg-blue-50 text-blue-800 border border-blue-200 p-2 text-[10px] rounded-xl flex items-center gap-2 max-w-sm">
                    <CheckCircle size={14} className="text-blue-600 shrink-0" />
                    <span>Jaminan komitmen survey yang di-forfeit otomatis dialirkan ke akun pendapatan (double entries keuangan).</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-100 text-[10px] text-gray-400 font-bold font-mono uppercase">
                        <th className="py-3 px-2">NOMOR RESERVASI / NAMA</th>
                        <th className="py-3 px-2">NIK & WHATSAPP</th>
                        <th className="py-3 px-2">KAMAR RENCANA</th>
                        <th className="py-3 px-2">TANGGAL - JAM SLOT</th>
                        <th className="py-3 px-2">STATUS AKHIR</th>
                        <th className="py-3 px-2 text-right">TINDAKAN CONTROL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium">
                      {surveys.map((s) => {
                        const sProp = properties.find(p=>p.id === s.property_id);
                        return (
                          <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-3 px-2">
                              <div className="font-mono text-gray-400 text-[10px]">{s.reservation_number}</div>
                              <div className="font-extrabold text-slate-800 text-sm mt-0.5">{s.tenant_name}</div>
                              <div className="text-[10px] text-slate-400 mt-0.5 font-normal">{s.email}</div>
                            </td>
                            <td className="py-3 px-2 font-mono">
                              <div>{s.phone}</div>
                              <div className="text-[10px] text-slate-400 shrink-0 mt-0.5">NIK: {s.nik || 'Not listed'}</div>
                            </td>
                            <td className="py-3 px-2">
                              <div className="font-semibold text-slate-850">Unit {s.room_number}</div>
                              <div className="text-[10px] text-slate-400 truncate max-w-[150px]">{sProp?.name || 'Kosan Ciputra'}</div>
                            </td>
                            <td className="py-3 px-2 font-mono">
                              <div className="text-slate-800 font-bold">{s.survey_date}</div>
                              <div className="text-[10px] text-slate-400 shrink-0 mt-0.5">{s.survey_time_slot}</div>
                            </td>
                            <td className="py-3 px-2">
                              {s.status === 'survey_confirmed' ? (
                                <span className="bg-emerald-50 text-brand-green border border-emerald-200 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase">
                                  TERKONFIRMASI - RESERVED
                                </span>
                              ) : s.status === 'pending_payment' ? (
                                <span className="bg-yellow-50 text-yellow-600 border border-yellow-200 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase">
                                  PENDING - BELUM BAYAR
                                </span>
                              ) : s.status === 'no_show' ? (
                                <span className="bg-red-50 text-red-600 border border-red-200 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase">
                                  NO-SHOW (DP HANGUS)
                                </span>
                              ) : s.status === 'survey_completed' ? (
                                <span className="bg-slate-100 text-slate-500 border border-slate-200 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase">
                                  SURVEY COMPLETED
                                </span>
                              ) : (
                                <span className="bg-gray-100 text-gray-500 px-2.5 py-0.5 rounded-full text-[10px] uppercase font-bold">
                                  {s.status}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-2 text-right">
                              {s.status === 'survey_confirmed' && (
                                <div className="inline-flex gap-1">
                                  <button
                                    onClick={() => handleSurveyCompleted(s.id)}
                                    className="p-1 px-2.5 bg-emerald-50 text-brand-green border border-emerald-200 hover:bg-brand-green hover:text-white transition-colors rounded-lg font-bold cursor-pointer"
                                  >
                                    Sukses Survey
                                  </button>
                                  <button
                                    onClick={() => handleSurveyNoShow(s.id)}
                                    className="p-1 px-2.5 bg-red-50 text-red-600 border border-red-200 hover:bg-red-200 transition-colors rounded-lg font-bold cursor-pointer"
                                    title="Calon tamu tidak hadir pada jam tersebut, DP auto forfeited"
                                  >
                                    Absen (No Show)
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}

                      {surveys.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-400 font-semibold select-none">
                            Belum ada agenda janji temu survey yang diajukan.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

              </div>
            )}

            {/* TAB 5: DOUBLE-ENTRY FINANCE GENERAL LEDGER COA */}
            {activeTab === 'finance' && (
              <div className="space-y-6 animate-fade-in">
                
                {/* 1. New Elegant Financial Summary Section */}
                <div className="bg-slate-900 text-white rounded-3xl p-5 md:p-6 border border-slate-800 shadow-xl space-y-4">
                  <div>
                    <span className="text-[10px] text-amber-400 font-mono uppercase tracking-wider font-extrabold flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                      Ringkasan Eksekutif Finansial
                    </span>
                    <h3 className="text-base font-bold text-white font-display mt-0.5">Kinerja Anggaran & Pajak Daerah PBJT (10%)</h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
                    <div className="bg-slate-950/65 p-4 rounded-2xl border border-slate-800/80 space-y-1">
                      <span className="text-[9px] text-slate-400 font-bold uppercase font-mono">Total Arus Masuk (Inflow)</span>
                      <div className="text-sm md:text-base font-extrabold text-[#10b981] font-mono">{formatRupiah(totalInflow)}</div>
                      <p className="text-[9px] text-slate-500 font-sans">Omset dari hunian & jaminan DP survey</p>
                    </div>

                    <div className="bg-slate-950/65 p-4 rounded-2xl border border-slate-800/80 space-y-1">
                      <span className="text-[9px] text-slate-400 font-bold uppercase font-mono">Total Biaya Operasional (Outflow)</span>
                      <div className="text-sm md:text-base font-extrabold text-[#ef4444] font-mono">{formatRupiah(totalOutflow)}</div>
                      <p className="text-[9px] text-slate-500 font-sans">Pengeluaran & pemeliharaan teknis</p>
                    </div>

                    <div className="bg-slate-950/65 p-4 rounded-2xl border border-slate-800/80 space-y-1">
                      <span className="text-[9px] text-slate-400 font-bold uppercase font-mono">Net Margin Keuntungan Bersih</span>
                      <div className="text-sm md:text-base font-extrabold text-amber-500 font-mono">{formatRupiah(netEarnings)}</div>
                      <p className="text-[9px] text-slate-500 font-sans">Sisa laba bersih sebelum denda/potongan</p>
                    </div>

                    <div className="bg-slate-950/65 p-4 rounded-2xl border border-slate-800/80 space-y-1">
                      <span className="text-[9px] text-slate-400 font-bold uppercase font-mono">Kewajiban Pajak Kota PBJT (10%)</span>
                      <div className="text-sm md:text-base font-extrabold text-sky-400 font-mono">
                        {formatRupiah(accounts.find(a=>a.id===2100)?.balance || 0)}
                      </div>
                      <p className="text-[9px] text-slate-500 font-sans">Disisihkan langsung dari billing harian/bulanan</p>
                    </div>
                  </div>
                </div>

                {/* Visual grid balance sheet summary */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Ledger summary Chart of Accounts balances */}
                  <div className="bg-white rounded-3xl p-5 md:p-6 shadow-xs border border-gray-100 space-y-4">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                      <div>
                        <span className="text-[10px] text-gray-400 font-bold uppercase font-mono tracking-wider block">Chart of Accounts (COA)</span>
                        <h3 className="text-base font-bold text-slate-800 font-display">Timbangan Saldo Ledger Double-Entry</h3>
                      </div>
                      <span className="bg-emerald-50 text-brand-green font-bold text-[10px] px-2.5 py-1 border border-emerald-200 rounded-full font-mono uppercase">
                        SEIMBANG (DEBIT = KREDIT)
                      </span>
                    </div>

                    <div className="space-y-2 max-h-[350px] overflow-y-auto no-scrollbar pr-1">
                      {accounts.map((acc) => (
                        <div key={acc.id} className="flex justify-between items-center text-xs py-2 px-3 bg-slate-50 hover:bg-slate-100/60 rounded-xl transition-colors border border-slate-100 font-medium font-sans">
                          <div>
                            <span className="font-mono text-gray-400 text-[10px] mr-2">[{acc.id}]</span>
                            <span className="text-slate-800">{acc.name}</span>
                          </div>
                          <span className={`${acc.type === 'revenue' || acc.type === 'asset' ? 'font-bold text-brand-green' : 'text-slate-600'} font-mono`}>
                            {formatRupiah(acc.balance)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* General journal records */}
                  <div className="bg-white rounded-3xl p-5 md:p-6 shadow-xs border border-gray-100 space-y-4 flex flex-col justify-between">
                    <div className="space-y-4">
                      <div className="border-b border-gray-100 pb-3">
                        <span className="text-[10px] text-gray-400 font-bold uppercase font-mono tracking-wider block">Jurnal Umum Transaksi</span>
                        <h3 className="text-base font-bold text-slate-800 font-display">Buku Jurnal Umum Finansial</h3>
                      </div>

                      <div className="space-y-3.5 max-h-[290px] overflow-y-auto no-scrollbar pr-1">
                        {transactions.map((trx) => (
                          <div key={trx.id} className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex justify-between gap-4 font-medium">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono text-[9px] text-gray-400">[{trx.transaction_no}]</span>
                                <span className={`px-1.5 py-0.5 rounded-md text-[8px] font-extrabold uppercase font-mono ${
                                  trx.type === 'income' ? 'bg-emerald-50 text-brand-green' : trx.type === 'expense' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-700'
                                }`}>
                                  {trx.type}
                                </span>
                              </div>
                              <p className="text-xs text-slate-800 font-semibold">{trx.description}</p>
                              <div className="text-[10px] text-slate-400 font-normal">Tgl Settle: {trx.transaction_date} | Operator: {trx.created_by}</div>
                            </div>
                            <span className={`font-mono text-xs font-bold ${trx.type === 'expense' ? 'text-red-400' : 'text-emerald-500'} shrink-0 align-top`}>
                              {trx.type === 'expense' ? '-' : '+'}{formatRupiah(trx.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-[#0f0f12] text-slate-300 p-4 rounded-2xl text-[11px] leading-relaxed flex gap-2 border border-slate-805 mt-2">
                      <FileSpreadsheet size={18} className="text-[#f5a623] shrink-0 mt-0.5 animate-pulse" />
                      <div>
                        <strong className="text-white">Kepatuhan Standar PBJT & PBX (10%)</strong>
                        <p className="text-slate-400 mt-0.5">Sistem akuntansi terintegrasi otomatis memisahkan elemen pajak PBJT daerah DKI/Depok langsung ke akun kewajiban lancar (Akun 2100) demi keandalan audit perpajakan.</p>
                      </div>
                    </div>
                  </div>

                </div>

                {/* 3. New Payment History View (Connected to Supabase payment state) */}
                <div className="bg-white rounded-3xl p-5 md:p-6 shadow-xs border border-gray-100 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-3">
                    <div>
                      <span className="text-[10px] text-gray-400 font-bold uppercase font-mono tracking-wider block">Payment Ledger History</span>
                      <h3 className="text-base font-bold text-slate-800 font-display">Histori Pembayaran Digital (Gateway Midtrans SNAP)</h3>
                    </div>
                    
                    {/* Search & filters for payment history */}
                    <div className="flex gap-2 text-xs">
                      <input 
                        type="text"
                        placeholder="Cari tenant..."
                        value={paymentSearch}
                        onChange={(e) => setPaymentSearch(e.target.value)}
                        className="p-1.5 px-3 rounded-xl border border-gray-200 outline-none text-[11px]"
                      />
                      <select
                        value={paymentFilterStatus}
                        onChange={(e) => setPaymentFilterStatus(e.target.value)}
                        className="p-1.5 rounded-xl border border-gray-200 text-[11px] bg-white cursor-pointer font-sans"
                      >
                        <option value="all">Semua Status</option>
                        <option value="paid">Lunas (Paid)</option>
                        <option value="pending">Pending</option>
                        <option value="overdue">Overdue</option>
                      </select>
                    </div>
                  </div>

                  <div className="overflow-x-auto font-sans">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-gray-100 text-[10px] text-gray-400 font-bold font-mono uppercase bg-slate-50">
                          <th className="py-2.5 px-3">INVOICE ID</th>
                          <th className="py-2.5 px-3">NAMA PENYEWA</th>
                          <th className="py-2.5 px-3">METODE TRANSFER</th>
                          <th className="py-2.5 px-3">TGL SETTLE</th>
                          <th className="py-2.5 px-3">NOMINAL TRANSFER</th>
                          <th className="py-2.5 px-3">STATUS</th>
                          <th className="py-2.5 px-3 text-right">AKSI</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-medium text-slate-700">
                        {filteredPayments.map((p) => (
                          <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-2.5 px-3 font-mono text-[10px] text-gray-500">{p.id}</td>
                            <td className="py-2.5 px-3 font-bold text-slate-800">{p.tenant_name}</td>
                            <td className="py-2.5 px-3 uppercase font-mono text-[10px]" title={`OrderId: ${p.midtrans_order_id || 'N/A'}`}>{p.method || 'MIDTRANS'}</td>
                            <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">{p.payment_date || '-'}</td>
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{formatRupiah(p.amount)}</td>
                            <td className="py-2.5 px-3">
                              {p.status === 'paid' ? (
                                <span className="bg-emerald-50 text-brand-green border border-emerald-200 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase">
                                  SUKSES - LUNAS
                                </span>
                              ) : p.status === 'pending' ? (
                                <span className="bg-amber-50 text-amber-600 border border-amber-200 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase">
                                  PENDING
                                </span>
                              ) : (
                                <span className="bg-red-50 text-red-650 border border-red-200 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase">
                                  {p.status}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => setSelectedPaymentReceipt(p)}
                                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded text-[10px] transition-all hover:scale-105 active:scale-95 cursor-pointer uppercase inline-flex items-center gap-1 border border-slate-200"
                                  title="Lihat Kuitansi & Detil Transaksi"
                                >
                                  <FileText size={10} />
                                  Kuitansi
                                </button>
                                {p.status !== 'paid' && (
                                  <button
                                    onClick={() => handleApprovePayment(p.id)}
                                    className="bg-emerald-650 hover:bg-emerald-700 text-white font-bold px-2 py-0.5 rounded text-[10px] transition-all hover:scale-105 active:scale-95 cursor-pointer uppercase"
                                    title="Setujui pembayaran secara manual"
                                  >
                                    Setujui
                                  </button>
                                )}
                                {p.status !== 'overdue' && (
                                  <button
                                    onClick={() => handleRejectPayment(p.id)}
                                    className="bg-rose-650 hover:bg-rose-700 text-white font-bold px-2 py-0.5 rounded text-[10px] transition-all hover:scale-105 active:scale-95 cursor-pointer uppercase"
                                    title="Tolak pembayaran secara manual"
                                  >
                                    Tolak
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}

                        {filteredPayments.length === 0 && (
                          <tr>
                            <td colSpan={7} className="py-10 text-center text-slate-400 font-semibold font-sans">
                              Tidak ada histori pembayaran digital yang cocok.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}

            {/* TAB 6: BRAND COUPONS OR PROMOS */}
            {activeTab === 'coupons' && (
              <div className="bg-white rounded-3xl p-5 md:p-6 shadow-xs border border-gray-100 space-y-6 animate-fade-in">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800 font-display">Voucher Promosi & Potongan Bulanan</h2>
                    <p className="text-xs text-gray-400">Kelola kupon marketing aktif guna merangsang okupansi hunian kost Anda.</p>
                  </div>

                  <button
                    onClick={() => {
                      setCouponFormData({
                        code: `PROMO-${Math.floor(100 + Math.random()*900)}`,
                        discount_type: 'percentage',
                        discount_value: 15,
                        max_discount_amount: 300000,
                        is_active: true,
                        description: 'Diskon Spesial Musim Libur Sekolah'
                      });
                      setShowCouponModal(true);
                    }}
                    className="p-2.5 px-4 bg-brand-green hover:bg-brand-green-hover text-white transition-colors rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Plus size={16} /> Buat Kupon Baru
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {coupons.map((c) => (
                    <div key={c.id} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between gap-4 font-medium">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono bg-brand-green text-white font-black px-2.5 py-1 rounded-xl text-xs tracking-wider">
                            {c.code}
                          </span>
                          <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold ${c.is_active ? 'bg-emerald-50 text-brand-green' : 'bg-red-50 text-red-600'}`}>
                            {c.is_active ? 'AKTIF' : 'NONAKTIF'}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-slate-800 pt-1">{c.description}</p>
                        <p className="text-[10px] text-slate-400 font-normal">Potongan: {c.discount_type === 'percentage' ? `${c.discount_value}%` : formatRupiah(c.discount_value)} {c.max_discount_amount ? `(Maks ${formatRupiah(c.max_discount_amount)})` : ''}</p>
                      </div>

                      <button
                        onClick={() => handleDeleteCouponClick(c.id)}
                        className="p-2 bg-red-100 text-red-600 hover:bg-red-200 rounded-xl transition-colors cursor-pointer shrink-0"
                        title="Delete promo trigger"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 7: SYSTEM RULES CONFIG AGREEMENTS */}
            {activeTab === 'settings' && (
              <div className="bg-white rounded-3xl p-5 md:p-6 shadow-xs border border-gray-100 space-y-6 animate-fade-in font-medium">
                <div>
                  <h2 className="text-lg font-bold text-slate-800 font-display">Teks Tata Tertib & Peraturan Kontrak</h2>
                  <p className="text-xs text-gray-400">Atur syarat ketentuan hukum, denda, draf kovenan survey, dan tata tertib sewa hunian kosan.</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] text-slate-400 font-bold uppercase font-mono tracking-wider mb-1.5">KONTRAK SURAT SEWA BULANAN (SYARAT & KETENTUAN)</label>
                    <textarea
                      rows={6}
                      value={editedBookingRules}
                      onChange={(e) => setEditedBookingRules(e.target.value)}
                      className="w-full p-3 border border-gray-200 rounded-2xl bg-white text-slate-800 focus:outline-hidden font-sans text-xs leading-relaxed"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 font-bold uppercase font-mono tracking-wider mb-1.5">KOVENAN SURVEY DP JAMINAN (PEMBATALAN & NO-SHOW)</label>
                    <textarea
                      rows={6}
                      value={editedSurveyRules}
                      onChange={(e) => setEditedSurveyRules(e.target.value)}
                      className="w-full p-3 border border-gray-200 rounded-2xl bg-white text-slate-800 focus:outline-hidden font-sans text-xs leading-relaxed"
                    />
                  </div>

                  <button
                    onClick={handleSaveSystemSettings}
                    className="bg-brand-green hover:bg-brand-green-hover text-white transition-colors py-3 px-6 rounded-2xl text-xs font-bold shadow-xs cursor-pointer"
                  >
                    Simpan Perubahan Aturan
                  </button>
                </div>
              </div>
            )}

          </>
        )}

      </div>

      {/* POPUP: PROPERTY MODAL FORM */}
      {showPropertyModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[130] p-4 text-xs font-sans text-slate-700">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-md border border-slate-100 space-y-4">
            <h3 className="text-base font-bold text-slate-900 font-display">{editingProperty ? 'Edit Unit Properti' : 'Tambah Properti Baru'}</h3>
            
            <form onSubmit={handleSavePropertySubmit} className="space-y-3 font-semibold">
              <div>
                <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Nama Properti *</label>
                <input 
                  type="text" required
                  value={propertyFormData.name}
                  onChange={(e)=>setPropertyFormData({...propertyFormData, name: e.target.value})}
                  className="w-full p-2 rounded-xl border border-gray-200 bg-white"
                  placeholder="e.g. Samara Stay Premium"
                />
              </div>

              <div>
                <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Alamat Gedung *</label>
                <input 
                  type="text" required
                  value={propertyFormData.address}
                  onChange={(e)=>setPropertyFormData({...propertyFormData, address: e.target.value})}
                  className="w-full p-2 rounded-xl border border-gray-200 bg-white"
                  placeholder="e.g. Jl. Raya Kemang Raya No. 4"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Standard Price *</label>
                  <input 
                    type="number" required
                    value={propertyFormData.price}
                    onChange={(e)=>setPropertyFormData({...propertyFormData, price: Number(e.target.value)})}
                    className="w-full p-2 rounded-xl border border-gray-200 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Gender Kos *</label>
                  <select 
                    value={propertyFormData.type}
                    onChange={(e)=>setPropertyFormData({...propertyFormData, type: e.target.value as any})}
                    className="w-full p-2 rounded-xl border border-gray-200 bg-white"
                  >
                    <option value="campur">Campur / Bebas</option>
                    <option value="putra">Putra</option>
                    <option value="putri">Putri</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Fasilitas (Dipisahkan Koma) *</label>
                <input 
                  type="text" required
                  value={propertyFormData.facilities}
                  onChange={(e)=>setPropertyFormData({...propertyFormData, facilities: e.target.value})}
                  className="w-full p-2 rounded-xl border border-gray-200 bg-white"
                />
              </div>

              <div>
                <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">URL Gambar Banner *</label>
                <input 
                  type="text" required
                  value={propertyFormData.image_url}
                  onChange={(e)=>setPropertyFormData({...propertyFormData, image_url: e.target.value})}
                  className="w-full p-2 rounded-xl border border-gray-200 bg-white font-mono text-[10px]"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={()=>setShowPropertyModal(false)}
                  className="flex-1 py-2 rounded-xl border border-gray-200 hover:bg-slate-50 transition-colors font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-brand-green text-white hover:bg-brand-green-hover transition-colors rounded-xl font-bold cursor-pointer"
                >
                  Simpan Properti
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POPUP: ROOM MODAL FORM */}
      {showRoomModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[130] p-4 text-xs font-sans text-slate-700">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm border border-slate-100 space-y-4">
            <h3 className="text-base font-bold text-slate-900 font-display">{editingRoom ? 'Edit Kamar Hunian' : 'Tambah Kamar Baru'}</h3>
            
            <form onSubmit={handleSaveRoomSubmit} className="space-y-3 font-semibold">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Nomor Kamar *</label>
                  <input 
                    type="text" required
                    value={roomFormData.room_number}
                    onChange={(e)=>setRoomFormData({...roomFormData, room_number: e.target.value})}
                    className="w-full p-2 rounded-xl border border-gray-200 bg-white"
                    placeholder="e.g. R301"
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Tipe Kamar *</label>
                  <select 
                    value={roomFormData.room_type}
                    onChange={(e)=>setRoomFormData({...roomFormData, room_type: e.target.value as any})}
                    className="w-full p-2 rounded-xl border border-gray-200 bg-white"
                  >
                    <option value="Standard">Standard</option>
                    <option value="Deluxe">Deluxe</option>
                    <option value="Premium">Premium</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Harga Bulanan *</label>
                  <input 
                    type="number" required
                    value={roomFormData.price}
                    onChange={(e)=>setRoomFormData({...roomFormData, price: Number(e.target.value)})}
                    className="w-full p-2 rounded-xl border border-gray-200 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Ukuran (m²) *</label>
                  <input 
                    type="number" required step="0.1"
                    value={roomFormData.size_sqm}
                    onChange={(e)=>setRoomFormData({...roomFormData, size_sqm: Number(e.target.value)})}
                    className="w-full p-2 rounded-xl border border-gray-200 bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Kamar Lantai *</label>
                  <input 
                    type="number" required
                    value={roomFormData.floor}
                    onChange={(e)=>setRoomFormData({...roomFormData, floor: Number(e.target.value)})}
                    className="w-full p-2 rounded-xl border border-gray-200 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Status Hunian *</label>
                  <select 
                    value={roomFormData.status}
                    onChange={(e)=>setRoomFormData({...roomFormData, status: e.target.value as any})}
                    className="w-full p-2 rounded-xl border border-gray-200 bg-white font-mono"
                  >
                    <option value="available">available (Kosong)</option>
                    <option value="occupied">occupied (Terisi)</option>
                    <option value="maintenance">maintenance (Service)</option>
                    <option value="reserved">reserved (Booked)</option>
                  </select>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="daily_enabled_box"
                    checked={roomFormData.is_daily_enabled}
                    onChange={(e)=>setRoomFormData({...roomFormData, is_daily_enabled: e.target.checked})}
                    className="rounded-sm accent-brand-green"
                  />
                  <label htmlFor="daily_enabled_box" className="text-[10px] text-slate-700 font-extrabold cursor-pointer">Aktifkan Tarif sewa harian</label>
                </div>

                {roomFormData.is_daily_enabled && (
                  <div>
                    <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Tarif Harian (Rupiah) *</label>
                    <input 
                      type="number" required
                      value={roomFormData.daily_price}
                      onChange={(e)=>setRoomFormData({...roomFormData, daily_price: Number(e.target.value)})}
                      className="w-full p-1.5 rounded-xl border border-gray-200 bg-white font-mono"
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={()=>setShowRoomModal(false)}
                  className="flex-1 py-2 rounded-xl border border-gray-200 hover:bg-slate-50 transition-colors font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-brand-green text-white hover:bg-brand-green-hover transition-colors rounded-xl font-bold cursor-pointer"
                >
                  Simpan Unit Kamar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POPUP: COUPON MODAL FORM */}
      {showCouponModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[130] p-4 text-xs font-sans text-slate-700">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-xs border border-slate-100 space-y-4">
            <h3 className="text-base font-bold text-slate-900 font-display">Buat Kupon Voucher Baru</h3>
            
            <form onSubmit={handleSaveCouponSubmit} className="space-y-3 font-semibold">
              <div>
                <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">KODE KUPON (HURUF BESAR) *</label>
                <input 
                  type="text" required
                  value={couponFormData.code}
                  onChange={(e)=>setCouponFormData({...couponFormData, code: e.target.value.toUpperCase()})}
                  className="w-full p-2 rounded-xl border border-gray-200 bg-white font-mono tracking-widest text-center text-xs font-bold"
                  placeholder="e.g. DISKONRAMADHAN"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Tipe Diskon *</label>
                  <select 
                    value={couponFormData.discount_type}
                    onChange={(e)=>setCouponFormData({...couponFormData, discount_type: e.target.value as any})}
                    className="w-full p-2 rounded-xl border border-gray-200 bg-white"
                  >
                    <option value="percentage">Persen (%)</option>
                    <option value="fixed">Nominal Tetap (Rp)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Nilai Potongan *</label>
                  <input 
                    type="number" required
                    value={couponFormData.discount_value}
                    onChange={(e)=>setCouponFormData({...couponFormData, discount_value: Number(e.target.value)})}
                    className="w-full p-2 rounded-xl border border-gray-200 bg-white font-mono"
                  />
                </div>
              </div>

              {couponFormData.discount_type === 'percentage' && (
                <div>
                  <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Maksimal Potongan Nominal Rupiah</label>
                  <input 
                    type="number" required
                    value={couponFormData.max_discount_amount}
                    onChange={(e)=>setCouponFormData({...couponFormData, max_discount_amount: Number(e.target.value)})}
                    className="w-full p-2 rounded-xl border border-gray-200 bg-white font-mono"
                  />
                </div>
              )}

              <div>
                <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Deskripsi & Syarat Kupon</label>
                <input 
                  type="text" required
                  value={couponFormData.description}
                  onChange={(e)=>setCouponFormData({...couponFormData, description: e.target.value})}
                  className="w-full p-2 rounded-xl border border-gray-200 bg-white"
                  placeholder="e.g. Diskon 15% masa huni minimal 3 bulan"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={()=>setShowCouponModal(false)}
                  className="flex-1 py-2 rounded-xl border border-gray-200 hover:bg-slate-50 transition-colors font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-brand-green text-white hover:bg-brand-green-hover transition-colors rounded-xl font-bold cursor-pointer"
                >
                  Simpan Kupon
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POPUP: CUSTOM CONFIRMATION DIALOG */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-[200] p-4 text-xs font-sans text-slate-250">
          <div className="bg-[#0f0f12] border border-slate-800 rounded-3xl shadow-2xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-xl border ${
                confirmModal.variant === 'danger'
                  ? 'bg-red-500/10 text-red-450 border-red-500/20'
                  : confirmModal.variant === 'warning'
                    ? 'bg-amber-550/10 text-amber-450 border-amber-550/20'
                    : confirmModal.variant === 'success'
                      ? 'bg-emerald-500/10 text-emerald-450 border-emerald-500/20'
                      : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
              }`}>
                <ShieldAlert size={18} />
              </div>
              <h3 className="text-sm font-extrabold text-white font-display uppercase tracking-tight">{confirmModal.title}</h3>
            </div>

            <p className="text-slate-300 leading-relaxed font-sans text-[11px] font-medium">{confirmModal.message}</p>

            <div className="flex gap-2 pt-1 font-sans">
              <button
                type="button"
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                className="flex-1 py-1.5 rounded-xl border border-white/10 text-slate-350 hover:bg-white/5 transition-colors font-bold cursor-pointer text-[11px]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                className={`flex-1 py-1.5 transition-colors rounded-xl text-black font-extrabold cursor-pointer text-[11px] border ${
                  confirmModal.variant === 'danger'
                    ? 'bg-red-500 hover:bg-red-400 border-red-500 text-white'
                    : confirmModal.variant === 'warning'
                      ? 'bg-amber-500 hover:bg-amber-450 border-amber-500 text-black'
                      : confirmModal.variant === 'success'
                        ? 'bg-emerald-500 hover:bg-emerald-400 border-emerald-500 text-white'
                        : 'bg-amber-500 hover:bg-amber-450 border-amber-500 text-black'
                }`}
              >
                Konfirmasi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP: KUITANSI DETAIL DENGAN AKSI APPROVE & REJECT */}
      {selectedPaymentReceipt && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-[200] p-4 text-xs font-sans text-slate-250 animate-fade-in">
          <div className="bg-[#0f0f12] border border-slate-800 rounded-3xl shadow-2xl p-6 w-full max-w-sm space-y-5 relative">
            <button 
              onClick={() => setSelectedPaymentReceipt(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>

            {/* Receipt Branding Header */}
            <div className="border-b border-slate-800 pb-3 text-center space-y-1">
              <div className="flex justify-center items-center gap-1.5 text-white">
                <BadgeCheck size={18} className="text-amber-500 animate-pulse" />
                <h3 className="font-extrabold text-sm tracking-widest font-display text-white mt-1">SAMARA STAY</h3>
              </div>
              <p className="text-[9px] font-bold text-slate-500 font-mono tracking-wider uppercase">BUKTI KWITANSI PEMBAYARAN DIGITAL</p>
            </div>

            {/* Receipt Content */}
            <div className="space-y-2 text-[11px] font-medium leading-relaxed">
              <div className="flex justify-between border-b border-slate-900 py-1">
                <span className="text-slate-500 uppercase font-mono text-[9px]">Nomor Invoice</span>
                <span className="font-mono text-white select-all">{selectedPaymentReceipt.id}</span>
              </div>

              <div className="flex justify-between border-b border-slate-900 py-1">
                <span className="text-slate-500 uppercase font-mono text-[9px]">Nama Penyewa</span>
                <span className="text-slate-100 font-bold capitalize">{selectedPaymentReceipt.tenant_name}</span>
              </div>

              <div className="flex justify-between border-b border-slate-900 py-1">
                <span className="text-slate-500 uppercase font-mono text-[9px]">Order ID (Midtrans)</span>
                <span className="text-slate-300 font-mono text-[10px]">{selectedPaymentReceipt.midtrans_order_id || '-'}</span>
              </div>

              <div className="flex justify-between border-b border-slate-900 py-1">
                <span className="text-slate-500 uppercase font-mono text-[9px]">Tanggal Settle</span>
                <span className="text-slate-300 font-mono">{selectedPaymentReceipt.payment_date || '-'}</span>
              </div>

              <div className="flex justify-between border-b border-slate-900 py-1">
                <span className="text-slate-500 uppercase font-mono text-[9px]">Metode</span>
                <span className="text-slate-100 font-mono uppercase">{selectedPaymentReceipt.method || 'MIDTRANS'}</span>
              </div>

              <div className="flex justify-between border-b border-slate-900 py-1">
                <span className="text-slate-500 uppercase font-mono text-[9px]">Alokasi Perpajakan</span>
                <span className="text-slate-400">PBJT Kota (10%) Disisihkan</span>
              </div>
            </div>

            {/* Total Paid Display */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-900 text-center space-y-1">
              <span className="text-[9px] uppercase font-bold text-slate-500 font-mono">NOMINAL TRANSAKSI</span>
              <div className="text-lg font-extrabold text-amber-500 font-mono">{formatRupiah(selectedPaymentReceipt.amount)}</div>
              
              <div className="flex items-center justify-center gap-1.5 pt-1.5 border-t border-slate-900/50 mt-1.5">
                {selectedPaymentReceipt.status === 'paid' ? (
                  <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide inline-flex items-center gap-1">
                    <CheckCircle size={10} />
                    SUKSES - LUNAS
                  </span>
                ) : selectedPaymentReceipt.status === 'pending' ? (
                  <span className="bg-amber-550/10 text-amber-400 border border-amber-550/25 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide inline-flex items-center gap-1">
                    <ShieldAlert size={10} className="animate-pulse" />
                    PENDING SETTLEMENT
                  </span>
                ) : (
                  <span className="bg-red-500/10 text-red-400 border border-red-500/25 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide inline-flex items-center gap-1">
                    <X size={10} />
                    BATAL / OVERDUE
                  </span>
                )}
              </div>
            </div>

            <p className="text-[9px] text-slate-500 text-center leading-normal">
              Silakan lakukan validasi kuitansi di atas secara teliti sebelum mengambil keputusan persetujuan atau penolakan pembayaran digital.
            </p>

            {/* Modal Bottom Buttons */}
            <div className="flex flex-col gap-2 pt-1">
              {selectedPaymentReceipt.status !== 'paid' && (
                <button
                  onClick={() => handleApprovePayment(selectedPaymentReceipt.id)}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-xl transition-all cursor-pointer text-[11px] uppercase tracking-wide text-center"
                >
                  Setujui & Lunaskan
                </button>
              )}
              {selectedPaymentReceipt.status !== 'overdue' && (
                <button
                  onClick={() => handleRejectPayment(selectedPaymentReceipt.id)}
                  className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white font-extrabold rounded-xl transition-all cursor-pointer text-[11px] uppercase tracking-wide text-center"
                >
                  Tolak / Batalkan
                </button>
              )}
              
              <div className="flex gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 font-bold border border-slate-750 text-slate-300 rounded-xl cursor-pointer text-[10px] uppercase"
                >
                  Cetak PDF
                </button>
                <button
                  onClick={() => setSelectedPaymentReceipt(null)}
                  className="flex-1 py-1.5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 font-bold rounded-xl cursor-pointer text-[10px] uppercase"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
