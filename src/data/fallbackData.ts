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

export const DEFAULT_PROPERTIES: Property[] = [];

export const DEFAULT_ROOMS: Room[] = [];

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
