/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient } from '@supabase/supabase-js';
import { 
  Property, Room, Tenant, ContractExtension, Booking, PaymentInvoice, Maintenance, 
  UserSystem, ActivityLog, Survey, AccountCOA, FinancialTransaction, 
  JournalEntry, SystemSettings, Coupon, PettyCashRequest, FixedAsset,
  Budget, Vendor, PurchaseOrder, InventoryItem, BankStatementItem, Facility,
  MidtransClearingTransaction, BankReconciliationMatch, NearbyAmenity
} from '../types';
import { INITIAL_NEARBY_AMENITIES } from '../data/nearbyAmenities';

// Detect credentials from Vite environment variables (VITE_ prefixed tags are safe for browser use)
let activeSupabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || (import.meta as any).env?.SUPABASE_URL || '';
let activeSupabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || (import.meta as any).env?.SUPABASE_ANON_KEY || '';

export let isSupabaseConfigured = Boolean(activeSupabaseUrl && activeSupabaseAnonKey && activeSupabaseUrl !== 'undefined' && activeSupabaseAnonKey !== 'undefined');

export const DEFAULT_OWNER_SIGNATURE = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='90' viewBox='0 0 240 90'><path d='M 15 45 C 30 18, 40 8, 55 32 C 65 48, 75 12, 90 28 C 100 38, 105 18, 125 42 C 140 22, 155 52, 175 28 C 190 32, 205 22, 218 38' fill='none' stroke='%231e293b' stroke-width='2.8' stroke-linecap='round'/><path d='M 25 58 Q 110 46 210 52' fill='none' stroke='%232E6F40' stroke-width='2' stroke-dasharray='3 2'/><text x='110' y='72' font-family='sans-serif' font-size='9' font-weight='bold' fill='%232E6F40' text-anchor='middle' letter-spacing='1'>SAMARA STAY OWNER</text><text x='110' y='83' font-family='monospace' font-size='7' fill='%2364748b' text-anchor='middle'>OFFICIAL DIGITAL STAMP</text></svg>`;

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  try {
    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes.data.session?.access_token;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch (e) {}
  return headers;
}

// Standardize Auth Client: Always initialize one client instance using safe placeholders to prevent GoTrue/client creation crashes
export let supabase = createClient(
  activeSupabaseUrl || 'https://placeholder-project.supabase.co',
  activeSupabaseAnonKey || 'placeholder-anon-key'
);

// Realtime listeners state to avoid duplicate subscriptions
export type RealtimeCallback = (payload: any) => void;

class SupabaseRealtimeManager {
  private client: any = null;
  private isConfigured = false;
  private globalChannel: any = null;
  private listeners: Map<string, Set<RealtimeCallback>> = new Map();
  private connectionStatus: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' = 'DISCONNECTED';
  private retryTimeout: any = null;
  private retryCount = 0;
  private lastEventTime: string | null = null;
  private subscriptionHistory: { timestamp: string, type: 'SUBSCRIBE' | 'UNSUBSCRIBE', table: string }[] = [];
  private recentEvents: { timestamp: string, table: string, eventType: string, id: any }[] = [];
  private reconnectAttempts = 0;
  private droppedSubscriptions = 0;
  private onLogCallbacks: Set<(level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL', message: string) => void> = new Set();

  public registerOnLog(callback: (level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL', message: string) => void) {
    this.onLogCallbacks.add(callback);
    try {
      callback('INFO', `Websocket status initialized as ${this.connectionStatus}`);
    } catch (e) {}
  }

  private triggerLog(level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL', message: string) {
    this.onLogCallbacks.forEach((cb) => {
      try { cb(level, message); } catch (e) {}
    });
  }

  public init(supabaseClient: any, isConfigured: boolean) {
    this.client = supabaseClient;
    this.isConfigured = isConfigured;
    this.cleanupAll();
    
    if (this.isConfigured && this.client) {
      this.connectionStatus = 'DISCONNECTED';
      this.establishGlobalChannel();
    }
  }

  private establishGlobalChannel() {
    if (!this.client || !this.isConfigured) return;

    if (this.connectionStatus === 'CONNECTED' || this.connectionStatus === 'CONNECTING') {
      return; // DO NOTHING IF ALREADY CONNECTED OR CONNECTING
    }

    this.connectionStatus = 'CONNECTING';
    this.triggerLog('INFO', 'Websocket status changed to CONNECTING');

    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }

    try {
      console.log('[REALTIME MANAGER] Setting up single global database-wide listener...');
      
      if (this.globalChannel) {
        try {
          this.client.removeChannel(this.globalChannel).catch(() => {});
        } catch (e) {}
        this.globalChannel = null;
      }

      const channel = this.client.channel('db-global-realtime');
      
      this.globalChannel = channel
        .on('postgres_changes', { event: '*', schema: 'public' }, (payload: any) => {
          console.log('[REALTIME MANAGER] Realtime change event received:', payload);
          
          this.lastEventTime = new Date().toLocaleTimeString();
          this.recentEvents.unshift({
            timestamp: new Date().toLocaleTimeString(),
            table: payload?.table || 'unknown',
            eventType: payload?.eventType || 'UNKNOWN',
            id: payload?.new?.id || payload?.old?.id || '-'
          });
          if (this.recentEvents.length > 50) this.recentEvents.pop();

          this.triggerLog('DEBUG', `Database mutation in table ${payload?.table || 'unknown'}: ${payload?.eventType || 'UNKNOWN'}`);

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
            if (this.connectionStatus === 'CONNECTED') {
              this.droppedSubscriptions++;
              this.triggerLog('WARNING', `Websocket channel dropped: ${status}. Total dropped: ${this.droppedSubscriptions}`);
            }
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
    if (this.connectionStatus === 'CONNECTING' || this.connectionStatus === 'CONNECTED') {
      return; // DO NOTHING
    }
    
    this.reconnectAttempts++;
    this.triggerLog('INFO', `Websocket scheduling reconnect attempt #${this.reconnectAttempts}`);

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
    console.log('[REALTIME MANAGER] Realtime connection fully established.');
    this.connectionStatus = 'CONNECTED';
    this.triggerLog('INFO', 'Websocket status changed to CONNECTED');
  }

  private handleRealtimeDisconnected() {
    if (this.connectionStatus === 'DISCONNECTED') return;
    console.warn('[REALTIME MANAGER] Realtime connection lost.');
    this.connectionStatus = 'DISCONNECTED';
    this.triggerLog('WARNING', 'Websocket status changed to DISCONNECTED');
  }

  public cleanupAll() {
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
    
    if (tableListeners.has(callback)) {
      console.log(`[REALTIME MANAGER] Callback already registered for table: ${tableName}. Reusing.`);
      return () => {
        const currentListeners = this.listeners.get(tableName);
        if (currentListeners) {
          currentListeners.delete(callback);
          if (currentListeners.size === 0) {
            this.listeners.delete(tableName);
          }
        }
      };
    }

    tableListeners.add(callback);

    console.log(`[REALTIME MANAGER] Centralized subscription registered for table: ${tableName}. Total listeners: ${tableListeners.size}`);

    this.subscriptionHistory.unshift({
      timestamp: new Date().toLocaleTimeString(),
      type: 'SUBSCRIBE',
      table: tableName
    });
    if (this.subscriptionHistory.length > 50) this.subscriptionHistory.pop();

    this.triggerLog('DEBUG', `Subscribed to table: ${tableName}. Total listeners: ${tableListeners.size}`);

    return () => {
      const currentListeners = this.listeners.get(tableName);
      if (currentListeners) {
        currentListeners.delete(callback);
        console.log(`[REALTIME MANAGER] Centralized subscription unregistered for table: ${tableName}. Remaining listeners: ${currentListeners.size}`);
        
        this.subscriptionHistory.unshift({
          timestamp: new Date().toLocaleTimeString(),
          type: 'UNSUBSCRIBE',
          table: tableName
        });
        if (this.subscriptionHistory.length > 50) this.subscriptionHistory.pop();

        this.triggerLog('DEBUG', `Unsubscribed from table: ${tableName}. Remaining listeners: ${currentListeners?.size || 0}`);

        if (currentListeners.size === 0) {
          this.listeners.delete(tableName);
        }
      }
    };
  }

  public getStatus() {
    return {
      connectionStatus: this.connectionStatus,
      listenersCount: Array.from(this.listeners.entries()).map(([table, set]) => ({
        table,
        count: set.size
      })),
      lastEventTime: this.lastEventTime,
      history: this.subscriptionHistory,
      recentEvents: this.recentEvents,
      reconnectAttempts: this.reconnectAttempts,
      droppedSubscriptions: this.droppedSubscriptions
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
    'additional_rules', 'policies', 'terms', 'regulations', 'deposit_amount'
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
    'is_occupant_verified', 'occupant_arrival_status', 'signature_url', 'created_at'
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
    'pelunasan_deadline_days', 'pelunasan_deadline_date', 'signature_url', 'created_at'
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
  if (!isSupabaseConfigured) return { error: new Error('Supabase not configured') };
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
      invalidKeys.forEach(k => delete activePayload[k]);
    }
  }

  try {
    let result: any;
    if (id !== undefined && id !== null) {
      result = await supabase.from(table).update(activePayload).eq('id', id).select();
      if (result.error && result.error.message?.includes('Could not find the')) {
        const match = result.error.message.match(/Could not find the '([^']+)' column/);
        if (match && match[1]) {
          const badCol = match[1];
          console.warn(`[SUPABASE SHIELD] Column '${badCol}' missing in remote '${table}' table. Stripping and retrying update...`);
          delete activePayload[badCol];
          result = await supabase.from(table).update(activePayload).eq('id', id).select();
        }
      }
      if (!result.data || result.data.length === 0) {
        // Fallback: if update affected 0 rows, the row with this ID doesn't exist yet (e.g. settings ID 1). Insert it.
        result = await supabase.from(table).insert({ ...activePayload, id }).select();
        if (result.error && result.error.message?.includes('Could not find the')) {
          const match = result.error.message.match(/Could not find the '([^']+)' column/);
          if (match && match[1]) {
            const badCol = match[1];
            console.warn(`[SUPABASE SHIELD] Column '${badCol}' missing in remote '${table}' table. Stripping and retrying insert...`);
            delete activePayload[badCol];
            result = await supabase.from(table).insert({ ...activePayload, id }).select();
          }
        }
      }
      return result;
    } else {
      result = await supabase.from(table).insert(activePayload).select();
      if (result.error && result.error.message?.includes('Could not find the')) {
        const match = result.error.message.match(/Could not find the '([^']+)' column/);
        if (match && match[1]) {
          const badCol = match[1];
          console.warn(`[SUPABASE SHIELD] Column '${badCol}' missing in remote '${table}' table. Stripping and retrying insert...`);
          delete activePayload[badCol];
          result = await supabase.from(table).insert(activePayload).select();
        }
      }
      return result;
    }
  } catch (err: any) {
    console.error(`safeSupabaseUpsert exception in ${table}:`, err);
    return { error: err };
  }
}

