# Panduan Setup & Migrasi Database Supabase — Samara Stay

Dokumen ini menjelaskan urutan penerapan migrasi database forward-only dan langkah verifikasi pasca-remediasi QA/QC (`R1`–`R16`).

## 1. Aturan Penting Migrasi
- **Forward-Only & Idempoten**: Jangan mengedit atau menghapus file migrasi lama (`001` s/d `049b`).
- **Tanpa Operasi Destruktif**: Migrasi `050` dan `051` tidak melakukan `DELETE`, `DROP TABLE`, `DROP COLUMN`, atau `TRUNCATE` pada tabel bisnis/keuangan.

## 2. Urutan Migrasi Baru
Jalankan migrasi berikut secara berurutan pada Supabase SQL Editor atau melalui Supabase CLI (`supabase db push`):

1. **`supabase/migrations/049_optimize_realtime_publication.sql`**
   - Melepas tabel internal/audit dari publikasi `supabase_realtime` untuk penghematan egress.
2. **`supabase/migrations/049b_dashboard_summary_rpc.sql`**
   - Membuat fungsi agregasi awal `dashboard_summary` dan `monthly_cashflow`.
3. **`supabase/migrations/050_rbac_least_privilege.sql`** *(Remediasi R1, R2, R5)*
   - Mencabut akses `staff` dari seluruh tabel keuangan, jurnal, kliring Midtrans, rekonsiliasi bank, aset tetap, anggaran, vendor, PO, dan `sent_emails`.
   - Membatasi `staff` hanya pada tabel operasional (`rooms`, `maintenance`, `bookings`, `surveys`, `tenants`, `inventory_items`) di propertinya sendiri (`get_auth_user_property_id()`).
   - Mengamankan Storage bucket privat (`tenant-documents`, `payment-proof`, `contracts`, `signatures`, `maintenance`) agar penulisan hanya melalui server (service role).
   - Mengunci policy `"Self Insert Own User Row"` pada `public.users` agar hanya mengizinkan `role = 'user'` dan `property_id IS NULL`.
   - Memperbarui RPC `dashboard_summary` dan `monthly_cashflow` agar memvalidasi role (`super`, `super_admin`, `owner`, `anak_owner`, `admin`, `finance`), membatasi properti secara server-side, dan mengecualikan mutasi transfer/kliring (`1010`/`1200`) serta liabilitas DP (`1300`) dari pendapatan/biaya.
4. **`supabase/migrations/051_ledger_hardening.sql`** *(Remediasi R3, R4, R5, R6)*
   - Memperkeras `post_financial_transaction`: lock akun deterministik (`ORDER BY id ASC FOR UPDATE`), validasi saldo ketat tanpa `GREATEST(0, ...)`, idempotensi berbasis `(reference_type, reference_id, category, debit_account_id, credit_account_id)`, dan pembuatan indeks unik parsial `idx_ft_idempotent_ref` secara kondisional apabila tidak ada duplikat historis.
   - Memperkeras `settle_booking_payment`, `settle_manual_booking_approval`, dan `settle_contract_extension`: menghapus `EXCEPTION WHEN OTHERS THEN NULL`, memeriksa hasil `{success:false}` dari `post_financial_transaction` dan melempar `RAISE EXCEPTION` untuk rollback atomik, mengunci baris `rooms` (`FOR UPDATE`) guna mencegah bentrok hunian, serta mencatat potongan biaya gateway Midtrans (`Dr 5030 / Cr 1200`).
   - Memperbaiki `reconcile_bank_statement_entry` (`p_type := 'transfer'`) dan `unreconcile_bank_statement_entry` (`p_type := 'transfer'` & `'expense_reversal'`) agar pencairan kliring bank tidak menggandakan pendapatan sewa.
   - Menambahkan RPC `settle_survey_dp_payment` dan `forfeit_or_refund_survey_dp` untuk siklus hidup DP survei yang atomik dan idempoten.

## 3. Verifikasi Pra-Remediasi & Pasca-Remediasi (Read-Only)
1. **Sebelum menerapkan migrasi 050 & 051**, jalankan:
   - `supabase/verify_qa_live.sql` (6 query diagnostik read-only untuk mendeteksi anomali historis di DB live).
2. **Setelah menerapkan migrasi 050 & 051**, jalankan:
   - `supabase/verify_after_remediation.sql` (memastikan seluruh 6 invariant akuntansi, RBAC, dan indeks unik bernilai 0 temuan).

## 4. Koreksi Data Historis (Opsional & Manual)
- Lihat `supabase/remediate_historical_accounting_manual.sql`.
- Seluruh pernyataan koreksi berada di dalam komentar (`/* ... */`) dan didahului oleh query `SELECT` deteksi. Jangan jalankan blok koreksi tanpa persetujuan tertulis pemilik setelah meninjau hasil `SELECT`.
