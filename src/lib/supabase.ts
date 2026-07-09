/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient } from '@supabase/supabase-js';
import { 
  Property, Room, Tenant, Booking, PaymentInvoice, Maintenance, 
  UserSystem, ActivityLog, Survey, AccountCOA, FinancialTransaction, 
  JournalEntry, LedgerEntry, SystemSettings, Coupon 
} from '../types';
import { PRESETS } from '../utils/imagePresets';
import { mailersendService } from '../services/mailersendService';

// Detect credentials from Vite environment variables (VITE_ prefixed tags are safe for browser use)
let activeSupabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || (import.meta as any).env?.SUPABASE_URL || '';
let activeSupabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || (import.meta as any).env?.SUPABASE_ANON_KEY || '';

export let isSupabaseConfigured = Boolean(activeSupabaseUrl && activeSupabaseAnonKey && activeSupabaseUrl !== 'undefined' && activeSupabaseAnonKey !== 'undefined');

// Real Supabase Client Instance (wrapped with null-safe triggers to prevent app loading crash if keys are raw placeholder text)
export let supabase = isSupabaseConfigured 
  ? createClient(activeSupabaseUrl, activeSupabaseAnonKey) 
  : null;

/**
 * Foolproof getters for live Supabase references to avoid any ESM live-binding copy issues.
 */
export function getIsSupabaseConfigured(): boolean {
  return isSupabaseConfigured;
}

export function getSupabaseClient() {
  return supabase;
}

/**
 * Dynamically configure Supabase at runtime (e.g. from container environment variables retrieved via API).
 * This ensures that even if Vite built statically without keys, the browser can sync dynamically.
 */
export function configureSupabaseDynamically(url: string, key: string) {
  if (url && key && url !== 'undefined' && key !== 'undefined') {
    activeSupabaseUrl = url;
    activeSupabaseAnonKey = key;
    isSupabaseConfigured = true;
    supabase = createClient(url, key);
    console.log('[SUPABASE] Configured dynamically from server runtime environment!');
    return true;
  }
  return false;
}

/**
 * Safely performs an insert or update on Supabase, automatically pruning columns
 * that do not exist in the database table schema to handle out-of-sync schemas gracefully.
 */
export async function safeSupabaseUpsert(table: string, payload: any, id?: any) {
  if (!isSupabaseConfigured || !supabase) return { error: new Error('Supabase not configured') };
  const maxRetries = 15;
  let activePayload = { ...payload };

  // Database Constraint Shield: Ensure room_type matches the CHECK constraint in remote DB ('Standard', 'Deluxe', 'Premium')
  if (table === 'rooms' && activePayload.room_type) {
    const allowedRoomTypes = ['Standard', 'Deluxe', 'Premium'];
    if (!allowedRoomTypes.includes(activePayload.room_type)) {
      console.warn(`[SUPABASE SHIELD] Coercing invalid room_type '${activePayload.room_type}' to 'Premium' to comply with check constraint.`);
      activePayload.room_type = 'Premium';
    }
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (id !== undefined && id !== null) {
        // If there's an id, perform an update
        const { data, error } = await supabase.from(table).update(activePayload).eq('id', id).select();
        if (error) {
          const match = error.message.match(/column "([^"]+)" of relation/) || 
                        error.message.match(/Could not find the '([^']+)' column/) ||
                        error.message.match(/column "([^"]+)" does not exist/) ||
                        error.message.match(/column '([^']+)' does not exist/i);
          if (match) {
            const missingCol = match[1];
            console.warn(`[SUPABASE SHIELD] Auto-pruning missing column '${missingCol}' from '${table}' update payload.`);
            delete activePayload[missingCol];
            continue;
          }
          return { error };
        }
        return { data, error: null };
      } else {
        // Perform an insert
        const { data, error } = await supabase.from(table).insert(activePayload).select();
        if (error) {
          const match = error.message.match(/column "([^"]+)" of relation/) || 
                        error.message.match(/Could not find the '([^']+)' column/) ||
                        error.message.match(/column "([^"]+)" does not exist/) ||
                        error.message.match(/column '([^']+)' does not exist/i);
          if (match) {
            const missingCol = match[1];
            console.warn(`[SUPABASE SHIELD] Auto-pruning missing column '${missingCol}' from '${table}' insert payload.`);
            delete activePayload[missingCol];
            continue;
          }
          return { error };
        }
        return { data, error: null };
      }
    } catch (err: any) {
      console.error(`[SUPABASE EXCEPTION in ${table}]`, err);
      return { error: err };
    }
  }
  return { error: new Error('Maximum pruning limit reached') };
}

// =========================================================================
// PRE-SEEDED BACKEND SANDBOX DATA
// Used as high-fidelity direct fallback state so users can immediately play-test
// =========================================================================

const SEED_PROPERTIES: Property[] = [
  {
    id: 1,
    name: "Samara Stay Kosan Ciputra",
    address: "Jl. Ciputra Raya No. 45, Jakarta Selatan",
    price: 1800000,
    type: "campur",
    total_rooms: 20,
    available_rooms: 15,
    facilities: ["Ac", "WiFi", "Kamar Mandi Dalam", "Water Heater", "Dapur Bersama", "Parkir Motor"],
    image_url: PRESETS[0].dataUrl,
    images: [
      PRESETS[0].dataUrl,
      PRESETS[3].dataUrl,
      PRESETS[4].dataUrl,
      PRESETS[5].dataUrl
    ],
    lat: -6.2243,
    lng: 106.8425,
    description: "Hunian eksklusif dengan fasilitas lengkap, berlokasi sangat strategis di area Jakarta Selatan yang dekat dengan pusat bisnis, perkantoran, dan kampus ternama. Lingkungan asri, tenang, aman dan nyaman untuk mendukung produktivitas maupun istirahat Anda.",
    additional_rules: "1. Tamu lawan jenis dilarang masuk kamar demi kenyamanan bersama.\n2. Dilarang membawa hewan peliharaan dalam bentuk apa pun.\n3. Tidak boleh menggunakan peralatan elektronik berdaya tinggi tanpa izin.",
    policies: "Pembayaran uang sewa dilakukan paling lambat tanggal 1 setiap bulannya. Keterlambatan pembayaran akan dikenakan denda administratif sesuai kesepakatan.",
    terms: "Deposit sewa bulanan sebesar Rp 500.000 wajib dibayarkan saat melakukan check-in dan akan dikembalikan utuh saat masa sewa berakhir jika tidak ada kerusakan unit.",
    regulations: "1. Jam berkunjung tamu maksimal hingga pukul 22:00 WIB.\n2. Wajib membersihkan kembali fasilitas dapur bersama setelah digunakan.\n3. Harap matikan AC dan lampu jika meninggalkan kamar untuk menghemat energi."
  },
  {
    id: 2,
    name: "Samara Stay Exclusive Putri",
    address: "Jl. Kebon Jeruk No. 12, Jakarta Barat",
    price: 2200000,
    type: "putri",
    total_rooms: 12,
    available_rooms: 8,
    facilities: ["Ac", "WiFi", "Kamar Mandi Dalam", "Water Heater", "Dapur Bersama", "Kulkas", "Keamanan 24 Jam"],
    image_url: PRESETS[1].dataUrl,
    images: [
      PRESETS[1].dataUrl,
      PRESETS[3].dataUrl,
      PRESETS[4].dataUrl,
      PRESETS[5].dataUrl
    ],
    lat: -6.1751,
    lng: 106.7891,
    description: "Kost putri eksklusif dengan sistem keamanan ketat 24 jam dan CCTV. Kamar bernuansa hangat, luas, bersih, dan dilengkapi perabotan berkualitas premium. Terletak strategis dekat mal, halte busway, dan universitas di Jakarta Barat.",
    additional_rules: "1. Tamu pria dilarang masuk ke area lorong kamar hunian putri.\n2. Dilarang membawa barang yang berbau tajam atau mengganggu penghuni lain.\n3. Menjaga kerapihan jemuran bersama.",
    policies: "Masa tinggal minimal adalah 3 bulan. Pelunasan tagihan wajib dikonfirmasi melalui aplikasi ini dengan mengunggah bukti bayar resmi.",
    terms: "Deposit jaminan kerusakan sebesar Rp 500.000 wajib dilunasi sebelum tanggal serah terima kunci.",
    regulations: "1. Tamu menginap wajib melapor ke pengelola atau penjaga keamanan.\n2. Dilarang membuat kegaduhan atau memutar musik dengan volume keras setelah pukul 21:00 WIB.\n3. Wajib menjaga kebersihan dan higienitas toilet serta area komunal."
  },
  {
    id: 3,
    name: "Samara Stay Premium Putra",
    address: "Jl. Margonda Raya No. 102, Depok",
    price: 1500000,
    type: "putra",
    total_rooms: 15,
    available_rooms: 12,
    facilities: ["Ac", "WiFi", "Kamar Mandi Dalam", "Dapur Bersama", "Parkir Motor"],
    image_url: PRESETS[2].dataUrl,
    images: [
      PRESETS[2].dataUrl,
      PRESETS[3].dataUrl,
      PRESETS[4].dataUrl,
      PRESETS[5].dataUrl
    ],
    lat: -6.3725,
    lng: 106.8331,
    description: "Kost putra modern dengan suasana tenang di kawasan Margonda, sangat dekat dengan akses transportasi umum KRL Commuter Line dan kampus utama. Sangat cocok bagi mahasiswa maupun profesional muda yang aktif.",
    additional_rules: "1. Penggunaan area parkir motor wajib rapi dan teratur.\n2. Dilarang merokok di dalam kamar ber-AC (gunakan area smoking yang disediakan).\n3. Penggunaan air dan listrik secara bijak.",
    policies: "Sewa dapat diperpanjang secara bulanan. Pembatalan kurang dari seminggu sebelum check-in dikenakan potongan DP hangus.",
    terms: "Uang deposit sebesar Rp 500.000 dikembalikan penuh jika kondisi kamar saat check-out bersih dan tidak ada kerusakan fasilitas.",
    regulations: "1. Segala bentuk pelanggaran hukum (narkoba, miras) akan dilaporkan langsung ke pihak berwajib.\n2. Tamu berkunjung wajib parkir di area yang telah ditentukan.\n3. Sampah kamar wajib dibungkus rapi sebelum ditaruh di tempat sampah luar."
  }
];

