/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient } from '@supabase/supabase-js';
import { 
  Property, Room, Tenant, Booking, PaymentInvoice, Maintenance, 
  UserSystem, ActivityLog, Survey, AccountCOA, FinancialTransaction, 
  JournalEntry, SystemSettings, Coupon 
} from '../types';

// Detect credentials from Vite environment variables (VITE_ prefixed tags are safe for browser use)
let activeSupabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || (import.meta as any).env?.SUPABASE_URL || '';
let activeSupabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || (import.meta as any).env?.SUPABASE_ANON_KEY || '';

export let isSupabaseConfigured = Boolean(activeSupabaseUrl && activeSupabaseAnonKey && activeSupabaseUrl !== 'undefined' && activeSupabaseAnonKey !== 'undefined');

// Real Supabase Client Instance (wrapped with null-safe triggers to prevent app loading crash if keys are raw placeholder text)
export let supabase = isSupabaseConfigured 
  ? createClient(activeSupabaseUrl, activeSupabaseAnonKey) 
  : null;

// Realtime listeners state to avoid duplicate subscriptions
export type RealtimeCallback = (payload: any) => void;

class SupabaseRealtimeManager {
  private client: any = null;
  private isConfigured = false;
  private globalChannel: any = null;
  private listeners: Map<string, Set<RealtimeCallback>> = new Map();
  private connectionStatus: 'CONNECTED' | 'DISCONNECTED' = 'DISCONNECTED';
  private globalPollingInterval: any = null;
  private fallbackCallbacks: Set<() => void> = new Set();
  private retryTimeout: any = null;
  private retryCount = 0;

  public init(supabaseClient: any, isConfigured: boolean) {
    this.client = supabaseClient;
    this.isConfigured = isConfigured;
    this.cleanupAll();
    
    if (this.isConfigured && this.client) {
      this.connectionStatus = 'DISCONNECTED'; // Wait for SUBSCRIBED to mark CONNECTED
      this.establishGlobalChannel();
    } else {
      this.connectionStatus = 'DISCONNECTED';
      this.startGlobalPolling();
    }
  }

  private establishGlobalChannel() {
    if (!this.client || !this.isConfigured) return;

    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }

    try {
      console.log('[REALTIME MANAGER] Setting up single global database-wide listener...');
      
      // Make sure we remove any old channel first from the client to prevent collisions
      if (this.globalChannel) {
        try {
          this.client.removeChannel(this.globalChannel).catch(() => {});
        } catch (e) {}
        this.globalChannel = null;
      }

      // Create a unique stable channel name
      const channel = this.client.channel('db-global-realtime');
      
      this.globalChannel = channel
        .on('postgres_changes', { event: '*', schema: 'public' }, (payload: any) => {
          console.log('[REALTIME MANAGER] Realtime change event received:', payload);
          
          // Trigger the global state update (notifies any state-change listeners)
          this.triggerStateChanged();

          // Route to specific table listeners
          if (payload && payload.table) {
            const tableListeners = this.listeners.get(payload.table);
            if (tableListeners) {
              tableListeners.forEach((cb) => {
                try { cb(payload); } catch (e) { console.error('[REALTIME MANAGER] Listener callback error:', e); }
              });
            }
          }
        })
        .subscribe((status: string, err?: any) => {
          console.log(`[REALTIME MANAGER STATUS] Global channel status: ${status}`);
          if (status === 'SUBSCRIBED') {
            this.retryCount = 0;
            this.handleRealtimeConnected();
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn(`[REALTIME MANAGER WARNING] Global channel status offline: ${status}`, err);
            this.handleRealtimeDisconnected();
            this.scheduleReconnect();
          }
        });
    } catch (err) {
      console.error('[REALTIME MANAGER] Error establishing global channel:', err);
      this.handleRealtimeDisconnected();
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.retryTimeout) return;
    
    this.retryCount++;
    const delay = Math.min(1000 * Math.pow(2, this.retryCount), 30000);
    console.log(`[REALTIME MANAGER] Reconnecting global channel in ${delay}ms (Attempt ${this.retryCount})`);
    
