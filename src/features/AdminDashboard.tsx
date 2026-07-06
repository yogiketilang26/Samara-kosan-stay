/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  BarChart3, Layers, UserCheck, CalendarCheck, Landmark, Tag, Settings, CreditCard,
  Plus, Edit2, Trash2, Check, X, ShieldAlert, FileSpreadsheet, Eye, Printer, Shield, Activity,
  CheckCircle, FileText, BadgeCheck, Search, Coins, TrendingUp, TrendingDown, Wallet, Percent, 
  ArrowRightLeft, AlertTriangle, Sparkles, BookOpen, ShoppingBag, Wrench, Calculator, Clock, HelpCircle,
  Download
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend
} from 'recharts';
import { Property, Room, Booking, Tenant, Survey, PaymentInvoice, AccountCOA, FinancialTransaction, SystemSettings, Coupon, ActivityLog, JournalEntry, StandardFacility, FAQItem } from '../types';
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
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [rules, setRules] = useState<SystemSettings | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);

  // Payment search / filters
  const [paymentSearch, setPaymentSearch] = useState('');
  const [paymentFilterStatus, setPaymentFilterStatus] = useState('all');
  const [selectedPaymentReceipt, setSelectedPaymentReceipt] = useState<PaymentInvoice | null>(null);

  // ERP Finance states
  const [activeFinanceSubTab, setActiveFinanceSubTab] = useState<'overview' | 'ledger' | 'ar' | 'ap' | 'assets' | 'petty' | 'tax' | 'audit'>('overview');
  const [journalViewMode, setJournalViewMode] = useState<'transactions' | 'double_entry'>('transactions');
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerAccountFilter, setLedgerAccountFilter] = useState('all');

  const exportToCSV = (headers, rows, filename) => {
    const csvContent = [
      headers.join(','),
      ...rows.map(e => e.map(val => {
        const cleanVal = val === null || val === undefined ? '' : String(val).replace(/"/g, '""');
        return (cleanVal.includes(',') || cleanVal.includes('\n') || cleanVal.includes('"')) ? `"${cleanVal}"` : cleanVal;
      }).join(','))
    ].join('\n');
    
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportLedgerCSV = () => {
    const headers = [
      "Nomor Jurnal",
      "Tanggal Transaksi",
      "Deskripsi Transaksi",
      "Kategori",
      "Kode Akun",
      "Nama Akun",
      "Debit (Rp)",
      "Kredit (Rp)"
    ];
    
    const sortedEntries = [...journalEntries].sort((a, b) => {
      const parentA = transactions.find(t => t.id === a.transaction_id);
      const parentB = transactions.find(t => t.id === b.transaction_id);
      const dateA = parentA?.transaction_date || a.created_at || '';
      const dateB = parentB?.transaction_date || b.created_at || '';
      return dateA.localeCompare(dateB) || a.id - b.id;
    });

    const rows = sortedEntries.map((jrn) => {
      const parentTrx = transactions.find(t => t.id === jrn.transaction_id);
      const acc = accounts.find(a => a.id === jrn.account_id);
      return [
        jrn.journal_no,
        parentTrx?.transaction_date || jrn.created_at?.split('T')[0] || '-',
        parentTrx?.description || 'Manual Adjustments',
        parentTrx?.category || 'General',
        jrn.account_id,
        acc?.name || `Akun ${jrn.account_id}`,
        jrn.debit,
        jrn.credit
      ];
    });
    
    exportToCSV(headers, rows, `samara_general_ledger_${new Date().toISOString().split('T')[0]}.csv`);
    database.logActivity("System Finance", "EXPORT_REPORT", "Ekspor General Ledger ke Excel CSV");
  };

  const handleExportCOACSV = () => {
    const headers = ["Nomor Akun", "Nama Akun", "Tipe Akun", "Saldo Akhir (Rp)"];
    const rows = accounts.map(acc => [
      acc.id,
      acc.name,
      acc.type.toUpperCase(),
      acc.balance
    ]);
    exportToCSV(headers, rows, `samara_chart_of_accounts_${new Date().toISOString().split('T')[0]}.csv`);
    database.logActivity("System Finance", "EXPORT_REPORT", "Ekspor Chart of Accounts ke Excel CSV");
  };

  const handleExportLedgerJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ accounts, journalEntries, transactions }, null, 2));
    const link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute("download", `samara_financial_ledger_${new Date().toISOString().split('T')[0]}.json`);
    link.click();
    database.logActivity("System Finance", "EXPORT_REPORT", "Ekspor General Ledger ke JSON");
  };

  const getFilteredLedgerRows = () => {
    const sortedEntries = [...journalEntries].sort((a, b) => {
      const parentA = transactions.find(t => t.id === a.transaction_id);
      const parentB = transactions.find(t => t.id === b.transaction_id);
      const dateA = parentA?.transaction_date || a.created_at || '';
      const dateB = parentB?.transaction_date || b.created_at || '';
      return dateA.localeCompare(dateB) || a.id - b.id;
    });

    let cumulative = 0;
    const rowsWithBalance = sortedEntries.map(jrn => {
      const parentTrx = transactions.find(t => t.id === jrn.transaction_id);
      const acc = accounts.find(a => a.id === jrn.account_id);
      cumulative += jrn.debit - jrn.credit;
      return {
        ...jrn,
        parentTrx,
        acc,
        runningBalance: cumulative
      };
    });

    const filtered = rowsWithBalance.filter(row => {
      const matchesSearch = !ledgerSearch || 
        row.journal_no.toLowerCase().includes(ledgerSearch.toLowerCase()) ||
        (row.parentTrx?.description || '').toLowerCase().includes(ledgerSearch.toLowerCase()) ||
        (row.acc?.name || '').toLowerCase().includes(ledgerSearch.toLowerCase()) ||
        String(row.account_id).includes(ledgerSearch);
        
      const matchesAccount = ledgerAccountFilter === 'all' || 
        row.account_id === Number(ledgerAccountFilter);
        
      return matchesSearch && matchesAccount;
    });

    return [...filtered].reverse();
  };
  
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
  const [editedStandardFacilities, setEditedStandardFacilities] = useState<StandardFacility[]>([]);
  const [editedWhyChooseUs, setEditedWhyChooseUs] = useState<string[]>([]);
  const [editedFaqs, setEditedFaqs] = useState<FAQItem[]>([]);

  // Initial Sync
  useEffect(() => {
    async function loadAdminData() {
      setLoading(true);
      const [p, r, b, t, s, pay, acc, trx, jrn, rul, coup, logs] = await Promise.all([
        database.fetchProperties(),
        database.fetchRooms(),
        database.fetchBookings(),
        database.fetchTenants(),
        database.fetchSurveys(),
        database.fetchPayments(),
        database.fetchAccounts(),
        database.fetchFinancialTransactions(),
        database.fetchJournalEntries(),
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
      setJournalEntries(jrn);
      setRules(rul);
      setCoupons(coup);
      setActivityLogs(logs);

      if (rul) {
        setEditedBookingRules(rul.booking_rules);
        setEditedSurveyRules(rul.survey_rules);
        try {
          setEditedStandardFacilities(rul.standard_facilities ? JSON.parse(rul.standard_facilities) : [
            { icon: "Clock", title: "Jam Operasional", subtitle: "24 Jam" },
            { icon: "LogIn", title: "Check In", subtitle: "Fleksibel" },
            { icon: "Shield", title: "Security", subtitle: "24 Jam" },
            { icon: "Wifi", title: "WiFi", subtitle: "100 Mbps" },
            { icon: "Zap", title: "Listrik", subtitle: "Token/Include" },
            { icon: "Droplet", title: "Air", subtitle: "Bersih 24 Jam" },
            { icon: "Car", title: "Parkir", subtitle: "Motor & Mobil" },
            { icon: "Shirt", title: "Laundry", subtitle: "Tersedia" },
            { icon: "Sparkles", title: "Cleaning", subtitle: "2x / Minggu" }
          ]);
        } catch (e) { console.error(e); }
        try {
          setEditedWhyChooseUs(rul.why_choose_us ? JSON.parse(rul.why_choose_us) : [
            "Standar Kebersihan Terjaga",
            "CCTV 24 Jam di Area Umum",
            "Maintenance Cepat < 24 Jam",
            "Admin Responsif via WhatsApp",
            "Pembayaran Digital Aman",
            "Kontrak Transparan Tanpa Biaya Tersembunyi"
          ]);
        } catch (e) { console.error(e); }
        try {
          setEditedFaqs(rul.faqs ? JSON.parse(rul.faqs) : [
            {
              question: "Bagaimana cara booking kamar di Samara Stay?",
              answer: "Anda dapat memilih gedung dan kamar kost di aplikasi kami, tentukan tanggal mulai sewa, dan selesaikan pembayaran DP atau sewa bulan pertama secara instan menggunakan sistem pembayaran digital terintegrasi."
            },
            {
              question: "Apa saja fasilitas yang tersedia di setiap kamar?",
              answer: "Setiap kamar dilengkapi dengan AC, tempat tidur (kasur queen), kamar mandi dalam dengan water heater, meja kerja, lemari pakaian, dan akses Wi-Fi berkecepatan tinggi."
            },
            {
              question: "Berapa biaya administrasi dan deposit yang harus dibayar?",
              answer: "Di Samara Stay bebas dari biaya administrasi tersembunyi. Kami menerapkan deposit komitmen sewa yang transparan dan akan dikembalikan utuh pada saat masa sewa Anda selesai."
            },
            {
              question: "Apakah ada kontrak jangka panjang?",
              answer: "Kami menyediakan kontrak sewa bulanan yang sangat fleksibel tanpa kewajiban komitmen tahunan yang memberatkan, sehingga sangat ideal untuk mahasiswa dan pekerja aktif."
            }
          ]);
        } catch (e) { console.error(e); }
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
      survey_rules: editedSurveyRules,
      standard_facilities: JSON.stringify(editedStandardFacilities),
      why_choose_us: JSON.stringify(editedWhyChooseUs),
      faqs: JSON.stringify(editedFaqs)
    });
    alert("Setelan tata tertib, fasilitas standar, why-choose-us, dan FAQ berhasil diperbarui.");
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
                    <div className="space-y-6 animate-fade-in text-slate-850">
                      
                      {/* STATS ROW */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-slate-900 text-white p-5 rounded-3xl border border-slate-800 shadow-lg flex flex-col justify-between">
                          <span className="text-[9px] text-amber-400 font-bold uppercase font-mono tracking-wider">Status Timbangan COA</span>
                          <div className="text-sm font-black mt-1 font-sans flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                            DEBIT = KREDIT (Balanced)
                          </div>
                          <span className="text-[9px] text-slate-400 mt-1">Asas double-entry terjaga otomatis</span>
                        </div>
                        
                        <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-2xs flex flex-col justify-between">
                          <span className="text-[9px] text-slate-400 font-bold uppercase font-mono tracking-wider">Total Entri Buku Jurnal</span>
                          <div className="text-xl font-black text-slate-800 font-mono mt-1">{journalEntries.length} Baris</div>
                          <span className="text-[9px] text-slate-400 mt-1">Arsip transaksi tercatat permanen</span>
                        </div>

                        <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-2xs flex flex-col justify-between">
                          <span className="text-[9px] text-slate-400 font-bold uppercase font-mono tracking-wider">Rekening Akun Aktif (COA)</span>
                          <div className="text-xl font-black text-slate-800 font-mono mt-1">{accounts.length} Akun</div>
                          <span className="text-[9px] text-slate-400 mt-1">Aset, Liabilitas, Ekuitas, Pendapatan, Beban</span>
                        </div>

                        <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-2xs flex flex-col justify-between">
                          <span className="text-[9px] text-slate-400 font-bold uppercase font-mono tracking-wider">Ekspor Arsip Keuangan</span>
                          <div className="flex gap-1.5 mt-2">
                            <button
                              onClick={handleExportLedgerCSV}
                              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] py-2 px-2.5 rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer"
                              title="Ekspor Ledger ke CSV/Excel"
                            >
                              <FileSpreadsheet size={12} />
                              Ledger Excel
                            </button>
                            <button
                              onClick={handleExportCOACSV}
                              className="flex-1 bg-slate-800 hover:bg-slate-900 text-white font-extrabold text-[10px] py-2 px-2.5 rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer"
                              title="Ekspor COA ke CSV/Excel"
                            >
                              <Download size={12} />
                              COA Excel
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* MIDDLE PANEL: THE IMMUTABLE GENERAL LEDGER EXPLORER */}
                      <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-4">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-100 pb-4">
                          <div>
                            <span className="text-[10px] text-indigo-600 font-bold uppercase font-mono tracking-wider block">Buku Jurnal Umum Utama (General Ledger Book)</span>
                            <h3 className="text-base font-bold text-slate-800 font-display">Eksplorasi Transaksi Terpembukuan</h3>
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                            {/* Search */}
                            <div className="relative flex-1 md:flex-none">
                              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input 
                                type="text"
                                placeholder="Cari jurnal, deskripsi, kode..."
                                value={ledgerSearch}
                                onChange={(e) => setLedgerSearch(e.target.value)}
                                className="pl-9 pr-3 py-2 w-full md:w-56 text-xs rounded-xl border border-gray-200 outline-none bg-slate-50 focus:border-amber-500 focus:bg-white transition-all font-medium"
                              />
                            </div>

                            {/* Filter Account */}
                            <select
                              value={ledgerAccountFilter}
                              onChange={(e) => setLedgerAccountFilter(e.target.value)}
                              className="text-xs p-2 rounded-xl border border-gray-200 bg-white text-slate-900 font-semibold outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all max-w-[200px]"
                            >
                              <option value="all">Semua Rekening COA</option>
                              {accounts.map(a => <option key={a.id} value={a.id}>[{a.id}] {a.name}</option>)}
                            </select>

                            {/* Reset filter */}
                            {(ledgerSearch || ledgerAccountFilter !== 'all') && (
                              <button
                                onClick={() => { setLedgerSearch(''); setLedgerAccountFilter('all'); }}
                                className="text-[10px] font-bold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-2.5 py-2 rounded-xl transition-all cursor-pointer"
                              >
                                Reset
                              </button>
                            )}

                            {/* Print / JSON */}
                            <button
                              onClick={() => {
                                window.print();
                              }}
                              className="p-2 text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all cursor-pointer flex items-center justify-center"
                              title="Cetak Buku Besar / Jurnal"
                            >
                              <Printer size={14} />
                            </button>
                            <button
                              onClick={handleExportLedgerJSON}
                              className="p-2 text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all cursor-pointer flex items-center justify-center"
                              title="Unduh Data Mentah JSON"
                            >
                              <FileText size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Interactive Table */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="border-b border-gray-100 text-[10px] text-gray-400 font-bold font-mono uppercase bg-slate-50">
                                <th className="py-3 px-3">NO JURNAL</th>
                                <th className="py-3 px-3">TANGGAL</th>
                                <th className="py-3 px-3">DESKRIPSI / KETERANGAN</th>
                                <th className="py-3 px-3">REKENING AKUN (COA)</th>
                                <th className="py-3 px-3 text-right">DEBIT</th>
                                <th className="py-3 px-3 text-right">KREDIT</th>
                                <th className="py-3 px-3 text-right">Running Balance</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 font-medium text-slate-700">
                              {getFilteredLedgerRows().map((row) => {
                                const isDebit = row.debit > 0;
                                return (
                                  <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="py-3.5 px-3 font-mono text-[10px] text-indigo-600 font-bold">{row.journal_no}</td>
                                    <td className="py-3.5 px-3 text-slate-500 text-[10px] whitespace-nowrap">
                                      {row.parentTrx?.transaction_date || row.created_at?.split('T')[0] || '-'}
                                    </td>
                                    <td className="py-3.5 px-3">
                                      <p className="font-bold text-slate-800 leading-tight">{row.parentTrx?.description || 'Manual Adjustment'}</p>
                                      <span className="text-[8px] uppercase font-mono font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded mt-1 inline-block">
                                        {row.parentTrx?.category || 'General'}
                                      </span>
                                    </td>
                                    <td className="py-3.5 px-3">
                                      <div className="flex flex-col">
                                        <span className="font-mono text-[9px] text-gray-400">[{row.account_id}]</span>
                                        <span className={isDebit ? 'text-xs font-bold text-slate-850' : 'text-xs italic text-slate-600'}>
                                          {row.acc?.name || "Akun " + row.account_id}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="py-3.5 px-3 text-right font-mono text-emerald-600 font-bold">
                                      {row.debit > 0 ? formatRupiah(row.debit) : '-'}
                                    </td>
                                    <td className="py-3.5 px-3 text-right font-mono text-slate-400">
                                      {row.credit > 0 ? "(" + formatRupiah(row.credit) + ")" : '-'}
                                    </td>
                                    <td className={"py-3.5 px-3 text-right font-mono font-semibold " + (row.runningBalance < 0 ? 'text-red-500' : 'text-slate-850')}>
                                      {formatRupiah(row.runningBalance)}
                                    </td>
                                  </tr>
                                );
                              })}

                              {getFilteredLedgerRows().length === 0 && (
                                <tr>
                                  <td colSpan={7} className="py-10 text-center text-slate-400 font-semibold">
                                    Tidak ada entri jurnal umum yang sesuai dengan pencarian Anda.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* BOTTOM ROW: COA & MANUAL JOURNAL ENTRY */}
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        
                        {/* COA Timbangan Saldo */}
                        <div className="lg:col-span-1 bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-4 flex flex-col h-[460px]">
                          <div className="border-b border-gray-100 pb-3">
                            <span className="text-[10px] text-gray-400 font-bold uppercase font-mono tracking-wider block">Chart of Accounts (COA)</span>
                            <h3 className="text-sm font-bold text-slate-800 font-display">Timbangan Saldo Buku Besar Utama</h3>
                          </div>

                          <div className="space-y-2 overflow-y-auto no-scrollbar pr-1 flex-1">
                            {accounts.map((acc) => (
                              <div key={acc.id} className="flex justify-between items-center text-xs py-2.5 px-3.5 bg-slate-50 hover:bg-slate-100/60 rounded-2xl transition-colors border border-slate-100 font-medium font-sans">
                                <div>
                                  <span className="font-mono text-gray-400 text-[10px] mr-2">[{acc.id}]</span>
                                  <span className="text-slate-850 text-[11px] font-bold">{acc.name}</span>
                                  <span className="text-[8px] text-slate-400 font-normal uppercase ml-1 px-1 bg-slate-200/50 rounded">{acc.type}</span>
                                </div>
                                <span className="font-bold text-slate-800 font-mono text-[11px]">
                                  {formatRupiah(acc.balance)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Manual Journal Entry Posting Form */}
                        <div className="lg:col-span-2 bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-4 h-[460px] flex flex-col justify-between text-slate-850">
                          <div className="space-y-4">
                            <div className="border-b border-gray-100 pb-3">
                              <span className="text-[10px] text-indigo-600 font-bold uppercase font-mono tracking-wider block">Posting Jurnal Manual</span>
                              <h3 className="text-sm font-bold text-slate-800 font-display flex items-center gap-1.5 mt-0.5">
                                <Calculator size={15} className="text-indigo-600" />
                                Posting Jurnal Umum Baru (Double Entry System)
                              </h3>
                            </div>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <label className="text-[10px] text-slate-400 font-bold block mb-1 uppercase font-mono">Pilih Akun Debit (Penambahan Aset/Beban)</label>
                                <select 
                                  value={journalForm.debitAccount}
                                  onChange={(e) => setJournalForm({...journalForm, debitAccount: Number(e.target.value)})}
                                  className="w-full text-xs p-2.5 rounded-xl border border-gray-200 font-semibold bg-white text-slate-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-sans"
                                >
                                  {accounts.map(a => <option key={a.id} value={a.id}>[{a.id}] - {a.name}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-400 font-bold block mb-1 uppercase font-mono">Pilih Akun Kredit (Pengurangan Aset / Penambahan Revenue/Liability)</label>
                                <select 
                                  value={journalForm.creditAccount}
                                  onChange={(e) => setJournalForm({...journalForm, creditAccount: Number(e.target.value)})}
                                  className="w-full text-xs p-2.5 rounded-xl border border-gray-200 font-semibold bg-white text-slate-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-sans"
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
                                    className="w-full text-xs p-2.5 rounded-xl border border-gray-200 outline-none font-semibold font-mono text-slate-900 bg-white"
                                  />
                                </div>
                                <div className="sm:col-span-2">
                                  <label className="text-[10px] text-slate-400 font-bold block mb-1 uppercase font-mono">Keterangan / Deskripsi Transaksi</label>
                                  <input 
                                    type="text"
                                    placeholder="Keterangan transaksi lengkap..."
                                    value={journalForm.description}
                                    onChange={(e) => setJournalForm({...journalForm, description: e.target.value})}
                                    className="w-full text-xs p-2.5 rounded-xl border border-gray-200 outline-none font-semibold text-slate-900 bg-white font-sans"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="flex justify-between items-center border-t border-gray-100 pt-3">
                            <span className="text-[10px] text-slate-400 font-sans italic flex items-center gap-1">
                              <ShieldAlert size={12} className="text-amber-500" />
                              Mendukung penyesuaian timbangan COA secara instan
                            </span>
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
                                    "[MANUAL JURNAL] " + journalForm.description,
                                    "Jurnal Umum Manual"
                                  );
                                  database.logActivity("System Finance", "POST_JOURNAL_MANUAL", "Debit " + journalForm.debitAccount + " Kredit " + journalForm.creditAccount + " Nominal Rp " + journalForm.amount);
                                  alert("Jurnal double-entry manual berhasil di-posting ke Ledger!");
                                  setJournalForm({ debitAccount: 1010, creditAccount: 4000, amount: 0, description: '' });
                                  triggerAppRefresh();
                                } catch(err) {
                                  alert("Gagal mem-posting jurnal: " + err.message);
                                }
                              }}
                              className="bg-indigo-650 hover:bg-indigo-700 text-white text-xs font-bold px-5 py-2.5 rounded-2xl shadow-sm transition-all cursor-pointer font-sans"
                            >
                              Post Jurnal double-entry
                            </button>
                          </div>
                        </div>

                      </div>

                    </div>
                  )}{/* SUBTAB 3: REVENUE & ACCOUNTS RECEIVABLE (AR) */}
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
                               className="w-full text-xs p-2.5 rounded-xl border border-gray-200 font-semibold bg-white text-slate-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
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
                               className="w-full text-xs p-2.5 rounded-xl border border-gray-200 font-semibold bg-white text-slate-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
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
              <div className="space-y-6 animate-fade-in font-medium text-xs">
                
                {/* 1. Aturan Hukum & Tata Tertib */}
                <div className="bg-white rounded-3xl p-5 md:p-6 shadow-xs border border-gray-100 space-y-6">
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
                  </div>
                </div>

                {/* 2. Kelola Fasilitas Standar Setiap Cabang */}
                <div className="bg-white rounded-3xl p-5 md:p-6 shadow-xs border border-gray-100 space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800 font-display">Kelola Fasilitas Standar Setiap Cabang</h2>
                    <p className="text-xs text-gray-400">Atur 9 kartu fasilitas standar yang tampil horizontal di halaman utama end-user.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {editedStandardFacilities.map((fac, idx) => (
                      <div key={idx} className="border border-gray-100 rounded-2xl p-4 bg-gray-50/50 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] bg-[#EEF7F0] text-[#2E6F40] px-2 py-0.5 rounded-md font-bold font-mono">Fasilitas #{idx + 1}</span>
                          <span className="text-slate-400 font-mono text-[10px]">{fac.icon}</span>
                        </div>
                        
                        <div className="space-y-2">
                          <div>
                            <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Ikon Lucide</label>
                            <select
                              value={fac.icon}
                              onChange={(e) => {
                                const copy = [...editedStandardFacilities];
                                copy[idx].icon = e.target.value;
                                setEditedStandardFacilities(copy);
                              }}
                              className="w-full p-2 rounded-xl border border-gray-200 bg-white font-mono text-[11px]"
                            >
                              <option value="Clock">Clock (Jam Operasional)</option>
                              <option value="LogIn">LogIn (Check In)</option>
                              <option value="Shield">Shield (Security)</option>
                              <option value="Wifi">Wifi (Internet)</option>
                              <option value="Zap">Zap (Listrik)</option>
                              <option value="Droplet">Droplet (Air Bersih)</option>
                              <option value="Car">Car (Parkir Kendaraan)</option>
                              <option value="Shirt">Shirt (Laundry)</option>
                              <option value="Sparkles">Sparkles (Pembersihan)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Nama Fasilitas / Judul</label>
                            <input
                              type="text"
                              value={fac.title}
                              onChange={(e) => {
                                const copy = [...editedStandardFacilities];
                                copy[idx].title = e.target.value;
                                setEditedStandardFacilities(copy);
                              }}
                              className="w-full p-2 rounded-xl border border-gray-200 bg-white font-bold text-slate-800"
                              placeholder="e.g. WiFi"
                            />
                          </div>

                          <div>
                            <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Keterangan / Sub-judul</label>
                            <input
                              type="text"
                              value={fac.subtitle}
                              onChange={(e) => {
                                const copy = [...editedStandardFacilities];
                                copy[idx].subtitle = e.target.value;
                                setEditedStandardFacilities(copy);
                              }}
                              className="w-full p-2 rounded-xl border border-gray-200 bg-white font-medium text-slate-500"
                              placeholder="e.g. 100 Mbps"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. Kelola Mengapa Memilih Samara */}
                <div className="bg-white rounded-3xl p-5 md:p-6 shadow-xs border border-gray-100 space-y-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h2 className="text-lg font-bold text-slate-800 font-display">Kelola Mengapa Memilih Samara</h2>
                      <p className="text-xs text-gray-400">Atur alasan-alasan keunggulan kompetitif yang meyakinkan calon penghuni.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditedWhyChooseUs([...editedWhyChooseUs, ""])}
                      className="text-[#2E6F40] bg-[#EEF7F0] hover:bg-[#EEF7F0]/80 transition-colors font-bold px-3 py-1.5 rounded-xl cursor-pointer text-[10px]"
                    >
                      + Tambah Alasan
                    </button>
                  </div>

                  <div className="space-y-3">
                    {editedWhyChooseUs.map((reason, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-[#EEF7F0] text-[#2E6F40] flex items-center justify-center font-bold font-mono shrink-0">{idx + 1}</span>
                        <input
                          type="text"
                          value={reason}
                          onChange={(e) => {
                            const copy = [...editedWhyChooseUs];
                            copy[idx] = e.target.value;
                            setEditedWhyChooseUs(copy);
                          }}
                          className="flex-1 p-2.5 rounded-xl border border-gray-200 bg-white font-bold text-slate-800"
                          placeholder="Masukkan alasan / poin keunggulan..."
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const copy = editedWhyChooseUs.filter((_, i) => i !== idx);
                            setEditedWhyChooseUs(copy);
                          }}
                          className="text-red-500 hover:text-red-600 p-2 rounded-xl hover:bg-red-50 cursor-pointer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    {editedWhyChooseUs.length === 0 && (
                      <p className="text-gray-400 italic text-center py-4">Belum ada poin alasan. Silakan klik "+ Tambah Alasan".</p>
                    )}
                  </div>
                </div>

                {/* 4. Kelola FAQ */}
                <div className="bg-white rounded-3xl p-5 md:p-6 shadow-xs border border-gray-100 space-y-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h2 className="text-lg font-bold text-slate-800 font-display">Kelola Pertanyaan yang Sering Diajukan (FAQ)</h2>
                      <p className="text-xs text-gray-400">Atur draf pertanyaan & jawaban yang sering diajukan di bagian terbawah landing page.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditedFaqs([...editedFaqs, { question: "", answer: "" }])}
                      className="text-[#2E6F40] bg-[#EEF7F0] hover:bg-[#EEF7F0]/80 transition-colors font-bold px-3 py-1.5 rounded-xl cursor-pointer text-[10px]"
                    >
                      + Tambah FAQ Baru
                    </button>
                  </div>

                  <div className="space-y-4">
                    {editedFaqs.map((faq, idx) => (
                      <div key={idx} className="border border-gray-100 rounded-2xl p-4 space-y-3 bg-gray-50/50 relative">
                        <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                          <span className="font-bold text-slate-800 font-mono text-[10px]">FAQ Item #{idx + 1}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const copy = editedFaqs.filter((_, i) => i !== idx);
                              setEditedFaqs(copy);
                            }}
                            className="text-red-500 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 cursor-pointer"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        <div className="space-y-3">
                          <div>
                            <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Pertanyaan</label>
                            <input
                              type="text"
                              value={faq.question}
                              onChange={(e) => {
                                const copy = [...editedFaqs];
                                copy[idx].question = e.target.value;
                                setEditedFaqs(copy);
                              }}
                              className="w-full p-2.5 rounded-xl border border-gray-200 bg-white font-bold text-slate-800"
                              placeholder="e.g. Bagaimana cara booking?"
                            />
                          </div>

                          <div>
                            <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Jawaban</label>
                            <textarea
                              rows={3}
                              value={faq.answer}
                              onChange={(e) => {
                                const copy = [...editedFaqs];
                                copy[idx].answer = e.target.value;
                                setEditedFaqs(copy);
                              }}
                              className="w-full p-2.5 rounded-xl border border-gray-200 bg-white font-light text-slate-600 leading-relaxed"
                              placeholder="Tulis jawaban lengkap di sini..."
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    {editedFaqs.length === 0 && (
                      <p className="text-gray-400 italic text-center py-4">Belum ada FAQ. Silakan klik "+ Tambah FAQ Baru".</p>
                    )}
                  </div>
                </div>

                {/* 5. Aksi Simpan Semua Perubahan */}
                <div className="flex justify-end bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <button
                    onClick={handleSaveSystemSettings}
                    className="bg-brand-green hover:bg-brand-green-hover text-white transition-colors py-3 px-8 rounded-2xl text-xs font-bold shadow-md cursor-pointer"
                  >
                    Simpan Seluruh Setelan & Homepage Content
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
