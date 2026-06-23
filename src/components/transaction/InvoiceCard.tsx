import React from 'react';
import { formatRupiah } from '../../utils/formatCurrency';
import { BadgeCheck, FileText, Printer, CheckCircle } from 'lucide-react';

interface InvoiceCardProps {
  receipt: {
    type: 'survey' | 'booking';
    id: string;
    name: string;
    roomNo: string;
    propertyName: string;
    amountPaid: number;
    method: string;
    date: string;
    details?: string;
  };
  onClose: () => void;
}

export const InvoiceCard: React.FC<InvoiceCardProps> = ({ receipt, onClose }) => {
  return (
    <div className="bg-[#0f0f12] border border-slate-805 rounded-3xl p-6 text-slate-300 font-sans space-y-4 max-w-sm mx-auto shadow-2xl relative text-xs">
      
      {/* Printable branding header */}
      <div className="border-b border-slate-800 pb-3 text-center space-y-1 select-none">
        <div className="flex justify-center items-center gap-1.5 new-brand-element text-white">
          <BadgeCheck size={18} className="text-emerald-500 animate-pulse" />
          <h3 className="font-extrabold text-sm tracking-widest font-display text-white mt-1">SAMARA STAY</h3>
        </div>
        <p className="text-[9px] font-bold text-slate-500 font-mono tracking-wider">BUKTI SETORAN NOTARIAL RESMI</p>
      </div>

      <div className="space-y-2 text-[11px] font-medium leading-relaxed font-sans">
        <div className="flex justify-between border-b border-slate-855/35 py-1">
          <span className="text-slate-450 uppercase font-mono text-[9px]">Nomor Invoice</span>
          <span className="font-mono text-white select-all">{receipt.id}</span>
        </div>

        <div className="flex justify-between border-b border-slate-855/35 py-1">
          <span className="text-slate-450 uppercase font-mono text-[9px]">Penyewa</span>
          <span className="text-slate-100 font-bold capitalize">{receipt.name}</span>
        </div>

        <div className="flex justify-between border-b border-slate-855/35 py-1">
          <span className="text-slate-450 uppercase font-mono text-[9px]">Alokasi Kamar</span>
          <span className="text-white font-mono font-bold">Kamar {receipt.roomNo}</span>
        </div>

        <div className="flex justify-between border-b border-slate-855/35 py-1">
          <span className="text-slate-450 uppercase font-mono text-[9px]">Tanggal Settle</span>
          <span className="text-slate-200 font-mono">{receipt.date}</span>
        </div>

        <div className="flex justify-between border-b border-slate-855/35 py-1">
          <span className="text-slate-450 uppercase font-mono text-[9px]">Metode Pembayaran</span>
          <span className="text-slate-200 font-mono uppercase">{receipt.method}</span>
        </div>

        <div className="flex justify-between border-b border-slate-855/35 py-1">
          <span className="text-slate-450 uppercase font-mono text-[9px]">Klasifikasi PBJT</span>
          <span className="text-slate-200 font-sans italic">Pajak (10%) Disisihkan</span>
        </div>
      </div>

      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-900 text-center space-y-1">
        <span className="text-[9px] uppercase font-bold text-slate-500 font-mono">NOMINAL YANG DIBAYARKAN</span>
        <div className="text-base font-extrabold text-amber-500 font-mono">{formatRupiah(receipt.amountPaid)}</div>
        <p className="text-[8px] text-emerald-400 font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-1">
          <CheckCircle size={10} className="text-emerald-400 shrink-0" />
          MIDTRANS_CAPTURE_STATUS: SUCCESS
        </p>
      </div>

      <div className="text-[9px] text-slate-500 leading-normal text-center select-none pt-1">
        Dokumen ini diterbitkan oleh integrator sistem billing Samara Stay & Bank Mandiri sebagai dokumen setoran setelmen transaksi yang sah demi hukum.
      </div>

      <div className="flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 py-1.5 rounded-xl border border-white/10 hover:bg-white/5 font-bold cursor-pointer text-center text-[10px]"
        >
          Selesai
        </button>
        <button
          onClick={() => window.print()}
          className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 font-bold border border-slate-750 text-slate-250 rounded-xl cursor-pointer text-[10px]"
        >
          Cetak PDF
        </button>
      </div>

    </div>
  );
};

export default InvoiceCard;
