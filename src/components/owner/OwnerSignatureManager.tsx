import React, { useState, useRef, useEffect } from 'react';
import { 
  PenTool, Upload, RefreshCw, CheckCircle2, ShieldCheck, 
  FileText, Sparkles, User, Mail, Calendar, Clock, 
  Trash2, Undo2, Check, AlertCircle, Send, Eye, 
  Download, Building2, Search, Filter, ExternalLink,
  ChevronRight, ArrowRight, Stamp, Layers, FileCheck,
  Shield, Copy, Award
} from 'lucide-react';
import { Property, Room, Tenant, Booking, SystemSettings } from '../../types';
import { database, DEFAULT_OWNER_SIGNATURE, isSupabaseConfigured } from '../../lib/supabase';
import { uploadToSupabaseStorage } from '../../utils/storageUploader';
import { formatRupiah } from '../../utils/formatCurrency';

interface OwnerSignatureManagerProps {
  properties: Property[];
  rooms: Room[];
  tenants: Tenant[];
  bookings: Booking[];
  selectedPropertyId: string;
  onSelectProperty?: (id: string) => void;
}

export const OwnerSignatureManager: React.FC<OwnerSignatureManagerProps> = ({
  properties,
  rooms,
  tenants,
  bookings,
  selectedPropertyId,
  onSelectProperty
}) => {
  // Navigation tabs within Signature Section
  const [subTab, setSubTab] = useState<'studio' | 'contracts' | 'preview'>('studio');

  // Settings & Current Signature State
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [ownerSigUrl, setOwnerSigUrl] = useState<string>(DEFAULT_OWNER_SIGNATURE);
  const [ownerName, setOwnerName] = useState<string>('H. Yogi Ketilang');
  const [ownerTitle, setOwnerTitle] = useState<string>('Pemilik & Kuasa Manajemen Properti');
  const [ownerCity, setOwnerCity] = useState<string>('Jakarta Pusat');
  const [isLoadingSettings, setIsLoadingSettings] = useState<boolean>(true);

  // Drawing Canvas State
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [signatureMode, setSignatureMode] = useState<'draw' | 'upload' | 'preset'>('draw');
  const [penColor, setPenColor] = useState<string>('#0f172a');
  const [penWidth, setPenWidth] = useState<number>(2.8);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [drawHistory, setDrawHistory] = useState<ImageData[]>([]);

  // Saving & Realtime State
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);

  // MailerSend Direct Email Test State
  const [testEmail, setTestEmail] = useState<string>('yogiketilang33@gmail.com');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailSendStatus, setEmailSendStatus] = useState<{ status: 'idle' | 'success' | 'error'; message?: string }>({ status: 'idle' });

  // Contracts Endorsement State
  const [selectedBookingForSign, setSelectedBookingForSign] = useState<Booking | null>(null);
  const [isSigningBooking, setIsSigningBooking] = useState(false);
  const [contractFilter, setContractFilter] = useState<'all' | 'pending' | 'signed'>('all');
  const [contractSearch, setContractSearch] = useState('');
  const [endorseSuccessModal, setEndorseSuccessModal] = useState<{ booking: Booking; emailStatus: string } | null>(null);

  // Fetch current System Settings from Supabase on mount
  const loadSettings = async () => {
    setIsLoadingSettings(true);
    try {
      const data = await database.fetchSettings();
      if (data) {
        setSettings(data);
        if (data.owner_signature_url) {
          setOwnerSigUrl(data.owner_signature_url);
        }
      }
    } catch (err) {
      console.warn('[OwnerSignature] Failed to load settings:', err);
    } finally {
      setIsLoadingSettings(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  // Initialize Canvas
  useEffect(() => {
    if (signatureMode === 'draw' && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.strokeStyle = penColor;
        ctx.lineWidth = penWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
  }, [signatureMode, penColor, penWidth]);

  // Canvas Drawing Handlers
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / (rect.width || 1);
    const scaleY = canvas.height / (rect.height || 1);

    let clientX = 0;
    let clientY = 0;

    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Save history snapshot before drawing new stroke
    const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setDrawHistory(prev => [...prev.slice(-15), snapshot]);

    setIsDrawing(true);
    setHasDrawn(true);

    const { x, y } = getCanvasCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const { x, y } = getCanvasCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    setDrawHistory([]);
  };

  const undoCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas || drawHistory.length === 0) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const previousSnapshot = drawHistory[drawHistory.length - 1];
    ctx.putImageData(previousSnapshot, 0, 0);
    setDrawHistory(prev => prev.slice(0, -1));
    if (drawHistory.length <= 1) {
      setHasDrawn(false);
    }
  };

  const applyCanvasToPreview = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) return;
    const dataUrl = canvas.toDataURL('image/png');
    setOwnerSigUrl(dataUrl);
    setSaveSuccessMessage('Goresan tanda tangan berhasil diterapkan ke preview! Klik "Simpan ke Supabase" untuk mempublikasikan.');
    setTimeout(() => setSaveSuccessMessage(null), 4000);
  };

  // Upload File Handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsSaving(true);
      const uploaded = await uploadToSupabaseStorage(
        file,
        'signatures',
        'owner_official_signature',
        { forcePNG: true, maxLongestSide: 900 }
      );

      if (uploaded.publicUrl) {
        setOwnerSigUrl(uploaded.publicUrl);
        setSaveSuccessMessage('File tanda tangan berhasil diunggah ke Supabase Storage!');
        setTimeout(() => setSaveSuccessMessage(null), 4000);
        return;
      }
    } catch (err: any) {
      console.warn('[OwnerSignature] Storage upload error, falling back to data URL:', err);
    } finally {
      setIsSaving(false);
    }

    // Fallback: Read as Data URL
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setOwnerSigUrl(event.target.result as string);
        setSaveSuccessMessage('Tanda tangan dimuat dari berkas lokal.');
        setTimeout(() => setSaveSuccessMessage(null), 4000);
      }
    };
    reader.readAsDataURL(file);
  };

  // Save Signature to Supabase Realtime Settings
  const handleSaveSignatureToSupabase = async () => {
    setIsSaving(true);
    setSaveErrorMessage(null);
    setSaveSuccessMessage(null);

    try {
      let finalSigUrl = ownerSigUrl;

      // If it's a freshly drawn base64 string, upload to Supabase Storage bucket
      if (ownerSigUrl && ownerSigUrl.startsWith('data:')) {
        try {
          const uploaded = await uploadToSupabaseStorage(
            ownerSigUrl,
            'signatures',
            'owner_official_signature',
            { forcePNG: true, maxLongestSide: 900 }
          );
          if (uploaded.publicUrl) {
            finalSigUrl = uploaded.publicUrl;
            setOwnerSigUrl(finalSigUrl);
          }
        } catch (storageErr) {
          console.warn('[OwnerSignature] Upload to storage fallback:', storageErr);
        }
      }

      const updatedSettings: SystemSettings = {
        ...(settings || { id: 1, booking_rules: '', survey_rules: '' }),
        owner_signature_url: finalSigUrl,
        updated_at: new Date().toISOString()
      };

      await database.saveSettings(updatedSettings);
      setSettings(updatedSettings);
      setSaveSuccessMessage('Tanda Tangan Digital Pemilik Berhasil Disimpan ke Supabase & Tersinkronisasi Realtime!');
      setTimeout(() => setSaveSuccessMessage(null), 5000);
    } catch (err: any) {
      console.error('[OwnerSignature] Save error:', err);
      setSaveErrorMessage(`Gagal menyimpan ke Supabase: ${err.message || 'Kesalahan jaringan'}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to Official Default Stamp
  const handleResetToDefault = () => {
    if (window.confirm('Kembalikan ke Tanda Tangan & Stempel Resmi Default Samara Stay?')) {
      setOwnerSigUrl(DEFAULT_OWNER_SIGNATURE);
      clearCanvas();
      setSaveSuccessMessage('Tanda tangan dikembalikan ke template resmi standar.');
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    }
  };

  // Test MailerSend Signature Delivery
  const handleSendTestSignatureEmail = async () => {
    if (!testEmail || !testEmail.includes('@')) {
      alert('Masukkan alamat email tujuan yang valid.');
      return;
    }

    setIsSendingEmail(true);
    setEmailSendStatus({ status: 'idle' });

    try {
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; margin: 0; padding: 24px; background-color: #f8fafc; }
            .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
            .header { background: #0f172a; padding: 24px; text-align: center; color: #ffffff; }
            .badge { display: inline-block; padding: 4px 12px; background: #2E6F40; color: #ffffff; border-radius: 20px; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; }
            .content { padding: 32px 24px; }
            .sig-card { background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
            .sig-img { max-height: 100px; max-width: 260px; object-fit: contain; margin: 0 auto 12px; }
            .footer { background: #f1f5f9; padding: 16px 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <span class="badge">Sertifikat Tanda Tangan Digital Resmi</span>
              <h2 style="margin: 12px 0 4px; font-size: 20px;">SAMARA STAY MANAGEMENT</h2>
              <p style="margin: 0; font-size: 13px; color: #94a3b8;">Verifikasi TTD Elektronik & Otorisasi Pemilik</p>
            </div>
            <div class="content">
              <p>Halo <strong>${ownerName}</strong>,</p>
              <p>Ini adalah konfirmasi bahwa Tanda Tangan Digital resmi Anda untuk pengelolaan unit dan pengesahan kontrak sewa Samara Stay telah aktif dan tersinkronisasi di server database Supabase & MailerSend.</p>
              
              <div class="sig-card">
                <p style="margin: 0 0 10px; font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">Spesimen Tanda Tangan & Stempel Resmi</p>
                <img src="${ownerSigUrl}" alt="TTD Owner" class="sig-img" />
                <div style="border-top: 1px solid #e2e8f0; padding-top: 10px; margin-top: 10px;">
                  <strong style="font-size: 14px; color: #0f172a; display: block;">${ownerName}</strong>
                  <span style="font-size: 12px; color: #2E6F40; font-weight: 600;">${ownerTitle}</span>
                  <p style="margin: 4px 0 0; font-size: 11px; color: #94a3b8;">Lokasi Pengesahan: ${ownerCity} • Waktu: ${new Date().toLocaleString('id-ID')}</p>
                </div>
              </div>

              <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 12px 16px; margin: 16px 0;">
                <p style="margin: 0; font-size: 12px; color: #065f46;">
                  ✓ <strong>Integritas Dokumen Terjamin:</strong> Tanda tangan ini secara otomatis akan dibubuhkan pada dokumen Bukti Pembayaran (Invoice), Kwitansi DP Survey, dan Surat Kontrak Perjanjian Sewa yang disahkan.
                </p>
              </div>
            </div>
            <div class="footer">
              <p style="margin: 0;">© ${new Date().getFullYear()} Samara Stay • Sistem Otomatisasi Tanda Tangan Digital & MailerSend</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const response = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: testEmail,
          subject: `[Verifikasi TTD] Spesimen Tanda Tangan Digital Resmi Pemilik - Samara Stay`,
          text: `Tanda tangan digital resmi untuk ${ownerName} (${ownerTitle}) telah aktif dan tersinkronisasi di Samara Stay.`,
          html: emailHtml,
          fromName: 'Samara Stay Owner Portal'
        })
      });

      const resData = await response.json();
      if (response.ok && resData.success) {
        setEmailSendStatus({
          status: 'success',
          message: `Email spesimen TTD berhasil dikirim via MailerSend ke ${testEmail}!`
        });
      } else {
        setEmailSendStatus({
          status: 'error',
          message: `Gagal mengirim email: ${resData.message || 'Periksa konfigurasi MAILERSEND_API_KEY'}`
        });
      }
    } catch (err: any) {
      setEmailSendStatus({
        status: 'error',
        message: `Terjadi kesalahan pengiriman email: ${err.message || err}`
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  // Direct Contract Countersign & Endorsement via Owner
  const handleEndorseBookingContract = async (booking: Booking) => {
    setIsSigningBooking(true);
    try {
      const nowIso = new Date().toISOString();
      const finalOwnerSig = ownerSigUrl || DEFAULT_OWNER_SIGNATURE;

      // 1. Update Booking in Supabase with Owner Signature
      const updatedBookingPayload: Partial<Booking> = {
        id: booking.id,
        status: 'approved',
        owner_signature_url: finalOwnerSig,
        owner_signed_at: nowIso,
        owner_signer_name: ownerName
      };

      const savedBooking = await database.saveBooking(updatedBookingPayload);

      // 2. Resolve Property & Room Info for Email
      const prop = properties.find(p => p.id === booking.property_id);
      const propertyName = prop?.name || 'Cabang Samara Stay';
      const propertyAddress = prop?.address || 'Jakarta';
      const tenantEmail = booking.email || booking.occupant_email;

      let emailStatusMsg = 'Tidak ada email penyewa tertera.';

      // 3. Send Countersigned Contract Email via MailerSend if tenant email exists
      if (tenantEmail && tenantEmail.includes('@')) {
        try {
          const contractHtml = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; margin: 0; padding: 20px; background-color: #f8fafc; }
                .container { max-width: 650px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; }
                .header { background: #0f172a; padding: 24px; text-align: center; color: #ffffff; }
                .title { font-size: 18px; font-weight: bold; margin: 8px 0 0; }
                .badge-success { display: inline-block; padding: 4px 12px; background: #10b981; color: #ffffff; border-radius: 20px; font-size: 11px; font-weight: bold; text-transform: uppercase; }
                .content { padding: 28px 24px; }
                .table-info { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
                .table-info td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; }
                .table-info td:first-child { color: #64748b; font-weight: 600; width: 40%; }
                .dual-sig { display: table; width: 100%; margin: 24px 0; border: 1px solid #e2e8f0; border-radius: 12px; background: #f8fafc; padding: 16px; box-sizing: border-box; }
                .sig-col { display: table-cell; width: 50%; text-align: center; vertical-align: top; padding: 12px; }
                .sig-box { min-height: 80px; display: flex; align-items: center; justify-content: center; margin: 8px 0; }
                .sig-img { max-height: 70px; max-width: 180px; object-fit: contain; }
                .footer { background: #f1f5f9; padding: 16px 24px; text-align: center; font-size: 11px; color: #64748b; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <span class="badge-success">Kontrak Telah Disahkan Pemilik</span>
                  <div class="title">SURAT PERJANJIAN SEWA & PENGESAHAN DOKUMEN</div>
                  <p style="margin: 4px 0 0; font-size: 12px; color: #cbd5e1;">Nomor Booking: #${booking.id} • ${propertyName}</p>
                </div>
                <div class="content">
                  <p>Yth. <strong>${booking.tenant_name}</strong>,</p>
                  <p>Selamat! Permohonan sewa kamar Anda telah <strong>resmi disahkan dan ditandatangani oleh Pemilik/Manajemen Samara Stay</strong>. Dokumen sewa Anda kini sah secara hukum.</p>
                  
                  <table class="table-info">
                    <tr><td>Nama Penyewa</td><td><strong>${booking.tenant_name}</strong></td></tr>
                    <tr><td>Nomor Kamar</td><td><strong>Kamar ${booking.room_number || '-'}</strong></td></tr>
                    <tr><td>Cabang Kos</td><td>${propertyName} (${propertyAddress})</td></tr>
                    <tr><td>Durasi Sewa</td><td>${booking.duration_months} Bulan (${booking.booking_type === 'daily' ? 'Harian' : 'Bulanan'})</td></tr>
                    <tr><td>Total Biaya Sewa</td><td><strong>${formatRupiah(booking.total_price)}</strong></td></tr>
                    <tr><td>Status Pembayaran</td><td><span style="color: #10b981; font-weight: bold;">Lunas / Terverifikasi</span></td></tr>
                    <tr><td>Waktu Pengesahan</td><td>${new Date().toLocaleString('id-ID')} WIB</td></tr>
                  </table>

                  <!-- Dual Signature Section -->
                  <div class="dual-sig">
                    <div class="sig-col" style="border-right: 1px dashed #cbd5e1;">
                      <span style="font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase;">Pihak Kedua (Penyewa)</span>
                      <div class="sig-box">
                        ${booking.signature_url ? `<img src="${booking.signature_url}" class="sig-img" alt="TTD Penyewa" />` : '<span style="color: #94a3b8; font-size: 11px;">[Telah Disetujui Digital]</span>'}
                      </div>
                      <strong>${booking.tenant_name}</strong>
                    </div>

                    <div class="sig-col">
                      <span style="font-size: 11px; font-weight: bold; color: #2E6F40; text-transform: uppercase;">Pihak Pertama (Pemilik / Manajemen)</span>
                      <div class="sig-box">
                        <img src="${finalOwnerSig}" class="sig-img" alt="TTD Owner" />
                      </div>
                      <strong>${ownerName}</strong>
                      <div style="font-size: 10px; color: #64748b;">${ownerTitle}</div>
                    </div>
                  </div>

                  <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px; font-size: 12px; color: #166534;">
                    ℹ️ Harap simpan email ini sebagai bukti kontrak sewa yang sah saat proses check-in di lokasi kos.
                  </div>
                </div>
                <div class="footer">
                  © ${new Date().getFullYear()} Samara Stay • Investor & Owner Management System
                </div>
              </div>
            </body>
            </html>
          `;

          const emailRes = await fetch('/api/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: tenantEmail,
              subject: `[Kontrak Disahkan] Surat Perjanjian Sewa Kamar #${booking.id} - ${propertyName}`,
              text: `Selamat! Kontrak sewa Anda di ${propertyName} kamar ${booking.room_number} telah resmi disahkan dan ditandatangani oleh Pemilik Samara Stay.`,
              html: contractHtml,
              fromName: 'Samara Stay Management'
            })
          });

          const mailResData = await emailRes.json();
          if (emailRes.ok && mailResData.success) {
            emailStatusMsg = `Email kontrak sah berhasil dikirim via MailerSend ke ${tenantEmail}!`;
          } else {
            emailStatusMsg = `Kontrak disahkan di database, namun email gagal: ${mailResData.message || 'MailerSend belum aktif'}`;
          }
        } catch (e: any) {
          emailStatusMsg = `Kontrak disahkan di database (gagal kirim email: ${e.message})`;
        }
      }

      setEndorseSuccessModal({
        booking: savedBooking,
        emailStatus: emailStatusMsg
      });
      setSelectedBookingForSign(null);

    } catch (err: any) {
      alert(`Gagal mengesahkan kontrak: ${err.message}`);
    } finally {
      setIsSigningBooking(false);
    }
  };

  // Filtered Bookings for Contract Endorsements
  const filteredBookings = bookings
    .filter(b => {
      if (selectedPropertyId !== 'all' && String(b.property_id) !== String(selectedPropertyId)) return false;
      if (contractFilter === 'pending') return !b.owner_signed_at && b.status !== 'rejected';
      if (contractFilter === 'signed') return !!b.owner_signed_at;
      return true;
    })
    .filter(b => {
      if (!contractSearch.trim()) return true;
      const q = contractSearch.toLowerCase();
      return (
        b.tenant_name.toLowerCase().includes(q) ||
        (b.room_number && b.room_number.toLowerCase().includes(q)) ||
        (b.email && b.email.toLowerCase().includes(q)) ||
        (b.phone && b.phone.includes(q))
      );
    });

  const pendingContractCount = bookings.filter(b => !b.owner_signed_at && b.status !== 'rejected').length;
  const signedContractCount = bookings.filter(b => !!b.owner_signed_at).length;

  return (
    <div className="space-y-6">
      
      {/* 1. Header Banner & Metric Pills */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-slate-800 rounded-3xl p-6 text-white shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-[10px] font-extrabold tracking-wider uppercase flex items-center gap-1.5 font-mono">
                <ShieldCheck size={13} className="text-emerald-400" />
                Realtime Supabase & MailerSend Connected
              </span>
              <span className="px-2.5 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full text-[10px] font-bold font-mono">
                Official Seal
              </span>
            </div>
            <h2 className="text-xl md:text-2xl font-black font-display tracking-tight text-white flex items-center gap-2.5">
              <PenTool className="text-emerald-400" size={24} />
              Master Tanda Tangan & Stempel Resmi Pemilik
            </h2>
            <p className="text-xs md:text-sm text-slate-400 max-w-3xl leading-relaxed">
              Tanda tangan dan stempel resmi yang Anda simpan di sini akan <strong>otomatis dibubuhkan secara sistem</strong> pada setiap invoice, kwitansi DP survey, dan Surat Perjanjian Sewa (SPSM) yang lunas terkonfirmasi oleh Midtrans.
            </p>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-3.5 text-center">
              <span className="text-[10px] font-mono uppercase text-slate-400 block font-bold">Status Stempel & TTD</span>
              <span className="text-xs font-black text-emerald-400 flex items-center justify-center gap-1 mt-1">
                <CheckCircle2 size={13} /> Aktif Otomatis
              </span>
            </div>
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-3.5 text-center">
              <span className="text-[10px] font-mono uppercase text-slate-400 block font-bold">Arsip Kontrak Terbit</span>
              <span className="text-base font-black text-white font-mono mt-0.5 block">{bookings.filter(b => b.status === 'approved').length} Dokumen</span>
            </div>
          </div>
        </div>

        {/* Inner Sub-Navigation Tabs */}
        <div className="flex items-center gap-2 border-t border-slate-800/80 pt-4 mt-6 overflow-x-auto">
          <button
            onClick={() => setSubTab('studio')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              subTab === 'studio'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <PenTool size={13} />
            <span>Pengaturan Master Goresan & Stempel</span>
          </button>

          <button
            onClick={() => setSubTab('contracts')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer relative ${
              subTab === 'contracts'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <FileCheck size={13} />
            <span>Daftar Arsip Kontrak Sewa</span>
          </button>

          <button
            onClick={() => setSubTab('preview')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              subTab === 'preview'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Eye size={13} />
            <span>Preview Template Kontrak Otomatis</span>
          </button>
        </div>
      </div>

      {/* Global Alerts (Save / Error) */}
      {saveSuccessMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl p-4 flex items-center gap-3 animate-fade-in shadow-xs">
          <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
          <p className="text-xs md:text-sm font-semibold">{saveSuccessMessage}</p>
        </div>
      )}
      {saveErrorMessage && (
        <div className="bg-rose-50 border border-rose-200 text-rose-900 rounded-2xl p-4 flex items-center gap-3 animate-fade-in shadow-xs">
          <AlertCircle size={20} className="text-rose-600 shrink-0" />
          <p className="text-xs md:text-sm font-semibold">{saveErrorMessage}</p>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 1: STUDIO GORESAN & STEMPEL TTD                                    */}
      {/* ========================================================================= */}
      {subTab === 'studio' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* LEFT: Live Interactive Signature Pad & Options (7 Cols) */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-5">
              
              {/* Card Header & Mode Switcher */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider font-mono flex items-center gap-2">
                    <PenTool size={16} className="text-[#2E6F40]" />
                    Studio Goresan Tanda Tangan
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Buat goresan langsung atau unggah scan tanda tangan resmi Anda.
                  </p>
                </div>

                {/* Mode Selector Tabs */}
                <div className="flex items-center bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setSignatureMode('draw')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                      signatureMode === 'draw'
                        ? 'bg-white text-[#2E6F40] shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Goresan (Draw)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSignatureMode('upload')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                      signatureMode === 'upload'
                        ? 'bg-white text-[#2E6F40] shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Unggah Berkas
                  </button>
                </div>
              </div>

              {/* MODE 1: Canvas Drawing */}
              {signatureMode === 'draw' && (
                <div className="space-y-4">
                  {/* Canvas Toolbar (Color, Thickness, Clear, Undo) */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200/80 rounded-2xl p-3">
                    
                    {/* Pen Color Presets */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-500 uppercase font-mono">Tinta:</span>
                      {[
                        { label: 'Hitam Formal', color: '#0f172a' },
                        { label: 'Biru Dokumen', color: '#1e40af' },
                        { label: 'Hijau Emerald', color: '#065f46' },
                      ].map((item) => (
                        <button
                          key={item.color}
                          type="button"
                          onClick={() => setPenColor(item.color)}
                          className={`w-6 h-6 rounded-full border-2 transition cursor-pointer flex items-center justify-center ${
                            penColor === item.color ? 'border-slate-800 scale-110 shadow-xs' : 'border-transparent opacity-70'
                          }`}
                          style={{ backgroundColor: item.color }}
                          title={item.label}
                        >
                          {penColor === item.color && <Check size={11} className="text-white" />}
                        </button>
                      ))}
                    </div>

                    {/* Pen Width Slider / Presets */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-slate-500 uppercase font-mono">Tebal:</span>
                      {[
                        { label: 'Halus', width: 1.8 },
                        { label: 'Standar', width: 2.8 },
                        { label: 'Tebal', width: 4.2 },
                      ].map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => setPenWidth(item.width)}
                          className={`px-2 py-1 rounded-md text-[10px] font-bold transition ${
                            penWidth === item.width
                              ? 'bg-white text-[#2E6F40] shadow-2xs border border-slate-300'
                              : 'text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>

                    {/* Canvas Actions (Undo / Clear) */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={undoCanvas}
                        disabled={drawHistory.length === 0}
                        className="p-1.5 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg text-xs font-bold transition disabled:opacity-30 flex items-center gap-1"
                        title="Undo goresan terakhir"
                      >
                        <Undo2 size={13} />
                        <span className="hidden sm:inline">Undo</span>
                      </button>
                      <button
                        type="button"
                        onClick={clearCanvas}
                        className="p-1.5 text-rose-600 hover:text-rose-700 bg-white border border-rose-200 rounded-lg text-xs font-bold transition flex items-center gap-1"
                        title="Hapus semua goresan"
                      >
                        <Trash2 size={13} />
                        <span className="hidden sm:inline">Bersihkan</span>
                      </button>
                    </div>
                  </div>

                  {/* HTML5 Signature Canvas Container */}
                  <div className="relative border-2 border-dashed border-slate-300 hover:border-[#2E6F40] rounded-2xl bg-slate-50/50 p-2 transition-colors">
                    <canvas
                      ref={canvasRef}
                      width={600}
                      height={200}
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={stopDrawing}
                      className="w-full h-44 bg-white rounded-xl touch-none cursor-crosshair shadow-inner"
                    />

                    {!hasDrawn && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-slate-400">
                        <PenTool size={28} className="mb-2 opacity-40 text-slate-500 animate-pulse" />
                        <span className="text-xs font-bold">Goreskan Tanda Tangan Anda di Area Ini</span>
                        <span className="text-[10px] text-slate-400 mt-0.5">Mendukung mouse desktop, stylus pen, dan layar sentuh HP/Tablet</span>
                      </div>
                    )}
                  </div>

                  {/* Apply Drawing Button */}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-500 font-medium">
                      {hasDrawn ? '✓ Goresan terdeteksi. Terapkan ke preview lalu simpan.' : 'Silakan goreskan tanda tangan Anda.'}
                    </span>
                    <button
                      type="button"
                      onClick={applyCanvasToPreview}
                      disabled={!hasDrawn}
                      className="px-4 py-2 bg-[#2E6F40] hover:bg-[#245833] text-white rounded-xl text-xs font-bold transition disabled:opacity-40 flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <Check size={14} />
                      Terapkan Goresan ke Preview
                    </button>
                  </div>
                </div>
              )}

              {/* MODE 2: Upload Signature File */}
              {signatureMode === 'upload' && (
                <div className="space-y-4">
                  <div className="border-2 border-dashed border-slate-300 hover:border-[#2E6F40] rounded-2xl p-6 text-center bg-slate-50/50 transition">
                    <Upload size={32} className="mx-auto text-[#2E6F40] mb-2 opacity-80" />
                    <h4 className="text-xs font-bold text-slate-800">Pilih Berkas Tanda Tangan / Stempel Resmi</h4>
                    <p className="text-[11px] text-slate-500 mt-1 max-w-md mx-auto">
                      Format didukung: PNG transparan, JPG, atau SVG (Maksimal 5MB). Kami menyarankan background transparan untuk hasil terbaik di invoice & kontrak.
                    </p>
                    <label className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition shadow-2xs">
                      <Upload size={14} />
                      <span>Pilih Dokumen dari Komputer / HP</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* Legal & Endorsement Metadata Form */}
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <h4 className="text-xs font-black uppercase text-slate-800 font-mono flex items-center gap-1.5">
                  <Stamp size={13} className="text-[#2E6F40]" />
                  Informasi Legalitas & Pengesah Dokumen
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase font-mono block mb-1">
                      Nama Lengkap Pemilik / Pengesah
                    </label>
                    <input
                      type="text"
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 focus:border-[#2E6F40] p-2 rounded-xl text-xs font-bold text-slate-900 outline-none"
                      placeholder="Contoh: H. Yogi Ketilang"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase font-mono block mb-1">
                      Jabatan / Legal Authority
                    </label>
                    <input
                      type="text"
                      value={ownerTitle}
                      onChange={(e) => setOwnerTitle(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 focus:border-[#2E6F40] p-2 rounded-xl text-xs font-semibold text-slate-900 outline-none"
                      placeholder="Contoh: Pemilik & Direktur Utama"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase font-mono block mb-1">
                      Kota Pengesahan Kontrak
                    </label>
                    <input
                      type="text"
                      value={ownerCity}
                      onChange={(e) => setOwnerCity(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 focus:border-[#2E6F40] p-2 rounded-xl text-xs font-semibold text-slate-900 outline-none"
                      placeholder="Contoh: Jakarta Pusat"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons: Save to Supabase & Reset */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleResetToDefault}
                  className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RefreshCw size={13} />
                  <span>Reset ke Stempel Standar</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveSignatureToSupabase}
                  disabled={isSaving}
                  className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-[#2E6F40] to-emerald-700 hover:from-[#245833] hover:to-emerald-800 text-white rounded-xl text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-emerald-900/20 disabled:opacity-50"
                >
                  {isSaving ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <ShieldCheck size={14} />
                  )}
                  <span>Simpan ke Supabase (Realtime Sync)</span>
                </button>
              </div>

            </div>
          </div>

          {/* RIGHT: Live Specimen Stamp Preview & MailerSend Direct Test (5 Cols) */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Live Specimen Preview Card */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider font-mono flex items-center gap-2">
                  <Award size={15} className="text-amber-500" />
                  Preview Spesimen Stempel & TTD Resmi
                </h3>
                <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full uppercase font-mono">
                  Live View
                </span>
              </div>

              {/* Official Certificate & Stamp Mockup Container */}
              <div className="bg-gradient-to-br from-slate-50 via-white to-amber-50/20 border-2 border-slate-200 rounded-2xl p-5 relative overflow-hidden text-center shadow-inner">
                {/* Watermark Logo Background */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03]">
                  <Building2 size={240} className="text-slate-900" />
                </div>

                <div className="relative z-10 space-y-3">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-[10px] font-bold text-emerald-800">
                    <ShieldCheck size={12} className="text-emerald-600" />
                    <span>DOKUMEN OTENTIK SAMARA STAY</span>
                  </div>

                  <p className="text-[11px] text-slate-500 italic max-w-xs mx-auto">
                    "Tanda tangan digital ini sah dan mengikat secara hukum dalam setiap transaksi sewa menyewa di seluruh unit Samara Stay."
                  </p>

                  {/* Rendered Signature Box */}
                  <div className="my-3 py-2 flex items-center justify-center min-h-[90px] bg-white/80 rounded-xl border border-slate-200/80 shadow-2xs">
                    {ownerSigUrl ? (
                      <img
                        src={ownerSigUrl}
                        alt="Spesimen TTD Owner"
                        className="max-h-20 max-w-[240px] object-contain drop-shadow-xs"
                      />
                    ) : (
                      <span className="text-xs text-slate-400 italic">Belum ada tanda tangan</span>
                    )}
                  </div>

                  {/* Signer Legal Block */}
                  <div className="border-t border-slate-200/80 pt-2 text-slate-800">
                    <h5 className="text-xs font-black uppercase tracking-wider">{ownerName}</h5>
                    <p className="text-[11px] text-[#2E6F40] font-bold">{ownerTitle}</p>
                    <div className="text-[10px] text-slate-400 mt-1 font-mono">
                      Wilayah: {ownerCity} • Digisign ID: SIG-{new Date().getFullYear()}-OWNER
                    </div>
                  </div>
                </div>
              </div>

              {/* MAILERSEND DIRECT TEST INTEGRATION CARD */}
              <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-3 shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail size={15} className="text-emerald-400" />
                    <h4 className="text-xs font-black uppercase tracking-wider font-mono text-emerald-300">
                      Uji Kirim TTD via MailerSend
                    </h4>
                  </div>
                  <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono font-bold">
                    Active API
                  </span>
                </div>

                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Kirimkan sertifikat spesimen tanda tangan resmi ini ke alamat email Anda untuk memvalidasi integrasi <strong>MailerSend API</strong>.
                </p>

                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      placeholder="Masukkan email penerima..."
                      className="flex-1 bg-slate-800 border border-slate-700 focus:border-emerald-400 p-2 rounded-xl text-xs text-white font-mono outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleSendTestSignatureEmail}
                      disabled={isSendingEmail}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      {isSendingEmail ? (
                        <RefreshCw size={13} className="animate-spin" />
                      ) : (
                        <Send size={13} />
                      )}
                      <span>Kirim</span>
                    </button>
                  </div>

                  {/* Feedback Status */}
                  {emailSendStatus.status === 'success' && (
                    <div className="text-[11px] text-emerald-400 bg-emerald-950/60 border border-emerald-800 p-2 rounded-lg font-medium flex items-center gap-1.5">
                      <CheckCircle2 size={13} className="shrink-0" />
                      <span>{emailSendStatus.message}</span>
                    </div>
                  )}
                  {emailSendStatus.status === 'error' && (
                    <div className="text-[11px] text-rose-300 bg-rose-950/60 border border-rose-800 p-2 rounded-lg font-medium flex items-center gap-1.5">
                      <AlertCircle size={13} className="shrink-0" />
                      <span>{emailSendStatus.message}</span>
                    </div>
                  )}
                </div>
              </div>

            </div>

          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 2: PENGESAHAN KONTRAK & BOOKING SEWA MASUK                         */}
      {/* ========================================================================= */}
      {subTab === 'contracts' && (
        <div className="space-y-4">
          
          {/* Filter & Search Bar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
            
            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <input
                type="text"
                value={contractSearch}
                onChange={(e) => setContractSearch(e.target.value)}
                placeholder="Cari nama penyewa, no kamar, email..."
                className="w-full bg-slate-50 border border-slate-200 pl-8 pr-3 py-2 rounded-xl text-xs text-slate-800 outline-none focus:border-[#2E6F40]"
              />
              <Search size={13} className="absolute left-2.5 top-3 text-slate-400 pointer-events-none" />
            </div>

            {/* Filter Buttons */}
            <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
              <button
                type="button"
                onClick={() => setContractFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                  contractFilter === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Semua ({bookings.length})
              </button>
              <button
                type="button"
                onClick={() => setContractFilter('signed')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer flex items-center gap-1 ${
                  contractFilter === 'signed'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                }`}
              >
                <span>Kontrak Aktif Lunas</span>
                <span className="px-1.5 py-0.2 bg-emerald-900/30 rounded-full text-[10px]">
                  {bookings.filter(b => b.status === 'approved').length}
                </span>
              </button>
            </div>

          </div>

          {/* Bookings List */}
          {filteredBookings.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center text-slate-500 space-y-3">
              <FileCheck size={36} className="mx-auto text-slate-300" />
              <h4 className="text-sm font-bold text-slate-700">Tidak ada dokumen kontrak ditemukan</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Dokumen kontrak sewa akan otomatis tercatat dan disahkan segera setelah pembayaran terverifikasi oleh Midtrans.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredBookings.map((b) => {
                const prop = properties.find(p => p.id === b.property_id);
                const isPaid = b.status === 'approved' || !!b.owner_signed_at;

                return (
                  <div
                    key={b.id}
                    className="bg-white border border-slate-200 hover:border-emerald-300 rounded-3xl p-5 shadow-xs flex flex-col justify-between transition-all"
                  >
                    <div className="space-y-3">
                      {/* Card Header Status */}
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-black text-slate-400">
                          #{b.id} • {b.booking_date || 'Terbaru'}
                        </span>
                        <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full text-[10px] font-bold flex items-center gap-1">
                          <CheckCircle2 size={11} /> {isPaid ? 'Otomatis Disahkan' : 'Menunggu Bayar'}
                        </span>
                      </div>

                      {/* Tenant & Room Info */}
                      <div>
                        <h4 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                          <User size={14} className="text-[#2E6F40]" />
                          {b.tenant_name}
                        </h4>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">
                          🏢 {prop?.name || 'Cabang Kos'} • Kamar <strong className="text-slate-800">{b.room_number || '-'}</strong>
                        </p>
                      </div>

                      {/* Details Box */}
                      <div className="bg-slate-50 rounded-xl p-2.5 space-y-1 text-[11px] text-slate-600 border border-slate-100">
                        <div className="flex justify-between">
                          <span>Durasi Sewa:</span>
                          <strong className="text-slate-800">{b.duration_months} Bulan</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Total Biaya:</span>
                          <strong className="text-[#2E6F40] font-mono">{formatRupiah(b.total_price)}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Status Bayar:</span>
                          <span className="font-bold text-emerald-700 uppercase text-[10px]">{b.status}</span>
                        </div>
                        {b.email && (
                          <div className="flex justify-between truncate pt-1 border-t border-slate-200/60">
                            <span>Email:</span>
                            <span className="text-slate-700 font-mono">{b.email}</span>
                          </div>
                        )}
                      </div>

                      {/* Signatures Thumbnails */}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div className="bg-white border border-slate-200 rounded-lg p-1.5 text-center">
                          <span className="text-[9px] font-mono uppercase text-slate-400 block">TTD Penyewa</span>
                          {b.signature_url ? (
                            <img src={b.signature_url} alt="TTD Penyewa" className="h-7 mx-auto object-contain mt-1" />
                          ) : (
                            <span className="text-[10px] text-slate-400 italic block py-1">Disetujui Digital</span>
                          )}
                        </div>

                        <div className="border border-emerald-200 bg-emerald-50/60 rounded-lg p-1.5 text-center">
                          <span className="text-[9px] font-mono uppercase text-slate-400 block">Stempel & TTD Owner</span>
                          <img src={b.owner_signature_url || ownerSigUrl} alt="TTD Owner" className="h-7 mx-auto object-contain mt-1" />
                        </div>
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="pt-4 border-t border-slate-100 mt-3">
                      <button
                        type="button"
                        onClick={() => setSelectedBookingForSign(b)}
                        className="w-full py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-800"
                      >
                        <Eye size={14} />
                        <span>Lihat Dokumen Kontrak & Bukti</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 3: PREVIEW TEMPLATE KONTRAK SEWA RESMI                            */}
      {/* ========================================================================= */}
      {subTab === 'preview' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-10 shadow-xs max-w-4xl mx-auto space-y-6">
          
          {/* Header Kontrak */}
          <div className="text-center border-b-2 border-slate-800 pb-6 space-y-1">
            <h2 className="text-base md:text-lg font-black tracking-wider text-slate-900 font-display uppercase">
              SURAT PERJANJIAN SEWA MENYEWA KAMAR KOS
            </h2>
            <h3 className="text-xs md:text-sm font-bold text-[#2E6F40] uppercase">
              SAMARA STAY INDONESIA
            </h3>
            <p className="text-[11px] text-slate-500 font-mono">
              Dokumen Pengesahan Resmi Standar Manajemen & Legalitas Pemilik
            </p>
          </div>

          {/* Isi Klausul Kontrak */}
          <div className="text-xs text-slate-700 space-y-4 leading-relaxed font-sans">
            <p>
              Pada hari ini, telah disepakati perjanjian sewa kamar antara <strong>Pihak Pertama ({ownerName} / Kuasa Manajemen Samara Stay)</strong> dengan <strong>Pihak Kedua (Penyewa Kamar)</strong> dengan ketentuan dan tata tertib sebagai berikut:
            </p>

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2">
              <h5 className="font-bold text-slate-900 uppercase text-[11px] font-mono">Ketentuan Utama Perjanjian:</h5>
              <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-600 pl-1">
                <li>Penyewa berhak menempati kamar yang telah dipesan sesuai periode sewa yang disetujui.</li>
                <li>Penyewa wajib mematuhi seluruh tata tertib lingkungan kos, menjaga ketenangan, dan dilarang membawa barang-barang terlarang.</li>
                <li>Pelunasan sewa dan deposit wajib diselesaikan sebelum kunci dan akses kamar diserahkan.</li>
                <li>Perjanjian ini berlaku mengikat kedua belah pihak sejak disahkan secara digital.</li>
              </ol>
            </div>

            {/* Specimen Signature Footer */}
            <div className="grid grid-cols-2 gap-6 pt-6 border-t border-slate-200">
              <div className="text-center space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase font-mono block">Pihak Kedua (Penyewa)</span>
                <div className="h-20 flex items-center justify-center border-b border-slate-300 my-2">
                  <span className="text-[11px] text-slate-400 italic">[Tanda Tangan Penyewa]</span>
                </div>
                <strong className="text-xs text-slate-800 block">Nama Penyewa</strong>
                <span className="text-[10px] text-slate-500">Penyewa Terdaftar</span>
              </div>

              <div className="text-center space-y-1">
                <span className="text-[10px] font-bold text-[#2E6F40] uppercase font-mono block">Pihak Pertama (Pemilik)</span>
                <div className="h-20 flex items-center justify-center border-b border-slate-300 my-2">
                  <img src={ownerSigUrl} alt="TTD Owner" className="max-h-16 max-w-[200px] object-contain" />
                </div>
                <strong className="text-xs text-slate-900 block">{ownerName}</strong>
                <span className="text-[10px] text-[#2E6F40] font-bold">{ownerTitle}</span>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: ENDORSE / SIGN CONTRACT MODAL                                    */}
      {/* ========================================================================= */}
      {selectedBookingForSign && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden my-8">
            
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl">
                  <FileCheck size={22} />
                </div>
                <div>
                  <h3 className="text-sm md:text-base font-black font-display tracking-tight">
                    Rincian Dokumen Kontrak & Bukti Transaksi
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    Booking #{selectedBookingForSign.id} • {selectedBookingForSign.tenant_name}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedBookingForSign(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              
              {/* Rental Summary Table */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Nama Penyewa:</span>
                  <strong className="text-slate-900">{selectedBookingForSign.tenant_name}</strong>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Nomor Kamar:</span>
                  <strong className="text-slate-900">Kamar {selectedBookingForSign.room_number || '-'}</strong>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Durasi Sewa:</span>
                  <strong className="text-slate-900">{selectedBookingForSign.duration_months} Bulan</strong>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Total Biaya Sewa:</span>
                  <strong className="text-[#2E6F40] font-mono text-sm">{formatRupiah(selectedBookingForSign.total_price)}</strong>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Email Penyewa (MailerSend):</span>
                  <strong className="text-slate-900 font-mono">{selectedBookingForSign.email || 'Tidak terdaftar'}</strong>
                </div>
              </div>

              {/* Dual Signature Preview in Modal */}
              <div className="border border-slate-200 rounded-2xl p-4 bg-white space-y-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase font-mono">
                  Pengesahan Tanda Tangan Resmi Dokumen:
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  {/* Tenant Sig */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                    <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1">TTD Penyewa</span>
                    {selectedBookingForSign.signature_url ? (
                      <img src={selectedBookingForSign.signature_url} alt="TTD Penyewa" className="h-12 mx-auto object-contain" />
                    ) : (
                      <span className="text-xs text-slate-400 italic block py-2">Disetujui Digital</span>
                    )}
                    <span className="text-[11px] font-bold text-slate-800 block mt-1">{selectedBookingForSign.tenant_name}</span>
                  </div>

                  {/* Owner Sig */}
                  <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-3 text-center">
                    <span className="text-[10px] font-mono uppercase text-[#2E6F40] block mb-1">Stempel & TTD Owner (Otomatis)</span>
                    <img src={selectedBookingForSign.owner_signature_url || ownerSigUrl} alt="TTD Owner" className="h-12 mx-auto object-contain" />
                    <span className="text-[11px] font-bold text-slate-900 block mt-1">{ownerName}</span>
                  </div>
                </div>
              </div>

              {/* Notice */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-900 flex items-start gap-2">
                <ShieldCheck size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                <p>
                  Dokumen ini telah <strong>disahkan secara otomatis oleh sistem</strong> saat transaksi Midtrans berhasil. Salinan invoice dan surat perjanjian sewa telah terkirim ke email penyewa via <strong>MailerSend</strong>. Anda dapat mengirim ulang salinan dokumen jika diperlukan.
                </p>
              </div>

            </div>

            {/* Modal Footer Actions */}
            <div className="p-5 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setSelectedBookingForSign(null)}
                className="w-full sm:w-auto px-4 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-100 transition cursor-pointer"
              >
                Tutup
              </button>

              <button
                type="button"
                onClick={() => handleEndorseBookingContract(selectedBookingForSign)}
                disabled={isSigningBooking}
                className="w-full sm:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-900/20 disabled:opacity-50"
              >
                {isSigningBooking ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                <span>Kirim Ulang Salinan Dokumen via MailerSend</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: ENDORSE SUCCESS & MAILERSEND RECEIPT MODAL                       */}
      {/* ========================================================================= */}
      {endorseSuccessModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 text-center space-y-4">
            <div className="w-14 h-14 bg-emerald-100 text-[#2E6F40] rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 size={32} />
            </div>

            <div>
              <h3 className="text-base font-black text-slate-900 font-display">
                Kontrak Berhasil Disahkan!
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Surat perjanjian sewa untuk <strong>{endorseSuccessModal.booking.tenant_name}</strong> (Kamar {endorseSuccessModal.booking.room_number}) telah resmi ditandatangani.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-left text-slate-700 space-y-1">
              <div className="font-bold text-slate-800 text-[11px] font-mono uppercase">Status Pengiriman:</div>
              <p className="text-emerald-700 font-medium">{endorseSuccessModal.emailStatus}</p>
            </div>

            <button
              type="button"
              onClick={() => setEndorseSuccessModal(null)}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Tutup & Selesai
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