const SEED_ROOMS: Room[] = [
  // Property 1 Rooms
  { id: 101, property_id: 1, room_number: "R101", room_type: "Standard", price: 1800000, size_sqm: 15.0, floor: 1, status: "available", facilities: ["Ac", "WiFi", "Kamar Mandi Dalam"], is_daily_enabled: false, daily_price: 0, image_url: PRESETS[3].dataUrl },
  { id: 102, property_id: 1, room_number: "R102", room_type: "Deluxe", price: 2200000, size_sqm: 18.0, floor: 1, status: "available", facilities: ["Ac", "WiFi", "Kamar Mandi Dalam", "Water Heater"], is_daily_enabled: true, daily_price: 120000, image_url: PRESETS[4].dataUrl },
  { id: 103, property_id: 1, room_number: "R103", room_type: "Premium", price: 2800000, size_sqm: 24.0, floor: 1, status: "available", facilities: ["Ac", "WiFi", "Kamar Mandi Dalam", "Water Heater", "TV Screen", "Mini Couch"], is_daily_enabled: true, daily_price: 180000, image_url: PRESETS[5].dataUrl },
  { id: 104, property_id: 1, room_number: "R201", room_type: "Standard", price: 1800000, size_sqm: 15.0, floor: 2, status: "occupied", current_tenant_name: "Yogi Atmaja", facilities: ["Ac", "WiFi", "Kamar Mandi Dalam"], is_daily_enabled: false, daily_price: 0, image_url: PRESETS[3].dataUrl },
  { id: 105, property_id: 1, room_number: "R202", room_type: "Deluxe", price: 2200000, size_sqm: 18.0, floor: 2, status: "maintenance", facilities: ["Ac", "WiFi", "Kamar Mandi Dalam", "Water Heater"], is_daily_enabled: false, daily_price: 0, image_url: PRESETS[4].dataUrl },

  // Property 2 Rooms
  { id: 201, property_id: 2, room_number: "F101", room_type: "Standard", price: 2200000, size_sqm: 16.0, floor: 1, status: "available", facilities: ["Ac", "WiFi", "Kamar Mandi Dalam", "Water Heater"], is_daily_enabled: false, daily_price: 0, image_url: PRESETS[3].dataUrl },
  { id: 202, property_id: 2, room_number: "F102", room_type: "Deluxe", price: 2600000, size_sqm: 20.0, floor: 1, status: "occupied", current_tenant_name: "Siska Wardani", facilities: ["Ac", "WiFi", "Kamar Mandi Dalam", "Water Heater", "Kulkas"], is_daily_enabled: true, daily_price: 150000, image_url: PRESETS[4].dataUrl },
  { id: 203, property_id: 2, room_number: "F201", room_type: "Premium", price: 3200000, size_sqm: 26.0, floor: 2, status: "reserved", facilities: ["Ac", "WiFi", "Kamar Mandi Dalam", "Water Heater", "TV Screen", "Kulkas"], is_daily_enabled: true, daily_price: 200000, image_url: PRESETS[5].dataUrl },

  // Property 3 Rooms
  { id: 301, property_id: 3, room_number: "M101", room_type: "Standard", price: 1500000, size_sqm: 14.5, floor: 1, status: "available", facilities: ["Ac", "WiFi", "Kamar Mandi Dalam"], is_daily_enabled: false, daily_price: 0, image_url: PRESETS[3].dataUrl },
  { id: 302, property_id: 3, room_number: "M102", room_type: "Deluxe", price: 1800000, size_sqm: 17.5, floor: 1, status: "available", facilities: ["Ac", "WiFi", "Kamar Mandi Dalam", "Water Heater"], is_daily_enabled: true, daily_price: 100000, image_url: PRESETS[4].dataUrl }
];

const SEED_TENANTS: Tenant[] = [
  {
    id: 1,
    full_name: "Yogi Atmaja",
    phone: "081234567890",
    email: "yogiatmaja26@gmail.com",
    job: "Software Dev",
    avatar_initials: "YA",
    avatar_color: "bg-emerald-500",
    property_id: 1,
    room_number: "R201",
    start_date: "2026-05-01",
    duration_months: 6,
    payment_status: "paid",
    emergency_contact: "Ibu Yogi - 08122222222"
  },
  {
    id: 2,
    full_name: "Siska Wardani",
    phone: "089876543210",
    email: "siska.wardani@gmail.com",
    job: "Graphic Designer",
    avatar_initials: "SW",
    avatar_color: "bg-pink-500",
    property_id: 2,
    room_number: "F102",
    start_date: "2026-06-10",
    duration_months: 3,
    payment_status: "paid",
    emergency_contact: "Ayah Siska - 0898888888"
  }
];

const SEED_BOOKINGS: Booking[] = [
  {
    id: 1,
    tenant_name: "Fajar Santoso",
    phone: "085521443212",
    email: "fajar.santoso@gmail.com",
    property_id: 1,
    room_number: "R102",
    duration_months: 3,
    total_price: 6600000,
    rent_price: 1980000, // per month net
    pbjt: 660000, // 10%
    deposit_amount: 500000,
    payment_method: "Midtrans Snap",
    status: "approved",
    booking_date: "2026-06-20",
    room_id: 102,
    midtrans_order_id: "BOOKING-F19382",
    booking_type: "monthly",
    nik: "3174092102940003",
    is_dp: false
  },
  {
    id: 2,
    tenant_name: "Nabila Puteri",
    phone: "087754321919",
    email: "nabila.puteri@yahoo.com",
    property_id: 2,
    room_number: "F201",
    duration_months: 1,
    total_price: 3200000,
    rent_price: 2880000,
    pbjt: 320000,
    deposit_amount: 500000,
    payment_method: "Midtrans Mandiri",
    status: "pending",
    booking_date: "2026-06-21",
    room_id: 203,
    midtrans_order_id: "BOOKING-N92182",
    booking_type: "monthly",
    nik: "3172081109950001",
    is_dp: true,
    dp_amount: 500000
  }
];

const SEED_PAYMENTS: PaymentInvoice[] = [
  {
    id: "INV-001",
    tenant_name: "Yogi Atmaja",
    property_id: 1,
    amount: 1800000,
    method: "Midtrans Bank Transfer",
    status: "paid",
    payment_date: "2026-05-01",
    midtrans_order_id: "PAY-Y9192",
    transaction_id: "mid-tr-838192",
    settlement_time: "2026-05-01 10:30:15"
  },
  {
    id: "INV-002",
    tenant_name: "Siska Wardani",
    property_id: 2,
    amount: 2600000,
    method: "Midtrans GoPay",
    status: "paid",
    payment_date: "2026-06-10",
    midtrans_order_id: "PAY-S3211",
    transaction_id: "mid-tr-738910",
    settlement_time: "2026-06-10 14:15:33"
  },
  {
    id: "INV-003",
    tenant_name: "Fajar Santoso",
    property_id: 1,
    amount: 6600000,
    method: "Midtrans Mandiri Snap",
    status: "paid",
    payment_date: "2026-06-20",
    midtrans_order_id: "BOOKING-F19382",
    transaction_id: "mid-tr-998811",
    settlement_time: "2026-06-20 09:12:00"
  }
];

const SEED_MAINTENANCE: Maintenance[] = [
  {
    id: 1,
    title: "Air Conditioner Tidak Dingin",
    property_id: 1,
    room: "R202",
    priority: "High",
    cost: 150000,
    tech: "Pak Joko AC",
    desc_field: "Freon bocor halus, perlu di-las pipa tembaga dan isi ulang freon R32.",
    status: "in-progress",
    date: "2026-06-19"
  },
  {
    id: 2,
    title: "Ganti Lampu Wastafel & Kamar",
    property_id: 2,
    room: "F102",
    priority: "Normal",
    cost: 50000,
    tech: "Staff Hunian",
    desc_field: "Lampu LED Philip 10 Watt mati. Sudah diganti baru oleh staff putri.",
    status: "completed",
    date: "2026-06-15"
  }
];

const SEED_USERS: UserSystem[] = [
  {
    id: "admin-root-01",
    full_name: "Super Admin Utama",
    email: "yogiatmaja26@gmail.com",
    role: "super",
    role_id: 1,
    access: "Semua Properti",
    last_login: "Baru saja",
    active: true
  },
  {
    id: "user-staff-01",
    full_name: "Ahmad Jalal",
    email: "ahmad.jalal@samarakosan.com",
    role: "staff",
    role_id: 4,
    access: "Samara Stay Kosan Ciputra",
    last_login: "1 jam yang lalu",
    active: true
  },
  {
    id: "user-finance-01",
    full_name: "Putri Rahayu",
    email: "putri.finance@samarakosan.com",
    role: "finance",
    role_id: 3,
    access: "Semua Properti",
    last_login: "Kemarin",
    active: true
  }
];

const SEED_ACTIVITY_LOGS: ActivityLog[] = [
  { id: 1, admin_name: "Super Admin Utama", action: "LOGIN", detail: "Berhasil masuk sistem menggunakan WebAuth/Supabase.", ip_address: "182.2.19.4" },
  { id: 2, admin_name: "Super Admin Utama", action: "CREATE_ROOM", detail: "Menambahkan unit R103 Premium di Samara Stay Kosan Ciputra.", ip_address: "182.2.19.4" },
  { id: 3, admin_name: "Ahmad Jalal", action: "UPDATE_ROOM_STATUS", detail: "Mengubah status kamar R202 dari available menjadi maintenance.", ip_address: "114.122.9.22" }
];

