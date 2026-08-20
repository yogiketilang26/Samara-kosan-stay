# SAMARA STAY ERP v16 — FINANCIAL REPORTING SUBSYSTEM
**Sistem:** SAMARA STAY Multi-Period Financial Reporting Engine  
**Cakupan Laporan:** Harian, Mingguan, Bulanan, Triwulanan (Q1-Q4), Tahunan, dan P&L Per Properti

---

## 1. Arsitektur Agregasi Laporan Keuangan

Laporan keuangan di SAMARA STAY ERP v16 tidak menggunakan kalkulasi tersimpan yang statis, melainkan dieksekusi secara dinamis dari tabel buku besar `journal_entries` dan akun COA `accounts`:

$$\text{Saldo Mutasi Akun} = \sum_{\text{Periode Terpilih}} (\text{Debit} - \text{Credit}) \quad \text{atau} \quad \sum_{\text{Periode Terpilih}} (\text{Credit} - \text{Debit})$$

---

## 2. Struktur Laporan Multi-Periode

### A. Laporan Kas Harian (Daily Cash Report)
- **Komponen:**
  - Saldo Awal Kas & Bank ($Opening$)
  - Penerimaan Kas/Bank/Midtrans ($Cash Inflow$)
  - Pengeluaran Kas/Bank/Petty Cash ($Cash Outflow$)
  - Saldo Akhir Kas & Bank ($Closing = Opening + Inflow - Outflow$)
- **Verifikasi:** Nilai $Closing$ diverifikasi terhadap saldo akumulatif akun `1000`, `1010`, dan `1020`.

### B. Laporan Mingguan & Bulanan (Weekly & Monthly Reports)
- **Komponen:**
  - Total Pendapatan Operasional (Sewa Kamar, Denda, Layanan Lain)
  - Total Beban Operasional (Utilitas, WiFi, Kebersihan, Perbaikan, Gaji, MDR Gateway)
  - Laba Bersih Operasional ($Net Operating Income = Revenue - Expenses$)
  - Tingkat Okupansi Kamar ($Occupancy Rate = \frac{Occupied}{Total Rooms} \times 100\%$)
  - Outstanding Kliring Gateway yang belum cair

### C. Laporan Neraca Saldo & Buku Besar (Trial Balance & General Ledger)
- Menampilkan rincian setiap mutasi akun COA lengkap dengan tanggal, nomor referensi transaksi, deskripsi, nilai Debit, Kredit, dan saldo berjalan (*running balance*).
- Menghasilkan ringkasan saldo total di mana $\sum Total Debit \equiv \sum Total Credit$.

### D. Laporan Laba Rugi Per Properti (Property P&L vs Consolidated)
- Memungkinkan manajemen melihat profitabilitas setiap cabang kos secara terpisah:
  $$\text{Property Net Profit} = \text{Revenue}_{prop} - (\text{Utilities}_{prop} + \text{Maintenance}_{prop} + \text{Allocated Staff}_{prop})$$
- Menghasilkan konsolidasi total grup dengan menambahkan pos beban kantor pusat / *unallocated overhead*.

---

## 3. Ekspor Laporan & Format Digital

- **Ekspor PDF Langsung:** Modul `pdfGenerator.ts` menghasilkan dokumen PDF resmi siap cetak lengkap dengan kop surat Samara Stay, stempel digital, dan tanda tangan pemilik.
- **Ekspor Format CSV/Excel:** Memungkinkan akuntan mengunduh baris mutasi untuk integrasi perpajakan eksternal.