    this.retryTimeout = setTimeout(() => {
      this.retryTimeout = null;
      this.establishGlobalChannel();
    }, delay);
  }

  private handleRealtimeConnected() {
    if (this.connectionStatus === 'CONNECTED') return;
    console.log('[REALTIME MANAGER] Realtime connection fully established. Stopping fallback polling.');
    this.connectionStatus = 'CONNECTED';
    this.stopGlobalPolling();
  }

  private handleRealtimeDisconnected() {
    if (this.connectionStatus === 'DISCONNECTED') return;
    console.warn('[REALTIME MANAGER] Realtime connection lost. Activating fallback polling.');
    this.connectionStatus = 'DISCONNECTED';
    this.startGlobalPolling();
  }

  private triggerStateChanged() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('samara_state_changed'));
    }
    this.fallbackCallbacks.forEach((cb) => {
      try { cb(); } catch (e) { console.error(e); }
    });
  }

  private startGlobalPolling() {
    if (this.globalPollingInterval) return;
    if (typeof window !== 'undefined') {
      console.log('[REALTIME MANAGER] Starting global fallback polling (15s interval).');
      this.globalPollingInterval = setInterval(() => {
        console.log('[SUPABASE REALTIME FALLBACK] Polling refresh triggered.');
        this.triggerStateChanged();
        
        // Also trigger table-specific listeners for components that rely on them
        this.listeners.forEach((tableListeners, tableName) => {
          tableListeners.forEach((cb) => {
            try { cb({ eventType: 'POLLING_REFRESH', table: tableName }); } catch (e) { console.error(e); }
          });
        });
      }, 15000);
    }
  }

  private stopGlobalPolling() {
    if (this.globalPollingInterval) {
      console.log('[REALTIME MANAGER] Stopping global fallback polling.');
      clearInterval(this.globalPollingInterval);
      this.globalPollingInterval = null;
    }
  }

  public registerFallbackCallback(cb: () => void) {
    this.fallbackCallbacks.add(cb);
    return () => {
      this.fallbackCallbacks.delete(cb);
    };
  }

  public cleanupAll() {
    this.stopGlobalPolling();
    
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
    this.retryCount = 0;

    if (this.globalChannel && this.client) {
      try {
        this.client.removeChannel(this.globalChannel).catch((err: any) => {
          console.warn('[REALTIME MANAGER] Safe channel remove warning:', err);
        });
      } catch (e) {
        console.warn('[REALTIME MANAGER] Error cleaning up global channel:', e);
      }
      this.globalChannel = null;
    }
    
    this.listeners.clear();
  }

  public subscribe(tableName: string, criteria: any, callback: RealtimeCallback): () => void {
    if (!this.listeners.has(tableName)) {
      this.listeners.set(tableName, new Set());
    }
    const tableListeners = this.listeners.get(tableName)!;
    tableListeners.add(callback);

    console.log(`[REALTIME MANAGER] Centralized subscription registered for table: ${tableName}. Total listeners: ${tableListeners.size}`);

    // If we are currently disconnected/offline, trigger an initial callback with POLLING_REFRESH to ensure sync
    if (this.connectionStatus === 'DISCONNECTED') {
      setTimeout(() => {
        try {
          callback({ eventType: 'POLLING_REFRESH', table: tableName });
        } catch (e) {}
      }, 50);
    }

    return () => {
      const currentListeners = this.listeners.get(tableName);
      if (currentListeners) {
        currentListeners.delete(callback);
        console.log(`[REALTIME MANAGER] Centralized subscription unregistered for table: ${tableName}. Remaining listeners: ${currentListeners.size}`);
        if (currentListeners.size === 0) {
          this.listeners.delete(tableName);
        }
      }
    };
  }
}

export const realtimeManager = new SupabaseRealtimeManager();

export function initializeSupabaseRealtime() {
  realtimeManager.init(supabase, isSupabaseConfigured);
}

// Call on startup if configured
if (isSupabaseConfigured) {
  initializeSupabaseRealtime();
}

export function getIsSupabaseConfigured(): boolean {
  return isSupabaseConfigured;
}

export function getSupabaseClient() {
  return supabase;
}

const normalizeUrl = (u: string) => (u || '').trim().replace(/\/$/, '').toLowerCase();
const normalizeKey = (k: string) => (k || '').trim();

export function configureSupabaseDynamically(url: string, key: string) {
  if (url && key && url !== 'undefined' && key !== 'undefined') {
    const normUrl = normalizeUrl(url);
    const normKey = normalizeKey(key);
    const normActiveUrl = normalizeUrl(activeSupabaseUrl);
    const normActiveKey = normalizeKey(activeSupabaseAnonKey);

    if (supabase && normUrl === normActiveUrl && normKey === normActiveKey) {
      console.log('[SUPABASE] Already configured with identical credentials. Reusing singleton client to prevent multiple GoTrueClient warnings.');
      return true;
    }

    activeSupabaseUrl = url;
    activeSupabaseAnonKey = key;
    isSupabaseConfigured = true;
    supabase = createClient(url, key);
    console.log('[SUPABASE] Configured dynamically from server runtime environment!');
    
    // Re-initialize realtime subscriptions with the new client
    initializeSupabaseRealtime();
    return true;
  }
  return false;
}

const tableSchemas: Record<string, string[]> = {
  properties: [
    'id', 'name', 'address', 'price', 'type', 'total_rooms', 'available_rooms',
    'facilities', 'image_url', 'images', 'lat', 'lng', 'created_at', 'description',
    'additional_rules', 'policies', 'terms', 'regulations'
  ],
  rooms: [
    'id', 'property_id', 'room_number', 'room_type', 'price', 'size_sqm', 'floor',
    'status', 'current_tenant_name', 'facilities', 'image_url', 'images',
    'discount_percent', 'discount_until', 'is_daily_enabled', 'daily_price', 'created_at'
  ],
  tenants: [
    'id', 'user_id', 'full_name', 'phone', 'email', 'job', 'avatar_initials',
    'avatar_color', 'property_id', 'room_number', 'start_date', 'duration_months',
    'payment_status', 'emergency_contact', 'created_at', 'status'
  ],
  bookings: [
    'id', 'tenant_name', 'phone', 'email', 'property_id', 'room_number', 'duration_months',
    'total_price', 'rent_price', 'pbjt', 'deposit_amount', 'payment_method', 'status',
    'booking_date', 'user_id', 'room_id', 'midtrans_order_id', 'booking_type',
    'duration_days', 'check_in_date', 'check_out_date', 'nik', 'ktp_image', 'is_dp',
    'dp_amount', 'coupon_code', 'discount_amount', 'is_for_other', 'occupant_name',
    'occupant_phone', 'occupant_email', 'occupant_nik', 'occupant_ktp_image',
    'is_occupant_verified', 'occupant_arrival_status', 'created_at'
  ],
  payments: [
    'id', 'tenant_name', 'property_id', 'amount', 'method', 'status', 'payment_date',
    'midtrans_order_id', 'transaction_id', 'settlement_time', 'created_at'
  ],
  maintenance: [
    'id', 'title', 'property_id', 'room', 'priority', 'cost', 'tech', 'desc_field',
    'status', 'date', 'created_at'
  ],
  users: [
    'id', 'full_name', 'email', 'role', 'role_id', 'access', 'last_login', 'active', 'created_at'
  ],
  activity_logs: [
    'id', 'time', 'admin_name', 'action', 'detail', 'ip_address', 'created_at'
  ],
  surveys: [
    'id', 'reservation_number', 'tenant_name', 'nik', 'email', 'phone', 'address', 'job',
    'ktp_url', 'selfie_url', 'planned_move_in_date', 'property_id', 'room_number',
    'survey_date', 'survey_time_slot', 'status', 'dp_amount', 'invoice_id', 'payment_method',
    'pelunasan_deadline_days', 'pelunasan_deadline_date', 'created_at'
  ],
  accounts: [
    'id', 'name', 'type', 'balance', 'created_at'
  ],
  financial_transactions: [
    'id', 'transaction_no', 'transaction_date', 'category', 'description', 'amount',
    'type', 'reference_type', 'reference_id', 'created_by', 'created_at'
  ],
  journal_entries: [
    'id', 'journal_no', 'transaction_id', 'account_id', 'debit', 'credit', 'created_at'
  ],
  coupons: [
    'id', 'code', 'discount_type', 'discount_value', 'min_duration_months', 'min_duration_days',
    'max_discount_amount', 'is_active', 'description', 'created_at'
  ],
  settings: [
    'id', 'booking_rules', 'survey_rules', 'standard_facilities', 'why_choose_us', 'faqs', 'updated_at'
  ]
};

