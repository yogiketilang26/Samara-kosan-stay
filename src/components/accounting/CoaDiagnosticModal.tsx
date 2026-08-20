import React, { useState } from 'react';
import { ShieldCheck, RefreshCw, AlertTriangle, CheckCircle2, XCircle, Search, Wrench, Database, Layers, Check } from 'lucide-react';
import { Modal } from '../common/Modal';
import { formatRupiah } from '../../utils/formatCurrency';

interface CoaAccountStatus {
  id: number;
  name: string;
  type: string;
  category?: string;
  exists: boolean;
  balance?: number;
}

interface CoaDiagnosticResult {
  healthy: boolean;
  totalChecked: number;
  existingCount: number;
  missingCount: number;
  missingAccounts: Array<{ id: number; name: string; type: string; category?: string }>;
  repairedCount: number;
  repairedAccounts: Array<{ id: number; name: string }>;
  accountsStatus?: CoaAccountStatus[];
  timestamp: string;
  error?: string;
}

interface CoaDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
  diagnosticData: CoaDiagnosticResult | null;
  isLoading: boolean;
  isRepairing: boolean;
  onRefresh: () => Promise<void>;
  onRepair: () => Promise<void>;
}

export const CoaDiagnosticModal: React.FC<CoaDiagnosticModalProps> = ({
  isOpen,
  onClose,
  diagnosticData,
  isLoading,
  isRepairing,
  onRefresh,
  onRepair
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'>('all');

  if (!isOpen) return null;

  const accounts = diagnosticData?.accountsStatus || [];
  const filteredAccounts = accounts.filter(acc => {
    const matchesSearch = acc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(acc.id).includes(searchTerm) ||
      (acc.category && acc.category.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesType = typeFilter === 'all' || acc.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const isHealthy = diagnosticData?.healthy ?? false;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Diagnostik & Integritas Bagan Akun (COA)"
      maxWidth="max-w-4xl"
    >
      <div className="space-y-5">
        {/* Header Banner */}
        <div className={`p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
          isHealthy
            ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
            : 'bg-amber-50/80 border-amber-200 text-amber-950'
        }`}>
          <div className="flex items-start gap-3">
            <div className={`p-2.5 rounded-xl ${isHealthy ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}`}>
              {isHealthy ? <ShieldCheck size={24} /> : <AlertTriangle size={24} />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-black tracking-tight">
                  {isHealthy ? 'Bagan Akun Keuangan Lengkap & Terverifikasi' : 'Terdeteksi Akun Kritis Belum Terdaftar'}
                </h4>
                <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                  isHealthy ? 'bg-emerald-200/60 text-emerald-800' : 'bg-amber-200/60 text-amber-800'
                }`}>
                  {isHealthy ? 'Healthy (100%)' : 'Needs Repair'}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                {isHealthy
                  ? 'Seluruh 21 akun akuntansi berpasangan (Double-Entry Ledger) telah diverifikasi aktif di basis data untuk mencegah kegagalan pelunasan Midtrans & DP survey.'
                  : `Terdapat ${diagnosticData?.missingCount || 0} akun COA kritis yang belum ada di database. Klik tombol perbaiki di bawah untuk auto-seed.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading || isRepairing}
              className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
              {isLoading ? 'Memeriksa...' : 'Cek Ulang'}
            </button>

            {(!isHealthy || (diagnosticData?.missingCount ?? 0) > 0) && (
              <button
                type="button"
                onClick={onRepair}
                disabled={isRepairing || isLoading}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Wrench size={13} className={isRepairing ? 'animate-spin' : ''} />
                {isRepairing ? 'Memperbaiki...' : 'Perbaiki Otomatis'}
              </button>
            )}
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Akun Kritis</span>
            <span className="text-xl font-black text-slate-900 font-mono mt-0.5 block">{diagnosticData?.totalChecked || 21}</span>
            <span className="text-[10px] text-slate-400">Standar PSAK Kos ERP</span>
          </div>

          <div className="p-3.5 bg-emerald-50/50 border border-emerald-100 rounded-2xl">
            <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider block">Tersedia di DB</span>
            <span className="text-xl font-black text-emerald-700 font-mono mt-0.5 block">
              {accounts.filter(a => a.exists).length}
            </span>
            <span className="text-[10px] text-emerald-600">Siap untuk posting jurnal</span>
          </div>

          <div className="p-3.5 bg-amber-50/50 border border-amber-100 rounded-2xl">
            <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider block">Akun Hilang</span>
            <span className="text-xl font-black text-amber-700 font-mono mt-0.5 block">
              {accounts.filter(a => !a.exists).length}
            </span>
            <span className="text-[10px] text-amber-600">
              {accounts.filter(a => !a.exists).length === 0 ? 'Semua lengkap' : 'Perlu dipulihkan'}
            </span>
          </div>

          <div className="p-3.5 bg-indigo-50/50 border border-indigo-100 rounded-2xl">
            <span className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wider block">Proteksi Otomatis</span>
            <span className="text-sm font-extrabold text-indigo-800 mt-1 block flex items-center gap-1">
              <CheckCircle2 size={14} className="text-indigo-600" /> AKTIF
            </span>
            <span className="text-[10px] text-indigo-600">Auto-verify on settlement</span>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Cari nomor ID, nama akun, kategori..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0D9488]/20 focus:border-[#0D9488]"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
            {[
              { id: 'all', label: 'Semua' },
              { id: 'asset', label: 'Aset' },
              { id: 'liability', label: 'Kewajiban' },
              { id: 'equity', label: 'Ekuitas' },
              { id: 'revenue', label: 'Pendapatan' },
              { id: 'expense', label: 'Beban' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTypeFilter(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  typeFilter === tab.id
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table of Accounts */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs max-h-[380px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className="px-3.5 py-2.5">ID Akun</th>
                <th className="px-3.5 py-2.5">Nama Akun COA</th>
                <th className="px-3.5 py-2.5">Kategori</th>
                <th className="px-3.5 py-2.5">Tipe</th>
                <th className="px-3.5 py-2.5 text-right">Saldo Saat Ini</th>
                <th className="px-3.5 py-2.5 text-center">Status DB</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Tidak ada akun yang sesuai dengan filter pencarian.
                  </td>
                </tr>
              ) : (
                filteredAccounts.map(acc => (
                  <tr key={acc.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-3.5 py-2.5 font-mono font-bold text-slate-900">
                      {acc.id}
                    </td>
                    <td className="px-3.5 py-2.5 font-medium text-slate-800">
                      <div className="flex items-center gap-1.5">
                        <span>{acc.name}</span>
                        {[1010, 1200, 1300, 4000, 5030].includes(acc.id) && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 font-mono">
                            CORE
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-500">
                      {acc.category || '-'}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md ${
                        acc.type === 'asset' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                        acc.type === 'liability' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                        acc.type === 'equity' ? 'bg-purple-50 text-purple-700 border border-purple-100' :
                        acc.type === 'revenue' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                        'bg-rose-50 text-rose-700 border border-rose-100'
                      }`}>
                        {acc.type}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-bold text-slate-700">
                      {acc.exists ? formatRupiah(acc.balance || 0) : '-'}
                    </td>
                    <td className="px-3.5 py-2.5 text-center">
                      {acc.exists ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          <Check size={10} /> Aktif
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                          <XCircle size={10} /> Hilang
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <div className="text-[11px] text-slate-400">
            Terakhir diperiksa: {diagnosticData?.timestamp ? new Date(diagnosticData.timestamp).toLocaleTimeString('id-ID') : '-'}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold transition-all text-xs cursor-pointer"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={onRepair}
              disabled={isRepairing || isLoading}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold transition-all text-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              <Wrench size={13} />
              Sinkronkan Ulang Semua COA
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
