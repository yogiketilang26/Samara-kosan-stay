-- Migration: 016_restrict_financial_rpc.sql
-- Description: Restricts execution of post_financial_transaction() to service_role only.

REVOKE EXECUTE ON FUNCTION post_financial_transaction(
  VARCHAR(50), DATE, VARCHAR(100), TEXT, NUMERIC(15,2), VARCHAR(50), VARCHAR(50), VARCHAR(50), VARCHAR(100), INT, INT
) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION post_financial_transaction(
  VARCHAR(50), DATE, VARCHAR(100), TEXT, NUMERIC(15,2), VARCHAR(50), VARCHAR(50), VARCHAR(50), VARCHAR(100), INT, INT
) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION post_financial_transaction(
  VARCHAR(50), DATE, VARCHAR(100), TEXT, NUMERIC(15,2), VARCHAR(50), VARCHAR(50), VARCHAR(50), VARCHAR(100), INT, INT
) TO service_role;

-- ⚠️ ACTION REQUIRED: Run this SQL in the Supabase SQL Editor if needed:
/*
REVOKE EXECUTE ON FUNCTION post_financial_transaction(
  VARCHAR(50), DATE, VARCHAR(100), TEXT, NUMERIC(15,2), VARCHAR(50), VARCHAR(50), VARCHAR(50), VARCHAR(100), INT, INT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION post_financial_transaction(
  VARCHAR(50), DATE, VARCHAR(100), TEXT, NUMERIC(15,2), VARCHAR(50), VARCHAR(50), VARCHAR(50), VARCHAR(100), INT, INT
) TO service_role;
*/
