import jsPDF from 'jspdf';
import { formatRupiah } from './formatCurrency';
import { ensurePngDataUrl } from './imageCompressor';

export interface InvoiceReceipt {
  type: 'survey' | 'booking';
  id: string;
  name: string;
  roomNo: string;
  propertyName: string;
  amountPaid: number;
  method: string;
  date: string;
  details?: string;
  email?: string;
  phone?: string;
  signatureUrl?: string;
  ownerSignatureUrl?: string;
  isForOther?: boolean;
  occupantName?: string;
  occupantPhone?: string;
  occupantEmail?: string;
  occupantNik?: string;
  isMarried?: boolean;
  spouseName?: string;
  spousePhone?: string;
  spouseNik?: string;
  spouseRelation?: 'istri' | 'suami' | string;
  husbandName?: string;
  wifeName?: string;
}

export function resolveCoupleNames(receipt: {
  name?: string;
  isForOther?: boolean;
  occupantName?: string;
  isMarried?: boolean;
  spouseName?: string;
  spouseRelation?: string;
  husbandName?: string;
  wifeName?: string;
}): {
  primaryTenantName: string;
  bookerName: string;
  isThirdParty: boolean;
  isMarriedCouple: boolean;
  husbandName: string;
  wifeName: string;
} {
  const bookerName = (receipt.name || 'Pelanggan Samara').trim();
  const cleanOccupant = (receipt.occupantName || '').trim();
  const isThirdParty = Boolean(receipt.isForOther && cleanOccupant);
  const primaryTenantName = isThirdParty ? cleanOccupant : bookerName;

  const cleanSpouse = (receipt.spouseName || '').trim();
  const isMarriedCouple = Boolean(receipt.isMarried && (cleanSpouse || receipt.husbandName || receipt.wifeName));
  const rel = String(receipt.spouseRelation || 'istri').toLowerCase();

  const husbandName = isMarriedCouple
    ? (receipt.husbandName?.trim() || (rel === 'suami' ? cleanSpouse : primaryTenantName))
    : '';
  const wifeName = isMarriedCouple
    ? (receipt.wifeName?.trim() || (rel === 'suami' ? primaryTenantName : cleanSpouse))
    : '';

  return {
    primaryTenantName,
    bookerName,
    isThirdParty,
    isMarriedCouple,
    husbandName,
    wifeName
  };
}

