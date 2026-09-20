-- ====================================================================
-- SAMARA STAY ERP — MIGRATION 046: ATOMIC ROOM HOLD & ANTI-CONCURRENCY RPC
-- ====================================================================
-- Description:
-- 1. Adds `hold_expires_at` column to public.bookings if not present.
-- 2. Creates index on (room_id, hold_expires_at) for efficient conflict checks.
-- 3. Implements `hold_room_atomic(p_room_id, p_booking_id, p_hold_minutes)`:
--    - Row-level lock (SELECT FOR UPDATE) on rooms table.
--    - Verifies room is not occupied.
--    - Checks for concurrent unexpired holds by other pending bookings.
--    - Atomically updates booking hold_expires_at.
-- 4. Implements `cleanup_expired_room_holds()` for housekeeping.
-- ====================================================================

-- 1. ADD COLUMN TO BOOKINGS TABLE
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS hold_expires_at TIMESTAMPTZ;

-- 2. CREATE INDEX FOR ROOM HOLD CONFLICT CHECK
CREATE INDEX IF NOT EXISTS idx_bookings_room_hold 
ON public.bookings(room_id, hold_expires_at) 
WHERE hold_expires_at IS NOT NULL;

-- 3. ATOMIC ROOM HOLD STORED FUNCTION
CREATE OR REPLACE FUNCTION hold_room_atomic(
  p_room_id BIGINT,
  p_booking_id BIGINT,
  p_hold_minutes INT DEFAULT 15
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room RECORD;
  v_conflicting_booking RECORD;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Validate input
  IF p_room_id IS NULL OR p_booking_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Parameter kamar atau booking tidak valid.'
    );
  END IF;

  -- 1. Lock room row exclusively to prevent race conditions
  SELECT id, status, room_number INTO v_room 
  FROM rooms 
  WHERE id = p_room_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Data kamar tidak ditemukan di database.'
    );
  END IF;

  -- 2. Verify room is not currently occupied
  IF v_room.status = 'occupied' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Kamar ' || COALESCE(v_room.room_number, '') || ' sudah terisi (Occupied).'
    );
  END IF;

  -- 3. Check for concurrent unexpired holds on this room by other bookings
  SELECT id, hold_expires_at INTO v_conflicting_booking
  FROM bookings
  WHERE room_id = p_room_id
    AND id <> p_booking_id
    AND status IN ('pending', 'pending_payment')
    AND hold_expires_at > NOW()
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Kamar ' || COALESCE(v_room.room_number, '') || ' sedang dalam proses pembayaran oleh penyewa lain. Silakan coba beberapa menit lagi.'
    );
  END IF;

  -- 4. Calculate hold expiry timestamp
  v_expires_at := NOW() + (GREATEST(1, LEAST(COALESCE(p_hold_minutes, 15), 60)) || ' minutes')::INTERVAL;

  -- 5. Atomically update booking hold timestamp
  UPDATE bookings
  SET hold_expires_at = v_expires_at
  WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Kamar berhasil dikunci sementara.',
    'hold_expires_at', v_expires_at
  );
END;
$$;

-- 4. CLEANUP EXPIRED ROOM HOLDS STORED FUNCTION
CREATE OR REPLACE FUNCTION cleanup_expired_room_holds() 
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE bookings
  SET hold_expires_at = NULL
  WHERE hold_expires_at IS NOT NULL
    AND hold_expires_at <= NOW()
    AND status IN ('pending', 'pending_payment');

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'cleared_count', v_count
  );
END;
$$;

-- 5. GRANT PERMISSIONS
REVOKE ALL ON FUNCTION hold_room_atomic(BIGINT, BIGINT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hold_room_atomic(BIGINT, BIGINT, INT) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION cleanup_expired_room_holds() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cleanup_expired_room_holds() TO authenticated, service_role;