function logSupabaseError(context: string, error: any, isException = false) {
  if (error && (error.code === 'PGRST205' || error.message?.includes('Could not find the table') || error.message?.includes('schema cache'))) {
    console.warn(`[SUPABASE NOTICE] [${context}] Table or endpoint not provisioned in remote schema cache:`, error.message || error);
    return;
  }
  console.error(`[SUPABASE ERROR] [${context}]`, error);
}

// =========================================================================
// PRODUCTION-GRADE SUPABASE DATA REPOSITORY INTERFACE
// =========================================================================

export const database = {
  // --- PROPERTIES ---
  async fetchProperties(options?: { limit?: number; offset?: number }): Promise<Property[]> {
    if (!isSupabaseConfigured) return [];
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    try {
      let { data, error } = await supabase
        .from('properties')
        .select(`
          *,
          property_facilities (
            facility_id,
            facilities (
              id,
              name,
              icon,
              category,
              description
            )
          )
        `)
        .order('id', { ascending: true })
        .range(offset, offset + limit - 1);

      if (error) {
        console.warn('[fetchProperties] Relational select failed, attempting fallback select:', error.message);
        const fallback = await supabase
          .from('properties')
          .select('*')
          .order('id', { ascending: true })
          .range(offset, offset + limit - 1);
        if (fallback.error) {
          logSupabaseError('fetchProperties', fallback.error);
          return [];
        }
        data = fallback.data;
      }
      
      const mapped = (data || []).map((p: any) => {
        const resolvedFacilities = (p.property_facilities || [])
          .map((pf: any) => pf?.facilities)
          .filter((f: any) => f !== null && f !== undefined)
          .map((f: any) => ({
            id: f.id,
            name: f.name,
            icon: f.icon,
            category: f.category,
            description: f.description
          }));
        
        let depositVal = p.deposit_amount;
        if (depositVal === undefined || depositVal === null) {
          if (p.terms && typeof p.terms === 'string') {
            const match = p.terms.match(/\[DEPOSIT:(\d+)\]/);
            if (match) {
              depositVal = Number(match[1]);
            }
          }
        }

        const cleanProperty = { 
          ...p, 
          facilities: resolvedFacilities.length > 0 ? resolvedFacilities : (Array.isArray(p.facilities) ? p.facilities : []),
          deposit_amount: depositVal ?? 500000
        };
        delete cleanProperty.property_facilities;
        return cleanProperty;
      });
      return mapped as Property[];
    } catch (err) {
      logSupabaseError('fetchProperties', err, true);
      return [];
    }
  },

  async saveProperty(prop: Partial<Property> & { facilities?: Facility[] | number[] | any[] }): Promise<Property> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    try {
      const id = prop.id;
      const payload = { ...prop };
      
      // Extract facilities from payload so they are not written to properties table
      const facilitiesToSync = payload.facilities;
      delete (payload as any).facilities;
      delete (payload as any).id;

      if (payload.deposit_amount !== undefined && payload.deposit_amount !== null) {
        let termsStr = payload.terms || '';
        if (termsStr.includes('[DEPOSIT:')) {
          termsStr = termsStr.replace(/\[DEPOSIT:\d+\]/, `[DEPOSIT:${payload.deposit_amount}]`);
        } else {
          termsStr = termsStr ? `${termsStr}\n[DEPOSIT:${payload.deposit_amount}]` : `[DEPOSIT:${payload.deposit_amount}]`;
        }
        payload.terms = termsStr;
      }

      // Save/Update the main property record
      const { data, error } = await safeSupabaseUpsert('properties', payload, id);
      if (error) {
        logSupabaseError('saveProperty', error);
        throw new Error(`Gagal menyimpan properti: ${error.message}`);
      }
      const updated = (data && data.length > 0 ? data[0] : prop) as Property;
      const propertyId = updated.id;

      // Synchronize join table
      if (facilitiesToSync !== undefined) {
        const targetFacilityIds: number[] = [];
        for (const item of facilitiesToSync) {
          if (typeof item === 'number') {
            targetFacilityIds.push(item);
          } else if (item && typeof item === 'object') {
            const fid = item.id || item.facility_id;
            if (fid) targetFacilityIds.push(Number(fid));
          }
        }

        if (id) {
          // UPDATE MODE: Compare old facility IDs vs new facility IDs
          const { data: currentAssociations, error: assocErr } = await supabase
            .from('property_facilities')
            .select('facility_id')
            .eq('property_id', propertyId);
          
          if (assocErr) {
            console.error('Error fetching current property facilities associations:', assocErr);
          } else {
            const currentFacilityIds = (currentAssociations || []).map(a => Number(a.facility_id));
            const toDelete = currentFacilityIds.filter(fid => !targetFacilityIds.includes(fid));
            const toInsert = targetFacilityIds.filter(fid => !currentFacilityIds.includes(fid));

            for (const fid of toDelete) {
              await this.removeFacilityFromProperty(propertyId, fid);
            }

            for (const fid of toInsert) {
              await this.assignFacilityToProperty(propertyId, fid);
            }
          }
        } else {
          // CREATE MODE: Insert associations directly
          for (const fid of targetFacilityIds) {
            await this.assignFacilityToProperty(propertyId, fid);
          }
        }
      }

      await this.logActivity("System", prop.id ? "UPDATE_PROPERTY" : "CREATE_PROPERTY", `Properti ${updated.name} berhasil disimpan.`);
      
      // Return fully populated property
      const refreshedProps = await this.fetchProperties();
      const refreshedProp = refreshedProps.find(p => p.id === propertyId);
      return refreshedProp || updated;
    } catch (err: any) {
      console.error('saveProperty failed:', err);
      throw err;
    }
  },

  async deleteProperty(id: number): Promise<boolean> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
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

  // --- NEARBY AMENITIES & GPS COORDINATES ---
  async fetchNearbyAmenities(propertyId?: number): Promise<NearbyAmenity[]> {
    if (!isSupabaseConfigured) {
      if (propertyId) {
        return INITIAL_NEARBY_AMENITIES.filter(a => a.propertyId === propertyId);
      }
      return INITIAL_NEARBY_AMENITIES;
    }
    try {
      let query = supabase
        .from('nearby_amenities')
        .select('*')
        .order('distance_meters', { ascending: true });

      if (propertyId) {
        query = query.eq('property_id', propertyId);
      }

      const { data, error } = await query;

      if (error) {
        console.warn('[fetchNearbyAmenities] Query error or table not yet initialized, falling back to curated data:', error.message);
        if (propertyId) {
          return INITIAL_NEARBY_AMENITIES.filter(a => a.propertyId === propertyId);
        }
        return INITIAL_NEARBY_AMENITIES;
      }

      if (!data || data.length === 0) {
        // If table exists but empty, return curated initial data
        const fallback = propertyId 
          ? INITIAL_NEARBY_AMENITIES.filter(a => a.propertyId === propertyId)
          : INITIAL_NEARBY_AMENITIES;
        return fallback;
      }

      return (data || []).map((row: any) => ({
        id: String(row.id),
        propertyId: Number(row.property_id),
        name: String(row.name || ''),
        category: row.category as any,
        distanceMeters: Number(row.distance_meters || 0),
        walkingTimeMinutes: Number(row.walking_time_minutes || 0),
        drivingTimeMinutes: row.driving_time_minutes ? Number(row.driving_time_minutes) : undefined,
        lat: Number(row.lat || 0),
        lng: Number(row.lng || 0),
        description: row.description || '',
        address: row.address || '',
        icon: row.icon || undefined
      }));
    } catch (err) {
      console.warn('[fetchNearbyAmenities] Network/exception, returning default curated dataset:', err);
      return propertyId 
        ? INITIAL_NEARBY_AMENITIES.filter(a => a.propertyId === propertyId)
        : INITIAL_NEARBY_AMENITIES;
    }
  },

  async saveNearbyAmenity(amenity: Partial<NearbyAmenity>): Promise<NearbyAmenity> {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase belum terkonfigurasi. Pastikan VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY sudah terisi.');
    }

    const payload: any = {
      property_id: amenity.propertyId,
      name: amenity.name,
      category: amenity.category,
      distance_meters: amenity.distanceMeters ?? 0,
      walking_time_minutes: amenity.walkingTimeMinutes ?? 0,
      driving_time_minutes: amenity.drivingTimeMinutes ?? 0,
      lat: Number(amenity.lat),
      lng: Number(amenity.lng),
      description: amenity.description || '',
      address: amenity.address || '',
      icon: amenity.icon || null,
      updated_at: new Date().toISOString()
    };

    if (amenity.id && !amenity.id.startsWith('temp-') && !amenity.id.startsWith('new-')) {
      payload.id = amenity.id;
    }

    try {
      const { data, error } = await supabase
        .from('nearby_amenities')
        .upsert(payload)
        .select()
        .single();

      if (error) {
        logSupabaseError('saveNearbyAmenity', error);
        throw new Error(`Gagal menyimpan titik fasilitas: ${error.message}`);
      }

      await this.logActivity(
        "Admin",
        amenity.id ? "UPDATE_AMENITY" : "CREATE_AMENITY",
        `Fasilitas sekitar ${amenity.name} (${amenity.category}) berhasil disimpan.`
      );

      return {
        id: String(data.id),
        propertyId: Number(data.property_id),
        name: String(data.name),
        category: data.category,
        distanceMeters: Number(data.distance_meters),
        walkingTimeMinutes: Number(data.walking_time_minutes),
        drivingTimeMinutes: data.driving_time_minutes ? Number(data.driving_time_minutes) : undefined,
        lat: Number(data.lat),
        lng: Number(data.lng),
        description: data.description,
        address: data.address,
        icon: data.icon
      };
    } catch (err: any) {
      console.error('[saveNearbyAmenity] Error:', err);
      throw err;
    }
  },

  async deleteNearbyAmenity(id: string): Promise<boolean> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    try {
      const { error } = await supabase.from('nearby_amenities').delete().eq('id', id);
      if (error) {
        logSupabaseError('deleteNearbyAmenity', error);
        throw new Error(`Gagal menghapus fasilitas: ${error.message}`);
      }
      await this.logActivity("Admin", "DELETE_AMENITY", `Menghapus fasilitas sekitar ID: ${id}`);
      return true;
    } catch (err: any) {
      console.error('deleteNearbyAmenity failed:', err);
      throw err;
    }
  },

  async batchSeedNearbyAmenities(amenities: NearbyAmenity[]): Promise<number> {
    if (!isSupabaseConfigured) return 0;
    try {
      const payloads = amenities.map(a => ({
        id: a.id,
        property_id: a.propertyId,
        name: a.name,
        category: a.category,
        distance_meters: a.distanceMeters,
        walking_time_minutes: a.walkingTimeMinutes,
        driving_time_minutes: a.drivingTimeMinutes || 0,
        lat: Number(a.lat),
        lng: Number(a.lng),
        description: a.description || '',
        address: a.address || '',
        icon: a.icon || null
      }));

      const { data, error } = await supabase
        .from('nearby_amenities')
        .upsert(payloads, { onConflict: 'id' })
        .select();

      if (error) {
        logSupabaseError('batchSeedNearbyAmenities', error);
        throw new Error(`Gagal seeding fasilitas ke database: ${error.message}`);
      }

      await this.logActivity("Admin", "SEED_AMENITIES", `Sinkronisasi ${payloads.length} titik fasilitas sekitar ke Supabase.`);
      return data?.length || payloads.length;
    } catch (err: any) {
      console.error('batchSeedNearbyAmenities failed:', err);
      throw err;
    }
  },

  // --- ROOMS ---
  async fetchRooms(options?: { limit?: number; offset?: number }): Promise<Room[]> {
    if (!isSupabaseConfigured) return [];
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    try {
      let { data, error } = await supabase
        .from('rooms')
        .select(`
          *,
          room_facilities (
            facility_id,
            facilities (
              id,
              name,
              icon,
              category,
              description
            )
          )
        `)
        .order('room_number', { ascending: true })
        .range(offset, offset + limit - 1);

      if (error) {
        console.warn('[fetchRooms] Relational select failed, attempting fallback select:', error.message);
        const fallback = await supabase
          .from('rooms')
          .select('*')
          .order('room_number', { ascending: true })
          .range(offset, offset + limit - 1);
        if (fallback.error) {
          logSupabaseError('fetchRooms', fallback.error);
          return [];
        }
        data = fallback.data;
      }
      
      const mapped = (data || []).map((r: any) => {
        const resolvedFacilities = (r.room_facilities || [])
          .map((rf: any) => rf?.facilities)
          .filter((f: any) => f !== null && f !== undefined)
          .map((f: any) => ({
            id: f.id,
            name: f.name,
            icon: f.icon,
            category: f.category,
            description: f.description
          }));

        // Business rule: Rooms remain available for other tenants and surveys until officially paid/occupied.
        const normalizedStatus = (r.status === 'reserved' || !r.status) ? 'available' : r.status;
        
        // Auto-heal any lingering 'reserved' status in Supabase
        if (r.status === 'reserved') {
          safeSupabaseUpsert('rooms', { status: 'available' }, r.id).catch(e => console.warn('[Auto-heal Room Status]', e));
        }

        const cleanRoom = { 
          ...r, 
          status: normalizedStatus,
          facilities: resolvedFacilities.length > 0 ? resolvedFacilities : (Array.isArray(r.facilities) ? r.facilities : [])
        };
        delete cleanRoom.room_facilities;
        return cleanRoom;
      });
      return mapped as Room[];
    } catch (err) {
      logSupabaseError('fetchRooms', err, true);
      return [];
    }
  },

  async saveRoom(room: Partial<Room> & { facilities?: Facility[] | number[] | any[] }): Promise<Room> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    try {
      const id = room.id;
      const payload = { ...room };
      
      // Extract facilities
      const facilitiesToSync = payload.facilities;
      delete (payload as any).facilities;
      delete (payload as any).id;

      // Save/Update main room record
      const { data, error } = await safeSupabaseUpsert('rooms', payload, id);
      if (error) {
        logSupabaseError('saveRoom', error);
        throw new Error(`Gagal menyimpan kamar: ${error.message}`);
      }
      const updated = (data && data.length > 0 ? data[0] : room) as Room;
      const roomId = updated.id;

      // Sync join table
      if (facilitiesToSync !== undefined) {
        const targetFacilityIds: number[] = [];
        for (const item of facilitiesToSync) {
          if (typeof item === 'number') {
            targetFacilityIds.push(item);
          } else if (item && typeof item === 'object') {
            const fid = item.id || item.facility_id;
            if (fid) targetFacilityIds.push(Number(fid));
          }
        }

        if (id) {
          // UPDATE MODE: Compare old facility IDs vs new facility IDs
          const { data: currentAssociations, error: assocErr } = await supabase
            .from('room_facilities')
            .select('facility_id')
            .eq('room_id', roomId);
          
          if (assocErr) {
            console.error('Error fetching current room facilities associations:', assocErr);
          } else {
            const currentFacilityIds = (currentAssociations || []).map(a => Number(a.facility_id));
            const toDelete = currentFacilityIds.filter(fid => !targetFacilityIds.includes(fid));
            const toInsert = targetFacilityIds.filter(fid => !currentFacilityIds.includes(fid));

            for (const fid of toDelete) {
              await this.removeFacilityFromRoom(roomId, fid);
            }

            for (const fid of toInsert) {
              await this.assignFacilityToRoom(roomId, fid);
            }
          }
        } else {
          // CREATE MODE: Insert directly
          for (const fid of targetFacilityIds) {
            await this.assignFacilityToRoom(roomId, fid);
          }
        }
      }

      await this.syncPropertyRoomCount(updated.property_id);
      await this.logActivity("System", room.id ? "UPDATE_ROOM" : "CREATE_ROOM", `Unit ${updated.room_number} disimpan.`);
      
      // Return fully populated room
      const refreshedRooms = await this.fetchRooms();
      const refreshedRoom = refreshedRooms.find(r => r.id === roomId);
      return refreshedRoom || updated;
    } catch (err: any) {
      console.error('saveRoom failed:', err);
      throw err;
    }
  },

  async deleteRoom(id: number): Promise<boolean> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
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
    if (!isSupabaseConfigured) return [];
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
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
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
    if (!isSupabaseConfigured) return [];
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
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
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

      // Confirmed survey side-effects (payment invoice creation)
      // Note: In accordance with business rules, rooms remain OPEN/AVAILABLE for public booking & surveys
      // until full official rental payment (pelunasan resmi) is completed. Only the specific time-slot is locked.
      if (updated.status === 'survey_confirmed') {
        const isFree = Number(updated.dp_amount) === 0;
        if (!isFree) {
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

          // Note: Recording financial revenue double-entry accounting is an admin/webhook accounting operation.
          // Wrapped in try/catch so unauthenticated users saving a survey do not fail.
          try {
            await this.recordFinancialRevenue(payId, 1300, updated.dp_amount, `DP Survey Kamar ${updated.room_number} - ${updated.tenant_name}`);
          } catch (finErr) {
            console.warn('[SUPABASE NOTICE] Financial revenue double-entry recording deferred to server webhook or admin session:', finErr);
          }
        }
      } else if (updated.status === 'no_show' || updated.status === 'expired') {
        const { data: existingPayment } = await supabase
          .from('payments')
          .select('*')
          .eq('midtrans_order_id', updated.reservation_number)
          .maybeSingle();

        if (existingPayment) {
          await safeSupabaseUpsert('payments', { status: 'overdue' }, existingPayment.id);
        }

        if (updated.status === 'no_show' && Number(updated.dp_amount) > 0) {
          try {
            await this.recordFinancialReclassification(1300, 4200, updated.dp_amount, `DP Survey Hangus (No Show) - Reservasi ${updated.reservation_number}`);
          } catch (finErr) {
            console.warn('[SUPABASE NOTICE] Financial reclassification recording deferred to server webhook or admin session:', finErr);
          }
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
    if (!isSupabaseConfigured) return [];
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
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
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
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
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
    if (!isSupabaseConfigured) return [];
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
    if (!isSupabaseConfigured) return [];
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
    if (!isSupabaseConfigured) return [];
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
    property_id?: number | null;
  }): Promise<void> {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/admin/financial-transaction/post', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || 'Gagal memposting transaksi keuangan di server.');
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

  async checkCoaDiagnostics(options?: { repair?: boolean; force?: boolean }): Promise<{
    success: boolean;
    diagnostic?: {
      healthy: boolean;
      totalChecked: number;
      existingCount: number;
      missingCount: number;
      missingAccounts: Array<{ id: number; name: string; type: string; category?: string }>;
      repairedCount: number;
      repairedAccounts: Array<{ id: number; name: string }>;
      accountsStatus: Array<{ id: number; name: string; type: string; category?: string; exists: boolean; balance?: number }>;
      timestamp: string;
      error?: string;
    };
    error?: string;
  }> {
    try {
      const headers = await getAuthHeaders();
      const repairParam = options?.repair ? 'repair=true' : 'repair=false';
      const forceParam = options?.force ? 'force=true' : 'force=false';
      const res = await fetch(`/api/admin/accounting/diagnostic-coa?${repairParam}&${forceParam}`, {
        method: 'GET',
        headers
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        return { success: false, error: errBody.error || 'Gagal memeriksa diagnostik COA.' };
      }
      return await res.json();
    } catch (err: any) {
      return { success: false, error: err.message || 'Koneksi ke endpoint diagnostik gagal.' };
    }
  },

  async repairCriticalCOA(): Promise<{
    success: boolean;
    repaired?: any;
    error?: string;
  }> {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/accounting/diagnostic-coa/repair', {
        method: 'POST',
        headers,
        body: JSON.stringify({})
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        return { success: false, error: errBody.error || 'Gagal memperbaiki bagan akun.' };
      }
      return await res.json();
    } catch (err: any) {
      return { success: false, error: err.message || 'Koneksi perbaikan gagal.' };
    }
  },

  // --- RULES SETTINGS ---
  async fetchSettings(): Promise<SystemSettings> {
    const defaultSettings: SystemSettings = {
      id: 1,
      booking_rules: "1. Tamu dilarang membawa lawan jenis masuk ke dalam kamar.\n2. Menjaga ketenangan setelah pukul 22:00 WIB.",
      survey_rules: "1. Pembayaran DP Survey senilai Rp 500.000 sebagai jaminan.",
      standard_facilities: "[]",
      why_choose_us: "[]",
      faqs: "[]",
      owner_signature_url: DEFAULT_OWNER_SIGNATURE
    };

    if (!isSupabaseConfigured) return defaultSettings;
    try {
      const { data, error } = await supabase.from('settings').select('*').maybeSingle();
      if (error) {
        logSupabaseError('fetchSettings', error);
      }
      let settingsObj = data ? { ...defaultSettings, ...(data as SystemSettings) } : defaultSettings;
      if (!settingsObj.owner_signature_url) {
        settingsObj.owner_signature_url = DEFAULT_OWNER_SIGNATURE;
      }

      // Dynamically load from facilities table to maintain a single source of truth
      const { data: facData, error: facError } = await supabase
        .from('facilities')
        .select('*')
        .order('id', { ascending: true });

      if (!facError && facData) {
        const mappedFacilities = facData.map(f => ({
          id: f.id,
          icon: f.icon || 'Sparkles',
          title: f.name,
          subtitle: f.description || '',
          category: f.category || 'general'
        }));
        settingsObj.standard_facilities = JSON.stringify(mappedFacilities);
      }
      return settingsObj;
    } catch (err) {
      logSupabaseError('fetchSettings', err, true);
    }
    return defaultSettings;
  },

  async saveSettings(settings: SystemSettings): Promise<SystemSettings> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    
    // We only save the actual settings columns, ignoring standard_facilities to avoid duplication
    const { error: upsertErr } = await safeSupabaseUpsert('settings', {
      booking_rules: settings.booking_rules,
      survey_rules: settings.survey_rules,
      why_choose_us: settings.why_choose_us,
      faqs: settings.faqs,
      owner_signature_url: settings.owner_signature_url || DEFAULT_OWNER_SIGNATURE
    }, 1);

    if (upsertErr) {
      logSupabaseError('saveSettings', upsertErr, true);
      throw new Error(`Gagal menyimpan pengaturan sistem: ${upsertErr.message || JSON.stringify(upsertErr)}`);
    }

    await this.logActivity("System", "UPDATE_SETTINGS", "Perubahan tata tertib survey, sewa, why-choose-us, dan FAQ berhasil disimpan.");
    return settings;
  },

  // --- FACILITIES & ASSIGNMENTS (ID-BASED CRUD) ---
  async fetchFacilities(): Promise<Facility[]> {
    if (!isSupabaseConfigured) return [];
    try {
      const { data, error } = await supabase
        .from('facilities')
        .select('*')
        .order('id', { ascending: true });
      if (error) {
        logSupabaseError('fetchFacilities', error);
        return [];
      }
      return (data || []) as Facility[];
    } catch (err) {
      logSupabaseError('fetchFacilities', err, true);
      return [];
    }
  },

  async createFacility(name: string, icon: string, category: string, description?: string): Promise<Facility> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    try {
      const payload = {
        name: name.trim(),
        icon: icon || 'Sparkles',
        category: category || 'general',
        description: description ? description.trim() : ''
      };
      const { data, error } = await supabase
        .from('facilities')
        .insert(payload)
        .select('*');
      if (error) {
        logSupabaseError('createFacility', error);
        throw new Error(`Gagal membuat fasilitas: ${error.message}`);
      }
      const created = data && data.length > 0 ? data[0] : null;
      await this.logActivity("System", "CREATE_FACILITY", `Membuat fasilitas ID ${created?.id}: ${name}`);
      return created as Facility;
    } catch (err: any) {
      console.error('createFacility failed:', err);
      throw err;
    }
  },

  async updateFacility(id: number, data: Partial<Omit<Facility, 'id'>>): Promise<Facility> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    try {
      const payload: any = {};
      if (data.name !== undefined) payload.name = data.name.trim();
      if (data.icon !== undefined) payload.icon = data.icon;
      if (data.category !== undefined) payload.category = data.category;
      if (data.description !== undefined) payload.description = data.description.trim();

      const { data: updatedData, error } = await supabase
        .from('facilities')
        .update(payload)
        .eq('id', id)
        .select('*');
      if (error) {
        logSupabaseError('updateFacility', error);
        throw new Error(`Gagal memperbarui fasilitas: ${error.message}`);
      }
      const updated = updatedData && updatedData.length > 0 ? updatedData[0] : null;
      await this.logActivity("System", "UPDATE_FACILITY", `Memperbarui fasilitas ID ${id}: ${updated?.name || ''}`);
      return updated as Facility;
    } catch (err: any) {
      console.error('updateFacility failed:', err);
      throw err;
    }
  },

  async deleteFacility(id: number): Promise<boolean> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    try {
      const { error } = await supabase.from('facilities').delete().eq('id', id);
      if (error) {
        logSupabaseError('deleteFacility', error);
        throw new Error(`Gagal menghapus fasilitas: ${error.message}`);
      }
      await this.logActivity("System", "DELETE_FACILITY", `Menghapus fasilitas ID: ${id}`);
      return true;
    } catch (err: any) {
      console.error('deleteFacility failed:', err);
      throw err;
    }
  },

  async assignFacilityToProperty(propertyId: number, facilityId: number): Promise<boolean> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    try {
      const { error } = await supabase
        .from('property_facilities')
        .upsert({ property_id: propertyId, facility_id: facilityId }, { onConflict: 'property_id,facility_id' });
      if (error) {
        logSupabaseError('assignFacilityToProperty', error);
        throw new Error(`Gagal menetapkan fasilitas ke properti: ${error.message}`);
      }
      return true;
    } catch (err: any) {
      console.error('assignFacilityToProperty failed:', err);
      throw err;
    }
  },

  async removeFacilityFromProperty(propertyId: number, facilityId: number): Promise<boolean> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    try {
      const { error } = await supabase
        .from('property_facilities')
        .delete()
        .eq('property_id', propertyId)
        .eq('facility_id', facilityId);
      if (error) {
        logSupabaseError('removeFacilityFromProperty', error);
        throw new Error(`Gagal menghapus fasilitas dari properti: ${error.message}`);
      }
      return true;
    } catch (err: any) {
      console.error('removeFacilityFromProperty failed:', err);
      throw err;
    }
  },

  async assignFacilityToRoom(roomId: number, facilityId: number): Promise<boolean> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    try {
      const { error } = await supabase
        .from('room_facilities')
        .upsert({ room_id: roomId, facility_id: facilityId }, { onConflict: 'room_id,facility_id' });
      if (error) {
        logSupabaseError('assignFacilityToRoom', error);
        throw new Error(`Gagal menetapkan fasilitas ke kamar: ${error.message}`);
      }
      return true;
    } catch (err: any) {
      console.error('assignFacilityToRoom failed:', err);
      throw err;
    }
  },

  async removeFacilityFromRoom(roomId: number, facilityId: number): Promise<boolean> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    try {
      const { error } = await supabase
        .from('room_facilities')
        .delete()
        .eq('room_id', roomId)
        .eq('facility_id', facilityId);
      if (error) {
        logSupabaseError('removeFacilityFromRoom', error);
        throw new Error(`Gagal menghapus fasilitas dari kamar: ${error.message}`);
      }
      return true;
    } catch (err: any) {
      console.error('removeFacilityFromRoom failed:', err);
      throw err;
    }
  },

  async fetchFacilitiesForProperty(propertyId: number): Promise<Facility[]> {
    if (!isSupabaseConfigured) return [];
    try {
      const { data, error } = await supabase
        .from('property_facilities')
        .select(`
          facility_id,
          facilities (
            id,
            name,
            icon,
            category,
            description
          )
        `)
        .eq('property_id', propertyId);
      if (error) {
        logSupabaseError('fetchFacilitiesForProperty', error);
        return [];
      }
      return (data || [])
        .map((pf: any) => pf.facilities)
        .filter((f: any) => f !== null) as Facility[];
    } catch (err) {
      logSupabaseError('fetchFacilitiesForProperty', err, true);
      return [];
    }
  },

  async fetchFacilitiesForRoom(roomId: number): Promise<Facility[]> {
    if (!isSupabaseConfigured) return [];
    try {
      const { data, error } = await supabase
        .from('room_facilities')
        .select(`
          facility_id,
          facilities (
            id,
            name,
            icon,
            category,
            description
          )
        `)
        .eq('room_id', roomId);
      if (error) {
        logSupabaseError('fetchFacilitiesForRoom', error);
        return [];
      }
      return (data || [])
        .map((rf: any) => rf.facilities)
        .filter((f: any) => f !== null) as Facility[];
    } catch (err) {
      logSupabaseError('fetchFacilitiesForRoom', err, true);
      return [];
    }
  },

  async fetchMasterFacilities(): Promise<Facility[]> {
    return this.fetchFacilities();
  },

  async saveMasterFacility(fac: Partial<Facility>): Promise<Facility> {
    if (fac.id) {
      return this.updateFacility(fac.id, fac);
    } else {
      return this.createFacility(fac.name || '', fac.icon || 'Sparkles', fac.category || 'general', fac.description);
    }
  },

  async deleteMasterFacility(id: number): Promise<boolean> {
    return this.deleteFacility(id);
  },

  // --- SYSTEM LOGGERS ---
  async logActivity(adminName: string, action: string, detail: string) {
    console.log(`[ACTIVITY LOG] [${adminName}] ${action}: ${detail}`);
    
    if (isSupabaseConfigured) {
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
    if (!isSupabaseConfigured) return [];
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
    if (!isSupabaseConfigured) return true;
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
    if (!isSupabaseConfigured) return [];
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
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
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

  async deleteTenant(id: string | number): Promise<boolean> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    try {
      const { error } = await supabase.from('tenants').delete().eq('id', id);
      if (error) {
        logSupabaseError('deleteTenant', error);
        throw new Error(`Gagal menghapus tenant: ${error.message}`);
      }
      await this.logActivity("System", "DELETE_TENANT", `Menghapus data tenant ID: ${id}`);
      return true;
    } catch (err: any) {
      console.error('deleteTenant failed:', err);
      throw err;
    }
  },

  // --- CONTRACT EXTENSIONS ---
  async fetchContractExtensions(options?: { limit?: number; offset?: number }): Promise<ContractExtension[]> {
    if (!isSupabaseConfigured) return [];
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    try {
      const { data, error } = await supabase
        .from('contract_extensions')
        .select('*')
        .order('id', { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) {
        logSupabaseError('fetchContractExtensions', error);
        return [];
      }
      return data as ContractExtension[];
    } catch (err) {
      logSupabaseError('fetchContractExtensions', err, true);
      return [];
    }
  },

  async saveContractExtension(ext: Partial<ContractExtension>): Promise<ContractExtension> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    try {
      const id = ext.id;
      const payload = { ...ext };
      delete (payload as any).id;

      const { data, error } = await safeSupabaseUpsert('contract_extensions', payload, id);
      if (error) {
        logSupabaseError('saveContractExtension', error);
        throw new Error(`Gagal menyimpan perpanjangan kontrak: ${error.message}`);
      }
      const updated = (data && data.length > 0 ? data[0] : ext) as ContractExtension;
      return updated;
    } catch (err: any) {
      console.error('saveContractExtension failed:', err);
      throw err;
    }
  },

  async settleContractExtension(payload: {
    tenantId: number;
    extensionMonths: number;
    totalAmount: number;
    paymentMethod: string;
    midtransOrderId?: string;
    transactionId?: string;
    notes?: string;
  }): Promise<{ success: boolean; invoiceId: string; newDurationMonths: number }> {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/admin/contract-extension/settle', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        tenantId: payload.tenantId,
        extensionMonths: payload.extensionMonths,
        totalAmount: payload.totalAmount,
        paymentMethod: payload.paymentMethod,
        midtransOrderId: payload.midtransOrderId,
        transactionId: payload.transactionId,
        notes: payload.notes
      })
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || 'Gagal memproses perpanjangan kontrak di server.');
    }

    const result = await res.json();

    await this.logActivity("Super Admin", "CONTRACT_EXTENSION", `Perpanjangan sewa ID tenant ${payload.tenantId} sebanyak ${payload.extensionMonths} bulan.`);

    return result;
  },

  async deleteSurvey(id: number): Promise<boolean> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    try {
      const { error } = await supabase.from('surveys').delete().eq('id', id);
      if (error) {
        logSupabaseError('deleteSurvey', error);
        throw new Error(`Gagal menghapus survey: ${error.message}`);
      }
      await this.logActivity("System", "DELETE_SURVEY", `Menghapus data survey ID: ${id}`);
      return true;
    } catch (err: any) {
      console.error('deleteSurvey failed:', err);
      throw err;
    }
  },

  async deleteBooking(id: number): Promise<boolean> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    try {
      const { error } = await supabase.from('bookings').delete().eq('id', id);
      if (error) {
        logSupabaseError('deleteBooking', error);
        throw new Error(`Gagal menghapus booking: ${error.message}`);
      }
      await this.logActivity("System", "DELETE_BOOKING", `Menghapus data booking ID: ${id}`);
      return true;
    } catch (err: any) {
      console.error('deleteBooking failed:', err);
      throw err;
    }
  },

  // --- PAYMENTS ---
  async fetchPayments(options?: { limit?: number; offset?: number }): Promise<PaymentInvoice[]> {
    if (!isSupabaseConfigured) return [];
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
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
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
    if (!isSupabaseConfigured) return [];
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
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
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
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
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
    if (!isSupabaseConfigured) return;
    try {
      const { data: rooms, error: roomErr } = await supabase.from('rooms').select('*').eq('property_id', propertyId);
      if (roomErr) throw roomErr;

      const totalRooms = rooms ? rooms.length : 0;
      const availableRooms = rooms ? rooms.filter(r => r.status === 'available' || r.status === 'reserved' || !r.status).length : 0;

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

  // --- MAINTENANCE ---
  async fetchMaintenance(options?: { limit?: number; offset?: number }): Promise<Maintenance[]> {
    if (!isSupabaseConfigured) return [];
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    try {
      const { data, error } = await supabase
        .from('maintenances')
        .select('*')
        .range(offset, offset + limit - 1)
        .order('id', { ascending: false });
      if (error) {
        logSupabaseError('fetchMaintenance', error);
        return [];
      }
      return (data || []).map((m: any) => ({
        id: m.id,
        title: m.title || m.issue || 'Pemeliharaan Fasilitas',
        property_id: m.property_id || 1,
        room: m.room || m.room_number || 'Umum',
        priority: m.priority || 'Normal',
        cost: Number(m.cost || 0),
        tech: m.tech || m.technician || 'Teknisi Samara',
        desc_field: m.desc_field || m.description || '',
        status: m.status || 'open',
        date: m.date || m.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
        created_at: m.created_at
      })) as Maintenance[];
    } catch (err) {
      logSupabaseError('fetchMaintenance', err, true);
      return [];
    }
  },

  async saveMaintenance(maint: Partial<Maintenance>): Promise<Maintenance> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    try {
      const id = maint.id;
      const payload = {
        title: maint.title,
        property_id: maint.property_id,
        room: maint.room,
        priority: maint.priority,
        cost: maint.cost,
        tech: maint.tech,
        desc_field: maint.desc_field,
        status: maint.status,
        date: maint.date
      };
      const { data, error } = id
        ? await supabase.from('maintenances').update(payload).eq('id', id).select().single()
        : await supabase.from('maintenances').insert(payload).select().single();
      if (error) {
        logSupabaseError('saveMaintenance', error);
        throw error;
      }
      return data as Maintenance;
    } catch (err) {
      logSupabaseError('saveMaintenance', err, true);
      throw err;
    }
  },

  // --- PETTY CASH REQUESTS ---
  async fetchPettyCashRequests(options?: { limit?: number; offset?: number }): Promise<PettyCashRequest[]> {
    if (!isSupabaseConfigured) return [];
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    try {
      const { data, error } = await supabase
        .from('petty_cash_requests')
        .select('*')
        .range(offset, offset + limit - 1)
        .order('id', { ascending: true });
      if (error) {
        logSupabaseError('fetchPettyCashRequests', error);
        return [];
      }
      return data as PettyCashRequest[];
    } catch (err) {
      logSupabaseError('fetchPettyCashRequests', err, true);
      return [];
    }
  },

  async savePettyCashRequest(request: Partial<PettyCashRequest>): Promise<PettyCashRequest> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    try {
      const id = request.id;
      const payload = {
        applicant: request.applicant,
        amount: request.amount,
        purpose: request.purpose,
        status: request.status,
        date: request.date
      };
      const { data, error } = id
        ? await supabase.from('petty_cash_requests').update(payload).eq('id', id).select().single()
        : await supabase.from('petty_cash_requests').insert(payload).select().single();
      if (error) {
        logSupabaseError('savePettyCashRequest', error);
        throw error;
      }
      return data as PettyCashRequest;
    } catch (err) {
      logSupabaseError('savePettyCashRequest', err, true);
      throw err;
    }
  },

  // --- FIXED ASSETS ---
  async fetchFixedAssets(options?: { limit?: number; offset?: number }): Promise<FixedAsset[]> {
    if (!isSupabaseConfigured) return [];
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    try {
      const { data, error } = await supabase
        .from('fixed_assets')
        .select('*')
        .range(offset, offset + limit - 1)
        .order('id', { ascending: true });
      if (error) {
        logSupabaseError('fetchFixedAssets', error);
        return [];
      }
      return (data || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        cost: Number(item.cost),
        lifeYears: Number(item.life_years),
        residual: Number(item.residual),
        deprRate: Number(item.depr_rate),
        accumDepr: Number(item.accum_depr),
        created_at: item.created_at
      }));
    } catch (err) {
      logSupabaseError('fetchFixedAssets', err, true);
      return [];
    }
  },

  async saveFixedAsset(asset: Partial<FixedAsset>): Promise<FixedAsset> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    try {
      const id = asset.id;
      const payload = {
        name: asset.name,
        cost: asset.cost,
        life_years: asset.lifeYears,
        residual: asset.residual,
        depr_rate: asset.deprRate,
        accum_depr: asset.accumDepr
      };
      const { data, error } = id
        ? await supabase.from('fixed_assets').update(payload).eq('id', id).select().single()
        : await supabase.from('fixed_assets').insert(payload).select().single();
      if (error) {
        logSupabaseError('saveFixedAsset', error);
        throw error;
      }
      return {
        id: data.id,
        name: data.name,
        cost: Number(data.cost),
        lifeYears: Number(data.life_years),
        residual: Number(data.residual),
        deprRate: Number(data.depr_rate),
        accumDepr: Number(data.accum_depr),
        created_at: data.created_at
      };
    } catch (err) {
      logSupabaseError('saveFixedAsset', err, true);
      throw err;
    }
  },

  // --- BUDGETS ---
  async fetchBudgets(options?: { limit?: number; offset?: number }): Promise<Budget[]> {
    if (!isSupabaseConfigured) return [];
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    try {
      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .range(offset, offset + limit - 1)
        .order('id', { ascending: true });
      if (error) {
        logSupabaseError('fetchBudgets', error);
        return [];
      }
      return (data || []).map((item: any) => ({
        id: item.id,
        category: item.category,
        limit: Number(item.limit_amount || 0),
        spent: Number(item.spent || 0),
        created_at: item.created_at
      }));
    } catch (err) {
      logSupabaseError('fetchBudgets', err, true);
      return [];
    }
  },

  async saveBudget(budget: Partial<Budget>): Promise<Budget> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    try {
      const id = budget.id;
      const payload = {
        category: budget.category,
        limit_amount: budget.limit,
        spent: budget.spent
      };
      const { data, error } = id
        ? await supabase.from('budgets').update(payload).eq('id', id).select().single()
        : await supabase.from('budgets').insert(payload).select().single();
      if (error) {
        logSupabaseError('saveBudget', error);
        throw error;
      }
      return {
        id: data.id,
        category: data.category,
        limit: Number(data.limit_amount || 0),
        spent: Number(data.spent || 0),
        created_at: data.created_at
      };
    } catch (err) {
      logSupabaseError('saveBudget', err, true);
      throw err;
    }
  },

  // --- VENDORS ---
  async fetchVendors(options?: { limit?: number; offset?: number }): Promise<Vendor[]> {
    if (!isSupabaseConfigured) return [];
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    try {
      const { data, error } = await supabase
        .from('vendors')
        .select('*')
        .range(offset, offset + limit - 1)
        .order('id', { ascending: true });
      if (error) {
        logSupabaseError('fetchVendors', error);
        return [];
      }
      return data as Vendor[];
    } catch (err) {
      logSupabaseError('fetchVendors', err, true);
      return [];
    }
  },

  async saveVendor(vendor: Partial<Vendor>): Promise<Vendor> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    try {
      const id = vendor.id;
      const payload = {
        name: vendor.name,
        phone: vendor.phone,
        category: vendor.category
      };
      const { data, error } = id
        ? await supabase.from('vendors').update(payload).eq('id', id).select().single()
        : await supabase.from('vendors').insert(payload).select().single();
      if (error) {
        logSupabaseError('saveVendor', error);
        throw error;
      }
      return data as Vendor;
    } catch (err) {
      logSupabaseError('saveVendor', err, true);
      throw err;
    }
  },

  // --- PURCHASE ORDERS ---
  async fetchPurchaseOrders(options?: { limit?: number; offset?: number }): Promise<PurchaseOrder[]> {
    if (!isSupabaseConfigured) return [];
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*')
        .range(offset, offset + limit - 1)
        .order('id', { ascending: false });
      if (error) {
        logSupabaseError('fetchPurchaseOrders', error);
        return [];
      }
      return data as PurchaseOrder[];
    } catch (err) {
      logSupabaseError('fetchPurchaseOrders', err, true);
      return [];
    }
  },

  async savePurchaseOrder(po: Partial<PurchaseOrder>): Promise<PurchaseOrder> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    try {
      const id = po.id;
      const payload = {
        vendor: po.vendor,
        items: po.items,
        amount: po.amount,
        status: po.status,
        date: po.date
      };
      const { data, error } = id
        ? await supabase.from('purchase_orders').update(payload).eq('id', id).select().single()
        : await supabase.from('purchase_orders').insert(payload).select().single();
      if (error) {
        logSupabaseError('savePurchaseOrder', error);
        throw error;
      }
      return data as PurchaseOrder;
    } catch (err) {
      logSupabaseError('savePurchaseOrder', err, true);
      throw err;
    }
  },

  // --- INVENTORY ITEMS ---
  async fetchInventoryItems(options?: { limit?: number; offset?: number }): Promise<InventoryItem[]> {
    if (!isSupabaseConfigured) return [];
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    try {
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .range(offset, offset + limit - 1)
        .order('id', { ascending: true });
      if (error) {
        logSupabaseError('fetchInventoryItems', error);
        return [];
      }
      return (data || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        stock: Number(item.stock),
        unit: item.unit,
        minStock: Number(item.min_stock),
        category: item.category,
        created_at: item.created_at
      }));
    } catch (err) {
      logSupabaseError('fetchInventoryItems', err, true);
      return [];
    }
  },

  async saveInventoryItem(item: Partial<InventoryItem>): Promise<InventoryItem> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    try {
      const id = item.id;
      const payload = {
        name: item.name,
        stock: item.stock,
        unit: item.unit,
        min_stock: item.minStock,
        category: item.category
      };
      const { data, error } = id
        ? await supabase.from('inventory_items').update(payload).eq('id', id).select().single()
        : await supabase.from('inventory_items').insert(payload).select().single();
      if (error) {
        logSupabaseError('saveInventoryItem', error);
        throw error;
      }
      return {
        id: data.id,
        name: data.name,
        stock: Number(data.stock),
        unit: data.unit,
        minStock: Number(data.min_stock),
        category: data.category,
        created_at: data.created_at
      };
    } catch (err) {
      logSupabaseError('saveInventoryItem', err, true);
      throw err;
    }
  },

  // --- BANK STATEMENT ITEMS ---
  async fetchBankStatementItems(options?: { limit?: number; offset?: number }): Promise<BankStatementItem[]> {
    if (!isSupabaseConfigured) return [];
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    try {
      const { data, error } = await supabase
        .from('bank_statement_items')
        .select('*')
        .range(offset, offset + limit - 1)
        .order('id', { ascending: true });
      if (error) {
        logSupabaseError('fetchBankStatementItems', error);
        return [];
      }
      return (data || []).map((item: any) => ({
        id: item.id,
        date: item.date,
        desc: item.desc,
        amount: Number(item.amount),
        type: item.type,
        matched: item.matched,
        matchedRef: item.matched_ref,
        created_at: item.created_at
      }));
    } catch (err) {
      logSupabaseError('fetchBankStatementItems', err, true);
      return [];
    }
  },

  async saveBankStatementItem(stmt: Partial<BankStatementItem>): Promise<BankStatementItem> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    try {
      const id = stmt.id;
      const payload = {
        date: stmt.date,
        desc: stmt.desc,
        amount: stmt.amount,
        type: stmt.type,
        matched: stmt.matched,
        matched_ref: stmt.matchedRef
      };
      const { data, error } = id
        ? await supabase.from('bank_statement_items').update(payload).eq('id', id).select().single()
        : await supabase.from('bank_statement_items').insert(payload).select().single();
      if (error) {
        logSupabaseError('saveBankStatementItem', error);
        throw error;
      }
      return {
        id: data.id,
        date: data.date,
        desc: data.desc,
        amount: Number(data.amount),
        type: data.type,
        matched: data.matched,
        matchedRef: data.matched_ref,
        created_at: data.created_at
      };
    } catch (err) {
      logSupabaseError('saveBankStatementItem', err, true);
      throw err;
    }
  },

  // --- MIDTRANS CLEARING & RECONCILIATION ---
  async fetchMidtransClearingTransactions(options?: { limit?: number; offset?: number }): Promise<MidtransClearingTransaction[]> {
    if (!isSupabaseConfigured) return [];
    const limit = options?.limit ?? 200;
    const offset = options?.offset ?? 0;
    try {
      const { data, error } = await supabase
        .from('midtrans_clearing_transactions')
        .select('*')
        .range(offset, offset + limit - 1)
        .order('id', { ascending: false });
      if (error) {
        logSupabaseError('fetchMidtransClearingTransactions', error);
        return [];
      }
      return (data || []).map((item: any) => ({
        id: item.id,
        payment_id: item.payment_id,
        booking_id: item.booking_id,
        survey_id: item.survey_id,
        contract_extension_id: item.contract_extension_id,
        midtrans_order_id: item.midtrans_order_id,
        midtrans_transaction_id: item.midtrans_transaction_id,
        gross_amount: Number(item.gross_amount || 0),
        fee_amount: Number(item.fee_amount || 0),
        net_amount: Number(item.net_amount || 0),
        reconciled_amount: Number(item.reconciled_amount || 0),
        outstanding_amount: Number(item.outstanding_amount || 0),
        clearing_status: item.clearing_status,
        property_id: item.property_id,
        tenant_name: item.tenant_name,
        created_at: item.created_at,
        settled_at: item.settled_at
      }));
    } catch (err) {
      logSupabaseError('fetchMidtransClearingTransactions', err, true);
      return [];
    }
  },

  async fetchBankReconciliationMatches(options?: { limit?: number; offset?: number }): Promise<BankReconciliationMatch[]> {
    if (!isSupabaseConfigured) return [];
    const limit = options?.limit ?? 200;
    const offset = options?.offset ?? 0;
    try {
      const { data, error } = await supabase
        .from('bank_reconciliation_matches')
        .select('*')
        .range(offset, offset + limit - 1)
        .order('id', { ascending: false });
      if (error) {
        logSupabaseError('fetchBankReconciliationMatches', error);
        return [];
      }
      return (data || []).map((item: any) => ({
        id: item.id,
        bank_statement_id: item.bank_statement_id,
        clearing_transaction_id: item.clearing_transaction_id,
        matched_amount: Number(item.matched_amount || 0),
        fee_amount: Number(item.fee_amount || 0),
        difference_amount: Number(item.difference_amount || 0),
        adjustment_category: item.adjustment_category,
        status: item.status,
        notes: item.notes,
        created_by: item.created_by,
        created_at: item.created_at,
        property_id: item.property_id
      }));
    } catch (err) {
      logSupabaseError('fetchBankReconciliationMatches', err, true);
      return [];
    }
  },

  async resetPlayground() {
    window.location.reload();
  }
};
