import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import * as LucideIcons from 'lucide-react';
import {
  Sparkles, BookOpen, Clock, Shield, MapPin, ChevronLeft,
  CheckCircle, Info, Bed, RotateCw, Play, ArrowRight, Star,
  ChevronRight, MapPinned, Compass, Grid, UploadCloud, ExternalLink
} from 'lucide-react';
import { Property, Room, StandardFacility } from '../types';
import { database, normalizeFacilityList, inferFacilityIcon } from '../lib/supabase';
import { DEFAULT_FACILITIES } from '../data/fallbackData';
import { PropertyNearbyPlaces } from './property/PropertyNearbyPlaces';
import { sanitizePropertyCoordinates, isValidCoordinate } from '../utils/mapCoordinates';
import {
  createGoogleMapsRoadmapLayer,
  getGoogleMapsSearchUrl,
  getGoogleMapsDirectionsUrl
} from '../utils/mapTiles';

export interface RenamedPropertyMeta {
  slug: string;
  label: string;
  originalKeyword: string;
  defaultName: string;
  tagline: string;
  defaultDescription: string;
}

export const RENAMED_PROPERTIES_META: Record<string, RenamedPropertyMeta> = {
  'compact-kos': {
    slug: 'compact-kos',
    label: 'Compact Kos',
    originalKeyword: 'tiara',
    defaultName: 'Kos Tiara Kemayoran',
    tagline: 'Hunian Ringkas, Efisien & Strategis',
    defaultDescription:
      'Compact Kos (Kos Tiara Kemayoran) menghadirkan konsep hunian modern yang ringkas, efisien, dan fungsional di kawasan strategis Kemayoran. Dirancang khusus untuk mahasiswa dan profesional muda yang mengutamakan kepraktisan, privasi, akses cepat ke pusat kota, serta fasilitas all-in lengkap.'
  },
  'urban-hub-kos': {
    slug: 'urban-hub-kos',
    label: 'Urban hub kos',
    originalKeyword: 'atika',
    defaultName: 'Kos Atika Kemayoran',
    tagline: 'Pusat Gaya Hidup Urban & Aksesibilitas Kota',
    defaultDescription:
      'Urban hub kos (Kos Atika Kemayoran) terletak sangat strategis di jantung pusat aktivitas kota Kemayoran. Menghadirkan konsep hunian kos modern serta opsi sewa kamar harian dan bulanan fully furnished (AC, Smart TV, Wi-Fi kencang, & kamar mandi dalam) yang nyaman, tenang, dan praktis.'
  },
  'companion-kos': {
    slug: 'companion-kos',
    label: 'Companion kos',
    originalKeyword: 'samara',
    defaultName: 'Kos Stay at Samara',
    tagline: 'Kenyamanan Eksklusif & Lingkungan Harmonis',
    defaultDescription:
      'Companion kos (Kos Stay at Samara) menawarkan pengalaman tinggal eksklusif yang hangat, asri, dan nyaman layaknya rumah sendiri. Dilengkapi area komunal yang representatif, keamanan 24 jam, serta layanan manajemen responsif untuk menunjang produktivitas dan istirahat Anda setiap hari.'
  }
};

export const getPropertyCategoryLabel = (name: string): string => {
  const lower = (name || '').toLowerCase();
  if (lower.includes('tiara') || lower.includes('compact')) return 'Compact Kos';
  if (lower.includes('atika') || lower.includes('urban hub')) return 'Urban hub kos';
  if (lower.includes('samara') || lower.includes('companion')) return 'Companion kos';
  return name;
};

export const getPropertySlug = (propertyOrName: Property | string): string => {
  const rawName = typeof propertyOrName === 'string' ? propertyOrName : (propertyOrName?.name || '');
  const lower = rawName.toLowerCase();
  if (lower.includes('tiara') || lower.includes('compact')) return 'compact-kos';
  if (lower.includes('atika') || lower.includes('urban hub') || lower.includes('urban-hub')) return 'urban-hub-kos';
  if (lower.includes('samara') || lower.includes('companion')) return 'companion-kos';
  return lower.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
};

export const getUrlPropertyParameter = (): string | null => {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  const queryProp = params.get('property') || params.get('kost') || params.get('kos');
  if (queryProp && queryProp.trim()) {
    return decodeURIComponent(queryProp.trim());
  }

  const pathParts = window.location.pathname.split('/').filter(Boolean);
  if (pathParts.length >= 2 && (pathParts[0] === 'property' || pathParts[0] === 'kost' || pathParts[0] === 'kos')) {
    return decodeURIComponent(pathParts[1]);
  }

  const singleSegment = pathParts[0]?.toLowerCase();
  if (
    singleSegment === 'compact-kos' ||
    singleSegment === 'urban-hub-kos' ||
    singleSegment === 'companion-kos'
  ) {
    return singleSegment;
  }

  return null;
};

export const updateUrlPropertyParam = (slugOrNull: string | null) => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (slugOrNull) {
    url.searchParams.set('property', slugOrNull);
  } else {
    url.searchParams.delete('property');
    url.searchParams.delete('kost');
    url.searchParams.delete('kos');
    if (url.pathname.startsWith('/property/') || url.pathname.startsWith('/kost/') || url.pathname.startsWith('/kos/')) {
      url.pathname = '/';
    }
  }
  window.history.pushState({ property: slugOrNull }, '', url.toString());
};

export const findPropertyByUrlParam = (param: string, properties: Property[]): Property | undefined => {
  if (!param || !properties || properties.length === 0) return undefined;
  const normalized = param.trim().toLowerCase();
  const normalizedSlug = normalized.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  return properties.find((p) => {
    const pNameLower = (p.name || '').toLowerCase();
    const pSlug = getPropertySlug(p);
    const pLabelLower = getPropertyCategoryLabel(p.name).toLowerCase();

    return (
      String(p.id) === normalized ||
      pSlug === normalizedSlug ||
      pLabelLower === normalized ||
      pLabelLower.includes(normalized) ||
      pNameLower === normalized ||
      pNameLower.includes(normalized) ||
      (normalizedSlug === 'compact-kos' && pNameLower.includes('tiara')) ||
      (normalizedSlug === 'urban-hub-kos' && pNameLower.includes('atika')) ||
      (normalizedSlug === 'companion-kos' && pNameLower.includes('samara'))
    );
  });
};

