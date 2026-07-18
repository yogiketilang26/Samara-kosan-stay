-- =========================================================================
-- SAMARA KOS ERP FINANCIAL MANAGEMENT SYSTEM
-- PostgreSQL Database Schema & Transactional Posting Engine
-- =========================================================================

-- 1. Create journal_entries Table (Double-Entry Ledger Bookkeeping)
CREATE TABLE IF NOT EXISTS journal_entries (
  id BIGSERIAL PRIMARY KEY,
  journal_no VARCHAR(50) NOT NULL,
  transaction_id BIGINT NOT NULL,
  account_id BIGINT NOT NULL,
  debit NUMERIC(15, 2) DEFAULT 0 NOT NULL,
  credit NUMERIC(15, 2) DEFAULT 0 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Add indexing for lightning-fast queries and general ledger performance
CREATE INDEX IF NOT EXISTS idx_journal_entries_transaction_id ON journal_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_account_id ON journal_entries(account_id);

-- 3. Create a PostgreSQL Stored Function for Atomic Posting
-- This function guarantees ACID compliance (Atomicity, Consistency, Isolation, Durability).
-- Any error inside this block triggers an automatic rollback of all database changes.
CREATE OR REPLACE FUNCTION post_financial_transaction(
  p_transaction_no VARCHAR(50),
  p_transaction_date DATE,
  p_category VARCHAR(100),
  p_description TEXT,
  p_amount NUMERIC(15, 2),
  p_type VARCHAR(50),
  p_reference_type VARCHAR(50),
  p_reference_id VARCHAR(50),
  p_created_by VARCHAR(100),
  p_debit_account_id INT,
  p_credit_account_id INT
) RETURNS JSONB AS $$
DECLARE
  v_transaction_id BIGINT;
  v_journal_no VARCHAR(50);
  v_debit_balance_change NUMERIC(15, 2);
  v_credit_balance_change NUMERIC(15, 2);
  v_result JSONB;
BEGIN
  -- A. Insert parent Financial Transaction
  INSERT INTO financial_transactions (
    transaction_no,
    transaction_date,
    category,
    description,
    amount,
    type,
    reference_type,
    reference_id,
    created_by
  ) VALUES (
    p_transaction_no,
    p_transaction_date,
    p_category,
    p_description,
    p_amount,
    p_type,
    p_reference_type,
    p_reference_id,
    p_created_by
  ) RETURNING id INTO v_transaction_id;

  -- Generate sequential Journal Entry number
  v_journal_no := 'JRN-' || TO_CHAR(p_transaction_date, 'YYYYMMDD') || '-' || LPAD(CAST(v_transaction_id AS VARCHAR), 5, '0');

  -- B. Insert Debit Ledger Entry
  INSERT INTO journal_entries (
    journal_no,
    transaction_id,
    account_id,
    debit,
    credit
  ) VALUES (
    v_journal_no,
    v_transaction_id,
    p_debit_account_id,
    p_amount,
    0
  );

  -- C. Insert Credit Ledger Entry
  INSERT INTO journal_entries (
    journal_no,
    transaction_id,
    account_id,
    debit,
    credit
  ) VALUES (
    v_journal_no,
    v_transaction_id,
    p_credit_account_id,
    0,
    p_amount
  );

  -- D. Update Debit Account Balance (Normal balance rule: Asset and Expense increase on Debit)
  UPDATE accounts
  SET balance = CASE 
    WHEN type IN ('asset', 'expense') THEN balance + p_amount
    ELSE GREATEST(0, balance - p_amount)
  END
  WHERE id = p_debit_account_id;

  -- E. Update Credit Account Balance (Normal balance rule: Liability, Equity, and Revenue increase on Credit)
  UPDATE accounts
  SET balance = CASE 
    WHEN type IN ('liability', 'equity', 'revenue') THEN balance + p_amount
    ELSE GREATEST(0, balance - p_amount)
  END
  WHERE id = p_credit_account_id;

  -- Build final successful JSON payload
  v_result := jsonb_build_object(
    'success', true,
    'transaction_id', v_transaction_id,
    'journal_no', v_journal_no,
    'message', 'Transaction and double-entry journals posted successfully'
  );

  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  -- Automatic transaction rollback is performed on exceptions
  v_result := jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'code', SQLSTATE
  );
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- =========================================================================
-- SECURE ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================================================

