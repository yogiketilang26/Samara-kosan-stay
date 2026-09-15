import React, { useState, useMemo, useEffect } from 'react';
import { 
  Wrench, AlertTriangle, Clock, Calendar, Plus, Edit2, 
  Trash2, Search, Filter, CheckCircle2, RefreshCw, X, Box, Tag, 
  MapPin, Building2, ArrowRightLeft, Check, ChevronRight, AlertCircle,
  Sparkles, Layers, DollarSign, Receipt, CreditCard, ArrowUpRight,
  ShieldCheck, CheckSquare
} from 'lucide-react';
import { FixedAsset, Property } from '../types';
import { formatRupiah } from '../utils/formatCurrency';
import { database } from '../lib/supabase';

interface AssetManagementSectionProps {
  assets: FixedAsset[];
  properties: Property[];
  selectedPropertyId?: string;
  readOnly?: boolean; // True for Owner (read-only view), False for Super Admin & Staff Admin
  userRole?: 'admin' | 'staff' | 'owner';
  onRefresh?: () => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const AssetManagementSection: React.FC<AssetManagementSectionProps> = ({
  assets,
  properties,
  selectedPropertyId = 'all',
  readOnly = false,
  userRole = 'admin',
  onRefresh,
  showToast
}) => {
  // Selected Building state: 'all', or specific property ID string
  const [activePropertyId, setActivePropertyId] = useState<string>(() => {
    if (selectedPropertyId && selectedPropertyId !== 'all') {
      return String(selectedPropertyId);
    }
    return properties[0] ? String(properties[0].id) : 'all';
  });

  // Sync when parent changes selectedPropertyId
  useEffect(() => {
    if (selectedPropertyId && selectedPropertyId !== 'all') {
      setActivePropertyId(String(selectedPropertyId));
    }
  }, [selectedPropertyId]);

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // Modals
  const [showModal, setShowModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState<FixedAsset | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<number | null>(null);

  // Dedicated Service / Maintenance Modal with Optional Financial Expense Integration
  const [servicingAsset, setServicingAsset] = useState<FixedAsset | null>(null);
  const [serviceDate, setServiceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [serviceIntervalMonths, setServiceIntervalMonths] = useState<number>(3);
  const [serviceNextDate, setServiceNextDate] = useState<string>('');
  const [serviceCondition, setServiceCondition] = useState<'Baik' | 'Perlu Servis' | 'Rusak Ringan' | 'Rusak Berat'>('Baik');
  const [serviceNotes, setServiceNotes] = useState<string>('');
  const [serviceRepairCost, setServiceRepairCost] = useState<string>('');
  const [servicePostToFinance, setServicePostToFinance] = useState<boolean>(true);
  const [serviceDebitAccountId, setServiceDebitAccountId] = useState<number>(5100); // 5100 Beban Pemeliharaan & Perbaikan Gedung
  const [serviceCreditAccountId, setServiceCreditAccountId] = useState<number>(1010); // 1010 Bank Mandiri, 1000 Kas Tunai
  const [serviceVendorName, setServiceVendorName] = useState<string>('');
  const [isRecordingService, setIsRecordingService] = useState<boolean>(false);

  // Asset Transfer / Mutation Modal
  const [transferringAsset, setTransferringAsset] = useState<FixedAsset | null>(null);
  const [targetPropertyId, setTargetPropertyId] = useState<number>(properties[0]?.id || 1);
  const [targetLocation, setTargetLocation] = useState<string>('');
  const [isTransferring, setIsTransferring] = useState(false);

  // Form State
  const [formData, setFormData] = useState<{
    name: string;
    property_id: number;
    location: string;
    category: string;
    cost: number;
    lifeYears: number;
    residual: number;
    maintenance_interval_months: number;
    last_maintenance_date: string;
    next_maintenance_date: string;
    maintenance_notes: string;
    last_repair_cost: number | '';
    post_repair_cost_now: boolean;
    condition: 'Baik' | 'Perlu Servis' | 'Rusak Ringan' | 'Rusak Berat';
  }>({
    name: '',
    property_id: properties[0]?.id || 1,
    location: '',
    category: 'Elektronik & AC',
    cost: 0,
    lifeYears: 5,
    residual: 0,
    maintenance_interval_months: 3,
    last_maintenance_date: new Date().toISOString().split('T')[0],
    next_maintenance_date: '',
    maintenance_notes: '',
    last_repair_cost: '',
    post_repair_cost_now: false,
    condition: 'Baik'
  });

  // Calculate Next Maintenance Date automatically based on interval
  const calculateNextDate = (lastDateStr: string, intervalMonths: number) => {
    if (!lastDateStr) return '';
    try {
      const d = new Date(lastDateStr);
      d.setMonth(d.getMonth() + Number(intervalMonths || 3));
      return d.toISOString().split('T')[0];
    } catch {
      return '';
    }
  };

  // Group assets by property
  const today = new Date().toISOString().split('T')[0];

  const propertyStats = useMemo(() => {
    const stats: Record<string, { total: number; totalCost: number; due: number; needRepair: number }> = {};
    
    properties.forEach(p => {
      stats[String(p.id)] = { total: 0, totalCost: 0, due: 0, needRepair: 0 };
    });
    stats['unassigned'] = { total: 0, totalCost: 0, due: 0, needRepair: 0 };

    assets.forEach(a => {
      const key = a.property_id && properties.some(p => p.id === a.property_id) 
        ? String(a.property_id) 
        : 'unassigned';
      
      if (!stats[key]) {
        stats[key] = { total: 0, totalCost: 0, due: 0, needRepair: 0 };
      }

      stats[key].total += 1;
      stats[key].totalCost += (a.cost || 0);
      if (a.next_maintenance_date && a.next_maintenance_date <= today) {
        stats[key].due += 1;
      }
      if (a.condition && a.condition !== 'Baik') {
        stats[key].needRepair += 1;
      }
    });

    return stats;
  }, [assets, properties, today]);

  // Current Active Property Details
  const activeProperty = useMemo(() => {
    if (activePropertyId === 'all' || activePropertyId === 'unassigned') return null;
    return properties.find(p => String(p.id) === String(activePropertyId)) || null;
  }, [activePropertyId, properties]);

  // Filtered Assets based on building tab & sub-filters
  const filteredAssets = useMemo(() => {
    return assets.filter(a => {
      // 1. Building Tab Filter
      if (activePropertyId === 'unassigned') {
        if (a.property_id && properties.some(p => p.id === a.property_id)) return false;
      } else if (activePropertyId !== 'all') {
        if (String(a.property_id) !== String(activePropertyId)) return false;
      }

      // 2. Search Query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchName = a.name.toLowerCase().includes(query);
        const matchLoc = a.location && a.location.toLowerCase().includes(query);
        const matchNotes = a.maintenance_notes && a.maintenance_notes.toLowerCase().includes(query);
        if (!matchName && !matchLoc && !matchNotes) return false;
      }

      // 3. Category Filter
      if (categoryFilter !== 'all' && a.category !== categoryFilter) {
        return false;
      }

      // 4. Status Servis Filter
      if (statusFilter === 'due') {
        if (!a.next_maintenance_date || a.next_maintenance_date > today) return false;
      } else if (statusFilter === 'need_service') {
        if (a.condition === 'Baik') return false;
      }

      return true;
    });
  }, [assets, activePropertyId, searchQuery, categoryFilter, statusFilter, properties, today]);

  // Metrics for Current Selection
  const currentMetrics = useMemo(() => {
    const totalAssets = filteredAssets.length;
    const totalCost = filteredAssets.reduce((sum, a) => sum + (a.cost || 0), 0);
    const needService = filteredAssets.filter(a => a.condition && a.condition !== 'Baik').length;
    const dueMaintenance = filteredAssets.filter(a => a.next_maintenance_date && a.next_maintenance_date <= today).length;
    const totalRepairCost = filteredAssets.reduce((sum, a) => sum + (a.last_repair_cost || 0), 0);
    return { totalAssets, totalCost, needService, dueMaintenance, totalRepairCost };
  }, [filteredAssets, today]);

  // Handle Open Add
  const handleOpenAdd = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const defaultPropId = activePropertyId !== 'all' && activePropertyId !== 'unassigned'
      ? Number(activePropertyId)
      : (properties[0]?.id || 1);

    setEditingAsset(null);
    setFormData({
      name: '',
      property_id: defaultPropId,
      location: '',
      category: 'Elektronik & AC',
      cost: 0,
      lifeYears: 5,
      residual: 0,
      maintenance_interval_months: 3,
      last_maintenance_date: todayStr,
      next_maintenance_date: calculateNextDate(todayStr, 3),
      maintenance_notes: '',
      last_repair_cost: '',
      post_repair_cost_now: false,
      condition: 'Baik'
    });
    setShowModal(true);
  };

  // Handle Open Edit
  const handleOpenEdit = (asset: FixedAsset) => {
    setEditingAsset(asset);
    setFormData({
      name: asset.name,
      property_id: asset.property_id || properties[0]?.id || 1,
      location: asset.location || '',
      category: asset.category || 'Elektronik & AC',
      cost: asset.cost || 0,
      lifeYears: asset.lifeYears || 5,
      residual: asset.residual || 0,
      maintenance_interval_months: asset.maintenance_interval_months || 3,
      last_maintenance_date: asset.last_maintenance_date || '',
      next_maintenance_date: asset.next_maintenance_date || calculateNextDate(asset.last_maintenance_date || '', asset.maintenance_interval_months || 3),
      maintenance_notes: asset.maintenance_notes || '',
      last_repair_cost: asset.last_repair_cost || '',
      post_repair_cost_now: false,
      condition: asset.condition || 'Baik'
    });
    setShowModal(true);
  };

  // Handle Form Submit (Add / Edit Asset)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    try {
      setIsSubmitting(true);
      const deprRate = formData.cost > 0 && formData.lifeYears > 0 
        ? Math.round((formData.cost - formData.residual) / (formData.lifeYears * 12)) 
        : 0;

      const numericRepairCost = Number(formData.last_repair_cost) || 0;

      const payload: Partial<FixedAsset> = {
        name: formData.name.trim(),
        property_id: Number(formData.property_id),
        location: formData.location.trim(),
        category: formData.category,
        cost: Number(formData.cost),
        lifeYears: Number(formData.lifeYears),
        residual: Number(formData.residual),
        deprRate: deprRate,
        accumDepr: editingAsset ? editingAsset.accumDepr : 0,
        maintenance_interval_months: Number(formData.maintenance_interval_months),
        last_maintenance_date: formData.last_maintenance_date,
        next_maintenance_date: formData.next_maintenance_date || calculateNextDate(formData.last_maintenance_date, formData.maintenance_interval_months),
        maintenance_notes: formData.maintenance_notes.trim(),
        last_repair_cost: numericRepairCost,
        condition: formData.condition
      };

      if (editingAsset) {
        payload.id = editingAsset.id;
      }

      await database.saveFixedAsset(payload);
      
      const propObj = properties.find(p => p.id === payload.property_id);

      // Opsional: Posting biaya servis langsung ke Laporan Keuangan
      if (formData.post_repair_cost_now && numericRepairCost > 0) {
        try {
          await database.recordFinancialExpense(
            5100, // Beban Pemeliharaan & Perbaikan Gedung
            1010, // Kas Utama Bank Mandiri Operasional
            numericRepairCost,
            `[BIAYA SERVIS ASET] ${payload.name} (${payload.category || 'Aset'}) di ${propObj ? propObj.name : 'Gedung'} - Lokasi: ${payload.location || 'Umum'}`,
            'Pemeliharaan Gedung',
            payload.property_id,
            'fixed_asset_maintenance',
            String(payload.id || Date.now()),
            userRole === 'owner' ? 'Owner' : userRole === 'staff' ? 'Staff Lapangan' : 'Super Admin'
          );
        } catch (fErr: any) {
          console.warn('Gagal posting transaksi keuangan aset:', fErr);
        }
      }

      await database.logActivity(
        userRole.toUpperCase(),
        editingAsset ? 'UPDATE_ASSET' : 'CREATE_ASSET',
        `${editingAsset ? 'Mengubah aset' : 'Menambahkan aset'} "${payload.name}" di Gedung "${propObj ? propObj.name : 'Gedung #' + payload.property_id}"${numericRepairCost > 0 ? ` (Biaya perbaikan: ${formatRupiah(numericRepairCost)})` : ''}`
      );

      if (showToast) {
        showToast(
          `Aset "${payload.name}" berhasil ${editingAsset ? 'diperbarui' : 'didaftarkan'}!${formData.post_repair_cost_now && numericRepairCost > 0 ? ` Biaya perbaikan ${formatRupiah(numericRepairCost)} langsung dibukukan ke Laporan Keuangan.` : ''}`,
          'success'
        );
      }
      setShowModal(false);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      if (showToast) showToast(`Gagal menyimpan aset: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Delete
  const handleDelete = async (asset: FixedAsset) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus data aset "${asset.name}"? Tindakan ini tidak dapat dibatalkan.`)) {
      return;
    }

