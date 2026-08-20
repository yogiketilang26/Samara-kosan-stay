# SAMARA STAY ENTERPRISE ERP v16 — MASTER ARCHITECTURAL BLUEPRINT
**Versi:** SAMARA STAY Enterprise Property & Accounting ERP v16  
**Tanggal Rilis:** 17 Agustus 2026  
**Klasifikasi:** Master Architecture & Engineering Blueprint

---

## 1. Ikhtisar Arsitektur Sistem

SAMARA STAY ERP v16 dibangun di atas arsitektur full-stack modern berkinerja tinggi yang menggabungkan:
- **Frontend SPA:** React 19 + TypeScript + Vite + Tailwind CSS v4 + Motion.
- **Backend API:** Node.js + Express + TypeScript, bertindak sebagai proxy aman, gateway webhook receiver, dan orkestrator transaksi.
- **Database & Storage:** Supabase PostgreSQL 15 dengan Row-Level Security (RLS) terisolasi multi-cabang, Stored Procedures atomik berstandar ACID, dan bucket penyimpanan berkas privat/publik.
- **Realtime Broker:** Supabase Realtime WebSocket dengan arsitektur listener tunggal global (`db-global-realtime`) dan rekoneksi eksponensial otomatis.
- **Payment & Clearing:** Midtrans SNAP Gateway dengan SHA-512 signature verification, tabel kliring perantara (`midtrans_clearing_transactions`), dan rekonsiliasi mutasi rekening koran bank otomatis.

---

## 2. Struktur Direktori Repositori

```
├── .env.example                               # Dokumentasi variabel lingkungan publik & privat
├── metadata.json                              # Metadata aplikasi Google AI Studio
├── package.json                               # Definisi dependensi & skrip build
├── server.ts                                  # Express API backend, Webhook handler, MailerSend API
├── tsconfig.json                              # Konfigurasi kompilasi TypeScript
├── vite.config.ts                             # Konfigurasi build Vite & Tailwind v4 plugin
├── docs/                                      # Dokumentasi arsitektur v16 lengkap
│   ├── SAMARA_STAY_V16_AUDIT.md
│   ├── SAMARA_STAY_V16_CLEANUP_REPORT.md
│   ├── SAMARA_STAY_V16_ACCOUNTING_INTEGRITY.md
│   ├── SAMARA_STAY_V16_REALTIME_AUDIT.md
│   ├── SAMARA_STAY_V16_MIDTRANS_BANK_RECONCILIATION.md
│   ├── SAMARA_STAY_V16_FINANCIAL_REPORTING.md
│   ├── SAMARA_STAY_V16_PRODUCTION_CHECKLIST.md
│   └── SAMARA_STAY_V16_MASTER_BLUEPRINT.md
├── src/
│   ├── App.tsx                                # Root React component & routing container
│   ├── main.tsx                               # React entry point
│   ├── index.css                              # Tailwind CSS entry stylesheet
│   ├── types.ts                               # Definisi tipe data & antarmuka TypeScript global
│   ├── components/
│   │   ├── accounting/                        # Modal audit integritas & diagnostik COA
│   │   ├── common/                            # UI primitives (Button, Modal, HDImage, Badge, dll)
│   │   ├── coupon/                            # Komponen kupon promosi
│   │   ├── layout/                            # Navbar, Footer, Sidebar, PageTransition
│   │   ├── premium/                           # Komponen kamar & filter pencarian premium
│   │   ├── property/                          # Formulir, detail, dan daftar properti
│   │   ├── room/                              # Formulir, galeri, kartu, dan badge kamar
│   │   └── transaction/                       # Form booking, invoice card, signature pad
│   ├── context/
│   │   ├── AuthContext.tsx                    # Autentikasi & manajemen sesi RBAC
│   │   ├── CartContext.tsx                    # Keranjang reservasi sewa kamar
│   │   ├── NotificationContext.tsx            # Sistem notifikasi toast global
│   │   └── ThemeContext.tsx                   # Pengaturan tema visual
│   ├── hooks/
│   │   ├── useAuth.ts                         # Hook autentikasi
│   │   ├── useFacilitiesRealtime.ts           # Hook sinkronisasi fasilitas kamar/properti
│   │   └── useRealtimeTable.ts                # Hook sinkronisasi realtime tabel database terpusat
│   ├── lib/
│   │   ├── constants.ts                       # Nilai konstan aplikasi
│   │   ├── midtrans.ts                        # Client loader untuk Midtrans Snap.js
│   │   ├── observability.ts                   # In-memory logging & error monitoring
│   │   ├── schema.sql                         # Skema database baseline
│   │   └── supabase.ts                        # Client Supabase & SupabaseRealtimeManager singleton
│   ├── pages/
│   │   ├── Admin.tsx                          # Portal backoffice admin, finance, dan owner
│   │   └── Home.tsx                           # Portal publik pencarian, booking, & survey kamar
│   ├── routes/
│   │   ├── index.tsx                          # Definisi rute navigasi
│   │   └── ProtectedRoute.tsx                 # Guard proteksi otorisasi berbasis peran (RBAC)
│   └── utils/
│       ├── formatCurrency.ts                  # Formatter nominal Rupiah (IDR)
│       ├── formatDate.ts                      # Formatter tanggal standar Indonesia
│       ├── imageCompressor.ts                 # Kompresi gambar sisi klien sebelum upload
│       ├── imagePresets.ts                    # Generator thumbnail SVG vektor offline
│       ├── pdfGenerator.ts                    # Generator invoice & laporan PDF resmi
│       ├── storageUploader.ts                 # Handler upload berkas ke Supabase Storage
│       └── validators.ts                      # Validasi nomor telepon, email, dan NIK
└── supabase/
    └── migrations/                            # 25 file migrasi SQL terindeks
```

