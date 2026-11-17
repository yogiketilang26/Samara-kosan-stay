import React, { useState, useEffect } from 'react';
import { formatRupiah } from '../../utils/formatCurrency';
import { BadgeCheck, FileText, Printer, CheckCircle, Download, Users, Heart } from 'lucide-react';
import { generateInvoicePDF, InvoiceReceipt, resolveCoupleNames } from '../../utils/pdfGenerator';
import { DEFAULT_OWNER_SIGNATURE } from '../../lib/supabase';
import { getRealtimeSignaturePreview, resolveDocumentSignedUrl } from '../../utils/storageUploader';

interface InvoiceCardProps {
  receipt: InvoiceReceipt;
  onClose: () => void;
}

export const InvoiceCard: React.FC<InvoiceCardProps> = ({ receipt, onClose }) => {
  const [liveReceipt, setLiveReceipt] = useState<InvoiceReceipt>(() => {
    try {
      const cached = sessionStorage.getItem('samara_last_paid_receipt');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && (!receipt.id || parsed.id === receipt.id)) {
          return { ...parsed, ...receipt };
        }
      }
    } catch {}
    return receipt;
  });

  useEffect(() => {
    setLiveReceipt((prev) => ({ ...prev, ...receipt }));
  }, [receipt]);

  const [resolvedTenantSig, setResolvedTenantSig] = useState<string>(() => {
    const cached = getRealtimeSignaturePreview(liveReceipt.signatureUrl, 'tenant');
    if (cached) return cached;
    if (liveReceipt.signatureUrl && (liveReceipt.signatureUrl.startsWith('data:image/') || liveReceipt.signatureUrl.startsWith('http'))) {
      return liveReceipt.signatureUrl;
    }
    return '';
  });

  const [resolvedOwnerSig, setResolvedOwnerSig] = useState<string>(() => {
    const rawOwner = liveReceipt.ownerSignatureUrl || DEFAULT_OWNER_SIGNATURE;
    const cached = getRealtimeSignaturePreview(rawOwner, 'owner');
    if (cached) return cached;
    if (rawOwner && (rawOwner.startsWith('data:image/') || rawOwner.startsWith('http'))) {
      return rawOwner;
    }
    return DEFAULT_OWNER_SIGNATURE;
  });

  useEffect(() => {
    let active = true;

    const syncRealtimeReceiptAndSignatures = async () => {
      // 1. Fetch authoritative receipt_summary from server to guarantee real-time sync of third-party & couple names + signatures
      let srvSummary: any = null;
      if (receipt.id && receipt.id !== '999') {
        try {
          const resp = await fetch(`/api/midtrans/status/${encodeURIComponent(receipt.id)}`);
          if (resp.ok) {
            const data = await resp.json();
            srvSummary = data?.receipt_summary || null;
            if (active && srvSummary) {
              setLiveReceipt((prev) => {
                const merged: InvoiceReceipt = {
                  ...prev,
                  name: prev.name && prev.name !== 'Pelanggan Samara' ? prev.name : (srvSummary.name || prev.name),
                  roomNo: prev.roomNo && prev.roomNo !== '-' ? prev.roomNo : (srvSummary.roomNo || prev.roomNo),
                  propertyName: prev.propertyName || srvSummary.propertyName || 'Samara Stay',
                  amountPaid: Number(prev.amountPaid || srvSummary.amountPaid || data?.midtrans?.gross_amount || 0),
                  method: prev.method || srvSummary.method || 'Midtrans SNAP',
                  date: prev.date || srvSummary.date,
                  isForOther: prev.isForOther !== undefined ? prev.isForOther : Boolean(srvSummary.isForOther),
                  occupantName: prev.occupantName || srvSummary.occupantName,
                  occupantPhone: prev.occupantPhone || srvSummary.occupantPhone,
                  isMarried: prev.isMarried !== undefined ? prev.isMarried : Boolean(srvSummary.isMarried),
                  spouseName: prev.spouseName || srvSummary.spouseName,
                  spouseRelation: prev.spouseRelation || srvSummary.spouseRelation,
                  husbandName: prev.husbandName || srvSummary.husbandName,
                  wifeName: prev.wifeName || srvSummary.wifeName,
                  signatureUrl: prev.signatureUrl || srvSummary.signatureUrl,
                  ownerSignatureUrl: prev.ownerSignatureUrl || srvSummary.ownerSignatureUrl || DEFAULT_OWNER_SIGNATURE
                };
                try {
                  sessionStorage.setItem('samara_last_paid_receipt', JSON.stringify(merged));
                } catch {}
                return merged;
              });
            }
          }
        } catch {}
      }

      // 2. Resolve Tenant Signature
      const rawTenant = receipt.signatureUrl || srvSummary?.signatureUrl || '';
      const cachedTenant = getRealtimeSignaturePreview(rawTenant, 'tenant');
      if (cachedTenant && cachedTenant.startsWith('data:image/')) {
        if (active) setResolvedTenantSig(cachedTenant);
      } else if (rawTenant) {
        const signed = await resolveDocumentSignedUrl(rawTenant, receipt.id);
        if (active && signed) setResolvedTenantSig(signed);
      }

      // 3. Resolve Owner Signature
      const rawOwner = receipt.ownerSignatureUrl || srvSummary?.ownerSignatureUrl || DEFAULT_OWNER_SIGNATURE;
      const cachedOwner = getRealtimeSignaturePreview(rawOwner, 'owner');
      if (cachedOwner && cachedOwner.startsWith('data:image/')) {
        if (active) setResolvedOwnerSig(cachedOwner);
      } else if (rawOwner && (rawOwner.startsWith('signatures/') || (rawOwner.includes('/storage/v1/object/') && !rawOwner.includes('token=')))) {
        const signedOwner = await resolveDocumentSignedUrl(rawOwner, receipt.id);
        if (active && signedOwner) setResolvedOwnerSig(signedOwner);
      } else if (active) {
        setResolvedOwnerSig(rawOwner || DEFAULT_OWNER_SIGNATURE);
      }
    };

    syncRealtimeReceiptAndSignatures();

    const onRealtimeSigSync = () => {
      syncRealtimeReceiptAndSignatures();
    };
    window.addEventListener('samara-signature-realtime-sync', onRealtimeSigSync);
    return () => {
      active = false;
      window.removeEventListener('samara-signature-realtime-sync', onRealtimeSigSync);
    };
  }, [receipt.signatureUrl, receipt.ownerSignatureUrl, receipt.id]);

  const partyInfo = resolveCoupleNames(liveReceipt);

  const handleDownloadPdf = async () => {
    let effectiveReceipt: InvoiceReceipt = {
      ...liveReceipt,
      signatureUrl: resolvedTenantSig || liveReceipt.signatureUrl || getRealtimeSignaturePreview(liveReceipt.signatureUrl, 'tenant'),
      ownerSignatureUrl: resolvedOwnerSig || liveReceipt.ownerSignatureUrl || DEFAULT_OWNER_SIGNATURE
    };

    // R19: Ensure Unduh PDF works even if client state was reloaded from server
    if (
      !effectiveReceipt.name ||
      effectiveReceipt.name === 'Pelanggan Samara' ||
      !effectiveReceipt.roomNo ||
      effectiveReceipt.roomNo === '-' ||
      !effectiveReceipt.amountPaid ||
      !effectiveReceipt.signatureUrl ||
      effectiveReceipt.isForOther === undefined
    ) {
      try {
        const cached = sessionStorage.getItem('samara_last_paid_receipt');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && (!effectiveReceipt.id || parsed.id === effectiveReceipt.id)) {
            effectiveReceipt = {
              ...parsed,
              ...effectiveReceipt,
              name: effectiveReceipt.name !== 'Pelanggan Samara' ? effectiveReceipt.name : (parsed.name || effectiveReceipt.name),
              roomNo: effectiveReceipt.roomNo !== '-' ? effectiveReceipt.roomNo : (parsed.roomNo || effectiveReceipt.roomNo),
              amountPaid: effectiveReceipt.amountPaid || parsed.amountPaid || 0,
              isForOther: effectiveReceipt.isForOther ?? parsed.isForOther,
              occupantName: effectiveReceipt.occupantName || parsed.occupantName,
              isMarried: effectiveReceipt.isMarried ?? parsed.isMarried,
              spouseName: effectiveReceipt.spouseName || parsed.spouseName,
              spouseRelation: effectiveReceipt.spouseRelation || parsed.spouseRelation,
              husbandName: effectiveReceipt.husbandName || parsed.husbandName,
              wifeName: effectiveReceipt.wifeName || parsed.wifeName,
              signatureUrl: effectiveReceipt.signatureUrl || parsed.signatureUrl || getRealtimeSignaturePreview(parsed.signatureUrl, 'tenant'),
              ownerSignatureUrl: effectiveReceipt.ownerSignatureUrl || parsed.ownerSignatureUrl || DEFAULT_OWNER_SIGNATURE
            };
          }
        }
      } catch {}

      if (effectiveReceipt.id && effectiveReceipt.id !== '999') {
        try {
          const resp = await fetch(`/api/midtrans/status/${encodeURIComponent(effectiveReceipt.id)}`);
          if (resp.ok) {
            const data = await resp.json();
            const srv = data?.receipt_summary;
            if (srv) {
              effectiveReceipt = {
                ...effectiveReceipt,
                name: effectiveReceipt.name && effectiveReceipt.name !== 'Pelanggan Samara' ? effectiveReceipt.name : (srv.name || effectiveReceipt.name),
                roomNo: effectiveReceipt.roomNo && effectiveReceipt.roomNo !== '-' ? effectiveReceipt.roomNo : (srv.roomNo || effectiveReceipt.roomNo),
                propertyName: effectiveReceipt.propertyName || srv.propertyName || 'Samara Stay',
                amountPaid: Number(effectiveReceipt.amountPaid || srv.amountPaid || data?.midtrans?.gross_amount || 0),
                method: effectiveReceipt.method || srv.method || 'Midtrans SNAP',
                date: effectiveReceipt.date || srv.date,
                isForOther: effectiveReceipt.isForOther ?? srv.isForOther,
                occupantName: effectiveReceipt.occupantName || srv.occupantName,
                occupantPhone: effectiveReceipt.occupantPhone || srv.occupantPhone,
                isMarried: effectiveReceipt.isMarried ?? srv.isMarried,
                spouseName: effectiveReceipt.spouseName || srv.spouseName,
                spouseRelation: effectiveReceipt.spouseRelation || srv.spouseRelation,
                husbandName: effectiveReceipt.husbandName || srv.husbandName,
                wifeName: effectiveReceipt.wifeName || srv.wifeName,
                signatureUrl: effectiveReceipt.signatureUrl || srv.signatureUrl,
                ownerSignatureUrl: effectiveReceipt.ownerSignatureUrl || srv.ownerSignatureUrl || DEFAULT_OWNER_SIGNATURE
              };
            }
          }
        } catch {}
      }
    }

    await generateInvoicePDF(effectiveReceipt);
  };

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

      <div className="space-y-2 text-[11px] font-medium leading-relaxed font-sans min-w-0">
        <div className="flex justify-between items-center gap-2 border-b border-slate-100 py-1 min-w-0">
          <span className="text-[#64748B] uppercase font-mono text-[9px] shrink-0">Nomor Invoice</span>
          <span className="font-mono text-slate-800 select-all text-right break-all">{liveReceipt.id}</span>
        </div>

        {partyInfo.isThirdParty ? (
          <>
            <div className="flex justify-between items-center gap-2 border-b border-slate-100 py-1 min-w-0 bg-amber-50/60 px-2 rounded-lg">
              <span className="text-amber-800 uppercase font-mono text-[9px] font-bold shrink-0 flex items-center gap-1">
                <Users size={10} /> Pemesan (Pihak Ketiga)
              </span>
              <span className="text-slate-900 font-bold capitalize text-right truncate">{partyInfo.bookerName}</span>
            </div>
            <div className="flex justify-between items-center gap-2 border-b border-slate-100 py-1 min-w-0 bg-emerald-50/70 px-2 rounded-lg">
              <span className="text-emerald-800 uppercase font-mono text-[9px] font-bold shrink-0">
                Nama Penyewa (Penghuni)
              </span>
              <span className="text-[#2E6F40] font-extrabold capitalize text-right truncate">{partyInfo.primaryTenantName}</span>
            </div>
          </>
        ) : (
          <div className="flex justify-between items-center gap-2 border-b border-slate-100 py-1 min-w-0">
            <span className="text-[#64748B] uppercase font-mono text-[9px] shrink-0">Nama Penyewa</span>
            <span className="text-slate-800 font-bold capitalize text-right truncate">{partyInfo.primaryTenantName}</span>
          </div>
        )}

        {partyInfo.isMarriedCouple && (
          <div className="bg-emerald-50/60 border border-emerald-200/70 rounded-xl p-2 space-y-1">
            <div className="flex items-center justify-between text-[9px] font-mono font-bold text-emerald-800 uppercase">
              <span className="flex items-center gap-1">
                <Heart size={10} className="text-emerald-600" /> Status Pasutri Resmi
              </span>
              <span>Suami &amp; Istri</span>
            </div>
            <div className="flex justify-between items-center text-[10px] border-t border-emerald-200/50 pt-1">
              <span className="text-slate-500 font-mono text-[9px] uppercase">Nama Suami:</span>
              <span className="font-bold text-slate-800 capitalize">{partyInfo.husbandName || '-'}</span>
            </div>
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-slate-500 font-mono text-[9px] uppercase">Nama Istri:</span>
              <span className="font-bold text-slate-800 capitalize">{partyInfo.wifeName || '-'}</span>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center gap-2 border-b border-slate-100 py-1 min-w-0">
          <span className="text-[#64748B] uppercase font-mono text-[9px] shrink-0">Alokasi Kamar</span>
          <span className="text-slate-800 font-mono font-bold text-right shrink-0">Kamar {liveReceipt.roomNo}</span>
        </div>

        <div className="flex justify-between items-center gap-2 border-b border-slate-100 py-1 min-w-0">
          <span className="text-[#64748B] uppercase font-mono text-[9px] shrink-0">Tanggal Settle</span>
          <span className="text-slate-700 font-mono text-right">{liveReceipt.date}</span>
        </div>

        <div className="flex justify-between items-center gap-2 border-b border-slate-100 py-1 min-w-0">
          <span className="text-[#64748B] uppercase font-mono text-[9px] shrink-0">Metode Pembayaran</span>
          <span className="text-slate-700 font-mono uppercase text-right truncate">{liveReceipt.method}</span>
        </div>

        <div className="flex justify-between items-center gap-2 border-b border-slate-100 py-1 min-w-0">
          <span className="text-[#64748B] uppercase font-mono text-[9px] shrink-0">Garansi Harga</span>
          <span className="text-slate-700 font-sans italic text-right">Bebas Pajak & Biaya Tambahan</span>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 text-center space-y-1 min-w-0 overflow-hidden">
        <span className="text-[9px] uppercase font-bold text-[#64748B] font-mono block">NOMINAL YANG DIBAYARKAN</span>
        <div className="text-base font-extrabold text-[#2E6F40] font-mono tabular-nums break-words">{formatRupiah(liveReceipt.amountPaid)}</div>
        <p className="text-[8px] text-emerald-600 font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-1">
          <CheckCircle size={10} className="text-emerald-600 shrink-0" />
          <span className="truncate">MIDTRANS_CAPTURE_STATUS: SUCCESS</span>
        </p>
      </div>

      {/* 2. SURAT PERSETUJUAN KONTRAK SEWA */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 space-y-1.5 text-left">
        <div className="flex items-center gap-1.5 font-bold text-slate-800 text-[9.5px] uppercase font-mono border-b border-slate-100 pb-1">
          <FileText size={12} className="text-[#2E6F40] shrink-0" />
          SURAT PERSETUJUAN KONTRAK SEWA
        </div>
        <p className="text-slate-600 text-[9px] leading-relaxed">
          Dokumen ini menerangkan persetujuan sah antara <strong>Pihak Pertama (Owner &amp; Manajemen)</strong> dan{' '}
          {partyInfo.isThirdParty ? (
            <>
              <strong>Pihak Kedua (Pemesan Pihak Ketiga: {partyInfo.bookerName}</strong> untuk <strong>Penyewa/Penghuni: {partyInfo.primaryTenantName})</strong>
            </>
          ) : (
            <strong>Pihak Kedua (Penyewa: {partyInfo.primaryTenantName})</strong>
          )}
          {partyInfo.isMarriedCouple && (
            <>
              {' '}beserta pasangan sah (<strong>Suami: {partyInfo.husbandName} &amp; Istri: {partyInfo.wifeName}</strong>)
            </>
          )}{' '}
          atas sewa unit kamar Samara Stay. Seluruh ketentuan, tata tertib, serta deposit berlaku mengikat sejak tanggal settlement ini.
        </p>
      </div>

      {/* 3. TANDA TANGAN DIGITAL BERSEBELAHAN (OWNER & END USER) */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 text-center space-y-2">
        <span className="text-[9px] uppercase font-bold text-[#64748B] font-mono block">
          PENGESAHAN TANDA TANGAN KONTRAK
        </span>
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
          {/* Kiri: Owner / Manajemen */}
          <div className="flex flex-col items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-[8px] font-bold text-slate-700 uppercase tracking-tight mb-1">
              PIHAK PERTAMA (OWNER)
            </span>
            <div className="h-10 flex items-center justify-center my-1">
              {resolvedOwnerSig && resolvedOwnerSig.trim() !== '' ? (
                <img
                  src={resolvedOwnerSig}
                  alt="Tanda Tangan Owner"
                  className="h-10 max-w-[110px] object-contain"
                  onError={(e) => {
                    if (e.currentTarget.src !== DEFAULT_OWNER_SIGNATURE) {
                      e.currentTarget.src = DEFAULT_OWNER_SIGNATURE;
                    }
                  }}
                />
              ) : (
                <span className="text-[7.5px] text-slate-400 italic my-auto">Ttd Owner Sah</span>
              )}
            </div>
            <span className="text-[7.5px] text-slate-500 font-mono">Samara Management</span>
          </div>

          {/* Kanan: End User / Pemesan */}
          <div className="flex flex-col items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-[8px] font-bold text-slate-700 uppercase tracking-tight mb-1">
              {partyInfo.isThirdParty ? 'PIHAK KEDUA (PEMESAN / PENYEWA)' : 'PIHAK KEDUA (PEMESAN)'}
            </span>
            <div className="h-10 flex items-center justify-center my-1">
              {resolvedTenantSig && resolvedTenantSig.trim() !== '' ? (
                <img
                  src={resolvedTenantSig}
                  alt="Tanda Tangan Pemesan"
                  className="h-10 max-w-[110px] object-contain"
                />
              ) : (
                <span className="text-[7.5px] text-slate-400 italic my-auto">Ttd Digital Sah</span>
              )}
            </div>
            <span className="text-[7.5px] text-slate-700 font-bold font-mono capitalize truncate max-w-[125px]">
              {partyInfo.isThirdParty ? `${partyInfo.bookerName} / ${partyInfo.primaryTenantName}` : partyInfo.primaryTenantName}
            </span>
            {partyInfo.isMarriedCouple && (
              <span className="text-[6.8px] text-emerald-700 font-mono truncate max-w-[125px]">
                {partyInfo.husbandName} &amp; {partyInfo.wifeName}
              </span>
            )}
          </div>
        </div>
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
          onClick={handleDownloadPdf}
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
