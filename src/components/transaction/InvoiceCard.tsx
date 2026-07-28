import React from 'react';
import { formatRupiah } from '../../utils/formatCurrency';
import { BadgeCheck, FileText, Printer, CheckCircle, Download } from 'lucide-react';
import { generateInvoicePDF, InvoiceReceipt } from '../../utils/pdfGenerator';

interface InvoiceCardProps {
  receipt: InvoiceReceipt;
  onClose: () => void;
}

export const InvoiceCard: React.FC<InvoiceCardProps> = ({ receipt, onClose }) => {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 text-slate-600 font-sans space-y-4 max-w-sm mx-auto shadow-sm relative text-xs text-left">
      
      {/* Printable branding header */}
      <div className="border-b border-slate-200 pb-3 text-center space-y-1 select-none">
        <div className="flex justify-center items-center gap-1.5 new-brand-element text-[#2E6F40]">
          <BadgeCheck size={18} className="text-[#2E6F40] animate-pulse" />
          <h3 className="font-extrabold text-sm tracking-widest font-display text-[#3A444D] mt-1">SAMARA STAY</h3>
        </div>
        <p className="text-[9px] font-bold text-[#64748B] font-mono tracking-wider">BUKTI SETORAN NOTARIAL RESMI</p>
      </div>

      <div className="space-y-2 text-[11px] font-medium leading-relaxed font-sans">
        <div className="flex justify-between border-b border-slate-100 py-1">
          <span className="text-[#64748B] uppercase font-mono text-[9px]">Nomor Invoice</span>
          <span className="font-mono text-slate-800 select-all">{receipt.id}</span>
        </div>

        <div className="flex justify-between border-b border-slate-100 py-1">
          <span className="text-[#64748B] uppercase font-mono text-[9px]">Penyewa</span>
          <span className="text-slate-800 font-bold capitalize">{receipt.name}</span>
        </div>

        <div className="flex justify-between border-b border-slate-100 py-1">
          <span className="text-[#64748B] uppercase font-mono text-[9px]">Alokasi Kamar</span>
          <span className="text-slate-800 font-mono font-bold">Kamar {receipt.roomNo}</span>
        </div>

        <div className="flex justify-between border-b border-slate-100 py-1">
          <span className="text-[#64748B] uppercase font-mono text-[9px]">Tanggal Settle</span>
          <span className="text-slate-700 font-mono">{receipt.date}</span>
        </div>

        <div className="flex justify-between border-b border-slate-100 py-1">
          <span className="text-[#64748B] uppercase font-mono text-[9px]">Metode Pembayaran</span>
          <span className="text-slate-700 font-mono uppercase">{receipt.method}</span>
        </div>

        <div className="flex justify-between border-b border-slate-100 py-1">
          <span className="text-[#64748B] uppercase font-mono text-[9px]">Garansi Harga</span>
          <span className="text-slate-700 font-sans italic">Bebas Pajak & Biaya Tambahan</span>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 text-center space-y-1">
        <span className="text-[9px] uppercase font-bold text-[#64748B] font-mono">NOMINAL YANG DIBAYARKAN</span>
        <div className="text-base font-extrabold text-[#2E6F40] font-mono">{formatRupiah(receipt.amountPaid)}</div>
        <p className="text-[8px] text-emerald-600 font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-1">
          <CheckCircle size={10} className="text-emerald-600 shrink-0" />
          MIDTRANS_CAPTURE_STATUS: SUCCESS
        </p>
      </div>

      <div className="text-[9px] text-[#64748B] leading-normal text-center select-none pt-1">
        Dokumen ini diterbitkan oleh integrator sistem billing Samara Stay & Bank Mandiri sebagai dokumen setoran setelmen transaksi yang sah demi hukum.
      </div>

      <div className="flex flex-col sm:flex-row gap-2 pt-2">
        <button
          onClick={onClose}
          className="py-2.5 px-3 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold cursor-pointer text-center text-[10px]"
        >
          Tutup
        </button>
        <button
          onClick={() => window.print()}
          className="flex-1 py-2.5 px-3 bg-slate-200 hover:bg-slate-300 font-bold border border-slate-300 text-slate-800 rounded-xl cursor-pointer text-[10px] flex items-center justify-center gap-1.5"
        >
          <Printer size={12} />
          Cetak
        </button>
        <button
          onClick={() => generateInvoicePDF(receipt)}
          className="flex-1 py-2.5 px-3 bg-[#2E6F40] hover:bg-[#1f4b2b] font-bold border border-[#2E6F40] text-white rounded-xl cursor-pointer text-[10px] flex items-center justify-center gap-1.5 shadow-sm"
        >
          <Download size={12} />
          Unduh PDF Invoice
        </button>
      </div>

    </div>
  );
};

export default InvoiceCard;
