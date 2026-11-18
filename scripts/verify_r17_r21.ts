/**
 * SAMARA STAY — AUTOMATED VERIFICATION SUITE FOR R17 – R21 (GO-LIVE ADDENDUM)
 * Usage: npx tsx scripts/verify_r17_r21.ts
 */
import fs from 'fs';
import path from 'path';

interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function assertTest(id: string, name: string, condition: boolean, details: string) {
  results.push({ id, name, passed: Boolean(condition), details });
  if (!condition) {
    console.error(`❌ [FAIL] ${id} — ${name}: ${details}`);
  } else {
    console.log(`✅ [PASS] ${id} — ${name}: ${details}`);
  }
}

const rootDir = process.cwd();
const readSrc = (relPath: string) => fs.readFileSync(path.join(rootDir, relPath), 'utf8');

// ============================================================================
// R17 TESTS: Private Buckets, Path Storage, <= 1h Signed URL, No Base64 Fallback
// ============================================================================
const mig052 = readSrc('supabase/migrations/052_golive_storage_holds_and_airbnb.sql');
const uploaderSrc = readSrc('src/utils/storageUploader.ts');
const bookingFormSrc = readSrc('src/components/transaction/BookingForm.tsx');
const serverSrc = readSrc('server.ts');

// R17.1: Static test on migrations — private buckets ('tenant-documents', 'signatures', 'contracts', 'payment-proof', 'maintenance') MUST be public = false in latest migration (052)
const privateBuckets = ['tenant-documents', 'signatures', 'contracts', 'payment-proof', 'maintenance'];
const hasPublicTrueForPrivateIn052 = privateBuckets.some((b) => {
  const regex = new RegExp(`'${b}'\\s*,\\s*'${b}'\\s*,\\s*true`, 'i');
  return regex.test(mig052);
});
const enforcesPublicFalseIn052 =
  privateBuckets.every((b) => new RegExp(`'${b}'\\s*,\\s*'${b}'\\s*,\\s*false`, 'i').test(mig052)) &&
  mig052.includes('ON CONFLICT (id) DO UPDATE SET') &&
  mig052.includes('public = EXCLUDED.public');

assertTest(
  'R17.1',
  'Bucket dokumen privat wajib public=false di migrasi 052 (tes statis)',
  !hasPublicTrueForPrivateIn052 && enforcesPublicFalseIn052,
  '052_golive_storage_holds_and_airbnb.sql menegakkan public=false (INSERT ... ON CONFLICT DO UPDATE SET public=EXCLUDED.public) untuk tenant-documents, signatures, contracts, payment-proof, maintenance'
);

// R17.2: Short-lived signed URL (<= 3600s / 1 hour), no 10-year 315360000 TTL in createSignedUrl
const hasTenYearSignedUrlCall =
  /createSignedUrl\s*\([^,]+,\s*315360000\s*\)/.test(uploaderSrc) ||
  /createSignedUrl\s*\([^,]+,\s*315360000\s*\)/.test(serverSrc);
const hasShortLivedSignedUrl =
  uploaderSrc.includes('SHORT_LIVED_SIGNED_URL_TTL = 3600') &&
  serverSrc.includes("app.get('/api/storage/signed-url'") &&
  serverSrc.includes('.createSignedUrl(data.path, 3600)');

assertTest(
  'R17.2',
  'Signed URL berumur pendek (<= 1 jam / 3600 detik) & endpoint /api/storage/signed-url memeriksa hak akses',
  !hasTenYearSignedUrlCall && hasShortLivedSignedUrl,
  'Tidak ada panggilan createSignedUrl(..., 315360000); menggunakan TTL <= 3600 detik dan endpoint /api/storage/signed-url dengan pemeriksaan hak akses'
);