export async function safeSupabaseUpsert(table: string, payload: any, id?: any) {
  if (!isSupabaseConfigured || !supabase) return { error: new Error('Supabase not configured') };
  let activePayload = { ...payload };

  // Database Constraint Shield: Ensure room_type matches the CHECK constraint in remote DB ('Standard', 'Deluxe', 'Premium')
  if (table === 'rooms' && activePayload.room_type) {
    const allowedRoomTypes = ['Standard', 'Deluxe', 'Premium'];
    if (!allowedRoomTypes.includes(activePayload.room_type)) {
      console.warn(`[SUPABASE SHIELD] Coercing invalid room_type '${activePayload.room_type}' to 'Premium' to comply with check constraint.`);
      activePayload.room_type = 'Premium';
    }
  }

  // Early Schema Validation
  const allowedCols = tableSchemas[table];
  if (allowedCols) {
    const payloadKeys = Object.keys(activePayload);
    const invalidKeys = payloadKeys.filter(k => !allowedCols.includes(k));
    if (invalidKeys.length > 0) {
      const errMsg = `Skema tidak valid: Kolom [${invalidKeys.join(', ')}] tidak ada di tabel '${table}'.`;
      console.error(`[SUPABASE SHIELD ERROR] ${errMsg}`);
      return { error: new Error(errMsg) };
    }
  }

  try {
    if (id !== undefined && id !== null) {
      const { data, error } = await supabase.from(table).update(activePayload).eq('id', id).select();
      if (error) {
        return { error };
      }
      if (!data || data.length === 0) {
        // Fallback: if update affected 0 rows, the row with this ID doesn't exist yet (e.g. settings ID 1). Insert it.
        const { data: insertData, error: insertError } = await supabase.from(table).insert({ ...activePayload, id }).select();
        if (insertError) {
          return { error: insertError };
        }
        return { data: insertData, error: null };
      }
      return { data, error: null };
    } else {
      const { data, error } = await supabase.from(table).insert(activePayload).select();
      if (error) {
        return { error };
      }
      return { data, error: null };
    }
  } catch (err: any) {
    console.error(`safeSupabaseUpsert exception in ${table}:`, err);
    return { error: err };
  }
}

function logSupabaseError(context: string, error: any, isException = false) {
  console.error(`[SUPABASE ERROR] [${context}]`, error);
}

// =========================================================================
// PRODUCTION-GRADE SUPABASE DATA REPOSITORY INTERFACE
// =========================================================================

