import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Property, Room, NearbyAmenity, AmenityCategory } from '../../types';
import { database } from '../../lib/supabase';
import { 
  AMENITY_CATEGORIES, 
  INITIAL_NEARBY_AMENITIES, 
  getAmenitiesForProperty,
  fetchNearbyAmenitiesFromOSM
} from '../../data/nearbyAmenities';
import {
  sanitizePropertyCoordinates,
  sanitizeAmenityCoordinates,
  isValidCoordinate,
  calculateDistanceMeters
} from '../../utils/mapCoordinates';
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
  CheckCircle, 
  ExternalLink, 
  Maximize2, 
  Minimize2,
  Calendar,
  Bed,
  Route,
  Car,
  RotateCw,
  LocateFixed,
  AlertCircle,
  Globe,
  RefreshCw,
  Compass
} from 'lucide-react';
import { 
  createOsmStandardTileLayer, 
  createSatelliteTileLayer, 
  OSM_ATTRIBUTION,
  ESRI_SATELLITE_ATTRIBUTION
} from '../../utils/mapTiles';

interface PropertyMapViewProps {
  properties: Property[];
  rooms: Room[];
  selectedPropertyId?: number | null;
  onSelectProperty: (property: Property) => void;
  onSelectRoomBooking?: (room: Room, property: Property) => void;
  onScheduleSurvey?: (property: Property) => void;
  lang?: 'id' | 'en';
}

type MapLayerType = 'osm' | 'satellite';