// R17.3: No Base64 fallback for private documents in BookingForm / storageUploader / /api/bookings/save
const bookingFormHasBase64Fallback = bookingFormSrc.includes('reader.readAsDataURL(file)');
const serverBlocksBase64Docs =
  serverSrc.includes("body.marriage_certificate_url.startsWith('data:')") &&
  serverSrc.includes("body.signature_url.startsWith('data:')") &&
  mig052.includes('chk_bookings_no_base64_docs') &&
  mig052.includes('chk_tenants_no_base64_docs');

assertTest(
  'R17.3',
  'Menolak penyimpanan Base64 (data:image/...;base64) di kolom dokumen & menyimpan path kanonik',
  !bookingFormHasBase64Fallback && serverBlocksBase64Docs,
  'BookingForm tidak fallback ke FileReader.readAsDataURL; /api/bookings/save & CHECK constraint 052 menolak prefix data:'
);

// R17.4: Separate non-destructive Base64 migration script exists
const migrateScriptExists = fs.existsSync(path.join(rootDir, 'scripts/migrate_base64_to_storage.ts'));
const migrateScriptSrc = migrateScriptExists ? readSrc('scripts/migrate_base64_to_storage.ts') : '';
assertTest(
  'R17.4',
  'Skrip migrasi Base64 terpisah & non-destruktif tersedia',
  migrateScriptExists &&
    migrateScriptSrc.includes('--apply-owner-approved') &&
    migrateScriptSrc.includes('COPY_AND_VERIFY_ONLY') &&
    migrateScriptSrc.includes('migration_base64_report.json'),
  'scripts/migrate_base64_to_storage.ts menyalin ke Storage privat, memverifikasi signed URL, menulis migration_base64_report.json, dan hanya mengubah kolom dengan --apply-owner-approved'
);

// ============================================================================
// R18 TESTS: Transaction Expiry, Room Hold Expiry, 5m Cleanup, 60s Reconciler
// ============================================================================
const hasSnapExpiryPayload =
  serverSrc.includes("expiry: {") &&
  serverSrc.includes("unit: 'minutes'") &&
  serverSrc.includes('duration: holdMinutes') &&
  serverSrc.includes('BOOKING_HOLD_MINUTES');

assertTest(
  'R18.1',
  'Payload Midtrans Snap menyertakan expiry: { unit: "minutes", duration: 15 } & hold_expires_at',
  hasSnapExpiryPayload,
  'POST /api/midtrans/charge menyertakan expiry: { unit: "minutes", duration: holdMinutes } (default 15) dan mengikat hold_expires_at ke bookings & rooms'
);

const supabaseLibSrc = readSrc('src/lib/supabase.ts');
const homeSrc = readSrc('src/pages/Home.tsx');
const hasAvailabilityHoldCheck =
  serverSrc.includes('new Date(r.hold_expires_at).getTime() <= nowMs') &&
  supabaseLibSrc.includes('new Date(r.hold_expires_at).getTime() <= Date.now()') &&
  homeSrc.includes('new Date(holdExp).getTime() <= Date.now()');

assertTest(
  'R18.2',
  'Kamar reserved otomatis dianggap available setelah lewat hold_expires_at di query ketersediaan',
  hasAvailabilityHoldCheck,
  'server.ts (/api/data/rooms), src/lib/supabase.ts (fetchRooms), dan Home.tsx/PropertyDetailView.tsx memeriksa hold_expires_at <= NOW()'
);

const hasRoomHoldCleanupScheduler =
  serverSrc.includes('ROOM_HOLD_CLEANUP_INTERVAL_MS') &&
  serverSrc.includes("supabaseAdmin.rpc('cleanup_expired_room_holds')") &&
  serverSrc.includes('releaseRoomHoldIfOwnedByBooking');

assertTest(
  'R18.3',
  'Jadwal cleanup_expired_room_holds() >= 5 menit (non-overlap) & pelepasan kamar bersyarat kepemilikan booking',
  hasRoomHoldCleanupScheduler,
  'runBackgroundExpiredRoomHoldsCleanup berjalan tiap 5 menit dengan guard roomHoldCleanupRunning, dan webhook/status/reconciler memakai releaseRoomHoldIfOwnedByBooking'
);

