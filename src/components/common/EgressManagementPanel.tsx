/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  ShieldAlert, RefreshCw, Trash2, ArrowDownCircle, Activity, 
  Radio, HardDrive, Database, Zap, Clock, ArrowUpRight, CheckCircle2,
  AlertTriangle, Filter, Search, Layers, Server, Globe
} from 'lucide-react';
import { useEgressDiagnostics, formatBytes, TableEgressStat } from '../../lib/egressGuard';

interface EgressManagementPanelProps {
  onRefresh?: () => void;
}

export const EgressManagementPanel: React.FC<EgressManagementPanelProps> = ({ onRefresh }) => {
  const egressData = useEgressDiagnostics();
  const [filterSource, setFilterSource] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  const {
    totalBytes,
    formattedTotal,
    totalRequests,
    tableStats,
    recentMetrics,
    realtimeStats,
    resetStats,
    logSummary
  } = egressData;

  // Filter recent metrics
  const filteredMetrics = recentMetrics.filter((m) => {
    const matchesSource = filterSource === 'all' || m.source === filterSource;
    const matchesSearch = !searchTerm || m.table.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTable = !selectedTable || m.table === selectedTable;
    return matchesSource && matchesSearch && matchesTable;
  });

  const tableList: TableEgressStat[] = (Object.values(tableStats || {}) as TableEgressStat[]).sort((a, b) => b.totalBytes - a.totalBytes);
  const totalRealtimeEvents = realtimeStats?.totalRealtimeEvents || 0;
  const formattedRealtimeBytes = realtimeStats?.formattedRealtimeBytes || '0 B';
  const totalListeners = realtimeStats?.totalListeners || 0;
  const isConnected = realtimeStats?.connectionStatus === 'CONNECTED';
  const isConnecting = realtimeStats?.connectionStatus === 'CONNECTING';

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-500/20 border border-indigo-400/30 rounded-xl text-indigo-400">
                <ShieldAlert size={26} />
              </div>
              <div>
                <h2 className="text-xl font-black font-display tracking-tight text-white flex items-center gap-2">
                  Egress Management & Telemetry
                  <span className="text-[10px] uppercase font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    EgressGuard Active
                  </span>
                </h2>
                <p className="text-xs text-indigo-200/80 mt-1">
                  Monitoring konsumsi kuota bandwidth Supabase, volume payload database, dan subscriber realtime aktif secara instan.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                logSummary();
                if (onRefresh) onRefresh();
              }}
              className="px-3.5 py-2 bg-indigo-600/60 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-indigo-400/30 cursor-pointer shadow-sm"
              title="Cetak ringkasan egress ke browser console"
            >
              <RefreshCw size={14} />
              <span>Log Konsol</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Reset semua statistik telemetri egress dan metrik sesi ini?')) {
                  resetStats();
                }
              }}
              className="px-3.5 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-rose-500/30 cursor-pointer"
            >
              <Trash2 size={14} />
              <span>Reset Metrik</span>
            </button>
          </div>
        </div>

        {/* Real-time Telemetry KPI Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mt-6 pt-6 border-t border-indigo-500/20">
          {/* Card 1: Total Bandwidth Recorded */}
          <div className="bg-slate-900/60 backdrop-blur-sm border border-white/10 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span className="font-semibold uppercase tracking-wider text-[10px]">Total Egress Tercatat</span>
              <HardDrive size={15} className="text-cyan-400" />
            </div>
            <div className="text-2xl font-black text-white font-mono">{formattedTotal}</div>
            <div className="text-[11px] text-cyan-300/80 mt-1 flex items-center gap-1">
              <ArrowDownCircle size={12} />
              <span>{totalBytes.toLocaleString('id-ID')} bytes total</span>
            </div>
          </div>

          {/* Card 2: Total API & Query Requests */}
          <div className="bg-slate-900/60 backdrop-blur-sm border border-white/10 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span className="font-semibold uppercase tracking-wider text-[10px]">Jumlah Request REST</span>
              <Database size={15} className="text-amber-400" />
            </div>
            <div className="text-2xl font-black text-amber-300 font-mono">{totalRequests}</div>
            <div className="text-[11px] text-slate-400 mt-1">
              {tableList.length} tabel database terpantau
            </div>
          </div>

          {/* Card 3: Active Realtime Listeners */}
          <div className="bg-slate-900/60 backdrop-blur-sm border border-white/10 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span className="font-semibold uppercase tracking-wider text-[10px]">Listener Realtime Aktif</span>
              <Radio size={15} className={isConnected ? "text-emerald-400 animate-pulse" : isConnecting ? "text-amber-400" : "text-rose-400"} />
            </div>
            <div className="text-2xl font-black text-emerald-300 font-mono">{totalListeners}</div>
            <div className="text-[11px] text-slate-300 mt-1 flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : isConnecting ? 'bg-amber-400' : 'bg-rose-400'}`} />
              <span className="uppercase text-[10px] font-mono">{realtimeStats?.connectionStatus || 'OFFLINE'}</span>
            </div>
          </div>

          {/* Card 4: Realtime Events & Bandwidth */}
          <div className="bg-slate-900/60 backdrop-blur-sm border border-white/10 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span className="font-semibold uppercase tracking-wider text-[10px]">Event & Bandwidth WS</span>
              <Zap size={15} className="text-purple-400" />
            </div>
            <div className="text-2xl font-black text-purple-300 font-mono">{totalRealtimeEvents} <span className="text-xs font-normal text-slate-400">evt</span></div>
            <div className="text-[11px] text-purple-300/80 mt-1 flex items-center gap-1">
              <span>{formattedRealtimeBytes} transfer websocket</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid: Active Realtime Listeners Table & Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 cols): Table Breakdown of Egress */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-6 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-[#E2E8F0] pb-4">
            <div>
              <h3 className="text-base font-extrabold text-[#1E293B] flex items-center gap-2">
                <Database size={18} className="text-indigo-600" />
                <span>Konsumsi Egress Berdasarkan Tabel</span>
              </h3>
              <p className="text-xs text-[#64748B] mt-0.5">
                Urutan tabel dengan akumulasi payload respons terbesar untuk deteksi query berlebih atau unpaginated data.
              </p>
            </div>
            {selectedTable && (
              <button
                type="button"
                onClick={() => setSelectedTable(null)}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200 cursor-pointer"
              >
                Hapus Filter ({selectedTable})
              </button>
            )}
          </div>

          {tableList.length === 0 ? (
            <div className="text-center py-10 text-[#94A3B8]">
              <Database size={36} className="mx-auto mb-2 opacity-50" />
              <p className="text-xs font-semibold">Belum ada data query yang tercatat.</p>
              <p className="text-[11px] mt-1">Data akan otomatis masuk saat aplikasi berinteraksi dengan Supabase.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-[#64748B] font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Tabel</th>
                    <th className="py-2.5 px-3 text-right">Request</th>
                    <th className="py-2.5 px-3 text-right">Total Egress</th>
                    <th className="py-2.5 px-3 text-right">Rata-rata/Req</th>
                    <th className="py-2.5 px-3 text-right">Payload Terakhir</th>
                    <th className="py-2.5 px-3 text-right">Baris</th>
                    <th className="py-2.5 px-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {tableList.map((stat) => {
                    const isSelected = selectedTable === stat.table;
                    const percentOfTotal = totalBytes > 0 ? ((stat.totalBytes / totalBytes) * 100).toFixed(1) : '0';
                    const isHighEgress = stat.totalBytes > 200 * 1024; // > 200 KB

                    return (
                      <tr 
                        key={stat.table} 
                        className={`hover:bg-slate-50 transition cursor-pointer ${isSelected ? 'bg-indigo-50/70 font-semibold' : ''}`}
                        onClick={() => setSelectedTable(isSelected ? null : stat.table)}
                      >
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-[11px] border border-slate-200">
                              {stat.table}
                            </span>
                            {isHighEgress && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">
                                Tinggi
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-600">
                          {stat.requestCount}x
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="font-mono font-bold text-slate-800">
                            {formatBytes(stat.totalBytes)}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {percentOfTotal}% dari total
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-600">
                          {formatBytes(stat.avgBytes)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-700">
                          {formatBytes(stat.lastBytes)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-500">
                          {stat.lastRowCount} row
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTable(isSelected ? null : stat.table);
                            }}
                            className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                          >
                            {isSelected ? 'Batal' : 'Filter'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Column (1 col): Realtime Listeners & WebSocket Stats */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-6 space-y-4">
            <div className="border-b border-[#E2E8F0] pb-3 flex items-center justify-between">
              <h3 className="text-base font-extrabold text-[#1E293B] flex items-center gap-2">
                <Radio size={18} className="text-emerald-600" />
                <span>Active Realtime Listeners</span>
              </h3>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${isConnected ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                {realtimeStats?.connectionStatus || 'OFFLINE'}
              </span>
            </div>

            <p className="text-xs text-[#64748B]">
              Tabel yang sedang dilanggani oleh komponen antarmuka React via <code className="text-indigo-600 font-mono">realtimeManager</code>.
            </p>

            <div className="space-y-2.5">
              {Object.keys(realtimeStats?.listenersByTable || {}).length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs">
                  <Radio size={24} className="mx-auto mb-1.5 opacity-40" />
                  <span>Tidak ada listener realtime aktif saat ini.</span>
                </div>
              ) : (
                Object.entries(realtimeStats?.listenersByTable || {}).map(([table, count]) => {
                  const detail = realtimeStats?.tableDetails?.[table];
                  return (
                    <div 
                      key={table}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/80 hover:border-indigo-300 transition"
                    >
                      <div>
                        <div className="font-mono font-bold text-xs text-slate-800 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span>{table}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {detail?.receivedEventsCount || 0} event diterima • {formatBytes(detail?.totalEventBytes || 0)}
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded font-mono font-extrabold text-xs">
                          {count} sub
                        </span>
                        {detail?.lastEventTime && (
                          <div className="text-[9px] text-slate-400 font-mono mt-0.5">
                            {detail.lastEventTime}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Realtime channel health guidance */}
            <div className="mt-4 pt-4 border-t border-[#E2E8F0] bg-indigo-50/50 rounded-xl p-3 text-[11px] text-indigo-900 space-y-1.5">
              <div className="font-bold flex items-center gap-1.5 text-indigo-950">
                <CheckCircle2 size={13} className="text-indigo-600" />
                <span>Single Global Multiplex Channel</span>
              </div>
              <p className="text-[10px] leading-relaxed text-indigo-800">
                Arsitektur Samara Stay menggunakan 1 koneksi WebSocket multiplex terpusat (<code className="font-mono font-bold">db-global-realtime</code>) untuk menghemat channel connection overhead dan mencegah kebocoran koneksi.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Section: Live Activity Stream / Query Feed */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-6 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-[#E2E8F0] pb-4">
          <div>
            <h3 className="text-base font-extrabold text-[#1E293B] flex items-center gap-2">
              <Activity size={18} className="text-indigo-600" />
              <span>Realtime Activity Stream & Payload Feed</span>
            </h3>
            <p className="text-xs text-[#64748B] mt-0.5">
              Riwayat kronologis 100 interaksi query terakhir, mencakup ukuran payload byte, jumlah baris, dan sumber eksekusi.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 sm:flex-initial">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cari tabel..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-7 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full sm:w-36"
              />
            </div>

            {/* Source Filter */}
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              {[
                { id: 'all', label: 'Semua' },
                { id: 'supabase', label: 'Supabase' },
                { id: 'realtime-event', label: 'Realtime' },
                { id: 'rest-fallback', label: 'API Fallback' },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setFilterSource(s.id)}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition cursor-pointer ${
                    filterSource === s.id ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Metrics List */}
        {filteredMetrics.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Filter size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-xs font-semibold">Tidak ada metrik yang cocok dengan filter aktif.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-[#64748B] font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-3">Waktu</th>
                  <th className="py-2.5 px-3">Tabel</th>
                  <th className="py-2.5 px-3">Sumber</th>
                  <th className="py-2.5 px-3 text-right">Ukuran Payload</th>
                  <th className="py-2.5 px-3 text-right">Baris</th>
                  <th className="py-2.5 px-3 text-right">Status Egress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {filteredMetrics.slice(0, 50).map((metric) => {
                  const isLarge = metric.bytes > 50 * 1024; // > 50 KB
                  return (
                    <tr key={metric.id} className="hover:bg-slate-50 transition">
                      <td className="py-2.5 px-3 font-mono text-slate-500 text-[11px]">
                        {metric.timestamp}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-[11px] border border-slate-200">
                          {metric.table}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                          metric.source === 'supabase'
                            ? 'bg-blue-100 text-blue-800 border border-blue-200'
                            : metric.source === 'realtime-event'
                            ? 'bg-purple-100 text-purple-800 border border-purple-200'
                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}>
                          {metric.source === 'supabase' ? 'Supabase REST' : metric.source === 'realtime-event' ? 'WebSocket Event' : 'Fallback API'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">
                        {formatBytes(metric.bytes)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                        {metric.rowCount} row
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {isLarge ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                            <AlertTriangle size={10} />
                            <span>Payload Besar (&gt;50KB)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            <CheckCircle2 size={10} />
                            <span>Optimal</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default EgressManagementPanel;
