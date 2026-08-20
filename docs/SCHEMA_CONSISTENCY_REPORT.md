# SAMARA STAY ERP v16 — SCHEMA & DATABASE CONSISTENCY REPORT
**Sistem:** SAMARA STAY Enterprise Property & Accounting ERP  
**Tanggal Audit Skema:** 17 Agustus 2026  
**Sumber Kebenaran Database:** Actual Supabase DDL Snapshot (32 Tables)  
**Status Audit:** **COMPLETED — SCHEMA AUDIT & GAP ANALYSIS**

---

## 1. Perbandingan Jumlah Tabel: Aktual vs Terdokumentasi

### A. Tabel Database Aktual (Total: 32 Tabel)

| No | Nama Tabel | Kategori | Primary Key (PK) | Kolom `property_id` | Status di Dokumentasi v15 |
|---|---|---|---|---|---|
| 1 | `profiles` | User Management | `id` (uuid) | Tidak Ada | *Terdokumentasi umum* |
| 2 | `properties` | Master Property | `id` (integer) | - (Owner PK) | **Terdokumentasi** |
| 3 | `rooms` | Master Kamar | `id` (integer) | `property_id` (integer, FK) | **Terdokumentasi** |
| 4 | `tenants` | Operasional Hunian | `id` (integer) | `property_id` (integer, FK) | **Terdokumentasi** |
| 5 | `bookings` | Transaksi Reservasi | `id` (integer) | `property_id` (integer, FK) | **Terdokumentasi** |
| 6 | `payments` | Transaksi Invoice | `id` (varchar) | `property_id` (integer, FK) | **Terdokumentasi** |
| 7 | `maintenance` | Beban Pemeliharaan | `id` (integer) | `property_id` (integer, FK) | **Terdokumentasi** |
| 8 | `users` | Staff / Admin RBAC | `id` (varchar) | `property_id` (integer, FK) | **Terdokumentasi** |
| 9 | `activity_logs` | Audit Trail Sistem | `id` (integer) | Tidak Ada (Global) | **Terdokumentasi** |
| 10 | `sent_emails` | Email Delivery Log | `id` (integer) | Tidak Ada (Global) | **Terdokumentasi** |
| 11 | `surveys` | Reservasi & DP Survey | `id` (integer) | `property_id` (integer, FK) | **Terdokumentasi** |
| 12 | `accounts` | Master COA | `id` (integer) | Tidak Ada (Master COA) | **Terdokumentasi** |
| 13 | `financial_transactions` | Header Transaksi Jurnal | `id` (integer) | `property_id` (integer, FK) | **Terdokumentasi** |
| 14 | `journal_entries` | Detail Mutasi Jurnal | `id` (integer) | Diwariskan via `transaction_id` | **Terdokumentasi** |
| 15 | `ledger_entries` | Saldo Berjalan Akun | `id` (integer) | Diwariskan via `journal_id` | **Terdokumentasi** |
| 16 | `financial_audit_logs` | Audit Trail Finansial | `id` (integer) | Tidak Ada (Global) | *Terselubung di log* |
| 17 | `settings` | Pengaturan Global | `id` (integer) | Tidak Ada (Global) | **Terdokumentasi** |
| 18 | `coupons` | Promosi & Diskon | `id` (integer) | Tidak Ada (Global) | **Terdokumentasi** |
| 19 | `petty_cash_requests` | Kas Kecil | `id` (bigint) | Tidak Ada (Saat ini) | **Terdokumentasi** |
| 20 | `fixed_assets` | Aset Tetap | `id` (bigint) | Tidak Ada (Saat ini) | **Terdokumentasi** |
| 21 | `budgets` | Anggaran Operasional | `id` (bigint) | Tidak Ada (Saat ini) | **Terdokumentasi** |
| 22 | `vendors` | Rekanan & Supplier | `id` (bigint) | Tidak Ada (Master) | **Terdokumentasi** |
| 23 | `purchase_orders` | Pemesanan Barang | `id` (bigint) | Tidak Ada (Saat ini) | **Terdokumentasi** |
| 24 | `inventory_items` | Stok & Barang Habis Pakai | `id` (bigint) | Tidak Ada (Saat ini) | **Terdokumentasi** |
| 25 | `bank_statement_items` | Mutasi Rekening Koran | `id` (bigint) | Tidak Ada (Bank Rekening) | **Terdokumentasi** |
| 26 | `facilities` | Master Fasilitas | `id` (bigint) | Tidak Ada (Master) | **Terdokumentasi** |
| 27 | `property_facilities` | Junction Properti-Fasilitas| Composite PK | `property_id` (bigint, FK) | *Tabel Relasi Join* |
| 28 | `room_facilities` | Junction Kamar-Fasilitas | Composite PK | Diwariskan via `room_id` | *Tabel Relasi Join* |
| 29 | `webhook_events` | Idempotency Gateway | `id` (uuid) | Tidak Ada (Log Teknis) | *Terdokumentasi teknis* |
| 30 | `contract_extensions` | Perpanjangan Sewa | `id` (bigint) | `property_id` (bigint) | **Terdokumentasi** |
| 31 | `midtrans_clearing_transactions` | Piutang Kliring Gateway | `id` (bigint) | `property_id` (bigint) | **Terdokumentasi** |
| 32 | `bank_reconciliation_matches` | Audit Pencocokan Bank | `id` (bigint) | `property_id` (bigint) | **Terdokumentasi** |

