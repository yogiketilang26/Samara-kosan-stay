import { supabase, isSupabaseConfigured, logSupabaseError, notifyRealtimeMutation } from '../lib/supabase';
import { FixedAsset } from '../types';

/**
 * Production-grade Atomic Asset Service
 * Ensures all mutations (create, update, delete) are atomic and consistent with database state.
 */
export const assetService = {
  /**
   * Fetch all fixed assets with optional property scoping
   */
  async getAssets(propertyId?: string | number): Promise<FixedAsset[]> {
    if (!isSupabaseConfigured) {
      try {
        const raw = localStorage.getItem('kamar_fixed_assets');
        const list: FixedAsset[] = raw ? JSON.parse(raw) : [];
        if (propertyId) {
          return list.filter(a => String(a.property_id) === String(propertyId));
        }
        return list;
      } catch {
        return [];
      }
    }

    try {
      let query = supabase
        .from('fixed_assets')
        .select('*')
        .order('id', { ascending: false });

      if (propertyId) {
        query = query.eq('property_id', propertyId);
      }

      const { data, error } = await query;
      if (error) {
        logSupabaseError('assetService.getAssets', error);
        throw error;
      }

      const mapped: FixedAsset[] = (data || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        cost: Number(row.cost || 0),
        lifeYears: Number(row.life_years || 1),
        residual: Number(row.residual || 0),
        deprRate: Number(row.depr_rate || 0),
        accumDepr: Number(row.accum_depr || 0),
        property_id: row.property_id,
        location: row.location || undefined,
        category: row.category || undefined,
        maintenance_interval_months: row.maintenance_interval_months || undefined,
        last_maintenance_date: row.last_maintenance_date || undefined,
        next_maintenance_date: row.next_maintenance_date || undefined,
        maintenance_notes: row.maintenance_notes || undefined,
        condition: row.condition || 'Baik',
        last_repair_cost: row.last_repair_cost ? Number(row.last_repair_cost) : undefined,
        created_at: row.created_at
      }));

      try {
        localStorage.setItem('kamar_fixed_assets', JSON.stringify(mapped));
      } catch {}

      return mapped;
    } catch (err) {
      logSupabaseError('assetService.getAssets', err, true);
      // Resilient fallback to local cache
      try {
        const raw = localStorage.getItem('kamar_fixed_assets');
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    }
  },

  /**
   * Atomically save or update a fixed asset
   */
  async saveAsset(asset: Partial<FixedAsset>): Promise<FixedAsset> {
    const id = asset.id;
    const payload: any = {
      name: asset.name,
      cost: Number(asset.cost ?? 0),
      life_years: Number(asset.lifeYears ?? 1),
      residual: Number(asset.residual ?? 0),
      depr_rate: Number(asset.deprRate ?? 0),
      accum_depr: Number(asset.accumDepr ?? 0)
    };

    if (asset.property_id !== undefined) payload.property_id = asset.property_id;
    if (asset.location !== undefined) payload.location = asset.location;
    if (asset.category !== undefined) payload.category = asset.category;
    if (asset.maintenance_interval_months !== undefined) payload.maintenance_interval_months = asset.maintenance_interval_months;
    if (asset.last_maintenance_date !== undefined) payload.last_maintenance_date = asset.last_maintenance_date;
    if (asset.next_maintenance_date !== undefined) payload.next_maintenance_date = asset.next_maintenance_date;
    if (asset.maintenance_notes !== undefined) payload.maintenance_notes = asset.maintenance_notes;
    if (asset.condition !== undefined) payload.condition = asset.condition;
    if (asset.last_repair_cost !== undefined) payload.last_repair_cost = Number(asset.last_repair_cost);

    let persistedRecord: FixedAsset;

    if (isSupabaseConfigured) {
      const query = id
        ? supabase.from('fixed_assets').update(payload).eq('id', id).select().single()
        : supabase.from('fixed_assets').insert(payload).select().single();

      const { data, error } = await query;
      if (error) {
        logSupabaseError('assetService.saveAsset', error);
        throw new Error(`Gagal menyimpan data aset: ${error.message}`);
      }

      persistedRecord = {
        id: data.id,
        name: data.name,
        cost: Number(data.cost || 0),
        lifeYears: Number(data.life_years || 1),
        residual: Number(data.residual || 0),
        deprRate: Number(data.depr_rate || 0),
        accumDepr: Number(data.accum_depr || 0),
        property_id: data.property_id,
        location: data.location,
        category: data.category,
        maintenance_interval_months: data.maintenance_interval_months,
        last_maintenance_date: data.last_maintenance_date,
        next_maintenance_date: data.next_maintenance_date,
        maintenance_notes: data.maintenance_notes,
        condition: data.condition || 'Baik',
        last_repair_cost: data.last_repair_cost ? Number(data.last_repair_cost) : undefined,
        created_at: data.created_at
      };
    } else {
      persistedRecord = {
        id: id || Date.now(),
        name: asset.name || 'Aset Tanpa Nama',
        cost: Number(asset.cost ?? 0),
        lifeYears: Number(asset.lifeYears ?? 1),
        residual: Number(asset.residual ?? 0),
        deprRate: Number(asset.deprRate ?? 0),
        accumDepr: Number(asset.accumDepr ?? 0),
        property_id: asset.property_id,
        location: asset.location,
        category: asset.category,
        condition: asset.condition || 'Baik',
        created_at: new Date().toISOString()
      };
    }

    // Atomic cache synchronization only after successful persistence
    try {
      const raw = localStorage.getItem('kamar_fixed_assets');
      let list: FixedAsset[] = raw ? JSON.parse(raw) : [];
      if (id) {
        list = list.map(item => item.id === id ? persistedRecord : item);
      } else {
        list.push(persistedRecord);
      }
      localStorage.setItem('kamar_fixed_assets', JSON.stringify(list));
    } catch {}

    notifyRealtimeMutation('fixed_assets', id ? 'UPDATE' : 'INSERT', persistedRecord);
    return persistedRecord;
  },

  /**
   * Atomically delete a fixed asset
   */
  async deleteAsset(id: number): Promise<boolean> {
    if (isSupabaseConfigured) {
      const { error } = await supabase.from('fixed_assets').delete().eq('id', id);
      if (error) {
        logSupabaseError('assetService.deleteAsset', error);
        throw new Error(`Gagal menghapus data aset: ${error.message}`);
      }
    }

    // Atomic cache cleanup after successful DB deletion
    try {
      const raw = localStorage.getItem('kamar_fixed_assets');
      if (raw) {
        const list: FixedAsset[] = JSON.parse(raw);
        const filtered = list.filter(item => item.id !== id);
        localStorage.setItem('kamar_fixed_assets', JSON.stringify(filtered));
      }
    } catch {}

    notifyRealtimeMutation('fixed_assets', 'DELETE', { id });
    return true;
  }
};
