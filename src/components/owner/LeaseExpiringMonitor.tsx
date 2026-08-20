import React from 'react';
import { 
  Clock, Calendar, Users, AlertCircle, CheckCircle2, 
  BedDouble, ArrowRight, Shield 
} from 'lucide-react';
import { Tenant, Room } from '../../types';

interface LeaseExpiringMonitorProps {
  tenants: Tenant[];
  rooms: Room[];
}

export const LeaseExpiringMonitor: React.FC<LeaseExpiringMonitorProps> = ({
  tenants,
  rooms
}) => {
  // Calculate days remaining for each tenant
  const enrichedTenants = tenants.map((t) => {
    const startDate = new Date(t.start_date);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + (t.duration_months || 1));
    
    const today = new Date();
    const diffTime = endDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return {
      ...t,
      endDate,
      diffDays
    };
  });

  // Filter tenants expiring in next 45 days
  const expiringSoon = enrichedTenants
    .filter((t) => t.diffDays >= 0 && t.diffDays <= 45)
    .sort((a, b) => a.diffDays - b.diffDays);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-5">
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
            <Clock size={18} />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-900 font-display">
              Monitoring Masa Berakhir Sewa
            </h2>
            <p className="text-xs text-slate-500">
              Deteksi dini kamar yang akan segera habis masa kontrak untuk menjaga tingkat keterisian
            </p>
          </div>
        </div>

        <span className="text-xs font-bold px-3 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-full">
          {expiringSoon.length} Kamar Segera Berakhir (&lt;45 Hari)
        </span>
      </div>

      {expiringSoon.length === 0 ? (
        <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs">
          Semua masa sewa penghuni saat ini masih berjangka panjang dan aman.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {expiringSoon.slice(0, 6).map((item) => (
            <div 
              key={item.id}
              className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-900 font-mono bg-white px-2 py-0.5 rounded border border-slate-200">
                    Kamar {item.room_number}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    item.diffDays <= 7 
                      ? 'bg-red-100 text-red-800 animate-pulse' 
                      : item.diffDays <= 20
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {item.diffDays} Hari Lagi
                  </span>
                </div>

                <div className="mt-2">
                  <div className="font-bold text-slate-900 text-xs">{item.full_name}</div>
                  <div className="text-[11px] text-slate-500">{item.phone}</div>
                </div>
              </div>

              <div className="text-[10px] text-slate-400 font-mono border-t border-slate-200/60 pt-2 flex items-center justify-between">
                <span>Jatuh Tempo:</span>
                <span className="font-bold text-slate-600">
                  {item.endDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
};
