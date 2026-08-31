import React from 'react';
import { 
  Clock, Calendar, Users, AlertCircle, CheckCircle2, 
  BedDouble, ArrowRight, Shield, MessageCircle, RefreshCw
} from 'lucide-react';
import { Tenant, Room } from '../../types';
import { calculateLeaseRemaining } from '../../utils/leaseDuration';

interface LeaseExpiringMonitorProps {
  tenants: Tenant[];
  rooms: Room[];
  onRefresh?: () => void;
}

export const LeaseExpiringMonitor: React.FC<LeaseExpiringMonitorProps> = ({
  tenants,
  rooms,
  onRefresh
}) => {
  const now = new Date();

  // Calculate remaining days & grace period for each tenant
  const enrichedTenants = tenants
    .filter(t => t.status !== 'checkout')
    .map((t) => {
      const leaseInfo = calculateLeaseRemaining(
        t.start_date,
        t.duration_months || 1,
        undefined,
        'monthly',
        now
      );

      const matchedRoom = rooms.find(r => r.room_number === t.room_number && (!t.property_id || r.property_id === t.property_id));

      return {
        ...t,
        leaseInfo,
        matchedRoom
      };
    });

  // Filter tenants expiring soon (<= 45 days or in 24h grace period or expired)
  const expiringList = enrichedTenants
    .filter((t) => t.leaseInfo.diffDays <= 45)
    .sort((a, b) => a.leaseInfo.diffHours - b.leaseInfo.diffHours);

  const dueTodayCount = enrichedTenants.filter(t => t.leaseInfo.isDueToday).length;
  const expiredPast24hCount = enrichedTenants.filter(t => t.leaseInfo.isExpiredPast24h).length;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-5">
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100 shadow-xs">
            <Clock size={18} />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-900 font-display">
              Monitoring Masa Berakhir Sewa & Ketersediaan Kamar
            </h2>
            <p className="text-xs text-slate-500">
              Pantau sisa durasi sewa penghuni. Kamar dengan durasi 0 yang melewati 24 jam otomatis beralih menjadi <strong>Tersedia (Available)</strong> untuk di-booking user baru.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {dueTodayCount > 0 && (
            <span className="text-xs font-extrabold px-3 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-full animate-pulse flex items-center gap-1">
              <AlertCircle size={12} />
              {dueTodayCount} Jatuh Tempo (Tenggang 24 Jam)
            </span>
          )}
          <span className="text-xs font-bold px-3 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-full">
            {expiringList.length} Kamar Terpantau (&le;45 Hari)
          </span>
        </div>
      </div>

      {/* Info Banner on 24h Auto-Release Automation */}
      <div className="bg-teal-50/70 border border-teal-200 rounded-xl p-3.5 flex items-start gap-3 text-xs text-teal-900">
        <Shield size={16} className="text-teal-600 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-extrabold block">Aturan Otomatisasi Sistem:</span>
          <p className="text-teal-800 leading-relaxed">
            Ketika masa sewa mencapai <strong>0 hari</strong>, penyewa diberikan toleransi masa tenggang <strong>24 jam</strong>. Jika telah melewati 24 jam tanpa perpanjangan kontrak, status kamar akan otomatis <strong>Available</strong> dan langsung terbuka di katalog booking end user.
          </p>
        </div>
      </div>

      {expiringList.length === 0 ? (
        <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs">
          Semua masa sewa penghuni saat ini masih berjangka panjang dan aman (&gt;45 hari).
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {expiringList.map((item) => {
            const { leaseInfo } = item;
            return (
              <div 
                key={item.id}
                className={`p-4 rounded-xl border flex flex-col justify-between space-y-3 transition-all ${
                  leaseInfo.isExpiredPast24h
                    ? 'bg-slate-50 border-slate-200'
                    : leaseInfo.isDueToday
                    ? 'bg-rose-50/50 border-rose-200 shadow-xs ring-1 ring-rose-200'
                    : leaseInfo.isExpiringSoon
                    ? 'bg-amber-50/40 border-amber-200'
                    : 'bg-slate-50/70 border-slate-200'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-slate-900 font-mono bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                      Kamar {item.room_number}
                    </span>
                    <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border shadow-2xs ${leaseInfo.badgeClass}`}>
                      {leaseInfo.remainingDaysText}
                    </span>
                  </div>

                  <div className="mt-3 space-y-1">
                    <div className="font-extrabold text-slate-900 text-xs">{item.full_name}</div>
                    <div className="text-[11px] text-slate-500 font-mono flex items-center justify-between">
                      <span>{item.phone}</span>
                      <span className="text-[10px] font-bold text-slate-400">{item.duration_months} Bulan</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 border-t border-slate-200/60 pt-2.5 text-[11px]">
                  <div className="flex items-center justify-between text-slate-500 font-mono text-[10px]">
                    <span>Jatuh Tempo:</span>
                    <span className="font-extrabold text-slate-700">
                      {leaseInfo.endDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-500 text-[10px]">
                    <span>Status Ketersediaan:</span>
                    <span className={`font-bold ${
                      leaseInfo.isExpiredPast24h 
                        ? 'text-emerald-700' 
                        : leaseInfo.isDueToday 
                        ? 'text-rose-700' 
                        : 'text-amber-700'
                    }`}>
                      {leaseInfo.isExpiredPast24h 
                        ? '🟢 Otomatis Available' 
                        : leaseInfo.isDueToday 
                        ? `🔴 Tenggang ${leaseInfo.graceHoursLeft || 0} Jam` 
                        : '🟡 Sedang Dihuni'}
                    </span>
                  </div>

                  {item.phone && (
                    <a
                      href={`https://wa.me/${item.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                        `Halo Kak ${item.full_name}, kami dari Manajemen Kos ingin menginformasikan masa sewa Kamar ${item.room_number} Anda akan berakhir pada ${leaseInfo.endDate.toLocaleDateString('id-ID')}. Sisa durasi: ${leaseInfo.remainingDaysText}. Apakah ingin melakukan perpanjangan kontrak sewa? Terima kasih.`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 w-full py-1.5 px-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <MessageCircle size={12} className="text-emerald-600" />
                      Kirim Reminder WhatsApp
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};

export default LeaseExpiringMonitor;
