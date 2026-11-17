-- ============================================================================
-- MIGRATION 052: GO-LIVE REMEDIATION (R17, R18, R20, R21)
-- ============================================================================
-- Rules enforced:
--   * Forward-only & idempotent (safe to re-run).
--   * Zero destructive operations (NO DELETE, NO DROP TABLE/COLUMN, NO TRUNCATE).
--   * R17: Private buckets ('tenant-documents', 'signatures', 'contracts',
--          'payment-proof', 'maintenance') MUST have public = false.
--          Only 'property-images', 'room-images', 'avatars' may have public = true.
--          Prevent new Base64 data URLs from being stored in document columns.
--   * R18: Enforce hold_expires_at & hold_by_booking_id on rooms and bookings;
--          treat reserved rooms with expired hold_expires_at <= NOW() as available;
--          harden hold_room_atomic and cleanup_expired_room_holds.
--   * R20: Ensure sent_emails table supports retry tracking (retry_count, last_retry_at, html_body, text_body).
--   * R21: Allow 'needs_refund_review' and 'expired' statuses on bookings;
--          refuse settling a Midtrans booking if the room was manually marked 'occupied'
--          (e.g. from Airbnb) and mark the booking 'needs_refund_review' + log to activity_logs.
-- ============================================================================

-- ============================================================================
-- 1. R17: ENFORCE PRIVATE STORAGE BUCKETS (public = false)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('property-images', 'property-images', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('room-images', 'room-images', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('tenant-documents', 'tenant-documents', false, 15728640, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('payment-proof', 'payment-proof', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('contracts', 'contracts', false, 15728640, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('signatures', 'signatures', false, 5242880, ARRAY['image/png', 'image/webp', 'image/jpeg', 'image/svg+xml']),
  ('maintenance', 'maintenance', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Non-destructive NOT VALID check constraints preventing new Base64 strings in document columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_bookings_no_base64_docs'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT chk_bookings_no_base64_docs
      CHECK (
        COALESCE(marriage_certificate_url, '') NOT LIKE 'data:%'
        AND COALESCE(signature_url, '') NOT LIKE 'data:%'
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_tenants_no_base64_docs'
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT chk_tenants_no_base64_docs
      CHECK (
        COALESCE(marriage_certificate_url, '') NOT LIKE 'data:%'
      ) NOT VALID;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Non-fatal notice adding Base64 check constraints: %', SQLERRM;
END $$;

-- ============================================================================
-- 2. R18 & R21: ROOM HOLD COLUMNS & BOOKING STATUS CONSTRAINT (needs_refund_review)
-- ============================================================================
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS hold_expires_at TIMESTAMPTZ;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS hold_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hold_by_booking_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_bookings_hold_expires_at
  ON public.bookings (room_id, status, hold_expires_at);

CREATE INDEX IF NOT EXISTS idx_rooms_hold_expires_at
  ON public.rooms (status, hold_expires_at);

-- Ensure bookings status check constraint (if any exists) permits 'needs_refund_review' and 'expired'
DO $$
DECLARE
  v_conname TEXT;
BEGIN
  FOR v_conname IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.relname = 'bookings'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS %I', v_conname);
  END LOOP;

  ALTER TABLE public.bookings
    ADD CONSTRAINT bookings_status_check
    CHECK (status IN (
      'pending',
      'pending_payment',
      'approved',
      'rejected',
      'cancelled',
      'expired',
      'needs_refund_review',
      'completed'
    )) NOT VALID;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Notice updating bookings_status_check: %', SQLERRM;
END $$;

-- ============================================================================
-- 3. R18: ATOMIC ROOM HOLD & EXPIRED HOLD CLEANUP FUNCTIONS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.hold_room_atomic(
  p_room_id BIGINT,
  p_booking_id BIGINT,
  p_hold_minutes INT DEFAULT 15
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room RECORD;
  v_active_hold RECORD;
  v_expires_at TIMESTAMPTZ;
  v_effective_minutes INT;
BEGIN
  v_effective_minutes := GREATEST(1, LEAST(COALESCE(p_hold_minutes, 15), 120));
  v_expires_at := NOW() + (v_effective_minutes || ' minutes')::INTERVAL;

  -- 1. Lock the target room row to serialize concurrent checkout attempts
  SELECT * INTO v_room
  FROM public.rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Data kamar tidak ditemukan.'
    );
  END IF;

  -- 2. Reject if room is already occupied
  IF v_room.status = 'occupied' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', format('Kamar %s sudah terisi (Occupied).', COALESCE(v_room.room_number, p_room_id::TEXT))
    );
  END IF;

  -- 3. If room is 'reserved' by another booking whose hold has NOT expired yet, reject
  IF v_room.status = 'reserved'
     AND v_room.hold_by_booking_id IS NOT NULL
     AND v_room.hold_by_booking_id <> p_booking_id
     AND v_room.hold_expires_at IS NOT NULL
     AND v_room.hold_expires_at > NOW() THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', format('Kamar %s sedang dalam proses pembayaran oleh pemesan lain hingga %s.',
        COALESCE(v_room.room_number, p_room_id::TEXT),
        to_char(v_room.hold_expires_at AT TIME ZONE 'Asia/Jakarta', 'HH24:MI WIB'))
    );
  END IF;

  -- 4. Also check bookings table for any non-expired active hold on the same room
  SELECT id, tenant_name, hold_expires_at
  INTO v_active_hold
  FROM public.bookings
  WHERE room_id = p_room_id
    AND id <> p_booking_id
    AND status IN ('pending', 'pending_payment')
    AND hold_expires_at IS NOT NULL
    AND hold_expires_at > NOW()
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', format('Kamar %s sedang dalam proses pembayaran oleh pemesan lain hingga %s.',
        COALESCE(v_room.room_number, p_room_id::TEXT),
        to_char(v_active_hold.hold_expires_at AT TIME ZONE 'Asia/Jakarta', 'HH24:MI WIB'))
    );
  END IF;

  -- 5. Stamp hold expiration on both bookings and rooms
  UPDATE public.bookings
  SET hold_expires_at = v_expires_at,
      room_id = COALESCE(room_id, p_room_id)
  WHERE id = p_booking_id;

  UPDATE public.rooms
  SET status = 'reserved',
      hold_expires_at = v_expires_at,
      hold_by_booking_id = p_booking_id
  WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Kamar berhasil dikunci sementara untuk sesi pembayaran Anda.',
    'room_id', p_room_id,
    'booking_id', p_booking_id,
    'hold_expires_at', v_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_room_holds()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_released_count INT := 0;
  v_rooms_freed INT := 0;
  v_prop_id BIGINT;
BEGIN
  -- 1. Mark expired pending bookings as 'expired'
  WITH expired_bookings AS (
    UPDATE public.bookings
    SET status = 'expired'
    WHERE status IN ('pending', 'pending_payment')
      AND hold_expires_at IS NOT NULL
      AND hold_expires_at <= NOW()
    RETURNING id, room_id, property_id
  )
  SELECT COUNT(*) INTO v_released_count FROM expired_bookings;

  -- 2. Free any 'reserved' room whose hold_expires_at has passed AND has no approved/active occupant
  WITH freed_rooms AS (
    UPDATE public.rooms r
    SET status = 'available',
        current_tenant_name = NULL,
        hold_expires_at = NULL,
        hold_by_booking_id = NULL
    WHERE r.status = 'reserved'
      AND (
        (r.hold_expires_at IS NOT NULL AND r.hold_expires_at <= NOW())
        OR (
          r.hold_by_booking_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.bookings b
            WHERE b.id = r.hold_by_booking_id
              AND b.status IN ('expired', 'rejected', 'cancelled')
          )
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.bookings b2
        WHERE b2.room_id = r.id
          AND b2.status IN ('pending', 'pending_payment')
          AND b2.hold_expires_at IS NOT NULL
          AND b2.hold_expires_at > NOW()
      )
    RETURNING r.id, r.property_id
  )
  SELECT COUNT(*) INTO v_rooms_freed FROM freed_rooms;

  -- 3. Recalculate available_rooms on properties if any room was freed
  IF v_rooms_freed > 0 THEN
    FOR v_prop_id IN SELECT DISTINCT id FROM public.properties LOOP
      UPDATE public.properties p
      SET available_rooms = (
        SELECT COUNT(*)
        FROM public.rooms rm
        WHERE rm.property_id = p.id
          AND (
            rm.status = 'available'
            OR rm.status IS NULL
            OR (rm.status = 'reserved' AND rm.hold_expires_at IS NOT NULL AND rm.hold_expires_at <= NOW())
          )
      )
      WHERE p.id = v_prop_id;
    END LOOP;
  END IF;

  RETURN v_released_count + v_rooms_freed;
END;
$$;

-- ============================================================================
-- 4. R20: SENT_EMAILS RETRY COLUMNS FOR ADMIN EMAIL RETRY PANEL
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.sent_emails (
  id BIGSERIAL PRIMARY KEY,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sent_emails
  ADD COLUMN IF NOT EXISTS html_body TEXT,
  ADD COLUMN IF NOT EXISTS text_body TEXT,
  ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS order_id TEXT;

-- ============================================================================
-- 5. R21: SETTLE_BOOKING_PAYMENT WITH AIRBNB / MANUAL OCCUPIED GUARD
-- ============================================================================
CREATE OR REPLACE FUNCTION public.settle_booking_payment(
  p_midtrans_order_id TEXT,
  p_payment_method TEXT DEFAULT 'Midtrans SNAP',
  p_midtrans_transaction_id TEXT DEFAULT NULL,
  p_gross_amount NUMERIC DEFAULT NULL,
  p_fee_amount NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking RECORD;
  v_room RECORD;
  v_invoice_id TEXT;
  v_existing_payment RECORD;
  v_effective_name TEXT;
  v_effective_phone TEXT;
  v_effective_email TEXT;
  v_effective_nik TEXT;
  v_start_date DATE;
  v_duration INT;
  v_amount NUMERIC;
  v_fee NUMERIC;
  v_trx_id TEXT;
  v_existing_tenant_id BIGINT;
  v_ft_res JSONB;
  v_fee_res JSONB;
BEGIN
  -- 1. Lock the booking row
  SELECT * INTO v_booking
  FROM public.bookings
  WHERE midtrans_order_id = p_midtrans_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Booking dengan Order ID %s tidak ditemukan', p_midtrans_order_id)
    );
  END IF;

  v_effective_name := COALESCE(NULLIF(TRIM(v_booking.occupant_name), ''), v_booking.tenant_name, 'Penghuni');
  v_amount := COALESCE(p_gross_amount, v_booking.total_price, 0);
  v_fee := COALESCE(p_fee_amount, 0);
  v_trx_id := COALESCE(NULLIF(TRIM(p_midtrans_transaction_id), ''), 'mid-' || p_midtrans_order_id);

  -- 2. Idempotency check: if already approved, return existing invoice
  IF v_booking.status = 'approved' THEN
    SELECT id INTO v_invoice_id
    FROM public.payments
    WHERE midtrans_order_id = p_midtrans_order_id AND status = 'paid'
    LIMIT 1;

    RETURN jsonb_build_object(
      'success', true,
      'already_settled', true,
      'booking_id', v_booking.id,
      'invoice_id', COALESCE(v_invoice_id, 'INV-' || v_booking.id)
    );
  END IF;

  -- 3. Lock target room & R21 check: if room was manually marked 'occupied' (e.g. Airbnb),
  --    refuse settlement, mark booking as 'needs_refund_review', and log to activity_logs!
  IF v_booking.room_id IS NOT NULL THEN
    SELECT * INTO v_room
    FROM public.rooms
    WHERE id = v_booking.room_id
    FOR UPDATE;

    IF FOUND AND v_room.status = 'occupied'
       AND COALESCE(v_room.hold_by_booking_id, -1) <> v_booking.id
       AND LOWER(COALESCE(v_room.current_tenant_name, '')) <> LOWER(v_effective_name) THEN

      UPDATE public.bookings
      SET status = 'needs_refund_review',
          payment_method = COALESCE(p_payment_method, payment_method, 'Midtrans SNAP')
      WHERE id = v_booking.id;

      INSERT INTO public.activity_logs (admin_name, action, detail, ip_address)
      VALUES (
        'Midtrans Settlement Guard (R21)',
        'DOUBLE_BOOKING_REFUND_REVIEW',
        format('Kamar %s sudah Terisi (%s / Airbnb) saat pembayaran Order %s masuk. Booking #%s ditandai needs_refund_review.',
          COALESCE(v_room.room_number, v_booking.room_id::TEXT),
          COALESCE(v_room.current_tenant_name, 'Manual/Airbnb'),
          p_midtrans_order_id,
          v_booking.id),
        '127.0.0.1'
      );

      RETURN jsonb_build_object(
        'success', false,
        'needs_refund_review', true,
        'status', 'needs_refund_review',
        'booking_id', v_booking.id,
        'error', format('Kamar %s sudah ditandai Terisi (Occupied). Booking ditandai needs_refund_review untuk peninjauan refund.', COALESCE(v_room.room_number, v_booking.room_id::TEXT))
      );
    END IF;
  END IF;

  -- 4. Approve booking and occupy room
  UPDATE public.bookings
  SET status = 'approved',
      payment_method = COALESCE(p_payment_method, payment_method, 'Midtrans SNAP')
  WHERE id = v_booking.id;

  IF v_booking.room_id IS NOT NULL THEN
    UPDATE public.rooms
    SET status = 'occupied',
        current_tenant_name = v_effective_name,
        hold_expires_at = NULL,
        hold_by_booking_id = v_booking.id
    WHERE id = v_booking.room_id;
  END IF;

  -- 5. Upsert tenant for monthly bookings
  IF COALESCE(v_booking.booking_type, 'monthly') <> 'daily' THEN
    v_start_date := COALESCE(v_booking.check_in_date, v_booking.booking_date, CURRENT_DATE);
    v_duration := GREATEST(1, COALESCE(v_booking.duration_months, 1));
    v_effective_phone := CASE WHEN v_booking.is_for_other AND v_booking.occupant_phone IS NOT NULL THEN v_booking.occupant_phone ELSE v_booking.phone END;
    v_effective_email := CASE WHEN v_booking.is_for_other AND v_booking.occupant_email IS NOT NULL THEN v_booking.occupant_email ELSE COALESCE(v_booking.email, '') END;
    v_effective_nik := CASE WHEN v_booking.is_for_other AND v_booking.occupant_nik IS NOT NULL THEN v_booking.occupant_nik ELSE COALESCE(v_booking.nik, '') END;

    SELECT id INTO v_existing_tenant_id
    FROM public.tenants
    WHERE property_id = v_booking.property_id
      AND room_number = v_booking.room_number
      AND LOWER(full_name) = LOWER(v_effective_name)
    LIMIT 1;

    IF v_existing_tenant_id IS NOT NULL THEN
      UPDATE public.tenants
      SET payment_status = 'paid',
          status = 'active',
          start_date = v_start_date,
          duration_months = v_duration,
          phone = v_effective_phone,
          email = v_effective_email,
          nik = v_effective_nik
      WHERE id = v_existing_tenant_id;
    ELSE
      INSERT INTO public.tenants (
        full_name, phone, email, nik, avatar_initials, avatar_color,
        property_id, room_number, start_date, duration_months,
        payment_status, status, is_married, marriage_certificate_url,
        spouse_name, spouse_nik, spouse_phone, spouse_relation
      ) VALUES (
        v_effective_name, v_effective_phone, v_effective_email, v_effective_nik,
        UPPER(LEFT(TRIM(v_effective_name), 2)), 'bg-indigo-600',
        v_booking.property_id, v_booking.room_number, v_start_date, v_duration,
        'paid', 'active', COALESCE(v_booking.is_married, false), v_booking.marriage_certificate_url,
        v_booking.spouse_name, v_booking.spouse_nik, v_booking.spouse_phone, v_booking.spouse_relation
      );
    END IF;
  END IF;

  -- 6. Upsert payment row
  SELECT * INTO v_existing_payment
  FROM public.payments
  WHERE midtrans_order_id = p_midtrans_order_id
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    v_invoice_id := v_existing_payment.id;
    UPDATE public.payments
    SET status = 'paid',
        amount = v_amount,
        method = COALESCE(p_payment_method, 'Midtrans SNAP'),
        transaction_id = v_trx_id,
        payment_date = CURRENT_DATE
    WHERE id = v_invoice_id;
  ELSE
    v_invoice_id := 'INV-' || v_booking.id || '-' || EXTRACT(EPOCH FROM NOW())::BIGINT;
    INSERT INTO public.payments (
      id, tenant_name, property_id, amount, method, status,
      payment_date, midtrans_order_id, transaction_id
    ) VALUES (
      v_invoice_id, v_effective_name, v_booking.property_id, v_amount,
      COALESCE(p_payment_method, 'Midtrans SNAP'), 'paid',
      CURRENT_DATE, p_midtrans_order_id, v_trx_id
    );
  END IF;

  -- 7. Post double-entry financial transaction (Dr 1200 Piutang Midtrans / Cr 4000 Pendapatan Sewa)
  IF v_amount > 0 THEN
    v_ft_res := public.post_financial_transaction(
      'TRX-BOOK-' || v_booking.id,
      CURRENT_DATE,
      'Penerimaan Sewa',
      format('[AUTO-SETTLE] Pelunasan Sewa %s Unit %s (%s)', v_effective_name, COALESCE(v_booking.room_number, '-'), p_midtrans_order_id),
      v_amount,
      'income',
      'payment',
      v_invoice_id,
      'Midtrans Auto Settlement',
      1200,
      4000,
      COALESCE(v_booking.property_id, 1)
    );

    IF v_ft_res IS NULL OR COALESCE((v_ft_res->>'success')::BOOLEAN, false) = false THEN
      RAISE EXCEPTION 'Ledger posting failed for order %: %', p_midtrans_order_id, COALESCE(v_ft_res->>'error', 'unknown');
    END IF;
  END IF;

  -- 8. Post gateway fee if > 0 (Dr 5030 Beban Biaya Admin / Cr 1200 Piutang Midtrans)
  IF v_fee > 0 THEN
    v_fee_res := public.post_financial_transaction(
      'TRX-FEE-' || v_booking.id,
      CURRENT_DATE,
      'Biaya Admin Payment Gateway',
      format('[GATEWAY FEE] Potongan MDR Midtrans Order %s', p_midtrans_order_id),
      v_fee,
      'expense',
      'payment_fee',
      v_invoice_id,
      'Midtrans Auto Settlement',
      5030,
      1200,
      COALESCE(v_booking.property_id, 1)
    );

    IF v_fee_res IS NULL OR COALESCE((v_fee_res->>'success')::BOOLEAN, false) = false THEN
      RAISE EXCEPTION 'Gateway fee ledger posting failed for order %: %', p_midtrans_order_id, COALESCE(v_fee_res->>'error', 'unknown');
    END IF;
  END IF;

  -- 9. Update property available_rooms counter
  IF v_booking.property_id IS NOT NULL THEN
    UPDATE public.properties p
    SET available_rooms = (
      SELECT COUNT(*)
      FROM public.rooms rm
      WHERE rm.property_id = p.id
        AND (rm.status = 'available' OR rm.status IS NULL)
    )
    WHERE p.id = v_booking.property_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_booking.id,
    'invoice_id', v_invoice_id,
    'room_id', v_booking.room_id
  );
END;
$$;
