/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Default seed and fallback dataset for Samara Stay ERP & Public Portal.
 * Used when offline, during network partition, or when Supabase service is restricted (e.g. egress quota limit).
 */

import { Property, Room, Coupon, SystemSettings, Tenant, Survey, ContractExtension, Facility } from '../types';

export const DEFAULT_FACILITIES: Facility[] = [
  { id: 1, name: 'WiFi Kecepatan Tinggi (Biznet)', icon: 'Wifi', category: 'general', description: 'Koneksi internet fiber optik 100 Mbps di seluruh area' },
  { id: 2, name: 'AC Daikin Inverter', icon: 'Wind', category: 'room', description: 'Hemat daya dan pendinginan maksimal di tiap kamar' },
  { id: 3, name: 'Water Heater Tenaga Surya', icon: 'Zap', category: 'room', description: 'Air hangat 24 jam untuk kenyamanan relaksasi mandi' },
  { id: 4, name: 'Kamar Mandi Dalam', icon: 'Droplet', category: 'room', description: 'Kamar mandi pribadi dilengkapi shower dan toilet duduk' },
  { id: 5, name: 'CCTV & Akses Kartu 24 Jam', icon: 'Shield', category: 'property', description: 'Keamanan ketat dengan pengawasan CCTV & kunci pintu digital' },
  { id: 6, name: 'Dapur & Kulkas Bersama', icon: 'Utensils', category: 'property', description: 'Dapur bersih dilengkapi kompor gas, kulkas, dan microwave' },
  { id: 7, name: 'Parkir Motor & Mobil', icon: 'Car', category: 'property', description: 'Area parkir luas dengan atap pelindung kanopi aman' },
  { id: 8, name: 'Smart TV & Meja Kerja', icon: 'Tv', category: 'room', description: 'Perlengkapan lengkap untuk kenyamanan kerja dan hiburan' },
  { id: 9, name: 'Area Jemuran Beratap', icon: 'Sun', category: 'property', description: 'Area penjemuran pakaian yang lapang dengan sirkulasi udara baik' },
  { id: 10, name: 'Housekeeping Area Publik', icon: 'Sparkles', category: 'property', description: 'Pembersihan area komunal teratur setiap hari' }
];

export const DEFAULT_PROPERTIES: Property[] = [
  {
    id: 1,
    name: 'Samara Stay Salemba UI',
    address: 'Jl. Salemba Raya No. 4, Senen, Jakarta Pusat',
    price: 2200000,
    type: 'campur',
    total_rooms: 18,
    available_rooms: 7,
    deposit_amount: 500000,
    lat: -6.195621,
    lng: 106.848815,
    image_url: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80'
    ],
    facilities: DEFAULT_FACILITIES.slice(0, 7),
    description: 'Kost eksklusif dekat Fakultas Kedokteran UI Salemba & RS Cipto Mangunkusumo. Dilengkapi kamar mandi dalam, AC, WiFi cepat, dan keamanan 24 jam.',
    policies: '1. Tamu dilarang menginap tanpa izin pengelola.\n2. Wajib menjaga ketenangan setelah pukul 22:00 WIB.\n3. Dilarang merokok di dalam kamar ber-AC.'
  },
  {
    id: 2,
    name: 'Samara Stay Pasar Minggu',
    address: 'Jl. Raya Ragunan No. 12, Pasar Minggu, Jakarta Selatan',
    price: 1950000,
    type: 'putra',
    total_rooms: 14,
    available_rooms: 5,
    deposit_amount: 500000,
    lat: -6.284300,
    lng: 106.843600,
    image_url: 'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80'
    ],
    facilities: [DEFAULT_FACILITIES[0], DEFAULT_FACILITIES[1], DEFAULT_FACILITIES[3], DEFAULT_FACILITIES[4], DEFAULT_FACILITIES[5], DEFAULT_FACILITIES[6]],
    description: 'Hunian nyaman khusus putra, hanya 5 menit jalan kaki dari Stasiun KRL Pasar Minggu. Akses cepat ke TB Simatupang & Pancoran.',
    policies: '1. Khusus penghuni putra.\n2. Parkir motor dan mobil tersedia beratap kanopi.'
  },
  {
    id: 3,
    name: 'Samara Stay Jagakarsa UI',
    address: 'Jl. Moh. Kahfi II No. 45, Jagakarsa, Jakarta Selatan',
    price: 1750000,
    type: 'putri',
    total_rooms: 16,
    available_rooms: 6,
    deposit_amount: 500000,
    lat: -6.342100,
    lng: 106.828500,
    image_url: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80'
    ],
    facilities: [DEFAULT_FACILITIES[0], DEFAULT_FACILITIES[1], DEFAULT_FACILITIES[2], DEFAULT_FACILITIES[3], DEFAULT_FACILITIES[4], DEFAULT_FACILITIES[5]],
    description: 'Kost putri asri dan tenang di dekat Kampus UI Depok & ISTN Jagakarsa. Suasana nyaman belajar dengan sistem kartu akses keamanan.',
    policies: '1. Khusus penghuni putri.\n2. Gerbang utama dikunci pukul 23:00 WIB (akses darurat tersedia melalui kartu jaga).'
  }
];

