import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { database } from '../lib/supabase';
import { Property, Room, Booking, Survey, Coupon, SystemSettings, StandardFacility, FAQItem } from '../types';
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
  Shirt, Sparkle, Compass, Grid, MapIcon, CompassIcon, InfoIcon, LogIn, Droplet, Check
} from 'lucide-react';

interface HomeProps {
  refreshTrigger: number;
  triggerAppRefresh?: () => void;
}

export default function Home({ refreshTrigger, triggerAppRefresh }: HomeProps) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
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
  const [searchMode, setSearchMode] = useState<'building' | 'room'>('building');

  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<{ [key: number]: L.Marker }>({});

  // Mouse position tracking for interactive 3D / Parallax hero effect
  const [heroMouse, setHeroMouse] = useState({ x: 0, y: 0 });

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

  // Zoomed/Expanded image viewer
  const [selectedRoomImage, setSelectedRoomImage] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [propsData, roomsData, couponsData, settingsData] = await Promise.all([
          database.fetchProperties(),
          database.fetchRooms(),
          database.fetchCoupons(),
          database.fetchSettings()
        ]);
        setProperties(propsData);
        setRooms(roomsData);
        setCoupons(couponsData);
        setSettings(settingsData);
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

  useEffect(() => {
    const handleStateChange = () => {
      triggerAppRefresh?.();
    };
    window.addEventListener('samara_state_changed', handleStateChange);
    return () => {
      window.removeEventListener('samara_state_changed', handleStateChange);
    };
  }, [triggerAppRefresh]);

  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [activeTestimonialIdx, setActiveTestimonialIdx] = useState<number>(0);

  const testimonials = [
    {
      initials: "AP",
      bgClass: "bg-brand-primary",
      name: "Aditya Pratama",
      role: "Mahasiswa UI - Depok",
      text: "Sangat puas tinggal di Samara Stay! WiFi ngebut sekali buat main game dan kerja remote, layanan laundry gratis mingguan sangat meringankan beban pas lagi sibuk kuliah."
    },
    {
      initials: "SD",
      bgClass: "bg-brand-steel",
      name: "Sarah Devina",
      role: "Content Creator - Jakarta",
      text: "Kamar kostnya estetik dan super bersih, persis dengan yang ada di foto. Semua urusan air, kebersihan, listrik beres semua. CS ramah dan proses payment otomatis lewat Midtrans."
    },
    {
      initials: "RH",
      bgClass: "bg-brand-taupe",
      name: "Rian Hidayat",
      role: "System Analyst - Jaksel",
      text: "Keamanan CCTV dan kunci elektronik terjamin banget. Layanan perbaikan AC gratis dikerjakan dengan sigap pas saya lapor kendala via sistem admin. Recommended kos eksklusif!"
    },
    {
      initials: "JA",
      bgClass: "bg-[#2E6F40]",
      name: "Jessica Amanda",
      role: "Product Manager - Jakbar",
      text: "Lingkungan sangat kondusif untuk istirahat setelah seharian kerja di kantor SCBD. Parkiran luas dan aman, serta staf housekeeping-nya jujur dan ramah banget."
    },
    {
      initials: "FA",
      bgClass: "bg-amber-600",
      name: "Farhan Alamsyah",
      role: "Tech Professional - BSD",
      text: "Proses booking kamar super gampang dan bisa langsung dapet kovenan sewa digital. Manajemen transparan dan gak ribet kalau mau perpanjang kontrak bulanan."
    }
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveTestimonialIdx(prev => (prev + 1) % testimonials.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [testimonials.length]);

  // Helper to render lucide icon from settings
  const renderSettingIcon = (iconName: string) => {
    switch (iconName) {
      case 'Clock': return <Clock size={24} className="text-[#2E6F40]" />;
      case 'LogIn': return <LogIn size={24} className="text-[#2E6F40]" />;
      case 'Shield': return <Shield size={24} className="text-[#2E6F40]" />;
      case 'Wifi': return <Wifi size={24} className="text-[#2E6F40]" />;
      case 'Zap': return <Zap size={24} className="text-[#2E6F40]" />;
      case 'Droplet': return <Droplet size={24} className="text-[#2E6F40]" />;
      case 'Car': return <Car size={24} className="text-[#2E6F40]" />;
      case 'Shirt': return <Shirt size={24} className="text-[#2E6F40]" />;
      case 'Sparkles': return <Sparkles size={24} className="text-[#2E6F40]" />;
      default: return <Info size={24} className="text-[#2E6F40]" />;
    }
  };

  // Parse Standard Facilities
  const standardFacilities: StandardFacility[] = (() => {
    try {
      if (settings?.standard_facilities) {
        return JSON.parse(settings.standard_facilities);
      }
    } catch (e) {
      console.error(e);
    }
    return [
      { icon: "Clock", title: "Jam Operasional", subtitle: "24 Jam" },
      { icon: "LogIn", title: "Check In", subtitle: "Fleksibel" },
      { icon: "Shield", title: "Security", subtitle: "24 Jam" },
      { icon: "Wifi", title: "WiFi", subtitle: "100 Mbps" },
      { icon: "Zap", title: "Listrik", subtitle: "Token/Include" },
      { icon: "Droplet", title: "Air", subtitle: "Bersih 24 Jam" },
      { icon: "Car", title: "Parkir", subtitle: "Motor & Mobil" },
      { icon: "Shirt", title: "Laundry", subtitle: "Tersedia" },
      { icon: "Sparkles", title: "Cleaning", subtitle: "2x / Minggu" }
    ];
  })();

  // Parse Why Choose Us
  const whyChooseUs: string[] = (() => {
    try {
      if (settings?.why_choose_us) {
        return JSON.parse(settings.why_choose_us);
      }
    } catch (e) {
      console.error(e);
    }
    return [
      "Standar Kebersihan Terjaga",
      "CCTV 24 Jam di Area Umum",
      "Maintenance Cepat < 24 Jam",
      "Admin Responsif via WhatsApp",
      "Pembayaran Digital Aman",
      "Kontrak Transparan Tanpa Biaya Tersembunyi"
    ];
  })();

  // Parse FAQs
  const faqs: FAQItem[] = (() => {
    try {
      if (settings?.faqs) {
        return JSON.parse(settings.faqs);
      }
    } catch (e) {
      console.error(e);
    }
    return [
      {
        question: "Bagaimana cara booking kamar di Samara Stay?",
        answer: "Anda dapat memilih gedung dan kamar kost di aplikasi kami, tentukan tanggal mulai sewa, dan selesaikan pembayaran DP atau sewa bulan pertama secara instan menggunakan sistem pembayaran digital terintegrasi."
      },
      {
        question: "Apa saja fasilitas yang tersedia di setiap kamar?",
        answer: "Setiap kamar dilengkapi dengan AC, tempat tidur (kasur queen), kamar mandi dalam dengan water heater, meja kerja, lemari pakaian, dan akses Wi-Fi berkecepatan tinggi."
      },
      {
        question: "Berapa biaya administrasi dan deposit yang harus dibayar?",
        answer: "Di Samara Stay bebas dari biaya administrasi tersembunyi. Kami menerapkan deposit komitmen sewa yang transparan dan akan dikembalikan utuh pada saat masa sewa Anda selesai."
      },
      {
        question: "Apakah ada kontrak jangka panjang?",
        answer: "Kami menyediakan kontrak sewa bulanan yang sangat fleksibel tanpa kewajiban komitmen tahunan yang memberatkan, sehingga sangat ideal untuk mahasiswa dan pekerja aktif."
      }
    ];
  })();

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

  // Filter individual rooms for direct interactive room search
  const filteredRooms = rooms.filter(r => {
    const parentProperty = properties.find(p => p.id === r.property_id);
    if (!parentProperty) return false;

    const matchLocation = !searchLocation.trim() || 
      parentProperty.address.toLowerCase().includes(searchLocation.toLowerCase()) || 
      parentProperty.name.toLowerCase().includes(searchLocation.toLowerCase()) ||
      r.room_number.toLowerCase().includes(searchLocation.toLowerCase());

    const matchType = selectedType === 'all' || parentProperty.type === selectedType;
    const matchPrice = r.price <= priceRange;

    const matchRoomFac = selectedRoomFacilities.length === 0 || 
      selectedRoomFacilities.every(f => 
        r.facilities.some(rf => rf.toLowerCase().includes(f.toLowerCase()))
      );

    const matchSharedFac = selectedSharedFacilities.length === 0 ||
      selectedSharedFacilities.every(f => 
        parentProperty.facilities.some(pf => pf.toLowerCase().includes(f.toLowerCase()))
      );

    return matchLocation && matchType && matchPrice && matchRoomFac && matchSharedFac;
  });

  // Leaflet map initialization and updates hook
  useEffect(() => {
    // Only initialize map if it doesn't exist yet
    if (!mapRef.current) {
      const container = document.getElementById('leaflet-map-container');
      if (container) {
        // We set the default view to Jakarta/Depok coordinates
        const map = L.map('leaflet-map-container', {
          zoomControl: true,
          scrollWheelZoom: true,
        }).setView([-6.368, 106.83], 12); // Depok UI Campus default
        
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
          attribution: '&copy; OpenStreetMap &copy; CARTO',
          subdomains: 'abcd',
          maxZoom: 20
        }).addTo(map);

        mapRef.current = map;
      }
    }

    const map = mapRef.current;
    if (!map) return;

    // Clear existing markers
    Object.values(markersRef.current).forEach((marker: any) => marker.remove());
    markersRef.current = {};

    // Add markers for current filteredProperties
    filteredProperties.forEach(p => {
      if (p.lat && p.lng) {
        const isSelected = selectedMapProperty?.id === p.id;
        
        const customIcon = L.divIcon({
          className: 'custom-leaflet-marker',
          html: `
            <div class="flex flex-col items-center cursor-pointer transform -translate-y-1/2">
              <div class="px-2 py-0.5 rounded-md text-[9px] font-black font-mono shadow-md border whitespace-nowrap transition-all ${
                isSelected 
                  ? 'bg-amber-500 text-black border-amber-600 font-extrabold scale-110 z-50' 
                  : 'bg-white text-[#2D3A44] border-[#DACFBE] hover:bg-[#F8F9FA]'
              }">
                Rp ${(p.price / 1000000).toFixed(1)}Jt
              </div>
              <div class="w-3 h-3 rounded-full border-2 border-white shadow-md transition-all ${
                isSelected 
                  ? 'bg-amber-500 scale-125 ring-4 ring-amber-500/30' 
                  : 'bg-[#2D3A44]'
              }"></div>
            </div>
          `,
          iconSize: [60, 42],
          iconAnchor: [30, 21]
        });

        const marker = L.marker([p.lat, p.lng], { icon: customIcon })
          .addTo(map)
          .on('click', () => {
            setSelectedMapProperty(p);
            map.setView([p.lat!, p.lng!], 14, { animate: true });
          });

        markersRef.current[p.id] = marker;
      }
    });

    // Fit map bounds to show all markers if there are any
    const validCoords = filteredProperties
      .filter(p => p.lat && p.lng)
      .map(p => [p.lat!, p.lng!] as [number, number]);

    if (validCoords.length > 0) {
      const bounds = L.latLngBounds(validCoords);
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
    }

  }, [filteredProperties, selectedMapProperty]);

  // Handle zooming/panning to property when selectedMapProperty changes outside map
  useEffect(() => {
    if (mapRef.current && selectedMapProperty?.lat && selectedMapProperty?.lng) {
      mapRef.current.setView([selectedMapProperty.lat, selectedMapProperty.lng], 14, { animate: true });
    }
  }, [selectedMapProperty]);

  // Clean up map on unmount
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

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
    <div className="bg-[#F8F9FA] min-h-screen text-brand-primary font-sans pb-16">
      
      {/* Dynamic Sub-header Navigation Bar */}
      <div className="bg-brand-primary border-b border-brand-steel/30 sticky top-[65px] z-40 px-4 md:px-8 py-3.5 shadow-sm flex justify-between items-center text-xs text-[#F8F9FA]">
        <div className="flex items-center gap-1.5 md:gap-3">
          <button 
            onClick={() => {
              setUserPage('home');
              setActiveProperty(null);
            }} 
            className={`font-semibold px-3 py-1.5 rounded-lg transition-all ${userPage === 'home' ? 'bg-brand-beige text-brand-primary font-extrabold shadow-sm' : 'text-slate-350 hover:text-white'}`}
          >
            Beranda
          </button>
          <button 
            onClick={() => {
              setUserPage('search');
              setActiveProperty(null);
            }} 
            className={`font-semibold px-3 py-1.5 rounded-lg transition-all ${userPage === 'search' ? 'bg-brand-beige text-brand-primary font-extrabold shadow-sm' : 'text-slate-350 hover:text-white'}`}
          >
            Cari & Sewa Kosan
          </button>
          {activeProperty && (
            <div className="flex items-center gap-2 text-slate-400">
              <ChevronRight size={12} />
              <span className="text-brand-beige font-bold bg-brand-steel/20 px-2.5 py-1 rounded-md border border-brand-steel/30">{activeProperty.name}</span>
            </div>
          )}
        </div>

        <div className="hidden sm:flex items-center gap-2 text-brand-beige/85 font-mono text-[10px]">
          <Sparkles size={12} className="text-brand-beige animate-pulse" />
          <span>GARANSI HARGA ALL-INCLUSIVE JUJUR</span>
        </div>
      </div>

      {/* ========================================================== */}
      {/* VIEW 1: HOME PAGE / LANDING PAGE */}
      {/* ========================================================== */}
      {userPage === 'home' && (
        <div className="space-y-16 animate-fade-in">
          
          {/* Hero Section & Large Search Bar with Real-time 3D Mouse Parallax */}
          <div 
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = (e.clientX - rect.left) / rect.width - 0.5; // -0.5 to 0.5
              const y = (e.clientY - rect.top) / rect.height - 0.5; // -0.5 to 0.5
              setHeroMouse({ x, y });
            }}
            onMouseLeave={() => {
              setHeroMouse({ x: 0, y: 0 });
            }}
            className="relative py-28 px-4 md:px-8 bg-gradient-to-br from-brand-primary via-brand-darker to-brand-primary border-b border-brand-steel/30 overflow-hidden text-[#F8F9FA] perspective-1000 preserve-3d"
          >
            {/* Background Image Layer - slow opposite movement for classic parallax */}
            <div 
              className="absolute inset-0 opacity-20 bg-cover bg-center select-none transition-transform duration-300 ease-out scale-110" 
              style={{ 
                backgroundImage: "url('https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=1200&q=80')",
                transform: `translate3d(${heroMouse.x * -25}px, ${heroMouse.y * -25}px, 0px)`
              }} 
            />
            
            {/* Overlay grid overlay pattern to increase high-end tech/professional vibe */}
            <div className="absolute inset-0 opacity-[0.03] bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:24px_24px]" />

            {/* Floating 3D Parallax Badges - faster motion in distinct planes */}
            <div 
              className="absolute hidden lg:flex items-center gap-3 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-4 top-16 left-12 shadow-xl transition-transform duration-500 ease-out select-none pointer-events-none"
              style={{
                transform: `translate3d(${heroMouse.x * 35}px, ${heroMouse.y * 35}px, 60px) rotate(${heroMouse.x * 8}deg)`
              }}
            >
              <div className="w-9 h-9 rounded-full bg-brand-beige flex items-center justify-center text-brand-primary text-xs font-black shadow">1K+</div>
              <div className="text-left">
                <p className="text-[10px] font-bold uppercase tracking-wider text-brand-beige">PENGHUNI AKTIF</p>
                <p className="text-[9px] text-slate-350">Sudah Menetap Nyaman</p>
              </div>
            </div>

            <div 
              className="absolute hidden lg:flex items-center gap-3 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-4 bottom-14 right-12 shadow-xl transition-transform duration-500 ease-out select-none pointer-events-none"
              style={{
                transform: `translate3d(${heroMouse.x * -45}px, ${heroMouse.y * -45}px, 80px) rotate(${heroMouse.y * -12}deg)`
              }}
            >
              <div className="w-9 h-9 rounded-full bg-[#F8F9FA] flex items-center justify-center text-brand-primary shadow">
                <Sparkles size={14} className="text-amber-500 animate-bounce" />
              </div>
              <div className="text-left">
                <p className="text-[10px] font-bold uppercase tracking-wider text-brand-beige">All-Inclusive</p>
                <p className="text-[9px] text-slate-350">Sewa Jujur Tanpa Admin</p>
              </div>
            </div>

            {/* Content Box with intermediate parallax value */}
            <div 
              className="max-w-6xl mx-auto relative z-10 text-center space-y-6 transition-transform duration-300 ease-out preserve-3d"
              style={{
                transform: `translate3d(${heroMouse.x * 12}px, ${heroMouse.y * 12}px, 20px)`
              }}
            >
              
              <div className="inline-flex items-center gap-2 bg-brand-beige/10 border border-brand-beige/25 px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wider text-brand-beige animate-pulse">
                <Sparkle size={13} className="fill-brand-beige" />
                SAMARA STAY EXCLUSIVE
              </div>

              <h1 className="text-4xl md:text-6xl font-black font-display tracking-tight leading-tight max-w-4xl mx-auto text-white">
                Standar Baru Hunian Modern yang Praktis.
              </h1>
              
              <p className="text-slate-200 text-sm md:text-base max-w-2xl mx-auto font-light leading-relaxed">
                Di mana pun cabangnya, nikmati kenyamanan kos eksklusif dengan sistem all-inclusive. Lengkap dengan Wi-Fi, token listrik, laundry, dan housekeeping berkala tanpa biaya tambahan.
              </p>

              {/* Large Interactive Search Bar with full 3D interactive tilt */}
              <form 
                onSubmit={handleSearchTrigger} 
                className="bg-white/95 backdrop-blur-md rounded-3xl p-5 md:p-6 border border-brand-beige/65 w-full max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 text-left shadow-2xl mt-12 text-brand-primary transition-all duration-300 ease-out"
                style={{
                  transform: `perspective(1000px) rotateX(${heroMouse.y * -8}deg) rotateY(${heroMouse.x * 8}deg) translate3d(${heroMouse.x * 15}px, ${heroMouse.y * 15}px, 35px)`,
                  transformStyle: 'preserve-3d'
                }}
              >
                
                <div className="transition-all duration-300 hover:translate-z-6">
                  <label className="block text-[10px] font-bold text-brand-steel uppercase tracking-widest mb-1.5 font-mono">CABANG YANG TERSEDIA</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 text-brand-taupe" size={16} />
                    <select
                      value={searchLocation}
                      onChange={(e) => setSearchLocation(e.target.value)}
                      className="w-full bg-[#F8F9FA] border border-brand-beige rounded-xl pl-9 pr-3 py-2.5 text-xs font-medium text-brand-primary focus:outline-none focus:border-brand-primary cursor-pointer"
                    >
                      <option value="">Semua Cabang</option>
                      {properties.map(p => (
                        <option key={p.id} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="transition-all duration-300 hover:translate-z-6">
                  <label className="block text-[10px] font-bold text-brand-steel uppercase tracking-widest mb-1.5 font-mono">TANGGAL MASUK</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-3 text-brand-taupe" size={16} />
                    <input 
                      type="date"
                      value={searchCheckInDate}
                      onChange={(e) => setSearchCheckInDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full bg-[#F8F9FA] border border-brand-beige rounded-xl pl-9 pr-3 py-2.5 text-xs font-mono text-brand-primary focus:outline-none focus:border-brand-primary"
                    />
                  </div>
                </div>

                <div className="flex items-end transition-all duration-300 hover:translate-z-8">
                  <button
                    type="submit"
                    className="w-full bg-brand-primary hover:bg-brand-steel text-white font-black py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer h-[42px]"
                  >
                    <Search size={15} />
                    CARI KOS SEKARANG
                  </button>
                </div>

              </form>

            </div>
          </div>

          {/* Fasilitas Standar Setiap Cabang */}
          <div className="max-w-7xl mx-auto px-4 md:px-8 space-y-8">
            <h2 className="text-2xl md:text-3xl font-black text-brand-primary font-display tracking-tight text-left">
              Fasilitas Standar Setiap Cabang
            </h2>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-4">
              {standardFacilities.map((fac, idx) => (
                <div 
                  key={idx} 
                  className="bg-white border border-brand-beige/85 rounded-3xl p-5 text-center flex flex-col items-center justify-center space-y-3 shadow-sm hover:shadow-md hover:border-emerald-600/30 transition-all duration-300"
                >
                  <div className="w-12 h-12 rounded-full bg-[#EEF7F0] flex items-center justify-center shadow-inner">
                    {renderSettingIcon(fac.icon)}
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-extrabold text-brand-primary text-xs leading-tight tracking-tight">{fac.title}</h4>
                    <p className="text-[11px] text-brand-steel font-medium">{fac.subtitle}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Rekomendasi Properti Terpopuler */}
          <div id="cabang-samara-stay-section" className="max-w-6xl mx-auto px-4 space-y-12 py-12">
            <div className="text-center space-y-2">
              <span className="text-[10px] md:text-xs font-bold text-[#1D603A] tracking-[0.2em] uppercase font-mono">
                LOKASI KAMI
              </span>
              <h2 className="text-3xl md:text-4xl font-bold text-brand-primary tracking-tight font-serif">
                Pilih Cabang Samara Stay
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-10">
              {properties.slice(0, 4).map((p, idx) => {
                const pRooms = rooms.filter(r => r.property_id === p.id);
                const availableCount = pRooms.filter(r => r.status === 'available').length;
                
                // Color themes alternating between green and navy precisely as requested
                const isGreen = idx % 2 === 0;
                const themeBadgeClass = isGreen ? 'bg-[#1D603A]' : 'bg-[#2E3545]';
                const themeBtnClass = isGreen 
                  ? 'bg-[#205D41] hover:bg-[#164731] text-white' 
                  : 'bg-[#374457] hover:bg-[#273241] text-white';

                // Determine beautiful taglines & descriptions based on actual data
                const tagLine = p.id === 1 
                  ? "Hunian Tenang di Jantung Jakarta Pusat" 
                  : p.id === 2 
                    ? "Hunian Minimalis Modern di Pusat Kota" 
                    : p.description?.split('.')[0] || "Hunian Nyaman, Strategis & Aman";

                const detailedDesc = p.id === 1
                  ? "Terletak di kawasan residensial yang asri dan tenang, Samara Stay Cempaka Putih menawarkan pengalaman tinggal premium dengan sentuhan alam yang menenangkan."
                  : p.id === 2
                    ? "Berlokasi sangat strategis di Kemayoran Jakarta, menghadirkan konsep hunian minimalis modern yang nyaman, tenang, dan fungsional untuk profesional muda dan mahasiswa."
                    : p.description?.split('.').slice(1).join('.').trim() || p.address;

                return (
                  <div 
                    key={p.id}
                    id={`cabang-card-${p.id}`}
                    className="bg-white border border-brand-beige rounded-[24px] overflow-hidden shadow-sm flex flex-col group transition-all duration-300 hover:shadow-md"
                  >
                    <div className="relative h-[280px] sm:h-[340px] bg-slate-100 overflow-hidden select-none">
                      <img 
                        src={p.image_url || "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=600&q=80"} 
                        alt={p.name}
                        className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-500"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute top-4 right-4">
                        <span className={`px-4 py-1 rounded-md text-[10px] font-bold text-white uppercase tracking-wider ${themeBadgeClass}`}>
                          Tersedia
                        </span>
                      </div>
                    </div>

                    <div className="p-6 md:p-8 flex-1 flex flex-col justify-between space-y-6 text-left">
                      <div className="space-y-3.5">
                        <h3 className="font-extrabold text-brand-primary text-xl md:text-2xl tracking-tight">
                          {p.name.replace("Kosan Ciputra", "Cempaka Putih").replace("Exclusive Putri", "Kemayoran Jakarta")}
                        </h3>
                        
                        <div className="flex items-start gap-1.5 text-brand-steel text-xs">
                          <MapPin size={15} className="text-brand-taupe shrink-0 mt-0.5" />
                          <span className="font-medium text-slate-500">{tagLine}</span>
                        </div>
                        
                        <p className="text-brand-steel text-xs font-light leading-relaxed">
                          {detailedDesc}
                        </p>
                      </div>

                      <div className="space-y-5 pt-5 border-t border-brand-beige/50">
                        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-3 text-brand-steel">
                            <span className="flex items-center gap-1 font-bold text-brand-primary">
                              <Star size={14} className="text-amber-500 fill-amber-500" />
                              4.9
                            </span>
                            <span className="w-1.5 h-1.5 rounded-full bg-brand-beige" />
                            <span className="font-medium">60+ penghuni</span>
                          </div>
                          
                          <div className="flex items-baseline gap-1">
                            <span className="text-brand-steel text-[10px] font-medium uppercase font-mono tracking-wider">Mulai Rp</span>
                            <span className="text-base font-extrabold text-brand-primary">
                              {p.price === 1800000 ? "3.200.000" : p.price === 2200000 ? "2.800.000" : formatRupiah(p.price).replace("Rp", "").trim()}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          id={`btn-detail-cabang-${p.id}`}
                          onClick={() => {
                            setActiveProperty(p);
                            setUserPage('detail');
                          }}
                          className={`w-fit inline-flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-xs cursor-pointer transition-all ${themeBtnClass}`}
                        >
                          Lihat Detail Cabang
                          <ArrowRight size={14} />
                        </button>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          </div>

          {/* Mengapa Memilih Samara */}
          <div className="bg-[#EEF7F0]/30 py-16 border-y border-brand-beige/50">
            <div className="max-w-6xl mx-auto px-4 grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
              <div className="md:col-span-5 space-y-4 text-left">
                <span className="text-[10px] font-extrabold text-[#2E6F40] tracking-widest uppercase font-mono bg-[#EEF7F0] px-3 py-1 rounded-md border border-[#2E6F40]/25">
                  Kenapa Samara Stay?
                </span>
                <h2 className="text-3xl font-black text-brand-primary font-display tracking-tight leading-tight">
                  Mengapa Memilih Samara Stay
                </h2>
                <p className="text-brand-steel text-sm font-light leading-relaxed">
                  Kami berkomitmen menyediakan standar hunian kost terbaik dengan kenyamanan ekstra, kepastian layanan, dan transparansi penuh tanpa ribet untuk kelancaran masa depan Anda.
                </p>
              </div>
              
              <div className="md:col-span-7 space-y-3">
                {whyChooseUs.map((item, idx) => (
                  <div 
                    key={idx} 
                    className="flex items-center gap-4 bg-white border border-brand-beige/60 p-4 rounded-2xl shadow-sm hover:shadow transition-all duration-250"
                  >
                    <div className="w-8 h-8 rounded-full bg-[#2E6F40] text-white flex items-center justify-center shrink-0 shadow-sm shadow-[#2E6F40]/15">
                      <Check size={14} className="stroke-[3]" />
                    </div>
                    <span className="font-extrabold text-brand-primary text-xs md:text-sm tracking-tight text-left">
                      {item}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Testimoni Penghuni */}
          <div className="bg-[#F8F9FA] py-16 border-y border-brand-beige">
            <div className="max-w-6xl mx-auto px-4 space-y-10">
              <div className="text-center space-y-3">
                <span className="text-[10px] font-extrabold text-brand-primary tracking-widest uppercase font-mono bg-brand-beige/35 px-2.5 py-1 rounded-md border border-brand-beige/70">Testimoni Penghuni</span>
                <h2 className="text-2xl font-black text-brand-primary">Dipercaya Oleh 1,000+ Penghuni Aktif</h2>
                <p className="text-brand-steel text-xs max-w-lg mx-auto font-light">Simak ulasan tulus dari rekan mahasiswa dan pekerja muda yang telah menetap nyaman bersama kami.</p>
              </div>

              {/* Interactive Testimonial Slider */}
              <div className="relative max-w-2xl mx-auto">
                <div className="overflow-hidden bg-white border border-brand-beige p-8 md:p-10 rounded-2xl shadow-sm relative group">
                  {/* Big quotation mark */}
                  <div className="absolute top-4 right-6 text-brand-beige/30 font-serif text-8xl pointer-events-none select-none leading-none">“</div>
                  
                  {/* Sliding quote text */}
                  <div className="space-y-6 min-h-[140px] flex flex-col justify-between relative z-10">
                    <p className="text-xs md:text-sm text-brand-primary italic font-light leading-relaxed">
                      "{testimonials[activeTestimonialIdx].text}"
                    </p>
                    <div className="flex items-center gap-3 pt-4 border-t border-brand-beige">
                      <div className={`w-10 h-10 rounded-full ${testimonials[activeTestimonialIdx].bgClass} text-white flex items-center justify-center font-extrabold font-mono text-xs shadow-md`}>
                        {testimonials[activeTestimonialIdx].initials}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-brand-primary">{testimonials[activeTestimonialIdx].name}</h4>
                        <p className="text-[10px] text-brand-steel font-mono">{testimonials[activeTestimonialIdx].role}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Left/Right Arrows */}
                <div className="flex justify-center items-center gap-4 mt-6">
                  <button
                    type="button"
                    onClick={() => setActiveTestimonialIdx(prev => (prev - 1 + testimonials.length) % testimonials.length)}
                    className="w-8 h-8 rounded-full border border-brand-beige bg-white text-brand-primary flex items-center justify-center hover:bg-brand-primary hover:text-white transition-all cursor-pointer shadow-sm"
                    title="Sebelumnya"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  
                  {/* Indicator Dots */}
                  <div className="flex gap-1.5">
                    {testimonials.map((_, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setActiveTestimonialIdx(idx)}
                        className={`h-1.5 rounded-full transition-all cursor-pointer ${
                          activeTestimonialIdx === idx ? 'w-5 bg-brand-primary' : 'w-1.5 bg-brand-beige hover:bg-brand-steel'
                        }`}
                        title={`Slide ${idx + 1}`}
                      />
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveTestimonialIdx(prev => (prev + 1) % testimonials.length)}
                    className="w-8 h-8 rounded-full border border-brand-beige bg-white text-brand-primary flex items-center justify-center hover:bg-brand-primary hover:text-white transition-all cursor-pointer shadow-sm"
                    title="Selanjutnya"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Pertanyaan yang Sering Diajukan (FAQ) */}
          <div className="max-w-4xl mx-auto px-4 py-16 space-y-8">
            <div className="text-center space-y-3">
              <h2 className="text-3xl font-black text-brand-primary font-display tracking-tight">
                Pertanyaan yang Sering Diajukan
              </h2>
              <p className="text-brand-steel text-sm font-light">
                Temukan jawaban untuk pertanyaan umum tentang Samara Stay
              </p>
            </div>

            <div className="space-y-4">
              {faqs.map((faq, idx) => {
                const isOpen = expandedFaq === idx;
                return (
                  <div 
                    key={idx} 
                    className="bg-white border border-brand-beige rounded-2xl overflow-hidden transition-all duration-300 shadow-sm"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedFaq(isOpen ? null : idx)}
                      className="w-full px-6 py-5 flex items-center justify-between gap-4 text-left font-extrabold text-xs md:text-sm text-brand-primary cursor-pointer hover:bg-[#F8F9FA]/50 transition-colors"
                    >
                      <span className="tracking-tight">{faq.question}</span>
                      <ChevronRight 
                        size={18} 
                        className={`text-brand-steel shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-90' : ''}`} 
                      />
                    </button>
                    {isOpen && (
                      <div className="px-6 pb-5 text-xs md:text-sm text-brand-steel font-light leading-relaxed border-t border-brand-beige/50 pt-4 bg-[#F8F9FA]/30 animate-fade-in text-left">
                        {faq.answer}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}

      {/* ========================================================== */}
      {/* VIEW 2: SEARCH & FILTER CATALOG (SPLIT SCREEN LAYOUT) */}
      {/* ========================================================== */}
      {userPage === 'search' && (
        <div className="max-w-7xl mx-auto px-4 md:px-8 mt-6 space-y-6 animate-fade-in text-brand-primary">
          
          {/* Header & Advanced Filter Bar */}
          <div className="bg-white border border-brand-beige rounded-3xl p-5 md:p-6 space-y-4 shadow-sm">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="space-y-1">
                <h2 className="text-xl font-black text-brand-primary font-display uppercase tracking-tight">Katalog Hasil Pencarian</h2>
                <p className="text-brand-steel text-xs font-light">
                  {searchMode === 'building' 
                    ? `Menemukan ${filteredProperties.length} gedung kos terbaik yang sesuai pilihan Anda.` 
                    : `Menemukan ${filteredRooms.length} kamar kos premium yang sesuai pilihan Anda.`}
                </p>
              </div>

              {/* Search Mode Toggle Selector */}
              <div className="flex bg-[#F8F9FA] border border-brand-beige p-0.5 rounded-xl text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => setSearchMode('building')}
                  className={`px-3 py-1.5 rounded-lg uppercase tracking-tight transition-all cursor-pointer ${searchMode === 'building' ? 'bg-brand-primary text-white shadow-md' : 'text-brand-steel hover:text-brand-primary'}`}
                >
                  Cari Gedung Kos
                </button>
                <button
                  type="button"
                  onClick={() => setSearchMode('room')}
                  className={`px-3 py-1.5 rounded-lg uppercase tracking-tight transition-all cursor-pointer ${searchMode === 'room' ? 'bg-brand-primary text-white shadow-md' : 'text-brand-steel hover:text-brand-primary'}`}
                >
                  Cari Kamar Langsung
                </button>
              </div>

              {/* Quick Location Search bar input inside catalogue */}
              <div className="relative w-full md:w-72">
                <Search className="absolute left-3 top-3 text-brand-taupe" size={14} />
                <input 
                  type="text"
                  placeholder={searchMode === 'building' ? "Cari jalan, area, atau kota..." : "Cari nomor kamar, nama kos, atau kota..."}
                  value={searchLocation}
                  onChange={(e) => setSearchLocation(e.target.value)}
                  className="w-full bg-[#F8F9FA] border border-brand-beige rounded-xl pl-9 pr-3 py-2 text-xs text-brand-primary placeholder-brand-steel/50 focus:outline-none focus:border-brand-primary font-medium"
                />
              </div>
            </div>

            {/* Filter Canggih (Advanced Filter Grid) */}
            <div className="border-t border-brand-beige pt-4 grid grid-cols-1 md:grid-cols-4 gap-6 text-xs">
              
              {/* Filter 1: Kebijakan/Gender */}
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-brand-steel uppercase tracking-widest font-mono">Kebijakan Hunian</label>
                <div className="flex bg-[#F8F9FA] border border-brand-beige p-0.5 rounded-xl">
                  {['all', 'putra', 'putri', 'campur'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setSelectedType(t as any)}
                      className={`flex-1 py-1.5 rounded-lg text-[9px] font-extrabold uppercase transition-all ${selectedType === t ? 'bg-brand-primary text-white shadow-md' : 'text-brand-steel hover:text-brand-primary'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filter 2: Budget Slider */}
              <div className="space-y-2 font-mono">
                <div className="flex justify-between items-center text-[10px] font-bold text-brand-steel uppercase tracking-widest">
                  <span>Anggaran Maksimal</span>
                  <span className="text-brand-primary">{formatRupiah(priceRange)}</span>
                </div>
                <input 
                  type="range"
                  min={1000000}
                  max={25000000}
                  step={200000}
                  value={priceRange}
                  onChange={(e) => setPriceRange(Number(e.target.value))}
                  className="w-full accent-brand-primary bg-[#F8F9FA] h-1 rounded-lg cursor-pointer border border-brand-beige"
                />
              </div>

              {/* Filter 3: Fasilitas Kamar */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-brand-steel uppercase tracking-widest font-mono">Fasilitas Kamar Mandi/Kamar</label>
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
                        className={`px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase border transition-all ${isChecked ? 'bg-brand-primary text-white border-brand-primary shadow-sm' : 'bg-[#F8F9FA] border-brand-beige text-brand-steel hover:text-brand-primary'}`}
                      >
                        {f}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Filter 4: Fasilitas Bersama */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-brand-steel uppercase tracking-widest font-mono">Fasilitas Komplek Bersama</label>
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
                        className={`px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase border transition-all ${isChecked ? 'bg-brand-primary text-white border-brand-primary shadow-sm' : 'bg-[#F8F9FA] border-brand-beige text-brand-steel hover:text-brand-primary'}`}
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
            
            {/* Sisi Kiri: Daftar Card Gedung Kosan atau Kamar Langsung (col-span-7) */}
            <div className="lg:col-span-7 space-y-4 max-h-[70vh] overflow-y-auto pr-2">
              {searchMode === 'building' ? (
                filteredProperties.length > 0 ? (
                  filteredProperties.map(p => {
                    const pRooms = rooms.filter(r => r.property_id === p.id);
                    const availableCount = pRooms.filter(r => r.status === 'available').length;
                    return (
                      <div
                        key={p.id}
                        onMouseEnter={() => setHoveredPropertyId(p.id)}
                        onMouseLeave={() => setHoveredPropertyId(null)}
                        className={`bg-white border rounded-2xl overflow-hidden flex flex-col sm:flex-row group transition-all duration-300 ${hoveredPropertyId === p.id ? 'border-brand-primary shadow-lg bg-[#F8F9FA]' : 'border-brand-beige'}`}
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
                                ? 'bg-brand-taupe text-[#F8F9FA] border border-brand-taupe/30' 
                                : p.type === 'putra' 
                                  ? 'bg-brand-steel text-[#F8F9FA] border border-brand-steel/30' 
                                  : 'bg-brand-primary text-[#F8F9FA] border border-brand-primary/30'
                            }`}>
                              KOS {p.type}
                            </span>
                          </div>
                        </div>

                        {/* Right Details */}
                        <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-start">
                              <h3 className="font-extrabold text-brand-primary text-base font-display group-hover:text-brand-steel transition-colors">{p.name}</h3>
                              <span className="text-[10px] text-brand-steel font-bold bg-[#F8F9FA] border border-brand-beige px-2 py-0.5 rounded-full uppercase">{availableCount} Unit Kosong</span>
                            </div>
                            
                            <div className="flex items-center gap-1.5 text-brand-steel text-xs">
                              <MapPin size={13} className="text-brand-taupe shrink-0" />
                              <span className="truncate max-w-sm">{p.address}</span>
                            </div>

                            <p className="text-[10px] text-brand-steel font-light flex items-center gap-1">
                              <Compass size={11} className="text-brand-taupe" />
                              <span>Jarak fasilitas publik: <strong>500m ke Stasiun / 10 menit jalan kaki</strong></span>
                            </p>
                          </div>

                          {/* Badges */}
                          <div className="flex flex-wrap gap-1">
                            {p.facilities.slice(0, 4).map(f => (
                              <span key={f} className="text-[9px] bg-[#F8F9FA] border border-brand-beige text-brand-steel font-semibold px-2 py-0.5 rounded-md">
                                {f}
                              </span>
                            ))}
                          </div>

                          {/* Footer details & Action */}
                          <div className="border-t border-brand-beige pt-3 flex items-center justify-between text-xs">
                            <div>
                              <span className="text-[9px] text-brand-steel block uppercase font-mono font-bold mb-0.5">Mulai Dari</span>
                              <span className="font-extrabold text-brand-primary font-mono text-base">{formatRupiah(p.price)}<span className="text-[10px] text-brand-steel font-sans font-light">/bln</span></span>
                            </div>

                            <button
                              onClick={() => {
                                setActiveProperty(p);
                                setUserPage('detail');
                              }}
                              className="bg-brand-primary hover:bg-brand-steel text-white font-extrabold py-2 px-3.5 rounded-xl text-[10px] transition-all cursor-pointer flex items-center gap-1.5 shadow-md"
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
                  <div className="bg-white border border-dashed border-brand-beige rounded-3xl p-16 text-center space-y-4">
                    <CompassIcon size={44} className="text-brand-steel mx-auto" />
                    <p className="text-brand-steel text-sm font-light">Kosan dengan kriteria pencarian tidak ditemukan. Silakan longgarkan filter filter Anda.</p>
                  </div>
                )
              ) : (
                // MODE: DIRECT INTERACTIVE ROOM SEARCH
                filteredRooms.length > 0 ? (
                  filteredRooms.map(r => {
                    const p = properties.find(prop => prop.id === r.property_id);
                    if (!p) return null;
                    return (
                      <div 
                        key={r.id} 
                        className="bg-white border border-brand-beige rounded-2xl p-5 flex flex-col sm:flex-row gap-5 hover:border-brand-primary hover:shadow-lg transition-all duration-300 group"
                      >
                        {/* Room image or fallback */}
                        <div className="w-full sm:w-44 h-36 bg-slate-900 shrink-0 rounded-xl relative overflow-hidden">
                          <img 
                            src={r.image_url || p.image_url || "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=400&q=80"} 
                            alt={`Kamar ${r.room_number}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-all duration-500"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute top-2.5 left-2.5">
                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase font-mono border ${
                              r.status === 'available' 
                                ? 'bg-emerald-500 text-white border-emerald-600' 
                                : r.status === 'occupied' 
                                  ? 'bg-amber-500 text-black border-amber-600' 
                                  : 'bg-rose-500 text-white border-rose-600'
                            }`}>
                              {r.status === 'available' ? 'KOSONG' : r.status === 'occupied' ? 'TERISI' : 'PERBAIKAN'}
                            </span>
                          </div>
                        </div>

                        {/* Room Details */}
                        <div className="flex-1 flex flex-col justify-between space-y-2.5 min-w-0">
                          <div className="space-y-1">
                            <div className="flex justify-between items-start gap-2">
                              <div className="truncate">
                                <span className="text-[8px] font-mono font-extrabold uppercase text-brand-steel bg-brand-beige/40 px-2 py-0.5 rounded-md mr-1.5">{r.room_type}</span>
                                <h3 className="font-extrabold text-brand-primary text-base font-display inline-block font-sans">Kamar No. {r.room_number}</h3>
                              </div>
                              <span className="text-[9px] font-mono text-brand-steel bg-[#F8F9FA] border border-brand-beige px-2 py-0.5 rounded-full uppercase shrink-0">Lantai {r.floor} ({r.size_sqm} m²)</span>
                            </div>
                            
                            <p className="text-[11px] font-bold text-brand-primary flex items-center gap-1 leading-none mt-1">
                              <Building2 size={12} className="text-brand-taupe shrink-0" />
                              <span className="truncate">{p.name}</span>
                            </p>
                            <p className="text-[10px] text-brand-steel font-light flex items-center gap-1">
                              <MapPin size={11} className="text-brand-taupe shrink-0" />
                              <span className="truncate">{p.address}</span>
                            </p>
                          </div>

                          {/* Facilities */}
                          <div className="flex flex-wrap gap-1">
                            {r.facilities.slice(0, 5).map(f => (
                              <span key={f} className="text-[8px] bg-[#F8F9FA] border border-brand-beige text-brand-steel px-1.5 py-0.5 rounded-md font-medium">
                                {f}
                              </span>
                            ))}
                          </div>

                          {/* Footer / Action */}
                          <div className="border-t border-brand-beige pt-2 flex items-center justify-between text-xs gap-3">
                            <div>
                              <span className="text-[8px] text-brand-steel block uppercase font-mono font-bold leading-none mb-0.5">Biaya Sewa</span>
                              <span className="font-extrabold text-brand-primary font-mono text-sm">{formatRupiah(r.price)}<span className="text-[9px] text-brand-steel font-sans font-light">/bln</span></span>
                            </div>

                            <div className="flex gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveProperty(p);
                                  setUserPage('detail');
                                }}
                                className="border border-brand-beige hover:border-brand-steel text-brand-steel font-bold py-1.5 px-3 rounded-xl text-[10px] transition-all cursor-pointer"
                              >
                                Detail Kos
                              </button>
                              <button
                                type="button"
                                disabled={r.status !== 'available'}
                                onClick={() => {
                                  setActiveProperty(p);
                                  setActiveRoom(r);
                                  setCheckoutFlow('monthly');
                                }}
                                className={`font-extrabold py-1.5 px-3 rounded-xl text-[10px] transition-all cursor-pointer flex items-center gap-1 shadow-md ${
                                  r.status === 'available' 
                                    ? 'bg-brand-primary hover:bg-brand-steel text-white' 
                                    : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed shadow-none'
                                }`}
                              >
                                Pesan Sekarang
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="bg-white border border-dashed border-brand-beige rounded-3xl p-16 text-center space-y-4">
                    <CompassIcon size={44} className="text-brand-steel mx-auto" />
                    <p className="text-brand-steel text-sm font-light">Kamar dengan kriteria pencarian tidak ditemukan. Silakan sesuaikan filter Anda.</p>
                  </div>
                )
              )}
            </div>

            {/* Sisi Kanan: Peta Interaktif (Interactive Stylized Map) (col-span-5) */}
            <div className="lg:col-span-5 bg-white border border-brand-beige rounded-3xl p-4 overflow-hidden relative flex flex-col justify-between shadow-sm min-h-[300px] h-fit lg:h-[70vh] select-none text-brand-primary">
              
              {/* Map header */}
              <div className="bg-[#F8F9FA] border border-brand-beige p-2.5 rounded-xl flex items-center justify-between text-[10px] font-mono z-10">
                <span className="text-brand-primary font-extrabold flex items-center gap-1">
                  <Map size={12} />
                  MAP INTERAKTIF COVENANT
                </span>
                <span className="text-brand-steel">Real-time Coordinates</span>
              </div>

              {/* Styled Visual Map: Leaflet Interactive Map */}
              <div className="flex-1 relative rounded-2xl overflow-hidden border border-brand-beige my-3 min-h-[320px] bg-slate-100 z-10">
                <div id="leaflet-map-container" className="w-full h-full min-h-[320px] absolute inset-0"></div>

                {/* Selected Map Property Bubble popup overlay */}
                {selectedMapProperty && (
                  <div className="absolute bottom-3 left-3 right-3 bg-slate-950/95 border border-slate-800 rounded-xl p-3 shadow-2xl flex gap-3 z-[1000] animate-fade-in-up backdrop-blur-md">
                    <img 
                      src={selectedMapProperty.image_url || "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=150&q=80"}
                      alt={selectedMapProperty.name}
                      className="w-16 h-16 object-cover rounded-lg bg-slate-900 shrink-0"
                    />
                    <div className="flex-1 flex flex-col justify-between text-xs min-w-0">
                      <div>
                        <div className="flex justify-between items-center gap-2">
                          <h4 className="font-extrabold text-white truncate">{selectedMapProperty.name}</h4>
                          <button 
                            onClick={() => setSelectedMapProperty(null)}
                            className="text-slate-400 hover:text-white shrink-0 cursor-pointer"
                          >
                            <X size={12} />
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-400 truncate mt-0.5">{selectedMapProperty.address}</p>
                      </div>
                      
                      <div className="flex justify-between items-center pt-1 gap-2">
                        <span className="font-bold text-amber-500 font-mono text-[11px] whitespace-nowrap">{formatRupiah(selectedMapProperty.price)}<span className="text-[9px] text-slate-500 font-sans font-light">/bln</span></span>
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
              {(() => {
                const galleryImages = activeProperty.images || [];
                const defaultUrls = [
                  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=600&q=80",
                  "https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?auto=format&fit=crop&w=600&q=80",
                  "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=600&q=80",
                  "https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&w=600&q=80"
                ];
                const labels = ["Ruang Kamar", "Kamar Mandi", "Area Bersama", "Rooftop Lounge"];
                
                return [0, 1, 2, 3].map((idx) => {
                  const url = galleryImages[idx] || defaultUrls[idx];
                  const label = labels[idx];
                  return (
                    <div 
                      key={idx} 
                      className="rounded-xl overflow-hidden h-full bg-slate-900 select-none relative group cursor-zoom-in"
                      onClick={() => setSelectedRoomImage(url)}
                    >
                      <img 
                        src={url} 
                        alt={label}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute bottom-2 left-2 bg-black/65 px-2 py-1 rounded-md text-[9px] font-semibold text-white tracking-wide">{label}</div>
                    </div>
                  );
                });
              })()}
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
                  <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                    TERVERIFIKASI
                  </span>
                </div>

                <h1 className="text-3xl font-black text-white font-display uppercase tracking-tight">{activeProperty.name}</h1>
                
                <div className="flex items-center gap-1.5 text-slate-350 text-sm font-light">
                  <MapPin size={15} className="text-amber-500 shrink-0" />
                  <span>{activeProperty.address}</span>
                </div>
              </div>

              {/* Deskripsi Hunian */}
              <div className="bg-[#121215] border border-slate-800 p-6 rounded-3xl space-y-3.5 shadow-xl">
                <h3 className="text-sm font-black text-white uppercase tracking-tight flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-amber-500 rounded-full"></span>
                  Deskripsi Hunian
                </h3>
                <p className="text-slate-300 leading-relaxed font-light text-xs whitespace-pre-line">
                  {activeProperty.description || "Hunian eksklusif berfasilitas komplit, berlokasi sangat strategis dekat area komersial, pusat perkantoran, dan kampus ternama. Lingkungan asri, tenang, aman dan nyaman untuk ditinggali."}
                </p>
              </div>

              {/* Detail Fasilitas Kompleks */}
              <div className="space-y-4 border-b border-slate-800 pb-6">
                <h3 className="text-xs font-bold text-slate-450 uppercase tracking-widest font-mono flex items-center gap-2">
                  <Grid size={14} className="text-amber-500" />
                  Fasilitas Kompleks Gedung
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {activeProperty.facilities.map((fac, idx) => {
                    let iconNode = <Wifi size={14} className="text-amber-500" />;
                    if (fac.toLowerCase().includes('dapur')) iconNode = <Utensils size={14} className="text-amber-500" />;
                    if (fac.toLowerCase().includes('parkir')) iconNode = <Car size={14} className="text-amber-500" />;
                    if (fac.toLowerCase().includes('wifi') || fac.toLowerCase().includes('internet')) iconNode = <Wifi size={14} className="text-amber-500" />;
                    if (fac.toLowerCase().includes('ac') || fac.toLowerCase().includes('pendingin')) iconNode = <Zap size={14} className="text-amber-500" />;
                    if (fac.toLowerCase().includes('tv') || fac.toLowerCase().includes('televisi')) iconNode = <Tv size={14} className="text-amber-500" />;

                    return (
                      <div key={idx} className="bg-[#121215] border border-slate-800 p-3.5 rounded-xl flex items-center gap-3">
                        {iconNode}
                        <span className="font-semibold text-slate-200 capitalize">{fac}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ATURAN & TATA TERTIB HUNIAN (PAPIPOST & RUKITA STYLE) */}
              <div className="bg-[#121215] border border-slate-800 p-6 rounded-3xl space-y-6 shadow-xl">
                <h3 className="text-sm font-black text-white uppercase tracking-tight flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-amber-500 rounded-full"></span>
                  Kebijakan & Peraturan Hunian
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Aturan Tambahan Penghuni */}
                  <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-2xl space-y-2.5">
                    <h4 className="font-extrabold text-amber-450 font-sans text-xs flex items-center gap-1.5">
                      <BookOpen size={14} className="text-amber-500" />
                      Aturan Tambahan Penghuni
                    </h4>
                    <p className="text-slate-400 font-light text-[11px] leading-relaxed whitespace-pre-line">
                      {activeProperty.additional_rules || "1. Tamu lawan jenis dilarang menginap.\n2. Tidak boleh membawa binatang peliharaan.\n3. Harap menghormati privasi sesama penghuni kos."}
                    </p>
                  </div>

                  {/* Kebijakan Hunian */}
                  <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-2xl space-y-2.5">
                    <h4 className="font-extrabold text-amber-450 font-sans text-xs flex items-center gap-1.5">
                      <Shield size={14} className="text-amber-500" />
                      Kebijakan Hunian
                    </h4>
                    <p className="text-slate-400 font-light text-[11px] leading-relaxed whitespace-pre-line">
                      {activeProperty.policies || "Masa tinggal minimal ditentukan saat check-in awal. Pengembalian dana sisa masa sewa mengikuti aturan tertulis yang berlaku."}
                    </p>
                  </div>

                  {/* Ketentuan Sewa */}
                  <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-2xl space-y-2.5">
                    <h4 className="font-extrabold text-amber-450 font-sans text-xs flex items-center gap-1.5">
                      <Info size={14} className="text-amber-500" />
                      Ketentuan Sewa & Deposit
                    </h4>
                    <p className="text-slate-400 font-light text-[11px] leading-relaxed whitespace-pre-line">
                      {activeProperty.terms || "Uang jaminan deposit (refundable) sebesar Rp 500.000 wajib dilunasi sebelum serah terima kunci properti dan disetujui pengelola."}
                    </p>
                  </div>

                  {/* Tata Tertib */}
                  <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-2xl space-y-2.5">
                    <h4 className="font-extrabold text-amber-450 font-sans text-xs flex items-center gap-1.5">
                      <Clock size={14} className="text-amber-500" />
                      Tata Tertib Lingkungan
                    </h4>
                    <p className="text-slate-400 font-light text-[11px] leading-relaxed whitespace-pre-line">
                      {activeProperty.regulations || "1. Jam kunjung tamu dibatasi hingga pukul 22:00 WIB.\n2. Dilarang membuat kegaduhan suara setelah jam malam.\n3. Sampah wajib dibuang pada tempatnya."}
                    </p>
                  </div>
                </div>
              </div>

              {/* DAFTAR KAMAR YANG TERSEDIA - RUKITA & PAPIPOST PREMIUM LIST */}
              <div id="list-kamar-section" className="bg-[#121215] border border-slate-800 p-6 rounded-3xl space-y-5 shadow-xl">
                <div className="flex justify-between items-center border-b border-slate-800/80 pb-3">
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-tight flex items-center gap-2">
                      <span className="w-1.5 h-4 bg-amber-500 rounded-full"></span>
                      Daftar Tipe Kamar & Unit
                    </h3>
                    <p className="text-[10px] text-slate-400 font-light mt-0.5">Pilih kamar terbaik yang sesuai dengan budget dan kenyamanan Anda</p>
                  </div>
                  <span className="text-[10px] font-extrabold font-mono text-amber-500 bg-amber-500/10 px-2 py-1 rounded">
                    {rooms.filter(r => r.property_id === activeProperty.id && r.status === 'available').length} UNIT KOSONG
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {rooms.filter(r => r.property_id === activeProperty.id).map(r => {
                    const isAvailable = r.status === 'available';
                    const isSelected = activeRoom?.id === r.id;
                    return (
                      <div
                        key={r.id}
                        onClick={() => {
                          if (isAvailable) {
                            setActiveRoom(r);
                          }
                        }}
                        className={`p-4 rounded-2xl border text-left flex flex-col justify-between gap-4 transition-all duration-300 cursor-pointer ${
                          !isAvailable 
                            ? 'bg-slate-950/40 border-slate-900 opacity-60' 
                            : isSelected
                              ? 'border-amber-500 bg-amber-500/5 shadow-lg ring-1 ring-amber-500/60 scale-[1.01]'
                              : 'border-slate-800 bg-slate-950/50 hover:border-slate-700 hover:bg-slate-950/90'
                        }`}
                      >
                        <div className="space-y-3">
                          {/* Room Picture Area */}
                          {r.image_url ? (
                            <div className="w-full h-36 rounded-xl overflow-hidden bg-slate-900 border border-slate-850 relative group">
                              <img 
                                src={r.image_url} 
                                alt={`Kamar ${r.room_number}`} 
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              />
                              <div className="absolute top-2 left-2 bg-black/75 px-2 py-0.5 rounded text-[8px] font-bold text-white tracking-wide uppercase">
                                LANTAI {r.floor}
                              </div>
                              <div className="absolute bottom-2 right-2 bg-black/80 px-2.5 py-1 rounded-md text-[9px] font-semibold text-white">
                                {r.size_sqm} m²
                              </div>
                            </div>
                          ) : (
                            <div className="w-full h-36 rounded-xl bg-slate-900/65 border border-slate-850 shrink-0 flex flex-col items-center justify-center gap-1.5 text-slate-500">
                              <Bed size={22} className="text-slate-500 animate-pulse" />
                              <span className="text-[9px] font-mono tracking-wider uppercase">Tidak ada foto</span>
                            </div>
                          )}

                          {/* Room Header Info */}
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-start">
                              <div className="font-extrabold text-white text-base font-display flex items-center gap-1.5 flex-wrap">
                                Unit {r.room_number}
                                <span className="text-[8px] font-extrabold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.2 rounded font-sans uppercase">
                                  {r.room_type}
                                </span>
                              </div>

                              <span className={`px-2 py-0.5 rounded-full text-[8px] font-extrabold uppercase font-mono border ${
                                isAvailable 
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                  : 'bg-white/5 text-slate-500 border-white/10'
                              }`}>
                                {isAvailable ? 'Tersedia' : 'Terisi'}
                              </span>
                            </div>

                            {/* Facilities small preview */}
                            <div className="flex flex-wrap gap-1">
                              {r.facilities.map(f => (
                                <span key={f} className="text-[8px] bg-slate-900 border border-slate-850 text-slate-400 px-1.5 py-0.2 rounded">
                                  {f}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Price sheet and transaction CTAs */}
                        <div className="border-t border-slate-850 pt-3 space-y-3">
                          <div className="bg-slate-900/40 p-2.5 rounded-xl border border-slate-850/60 text-center">
                            <span className="text-[8px] text-slate-500 uppercase block font-mono">Sewa Bulanan</span>
                            <span className="font-black text-amber-500 text-sm font-mono">{formatRupiah(r.price)} <span className="text-[9px] text-slate-450 font-normal">/ bulan</span></span>
                          </div>

                          {isAvailable ? (
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectRoom(r, 'survey');
                                }}
                                className="w-full bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-350 py-2 rounded-xl text-[9px] font-extrabold transition-all text-center uppercase font-mono cursor-pointer"
                              >
                                Survey Hunian
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectRoom(r, 'monthly');
                                }}
                                className="w-full bg-amber-500 hover:bg-amber-600 text-black py-2 rounded-xl text-[9px] font-extrabold transition-all text-center uppercase font-mono cursor-pointer"
                              >
                                Pesan Kamar
                              </button>
                            </div>
                          ) : (
                            <div className="bg-slate-900 border border-slate-850 rounded-xl py-2 text-center text-slate-500 font-extrabold text-[9px] uppercase font-mono">
                              Unit Sudah Terisi Penghuni
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {rooms.filter(r => r.property_id === activeProperty.id).length === 0 && (
                    <p className="text-[10px] text-slate-500 py-12 text-center font-mono col-span-2">Properti ini tidak memiliki unit kamar terdaftar.</p>
                  )}
                </div>
              </div>

              {/* Immersive 360° Virtual Tour / Video Showcase section */}
              <div className="bg-gradient-to-br from-indigo-950/20 via-[#121215] to-[#121215] border border-indigo-500/10 p-6 rounded-3xl space-y-4 shadow-xl">
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
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-4 py-2.5 rounded-xl text-[10px] font-mono tracking-wide uppercase shadow-lg transition-colors flex items-center gap-2 cursor-pointer shadow-indigo-600/10 animate-pulse"
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
                <h3 className="text-xs font-bold text-slate-450 uppercase tracking-widest font-mono flex items-center gap-2">
                  <MapPinned size={14} className="text-amber-500" />
                  Lokasi & Sekitar (Hotspots)
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Distances Hotspots List */}
                  <div className="bg-[#121215] border border-slate-800 p-5 rounded-2xl space-y-3 shadow-xl">
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
                  <div className="bg-[#121215] border border-slate-800 rounded-2xl p-4 overflow-hidden relative flex flex-col justify-between min-h-[160px] h-full shadow-xl">
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
              
              <div className="bg-[#121215] border border-slate-800 rounded-3xl p-5 md:p-6 space-y-5 shadow-xl sticky top-[135px]">
                {activeRoom ? (
                  /* GORGEOUS ACTIVE ROOM SELECTION DETAILS (RUKITA / PAPIPOST ASSISTANT) */
                  <div className="space-y-4 animate-fade-in">
                    <div className="border-b border-slate-800 pb-3">
                      <span className="text-[9px] text-amber-500 font-mono font-bold uppercase tracking-wider block">ASISTEN RESERVASI</span>
                      <h3 className="text-base font-black text-white uppercase tracking-tight">Kamar Terpilih</h3>
                      <p className="text-[10px] text-slate-400 font-light mt-0.5">Konfirmasi tipe sewa dan rincian harga sewa Anda langsung di bawah ini:</p>
                    </div>

                    <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-850/80 flex gap-3">
                      {activeRoom.image_url ? (
                        <img 
                          src={activeRoom.image_url} 
                          alt={`Kamar ${activeRoom.room_number}`} 
                          className="w-14 h-14 object-cover rounded-xl border border-slate-800"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center">
                          <Bed size={16} className="text-slate-500" />
                        </div>
                      )}
                      <div>
                        <div className="font-extrabold text-white text-xs">Unit {activeRoom.room_number}</div>
                        <div className="text-[9px] font-mono text-slate-400 mt-0.5">Tipe: {activeRoom.room_type}</div>
                        <div className="text-[9px] text-slate-500">Lantai {activeRoom.floor} / {activeRoom.size_sqm}m²</div>
                      </div>
                    </div>

                    {/* Quick Calculator */}
                    <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-850 text-[11px] space-y-2 font-mono">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Skema Sewa</span>
                        <span className="text-amber-500 font-bold">Bulanan (Sewa Tetap)</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-850/40 pt-1.5">
                        <span className="text-slate-500">Tarif Dasar Bulanan</span>
                        <span className="text-slate-300">
                          {formatRupiah(activeRoom.price)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">PBJT Tax (10%)</span>
                        <span className="text-slate-300">
                          {formatRupiah(Math.floor(activeRoom.price * 0.1))}
                        </span>
                      </div>
                      <div className="flex justify-between border-t border-slate-850/80 pt-1.5 font-bold">
                        <span className="text-amber-500">Estimasi Total</span>
                        <span className="text-amber-500">
                          {formatRupiah(Math.floor(activeRoom.price * 1.1))}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSelectRoom(activeRoom, checkoutFlow === 'none' ? 'monthly' : checkoutFlow)}
                      className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-black text-[10px] font-black uppercase font-mono tracking-wider rounded-xl transition shadow-xl shadow-amber-500/10 cursor-pointer text-center"
                    >
                      Lanjutkan Formulir Pemesanan
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveRoom(null)}
                      className="w-full py-2 bg-slate-900 hover:bg-slate-850 text-slate-450 text-[9px] font-bold uppercase tracking-wide rounded-xl border border-slate-850 cursor-pointer text-center"
                    >
                      Pilih Unit Kamar Lain
                    </button>
                  </div>
                ) : (
                  /* DEFAULT SIDEBAR WITH TRUST FACTORS (RUKITA / PAPIPOST VALUE ADD) */
                  <div className="space-y-4">
                    <div className="border-b border-slate-800 pb-3">
                      <span className="text-[10px] text-amber-500 font-mono font-bold uppercase tracking-wider block">PEMESANAN INSTAN</span>
                      <h3 className="text-sm font-black text-white uppercase tracking-tight">Samara Booking Center</h3>
                      <p className="text-[10px] text-slate-400 font-light mt-0.5">Gunakan platform online terpercaya untuk memesan kamar Anda langsung:</p>
                    </div>

                    <div className="space-y-3">
                      <div className="flex gap-2.5 bg-slate-950/60 p-3 rounded-2xl border border-slate-850">
                        <Shield className="text-amber-500 shrink-0 mt-0.5" size={15} />
                        <div>
                          <h4 className="text-white font-extrabold text-[11px]">Bebas Biaya Administrasi</h4>
                          <p className="text-[9px] text-slate-500 leading-normal">Semua booking kamar di Samara Stay tidak dipungut biaya admin tersembunyi.</p>
                        </div>
                      </div>

                      <div className="flex gap-2.5 bg-slate-950/60 p-3 rounded-2xl border border-slate-850">
                        <CheckCircle className="text-amber-500 shrink-0 mt-0.5" size={15} />
                        <div>
                          <h4 className="text-white font-extrabold text-[11px]">Data Unit Terverifikasi</h4>
                          <p className="text-[9px] text-slate-500 leading-normal">Status dan harga yang tertera adalah data terkini langsung dari sistem super admin.</p>
                        </div>
                      </div>

                      <div className="flex gap-2.5 bg-slate-950/60 p-3 rounded-2xl border border-slate-850">
                        <Sparkles className="text-amber-500 shrink-0 mt-0.5" size={15} />
                        <div>
                          <h4 className="text-white font-extrabold text-[11px]">Jaminan Keamanan Kamar</h4>
                          <p className="text-[9px] text-slate-500 leading-normal">Kunci kamar terintegrasi & sistem backup kelistrikan optimal 24 jam nonstop.</p>
                        </div>
                      </div>
                    </div>

                    <div className="p-3.5 bg-amber-500/5 rounded-2xl border border-amber-500/20 text-center space-y-1.5">
                      <p className="text-amber-450 font-extrabold text-[10px] uppercase font-mono tracking-wider">Mulai Reservasi Anda</p>
                      <p className="text-slate-400 text-[10px] leading-relaxed">
                        Silakan gulir ke bawah pada bagian <strong>"Daftar Tipe Kamar & Unit"</strong> di sebelah kiri, kemudian klik <strong>Pesan Kamar</strong> untuk memulai booking instan!
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          const el = document.getElementById('list-kamar-section');
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth' });
                          }
                        }}
                        className="mt-1 inline-flex items-center gap-1.5 text-[9px] font-black text-amber-500 hover:text-amber-450 uppercase tracking-widest font-mono cursor-pointer"
                      >
                        Lihat Kamar <ArrowRight size={10} />
                      </button>
                    </div>
                  </div>
                )}
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
                      checkoutFlow === 'monthly' ? 'bg-amber-500 text-black' : 'bg-slate-850 text-slate-400'
                    }`}
                  >
                    Bulanan
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setCheckoutFlow('survey')}
                    className={`px-3 py-1 rounded-lg text-[9px] font-bold uppercase ${
                      checkoutFlow === 'survey' ? 'bg-emerald-500 text-white' : 'bg-slate-850 text-slate-400'
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

      {/* Zoomed/Expanded image viewer modal */}
      {selectedRoomImage && (
        <div 
          className="fixed inset-0 bg-black/90 z-[9999] flex flex-col items-center justify-center p-4 md:p-8 select-none animate-fade-in"
          onClick={() => setSelectedRoomImage(null)}
        >
          <div className="absolute top-4 right-4 flex gap-3 z-[10000]">
            <button 
              onClick={() => setSelectedRoomImage(null)}
              className="p-2.5 bg-slate-900/80 hover:bg-slate-800 text-white rounded-full transition border border-slate-800 cursor-pointer shadow-xl flex items-center justify-center"
            >
              <X size={20} />
            </button>
          </div>
          
          <div 
            className="relative max-w-5xl max-h-[85vh] w-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img 
              src={selectedRoomImage} 
              alt="Pratinjau Kamar Terbuka" 
              className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl border border-slate-850 animate-fade-in"
              referrerPolicy="no-referrer"
            />
          </div>
          <p className="text-slate-400 text-xs font-mono tracking-wider mt-4 text-center">Klik di luar gambar atau tombol X untuk menutup pratinjau</p>
        </div>
      )}

    </div>
  );
}

