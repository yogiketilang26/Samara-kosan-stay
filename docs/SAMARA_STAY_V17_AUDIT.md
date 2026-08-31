# SAMARA STAY ERP v17 — SECURITY & ATOMIC HARDENING AUDIT REPORT

**Project:** Samara Stay ERP (Vite + React 19 + TypeScript + Express + Supabase + Midtrans + MailerSend)  
**Audit Version:** v17.0 (Hardening & Forensic Verification)  
**Date:** August 2026  
**Auditor:** Senior Security Engineer & Production SaaS Architect

---

## 1. EXECUTIVE SUMMARY

An end-to-end security and forensic audit was conducted on the Samara Stay codebase to eliminate credential leakage, prevent privilege escalation via loose string comparisons, ensure atomic database side-effects for booking approvals, and enforce strict property-level access segregation across all administrative and accounting endpoints.

All objectives have been successfully implemented and verified with zero TypeScript compilation errors (`tsc --noEmit`).

---

## 2. KEY HARDENING IMPLEMENTATIONS

### Priority 0: Credential Sanitization
- **Issue:** `.env.example` contained a live/hardcoded `SUPABASE_SERVICE_ROLE_KEY`.
- **Remediation:** Sanitized `.env.example` to use the standard placeholder `SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY_HERE"`. Verified that no actual secrets or service keys remain committed in the repository.

### Priority 1: RBAC Hardening & Exact Email Matching
- **Issue:** `getOrMigrateUserProfile`, `/api/auth/login`, and `/api/auth/register` previously used substring checks like `email.includes('owner')` or `email.includes('superadmin')`, allowing unauthorized users (e.g. `fakeowner@gmail.com`) to elevate their roles.
- **Remediation:**
  - Removed all `.includes()` substring matching for role detection.
  - Implemented `isSuperAdminEmail(email)` and `isOwnerEmail(email)` helper functions that perform **exact case-insensitive matching** against configured environment whitelists (`SUPER_ADMIN_EMAILS`, `SUPER_ADMIN_EMAIL`, `OWNER_EMAILS`, `OWNER_EMAIL`).
  - Added strict property-level validation via `checkPropertyAccess(authProfile, propertyId)` to ensure staff and branch managers cannot access or modify unauthorized properties.
  - Injected `property_id` into `req.authProfile` inside `requireAdminAuth` to enforce tenant/property isolation across Express route handlers.

### Priority 2: Atomic Manual Booking Settlement & Idempotency
- **Issue:** Manual booking approvals had non-atomic side-effects across booking status, room occupancy, tenant upserts, invoice generation, and double-entry general ledger posting.
- **Remediation:**
  - Created migration `supabase/migrations/034_harden_rbac_and_atomic_booking_settlement.sql` with PostgreSQL stored procedure `settle_manual_booking_approval(p_booking_id, p_payment_method, p_created_by)`.
  - Used `SELECT ... FOR UPDATE` row-level locks on `bookings` to prevent race conditions during concurrent approval clicks.
  - Enforced idempotency: if the booking is already approved, returns the existing state immediately without duplicating invoices or ledger entries.
  - Refactored `POST /api/admin/booking/approve` in `server.ts` to call `settle_manual_booking_approval` with a complete server-side transactional fallback that handles COA debit/credit balances and logs any ledger failures to `failed_ledger_postings`.
  - Dispatched transactional invoice emails asynchronously in the background via MailerSend.

### Priority 3: Property-Level Access Segregation in Administrative RPCs & Routes
- **Issue:** Endpoints like `/api/admin/financial-transaction/post`, `/api/admin/contract-extension/settle`, and bank reconciliation auto-matching lacked explicit property scoping for staff users.
- **Remediation:**
  - Enforced `checkPropertyAccess` on `POST /api/admin/financial-transaction/post` and `POST /api/admin/contract-extension/settle`.
  - Scoped `POST /api/admin/reconciliation/auto-match`, `POST /api/admin/reconciliation/match`, and `POST /api/admin/reconciliation/adjust` to verify property access for the clearing and statement transactions.
  - Restricted global Chart of Accounts and Accounting Integrity repair endpoints (`/api/admin/accounting/diagnostic-coa/repair`, `/api/admin/accounting/integrity-audit/repair`) to Super Admin and Finance Managers, rejecting staff requests with HTTP 403.

---

## 3. VERIFICATION & VALIDATION

1. **TypeScript Type Safety Check:** Ran `npm run lint` (`tsc --noEmit`). Verified 0 errors.
2. **Build Verification:** Tested application build output with `npm run build`. Verified clean compilation.
3. **Environment Checks:** Verified dynamic `PORT` support from environment variables with fallback to 3000.

---

## 4. DEPLOYMENT CHECKLIST

- [x] Run migration `supabase/migrations/034_harden_rbac_and_atomic_booking_settlement.sql` in production Supabase SQL Editor.
- [x] Ensure `SUPER_ADMIN_EMAILS` and `OWNER_EMAILS` environment variables are populated in production server settings.
- [x] Ensure `SUPABASE_SERVICE_ROLE_KEY` is configured exclusively in server environment variables and never exposed to the client bundle.
