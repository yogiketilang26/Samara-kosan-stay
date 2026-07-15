/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { createClient } from '@supabase/supabase-js';

// Load environment variables from .env
dotenv.config();

// Simple in-memory rate limiting store for endpoints
const rateLimits: Record<string, { count: number; resetTime: number }> = {};
function apiRateLimiter(windowMs: number, maxRequests: number) {
  return (req: any, res: any, next: any) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const now = Date.now();
    if (!rateLimits[ip]) {
      rateLimits[ip] = { count: 1, resetTime: now + windowMs };
      return next();
    }
    const limit = rateLimits[ip];
    if (now > limit.resetTime) {
      limit.count = 1;
      limit.resetTime = now + windowMs;
      return next();
    }
    limit.count++;
    if (limit.count > maxRequests) {
      return res.status(429).json({
        success: false,
        error: 'Too many requests, please try again later.'
      });
    }
    next();
  };
}

async function startServer() {
  const app = express();
  app.use(express.json());

  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  // =========================================================================
  // 1. MIDTRANS API INTEGRATION (REAL & SIMULATED CO-EXISTENCE)
  // =========================================================================

  const midtransLogs: any[] = [];

  function addMidtransLog(entry: {
    orderId: string;
    customerName?: string;
    customerEmail?: string;
    amount?: number;
    type: 'charge' | 'webhook' | 'client_event' | 'error' | 'simulation';
    status: string;
    message: string;
    details?: any;
  }) {
    midtransLogs.unshift({
      id: `log-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      timestamp: new Date().toISOString(),
      ...entry
    });
    // Keep last 100 logs
    if (midtransLogs.length > 100) {
      midtransLogs.pop();
    }
  }

  // Midtrans Logs Retrieval API
  app.get('/api/midtrans/logs', (req, res) => {
    return res.json({ logs: midtransLogs });
  });

  // Client-Side configuration bridge API (Allows frontend to sync on container credentials at runtime)
  app.get('/api/config', (req, res) => {
    res.json({
      supabaseUrl: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
      supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
      midtransClientKey: process.env.VITE_MIDTRANS_CLIENT_KEY || process.env.MIDTRANS_CLIENT_KEY || ''
    });
  });

  // Client-Side Logs Submission API
  app.post('/api/midtrans/logs', express.json(), (req, res) => {
    const { orderId, customerName, customerEmail, amount, type, status, message, details } = req.body;
    addMidtransLog({
      orderId: orderId || 'unknown',
      customerName,
      customerEmail,
      amount: amount ? Number(amount) : undefined,
      type: type || 'client_event',
      status: status || 'info',
      message: message || 'Client event recorded',
      details
    });
    return res.json({ status: 'OK' });
  });

  // Clear Midtrans Logs
  app.post('/api/midtrans/logs/clear', (req, res) => {
    midtransLogs.length = 0;
    return res.json({ status: 'OK' });
  });

  app.post('/api/midtrans/charge', apiRateLimiter(60000, 30), async (req, res) => {
    try {
      const { order_id, gross_amount, customer_details, item_details } = req.body;

      let rawServerKey = process.env.MIDTRANS_SERVER_KEY || '';
      let serverKey = rawServerKey.trim();
      
      // Strip any surrounding double or single quotes if present
      if (serverKey.startsWith('"') && serverKey.endsWith('"')) {
        serverKey = serverKey.slice(1, -1);
      } else if (serverKey.startsWith("'") && serverKey.endsWith("'")) {
        serverKey = serverKey.slice(1, -1);
      }
      serverKey = serverKey.trim();
      
      // Print safe diagnostics for troubleshooting (length, starts/ends characters)
      console.log('[MIDTRANS DIAGNOSTICS]', {
        rawLength: rawServerKey.length,
        cleanedLength: serverKey.length,
        startsWithSB: serverKey.startsWith('SB-Mid-'),
        hasQuotes: rawServerKey !== serverKey,
        prefix: serverKey.slice(0, 11),
        suffix: serverKey.slice(-4)
      });

      // If server key is NOT provided, throw transparent error instead of simulation fallback
      if (!serverKey || serverKey === 'YOUR_MIDTRANS_SERVER_KEY_HERE' || serverKey === 'MY_MIDTRANS_SERVER_KEY' || serverKey === '') {
        console.error('[MIDTRANS ERROR] Server Key is not configured.');
        return res.status(400).json({
          success: false,
          error: 'MIDTRANS_SERVER_KEY tidak ditemukan atau belum dikonfigurasi di server. Silakan hubungi admin.'
        });
      }

      // Real API Call using Node fetch with Base64 authentication header
      const authHeader = Buffer.from(`${serverKey}:`).toString('base64');
      
      // Dynamic Production / Sandbox detection
      const isProduction = process.env.MIDTRANS_IS_PRODUCTION === 'true' || process.env.NODE_ENV === 'production';
      const midtransUrl = isProduction 
        ? 'https://app.snap.midtrans.com/snap/v1/transactions' 
        : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

      const payload = {
        transaction_details: {
          order_id,
          gross_amount,
        },
        credit_card: {
          secure: true,
        },
        customer_details,
        item_details,
      };

      console.log(`[MIDTRANS REAL] Forwarding request to Midtrans API: ${midtransUrl} (${isProduction ? 'Production' : 'Sandbox'})`);
      
      addMidtransLog({
        orderId: order_id || 'unknown',
        customerName: customer_details?.first_name || 'Anonymous',
        customerEmail: customer_details?.email || 'N/A',
        amount: gross_amount,
        type: 'charge',
        status: 'initiated',
        message: `Sending charge request to Midtrans ${isProduction ? 'Production' : 'Sandbox'}`,
        details: { url: midtransUrl, mode: isProduction ? 'production' : 'sandbox' }
      });

      const response = await fetch(midtransUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authHeader}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error_messages ? data.error_messages.join(', ') : (data.message || 'Midtrans API Error'));
      }

      addMidtransLog({
        orderId: order_id || 'unknown',
        customerName: customer_details?.first_name || 'Anonymous',
        customerEmail: customer_details?.email || 'N/A',
        amount: gross_amount,
        type: 'charge',
        status: 'success',
        message: `Successfully obtained Midtrans Snap Token for order ${order_id}`,
        details: { token: data.token, mode: isProduction ? 'production' : 'sandbox' }
      });

      return res.json({
        token: data.token,
        redirect_url: data.redirect_url,
        mode: isProduction ? 'production' : 'sandbox'
      });
    } catch (error: any) {
      console.error('[MIDTRANS REAL ERROR]', error);
      
      addMidtransLog({
        orderId: req.body?.order_id || 'unknown',
        customerName: req.body?.customer_details?.first_name || 'Anonymous',
        customerEmail: req.body?.customer_details?.email || 'N/A',
        amount: req.body?.gross_amount,
        type: 'error',
        status: 'failed',
        message: `Midtrans charge failed: ${error.message || 'Unknown error'}.`,
        details: { error: error.message || 'Unknown error' }
      });

      return res.status(400).json({
        success: false,
        error: `Gagal memproses pembayaran Midtrans: ${error.message || 'Unknown error'}`
      });
    }
  });

  // Helper function to sync room counts back to properties table in Supabase
  async function syncPropertyRoomCountInSupabase(supabaseClient: any, propertyId: any) {
    if (!propertyId) return;
    try {
      const { data: pRooms, error: roomErr } = await supabaseClient
        .from('rooms')
        .select('*')
        .eq('property_id', propertyId);
      
      if (!roomErr && pRooms) {
        const total = pRooms.length;
        const avail = pRooms.filter((r: any) => r.status === 'available').length;
        console.log(`[SUPABASE SYNC] Property ID: ${propertyId}, Total Rooms: ${total}, Available Rooms: ${avail}`);
        await supabaseClient
          .from('properties')
          .update({ total_rooms: total, available_rooms: avail })
          .eq('id', propertyId);
      }
    } catch (err) {
      console.error('[SUPABASE SYNC ERROR]', err);
    }
  }

  // Helper function to dynamically discover the verified domain from MailerSend if possible
  async function resolveVerifiedFromEmail(apiKey: string, fallbackEmail: string): Promise<string> {
    try {
      console.log('[MAILERSEND DISCOVERY] Querying verified domains list...');
      const res = await fetch('https://api.mailersend.com/v1/domains', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });
      if (res.status === 200) {
        const json = await res.json();
        if (json && Array.isArray(json.data) && json.data.length > 0) {
          const domains = json.data;
          console.log('[MAILERSEND DISCOVERY] Available domains raw data:', JSON.stringify(domains, null, 2));
          
          // Filter to only select active / verified domains where possible
          const verifiedDomains = domains.filter((d: any) => d.is_verified === true || d.is_verified === 'true' || d.is_verified === 1 || d.is_verified === undefined);
          console.log('[MAILERSEND DISCOVERY] Filtered verified domains:', verifiedDomains.map((d: any) => d.name));
          
          const activeDomainsList = verifiedDomains.length > 0 ? verifiedDomains : domains;
          const fallbackDomain = fallbackEmail.split('@')[1];
          
          // Try to find the domain matching our fallback in the active list
          const match = activeDomainsList.find((d: any) => d.name === fallbackDomain);
          if (match) {
            console.log(`[MAILERSEND DISCOVERY] Verified match found for fallback domain: ${fallbackDomain}`);
            return fallbackEmail;
          }
          
          // Otherwise, select the first verified / active domain from MailerSend
          const selectedDomain = activeDomainsList[0].name;
          const userPrefix = fallbackEmail.split('@')[0] || 'info';
          const resolved = `${userPrefix}@${selectedDomain}`;
          console.log(`[MAILERSEND DISCOVERY] Selected domain: ${selectedDomain}. Resolved email: ${resolved}`);
          return resolved;
        } else {
          console.warn('[MAILERSEND DISCOVERY] No domains found in MailerSend account response.');
        }
      } else {
        console.warn(`[MAILERSEND DISCOVERY] Domains API returned status ${res.status}: ${await res.text()}`);
      }
    } catch (err) {
      console.error('[MAILERSEND DISCOVERY ERROR] Failed to fetch domains:', err);
    }
    return fallbackEmail;
  }

  // Helper function to send email via MailerSend API
  async function sendServerEmail(to: string, subject: string, text: string, html: string) {
    try {
      let apiKey = process.env.MAILERSEND_API_KEY || '';
      apiKey = apiKey.trim();
      if (apiKey.startsWith('"') && apiKey.endsWith('"')) apiKey = apiKey.slice(1, -1);
      else if (apiKey.startsWith("'") && apiKey.endsWith("'")) apiKey = apiKey.slice(1, -1);
      apiKey = apiKey.trim();

      if (!apiKey || apiKey === 'YOUR_MAILERSEND_API_KEY_HERE') {
        console.warn('[SERVER EMAIL TRIGGER WARNING] MAILERSEND_API_KEY is not configured. Email skipped.');
        return;
      }

      const baseFromEmail = process.env.MAILERSEND_FROM_EMAIL || 'info@trial-3yxj5ljp10zg6o2r.mlsender.net';
      const fromEmail = await resolveVerifiedFromEmail(apiKey, baseFromEmail);
      const fromName = process.env.MAILERSEND_FROM_NAME || 'Samara Stay';

      const payload = {
        from: { email: fromEmail, name: fromName },
        to: [{ email: to, name: to.split('@')[0] }],
        subject,
        text,
        html
      };

      console.log('[SERVER EMAIL TRIGGER] Sending:', subject, 'to:', to, 'from:', fromEmail);
      const res = await fetch('https://api.mailersend.com/v1/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });
      const dataText = await res.text();
      console.log('[SERVER EMAIL TRIGGER] Result:', res.status, dataText);
    } catch (err) {
      console.error('[SERVER EMAIL TRIGGER ERROR]', err);
    }
  }

  // 2. Midtrans Webhook Receiver (With Signature Key Verification)
  app.post('/api/midtrans/webhook', async (req, res) => {
    try {
      const notification = req.body;
      console.log('[MIDTRANS WEBHOOK RECEIVED] Order ID:', notification.order_id, 'Status:', notification.transaction_status);

      const orderId = notification.order_id;
      const transactionStatus = notification.transaction_status;
      const fraudStatus = notification.fraud_status;
      const paymentType = notification.payment_type;
      const grossAmount = notification.gross_amount;
      const statusCode = notification.status_code;
      const incomingSignature = notification.signature_key;

      // ---------------------------------------------------------
      // Webhook Signature Verification Logic
      // ---------------------------------------------------------
      let rawServerKey = process.env.MIDTRANS_SERVER_KEY || '';
      let serverKey = rawServerKey.trim();
      if (serverKey.startsWith('"') && serverKey.endsWith('"')) {
        serverKey = serverKey.slice(1, -1);
      } else if (serverKey.startsWith("'") && serverKey.endsWith("'")) {
        serverKey = serverKey.slice(1, -1);
      }
      serverKey = serverKey.trim();

      // Enforce strict check if MIDTRANS_SERVER_KEY is configured
      if (serverKey && serverKey !== 'YOUR_MIDTRANS_SERVER_KEY_HERE' && serverKey !== '') {
        if (!incomingSignature) {
          console.warn('[MIDTRANS WEBHOOK SECURITY WARNING] Webhook received without signature key.');
          return res.status(401).json({ error: 'Unauthorized: Missing signature key' });
        }

        const computedSignature = crypto
          .createHash('sha512')
          .update(orderId + statusCode + grossAmount + serverKey)
          .digest('hex');

        if (computedSignature !== incomingSignature) {
          console.warn('[MIDTRANS WEBHOOK SECURITY WARNING] Signature mismatch computed:', computedSignature, 'received:', incomingSignature);
          addMidtransLog({
            orderId: orderId || 'unknown',
            type: 'error',
            status: 'failed',
            message: 'Webhook signature verification failed: invalid credentials or signature mismatch.',
            details: { incomingSignature }
          });
          return res.status(401).json({ error: 'Unauthorized: Invalid signature key' });
        }
        console.log('[MIDTRANS WEBHOOK SECURITY] Signature verified successfully!');
      } else {
        console.log('[MIDTRANS WEBHOOK WARNING] Skipping signature verification: server key not configured.');
      }

      let paymentStatus: 'paid' | 'pending' | 'overdue' = 'pending';

      if (transactionStatus === 'capture') {
        if (fraudStatus === 'challenge') {
          paymentStatus = 'pending';
        } else if (fraudStatus === 'accept') {
          paymentStatus = 'paid';
        }
      } else if (transactionStatus === 'settlement') {
        paymentStatus = 'paid';
      } else if (transactionStatus === 'cancel' || transactionStatus === 'deny' || transactionStatus === 'expire') {
        paymentStatus = 'overdue';
      } else if (transactionStatus === 'pending') {
        paymentStatus = 'pending';
      }

      console.log(`[STATUS COUPLING] Order: ${orderId} is mapped to Status: ${paymentStatus} via payment: ${paymentType}`);

      addMidtransLog({
        orderId: orderId || 'unknown',
        amount: grossAmount ? Number(grossAmount) : undefined,
        type: 'webhook',
        status: paymentStatus === 'paid' ? 'success' : paymentStatus === 'overdue' ? 'failed' : 'pending',
        message: `Webhook notification received from Midtrans. Status: ${transactionStatus}, mapped to ${paymentStatus} (${paymentType})`,
        details: notification
      });

      // Synchronize changes to Supabase if configured
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
      const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey && supabaseUrl !== 'undefined' && supabaseAnonKey !== 'undefined');
      const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null;

      if (supabase && orderId) {
        if (paymentStatus === 'paid') {
          if (orderId.startsWith('BOOK-') || orderId.startsWith('BOOKING-')) {
            console.log(`[SUPABASE WEBHOOK SYNC] Processing booking payment settlement for ${orderId}`);
            
            // 1. Fetch existing pending booking
            const { data: booking, error: fetchErr } = await supabase
              .from('bookings')
              .select('*')
              .eq('midtrans_order_id', orderId)
              .maybeSingle();

            if (fetchErr) {
              console.error('[SUPABASE WEBHOOK ERROR] Fetch booking error:', fetchErr);
            }

            if (booking) {
              if (booking.status === 'approved') {
                console.log(`[SUPABASE WEBHOOK SYNC] Webhook received but booking ${orderId} is ALREADY approved. Skipping duplicate processing for idempotency.`);
                return res.status(200).json({ status: 'OK', message: 'Booking already approved' });
              }
              console.log(`[SUPABASE WEBHOOK SYNC] Booking found: ID ${booking.id}, status: ${booking.status}. Updating status to approved...`);
              
              // 2. Update booking status
              const { error: updateErr } = await supabase
                .from('bookings')
                .update({ status: 'approved', payment_method: paymentType || 'Midtrans SNAP' })
                .eq('id', booking.id);
                
              if (updateErr) {
                console.error('[SUPABASE WEBHOOK ERROR] Update booking error:', updateErr);
              }

              // 3. Update room status to 'occupied'
              if (booking.room_id) {
                console.log(`[SUPABASE WEBHOOK SYNC] Updating room ${booking.room_id} to occupied...`);
                const { error: roomErr } = await supabase
                  .from('rooms')
                  .update({ status: 'occupied', current_tenant_name: booking.tenant_name })
                  .eq('id', booking.room_id);
                if (roomErr) console.error('[SUPABASE WEBHOOK ERROR] Update room error:', roomErr);

                // Recalculate and update available_rooms count for property in Supabase
                await syncPropertyRoomCountInSupabase(supabase, booking.property_id);
              }

              // 4. Create tenant record
              console.log(`[SUPABASE WEBHOOK SYNC] Creating tenant record for ${booking.tenant_name}...`);
              const initials = booking.tenant_name ? booking.tenant_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() : 'TM';
              const tenantPayload = {
                full_name: booking.tenant_name,
                phone: booking.phone,
                email: booking.email || '',
                avatar_initials: initials,
                avatar_color: "bg-indigo-600",
                property_id: booking.property_id,
                room_number: booking.room_number,
                start_date: booking.check_in_date || new Date().toISOString().split('T')[0],
                duration_months: booking.duration_months || 1,
                payment_status: 'paid'
              };
              const { error: tenantErr } = await supabase.from('tenants').insert(tenantPayload);
              if (tenantErr) console.error('[SUPABASE WEBHOOK ERROR] Create tenant error:', tenantErr);

              // 5. Create payment invoice
              console.log(`[SUPABASE WEBHOOK SYNC] Creating payment invoice...`);
              const invoiceId = `INV-${Math.floor(1000 + Math.random() * 9000)}`;
              const paymentPayload = {
                id: invoiceId,
                tenant_name: booking.tenant_name,
                property_id: booking.property_id,
                amount: booking.total_price,
                method: paymentType || 'Midtrans',
                status: 'paid',
                payment_date: new Date().toISOString().split('T')[0],
                midtrans_order_id: orderId,
                transaction_id: notification.transaction_id || `mid-tr-${Math.floor(100000 + Math.random() * 900000)}`
              };
              const { error: payErr } = await supabase.from('payments').insert(paymentPayload);
              if (payErr) console.error('[SUPABASE WEBHOOK ERROR] Create payment invoice error:', payErr);

              // Fetch property info for high fidelity invoice details
              let property = null;
              if (booking.property_id) {
                const { data: prop } = await supabase
                  .from('properties')
                  .select('*')
                  .eq('id', booking.property_id)
                  .maybeSingle();
                property = prop;
              }
              const propertyName = property?.name || 'Samara Stay Premium Residence';
              const propertyAddress = property?.address || 'Premium Boarding Area';
              const paymentMethodName = paymentType || 'Midtrans Snap Gateway';
              const formattedPrice = 'Rp ' + (booking.total_price || 0).toLocaleString('id-ID');

              // Send premium email notification via MailerSend
              if (booking.email) {
                const subject = `[Samara Stay] Invoice Pelunasan Sewa Kamar - Unit ${booking.room_number}`;
                const text = `Halo ${booking.tenant_name}, pemesanan sewa kamar Anda di ${propertyName} (Unit ${booking.room_number}) telah berhasil dikonfirmasi dan dilunasi!`;
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
                      <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0; font-family: monospace;">No: ${invoiceId}</p>
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
                          <td style="color: #1e293b; font-weight: 700; text-align: right; text-transform: uppercase;">${paymentMethodName}</td>
                        </tr>
                        <tr>
                          <td style="color: #64748b; font-weight: 500; border-top: 1px dashed #cbd5e1; padding-top: 12px; margin-top: 8px;">Total Bayar:</td>
                          <td style="color: #047857; font-weight: 900; font-size: 18px; border-top: 1px dashed #cbd5e1; padding-top: 12px; margin-top: 8px; text-align: right;">
                            ${formattedPrice}
                          </td>
                        </tr>
                      </table>
                    </div>

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
                sendServerEmail(booking.email, subject, text, html);
              }
            } else {
              console.warn(`[SUPABASE WEBHOOK SYNC] Booking record not found for ${orderId}`);
            }

          } else if (orderId.startsWith('SRV-')) {
            console.log(`[SUPABASE WEBHOOK SYNC] Processing survey payment settlement for ${orderId}`);
            
            // 1. Fetch existing pending survey
            const { data: survey, error: fetchErr } = await supabase
              .from('surveys')
              .select('*')
              .eq('reservation_number', orderId)
              .maybeSingle();

            if (fetchErr) {
              console.error('[SUPABASE WEBHOOK ERROR] Fetch survey error:', fetchErr);
            }

            if (survey) {
              if (survey.status === 'survey_confirmed') {
                console.log(`[SUPABASE WEBHOOK SYNC] Webhook received but survey ${orderId} is ALREADY confirmed. Skipping duplicate processing for idempotency.`);
                return res.status(200).json({ status: 'OK', message: 'Survey already confirmed' });
              }
              console.log(`[SUPABASE WEBHOOK SYNC] Survey found: ID ${survey.id}. Updating status to survey_confirmed...`);
              
              // 2. Update survey status
              const { error: updateErr } = await supabase
                .from('surveys')
                .update({ status: 'survey_confirmed', payment_method: paymentType || 'Midtrans SNAP' })
                .eq('id', survey.id);
              if (updateErr) console.error('[SUPABASE WEBHOOK ERROR] Update survey error:', updateErr);

              // 3. Update room status to 'reserved'
              console.log(`[SUPABASE WEBHOOK SYNC] Querying room to update status to reserved...`);
              const { data: room, error: roomFetchErr } = await supabase
                .from('rooms')
                .select('*')
                .eq('property_id', survey.property_id)
                .eq('room_number', survey.room_number)
                .maybeSingle();

              if (!roomFetchErr && room) {
                const { error: roomUpdateErr } = await supabase
                  .from('rooms')
                  .update({ status: 'reserved' })
                  .eq('id', room.id);
                if (roomUpdateErr) console.error('[SUPABASE WEBHOOK ERROR] Room status update error:', roomUpdateErr);

                // Recalculate and update available_rooms count for property in Supabase
                await syncPropertyRoomCountInSupabase(supabase, survey.property_id);
              }

              // 4. Create payment invoice
              console.log(`[SUPABASE WEBHOOK SYNC] Creating survey payment invoice...`);
              const srvInvPayload = {
                id: survey.invoice_id || `INV-SRV-${Math.floor(1000 + Math.random() * 9000)}`,
                tenant_name: survey.tenant_name,
                property_id: survey.property_id,
                amount: survey.dp_amount || 500000,
                method: paymentType || "Midtrans Snap QRIS",
                status: "paid",
                payment_date: new Date().toISOString().split('T')[0],
                midtrans_order_id: orderId,
                transaction_id: notification.transaction_id || `mid-tr-${Math.floor(100000 + Math.random() * 900000)}`
              };
              const { error: payErr } = await supabase.from('payments').insert(srvInvPayload);
              if (payErr) console.error('[SUPABASE WEBHOOK ERROR] Create survey invoice error:', payErr);

              // Send premium email notification via MailerSend
              if (survey.email) {
                const subject = `[Samara Stay] Jadwal Survey Kamar Dikonfirmasi - Unit ${survey.room_number}`;
                const text = `Halo ${survey.tenant_name}, jadwal survey Anda untuk kamar Unit ${survey.room_number} telah dikonfirmasi untuk tanggal ${survey.survey_date} pukul ${survey.survey_time}.`;
                const html = `
                  <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; color: #1e293b;">
                    <div style="text-align: center; border-bottom: 2px solid #f59e0b; padding-bottom: 15px; margin-bottom: 20px;">
                      <h1 style="color: #2D3A44; margin: 0; font-size: 24px;">SAMARA STAY</h1>
                      <p style="color: #64748b; font-size: 12px; margin: 5px 0 0 0; text-transform: uppercase; font-family: monospace;">Premium Boarding Residence</p>
                    </div>
                    <h2 style="color: #f59e0b; margin-top: 0;">Jadwal Survey Dikonfirmasi!</h2>
                    <p>Halo <strong>${survey.tenant_name}</strong>,</p>
                    <p>Terima kasih. Jadwal kunjungan survey dan reservasi kamar sementara Anda telah berhasil dikonfirmasi setelah pembayaran DP berhasil diterima.</p>
                    
                    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; margin: 20px 0;">
                      <h3 style="color: #2D3A44; margin-top: 0; margin-bottom: 10px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Rincian Jadwal</h3>
                      <table style="width: 100%; font-size: 13px; line-height: 2;">
                        <tr><td style="color: #64748b; width: 40%;">Tanggal Kunjungan:</td><td><strong>${survey.survey_date}</strong></td></tr>
                        <tr><td style="color: #64748b;">Waktu Slot:</td><td><strong>${survey.survey_time} WIB</strong></td></tr>
                        <tr><td style="color: #64748b;">Kamar Target:</td><td><strong>Unit ${survey.room_number}</strong></td></tr>
                        <tr><td style="color: #64748b;">Deposit DP Survey:</td><td><strong style="color: #f59e0b; font-size: 14px;">Rp ${(survey.dp_amount || 500000).toLocaleString('id-ID')}</strong></td></tr>
                      </table>
                    </div>
                    <p style="font-size: 13px; color: #64748b; line-height: 1.5;">Tim lapangan kami akan menemui Anda langsung di lokasi kos sesuai dengan waktu yang Anda pilih. Mohon datang tepat waktu dan tunjukkan email konfirmasi reservasi ini.</p>
                    <div style="text-align: center; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px; font-size: 11px; color: #94a3b8;">
                      &copy; 2026 Samara Stay. Seluruh hak cipta dilindungi.
                    </div>
                  </div>
                `;
                sendServerEmail(survey.email, subject, text, html);
              }
            } else {
              console.warn(`[SUPABASE WEBHOOK SYNC] Survey record not found for ${orderId}`);
            }
          }
        } else if (paymentStatus === 'overdue') {
          if (orderId.startsWith('BOOK-') || orderId.startsWith('BOOKING-')) {
            const { data: booking } = await supabase
              .from('bookings')
              .select('*')
              .eq('midtrans_order_id', orderId)
              .maybeSingle();

            if (booking) {
              await supabase.from('bookings').update({ status: 'rejected' }).eq('id', booking.id);
              if (booking.room_id) {
                await supabase.from('rooms').update({ status: 'available', current_tenant_name: null }).eq('id', booking.room_id);
                await syncPropertyRoomCountInSupabase(supabase, booking.property_id);
              }
            }
          } else if (orderId.startsWith('SRV-')) {
            const { data: survey } = await supabase
              .from('surveys')
              .select('*')
              .eq('reservation_number', orderId)
              .maybeSingle();

            if (survey) {
              await supabase.from('surveys').update({ status: 'expired' }).eq('id', survey.id);
              const { data: room } = await supabase
                .from('rooms')
                .select('*')
                .eq('property_id', survey.property_id)
                .eq('room_number', survey.room_number)
                .maybeSingle();
              if (room && room.status === 'reserved') {
                await supabase.from('rooms').update({ status: 'available' }).eq('id', room.id);
                await syncPropertyRoomCountInSupabase(supabase, survey.property_id);
              }
            }
          }
        }
      }

      // Return a completed status to Midtrans gateway
      return res.status(200).json({ status: 'OK', mapped_status: paymentStatus });
    } catch (error: any) {
      console.error('[WEBHOOK ERROR]', error);

      addMidtransLog({
        orderId: req.body?.order_id || 'unknown',
        type: 'error',
        status: 'failed',
        message: `Webhook ingestion failure: ${error.message || 'Unknown error'}`,
        details: { body: req.body, error: error.message }
      });

      return res.status(500).json({ error: 'Webhook ingestion failure' });
    }
  });

  // MailerSend Send Email API endpoint (rate-limited for security)
  app.post('/api/email/send', apiRateLimiter(60000, 15), async (req, res) => {
    try {
      const { to, subject, text, html, fromEmail, fromName } = req.body;

      let apiKey = process.env.MAILERSEND_API_KEY || '';
      apiKey = apiKey.trim();
      if (apiKey.startsWith('"') && apiKey.endsWith('"')) apiKey = apiKey.slice(1, -1);
      else if (apiKey.startsWith("'") && apiKey.endsWith("'")) apiKey = apiKey.slice(1, -1);
      apiKey = apiKey.trim();

      if (!apiKey || apiKey === 'YOUR_MAILERSEND_API_KEY_HERE') {
        return res.status(500).json({
          success: false,
          message: 'Gagal mengirim email. MAILERSEND_API_KEY belum dikonfigurasi.'
        });
      }

      const baseFromEmail = fromEmail || process.env.MAILERSEND_FROM_EMAIL || 'info@trial-3yxj5ljp10zg6o2r.mlsender.net';
      const resolvedFromEmail = await resolveVerifiedFromEmail(apiKey, baseFromEmail);
      const resolvedFromName = fromName || process.env.MAILERSEND_FROM_NAME || 'Samara Stay';

      const payload = {
        from: { email: resolvedFromEmail, name: resolvedFromName },
        to: [{ email: to, name: to.split('@')[0] }],
        subject: subject || 'Notifikasi Samara Stay',
        text: text || 'Ini adalah notifikasi penting dari Samara Stay.',
        html: html || `<p>${text || 'Ini adalah notifikasi penting dari Samara Stay.'}</p>`
      };

      console.log('[API MAILERSEND] Forwarding to MailerSend:', JSON.stringify(payload, null, 2));

      const response = await fetch('https://api.mailersend.com/v1/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();
      console.log('[API MAILERSEND] Response:', response.status, responseText);

      if (response.status >= 400) {
        return res.status(response.status).json({
          success: false,
          status: response.status,
          message: 'Gagal mengirim email via MailerSend API.',
          details: responseText
        });
      }

      return res.json({
        success: true,
        message: 'Email berhasil terkirim via MailerSend!',
        details: responseText ? JSON.parse(responseText) : { status: 'accepted' }
      });
    } catch (err: any) {
      console.error('[API MAILERSEND ERROR]', err);
      return res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan sistem internal saat mengirim email.',
        error: err.message || err
      });
    }
  });

  // API Health Indicator
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      midtrans_configured: Boolean(process.env.MIDTRANS_SERVER_KEY && process.env.MIDTRANS_SERVER_KEY !== 'YOUR_MIDTRANS_SERVER_KEY_HERE'),
      mailersend_configured: Boolean(process.env.MAILERSEND_API_KEY && process.env.MAILERSEND_API_KEY !== 'YOUR_MAILERSEND_API_KEY_HERE')
    });
  });

  // =========================================================================
  // 2. VITE DEV SERVER OR STATIC ASSETS ROUTER
  // =========================================================================

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER RUNNING] Express backend listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
