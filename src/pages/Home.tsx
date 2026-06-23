import React, { useState, useEffect } from 'react';
import { database } from '../lib/supabase';
import { Property, Room, Booking, Survey, Coupon } from '../types';
import BookingForm from '../components/transaction/BookingForm';
import InvoiceCard from '../components/transaction/InvoiceCard';
import Loader from '../components/common/Loader';
import Modal from '../components/common/Modal';
import MidtransSimulator from '../components/MidtransSimulator';
import { 
  Sparkles, HelpCircle, Phone, BookOpen, Clock, HardDrive, Shield,
  MapPin, Wifi, Zap, ChevronLeft, Building2, Search, Calendar, Map, 
  User, CheckCircle, Heart, Tv, Utensils, Car, Info, X, Bed, RotateCw, 
  Play, Volume2, ArrowRight, Star, AlertCircle, ChevronRight, MapPinned,
  Shirt, Sparkle, Compass, Grid, MapIcon, CompassIcon, InfoIcon
} from 'lucide-react';

interface HomeProps {
  refreshTrigger: number;
  triggerAppRefresh?: () => void;
}

export default function Home({ refreshTrigger, triggerAppRefresh }: HomeProps) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);

  // Core Page Navigation State
  const [userPage, setUserPage] = useState<'home' | 'search' | 'detail'>('home');

  // Homepage Search Form States
  const [searchLocation, setSearchLocation] = useState<string>('');
  const [searchCheckInDate, setSearchCheckInDate] = useState<string>(
    new Date(Date.now() + 86400000).toISOString().split('T')[0] // Default to tomorrow
  );
  const [searchDurationType, setSearchDurationType] = useState<'monthly' | 'daily'>('monthly');

  // Filters State (Connected with Search catalogue page)
  const [selectedType, setSelectedType] = useState<'all' | 'putra' | 'putri' | 'campur'>('all');
  const [priceRange, setPriceRange] = useState<number>(15000000);
  const [selectedRoomFacilities, setSelectedRoomFacilities] = useState<string[]>([]);
  const [selectedSharedFacilities, setSelectedSharedFacilities] = useState<string[]>([]);

  // Selected contexts for active workflows
  const [activeProperty, setActiveProperty] = useState<Property | null>(null);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [checkoutFlow, setCheckoutFlow] = useState<'none' | 'survey' | 'monthly' | 'daily'>('none');

  // Interactive Stylized Map states
  const [selectedMapProperty, setSelectedMapProperty] = useState<Property | null>(null);
  const [hoveredPropertyId, setHoveredPropertyId] = useState<number | null>(null);

  // Virtual Tour State
  const [virtualTourOpen, setVirtualTourOpen] = useState(false);
  const [virtualTourOffset, setVirtualTourOffset] = useState(50); // percentage scroll offset
  const [isDraggingTour, setIsDraggingTour] = useState(false);
  const [startX, setStartX] = useState(0);

  // Completed receipt state
  const [showReceipt, setShowReceipt] = useState<boolean>(false);
  const [receiptData, setReceiptData] = useState<any | null>(null);

  // Survey Form states
  const [surveyForm, setSurveyForm] = useState({
    fullName: 'Yogi Atmaja',
    nik: '3174092803930005',
    email: 'yogiatmaja26@gmail.com',
    phone: '081293840293',
    address: 'Sleman, D.I. Yogyakarta',
    job: 'Software Engineer',
    date: new Date(Date.now() + 86400000).toISOString().split('T')[0], // tomorrow
    slot: '13:00 - 15:00',
    moveInDate: ''
  });

  // Booking Form states
  const [bookingForm, setBookingForm] = useState({
    fullName: 'Yogi Atmaja',
    phone: '081293840293',
    email: 'yogiatmaja26@gmail.com',
    nik: '3174092803930005'
  });

  // Booking details states
  const [bookingPeriodMonths, setBookingPeriodMonths] = useState<number>(1);
  const [bookingPeriodDays, setBookingPeriodDays] = useState<number>(1);
  const [bookingCheckInDate, setBookingCheckInDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [couponInput, setCouponInput] = useState<string>('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState<string>('');

  // Midtrans simulator states
  const [snapOpen, setSnapOpen] = useState(false);
  const [snapPaymentContext, setSnapPaymentContext] = useState<any | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [propsData, roomsData, couponsData] = await Promise.all([
          database.fetchProperties(),
          database.fetchRooms(),
          database.fetchCoupons()
        ]);
        setProperties(propsData);
        setRooms(roomsData);
        setCoupons(couponsData);
        if (propsData && propsData.length > 0) {
          const maxPriceVal = Math.max(...propsData.map(p => p.price));
          setPriceRange(Math.max(5000000, maxPriceVal));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [refreshTrigger]);

  const handleApplyCoupon = () => {
    setCouponError('');
    setAppliedCoupon(null);
    if (!couponInput.trim()) return;

    const validated = coupons.find(c => c.code.toUpperCase() === couponInput.toUpperCase());
    if (!validated || !validated.is_active) {
      setCouponError('Kode promo salah atau sudah kedaluwarsa.');
      return;
    }

    if (checkoutFlow === 'monthly' && validated.min_duration_months && bookingPeriodMonths < validated.min_duration_months) {
      setCouponError(`Kode promo hanya berlaku untuk sewa minimal ${validated.min_duration_months} bulan.`);
      return;
    }

    setAppliedCoupon(validated);
  };

  const handleSelectRoom = (room: Room, flowType: 'monthly' | 'daily' | 'survey') => {
    setActiveRoom(room);
    setCheckoutFlow(flowType);
  };

  const handleProceedToPayment = async (calculatedTotal: number) => {
    if (checkoutFlow !== 'survey' && !bookingCheckInDate) {
      alert("Mohon tentukan tanggal mulai huni / check-in terlebih dahulu.");
      return;
    }

    const orderId = `${checkoutFlow === 'survey' ? 'SRV' : 'BOOK'}-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
    const description = checkoutFlow === 'survey' ? `DP Survey Kamar ${activeRoom?.room_number}` : `Sewa Unit ${activeRoom?.room_number}`;
    
    const customerDetails = {
      name: checkoutFlow === 'survey' ? surveyForm.fullName : bookingForm.fullName,
      email: checkoutFlow === 'survey' ? surveyForm.email : bookingForm.email,
      phone: checkoutFlow === 'survey' ? surveyForm.phone : bookingForm.phone,
    };

    setLoading(true);

    try {
      const { loadMidtransSnapScript, requestSnapTokenFromServer } = await import('../lib/midtrans');
      
      const chargeResult = await requestSnapTokenFromServer({
        orderId,
        grossAmount: calculatedTotal,
        description,
        customerDetails
      });

      await loadMidtransSnapScript(chargeResult.mode === 'sandbox');
      setLoading(false);

      if ((chargeResult.mode === 'production' || chargeResult.mode === 'sandbox') && (window as any).snap) {
        setSnapPaymentContext({
          orderId,
          grossAmount: calculatedTotal,
          description
        });

        // Pre-save pending survey or booking record to Supabase
        try {
          if (checkoutFlow === 'survey') {
            const surveyRecord: Partial<Survey> = {
              tenant_name: surveyForm.fullName,
              nik: surveyForm.nik,
              email: surveyForm.email,
              phone: surveyForm.phone,
              address: surveyForm.address,
              job: surveyForm.job,
              planned_move_in_date: surveyForm.moveInDate || '',
              property_id: activeProperty!.id,
              room_number: activeRoom!.room_number,
              survey_date: surveyForm.date,
              survey_time_slot: surveyForm.slot,
              status: 'pending_payment',
              dp_amount: 500000,
              payment_method: 'Midtrans SNAP',
              invoice_id: `INV-SRV-${Math.floor(1000 + Math.random() * 9000)}`,
              reservation_number: orderId
            };
            await database.saveSurvey(surveyRecord);
          } else {
            const isDaily = checkoutFlow === 'daily';
            const discount = appliedCoupon ? ((appliedCoupon.discount_type === 'nominal' || appliedCoupon.discount_type === 'fixed') ? appliedCoupon.discount_value : Math.round((activeRoom!.price * appliedCoupon.discount_value) / 100)) : 0;
            
            const bookingRecord: Partial<Booking> = {
              property_id: activeProperty!.id,
              room_id: activeRoom!.id,
              room_number: activeRoom!.room_number,
              tenant_name: bookingForm.fullName,
              phone: bookingForm.phone,
              email: bookingForm.email,
              nik: bookingForm.nik,
              booking_date: new Date().toISOString().split('T')[0],
              check_in_date: bookingCheckInDate,
              duration_months: isDaily ? 0 : bookingPeriodMonths,
              booking_type: isDaily ? 'daily' : 'monthly',
              duration_days: isDaily ? bookingPeriodDays : undefined,
              total_price: calculatedTotal,
              status: 'pending',
              payment_method: 'Midtrans SNAP',
              midtrans_order_id: orderId,
              is_dp: false,
              coupon_code: appliedCoupon ? appliedCoupon.code : null,
              discount_amount: discount
            };
            await database.saveBooking(bookingRecord);
          }
        } catch (dbErr) {
          console.warn('Silent database pre-save warning:', dbErr);
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
                message: 'Customer successfully completed transaction in Midtrans Snap popup.',
                details: result,
                amount: calculatedTotal
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
                message: 'Customer payment is pending/awaiting settlement.',
                details: result,
                amount: calculatedTotal
              })
            }).catch(() => {});

            handleSandboxPaymentPending({
              transactionId: result.transaction_id || `mid-${Math.floor(Math.random() * 100000000)}`,
              paymentMethod: result.payment_type || 'Midtrans SNAP',
              settlementTime: result.transaction_time || new Date().toISOString().replace('T', ' ').slice(0, 19)
            });
            alert('Pembayaran Anda pending/menunggu penyelesaian di portal Midtrans.');
          },
          onError: (result: any) => {
            fetch('/api/midtrans/logs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orderId,
                status: 'failed',
                type: 'client_event',
                message: 'Customer payment failed during Snap popup workflow.',
                details: result,
                amount: calculatedTotal
              })
            }).catch(() => {});

            alert('Pembayaran Midtrans gagal diproses.');
          },
          onClose: () => {
            fetch('/api/midtrans/logs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orderId,
                status: 'closed',
                type: 'client_event',
                message: 'Customer manually closed the Midtrans Snap popup window.',
                amount: calculatedTotal
              })
            }).catch(() => {});

            alert('Pemesan menutup popup pembayaran Midtrans sebelum selesai.');
          }
        });
      } else {
        setSnapPaymentContext({
          orderId,
          grossAmount: calculatedTotal,
          description
        });
        setSnapOpen(true);
      }
    } catch (err: any) {
      setLoading(false);
      console.error(err);
      setSnapPaymentContext({
        orderId,
        grossAmount: calculatedTotal,
        description
      });
      setSnapOpen(true);
    }
  };

  const handleSandboxPaymentPending = async (details: any) => {
    if (!activeRoom || !activeProperty || !snapPaymentContext) return;

    if (checkoutFlow === 'survey') {
      const surveyRecord: Partial<Survey> = {
        tenant_name: surveyForm.fullName,
        nik: surveyForm.nik,
        email: surveyForm.email,
        phone: surveyForm.phone,
        address: surveyForm.address,
        job: surveyForm.job,
        planned_move_in_date: surveyForm.moveInDate || '',
        property_id: activeProperty.id,
        room_number: activeRoom.room_number,
        survey_date: surveyForm.date,
        survey_time_slot: surveyForm.slot,
        status: 'pending_payment',
        dp_amount: 500000,
        payment_method: details.paymentMethod,
        invoice_id: `INV-SRV-${Math.floor(1000 + Math.random() * 9000)}`
      };

      const saved = await database.saveSurvey(surveyRecord);

      const pendingInvoice = {
        id: saved.invoice_id || `INV-SRV-${Math.floor(1000 + Math.random() * 9000)}`,
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
        id: saved.invoice_id || '999',
        name: surveyForm.fullName,
        roomNo: activeRoom.room_number,
        propertyName: activeProperty.name,
        amountPaid: 500000,
        method: details.paymentMethod,
        date: surveyForm.date,
        details: 'Pembayaran DP Survey tertunda / pending.'
      });
    } else {
      const isDaily = checkoutFlow === 'daily';
      const discount = appliedCoupon ? ((appliedCoupon.discount_type === 'nominal' || appliedCoupon.discount_type === 'fixed') ? appliedCoupon.discount_value : Math.round((activeRoom.price * appliedCoupon.discount_value) / 100)) : 0;
      
      const bookingRecord: Partial<Booking> = {
        property_id: activeProperty.id,
        room_id: activeRoom.id,
        room_number: activeRoom.room_number,
        tenant_name: bookingForm.fullName,
        phone: bookingForm.phone,
        email: bookingForm.email,
        nik: bookingForm.nik,
        booking_date: new Date().toISOString().split('T')[0],
        check_in_date: bookingCheckInDate,
        duration_months: isDaily ? 0 : bookingPeriodMonths,
        booking_type: isDaily ? 'daily' : 'monthly',
        duration_days: isDaily ? bookingPeriodDays : undefined,
        total_price: snapPaymentContext.grossAmount,
        status: 'pending',
        payment_method: details.paymentMethod,
        midtrans_order_id: snapPaymentContext.orderId,
        is_dp: false,
        coupon_code: appliedCoupon ? appliedCoupon.code : null,
        discount_amount: discount
      };

      const updatedRoom: Room = { 
        ...activeRoom, 
        status: 'reserved', 
        current_tenant_name: bookingForm.fullName 
      };
      await database.saveRoom(updatedRoom);

      const saved = await database.saveBooking(bookingRecord);

      const pendingInvoice = {
        id: `INV-${Math.floor(1000 + Math.random() * 9000)}`,
        tenant_name: bookingForm.fullName,
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
        id: saved.midtrans_order_id || '999',
        name: bookingForm.fullName,
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

  const handleSandboxPaymentSuccess = async (details: any) => {
    if (!activeRoom || !activeProperty || !snapPaymentContext) return;

    if (checkoutFlow === 'survey') {
      const surveyRecord: Partial<Survey> = {
        tenant_name: surveyForm.fullName,
        nik: surveyForm.nik,
        email: surveyForm.email,
        phone: surveyForm.phone,
        address: surveyForm.address,
        job: surveyForm.job,
        planned_move_in_date: surveyForm.moveInDate || '',
        property_id: activeProperty.id,
        room_number: activeRoom.room_number,
        survey_date: surveyForm.date,
        survey_time_slot: surveyForm.slot,
        status: 'survey_confirmed',
        dp_amount: 500000,
        payment_method: details.paymentMethod,
        invoice_id: `INV-SRV-${Math.floor(1000 + Math.random() * 9000)}`
      };

      const saved = await database.saveSurvey(surveyRecord);

      setReceiptData({
        type: 'survey',
        id: saved.invoice_id || '999',
        name: surveyForm.fullName,
        roomNo: activeRoom.room_number,
        propertyName: activeProperty.name,
        amountPaid: 500000,
        method: details.paymentMethod,
        date: surveyForm.date,
        details: 'Pembayaran DP Survey Sah.'
      });
    } else {
      const isDaily = checkoutFlow === 'daily';
      const discount = appliedCoupon ? ((appliedCoupon.discount_type === 'nominal' || appliedCoupon.discount_type === 'fixed') ? appliedCoupon.discount_value : Math.round((activeRoom.price * appliedCoupon.discount_value) / 100)) : 0;
      
      const bookingRecord: Partial<Booking> = {
        property_id: activeProperty.id,
        room_id: activeRoom.id,
        room_number: activeRoom.room_number,
        tenant_name: bookingForm.fullName,
        phone: bookingForm.phone,
        email: bookingForm.email,
        nik: bookingForm.nik,
        booking_date: new Date().toISOString().split('T')[0],
        check_in_date: bookingCheckInDate,
        duration_months: isDaily ? 0 : bookingPeriodMonths,
        booking_type: isDaily ? 'daily' : 'monthly',
        duration_days: isDaily ? bookingPeriodDays : undefined,
        total_price: snapPaymentContext.grossAmount,
        status: 'approved',
        payment_method: details.paymentMethod,
        midtrans_order_id: snapPaymentContext.orderId,
        is_dp: false,
        coupon_code: appliedCoupon ? appliedCoupon.code : null,
        discount_amount: discount
      };

      // Set room status to occupied if direct booking
      const updatedRoom: Room = { 
        ...activeRoom, 
        status: 'occupied', 
        current_tenant_name: bookingForm.fullName 
      };
      await database.saveRoom(updatedRoom);

      const saved = await database.saveBooking(bookingRecord);

      setReceiptData({
        type: 'booking',
        id: saved.midtrans_order_id || '999',
        name: bookingForm.fullName,
        roomNo: activeRoom.room_number,
        propertyName: activeProperty.name,
        amountPaid: snapPaymentContext.grossAmount,
        method: details.paymentMethod,
        date: new Date().toISOString().split('T')[0],
        details: 'Bukti lunas kontrak sewa sepihak.'
      });
    }

    setSnapOpen(false);
    setShowReceipt(true);
    triggerAppRefresh?.();
  };

  const handleSearchTrigger = (e: React.FormEvent) => {
    e.preventDefault();
    setSelectedType('all');
    setUserPage('search');
  };

  // Filter properties based on the search inputs + advanced sidebar filter
  const filteredProperties = properties.filter(p => {
    const matchLocation = !searchLocation.trim() || 
      p.address.toLowerCase().includes(searchLocation.toLowerCase()) || 
      p.name.toLowerCase().includes(searchLocation.toLowerCase());

    const matchType = selectedType === 'all' || p.type === selectedType;
    const matchPrice = p.price <= priceRange;

    // Advanced facilities filters
    const matchRoomFac = selectedRoomFacilities.length === 0 ||
      selectedRoomFacilities.every(f => 
        rooms.filter(r => r.property_id === p.id).some(r => 
          r.facilities.some(rf => rf.toLowerCase().includes(f.toLowerCase()))
        )
      );

    const matchSharedFac = selectedSharedFacilities.length === 0 ||
      selectedSharedFacilities.every(f => 
        p.facilities.some(pf => pf.toLowerCase().includes(f.toLowerCase()))
      );

    return matchLocation && matchType && matchPrice && matchRoomFac && matchSharedFac;
  });

  const formatRupiah = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(num);
  };

  // Helper to interpolate Lat/Lng to visual % for the Interactive Stylized Map
  const getMapCoords = (prop: Property) => {
    const lats = properties.map(p => p.lat || -6.2).filter(Boolean);
    const lngs = properties.map(p => p.lng || 106.8).filter(Boolean);
    if (lats.length === 0 || lngs.length === 0) {
      return { x: 50, y: 50 };
    }
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const latRange = maxLat - minLat || 1;
    const lngRange = maxLng - minLng || 1;

    // Map to 15% - 85% to keep markers safe inside grid borders
    const x = 15 + 70 * ((prop.lng || 106.8) - minLng) / lngRange;
    const y = 85 - 70 * ((prop.lat || -6.2) - minLat) / latRange; // Invert lat
    return { x, y };
  };

  // Virtual Tour Drag logic
  const handlePanoMouseDown = (e: React.MouseEvent) => {
    setIsDraggingTour(true);
    setStartX(e.pageX - virtualTourOffset * 5);
  };

  const handlePanoMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingTour) return;
    const x = e.pageX;
    const walk = (x - startX) / 5;
    const newOffset = Math.max(0, Math.min(100, walk));
    setVirtualTourOffset(newOffset);
  };

  const handlePanoMouseUpOrLeave = () => {
    setIsDraggingTour(false);
  };

  if (loading) {
    return <Loader label="Memuat platform Samara Stay..." />;
  }

  return (
    <div className="bg-[#09090b] min-h-screen text-slate-100 font-sans pb-16">
      
      {/* Dynamic Sub-header Navigation Bar */}
      <div className="bg-[#121215] border-b border-slate-800 sticky top-[65px] z-40 px-4 md:px-8 py-3.5 shadow-md flex justify-between items-center text-xs">
        <div className="flex items-center gap-1.5 md:gap-3">
          <button 
            onClick={() => {
              setUserPage('home');
              setActiveProperty(null);
            }} 
            className={`font-semibold px-3 py-1.5 rounded-lg transition-all ${userPage === 'home' ? 'bg-amber-500/10 text-amber-500 font-extrabold border border-amber-500/20' : 'text-slate-400 hover:text-white'}`}
          >
            Beranda
          </button>
          <button 
            onClick={() => {
              setUserPage('search');
              setActiveProperty(null);
            }} 
            className={`font-semibold px-3 py-1.5 rounded-lg transition-all ${userPage === 'search' ? 'bg-amber-500/10 text-amber-500 font-extrabold border border-amber-500/20' : 'text-slate-400 hover:text-white'}`}
          >
            Cari & Sewa Kosan
          </button>
          {activeProperty && (
            <div className="flex items-center gap-2 text-slate-500">
              <ChevronRight size={12} />
              <span className="text-amber-500 font-bold bg-amber-500/5 px-2.5 py-1 rounded-md border border-amber-500/10">{activeProperty.name}</span>
            </div>
          )}
        </div>

        <div className="hidden sm:flex items-center gap-2 text-slate-400 font-mono text-[10px]">
          <Sparkles size={12} className="text-amber-500 animate-pulse" />
          <span>GARANSI HARGA ALL-INCLUSIVE JUJUR</span>
        </div>
      </div>

      {/* ========================================================== */}
      {/* VIEW 1: HOME PAGE / LANDING PAGE */}
      {/* ========================================================== */}
      {userPage === 'home' && (
        <div className="space-y-16 animate-fade-in">
          
          {/* Hero Section & Large Search Bar */}
          <div className="relative py-24 px-4 md:px-8 bg-gradient-to-br from-[#121215] via-[#1c1917] to-[#09090b] border-b border-slate-800 overflow-hidden">
            <div className="absolute inset-0 opacity-15 bg-cover bg-center select-none" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=1200&q=80')" }} />
            <div className="max-w-6xl mx-auto relative z-10 text-center space-y-6">
              
              <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wider text-amber-400 animate-pulse">
                <Sparkle size={13} className="fill-amber-400" />
                SAMARA STAY EXCLUSIVE
              </div>

              <h1 className="text-4xl md:text-6xl font-black font-display tracking-tight leading-tight max-w-4xl mx-auto text-white">
                Hunian Modern, <span className="text-amber-500">Bebas Ribet</span>
              </h1>
              
              <p className="text-slate-400 text-sm md:text-base max-w-2xl mx-auto font-light leading-relaxed">
                Platform sewa kos eksklusif dengan sistem all-inclusive. Lengkap dengan Wi-Fi, listrik gratis, laundry, housekeeping berkala, tanpa biaya tambahan admin.
              </p>

              {/* Large Interactive Search Bar */}
              <form onSubmit={handleSearchTrigger} className="bg-[#121215]/95 backdrop-blur-md rounded-3xl p-5 md:p-6 border border-slate-800 w-full max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-4 text-left shadow-2xl mt-12">
                
                <div>
                  <label className="block text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1.5 font-mono">PILIH LOKASI / KOTA</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 text-slate-500" size={16} />
                    <select
                      value={searchLocation}
                      onChange={(e) => setSearchLocation(e.target.value)}
                      className="w-full bg-slate-900/80 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-xs font-medium text-slate-200 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 cursor-pointer"
                    >
                      <option value="">Semua Lokasi / Kota</option>
                      <option value="Jakarta Selatan">Jakarta Selatan</option>
                      <option value="Jakarta Barat">Jakarta Barat</option>
                      <option value="Depok">Depok</option>
                      <option value="Jakarta">DKI Jakarta</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1.5 font-mono">TANGGAL MASUK</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-3 text-slate-500" size={16} />
                    <input 
                      type="date"
                      value={searchCheckInDate}
                      onChange={(e) => setSearchCheckInDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full bg-slate-900/80 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1.5 font-mono">DURASI & TIPE SEWA</label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-3 text-slate-500" size={16} />
                    <select
                      value={searchDurationType}
                      onChange={(e) => setSearchDurationType(e.target.value as any)}
                      className="w-full bg-slate-900/80 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-xs font-medium text-slate-200 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 cursor-pointer"
                    >
                      <option value="monthly">Bulanan (Kontrak Fleksibel)</option>
                      <option value="daily">Harian (Transit & Liburan)</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full bg-amber-500 hover:bg-amber-600 text-black font-black py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer shadow-amber-500/10"
                  >
                    <Search size={15} />
                    CARI KOS SEKARANG
                  </button>
                </div>

              </form>

            </div>
          </div>

          {/* Keunggulan Utama (Value Proposition) */}
          <div className="max-w-6xl mx-auto px-4 text-center space-y-10">
            <div className="space-y-3">
              <span className="text-[10px] font-extrabold text-amber-500 tracking-widest uppercase font-mono bg-amber-500/5 px-3 py-1 rounded-md border border-amber-500/10">Value Proposition</span>
              <h2 className="text-2xl md:text-3xl font-black text-white">Semua Kebutuhan Sudah All-Inclusive</h2>
              <p className="text-slate-400 text-xs md:text-sm max-w-xl mx-auto font-light">
                Tinggal bawa koper. Anda tidak akan pernah ditagih biaya admin siluman atau pusing dengan urusan tagihan utilitas terpisah.
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              
              <div className="bg-[#121215] border border-slate-800/80 p-6 rounded-2xl space-y-3 flex flex-col items-center shadow-md">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                  <Wifi size={20} />
                </div>
                <h4 className="font-extrabold text-white text-xs">Free Wi-Fi</h4>
                <p className="text-[11px] text-slate-450 leading-relaxed font-light">Koneksi berkecepatan tinggi di setiap sudut gedung.</p>
              </div>

              <div className="bg-[#121215] border border-slate-800/80 p-6 rounded-2xl space-y-3 flex flex-col items-center shadow-md">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                  <Zap size={20} />
                </div>
                <h4 className="font-extrabold text-white text-xs">Termasuk Listrik</h4>
                <p className="text-[11px] text-slate-450 leading-relaxed font-light">Bebas AC seharian tanpa takut tagihan bulanan membengkak.</p>
              </div>

              <div className="bg-[#121215] border border-slate-800/80 p-6 rounded-2xl space-y-3 flex flex-col items-center shadow-md">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                  <Shirt size={20} />
                </div>
                <h4 className="font-extrabold text-white text-xs">Gratis Laundry</h4>
                <p className="text-[11px] text-slate-450 leading-relaxed font-light">Layanan cuci gosok pakaian mingguan tanpa repot.</p>
              </div>

              <div className="bg-[#121215] border border-slate-800/80 p-6 rounded-2xl space-y-3 flex flex-col items-center shadow-md">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                  <Sparkles size={20} />
                </div>
                <h4 className="font-extrabold text-white text-xs">Housecleaning</h4>
                <p className="text-[11px] text-slate-450 leading-relaxed font-light">Pembersihan kamar berkala oleh tim housekeeping profesional.</p>
              </div>

              <div className="bg-[#121215] border border-slate-800/80 p-6 rounded-2xl space-y-3 flex flex-col items-center shadow-md col-span-2 md:col-span-1">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                  <CheckCircle size={20} />
                </div>
                <h4 className="font-extrabold text-white text-xs">Bebas Biaya Admin</h4>
                <p className="text-[11px] text-slate-450 leading-relaxed font-light">Pembayaran transparan jujur sesuai nominal tertera.</p>
              </div>

            </div>
          </div>

          {/* Rekomendasi Properti Terpopuler */}
          <div className="max-w-6xl mx-auto px-4 space-y-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-slate-800 pb-5">
              <div className="space-y-1.5">
                <span className="text-[10px] font-extrabold text-amber-500 tracking-widest uppercase font-mono bg-amber-500/5 px-2.5 py-1 rounded-md border border-amber-500/10">Rekomendasi Populer</span>
                <h2 className="text-2xl font-black text-white">Gedung Estetis Samara Stay</h2>
                <p className="text-slate-400 text-xs font-light">Koleksi kos eksklusif dengan fasilitas terlengkap yang paling diminati penghuni.</p>
              </div>
              <button
                onClick={() => setUserPage('search')}
                className="text-xs text-amber-500 font-extrabold flex items-center gap-1 hover:underline cursor-pointer font-mono"
              >
                LIHAT SEMUA PROPERTI <ArrowRight size={14} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {properties.slice(0, 3).map(p => {
                const pRooms = rooms.filter(r => r.property_id === p.id);
                const availableCount = pRooms.filter(r => r.status === 'available').length;
                return (
                  <div 
                    key={p.id}
                    onClick={() => {
                      setActiveProperty(p);
                      setUserPage('detail');
                    }}
                    className="bg-[#121215] border border-slate-800 rounded-3xl overflow-hidden shadow-lg hover:border-slate-700 hover:shadow-2xl transition-all duration-300 flex flex-col group cursor-pointer"
                  >
                    <div className="relative h-56 bg-slate-900 overflow-hidden select-none">
                      <img 
                        src={p.image_url || "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=600&q=80"} 
                        alt={p.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute top-4 left-4">
                        <span className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase font-mono shadow-md ${
                          p.type === 'putri' 
                            ? 'bg-pink-500/20 text-pink-300 border border-pink-500/30' 
                            : p.type === 'putra' 
                              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' 
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        }`}>
                          KOS {p.type}
                        </span>
                      </div>
                      
                      <div className="absolute bottom-4 right-4 bg-[#09090b]/90 backdrop-blur-md px-3 py-1.5 rounded-xl text-[10px] font-bold text-slate-200 border border-slate-800 shadow-sm flex items-center gap-1.5">
                        <CheckCircle size={11} className="text-emerald-400" />
                        <span>{availableCount} Unit Tersedia</span>
                      </div>
                    </div>

                    <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                      <div className="space-y-1.5">
                        <h3 className="font-extrabold text-white text-base font-display group-hover:text-amber-500 transition-colors">{p.name}</h3>
                        <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                          <MapPin size={13} className="text-amber-500 shrink-0" />
                          <span className="truncate">{p.address}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {p.facilities.slice(0, 3).map((f) => (
                          <span key={f} className="text-[10px] bg-slate-900 border border-slate-800 text-slate-300 font-semibold px-2 py-1 rounded-md">
                            {f}
                          </span>
                        ))}
                        {p.facilities.length > 3 && (
                          <span className="text-[10px] bg-slate-900 text-slate-500 font-bold px-2 py-1 rounded-md">
                            +{p.facilities.length - 3}
                          </span>
                        )}
                      </div>

                      <div className="border-t border-slate-800/80 pt-4 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-slate-500 block uppercase font-mono font-bold leading-none mb-1">Mulai Dari</span>
                          <span className="text-sm font-black text-amber-500 font-mono">{formatRupiah(p.price)}<span className="text-[10px] text-slate-400 font-sans font-light">/bln</span></span>
                        </div>
                        <span className="text-xs bg-amber-500 text-black px-3 py-1.5 rounded-xl font-extrabold flex items-center gap-1 transition-all">
                          Pesan <ChevronRight size={12} />
                        </span>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          </div>

          {/* Testimoni Penghuni */}
          <div className="bg-[#121215] py-16 border-y border-slate-800">
            <div className="max-w-6xl mx-auto px-4 space-y-10">
              <div className="text-center space-y-3">
                <span className="text-[10px] font-extrabold text-amber-500 tracking-widest uppercase font-mono bg-amber-500/5 px-2.5 py-1 rounded-md border border-amber-500/10">Testimoni Penghuni</span>
                <h2 className="text-2xl font-black text-white">Dipercaya Oleh 1,000+ Penghuni Aktif</h2>
                <p className="text-slate-400 text-xs max-w-lg mx-auto font-light">Simak ulasan tulus dari rekan mahasiswa dan pekerja muda yang telah menetap nyaman bersama kami.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                <div className="bg-[#09090b] border border-slate-800 p-6 rounded-2xl space-y-4 flex flex-col justify-between">
                  <p className="text-xs text-slate-300 italic font-light leading-relaxed">
                    "Sangat puas tinggal di Samara Stay! WiFi ngebut sekali buat main game dan kerja remote, layanan laundry gratis mingguan sangat meringankan beban pas lagi sibuk kuliah."
                  </p>
                  <div className="flex items-center gap-3 pt-3 border-t border-slate-800/80">
                    <div className="w-10 h-10 rounded-full bg-amber-500 text-black flex items-center justify-center font-extrabold font-mono text-xs shadow-md">AP</div>
                    <div>
                      <h4 className="text-xs font-bold text-white">Aditya Pratama</h4>
                      <p className="text-[10px] text-slate-400 font-mono">Mahasiswa UI - Depok</p>
                    </div>
                  </div>
                </div>

                <div className="bg-[#09090b] border border-slate-800 p-6 rounded-2xl space-y-4 flex flex-col justify-between">
                  <p className="text-xs text-slate-300 italic font-light leading-relaxed">
                    "Kamar kostnya estetik dan super bersih, persis dengan yang ada di foto. Semua urusan air, kebersihan, listrik beres semua. CS ramah dan proses payment otomatis lewat Midtrans."
                  </p>
                  <div className="flex items-center gap-3 pt-3 border-t border-slate-800/80">
                    <div className="w-10 h-10 rounded-full bg-indigo-500 text-white flex items-center justify-center font-extrabold font-mono text-xs shadow-md">SD</div>
                    <div>
                      <h4 className="text-xs font-bold text-white">Sarah Devina</h4>
                      <p className="text-[10px] text-slate-400 font-mono">Content Creator - Jakarta</p>
                    </div>
                  </div>
                </div>

                <div className="bg-[#09090b] border border-slate-800 p-6 rounded-2xl space-y-4 flex flex-col justify-between">
                  <p className="text-xs text-slate-300 italic font-light leading-relaxed">
                    "Keamanan CCTV dan kunci elektronik terjamin banget. Layanan perbaikan AC gratis dikerjakan dengan sigap pas saya lapor kendala via sistem admin. Recommended kos eksklusif!"
                  </p>
                  <div className="flex items-center gap-3 pt-3 border-t border-slate-800/80">
                    <div className="w-10 h-10 rounded-full bg-emerald-500 text-black flex items-center justify-center font-extrabold font-mono text-xs shadow-md">RH</div>
                    <div>
                      <h4 className="text-xs font-bold text-white">Rian Hidayat</h4>
                      <p className="text-[10px] text-slate-400 font-mono">System Analyst - Jaksel</p>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

        </div>
      )}

      {/* ========================================================== */}
      {/* VIEW 2: SEARCH & FILTER CATALOG (SPLIT SCREEN LAYOUT) */}
      {/* ========================================================== */}
      {userPage === 'search' && (
        <div className="max-w-7xl mx-auto px-4 md:px-8 mt-6 space-y-6 animate-fade-in">
          
          {/* Header & Advanced Filter Bar */}
          <div className="bg-[#121215] border border-slate-800 rounded-3xl p-5 md:p-6 space-y-4 shadow-xl">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h2 className="text-xl font-black text-white font-display uppercase tracking-tight">Katalog Hasil Pencarian</h2>
                <p className="text-slate-400 text-xs font-light">Menemukan {filteredProperties.length} gedung kos terbaik yang sesuai pilihan Anda.</p>
              </div>

              {/* Quick Location Search bar input inside catalogue */}
              <div className="relative w-full md:w-72">
                <Search className="absolute left-3 top-3 text-slate-500" size={14} />
                <input 
                  type="text"
                  placeholder="Cari jalan, area, atau kota..."
                  value={searchLocation}
                  onChange={(e) => setSearchLocation(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-medium"
                />
              </div>
            </div>

            {/* Filter Canggih (Advanced Filter Grid) */}
            <div className="border-t border-slate-800/80 pt-4 grid grid-cols-1 md:grid-cols-4 gap-6 text-xs">
              
              {/* Filter 1: Kebijakan/Gender */}
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-amber-500 uppercase tracking-widest font-mono">Kebijakan Hunian</label>
                <div className="flex bg-slate-900 border border-slate-800 p-0.5 rounded-xl">
                  {['all', 'putra', 'putri', 'campur'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setSelectedType(t as any)}
                      className={`flex-1 py-1.5 rounded-lg text-[9px] font-extrabold uppercase transition-all ${selectedType === t ? 'bg-amber-500 text-black shadow-md' : 'text-slate-400 hover:text-white'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filter 2: Budget Slider */}
              <div className="space-y-2 font-mono">
                <div className="flex justify-between items-center text-[10px] font-bold text-amber-500 uppercase tracking-widest">
                  <span>Anggaran Maksimal</span>
                  <span className="text-slate-300">{formatRupiah(priceRange)}</span>
                </div>
                <input 
                  type="range"
                  min={1000000}
                  max={25000000}
                  step={200000}
                  value={priceRange}
                  onChange={(e) => setPriceRange(Number(e.target.value))}
                  className="w-full accent-amber-500 bg-slate-900 h-1 rounded-lg cursor-pointer border border-slate-800"
                />
              </div>

              {/* Filter 3: Fasilitas Kamar */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-amber-500 uppercase tracking-widest font-mono">Fasilitas Kamar Mandi/Kamar</label>
                <div className="flex flex-wrap gap-2 pt-0.5">
                  {['AC', 'Mandi Dalam', 'Kasur Queen', 'Water Heater'].map(f => {
                    const isChecked = selectedRoomFacilities.includes(f);
                    return (
                      <button
                        key={f}
                        type="button"
                        onClick={() => {
                          if (isChecked) {
                            setSelectedRoomFacilities(selectedRoomFacilities.filter(x => x !== f));
                          } else {
                            setSelectedRoomFacilities([...selectedRoomFacilities, f]);
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase border transition-all ${isChecked ? 'bg-amber-500/10 text-amber-400 border-amber-500/35 shadow-sm' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'}`}
                      >
                        {f}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Filter 4: Fasilitas Bersama */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-amber-500 uppercase tracking-widest font-mono">Fasilitas Komplek Bersama</label>
                <div className="flex flex-wrap gap-2 pt-0.5">
                  {['Dapur', 'Parkir', 'Rooftop', 'Gym'].map(f => {
                    const isChecked = selectedSharedFacilities.includes(f);
                    return (
                      <button
                        key={f}
                        type="button"
                        onClick={() => {
                          if (isChecked) {
                            setSelectedSharedFacilities(selectedSharedFacilities.filter(x => x !== f));
                          } else {
                            setSelectedSharedFacilities([...selectedSharedFacilities, f]);
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase border transition-all ${isChecked ? 'bg-amber-500/10 text-amber-400 border-amber-500/35 shadow-sm' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'}`}
                      >
                        {f}
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>

          {/* Catalog Split-Screen Container Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[500px]">
            
            {/* Sisi Kiri: Daftar Card Gedung Kosan (col-span-7) */}
            <div className="lg:col-span-7 space-y-4 max-h-[70vh] overflow-y-auto pr-2">
              {filteredProperties.length > 0 ? (
                filteredProperties.map(p => {
                  const pRooms = rooms.filter(r => r.property_id === p.id);
                  const availableCount = pRooms.filter(r => r.status === 'available').length;
                  return (
                    <div
                      key={p.id}
                      onMouseEnter={() => setHoveredPropertyId(p.id)}
                      onMouseLeave={() => setHoveredPropertyId(null)}
                      className={`bg-[#121215] border rounded-2xl overflow-hidden flex flex-col sm:flex-row group transition-all duration-300 ${hoveredPropertyId === p.id ? 'border-amber-500/55 shadow-xl shadow-amber-500/5 bg-[#17171c]' : 'border-slate-800'}`}
                    >
                      {/* Left Thumbnail */}
                      <div className="w-full sm:w-56 h-48 bg-slate-900 shrink-0 relative overflow-hidden">
                        <img 
                          src={p.image_url || "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=400&q=80"} 
                          alt={p.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                          <span className={`px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase font-mono tracking-wider ${
                            p.type === 'putri' 
                              ? 'bg-pink-500/20 text-pink-300 border border-pink-500/30' 
                              : p.type === 'putra' 
                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' 
                                : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          }`}>
                            KOS {p.type}
                          </span>
                        </div>
                      </div>

                      {/* Right Details */}
                      <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-start">
                            <h3 className="font-extrabold text-white text-base font-display group-hover:text-amber-500 transition-colors">{p.name}</h3>
                            <span className="text-[10px] text-emerald-400 font-bold bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-full uppercase">{availableCount} Unit Kosong</span>
                          </div>
                          
                          <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                            <MapPin size={13} className="text-amber-500 shrink-0" />
                            <span className="truncate max-w-sm">{p.address}</span>
                          </div>

                          <p className="text-[10px] text-slate-400 font-light flex items-center gap-1">
                            <Compass size={11} className="text-amber-500" />
                            <span>Jarak fasilitas publik: <strong>500m ke Stasiun / 10 menit jalan kaki</strong></span>
                          </p>
                        </div>

                        {/* Badges */}
                        <div className="flex flex-wrap gap-1">
                          {p.facilities.slice(0, 4).map(f => (
                            <span key={f} className="text-[9px] bg-slate-900 border border-slate-800 text-slate-350 font-semibold px-2 py-0.5 rounded-md">
                              {f}
                            </span>
                          ))}
                        </div>

                        {/* Footer details & Action */}
                        <div className="border-t border-slate-800/80 pt-3 flex items-center justify-between text-xs">
                          <div>
                            <span className="text-[9px] text-slate-500 block uppercase font-mono font-bold mb-0.5">Mulai Dari</span>
                            <span className="font-extrabold text-amber-500 font-mono text-base">{formatRupiah(p.price)}<span className="text-[10px] text-slate-500 font-sans font-light">/bln</span></span>
                          </div>

                          <button
                            onClick={() => {
                              setActiveProperty(p);
                              setUserPage('detail');
                            }}
                            className="bg-amber-500 hover:bg-amber-600 text-black font-extrabold py-2 px-3.5 rounded-xl text-[10px] transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-amber-500/5"
                          >
                            <span>Lihat Detail Kamar</span>
                            <ChevronRight size={12} />
                          </button>
                        </div>
                      </div>

                    </div>
                  );
                })
              ) : (
                <div className="bg-[#121215] border border-dashed border-slate-800 rounded-3xl p-16 text-center space-y-4">
                  <CompassIcon size={44} className="text-amber-500 mx-auto" />
                  <p className="text-slate-400 text-sm font-light">Kosan dengan kriteria pencarian tidak ditemukan. Silakan longgarkan filter filter Anda.</p>
                </div>
              )}
            </div>

            {/* Sisi Kanan: Peta Interaktif (Interactive Stylized Map) (col-span-5) */}
            <div className="lg:col-span-5 bg-[#121215] border border-slate-800 rounded-3xl p-4 overflow-hidden relative flex flex-col justify-between shadow-xl min-h-[300px] h-fit lg:h-[70vh] select-none">
              
              {/* Map header */}
              <div className="bg-[#09090b]/80 border border-slate-800 p-2.5 rounded-xl flex items-center justify-between text-[10px] font-mono z-10">
                <span className="text-amber-500 font-extrabold flex items-center gap-1">
                  <Map size={12} />
                  MAP INTERAKTIF COVENANT
                </span>
                <span className="text-slate-500">Real-time Coordinates</span>
              </div>

              {/* Styled Visual Map Representing streets & pins */}
              <div className="flex-1 relative bg-[#09090b] rounded-2xl overflow-hidden border border-slate-800/80 my-3 min-h-[320px]">
                
                {/* SVG Mock grid map streets / river */}
                <svg className="absolute inset-0 w-full h-full opacity-10" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
                      <path d="M 30 0 L 0 0 0 30" fill="none" stroke="gray" strokeWidth="0.5" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#grid)" />
                  {/* Rivers / Parks */}
                  <path d="M-10 120 C 150 130, 250 80, 450 140" fill="none" stroke="#2563eb" strokeWidth="15" opacity="0.3" />
                  {/* Major roads */}
                  <line x1="50" y1="0" x2="250" y2="400" stroke="#f59e0b" strokeWidth="3" opacity="0.4" />
                  <line x1="0" y1="200" x2="500" y2="150" stroke="#f59e0b" strokeWidth="3" opacity="0.4" />
                  <circle cx="200" cy="180" r="45" fill="#10b981" opacity="0.15" />
                </svg>

                {/* Floating Map Labels */}
                <span className="absolute top-1/4 left-1/3 text-[9px] font-bold text-slate-600 tracking-widest font-mono select-none uppercase">Kawasan Depok</span>
                <span className="absolute bottom-1/4 left-1/2 text-[9px] font-bold text-slate-600 tracking-widest font-mono select-none uppercase">Kawasan Jaksel</span>

                {/* Interactive Property Map Markers */}
                {filteredProperties.map(p => {
                  const coords = getMapCoords(p);
                  const isHovered = hoveredPropertyId === p.id;
                  const isSelected = selectedMapProperty?.id === p.id;

                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedMapProperty(p)}
                      onMouseEnter={() => setHoveredPropertyId(p.id)}
                      onMouseLeave={() => setHoveredPropertyId(null)}
                      style={{ left: `${coords.x}%`, top: `${coords.y}%` }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-300 z-20 cursor-pointer"
                    >
                      <div className={`flex flex-col items-center gap-0.5 ${isHovered || isSelected ? 'scale-110 z-30' : 'scale-100'}`}>
                        
                        {/* Price Tag popup */}
                        <div className={`px-2 py-0.5 rounded-md text-[9px] font-black font-mono shadow-md border whitespace-nowrap transition-all ${
                          isSelected 
                            ? 'bg-amber-500 text-black border-amber-600' 
                            : isHovered 
                              ? 'bg-[#17171c] text-amber-500 border-amber-500/50' 
                              : 'bg-[#09090b] text-slate-300 border-slate-800'
                        }`}>
                          {formatRupiah(p.price).replace(/Rp\s?/, 'Rp ')}
                        </div>

                        {/* Pin Dot */}
                        <div className={`w-3 h-3 rounded-full border-2 shadow-sm transition-all ${
                          isSelected 
                            ? 'bg-amber-500 border-white animate-bounce' 
                            : isHovered 
                              ? 'bg-amber-400 border-slate-900' 
                              : 'bg-indigo-600 border-[#09090b]'
                        }`} />

                      </div>
                    </button>
                  );
                })}

                {/* Selected Map Property Bubble popup */}
                {selectedMapProperty && (
                  <div className="absolute bottom-3 left-3 right-3 bg-[#121215] border border-slate-800 rounded-xl p-3 shadow-2xl flex gap-3 z-30 animate-fade-in-up">
                    <img 
                      src={selectedMapProperty.image_url || "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=150&q=80"}
                      alt={selectedMapProperty.name}
                      className="w-16 h-16 object-cover rounded-lg bg-slate-900"
                    />
                    <div className="flex-1 flex flex-col justify-between text-xs">
                      <div>
                        <div className="flex justify-between items-center">
                          <h4 className="font-extrabold text-white truncate max-w-[150px]">{selectedMapProperty.name}</h4>
                          <button 
                            onClick={() => setSelectedMapProperty(null)}
                            className="text-slate-500 hover:text-white"
                          >
                            <X size={12} />
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-400 truncate mt-0.5">{selectedMapProperty.address}</p>
                      </div>
                      
                      <div className="flex justify-between items-center pt-1">
                        <span className="font-bold text-amber-500 font-mono text-[11px]">{formatRupiah(selectedMapProperty.price)}<span className="text-[9px] text-slate-500 font-sans font-light">/bln</span></span>
                        <button
                          onClick={() => {
                            setActiveProperty(selectedMapProperty);
                            setUserPage('detail');
                          }}
                          className="bg-amber-500 text-black px-2.5 py-1 rounded-md text-[9px] font-black hover:bg-amber-600 cursor-pointer transition-colors"
                        >
                          Detail
                        </button>
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {/* Informational warning */}
              <div className="bg-[#09090b]/60 border border-slate-800/80 p-3 rounded-2xl flex gap-3 text-slate-400 text-[10px] leading-relaxed font-normal">
                <InfoIcon size={14} className="text-amber-500 shrink-0 mt-0.5" />
                <div>
                  Klik pin di peta untuk melihat properti secara visual. Pin diatur otomatis oleh sistem berdasarkan koordinat GPS yang dimasukkan oleh Super Admin di database.
                </div>
              </div>

            </div>

          </div>

        </div>
      )}

      {/* ========================================================== */}
      {/* VIEW 3: PROPERTY & CHAMBER DETAIL PAGE (AIRBNB STYLE) */}
      {/* ========================================================== */}
      {userPage === 'detail' && activeProperty && (
        <div className="max-w-6xl mx-auto px-4 md:px-8 mt-6 space-y-8 animate-fade-in">
          
          {/* Breadcrumb Navigation & Back indicators */}
          <div className="flex justify-between items-center">
            <button 
              onClick={() => setUserPage('search')}
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white font-bold cursor-pointer transition-colors px-3 py-1.5 rounded-xl border border-slate-800 bg-[#121215]/60"
            >
              <ChevronLeft size={14} />
              Kembali ke Pencarian Katalog
            </button>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
              <span>Home</span>
              <ChevronRight size={10} />
              <span>Gedung</span>
              <ChevronRight size={10} />
              <span className="text-slate-350">{activeProperty.name}</span>
            </div>
          </div>

          {/* Airbnb-style Premium Image Grid Gallery */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-[#121215] border border-slate-800 p-3 rounded-3xl overflow-hidden shadow-2xl h-[380px]">
            {/* 1 Big Photo (Col span 2, Row span 2) */}
            <div className="md:col-span-2 h-full rounded-2xl overflow-hidden bg-slate-900 select-none relative group">
              <img 
                src={activeProperty.image_url || "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=600&q=80"} 
                alt={activeProperty.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-95"
                referrerPolicy="no-referrer"
              />
              <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-sm border border-slate-800 text-white px-3 py-1.5 rounded-xl text-[10px] font-extrabold uppercase font-mono tracking-wider">
                Foto Utama
              </div>
            </div>

            {/* Grid of 4 Smaller Photos (Col span 1 each) */}
            <div className="hidden md:grid grid-cols-2 grid-rows-2 col-span-2 gap-3 h-full">
              
              <div className="rounded-xl overflow-hidden h-full bg-slate-900 select-none relative group">
                <img 
                  src="https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=600&q=80" 
                  alt="Kamar Tidur Utama"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90"
                />
                <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded-md text-[9px] font-semibold">Ruang Kamar</div>
              </div>

              <div className="rounded-xl overflow-hidden h-full bg-slate-900 select-none relative group">
                <img 
                  src="https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?auto=format&fit=crop&w=600&q=80" 
                  alt="Area Kamar Mandi"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90"
                />
                <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded-md text-[9px] font-semibold">Kamar Mandi</div>
              </div>

              <div className="rounded-xl overflow-hidden h-full bg-slate-900 select-none relative group">
                <img 
                  src="https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=600&q=80" 
                  alt="Dapur Bersama"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90"
                />
                <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded-md text-[9px] font-semibold">Area Bersama</div>
              </div>

              <div className="rounded-xl overflow-hidden h-full bg-slate-900 select-none relative group flex items-center justify-center">
                <img 
                  src="https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&w=600&q=80" 
                  alt="Rooftop Area"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90"
                />
                <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded-md text-[9px] font-semibold">Rooftop Lounge</div>
              </div>

            </div>
          </div>

          {/* TWO COLUMN CONTENT PANEL */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 text-xs font-medium">
            
            {/* Left Main Details Column (col-span-8) */}
            <div className="lg:col-span-8 space-y-8">
              
              {/* Complex Metadata Description Block */}
              <div className="space-y-3.5 border-b border-slate-800 pb-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-md text-[9px] font-extrabold uppercase font-mono tracking-wider ${
                    activeProperty.type === 'putri' 
                      ? 'bg-pink-500/20 text-pink-300 border border-pink-500/30' 
                      : activeProperty.type === 'putra' 
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' 
                        : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}>
                    KOS {activeProperty.type.toUpperCase()}
                  </span>
                  <div className="flex items-center gap-1 text-slate-400 font-semibold font-mono text-[10px]">
                    <Star size={13} className="text-amber-500 fill-amber-500" />
                    <span>4.9 (42 Ulasan)</span>
                  </div>
                </div>

                <h1 className="text-3xl font-black text-white font-display uppercase tracking-tight">{activeProperty.name}</h1>
                
                <div className="flex items-center gap-1.5 text-slate-350 text-sm font-light">
                  <MapPin size={15} className="text-amber-500 shrink-0" />
                  <span>{activeProperty.address}</span>
                </div>
              </div>

              {/* Detail Fasilitas Kompleks */}
              <div className="space-y-4 border-b border-slate-800 pb-6">
                <h3 className="text-xs font-bold text-slate-450 uppercase tracking-widest font-mono">Fasilitas Kompleks Gedung</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {activeProperty.facilities.map((fac, idx) => {
                    let iconNode = <Wifi size={14} className="text-amber-500" />;
                    if (fac.toLowerCase().includes('dapur')) iconNode = <Utensils size={14} className="text-amber-500" />;
                    if (fac.toLowerCase().includes('parkir')) iconNode = <Car size={14} className="text-amber-500" />;
                    if (fac.toLowerCase().includes('wifi') || fac.toLowerCase().includes('internet')) iconNode = <Wifi size={14} className="text-amber-500" />;
                    if (fac.toLowerCase().includes('ac') || fac.toLowerCase().includes('pendingin')) iconNode = <Zap size={14} className="text-amber-500" />;

                    return (
                      <div key={idx} className="bg-[#121215] border border-slate-800 p-3.5 rounded-xl flex items-center gap-3">
                        {iconNode}
                        <span className="font-semibold text-slate-200 capitalize">{fac}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Immersive 360° Virtual Tour / Video Showcase section */}
              <div className="bg-gradient-to-br from-indigo-950/20 via-[#121215] to-[#121215] border border-indigo-500/10 p-6 rounded-3xl space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="space-y-1">
                    <span className="text-[9px] font-black font-mono text-indigo-400 uppercase tracking-wider block">IMMERSIVE EXPERIENCE</span>
                    <h3 className="text-sm font-extrabold text-white uppercase tracking-tight flex items-center gap-1.5">
                      <RotateCw size={14} className="text-indigo-400" />
                      360° Virtual Room Tour
                    </h3>
                    <p className="text-[11px] text-slate-400 font-light">Eksplorasi fisik isi kamar secara menyeluruh dalam tampilan panorama interaktif.</p>
                  </div>
                  <button
                    onClick={() => setVirtualTourOpen(true)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-4 py-2.5 rounded-xl text-[10px] font-mono tracking-wide uppercase shadow-lg transition-colors flex items-center gap-2 cursor-pointer shadow-indigo-600/10"
                  >
                    <Play size={13} className="fill-white" />
                    Mulai Virtual Tour
                  </button>
                </div>

                <div className="relative h-44 rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 select-none flex items-center justify-center">
                  <img 
                    src="https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80" 
                    alt="Panoramic Preview"
                    className="w-full h-full object-cover opacity-35 filter blur-[1px]"
                  />
                  <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-1">
                    <RotateCw size={24} className="text-slate-400 animate-spin" />
                    <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest font-mono">360° Panorama Live Player</span>
                  </div>
                </div>
              </div>

              {/* Lokasi & Sekitar (Fasilitas Publik Terdekat) */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-slate-450 uppercase tracking-widest font-mono">Lokasi & Sekitar (Hotspots)</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Distances Hotspots List */}
                  <div className="bg-[#121215] border border-slate-800 p-5 rounded-2xl space-y-3">
                    <div className="text-[10px] text-amber-500 font-extrabold font-mono uppercase tracking-wider border-b border-slate-800 pb-2">Jarak Fasilitas Terdekat</div>
                    
                    <div className="space-y-2.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Halte Transjakarta / Busway</span>
                        <span className="font-semibold text-slate-100 font-mono">🚶 3 Menit (250m)</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Stasiun KRL Jabodetabek</span>
                        <span className="font-semibold text-slate-100 font-mono">🚆 8 Menit (600m)</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Kampus / Universitas Terdekat</span>
                        <span className="font-semibold text-slate-100 font-mono">🎓 12 Menit (1.0km)</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Mall & Pusat Kuliner</span>
                        <span className="font-semibold text-slate-100 font-mono">🛍️ 10 Menit (800m)</span>
                      </div>
                    </div>
                  </div>

                  {/* Stylized Local Mini-Map represent */}
                  <div className="bg-[#121215] border border-slate-800 rounded-2xl p-4 overflow-hidden relative flex flex-col justify-between min-h-[160px] h-full">
                    <div className="absolute inset-0 bg-[#09090b]/40 opacity-20 bg-cover bg-center" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=300&q=80')" }} />
                    <div className="relative z-10 flex flex-col justify-between h-full space-y-3">
                      <div>
                        <h4 className="font-extrabold text-white text-xs">Mini GPS Spotter</h4>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">LAT: {activeProperty.lat || -6.2} | LNG: {activeProperty.lng || 106.8}</p>
                      </div>
                      <div className="bg-[#09090b] border border-slate-800 p-2.5 rounded-xl text-[10px] leading-relaxed text-slate-350">
                        📍 <strong>Samara Stay</strong> terletak strategis di zona aman, dikelilingi pagar kawat harmonika, satpam 24 jam & terintegrasi kamera pemantau kota.
                      </div>
                    </div>
                  </div>
                </div>

              </div>

            </div>

            {/* Right Booking Column (PILIHAN TIPE KAMAR & PRICING SHEET) (col-span-4) */}
            <div className="lg:col-span-4 space-y-4">
              
              <div className="bg-[#121215] border border-slate-800 rounded-3xl p-5 md:p-6 space-y-4 shadow-xl sticky top-[135px]">
                <div className="border-b border-slate-800 pb-3">
                  <span className="text-[10px] text-amber-500 font-mono font-bold uppercase tracking-wider block">DAFTAR KETERSEDIAAN UNIT</span>
                  <h3 className="text-sm font-black text-white uppercase tracking-tight">Pilihan Tipe Kamar</h3>
                  <p className="text-[10px] text-slate-400 font-light mt-0.5">Pilih salah satu unit kamar yang tersedia di bawah ini untuk memesan atau survey:</p>
                </div>

                {/* List of Chambers / Rooms inside property */}
                <div className="space-y-3 max-h-[42vh] overflow-y-auto pr-1">
                  {rooms.filter(r => r.property_id === activeProperty.id).map(r => {
                    const isAvailable = r.status === 'available';
                    return (
                      <div
                        key={r.id}
                        className={`p-4 rounded-2xl border text-left flex flex-col justify-between gap-3 transition-all ${
                          !isAvailable 
                            ? 'bg-slate-900/40 border-slate-850 opacity-55' 
                            : activeRoom?.id === r.id
                              ? 'border-amber-500 bg-amber-500/5 shadow-md ring-1 ring-amber-500'
                              : 'border-slate-800 bg-[#09090b] hover:border-slate-700'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-extrabold text-white text-sm font-display flex items-center gap-1.5">
                              Unit {r.room_number}
                              <span className="text-[9px] font-bold text-slate-450 bg-slate-800 border border-slate-750 px-1.5 py-0.2 rounded font-sans uppercase">{r.room_type}</span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1">Lantai: {r.floor} / {r.size_sqm} m²</p>
                          </div>

                          <span className={`px-2 py-0.5 rounded-full text-[8px] font-extrabold uppercase font-mono border ${
                            r.status === 'available' 
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                              : 'bg-white/5 text-slate-500 border-white/10'
                          }`}>
                            {r.status === 'available' ? 'KOSONG' : 'TERISI'}
                          </span>
                        </div>

                        {/* Facilities badge preview */}
                        <div className="flex flex-wrap gap-1">
                          {r.facilities.slice(0, 3).map(f => (
                            <span key={f} className="text-[8px] bg-slate-900 border border-slate-850 text-slate-400 px-1.5 py-0.2 rounded">
                              {f}
                            </span>
                          ))}
                        </div>

                        {/* Price rate sheet */}
                        <div className="border-t border-slate-800/80 pt-2 flex flex-col gap-1.5">
                          <div className="flex justify-between items-center">
                            <span className="text-[9px] text-slate-500 uppercase font-mono">Sewa Bulanan</span>
                            <span className="font-bold text-amber-500 font-mono">{formatRupiah(r.price)}<span className="text-[8px] text-slate-500 font-normal font-sans">/bln</span></span>
                          </div>
                          {r.is_daily_enabled && (
                            <div className="flex justify-between items-center">
                              <span className="text-[9px] text-slate-500 uppercase font-mono">Sewa Harian</span>
                              <span className="font-bold text-amber-500 font-mono">{formatRupiah(r.daily_price)}<span className="text-[8px] text-slate-500 font-normal font-sans">/hari</span></span>
                            </div>
                          )}
                        </div>

                        {/* Interactive Buttons - ONLY enabled if Available */}
                        {isAvailable ? (
                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <button
                              onClick={() => handleSelectRoom(r, 'survey')}
                              className="bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:border-slate-750 text-slate-350 py-1.5 rounded-xl text-[9px] font-extrabold transition-all text-center cursor-pointer uppercase font-mono"
                            >
                              Survey (DP Rp500k)
                            </button>
                            <button
                              onClick={() => handleSelectRoom(r, r.is_daily_enabled ? 'daily' : 'monthly')}
                              className="bg-amber-500 hover:bg-amber-600 text-black py-1.5 rounded-xl text-[9px] font-extrabold transition-all text-center cursor-pointer uppercase font-mono"
                            >
                              Pesan Sekarang
                            </button>
                          </div>
                        ) : (
                          <div className="bg-slate-900 border border-slate-850 rounded-xl py-2 text-center text-slate-500 font-extrabold text-[9px] uppercase font-mono">
                            Kamar Sudah Terisi
                          </div>
                        )}

                      </div>
                    );
                  })}

                  {rooms.filter(r => r.property_id === activeProperty.id).length === 0 && (
                    <p className="text-[10px] text-slate-500 py-12 text-center font-mono">Properti ini tidak memiliki unit kamar terdaftar.</p>
                  )}
                </div>

              </div>

            </div>

          </div>

        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL WORKFLOWS (SURVEYS & DIRECT BOOKINGS) */}
      {/* ========================================================== */}

      {/* Custom Booking process Modal pop-up (PRESERVING EXSTING FLOW) */}
      <Modal
        isOpen={activeRoom !== null}
        onClose={() => {
          setActiveRoom(null);
          setCheckoutFlow('none');
        }}
        title={`FORMULIR RESERVASI KAMAR ${activeRoom?.room_number || ''}`}
      >
        {activeRoom && activeProperty && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div>
                <span className="text-[9px] font-bold text-slate-500 font-mono uppercase">Jenis Sewa Dipilih</span>
                <div className="flex gap-1.5 mt-0.5">
                  <button 
                    type="button" 
                    onClick={() => setCheckoutFlow('monthly')}
                    className={`px-3 py-1 rounded-lg text-[9px] font-bold uppercase ${
                      checkoutFlow === 'monthly' ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-450'
                    }`}
                  >
                    Bulanan
                  </button>
                  {activeRoom.is_daily_enabled && (
                    <button 
                      type="button" 
                      onClick={() => setCheckoutFlow('daily')}
                      className={`px-3 py-1 rounded-lg text-[9px] font-bold uppercase ${
                        checkoutFlow === 'daily' ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-455'
                      }`}
                    >
                      Harian
                    </button>
                  )}
                  <button 
                    type="button" 
                    onClick={() => setCheckoutFlow('survey')}
                    className={`px-3 py-1 rounded-lg text-[9px] font-bold uppercase ${
                      checkoutFlow === 'survey' ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-460'
                    }`}
                  >
                    Janji Survey
                  </button>
                </div>
              </div>
            </div>

            <BookingForm 
              property={activeProperty}
              room={activeRoom}
              checkoutFlow={checkoutFlow}
              couponInput={couponInput}
              setCouponInput={setCouponInput}
              onApplyCoupon={handleApplyCoupon}
              couponError={couponError}
              appliedCoupon={appliedCoupon}
              bookingPeriodMonths={bookingPeriodMonths}
              setBookingPeriodMonths={setBookingPeriodMonths}
              bookingPeriodDays={bookingPeriodDays}
              setBookingPeriodDays={setBookingPeriodDays}
              bookingCheckInDate={bookingCheckInDate}
              setBookingCheckInDate={setBookingCheckInDate}
              surveyForm={surveyForm}
              setSurveyForm={setSurveyForm}
              bookingForm={bookingForm}
              setBookingForm={setBookingForm}
              onProceedToPayment={handleProceedToPayment}
            />
          </div>
        )}
      </Modal>

      {/* Midtrans SNAP Simulator Backdrop overlay (PRESERVING EXISTING INTERACTION) */}
      {snapOpen && snapPaymentContext && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 p-4">
          <div className="bg-[#121215] border border-slate-800 rounded-2xl w-full max-w-md p-6 overflow-hidden">
            <MidtransSimulator 
              isOpen={snapOpen}
              onClose={() => setSnapOpen(false)}
              orderId={snapPaymentContext.orderId}
              grossAmount={snapPaymentContext.grossAmount}
              itemDescription={snapPaymentContext.description || 'Sewa Unit'}
              customerDetails={{
                name: checkoutFlow === 'survey' ? surveyForm.fullName : bookingForm.fullName,
                email: checkoutFlow === 'survey' ? surveyForm.email : bookingForm.email,
                phone: checkoutFlow === 'survey' ? surveyForm.phone : bookingForm.phone
              }}
              onPaymentSuccess={handleSandboxPaymentSuccess}
              onPaymentPending={handleSandboxPaymentPending}
              onPaymentFail={(status) => {
                console.log("Failed:", status);
                setSnapOpen(false);
              }}
            />
          </div>
        </div>
      )}

      {/* Printable Receipt Invoice Popup modal (PRESERVING EXISTING FLOW) */}
      <Modal
        isOpen={showReceipt}
        onClose={() => setShowReceipt(false)}
        title="BUKTI TRANSAKSI SETELMEN"
      >
        {receiptData && (
          <InvoiceCard 
            receipt={receiptData}
            onClose={() => setShowReceipt(false)}
          />
        )}
      </Modal>

      {/* Immersive 360° Virtual Tour Panoramic Modal popup */}
      {virtualTourOpen && (
        <div className="fixed inset-0 bg-black/95 z-[150] flex flex-col justify-between p-4 md:p-6" id="immersive-360-tour-viewer">
          
          {/* Header */}
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <div>
              <span className="text-[10px] text-amber-500 font-mono font-bold tracking-widest uppercase block">SAMARA STAY VISUAL LABS</span>
              <h3 className="font-extrabold text-white text-sm uppercase">Simulasi Virtual Tour Kamar Eksklusif</h3>
            </div>
            <button
              onClick={() => setVirtualTourOpen(false)}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg border border-slate-800 bg-slate-900 cursor-pointer"
            >
              ✕ Tutup Player
            </button>
          </div>

          {/* Panoramic Screen */}
          <div 
            onMouseDown={handlePanoMouseDown}
            onMouseMove={handlePanoMouseMove}
            onMouseUp={handlePanoMouseUpOrLeave}
            onMouseLeave={handlePanoMouseUpOrLeave}
            style={{ 
              backgroundImage: "url('https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1800&q=80')",
              backgroundPositionX: `${virtualTourOffset}%`,
              backgroundSize: 'cover',
              cursor: isDraggingTour ? 'grabbing' : 'grab'
            }}
            className="flex-1 rounded-2xl border border-slate-800 my-4 shadow-2xl relative overflow-hidden flex items-center justify-between px-4 transition-all"
          >
            {/* Visual HUD Map Layer Overlay indicators */}
            <div className="absolute top-4 left-4 bg-black/75 backdrop-blur-md border border-slate-800 p-3 rounded-xl text-[10px] space-y-1 text-slate-350 select-none">
              <div className="font-bold text-amber-500 flex items-center gap-1.5">
                <Compass size={11} className="animate-spin" />
                ROOM DETECTOR ACTIVE
              </div>
              <div>Camera Sensor: Wide-angle 16mm</div>
              <div>Pitch: 0.00° / Roll: 0.00°</div>
            </div>

            {/* Left/Right click panning arrows */}
            <button 
              onClick={() => setVirtualTourOffset(prev => Math.max(0, prev - 10))}
              className="w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 border border-slate-800 text-white flex items-center justify-center transition-colors shadow-lg cursor-pointer shrink-0 z-10"
            >
              ◀
            </button>
            
            {/* Interactive draggable indicator center */}
            <div className="pointer-events-none absolute inset-x-0 bottom-4 text-center select-none text-[10px] text-slate-300 font-bold uppercase font-mono tracking-widest bg-black/50 py-1.5 px-4 rounded-full max-w-sm mx-auto border border-white/5">
              ↔ Drag layar / klik panah untuk rotasi kamar 360°
            </div>

            <button 
              onClick={() => setVirtualTourOffset(prev => Math.min(100, prev + 10))}
              className="w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 border border-slate-800 text-white flex items-center justify-center transition-colors shadow-lg cursor-pointer shrink-0 z-10"
            >
              ▶
            </button>
          </div>

          {/* Quick specs view at footer */}
          <div className="bg-[#121215] border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row justify-between gap-4 text-xs">
            <div className="flex gap-3 items-center">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
                <Bed size={18} />
              </div>
              <div>
                <h4 className="font-bold text-white uppercase">Samara Exclusive Loft Bedroom</h4>
                <p className="text-[10px] text-slate-450 leading-relaxed font-light">Kasur queen, sofa, meja kerja solid, pendingin ruangan AC inverter silent & smart TV 43".</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Volume2 size={16} className="text-indigo-400" />
              <span className="text-[10px] text-slate-400 font-mono">Ambient Audio (Sound of Nature) Active</span>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}