export const DEFAULT_ROOMS: Room[] = [
  // Samara Stay Salemba UI (Property 1)
  {
    id: 101,
    property_id: 1,
    room_number: '101',
    room_type: 'Standard',
    price: 2200000,
    size_sqm: 14,
    floor: 1,
    status: 'available',
    facilities: [DEFAULT_FACILITIES[0], DEFAULT_FACILITIES[1], DEFAULT_FACILITIES[3]],
    image_url: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80',
    images: ['https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80'],
    is_daily_enabled: true,
    daily_price: 175000
  },
  {
    id: 102,
    property_id: 1,
    room_number: '102',
    room_type: 'Deluxe',
    price: 2500000,
    size_sqm: 18,
    floor: 1,
    status: 'available',
    facilities: [DEFAULT_FACILITIES[0], DEFAULT_FACILITIES[1], DEFAULT_FACILITIES[2], DEFAULT_FACILITIES[3], DEFAULT_FACILITIES[7]],
    image_url: 'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=800&q=80',
    images: ['https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=800&q=80'],
    is_daily_enabled: true,
    daily_price: 200000
  },
  {
    id: 103,
    property_id: 1,
    room_number: '103',
    room_type: 'Standard',
    price: 2200000,
    size_sqm: 14,
    floor: 1,
    status: 'occupied',
    current_tenant_name: 'Dimas Arya Pratama',
    facilities: [DEFAULT_FACILITIES[0], DEFAULT_FACILITIES[1], DEFAULT_FACILITIES[3]],
    image_url: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80',
    is_daily_enabled: false,
    daily_price: 175000
  },
  {
    id: 201,
    property_id: 1,
    room_number: '201',
    room_type: 'Deluxe',
    price: 2500000,
    size_sqm: 18,
    floor: 2,
    status: 'available',
    facilities: [DEFAULT_FACILITIES[0], DEFAULT_FACILITIES[1], DEFAULT_FACILITIES[2], DEFAULT_FACILITIES[3]],
    image_url: 'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=800&q=80',
    is_daily_enabled: true,
    daily_price: 200000
  },
  {
    id: 202,
    property_id: 1,
    room_number: '202',
    room_type: 'Premium',
    price: 2850000,
    size_sqm: 22,
    floor: 2,
    status: 'available',
    facilities: [DEFAULT_FACILITIES[0], DEFAULT_FACILITIES[1], DEFAULT_FACILITIES[2], DEFAULT_FACILITIES[3], DEFAULT_FACILITIES[7]],
    image_url: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80',
    is_daily_enabled: true,
    daily_price: 230000
  },

  // Samara Stay Pasar Minggu (Property 2)
  {
    id: 301,
    property_id: 2,
    room_number: '101',
    room_type: 'Standard',
    price: 1950000,
    size_sqm: 14,
    floor: 1,
    status: 'available',
    facilities: [DEFAULT_FACILITIES[0], DEFAULT_FACILITIES[1], DEFAULT_FACILITIES[3]],
    image_url: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80',
    is_daily_enabled: true,
    daily_price: 160000
  },
  {
    id: 302,
    property_id: 2,
    room_number: '102',
    room_type: 'Deluxe',
    price: 2200000,
    size_sqm: 16,
    floor: 1,
    status: 'available',
    facilities: [DEFAULT_FACILITIES[0], DEFAULT_FACILITIES[1], DEFAULT_FACILITIES[2], DEFAULT_FACILITIES[3]],
    image_url: 'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=800&q=80',
    is_daily_enabled: true,
    daily_price: 180000
  },
  {
    id: 303,
    property_id: 2,
    room_number: '202',
    room_type: 'Deluxe',
    price: 2200000,
    size_sqm: 16,
    floor: 2,
    status: 'occupied',
    current_tenant_name: 'Rian Hidayat',
    facilities: [DEFAULT_FACILITIES[0], DEFAULT_FACILITIES[1], DEFAULT_FACILITIES[3]],
    image_url: 'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=800&q=80',
    is_daily_enabled: false,
    daily_price: 180000
  },

  // Samara Stay Jagakarsa UI (Property 3)
  {
    id: 401,
    property_id: 3,
    room_number: '101',
    room_type: 'Standard',
    price: 1750000,
    size_sqm: 12,
    floor: 1,
    status: 'available',
    facilities: [DEFAULT_FACILITIES[0], DEFAULT_FACILITIES[1], DEFAULT_FACILITIES[3]],
    image_url: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80',
    is_daily_enabled: true,
    daily_price: 150000
  },
  {
    id: 402,
    property_id: 3,
    room_number: '102',
    room_type: 'Deluxe',
    price: 2000000,
    size_sqm: 15,
    floor: 1,
    status: 'available',
    facilities: [DEFAULT_FACILITIES[0], DEFAULT_FACILITIES[1], DEFAULT_FACILITIES[2], DEFAULT_FACILITIES[3]],
    image_url: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80',
    is_daily_enabled: true,
    daily_price: 170000
  }
];

