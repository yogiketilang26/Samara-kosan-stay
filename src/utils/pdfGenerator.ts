import jsPDF from 'jspdf';
import { formatRupiah } from './formatCurrency';

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
}

export function generateInvoicePDF(receipt: InvoiceReceipt) {
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

  y += 36;

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
