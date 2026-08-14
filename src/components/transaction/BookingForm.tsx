import React, { useState, useEffect } from 'react';
import { Room, Property, Coupon, Survey } from '../../types';
import { formatRupiah } from '../../utils/formatCurrency';
import { Calendar, Tag, ShieldAlert, Clock, Lock, CheckCircle2, Info } from 'lucide-react';
import { SignaturePad } from './SignaturePad';

export const SURVEY_SLOTS = [
  { value: '09:00 - 11:00', label: 'Pagi', time: '09:00 - 11:00 WIB' },
  { value: '13:00 - 15:00', label: 'Siang', time: '13:00 - 15:00 WIB' },
  { value: '16:00 - 18:00', label: 'Sore', time: '16:00 - 18:00 WIB' },
  { value: '19:00 - 20:30', label: 'Malam', time: '19:00 - 20:30 WIB' }
];

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
  surveys?: Survey[];
  surveyForm: {
    fullName: string;
    nik: string;
    email: string;
    phone: string;
    address: string;
    job: string;
    date: string;
    slot: string;
    isWithoutDp?: boolean;
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
  isAgreed: boolean;
  setIsAgreed: (agreed: boolean) => void;
  signatureUrl: string;
  setSignatureUrl: (url: string) => void;
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
  surveys = [],
  surveyForm,
  setSurveyForm,
  bookingForm,
  setBookingForm,
  onProceedToPayment,
  isAgreed,
  setIsAgreed,
  signatureUrl,
  setSignatureUrl
}) => {
  const [sigError, setSigError] = useState('');

  // Check if a specific time slot is already locked/booked by another active survey
  const isSlotLocked = (slotValue: string) => {
    if (!surveys || surveys.length === 0) return false;
    return surveys.some(s => 
      s.property_id === property.id &&
      s.room_number === room.room_number &&
      s.survey_date === surveyForm.date &&
      s.survey_time_slot === slotValue &&
      (s.status === 'survey_confirmed' || s.status === 'pending_payment')
    );
  };

  // Auto-switch to first available slot if currently selected slot is locked on the selected date
  useEffect(() => {
    if (checkoutFlow === 'survey' && isSlotLocked(surveyForm.slot)) {
      const firstAvail = SURVEY_SLOTS.find(s => !isSlotLocked(s.value));
      if (firstAvail) {
        setSurveyForm((prev: any) => ({ ...prev, slot: firstAvail.value }));
      }
    }
  }, [surveyForm.date, surveys, room.room_number, property.id, checkoutFlow]);

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
    const tax = 0; // PBJT Tax removed for end user
    const propDeposit = property.deposit_amount ?? 500000;
    const deposit = checkoutFlow === 'daily' ? 0 : propDeposit;
    const grandTotal = netRent + (checkoutFlow === 'survey' ? 0 : deposit);

    return {
      rent: rentBase,
      discount,
      tax: 0,
      deposit,
      total: checkoutFlow === 'survey' ? (surveyForm.isWithoutDp ? 0 : 500000) : grandTotal
    };
  };

  const calcs = getPriceCalcs();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSigError('');

    if (checkoutFlow === 'survey' && isSlotLocked(surveyForm.slot)) {
      setSigError(`Slot jam kunjungan ${surveyForm.slot} pada tanggal ${surveyForm.date} telah dipesan oleh pengunjung lain. Mohon pilih slot jam lain yang masih tersedia.`);
      return;
    }

    if (!isAgreed) {
      setSigError('Anda harus menyetujui Kebijakan & Peraturan Kos terlebih dahulu.');
      return;
    }
    if (!signatureUrl) {
      setSigError('Mohon bubuhkan Tanda Tangan Digital Anda (pada layar atau upload gambar file).');
      return;
    }

    onProceedToPayment(calcs.total);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 font-sans text-xs text-[#475569]">
      {checkoutFlow === 'survey' ? (
        // Survey workflow fields
        <div className="space-y-3 text-left">
          <div className="space-y-1">
            <label className="text-[9px] uppercase font-bold text-[#64748B] font-mono">Skema Kunjungan Survey</label>
            <div className="flex gap-2 p-1 bg-slate-100/80 rounded-xl border border-[#E2E8F0]">
              <button
                type="button"
                onClick={() => setSurveyForm({ ...surveyForm, isWithoutDp: false })}
                className={`flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase transition-all duration-200 cursor-pointer text-center ${
                  !surveyForm.isWithoutDp
                    ? 'bg-[#2E6F40] text-white shadow-xs font-black'
                    : 'text-[#64748B] hover:text-[#1E293B] hover:bg-slate-200'
                }`}
              >
                🔒 Komitmen DP (Prioritas)
              </button>
              <button
                type="button"
                onClick={() => setSurveyForm({ ...surveyForm, isWithoutDp: true })}
                className={`flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase transition-all duration-200 cursor-pointer text-center ${
                  surveyForm.isWithoutDp
                    ? 'bg-[#2E6F40] text-white shadow-xs font-black'
                    : 'text-[#64748B] hover:text-[#1E293B] hover:bg-slate-200'
                }`}
              >
                ⚡ Free Kunjungan (Tanpa DP)
              </button>
            </div>
          </div>

          {/* Educational notice regarding room availability and slot locking */}
          <div className="bg-emerald-50/80 border border-emerald-200/80 p-3 rounded-2xl flex gap-2.5 text-[10px] leading-relaxed text-emerald-950 shadow-xs">
            <Info size={15} className="shrink-0 text-[#2E6F40] mt-0.5" />
            <div>
              <strong className="text-emerald-900 font-bold block mb-0.5">Ketentuan Ketersediaan Kamar & Penguncian Jam:</strong>
              <span>Selama belum melakukan pembayaran sewa resmi (pelunasan penuh), unit kamar <strong>tetap terbuka</strong> dan calon penyewa lain dapat membuat janji survey juga. Sistem hanya mengunci <strong>slot jam yang Anda pilih</strong> agar tidak terjadi jadwal ganda pada unit ini.</span>
            </div>
          </div>

          {surveyForm.isWithoutDp ? (
            <div className="bg-blue-50 border border-blue-200/60 p-3 rounded-2xl flex gap-2 text-[10px] leading-relaxed text-blue-900">
              <ShieldAlert size={14} className="shrink-0 text-blue-600" />
              <p><strong>Skema Tanpa DP:</strong> Bebas biaya jaminan! Anda dapat datang langsung sesuai slot waktu yang Anda pilih di bawah.</p>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200/60 p-3 rounded-2xl flex gap-2 text-[10px] leading-relaxed text-amber-900">
              <ShieldAlert size={14} className="shrink-0 text-amber-600" />
              <p>DP Survey Rp 500.000 adalah jaminan komitmen kehadiran. Jaminan ini akan langsung <strong>mengurangi sisa tagihan sewa</strong> jika Anda melanjutkan sewa resmi (Covenan Transparansi).</p>
            </div>
          )}

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

          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[9px] uppercase font-bold text-[#64748B] font-mono flex items-center gap-1">
                  <Calendar size={11} className="text-[#2E6F40]" />
                  Tanggal Kunjungan
                </label>
                <input 
                  type="date" required
                  min={new Date().toISOString().split('T')[0]}
                  value={surveyForm.date}
                  onChange={(e) => setSurveyForm({ ...surveyForm, date: e.target.value })}
                  className="w-full bg-slate-50/50 border border-[#E2E8F0] p-2.5 rounded-xl text-[#1E293B] font-mono outline-none focus:border-[#2E6F40] focus:bg-white focus:ring-1 focus:ring-[#2E6F40]/20 transition-all"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] uppercase font-bold text-[#64748B] font-mono flex items-center gap-1">
                  <Clock size={11} className="text-[#2E6F40]" />
                  Slot Jam Terpilih
                </label>
                <select
                  value={surveyForm.slot}
                  onChange={(e) => setSurveyForm({ ...surveyForm, slot: e.target.value })}
                  className="w-full bg-slate-50/50 border border-[#E2E8F0] p-2.5 rounded-xl text-[#1E293B] font-semibold cursor-pointer outline-none focus:border-[#2E6F40] focus:bg-white focus:ring-1 focus:ring-[#2E6F40]/20 transition-all"
                >
                  {SURVEY_SLOTS.map(s => {
                    const locked = isSlotLocked(s.value);
                    return (
                      <option key={s.value} value={s.value} disabled={locked}>
                        {s.label} ({s.time}) {locked ? '— 🔒 Terisi / Dipesan' : '— Tersedia'}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Visual Interactive Time Slot Grid */}
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between items-center text-[9px] font-mono uppercase font-bold text-[#64748B]">
                <span>Pilih Slot Waktu Kunjungan (Unit {room.room_number})</span>
                <span className="text-[8px] font-medium lowercase text-slate-500">*slot terkunci jika ada janji lain</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {SURVEY_SLOTS.map((slot) => {
                  const locked = isSlotLocked(slot.value);
                  const isSelected = surveyForm.slot === slot.value;
                  return (
                    <button
                      key={slot.value}
                      type="button"
                      disabled={locked}
                      onClick={() => !locked && setSurveyForm({ ...surveyForm, slot: slot.value })}
                      className={`p-2.5 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                        locked
                          ? 'bg-slate-100/70 border-slate-200 text-slate-400 cursor-not-allowed opacity-70'
                          : isSelected
                          ? 'bg-[#2E6F40] border-[#2E6F40] text-white shadow-xs ring-2 ring-[#2E6F40]/20'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-[#2E6F40]/60 hover:bg-emerald-50/20 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-extrabold uppercase font-mono tracking-wide ${isSelected ? 'text-white' : locked ? 'text-slate-400' : 'text-slate-900'}`}>
                          {slot.label}
                        </span>
                        {locked ? (
                          <span className="flex items-center gap-0.5 text-[8px] font-bold px-1.5 py-0.5 rounded-md bg-red-100 text-red-700 font-mono">
                            <Lock size={9} /> Penuh
                          </span>
                        ) : isSelected ? (
                          <CheckCircle2 size={12} className="text-white" />
                        ) : (
                          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 font-mono">
                            Buka
                          </span>
                        )}
                      </div>
                      <span className={`text-[9px] font-mono mt-1 ${isSelected ? 'text-emerald-100' : locked ? 'text-slate-400' : 'text-slate-500'}`}>
                        {slot.time}
                      </span>
                    </button>
                  );
                })}
              </div>
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

      {/* Digital Signature & Rules Agreement Section */}
      <SignaturePad
        property={property}
        tenantName={checkoutFlow === 'survey' ? surveyForm.fullName : bookingForm.fullName}
        isAgreed={isAgreed}
        setIsAgreed={setIsAgreed}
        signatureUrl={signatureUrl}
        setSignatureUrl={(url) => {
          setSignatureUrl(url);
          if (url) setSigError('');
        }}
        error={sigError}
      />

      {/* Structured Price breakdowns summary */}
      <div className="bg-slate-50 p-4 rounded-3xl border border-[#E2E8F0] space-y-2.5 font-sans font-medium text-xs text-left">
        <h4 className="text-[10px] uppercase font-bold text-[#64748B] font-mono border-b border-[#E2E8F0] pb-1">Detail Rincian Biaya</h4>
        
        {checkoutFlow === 'survey' ? (
          <div className="flex justify-between items-center text-[#475569]">
            <span>Commitment Payment DP Survey</span>
            <span className="font-mono font-bold text-[#2E6F40]">{surveyForm.isWithoutDp ? 'Rp 0' : 'Rp 500.000'}</span>
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

            {calcs.deposit > 0 && (
              <div className="flex justify-between items-center text-[#64748B]">
                <span>Deposit Jaminan Gedung (Refundable)</span>
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
        {checkoutFlow === 'survey' && surveyForm.isWithoutDp 
          ? 'Konfirmasi Jadwal Survey Gratis' 
          : 'Bayar Online Sekarang via Midtrans SNAP'}
      </button>
    </form>
  );
};

export default BookingForm;
