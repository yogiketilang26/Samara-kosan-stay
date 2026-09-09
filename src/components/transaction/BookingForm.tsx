import React, { useState, useEffect, useRef } from 'react';
import { Room, Property, Coupon, Survey } from '../../types';
import { formatRupiah } from '../../utils/formatCurrency';
import { 
  Calendar, Tag, ShieldAlert, Clock, Lock, CheckCircle2, Info, 
  Heart, Upload, FileText, X, Eye, RefreshCw, AlertCircle, FileCheck
} from 'lucide-react';
import { SignaturePad } from './SignaturePad';
import { uploadToSupabaseStorage } from '../../utils/storageUploader';

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
    isMarried?: boolean;
    marriageCertificateUrl?: string;
    spouseName?: string;
    spouseNik?: string;
    spousePhone?: string;
    spouseRelation?: 'istri' | 'suami' | string;
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
  const [isUploadingCert, setIsUploadingCert] = useState(false);
  const [certUploadError, setCertUploadError] = useState('');
  const [previewCertModal, setPreviewCertModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Upload handler for marriage book/card proof
  const handleCertFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (max 15MB)
    if (file.size > 15 * 1024 * 1024) {
      setCertUploadError('Ukuran file maksimal 15MB.');
      return;
    }

    setIsUploadingCert(true);
    setCertUploadError('');
    setSigError('');

    try {
      const cleanOwnerName = (bookingForm.fullName || 'pasutri').replace(/[^a-zA-Z0-9]/g, '_');
      const uploadResult = await uploadToSupabaseStorage(
        file,
        'documents',
        `nikah_${cleanOwnerName}`,
        { maxFileSizeMB: 15 }
      );

      if (uploadResult && uploadResult.publicUrl) {
        setBookingForm({
          ...bookingForm,
          marriageCertificateUrl: uploadResult.publicUrl
        });
      } else {
        throw new Error('Gagal mendapatkan tautan berkas dokumen.');
      }
    } catch (err: any) {
      console.error('[BookingForm] Upload buku nikah failed:', err);
      // Fallback: convert file to data URL so the user is never blocked
      try {
        const reader = new FileReader();
        reader.onload = (loadEvt) => {
          const dataUrl = loadEvt.target?.result as string;
          if (dataUrl) {
            setBookingForm({
              ...bookingForm,
              marriageCertificateUrl: dataUrl
            });
            setCertUploadError('');
          }
        };
        reader.readAsDataURL(file);
      } catch (readErr) {
        setCertUploadError('Gagal mengunggah berkas. Mohon coba file lain.');
      }
    } finally {
      setIsUploadingCert(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveCert = () => {
    setBookingForm({
      ...bookingForm,
      marriageCertificateUrl: ''
    });
    setCertUploadError('');
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

    if (checkoutFlow !== 'survey' && bookingForm.isMarried) {
      if (!bookingForm.spouseName?.trim()) {
        setSigError('Bagi penyewa berstatus menikah (Pasutri), Nama Lengkap Pasangan wajib diisi.');
        return;
      }
      if (!bookingForm.spousePhone?.trim()) {
        setSigError('Bagi penyewa berstatus menikah (Pasutri), No. WhatsApp Pasangan wajib diisi.');
        return;
      }
      if (!bookingForm.spouseNik?.trim()) {
        setSigError('Bagi penyewa berstatus menikah (Pasutri), NIK KTP Pasangan wajib diisi.');
        return;
      }
      if (!bookingForm.marriageCertificateUrl) {
        setSigError('Bagi penyewa berstatus menikah (Pasutri), wajib mengunggah bukti Foto Buku Nikah atau Kartu Nikah resmi.');
        return;
      }
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

          {/* Status Pernikahan / Pasutri Form & Bukti Buku Nikah */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-[#E2E8F0] space-y-3">
            <div className="flex items-start gap-2.5">
              <input 
                id="booking-married-checkbox"
                type="checkbox"
                checked={!!bookingForm.isMarried}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setBookingForm({
                    ...bookingForm,
                    isMarried: checked,
                    spouseRelation: bookingForm.spouseRelation || 'istri'
                  });
                  setSigError('');
                }}
                className="w-4 h-4 mt-0.5 rounded border-[#CBD5E1] bg-white text-[#2E6F40] focus:ring-0 cursor-pointer accent-[#2E6F40]"
              />
              <label htmlFor="booking-married-checkbox" className="cursor-pointer select-none">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-[11px] text-[#1E293B]">
                    Status Menikah (Pasangan Suami Istri / Pasutri)
                  </span>
                  <span className="bg-emerald-100 text-emerald-800 text-[9px] font-bold px-1.5 py-0.2 rounded-md font-mono">
                    Wajib Dokumen
                  </span>
                </div>
                <p className="text-[10px] text-[#64748B] mt-0.5 leading-relaxed">
                  Penyewa yang sudah menikah wajib melampirkan foto/scan bukti <strong>Buku Nikah</strong> atau <strong>Kartu Nikah</strong> resmi serta mengisi identitas pasangan.
                </p>
              </label>
            </div>

            {bookingForm.isMarried && (
              <div className="pt-3 border-t border-[#E2E8F0] space-y-3.5">
                <div className="bg-emerald-50/90 text-emerald-950 p-3 rounded-xl text-[10px] leading-relaxed border border-emerald-200 flex gap-2">
                  <Heart size={14} className="shrink-0 text-emerald-700 mt-0.5" />
                  <div>
                    <strong className="block font-bold text-emerald-900 mb-0.5">Kebijakan Hunian Pasutri Resmi:</strong>
                    <span>Untuk menjaga kenyamanan, keamanan, dan ketertiban seluruh penghuni, data pasangan dan bukti buku/kartu nikah akan diverifikasi oleh Admin/Owner secara tertutup dan aman.</span>
                  </div>
                </div>

                {/* Hubungan Pasangan Toggle */}
                <div className="space-y-1">
                  <label className="text-[9px] uppercase font-bold text-[#64748B] font-mono">
                    Identitas Pasangan Yang Tinggal Bersama
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setBookingForm({ ...bookingForm, spouseRelation: 'istri' })}
                      className={`flex-1 py-2 px-3 rounded-xl text-[10px] font-bold uppercase transition-all cursor-pointer text-center border ${
                        bookingForm.spouseRelation === 'istri' || !bookingForm.spouseRelation
                          ? 'bg-[#2E6F40] border-[#2E6F40] text-white shadow-xs font-black'
                          : 'bg-white border-[#E2E8F0] text-[#64748B] hover:bg-slate-100'
                      }`}
                    >
                      👰 Istri Pemesan
                    </button>
                    <button
                      type="button"
                      onClick={() => setBookingForm({ ...bookingForm, spouseRelation: 'suami' })}
                      className={`flex-1 py-2 px-3 rounded-xl text-[10px] font-bold uppercase transition-all cursor-pointer text-center border ${
                        bookingForm.spouseRelation === 'suami'
                          ? 'bg-[#2E6F40] border-[#2E6F40] text-white shadow-xs font-black'
                          : 'bg-white border-[#E2E8F0] text-[#64748B] hover:bg-slate-100'
                      }`}
                    >
                      🤵 Suami Pemesan
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-bold text-[#64748B] font-mono">
                      Nama Lengkap Pasangan <span className="text-red-500">*</span>
                    </label>
                    <input 
                      type="text" required={bookingForm.isMarried}
                      value={bookingForm.spouseName || ''}
                      onChange={(e) => setBookingForm({ ...bookingForm, spouseName: e.target.value })}
                      placeholder={bookingForm.spouseRelation === 'suami' ? 'Nama lengkap suami' : 'Nama lengkap istri'}
                      className="w-full bg-white border border-[#E2E8F0] p-2.5 rounded-xl text-[#1E293B] focus:border-[#2E6F40] focus:ring-1 focus:ring-[#2E6F40]/20 outline-none capitalize transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-bold text-[#64748B] font-mono">
                      No. WhatsApp Pasangan <span className="text-red-500">*</span>
                    </label>
                    <input 
                      type="tel" required={bookingForm.isMarried}
                      value={bookingForm.spousePhone || ''}
                      onChange={(e) => setBookingForm({ ...bookingForm, spousePhone: e.target.value })}
                      placeholder="Contoh: 0812..."
                      className="w-full bg-white border border-[#E2E8F0] p-2.5 rounded-xl text-[#1E293B] font-mono outline-none focus:border-[#2E6F40] focus:ring-1 focus:ring-[#2E6F40]/20 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] uppercase font-bold text-[#64748B] font-mono">
                    Nomor NIK KTP Pasangan (16 digit) <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="text" required={bookingForm.isMarried} maxLength={16}
                    value={bookingForm.spouseNik || ''}
                    onChange={(e) => setBookingForm({ ...bookingForm, spouseNik: e.target.value })}
                    placeholder="Contoh: 3174..."
                    className="w-full bg-white border border-[#E2E8F0] p-2.5 rounded-xl text-[#1E293B] font-mono outline-none focus:border-[#2E6F40] focus:bg-white focus:ring-1 focus:ring-[#2E6F40]/20 transition-all"
                  />
                </div>

                {/* File Upload Section for Buku Nikah */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[9px] uppercase font-bold text-[#64748B] font-mono flex items-center gap-1">
                      <FileCheck size={12} className="text-[#2E6F40]" />
                      Upload Bukti Buku Nikah / Kartu Nikah <span className="text-red-500">* (Wajib)</span>
                    </label>
                    {bookingForm.marriageCertificateUrl && (
                      <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1 font-mono">
                        <CheckCircle2 size={10} /> Terunggah
                      </span>
                    )}
                  </div>

                  {bookingForm.marriageCertificateUrl ? (
                    <div className="bg-white border-2 border-emerald-500/40 rounded-2xl p-3 flex items-center justify-between gap-3 shadow-xs">
                      <div className="flex items-center gap-3 overflow-hidden">
                        {bookingForm.marriageCertificateUrl.startsWith('data:image') || bookingForm.marriageCertificateUrl.includes('http') ? (
                          <img 
                            src={bookingForm.marriageCertificateUrl} 
                            alt="Bukti Buku Nikah"
                            className="w-14 h-14 object-cover rounded-xl border border-emerald-200 shrink-0 bg-slate-50"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0 text-emerald-700">
                            <FileText size={22} />
                          </div>
                        )}
                        <div className="text-left truncate">
                          <p className="font-bold text-[11px] text-[#1E293B] truncate">
                            Bukti Buku/Kartu Nikah Terlampir
                          </p>
                          <p className="text-[9px] text-[#64748B] font-mono mt-0.5">
                            Format siap diverifikasi oleh Admin
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setPreviewCertModal(true)}
                          className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-[#2E6F40] border border-emerald-200 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all"
                          title="Lihat Dokumen"
                        >
                          <Eye size={12} />
                          <span className="hidden sm:inline">Lihat</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploadingCert}
                          className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#3A444D] border border-slate-200 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all"
                          title="Ganti Dokumen"
                        >
                          <RefreshCw size={12} className={isUploadingCert ? 'animate-spin' : ''} />
                          <span className="hidden sm:inline">Ganti</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleRemoveCert}
                          className="p-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-[10px] font-bold cursor-pointer transition-all"
                          title="Hapus Dokumen"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div 
                      onClick={() => !isUploadingCert && fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all group ${
                        isUploadingCert 
                          ? 'border-[#2E6F40] bg-emerald-50/40' 
                          : 'border-[#CBD5E1] bg-white hover:border-[#2E6F40] hover:bg-emerald-50/20'
                      }`}
                    >
                      <input 
                        ref={fileInputRef}
                        type="file" 
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={handleCertFileSelect}
                        className="hidden"
                      />
                      <div className="flex flex-col items-center justify-center gap-2">
                        {isUploadingCert ? (
                          <>
                            <div className="w-10 h-10 rounded-full bg-emerald-100 text-[#2E6F40] flex items-center justify-center animate-spin">
                              <RefreshCw size={18} />
                            </div>
                            <p className="text-[11px] font-bold text-[#2E6F40]">Sedang memproses & mengunggah dokumen...</p>
                            <p className="text-[9px] text-[#64748B] font-mono">Mohon tunggu sebentar</p>
                          </>
                        ) : (
                          <>
                            <div className="w-10 h-10 rounded-full bg-emerald-50 text-[#2E6F40] group-hover:bg-emerald-100 flex items-center justify-center transition-colors">
                              <Upload size={18} />
                            </div>
                            <div>
                              <p className="text-[11px] font-bold text-[#1E293B] group-hover:text-[#2E6F40] transition-colors">
                                Klik untuk upload Foto Buku Nikah atau Kartu Nikah
                              </p>
                              <p className="text-[9px] text-[#64748B] mt-0.5">
                                Format: JPG, PNG, WEBP, atau PDF (Maks. 15MB)
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {certUploadError && (
                    <p className="text-[9px] text-red-500 font-mono flex items-center gap-1 mt-1">
                      <AlertCircle size={11} /> {certUploadError}
                    </p>
                  )}
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

      {/* Lightbox / Preview Modal for Marriage Certificate */}
      {previewCertModal && bookingForm.marriageCertificateUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-2">
                <FileCheck size={16} className="text-[#2E6F40]" />
                <h4 className="font-bold text-xs uppercase tracking-wide text-[#1E293B]">
                  Bukti Buku Nikah / Kartu Nikah
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setPreviewCertModal(false)}
                className="p-1.5 rounded-full hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4 flex items-center justify-center bg-slate-900/5 max-h-[70vh] overflow-auto">
              <img 
                src={bookingForm.marriageCertificateUrl} 
                alt="Dokumen Buku Nikah"
                className="max-w-full max-h-[60vh] object-contain rounded-xl shadow-xs"
              />
            </div>
            <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-between items-center text-[10px]">
              <span className="text-slate-500 font-mono truncate max-w-[200px]">
                Pasangan: {bookingForm.spouseName || 'Data Pasangan'}
              </span>
              <button
                type="button"
                onClick={() => setPreviewCertModal(false)}
                className="px-4 py-1.5 bg-[#2E6F40] text-white font-bold rounded-xl text-[10px] hover:bg-[#1e4b2b] transition-colors cursor-pointer"
              >
                Tutup Pratinjau
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
};

export default BookingForm;
