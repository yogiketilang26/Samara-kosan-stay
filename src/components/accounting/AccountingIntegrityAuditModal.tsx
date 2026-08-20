import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  RefreshCw, 
  Wrench, 
  FileText, 
  Download, 
  Scale, 
  Building2, 
  X, 
  Printer,
  ChevronDown,
  ChevronUp,
  Sparkles
} from 'lucide-react';
import { AccountingIntegrityAuditReport, IntegrityAuditCheckItem } from '../../types';

interface AccountingIntegrityAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshLedger?: () => void;
}

export const AccountingIntegrityAuditModal: React.FC<AccountingIntegrityAuditModalProps> = ({
  isOpen,
  onClose,
  onRefreshLedger
}) => {
  const [loading, setLoading] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [report, setReport] = useState<AccountingIntegrityAuditReport | null>(null);
  const [expandedCheckId, setExpandedCheckId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchAuditReport = async () => {
    setLoading(true);
    setNotification(null);
    try {
      const res = await fetch('/api/admin/accounting/integrity-audit');
      const data = await res.json();
      if (res.ok && data.success && data.report) {
        setReport(data.report);
      } else {
        setNotification({
          type: 'error',
          message: data.error || 'Gagal memuat hasil audit integritas akuntansi.'
        });
      }
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || 'Koneksi ke server terputus saat menjalankan audit.'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAuditReport();
    }
  }, [isOpen]);

  const handleExecuteAutoRepair = async () => {
    setRepairing(true);
    setNotification(null);
    try {
      const res = await fetch('/api/admin/accounting/integrity-audit/repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repairTypes: ['recalc_balances', 'fix_properties'] })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setNotification({
          type: 'success',
          message: `Perbaikan otomatis berhasil! ${data.result?.recalculatedAccounts || 0} saldo akun disinkronkan, ${data.result?.repairedProperties || 0} dimensi properti diperbaiki.`
        });
        if (data.result?.auditReport) {
          setReport(data.result.auditReport);
        } else {
          await fetchAuditReport();
        }
        if (onRefreshLedger) onRefreshLedger();
      } else {
        setNotification({
          type: 'error',
          message: data.error || 'Gagal menjalankan perbaikan otomatis.'
        });
      }
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || 'Gagal menghubungi server untuk perbaikan.'
      });
    } finally {
      setRepairing(false);
    }
  };

  const handleExportJSON = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `samara_accounting_integrity_audit_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  const isHealthy = report?.overallStatus === 'healthy' && report?.integrityScore === 100;
  const isWarning = report?.overallStatus === 'warning';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[92vh] shadow-2xl flex flex-col overflow-hidden border border-slate-100">
        
        {/* MODAL HEADER */}
        <div className="bg-slate-900 text-white p-6 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3.5">
            <div className={`p-2.5 rounded-2xl ${isHealthy ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : isWarning ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
              <ShieldCheck size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold tracking-widest text-teal-400 uppercase">
                  SAMARA STAY ENTERPRISE ACCOUNTING ERP v15
                </span>
                <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${
                  isHealthy ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                  isWarning ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                  'bg-red-500/20 text-red-300 border border-red-500/30'
                }`}>
                  {isHealthy ? '100% HEALTHY' : isWarning ? 'WARNING' : 'ACTION REQUIRED'}
                </span>
              </div>
              <h2 className="text-xl font-bold font-display text-white mt-0.5">
                Accounting Integrity Audit & Verification
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* MODAL BODY (SCROLLABLE) */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50/50">

          {/* NOTIFICATION BANNER */}
          {notification && (
            <div className={`p-4 rounded-2xl text-xs font-semibold flex items-center justify-between border ${
              notification.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
            }`}>
              <div className="flex items-center gap-2">
                {notification.type === 'success' ? <CheckCircle2 size={16} className="text-emerald-600" /> : <AlertTriangle size={16} className="text-red-600" />}
                <span>{notification.message}</span>
              </div>
              <button onClick={() => setNotification(null)} className="text-xs font-bold opacity-60 hover:opacity-100">✕</button>
            </div>
          )}

          {/* AUDIT SUMMARY SCORE CARD */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <span className="text-[10px] text-indigo-600 font-mono uppercase font-bold tracking-wider">
                  Skor Integritas Buku Besar
                </span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className={`text-4xl font-black font-mono ${
                    (report?.integrityScore || 0) === 100 ? 'text-emerald-600' :
                    (report?.integrityScore || 0) >= 70 ? 'text-amber-500' : 'text-red-600'
                  }`}>
                    {report?.integrityScore !== undefined ? report.integrityScore : '--'}
                  </span>
                  <span className="text-slate-400 font-bold text-sm">/ 100 Poin</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={fetchAuditReport}
                  disabled={loading || repairing}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                  Audit Ulang
                </button>

                <button
                  onClick={handleExecuteAutoRepair}
                  disabled={loading || repairing || isHealthy}
                  className={`text-xs font-bold px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 shadow-xs cursor-pointer ${
                    isHealthy
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white animate-pulse'
                  }`}
                >
                  <Wrench size={13} />
                  {repairing ? 'Memperbaiki...' : 'Perbaiki Otomatis'}
                </button>

                <button
                  onClick={handleExportJSON}
                  disabled={!report}
                  className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                  title="Unduh Laporan JSON"
                >
                  <Download size={13} />
                  JSON
                </button>
              </div>
            </div>

            {/* 4 KEY METRICS GRID */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                <span className="text-[9px] text-slate-500 font-bold uppercase font-mono block">Transaksi Finansial</span>
                <span className="text-base font-black text-slate-850 font-mono mt-0.5 block">
                  {report?.totalTransactionsChecked || 0} Trx
                </span>
              </div>
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                <span className="text-[9px] text-slate-500 font-bold uppercase font-mono block">Entri Jurnal Umum</span>
                <span className="text-base font-black text-slate-850 font-mono mt-0.5 block">
                  {report?.totalJournalEntriesChecked || 0} Baris
                </span>
              </div>
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                <span className="text-[9px] text-slate-500 font-bold uppercase font-mono block">Rekening COA Aktif</span>
                <span className="text-base font-black text-slate-850 font-mono mt-0.5 block">
                  {report?.totalAccountsChecked || 0} Akun
                </span>
              </div>
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                <span className="text-[9px] text-slate-500 font-bold uppercase font-mono block">Mutasi Kliring Gateway</span>
                <span className="text-base font-black text-slate-850 font-mono mt-0.5 block">
                  {report?.totalClearingRecordsChecked || 0} Data
                </span>
              </div>
            </div>
          </div>

          {/* DETAILED CHECKLIST ITEMS */}
          <div className="space-y-3">
            <h3 className="text-xs font-extrabold uppercase font-mono tracking-wider text-slate-500">
              Pemeriksaan Komprehensif Integritas Akuntansi
            </h3>

            {loading ? (
              <div className="bg-white rounded-2xl p-10 text-center space-y-3 border border-slate-200">
                <RefreshCw size={24} className="animate-spin text-teal-600 mx-auto" />
                <p className="text-xs text-slate-600 font-bold">Sedang melakukan audit matematika pembukuan dan rekonsiliasi data...</p>
              </div>
            ) : (
              (report?.checks || []).map((check: IntegrityAuditCheckItem) => {
                const isExpanded = expandedCheckId === check.id;
                const isPassed = check.status === 'passed';
                const isWarningItem = check.status === 'warning';

                return (
                  <div 
                    key={check.id}
                    className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs transition-all"
                  >
                    <div 
                      onClick={() => setExpandedCheckId(isExpanded ? null : check.id)}
                      className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50/80 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl shrink-0 ${
                          isPassed ? 'bg-emerald-100 text-emerald-700' :
                          isWarningItem ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {isPassed ? <CheckCircle2 size={16} /> : isWarningItem ? <AlertTriangle size={16} /> : <XCircle size={16} />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[9px] font-bold text-slate-400">[{check.id}]</span>
                            <span className="text-xs font-bold text-slate-800">{check.name}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">{check.details}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full ${
                          isPassed ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          isWarningItem ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                          'bg-red-50 text-red-700 border border-red-200'
                        }`}>
                          {check.status.toUpperCase()}
                        </span>
                        {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                      </div>
                    </div>

                    {/* EXPANDED DISCREPANCIES VIEW */}
                    {isExpanded && (
                      <div className="p-4 bg-slate-50 border-t border-slate-100 text-xs space-y-3 font-mono">
                        <div className="flex justify-between items-center text-[10px] text-slate-500">
                          <span>Analisis: {check.recordsAnalyzed} Record</span>
                          <span>Selisih: {check.discrepancyCount} Item</span>
                        </div>

                        {check.sampleDiscrepancies && check.sampleDiscrepancies.length > 0 ? (
                          <div className="overflow-x-auto bg-white p-3 rounded-xl border border-slate-200 max-h-48 overflow-y-auto">
                            <table className="w-full text-left text-[11px]">
                              <thead>
                                <tr className="border-b border-slate-100 text-slate-400 font-bold">
                                  <th className="pb-1.5">ID / No</th>
                                  <th className="pb-1.5">Keterangan</th>
                                  <th className="pb-1.5 text-right">Debit / Saldo</th>
                                  <th className="pb-1.5 text-right">Kredit / Hitungan</th>
                                  <th className="pb-1.5 text-right">Selisih</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {check.sampleDiscrepancies.map((d: any, idx: number) => (
                                  <tr key={idx} className="hover:bg-slate-50">
                                    <td className="py-1.5 text-indigo-600 font-bold">{d.account_id || d.journal_no || d.transaction_id || `Item-${idx+1}`}</td>
                                    <td className="py-1.5 text-slate-700 font-sans">{d.account_name || d.name || 'Discrepancy Detail'}</td>
                                    <td className="py-1.5 text-right text-emerald-600 font-bold">{d.stored_balance !== undefined ? Number(d.stored_balance).toLocaleString('id-ID') : Number(d.total_debit || 0).toLocaleString('id-ID')}</td>
                                    <td className="py-1.5 text-right text-slate-600">{d.computed_balance !== undefined ? Number(d.computed_balance).toLocaleString('id-ID') : Number(d.total_credit || 0).toLocaleString('id-ID')}</td>
                                    <td className="py-1.5 text-right text-red-600 font-bold">{Number(d.variance || d.diff || 0).toLocaleString('id-ID')}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="bg-white p-3 rounded-xl border border-slate-200 text-slate-600 font-sans text-[11px] flex items-center gap-2">
                            <CheckCircle2 size={14} className="text-emerald-500" />
                            Pemeriksaan lulus validasi tanpa deviasi atau selisih data.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* RECOMMENDATIONS BOX */}
          {report?.recommendations && report.recommendations.length > 0 && (
            <div className="bg-indigo-50/70 rounded-2xl p-4 border border-indigo-100 space-y-2">
              <div className="flex items-center gap-1.5 text-indigo-900 font-bold text-xs font-sans">
                <Sparkles size={14} className="text-indigo-600" />
                Rekomendasi Integritas Keuangan & Tindakan Lanjutan:
              </div>
              <ul className="text-xs text-indigo-950/80 space-y-1 list-disc list-inside font-sans pl-1">
                {report.recommendations.map((rec: string, i: number) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            </div>
          )}

        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-[10px] text-slate-400 font-mono">
            Audit ID: AUDIT-{new Date().toISOString().split('T')[0]} | Engine: PostgreSQL 16 & Stored Procedures
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Printer size={13} />
              Cetak Sertifikat
            </button>
            <button
              onClick={onClose}
              className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-5 py-2 rounded-xl transition-all cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