const SEED_SURVEYS: Survey[] = [
  {
    id: 1,
    reservation_number: "SRV-20260621-001",
    tenant_name: "Rizky Kurniadi",
    nik: "3175021811960002",
    email: "rizky.kurnia@gmail.com",
    phone: "081299884455",
    address: "Kebayoran Lama No. 5, Jakarta",
    job: "QA Consultant",
    planned_move_in_date: "2026-07-01",
    property_id: 1,
    room_number: "R101",
    survey_date: "2026-06-23",
    survey_time_slot: "13:00 - 15:00",
    status: "survey_confirmed",
    dp_amount: 500000,
    invoice_id: "INV-SRV-001",
    payment_method: "Midtrans QRIS",
    pelunasan_deadline_days: 3,
    pelunasan_deadline_date: "2026-06-26",
    created_at: "2026-06-21"
  },
  {
    id: 2,
    reservation_number: "SRV-20260621-002",
    tenant_name: "Mega Safitri",
    nik: "3201095012970004",
    email: "mega.safitri@yahoo.com",
    phone: "08964312211",
    address: "Jl. Sukajadi No. 90, Bandung",
    job: "Student Postgraduate",
    planned_move_in_date: "2026-06-30",
    property_id: 2,
    room_number: "F101",
    survey_date: "2026-06-22",
    survey_time_slot: "09:00 - 11:00",
    status: "pending_payment",
    dp_amount: 500000,
    invoice_id: "INV-SRV-002",
    payment_method: "",
    pelunasan_deadline_days: 3,
    pelunasan_deadline_date: "2026-06-24",
    created_at: "2026-06-21"
  }
];

const SEED_COUPONS: Coupon[] = [
  { id: 1, code: "PROMOHEBAT", discount_type: "percentage", discount_value: 10, max_discount_amount: 500000, is_active: true, description: "Diskon 10% sewa (Maks Rp 500.000)" },
  { id: 2, code: "KOSTHEMAT", discount_type: "fixed", discount_value: 100000, is_active: true, description: "Potongan sewa bersih Rp 100.000" },
  { id: 3, code: "SAMARA15", discount_type: "percentage", discount_value: 15, min_duration_months: 3, is_active: true, description: "Diskon 15% untuk sewa minimal 3 bulan" },
  { id: 4, code: "DISKONMEMBER", discount_type: "fixed", discount_value: 50000, is_active: true, description: "Diskon Member Rp 50.000" }
];

const SEED_ACCOUNTS: AccountCOA[] = [
  { id: 1000, name: "Kas di Tangan / Petty Cash", type: "asset", balance: 500000 },
  { id: 1010, name: "Kas dan Bank Mandiri", type: "asset", balance: 25160000 },
  { id: 1100, name: "Piutang Usaha Sewa", type: "asset", balance: 0 },
  { id: 1300, name: "Uang Muka (DP) Booking Sewa", type: "liability", balance: 1000000 },
  { id: 1400, name: "Deposit Jaminan Hunian (Refundable)", type: "liability", balance: 1500000 },
  { id: 2100, name: "Utang Pajak PBJT (10%)", type: "liability", balance: 1100000 },
  { id: 3000, name: "Modal Pemilik Utama", type: "equity", balance: 15000000 },
  { id: 3100, name: "Prive / Penarikan Pemilik", type: "equity", balance: 0 },
  { id: 4000, name: "Pendapatan Sewa Bulanan (Net)", type: "revenue", balance: 11000000 },
  { id: 4100, name: "Pendapatan Harian / Short-term", type: "revenue", balance: 500000 },
  { id: 4200, name: "Pendapatan DP Survey Hangus", type: "revenue", balance: 500000 },
  { id: 4300, name: "Pendapatan Operasional Lainnya", type: "revenue", balance: 150000 },
  { id: 5000, name: "Beban Pemeliharaan & Perbaikan Gedung", type: "expense", balance: 50000 },
  { id: 5100, name: "Beban Operasional Lain-lain", type: "expense", balance: 50000 }
];

const SEED_FINANCIAL_TRANSACTIONS: FinancialTransaction[] = [
  {
    id: 1,
    transaction_no: "TRX-20260601-01",
    transaction_date: "2026-06-01",
    category: "Penerimaan Sewa",
    description: "Pembayaran sewa kamar R201 oleh Yogi Atmaja",
    amount: 1800000,
    type: "income",
    reference_type: "payment",
    reference_id: "INV-001",
    created_by: "System Webhook"
  },
  {
    id: 2,
    transaction_no: "TRX-20260610-02",
    transaction_date: "2026-06-10",
    category: "Penerimaan Sewa",
    description: "Pembayaran sewa kamar F102 oleh Siska Wardani",
    amount: 2600000,
    type: "income",
    reference_type: "payment",
    reference_id: "INV-002",
    created_by: "System Webhook"
  },
  {
    id: 3,
    transaction_no: "TRX-20260615-03",
    transaction_date: "2026-06-15",
    category: "Biaya Operasional",
    description: "Pembelian Lampu Wastafel & Lampu Kamar Putri",
    amount: 50000,
    type: "expense",
    reference_type: "maintenance",
    reference_id: "2",
    created_by: "Ahmad staff"
  }
];

const SEED_JOURNAL_ENTRIES: JournalEntry[] = [
  { id: 1, journal_no: "JRN-20260601-00001", transaction_id: 1, account_id: 1010, debit: 1800000, credit: 0 },
  { id: 2, journal_no: "JRN-20260601-00001", transaction_id: 1, account_id: 4000, debit: 0, credit: 1800000 },
  { id: 3, journal_no: "JRN-20260610-00002", transaction_id: 2, account_id: 1010, debit: 2600000, credit: 0 },
  { id: 4, journal_no: "JRN-20260610-00002", transaction_id: 2, account_id: 4000, debit: 0, credit: 2600000 },
  { id: 5, journal_no: "JRN-20260615-00003", transaction_id: 3, account_id: 5000, debit: 50000, credit: 0 },
  { id: 6, journal_no: "JRN-20260615-00003", transaction_id: 3, account_id: 1010, debit: 0, credit: 50000 }
];

const SEED_SETTINGS: SystemSettings = {
  id: 1,
  booking_rules: "1. Tamu dilarang membawa lawan jenis masuk ke dalam kamar (kecuali pasangan sah atau keluarga kandung).\n2. Menjaga ketenangan dan kebersihan lingkungan bersama setelah pukul 22:00 WIB.\n3. Pembayaran uang sewa bulanan wajib diselesaikan paling lambat 3 hari sebelum jatuh tempo.\n4. Menjaga kebersihan fasilitas bersama dan dilarang merusak inventaris kost.\n5. Uang jaminan deposit (Rp 500.000 untuk bulanan atau Rp 100.000 untuk harian) akan dikembalikan utuh pada saat check-out jika unit ditinggalkan dalam kondisi bersih, utuh, dan tanpa tunggakan.",
  survey_rules: "1. Pembayaran DP Survey senilai Rp 500.000 digunakan sebagai jaminan komitmen mengunci kamar pilihan Anda selama masa survey agar tidak ditawarkan ke pihak lain.\n2. Jadwal survey yang telah disepakati dapat dijadwalkan ulang (reschedule) maksimal 1 kali dengan konfirmasi minimal 24 jam sebelumnya.\n3. Uang jaminan DP Survey ini bersifat non-refundable (hangus) jika Anda melakukan pembatalan sepihak atau terbukti No Show (tidak hadir) pada tanggal survey terpilih.\n4. Apabila hasil survey cocok dan Anda melanjutkannya ke kontrak sewa, uang jaminan DP Survey Rp 500.000 ini akan langsung dihitung sebagai pengurang biaya pelunasan bulan pertama.",
  standard_facilities: JSON.stringify([
    { "icon": "Clock", "title": "Jam Operasional", "subtitle": "24 Jam" },
    { "icon": "LogIn", "title": "Check In", "subtitle": "Fleksibel" },
    { "icon": "Shield", "title": "Security", "subtitle": "24 Jam" },
    { "icon": "Wifi", "title": "WiFi", "subtitle": "100 Mbps" },
    { "icon": "Droplet", "title": "Air", "subtitle": "Bersih 24 Jam" },
    { "icon": "Car", "title": "Parkir", "subtitle": "Hanya Motor" },
    { "icon": "Shirt", "title": "Laundry", "subtitle": "Tersedia" },
    { "icon": "Sparkles", "title": "Cleaning", "subtitle": "2x / Minggu" }
  ]),
  why_choose_us: JSON.stringify([
    "Standar Kebersihan Terjaga",
    "CCTV 24 Jam di Area Umum",
    "Maintenance Cepat < 24 Jam",
    "Admin Responsif via WhatsApp",
    "Pembayaran Digital Aman",
    "Kontrak Transparan Tanpa Biaya Tersembunyi"
  ]),
  faqs: JSON.stringify([
    {
      "question": "Bagaimana cara booking kamar di Samara Stay?",
      "answer": "Anda dapat memilih gedung dan kamar kost di aplikasi kami, tentukan tanggal mulai sewa, dan selesaikan pembayaran DP atau sewa bulan pertama secara instan menggunakan sistem pembayaran digital terintegrasi."
    },
    {
      "question": "Apa saja fasilitas yang tersedia di setiap kamar?",
      "answer": "Setiap kamar dilengkapi dengan AC, tempat tidur (kasur queen), kamar mandi dalam dengan water heater, meja kerja, lemari pakaian, dan akses Wi-Fi berkecepatan tinggi."
    },
    {
      "question": "Berapa biaya administrasi dan deposit yang harus dibayar?",
      "answer": "Di Samara Stay bebas dari biaya administrasi tersembunyi. Kami menerapkan deposit komitmen sewa yang transparan dan akan dikembalikan utuh pada saat masa sewa Anda selesai."
    },
    {
      "question": "Apakah ada kontrak jangka panjang?",
      "answer": "Kami menyediakan kontrak sewa bulanan yang sangat fleksibel tanpa kewajiban komitmen tahunan yang memberatkan, sehingga sangat ideal untuk mahasiswa dan pekerja aktif."
    }
  ])
};

// =========================================================================
// REACTIVE MEMORY SYNC UTILITIES
// Writes directly to localStorage so changes persist inside the user's browser,
// allowing fully working offline tests across iframe refreshes.
// =========================================================================

const memoryCache: Record<string, string> = {};