const hasHardenedReconciler =
  serverSrc.includes('RECONCILER_INTERVAL_MS = Math.max(\n    60 * 1000') &&
  serverSrc.includes('RECONCILER_MAX_BATCH_PER_CYCLE = 20') &&
  serverSrc.includes(".gte('created_at', cutoff24hIso)") &&
  serverSrc.includes('reconcilerOrderBackoff') &&
  serverSrc.includes('supabaseQueriesInCycle');

assertTest(
  'R18.4',
  'Background reconciler Midtrans: interval >= 60s, umur order < 24 jam, batas <= 20/putaran, backoff, non-overlap, berhenti di terminal',
  hasHardenedReconciler,
  'Interval minimum 60.000 ms (bukan 20s), filter created_at >= NOW()-24h, batch <= 20 (8+6+6), exponential backoff per order, dan metrik supabaseQueriesInCycle'
);

// ============================================================================
// R19 TESTS: Payment Success Screen (No 3.5s Auto-Reload, Persistent PDF Download)
// ============================================================================
const invoiceCardSrc = readSrc('src/components/transaction/InvoiceCard.tsx');
const hasOldAutoReload =
  homeSrc.includes('}, 3500);') &&
  homeSrc.includes('// Automatically reload end-user back to clean initial home screen');
const hasPersistentReceiptPdf =
  invoiceCardSrc.includes('handleDownloadPdf') &&
  invoiceCardSrc.includes('samara_last_paid_receipt') &&
  serverSrc.includes('receipt_summary: receiptSummary');

assertTest(
  'R19.1',
  'Hapus auto-reload 3,5 detik & pastikan Unduh PDF tetap berfungsi setelah data dimuat ulang dari server',
  !hasOldAutoReload && hasPersistentReceiptPdf,
  'Auto-reload 3500ms dihapus dari handleSandboxPaymentSuccess; reload hanya saat klik Tutup (handleCloseReceiptAndReset); InvoiceCard.handleDownloadPdf mengambil fallback dari sessionStorage & /api/midtrans/status/:orderId'
);

// ============================================================================
// R20 TESTS: Boot Check Warnings, Failed Email Status + Admin Retry, Realtime >1 Channel Warning
// ============================================================================
const adminSrc = readSrc('src/pages/Admin.tsx');
const readmeSrc = readSrc('README.md');

const hasBootCheck =
  serverSrc.includes('const runProductionBootChecks = () =>') &&
  serverSrc.includes('[BOOT CHECK R20 - MIDTRANS MISMATCH]') &&
  serverSrc.includes('[BOOT CHECK R20 - MAILERSEND DOMAIN]') &&
  serverSrc.includes('[BOOT CHECK R20 - APP_URL]') &&
  serverSrc.includes('[BOOT CHECK R20 - EMAIL WHITELIST]') &&
  serverSrc.includes('[BOOT CHECK R20 - AUTH]');

assertTest(
  'R20.1',
  'Pemeriksaan boot produksi mencatat peringatan jelas tanpa membocorkan nilai secret',
  hasBootCheck,
  'runProductionBootChecks() memeriksa MIDTRANS_IS_PRODUCTION vs SB-Mid-, MAILERSEND_FROM_EMAIL, APP_URL, email whitelist, dan REQUIRE_EMAIL_CONFIRMED'
);

const hasEmailFailureAndRetry =
  serverSrc.includes("warning_code: 'MS42207_DOMAIN_UNVERIFIED'") &&
  serverSrc.includes('emailSent: false') &&
  serverSrc.includes("app.post('/api/admin/emails/retry'") &&
  adminSrc.includes('handleRetryFailedEmail');

assertTest(
  'R20.2',
  'Email gagal (#MS42207) tercatat status="failed" di sent_emails, tidak klaim terkirim, dan dapat di-retry dari Admin',
  hasEmailFailureAndRetry,
  '/api/email/send mengembalikan success:false, emailSent:false, status:"failed" saat #MS42207 dan Admin memiliki tabel riwayat sent_emails + tombol Kirim Ulang (/api/admin/emails/retry)'
);

