/**
 * R17 — Non-Destructive Legacy Base64 to Private Storage Migration Script
 *
 * Workflow:
 * 1. Scans database tables (`bookings`, `tenants`, `contracts`, `payments`, `maintenance`)
 *    for legacy columns containing inline `data:image/...;base64` or `data:application/pdf;base64`.
 * 2. Uploads each binary payload to its corresponding private Supabase Storage bucket
 *    (`tenant-documents`, `signatures`, `contracts`, `payment-proof`, `maintenance`).
 * 3. Verifies that the object exists in Storage by minting a short-lived signed URL (60s).
 * 4. Writes a full non-destructive audit manifest (`migration_base64_report.json`).
 * 5. ONLY replaces the database column with the canonical storage path (`bucket/path`)
 *    when the owner explicitly passes `--apply-owner-approved` on the command line.
 *
 * Usage:
 *   Dry-run / Copy & Verify only (Default, Non-Destructive):
 *     npx tsx scripts/migrate_base64_to_storage.ts
 *
 *   Apply column replacement after Owner review of migration_base64_report.json:
 *     npx tsx scripts/migrate_base64_to_storage.ts --apply-owner-approved
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

interface TargetColumnSpec {
  table: string;
  idColumn: string;
  column: string;
  bucket: 'tenant-documents' | 'signatures' | 'contracts' | 'payment-proof' | 'maintenance';
  prefix: string;
}

const TARGET_SPECS: TargetColumnSpec[] = [
  { table: 'bookings', idColumn: 'id', column: 'marriage_certificate_url', bucket: 'tenant-documents', prefix: 'legacy_booking_nikah' },
  { table: 'bookings', idColumn: 'id', column: 'signature_url', bucket: 'signatures', prefix: 'legacy_booking_sig' },
  { table: 'tenants', idColumn: 'id', column: 'marriage_certificate_url', bucket: 'tenant-documents', prefix: 'legacy_tenant_nikah' },
  { table: 'contracts', idColumn: 'id', column: 'signature_url', bucket: 'signatures', prefix: 'legacy_contract_sig' },
  { table: 'maintenance', idColumn: 'id', column: 'image_url', bucket: 'maintenance', prefix: 'legacy_maintenance_img' }
];

function parseDataUrl(dataUrl: string): { mimeType: string; ext: string; buffer: Buffer } | null {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null;
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return null;
  const header = dataUrl.slice(0, commaIdx);
  const b64 = dataUrl.slice(commaIdx + 1);
  const mimeMatch = header.match(/^data:([^;]+);base64$/i);
  const mimeType = mimeMatch ? mimeMatch[1].toLowerCase() : 'image/png';
  let ext = 'png';
  if (mimeType.includes('webp')) ext = 'webp';
  else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
  else if (mimeType.includes('pdf')) ext = 'pdf';
  return {
    mimeType,
    ext,
    buffer: Buffer.from(b64, 'base64')
  };
}

export async function runBase64Migration(applyOwnerApproved: boolean = false) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceKey) {
    console.error('[R17 MIGRATE] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
    process.exitCode = 1;
    return;
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const report: Array<{
    table: string;
    rowId: string | number;
    column: string;
    bucket: string;
    storagePath: string;
    bytes: number;
    verifiedInStorage: boolean;
    columnUpdated: boolean;
    error?: string;
  }> = [];

  console.log(`[R17 MIGRATE] Starting Base64 -> Private Storage migration (mode: ${applyOwnerApproved ? 'APPLY_OWNER_APPROVED' : 'COPY_AND_VERIFY_ONLY'})...`);

  for (const spec of TARGET_SPECS) {
    const { data: rows, error: selectErr } = await supabaseAdmin
      .from(spec.table)
      .select(`${spec.idColumn}, ${spec.column}`)
      .like(spec.column, 'data:%')
      .limit(500);

    if (selectErr) {
      console.warn(`[R17 MIGRATE] Skipping ${spec.table}.${spec.column} (${selectErr.message})`);
      continue;
    }

    for (const row of (rows || []) as any[]) {
      const rowId = row[spec.idColumn];
      const rawVal = String(row[spec.column] || '');
      const parsed = parseDataUrl(rawVal);
      if (!parsed) continue;

      const objectPath = `${spec.prefix}_${rowId}_${Date.now()}.${parsed.ext}`;
      const canonicalPath = `${spec.bucket}/${objectPath}`;

      // Step 1: Copy to Private Storage Bucket
      const { data: upData, error: upErr } = await supabaseAdmin.storage
        .from(spec.bucket)
        .upload(objectPath, parsed.buffer, {
          contentType: parsed.mimeType,
          upsert: true
        });

      if (upErr || !upData?.path) {
        report.push({
          table: spec.table,
          rowId,
          column: spec.column,
          bucket: spec.bucket,
          storagePath: canonicalPath,
          bytes: parsed.buffer.length,
          verifiedInStorage: false,
          columnUpdated: false,
          error: upErr?.message || 'Upload failed'
        });
        continue;
      }

      // Step 2: Verify object exists and can mint short-lived signed URL (60s)
      const { data: verifySign, error: signErr } = await supabaseAdmin.storage
        .from(spec.bucket)
        .createSignedUrl(upData.path, 60);

      const verified = Boolean(!signErr && verifySign?.signedUrl);
      let columnUpdated = false;
      let updateErrMsg: string | undefined = undefined;

      // Step 3: Only replace DB column if verified AND --apply-owner-approved flag is set
      if (verified && applyOwnerApproved) {
        const { error: updErr } = await supabaseAdmin
          .from(spec.table)
          .update({ [spec.column]: canonicalPath })
          .eq(spec.idColumn, rowId);

        if (updErr) {
          updateErrMsg = updErr.message;
        } else {
          columnUpdated = true;
        }
      }

      report.push({
        table: spec.table,
        rowId,
        column: spec.column,
        bucket: spec.bucket,
        storagePath: canonicalPath,
        bytes: parsed.buffer.length,
        verifiedInStorage: verified,
        columnUpdated,
        error: updateErrMsg || signErr?.message
      });
    }
  }

  const reportPath = path.join(process.cwd(), 'migration_base64_report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    mode: applyOwnerApproved ? 'APPLY_OWNER_APPROVED' : 'COPY_AND_VERIFY_ONLY',
    totalFound: report.length,
    totalVerified: report.filter(r => r.verifiedInStorage).length,
    totalUpdated: report.filter(r => r.columnUpdated).length,
    items: report
  }, null, 2));

  console.log(`[R17 MIGRATE] Completed. Report written to ${reportPath} (found: ${report.length}, verified: ${report.filter(r => r.verifiedInStorage).length}, updated: ${report.filter(r => r.columnUpdated).length}).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const applyApproved = process.argv.includes('--apply-owner-approved');
  runBase64Migration(applyApproved);
}
