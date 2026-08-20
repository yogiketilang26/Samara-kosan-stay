# SAMARA STAY ERP v16 — ACCOUNTING & FINANCIAL INTEGRITY SPECIFICATION
**Sistem:** SAMARA STAY Enterprise Accounting Engine v16  
**Standar Akuntansi:** Prinsip Akuntansi Berterima Umum (Double-Entry Bookkeeping)  
**Tingkat Integritas:** ACID Compliant (PostgreSQL Stored Procedures)

---

## 1. Master Chart of Accounts (COA) Standar

```
[1000 - 1999] AKTIVA / ASSETS (Normal Balance: DEBIT)
├── 1000  Kas Tunai / Cash on Hand (Kas Operasional Cabang)
├── 1010  Kas Utama Bank Mandiri (Rekening Giro Operasional)
├── 1020  Bank Penampung Midtrans Escrow (Rekening Penampungan Payment Gateway)
└── 1200  Piutang Kliring Midtrans (Gateway Clearing & Settlement Receivable)

[2000 - 2999] KEWAJIBAN / LIABILITIES (Normal Balance: CREDIT)
├── 1300  Hutang Titipan Uang Muka / Deposit Survey (Down Payment Ditahan)
├── 2000  Hutang Usaha / Vendor Payable (Kewajiban Pembelian Barang/Jasa)
└── 2100  Hutang Deposit Jaminan Sewa (Security Deposit Penghuni)

[3000 - 3999] EKUITAS / EQUITY (Normal Balance: CREDIT)
├── 3000  Modal Pemilik / Modal Disetor (Owner Equity)
└── 3100  Laba Ditahan / Retained Earnings (Akumulasi Laba Periode Lalu)

[4000 - 4999] PENDAPATAN / REVENUE (Normal Balance: CREDIT)
├── 4000  Pendapatan Sewa Kamar Kos (Rental Revenue Utama)
├── 4100  Pendapatan Denda & Keterlambatan (Late Fee Penalty)
├── 4200  Pendapatan DP Survey Hangus (Forfeited Survey Deposits)
└── 4300  Pendapatan Laundry & Layanan Tambahan (Ancillary Revenue)

[5000 - 5999] BEBAN OPERASIONAL / EXPENSES (Normal Balance: DEBIT)
├── 5000  Beban Listrik, Air & Utilitas (PLN, PDAM)
├── 5010  Beban Internet & WiFi (Indihome/Biznet)
├── 5020  Beban Kebersihan & Sampah (Sanitasi Lingkungan)
├── 5030  Biaya Layanan Midtrans / Payment Gateway (MDR Fee)
├── 5100  Beban Pemeliharaan & Perbaikan Gedung (Maintenance & Repairs)
├── 5200  Beban Gaji Karyawan & Penjaga Kos (Payroll)
├── 5300  Beban Pemasaran & Iklan Properti (Marketing Ads)
└── 5400  Beban Perlengkapan & Operasional Kantor (Office Supplies)
```

---

## 2. Matriks Peristiwa Finansial & Jurnal Double-Entry

| Peristiwa Bisnis | Akun Debit (DR) | Akun Kredit (CR) | Catatan & Dimensi Properti |
|---|---|---|---|
| **Pelunasan Sewa via Midtrans** | 1200 (Piutang Kliring Midtrans) | 4000 (Pendapatan Sewa Kamar) | Wajib menyertakan `property_id` |
| **Pembayaran Sewa Tunai di Lokasi** | 1000 (Kas Tunai) | 4000 (Pendapatan Sewa Kamar) | Wajib menyertakan `property_id` |
| **Penerimaan DP Survey via Midtrans**| 1200 (Piutang Kliring Midtrans) | 1300 (Hutang Titipan Uang Muka)| Dicatat sebagai kewajiban titipan |
| **DP Survey Dikonversi Jadi Sewa** | 1300 (Hutang Titipan Uang Muka)| 4000 (Pendapatan Sewa Kamar) | Dipindahkan saat pelunasan resmi |
| **DP Survey Hangus (No Show)** | 1300 (Hutang Titipan Uang Muka)| 4200 (Pendapatan DP Hangus) | Diakui sebagai pendapatan lain |
| **Penerimaan Deposit Jaminan Sewa**| 1010 (Kas Utama Bank Mandiri) | 2100 (Hutang Deposit Jaminan) | Jaminan dikembalikan saat checkout |
| **Pengembalian Deposit Jaminan** | 2100 (Hutang Deposit Jaminan) | 1010 (Kas Utama Bank Mandiri) | Pengembalian dana akhir sewa |
| **Pencairan Kliring Midtrans ke Bank**| 1010 (Kas Utama Bank Mandiri) | 1200 (Piutang Kliring Midtrans)| Berdasarkan rekonsiliasi mutasi bank |
| **Biaya Pemotongan Fee Midtrans (MDR)**| 5030 (Biaya Layanan Midtrans) | 1200 (Piutang Kliring Midtrans)| Dicatat saat rekonsiliasi bank |
| **Pengeluaran Biaya Pemeliharaan** | 5100 (Beban Pemeliharaan) | 1000 (Kas Tunai) / 1010 (Bank) | Wajib menyertakan `property_id` |
| **Pembayaran Tagihan Listrik/Air** | 5000 (Beban Utilitas) | 1010 (Kas Utama Bank Mandiri) | Wajib menyertakan `property_id` |
| **Pembayaran Gaji Karyawan Kos** | 5200 (Beban Gaji Karyawan) | 1010 (Kas Utama Bank Mandiri) | Alokasi per cabang properti |

---

## 3. Mesin Audit Integritas Akuntansi (5-Point Integrity Engine)

Prosedur `audit_accounting_integrity()` diimplementasikan pada PostgreSQL untuk memvalidasi integritas pembukuan:

1. **Check 1: Keseimbangan Debit = Kredit di Setiap Transaksi**
   $$\sum \text{Debit} - \sum \text{Credit} = 0 \quad (\forall \text{ transaction\_id})$$
2. **Check 2: Sinkronisasi Saldo Akun COA vs Mutasi Jurnal**
   $$\text{Stored Balance} = \sum \text{Journal Entries Mutations}$$
3. **Check 3: Pemindai Entri Yatim (Orphaned Record Scanner)**
   - Mendeteksi jurnal tanpa induk transaksi atau tanpa akun COA yang terdaftar.
4. **Check 4: Kelengkapan Dimensi Properti (`property_id`)**
   - Memastikan seluruh pendapatan dan beban cabang terikat pada `property_id` yang valid.
5. **Check 5: Rekonsiliasi Kliring Midtrans (Akun 1200 vs Outstanding Clearing)**
   $$\text{Saldo Akun 1200} \equiv \sum \text{midtrans\_clearing\_transactions.outstanding\_amount}$$

---

## 4. Kebijakan Reparasi 1-Klik yang Aman (Atomic Repair Flow)
- Reparasi hanya dilakukan melalui otorisasi administrator dengan hak akses `super_admin` atau `owner`.
- Seluruh mutasi perbaikan dieksekusi di dalam transaksi database atomik yang mencatat histori perbaikan ke dalam tabel `activity_logs`.