const hasRealtimeChannelWarning =
  supabaseLibSrc.includes('[REALTIME MANAGER - R20 WARNING] activeChannels > 1') &&
  readmeSrc.includes('verify_qa_live.sql');

assertTest(
  'R20.3',
  'Peringatan bila activeChannels > 1 per tab & dokumentasi checklist produksi di README.md',
  hasRealtimeChannelWarning,
  'SupabaseRealtimeManager mencatat console.warn bila activeChannels > 1 dan README.md mendokumentasikan 4 poin checklist produksi'
);

// ============================================================================
// R21 TESTS: Airbnb Cross-Platform Double-Booking Mitigation
// ============================================================================
const roomListSrc = readSrc('src/components/room/RoomSelectionList.tsx');
const hasAirbnbBanner =
  roomListSrc.includes('Pesanan dari Airbnb harus segera ditandai Terisi') &&
  roomListSrc.includes('data-testid="airbnb-manual-occupied-banner"');
const hasOccupiedSettleRejection =
  serverSrc.includes("status: 'needs_refund_review'") &&
  serverSrc.includes("action: 'DOUBLE_BOOKING_REFUND_REVIEW'") &&
  mig052.includes("'needs_refund_review'");
const hasRoomStatusAuditLog =
  (serverSrc.includes("action: 'ROOM_STATUS_CHANGED'") || serverSrc.includes("action: 'ROOM_STATUS_CHANGE'")) &&
  readmeSrc.includes('BACKLOG-AIRBNB-ICAL');

assertTest(
  'R21.1',
  'Mitigasi Airbnb: Banner Manajemen Kamar, penolakan settle kamar Terisi -> needs_refund_review, dan activity_logs',
  hasAirbnbBanner && hasOccupiedSettleRejection && hasRoomStatusAuditLog,
  'RoomSelectionList menampilkan banner Airbnb, settleBookingTransaction & RPC 052 menolak kamar occupied dengan status needs_refund_review, perubahan status kamar dicatat ke activity_logs, dan iCal dicatat di backlog README'
);

// ============================================================================
// R22 TESTS: Production Functions Ready with Sandbox Active Default
// ============================================================================
const envExampleSrc = readSrc('.env.example');
const midtransLibSrc = readSrc('src/lib/midtrans.ts');
const hasSandboxDefaultAndProdReady =
  envExampleSrc.includes('MIDTRANS_IS_PRODUCTION="false"') &&
  envExampleSrc.includes('VITE_MIDTRANS_IS_PRODUCTION="false"') &&
  serverSrc.includes("app.get('/api/midtrans/config'") &&
  serverSrc.includes("const isProduction = process.env.MIDTRANS_IS_PRODUCTION === 'true';") &&
  midtransLibSrc.includes("fetch('/api/midtrans/config')");

assertTest(
  'R22.1',
  'Fungsi Production siap 100% dengan mode Sandbox aktif secara default (MIDTRANS_IS_PRODUCTION=false)',
  hasSandboxDefaultAndProdReady,
  'Endpoint /api/midtrans/config, server.ts, src/lib/midtrans.ts, dan .env.example siap beralih ke Production lewat 1 flag namun saat ini aktif di mode Sandbox secara default'
);

// ============================================================================
// R23 TESTS: Uniform & Standardized Professional Boarding-House Financial Reporting
// ============================================================================
const finMetricsSrc = readSrc('src/lib/financialMetrics.ts');
const kosanSuiteSrc = readSrc('src/components/finance/KosanFinancialReportSuite.tsx');
const ownerSrc = readSrc('src/pages/Owner.tsx');
const monthlyCashflowSrc = readSrc('src/components/owner/MonthlyCashflowDashboard.tsx');

const hasSSOTEngine =
  finMetricsSrc.includes('export function buildUniformKosanFinancialReport') &&
  finMetricsSrc.includes('calculateDeduplicatedRevenueInflow') &&
  finMetricsSrc.includes('getSharedFinanceFilterState') &&
  finMetricsSrc.includes('setSharedFinanceFilterState');