### B. Evaluasi Diskrepansi Jumlah Tabel
Dokumentasi v15 menyebutkan "23 tabel" karena hanya menghitung tabel entitas operasional utama dan mengabaikan 9 tabel teknis/relasi (`profiles`, `property_facilities`, `room_facilities`, `financial_audit_logs`, `webhook_events`, `contract_extensions`, `midtrans_clearing_transactions`, `bank_reconciliation_matches`, `sent_emails`).  
**Tindakan Wajib:** Dokumentasi arsitektur harus diperbarui untuk mencerminkan **32 tabel fisik** yang aktif di Supabase.

---

## 2. Analisis Klasifikasi Dimensi Properti (`property_id`)

| Klasifikasi | Daftar Tabel | Kebutuhan `property_id` | Status Saat Ini |
|---|---|---|---|
| **Global Master Data** | `accounts`, `facilities`, `vendors`, `settings`, `coupons` | **TIDAK PERLU** (Bersifat master bersama seluruh grup). | Sesuai (NULL/Tanpa Kolom). |
| **Log Teknis & Idempotensi** | `webhook_events`, `activity_logs`, `sent_emails`, `financial_audit_logs` | **TIDAK PERLU** (Audit trail tingkat server/global). | Sesuai. |
| **Core Operational Property** | `properties`, `rooms`, `tenants`, `bookings`, `surveys`, `payments`, `contract_extensions` | **WAJIB** (Krusial untuk isolasi kamar & billing). | **Sudah memiliki `property_id`**. |
| **Financial Posting & Clearing** | `financial_transactions`, `midtrans_clearing_transactions`, `bank_reconciliation_matches` | **WAJIB** (Krusial untuk laporan Laba Rugi per cabang).| **Sudah memiliki `property_id`**. |
| **Shared / Sub-Operasional** | `maintenance`, `petty_cash_requests`, `fixed_assets`, `inventory_items`, `purchase_orders`, `budgets` | **SANGAT DIREKOMENDASIKAN (OPTIONAL/SCOPED)**: Pemeliharaan gedung dan kas kecil cabang harus dapat dialokasikan ke cabang tertentu. | `maintenance` memiliki `property_id`. `petty_cash_requests`, `fixed_assets`, `inventory_items`, `purchase_orders`, `budgets` saat ini belum memiliki kolom `property_id`. |

