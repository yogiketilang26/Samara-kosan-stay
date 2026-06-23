import React, { useState } from 'react';
import { Room, Property, Coupon } from '../../types';
import { formatRupiah } from '../../utils/formatCurrency';
import { Calendar, Tag, ShieldAlert } from 'lucide-react';

interface BookingFormProps {
  property: Property;
  room: Room;
  checkoutFlow: 'survey' | 'monthly' | 'daily';
  couponInput: string;
  setCouponInput: (val: string) => void;
  onApplyCoupon: () => void;
  couponError: string;
  appliedCoupon: Coupon | null;
  bookingPeriodMonths: number;
  setBookingPeriodMonths: (m: number) => void;
  bookingPeriodDays: number;
  setBookingPeriodDays: (d: number) => void;
  bookingCheckInDate: string;
  setBookingCheckInDate: (date: string) => void;
  surveyForm: {
    fullName: string;
    nik: string;
    email: string;
    phone: string;
    address: string;
    job: string;
    date: string;
    slot: string;
  };
  setSurveyForm: (val: any) => void;
  bookingForm: {
    fullName: string;
    phone: string;
    email: string;
    nik: string;
  };
  setBookingForm: (val: any) => void;
  onProceedToPayment: (calculatedTotal: number) => void;
}

export const BookingForm: React.FC<BookingFormProps> = ({
  property,
  room,
  checkoutFlow,
  couponInput,
  setCouponInput,
  onApplyCoupon,
  couponError,
  appliedCoupon,
  bookingPeriodMonths,
  setBookingPeriodMonths,
  bookingPeriodDays,
  setBookingPeriodDays,
  bookingCheckInDate,
  setBookingCheckInDate,
  surveyForm,
  setSurveyForm,
  bookingForm,
  setBookingForm,
  onProceedToPayment
}) => {
  const getPriceCalcs = () => {
    const rentBase = checkoutFlow === 'daily' 
      ? room.daily_price * bookingPeriodDays 
      : room.price * bookingPeriodMonths;
    
    let discount = 0;
    if (appliedCoupon) {
      if (appliedCoupon.discount_type === 'percentage') {
        discount = rentBase * (appliedCoupon.discount_value / 100);
        if (appliedCoupon.max_discount_amount && discount > appliedCoupon.max_discount_amount) {
          discount = appliedCoupon.max_discount_amount;
        }
      } else {
        discount = appliedCoupon.discount_value;
      }
    }

    const netRent = Math.max(0, rentBase - discount);
    const tax = Math.round(netRent * 0.1);
    const deposit = 500000; // standard commitment or deposit
    const grandTotal = netRent + tax + (checkoutFlow === 'survey' ? 0 : deposit);

    return {
      rent: rentBase,
      discount,
      tax,
      deposit,
      total: checkoutFlow === 'survey' ? 500000 : grandTotal // DP Survey is fixed flat Rp 500.000 commitment
    };
  };

  const calcs = getPriceCalcs();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onProceedToPayment(calcs.total);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 font-sans text-xs text-slate-300">
      {checkoutFlow === 'survey' ? (
        // Survey workflow fields
        <div className="space-y-3">
          <div className="bg-amber-500/5 border border-amber-500/10 p-3 rounded-2xl flex gap-2 text-[10px] leading-relaxed text-amber-400">
            <ShieldAlert size={14} className="shrink-0 animate-pulse" />
            <p>Sewa Komitmen Survey membutuhkan DP Rp 500.000. Jaminan ini akan hangus jika Anda tidak hadir sesuai jadwal (No-Show), namun sepenuhnya dikembalikan/dikompensasikan ke harga sewa jika lanjut sewa (Covenan Transparansi).</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-slate-400 font-mono">Nama Lengkap</label>
              <input 
                type="text" required
                value={surveyForm.fullName}
                onChange={(e) => setSurveyForm({ ...surveyForm, fullName: e.target.value })}
                placeholder="Sesuai KTP"
                className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-200 outline-none focus:border-amber-505"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-slate-400 font-mono">Nomor KTP (16 Digit NIK)</label>
              <input 
                type="text" required maxLength={16}
                value={surveyForm.nik}
                onChange={(e) => setSurveyForm({ ...surveyForm, nik: e.target.value })}
                placeholder="3174..."
                className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-200 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-slate-400 font-mono">Tanggal Kunjungan</label>
              <input 
                type="date" required
                value={surveyForm.date}
                onChange={(e) => setSurveyForm({ ...surveyForm, date: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-200 font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-slate-400 font-mono">Slot Jam Kunjungan</label>
              <select
                value={surveyForm.slot}
                onChange={(e) => setSurveyForm({ ...surveyForm, slot: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-200 font-semibold cursor-pointer"
              >
                <option value="09:00 - 11:00">Pagi (09:00 - 11:00)</option>
                <option value="13:00 - 15:00">Siang (13:00 - 15:00)</option>
                <option value="16:00 - 18:00">Sore (16:00 - 18:00)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-slate-400 font-mono">Nomor Handphone (WhatsApp)</label>
              <input 
                type="tel" required
                value={surveyForm.phone}
                onChange={(e) => setSurveyForm({ ...surveyForm, phone: e.target.value })}
                placeholder="0812..."
                className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-200 font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-slate-400 font-mono">Email Utama</label>
              <input 
                type="email" required
                value={surveyForm.email}
                onChange={(e) => setSurveyForm({ ...surveyForm, email: e.target.value })}
                placeholder="yogi@gmail.com"
                className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-200"
              />
            </div>
          </div>
        </div>
      ) : (
        // Regular direct booking direct fields
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-slate-400 font-mono">Nama Tenant Utama</label>
              <input 
                type="text" required
                value={bookingForm.fullName}
                onChange={(e) => setBookingForm({ ...bookingForm, fullName: e.target.value })}
                placeholder="Nama sesuai identitas"
                className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-205 focus:border-amber-500 outline-none capitalize"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-slate-400 font-mono">No. WhatsApp Aktif</label>
              <input 
                type="tel" required
                value={bookingForm.phone}
                onChange={(e) => setBookingForm({ ...bookingForm, phone: e.target.value })}
                placeholder="0812..."
                className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-205 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-slate-400 font-mono">Email</label>
              <input 
                type="email" required
                value={bookingForm.email}
                onChange={(e) => setBookingForm({ ...bookingForm, email: e.target.value })}
                placeholder="alamat@email.com"
                className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-205"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-slate-400 font-mono">NIK KTP (16 digit)</label>
              <input 
                type="text" required maxLength={16}
                value={bookingForm.nik}
                onChange={(e) => setBookingForm({ ...bookingForm, nik: e.target.value })}
                placeholder="NIK KTP"
                className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-205 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-slate-400 font-mono">Rencana Check-In</label>
              <input 
                type="date" required
                value={bookingCheckInDate}
                onChange={(e) => setBookingCheckInDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-205 font-mono"
              />
            </div>

            {checkoutFlow === 'monthly' ? (
              <div className="space-y-1">
                <label className="text-[9px] uppercase font-bold text-slate-400 font-mono">Durasi Sewa (Bulan)</label>
                <select
                  value={bookingPeriodMonths}
                  onChange={(e) => setBookingPeriodMonths(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-205 font-bold cursor-pointer"
                >
                  {[1, 3, 6, 12].map(m => (
                    <option key={m} value={m}>{m} Bulan</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-[9px] uppercase font-bold text-slate-400 font-mono">Durasi Sewa (Hari)</label>
                <input 
                  type="number" min={1} max={30}
                  value={bookingPeriodDays}
                  onChange={(e) => setBookingPeriodDays(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-205 font-mono font-bold"
                />
              </div>
            )}
          </div>

          {/* Promotional Coupon Validation code */}
          <div className="space-y-1 bg-slate-955 p-3 rounded-2xl border border-slate-850/80">
            <label className="text-[9px] uppercase font-bold text-slate-400 font-mono flex items-center gap-1.5">
              <Tag size={12} className="text-amber-500 animate-pulse" />
              Gunakan Kode Promo Diskon
            </label>
            <div className="flex gap-2 mt-1">
              <input 
                type="text"
                placeholder="CONTOH: COVENAN20"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-200 outline-none uppercase font-mono font-bold text-[10px]"
              />
              <button
                type="button"
                onClick={onApplyCoupon}
                className="bg-slate-800 hover:bg-slate-700 hover:text-white px-3 py-1.5 rounded-xl border border-slate-750 text-slate-300 font-bold transition-all text-[10px] cursor-pointer"
              >
                Gunakan
              </button>
            </div>
            {couponError && <p className="text-[9px] text-red-500 font-mono mt-1">{couponError}</p>}
            {appliedCoupon && (
              <p className="text-[9px] text-emerald-400 font-mono mt-1 font-bold">
                PROMO AKTIF: Potongan {appliedCoupon.discount_type === 'percentage' ? `${appliedCoupon.discount_value}%` : formatRupiah(appliedCoupon.discount_value)} Berhasil Terpasang!
              </p>
            )}
          </div>
        </div>
      )}

      {/* Structured Price breakdowns summary */}
      <div className="bg-slate-950/60 p-4 rounded-3xl border border-slate-850 space-y-2 font-sans font-medium text-xs">
        <h4 className="text-[10px] uppercase font-bold text-slate-400 font-mono border-b border-slate-850 pb-1">Detail Rincian Biaya</h4>
        
        {checkoutFlow === 'survey' ? (
          <div className="flex justify-between items-center text-slate-300">
            <span>Commitment Payment DP Survey</span>
            <span className="font-mono font-bold text-amber-500">Rp 500.000</span>
          </div>
        ) : (
          <div className="space-y-2 pt-1 text-[11px]">
            <div className="flex justify-between items-center text-slate-400">
              <span>Sewa Kamar {room.room_number} ({checkoutFlow === 'monthly' ? `${bookingPeriodMonths} bulan` : `${bookingPeriodDays} hari`})</span>
              <span className="font-mono text-slate-300">{formatRupiah(calcs.rent)}</span>
            </div>

            {calcs.discount > 0 && (
              <div className="flex justify-between items-center text-[#10b981]/80">
                <span>Diskon Promo Kupon</span>
                <span className="font-mono font-bold">-{formatRupiah(calcs.discount)}</span>
              </div>
            )}

            <div className="flex justify-between items-center text-slate-400">
              <span>Pajak Daerah PBJT (10%)</span>
              <span className="font-mono text-slate-300">{formatRupiah(calcs.tax)}</span>
            </div>

            <div className="flex justify-between items-center text-slate-400">
              <span>Deposit Jaminan Kerusakan (Refundable)</span>
              <span className="font-mono text-slate-300">{formatRupiah(calcs.deposit)}</span>
            </div>
          </div>
        )}

        <div className="border-t border-slate-850 pt-2 flex justify-between items-center text-xs">
          <span className="font-bold text-slate-200">TOTAL PEMBAYARAN LUNAS</span>
          <span className="text-amber-500 font-black font-mono text-sm leading-none animate-pulse">
            {formatRupiah(calcs.total)}
          </span>
        </div>
      </div>

      <button
        type="submit"
        className="w-full py-2.5 bg-amber-500 hover:bg-amber-450 border border-amber-500 text-black font-black uppercase text-[11px] rounded-2xl shadow-xl transition-all tracking-wider cursor-pointer"
      >
        Bayar Online Sekarang via Midtrans SNAP
      </button>
    </form>
  );
};

export default BookingForm;