export const DEFAULT_COUPONS: Coupon[] = [];

export const DEFAULT_SETTINGS: SystemSettings = {
  id: 1,
  booking_rules: "1. Tamu dilarang membawa lawan jenis masuk ke dalam kamar tidur.\n2. Menjaga ketenangan dan kenyamanan bersama setelah pukul 22:00 WIB.\n3. Uang sewa bulanan dibayarkan tepat waktu sebelum jatuh tempo.\n4. Deposit jaminan dikembalikan utuh saat masa sewa selesai dan serah terima unit.",
  survey_rules: "1. Jadwal survey dibuka setiap hari kerja pukul 09:00 - 17:00 WIB.\n2. Pembayaran DP Survey Rp 500.000 berlaku sebagai tanda jadi dan memotong biaya sewa bulan pertama.",
  standard_facilities: JSON.stringify(DEFAULT_FACILITIES.map(f => ({
    id: f.id,
    icon: f.icon || 'Sparkles',
    title: f.name,
    subtitle: f.description || '',
    category: f.category || 'general'
  }))),
  why_choose_us: JSON.stringify([
    'Standar Kebersihan Terjaga (Layanan kebersihan area umum & fasilitas terjaga)',
    'CCTV 24 Jam & Sistem Akses Pintu Pintar di Area Umum',
    'Maintenance Cepat Tanggap (< 24 Jam untuk perbaikan fasilitas)',
    'Admin Responsif via WhatsApp untuk kemudahan komunikasi',
    'Pembayaran Digital Aman & Terverifikasi Otomatis',
    'Kontrak Transparan Tanpa Biaya Tersembunyi'
  ]),
  faqs: JSON.stringify([
    { question: 'Bagaimana cara booking kamar di Samara Stay?', answer: 'Pilih kamar yang diinginkan di website, tentukan tanggal mulai sewa, dan selesaikan pembayaran DP atau pelunasan dengan sistem pembayaran digital otomatis terintegrasi.', q: 'Bagaimana cara booking kamar di Samara Stay?', a: 'Pilih kamar yang diinginkan di website, tentukan tanggal mulai sewa, dan selesaikan pembayaran DP atau pelunasan dengan sistem pembayaran digital otomatis terintegrasi.' },
    { question: 'Apakah boleh survey lokasi terlebih dahulu?', answer: 'Tentu! Anda dapat memilih menu Jadwalkan Survey dan menentukan tanggal serta jam survey yang Anda inginkan.', q: 'Apakah boleh survey lokasi terlebih dahulu?', a: 'Tentu! Anda dapat memilih menu Jadwalkan Survey dan menentukan tanggal serta jam survey yang Anda inginkan.' },
    { question: 'Kapan uang deposit dikembalikan?', answer: 'Uang deposit akan ditransfer kembali maksimal 1x24 jam setelah proses checkout dan verifikasi kondisi kamar selesai tanpa kerusakan.', q: 'Kapan uang deposit dikembalikan?', a: 'Uang deposit akan ditransfer kembali maksimal 1x24 jam setelah proses checkout dan verifikasi kondisi kamar selesai tanpa kerusakan.' },
    { question: 'Apakah ada biaya tambahan bulanan?', answer: 'Biaya sewa sudah mencakup listrik dan air standar, serta pembersihan area bersama tanpa biaya tersembunyi.', q: 'Apakah ada biaya tambahan bulanan?', a: 'Biaya sewa sudah mencakup listrik dan air standar, serta pembersihan area bersama tanpa biaya tersembunyi.' }
  ]),
  owner_signature_url: 'https://eniwbzpfvwtbsonmnzzr.supabase.co/storage/v1/object/public/signatures/owner_official_signature.png'
};

export const DEFAULT_TENANTS: Tenant[] = [];

export const DEFAULT_SURVEYS: Survey[] = [];

export const DEFAULT_CONTRACT_EXTENSIONS: ContractExtension[] = [];

export function getTableDefaultSeeds(tableName: string): any[] {
  switch (tableName) {
    case 'properties':
      return DEFAULT_PROPERTIES;
    case 'rooms':
      return DEFAULT_ROOMS;
    case 'coupons':
      return [];
    case 'settings':
      return [DEFAULT_SETTINGS];
    case 'tenants':
      return [];
    case 'surveys':
      return [];
    case 'contract_extensions':
      return [];
    case 'facilities':
      return DEFAULT_FACILITIES;
    default:
      return [];
  }
}
