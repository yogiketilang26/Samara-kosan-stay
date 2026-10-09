// server.ts
import dotenv from "dotenv";
import fs from "fs";
import express from "express";
import path from "path";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { renderAsync } from "@resvg/resvg-js";

// src/lib/permissions.ts
var PERMISSION_RULES = [
  {
    resource: "users",
    allowedRoles: ["super", "super_admin", "owner", "anak_owner"],
    allowedActions: ["read", "create", "update", "delete"]
    // anak_owner has target role constraints evaluated by canManageRole()
  },
  {
    resource: "properties",
    allowedRoles: ["super", "super_admin", "owner", "anak_owner", "admin", "staff"],
    allowedActions: ["read", "create", "update", "delete"],
    propertyScopedRoles: ["admin", "staff"]
    // admin can CRUD own property, staff can only read
  },
  {
    resource: "rooms",
    allowedRoles: ["super", "super_admin", "owner", "anak_owner", "admin", "staff"],
    allowedActions: ["read", "create", "update", "delete"],
    propertyScopedRoles: ["admin", "staff"]
    // staff can update room status for assigned property
  },
  {
    resource: "properties_close",
    allowedRoles: ["super", "super_admin", "owner"],
    allowedActions: ["delete", "close"]
  },
  {
    resource: "bookings",
    allowedRoles: ["super", "super_admin", "owner", "anak_owner", "admin", "staff"],
    allowedActions: ["read", "create", "update", "approve"],
    propertyScopedRoles: ["admin", "staff"]
    // staff cannot approve; only submit/view
  },
  {
    resource: "journals",
    allowedRoles: ["super", "super_admin", "owner", "anak_owner", "admin", "finance"],
    allowedActions: ["read", "create", "update"],
    propertyScopedRoles: ["admin", "finance"]
  },
  {
    resource: "financial_reports",
    allowedRoles: ["super", "super_admin", "owner", "anak_owner"],
    allowedActions: ["read"]
    // anak_owner is read-only
  },
  {
    resource: "operations",
    allowedRoles: ["super", "super_admin", "owner", "anak_owner", "admin", "staff"],
    allowedActions: ["read", "create", "update", "delete"],
    propertyScopedRoles: ["admin", "staff"]
  },
  {
    resource: "pii_docs",
    allowedRoles: ["super", "super_admin", "owner", "anak_owner", "admin"],
    allowedActions: ["read"]
    // staff sees masked NIK, no unmasked documents
  },
  {
    resource: "midtrans_logs",
    allowedRoles: ["super", "super_admin", "owner", "finance"],
    allowedActions: ["read", "create", "update", "delete"]
  },
  {
    resource: "finance",
    allowedRoles: ["super", "super_admin", "owner", "finance"],
    allowedActions: ["read", "create", "update", "delete", "manage"]
  },
  {
    resource: "system_settings",
    allowedRoles: ["super", "super_admin", "owner"],
    allowedActions: ["read", "create", "update", "delete", "repair"]
  }
];
function can(role, resource, action = "read") {
  if (!role) return false;
  const cleanRole = role.trim().toLowerCase().replace(/\s+/g, "_");
  if (cleanRole === "super" || cleanRole === "super_admin") return true;
  if (resource === "midtrans_logs" && action === "delete") {
    return cleanRole === "owner";
  }
  if (resource === "bookings" && action === "approve" && cleanRole === "staff") {
    return false;
  }
  if (resource === "properties" && (action === "create" || action === "update" || action === "delete") && cleanRole === "staff") {
    return false;
  }
  if (resource === "financial_reports") {
    if (action !== "read") return cleanRole === "owner";
    return ["owner", "anak_owner"].includes(cleanRole);
  }
  if (resource === "properties_close") {
    return cleanRole === "owner";
  }
  const rule = PERMISSION_RULES.find((r) => r.resource === resource);
  if (!rule) return false;
  return rule.allowedRoles.includes(cleanRole) && rule.allowedActions.includes(action);
}
var ROLE_HIERARCHY = {
  super: 100,
  super_admin: 100,
  owner: 80,
  anak_owner: 60,
  admin: 40,
  finance: 30,
  staff: 20,
  user: 10
};
function canManageRole(actorRole, targetRole, action = "create") {
  if (!actorRole) return { allowed: false, reason: "Peran aktor tidak ditemukan." };
  const actor = actorRole.trim().toLowerCase().replace(/\s+/g, "_");
  const target = (targetRole || "user").trim().toLowerCase().replace(/\s+/g, "_");
  if (actor === "super" || actor === "super_admin") {
    return { allowed: true };
  }
  if (actor === "owner") {
    if (target === "super" || target === "super_admin") {
      return { allowed: false, reason: "Owner tidak memiliki wewenang mengelola akun Super Admin." };
    }
    return { allowed: true };
  }
  if (actor === "anak_owner") {
    if (["staff", "admin", "user"].includes(target)) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: "Anak Owner hanya memiliki wewenang untuk mengelola akun Staff, Admin, dan User."
    };
  }
  const actorWeight = ROLE_HIERARCHY[actor] || 0;
  const targetWeight = ROLE_HIERARCHY[target] || 0;
  if (targetWeight > actorWeight) {
    return {
      allowed: false,
      reason: `Akses ditolak. Peran "${actor}" tidak dapat mengelola peran "${target}" yang berada di tingkat lebih tinggi.`
    };
  }
  return { allowed: false, reason: "Anda tidak memiliki hak akses untuk mengelola pengguna." };
}
function canAssignProperty(actorRole, targetRole) {
  if (!actorRole) return { allowed: false, reason: "Peran aktor tidak ditemukan." };
  const actor = actorRole.trim().toLowerCase().replace(/\s+/g, "_");
  const target = (targetRole || "user").trim().toLowerCase().replace(/\s+/g, "_");
  if (actor === "super" || actor === "super_admin" || actor === "owner") {
    return { allowed: true };
  }
  if (actor === "anak_owner") {
    if (["staff", "admin", "user"].includes(target)) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: "Anak Owner hanya dapat mengalokasikan properti untuk Staff dan Admin cabang."
    };
  }
  return { allowed: false, reason: "Hanya Super Admin, Owner, atau Anak Owner yang dapat mengalokasikan properti." };
}
function canAccessProperty(userProfile, targetPropertyId) {
  if (!userProfile) return false;
  const role = (userProfile.role || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (["super", "super_admin", "owner", "anak_owner"].includes(role)) {
    return true;
  }
  if (["admin", "finance"].includes(role) && (userProfile.property_id === null || userProfile.property_id === void 0)) {
    return true;
  }
  if (userProfile.property_id !== null && userProfile.property_id !== void 0) {
    if (targetPropertyId === null || targetPropertyId === void 0) return false;
    return String(userProfile.property_id) === String(targetPropertyId);
  }
  if (role === "staff") {
    return false;
  }
  return false;
}
function maskNik(nik) {
  if (!nik || !String(nik).trim()) return "";
  const clean = String(nik).trim();
  if (clean.length < 4) return "****";
  return clean.substring(0, 4) + "*".repeat(Math.max(0, clean.length - 4));
}

// src/data/fallbackData.ts
var DEFAULT_FACILITIES = [
  { id: 1, name: "WiFi Kecepatan Tinggi (Biznet)", icon: "Wifi", category: "general", description: "Koneksi internet fiber optik 100 Mbps di seluruh area" },
  { id: 2, name: "AC Daikin Inverter", icon: "Wind", category: "room", description: "Hemat daya dan pendinginan maksimal di tiap kamar" },
  { id: 3, name: "Water Heater Tenaga Surya", icon: "Zap", category: "room", description: "Air hangat 24 jam untuk kenyamanan relaksasi mandi" },
  { id: 4, name: "Kamar Mandi Dalam", icon: "Droplet", category: "room", description: "Kamar mandi pribadi dilengkapi shower dan toilet duduk" },
  { id: 5, name: "CCTV & Akses Kartu 24 Jam", icon: "Shield", category: "property", description: "Keamanan ketat dengan pengawasan CCTV & kunci pintu digital" },
  { id: 6, name: "Dapur & Kulkas Bersama", icon: "Utensils", category: "property", description: "Dapur bersih dilengkapi kompor gas, kulkas, dan microwave" },
  { id: 7, name: "Parkir Motor & Mobil", icon: "Car", category: "property", description: "Area parkir luas dengan atap pelindung kanopi aman" },
  { id: 8, name: "Smart TV & Meja Kerja", icon: "Tv", category: "room", description: "Perlengkapan lengkap untuk kenyamanan kerja dan hiburan" },
  { id: 9, name: "Area Jemuran Beratap", icon: "Sun", category: "property", description: "Area penjemuran pakaian yang lapang dengan sirkulasi udara baik" },
  { id: 10, name: "Housekeeping Area Publik", icon: "Sparkles", category: "property", description: "Pembersihan area komunal teratur setiap hari" }
];
var DEFAULT_PROPERTIES = [
  {
    id: 1,
    name: "Samara Stay Salemba UI",
    address: "Jl. Salemba Raya No. 4, Senen, Jakarta Pusat",
    price: 22e5,
    type: "campur",
    total_rooms: 18,
    available_rooms: 7,
    deposit_amount: 5e5,
    lat: -6.195621,
    lng: 106.848815,
    image_url: "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80",
    images: [
      "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80"
    ],
    facilities: DEFAULT_FACILITIES.slice(0, 7),
    description: "Kost eksklusif dekat Fakultas Kedokteran UI Salemba & RS Cipto Mangunkusumo. Dilengkapi kamar mandi dalam, AC, WiFi cepat, dan keamanan 24 jam.",
    policies: "1. Tamu dilarang menginap tanpa izin pengelola.\n2. Wajib menjaga ketenangan setelah pukul 22:00 WIB.\n3. Dilarang merokok di dalam kamar ber-AC."
  },
  {
    id: 2,
    name: "Samara Stay Pasar Minggu",
    address: "Jl. Raya Ragunan No. 12, Pasar Minggu, Jakarta Selatan",
    price: 195e4,
    type: "putra",
    total_rooms: 14,
    available_rooms: 5,
    deposit_amount: 5e5,
    lat: -6.2843,
    lng: 106.8436,
    image_url: "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=800&q=80",
    images: [
      "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80"
    ],
    facilities: [DEFAULT_FACILITIES[0], DEFAULT_FACILITIES[1], DEFAULT_FACILITIES[3], DEFAULT_FACILITIES[4], DEFAULT_FACILITIES[5], DEFAULT_FACILITIES[6]],
    description: "Hunian nyaman khusus putra, hanya 5 menit jalan kaki dari Stasiun KRL Pasar Minggu. Akses cepat ke TB Simatupang & Pancoran.",
    policies: "1. Khusus penghuni putra.\n2. Parkir motor dan mobil tersedia beratap kanopi."
  },
  {
    id: 3,
    name: "Samara Stay Jagakarsa UI",
    address: "Jl. Moh. Kahfi II No. 45, Jagakarsa, Jakarta Selatan",
    price: 175e4,
    type: "putri",
    total_rooms: 16,
    available_rooms: 6,
    deposit_amount: 5e5,
    lat: -6.3421,
    lng: 106.8285,
    image_url: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80",
    images: [
      "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80"
    ],
    facilities: [DEFAULT_FACILITIES[0], DEFAULT_FACILITIES[1], DEFAULT_FACILITIES[2], DEFAULT_FACILITIES[3], DEFAULT_FACILITIES[4], DEFAULT_FACILITIES[5]],
    description: "Kost putri asri dan tenang di dekat Kampus UI Depok & ISTN Jagakarsa. Suasana nyaman belajar dengan sistem kartu akses keamanan.",
    policies: "1. Khusus penghuni putri.\n2. Gerbang utama dikunci pukul 23:00 WIB (akses darurat tersedia melalui kartu jaga)."
  }
];
var DEFAULT_ROOMS = [
  // Samara Stay Salemba UI (Property 1)
  {
    id: 101,
    property_id: 1,
    room_number: "101",
    room_type: "Standard",
    price: 22e5,
    size_sqm: 14,
    floor: 1,
    status: "available",
    facilities: [DEFAULT_FACILITIES[0], DEFAULT_FACILITIES[1], DEFAULT_FACILITIES[3]],
    image_url: "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80",
    images: ["https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80"],
    is_daily_enabled: true,
    daily_price: 175e3
  },
  {
    id: 102,
    property_id: 1,
    room_number: "102",
    room_type: "Deluxe",
    price: 25e5,
    size_sqm: 18,
    floor: 1,
    status: "available",
    facilities: [DEFAULT_FACILITIES[0], DEFAULT_FACILITIES[1], DEFAULT_FACILITIES[2], DEFAULT_FACILITIES[3], DEFAULT_FACILITIES[7]],
    image_url: "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=800&q=80",
    images: ["https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=800&q=80"],
    is_daily_enabled: true,
    daily_price: 2e5
  },
  {
    id: 103,
    property_id: 1,
    room_number: "103",
    room_type: "Standard",
    price: 22e5,
    size_sqm: 14,
    floor: 1,
    status: "occupied",
    current_tenant_name: "Dimas Arya Pratama",
    facilities: [DEFAULT_FACILITIES[0], DEFAULT_FACILITIES[1], DEFAULT_FACILITIES[3]],
    image_url: "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80",
    is_daily_enabled: false,
    daily_price: 175e3
  },
  {
    id: 201,
    property_id: 1,
    room_number: "201",
    room_type: "Deluxe",
    price: 25e5,
    size_sqm: 18,
    floor: 2,
    status: "available",
    facilities: [DEFAULT_FACILITIES[0], DEFAULT_FACILITIES[1], DEFAULT_FACILITIES[2], DEFAULT_FACILITIES[3]],
    image_url: "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=800&q=80",
    is_daily_enabled: true,
    daily_price: 2e5
  },
  {
    id: 202,
    property_id: 1,
    room_number: "202",
    room_type: "Premium",
    price: 285e4,
    size_sqm: 22,
    floor: 2,
    status: "available",
    facilities: [DEFAULT_FACILITIES[0], DEFAULT_FACILITIES[1], DEFAULT_FACILITIES[2], DEFAULT_FACILITIES[3], DEFAULT_FACILITIES[7]],
    image_url: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80",
    is_daily_enabled: true,
    daily_price: 23e4
  },
  // Samara Stay Pasar Minggu (Property 2)
  {
    id: 301,
    property_id: 2,
    room_number: "101",
    room_type: "Standard",
    price: 195e4,
    size_sqm: 14,
    floor: 1,
    status: "available",
    facilities: [DEFAULT_FACILITIES[0], DEFAULT_FACILITIES[1], DEFAULT_FACILITIES[3]],
    image_url: "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80",
    is_daily_enabled: true,
    daily_price: 16e4
  },
  {
    id: 302,
    property_id: 2,
    room_number: "102",
    room_type: "Deluxe",
    price: 22e5,
    size_sqm: 16,
    floor: 1,
    status: "available",
    facilities: [DEFAULT_FACILITIES[0], DEFAULT_FACILITIES[1], DEFAULT_FACILITIES[2], DEFAULT_FACILITIES[3]],
    image_url: "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=800&q=80",
    is_daily_enabled: true,
    daily_price: 18e4
  },
  {
    id: 303,
    property_id: 2,
    room_number: "202",
    room_type: "Deluxe",
    price: 22e5,
    size_sqm: 16,
    floor: 2,
    status: "occupied",
    current_tenant_name: "Rian Hidayat",
    facilities: [DEFAULT_FACILITIES[0], DEFAULT_FACILITIES[1], DEFAULT_FACILITIES[3]],
    image_url: "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=800&q=80",
    is_daily_enabled: false,
    daily_price: 18e4
  },
  // Samara Stay Jagakarsa UI (Property 3)
  {
    id: 401,
    property_id: 3,
    room_number: "101",
    room_type: "Standard",
    price: 175e4,
    size_sqm: 12,
    floor: 1,
    status: "available",
    facilities: [DEFAULT_FACILITIES[0], DEFAULT_FACILITIES[1], DEFAULT_FACILITIES[3]],
    image_url: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80",
    is_daily_enabled: true,
    daily_price: 15e4
  },
  {
    id: 402,
    property_id: 3,
    room_number: "102",
    room_type: "Deluxe",
    price: 2e6,
    size_sqm: 15,
    floor: 1,
    status: "available",
    facilities: [DEFAULT_FACILITIES[0], DEFAULT_FACILITIES[1], DEFAULT_FACILITIES[2], DEFAULT_FACILITIES[3]],
    image_url: "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80",
    is_daily_enabled: true,
    daily_price: 17e4
  }
];
var DEFAULT_SETTINGS = {
  id: 1,
  booking_rules: "1. Tamu dilarang membawa lawan jenis masuk ke dalam kamar tidur.\n2. Menjaga ketenangan dan kenyamanan bersama setelah pukul 22:00 WIB.\n3. Uang sewa bulanan dibayarkan tepat waktu sebelum jatuh tempo.\n4. Deposit jaminan dikembalikan utuh saat masa sewa selesai dan serah terima unit.",
  survey_rules: "1. Jadwal survey dibuka setiap hari kerja pukul 09:00 - 17:00 WIB.\n2. Pembayaran DP Survey Rp 500.000 berlaku sebagai tanda jadi dan memotong biaya sewa bulan pertama.",
  standard_facilities: JSON.stringify(DEFAULT_FACILITIES.map((f) => ({
    id: f.id,
    icon: f.icon || "Sparkles",
    title: f.name,
    subtitle: f.description || "",
    category: f.category || "general"
  }))),
  why_choose_us: JSON.stringify([
    "Standar Kebersihan Terjaga (Layanan kebersihan area umum & fasilitas terjaga)",
    "CCTV 24 Jam & Sistem Akses Pintu Pintar di Area Umum",
    "Maintenance Cepat Tanggap (< 24 Jam untuk perbaikan fasilitas)",
    "Admin Responsif via WhatsApp untuk kemudahan komunikasi",
    "Pembayaran Digital Aman & Terverifikasi Otomatis",
    "Kontrak Transparan Tanpa Biaya Tersembunyi"
  ]),
  faqs: JSON.stringify([
    { question: "Bagaimana cara booking kamar di Samara Stay?", answer: "Pilih kamar yang diinginkan di website, tentukan tanggal mulai sewa, dan selesaikan pembayaran DP atau pelunasan dengan sistem pembayaran digital otomatis terintegrasi.", q: "Bagaimana cara booking kamar di Samara Stay?", a: "Pilih kamar yang diinginkan di website, tentukan tanggal mulai sewa, dan selesaikan pembayaran DP atau pelunasan dengan sistem pembayaran digital otomatis terintegrasi." },
    { question: "Apakah boleh survey lokasi terlebih dahulu?", answer: "Tentu! Anda dapat memilih menu Jadwalkan Survey dan menentukan tanggal serta jam survey yang Anda inginkan.", q: "Apakah boleh survey lokasi terlebih dahulu?", a: "Tentu! Anda dapat memilih menu Jadwalkan Survey dan menentukan tanggal serta jam survey yang Anda inginkan." },
    { question: "Kapan uang deposit dikembalikan?", answer: "Uang deposit akan ditransfer kembali maksimal 1x24 jam setelah proses checkout dan verifikasi kondisi kamar selesai tanpa kerusakan.", q: "Kapan uang deposit dikembalikan?", a: "Uang deposit akan ditransfer kembali maksimal 1x24 jam setelah proses checkout dan verifikasi kondisi kamar selesai tanpa kerusakan." },
    { question: "Apakah ada biaya tambahan bulanan?", answer: "Biaya sewa sudah mencakup listrik dan air standar, serta pembersihan area bersama tanpa biaya tersembunyi.", q: "Apakah ada biaya tambahan bulanan?", a: "Biaya sewa sudah mencakup listrik dan air standar, serta pembersihan area bersama tanpa biaya tersembunyi." }
  ]),
  owner_signature_url: "https://eniwbzpfvwtbsonmnzzr.supabase.co/storage/v1/object/public/signatures/owner_official_signature.png"
};
function getTableDefaultSeeds(tableName) {
  switch (tableName) {
    case "properties":
      return DEFAULT_PROPERTIES;
    case "rooms":
      return DEFAULT_ROOMS;
    case "coupons":
      return [];
    case "settings":
      return [DEFAULT_SETTINGS];
    case "tenants":
      return [];
    case "surveys":
      return [];
    case "contract_extensions":
      return [];
    case "facilities":
      return DEFAULT_FACILITIES;
    default:
      return [];
  }
}

// server.ts
var createViteServerFn = null;
dotenv.config();
var rateLimits = {};
setInterval(() => {
  const now = Date.now();
  for (const ip in rateLimits) {
    if (rateLimits[ip].resetTime < now) {
      delete rateLimits[ip];
    }
  }
}, 10 * 60 * 1e3);
function apiRateLimiter(windowMs, maxRequests) {
  return (req, res, next) => {
    const ip = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1";
    const now = Date.now();
    if (!rateLimits[ip]) {
      rateLimits[ip] = { count: 1, resetTime: now + windowMs };
      return next();
    }
    const limit = rateLimits[ip];
    if (now > limit.resetTime) {
      limit.count = 1;
      limit.resetTime = now + windowMs;
      return next();
    }
    limit.count++;
    if (limit.count > maxRequests) {
      return res.status(429).json({
        success: false,
        error: "Too many requests, please try again later."
      });
    }
    next();
  };
}
function getServiceRoleKeyOrThrow() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || "";
  if (serviceKey && serviceKey !== "YOUR_SERVICE_ROLE_KEY_HERE") {
    return serviceKey;
  }
  const fallbackService = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.VITE_SUPABASE_SECRET_KEY || "";
  if (fallbackService && fallbackService !== "YOUR_SERVICE_ROLE_KEY_HERE") {
    return fallbackService;
  }
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
  if (anonKey && anonKey !== "YOUR_SUPABASE_ANON_KEY_HERE") {
    return anonKey;
  }
  throw new Error("Supabase Key (SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY) is required for server administrative operations but not found in environment.");
}
async function recordFailedLedgerPosting(supabaseClient, params) {
  try {
    await supabaseClient.from("failed_ledger_postings").insert({
      transaction_no: params.transaction_no || null,
      reference_type: params.reference_type,
      reference_id: String(params.reference_id),
      amount: Number(params.amount || 0),
      debit_account_id: params.debit_account_id,
      credit_account_id: params.credit_account_id,
      property_id: params.property_id || null,
      created_by: params.created_by || "System",
      error_message: params.error_message || "Posting failed",
      status: "pending"
    });
  } catch (auditErr) {
    console.warn("[FAILED LEDGER POSTING AUDIT] Could not record to failed_ledger_postings table:", auditErr);
  }
}
var CRITICAL_COA_ACCOUNTS = [
  { id: 1e3, name: "Kas Tunai / Cash on Hand", type: "asset", category: "Kas & Bank" },
  { id: 1010, name: "Kas Utama Bank Mandiri (Operasional)", type: "asset", category: "Kas & Bank" },
  { id: 1020, name: "Bank Penampung Midtrans Escrow", type: "asset", category: "Kas & Bank" },
  { id: 1200, name: "Piutang Kliring Midtrans (Gateway Clearing)", type: "asset", category: "Piutang & Kliring" },
  { id: 1300, name: "Hutang Titipan Uang Muka / Deposit Survey", type: "liability", category: "Kewajiban Jangka Pendek" },
  { id: 2e3, name: "Hutang Usaha / Vendor Payable", type: "liability", category: "Kewajiban Jangka Pendek" },
  { id: 2100, name: "Hutang Deposit Jaminan Sewa (Security Deposit)", type: "liability", category: "Kewajiban Jangka Pendek" },
  { id: 3e3, name: "Modal Pemilik / Modal Disetor", type: "equity", category: "Ekuitas" },
  { id: 3100, name: "Laba Ditahan / Retained Earnings", type: "equity", category: "Ekuitas" },
  { id: 4e3, name: "Pendapatan Sewa Kamar Kos", type: "revenue", category: "Pendapatan Utama" },
  { id: 4100, name: "Pendapatan Denda & Keterlambatan", type: "revenue", category: "Pendapatan Lain-lain" },
  { id: 4200, name: "Pendapatan DP Survey Hangus", type: "revenue", category: "Pendapatan Lain-lain" },
  { id: 4300, name: "Pendapatan Laundry & Layanan Tambahan", type: "revenue", category: "Pendapatan Lain-lain" },
  { id: 5e3, name: "Beban Listrik, Air & Utilitas", type: "expense", category: "Beban Operasional" },
  { id: 5010, name: "Beban Internet & WiFi", type: "expense", category: "Beban Operasional" },
  { id: 5020, name: "Beban Kebersihan & Sampah", type: "expense", category: "Beban Operasional" },
  { id: 5030, name: "Biaya Layanan Midtrans / Payment Gateway", type: "expense", category: "Beban Operasional" },
  { id: 5100, name: "Beban Pemeliharaan & Perbaikan Gedung", type: "expense", category: "Beban Operasional" },
  { id: 5200, name: "Beban Gaji Karyawan & Penjaga Kos", type: "expense", category: "Beban Operasional" },
  { id: 5300, name: "Beban Pemasaran & Iklan Properti", type: "expense", category: "Beban Operasional" },
  { id: 5400, name: "Beban Perlengkapan & Operasional Kantor", type: "expense", category: "Beban Operasional" }
];
var lastCoaVerificationTime = 0;
var lastCoaVerificationStatus = null;
async function verifyAndEnsureCriticalCOA(supabaseClient, autoRepair = true, forceCheck = false) {
  const now = Date.now();
  if (!forceCheck && lastCoaVerificationStatus?.healthy && now - lastCoaVerificationTime < 6e4) {
    return lastCoaVerificationStatus;
  }
  try {
    const { data: existingAccounts, error: fetchErr } = await supabaseClient.from("accounts").select("id, name, type, category, balance");
    if (fetchErr) {
      console.warn("[COA DIAGNOSTIC] Error fetching accounts from database:", fetchErr.message);
      return {
        healthy: false,
        error: fetchErr.message,
        totalChecked: CRITICAL_COA_ACCOUNTS.length,
        existingCount: 0,
        missingCount: CRITICAL_COA_ACCOUNTS.length,
        missingAccounts: CRITICAL_COA_ACCOUNTS,
        repairedCount: 0,
        repairedAccounts: [],
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
    }
    const existingMap = /* @__PURE__ */ new Map();
    (existingAccounts || []).forEach((acc) => existingMap.set(Number(acc.id), acc));
    const missingAccounts = [];
    const accountsStatus = [];
    for (const critical of CRITICAL_COA_ACCOUNTS) {
      const existing = existingMap.get(critical.id);
      if (!existing) {
        missingAccounts.push(critical);
        accountsStatus.push({
          id: critical.id,
          name: critical.name,
          type: critical.type,
          category: critical.category,
          exists: false
        });
      } else {
        accountsStatus.push({
          id: critical.id,
          name: existing.name || critical.name,
          type: existing.type || critical.type,
          category: existing.category || critical.category,
          exists: true,
          balance: Number(existing.balance) || 0
        });
      }
    }
    const repairedAccounts = [];
    if (missingAccounts.length > 0 && autoRepair) {
      console.log(`[COA DIAGNOSTIC] Missing ${missingAccounts.length} critical COA accounts. Auto-repairing...`);
      for (const missing of missingAccounts) {
        const payload = {
          id: missing.id,
          name: missing.name,
          type: missing.type,
          category: missing.category,
          balance: 0
        };
        let { error: insertErr } = await supabaseClient.from("accounts").upsert(payload, { onConflict: "id" });
        if (insertErr && (insertErr.message.includes("category") || insertErr.message.includes("column"))) {
          const fallbackPayload = {
            id: missing.id,
            name: missing.name,
            type: missing.type,
            balance: 0
          };
          const retryRes = await supabaseClient.from("accounts").upsert(fallbackPayload, { onConflict: "id" });
          insertErr = retryRes.error;
        }
        if (!insertErr) {
          repairedAccounts.push(missing);
          const target = accountsStatus.find((a) => a.id === missing.id);
          if (target) {
            target.exists = true;
            target.balance = 0;
          }
        } else {
          if (insertErr.message.includes("row-level security policy")) {
            console.warn(`[COA DIAGNOSTIC] Auto-repair for account ${missing.id} (${missing.name}) was blocked by Supabase RLS. Please ensure SUPABASE_SERVICE_ROLE_KEY is configured or run the COA seed SQL in Supabase SQL Editor.`);
          } else {
            console.error(`[COA DIAGNOSTIC] Failed to auto-repair account ${missing.id} (${missing.name}):`, insertErr.message);
          }
        }
      }
    }
    const isHealthy = missingAccounts.length === 0 || autoRepair && repairedAccounts.length === missingAccounts.length;
    const result = {
      healthy: isHealthy,
      totalChecked: CRITICAL_COA_ACCOUNTS.length,
      existingCount: existingMap.size + repairedAccounts.length,
      missingCount: isHealthy ? 0 : missingAccounts.length - repairedAccounts.length,
      missingAccounts: isHealthy ? [] : missingAccounts.filter((m) => !repairedAccounts.some((r) => r.id === m.id)),
      repairedCount: repairedAccounts.length,
      repairedAccounts,
      accountsStatus,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    lastCoaVerificationTime = now;
    lastCoaVerificationStatus = result;
    return result;
  } catch (err) {
    console.error("[COA DIAGNOSTIC] Exception during COA verification:", err);
    return {
      healthy: false,
      error: err.message || "Unknown exception in verifyAndEnsureCriticalCOA",
      totalChecked: CRITICAL_COA_ACCOUNTS.length,
      existingCount: 0,
      missingCount: CRITICAL_COA_ACCOUNTS.length,
      missingAccounts: CRITICAL_COA_ACCOUNTS,
      repairedCount: 0,
      repairedAccounts: [],
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
}
async function runAccountingIntegrityAudit(supabaseClient) {
  try {
    const { data: rpcData, error: rpcErr } = await supabaseClient.rpc("audit_accounting_integrity");
    if (!rpcErr && rpcData) {
      console.log(`[ACCOUNTING INTEGRITY AUDIT] RPC executed successfully. Score: ${rpcData.integrityScore}/100`);
      return rpcData;
    }
    if (rpcErr) {
      console.warn("[ACCOUNTING INTEGRITY AUDIT] RPC fallback to Node.js calculation engine:", rpcErr.message);
    }
    const [accRes, ftRes, jeRes, clrRes] = await Promise.all([
      supabaseClient.from("accounts").select("*"),
      supabaseClient.from("financial_transactions").select("*"),
      supabaseClient.from("journal_entries").select("*"),
      supabaseClient.from("midtrans_clearing_transactions").select("*")
    ]);
    const accounts = accRes.data || [];
    const transactions = ftRes.data || [];
    const journals = jeRes.data || [];
    const clearings = clrRes.data || [];
    const totalAccounts = accounts.length;
    const totalTransactions = transactions.length;
    const totalJournals = journals.length;
    const totalClearing = clearings.length;
    let integrityScore = 100;
    const journalGroups = {};
    for (const j of journals) {
      const key = j.journal_no || `TRX-${j.transaction_id}`;
      if (!journalGroups[key]) {
        journalGroups[key] = { debit: 0, credit: 0, journal_no: j.journal_no, transaction_id: j.transaction_id };
      }
      journalGroups[key].debit += Number(j.debit || 0);
      journalGroups[key].credit += Number(j.credit || 0);
    }
    const unbalancedJournals = [];
    for (const [key, val] of Object.entries(journalGroups)) {
      const diff = Math.abs(val.debit - val.credit);
      if (diff > 0.01) {
        unbalancedJournals.push({
          journal_no: val.journal_no,
          transaction_id: val.transaction_id,
          total_debit: val.debit,
          total_credit: val.credit,
          diff
        });
      }
    }
    if (unbalancedJournals.length > 0) {
      integrityScore -= unbalancedJournals.length * 15;
    }
    const accountCalculated = {};
    for (const a of accounts) {
      accountCalculated[a.id] = { debit: 0, credit: 0 };
    }
    for (const j of journals) {
      if (accountCalculated[j.account_id]) {
        accountCalculated[j.account_id].debit += Number(j.debit || 0);
        accountCalculated[j.account_id].credit += Number(j.credit || 0);
      }
    }
    const balanceVariances = [];
    let totalVariance = 0;
    for (const a of accounts) {
      const mutasi = accountCalculated[a.id] || { debit: 0, credit: 0 };
      const isNormalDebit = a.type === "asset" || a.type === "expense";
      const computedBalance = isNormalDebit ? mutasi.debit - mutasi.credit : mutasi.credit - mutasi.debit;
      const storedBalance = Number(a.balance || 0);
      const variance = storedBalance - computedBalance;
      if (Math.abs(variance) > 0.01) {
        balanceVariances.push({
          account_id: a.id,
          account_name: a.name,
          type: a.type,
          stored_balance: storedBalance,
          computed_balance: computedBalance,
          variance
        });
        totalVariance += Math.abs(variance);
      }
    }
    if (balanceVariances.length > 0) {
      integrityScore -= balanceVariances.length * 5;
    }
    const accountIdSet = new Set(accounts.map((a) => a.id));
    const orphanedJournals = journals.filter((j) => !accountIdSet.has(j.account_id));
    const trxIdWithJournals = new Set(journals.map((j) => j.transaction_id));
    const orphanedTransactions = transactions.filter((t) => !trxIdWithJournals.has(t.id));
    const totalOrphans = orphanedJournals.length + orphanedTransactions.length;
    if (totalOrphans > 0) {
      integrityScore -= totalOrphans * 10;
    }
    const missingPropertyTrx = transactions.filter(
      (t) => !t.property_id && ["Penerimaan Sewa", "Beban Operasional Kos", "DP Survey / Reservasi"].includes(t.category)
    );
    const totalClearingGross = clearings.reduce((sum, c) => sum + Number(c.gross_amount || 0), 0);
    const totalClearingOutstanding = clearings.reduce((sum, c) => sum + Number(c.outstanding_amount || 0), 0);
    const acc1200 = accounts.find((a) => a.id === 1200);
    const acc1200Balance = Number(acc1200?.balance || 0);
    const clearingVariance = Math.abs(totalClearingOutstanding - acc1200Balance);
    if (integrityScore < 0) integrityScore = 0;
    let overallStatus = "healthy";
    if (integrityScore === 100) overallStatus = "healthy";
    else if (integrityScore >= 70) overallStatus = "warning";
    else overallStatus = "critical";
    return {
      overallStatus,
      integrityScore,
      auditTimestamp: (/* @__PURE__ */ new Date()).toISOString(),
      totalTransactionsChecked: totalTransactions,
      totalJournalEntriesChecked: totalJournals,
      totalAccountsChecked: totalAccounts,
      totalClearingRecordsChecked: totalClearing,
      checks: [
        {
          id: "CHK-01-DOUBLE-ENTRY",
          name: "Keseimbangan Double-Entry (Debit == Credit)",
          category: "double_entry",
          status: unbalancedJournals.length === 0 ? "passed" : "failed",
          severity: "critical",
          details: unbalancedJournals.length === 0 ? `Seluruh ${totalJournals} baris jurnal umum seimbang sempurna (Debit = Kredit).` : `Ditemukan ${unbalancedJournals.length} transaksi jurnal tidak seimbang.`,
          recordsAnalyzed: totalJournals,
          discrepancyCount: unbalancedJournals.length,
          sampleDiscrepancies: unbalancedJournals,
          autoRepairable: false
        },
        {
          id: "CHK-02-ACCOUNT-BALANCES",
          name: "Konsistensi Saldo Rekening COA vs Mutasi Jurnal",
          category: "account_balance",
          status: balanceVariances.length === 0 ? "passed" : "warning",
          severity: "high",
          details: balanceVariances.length === 0 ? `Semua saldo tersimpan pada ${totalAccounts} rekening COA sinkron 100% dengan akumulasi mutasi jurnal.` : `Ditemukan selisih saldo pada ${balanceVariances.length} rekening COA sebesar Rp ${totalVariance.toLocaleString("id-ID")}.`,
          recordsAnalyzed: totalAccounts,
          discrepancyCount: balanceVariances.length,
          sampleDiscrepancies: balanceVariances,
          autoRepairable: true
        },
        {
          id: "CHK-03-ORPHANED-RECORDS",
          name: "Integritas Relasi Buku Besar (Orphaned Record Scanner)",
          category: "orphan_records",
          status: totalOrphans === 0 ? "passed" : "failed",
          severity: "high",
          details: totalOrphans === 0 ? "Tidak ada entri jurnal atau transaksi tanpa induk / rekening COA valid." : `Ditemukan ${orphanedJournals.length} jurnal tanpa COA dan ${orphanedTransactions.length} transaksi tanpa jurnal.`,
          recordsAnalyzed: totalTransactions + totalJournals,
          discrepancyCount: totalOrphans,
          autoRepairable: true
        },
        {
          id: "CHK-04-PROPERTY-DIMENSION",
          name: "Kelengkapan Dimensi Finansial Properti (Multi-Unit)",
          category: "property_dimension",
          status: missingPropertyTrx.length === 0 ? "passed" : "warning",
          severity: "medium",
          details: missingPropertyTrx.length === 0 ? "Semua transaksi operasional kos memiliki penanda property_id yang valid." : `Terdapat ${missingPropertyTrx.length} transaksi operasional tanpa asosiasi properti.`,
          recordsAnalyzed: totalTransactions,
          discrepancyCount: missingPropertyTrx.length,
          autoRepairable: true
        },
        {
          id: "CHK-05-CLEARING-SYNC",
          name: "Sinkronisasi Kliring Midtrans (Akun 1200 vs Outstanding Clearing)",
          category: "clearing_sync",
          status: clearingVariance < 1 ? "passed" : "warning",
          severity: "medium",
          details: `Total Outstanding Kliring: Rp ${totalClearingOutstanding.toLocaleString("id-ID")} | Saldo Akun 1200: Rp ${acc1200Balance.toLocaleString("id-ID")}`,
          recordsAnalyzed: totalClearing,
          discrepancyCount: clearingVariance < 1 ? 0 : 1,
          autoRepairable: true
        }
      ],
      summary: {
        passedChecks: (unbalancedJournals.length === 0 ? 1 : 0) + (balanceVariances.length === 0 ? 1 : 0) + (totalOrphans === 0 ? 1 : 0) + (missingPropertyTrx.length === 0 ? 1 : 0) + (clearingVariance < 1 ? 1 : 0),
        warningChecks: (balanceVariances.length > 0 ? 1 : 0) + (missingPropertyTrx.length > 0 ? 1 : 0) + (clearingVariance >= 1 ? 1 : 0),
        failedChecks: (unbalancedJournals.length > 0 ? 1 : 0) + (totalOrphans > 0 ? 1 : 0),
        totalDiscrepancies: unbalancedJournals.length + balanceVariances.length + totalOrphans + missingPropertyTrx.length,
        debitCreditImbalance: unbalancedJournals.length,
        balanceVarianceTotal: totalVariance,
        orphanedRecordsCount: totalOrphans
      },
      recommendations: integrityScore === 100 ? ["Integritas pembukuan dalam kondisi optimal. Siap untuk proses penutupan periode (Period Closing) dan pelaporan keuangan."] : [
        "Jalankan prosedur perbaikan otomatis untuk menyinkronkan saldo akun COA dengan riwayat jurnal.",
        "Periksa kembali pencatatan jurnal manual yang memiliki selisih debit/kredit."
      ]
    };
  } catch (err) {
    console.error("[ACCOUNTING INTEGRITY AUDIT] Calculation error:", err);
    throw err;
  }
}
async function startServer() {
  const app = express();
  app.use(express.json());
  if (process.env.ALLOW_DEV_AUTH_BYPASS === "true" && process.env.NODE_ENV === "production") {
    throw new Error("FATAL SECURITY ERROR: ALLOW_DEV_AUTH_BYPASS cannot be set to true when NODE_ENV is production!");
  }
  try {
    getServiceRoleKeyOrThrow();
    console.log("[SERVER BOOT] Supabase Service Role Key verified successfully.");
  } catch (err) {
    console.warn("================================================================");
    console.warn("[SERVER BOOT WARNING] SUPABASE_SERVICE_ROLE_KEY is not configured in environment!");
    console.warn("Administrative operations, double-entry postings, and Webhook reconciliations require this key.");
    console.warn("================================================================");
  }
  (async () => {
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const serviceKey = getServiceRoleKeyOrThrow();
      if (supabaseUrl && serviceKey) {
        const client = createClient(supabaseUrl, serviceKey);
        const res = await verifyAndEnsureCriticalCOA(client, true, true);
        console.log(`[STARTUP COA AUDIT] Status: ${res.healthy ? "HEALTHY" : "WARNING"}, Accounts Checked: ${res.totalChecked}, Existing: ${res.existingCount}, Auto-Repaired: ${res.repairedCount}`);
      }
    } catch (e) {
      console.warn("[STARTUP COA AUDIT] Non-blocking startup audit notice:", e?.message || e);
    }
  })();
  const PORT = Number(process.env.PORT) || 3e3;
  function getSuperAdminEmails() {
    const envEmails = process.env.SUPER_ADMIN_EMAILS;
    if (envEmails) {
      return envEmails.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
    }
    if (process.env.STRICT_WHITELIST_ENV === "true") {
      return [];
    }
    return ["admin@samarastay.co.id", "superadmin@samarastay.co.id"];
  }
  function getOwnerEmails() {
    const envEmails = process.env.OWNER_EMAILS;
    if (envEmails) {
      return envEmails.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
    }
    if (process.env.STRICT_WHITELIST_ENV === "true") {
      return [];
    }
    return ["owner@samarastay.co.id"];
  }
  function getAnakOwnerEmails() {
    const envEmails = process.env.ANAK_OWNER_EMAILS;
    if (envEmails) {
      return envEmails.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
    }
    if (process.env.STRICT_WHITELIST_ENV === "true") {
      return [];
    }
    return ["anakowner@samarastay.co.id"];
  }
  function isSuperAdminEmail(email) {
    const clean = (email || "").trim().toLowerCase();
    return getSuperAdminEmails().includes(clean);
  }
  function isOwnerEmail(email) {
    const clean = (email || "").trim().toLowerCase();
    return getOwnerEmails().includes(clean);
  }
  function isAnakOwnerEmail(email) {
    const clean = (email || "").trim().toLowerCase();
    return getAnakOwnerEmails().includes(clean);
  }
  function isEmailConfirmationEnforced() {
    const envVal = process.env.REQUIRE_EMAIL_CONFIRMED || process.env.REQUIRE_EMAIL_CONFIRMATION;
    if (envVal !== void 0 && envVal.trim() !== "") {
      return envVal.trim().toLowerCase() === "true";
    }
    return process.env.NODE_ENV === "production";
  }
  function resolveEffectiveRole(userData, email, emailConfirmed = true) {
    const cleanEmail = (email || "").trim().toLowerCase();
    if (emailConfirmed) {
      if (isSuperAdminEmail(cleanEmail)) return "super";
      if (isOwnerEmail(cleanEmail)) return "owner";
      if (isAnakOwnerEmail(cleanEmail)) return "anak_owner";
    }
    const role = (userData?.role || "").trim().toLowerCase();
    if (role === "anak_owner" || role === "anak owner") {
      return "anak_owner";
    }
    if (process.env.RBAC_V2_ENABLED !== "true") {
      const accessStr = String(userData?.access || "").toLowerCase();
      if (role === "admin" && accessStr.includes("anak owner")) {
        return "anak_owner";
      }
    }
    return userData?.role || "user";
  }
  function checkPropertyAccess(authProfile, targetPropertyId) {
    if (!canAccessProperty(authProfile, targetPropertyId)) {
      const role = authProfile?.role;
      if (role === "staff" && (authProfile?.property_id === null || authProfile?.property_id === void 0)) {
        return { allowed: false, reason: "Akun Staff belum ditugaskan ke properti mana pun. Hubungi Super Admin." };
      }
      return { allowed: false, reason: `Akses ditolak. Peran Anda (${role}) tidak berwenang mengakses Properti ID ${targetPropertyId ?? "Global"}.` };
    }
    return { allowed: true };
  }
  function enforcePropertyScope(req, res, propertyId) {
    const authProfile = req.authProfile;
    if (!authProfile) {
      res.status(401).json({ success: false, error: "Akses ditolak. Profil pengguna tidak teridentifikasi." });
      return false;
    }
    const check = checkPropertyAccess(authProfile, propertyId);
    if (!check.allowed) {
      res.status(403).json({ success: false, error: check.reason || "Akses ditolak ke properti ini." });
      return false;
    }
    return true;
  }
  async function findAuthUserByEmail(adminClient, email) {
    const cleanEmail = (email || "").trim().toLowerCase();
    if (!cleanEmail) return null;
    try {
      const { data: dbUser } = await adminClient.from("users").select("id, email, full_name, role").eq("email", cleanEmail).maybeSingle();
      if (dbUser?.id) {
        return { id: dbUser.id, email: dbUser.email, user_metadata: { full_name: dbUser.full_name }, role: dbUser.role };
      }
    } catch (e) {
    }
    try {
      let page = 1;
      const perPage = 1e3;
      while (true) {
        const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
        if (error || !data?.users || data.users.length === 0) break;
        const found = data.users.find((u) => (u.email || "").trim().toLowerCase() === cleanEmail);
        if (found) return found;
        if (data.users.length < perPage) break;
        page++;
      }
    } catch (err) {
      console.warn("[findAuthUserByEmail] listUsers notice:", err);
    }
    return null;
  }
  const loginFailuresMap = /* @__PURE__ */ new Map();
  const MAX_FAILED_LOGIN_ATTEMPTS = 5;
  const LOGIN_LOCKOUT_MS = 15 * 60 * 1e3;
  function isLoginRateLimited(key) {
    const now = Date.now();
    const record = loginFailuresMap.get(key);
    if (!record) return false;
    if (record.resetAt < now) {
      loginFailuresMap.delete(key);
      return false;
    }
    return record.count >= MAX_FAILED_LOGIN_ATTEMPTS;
  }
  function recordLoginFailure(key) {
    const now = Date.now();
    if (loginFailuresMap.size > 2e3) {
      for (const [k, v] of loginFailuresMap.entries()) {
        if (v.resetAt < now) loginFailuresMap.delete(k);
      }
    }
    const record = loginFailuresMap.get(key);
    if (!record || record.resetAt < now) {
      loginFailuresMap.set(key, { count: 1, resetAt: now + LOGIN_LOCKOUT_MS });
    } else {
      record.count += 1;
    }
  }
  function clearLoginFailures(key) {
    loginFailuresMap.delete(key);
  }
  async function resolveAuthContext(req, res) {
    try {
      let accessToken = getCookie(req, "sb-access-token");
      if (!accessToken && req.headers.authorization) {
        const parts = req.headers.authorization.split(" ");
        if (parts[0] === "Bearer") {
          accessToken = parts[1];
        }
      }
      if (!accessToken && req.headers["x-access-token"]) {
        const raw = req.headers["x-access-token"];
        accessToken = Array.isArray(raw) ? raw[0] : raw;
      }
      if (!accessToken) {
        const rawRefresh = req.headers["x-refresh-token"];
        const refreshToken = getCookie(req, "sb-refresh-token") || (Array.isArray(rawRefresh) ? rawRefresh[0] : rawRefresh);
        if (refreshToken) {
          const freshClient = getSupabaseServerClient();
          const { data, error: error2 } = await freshClient.auth.refreshSession({ refresh_token: String(refreshToken) });
          if (!error2 && data.session) {
            accessToken = data.session.access_token;
            setAuthCookies(res, data.session.access_token, data.session.refresh_token, data.session.expires_in);
          }
        }
      }
      if (!accessToken) {
        const remoteIp = req.socket?.remoteAddress || req.ip || "";
        const isLoopback = remoteIp === "127.0.0.1" || remoteIp === "::1" || remoteIp === "::ffff:127.0.0.1";
        if (process.env.ALLOW_DEV_AUTH_BYPASS === "true" && process.env.NODE_ENV !== "production" && isLoopback) {
          console.warn("[SECURITY WARNING] ALLOW_DEV_AUTH_BYPASS active for localhost development mode.");
          const devUser = { id: "dev-admin-id", email: "admin@samarastay.co.id" };
          const devProfile = { id: "dev-admin-id", email: "admin@samarastay.co.id", role: "super", full_name: "Developer Admin", property_id: null };
          return { user: devUser, profile: devProfile };
        }
        return null;
      }
      const client = getSupabaseServerClient(accessToken);
      let { data: { user }, error } = await client.auth.getUser(accessToken);
      if (error || !user) {
        const refreshToken = getCookie(req, "sb-refresh-token") || req.headers["x-refresh-token"];
        if (refreshToken) {
          const freshClient = getSupabaseServerClient();
          const { data: refData, error: refErr } = await freshClient.auth.refreshSession({ refresh_token: String(refreshToken) });
          if (!refErr && refData.session?.user) {
            user = refData.session.user;
            accessToken = refData.session.access_token;
            setAuthCookies(res, refData.session.access_token, refData.session.refresh_token, refData.session.expires_in);
          } else {
            return null;
          }
        } else {
          return null;
        }
      }
      const isEmailConfirmed = Boolean(user.email_confirmed_at || user.confirmed_at || !isEmailConfirmationEnforced());
      const userData = await getOrMigrateUserProfile(client, user);
      const effectiveRole = resolveEffectiveRole(userData, user.email || "", isEmailConfirmed);
      const profile = {
        ...userData || {},
        role: effectiveRole,
        property_id: userData?.property_id !== void 0 ? userData.property_id : null
      };
      return { user, profile };
    } catch (err) {
      console.warn("[resolveAuthContext] Exception:", err?.message || err);
      return null;
    }
  }
  async function requireAdminAuth(req, res, next) {
    try {
      const auth = await resolveAuthContext(req, res);
      if (!auth) {
        return res.status(401).json({ success: false, error: "Akses ditolak. Token autentikasi tidak ditemukan atau tidak valid." });
      }
      const effectiveRole = String(auth.profile?.role || "").trim().toLowerCase();
      const isAuthorized = ["admin", "super", "super_admin", "finance", "staff", "owner", "anak_owner"].includes(effectiveRole);
      if (!isAuthorized) {
        return res.status(403).json({ success: false, error: "Akses ditolak. Peran Anda tidak memiliki izin admin." });
      }
      if (effectiveRole === "staff" && (auth.profile.property_id === null || auth.profile.property_id === void 0)) {
        return res.status(403).json({ success: false, error: "Akun Staff belum ditugaskan ke properti. Hubungi Super Admin." });
      }
      req.authUser = auth.user;
      req.authProfile = auth.profile;
      next();
    } catch (err) {
      return res.status(500).json({ success: false, error: "Terjadi kesalahan pada verifikasi autentikasi." });
    }
  }
  async function optionalAdminAuth(req, res, next) {
    try {
      const auth = await resolveAuthContext(req, res);
      if (auth) {
        const effectiveRole = String(auth.profile?.role || "").trim().toLowerCase();
        if (["admin", "super", "super_admin", "finance", "staff", "owner", "anak_owner"].includes(effectiveRole)) {
          if (!(effectiveRole === "staff" && (auth.profile.property_id === null || auth.profile.property_id === void 0))) {
            req.authUser = auth.user;
            req.authProfile = auth.profile;
          }
        }
      }
      next();
    } catch (err) {
      next();
    }
  }
  function requirePermission(resource, action = "read") {
    return (req, res, next) => {
      const authProfile = req.authProfile;
      const role = authProfile?.role;
      if (!role) {
        return res.status(401).json({ success: false, error: "Akses ditolak. Profil pengguna tidak teridentifikasi." });
      }
      if (!can(role, resource, action)) {
        return res.status(403).json({
          success: false,
          error: `Akses ditolak. Peran "${role}" tidak memiliki izin "${action}" pada modul "${resource}".`
        });
      }
      const targetPropId = req.body?.property_id || req.body?.propertyId || req.query?.property_id || req.query?.propertyId || req.params?.property_id || req.params?.propertyId;
      if (targetPropId !== void 0 && targetPropId !== null && targetPropId !== "") {
        if (!canAccessProperty(authProfile, targetPropId)) {
          return res.status(403).json({
            success: false,
            error: `Akses ditolak. Peran Anda (${role}) tidak berwenang mengakses Properti ID ${targetPropId}.`
          });
        }
      }
      next();
    };
  }
  function sanitizePiiResponse(arg1, arg2, customFields) {
    let data;
    let role = "";
    if (typeof arg1 === "string") {
      role = arg1;
      data = arg2;
    } else if (typeof arg2 === "string") {
      role = arg2;
      data = arg1;
    } else {
      data = arg1;
      role = arg2 && typeof arg2 === "object" && arg2.role ? arg2.role : "";
    }
    if (!data) return data;
    if (role && can(role, "pii_docs", "read")) {
      return data;
    }
    if (Array.isArray(data)) {
      return data.map((item) => sanitizePiiResponse(item, role, customFields));
    }
    if (typeof data === "object") {
      const copy = { ...data };
      if ("nik" in copy && copy.nik) copy.nik = maskNik(copy.nik);
      if ("nik_pasangan" in copy && copy.nik_pasangan) copy.nik_pasangan = maskNik(copy.nik_pasangan);
      if ("spouse_nik" in copy && copy.spouse_nik) copy.spouse_nik = maskNik(copy.spouse_nik);
      if ("identity_number" in copy && copy.identity_number) copy.identity_number = maskNik(copy.identity_number);
      if ("ktp_url" in copy) copy.ktp_url = null;
      if ("marriage_book_url" in copy) copy.marriage_book_url = null;
      if ("marriage_certificate_url" in copy) copy.marriage_certificate_url = null;
      if ("family_card_url" in copy) copy.family_card_url = null;
      if (customFields && Array.isArray(customFields)) {
        for (const field of customFields) {
          if (field in copy) {
            if (field.includes("nik") || field.includes("identity")) {
              copy[field] = maskNik(copy[field]);
            } else {
              copy[field] = null;
            }
          }
        }
      }
      return copy;
    }
    return data;
  }
  const midtransLogs = [];
  function addMidtransLog(entry) {
    midtransLogs.unshift({
      id: `log-${Date.now()}-${Math.floor(1e3 + Math.random() * 9e3)}`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      ...entry
    });
    if (midtransLogs.length > 100) {
      midtransLogs.pop();
    }
  }
  app.get("/api/midtrans/logs", requireAdminAuth, requirePermission("midtrans_logs", "read"), (req, res) => {
    return res.json({ logs: midtransLogs });
  });
  app.get("/api/config", (req, res) => {
    res.json({
      supabaseUrl: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
      supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "",
      midtransClientKey: process.env.VITE_MIDTRANS_CLIENT_KEY || process.env.MIDTRANS_CLIENT_KEY || ""
    });
  });
  app.post("/api/midtrans/logs", apiRateLimiter(6e4, 60), express.json(), (req, res) => {
    const { orderId, customerName, customerEmail, amount, type, status, message, details } = req.body || {};
    if (!orderId || typeof orderId !== "string" || !/^[A-Za-z0-9_-]{3,80}$/.test(orderId)) {
      return res.status(400).json({ status: "ERROR", message: "Format orderId tidak valid." });
    }
    const cleanCustomerName = customerName ? String(customerName).slice(0, 100) : void 0;
    const cleanCustomerEmail = customerEmail ? String(customerEmail).slice(0, 100) : void 0;
    const cleanMessage = message ? String(message).slice(0, 255) : "Client event recorded";
    const cleanType = type ? String(type).slice(0, 50) : "client_event";
    const cleanStatus = status ? String(status).slice(0, 50) : "info";
    let safeDetails = details;
    if (details !== void 0) {
      try {
        const str = typeof details === "string" ? details : JSON.stringify(details);
        safeDetails = str.length > 2e3 ? JSON.parse(str.slice(0, 2e3) + '..."') : details;
      } catch {
        safeDetails = String(details).slice(0, 1e3);
      }
    }
    const validTypes = ["error", "charge", "webhook", "client_event", "simulation"];
    const resolvedType = validTypes.includes(cleanType) ? cleanType : "client_event";
    addMidtransLog({
      orderId,
      customerName: cleanCustomerName,
      customerEmail: cleanCustomerEmail,
      amount: amount && !isNaN(Number(amount)) ? Number(amount) : void 0,
      type: resolvedType,
      status: cleanStatus,
      message: cleanMessage,
      details: safeDetails
    });
    return res.json({ status: "OK" });
  });
  app.post("/api/midtrans/logs/clear", requireAdminAuth, requirePermission("midtrans_logs", "delete"), (req, res) => {
    midtransLogs.length = 0;
    return res.json({ status: "OK" });
  });
  async function settleContractExtensionTransaction(supabase, orderId, paymentType = "Midtrans SNAP", transactionId, grossAmount, feeAmount, options) {
    console.log(`[SETTLE EXTENSION] Executing contract extension settlement for Order: "${orderId}"`);
    let { data: ext } = await supabase.from("contract_extensions").select("*").eq("midtrans_order_id", orderId).maybeSingle();
    let tenantId = ext?.tenant_id || options?.tenantId;
    let extensionMonths = ext?.extension_months || options?.extensionMonths || 1;
    let totalAmount = grossAmount || ext?.total_amount || 0;
    if (!tenantId && (orderId.startsWith("EXT-") || orderId.startsWith("EXTEND-"))) {
      const parts = orderId.split("-");
      if (parts.length >= 2) {
        const parsed = parseInt(parts[1], 10);
        if (!isNaN(parsed)) tenantId = parsed;
      }
    }
    if (!tenantId) {
      throw new Error(`Tenant ID tidak ditemukan untuk perpanjangan kontrak ${orderId}`);
    }
    const { data: tenant, error: tErr } = await supabase.from("tenants").select("*").eq("id", tenantId).maybeSingle();
    if (tErr || !tenant) {
      throw new Error(`Data penyewa dengan ID ${tenantId} tidak ditemukan.`);
    }
    const currentDuration = Number(tenant.duration_months) || 1;
    const newDuration = currentDuration + Number(extensionMonths);
    const { data: updatedTenant, error: tUpdErr } = await supabase.from("tenants").update({
      duration_months: newDuration,
      payment_status: "paid",
      status: "active"
    }).eq("id", tenantId).select().maybeSingle();
    if (tUpdErr) {
      console.error("[SETTLE EXTENSION] Error updating tenant duration_months:", tUpdErr);
    }
    let propertyName = ext?.property_name || "Samara Stay Residence";
    if (tenant.property_id) {
      const { data: prop } = await supabase.from("properties").select("name").eq("id", tenant.property_id).maybeSingle();
      if (prop?.name) propertyName = prop.name;
    }
    const invoiceId = ext?.invoice_id || `INV-EXT-${tenantId}-${Date.now()}`;
    const trxId = transactionId || ext?.midtrans_order_id || `mid-tr-ext-${Math.floor(1e5 + Math.random() * 9e5)}`;
    const monthlyRate = ext?.monthly_rate || Math.round(Number(totalAmount) / Math.max(1, Number(extensionMonths)));
    let savedExtension = null;
    const extensionPayload = {
      tenant_id: tenantId,
      tenant_name: tenant.full_name,
      property_id: tenant.property_id,
      property_name: propertyName,
      room_number: tenant.room_number,
      old_start_date: tenant.start_date,
      old_duration_months: currentDuration,
      extension_months: Number(extensionMonths),
      monthly_rate: monthlyRate,
      total_amount: Number(totalAmount),
      payment_method: paymentType || "Midtrans SNAP",
      status: "paid",
      midtrans_order_id: orderId,
      invoice_id: invoiceId,
      notes: options?.notes || ext?.notes || `Pelunasan perpanjangan sewa ${extensionMonths} bulan`,
      paid_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (ext?.id) {
      const { data: updExt } = await supabase.from("contract_extensions").update(extensionPayload).eq("id", ext.id).select().maybeSingle();
      savedExtension = updExt || { ...ext, ...extensionPayload };
    } else {
      const { data: insExt } = await supabase.from("contract_extensions").insert(extensionPayload).select().maybeSingle();
      savedExtension = insExt || extensionPayload;
    }
    try {
      await supabase.from("payments").insert({
        id: invoiceId,
        tenant_name: tenant.full_name,
        property_id: tenant.property_id,
        amount: Number(totalAmount),
        method: paymentType || "Midtrans SNAP",
        status: "paid",
        payment_date: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
        midtrans_order_id: orderId,
        transaction_id: trxId
      });
    } catch (payErr) {
      console.warn("[SETTLE EXTENSION] Payment insert warning:", payErr);
    }
    try {
      const feeAmt = Number(feeAmount || 0);
      const grossAmt = Number(totalAmount || 0);
      await supabase.from("midtrans_clearing_transactions").upsert({
        midtrans_order_id: orderId,
        midtrans_transaction_id: trxId,
        payment_id: invoiceId,
        contract_extension_id: savedExtension?.id || null,
        gross_amount: grossAmt,
        fee_amount: feeAmt,
        net_amount: grossAmt - feeAmt,
        reconciled_amount: 0,
        outstanding_amount: grossAmt,
        clearing_status: "cleared",
        property_id: tenant.property_id || null,
        tenant_name: tenant.full_name || null,
        settled_at: (/* @__PURE__ */ new Date()).toISOString()
      }, { onConflict: "midtrans_order_id" });
    } catch (clrErr) {
      console.warn("[SETTLE EXTENSION] Clearing upsert warning:", clrErr);
    }
    try {
      await verifyAndEnsureCriticalCOA(supabase, true);
      const { data: debitAcc } = await supabase.from("accounts").select("id, balance").ilike("name", "%kas%").maybeSingle() || await supabase.from("accounts").select("id, balance").eq("type", "asset").limit(1).maybeSingle();
      const { data: creditAcc } = await supabase.from("accounts").select("id, balance").ilike("name", "%pendapatan%sewa%").maybeSingle() || await supabase.from("accounts").select("id, balance").eq("type", "revenue").limit(1).maybeSingle();
      if (debitAcc && creditAcc) {
        const trxNo = `TRX-EXT-${Date.now()}`;
        const { data: finTrx } = await supabase.from("financial_transactions").insert({
          transaction_no: trxNo,
          transaction_date: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
          category: "Pendapatan Sewa",
          description: `Perpanjangan Sewa Kamar ${tenant.room_number} (${tenant.full_name}) - ${extensionMonths} Bulan`,
          amount: Number(totalAmount),
          type: "income",
          reference_type: "contract_extension",
          reference_id: String(savedExtension?.id || invoiceId),
          created_by: "Finance System",
          property_id: tenant.property_id
        }).select().maybeSingle();
        if (finTrx) {
          const jrnNo = `JRN-${Date.now()}`;
          await supabase.from("journal_entries").insert([
            { journal_no: jrnNo, transaction_id: finTrx.id, account_id: debitAcc.id, debit: Number(totalAmount), credit: 0 },
            { journal_no: jrnNo, transaction_id: finTrx.id, account_id: creditAcc.id, debit: 0, credit: Number(totalAmount) }
          ]);
          await supabase.from("accounts").update({ balance: Number(debitAcc.balance || 0) + Number(totalAmount) }).eq("id", debitAcc.id);
          await supabase.from("accounts").update({ balance: Number(creditAcc.balance || 0) + Number(totalAmount) }).eq("id", creditAcc.id);
        }
      }
    } catch (coaErr) {
      console.warn("[SETTLE EXTENSION] COA posting warning:", coaErr);
    }
    try {
      if (tenant.room_number && tenant.property_id) {
        await supabase.from("rooms").update({
          status: "occupied",
          current_tenant_name: tenant.full_name
        }).eq("property_id", tenant.property_id).eq("room_number", tenant.room_number);
      }
    } catch (rErr) {
      console.warn("[SETTLE EXTENSION] Room update warning:", rErr);
    }
    try {
      const channel = supabase.channel("db-global-realtime");
      await channel.subscribe();
      await channel.send({
        type: "broadcast",
        event: "db_mutation",
        payload: {
          table: "contract_extensions",
          eventType: "INSERT",
          data: savedExtension,
          sourceTabId: "backend-server"
        }
      });
      await channel.send({
        type: "broadcast",
        event: "db_mutation",
        payload: {
          table: "tenants",
          eventType: "UPDATE",
          data: updatedTenant || { ...tenant, duration_months: newDuration, payment_status: "paid", status: "active" },
          sourceTabId: "backend-server"
        }
      });
      await channel.send({
        type: "broadcast",
        event: "db_mutation",
        payload: {
          table: "payments",
          eventType: "INSERT",
          data: { id: invoiceId, amount: Number(totalAmount) },
          sourceTabId: "backend-server"
        }
      });
    } catch (bErr) {
      console.warn("[SETTLE EXTENSION] Realtime broadcast warning (non-fatal):", bErr);
    }
    if (tenant.email && tenant.email.includes("@")) {
      try {
        const formattedPrice = "Rp " + Number(totalAmount).toLocaleString("id-ID");
        const subject = `[Samara Stay] Bukti Pembayaran Perpanjangan Kontrak - Unit ${tenant.room_number}`;
        let extOwnerSigUrl = "https://eniwbzpfvwtbsonmnzzr.supabase.co/storage/v1/object/public/signatures/owner_official_signature.png";
        try {
          const { data: setRow } = await supabase.from("settings").select("owner_signature_url").eq("id", 1).maybeSingle();
          if (setRow?.owner_signature_url) {
            extOwnerSigUrl = setRow.owner_signature_url;
          }
        } catch (sErr) {
        }
        const text = `Halo ${tenant.full_name}, pembayaran perpanjangan kontrak sewa kamar Anda di ${propertyName} (Unit ${tenant.room_number}) selama ${extensionMonths} bulan telah berhasil dilunasi!`;
        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
            <h2 style="color: #0D9488; margin-top: 0;">Perpanjangan Kontrak Berhasil</h2>
            <p>Halo <strong>${tenant.full_name}</strong>,</p>
            <p>Terima kasih! Pembayaran perpanjangan masa sewa kamar Anda telah berhasil diverifikasi dan aktif di sistem.</p>
            <div style="background-color: #f8fafc; padding: 15px; border-radius: 12px; margin: 20px 0; border: 1px solid #e2e8f0;">
              <p style="margin: 5px 0;"><strong>No. Invoice:</strong> ${invoiceId}</p>
              <p style="margin: 5px 0;"><strong>Order ID:</strong> ${orderId}</p>
              <p style="margin: 5px 0;"><strong>Properti:</strong> ${propertyName}</p>
              <p style="margin: 5px 0;"><strong>Unit Kamar:</strong> Kamar ${tenant.room_number}</p>
              <p style="margin: 5px 0;"><strong>Durasi Tambahan:</strong> +${extensionMonths} Bulan</p>
              <p style="margin: 5px 0;"><strong>Total Durasi Aktif:</strong> ${newDuration} Bulan</p>
              <p style="margin: 5px 0;"><strong>Total Pembayaran:</strong> ${formattedPrice}</p>
              <p style="margin: 5px 0;"><strong>Metode Bayar:</strong> ${paymentType}</p>
              <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: #059669; font-weight: bold;">LUNAS (KONTRAK DIPERPANJANG)</span></p>
            </div>

            <!-- PENGESAHAN TANDA TANGAN RESMI OWNER -->
            <div style="margin-top: 25px; padding: 16px; border: 1px dashed #94a3b8; border-radius: 12px; background-color: #ffffff; text-align: center;">
              <p style="font-size: 10px; color: #475569; font-weight: 800; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px;">PENGESAHAN DOKUMEN DIGITAL:</p>
              <div style="display: inline-block; min-height: 55px; text-align: center;">
                <img src="cid:owner-signature" alt="Tanda Tangan Owner" style="max-height: 55px; max-width: 140px; display: inline-block;" />
              </div>
              <p style="font-size: 10px; color: #1e293b; font-weight: 800; margin: 4px 0 0 0; text-transform: uppercase;">SAMARA STAY MANAGEMENT</p>
              <p style="font-size: 8px; color: #059669; font-weight: bold; margin: 2px 0 0 0; font-family: monospace;">[ RESMI & TERVERIFIKASI ]</p>
            </div>
          </div>
        `;
        sendServerEmail(tenant.email, subject, text, html, { ownerSigUrl: extOwnerSigUrl });
      } catch (emErr) {
        console.warn("[SETTLE EXTENSION] Email send warning:", emErr);
      }
    }
    return {
      success: true,
      invoiceId,
      newDurationMonths: newDuration,
      extension: savedExtension,
      tenant: updatedTenant || { ...tenant, duration_months: newDuration, payment_status: "paid", status: "active" }
    };
  }
  app.post("/api/admin/contract-extension/settle", requireAdminAuth, requirePermission("bookings", "approve"), express.json(), async (req, res) => {
    try {
      const {
        tenantId,
        extensionMonths,
        totalAmount,
        paymentMethod,
        midtransOrderId,
        transactionId,
        notes
      } = req.body;
      if (!tenantId || !extensionMonths || !totalAmount) {
        return res.status(400).json({ error: "tenantId, extensionMonths, dan totalAmount wajib diisi." });
      }
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: "Supabase URL atau Key belum dikonfigurasi di server." });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      const { data: tenantData, error: tenantFetchErr } = await supabaseAdmin.from("tenants").select("*").eq("id", tenantId).maybeSingle();
      if (tenantFetchErr || !tenantData) {
        return res.status(404).json({ error: "Data penyewa tidak ditemukan." });
      }
      const propAccess = checkPropertyAccess(req.authProfile, tenantData.property_id);
      if (!propAccess.allowed) {
        return res.status(403).json({ error: propAccess.reason || "Akses ditolak ke properti ini." });
      }
      const orderId = midtransOrderId || `EXT-${tenantId}-${Date.now()}`;
      const trxId = transactionId || `mid-tr-ext-${Math.floor(1e5 + Math.random() * 9e5)}`;
      const settleResult = await settleContractExtensionTransaction(
        supabaseAdmin,
        orderId,
        paymentMethod || "Tunai / Transfer Manual",
        trxId,
        Number(totalAmount),
        0,
        {
          tenantId: Number(tenantId),
          extensionMonths: Number(extensionMonths),
          notes: notes || `Pelunasan langsung perpanjangan sewa ${extensionMonths} bulan`
        }
      );
      return res.status(200).json(settleResult);
    } catch (err) {
      console.error("[Admin API] contract-extension/settle failed:", err);
      return res.status(500).json({ error: err.message || "Internal server error." });
    }
  });
  app.post("/api/admin/financial-transaction/post", requireAdminAuth, requirePermission("journals", "create"), express.json(), async (req, res) => {
    try {
      const {
        category,
        description,
        amount,
        type,
        reference_type,
        reference_id,
        created_by,
        debit_account_id,
        credit_account_id,
        property_id
      } = req.body;
      if (!category || !description || !amount || !type || !debit_account_id || !credit_account_id) {
        return res.status(400).json({ error: "Field wajib untuk posting transaksi belum lengkap." });
      }
      const propAccess = checkPropertyAccess(req.authProfile, property_id);
      if (!propAccess.allowed) {
        return res.status(403).json({ error: propAccess.reason || "Akses ditolak ke properti ini." });
      }
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: "Supabase URL atau Key belum dikonfigurasi di server." });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      await verifyAndEnsureCriticalCOA(supabaseAdmin, true);
      const trxDate = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const trxNo = `TRX-${trxDate.replace(/-/g, "")}-${Math.floor(100 + Math.random() * 900)}`;
      let postedData = null;
      try {
        const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc("post_financial_transaction", {
          p_transaction_no: trxNo,
          p_transaction_date: trxDate,
          p_category: category,
          p_description: description,
          p_amount: amount,
          p_type: type,
          p_reference_type: reference_type || null,
          p_reference_id: reference_id || null,
          p_created_by: created_by || req.authProfile?.full_name || "Admin",
          p_debit_account_id: debit_account_id,
          p_credit_account_id: credit_account_id,
          p_property_id: property_id || null
        });
        if (rpcErr) {
          console.warn("[Admin API] post_financial_transaction RPC returned error, using direct table fallback:", rpcErr.message);
          throw rpcErr;
        }
        postedData = rpcRes;
      } catch (e) {
        const { data: insertedTrx, error: insertTrxErr } = await supabaseAdmin.from("financial_transactions").insert({
          transaction_no: trxNo,
          transaction_date: trxDate,
          category,
          description,
          amount: Number(amount),
          type,
          reference_type: reference_type || null,
          reference_id: reference_id ? String(reference_id) : null,
          created_by: created_by || req.authProfile?.full_name || "Admin",
          property_id: property_id || null
        }).select().single();
        if (!insertTrxErr && insertedTrx) {
          const journalNo = `JRN-${trxDate.replace(/-/g, "")}-${insertedTrx.id}`;
          try {
            await supabaseAdmin.from("journal_entries").insert([
              {
                journal_no: journalNo,
                transaction_id: insertedTrx.id,
                account_id: debit_account_id,
                debit: Number(amount),
                credit: 0
              },
              {
                journal_no: journalNo,
                transaction_id: insertedTrx.id,
                account_id: credit_account_id,
                debit: 0,
                credit: Number(amount)
              }
            ]);
          } catch (jErr) {
            console.warn("[Admin API] journal_entries insert fallback note:", jErr);
          }
          postedData = insertedTrx;
        }
      }
      return res.status(200).json({ success: true, data: postedData || { transaction_no: trxNo } });
    } catch (err) {
      console.error("[Admin API] financial-transaction/post failed:", err);
      return res.status(500).json({ error: err.message || "Internal server error." });
    }
  });
  app.patch("/api/admin/users/:id/assign-property", requireAdminAuth, requirePermission("users", "update"), express.json(), async (req, res) => {
    try {
      const callerRole = req.authProfile?.role;
      const targetUserId = req.params.id;
      if (!targetUserId) {
        return res.status(400).json({ success: false, error: "User ID target wajib disertakan." });
      }
      const { property_id } = req.body;
      const targetPropertyId = property_id === null || property_id === void 0 || property_id === "" || property_id === 0 ? null : Number(property_id);
      const serviceKey = getServiceRoleKeyOrThrow();
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const adminClient = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });
      const { data: targetUser, error: userFetchErr } = await adminClient.from("users").select("*").eq("id", targetUserId).maybeSingle();
      if (userFetchErr) {
        return res.status(500).json({ success: false, error: `Gagal membaca data pengguna: ${userFetchErr.message}` });
      }
      if (!targetUser) {
        return res.status(404).json({ success: false, error: "Pengguna target tidak ditemukan." });
      }
      const chkAssign = canAssignProperty(callerRole, targetUser.role);
      if (!chkAssign.allowed) {
        return res.status(403).json({
          success: false,
          error: chkAssign.reason || `Akses ditolak. Peran "${callerRole}" tidak memiliki hak mengelola penugasan peran "${targetUser.role}".`
        });
      }
      if (["super", "super_admin"].includes(targetUser.role) && !["super", "super_admin"].includes(callerRole)) {
        return res.status(403).json({ success: false, error: "Tidak dapat mengubah penugasan properti Super Admin." });
      }
      if (targetUser.role === "owner" && !["super", "super_admin"].includes(callerRole)) {
        return res.status(403).json({ success: false, error: "Tidak dapat mengubah penugasan properti Owner." });
      }
      let propertyName = "";
      if (targetPropertyId !== null) {
        const { data: prop, error: propErr } = await adminClient.from("properties").select("id, name").eq("id", targetPropertyId).maybeSingle();
        if (propErr || !prop) {
          return res.status(400).json({ success: false, error: `Properti dengan ID ${targetPropertyId} tidak ditemukan.` });
        }
        propertyName = prop.name;
      }
      const updatedAccess = targetPropertyId !== null ? `Akses Terbatas: Properti ${propertyName || targetPropertyId}` : ["super", "super_admin"].includes(targetUser.role) ? "Semua Properti (Super Admin)" : targetUser.role === "owner" ? "Owner Investor Portfolio" : "Akses Semua Properti (Global)";
      const { data: updatedUser, error: updateErr } = await adminClient.from("users").update({
        property_id: targetPropertyId,
        access: updatedAccess
      }).eq("id", targetUserId).select("id, email, full_name, role, role_id, access, active, property_id, created_at").single();
      if (updateErr) {
        return res.status(500).json({ success: false, error: `Gagal memperbarui properti pengguna: ${updateErr.message}` });
      }
      try {
        await adminClient.from("activity_logs").insert({
          admin_name: req.authProfile?.full_name || req.authProfile?.email || "Admin",
          action: "ASSIGN_USER_PROPERTY",
          detail: `Menugaskan user ${targetUser.full_name || targetUser.email} ke properti: ${propertyName || "Global (Semua Properti)"} (ID: ${targetPropertyId ?? "null"})`,
          created_at: (/* @__PURE__ */ new Date()).toISOString()
        });
      } catch (logErr) {
        console.warn("[Admin API] activity log insert notice:", logErr);
      }
      return res.status(200).json({
        success: true,
        message: targetPropertyId !== null ? `Pengguna ${targetUser.full_name || targetUser.email} berhasil ditugaskan ke properti ${propertyName}.` : `Penugasan properti pengguna ${targetUser.full_name || targetUser.email} berhasil diatur ke Global (Semua Properti).`,
        user: updatedUser
      });
    } catch (err) {
      console.error("[Admin API] assign-property failed:", err);
      return res.status(500).json({ success: false, error: err.message || "Internal server error." });
    }
  });
  app.get("/api/admin/users", requireAdminAuth, requirePermission("users", "read"), async (req, res) => {
    try {
      const callerRole = (req.authProfile?.role || "").toLowerCase();
      const serviceKey = getServiceRoleKeyOrThrow();
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const adminClient = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });
      let query = adminClient.from("users").select("id, email, full_name, role, role_id, access, active, property_id, created_at").order("id", { ascending: false });
      if (callerRole === "owner") {
        query = query.not("role", "in", '("super","super_admin")');
      } else if (callerRole === "anak_owner") {
        query = query.in("role", ["staff", "admin", "user"]);
      } else if (!["super", "super_admin"].includes(callerRole)) {
        query = query.in("role", ["staff", "user"]);
      }
      const { data: users, error } = await query;
      if (error) {
        return res.status(500).json({ success: false, error: error.message });
      }
      return res.status(200).json({ success: true, users: users || [] });
    } catch (err) {
      console.error("[Admin API] get users failed:", err);
      return res.status(500).json({ success: false, error: err.message || "Internal server error." });
    }
  });
  app.post("/api/admin/users/save", requireAdminAuth, requirePermission("users", "create"), express.json(), async (req, res) => {
    try {
      const callerRole = req.authProfile?.role;
      const { id, full_name, email, role, access, active, property_id, password } = req.body;
      if (!email || !email.trim()) {
        return res.status(400).json({ success: false, error: "Email resmi wajib diisi." });
      }
      const cleanEmail = email.trim().toLowerCase();
      const cleanFullName = (full_name || cleanEmail.split("@")[0]).trim();
      const cleanRole = (role || "staff").trim().toLowerCase();
      const cleanRoleId = ["super", "super_admin", "owner"].includes(cleanRole) ? 1 : ["admin", "anak_owner"].includes(cleanRole) ? 2 : cleanRole === "finance" ? 3 : 4;
      const targetPropertyId = property_id === null || property_id === void 0 || property_id === "" || property_id === 0 ? null : Number(property_id);
      const cleanActive = active !== void 0 ? Boolean(active) : true;
      const serviceKey = getServiceRoleKeyOrThrow();
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const adminClient = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });
      if (targetPropertyId !== null) {
        const { data: propCheck } = await adminClient.from("properties").select("id").eq("id", targetPropertyId).maybeSingle();
        if (!propCheck) {
          return res.status(400).json({ success: false, error: `Properti dengan ID ${targetPropertyId} tidak ditemukan.` });
        }
      }
      const chkRole = canManageRole(callerRole, cleanRole);
      if (!chkRole.allowed) {
        return res.status(403).json({
          success: false,
          error: chkRole.reason || `Akses ditolak. Peran "${callerRole}" tidak memiliki hak untuk membuat atau menetapkan peran "${cleanRole}".`
        });
      }
      let userId = id;
      let previousRole = null;
      if (userId) {
        const { data: existingTargetUser } = await adminClient.from("users").select("id, role").eq("id", userId).maybeSingle();
        if (existingTargetUser) {
          previousRole = existingTargetUser.role;
          const chkExisting = canManageRole(callerRole, existingTargetUser.role);
          if (!chkExisting.allowed) {
            return res.status(403).json({
              success: false,
              error: chkExisting.reason || `Akses ditolak. Peran "${callerRole}" tidak memiliki hak untuk mengubah akun pengguna dengan peran "${existingTargetUser.role}".`
            });
          }
          if (req.authProfile?.id === userId && cleanRole !== (existingTargetUser.role || "").toLowerCase()) {
            return res.status(400).json({
              success: false,
              error: "Anda tidak dapat mengubah peran Anda sendiri."
            });
          }
          if (["super", "super_admin"].includes((existingTargetUser.role || "").toLowerCase()) && !["super", "super_admin"].includes(cleanRole)) {
            const { count } = await adminClient.from("users").select("id", { count: "exact", head: true }).in("role", ["super", "super_admin"]).eq("active", true);
            if ((count || 0) <= 1) {
              return res.status(400).json({
                success: false,
                error: "Tidak dapat menurunkan wewenang akun Super Admin terakhir di sistem."
              });
            }
          }
          if ((existingTargetUser.role || "").toLowerCase() === "owner" && cleanRole !== "owner") {
            const { count } = await adminClient.from("users").select("id", { count: "exact", head: true }).eq("role", "owner").eq("active", true);
            if ((count || 0) <= 1) {
              return res.status(400).json({
                success: false,
                error: "Tidak dapat menurunkan wewenang akun Owner terakhir di sistem."
              });
            }
          }
        }
      }
      if (!userId) {
        const existingAuth = await findAuthUserByEmail(adminClient, cleanEmail);
        if (existingAuth?.id) {
          userId = existingAuth.id;
          previousRole = existingAuth.role || null;
          const chkAuthUser = canManageRole(callerRole, existingAuth.role || "user");
          if (!chkAuthUser.allowed) {
            return res.status(403).json({
              success: false,
              error: chkAuthUser.reason || `Akses ditolak. Peran "${callerRole}" tidak memiliki hak mengelola pengguna ini.`
            });
          }
        }
      }
      if (!userId) {
        const securePassword = password && password.trim().length >= 8 ? password.trim() : crypto.randomBytes(12).toString("base64url");
        try {
          const { data: createdAuth, error: createAuthErr } = await adminClient.auth.admin.createUser({
            email: cleanEmail,
            password: securePassword,
            email_confirm: true,
            user_metadata: { full_name: cleanFullName }
          });
          if (createAuthErr) {
            console.warn("[Admin Save User] createUser notice:", createAuthErr.message);
          } else if (createdAuth?.user?.id) {
            userId = createdAuth.user.id;
          }
        } catch (authErr) {
          console.warn("[Admin Save User] Auth account provisioning notice:", authErr);
        }
      }
      if (!userId) {
        userId = crypto.randomUUID();
      }
      if (password && password.trim().length >= 6) {
        try {
          await adminClient.auth.admin.updateUserById(userId, {
            password: password.trim(),
            user_metadata: { full_name: cleanFullName }
          });
        } catch (passErr) {
          console.warn("[Admin Save User] Password update notice:", passErr);
        }
      }
      const defaultAccess = targetPropertyId !== null ? `Akses Terbatas: Properti ${targetPropertyId}` : ["super", "super_admin"].includes(cleanRole) ? "Semua Properti (Super Admin)" : cleanRole === "owner" ? "Owner Investor Portfolio" : cleanRole === "anak_owner" || cleanRole === "anak owner" ? "Akses operasional, hunian & keuangan (Anak Owner)" : cleanRole === "finance" ? "Akses ledger keuangan & setoran PBJT" : "Staff akses terbatas";
      const dbRole = cleanRole;
      const userRecord = {
        id: userId,
        full_name: cleanFullName,
        email: cleanEmail,
        role: dbRole,
        role_id: cleanRoleId,
        access: access || defaultAccess,
        active: cleanActive,
        property_id: targetPropertyId,
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      const { data: savedData, error: upsertErr } = await adminClient.from("users").upsert(userRecord, { onConflict: "id" }).select("id, email, full_name, role, role_id, access, active, property_id, created_at").single();
      if (upsertErr) {
        console.error("[Admin Save User] Upsert error in users table:", upsertErr);
        return res.status(500).json({ success: false, error: `Gagal menyimpan user: ${upsertErr.message}` });
      }
      try {
        const profileDbRole = dbRole === "super" ? "super_admin" : dbRole;
        await adminClient.from("profiles").upsert({
          id: userId,
          full_name: cleanFullName,
          role: profileDbRole
        }, { onConflict: "id" });
      } catch (pErr) {
      }
      try {
        const roleChangeDetail = previousRole && previousRole !== cleanRole ? `(Peran diubah dari ${previousRole} -> ${cleanRole})` : `(${cleanRole})`;
        await adminClient.from("activity_logs").insert({
          admin_name: req.authProfile?.full_name || req.authProfile?.email || "Admin",
          action: id ? "UPDATE_USER" : "CREATE_USER",
          detail: `Menyimpan fungsionaris ${cleanFullName} ${roleChangeDetail} - Email: ${cleanEmail}`,
          created_at: (/* @__PURE__ */ new Date()).toISOString()
        });
      } catch (logErr) {
      }
      return res.status(200).json({
        success: true,
        data: savedData || userRecord
      });
    } catch (err) {
      console.error("[Admin Save User] Unexpected error:", err);
      return res.status(500).json({ success: false, error: err.message || "Gagal menyimpan otorisasi pengguna." });
    }
  });
  app.delete("/api/admin/users/:id", requireAdminAuth, requirePermission("users", "delete"), async (req, res) => {
    try {
      const targetUserId = req.params.id;
      if (!targetUserId) {
        return res.status(400).json({ success: false, error: "User ID target wajib disertakan." });
      }
      if (req.authProfile?.id === targetUserId) {
        return res.status(400).json({ success: false, error: "Anda tidak dapat menghapus akun Anda sendiri yang sedang aktif." });
      }
      const serviceKey = getServiceRoleKeyOrThrow();
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const adminClient = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });
      const { data: targetUser } = await adminClient.from("users").select("*").eq("id", targetUserId).maybeSingle();
      if (!targetUser) {
        return res.status(404).json({ success: false, error: "Pengguna target tidak ditemukan." });
      }
      const callerRole = req.authProfile?.role;
      const chkDel = canManageRole(callerRole, targetUser.role, "delete");
      if (!chkDel.allowed) {
        return res.status(403).json({
          success: false,
          error: chkDel.reason || `Akses ditolak. Peran "${callerRole}" tidak memiliki hak untuk menghapus akun pengguna dengan peran "${targetUser.role}".`
        });
      }
      if (["super", "super_admin"].includes((targetUser.role || "").toLowerCase())) {
        const { count } = await adminClient.from("users").select("id", { count: "exact", head: true }).in("role", ["super", "super_admin"]).eq("active", true);
        if ((count || 0) <= 1) {
          return res.status(400).json({
            success: false,
            error: "Tidak dapat menghapus akun Super Admin terakhir di sistem."
          });
        }
      }
      if ((targetUser.role || "").toLowerCase() === "owner") {
        const { count } = await adminClient.from("users").select("id", { count: "exact", head: true }).eq("role", "owner").eq("active", true);
        if ((count || 0) <= 1) {
          return res.status(400).json({
            success: false,
            error: "Tidak dapat menghapus akun Owner terakhir di sistem."
          });
        }
      }
      const { error: delErr } = await adminClient.from("users").delete().eq("id", targetUserId);
      if (delErr) {
        console.warn("[Admin Delete User] users table delete error:", delErr.message);
      }
      try {
        await adminClient.auth.admin.deleteUser(targetUserId);
      } catch (authDelErr) {
        console.warn("[Admin Delete User] auth delete notice:", authDelErr);
      }
      try {
        await adminClient.from("activity_logs").insert({
          admin_name: req.authProfile?.full_name || req.authProfile?.email || "Admin",
          action: "DELETE_USER",
          detail: `Mencabut otorisasi fungsionaris ID: ${targetUserId} (${targetUser?.full_name || targetUser?.email || "User"} - Role: ${targetUser?.role})`,
          created_at: (/* @__PURE__ */ new Date()).toISOString()
        });
      } catch (logErr) {
      }
      return res.status(200).json({ success: true, message: "Hak akses fungsionaris berhasil dicabut." });
    } catch (err) {
      console.error("[Admin Delete User] Error:", err);
      return res.status(500).json({ success: false, error: err.message || "Gagal menghapus user." });
    }
  });
  app.post("/api/admin/booking/approve", requireAdminAuth, requirePermission("bookings", "approve"), express.json(), async (req, res) => {
    try {
      const { booking_id, payment_method } = req.body;
      if (!booking_id) {
        return res.status(400).json({ success: false, error: "booking_id wajib disertakan." });
      }
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: "Supabase URL atau Service Key belum dikonfigurasi di server." });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      const { data: existingBooking, error: fetchErr } = await supabaseAdmin.from("bookings").select("*").eq("id", booking_id).maybeSingle();
      if (fetchErr || !existingBooking) {
        return res.status(404).json({ success: false, error: "Data booking tidak ditemukan di database." });
      }
      const propAccess = checkPropertyAccess(req.authProfile, existingBooking.property_id);
      if (!propAccess.allowed) {
        return res.status(403).json({ success: false, error: propAccess.reason || "Akses ditolak ke properti ini." });
      }
      if (existingBooking.status === "approved") {
        const { data: existingPayment } = await supabaseAdmin.from("payments").select("id").or(`midtrans_order_id.eq.${existingBooking.midtrans_order_id},tenant_name.eq.${existingBooking.tenant_name}`).order("created_at", { ascending: false }).limit(1).maybeSingle();
        return res.status(200).json({
          success: true,
          already_approved: true,
          message: "Booking sudah disetujui sebelumnya (Idempotent).",
          booking: existingBooking,
          invoice_id: existingPayment?.id || null
        });
      }
      await verifyAndEnsureCriticalCOA(supabaseAdmin, true);
      let finalBooking = existingBooking;
      let finalInvoiceId = `INV-${existingBooking.id}-${Date.now()}`;
      let wasAlreadyApproved = false;
      try {
        const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc("settle_manual_booking_approval", {
          p_booking_id: booking_id,
          p_payment_method: payment_method || existingBooking.payment_method || "Transfer Manual",
          p_created_by: req.authProfile?.full_name || "Admin Approval"
        });
        if (!rpcErr && rpcRes && rpcRes.success) {
          console.log(`[Admin API approve_booking] Atomic settle RPC success for booking ${booking_id}. already_approved: ${rpcRes.already_approved}`);
          finalBooking = rpcRes.booking || existingBooking;
          finalInvoiceId = rpcRes.invoice_id || finalInvoiceId;
          wasAlreadyApproved = Boolean(rpcRes.already_approved);
        } else {
          throw new Error(rpcErr?.message || rpcRes?.error || "RPC execution fallback needed");
        }
      } catch (rpcEx) {
        console.warn("[Admin API approve_booking] RPC fallback to transactional server-side execution:", rpcEx?.message || rpcEx);
        const resolvedPaymentMethod = payment_method || existingBooking.payment_method || "Transfer Manual";
        const { data: updatedRows, error: updateErr } = await supabaseAdmin.from("bookings").update({
          status: "approved",
          payment_method: resolvedPaymentMethod
        }).eq("id", booking_id).neq("status", "approved").select();
        if (updateErr) {
          console.error("[Admin API approve_booking] Server fallback booking update failed:", updateErr);
          return res.status(500).json({ success: false, error: updateErr.message });
        }
        if (!updatedRows || updatedRows.length === 0) {
          return res.status(200).json({
            success: true,
            already_approved: true,
            message: "Booking disetujui oleh proses lain secara bersamaan.",
            booking: existingBooking
          });
        }
        finalBooking = updatedRows[0];
        const occupantName = finalBooking.occupant_name || finalBooking.tenant_name || "Penyewa";
        const occupantPhone = finalBooking.occupant_phone || finalBooking.phone || "";
        const occupantEmail = finalBooking.occupant_email || finalBooking.email || "";
        const totalPrice = Number(finalBooking.total_price || 0);
        const trxDate = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
        if (finalBooking.room_id) {
          await supabaseAdmin.from("rooms").update({
            status: "occupied",
            current_tenant_name: occupantName
          }).eq("id", finalBooking.room_id);
        }
        const initials = (occupantName || "TM").slice(0, 2).toUpperCase();
        try {
          const { data: existingTenant } = await supabaseAdmin.from("tenants").select("id").eq("room_number", finalBooking.room_number).eq("property_id", finalBooking.property_id).maybeSingle();
          if (existingTenant) {
            await supabaseAdmin.from("tenants").update({
              full_name: occupantName,
              phone: occupantPhone,
              email: occupantEmail,
              start_date: finalBooking.check_in_date || trxDate,
              duration_months: finalBooking.duration_months || 1,
              payment_status: "paid"
            }).eq("id", existingTenant.id);
          } else {
            await supabaseAdmin.from("tenants").insert({
              full_name: occupantName,
              phone: occupantPhone,
              email: occupantEmail,
              avatar_initials: initials,
              avatar_color: "bg-indigo-600",
              property_id: finalBooking.property_id,
              room_number: finalBooking.room_number,
              start_date: finalBooking.check_in_date || trxDate,
              duration_months: finalBooking.duration_months || 1,
              payment_status: "paid"
            });
          }
        } catch (tErr) {
          console.warn("[Admin API approve_booking] Tenant upsert notice:", tErr);
        }
        finalInvoiceId = `INV-${finalBooking.id}-${Date.now()}-${Math.floor(1e3 + Math.random() * 9e3)}`;
        try {
          await supabaseAdmin.from("payments").insert({
            id: finalInvoiceId,
            tenant_name: occupantName,
            property_id: finalBooking.property_id,
            amount: totalPrice,
            method: resolvedPaymentMethod,
            status: "paid",
            payment_date: trxDate,
            midtrans_order_id: finalBooking.midtrans_order_id || null,
            transaction_id: finalBooking.midtrans_order_id || `manual-tr-${Math.floor(1e5 + Math.random() * 9e5)}`
          });
        } catch (pErr) {
          console.warn("[Admin API approve_booking] Payment record insert notice:", pErr);
        }
        const debitAccountId = (resolvedPaymentMethod || "").toLowerCase().includes("midtrans") ? 1200 : 1010;
        const creditAccountId = 4e3;
        const trxNo = `TRX-${trxDate.replace(/-/g, "")}-${Math.floor(100 + Math.random() * 900)}`;
        try {
          const { data: insertedTrx, error: trxErr } = await supabaseAdmin.from("financial_transactions").insert({
            transaction_no: trxNo,
            transaction_date: trxDate,
            category: "Penerimaan Sewa",
            description: `[APPROVAL] Pelunasan Sewa ${occupantName} Unit ${finalBooking.room_number || ""}`,
            amount: totalPrice,
            type: "income",
            reference_type: "payment",
            reference_id: finalInvoiceId,
            created_by: req.authProfile?.full_name || "Admin Approval",
            property_id: finalBooking.property_id || null
          }).select().single();
          if (!trxErr && insertedTrx) {
            const journalNo = `JRN-${trxDate.replace(/-/g, "")}-${insertedTrx.id}`;
            await supabaseAdmin.from("journal_entries").insert([
              {
                journal_no: journalNo,
                transaction_id: insertedTrx.id,
                account_id: debitAccountId,
                debit: totalPrice,
                credit: 0
              },
              {
                journal_no: journalNo,
                transaction_id: insertedTrx.id,
                account_id: creditAccountId,
                debit: 0,
                credit: totalPrice
              }
            ]);
            const { data: accDebit } = await supabaseAdmin.from("accounts").select("balance").eq("id", debitAccountId).maybeSingle();
            if (accDebit) {
              await supabaseAdmin.from("accounts").update({ balance: Number(accDebit.balance || 0) + totalPrice }).eq("id", debitAccountId);
            }
            const { data: accCredit } = await supabaseAdmin.from("accounts").select("balance").eq("id", creditAccountId).maybeSingle();
            if (accCredit) {
              await supabaseAdmin.from("accounts").update({ balance: Number(accCredit.balance || 0) + totalPrice }).eq("id", creditAccountId);
            }
          }
        } catch (ledgerErr) {
          console.warn("[Admin API approve_booking] Double-entry ledger recording notice:", ledgerErr);
          try {
            await supabaseAdmin.from("failed_ledger_postings").insert({
              transaction_no: trxNo,
              reference_type: "payment",
              reference_id: finalInvoiceId,
              amount: totalPrice,
              debit_account_id: debitAccountId,
              credit_account_id: creditAccountId,
              property_id: finalBooking.property_id,
              created_by: req.authProfile?.full_name || "Admin Approval",
              error_message: `Manual approval ledger fallback note: ${ledgerErr?.message || ledgerErr}`,
              status: "pending"
            });
          } catch (failLogErr) {
            console.warn("[Admin API approve_booking] failed_ledger_postings logging notice:", failLogErr);
          }
        }
      }
      if (!wasAlreadyApproved) {
        const targetEmail = finalBooking.occupant_email || finalBooking.email;
        if (targetEmail && targetEmail.includes("@")) {
          setImmediate(async () => {
            try {
              let property = null;
              if (finalBooking.property_id) {
                const { data: prop } = await supabaseAdmin.from("properties").select("*").eq("id", finalBooking.property_id).maybeSingle();
                property = prop;
              }
              const occupantName = finalBooking.occupant_name || finalBooking.tenant_name || "Penyewa";
              const occupantPhone = finalBooking.occupant_phone || finalBooking.phone || "";
              const propertyName = property?.name || "Samara Stay Premium Residence";
              const propertyAddress = property?.address || "Area Hunian Premium Samara Stay";
              const paymentMethodName = finalBooking.payment_method || "Transfer Manual / Kasir";
              const formattedPrice = "Rp " + Number(finalBooking.total_price || 0).toLocaleString("id-ID");
              const subject = `[Samara Stay] Invoice Pelunasan Sewa Kamar - Unit ${finalBooking.room_number}`;
              const text = `Halo ${occupantName}, pemesanan sewa kamar Anda di ${propertyName} (Unit ${finalBooking.room_number}) telah disetujui dan diverifikasi lunas!`;
              const html = `
                <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 24px; background-color: #ffffff; color: #1e293b; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);">
                  <div style="text-align: center; border-bottom: 2px solid #334155; padding-bottom: 25px; margin-bottom: 30px;">
                    <h1 style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 28px; font-weight: 800; letter-spacing: 6px; text-transform: uppercase; color: #1e293b; margin: 10px 0 2px 0;">SAMARA</h1>
                    <p style="font-family: 'Courier New', Courier, monospace; font-size: 11px; font-weight: bold; letter-spacing: 3px; text-transform: uppercase; color: #64748b; margin: 0;">S T A Y</p>
                  </div>

                  <div style="text-align: center; margin-bottom: 30px;">
                    <span style="background-color: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; font-size: 11px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; padding: 6px 16px; border-radius: 9999px; display: inline-block; margin-bottom: 12px;">LUNAS / VERIFIED</span>
                    <h2 style="color: #1e293b; margin: 0; font-size: 20px; font-weight: 700;">INVOICE PEMBAYARAN SEWA</h2>
                    <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0; font-family: monospace;">No: ${finalInvoiceId}</p>
                  </div>

                  <div style="margin-bottom: 25px; font-size: 14px; line-height: 1.6; color: #334155;">
                    <p>Halo <strong>${occupantName}</strong>,</p>
                    <p>Pemesanan sewa kamar Anda di <strong>${propertyName}</strong> telah diverifikasi dan disetujui oleh pengelola Samara Stay. Berikut rincian bukti transaksi pelunasan Anda:</p>
                  </div>

                  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin: 25px 0;">
                    <h3 style="color: #1e293b; margin-top: 0; margin-bottom: 15px; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">Rincian Transaksi Hunian</h3>
                    
                    <table style="width: 100%; font-size: 13px; border-collapse: collapse; line-height: 2;">
                      <tr>
                        <td style="color: #64748b; width: 45%; font-weight: 500;">Nama Kos / Unit:</td>
                        <td style="color: #1e293b; font-weight: 700; text-align: right;">${propertyName}</td>
                      </tr>
                      <tr>
                        <td style="color: #64748b; font-weight: 500;">Nomor Kamar:</td>
                        <td style="color: #1e293b; font-weight: 700; text-align: right; font-size: 14px; color: #334155;">Unit ${finalBooking.room_number}</td>
                      </tr>
                      <tr>
                        <td style="color: #64748b; font-weight: 500;">Tipe Kontrak:</td>
                        <td style="color: #1e293b; font-weight: 700; text-align: right; text-transform: capitalize;">${finalBooking.booking_type === "daily" ? "Harian (Daily)" : "Bulanan (Monthly)"}</td>
                      </tr>
                      <tr>
                        <td style="color: #64748b; font-weight: 500;">Tanggal Check-In:</td>
                        <td style="color: #1e293b; font-weight: 700; text-align: right;">${finalBooking.check_in_date || finalBooking.booking_date || "-"}</td>
                      </tr>
                      ${finalBooking.booking_type === "monthly" ? `
                      <tr>
                        <td style="color: #64748b; font-weight: 500;">Durasi Sewa:</td>
                        <td style="color: #1e293b; font-weight: 700; text-align: right;">${finalBooking.duration_months || 1} Bulan</td>
                      </tr>` : `
                      <tr>
                        <td style="color: #64748b; font-weight: 500;">Durasi Sewa:</td>
                        <td style="color: #1e293b; font-weight: 700; text-align: right;">${finalBooking.duration_days || 1} Hari</td>
                      </tr>`}
                      <tr>
                        <td style="color: #64748b; font-weight: 500;">Metode Pembayaran:</td>
                        <td style="color: #1e293b; font-weight: 700; text-align: right; text-transform: uppercase;">${paymentMethodName}</td>
                      </tr>
                      <tr>
                        <td style="color: #64748b; font-weight: 500; border-top: 1px dashed #cbd5e1; padding-top: 12px; margin-top: 8px;">Total Bayar:</td>
                        <td style="color: #047857; font-weight: 900; font-size: 18px; border-top: 1px dashed #cbd5e1; padding-top: 12px; margin-top: 8px; text-align: right;">
                          ${formattedPrice}
                        </td>
                      </tr>
                    </table>
                  </div>

                  <div style="font-size: 13px; line-height: 1.5; color: #475569; margin: 25px 0; padding: 15px; border-left: 4px solid #334155; background-color: #f8fafc; border-radius: 0 12px 12px 0;">
                    <strong style="color: #1e293b; display: block; margin-bottom: 4px;">Alamat Hunian:</strong>
                    ${propertyAddress}
                  </div>

                  <!-- PENGESAHAN TANDA TANGAN DUA PIHAK (OWNER & PEMESAN) -->
                  <div style="margin-top: 25px; padding: 16px; border: 1px dashed #94a3b8; border-radius: 12px; background-color: #ffffff;">
                    <p style="font-size: 10px; color: #475569; font-weight: 800; margin: 0 0 10px 0; text-transform: uppercase; text-align: center; letter-spacing: 0.5px;">PENGESAHAN TANDA TANGAN RESMI:</p>
                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
                      <tr>
                        <td width="50%" align="center" style="padding: 10px; border-right: 1px solid #e2e8f0; vertical-align: bottom;">
                          <p style="font-size: 9px; color: #64748b; font-weight: bold; margin: 0 0 6px 0; text-transform: uppercase;">PIHAK PERTAMA (OWNER)</p>
                          <div style="min-height: 55px; text-align: center;">
                            <img src="cid:owner-signature" alt="Tanda Tangan Owner" style="max-height: 55px; max-width: 140px; display: inline-block;" />
                          </div>
                          <p style="font-size: 9px; color: #1e293b; font-weight: 800; margin: 4px 0 0 0; text-transform: uppercase;">SAMARA STAY MANAGEMENT</p>
                          <p style="font-size: 8px; color: #059669; font-weight: bold; margin: 2px 0 0 0; font-family: monospace;">[ STAMP RESMI ]</p>
                        </td>
                        <td width="50%" align="center" style="padding: 10px; vertical-align: bottom;">
                          <p style="font-size: 9px; color: #64748b; font-weight: bold; margin: 0 0 6px 0; text-transform: uppercase;">PIHAK KEDUA (PEMESAN)</p>
                          <div style="min-height: 55px; text-align: center;">
                            ${finalBooking.signature_url ? `
                              <img src="cid:tenant-signature" alt="Tanda Tangan Pemesan" style="max-height: 55px; max-width: 140px; display: inline-block;" />
                            ` : `
                              <p style="font-size: 10px; color: #059669; font-weight: bold; margin: 15px 0 0 0; font-family: monospace;">\u2713 DISETUJUI DIGITAL</p>
                            `}
                          </div>
                          <p style="font-size: 9px; color: #1e293b; font-weight: 800; margin: 4px 0 0 0; text-transform: uppercase;">${finalBooking.tenant_name || "PENYEWA"}</p>
                          <p style="font-size: 8px; color: #64748b; margin: 2px 0 0 0; font-family: monospace;">TERVERIFIKASI SISTEM</p>
                        </td>
                      </tr>
                    </table>
                  </div>

                  <div style="margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 25px;">
                    <h4 style="color: #1e293b; margin-top: 0; margin-bottom: 12px; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Petunjuk Check-In:</h4>
                    <ol style="font-size: 13px; color: #475569; padding-left: 20px; line-height: 1.7; margin: 0;">
                      <li style="margin-bottom: 8px;">Simpan invoice digital ini sebagai bukti pelunasan yang sah saat serah terima unit.</li>
                      <li style="margin-bottom: 8px;">Akses smart lock pin atau kunci fisik kamar beserta kartu akses akan diberikan oleh asisten hunian kami saat Anda tiba di lokasi.</li>
                      <li>Harap membawa kartu identitas diri asli (KTP / Passport) yang sesuai dengan nama penyewa saat check-in.</li>
                    </ol>
                  </div>

                  <div style="text-align: center; margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 25px; font-size: 11px; color: #94a3b8; line-height: 1.6;">
                    <p style="margin: 0; font-weight: 700; color: #64748b;">Layanan Pengelola Samara Stay Premium Boarding</p>
                    <p style="margin: 4px 0 0 0;">Email: info@samarastay.com | Whatsapp Pengelola Hunian</p>
                    <p style="margin: 20px 0 0 0; font-size: 10px; color: #cbd5e1;">&copy; 2026 Samara Stay Residence. Hak Cipta Dilindungi Undang-Undang.</p>
                  </div>
                </div>
              `;
              let approveOwnerSig = "https://eniwbzpfvwtbsonmnzzr.supabase.co/storage/v1/object/public/signatures/owner_official_signature.png";
              try {
                const { data: setRow } = await supabaseAdmin.from("settings").select("owner_signature_url").eq("id", 1).maybeSingle();
                if (setRow?.owner_signature_url) {
                  approveOwnerSig = setRow.owner_signature_url;
                }
              } catch (sErr) {
              }
              await sendServerEmail(targetEmail, subject, text, html, {
                ownerSigUrl: approveOwnerSig,
                tenantSigUrl: finalBooking.signature_url
              });
            } catch (emailErr) {
              console.warn("[Admin API approve_booking] Background email dispatch notice:", emailErr);
            }
          });
        }
      }
      return res.status(200).json({
        success: true,
        already_approved: wasAlreadyApproved,
        message: wasAlreadyApproved ? "Booking sudah disetujui sebelumnya" : "Booking berhasil disetujui dan diselesaikan secara atomik.",
        booking: finalBooking,
        invoice_id: finalInvoiceId
      });
    } catch (err) {
      console.error("[Admin API] /api/admin/booking/approve exception:", err);
      return res.status(500).json({ success: false, error: err.message || "Terjadi kesalahan pada server saat approval booking." });
    }
  });
  app.post("/api/admin/rooms/save", requireAdminAuth, requirePermission("properties", "update"), express.json(), async (req, res) => {
    try {
      const payload = req.body || {};
      const { property_id, room_number } = payload;
      if (!property_id || !room_number) {
        return res.status(400).json({ success: false, error: "property_id dan room_number wajib diisi." });
      }
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: "Supabase Server Client belum terkonfigurasi." });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      const propAccess = checkPropertyAccess(req.authProfile, property_id);
      if (!propAccess.allowed) {
        return res.status(403).json({ success: false, error: propAccess.reason || "Akses ditolak ke properti ini." });
      }
      const rawId = payload.id;
      const roomId = rawId ? Number(rawId) : null;
      const facilitiesToSync = payload.facilities;
      const allowedCols = [
        "property_id",
        "room_number",
        "room_type",
        "price",
        "size_sqm",
        "floor",
        "status",
        "current_tenant_name",
        "image_url",
        "images",
        "discount_percent",
        "discount_until",
        "is_daily_enabled",
        "daily_price"
      ];
      const cleanData = {};
      for (const col of allowedCols) {
        if (payload[col] !== void 0) {
          cleanData[col] = payload[col];
        }
      }
      const allowedRoomTypes = ["Standard", "Deluxe", "Premium"];
      if (cleanData.room_type && !allowedRoomTypes.includes(cleanData.room_type)) {
        cleanData.room_type = "Premium";
      }
      if (cleanData.property_id !== void 0) cleanData.property_id = Number(cleanData.property_id);
      if (cleanData.price !== void 0) cleanData.price = Number(cleanData.price);
      if (cleanData.size_sqm !== void 0) cleanData.size_sqm = Number(cleanData.size_sqm);
      if (cleanData.floor !== void 0) cleanData.floor = Number(cleanData.floor);
      if (cleanData.daily_price !== void 0) cleanData.daily_price = Number(cleanData.daily_price);
      if (cleanData.discount_percent !== void 0 && cleanData.discount_percent !== null) {
        cleanData.discount_percent = Number(cleanData.discount_percent);
      }
      let savedRoomId;
      let isUpdate = false;
      if (roomId) {
        isUpdate = true;
        const { data: existingRoom, error: checkErr } = await supabaseAdmin.from("rooms").select("id, property_id").eq("id", roomId).maybeSingle();
        if (checkErr || !existingRoom) {
          return res.status(404).json({ success: false, error: "Kamar tidak ditemukan di database." });
        }
        const existingPropAccess = checkPropertyAccess(req.authProfile, existingRoom.property_id);
        if (!existingPropAccess.allowed) {
          return res.status(403).json({ success: false, error: existingPropAccess.reason || "Akses ditolak." });
        }
        const { data: updated, error: updateErr } = await supabaseAdmin.from("rooms").update(cleanData).eq("id", roomId).select().single();
        if (updateErr) {
          console.error("[Admin API saveRoom update error]:", updateErr);
          return res.status(400).json({ success: false, error: `Gagal memperbarui kamar: ${updateErr.message}` });
        }
        savedRoomId = updated.id;
      } else {
        const { data: inserted, error: insertErr } = await supabaseAdmin.from("rooms").insert(cleanData).select().single();
        if (insertErr) {
          console.error("[Admin API saveRoom insert error]:", insertErr);
          return res.status(400).json({ success: false, error: `Gagal menambahkan kamar: ${insertErr.message}` });
        }
        savedRoomId = inserted.id;
      }
      if (facilitiesToSync !== void 0 && Array.isArray(facilitiesToSync)) {
        const targetFacilityIds = [];
        for (const item of facilitiesToSync) {
          if (typeof item === "number") {
            targetFacilityIds.push(item);
          } else if (item && typeof item === "object") {
            const fid = item.id || item.facility_id;
            if (fid) targetFacilityIds.push(Number(fid));
          }
        }
        const { data: currentAssociations } = await supabaseAdmin.from("room_facilities").select("facility_id").eq("room_id", savedRoomId);
        const currentFacilityIds = (currentAssociations || []).map((a) => Number(a.facility_id));
        const toDelete = currentFacilityIds.filter((fid) => !targetFacilityIds.includes(fid));
        const toInsert = targetFacilityIds.filter((fid) => !currentFacilityIds.includes(fid));
        if (toDelete.length > 0) {
          await supabaseAdmin.from("room_facilities").delete().eq("room_id", savedRoomId).in("facility_id", toDelete);
        }
        if (toInsert.length > 0) {
          const insertPayloads = toInsert.map((fid) => ({
            room_id: savedRoomId,
            facility_id: fid
          }));
          await supabaseAdmin.from("room_facilities").insert(insertPayloads);
        }
      }
      try {
        const targetPropId = Number(cleanData.property_id || property_id);
        const { data: propRooms } = await supabaseAdmin.from("rooms").select("id, status").eq("property_id", targetPropId);
        const totalRooms = propRooms ? propRooms.length : 0;
        const availableRooms = propRooms ? propRooms.filter((r) => r.status === "available" || r.status === "reserved" || !r.status).length : 0;
        await supabaseAdmin.from("properties").update({ total_rooms: totalRooms, available_rooms: availableRooms }).eq("id", targetPropId);
      } catch (countErr) {
        console.warn("[Admin API saveRoom] Property count sync notice:", countErr);
      }
      const { data: finalRoomData } = await supabaseAdmin.from("rooms").select(`
          *,
          room_facilities (
            facility_id,
            facilities (
              id,
              name,
              icon,
              category,
              description
            )
          )
        `).eq("id", savedRoomId).maybeSingle();
      let finalRoom = finalRoomData;
      if (finalRoom) {
        const resolvedFacilities = (finalRoom.room_facilities || []).map((rf) => rf?.facilities).filter(Boolean);
        finalRoom = {
          ...finalRoom,
          facilities: resolvedFacilities
        };
        delete finalRoom.room_facilities;
      }
      try {
        await supabaseAdmin.from("activity_logs").insert({
          admin_name: req.authProfile?.full_name || req.authUser?.email || "Admin",
          action: isUpdate ? "UPDATE_ROOM" : "CREATE_ROOM",
          detail: `Unit ${cleanData.room_number || ""} disimpan oleh ${req.authProfile?.full_name || "Admin"}`,
          ip_address: "127.0.0.1"
        });
      } catch (logErr) {
      }
      return res.status(200).json({
        success: true,
        data: finalRoom,
        message: "Kamar berhasil disimpan."
      });
    } catch (err) {
      console.error("[Admin API /api/admin/rooms/save] exception:", err);
      return res.status(500).json({ success: false, error: err.message || "Terjadi kesalahan pada server saat menyimpan kamar." });
    }
  });
  app.delete("/api/admin/rooms/:id", requireAdminAuth, requirePermission("properties", "delete"), async (req, res) => {
    try {
      const roomId = Number(req.params.id);
      if (!roomId || isNaN(roomId)) {
        return res.status(400).json({ success: false, error: "ID kamar tidak valid." });
      }
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: "Supabase Server Client belum terkonfigurasi." });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      const { data: targetRoom, error: fetchErr } = await supabaseAdmin.from("rooms").select("*").eq("id", roomId).maybeSingle();
      if (fetchErr || !targetRoom) {
        return res.status(404).json({ success: false, error: "Kamar tidak ditemukan." });
      }
      const propAccess = checkPropertyAccess(req.authProfile, targetRoom.property_id);
      if (!propAccess.allowed) {
        return res.status(403).json({ success: false, error: propAccess.reason || "Akses ditolak ke properti ini." });
      }
      await supabaseAdmin.from("room_facilities").delete().eq("room_id", roomId);
      const { error: delErr } = await supabaseAdmin.from("rooms").delete().eq("id", roomId);
      if (delErr) {
        return res.status(400).json({ success: false, error: `Gagal menghapus kamar: ${delErr.message}` });
      }
      try {
        const { data: propRooms } = await supabaseAdmin.from("rooms").select("id, status").eq("property_id", targetRoom.property_id);
        const totalRooms = propRooms ? propRooms.length : 0;
        const availableRooms = propRooms ? propRooms.filter((r) => r.status === "available" || r.status === "reserved" || !r.status).length : 0;
        await supabaseAdmin.from("properties").update({ total_rooms: totalRooms, available_rooms: availableRooms }).eq("id", targetRoom.property_id);
      } catch (countErr) {
        console.warn("[Admin API deleteRoom] Property count sync notice:", countErr);
      }
      try {
        await supabaseAdmin.from("activity_logs").insert({
          admin_name: req.authProfile?.full_name || req.authUser?.email || "Admin",
          action: "DELETE_ROOM",
          detail: `Menghapus unit ID: ${roomId} (Unit ${targetRoom.room_number})`,
          ip_address: "127.0.0.1"
        });
      } catch (logErr) {
      }
      return res.status(200).json({ success: true, message: "Kamar berhasil dihapus." });
    } catch (err) {
      console.error("[Admin API /api/admin/rooms/:id DELETE] exception:", err);
      return res.status(500).json({ success: false, error: err.message || "Terjadi kesalahan pada server saat menghapus kamar." });
    }
  });
  app.post("/api/admin/maps/resolve-link", requireAdminAuth, requirePermission("properties", "read"), express.json(), async (req, res) => {
    try {
      let extractCoords = function(str) {
        if (!str || typeof str !== "string") return null;
        let s = str.trim();
        try {
          s = decodeURIComponent(s);
        } catch (e) {
        }
        s = s.replace(/[\u2212\u2013\u2014]/g, "-");
        const mAt = s.match(/@(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
        if (mAt) {
          let lat = parseFloat(mAt[1]);
          let lng = parseFloat(mAt[2]);
          if (!isNaN(lat) && !isNaN(lng)) {
            if (lat > 0 && lat <= 11 && lng >= 95 && lng <= 142) lat = -lat;
            return { lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)) };
          }
        }
        const mQ = s.match(/[?&/](?:q|query|ll|search|destination|center|saddr|daddr)(?:=|\/)?(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/i);
        if (mQ) {
          let lat = parseFloat(mQ[1]);
          let lng = parseFloat(mQ[2]);
          if (!isNaN(lat) && !isNaN(lng)) {
            if (lat > 0 && lat <= 11 && lng >= 95 && lng <= 142) lat = -lat;
            return { lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)) };
          }
        }
        const mEmA = s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
        if (mEmA) {
          let lat = parseFloat(mEmA[1]);
          let lng = parseFloat(mEmA[2]);
          if (!isNaN(lat) && !isNaN(lng)) {
            if (lat > 0 && lat <= 11 && lng >= 95 && lng <= 142) lat = -lat;
            return { lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)) };
          }
        }
        const mEmB = s.match(/!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)/);
        if (mEmB) {
          let lng = parseFloat(mEmB[1]);
          let lat = parseFloat(mEmB[2]);
          if (!isNaN(lat) && !isNaN(lng)) {
            if (lat > 0 && lat <= 11 && lng >= 95 && lng <= 142) lat = -lat;
            return { lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)) };
          }
        }
        const mComma = s.match(/(-?\d+),(\d{3,8})[\s,;]+(-?\d+),(\d{3,8})/);
        if (mComma) {
          let lat = parseFloat(`${mComma[1]}.${mComma[2]}`);
          let lng = parseFloat(`${mComma[3]}.${mComma[4]}`);
          if (!isNaN(lat) && !isNaN(lng)) {
            if (lat > 0 && lat <= 11 && lng >= 95 && lng <= 142) lat = -lat;
            return { lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)) };
          }
        }
        const mPlain = s.match(/(-?\d{1,2}\.\d+)[,\s;\t/]+(-?\d{1,3}\.\d+)/);
        if (mPlain) {
          let lat = parseFloat(mPlain[1]);
          let lng = parseFloat(mPlain[2]);
          if (!isNaN(lat) && !isNaN(lng)) {
            if ((lat > 90 || lat >= 95 && lat <= 142) && (lng >= -11 && lng <= 11)) {
              const t = lat;
              lat = lng;
              lng = t;
            }
            if (lat > 0 && lat <= 11 && lng >= 95 && lng <= 142) lat = -lat;
            return { lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)) };
          }
        }
        return null;
      };
      const rawUrl = (req.body?.url || req.query?.url || "").toString().trim();
      if (!rawUrl) {
        return res.status(400).json({ success: false, error: "URL link Google Maps wajib diisi." });
      }
      const directMatch = extractCoords(rawUrl);
      if (directMatch) {
        return res.json({ success: true, lat: directMatch.lat, lng: directMatch.lng, resolvedUrl: rawUrl });
      }
      let parsedUrl;
      try {
        parsedUrl = new URL(rawUrl);
      } catch {
        return res.status(400).json({ success: false, error: "URL link Google Maps tidak valid." });
      }
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return res.status(400).json({ success: false, error: "Hanya protokol HTTP/HTTPS yang didukung." });
      }
      const hostname = parsedUrl.hostname.toLowerCase();
      const ALLOWED_MAPS_HOSTS = [
        "maps.google.com",
        "maps.app.goo.gl",
        "goo.gl",
        "google.com",
        "www.google.com",
        "google.co.id",
        "www.google.co.id"
      ];
      const isAllowedHost = ALLOWED_MAPS_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`));
      if (!isAllowedHost) {
        return res.status(400).json({
          success: false,
          error: "Hanya tautan resmi Google Maps (maps.google.com, maps.app.goo.gl, goo.gl) yang diizinkan."
        });
      }
      if (hostname === "localhost" || hostname.startsWith("127.") || hostname.startsWith("10.") || hostname.startsWith("192.168.") || hostname.startsWith("169.254.") || hostname === "::1") {
        return res.status(400).json({ success: false, error: "Akses ke alamat internal atau metadata server diblokir." });
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 9e3);
      try {
        const fetchResp = await fetch(rawUrl, {
          method: "GET",
          redirect: "follow",
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7"
          }
        });
        clearTimeout(timeoutId);
        const finalUrl = fetchResp.url || rawUrl;
        let coords = extractCoords(finalUrl);
        if (!coords) {
          const html = await fetchResp.text();
          coords = extractCoords(html);
          if (!coords) {
            const centerM = html.match(/(?:center|ll|query|q)=([-\d\.]+)(?:%2C|,)([-\d\.]+)/i);
            if (centerM) {
              let lat = parseFloat(centerM[1]);
              let lng = parseFloat(centerM[2]);
              if (!isNaN(lat) && !isNaN(lng)) {
                if (lat > 0 && lat <= 11 && lng >= 95 && lng <= 142) lat = -lat;
                coords = { lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)) };
              }
            }
          }
        }
        if (coords) {
          return res.json({
            success: true,
            lat: coords.lat,
            lng: coords.lng,
            resolvedUrl: finalUrl
          });
        }
        return res.status(422).json({
          success: false,
          error: "Tidak dapat menemukan koordinat dari link tersebut. Pastikan tautan mengarah ke lokasi Google Maps yang tepat."
        });
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        console.warn("[Admin API resolve-link] Fetch failed:", fetchErr);
        return res.status(500).json({
          success: false,
          error: `Gagal membaca tautan: ${fetchErr.message || "Koneksi timeout"}`
        });
      }
    } catch (err) {
      console.error("[Admin API resolve-link] exception:", err);
      return res.status(500).json({ success: false, error: err.message || "Server error" });
    }
  });
  app.post("/api/admin/properties/save", requireAdminAuth, requirePermission("properties", "update"), express.json(), async (req, res) => {
    try {
      const payload = req.body || {};
      const { name, address } = payload;
      const role = (req.authProfile?.role || "").toLowerCase();
      if (!["super", "super_admin", "owner", "admin"].includes(role)) {
        return res.status(403).json({ success: false, error: "Akses ditolak. Hanya Administrator atau Owner yang dapat mengelola properti." });
      }
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: "Supabase Server Client belum terkonfigurasi." });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      const rawId = payload.id;
      const propId = rawId ? Number(rawId) : null;
      let existingProp = null;
      if (propId) {
        const { data: found } = await supabaseAdmin.from("properties").select("*").eq("id", propId).maybeSingle();
        existingProp = found;
      }
      const effectiveName = name || existingProp?.name;
      const effectiveAddress = address || existingProp?.address;
      if (!effectiveName || !effectiveAddress) {
        return res.status(400).json({ success: false, error: "Nama dan alamat properti wajib diisi." });
      }
      const facilitiesToSync = payload.facilities;
      const allowedCols = [
        "name",
        "address",
        "price",
        "type",
        "total_rooms",
        "available_rooms",
        "facilities",
        "image_url",
        "images",
        "lat",
        "lng",
        "description",
        "additional_rules",
        "policies",
        "terms",
        "regulations"
      ];
      const cleanData = {};
      for (const col of allowedCols) {
        if (payload[col] !== void 0) {
          cleanData[col] = payload[col];
        }
      }
      cleanData.name = effectiveName;
      cleanData.address = effectiveAddress;
      if (payload.price !== void 0 || payload.starting_price !== void 0) {
        cleanData.price = Number(payload.price ?? payload.starting_price ?? 0);
      }
      if (payload.type !== void 0) {
        const allowedTypes = ["putra", "putri", "campur"];
        cleanData.type = allowedTypes.includes(payload.type) ? payload.type : "campur";
      }
      if (payload.facilities !== void 0) {
        if (Array.isArray(payload.facilities)) {
          cleanData.facilities = payload.facilities.map((f) => typeof f === "object" ? f.name || "" : String(f)).filter(Boolean);
        } else {
          cleanData.facilities = [];
        }
      }
      if (payload.images !== void 0) {
        cleanData.images = Array.isArray(payload.images) ? payload.images : [];
      }
      if (cleanData.lat !== void 0 && cleanData.lng !== void 0) {
        let nLat = typeof cleanData.lat === "number" ? cleanData.lat : parseFloat(String(cleanData.lat).trim().replace(/[\u2212\u2013\u2014]/g, "-").replace(",", "."));
        let nLng = typeof cleanData.lng === "number" ? cleanData.lng : parseFloat(String(cleanData.lng).trim().replace(/[\u2212\u2013\u2014]/g, "-").replace(",", "."));
        if (!isNaN(nLat) && !isNaN(nLng)) {
          if ((nLat > 90 || nLat >= 95 && nLat <= 142) && (nLng >= -11 && nLng <= 11)) {
            const temp = nLat;
            nLat = nLng;
            nLng = temp;
          }
          if (nLng >= 95 && nLng <= 142 && nLat > 0 && nLat <= 11) {
            nLat = -nLat;
          }
          cleanData.lat = parseFloat(nLat.toFixed(6));
          cleanData.lng = parseFloat(nLng.toFixed(6));
        }
      } else {
        if (cleanData.lat !== void 0) {
          const parsed = parseFloat(String(cleanData.lat).trim().replace(/[\u2212\u2013\u2014]/g, "-").replace(",", "."));
          if (!isNaN(parsed)) cleanData.lat = parseFloat(parsed.toFixed(6));
        }
        if (cleanData.lng !== void 0) {
          const parsed = parseFloat(String(cleanData.lng).trim().replace(/[\u2212\u2013\u2014]/g, "-").replace(",", "."));
          if (!isNaN(parsed)) cleanData.lng = parseFloat(parsed.toFixed(6));
        }
      }
      const depAmt = payload.deposit_amount;
      if (depAmt !== void 0 && depAmt !== null) {
        let termsStr = cleanData.terms || existingProp?.terms || "";
        if (termsStr.includes("[DEPOSIT:")) {
          termsStr = termsStr.replace(/\[DEPOSIT:\d+\]/, `[DEPOSIT:${depAmt}]`);
        } else {
          termsStr = termsStr ? `${termsStr}
[DEPOSIT:${depAmt}]` : `[DEPOSIT:${depAmt}]`;
        }
        cleanData.terms = termsStr;
      }
      delete cleanData.deposit_amount;
      let savedPropId;
      let isUpdate = false;
      if (propId) {
        isUpdate = true;
        const { data: updated, error: updateErr } = await supabaseAdmin.from("properties").update(cleanData).eq("id", propId).select().single();
        if (updateErr) {
          return res.status(400).json({ success: false, error: `Gagal memperbarui properti: ${updateErr.message}` });
        }
        savedPropId = updated.id;
      } else {
        const { data: inserted, error: insertErr } = await supabaseAdmin.from("properties").insert(cleanData).select().single();
        if (insertErr) {
          return res.status(400).json({ success: false, error: `Gagal menambahkan properti: ${insertErr.message}` });
        }
        savedPropId = inserted.id;
      }
      if (facilitiesToSync !== void 0 && Array.isArray(facilitiesToSync)) {
        const targetFacilityIds = [];
        for (const item of facilitiesToSync) {
          if (typeof item === "number") {
            targetFacilityIds.push(item);
          } else if (item && typeof item === "object") {
            const fid = item.id || item.facility_id;
            if (fid) targetFacilityIds.push(Number(fid));
          }
        }
        const { data: currentAssoc } = await supabaseAdmin.from("property_facilities").select("facility_id").eq("property_id", savedPropId);
        const currentFacilityIds = (currentAssoc || []).map((a) => Number(a.facility_id));
        const toDelete = currentFacilityIds.filter((fid) => !targetFacilityIds.includes(fid));
        const toInsert = targetFacilityIds.filter((fid) => !currentFacilityIds.includes(fid));
        if (toDelete.length > 0) {
          await supabaseAdmin.from("property_facilities").delete().eq("property_id", savedPropId).in("facility_id", toDelete);
        }
        if (toInsert.length > 0) {
          await supabaseAdmin.from("property_facilities").insert(toInsert.map((fid) => ({ property_id: savedPropId, facility_id: fid })));
        }
      }
      const { data: finalProp } = await supabaseAdmin.from("properties").select(`
          *,
          property_facilities (
            facility_id,
            facilities (
              id,
              name,
              icon,
              category,
              description
            )
          )
        `).eq("id", savedPropId).maybeSingle();
      let resultProp = finalProp;
      if (resultProp) {
        const resolvedFacilities = (resultProp.property_facilities || []).map((pf) => pf?.facilities).filter(Boolean);
        resultProp = { ...resultProp, facilities: resolvedFacilities };
        delete resultProp.property_facilities;
      }
      try {
        await supabaseAdmin.from("activity_logs").insert({
          admin_name: req.authProfile?.full_name || req.authUser?.email || "Admin",
          action: isUpdate ? "UPDATE_PROPERTY" : "CREATE_PROPERTY",
          detail: `Properti ${cleanData.name || ""} berhasil disimpan.`,
          ip_address: "127.0.0.1"
        });
      } catch (logErr) {
      }
      return res.status(200).json({ success: true, data: resultProp, message: "Properti berhasil disimpan." });
    } catch (err) {
      console.error("[Admin API /api/admin/properties/save] exception:", err);
      return res.status(500).json({ success: false, error: err.message || "Terjadi kesalahan pada server saat menyimpan properti." });
    }
  });
  app.post("/api/admin/amenities/save", requireAdminAuth, requirePermission("properties", "update"), express.json(), async (req, res) => {
    try {
      const payload = req.body || {};
      const role = (req.authProfile?.role || "").toLowerCase();
      if (!["super", "super_admin", "owner", "admin"].includes(role)) {
        return res.status(403).json({ success: false, error: "Akses ditolak. Hanya Administrator atau Owner yang dapat mengelola fasilitas sekitar." });
      }
      if (!payload.name || !payload.category || payload.lat === void 0 || payload.lng === void 0) {
        return res.status(400).json({ success: false, error: "Nama, kategori, latitude, dan longitude fasilitas wajib diisi." });
      }
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: "Supabase Server Client belum terkonfigurasi." });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      const VALID_AMENITY_CATEGORIES = ["transit", "education", "healthcare", "shopping", "dining", "worship", "lifestyle"];
      const rawCategory = String(payload.category || "").toLowerCase().trim();
      const safeCategory = VALID_AMENITY_CATEGORIES.includes(rawCategory) ? rawCategory : "transit";
      const record = {
        property_id: Number(payload.property_id || payload.propertyId),
        name: String(payload.name).trim(),
        category: safeCategory,
        distance_meters: Math.round(Number(payload.distance_meters ?? payload.distanceMeters ?? 0)),
        walking_minutes: Math.max(1, Math.round(Number(payload.walking_minutes ?? payload.walking_time_minutes ?? payload.walkingTimeMinutes ?? 1))),
        driving_minutes: Math.max(1, Math.round(Number(payload.driving_minutes ?? payload.driving_time_minutes ?? payload.drivingTimeMinutes ?? 1))),
        lat: Number(payload.lat),
        lng: Number(payload.lng),
        description: payload.description || "",
        address: payload.address || "",
        icon_name: payload.icon_name || payload.icon || null,
        is_active: payload.is_active !== void 0 ? payload.is_active : true,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (payload.id && !String(payload.id).startsWith("temp-") && !String(payload.id).startsWith("new-")) {
        record.id = String(payload.id);
      }
      const { data, error } = await supabaseAdmin.from("nearby_amenities").upsert(record).select().single();
      if (error) {
        console.error("[Admin API /api/admin/amenities/save] error:", error);
        return res.status(500).json({ success: false, error: error.message });
      }
      return res.status(200).json({
        success: true,
        data: {
          id: String(data.id),
          propertyId: Number(data.property_id),
          name: String(data.name),
          category: data.category,
          distanceMeters: Number(data.distance_meters),
          walkingTimeMinutes: Number(data.walking_minutes),
          drivingTimeMinutes: Number(data.driving_minutes),
          lat: Number(data.lat),
          lng: Number(data.lng),
          description: data.description,
          address: data.address,
          icon: data.icon_name
        }
      });
    } catch (err) {
      console.error("[Admin API /api/admin/amenities/save] exception:", err);
      return res.status(500).json({ success: false, error: err.message || "Internal server error" });
    }
  });
  app.post("/api/admin/amenities/delete", requireAdminAuth, requirePermission("properties", "delete"), express.json(), async (req, res) => {
    try {
      const { id } = req.body || {};
      if (!id) {
        return res.status(400).json({ success: false, error: "ID fasilitas wajib diisi." });
      }
      const role = (req.authProfile?.role || "").toLowerCase();
      if (!["super", "super_admin", "owner", "admin"].includes(role)) {
        return res.status(403).json({ success: false, error: "Akses ditolak." });
      }
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: "Supabase belum terkonfigurasi." });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      const { error } = await supabaseAdmin.from("nearby_amenities").delete().eq("id", String(id));
      if (error) {
        return res.status(500).json({ success: false, error: error.message });
      }
      return res.status(200).json({ success: true, message: "Fasilitas berhasil dihapus." });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message || "Internal server error" });
    }
  });
  app.post("/api/admin/amenities/batch", requireAdminAuth, requirePermission("properties", "update"), express.json(), async (req, res) => {
    try {
      const { amenities, property_id } = req.body || {};
      if (!Array.isArray(amenities) || amenities.length === 0) {
        return res.status(400).json({ success: false, error: "Daftar fasilitas wajib diisi." });
      }
      const role = (req.authProfile?.role || "").toLowerCase();
      if (!["super", "super_admin", "owner", "admin"].includes(role)) {
        return res.status(403).json({ success: false, error: "Akses ditolak." });
      }
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: "Supabase belum terkonfigurasi." });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      const VALID_AMENITY_CATEGORIES = ["transit", "education", "healthcare", "shopping", "dining", "worship", "lifestyle"];
      const records = amenities.map((a) => {
        const rawCat = String(a.category || "").toLowerCase().trim();
        const safeCat = VALID_AMENITY_CATEGORIES.includes(rawCat) ? rawCat : "transit";
        const item = {
          property_id: Number(property_id || a.property_id || a.propertyId),
          name: String(a.name).trim(),
          category: safeCat,
          distance_meters: Math.round(Number(a.distance_meters ?? a.distanceMeters ?? 0)),
          walking_minutes: Math.max(1, Math.round(Number(a.walking_minutes ?? a.walking_time_minutes ?? a.walkingTimeMinutes ?? 1))),
          driving_minutes: Math.max(1, Math.round(Number(a.driving_minutes ?? a.driving_time_minutes ?? a.drivingTimeMinutes ?? 1))),
          lat: Number(a.lat),
          lng: Number(a.lng),
          description: a.description || "",
          address: a.address || "",
          icon_name: a.icon_name || a.icon || null,
          is_active: true,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        };
        if (a.id && !String(a.id).startsWith("temp-") && !String(a.id).startsWith("new-")) {
          item.id = String(a.id);
        }
        return item;
      });
      const { data, error } = await supabaseAdmin.from("nearby_amenities").upsert(records, { onConflict: "id" }).select();
      if (error) {
        return res.status(500).json({ success: false, error: error.message });
      }
      return res.status(200).json({ success: true, count: data?.length || records.length });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message || "Internal server error" });
    }
  });
  app.post("/api/admin/settings/save", requireAdminAuth, requirePermission("system_settings", "update"), express.json(), async (req, res) => {
    try {
      const payload = req.body || {};
      const role = (req.authProfile?.role || "").toLowerCase();
      if (!["super", "super_admin", "owner", "admin"].includes(role)) {
        return res.status(403).json({ success: false, error: "Akses ditolak. Hanya Administrator atau Owner yang dapat mengelola pengaturan sistem." });
      }
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: "Supabase Server Client belum terkonfigurasi." });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      const updateData = {};
      if (payload.booking_rules !== void 0) updateData.booking_rules = payload.booking_rules;
      if (payload.survey_rules !== void 0) updateData.survey_rules = payload.survey_rules;
      if (payload.why_choose_us !== void 0) updateData.why_choose_us = payload.why_choose_us;
      if (payload.faqs !== void 0) updateData.faqs = payload.faqs;
      if (payload.owner_signature_url !== void 0) updateData.owner_signature_url = payload.owner_signature_url;
      if (payload.standard_facilities !== void 0) {
        updateData.standard_facilities = typeof payload.standard_facilities === "string" ? payload.standard_facilities : JSON.stringify(payload.standard_facilities);
      }
      updateData.updated_at = (/* @__PURE__ */ new Date()).toISOString();
      const { data: existing } = await supabaseAdmin.from("settings").select("id").eq("id", 1).maybeSingle();
      let resultData = null;
      if (existing) {
        const { data, error } = await supabaseAdmin.from("settings").update(updateData).eq("id", 1).select().single();
        if (error) throw error;
        resultData = data;
      } else {
        const { data, error } = await supabaseAdmin.from("settings").insert({ id: 1, ...updateData }).select().single();
        if (error) throw error;
        resultData = data;
      }
      try {
        await supabaseAdmin.from("activity_logs").insert({
          admin_name: req.authProfile?.full_name || req.authUser?.email || "Admin",
          action: "UPDATE_SETTINGS",
          detail: "Pengaturan sistem & fasilitas beranda diperbarui oleh admin.",
          ip_address: "127.0.0.1"
        });
      } catch (logErr) {
      }
      return res.status(200).json({ success: true, data: resultData, message: "Pengaturan berhasil disimpan." });
    } catch (err) {
      console.error("[Admin API /api/admin/settings/save] exception:", err);
      return res.status(500).json({ success: false, error: err.message || "Terjadi kesalahan server saat menyimpan pengaturan." });
    }
  });
  app.post("/api/admin/settings/facilities", requireAdminAuth, requirePermission("system_settings", "update"), express.json(), async (req, res) => {
    try {
      const payload = req.body || {};
      const role = (req.authProfile?.role || "").toLowerCase();
      if (!["super", "super_admin", "owner", "admin"].includes(role)) {
        return res.status(403).json({ success: false, error: "Akses ditolak. Hanya Administrator atau Owner yang dapat mengatur fasilitas beranda." });
      }
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: "Supabase Server Client belum terkonfigurasi." });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      let standardFacilitiesStr = "[]";
      if (typeof payload.standard_facilities === "string") {
        standardFacilitiesStr = payload.standard_facilities;
      } else if (Array.isArray(payload.facilities)) {
        standardFacilitiesStr = JSON.stringify(payload.facilities);
      } else if (payload.facilities) {
        standardFacilitiesStr = JSON.stringify(payload.facilities);
      }
      const { data: existing } = await supabaseAdmin.from("settings").select("id").eq("id", 1).maybeSingle();
      if (existing) {
        const { error } = await supabaseAdmin.from("settings").update({ standard_facilities: standardFacilitiesStr, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", 1);
        if (error) throw error;
      } else {
        const { error } = await supabaseAdmin.from("settings").insert({ id: 1, standard_facilities: standardFacilitiesStr, updated_at: (/* @__PURE__ */ new Date()).toISOString() });
        if (error) throw error;
      }
      try {
        await supabaseAdmin.from("activity_logs").insert({
          admin_name: req.authProfile?.full_name || req.authUser?.email || "Admin",
          action: "UPDATE_HOMEPAGE_FACILITIES",
          detail: `Fasilitas beranda diperbarui oleh admin.`,
          ip_address: "127.0.0.1"
        });
      } catch (logErr) {
      }
      return res.status(200).json({ success: true, message: "Fasilitas tampilan beranda berhasil diperbarui." });
    } catch (err) {
      console.error("[Admin API /api/admin/settings/facilities] exception:", err);
      return res.status(500).json({ success: false, error: err.message || "Terjadi kesalahan server saat memperbarui fasilitas beranda." });
    }
  });
  app.delete("/api/admin/properties/:id", requireAdminAuth, requirePermission("properties_close", "delete"), async (req, res) => {
    try {
      const propId = Number(req.params.id);
      if (!propId || isNaN(propId)) {
        return res.status(400).json({ success: false, error: "ID properti tidak valid." });
      }
      const role = (req.authProfile?.role || "").toLowerCase();
      if (!["super", "super_admin", "owner"].includes(role)) {
        return res.status(403).json({ success: false, error: "Akses ditolak. Hanya Super Admin atau Owner yang dapat menghapus properti." });
      }
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: "Supabase Server Client belum terkonfigurasi." });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      await supabaseAdmin.from("property_facilities").delete().eq("property_id", propId);
      const { data: propRooms } = await supabaseAdmin.from("rooms").select("id").eq("property_id", propId);
      if (propRooms && propRooms.length > 0) {
        const roomIds = propRooms.map((r) => r.id);
        await supabaseAdmin.from("room_facilities").delete().in("room_id", roomIds);
        await supabaseAdmin.from("rooms").delete().eq("property_id", propId);
      }
      const { error: delErr } = await supabaseAdmin.from("properties").delete().eq("id", propId);
      if (delErr) {
        if (delErr.code === "23503" || delErr.message.toLowerCase().includes("foreign key") || delErr.message.toLowerCase().includes("violates foreign key constraint") || delErr.message.toLowerCase().includes("journal_entries") || delErr.message.toLowerCase().includes("restrict")) {
          return res.status(400).json({
            success: false,
            error: "Properti tidak dapat dihapus karena masih memiliki riwayat transaksi keuangan atau jurnal pembukuan terkait (FK RESTRICT)."
          });
        }
        return res.status(400).json({ success: false, error: `Gagal menghapus properti: ${delErr.message}` });
      }
      try {
        await supabaseAdmin.from("activity_logs").insert({
          admin_name: req.authProfile?.full_name || req.authUser?.email || "Admin",
          action: "DELETE_PROPERTY",
          detail: `Menghapus properti ID: ${propId}`,
          ip_address: "127.0.0.1"
        });
      } catch (logErr) {
      }
      return res.status(200).json({ success: true, message: "Properti berhasil dihapus." });
    } catch (err) {
      console.error("[Admin API /api/admin/properties/:id DELETE] exception:", err);
      return res.status(500).json({ success: false, error: err.message || "Terjadi kesalahan pada server saat menghapus properti." });
    }
  });
  app.post("/api/midtrans/charge", apiRateLimiter(6e4, 30), async (req, res) => {
    try {
      const { order_id, gross_amount, customer_details, item_details } = req.body;
      if (!order_id || typeof order_id !== "string" || !order_id.trim()) {
        return res.status(400).json({ success: false, error: "order_id wajib disertakan." });
      }
      const numGrossAmount = Number(gross_amount);
      if (!numGrossAmount || isNaN(numGrossAmount) || numGrossAmount <= 0) {
        return res.status(400).json({ success: false, error: "gross_amount harus berupa angka positif." });
      }
      try {
        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
        const serviceKey = getServiceRoleKeyOrThrow();
        if (supabaseUrl && serviceKey) {
          const checkClient = createClient(supabaseUrl, serviceKey);
          const { data: b } = await checkClient.from("bookings").select("total_price, dp_amount, is_dp").eq("midtrans_order_id", order_id.trim()).maybeSingle();
          if (b) {
            const expected = Number(b.is_dp ? b.dp_amount || 5e5 : b.total_price);
            if (expected > 0 && Math.abs(expected - numGrossAmount) >= 1) {
              return res.status(400).json({
                success: false,
                error: `Nominal pembayaran (Rp ${numGrossAmount.toLocaleString("id-ID")}) tidak sesuai dengan tagihan booking (Rp ${expected.toLocaleString("id-ID")}).`
              });
            }
          }
        }
      } catch (checkErr) {
        console.warn("[MIDTRANS CHARGE] Booking price pre-validation notice:", checkErr);
      }
      let rawServerKey = process.env.MIDTRANS_SERVER_KEY || "";
      let serverKey = rawServerKey.trim();
      if (serverKey.startsWith('"') && serverKey.endsWith('"')) {
        serverKey = serverKey.slice(1, -1);
      } else if (serverKey.startsWith("'") && serverKey.endsWith("'")) {
        serverKey = serverKey.slice(1, -1);
      }
      serverKey = serverKey.trim();
      console.log("[MIDTRANS DIAGNOSTICS]", {
        rawLength: rawServerKey.length,
        cleanedLength: serverKey.length,
        startsWithSB: serverKey.startsWith("SB-Mid-"),
        hasQuotes: rawServerKey !== serverKey,
        prefix: serverKey.slice(0, 11),
        suffix: serverKey.slice(-4)
      });
      if (!serverKey || serverKey === "YOUR_MIDTRANS_SERVER_KEY_HERE" || serverKey === "MY_MIDTRANS_SERVER_KEY" || serverKey === "") {
        console.error("[MIDTRANS ERROR] Server Key is not configured.");
        return res.status(400).json({
          success: false,
          error: "MIDTRANS_SERVER_KEY tidak ditemukan atau belum dikonfigurasi di server. Silakan hubungi admin."
        });
      }
      const authHeader = Buffer.from(`${serverKey}:`).toString("base64");
      const isProduction = process.env.MIDTRANS_IS_PRODUCTION === "true";
      const midtransUrl = isProduction ? "https://app.midtrans.com/snap/v1/transactions" : "https://app.sandbox.midtrans.com/snap/v1/transactions";
      const payload = {
        transaction_details: {
          order_id,
          gross_amount
        },
        credit_card: {
          secure: true
        },
        customer_details,
        item_details
      };
      console.log(`[MIDTRANS REAL] Forwarding request to Midtrans API: ${midtransUrl} (${isProduction ? "Production" : "Sandbox"})`);
      addMidtransLog({
        orderId: order_id || "unknown",
        customerName: customer_details?.first_name || "Anonymous",
        customerEmail: customer_details?.email || "N/A",
        amount: gross_amount,
        type: "charge",
        status: "initiated",
        message: `Sending charge request to Midtrans ${isProduction ? "Production" : "Sandbox"}`,
        details: { url: midtransUrl, mode: isProduction ? "production" : "sandbox" }
      });
      const response = await fetch(midtransUrl, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "Authorization": `Basic ${authHeader}`
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error_messages ? data.error_messages.join(", ") : data.message || "Midtrans API Error");
      }
      addMidtransLog({
        orderId: order_id || "unknown",
        customerName: customer_details?.first_name || "Anonymous",
        customerEmail: customer_details?.email || "N/A",
        amount: gross_amount,
        type: "charge",
        status: "success",
        message: `Successfully obtained Midtrans Snap Token for order ${order_id}`,
        details: { token: data.token, mode: isProduction ? "production" : "sandbox" }
      });
      return res.json({
        token: data.token,
        redirect_url: data.redirect_url,
        mode: isProduction ? "production" : "sandbox"
      });
    } catch (error) {
      console.error("[MIDTRANS REAL ERROR]", error);
      addMidtransLog({
        orderId: req.body?.order_id || "unknown",
        customerName: req.body?.customer_details?.first_name || "Anonymous",
        customerEmail: req.body?.customer_details?.email || "N/A",
        amount: req.body?.gross_amount,
        type: "error",
        status: "failed",
        message: `Midtrans charge failed: ${error.message || "Unknown error"}.`,
        details: { error: error.message || "Unknown error" }
      });
      return res.status(400).json({
        success: false,
        error: `Gagal memproses pembayaran Midtrans: ${error.message || "Unknown error"}`
      });
    }
  });
  async function syncPropertyRoomCountInSupabase(supabaseClient, propertyId) {
    if (!propertyId) return;
    try {
      const { data: pRooms, error: roomErr } = await supabaseClient.from("rooms").select("*").eq("property_id", propertyId);
      if (!roomErr && pRooms) {
        const total = pRooms.length;
        const avail = pRooms.filter((r) => r.status === "available" || r.status === "reserved" || !r.status).length;
        console.log(`[SUPABASE SYNC] Property ID: ${propertyId}, Total Rooms: ${total}, Available Rooms: ${avail}`);
        await supabaseClient.from("properties").update({ total_rooms: total, available_rooms: avail }).eq("id", propertyId);
      }
    } catch (err) {
      console.error("[SUPABASE SYNC ERROR]", err);
    }
  }
  async function resolveVerifiedFromEmail(apiKey, fallbackEmail) {
    try {
      console.log("[MAILERSEND DISCOVERY] Querying verified domains list...");
      const res = await fetch("https://api.mailersend.com/v1/domains", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "User-Agent": "SamaraStay-App/1.0 (Node.js)"
        }
      });
      if (res.status === 200) {
        const json = await res.json();
        if (json && Array.isArray(json.data) && json.data.length > 0) {
          const domains = json.data;
          console.log("[MAILERSEND DISCOVERY] Available domains raw data:", JSON.stringify(domains, null, 2));
          const verifiedDomains = domains.filter((d) => d.is_verified === true || d.is_verified === "true" || d.is_verified === 1 || d.is_verified === void 0);
          console.log("[MAILERSEND DISCOVERY] Filtered verified domains:", verifiedDomains.map((d) => d.name));
          const activeDomainsList = verifiedDomains.length > 0 ? verifiedDomains : domains;
          const fallbackDomain = fallbackEmail.split("@")[1];
          const match = activeDomainsList.find((d) => d.name === fallbackDomain);
          if (match) {
            console.log(`[MAILERSEND DISCOVERY] Verified match found for fallback domain: ${fallbackDomain}`);
            return fallbackEmail;
          }
          const selectedDomain = activeDomainsList[0].name;
          const userPrefix = fallbackEmail.split("@")[0] || "info";
          const resolved = `${userPrefix}@${selectedDomain}`;
          console.log(`[MAILERSEND DISCOVERY] Selected domain: ${selectedDomain}. Resolved email: ${resolved}`);
          return resolved;
        } else {
          console.warn("[MAILERSEND DISCOVERY] No domains found in MailerSend account response.");
        }
      } else {
        console.warn(`[MAILERSEND DISCOVERY] Domains API returned status ${res.status}: ${await res.text()}`);
      }
    } catch (err) {
      console.error("[MAILERSEND DISCOVERY ERROR] Failed to fetch domains:", err);
    }
    return fallbackEmail;
  }
  async function runMailerSendDiagnostics() {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    let apiKey = process.env.MAILERSEND_API_KEY || "";
    apiKey = apiKey.trim();
    if (apiKey.startsWith('"') && apiKey.endsWith('"')) apiKey = apiKey.slice(1, -1);
    else if (apiKey.startsWith("'") && apiKey.endsWith("'")) apiKey = apiKey.slice(1, -1);
    apiKey = apiKey.trim();
    const rawFromEmail = process.env.MAILERSEND_FROM_EMAIL || "info@test-zkq340e73m2gd796.mlsender.net";
    const rawFromName = process.env.MAILERSEND_FROM_NAME || "Samara Stay";
    const credentialsCheck = {
      apiKeyConfigured: Boolean(apiKey && apiKey !== "YOUR_MAILERSEND_API_KEY_HERE"),
      apiKeyMasked: apiKey && apiKey !== "YOUR_MAILERSEND_API_KEY_HERE" ? `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}` : "NOT_CONFIGURED",
      fromEmail: rawFromEmail,
      fromName: rawFromName,
      isTrialDomain: rawFromEmail.includes("mlsender.net")
    };
    const diagnostics = {
      timestamp,
      environment: process.env.NODE_ENV || "development",
      credentials: credentialsCheck,
      connectivity: {
        status: "pending",
        httpCode: null,
        message: ""
      },
      domains: [],
      activityLogs: [],
      resolvedSender: null,
      recommendations: []
    };
    if (!credentialsCheck.apiKeyConfigured) {
      diagnostics.connectivity.status = "failed";
      diagnostics.connectivity.message = "MAILERSEND_API_KEY is missing or set to default placeholder value.";
      diagnostics.recommendations.push("Daftarkan MAILERSEND_API_KEY yang valid di environment variables (.env / settings).");
      console.warn("[MAILERSEND DIAGNOSTICS] API Key not configured.");
      return diagnostics;
    }
    try {
      console.log("[MAILERSEND DIAGNOSTICS] Verifying MailerSend API connectivity & verified domains...");
      const domainsRes = await fetch("https://api.mailersend.com/v1/domains", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "User-Agent": "SamaraStay-App/1.0 (Node.js)"
        }
      });
      diagnostics.connectivity.httpCode = domainsRes.status;
      if (domainsRes.status === 200) {
        diagnostics.connectivity.status = "success";
        diagnostics.connectivity.message = "Koneksi ke MailerSend API Berhasil! (HTTP 200 OK)";
        const domainsJson = await domainsRes.json();
        if (domainsJson && Array.isArray(domainsJson.data)) {
          diagnostics.domains = domainsJson.data.map((d) => ({
            id: d.id,
            name: d.name,
            is_verified: d.is_verified ?? true,
            created_at: d.created_at
          }));
        }
        const resolvedSender = await resolveVerifiedFromEmail(apiKey, rawFromEmail);
        diagnostics.resolvedSender = resolvedSender;
        if (credentialsCheck.isTrialDomain) {
          diagnostics.recommendations.push(
            "Perhatian: Anda sedang menggunakan domain trial MailerSend (*.mlsender.net). Pada mode trial, email booking HANYA terkirim ke alamat email pembuat akun MailerSend / Authorized Recipients."
          );
        }
        if (diagnostics.domains.length === 0) {
          diagnostics.recommendations.push(
            "Tidak ada domain terverifikasi di akun MailerSend Anda. Silakan tambahkan dan verifikasi domain kos Anda di MailerSend Dashboard."
          );
        }
      } else {
        const errorText = await domainsRes.text();
        diagnostics.connectivity.status = "failed";
        diagnostics.connectivity.message = `MailerSend API mengembalikan status HTTP ${domainsRes.status}`;
        diagnostics.connectivity.errorDetails = errorText;
        if (domainsRes.status === 401) {
          diagnostics.recommendations.push("HTTP 401 Unauthorized: Periksa kembali apakah MAILERSEND_API_KEY aktif dan tepat.");
        } else if (domainsRes.status === 422) {
          diagnostics.recommendations.push("HTTP 422 Unprocessable Entity: Alamat pengirim (From Email) atau domain belum sesuai di MailerSend.");
        }
      }
      try {
        console.log("[MAILERSEND DIAGNOSTICS] Querying recent message queue logs...");
        const activityRes = await fetch("https://api.mailersend.com/v1/messages?limit=10", {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "User-Agent": "SamaraStay-App/1.0 (Node.js)"
          }
        });
        if (activityRes.status === 200) {
          const actJson = await activityRes.json();
          if (actJson && Array.isArray(actJson.data)) {
            diagnostics.activityLogs = actJson.data.slice(0, 10).map((msg) => ({
              id: msg.id,
              subject: msg.subject,
              created_at: msg.created_at,
              status: msg.status || "processed",
              recipient: msg.emails ? msg.emails.map((e) => e.email).join(", ") : msg.to || "N/A"
            }));
          }
        }
      } catch (actErr) {
        console.warn("[MAILERSEND DIAGNOSTICS] Failed fetching activity queue:", actErr.message || actErr);
      }
    } catch (connErr) {
      diagnostics.connectivity.status = "error";
      diagnostics.connectivity.message = `Gagal terhubung ke server MailerSend: ${connErr.message || connErr}`;
      diagnostics.recommendations.push("Periksa koneksi jaringan internet atau status layanan MailerSend.");
    }
    console.log("[MAILERSEND DIAGNOSTICS RESULT]", JSON.stringify(diagnostics, null, 2));
    return diagnostics;
  }
  async function logEmailEventToDatabase(recipient, subject, status, errorReason) {
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const supabaseKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !supabaseKey || supabaseUrl === "undefined" || supabaseKey === "undefined") {
        return;
      }
      const supabase = createClient(supabaseUrl, supabaseKey);
      if (status === "failed") {
        await supabase.from("activity_logs").insert({
          admin_name: "MailerSend System",
          action: "EMAIL_FAILED",
          detail: `Gagal mengirim email ke ${recipient} (Subjek: "${subject}") setelah retries. Error: ${(errorReason || "").slice(0, 250)}`,
          ip_address: "127.0.0.1"
        });
      }
      await supabase.from("sent_emails").insert({
        recipient,
        subject,
        status,
        error_message: errorReason ? errorReason.slice(0, 500) : null,
        sent_at: (/* @__PURE__ */ new Date()).toISOString()
      }).then(({ error }) => {
        if (error) {
          console.warn("[EMAIL DB LOG] sent_emails table insert skipped/error:", error.message);
        }
      });
    } catch (dbErr) {
      console.error("[EMAIL DB LOG ERROR]", dbErr);
    }
  }
  async function logFailedEmailToDatabase(recipient, subject, errorReason) {
    return logEmailEventToDatabase(recipient, subject, "failed", errorReason);
  }
  const signatureStore = /* @__PURE__ */ new Map();
  setInterval(() => {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1e3;
    for (const [id, item] of signatureStore.entries()) {
      if (item.createdAt < twoHoursAgo || signatureStore.size > 500) {
        signatureStore.delete(id);
      }
    }
  }, 30 * 60 * 1e3);
  let cachedOwnerSigBase64 = "";
  async function getOfficialOwnerSigBase64(customUrl) {
    if (customUrl && customUrl.startsWith("data:image/")) {
      return customUrl.includes(",") ? customUrl.split(",")[1] : customUrl;
    }
    if (!customUrl && cachedOwnerSigBase64) {
      return cachedOwnerSigBase64;
    }
    const targetUrl = customUrl || "https://eniwbzpfvwtbsonmnzzr.supabase.co/storage/v1/object/public/signatures/owner_official_signature.png";
    try {
      const res = await fetch(targetUrl, { signal: AbortSignal.timeout(6e3) });
      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        const b64 = buffer.toString("base64");
        if (!customUrl) cachedOwnerSigBase64 = b64;
        return b64;
      }
    } catch (err) {
      console.warn("[SIGNATURE HELPER] Failed to fetch remote signature URL, generating vector fallback:", err);
    }
    try {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="180" viewBox="0 0 240 90"><path d="M 15 45 C 30 18, 40 8, 55 32 C 65 48, 75 12, 90 28 C 100 38, 105 18, 125 42 C 140 22, 155 52, 175 28 C 190 32, 205 22, 218 38" fill="none" stroke="#1e293b" stroke-width="2.8" stroke-linecap="round"/><path d="M 25 58 Q 110 46 210 52" fill="none" stroke="#2E6F40" stroke-width="2" stroke-dasharray="3 2"/><text x="110" y="72" font-family="sans-serif" font-size="9" font-weight="bold" fill="#2E6F40" text-anchor="middle" letter-spacing="1">SAMARA STAY OWNER</text><text x="110" y="83" font-family="monospace" font-size="7" fill="#64748b" text-anchor="middle">OFFICIAL DIGITAL STAMP</text></svg>';
      const png = await renderAsync(svg, { fitTo: { mode: "width", value: 480 } });
      const b64 = png.asPng().toString("base64");
      if (!customUrl) cachedOwnerSigBase64 = b64;
      return b64;
    } catch (renderErr) {
      console.warn("[SIGNATURE HELPER] Fallback vector render error:", renderErr);
      return "";
    }
  }
  async function processEmailHtmlAndSignatures(rawHtml, options) {
    let html = rawHtml || "";
    const attachments = [];
    const hasOwnerSigTag = html.includes('alt="Tanda Tangan Owner"') || html.includes('alt="TTD Owner"') || html.includes('alt="Tanda Tangan Pemilik"') || html.includes('class="sig-img"') || html.includes("cid:owner-signature") || html.includes("owner_official_signature");
    if (hasOwnerSigTag || options?.ownerSigUrl) {
      let detectedOwnerUrl = options?.ownerSigUrl || "";
      if (!detectedOwnerUrl) {
        const match = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*alt=["'][^"']*(?:Owner|Pemilik)[^"']*["']/i) || html.match(/<img[^>]*alt=["'][^"']*(?:Owner|Pemilik)[^"']*["'][^>]+src=["']([^"']+)["']/i);
        if (match && match[1]) {
          detectedOwnerUrl = match[1];
        }
      }
      let ownerBase64 = "";
      if (detectedOwnerUrl.startsWith("data:image/svg+xml")) {
        try {
          const rawSvg = decodeURIComponent(detectedOwnerUrl.replace(/^data:image\/svg\+xml;?(?:utf8,)?,/i, ""));
          const png = await renderAsync(rawSvg, { fitTo: { mode: "width", value: 480 } });
          ownerBase64 = png.asPng().toString("base64");
        } catch (e) {
          console.warn("[SIGNATURE HELPER] SVG render error, falling back to official signature:", e);
        }
      } else if (detectedOwnerUrl.startsWith("data:image/")) {
        ownerBase64 = detectedOwnerUrl.includes(",") ? detectedOwnerUrl.split(",")[1] : detectedOwnerUrl;
      } else if (detectedOwnerUrl.includes("/api/signatures/")) {
        const sigMatch = detectedOwnerUrl.match(/\/api\/signatures\/([a-zA-Z0-9_-]+)\.png/);
        if (sigMatch && sigMatch[1]) {
          const item = signatureStore.get(sigMatch[1]);
          if (item) ownerBase64 = item.data;
        }
      }
      if (!ownerBase64) {
        ownerBase64 = await getOfficialOwnerSigBase64(detectedOwnerUrl.startsWith("http") ? detectedOwnerUrl : void 0);
      }
      if (ownerBase64) {
        attachments.push({
          id: "owner-signature",
          filename: "owner_signature.png",
          content: ownerBase64,
          disposition: "inline"
        });
        html = html.replace(
          /(<img\b[^>]*?\balt=["'][^"']*(?:Owner|Pemilik)[^"']*["'][^>]*?\bsrc=["'])([^"']+)(["'][^>]*?>)/gi,
          "$1cid:owner-signature$3"
        );
        html = html.replace(
          /(<img\b[^>]*?\bsrc=["'])([^"']+)(["'][^>]*?\balt=["'][^"']*(?:Owner|Pemilik)[^"']*["'][^>]*?>)/gi,
          "$1cid:owner-signature$3"
        );
      }
    }
    const hasTenantSigTag = html.includes('alt="Tanda Tangan Pemesan"') || html.includes('alt="TTD Pemesan"') || html.includes('alt="TTD Penyewa"') || html.includes("cid:tenant-signature");
    if (hasTenantSigTag || options?.tenantSigUrl) {
      let detectedTenantUrl = options?.tenantSigUrl || "";
      if (!detectedTenantUrl) {
        const match = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*alt=["'][^"']*(?:Pemesan|Penyewa)[^"']*["']/i) || html.match(/<img[^>]*alt=["'][^"']*(?:Pemesan|Penyewa)[^"']*["'][^>]+src=["']([^"']+)["']/i);
        if (match && match[1]) {
          detectedTenantUrl = match[1];
        }
      }
      let tenantBase64 = "";
      if (detectedTenantUrl.startsWith("data:image/")) {
        tenantBase64 = detectedTenantUrl.includes(",") ? detectedTenantUrl.split(",")[1] : detectedTenantUrl;
      } else if (detectedTenantUrl.includes("/api/signatures/")) {
        const sigMatch = detectedTenantUrl.match(/\/api\/signatures\/([a-zA-Z0-9_-]+)\.png/);
        if (sigMatch && sigMatch[1]) {
          const item = signatureStore.get(sigMatch[1]);
          if (item) tenantBase64 = item.data;
        }
      } else if (detectedTenantUrl.startsWith("http")) {
        try {
          const res = await fetch(detectedTenantUrl, { signal: AbortSignal.timeout(6e3) });
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            tenantBase64 = buf.toString("base64");
          }
        } catch (e) {
          console.warn("[SIGNATURE HELPER] Failed to fetch remote tenant signature URL:", e);
        }
      }
      if (tenantBase64) {
        attachments.push({
          id: "tenant-signature",
          filename: "tenant_signature.png",
          content: tenantBase64,
          disposition: "inline"
        });
        html = html.replace(
          /(<img\b[^>]*?\balt=["'][^"']*(?:Pemesan|Penyewa)[^"']*["'][^>]*?\bsrc=["'])([^"']+)(["'][^>]*?>)/gi,
          "$1cid:tenant-signature$3"
        );
        html = html.replace(
          /(<img\b[^>]*?\bsrc=["'])([^"']+)(["'][^>]*?\balt=["'][^"']*(?:Pemesan|Penyewa)[^"']*["'][^>]*?>)/gi,
          "$1cid:tenant-signature$3"
        );
      }
    }
    return { html, attachments };
  }
  async function sendEmailWithRetry(apiKey, payload, recipientEmail, subject) {
    const delays = [1e3, 2e3, 4e3];
    const maxAttempts = 3;
    let lastError = "";
    let lastStatus = void 0;
    let lastResponseText = "";
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`[MAILERSEND API] Attempt ${attempt}/${maxAttempts} sending email to: ${recipientEmail} ("${subject}")`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12e3);
        const res = await fetch("https://api.mailersend.com/v1/email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
            "User-Agent": "SamaraStay-App/1.0 (Node.js)"
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        lastStatus = res.status;
        lastResponseText = await res.text();
        if (res.status >= 200 && res.status < 300) {
          console.log(`[MAILERSEND API SUCCESS] Email delivered on attempt ${attempt}. Status: ${res.status}`);
          await logEmailEventToDatabase(recipientEmail, subject, "sent");
          return { success: true, status: res.status, dataText: lastResponseText };
        }
        const isTransient = res.status === 429 || res.status >= 500;
        if (!isTransient) {
          console.warn(`[MAILERSEND API NON-RETRYABLE] Status ${res.status}: ${lastResponseText}. Skipping further retries.`);
          lastError = `HTTP ${res.status}: ${lastResponseText}`;
          await logFailedEmailToDatabase(recipientEmail, subject, lastError);
          return { success: false, status: res.status, dataText: lastResponseText, error: lastError };
        }
        console.warn(`[MAILERSEND API TRANSIENT ERROR] Attempt ${attempt}/${maxAttempts} failed with status ${res.status}: ${lastResponseText}`);
        lastError = `HTTP ${res.status}: ${lastResponseText}`;
      } catch (err) {
        console.warn(`[MAILERSEND API TIMEOUT/NETWORK ERROR] Attempt ${attempt}/${maxAttempts} failed: ${err.message || err}`);
        lastError = err.message || String(err);
      }
      if (attempt < maxAttempts) {
        const delayMs = delays[attempt - 1] || 1e3;
        console.log(`[MAILERSEND API RETRY BACKOFF] Waiting ${delayMs}ms before attempt ${attempt + 1}...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    console.error(`[MAILERSEND API EXHAUSTED] Failed to send email to ${recipientEmail} after ${maxAttempts} attempts.`);
    await logFailedEmailToDatabase(recipientEmail, subject, lastError);
    return { success: false, status: lastStatus, dataText: lastResponseText, error: lastError };
  }
  async function sendServerEmail(to, subject, text, rawHtml, options) {
    setImmediate(async () => {
      try {
        let apiKey = process.env.MAILERSEND_API_KEY || "";
        apiKey = apiKey.trim();
        if (apiKey.startsWith('"') && apiKey.endsWith('"')) apiKey = apiKey.slice(1, -1);
        else if (apiKey.startsWith("'") && apiKey.endsWith("'")) apiKey = apiKey.slice(1, -1);
        apiKey = apiKey.trim();
        if (!apiKey || apiKey === "YOUR_MAILERSEND_API_KEY_HERE") {
          console.warn("[SERVER EMAIL TRIGGER WARNING] MAILERSEND_API_KEY is not configured. Email skipped.");
          return;
        }
        const baseFromEmail = process.env.MAILERSEND_FROM_EMAIL || "info@test-zkq340e73m2gd796.mlsender.net";
        const fromEmail = await resolveVerifiedFromEmail(apiKey, baseFromEmail);
        const fromName = process.env.MAILERSEND_FROM_NAME || "Samara Stay";
        const { html, attachments } = await processEmailHtmlAndSignatures(rawHtml, options);
        const payload = {
          from: { email: fromEmail, name: fromName },
          to: [{ email: to, name: to.split("@")[0] }],
          subject,
          text,
          html,
          attachments: attachments.length > 0 ? attachments : void 0
        };
        console.log("[SERVER EMAIL TRIGGER] Initiating non-blocking send with retry:", subject, "to:", to, "inline attachments:", attachments.length);
        await sendEmailWithRetry(apiKey, payload, to, subject);
      } catch (err) {
        console.error("[SERVER EMAIL TRIGGER ERROR]", err);
      }
    });
  }
  async function settleBookingTransaction(supabase, orderId, paymentType = "Midtrans SNAP", transactionId, grossAmount, feeAmount, clientFallbackData) {
    console.log(`[SETTLE BOOKING] Executing automated payment settlement for Order: "${orderId}"`);
    let booking = null;
    const { data: bData, error: fetchErr } = await supabase.from("bookings").select("*").eq("midtrans_order_id", orderId).maybeSingle();
    if (fetchErr) {
      console.error("[SETTLE BOOKING ERROR] Fetch booking error:", fetchErr);
    }
    booking = bData;
    if (!booking && clientFallbackData) {
      if (clientFallbackData.id) {
        const { data: bById } = await supabase.from("bookings").select("*").eq("id", clientFallbackData.id).maybeSingle();
        booking = bById;
      }
      if (!booking) {
        const newBooking = {
          ...clientFallbackData,
          status: "approved",
          payment_method: paymentType,
          midtrans_order_id: orderId
        };
        delete newBooking.id;
        const { data: insData, error: insErr } = await supabase.from("bookings").insert(newBooking).select().single();
        if (!insErr && insData) {
          booking = insData;
        }
      }
    }
    if (!booking) {
      throw new Error(`Data pemesanan dengan Order ID "${orderId}" tidak ditemukan.`);
    }
    const effectiveTenantName = booking.occupant_name || booking.tenant_name || "Penghuni";
    if (booking.status === "approved") {
      console.log(`[SETTLE BOOKING] Booking "${orderId}" is ALREADY approved. Ensuring room is locked.`);
      if (booking.room_id) {
        await supabase.from("rooms").update({
          status: "occupied",
          current_tenant_name: effectiveTenantName
        }).eq("id", booking.room_id);
        await syncPropertyRoomCountInSupabase(supabase, booking.property_id);
      }
      return {
        success: true,
        already_approved: true,
        booking,
        room_locked: true,
        room_id: booking.room_id
      };
    }
    let invoiceId = `INV-${Math.floor(1e3 + Math.random() * 9e3)}`;
    const effectiveTrxId = transactionId || `mid-tr-${Math.floor(1e5 + Math.random() * 9e5)}`;
    const { data: rpcRes, error: settleRpcErr } = await supabase.rpc("settle_booking_payment", {
      p_booking_id: booking.id,
      p_order_id: orderId,
      p_payment_type: paymentType || "Midtrans SNAP",
      p_transaction_id: effectiveTrxId
    });
    if (!settleRpcErr && rpcRes && rpcRes.success) {
      if (rpcRes.invoice_id) {
        invoiceId = rpcRes.invoice_id;
      }
      if (booking.room_id) {
        await supabase.from("rooms").update({ status: "occupied", current_tenant_name: effectiveTenantName }).eq("id", booking.room_id);
        await syncPropertyRoomCountInSupabase(supabase, booking.property_id);
      }
      console.log(`[SETTLE BOOKING] Atomic settlement RPC succeeded for ${orderId}, invoice: ${invoiceId}`);
    } else {
      console.warn("[SETTLE BOOKING] Atomic settlement RPC fallback to manual steps:", settleRpcErr?.message || rpcRes?.error);
      await supabase.from("bookings").update({
        status: "approved",
        payment_method: paymentType || "Midtrans SNAP",
        midtrans_order_id: orderId
      }).eq("id", booking.id);
      if (booking.room_id) {
        await supabase.from("rooms").update({
          status: "occupied",
          current_tenant_name: effectiveTenantName
        }).eq("id", booking.room_id);
        await syncPropertyRoomCountInSupabase(supabase, booking.property_id);
      }
      const initials = effectiveTenantName ? effectiveTenantName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() : "TM";
      await supabase.from("tenants").insert({
        full_name: effectiveTenantName,
        phone: booking.occupant_phone || booking.phone || "",
        email: booking.occupant_email || booking.email || "",
        avatar_initials: initials,
        avatar_color: "bg-indigo-600",
        property_id: booking.property_id,
        room_number: booking.room_number,
        start_date: booking.check_in_date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
        duration_months: booking.duration_months || 1,
        payment_status: "paid"
      });
      await supabase.from("payments").insert({
        id: invoiceId,
        tenant_name: booking.tenant_name,
        property_id: booking.property_id,
        amount: booking.total_price || grossAmount || 0,
        method: paymentType || "Midtrans SNAP",
        status: "paid",
        payment_date: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
        midtrans_order_id: orderId,
        transaction_id: effectiveTrxId
      });
    }
    const { data: refreshedBooking } = await supabase.from("bookings").select("*").eq("id", booking.id).single();
    if (refreshedBooking) {
      booking = refreshedBooking;
    }
    try {
      const feeAmt = Number(feeAmount || 0);
      const grossAmt = Number(booking.total_price || grossAmount || 0);
      await supabase.from("midtrans_clearing_transactions").upsert({
        midtrans_order_id: orderId,
        midtrans_transaction_id: effectiveTrxId,
        payment_id: invoiceId,
        booking_id: booking.id,
        gross_amount: grossAmt,
        fee_amount: feeAmt,
        net_amount: grossAmt - feeAmt,
        reconciled_amount: 0,
        outstanding_amount: grossAmt,
        clearing_status: "cleared",
        property_id: booking.property_id || null,
        tenant_name: booking.tenant_name,
        settled_at: (/* @__PURE__ */ new Date()).toISOString()
      }, { onConflict: "midtrans_order_id" });
    } catch (clrErr) {
      console.warn("[SETTLE BOOKING] Midtrans clearing insert warning:", clrErr);
    }
    try {
      await verifyAndEnsureCriticalCOA(supabase, true);
      const trxDate = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const trxNo = `TRX-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
      const { error: rpcErr } = await supabase.rpc("post_financial_transaction", {
        p_transaction_no: trxNo,
        p_transaction_date: trxDate,
        p_category: "Penerimaan Sewa",
        p_description: `[AUTO-LOCK] Pelunasan Sewa ${booking.tenant_name} Unit ${booking.room_number}`,
        p_amount: booking.total_price || grossAmount || 0,
        p_type: "income",
        p_reference_type: "payment",
        p_reference_id: invoiceId,
        p_created_by: "Midtrans Auto Settlement",
        p_debit_account_id: 1200,
        p_credit_account_id: 4e3,
        p_property_id: booking?.property_id || null
      });
      if (rpcErr) {
        console.warn("[SETTLE BOOKING] post_financial_transaction RPC failed, fallback to journal entries:", rpcErr.message);
        const { data: insertedTrx, error: ftErr } = await supabase.from("financial_transactions").insert({
          transaction_no: trxNo,
          transaction_date: trxDate,
          category: "Penerimaan Sewa",
          description: `[AUTO-LOCK] Pelunasan Sewa ${booking.tenant_name} Unit ${booking.room_number}`,
          amount: Number(booking.total_price || grossAmount || 0),
          type: "income",
          reference_type: "payment",
          reference_id: invoiceId,
          created_by: "Midtrans Auto Settlement",
          property_id: booking?.property_id || null
        }).select().single();
        if (insertedTrx && !ftErr) {
          const journalNo = `JRN-${trxDate.replace(/-/g, "")}-${insertedTrx.id}`;
          await supabase.from("journal_entries").insert([
            {
              journal_no: journalNo,
              transaction_id: insertedTrx.id,
              account_id: 1200,
              debit: Number(booking.total_price || grossAmount || 0),
              credit: 0
            },
            {
              journal_no: journalNo,
              transaction_id: insertedTrx.id,
              account_id: 4e3,
              debit: 0,
              credit: Number(booking.total_price || grossAmount || 0)
            }
          ]);
        }
      }
    } catch (finErr) {
      console.error("[SETTLE BOOKING] Financial transaction posting warning:", finErr);
    }
    const recipientEmails = Array.from(new Set([
      booking.email,
      booking.occupant_email,
      clientFallbackData?.email,
      clientFallbackData?.occupant_email
    ].map((e) => typeof e === "string" ? e.trim() : "").filter((e) => e && e.includes("@"))));
    if (recipientEmails.length > 0) {
      try {
        let property = null;
        if (booking.property_id) {
          const { data: prop } = await supabase.from("properties").select("*").eq("id", booking.property_id).maybeSingle();
          property = prop;
        }
        const propertyName = property?.name || "Samara Stay Premium Residence";
        const propertyAddress = property?.address || "Premium Boarding Area";
        const formattedPrice = "Rp " + (booking.total_price || grossAmount || 0).toLocaleString("id-ID");
        let settleOwnerSig = "https://eniwbzpfvwtbsonmnzzr.supabase.co/storage/v1/object/public/signatures/owner_official_signature.png";
        try {
          const { data: setRow } = await supabase.from("settings").select("owner_signature_url").eq("id", 1).maybeSingle();
          if (setRow?.owner_signature_url) {
            settleOwnerSig = setRow.owner_signature_url;
          }
        } catch (sErr) {
        }
        const subject = `[Samara Stay] Konfirmasi & Pelunasan Sewa Kamar - Unit ${booking.room_number}`;
        const text = `Halo ${booking.tenant_name}, pembayaran sewa kamar Anda di ${propertyName} (Unit ${booking.room_number}) telah lunas dan kamar berhasil dikunci!`;
        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
            <h2 style="color: #0D9488; margin-top: 0;">Pembayaran Berhasil & Kamar Terkunci</h2>
            <p>Halo <strong>${booking.tenant_name}</strong>,</p>
            <p>Terima kasih! Pembayaran pemesanan kamar Anda telah berhasil diverifikasi secara otomatis melalui <strong>${paymentType}</strong>.</p>
            <div style="background-color: #f8fafc; padding: 15px; border-radius: 12px; margin: 20px 0; border: 1px solid #e2e8f0;">
              <p style="margin: 5px 0;"><strong>No. Invoice:</strong> ${invoiceId}</p>
              <p style="margin: 5px 0;"><strong>Order ID:</strong> ${orderId}</p>
              <p style="margin: 5px 0;"><strong>Properti:</strong> ${propertyName}</p>
              <p style="margin: 5px 0;"><strong>Unit Kamar:</strong> Kamar ${booking.room_number}</p>
              <p style="margin: 5px 0;"><strong>Penghuni:</strong> ${effectiveTenantName}</p>
              <p style="margin: 5px 0;"><strong>Total Pembayaran:</strong> ${formattedPrice}</p>
              <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: #059669; font-weight: bold;">LUNAS (Kamar Terkunci)</span></p>
            </div>
            <div style="font-size: 13px; color: #475569; margin: 15px 0; padding: 12px; background-color: #f1f5f9; border-radius: 8px;">
              <strong>Alamat Properti:</strong> ${propertyAddress}
            </div>

            <!-- PENGESAHAN TANDA TANGAN DUA PIHAK (OWNER & PEMESAN) -->
            <div style="margin-top: 25px; padding: 16px; border: 1px dashed #94a3b8; border-radius: 12px; background-color: #ffffff;">
              <p style="font-size: 10px; color: #475569; font-weight: 800; margin: 0 0 10px 0; text-transform: uppercase; text-align: center; letter-spacing: 0.5px;">PENGESAHAN TANDA TANGAN RESMI:</p>
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
                <tr>
                  <td width="50%" align="center" style="padding: 10px; border-right: 1px solid #e2e8f0; vertical-align: bottom;">
                    <p style="font-size: 9px; color: #64748b; font-weight: bold; margin: 0 0 6px 0; text-transform: uppercase;">PIHAK PERTAMA (OWNER)</p>
                    <div style="min-height: 55px; text-align: center;">
                      <img src="cid:owner-signature" alt="Tanda Tangan Owner" style="max-height: 55px; max-width: 140px; display: inline-block;" />
                    </div>
                    <p style="font-size: 9px; color: #1e293b; font-weight: 800; margin: 4px 0 0 0; text-transform: uppercase;">SAMARA STAY MANAGEMENT</p>
                    <p style="font-size: 8px; color: #059669; font-weight: bold; margin: 2px 0 0 0; font-family: monospace;">[ STAMP RESMI ]</p>
                  </td>
                  <td width="50%" align="center" style="padding: 10px; vertical-align: bottom;">
                    <p style="font-size: 9px; color: #64748b; font-weight: bold; margin: 0 0 6px 0; text-transform: uppercase;">PIHAK KEDUA (PEMESAN)</p>
                    <div style="min-height: 55px; text-align: center;">
                      ${booking.signature_url ? `
                        <img src="cid:tenant-signature" alt="Tanda Tangan Pemesan" style="max-height: 55px; max-width: 140px; display: inline-block;" />
                      ` : `
                        <p style="font-size: 10px; color: #059669; font-weight: bold; margin: 15px 0 0 0; font-family: monospace;">\u2713 DISETUJUI DIGITAL</p>
                      `}
                    </div>
                    <p style="font-size: 9px; color: #1e293b; font-weight: 800; margin: 4px 0 0 0; text-transform: uppercase;">${effectiveTenantName}</p>
                    <p style="font-size: 8px; color: #64748b; margin: 2px 0 0 0; font-family: monospace;">TERVERIFIKASI SISTEM</p>
                  </td>
                </tr>
              </table>
            </div>

            <p style="color: #64748b; font-size: 13px; margin-top: 20px;">Kamar Anda kini telah terkunci aman di sistem kami dan tidak dapat dipesan oleh siapapun. Silakan tunjukkan invoice atau email ini saat check-in fisik di lokasi.</p>
          </div>
        `;
        for (const recipientEmail of recipientEmails) {
          console.log(`[SETTLE BOOKING] Dispatching confirmation email to recipient: ${recipientEmail}`);
          sendServerEmail(recipientEmail, subject, text, html, {
            ownerSigUrl: settleOwnerSig,
            tenantSigUrl: booking.signature_url
          });
        }
      } catch (emErr) {
        console.warn("[SETTLE BOOKING] Email send warning:", emErr);
      }
    }
    return {
      success: true,
      booking,
      invoice_id: invoiceId,
      room_locked: true,
      room_id: booking.room_id
    };
  }
  app.post(["/api/midtrans/webhook", "/api/midtrans/notification"], async (req, res) => {
    try {
      const notification = req.body;
      console.log("[MIDTRANS WEBHOOK RECEIVED] Order ID:", notification.order_id, "Status:", notification.transaction_status);
      const orderId = notification.order_id;
      const transactionStatus = notification.transaction_status;
      const fraudStatus = notification.fraud_status;
      const paymentType = notification.payment_type;
      const grossAmount = notification.gross_amount;
      const statusCode = notification.status_code;
      const incomingSignature = notification.signature_key;
      let rawServerKey = process.env.MIDTRANS_SERVER_KEY || "";
      let serverKey = rawServerKey.trim();
      if (serverKey.startsWith('"') && serverKey.endsWith('"')) {
        serverKey = serverKey.slice(1, -1);
      } else if (serverKey.startsWith("'") && serverKey.endsWith("'")) {
        serverKey = serverKey.slice(1, -1);
      }
      serverKey = serverKey.trim();
      if (serverKey && serverKey !== "YOUR_MIDTRANS_SERVER_KEY_HERE" && serverKey !== "") {
        if (!incomingSignature) {
          console.warn("[MIDTRANS WEBHOOK SECURITY WARNING] Webhook received without signature key.");
          return res.status(401).json({ error: "Unauthorized: Missing signature key" });
        }
        const computedSignature = crypto.createHash("sha512").update(orderId + statusCode + grossAmount + serverKey).digest("hex");
        if (computedSignature !== incomingSignature) {
          console.warn("[MIDTRANS WEBHOOK SECURITY WARNING] Signature mismatch computed:", computedSignature, "received:", incomingSignature);
          addMidtransLog({
            orderId: orderId || "unknown",
            type: "error",
            status: "failed",
            message: "Webhook signature verification failed: invalid credentials or signature mismatch.",
            details: { incomingSignature }
          });
          return res.status(401).json({ error: "Unauthorized: Invalid signature key" });
        }
        console.log("[MIDTRANS WEBHOOK SECURITY] Signature verified successfully!");
      } else {
        console.log("[MIDTRANS WEBHOOK WARNING] Skipping signature verification: server key not configured.");
      }
      let paymentStatus = "pending";
      if (transactionStatus === "capture") {
        if (fraudStatus === "challenge") {
          paymentStatus = "pending";
        } else if (fraudStatus === "accept") {
          paymentStatus = "paid";
        }
      } else if (transactionStatus === "settlement") {
        paymentStatus = "paid";
      } else if (transactionStatus === "cancel" || transactionStatus === "deny" || transactionStatus === "expire") {
        paymentStatus = "overdue";
      } else if (transactionStatus === "pending") {
        paymentStatus = "pending";
      }
      console.log(`[STATUS COUPLING] Order: ${orderId} is mapped to Status: ${paymentStatus} via payment: ${paymentType}`);
      addMidtransLog({
        orderId: orderId || "unknown",
        amount: grossAmount ? Number(grossAmount) : void 0,
        type: "webhook",
        status: paymentStatus === "paid" ? "success" : paymentStatus === "overdue" ? "failed" : "pending",
        message: `Webhook notification received from Midtrans. Status: ${transactionStatus}, mapped to ${paymentStatus} (${paymentType})`,
        details: notification
      });
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const supabaseKey = getServiceRoleKeyOrThrow();
      const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey && supabaseUrl !== "undefined" && supabaseKey !== "undefined");
      const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseKey) : null;
      if (supabase) {
        const eventId = notification.transaction_id || `${orderId}_${transactionStatus}_${statusCode || ""}_${grossAmount || ""}`;
        const transactionId = notification.transaction_id || null;
        const { error: webhookEventErr } = await supabase.from("webhook_events").insert({
          provider: "midtrans",
          event_id: eventId,
          order_id: orderId || null,
          transaction_id: transactionId,
          status: transactionStatus || paymentStatus,
          payload: notification,
          processed_at: (/* @__PURE__ */ new Date()).toISOString()
        });
        if (webhookEventErr) {
          if (webhookEventErr.code === "23505" || webhookEventErr.message?.includes("duplicate key") || webhookEventErr.message?.includes("already exists") || webhookEventErr.details?.includes("already exists")) {
            console.log(`[MIDTRANS WEBHOOK IDEMPOTENCY] Event ID "${eventId}" for Order "${orderId}" was ALREADY processed. Returning 200 OK without re-processing.`);
            return res.status(200).json({
              status: "OK",
              message: `Webhook event ${eventId} already processed (idempotency enforced).`
            });
          } else {
            console.warn("[MIDTRANS WEBHOOK IDEMPOTENCY WARNING] Failed recording webhook_event (non-fatal):", webhookEventErr.message);
          }
        } else {
          console.log(`[MIDTRANS WEBHOOK IDEMPOTENCY] Successfully recorded webhook_event: "${eventId}" for Order "${orderId}".`);
        }
      }
      if (supabase && orderId) {
        if (paymentStatus === "paid") {
          if (orderId.startsWith("BOOK-") || orderId.startsWith("BOOKING-")) {
            console.log(`[SUPABASE WEBHOOK SYNC] Processing booking payment settlement for ${orderId}`);
            try {
              const settleResult = await settleBookingTransaction(
                supabase,
                orderId,
                paymentType || "Midtrans SNAP",
                notification.transaction_id,
                Number(grossAmount || 0),
                Number(notification.fee_amount || 0)
              );
              console.log(`[SUPABASE WEBHOOK SYNC] Settle completed successfully for ${orderId}:`, settleResult?.invoice_id);
            } catch (settleErr) {
              console.error(`[SUPABASE WEBHOOK ERROR] Settle booking error for ${orderId}:`, settleErr);
            }
          } else if (orderId.startsWith("SRV-")) {
            console.log(`[SUPABASE WEBHOOK SYNC] Processing survey payment settlement for ${orderId}`);
            const { data: survey, error: fetchErr } = await supabase.from("surveys").select("*").eq("reservation_number", orderId).maybeSingle();
            if (fetchErr) {
              console.error("[SUPABASE WEBHOOK ERROR] Fetch survey error:", fetchErr);
            }
            if (survey) {
              if (survey.status === "survey_confirmed") {
                console.log(`[SUPABASE WEBHOOK SYNC] Webhook received but survey ${orderId} is ALREADY confirmed. Skipping duplicate processing for idempotency.`);
                return res.status(200).json({ status: "OK", message: "Survey already confirmed" });
              }
              console.log(`[SUPABASE WEBHOOK SYNC] Survey found: ID ${survey.id}. Updating status to survey_confirmed...`);
              const { error: updateErr } = await supabase.from("surveys").update({ status: "survey_confirmed", payment_method: paymentType || "Midtrans SNAP" }).eq("id", survey.id);
              if (updateErr) console.error("[SUPABASE WEBHOOK ERROR] Update survey error:", updateErr);
              console.log(`[SUPABASE WEBHOOK SYNC] Survey ${survey.reservation_number} confirmed. Room ${survey.room_number} remains available for public bookings/surveys.`);
              console.log(`[SUPABASE WEBHOOK SYNC] Creating survey payment invoice...`);
              const srvInvPayload = {
                id: survey.invoice_id || `INV-SRV-${Math.floor(1e3 + Math.random() * 9e3)}`,
                tenant_name: survey.tenant_name,
                property_id: survey.property_id,
                amount: survey.dp_amount || 5e5,
                method: paymentType || "Midtrans Snap QRIS",
                status: "paid",
                payment_date: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
                midtrans_order_id: orderId,
                transaction_id: notification.transaction_id || `mid-tr-${Math.floor(1e5 + Math.random() * 9e5)}`
              };
              const { error: payErr } = await supabase.from("payments").insert(srvInvPayload);
              if (payErr) console.error("[SUPABASE WEBHOOK ERROR] Create survey invoice error:", payErr);
              try {
                const feeAmt = Number(notification.fee_amount || 0);
                const grossAmt = Number(survey.dp_amount || 5e5);
                await supabase.from("midtrans_clearing_transactions").upsert({
                  midtrans_order_id: orderId,
                  midtrans_transaction_id: notification.transaction_id || null,
                  payment_id: srvInvPayload.id,
                  survey_id: survey.id,
                  gross_amount: grossAmt,
                  fee_amount: feeAmt,
                  net_amount: grossAmt - feeAmt,
                  reconciled_amount: 0,
                  outstanding_amount: grossAmt,
                  clearing_status: "cleared",
                  property_id: survey.property_id || null,
                  tenant_name: survey.tenant_name,
                  settled_at: (/* @__PURE__ */ new Date()).toISOString()
                }, { onConflict: "midtrans_order_id" });
              } catch (clrErr) {
                console.warn("[SUPABASE WEBHOOK WARNING] Midtrans survey clearing insert warning:", clrErr);
              }
              try {
                await verifyAndEnsureCriticalCOA(supabase, true);
                const trxDate = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
                const trxNo = `TRX-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
                const { error: rpcErr } = await supabase.rpc("post_financial_transaction", {
                  p_transaction_no: trxNo,
                  p_transaction_date: trxDate,
                  p_category: "DP Survey / Reservasi",
                  p_description: `[WEBHOOK] Pelunasan DP Survey ${survey.tenant_name} Unit ${survey.room_number}`,
                  p_amount: survey.dp_amount || 5e5,
                  p_type: "dp_booking",
                  p_reference_type: "payment",
                  p_reference_id: srvInvPayload.id,
                  p_created_by: "Midtrans Webhook",
                  p_debit_account_id: 1200,
                  // Piutang Kliring Midtrans
                  p_credit_account_id: 1300,
                  // Uang Muka / Deposit Survey
                  p_property_id: survey?.property_id || null
                });
                if (rpcErr) {
                  console.warn("[SUPABASE WEBHOOK] post_financial_transaction RPC failed for survey, using double-entry fallback:", rpcErr.message);
                  const { data: insertedTrx, error: ftErr } = await supabase.from("financial_transactions").insert({
                    transaction_no: trxNo,
                    transaction_date: trxDate,
                    category: "DP Survey / Reservasi",
                    description: `[WEBHOOK] Pelunasan DP Survey ${survey.tenant_name} Unit ${survey.room_number}`,
                    amount: Number(survey.dp_amount || 5e5),
                    type: "dp_booking",
                    reference_type: "payment",
                    reference_id: srvInvPayload.id,
                    created_by: "Midtrans Webhook",
                    property_id: survey?.property_id || null
                  }).select().single();
                  if (insertedTrx && !ftErr) {
                    const journalNo = `JRN-${trxDate.replace(/-/g, "")}-${insertedTrx.id}`;
                    await supabase.from("journal_entries").insert([
                      {
                        journal_no: journalNo,
                        transaction_id: insertedTrx.id,
                        account_id: 1200,
                        debit: Number(survey.dp_amount || 5e5),
                        credit: 0
                      },
                      {
                        journal_no: journalNo,
                        transaction_id: insertedTrx.id,
                        account_id: 1300,
                        debit: 0,
                        credit: Number(survey.dp_amount || 5e5)
                      }
                    ]);
                  } else {
                    await recordFailedLedgerPosting(supabase, {
                      transaction_no: trxNo,
                      reference_type: "payment",
                      reference_id: srvInvPayload.id,
                      amount: Number(survey.dp_amount || 5e5),
                      debit_account_id: 1200,
                      credit_account_id: 1300,
                      property_id: survey?.property_id || null,
                      created_by: "Midtrans Webhook",
                      error_message: ftErr?.message || rpcErr.message
                    });
                  }
                }
              } catch (finErr) {
                console.error("[SUPABASE WEBHOOK WARNING] Survey financial transaction recording warning:", finErr);
                await recordFailedLedgerPosting(supabase, {
                  reference_type: "payment",
                  reference_id: srvInvPayload.id,
                  amount: Number(survey.dp_amount || 5e5),
                  debit_account_id: 1200,
                  credit_account_id: 1300,
                  property_id: survey?.property_id || null,
                  created_by: "Midtrans Webhook",
                  error_message: finErr?.message || "Exception during survey financial posting"
                });
              }
              if (survey.email) {
                const subject = `[Samara Stay] Jadwal Survey Kamar Dikonfirmasi - Unit ${survey.room_number}`;
                const text = `Halo ${survey.tenant_name}, jadwal survey Anda untuk kamar Unit ${survey.room_number} telah dikonfirmasi untuk tanggal ${survey.survey_date} pukul ${survey.survey_time}.`;
                const html = `
                  <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; color: #1e293b;">
                    <div style="text-align: center; border-bottom: 2px solid #f59e0b; padding-bottom: 15px; margin-bottom: 20px;">
                      <h1 style="color: #2D3A44; margin: 0; font-size: 24px;">SAMARA STAY</h1>
                      <p style="color: #64748b; font-size: 12px; margin: 5px 0 0 0; text-transform: uppercase; font-family: monospace;">Premium Boarding Residence</p>
                    </div>
                    <h2 style="color: #f59e0b; margin-top: 0;">Jadwal Survey Dikonfirmasi!</h2>
                    <p>Halo <strong>${survey.tenant_name}</strong>,</p>
                    <p>Terima kasih. Jadwal kunjungan survey dan reservasi kamar sementara Anda telah berhasil dikonfirmasi setelah pembayaran DP berhasil diterima.</p>
                    
                    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; margin: 20px 0;">
                      <h3 style="color: #2D3A44; margin-top: 0; margin-bottom: 10px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Rincian Jadwal</h3>
                      <table style="width: 100%; font-size: 13px; line-height: 2;">
                        <tr><td style="color: #64748b; width: 40%;">Tanggal Kunjungan:</td><td><strong>${survey.survey_date}</strong></td></tr>
                        <tr><td style="color: #64748b;">Waktu Slot:</td><td><strong>${survey.survey_time} WIB</strong></td></tr>
                        <tr><td style="color: #64748b;">Kamar Target:</td><td><strong>Unit ${survey.room_number}</strong></td></tr>
                        <tr><td style="color: #64748b;">Deposit DP Survey:</td><td><strong style="color: #f59e0b; font-size: 14px;">Rp ${(survey.dp_amount || 5e5).toLocaleString("id-ID")}</strong></td></tr>
                      </table>
                    </div>
                    <p style="font-size: 13px; color: #64748b; line-height: 1.5;">Tim lapangan kami akan menemui Anda langsung di lokasi kos sesuai dengan waktu yang Anda pilih. Mohon datang tepat waktu dan tunjukkan email konfirmasi reservasi ini.</p>
                    <div style="text-align: center; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px; font-size: 11px; color: #94a3b8;">
                      &copy; 2026 Samara Stay. Seluruh hak cipta dilindungi.
                    </div>
                  </div>
                `;
                sendServerEmail(survey.email, subject, text, html);
              }
            } else {
              console.warn(`[SUPABASE WEBHOOK SYNC] Survey record not found for ${orderId}`);
            }
          } else if (orderId.startsWith("EXT-") || orderId.startsWith("EXTEND-")) {
            console.log(`[SUPABASE WEBHOOK SYNC] Processing contract extension payment settlement for ${orderId}`);
            try {
              await settleContractExtensionTransaction(
                supabase,
                orderId,
                paymentType || "Midtrans SNAP",
                notification.transaction_id || `mid-tr-ext-${Math.floor(1e5 + Math.random() * 9e5)}`,
                Number(notification.gross_amount || 0),
                Number(notification.fee_amount || 0)
              );
            } catch (extSettleErr) {
              console.error("[SUPABASE WEBHOOK ERROR] Contract extension settlement error:", extSettleErr);
            }
          }
        } else if (paymentStatus === "overdue") {
          if (orderId.startsWith("BOOK-") || orderId.startsWith("BOOKING-")) {
            const { data: booking } = await supabase.from("bookings").select("*").eq("midtrans_order_id", orderId).maybeSingle();
            if (booking) {
              await supabase.from("bookings").update({ status: "rejected" }).eq("id", booking.id);
              if (booking.room_id) {
                await supabase.from("rooms").update({ status: "available", current_tenant_name: null }).eq("id", booking.room_id);
                await syncPropertyRoomCountInSupabase(supabase, booking.property_id);
              }
            }
          } else if (orderId.startsWith("SRV-")) {
            const { data: survey } = await supabase.from("surveys").select("*").eq("reservation_number", orderId).maybeSingle();
            if (survey) {
              await supabase.from("surveys").update({ status: "expired" }).eq("id", survey.id);
              const { data: room } = await supabase.from("rooms").select("*").eq("property_id", survey.property_id).eq("room_number", survey.room_number).maybeSingle();
              if (room && room.status === "reserved") {
                await supabase.from("rooms").update({ status: "available" }).eq("id", room.id);
                await syncPropertyRoomCountInSupabase(supabase, survey.property_id);
              }
            }
          }
        }
      }
      return res.status(200).json({ status: "OK", mapped_status: paymentStatus });
    } catch (error) {
      console.error("[WEBHOOK ERROR]", error);
      addMidtransLog({
        orderId: req.body?.order_id || "unknown",
        type: "error",
        status: "failed",
        message: `Webhook ingestion failure: ${error.message || "Unknown error"}`,
        details: { body: req.body, error: error.message }
      });
      return res.status(500).json({ error: "Webhook ingestion failure" });
    }
  });
  app.post("/api/midtrans/settle-booking", apiRateLimiter(6e4, 60), express.json(), async (req, res) => {
    try {
      const { order_id, transaction_id, payment_type, gross_amount, booking_data, signature_key } = req.body;
      if (!order_id || typeof order_id !== "string" || !order_id.trim()) {
        return res.status(400).json({ success: false, error: "order_id wajib disertakan." });
      }
      const cleanOrderId = order_id.trim();
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const serviceKey = getServiceRoleKeyOrThrow();
      const supabase = createClient(supabaseUrl, serviceKey);
      let rawServerKey = process.env.MIDTRANS_SERVER_KEY || "";
      let serverKey = rawServerKey.trim();
      if (serverKey.startsWith('"') && serverKey.endsWith('"')) serverKey = serverKey.slice(1, -1);
      else if (serverKey.startsWith("'") && serverKey.endsWith("'")) serverKey = serverKey.slice(1, -1);
      serverKey = serverKey.trim();
      const { data: existingBooking } = await supabase.from("bookings").select("*").eq("midtrans_order_id", cleanOrderId).maybeSingle();
      let isStaffManualApprove = false;
      try {
        const authContext = await resolveAuthContext(req, res);
        if (authContext?.profile && can(authContext.profile.role, "bookings", "approve")) {
          const targetPropertyId = existingBooking?.property_id ?? booking_data?.property_id;
          const access = checkPropertyAccess(authContext.profile, targetPropertyId);
          if (access.allowed) {
            isStaffManualApprove = true;
          }
        }
      } catch (authErr) {
        console.warn("[Settle Booking] Staff auth verification notice:", authErr);
      }
      let finalGrossAmount = Number(gross_amount) || 0;
      let finalTransactionId = transaction_id;
      let finalPaymentType = payment_type || "Midtrans SNAP";
      if (!isStaffManualApprove) {
        if (!serverKey || serverKey === "YOUR_MIDTRANS_SERVER_KEY_HERE") {
          if (process.env.ALLOW_PAYMENT_SIMULATION === "true" && process.env.NODE_ENV === "development") {
            console.warn("[Settle Booking] Payment simulation permitted in local development mode.");
          } else {
            return res.status(503).json({
              success: false,
              error: "Layanan verifikasi pembayaran Midtrans belum dikonfigurasi pada server."
            });
          }
        } else {
          const isProduction = process.env.MIDTRANS_IS_PRODUCTION === "true";
          const baseUrl = isProduction ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com";
          const authHeader = Buffer.from(`${serverKey}:`).toString("base64");
          let isMidtransVerified = false;
          try {
            const midtransCheck = await fetch(`${baseUrl}/v2/${encodeURIComponent(cleanOrderId)}/status`, {
              method: "GET",
              headers: {
                "Accept": "application/json",
                "Authorization": `Basic ${authHeader}`
              }
            });
            if (midtransCheck.ok) {
              const checkData = await midtransCheck.json();
              if (["settlement", "capture"].includes(checkData.transaction_status) && (checkData.fraud_status === "accept" || !checkData.fraud_status)) {
                isMidtransVerified = true;
                finalGrossAmount = Number(checkData.gross_amount) || finalGrossAmount;
                finalTransactionId = checkData.transaction_id || finalTransactionId;
                finalPaymentType = checkData.payment_type || finalPaymentType;
              } else {
                console.warn("[Settle Booking] Midtrans status rejected:", checkData.transaction_status);
              }
            } else {
              console.warn("[Settle Booking] Midtrans check responded with HTTP", midtransCheck.status);
            }
          } catch (fetchErr) {
            console.error("[Settle Booking] Midtrans verification error:", fetchErr?.message);
          }
          if (!isMidtransVerified) {
            return res.status(403).json({
              success: false,
              error: "Akses ditolak: Transaksi pembayaran belum diverifikasi lunas oleh Midtrans."
            });
          }
        }
      }
      if (existingBooking) {
        const expected = Number(existingBooking.is_dp ? existingBooking.dp_amount || 5e5 : existingBooking.total_price);
        if (expected > 0 && finalGrossAmount > 0 && Math.abs(expected - finalGrossAmount) >= 1) {
          await supabase.from("activity_logs").insert({
            admin_name: "Payment Gateway Security",
            action: "SETTLE_BOOKING_AMOUNT_MISMATCH",
            detail: `Order ${cleanOrderId}: Nominal terverifikasi (${finalGrossAmount}) tidak cocok dengan tagihan (${expected}).`,
            created_at: (/* @__PURE__ */ new Date()).toISOString()
          });
          return res.status(400).json({
            success: false,
            error: `Nominal pembayaran (Rp ${finalGrossAmount.toLocaleString("id-ID")}) tidak cocok dengan tagihan pemesanan (Rp ${expected.toLocaleString("id-ID")}).`
          });
        }
      }
      let sanitizedBookingData = void 0;
      if (!existingBooking && booking_data && typeof booking_data === "object") {
        const allowedFields = [
          "property_id",
          "room_id",
          "room_number",
          "tenant_name",
          "phone",
          "email",
          "nik",
          "booking_date",
          "check_in_date",
          "duration_months",
          "booking_type",
          "duration_days",
          "coupon_code",
          "discount_amount",
          "is_for_other",
          "occupant_name",
          "occupant_phone",
          "occupant_email",
          "occupant_nik",
          "occupant_arrival_status",
          "signature_url",
          "is_married",
          "marriage_certificate_url",
          "spouse_name",
          "spouse_nik",
          "spouse_phone",
          "spouse_relation"
        ];
        sanitizedBookingData = {};
        for (const field of allowedFields) {
          if (booking_data[field] !== void 0) {
            sanitizedBookingData[field] = booking_data[field];
          }
        }
        sanitizedBookingData.midtrans_order_id = cleanOrderId;
        sanitizedBookingData.payment_method = finalPaymentType;
        let calculatedPrice = 0;
        if (sanitizedBookingData.room_id) {
          const { data: room } = await supabase.from("rooms").select("*").eq("id", sanitizedBookingData.room_id).maybeSingle();
          if (room) {
            const isDaily = sanitizedBookingData.booking_type === "daily";
            const duration = isDaily ? sanitizedBookingData.duration_days || 1 : sanitizedBookingData.duration_months || 1;
            const baseRate = isDaily ? room.daily_price || Math.round(room.price / 30) : room.price;
            const subtotal = baseRate * duration;
            const discount = Number(sanitizedBookingData.discount_amount || 0);
            calculatedPrice = Math.max(0, subtotal - discount);
          }
        }
        const isPriceMatch = calculatedPrice > 0 && finalGrossAmount > 0 && Math.abs(calculatedPrice - finalGrossAmount) < 1;
        if (!isPriceMatch && calculatedPrice > 0) {
          sanitizedBookingData.status = "pending_review";
          sanitizedBookingData.total_price = finalGrossAmount;
          await supabase.from("bookings").insert(sanitizedBookingData);
          await supabase.from("activity_logs").insert({
            admin_name: "Payment Gateway Security",
            action: "BOOKING_PRICE_MISMATCH_PENDING_REVIEW",
            detail: `Order ${cleanOrderId}: Total dihitung (${calculatedPrice}) tidak cocok dengan Midtrans (${finalGrossAmount}). Disimpan sebagai pending_review.`,
            created_at: (/* @__PURE__ */ new Date()).toISOString()
          });
          return res.status(400).json({
            success: false,
            error: "Nominal pembayaran tidak cocok dengan tarif kamar. Pemesanan disimpan sebagai status pending_review untuk tinjauan staf."
          });
        }
        sanitizedBookingData.status = "approved";
        sanitizedBookingData.total_price = finalGrossAmount;
      }
      const result = await settleBookingTransaction(
        supabase,
        cleanOrderId,
        finalPaymentType,
        finalTransactionId,
        finalGrossAmount,
        void 0,
        sanitizedBookingData
      );
      return res.status(200).json({ success: true, ...result });
    } catch (err) {
      console.error("[API Settle Booking Error]:", err);
      return res.status(500).json({ success: false, error: err.message || "Gagal memproses settlement booking." });
    }
  });
  app.post("/api/rooms/lock", apiRateLimiter(6e4, 60), express.json(), optionalAdminAuth, async (req, res) => {
    try {
      const { room_id, status = "reserved", tenant_name, booking_id, midtrans_order_id } = req.body;
      if (!room_id) {
        return res.status(400).json({ success: false, error: "room_id wajib disertakan." });
      }
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const serviceKey = getServiceRoleKeyOrThrow();
      const supabase = createClient(supabaseUrl, serviceKey);
      const { data: room, error: fetchErr } = await supabase.from("rooms").select("*").eq("id", room_id).maybeSingle();
      if (fetchErr || !room) {
        return res.status(404).json({ success: false, error: "Kamar tidak ditemukan." });
      }
      if (req.authProfile) {
        if (!can(req.authProfile.role, "properties", "update") && !can(req.authProfile.role, "bookings", "approve")) {
          return res.status(403).json({ success: false, error: "Akses ditolak: Anda tidak memiliki izin untuk mengunci/mengubah kamar." });
        }
        const propCheck = checkPropertyAccess(req.authProfile, room.property_id);
        if (!propCheck.allowed) {
          return res.status(403).json({ success: false, error: propCheck.reason });
        }
      } else {
        if (status !== "reserved") {
          return res.status(403).json({
            success: false,
            error: "Akses ditolak. Pengguna publik hanya dapat melakukan reservasi sementara (status: reserved)."
          });
        }
        if (!booking_id && !midtrans_order_id) {
          return res.status(400).json({
            success: false,
            error: "booking_id atau midtrans_order_id wajib disertakan untuk reservasi kamar publik."
          });
        }
        let bookingQuery = supabase.from("bookings").select("id, room_id, room_number, status");
        if (booking_id) {
          bookingQuery = bookingQuery.eq("id", booking_id);
        } else if (midtrans_order_id) {
          bookingQuery = bookingQuery.eq("midtrans_order_id", midtrans_order_id);
        }
        const { data: matchedBooking } = await bookingQuery.maybeSingle();
        if (!matchedBooking || matchedBooking.room_id && Number(matchedBooking.room_id) !== Number(room_id)) {
          return res.status(403).json({
            success: false,
            error: "Data pemesanan tidak cocok dengan kamar yang diminta."
          });
        }
      }
      if (status === "reserved" && room.status === "occupied") {
        return res.status(409).json({ success: false, error: "Kamar sudah terisi oleh penghuni lain." });
      }
      const updatePayload = { status };
      if (tenant_name) {
        updatePayload.current_tenant_name = tenant_name;
      } else if (status === "available") {
        updatePayload.current_tenant_name = null;
      }
      const { data: updatedRoom, error: updateErr } = await supabase.from("rooms").update(updatePayload).eq("id", room_id).select().single();
      if (updateErr) {
        return res.status(500).json({ success: false, error: updateErr.message });
      }
      if (room.property_id) {
        await syncPropertyRoomCountInSupabase(supabase, room.property_id);
      }
      return res.status(200).json({ success: true, room: updatedRoom });
    } catch (err) {
      console.error("[API Lock Room Error]:", err);
      return res.status(500).json({ success: false, error: err.message || "Gagal mengubah status kamar." });
    }
  });
  let isSyncingLeasesInFlight = false;
  let lastLeaseSyncResult = { releasedRooms: 0, checkedOutTenants: 0 };
  let lastLeaseSyncTime = 0;
  async function syncExpiredLeasesCore(supabaseAdmin) {
    if (isSyncingLeasesInFlight) {
      return lastLeaseSyncResult;
    }
    isSyncingLeasesInFlight = true;
    try {
      const now = /* @__PURE__ */ new Date();
      let releasedRoomsCount = 0;
      let checkedOutTenantsCount = 0;
      const affectedPropertyIds = /* @__PURE__ */ new Set();
      const { data: activeTenants } = await supabaseAdmin.from("tenants").select("id, start_date, duration_months, lease_end_date, status, full_name, room_number, property_id").neq("status", "checkout");
      let paidExtensions = [];
      if (activeTenants && activeTenants.length > 0) {
        const { data: exts } = await supabaseAdmin.from("contract_extensions").select("tenant_id, extension_months, status").eq("status", "paid");
        paidExtensions = exts || [];
      }
      const { data: approvedBookings } = await supabaseAdmin.from("bookings").select("id, check_in_date, booking_date, booking_type, duration_days, duration_months, room_id, room_number, property_id, status").eq("status", "approved");
      const { data: occupiedRooms } = await supabaseAdmin.from("rooms").select("id, room_number, property_id, status").eq("status", "occupied");
      if ((!activeTenants || activeTenants.length === 0) && (!approvedBookings || approvedBookings.length === 0) && (!occupiedRooms || occupiedRooms.length === 0)) {
        lastLeaseSyncResult = { releasedRooms: 0, checkedOutTenants: 0 };
        lastLeaseSyncTime = Date.now();
        return lastLeaseSyncResult;
      }
      if (activeTenants && activeTenants.length > 0) {
        for (const tenant of activeTenants) {
          if (!tenant.start_date) continue;
          const startDate = new Date(tenant.start_date);
          if (isNaN(startDate.getTime())) continue;
          const exts = paidExtensions.filter((e) => e.tenant_id === tenant.id);
          const totalExtMonths = exts.reduce((sum, e) => sum + (Number(e.extension_months) || 0), 0);
          const totalMonths = (Number(tenant.duration_months) || 1) + totalExtMonths;
          const computedEnd = new Date(startDate);
          computedEnd.setMonth(computedEnd.getMonth() + totalMonths);
          let finalEndDate = computedEnd;
          if (tenant.lease_end_date) {
            const lDate = new Date(tenant.lease_end_date);
            if (!isNaN(lDate.getTime()) && lDate.getTime() > finalEndDate.getTime()) {
              finalEndDate = lDate;
            }
          }
          if (now.getTime() >= finalEndDate.getTime()) {
            console.log(`[AUTO-RELEASE] Kontrak penyewa ${tenant.full_name} (Kamar ${tenant.room_number}) telah habis tanpa perpanjangan. Mengosongkan kamar.`);
            await supabaseAdmin.from("tenants").update({ status: "checkout" }).eq("id", tenant.id);
            checkedOutTenantsCount++;
            let roomQuery = supabaseAdmin.from("rooms").update({ status: "available", current_tenant_name: null }).eq("room_number", tenant.room_number);
            if (tenant.property_id) {
              roomQuery = roomQuery.eq("property_id", tenant.property_id);
              affectedPropertyIds.add(tenant.property_id);
            }
            await roomQuery;
            releasedRoomsCount++;
            await supabaseAdmin.from("bookings").update({ status: "checkout" }).eq("room_number", tenant.room_number).eq("status", "approved");
          }
        }
      }
      if (approvedBookings && approvedBookings.length > 0) {
        for (const booking of approvedBookings) {
          const startStr = booking.check_in_date || booking.booking_date;
          if (!startStr) continue;
          const startDate = new Date(startStr);
          if (isNaN(startDate.getTime())) continue;
          const endDate = new Date(startDate);
          if (booking.booking_type === "daily" && booking.duration_days && booking.duration_days > 0) {
            endDate.setDate(endDate.getDate() + booking.duration_days);
          } else {
            const months = Math.max(1, booking.duration_months || 1);
            endDate.setMonth(endDate.getMonth() + months);
          }
          if (now.getTime() >= endDate.getTime()) {
            console.log(`[AUTO-RELEASE] Booking ID ${booking.id} (Kamar ${booking.room_number}) telah berakhir. Mengosongkan kamar.`);
            await supabaseAdmin.from("bookings").update({ status: "checkout" }).eq("id", booking.id);
            if (booking.room_id) {
              await supabaseAdmin.from("rooms").update({ status: "available", current_tenant_name: null }).eq("id", booking.room_id);
            } else if (booking.room_number) {
              let rQuery = supabaseAdmin.from("rooms").update({ status: "available", current_tenant_name: null }).eq("room_number", booking.room_number);
              if (booking.property_id) {
                rQuery = rQuery.eq("property_id", booking.property_id);
              }
              await rQuery;
            }
            if (booking.property_id) affectedPropertyIds.add(booking.property_id);
            releasedRoomsCount++;
          }
        }
      }
      if (occupiedRooms && occupiedRooms.length > 0) {
        const activeTenantRoomKeys = new Set(
          (activeTenants || []).filter((t) => t.status !== "checkout").map((t) => `${t.property_id || ""}_${t.room_number}`)
        );
        const activeBookingRoomKeys = new Set(
          (approvedBookings || []).filter((b) => b.status === "approved").map((b) => `${b.property_id || ""}_${b.room_number}`)
        );
        for (const room of occupiedRooms) {
          const key = `${room.property_id || ""}_${room.room_number}`;
          if (!activeTenantRoomKeys.has(key) && !activeBookingRoomKeys.has(key)) {
            console.log(`[AUTO-RELEASE] Kamar ${room.room_number} status 'occupied' tanpa data penyewa aktif. Mengubah ke 'available'.`);
            await supabaseAdmin.from("rooms").update({ status: "available", current_tenant_name: null }).eq("id", room.id);
            releasedRoomsCount++;
            if (room.property_id) affectedPropertyIds.add(room.property_id);
          }
        }
      }
      for (const propId of affectedPropertyIds) {
        await syncPropertyRoomCountInSupabase(supabaseAdmin, propId);
      }
      lastLeaseSyncResult = { releasedRooms: releasedRoomsCount, checkedOutTenants: checkedOutTenantsCount };
      lastLeaseSyncTime = Date.now();
      return lastLeaseSyncResult;
    } finally {
      isSyncingLeasesInFlight = false;
    }
  }
  app.all("/api/system/sync-expired-leases", apiRateLimiter(6e4, 60), async (req, res) => {
    try {
      if (Date.now() - lastLeaseSyncTime < 6e4) {
        return res.status(200).json({ success: true, ...lastLeaseSyncResult, cached: true });
      }
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: "Supabase credentials not configured" });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      const result = await syncExpiredLeasesCore(supabaseAdmin);
      return res.status(200).json({ success: true, ...result });
    } catch (err) {
      console.error("[SYNC-EXPIRED-LEASES API Error]:", err);
      return res.status(500).json({ success: false, error: err.message || "Gagal sinkronisasi kamar habis kontrak" });
    }
  });
  let isServerQuotaRestricted = false;
  let serverQuotaRestrictedDetectedAt = 0;
  const SERVER_QUOTA_COOLDOWN_MS = 10 * 60 * 1e3;
  function isServerQuotaActive() {
    if (!isServerQuotaRestricted) return false;
    if (Date.now() - serverQuotaRestrictedDetectedAt > SERVER_QUOTA_COOLDOWN_MS) {
      isServerQuotaRestricted = false;
      return false;
    }
    return true;
  }
  function markServerQuotaRestricted(reason) {
    isServerQuotaRestricted = true;
    serverQuotaRestrictedDetectedAt = Date.now();
    console.log(`[SERVER NOTICE] Supabase egress quota or service restricted (${reason || "quota"}). Using resilient seed fallbacks.`);
  }
  app.get("/api/contract-extensions", apiRateLimiter(6e4, 180), optionalAdminAuth, async (req, res) => {
    if (isServerQuotaActive()) {
      return res.status(200).json({ success: true, data: [], fallback: true });
    }
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: "Supabase credentials not configured", data: [] });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      const limit = Math.min(Number(req.query.limit) || 1e3, 2e3);
      const offset = Number(req.query.offset) || 0;
      const status = req.query.status;
      const tenantId = req.query.tenant_id;
      const orderId = req.query.order_id;
      if (!req.authProfile) {
        if (!orderId) {
          return res.status(401).json({
            success: false,
            error: "Akses ditolak. Akses publik hanya diizinkan dengan parameter order_id valid.",
            data: []
          });
        }
      } else {
        const role = req.authProfile.role;
        if (role === "staff" && (req.authProfile.property_id === null || req.authProfile.property_id === void 0)) {
          return res.status(403).json({
            success: false,
            error: "Akun Staff belum ditugaskan ke properti mana pun. Hubungi Super Admin.",
            data: []
          });
        }
      }
      let query = supabaseAdmin.from("contract_extensions").select("*").order("id", { ascending: false }).range(offset, offset + limit - 1);
      if (status) {
        query = query.eq("status", status);
      }
      if (tenantId) {
        query = query.eq("tenant_id", tenantId);
      }
      if (orderId) {
        query = query.eq("midtrans_order_id", orderId);
      }
      if (req.authProfile?.property_id !== null && req.authProfile?.property_id !== void 0) {
        query = query.eq("property_id", req.authProfile.property_id);
      }
      const { data, error } = await query;
      if (error) {
        if (error.message?.includes("exceed_egress_quota") || error.message?.includes("quota") || error.message?.includes("restricted") || error.message?.includes("spend caps")) {
          markServerQuotaRestricted(error.message);
          return res.status(200).json({ success: true, data: [], fallback: true });
        }
        console.warn("[CONTRACT-EXTENSIONS API] Query notice:", error.message);
        return res.status(500).json({ success: false, error: error.message, data: [] });
      }
      return res.status(200).json({ success: true, data: data || [] });
    } catch (err) {
      if (err?.message?.includes("exceed_egress_quota") || err?.message?.includes("quota") || err?.message?.includes("restricted")) {
        markServerQuotaRestricted(err?.message);
      }
      return res.status(200).json({ success: true, data: [], fallback: true });
    }
  });
  app.post("/api/contract-extensions", apiRateLimiter(6e4, 60), express.json(), optionalAdminAuth, async (req, res) => {
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: "Supabase credentials not configured" });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      const body = req.body || {};
      const id = body.id;
      let resultData = null;
      let eventType = "INSERT";
      if (id) {
        if (!req.authProfile || !can(req.authProfile.role, "bookings", "approve")) {
          return res.status(403).json({ success: false, error: "Akses ditolak. Hanya staf berwenang yang dapat mengubah perpanjangan kontrak." });
        }
        const { data: existingExt } = await supabaseAdmin.from("contract_extensions").select("*").eq("id", id).maybeSingle();
        if (!existingExt) {
          return res.status(404).json({ success: false, error: "Data perpanjangan kontrak tidak ditemukan." });
        }
        const propCheck = checkPropertyAccess(req.authProfile, existingExt.property_id);
        if (!propCheck.allowed) {
          return res.status(403).json({ success: false, error: propCheck.reason });
        }
        const allowedUpdateFields = ["status", "notes", "payment_method", "paid_at", "invoice_id"];
        const safePayload = {};
        for (const f of allowedUpdateFields) {
          if (body[f] !== void 0) safePayload[f] = body[f];
        }
        eventType = "UPDATE";
        const { data, error } = await supabaseAdmin.from("contract_extensions").update(safePayload).eq("id", id).select();
        if (error) throw error;
        resultData = data && data[0] ? data[0] : { ...existingExt, ...safePayload };
      } else {
        const allowedInsertFields = [
          "tenant_id",
          "tenant_name",
          "property_id",
          "property_name",
          "room_number",
          "old_start_date",
          "old_duration_months",
          "extension_months",
          "monthly_rate",
          "total_amount",
          "payment_method",
          "notes",
          "midtrans_order_id"
        ];
        const safePayload = {};
        for (const f of allowedInsertFields) {
          if (body[f] !== void 0) safePayload[f] = body[f];
        }
        const extMonths = Number(safePayload.extension_months) || 1;
        const monthRate = Number(safePayload.monthly_rate) || 0;
        safePayload.total_amount = extMonths * monthRate;
        const isPrivileged = req.authProfile && can(req.authProfile.role, "bookings", "approve");
        if (isPrivileged && body.status) {
          safePayload.status = body.status;
        } else {
          safePayload.status = "pending";
        }
        eventType = "INSERT";
        const { data, error } = await supabaseAdmin.from("contract_extensions").insert(safePayload).select();
        if (error) throw error;
        resultData = data && data[0] ? data[0] : safePayload;
      }
      try {
        const channel = supabaseAdmin.channel("db-global-realtime");
        await channel.subscribe();
        await channel.send({
          type: "broadcast",
          event: "db_mutation",
          payload: {
            table: "contract_extensions",
            eventType,
            data: resultData,
            sourceTabId: "backend-server"
          }
        });
      } catch (bErr) {
        console.warn("[CONTRACT-EXTENSIONS] Realtime broadcast warning:", bErr);
      }
      return res.status(200).json({ success: true, data: resultData });
    } catch (err) {
      console.error("[CONTRACT-EXTENSIONS SAVE API Error]:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });
  app.delete("/api/contract-extensions/:id", apiRateLimiter(6e4, 60), requireAdminAuth, requirePermission("bookings", "approve"), async (req, res) => {
    try {
      const { id } = req.params;
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: "Supabase credentials not configured" });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      const { data: existingExt } = await supabaseAdmin.from("contract_extensions").select("*").eq("id", id).maybeSingle();
      if (!existingExt) {
        return res.status(404).json({ success: false, error: "Data perpanjangan kontrak tidak ditemukan." });
      }
      const propCheck = checkPropertyAccess(req.authProfile, existingExt.property_id);
      if (!propCheck.allowed) {
        return res.status(403).json({ success: false, error: propCheck.reason });
      }
      const { error } = await supabaseAdmin.from("contract_extensions").delete().eq("id", id);
      if (error) throw error;
      try {
        const channel = supabaseAdmin.channel("db-global-realtime");
        await channel.subscribe();
        await channel.send({
          type: "broadcast",
          event: "db_mutation",
          payload: {
            table: "contract_extensions",
            eventType: "DELETE",
            data: { id },
            sourceTabId: "backend-server"
          }
        });
      } catch (bErr) {
        console.warn("[CONTRACT-EXTENSIONS] Realtime delete broadcast warning:", bErr);
      }
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error("[CONTRACT-EXTENSIONS DELETE API Error]:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });
  app.get("/api/public/rooms-availability", apiRateLimiter(6e4, 180), async (req, res) => {
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: "Supabase credentials not configured", data: [] });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      const propertyId = req.query.property_id;
      const roomId = req.query.room_id;
      let query = supabaseAdmin.from("bookings").select("id, room_id, property_id, check_in, check_out, status").in("status", ["confirmed", "active", "paid", "approved", "reserved"]);
      if (propertyId) {
        query = query.eq("property_id", propertyId);
      }
      if (roomId) {
        query = query.eq("room_id", roomId);
      }
      const { data, error } = await query;
      if (error) {
        return res.status(500).json({ success: false, error: error.message, data: [] });
      }
      const safeAvailability = (data || []).map((b) => ({
        room_id: b.room_id,
        property_id: b.property_id,
        check_in: b.check_in,
        check_out: b.check_out,
        status: b.status
      }));
      return res.status(200).json({ success: true, data: safeAvailability });
    } catch (err) {
      console.error("[Public Availability Error]:", err);
      return res.status(500).json({ success: false, error: err.message, data: [] });
    }
  });
  app.get("/api/bookings", requireAdminAuth, requirePermission("bookings", "read"), apiRateLimiter(6e4, 180), async (req, res) => {
    if (isServerQuotaActive()) {
      return res.status(200).json({ success: true, data: [], fallback: true });
    }
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: "Supabase credentials not configured", data: [] });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      const limit = Math.min(Number(req.query.limit) || 1e3, 2e3);
      const offset = Number(req.query.offset) || 0;
      const status = req.query.status;
      const requestedPropId = req.query.property_id;
      const orderId = req.query.order_id;
      const userAssignedProp = req.authProfile?.property_id;
      let effectivePropertyId = requestedPropId || null;
      if (userAssignedProp !== null && userAssignedProp !== void 0) {
        if (requestedPropId && String(requestedPropId) !== String(userAssignedProp)) {
          return res.status(403).json({ success: false, error: `Akses ditolak. Anda hanya berwenang untuk Properti ID ${userAssignedProp}.`, data: [] });
        }
        effectivePropertyId = userAssignedProp;
      } else if (requestedPropId) {
        const propAccess = checkPropertyAccess(req.authProfile, requestedPropId);
        if (!propAccess.allowed) {
          return res.status(403).json({ success: false, error: propAccess.reason || "Akses ditolak ke properti ini.", data: [] });
        }
      }
      let query = supabaseAdmin.from("bookings").select("*").order("created_at", { ascending: false }).range(offset, offset + limit - 1);
      if (status) {
        query = query.eq("status", status);
      }
      if (effectivePropertyId) {
        query = query.eq("property_id", effectivePropertyId);
      }
      if (orderId) {
        query = query.eq("midtrans_order_id", orderId);
      }
      const { data, error } = await query;
      if (error) {
        if (error.message?.includes("exceed_egress_quota") || error.message?.includes("quota") || error.message?.includes("restricted") || error.message?.includes("spend caps")) {
          markServerQuotaRestricted(error.message);
          const seeds = getTableDefaultSeeds("bookings");
          return res.status(200).json({ success: true, data: seeds, fallback: true });
        }
        console.warn("[BOOKINGS API] Query notice:", error.message);
        return res.status(500).json({ success: false, error: error.message, data: [] });
      }
      const sanitizedData = sanitizePiiResponse(req.authProfile?.role, data || [], [
        "nik",
        "spouse_nik",
        "spouse_phone",
        "marriage_certificate_url"
      ]);
      return res.status(200).json({ success: true, data: sanitizedData });
    } catch (err) {
      if (err?.message?.includes("exceed_egress_quota") || err?.message?.includes("quota") || err?.message?.includes("restricted")) {
        markServerQuotaRestricted(err?.message);
      }
      const seeds = getTableDefaultSeeds("bookings");
      return res.status(200).json({ success: true, data: seeds, fallback: true });
    }
  });
  const PUBLIC_READ_TABLES = /* @__PURE__ */ new Set([
    "properties",
    "rooms",
    "facilities",
    "coupons",
    "settings"
  ]);
  const FORBIDDEN_WITHOUT_AUTH = /* @__PURE__ */ new Set([
    "users",
    "tenants",
    "payments",
    "contracts",
    "financial_transactions",
    "journal_entries",
    "midtrans_logs",
    "cash_flows",
    "pnl_reports",
    "balance_sheets",
    "audits",
    "bookings",
    "surveys",
    "contract_extensions"
  ]);
  const TABLE_TO_RESOURCE_MAP = {
    users: "users",
    tenants: "tenants",
    payments: "payments",
    contracts: "contracts",
    contract_extensions: "contracts",
    financial_transactions: "finances",
    journal_entries: "finances",
    midtrans_logs: "payments",
    cash_flows: "finances",
    pnl_reports: "finances",
    balance_sheets: "finances",
    audits: "audit_logs",
    activity_logs: "audit_logs",
    bookings: "bookings",
    surveys: "surveys",
    properties: "properties",
    rooms: "properties",
    fixed_assets: "properties"
  };
  app.get("/api/data/:table", apiRateLimiter(6e4, 180), async (req, res, next) => {
    const { table } = req.params;
    if (FORBIDDEN_WITHOUT_AUTH.has(table)) {
      return requireAdminAuth(req, res, async () => {
        try {
          const userRole = req.authProfile?.role;
          const resource = TABLE_TO_RESOURCE_MAP[table] || table;
          if (!can(userRole, resource, "read")) {
            return res.status(403).json({
              success: false,
              error: `Akses ditolak: Peran '${userRole}' tidak memiliki izin untuk melihat data '${table}'.`,
              data: []
            });
          }
          const userAssignedProp = req.authProfile?.property_id;
          if (userRole === "staff" && (userAssignedProp === null || userAssignedProp === void 0)) {
            return res.status(403).json({
              success: false,
              error: "Akun Staff belum ditugaskan ke properti mana pun. Hubungi Super Admin.",
              data: []
            });
          }
          const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
          const serviceKey = getServiceRoleKeyOrThrow();
          if (!supabaseUrl || !serviceKey) {
            return res.status(500).json({ success: false, error: "Supabase credentials not configured", data: [] });
          }
          const supabaseAdmin = createClient(supabaseUrl, serviceKey);
          const limit = Math.min(Number(req.query.limit) || 1e3, 2e3);
          const offset = Number(req.query.offset) || 0;
          const orderCol = req.query.order_col || (table === "bookings" || table === "surveys" ? "created_at" : "id");
          const orderAsc = req.query.order_asc === "true";
          let query = supabaseAdmin.from(table).select("*").order(orderCol, { ascending: orderAsc }).range(offset, offset + limit - 1);
          const TABLES_WITH_PROPERTY_ID = ["bookings", "surveys", "contracts", "contract_extensions", "rooms", "fixed_assets", "payments", "tenants"];
          if (userAssignedProp !== null && userAssignedProp !== void 0 && TABLES_WITH_PROPERTY_ID.includes(table)) {
            query = query.eq("property_id", userAssignedProp);
          }
          const { data, error } = await query;
          if (error) {
            if (error.message?.includes("exceed_egress_quota") || error.message?.includes("quota") || error.message?.includes("restricted") || error.message?.includes("spend caps")) {
              markServerQuotaRestricted(error.message);
              const seeds = table === "properties" ? DEFAULT_PROPERTIES : table === "rooms" ? DEFAULT_ROOMS : [];
              return res.status(200).json({ success: true, data: seeds, fallback: true });
            }
            console.warn(`[DATA API:${table}] Authenticated notice:`, error.message);
            return res.status(500).json({ success: false, error: error.message, data: [] });
          }
          const sanitizedData = sanitizePiiResponse(req.authProfile?.role, data || [], [
            "nik",
            "spouse_nik",
            "spouse_phone",
            "marriage_certificate_url"
          ]);
          return res.status(200).json({ success: true, data: sanitizedData });
        } catch (err) {
          if (err?.message?.includes("exceed_egress_quota") || err?.message?.includes("quota") || err?.message?.includes("restricted")) {
            markServerQuotaRestricted(err?.message);
          }
          const seeds = table === "properties" ? DEFAULT_PROPERTIES : table === "rooms" ? DEFAULT_ROOMS : [];
          return res.status(200).json({ success: true, data: seeds, fallback: true });
        }
      });
    }
    if (!PUBLIC_READ_TABLES.has(table)) {
      return res.status(403).json({ success: false, error: `Access to table '${table}' is restricted.` });
    }
    if (isServerQuotaActive()) {
      const seeds = table === "properties" ? DEFAULT_PROPERTIES : table === "rooms" ? DEFAULT_ROOMS : [];
      return res.status(200).json({ success: true, data: seeds, fallback: true });
    }
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: "Supabase credentials not configured", data: [] });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      const limit = Math.min(Number(req.query.limit) || 1e3, 2e3);
      const offset = Number(req.query.offset) || 0;
      const orderCol = req.query.order_col || "id";
      const orderAsc = req.query.order_asc === "true";
      let query = supabaseAdmin.from(table).select("*").order(orderCol, { ascending: orderAsc }).range(offset, offset + limit - 1);
      const { data, error } = await query;
      if (error) {
        if (error.message?.includes("exceed_egress_quota") || error.message?.includes("quota") || error.message?.includes("restricted") || error.message?.includes("spend caps")) {
          markServerQuotaRestricted(error.message);
          const seeds = getTableDefaultSeeds(table);
          return res.status(200).json({ success: true, data: seeds, fallback: true });
        }
        console.warn(`[DATA API:${table}] Query notice:`, error.message);
        return res.status(500).json({ success: false, error: error.message, data: [] });
      }
      return res.status(200).json({ success: true, data: data || [] });
    } catch (err) {
      if (err?.message?.includes("exceed_egress_quota") || err?.message?.includes("quota") || err?.message?.includes("restricted")) {
        markServerQuotaRestricted(err?.message);
      }
      const seeds = getTableDefaultSeeds(table);
      return res.status(200).json({ success: true, data: seeds, fallback: true });
    }
  });
  app.all("/api/data/:table", (req, res) => {
    return res.status(405).json({
      success: false,
      error: `Metode ${req.method} tidak diizinkan pada /api/data/:table. Gunakan endpoint khusus terkait.`
    });
  });
  app.get("/api/midtrans/status/:orderId", apiRateLimiter(6e4, 30), async (req, res) => {
    try {
      const { orderId } = req.params;
      let rawServerKey = process.env.MIDTRANS_SERVER_KEY || "";
      let serverKey = rawServerKey.trim();
      if (serverKey.startsWith('"') && serverKey.endsWith('"')) serverKey = serverKey.slice(1, -1);
      else if (serverKey.startsWith("'") && serverKey.endsWith("'")) serverKey = serverKey.slice(1, -1);
      serverKey = serverKey.trim();
      if (!serverKey || serverKey === "YOUR_MIDTRANS_SERVER_KEY_HERE") {
        return res.status(400).json({ success: false, error: "MIDTRANS_SERVER_KEY belum dikonfigurasi." });
      }
      const isProduction = process.env.MIDTRANS_IS_PRODUCTION === "true";
      const baseUrl = isProduction ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com";
      const authHeader = Buffer.from(`${serverKey}:`).toString("base64");
      const response = await fetch(`${baseUrl}/v2/${orderId}/status`, {
        headers: {
          "Authorization": `Basic ${authHeader}`,
          "Accept": "application/json"
        }
      });
      const data = await response.json();
      if (data.transaction_status === "settlement" || data.transaction_status === "capture") {
        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
        const serviceKey = getServiceRoleKeyOrThrow();
        const supabase = createClient(supabaseUrl, serviceKey);
        try {
          if (orderId.startsWith("EXT-") || orderId.startsWith("EXTEND-")) {
            await settleContractExtensionTransaction(
              supabase,
              orderId,
              data.payment_type || "Midtrans SNAP",
              data.transaction_id,
              Number(data.gross_amount || 0)
            );
          } else {
            await settleBookingTransaction(
              supabase,
              orderId,
              data.payment_type || "Midtrans SNAP",
              data.transaction_id,
              Number(data.gross_amount || 0)
            );
          }
        } catch (sErr) {
          console.warn("[Status Check Auto-Settle Warning]:", sErr);
        }
      }
      return res.status(200).json({ success: true, midtrans: data });
    } catch (err) {
      console.error("[API Midtrans Status Error]:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });
  app.post("/api/email/send", apiRateLimiter(6e4, 20), optionalAdminAuth, async (req, res) => {
    try {
      const { to, subject, text, html, fromEmail, fromName } = req.body;
      if (!to || typeof to !== "string" || !to.includes("@") || to.length > 100) {
        return res.status(400).json({
          success: false,
          message: "Alamat email tujuan (to) tidak valid."
        });
      }
      if (!req.authProfile) {
        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
        const serviceKey = getServiceRoleKeyOrThrow();
        if (supabaseUrl && serviceKey) {
          const supabaseAdmin = createClient(supabaseUrl, serviceKey);
          const [
            { data: bookingMatch },
            { data: surveyMatch },
            { data: tenantMatch }
          ] = await Promise.all([
            supabaseAdmin.from("bookings").select("id").or(`email.eq.${to},occupant_email.eq.${to}`).limit(1).maybeSingle(),
            supabaseAdmin.from("surveys").select("id").eq("email", to).limit(1).maybeSingle(),
            supabaseAdmin.from("tenants").select("id").eq("email", to).limit(1).maybeSingle()
          ]);
          if (!bookingMatch && !surveyMatch && !tenantMatch) {
            return res.status(403).json({
              success: false,
              message: "Akses ditolak: Pengiriman email unauthenticated hanya diizinkan kepada pemesan atau penghuni terdaftar."
            });
          }
        }
      }
      let apiKey = process.env.MAILERSEND_API_KEY || "";
      apiKey = apiKey.trim();
      if (apiKey.startsWith('"') && apiKey.endsWith('"')) apiKey = apiKey.slice(1, -1);
      else if (apiKey.startsWith("'") && apiKey.endsWith("'")) apiKey = apiKey.slice(1, -1);
      apiKey = apiKey.trim();
      if (!apiKey || apiKey === "YOUR_MAILERSEND_API_KEY_HERE") {
        return res.status(500).json({
          success: false,
          message: "Gagal mengirim email. MAILERSEND_API_KEY belum dikonfigurasi."
        });
      }
      const baseFromEmail = (req.authProfile ? fromEmail : void 0) || process.env.MAILERSEND_FROM_EMAIL || "info@test-zkq340e73m2gd796.mlsender.net";
      const resolvedFromEmail = await resolveVerifiedFromEmail(apiKey, baseFromEmail);
      const resolvedFromName = (req.authProfile ? fromName : void 0) || process.env.MAILERSEND_FROM_NAME || "Samara Stay";
      const cleanSubject = String(subject || "Notifikasi Samara Stay").slice(0, 150);
      const rawHtml = String(html || `<p>${text || "Ini adalah notifikasi penting dari Samara Stay."}</p>`).slice(0, 1e5);
      const { html: processedHtml, attachments } = await processEmailHtmlAndSignatures(rawHtml);
      const payload = {
        from: { email: resolvedFromEmail, name: resolvedFromName },
        to: [{ email: to, name: to.split("@")[0].slice(0, 50) }],
        subject: cleanSubject,
        text: String(text || "Ini adalah notifikasi penting dari Samara Stay.").slice(0, 2e4),
        html: processedHtml,
        attachments: attachments.length > 0 ? attachments : void 0
      };
      console.log("[API MAILERSEND] Dispatching email with retry policy to:", to, "Subject:", payload.subject, "inline attachments:", attachments.length);
      const result = await sendEmailWithRetry(apiKey, payload, to, payload.subject);
      if (!result.success) {
        return res.status(result.status || 500).json({
          success: false,
          status: result.status || 500,
          message: "Gagal mengirim email via MailerSend API setelah percobaan retry.",
          details: result.dataText || result.error || "Terjadi kesalahan pengiriman"
        });
      }
      return res.json({
        success: true,
        message: "Email berhasil terkirim via MailerSend!",
        details: result.dataText ? JSON.parse(result.dataText) : { status: "accepted" }
      });
    } catch (err) {
      console.error("[API MAILERSEND ERROR]", err);
      return res.status(500).json({
        success: false,
        message: "Terjadi kesalahan sistem internal saat mengirim email.",
        error: err.message || err
      });
    }
  });
  app.post("/api/signatures/upload", apiRateLimiter(6e4, 30), express.json({ limit: "1mb" }), (req, res) => {
    try {
      const { image, identifier } = req.body || {};
      if (!image || typeof image !== "string" || image.length < 50) {
        return res.status(400).json({ success: false, error: "Data gambar tanda tangan tidak valid." });
      }
      if (image.length > 1.5 * 1024 * 1024) {
        return res.status(400).json({ success: false, error: "Ukuran tanda tangan melebihi batas maksimum 1MB." });
      }
      const cleanBase64 = image.includes(",") ? image.split(",")[1] : image;
      const imgBuffer = Buffer.from(cleanBase64, "base64");
      if (imgBuffer.length > 1024 * 1024) {
        return res.status(400).json({ success: false, error: "Ukuran file tanda tangan melebihi 1MB." });
      }
      const isPng = imgBuffer.length >= 8 && imgBuffer[0] === 137 && imgBuffer[1] === 80 && imgBuffer[2] === 78 && imgBuffer[3] === 71 && imgBuffer[4] === 13 && imgBuffer[5] === 10 && imgBuffer[6] === 26 && imgBuffer[7] === 10;
      const isJpeg = imgBuffer.length >= 3 && imgBuffer[0] === 255 && imgBuffer[1] === 216 && imgBuffer[2] === 255;
      const isWebp = imgBuffer.length >= 12 && imgBuffer[0] === 82 && imgBuffer[1] === 73 && imgBuffer[2] === 70 && imgBuffer[3] === 70 && imgBuffer[8] === 87 && imgBuffer[9] === 69 && imgBuffer[10] === 66 && imgBuffer[11] === 80;
      if (!isPng && !isJpeg && !isWebp) {
        return res.status(400).json({ success: false, error: "Format tanda tangan tidak valid. Hanya PNG, JPEG, atau WebP yang diperbolehkan." });
      }
      const mimeType = isPng ? "image/png" : isJpeg ? "image/jpeg" : "image/webp";
      const fileExt = isPng ? "png" : isJpeg ? "jpg" : "webp";
      const cleanId = (identifier || "sig").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 30);
      const sigId = `sig_${cleanId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      if (signatureStore.size >= 500) {
        const oldestKey = signatureStore.keys().next().value;
        if (oldestKey) signatureStore.delete(oldestKey);
      }
      signatureStore.set(sigId, { data: cleanBase64, mime: mimeType, createdAt: Date.now() });
      const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
      const host = req.get("host");
      const publicUrl = `${protocol}://${host}/api/signatures/${sigId}.${fileExt}`;
      console.log(`[API SIGNATURE] Successfully stored signature ${sigId}, publicUrl: ${publicUrl}`);
      return res.json({
        success: true,
        publicUrl,
        sigId
      });
    } catch (err) {
      console.error("[API SIGNATURE ERROR]", err);
      return res.status(500).json({ success: false, error: err.message || "Gagal menyimpan tanda tangan" });
    }
  });
  app.get(["/api/signatures/:id.png", "/api/signatures/:id.webp", "/api/signatures/:id.jpg", "/api/signatures/:id.jpeg"], (req, res) => {
    const sigId = req.params.id;
    if (!sigId || !/^[a-zA-Z0-9_-]{5,80}$/.test(sigId)) {
      return res.status(400).send("Format ID tanda tangan tidak valid");
    }
    const item = signatureStore.get(sigId);
    if (!item) {
      return res.status(404).send("Signature image not found");
    }
    try {
      const imgBuffer = Buffer.from(item.data, "base64");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      res.writeHead(200, {
        "Content-Type": item.mime || "image/png",
        "Content-Length": imgBuffer.length,
        "Cache-Control": "public, max-age=31536000, immutable"
      });
      return res.end(imgBuffer);
    } catch (err) {
      return res.status(500).send("Error rendering signature");
    }
  });
  function getSupabaseServerClient(token) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase URL atau Anon Key tidak dikonfigurasi di server");
    }
    const options = {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    };
    if (token) {
      options.global = {
        headers: {
          Authorization: `Bearer ${token}`
        }
      };
    }
    return createClient(supabaseUrl, supabaseAnonKey, options);
  }
  function getCookie(req, name) {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return null;
    const list = {};
    cookieHeader.split(";").forEach((cookie) => {
      const parts = cookie.split("=");
      const key = parts.shift()?.trim();
      if (key) {
        list[key] = decodeURIComponent(parts.join("="));
      }
    });
    return list[name] || null;
  }
  function setAuthCookies(res, accessToken, refreshToken, expiresInSec) {
    const secure = process.env.NODE_ENV === "production" ? "Secure;" : "";
    const cookies = [
      `sb-access-token=${accessToken}; Path=/; HttpOnly; SameSite=Lax; ${secure} Max-Age=${expiresInSec}`,
      `sb-refresh-token=${refreshToken}; Path=/; HttpOnly; SameSite=Lax; ${secure} Max-Age=31536000`
    ];
    res.setHeader("Set-Cookie", cookies);
  }
  function clearAuthCookies(res) {
    const secure = process.env.NODE_ENV === "production" ? "Secure;" : "";
    res.setHeader("Set-Cookie", [
      `sb-access-token=; Path=/; HttpOnly; SameSite=Lax; ${secure} Max-Age=0`,
      `sb-refresh-token=; Path=/; HttpOnly; SameSite=Lax; ${secure} Max-Age=0`
    ]);
  }
  async function getOrMigrateUserProfile(client, user) {
    if (!user) return null;
    const email = (user.email || "").trim().toLowerCase();
    const isSuper = isSuperAdminEmail(email);
    const isOwner = isOwnerEmail(email);
    const isAnakOwner = isAnakOwnerEmail(email);
    const isWhitelisted = isSuper || isOwner || isAnakOwner;
    const targetRole = isSuper ? "super" : isOwner ? "owner" : isAnakOwner ? "anak_owner" : null;
    const isEmailConfirmed = Boolean(user.email_confirmed_at || user.confirmed_at || !isEmailConfirmationEnforced());
    let { data: userData, error: userError } = await client.from("users").select("*").eq("id", user.id).maybeSingle();
    if (userError) {
      console.error("[AUTH API] Error fetching user profile:", userError);
    }
    if (userData) {
      if (isWhitelisted && targetRole && isEmailConfirmed && userData.role !== targetRole) {
        const oldRole = userData.role;
        userData.role = targetRole;
        userData.role_id = isSuper ? 1 : 2;
        userData.active = true;
        try {
          const serviceKey = getServiceRoleKeyOrThrow();
          const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
          if (supabaseUrl && serviceKey) {
            const adminClient = createClient(supabaseUrl, serviceKey);
            await adminClient.from("users").update({
              role: targetRole,
              role_id: isSuper ? 1 : 2,
              active: true
            }).eq("id", user.id);
            await adminClient.from("activity_logs").insert({
              admin_name: "System Security",
              action: "WHITELIST_ROLE_ELEVATION",
              detail: `Pengangkatan peran user ${email} dari "${oldRole}" menjadi "${targetRole}" via whitelist terverifikasi.`,
              created_at: (/* @__PURE__ */ new Date()).toISOString()
            });
          }
        } catch (e) {
          console.warn("[AUTH API] Role elevation notice:", e);
        }
      }
      return userData;
    }
    const shouldElevate = isWhitelisted && isEmailConfirmed && targetRole;
    const userRole = shouldElevate ? targetRole : process.env.RBAC_V2_ENABLED === "true" ? "user" : "staff";
    userData = {
      id: user.id,
      full_name: user.user_metadata?.full_name || user.email?.split("@")[0] || (userRole === "owner" ? "Owner Investor" : userRole === "anak_owner" ? "Anak Owner" : userRole === "super" ? "Super Administrator" : "User"),
      email,
      role: userRole,
      role_id: shouldElevate ? isSuper ? 1 : 2 : 4,
      access: shouldElevate ? isSuper ? "Semua Properti (Super Admin)" : isOwner ? "Owner Investor Portfolio" : "Akses Operasional, Hunian & Keuangan (Anak Owner)" : userRole === "user" ? "Pengguna Publik Terdaftar" : "Staff Operasional Terbatas",
      active: true,
      property_id: null,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    try {
      const serviceKey = getServiceRoleKeyOrThrow();
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      if (supabaseUrl && serviceKey) {
        const adminClient = createClient(supabaseUrl, serviceKey);
        await adminClient.from("users").upsert(userData, { onConflict: "id" });
        if (shouldElevate) {
          await adminClient.from("activity_logs").insert({
            admin_name: "System Security",
            action: "WHITELIST_ROLE_ELEVATION",
            detail: `Pembuatan profil baru user ${email} diangkat menjadi "${targetRole}" via whitelist terverifikasi.`,
            created_at: (/* @__PURE__ */ new Date()).toISOString()
          });
        }
      }
    } catch (e) {
      console.warn("[AUTH API] Profile persistence notice:", e);
    }
    console.log(`[AUTH API] Synthesized profile for user ${email} (role: ${userRole})`);
    return userData;
  }
  app.post("/api/auth/login", apiRateLimiter(6e4, 20), async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ success: false, error: "Email dan password wajib diisi" });
      }
      const cleanEmail = email.trim().toLowerCase();
      const cleanPassword = password.trim();
      const ipKey = `ip:${req.ip || req.socket?.remoteAddress || "unknown"}`;
      const emailKey = `email:${cleanEmail}`;
      if (isLoginRateLimited(ipKey) || isLoginRateLimited(emailKey)) {
        return res.status(429).json({
          success: false,
          error: "Terlalu banyak percobaan login gagal. Demi keamanan, akun terkunci sementara selama 15 menit."
        });
      }
      const isSuper = isSuperAdminEmail(cleanEmail);
      const isOwner = isOwnerEmail(cleanEmail);
      const isAnakOwner = isAnakOwnerEmail(cleanEmail);
      const client = getSupabaseServerClient();
      const signInResult = await client.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword
      });
      if (signInResult.error || !signInResult.data?.session || !signInResult.data?.user) {
        recordLoginFailure(ipKey);
        recordLoginFailure(emailKey);
        return res.status(401).json({
          success: false,
          error: "Email atau kata sandi yang Anda masukkan salah. Silakan periksa kembali."
        });
      }
      clearLoginFailures(ipKey);
      clearLoginFailures(emailKey);
      const { session, user } = signInResult.data;
      const isConfirmed = Boolean(user.email_confirmed_at || user.confirmed_at);
      if (!isConfirmed && isEmailConfirmationEnforced()) {
        return res.status(403).json({
          success: false,
          error: "Email Anda belum dikonfirmasi. Silakan periksa kotak masuk/spam email Anda dan klik tautan konfirmasi sebelum masuk."
        });
      }
      const authClient = getSupabaseServerClient(session.access_token);
      const userData = await getOrMigrateUserProfile(authClient, user);
      let profile;
      if (userData) {
        if (!userData.active) {
          return res.status(403).json({ success: false, error: "Akun Anda dinonaktifkan oleh administrator." });
        }
        const effectiveRole = resolveEffectiveRole(userData, user.email || "", isConfirmed || !isEmailConfirmationEnforced());
        profile = {
          id: user.id,
          email: user.email || "",
          name: userData.full_name || user.email?.split("@")[0] || (effectiveRole === "anak_owner" ? "Anak Owner" : "User"),
          role: effectiveRole,
          raw_role: effectiveRole,
          property_id: userData.property_id !== void 0 ? userData.property_id : null
        };
      } else {
        const fullName = user.user_metadata?.full_name || user.email?.split("@")[0] || "User";
        const effectiveRole = resolveEffectiveRole(null, user.email || "", isConfirmed || !isEmailConfirmationEnforced());
        profile = {
          id: user.id,
          email: user.email || "",
          name: fullName,
          role: effectiveRole,
          raw_role: effectiveRole,
          property_id: null
        };
      }
      setAuthCookies(res, session.access_token, session.refresh_token, session.expires_in);
      return res.json({
        success: true,
        user: profile,
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in
      });
    } catch (err) {
      console.error("[AUTH API ERROR] Login exception:", err);
      return res.status(500).json({ success: false, error: err.message || "Terjadi kesalahan sistem saat memproses login." });
    }
  });
  app.post("/api/auth/register", apiRateLimiter(6e4, 10), async (req, res) => {
    try {
      const { email, password, fullName } = req.body;
      if (!email || !password || !fullName) {
        return res.status(400).json({ success: false, error: "Email, password, dan nama lengkap wajib diisi" });
      }
      const cleanEmail = email.trim().toLowerCase();
      const cleanPassword = password.trim();
      const cleanFullName = fullName.trim();
      if (cleanPassword.length < 6) {
        return res.status(400).json({ success: false, error: "Password minimal harus 6 karakter." });
      }
      const client = getSupabaseServerClient();
      const { data, error } = await client.auth.signUp({
        email: cleanEmail,
        password: cleanPassword,
        options: {
          data: {
            full_name: cleanFullName
          }
        }
      });
      if (error) {
        if (error.message?.toLowerCase().includes("already registered") || error.status === 422) {
          return res.json({
            success: true,
            message: "Pendaftaran diproses. Jika email belum terdaftar, tautan konfirmasi telah dikirim."
          });
        }
        return res.status(400).json({ success: false, error: error.message });
      }
      if (data.user) {
        const targetRole = process.env.RBAC_V2_ENABLED === "true" ? "user" : "staff";
        const targetRoleId = 4;
        const newUserRecord = {
          id: data.user.id,
          email: cleanEmail,
          full_name: cleanFullName,
          role: targetRole,
          role_id: targetRoleId,
          access: targetRole === "user" ? "Pengguna Publik Terdaftar" : "Staff Operasional Terbatas",
          active: true,
          property_id: null,
          created_at: (/* @__PURE__ */ new Date()).toISOString()
        };
        try {
          const serviceKey = getServiceRoleKeyOrThrow();
          const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
          if (supabaseUrl && serviceKey) {
            const adminClient = createClient(supabaseUrl, serviceKey);
            await adminClient.from("users").upsert(newUserRecord, { onConflict: "id" });
          }
        } catch (dbErr) {
          console.warn("[Register] users table provisioning notice:", dbErr);
        }
        if (data.session) {
          setAuthCookies(res, data.session.access_token, data.session.refresh_token, data.session.expires_in);
          return res.json({
            success: true,
            user: {
              id: data.user.id,
              email: cleanEmail,
              name: cleanFullName,
              role: targetRole,
              raw_role: targetRole
            },
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_in: data.session.expires_in
          });
        }
        return res.json({
          success: true,
          message: "Pendaftaran berhasil! Silakan periksa email Anda untuk konfirmasi akun."
        });
      }
      return res.status(400).json({ success: false, error: "Gagal mendaftarkan akun" });
    } catch (err) {
      console.error("[AUTH API ERROR] Register exception:", err);
      return res.status(500).json({ success: false, error: err.message || "Terjadi kesalahan sistem" });
    }
  });
  app.post("/api/auth/logout", async (req, res) => {
    try {
      const accessToken = getCookie(req, "sb-access-token");
      if (accessToken) {
        const client = getSupabaseServerClient(accessToken);
        await client.auth.signOut().catch(() => {
        });
      }
    } catch (e) {
    }
    clearAuthCookies(res);
    return res.json({ success: true });
  });
  app.get("/api/auth/me", async (req, res) => {
    try {
      let accessToken = getCookie(req, "sb-access-token");
      let refreshToken = getCookie(req, "sb-refresh-token");
      if (!accessToken && req.headers.authorization) {
        const parts = req.headers.authorization.split(" ");
        if (parts[0] === "Bearer") {
          accessToken = parts[1];
        }
      }
      if (!accessToken && req.headers["x-access-token"]) {
        const raw = req.headers["x-access-token"];
        accessToken = Array.isArray(raw) ? raw[0] : raw;
      }
      if (!refreshToken && req.headers["x-refresh-token"]) {
        const raw = req.headers["x-refresh-token"];
        refreshToken = Array.isArray(raw) ? raw[0] : raw;
      }
      if (!accessToken) {
        if (refreshToken) {
          const client2 = getSupabaseServerClient();
          const { data, error: error2 } = await client2.auth.refreshSession({ refresh_token: String(refreshToken) });
          if (!error2 && data.session) {
            const { session, user: user2 } = data;
            setAuthCookies(res, session.access_token, session.refresh_token, session.expires_in);
            const isConfirmed = Boolean(user2.email_confirmed_at || user2.confirmed_at || !isEmailConfirmationEnforced());
            const userData2 = await getOrMigrateUserProfile(client2, user2);
            const userRole2 = resolveEffectiveRole(userData2, user2.email || "", isConfirmed);
            return res.json({
              success: true,
              user: {
                id: user2.id,
                email: user2.email || "",
                name: userData2?.full_name || user2.email?.split("@")[0] || (userRole2 === "anak_owner" ? "Anak Owner" : "User"),
                role: userRole2,
                raw_role: userRole2,
                property_id: userData2?.property_id !== void 0 ? userData2.property_id : null
              },
              access_token: session.access_token,
              refresh_token: session.refresh_token,
              expires_in: session.expires_in
            });
          }
        }
        return res.status(401).json({ success: false, error: "Tidak terotentikasi" });
      }
      const client = getSupabaseServerClient(accessToken);
      let { data: { user }, error } = await client.auth.getUser(accessToken);
      if (error || !user) {
        if (refreshToken) {
          const freshClient = getSupabaseServerClient();
          const { data, error: refreshErr } = await freshClient.auth.refreshSession({ refresh_token: String(refreshToken) });
          if (!refreshErr && data.session) {
            const { session, user: refreshedUser } = data;
            setAuthCookies(res, session.access_token, session.refresh_token, session.expires_in);
            const isRefreshedConfirmed = Boolean(refreshedUser.email_confirmed_at || refreshedUser.confirmed_at || !isEmailConfirmationEnforced());
            const userData2 = await getOrMigrateUserProfile(freshClient, refreshedUser);
            const userRole2 = resolveEffectiveRole(userData2, refreshedUser.email || "", isRefreshedConfirmed);
            return res.json({
              success: true,
              user: {
                id: refreshedUser.id,
                email: refreshedUser.email || "",
                name: userData2?.full_name || refreshedUser.email?.split("@")[0] || (userRole2 === "anak_owner" ? "Anak Owner" : "User"),
                role: userRole2,
                raw_role: userRole2,
                property_id: userData2?.property_id !== void 0 ? userData2.property_id : null
              },
              access_token: session.access_token,
              refresh_token: session.refresh_token,
              expires_in: session.expires_in
            });
          }
        }
        clearAuthCookies(res);
        return res.status(401).json({ success: false, error: "Sesi kedaluwarsa atau tidak valid" });
      }
      const isUserConfirmed = Boolean(user.email_confirmed_at || user.confirmed_at || !isEmailConfirmationEnforced());
      const userData = await getOrMigrateUserProfile(client, user);
      if (userData && !userData.active) {
        clearAuthCookies(res);
        return res.status(403).json({ success: false, error: "Akun Anda dinonaktifkan" });
      }
      const userRole = resolveEffectiveRole(userData, user.email || "", isUserConfirmed);
      return res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email || "",
          name: userData?.full_name || user.email?.split("@")[0] || (userRole === "anak_owner" ? "Anak Owner" : "User"),
          role: userRole,
          raw_role: userRole,
          property_id: userData?.property_id !== void 0 ? userData.property_id : null
        },
        access_token: accessToken,
        refresh_token: refreshToken
      });
    } catch (err) {
      console.error("[AUTH API ERROR] GetMe exception:", err);
      return res.status(500).json({ success: false, error: err.message || "Terjadi kesalahan sistem" });
    }
  });
  app.post("/api/auth/refresh", async (req, res) => {
    try {
      let refreshToken = req.body.refresh_token || getCookie(req, "sb-refresh-token");
      if (!refreshToken) {
        return res.status(400).json({ success: false, error: "Refresh token tidak ditemukan" });
      }
      const client = getSupabaseServerClient();
      const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
      if (error || !data.session) {
        clearAuthCookies(res);
        return res.status(401).json({ success: false, error: error?.message || "Gagal menyegarkan sesi" });
      }
      const { session, user } = data;
      setAuthCookies(res, session.access_token, session.refresh_token, session.expires_in);
      const userData = await getOrMigrateUserProfile(client, user);
      const userRole = userData?.role || "user";
      return res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email || "",
          name: userData?.full_name || user.email?.split("@")[0] || "User",
          role: userRole,
          raw_role: userRole
        },
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in
      });
    } catch (err) {
      console.error("[AUTH API ERROR] Refresh exception:", err);
      return res.status(500).json({ success: false, error: err.message || "Terjadi kesalahan sistem" });
    }
  });
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ success: false, error: "Email wajib diisi" });
      }
      const client = getSupabaseServerClient();
      const { error } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${req.protocol}://${req.get("host")}/reset-password-callback`
      });
      if (error) {
        return res.status(400).json({ success: false, error: error.message });
      }
      return res.json({ success: true, message: "Email pemulihan kata sandi telah dikirim" });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message || "Terjadi kesalahan sistem" });
    }
  });
  app.post("/api/auth/change-password", async (req, res) => {
    try {
      const { password } = req.body;
      if (!password) {
        return res.status(400).json({ success: false, error: "Password baru wajib diisi" });
      }
      let accessToken = getCookie(req, "sb-access-token");
      if (!accessToken && req.headers.authorization) {
        const parts = req.headers.authorization.split(" ");
        if (parts[0] === "Bearer") {
          accessToken = parts[1];
        }
      }
      if (!accessToken) {
        return res.status(401).json({ success: false, error: "Tidak terotentikasi" });
      }
      const client = getSupabaseServerClient(accessToken);
      const { error } = await client.auth.updateUser({ password: password.trim() });
      if (error) {
        return res.status(400).json({ success: false, error: error.message });
      }
      return res.json({ success: true, message: "Kata sandi berhasil diperbarui" });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message || "Terjadi kesalahan sistem" });
    }
  });
  app.post("/api/admin/reconciliation/match", requireAdminAuth, requirePermission("journals", "update"), express.json(), async (req, res) => {
    try {
      const { bankStatementId, clearingId, reconciledAmount, feeAmount, notes, createdBy } = req.body;
      if (!bankStatementId || !clearingId || !reconciledAmount) {
        return res.status(400).json({ error: "bankStatementId, clearingId, dan reconciledAmount wajib diisi." });
      }
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: "Supabase URL atau Key belum dikonfigurasi di server." });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      const { data: clearingItem } = await supabaseAdmin.from("midtrans_clearing_transactions").select("property_id").eq("id", clearingId).maybeSingle();
      if (clearingItem) {
        const propAccess = checkPropertyAccess(req.authProfile, clearingItem.property_id);
        if (!propAccess.allowed) {
          return res.status(403).json({ error: propAccess.reason || "Akses ditolak ke properti ini." });
        }
      }
      const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc("reconcile_bank_statement_entry", {
        p_bank_statement_id: bankStatementId,
        p_clearing_id: clearingId,
        p_reconciled_amount: Number(reconciledAmount),
        p_fee_amount: Number(feeAmount || 0),
        p_created_by: createdBy || req.authProfile?.full_name || "Finance Administrator",
        p_notes: notes || null
      });
      if (rpcErr) {
        console.error("[Admin API] reconcile_bank_statement_entry RPC error:", rpcErr);
        return res.status(500).json({ error: rpcErr.message || "Gagal merekonsiliasi transaksi." });
      }
      return res.status(200).json({ success: true, data: rpcRes });
    } catch (err) {
      console.error("[Admin API] reconciliation/match failed:", err);
      return res.status(500).json({ error: err.message || "Internal server error." });
    }
  });
  app.post("/api/admin/reconciliation/auto-match", requireAdminAuth, requirePermission("journals", "update"), express.json(), async (req, res) => {
    try {
      let { propertyId } = req.body;
      const userAssignedProp = req.authProfile?.property_id;
      if (userAssignedProp !== null && userAssignedProp !== void 0) {
        if (propertyId && String(propertyId) !== String(userAssignedProp)) {
          return res.status(403).json({ error: `Akses ditolak. Anda hanya berwenang untuk Properti ID ${userAssignedProp}.` });
        }
        propertyId = userAssignedProp;
      } else if (req.authProfile?.role === "staff") {
        return res.status(403).json({ error: "Akun Staff belum ditugaskan ke properti mana pun." });
      }
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: "Supabase URL atau Key belum dikonfigurasi di server." });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      let stmtQuery = supabaseAdmin.from("bank_statement_items").select("*").eq("matched", false).eq("type", "credit");
      const { data: bankItems, error: stmtErr } = await stmtQuery;
      if (stmtErr) return res.status(500).json({ error: stmtErr.message });
      let clrQuery = supabaseAdmin.from("midtrans_clearing_transactions").select("*").in("clearing_status", ["pending", "cleared", "partially_cleared"]);
      if (propertyId) {
        clrQuery = clrQuery.eq("property_id", propertyId);
      }
      const { data: clearingItems, error: clrErr } = await clrQuery;
      if (clrErr) return res.status(500).json({ error: clrErr.message });
      let matchedCount = 0;
      let totalAmountMatched = 0;
      const matchResults = [];
      for (const item of bankItems || []) {
        let match = (clearingItems || []).find(
          (c) => c.midtrans_order_id && item.desc && item.desc.toUpperCase().includes(c.midtrans_order_id.toUpperCase())
        );
        if (!match) {
          const amountCandidates = (clearingItems || []).filter(
            (c) => Math.abs(Number(c.gross_amount) - Number(item.amount)) < 1 || Math.abs(Number(c.net_amount) - Number(item.amount)) < 1
          );
          if (amountCandidates.length === 1) {
            match = amountCandidates[0];
          }
        }
        if (match) {
          const recAmount = Number(item.amount);
          const feeAmt = Number(match.fee_amount || 0);
          const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc("reconcile_bank_statement_entry", {
            p_bank_statement_id: item.id,
            p_clearing_id: match.id,
            p_reconciled_amount: recAmount,
            p_fee_amount: feeAmt,
            p_created_by: "Auto-Match Reconciliation Engine",
            p_notes: `Otomatis dicocokkan berdasarkan kriteria Order ID / Nominal (${match.midtrans_order_id})`
          });
          if (!rpcErr && rpcRes?.success) {
            matchedCount++;
            totalAmountMatched += recAmount;
            matchResults.push({
              bankStatementId: item.id,
              orderId: match.midtrans_order_id,
              amount: recAmount,
              fee: feeAmt
            });
            const idx = clearingItems.findIndex((c) => c.id === match.id);
            if (idx !== -1) clearingItems.splice(idx, 1);
          }
        }
      }
      return res.status(200).json({
        success: true,
        matchedCount,
        totalAmountMatched,
        matchResults,
        message: `Berhasil mencocokkan ${matchedCount} transaksi secara otomatis.`
      });
    } catch (err) {
      console.error("[Admin API] reconciliation/auto-match failed:", err);
      return res.status(500).json({ error: err.message || "Internal server error." });
    }
  });
  app.post("/api/finance/reconcile-all", requireAdminAuth, requirePermission("finance", "manage"), express.json(), async (req, res) => {
    try {
      let { propertyId } = req.body;
      const userAssignedProp = req.authProfile?.property_id;
      if (userAssignedProp !== null && userAssignedProp !== void 0) {
        if (propertyId && String(propertyId) !== String(userAssignedProp)) {
          return res.status(403).json({ success: false, error: `Akses ditolak. Anda hanya berwenang untuk Properti ID ${userAssignedProp}.` });
        }
        propertyId = userAssignedProp;
      }
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: "Supabase URL atau Key belum dikonfigurasi di server." });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      let stmtQuery = supabaseAdmin.from("bank_statement_items").select("*").eq("matched", false).eq("type", "credit");
      const { data: bankItems, error: stmtErr } = await stmtQuery;
      if (stmtErr) return res.status(500).json({ success: false, error: stmtErr.message });
      let clrQuery = supabaseAdmin.from("midtrans_clearing_transactions").select("*").in("clearing_status", ["pending", "cleared", "partially_cleared"]);
      if (propertyId) {
        clrQuery = clrQuery.eq("property_id", propertyId);
      }
      const { data: clearingItems, error: clrErr } = await clrQuery;
      if (clrErr) return res.status(500).json({ success: false, error: clrErr.message });
      let matchedCount = 0;
      let totalAmountMatched = 0;
      const matchResults = [];
      for (const item of bankItems || []) {
        let match = (clearingItems || []).find(
          (c) => c.midtrans_order_id && item.desc && item.desc.toUpperCase().includes(c.midtrans_order_id.toUpperCase())
        );
        if (!match) {
          const amountCandidates = (clearingItems || []).filter(
            (c) => Math.abs(Number(c.gross_amount) - Number(item.amount)) < 1 || Math.abs(Number(c.net_amount) - Number(item.amount)) < 1
          );
          if (amountCandidates.length === 1) {
            match = amountCandidates[0];
          }
        }
        if (match) {
          const recAmount = Number(item.amount);
          const feeAmt = Number(match.fee_amount || 0);
          const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc("reconcile_bank_statement_entry", {
            p_bank_statement_id: item.id,
            p_clearing_id: match.id,
            p_reconciled_amount: recAmount,
            p_fee_amount: feeAmt,
            p_created_by: req.authProfile?.full_name || req.authProfile?.email || "Finance Administrator",
            p_notes: `Rekonsiliasi sistem akuntansi finance (${match.midtrans_order_id})`
          });
          if (!rpcErr && rpcRes?.success) {
            matchedCount++;
            totalAmountMatched += recAmount;
            matchResults.push({
              bankStatementId: item.id,
              orderId: match.midtrans_order_id,
              amount: recAmount,
              fee: feeAmt
            });
            const idx = clearingItems.findIndex((c) => c.id === match.id);
            if (idx !== -1) clearingItems.splice(idx, 1);
          }
        }
      }
      return res.status(200).json({
        success: true,
        matchedCount,
        totalAmountMatched,
        matchResults,
        message: `Proses rekonsiliasi finance selesai. ${matchedCount} transaksi berhasil dicocokkan.`
      });
    } catch (err) {
      console.error("[Finance API] reconcile-all failed:", err);
      return res.status(500).json({ success: false, error: err.message || "Internal server error." });
    }
  });
  app.post("/api/admin/bank-statement/import", requireAdminAuth, requirePermission("journals", "create"), express.json(), async (req, res) => {
    try {
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Format data mutasi bank tidak valid." });
      }
      if (req.authProfile?.role === "staff") {
        return res.status(403).json({ error: "Akses ditolak. Fitur impor mutasi bank memerlukan wewenang Finance/Admin." });
      }
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: "Supabase URL atau Key belum dikonfigurasi di server." });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      const recordsToInsert = items.map((it) => ({
        date: it.date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
        desc: it.desc || "Mutasi Masuk Rekening Bank Mandiri",
        amount: Number(it.amount || 0),
        type: it.type || (Number(it.amount) >= 0 ? "credit" : "debit"),
        matched: false,
        matched_ref: null
      }));
      const { data, error } = await supabaseAdmin.from("bank_statement_items").insert(recordsToInsert).select();
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      return res.status(200).json({
        success: true,
        insertedCount: data?.length || 0,
        data
      });
    } catch (err) {
      console.error("[Admin API] bank-statement/import failed:", err);
      return res.status(500).json({ error: err.message || "Internal server error." });
    }
  });
  app.post("/api/admin/reconciliation/unmatch", requireAdminAuth, requirePermission("journals", "update"), express.json(), async (req, res) => {
    try {
      const { matchId, reason, createdBy } = req.body;
      if (!matchId) {
        return res.status(400).json({ error: "matchId wajib diisi." });
      }
      if (req.authProfile?.role === "staff") {
        return res.status(403).json({ error: "Akses ditolak. Pembatalan rekonsiliasi memerlukan wewenang Finance/Admin." });
      }
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: "Supabase URL atau Key belum dikonfigurasi di server." });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc("unreconcile_bank_statement_entry", {
        p_match_id: matchId,
        p_created_by: createdBy || req.authProfile?.full_name || "Finance Administrator",
        p_reason: reason || "Pembatalan Manual Rekonsiliasi"
      });
      if (rpcErr) {
        console.error("[Admin API] unreconcile_bank_statement_entry RPC error:", rpcErr);
        return res.status(500).json({ error: rpcErr.message || "Gagal membatalkan rekonsiliasi." });
      }
      return res.status(200).json({ success: true, data: rpcRes });
    } catch (err) {
      console.error("[Admin API] reconciliation/unmatch failed:", err);
      return res.status(500).json({ error: err.message || "Internal server error." });
    }
  });
  app.post("/api/admin/reconciliation/adjust", requireAdminAuth, requirePermission("journals", "update"), express.json(), async (req, res) => {
    try {
      const { clearingId, adjustmentAmount, adjustmentAccountId, category, notes, createdBy } = req.body;
      if (!clearingId || adjustmentAmount === void 0) {
        return res.status(400).json({ error: "clearingId dan adjustmentAmount wajib diisi." });
      }
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: "Supabase URL atau Key belum dikonfigurasi di server." });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      const { data: clearingItem } = await supabaseAdmin.from("midtrans_clearing_transactions").select("property_id").eq("id", clearingId).maybeSingle();
      if (clearingItem) {
        const propAccess = checkPropertyAccess(req.authProfile, clearingItem.property_id);
        if (!propAccess.allowed) {
          return res.status(403).json({ error: propAccess.reason || "Akses ditolak ke properti ini." });
        }
      }
      const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc("adjust_clearing_transaction", {
        p_clearing_id: clearingId,
        p_adjustment_amount: Number(adjustmentAmount),
        p_adjustment_account_id: Number(adjustmentAccountId || 5030),
        p_category: category || "Adjustment Midtrans",
        p_notes: notes || null,
        p_created_by: createdBy || req.authProfile?.full_name || "Finance Administrator"
      });
      if (rpcErr) {
        console.error("[Admin API] adjust_clearing_transaction RPC error:", rpcErr);
        return res.status(500).json({ error: rpcErr.message || "Gagal melakukan penyesuaian kliring." });
      }
      return res.status(200).json({ success: true, data: rpcRes });
    } catch (err) {
      console.error("[Admin API] reconciliation/adjust failed:", err);
      return res.status(500).json({ error: err.message || "Internal server error." });
    }
  });
  app.get("/api/admin/accounting/diagnostic-coa", requireAdminAuth, requirePermission("system_settings", "read"), async (req, res) => {
    try {
      const autoRepair = req.query.repair === "true";
      const forceCheck = req.query.force === "true";
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: "Supabase URL atau Key belum dikonfigurasi di server." });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      const diagnosticResult = await verifyAndEnsureCriticalCOA(supabaseAdmin, autoRepair, forceCheck);
      return res.status(200).json({
        success: true,
        diagnostic: diagnosticResult
      });
    } catch (err) {
      console.error("[Admin API] diagnostic-coa failed:", err);
      return res.status(500).json({ error: err.message || "Internal server error." });
    }
  });
  app.post("/api/admin/accounting/diagnostic-coa/repair", requireAdminAuth, requirePermission("system_settings", "repair"), express.json(), async (req, res) => {
    try {
      if (req.authProfile?.role === "staff") {
        return res.status(403).json({ error: "Akses ditolak. Fitur perbaikan Chart of Accounts memerlukan wewenang Super Admin." });
      }
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: "Supabase URL atau Key belum dikonfigurasi di server." });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      const repairResult = await verifyAndEnsureCriticalCOA(supabaseAdmin, true, true);
      return res.status(200).json({
        success: true,
        repaired: repairResult
      });
    } catch (err) {
      console.error("[Admin API] diagnostic-coa/repair failed:", err);
      return res.status(500).json({ error: err.message || "Internal server error." });
    }
  });
  app.get("/api/admin/accounting/integrity-audit", requireAdminAuth, requirePermission("system_settings", "read"), async (req, res) => {
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: "Supabase URL atau Key belum dikonfigurasi di server." });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      await verifyAndEnsureCriticalCOA(supabaseAdmin, true);
      const auditReport = await runAccountingIntegrityAudit(supabaseAdmin);
      return res.status(200).json({
        success: true,
        report: auditReport
      });
    } catch (err) {
      console.error("[Admin API] accounting/integrity-audit failed:", err);
      return res.status(500).json({ error: err.message || "Internal server error." });
    }
  });
  app.post("/api/admin/accounting/integrity-audit/repair", requireAdminAuth, requirePermission("system_settings", "repair"), express.json(), async (req, res) => {
    try {
      if (req.authProfile?.role === "staff") {
        return res.status(403).json({ error: "Akses ditolak. Fitur perbaikan integritas akuntansi memerlukan wewenang Super Admin." });
      }
      const { repairTypes } = req.body;
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const serviceKey = getServiceRoleKeyOrThrow();
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: "Supabase URL atau Key belum dikonfigurasi di server." });
      }
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      await verifyAndEnsureCriticalCOA(supabaseAdmin, true, true);
      const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc("repair_accounting_integrity", {
        p_repair_types: Array.isArray(repairTypes) && repairTypes.length > 0 ? repairTypes : ["recalc_balances", "fix_properties"]
      });
      if (!rpcErr && rpcRes) {
        return res.status(200).json({
          success: true,
          result: rpcRes
        });
      }
      if (rpcErr) {
        console.warn("[Admin API] repair_accounting_integrity RPC fallback to Node calculation:", rpcErr.message);
      }
      const [accRes, ftRes, jeRes] = await Promise.all([
        supabaseAdmin.from("accounts").select("*"),
        supabaseAdmin.from("financial_transactions").select("*"),
        supabaseAdmin.from("journal_entries").select("*")
      ]);
      const accounts = accRes.data || [];
      const transactions = ftRes.data || [];
      const journals = jeRes.data || [];
      let recalculatedCount = 0;
      for (const a of accounts) {
        const accJournals = journals.filter((j) => j.account_id === a.id);
        const totalDebit = accJournals.reduce((sum, j) => sum + Number(j.debit || 0), 0);
        const totalCredit = accJournals.reduce((sum, j) => sum + Number(j.credit || 0), 0);
        const isNormalDebit = a.type === "asset" || a.type === "expense";
        const computedBalance = isNormalDebit ? totalDebit - totalCredit : totalCredit - totalDebit;
        if (Math.abs(Number(a.balance || 0) - computedBalance) > 0.01) {
          await supabaseAdmin.from("accounts").update({ balance: computedBalance }).eq("id", a.id);
          recalculatedCount++;
        }
      }
      let repairedProperties = 0;
      for (const t of transactions) {
        if (!t.property_id && t.reference_type === "payment" && t.reference_id) {
          const { data: pay } = await supabaseAdmin.from("payments").select("property_id").eq("id", t.reference_id).maybeSingle();
          if (pay?.property_id) {
            await supabaseAdmin.from("financial_transactions").update({ property_id: pay.property_id }).eq("id", t.id);
            repairedProperties++;
          }
        }
      }
      const freshReport = await runAccountingIntegrityAudit(supabaseAdmin);
      return res.status(200).json({
        success: true,
        result: {
          success: true,
          recalculatedAccounts: recalculatedCount,
          repairedProperties,
          auditReport: freshReport
        }
      });
    } catch (err) {
      console.error("[Admin API] integrity-audit/repair failed:", err);
      return res.status(500).json({ error: err.message || "Internal server error." });
    }
  });
  app.get("/api/health", async (req, res) => {
    let supabaseStatus = "disconnected";
    let serviceRoleConfigured = false;
    let coaHealth = "unknown";
    try {
      const serviceKey = getServiceRoleKeyOrThrow();
      serviceRoleConfigured = Boolean(serviceKey && serviceKey !== "YOUR_SERVICE_ROLE_KEY_HERE");
      const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
      if (supabaseUrl && serviceKey) {
        const client = createClient(supabaseUrl, serviceKey);
        const { count, error } = await client.from("accounts").select("*", { count: "exact", head: true });
        if (!error) {
          supabaseStatus = "connected";
          coaHealth = (count || 0) >= 15 ? "healthy" : "degraded";
        } else {
          supabaseStatus = "error: " + error.message;
        }
      }
    } catch (e) {
      supabaseStatus = "error: " + (e.message || "Key missing");
    }
    res.json({
      status: "ok",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      supabase: {
        status: supabaseStatus,
        service_role_configured: serviceRoleConfigured,
        coa_health: coaHealth
      },
      midtrans_configured: Boolean(process.env.MIDTRANS_SERVER_KEY && process.env.MIDTRANS_SERVER_KEY !== "YOUR_MIDTRANS_SERVER_KEY_HERE"),
      mailersend_configured: Boolean(process.env.MAILERSEND_API_KEY && process.env.MAILERSEND_API_KEY !== "YOUR_MAILERSEND_API_KEY_HERE")
    });
  });
  app.get("/healthz", (req, res) => {
    res.status(200).send("OK");
  });
  if (process.env.NODE_ENV !== "production") {
    try {
      const viteModule = await import("vite");
      createViteServerFn = viteModule.createServer;
      const vite = await createViteServerFn({
        server: { middlewareMode: true },
        appType: "spa"
      });
      app.use(vite.middlewares);
    } catch (viteErr) {
      console.warn("[SERVER DEV NOTICE] Could not initialize Vite middleware mode:", viteErr?.message || viteErr);
    }
  } else {
    const distPath = path.join(process.cwd(), "dist");
    const rootPath = process.cwd();
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
    }
    app.get("*", (req, res) => {
      const distIndex = path.join(distPath, "index.html");
      const rootIndex = path.join(rootPath, "index.html");
      if (fs.existsSync(distIndex)) {
        res.sendFile(distIndex);
      } else if (fs.existsSync(rootIndex)) {
        res.sendFile(rootIndex);
      } else {
        res.status(200).send('<!DOCTYPE html><html><head><title>Samara Stay</title></head><body><div id="root">App Loading...</div></body></html>');
      }
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SERVER RUNNING] Express backend listening on http://0.0.0.0:${PORT}`);
    const EXPIRED_LEASE_SYNC_INTERVAL_MS = Number(process.env.EXPIRED_LEASE_SYNC_INTERVAL_MS) || 15 * 60 * 1e3;
    const runBackgroundExpiredLeaseSync = async () => {
      try {
        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
        const serviceKey = getServiceRoleKeyOrThrow();
        if (supabaseUrl && serviceKey) {
          const supabaseAdmin = createClient(supabaseUrl, serviceKey);
          await syncExpiredLeasesCore(supabaseAdmin);
        }
      } catch (err) {
      }
    };
    runBackgroundExpiredLeaseSync();
    setInterval(runBackgroundExpiredLeaseSync, EXPIRED_LEASE_SYNC_INTERVAL_MS);
  });
}
startServer();
export {
  CRITICAL_COA_ACCOUNTS
};
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Default seed and fallback dataset for Samara Stay ERP & Public Portal.
 * Used when offline, during network partition, or when Supabase service is restricted (e.g. egress quota limit).
 */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
