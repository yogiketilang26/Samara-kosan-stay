-- Migration: Create and Secure 7 Administrative ERP Tables
-- This migration ensures that petty_cash_requests, fixed_assets, budgets, vendors, purchase_orders, inventory_items, bank_statement_items
-- are created if they do not exist, has Row Level Security (RLS) enabled, has ONLY secure authenticated policies,
-- and drops any "Public Read" policies to prevent public access.

-- 1. Create tables if they do not exist
CREATE TABLE IF NOT EXISTS petty_cash_requests (
  id BIGSERIAL PRIMARY KEY,
  applicant VARCHAR(100) NOT NULL,
  amount NUMERIC(15, 2) NOT NULL,
  purpose TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' NOT NULL, -- pending, approved, rejected
  date DATE DEFAULT CURRENT_DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

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

CREATE TABLE IF NOT EXISTS budgets (
  id BIGSERIAL PRIMARY KEY,
  category VARCHAR(255) UNIQUE NOT NULL,
  limit_amount NUMERIC(15, 2) NOT NULL,
  spent NUMERIC(15, 2) DEFAULT 0 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS vendors (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  category VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id BIGSERIAL PRIMARY KEY,
  vendor VARCHAR(255) NOT NULL,
  items TEXT NOT NULL,
  amount NUMERIC(15, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' NOT NULL, -- pending, approved, completed
  date DATE DEFAULT CURRENT_DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  stock INT DEFAULT 0 NOT NULL,
  unit VARCHAR(50) NOT NULL,
  min_stock INT DEFAULT 0 NOT NULL,
  category VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

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

-- 2. Enable Row Level Security (RLS)
ALTER TABLE IF EXISTS petty_cash_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS fixed_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bank_statement_items ENABLE ROW LEVEL SECURITY;

-- 3. Drop legacy public read policies (if any exist)
DROP POLICY IF EXISTS "Public Read for petty_cash_requests" ON petty_cash_requests;
DROP POLICY IF EXISTS "Public Read for fixed_assets" ON fixed_assets;
DROP POLICY IF EXISTS "Public Read for budgets" ON budgets;
DROP POLICY IF EXISTS "Public Read for vendors" ON vendors;
DROP POLICY IF EXISTS "Public Read for purchase_orders" ON purchase_orders;
DROP POLICY IF EXISTS "Public Read for inventory_items" ON inventory_items;
DROP POLICY IF EXISTS "Public Read for bank_statement_items" ON bank_statement_items;

-- 4. Create proper, secure policies for authenticated-only access
DROP POLICY IF EXISTS "Admin All Access for petty_cash_requests" ON petty_cash_requests;
CREATE POLICY "Admin All Access for petty_cash_requests" ON petty_cash_requests FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin All Access for fixed_assets" ON fixed_assets;
CREATE POLICY "Admin All Access for fixed_assets" ON fixed_assets FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin All Access for budgets" ON budgets;
CREATE POLICY "Admin All Access for budgets" ON budgets FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin All Access for vendors" ON vendors;
CREATE POLICY "Admin All Access for vendors" ON vendors FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin All Access for purchase_orders" ON purchase_orders;
CREATE POLICY "Admin All Access for purchase_orders" ON purchase_orders FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin All Access for inventory_items" ON inventory_items;
CREATE POLICY "Admin All Access for inventory_items" ON inventory_items FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin All Access for bank_statement_items" ON bank_statement_items;
CREATE POLICY "Admin All Access for bank_statement_items" ON bank_statement_items FOR ALL TO authenticated USING (true);

-- 5. Safe seed data insertion
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

-- 6. Automatically sync sequences for all serial-based tables to prevent duplicate key / crash issues on save
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

