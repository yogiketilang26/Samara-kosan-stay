# SAMARA STAY ERP v16 — FINANCIAL REPORTING SUBSYSTEM
**Sistem:** SAMARA STAY Multi-Period Financial Reporting & Executive Owner Subsystem  
**Cakupan Laporan:** Harian, Mingguan, Bulanan, Triwulanan (Q1-Q4), Tahunan, P&L Per Properti, dan Owner Executive KPIs

---

## 1. Arsitektur Agregasi Laporan Keuangan

Laporan keuangan di SAMARA STAY ERP v16 tidak menggunakan kalkulasi tersimpan yang statis, melainkan dieksekusi secara dinamis dari tabel buku besar `journal_entries`, transaksi `financial_transactions`, data Midtrans `midtrans_clearing_transactions`, dan pemesanan aktif `bookings`:

$$\text{Saldo Mutasi Akun} = \sum_{\text{Periode Terpilih}} (\text{Debit} - \text{Credit}) \quad \text{atau} \quad \sum_{\text{Periode Terpilih}} (\text{Credit} - \text{Debit})$$

---

## 2. Standardisasi Metrik Finansial (Super Admin & Owner Portal)

Untuk memastikan konsistensi mutlak antara manajemen operasional (Super Admin) dan laporan investor/pemilik (Owner Portal), metrik diklasifikasikan dengan definisi akuntansi yang presisi:

### A. Total Pendapatan Kas Masuk (Realized Cash Inflow)
- **Definisi:** Arus kas nyata yang telah berhasil diselesaikan (*settled*) dan masuk ke rekening/buku kas.
- **Formula:** $\sum \text{financial\_transactions} \text{ (type = 'income' | 'dp\_booking')}$.
- **Tampilan:** Ditampilkan sebagai indikator utama pendapatan operasional di Super Admin Finance ERP dan Owner Executive KPI.

### B. Nilai Akumulasi Kontrak Sewa (Gross Contract Pipeline)
- **Definisi:** Total potensi nilai kontrak sewa berjalan yang telah disetujui (*Approved Bookings*) sepanjang seluruh durasi bulan sewa penyewa.
- **Formula:** $\sum \text{bookings.total\_price} \text{ (status = 'approved')}$.
- **Tampilan:** Ditampilkan sebagai metrik komitmen sewa jangka panjang / estimasi omzet kontrak.

### C. Biaya Operasional (Realized Outflow)
- **Definisi:** Seluruh beban operasional riil yang dicatat pada tabel `financial_transactions` (`type = 'expense'`) ditambah biaya pemeliharaan fasilitas `maintenances.cost`.

### D. Laba Bersih Operasional (Net Operating Income / NOI)
- **Formula:** $\text{NOI} = \text{Total Inflow} - \text{Total Expenses}$.
- **Alokasi Dividen Pemilik:** Pool bagi hasil dividen siap distribusi dikalkulasikan sebesar 85% dari $\text{NOI}$ bebas utang operasional.

### E. Piutang Kliring Midtrans (COA 1200 - Unsettled Escrow)
- **Definisi:** Saldo penerimaan pembayaran via Midtrans SNAP yang masih tertahan / dalam proses kliring bank harian sebelum ditransfer ke rekening bank operasional.
- **Formula:** $\sum \text{midtrans\_clearing\_transactions.outstanding\_amount} \text{ (status = 'pending' | 'cleared')}$.

---

## 3. Struktur Laporan Multi-Periode

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

## 4. Ekspor Laporan & Format Digital

- **Ekspor PDF Langsung:** Modul `pdfGenerator.ts` menghasilkan dokumen PDF resmi siap cetak lengkap dengan kop surat Samara Stay, stempel digital, dan tanda tangan pemilik.
- **Ekspor Format CSV/Excel:** Memungkinkan akuntan mengunduh baris mutasi untuk integrasi perpajakan eksternal.
- **Ekspor Owner Executive Summary:** Laporan ringkas performa properti kos multi-cabang, okupansi, laba rugi, dan bagi hasil dividen siap cetak.
