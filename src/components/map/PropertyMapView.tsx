import React, { useState, useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import { Property, Room, NearbyAmenity, AmenityCategory } from '../../types';
import { database } from '../../lib/supabase';
import { 
  AMENITY_CATEGORIES, 
  INITIAL_NEARBY_AMENITIES, 
  getAmenitiesForProperty,
  AmenityCategoryConfig,
  calculateDistanceMeters
} from '../../data/nearbyAmenities';
import { 
  MapPin, 
  Building2, 
  Navigation, 
  Train, 
  Bus, 
  GraduationCap, 
  Hospital, 
  ShoppingBag, 
  Coffee, 
  Sparkles, 
  Moon, 
  Search, 
  Layers, 
  Eye, 
  CheckCircle, 
  ArrowRight, 
  ExternalLink, 
  Compass, 
  Maximize2, 
  Minimize2,
  Calendar,
  Bed,
  Info,
  ChevronRight,
  Filter,
  Route,
  Clock,
  Car
} from 'lucide-react';

interface PropertyMapViewProps {
  properties: Property[];
  rooms: Room[];
  selectedPropertyId?: number | null;
  onSelectProperty: (property: Property) => void;
  onSelectRoomBooking?: (room: Room, property: Property) => void;
  onScheduleSurvey?: (property: Property) => void;
  lang?: 'id' | 'en';
}

type MapLayerType = 'light' | 'voyager' | 'osm' | 'satellite';

const MAP_LAYERS: Record<MapLayerType, { name: string; url: string; attribution: string; maxZoom: number }> = {
  light: {
    name: 'Carto Light (Bersih)',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    maxZoom: 20
  },
  voyager: {
    name: 'Carto Voyager (Warna)',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    maxZoom: 20
  },
  osm: {
    name: 'OpenStreetMap Standar',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  },
  satellite: {
    name: 'Satelit Esri Imagery',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxZoom: 18
  }
};

export const PropertyMapView: React.FC<PropertyMapViewProps> = ({
  properties,
  rooms,
  selectedPropertyId,
  onSelectProperty,
  onSelectRoomBooking,
  onScheduleSurvey,
  lang = 'id'
}) => {
  // Active selected property state
  const [activePropId, setActivePropId] = useState<number | null>(
    selectedPropertyId || (properties.length > 0 ? properties[0].id : null)
  );

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<AmenityCategory | 'all'>('all');
  const [radiusFilter, setRadiusFilter] = useState<number>(2000); // 2000m (2km) default
  const [showRadiusCircle, setShowRadiusCircle] = useState(true);
  const [activeLayer, setActiveLayer] = useState<MapLayerType>('light');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'properties' | 'amenities'>('amenities');
  const [hoveredAmenityId, setHoveredAmenityId] = useState<string | null>(null);

  // Map DOM and Leaflet References
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const propertyMarkersRef = useRef<Record<number, L.Marker>>({});
  const amenityMarkersRef = useRef<Record<string, L.Marker>>({});
  const radiusCircleRef = useRef<L.Circle | null>(null);

  // Active property object
  const activeProperty = useMemo(() => {
    return properties.find(p => p.id === activePropId) || properties[0] || null;
  }, [properties, activePropId]);

  // Database amenities state
  const [dbAmenities, setDbAmenities] = useState<NearbyAmenity[]>(INITIAL_NEARBY_AMENITIES);
  const [isLoadingAmenities, setIsLoadingAmenities] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadAmenities = async () => {
      setIsLoadingAmenities(true);
      try {
        const fetched = await database.fetchNearbyAmenities();
        if (isMounted && fetched && fetched.length > 0) {
          setDbAmenities(fetched);
        }
      } catch (err) {
        console.warn('Could not load amenities from Supabase, using initial data:', err);
      } finally {
        if (isMounted) setIsLoadingAmenities(false);
      }
    };
    loadAmenities();
    return () => {
      isMounted = false;
    };
  }, [activePropId]);

  // Sync active property with prop
  useEffect(() => {
    if (selectedPropertyId && selectedPropertyId !== activePropId) {
      setActivePropId(selectedPropertyId);
    }
  }, [selectedPropertyId]);

  // Calculated amenities for the active property
  const activePropertyAmenities = useMemo(() => {
    if (!activeProperty) return [];
    return getAmenitiesForProperty(activeProperty, dbAmenities);
  }, [activeProperty, dbAmenities]);

  // Filtered amenities according to category, radius, and search query
  const filteredAmenities = useMemo(() => {
    return activePropertyAmenities.filter(amenity => {
      const matchCategory = selectedCategory === 'all' || amenity.category === selectedCategory;
      const matchRadius = radiusFilter === 0 || amenity.distanceMeters <= radiusFilter;
      const matchSearch = !searchQuery.trim() || 
        amenity.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        amenity.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        amenity.address?.toLowerCase().includes(searchQuery.toLowerCase());

      return matchCategory && matchRadius && matchSearch;
    });
  }, [activePropertyAmenities, selectedCategory, radiusFilter, searchQuery]);

  // Format IDR Currency
  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);
  };

  // Helper to render Amenity Icon
  const getAmenityCategoryIcon = (category: AmenityCategory, size = 14) => {
    switch (category) {
      case 'transit': return <Train size={size} className="text-sky-600" />;
      case 'education': return <GraduationCap size={size} className="text-purple-600" />;
      case 'healthcare': return <Hospital size={size} className="text-rose-600" />;
      case 'shopping': return <ShoppingBag size={size} className="text-amber-600" />;
      case 'dining': return <Coffee size={size} className="text-orange-600" />;
      case 'worship': return <Moon size={size} className="text-emerald-600" />;
      case 'lifestyle': return <Sparkles size={size} className="text-teal-600" />;
      default: return <MapPin size={size} className="text-slate-600" />;
    }
  };

  // -------------------------------------------------------------
  // 1. LEAFLET MAP INITIALIZATION & TILE LAYER MANAGEMENT
  // -------------------------------------------------------------
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const initialLat = activeProperty?.lat || -6.2000;
      const initialLng = activeProperty?.lng || 106.8450;

      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: 15,
        zoomControl: false,
        attributionControl: false
      });

      // Custom zoom control in bottom right
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      // Attribution
      L.control.attribution({ position: 'bottomleft', prefix: false })
        .addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>')
        .addTo(map);

      // Base Tile Layer
      const layerConfig = MAP_LAYERS[activeLayer];
      const tileLayer = L.tileLayer(layerConfig.url, {
        attribution: layerConfig.attribution,
        maxZoom: layerConfig.maxZoom,
        subdomains: 'abcd'
      }).addTo(map);

      tileLayerRef.current = tileLayer;
      mapInstanceRef.current = map;

      // Handle ResizeObserver for smooth container resizes
      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => {
          try {
            map.invalidateSize();
          } catch (e) {}
        });
        ro.observe(mapContainerRef.current);
      }
    }

    return () => {
      // Cleanup on unmount
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (e) {
          console.warn('[Leaflet Cleanup] Error removing map:', e);
        }
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update Tile Layer when layer switch changed
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const layerConfig = MAP_LAYERS[activeLayer];
    const newLayer = L.tileLayer(layerConfig.url, {
      attribution: layerConfig.attribution,
      maxZoom: layerConfig.maxZoom,
      subdomains: 'abcd'
    }).addTo(map);

    tileLayerRef.current = newLayer;
  }, [activeLayer]);

  // -------------------------------------------------------------
  // 2. RENDER PROPERTY MARKERS & RADIUS CIRCLE
  // -------------------------------------------------------------
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear old property markers
    (Object.values(propertyMarkersRef.current) as L.Marker[]).forEach(m => m.remove());
    propertyMarkersRef.current = {};

    // Remove old radius circle
    if (radiusCircleRef.current) {
      radiusCircleRef.current.remove();
      radiusCircleRef.current = null;
    }

    // Add Markers for all properties
    properties.forEach(prop => {
      const lat = prop.lat || -6.2000;
      const lng = prop.lng || 106.8450;
      const isSelected = prop.id === activePropId;
      const propRooms = rooms.filter(r => r.property_id === prop.id);
      const availableRoomsCount = propRooms.filter(r => r.status === 'available' || !r.status).length;

      const propIcon = L.divIcon({
        className: 'custom-property-leaflet-marker',
        html: `
          <div class="flex flex-col items-center cursor-pointer transition-transform duration-300 ${isSelected ? 'scale-110 z-[1000]' : 'hover:scale-105 z-[500]'}">
            <!-- Property Badge Bubble -->
            <div class="px-3 py-1.5 rounded-2xl shadow-xl border-2 flex items-center gap-2 whitespace-nowrap ${
              isSelected
                ? 'bg-[#2E6F40] text-white border-white ring-4 ring-[#2E6F40]/30 font-black'
                : 'bg-white text-[#1E293B] border-[#2E6F40] hover:bg-[#F8FAFC]'
            }">
              <div class="w-2.5 h-2.5 rounded-full ${isSelected ? 'bg-amber-400 animate-ping' : 'bg-[#2E6F40]'}"></div>
              <span class="text-xs font-bold font-sans">${prop.name}</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded font-mono ${
                isSelected ? 'bg-black/30 text-amber-300' : 'bg-emerald-50 text-[#2E6F40] font-bold'
              }">
                ${availableRoomsCount} Kosong
              </span>
            </div>
            
            <!-- Pin Pointer Tail -->
            <div class="w-4 h-4 transform rotate-45 -mt-2 border-r-2 border-b-2 ${
              isSelected ? 'bg-[#2E6F40] border-white shadow-md' : 'bg-white border-[#2E6F40]'
            }"></div>
          </div>
        `,
        iconSize: [200, 60],
        iconAnchor: [100, 50]
      });

      const marker = L.marker([lat, lng], { icon: propIcon, zIndexOffset: isSelected ? 1000 : 500 })
        .addTo(map)
        .on('click', () => {
          setActivePropId(prop.id);
          onSelectProperty(prop);
          map.flyTo([lat, lng], 16, { duration: 1.2 });
        });

      // Bind Pop-up
      const popupContent = `
        <div style="font-family: system-ui, -apple-system, sans-serif; padding: 6px; min-width: 240px;">
          <div style="position: relative; border-radius: 12px; overflow: hidden; height: 110px; margin-bottom: 8px; background: #f1f5f9;">
            <img src="${prop.image_url || 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80'}" 
                 style="width: 100%; height: 100%; object-fit: cover;" 
                 alt="${prop.name}" />
            <div style="position: absolute; top: 6px; left: 6px; background: rgba(0,0,0,0.75); color: white; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 6px; text-transform: uppercase;">
              Tipe ${prop.type || 'Campur'}
            </div>
          </div>
          <h4 style="font-size: 13px; font-weight: 800; color: #1e293b; margin: 0 0 4px 0;">${prop.name}</h4>
          <p style="font-size: 11px; color: #64748b; margin: 0 0 8px 0; line-height: 1.3;">${prop.address}</p>
          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #e2e8f0; padding-top: 8px;">
            <span style="font-size: 12px; font-weight: 900; color: #2E6F40; font-family: monospace;">
              ${formatRupiah(prop.price)} <span style="font-size: 9px; font-weight: normal; color: #64748b;">/bln</span>
            </span>
            <span style="font-size: 10px; font-weight: 800; color: #059669; background: #ecfdf5; padding: 2px 6px; border-radius: 6px;">
              ${availableRoomsCount} Unit Siap Huni
            </span>
          </div>
        </div>
      `;
      marker.bindPopup(popupContent, { offset: [0, -35] });

      propertyMarkersRef.current[prop.id] = marker;
    });

    // Render Radius Circle around active property
    if (activeProperty && showRadiusCircle && radiusFilter > 0) {
      const lat = activeProperty.lat || -6.2000;
      const lng = activeProperty.lng || 106.8450;

      const circle = L.circle([lat, lng], {
        radius: radiusFilter,
        color: '#2E6F40',
        weight: 1.5,
        opacity: 0.8,
        fillColor: '#2E6F40',
        fillOpacity: 0.08,
        dashArray: '6, 6'
      }).addTo(map);

      radiusCircleRef.current = circle;
    }

  }, [properties, activePropId, activeProperty, showRadiusCircle, radiusFilter, rooms]);

  // -------------------------------------------------------------
  // 3. RENDER NEARBY AMENITY MARKERS
  // -------------------------------------------------------------
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear old amenity markers
    (Object.values(amenityMarkersRef.current) as L.Marker[]).forEach(m => m.remove());
    amenityMarkersRef.current = {};

    // Render filtered amenities
    filteredAmenities.forEach(amenity => {
      const categoryConfig = AMENITY_CATEGORIES.find(c => c.id === amenity.category) || AMENITY_CATEGORIES[0];
      const isHovered = hoveredAmenityId === amenity.id;

      // Icon emoji or mini letter based on category
      let categoryEmoji = '📍';
      if (amenity.category === 'transit') categoryEmoji = '🚆';
      else if (amenity.category === 'education') categoryEmoji = '🎓';
      else if (amenity.category === 'healthcare') categoryEmoji = '🏥';
      else if (amenity.category === 'shopping') categoryEmoji = '🛍️';
      else if (amenity.category === 'dining') categoryEmoji = '☕';
      else if (amenity.category === 'worship') categoryEmoji = '🕌';
      else if (amenity.category === 'lifestyle') categoryEmoji = '🌿';

      const amenityIcon = L.divIcon({
        className: 'custom-amenity-leaflet-marker',
        html: `
          <div class="flex flex-col items-center cursor-pointer transition-all duration-300 ${isHovered ? 'scale-125 z-[900]' : 'hover:scale-115 z-[300]'}">
            <div class="px-2 py-1 rounded-xl shadow-lg border flex items-center gap-1.5 whitespace-nowrap bg-white text-[#1E293B] border-slate-200 hover:border-slate-400">
              <span class="text-xs">${categoryEmoji}</span>
              <span class="text-[10px] font-bold font-sans max-w-[130px] truncate">${amenity.name}</span>
              <span class="text-[9px] px-1 py-0.2 rounded font-mono font-bold" style="background-color: ${categoryConfig.bgColor}; color: ${categoryConfig.color};">
                ${amenity.distanceMeters}m
              </span>
            </div>
            <div class="w-2.5 h-2.5 transform rotate-45 -mt-1.5 bg-white border-r border-b border-slate-200"></div>
          </div>
        `,
        iconSize: [160, 40],
        iconAnchor: [80, 35]
      });

      const marker = L.marker([amenity.lat, amenity.lng], { icon: amenityIcon, zIndexOffset: isHovered ? 900 : 300 })
        .addTo(map);

      // Popup for amenity
      const popupHtml = `
        <div style="font-family: system-ui, -apple-system, sans-serif; padding: 4px; min-width: 220px;">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
            <span style="font-size: 14px;">${categoryEmoji}</span>
            <span style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: ${categoryConfig.color}; background: ${categoryConfig.bgColor}; padding: 2px 6px; border-radius: 4px;">
              ${lang === 'id' ? categoryConfig.labelId : categoryConfig.labelEn}
            </span>
          </div>
          <h5 style="font-size: 12px; font-weight: 800; color: #1e293b; margin: 0 0 3px 0;">${amenity.name}</h5>
          <p style="font-size: 10px; color: #64748b; margin: 0 0 6px 0; line-height: 1.3;">${amenity.description || amenity.address || ''}</p>
          
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px; margin-bottom: 8px; font-size: 10px; display: flex; justify-content: space-between;">
            <span style="color: #475569; font-weight: 600;">🚶‍♂️ ${amenity.walkingTimeMinutes} Menit Jalan Kaki</span>
            <span style="font-weight: 800; color: #2E6F40;">${amenity.distanceMeters} Meter</span>
          </div>

          <a href="https://www.google.com/maps/dir/?api=1&destination=${amenity.lat},${amenity.lng}" 
             target="_blank" 
             rel="noreferrer"
             style="display: block; text-align: center; background: #2E6F40; color: white; font-size: 10px; font-weight: 800; padding: 6px; border-radius: 6px; text-decoration: none; text-transform: uppercase; letter-spacing: 0.5px;">
            Petunjuk Arah (Google Maps) ↗
          </a>
        </div>
      `;
      marker.bindPopup(popupHtml, { offset: [0, -25] });

      amenityMarkersRef.current[amenity.id] = marker;
    });

  }, [filteredAmenities, hoveredAmenityId, lang]);

  // -------------------------------------------------------------
  // 4. MAP NAVIGATION HELPERS
  // -------------------------------------------------------------
  const handleFlyToProperty = (prop: Property) => {
    setActivePropId(prop.id);
    onSelectProperty(prop);
    if (mapInstanceRef.current && prop.lat && prop.lng) {
      mapInstanceRef.current.flyTo([prop.lat, prop.lng], 16, { duration: 1.2 });
      // Open Property Popup
      const m = propertyMarkersRef.current[prop.id];
      if (m) {
        setTimeout(() => m.openPopup(), 1300);
      }
    }
  };

  const handleFitAllProperties = () => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const coords = properties
      .filter(p => p.lat && p.lng)
      .map(p => [p.lat!, p.lng!] as [number, number]);

    if (coords.length > 0) {
      const bounds = L.latLngBounds(coords);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
    }
  };

  const handleAmenityClick = (amenity: NearbyAmenity) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    map.flyTo([amenity.lat, amenity.lng], 17, { duration: 1.0 });
    const marker = amenityMarkersRef.current[amenity.id];
    if (marker) {
      setTimeout(() => marker.openPopup(), 1100);
    }
  };

  return (
    <div 
      className={`bg-white border border-[#E2E8F0] rounded-[28px] overflow-hidden shadow-xl flex flex-col transition-all duration-300 font-sans ${
        isFullscreen ? 'fixed inset-0 z-[200] rounded-none' : 'w-full h-[850px] relative my-6'
      }`}
      id="samara-stay-leaflet-property-map-view"
    >
      {/* ------------------------------------------------------ */}
      {/* TOP BAR / CONTROL HEADER */}
      {/* ------------------------------------------------------ */}
      <div className="bg-[#3A444D] text-white px-5 py-4 flex flex-wrap justify-between items-center gap-4 border-b border-white/10 z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#2E6F40] text-white flex items-center justify-center shadow-md">
            <Compass size={22} className="animate-spin-slow text-emerald-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold font-display tracking-tight text-white uppercase">
                {lang === 'id' ? 'PETA INTERAKTIF SAMARA STAY' : 'SAMARA STAY INTERACTIVE MAP'}
              </h2>
              <span className="bg-[#2E6F40] text-emerald-200 text-[10px] font-black px-2 py-0.5 rounded-full font-mono uppercase tracking-wider">
                LEAFLET.JS POWERED
              </span>
            </div>
            <p className="text-xs text-slate-300 font-medium">
              {lang === 'id' 
                ? 'Eksplorasi lokasi seluruh cabang & akses fasilitas umum terdekat secara visual' 
                : 'Explore all property branches & nearby public amenities interactively'}
            </p>
          </div>
        </div>

        {/* Quick Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Layer Selector */}
          <div className="flex items-center bg-black/30 p-1 rounded-xl border border-white/15 text-xs">
            <Layers size={13} className="text-emerald-400 mx-2" />
            <select
              value={activeLayer}
              onChange={(e) => setActiveLayer(e.target.value as MapLayerType)}
              className="bg-transparent text-white text-xs font-bold focus:outline-none pr-2 cursor-pointer"
            >
              <option value="light" className="text-slate-900">Peta Bersih (Light)</option>
              <option value="voyager" className="text-slate-900">Peta Warna (Voyager)</option>
              <option value="osm" className="text-slate-900">OpenStreetMap</option>
              <option value="satellite" className="text-slate-900">Citra Satelit</option>
            </select>
          </div>

          {/* Fit All Bounds Button */}
          <button
            onClick={handleFitAllProperties}
            className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-3 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer border border-white/10"
            title="Lihat Seluruh Cabang Properti"
          >
            <Maximize2 size={13} />
            <span>Semua Cabang</span>
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="bg-[#2E6F40] hover:bg-[#235531] text-white text-xs font-bold px-3 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            <span>{isFullscreen ? 'Tutup Fullscreen' : 'Layar Penuh'}</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------ */}
      {/* MAIN SPLIT VIEW (MAP + SIDEBAR PANEL) */}
      {/* ------------------------------------------------------ */}
      <div className="flex-1 flex flex-col lg:flex-row relative overflow-hidden">
        
        {/* ==================================================== */}
        {/* LEFT / CENTER: LEAFLET MAP CONTAINER */}
        {/* ==================================================== */}
        <div className="flex-1 relative h-[450px] lg:h-full w-full bg-slate-100">
          <div ref={mapContainerRef} className="w-full h-full z-10" />

          {/* Floating Property Jump Switcher (Overlaid at top of Map) */}
          <div className="absolute top-4 left-4 right-4 lg:right-auto z-[400] flex gap-2 overflow-x-auto no-scrollbar py-1">
            {properties.map(p => {
              const isSelected = p.id === activePropId;
              const pRooms = rooms.filter(r => r.property_id === p.id);
              const availCount = pRooms.filter(r => r.status === 'available' || !r.status).length;

              return (
                <button
                  key={p.id}
                  onClick={() => handleFlyToProperty(p)}
                  className={`px-3.5 py-2 rounded-2xl text-xs font-extrabold shadow-md backdrop-blur-md transition-all flex items-center gap-2 cursor-pointer shrink-0 border ${
                    isSelected
                      ? 'bg-[#2E6F40] text-white border-white ring-2 ring-[#2E6F40]/30 scale-105'
                      : 'bg-white/95 text-slate-800 border-slate-300 hover:bg-white hover:border-[#2E6F40]'
                  }`}
                >
                  <Building2 size={14} className={isSelected ? 'text-amber-300' : 'text-[#2E6F40]'} />
                  <span>{p.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                    isSelected ? 'bg-black/30 text-white' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {availCount} Unit
                  </span>
                </button>
              );
            })}
          </div>

          {/* Floating Category Filter Pills (Overlaid on Bottom Left of Map) */}
          <div className="absolute bottom-6 left-4 z-[400] bg-white/95 backdrop-blur-md border border-slate-200 p-2 rounded-2xl shadow-xl max-w-[calc(100%-2rem)] md:max-w-xl overflow-x-auto no-scrollbar flex items-center gap-1.5">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold uppercase tracking-wide transition-all shrink-0 cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-[#3A444D] text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              ✨ Semua Amenitas ({activePropertyAmenities.length})
            </button>

            {AMENITY_CATEGORIES.map(cat => {
              const count = activePropertyAmenities.filter(a => a.category === cat.id).length;
              const isSelected = selectedCategory === cat.id;

              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer border ${
                    isSelected
                      ? 'shadow-sm font-black'
                      : 'border-transparent text-slate-600 hover:bg-slate-100'
                  }`}
                  style={{
                    backgroundColor: isSelected ? cat.bgColor : undefined,
                    color: isSelected ? cat.color : undefined,
                    borderColor: isSelected ? cat.borderColor : undefined
                  }}
                >
                  {getAmenityCategoryIcon(cat.id, 12)}
                  <span>{lang === 'id' ? cat.labelId : cat.labelEn}</span>
                  <span className="text-[10px] font-mono opacity-80">({count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ==================================================== */}
        {/* RIGHT: INTERACTIVE AMENITIES & PROPERTY SIDEBAR */}
        {/* ==================================================== */}
        <div className="w-full lg:w-[420px] bg-[#F8FAFC] border-t lg:border-t-0 lg:border-l border-[#E2E8F0] flex flex-col h-[400px] lg:h-full z-20 text-left">
          
          {/* Active Property Card Header */}
          {activeProperty && (
            <div className="p-4 bg-white border-b border-[#E2E8F0] space-y-3 shrink-0">
              <div className="flex justify-between items-start gap-2">
                <div>
                  <span className="text-[10px] font-black font-mono text-[#2E6F40] uppercase tracking-wider block">
                    CABANG AKTIF TERPILIH
                  </span>
                  <h3 className="text-base font-extrabold text-[#1E293B] font-display">
                    {activeProperty.name}
                  </h3>
                  <p className="text-xs text-[#64748B] line-clamp-1 mt-0.5">
                    {activeProperty.address}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-extrabold text-[#2E6F40] font-mono block">
                    {formatRupiah(activeProperty.price)}
                  </span>
                  <span className="text-[10px] text-[#64748B]">per bulan</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                {onScheduleSurvey && (
                  <button
                    onClick={() => onScheduleSurvey(activeProperty)}
                    className="py-2 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer text-center"
                  >
                    <Calendar size={13} className="text-[#2E6F40]" />
                    <span>Jadwal Survey</span>
                  </button>
                )}
                <button
                  onClick={() => onSelectProperty(activeProperty)}
                  className="py-2 px-3 bg-[#2E6F40] hover:bg-[#235531] text-white rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs text-center"
                >
                  <Bed size={13} />
                  <span>Katalog Kamar</span>
                </button>
              </div>
            </div>
          )}

          {/* Filter & Search Bar */}
          <div className="p-3 bg-white border-b border-[#E2E8F0] space-y-2.5 shrink-0">
            {/* Search Input */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari stasiun, kampus, RS, kafe terdekat..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2E6F40]/30 transition-all font-medium text-slate-800"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Radius Distance Filter Chips */}
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1 shrink-0">
                <Route size={12} className="text-[#2E6F40]" />
                Radius:
              </span>
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                {[
                  { label: '500m', val: 500 },
                  { label: '1 km', val: 1000 },
                  { label: '2 km', val: 2000 },
                  { label: '5 km', val: 5000 },
                  { label: 'Semua', val: 0 }
                ].map(r => (
                  <button
                    key={r.val}
                    onClick={() => setRadiusFilter(r.val)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer ${
                      radiusFilter === r.val
                        ? 'bg-[#2E6F40] text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* List of Nearby Amenities (Scrollable) */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 divide-y divide-slate-100">
            <div className="flex justify-between items-center pb-1">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 font-mono">
                {filteredAmenities.length} FASILITAS TERDEKAT
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                Klik kartu untuk fokus di peta
              </span>
            </div>

            {filteredAmenities.map(amenity => {
              const catConfig = AMENITY_CATEGORIES.find(c => c.id === amenity.category) || AMENITY_CATEGORIES[0];
              const isHovered = hoveredAmenityId === amenity.id;

              return (
                <div
                  key={amenity.id}
                  onClick={() => handleAmenityClick(amenity)}
                  onMouseEnter={() => setHoveredAmenityId(amenity.id)}
                  onMouseLeave={() => setHoveredAmenityId(null)}
                  className={`p-3 rounded-2xl border transition-all duration-200 cursor-pointer text-left space-y-2 ${
                    isHovered
                      ? 'bg-white border-[#2E6F40] shadow-md ring-1 ring-[#2E6F40]/30 translate-x-1'
                      : 'bg-white border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex items-start gap-2.5">
                      <div 
                        className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 border"
                        style={{ backgroundColor: catConfig.bgColor, borderColor: catConfig.borderColor }}
                      >
                        {getAmenityCategoryIcon(amenity.category, 15)}
                      </div>
                      <div>
                        <h4 className="text-xs font-extrabold text-[#1E293B] leading-tight">
                          {amenity.name}
                        </h4>
                        <span 
                          className="inline-block text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.2 rounded mt-1"
                          style={{ backgroundColor: catConfig.bgColor, color: catConfig.color }}
                        >
                          {lang === 'id' ? catConfig.labelId : catConfig.labelEn}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-black font-mono text-[#2E6F40] block">
                        {amenity.distanceMeters} m
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium">
                        🚶‍♂️ {amenity.walkingTimeMinutes} mnt
                      </span>
                    </div>
                  </div>

                  {amenity.description && (
                    <p className="text-[11px] text-slate-500 leading-relaxed pl-10">
                      {amenity.description}
                    </p>
                  )}

                  <div className="flex justify-between items-center pt-1 border-t border-slate-100 pl-10 text-[10px]">
                    <span className="text-slate-400 flex items-center gap-1 font-mono">
                      <Car size={11} />
                      🛵 ~{amenity.drivingTimeMinutes || 2} mnt motor
                    </span>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${amenity.lat},${amenity.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[#2E6F40] hover:text-[#1e4b2a] font-bold flex items-center gap-1 hover:underline"
                    >
                      <span>Rute Google Maps</span>
                      <ExternalLink size={10} />
                    </a>
                  </div>
                </div>
              );
            })}

            {filteredAmenities.length === 0 && (
              <div className="p-8 text-center space-y-2 bg-white rounded-2xl border border-slate-200 my-4">
                <MapPin size={28} className="mx-auto text-slate-300 animate-bounce" />
                <p className="text-xs font-bold text-slate-600">Tidak ada fasilitas dalam radius ini</p>
                <p className="text-[11px] text-slate-400">Coba ubah filter kategori atau perbesar radius jarak pencarian.</p>
                <button
                  onClick={() => {
                    setSelectedCategory('all');
                    setRadiusFilter(5000);
                    setSearchQuery('');
                  }}
                  className="mt-2 text-xs text-[#2E6F40] font-bold uppercase hover:underline"
                >
                  Reset Semua Filter
                </button>
              </div>
            )}
          </div>

          {/* Footer Summary Info */}
          <div className="p-3 bg-white border-t border-[#E2E8F0] flex items-center justify-between text-[11px] text-slate-500 shrink-0">
            <span className="flex items-center gap-1 font-medium">
              <CheckCircle size={12} className="text-[#2E6F40]" />
              Data terverifikasi tim survey
            </span>
            <span className="font-mono text-[10px] text-slate-400">
              Leaflet v1.9.4
            </span>
          </div>

        </div>

      </div>
    </div>
  );
};

export default PropertyMapView;