// Interactive Detail Map Component for selected property branch
export const PropertyDetailMap: React.FC<{ property: Property; onOpenFullMap?: () => void }> = ({
  property,
  onOpenFullMap
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [, setTileError] = useState(false);

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
      scrollWheelZoom: false
    }).setView([lat, lng], 16);

    createGoogleMapsRoadmapLayer({}, (hasError) => setTileError(hasError)).addTo(map);

    const customIcon = L.divIcon({
      className: 'custom-leaflet-detail-marker',
      html: `
        <div class="flex flex-col items-center cursor-pointer transform -translate-y-1/2 scale-110 z-50">
          <div class="px-3 py-1 rounded-xl text-[10px] font-black font-mono shadow-xl bg-[#2E6F40] text-white border-2 border-white whitespace-nowrap">
            📍 ${getPropertyCategoryLabel(property.name)}
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
        <strong style="font-size: 12px; color: #1e293b; display: block; margin-bottom: 2px;">${getPropertyCategoryLabel(property.name)} (${property.name})</strong>
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
  }, [property.id, lat, lng, property.name, property.address, hasValid]);

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
          <p className="text-[10px] text-[#64748B] font-mono mt-0.5">
            LAT: {lat} | LNG: {lng}
          </p>
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

export interface PropertyDetailViewProps {
  /** Optional explicit URL slug/parameter override; if omitted, reads from window.location */
  propertyParam?: string | null;
  /** Optional active property passed from parent state */
  property?: Property | null;
  /** All properties list from Supabase */
  properties?: Property[];
  /** All rooms list from Supabase */
  rooms?: Room[];
  /** Currently selected room for booking/survey */
  activeRoom?: Room | null;
  /** Standard facilities configured in system settings */
  standardFacilities?: StandardFacility[];
  /** Image upload state & handler */
  uploadingImage?: boolean;
  onUploadDetailImage?: (e: React.ChangeEvent<HTMLInputElement>, imageIndex: number) => void;
  /** Callbacks for navigation & actions */
  onBackToHome?: () => void;
  onOpenSearchCatalog?: () => void;
  onOpenFullMap?: () => void;
  onOpenRoomCatalogModal?: () => void;
  onSelectProperty?: (property: Property) => void;
  onSelectRoom?: (room: Room | null, flowType?: 'monthly' | 'daily' | 'survey') => void;
  onInspectRoomDetail?: (room: Room) => void;
  onZoomImage?: (imageUrl: string) => void;
  onOpenVirtualTour?: () => void;
}

export const PropertyDetailView: React.FC<PropertyDetailViewProps> = ({
  propertyParam,
  property: propFromParent,
  properties: propertiesFromParent,
  rooms: roomsFromParent,
  activeRoom = null,
  standardFacilities = [],
  uploadingImage = false,
  onUploadDetailImage,
  onBackToHome,
  onOpenSearchCatalog,
  onOpenFullMap,
  onOpenRoomCatalogModal,
  onSelectProperty,
  onSelectRoom,
  onInspectRoomDetail,
  onZoomImage,
  onOpenVirtualTour
}) => {
  const [internalProperties, setInternalProperties] = useState<Property[]>([]);
  const [internalRooms, setInternalRooms] = useState<Room[]>([]);
  const [urlParam, setUrlParam] = useState<string | null>(() => propertyParam || getUrlPropertyParameter());

  // Filter state for Room Showcase
  const [detailRoomTab, setDetailRoomTab] = useState<'all' | 'available' | 'occupied'>('all');
  const [detailRoomFloor, setDetailRoomFloor] = useState<number | 'all'>('all');
  const [detailRoomType, setDetailRoomType] = useState<'all' | 'Standard' | 'Deluxe' | 'Premium' | 'Premium Plus'>('all');

  const allProperties =
    propertiesFromParent && propertiesFromParent.length > 0 ? propertiesFromParent : internalProperties;
  const allRooms = roomsFromParent && roomsFromParent.length > 0 ? roomsFromParent : internalRooms;

  // Fetch from Supabase if rendered standalone without parent properties/rooms
  useEffect(() => {
    if (!propertiesFromParent || propertiesFromParent.length === 0) {
      database.fetchProperties().then((res) => {
        if (res && res.length > 0) setInternalProperties(res);
      });
    }
    if (!roomsFromParent || roomsFromParent.length === 0) {
      database.fetchRooms().then((res) => {
        if (res && res.length > 0) setInternalRooms(res);
      });
    }
  }, [propertiesFromParent, roomsFromParent]);

  // Sync URL parameter when prop changes or browser popstate fires
  useEffect(() => {
    if (propertyParam !== undefined) {
      setUrlParam(propertyParam);
    }
  }, [propertyParam]);

  useEffect(() => {
    const handlePopState = () => {
      setUrlParam(getUrlPropertyParameter());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Resolve active property from URL parameter first, then fallback to parent prop
  const resolvedProperty: Property | null = (() => {
    const currentParam = urlParam || getUrlPropertyParameter();
    if (currentParam && allProperties.length > 0) {
      const matched = findPropertyByUrlParam(currentParam, allProperties);
      if (matched) return matched;
    }
    if (propFromParent) return propFromParent;
    return allProperties[0] || null;
  })();

  // Keep URL parameter synchronized with the active property slug
  useEffect(() => {
    if (resolvedProperty) {
      const slug = getPropertySlug(resolvedProperty);
      const currentUrlParam = getUrlPropertyParameter();
      if (currentUrlParam !== slug) {
        updateUrlPropertyParam(slug);
      }
      setUrlParam(slug);
    }
  }, [resolvedProperty?.id]);

  // Reset room filters when switching properties
  useEffect(() => {
    setDetailRoomTab('all');
    setDetailRoomFloor('all');
    setDetailRoomType('all');
  }, [resolvedProperty?.id]);

  const isRoomAvailable = (r: Room): boolean => {
    if (!r) return false;
    return r.status === 'available' || (r.status as string) === 'ready' || !r.status;
  };

  const formatRupiah = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(num || 0);
  };

  if (!resolvedProperty) {
    return (
      <div className="max-w-6xl mx-auto px-4 md:px-8 mt-6 py-16 text-center bg-white border border-[#E2E8F0] rounded-3xl shadow-xs">
        <p className="text-sm font-bold text-[#3A444D]">Memuat detail properti...</p>
      </div>
    );
  }

  const activeSlug = getPropertySlug(resolvedProperty);
  const renamedMeta = RENAMED_PROPERTIES_META[activeSlug];
  const renamedCategoryLabel = renamedMeta ? renamedMeta.label : getPropertyCategoryLabel(resolvedProperty.name);

  // Specific description resolved from Supabase or rich renamed property metadata
  const resolvedDescription =
    resolvedProperty.description &&
    resolvedProperty.description.trim() !== '' &&
    resolvedProperty.description.trim() !== '(test)'
      ? resolvedProperty.description
      : renamedMeta?.defaultDescription ||
        'Hunian eksklusif berfasilitas komplit, berlokasi sangat strategis dekat area komersial, pusat perkantoran, dan kampus ternama. Lingkungan asri, tenang, aman dan nyaman untuk ditinggali.';

  // Specific rooms for this property
  const propertyRooms = allRooms.filter((r) => r.property_id === resolvedProperty.id);
  const availableRoomsList = propertyRooms.filter((r) => isRoomAvailable(r));
  const occupiedRoomsList = propertyRooms.filter((r) => !isRoomAvailable(r));

  const floors: number[] = Array.from(
    new Set<number>(propertyRooms.map((r) => Number(r.floor)).filter((f) => !isNaN(f) && f > 0))
  ).sort((a: number, b: number) => a - b);

  let displayRooms = propertyRooms;
  if (detailRoomTab === 'available') {
    displayRooms = availableRoomsList;
  } else if (detailRoomTab === 'occupied') {
    displayRooms = occupiedRoomsList;
  }

  if (detailRoomFloor !== 'all') {
    displayRooms = displayRooms.filter((r) => r.floor === detailRoomFloor);
  }

  if (detailRoomType !== 'all') {
    displayRooms = displayRooms.filter((r) => (r.room_type || 'Standard') === detailRoomType);
  }

  const startingPrice =
    propertyRooms.length > 0 ? Math.min(...propertyRooms.map((r) => r.price)) : resolvedProperty.price;

  const handleSwitchProperty = (targetProp: Property) => {
    const newSlug = getPropertySlug(targetProp);
    updateUrlPropertyParam(newSlug);
    setUrlParam(newSlug);
    if (onSelectProperty) {
      onSelectProperty(targetProp);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 mt-6 space-y-8 animate-fade-in">
      {/* Breadcrumb Navigation & Quick Property Switcher by URL Parameter */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                updateUrlPropertyParam(null);
                if (onBackToHome) onBackToHome();
              }}
              className="inline-flex items-center gap-1.5 text-xs text-[#64748B] hover:text-[#2E6F40] font-bold cursor-pointer transition-colors px-3.5 py-2 rounded-xl border border-[#E2E8F0] bg-white shadow-xs"
            >
              <ChevronLeft size={14} />
              Kembali ke Beranda
            </button>
            {onOpenSearchCatalog && (
              <button
                type="button"
                onClick={() => {
                  updateUrlPropertyParam(null);
                  onOpenSearchCatalog();
                }}
                className="inline-flex items-center gap-1.5 text-xs text-[#64748B] hover:text-[#2E6F40] font-bold cursor-pointer transition-colors px-3.5 py-2 rounded-xl border border-[#E2E8F0] bg-white shadow-xs"
              >
                Pencarian Katalog
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-[10px] text-[#64748B] font-mono">
            <span>Home</span>
            <ChevronRight size={10} />
            <span className="text-[#2E6F40] font-bold">{renamedCategoryLabel}</span>
            <ChevronRight size={10} />
            <span className="text-[#3A444D] font-semibold">{resolvedProperty.name}</span>
          </div>
        </div>

        {/* Renamed Properties URL Parameter Switcher Bar */}
        {allProperties.length > 1 && (
          <div className="bg-white border border-[#E2E8F0] p-2.5 rounded-2xl flex flex-wrap items-center justify-between gap-2 shadow-2xs">
            <span className="text-[10px] font-extrabold uppercase tracking-wider font-mono text-[#64748B] px-2">
              Pilih Kategori Kos:
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {allProperties.map((p) => {
                const isCurrent = p.id === resolvedProperty.id;
                const catLabel = getPropertyCategoryLabel(p.name);
                const pAvailCount = allRooms.filter((r) => r.property_id === p.id && isRoomAvailable(r)).length;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSwitchProperty(p)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 border ${
                      isCurrent
                        ? 'bg-[#2E6F40] text-white border-[#2E6F40] shadow-xs'
                        : 'bg-[#F8FAFC] text-[#3A444D] border-[#E2E8F0] hover:border-[#2E6F40] hover:text-[#2E6F40]'
                    }`}
                  >
                    <span>{catLabel}</span>
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded-md ${
                        isCurrent ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {pAvailCount} Kosong
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Airbnb-style Premium Image Grid Gallery */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-white border border-[#E2E8F0] p-3 rounded-3xl overflow-hidden shadow-sm h-[380px]">
        {/* 1 Big Photo (Col span 2, Row span 2) */}
        <div className="md:col-span-2 h-full rounded-2xl overflow-hidden bg-slate-900 select-none relative group">
          <img
            src={
              resolvedProperty.image_url ||
              'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=600&q=80'
            }
            alt={resolvedProperty.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-95"
            referrerPolicy="no-referrer"
          />
          <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-sm border border-slate-800 text-white px-3 py-1.5 rounded-xl text-[10px] font-extrabold uppercase font-mono tracking-wider">
            {renamedCategoryLabel}
          </div>

          {/* Admin Image Uploader Trigger */}
          {onUploadDetailImage && (
            <div className="absolute bottom-4 right-4 z-10">
              <label className="bg-[#2E6F40] hover:bg-[#235531] text-white px-3 py-1.5 rounded-xl text-[10px] font-extrabold uppercase font-mono tracking-wider shadow-md hover:shadow-lg transition-all cursor-pointer flex items-center gap-1.5">
                <UploadCloud size={13} />
                <span>{uploadingImage ? 'Mengunggah...' : 'Upload Foto Utama'}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingImage}
                  onChange={(e) => onUploadDetailImage(e, -1)}
                />
              </label>
            </div>
          )}
        </div>

        {/* Grid of 4 Smaller Photos (Col span 1 each) */}
        <div className="hidden md:grid grid-cols-2 grid-rows-2 col-span-2 gap-3 h-full">
          {(() => {
            const galleryImages = (resolvedProperty.images || []).filter(
              (img) => typeof img === 'string' && img.trim() !== ''
            );
            const labels = ['Ruang Kamar', 'Kamar Mandi', 'Area Bersama', 'Rooftop Lounge'];

            return [0, 1, 2, 3].map((idx) => {
              const url =
                galleryImages[idx] ||
                (idx === 0
                  ? resolvedProperty.image_url && resolvedProperty.image_url.trim() !== ''
                    ? resolvedProperty.image_url
                    : null
                  : null);
              const label = labels[idx];
              return (
                <div
                  key={idx}
                  className={`rounded-xl overflow-hidden h-full select-none relative group ${
                    url
                      ? 'bg-slate-900 cursor-zoom-in'
                      : 'bg-slate-900/60 border border-slate-800 flex flex-col items-center justify-center'
                  }`}
                  onClick={() => url && onZoomImage && onZoomImage(url)}
                >
                  {url ? (
                    <>
                      <img
                        src={url}
                        alt={label}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute bottom-2 left-2 bg-black/65 px-2 py-1 rounded-md text-[9px] font-semibold text-white tracking-wide">
                        {label}
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-3 text-center">
                      <UploadCloud
                        size={20}
                        className="mb-1 text-slate-500 group-hover:text-emerald-400 transition-colors"
                      />
                      <span className="text-[10px] font-bold text-slate-400">{label}</span>
                      <span className="text-[9px] text-slate-500">Belum diunggah</span>
                    </div>
                  )}

                  {/* Admin Image Uploader Trigger for Gallery */}
                  {onUploadDetailImage && (
                    <div
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <label
                        className="bg-slate-950/80 hover:bg-[#2E6F40] text-white p-2 rounded-lg shadow-md cursor-pointer flex items-center justify-center transition-colors"
                        title="Unggah Foto Galeri"
                      >
                        <UploadCloud size={12} />
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingImage}
                          onChange={(e) => onUploadDetailImage(e, idx)}
                        />
                      </label>
                    </div>
                  )}
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
          {/* Property Header & Renamed Identity */}
          <div className="space-y-3.5 border-b border-[#F1F5F9] pb-6 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-md text-[10px] font-extrabold uppercase font-mono tracking-wider bg-[#2E6F40] text-white shadow-2xs">
                {renamedCategoryLabel}
              </span>
              <span
                className={`px-2.5 py-1 rounded-md text-[9px] font-extrabold uppercase font-mono tracking-wider ${
                  resolvedProperty.type === 'putri'
                    ? 'bg-pink-500/20 text-pink-700 border border-pink-500/30'
                    : resolvedProperty.type === 'putra'
                      ? 'bg-blue-500/20 text-blue-700 border border-blue-500/30'
                      : 'bg-amber-500/20 text-amber-700 border border-amber-500/30'
                }`}
              >
                KOS {resolvedProperty.type.toUpperCase()}
              </span>
              <div className="flex items-center gap-1 text-[#64748B] font-semibold font-mono text-[11px]">
                <Star size={13} className="text-[#2E6F40] fill-amber-500" />
                <span>4.9 (42 Ulasan)</span>
              </div>
              <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                TERVERIFIKASI
              </span>
            </div>

            <div>
              <h1 className="text-3xl font-black text-[#3A444D] font-display tracking-tight">
                {renamedCategoryLabel} — {resolvedProperty.name}
              </h1>
              {renamedMeta?.tagline && (
                <p className="text-xs font-semibold text-[#2E6F40] mt-1">{renamedMeta.tagline}</p>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-[#64748B] text-sm font-medium">
              <MapPin size={15} className="text-[#2E6F40] shrink-0" />
              <span>{resolvedProperty.address}</span>
            </div>
          </div>

          {/* Deskripsi Hunian (Specific Property Description) */}
          <div className="bg-white border border-[#E2E8F0] p-6 rounded-[24px] space-y-3.5 shadow-xs text-left">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-black text-[#3A444D] uppercase tracking-tight flex items-center gap-2">
                <span className="w-1.5 h-4 bg-[#2E6F40] rounded-full"></span>
                Deskripsi Hunian — {renamedCategoryLabel}
              </h3>
              <span className="text-[10px] font-mono font-bold text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] px-2.5 py-0.5 rounded-lg">
                /{activeSlug}
              </span>
            </div>
            <p className="text-[#64748B] leading-relaxed font-medium text-xs whitespace-pre-line">
              {resolvedDescription}
            </p>
          </div>

          {/* HARGA SEWA MULAI CARD BLOCK */}
          <div className="bg-white border border-[#E2E8F0] p-8 rounded-[24px] text-center space-y-5 shadow-xs">
            <div className="space-y-1">
              <span className="text-[10px] text-[#64748B] font-extrabold uppercase tracking-widest block">
                HARGA SEWA MULAI
              </span>
              <h2 className="text-3xl font-extrabold text-[#1E293B] font-display tracking-tight">
                {formatRupiah(startingPrice)}{' '}
                <span className="text-sm font-medium text-[#64748B]">/ bulan</span>
              </h2>
            </div>

            {onOpenRoomCatalogModal && (
              <button
                type="button"
                onClick={onOpenRoomCatalogModal}
                className="w-full max-w-md mx-auto py-3.5 px-6 bg-[#334155] hover:bg-[#1E293B] text-white rounded-full font-bold flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all cursor-pointer"
              >
                <Grid size={18} />
                <span>Buka Katalog Kamar</span>
              </button>
            )}

            <p className="text-[10px] text-[#64748B] font-medium">
              Lihat semua tipe & harga kamar tersedia di {renamedCategoryLabel}
            </p>
          </div>

          {/* DAFTAR KAMAR & KETERSEDIAAN UNIT LANGSUNG TERPADU (AVAILABLE ROOMS) */}
          <div className="bg-white border border-[#E2E8F0] p-6 sm:p-7 rounded-[24px] space-y-6 shadow-xs text-left">
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-[#F1F5F9] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-[#2E6F40] rounded-full"></span>
                  <h3 className="text-sm sm:text-base font-black text-[#3A444D] uppercase tracking-tight font-display">
                    Daftar Kamar & Ketersediaan Unit ({renamedCategoryLabel})
                  </h3>
                </div>
                <p className="text-[11px] text-[#64748B] font-medium mt-1">
                  Data ketersediaan kamar tersinkronisasi otomatis dengan database Supabase. Unit tanpa perpanjangan kontrak otomatis kembali tersedia.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase font-mono bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {availableRoomsList.length} Unit Tersedia
                </span>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold font-mono bg-slate-100 text-slate-600 border border-slate-200">
                  {propertyRooms.length} Total
                </span>
              </div>
            </div>

            {/* Filter Tabs, Category & Floor Selection */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Tabs */}
                <div className="flex flex-wrap gap-1.5 bg-[#F8FAFC] p-1 rounded-xl border border-[#E2E8F0]">
                  <button
                    type="button"
                    onClick={() => setDetailRoomTab('all')}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      detailRoomTab === 'all'
                        ? 'bg-[#2E6F40] text-white shadow-2xs'
                        : 'text-[#64748B] hover:text-[#1E293B]'
                    }`}
                  >
                    Semua Unit ({propertyRooms.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailRoomTab('available')}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      detailRoomTab === 'available'
                        ? 'bg-[#2E6F40] text-white shadow-2xs'
                        : 'text-emerald-700 hover:text-emerald-800'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    Tersedia ({availableRoomsList.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailRoomTab('occupied')}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      detailRoomTab === 'occupied'
                        ? 'bg-[#2E6F40] text-white shadow-2xs'
                        : 'text-[#64748B] hover:text-[#1E293B]'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                    Terisi ({occupiedRoomsList.length})
                  </button>
                </div>

                {/* Floor Filter */}
                {floors.length > 1 && (
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="text-[#64748B] font-medium">Lantai:</span>
                    <select
                      value={detailRoomFloor}
                      onChange={(e) =>
                        setDetailRoomFloor(e.target.value === 'all' ? 'all' : Number(e.target.value))
                      }
                      className="bg-white border border-[#E2E8F0] rounded-lg px-2.5 py-1 text-xs font-semibold text-[#3A444D] focus:outline-none focus:border-[#2E6F40] cursor-pointer"
                    >
                      <option value="all">Semua Lantai</option>
                      {floors.map((f) => (
                        <option key={f} value={f}>
                          Lantai {f}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Room Category Pills (Standard, Deluxe, Premium, Premium Plus) */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider font-mono mr-1">
                  Kategori Kamar:
                </span>
                {(['all', 'Standard', 'Deluxe', 'Premium', 'Premium Plus'] as const).map((cat) => {
                  const isActive = detailRoomType === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setDetailRoomType(cat)}
                      className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer border flex items-center gap-1 ${
                        isActive
                          ? cat === 'Premium Plus'
                            ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 border-amber-400 shadow-2xs'
                            : 'bg-[#2E6F40] text-white border-[#2E6F40] shadow-2xs'
                          : 'bg-[#F8FAFC] text-[#64748B] border-[#E2E8F0] hover:border-[#2E6F40] hover:text-[#2E6F40]'
                      }`}
                    >
                      {cat === 'Premium Plus' && (
                        <Sparkles size={10} className={isActive ? 'text-slate-950' : 'text-amber-500'} />
                      )}
                      <span>{cat === 'all' ? 'Semua Kategori' : cat}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Rooms Grid */}
            {displayRooms.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {displayRooms.map((r) => {
                  const isAvail = isRoomAvailable(r);
                  const isSelected = activeRoom?.id === r.id;

                  return (
                    <div
                      key={r.id}
                      className={`p-4 rounded-2xl border flex flex-col justify-between gap-3.5 transition-all duration-300 ${
                        !isAvail
                          ? 'bg-[#F8FAFC]/60 border-[#E2E8F0] opacity-75'
                          : isSelected
                            ? 'border-[#2E6F40] bg-[#2E6F40]/5 shadow-sm ring-1 ring-[#2E6F40]/30'
                            : 'border-[#E2E8F0] bg-white hover:border-[#2E6F40] hover:shadow-sm'
                      }`}
                    >
                      <div className="space-y-3">
                        {/* Room Photo */}
                        <div
                          className="w-full h-40 rounded-xl overflow-hidden bg-slate-900 border border-[#E2E8F0] relative group cursor-pointer"
                          onClick={() => onInspectRoomDetail && onInspectRoomDetail(r)}
                          title="Klik untuk melihat foto & galeri unit ini"
                        >
                          <img
                            src={
                              r.image_url ||
                              'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80'
                            }
                            alt={`Kamar ${r.room_number}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src =
                                'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80';
                            }}
                          />
                          <div className="absolute top-2 left-2 bg-black/75 px-2 py-0.5 rounded text-[8px] font-bold text-white tracking-wide uppercase">
                            LANTAI {r.floor}
                          </div>
                          <div className="absolute bottom-2 right-2 bg-black/80 px-2 py-0.5 rounded text-[9px] font-semibold text-white">
                            {r.size_sqm || 16} m²
                          </div>
                          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="text-[10px] text-white font-bold bg-black/70 px-2.5 py-1 rounded-lg">
                              Lihat Galeri Foto
                            </span>
                          </div>
                        </div>

                        {/* Room Title & Status */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-start">
                            <div className="font-extrabold text-[#3A444D] text-sm font-display flex items-center gap-1.5 flex-wrap">
                              Unit {r.room_number}
                              <span
                                className={`text-[8px] font-extrabold px-2 py-0.5 rounded font-sans uppercase border ${
                                  r.room_type === 'Premium Plus'
                                    ? 'bg-gradient-to-r from-amber-500/20 to-yellow-500/20 text-amber-800 border-amber-400'
                                    : r.room_type === 'Premium'
                                      ? 'bg-teal-50 text-teal-700 border-teal-200'
                                      : 'text-[#2E6F40] bg-[#2E6F40]/10 border-[#2E6F40]/20'
                                }`}
                              >
                                {r.room_type || 'Standard'}
                              </span>
                            </div>

                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase font-mono border flex items-center gap-1 ${
                                isAvail
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-slate-100 text-slate-600 border-slate-200'
                              }`}
                            >
                              {isAvail ? (
                                <>
                                  <CheckCircle size={10} className="text-emerald-600" />
                                  Tersedia
                                </>
                              ) : (
                                'Terisi'
                              )}
                            </span>
                          </div>

                          {/* Facilities */}
                          {(() => {
                            const unitFacilities = normalizeFacilityList(
                              r.facilities,
                              DEFAULT_FACILITIES.slice(0, 4)
                            );
                            return (
                              <div className="flex flex-wrap gap-1 pt-1">
                                {unitFacilities.slice(0, 4).map((f: any, idx: number) => (
                                  <span
                                    key={f.id || idx}
                                    className="text-[9px] bg-[#F8FAFC] border border-[#E2E8F0] text-[#64748B] px-2 py-0.5 rounded-md font-medium"
                                  >
                                    {typeof f === 'string' ? f : f.name || f.title}
                                  </span>
                                ))}
                                {unitFacilities.length > 4 && (
                                  <span className="text-[9px] text-[#64748B] px-1 py-0.5 font-medium">
                                    +{unitFacilities.length - 4} lainnya
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Price */}
                        <div className="border-t border-[#F1F5F9] pt-2">
                          <div className="text-[10px] text-[#64748B] font-medium">Tarif Sewa</div>
                          <div className="text-base font-extrabold text-[#1E293B]">
                            {formatRupiah(r.price)}{' '}
                            <span className="text-[11px] text-[#64748B] font-normal">/ bulan</span>
                          </div>
                        </div>
                      </div>

                      {/* Action CTAs */}
                      <div className="pt-2 border-t border-[#F1F5F9] flex items-center gap-2">
                        {isAvail ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                if (onSelectRoom) onSelectRoom(r, 'monthly');
                                window.scrollTo({ top: 1200, behavior: 'smooth' });
                              }}
                              className="flex-1 py-2 px-3 bg-[#2E6F40] hover:bg-[#235531] text-white text-[11px] font-bold rounded-xl transition-colors cursor-pointer text-center shadow-2xs"
                            >
                              Pesan Unit Ini
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (onSelectRoom) onSelectRoom(r, 'survey');
                              }}
                              className="py-2 px-3 bg-[#F8FAFC] hover:bg-emerald-50 text-[#2E6F40] border border-[#E2E8F0] hover:border-[#2E6F40] text-[11px] font-bold rounded-xl transition-colors cursor-pointer text-center"
                              title="Jadwalkan survey untuk unit ini"
                            >
                              Survey
                            </button>
                          </>
                        ) : (
                          <div className="w-full py-2 px-3 bg-slate-100 text-slate-500 rounded-xl text-[11px] font-medium text-center border border-slate-200">
                            Unit Sedang Terisi
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-12 px-4 border border-dashed border-[#E2E8F0] rounded-2xl text-center space-y-2">
                <Bed size={32} className="text-[#64748B] mx-auto opacity-50" />
                <p className="text-xs text-[#64748B] font-medium">
                  Tidak ada kamar yang sesuai dengan filter yang dipilih.
                </p>
              </div>
            )}
          </div>

          {/* Detail Fasilitas Kompleks */}
          <div className="bg-white border border-[#E2E8F0] p-6 rounded-[24px] space-y-4 shadow-xs text-left">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-black text-[#3A444D] uppercase tracking-tight flex items-center gap-2">
                <span className="w-1.5 h-4 bg-[#2E6F40] rounded-full"></span>
                <Grid size={15} className="text-[#2E6F40]" />
                <span>Fasilitas Kompleks Gedung</span>
              </h3>
              <span className="text-[10px] font-bold text-[#2E6F40] bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                Tersedia Lengkap
              </span>
            </div>
            {(() => {
              const fallbackFromSettings = (standardFacilities || []).map((sf, i) => ({
                id: 300 + i,
                name: sf.title,
                icon: inferFacilityIcon(sf.title, sf.icon),
                category: 'property',
                description: sf.subtitle || ''
              }));
              const resolvedComplexFacilities = normalizeFacilityList(
                resolvedProperty.facilities,
                fallbackFromSettings.length >= 6 ? fallbackFromSettings : DEFAULT_FACILITIES.slice(0, 8)
              );
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  {resolvedComplexFacilities.map((fac: any, idx: number) => {
                    const facName =
                      typeof fac === 'string' ? fac : fac?.name || fac?.title || 'Fasilitas Gedung';
                    const facDesc =
                      typeof fac === 'object' ? fac?.description || fac?.subtitle || '' : '';
                    const iconName = inferFacilityIcon(
                      facName,
                      typeof fac === 'object' ? fac?.icon : undefined
                    );
                    const IconComp = (LucideIcons as any)[iconName] || LucideIcons.Sparkles;
                    return (
                      <div
                        key={fac?.id || idx}
                        className="bg-[#F8FAFC] hover:bg-white border border-[#E2E8F0] hover:border-[#2E6F40] p-3.5 rounded-2xl flex items-start gap-3 transition-all duration-200 shadow-2xs group"
                      >
                        <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0 group-hover:bg-[#2E6F40] group-hover:border-[#2E6F40] transition-colors">
                          <IconComp
                            size={15}
                            className="text-[#2E6F40] group-hover:text-white transition-colors shrink-0"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-[#1E293B] text-xs block leading-snug capitalize">
                            {facName}
                          </span>
                          {facDesc && (
                            <span className="text-[10px] text-[#64748B] font-normal line-clamp-2 mt-0.5 block leading-tight">
                              {facDesc}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* ATURAN & TATA TERTIB HUNIAN */}
          <div className="bg-white border border-[#E2E8F0] p-6 rounded-[24px] space-y-6 shadow-xs text-left">
            <h3 className="text-sm font-black text-[#3A444D] uppercase tracking-tight flex items-center gap-2">
              <span className="w-1.5 h-4 bg-[#2E6F40] rounded-full"></span>
              Kebijakan & Peraturan Hunian
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#F8FAFC] border border-[#E2E8F0] p-5 rounded-2xl space-y-2.5">
                <h4 className="font-extrabold text-[#2E6F40] font-sans text-xs flex items-center gap-1.5">
                  <BookOpen size={14} className="text-[#2E6F40]" />
                  Aturan Tambahan Penghuni
                </h4>
                <p className="text-[#64748B] font-medium text-[11px] leading-relaxed whitespace-pre-line">
                  {resolvedProperty.additional_rules ||
                    '1. Tamu lawan jenis dilarang menginap.\n2. Tidak boleh membawa binatang peliharaan.\n3. Harap menghormati privasi sesama penghuni kos.'}
                </p>
              </div>

              <div className="bg-[#F8FAFC] border border-[#E2E8F0] p-5 rounded-2xl space-y-2.5">
                <h4 className="font-extrabold text-[#2E6F40] font-sans text-xs flex items-center gap-1.5">
                  <Shield size={14} className="text-[#2E6F40]" />
                  Kebijakan Hunian
                </h4>
                <p className="text-[#64748B] font-medium text-[11px] leading-relaxed whitespace-pre-line">
                  {resolvedProperty.policies ||
                    'Masa tinggal minimal ditentukan saat check-in awal. Pengembalian dana sisa masa sewa mengikuti aturan tertulis yang berlaku.'}
                </p>
              </div>

              <div className="bg-[#F8FAFC] border border-[#E2E8F0] p-5 rounded-2xl space-y-2.5">
                <h4 className="font-extrabold text-[#2E6F40] font-sans text-xs flex items-center gap-1.5">
                  <Info size={14} className="text-[#2E6F40]" />
                  Ketentuan Sewa & Deposit Gedung
                </h4>
                <p className="text-[#64748B] font-medium text-[11px] leading-relaxed whitespace-pre-line">
                  {(resolvedProperty.terms
                    ? resolvedProperty.terms.replace(/\[DEPOSIT:\d+\]/g, '').trim()
                    : '') ||
                    `Uang jaminan deposit (refundable) sebesar ${formatRupiah(resolvedProperty.deposit_amount ?? 500000)} wajib dilunasi sebelum serah terima kunci properti dan disetujui pengelola.`}
                </p>
              </div>

              <div className="bg-[#F8FAFC] border border-[#E2E8F0] p-5 rounded-2xl space-y-2.5">
                <h4 className="font-extrabold text-[#2E6F40] font-sans text-xs flex items-center gap-1.5">
                  <Clock size={14} className="text-[#2E6F40]" />
                  Tata Tertib Lingkungan
                </h4>
                <p className="text-[#64748B] font-medium text-[11px] leading-relaxed whitespace-pre-line">
                  {resolvedProperty.regulations ||
                    '1. Jam kunjung tamu dibatasi hingga pukul 22:00 WIB.\n2. Dilarang membuat kegaduhan suara setelah jam malam.\n3. Sampah wajib dibuang pada tempatnya.'}
                </p>
              </div>
            </div>
          </div>

          {/* INFO SINGKAT */}
          <div className="bg-white border border-[#E2E8F0] p-6 rounded-[24px] space-y-4 shadow-xs text-left">
            <h3 className="text-sm font-black text-[#3A444D] uppercase tracking-tight flex items-center gap-2">
              <span className="w-1.5 h-4 bg-[#2E6F40] rounded-full"></span>
              Info Singkat
            </h3>
            {(() => {
              const activeNameLower = resolvedProperty.name.toLowerCase();
              const isTiaraCempakaActive =
                activeNameLower.includes('ciputra') ||
                activeNameLower.includes('cempaka') ||
                activeNameLower.includes('tiara');
              const isAtikahActive =
                !isTiaraCempakaActive &&
                (activeNameLower.includes('atikah') ||
                  activeNameLower.includes('atika') ||
                  activeNameLower.includes('kemayoran') ||
                  activeNameLower.includes('putri'));
              return (
                <div className="space-y-3">
                  <div className={`grid gap-3 ${isAtikahActive ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2'}`}>
                    <div className="bg-[#F8FAFC] p-4 rounded-2xl text-center space-y-1 border border-[#F1F5F9] shadow-2xs">
                      <div className="text-2xl font-black text-[#1E293B] font-display">
                        {(() => {
                          const uniqueTypes = new Set(propertyRooms.map((r) => r.room_type));
                          return uniqueTypes.size || 3;
                        })()}
                      </div>
                      <div className="text-[10px] text-[#64748B] font-bold uppercase tracking-wider font-sans">
                        Tipe Kamar
                      </div>
                    </div>
                    <div className="bg-[#F8FAFC] p-4 rounded-2xl text-center space-y-1 border border-[#F1F5F9] shadow-2xs">
                      <div className="text-2xl font-black text-[#1E293B] font-display">4.9★</div>
                      <div className="text-[10px] text-[#64748B] font-bold uppercase tracking-wider font-sans">
                        Rating
                      </div>
                    </div>
                    {isAtikahActive && (
                      <a
                        href="https://www.airbnb.co.id/users/profile/1469644070216777538?previous_page_name=PdpHomeMarketplace"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-[#FFF8F9] hover:bg-[#FFEBEF] border border-[#FF385C]/35 p-4 rounded-2xl text-center flex flex-col items-center justify-center space-y-1 transition-all group cursor-pointer shadow-2xs"
                      >
                        <div className="flex items-center gap-1.5 text-[#FF385C] font-extrabold text-sm group-hover:scale-105 transition-transform">
                          <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 32 32">
                            <path d="M16 1c2.008 0 3.463.963 4.751 3.269l.533 1.025c1.954 3.83 6.114 12.54 7.1 14.836l.145.353c.667 1.591.91 2.472.96 3.396l.011.315c0 4.298-3.322 7.806-7.5 7.806-3.13 0-5.836-1.956-6.953-4.758l-.147-.384-.131-.383C13.782 29.28 11.027 31.25 7.8 31.25 3.522 31.25.2 27.742.2 23.444c0-1.127.283-2.222.844-3.332l.272-.505c1.036-1.84 5.37-10.824 7.382-14.814l.551-1.058C10.537 1.963 11.992 1 14 1zm0 2c-1.11 0-2.072.585-3.082 2.387l-.46.884c-1.97 3.908-6.241 12.782-7.243 14.562l-.213.394c-.426.84-.602 1.623-.602 2.217 0 3.197 2.483 5.806 5.6 5.806 2.502 0 4.678-1.637 5.385-4.084l.113-.424.113-.424C12.392 20.355 13.9 18.5 16 18.5s3.608 1.855 4.194 5.815l.113.424.113.424c.707 2.447 2.883 4.084 5.385 4.084 3.117 0 5.6-2.609 5.6-5.806 0-.594-.176-1.377-.602-2.217l-.213-.394c-1.002-1.78-5.273-10.654-7.243-14.562l-.46-.884C21.072 3.585 20.11 3 19 3zm0 17.5c-1.105 0-2 .895-2 2s.895 2 2 2 2-.895 2-2-.895-2-2-2z" />
                          </svg>
                          <span>Sewa Airbnb</span>
                        </div>
                        <div className="text-[10px] text-[#FF385C] font-extrabold uppercase tracking-wider font-sans flex items-center gap-1">
                          <span>Pesan Harian</span>
                          <ExternalLink size={10} />
                        </div>
                      </a>
                    )}
                  </div>

                  {isAtikahActive && (
                    <div className="bg-[#FFF8F9] border border-[#FF385C]/20 rounded-2xl p-3.5 text-left space-y-1">
                      <div className="flex items-center gap-1.5 text-[#FF385C] font-extrabold text-xs">
                        <Sparkles size={13} className="text-[#FF385C] shrink-0" />
                        <span>Pesan Kamar Harian via Airbnb</span>
                      </div>
                      <p className="text-[#484848] text-[11px] leading-relaxed font-medium">
                        Khusus Urban hub kos ({resolvedProperty.name}): Menyediakan layanan sewa kamar harian fully furnished (AC, Smart TV, Wi-Fi kencang, & kamar mandi dalam) dengan fasilitas check-in instan mandiri melalui Airbnb.
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Immersive 360° Virtual Tour section */}
          {onOpenVirtualTour && (
            <div className="bg-white border border-[#E2E8F0] p-6 rounded-[24px] space-y-4 shadow-xs text-left">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="space-y-1">
                  <span className="text-[9px] font-black font-mono text-[#2E6F40] uppercase tracking-wider block">
                    IMMERSIVE EXPERIENCE
                  </span>
                  <h3 className="text-sm font-extrabold text-[#3A444D] uppercase tracking-tight flex items-center gap-1.5">
                    <RotateCw size={14} className="text-indigo-400" />
                    360° Virtual Room Tour
                  </h3>
                  <p className="text-[11px] text-[#64748B] font-medium">
                    Eksplorasi fisik isi kamar secara menyeluruh dalam tampilan panorama interaktif.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onOpenVirtualTour}
                  className="bg-[#2E6F40] hover:bg-[#235531] text-white font-extrabold px-4.5 py-2.5 rounded-xl text-xs tracking-wide uppercase shadow-sm transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Play size={13} className="fill-white" />
                  Mulai Virtual Tour
                </button>
              </div>

              <div className="relative h-44 rounded-2xl overflow-hidden bg-[#F8FAFC] border border-[#E2E8F0] select-none flex items-center justify-center">
                <img
                  src="https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80"
                  alt="Panoramic Preview"
                  className="w-full h-full object-cover opacity-35 filter blur-[1px]"
                />
                <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-1">
                  <RotateCw size={24} className="text-[#64748B] animate-spin" />
                  <span className="text-[10px] font-bold text-[#3A444D] uppercase tracking-widest font-mono">
                    360° Panorama Live Player
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Lokasi & Sekitar (Fasilitas Publik Terdekat) */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-[#3A444D] uppercase tracking-wider font-sans flex items-center gap-2">
              <MapPinned size={14} className="text-[#2E6F40]" />
              Lokasi & Sekitar (Hotspots)
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              <PropertyNearbyPlaces property={resolvedProperty} onOpenFullMap={onOpenFullMap} />
              <PropertyDetailMap property={resolvedProperty} onOpenFullMap={onOpenFullMap} />
            </div>
          </div>
        </div>

        {/* Right Booking Column (PILIHAN TIPE KAMAR & PRICING SHEET) (col-span-4) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white border border-[#E2E8F0] rounded-[24px] p-6 space-y-5 shadow-sm sticky top-[135px] text-left">
            {activeRoom ? (
              <div className="space-y-4 animate-fade-in">
                <div className="border-b border-[#F1F5F9] pb-3">
                  <span className="text-[10px] text-[#2E6F40] font-mono font-bold uppercase tracking-wider block">
                    ASISTEN RESERVASI
                  </span>
                  <h3 className="text-base font-black text-[#3A444D] uppercase tracking-tight">
                    Kamar Terpilih
                  </h3>
                  <p className="text-[11px] text-[#64748B] font-medium mt-0.5">
                    Konfirmasi tipe sewa dan rincian harga sewa Anda langsung di bawah ini:
                  </p>
                </div>

                <div
                  onClick={() => onInspectRoomDetail && onInspectRoomDetail(activeRoom)}
                  className="bg-[#F8FAFC] hover:bg-emerald-50/50 p-3.5 rounded-2xl border border-[#E2E8F0] hover:border-[#2E6F40] transition-all flex items-center justify-between gap-3 cursor-pointer group/activebox"
                  title="Klik untuk melihat foto & detail lengkap unit ini"
                >
                  <div className="flex gap-3 items-center">
                    {activeRoom.image_url ? (
                      <div className="relative w-14 h-14 rounded-xl overflow-hidden border border-slate-300 shrink-0">
                        <img
                          src={activeRoom.image_url}
                          alt={`Kamar ${activeRoom.room_number}`}
                          className="w-full h-full object-cover group-hover/activebox:scale-110 transition-transform duration-300"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80';
                          }}
                        />
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-300 flex items-center justify-center shrink-0">
                        <Bed size={16} className="text-[#64748B]" />
                      </div>
                    )}
                    <div>
                      <div className="font-extrabold text-[#3A444D] text-xs flex items-center gap-1.5">
                        <span>Unit {activeRoom.room_number}</span>
                        <span className="text-[9px] bg-[#2E6F40]/10 text-[#2E6F40] px-1.5 py-0.5 rounded font-mono font-bold">
                          {activeRoom.room_type}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#64748B] mt-0.5">
                        Lantai {activeRoom.floor} / {activeRoom.size_sqm}m²
                      </div>
                      <div className="text-[10px] text-[#2E6F40] font-bold flex items-center gap-1 mt-0.5">
                        <Info size={11} />
                        <span>
                          Lihat Galeri Foto (
                          {[activeRoom.image_url, ...(activeRoom.images || [])].filter(Boolean).length} Foto)
                        </span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight
                    size={16}
                    className="text-[#2E6F40] group-hover/activebox:translate-x-0.5 transition-transform shrink-0"
                  />
                </div>

                {/* Quick Calculator */}
                <div className="bg-[#F8FAFC] p-4 rounded-2xl border border-[#E2E8F0] text-[11px] space-y-2.5 font-mono min-w-0 overflow-hidden">
                  <div className="flex justify-between items-center gap-2 min-w-0">
                    <span className="text-[#64748B] shrink-0">Skema Sewa</span>
                    <span className="text-[#2E6F40] font-bold text-right truncate">
                      Bulanan (Sewa Tetap)
                    </span>
                  </div>
                  <div className="flex justify-between items-center gap-2 border-t border-[#E2E8F0] pt-1.5 min-w-0">
                    <span className="text-[#64748B] shrink-0">Tarif Kamar Bulanan</span>
                    <span className="text-[#3A444D] tabular-nums text-right">
                      {formatRupiah(activeRoom.price)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center gap-2 min-w-0">
                    <span className="text-[#64748B] shrink-0">Deposit Gedung (Refundable)</span>
                    <span className="text-[#3A444D] tabular-nums text-right">
                      {formatRupiah(resolvedProperty.deposit_amount ?? 500000)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center gap-2 border-t border-[#E2E8F0] pt-1.5 font-bold min-w-0">
                    <span className="text-[#2E6F40] shrink-0">Total Awal Masuk</span>
                    <span className="text-[#2E6F40] tabular-nums text-right">
                      {formatRupiah(activeRoom.price + (resolvedProperty.deposit_amount ?? 500000))}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectRoom && onSelectRoom(activeRoom, 'monthly')}
                  className="w-full py-3 bg-[#2E6F40] hover:bg-[#235531] text-white text-xs font-black uppercase tracking-wider rounded-xl transition shadow-xs cursor-pointer text-center"
                >
                  Lanjutkan Formulir Pemesanan
                </button>

                <button
                  type="button"
                  onClick={() => onSelectRoom && onSelectRoom(null)}
                  className="w-full py-2.5 bg-white hover:bg-[#F8FAFC] text-[#3A444D] text-xs font-bold uppercase tracking-wide rounded-xl border border-[#E2E8F0] cursor-pointer text-center"
                >
                  Pilih Unit Kamar Lain
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="border-b border-[#F1F5F9] pb-3">
                  <span className="text-[10px] text-[#2E6F40] font-mono font-bold uppercase tracking-wider block">
                    PEMESANAN INSTAN
                  </span>
                  <h3 className="text-sm font-black text-[#3A444D] uppercase tracking-tight">
                    Samara Booking Center
                  </h3>
                  <p className="text-[11px] text-[#64748B] font-medium mt-0.5">
                    Gunakan platform online terpercaya untuk memesan kamar di {renamedCategoryLabel}:
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex gap-2.5 bg-[#F8FAFC] p-3.5 rounded-2xl border border-[#E2E8F0]">
                    <Shield className="text-[#2E6F40] shrink-0 mt-0.5" size={15} />
                    <div>
                      <h4 className="text-[#3A444D] font-extrabold text-xs">Bebas Biaya Administrasi</h4>
                      <p className="text-[11px] text-[#64748B] leading-normal">
                        Semua booking kamar di Samara Stay tidak dipungut biaya admin tersembunyi.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2.5 bg-[#F8FAFC] p-3.5 rounded-2xl border border-[#E2E8F0]">
                    <CheckCircle className="text-[#2E6F40] shrink-0 mt-0.5" size={15} />
                    <div>
                      <h4 className="text-[#3A444D] font-extrabold text-xs">Data Unit Terverifikasi</h4>
                      <p className="text-[11px] text-[#64748B] leading-normal">
                        Status dan harga yang tertera adalah data terkini langsung dari sistem super admin.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2.5 bg-[#F8FAFC] p-3.5 rounded-2xl border border-[#E2E8F0]">
                    <Sparkles className="text-[#2E6F40] shrink-0 mt-0.5" size={15} />
                    <div>
                      <h4 className="text-[#3A444D] font-extrabold text-xs">Jaminan Keamanan Kamar</h4>
                      <p className="text-[11px] text-[#64748B] leading-normal">
                        Kunci kamar terintegrasi & sistem backup kelistrikan optimal 24 jam nonstop.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-[#2E6F40]/5 rounded-2xl border border-[#2E6F40]/10 text-center space-y-1.5">
                  <p className="text-[#2E6F40] font-extrabold text-[11px] uppercase tracking-wider">
                    Mulai Reservasi Anda
                  </p>
                  <p className="text-[#64748B] text-[10px] leading-relaxed">
                    Klik tombol di bawah ini untuk membuka katalog kamar dan memilih unit yang Anda inginkan!
                  </p>
                  {onOpenRoomCatalogModal && (
                    <button
                      type="button"
                      onClick={onOpenRoomCatalogModal}
                      className="mt-1 inline-flex items-center gap-1.5 text-xs font-black text-[#2E6F40] hover:text-[#235531] uppercase tracking-wider cursor-pointer"
                    >
                      <span>Pilih Unit Kamar</span>
                      <ArrowRight size={12} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PropertyDetailView;
