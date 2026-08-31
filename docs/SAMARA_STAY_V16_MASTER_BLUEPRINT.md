# SAMARA STAY ENTERPRISE ERP v16 — MASTER ARCHITECTURAL BLUEPRINT
**Versi:** SAMARA STAY Enterprise Property & Accounting ERP v16  
**Tanggal Rilis:** 22 Agustus 2026  
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
│   ├── App.tsx                                # Root React component, tri-view router (user/admin/owner)
│   ├── main.tsx                               # React entry point
│   ├── index.css                              # Tailwind CSS entry stylesheet
│   ├── types.ts                               # Definisi tipe data & antarmuka TypeScript global
│   ├── components/
│   │   ├── accounting/                        # Modal audit integritas & diagnostik COA
│   │   ├── common/                            # UI primitives (Button, Modal, HDImage, Badge, dll)
│   │   ├── coupon/                            # Komponen kupon promosi
│   │   ├── layout/                            # Navbar, Footer, Sidebar, PageTransition
│   │   ├── owner/                             # Modul Dashboard Eksekutif & Investor Pemilik
│   │   │   ├── BranchComparisonSection.tsx    # Komparasi performa dan okupansi antar cabang kos
│   │   │   ├── ExecutiveKpiCards.tsx          # Kartu KPI eksekutif (Inflow, Kontrak, Okupansi, NOI, Dividen)
│   │   │   ├── ExpenseAuditSection.tsx        # Audit pengeluaran (Maintenance, Petty Cash, PO)
│   │   │   ├── LeaseExpiringMonitor.tsx       # Monitoring sewa jatuh tempo (<45 hari)
│   │   │   ├── MidtransCashflowCard.tsx       # Arus kas live gateway & saldo kliring COA 1200
│   │   │   ├── OwnerHeader.tsx                # Header eksekutif, filter properti, periode & cetak
│   │   │   └── ProfitLossDividendCard.tsx     # Laba rugi & simulator bagi hasil dividen
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
│   │   └── supabase.ts                        # Client Supabase, CRUD functions & RealtimeManager singleton
│   ├── pages/
│   │   ├── Admin.tsx                          # Portal backoffice Super Admin, operasional & Finance ERP
│   │   ├── Home.tsx                           # Portal publik pencarian, booking, & survey kamar
│   │   └── Owner.tsx                          # Portal Eksekutif Pemilik & Investor (realtime Supabase & Midtrans)
│   ├── routes/
│   │   ├── index.tsx                          # Definisi rute navigasi tri-view (user, admin, owner)
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
| Owner Portal (Executive & Investor) | No Access | No Access | View | Full Control | Full Control |

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

---

## 6. Portal Eksekutif Pemilik (Owner Portal) & Standardisasi Sinkronisasi Finansial

1. **Struktur Navigasi Tri-View:**
   - Navigasi atas (Navbar) menyediakan 3 mode terintegrasi: **User Website** (`user`), **Admin Panel** (`admin`), dan **Owner Portal** (`owner`).
   - Mode portal disesuaikan dengan role RBAC: Super Admin (`super`, `super_admin`) dan Owner (`owner`) memiliki hak akses terverifikasi ke portal eksekutif dan backoffice.
2. **Standardisasi Metrik Keuangan Real-Time (Super Admin & Owner Portal):**
   - **Total Pendapatan (Inflow):** Dihitung secara seragam melalui modul utilitas terpusat `calculateTotalInflow(transactions, payments)` yang menggabungkan kas masuk aktual di tabel Supabase `financial_transactions` (`type = 'income' | 'dp_booking'`) dan invoice pelunasan `payments` (`status = 'paid'`).
   - **Estimasi Nilai Kontrak Sewa (Pipeline / Gross Contract):** Diperoleh melalui `calculateGrossPipeline(bookings)` dari akumulasi total nilai pemesanan disetujui (`bookings.filter(status === 'approved')`) sepanjang durasi sewa.
   - **Biaya Operasional (Outflow):** Mengambil data pengeluaran riil di Supabase melalui `calculateTotalExpenses(transactions)` (`type === 'expense'`) serta rincian log pemeliharaan fasilitas (`maintenance.cost`).
   - **Laba Bersih Operasional (NOI):** $\text{NOI} = \text{Total Inflow} - \text{Total Expenses}$ (`calculateNOI`).
   - **Dana Siap Bagi Hasil / Dividen:** Dihitung dari alokasi 85% pool NOI bebas utang operasional.
   - **Piutang Kliring Midtrans (COA 1200):** Melacak saldo dana belum dicairkan (*unsettled escrow*) langsung dari `midtrans_clearing_transactions`.
3. **Audit dan Transparansi Multi-Cabang:**
   - Menyediakan komparasi performa pendapatan, pengeluaran, laba bersih, dan okupansi antar cabang (Salemba UI, Pasar Minggu, Jagakarsa UI) dengan fitur filter properti, periode MTD/QTD/YTD, dan fungsi cetak laporan PDF/Print resmi.

---

## 7. Integritas & Kesetaraan Data Super Admin dan Owner (Single Source of Truth)

Untuk mencegah disparitas angka atau perbedaan informasi antara Super Admin Dashboard dan Owner Portal:

1. **Tabel Database Tunggal Supabase (PostgreSQL 15):**
   - Kedua portal menarik data langsung dari tabel database yang sama persis: `properties`, `rooms`, `tenants`, `bookings`, `financial_transactions`, `payments`, `midtrans_clearing_transactions`, `maintenance`, `petty_cash_requests`, `purchase_orders`, `contract_extensions`.
