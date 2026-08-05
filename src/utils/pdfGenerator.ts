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
}

export async function generateInvoicePDF(receipt: InvoiceReceipt) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();

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
  let y = 40;
  doc.setTextColor(58, 68, 77);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('DETAIL TRANSAKSI SEWA', 15, y);

  y += 5;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(15, y, pageWidth - 15, y);

  y += 10;

  const items = [
    { label: 'Nomor Invoice / Order ID', value: receipt.id },
    { label: 'Tanggal Pembayaran', value: receipt.date },
    { label: 'Nama Penyewa', value: receipt.name },
    { label: 'Properti / Gedung Kost', value: receipt.propertyName || 'Samara Stay' },
    { label: 'Nomor Kamar', value: `Kamar ${receipt.roomNo}` },
    { label: 'Metode Pembayaran', value: (receipt.method || 'MIDTRANS').toUpperCase() },
    { label: 'Status Pembayaran', value: 'LUNAS (MIDTRANS CAPTURE SUCCESS)' },
    { label: 'Keterangan', value: receipt.details || 'Pembayaran Sewa Kamar & Deposit' }
  ];

  doc.setFontSize(10);
  items.forEach((item) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(item.label, 15, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(item.value, 82, y);

    y += 8;
  });

  y += 4;
  doc.setDrawColor(226, 232, 240);
  doc.line(15, y, pageWidth - 15, y);
  y += 10;

  // Amount Paid Highlight Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(46, 111, 64);
  doc.setLineWidth(0.8);
  doc.roundedRect(15, y, pageWidth - 30, 24, 4, 4, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('TOTAL NOMINAL DIBAYARKAN', 22, y + 8);

  doc.setFontSize(16);
  doc.setTextColor(46, 111, 64);
  doc.text(formatRupiah(receipt.amountPaid), 22, y + 17);

  y += 30;

  // SURAT PERSETUJUAN KONTRAK SEWA
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.5);
  doc.roundedRect(15, y, pageWidth - 30, 22, 3, 3, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text('SURAT PERSETUJUAN KONTRAK SEWA SEPIHAK & SAH', 20, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  const contractText = `Dokumen ini menerangkan persetujuan sah antara Pihak Pertama (Owner & Manajemen Samara Stay) dan Pihak Kedua (Pemesan: ${receipt.name}) atas sewa unit kamar ${receipt.roomNo}. Seluruh tata tertib hunian dan deposit tertera berlaku mengikat demi hukum.`;
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
  const ownerSigPng = await ensurePngDataUrl(ownerRawSig);
  
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(15, y, colWidth, 26, 2, 2, 'FD');

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('PIHAK PERTAMA (OWNER)', 18, y + 5);

  try {
    doc.addImage(ownerSigPng, 'PNG', 18, y + 7, 38, 13);
  } catch (err) {
    console.warn('[PDF] Could not render owner signature:', err);
  }

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Samara Stay Management', 18, y + 23);

  // KANAN: PEMESAN (END USER)
  const rightX = 15 + colWidth + 6;
  doc.roundedRect(rightX, y, colWidth, 26, 2, 2, 'FD');

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('PIHAK KEDUA (PEMESAN)', rightX + 3, y + 5);

  if (receipt.signatureUrl) {
    try {
      const userSigPng = await ensurePngDataUrl(receipt.signatureUrl);
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

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(receipt.name, rightX + 3, y + 23);

  y += 32;

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

  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.text(`Waktu Unduh: ${new Date().toLocaleString('id-ID')}`, 15, y);

  // File Download Trigger
  const safeFilename = receipt.id.replace(/[^a-zA-Z0-9-]/g, '_');
  doc.save(`Invoice_SamaraStay_${safeFilename}.pdf`);
}
