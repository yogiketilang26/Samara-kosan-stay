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

// Clean up expired rate limits every 10 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const ip in rateLimits) {
    if (rateLimits[ip].resetTime < now) {
      delete rateLimits[ip];
    }
  }
}, 10 * 60 * 1000);

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

  // Middleware for Admin authentication check
  async function requireAdminAuth(req: any, res: any, next: any) {
    try {
      let accessToken = getCookie(req, 'sb-access-token');
      if (!accessToken && req.headers.authorization) {
        const parts = req.headers.authorization.split(' ');
        if (parts[0] === 'Bearer') {
          accessToken = parts[1];
        }
      }

      if (!accessToken) {
        const refreshToken = getCookie(req, 'sb-refresh-token');
        if (refreshToken) {
          const freshClient = getSupabaseServerClient();
          const { data, error } = await freshClient.auth.refreshSession({ refresh_token: refreshToken });
          if (!error && data.session) {
            accessToken = data.session.access_token;
            setAuthCookies(res, data.session.access_token, data.session.refresh_token, data.session.expires_in);
          }
        }
      }

      if (!accessToken) {
        return res.status(401).json({ success: false, error: 'Akses ditolak. Token autentikasi tidak ditemukan.' });
      }

      const client = getSupabaseServerClient(accessToken);
      const { data: { user }, error } = await client.auth.getUser(accessToken);

      if (error || !user) {
        return res.status(401).json({ success: false, error: 'Sesi tidak valid atau telah kadaluarsa.' });
      }

      const userData = await getOrMigrateUserProfile(client, user);
      const isAuthorized = userData && (userData.role === 'admin' || userData.role === 'super' || userData.role === 'finance');

      if (!isAuthorized) {
        return res.status(403).json({ success: false, error: 'Akses ditolak. Peran Anda tidak memiliki izin admin.' });
      }

      req.authUser = user;
      req.authProfile = userData;
      next();
    } catch (err: any) {
      return res.status(500).json({ success: false, error: 'Terjadi kesalahan pada verifikasi autentikasi.' });
    }
  }

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
  app.get('/api/midtrans/logs', requireAdminAuth, (req, res) => {
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
  app.post('/api/midtrans/logs', requireAdminAuth, express.json(), (req, res) => {
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
  app.post('/api/midtrans/logs/clear', requireAdminAuth, (req, res) => {
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

  // Diagnostic Utility Function for MailerSend API verification & email queue debugging
  async function runMailerSendDiagnostics() {
    const timestamp = new Date().toISOString();
    let apiKey = process.env.MAILERSEND_API_KEY || '';
    apiKey = apiKey.trim();
    if (apiKey.startsWith('"') && apiKey.endsWith('"')) apiKey = apiKey.slice(1, -1);
    else if (apiKey.startsWith("'") && apiKey.endsWith("'")) apiKey = apiKey.slice(1, -1);
    apiKey = apiKey.trim();

    const rawFromEmail = process.env.MAILERSEND_FROM_EMAIL || 'info@trial-3yxj5ljp10zg6o2r.mlsender.net';
    const rawFromName = process.env.MAILERSEND_FROM_NAME || 'Samara Stay';

    const credentialsCheck = {
      apiKeyConfigured: Boolean(apiKey && apiKey !== 'YOUR_MAILERSEND_API_KEY_HERE'),
      apiKeyMasked: apiKey && apiKey !== 'YOUR_MAILERSEND_API_KEY_HERE' 
        ? `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}` 
        : 'NOT_CONFIGURED',
      fromEmail: rawFromEmail,
      fromName: rawFromName,
      isTrialDomain: rawFromEmail.includes('mlsender.net')
    };

    const diagnostics: any = {
      timestamp,
      environment: process.env.NODE_ENV || 'development',
      credentials: credentialsCheck,
      connectivity: {
        status: 'pending',
        httpCode: null,
        message: ''
      },
      domains: [],
      activityLogs: [],
      resolvedSender: null,
      recommendations: []
    };

    if (!credentialsCheck.apiKeyConfigured) {
      diagnostics.connectivity.status = 'failed';
      diagnostics.connectivity.message = 'MAILERSEND_API_KEY is missing or set to default placeholder value.';
      diagnostics.recommendations.push('Daftarkan MAILERSEND_API_KEY yang valid di environment variables (.env / settings).');
      console.warn('[MAILERSEND DIAGNOSTICS] API Key not configured.');
      return diagnostics;
    }

    try {
      console.log('[MAILERSEND DIAGNOSTICS] Verifying MailerSend API connectivity & verified domains...');
      const domainsRes = await fetch('https://api.mailersend.com/v1/domains', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      diagnostics.connectivity.httpCode = domainsRes.status;

      if (domainsRes.status === 200) {
        diagnostics.connectivity.status = 'success';
        diagnostics.connectivity.message = 'Koneksi ke MailerSend API Berhasil! (HTTP 200 OK)';
        const domainsJson = await domainsRes.json();
        
        if (domainsJson && Array.isArray(domainsJson.data)) {
          diagnostics.domains = domainsJson.data.map((d: any) => ({
            id: d.id,
            name: d.name,
            is_verified: d.is_verified ?? true,
            created_at: d.created_at
          }));
        }

        const resolvedSender = await resolveVerifiedFromEmail(apiKey, rawFromEmail);
        diagnostics.resolvedSender = resolvedSender;

        if (credentialsCheck.isTrialDomain) {
          diagnostics.recommendations.push(
            'Perhatian: Anda sedang menggunakan domain trial MailerSend (*.mlsender.net). Pada mode trial, email booking HANYA terkirim ke alamat email pembuat akun MailerSend / Authorized Recipients.'
          );
        }

        if (diagnostics.domains.length === 0) {
          diagnostics.recommendations.push(
            'Tidak ada domain terverifikasi di akun MailerSend Anda. Silakan tambahkan dan verifikasi domain kos Anda di MailerSend Dashboard.'
          );
        }
      } else {
        const errorText = await domainsRes.text();
        diagnostics.connectivity.status = 'failed';
        diagnostics.connectivity.message = `MailerSend API mengembalikan status HTTP ${domainsRes.status}`;
        diagnostics.connectivity.errorDetails = errorText;

        if (domainsRes.status === 401) {
          diagnostics.recommendations.push('HTTP 401 Unauthorized: Periksa kembali apakah MAILERSEND_API_KEY aktif dan tepat.');
        } else if (domainsRes.status === 422) {
          diagnostics.recommendations.push('HTTP 422 Unprocessable Entity: Alamat pengirim (From Email) atau domain belum sesuai di MailerSend.');
        }
      }

      // Query recent email message queue logs for debugging failed booking emails
      try {
        console.log('[MAILERSEND DIAGNOSTICS] Querying recent message queue logs...');
        const activityRes = await fetch('https://api.mailersend.com/v1/messages?limit=10', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        });

        if (activityRes.status === 200) {
          const actJson = await activityRes.json();
          if (actJson && Array.isArray(actJson.data)) {
            diagnostics.activityLogs = actJson.data.slice(0, 10).map((msg: any) => ({
              id: msg.id,
              subject: msg.subject,
              created_at: msg.created_at,
              status: msg.status || 'processed',
              recipient: msg.emails ? msg.emails.map((e: any) => e.email).join(', ') : (msg.to || 'N/A')
            }));
          }
        }
      } catch (actErr: any) {
        console.warn('[MAILERSEND DIAGNOSTICS] Failed fetching activity queue:', actErr.message || actErr);
      }

    } catch (connErr: any) {
      diagnostics.connectivity.status = 'error';
      diagnostics.connectivity.message = `Gagal terhubung ke server MailerSend: ${connErr.message || connErr}`;
      diagnostics.recommendations.push('Periksa koneksi jaringan internet atau status layanan MailerSend.');
    }

    console.log('[MAILERSEND DIAGNOSTICS RESULT]', JSON.stringify(diagnostics, null, 2));
    return diagnostics;
  }

  // Helper function to log failed emails to activity_logs and sent_emails table in Supabase
  async function logFailedEmailToDatabase(recipient: string, subject: string, errorReason: string) {
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
      if (!supabaseUrl || !supabaseKey || supabaseUrl === 'undefined' || supabaseKey === 'undefined') {
        return;
      }
      const supabase = createClient(supabaseUrl, supabaseKey);

      // 1. Log to activity_logs table for admin UI visibility
      await supabase.from('activity_logs').insert({
        admin_name: 'MailerSend System',
        action: 'EMAIL_FAILED',
        detail: `Gagal mengirim email ke ${recipient} (Subjek: "${subject}") setelah retries. Error: ${errorReason.slice(0, 250)}`,
        ip_address: '127.0.0.1'
      });

      // 2. Log to sent_emails table (if table exists)
      await supabase.from('sent_emails').insert({
        recipient,
        subject,
        status: 'failed',
        error_message: errorReason.slice(0, 500),
        sent_at: new Date().toISOString()
      }).then(({ error }) => {
        if (error) {
          console.warn('[EMAIL DB LOG] sent_emails table insert skipped/error:', error.message);
        }
      });
    } catch (dbErr) {
      console.error('[EMAIL DB LOG ERROR]', dbErr);
    }
  }

  interface MailerSendPayload {
    from: { email: string; name: string };
    to: Array<{ email: string; name: string }>;
    subject: string;
    text: string;
    html: string;
  }

  // Core MailerSend API fetcher with max 3 retries and exponential backoff (1s, 2s, 4s)
  async function sendEmailWithRetry(
    apiKey: string,
    payload: MailerSendPayload,
    recipientEmail: string,
    subject: string
  ): Promise<{ success: boolean; status?: number; dataText?: string; error?: string }> {
    const delays = [1000, 2000, 4000]; // Exponential backoff delays (1s, 2s, 4s)
    const maxAttempts = 3;
    let lastError: string = '';
    let lastStatus: number | undefined = undefined;
    let lastResponseText = '';

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`[MAILERSEND API] Attempt ${attempt}/${maxAttempts} sending email to: ${recipientEmail} ("${subject}")`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

        const res = await fetch('https://api.mailersend.com/v1/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        lastStatus = res.status;
        lastResponseText = await res.text();

        if (res.status >= 200 && res.status < 300) {
          console.log(`[MAILERSEND API SUCCESS] Email delivered on attempt ${attempt}. Status: ${res.status}`);
          return { success: true, status: res.status, dataText: lastResponseText };
        }

        // Check if error is non-transient 4xx (except 429)
        const isTransient = res.status === 429 || res.status >= 500;
        if (!isTransient) {
          console.warn(`[MAILERSEND API NON-RETRYABLE] Status ${res.status}: ${lastResponseText}. Skipping further retries.`);
          lastError = `HTTP ${res.status}: ${lastResponseText}`;
          await logFailedEmailToDatabase(recipientEmail, subject, lastError);
          return { success: false, status: res.status, dataText: lastResponseText, error: lastError };
        }

        console.warn(`[MAILERSEND API TRANSIENT ERROR] Attempt ${attempt}/${maxAttempts} failed with status ${res.status}: ${lastResponseText}`);
        lastError = `HTTP ${res.status}: ${lastResponseText}`;

      } catch (err: any) {
        console.warn(`[MAILERSEND API TIMEOUT/NETWORK ERROR] Attempt ${attempt}/${maxAttempts} failed: ${err.message || err}`);
        lastError = err.message || String(err);
      }

      // If transient error and attempt < maxAttempts, wait before retry
      if (attempt < maxAttempts) {
        const delayMs = delays[attempt - 1] || 1000;
        console.log(`[MAILERSEND API RETRY BACKOFF] Waiting ${delayMs}ms before attempt ${attempt + 1}...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    // Failed after all 3 attempts
    console.error(`[MAILERSEND API EXHAUSTED] Failed to send email to ${recipientEmail} after ${maxAttempts} attempts.`);
    await logFailedEmailToDatabase(recipientEmail, subject, lastError);

    return { success: false, status: lastStatus, dataText: lastResponseText, error: lastError };
  }

  // Helper function to send email via MailerSend API with non-blocking retry
  async function sendServerEmail(to: string, subject: string, text: string, html: string) {
    // Non-blocking background execution using setImmediate
    setImmediate(async () => {
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

        const payload: MailerSendPayload = {
          from: { email: fromEmail, name: fromName },
          to: [{ email: to, name: to.split('@')[0] }],
          subject,
          text,
          html
        };

        console.log('[SERVER EMAIL TRIGGER] Initiating non-blocking send with retry:', subject, 'to:', to);
        await sendEmailWithRetry(apiKey, payload, to, subject);
      } catch (err) {
        console.error('[SERVER EMAIL TRIGGER ERROR]', err);
      }
    });
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

      // Synchronize changes to Supabase using Service Role Key (bypasses RLS on backend)
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
      const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey && supabaseUrl !== 'undefined' && supabaseKey !== 'undefined');
      const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseKey) : null;

      // ---------------------------------------------------------
      // Webhook Idempotency Layer via webhook_events table
      // ---------------------------------------------------------
      if (supabase) {
        // Use transaction_id from Midtrans if present, or construct deterministic fallback event_id
        const eventId = notification.transaction_id || `${orderId}_${transactionStatus}_${statusCode || ''}_${grossAmount || ''}`;
        const transactionId = notification.transaction_id || null;

        const { error: webhookEventErr } = await supabase
          .from('webhook_events')
          .insert({
            provider: 'midtrans',
            event_id: eventId,
            order_id: orderId || null,
            transaction_id: transactionId,
            status: transactionStatus || paymentStatus,
            payload: notification,
            processed_at: new Date().toISOString()
          });

        if (webhookEventErr) {
          // Check for Postgres unique constraint violation (code 23505) or duplicate key error
          if (
            webhookEventErr.code === '23505' ||
            webhookEventErr.message?.includes('duplicate key') ||
            webhookEventErr.message?.includes('already exists') ||
            webhookEventErr.details?.includes('already exists')
          ) {
            console.log(`[MIDTRANS WEBHOOK IDEMPOTENCY] Event ID "${eventId}" for Order "${orderId}" was ALREADY processed. Returning 200 OK without re-processing.`);
            return res.status(200).json({
              status: 'OK',
              message: `Webhook event ${eventId} already processed (idempotency enforced).`
            });
          } else {
            console.warn('[MIDTRANS WEBHOOK IDEMPOTENCY WARNING] Failed recording webhook_event (non-fatal):', webhookEventErr.message);
          }
        } else {
          console.log(`[MIDTRANS WEBHOOK IDEMPOTENCY] Successfully recorded webhook_event: "${eventId}" for Order "${orderId}".`);
        }
      }

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
              console.log(`[SUPABASE WEBHOOK SYNC] Booking found: ID ${booking.id}, status: ${booking.status}. Executing settlement...`);
              
              // 2. Attempt atomic settlement via RPC (Migration 017)
              let invoiceId = `INV-${Math.floor(1000 + Math.random() * 9000)}`;
              const { data: rpcRes, error: settleRpcErr } = await supabase.rpc('settle_booking_payment', {
                p_booking_id: booking.id,
                p_order_id: orderId,
                p_payment_type: paymentType || 'Midtrans SNAP',
                p_transaction_id: notification.transaction_id || `mid-tr-${Math.floor(100000 + Math.random() * 900000)}`
              });

              if (!settleRpcErr && rpcRes && rpcRes.success) {
                if (rpcRes.already_approved) {
                  console.log(`[SUPABASE WEBHOOK SYNC] Booking ${orderId} already approved via RPC.`);
                  return res.status(200).json({ status: 'OK', message: 'Booking already approved' });
                }
                if (rpcRes.invoice_id) {
                  invoiceId = rpcRes.invoice_id;
                }
                if (booking.room_id) {
                  await syncPropertyRoomCountInSupabase(supabase, booking.property_id);
                }
                console.log(`[SUPABASE WEBHOOK SYNC] Atomic settlement RPC succeeded for ${orderId}, invoice: ${invoiceId}`);
              } else {
                console.warn('[SUPABASE WEBHOOK WARNING] Atomic settlement RPC fallback to manual steps:', settleRpcErr?.message || rpcRes?.error);
                // Fallback manual execution if RPC is not available
                await supabase
                  .from('bookings')
                  .update({ status: 'approved', payment_method: paymentType || 'Midtrans SNAP' })
                  .eq('id', booking.id);

                if (booking.room_id) {
                  await supabase
                    .from('rooms')
                    .update({ status: 'occupied', current_tenant_name: booking.tenant_name })
                    .eq('id', booking.room_id);
                  await syncPropertyRoomCountInSupabase(supabase, booking.property_id);
                }

                const initials = booking.tenant_name ? booking.tenant_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() : 'TM';
                await supabase.from('tenants').insert({
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
                });

                await supabase.from('payments').insert({
                  id: invoiceId,
                  tenant_name: booking.tenant_name,
                  property_id: booking.property_id,
                  amount: booking.total_price,
                  method: paymentType || 'Midtrans',
                  status: 'paid',
                  payment_date: new Date().toISOString().split('T')[0],
                  midtrans_order_id: orderId,
                  transaction_id: notification.transaction_id || `mid-tr-${Math.floor(100000 + Math.random() * 900000)}`
                });
              }

              // 6. Post double-entry financial accounting transaction
              try {
                const trxDate = new Date().toISOString().split('T')[0];
                const trxNo = `TRX-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
                const { error: rpcErr } = await supabase.rpc('post_financial_transaction', {
                  p_transaction_no: trxNo,
                  p_transaction_date: trxDate,
                  p_category: 'Penerimaan Sewa',
                  p_description: `[WEBHOOK] Pelunasan Sewa ${booking.tenant_name} Unit ${booking.room_number}`,
                  p_amount: booking.total_price,
                  p_type: 'income',
                  p_reference_type: 'payment',
                  p_reference_id: invoiceId,
                  p_created_by: 'Midtrans Webhook',
                  p_debit_account_id: 1010,
                  p_credit_account_id: 4000
                });

                if (rpcErr) {
                  // Fallback direct insert into financial_transactions
                  await supabase.from('financial_transactions').insert({
                    transaction_no: trxNo,
                    transaction_date: trxDate,
                    category: 'Penerimaan Sewa',
                    description: `[WEBHOOK] Pelunasan Sewa ${booking.tenant_name} Unit ${booking.room_number}`,
                    amount: booking.total_price,
                    type: 'income',
                    reference_type: 'payment',
                    reference_id: invoiceId,
                    created_by: 'Midtrans Webhook'
                  });
                }
              } catch (finErr) {
                console.error('[SUPABASE WEBHOOK WARNING] Financial transaction recording warning:', finErr);
              }

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

                    <!-- Persetujuan Kebijakan, Peraturan Kos & Tanda Tangan Digital -->
                    <div style="margin-top: 25px; border-top: 2px dashed #cbd5e1; padding-top: 20px; background-color: #f8fafc; border-radius: 16px; padding: 20px; border: 1px solid #e2e8f0;">
                      <h4 style="color: #1e293b; margin-top: 0; margin-bottom: 12px; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
                        PERSETUJUAN KEBIJAKAN & PERATURAN KOS (${propertyName})
                      </h4>
                      
                      <div style="font-size: 12px; color: #334155; line-height: 1.6; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; margin-bottom: 15px;">
                        <strong style="color: #0f172a; display: block; margin-bottom: 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">1. Kebijakan & Ketentuan Hunian:</strong>
                        <p style="margin: 0 0 10px 0; white-space: pre-line; font-size: 11px; color: #475569;">${property?.policies || property?.terms || "1. Wajib menyerahkan identitas diri (KTP/SIM) yang sah.\n2. Pembayaran sewa wajib dilunasi sesuai periode kontrak yang dipilih.\n3. Deposit jaminan dikembalikan saat check-out bilamana unit dalam kondisi baik."}</p>

                        <strong style="color: #0f172a; display: block; margin-bottom: 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">2. Tata Tertib & Peraturan Kos:</strong>
                        <p style="margin: 0; white-space: pre-line; font-size: 11px; color: #475569;">${property?.regulations || property?.additional_rules || "1. Menjaga ketenangan dan kerapihan fasilitas bersama.\n2. Tamu berkunjung maksimal pukul 22:00 WIB.\n3. Dilarang membawa barang berbahaya, senjata, atau obat terlarang."}</p>
                      </div>

                      ${booking.signature_url ? `
                      <div style="background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px; padding: 15px; text-align: center;">
                        <p style="font-size: 10px; color: #047857; font-weight: 800; text-transform: uppercase; margin: 0 0 8px 0; letter-spacing: 0.5px;">
                          ✓ TELAH DISETUJUI & DITANDATANGANI SECARA DIGITAL OLEH PENYEWA
                        </p>
                        <img src="${booking.signature_url}" alt="Tanda Tangan Digital ${booking.tenant_name}" style="max-height: 80px; max-width: 240px; display: block; margin: 0 auto 8px auto; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;" />
                        <p style="margin: 0; font-size: 12px; font-weight: 800; color: #1e293b;">
                          ${booking.tenant_name} (${booking.phone || '-'})
                        </p>
                        <p style="margin: 2px 0 0 0; font-size: 10px; color: #64748b; font-family: monospace;">
                          Disetujui secara elektronik pada saat proses reservasi
                        </p>
                      </div>
                      ` : ''}
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

              // 5. Post double-entry financial accounting transaction for survey DP
              try {
                const trxDate = new Date().toISOString().split('T')[0];
                const trxNo = `TRX-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
                const { error: rpcErr } = await supabase.rpc('post_financial_transaction', {
                  p_transaction_no: trxNo,
                  p_transaction_date: trxDate,
                  p_category: 'DP Survey / Reservasi',
                  p_description: `[WEBHOOK] Pelunasan DP Survey ${survey.tenant_name} Unit ${survey.room_number}`,
                  p_amount: survey.dp_amount || 500000,
                  p_type: 'dp_booking',
                  p_reference_type: 'payment',
                  p_reference_id: srvInvPayload.id,
                  p_created_by: 'Midtrans Webhook',
                  p_debit_account_id: 1010, // Kas & Bank Mandiri
                  p_credit_account_id: 1300 // Uang Muka Penyewa / DP
                });

                if (rpcErr) {
                  await supabase.from('financial_transactions').insert({
                    transaction_no: trxNo,
                    transaction_date: trxDate,
                    category: 'DP Survey / Reservasi',
                    description: `[WEBHOOK] Pelunasan DP Survey ${survey.tenant_name} Unit ${survey.room_number}`,
                    amount: survey.dp_amount || 500000,
                    type: 'dp_booking',
                    reference_type: 'payment',
                    reference_id: srvInvPayload.id,
                    created_by: 'Midtrans Webhook'
                  });
                }
              } catch (finErr) {
                console.error('[SUPABASE WEBHOOK WARNING] Survey financial transaction recording warning:', finErr);
              }

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

  // =========================================================================
  // DIGITAL SIGNATURE STORAGE & HOSTING API (FOR EMAILS & RECEIVING)
  // =========================================================================
  const signatureStore = new Map<string, string>(); // sigId -> base64Data

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

      let finalHtml = html || `<p>${text || 'Ini adalah notifikasi penting dari Samara Stay.'}</p>`;

      if (finalHtml && typeof finalHtml === 'string') {
        // A. Replace any localhost / signature API URLs with direct Base64 Data URLs so external email clients (Gmail) render signatures inline
        finalHtml = finalHtml.replace(/https?:\/\/[^\/]+\/api\/signatures\/([a-zA-Z0-9_-]+)\.png/g, (match, sigId) => {
          const b64 = signatureStore.get(sigId);
          return b64 ? `data:image/png;base64,${b64}` : match;
        });
        finalHtml = finalHtml.replace(/\/api\/signatures\/([a-zA-Z0-9_-]+)\.png/g, (match, sigId) => {
          const b64 = signatureStore.get(sigId);
          return b64 ? `data:image/png;base64,${b64}` : match;
        });

        // B. Fix double quotes inside owner SVG data URLs that break img src attributes
        finalHtml = finalHtml.replace(/src="data:image\/svg\+xml;utf8,<svg xmlns="[^"]*"/gi, `src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='90' viewBox='0 0 240 90'>"`);
      }

      const payload: MailerSendPayload = {
        from: { email: resolvedFromEmail, name: resolvedFromName },
        to: [{ email: to, name: to.split('@')[0] }],
        subject: subject || 'Notifikasi Samara Stay',
        text: text || 'Ini adalah notifikasi penting dari Samara Stay.',
        html: finalHtml
      };

      console.log('[API MAILERSEND] Dispatching email with retry policy to:', to, 'Subject:', payload.subject);

      const result = await sendEmailWithRetry(apiKey, payload, to, payload.subject);

      if (!result.success) {
        return res.status(result.status || 500).json({
          success: false,
          status: result.status || 500,
          message: 'Gagal mengirim email via MailerSend API setelah percobaan retry.',
          details: result.dataText || result.error || 'Terjadi kesalahan pengiriman'
        });
      }

      return res.json({
        success: true,
        message: 'Email berhasil terkirim via MailerSend!',
        details: result.dataText ? JSON.parse(result.dataText) : { status: 'accepted' }
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

  // =========================================================================
  // DIGITAL SIGNATURE STORAGE & HOSTING API (FOR EMAILS & RECEIVING)
  // =========================================================================

  app.post('/api/signatures/upload', express.json({ limit: '25mb' }), (req, res) => {
    try {
      const { image, identifier } = req.body;
      if (!image || typeof image !== 'string') {
        return res.status(400).json({ success: false, error: 'Data gambar tanda tangan tidak valid' });
      }

      const cleanBase64 = image.includes(',') ? image.split(',')[1] : image;
      const cleanId = (identifier || 'sig').replace(/[^a-zA-Z0-9_-]/g, '');
      const sigId = `sig_${cleanId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      signatureStore.set(sigId, cleanBase64);

      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.get('host');
      const publicUrl = `${protocol}://${host}/api/signatures/${sigId}.png`;

      console.log(`[API SIGNATURE] Successfully stored signature ${sigId}, publicUrl: ${publicUrl}`);
      return res.json({
        success: true,
        publicUrl,
        sigId
      });
    } catch (err: any) {
      console.error('[API SIGNATURE ERROR]', err);
      return res.status(500).json({ success: false, error: err.message || 'Gagal menyimpan tanda tangan' });
    }
  });

  app.get('/api/signatures/:id.png', (req, res) => {
    const sigId = req.params.id;
    const base64Data = signatureStore.get(sigId);
    if (!base64Data) {
      return res.status(404).send('Signature image not found');
    }

    try {
      const imgBuffer = Buffer.from(base64Data, 'base64');
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': imgBuffer.length,
        'Cache-Control': 'public, max-age=31536000, immutable'
      });
      return res.end(imgBuffer);
    } catch (err) {
      return res.status(500).send('Error rendering signature');
    }
  });

  // =========================================================================
  // 3. AUTHENTICATION API (SUPABASE BACKEND PROXY WITH COOKIES & TOKEN)
  // =========================================================================

  function getSupabaseServerClient(token?: string) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase URL atau Anon Key tidak dikonfigurasi di server');
    }
    const options: any = {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    };
    if (token) {
      options.global = {
        headers: {
          Authorization: `Bearer ${token}`
        }
      };
    }
    return createClient(supabaseUrl, supabaseAnonKey, options);
  }

  function getCookie(req: any, name: string): string | null {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return null;
    const list: Record<string, string> = {};
    cookieHeader.split(';').forEach((cookie: string) => {
      const parts = cookie.split('=');
      const key = parts.shift()?.trim();
      if (key) {
        list[key] = decodeURIComponent(parts.join('='));
      }
    });
    return list[name] || null;
  }

  function setAuthCookies(res: any, accessToken: string, refreshToken: string, expiresInSec: number) {
    const secure = process.env.NODE_ENV === 'production' ? 'Secure;' : '';
    const cookies = [
      `sb-access-token=${accessToken}; Path=/; HttpOnly; SameSite=Lax; ${secure} Max-Age=${expiresInSec}`,
      `sb-refresh-token=${refreshToken}; Path=/; HttpOnly; SameSite=Lax; ${secure} Max-Age=31536000`
    ];
    res.setHeader('Set-Cookie', cookies);
  }

  function clearAuthCookies(res: any) {
    const secure = process.env.NODE_ENV === 'production' ? 'Secure;' : '';
    res.setHeader('Set-Cookie', [
      `sb-access-token=; Path=/; HttpOnly; SameSite=Lax; ${secure} Max-Age=0`,
      `sb-refresh-token=; Path=/; HttpOnly; SameSite=Lax; ${secure} Max-Age=0`
    ]);
  }

  async function getOrMigrateUserProfile(client: any, user: any) {
    if (!user) return null;
    let { data: userData, error: userError } = await client
      .from('users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (userError) {
      console.error('[AUTH API] Error fetching user profile:', userError);
    }

    // Self-healing fallback: Synthesize user profile if missing or blocked by RLS
    if (!userData) {
      const email = (user.email || '').trim().toLowerCase();
      const isSuper = email === 'admin@samarastay.co.id' || email === 'yogiketilang33@gmail.com';
      userData = {
        id: user.id,
        full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
        email: email,
        role: isSuper ? 'super' : 'staff',
        role_id: isSuper ? 1 : 4,
        access: isSuper ? 'Semua Properti' : 'Staff akses terbatas',
        active: true,
        created_at: new Date().toISOString()
      };
      console.log(`[AUTH API] Synthesized profile for user ${email} (isSuper: ${isSuper})`);
    }

    return userData;
  }

  // POST /api/auth/login
  app.post('/api/auth/login', apiRateLimiter(60000, 10), async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Email dan password wajib diisi' });
      }

      const client = getSupabaseServerClient();
      const { data, error } = await client.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: password.trim()
      });

      if (error || !data.session) {
        let errMsg = error?.message || 'Gagal masuk sesi';
        const lowerMsg = errMsg.toLowerCase();
        if (lowerMsg.includes('email not confirmed')) {
          errMsg = 'Email Anda belum dikonfirmasi. Silakan periksa kotak masuk (atau folder spam) email Anda untuk melakukan verifikasi akun sebelum masuk.';
        } else if (lowerMsg.includes('invalid login credentials') || lowerMsg.includes('invalid_grant')) {
          errMsg = 'Email atau kata sandi yang Anda masukkan salah. Silakan coba lagi.';
        }
        return res.status(401).json({ success: false, error: errMsg });
      }

      const { session, user } = data;

      // Create an authenticated client on behalf of the logged-in user
      const authClient = getSupabaseServerClient(session.access_token);

      // Fetch user profile from public.users table using authenticated client
      const userData = await getOrMigrateUserProfile(authClient, user);

      let profile: any;
      if (userData) {
        if (!userData.active) {
          return res.status(403).json({ success: false, error: 'Akun Anda dinonaktifkan' });
        }
        const appRole = (userData.role === 'admin' || userData.role === 'super' || userData.role === 'finance') ? 'admin' : 'user';
        profile = {
          id: user.id,
          email: user.email || '',
          name: userData.full_name || user.email?.split('@')[0] || 'User',
          role: appRole,
          raw_role: userData.role
        };
      } else {
        // Auto-create profile in public.users if missing
        const fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
        const defaultRole = 'staff'; // default to staff (lowest privilege)
        const newUserRecord = {
          id: user.id,
          email: user.email || '',
          full_name: fullName,
          role: defaultRole,
          role_id: 4,
          active: true,
          created_at: new Date().toISOString()
        };

        const { error: insertErr } = await authClient.from('users').insert(newUserRecord);
        if (insertErr) {
          console.error('[AUTH API] Failed to auto-create user profile:', insertErr);
        }

        profile = {
          id: user.id,
          email: user.email || '',
          name: fullName,
          role: 'user',
          raw_role: defaultRole
        };
      }

      setAuthCookies(res, session.access_token, session.refresh_token, session.expires_in);
      return res.json({
        success: true,
        user: profile,
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in
      });
    } catch (err: any) {
      console.error('[AUTH API ERROR] Login exception:', err);
      return res.status(500).json({ success: false, error: err.message || 'Terjadi kesalahan sistem' });
    }
  });

  // POST /api/auth/register
  app.post('/api/auth/register', apiRateLimiter(60000, 5), async (req, res) => {
    try {
      const { email, password, fullName } = req.body;
      if (!email || !password || !fullName) {
        return res.status(400).json({ success: false, error: 'Email, password, dan nama lengkap wajib diisi' });
      }

      const client = getSupabaseServerClient();
      const cleanEmail = email.trim().toLowerCase();
      
      const { data, error } = await client.auth.signUp({
        email: cleanEmail,
        password: password.trim(),
        options: {
          data: {
            full_name: fullName.trim()
          }
        }
      });

      if (error) {
        return res.status(400).json({ success: false, error: error.message });
      }

      if (data.user) {
        const newUserRecord = {
          id: data.user.id,
          email: cleanEmail,
          full_name: fullName.trim(),
          role: 'staff', // default to staff (lowest privilege)
          role_id: 4,
          active: true,
          created_at: new Date().toISOString()
        };

        // If signUp returned a session immediately, use it to insert authenticated
        if (data.session) {
          const authClient = getSupabaseServerClient(data.session.access_token);
          const { error: insertErr } = await authClient.from('users').insert(newUserRecord);
          if (insertErr) {
            console.warn('[AUTH API] Error inserting user profile with signup session:', insertErr);
          }

          setAuthCookies(res, data.session.access_token, data.session.refresh_token, data.session.expires_in);
          return res.json({
            success: true,
            user: {
              id: data.user.id,
              email: cleanEmail,
              name: fullName.trim(),
              role: 'user',
              raw_role: 'staff'
            },
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_in: data.session.expires_in
          });
        }

        // Try unauthenticated insert if no session yet (might fail under RLS, but we retry on sign-in fallback)
        const { error: initialInsertErr } = await client.from('users').insert(newUserRecord);
        if (initialInsertErr) {
          console.log('[AUTH API] Unauthenticated initial profile insert skipped or failed (will retry after sign-in):', initialInsertErr.message);
        }

        // Attempt instant sign-in with password as fallback to get valid session
        try {
          const { data: signInData, error: signInErr } = await client.auth.signInWithPassword({
            email: cleanEmail,
            password: password.trim()
          });

          if (!signInErr && signInData.session) {
            // Re-attempt profile insertion with authenticated client now that we have a valid session
            const authClient = getSupabaseServerClient(signInData.session.access_token);
            const { error: insertRetryErr } = await authClient.from('users').insert(newUserRecord);
            if (insertRetryErr) {
              console.warn('[AUTH API] Error inserting user profile on retry:', insertRetryErr);
            }

            setAuthCookies(res, signInData.session.access_token, signInData.session.refresh_token, signInData.session.expires_in);
            return res.json({
              success: true,
              user: {
                id: signInData.user.id,
                email: cleanEmail,
                name: fullName.trim(),
                role: 'user',
                raw_role: 'staff'
              },
              access_token: signInData.session.access_token,
              refresh_token: signInData.session.refresh_token,
              expires_in: signInData.session.expires_in
            });
          }
        } catch (e) {}

        return res.json({
          success: true,
          message: 'Pendaftaran berhasil! Silakan periksa kotak masuk (atau folder spam) email Anda untuk melakukan verifikasi akun sebelum masuk.'
        });
      }

      return res.status(400).json({ success: false, error: 'Gagal mendaftarkan akun' });
    } catch (err: any) {
      console.error('[AUTH API ERROR] Register exception:', err);
      return res.status(500).json({ success: false, error: err.message || 'Terjadi kesalahan sistem' });
    }
  });

  // POST /api/auth/logout
  app.post('/api/auth/logout', async (req, res) => {
    try {
      const accessToken = getCookie(req, 'sb-access-token');
      if (accessToken) {
        const client = getSupabaseServerClient(accessToken);
        await client.auth.signOut().catch(() => {});
      }
    } catch (e) {}
    clearAuthCookies(res);
    return res.json({ success: true });
  });

  // GET /api/auth/me
  app.get('/api/auth/me', async (req, res) => {
    try {
      let accessToken = getCookie(req, 'sb-access-token');
      let refreshToken = getCookie(req, 'sb-refresh-token');

      // Check Authorization header fallback
      if (!accessToken && req.headers.authorization) {
        const parts = req.headers.authorization.split(' ');
        if (parts[0] === 'Bearer') {
          accessToken = parts[1];
        }
      }

      if (!accessToken) {
        // If we have a refresh token, try to refresh immediately
        if (refreshToken) {
          const client = getSupabaseServerClient();
          const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
          if (!error && data.session) {
            const { session, user } = data;
            setAuthCookies(res, session.access_token, session.refresh_token, session.expires_in);
            
            const userData = await getOrMigrateUserProfile(client, user);
            const appRole = (userData?.role === 'admin' || userData?.role === 'super' || userData?.role === 'finance') ? 'admin' : 'user';
            
            return res.json({
              success: true,
              user: {
                id: user.id,
                email: user.email || '',
                name: userData?.full_name || user.email?.split('@')[0] || 'User',
                role: appRole,
                raw_role: userData?.role || 'user'
              },
              access_token: session.access_token,
              refresh_token: session.refresh_token,
              expires_in: session.expires_in
            });
          }
        }
        return res.status(401).json({ success: false, error: 'Tidak terotentikasi' });
      }

      const client = getSupabaseServerClient(accessToken);
      const { data: { user }, error } = await client.auth.getUser(accessToken);

      if (error || !user) {
        // Access token might be expired. Try to refresh if we have a refresh token
        if (refreshToken) {
          const freshClient = getSupabaseServerClient();
          const { data, error: refreshErr } = await freshClient.auth.refreshSession({ refresh_token: refreshToken });
          if (!refreshErr && data.session) {
            const { session, user: refreshedUser } = data;
            setAuthCookies(res, session.access_token, session.refresh_token, session.expires_in);
            
            const userData = await getOrMigrateUserProfile(freshClient, refreshedUser);
            const appRole = (userData?.role === 'admin' || userData?.role === 'super' || userData?.role === 'finance') ? 'admin' : 'user';
            
            return res.json({
              success: true,
              user: {
                id: refreshedUser.id,
                email: refreshedUser.email || '',
                name: userData?.full_name || refreshedUser.email?.split('@')[0] || 'User',
                role: appRole,
                raw_role: userData?.role || 'user'
              },
              access_token: session.access_token,
              refresh_token: session.refresh_token,
              expires_in: session.expires_in
            });
          }
        }
        clearAuthCookies(res);
        return res.status(401).json({ success: false, error: 'Sesi kedaluwarsa atau tidak valid' });
      }

      // Fetch user profile from public.users table
      const userData = await getOrMigrateUserProfile(client, user);

      if (userData && !userData.active) {
        clearAuthCookies(res);
        return res.status(403).json({ success: false, error: 'Akun Anda dinonaktifkan' });
      }

      const appRole = (userData?.role === 'admin' || userData?.role === 'super' || userData?.role === 'finance') ? 'admin' : 'user';
      return res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email || '',
          name: userData?.full_name || user.email?.split('@')[0] || 'User',
          role: appRole,
          raw_role: userData?.role || 'user'
        },
        access_token: accessToken,
        refresh_token: refreshToken
      });
    } catch (err: any) {
      console.error('[AUTH API ERROR] GetMe exception:', err);
      return res.status(500).json({ success: false, error: err.message || 'Terjadi kesalahan sistem' });
    }
  });

  // POST /api/auth/refresh
  app.post('/api/auth/refresh', async (req, res) => {
    try {
      let refreshToken = req.body.refresh_token || getCookie(req, 'sb-refresh-token');
      if (!refreshToken) {
        return res.status(400).json({ success: false, error: 'Refresh token tidak ditemukan' });
      }

      const client = getSupabaseServerClient();
      const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });

      if (error || !data.session) {
        clearAuthCookies(res);
        return res.status(401).json({ success: false, error: error?.message || 'Gagal menyegarkan sesi' });
      }

      const { session, user } = data;
      setAuthCookies(res, session.access_token, session.refresh_token, session.expires_in);

      const userData = await getOrMigrateUserProfile(client, user);
      const appRole = (userData?.role === 'admin' || userData?.role === 'super' || userData?.role === 'finance') ? 'admin' : 'user';

      return res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email || '',
          name: userData?.full_name || user.email?.split('@')[0] || 'User',
          role: appRole,
          raw_role: userData?.role || 'user'
        },
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in
      });
    } catch (err: any) {
      console.error('[AUTH API ERROR] Refresh exception:', err);
      return res.status(500).json({ success: false, error: err.message || 'Terjadi kesalahan sistem' });
    }
  });

  // POST /api/auth/reset-password
  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ success: false, error: 'Email wajib diisi' });
      }

      const client = getSupabaseServerClient();
      const { error } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${req.protocol}://${req.get('host')}/reset-password-callback`
      });

      if (error) {
        return res.status(400).json({ success: false, error: error.message });
      }

      return res.json({ success: true, message: 'Email pemulihan kata sandi telah dikirim' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || 'Terjadi kesalahan sistem' });
    }
  });

  // POST /api/auth/change-password
  app.post('/api/auth/change-password', async (req, res) => {
    try {
      const { password } = req.body;
      if (!password) {
        return res.status(400).json({ success: false, error: 'Password baru wajib diisi' });
      }

      let accessToken = getCookie(req, 'sb-access-token');
      if (!accessToken && req.headers.authorization) {
        const parts = req.headers.authorization.split(' ');
        if (parts[0] === 'Bearer') {
          accessToken = parts[1];
        }
      }

      if (!accessToken) {
        return res.status(401).json({ success: false, error: 'Tidak terotentikasi' });
      }

      const client = getSupabaseServerClient(accessToken);
      const { error } = await client.auth.updateUser({ password: password.trim() });

      if (error) {
        return res.status(400).json({ success: false, error: error.message });
      }

      return res.json({ success: true, message: 'Kata sandi berhasil diperbarui' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || 'Terjadi kesalahan sistem' });
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
