import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { database, DEFAULT_OWNER_SIGNATURE, normalizeFacilityList, inferFacilityIcon } from '../lib/supabase';
import { DEFAULT_FACILITIES } from '../data/fallbackData';
import { todayJakarta, toJakartaDate } from '../lib/dateUtils';
import { pollWithBackoff } from '../lib/queryBudget';
import { useRealtimeTable } from '../hooks/useRealtimeTable';
import * as LucideIcons from 'lucide-react';
import { Property, Room, Booking, Survey, Coupon, SystemSettings, StandardFacility, FAQItem, Tenant, ContractExtension } from '../types';
import BookingForm from '../components/transaction/BookingForm';
import InvoiceCard from '../components/transaction/InvoiceCard';
import Loader from '../components/common/Loader';
import Modal from '../components/common/Modal';
import { compressImage, ensurePngDataUrl } from '../utils/imageCompressor';
import { uploadToSupabaseStorage } from '../utils/storageUploader';
import { resolveCoupleNames } from '../utils/pdfGenerator';
import { 
  Sparkles, HelpCircle, Phone, BookOpen, Clock, HardDrive, Shield,
  MapPin, Wifi, Zap, ChevronLeft, ChevronDown, Building2, Search, Calendar, Map, 
  User, CheckCircle, Heart, Tv, Utensils, Car, Info, X, Bed, RotateCw, 
  Play, Volume2, ArrowRight, Star, AlertCircle, ChevronRight, MapPinned,
  Shirt, Sparkle, Compass, Grid, MapIcon, CompassIcon, InfoIcon, LogIn, Droplet, Check,
  MessageSquare, Mail, UploadCloud, ExternalLink, Globe, Languages
} from 'lucide-react';
import PremiumSearchFilter from '../components/premium/PremiumSearchFilter';
import PremiumRoomGrid from '../components/premium/PremiumRoomGrid';
import PropertyMapView from '../components/map/PropertyMapView';
import { PropertyNearbyPlaces } from '../components/property/PropertyNearbyPlaces';
import { sanitizePropertyCoordinates, isValidCoordinate } from '../utils/mapCoordinates';
import { 
  createGoogleMapsRoadmapLayer, 
  getGoogleMapsSearchUrl, 
  getGoogleMapsDirectionsUrl 
} from '../utils/mapTiles';
import PropertyDetailView, {
  getPropertySlug,
  getUrlPropertyParameter,
  updateUrlPropertyParam,
  findPropertyByUrlParam
} from '../components/PropertyDetailView';

interface HomeProps {}

// Interactive Detail Map Component for selected property cabang
const PropertyDetailMap: React.FC<{ property: Property; onOpenFullMap?: () => void }> = ({ property, onOpenFullMap }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [tileError, setTileError] = useState(false);

  const coords = sanitizePropertyCoordinates(property);
  const lat = coords.lat;
  const lng = coords.lng;
  const hasValid = isValidCoordinate(lat, lng);

  useEffect(() => {
    if (!containerRef.current || !hasValid) return;

    if (mapRef.current) {
      try {
        mapRef.current.remove();
      } catch (e) {
        console.warn('Cleanup leaflet map error:', e);
      }
      mapRef.current = null;
    }

    const map = L.map(containerRef.current, {
      zoomControl: true,
      scrollWheelZoom: false,
    }).setView([lat, lng], 16);

    createGoogleMapsRoadmapLayer(
      {},
      (hasError) => setTileError(hasError)
    ).addTo(map);

    const customIcon = L.divIcon({
      className: 'custom-leaflet-detail-marker',
      html: `
        <div class="flex flex-col items-center cursor-pointer transform -translate-y-1/2 scale-110 z-50">
          <div class="px-3 py-1 rounded-xl text-[10px] font-black font-mono shadow-xl bg-[#2E6F40] text-white border-2 border-white whitespace-nowrap">
            📍 ${property.name}
          </div>
          <div class="w-3.5 h-3.5 rounded-full border-2 border-white shadow-lg bg-amber-500 ring-4 ring-amber-500/30 -mt-1"></div>
        </div>
      `,
      iconSize: [120, 50],
      iconAnchor: [60, 25]
    });

    const marker = L.marker([lat, lng], { icon: customIcon }).addTo(map);

    const popupHtml = `
      <div style="font-family: system-ui, -apple-system, sans-serif; padding: 4px; max-width: 230px;">
        <div style="font-size: 9px; font-weight: 800; color: #EA4335; text-transform: uppercase; margin-bottom: 2px;">📍 Google Maps</div>
        <strong style="font-size: 12px; color: #1e293b; display: block; margin-bottom: 2px;">${property.name}</strong>
        <p style="font-size: 10px; color: #64748B; margin: 0 0 4px 0; line-height: 1.3;">${property.address}</p>
        <div style="font-size: 9px; font-mono; color: #059669; font-weight: bold; margin-bottom: 6px;">${lat.toFixed(6)}, ${lng.toFixed(6)}</div>
        <div style="display: flex; gap: 6px; padding-top: 4px; border-top: 1px solid #f1f5f9;">
          <a href="${getGoogleMapsSearchUrl(lat, lng)}" target="_blank" rel="noopener noreferrer" style="font-size: 10px; font-weight: 700; color: #2E6F40; text-decoration: underline;">Buka Google Maps ↗</a>
          <a href="${getGoogleMapsDirectionsUrl(lat, lng)}" target="_blank" rel="noopener noreferrer" style="font-size: 10px; font-weight: 700; color: #0284c7; text-decoration: underline;">Petunjuk Arah ↗</a>
        </div>
      </div>
    `;
    marker.bindPopup(popupHtml).openPopup();

    mapRef.current = map;

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        try {
          map.invalidateSize();
        } catch (e) {}
      });
      resizeObserver.observe(containerRef.current);
    }

    const timer1 = setTimeout(() => {
      try {
        map.invalidateSize();
      } catch (e) {}
    }, 80);

    const timer2 = setTimeout(() => {
      try {
        map.invalidateSize();
      } catch (e) {}
    }, 300);

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      clearTimeout(timer1);
      clearTimeout(timer2);
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch (e) {}
        mapRef.current = null;
      }
    };
  }, [property.id, lat, lng, property.name, property.address]);

  if (!hasValid) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs text-left space-y-3">
        <div className="flex justify-between items-center border-b border-[#F1F5F9] pb-2">
          <h4 className="font-extrabold text-[#3A444D] text-xs flex items-center gap-1.5 uppercase tracking-wide">
            <MapPin size={13} className="text-amber-500" />
            Titik Lokasi Gedung & Alamat
          </h4>
        </div>
        <div className="p-4 bg-amber-50/60 rounded-xl border border-amber-200/60 text-xs text-amber-800 space-y-1">
          <p className="font-bold">Koordinat GPS belum diatur</p>
          <p className="text-[11px] text-amber-700 leading-relaxed">
            Titik koordinat untuk properti ini belum ditentukan oleh pengelola. Peta lokasi dan rute akurat akan tampil otomatis setelah koordinat diatur di panel admin.
          </p>
        </div>
        <div className="bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-xl text-[10px] leading-relaxed text-[#64748B] flex items-start gap-1.5">
          <MapPin size={12} className="text-[#2E6F40] shrink-0 mt-0.5" />
          <div>
            <strong className="text-[#3A444D]">{property.name}</strong> — {property.address}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 overflow-hidden relative flex flex-col justify-between min-h-[220px] h-full shadow-xs text-left space-y-3">
      <div className="flex justify-between items-center border-b border-[#F1F5F9] pb-2">
        <div>
          <h4 className="font-extrabold text-[#3A444D] text-xs flex items-center gap-1.5 uppercase tracking-wide">
            <MapPin size={13} className="text-[#2E6F40]" />
            Titik Lokasi Gedung & Alamat
          </h4>
          <p className="text-[10px] text-[#64748B] font-mono mt-0.5">LAT: {lat} | LNG: {lng}</p>
        </div>
        <div className="flex items-center gap-2">
          {onOpenFullMap && (
            <button
              type="button"
              onClick={onOpenFullMap}
              className="text-[10px] font-extrabold text-white bg-[#2E6F40] hover:bg-[#235531] px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
            >
              <Compass size={11} />
              Peta & Sekitar ↗
            </button>
          )}
          <a
            href={getGoogleMapsDirectionsUrl(lat, lng)}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 px-2 py-1 rounded-lg transition-colors flex items-center gap-1 shadow-xs"
            title="Buka rute navigasi di Google Maps"
          >
            Rute ↗
          </a>
          <a
            href={getGoogleMapsSearchUrl(lat, lng)}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] font-bold text-[#2E6F40] bg-[#EEF7F0] hover:bg-[#d8ebd8] border border-[#2E6F40]/20 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 shadow-xs"
            title="Lihat titik koordinat resmi di Google Maps"
          >
            Google Maps ↗
          </a>
        </div>
      </div>

      <div className="w-full h-44 rounded-xl overflow-hidden relative border border-[#E2E8F0] z-10 bg-slate-100">
        <div ref={containerRef} className="w-full h-full min-h-[160px] absolute inset-0 z-10" />
      </div>

      <div className="bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-xl text-[10px] leading-relaxed text-[#64748B] flex items-start gap-1.5">
        <MapPin size={12} className="text-[#2E6F40] shrink-0 mt-0.5" />
        <div>
          <strong className="text-[#3A444D]">{property.name}</strong> — {property.address}
        </div>
      </div>
    </div>
  );
};