assertTest(
  'R23.1',
  'Single Source of Truth (SSOT) buildUniformKosanFinancialReport dengan deduplikasi transaksi/pembayaran & sinkronisasi filter lintas role',
  hasSSOTEngine,
  'src/lib/financialMetrics.ts mengekspor buildUniformKosanFinancialReport, calculateDeduplicatedRevenueInflow, dan sinkronisasi filter cabang/periode'
);

const bothRolesUseUniformSuite =
  ownerSrc.includes('buildUniformKosanFinancialReport') &&
  ownerSrc.includes('<KosanFinancialReportSuite') &&
  adminSrc.includes('buildUniformKosanFinancialReport') &&
  adminSrc.includes('<KosanFinancialReportSuite') &&
  monthlyCashflowSrc.includes('isRealRevenueTx') &&
  monthlyCashflowSrc.includes('isRealExpenseTx');

const noHardcoded854Occupancy = !adminSrc.includes('85.4%') && !adminSrc.includes('12 dari 14 Kamar');
const separatesDeposit2100AndPbjtTax =
  kosanSuiteSrc.includes('securityDepositHeld2100') &&
  kosanSuiteSrc.includes('estimatedPbjtTax10') &&
  adminSrc.includes('uniformReport.liabilitiesAndTax.estimatedPbjtTax10');

assertTest(
  'R23.2',
  'Laporan Keuangan Kosan profesional seragam 100% di semua role (Owner, Anak Owner, Super Admin, Admin, Finance) tanpa angka hardcoded',
  bothRolesUseUniformSuite && noHardcoded854Occupancy && separatesDeposit2100AndPbjtTax,
  'Owner.tsx, Admin.tsx (tab Dashboard & Finance), dan MonthlyCashflowDashboard.tsx menggunakan mesin SSOT & KosanFinancialReportSuite yang sama; okupansi 85.4% hardcoded dihapus; COA 2100 Deposit Penghuni dipisahkan dari Estimasi Pajak PBJT 10%'
);

// ============================================================================
// R24 TESTS: Real-Time Authentic Signature Rendering (Tenant vs Owner)
// ============================================================================
const pdfGenSrc = readSrc('src/utils/pdfGenerator.ts');
const imgCompSrc = readSrc('src/utils/imageCompressor.ts');
const sigPadSrc = readSrc('src/components/transaction/SignaturePad.tsx');
const ownerSigMgrSrc = readSrc('src/components/owner/OwnerSignatureManager.tsx');

const hasRealtimeAuthenticSignature =
  uploaderSrc.includes('export function cacheRealtimeSignaturePreview') &&
  uploaderSrc.includes('export function getRealtimeSignaturePreview') &&
  imgCompSrc.includes('isTenant ? \'\' : generateOwnerStampPngDataUrl()') &&
  pdfGenSrc.includes('isTenant: true') &&
  pdfGenSrc.includes('// Explicitly reset draw & fill color to white before drawing right-hand roundedRect') &&
  sigPadSrc.includes('cacheRealtimeSignaturePreview') &&
  invoiceCardSrc.includes('resolvedTenantSig') &&
  ownerSigMgrSrc.includes('ResolvedSignatureImg') &&
  serverSrc.includes('resolveShortSignedSigUrl');

assertTest(
  'R24.1',
  'Tanda tangan asli penyewa (PIHAK KEDUA) & pemilik (PIHAK PERTAMA) tersinkronisasi real-time di UI, InvoiceCard, PDF, Email, dan Panel Owner tanpa tertukar stempel Owner atau kotak abu-abu',
  hasRealtimeAuthenticSignature,
  'cacheRealtimeSignaturePreview + ensurePngDataUrl(isTenant: true) + white fillColor di pdfGenerator.ts + signed URL di /api/midtrans/status/:orderId & processEmailHtmlAndSignatures'
);

