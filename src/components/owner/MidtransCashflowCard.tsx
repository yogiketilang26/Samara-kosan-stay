import React from 'react';
import { 
  CreditCard, ArrowDownRight, ArrowUpRight, CheckCircle2, 
  Clock, ShieldCheck, DollarSign, RefreshCw, ExternalLink, Landmark 
} from 'lucide-react';
import { formatRupiah } from '../../utils/formatCurrency';
import { MidtransClearingTransaction } from '../../types';

interface MidtransCashflowCardProps {
  transactions: MidtransClearingTransaction[];
  totalGrossSettled: number;
  totalMdrFee: number;
  totalNetSettled: number;
  unreconciledEscrow: number;
}

export const MidtransCashflowCard: React.FC<MidtransCashflowCardProps> = ({
  transactions,
  totalGrossSettled,
  totalMdrFee,
  totalNetSettled,
  unreconciledEscrow
}) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
              <CreditCard size={18} />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 font-display">
                Arus Kas Gateway & Kliring Midtrans
              </h2>
              <p className="text-xs text-slate-500">
                Pencatatan real-time dana sewa masuk via payment gateway (QRIS, VA Bank, Credit Card)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Midtrans Core Live
          </span>
        </div>
      </div>

      {/* 3 Summary Metrics for Owner */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">
            Total Transaksi Kotor (Gross)
          </span>
          <div className="text-xl font-black text-slate-900 mt-1.5 font-display">
            {formatRupiah(totalGrossSettled)}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            Nominal dibayar oleh penyewa
          </span>
        </div>

        <div className="bg-amber-50/60 rounded-xl p-4 border border-amber-100">
          <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider font-mono">
            Biaya Layanan Gateway (MDR)
          </span>
          <div className="text-xl font-black text-amber-900 mt-1.5 font-display">
            {formatRupiah(totalMdrFee)}
          </div>
          <span className="text-[11px] text-amber-700/80 mt-1 block">
            Transparan dialokasikan ke Beban COA 5030
          </span>
        </div>

        <div className="bg-emerald-50/70 rounded-xl p-4 border border-emerald-100">
          <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider font-mono">
            Penerimaan Bersih (Net Inflow)
          </span>
          <div className="text-xl font-black text-emerald-700 mt-1.5 font-display">
            {formatRupiah(totalNetSettled)}
          </div>
          <span className="text-[11px] text-emerald-600 mt-1 block">
            Dana hak penerimaan pemilik
          </span>
        </div>

        <div className="bg-blue-50/70 rounded-xl p-4 border border-blue-100">
          <span className="text-[11px] font-bold text-blue-800 uppercase tracking-wider font-mono">
            Saldo Escrow Kliring (Akun 1200)
          </span>
          <div className="text-xl font-black text-blue-700 mt-1.5 font-display">
            {formatRupiah(unreconciledEscrow)}
          </div>
          <span className="text-[11px] text-blue-600 mt-1 block">
            Dana mengendap menuju bank operasional
          </span>
        </div>

      </div>

      {/* Transaction Feed Table for Owner */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-mono">
            Aktivitas Settlement Terkini
          </h3>
          <span className="text-xs text-slate-500">
            Menampilkan {Math.min(transactions.length, 5)} transaksi terakhir
          </span>
        </div>

        {transactions.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs">
            Belum ada data transaksi kliring Midtrans tercatat.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px] border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">Order ID & Penyewa</th>
                  <th className="py-3 px-4">Nominal Kotor</th>
                  <th className="py-3 px-4">Biaya Gateway (MDR)</th>
                  <th className="py-3 px-4">Penerimaan Bersih</th>
                  <th className="py-3 px-4">Status Kliring</th>
                  <th className="py-3 px-4 text-right">Waktu Settlement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.slice(0, 5).map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 font-mono text-[11px]">
                        {t.midtrans_order_id}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {t.tenant_name || 'Pembayaran Kamar Kos'}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-800">
                      {formatRupiah(t.gross_amount)}
                    </td>
                    <td className="py-3 px-4 text-amber-600 font-medium">
                      - {formatRupiah(t.fee_amount)}
                    </td>
                    <td className="py-3 px-4 font-bold text-emerald-600">
                      {formatRupiah(t.net_amount)}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        t.clearing_status === 'reconciled' || t.clearing_status === 'cleared'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}>
                        <CheckCircle2 size={10} />
                        {t.clearing_status === 'reconciled' ? 'Rekonsiliasi Bank' : 'Settled Midtrans'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-slate-400 font-mono text-[11px]">
                      {t.settled_at ? new Date(t.settled_at).toLocaleDateString('id-ID', {
                        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                      }) : (t.created_at ? new Date(t.created_at).toLocaleDateString('id-ID') : '-')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};
