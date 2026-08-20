# SAMARA STAY ERP v16 — IMPLEMENTATION & VERIFICATION DIRECTIVE
**Tujuan:** Panduan Implementasi & Verifikasi Otomatis untuk Google AI Studio  
**Target:** SAMARA STAY Enterprise Property & Accounting ERP v16

---

## 1. Petunjuk Operasional Inti
Setiap perbaikan pada codebase SAMARA STAY harus mematuhi protokol:
1. **READ:** Baca file dan telusuri seluruh dependensi sebelum melakukan perubahan.
2. **TRACE:** Pastikan aliran data `UI -> Backend API -> Supabase DB -> Realtime -> UI` tidak terputus.
3. **VERIFY:** Jalankan `compile_applet` untuk memastikan seluruh tipe data TypeScript dan skrip build Vite/Node.js bebas dari error.
4. **NO BREAKING CHANGES:** Jangan pernah menghapus skema database, merusak RLS, atau mengubah logika double-entry yang sudah ada.

---

## 2. Rincian Checklist Verifikasi Produksi

### A. Sub-Sistem Akuntansi & Integritas Buku Besar
- [x] Master COA lengkap (21 akun standar dari 1000 hingga 5400).
- [x] Double-Entry Stored Procedure atomik (`post_financial_transaction`).
- [x] Engine Audit Integritas 5-titik (`audit_accounting_integrity`).
- [x] UI Modal diagnostik & perbaikan COA di portal admin.

### B. Sub-Sistem Midtrans & Kliring Bank
- [x] Webhook receiver dengan verifikasi signature SHA-512.
- [x] Lapisan idempotensi melalui tabel `webhook_events`.
- [x] Pencatatan kliring gateway pada `midtrans_clearing_transactions`.
- [x] Prosedur rekonsiliasi bank otomatis & pembalik jurnal (*unmatch reversal*).

### C. Sub-Sistem Realtime & WebSocket
- [x] Single global channel `db-global-realtime` di `SupabaseRealtimeManager`.
- [x] Auto-reconnect dengan exponential backoff.
- [x] Hook `useRealtimeTable` dengan proteksi memory leak dan pembaruan diferensial.

---

## 3. Perintah Verifikasi Akhir
- Skrip Build: `npm run build`
- Typecheck: `npm run lint` (`tsc --noEmit`)
- Server Startup: `node dist/server.cjs` (Port 3000, Host 0.0.0.0)
