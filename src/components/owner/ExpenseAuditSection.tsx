import React from 'react';
import { 
  ShieldAlert, Wrench, Zap, Users, ShoppingBag, 
  FileText, CheckCircle2, AlertTriangle 
} from 'lucide-react';
import { formatRupiah } from '../../utils/formatCurrency';
import { Maintenance, PettyCashRequest, PurchaseOrder } from '../../types';

interface ExpenseAuditSectionProps {
  maintenanceList: Maintenance[];
  pettyCashList: PettyCashRequest[];
  purchaseOrders: PurchaseOrder[];
  totalMaintenanceCost: number;
}

export const ExpenseAuditSection: React.FC<ExpenseAuditSectionProps> = ({
  maintenanceList,
  pettyCashList,
  purchaseOrders,
  totalMaintenanceCost
}) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-6">
      
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
            <ShieldAlert size={18} />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-900 font-display">
              Audit Biaya & Kontrol Pengeluaran
            </h2>
            <p className="text-xs text-slate-500">
              Transparansi biaya pemeliharaan properti, petty cash operasional, dan logistik
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Maintenance Costs Feed */}
        <div className="space-y-3 min-w-0">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-mono flex items-center gap-1.5 min-w-0">
              <Wrench size={13} className="text-slate-400 shrink-0" />
              <span className="truncate">Pemeliharaan Gedung & Servis ({maintenanceList.length} Item)</span>
            </h3>
            <span className="text-xs font-bold text-amber-600 tabular-nums shrink-0">
              Total: {formatRupiah(totalMaintenanceCost)}
            </span>
          </div>

          {maintenanceList.length === 0 ? (
            <div className="p-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs">
              Tidak ada catatan biaya pemeliharaan aktif.
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {maintenanceList.slice(0, 5).map((m) => (
                <div key={m.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between gap-3 text-xs min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-slate-800 truncate">{m.title}</div>
                    <div className="text-[11px] text-slate-500 truncate">Kamar {m.room} • Teknisi: {m.tech || 'Internal'}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-slate-900 tabular-nums">{formatRupiah(m.cost)}</div>
                    <span className="text-[10px] text-emerald-600 font-semibold uppercase">{m.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Petty Cash & Logistic POs */}
        <div className="space-y-3 min-w-0">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-mono flex items-center gap-1.5 min-w-0">
              <ShoppingBag size={13} className="text-slate-400 shrink-0" />
              <span className="truncate">Pengadaan & Kas Kecil Operasional</span>
            </h3>
            <span className="text-xs text-slate-500 shrink-0">Log Approval</span>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {pettyCashList.slice(0, 3).map((pc) => (
              <div key={pc.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between gap-3 text-xs min-w-0">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-slate-800 truncate">{pc.purpose}</div>
                  <div className="text-[11px] text-slate-500 truncate">Pemohon: {pc.applicant} • {pc.date}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-slate-900 tabular-nums">{formatRupiah(pc.amount)}</div>
                  <span className={`text-[10px] font-semibold uppercase ${
                    pc.status === 'approved' ? 'text-emerald-600' : 'text-amber-600'
                  }`}>
                    {pc.status}
                  </span>
                </div>
              </div>
            ))}

            {purchaseOrders.slice(0, 2).map((po) => (
              <div key={po.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between gap-3 text-xs min-w-0">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-slate-800 truncate">PO: {po.items}</div>
                  <div className="text-[11px] text-slate-500 truncate">Vendor: {po.vendor} • {po.date}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-slate-900 tabular-nums">{formatRupiah(po.amount)}</div>
                  <span className="text-[10px] text-emerald-600 font-semibold uppercase">{po.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
};
