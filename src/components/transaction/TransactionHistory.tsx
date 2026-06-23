import React from 'react';
import { Booking, Survey } from '../../types';
import { formatRupiah } from '../../utils/formatCurrency';
import TransactionStatusBadge from './TransactionStatusBadge';
import { Calendar, Layers, Printer, ShieldCheck } from 'lucide-react';

interface TransactionHistoryProps {
  bookings: Booking[];
  surveys: Survey[];
  onPrintReceipt: (data: any) => void;
}

export const TransactionHistory: React.FC<TransactionHistoryProps> = ({
  bookings,
  surveys,
  onPrintReceipt
}) => {
  return (
    <div className="space-y-6 font-sans">
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-350 uppercase tracking-wider font-display flex items-center gap-2">
          <ShieldCheck size={16} className="text-amber-500 animate-pulse" />
          Kontrak Sewa Aktif Anda
        </h3>
        
        <div className="space-y-3">
          {bookings.map(b => (
            <div key={b.id} className="bg-slate-900 border border-slate-800 rounded-3xl p-4 flex flex-col md:flex-row justify-between gap-4 md:items-center hover:border-slate-700 transition">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-xs text-white uppercase">[KONTRAK {b.midtrans_order_id || b.id}]</span>
                  <TransactionStatusBadge status={b.status as any} />
                </div>
                <p className="text-[11px] text-slate-300 font-semibold font-sans">Unit Kamar: {b.room_number || 'N/A'}</p>
                <div className="text-[10px] text-slate-400 font-mono">
                  Mulai Check-In: {b.check_in_date || b.booking_date} | Durasi: {b.duration_months} Bulan
                </div>
              </div>

              <div className="flex md:flex-col justify-between items-end gap-2 text-xs shrink-0 border-t md:border-t-0 border-slate-850 pt-2 md:pt-0">
                <div className="text-right">
                  <span className="text-[8px] font-bold text-slate-450 block font-mono">Kewajiban Lunas</span>
                  <span className="font-mono font-bold text-amber-500 mt-0.5 block">{formatRupiah(b.total_price)}</span>
                </div>
                
                {b.status === 'approved' && (
                  <button
                    onClick={() => onPrintReceipt({
                      type: 'booking',
                      id: b.midtrans_order_id || `INV-${b.id}`,
                      name: b.tenant_name,
                      roomNo: b.room_number,
                      propertyName: `Samara Stay Unit`,
                      amountPaid: b.total_price,
                      method: b.payment_method || 'VIRTUAL_ACCOUNT',
                      date: b.booking_date,
                      details: `Pajak PBJT DKI Jakarta/Depok (10%) Terbayar`
                    })}
                    className="p-1 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-750 flex items-center gap-1.5 font-bold transition cursor-pointer text-[10px]"
                  >
                    <Printer size={11} />
                    Cetak Bukti Bayar
                  </button>
                )}
              </div>
            </div>
          ))}

          {bookings.length === 0 && (
            <p className="text-xs text-slate-500 text-center py-6 border border-dashed border-slate-800 rounded-3xl bg-slate-905">Belum ada antrian kontrak sewa kamar atas nama Anda.</p>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-350 uppercase tracking-wider font-display">Roster Janji Survey Kamar</h3>
        
        <div className="space-y-3">
          {surveys.map(s => (
            <div key={s.id} className="bg-slate-900 border border-slate-800 rounded-3xl p-4 flex flex-col md:flex-row justify-between gap-4 md:items-center hover:border-slate-700 transition">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-xs text-white uppercase">[SURVEY JANJI MATCH-COVENANT]</span>
                  <TransactionStatusBadge status={s.status as any} />
                </div>
                <p className="text-[11px] text-slate-300 font-semibold">Kamar Pilihan: {s.room_number}</p>
                <div className="text-[10px] text-slate-400 font-mono">
                  Jadwal: {s.survey_date} | Jam Sesi: {s.survey_time}
                </div>
              </div>

              <div className="flex md:flex-col justify-between items-end gap-2 text-xs shrink-0 border-t md:border-t-0 border-slate-850 pt-2 md:pt-0">
                <div className="text-right">
                  <span className="text-[8px] font-bold text-slate-450 block font-mono">Simpanan DP Komitmen</span>
                  <span className="font-mono font-bold text-amber-500 mt-0.5 block">Rp 500.000</span>
                </div>
                
                {s.status === 'survey_confirmed' && (
                  <button
                    onClick={() => onPrintReceipt({
                      type: 'survey',
                      id: `SRV-${s.id}`,
                      name: s.client_name,
                      roomNo: s.room_number,
                      propertyName: `Samara Stay Unit`,
                      amountPaid: 500000,
                      method: 'MIDTRANS_SNAP',
                      date: s.survey_date,
                      details: `Komitmen Pengamanan Kamar`
                    })}
                    className="p-1 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-750 flex items-center gap-1.5 font-bold transition cursor-pointer text-[10px]"
                  >
                    <Printer size={11} />
                    Bukti Janji Kunjungan
                  </button>
                )}
              </div>
            </div>
          ))}

          {surveys.length === 0 && (
            <p className="text-xs text-slate-500 text-center py-6 border border-dashed border-slate-800 rounded-3xl bg-slate-905">Belum ada jadwal janji survey kamar yang terdaftar.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default TransactionHistory;