2. **Sinkronisasi Reaktif Granular (`useRealtimeTable`):**
   - Menggunakan hook `useRealtimeTable` dengan batas kueri default yang dinaikkan hingga **1000 entri** untuk seluruh kueri database (mencegah data terpotong/hilang karena paging yang terlalu kecil).
   - Setiap mutasi data (`INSERT`, `UPDATE`, `DELETE`) pada database Supabase memicu pembaruan state reaktif secara instan di kedua portal via WebSocket Supabase Realtime.
3. **Penyelarasan Rumus & Parameter Finansial:**
   - Seluruh metrik KPI (Okupansi, Kas Masuk, Kontrak Sewa, Beban Operasional, NOI, dan Dividen) dihitung menggunakan modul matematika yang sama (`src/lib/financialMetrics.ts`). Tidak ada formula sintetis lokal atau hardcoded data yang berjalan di salah satu dashboard.

---

## 8. Arsitektur Autentikasi Ganda Persisten (Persistent Multi-Layer Auth Store)

1. **Dual-Layer Authentication Mechanism:**
   - **Layer 1 (Supabase Auth API):** Sistem memvalidasi kredensial pengguna ke Supabase GoTrue Auth untuk mendapatkan sesi terenkripsi.
   - **Layer 2 (Persistent Scrypt-Hashed Auth Store):** Jika Supabase Auth belum tersinkronisasi atau pengguna mengganti kata sandi kustom secara lokal (misal `owner123`), sistem secara otomatis memvalidasi melalui `server/authStore.ts` yang tersimpan terenkripsi dengan algoritma hashing `scrypt` pada `.server_auth_store.json`.
   - **Layer 3 (Default System Fallback):** Fallback aman untuk kredensial default sistem (`samarastay2026`).
2. **Propagasi Sesi Klien & Server:**
   - Token JWT yang diterbitkan oleh server endpoint `/api/auth/login` disinkronkan ke sesi klien Supabase menggunakan `supabase.auth.setSession({ access_token, refresh_token })` pada saat inisialisasi aplikasi maupun login berhasil.
   - Endpoint `/api/auth/me` menyediakan verifikasi sesi real-time yang menjamin identitas pengguna, hak akses RBAC, dan integritas data profil.
3. **Akun Resmi Terverifikasi:**
   - **Owner:** `owner@samarastay.co.id` (Kata Sandi: `owner123` / `samarastay2026`) — Role: `owner`.
   - **Super Admin:** `yogiketilang33@gmail.com` dan `admin@samarastay.co.id` (Kata Sandi: `samarastay2026`) — Role: `super`.
   - **Staff & Finance:** Mendukung manajemen kata sandi mandiri dan *quick reset password* aman melalui server API.

---

## 9. Modul Audit Keamanan Internal & Proteksi Kredensial Akun Owner (Cryptographic Ledger SHA-256)

Untuk mencegah modifikasi atau penimpaan (*credential overrides*) kredensial akun Owner dan konfigurasi sistem tanpa otorisasi:

1. **Buku Besar Audit Kriptografis (Tamper-Evident SHA-256 Ledger):**
   - Diimplementasikan pada `server/securityAuditStore.ts` dan `.security_audit_store.json`.
   - Setiap entri audit (modifikasi akun owner, perubahan password, penimpaan aturan booking/survey, tanda tangan digital, atau promosi role) disegel dengan hash SHA-256 berantai (*blockchain hash chaining*) yang merujuk pada blok sebelumnya (`previousHash`).
   - Setiap manipulasi data atau pemalsuan log secara otomatis terdeteksi melalui fungsi verifikasi integritas rantai kriptografis (`verifyChainIntegrity`).

2. **Proteksi Khusus Akun Owner (Strict Owner Credential Protection):**
   - Endpoint `/api/auth/quick-reset-password` menerapkan filter keamanan khusus: upaya penimpaan kata sandi untuk akun `owner@samarastay.co.id` atau akun dengan role `owner` **hanya diizinkan** bagi Super Admin terverifikasi (`admin@samarastay.co.id`, `yogiketilang33@gmail.com`) atau pemilik akun itu sendiri.
   - Segala percobaan penimpaan kredensial yang tidak sah langsung diblokir (*HTTP 403 Forbidden*) dan dicatat sebagai `CRITICAL SECURITY ALERT` dengan status `BLOCKED` di dalam audit ledger.

3. **Pelacakan Konfigurasi Manual Sistem (System Config Audit Trail):**
   - Setiap perubahan tata tertib sewa/survey, FAQ, Why Choose Us, tanda tangan digital Owner, dan data master pengguna dicatat secara otomatis via hook `securityAudit.log(...)` yang terintegrasi dengan endpoint `/api/admin/security-audit-logs/log` dan Supabase `activity_logs`.
   - Mencakup informasi detail: ID Pelaksana (*Actor*), IP Address, User-Agent, Target Modul, Kolom yang diubah (*fieldsChanged*), serta *Before vs After state snapshot*.

4. **Antarmuka Pengawasan Eksekutif (`SecurityAuditLogModule`):**
   - Tersedia di **Super Admin Panel** (Tab `Audit Keamanan`) dan **Owner Portal** (Tab `Audit Keamanan & Kredensial`).
   - Dilengkapi kartu KPI (Total Log, Modifikasi Akun Owner, Perubahan Konfigurasi, Upaya Ditolak, Status Rantai Hash), filter pencarian multi-kategori, tombol verifikasi integritas SHA-256 seketika (*live cryptographic integrity check*), pencatatan audit manual fisik, serta fitur ekspor laporan audit format CSV dan JSON.