export default function Home({}: HomeProps) {
  // Use granular real-time table hooks for public catalog data
  const { data: propertiesData, loading: propertiesLoading } = useRealtimeTable<Property>(
    'properties',
    () => database.fetchProperties());
  const { data: roomsData, loading: roomsLoading } = useRealtimeTable<Room>(
    'rooms',
    () => database.fetchRooms());
  const { data: settingsData, loading: settingsLoading } = useRealtimeTable<SystemSettings>(
    'settings',
    () => database.fetchSettings().then(res => [res]));
  const { data: facilitiesData } = useRealtimeTable(
    'facilities',
    () => database.fetchFacilities());
  const { data: surveysData } = useRealtimeTable<Survey>(
    'surveys',
    () => database.fetchSurveys({ limit: 200 }));

  const hooksLoading = propertiesLoading || roomsLoading || settingsLoading;

  const [properties, setProperties] = useState<Property[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [contractExtensions, setContractExtensions] = useState<ContractExtension[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Core Page Navigation State
  const [userPage, setUserPage] = useState<'home' | 'search' | 'detail' | 'map'>('home');

  // Homepage Search Form States
  const [searchLocation, setSearchLocation] = useState<string>('');
  const [searchCheckInDate, setSearchCheckInDate] = useState<string>(
    toJakartaDate(new Date(Date.now() + 86400000)) // Default to tomorrow (Asia/Jakarta)
  );
  const [searchDurationType, setSearchDurationType] = useState<'monthly' | 'daily'>('monthly');

  // Language state (Indonesian / English)
  const [lang, setLang] = useState<'id' | 'en'>('id');

  // Filters State (Connected with Search catalogue page)
  const [selectedType, setSelectedType] = useState<'all' | 'putra' | 'putri' | 'campur'>('all');
  const [priceRange, setPriceRange] = useState<number>(5000000);
  const [onlyAvailable, setOnlyAvailable] = useState<boolean>(false);
  const [selectedRoomFacilities, setSelectedRoomFacilities] = useState<string[]>([]);
  const [selectedSharedFacilities, setSelectedSharedFacilities] = useState<string[]>([]);

  // Selected contexts for active workflows
  const [selectedContactPropertyId, setSelectedContactPropertyId] = useState<number | 'all'>('all');
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

  // Signature and Rules Agreement state
  const [isAgreed, setIsAgreed] = useState<boolean>(false);
  const [signatureUrl, setSignatureUrl] = useState<string>('');

  // Survey Form states
  const [surveyForm, setSurveyForm] = useState({
    fullName: '',
    nik: '',
    email: '',
    phone: '',
    address: '',
    job: '',
    date: toJakartaDate(new Date(Date.now() + 86400000)), // tomorrow (Asia/Jakarta)
    slot: '13:00 - 15:00',
    moveInDate: '',
    isWithoutDp: false
  });

  // Booking Form states
  const [bookingForm, setBookingForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    nik: '',
    isForOther: false,
    occupantName: '',
    occupantPhone: '',
    occupantEmail: '',
    occupantNik: '',
    isMarried: false,
    marriageCertificateUrl: '',
    spouseName: '',
    spouseNik: '',
    spousePhone: '',
    spouseRelation: 'istri'
  });

  // Booking details states
  const [bookingPeriodMonths, setBookingPeriodMonths] = useState<number>(1);
  const [bookingPeriodDays, setBookingPeriodDays] = useState<number>(1);
  const [bookingCheckInDate, setBookingCheckInDate] = useState<string>(todayJakarta());
  const [couponInput, setCouponInput] = useState<string>('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState<string>('');

  // Midtrans payment context states & anti-double-charge locks
  const [snapPaymentContext, setSnapPaymentContext] = useState<any | null>(null);
  const snapPaymentContextRef = useRef<any | null>(null);
  const paymentInFlightRef = useRef<boolean>(false);
  const settledOrderIdsRef = useRef<Set<string>>(new Set());
  const [isSubmittingPayment, setIsSubmittingPayment] = useState<boolean>(false);

  const ACTIVE_PAYMENT_STORAGE_KEY = 'samara_active_payment_session';

  const saveActivePaymentSession = (sessionData: Record<string, any>) => {
    try {
      localStorage.setItem(ACTIVE_PAYMENT_STORAGE_KEY, JSON.stringify({
        ...sessionData,
        updatedAt: Date.now()
      }));
    } catch (e) {
      console.warn('Failed to persist active payment session:', e);
    }
  };

  const clearActivePaymentSession = (matchingOrderId?: string) => {
    try {
      if (!matchingOrderId) {
        localStorage.removeItem(ACTIVE_PAYMENT_STORAGE_KEY);
        return;
      }
      const raw = localStorage.getItem(ACTIVE_PAYMENT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed?.orderId || parsed.orderId === matchingOrderId) {
        localStorage.removeItem(ACTIVE_PAYMENT_STORAGE_KEY);
      }
    } catch (e) {
      console.warn('Failed to clear active payment session:', e);
    }
  };

  // Zoomed/Expanded image viewer
  const [selectedRoomImage, setSelectedRoomImage] = useState<string | null>(null);

  // Rooms catalog modal state
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [tenants, setTenants] = useState<Tenant[]>([]);

  // Filter state for embedded Room Showcase on Detail page & Room Search
  const [detailRoomTab, setDetailRoomTab] = useState<'all' | 'available' | 'occupied'>('all');
  const [detailRoomFloor, setDetailRoomFloor] = useState<number | 'all'>('all');
  const [detailRoomType, setDetailRoomType] = useState<'all' | 'Standard' | 'Deluxe' | 'Premium' | 'Premium Plus'>('all');
  const [searchRoomType, setSearchRoomType] = useState<'all' | 'Standard' | 'Deluxe' | 'Premium' | 'Premium Plus'>('all');

  // Synchronized room availability validator directly connected to Supabase room state (R18: expired hold_expires_at is treated as available)
  const isRoomAvailable = (r: Room): boolean => {
    if (!r) return false;
    if (r.status === 'reserved') {
      const holdExp = (r as any).hold_expires_at;
      if (!holdExp || new Date(holdExp).getTime() <= Date.now()) {
        return true;
      }
      return false;
    }
    return r.status === 'available' || (r.status as string) === 'ready' || !r.status;
  };

  // Whenever catalog modal opens, instantly refetch latest room statuses from Supabase so locks are 100% current
  useEffect(() => {
    if (isCatalogOpen) {
      database.fetchRooms().then(fresh => {
        if (fresh && fresh.length > 0) setRooms(fresh);
      }).catch(() => {});
    }
  }, [isCatalogOpen]);

  // Detailed room popup states
  const [selectedRoomForDetail, setSelectedRoomForDetail] = useState<Room | null>(null);
  const [activeDetailImageIndex, setActiveDetailImageIndex] = useState(0);
  const [uploadingImage, setUploadingImage] = useState<boolean>(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveDetailImageIndex(0);
  }, [selectedRoomForDetail]);

  const handleUploadDetailImage = async (e: React.ChangeEvent<HTMLInputElement>, imageIndex: number) => {
    const file = e.target.files?.[0];
    if (!file || !activeProperty) return;
    
    if (file.size > 20 * 1024 * 1024) {
      alert("Ukuran gambar maksimal adalah 20MB!");
      return;
    }
    
    try {
      setUploadingImage(true);
      const result = await uploadToSupabaseStorage(
        file,
        'property-images',
        `prop_${activeProperty.name || 'detail'}`,
        { maxLongestSide: 1920, quality: 0.92 }
      );
      const imageUrl = result.publicUrl;
      
      let updatedProperty: Property;
      if (imageIndex === -1) {
        // Main photo
        updatedProperty = {
          ...activeProperty,
          image_url: imageUrl
        };
      } else {
        // Gallery photo
        const updatedImages = [...(activeProperty.images || [])];
        // Ensure there is room
        while (updatedImages.length <= imageIndex) {
          updatedImages.push("");
        }
        updatedImages[imageIndex] = imageUrl;
        updatedProperty = {
          ...activeProperty,
          images: updatedImages
        };
      }
      
      const saved = await database.saveProperty(updatedProperty);
      setActiveProperty(saved);
      
      // Update properties list so changes propagate back to list views instantly
      setProperties(prev => prev.map(p => p.id === saved.id ? saved : p));
      
      alert("Gambar HD berhasil di-upload dan disimpan ke Storage!");
    } catch (err: any) {
      console.error("Error uploading image:", err);
      alert("Gagal meng-upload gambar ke Storage. " + (err?.message || ''));
    } finally {
      setUploadingImage(false);
    }
  };

  useEffect(() => {
    const sett = settingsData && settingsData.length > 0 ? settingsData[0] : null;

    const filteredProps = propertiesData || [];
    const filteredRooms = roomsData || [];

    setProperties(filteredProps);
    setRooms(filteredRooms);
    setSettings(sett);
    if (surveysData) setSurveys(surveysData);

    // Keep active selection states synchronized with live database changes
    setActiveProperty(prev => {
      if (!prev) return null;
      return filteredProps.find(p => p.id === prev.id) || prev;
    });

    setActiveRoom(prev => {
      if (!prev) return null;
      return filteredRooms.find(r => r.id === prev.id) || prev;
    });

    setSelectedRoomForDetail(prev => {
      if (!prev) return null;
      return filteredRooms.find(r => r.id === prev.id) || prev;
    });
    
    if (filteredProps && filteredProps.length > 0) {
      setPriceRange(5000000);
    }

    // Real-time Supabase -> Midtrans bridge: if an active payment session's room becomes 'occupied' or survey becomes 'survey_confirmed' via Supabase Realtime, immediately verify and display receipt
    try {
      const activeCtx = snapPaymentContextRef.current || (() => {
        const raw = localStorage.getItem(ACTIVE_PAYMENT_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
      })();
      if (activeCtx?.orderId && !settledOrderIdsRef.current.has(activeCtx.orderId)) {
        const matchedRoom = activeCtx.roomId ? filteredRooms.find(r => String(r.id) === String(activeCtx.roomId)) : null;
        const matchedSurvey = (surveysData || []).find(s => s.reservation_number === activeCtx.orderId);
        const isRealtimeSettled =
          (activeCtx.checkoutFlow === 'survey' && matchedSurvey && (matchedSurvey.status === 'survey_confirmed' || matchedSurvey.status === 'paid_full')) ||
          (activeCtx.checkoutFlow !== 'survey' && matchedRoom && matchedRoom.status === 'occupied');

        if (isRealtimeSettled) {
          handleSandboxPaymentSuccess({
            transactionId: activeCtx.orderId,
            paymentMethod: 'Midtrans SNAP',
            settlementTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
            settled: true
          }, activeCtx).catch(() => {});
        }
      }
    } catch {}
  }, [propertiesData, roomsData, settingsData, facilitiesData, surveysData]);

  useEffect(() => {
    if (!hooksLoading) {
      setLoading(false);
      setIsInitialLoad(false);
    }
  }, [hooksLoading]);

  // Listener for custom navigation events (e.g. from Navbar) & URL parameter changes
  useEffect(() => {
    const handleCustomNav = (e: any) => {
      if (e?.detail?.page === 'map') {
        updateUrlPropertyParam(null);
        setUserPage('map');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (e?.detail?.page === 'search') {
        updateUrlPropertyParam(null);
        setUserPage('search');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (e?.detail?.page === 'home') {
        updateUrlPropertyParam(null);
        setUserPage('home');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };
    window.addEventListener('samara-navigate', handleCustomNav);
    return () => window.removeEventListener('samara-navigate', handleCustomNav);
  }, []);

  // Automatically resolve property from URL parameter on load or popstate
  useEffect(() => {
    if (properties.length === 0) return;
    const syncFromUrl = () => {
      const param = getUrlPropertyParameter();
      if (param) {
        const matched = findPropertyByUrlParam(param, properties);
        if (matched) {
          setActiveProperty(matched);
          setSelectedMapProperty(matched);
          setUserPage('detail');
        }
      }
    };
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, [properties]);

  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [activeTestimonialIdx, setActiveTestimonialIdx] = useState<number>(0);

  const testimonials: {
    initials: string;
    bgClass: string;
    name: string;
    role: string;
    text: string;
  }[] = (() => {
    try {
      if (settings?.testimonials) {
        const parsed = JSON.parse(settings.testimonials);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error("Error parsing testimonials:", e);
    }
    return [];
  })();

  useEffect(() => {
    if (testimonials.length <= 1) return;
    const interval = setInterval(() => {
      setActiveTestimonialIdx(prev => (prev + 1) % testimonials.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [testimonials.length]);

  // Helper to render lucide icon from settings
  const renderSettingIcon = (iconName: string) => {
    const IconComponent = (LucideIcons as any)[iconName];
    if (IconComponent) {
      return <IconComponent size={24} className="text-[#2E6F40]" />;
    }
    return <LucideIcons.Info size={24} className="text-[#2E6F40]" />;
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
      { icon: "Droplet", title: "Air", subtitle: "Bersih 24 Jam" },
      { icon: "Bike", title: "Parkir Motor", subtitle: "Aman & Luas" },
      { icon: "Car", title: "Parkir Mobil", subtitle: "Tersedia" },
      { icon: "Shirt", title: "Laundry", subtitle: "Tersedia" },
      { icon: "Refrigerator", title: "Kulkas & Microwave", subtitle: "Bersama" },
      { icon: "Sun", title: "Area Jemuran", subtitle: "Bersih & Luas" },
      { icon: "Sparkles", title: "Cleaning", subtitle: "Tersedia" }
    ];
  })();

  // Parse Why Choose Us
  const whyChooseUs: string[] = (() => {
    const fallback = [
      "Standar Kebersihan Terjaga",
      "CCTV 24 Jam di Area Umum",
      "Maintenance Cepat < 24 Jam",
      "Admin Responsif via WhatsApp",
      "Pembayaran Digital Aman",
      "Kontrak Transparan Tanpa Biaya Tersembunyi"
    ];
    try {
      if (settings?.why_choose_us) {
        const parsed = JSON.parse(settings.why_choose_us);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item: any) => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') {
              if (item.title && item.description) return `${item.title} - ${item.description}`;
              if (item.title) return item.title;
              if (item.description) return item.description;
              if (item.name) return item.name;
            }
            return String(item || '');
          });
        }
      }
    } catch (e) {
      console.warn("Notice parsing why_choose_us:", e);
    }
    return fallback;
  })();

  // Parse FAQs
  const faqs: FAQItem[] = (() => {
    const fallback = [
      {
        question: "Bagaimana cara booking kamar di Samara Stay?",
        answer: "• Anda dapat memilih cabang dan kamar kos di website kami, lalu tentukan tanggal mulai sewa dan selesaikan pembayaran untuk sewa harian/ bulanan secara instan dengan menggunakan sistem pembayaran digital terintegrasi"
      },
      {
        question: "Apa saja fasilitas yang tersedia di setiap kamar?",
        answer: "Setiap kamar dilengkapi dengan AC, tempat tidur (kasur queen), kamar mandi dalam dengan water heater, meja kerja, lemari pakaian, dan akses Wi-Fi berkecepatan tinggi."
      },
      {
        question: "Berapa biaya administrasi dan deposit yang harus dibayar?",
        answer: "• Samara Stay tidak membebankan biaya administrasi, kami hanya menerapkan deposit untuk komitmen sewa. Deposit akan dikembalikan utuh pada saat masa sewa selesai apabila tidak ada kerusakan atau kehilangan pada fasilitas kos."
      },
      {
        question: "Apakah ada kontrak jangka panjang?",
        answer: "Kami menyediakan kontrak sewa bulanan yang sangat fleksibel tanpa kewajiban komitmen tahunan yang memberatkan, sehingga sangat ideal untuk mahasiswa dan pekerja aktif."
      }
    ];
    try {
      if (settings?.faqs) {
        const parsed = JSON.parse(settings.faqs);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item: any) => ({
            question: item.question || item.q || item.title || '',
            answer: item.answer || item.a || item.description || ''
          })).filter(f => f.question && f.answer);
        }
      }
    } catch (e) {
      console.warn("Notice parsing faqs:", e);
    }
    return fallback;
  })();

  const handleApplyCoupon = async () => {
    setCouponError('');
    setAppliedCoupon(null);
    if (!couponInput.trim()) return;

    const validationRes = await database.validateCouponCode(couponInput.trim(), {
      property_id: activeProperty?.id,
      duration_months: bookingPeriodMonths,
      duration_days: bookingPeriodDays,
      base_amount: activeRoom?.price
    });
    const validated = validationRes?.valid && validationRes.coupon ? (validationRes.coupon as Coupon) : null;
    if (!validated || validated.is_active === false) {
      setCouponError(validationRes?.message || 'Kode promo salah atau sudah kedaluwarsa.');
      return;
    }

    if (checkoutFlow === 'monthly' && validated.min_duration_months && bookingPeriodMonths < validated.min_duration_months) {
      setCouponError(`Kode promo hanya berlaku untuk sewa minimal ${validated.min_duration_months} bulan.`);
      return;
    }

    setAppliedCoupon(validated);
  };

  const handleSelectRoom = (room: Room, flowType: 'monthly' | 'daily' | 'survey') => {
    if (room.status === 'occupied' || room.status === 'reserved' || room.status === 'maintenance') {
      alert(`Kamar ${room.room_number} saat ini ${room.status === 'occupied' ? 'masih terisi oleh penyewa' : room.status === 'maintenance' ? 'sedang dalam pemeliharaan' : 'sedang dipesan (reserved)'} dan belum dapat dibooking.`);
      return;
    }
    setActiveRoom(room);
    setCheckoutFlow(flowType);
    setIsAgreed(false);
    setSignatureUrl('');
  };

  const resetToInitialHomeView = () => {
    setActiveRoom(null);
    setSelectedRoomForDetail(null);
    setIsCatalogOpen(false);
    setCheckoutFlow('none');
    setSnapPaymentContext(null);
    snapPaymentContextRef.current = null;
    setIsAgreed(false);
    setSignatureUrl('');
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponError('');
    setSearchLocation('');
    setSelectedMapProperty(null);

    // Reset forms
    setBookingForm({
      fullName: '',
      phone: '',
      email: '',
      nik: '',
      isForOther: false,
      occupantName: '',
      occupantPhone: '',
      occupantEmail: '',
      occupantNik: '',
      isMarried: false,
      marriageCertificateUrl: '',
      spouseName: '',
      spouseNik: '',
      spousePhone: '',
      spouseRelation: 'istri'
    });
    setSurveyForm(prev => ({
      ...prev,
      fullName: '',
      nik: '',
      email: '',
      phone: '',
      address: '',
      job: '',
      moveInDate: '',
      isWithoutDp: false
    }));

    // Clear ?property=... and any Midtrans redirect params so URL returns cleanly to initial view
    updateUrlPropertyParam(null);
    try {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('property');
      cleanUrl.searchParams.delete('order_id');
      cleanUrl.searchParams.delete('orderId');
      cleanUrl.searchParams.delete('status_code');
      cleanUrl.searchParams.delete('transaction_status');
      window.history.replaceState({}, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
    } catch {}

    setUserPage('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const refreshAllHomeData = async () => {
    try {
      const [freshRooms, freshProps, freshSurveys, freshTenants] = await Promise.all([
        database.fetchRooms(),
        database.fetchProperties(),
        database.fetchSurveys(),
        database.fetchTenants()
      ]);
      if (freshRooms && freshRooms.length > 0) setRooms(freshRooms);
      if (freshProps && freshProps.length > 0) setProperties(freshProps);
      if (freshSurveys) setSurveys(freshSurveys);
      if (freshTenants) setTenants(freshTenants);
    } catch (e) {
      console.warn('Silent data reload after checkout:', e);
    }
  };

  const handleCloseReceiptAndReset = async () => {
    setShowReceipt(false);
    setReceiptData(null);
    try {
      sessionStorage.removeItem('samara_last_paid_receipt');
    } catch {}
    resetToInitialHomeView();
    await refreshAllHomeData();
    window.location.replace(window.location.pathname || '/');
  };

  const handleProceedToPayment = async (calculatedTotal: number) => {
    // Synchronous anti-double-click & anti-lag mutex
    if (paymentInFlightRef.current || isSubmittingPayment) {
      return;
    }

    if (checkoutFlow !== 'survey' && !bookingCheckInDate) {
      alert("Mohon tentukan tanggal mulai huni / check-in terlebih dahulu.");
      return;
    }

    paymentInFlightRef.current = true;
    setIsSubmittingPayment(true);
    setLoading(true);

    try {
      // 1. Check if there is an active payment session for this exact room, flow, and amount (anti-double-charge on lag/retry)
      let reusableSession: any = null;
      try {
        const rawSession = localStorage.getItem(ACTIVE_PAYMENT_STORAGE_KEY);
        if (rawSession) {
          const parsed = JSON.parse(rawSession);
          const ageMs = Date.now() - Number(parsed?.createdAt || 0);
          const isSameOrderTarget =
            parsed?.orderId &&
            parsed?.checkoutFlow === checkoutFlow &&
            String(parsed?.roomId) === String(activeRoom?.id) &&
            Number(parsed?.grossAmount) === Number(calculatedTotal) &&
            ageMs > 0 &&
            ageMs < 15 * 60 * 1000; // within 15 minutes

          if (isSameOrderTarget) {
            const checkRes = await fetch(`/api/midtrans/status/${encodeURIComponent(parsed.orderId)}`);
            if (checkRes.ok) {
              const checkData = await checkRes.json();
              if (checkData?.settled === true) {
                setLoading(false);
                setIsSubmittingPayment(false);
                paymentInFlightRef.current = false;
                await handleSandboxPaymentSuccess({
                  transactionId: checkData?.midtrans?.transaction_id || parsed.orderId,
                  paymentMethod: checkData?.midtrans?.payment_type || 'Midtrans SNAP',
                  settlementTime: checkData?.midtrans?.settlement_time || new Date().toISOString().replace('T', ' ').slice(0, 19),
                  settled: true
                }, parsed);
                return;
              }
              if (checkData?.rejected === true) {
                clearActivePaymentSession(parsed.orderId);
              } else if (parsed.snapToken) {
                reusableSession = parsed;
              }
            }
          }
        }
      } catch (e) {
        console.warn('Active payment session pre-check warning:', e);
      }

      // 2. If no reusable pending session for this user, verify room availability in Supabase
      if (!reusableSession && activeRoom) {
        try {
          const latestRooms = await database.fetchRooms();
          const currentRoom = latestRooms.find(r => r.id === activeRoom.id);
          if (currentRoom && (currentRoom.status === 'occupied' || currentRoom.status === 'reserved')) {
            setLoading(false);
            setIsSubmittingPayment(false);
            paymentInFlightRef.current = false;
            alert(`Maaf, Kamar ${activeRoom.room_number} baru saja ${currentRoom.status === 'occupied' ? 'disewa' : 'dipesan'} oleh calon penyewa lain.`);
            setActiveRoom(null);
            setCheckoutFlow('none');
            setRooms(latestRooms);
            return;
          }
        } catch (e) {
          console.warn('Pre-payment check fallback:', e);
        }
      }

      if (checkoutFlow === 'survey' && surveyForm.isWithoutDp) {
        const freeOrderId = `SRV-FREE-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
        try {
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
            status: 'survey_confirmed',
            dp_amount: 0,
            payment_method: 'Tanpa DP (Kunjungan)',
            invoice_id: `INV-SRV-FREE-${Math.floor(1000 + Math.random() * 9000)}`,
            reservation_number: freeOrderId,
            signature_url: signatureUrl
          };
          const saved = await database.saveSurvey(surveyRecord);

          // Send free survey confirmation email
          if (surveyForm.email) {
            fetch('/api/email/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: surveyForm.email,
                reservation_number: freeOrderId,
                order_id: freeOrderId,
                subject: `[Samara Stay] Jadwal Kunjungan Survey Terkonfirmasi - Unit ${activeRoom!.room_number}`,
                html: `
                  <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 24px; background-color: #ffffff; color: #1e293b; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05);">
                    <div style="text-align: center; border-bottom: 2px solid #334155; padding-bottom: 25px; margin-bottom: 30px;">
                      <h1 style="font-size: 28px; font-weight: 800; letter-spacing: 6px; text-transform: uppercase; color: #1e293b; margin: 0;">SAMARA</h1>
                      <p style="font-family: monospace; font-size: 11px; font-weight: bold; letter-spacing: 3px; text-transform: uppercase; color: #64748b; margin: 4px 0 0 0;">S T A Y</p>
                    </div>
                    <h2 style="color: #2e6f40; margin-top: 0; font-size: 20px; font-weight: 700;">Jadwal Kunjungan Survey Terkonfirmasi</h2>
                    <p>Halo <strong>${surveyForm.fullName}</strong>,</p>
                    <p>Jadwal kunjungan survey Anda telah berhasil didaftarkan secara resmi di sistem kami. Berikut rincian jadwal kunjungan Anda:</p>
                    
                    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin: 25px 0;">
                      <h3 style="color: #1e293b; margin-top: 0; margin-bottom: 15px; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">Rincian Kunjungan</h3>
                      <table style="width: 100%; font-size: 13px; line-height: 2;">
                        <tr><td style="color: #64748b; width: 45%;">Tanggal Kunjungan:</td><td style="color: #1e293b; font-weight: 700; text-align: right;">${surveyForm.date}</td></tr>
                        <tr><td style="color: #64748b;">Slot Waktu:</td><td style="color: #1e293b; font-weight: 700; text-align: right;">${surveyForm.slot} WIB</td></tr>
                        <tr><td style="color: #64748b;">Kamar yang Dituju:</td><td style="color: #1e293b; font-weight: 700; text-align: right;">Unit ${activeRoom!.room_number}</td></tr>
                        <tr><td style="color: #64748b;">Skema Biaya:</td><td style="color: #2e6f40; font-weight: 800; text-align: right;">Gratis (Tanpa DP)</td></tr>
                      </table>
                    </div>
                    <div style="font-size: 13px; line-height: 1.5; color: #475569; margin: 25px 0; padding: 15px; border-left: 4px solid #3b82f6; background-color: #f0f7ff; border-radius: 0 12px 12px 0;">
                      <strong style="color: #1e293b; display: block; margin-bottom: 4px;">Pemberitahuan Skema Kunjungan:</strong>
                      Karena Anda memilih skema kunjungan tanpa DP komitmen, unit kamar ini tidak dikunci secara eksklusif dan dapat disewa oleh calon penghuni lain sewaktu-waktu sebelum kedatangan Anda.
                    </div>
                    <div style="text-align: center; margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 25px; font-size: 11px; color: #94a3b8; line-height: 1.6;">
                      <p style="margin: 0; font-weight: 700; color: #64748b;">Layanan Pengelola Samara Stay Premium Boarding</p>
                      <p style="margin: 20px 0 0 0; font-size: 10px; color: #cbd5e1;">&copy; 2026 Samara Stay Residence. Hak Cipta Dilindungi.</p>
                    </div>
                  </div>
                `
              })
            }).catch(e => console.error('Error sending free survey email:', e));
          }

          const freeReceiptPayload = {
            type: 'survey',
            id: saved.invoice_id || '999',
            name: surveyForm.fullName,
            roomNo: activeRoom!.room_number,
            propertyName: activeProperty!.name,
            amountPaid: 0,
            method: 'Tanpa DP (Kunjungan)',
            date: surveyForm.date,
            details: 'Janji Kunjungan Survey Gratis Terkonfirmasi.',
            signatureUrl: signatureUrl,
            ownerSignatureUrl: settings?.owner_signature_url || DEFAULT_OWNER_SIGNATURE
          };
          resetToInitialHomeView();
          setReceiptData(freeReceiptPayload);
          setLoading(false);
          setShowReceipt(true);
          refreshAllHomeData();
          return;
        } catch (err: any) {
          setLoading(false);
          alert(`Gagal membuat jadwal survey: ${err.message}`);
          return;
        }
      }

      const orderId = reusableSession?.orderId || `${checkoutFlow === 'survey' ? 'SRV' : 'BOOK'}-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
      const description = checkoutFlow === 'survey' ? `DP Survey Kamar ${activeRoom?.room_number}` : `Sewa Unit ${activeRoom?.room_number}`;
      
      const customerDetails = {
        name: checkoutFlow === 'survey' ? surveyForm.fullName : bookingForm.fullName,
        email: checkoutFlow === 'survey' ? surveyForm.email : bookingForm.email,
        phone: checkoutFlow === 'survey' ? surveyForm.phone : bookingForm.phone,
      };

      let savedBookingId: string | number | undefined = reusableSession?.bookingId;
      let savedSurveyInvoiceId: string | undefined = reusableSession?.invoiceId;

      if (!reusableSession) {
        // R4 & R7: Pre-save pending survey or booking record to Supabase and atomically hold room BEFORE requesting Midtrans Snap token
        if (checkoutFlow === 'survey') {
          savedSurveyInvoiceId = `INV-SRV-${Math.floor(1000 + Math.random() * 9000)}`;
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
            invoice_id: savedSurveyInvoiceId,
            reservation_number: orderId,
            signature_url: signatureUrl
          };
          await database.saveSurvey(surveyRecord);
        } else {
          const isDaily = checkoutFlow === 'daily';
          const discount = appliedCoupon ? (appliedCoupon.discount_type === 'fixed' ? appliedCoupon.discount_value : Math.round((activeRoom!.price * appliedCoupon.discount_value) / 100)) : 0;
          
          const bookingRecord: Partial<Booking> = {
            property_id: activeProperty!.id,
            room_id: activeRoom!.id,
            room_number: activeRoom!.room_number,
            tenant_name: bookingForm.fullName,
            phone: bookingForm.phone,
            email: bookingForm.email,
            nik: bookingForm.nik,
            booking_date: todayJakarta(),
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
            discount_amount: discount,
            is_for_other: bookingForm.isForOther,
            occupant_name: bookingForm.isForOther ? bookingForm.occupantName : undefined,
            occupant_phone: bookingForm.isForOther ? bookingForm.occupantPhone : undefined,
            occupant_email: bookingForm.isForOther ? bookingForm.occupantEmail : undefined,
            occupant_nik: bookingForm.isForOther ? bookingForm.occupantNik : undefined,
            occupant_arrival_status: bookingForm.isForOther ? 'pending' : undefined,
            signature_url: signatureUrl,
            is_married: bookingForm.isMarried,
            marriage_certificate_url: bookingForm.isMarried ? bookingForm.marriageCertificateUrl : undefined,
            spouse_name: bookingForm.isMarried ? bookingForm.spouseName : undefined,
            spouse_nik: bookingForm.isMarried ? bookingForm.spouseNik : undefined,
            spouse_phone: bookingForm.isMarried ? bookingForm.spousePhone : undefined,
            spouse_relation: bookingForm.isMarried ? (bookingForm.spouseRelation || 'istri') : undefined
          };
          const savedBooking = await database.saveBooking(bookingRecord);
          if (!savedBooking || !savedBooking.id || !activeRoom?.id) {
            setLoading(false);
            alert('Gagal membuat reservasi pemesanan kamar. Silakan coba lagi.');
            return;
          }
          savedBookingId = savedBooking.id;
          const holdRes = await database.holdRoomAtomic(activeRoom.id, savedBooking.id, 15);
          if (!holdRes || !holdRes.success) {
            setLoading(false);
            alert(holdRes?.message || `Maaf, Kamar ${activeRoom.room_number} sedang diproses oleh calon penyewa lain.`);
            database.fetchRooms().then(fresh => { if (fresh?.length) setRooms(fresh); }).catch(() => {});
            return;
          }
          // Server-side lock room as reserved to prevent double booking by others
          fetch('/api/rooms/lock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              room_id: activeRoom.id,
              booking_id: savedBooking.id,
              midtrans_order_id: orderId,
              status: 'reserved',
              tenant_name: bookingForm.fullName
            })
          }).catch(() => {});
          // Immediately update local rooms state so it locks visually
          setRooms(prev => prev.map(r => r.id === activeRoom.id ? { ...r, status: 'reserved' } : r));
        }
      }

      const { loadMidtransSnapScript, requestSnapTokenFromServer } = await import('../lib/midtrans');
      
      const chargeResult = reusableSession?.snapToken
        ? { token: reusableSession.snapToken, mode: reusableSession.mode || 'sandbox', already_paid: false, settled: false }
        : await requestSnapTokenFromServer({
            orderId,
            grossAmount: calculatedTotal,
            description,
            customerDetails,
            room_id: activeRoom?.id,
            property_id: activeProperty?.id,
            booking_type: checkoutFlow === 'daily' ? 'daily' : 'monthly',
            duration_months: checkoutFlow === 'daily' ? 0 : bookingPeriodMonths,
            duration_days: checkoutFlow === 'daily' ? bookingPeriodDays : undefined,
            coupon_code: appliedCoupon ? appliedCoupon.code : null,
            is_dp: checkoutFlow === 'survey'
          });

      const currentCtx = {
        orderId,
        bookingId: savedBookingId,
        invoiceId: savedSurveyInvoiceId || orderId,
        checkoutFlow,
        roomId: activeRoom?.id,
        roomNumber: activeRoom?.room_number,
        propertyId: activeProperty?.id,
        propertyName: activeProperty?.name,
        grossAmount: calculatedTotal,
        description,
        tenantName: customerDetails.name,
        email: customerDetails.email,
        phone: customerDetails.phone,
        checkInDate: bookingCheckInDate,
        surveyDate: surveyForm.date,
        surveySlot: surveyForm.slot,
        isDaily: checkoutFlow === 'daily',
        isForOther: Boolean(bookingForm.isForOther),
        occupantName: bookingForm.occupantName || '',
        occupantPhone: bookingForm.occupantPhone || '',
        occupantEmail: bookingForm.occupantEmail || '',
        occupantNik: bookingForm.occupantNik || '',
        isMarried: Boolean(bookingForm.isMarried),
        spouseName: bookingForm.spouseName || '',
        spousePhone: bookingForm.spousePhone || '',
        spouseNik: bookingForm.spouseNik || '',
        spouseRelation: bookingForm.spouseRelation || 'istri',
        signatureUrl,
        snapToken: chargeResult.token,
        mode: chargeResult.mode,
        createdAt: reusableSession?.createdAt || Date.now()
      };

      // If server reports the order is already paid/settled, settle immediately without charging again
      if (chargeResult.already_paid === true || chargeResult.settled === true) {
        setLoading(false);
        await handleSandboxPaymentSuccess({
          transactionId: orderId,
          paymentMethod: 'Midtrans SNAP',
          settlementTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
          settled: true
        }, currentCtx);
        return;
      }

      // Persist session in localStorage so browser refresh can automatically recover & verify payment
      saveActivePaymentSession(currentCtx);

      await loadMidtransSnapScript(chargeResult.mode === 'sandbox');
      setLoading(false);

      if ((chargeResult.mode === 'production' || chargeResult.mode === 'sandbox') && (window as any).snap) {
        setSnapPaymentContext(currentCtx);
        snapPaymentContextRef.current = currentCtx;

        let isSettled = false;
        let pollCtrl: ReturnType<typeof pollWithBackoff> | null = null;

        const checkOrderStatus = async (): Promise<boolean> => {
          if (isSettled) return true;
          try {
            const resp = await fetch(`/api/midtrans/status/${encodeURIComponent(orderId)}`);
            if (resp.status >= 400 && resp.status < 500) {
              const err: any = new Error(`Client error ${resp.status}`);
              err.status = resp.status;
              throw err;
            }
            if (resp.ok) {
              const resData = await resp.json();
              if (resData?.settled === true) {
                isSettled = true;
                if (pollCtrl) pollCtrl.stop();
                await handleSandboxPaymentSuccess({
                  transactionId: resData?.midtrans?.transaction_id || `mid-${Date.now()}`,
                  paymentMethod: resData?.midtrans?.payment_type || 'Midtrans SNAP',
                  settlementTime: resData?.midtrans?.settlement_time || new Date().toISOString().replace('T', ' ').slice(0, 19),
                  settled: true
                }, currentCtx);
                return true;
              }
              if (resData?.rejected === true) {
                isSettled = true;
                if (pollCtrl) pollCtrl.stop();
                clearActivePaymentSession(orderId);
                database.fetchRooms().then(fresh => { if (fresh?.length) setRooms(fresh); }).catch(() => {});
                alert(`Pembayaran ditolak atau dibatalkan oleh Midtrans (${resData?.rejection_reason || 'tidak berhasil'}). Dana tidak terpotong dan kamar telah dibuka kembali.`);
                return true;
              }
            }
          } catch (e: any) {
            if (e?.status >= 400 && e?.status < 500) throw e;
            // Polling check silent fallback
          }
          return false;
        };

        // E3: Stepped exponential backoff polling (2.5s -> 3.5s -> 5s -> 7.5s -> 10s -> 15s, 2x slower when tab hidden)
        pollCtrl = pollWithBackoff({
          fn: () => checkOrderStatus(),
          isTerminal: (settled) => Boolean(settled),
          baseIntervalMs: 2500,
          maxIntervalMs: 15000,
          hiddenTabMultiplier: 2,
          maxAttempts: 25
        });

        (window as any).snap.pay(chargeResult.token, {
          onSuccess: async (result: any) => {
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

            // Verify and auto-settle on server via /api/midtrans/status/:orderId with up to 4 quick retries
            let verifiedData: any = null;
            for (let attempt = 1; attempt <= 4; attempt++) {
              try {
                const verifyRes = await fetch(`/api/midtrans/status/${encodeURIComponent(orderId)}`);
                if (verifyRes.ok) {
                  verifiedData = await verifyRes.json();
                  if (verifiedData?.settled === true || verifiedData?.rejected === true) {
                    break;
                  }
                }
              } catch {}
              if (attempt < 4) {
                await new Promise(resolve => setTimeout(resolve, 900));
              }
            }

            if (verifiedData?.settled === true) {
              isSettled = true;
              if (pollCtrl) pollCtrl.stop();
              await handleSandboxPaymentSuccess({
                transactionId: verifiedData?.midtrans?.transaction_id || result?.transaction_id || `mid-${Date.now()}`,
                paymentMethod: verifiedData?.midtrans?.payment_type || result?.payment_type || 'Midtrans SNAP',
                settlementTime: verifiedData?.midtrans?.settlement_time || result?.transaction_time || new Date().toISOString().replace('T', ' ').slice(0, 19),
                settled: true
              }, currentCtx);
            } else if (verifiedData?.rejected === true) {
              if (pollCtrl) pollCtrl.stop();
              clearActivePaymentSession(orderId);
              database.fetchRooms().then(fresh => { if (fresh?.length) setRooms(fresh); }).catch(() => {});
              alert('Pembayaran belum masuk / ditolak oleh Midtrans. Silakan coba kembali.');
            } else {
              // Keep pollCtrl running so as soon as Midtrans status transitions to settlement, it auto-settles
              handleSandboxPaymentPending({
                transactionId: result?.transaction_id || `mid-${Date.now()}`,
                paymentMethod: result?.payment_type || 'Midtrans SNAP',
                settlementTime: result?.transaction_time || new Date().toISOString().replace('T', ' ').slice(0, 19)
              }, currentCtx);
            }
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
            }, currentCtx);
            // Trigger check immediately in case payment already occurred
            checkOrderStatus().catch(() => {});
          },
          onError: async (result: any) => {
            if (pollCtrl) pollCtrl.stop();
            clearActivePaymentSession(orderId);
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

            // Trigger server status check so rejected/failed order unlocks the room immediately
            try {
              await fetch(`/api/midtrans/status/${encodeURIComponent(orderId)}`);
              const freshRooms = await database.fetchRooms();
              if (freshRooms?.length) setRooms(freshRooms);
            } catch {}

            alert('Pembayaran belum berhasil atau ditolak oleh Midtrans. Tidak ada dana yang dipotong.');
          },
          onClose: async () => {
            // Immediate check: User may have paid in m-Banking or external simulator before closing popup
            try {
              const resp = await fetch(`/api/midtrans/status/${encodeURIComponent(orderId)}`);
              if (resp.ok) {
                const resData = await resp.json();
                if (resData?.settled === true) {
                  isSettled = true;
                  if (pollCtrl) pollCtrl.stop();
                  await handleSandboxPaymentSuccess({
                    transactionId: resData?.midtrans?.transaction_id || `mid-${Date.now()}`,
                    paymentMethod: resData?.midtrans?.payment_type || 'Midtrans SNAP',
                    settlementTime: resData?.midtrans?.settlement_time || new Date().toISOString().replace('T', ' ').slice(0, 19),
                    settled: true
                  }, currentCtx);
                  return;
                }
                if (resData?.rejected === true) {
                  if (pollCtrl) pollCtrl.stop();
                  clearActivePaymentSession(orderId);
                  database.fetchRooms().then(fresh => { if (fresh?.length) setRooms(fresh); }).catch(() => {});
                  return;
                }
              }
            } catch (e) {}

            fetch('/api/midtrans/logs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orderId,
                status: 'closed',
                type: 'client_event',
                message: 'Customer closed the Midtrans Snap popup window.',
                amount: calculatedTotal
              })
            }).catch(() => {});
          }
        });
      } else {
        setLoading(false);
        alert('Modul pembayaran Midtrans Snap belum siap dimuat. Pastikan koneksi internet stabil dan coba lagi.');
      }
    } catch (err: any) {
      setLoading(false);
      console.error('[MIDTRANS ERROR]', err);
      alert(`Gagal memproses pembayaran Midtrans: ${err.message || 'Koneksi terputus atau credential server belum disetup'}`);
    } finally {
      paymentInFlightRef.current = false;
      setIsSubmittingPayment(false);
    }
  };

  const handleSandboxPaymentPending = async (details: any, overrideCtx?: any) => {
    const ctx = overrideCtx || snapPaymentContextRef.current || snapPaymentContext;
    const currentOrderId = ctx?.orderId;
    if (!currentOrderId) return;

    // Double-check with server first: if already settled on Midtrans, process as success immediately
    try {
      const resp = await fetch(`/api/midtrans/status/${encodeURIComponent(currentOrderId)}`);
      if (resp.ok) {
        const resData = await resp.json();
        if (resData?.settled === true) {
          await handleSandboxPaymentSuccess({
            transactionId: resData?.midtrans?.transaction_id || details?.transactionId || `mid-${Date.now()}`,
            paymentMethod: resData?.midtrans?.payment_type || details?.paymentMethod || 'Midtrans SNAP',
            settlementTime: resData?.midtrans?.settlement_time || details?.settlementTime || new Date().toISOString().replace('T', ' ').slice(0, 19),
            settled: true
          }, ctx);
          return;
        }
        if (resData?.rejected === true) {
          clearActivePaymentSession(currentOrderId);
          database.fetchRooms().then(fresh => { if (fresh?.length) setRooms(fresh); }).catch(() => {});
          alert('Pembayaran belum masuk atau telah ditolak/dibatalkan di Midtrans. Pesanan tidak diproses.');
          return;
        }
      }
    } catch {}

    // NOTE: We intentionally DO NOT re-insert booking or survey rows here because handleProceedToPayment
    // already created the pending record before opening Midtrans Snap. We also DO NOT show the settled receipt
    // until Midtrans confirms the payment is settled.
    alert('Menunggu penyelesaian pembayaran Anda di Midtrans. Jika Anda sudah membayar, sistem akan otomatis memverifikasi dan menyimpan bukti lunas Anda (meskipun halaman di-refresh). Jika belum dibayar, Anda dapat menekan tombol Bayar kembali untuk melanjutkan transaksi yang sama tanpa terpotong 2x.');
  };

  const handleSandboxPaymentSuccess = async (details: any, overrideCtx?: any) => {
    const ctx = overrideCtx || snapPaymentContextRef.current || snapPaymentContext;
    const currentOrderId = ctx?.orderId ?? `BOOK-${Date.now()}`;

    // Idempotency guard: prevent duplicate client-side receipt & email processing for the same orderId
    if (settledOrderIdsRef.current.has(currentOrderId)) {
      return;
    }
    // Lock immediately before awaiting network calls so concurrent pollCtrl + snap.onSuccess callbacks cannot enter twice
    settledOrderIdsRef.current.add(currentOrderId);

    const effectiveFlow = ctx?.checkoutFlow || (currentOrderId.startsWith('SRV-') ? 'survey' : checkoutFlow);
    const effectiveRoomNumber = activeRoom?.room_number || ctx?.roomNumber || '-';
    const effectivePropertyName = activeProperty?.name || ctx?.propertyName || 'Samara Stay';
    const currentGrossAmount = ctx?.grossAmount ?? activeRoom?.price ?? 0;
    const effectiveTenantName = (effectiveFlow === 'survey' ? surveyForm.fullName : bookingForm.fullName) || ctx?.tenantName || 'Pelanggan Samara';
    const effectiveEmail = (effectiveFlow === 'survey' ? surveyForm.email : bookingForm.email) || ctx?.email || '';
    const effectivePhone = (effectiveFlow === 'survey' ? surveyForm.phone : bookingForm.phone) || ctx?.phone || '-';
    const effectiveSurveyDate = surveyForm.date || ctx?.surveyDate || todayJakarta();
    const effectiveSurveySlot = surveyForm.slot || ctx?.surveySlot || '13:00 - 15:00';
    const effectiveCheckInDate = bookingCheckInDate || ctx?.checkInDate || todayJakarta();
    const effectiveSigUrl = signatureUrl || ctx?.signatureUrl || '';
    const effectiveIsForOther = Boolean(bookingForm.isForOther || ctx?.isForOther);
    const effectiveOccupantName = (bookingForm.occupantName || ctx?.occupantName || '').trim();
    const effectiveOccupantPhone = (bookingForm.occupantPhone || ctx?.occupantPhone || '').trim();
    const effectiveOccupantEmail = (bookingForm.occupantEmail || ctx?.occupantEmail || '').trim();
    const effectiveOccupantNik = (bookingForm.occupantNik || ctx?.occupantNik || '').trim();
    const effectiveIsMarried = Boolean(bookingForm.isMarried || ctx?.isMarried);
    const effectiveSpouseName = (bookingForm.spouseName || ctx?.spouseName || '').trim();
    const effectiveSpousePhone = (bookingForm.spousePhone || ctx?.spousePhone || '').trim();
    const effectiveSpouseNik = (bookingForm.spouseNik || ctx?.spouseNik || '').trim();
    const effectiveSpouseRelation = (bookingForm.spouseRelation || ctx?.spouseRelation || 'istri') as 'istri' | 'suami';

    // G5: Booking & survey settlement MUST be verified and executed by the server (/api/midtrans/status -> settled: true)
    let serverSettled = details?.settled === true;
    let serverReceiptSummary: any = details?.receiptSummary || null;
    if (!serverSettled || !serverReceiptSummary) {
      try {
        const statusResp = await fetch(`/api/midtrans/status/${encodeURIComponent(currentOrderId)}`);
        if (statusResp.ok) {
          const statusData = await statusResp.json();
          serverSettled = statusData?.settled === true;
          if (statusData?.receipt_summary) {
            serverReceiptSummary = statusData.receipt_summary;
          }
        }
      } catch {
        if (!details?.settled) serverSettled = false;
      }
    }

    const resolvedRoomNumber =
      effectiveRoomNumber !== '-'
        ? effectiveRoomNumber
        : (serverReceiptSummary?.roomNo || '-');
    const resolvedPropertyName =
      effectivePropertyName && effectivePropertyName !== 'Samara Stay'
        ? effectivePropertyName
        : (serverReceiptSummary?.propertyName || effectivePropertyName || 'Samara Stay');
    const resolvedTenantName =
      effectiveTenantName && effectiveTenantName !== 'Pelanggan Samara'
        ? effectiveTenantName
        : (serverReceiptSummary?.name || effectiveTenantName || 'Pelanggan Samara');
    const resolvedGrossAmount =
      Number(currentGrossAmount) > 0
        ? Number(currentGrossAmount)
        : Number(serverReceiptSummary?.amountPaid || 0);
    const resolvedIsForOther = effectiveIsForOther || Boolean(serverReceiptSummary?.isForOther);
    const resolvedOccupantName = effectiveOccupantName || serverReceiptSummary?.occupantName || '';
    const resolvedOccupantPhone = effectiveOccupantPhone || serverReceiptSummary?.occupantPhone || '';
    const resolvedOccupantEmail = effectiveOccupantEmail || serverReceiptSummary?.occupantEmail || '';
    const resolvedIsMarried = effectiveIsMarried || Boolean(serverReceiptSummary?.isMarried);
    const resolvedSpouseName = effectiveSpouseName || serverReceiptSummary?.spouseName || '';
    const resolvedSpouseRelation = (effectiveSpouseRelation || serverReceiptSummary?.spouseRelation || 'istri') as 'istri' | 'suami';
    const resolvedPartyInfo = resolveCoupleNames({
      name: resolvedTenantName,
      isForOther: resolvedIsForOther,
      occupantName: resolvedOccupantName,
      isMarried: resolvedIsMarried,
      spouseName: resolvedSpouseName,
      spouseRelation: resolvedSpouseRelation,
      husbandName: serverReceiptSummary?.husbandName,
      wifeName: serverReceiptSummary?.wifeName
    });

    if (!serverSettled) {
      settledOrderIdsRef.current.delete(currentOrderId);
      alert('Pembayaran belum terkonfirmasi lunas oleh server Midtrans. Silakan cek kembali status pembayaran Anda.');
      return;
    }

    // Clear active session from localStorage
    clearActivePaymentSession(currentOrderId);

    // Immediately close reservation form (FORMULIR RESERVASI KAMAR) & return to tampilan awal
    resetToInitialHomeView();
    refreshAllHomeData();

    if (effectiveFlow === 'survey') {
      let finalSurveySigUrl = effectiveSigUrl;
      if (effectiveSigUrl && effectiveSigUrl.startsWith('data:')) {
        try {
          const uploaded = await uploadToSupabaseStorage(
            effectiveSigUrl,
            'signatures',
            `srv_${effectiveTenantName || 'user'}`,
            { forcePNG: true, maxLongestSide: 800 }
          );
          if (uploaded.publicUrl) finalSurveySigUrl = uploaded.publicUrl;
        } catch (e) {
          console.warn('[Home] Survey signature storage upload error:', e);
        }
      }

      // Server auto-settles the survey status to 'survey_confirmed' via /api/midtrans/status/:orderId
      const saved = { invoice_id: currentOrderId };

      // Send survey payment receipt email to end user
      if (effectiveEmail) {
        const ownerSigUrl = settings?.owner_signature_url || DEFAULT_OWNER_SIGNATURE;
        const userSigUrl = finalSurveySigUrl || effectiveSigUrl || '';

        fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: effectiveEmail,
            reservation_number: currentOrderId,
            order_id: currentOrderId,
            subject: `[Samara Stay] Bukti Pembayaran DP Survey - Unit ${effectiveRoomNumber}`,
            html: `
              <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 24px; background-color: #ffffff; color: #1e293b; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);">
                <div style="text-align: center; border-bottom: 2px solid #334155; padding-bottom: 25px; margin-bottom: 30px;">
                  <h1 style="font-size: 28px; font-weight: 800; letter-spacing: 6px; text-transform: uppercase; color: #1e293b; margin: 0;">SAMARA</h1>
                  <p style="font-family: monospace; font-size: 11px; font-weight: bold; letter-spacing: 3px; text-transform: uppercase; color: #64748b; margin: 4px 0 0 0;">S T A Y</p>
                </div>

                <div style="text-align: center; margin-bottom: 30px;">
                  <span style="background-color: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; font-size: 11px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; padding: 6px 16px; border-radius: 9999px; display: inline-block; margin-bottom: 12px;">LUNAS / PAID</span>
                  <h2 style="color: #1e293b; margin: 0; font-size: 20px; font-weight: 700;">BUKTI PEMBAYARAN DP SURVEY</h2>
                  <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0; font-family: monospace;">No. Invoice: ${saved.invoice_id || 'INV-SRV-' + Math.floor(1000 + Math.random() * 9000)}</p>
                </div>

                <div style="margin-bottom: 25px; font-size: 14px; line-height: 1.6; color: #334155;">
                  <p>Halo <strong>${effectiveTenantName}</strong>,</p>
                  <p>Terima kasih atas pembayaran komitmen survey Anda! Reservasi unit kamar Anda telah berhasil dikonfirmasi. Berikut rincian pembayaran DP Survey Anda:</p>
                </div>

                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin: 25px 0;">
                  <h3 style="color: #1e293b; margin-top: 0; margin-bottom: 15px; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">Rincian Komitmen Survey</h3>
                  
                  <table style="width: 100%; font-size: 13px; border-collapse: collapse; line-height: 2;">
                    <tr>
                      <td style="color: #64748b; width: 45%;">Nama Calon Penghuni:</td>
                      <td style="color: #1e293b; font-weight: 700; text-align: right;">${effectiveTenantName}</td>
                    </tr>
                    <tr>
                      <td style="color: #64748b;">No. Handphone:</td>
                      <td style="color: #1e293b; font-weight: 700; text-align: right; font-family: monospace;">${effectivePhone}</td>
                    </tr>
                    <tr>
                      <td style="color: #64748b;">Kamar yang di-survey:</td>
                      <td style="color: #1e293b; font-weight: 700; text-align: right;">Unit ${effectiveRoomNumber}</td>
                    </tr>
                    <tr>
                      <td style="color: #64748b;">Tanggal Survey:</td>
                      <td style="color: #1e293b; font-weight: 700; text-align: right;">${effectiveSurveyDate}</td>
                    </tr>
                    <tr>
                      <td style="color: #64748b;">Jam Kunjungan (Slot):</td>
                      <td style="color: #1e293b; font-weight: 700; text-align: right;">${effectiveSurveySlot} WIB</td>
                    </tr>
                    <tr>
                      <td style="color: #64748b;">Metode Pembayaran:</td>
                      <td style="color: #1e293b; font-weight: 700; text-align: right; text-transform: uppercase;">${details.paymentMethod || 'Midtrans SNAP'}</td>
                    </tr>
                    <tr>
                      <td style="color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 12px; margin-top: 8px;">Jumlah DP Komitmen:</td>
                      <td style="color: #047857; font-weight: 900; font-size: 18px; border-top: 1px dashed #cbd5e1; padding-top: 12px; margin-top: 8px; text-align: right;">
                        Rp 500.000
                      </td>
                    </tr>
                  </table>
                </div>

                <!-- 2. SURAT PERSETUJUAN KONTRAK SEWA -->
                <div style="margin-top: 20px; padding: 16px; border: 1px solid #cbd5e1; border-radius: 12px; background-color: #f8fafc; text-align: left;">
                  <h4 style="margin: 0 0 6px 0; font-size: 11px; font-weight: 800; color: #1e293b; text-transform: uppercase; letter-spacing: 0.5px;">SURAT PERSETUJUAN KONTRAK &amp; KETENTUAN SURVEY RESMI</h4>
                  <p style="margin: 0; font-size: 11px; color: #475569; line-height: 1.5;">
                    Dokumen ini menerangkan persetujuan sah antara <strong>Pihak Pertama (Owner &amp; Manajemen Samara Stay)</strong> dan <strong>Pihak Kedua (Pemesan: ${effectiveTenantName})</strong> atas reservasi survey unit kamar ${effectiveRoomNumber}. Seluruh jaminan komitmen dan jadwal survey berlaku mengikat demi hukum.
                  </p>
                </div>

                <!-- 3. TANDA TANGAN DUA PIHAK BERSEBELAHAN (OWNER & PEMESAN) -->
                <div style="margin-top: 15px; padding: 16px; border: 1px dashed #94a3b8; border-radius: 12px; background-color: #ffffff;">
                  <p style="font-size: 10px; color: #475569; font-weight: 800; margin: 0 0 10px 0; text-transform: uppercase; text-align: center; letter-spacing: 0.5px;">PENGESAHAN TANDA TANGAN DUA PIHAK:</p>
                  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
                    <tr>
                      <td width="50%" align="center" style="padding: 10px; border-right: 1px solid #e2e8f0; vertical-align: bottom;">
                        <p style="font-size: 9px; color: #64748b; font-weight: bold; margin: 0 0 6px 0; text-transform: uppercase;">PIHAK PERTAMA (OWNER)</p>
                        <div style="min-height: 55px; display: flex; align-items: center; justify-content: center;">
                          <img src="${ownerSigUrl}" alt="Tanda Tangan Owner" style="max-height: 55px; max-width: 140px; display: inline-block;" />
                        </div>
                        <p style="font-size: 9px; color: #1e293b; font-weight: 800; margin: 4px 0 0 0; text-transform: uppercase;">SAMARA STAY MANAGEMENT</p>
                        <p style="font-size: 8px; color: #059669; font-weight: bold; margin: 2px 0 0 0; font-family: monospace;">[ STAMP RESMI ]</p>
                      </td>
                      <td width="50%" align="center" style="padding: 10px; vertical-align: bottom;">
                        <p style="font-size: 9px; color: #64748b; font-weight: bold; margin: 0 0 6px 0; text-transform: uppercase;">PIHAK KEDUA (PEMESAN)</p>
                        <div style="min-height: 55px; display: flex; align-items: center; justify-content: center;">
                          ${userSigUrl ? `
                            <img src="${userSigUrl}" alt="Tanda Tangan Pemesan" style="max-height: 55px; max-width: 140px; display: inline-block;" />
                          ` : `
                            <p style="font-size: 10px; color: #059669; font-weight: bold; margin: 15px 0 0 0; font-family: monospace;">✓ DISETUJUI DIGITAL</p>
                          `}
                        </div>
                        <p style="font-size: 9px; color: #1e293b; font-weight: 800; margin: 4px 0 0 0; text-transform: uppercase;">${effectiveTenantName}</p>
                        <p style="font-size: 8px; color: #64748b; margin: 2px 0 0 0; font-family: monospace;">${effectiveEmail}</p>
                      </td>
                    </tr>
                  </table>
                </div>

                <div style="font-size: 13px; line-height: 1.5; color: #475569; margin: 25px 0; padding: 15px; border-left: 4px solid #f59e0b; background-color: #fbf8f3; border-radius: 0 12px 12px 0;">
                  <strong style="color: #1e293b; display: block; margin-bottom: 4px;">Informasi Kebijakan Jaminan:</strong>
                  Uang jaminan DP Survey ini sepenuhnya aman. Jika Anda memutuskan untuk melanjutkan sewa setelah survey, jaminan Rp 500.000 ini akan langsung dikompensasikan (mengurangi) pembayaran sisa sewa kamar Anda. Namun jika Anda tidak hadir sesuai jadwal (No-Show), maka DP dinyatakan hangus.
                </div>

                <div style="text-align: center; margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 25px; font-size: 11px; color: #94a3b8; line-height: 1.6;">
                  <p style="margin: 0; font-weight: 700; color: #64748b;">Layanan Pengelola Samara Stay Premium Boarding</p>
                  <p style="margin: 4px 0 0 0;">Email: info@samarastay.com | Whatsapp Pengelola Hunian</p>
                  <p style="margin: 20px 0 0 0; font-size: 10px; color: #cbd5e1;">&copy; 2026 Samara Stay Residence. Hak Cipta Dilindungi.</p>
                </div>
              </div>
            `
          })
        }).then(res => res.json()).then(resData => console.log('[EMAIL RESPONSE SURVEY]', resData)).catch(e => console.error('Error sending survey payment email:', e));
      }

      const surveyReceiptPayload = {
        type: 'survey' as const,
        id: saved.invoice_id || '999',
        name: resolvedTenantName,
        roomNo: resolvedRoomNumber,
        propertyName: resolvedPropertyName,
        amountPaid: resolvedGrossAmount > 0 ? resolvedGrossAmount : 500000,
        method: details.paymentMethod || serverReceiptSummary?.method || 'Midtrans SNAP',
        date: effectiveSurveyDate || serverReceiptSummary?.date || todayJakarta(),
        details: 'Pembayaran DP Survey Sah.',
        signatureUrl: effectiveSigUrl || serverReceiptSummary?.signatureUrl || '',
        ownerSignatureUrl: serverReceiptSummary?.ownerSignatureUrl || settings?.owner_signature_url || DEFAULT_OWNER_SIGNATURE
      };
      setReceiptData(surveyReceiptPayload);
      try {
        sessionStorage.setItem('samara_last_paid_receipt', JSON.stringify(surveyReceiptPayload));
      } catch {}
    } else {
      const isDaily = effectiveFlow === 'daily' || Boolean(ctx?.isDaily);
      
      let finalBookingSigUrl = effectiveSigUrl;
      if (effectiveSigUrl && effectiveSigUrl.startsWith('data:')) {
        try {
          const uploaded = await uploadToSupabaseStorage(
            effectiveSigUrl,
            'signatures',
            `book_${effectiveTenantName || 'user'}`,
            { forcePNG: true, maxLongestSide: 800 }
          );
          if (uploaded.publicUrl) finalBookingSigUrl = uploaded.publicUrl;
        } catch (e) {
          console.warn('[Home] Booking signature storage upload error:', e);
        }
      }

      // G5: Booking, room occupancy, tenant activation, and ledger entries are settled by the server
      // (/api/midtrans/status/:orderId auto-settle & Midtrans webhook). Client only refreshes room state.
      database.fetchRooms().then(fresh => {
        if (fresh && fresh.length > 0) setRooms(fresh);
      }).catch(() => {});

      // Send booking confirmation email
      const ownerSigUrl = settings?.owner_signature_url || DEFAULT_OWNER_SIGNATURE;
      const userSigUrl = finalBookingSigUrl || effectiveSigUrl || '';

      const targetEmails = Array.from(new Set([effectiveEmail, resolvedIsForOther ? resolvedOccupantEmail : ''].filter(Boolean)));
      for (const targetEmail of targetEmails) {
        const formattedPrice = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(resolvedGrossAmount || currentGrossAmount);
        fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: targetEmail,
            order_id: currentOrderId,
            reservation_number: currentOrderId,
            subject: `[Samara Stay] Invoice Pembayaran & Konfirmasi Sewa - Unit ${resolvedRoomNumber}`,
            html: `
              <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 24px; background-color: #ffffff; color: #1e293b; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05);">
                <div style="text-align: center; border-bottom: 2px solid #334155; padding-bottom: 25px; margin-bottom: 30px;">
                  <h1 style="font-size: 28px; font-weight: 800; letter-spacing: 6px; text-transform: uppercase; color: #1e293b; margin: 0;">SAMARA</h1>
                  <p style="font-family: monospace; font-size: 11px; font-weight: bold; letter-spacing: 3px; text-transform: uppercase; color: #64748b; margin: 4px 0 0 0;">S T A Y</p>
                </div>

                <div style="text-align: center; margin-bottom: 30px;">
                  <span style="background-color: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; font-size: 11px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; padding: 6px 16px; border-radius: 9999px; display: inline-block; margin-bottom: 12px;">LUNAS / PAID</span>
                  <h2 style="color: #1e293b; margin: 0; font-size: 20px; font-weight: 700;">INVOICE PEMBAYARAN</h2>
                  <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0; font-family: monospace;">Order ID: ${currentOrderId}</p>
                </div>

                <div style="margin-bottom: 25px; font-size: 14px; line-height: 1.6; color: #334155;">
                  <p>Halo <strong>${resolvedTenantName}</strong>,</p>
                  <p>Terima kasih atas pembayaran Anda! Transaksi pemesanan kamar sewa Anda telah berhasil dikonfirmasi. Berikut adalah rincian tagihan lunas Anda:</p>
                </div>

                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin: 25px 0;">
                  <h3 style="color: #1e293b; margin-top: 0; margin-bottom: 15px; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">Rincian Transaksi Hunian</h3>
                  
                  <table style="width: 100%; font-size: 13px; border-collapse: collapse; line-height: 2;">
                    ${resolvedPartyInfo.isThirdParty ? `
                    <tr>
                      <td style="color: #64748b; width: 45%;">Pemesan (Pihak Ketiga):</td>
                      <td style="color: #1e293b; font-weight: 700; text-align: right;">${resolvedPartyInfo.bookerName}</td>
                    </tr>
                    <tr>
                      <td style="color: #065f46; font-weight: 700;">Nama Penyewa (Penghuni):</td>
                      <td style="color: #047857; font-weight: 800; text-align: right;">${resolvedPartyInfo.primaryTenantName}</td>
                    </tr>
                    ` : `
                    <tr>
                      <td style="color: #64748b; width: 45%;">Nama Penyewa:</td>
                      <td style="color: #1e293b; font-weight: 700; text-align: right;">${resolvedPartyInfo.primaryTenantName}</td>
                    </tr>
                    `}
                    ${resolvedPartyInfo.isMarriedCouple ? `
                    <tr>
                      <td style="color: #065f46; font-weight: 700;">Status Hunian:</td>
                      <td style="color: #047857; font-weight: 800; text-align: right;">Pasangan Suami Istri (Pasutri)</td>
                    </tr>
                    <tr>
                      <td style="color: #64748b;">Nama Suami:</td>
                      <td style="color: #1e293b; font-weight: 800; text-align: right;">${resolvedPartyInfo.husbandName}</td>
                    </tr>
                    <tr>
                      <td style="color: #64748b;">Nama Istri:</td>
                      <td style="color: #1e293b; font-weight: 800; text-align: right;">${resolvedPartyInfo.wifeName}</td>
                    </tr>
                    ` : ''}
                    <tr>
                      <td style="color: #64748b; width: 45%;">Nama Kos / Unit:</td>
                      <td style="color: #1e293b; font-weight: 700; text-align: right;">${resolvedPropertyName}</td>
                    </tr>
                    <tr>
                      <td style="color: #64748b;">Nomor Kamar:</td>
                      <td style="color: #1e293b; font-weight: 700; text-align: right; font-size: 14px; color: #334155;">Unit ${resolvedRoomNumber}</td>
                    </tr>
                    <tr>
                      <td style="color: #64748b;">Tipe Kontrak:</td>
                      <td style="color: #1e293b; font-weight: 700; text-align: right; text-transform: capitalize;">${isDaily ? 'Harian (Daily)' : 'Bulanan (Monthly)'}</td>
                    </tr>
                    <tr>
                      <td style="color: #64748b;">Tanggal Check-In:</td>
                      <td style="color: #1e293b; font-weight: 700; text-align: right;">${effectiveCheckInDate || '-'}</td>
                    </tr>
                    <tr>
                      <td style="color: #64748b;">Metode Pembayaran:</td>
                      <td style="color: #1e293b; font-weight: 700; text-align: right; text-transform: uppercase;">${details.paymentMethod || 'Midtrans SNAP'}</td>
                    </tr>
                    <tr>
                      <td style="color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 12px; margin-top: 8px;">Total Bayar:</td>
                      <td style="color: #047857; font-weight: 900; font-size: 18px; border-top: 1px dashed #cbd5e1; padding-top: 12px; margin-top: 8px; text-align: right;">
                        ${formattedPrice}
                      </td>
                    </tr>
                  </table>
                </div>

                <!-- 2. SURAT PERSETUJUAN KONTRAK SEWA -->
                <div style="margin-top: 20px; padding: 16px; border: 1px solid #cbd5e1; border-radius: 12px; background-color: #f8fafc; text-align: left;">
                  <h4 style="margin: 0 0 6px 0; font-size: 11px; font-weight: 800; color: #1e293b; text-transform: uppercase; letter-spacing: 0.5px;">SURAT PERSETUJUAN KONTRAK SEWA RESMI</h4>
                  <p style="margin: 0; font-size: 11px; color: #475569; line-height: 1.5;">
                    Dokumen ini menerangkan persetujuan sah antara <strong>Pihak Pertama (Owner &amp; Manajemen Samara Stay)</strong> dan <strong>Pihak Kedua (${resolvedPartyInfo.isThirdParty ? `Pemesan Pihak Ketiga: ${resolvedPartyInfo.bookerName} untuk Penyewa: ${resolvedPartyInfo.primaryTenantName}` : `Penyewa: ${resolvedPartyInfo.primaryTenantName}`}${resolvedPartyInfo.isMarriedCouple ? ` — Pasutri: Suami ${resolvedPartyInfo.husbandName} &amp; Istri ${resolvedPartyInfo.wifeName}` : ''})</strong> atas sewa unit kamar ${resolvedRoomNumber}. Seluruh tata tertib, hak &amp; kewajiban sewa unit, serta deposit tertera berlaku mengikat demi hukum.
                  </p>
                </div>

                <!-- 3. TANDA TANGAN DUA PIHAK BERSEBELAHAN (OWNER & PEMESAN) -->
                <div style="margin-top: 15px; padding: 16px; border: 1px dashed #94a3b8; border-radius: 12px; background-color: #ffffff;">
                  <p style="font-size: 10px; color: #475569; font-weight: 800; margin: 0 0 10px 0; text-transform: uppercase; text-align: center; letter-spacing: 0.5px;">PENGESAHAN TANDA TANGAN DUA PIHAK:</p>
                  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
                    <tr>
                      <td width="50%" align="center" style="padding: 10px; border-right: 1px solid #e2e8f0; vertical-align: bottom;">
                        <p style="font-size: 9px; color: #64748b; font-weight: bold; margin: 0 0 6px 0; text-transform: uppercase;">PIHAK PERTAMA (OWNER)</p>
                        <div style="min-height: 55px; display: flex; align-items: center; justify-content: center;">
                          <img src="${ownerSigUrl}" alt="Tanda Tangan Owner" style="max-height: 55px; max-width: 140px; display: inline-block;" />
                        </div>
                        <p style="font-size: 9px; color: #1e293b; font-weight: 800; margin: 4px 0 0 0; text-transform: uppercase;">SAMARA STAY MANAGEMENT</p>
                        <p style="font-size: 8px; color: #059669; font-weight: bold; margin: 2px 0 0 0; font-family: monospace;">[ STAMP RESMI ]</p>
                      </td>
                      <td width="50%" align="center" style="padding: 10px; vertical-align: bottom;">
                        <p style="font-size: 9px; color: #64748b; font-weight: bold; margin: 0 0 6px 0; text-transform: uppercase;">PIHAK KEDUA (PEMESAN)</p>
                        <div style="min-height: 55px; display: flex; align-items: center; justify-content: center;">
                          ${userSigUrl ? `
                            <img src="${userSigUrl}" alt="Tanda Tangan Pemesan" style="max-height: 55px; max-width: 140px; display: inline-block;" />
                          ` : `
                            <p style="font-size: 10px; color: #059669; font-weight: bold; margin: 15px 0 0 0; font-family: monospace;">✓ DISETUJUI DIGITAL</p>
                          `}
                        </div>
                        <p style="font-size: 9px; color: #1e293b; font-weight: 800; margin: 4px 0 0 0; text-transform: uppercase;">${resolvedTenantName}</p>
                        ${resolvedPartyInfo.isThirdParty ? `<p style="font-size: 8px; color: #047857; font-weight: 700; margin: 2px 0 0 0;">Penyewa: ${resolvedPartyInfo.primaryTenantName}</p>` : ''}
                        <p style="font-size: 8px; color: #64748b; margin: 2px 0 0 0; font-family: monospace;">${effectiveEmail}</p>
                      </td>
                    </tr>
                  </table>
                </div>

                <div style="margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 25px;">
                  <h4 style="color: #1e293b; margin-top: 0; margin-bottom: 12px; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Petunjuk Check-In:</h4>
                  <ol style="font-size: 13px; color: #475569; padding-left: 20px; line-height: 1.7; margin: 0;">
                    <li style="margin-bottom: 8px;">Simpan invoice digital ini sebagai bukti pelunasan yang sah saat serah terima unit.</li>
                    <li style="margin-bottom: 8px;">Akses smart lock atau kunci fisik kamar beserta kartu akses akan diberikan oleh asisten hunian saat Anda tiba di lokasi.</li>
                    <li>Harap membawa kartu identitas diri asli (KTP / Passport) yang sesuai saat check-in.</li>
                  </ol>
                </div>

                <div style="text-align: center; margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 25px; font-size: 11px; color: #94a3b8; line-height: 1.6;">
                  <p style="margin: 0; font-weight: 700; color: #64748b;">Layanan Pengelola Samara Stay Premium Boarding</p>
                  <p style="margin: 20px 0 0 0; font-size: 10px; color: #cbd5e1;">&copy; 2026 Samara Stay Residence. Hak Cipta Dilindungi.</p>
                </div>
              </div>
            `
          })
        }).then(res => res.json()).then(resData => console.log('[EMAIL RESPONSE BOOKING]', resData)).catch(err => console.error('Error sending booking confirmation email:', err));
      }

      const bookingReceiptPayload = {
        type: 'booking' as const,
        id: currentOrderId || '999',
        name: resolvedTenantName,
        roomNo: resolvedRoomNumber,
        propertyName: resolvedPropertyName,
        amountPaid: resolvedGrossAmount,
        method: details.paymentMethod || serverReceiptSummary?.method || 'Midtrans SNAP',
        date: serverReceiptSummary?.date || todayJakarta(),
        details: 'Bukti lunas kontrak sewa sepihak.',
        signatureUrl: effectiveSigUrl || serverReceiptSummary?.signatureUrl || '',
        ownerSignatureUrl: serverReceiptSummary?.ownerSignatureUrl || settings?.owner_signature_url || DEFAULT_OWNER_SIGNATURE,
        isForOther: resolvedIsForOther,
        occupantName: resolvedOccupantName,
        occupantPhone: resolvedOccupantPhone,
        occupantEmail: resolvedOccupantEmail,
        occupantNik: effectiveOccupantNik,
        isMarried: resolvedIsMarried,
        spouseName: resolvedSpouseName,
        spousePhone: effectiveSpousePhone,
        spouseNik: effectiveSpouseNik,
        spouseRelation: resolvedSpouseRelation,
        husbandName: resolvedPartyInfo.husbandName,
        wifeName: resolvedPartyInfo.wifeName
      };
      setReceiptData(bookingReceiptPayload);
      try {
        sessionStorage.setItem('samara_last_paid_receipt', JSON.stringify(bookingReceiptPayload));
      } catch {}
    }

    // R19: Keep invoice modal open until the user clicks "Unduh PDF" or "Tutup" (removed 3.5s auto-reload).
    setShowReceipt(true);
  };

  // Post-Refresh & Redirect Payment Recovery: automatically verify and settle active Midtrans orders after browser refresh
  useEffect(() => {
    let pollCtrl: ReturnType<typeof pollWithBackoff> | null = null;
    let isCancelled = false;

    const recoverPaymentAfterRefresh = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const urlOrderId = urlParams.get('order_id') || urlParams.get('orderId');

        let savedSession: any = null;
        const rawSession = localStorage.getItem(ACTIVE_PAYMENT_STORAGE_KEY);
        if (rawSession) {
          try {
            savedSession = JSON.parse(rawSession);
          } catch {}
        }

        const targetOrderId = urlOrderId || savedSession?.orderId;
        if (!targetOrderId) return;

        // Ignore expired local sessions (> 24 hours old) if not triggered by URL param
        if (!urlOrderId && savedSession?.createdAt && Date.now() - Number(savedSession.createdAt) > 24 * 60 * 60 * 1000) {
          clearActivePaymentSession(targetOrderId);
          return;
        }

        const cleanUrlOrderParams = () => {
          if (!urlOrderId) return;
          try {
            const url = new URL(window.location.href);
            url.searchParams.delete('order_id');
            url.searchParams.delete('orderId');
            url.searchParams.delete('status_code');
            url.searchParams.delete('transaction_status');
            window.history.replaceState({}, '', url.pathname + url.search + url.hash);
          } catch {}
        };

        const checkAndRecover = async (): Promise<boolean> => {
          if (isCancelled) return true;
          const resp = await fetch(`/api/midtrans/status/${encodeURIComponent(targetOrderId)}`);
          if (!resp.ok) return false;
          const resData = await resp.json();

          if (resData?.settled === true) {
            cleanUrlOrderParams();
            const srvSum = resData?.receipt_summary;
            const recoveryCtx = savedSession && savedSession.orderId === targetOrderId
              ? {
                  ...savedSession,
                  tenantName: savedSession.tenantName || srvSum?.name || 'Pelanggan Samara',
                  roomNumber: savedSession.roomNumber || srvSum?.roomNo || '-',
                  propertyName: savedSession.propertyName || srvSum?.propertyName || 'Samara Stay',
                  grossAmount: Number(savedSession.grossAmount || srvSum?.amountPaid || resData?.midtrans?.gross_amount || 0)
                }
              : {
                  orderId: targetOrderId,
                  checkoutFlow: targetOrderId.startsWith('SRV-') ? 'survey' : 'monthly',
                  tenantName: srvSum?.name || 'Pelanggan Samara',
                  grossAmount: Number(srvSum?.amountPaid || resData?.midtrans?.gross_amount || 0),
                  roomNumber: srvSum?.roomNo || '-',
                  propertyName: srvSum?.propertyName || 'Samara Stay'
                };
            await handleSandboxPaymentSuccess({
              transactionId: resData?.midtrans?.transaction_id || targetOrderId,
              paymentMethod: resData?.midtrans?.payment_type || 'Midtrans SNAP',
              settlementTime: resData?.midtrans?.settlement_time || new Date().toISOString().replace('T', ' ').slice(0, 19),
              settled: true,
              receiptSummary: srvSum || null
            }, recoveryCtx);
            return true;
          }

          if (resData?.rejected === true) {
            cleanUrlOrderParams();
            clearActivePaymentSession(targetOrderId);
            database.fetchRooms().then(fresh => { if (fresh?.length) setRooms(fresh); }).catch(() => {});
            return true;
          }

          return false;
        };

        const immediatelyDone = await checkAndRecover();
        if (!immediatelyDone && !isCancelled) {
          pollCtrl = pollWithBackoff({
            fn: () => checkAndRecover(),
            isTerminal: (done) => Boolean(done),
            baseIntervalMs: 3000,
            maxIntervalMs: 15000,
            hiddenTabMultiplier: 2,
            maxAttempts: 12
          });
        }
      } catch (e) {
        console.warn('Post-refresh payment recovery check warning:', e);
      }
    };

    recoverPaymentAfterRefresh();

    return () => {
      isCancelled = true;
      if (pollCtrl) pollCtrl.stop();
    };
  }, []);

  const getPropertyCategoryLabel = (name: string): string => {
    const lower = (name || '').toLowerCase();
    if (lower.includes('tiara')) return 'Compact Kos';
    if (lower.includes('atika')) return 'Urban hub kos';
    if (lower.includes('samara')) return 'Companion kos';
    return name;
  };

  const findPropertyBySelection = (selection: string): Property | undefined => {
    if (!selection || properties.length === 0) return undefined;
    const selLower = selection.trim().toLowerCase();
    return properties.find(p => {
      const pNameLower = (p.name || '').toLowerCase();
      const catLower = getPropertyCategoryLabel(p.name).toLowerCase();
      return (
        String(p.id) === selection ||
        catLower === selLower ||
        catLower.includes(selLower) ||
        pNameLower === selLower ||
        pNameLower.includes(selLower) ||
        (p.address || '').toLowerCase().includes(selLower) ||
        (selLower === 'compact kos' && pNameLower.includes('tiara')) ||
        (selLower === 'urban hub kos' && pNameLower.includes('atika')) ||
        (selLower === 'companion kos' && pNameLower.includes('samara'))
      );
    });
  };

  const openPropertyDetail = (prop: Property) => {
    const slug = getPropertySlug(prop);
    updateUrlPropertyParam(slug);
    setSelectedMapProperty(prop);
    setActiveProperty(prop);
    setUserPage('detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSearchTrigger = (e: React.FormEvent) => {
    e.preventDefault();
    setSelectedType('all');
    if (searchLocation && properties.length > 0) {
      const matched = findPropertyBySelection(searchLocation);
      if (matched) {
        openPropertyDetail(matched);
        return;
      }
    }
    updateUrlPropertyParam(null);
    setUserPage('search');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Sync searchLocation selection directly to selectedMapProperty so the map pans immediately
  useEffect(() => {
    if (searchLocation && properties.length > 0) {
      const matched = findPropertyBySelection(searchLocation);
      if (matched) {
        setSelectedMapProperty(matched);
      }
    }
  }, [searchLocation, properties]);

  // Filter properties based on the search inputs + advanced sidebar filter
  const filteredProperties = properties.filter(p => {
    const matchLocation = !searchLocation.trim() || 
      p.address.toLowerCase().includes(searchLocation.toLowerCase()) || 
      p.name.toLowerCase().includes(searchLocation.toLowerCase()) ||
      getPropertyCategoryLabel(p.name).toLowerCase().includes(searchLocation.toLowerCase());

    const matchType = selectedType === 'all' || p.type === selectedType;
    const matchPrice = p.price <= priceRange;

    const pRooms = rooms.filter(r => r.property_id === p.id);
    const matchAvailability = !onlyAvailable || pRooms.some(r => isRoomAvailable(r));

    // Advanced facilities filters (connected to master facilities list from Supabase)
    const matchFacilities = selectedRoomFacilities.length === 0 ||
      selectedRoomFacilities.every(f => 
        (p.facilities || []).some((pf: any) => pf.name.toLowerCase().includes(f.toLowerCase())) ||
        pRooms.some(r => 
          (r.facilities || []).some((rf: any) => rf.name.toLowerCase().includes(f.toLowerCase()))
        )
      );

    return matchLocation && matchType && matchPrice && matchAvailability && matchFacilities;
  });

  // Filter individual rooms for direct interactive room search
  const filteredRooms = rooms.filter(r => {
    const parentProperty = properties.find(p => p.id === r.property_id);
    if (!parentProperty) return false;

    const matchLocation = !searchLocation.trim() || 
      parentProperty.address.toLowerCase().includes(searchLocation.toLowerCase()) || 
      parentProperty.name.toLowerCase().includes(searchLocation.toLowerCase()) ||
      getPropertyCategoryLabel(parentProperty.name).toLowerCase().includes(searchLocation.toLowerCase()) ||
      r.room_number.toLowerCase().includes(searchLocation.toLowerCase()) ||
      (r.room_type || '').toLowerCase().includes(searchLocation.toLowerCase());

    const matchType = selectedType === 'all' || parentProperty.type === selectedType;
    const matchRoomCategory = searchRoomType === 'all' || (r.room_type || 'Standard') === searchRoomType;
    const matchPrice = r.price <= priceRange;
    const matchAvailability = !onlyAvailable || isRoomAvailable(r);

    // Advanced facilities filters (connected to master facilities list from Supabase)
    const matchFacilities = selectedRoomFacilities.length === 0 || 
      selectedRoomFacilities.every(f => 
        (r.facilities || []).some((rf: any) => rf.name.toLowerCase().includes(f.toLowerCase())) ||
        (parentProperty.facilities || []).some((pf: any) => pf.name.toLowerCase().includes(f.toLowerCase()))
      );

    return matchLocation && matchType && matchRoomCategory && matchPrice && matchAvailability && matchFacilities;
  });

  // Leaflet map initialization and updates hook
  useEffect(() => {
    // If the page is not 'search', remove the map if it exists, and clean up
    if (userPage !== 'search') {
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch (e) {
          console.warn('[LEAFLET CLEANUP] Error removing map:', e);
        }
        mapRef.current = null;
      }
      return;
    }

    // Only initialize map if it doesn't exist yet
    if (!mapRef.current) {
      const container = document.getElementById('leaflet-map-container');
      if (container) {
        // We set the default view to Jakarta/Depok coordinates
        const map = L.map('leaflet-map-container', {
          zoomControl: true,
          scrollWheelZoom: true,
        }).setView([-6.368, 106.83], 12); // Depok UI Campus default
        
        createGoogleMapsRoadmapLayer().addTo(map);

        mapRef.current = map;

        // Auto-invalidate size on container resize (perfect for orientation/screen changes!)
        if (typeof ResizeObserver !== 'undefined') {
          const resizeObserver = new ResizeObserver(() => {
            try {
              map.invalidateSize();
            } catch (e) {
              console.warn('[LEAFLET] Error invalidating map size:', e);
            }
          });
          resizeObserver.observe(container);
        }
      }
    }

    const map = mapRef.current;
    if (!map) return;

    // Clear existing markers
    Object.values(markersRef.current).forEach((marker: any) => marker.remove());
    markersRef.current = {};

    // Add markers for current filteredProperties
    filteredProperties.forEach(p => {
      const coords = sanitizePropertyCoordinates(p);
      if (isValidCoordinate(coords.lat, coords.lng)) {
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

        const marker = L.marker([coords.lat, coords.lng], { icon: customIcon })
          .addTo(map)
          .bindPopup(`
            <div style="font-family: system-ui, -apple-system, sans-serif; padding: 4px; max-width: 220px;">
              <div style="font-size: 9px; font-weight: 800; color: #EA4335; text-transform: uppercase; margin-bottom: 2px;">📍 Google Maps</div>
              <strong style="font-size: 12px; color: #1e293b; display: block; margin-bottom: 2px;">${p.name}</strong>
              <p style="font-size: 10px; color: #64748b; margin: 0 0 6px 0; line-height: 1.3;">${p.address}</p>
              <div style="display: flex; gap: 6px; padding-top: 4px; border-top: 1px solid #f1f5f9;">
                <a href="${getGoogleMapsSearchUrl(coords.lat, coords.lng)}" target="_blank" rel="noopener noreferrer" style="font-size: 10px; font-weight: 700; color: #2E6F40; text-decoration: underline;">Google Maps ↗</a>
                <a href="${getGoogleMapsDirectionsUrl(coords.lat, coords.lng)}" target="_blank" rel="noopener noreferrer" style="font-size: 10px; font-weight: 700; color: #0284c7; text-decoration: underline;">Rute ↗</a>
              </div>
            </div>
          `)
          .on('click', () => {
            setSelectedMapProperty(p);
            map.setView([coords.lat, coords.lng], 16, { animate: true });
          });

        markersRef.current[p.id] = marker;
      }
    });

    // Directly focus on selected branch coordinate, or single result, or fit bounds
    if (selectedMapProperty) {
      const selCoords = sanitizePropertyCoordinates(selectedMapProperty);
      if (isValidCoordinate(selCoords.lat, selCoords.lng)) {
        map.setView([selCoords.lat, selCoords.lng], 16, { animate: true });
      }
    } else {
      const validCoords = filteredProperties
        .map(p => sanitizePropertyCoordinates(p))
        .filter(c => isValidCoordinate(c.lat, c.lng))
        .map(c => [c.lat, c.lng] as [number, number]);

      if (validCoords.length === 1) {
        map.setView(validCoords[0], 16, { animate: true });
      } else if (validCoords.length > 1) {
        const bounds = L.latLngBounds(validCoords);
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
        }
      }
    }

  }, [filteredProperties, selectedMapProperty, userPage]);

  // Handle zooming/panning to property when selectedMapProperty changes outside map
  useEffect(() => {
    if (mapRef.current && selectedMapProperty) {
      const selCoords = sanitizePropertyCoordinates(selectedMapProperty);
      if (isValidCoordinate(selCoords.lat, selCoords.lng)) {
        mapRef.current.setView([selCoords.lat, selCoords.lng], 16, { animate: true });
      }
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
      <div className="bg-brand-primary border-b border-brand-steel/30 relative lg:sticky lg:top-[61px] z-30 px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3 shadow-sm flex items-center justify-between gap-3 text-xs text-[#F8F9FA] overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <button 
            onClick={() => {
              updateUrlPropertyParam(null);
              setUserPage('home');
              setActiveProperty(null);
            }} 
            className={`font-semibold px-3 py-1.5 rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer ${userPage === 'home' ? 'bg-brand-beige text-brand-primary font-extrabold shadow-sm' : 'text-slate-200 hover:text-white'}`}
          >
            {lang === 'id' ? 'Beranda' : 'Home'}
          </button>
          <button 
            onClick={() => {
              updateUrlPropertyParam(null);
              setUserPage('search');
              setActiveProperty(null);
            }} 
            className={`font-semibold px-3 py-1.5 rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer ${userPage === 'search' ? 'bg-brand-beige text-brand-primary font-extrabold shadow-sm' : 'text-slate-200 hover:text-white'}`}
          >
            {lang === 'id' ? 'Cari dan Sewa Kos' : 'Search & Rent Rooms'}
          </button>
          <button 
            onClick={() => {
              updateUrlPropertyParam(null);
              setUserPage('map');
            }} 
            className={`font-semibold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${userPage === 'map' ? 'bg-brand-beige text-brand-primary font-extrabold shadow-sm' : 'text-slate-200 hover:text-white'}`}
          >
            <MapPin size={12} className={userPage === 'map' ? 'text-brand-primary' : 'text-emerald-400'} />
            <span>{lang === 'id' ? 'Peta & Sekitar' : 'Map & Amenities'}</span>
          </button>
          {activeProperty && (
            <div className="hidden sm:flex items-center gap-2 text-[#64748B] whitespace-nowrap shrink-0">
              <ChevronRight size={12} />
              <span className="text-brand-beige font-bold bg-brand-steel/20 px-2.5 py-1 rounded-md border border-brand-steel/30 truncate max-w-[180px]">{activeProperty.name}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2.5 md:gap-4 shrink-0">
          <div className="hidden md:flex items-center gap-2 text-brand-beige/85 font-mono text-[10px] whitespace-nowrap">
            <Sparkles size={12} className="text-brand-beige animate-pulse" />
            <span>{lang === 'id' ? 'GARANSI HARGA ALL-IN ' : 'HONEST ALL-IN PRICE GUARANTEE'}</span>
          </div>

          {/* Translation Toggle Switcher (Indonesia / English) */}
          <div className="flex items-center bg-black/30 p-1 rounded-xl border border-white/20 shadow-inner shrink-0">
            <button
              type="button"
              onClick={() => setLang('id')}
              className={`px-2 sm:px-2.5 py-1 rounded-lg font-extrabold text-[11px] flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap ${
                lang === 'id'
                  ? 'bg-brand-beige text-brand-primary shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
              title="Bahasa Indonesia"
            >
              <span className="text-xs sm:text-sm">🇮🇩</span>
              <span>ID</span>
            </button>
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`px-2 sm:px-2.5 py-1 rounded-lg font-extrabold text-[11px] flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap ${
                lang === 'en'
                  ? 'bg-brand-beige text-brand-primary shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
              title="English"
            >
              <span className="text-xs sm:text-sm">🇬🇧</span>
              <span>EN</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================== */}
      {/* VIEW 1: HOME PAGE / LANDING PAGE */}
      {/* ========================================================== */}
      {userPage === 'home' && (
        <div className="space-y-12 sm:space-y-16 animate-fade-in">
          
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
            className="relative py-14 sm:py-20 lg:py-28 px-4 sm:px-6 md:px-8 bg-gradient-to-br from-brand-primary via-brand-darker to-brand-primary border-b border-brand-steel/30 overflow-hidden text-[#F8F9FA] perspective-1000 preserve-3d"
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
                <p className="text-[10px] font-bold uppercase tracking-wider text-brand-beige">{lang === 'id' ? 'PENGHUNI AKTIF' : 'ACTIVE TENANTS'}</p>
                <p className="text-[9px] text-slate-350">{lang === 'id' ? 'Sudah Menetap Nyaman' : 'Living Comfortably'}</p>
              </div>
            </div>

            <div 
              className="absolute hidden lg:flex items-center gap-3 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-4 bottom-14 right-12 shadow-xl transition-transform duration-500 ease-out select-none pointer-events-none"
              style={{
                transform: `translate3d(${heroMouse.x * -45}px, ${heroMouse.y * -45}px, 80px) rotate(${heroMouse.y * -12}deg)`
              }}
            >
              <div className="w-9 h-9 rounded-full bg-[#F8F9FA] flex items-center justify-center text-brand-primary shadow">
                <Sparkles size={14} className="text-[#0D9488] animate-bounce" />
              </div>
              <div className="text-left">
                <p className="text-[10px] font-bold uppercase tracking-wider text-brand-beige">{lang === 'id' ? 'Garansi Harga All-In' : 'All-In Price Guarantee'}</p>
                <p className="text-[9px] text-slate-350">{lang === 'id' ? 'Sewa Mudah Tanpa Drama' : 'Hassle-Free Renting'}</p>
              </div>
            </div>

            {/* Content Box with intermediate parallax value */}
            <div 
              className="max-w-6xl mx-auto relative z-10 text-center space-y-5 sm:space-y-6 transition-transform duration-300 ease-out preserve-3d"
              style={{
                transform: `translate3d(${heroMouse.x * 12}px, ${heroMouse.y * 12}px, 20px)`
              }}
            >
              
              <div className="inline-flex items-center gap-2 bg-brand-beige/10 border border-brand-beige/25 px-3.5 py-1.5 rounded-full text-[11px] sm:text-xs font-semibold tracking-wider text-brand-beige animate-pulse">
                <Sparkle size={13} className="fill-brand-beige" />
                SAMARA STAY EXCLUSIVE
              </div>

              <h1 className="text-3xl sm:text-4xl md:text-6xl font-black font-display tracking-tight leading-tight max-w-4xl mx-auto text-white">
                {lang === 'id' ? 'Standar Baru Hunian Modern yang Praktis.' : 'The New Standard for Modern & Practical Living.'}
              </h1>
              
              <p className="text-slate-200 text-xs sm:text-sm md:text-base max-w-2xl mx-auto font-light leading-relaxed px-2">
                {lang === 'id' 
                  ? 'Di mana pun cabangnya, nikmati kenyamanan kos eksklusif dengan sistem all-inclusive. Lengkap dengan Wi-Fi, token listrik, dan laundry tanpa biaya tambahan.'
                  : 'Wherever the branch, enjoy exclusive boarding comfort with an all-inclusive system. Complete with Wi-Fi, electricity, and laundry with no hidden costs.'}
              </p>

              {/* Large Interactive Search Bar with full 3D interactive tilt */}
              <form 
                onSubmit={handleSearchTrigger} 
                className="bg-white/95 backdrop-blur-md rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-brand-beige/65 w-full max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4 text-left shadow-2xl mt-8 sm:mt-12 text-brand-primary transition-all duration-300 ease-out"
                style={{
                  transform: `perspective(1000px) rotateX(${heroMouse.y * -8}deg) rotateY(${heroMouse.x * 8}deg) translate3d(${heroMouse.x * 15}px, ${heroMouse.y * 15}px, 35px)`,
                  transformStyle: 'preserve-3d'
                }}
              >
                
                <div className="transition-all duration-300 hover:translate-z-6">
                  <label className="block text-[10px] font-bold text-brand-steel uppercase tracking-widest mb-1.5 font-mono">{lang === 'id' ? 'KATEGORI YANG TERSEDIA' : 'AVAILABLE CATEGORIES'}</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 text-brand-taupe" size={16} />
                    <select
                      value={searchLocation}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSearchLocation(val);
                        if (val) {
                          const matched = findPropertyBySelection(val);
                          if (matched) {
                            openPropertyDetail(matched);
                          }
                        }
                      }}
                      className="w-full bg-[#F8F9FA] border border-brand-beige rounded-xl pl-9 pr-3 py-2.5 text-xs font-medium text-brand-primary focus:outline-none focus:border-brand-primary cursor-pointer"
                    >
                      <option value="">{lang === 'id' ? 'Semua Kategori' : 'All Categories'}</option>
                      {properties.map(p => (
                        <option key={p.id} value={getPropertyCategoryLabel(p.name)}>{getPropertyCategoryLabel(p.name)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="transition-all duration-300 hover:translate-z-6">
                  <label className="block text-[10px] font-bold text-brand-steel uppercase tracking-widest mb-1.5 font-mono">{lang === 'id' ? 'TANGGAL MASUK' : 'CHECK-IN DATE'}</label>
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
                    {lang === 'id' ? 'CARI KOS SEKARANG' : 'SEARCH ROOMS NOW'}
                  </button>
                </div>

              </form>

            </div>
          </div>

          {/* Fasilitas Standar Setiap Cabang */}
          {standardFacilities && standardFacilities.length > 0 && (
            <div className="max-w-7xl mx-auto px-4 md:px-8 space-y-8">
              <h2 className="text-2xl md:text-3xl font-black text-brand-primary font-display tracking-tight text-left">
                {lang === 'id' ? 'Fasilitas Standar Setiap Cabang' : 'Standard Amenities in Every Branch'}
              </h2>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
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
          )}

          {/* Rekomendasi Properti Terpopuler */}
          <div id="cabang-samara-stay-section" className="max-w-6xl mx-auto px-4 space-y-12 py-12">
            <div className="text-center space-y-2">
              <span className="text-[10px] md:text-xs font-bold text-[#1D603A] tracking-[0.2em] uppercase font-mono">
                {lang === 'id' ? 'LOKASI KAMI' : 'OUR LOCATIONS'}
              </span>
              <h2 className="text-3xl md:text-4xl font-bold text-brand-primary tracking-tight font-serif">
                {lang === 'id' ? 'Pilih Cabang Samara Stay' : 'Select a Samara Stay Branch'}
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-10">
              {properties.slice(0, 4).map((p, idx) => {
                const pRooms = rooms.filter(r => r.property_id === p.id);
                const availableCount = pRooms.filter(r => isRoomAvailable(r)).length;
                
                // Check if property is Kost Atikah Kemayoran (strictly excluding Tiara/Cempaka/Ciputra)
                const nameLower = p.name.toLowerCase();
                const isTiaraCempaka = nameLower.includes('ciputra') || nameLower.includes('cempaka') || nameLower.includes('tiara');
                const isAtikah = !isTiaraCempaka && (nameLower.includes('atikah') || nameLower.includes('kemayoran') || nameLower.includes('putri') || p.id === 2);

                const propertyDisplayName = p.name;

                // Color themes alternating between green and navy
                const isGreen = idx % 2 === 0;
                const themeBadgeClass = isGreen ? 'bg-[#1D603A]' : 'bg-[#2E3545]';
                const themeBtnClass = isGreen 
                  ? 'bg-[#205D41] hover:bg-[#164731] text-white' 
                  : 'bg-[#374457] hover:bg-[#273241] text-white';

                const detailedDesc = (p.description && p.description.trim() && p.description !== '(test)')
                  ? p.description
                  : (isAtikah
                      ? (lang === 'id' 
                          ? "Terletak sangat strategis di pusat kota Kemayoran, menghadirkan konsep hunian kos modern serta opsi sewa kamar harian fully furnished yang nyaman, tenang, dan praktis."
                          : "Strategically located in the city center, offering modern boarding concepts and fully furnished daily room rentals that are comfortable, quiet, and convenient.")
                      : (lang === 'id' 
                          ? "Terletak di kawasan Kemayoran yang strategis dan tenang, menawarkan pengalaman tinggal premium dengan fasilitas lengkap dan aman."
                          : "Located in a serene residential area in Kemayoran, offering a premium living experience with complete amenities."));

                return (
                  <div 
                    key={p.id}
                    id={`cabang-card-${p.id}`}
                    className="bg-white border border-brand-beige rounded-[24px] overflow-hidden shadow-sm flex flex-col group transition-all duration-300 hover:shadow-md text-left"
                  >
                    <div className="relative h-[280px] sm:h-[340px] bg-slate-100 overflow-hidden select-none">
                      <img 
                        src={p.image_url || "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=600&q=80"} 
                        alt={propertyDisplayName}
                        className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-500"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute top-4 right-4">
                        <span className={`px-4 py-1 rounded-md text-[10px] font-bold text-white uppercase tracking-wider ${themeBadgeClass}`}>
                          {lang === 'id' ? 'Tersedia' : 'Available'}
                        </span>
                      </div>
                    </div>

                    <div className="p-6 md:p-8 flex-1 flex flex-col justify-between space-y-6 text-left">
                      <div className="space-y-3.5">
                        <h3 className="font-extrabold text-brand-primary text-xl md:text-2xl tracking-tight">
                          {propertyDisplayName}
                        </h3>
                        
                        <div className="flex items-start gap-1.5 text-brand-steel text-xs">
                          <MapPin size={15} className="text-brand-taupe shrink-0 mt-0.5" />
                          <span className="font-medium text-[#64748B] leading-relaxed">{p.address}</span>
                        </div>
                        
                        <p className="text-brand-steel text-xs font-light leading-relaxed">
                          {detailedDesc}
                        </p>
                      </div>

                      <div className="space-y-4 pt-5 border-t border-brand-beige/50">
                        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                          {/* Rating & Tipe Kamar Only */}
                          <div className="flex items-center gap-2.5 text-brand-steel">
                            <span className="flex items-center gap-1 font-bold text-brand-primary">
                              <Star size={14} className="text-[#0D9488] fill-amber-500" />
                              4.9
                            </span>
                            <span className="w-1.5 h-1.5 rounded-full bg-brand-beige" />
                            <span className="text-[10px] font-extrabold font-mono uppercase bg-emerald-50 text-emerald-800 border border-emerald-200/80 px-2.5 py-0.5 rounded-md">
                              {getPropertyCategoryLabel(p.name)}
                            </span>
                          </div>
                          
                          <div className="flex items-baseline gap-1">
                            <span className="text-brand-steel text-[10px] font-medium uppercase font-mono tracking-wider">{lang === 'id' ? 'Mulai Rp' : 'From IDR'}</span>
                            <span className="text-base font-extrabold text-brand-primary tabular-nums">
                              {formatRupiah(p.price).replace("Rp", "").trim()}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          id={`btn-detail-cabang-${p.id}`}
                          onClick={() => {
                            openPropertyDetail(p);
                          }}
                          className={`w-fit inline-flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-xs cursor-pointer transition-all ${themeBtnClass}`}
                        >
                          {lang === 'id' ? 'Lihat Detail Cabang' : 'View Branch Details'}
                          <ArrowRight size={14} />
                        </button>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          </div>

          {/* Interactive Leaflet Map Showcase Banner */}
          <div className="max-w-6xl mx-auto px-4">
            <div className="bg-gradient-to-r from-brand-primary via-[#112d22] to-brand-primary border border-brand-steel/30 rounded-3xl p-6 md:p-8 text-[#F8F9FA] shadow-xl relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6 text-left">
              <div className="space-y-2 max-w-xl z-10">
                <div className="inline-flex items-center gap-1.5 bg-brand-beige/20 border border-brand-beige/40 px-3 py-1 rounded-full text-brand-beige text-[11px] font-bold font-mono tracking-wider">
                  <Compass size={12} className="text-brand-beige animate-spin" style={{ animationDuration: '8s' }} />
                  {lang === 'id' ? 'PETA INTERAKTIF & FASILITAS SEKITAR' : 'INTERACTIVE MAP & NEARBY AMENITIES'}
                </div>
                <h3 className="text-xl md:text-2xl font-black text-white tracking-tight font-display">
                  {lang === 'id' 
                    ? 'Eksplorasi Lokasi Kos & Fasilitas Publik Terdekat' 
                    : 'Explore Property Locations & Nearby Public Amenities'}
                </h3>
                <p className="text-xs text-slate-350 leading-relaxed font-light">
                  {lang === 'id'
                    ? 'Cek kemudahan akses transportasi (KRL/MRT), universitas ternama (UI & RSCM), pusat kuliner, kafe, minimarket, dan fasilitas kesehatan di sekitar cabang Samara Stay.'
                    : 'Check easy access to transit (KRL/MRT), top universities, food courts, cafes, convenience stores, and healthcare around Samara Stay branches.'}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 shrink-0 z-10 w-full md:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    setUserPage('map');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="w-full sm:w-auto bg-brand-beige hover:bg-[#e4cfb2] text-brand-primary px-6 py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-black/20 cursor-pointer"
                >
                  <MapPin size={14} className="text-brand-primary" />
                  <span>{lang === 'id' ? 'Buka Peta Interaktif' : 'Open Interactive Map'}</span>
                  <ArrowRight size={14} />
                </button>
              </div>

              {/* Decorative background accents */}
              <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-brand-beige via-transparent to-transparent pointer-events-none" />
            </div>
          </div>

          {/* Mengapa Memilih Samara */}
          <div id="tentang-section" className="bg-[#EEF7F0]/30 py-16 border-y border-brand-beige/50">
            <div className="max-w-6xl mx-auto px-4 grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
              <div className="md:col-span-5 space-y-4 text-left">
                <span className="text-[10px] font-extrabold text-[#2E6F40] tracking-widest uppercase font-mono bg-[#EEF7F0] px-3 py-1 rounded-md border border-[#2E6F40]/25">
                  {lang === 'id' ? 'Kenapa Samara Stay?' : 'Why Samara Stay?'}
                </span>
                <h2 className="text-3xl font-black text-brand-primary font-display tracking-tight leading-tight">
                  {lang === 'id' ? 'Mengapa Memilih Samara Stay' : 'Why Choose Samara Stay'}
                </h2>
                <p className="text-brand-steel text-sm font-light leading-relaxed">
                  {lang === 'id' 
                    ? 'Kami berkomitmen untuk menyediakan standar hunian kost terbaik dengan kenyamanan ekstra, kepastian layanan, dan transparansi penuh tanpa adanya drama untuk memudahkan anda dalam mencari hunian yang nyaman'
                    : 'We are committed to providing top-standard boarding residences with extra comfort, guaranteed service, and full transparency to make finding your ideal home effortless.'}
                </p>
              </div>
              
              <div className="md:col-span-7 space-y-3">
                {whyChooseUs.map((item, idx) => {
                  const displayText = typeof item === 'string'
                    ? item
                    : ((item as any)?.title 
                        ? `${(item as any).title}${(item as any)?.description ? ` - ${(item as any).description}` : ''}`
                        : ((item as any)?.description || (item as any)?.name || String(item || '')));

                  return (
                    <div 
                      key={idx} 
                      className="flex items-center gap-4 bg-white border border-brand-beige/60 p-4 rounded-2xl shadow-sm hover:shadow transition-all duration-250"
                    >
                      <div className="w-8 h-8 rounded-full bg-[#2E6F40] text-white flex items-center justify-center shrink-0 shadow-sm shadow-[#2E6F40]/15">
                        <Check size={14} className="stroke-[3]" />
                      </div>
                      <span className="font-extrabold text-brand-primary text-xs md:text-sm tracking-tight text-left">
                        {displayText}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Testimoni Penghuni (Hanya tampil jika ada testimoni nyata) */}
          {testimonials.length > 0 && testimonials[activeTestimonialIdx] && (
            <div className="bg-[#F8F9FA] py-16 border-y border-brand-beige">
              <div className="max-w-6xl mx-auto px-4 space-y-10">
                <div className="text-center space-y-3">
                  <span className="text-[10px] font-extrabold text-brand-primary tracking-widest uppercase font-mono bg-brand-beige/35 px-2.5 py-1 rounded-md border border-brand-beige/70">
                    {lang === 'id' ? 'Testimoni Penghuni' : 'Tenant Testimonials'}
                  </span>
                  <h2 className="text-2xl font-black text-brand-primary">
                    {lang === 'id' ? 'Dipercaya Oleh Penghuni Aktif' : 'Trusted by Active Tenants'}
                  </h2>
                  <p className="text-brand-steel text-xs max-w-lg mx-auto font-light">
                    {lang === 'id' ? 'Simak ulasan tulus dari rekan mahasiswa dan pekerja muda yang telah menetap nyaman bersama kami.' : 'Read honest reviews from students and young working professionals who live comfortably with us.'}
                  </p>
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
                        <div className={`w-10 h-10 rounded-full ${testimonials[activeTestimonialIdx].bgClass || 'bg-brand-primary'} text-white flex items-center justify-center font-extrabold font-mono text-xs shadow-md`}>
                          {testimonials[activeTestimonialIdx].initials || testimonials[activeTestimonialIdx].name?.slice(0, 2).toUpperCase()}
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
                      title={lang === 'id' ? 'Sebelumnya' : 'Previous'}
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
                      title={lang === 'id' ? 'Selanjutnya' : 'Next'}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Pertanyaan yang Sering Diajukan (FAQ) */}
          <div id="faq-section" className="max-w-4xl mx-auto px-4 py-16 space-y-8">
            <div className="text-center space-y-3">
              <h2 className="text-3xl font-black text-brand-primary font-display tracking-tight">
                {lang === 'id' ? 'Pertanyaan yang Sering Diajukan' : 'Frequently Asked Questions'}
              </h2>
              <p className="text-brand-steel text-sm font-light">
                {lang === 'id' ? 'Temukan jawaban untuk pertanyaan umum tentang Samara Stay' : 'Find answers to common questions about Samara Stay'}
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

          {/* Kontak Kami Section */}
          {(() => {
            const selectedProp = selectedContactPropertyId === 'all'
              ? null
              : properties.find(p => p.id === selectedContactPropertyId);

            const waNumRaw = selectedProp 
              ? `628128888${(selectedProp.id * 1111).toString().padStart(4, '0').slice(-4)}`
              : "6281234567890";

            const waNumFormatted = selectedProp
              ? `+62 812-8888-${(selectedProp.id * 1111).toString().padStart(4, '0').slice(-4)}`
              : "+62 812-3456-7890";

            const emailAddr = selectedProp
              ? `admin.${selectedProp.name.toLowerCase().replace(/[^a-z0-9]/g, '')}@samarastay.com`
              : "info@samarastay.com";

            const locationTitle = selectedProp
              ? selectedProp.name
              : "Kantor Pusat Samara Stay";

            const locationDesc = selectedProp
              ? selectedProp.address
              : "Cempaka Putih Barat, Jakarta Pusat";

            return (
              <div id="kontak-section" className="max-w-6xl mx-auto px-4 py-16 space-y-10">
                <div className="text-center space-y-3">
                  <span className="text-[10px] font-extrabold text-[#2E6F40] tracking-widest uppercase font-mono bg-[#EEF7F0] px-3 py-1 rounded-md border border-[#2E6F40]/25">
                    {lang === 'id' ? 'Hubungi Kami' : 'Contact Us'}
                  </span>
                  <h2 className="text-3xl font-black text-brand-primary font-display tracking-tight leading-tight">
                    {lang === 'id' ? 'Ada Pertanyaan? Hubungi Kontak Kami' : 'Have Questions? Contact Our Support'}
                  </h2>
                  <p className="text-[#64748B] text-sm max-w-lg mx-auto font-light leading-relaxed">
                    {lang === 'id' 
                      ? 'Tim support kami siap membantu menjawab pertanyaan Anda atau menjadwalkan kunjungan langsung ke lokasi.'
                      : 'Our support team is ready to answer your inquiries or schedule an in-person site visit.'}
                  </p>

                  {/* Select Dropdown untuk memilih cabang gedung kost */}
                  <div className="max-w-md mx-auto pt-4 text-left">
                    <label className="block text-xs font-bold text-[#3A444D] uppercase tracking-wider font-mono mb-2 text-center">
                      {lang === 'id' ? 'Pilih Gedung Kost / Cabang Admin:' : 'Select Property Branch Admin:'}
                    </label>
                    <div className="relative">
                      <select
                        value={selectedContactPropertyId}
                        onChange={(e) => setSelectedContactPropertyId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                        className="w-full bg-white border-2 border-[#2E6F40] rounded-2xl px-4 py-3 text-sm font-extrabold text-[#3A444D] shadow-md focus:outline-none focus:ring-2 focus:ring-[#2E6F40] cursor-pointer transition-all appearance-none pr-10"
                      >
                        <option value="all">🏢 {lang === 'id' ? 'Semua Kost / Kontak Admin  Platform' : 'All Branches / Samara Stay HQ'}</option>
                        {properties.map((p) => (
                          <option key={p.id} value={p.id}>
                            📍 {p.name} ({p.address.split(',')[0]})
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-[#2E6F40]">
                        <ChevronDown size={18} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Card 1: WhatsApp Admin */}
                  <div className="bg-white border border-[#E2E8F0] p-6 rounded-3xl text-left space-y-4 hover:border-[#2E6F40] transition-all shadow-sm min-w-0 overflow-hidden">
                    <div className="w-12 h-12 rounded-full bg-[#E8F5E9] flex items-center justify-center text-[#2E6F40] shrink-0">
                      <MessageSquare size={22} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-extrabold text-[#3A444D] text-sm uppercase tracking-wider">
                          WhatsApp Admin
                        </h4>
                        {selectedProp && (
                          <span className="text-[9px] font-bold font-mono bg-[#EEF7F0] text-[#2E6F40] px-2 py-0.5 rounded-full shrink-0">
                            {selectedProp.name.split(' ')[0]}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#64748B] font-medium mt-1 break-words">
                        {selectedProp ? `Admin WhatsApp untuk ${selectedProp.name}` : 'Layanan respon cepat untuk reservasi & pertanyaan langsung.'}
                      </p>
                      <p className="text-sm font-black font-mono text-[#2E6F40] mt-2 tabular-nums break-words">
                        {waNumFormatted}
                      </p>
                    </div>
                    <a 
                      href={`https://wa.me/${waNumRaw}?text=Halo%20Admin%20${encodeURIComponent(selectedProp ? selectedProp.name : 'Samara Stay')},%20saya%20ingin%20bertanya%20mengenai%20sewa%20kost`} 
                      target="_blank" 
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-black text-[#2E6F40] hover:text-[#235531]"
                    >
                      Hubungi WhatsApp Admin →
                    </a>
                  </div>

                  {/* Card 2: Email Admin */}
                  <div className="bg-white border border-[#E2E8F0] p-6 rounded-3xl text-left space-y-4 hover:border-[#2E6F40] transition-all shadow-sm min-w-0 overflow-hidden">
                    <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                      <Mail size={22} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-extrabold text-[#3A444D] text-sm uppercase tracking-wider">
                          Email Admin
                        </h4>
                        {selectedProp && (
                          <span className="text-[9px] font-bold font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full shrink-0">
                            {selectedProp.name.split(' ')[0]}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#64748B] font-medium mt-1 break-words">
                        {selectedProp ? `Email resmi admin ${selectedProp.name}` : 'Kirimkan penawaran kerjasama, pertanyaan bisnis, atau komplain.'}
                      </p>
                      <p className="text-xs font-bold font-mono text-[#3A444D] mt-2 break-all">
                        {emailAddr}
                      </p>
                    </div>
                    <a 
                      href={`mailto:${emailAddr}?subject=Tanya%20Sewa%20${encodeURIComponent(selectedProp ? selectedProp.name : 'Samara Stay')}`} 
                      className="inline-flex items-center gap-1.5 text-xs font-black text-[#2E6F40] hover:text-[#235531]"
                    >
                      Kirim Email Admin →
                    </a>
                  </div>

                  {/* Card 3: Lokasi Gedung / Kantor */}
                  <div className="bg-white border border-[#E2E8F0] p-6 rounded-3xl text-left space-y-4 hover:border-[#2E6F40] transition-all shadow-sm min-w-0 overflow-hidden">
                    <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
                      <MapPin size={22} />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-extrabold text-[#3A444D] text-sm uppercase tracking-wider">
                        {selectedProp ? 'Lokasi Gedung' : 'Kantor Pusat'}
                      </h4>
                      <p className="text-[11px] text-[#64748B] font-medium mt-1 break-words">
                        {locationTitle}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-[#3A444D] block leading-relaxed break-words">
                      📍 {locationDesc}
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}

        </div>
      )}

      {/* ========================================================== */}
      {/* VIEW 2: SEARCH & FILTER CATALOG (SPLIT SCREEN LAYOUT) */}
      {/* ========================================================== */}
      {userPage === 'search' && (
        <div className="max-w-7xl mx-auto px-4 md:px-8 mt-6 space-y-6 animate-fade-in text-brand-primary">
          
          {/* Header & Premium Filter Bar */}
          <PremiumSearchFilter 
            searchLocation={searchLocation}
            setSearchLocation={setSearchLocation}
            selectedType={selectedType}
            setSelectedType={setSelectedType}
            searchDurationType={searchDurationType}
            setSearchDurationType={setSearchDurationType}
            searchMode={searchMode}
            setSearchMode={setSearchMode}
            selectedFacilities={selectedRoomFacilities}
            setSelectedFacilities={setSelectedRoomFacilities}
            masterFacilities={standardFacilities}
            priceRange={priceRange}
            setPriceRange={setPriceRange}
            onlyAvailable={onlyAvailable}
            setOnlyAvailable={setOnlyAvailable}
            resultsCount={searchMode === 'building' ? filteredProperties.length : filteredRooms.length}
            onClearFilters={() => {
              setSearchLocation('');
              setSelectedType('all');
              setSearchDurationType('monthly');
              setSelectedRoomFacilities([]);
              setPriceRange(5000000);
              setOnlyAvailable(false);
            }}
          />

          {/* Catalog Split-Screen Container Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[500px]">
            
            {/* Sisi Kiri: Daftar Card Gedung Kosan atau Kamar Langsung (col-span-7) */}
            <div className="lg:col-span-7 space-y-5 max-h-[70vh] overflow-y-auto pr-3 pl-3 py-3 bg-slate-100 border border-slate-200 rounded-3xl shadow-inner shadow-slate-100 text-left">
              {searchMode === 'building' ? (
                filteredProperties.length > 0 ? (
                  filteredProperties.map(p => {
                    const pRooms = rooms.filter(r => r.property_id === p.id);
                    const availableCount = pRooms.filter(r => isRoomAvailable(r)).length;
                    return (
                      <div
                        key={p.id}
                        onMouseEnter={() => setHoveredPropertyId(p.id)}
                        onMouseLeave={() => setHoveredPropertyId(null)}
                        className={`bg-white border rounded-2xl overflow-hidden flex flex-col sm:flex-row group transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5 ${hoveredPropertyId === p.id ? 'border-[#2E6F40] bg-slate-50/50' : 'border-[#E2E8F0]'}`}
                      >
                        {/* Left Thumbnail */}
                        <div className="w-full sm:w-52 h-44 bg-slate-900 shrink-0 relative overflow-hidden">
                          <img 
                            src={p.image_url || "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=400&q=80"} 
                            alt={p.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                            <span className={`px-2.5 py-1 rounded-md text-[8px] font-black uppercase font-mono tracking-wider shadow-sm ${
                              p.type === 'putri' 
                                ? 'bg-pink-600 text-white border border-pink-500/30' 
                                : p.type === 'putra' 
                                  ? 'bg-blue-600 text-white border border-blue-500/30' 
                                  : 'bg-amber-600 text-white border border-amber-500/30'
                            }`}>
                              KOS {p.type.toUpperCase()}
                            </span>
                          </div>
                        </div>

                        {/* Right Details */}
                        <div className="p-4 flex-1 flex flex-col justify-between space-y-3 min-w-0">
                          <div className="space-y-1">
                            <div className="flex justify-between items-start gap-2">
                              <h3 className="font-extrabold text-[#3A444D] text-sm group-hover:text-[#2E6F40] transition-colors truncate">{p.name}</h3>
                              <span className={`text-[8px] font-extrabold font-mono px-2 py-0.5 rounded-full uppercase border shrink-0 ${
                                availableCount > 0 
                                  ? 'text-emerald-700 bg-emerald-50 border-emerald-100' 
                                  : 'text-rose-700 bg-rose-50 border-rose-100'
                              }`}>
                                {availableCount} Unit Kosong
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-1.5 text-[#64748B] text-[11px] font-medium leading-none">
                              <MapPin size={12} className="text-[#2E6F40] shrink-0" />
                              <span className="truncate">{p.address}</span>
                            </div>

                            <p className="text-[10px] text-[#64748B] font-medium flex items-center gap-1 mt-1 leading-none">
                              <Compass size={11} className="text-[#2E6F40]" />
                              <span>Fasilitas Publik: <strong>500m ke Kampus / Stasiun</strong></span>
                            </p>
                          </div>

                          {/* Badges */}
                          <div className="flex flex-wrap gap-1">
                            {normalizeFacilityList(p.facilities, DEFAULT_FACILITIES.slice(0, 4)).slice(0, 3).map((f: any, idx) => (
                              <span key={f.id || idx} className="text-[9px] bg-slate-50 border border-[#E2E8F0] text-[#475569] font-bold px-2 py-0.5 rounded-md capitalize">
                                {typeof f === 'string' ? f : (f.name || f.title)}
                              </span>
                            ))}
                          </div>

                          {/* Footer details & Action */}
                          <div className="border-t border-[#F1F5F9] pt-2.5 flex items-center justify-between text-xs">
                            <div>
                              <span className="text-[8px] text-[#64748B] block uppercase font-mono font-extrabold leading-none mb-0.5">Mulai Dari</span>
                              <span className="font-black text-[#1E293B] font-mono text-xs">{formatRupiah(p.price)}<span className="text-[9px] text-[#64748B] font-sans font-medium"> / bln</span></span>
                            </div>

                            <button
                              onClick={() => {
                                openPropertyDetail(p);
                              }}
                              className="bg-[#2E6F40] hover:bg-[#1f4b2b] text-white font-extrabold py-2 px-3 rounded-xl text-[10px] transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                            >
                              <span>Lihat Unit</span>
                              <ChevronRight size={11} />
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
                <div className="space-y-4">
                  {/* Quick Room Category Filter Bar */}
                  <div className="flex flex-wrap items-center gap-1.5 bg-white border border-[#E2E8F0] p-2.5 rounded-2xl shadow-2xs">
                    <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider font-mono px-2">Kategori Kamar:</span>
                    {(['all', 'Standard', 'Deluxe', 'Premium', 'Premium Plus'] as const).map((cat) => {
                      const isActive = searchRoomType === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setSearchRoomType(cat)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5 ${
                            isActive
                              ? cat === 'Premium Plus'
                                ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 border-amber-400 shadow-xs'
                                : 'bg-[#2E6F40] text-white border-[#2E6F40] shadow-xs'
                              : 'bg-[#F8FAFC] text-[#475569] border-[#E2E8F0] hover:border-[#2E6F40] hover:text-[#2E6F40]'
                          }`}
                        >
                          {cat === 'Premium Plus' && <Sparkles size={11} className={isActive ? 'text-slate-950' : 'text-amber-500'} />}
                          <span>{cat === 'all' ? 'Semua Kategori' : cat}</span>
                        </button>
                      );
                    })}
                  </div>

                  {filteredRooms.length > 0 ? (
                    filteredRooms.map(r => {
                      const p = properties.find(prop => prop.id === r.property_id);
                      if (!p) return null;
                      return (
                        <div 
                          key={r.id} 
                          className="bg-white border border-[#E2E8F0] hover:border-[#2E6F40] rounded-2xl p-4 flex flex-col sm:flex-row gap-4 hover:shadow-md transition-all duration-300 group shadow-sm text-left"
                        >
                          {/* Room image or fallback */}
                          <div className="w-full sm:w-40 h-32 bg-slate-900 shrink-0 rounded-xl relative overflow-hidden">
                            <img 
                              src={r.image_url || p.image_url || "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=400&q=80"} 
                              alt={`Kamar ${r.room_number}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-all duration-500"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute top-2.5 left-2.5">
                              {(() => {
                                const isAvail = isRoomAvailable(r);
                                return (
                                  <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase font-mono border shadow-sm ${
                                    isAvail 
                                      ? 'bg-emerald-600 text-white border-emerald-700' 
                                      : r.status === 'reserved'
                                        ? 'bg-amber-600 text-white border-amber-700'
                                        : r.status === 'occupied' 
                                          ? 'bg-slate-700 text-white border-slate-800' 
                                          : 'bg-rose-600 text-white border-rose-700'
                                  }`}>
                                    {isAvail ? 'KOSONG' : r.status === 'reserved' ? 'DIRESERVASI' : r.status === 'occupied' ? 'TERISI' : 'PERBAIKAN'}
                                  </span>
                                );
                              })()}
                            </div>
                          </div>

                          {/* Room Details */}
                          <div className="flex-1 flex flex-col justify-between space-y-2 min-w-0">
                            <div className="space-y-1">
                              <div className="flex justify-between items-start gap-2">
                                <div className="truncate flex items-center gap-1.5 flex-wrap">
                                  <span className={`text-[8px] font-mono font-extrabold uppercase px-2 py-0.5 rounded-md border ${
                                    r.room_type === 'Premium Plus'
                                      ? 'bg-gradient-to-r from-amber-500/20 to-yellow-500/20 text-amber-800 border-amber-400'
                                      : r.room_type === 'Premium'
                                        ? 'text-teal-700 bg-teal-50 border-teal-200'
                                        : 'text-[#2E6F40] bg-[#2E6F40]/10 border-[#2E6F40]/20'
                                  }`}>{r.room_type || 'Standard'}</span>
                                  {(r.is_airbnb_enabled || r.airbnb_url || p.is_airbnb_enabled || p.airbnb_url) && (
                                    <span className="text-[8px] font-mono font-extrabold uppercase px-2 py-0.5 rounded-md border bg-[#FFF8F9] text-[#FF385C] border-[#FF385C]/30">
                                      Airbnb
                                    </span>
                                  )}
                                  <h3 className="font-extrabold text-[#3A444D] text-sm font-sans inline-block">Kamar No. {r.room_number}</h3>
                                </div>
                              <span className="text-[9px] font-mono text-[#64748B] bg-slate-50 border border-[#E2E8F0] px-2 py-0.5 rounded-full uppercase shrink-0">Lantai {r.floor} ({r.size_sqm} m²)</span>
                            </div>
                            
                            <p className="text-[11px] font-bold text-[#3A444D] flex items-center gap-1 leading-none mt-1">
                              <Building2 size={12} className="text-[#2E6F40] shrink-0" />
                              <span className="truncate">{p.name}</span>
                            </p>
                            <p className="text-[10px] text-[#64748B] font-medium flex items-center gap-1">
                              <MapPin size={11} className="text-[#2E6F40] shrink-0" />
                              <span className="truncate">{p.address}</span>
                            </p>
                          </div>

                          {/* Facilities */}
                          <div className="flex flex-wrap gap-1">
                            {normalizeFacilityList(r.facilities, DEFAULT_FACILITIES.slice(0, 4)).slice(0, 4).map((f: any, idx) => (
                              <span key={f.id || idx} className="text-[8px] bg-slate-50 border border-[#E2E8F0] text-[#475569] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider">
                                {typeof f === 'string' ? f : (f.name || f.title)}
                              </span>
                            ))}
                          </div>

                          {/* Footer / Action */}
                          <div className="border-t border-[#F1F5F9] pt-2 flex flex-wrap items-center justify-between text-xs gap-3">
                            <div>
                              <span className="text-[8px] text-[#64748B] block uppercase font-mono font-bold leading-none mb-0.5">Biaya Sewa</span>
                              <span className="font-black text-[#1E293B] font-mono text-xs">{formatRupiah(r.price)}<span className="text-[9px] text-[#64748B] font-sans font-medium">/bln</span></span>
                            </div>

                            <div className="flex flex-wrap gap-1.5 shrink-0 items-center">
                              {(r.is_airbnb_enabled || r.airbnb_url || p.is_airbnb_enabled || p.airbnb_url) && (
                                <a
                                  href={r.airbnb_url || p.airbnb_url || 'https://www.airbnb.co.id/users/profile/1469644070216777538?previous_page_name=PdpHomeMarketplace'}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="border border-[#FF385C]/35 bg-[#FFF8F9] hover:bg-[#FF385C] text-[#FF385C] hover:text-white font-black py-1.5 px-2.5 rounded-xl text-[10px] transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                                >
                                  <span>Airbnb</span>
                                  <ExternalLink size={10} />
                                </a>
                              )}
                              {isRoomAvailable(r) && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedRoomForDetail(r)}
                                  className="border border-[#2E6F40] bg-emerald-50/25 hover:bg-[#2E6F40] hover:text-white text-[#2E6F40] font-black py-1.5 px-2.5 rounded-xl text-[10px] transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                                >
                                  <Info size={11} />
                                  <span>Detail Kamar</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  openPropertyDetail(p);
                                }}
                                className="border border-[#E2E8F0] hover:border-[#64748B] text-[#475569] font-bold py-1.5 px-3 rounded-xl text-[10px] transition-all cursor-pointer"
                              >
                                Detail Kos
                              </button>
                              <button
                                type="button"
                                disabled={!isRoomAvailable(r)}
                                onClick={() => {
                                  setActiveProperty(p);
                                  setActiveRoom(r);
                                  setCheckoutFlow('monthly');
                                }}
                                className={`font-extrabold py-1.5 px-3 rounded-xl text-[10px] transition-all cursor-pointer flex items-center gap-1 shadow-sm ${
                                  isRoomAvailable(r)
                                    ? 'bg-[#2E6F40] hover:bg-[#1f4b2b] text-white' 
                                    : 'bg-slate-100 text-[#64748B] border border-slate-200 cursor-not-allowed shadow-none'
                                }`}
                              >
                                {isRoomAvailable(r) ? 'Pesan Sekarang' : r.status === 'reserved' ? 'Sedang Dipesan' : 'Sudah Terisi'}
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
                  )}
                </div>
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
                            className="text-[#64748B] hover:text-white shrink-0 cursor-pointer"
                          >
                            <X size={12} />
                          </button>
                        </div>
                        <p className="text-[10px] text-[#64748B] truncate mt-0.5">{selectedMapProperty.address}</p>
                      </div>
                      
                      <div className="flex justify-between items-center pt-1 gap-2">
                        <span className="font-bold text-[#2E6F40] font-mono text-[11px] whitespace-nowrap">{formatRupiah(selectedMapProperty.price)}<span className="text-[11px] text-[#64748B] font-sans font-light">/bln</span></span>
                        <div className="flex gap-1.5 items-center">
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${selectedMapProperty.lat || -6.368},${selectedMapProperty.lng || 106.83}`}
                            target="_blank"
                            rel="noreferrer"
                            className="bg-slate-800 text-slate-200 hover:bg-slate-700 px-2 py-1 rounded-md text-[9px] font-bold transition-colors flex items-center gap-1"
                          >
                            🗺️ GMaps
                          </a>
                          <button
                            onClick={() => {
                              openPropertyDetail(selectedMapProperty);
                            }}
                            className="bg-amber-500 text-black px-2.5 py-1 rounded-md text-[9px] font-black hover:bg-amber-600 cursor-pointer transition-colors"
                          >
                            Detail
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {/* Informational warning */}
              <div className="bg-[#09090b]/60 border border-slate-800/80 p-3 rounded-2xl flex gap-3 text-[#64748B] text-[10px] leading-relaxed font-normal">
                <InfoIcon size={14} className="text-[#2E6F40] shrink-0 mt-0.5" />
                <div>
                  Klik pin di peta untuk melihat properti secara visual. Pin diatur otomatis oleh sistem berdasarkan koordinat GPS yang dimasukkan oleh Super Admin di database.
                </div>
              </div>

            </div>

          </div>

        </div>
      )}

      {/* ========================================================== */}
      {/* VIEW 3: PROPERTY & CHAMBER DETAIL PAGE (PropertyDetailView) */}
      {/* ========================================================== */}
      {userPage === 'detail' && (
        <PropertyDetailView
          propertyParam={activeProperty ? getPropertySlug(activeProperty) : getUrlPropertyParameter()}
          property={activeProperty}
          properties={properties}
          rooms={rooms}
          activeRoom={activeRoom}
          standardFacilities={standardFacilities}
          uploadingImage={uploadingImage}
          onUploadDetailImage={handleUploadDetailImage}
          onBackToHome={() => {
            setSearchLocation('');
            setUserPage('home');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onOpenSearchCatalog={() => {
            setUserPage('search');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onOpenFullMap={() => {
            setUserPage('map');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onOpenRoomCatalogModal={() => setIsCatalogOpen(true)}
          onSelectProperty={(prop) => {
            setActiveProperty(prop);
            setSelectedMapProperty(prop);
          }}
          onSelectRoom={(room, flowType) => {
            if (!room) {
              setActiveRoom(null);
              return;
            }
            handleSelectRoom(room, flowType || (checkoutFlow === 'none' ? 'monthly' : checkoutFlow));
          }}
          onInspectRoomDetail={(room) => setSelectedRoomForDetail(room)}
          onZoomImage={(url) => setSelectedRoomImage(url)}
          onOpenVirtualTour={() => setVirtualTourOpen(true)}
        />
      )}

      {/* ========================================================== */}
      {/* VIEW 4: INTERACTIVE LEAFLET PROPERTY MAP & AMENITIES VIEW */}
      {/* ========================================================== */}
      {userPage === 'map' && (
        <div className="max-w-7xl mx-auto px-4 md:px-8 mt-6 space-y-6 animate-fade-in text-brand-primary">
          <PropertyMapView
            properties={properties}
            rooms={rooms}
            selectedPropertyId={activeProperty?.id || null}
            onSelectProperty={(prop) => {
              setActiveProperty(prop);
              setIsCatalogOpen(true);
            }}
            onViewPropertyDetail={(prop) => {
              setIsCatalogOpen(false);
              openPropertyDetail(prop);
            }}
            onScheduleSurvey={(prop) => {
              setActiveProperty(prop);
              const propRooms = rooms.filter(r => r.property_id === prop.id);
              if (propRooms.length > 0) {
                handleSelectRoom(propRooms[0], 'survey');
              } else {
                setIsCatalogOpen(true);
              }
            }}
            lang={lang}
          />
        </div>
      )}
      {/* ========================================================== */}

      {/* MODAL: DESKRIPSI & KETERSEDIAAN (DARI PETA & SEKITAR) ATAU KATALOG KAMAR */}
      <Modal
        isOpen={isCatalogOpen}
        onClose={() => setIsCatalogOpen(false)}
        title={userPage === 'map' ? "INFORMASI KOS & KETERSEDIAAN KAMAR" : "KATALOG KAMAR TERSEDIA"}
      >
        {activeProperty && userPage === 'map' && (() => {
          const pRooms = rooms.filter(r => r.property_id === activeProperty.id);
          const availableRooms = pRooms.filter(r => isRoomAvailable(r));
          const nameLower = (activeProperty.name || '').toLowerCase();
          const isTiaraCempaka = nameLower.includes('ciputra') || nameLower.includes('cempaka') || nameLower.includes('tiara');
          const isAtikah = !isTiaraCempaka && (nameLower.includes('atikah') || nameLower.includes('atika') || nameLower.includes('kemayoran') || nameLower.includes('putri') || activeProperty.id === 2);

          const detailedDesc = (activeProperty.description && activeProperty.description.trim() && activeProperty.description !== '(test)')
            ? activeProperty.description
            : (isAtikah
                ? (lang === 'id'
                    ? "Terletak sangat strategis di pusat kota Kemayoran, menghadirkan konsep hunian kos modern serta opsi sewa kamar harian fully furnished yang nyaman, tenang, dan praktis."
                    : "Strategically located in the city center, offering modern boarding concepts and fully furnished daily room rentals that are comfortable, quiet, and convenient.")
                : (lang === 'id'
                    ? "Terletak di kawasan Kemayoran yang strategis dan tenang, menawarkan pengalaman tinggal premium dengan fasilitas lengkap dan aman."
                    : "Located in a serene residential area in Kemayoran, offering a premium living experience with complete amenities."));

          return (
            <div className="space-y-5 text-left max-h-[78vh] overflow-y-auto pr-1">
              {/* Switcher Antar Kos */}
              <div className="flex flex-wrap items-center gap-1.5 pb-3 border-b border-[#E2E8F0]">
                {properties.map(p => {
                  const isCurr = p.id === activeProperty.id;
                  const countAvail = rooms.filter(r => r.property_id === p.id && isRoomAvailable(r)).length;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setActiveProperty(p)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                        isCurr
                          ? 'bg-[#1D603A] text-white border-[#1D603A] shadow-xs'
                          : 'bg-[#F8FAFC] text-[#3A444D] border-[#E2E8F0] hover:border-[#1D603A]'
                      }`}
                    >
                      <span>{getPropertyCategoryLabel(p.name)}</span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                        isCurr ? 'bg-black/25 text-white' : 'bg-emerald-50 text-[#1D603A]'
                      }`}>
                        {countAvail} Kosong
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Tampilan Deskripsi Seperti Tampilan Depan */}
              <div className="bg-white border border-brand-beige rounded-[24px] overflow-hidden shadow-sm flex flex-col text-left">
                <div className="relative h-[220px] sm:h-[260px] bg-slate-100 overflow-hidden select-none">
                  <img
                    src={activeProperty.image_url || "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=600&q=80"}
                    alt={activeProperty.name}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute top-4 left-4">
                    <span className="px-3.5 py-1 rounded-md text-[10px] font-extrabold font-mono bg-white/95 text-[#1D603A] uppercase tracking-wider shadow-sm">
                      {getPropertyCategoryLabel(activeProperty.name)}
                    </span>
                  </div>
                  <div className="absolute top-4 right-4">
                    <span className="px-4 py-1 rounded-md text-[10px] font-bold text-white uppercase tracking-wider bg-[#1D603A]">
                      {availableRooms.length > 0
                        ? (lang === 'id' ? `${availableRooms.length} Kamar Tersedia` : `${availableRooms.length} Rooms Available`)
                        : (lang === 'id' ? 'Penuh' : 'Full')}
                    </span>
                  </div>
                </div>

                <div className="p-5 sm:p-6 space-y-5 text-left">
                  <div className="space-y-3">
                    <h3 className="font-extrabold text-brand-primary text-xl sm:text-2xl tracking-tight">
                      {activeProperty.name}
                    </h3>

                    <div className="flex items-start gap-1.5 text-brand-steel text-xs">
                      <MapPin size={15} className="text-brand-taupe shrink-0 mt-0.5" />
                      <span className="font-medium text-[#64748B] leading-relaxed">{activeProperty.address}</span>
                    </div>

                    <p className="text-brand-steel text-xs sm:text-sm font-light leading-relaxed">
                      {detailedDesc}
                    </p>
                  </div>

                  {/* Ringkasan & Status Ketersediaan Kamar */}
                  <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-4 bg-[#1D603A] rounded-full" />
                        <h4 className="text-xs sm:text-sm font-extrabold text-[#1E293B] uppercase tracking-tight">
                          Ketersediaan Kamar ({getPropertyCategoryLabel(activeProperty.name)})
                        </h4>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold">
                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-lg">
                          {availableRooms.length} Unit Tersedia
                        </span>
                        <span className="bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-1 rounded-lg">
                          {pRooms.length} Total Kamar
                        </span>
                      </div>
                    </div>

                    {pRooms.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                        {pRooms.map(r => {
                          const isAvail = isRoomAvailable(r);
                          return (
                            <div
                              key={r.id}
                              className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${
                                isAvail
                                  ? 'bg-white border-emerald-200/80'
                                  : 'bg-slate-50 border-slate-200/70 opacity-70'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-extrabold text-xs text-[#1E293B]">
                                    Unit {r.room_number}
                                  </span>
                                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 border border-amber-500/20">
                                    {r.room_type || 'Standard'}
                                  </span>
                                </div>
                                <span className="text-[10px] text-[#64748B] font-mono block mt-0.5">
                                  Lantai {r.floor} • {formatRupiah(r.price)}/bln
                                </span>
                              </div>
                              <span
                                className={`px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase font-mono shrink-0 border ${
                                  isAvail
                                    ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/25'
                                    : r.status === 'reserved'
                                      ? 'bg-amber-500/10 text-amber-700 border-amber-500/25'
                                      : 'bg-slate-100 text-slate-500 border-slate-200'
                                }`}
                              >
                                {isAvail ? 'Tersedia' : r.status === 'reserved' ? 'Direservasi' : 'Terisi'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-[#64748B] font-mono py-3 text-center">
                        Belum ada data unit kamar untuk kos ini.
                      </p>
                    )}
                  </div>

                  {/* Footer Card: Rating, Kategori, Harga Mulai & Button Selengkapnya */}
                  <div className="space-y-4 pt-4 border-t border-brand-beige/60">
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2.5 text-brand-steel">
                        <span className="flex items-center gap-1 font-bold text-brand-primary">
                          <Star size={14} className="text-[#0D9488] fill-amber-500" />
                          4.9
                        </span>
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-beige" />
                        <span className="text-[10px] font-extrabold font-mono uppercase bg-emerald-50 text-emerald-800 border border-emerald-200/80 px-2.5 py-0.5 rounded-md">
                          {getPropertyCategoryLabel(activeProperty.name)}
                        </span>
                      </div>

                      <div className="flex items-baseline gap-1">
                        <span className="text-brand-steel text-[10px] font-medium uppercase font-mono tracking-wider">
                          {lang === 'id' ? 'Mulai Rp' : 'From IDR'}
                        </span>
                        <span className="text-base font-extrabold text-brand-primary tabular-nums">
                          {formatRupiah(activeProperty.price).replace("Rp", "").trim()}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsCatalogOpen(false);
                          openPropertyDetail(activeProperty);
                        }}
                        className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full font-bold text-xs bg-[#205D41] hover:bg-[#164731] text-white cursor-pointer transition-all shadow-sm"
                      >
                        <span>{lang === 'id' ? 'Selengkapnya' : 'More Details'}</span>
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {activeProperty && userPage !== 'map' && (
          <div className="space-y-5 text-left max-h-[75vh] overflow-y-auto pr-1">
            <div className="flex justify-between items-center border-b border-[#F1F5F9] pb-3">
              <div>
                <h3 className="text-sm font-black text-[#3A444D] uppercase tracking-tight flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-[#0D9488] rounded-full"></span>
                  Daftar Tipe Kamar & Unit
                </h3>
                <p className="text-[11px] text-[#64748B] font-medium mt-0.5">Pilih kamar terbaik yang sesuai dengan budget dan kenyamanan Anda</p>
              </div>
              <span className="text-[11px] font-extrabold font-mono text-[#0D9488] bg-[#0D9488]/10 px-2.5 py-1 rounded-lg">
                {rooms.filter(r => r.property_id === activeProperty.id && isRoomAvailable(r)).length} UNIT KOSONG
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {rooms.filter(r => r.property_id === activeProperty.id).map(r => {
                const isAvailable = isRoomAvailable(r);
                const isSelected = activeRoom?.id === r.id;
                return (
                  <div
                    key={r.id}
                    onClick={() => {
                      if (isAvailable) {
                        setActiveRoom(r);
                        setCheckoutFlow('monthly');
                      }
                    }}
                    className={`p-4 rounded-2xl border text-left flex flex-col justify-between gap-4 transition-all duration-300 cursor-pointer ${
                      !isAvailable 
                        ? 'bg-[#F8FAFC]/50 border-[#F1F5F9] opacity-60' 
                        : isSelected
                          ? 'border-[#0D9488] bg-[#0D9488]/5 shadow-sm ring-1 ring-[#0D9488]/30 scale-[1.01]'
                          : 'border-[#E2E8F0] bg-white hover:border-[#0D9488] hover:bg-[#F8FAFC]/50'
                    }`}
                  >
                    <div className="space-y-3">
                      {/* Room Picture Area */}
                      {r.image_url ? (
                        <div className="w-full h-36 rounded-xl overflow-hidden bg-[#F8FAFC] border border-[#E2E8F0] relative group">
                          <img 
                            src={r.image_url} 
                            alt={`Kamar ${r.room_number}`} 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80';
                            }}
                          />
                          <div className="absolute top-2 left-2 bg-black/75 px-2 py-0.5 rounded text-[8px] font-bold text-white tracking-wide uppercase">
                            LANTAI {r.floor}
                          </div>
                          <div className="absolute bottom-2 right-2 bg-black/80 px-2.5 py-1 rounded-md text-[9px] font-semibold text-white">
                            {r.size_sqm} m²
                          </div>
                        </div>
                      ) : (
                        <div className="w-full h-36 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] shrink-0 flex flex-col items-center justify-center gap-1.5 text-[#64748B]">
                          <Bed size={22} className="text-[#64748B] animate-pulse" />
                          <span className="text-[9px] font-mono tracking-wider uppercase">Tidak ada foto</span>
                        </div>
                      )}

                      {/* Room Header Info */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-start">
                          <div className="font-extrabold text-[#3A444D] text-base font-display flex items-center gap-1.5 flex-wrap">
                            Unit {r.room_number}
                            <span className="text-[8px] font-extrabold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.2 rounded font-sans uppercase">
                              {r.room_type}
                            </span>
                            {(r.is_airbnb_enabled || r.airbnb_url || activeProperty.is_airbnb_enabled || activeProperty.airbnb_url) && (
                              <span className="text-[8px] font-extrabold text-[#FF385C] bg-[#FFF8F9] border border-[#FF385C]/30 px-2 py-0.2 rounded font-mono uppercase">
                                Airbnb
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            {isAvailable && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRoomForDetail(r);
                                }}
                                className="px-2 py-0.5 rounded-md text-[8px] font-extrabold bg-[#2E6F40]/10 hover:bg-[#2E6F40]/25 border border-[#2E6F40]/30 text-[#2E6F40] transition-all uppercase tracking-wide flex items-center gap-0.5 cursor-pointer"
                              >
                                <Info size={10} />
                                Detail
                              </button>
                            )}
                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-extrabold uppercase font-mono border ${
                              isAvailable 
                                ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' 
                                : r.status === 'reserved'
                                  ? 'bg-amber-500/10 text-amber-700 border-amber-500/20'
                                  : 'bg-slate-100 text-[#64748B] border-slate-200'
                            }`}>
                              {isAvailable ? 'Tersedia' : r.status === 'reserved' ? 'Direservasi' : 'Terisi'}
                            </span>
                          </div>
                        </div>

                        {/* Facilities small preview */}
                        <div className="flex flex-wrap gap-1">
                          {(r.facilities || []).map((f: any, idx) => (
                            <span key={f.id || idx} className="text-[10px] bg-[#F8FAFC] border border-[#E2E8F0] text-[#64748B] px-2 py-0.5 rounded-lg">
                              {f.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Price sheet and transaction CTAs */}
                    <div className="border-t border-[#E2E8F0] pt-3 space-y-2.5">
                      <div className="bg-[#F8FAFC] p-2.5 rounded-xl border border-[#E2E8F0] text-center">
                        <span className="text-[8px] text-[#64748B] uppercase block font-mono">Sewa Bulanan</span>
                        <span className="font-black text-[#0D9488] text-sm font-mono">{formatRupiah(r.price)} <span className="text-[9px] text-[#64748B] font-normal">/ bulan</span></span>
                      </div>

                      {isAvailable ? (
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectRoom(r, 'survey');
                              setIsCatalogOpen(false);
                            }}
                            className="w-full bg-white border border-[#E2E8F0] hover:bg-[#F8FAFC] text-[#3A444D] py-2 rounded-xl text-xs font-bold transition-all text-center uppercase cursor-pointer"
                          >
                            Survey Hunian
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectRoom(r, 'monthly');
                              setIsCatalogOpen(false);
                            }}
                            className="w-full bg-[#0D9488] hover:bg-[#115E59] text-white py-2.5 rounded-xl text-xs font-bold transition-all text-center uppercase cursor-pointer shadow-xs"
                          >
                            Pesan Kamar
                          </button>
                        </div>
                      ) : (
                        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl py-2 text-center text-[#64748B] font-extrabold text-xs uppercase font-sans">
                          {r.status === 'reserved' ? 'Unit Sedang Dalam Pembayaran' : 'Unit Sudah Terisi Penghuni'}
                        </div>
                      )}

                      {(r.is_airbnb_enabled || r.airbnb_url || activeProperty.is_airbnb_enabled || activeProperty.airbnb_url) && (
                        <a
                          href={r.airbnb_url || activeProperty.airbnb_url || 'https://www.airbnb.co.id/users/profile/1469644070216777538?previous_page_name=PdpHomeMarketplace'}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="w-full bg-[#FFF8F9] hover:bg-[#FF385C] text-[#FF385C] hover:text-white border border-[#FF385C]/30 hover:border-[#FF385C] py-2 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 uppercase cursor-pointer"
                        >
                          <span>Pesan via Airbnb</span>
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}

              {rooms.filter(r => r.property_id === activeProperty.id).length === 0 && (
                <p className="text-[10px] text-[#64748B] py-12 text-center font-mono col-span-2">Properti ini tidak memiliki unit kamar terdaftar.</p>
              )}
            </div>
          </div>
        )}
      </Modal>

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
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div>
                <span className="text-[9px] font-bold text-[#64748B] font-mono uppercase">Jenis Sewa Dipilih</span>
                <div className="flex gap-1.5 mt-0.5">
                  <button 
                    type="button" 
                    onClick={() => setCheckoutFlow('monthly')}
                    className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wide cursor-pointer transition-all ${
                      checkoutFlow === 'monthly' ? 'bg-[#2E6F40] text-white shadow-xs' : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
                    }`}
                  >
                    Bulanan
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setCheckoutFlow('survey')}
                    className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wide cursor-pointer transition-all ${
                      checkoutFlow === 'survey' ? 'bg-[#2E6F40] text-white shadow-xs' : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
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
              surveys={surveys}
              surveyForm={surveyForm}
              setSurveyForm={setSurveyForm}
              bookingForm={bookingForm}
              setBookingForm={setBookingForm}
              isAgreed={isAgreed}
              setIsAgreed={setIsAgreed}
              signatureUrl={signatureUrl}
              setSignatureUrl={setSignatureUrl}
              onProceedToPayment={handleProceedToPayment}
              isSubmitting={isSubmittingPayment || loading}
            />
          </div>
        )}
      </Modal>

      {/* Printable Receipt Invoice Popup modal (PRESERVING EXISTING FLOW) */}
      <Modal
        isOpen={showReceipt}
        onClose={handleCloseReceiptAndReset}
        title="BUKTI TRANSAKSI SETELMEN"
      >
        {receiptData && (
          <InvoiceCard 
            receipt={receiptData}
            onClose={handleCloseReceiptAndReset}
          />
        )}
      </Modal>

      {/* Immersive 360° Virtual Tour Panoramic Modal popup */}
      {virtualTourOpen && (
        <div className="fixed inset-0 bg-black/95 z-[150] flex flex-col justify-between p-4 md:p-6" id="immersive-360-tour-viewer">
          
          {/* Header */}
          <div className="flex justify-between items-center border-b border-[#F1F5F9] pb-3">
            <div>
              <span className="text-[10px] text-[#0D9488] font-mono font-bold tracking-widest uppercase block">SAMARA STAY VISUAL LABS</span>
              <h3 className="font-extrabold text-white text-sm uppercase">Simulasi Virtual Tour Kamar Eksklusif</h3>
            </div>
            <button
              onClick={() => setVirtualTourOpen(false)}
              className="text-[#64748B] hover:text-white p-1.5 rounded-lg border border-slate-800 bg-slate-900 cursor-pointer"
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
              <div className="font-bold text-[#0D9488] flex items-center gap-1.5">
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
            <div className="pointer-events-none absolute inset-x-0 bottom-4 text-center select-none text-[10px] text-[#3A444D] font-bold uppercase font-mono tracking-widest bg-black/50 py-1.5 px-4 rounded-full max-w-sm mx-auto border border-white/5">
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
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-[#0D9488] shrink-0">
                <Bed size={18} />
              </div>
              <div>
                <h4 className="font-bold text-white uppercase">Samara Exclusive Loft Bedroom</h4>
                <p className="text-[10px] text-slate-450 leading-relaxed font-light">Kasur queen, sofa, meja kerja solid, pendingin ruangan AC inverter silent & smart TV 43".</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Volume2 size={16} className="text-indigo-400" />
              <span className="text-[10px] text-[#64748B] font-mono">Ambient Audio (Sound of Nature) Active</span>
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
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80';
              }}
            />
          </div>
          <p className="text-[#64748B] text-xs font-mono tracking-wider mt-4 text-center">Klik di luar gambar atau tombol X untuk menutup pratinjau</p>
        </div>
      )}

      {/* DETAIL KAMAR POPUP MODAL */}
      <Modal
        isOpen={selectedRoomForDetail !== null}
        onClose={() => setSelectedRoomForDetail(null)}
        title={`INFORMASI DETAIL KAMAR UNIT ${selectedRoomForDetail?.room_number || ''}`}
      >
        {selectedRoomForDetail && (
          <div className="space-y-5 text-left max-h-[80vh] overflow-y-auto pr-1">
            {/* Image section */}
            {(() => {
              const detailRoomImages = [
                selectedRoomForDetail.image_url,
                ...(selectedRoomForDetail.images || [])
              ].filter(img => typeof img === 'string' && img.trim() !== '') as string[];

              return detailRoomImages.length > 0 ? (
                <div className="space-y-2">
                  <div className="relative group">
                    <div 
                      ref={scrollContainerRef}
                      onScroll={(e) => {
                        const container = e.currentTarget;
                        const scrollPosition = container.scrollLeft;
                        const itemWidth = container.clientWidth;
                        if (itemWidth > 0) {
                          const index = Math.round(scrollPosition / itemWidth);
                          setActiveDetailImageIndex(index);
                        }
                      }}
                      className="w-full h-52 rounded-2xl overflow-x-auto flex snap-x snap-mandatory scroll-smooth no-scrollbar bg-slate-100 border border-[#E2E8F0]"
                    >
                      {detailRoomImages.map((img, idx) => (
                        <div 
                          key={idx} 
                          onClick={() => setSelectedRoomImage(img)}
                          className="w-full h-full shrink-0 snap-start relative cursor-zoom-in group/zoom"
                          title="Klik untuk memperbesar gambar dalam tampilan Layar Penuh"
                        >
                          <img 
                            src={img} 
                            alt={`Kamar ${selectedRoomForDetail.room_number} Gambar ${idx + 1}`} 
                            className="w-full h-full object-cover select-none group-hover/zoom:scale-102 transition-transform duration-300"
                            draggable="false"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/zoom:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1.5 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none">
                            <Search size={14} className="text-amber-300" />
                            <span>Perbesar Gambar</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="absolute top-3 left-3 bg-[#2E6F40] px-3 py-1 rounded-xl text-[9px] font-extrabold text-white tracking-wide uppercase shadow z-10 select-none">
                      LANTAI {selectedRoomForDetail.floor}
                    </div>

                    {detailRoomImages.length > 1 && (
                      <>
                        <div className="absolute bottom-3 right-3 bg-black/70 px-2 py-0.5 rounded-lg text-[9px] font-mono text-white z-10 select-none">
                          {activeDetailImageIndex + 1} / {detailRoomImages.length}
                        </div>

                        {/* Navigation arrows */}
                        <button
                          type="button"
                          onClick={() => {
                            if (scrollContainerRef.current) {
                              const prevIdx = (activeDetailImageIndex - 1 + detailRoomImages.length) % detailRoomImages.length;
                              scrollContainerRef.current.scrollTo({
                                left: prevIdx * scrollContainerRef.current.clientWidth,
                                behavior: 'smooth'
                              });
                            }
                          }}
                          className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 hover:bg-white text-slate-800 flex items-center justify-center shadow-md transition-all cursor-pointer z-10 opacity-0 group-hover:opacity-100 duration-200"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (scrollContainerRef.current) {
                              const nextIdx = (activeDetailImageIndex + 1) % detailRoomImages.length;
                              scrollContainerRef.current.scrollTo({
                                left: nextIdx * scrollContainerRef.current.clientWidth,
                                behavior: 'smooth'
                              });
                            }
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 hover:bg-white text-slate-800 flex items-center justify-center shadow-md transition-all cursor-pointer z-10 opacity-0 group-hover:opacity-100 duration-200"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </>
                    )}
                  </div>
                  
                  {detailRoomImages.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto py-1 scrollbar-thin">
                      {detailRoomImages.map((img, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setActiveDetailImageIndex(idx);
                            if (scrollContainerRef.current) {
                              scrollContainerRef.current.scrollTo({
                                left: idx * scrollContainerRef.current.clientWidth,
                                behavior: 'smooth'
                              });
                            }
                          }}
                          className={`w-14 h-11 rounded-lg overflow-hidden border-2 transition-all shrink-0 cursor-pointer ${
                            activeDetailImageIndex === idx 
                              ? 'border-[#2E6F40] ring-1 ring-[#2E6F40]/30 scale-[1.03]' 
                              : 'border-[#E2E8F0] opacity-70 hover:opacity-100'
                          }`}
                        >
                          <img src={img} alt={`Thumbnail ${idx + 1}`} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full h-44 rounded-2xl bg-slate-50 border border-[#E2E8F0] flex flex-col items-center justify-center gap-2 text-slate-400">
                  <Bed size={32} className="text-[#2E6F40]" />
                  <span className="text-[10px] uppercase font-bold tracking-wider">Foto belum di-upload</span>
                </div>
              );
            })()}

            {/* Quick Specs Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-[#F8F9FA] border border-[#E2E8F0] p-3 rounded-xl text-center">
                <span className="text-[8px] text-[#64748B] uppercase block font-mono">Tipe Kamar</span>
                <span className="font-extrabold text-[#3A444D] text-xs uppercase">{selectedRoomForDetail.room_type}</span>
              </div>
              <div className="bg-[#F8F9FA] border border-[#E2E8F0] p-3 rounded-xl text-center">
                <span className="text-[8px] text-[#64748B] uppercase block font-mono">Ukuran Kamar</span>
                <span className="font-extrabold text-[#3A444D] text-xs">{selectedRoomForDetail.size_sqm} m²</span>
              </div>
              <div className="bg-[#F8F9FA] border border-[#E2E8F0] p-3 rounded-xl text-center">
                <span className="text-[8px] text-[#64748B] uppercase block font-mono">Lantai Unit</span>
                <span className="font-extrabold text-[#3A444D] text-xs">Lantai {selectedRoomForDetail.floor}</span>
              </div>
              <div className="bg-[#F8F9FA] border border-[#E2E8F0] p-3 rounded-xl text-center">
                <span className="text-[8px] text-[#64748B] uppercase block font-mono">Biaya Sewa</span>
                <span className="font-extrabold text-[#2E6F40] text-xs font-mono">{formatRupiah(selectedRoomForDetail.price)}/bln</span>
              </div>
            </div>

            {/* Room Features */}
            <div className="space-y-3">
              <h4 className="text-xs font-extrabold text-[#3A444D] uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-1.5 h-3.5 bg-[#2E6F40] rounded-full"></span>
                Daftar Fasilitas Dalam Kamar
              </h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {normalizeFacilityList(selectedRoomForDetail.facilities, DEFAULT_FACILITIES.slice(0, 5)).map((fac: any, i) => {
                  const facName = typeof fac === 'string' ? fac : (fac?.name || fac?.title || 'Fasilitas Unit');
                  return (
                    <div key={fac?.id || i} className="flex items-center gap-2 bg-[#F8F9FA] border border-[#E2E8F0] p-2.5 rounded-lg">
                      <CheckCircle size={12} className="text-[#2E6F40] shrink-0" />
                      <span className="font-medium text-[#475569] capitalize">{facName}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Status Information */}
            {selectedRoomForDetail.status === 'occupied' || selectedRoomForDetail.status === 'reserved' || selectedRoomForDetail.status === 'maintenance' ? (
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start gap-3">
                <AlertCircle className="text-amber-600 mt-0.5 shrink-0" size={16} />
                <div className="space-y-0.5">
                  <h5 className="font-black text-amber-900 text-xs uppercase">
                    STATUS UNIT: {selectedRoomForDetail.status === 'occupied' ? 'SUDAH TERISI (OCCUPIED)' : selectedRoomForDetail.status === 'reserved' ? 'SEDANG DIPESAN (RESERVED)' : 'SEDANG PERAWATAN (MAINTENANCE)'}
                  </h5>
                  <p className="text-[11px] text-amber-800 leading-relaxed font-medium">
                    Kamar ini saat ini tidak dapat dipesan atau disurvey karena telah memiliki penyewa aktif atau reservasi yang sah terdaftar di sistem.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-emerald-50 border border-emerald-200/50 p-4 rounded-xl flex items-start gap-3">
                <CheckCircle className="text-[#2E6F40] mt-0.5 shrink-0" size={16} />
                <div className="space-y-0.5">
                  <h5 className="font-black text-slate-800 text-xs">STATUS UNIT: TERSEDIA (AVAILABLE)</h5>
                  <p className="text-[11px] text-slate-600 leading-relaxed font-medium">Unit kamar ini dalam kondisi siap huni, bersih, dan seluruh fasilitas penunjang (listrik, air, AC, sanitary) telah diinspeksi oleh tim housekeeping super-admin kami.</p>
                </div>
              </div>
            )}

            {/* CTAs */}
            {(() => {
              const parentProp = properties.find(prop => prop.id === selectedRoomForDetail.property_id);
              const hasAirbnbDetail = Boolean(
                selectedRoomForDetail.is_airbnb_enabled ||
                selectedRoomForDetail.airbnb_url ||
                parentProp?.is_airbnb_enabled ||
                parentProp?.airbnb_url
              );
              const airbnbDetailUrl =
                selectedRoomForDetail.airbnb_url ||
                parentProp?.airbnb_url ||
                'https://www.airbnb.co.id/users/profile/1469644070216777538?previous_page_name=PdpHomeMarketplace';
              return (
                <div className="space-y-2.5 pt-2">
                  {selectedRoomForDetail.status === 'occupied' || selectedRoomForDetail.status === 'reserved' || selectedRoomForDetail.status === 'maintenance' ? (
                    <button
                      type="button"
                      disabled
                      className="w-full bg-slate-100 border border-slate-200 text-slate-400 py-3 rounded-xl text-xs font-extrabold uppercase tracking-wider cursor-not-allowed text-center"
                    >
                      Unit Kamar Tidak Tersedia
                    </button>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRoomForDetail(null);
                          if (parentProp) {
                            setActiveProperty(parentProp);
                            setActiveRoom(selectedRoomForDetail);
                            setCheckoutFlow('survey');
                          }
                        }}
                        className="w-full bg-white border border-[#E2E8F0] hover:bg-[#F8F9FA] text-[#3A444D] py-3 rounded-xl text-xs font-extrabold uppercase transition-all tracking-wider cursor-pointer text-center"
                      >
                        Jadwalkan Survey
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRoomForDetail(null);
                          if (parentProp) {
                            setActiveProperty(parentProp);
                            setActiveRoom(selectedRoomForDetail);
                            setCheckoutFlow('monthly');
                          }
                        }}
                        className="w-full bg-[#2E6F40] hover:bg-[#1f4b2b] text-white py-3 rounded-xl text-xs font-extrabold uppercase transition-all tracking-wider cursor-pointer shadow-md text-center"
                      >
                        Pesan Sekarang
                      </button>
                    </div>
                  )}

                  {hasAirbnbDetail && (
                    <a
                      href={airbnbDetailUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full bg-[#FFF8F9] hover:bg-[#FF385C] text-[#FF385C] hover:text-white border border-[#FF385C]/35 hover:border-[#FF385C] py-3 rounded-xl text-xs font-extrabold uppercase transition-all tracking-wider cursor-pointer flex items-center justify-center gap-2 text-center shadow-xs"
                    >
                      <span>Pesan Kamar Ini via Airbnb</span>
                      <ExternalLink size={13} />
                    </a>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </Modal>

    </div>
  );
}

