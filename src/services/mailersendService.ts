import { Booking, Property } from '../types';

/**
 * MailerSend Service Module
 * Handles automated email notifications for Samara Stay bookings and surveys.
 */
export const mailersendService = {
  /**
   * Helper to format currency values as Rupiah (Rp)
   */
  formatRupiah(value: number): string {
    return 'Rp ' + value.toLocaleString('id-ID');
  },

  /**
   * Sends a booking confirmation email to the tenant when approved/confirmed.
   */
  async sendBookingConfirmationEmail(booking: Booking, property?: Property | null): Promise<boolean> {
    if (!booking.email) {
      console.warn('[MAILERSEND SERVICE] Cannot send confirmation. No email provided in booking.');
      return false;
    }

    const orderId = booking.midtrans_order_id || `BOOK-${booking.id}`;
    const propertyName = property?.name || 'Samara Stay Premium Residence';
    const propertyAddress = property?.address || 'Premium Boarding Area';
    const paymentMethod = booking.payment_method || 'Midtrans / Manual Approval';

    const subject = `[Samara Stay] Konfirmasi Pemesanan Kamar Berhasil - Kamar ${booking.room_number}`;
    const text = `Halo ${booking.tenant_name}, pemesanan sewa kamar Anda di ${propertyName} (Kamar ${booking.room_number}) telah berhasil dikonfirmasi dan disetujui!`;

    // High fidelity Indonesian template styled with the requested premium brand logo
    const html = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 24px; background-color: #ffffff; color: #1e293b; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);">
        <!-- Brand Header with Logo -->
        <div style="text-align: center; border-bottom: 2px solid #334155; padding-bottom: 25px; margin-bottom: 30px;">
          <!-- Logo SVG (Combination of House Icon + "SAMARA" Wordmark) -->
          <svg width="60" height="60" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: block; margin: 0 auto 10px auto;">
            <!-- Upper roof chevron (Dark Slate) -->
            <path d="M50 22 L14 50 C14 50 39 39 50 39 C61 39 86 50 86 50 L50 22 Z" fill="#334155" />
            <!-- Lower arch/pillars (Dark Slate) -->
            <path d="M23 54 L23 72 C23 72 32 64 50 54 C68 64 77 72 77 72 L77 54 C77 54 66 46 50 46 C34 46 23 54 23 54 Z" fill="#334155" />
          </svg>
          <h1 style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 28px; font-weight: 800; letter-spacing: 6px; text-transform: uppercase; color: #1e293b; margin: 10px 0 2px 0;">SAMARA</h1>
          <p style="font-family: 'Courier New', Courier, monospace; font-size: 11px; font-weight: bold; letter-spacing: 3px; text-transform: uppercase; color: #64748b; margin: 0;">S T A Y</p>
        </div>

        <!-- Receipt Badge & Title -->
        <div style="text-align: center; margin-bottom: 30px;">
          <span style="background-color: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; font-size: 11px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; padding: 6px 16px; border-radius: 9999px; display: inline-block; margin-bottom: 12px;">LUNAS / PAID</span>
          <h2 style="color: #1e293b; margin: 0; font-size: 20px; font-weight: 700;">INVOICE PEMBAYARAN</h2>
          <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0; font-family: monospace;">No: ${orderId}</p>
        </div>

        <!-- Greeting -->
        <div style="margin-bottom: 25px; font-size: 14px; line-height: 1.6; color: #334155;">
          <p>Halo <strong>${booking.tenant_name}</strong>,</p>
          <p>Terima kasih atas pembayaran Anda! Transaksi pemesanan kamar sewa Anda telah berhasil diverifikasi oleh sistem kami secara otomatis. Berikut adalah rincian tagihan lunas Anda:</p>
        </div>

        <!-- Detail Table Card -->
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin: 25px 0;">
          <h3 style="color: #1e293b; margin-top: 0; margin-bottom: 15px; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">Rincian Transaksi Hunian</h3>
          
          <table style="width: 100%; font-size: 13px; border-collapse: collapse; line-height: 2;">
            <tr>
              <td style="color: #64748b; width: 45%; font-weight: 500;">Nama Kos / Unit:</td>
              <td style="color: #1e293b; font-weight: 700; text-align: right;">${propertyName}</td>
            </tr>
            <tr>
              <td style="color: #64748b; font-weight: 500;">Nomor Kamar:</td>
              <td style="color: #1e293b; font-weight: 700; text-align: right; font-size: 14px; color: #334155;">Unit ${booking.room_number}</td>
            </tr>
            <tr>
              <td style="color: #64748b; font-weight: 500;">Tipe Kontrak:</td>
              <td style="color: #1e293b; font-weight: 700; text-align: right; text-transform: capitalize;">${booking.booking_type === 'daily' ? 'Harian (Daily)' : 'Bulanan (Monthly)'}</td>
            </tr>
            <tr>
              <td style="color: #64748b; font-weight: 500;">Tanggal Check-In:</td>
              <td style="color: #1e293b; font-weight: 700; text-align: right;">${booking.check_in_date || '-'}</td>
            </tr>
            ${booking.booking_type === 'monthly' ? `
            <tr>
              <td style="color: #64748b; font-weight: 500;">Durasi Sewa:</td>
              <td style="color: #1e293b; font-weight: 700; text-align: right;">${booking.duration_months} Bulan</td>
            </tr>` : `
            <tr>
              <td style="color: #64748b; font-weight: 500;">Durasi Sewa:</td>
              <td style="color: #1e293b; font-weight: 700; text-align: right;">${booking.duration_days || 1} Hari</td>
            </tr>`}
            <tr>
              <td style="color: #64748b; font-weight: 500;">Metode Pembayaran:</td>
              <td style="color: #1e293b; font-weight: 700; text-align: right; text-transform: uppercase;">${paymentMethod}</td>
            </tr>
            <tr>
              <td style="color: #64748b; font-weight: 500; border-top: 1px dashed #cbd5e1; padding-top: 12px; margin-top: 8px;">Total Bayar:</td>
              <td style="color: #047857; font-weight: 900; font-size: 18px; border-top: 1px dashed #cbd5e1; padding-top: 12px; margin-top: 8px; text-align: right;">
                ${this.formatRupiah(booking.total_price)}
              </td>
            </tr>
          </table>
        </div>

        ${booking.is_for_other ? `
        <!-- Detail Tamu Penghuni (Si B) Card -->
        <div style="background-color: #fef3c7; border: 1px solid #fde68a; border-radius: 16px; padding: 24px; margin: 25px 0;">
          <h3 style="color: #92400e; margin-top: 0; margin-bottom: 15px; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; border-bottom: 1px solid #fcd34d; padding-bottom: 10px;">Rincian Penghuni / Tamu (Si B)</h3>
          <p style="font-size: 12px; color: #78350f; margin-bottom: 15px; line-height: 1.5;">Kamar ini dipesan oleh <strong>${booking.tenant_name}</strong> untuk dihunikan oleh tamu di bawah ini. Harap tunjukkan KTP/identitas yang sesuai saat check-in.</p>
          <table style="width: 100%; font-size: 13px; border-collapse: collapse; line-height: 2;">
            <tr>
              <td style="color: #b45309; width: 45%; font-weight: 600;">Nama Lengkap:</td>
              <td style="color: #78350f; font-weight: 700; text-align: right;">${booking.occupant_name || '-'}</td>
            </tr>
            <tr>
              <td style="color: #b45309; font-weight: 600;">No. WhatsApp:</td>
              <td style="color: #78350f; font-weight: 700; text-align: right; font-family: monospace;">${booking.occupant_phone || '-'}</td>
            </tr>
            <tr>
              <td style="color: #b45309; font-weight: 600;">Email Penghuni:</td>
              <td style="color: #78350f; font-weight: 700; text-align: right;">${booking.occupant_email || '-'}</td>
            </tr>
            <tr>
              <td style="color: #b45309; font-weight: 600;">NIK KTP Penghuni:</td>
              <td style="color: #78350f; font-weight: 700; text-align: right; font-family: monospace;">${booking.occupant_nik || '-'}</td>
            </tr>
          </table>
        </div>
        ` : ''}

        <!-- Location Info -->
        <div style="font-size: 13px; line-height: 1.5; color: #475569; margin: 25px 0; padding: 15px; border-left: 4px solid #334155; background-color: #f8fafc; border-radius: 0 12px 12px 0;">
          <strong style="color: #1e293b; display: block; margin-bottom: 4px;">Alamat Hunian:</strong>
          ${propertyAddress}
        </div>

        <!-- Next Steps -->
        <div style="margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 25px;">
          <h4 style="color: #1e293b; margin-top: 0; margin-bottom: 12px; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Petunjuk Check-In:</h4>
          <ol style="font-size: 13px; color: #475569; padding-left: 20px; line-height: 1.7; margin: 0;">
            <li style="margin-bottom: 8px;">Simpan invoice digital ini sebagai bukti pelunasan yang sah saat serah terima unit.</li>
            <li style="margin-bottom: 8px;">Akses smart lock (kunci digital pin) atau kunci fisik kamar beserta kartu akses akan diberikan oleh asisten hunian kami saat Anda tiba di lokasi.</li>
            <li>Harap membawa kartu identitas diri asli (KTP / Passport) yang sesuai dengan nama penyewa saat check-in.</li>
          </ol>
        </div>

        <!-- Footer -->
        <div style="text-align: center; margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 25px; font-size: 11px; color: #94a3b8; line-height: 1.6;">
          <p style="margin: 0; font-weight: 700; color: #64748b;">Layanan Pengelola Samara Stay Premium Boarding</p>
          <p style="margin: 4px 0 0 0;">Email: info@samarastay.com | Whatsapp Pengelola Hunian</p>
          <p style="margin: 20px 0 0 0; font-size: 10px; color: #cbd5e1;">&copy; 2026 Samara Stay Residence. Hak Cipta Dilindungi Undang-Undang.</p>
        </div>
      </div>
    `;

    try {
      console.log(`[MAILERSEND SERVICE] Triggering email confirmation for booking ID ${booking.id} to: ${booking.email}`);
      const response = await fetch('/api/email/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to: booking.email,
          subject,
          text,
          html
        })
      });

      const result = await response.json();
      console.log(`[MAILERSEND SERVICE] Response:`, result);

      // Send confirmation to the occupant as well if different
      if (booking.is_for_other && booking.occupant_email && booking.occupant_email !== booking.email) {
        console.log(`[MAILERSEND SERVICE] Sending occupant email copy to: ${booking.occupant_email}`);
        await fetch('/api/email/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            to: booking.occupant_email,
            subject: `[Samara Stay] Konfirmasi Hunian Kamar - Unit ${booking.room_number}`,
            text: `Halo ${booking.occupant_name}, Anda didaftarkan sewa kamar di ${propertyName} (Kamar ${booking.room_number}) oleh ${booking.tenant_name}.`,
            html: html.replace(`Halo <strong>${booking.tenant_name}</strong>`, `Halo <strong>${booking.occupant_name}</strong>`)
          })
        }).catch(err => {
          console.error('[MAILERSEND SERVICE ERROR] Failed to send copy to occupant:', err);
        });
      }

      return result.success;
    } catch (err) {
      console.error('[MAILERSEND SERVICE ERROR] Failed to send email via API:', err);
      return false;
    }
  }
};
