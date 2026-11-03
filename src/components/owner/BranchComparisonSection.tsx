import React from 'react';
import { Building2, BedDouble, TrendingUp, MapPin, ChevronRight, CheckCircle2 } from 'lucide-react';
import { Property, Room, Tenant } from '../../types';
import { formatRupiah } from '../../utils/formatCurrency';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';

interface BranchMetric {
  property: Property;
  totalRooms: number;
  occupiedRooms: number;
  occupancyRate: number;
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  revPar: number;
}

interface BranchComparisonSectionProps {
  branchMetrics: BranchMetric[];
  onSelectBranch?: (propertyId: string) => void;
}

export const BranchComparisonSection: React.FC<BranchComparisonSectionProps> = ({
  branchMetrics,
  onSelectBranch
}) => {
  const chartData = branchMetrics.map((b) => ({
    name: b.property.name.replace('Samara Stay ', ''),
    pendapatan: b.totalRevenue,
    okupansi: Number(b.occupancyRate.toFixed(1)),
    laba: b.netIncome
  }));

  const COLORS = ['#2E6F40', '#3b82f6', '#8b5cf6', '#f59e0b'];

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-6">
      
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
            <Building2 size={18} />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-900 font-display">
              Komparasi Kinerja Antar Cabang
            </h2>
            <p className="text-xs text-slate-500">
              Evaluasi performa okupansi, kontribusi pendapatan, dan laba operasional setiap properti
            </p>
          </div>
        </div>
      </div>

      {/* Comparison Visual Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {branchMetrics.map((branch, idx) => (
          <div 
            key={branch.property.id}
            className="bg-slate-50/70 hover:bg-slate-50 border border-slate-200/80 rounded-2xl p-4 sm:p-5 transition-all flex flex-col justify-between min-w-0 overflow-hidden"
          >
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-2 min-w-0">
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
                    Cabang #{idx + 1}
                  </span>
                  <h3 className="text-sm font-extrabold text-slate-900 font-display truncate">
                    {branch.property.name}
                  </h3>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 tabular-nums ${
                  branch.occupancyRate >= 80 
                    ? 'bg-emerald-100 text-emerald-800' 
                    : branch.occupancyRate >= 50
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  {branch.occupancyRate.toFixed(0)}% Terisi
                </span>
              </div>

              <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-1 truncate">
                <MapPin size={11} className="text-slate-400 shrink-0" />
                <span className="truncate">{branch.property.address}</span>
              </p>

              {/* Stats Grid inside card */}
              <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-200/60">
                <div className="min-w-0 overflow-hidden">
                  <span className="text-[10px] text-slate-400 font-medium block truncate">Pendapatan</span>
                  <span className="text-xs font-bold text-slate-900 font-display tabular-nums break-words block">
                    {formatRupiah(branch.totalRevenue)}
                  </span>
                </div>
                <div className="min-w-0 overflow-hidden">
                  <span className="text-[10px] text-slate-400 font-medium block truncate">Laba Bersih</span>
                  <span className="text-xs font-bold text-emerald-600 font-display tabular-nums break-words block">
                    {formatRupiah(branch.netIncome)}
                  </span>
                </div>
                <div className="min-w-0 overflow-hidden">
                  <span className="text-[10px] text-slate-400 font-medium block truncate">Kapasitas Unit</span>
                  <span className="text-xs font-semibold text-slate-700 tabular-nums block">
                    {branch.occupiedRooms} / {branch.totalRooms} Kamar
                  </span>
                </div>
                <div className="min-w-0 overflow-hidden">
                  <span className="text-[10px] text-slate-400 font-medium block truncate">RevPAR (Yield)</span>
                  <span className="text-xs font-semibold text-slate-700 tabular-nums break-words block">
                    {formatRupiah(branch.revPar)}
                  </span>
                </div>
              </div>
            </div>

            {/* Occupancy Bar */}
            <div className="mt-4">
              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full bg-[#2E6F40]" 
                  style={{ width: `${Math.min(100, Math.max(0, branch.occupancyRate))}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Chart Comparison */}
      <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-mono mb-4">
          Grafik Kontribusi Omzet Antar Cabang
        </h4>
        <div className="h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: 11, fill: '#64748b' }} 
                axisLine={{ stroke: '#cbd5e1' }}
              />
              <YAxis 
                tick={{ fontSize: 10, fill: '#64748b' }} 
                tickFormatter={(val) => `Rp ${(val / 1000000).toFixed(0)}jt`}
                axisLine={{ stroke: '#cbd5e1' }}
              />
              <Tooltip 
                formatter={(val: any) => [formatRupiah(val), 'Omzet']}
                contentStyle={{ 
                  backgroundColor: '#0f172a', 
                  borderColor: '#334155', 
                  borderRadius: '12px',
                  color: '#fff',
                  fontSize: '12px'
                }}
              />
              <Bar dataKey="pendapatan" radius={[6, 6, 0, 0]}>
                {chartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
};
