-- ====================================================================
-- SAMARA STAY ERP — MIGRATION 033: ATOMIC IDEMPOTENT BOOKING APPROVAL RPC
-- ====================================================================
-- Description: Creates stored function approve_booking_atomic() to provide
-- an atomic, race-condition-proof idempotency guard for manual/admin booking approvals.
--
-- Key Behaviors:
-- 1. Uses SELECT ... FOR UPDATE to acquire an exclusive row-level lock on the booking record.
-- 2. Checks if the booking has already been transitioned to 'approved'.
--    If already approved, returns { success: true, already_approved: true } without running side-effects.
-- 3. If pending/unapproved, atomically updates bookings.status = 'approved' and rooms.status = 'occupied'.
-- 4. Returns JSON containing updated booking data for safe client-side continuation.

CREATE OR REPLACE FUNCTION approve_booking_atomic(
  p_booking_id BIGINT,
  p_payment_method VARCHAR(100) DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking RECORD;
BEGIN
  -- 1. Lock and fetch booking record with row-level lock
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'already_approved', false,
      'error', 'Booking record not found'
    );
  END IF;

  -- 2. Idempotency guard: If already approved, return immediately
  IF v_booking.status = 'approved' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_approved', true,
      'message', 'Booking is already approved',
      'booking', row_to_json(v_booking)
    );
  END IF;

  -- 3. Atomically update booking status to approved
  UPDATE bookings
  SET status = 'approved',
      payment_method = COALESCE(p_payment_method, payment_method, 'Transfer Manual')
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  -- 4. Update room status to occupied if room_id exists
  IF v_booking.room_id IS NOT NULL THEN
    UPDATE rooms
    SET status = 'occupied',
        current_tenant_name = COALESCE(v_booking.occupant_name, v_booking.tenant_name)
    WHERE id = v_booking.room_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'already_approved', false,
    'message', 'Booking approved successfully',
    'booking', row_to_json(v_booking)
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'already_approved', false,
    'error', SQLERRM,
    'code', SQLSTATE
  );
END;
$$;

-- Grant execution permissions (Restricted to service_role only for security)
REVOKE EXECUTE ON FUNCTION approve_booking_atomic(BIGINT, VARCHAR(100)) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION approve_booking_atomic(BIGINT, VARCHAR(100)) TO service_role;
