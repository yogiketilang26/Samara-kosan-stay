/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface MidtransTransaction {
  orderId: string;
  grossAmount: number;
  description: string;
  customerDetails: {
    name: string;
    email: string;
    phone: string;
  };
}

export const getMidtransClientKey = (): string => {
  let key = (import.meta as any).env?.VITE_MIDTRANS_CLIENT_KEY || 'SB-Mid-client-Sample';
  key = key.trim();
  if (key.startsWith('"') && key.endsWith('"')) {
    key = key.slice(1, -1);
  } else if (key.startsWith("'") && key.endsWith("'")) {
    key = key.slice(1, -1);
  }
  return key.trim();
};

export const loadMidtransSnapScript = (forceSandbox: boolean = false): Promise<boolean> => {
  return new Promise((resolve) => {
    if ((window as any).snap) {
      resolve(true);
      return;
    }

    let clientKey = getMidtransClientKey();
    // Force Sandbox URL as requested to ensure secure sandbox testing
    let isProduction = false;

    const snapUrl = 'https://app.sandbox.midtrans.com/snap/snap.js';

    console.log('[MIDTRANS SDK] Initializing Snap Script with properties:', {
      url: snapUrl,
      clientKey,
      isProduction
    });

    const script = document.createElement('script');
    script.src = snapUrl;
    script.id = 'midtrans-snap-script';
    script.setAttribute('data-client-key', clientKey);
    script.onload = () => {
      console.log('[MIDTRANS SDK] Snap script loaded successfully');
      resolve(true);
    };
    script.onerror = () => {
      console.error('[MIDTRANS SDK] Failed to load Snap script');
      resolve(false);
    };
    document.body.appendChild(script);
  });
};

export interface ChargeResponse {
  token: string;
  redirect_url: string;
  mode: 'production' | 'sandbox' | 'simulation';
  error?: string;
}

export const requestSnapTokenFromServer = async (
  transaction: MidtransTransaction
): Promise<ChargeResponse> => {
  try {
    const response = await fetch('/api/midtrans/charge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        order_id: transaction.orderId,
        gross_amount: transaction.grossAmount,
        customer_details: {
          first_name: transaction.customerDetails.name,
          email: transaction.customerDetails.email,
          phone: transaction.customerDetails.phone,
        },
        item_details: [
          {
            id: 'ROOM_BOOK',
            price: transaction.grossAmount,
            quantity: 1,
            name: transaction.description.substring(0, 50),
          },
        ],
      }),
    });

    if (!response.ok) {
      let errMessage = 'Unknown error';
      try {
        const errJson = await response.json();
        errMessage = errJson.error || JSON.stringify(errJson);
      } catch {
        errMessage = await response.text();
      }
      
      console.warn('[MIDTRANS SDK BRIDGE NOTICE] Charge request rejected by server-side bridge API:', {
        status: response.status,
        message: errMessage
      });
      throw new Error(errMessage || `Connection error to local Midtrans API (Status: ${response.status})`);
    }

    const data = await response.json();
    console.log('[MIDTRANS SDK BRIDGE SUCCESS] Obtained Snap token successfully from bridge API:', {
      mode: data.mode,
      token: data.token,
      url: data.redirect_url
    });
    return data;
  } catch (error: any) {
    console.info('=================== MIDTRANS TRANSACTION DIAGNOSTICS ===================');
    console.info('[MIDTRANS INTENTIONAL FALLBACK] Midtrans Sandbox/Production service could not initialize directly with current keys:', error.message || error);
    console.info('[MIDTRANS ACTION ROUTE] Please configure valid VITE_MIDTRANS_CLIENT_KEY and MIDTRANS_SERVER_KEY values in your settings.');
    console.info('[MIDTRANS GRACEFUL RESOLUTION] To ensure normal app operation, the booking flow is falling back to the interactive sandbox simulation.');
    console.info('========================================================================');
    
    // Graceful mock token fallback
    return {
      token: `snap-token-sim-${Math.floor(100000 + Math.random() * 900000)}`,
      redirect_url: `https://app.sandbox.midtrans.com/snap/v3/redirection/sim-${Math.floor(100000 + Math.random() * 900000)}`,
      mode: 'simulation',
      error: error.message
    };
  }
};
