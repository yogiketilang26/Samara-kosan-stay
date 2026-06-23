import { database } from '../lib/supabase';
import { PaymentInvoice } from '../types';
import { requestSnapTokenFromServer } from '../lib/midtrans';

export const paymentService = {
  async getAllInvoices(): Promise<PaymentInvoice[]> {
    return database.fetchPayments();
  },
  
  async saveInvoice(invoice: PaymentInvoice): Promise<void> {
    await database.savePayment(invoice);
  },
  
  async requestSnapToken(orderId: string, amount: number, desc: string, name: string): Promise<string> {
    const res = await requestSnapTokenFromServer({
      orderId,
      grossAmount: amount,
      description: desc,
      customerDetails: {
        name,
        email: 'tamu@mail.com',
        phone: '0812XXXXXXXX'
      }
    });
    return res.token;
  }
};