    try {
      setIsDeletingId(asset.id);
      await database.deleteFixedAsset(asset.id);
      await database.logActivity(
        userRole.toUpperCase(),
        'DELETE_ASSET',
        `Menghapus aset "${asset.name}" (ID #${asset.id}) dari sistem`
      );

      if (showToast) showToast(`Aset "${asset.name}" berhasil dihapus.`, 'info');
      if (onRefresh) onRefresh();
    } catch (err: any) {
      if (showToast) showToast(`Gagal menghapus aset: ${err.message}`, 'error');
    } finally {
      setIsDeletingId(null);
    }
  };

  // Open Service Modal
  const handleOpenServiceModal = (asset: FixedAsset) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const interval = asset.maintenance_interval_months || 3;
    setServicingAsset(asset);
    setServiceDate(todayStr);
    setServiceIntervalMonths(interval);
    setServiceNextDate(calculateNextDate(todayStr, interval));
    setServiceCondition('Baik');
    setServiceNotes(asset.maintenance_notes ? `Servis rutin berkala. ${asset.maintenance_notes}` : 'Servis berkala & pembersihan rutin.');
    setServiceRepairCost(asset.last_repair_cost ? String(asset.last_repair_cost) : '');
    setServicePostToFinance(true);
    setServiceDebitAccountId(5100);
    setServiceCreditAccountId(1010);
    setServiceVendorName('');
  };

  // Quick 1-Click Action: Mark Maintenance Complete
  const handleMarkMaintenanceDone = (asset: FixedAsset) => {
    handleOpenServiceModal(asset);
  };

  // Submit Service & Optional Financial Posting
  const handleSubmitService = async (e?: React.FormEvent, forceZeroCost: boolean = false) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!servicingAsset) return;

    const numericCost = forceZeroCost ? 0 : (Number(serviceRepairCost) || 0);
    const shouldPostFinance = !forceZeroCost && servicePostToFinance && numericCost > 0;

    try {
      setIsRecordingService(true);
      const propObj = properties.find(p => p.id === servicingAsset.property_id);
      
      const result = await database.recordAssetMaintenanceWithExpense({
        asset: servicingAsset,
        serviceDate,
        nextServiceDate: serviceNextDate || calculateNextDate(serviceDate, serviceIntervalMonths),
        condition: serviceCondition,
        notes: serviceNotes,
        repairCost: numericCost,
        postToFinance: shouldPostFinance,
        debitAccountId: serviceDebitAccountId,
        creditAccountId: serviceCreditAccountId,
        vendorName: serviceVendorName,
        propertyId: servicingAsset.property_id,
        recordedBy: userRole === 'owner' ? 'Owner' : userRole === 'staff' ? 'Staff Lapangan' : 'Super Admin'
      });

      await database.logActivity(
        userRole.toUpperCase(),
        'MAINTENANCE_RECORDED',
        `Servis selesai untuk aset "${servicingAsset.name}" (${propObj ? propObj.name : 'Gedung Kos'}). Biaya: ${numericCost > 0 ? formatRupiah(numericCost) : 'Rp 0'}${shouldPostFinance ? ' (Otomatis masuk Jurnal & Lap. Keuangan)' : ''}. Jadwal servis berikutnya: ${result.asset.next_maintenance_date}`
      );

      if (showToast) {
        showToast(
          `Servis untuk "${servicingAsset.name}" berhasil dicatat!${shouldPostFinance ? ` Biaya ${formatRupiah(numericCost)} otomatis dibukukan ke Laporan Keuangan.` : ''}`,
          'success'
        );
      }

      setServicingAsset(null);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      if (showToast) showToast(`Gagal mencatat pemeliharaan: ${err.message}`, 'error');
    } finally {
      setIsRecordingService(false);
    }
  };

  // Open Asset Mutation / Transfer Modal
  const handleOpenTransfer = (asset: FixedAsset) => {
    setTransferringAsset(asset);
    setTargetPropertyId(properties[0]?.id || 1);
    setTargetLocation(asset.location || '');
  };

  // Execute Asset Transfer / Mutation
  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferringAsset) return;

    try {
      setIsTransferring(true);
      const sourceProp = properties.find(p => p.id === transferringAsset.property_id);
      const destProp = properties.find(p => p.id === targetPropertyId);

      await database.saveFixedAsset({
        ...transferringAsset,
        property_id: targetPropertyId,
        location: targetLocation.trim(),
        maintenance_notes: `${transferringAsset.maintenance_notes ? transferringAsset.maintenance_notes + ' | ' : ''}Mutasi dari ${sourceProp ? sourceProp.name : 'Gedung lama'} ke ${destProp ? destProp.name : 'Gedung baru'} (${new Date().toISOString().split('T')[0]})`
      });

      await database.logActivity(
        userRole.toUpperCase(),
        'TRANSFER_ASSET',
        `Memindahkan aset "${transferringAsset.name}" dari "${sourceProp ? sourceProp.name : 'Gedung'}" ke "${destProp ? destProp.name : 'Gedung'}"`
      );

      if (showToast) {
        showToast(`Aset "${transferringAsset.name}" berhasil dipindahkan ke ${destProp ? destProp.name : 'gedung tujuan'}!`, 'success');
      }
      setTransferringAsset(null);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      if (showToast) showToast(`Gagal memindahkan aset: ${err.message}`, 'error');
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in font-sans">
      
      {/* 1. GEDUNG KOST SELECTOR BAR (Pemisah Aset Per Gedung Kost) */}
      <div className="bg-slate-900 rounded-2xl p-3 border border-slate-800 shadow-md">
        <div className="flex items-center justify-between gap-2 mb-2 px-1">
          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-teal-400" />
            <span className="text-xs font-black uppercase tracking-wider text-slate-300 font-mono">
              Pilih Gedung Kost (Data Aset Terpisah)
            </span>
          </div>
          <span className="text-[11px] text-slate-400 hidden sm:inline">
            Tiap kost memiliki inventaris aset & jadwal pemeliharaan mandiri
          </span>
        </div>

        {/* Tab Pills Per Gedung */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {properties.map(p => {
            const pid = String(p.id);
            const stats = propertyStats[pid] || { total: 0, totalCost: 0, due: 0, needRepair: 0 };
            const isActive = activePropertyId === pid;

            return (
              <button
                key={p.id}
                onClick={() => setActivePropertyId(pid)}
                className={`px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2.5 transition-all shrink-0 cursor-pointer border ${
                  isActive
                    ? 'bg-teal-500 text-slate-950 border-teal-400 shadow-md shadow-teal-500/20'
                    : 'bg-slate-950/70 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Building2 size={14} className={isActive ? 'text-slate-950' : 'text-teal-400'} />
                <span className="truncate max-w-[180px]">{p.name}</span>
                
                {/* Count Badge */}
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black font-mono ${
                  isActive ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-300'
                }`}>
                  {stats.total} Unit
                </span>

                {/* Due Alert Dot */}
                {stats.due > 0 && (
                  <span 
                    className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" 
                    title={`${stats.due} aset jatuh tempo servis`}
                  />
                )}
              </button>
            );
          })}

          {/* Tab: Semua Gedung / Konsolidasi Portofolio */}
          <button
            onClick={() => setActivePropertyId('all')}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shrink-0 cursor-pointer border ${
              activePropertyId === 'all'
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/20'
                : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Layers size={14} className={activePropertyId === 'all' ? 'text-white' : 'text-indigo-400'} />
            <span>Semua Gedung (Ringkasan Konsolidasi)</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black font-mono ${
              activePropertyId === 'all' ? 'bg-indigo-800 text-white' : 'bg-slate-800 text-slate-400'
            }`}>
              {assets.length} Unit
            </span>
          </button>

          {/* Unassigned Assets Tab (if any) */}
          {(propertyStats['unassigned']?.total || 0) > 0 && (
            <button
              onClick={() => setActivePropertyId('unassigned')}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer border ${
                activePropertyId === 'unassigned'
                  ? 'bg-amber-500 text-slate-950 border-amber-400'
                  : 'bg-amber-950/40 text-amber-300 border-amber-800/60 hover:bg-amber-900/60'
              }`}
            >
              <AlertCircle size={13} />
              <span>Belum Ada Gedung ({propertyStats['unassigned'].total})</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. ACTIVE BUILDING BANNER & QUICK STATS */}
      {activeProperty ? (
        <div className="bg-gradient-to-r from-teal-900/40 via-slate-900 to-slate-900 p-4 rounded-2xl border border-teal-800/40 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-teal-500/20 text-teal-300 text-[10px] font-black uppercase tracking-wider font-mono border border-teal-500/30">
                Gedung Terpilih
              </span>
              <h2 className="text-base font-black text-white font-display">
                {activeProperty.name}
              </h2>
            </div>
            <p className="text-xs text-slate-300 flex items-center gap-1.5">
              <MapPin size={12} className="text-teal-400 shrink-0" />
              <span>{activeProperty.address || 'Alamat lokasi properti'}</span>
              {activeProperty.city && <span>• Kota {activeProperty.city}</span>}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {!readOnly && (
              <button
                onClick={handleOpenAdd}
                className="px-3.5 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-black rounded-xl flex items-center gap-1.5 shadow-md shadow-teal-500/20 transition-all cursor-pointer"
              >
                <Plus size={14} />
                <span>+ Tambah Aset di Gedung Ini</span>
              </button>
            )}
          </div>
        </div>
      ) : activePropertyId === 'all' ? (
        <div className="bg-slate-900 p-4 rounded-2xl border border-indigo-900/40 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 text-[10px] font-black uppercase tracking-wider font-mono border border-indigo-500/30">
                Portofolio Konsolidasi
              </span>
              <h2 className="text-base font-black text-white font-display">
                Seluruh Gedung Kost ({properties.length} Lokasi)
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Menampilkan total gabungan register inventaris seluruh cabang kost di bawah naungan portofolio.
            </p>
          </div>

          {!readOnly && (
            <button
              onClick={handleOpenAdd}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer self-start md:self-auto"
            >
              <Plus size={14} />
              <span>Tambah Aset Baru</span>
            </button>
          )}
        </div>
      ) : (
        <div className="bg-amber-950/40 p-4 rounded-2xl border border-amber-800/60 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-black text-amber-200">
              Aset Belum Ditetapkan ke Gedung Tertentu
            </h2>
            <p className="text-xs text-amber-300/80 mt-0.5">
              Aset di bawah ini belum memiliki ID properti. Silakan mutasikan atau tetapkan gedung tujuannya.
            </p>
          </div>
        </div>
      )}

      {/* 3. QUICK METRIC CARDS (Dihitung 100% Khusus Untuk Gedung yang Sedang Dipilih) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">
              {activeProperty ? `Aset ${activeProperty.name}` : 'Total Register Aset'}
            </span>
            <Box size={16} className="text-teal-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">
            {currentMetrics.totalAssets} Unit
          </div>
          <span className="text-[11px] text-slate-400">
            {activeProperty ? 'Khusus gedung ini' : 'Seluruh cabang portofolio'}
          </span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Nilai Pengadaan Aset</span>
            <Tag size={16} className="text-indigo-600" />
          </div>
          <div className="text-lg font-black text-slate-900 font-mono truncate">
            {formatRupiah(currentMetrics.totalCost)}
          </div>
          <span className="text-[11px] text-slate-400">Total nilai kapitalisasi aset</span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Biaya Servis Tercatat</span>
            <Receipt size={16} className="text-emerald-600" />
          </div>
          <div className="text-lg font-black text-emerald-700 font-mono truncate">
            {formatRupiah(currentMetrics.totalRepairCost)}
          </div>
          <span className="text-[11px] text-slate-400">Otomatis masuk lap. keuangan</span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Jatuh Tempo Servis</span>
            <Clock size={16} className="text-rose-500" />
          </div>
          <div className={`text-2xl font-black font-mono ${currentMetrics.dueMaintenance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {currentMetrics.dueMaintenance} Unit
          </div>
          <span className="text-[11px] text-slate-400">
            {currentMetrics.dueMaintenance > 0 ? 'Perlu tindakan pemeliharaan' : 'Semua servis terjadwal aman'}
          </span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Kondisi Butuh Perbaikan</span>
            <AlertTriangle size={16} className="text-amber-500" />
          </div>
          <div className={`text-2xl font-black font-mono ${currentMetrics.needService > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {currentMetrics.needService} Unit
          </div>
          <span className="text-[11px] text-slate-400">
            {currentMetrics.needService > 0 ? 'Perlu servis/perbaikan teknisi' : 'Kondisi fisik 100% prima'}
          </span>
        </div>
      </div>

      {/* 4. PER-GEDUNG BENTO SUMMARY (Hanya muncul saat mode "Semua Gedung" aktif) */}
      {activePropertyId === 'all' && properties.length > 1 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span className="font-bold uppercase tracking-wider">Ringkasan Aset Masing-Masing Gedung Kost</span>
            <span>Klik tombol untuk masuk ke inventaris spesifik</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {properties.map(p => {
              const pid = String(p.id);
              const stats = propertyStats[pid] || { total: 0, totalCost: 0, due: 0, needRepair: 0 };

              return (
                <div 
                  key={p.id}
                  className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs hover:border-teal-500/50 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">{p.name}</h4>
                        <p className="text-[11px] text-slate-400 truncate max-w-[220px]">
                          {p.address || 'Alamat properti'}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded-lg bg-teal-50 text-teal-700 border border-teal-200 text-[11px] font-bold font-mono">
                        {stats.total} Aset
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 my-3 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-150">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">Nilai Aset</span>
                        <span className="font-bold text-slate-800 font-mono text-[11px]">
                          {formatRupiah(stats.totalCost)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">Jatuh Tempo</span>
                        <span className={`font-bold font-mono text-[11px] ${stats.due > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {stats.due} Servis
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setActivePropertyId(pid)}
                    className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-teal-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>Kelola Aset Gedung Ini</span>
                    <ChevronRight size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. SEARCH & FILTER TOOLBAR */}
      <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* Search */}
          <div className="relative w-full md:w-64">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={activeProperty ? `Cari aset di ${activeProperty.name}...` : "Cari nama aset / lokasi..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-teal-500"
            />
          </div>

          {/* Kategori Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 outline-none focus:border-teal-500"
          >
            <option value="all">Semua Kategori</option>
            <option value="Elektronik & AC">Elektronik & AC</option>
            <option value="Mesin & Pompa Air">Mesin & Pompa Air</option>
            <option value="Keamanan & CCTV">Keamanan & CCTV</option>
            <option value="Furnitur">Furnitur & Kasur</option>
            <option value="Struktur Bangunan">Struktur Bangunan</option>
            <option value="Lainnya">Lainnya</option>
          </select>

          {/* Filter Status Servis */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 outline-none focus:border-teal-500"
          >
            <option value="all">Semua Jadwal Servis</option>
            <option value="due">Waktunya Servis / Lewat Jatuh Tempo</option>
            <option value="need_service">Kondisi Butuh Perbaikan</option>
          </select>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer"
              title="Segarkan data aset"
            >
              <RefreshCw size={14} />
            </button>
          )}

          {!readOnly && (
            <button
              onClick={handleOpenAdd}
              className="px-3.5 py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Plus size={14} />
              <span>Tambah Aset</span>
            </button>
          )}
        </div>
      </div>

      {/* 6. TABEL INVENTARIS ASET (Terpisah Sesuai Gedung Terpilih) */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 font-display flex items-center gap-2">
              <Wrench size={16} className="text-teal-600" />
              <span>
                {activeProperty 
                  ? `Inventaris Aset Gedung: ${activeProperty.name}` 
                  : 'Register Inventaris Seluruh Portofolio'}
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              {readOnly 
                ? 'Monitoring kondisi aset dan jangka waktu pemeliharaan (Mode Pantau Owner)' 
                : `Kelola inventaris aset, lokasi kamar, biaya, dan jadwal servis berkala`}
            </p>
          </div>
          <span className="text-xs font-bold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full font-mono">
            {filteredAssets.length} Aset Terdaftar
          </span>
        </div>

        {filteredAssets.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Box size={36} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm font-semibold">
              {activeProperty 
                ? `Belum ada aset terdaftar di ${activeProperty.name}` 
                : 'Belum ada aset terdaftar di sistem'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {!readOnly 
                ? `Klik tombol "Tambah Aset" di atas untuk mendaftarkan aset baru ke ${activeProperty ? activeProperty.name : 'gedung ini'}.`
                : 'Tidak ada data aset yang cocok dengan filter yang dipilih.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono border-b border-slate-200">
                  <th className="py-3 px-4">Nama Aset & Kategori</th>
                  {activePropertyId === 'all' && (
                    <th className="py-3 px-4">Gedung Kost</th>
                  )}
                  <th className="py-3 px-4">Lokasi Spesifik</th>
                  <th className="py-3 px-4">Biaya Pengadaan</th>
                  <th className="py-3 px-4">Jangka Servis</th>
                  <th className="py-3 px-4">Jadwal Servis Berikutnya</th>
                  <th className="py-3 px-4">Kondisi</th>
                  {!readOnly && <th className="py-3 px-4 text-right">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAssets.map(asset => {
                  const isDue = asset.next_maintenance_date && asset.next_maintenance_date <= today;
                  const prop = properties.find(p => p.id === asset.property_id);

                  return (
                    <tr key={asset.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Nama & Kategori */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800 text-xs">{asset.name}</div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <span className="px-1.5 py-0.2 rounded bg-slate-100 font-medium">
                            {asset.category || 'Elektronik'}
                          </span>
                          {asset.maintenance_notes && (
                            <span className="text-slate-400 italic truncate max-w-[200px]" title={asset.maintenance_notes}>
                              - {asset.maintenance_notes}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Gedung Kost (Hanya jika melihat Semua Gedung) */}
                      {activePropertyId === 'all' && (
                        <td className="py-3.5 px-4">
                          {prop ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-teal-50 text-teal-800 border border-teal-200/60 text-[11px] font-bold">
                              <Building2 size={11} className="text-teal-600 shrink-0" />
                              <span className="truncate max-w-[130px]">{prop.name}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold">
                              <AlertCircle size={10} />
                              <span>Belum Ditentukan</span>
                            </span>
                          )}
                        </td>
                      )}

                      {/* Lokasi Spesifik di Gedung */}
                      <td className="py-3.5 px-4 text-slate-600">
                        <div className="flex items-center gap-1 font-medium">
                          <MapPin size={12} className="text-slate-400 shrink-0" />
                          <span>{asset.location || 'Unit Umum Gedung'}</span>
                        </div>
                      </td>

                      {/* Biaya */}
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-800">
                        {formatRupiah(asset.cost || 0)}
                        <div className="text-[10px] text-slate-400 font-sans font-normal">
                          Umur: {asset.lifeYears || 1} Thn
                        </div>
                      </td>

                      {/* Jangka Waktu Pemeliharaan */}
                      <td className="py-3.5 px-4 font-medium text-slate-700">
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-teal-50 text-teal-700 border border-teal-200 text-[11px] font-bold">
                          <Clock size={12} />
                          <span>Tiap {asset.maintenance_interval_months || 3} Bulan</span>
                        </div>
                        {asset.last_maintenance_date && (
                          <div className="text-[10px] text-slate-400 mt-1">
                            Servis Terakhir: {asset.last_maintenance_date}
                          </div>
                        )}
                        {asset.last_repair_cost !== undefined && asset.last_repair_cost > 0 && (
                          <div className="mt-1 flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 w-fit" title="Biaya perbaikan tercatat di Laporan Keuangan">
                            <Receipt size={10} className="shrink-0 text-emerald-600" />
                            <span>Biaya: {formatRupiah(asset.last_repair_cost)}</span>
                          </div>
                        )}
                      </td>

                      {/* Jadwal Servis Berikutnya */}
                      <td className="py-3.5 px-4">
                        {asset.next_maintenance_date ? (
                          <div>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold font-mono ${
                              isDue 
                                ? 'bg-rose-100 text-rose-800 border border-rose-200 animate-pulse'
                                : 'bg-slate-100 text-slate-700'
                            }`}>
                              <Calendar size={12} />
                              <span>{asset.next_maintenance_date}</span>
                            </span>
                            {isDue && (
                              <div className="text-[10px] text-rose-600 font-bold mt-0.5 flex items-center gap-0.5">
                                <AlertTriangle size={10} />
                                <span>Waktunya Servis!</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Belum dijadwalkan</span>
                        )}
                      </td>

                      {/* Kondisi */}
                      <td className="py-3.5 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          asset.condition === 'Baik' 
                            ? 'bg-emerald-100 text-emerald-800'
                            : asset.condition === 'Perlu Servis'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {asset.condition || 'Baik'}
                        </span>
                      </td>

                      {/* Aksi CRUD (Khusus Admin & Staff) */}
                      {!readOnly && (
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* Tombol Servis & Biaya Otomatis */}
                            <button
                              onClick={() => handleOpenServiceModal(asset)}
                              className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-bold border border-emerald-200 flex items-center gap-1 transition-colors cursor-pointer"
                              title="Catat pemeliharaan & input opsional biaya perbaikan ke laporan keuangan"
                            >
                              <Wrench size={11} className="text-emerald-600" />
                              <span className="hidden sm:inline">Servis & Biaya</span>
                            </button>

                            {/* Tombol Mutasi / Pindah Gedung */}
                            {properties.length > 1 && (
                              <button
                                onClick={() => handleOpenTransfer(asset)}
                                className="p-1.5 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 rounded-lg transition-colors cursor-pointer"
                                title="Mutasi / Pindahkan aset ke gedung lain"
                              >
                                <ArrowRightLeft size={13} />
                              </button>
                            )}

                            {/* Tombol Edit */}
                            <button
                              onClick={() => handleOpenEdit(asset)}
                              className="p-1.5 hover:bg-slate-100 text-slate-600 hover:text-slate-900 rounded-lg transition-colors cursor-pointer"
                              title="Ubah data aset"
                            >
                              <Edit2 size={13} />
                            </button>

                            {/* Tombol Hapus */}
                            <button
                              disabled={isDeletingId === asset.id}
                              onClick={() => handleDelete(asset)}
                              className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                              title="Hapus aset"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 7. MODAL INPUT / EDIT ASET (Dengan Gedung Kos Terkunci/Terpilih Sesuai Tab) */}
      {!readOnly && showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in font-sans">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-150 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 font-display flex items-center gap-2">
                  <Wrench size={18} className="text-teal-600" />
                  <span>{editingAsset ? 'Ubah Data Aset & Jadwal Pemeliharaan' : 'Tambah Aset & Jadwal Pemeliharaan Baru'}</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Data aset dan jangka waktu pemeliharaan tersimpan ke Supabase secara real-time.
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              
              {/* Gedung Kos Selection (PENTING: Memastikan aset masuk ke gedung yang benar) */}
              <div className="p-3 bg-teal-50/70 rounded-2xl border border-teal-200">
                <label className="block text-[11px] font-bold text-teal-950 uppercase mb-1 flex items-center gap-1.5">
                  <Building2 size={13} className="text-teal-700" />
                  <span>Gedung Kost Penerima Aset *</span>
                </label>
                <select
                  value={formData.property_id}
                  onChange={(e) => setFormData({ ...formData, property_id: Number(e.target.value) })}
                  className="w-full bg-white border border-teal-300 rounded-xl p-2.5 text-slate-900 font-bold outline-none focus:border-teal-500"
                  required
                >
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>
                      🏢 {p.name} {p.city ? `(${p.city})` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-teal-800 mt-1">
                  Aset ini akan didaftarkan secara eksklusif ke inventaris gedung di atas.
                </p>
              </div>

              {/* Nama Aset */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Nama Aset Tetap *
                </label>
                <input
                  type="text"
                  required
                  placeholder="contoh: AC Daikin 1 PK Kamar 101 / Mesin Pompa Air Utama"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 outline-none focus:border-teal-500"
                />
              </div>

              {/* Kategori & Lokasi Spesifik */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                    Kategori Aset
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 outline-none focus:border-teal-500"
                  >
                    <option value="Elektronik & AC">Elektronik & AC</option>
                    <option value="Mesin & Pompa Air">Mesin & Pompa Air</option>
                    <option value="Keamanan & CCTV">Keamanan & CCTV</option>
                    <option value="Furnitur">Furnitur & Kasur</option>
                    <option value="Struktur Bangunan">Struktur Bangunan</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                    Lokasi Spesifik di Gedung
                  </label>
                  <input
                    type="text"
                    placeholder="contoh: Kamar 102 / Ruang Pompa Lt. 1 / Rooftop"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              {/* Kondisi Fisik Saat Ini */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Kondisi Fisik Saat Ini
                </label>
                <select
                  value={formData.condition}
                  onChange={(e) => setFormData({ ...formData, condition: e.target.value as any })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 outline-none focus:border-teal-500 font-bold"
                >
                  <option value="Baik">Baik & Normal</option>
                  <option value="Perlu Servis">Perlu Servis Berkala</option>
                  <option value="Rusak Ringan">Rusak Ringan</option>
                  <option value="Rusak Berat">Rusak Berat</option>
                </select>
              </div>

              {/* Biaya Pengadaan & Umur Ekonomis */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                    Biaya Pengadaan (Rp)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={formData.cost || ''}
                    onChange={(e) => setFormData({ ...formData, cost: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-200 rounded-xl p-2 text-slate-800 font-mono outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                    Estimasi Umur Ekonomis (Tahun)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={formData.lifeYears}
                    onChange={(e) => setFormData({ ...formData, lifeYears: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-200 rounded-xl p-2 text-slate-800 font-mono outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              {/* JANGKA WAKTU PEMELIHARAAN */}
              <div className="p-3.5 bg-teal-50/60 rounded-2xl border border-teal-200/80 space-y-3">
                <div className="flex items-center gap-1.5 text-teal-900 font-bold text-xs">
                  <Clock size={14} className="text-teal-600" />
                  <span>Jangka Waktu & Jadwal Pemeliharaan Rutin</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-bold text-teal-800 uppercase mb-1">
                      Interval Servis (Bulan) *
                    </label>
                    <select
                      value={formData.maintenance_interval_months}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setFormData({
                          ...formData,
                          maintenance_interval_months: val,
                          next_maintenance_date: calculateNextDate(formData.last_maintenance_date, val)
                        });
                      }}
                      className="w-full bg-white border border-teal-200 rounded-xl p-2 text-slate-800 font-bold outline-none focus:border-teal-500"
                    >
                      <option value="1">Tiap 1 Bulan</option>
                      <option value="2">Tiap 2 Bulan</option>
                      <option value="3">Tiap 3 Bulan (Standar AC)</option>
                      <option value="6">Tiap 6 Bulan (Pompa/Toren)</option>
                      <option value="12">Tiap 12 Bulan (1 Tahun)</option>
                      <option value="24">Tiap 24 Bulan (2 Tahun)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-teal-800 uppercase mb-1">
                      Servis Terakhir
                    </label>
                    <input
                      type="date"
                      value={formData.last_maintenance_date}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData({
                          ...formData,
                          last_maintenance_date: val,
                          next_maintenance_date: calculateNextDate(val, formData.maintenance_interval_months)
                        });
                      }}
                      className="w-full bg-white border border-teal-200 rounded-xl p-2 text-slate-800 font-mono outline-none focus:border-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-teal-800 uppercase mb-1">
                      Jadwal Servis Berikutnya
                    </label>
                    <input
                      type="date"
                      value={formData.next_maintenance_date}
                      onChange={(e) => setFormData({ ...formData, next_maintenance_date: e.target.value })}
                      className="w-full bg-white border border-teal-200 rounded-xl p-2 text-slate-800 font-mono font-bold outline-none focus:border-teal-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-teal-800 uppercase mb-1">
                    Catatan Teknisi / Vendor Servis Langganan
                  </label>
                  <input
                    type="text"
                    placeholder="contoh: Servis cuci AC oleh Pak Joko (0812xxxx) / Garansi servis s.d 2027"
                    value={formData.maintenance_notes}
                    onChange={(e) => setFormData({ ...formData, maintenance_notes: e.target.value })}
                    className="w-full bg-white border border-teal-200 rounded-xl p-2 text-slate-800 outline-none focus:border-teal-500"
                  />
                </div>

                {/* Opsional Biaya Perbaikan Langsung Masuk Laporan Keuangan */}
                <div className="pt-2 border-t border-teal-200/60">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10px] font-bold text-teal-900 uppercase">
                      Biaya Perbaikan Terakhir (Rp) - Opsional
                    </label>
                    <span className="text-[10px] text-teal-700 font-medium">Bisa dibukukan ke Keuangan</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="number"
                      min="0"
                      placeholder="contoh: 150000"
                      value={formData.last_repair_cost}
                      onChange={(e) => setFormData({ ...formData, last_repair_cost: e.target.value === '' ? '' : Number(e.target.value) })}
                      className="w-full bg-white border border-teal-300 rounded-xl p-2 text-slate-800 font-mono font-bold outline-none focus:border-teal-500"
                    />
                    {Number(formData.last_repair_cost) > 0 && (
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-teal-900 cursor-pointer bg-white/80 p-2 rounded-xl border border-teal-200">
                        <input
                          type="checkbox"
                          checked={formData.post_repair_cost_now}
                          onChange={(e) => setFormData({ ...formData, post_repair_cost_now: e.target.checked })}
                          className="w-4 h-4 rounded text-teal-600 accent-teal-600 cursor-pointer"
                        />
                        <span className="text-[11px] leading-tight">Posting ke Laporan Keuangan Sekarang</span>
                      </label>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-500 hover:text-slate-800 font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Menyimpan...' : (editingAsset ? 'Simpan Perubahan' : 'Tambah Aset ke Gedung')}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* 8. MODAL MUTASI / PINDAH GEDUNG */}
      {transferringAsset && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in font-sans">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-150 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <ArrowRightLeft size={18} className="text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900 font-display">
                  Mutasi Aset Antar Gedung Kos
                </h3>
              </div>
              <button
                onClick={() => setTransferringAsset(null)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleExecuteTransfer} className="space-y-3.5 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Aset yang dimutasi:</span>
                <span className="font-bold text-slate-900 text-sm">{transferringAsset.name}</span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  Lokasi saat ini: {properties.find(p => p.id === transferringAsset.property_id)?.name || 'Belum ada'} ({transferringAsset.location || 'Umum'})
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Pindahkan ke Gedung Tujuan *
                </label>
                <select
                  value={targetPropertyId}
                  onChange={(e) => setTargetPropertyId(Number(e.target.value))}
                  className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-slate-800 font-bold outline-none focus:border-indigo-500"
                  required
                >
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>
                      🏢 {p.name} {p.city ? `(${p.city})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Lokasi / Kamar Baru di Gedung Tujuan
                </label>
                <input
                  type="text"
                  placeholder="contoh: Kamar 203 / Dapur Lt. 1"
                  value={targetLocation}
                  onChange={(e) => setTargetLocation(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-slate-800 outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setTransferringAsset(null)}
                  className="px-4 py-2 rounded-xl text-slate-500 hover:text-slate-800 font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isTransferring}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-md cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isTransferring ? 'Memindahkan...' : 'Konfirmasi Pindah Gedung'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 9. MODAL CATAT PEMELIHARAAN / SERVIS ASET & BIAYA KE LAPORAN KEUANGAN */}
      {servicingAsset && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in font-sans">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-150 space-y-4 max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-teal-100/70 text-teal-700">
                  <Wrench size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 font-display">
                    Catat Pemeliharaan & Biaya Perbaikan
                  </h3>
                  <p className="text-xs text-slate-500">
                    Perbarui status servis dan opsional posting biaya perbaikan ke Laporan Keuangan
                  </p>
                </div>
              </div>
              <button
                onClick={() => setServicingAsset(null)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={(e) => handleSubmitService(e, false)} className="space-y-4 text-xs">
              {/* Asset Identity Card */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block font-mono">
                    Aset yang Diservis
                  </span>
                  <span className="font-bold text-slate-900 text-sm">{servicingAsset.name}</span>
                  <div className="flex items-center gap-2 mt-0.5 text-slate-500 text-[11px]">
                    <span className="font-medium">
                      🏢 {properties.find(p => p.id === servicingAsset.property_id)?.name || 'Gedung Kos'}
                    </span>
                    <span>•</span>
                    <span>📍 {servicingAsset.location || 'Unit Umum'}</span>
                    <span>•</span>
                    <span className="px-1.5 py-0.2 rounded bg-slate-200/70 font-semibold text-slate-700 text-[10px]">
                      {servicingAsset.category || 'Elektronik'}
                    </span>
                  </div>
                </div>
                <div className="text-left sm:text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block font-mono">
                    Biaya Terakhir
                  </span>
                  <span className="font-bold font-mono text-xs text-slate-700">
                    {servicingAsset.last_repair_cost && servicingAsset.last_repair_cost > 0 
                      ? formatRupiah(servicingAsset.last_repair_cost) 
                      : 'Rp 0 (Belum ada)'}
                  </span>
                </div>
              </div>

              {/* Tanggal & Kondisi Pasca Servis */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Tanggal Pelaksanaan Servis *
                  </label>
                  <input
                    type="date"
                    required
                    value={serviceDate}
                    onChange={(e) => {
                      const val = e.target.value;
                      setServiceDate(val);
                      setServiceNextDate(calculateNextDate(val, serviceIntervalMonths));
                    }}
                    className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-slate-800 font-mono font-bold outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Kondisi Pasca Servis *
                  </label>
                  <select
                    value={serviceCondition}
                    onChange={(e) => setServiceCondition(e.target.value as any)}
                    className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-slate-800 font-bold outline-none focus:border-teal-500"
                  >
                    <option value="Baik">✅ Kondisi Baik & Normal</option>
                    <option value="Perlu Servis">⚠️ Masih Perlu Servis Lanjutan</option>
                    <option value="Rusak Ringan">⚠️ Rusak Ringan</option>
                    <option value="Rusak Berat">❌ Rusak Berat</option>
                  </select>
                </div>
              </div>

              {/* Interval & Jadwal Servis Berikutnya */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Interval Servis Rutin Berikutnya
                  </label>
                  <select
                    value={serviceIntervalMonths}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setServiceIntervalMonths(val);
                      setServiceNextDate(calculateNextDate(serviceDate, val));
                    }}
                    className="w-full bg-white border border-slate-200 rounded-xl p-2 text-slate-800 font-bold outline-none focus:border-teal-500"
                  >
                    <option value="1">Tiap 1 Bulan</option>
                    <option value="2">Tiap 2 Bulan</option>
                    <option value="3">Tiap 3 Bulan (Standar AC)</option>
                    <option value="6">Tiap 6 Bulan (Pompa Air)</option>
                    <option value="12">Tiap 12 Bulan (1 Tahun)</option>
                    <option value="24">Tiap 24 Bulan (2 Tahun)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Jadwal Servis Berikutnya *
                  </label>
                  <input
                    type="date"
                    required
                    value={serviceNextDate}
                    onChange={(e) => setServiceNextDate(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl p-2 text-slate-800 font-mono font-bold outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              {/* Catatan Tindakan Servis */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Catatan Teknisi / Tindakan Perbaikan
                </label>
                <textarea
                  rows={2}
                  placeholder="contoh: Pembersihan filter indoor, cuci outdoor condenser, cek tekanan gas freon normal 140 psi, teknisi Pak Joko."
                  value={serviceNotes}
                  onChange={(e) => setServiceNotes(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-slate-800 outline-none focus:border-teal-500 resize-none"
                />
              </div>

              {/* INTEGRASI BIAYA PERBAIKAN & LAPORAN KEUANGAN */}
              <div className="p-4 bg-gradient-to-br from-emerald-50/90 via-teal-50/50 to-slate-50 rounded-2xl border border-emerald-200/90 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Receipt size={16} className="text-emerald-700" />
                    <span className="font-bold text-xs text-emerald-950 font-display">
                      Integrasi Biaya Perbaikan ke Laporan Keuangan
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200 flex items-center gap-1">
                    <Sparkles size={10} />
                    <span>Jurnal Otomatis (Double-Entry)</span>
                  </span>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-emerald-900 uppercase mb-1">
                      Nominal Biaya Perbaikan (Rp) - Opsional
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono font-bold text-xs">
                        Rp
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="1000"
                        placeholder="0 (Kosongkan jika servis in-house tanpa biaya)"
                        value={serviceRepairCost}
                        onChange={(e) => setServiceRepairCost(e.target.value)}
                        className="w-full bg-white border border-emerald-300 rounded-xl pl-9 pr-3 py-2 text-sm font-mono font-bold text-slate-900 outline-none focus:border-emerald-600 shadow-2xs"
                      />
                    </div>
                  </div>

                  {/* Quick Chips Nominal */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] text-slate-500 font-medium mr-0.5">Pilihan cepat:</span>
                    {[50000, 75000, 100000, 150000, 250000, 500000].map(nominal => (
                      <button
                        key={nominal}
                        type="button"
                        onClick={() => setServiceRepairCost(String(nominal))}
                        className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                          serviceRepairCost === String(nominal)
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'bg-white hover:bg-emerald-100/70 text-emerald-800 border border-emerald-200'
                        }`}
                      >
                        {nominal >= 1000000 ? `${nominal / 1000000}jt` : `${nominal / 1000}rb`}
                      </button>
                    ))}
                    {serviceRepairCost !== '' && serviceRepairCost !== '0' && (
                      <button
                        type="button"
                        onClick={() => setServiceRepairCost('')}
                        className="px-2 py-1 rounded-lg text-[10px] text-slate-500 hover:text-rose-600 bg-white border border-slate-200 cursor-pointer"
                      >
                        Reset
                      </button>
                    )}
                  </div>

                  {/* Toggle Post to Finance */}
                  {Number(serviceRepairCost) > 0 && (
                    <div className="space-y-3 pt-2 border-t border-emerald-200/70 animate-fade-in">
                      <label className="flex items-center gap-2 text-xs font-bold text-emerald-950 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={servicePostToFinance}
                          onChange={(e) => setServicePostToFinance(e.target.checked)}
                          className="w-4 h-4 rounded text-emerald-600 accent-emerald-600 cursor-pointer"
                        />
                        <span>Posting biaya ini langsung ke Laporan Keuangan otomatis</span>
                      </label>

                      {servicePostToFinance && (
                        <div className="space-y-2.5">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                                Rekening Kas / Bank Pembayar (Kredit)
                              </label>
                              <select
                                value={serviceCreditAccountId}
                                onChange={(e) => setServiceCreditAccountId(Number(e.target.value))}
                                className="w-full bg-white border border-slate-200 rounded-xl p-2 text-slate-800 font-bold outline-none focus:border-emerald-500"
                              >
                                <option value="1010">1010 - Bank Mandiri Operasional</option>
                                <option value="1000">1000 - Kas Tunai (Petty Cash Resepsionis)</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                                Akun Beban Terkait (Debit)
                              </label>
                              <select
                                value={serviceDebitAccountId}
                                onChange={(e) => setServiceDebitAccountId(Number(e.target.value))}
                                className="w-full bg-white border border-slate-200 rounded-xl p-2 text-slate-800 font-bold outline-none focus:border-emerald-500"
                              >
                                <option value="5100">5100 - Beban Pemeliharaan & Perbaikan Gedung</option>
                                <option value="5000">5000 - Beban Utilitas & Fasilitas</option>
                                <option value="5400">5400 - Beban Perlengkapan Operasional</option>
                              </select>
                            </div>
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                              Teknisi / Bengkel / Vendor Pelaksana (Opsional)
                            </label>
                            <input
                              type="text"
                              placeholder="contoh: Pak Joko Servis AC / CV Sejuk Dingin"
                              value={serviceVendorName}
                              onChange={(e) => setServiceVendorName(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl p-2 text-slate-800 outline-none focus:border-emerald-500"
                            />
                          </div>

                          {/* Live Double-Entry Preview Box */}
                          <div className="p-3 bg-white rounded-xl border border-emerald-200 shadow-2xs space-y-1.5">
                            <div className="text-[10px] uppercase font-bold text-emerald-800 flex items-center justify-between">
                              <span>Simulasi Jurnal Akuntansi Otomatis</span>
                              <span className="font-mono text-emerald-600 font-bold">Balance (Seimbang)</span>
                            </div>
                            <div className="font-mono text-[11px] space-y-1 text-slate-700 bg-slate-50 p-2 rounded-lg">
                              <div className="flex justify-between">
                                <span className="font-bold text-emerald-800">
                                  [DEBIT] {serviceDebitAccountId === 5100 ? '5100 - Beban Pemeliharaan & Perbaikan' : `Akun ${serviceDebitAccountId}`}
                                </span>
                                <span className="font-bold text-slate-900">{formatRupiah(Number(serviceRepairCost) || 0)}</span>
                              </div>
                              <div className="flex justify-between pl-4 text-slate-600">
                                <span className="font-bold text-slate-700">
                                  [KREDIT] {serviceCreditAccountId === 1010 ? '1010 - Bank Mandiri Operasional' : '1000 - Kas Tunai'}
                                </span>
                                <span className="font-bold text-slate-900">{formatRupiah(Number(serviceRepairCost) || 0)}</span>
                              </div>
                            </div>
                            <p className="text-[10px] text-slate-500">
                              ℹ️ Biaya ini akan langsung mengurangi laba bersih periode berjalan dan mengurangi kas/bank terkait di Laporan Keuangan.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setServicingAsset(null)}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl text-slate-500 hover:text-slate-800 font-bold cursor-pointer text-center"
                >
                  Batal
                </button>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  {/* Quick Zero Cost Option if user wants to record maintenance without expense */}
                  <button
                    type="button"
                    disabled={isRecordingService}
                    onClick={() => handleSubmitService(undefined, true)}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer transition-colors disabled:opacity-50 text-[11px]"
                    title="Catat pemeliharaan selesai tanpa membukukan biaya pengeluaran kas (Rp 0)"
                  >
                    Selesai Tanpa Biaya (Rp 0)
                  </button>

                  <button
                    type="submit"
                    disabled={isRecordingService}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-md cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isRecordingService ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>Membukukan...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={14} />
                        <span>
                          {Number(serviceRepairCost) > 0 && servicePostToFinance
                            ? `Simpan & Posting ${formatRupiah(Number(serviceRepairCost))}`
                            : 'Simpan Servis Selesai'}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default AssetManagementSection;
