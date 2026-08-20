# SAMARA STAY ERP v16 — PRODUCTION READINESS CHECKLIST
**Sistem:** SAMARA STAY Enterprise Property & Accounting ERP  
**Kesiapan:** Production Ready Deployment

---

## 1. Verifikasi Lingkungan & Kredensial

- [x] **Vite Environment Separation:** Hanya variabel publik berawalan `VITE_` yang terekspos ke browser bundle (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_MIDTRANS_CLIENT_KEY`).
- [x] **Service Role Confidentiality:** `SUPABASE_SERVICE_ROLE_KEY` dan `MIDTRANS_SERVER_KEY` terlindungi di `server.ts` dan tidak dapat diakses dari browser.
- [x] **Port Binding:** Dev server dan server produksi terikat pada Port `3000` (Host `0.0.0.0`).
- [x] **Database Schema & Migrations:** 25 file migrasi SQL terindeks dan teruji di Supabase.

---

## 2. Verifikasi Integritas Transaksional

- [x] **Double-Entry Balance Enforcement:** Fungsi `post_financial_transaction` atomik dengan verifikasi Debit = Credit.
- [x] **Midtrans Webhook Idempotency:** Tabel `webhook_events` mencegah duplikasi invoice/pembayaran saat webhook terkirim berulang.
- [x] **Clearing Sync:** Piutang kliring Midtrans akun `1200` sinkron dengan total outstanding kliring.
- [x] **Reconciliation Audit Trail:** Tabel `bank_reconciliation_matches` mencatat seluruh riwayat pencocokan dan pembatalan (*unmatch reversal*).

---

## 3. Verifikasi Keamanan & Hak Akses (RLS)

- [x] **RLS Enabled on All 23 Tables:** Tidak ada tabel yang terbuka tanpa kebijakan akses.
- [x] **Multi-Property Data Segregation:** Akun staf/finance cabang hanya dapat mengakses properti sesuai `property_id` miliknya.
- [x] **Stored Procedure Execution:** Hak eksekusi prosedur pembayaran dan rekonsiliasi dibatasi khusus `service_role`.

---

## 4. Verifikasi UI & Pengalaman Pengguna (UX)

- [x] **Zero Dummy Data on Production Flows:** Seluruh katalog, kamar, penghuni, dan laporan terhubung langsung ke Supabase.
- [x] **Realtime WebSocket Active:** Notifikasi perubahan kamar, booking, dan pembayaran terkirim instan tanpa reload halaman penuh.
- [x] **Responsive Mobile & Desktop Design:** Seluruh layout navigasi, tabel admin, dan form checkout dapat diakses mulus di smartphone maupun desktop.