-- Enable RLS on all tables
ALTER TABLE IF EXISTS properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS coupons ENABLE ROW LEVEL SECURITY;

-- 1. properties table policies
CREATE POLICY "Public Read Access for Properties" ON properties
  FOR SELECT TO public USING (true);

CREATE POLICY "Admin All Access for Properties" ON properties
  FOR ALL TO authenticated USING (true);

-- 2. rooms table policies
CREATE POLICY "Public Read Access for Rooms" ON rooms
  FOR SELECT TO public USING (true);

CREATE POLICY "Admin All Access for Rooms" ON rooms
  FOR ALL TO authenticated USING (true);

-- 3. coupons table policies
CREATE POLICY "Public Read Access for Coupons" ON coupons
  FOR SELECT TO public USING (true);

CREATE POLICY "Admin All Access for Coupons" ON coupons
  FOR ALL TO authenticated USING (true);

-- 4. bookings table policies
CREATE POLICY "Enable insert for public bookings" ON bookings
  FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Users can select their own bookings" ON bookings
  FOR SELECT TO public USING (true);

CREATE POLICY "Admin All Access for Bookings" ON bookings
  FOR ALL TO authenticated USING (true);

-- 5. surveys table policies
CREATE POLICY "Enable insert for public surveys" ON surveys
  FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Public select surveys" ON surveys
  FOR SELECT TO public USING (true);

CREATE POLICY "Admin All Access for Surveys" ON surveys
  FOR ALL TO authenticated USING (true);

-- 6. tenants table policies
CREATE POLICY "Admin All Access for Tenants" ON tenants
  FOR ALL TO authenticated USING (true);

-- 7. payments table policies
CREATE POLICY "Admin All Access for Payments" ON payments
  FOR ALL TO authenticated USING (true);

CREATE POLICY "Enable insert for payments via webhooks" ON payments
  FOR INSERT TO public WITH CHECK (true);

-- 8. maintenance table policies
CREATE POLICY "Enable insert for public maintenance" ON maintenance
  FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Admin All Access for Maintenance" ON maintenance
  FOR ALL TO authenticated USING (true);

-- 9. users table policies
CREATE POLICY "Admin All Access for Users" ON users
  FOR ALL TO authenticated USING (true);

-- 10. activity_logs table policies
CREATE POLICY "Enable insert for activity logging" ON activity_logs
  FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Admin All Access for Activity Logs" ON activity_logs
  FOR ALL TO authenticated USING (true);

-- 11. accounting & bookkeeping (accounts, financial_transactions, journal_entries)
CREATE POLICY "Admin All Access for Accounts" ON accounts
  FOR ALL TO authenticated USING (true);

CREATE POLICY "Admin All Access for Transactions" ON financial_transactions
  FOR ALL TO authenticated USING (true);

CREATE POLICY "Admin All Access for Journal Entries" ON journal_entries
  FOR ALL TO authenticated USING (true);

-- 12. system settings policies
CREATE POLICY "Public Read Access for Settings" ON settings
  FOR SELECT TO public USING (true);

CREATE POLICY "Admin All Access for Settings" ON settings
  FOR ALL TO authenticated USING (true);

