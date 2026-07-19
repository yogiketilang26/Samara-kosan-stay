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
    isForOther?: boolean;
    occupantName?: string;
    occupantPhone?: string;
    occupantEmail?: string;
    occupantNik?: string;
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
    const deposit = checkoutFlow === 'daily' ? 0 : 500000; // standard commitment or deposit
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
    <form onSubmit={handleSubmit} className="space-y-5 font-sans text-xs text-[#475569]">
      {checkoutFlow === 'survey' ? (
        // Survey workflow fields
        <div className="space-y-3 text-left">
          <div className="bg-amber-50 border border-amber-200/60 p-3.5 rounded-2xl flex gap-2 text-[10px] leading-relaxed text-amber-900">
            <ShieldAlert size={14} className="shrink-0 text-amber-600 animate-pulse" />
            <p>Sewa Komitmen Survey membutuhkan DP Rp 500.000. Jaminan ini akan hangus jika Anda tidak hadir sesuai jadwal (No-Show), namun sepenuhnya dikembalikan/dikompensasikan ke harga sewa jika lanjut sewa (Covenan Transparansi).</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-[#64748B] font-mono">Nama Lengkap</label>
              <input 
                type="text" required
                value={surveyForm.fullName}
                onChange={(e) => setSurveyForm({ ...surveyForm, fullName: e.target.value })}
                placeholder="Sesuai KTP"
                className="w-full bg-slate-50/50 border border-[#E2E8F0] p-2.5 rounded-xl text-[#1E293B] outline-none focus:border-[#2E6F40] focus:bg-white focus:ring-1 focus:ring-[#2E6F40]/20 transition-all"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-[#64748B] font-mono">Nomor KTP (16 Digit NIK)</label>
              <input 
                type="text" required maxLength={16}
                value={surveyForm.nik}
                onChange={(e) => setSurveyForm({ ...surveyForm, nik: e.target.value })}
                placeholder="3174..."
                className="w-full bg-slate-50/50 border border-[#E2E8F0] p-2.5 rounded-xl text-[#1E293B] font-mono outline-none focus:border-[#2E6F40] focus:bg-white focus:ring-1 focus:ring-[#2E6F40]/20 transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-[#64748B] font-mono">Tanggal Kunjungan</label>
              <input 
                type="date" required
                value={surveyForm.date}
                onChange={(e) => setSurveyForm({ ...surveyForm, date: e.target.value })}
                className="w-full bg-slate-50/50 border border-[#E2E8F0] p-2.5 rounded-xl text-[#1E293B] font-mono outline-none focus:border-[#2E6F40] focus:bg-white focus:ring-1 focus:ring-[#2E6F40]/20 transition-all"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-[#64748B] font-mono">Slot Jam Kunjungan</label>
              <select
                value={surveyForm.slot}
                onChange={(e) => setSurveyForm({ ...surveyForm, slot: e.target.value })}
                className="w-full bg-slate-50/50 border border-[#E2E8F0] p-2.5 rounded-xl text-[#1E293B] font-semibold cursor-pointer outline-none focus:border-[#2E6F40] focus:bg-white focus:ring-1 focus:ring-[#2E6F40]/20 transition-all"
              >
                <option value="09:00 - 11:00">Pagi (09:00 - 11:00)</option>
                <option value="13:00 - 15:00">Siang (13:00 - 15:00)</option>
                <option value="16:00 - 18:00">Sore (16:00 - 18:00)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-[#64748B] font-mono">Nomor Handphone (WhatsApp)</label>
              <input 
                type="tel" required
                value={surveyForm.phone}
                onChange={(e) => setSurveyForm({ ...surveyForm, phone: e.target.value })}
                placeholder="0812..."
                className="w-full bg-slate-50/50 border border-[#E2E8F0] p-2.5 rounded-xl text-[#1E293B] font-mono outline-none focus:border-[#2E6F40] focus:bg-white focus:ring-1 focus:ring-[#2E6F40]/20 transition-all"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-[#64748B] font-mono">Email Utama</label>
              <input 
                type="email" required
                value={surveyForm.email}
                onChange={(e) => setSurveyForm({ ...surveyForm, email: e.target.value })}
                placeholder="yogi@gmail.com"
                className="w-full bg-slate-50/50 border border-[#E2E8F0] p-2.5 rounded-xl text-[#1E293B] outline-none focus:border-[#2E6F40] focus:bg-white focus:ring-1 focus:ring-[#2E6F40]/20 transition-all"
              />
            </div>
          </div>
        </div>
      ) : (
        // Regular direct booking direct fields
        <div className="space-y-3 text-left">
          {/* Quick toggle mode buttons for Pemesan */}
          <div className="flex gap-2 p-1 bg-slate-50 rounded-xl border border-[#E2E8F0]">
            <button
              type="button"
              onClick={() => setBookingForm({ ...bookingForm, isForOther: false })}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all duration-200 cursor-pointer text-center ${
                !bookingForm.isForOther
                  ? 'bg-[#2E6F40] text-white shadow-xs font-black'
                  : 'text-[#64748B] hover:text-[#1E293B] hover:bg-slate-100'
              }`}
            >
              👤 Booking Sendiri
            </button>
            <button
              type="button"
              onClick={() => setBookingForm({ ...bookingForm, isForOther: true })}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all duration-200 cursor-pointer text-center ${
                bookingForm.isForOther
                  ? 'bg-[#2E6F40] text-white shadow-xs font-black'
                  : 'text-[#64748B] hover:text-[#1E293B] hover:bg-slate-100'
              }`}
            >
              👥 Booking Orang Lain (Ketiga)
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-[#64748B] font-mono">Nama Tenant Utama</label>
              <input 
                type="text" required
                value={bookingForm.fullName}
                onChange={(e) => setBookingForm({ ...bookingForm, fullName: e.target.value })}
                placeholder="Nama sesuai identitas"
                className="w-full bg-slate-50/50 border border-[#E2E8F0] p-2.5 rounded-xl text-[#1E293B] focus:border-[#2E6F40] focus:bg-white focus:ring-1 focus:ring-[#2E6F40]/20 outline-none capitalize transition-all"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-[#64748B] font-mono">No. WhatsApp Aktif</label>
              <input 
                type="tel" required
                value={bookingForm.phone}
                onChange={(e) => setBookingForm({ ...bookingForm, phone: e.target.value })}
                placeholder="0812..."
                className="w-full bg-slate-50/50 border border-[#E2E8F0] p-2.5 rounded-xl text-[#1E293B] font-mono outline-none focus:border-[#2E6F40] focus:bg-white focus:ring-1 focus:ring-[#2E6F40]/20 transition-all"
              />
            </div>
          </div>

          <div className={bookingForm.isForOther ? "grid grid-cols-1" : "grid grid-cols-1 sm:grid-cols-2 gap-3"}>
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-[#64748B] font-mono">Email</label>
              <input 
                type="email" required
                value={bookingForm.email}
                onChange={(e) => setBookingForm({ ...bookingForm, email: e.target.value })}
                placeholder="alamat@email.com"
                className="w-full bg-slate-50/50 border border-[#E2E8F0] p-2.5 rounded-xl text-[#1E293B] focus:border-[#2E6F40] focus:bg-white focus:ring-1 focus:ring-[#2E6F40]/20 outline-none transition-all"
              />
            </div>
            {!bookingForm.isForOther && (
              <div className="space-y-1">
                <label className="text-[9px] uppercase font-bold text-[#64748B] font-mono">NIK KTP (16 digit)</label>
                <input 
                  type="text" required={!bookingForm.isForOther} maxLength={16}
                  value={bookingForm.nik}
                  onChange={(e) => setBookingForm({ ...bookingForm, nik: e.target.value })}
                  placeholder="NIK KTP"
                  className="w-full bg-slate-50/50 border border-[#E2E8F0] p-2.5 rounded-xl text-[#1E293B] font-mono focus:border-[#2E6F40] focus:bg-white focus:ring-1 focus:ring-[#2E6F40]/20 outline-none transition-all"
                />
              </div>
            )}
          </div>

          {/* Booking untuk orang lain toggle & form */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-[#E2E8F0] space-y-3">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input 
                type="checkbox"
                checked={!!bookingForm.isForOther}
                onChange={(e) => setBookingForm({ ...bookingForm, isForOther: e.target.checked })}
                className="w-4 h-4 rounded border-[#E2E8F0] bg-white text-[#2E6F40] focus:ring-0 cursor-pointer"
              />
              <span className="font-bold text-[11px] text-[#2E6F40] hover:text-[#1e4b2b] transition-colors">
                Saya memesan / booking Kamar ini untuk Orang Lain (Tamu/Penghuni Baru)
              </span>
            </label>

            {bookingForm.isForOther && (
              <div className="pt-2.5 border-t border-[#E2E8F0] space-y-3">
                <div className="bg-amber-50 text-amber-800 p-2.5 rounded-xl text-[10px] leading-relaxed border border-amber-200/50">
                  <strong>Catatan Pemesanan Pihak Ketiga:</strong> Masukkan data lengkap orang yang akan menempati kamar (Si B). Kamar akan otomatis terbooking lunas aman di sistem setelah pembayaran selesai. Admin akan memverifikasi NIK KTP mereka saat kedatangan/check-in.
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-bold text-[#64748B] font-mono">Nama Lengkap Penghuni</label>
                    <input 
                      type="text" required={bookingForm.isForOther}
                      value={bookingForm.occupantName || ''}
                      onChange={(e) => setBookingForm({ ...bookingForm, occupantName: e.target.value })}
                      placeholder="Nama lengkap penghuni"
                      className="w-full bg-slate-50/50 border border-[#E2E8F0] p-2.5 rounded-xl text-[#1E293B] focus:border-[#2E6F40] focus:bg-white focus:ring-1 focus:ring-[#2E6F40]/20 outline-none capitalize transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-bold text-[#64748B] font-mono">No. WhatsApp Penghuni</label>
                    <input 
                      type="tel" required={bookingForm.isForOther}
                      value={bookingForm.occupantPhone || ''}
                      onChange={(e) => setBookingForm({ ...bookingForm, occupantPhone: e.target.value })}
                      placeholder="Contoh: 0812..."
                      className="w-full bg-slate-50/50 border border-[#E2E8F0] p-2.5 rounded-xl text-[#1E293B] font-mono outline-none focus:border-[#2E6F40] focus:bg-white focus:ring-1 focus:ring-[#2E6F40]/20 transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-bold text-[#64748B] font-mono">Email Penghuni</label>
                    <input 
                      type="email" required={bookingForm.isForOther}
                      value={bookingForm.occupantEmail || ''}
                      onChange={(e) => setBookingForm({ ...bookingForm, occupantEmail: e.target.value })}
                      placeholder="email.penghuni@gmail.com"
                      className="w-full bg-slate-50/50 border border-[#E2E8F0] p-2.5 rounded-xl text-[#1E293B] outline-none focus:border-[#2E6F40] focus:bg-white focus:ring-1 focus:ring-[#2E6F40]/20 transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-bold text-[#64748B] font-mono">NIK KTP Penghuni (16 digit)</label>
                    <input 
                      type="text" required={bookingForm.isForOther} maxLength={16}
                      value={bookingForm.occupantNik || ''}
                      onChange={(e) => setBookingForm({ ...bookingForm, occupantNik: e.target.value })}
                      placeholder="NIK KTP Penghuni"
                      className="w-full bg-slate-50/50 border border-[#E2E8F0] p-2.5 rounded-xl text-[#1E293B] font-mono outline-none focus:border-[#2E6F40] focus:bg-white focus:ring-1 focus:ring-[#2E6F40]/20 transition-all"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-[#64748B] font-mono">Rencana Check-In</label>
              <input 
                type="date" required
                value={bookingCheckInDate}
                onChange={(e) => setBookingCheckInDate(e.target.value)}
                className="w-full bg-slate-50/50 border border-[#E2E8F0] p-2.5 rounded-xl text-[#1E293B] font-mono outline-none focus:border-[#2E6F40] focus:bg-white focus:ring-1 focus:ring-[#2E6F40]/20 transition-all"
              />
            </div>

            {checkoutFlow === 'monthly' ? (
              <div className="space-y-1">
                <label className="text-[9px] uppercase font-bold text-[#64748B] font-mono">Durasi Sewa (Bulan)</label>
                <select
                  value={bookingPeriodMonths}
                  onChange={(e) => setBookingPeriodMonths(Number(e.target.value))}
                  className="w-full bg-slate-50/50 border border-[#E2E8F0] p-2.5 rounded-xl text-[#1E293B] font-bold cursor-pointer outline-none focus:border-[#2E6F40] focus:bg-white focus:ring-1 focus:ring-[#2E6F40]/20 transition-all"
                >
                  {[1, 3, 6, 12].map(m => (
                    <option key={m} value={m}>{m} Bulan</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-[9px] uppercase font-bold text-[#64748B] font-mono">Durasi Sewa (Hari)</label>
                <input 
                  type="number" min={1} max={30}
                  value={bookingPeriodDays}
                  onChange={(e) => setBookingPeriodDays(Number(e.target.value))}
                  className="w-full bg-slate-50/50 border border-[#E2E8F0] p-2.5 rounded-xl text-[#1E293B] font-mono font-bold outline-none focus:border-[#2E6F40] focus:bg-white focus:ring-1 focus:ring-[#2E6F40]/20 transition-all"
                />
              </div>
            )}
          </div>

          {/* Promotional Coupon Validation code */}
          <div className="space-y-1 bg-slate-50 p-3 rounded-2xl border border-[#E2E8F0]">
            <label className="text-[9px] uppercase font-bold text-[#64748B] font-mono flex items-center gap-1.5">
              <Tag size={12} className="text-[#2E6F40] animate-pulse" />
              Gunakan Kode Promo Diskon
            </label>
            <div className="flex gap-2 mt-1">
              <input 
                type="text"
                placeholder="CONTOH: COVENAN20"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value)}
                className="flex-1 bg-white border border-[#E2E8F0] p-2.5 rounded-xl text-[#1E293B] outline-none uppercase font-mono font-bold text-[10px] focus:border-[#2E6F40]"
              />
              <button
                type="button"
                onClick={onApplyCoupon}
                className="bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-xl border border-slate-200 text-[#3A444D] font-bold transition-all text-[10px] cursor-pointer"
              >
                Gunakan
              </button>
            </div>
            {couponError && <p className="text-[9px] text-red-500 font-mono mt-1">{couponError}</p>}
            {appliedCoupon && (
              <p className="text-[9px] text-emerald-600 font-mono mt-1 font-bold">
                PROMO AKTIF: Potongan {appliedCoupon.discount_type === 'percentage' ? `${appliedCoupon.discount_value}%` : formatRupiah(appliedCoupon.discount_value)} Berhasil Terpasang!
              </p>
            )}
          </div>
        </div>
      )}

      {/* Structured Price breakdowns summary */}
      <div className="bg-slate-50 p-4 rounded-3xl border border-[#E2E8F0] space-y-2.5 font-sans font-medium text-xs text-left">
        <h4 className="text-[10px] uppercase font-bold text-[#64748B] font-mono border-b border-[#E2E8F0] pb-1">Detail Rincian Biaya</h4>
        
        {checkoutFlow === 'survey' ? (
          <div className="flex justify-between items-center text-[#475569]">
            <span>Commitment Payment DP Survey</span>
            <span className="font-mono font-bold text-[#2E6F40]">Rp 500.000</span>
          </div>
        ) : (
          <div className="space-y-2 pt-1 text-[11px]">
            <div className="flex justify-between items-center text-[#64748B]">
              <span>Sewa Kamar {room.room_number} ({checkoutFlow === 'monthly' ? `${bookingPeriodMonths} bulan` : `${bookingPeriodDays} hari`})</span>
              <span className="font-mono text-[#3A444D]">{formatRupiah(calcs.rent)}</span>
            </div>

            {calcs.discount > 0 && (
              <div className="flex justify-between items-center text-emerald-600 font-bold">
                <span>Diskon Promo Kupon</span>
                <span className="font-mono">-{formatRupiah(calcs.discount)}</span>
              </div>
            )}

            <div className="flex justify-between items-center text-[#64748B]">
              <span>Pajak Daerah PBJT (10%)</span>
              <span className="font-mono text-[#3A444D]">{formatRupiah(calcs.tax)}</span>
            </div>

            {calcs.deposit > 0 && (
              <div className="flex justify-between items-center text-[#64748B]">
                <span>Deposit Jaminan Kerusakan (Refundable)</span>
                <span className="font-mono text-[#3A444D]">{formatRupiah(calcs.deposit)}</span>
              </div>
            )}
          </div>
        )}

        <div className="border-t border-[#E2E8F0] pt-2 flex justify-between items-center text-xs">
          <span className="font-bold text-[#1E293B]">TOTAL PEMBAYARAN LUNAS</span>
          <span className="text-[#2E6F40] font-black font-mono text-sm leading-none">
            {formatRupiah(calcs.total)}
          </span>
        </div>
      </div>

      <button
        type="submit"
        className="w-full py-3 bg-[#2E6F40] hover:bg-[#1f4b2b] text-white font-black uppercase text-[11px] rounded-2xl shadow-sm transition-all tracking-wider cursor-pointer text-center"
      >
        Bayar Online Sekarang via Midtrans SNAP
      </button>
    </form>
  );
};

export default BookingForm;