export const database = {
  // --- PROPERTIES ---
  async fetchProperties(options?: { limit?: number; offset?: number }): Promise<Property[]> {
    if (!isSupabaseConfigured || !supabase) return [];
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    try {
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .order('id', { ascending: true })
        .range(offset, offset + limit - 1);
      if (error) {
        logSupabaseError('fetchProperties', error);
        return [];
      }
      return data as Property[];
    } catch (err) {
      logSupabaseError('fetchProperties', err, true);
      return [];
    }
  },

  async saveProperty(prop: Partial<Property>): Promise<Property> {
    if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured');
    try {
      const id = prop.id;
      const payload = { ...prop };
      delete (payload as any).id;

      const { data, error } = await safeSupabaseUpsert('properties', payload, id);
      if (error) {
        logSupabaseError('saveProperty', error);
        throw new Error(`Gagal menyimpan properti: ${error.message}`);
      }
      const updated = (data && data.length > 0 ? data[0] : prop) as Property;
      await this.logActivity("System", prop.id ? "UPDATE_PROPERTY" : "CREATE_PROPERTY", `Properti ${updated.name} berhasil disimpan.`);
      return updated;
    } catch (err: any) {
      console.error('saveProperty failed:', err);
      throw err;
    }
  },

  async deleteProperty(id: number): Promise<boolean> {
    if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured');
    try {
      const { error } = await supabase.from('properties').delete().eq('id', id);
      if (error) {
        logSupabaseError('deleteProperty', error);
        throw new Error(`Gagal menghapus properti: ${error.message}`);
      }
      await this.logActivity("System", "DELETE_PROPERTY", `Menghapus properti ID: ${id}`);
      return true;
    } catch (err: any) {
      console.error('deleteProperty failed:', err);
      throw err;
    }
  },

  // --- ROOMS ---
  async fetchRooms(options?: { limit?: number; offset?: number }): Promise<Room[]> {
    if (!isSupabaseConfigured || !supabase) return [];
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .order('room_number', { ascending: true })
        .range(offset, offset + limit - 1);
      if (error) {
        logSupabaseError('fetchRooms', error);
        return [];
      }
      return data as Room[];
    } catch (err) {
      logSupabaseError('fetchRooms', err, true);
      return [];
    }
  },

  async saveRoom(room: Partial<Room>): Promise<Room> {
    if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured');
    try {
      const id = room.id;
      const payload = { ...room };
      delete (payload as any).id;

      const { data, error } = await safeSupabaseUpsert('rooms', payload, id);
      if (error) {
        logSupabaseError('saveRoom', error);
        throw new Error(`Gagal menyimpan kamar: ${error.message}`);
      }
      const updated = (data && data.length > 0 ? data[0] : room) as Room;
      await this.syncPropertyRoomCount(updated.property_id);
      await this.logActivity("System", room.id ? "UPDATE_ROOM" : "CREATE_ROOM", `Unit ${updated.room_number} disimpan.`);
      return updated;
    } catch (err: any) {
      console.error('saveRoom failed:', err);
      throw err;
    }
  },

  async deleteRoom(id: number): Promise<boolean> {
    if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured');
    try {
      const { data: targeted } = await supabase.from('rooms').select('property_id').eq('id', id).maybeSingle();
      const { error } = await supabase.from('rooms').delete().eq('id', id);
      if (error) {
        logSupabaseError('deleteRoom', error);
        throw new Error(`Gagal menghapus kamar: ${error.message}`);
      }
      if (targeted?.property_id) {
        await this.syncPropertyRoomCount(targeted.property_id);
      }
      await this.logActivity("System", "DELETE_ROOM", `Menghapus unit ID: ${id}`);
      return true;
    } catch (err: any) {
      console.error('deleteRoom failed:', err);
      throw err;
    }
  },

  // --- BOOKINGS ---
  async fetchBookings(options?: { limit?: number; offset?: number }): Promise<Booking[]> {
    if (!isSupabaseConfigured || !supabase) return [];
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) {
        logSupabaseError('fetchBookings', error);
        return [];
      }
      return data as Booking[];
    } catch (err) {
      logSupabaseError('fetchBookings', err, true);
      return [];
    }
  },

  async saveBooking(booking: Partial<Booking>): Promise<Booking> {
    if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured');
    try {
      let existingBooking: Booking | null = null;
      if (booking.id) {
        const { data } = await supabase.from('bookings').select('*').eq('id', booking.id).maybeSingle();
        existingBooking = data as Booking;
      } else if (booking.midtrans_order_id) {
        const { data } = await supabase.from('bookings').select('*').eq('midtrans_order_id', booking.midtrans_order_id).maybeSingle();
        existingBooking = data as Booking;
      }

      const id = booking.id || existingBooking?.id;
      const payload = { ...booking };
      delete (payload as any).id;

      if (!id && !payload.status) payload.status = 'pending';
      if (!id && !payload.booking_date) payload.booking_date = new Date().toISOString().split('T')[0];

      const { data, error } = await safeSupabaseUpsert('bookings', payload, id);
      if (error) {
        logSupabaseError('saveBooking', error);
        throw new Error(`Gagal menyimpan booking: ${error.message}`);
      }

      const updated = (data && data.length > 0 ? data[0] : { ...existingBooking, ...booking }) as Booking;

      // Approved status side-effects
      if (updated.status === 'approved' && updated.room_id) {
        const occupantName = (updated.is_for_other || !!updated.occupant_name) ? (updated.occupant_name || updated.tenant_name) : updated.tenant_name;
        await safeSupabaseUpsert('rooms', { status: 'occupied', current_tenant_name: occupantName }, updated.room_id);

        const tenantPayload = {
          full_name: occupantName,
          phone: (updated.is_for_other || !!updated.occupant_name) ? (updated.occupant_phone || updated.phone) : updated.phone,
          email: ((updated.is_for_other || !!updated.occupant_name) ? (updated.occupant_email || updated.email) : updated.email) || '',
          avatar_initials: occupantName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase(),
          avatar_color: "bg-indigo-600",
          property_id: updated.property_id,
          room_number: updated.room_number,
          start_date: updated.check_in_date || new Date().toISOString().split('T')[0],
          duration_months: updated.duration_months || 1,
          payment_status: 'paid'
        };

        let existingTenantId = null;
        try {
          const { data: dbTenants } = await supabase
            .from('tenants')
            .select('id')
            .eq('room_number', updated.room_number)
            .eq('property_id', updated.property_id)
            .limit(1);
          if (dbTenants && dbTenants.length > 0) {
            existingTenantId = dbTenants[0].id;
          }
        } catch (dbErr) {
          console.warn('[SUPABASE] Failed checking existing tenants table:', dbErr);
        }

        await safeSupabaseUpsert('tenants', tenantPayload, existingTenantId);

        const invoiceId = `INV-${Math.floor(1000 + Math.random() * 9000)}`;
        const paymentPayload = {
          id: invoiceId,
          tenant_name: updated.tenant_name,
          property_id: updated.property_id,
          amount: updated.total_price,
          method: updated.payment_method || 'Midtrans',
          status: 'paid',
          payment_date: new Date().toISOString().split('T')[0],
          midtrans_order_id: updated.midtrans_order_id || null,
          transaction_id: `mid-tr-${Math.floor(100000 + Math.random() * 900000)}`
        };
        const { error: paymentErr } = await safeSupabaseUpsert('payments', paymentPayload, invoiceId);
        if (paymentErr) {
          const { id: _, ...fallbackPayload } = paymentPayload;
          await safeSupabaseUpsert('payments', fallbackPayload);
        }

        await this.syncPropertyRoomCount(updated.property_id);
      } else if (updated.status === 'rejected' && updated.room_id) {
        if (existingBooking && existingBooking.status === 'approved') {
          await safeSupabaseUpsert('rooms', { status: 'available', current_tenant_name: null }, updated.room_id);
          await this.syncPropertyRoomCount(updated.property_id);
        }
      }

      return updated;
    } catch (err: any) {
      console.error('saveBooking failed:', err);
      throw err;
    }
  },

  // --- SURVEYS ---
  async fetchSurveys(options?: { limit?: number; offset?: number }): Promise<Survey[]> {
    if (!isSupabaseConfigured || !supabase) return [];
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    try {
      const { data, error } = await supabase
        .from('surveys')
        .select('*')
        .order('id', { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) {
        logSupabaseError('fetchSurveys', error);
        return [];
      }
      return data as Survey[];
    } catch (err) {
      logSupabaseError('fetchSurveys', err, true);
      return [];
    }
  },

  async saveSurvey(survey: Partial<Survey>): Promise<Survey> {
    if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured');
    try {
      let existing: Survey | null = null;
      if (survey.id) {
        const { data } = await supabase.from('surveys').select('*').eq('id', survey.id).maybeSingle();
        existing = data as Survey;
      } else if (survey.reservation_number) {
        const { data } = await supabase.from('surveys').select('*').eq('reservation_number', survey.reservation_number).maybeSingle();
        existing = data as Survey;
      }

      const id = survey.id || existing?.id;
      const payload = { ...survey };
      delete (payload as any).id;

      if (!id && !payload.reservation_number) {
        payload.reservation_number = `SRV-${new Date().toISOString().slice(0,10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;
      }
      if (!id && !payload.status) payload.status = 'pending_payment';
      if (!id && !payload.dp_amount) payload.dp_amount = 500000;
      if (!id && !payload.pelunasan_deadline_days) payload.pelunasan_deadline_days = 3;
      if (!id && !payload.pelunasan_deadline_date) {
        payload.pelunasan_deadline_date = new Date(Date.now() + 3*24*3600*1000).toISOString().split('T')[0];
      }
      if (!id && !payload.created_at) payload.created_at = new Date().toISOString().split('T')[0];

      const { data, error } = await safeSupabaseUpsert('surveys', payload, id);
      if (error) {
        logSupabaseError('saveSurvey', error);
        throw new Error(`Gagal menyimpan survey: ${error.message}`);
      }

      const updated = (data && data.length > 0 ? data[0] : { ...existing, ...survey }) as Survey;

      // Confirmed survey side-effects (payment + room reservation)
      if (updated.status === 'survey_confirmed') {
        const { data: roomData } = await supabase
          .from('rooms')
          .select('*')
          .eq('property_id', updated.property_id)
          .eq('room_number', updated.room_number)
          .maybeSingle();

        if (roomData) {
          await safeSupabaseUpsert('rooms', { status: 'reserved' }, roomData.id);
        }

        const targetInvoiceId = updated.invoice_id || `INV-SRV-${Math.floor(1000 + Math.random()*9000)}`;
        const srvInvPayload = {
          id: targetInvoiceId,
          tenant_name: updated.tenant_name,
          property_id: updated.property_id,
          amount: updated.dp_amount,
          method: updated.payment_method || "Midtrans Snap QRIS",
          status: "paid",
          payment_date: new Date().toISOString().split('T')[0],
          midtrans_order_id: updated.reservation_number
        };

        const { data: existingPayment } = await supabase
          .from('payments')
          .select('id')
          .eq('midtrans_order_id', updated.reservation_number)
          .maybeSingle();

        const payId = existingPayment ? existingPayment.id : targetInvoiceId;
        await safeSupabaseUpsert('payments', srvInvPayload, existingPayment ? existingPayment.id : undefined);

        await this.recordFinancialRevenue(payId, 1300, updated.dp_amount, `DP Survey Kamar ${updated.room_number} - ${updated.tenant_name}`);
      } else if (updated.status === 'no_show' || updated.status === 'expired') {
        const { data: roomData } = await supabase
          .from('rooms')
          .select('*')
          .eq('property_id', updated.property_id)
          .eq('room_number', updated.room_number)
          .maybeSingle();

        if (roomData && roomData.status === 'reserved') {
          await safeSupabaseUpsert('rooms', { status: 'available' }, roomData.id);
        }

        const { data: existingPayment } = await supabase
          .from('payments')
          .select('*')
          .eq('midtrans_order_id', updated.reservation_number)
          .maybeSingle();

        if (existingPayment) {
          await safeSupabaseUpsert('payments', { status: 'overdue' }, existingPayment.id);
        }

        if (updated.status === 'no_show') {
          await this.recordFinancialReclassification(1300, 4200, updated.dp_amount, `DP Survey Hangus (No Show) - Reservasi ${updated.reservation_number}`);
        }
      }

      return updated;
    } catch (err: any) {
      console.error('saveSurvey failed:', err);
      throw err;
    }
  },

  // --- COUPONS ---
  async fetchCoupons(options?: { limit?: number; offset?: number }): Promise<Coupon[]> {
    if (!isSupabaseConfigured || !supabase) return [];
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    try {
      const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .order('id', { ascending: true })
        .range(offset, offset + limit - 1);
      if (error) {
        logSupabaseError('fetchCoupons', error);
        return [];
      }
      return data as Coupon[];
    } catch (err) {
      logSupabaseError('fetchCoupons', err, true);
      return [];
    }
  },

  async saveCoupon(coupon: Partial<Coupon>): Promise<Coupon> {
    if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured');
    try {
      const id = coupon.id;
      const payload = { ...coupon };
      delete (payload as any).id;

      const { data, error } = await safeSupabaseUpsert('coupons', payload, id);
      if (error) {
        logSupabaseError('saveCoupon', error);
        throw new Error(`Gagal menyimpan kupon: ${error.message}`);
      }
      const updated = (data && data.length > 0 ? data[0] : coupon) as Coupon;
      return updated;
    } catch (err: any) {
      console.error('saveCoupon failed:', err);
      throw err;
    }
  },

  async deleteCoupon(id: number): Promise<boolean> {
    if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured');
    try {
      const { error } = await supabase.from('coupons').delete().eq('id', id);
      if (error) {
        logSupabaseError('deleteCoupon', error);
        throw new Error(`Gagal menghapus kupon: ${error.message}`);
      }
      return true;
    } catch (err: any) {
      console.error('deleteCoupon failed:', err);
      throw err;
    }
  },

  // --- FINANCIAL ACCOUNTING SYSTEMS ---
  async fetchAccounts(options?: { limit?: number; offset?: number }): Promise<AccountCOA[]> {
    if (!isSupabaseConfigured || !supabase) return [];
    const limit = options?.limit ?? 200;
    const offset = options?.offset ?? 0;
    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .order('id', { ascending: true })
        .range(offset, offset + limit - 1);
      if (error) {
        logSupabaseError('fetchAccounts', error);
        return [];
      }
      return data as AccountCOA[];
    } catch (err) {
      logSupabaseError('fetchAccounts', err, true);
      return [];
    }
  },

  async fetchFinancialTransactions(options?: { limit?: number; offset?: number }): Promise<FinancialTransaction[]> {
    if (!isSupabaseConfigured || !supabase) return [];
    const limit = options?.limit ?? 200;
    const offset = options?.offset ?? 0;
    try {
      const { data, error } = await supabase
        .from('financial_transactions')
        .select('*')
        .order('id', { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) {
        logSupabaseError('fetchFinancialTransactions', error);
        return [];
      }
      return data as FinancialTransaction[];
    } catch (err) {
      logSupabaseError('fetchFinancialTransactions', err, true);
      return [];
    }
  },

  async fetchJournalEntries(options?: { limit?: number; offset?: number }): Promise<JournalEntry[]> {
    if (!isSupabaseConfigured || !supabase) return [];
    const limit = options?.limit ?? 200;
    const offset = options?.offset ?? 0;
    try {
      const { data, error } = await supabase
        .from('journal_entries')
        .select('*')
        .order('id', { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) {
        logSupabaseError('fetchJournalEntries', error);
        return [];
      }
      return data as JournalEntry[];
    } catch (err) {
      logSupabaseError('fetchJournalEntries', err, true);
      return [];
    }
  },

  async postFinancialTransaction(payload: {
    category: string;
    description: string;
    amount: number;
    type: string;
    reference_type: string | null;
    reference_id: string | null;
    created_by: string;
    debit_account_id: number;
    credit_account_id: number;
  }): Promise<void> {
    if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured');
    const {
      category,
      description,
      amount,
      type,
      reference_type,
      reference_id,
      created_by,
      debit_account_id,
      credit_account_id
    } = payload;

    const trxDate = new Date().toISOString().split('T')[0];

    try {
      const trxNoSupabase = `TRX-${trxDate.replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;

      // Try running PostgreSQL atomic stored RPC function
      const { data: rpcResult, error: rpcError } = await supabase.rpc('post_financial_transaction', {
        p_transaction_no: trxNoSupabase,
        p_transaction_date: trxDate,
        p_category: category,
        p_description: description,
        p_amount: amount,
        p_type: type,
        p_reference_type: reference_type || null,
        p_reference_id: reference_id || null,
        p_created_by: created_by,
        p_debit_account_id: debit_account_id,
        p_credit_account_id: credit_account_id
      });

      if (rpcError) {
        console.warn("[Posting Engine] RPC failed, running direct database atomic fallback.", rpcError);

        let insertedTrx: any = null;
        let insertedDebJrn: any = null;
        let insertedCredJrn: any = null;
        let oldDebitBalance: number | null = null;
        let oldCreditBalance: number | null = null;

        try {
          const { data: debAcc } = await supabase.from('accounts').select('balance, type').eq('id', debit_account_id).single();
          const { data: credAcc } = await supabase.from('accounts').select('balance, type').eq('id', credit_account_id).single();
          
          if (!debAcc || !credAcc) throw new Error("Account validation failed during transaction.");
          oldDebitBalance = Number(debAcc.balance || 0);
          oldCreditBalance = Number(credAcc.balance || 0);

          const trxPayload = {
            transaction_no: trxNoSupabase,
            transaction_date: trxDate,
            category,
            description,
            amount,
            type,
            reference_type: reference_type || null,
            reference_id: reference_id || null,
            created_by
          };
          const { data: trxData, error: trxErr } = await supabase.from('financial_transactions').insert(trxPayload).select().single();
          if (trxErr) throw trxErr;
          insertedTrx = trxData;

          const jrnNoSupabase = `JRN-${trxDate.replace(/-/g, '')}-${String(insertedTrx.id).padStart(5, '0')}`;

          const debPayload = {
            journal_no: jrnNoSupabase,
            transaction_id: insertedTrx.id,
            account_id: debit_account_id,
            debit: amount,
            credit: 0
          };
          const { data: debJrn, error: debErr } = await supabase.from('journal_entries').insert(debPayload).select().single();
          if (debErr) throw debErr;
          insertedDebJrn = debJrn;

          const credPayload = {
            journal_no: jrnNoSupabase,
            transaction_id: insertedTrx.id,
            account_id: credit_account_id,
            debit: 0,
            credit: amount
          };
          const { data: credJrn, error: credErr } = await supabase.from('journal_entries').insert(credPayload).select().single();
          if (credErr) throw credErr;
          insertedCredJrn = credJrn;

          const isAssetOrExpense = debAcc.type === 'asset' || debAcc.type === 'expense';
          const newDebitBalance = isAssetOrExpense 
            ? oldDebitBalance + amount 
            : Math.max(0, oldDebitBalance - amount);
          await safeSupabaseUpsert('accounts', { balance: newDebitBalance }, debit_account_id);

          const isLiabilityOrEquityOrRevenue = credAcc.type === 'liability' || credAcc.type === 'equity' || credAcc.type === 'revenue';
          const newCreditBalance = isLiabilityOrEquityOrRevenue 
            ? oldCreditBalance + amount 
            : Math.max(0, oldCreditBalance - amount);
          await safeSupabaseUpsert('accounts', { balance: newCreditBalance }, credit_account_id);

          console.log("[Posting Engine] DB transactions completed and committed successfully.");
        } catch (dbErr) {
          console.error("[Posting Engine] DB transaction error. Rolling back...", dbErr);
          if (insertedCredJrn) await supabase.from('journal_entries').delete().eq('id', insertedCredJrn.id);
          if (insertedDebJrn) await supabase.from('journal_entries').delete().eq('id', insertedDebJrn.id);
          if (insertedTrx) await supabase.from('financial_transactions').delete().eq('id', insertedTrx.id);
          if (oldDebitBalance !== null) await safeSupabaseUpsert('accounts', { balance: oldDebitBalance }, debit_account_id);
          if (oldCreditBalance !== null) await safeSupabaseUpsert('accounts', { balance: oldCreditBalance }, credit_account_id);
          throw dbErr;
        }
      } else {
        console.log("[Posting Engine] RPC post_financial_transaction executed successfully on Supabase:", rpcResult);
      }
    } catch (err) {
      console.error("Database posting transaction failed:", err);
      throw err;
    }
  },

  async recordFinancialRevenue(invoiceId: string, creditAccountId: number, amount: number, description: string) {
    await this.postFinancialTransaction({
      category: "Penerimaan Sewa",
      description,
      amount,
      type: creditAccountId === 1300 ? "dp_booking" : "income",
      reference_type: "payment",
      reference_id: invoiceId,
      created_by: "System Webhook",
      debit_account_id: 1010, // Kas dan Bank Mandiri
      credit_account_id: creditAccountId
    });
  },

  async recordFinancialReclassification(debitAccountId: number, creditAccountId: number, amount: number, description: string) {
    await this.postFinancialTransaction({
      category: "Reklasifikasi Akun",
      description,
      amount,
      type: "reclassification",
      reference_type: "reclassification",
      reference_id: null,
      created_by: "System Finance",
      debit_account_id: debitAccountId,
      credit_account_id: creditAccountId
    });
  },

  async recordFinancialExpense(debitAccountId: number, creditAccountId: number, amount: number, description: string, category: string = "Biaya Operasional") {
    await this.postFinancialTransaction({
      category,
      description,
      amount,
      type: "expense",
      reference_type: "expense",
      reference_id: null,
      created_by: "System Finance",
      debit_account_id: debitAccountId,
      credit_account_id: creditAccountId
    });
  },

  // --- RULES SETTINGS ---
  async fetchSettings(): Promise<SystemSettings> {
    const defaultSettings: SystemSettings = {
      id: 1,
      booking_rules: "1. Tamu dilarang membawa lawan jenis masuk ke dalam kamar.\n2. Menjaga ketenangan setelah pukul 22:00 WIB.",
      survey_rules: "1. Pembayaran DP Survey senilai Rp 500.000 sebagai jaminan.",
      standard_facilities: "[]",
      why_choose_us: "[]",
      faqs: "[]"
    };

    if (!isSupabaseConfigured || !supabase) return defaultSettings;
    try {
      const { data, error } = await supabase.from('settings').select('*').maybeSingle();
      if (error) {
        logSupabaseError('fetchSettings', error);
      }
      if (!error && data) return data as SystemSettings;
    } catch (err) {
      logSupabaseError('fetchSettings', err, true);
    }
    return defaultSettings;
  },

  async saveSettings(settings: SystemSettings): Promise<SystemSettings> {
    if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured');
    try {
      await safeSupabaseUpsert('settings', {
        booking_rules: settings.booking_rules,
        survey_rules: settings.survey_rules,
        standard_facilities: settings.standard_facilities,
        why_choose_us: settings.why_choose_us,
        faqs: settings.faqs
      }, 1);
    } catch(err) {
      console.error(err);
    }
    await this.logActivity("System", "UPDATE_SETTINGS", "Perubahan tata tertib survey, sewa, fasilitas standar, why-choose-us, dan FAQ berhasil disimpan.");
    return settings;
  },

  // --- SYSTEM LOGGERS ---
  async logActivity(adminName: string, action: string, detail: string) {
    console.log(`[ACTIVITY LOG] [${adminName}] ${action}: ${detail}`);
    
    if (isSupabaseConfigured && supabase) {
      try {
        await safeSupabaseUpsert('activity_logs', {
          admin_name: adminName,
          action: action,
          detail: detail,
          ip_address: "127.0.0.1"
        });
      } catch (err) {
        console.error('Failed to log activity to Supabase:', err);
      }
    }
  },

  async fetchActivityLogs(options?: { limit?: number; offset?: number }): Promise<ActivityLog[]> {
    if (!isSupabaseConfigured || !supabase) return [];
    const limit = options?.limit ?? 40;
    const offset = options?.offset ?? 0;
    try {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .order('id', { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) {
        logSupabaseError('fetchActivityLogs', error);
        return [];
      }
      return data as ActivityLog[];
    } catch (err) {
      logSupabaseError('fetchActivityLogs', err, true);
      return [];
    }
  },

  async clearActivityLogs(): Promise<boolean> {
    if (!isSupabaseConfigured || !supabase) return true;
    try {
      const { error } = await supabase.from('activity_logs').delete().neq('id', 0);
      if (error) {
        logSupabaseError('clearActivityLogs', error);
        throw error;
      }
      return true;
    } catch (err) {
      console.error('Failed to clear activity logs:', err);
      return false;
    }
  },

  // --- TENANTS ---
  async fetchTenants(options?: { limit?: number; offset?: number }): Promise<Tenant[]> {
    if (!isSupabaseConfigured || !supabase) return [];
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .order('id', { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) {
        logSupabaseError('fetchTenants', error);
        return [];
      }
      return data as Tenant[];
    } catch (err) {
      logSupabaseError('fetchTenants', err, true);
      return [];
    }
  },

  async saveTenant(tenant: Partial<Tenant>): Promise<Tenant> {
    if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured');
    try {
      const id = tenant.id;
      const payload = { ...tenant };
      delete (payload as any).id;

      const { data, error } = await safeSupabaseUpsert('tenants', payload, id);
      if (error) {
        logSupabaseError('saveTenant', error);
        throw new Error(`Gagal menyimpan tenant: ${error.message}`);
      }
      const finalTenant = (data && data.length > 0 ? data[0] : tenant) as Tenant;
      return finalTenant;
    } catch (err: any) {
      console.error('saveTenant failed:', err);
      throw err;
    }
  },

  // --- PAYMENTS ---
  async fetchPayments(options?: { limit?: number; offset?: number }): Promise<PaymentInvoice[]> {
    if (!isSupabaseConfigured || !supabase) return [];
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .order('payment_date', { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) {
        logSupabaseError('fetchPayments', error);
        return [];
      }
      return data as PaymentInvoice[];
    } catch (err) {
      logSupabaseError('fetchPayments', err, true);
      return [];
    }
  },

  async savePayment(payment: PaymentInvoice): Promise<PaymentInvoice> {
    if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured');
    try {
      const id = payment.id;
      const payload = { ...payment };
      delete (payload as any).id;

      const { error } = await safeSupabaseUpsert('payments', payload, id);
      if (error) {
        logSupabaseError('savePayment', error);
        throw new Error(`Gagal menyimpan pembayaran: ${error.message}`);
      }
      await this.logActivity("System", "UPDATE_PAYMENT", `Pembayaran ${payment.id} (${payment.tenant_name}) diupdate ke status: ${payment.status}.`);
      return payment;
    } catch (err: any) {
      console.error('savePayment failed:', err);
      throw err;
    }
  },

  // --- USERS ---
  async fetchUsers(options?: { limit?: number; offset?: number }): Promise<UserSystem[]> {
    if (!isSupabaseConfigured || !supabase) return [];
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('id', { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) {
        logSupabaseError('fetchUsers', error);
        return [];
      }
      return data as UserSystem[];
    } catch (err) {
      logSupabaseError('fetchUsers', err, true);
      return [];
    }
  },

  async saveUser(user: Partial<UserSystem>): Promise<UserSystem> {
    if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured');
    try {
      const id = user.id;
      const payload = { ...user };
      delete (payload as any).id;

      const { data, error } = await safeSupabaseUpsert('users', payload, id);
      if (error) {
        logSupabaseError('saveUser', error);
        throw new Error(`Gagal menyimpan user: ${error.message}`);
      }
      const updated = (data && data.length > 0 ? data[0] : user) as UserSystem;
      await this.logActivity("System", user.id ? "UPDATE_USER" : "CREATE_USER", `User ${updated.full_name} (${updated.role}) disimpan.`);
      return updated;
    } catch (err: any) {
      console.error('saveUser failed:', err);
      throw err;
    }
  },

  async deleteUser(id: string): Promise<boolean> {
    if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured');
    try {
      const { error } = await supabase.from('users').delete().eq('id', id);
      if (error) {
        logSupabaseError('deleteUser', error);
        throw new Error(`Gagal menghapus user: ${error.message}`);
      }
      await this.logActivity("System", "DELETE_USER", `Menghapus user ID: ${id}`);
      return true;
    } catch (err: any) {
      console.error('deleteUser failed:', err);
      throw err;
    }
  },

  // --- SYNC HELPERS ---
  async syncPropertyRoomCount(propertyId: number) {
    if (!isSupabaseConfigured || !supabase) return;
    try {
      const { data: rooms, error: roomErr } = await supabase.from('rooms').select('*').eq('property_id', propertyId);
      if (roomErr) throw roomErr;

      const totalRooms = rooms ? rooms.length : 0;
      const availableRooms = rooms ? rooms.filter(r => r.status === 'available').length : 0;

      const { error: propErr } = await safeSupabaseUpsert('properties', {
        total_rooms: totalRooms,
        available_rooms: availableRooms
      }, propertyId);

      if (propErr) {
        console.error('[SUPABASE SYNC Property Count Error]', propErr.message);
      } else {
        console.log('[SUPABASE SYNC Property Count Success] Prop ID:', propertyId, 'Total Rooms:', totalRooms, 'Available:', availableRooms);
      }
    } catch (err) {
      console.error('Error syncing property room count in Supabase:', err);
    }
  },

  async resetPlayground() {
    window.location.reload();
  }
};