export async function generateInvoicePDF(receipt: InvoiceReceipt) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const partyInfo = resolveCoupleNames(receipt);

  // Top Accent Header
  doc.setFillColor(46, 111, 64); // #2E6F40 Primary Green
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Brand Name
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('SAMARA STAY', 15, 15);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('INVOICE & BUKTI PEMBAYARAN RESMI', 15, 22);

  // Status Badge on top right
  doc.setFillColor(232, 245, 233); // Light green background badge
  doc.roundedRect(pageWidth - 55, 8, 40, 12, 3, 3, 'F');
  doc.setTextColor(46, 111, 64);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('LUNAS / PAID', pageWidth - 35, 15.5, { align: 'center' });

  // Invoice Details Section Title
  let y = 38;
  doc.setTextColor(58, 68, 77);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('DETAIL TRANSAKSI SEWA', 15, y);

  y += 4;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(15, y, pageWidth - 15, y);

  y += 8;

  const items: Array<{ label: string; value: string }> = [
    { label: 'Nomor Invoice / Order ID', value: receipt.id },
    { label: 'Tanggal Pembayaran', value: receipt.date }
  ];

  if (partyInfo.isThirdParty) {
    items.push({
      label: 'Nama Pemesan (Pihak Ketiga)',
      value: `${partyInfo.bookerName} (Pembooking)`
    });
    items.push({
      label: 'Nama Penyewa (Penghuni)',
      value: partyInfo.primaryTenantName
    });
  } else {
    items.push({
      label: 'Nama Penyewa',
      value: partyInfo.primaryTenantName
    });
  }

  if (partyInfo.isMarriedCouple) {
    items.push({
      label: 'Status Hunian (Pasutri)',
      value: 'Pasangan Suami Istri Resmi'
    });
    items.push({
      label: 'Nama Suami',
      value: partyInfo.husbandName || '-'
    });
    items.push({
      label: 'Nama Istri',
      value: partyInfo.wifeName || '-'
    });
  }

  items.push(
    { label: 'Properti / Gedung Kost', value: receipt.propertyName || 'Samara Stay' },
    { label: 'Nomor Kamar', value: `Kamar ${receipt.roomNo}` },
    { label: 'Metode Pembayaran', value: (receipt.method || 'MIDTRANS').toUpperCase() },
    { label: 'Status Pembayaran', value: 'LUNAS (MIDTRANS CAPTURE SUCCESS)' },
    { label: 'Keterangan', value: receipt.details || 'Pembayaran Sewa Kamar & Deposit' }
  );

  const rowStep = items.length > 9 ? 6.5 : 7.8;
  doc.setFontSize(items.length > 9 ? 9.5 : 10);
  items.forEach((item) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(item.label, 15, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(String(item.value || '-'), 82, y);

    y += rowStep;
  });

  y += 3;
  doc.setDrawColor(226, 232, 240);
  doc.line(15, y, pageWidth - 15, y);
  y += 8;

  // Amount Paid Highlight Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(46, 111, 64);
  doc.setLineWidth(0.8);
  doc.roundedRect(15, y, pageWidth - 30, 22, 4, 4, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('TOTAL NOMINAL DIBAYARKAN', 22, y + 7.5);

  doc.setFontSize(15);
  doc.setTextColor(46, 111, 64);
  doc.text(formatRupiah(receipt.amountPaid), 22, y + 16);

  y += 27;

  // SURAT PERSETUJUAN KONTRAK SEWA
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.5);
  doc.roundedRect(15, y, pageWidth - 30, 23, 3, 3, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text('SURAT PERSETUJUAN KONTRAK SEWA SEPIHAK & SAH', 20, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.3);
  doc.setTextColor(71, 85, 105);
  const partyDesc = partyInfo.isThirdParty
    ? `Pihak Kedua (Pemesan: ${partyInfo.bookerName} untuk Penyewa/Penghuni: ${partyInfo.primaryTenantName}${partyInfo.isMarriedCouple ? ` — Pasutri Suami: ${partyInfo.husbandName} & Istri: ${partyInfo.wifeName}` : ''})`
    : `Pihak Kedua (Penyewa: ${partyInfo.primaryTenantName}${partyInfo.isMarriedCouple ? ` — Pasutri Suami: ${partyInfo.husbandName} & Istri: ${partyInfo.wifeName}` : ''})`;
  const contractText = `Dokumen ini menerangkan persetujuan sah antara Pihak Pertama (Owner & Manajemen Samara Stay) dan ${partyDesc} atas sewa unit kamar ${receipt.roomNo}. Seluruh tata tertib hunian dan deposit tertera berlaku mengikat demi hukum.`;
  doc.text(contractText, 20, y + 11, { maxWidth: pageWidth - 40 });

  y += 28;

  // DUAL SIGNATURES (SIDE-BY-SIDE: OWNER ON LEFT, END USER ON RIGHT)
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('PENGESAHAN TANDA TANGAN KONTRAK DUA PIHAK:', 15, y);

  y += 4;
  const colWidth = (pageWidth - 36) / 2;

  // KIRI: OWNER & MANAJEMEN
  const ownerRawSig = receipt.ownerSignatureUrl || '';
  const ownerSigPng = await ensurePngDataUrl(ownerRawSig, 240, 90, {
    isTenant: false,
    orderId: receipt.id
  });
  
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(15, y, colWidth, 26, 2, 2, 'FD');

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('PIHAK PERTAMA (OWNER)', 18, y + 5);

  if (ownerSigPng) {
    try {
      doc.addImage(ownerSigPng, 'PNG', 18, y + 7, 38, 13);
    } catch (err) {
      console.warn('[PDF] Could not render owner signature:', err);
    }
  }

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Samara Stay Management', 18, y + 23);

  // KANAN: PEMESAN (END USER)
  const rightX = 15 + colWidth + 6;
  // Explicitly reset draw & fill color to white before drawing right-hand roundedRect
  // (jsPDF shares non-stroking color state between setTextColor and setFillColor!)
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(rightX, y, colWidth, 26, 2, 2, 'FD');

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text(partyInfo.isThirdParty ? 'PIHAK KEDUA (PEMESAN / PENYEWA)' : 'PIHAK KEDUA (PEMESAN)', rightX + 3, y + 5);

  const userSigPng = await ensurePngDataUrl(receipt.signatureUrl || '', 240, 90, {
    isTenant: true,
    orderId: receipt.id
  });

  if (userSigPng) {
    try {
      doc.addImage(userSigPng, 'PNG', rightX + 3, y + 7, 38, 13);
    } catch (err) {
      console.warn('[PDF] Could not render end user signature:', err);
    }
  } else {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(148, 163, 184);
    doc.text('Tersetujui Secara Digital', rightX + 3, y + 14);
  }

  doc.setFontSize(6.8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  const sigCaption = partyInfo.isThirdParty
    ? `${partyInfo.bookerName} (Penyewa: ${partyInfo.primaryTenantName})`
    : partyInfo.isMarriedCouple
    ? `${partyInfo.husbandName} & ${partyInfo.wifeName}`
    : receipt.name;
  doc.text(String(sigCaption || receipt.name).slice(0, 42), rightX + 3, y + 23);

  y += 31;

  // Verification stamp & footer
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(100, 116, 139);
  doc.text(
    'Dokumen ini diterbitkan secara elektronik oleh sistem penagihan Samara Stay Indonesia dan sah tanpa perlu tanda tangan basah.',
    15,
    y,
    { maxWidth: pageWidth - 30 }
  );

  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.text(`Waktu Unduh: ${new Date().toLocaleString('id-ID')}`, 15, y);

  // File Download Trigger
  const safeFilename = receipt.id.replace(/[^a-zA-Z0-9-]/g, '_');
  doc.save(`Invoice_SamaraStay_${safeFilename}.pdf`);
}
