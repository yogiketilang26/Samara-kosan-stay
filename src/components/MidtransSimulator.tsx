/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { CreditCard, QrCode, Building, ShieldAlert, CheckCircle, Smartphone, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface MidtransSimulatorProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  grossAmount: number;
  itemDescription: string;
  customerDetails: {
    name: string;
    email: string;
    phone: string;
  };
  onPaymentSuccess: (transactionDetails: {
    transactionId: string;
    paymentMethod: string;
    settlementTime: string;
  }) => void;
  onPaymentFail: (status: 'expired' | 'failed' | 'cancelled') => void;
  onPaymentPending?: (transactionDetails: {
    transactionId: string;
    paymentMethod: string;
    settlementTime: string;
  }) => void;
}

export default function MidtransSimulator({
  isOpen,
  onClose,
  orderId,
  grossAmount,
  itemDescription,
  customerDetails,
  onPaymentSuccess,
  onPaymentFail,
  onPaymentPending
}: MidtransSimulatorProps) {
  const [selectedMethod, setSelectedMethod] = useState<'cc' | 'va' | 'qris' | null>('qris');
  const [vaBank, setVaBank] = useState<'bca' | 'mandiri' | 'bni'>('bca');
  const [paymentStep, setPaymentStep] = useState<'select' | 'waiting' | 'success' | 'failed'>('select');

  if (!isOpen) return null;

  const formatRupiah = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(num);
  };

  const handleSimulatePayment = (status: 'settlement' | 'pending' | 'expire' | 'cancel') => {
    if (status === 'settlement') {
      setPaymentStep('success');
      setTimeout(() => {
        onPaymentSuccess({
          transactionId: `mid-sim-${Math.floor(10000000 + Math.random() * 90000000)}`,
          paymentMethod: selectedMethod === 'cc' ? 'Credit Card' : selectedMethod === 'va' ? `VA Bank ${vaBank.toUpperCase()}` : 'QRIS (GoPay/OVO)',
          settlementTime: new Date().toISOString().replace('T', ' ').slice(0, 19)
        });
        onClose();
        setPaymentStep('select');
      }, 1500);
    } else if (status === 'pending') {
      setPaymentStep('waiting');
      setTimeout(() => {
        if (onPaymentPending) {
          onPaymentPending({
            transactionId: `mid-sim-${Math.floor(10000000 + Math.random() * 90000000)}`,
            paymentMethod: selectedMethod === 'cc' ? 'Credit Card' : selectedMethod === 'va' ? `VA Bank ${vaBank.toUpperCase()}` : 'QRIS (GoPay/OVO)',
            settlementTime: new Date().toISOString().replace('T', ' ').slice(0, 19)
          });
        }
        onClose();
        setPaymentStep('select');
      }, 1500);
    } else {
      setPaymentStep('failed');
      setTimeout(() => {
        onPaymentFail(status === 'expire' ? 'expired' : 'cancelled');
        onClose();
        setPaymentStep('select');
      }, 1500);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[100] p-4 text-sm font-sans" id="midtrans-simulator-modal">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl overflow-hidden w-full max-w-md shadow-2xl relative border border-gray-100 flex flex-col max-h-[90vh]"
      >
        {/* Midtrans Snap Header */}
        <div className="bg-[#123456] text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-red-500 text-white rounded-md text-[10px] font-bold px-1.5 py-0.5 tracking-wider uppercase font-mono">SANDBOX</div>
            <div className="text-base font-semibold font-display tracking-tight">Midtrans Snap Payment</div>
          </div>
          <button 
            onClick={() => handleSimulatePayment('cancel')} 
            className="text-gray-300 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Amount bar */}
        <div className="bg-blue-50/50 border-b border-blue-100 p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-gray-500 font-mono">ORDER ID</div>
            <div className="font-semibold text-gray-700 font-mono text-xs">{orderId}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-gray-500 font-mono">TOTAL BAYAR</div>
            <div className="text-base font-bold text-brand-green">{formatRupiah(grossAmount)}</div>
          </div>
        </div>

        {/* Scrollable Area */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {paymentStep === 'select' && (
            <>
              <div className="text-xs text-slate-500 font-medium">PILIH METODE PEMBAYARAN</div>

              {/* QRIS / E-Wallet Option */}
              <button 
                onClick={() => setSelectedMethod('qris')}
                className={`w-full p-4 rounded-xl border flex items-center justify-between transition-all ${
                  selectedMethod === 'qris' 
                    ? 'border-brand-green bg-emerald-50/20 shadow-xs' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-emerald-100 text-brand-green">
                    <QrCode size={20} />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-gray-800">QRIS (GoPay, OVO, LinkAja)</div>
                    <div className="text-xs text-gray-400">Bayar instan pakai kode QR</div>
                  </div>
                </div>
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selectedMethod === 'qris' ? 'border-brand-green' : 'border-gray-300'}`}>
                  {selectedMethod === 'qris' && <div className="w-2 h-2 rounded-full bg-brand-green" />}
                </div>
              </button>

              {/* Bank Transfer / VA Option */}
              <button 
                onClick={() => setSelectedMethod('va')}
                className={`w-full p-4 rounded-xl border flex items-center justify-between transition-all ${
                  selectedMethod === 'va' 
                    ? 'border-brand-green bg-emerald-50/20 shadow-xs' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-blue-100 text-blue-600">
                    <Building size={20} />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-gray-800">Transfer Bank / Virtual Account</div>
                    <div className="text-xs text-gray-400">BCA, Mandiri, BNI, Permata Bank</div>
                  </div>
                </div>
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selectedMethod === 'va' ? 'border-brand-green' : 'border-gray-300'}`}>
                  {selectedMethod === 'va' && <div className="w-2 h-2 rounded-full bg-brand-green" />}
                </div>
              </button>

              {/* Credit Card Option */}
              <button 
                onClick={() => setSelectedMethod('cc')}
                className={`w-full p-4 rounded-xl border flex items-center justify-between transition-all ${
                  selectedMethod === 'cc' 
                    ? 'border-brand-green bg-emerald-50/20 shadow-xs' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-amber-100 text-amber-600">
                    <CreditCard size={20} />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-gray-800">Kartu Kredit / Debit Online</div>
                    <div className="text-xs text-gray-400">Visa, Mastercard, JCB</div>
                  </div>
                </div>
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selectedMethod === 'cc' ? 'border-brand-green' : 'border-gray-300'}`}>
                  {selectedMethod === 'cc' && <div className="w-2 h-2 rounded-full bg-brand-green" />}
                </div>
              </button>

              {/* Suboptions depending on method */}
              {selectedMethod === 'va' && (
                <div className="p-4 bg-slate-50 rounded-xl space-y-2 border border-slate-100">
                  <div className="text-xs text-slate-400 font-medium">PILIH BANK</div>
                  <div className="grid grid-cols-3 gap-2">
                    {['bca', 'mandiri', 'bni'].map((b) => (
                      <button
                        key={b}
                        onClick={() => setVaBank(b as any)}
                        className={`py-2 px-3 border rounded-lg text-xs font-bold uppercase transition-colors uppercase ${
                          vaBank === b 
                            ? 'border-blue-600 bg-blue-100/10 text-blue-700' 
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Customer summary */}
              <div className="p-4 bg-slate-50/50 rounded-xl border border-gray-100 text-xs text-slate-600 space-y-1">
                <div className="font-semibold text-slate-700 mb-1">Rincian Customer:</div>
                <div>Nama: <span className="font-medium text-slate-900">{customerDetails.name}</span></div>
                <div>Email: <span className="font-medium text-slate-900">{customerDetails.email}</span></div>
                <div>WhatsApp: <span className="font-medium text-slate-900">{customerDetails.phone}</span></div>
                <div>Unit: <span className="font-medium text-slate-900">{itemDescription}</span></div>
              </div>
            </>
          )}

          {paymentStep === 'waiting' && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-12 h-12 rounded-full border-4 border-slate-300 border-t-brand-green animate-spin" />
              <div>
                <div className="font-semibold text-slate-800 text-base">Menunggu Pembayaran</div>
                <div className="text-gray-400 text-xs max-w-xs mt-1">
                  Menghubungkan ke bank partner Midtrans. Mohon tunggu sejenak untuk memverifikasi saldo pembayaran.
                </div>
              </div>
            </div>
          )}

          {paymentStep === 'success' && (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-3">
              <CheckCircle className="text-emerald-500 animate-bounce" size={54} />
              <div>
                <div className="font-bold text-gray-900 text-lg uppercase font-display">PEMBAYARAN SETTLED</div>
                <div className="text-xs text-emerald-600 font-medium">Transaksi Berhasil & Terverifikasi</div>
                <div className="text-xs text-gray-400 mt-2 font-mono">ID: {orderId}</div>
              </div>
            </div>
          )}

          {paymentStep === 'failed' && (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-3">
              <ShieldAlert className="text-red-500" size={54} />
              <div>
                <div className="font-bold text-gray-900 text-lg uppercase font-display">PEMBAYARAN EXPIRED</div>
                <div className="text-xs text-red-500 font-medium font-display">Transaksi Gagal / Batalkan Kontrak</div>
                <div className="text-xs text-gray-400 mt-2 font-mono">ID: {orderId}</div>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions for Simulation Controls */}
        <div className="p-4 bg-slate-50 border-t border-gray-100 space-y-3">
          {paymentStep === 'select' ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => handleSimulatePayment('settlement')}
                  className="bg-brand-green text-white hover:bg-brand-green-hover transition-colors font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-xs cursor-pointer text-xs"
                >
                  Bayar Sukses (Settlement)
                </button>
                <button 
                  onClick={() => handleSimulatePayment('pending')}
                  className="bg-amber-500 text-white hover:bg-amber-600 transition-colors font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-xs cursor-pointer text-xs"
                >
                  Bayar Pending (Menunggu)
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  onClick={() => handleSimulatePayment('expire')}
                  className="py-2.5 px-3 bg-red-100 text-red-700 hover:bg-red-200 font-semibold transition-colors rounded-lg cursor-pointer"
                >
                  Simulasikan Gagal / Expired
                </button>
                <button
                  onClick={() => handleSimulatePayment('cancel')}
                  className="py-2.5 px-3 bg-gray-200 text-gray-700 hover:bg-gray-300 font-semibold transition-colors rounded-lg cursor-pointer"
                >
                  Simulasikan Batal (Cancel)
                </button>
              </div>
            </>
          ) : (
            <div className="text-center text-xs text-gray-400 py-2">
              Sistem Otomasi Sinkronisasi Supabase Sedang Berjalan...
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
