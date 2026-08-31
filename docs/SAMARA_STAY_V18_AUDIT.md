# SAMARA STAY ERP — AUDIT & IMPLEMENTASI v18 (SECURITY & INTEGRITY REPORT)

**Tanggal Audit & Rilis:** 2026-08-31  
**Versi Sistem:** Samara Stay ERP v18  
**Status Verifikasi:** ✅ LULUS AUDIT (TypeScript `tsc --noEmit` & Production Build 100% Green)

---

## 1. Ringkasan Eksekutif (Executive Summary)

Pembaruan Samara Stay ERP v18 berfokus pada dua perbaikan inti:
1. **Penyelesaian Tuntas Regresi Double-Posting Approval Booking Manual (v17 Bug Fix)**: Menghapus seluruh efek samping duplikat di sisi klien (`src/lib/supabase.ts`), sehingga seluruh siklus approval pemesanan manual, aktivasi tenant, jurnal akuntansi double-entry, dan pengiriman invoice email dieksekusi secara tunggal dan atomik di server backend (`server.ts` + PostgreSQL RPC `settle_manual_booking_approval`).
2. **Implementasi Lengkap Pemisahan Akses Tingkat Properti (Property-Level RBAC Access Segregation)**:
   - Menambahkan kolom `property_id` pada tabel `users` via migrasi `035_add_property_id_to_users.sql`.
   - Membangun endpoint baru `PATCH /api/admin/users/:id/assign-property` (khusus Super Admin & Owner) dengan validasi relasi dan audit trail.
   - Mengintegrasikan penugasan cabang properti ke dalam antarmuka UI Admin (`src/pages/Admin.tsx`), state autentikasi pengguna, dan middleware `checkPropertyAccess`.

---

## 2. Analisis Forensik & Penyelesaian Bug Double-Posting (v17 Regression)

### A. Akar Masalah (Root Cause)
Pada versi v17, endpoint server `POST /api/admin/booking/approve` dan stored procedure SQL `settle_manual_booking_approval` sudah diimplementasikan dengan benar dan atomik. Namun, pada fungsi `saveBooking` di `src/lib/supabase.ts`, blok kode lama `if (isFirstApproval && updated.room_id)` masih aktif mengeksekusi operasi sisi klien saat booking berstatus `approved`:
- Pembuatan/upsert data `tenants` duplikat
- Pembuatan invoice `payments` duplikat
- Pencatatan transaksi `financial_transactions` duplikat
- Pengiriman email konfirmasi sewa duplikat melalui `sendTemplatedEmail`

Akibatnya, setiap kali admin menyetujui booking manual, terjadi pemanggilan ganda (1x dari server-side RPC, 1x dari client-side `saveBooking`).

### B. Tindakan Perbaikan (Resolution)
1. **Refactoring `saveBooking` (`src/lib/supabase.ts`)**: Seluruh blok efek samping approval di sisi klien telah dihapus total. Fungsi `saveBooking` kini murni melakukan persistensi perubahan metadata booking, sedangkan alur settlement finansial sepenuhnya didelegasikan ke endpoint atomik `/api/admin/booking/approve`.
2. **Skrip Forensik Audit & Pembersihan Data**: Telah disediakan file kueri diagnostik SQL di `docs/V18_DUPLICATE_CLEANUP_QUERY.sql` untuk mendeteksi transaksi, pembayaran, atau jurnal duplikat pada database produksi tanpa menghapus data secara destruktif tanpa izin.

---

## 3. Pemisahan Hak Akses Tingkat Properti (Multi-Property RBAC Segregation)

### A. Skema Basis Data (Database Migration)
File migrasi `supabase/migrations/035_add_property_id_to_users.sql`:
- Menambahkan kolom `property_id BIGINT REFERENCES properties(id) ON DELETE SET NULL` pada tabel `users`.
- Menambahkan index `idx_users_property_id` untuk optimasi kueri filter properti.

### B. Endpoint API Admin (`server.ts`)
Endpoint `PATCH /api/admin/users/:id/assign-property`:
- **Autentikasi & Otorisasi Ketat**: Memeriksa `requireAdminAuth` dan memastikan caller memiliki role `super`, `super_admin`, atau `owner`. Caller role lain (`staff`, `finance`, `user`) akan menerima respon `403 Forbidden`.
- **Validasi Integritas**: Memvalidasi keberadaan target user dan keberadaan `property_id` target pada tabel `properties`.
- **Pengaturan Global**: Mendukung passing `null` atau `""` untuk mengembalikan penugasan ke akses Global (Semua Properti).
- **Audit Logging**: Secara otomatis mencatat riwayat penugasan ke tabel `activity_logs` dengan detail admin pelaku dan cabang target.

### C. Propagasi Sesi Autentikasi
- Endpoint `POST /api/auth/login` dan `GET /api/auth/me` kini menyertakan `property_id` dalam payload user.
- Middleware `checkPropertyAccess` di `server.ts` membaca `req.authProfile.property_id` untuk membatasi staf/finance hanya pada properti penugasannya, sementara Super Admin dan Owner memiliki akses portofolio penuh tanpa batas.

### D. Antarmuka Manajemen Pengguna (`src/pages/Admin.tsx`)
- **Badge Status Penugasan**: Menampilkan label cabang properti penugasan (atau badge `Global / Semua Properti`) pada setiap baris fungsionaris.
- **Quick Property Selector**: Dropdown cepat pada baris pengguna untuk memindahkan/menetapkan cabang fungsionaris secara instan.
- **Modal Manajemen Akun**: Field pemilihan *Penugasan Cabang Properti* pada modal pendaftaran dan ubah izin akun staf.

---

## 4. Matriks Pengujian & Verifikasi

| Komponen / Skenario | Hasil Uji | Keterangan |
| :--- | :---: | :--- |
| **Kredensial & Secrets** | ✅ Bersih | Placeholder aman pada `.env.example` (`YOUR_SERVICE_ROLE_KEY_HERE`) |
| **Whitelist RBAC Email** | ✅ Terverifikasi | Strict exact-match email whitelist untuk Super Admin & Owner |
| **Pencegahan Double-Posting Booking** | ✅ Terverifikasi | `saveBooking` bebas side-effects; approval atomik via RPC server |
| **Migration 035 Property Column** | ✅ Siap Rilis | `property_id` nullable dengan foreign key ke `properties(id)` |
| **Endpoint Assign Property** | ✅ Teruji | Role-gated ke Super/Owner, validasi properti, update `users`, & audit log |
| **UI Admin Property Assignment** | ✅ Terintegrasi | Quick selector & modal dropdown sinkron dengan backend API |
| **TypeScript Validation (`tsc --noEmit`)** | ✅ 0 Error | Lulus kompilasi tipe TypeScript 100% |
| **Production Build Pipeline** | ✅ Sukses | `vite build` + `esbuild` server bundle berhasil tanpa warning |

---
*Dokumen ini merupakan catatan resmi audit & pengerasan sistem Samara Stay ERP v18.*