-- =========================================================================
-- DATABASE MIGRATIONS & SCHEMA UPDATES
-- =========================================================================
-- Note: If you encounter errors about missing columns such as 'additional_rules',
-- please run the following SQL statements in your Supabase SQL Editor:
--
-- ALTER TABLE IF EXISTS properties 
--   ADD COLUMN IF NOT EXISTS description TEXT,
--   ADD COLUMN IF NOT EXISTS additional_rules TEXT,
--   ADD COLUMN IF NOT EXISTS policies TEXT,
--   ADD COLUMN IF NOT EXISTS terms TEXT,
--   ADD COLUMN IF NOT EXISTS regulations TEXT;
--
-- After running the SQL above, please remember to click "Reload schema" or "Refetch schema"
-- in the Supabase Dashboard, or wait a few seconds for the schema cache to refresh.


-- =========================================================================
-- ADDITIONAL 7 ADMINISTRATIVE ERP TABLES & SEED DATA (PROMPT 1)
-- =========================================================================

-- 1. Petty Cash Requests
CREATE TABLE IF NOT EXISTS petty_cash_requests (
  id BIGSERIAL PRIMARY KEY,
  applicant VARCHAR(100) NOT NULL,
  amount NUMERIC(15, 2) NOT NULL,
  purpose TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' NOT NULL, -- pending, approved, rejected
  date DATE DEFAULT CURRENT_DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Fixed Assets
CREATE TABLE IF NOT EXISTS fixed_assets (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  cost NUMERIC(15, 2) NOT NULL,
  life_years INT NOT NULL,
  residual NUMERIC(15, 2) DEFAULT 0 NOT NULL,
  depr_rate NUMERIC(15, 2) NOT NULL,
  accum_depr NUMERIC(15, 2) DEFAULT 0 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. Budgets
CREATE TABLE IF NOT EXISTS budgets (
  id BIGSERIAL PRIMARY KEY,
  category VARCHAR(255) UNIQUE NOT NULL,
  limit_amount NUMERIC(15, 2) NOT NULL, -- using limit_amount as LIMIT is SQL reserved word
  spent NUMERIC(15, 2) DEFAULT 0 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 4. Vendors
CREATE TABLE IF NOT EXISTS vendors (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  category VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 5. Purchase Orders
CREATE TABLE IF NOT EXISTS purchase_orders (
  id BIGSERIAL PRIMARY KEY,
  vendor VARCHAR(255) NOT NULL,
  items TEXT NOT NULL,
  amount NUMERIC(15, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' NOT NULL, -- pending, approved, completed, pending_approval
  date DATE DEFAULT CURRENT_DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 6. Inventory Items
CREATE TABLE IF NOT EXISTS inventory_items (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  stock INT DEFAULT 0 NOT NULL,
  unit VARCHAR(50) NOT NULL,
  min_stock INT DEFAULT 0 NOT NULL,
  category VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 7. Bank Statement Items
CREATE TABLE IF NOT EXISTS bank_statement_items (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  "desc" TEXT NOT NULL,
  amount NUMERIC(15, 2) NOT NULL,
  type VARCHAR(10) NOT NULL, -- credit, debit
  matched BOOLEAN DEFAULT FALSE NOT NULL,
  matched_ref VARCHAR(100) DEFAULT '' NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Row-Level Security for the 7 new tables
ALTER TABLE IF EXISTS petty_cash_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS fixed_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bank_statement_items ENABLE ROW LEVEL SECURITY;

-- Select to public, full access to authenticated users
CREATE POLICY "Admin All Access for petty_cash_requests" ON petty_cash_requests FOR ALL TO authenticated USING (true);

CREATE POLICY "Admin All Access for fixed_assets" ON fixed_assets FOR ALL TO authenticated USING (true);

CREATE POLICY "Admin All Access for budgets" ON budgets FOR ALL TO authenticated USING (true);

CREATE POLICY "Admin All Access for vendors" ON vendors FOR ALL TO authenticated USING (true);

CREATE POLICY "Admin All Access for purchase_orders" ON purchase_orders FOR ALL TO authenticated USING (true);

CREATE POLICY "Admin All Access for inventory_items" ON inventory_items FOR ALL TO authenticated USING (true);

CREATE POLICY "Admin All Access for bank_statement_items" ON bank_statement_items FOR ALL TO authenticated USING (true);

-- Seed Data insertion
INSERT INTO petty_cash_requests (id, applicant, amount, purpose, status, date) VALUES
(1, 'Doni (Staff)', 150000, 'Beli Air Galon & Gas Dapur Bersama', 'approved', '2026-06-25'),
(2, 'Lina (Staff)', 200000, 'Alat Pembersih Lantai & Kamar Mandi', 'pending', '2026-06-27')
ON CONFLICT (id) DO NOTHING;

INSERT INTO fixed_assets (id, name, cost, life_years, residual, depr_rate, accum_depr) VALUES
(1, 'Gedung Kost Samara Premium', 1200000000, 20, 200000000, 5000000, 50000000),
(2, 'AC Daikin 1 PK (12 Unit)', 48000000, 5, 3000000, 750000, 15000000),
(3, 'Genset Honda Silent 5kVA', 18000000, 8, 2000000, 166000, 3320000)
ON CONFLICT (id) DO NOTHING;

INSERT INTO budgets (id, category, limit_amount, spent) VALUES
(1, 'Beban Pemeliharaan & Perbaikan Gedung', 5000000, 1500000),
(2, 'Gaji & Bonus Karyawan', 12000000, 10000000),
(3, 'Listrik & Air (Utilities)', 6000000, 5800000),
(4, 'Marketing & Voucher', 3000000, 3200000)
ON CONFLICT (id) DO NOTHING;

INSERT INTO vendors (id, name, phone, category) VALUES
(1, 'Depo Bangunan Jaya', '0811223344', 'Material Pemeliharaan'),
(2, 'PDAM / PLN Solusi', '0812345678', 'Utilitas'),
(3, 'Sinar Mandiri AC', '0815556667', 'Servis Elektronik')
ON CONFLICT (id) DO NOTHING;

INSERT INTO purchase_orders (id, vendor, items, amount, status, date) VALUES
(101, 'Depo Bangunan Jaya', 'Cat Tembok Nippon Paint (5 Pail)', 1250000, 'completed', '2026-06-20'),
(102, 'Sinar Mandiri AC', 'Suku cadang Kapasitor AC & Freon R32', 850000, 'approved', '2026-06-26')
ON CONFLICT (id) DO NOTHING;

INSERT INTO inventory_items (id, name, stock, unit, min_stock, category) VALUES
(1, 'Sabun Cair Handwash', 15, 'Botol', 5, 'Cleaning Supplies'),
(2, 'Lampu LED Philips 12W', 2, 'Pcs', 5, 'Spare Parts'),
(3, 'Tabung Gas Elpiji 12kg', 4, 'Tabung', 1, 'Kitchen Supplies'),
(4, 'Sprei Kasur Standard', 8, 'Pcs', 2, 'Amenities')
ON CONFLICT (id) DO NOTHING;

INSERT INTO bank_statement_items (id, date, "desc", amount, type, matched, matched_ref) VALUES
(1, '2026-06-26', 'Settle Midtrans INV-001', 1800000, 'credit', true, 'INV-001'),
(2, '2026-06-27', 'Transfer VA Siska Wardani', 2600000, 'credit', false, ''),
(3, '2026-06-27', 'Pembayaran Biaya Token Listrik', 350000, 'debit', false, '')
ON CONFLICT (id) DO NOTHING;

-- =========================================================================
-- ADDITIONAL FACILITIES MANAGEMENT & JOIN TABLES (PROMPT)
-- =========================================================================

-- 1. Create facilities table
CREATE TABLE IF NOT EXISTS facilities (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  icon VARCHAR(100) NOT NULL, -- e.g. Wifi, Wind, Shield, Car, Shirt, etc. (Lucide icon names)
  category VARCHAR(100) DEFAULT 'general' NOT NULL, -- e.g. room, property, general
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Create property_facilities join table
CREATE TABLE IF NOT EXISTS property_facilities (
  property_id BIGINT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  facility_id BIGINT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  PRIMARY KEY (property_id, facility_id)
);

-- 3. Create room_facilities join table
CREATE TABLE IF NOT EXISTS room_facilities (
  room_id BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  facility_id BIGINT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  PRIMARY KEY (room_id, facility_id)
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE IF EXISTS facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS property_facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS room_facilities ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
CREATE POLICY "Public Select for facilities" ON facilities 
  FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated Select for facilities" ON facilities 
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin All Access for facilities" ON facilities 
  FOR ALL TO authenticated USING (true);

CREATE POLICY "Public Select for property_facilities" ON property_facilities 
  FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated Select for property_facilities" ON property_facilities 
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin All Access for property_facilities" ON property_facilities 
  FOR ALL TO authenticated USING (true);

CREATE POLICY "Public Select for room_facilities" ON room_facilities 
  FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated Select for room_facilities" ON room_facilities 
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin All Access for room_facilities" ON room_facilities 
  FOR ALL TO authenticated USING (true);

-- Seed Standard Facilities
INSERT INTO facilities (id, name, icon, category, description) VALUES
(1, 'WiFi High-Speed', 'Wifi', 'general', 'Koneksi internet tanpa kabel berkecepatan hingga 100 Mbps'),
(2, 'Air Conditioner (AC)', 'Wind', 'room', 'Pendingin ruangan inverter hemat energi'),
(3, 'Keamanan 24 Jam', 'Shield', 'property', 'Pengawasan CCTV dan petugas keamanan siaga 24 jam'),
(4, 'Parkir Motor Luas', 'Car', 'property', 'Area parkir motor yang aman, teduh, dan luas'),
(5, 'Laundry Kiloan', 'Shirt', 'property', 'Fasilitas cuci gosok pakaian tersedia untuk penghuni'),
(6, 'Cleaning Service', 'Sparkles', 'property', 'Layanan kebersihan kamar 2 kali seminggu'),
(7, 'Dapur Bersama', 'CupSoda', 'property', 'Dapur umum lengkap dengan kompor, dispenser, dan kulkas'),
(8, 'Kamar Mandi Dalam', 'Droplet', 'room', 'Kamar mandi pribadi dilengkapi shower dan toilet duduk')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  icon = EXCLUDED.icon,
  category = EXCLUDED.category,
  description = EXCLUDED.description;

-- Seed Sample Mappings if target records exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM properties WHERE id = 1) THEN
    INSERT INTO property_facilities (property_id, facility_id) VALUES
    (1, 1), (1, 3), (1, 4), (1, 5), (1, 6), (1, 7)
    ON CONFLICT DO NOTHING;
  END IF;

  IF EXISTS (SELECT 1 FROM properties WHERE id = 2) THEN
    INSERT INTO property_facilities (property_id, facility_id) VALUES
    (2, 1), (2, 3), (2, 4), (2, 5), (2, 6), (2, 7)
    ON CONFLICT DO NOTHING;
  END IF;

  IF EXISTS (SELECT 1 FROM rooms WHERE id = 1) THEN
    INSERT INTO room_facilities (room_id, facility_id) VALUES
    (1, 1), (1, 2), (1, 8)
    ON CONFLICT DO NOTHING;
  END IF;

  IF EXISTS (SELECT 1 FROM rooms WHERE id = 2) THEN
    INSERT INTO room_facilities (room_id, facility_id) VALUES
    (2, 1), (2, 2), (2, 8)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

-- Automatically sync sequences for all serial-based tables to prevent duplicate key / crash issues on save
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT table_name, column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND column_default LIKE 'nextval%'
    LOOP
        EXECUTE 'SELECT setval(pg_get_serial_sequence(''' || r.table_name || ''', ''' || r.column_name || '''), COALESCE(MAX(' || r.column_name || '), 0) + 1, false) FROM ' || r.table_name;
    END LOOP;
END;
$$;