const MAP_LAYERS: Record<MapLayerType, { name: string; attribution: string; maxZoom: number }> = {
  osm: {
    name: 'OpenStreetMap (Standar)',
    attribution: OSM_ATTRIBUTION,
    maxZoom: 19
  },
  satellite: {
    name: 'Citra Satelit Esri',
    attribution: ESRI_SATELLITE_ATTRIBUTION,
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
  const [radiusFilter, setRadiusFilter] = useState<number>(3000); // 3000m (3km) default
  const [showRadiusCircle, setShowRadiusCircle] = useState(true);
  const [activeLayer, setActiveLayer] = useState<MapLayerType>('osm');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoveredAmenityId, setHoveredAmenityId] = useState<string | null>(null);
  const [mapTileError, setMapTileError] = useState<string | null>(null);

  // User Live Geolocation
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocatingUser, setIsLocatingUser] = useState(false);
  const userMarkerRef = useRef<L.Marker | null>(null);

  // Dynamic POIs from Overpass API + Supabase
  const [osmAmenities, setOsmAmenities] = useState<NearbyAmenity[]>([]);
  const [dbAmenities, setDbAmenities] = useState<NearbyAmenity[]>([]);
  const [isLoadingOsm, setIsLoadingOsm] = useState(false);
  const [osmFetchError, setOsmFetchError] = useState<string | null>(null);

  // Map DOM & Leaflet References
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const baseLayersRef = useRef<{ osm: L.TileLayer | null; satellite: L.TileLayer | null }>({ osm: null, satellite: null });
  const propertyLayerRef = useRef<L.LayerGroup | null>(null);
  const facilityLayerRef = useRef<L.LayerGroup | null>(null);
  const radiusLayerRef = useRef<L.LayerGroup | null>(null);
  const userLocationLayerRef = useRef<L.LayerGroup | null>(null);
  const propertyMarkersRef = useRef<{ [id: number]: L.Marker }>({});
  const amenityMarkersRef = useRef<{ [id: string]: L.Marker }>({});

  // Resolve active selected property with safe coordinates
  const activeProperty = useMemo(() => {
    const found = properties.find(p => p.id === activePropId) || properties[0] || null;
    if (!found) return null;
    const coords = sanitizePropertyCoordinates(found);
    return { ...found, lat: coords.lat, lng: coords.lng };
  }, [properties, activePropId]);

  // Sync prop changes from outside
  useEffect(() => {
    if (selectedPropertyId && selectedPropertyId !== activePropId) {
      setActivePropId(selectedPropertyId);
    }
  }, [selectedPropertyId]);

  // 1. Fetch Supabase custom amenities for current property
  useEffect(() => {
    if (!activePropId) return;

    let isMounted = true;
    database.fetchNearbyAmenities(activePropId)
      .then(data => {
        if (isMounted && data && data.length > 0) {
          setDbAmenities(data);
        }
      })
      .catch(err => {
        console.warn('[PropertyMapView] Failed to fetch amenities from Supabase:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [activePropId]);

  // 2. Fetch Live POIs from OpenStreetMap Overpass API for active property
  const loadOsmAmenities = useCallback(async (forceRefresh = false) => {
    if (!activeProperty || !isValidCoordinate(activeProperty.lat, activeProperty.lng)) return;

    setIsLoadingOsm(true);
    setOsmFetchError(null);

    try {
      const radiusToScan = Math.max(radiusFilter > 0 ? radiusFilter : 3000, 1500);
      const results = await fetchNearbyAmenitiesFromOSM(
        activeProperty.id,
        activeProperty.lat,
        activeProperty.lng,
        radiusToScan,
        forceRefresh
      );

      if (results && results.length > 0) {
        setOsmAmenities(results);
      } else {
        // Fallback to static if Overpass returns empty
        setOsmAmenities([]);
      }
    } catch (err: any) {
      console.warn('[PropertyMapView] Overpass fetch notice:', err);
      setOsmFetchError('Gagal memuat POI langsung dari OpenStreetMap. Menampilkan data cadangan.');
    } finally {
      setIsLoadingOsm(false);
    }
  }, [activeProperty, radiusFilter]);

  useEffect(() => {
    loadOsmAmenities(false);
  }, [loadOsmAmenities]);

  // Combined amenities for the active property (Prioritize OSM Overpass, then DB, then Curated Fallback)
  const activePropertyAmenities = useMemo(() => {
    if (!activeProperty) return [];

    const map = new Map<string, NearbyAmenity>();

    // 1. Add DB amenities
    dbAmenities.forEach(a => {
      const dist = calculateDistanceMeters(activeProperty.lat, activeProperty.lng, a.lat, a.lng);
      map.set(`${a.name.toLowerCase()}_${a.category}`, {
        ...a,
        distanceMeters: dist,
        walkingTimeMinutes: Math.max(1, Math.round(dist / 75)),
        drivingTimeMinutes: Math.max(1, Math.round(dist / 350))
      });
    });

    // 2. Add Live OSM amenities
    osmAmenities.forEach(a => {
      const key = `${a.name.toLowerCase()}_${a.category}`;
      if (!map.has(key)) {
        map.set(key, a);
      }
    });

    // 3. If still empty, add default curated amenities
    if (map.size === 0) {
      const defaultPool = getAmenitiesForProperty(activeProperty, INITIAL_NEARBY_AMENITIES);
      defaultPool.forEach(a => {
        map.set(`${a.name.toLowerCase()}_${a.category}`, a);
      });
    }

    const all = Array.from(map.values());
    all.sort((a, b) => a.distanceMeters - b.distanceMeters);
    return all;
  }, [activeProperty, dbAmenities, osmAmenities]);

  // Filter amenities by category, radius, and text search
  const filteredAmenities = useMemo(() => {
    return activePropertyAmenities.filter(amenity => {
      // Category filter
      if (selectedCategory !== 'all' && amenity.category !== selectedCategory) {
        return false;
      }
      // Radius filter
      if (radiusFilter > 0 && amenity.distanceMeters > radiusFilter) {
        return false;
      }
      // Text Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = amenity.name.toLowerCase().includes(q);
        const matchDesc = (amenity.description || '').toLowerCase().includes(q);
        const matchAddr = (amenity.address || '').toLowerCase().includes(q);
        if (!matchName && !matchDesc && !matchAddr) return false;
      }
      return true;
    });
  }, [activePropertyAmenities, selectedCategory, radiusFilter, searchQuery]);

  const formatRupiah = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(num);
  };

  const getAmenityCategoryIcon = (cat: AmenityCategory, size = 14) => {
    switch (cat) {
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
  // 1. LEAFLET MAP INITIALIZATION & LAYER GROUPS ARCHITECTURE
  // -------------------------------------------------------------
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const coords = sanitizePropertyCoordinates(activeProperty);
      const initialLat = coords.lat;
      const initialLng = coords.lng;

      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: 15,
        zoomControl: false,
        attributionControl: false
      });

      // Custom zoom control in bottom right
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      // Attribution Control
      const attrControl = L.control.attribution({ position: 'bottomleft', prefix: false });
      attrControl.addAttribution(OSM_ATTRIBUTION);
      attrControl.addTo(map);

      // Create base layers
      const osmLayer = createOsmStandardTileLayer({}, (hasError, message) => {
        if (hasError) {
          setMapTileError(message || 'Peta gagal dimuat. Periksa koneksi internet.');
        } else {
          setMapTileError(null);
        }
      });

      const satelliteLayer = createSatelliteTileLayer({}, (hasError, message) => {
        if (hasError) {
          setMapTileError(message || 'Gagal memuat citra satelit.');
        } else {
          setMapTileError(null);
        }
      });

      baseLayersRef.current = { osm: osmLayer, satellite: satelliteLayer };

      // Add default basemap
      if (activeLayer === 'satellite') {
        satelliteLayer.addTo(map);
      } else {
        osmLayer.addTo(map);
      }

      // Initialize Hierarchical Data LayerGroups in exact Z-order
      const radiusLayer = L.layerGroup().addTo(map);
      const propertyLayer = L.layerGroup().addTo(map);
      const facilityLayer = L.layerGroup().addTo(map);
      const userLocationLayer = L.layerGroup().addTo(map);

      radiusLayerRef.current = radiusLayer;
      propertyLayerRef.current = propertyLayer;
      facilityLayerRef.current = facilityLayer;
      userLocationLayerRef.current = userLocationLayer;
      mapInstanceRef.current = map;

      // Handle ResizeObserver for responsive container resizing
      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => {
          try {
            map.invalidateSize();
          } catch (e) {}
        });
        ro.observe(mapContainerRef.current);
      }

      // Invalidate size immediately to prevent gray/unrendered tiles
      setTimeout(() => {
        try {
          map.invalidateSize();
        } catch (e) {}
      }, 100);
      setTimeout(() => {
        try {
          map.invalidateSize();
        } catch (e) {}
      }, 400);
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
        baseLayersRef.current = { osm: null, satellite: null };
        propertyLayerRef.current = null;
        facilityLayerRef.current = null;
        radiusLayerRef.current = null;
        userLocationLayerRef.current = null;
      }
    };
  }, []);

  // Update Basemap Layer without recreating map or affecting data layers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const { osm, satellite } = baseLayersRef.current;
    if (!osm || !satellite) return;

    if (activeLayer === 'satellite') {
      if (map.hasLayer(osm)) {
        map.removeLayer(osm);
      }
      if (!map.hasLayer(satellite)) {
        satellite.addTo(map);
      }
    } else {
      if (map.hasLayer(satellite)) {
        map.removeLayer(satellite);
      }
      if (!map.hasLayer(osm)) {
        osm.addTo(map);
      }
    }
  }, [activeLayer]);

  // Trigger invalidateSize on fullscreen toggle or activePropId change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const t = setTimeout(() => {
      try {
        map.invalidateSize();
      } catch (e) {}
    }, 150);
    return () => clearTimeout(t);
  }, [isFullscreen, activePropId]);

  // -------------------------------------------------------------
  // 2. RENDER PROPERTY MARKERS & RADIUS CIRCLE (VIA LAYERGROUPS)
  // -------------------------------------------------------------
  useEffect(() => {
    const propertyLayer = propertyLayerRef.current;
    const radiusLayer = radiusLayerRef.current;
    const map = mapInstanceRef.current;
    if (!propertyLayer || !radiusLayer || !map) return;

    // Clear old layers
    propertyLayer.clearLayers();
    radiusLayer.clearLayers();
    propertyMarkersRef.current = {};

    // Add Markers for all properties
    properties.forEach(prop => {
      const coords = sanitizePropertyCoordinates(prop);
      if (!isValidCoordinate(coords.lat, coords.lng)) return;

      const lat = coords.lat;
      const lng = coords.lng;
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
        .addTo(propertyLayer)
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
          <div style="margin-top: 8px; padding-top: 6px; border-top: 1px dashed #e2e8f0; font-size: 10px; color: #64748b; font-family: monospace;">
            OpenStreetMap: ${lat.toFixed(5)}, ${lng.toFixed(5)}
          </div>
        </div>
      `;
      marker.bindPopup(popupContent, { offset: [0, -35] });

      propertyMarkersRef.current[prop.id] = marker;
    });

    // Render Radius Circle around active property
    if (activeProperty && showRadiusCircle && radiusFilter > 0) {
      const coords = sanitizePropertyCoordinates(activeProperty);
      if (isValidCoordinate(coords.lat, coords.lng)) {
        L.circle([coords.lat, coords.lng], {
          radius: radiusFilter,
          color: '#2E6F40',
          weight: 1.5,
          opacity: 0.8,
          fillColor: '#2E6F40',
          fillOpacity: 0.08,
          dashArray: '6, 6'
        }).addTo(radiusLayer);
      }
    }

  }, [properties, activePropId, activeProperty, showRadiusCircle, radiusFilter, rooms]);

  // -------------------------------------------------------------
  // 3. RENDER NEARBY AMENITY MARKERS (VIA FACILITY LAYERGROUP)
  // -------------------------------------------------------------
  useEffect(() => {
    const facilityLayer = facilityLayerRef.current;
    if (!facilityLayer) return;

    // Clear old amenity markers
    facilityLayer.clearLayers();
    amenityMarkersRef.current = {};

    const propCoords = sanitizePropertyCoordinates(activeProperty);

    // Render filtered amenities
    filteredAmenities.forEach(amenity => {
      const amenCoords = sanitizeAmenityCoordinates(amenity, propCoords.lat, propCoords.lng);
      if (!isValidCoordinate(amenCoords.lat, amenCoords.lng)) return;

      const categoryConfig = AMENITY_CATEGORIES.find(c => c.id === amenity.category) || AMENITY_CATEGORIES[0];
      const isHovered = hoveredAmenityId === amenity.id;

      // Icon emoji based on category
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

      const marker = L.marker([amenCoords.lat, amenCoords.lng], { icon: amenityIcon, zIndexOffset: isHovered ? 900 : 300 })
        .addTo(facilityLayer);

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

          <a href="https://www.google.com/maps/dir/?api=1&destination=${amenCoords.lat},${amenCoords.lng}" 
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
  }, [filteredAmenities, activeProperty, hoveredAmenityId, lang]);

  // -------------------------------------------------------------
  // 4. MAP INTERACTION HANDLERS
  // -------------------------------------------------------------
  const handleFlyToProperty = (prop: Property) => {
    const coords = sanitizePropertyCoordinates(prop);
    if (!isValidCoordinate(coords.lat, coords.lng)) return;

    setActivePropId(prop.id);
    onSelectProperty(prop);

    const map = mapInstanceRef.current;
    if (map) {
      map.flyTo([coords.lat, coords.lng], 16, {
        duration: 1.2,
        easeLinearity: 0.25
      });
      // Open popup for this marker after flying
      setTimeout(() => {
        const marker = propertyMarkersRef.current[prop.id];
        if (marker) marker.openPopup();
      }, 1300);
    }
  };

  const handleAmenityClick = (amenity: NearbyAmenity) => {
    const propCoords = sanitizePropertyCoordinates(activeProperty);
    const amenCoords = sanitizeAmenityCoordinates(amenity, propCoords.lat, propCoords.lng);
    if (!isValidCoordinate(amenCoords.lat, amenCoords.lng)) return;

    const map = mapInstanceRef.current;
    if (map) {
      map.panTo([amenCoords.lat, amenCoords.lng]);
      const marker = amenityMarkersRef.current[amenity.id];
      if (marker) {
        marker.openPopup();
      }
    }
  };

  const handleFitAllProperties = () => {
    const map = mapInstanceRef.current;
    if (!map || properties.length === 0) return;

    const validBounds: L.LatLngExpression[] = properties
      .map(p => sanitizePropertyCoordinates(p))
      .filter(c => isValidCoordinate(c.lat, c.lng))
      .map(c => [c.lat, c.lng]);

    if (validBounds.length > 0) {
      map.fitBounds(L.latLngBounds(validBounds), { padding: [60, 60], maxZoom: 16 });
    }
  };

  const handleGetUserLocation = () => {
    if (!navigator.geolocation) {
      alert('Perangkat Anda tidak mendukung geolokasi GPS.');
      return;
    }

    setIsLocatingUser(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocatingUser(false);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserLocation({ lat, lng });

        const map = mapInstanceRef.current;
        const userLocationLayer = userLocationLayerRef.current;
        if (!map || !userLocationLayer) return;

        // Clear old user marker in userLocationLayer
        userLocationLayer.clearLayers();

        const userIcon = L.divIcon({
          className: 'user-gps-location-marker',
          html: `
            <div class="relative flex items-center justify-center">
              <div class="w-6 h-6 rounded-full bg-blue-500/30 animate-ping absolute"></div>
              <div class="w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow-lg z-10 flex items-center justify-center text-white text-[8px] font-black">
                ●
              </div>
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        const marker = L.marker([lat, lng], { icon: userIcon, zIndexOffset: 2000 })
          .addTo(userLocationLayer)
          .bindPopup(`
            <div style="font-family: system-ui; font-size: 11px; padding: 4px; font-weight: bold; color: #1e293b;">
              📍 Posisi Anda Sekarang<br/>
              <span style="font-size: 9px; color: #64748b; font-family: monospace;">${lat.toFixed(5)}, ${lng.toFixed(5)}</span>
            </div>
          `);

        userMarkerRef.current = marker;
        map.flyTo([lat, lng], 15, { duration: 1.2 });
        setTimeout(() => marker.openPopup(), 1300);
      },
      (err) => {
        setIsLocatingUser(false);
        alert('Gagal mendeteksi lokasi GPS Anda. Pastikan izin lokasi browser aktif.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  return (
    <div 
      className={`bg-white rounded-3xl border border-slate-200/80 shadow-xl overflow-hidden transition-all duration-300 flex flex-col ${
        isFullscreen ? 'fixed inset-0 z-[9999] rounded-none' : 'w-full h-[820px]'
      }`}
    >
      {/* ------------------------------------------------------ */}
      {/* HEADER CONTROLS BAR */}
      {/* ------------------------------------------------------ */}
      <div className="bg-[#3A444D] text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0 z-20">
        
        {/* Title & Brand */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
            <Compass size={18} />
          </div>
          <div>
            <h2 className="text-sm font-extrabold tracking-tight flex items-center gap-2">
              <span>Eksplorasi Peta & Fasilitas Sekitar</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 font-mono">
                <Globe size={10} /> OpenStreetMap + Leaflet
              </span>
            </h2>
            <p className="text-[11px] text-slate-300">
              {activeProperty ? `${activeProperty.name} (${activeProperty.city || 'Jakarta'})` : 'Pilih unit kos'} &bull; Radius {radiusFilter > 0 ? `${radiusFilter / 1000} km` : 'Semua'}
            </p>
          </div>
        </div>

        {/* Global Toolbar Buttons */}
        <div className="flex items-center flex-wrap gap-2">
          
          {/* Reload Overpass POI Data Button */}
          <button
            onClick={() => loadOsmAmenities(true)}
            disabled={isLoadingOsm}
            className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-3 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer border border-white/10 disabled:opacity-50"
            title="Tarik Ulang Fasilitas dari OpenStreetMap"
          >
            <RefreshCw size={13} className={isLoadingOsm ? 'animate-spin text-emerald-400' : 'text-slate-300'} />
            <span>{isLoadingOsm ? 'Memuat OSM...' : 'Sinkronkan OSM'}</span>
          </button>

          {/* My Location GPS Button */}
          <button
            onClick={handleGetUserLocation}
            disabled={isLocatingUser}
            className="bg-blue-600/80 hover:bg-blue-600 text-white text-xs font-bold px-3 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer border border-blue-400/30 disabled:opacity-50"
            title="Deteksi Lokasi GPS Saya"
          >
            {isLocatingUser ? <RotateCw size={13} className="animate-spin" /> : <LocateFixed size={13} />}
            <span>{isLocatingUser ? 'Mencari...' : 'Posisi Saya'}</span>
          </button>

          {/* Layer Selector */}
          <div className="flex items-center bg-black/30 p-1 rounded-xl border border-white/15 text-xs">
            <Layers size={13} className="text-emerald-400 mx-2" />
            <select
              value={activeLayer}
              onChange={(e) => setActiveLayer(e.target.value as MapLayerType)}
              className="bg-transparent text-white text-xs font-bold focus:outline-none pr-2 cursor-pointer"
            >
              <option value="osm" className="text-slate-900">OpenStreetMap (Standar)</option>
              <option value="satellite" className="text-slate-900">Citra Satelit Esri</option>
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

          {/* Tile Load Error Fallback Banner */}
          {mapTileError && (
            <div className="absolute top-16 right-4 z-[450] bg-rose-600/95 text-white text-xs font-semibold px-3.5 py-2.5 rounded-2xl shadow-xl flex items-center gap-2.5 backdrop-blur-md border border-rose-400/40 animate-fade-in max-w-sm">
              <AlertCircle size={16} className="text-amber-300 shrink-0" />
              <div className="flex-1">
                <span className="font-bold block">{mapTileError}</span>
                <span className="text-[10px] text-rose-100">Silakan ganti ke Citra Satelit Esri atau periksa koneksi.</span>
              </div>
              <button 
                onClick={() => setMapTileError(null)} 
                className="text-white/80 hover:text-white font-black text-sm px-1"
                title="Tutup Notifikasi"
              >
                ✕
              </button>
            </div>
          )}

          {/* Overpass Live Fetch Status Badge */}
          {isLoadingOsm && (
            <div className="absolute top-16 left-4 z-[450] bg-slate-900/90 text-white text-xs font-semibold px-3.5 py-2 rounded-2xl shadow-xl flex items-center gap-2 backdrop-blur-md border border-slate-700/50">
              <RefreshCw size={13} className="animate-spin text-emerald-400" />
              <span>Memindai fasilitas sekitar via OpenStreetMap Overpass API...</span>
            </div>
          )}

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
              ✨ Semua ({activePropertyAmenities.length})
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
                  <p className="text-[10px] font-mono text-slate-400 mt-0.5 flex items-center gap-1">
                    <Globe size={11} className="text-emerald-600" />
                    OSM: {activeProperty.lat.toFixed(5)}, {activeProperty.lng.toFixed(5)}
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
              <div className="grid grid-cols-3 gap-2 pt-1">
                {onScheduleSurvey && (
                  <button
                    onClick={() => onScheduleSurvey(activeProperty)}
                    className="py-2 px-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1 cursor-pointer text-center"
                  >
                    <Calendar size={12} className="text-[#2E6F40]" />
                    <span>Survey</span>
                  </button>
                )}
                <button
                  onClick={() => onSelectProperty(activeProperty)}
                  className="py-2 px-2 bg-[#2E6F40] hover:bg-[#235531] text-white rounded-xl text-[11px] font-extrabold uppercase tracking-wider transition-all flex items-center justify-center gap-1 cursor-pointer shadow-xs text-center"
                >
                  <Bed size={12} />
                  <span>Kamar</span>
                </button>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${activeProperty.lat},${activeProperty.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="py-2 px-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1 cursor-pointer shadow-xs text-center"
                >
                  <Navigation size={12} className="text-emerald-400" />
                  <span>Rute</span>
                </a>
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
                placeholder="Cari stasiun, kampus, RS, minimarket terdekat..."
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
                  { label: '3 km', val: 3000 },
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
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 font-mono flex items-center gap-1.5">
                <span>{filteredAmenities.length} FASILITAS TERDEKAT</span>
                {osmAmenities.length > 0 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold font-sans">
                    OSM Live
                  </span>
                )}
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                Klik kartu untuk sorot
              </span>
            </div>

            {filteredAmenities.map(amenity => {
              const catConfig = AMENITY_CATEGORIES.find(c => c.id === amenity.category) || AMENITY_CATEGORIES[0];
              const isHovered = hoveredAmenityId === amenity.id;
              const propCoords = sanitizePropertyCoordinates(activeProperty);
              const amenCoords = sanitizeAmenityCoordinates(amenity, propCoords.lat, propCoords.lng);

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
                        {amenity.distanceMeters < 1000 ? `${amenity.distanceMeters} m` : `${(amenity.distanceMeters / 1000).toFixed(1)} km`}
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
                      href={`https://www.google.com/maps/dir/?api=1&destination=${amenCoords.lat},${amenCoords.lng}`}
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

            {filteredAmenities.length === 0 && !isLoadingOsm && (
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
              Data Geospasial OpenStreetMap
            </span>
            <span className="font-mono text-[10px] text-slate-400">
              Leaflet 1.9.4
            </span>
          </div>

        </div>

      </div>
    </div>
  );
};

export default PropertyMapView;