---

## 3. Matriks Peran & Hak Akses Pengguna (RBAC Matrix)

| Modul / Fitur | Penyewa (Public/Tenant) | Staf Operasional | Keuangan (Finance) | Pemilik (Owner) | Super Admin |
|---|---|---|---|---|---|
| Katalog Properti & Kamar | View | View / Edit Room | View | View | Full Control |
| Booking & Reservasi Survey | Create / Pay | View / Confirm | View | View | Full Control |
| Buku Besar & Jurnal Finansial | No Access | No Access | View / Post | View Only | Full Control |
| Kliring & Rekonsiliasi Bank | No Access | No Access | Match / Reconcile | View Only | Full Control |
| Audit Integritas & Reparasi COA | No Access | No Access | View Audit | Run Repair | Full Control |
| Manajemen Akun Pengguna | Edit Profil Sendiri | No Access | No Access | View Only | Full Control |
| Pengaturan Sistem Global | No Access | No Access | No Access | Edit | Full Control |

---

## 4. Keandalan Finansial & Pencegahan Kegagalan (Reliability Guardrails)

1. **Aturan Saldo Double-Entry:** Setiap pencatatan finansial dieksekusi via `post_financial_transaction` yang mengembalikan pesan error eksplisit jika $\sum Debit \neq \sum Credit$.
2. **Isolasi Mutasi Kliring:** Pembayaran melalui Midtrans tidak langsung masuk ke rekening kas operasional, melainkan ditampung di akun perantara `1200 (Piutang Kliring Midtrans)` sampai mutasi bank diverifikasi.
3. **Pencatatan Biaya MDR Nyata:** Biaya layanan gateway hanya didebetkan ke akun `5030` berdasarkan pemotongan riil pada saat rekonsiliasi mutasi rekening koran.
4. **Proteksi Multi-Cabang:** Seluruh data operasional dan keuangan mengunci parameter `property_id` untuk mencegah percampuran laba rugi antar-cabang kos.

---

## 5. Alur Pemesanan, Kunci Ketersediaan Kamar & Pasca-Pembayaran (Booking Lifecycle & Availability Guardrails)

1. **Definisi Ketersediaan Kamar Ketat (`isAvailable`):**
   - Kamar hanya dianggap dapat dipesan jika berstatus `'available'` (atau bernilai null/kosong).
   - Status `'occupied'`, `'reserved'`, dan `'maintenance'` secara otomatis mengunci unit pada seluruh level: `RoomCard`, `PremiumRoomCard`, modal katalog properti (`isCatalogOpen`), dan modal detail kamar (`selectedRoomForDetail`). Tombol pemesanan dinonaktifkan (`disabled`) dan digantikan status informatif yang jelas.
2. **Proteksi Ganda Pencegahan Double-Booking (Client-Side & Server-Side Guard):**
   - Pada saat seleksi unit (`handleSelectRoom`), status unit langsung divalidasi.
   - Sesaat sebelum inisialisasi pembayaran (`handleProceedToPayment`), sistem memverifikasi status kamar terkini langsung ke database Supabase secara real-time. Jika kamar telah diambil calon penyewa lain, proses langsung dibatalkan dengan notifikasi.
   - Di sisi backend/webhook Midtrans, eksekusi RPC atomik `settle_booking_payment` memastikan transaksi hanya berlaku sekali (idempoten) dan langsung mengunci status kamar menjadi `occupied`.
3. **Siklus Pasca-Pembayaran & Auto-Redirect Beranda (`handleCloseReceiptAndReset`):**
   - Setelah pembayaran sukses diselesaikan melalui Midtrans SNAP Simulator / Webhook, status kamar langsung diperbarui ke database (`occupied` untuk sewa bulanan/harian, `reserved` untuk DP survey).
   - Saat bukti transaksi / invoice ditutup (`onClose`), sistem secara otomatis:
     - Mereset seluruh formulir pemesanan, survey, dan data tanda tangan digital.
     - Menutup seluruh modal transaksi dan katalog kamar yang terbuka.
     - Mengalihkan tampilan navigasi pengguna ke halaman beranda (`home`) dan melakukan *smooth scroll* ke posisi paling atas.
     - Memuat ulang snapshot data kamar, properti, survey, dan penyewa terbaru dari Supabase untuk menjamin konsistensi visual instan.

