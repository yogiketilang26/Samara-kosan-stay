# SAMARA STAY ERP v16 — MIDTRANS CLEARING & BANK RECONCILIATION
**Sistem:** SAMARA STAY Payment Gateway & Bank Reconciliation Subsystem  
**Komponen Inti:** Midtrans SNAP Webhook, Tabel Kliring `midtrans_clearing_transactions`, Mutasi Bank `bank_statement_items`, dan Mesin Rekonsiliasi Otomatis

---

## 1. Alur Transaksi Kliring Midtrans (End-to-End Flow)

```
[PENYEWA BAYAR VIA MIDTRANS SNAP]
                 │
                 ▼
[MIDTRANS SERVER MENGIRIM WEBHOOK] ──► [/api/midtrans/webhook]
                                               │
                                               ├─► Verifikasi SHA-512 Signature Key
                                               ├─► Cek Idempotensi (Tabel webhook_events)
                                               │
                                               ▼
                         ┌───────────────────────────────────────────┐
                         │ ATOMIC SETTLEMENT (Stored Procedure)      │
                         │ 1. Update status booking / survey         │
                         │ 2. Catat invoice di tabel 'payments'      │
                         │ 3. Catat di 'midtrans_clearing_trans...' │
                         │ 4. Post Jurnal:                           │
                         │    DR 1200 Piutang Kliring Midtrans       │
                         │    CR 4000 Pendapatan Sewa Kamar          │
                         │ 5. Kirim email invoice via MailerSend     │
                         └─────────────────────┬─────────────────────┘
                                               │
                                               ▼
                                  [STATUS: CLEARING PENDING]
                                 (Uang masih di escrow gateway)
```

---

## 2. Struktur Data Kliring Gateway (`midtrans_clearing_transactions`)

Setiap order yang berhasil dilunasi melalui Midtrans mencatat satu record kliring dengan kolom-kolom kunci:
- `gross_amount`: Total tagihan yang dibayarkan oleh penyewa.
- `fee_amount`: Estimasi/realisasi biaya MDR Midtrans.
- `net_amount`: Nilai bersih setelah potongan biaya gateway ($Gross - Fee$).
- `reconciled_amount`: Akumulasi dana yang telah cocok dengan mutasi bank riil.
- `outstanding_amount`: Sisa dana yang belum cair ke rekening bank ($Gross - Reconciled - Fee$).
- `clearing_status`: Status rekonsiliasi (`pending`, `partially_cleared`, `reconciled`, `disputed`).

---

## 3. Alur Rekonsiliasi Bank Otomatis & Manual

```
[IMPORT MUTASI REKENING KORAN (CSV/EXCEL)] ──► [bank_statement_items]
                                                        │
                                                        ▼
                                       ┌───────────────────────────────────┐
                                       │ RECONCILIATION ENGINE             │
                                       │ 1. Match Exact Order ID           │
                                       │ 2. Match Exact Amount & Date      │
                                       │ 3. User Review & Approval         │
                                       └────────────────┬──────────────────┘
                                                        │
                                                        ▼
                        ┌──────────────────────────────────────────────────────────────┐
                        │ EKSEKUSI REKONSILIASI: reconcile_bank_statement_entry()     │
                        │                                                              │
                        │ Jurnal 1 (Pencairan Dana):                                   │
                        │   DR 1010 Kas Utama Bank Mandiri                             │
                        │   CR 1200 Piutang Kliring Midtrans                           │
                        │                                                              │
                        │ Jurnal 2 (Beban Fee Gateway jika ada):                       │
                        │   DR 5030 Biaya Layanan Midtrans                             │
                        │   CR 1200 Piutang Kliring Midtrans                           │
                        │                                                              │
                        │ Audit Record: 'bank_reconciliation_matches'                 │
                        └──────────────────────────────────────────────────────────────┘
```

---

## 4. Mekanisme Pembatalan Rekonsiliasi (Unmatch with Automated Reversal)

Jika staf keuangan melakukan kesalahan pencocokan transaksi bank:
1. Administrator mengeksekusi `/api/admin/reconciliation/unmatch`.
2. Stored procedure `unreconcile_bank_statement_entry()` memicu transaksi pembalik otomatis:
   - **Jurnal Balik Pencairan:** DR 1200 (Piutang Kliring Midtrans) & CR 1010 (Kas Utama Bank Mandiri).
   - **Jurnal Balik Fee:** DR 1200 (Piutang Kliring Midtrans) & CR 5030 (Biaya Layanan Midtrans).
3. Status record kliring dikembalikan ke `pending` atau `partially_cleared`.
4. Mutasi rekening koran dikembalikan ke status `matched = false`.
5. Seluruh jejak pembatalan tersimpan di audit trail tabel `bank_reconciliation_matches` dengan status `unmatched`.
