/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Building, MapPin, Tag, Smartphone, User, FileText, Gift, Calendar, 
  Map, Pocket, ShieldAlert, CheckCircle, Clock, Compass, Info, Check, Printer,
  Sparkles
} from 'lucide-react';
import { Property, Room, Booking, Survey, Coupon, SystemSettings } from '../types';
import { database } from '../lib/supabase';
import MidtransSimulator from '../components/MidtransSimulator';

interface UserWebsiteProps {
  onRefreshTrigger: number;
  triggerAppRefresh?: () => void;
}

export default function UserWebsite({ onRefreshTrigger, triggerAppRefresh }: UserWebsiteProps) {
  // Loaded state arrays
  const [properties, setProperties] = useState<Property[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [rules, setRules] = useState<SystemSettings | null>(null);

  // Filters
  const [selectedType, setSelectedType] = useState<'all' | 'putra' | 'putri' | 'campur'>('all');
  const [selectedPropertyId, setSelectedPropertyId] = useState<number | 'all'>('all');
  const [priceRange, setPriceRange] = useState<number>(20000000);
  
  // Interactive UI workflows
  const [activeProperty, setActiveProperty] = useState<Property | null>(null);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [checkoutFlow, setCheckoutFlow] = useState<'none' | 'survey' | 'monthly' | 'daily'>('none');

  // DP Survey Registration State Form
  const [surveyForm, setSurveyForm] = useState({
    fullName: '',
    nik: '',
    email: '',
    phone: '',
    address: '',
    job: '',
    date: '',
    slot: '09:00 - 11:00',
    moveInDate: ''
  });

  // Regular Monthly/Daily Booking Form State
  const [bookingPeriodMonths, setBookingPeriodMonths] = useState<number>(1);
  const [bookingPeriodDays, setBookingPeriodDays] = useState<number>(1);
  const [bookingCheckInDate, setBookingCheckInDate] = useState<string>('');
  const [couponInput, setCouponInput] = useState<string>('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState<string>('');

  // Midtrans SNAP Trigger states
  const [snapOpen, setSnapOpen] = useState(false);
  const [snapPaymentContext, setSnapPaymentContext] = useState<{
    orderId: string;
    grossAmount: number;
    description: string;
  } | null>(null);

  // Completed receipt modal
  const [showReceipt, setShowReceipt] = useState<boolean>(false);
  const [receiptData, setReceiptData] = useState<{
    type: 'survey' | 'booking';
    id: string;
    name: string;
    roomNo: string;
    propertyName: string;
    amountPaid: number;
    method: string;
    date: string;
    details?: string;
  } | null>(null);

  const [loading, setLoading] = useState(true);

  // Load backend variables
  useEffect(() => {
    async function loadFrontendData() {
      setLoading(true);
      const [propsData, roomsData, couponsData, rulesData] = await Promise.all([
        database.fetchProperties(),
        database.fetchRooms(),
        database.fetchCoupons(),
        database.fetchSettings()
      ]);
      setProperties(propsData);
      setRooms(roomsData);
      setCoupons(couponsData);
      setRules(rulesData);
      if (propsData && propsData.length > 0) {
        const maxPriceVal = Math.max(...propsData.map(p => p.price));
        setPriceRange(Math.max(5000000, maxPriceVal));
      }
      setLoading(false);
    }
    loadFrontendData();
  }, [onRefreshTrigger]);

  const activePropertyRooms = activeProperty 
    ? rooms.filter(r => r.property_id === activeProperty.id && r.status === 'available')
    : [];

  // Filtered properties
  const filteredProperties = properties.filter(p => {
    const matchType = selectedType === 'all' || p.type === selectedType;
    const matchPrice = p.price <= priceRange;
    return matchType && matchPrice;
  });

  // Handle coupon validation code trigger
  const handleApplyCoupon = () => {
    setCouponError('');
    setAppliedCoupon(null);
    if (!couponInput.trim()) return;

    const validated = coupons.find(c => c.code.toUpperCase() === couponInput.toUpperCase());
    if (!validated || !validated.is_active) {
      setCouponError('Kode promo salah atau sudah kedaluwarsa.');
      return;
    }

    // Verify minimum months criteria if set
    if (checkoutFlow === 'monthly' && validated.min_duration_months && bookingPeriodMonths < validated.min_duration_months) {
      setCouponError(`Kode promo hanya berlaku untuk sewa minimal ${validated.min_duration_months} bulan.`);
      return;
    }

    setAppliedCoupon(validated);
  };

  // Pricing engine algorithms
  const calculateBookingDetails = () => {
    if (!activeRoom) return { rent: 0, tax: 0, deposit: 500000, discount: 0, total: 0 };
    
    const rentBase = checkoutFlow === 'daily' 
      ? activeRoom.daily_price * bookingPeriodDays
      : activeRoom.price * bookingPeriodMonths;

    let discount = 0;
    if (appliedCoupon) {
      if (appliedCoupon.discount_type === 'percentage') {
        discount = rentBase * (appliedCoupon.discount_value / 100);
        if (appliedCoupon.max_discount_amount && discount > appliedCoupon.max_discount_amount) {
          discount = appliedCoupon.max_discount_amount;
        }
      } else {
        discount = appliedCoupon.discount_value;
      }
    }

    const netRent = Math.max(0, rentBase - discount);
    const taxValue = netRent * 0.10; // PBJT 10%
    const depositValue = checkoutFlow === 'daily' ? 100000 : 500000;
    const finalAmount = netRent + taxValue + depositValue;

    return {
      rent: rentBase,
      tax: taxValue,
      deposit: depositValue,
      discount,
      total: finalAmount
    };
  };

  const bookingCalcs = calculateBookingDetails();

  // Handle start DP survey scheduler
  const handleLaunchSurveyPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoom || !activeProperty) return;

    // Preventive calendar conflict check
    const existingSurveys = await database.fetchSurveys();
    const conflict = existingSurveys.some(s => 
      s.property_id === activeProperty.id && 
      s.room_number === activeRoom.room_number && 
      s.survey_date === surveyForm.date && 
      s.survey_time_slot === surveyForm.slot && 
      s.status === 'survey_confirmed'
    );

    if (conflict) {
      alert("Maaf, slot jadwal pada tanggal tersebut sudah terisi oleh calon penghuni lain. Mohon pilih tanggal atau jam yang lain.");
      return;
    }

    const orderId = `SRV-${new Date().toISOString().slice(2,10).replace(/-/g, '')}-${Math.floor(1000 + Math.random()*9000)}`;
    const grossAmount = 500000;
    const description = `DP Jaminan Survey Kamar ${activeRoom.room_number}`;

    const customerDetails = {
      name: surveyForm.fullName || 'Tamu Mandiri',
      email: surveyForm.email || 'tamu@mail.com',
      phone: surveyForm.phone || '0812XXXXXXXX'
    };

    setLoading(true);

    try {
      const { loadMidtransSnapScript, requestSnapTokenFromServer } = await import('../lib/midtrans');
      
      const chargeResult = await requestSnapTokenFromServer({
        orderId,
        grossAmount,
        description,
        customerDetails
      });

      // Adaptive script loading based on backend outcome
      await loadMidtransSnapScript(chargeResult.mode === 'sandbox');

      setLoading(false);

      if ((chargeResult.mode === 'production' || chargeResult.mode === 'sandbox') && (window as any).snap) {
        setSnapPaymentContext({ orderId, grossAmount, description });

        // Pre-save pending survey record to Supabase
        try {
          const surveyRecord: Partial<Survey> = {
            tenant_name: surveyForm.fullName || 'Tamu Mandiri',
            nik: surveyForm.nik || '',
            email: surveyForm.email || 'tamu@mail.com',
            phone: surveyForm.phone || '0812XXXXXXXX',
            address: surveyForm.address || '',
            job: surveyForm.job || '',
            planned_move_in_date: surveyForm.moveInDate || '',
            property_id: activeProperty.id,
            room_number: activeRoom.room_number,
            survey_date: surveyForm.date || '',
            survey_time_slot: surveyForm.slot || '',
            status: 'pending_payment',
            dp_amount: 500000,
            payment_method: 'Midtrans SNAP',
            invoice_id: `INV-SRV-${Math.floor(1000 + Math.random() * 9000)}`,
            reservation_number: orderId
          };
          await database.saveSurvey(surveyRecord);
        } catch (dbErr) {
          console.warn('Silent survey database pre-save warning:', dbErr);
        }

        (window as any).snap.pay(chargeResult.token, {
          onSuccess: (result: any) => {
            fetch('/api/midtrans/logs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orderId,
                status: 'success',
                type: 'client_event',
                message: 'Customer successfully completed DP Survey transaction inside Snap popup.',
                details: result,
                amount: grossAmount
              })
            }).catch(() => {});

            handleSandboxPaymentSuccess({
              transactionId: result.transaction_id || `mid-${Math.floor(Math.random() * 100000000)}`,
              paymentMethod: result.payment_type || 'Midtrans SNAP',
              settlementTime: result.transaction_time || new Date().toISOString().replace('T', ' ').slice(0, 19)
            });
          },
          onPending: (result: any) => {
            fetch('/api/midtrans/logs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orderId,
                status: 'pending',
                type: 'client_event',
                message: 'Customer DP Survey payment is pending/awaiting settlement.',
                details: result,
                amount: grossAmount
              })
            }).catch(() => {});

            handleSandboxPaymentPending({
              transactionId: result.transaction_id || `mid-${Math.floor(Math.random() * 100000000)}`,
              paymentMethod: result.payment_type || 'Midtrans SNAP',
              settlementTime: result.transaction_time || new Date().toISOString().replace('T', ' ').slice(0, 19)
            });
            alert('Pembayaran DP Survey pending/menunggu penyelesaian di portal Midtrans.');
          },
          onError: (result: any) => {
            fetch('/api/midtrans/logs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orderId,
                status: 'failed',
                type: 'client_event',
                message: 'Customer DP Survey payment failed during Snap popup workflow.',
                details: result,
                amount: grossAmount
              })
            }).catch(() => {});

            alert('Pembayaran Midtrans gagal.');
          },
          onClose: () => {
            fetch('/api/midtrans/logs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orderId,
                status: 'closed',
                type: 'client_event',
                message: 'Customer manually closed the Midtrans Snap popup window for DP Survey.',
                amount: grossAmount
              })
            }).catch(() => {});

            alert('Popup Midtrans ditutup sebelum pembayaran selesai.');
          }
        });
      } else {
        setSnapPaymentContext({ orderId, grossAmount, description });
        setSnapOpen(true);
      }
    } catch (err) {
      setLoading(false);
      console.error(err);
      setSnapPaymentContext({ orderId, grossAmount, description });
      setSnapOpen(true);
    }
  };

  // Handle Monthly/Daily direct checkout payment trigger
  const handleLaunchCheckoutPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoom || !activeProperty || !bookingCheckInDate) {
      alert("Mohon lengkapi tanggal mulai sewa/check-in.");
      return;
    }

    const orderId = `BOOKING-${new Date().toISOString().slice(2,10).replace(/-/g, '')}-${Math.floor(1000 + Math.random()*9000)}`;
    const grossAmount = bookingCalcs.total;
    const description = `${checkoutFlow === 'daily' ? 'Harian' : 'Bulanan'} - Kamar ${activeRoom.room_number}`;

    const customerDetails = {
      name: surveyForm.fullName || 'Tamu Mandiri',
      email: surveyForm.email || 'tamu@mail.com',
      phone: surveyForm.phone || '0812XXXXXXXX'
    };

    setLoading(true);

    try {
      const { loadMidtransSnapScript, requestSnapTokenFromServer } = await import('../lib/midtrans');
      
      const chargeResult = await requestSnapTokenFromServer({
        orderId,
        grossAmount,
        description,
        customerDetails
      });

      // Adaptive script loading based on backend outcome
      await loadMidtransSnapScript(chargeResult.mode === 'sandbox');

      setLoading(false);

      if ((chargeResult.mode === 'production' || chargeResult.mode === 'sandbox') && (window as any).snap) {
        setSnapPaymentContext({ orderId, grossAmount, description });

        // Pre-save pending booking record to Supabase
        try {
          const isDaily = checkoutFlow === 'daily';
          const bookingRecord: Partial<Booking> = {
            property_id: activeProperty.id,
            room_id: activeRoom.id,
            room_number: activeRoom.room_number,
            tenant_name: surveyForm.fullName || 'Tamu Mandiri',
            phone: surveyForm.phone || '0812XXXXXXXX',
            email: surveyForm.email || 'tamu@mail.com',
            nik: surveyForm.nik || '',
            booking_date: new Date().toISOString().split('T')[0],
            check_in_date: bookingCheckInDate,
            duration_months: isDaily ? 0 : bookingPeriodMonths,
            booking_type: isDaily ? 'daily' : 'monthly',
            duration_days: isDaily ? bookingPeriodDays : undefined,
            total_price: grossAmount,
            status: 'pending',
            payment_method: 'Midtrans SNAP',
            midtrans_order_id: orderId,
            is_dp: false,
            coupon_code: null,
            discount_amount: 0
          };
          await database.saveBooking(bookingRecord);
        } catch (dbErr) {
          console.warn('Silent booking database pre-save warning:', dbErr);
        }

        (window as any).snap.pay(chargeResult.token, {
          onSuccess: (result: any) => {
            fetch('/api/midtrans/logs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orderId,
                status: 'success',
                type: 'client_event',
                message: 'Customer successfully completed booking checkout transaction inside Snap popup.',
                details: result,
                amount: grossAmount
              })
            }).catch(() => {});

            handleSandboxPaymentSuccess({
              transactionId: result.transaction_id || `mid-${Math.floor(Math.random() * 100000000)}`,
              paymentMethod: result.payment_type || 'Midtrans SNAP',
              settlementTime: result.transaction_time || new Date().toISOString().replace('T', ' ').slice(0, 19)
            });
          },
          onPending: (result: any) => {
            fetch('/api/midtrans/logs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orderId,
                status: 'pending',
                type: 'client_event',
                message: 'Customer booking checkout payment is pending/awaiting settlement.',
                details: result,
                amount: grossAmount
              })
            }).catch(() => {});

            handleSandboxPaymentPending({
              transactionId: result.transaction_id || `mid-${Math.floor(Math.random() * 100000000)}`,
              paymentMethod: result.payment_type || 'Midtrans SNAP',
              settlementTime: result.transaction_time || new Date().toISOString().replace('T', ' ').slice(0, 19)
            });
            alert('Pembayaran sewa unit anda sedang tertunda.');
          },
          onError: (result: any) => {
            fetch('/api/midtrans/logs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orderId,
                status: 'failed',
                type: 'client_event',
                message: 'Customer booking checkout payment failed during Snap popup workflow.',
                details: result,
                amount: grossAmount
              })
            }).catch(() => {});

            alert('Pembayaran Midtrans gagal.');
          },
          onClose: () => {
            fetch('/api/midtrans/logs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orderId,
                status: 'closed',
                type: 'client_event',
                message: 'Customer manually closed the Midtrans Snap popup window for booking checkout.',
                amount: grossAmount
              })
            }).catch(() => {});

            alert('Popup Midtrans ditutup sebelum sewa diselesaikan.');
          }
        });
      } else {
        setSnapPaymentContext({ orderId, grossAmount, description });
        setSnapOpen(true);
      }
    } catch (err) {
      setLoading(false);
      console.error(err);
      setSnapPaymentContext({ orderId, grossAmount, description });
      setSnapOpen(true);
    }
  };

  // Real Midtrans callback simulations pending
  const handleSandboxPaymentPending = async (details: {
    transactionId: string;
    paymentMethod: string;
    settlementTime: string;
  }) => {
    if (!activeRoom || !activeProperty || !snapPaymentContext) return;

    if (checkoutFlow === 'survey') {
      const surveyRecord: Partial<Survey> = {
        tenant_name: surveyForm.fullName,
        nik: surveyForm.nik,
        email: surveyForm.email,
        phone: surveyForm.phone,
        address: surveyForm.address,
        job: surveyForm.job,
        planned_move_in_date: surveyForm.moveInDate,
        property_id: activeProperty.id,
        room_number: activeRoom.room_number,
        survey_date: surveyForm.date,
        survey_time_slot: surveyForm.slot,
        status: 'pending_payment',
        dp_amount: 500000,
        payment_method: details.paymentMethod,
        invoice_id: `INV-SRV-${Math.floor(1000 + Math.random() * 9000)}`
      };

      const savedSurvey = await database.saveSurvey(surveyRecord);

      const pendingInvoice = {
        id: savedSurvey.invoice_id || `INV-SRV-${Math.floor(1000 + Math.random() * 9000)}`,
        tenant_name: surveyForm.fullName,
        property_id: activeProperty.id,
        amount: 500000,
        method: details.paymentMethod || 'Midtrans SNAP',
        status: 'pending' as const,
        payment_date: new Date().toISOString().split('T')[0],
        midtrans_order_id: snapPaymentContext.orderId,
        transaction_id: details.transactionId || `mid-${Math.floor(Math.random() * 100000000)}`
      };
      await database.savePayment(pendingInvoice);

      setReceiptData({
        type: 'survey',
        id: savedSurvey.invoice_id || 'INV-SRV-999',
        name: surveyForm.fullName,
        roomNo: activeRoom.room_number,
        propertyName: activeProperty.name,
        amountPaid: 500000,
        method: details.paymentMethod,
        date: details.settlementTime,
        details: `Jadwal Survey Pending: ${surveyForm.date} Jam: ${surveyForm.slot}`
      });

    } else {
      const bookingRecord: Partial<Booking> = {
        tenant_name: surveyForm.fullName || "Tamu Mandiri",
        phone: surveyForm.phone || "0812XXXXXXXX",
        email: surveyForm.email || "tamu@mail.com",
        property_id: activeProperty.id,
        room_id: activeRoom.id,
        room_number: activeRoom.room_number,
        duration_months: bookingPeriodMonths || 1,
        booking_type: 'monthly',
        total_price: snapPaymentContext.grossAmount,
        status: 'pending',
        payment_method: details.paymentMethod,
        midtrans_order_id: snapPaymentContext.orderId,
        booking_date: new Date().toISOString().split('T')[0],
        check_in_date: surveyForm.moveInDate || new Date().toISOString().split('T')[0]
      };

      const updatedRoom: Room = { 
        ...activeRoom, 
        status: 'reserved', 
        current_tenant_name: surveyForm.fullName 
      };
      await database.saveRoom(updatedRoom);

      const savedBooking = await database.saveBooking(bookingRecord);

      const pendingInvoice = {
        id: `INV-${Math.floor(1000 + Math.random() * 9000)}`,
        tenant_name: surveyForm.fullName || "Tamu Mandiri",
        property_id: activeProperty.id,
        amount: snapPaymentContext.grossAmount,
        method: details.paymentMethod || 'Midtrans SNAP',
        status: 'pending' as const,
        payment_date: new Date().toISOString().split('T')[0],
        midtrans_order_id: snapPaymentContext.orderId,
        transaction_id: details.transactionId || `mid-${Math.floor(Math.random() * 100000000)}`
      };
      await database.savePayment(pendingInvoice);

      setReceiptData({
        type: 'booking',
        id: savedBooking.midtrans_order_id || '999',
        name: surveyForm.fullName || "Tamu Mandiri",
        roomNo: activeRoom.room_number,
        propertyName: activeProperty.name,
        amountPaid: snapPaymentContext.grossAmount,
        method: details.paymentMethod,
        date: new Date().toISOString().split('T')[0],
        details: 'Sewa Unit Tertunda (Pending).'
      });
    }

    setSnapOpen(false);
    setShowReceipt(true);
    triggerAppRefresh?.();
  };

  // Real Midtrans callback simulations success
  const handleSandboxPaymentSuccess = async (details: {
    transactionId: string;
    paymentMethod: string;
    settlementTime: string;
  }) => {
    if (!activeRoom || !activeProperty || !snapPaymentContext) return;

    if (checkoutFlow === 'survey') {
      // 1. Create survey record
      const surveyRecord: Partial<Survey> = {
        tenant_name: surveyForm.fullName,
        nik: surveyForm.nik,
        email: surveyForm.email,
        phone: surveyForm.phone,
        address: surveyForm.address,
        job: surveyForm.job,
        planned_move_in_date: surveyForm.moveInDate,
        property_id: activeProperty.id,
        room_number: activeRoom.room_number,
        survey_date: surveyForm.date,
        survey_time_slot: surveyForm.slot,
        status: 'survey_confirmed',
        dp_amount: 500000,
        payment_method: details.paymentMethod,
        invoice_id: `INV-SRV-${Math.floor(1000 + Math.random() * 9000)}`
      };

      const savedSurvey = await database.saveSurvey(surveyRecord);

      // Setup receipt data for printable view
      setReceiptData({
        type: 'survey',
        id: savedSurvey.invoice_id || 'INV-SRV-999',
        name: surveyForm.fullName,
        roomNo: activeRoom.room_number,
        propertyName: activeProperty.name,
        amountPaid: 500000,
        method: details.paymentMethod,
        date: details.settlementTime,
        details: `Jadwal Survey Terkonfirmasi: ${surveyForm.date} Jam: ${surveyForm.slot}`
      });

    } else {
      // Direct Booking flow
      const bookingRecord: Partial<Booking> = {
        tenant_name: surveyForm.fullName || "Tamu Mandiri",
        phone: surveyForm.phone || "0812XXXXXXXX",
        email: surveyForm.email || "tamu@mail.com",
        property_id: activeProperty.id,
        room_number: activeRoom.room_number,
        duration_months: checkoutFlow === 'monthly' ? bookingPeriodMonths : 1,
        total_price: bookingCalcs.total,
        rent_price: bookingCalcs.rent - bookingCalcs.discount,
        pbjt: bookingCalcs.tax,
        deposit_amount: bookingCalcs.deposit,
        payment_method: details.paymentMethod,
        status: 'approved',
        room_id: activeRoom.id,
        midtrans_order_id: snapPaymentContext.orderId,
        booking_type: checkoutFlow === 'daily' ? 'daily' : 'monthly',
        duration_days: checkoutFlow === 'daily' ? bookingPeriodDays : undefined,
        check_in_date: bookingCheckInDate,
        is_dp: false,
        coupon_code: appliedCoupon ? appliedCoupon.code : null,
        discount_amount: bookingCalcs.discount
      };

      const savedBooking = await database.saveBooking(bookingRecord);

      setReceiptData({
        type: 'booking',
        id: `INV-MEMBER-${Math.floor(1000 + Math.random()*9000)}`,
        name: bookingRecord.tenant_name,
        roomNo: activeRoom.room_number,
        propertyName: activeProperty.name,
        amountPaid: bookingCalcs.total,
        method: details.paymentMethod,
        date: details.settlementTime,
        details: `Sewa ${checkoutFlow === 'daily' ? `${bookingPeriodDays} Hari` : `${bookingPeriodMonths} Bulan`} Mulai Tgl: ${bookingCheckInDate}`
      });
    }

    // Refresh states and show printable receipt
    setShowReceipt(true);
    setSnapOpen(false);
    setActiveRoom(null);
    setCheckoutFlow('none');
    
    // Clear registration forms
    setSurveyForm({
      fullName: '',
      nik: '',
      email: '',
      phone: '',
      address: '',
      job: '',
      date: '',
      slot: '09:00 - 11:00',
      moveInDate: ''
    });
  };

  const handleSandboxPaymentFail = (status: 'expired' | 'failed' | 'cancelled') => {
    alert(`Pembayaran ditolak atau dibatalkan oleh partner Midtrans. Status: ${status.toUpperCase()}`);
    setSnapOpen(false);
  };

  const formatRupiah = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(num);
  };

  return (
    <div className="min-h-screen bg-brand-darker text-slate-100" id="user-website-container">
      
      {/* 1. Stunning Hero Exploration Panel */}
      <header className="relative bg-gradient-to-r from-brand-primary to-brand-darker text-white py-16 px-4 md:px-8 border-b border-brand-steel/20 shadow-inner overflow-hidden select-none">
        <div className="absolute inset-0 opacity-10 bg-cover bg-center" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80')" }} />
        <div className="max-w-7xl mx-auto relative z-10 text-center space-y-4">
          <div className="inline-flex items-center gap-2 bg-brand-beige/10 border border-brand-beige/20 px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wider text-brand-beige animate-pulse">
            <Sparkles size={13} />
            SAMARA STAY EXCLUSIVE LIVING
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold font-display tracking-tight leading-tight max-w-3xl mx-auto text-white">
            Hunian Kost Eksklusif, Setara Hotel Berbintang
          </h1>
          <p className="text-slate-250 text-sm md:text-base max-w-xl mx-auto font-light">
            Solusi sewa kamar kost bulanan dan harian dengan fasilitas terlengkap di Jakarta & Depok. Bebas ribet, aman, dan tanpa biaya tambahan.
          </p>

          {/* Inline filters */}
          <div className="bg-brand-primary/95 backdrop-blur-md rounded-2xl p-4 md:p-6 border border-brand-steel/35 w-full max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 text-slate-200 text-left mt-8">
            <div>
              <label className="block text-xs font-bold text-brand-beige/80 uppercase font-mono tracking-wider mb-1.5">Tipe Hunian</label>
              <div className="flex bg-brand-darker/60 p-1 rounded-xl border border-brand-steel/30">
                {['all', 'putra', 'putri', 'campur'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setSelectedType(t as any)}
                    className={`flex-1 text-center py-1.5 rounded-lg text-xs font-bold capitalize cursor-pointer transition-all ${
                      selectedType === t ? 'bg-brand-beige text-brand-darker shadow-lg font-extrabold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {t === 'all' ? 'Semua' : t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-brand-beige/80 uppercase font-mono tracking-wider mb-1.5">Filter Harga Bulan</label>
              <input 
                type="range" 
                min={1000000} 
                max={properties.length > 0 ? Math.max(20000000, ...properties.map(p => p.price)) : 20000000} 
                step={100000}
                value={priceRange} 
                onChange={(e) => setPriceRange(Number(e.target.value))}
                className="w-full h-1.5 bg-brand-darker/60 rounded-lg appearance-none cursor-pointer accent-brand-beige"
              />
              <div className="flex justify-between items-center text-xs text-slate-400 mt-1 font-mono">
                <span>Rp 1 Jt</span>
                <span className="font-bold text-brand-beige">Maks: {formatRupiah(priceRange)}</span>
              </div>
            </div>

            <div className="flex items-end">
              <div className="w-full bg-brand-darker/40 p-2 text-xs border border-dashed border-brand-steel/30 rounded-xl flex items-center gap-3">
                <Info size={16} className="text-brand-beige/80 shrink-0" />
                <span className="text-slate-350">Menampilkan <strong className="text-brand-beige">{filteredProperties.length} Properti</strong> terbaik yang tersedia sekarang.</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 2. Main Explore Listings Grid */}
      <main className="max-w-7xl mx-auto py-12 px-4 md:px-8 space-y-12">
        
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-4 border-brand-steel border-t-brand-beige rounded-full animate-spin" />
            <p className="text-xs text-brand-beige/85 font-mono">Membaca daftar kamar dari Supabase...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredProperties.map((p) => {
              const pRooms = rooms.filter(r => r.property_id === p.id);
              const availableCount = pRooms.filter(r => r.status === 'available').length;
              return (
                <div 
                  key={p.id} 
                  className="bg-brand-primary/90 rounded-3xl overflow-hidden shadow-lg border border-brand-steel/30 premium-card-hover flex flex-col shadow-black/10"
                >
                  <div className="relative h-56 bg-brand-darker select-none">
                    <img 
                      src={p.image_url} 
                      alt={p.name} 
                      className="w-full h-full object-cover opacity-85" 
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute top-4 left-4">
                      <span className={`px-3 py-1.5 rounded-full text-[10px] font-extrabold uppercase font-mono shadow-md ${
                        p.type === 'putri' 
                          ? 'bg-pink-500/20 text-pink-300 border border-pink-500/30' 
                          : p.type === 'putra' 
                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' 
                            : 'bg-brand-beige/20 text-brand-beige border border-brand-beige/30'
                      }`}>
                        KOS {p.type}
                      </span>
                    </div>

                    <div className="absolute bottom-4 right-4 bg-brand-primary/95 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-slate-200 shadow-sm flex items-center gap-1 border border-brand-steel/30">
                      <CheckCircle size={12} className="text-brand-beige" />
                      {availableCount} Kamar Kosong
                    </div>
                  </div>

                  <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                    <div>
                      <h3 className="text-lg font-bold text-white font-display hover:text-brand-beige transition-colors">{p.name}</h3>
                      
                      <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
                        <MapPin size={13} className="shrink-0 text-brand-beige/70" />
                        <span className="truncate">{p.address}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {p.facilities.slice(0, 4).map((f) => (
                        <span key={f} className="text-[10px] bg-brand-darker/60 text-slate-300 font-medium px-2 py-1 rounded-md border border-brand-steel/20">
                          {f}
                        </span>
                      ))}
                      {p.facilities.length > 4 && (
                        <span className="text-[10px] bg-brand-darker/60 text-slate-400 px-2 py-1 rounded-md">
                          +{p.facilities.length - 4} Lainnya
                        </span>
                      )}
                    </div>

                    <div className="border-t border-brand-steel/20 pt-4 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-slate-400 font-mono block uppercase">Mulai Dari</span>
                        <span className="text-base font-extrabold text-brand-beige font-display">{formatRupiah(p.price)}<span className="text-[10px] text-slate-400 font-semibold font-sans">/bln</span></span>
                      </div>

                      <button
                        onClick={() => {
                          setActiveProperty(p);
                          // Auto select first room of property
                          const matched = rooms.find(r => r.property_id === p.id && r.status === 'available');
                          if (matched) setActiveRoom(matched);
                        }}
                        className="bg-brand-beige hover:bg-brand-beige-hover text-brand-darker transition-all py-2 px-4 rounded-xl text-xs font-extrabold shadow-md cursor-pointer"
                      >
                        Lihat Kamar
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredProperties.length === 0 && (
              <div className="col-span-full py-16 text-center text-slate-400 space-y-3 bg-brand-primary/95 rounded-3xl border border-dashed border-brand-steel/30">
                <Compass className="mx-auto text-brand-beige" size={44} />
                <p className="text-sm font-medium">Tidak ada properti yang cocok dengan filter pencarian.</p>
              </div>
            )}
          </div>
        )}

      </main>

      {/* 3. Detailed Room Selection Dashboard */}
      {activeProperty && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-[80] p-4 text-sm font-sans" id="property-showroom-modal">
          <div className="bg-brand-primary border border-brand-steel/30 rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Showroom Header */}
            <div className="bg-brand-darker text-white p-5 md:p-6 flex items-start justify-between border-b border-brand-steel/30">
              <div>
                <span className="text-[10px] text-brand-beige font-mono uppercase tracking-wider block">SHOWROOM HUNIAN</span>
                <h2 className="text-lg md:text-xl font-bold font-display text-white">{activeProperty.name}</h2>
                <p className="text-xs text-slate-400 mt-0.5">{activeProperty.address}</p>
              </div>
              <button 
                onClick={() => {
                  setActiveProperty(null);
                  setActiveRoom(null);
                  setCheckoutFlow('none');
                }}
                className="text-slate-400 hover:text-white transition-colors bg-white/5 border border-brand-steel/20 p-1.5 rounded-lg text-xs cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            {/* Split Grid */}
            <div className="grid grid-cols-1 md:grid-cols-12 overflow-y-auto flex-1">
              
              {/* Left Column - Room list buttons */}
              <div className="md:col-span-4 border-r border-brand-steel/30 p-4 space-y-3 bg-brand-darker">
                <div className="text-xs text-brand-beige font-bold tracking-wider uppercase font-mono">Daftar Kamar Tersedia</div>
                
                {activePropertyRooms.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      if (r.status === 'available') {
                        setActiveRoom(r);
                        setCheckoutFlow('none');
                      }
                    }}
                    disabled={r.status !== 'available'}
                    className={`w-full p-4 rounded-2xl border text-left flex items-start justify-between transition-all ${
                      r.status !== 'available' 
                        ? 'bg-white/5 opacity-40 cursor-not-allowed border-white/5' 
                        : activeRoom?.id === r.id
                          ? 'border-brand-beige bg-brand-beige/15 shadow-md ring-1 ring-brand-beige'
                          : 'border-brand-steel/20 bg-brand-primary/50 text-slate-200 hover:border-brand-steel/40 hover:bg-brand-primary'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-white font-display flex items-center gap-1.5">
                        {r.room_number} <span className="text-[10px] font-semibold text-slate-400">({r.room_type})</span>
                      </div>
                      <div className="text-xs font-semibold text-brand-beige font-mono mt-1">{formatRupiah(r.price)}<span className="text-[9px] text-slate-400 font-sans">/bln</span></div>
                      
                      {r.is_daily_enabled && (
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">Harian: {formatRupiah(r.daily_price)}/hari</div>
                      )}
                    </div>

                    <div>
                      {r.status === 'available' ? (
                        <span className="text-[9px] font-extrabold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded-full uppercase">KOSONG</span>
                      ) : r.status === 'occupied' ? (
                        <span className="text-[9px] font-bold bg-white/5 text-slate-400 border border-white/10 px-1.5 py-0.5 rounded-full uppercase">TERISI</span>
                      ) : r.status === 'maintenance' ? (
                        <span className="text-[9px] font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-1.5 py-0.5 rounded-full uppercase">PERBAIKAN</span>
                      ) : (
                        <span className="text-[9px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1.5 py-0.5 rounded-full uppercase">RESERVED</span>
                      )}
                    </div>
                  </button>
                ))}

                {activePropertyRooms.length === 0 && (
                  <p className="text-xs text-slate-500 py-10 text-center font-mono">Maaf, properti tidak memiliki unit terdaftar.</p>
                )}
              </div>

              {/* Right Column - Room spec sheets & custom checkout actions */}
              <div className="md:col-span-8 p-6 space-y-6">
                {activeRoom ? (
                  <>
                    {/* Room spec heading */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-brand-steel/30 pb-5">
                      <div>
                        <div className="text-sm font-bold text-white font-display uppercase tracking-tight flex items-center gap-2">
                          <Compass className="text-brand-beige" size={16} /> Specifications Unit {activeRoom.room_number}
                        </div>
                        <p className="text-xs text-slate-400 mt-1">Lantai: {activeRoom.floor} / Ukuran: {activeRoom.size_sqm} m²</p>
                      </div>

                      <div className="flex gap-2">
                        {/* Survey trigger and Book sewa triggers */}
                        <button
                          onClick={() => {
                            setCheckoutFlow('survey');
                            // Ensure form has date
                            if (!surveyForm.date) {
                              setSurveyForm(s => ({ ...s, date: new Date(Date.now() + 2*24*3600*1000).toISOString().split('T')[0] }));
                            }
                          }}
                          className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                            checkoutFlow === 'survey' ? 'bg-brand-beige border-brand-beige text-brand-darker shadow-lg font-extrabold' : 'border-brand-steel/35 text-slate-300 hover:bg-white/5'
                          }`}
                        >
                          Booking survey (DP Rp 500rb)
                        </button>
                        
                        <button
                          onClick={() => setCheckoutFlow('monthly')}
                          className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                            checkoutFlow === 'monthly' ? 'bg-brand-beige border-brand-beige text-brand-darker shadow-lg font-extrabold' : 'border-brand-steel/35 text-slate-300 hover:bg-white/5'
                          }`}
                        >
                          Sewa Bulanan
                        </button>

                        {activeRoom.is_daily_enabled && (
                          <button
                            onClick={() => setCheckoutFlow('daily')}
                            className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                              checkoutFlow === 'daily' ? 'bg-brand-beige border-brand-beige text-brand-darker shadow-lg font-extrabold' : 'border-brand-steel/35 text-slate-300 hover:bg-white/5'
                            }`}
                          >
                            Sewa Harian
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Specifications Body depending on Checkout tab state */}
                    {checkoutFlow === 'none' && (
                      <div className="space-y-4">
                        <div className="text-xs text-slate-400 font-bold uppercase font-mono tracking-wider">Fasilitas Kamar Mandi & Unit</div>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          {activeRoom.facilities.map((f) => (
                            <div key={f} className="flex items-center gap-2 bg-brand-darker/60 p-2.5 rounded-xl border border-brand-steel/20">
                              <CheckCircle size={14} className="text-[#dacfa9]" />
                              <span className="font-medium text-slate-200">{f}</span>
                            </div>
                          ))}
                        </div>

                        <div className="bg-brand-beige/10 border border-brand-beige/20 rounded-2xl p-4 flex items-start gap-3 mt-4">
                          <Info size={16} className="text-brand-beige shrink-0 mt-0.5" />
                          <div className="text-xs text-slate-300 space-y-1">
                            <span className="font-bold text-brand-beige block">Sewa Tanpa Ribet</span>
                            <p>Sudah termasuk internet WiFi ultra-cepat, layanan sampah bulanan, pemeliharaan AC terjadwal gratis, dan pengamanan CCTV 24 Jam.</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* FLOW: SCHEDULER DP SURVEY FORM */}
                    {checkoutFlow === 'survey' && (
                      <form onSubmit={handleLaunchSurveyPayment} className="space-y-4 text-xs font-medium">
                        <div className="bg-brand-darker p-4 border border-brand-steel/20 rounded-2xl space-y-3">
                          <div className="flex items-center gap-2 text-brand-beige font-bold text-xs uppercase font-mono mb-2">
                            <Calendar size={14} /> Formulir Registrasi Jaminan Survey
                          </div>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-[10px] text-slate-400 font-bold font-mono tracking-wide uppercase mb-1">Nama Lengkap Sesuai KTP *</label>
                              <input 
                                type="text" 
                                required
                                value={surveyForm.fullName}
                                onChange={(e)=>setSurveyForm({...surveyForm, fullName: e.target.value})}
                                placeholder="e.g. Rizky Kurniadi" 
                                className="w-full p-2.5 rounded-xl border border-brand-steel/30 bg-brand-primary/40 text-slate-100 focus:outline-none focus:border-brand-beige focus:ring-1 focus:ring-brand-beige placeholder-slate-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-400 font-bold font-mono tracking-wide uppercase mb-1">NIK (Nomor Induk Kependudukan) *</label>
                              <input 
                                type="text" 
                                required
                                maxLength={16}
                                value={surveyForm.nik}
                                onChange={(e)=>setSurveyForm({...surveyForm, nik: e.target.value})}
                                placeholder="e.g. 3175XXXXXXXXXXXX" 
                                className="w-full p-2.5 rounded-xl border border-brand-steel/30 bg-brand-primary/40 text-slate-100 focus:outline-none focus:border-brand-beige focus:ring-1 focus:ring-brand-beige font-mono placeholder-slate-500"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-[10px] text-slate-400 font-bold font-mono tracking-wide uppercase mb-1">Email Aktif *</label>
                              <input 
                                type="email" 
                                required
                                value={surveyForm.email}
                                onChange={(e)=>setSurveyForm({...surveyForm, email: e.target.value})}
                                placeholder="e.g. rizky@gmail.com" 
                                className="w-full p-2.5 rounded-xl border border-brand-steel/30 bg-brand-primary/40 text-slate-100 focus:outline-none focus:border-brand-beige focus:ring-1 focus:ring-brand-beige placeholder-slate-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-400 font-bold font-mono tracking-wide uppercase mb-1">WhatsApp / No. Telpon *</label>
                              <input 
                                type="tel" 
                                required
                                value={surveyForm.phone}
                                onChange={(e)=>setSurveyForm({...surveyForm, phone: e.target.value})}
                                placeholder="e.g. 0812XXXXXXXX" 
                                className="w-full p-2.5 rounded-xl border border-brand-steel/30 bg-brand-primary/40 text-slate-100 focus:outline-none focus:border-brand-beige focus:ring-1 focus:ring-brand-beige placeholder-slate-500"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-[10px] text-slate-400 font-bold font-mono tracking-wide uppercase mb-1">Alamat Domisili Sekarang</label>
                              <input 
                                type="text" 
                                value={surveyForm.address}
                                onChange={(e)=>setSurveyForm({...surveyForm, address: e.target.value})}
                                placeholder="e.g. Kebayoran Lama, Jakarta" 
                                className="w-full p-2.5 rounded-xl border border-brand-steel/30 bg-brand-primary/40 text-slate-100 focus:outline-none focus:border-brand-beige focus:ring-1 focus:ring-brand-beige placeholder-slate-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-400 font-bold font-mono tracking-wide uppercase mb-1">Pekerjaan</label>
                              <input 
                                type="text" 
                                value={surveyForm.job}
                                onChange={(e)=>setSurveyForm({...surveyForm, job: e.target.value})}
                                placeholder="e.g. QA Consultant" 
                                className="w-full p-2.5 rounded-xl border border-brand-steel/30 bg-brand-primary/40 text-slate-100 focus:outline-none focus:border-brand-beige focus:ring-1 focus:ring-brand-beige placeholder-slate-500"
                              />
                            </div>
                          </div>

                          {/* Date slot section */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-brand-steel/20">
                            <div>
                              <label className="block text-[10px] text-slate-400 font-bold font-mono tracking-wide uppercase mb-1">Pilih Tanggal Survey *</label>
                              <input 
                                type="date" 
                                required
                                min={new Date(Date.now() + 24*3600*1000).toISOString().split('T')[0]}
                                value={surveyForm.date}
                                onChange={(e)=>setSurveyForm({...surveyForm, date: e.target.value})}
                                className="w-full p-2.5 rounded-xl border border-brand-steel/30 bg-brand-primary/40 text-slate-100 focus:outline-none focus:border-brand-beige focus:ring-1 focus:ring-brand-beige font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-400 font-bold font-mono tracking-wide uppercase mb-1">Pilih Waktu Slot *</label>
                              <select 
                                required
                                value={surveyForm.slot}
                                onChange={(e)=>setSurveyForm({...surveyForm, slot: e.target.value})}
                                className="w-full p-2.5 rounded-xl border border-brand-steel/30 bg-brand-primary/40 text-slate-100 focus:outline-none focus:border-brand-beige focus:ring-1 focus:ring-brand-beige font-mono"
                              >
                                <option value="09:00 - 11:00">Pagi (09:00 - 11:00)</option>
                                <option value="11:00 - 13:00">Siang (11:00 - 13:00)</option>
                                <option value="13:00 - 15:00">Sore Awal (13:00 - 15:00)</option>
                                <option value="15:00 - 17:00">Sore Akhir (15:00 - 17:00)</option>
                              </select>
                            </div>
                          </div>

                          <div>
                            <label className="block text-[10px] text-slate-400 font-bold font-mono tracking-wide uppercase mb-1">Rencana Mulai Masuk Kos (Move-In Date)</label>
                            <input 
                              type="date" 
                              value={surveyForm.moveInDate}
                              onChange={(e)=>setSurveyForm({...surveyForm, moveInDate: e.target.value})}
                              className="w-full p-2.5 rounded-xl border border-brand-steel/30 bg-brand-primary/40 text-slate-100 focus:outline-none focus:border-brand-beige focus:ring-1"
                            />
                          </div>

                        </div>

                        {/* Agreement details */}
                        <div className="bg-brand-beige/10 text-brand-beige border border-brand-beige/20 rounded-2xl p-4">
                          <div className="flex items-center gap-1.5 text-brand-beige font-bold mb-1 font-display">
                            <Clock size={14} /> Aturan DP Survey Kamar
                          </div>
                          <p className="text-[11px] leading-relaxed text-slate-300 font-normal">
                            {rules?.survey_rules || "DP Survey Rp 500.000 digunakan sebagai jaminan komitmen mengunci kamar pilihan Anda selama masa survey agar tidak ditawarkan ke pihak lain. Uang jaminan ini bersifat non-refundable jika Anda membatalkan secara sepihak atau No-Show."}
                          </p>
                        </div>

                        <button 
                          type="submit"
                          className="w-full bg-brand-beige text-brand-darker hover:bg-brand-beige-hover transition-colors font-extrabold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg cursor-pointer"
                        >
                          Bayar DP Survey Rp 500.000 via Midtrans SNAP
                        </button>
                      </form>
                    )}

                    {/* FLOW: MONTHLY / DAILY DIRECT BOOKING DISCOUNTS */}
                    {(checkoutFlow === 'monthly' || checkoutFlow === 'daily') && (
                      <form onSubmit={handleLaunchCheckoutPayment} className="space-y-4 text-xs font-semibold">
                        
                        <div className="bg-brand-darker p-4 border border-brand-steel/20 rounded-2xl space-y-3">
                          <div className="flex items-center gap-2 text-brand-beige font-bold text-xs uppercase font-mono mb-2">
                            <Pocket size={14} /> Informasi Rincian Sewa {checkoutFlow === 'monthly' ? 'Bulanan' : 'Harian'}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-[10px] text-slate-400 font-bold font-mono tracking-wide uppercase mb-1">Nama Lengkap Penyewa *</label>
                              <input 
                                type="text"
                                required
                                value={surveyForm.fullName}
                                onChange={(e)=>setSurveyForm({...surveyForm, fullName: e.target.value})}
                                placeholder="e.g. Siska Wardani"
                                className="w-full p-2.5 border border-brand-steel/30 rounded-xl bg-brand-primary/40 text-slate-100 placeholder-slate-500 focus:outline focus:outline-brand-beige focus:ring-1 focus:ring-brand-beige"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-400 font-bold font-mono tracking-wide uppercase mb-1">No WhatsApp Penyewa *</label>
                              <input 
                                type="tel"
                                required
                                value={surveyForm.phone}
                                onChange={(e)=>setSurveyForm({...surveyForm, phone: e.target.value})}
                                placeholder="e.g. 0812XXXXXXXX"
                                className="w-full p-2.5 border border-brand-steel/30 rounded-xl bg-brand-primary/40 text-slate-100 placeholder-slate-500 focus:outline focus:outline-brand-beige focus:ring-1 focus:ring-brand-beige"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-[10px] text-slate-400 font-bold font-mono tracking-wide uppercase mb-1">Mulai Masuk (Check-In Date) *</label>
                              <input 
                                type="date"
                                required
                                min={new Date().toISOString().split('T')[0]}
                                value={bookingCheckInDate}
                                onChange={(e)=>setBookingCheckInDate(e.target.value)}
                                className="w-full p-2.5 border border-brand-steel/30 rounded-xl bg-brand-primary/40 text-slate-100 focus:outline focus:outline-brand-beige focus:ring-1 focus:ring-brand-beige"
                              />
                            </div>

                            <div>
                              {checkoutFlow === 'monthly' ? (
                                <>
                                  <label className="block text-[10px] text-slate-400 font-bold font-mono tracking-wide uppercase mb-1 font-mono font-bold">Durasi Kontrak Sewa *</label>
                                  <select 
                                    value={bookingPeriodMonths}
                                    onChange={(e)=>setBookingPeriodMonths(Number(e.target.value))}
                                    className="w-full p-2.5 border border-brand-steel/30 rounded-xl bg-brand-primary/40 text-slate-100 focus:outline focus:outline-brand-beige focus:ring-1 focus:ring-brand-beige"
                                  >
                                    <option value={1}>1 Bulan</option>
                                    <option value={3}>3 Bulan (Diskon Anggota)</option>
                                    <option value={6}>6 Bulan (Bonus Spesial)</option>
                                    <option value={12}>12 Bulan (Harga Termurah)</option>
                                  </select>
                                </>
                              ) : (
                                <>
                                  <label className="block text-[10px] text-slate-400 font-bold tracking-wide uppercase mb-1 font-mono font-bold">Durasi Harian *</label>
                                  <input 
                                    type="number"
                                    min={1}
                                    max={30}
                                    value={bookingPeriodDays}
                                    onChange={(e)=>setBookingPeriodDays(Math.max(1, Number(e.target.value)))}
                                    className="w-full p-2.5 border border-brand-steel/30 rounded-xl bg-brand-primary/40 text-slate-100 focus:outline focus:outline-brand-beige focus:ring-1 focus:ring-brand-beige"
                                  />
                                </>
                              )}
                            </div>
                          </div>

                          {/* Promotional Coupons container */}
                          <div className="pt-2 border-t border-brand-steel/20 flex items-end gap-2">
                            <div className="flex-1">
                              <label className="block text-[10px] text-slate-400 font-bold font-mono tracking-wide uppercase mb-1">Gunakan Kode Voucher / Promo</label>
                              <input 
                                type="text"
                                placeholder="e.g. PROMOHEBAT atau SAMARA15"
                                value={couponInput}
                                onChange={(e)=>{
                                  setCouponInput(e.target.value);
                                  setCouponError('');
                                }}
                                className="w-full p-2.5 border border-brand-steel/30 rounded-xl bg-brand-primary/40 text-slate-100 placeholder-slate-500 font-mono focus:outline focus:outline-brand-beige focus:ring-1 focus:ring-brand-beige"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={handleApplyCoupon}
                              className="bg-brand-beige hover:bg-brand-beige-hover text-brand-darker px-4 py-2.5 font-extrabold rounded-xl text-xs transition-all cursor-pointer shrink-0 shadow-md"
                            >
                              Gunakan
                            </button>
                          </div>

                          {couponError && (
                            <p className="text-[11px] text-red-400 font-semibold font-sans">{couponError}</p>
                          )}

                          {appliedCoupon && (
                            <div className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-2 rounded-xl flex items-center justify-between text-xs font-medium">
                              <div>
                                <span className="font-extrabold uppercase">KUPON DIGUNAKAN: {appliedCoupon.code}</span>
                                <p className="text-[10px] text-slate-400">{appliedCoupon.description}</p>
                              </div>
                              <span className="font-bold text-emerald-400 text-sm flex items-center gap-1">
                                <Check size={16} /> Potong
                              </span>
                            </div>
                          )}

                        </div>

                        {/* Detailed Calculation specifications */}
                        <div className="bg-brand-darker p-4 border border-brand-steel/20 rounded-2xl text-xs space-y-2">
                          <div className="text-slate-400 font-extrabold uppercase font-mono tracking-wide text-[10px] mb-2">Rincian Faktur Biaya</div>
                          
                          <div className="flex justify-between items-center text-slate-300">
                            <span>Faktur Sewa Pokok ({checkoutFlow === 'daily' ? `${bookingPeriodDays} Hari` : `${bookingPeriodMonths} Bulan`})</span>
                            <span className="font-mono text-slate-100">{formatRupiah(bookingCalcs.rent)}</span>
                          </div>

                          {bookingCalcs.discount > 0 && (
                            <div className="flex justify-between items-center text-brand-beige font-bold">
                              <span>Diskon Promo Kupon</span>
                              <span className="font-mono">-{formatRupiah(bookingCalcs.discount)}</span>
                            </div>
                          )}

                          <div className="flex justify-between items-center text-slate-300">
                            <span>Pajak Kota PBJT Kost (10%)</span>
                            <span className="font-mono text-slate-100">{formatRupiah(bookingCalcs.tax)}</span>
                          </div>

                          <div className="flex justify-between items-center text-slate-300">
                            <span>Uang Jaminan Deposit Kosan (Refundable)</span>
                            <span className="font-mono text-slate-100">{formatRupiah(bookingCalcs.deposit)}</span>
                          </div>

                          <div className="border-t border-brand-steel/20 pt-3 flex justify-between items-center text-white font-extrabold text-sm font-display">
                            <span>TOTAL PELUNASAN CHECKOUT</span>
                            <span className="text-brand-beige font-mono text-base">{formatRupiah(bookingCalcs.total)}</span>
                          </div>
                        </div>

                        <button 
                          type="submit"
                          className="w-full bg-brand-beige text-brand-darker hover:bg-brand-beige-hover transition-colors font-extrabold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg cursor-pointer"
                        >
                          Selesaikan Sewa via Midtrans SNAP Gateway
                        </button>
                      </form>
                    )}

                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center py-20 space-y-3 font-medium text-slate-500">
                    <Compass size={40} />
                    <p className="text-xs">Pilih salah satu nomor kamar di kolom kiri untuk meluncurkan rincian spec dan booking.</p>
                  </div>
                )}
              </div>

            </div>

          </div>
        </div>
      )}

      {/* 4. Double-entry receipt invoice modal printable */}
      {showReceipt && receiptData && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-[110] p-4 text-sm font-sans" id="invoice-printable-modal">
          <div className="bg-brand-primary border border-brand-steel/30 rounded-3xl shadow-2xl p-6 md:p-8 w-full max-w-lg space-y-6 flex flex-col justify-between">
            
            {/* Top header block */}
            <div className="flex items-center justify-between border-b border-brand-steel/20 pb-4">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-white font-display">SAMARA</span>
                <span className="font-extrabold text-brand-beige font-display">STAY</span>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold font-mono uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20`}>
                TERIMA BAYAR - LUNAS
              </span>
            </div>

            {/* Invoice Spec */}
            <div className="text-xs space-y-4 font-medium" id="voucher-printable">
              <div className="space-y-1 text-slate-400 font-mono text-[10px]">
                <div>NO INVOICE: <span className="font-bold text-white">{receiptData.id}</span></div>
                <div>TANGGAL SETTLE: <span className="font-semibold text-white">{receiptData.date}</span></div>
              </div>

              <div className="p-4 bg-brand-darker border border-brand-steel/20 rounded-2xl space-y-2">
                <div className="text-[10px] text-brand-beige uppercase tracking-wider font-extrabold font-mono">Informasi Penghuni</div>
                <div className="font-extrabold text-white text-sm">{receiptData.name}</div>
                <div className="text-slate-300">Kamar: Unit {receiptData.roomNo} - {receiptData.propertyName}</div>
                <div className="text-[10px] text-slate-400 font-normal">{receiptData.details}</div>
              </div>

              <div className="space-y-2 font-semibold">
                <div className="flex justify-between items-center text-slate-400 border-b border-brand-steel/10 pb-2">
                   <span>METODE TRANSFER</span>
                  <span className="font-bold text-white">{receiptData.method}</span>
                </div>
                <div className="flex justify-between items-center text-white font-bold text-base font-display">
                  <span>JUMLAH NOMINAL</span>
                  <span className="text-brand-beige font-mono">{formatRupiah(receiptData.amountPaid)}</span>
                </div>
              </div>

              {/* Informational warning */}
              <div className="bg-brand-darker/60 rounded-2xl p-4 flex gap-3 text-slate-400 text-[11px] leading-relaxed font-normal border border-dashed border-brand-steel/25">
                <Info size={16} className="text-brand-beige shrink-0 mt-0.5" />
                <div>
                  Kwitansi digital ini sah dikeluarkan oleh Samara Stay Core Engine secara otomatis. Anda akan menerima notifikasi konfirmasi di WhatsApp berisikan kode akses fisik pintu kamar pada hari check-in.
                </div>
              </div>
            </div>

            {/* Actions triggers */}
            <div className="flex gap-3">
              <button
                onClick={() => window.print()}
                className="flex-1 border border-brand-steel/30 hover:bg-white/5 transition-colors rounded-xl py-2.5 font-bold text-xs text-slate-300 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Printer size={14} /> Cetak Kwitansi
              </button>
              <button
                onClick={() => setShowReceipt(false)}
                className="flex-1 bg-brand-beige hover:bg-brand-beige-hover text-brand-darker transition-colors rounded-xl py-2.5 font-extrabold text-xs flex items-center justify-center cursor-pointer shadow-md"
              >
                Tutup Selesai
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Midtrans Modal Injector */}
      {snapOpen && snapPaymentContext && (
        <MidtransSimulator
          isOpen={snapOpen}
          onClose={() => setSnapOpen(false)}
          orderId={snapPaymentContext.orderId}
          grossAmount={snapPaymentContext.grossAmount}
          itemDescription={snapPaymentContext.description}
          customerDetails={{
            name: surveyForm.fullName || 'Tamu Mandiri',
            email: surveyForm.email || 'tamu@mail.com',
            phone: surveyForm.phone || '0812XXXXXXXX'
          }}
          onPaymentSuccess={handleSandboxPaymentSuccess}
          onPaymentPending={handleSandboxPaymentPending}
          onPaymentFail={handleSandboxPaymentFail}
        />
      )}

    </div>
  );
}
