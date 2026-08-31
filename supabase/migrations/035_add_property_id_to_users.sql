-- ==============================================================================
-- SAMARA STAY ERP v18 — MIGRATION 035: ADD PROPERTY_ID TO USERS TABLE
-- ==============================================================================
-- Purpose: Enables fine-grained property assignment for Staff and Branch Finance users.
--          A NULL property_id grants global access (Super Admin / Owner).
--          A non-NULL property_id restricts the user's administrative operations
--          (approvals, transactions, reconciliation) strictly to the assigned property.
-- ==============================================================================

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS property_id BIGINT REFERENCES properties(id) ON DELETE SET NULL;

-- Create index for high-performance property filtering and joins
CREATE INDEX IF NOT EXISTS idx_users_property_id ON users(property_id);

COMMENT ON COLUMN users.property_id IS 'Assigned property ID for staff/branch users. NULL indicates global access (Super Admin / Owner).';
