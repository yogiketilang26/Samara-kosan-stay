-- Migration: 017_atomic_booking_settlement.sql
-- Description: Creates stored function settle_booking_payment() to atomically execute booking approval,
-- room status update, tenant creation, and payment invoice creation inside a single database transaction.

CREATE OR REPLACE FUNCTION settle_booking_payment(
  p_booking_id BIGINT,
  p_order_id VARCHAR(100),
  p_payment_type VARCHAR(100),
  p_transaction_id VARCHAR(100)
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking RECORD;
  v_initials VARCHAR(10);
  v_invoice_id VARCHAR(50);
  v_result JSONB;
BEGIN
  -- 1. Lock and fetch booking record
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking record not found');
  END IF;

  IF v_booking.status = 'approved' THEN
    RETURN jsonb_build_object('success', true, 'already_approved', true, 'message', 'Booking already approved');
  END IF;

  -- 2. Update booking status
  UPDATE bookings
  SET status = 'approved',
      payment_method = COALESCE(p_payment_type, 'Midtrans SNAP')
  WHERE id = p_booking_id;

  -- 3. Update room status to occupied if room_id exists
  IF v_booking.room_id IS NOT NULL THEN
    UPDATE rooms
    SET status = 'occupied',
        current_tenant_name = v_booking.tenant_name
    WHERE id = v_booking.room_id;
  END IF;

  -- 4. Create tenant record
  v_initials := UPPER(SUBSTRING(COALESCE(v_booking.tenant_name, 'TM') FROM 1 FOR 2));

  INSERT INTO tenants (
    full_name,
    phone,
    email,
    avatar_initials,
    avatar_color,
    property_id,
    room_number,
    start_date,
    duration_months,
    payment_status
  ) VALUES (
    v_booking.tenant_name,
    v_booking.phone,
    COALESCE(v_booking.email, ''),
    v_initials,
    'bg-indigo-600',
    v_booking.property_id,
    v_booking.room_number,
    COALESCE(v_booking.check_in_date, CURRENT_DATE),
    COALESCE(v_booking.duration_months, 1),
    'paid'
  );

  -- 5. Create payment invoice record
  v_invoice_id := 'INV-' || FLOOR(1000 + RANDOM() * 9000)::TEXT;

  INSERT INTO payments (
    id,
    tenant_name,
    property_id,
    amount,
    method,
    status,
    payment_date,
    midtrans_order_id,
    transaction_id
  ) VALUES (
    v_invoice_id,
    v_booking.tenant_name,
    v_booking.property_id,
    v_booking.total_price,
    COALESCE(p_payment_type, 'Midtrans'),
    'paid',
    CURRENT_DATE,
    p_order_id,
    COALESCE(p_transaction_id, 'mid-tr-' || FLOOR(100000 + RANDOM() * 900000)::TEXT)
  );

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'invoice_id', v_invoice_id,
    'message', 'Booking payment settled successfully'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'code', SQLSTATE
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION settle_booking_payment(BIGINT, VARCHAR(100), VARCHAR(100), VARCHAR(100)) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION settle_booking_payment(BIGINT, VARCHAR(100), VARCHAR(100), VARCHAR(100)) TO service_role;

-- ⚠️ ACTION REQUIRED: Run this SQL in the Supabase SQL Editor if needed:
/*
CREATE OR REPLACE FUNCTION settle_booking_payment(
  p_booking_id BIGINT,
  p_order_id VARCHAR(100),
  p_payment_type VARCHAR(100),
  p_transaction_id VARCHAR(100)
) RETURNS JSONB
...
*/
