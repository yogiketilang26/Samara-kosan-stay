# SAMARA STAY ENTERPRISE ERP v16 — REPOSITORY AUDIT REPORT
**Versi Sistem:** SAMARA STAY Enterprise Property & Accounting ERP v16  
**Tanggal Audit:** 17 Agustus 2026  
**Metodologi:** Repository-Wide Static & Dynamic Code Inspection, Dependency Tracing, Security Verification, and Financial Integrity Audit

---

## 1. Inventory & Traceability Matriks File Inti

| File Path | Modul & Tanggung Jawab | Database Tables | Integrasi Utama | Status & Health |
|---|---|---|---|---|
| `server.ts` | Backend API Server, Rate Limiting, Midtrans Webhook, MailerSend API, Diagnostics | All tables (via Service Role) | Express, Midtrans, MailerSend, Supabase | **Production Ready** |
| `src/lib/supabase.ts` | Authoritative Client SDK, Centralized Realtime Manager, Session Header Interceptor | All tables | Supabase JS v2, WebSocket | **Authoritative (Singleton)** |
| `src/lib/midtrans.ts` | Midtrans SNAP Client SDK Loader & Token Dispatcher | `payments`, `bookings`, `surveys` | Midtrans Client Snap.js | **Production Ready** |
| `src/lib/observability.ts` | In-memory Ring-Buffer Log Collector, Error Telemetry, Realtime Metric Aggregator | - | Browser Context | **Production Ready** |
| `src/hooks/useRealtimeTable.ts` | Central Realtime Subscription Hook dengan Differential In-Memory Mutation & Auto-Cleanup | Configurable per Table | `SupabaseRealtimeManager` | **Leak-Free Verified** |
| `src/hooks/useAuth.ts` | Auth Hook & Session State Persistence | `users` | Supabase GoTrue Auth | **Production Ready** |
| `src/context/AuthContext.tsx` | Role-Based Access Control Context (`super`, `owner`, `finance`, `staff`, `tenant`) | `users` | Supabase Auth + JWT | **Authoritative RBAC** |
| `src/context/CartContext.tsx` | Booking Checkout Context & Session Storage | `bookings` | Local State | **Production Ready** |
| `src/context/NotificationContext.tsx`| Global Toast Notification & Audio-Visual Feedback | - | UI | **Production Ready** |
| `src/pages/Home.tsx` | Tenant Public Portal: Katalog Properti, Kamar, Booking Harian/Bulanan, Reservasi Survey DP, Digital Signature Pad | `properties`, `rooms`, `facilities`, `bookings`, `surveys` | Midtrans SNAP, Leaflet Maps | **Production Ready** |
| `src/pages/Admin.tsx` | Enterprise Backoffice: Frontdesk, Occupancy, Tenancy, Accounting General Ledger, Bank Reconciliation, Asset Depreciation, Observability | All 23 Tables | Supabase Realtime, PDF Generator | **Production Ready** |
| `src/components/accounting/AccountingIntegrityAuditModal.tsx` | 5-Point Financial Health Audit Interface & 1-Click Atomic Repair Controller | `financial_transactions`, `journal_entries`, `accounts`, `midtrans_clearing_transactions` | `/api/admin/accounting/integrity-audit` | **v16 Hardened** |
| `src/components/accounting/CoaDiagnosticModal.tsx` | Chart of Accounts Diagnostic Monitor & Master COA Auto-Repair Modal | `accounts` | `/api/admin/accounting/diagnostic-coa` | **v16 Hardened** |

---

## 2. Analisis Arsitektur & Keamanan

### A. Boundary Keamanan Kredensial
- **Service Role Key:** Kredensial `SUPABASE_SERVICE_ROLE_KEY` dan `MIDTRANS_SERVER_KEY` hanya diakses di lingkungan Node.js backend (`server.ts`).
- **Anon Client:** Frontend browser hanya menerima `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`. Seluruh pembatasan data dieksekusi secara ketat oleh PostgreSQL Row-Level Security (RLS).
- **Rate Limiting:** Semua endpoint publik dan pemrosesan pembayaran dilindungi oleh *in-memory sliding window rate limiter*.

### B. Idempotensi Webhook Midtrans
- Webhook Midtrans di `/api/midtrans/webhook` dilindungi oleh:
  1. **Signature Verification:** Validasi hash SHA-512 `order_id + status_code + gross_amount + server_key`.
  2. **Idempotency Guard:** Pengecekan event ID pada tabel `webhook_events` dengan penanganan constraint unik PostgreSQL (`23505`), mencegah eksekusi ganda pada webhook duplikat.
  3. **Atomic Booking/Survey Settlement:** Eksekusi penyelesaian pesanan melalui stored procedure `settle_booking_payment()` dan `settle_contract_extension()`.

---

## 3. Matriks CRUD & Ketahanan Database

| Modul | Operasi CRUD | Tabel Database | Mekanisme Realtime | Status Integritas |
|---|---|---|---|---|
| Properti & Fasilitas | C / R / U / D | `properties`, `facilities` | Silent Refetch Trigger | **100% Persisten** |
| Kamar & Ketersediaan | C / R / U / D | `rooms` | Silent Refetch Trigger | **100% Persisten** |
| Penghuni (Tenancy) | C / R / U / D | `tenants`, `contract_extensions` | In-Memory Differential | **100% Persisten** |
| Booking & Reservasi | C / R / U | `bookings`, `surveys` | In-Memory Differential | **100% Persisten** |
| Transaksi Keuangan | C / R | `financial_transactions` | In-Memory Differential | **Double-Entry Valid** |
| Buku Besar (Journals)| C / R | `journal_entries` | In-Memory Differential | **Double-Entry Valid** |
| Kliring Midtrans | C / R / U | `midtrans_clearing_transactions` | In-Memory Differential | **Akun 1200 Sinkron** |
| Rekonsiliasi Bank | C / R / U | `bank_statement_items`, `bank_reconciliation_matches` | In-Memory Differential | **Auditable Reversal** |

---

## 4. Evaluasi Kesiapan Produksi (Production Readiness)
- **Zero Dummy Data:** Tidak ditemukan data statis atau mock finansial di jalur transaksi utama.
- **Double-Entry Balance:** Fungsi `audit_accounting_integrity()` memastikan saldo Debit $\equiv$ Kredit di semua jurnal transaksi.
- **WebSocket Channel Health:** Satu kanal global `db-global-realtime` dengan mekanisme rekoneksi eksponensial.
- **Hasil Audit Global:** **PASS** (Memenuhi kriteria enterprise ERP).