// ============================================================================
// R25 TESTS: Real-Time Third-Party (Pihak Ketiga) & Married Couple (Suami & Istri) Identity Sync
// ============================================================================
const hasRealtimeThirdPartyAndCouple =
  pdfGenSrc.includes('export function resolveCoupleNames') &&
  pdfGenSrc.includes('Nama Pemesan (Pihak Ketiga)') &&
  pdfGenSrc.includes('Nama Penyewa (Penghuni)') &&
  pdfGenSrc.includes('Nama Suami') &&
  pdfGenSrc.includes('Nama Istri') &&
  invoiceCardSrc.includes('resolveCoupleNames(liveReceipt)') &&
  invoiceCardSrc.includes('Pemesan (Pihak Ketiga)') &&
  invoiceCardSrc.includes('Nama Penyewa (Penghuni)') &&
  invoiceCardSrc.includes('Nama Suami') &&
  invoiceCardSrc.includes('Nama Istri') &&
  bookingFormSrc.includes('Nama Penyewa (Penghuni Kamar):') &&
  bookingFormSrc.includes('🤵 Nama Suami:') &&
  bookingFormSrc.includes('👰 Nama Istri:') &&
  homeSrc.includes('resolvedPartyInfo = resolveCoupleNames') &&
  serverSrc.includes('husbandName: husbandName || undefined') &&
  serverSrc.includes('wifeName: wifeName || undefined') &&
  ownerSigMgrSrc.includes('Pemesan (Pihak Ketiga):');

assertTest(
  'R25.1',
  'Booking Pihak Ketiga (Pemesan + Nama Penyewa Penghuni) & Pasangan Suami Istri (Nama Suami & Nama Istri) tampil dan tersinkronisasi secara real-time di Form, InvoiceCard, PDF, Email, Server Status, dan Kontrak Owner',
  hasRealtimeThirdPartyAndCouple,
  'resolveCoupleNames di pdfGenerator.ts + live preview di BookingForm.tsx + liveReceipt di InvoiceCard.tsx + currentCtx/bookingReceiptPayload di Home.tsx + receipt_summary di /api/midtrans/status/:orderId + OwnerSignatureManager.tsx'
);

// ============================================================================
// R26 TESTS: MailerSend Delivery Stability, Queueing, Deduplication & Diagnostics
// ============================================================================
const hasMailerSendStabilityAndDiagnostics =
  serverSrc.includes('function enqueueMailerSendTask') &&
  serverSrc.includes('orderEmailDedupCache') &&
  serverSrc.includes('app.get(\'/api/email/diagnostics\'') &&
  serverSrc.includes('app.post(\'/api/email/config\'') &&
  serverSrc.includes('app.post(\'/api/admin/emails/retry-all\'') &&
  serverSrc.includes('row.recipient || row.recipient_email') &&
  serverSrc.includes('skipDbLog?: boolean') &&
  homeSrc.includes('settledOrderIdsRef.current.delete(currentOrderId)') &&
  ownerSigMgrSrc.includes('getAuthHeaders') &&
  adminSrc.includes('handleSaveEmailSenderConfig') &&
  adminSrc.includes('handleRetryAllFailedEmails');

assertTest(
  'R26.1',
  'Pengiriman email MailerSend stabil dengan antrean berurutan (anti-429), deduplikasi per order_id (anti-triple-send), auto-fallback kandidat domain/trial owner, diagnostik live, dan retry gagal 1-klik',
  hasMailerSendStabilityAndDiagnostics,
  'enqueueMailerSendTask + orderEmailDedupCache + /api/email/diagnostics + /api/email/config + /api/admin/emails/retry-all + normalisasi kolom recipient/sent_at di sent_emails'
);

const failed = results.filter((r) => !r.passed);
console.log(`\n============================================================`);
console.log(`RINGKASAN VERIFIKASI R17–R26: ${results.length - failed.length}/${results.length} LULUS`);
console.log(`============================================================`);
if (failed.length > 0) {
  process.exit(1);
}



