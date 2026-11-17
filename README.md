# Samara Stay — Panduan Operasional & Checklist Kesiapan Go-Live (R17–R21)

Dokumentasi resmi untuk persiapan rilis produksi (**Go-Live**) aplikasi **Samara Stay**, mencakup keamanan bucket dokumen privat (R17), penegakan kedaluwarsa transaksi & kunci kamar (R18), layar sukses pembayaran (R19), checklist produksi & pemeriksaan boot (R20), serta mitigasi double-booking lintas platform Airbnb (R21).

---

## 1. Checklist Produksi Go-Live (R20)

Saat server dijalankan (`npm start` atau `npm run dev`), fungsi `runProductionBootChecks()` di `server.ts` secara otomatis memeriksa variabel lingkungan kritis tanpa pernah mencetak nilai rahasia (*secret*). Pastikan seluruh poin berikut terpenuhi sebelum menerima trafik produksi:

### 1.1 MailerSend (Verifikasi Domain & Antrean Kirim Ulang)
1. Buka dasbor **MailerSend → Domains**, tambahkan domain resmi Anda (mis. `samarastay.com`), lalu lengkapi verifikasi DNS **SPF**, **DKIM**, dan **Return-Path**.
2. Setelah status domain **Verified**, atur variabel lingkungan di server produksi:
   ```env
   MAILERSEND_API_KEY=<kunci_api_mailersend_produksi>
   MAILERSEND_FROM_EMAIL=no-reply@samarastay.com
   MAILERSEND_FROM_NAME="Samara Stay"
   ```
3. **Perilaku Sebelum Domain Terverifikasi (`#MS42207`)**:
   - Apabila pengiriman gagal karena error `#MS42207` (*The from.email domain must be verified in your account*), server **tidak** pernah menampilkan klaim palsu `"email terkirim"` (`success: false, emailSent: false, status: 'failed'`).
   - Seluruh email yang gagal tercatat di tabel `public.sent_emails` dengan `status = 'failed'`, alasan error (`error_message`), serta isi email (`html_body` & `text_body`).
   - Setelah domain terverifikasi, Admin/Owner dapat membuka **Panel Admin → Integrasi Email** dan menekan tombol **Kirim Ulang** (`POST /api/admin/emails/retry`) pada baris email yang berstatus `failed`.

### 1.2 Midtrans (Kunci Produksi & Webhook)
1. Pastikan variabel lingkungan Midtrans selaras dengan mode rilis:
   ```env
   MIDTRANS_IS_PRODUCTION=true
   MIDTRANS_SERVER_KEY=Mid-server-xxxxxxxxxxxxxxxxxxxx
   VITE_MIDTRANS_CLIENT_KEY=Mid-client-xxxxxxxxxxxxxxxxxxxx
   BOOKING_HOLD_MINUTES=15
   ```
   *(Server akan mencatat peringatan `[BOOT CHECK R20 - MIDTRANS MISMATCH]` apabila `MIDTRANS_IS_PRODUCTION=true` tetapi kunci masih berawalan `SB-Mid-`, atau sebaliknya).*
2. Pada **Midtrans Dashboard (Production) → Settings → Configuration**:
   - Atur **Payment Notification URL** ke:
     ```
     https://<domain-produksi-anda>/api/midtrans/webhook
     ```
   - Pastikan **Finish Redirect URL** mengarah ke `https://<domain-produksi-anda>/`.
3. **Uji Transaksi Kecil**: Lakukan minimal 1 transaksi nyata bernilai kecil di lingkungan produksi untuk memverifikasi alur `charge` → `Snap` → `webhook` → `settle_booking_payment` → `Unduh PDF Invoice`.

### 1.3 Supabase (Backup, Urutan Migrasi Forward-Only, & Verifikasi Live)
1. **Wajib Backup**: Lakukan *database backup* / *snapshot* terlebih dahulu dari Supabase Dashboard sebelum menjalankan migrasi di produksi.
2. **Urutan Eksekusi Migrasi (Forward-Only, Tanpa `DROP/DELETE` Destruktif)**:
   Jalankan file migrasi secara berurutan melalui Supabase SQL Editor atau CLI:
   - `supabase/migrations/049_atomic_settlement_and_rls_lockdown.sql`
   - `supabase/migrations/049b_dashboard_aggregates.sql`
   - `supabase/migrations/050_qa_security_and_accounting_fixes.sql`
   - `supabase/migrations/051_qa_r1_r16_remediation.sql`
   - `supabase/migrations/052_golive_storage_holds_and_airbnb.sql`
