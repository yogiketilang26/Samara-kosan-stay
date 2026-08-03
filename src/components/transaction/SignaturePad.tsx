import React, { useRef, useState, useEffect } from 'react';
import { Property } from '../../types';
import { PenTool, Upload, RefreshCw, CheckCircle2, ShieldCheck, FileText, Image as ImageIcon, Loader2 } from 'lucide-react';
import { uploadSignatureCanvas, uploadToSupabaseStorage } from '../../utils/storageUploader';

interface SignaturePadProps {
  property: Property;
  tenantName: string;
  isAgreed: boolean;
  setIsAgreed: (agreed: boolean) => void;
  signatureUrl: string;
  setSignatureUrl: (url: string) => void;
  error?: string;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({
  property,
  tenantName,
  isAgreed,
  setIsAgreed,
  signatureUrl,
  setSignatureUrl,
  error
}) => {
  const [signatureMode, setSignatureMode] = useState<'draw' | 'upload'>('draw');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Initialize canvas context
  useEffect(() => {
    if (signatureMode === 'draw' && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
  }, [signatureMode]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    setHasDrawn(true);
    
    const rect = canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const [isUploading, setIsUploading] = useState(false);

  const stopDrawing = async () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    
    if (canvasRef.current && hasDrawn) {
      try {
        setIsUploading(true);
        const storageUrl = await uploadSignatureCanvas(canvasRef.current, tenantName || 'tenant');
        setSignatureUrl(storageUrl);
      } catch (err) {
        console.warn('[SignaturePad] Storage upload fallback to data URL:', err);
        const dataUrl = canvasRef.current.toDataURL('image/png');
        setSignatureUrl(dataUrl);
      } finally {
        setIsUploading(false);
      }
    }
  };

  const handleClearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    setHasDrawn(false);
    setSignatureUrl('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 20 * 1024 * 1024) {
        alert('Ukuran file gambar TTD terlalu besar (maksimal 20MB).');
        return;
      }
      try {
        setIsUploading(true);
        const result = await uploadToSupabaseStorage(
          file,
          'signatures',
          `tenant_${tenantName || 'user'}`,
          { forcePNG: true, maxLongestSide: 800 }
        );
        setSignatureUrl(result.publicUrl);
      } catch (err: any) {
        console.error('[SignaturePad] File upload error:', err);
        // Fallback to local Data URL if network/storage is unavailable
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            setSignatureUrl(event.target.result as string);
          }
        };
        reader.readAsDataURL(file);
      } finally {
        setIsUploading(false);
      }
    }
  };

  // Compile rules and policies for this specific property
  const defaultPolicies = "1. Wajib menyerahkan identitas diri (KTP/SIM) yang sah.\n2. Pembayaran sewa wajib dilunasi sesuai periode kontrak yang dipilih.\n3. Deposit jaminan akan dikembalikan saat check-out bilamana kamar dalam kondisi baik.";
  const defaultRegulations = "1. Menjaga ketenangan dan kerapihan fasilitas bersama.\n2. Tamu berkunjung maksimal pukul 22:00 WIB.\n3. Dilarang membawa barang berbahaya, senjata, atau obat terlarang.";

  const policiesText = property.policies || property.terms || defaultPolicies;
  const regulationsText = property.regulations || property.additional_rules || defaultRegulations;

  return (
    <div className="space-y-3.5 bg-slate-50/80 p-3.5 sm:p-4 rounded-2xl border border-[#E2E8F0] font-sans text-xs">
      {/* Title & Header */}
      <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2">
        <div className="flex items-center gap-2 text-[#1E293B]">
          <FileText size={15} className="text-[#2E6F40]" />
          <span className="font-extrabold text-[11px] uppercase tracking-wide">
            PERSETUJUAN & TATATERTIB {property.name}
          </span>
        </div>
        <span className="text-[9px] font-mono font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
          Wajib Disetujui
        </span>
      </div>

      {/* Rules Scrollable Box */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-3 max-h-40 overflow-y-auto space-y-2.5 text-[10px] text-[#475569] leading-relaxed shadow-xs">
        <div>
          <strong className="text-[#1E293B] block font-bold mb-1 border-b border-slate-100 pb-0.5 uppercase tracking-wider text-[9px]">
            📌 Kebijakan & Ketentuan Sewa Hunian:
          </strong>
          <p className="whitespace-pre-line font-mono">{policiesText}</p>
        </div>

        <div>
          <strong className="text-[#1E293B] block font-bold mb-1 border-b border-slate-100 pb-0.5 uppercase tracking-wider text-[9px]">
            ⚖️ Tata Tertib & Peraturan Kos:
          </strong>
          <p className="whitespace-pre-line font-mono">{regulationsText}</p>
        </div>
      </div>

      {/* Checkbox Agreement */}
      <label className="flex items-start gap-2.5 cursor-pointer select-none bg-emerald-50/60 p-2.5 rounded-xl border border-emerald-200/60 transition-all hover:bg-emerald-50">
        <input 
          type="checkbox"
          checked={isAgreed}
          onChange={(e) => setIsAgreed(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded border-emerald-300 text-[#2E6F40] focus:ring-0 cursor-pointer shrink-0"
        />
        <span className="text-[10px] font-semibold text-[#1E293B] leading-tight">
          Saya ({tenantName || 'Calon Penyewa'}) telah membaca, memahami, dan menyetujui seluruh Kebijakan & Tata Tertib Hunian di <strong>{property.name}</strong> di atas.
        </span>
      </label>

      {/* Signature Section */}
      <div className="space-y-2 pt-1 border-t border-[#E2E8F0]">
        <div className="flex items-center justify-between">
          <label className="text-[9px] uppercase font-bold text-[#64748B] font-mono flex items-center gap-1">
            <PenTool size={12} className="text-[#2E6F40]" />
            Tanda Tangan Digital Penyewa
          </label>

          {/* Mode Switcher Buttons */}
          <div className="flex gap-1 p-0.5 bg-slate-200/70 rounded-lg">
            <button
              type="button"
              onClick={() => setSignatureMode('draw')}
              className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase cursor-pointer transition-all ${
                signatureMode === 'draw'
                  ? 'bg-white text-[#1E293B] shadow-xs'
                  : 'text-[#64748B] hover:text-[#1E293B]'
              }`}
            >
              ✍️ Layar
            </button>
            <button
              type="button"
              onClick={() => setSignatureMode('upload')}
              className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase cursor-pointer transition-all ${
                signatureMode === 'upload'
                  ? 'bg-white text-[#1E293B] shadow-xs'
                  : 'text-[#64748B] hover:text-[#1E293B]'
              }`}
            >
              🖼️ Upload Gambar
            </button>
          </div>
        </div>

        {/* Option 1: Draw directly on Canvas */}
        {signatureMode === 'draw' && (
          <div className="space-y-1.5">
            <div className="relative border border-slate-300 rounded-xl bg-white overflow-hidden shadow-inner">
              <canvas
                ref={canvasRef}
                width={400}
                height={120}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                style={{ touchAction: 'none' }}
                className="w-full h-28 cursor-crosshair block"
              />
              {!hasDrawn && !signatureUrl && !isUploading && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-slate-300 text-[10px] font-mono">
                  Goreskan tanda tangan Anda di sini...
                </div>
              )}
              {isUploading && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex items-center justify-center gap-2 text-emerald-700 font-bold text-[10px] z-20">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Mengunggah TTD ke Storage...</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-[9px]">
              <button
                type="button"
                onClick={handleClearCanvas}
                className="flex items-center gap-1 text-slate-500 hover:text-red-600 font-medium cursor-pointer transition-colors"
              >
                <RefreshCw size={11} /> Bersihkan TTD
              </button>
              {signatureUrl && (
                <span className="flex items-center gap-1 text-emerald-600 font-bold font-mono">
                  <CheckCircle2 size={11} /> TTD Tersimpan
                </span>
              )}
            </div>
          </div>
        )}

        {/* Option 2: Upload Image File */}
        {signatureMode === 'upload' && (
          <div className="space-y-2">
            <label className="border-2 border-dashed border-slate-300 hover:border-[#2E6F40] bg-white rounded-xl p-3 flex flex-col items-center justify-center cursor-pointer transition-all">
              <Upload size={18} className="text-slate-400 mb-1" />
              <span className="text-[10px] font-bold text-[#1E293B]">Pilih File Gambar Tanda Tangan</span>
              <span className="text-[9px] text-slate-400 font-mono mt-0.5">Format PNG / JPG / JPEG (Maks. 5MB)</span>
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleFileUpload} 
                className="hidden" 
              />
            </label>

            {signatureUrl && signatureMode === 'upload' && (
              <div className="bg-white border border-slate-200 rounded-xl p-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <img src={signatureUrl} alt="TTD Preview" className="h-10 max-w-[120px] object-contain border border-slate-100 rounded p-1 bg-slate-50" />
                  <span className="text-[9px] text-emerald-600 font-bold flex items-center gap-1">
                    <CheckCircle2 size={11} /> Gambar Berhasil Dimuat
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSignatureUrl('')}
                  className="text-[9px] text-red-500 hover:underline cursor-pointer"
                >
                  Hapus
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-2 rounded-xl text-[10px] font-medium flex items-center gap-1.5">
          <ShieldCheck size={14} className="shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

export default SignaturePad;