function getLocalState<T>(key: string, initial: T): T {
  try {
    const data = localStorage.getItem(key) || memoryCache[key];
    if (!data) {
      try {
        localStorage.setItem(key, JSON.stringify(initial));
      } catch (e) {
        console.warn('LocalStorage failover initialized for key:', key, e);
        memoryCache[key] = JSON.stringify(initial);
      }
      return initial;
    }
    try {
      return JSON.parse(data);
    } catch {
      return initial;
    }
  } catch (err) {
    console.error('Error in getLocalState:', err);
    const fallback = memoryCache[key];
    if (fallback) {
      try {
        return JSON.parse(fallback);
      } catch {
        return initial;
      }
    }
    return initial;
  }
}

function setLocalState<T>(key: string, value: T) {
  const serialized = JSON.stringify(value);
  try {
    localStorage.setItem(key, serialized);
  } catch (err) {
    console.error('LocalStorage write failure (quota exceeded). Running fail-safe cleanup...', err);
    try {
      // Compact non-essential histories to recover memory
      localStorage.removeItem('samara_activity_logs');
      // Retry standard write
      localStorage.setItem(key, serialized);
      console.log('Failsafe success: written cleanly after self-compaction of logs.', key);
    } catch (retryErr) {
      console.error('Failsafe notice: Storing to reactive memory instead:', key, retryErr);
      memoryCache[key] = serialized;
    }
  }
  // Emit event for cross-tabs or custom hooks
  window.dispatchEvent(new Event('samara_state_changed'));
}

// Ensure the local storage is populated
export const sandboxState = {
  getProperties: () => getLocalState<Property[]>('samara_properties', SEED_PROPERTIES),
  setProperties: (data: Property[]) => setLocalState('samara_properties', data),

  getRooms: () => getLocalState<Room[]>('samara_rooms', SEED_ROOMS),
  setRooms: (data: Room[]) => setLocalState('samara_rooms', data),

  getTenants: () => getLocalState<Tenant[]>('samara_tenants', SEED_TENANTS),
  setTenants: (data: Tenant[]) => setLocalState('samara_tenants', data),

  getBookings: () => getLocalState<Booking[]>('samara_bookings', SEED_BOOKINGS),
  setBookings: (data: Booking[]) => setLocalState('samara_bookings', data),

  getPayments: () => getLocalState<PaymentInvoice[]>('samara_payments', SEED_PAYMENTS),
  setPayments: (data: PaymentInvoice[]) => setLocalState('samara_payments', data),

  getMaintenance: () => getLocalState<Maintenance[]>('samara_maintenance', SEED_MAINTENANCE),
  setMaintenance: (data: Maintenance[]) => setLocalState('samara_maintenance', data),

  getUsers: () => getLocalState<UserSystem[]>('samara_users', SEED_USERS),
  setUsers: (data: UserSystem[]) => setLocalState('samara_users', data),

  getSurveys: () => getLocalState<Survey[]>('samara_surveys', SEED_SURVEYS),
  setSurveys: (data: Survey[]) => setLocalState('samara_surveys', data),

  getCoupons: () => getLocalState<Coupon[]>('samara_coupons', SEED_COUPONS),
  setCoupons: (data: Coupon[]) => setLocalState('samara_coupons', data),

  getAccounts: () => getLocalState<AccountCOA[]>('samara_accounts', SEED_ACCOUNTS),
  setAccounts: (data: AccountCOA[]) => setLocalState('samara_accounts', data),

  getFinancialTransactions: () => getLocalState<FinancialTransaction[]>('samara_fin_transactions', SEED_FINANCIAL_TRANSACTIONS),
  setFinancialTransactions: (data: FinancialTransaction[]) => setLocalState('samara_fin_transactions', data),

  getJournalEntries: () => getLocalState<JournalEntry[]>('samara_journal_entries', SEED_JOURNAL_ENTRIES),
  setJournalEntries: (data: JournalEntry[]) => setLocalState('samara_journal_entries', data),

  getActivityLogs: () => getLocalState<ActivityLog[]>('samara_activity_logs', SEED_ACTIVITY_LOGS),
  setActivityLogs: (data: ActivityLog[]) => setLocalState('samara_activity_logs', data),

  getSettings: () => {
    const settings = getLocalState<SystemSettings>('samara_settings', SEED_SETTINGS);
    if (settings && settings.standard_facilities) {
      try {
        const facs = JSON.parse(settings.standard_facilities);
        if (Array.isArray(facs)) {
          const filtered = facs.filter((f: any) => f.title !== 'Listrik');
          const updated = filtered.map((f: any) => {
            if (f.title === 'Parkir') {
              return { ...f, subtitle: 'Hanya Motor' };
            }
            return f;
          });
          const serialized = JSON.stringify(updated);
          if (serialized !== settings.standard_facilities) {
            settings.standard_facilities = serialized;
            localStorage.setItem('samara_settings', JSON.stringify(settings));
          }
        }
      } catch (e) {
        console.error('Error migrating settings in local state:', e);
      }
    }
    return settings;
  },
  setSettings: (data: SystemSettings) => setLocalState('samara_settings', data)
};

// =========================================================================
// CRITICAL DECOUPLED ADAPTER PATTERN
// Maps user/admin interactions instantly either to SUPABASE or fallback SANDBOX.
// Prevents startup crashes and implements the strict DB architecture requested.
// =========================================================================