3. **Verifikasi Pasca-Migrasi**:
   Jalankan skrip verifikasi `supabase/verify_qa_live.sql` di Supabase SQL Editor untuk memastikan RLS aktif di semua tabel sensitif, RPC `settle_booking_payment` & `cleanup_expired_room_holds` tersedia, dan bucket dokumen berada dalam kondisi `public = false`.
4. **Migrasi Dokumen Base64 Lama (Jika Ada — R17)**:
   - Jalankan audit terlebih dahulu (tanpa mengubah database):
     ```bash
     npx tsx scripts/migrate_base64_to_storage.ts --dry-run
     ```
   - Salin ke Storage privat dan verifikasi signed URL (tanpa menimpa kolom DB):
     ```bash
     npx tsx scripts/migrate_base64_to_storage.ts --copy-and-verify
     ```
   - Setelah laporan `migration_base64_report.json` diverifikasi dan disetujui Owner, ganti isi kolom Base64 dengan path Storage kanonik:
     ```bash
     npx tsx scripts/migrate_base64_to_storage.ts --apply-owner-approved
     ```

### 1.4 Kuota Koneksi Supabase Realtime (Free Tier Maks 200 Koneksi)
1. Aplikasi menggunakan arsitektur **Single Global Channel per Tab** (`db-global-realtime` di `src/lib/supabase.ts`): **1 tab browser = maksimal 1 koneksi WebSocket**.
2. Tab yang tidak aktif (tersembunyi > 10 menit) otomatis memutus sementara kanal Realtime (`IDLE_PAUSE_MS`) untuk menghemat kuota koneksi puncak.
3. `SupabaseRealtimeManager` dilengkapi detektor otomatis yang mencetak peringatan `[REALTIME MANAGER - R20 WARNING]` apabila `activeChannels > 1` pada satu tab.

---

## 2. Arsitektur Keamanan & Operasional R17–R21

| Kode | Kebijakan Teknis yang Ditegakkan |
| :--- | :--- |
| **R17** | Bucket `tenant-documents`, `signatures`, `contracts`, `payment-proof`, dan `maintenance` wajib **privat (`public = false`)**. Hanya `property-images` (`room-images`, `avatars`) yang bersifat publik. Kolom database hanya menyimpan `bucket/path` (menolak `data:image/...;base64`). Dokumen privat diakses melalui endpoint `/api/storage/signed-url` dengan masa berlaku pendek (`<= 3600` detik / 1 jam). |
| **R18** | Payload Midtrans Snap menyertakan `expiry: { unit: 'minutes', duration: 15 }` (`BOOKING_HOLD_MINUTES`) dan menyimpan `hold_expires_at` pada `bookings` serta `rooms`. Kamar `reserved` yang melewati `hold_expires_at` otomatis dianggap `available` pada query ketersediaan dan dibersihkan oleh jadwal `cleanup_expired_room_holds()` setiap 5 menit (non-overlap). Reconciler Midtrans berjalan tiap 60 detik (bukan 20 detik), hanya memeriksa order `< 24 jam`, batas `<= 20` order/putaran, dengan *exponential backoff* per order. |
| **R19** | Auto-reload 3,5 detik setelah pembayaran berhasil telah dihapus. Modal invoice tetap tampil hingga pengguna menekan **Unduh PDF Invoice** atau **Tutup**, dan tombol **Unduh PDF Invoice** tetap berfungsi meskipun state halaman dimuat ulang dari server (`/api/midtrans/status/:orderId`). |
| **R21** | Mitigasi double-booking Airbnb: (a) Banner peringatan operasional pada Manajemen Kamar, (b) Penolakan otomatis settlement Midtrans baru apabila kamar sudah ditandai `occupied` manual (booking ditandai `needs_refund_review` + dicatat di `activity_logs`), (c) Audit log siapa/kapan mengubah status kamar. |

---

## 3. Backlog Pengembangan Berikutnya (Di Luar Rilis Go-Live Saat Ini)

- **[BACKLOG-AIRBNB-ICAL] Sinkronisasi Dua Arah Kalender Airbnb (iCal `.ics` Import/Export)**:
  - Saat ini mitigasi double-booking Airbnb ditangani melalui SOP operasional penandaan manual status kamar menjadi **Terisi (`occupied`)** segera setelah pesanan Airbnb masuk, ditambah pengaman otomatis `needs_refund_review` di level server & RPC database (R21).
  - Pekerjaan integrasi parser/exporter iCal otomatis dicatat sebagai item terpisah pada backlog pasca-Go-Live.