---

## 3. Temuan Ketidakkonsistenan Tipe Data & Foreign Key

### Temuan 1: Tipe Kolom `payments.id` vs Referensi `midtrans_clearing_transactions.payment_id`
- **Kondisi:** `payments.id` bertipe `character varying` (format `INV-17000...` atau `PAY-...`), sedangkan `midtrans_clearing_transactions.payment_id` bertipe `bigint`.
- **Dampak:** Tanpa konversi regex/parsing di backend, query JOIN langsung antar-tabel menggunakan integer akan gagal (`type mismatch`).
- **Rekomendasi:** Di skema database, `payment_id` pada `midtrans_clearing_transactions` sebaiknya bertipe `character varying` atau integrasi menggunakan `midtrans_order_id` yang konsisten bertipe `text`/`varchar` di kedua tabel.

### Temuan 2: Tipe Data ID `properties.id` (integer) vs `property_id` (bigint)
- **Kondisi:** `properties.id` adalah `integer (int4)`, sedangkan `midtrans_clearing_transactions.property_id`, `bank_reconciliation_matches.property_id`, dan `contract_extensions.property_id` adalah `bigint (int8)`.
- **Dampak:** PostgreSQL mendukung upcasting implicit dari `integer` ke `bigint`, sehingga query berjalan normal, tetapi Foreign Key constraint eksplisit harus dipastikan serasi tipe datanya.

---

## 4. Evaluasi Nilai Default Status Pembayaran (Payment Status Safety)

### Temuan Kritis: Nilai Default `status = 'paid'` pada Skema Tertentu
- **Kondisi:** 
  1. `payments.status` memiliki `DEFAULT 'paid'::character varying`.
  2. `contract_extensions.status` memiliki `DEFAULT 'paid'::character varying` dan `paid_at DEFAULT now()`.
- **Analisis Risiko:** **HIGH RISK**. Jika aplikasi melakukan `INSERT` ke tabel `payments` atau `contract_extensions` sebelum menerima konfirmasi webhook Midtrans (misal saat inisialisasi SNAP invoice), statusnya dapat secara tidak sengaja langsung tercatat `paid`.
- **Mitigasi Saat Ini di Backend:** `server.ts` secara eksplisit mengisi status `'pending'` saat pembuatan order SNAP, dan hanya mengubahnya menjadi `'paid'` setelah webhook settlement tervalidasi.
- **Rekomendasi Database Hardening:** Ubah `DEFAULT` pada skema database menjadi `'pending'` untuk menjamin pertahanan berlapis (*defense-in-depth*).

---

## 5. Sumber Otoritatif Akun Pengguna: `users` vs `profiles`

- **Temuan:**
  - Tabel `users` (`id varchar`, `role`, `property_id`, `access`) adalah **tabel otoritatif tunggal** yang digunakan oleh `AuthContext.tsx`, `server.ts`, RLS policies, dan antarmuka `Admin.tsx`.
  - Tabel `profiles` (`id uuid`, `role`) merupakan peninggalan template awal Supabase Auth dan **tidak pernah diakses sama sekali** oleh codebase aplikasi aktif.
- **Kesimpulan:** `public.users` adalah *single source of truth* untuk RBAC dan isolasi multi-properti.

---

## 6. Tracing Akuntansi & Double-Entry Integrity

Aliran pembukuan:
$$\text{financial\_transactions (Header)} \longrightarrow \text{journal\_entries (Lines)} \longrightarrow \text{ledger\_entries (Running Balance)} \longrightarrow \text{accounts (Master Balance)}$$

- Kolom `property_id` tersimpan pada header `financial_transactions`.
- Detail jurnal `journal_entries` merujuk ke `transaction_id`.
- Dengan demikian, setiap mutasi Debit dan Kredit dapat ditelusuri kembali ke `property_id` induknya untuk keperluan Laporan Laba Rugi per Properti (*Property P&L*).
