/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Property {
  id: number;
  name: string;
  address: string;
  price: number;
  type: 'putra' | 'putri' | 'campur';
  total_rooms: number;
  available_rooms: number;
  facilities: string[];
  image_url: string;
  images: string[];
  lat?: number;
  lng?: number;
  created_at?: string;
  description?: string;
  additional_rules?: string;
  policies?: string;
  terms?: string;
  regulations?: string;
}

export interface Room {
  id: number;
  property_id: number;
  room_number: string;
  room_type: 'Standard' | 'Deluxe' | 'Premium';
  price: number;
  size_sqm: number;
  floor: number;
  status: 'available' | 'occupied' | 'maintenance' | 'reserved';
  current_tenant_name?: string | null;
  facilities: string[];
  image_url?: string;
  discount_percent?: number | null;
  discount_until?: string | null;
  is_daily_enabled: boolean;
  daily_price: number;
  created_at?: string;
}

export interface Tenant {
  id: number;
  user_id?: string | null;
  full_name: string;
  phone: string;
  email: string;
  job?: string;
  avatar_initials: string;
  avatar_color: string;
  property_id: number | null;
  room_number: string;
  start_date: string;
  duration_months: number;
  payment_status: 'paid' | 'pending' | 'overdue';
  emergency_contact?: string;
  created_at?: string;
}

export interface Booking {
  id: number;
  tenant_name: string;
  phone: string;
  email?: string;
  property_id: number | null;
  room_number: string;
  duration_months: number;
  total_price: number;
  rent_price?: number;
  pbjt?: number;
  deposit_amount?: number;
  payment_method: string;
  status: 'pending' | 'approved' | 'rejected';
  booking_date: string;
  user_id?: string;
  room_id: number | null;
  midtrans_order_id?: string;
  booking_type: 'monthly' | 'daily';
  duration_days?: number;
  check_in_date?: string;
  check_out_date?: string;
  nik?: string;
  ktp_image?: string;
  is_dp: boolean;
  dp_amount?: number;
  coupon_code?: string | null;
  discount_amount?: number | null;
  created_at?: string;
}

export interface PaymentInvoice {
  id: string; // e.g. INV-001
  tenant_name: string;
  property_id: number | null;
  amount: number;
  method: string;
  status: 'paid' | 'pending' | 'overdue';
  payment_date: string;
  midtrans_order_id?: string;
  transaction_id?: string;
  settlement_time?: string;
  created_at?: string;
}

export interface Maintenance {
  id: number;
  title: string;
  property_id: number;
  room: string;
  priority: 'Normal' | 'High' | 'Critical';
  cost: number;
  tech?: string;
  desc_field?: string;
  status: 'open' | 'in-progress' | 'completed';
  date: string;
  created_at?: string;
}

export interface UserSystem {
  id: string;
  full_name: string;
  email: string;
  role: 'super' | 'admin' | 'staff' | 'finance';
  role_id: number; // 1=super/super_admin, 2=admin, 3=finance, 4=user/staff/tenant
  access: string;
  last_login?: string;
  active: boolean;
  created_at?: string;
}

export interface ActivityLog {
  id: number;
  time?: string;
  admin_name: string;
  action: string;
  detail?: string;
  ip_address?: string;
  created_at?: string;
}

export interface SentEmail {
  id: number;
  to: string;
  subject: string;
  body: string;
  sent_at: string;
  created_at?: string;
}

export interface Survey {
  id: number;
  reservation_number: string;
  tenant_name: string;
  nik?: string;
  email: string;
  phone: string;
  address?: string;
  job?: string;
  ktp_url?: string;
  selfie_url?: string;
  planned_move_in_date?: string;
  property_id: number | null;
  room_number: string;
  survey_date: string;
  survey_time_slot: string;
  status: 'pending_payment' | 'survey_confirmed' | 'no_show' | 'survey_completed' | 'paid_full' | 'expired';
  dp_amount: number;
  invoice_id?: string;
  payment_method?: string;
  pelunasan_deadline_days?: number;
  pelunasan_deadline_date?: string;
  created_at?: string;
}

export interface AccountCOA {
  id: number; // Account number e.g. 1010
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  balance: number;
  created_at?: string;
}

export interface FinancialTransaction {
  id: number;
  transaction_no: string;
  transaction_date: string;
  category: string;
  description: string;
  amount: number;
  type: 'income' | 'expense' | 'dp_booking' | 'reclassification';
  reference_type?: string | null;
  reference_id?: string | null;
  created_by: string;
  created_at?: string;
}

export interface JournalEntry {
  id: number;
  journal_no: string;
  transaction_id: number;
  account_id: number;
  debit: number;
  credit: number;
  created_at?: string;
}

export interface LedgerEntry {
  id: number;
  account_id: number;
  journal_id: number;
  debit: number;
  credit: number;
  balance: number;
  created_at?: string;
}

export interface FinancialAuditLog {
  id: number;
  user_id: string;
  action: string;
  old_value?: string;
  new_value?: string;
  created_at?: string;
}

export interface StandardFacility {
  icon: string;
  title: string;
  subtitle: string;
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface SystemSettings {
  id: number;
  booking_rules: string;
  survey_rules: string;
  standard_facilities?: string;
  why_choose_us?: string;
  faqs?: string;
  updated_at?: string;
}

export interface Coupon {
  id: number;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  min_duration_months?: number | null;
  min_duration_days?: number | null;
  max_discount_amount?: number | null;
  is_active: boolean;
  description?: string;
  created_at?: string;
}