export const database = {
  // --- PROPERTIES ---
  async fetchProperties(): Promise<Property[]> {
    if (isSupabaseConfigured && supabase) {
      console.log('[SUPABASE] Fetching properties...');
      const { data, error } = await supabase.from('properties').select('*').order('id', { ascending: true });
      if (!error && data) {
        console.log(`[SUPABASE] Successfully fetched ${data.length} properties.`);
        return data as Property[];
      }
      if (error) {
        console.error('[SUPABASE fetchProperties error]:', error.message, error);
      }
    }
    return sandboxState.getProperties();
  },

  async saveProperty(prop: Partial<Property>): Promise<Property> {
    const list = sandboxState.getProperties();
    let updated: Property;
    if (prop.id) {
      updated = { ...list.find(p => p.id === prop.id)!, ...prop } as Property;
      sandboxState.setProperties(list.map(p => p.id === prop.id ? updated : p));
    } else {
      const nextId = list.length ? Math.max(...list.map(p => p.id)) + 1 : 1;
      updated = { ...prop, id: nextId, total_rooms: 0, available_rooms: 0, images: prop.images || [], facilities: prop.facilities || [] } as Property;
      sandboxState.setProperties([...list, updated]);
    }

    if (isSupabaseConfigured && supabase) {
      try {
        const { id, ...payload } = updated;
        if (prop.id) {
          const { error } = await safeSupabaseUpsert('properties', payload, id);
          if (error) console.error('[SUPABASE UPDATE_PROPERTY ERROR]', error.message);
        } else {
          const { error } = await safeSupabaseUpsert('properties', payload);
          if (error) console.error('[SUPABASE CREATE_PROPERTY ERROR]', error.message);
        }
      } catch (err) {
        console.error('Supabase backup write error in Property:', err);
      }
    }
    database.logActivity("System", prop.id ? "UPDATE_PROPERTY" : "CREATE_PROPERTY", `Properti ${updated.name} berhasil disimpan.`);
    return updated;
  },

  async deleteProperty(id: number): Promise<boolean> {
    const list = sandboxState.getProperties();
    sandboxState.setProperties(list.filter(p => p.id !== id));
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('properties').delete().eq('id', id);
      } catch (err) {
        console.error('Supabase write err:', err);
      }
    }
    database.logActivity("System", "DELETE_PROPERTY", `Menghapus properti ID: ${id}`);
    return true;
  },

  // --- ROOMS ---
  async fetchRooms(): Promise<Room[]> {
    if (isSupabaseConfigured && supabase) {
      console.log('[SUPABASE] Fetching rooms...');
      const { data, error } = await supabase.from('rooms').select('*').order('room_number', { ascending: true });
      if (!error && data) {
        console.log(`[SUPABASE] Successfully fetched ${data.length} rooms.`);
        return data as Room[];
      }
      if (error) {
        console.warn('[SUPABASE fetchRooms warning, trying fallback ordering by id]:', error.message);
        const { data: retryData, error: retryErr } = await supabase.from('rooms').select('*').order('id', { ascending: true });
        if (!retryErr && retryData) {
          console.log(`[SUPABASE] Successfully fetched ${retryData.length} rooms with id ordering.`);
          return retryData as Room[];
        }
        console.error('[SUPABASE fetchRooms error]:', retryErr || error);
      }
    }
    return sandboxState.getRooms();
  },

  async saveRoom(room: Partial<Room>): Promise<Room> {
    const list = sandboxState.getRooms();
    let updated: Room;
    if (room.id) {
      updated = { ...list.find(r => r.id === room.id)!, ...room } as Room;
      sandboxState.setRooms(list.map(r => r.id === room.id ? updated : r));
    } else {
      const nextId = list.length ? Math.max(...list.map(r => r.id)) + 1 : 1;
      updated = { ...room, id: nextId, status: room.status || 'available', facilities: room.facilities || [] } as Room;
      sandboxState.setRooms([...list, updated]);
    }

    // Recalculate available properties
    await database.syncPropertyRoomCount(updated.property_id);

    if (isSupabaseConfigured && supabase) {
      try {
        const { id, ...payload } = updated;
        if (room.id) {
          const { error } = await safeSupabaseUpsert('rooms', payload, id);
          if (error) {
            console.error('[SUPABASE UPDATE_ROOM ERROR]', error.message);
          } else {
            console.log('[SUPABASE UPDATE_ROOM SUCCESS] Room ID:', id);
          }
        } else {
          // Attempt inserting without ID first (for auto-increment tables)
          const { error } = await safeSupabaseUpsert('rooms', payload);
          if (error) {
            console.warn('[SUPABASE CREATE_ROOM ERROR (WITHOUT ID)]', error.message, 'Trying fallback WITH manual ID...');
            // Fallback: try inserting WITH ID (for manual identity tables)
            const { error: fallbackError } = await safeSupabaseUpsert('rooms', updated, id || updated.id);
            if (fallbackError) {
              console.error('[SUPABASE CREATE_ROOM FALLBACK ERROR (WITH ID)]', fallbackError.message);
            } else {
              console.log('[SUPABASE CREATE_ROOM SUCCESS] Fallback insert with manual ID succeeded.');
            }
          } else {
            console.log('[SUPABASE CREATE_ROOM SUCCESS] Inserted successfully without ID auto-assignment.');
          }
        }
      } catch (err) {
        console.error('[SUPABASE saveRoom Exception]', err);
      }
    }
    database.logActivity("System", room.id ? "UPDATE_ROOM" : "CREATE_ROOM", `Unit ${updated.room_number} disimpan.`);
    return updated;
  },

  async deleteRoom(id: number): Promise<boolean> {
    const list = sandboxState.getRooms();
    const targeted = list.find(r => r.id === id);
    sandboxState.setRooms(list.filter(r => r.id !== id));

    if (targeted) {
      await database.syncPropertyRoomCount(targeted.property_id);
    }

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('rooms').delete().eq('id', id);
      } catch (err) {
        console.error(err);
      }
    }
    database.logActivity("System", "DELETE_ROOM", `Menghapus unit ID: ${id}`);
    return true;
  },

  // --- BOOKINGS ---
  async fetchBookings(): Promise<Booking[]> {
    if (isSupabaseConfigured && supabase) {
      console.log('[SUPABASE] Fetching bookings...');
      // Try ordering by created_at first
      const { data, error } = await supabase.from('bookings').select('*').order('created_at', { ascending: false });
      if (!error && data) {
        console.log(`[SUPABASE] Successfully fetched ${data.length} bookings ordered by created_at.`);
        return data as Booking[];
      }
      
      if (error) {
        console.warn('[SUPABASE fetchBookings warning, retrying with id ordering]:', error.message);
        // Retry ordering by id
        const { data: retryData, error: retryErr } = await supabase.from('bookings').select('*').order('id', { ascending: false });
        if (!retryErr && retryData) {
          console.log(`[SUPABASE] Successfully fetched ${retryData.length} bookings ordered by id.`);
          return retryData as Booking[];
        }
        console.error('[SUPABASE fetchBookings error]:', retryErr || error);
      }
    }
    return sandboxState.getBookings();
  },

  async saveBooking(booking: Partial<Booking>): Promise<Booking> {
    const list = sandboxState.getBookings();
    let updated: Booking;
    const existing = booking.midtrans_order_id ? list.find(b => b.midtrans_order_id === booking.midtrans_order_id) : undefined;
    const previousBooking = booking.id ? list.find(b => b.id === booking.id) : existing;
    const previousStatus = previousBooking ? previousBooking.status : undefined;
    
    if (booking.id) {
      updated = { ...list.find(b => b.id === booking.id)!, ...booking } as Booking;
      sandboxState.setBookings(list.map(b => b.id === booking.id ? updated : b));
    } else if (existing) {
      updated = { ...existing, ...booking } as Booking;
      sandboxState.setBookings(list.map(b => b.id === existing.id ? updated : b));
    } else {
      const nextId = list.length ? Math.max(...list.map(b => b.id)) + 1 : 1;
      updated = { ...booking, id: nextId, status: booking.status || 'pending', booking_date: new Date().toISOString().split('T')[0] } as Booking;
      sandboxState.setBookings([...list, updated]);
    }

    // Trigger room reservation status on approval
    if (updated.status === 'approved' && updated.room_id) {
      const rooms = sandboxState.getRooms();
      const occupantName = (updated.is_for_other || !!updated.occupant_name) ? (updated.occupant_name || updated.tenant_name) : updated.tenant_name;
      sandboxState.setRooms(rooms.map(r => r.id === updated.room_id ? { ...r, status: 'occupied', current_tenant_name: occupantName } : r));
      
      // Seed or Update Tenant record automatically
      const currentTenants = sandboxState.getTenants();
      const existingTenantIndex = currentTenants.findIndex(t => t.room_number === updated.room_number && t.property_id === updated.property_id);
      
      const occupantPhone = (updated.is_for_other || !!updated.occupant_name) ? (updated.occupant_phone || updated.phone) : updated.phone;
      const occupantEmail = ((updated.is_for_other || !!updated.occupant_name) ? (updated.occupant_email || updated.email) : updated.email) || '';
      const occupantInitials = occupantName.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();

      if (existingTenantIndex > -1) {
        currentTenants[existingTenantIndex] = {
          ...currentTenants[existingTenantIndex],
          full_name: occupantName,
          phone: occupantPhone,
          email: occupantEmail,
          avatar_initials: occupantInitials,
          property_id: updated.property_id,
          room_number: updated.room_number,
        };
        sandboxState.setTenants([...currentTenants]);
      } else {
        const newTenant: Tenant = {
          id: currentTenants.length ? Math.max(...currentTenants.map(t => t.id)) + 1 : 1,
          full_name: occupantName,
          phone: occupantPhone,
          email: occupantEmail,
          avatar_initials: occupantInitials,
          avatar_color: "bg-indigo-600",
          property_id: updated.property_id,
          room_number: updated.room_number,
          start_date: updated.check_in_date || new Date().toISOString().split('T')[0],
          duration_months: updated.duration_months || 1,
          payment_status: 'paid'
        };
        sandboxState.setTenants([...currentTenants, newTenant]);
      }

      // Add or update payment invoice automatically
      const payments = sandboxState.getPayments();
      const existingInvoiceIndex = payments.findIndex(p => p.midtrans_order_id === updated.midtrans_order_id);
      let targetInvoiceId = `INV-${Math.floor(1000 + Math.random() * 9000)}`;

      if (existingInvoiceIndex > -1) {
        targetInvoiceId = payments[existingInvoiceIndex].id;
        payments[existingInvoiceIndex] = {
          ...payments[existingInvoiceIndex],
          status: 'paid',
          payment_date: new Date().toISOString().split('T')[0]
        };
        sandboxState.setPayments([...payments]);
      } else {
        const newInvoice: PaymentInvoice = {
          id: targetInvoiceId,
          tenant_name: updated.tenant_name,
          property_id: updated.property_id,
          amount: updated.total_price,
          method: updated.payment_method,
          status: 'paid',
          payment_date: new Date().toISOString().split('T')[0],
          midtrans_order_id: updated.midtrans_order_id,
          transaction_id: `mid-tr-${Math.floor(100000 + Math.random() * 900000)}`
        };
        sandboxState.setPayments([...payments, newInvoice]);
      }

      // Add double-entry ledger bookkeeping
      await database.recordFinancialRevenue(
        targetInvoiceId, 
        updated.booking_type === 'daily' ? 4100 : 4000, 
        updated.total_price, 
        `Penerimaan Sewa ${updated.booking_type === 'daily' ? 'Harian' : 'Bulanan'} - Kamar ${updated.room_number}`
      );

      // Trigger automated email confirmation via MailerSend on status transition to 'approved'
      if (previousStatus !== 'approved' && updated.email) {
        const property = sandboxState.getProperties().find(p => p.id === updated.property_id);
        mailersendService.sendBookingConfirmationEmail(updated, property).catch(err => {
          console.error('[SUPABASE TRIGGER] MailerSend automated email confirmation trigger failed:', err);
        });
      }
    }

    // Release room and update invoice on reject / cancel / overdue
    if (updated.status === 'rejected' && updated.room_id) {
      const rooms = sandboxState.getRooms();
      sandboxState.setRooms(rooms.map(r => r.id === updated.room_id ? { ...r, status: 'available', current_tenant_name: null } : r));

      const payments = sandboxState.getPayments();
      const existingInvoiceIndex = payments.findIndex(p => p.midtrans_order_id === updated.midtrans_order_id);
      if (existingInvoiceIndex > -1) {
        payments[existingInvoiceIndex] = {
          ...payments[existingInvoiceIndex],
          status: 'overdue'
        };
        sandboxState.setPayments([...payments]);
      }
    }

    // Release room on checkout
    if (updated.status === 'checkout') {
      const rooms = sandboxState.getRooms();
      sandboxState.setRooms(rooms.map(r => {
        if (r.id === updated.room_id || (r.room_number === updated.room_number && r.property_id === updated.property_id)) {
          return { ...r, status: 'available', current_tenant_name: null };
        }
        return r;
      }));
    }

    if (isSupabaseConfigured && supabase) {
      try {
        const { id, ...payload } = updated;
        if (booking.id || existing) {
          await safeSupabaseUpsert('bookings', payload, updated.id);
        } else {
          await safeSupabaseUpsert('bookings', payload);
        }

        // Real-time integration into Supabase database tables for approved bookings
        if (updated.status === 'approved' && updated.room_id) {
          const occupantName = (updated.is_for_other || !!updated.occupant_name) ? (updated.occupant_name || updated.tenant_name) : updated.tenant_name;
          // 1. Update Room Table status & tenant on Supabase
          const { error: roomErr } = await safeSupabaseUpsert('rooms', { status: 'occupied', current_tenant_name: occupantName }, updated.room_id);
          if (roomErr) {
            console.error('[SUPABASE] Room occupancy update error:', roomErr);
          }

          // 2. Insert or update corresponding Tenant record in Supabase
          const tenantPayload: any = {
            full_name: occupantName,
            phone: (updated.is_for_other || !!updated.occupant_name) ? (updated.occupant_phone || updated.phone) : updated.phone,
            email: ((updated.is_for_other || !!updated.occupant_name) ? (updated.occupant_email || updated.email) : updated.email) || '',
            avatar_initials: occupantName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase(),
            avatar_color: "bg-indigo-650",
            property_id: updated.property_id,
            room_number: updated.room_number,
            start_date: updated.check_in_date || new Date().toISOString().split('T')[0],
            duration_months: updated.duration_months || 1,
            payment_status: 'paid'
          };

          // Try to locate existing tenant by room and property to avoid duplicate inserts on Supabase DB
          let existingTenantId = null;
          try {
            const { data: dbTenants } = await supabase
              .from('tenants')
              .select('id')
              .eq('room_number', updated.room_number)
              .eq('property_id', updated.property_id)
              .limit(1);
            if (dbTenants && dbTenants.length > 0) {
              existingTenantId = dbTenants[0].id;
            }
          } catch (dbErr) {
            console.warn('[SUPABASE] Failed checking existing tenants table, fallback to insert:', dbErr);
          }

          const { error: tenantErr } = await safeSupabaseUpsert('tenants', tenantPayload, existingTenantId);
          if (tenantErr) {
            console.error('[SUPABASE] Tenant seed/update error:', tenantErr);
          }

          // 3. Insert real Payment Invoice record into Supabase
          const invoiceId = `INV-${Math.floor(1000 + Math.random() * 9000)}`;
          const paymentPayload = {
            id: invoiceId,
            tenant_name: updated.tenant_name,
            property_id: updated.property_id,
            amount: updated.total_price,
            method: updated.payment_method || 'Midtrans',
            status: 'paid',
            payment_date: new Date().toISOString().split('T')[0],
            midtrans_order_id: updated.midtrans_order_id || null,
            transaction_id: `mid-tr-${Math.floor(100000 + Math.random() * 900000)}`
          };
          const { error: paymentErr } = await safeSupabaseUpsert('payments', paymentPayload, invoiceId);
          if (paymentErr) {
            console.warn('[SUPABASE] Payment Invoice seed auto-assign ID fallback. Retrying without ID...');
            const { id: _, ...fallbackPayload } = paymentPayload;
            await safeSupabaseUpsert('payments', fallbackPayload);
          }

          // 4. Recalibrate and sync property counts
          await database.syncPropertyRoomCount(updated.property_id);
        }
      } catch (err) {
        console.error('[SUPABASE BOOKING SAVE SYSTEM EXCEPTION]', err);
      }
    }
    database.logActivity("System", booking.id ? "UPDATE_BOOKING" : "CREATE_BOOKING", `Booking sewa ${updated.tenant_name} disimpan.`);
    return updated;
  },

  // --- SURVEYS & COMPACT SURVEY SYSTEM ---
  async fetchSurveys(): Promise<Survey[]> {
    if (isSupabaseConfigured && supabase) {
      console.log('[SUPABASE] Fetching surveys...');
      const { data, error } = await supabase.from('surveys').select('*').order('id', { ascending: false });
      if (!error && data) {
        console.log(`[SUPABASE] Successfully fetched ${data.length} surveys.`);
        return data as Survey[];
      }
      if (error) {
        console.error('[SUPABASE fetchSurveys error]:', error.message, error);
      }
    }
    return sandboxState.getSurveys();
  },

  async saveSurvey(survey: Partial<Survey>): Promise<Survey> {
    const list = sandboxState.getSurveys();
    let updated: Survey;
    const existing = survey.reservation_number ? list.find(s => s.reservation_number === survey.reservation_number) : undefined;
    
    if (survey.id) {
      updated = { ...list.find(s => s.id === survey.id)!, ...survey } as Survey;
      sandboxState.setSurveys(list.map(s => s.id === survey.id ? updated : s));
    } else if (existing) {
      updated = { ...existing, ...survey } as Survey;
      sandboxState.setSurveys(list.map(s => s.id === existing.id ? updated : s));
    } else {
      const nextId = list.length ? Math.max(...list.map(s => s.id)) + 1 : 1;
      const resNo = survey.reservation_number || `SRV-${new Date().toISOString().slice(0,10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;
      updated = { 
        ...survey, 
        id: nextId, 
        reservation_number: resNo,
        status: survey.status || 'pending_payment',
        dp_amount: survey.dp_amount || 500000,
        pelunasan_deadline_days: 3,
        pelunasan_deadline_date: new Date(Date.now() + 3*24*3600*1000).toISOString().split('T')[0],
        created_at: new Date().toISOString().split('T')[0]
      } as Survey;
      sandboxState.setSurveys([...list, updated]);
    }

    // Survey confirmation triggers Room Reservation
    if (updated.status === 'survey_confirmed') {
      const rooms = sandboxState.getRooms();
      const targetRoom = rooms.find(r => r.property_id === updated.property_id && r.room_number === updated.room_number);
      if (targetRoom) {
        sandboxState.setRooms(rooms.map(r => r.id === targetRoom.id ? { ...r, status: 'reserved' } : r));
      }

      // Generate or update invoice
      const payments = sandboxState.getPayments();
      const existingInvoiceIndex = payments.findIndex(p => p.midtrans_order_id === updated.reservation_number);
      let targetInvoiceId = updated.invoice_id || `INV-SRV-${Math.floor(1000 + Math.random()*9000)}`;

      if (existingInvoiceIndex > -1) {
        targetInvoiceId = payments[existingInvoiceIndex].id;
        payments[existingInvoiceIndex] = {
          ...payments[existingInvoiceIndex],
          status: 'paid',
          payment_date: new Date().toISOString().split('T')[0]
        };
        sandboxState.setPayments([...payments]);
      } else {
        const srvInv: PaymentInvoice = {
          id: targetInvoiceId,
          tenant_name: updated.tenant_name,
          property_id: updated.property_id,
          amount: updated.dp_amount,
          method: updated.payment_method || "Midtrans Snap QRIS",
          status: "paid",
          payment_date: new Date().toISOString().split('T')[0],
          midtrans_order_id: updated.reservation_number
        };
        sandboxState.setPayments([...payments, srvInv]);
      }

      // Record in system accounts (liability Cash DP)
      await database.recordFinancialRevenue(targetInvoiceId, 1300, updated.dp_amount, `DP Survey Kamar Kenyal ${updated.room_number} - ${updated.tenant_name}`);
    } else if (updated.status === 'no_show' || updated.status === 'expired') {
      // Return room to available if it was reserved
      const rooms = sandboxState.getRooms();
      const targetRoom = rooms.find(r => r.property_id === updated.property_id && r.room_number === updated.room_number);
      if (targetRoom && targetRoom.status === 'reserved') {
        sandboxState.setRooms(rooms.map(r => r.id === targetRoom.id ? { ...r, status: 'available' } : r));
      }

      // Update invoice to overdue
      const payments = sandboxState.getPayments();
      const existingInvoiceIndex = payments.findIndex(p => p.midtrans_order_id === updated.reservation_number);
      if (existingInvoiceIndex > -1) {
        payments[existingInvoiceIndex] = {
          ...payments[existingInvoiceIndex],
          status: 'overdue'
        };
        sandboxState.setPayments([...payments]);
      }

      // Reclassify DP Liability into Revenue (DP Hangus / Forfeited)
      if (updated.status === 'no_show') {
        await database.recordFinancialReclassification(1300, 4200, updated.dp_amount, `DP Survey Hangus (No Show) - Reservasi ${updated.reservation_number}`);
      }
    }

    if (isSupabaseConfigured && supabase) {
      try {
        const { id, ...payload } = updated;
        if (survey.id || existing) {
          await safeSupabaseUpsert('surveys', payload, updated.id);
        } else {
          await safeSupabaseUpsert('surveys', payload);
        }

        // --- NEW REAL-TIME INTEGRATION FOR CONFIRMED SURVEYS (DP PAID) ---
        if (updated.status === 'survey_confirmed') {
          // 1. Update Room status to 'reserved' in Supabase
          const rooms = sandboxState.getRooms();
          const targetRoom = rooms.find(r => r.property_id === updated.property_id && r.room_number === updated.room_number);
          if (targetRoom) {
            const { error: roomErr } = await safeSupabaseUpsert('rooms', { status: 'reserved' }, targetRoom.id);
            if (roomErr) console.error('[SUPABASE SURVEY] Room update error:', roomErr);
          }

          // 2. Insert Invoice payment on Supabase
          const srvInvPayload = {
            id: updated.invoice_id || `INV-SRV-${Math.floor(1000 + Math.random()*9000)}`,
            tenant_name: updated.tenant_name,
            property_id: updated.property_id,
            amount: updated.dp_amount,
            method: updated.payment_method || "Midtrans Snap QRIS",
            status: "paid",
            payment_date: new Date().toISOString().split('T')[0],
            midtrans_order_id: updated.reservation_number || null,
            transaction_id: `mid-tr-${Math.floor(100000 + Math.random() * 900000)}`
          };
          const { error: pyErr } = await safeSupabaseUpsert('payments', srvInvPayload, srvInvPayload.id);
          if (pyErr) {
            console.error('[SUPABASE SURVEY] Payment invoice error:', pyErr);
            const { id: _, ...fallbackPy } = srvInvPayload;
            await safeSupabaseUpsert('payments', fallbackPy);
          }

          // 3. Sync property room counts
          await database.syncPropertyRoomCount(updated.property_id);
        } else if (updated.status === 'no_show' || updated.status === 'expired') {
          // Revert room status to 'available' inside Supabase
          const rooms = sandboxState.getRooms();
          const targetRoom = rooms.find(r => r.property_id === updated.property_id && r.room_number === updated.room_number);
          if (targetRoom && targetRoom.status === 'reserved') {
            await safeSupabaseUpsert('rooms', { status: 'available' }, targetRoom.id);
            await database.syncPropertyRoomCount(updated.property_id);
          }
        }
      } catch (err) {
        console.error('[SUPABASE SURVEY_SAVE_EXCEPTION]', err);
      }
    }

    database.logActivity("System", survey.id ? "UPDATE_SURVEY" : "CREATE_SURVEY", `Survey schedlocked: ${updated.tenant_name} Kamar ${updated.room_number}`);
    return updated;
  },

  // --- COUPE DISCOUNT TRIGGER ---
  async fetchCoupons(): Promise<Coupon[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('coupons').select('*');
      if (!error && data) return data as Coupon[];
    }
    return sandboxState.getCoupons();
  },

  async saveCoupon(coupon: Partial<Coupon>): Promise<Coupon> {
    const list = sandboxState.getCoupons();
    let updated: Coupon;
    if (coupon.id) {
      updated = { ...list.find(c => c.id === coupon.id)!, ...coupon } as Coupon;
      sandboxState.setCoupons(list.map(c => c.id === coupon.id ? updated : c));
    } else {
      const nextId = list.length ? Math.max(...list.map(c => c.id)) + 1 : 1;
      updated = { ...coupon, id: nextId, is_active: true } as Coupon;
      sandboxState.setCoupons([...list, updated]);
    }

    if (isSupabaseConfigured && supabase) {
      try {
        const { id, ...payload } = updated;
        if (coupon.id) {
          await safeSupabaseUpsert('coupons', payload, id);
        } else {
          await safeSupabaseUpsert('coupons', payload);
        }
      } catch (err) {
        console.error(err);
      }
    }
    return updated;
  },

  async deleteCoupon(id: number): Promise<boolean> {
    sandboxState.setCoupons(sandboxState.getCoupons().filter(c => c.id !== id));
    if (isSupabaseConfigured && supabase) {
      await supabase.from('coupons').delete().eq('id', id);
    }
    return true;
  },

  // --- DOUBLE JOURNAL ENTRY SYSTEM ---
  async fetchAccounts(): Promise<AccountCOA[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('accounts').select('*').order('id', { ascending: true });
      if (!error && data) return data as AccountCOA[];
    }
    return sandboxState.getAccounts();
  },

  async fetchFinancialTransactions(): Promise<FinancialTransaction[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('financial_transactions').select('*').order('id', { ascending: false });
      if (!error && data) return data as FinancialTransaction[];
    }
    return sandboxState.getFinancialTransactions();
  },

  async fetchJournalEntries(): Promise<JournalEntry[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('journal_entries').select('*').order('id', { ascending: false });
      if (!error && data) return data as JournalEntry[];
    }
    return sandboxState.getJournalEntries();
  },

  async postFinancialTransaction(payload: {
    category: string;
    description: string;
    amount: number;
    type: 'income' | 'expense' | 'dp_booking' | 'reclassification';
    reference_type?: string | null;
    reference_id?: string | null;
    created_by: string;
    debit_account_id: number;
    credit_account_id: number;
  }) {
    const {
      category,
      description,
      amount,
      type,
      reference_type,
      reference_id,
      created_by,
      debit_account_id,
      credit_account_id
    } = payload;

    const trxDate = new Date().toISOString().split('T')[0];

    // ----------------------------------------------------
    // A. OFFLINE / SANDBOX LOCAL STORAGE POSTING ENGINE
    // ----------------------------------------------------
    const prevAccounts = sandboxState.getAccounts();
    const prevTransactions = sandboxState.getFinancialTransactions();
    const prevJournals = sandboxState.getJournalEntries();

    try {
      const nextTrxId = prevTransactions.length ? Math.max(...prevTransactions.map(t => t.id)) + 1 : 1;
      const nextJournalId = prevJournals.length ? Math.max(...prevJournals.map(j => j.id)) + 1 : 1;

      const trxNo = `TRX-${trxDate.replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;
      const journalNo = `JRN-${trxDate.replace(/-/g, '')}-${String(nextTrxId).padStart(5, '0')}`;

      const newTrx: FinancialTransaction = {
        id: nextTrxId,
        transaction_no: trxNo,
        transaction_date: trxDate,
        category,
        description,
        amount,
        type,
        reference_type: reference_type || null,
        reference_id: reference_id || null,
        created_by
      };

      const debitEntry: JournalEntry = {
        id: nextJournalId,
        journal_no: journalNo,
        transaction_id: nextTrxId,
        account_id: debit_account_id,
        debit: amount,
        credit: 0
      };

      const creditEntry: JournalEntry = {
        id: nextJournalId + 1,
        journal_no: journalNo,
        transaction_id: nextTrxId,
        account_id: credit_account_id,
        debit: 0,
        credit: amount
      };

      const updatedAccounts = prevAccounts.map(acc => {
        if (acc.id === debit_account_id) {
          const isAssetOrExpense = acc.type === 'asset' || acc.type === 'expense';
          const newBalance = isAssetOrExpense 
            ? Number(acc.balance) + amount 
            : Math.max(0, Number(acc.balance) - amount);
          return { ...acc, balance: newBalance };
        }
        if (acc.id === credit_account_id) {
          const isLiabilityOrEquityOrRevenue = acc.type === 'liability' || acc.type === 'equity' || acc.type === 'revenue';
          const newBalance = isLiabilityOrEquityOrRevenue 
            ? Number(acc.balance) + amount 
            : Math.max(0, Number(acc.balance) - amount);
          return { ...acc, balance: newBalance };
        }
        return acc;
      });

      sandboxState.setFinancialTransactions([...prevTransactions, newTrx]);
      sandboxState.setJournalEntries([...prevJournals, debitEntry, creditEntry]);
      sandboxState.setAccounts(updatedAccounts);

    } catch (err) {
      sandboxState.setAccounts(prevAccounts);
      sandboxState.setFinancialTransactions(prevTransactions);
      sandboxState.setJournalEntries(prevJournals);
      console.error("[Sandbox Posting Engine] Rollback triggered due to sandbox error:", err);
      throw err;
    }

    // ----------------------------------------------------
    // B. PRODUCTION SUPABASE POSTGRES TRANSACTION ENGINE
    // ----------------------------------------------------
    if (isSupabaseConfigured && supabase) {
      try {
        const trxNoSupabase = `TRX-${trxDate.replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;

        const { data: rpcResult, error: rpcError } = await supabase.rpc('post_financial_transaction', {
          p_transaction_no: trxNoSupabase,
          p_transaction_date: trxDate,
          p_category: category,
          p_description: description,
          p_amount: amount,
          p_type: type,
          p_reference_type: reference_type || null,
          p_reference_id: reference_id || null,
          p_created_by: created_by,
          p_debit_account_id: debit_account_id,
          p_credit_account_id: credit_account_id
        });

        if (rpcError) {
          console.warn("[Posting Engine] RPC failed or is not installed. Falling back to client-driven database transaction.", rpcError);

          let insertedTrx: any = null;
          let insertedDebJrn: any = null;
          let insertedCredJrn: any = null;
          let oldDebitBalance: number | null = null;
          let oldCreditBalance: number | null = null;

          try {
            const { data: debAcc } = await supabase.from('accounts').select('balance, type').eq('id', debit_account_id).single();
            const { data: credAcc } = await supabase.from('accounts').select('balance, type').eq('id', credit_account_id).single();
            
            if (!debAcc || !credAcc) throw new Error("Account validation failed during transaction.");
            oldDebitBalance = Number(debAcc.balance || 0);
            oldCreditBalance = Number(credAcc.balance || 0);

            const trxPayload = {
              transaction_no: trxNoSupabase,
              transaction_date: trxDate,
              category,
              description,
              amount,
              type,
              reference_type: reference_type || null,
              reference_id: reference_id || null,
              created_by
            };
            const { data: trxData, error: trxErr } = await supabase.from('financial_transactions').insert(trxPayload).select().single();
            if (trxErr) throw trxErr;
            insertedTrx = trxData;

            const jrnNoSupabase = `JRN-${trxDate.replace(/-/g, '')}-${String(insertedTrx.id).padStart(5, '0')}`;

            const debPayload = {
              journal_no: jrnNoSupabase,
              transaction_id: insertedTrx.id,
              account_id: debit_account_id,
              debit: amount,
              credit: 0
            };
            const { data: debJrn, error: debErr } = await supabase.from('journal_entries').insert(debPayload).select().single();
            if (debErr) throw debErr;
            insertedDebJrn = debJrn;

            const credPayload = {
              journal_no: jrnNoSupabase,
              transaction_id: insertedTrx.id,
              account_id: credit_account_id,
              debit: 0,
              credit: amount
            };
            const { data: credJrn, error: credErr } = await supabase.from('journal_entries').insert(credPayload).select().single();
            if (credErr) throw credErr;
            insertedCredJrn = credJrn;

            const isAssetOrExpense = debAcc.type === 'asset' || debAcc.type === 'expense';
            const newDebitBalance = isAssetOrExpense 
              ? oldDebitBalance + amount 
              : Math.max(0, oldDebitBalance - amount);
            await safeSupabaseUpsert('accounts', { balance: newDebitBalance }, debit_account_id);

            const isLiabilityOrEquityOrRevenue = credAcc.type === 'liability' || credAcc.type === 'equity' || credAcc.type === 'revenue';
            const newCreditBalance = isLiabilityOrEquityOrRevenue 
              ? oldCreditBalance + amount 
              : Math.max(0, oldCreditBalance - amount);
            await safeSupabaseUpsert('accounts', { balance: newCreditBalance }, credit_account_id);

            console.log("[Posting Engine] DB transactions completed and committed successfully.");

          } catch (dbErr) {
            console.error("[Posting Engine] DB transaction error. Initiating Rollback...", dbErr);
            if (insertedCredJrn) await supabase.from('journal_entries').delete().eq('id', insertedCredJrn.id);
            if (insertedDebJrn) await supabase.from('journal_entries').delete().eq('id', insertedDebJrn.id);
            if (insertedTrx) await supabase.from('financial_transactions').delete().eq('id', insertedTrx.id);
            if (oldDebitBalance !== null) await safeSupabaseUpsert('accounts', { balance: oldDebitBalance }, debit_account_id);
            if (oldCreditBalance !== null) await safeSupabaseUpsert('accounts', { balance: oldCreditBalance }, credit_account_id);
            throw dbErr;
          }
        } else {
          console.log("[Posting Engine] Stored procedure post_financial_transaction executed successfully on Supabase:", rpcResult);
        }
      } catch (err) {
        console.error("[Posting Engine] Database posting transaction failed:", err);
        throw err;
      }
    }
  },

  async recordFinancialRevenue(invoiceId: string, creditAccountId: number, amount: number, description: string) {
    await this.postFinancialTransaction({
      category: "Penerimaan Sewa",
      description,
      amount,
      type: creditAccountId === 1300 ? "dp_booking" : "income",
      reference_type: "payment",
      reference_id: invoiceId,
      created_by: "System Webhook",
      debit_account_id: 1010, // Kas dan Bank Mandiri
      credit_account_id: creditAccountId
    });
  },

  async recordFinancialReclassification(debitAccountId: number, creditAccountId: number, amount: number, description: string) {
    await this.postFinancialTransaction({
      category: "Reklasifikasi Akun",
      description,
      amount,
      type: "reclassification",
      reference_type: "reclassification",
      reference_id: null,
      created_by: "System Finance",
      debit_account_id: debitAccountId,
      credit_account_id: creditAccountId
    });
  },

  async recordFinancialExpense(debitAccountId: number, creditAccountId: number, amount: number, description: string, category: string = "Biaya Operasional") {
    await this.postFinancialTransaction({
      category,
      description,
      amount,
      type: "expense",
      reference_type: "expense",
      reference_id: null,
      created_by: "System Finance",
      debit_account_id: debitAccountId,
      credit_account_id: creditAccountId
    });
  },

  // --- RULES SETTINGS ---
  async fetchSettings(): Promise<SystemSettings> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('settings').select('*').maybeSingle();
      if (!error && data) return data as SystemSettings;
    }
    return sandboxState.getSettings();
  },

  async saveSettings(settings: SystemSettings): Promise<SystemSettings> {
    sandboxState.setSettings(settings);
    if (isSupabaseConfigured && supabase) {
      try {
        await safeSupabaseUpsert('settings', {
          booking_rules: settings.booking_rules,
          survey_rules: settings.survey_rules,
          standard_facilities: settings.standard_facilities,
          why_choose_us: settings.why_choose_us,
          faqs: settings.faqs
        }, 1);
      } catch(err) {
        console.error(err);
      }
    }
    database.logActivity("System", "UPDATE_SETTINGS", "Perubahan tata tertib survey, sewa, fasilitas standar, why-choose-us, dan FAQ berhasil disimpan.");
    return settings;
  },

  // --- SYSTEM LOGGERS ---
  async logActivity(adminName: string, action: string, detail: string) {
    console.log(`[ACTIVITY LOG] [${adminName}] ${action}: ${detail}`);
    const logs = sandboxState.getActivityLogs();
    const newLog: ActivityLog = {
      id: logs.length ? Math.max(...logs.map(l=>l.id)) + 1 : 1,
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      admin_name: adminName,
      action: action,
      detail: detail,
      ip_address: "127.0.0.1"
    };
    sandboxState.setActivityLogs([newLog, ...logs]);

    if (isSupabaseConfigured && supabase) {
      try {
        await safeSupabaseUpsert('activity_logs', {
          admin_name: newLog.admin_name,
          action: newLog.action,
          detail: newLog.detail,
          ip_address: newLog.ip_address
        });
      } catch {}
    }
  },

  async fetchTenants(): Promise<Tenant[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('tenants').select('*').order('id', { ascending: false });
      if (!error && data) return data as Tenant[];
    }
    return sandboxState.getTenants();
  },

  async saveTenant(tenant: Partial<Tenant>): Promise<Tenant> {
    const list = sandboxState.getTenants();
    const exists = list.some(t => t.id === tenant.id);
    let finalTenant = { ...tenant } as Tenant;
    if (exists) {
      const idx = list.findIndex(t => t.id === tenant.id);
      finalTenant = { ...list[idx], ...tenant };
      list[idx] = finalTenant;
      sandboxState.setTenants([...list]);
    } else {
      const nextId = list.length ? Math.max(...list.map(t => t.id)) + 1 : 1;
      finalTenant = {
        id: tenant.id || nextId,
        full_name: tenant.full_name || '',
        phone: tenant.phone || '',
        email: tenant.email || '',
        avatar_initials: tenant.avatar_initials || '',
        avatar_color: tenant.avatar_color || 'bg-indigo-600',
        property_id: tenant.property_id || null,
        room_number: tenant.room_number || '',
        start_date: tenant.start_date || new Date().toISOString().split('T')[0],
        duration_months: tenant.duration_months || 1,
        payment_status: tenant.payment_status || 'paid',
        status: tenant.status || 'active'
      } as Tenant;
      sandboxState.setTenants([...list, finalTenant]);
    }

    if (isSupabaseConfigured && supabase) {
      const { error } = await safeSupabaseUpsert('tenants', finalTenant, finalTenant.id);
      if (error) {
        console.error('[SUPABASE] saveTenant error:', error);
      }
    }

    // Dispatch global event for sync
    window.dispatchEvent(new Event('samara_state_changed'));
    return finalTenant;
  },

  async fetchPayments(): Promise<PaymentInvoice[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('payments').select('*').order('id', { ascending: false });
      if (!error && data) return data as PaymentInvoice[];
    }
    return sandboxState.getPayments();
  },

  async savePayment(payment: PaymentInvoice): Promise<PaymentInvoice> {
    const list = sandboxState.getPayments();
    const exists = list.some(p => p.id === payment.id);
    let updatedList: PaymentInvoice[];
    if (exists) {
      updatedList = list.map(p => p.id === payment.id ? payment : p);
    } else {
      updatedList = [...list, payment];
    }
    sandboxState.setPayments(updatedList);

    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await safeSupabaseUpsert('payments', payment, payment.id);
        if (error) {
          console.error('[SUPABASE SAVE PAYMENT ERROR]', error.message);
        }
      } catch (err) {
        console.error('Supabase write error in savePayment:', err);
      }
    }
    database.logActivity("System", "UPDATE_PAYMENT", `Pembayaran ${payment.id} (${payment.tenant_name}) diupdate ke status: ${payment.status}.`);
    return payment;
  },

  async fetchActivityLogs(): Promise<ActivityLog[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('activity_logs').select('*').order('id', { ascending: false }).limit(40);
      if (!error && data) return data as ActivityLog[];
    }
    return sandboxState.getActivityLogs();
  },

  async fetchUsers(): Promise<UserSystem[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('users').select('*').order('id', { ascending: false });
      if (!error && data) return data as UserSystem[];
    }
    return sandboxState.getUsers();
  },

  async saveUser(user: Partial<UserSystem>): Promise<UserSystem> {
    const list = sandboxState.getUsers();
    let updated: UserSystem;
    if (user.id) {
      updated = { ...list.find(u => u.id === user.id)!, ...user } as UserSystem;
      sandboxState.setUsers(list.map(u => u.id === user.id ? updated : u));
    } else {
      const nextIdNum = list.length ? Math.max(...list.map(u => Number(u.id) || 0)) + 1 : 1;
      updated = {
        id: String(nextIdNum),
        full_name: user.full_name || '',
        email: user.email || '',
        role: user.role || 'staff',
        role_id: user.role_id || 4,
        access: user.access || 'Staff akses terbatas',
        active: user.active !== undefined ? user.active : true,
        last_login: new Date().toISOString().split('T')[0],
        created_at: new Date().toISOString().split('T')[0]
      } as UserSystem;
      sandboxState.setUsers([...list, updated]);
    }

    if (isSupabaseConfigured && supabase) {
      try {
        const { id, ...payload } = updated;
        if (user.id) {
          await safeSupabaseUpsert('users', payload, id);
        } else {
          await safeSupabaseUpsert('users', payload);
        }
      } catch (err) {
        console.error(err);
      }
    }
    database.logActivity("System", user.id ? "UPDATE_USER" : "CREATE_USER", `User ${updated.full_name} (${updated.role}) disimpan.`);
    return updated;
  },

  async deleteUser(id: string): Promise<boolean> {
    const list = sandboxState.getUsers();
    const targeted = list.find(u => u.id === id);
    sandboxState.setUsers(list.filter(u => u.id !== id));

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('users').delete().eq('id', id);
      } catch (err) {
        console.error(err);
      }
    }
    if (targeted) {
      database.logActivity("System", "DELETE_USER", `Menghapus user: ${targeted.full_name}`);
    }
    return true;
  },

  // Helper inside to keep property occupancy stats calibrated perfectly
  async syncPropertyRoomCount(propertyId: number) {
    let properties: Property[] = [];
    let rooms: Room[] = [];

    if (isSupabaseConfigured && supabase) {
      try {
        const { data: propData, error: propErr } = await supabase.from('properties').select('*');
        const { data: roomData, error: roomErr } = await supabase.from('rooms').select('*');
        if (!propErr && propData) properties = propData as Property[];
        if (!roomErr && roomData) rooms = roomData as Room[];
      } catch (err) {
        console.error('[SUPABASE SYNC Fetch Error]', err);
      }
    }

    // Fallback or read sandbox if empty/unconfigured
    if (properties.length === 0) properties = sandboxState.getProperties();
    if (rooms.length === 0) rooms = sandboxState.getRooms();

    let targetProp: Property | undefined;
    const targetProps = properties.map(p => {
      if (p.id === propertyId) {
        const pRooms = rooms.filter(r => r.property_id === propertyId);
        const avail = pRooms.filter(r => r.status === 'available').length;
        targetProp = {
          ...p,
          total_rooms: pRooms.length,
          available_rooms: avail
        };
        return targetProp;
      }
      return p;
    });

    sandboxState.setProperties(targetProps);

    if (isSupabaseConfigured && supabase && targetProp) {
      try {
        const { id, ...payload } = targetProp;
        const { error } = await safeSupabaseUpsert('properties', payload, id);
        if (error) {
          console.error('[SUPABASE SYNC Property Count Error]', error.message);
        } else {
          console.log('[SUPABASE SYNC Property Count Success] Prop ID:', id, 'Total Rooms:', targetProp.total_rooms, 'Available:', targetProp.available_rooms);
        }
      } catch (err) {
        console.error('Error syncing property room count in Supabase:', err);
      }
    }
  },

  // Helper reset utility to easily clean slate playground experiments
  async resetPlayground() {
    localStorage.removeItem('samara_properties');
    localStorage.removeItem('samara_rooms');
    localStorage.removeItem('samara_tenants');
    localStorage.removeItem('samara_bookings');
    localStorage.removeItem('samara_payments');
    localStorage.removeItem('samara_maintenance');
    localStorage.removeItem('samara_users');
    localStorage.removeItem('samara_surveys');
    localStorage.removeItem('samara_coupons');
    localStorage.removeItem('samara_accounts');
    localStorage.removeItem('samara_fin_transactions');
    localStorage.removeItem('samara_activity_logs');
    localStorage.removeItem('samara_settings');
    window.location.reload();
  }
};
