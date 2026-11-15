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
  room_id?: number;
  property_id?: number;
  booking_type?: string;
  duration_months?: number;
  duration_days?: number;
  coupon_code?: string | null;
  is_dp?: boolean;
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
    const isProduction = !forceSandbox && (Boolean((import.meta as any).env?.VITE_MIDTRANS_IS_PRODUCTION === 'true') || Boolean((import.meta as any).env?.MIDTRANS_IS_PRODUCTION === 'true'));
    const snapUrl = isProduction 
      ? 'https://app.midtrans.com/snap/snap.js'
      : 'https://app.sandbox.midtrans.com/snap/snap.js';

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
  mode: 'production' | 'sandbox';
  already_paid?: boolean;
  settled?: boolean;
  order_id?: string;
  error?: string;
}

const inflightChargeRequests = new Map<string, Promise<ChargeResponse>>();

export const requestSnapTokenFromServer = async (
  transaction: MidtransTransaction
): Promise<ChargeResponse> => {
  const cleanOrderId = String(transaction.orderId || '').trim();
  if (cleanOrderId && inflightChargeRequests.has(cleanOrderId)) {
    console.log(`[MIDTRANS SDK] Reusing in-flight charge request for order: ${cleanOrderId}`);
    return inflightChargeRequests.get(cleanOrderId)!;
  }

  const chargePromise = (async (): Promise<ChargeResponse> => {
    try {
      const response = await fetch('/api/midtrans/charge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          order_id: transaction.orderId,
          gross_amount: transaction.grossAmount,
          room_id: transaction.room_id,
          property_id: transaction.property_id,
          booking_type: transaction.booking_type,
          duration_months: transaction.duration_months,
          duration_days: transaction.duration_days,
          coupon_code: transaction.coupon_code,
          is_dp: transaction.is_dp,
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
      console.log('[MIDTRANS SDK BRIDGE SUCCESS] Obtained Snap response from bridge API:', {
        mode: data.mode,
        token: data.token,
        already_paid: data.already_paid,
        url: data.redirect_url
      });
      return data;
    } catch (error: any) {
      console.error('[MIDTRANS SDK BRIDGE ERROR] Failed to obtain Snap token:', error);
      throw error;
    } finally {
      if (cleanOrderId) {
        inflightChargeRequests.delete(cleanOrderId);
      }
    }
  })();

  if (cleanOrderId) {
    inflightChargeRequests.set(cleanOrderId, chargePromise);
  }
  return chargePromise;
};
