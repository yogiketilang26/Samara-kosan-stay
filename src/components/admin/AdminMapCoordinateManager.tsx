import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Property, NearbyAmenity, AmenityCategory } from '../../types';
import { database } from '../../lib/supabase';
import { 
  AMENITY_CATEGORIES, 
  AmenityCategoryConfig, 
  fetchNearbyAmenitiesFromOSM,
  clearFacilityCache
} from '../../data/nearbyAmenities';
import { 
  MapPin, Compass, Search, Navigation, CheckCircle, 
  Trash2, Plus, Edit2, RotateCw, Sparkles, Building2, 
  ExternalLink, Layers, Info, Check, X, AlertCircle, ArrowUpRight,
  Clipboard, ClipboardPaste, Copy, ClipboardCheck, ArrowRight, HelpCircle,
  Globe, DownloadCloud, RefreshCw, Undo2, Crosshair
} from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  createGoogleMapsRoadmapLayer,
  createGoogleMapsHybridLayer,
  createOsmStandardTileLayer, 
  createSatelliteTileLayer, 
  GOOGLE_ATTRIBUTION,
  OSM_ATTRIBUTION,
  ESRI_SATELLITE_ATTRIBUTION,
  getGoogleMapsSearchUrl,
  getGoogleMapsDirectionsUrl
} from '../../utils/mapTiles';
import { parseGoogleMapsCoordinates, normalizeCoordinatePair, resolveGoogleMapsLink } from '../../utils/mapCoordinates';

interface AdminMapCoordinateManagerProps {
  properties: Property[];
  onPropertyUpdated?: (updatedProp: Property) => void;
  showToast?: (message: string, type?: 'success' | 'error') => void;
}

// Calculate Haversine distance in meters
function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

export const AdminMapCoordinateManager: React.FC<AdminMapCoordinateManagerProps> = ({
  properties,
  onPropertyUpdated,
  showToast
}) => {
  const [selectedPropertyId, setSelectedPropertyId] = useState<number>(properties[0]?.id || 1);
  const [activeProperty, setActiveProperty] = useState<Property | null>(null);

  // Property Coordinate Form (initialized strictly from user properties, no hardcoded dummy data)
  const [propLat, setPropLat] = useState<number>(() => {
    const first = properties[0];
    const norm = first ? normalizeCoordinatePair(first.lat, first.lng) : null;
    return norm ? norm.lat : (first?.lat ? Number(first.lat) : 0);
  });
  const [propLng, setPropLng] = useState<number>(() => {
    const first = properties[0];
    const norm = first ? normalizeCoordinatePair(first.lat, first.lng) : null;
    return norm ? norm.lng : (first?.lng ? Number(first.lng) : 0);
  });
  const [latInput, setLatInput] = useState<string>(() => {
    const first = properties[0];
    const norm = first ? normalizeCoordinatePair(first.lat, first.lng) : null;
    const l = norm ? norm.lat : (first?.lat ? Number(first.lat) : 0);
    return l !== 0 ? String(l) : '';
  });
  const [lngInput, setLngInput] = useState<string>(() => {
    const first = properties[0];
    const norm = first ? normalizeCoordinatePair(first.lat, first.lng) : null;
    const l = norm ? norm.lng : (first?.lng ? Number(first.lng) : 0);
    return l !== 0 ? String(l) : '';
  });
  const [coordFeedback, setCoordFeedback] = useState<string | null>(null);
  const [propAddress, setPropAddress] = useState<string>(() => properties[0]?.address || '');
  const [isSavingProperty, setIsSavingProperty] = useState(false);
  const [copiedCoords, setCopiedCoords] = useState(false);

  // Sync and Editing Guard Refs to prevent resets & flickering
  const prevSelectedPropertyIdRef = useRef<number | null>(null);
  const isUserEditingRef = useRef<boolean>(false);
  const lastSavedCoordsRef = useRef<{ lat: number; lng: number } | null>(null);

  // Google Maps Direct Smart Paste State
  const [gmapsPropInput, setGmapsPropInput] = useState('');
  const [propParseStatus, setPropParseStatus] = useState<{ status: 'idle' | 'success' | 'error'; message?: string }>({ status: 'idle' });
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [showGmapsGuide, setShowGmapsGuide] = useState(false);

  // Amenity Google Maps Smart Paste State
  const [gmapsAmenityInput, setGmapsAmenityInput] = useState('');
  const [amenityParseStatus, setAmenityParseStatus] = useState<{ status: 'idle' | 'success' | 'error'; message?: string }>({ status: 'idle' });

  // Amenities Data & State
  const [amenities, setAmenities] = useState<NearbyAmenity[]>([]);
  const [isLoadingAmenities, setIsLoadingAmenities] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isAddingAmenity, setIsAddingAmenity] = useState(false);
  const [editingAmenity, setEditingAmenity] = useState<NearbyAmenity | null>(null);
  const [isSavingAmenity, setIsSavingAmenity] = useState(false);

  // Overpass OpenStreetMap Scanner State for Admin
  const [isScanningOsm, setIsScanningOsm] = useState(false);
  const [osmScanResults, setOsmScanResults] = useState<NearbyAmenity[]>([]);
  const [selectedOsmIds, setSelectedOsmIds] = useState<Set<string>>(new Set());
  const [showOsmScanModal, setShowOsmScanModal] = useState(false);
  const [isImportingOsm, setIsImportingOsm] = useState(false);

  // Search Address / Landmark
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Amenity Form State
  const [amenityForm, setAmenityForm] = useState({
    id: '',
    name: '',
    category: 'transit' as AmenityCategory,
    lat: -6.1956,
    lng: 106.8488,
    distanceMeters: 250,
    walkingTimeMinutes: 3,
    drivingTimeMinutes: 1,
    description: '',
    address: ''
  });

  // Map Refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const propertyMarkerRef = useRef<L.Marker | null>(null);
  const propertyLayerRef = useRef<L.LayerGroup | null>(null);
  const amenityLayerRef = useRef<L.LayerGroup | null>(null);
  const tempMarkerLayerRef = useRef<L.LayerGroup | null>(null);
  type AdminMapTileType = 'google-roadmap' | 'google-hybrid' | 'osm' | 'satellite';
  const baseLayersRef = useRef<{ [key in AdminMapTileType]?: L.TileLayer | null }>({});
  const amenityMarkersRef = useRef<{ [id: string]: L.Marker }>({});
  const [activeTileType, setActiveTileType] = useState<AdminMapTileType>('google-roadmap');
  const [mapTileError, setMapTileError] = useState<string | null>(null);

  // Track if coordinates have unsaved modifications (dirty status)
  const isDirty = useMemo(() => {
    if (!activeProperty) return false;
    const cleanLat = latInput.trim().replace(/[\u2212\u2013\u2014]/g, '-').replace(',', '.');
    const cleanLng = lngInput.trim().replace(/[\u2212\u2013\u2014]/g, '-').replace(',', '.');
    const numLat = parseFloat(cleanLat);
    const numLng = parseFloat(cleanLng);

    const savedLat = lastSavedCoordsRef.current?.lat ?? (activeProperty.lat ? Number(activeProperty.lat) : 0);
    const savedLng = lastSavedCoordsRef.current?.lng ?? (activeProperty.lng ? Number(activeProperty.lng) : 0);

    if (isNaN(numLat) || isNaN(numLng)) {
      return latInput.trim() !== '' || lngInput.trim() !== '';
    }
    return (
      Math.abs(numLat - savedLat) > 0.000001 ||
      Math.abs(numLng - savedLng) > 0.000001 ||
      propAddress !== (activeProperty.address || '')
    );
  }, [latInput, lngInput, propAddress, activeProperty]);

  // Update active property when selected ID changes or properties list updates
  useEffect(() => {
    const found = properties.find(p => p.id === selectedPropertyId) || properties[0] || null;
    if (!found) return;

    // Check if user changed to a DIFFERENT property
    const isNewPropertySelected = prevSelectedPropertyIdRef.current !== found.id;

    if (isNewPropertySelected) {
      prevSelectedPropertyIdRef.current = found.id;
      isUserEditingRef.current = false;
      setActiveProperty(found);

      const norm = normalizeCoordinatePair(found.lat, found.lng);
      const safeLat = norm ? norm.lat : (found.lat ? Number(found.lat) : 0);
      const safeLng = norm ? norm.lng : (found.lng ? Number(found.lng) : 0);
      lastSavedCoordsRef.current = { lat: safeLat, lng: safeLng };

      setPropLat(safeLat);
      setPropLng(safeLng);
      setLatInput(safeLat !== 0 ? String(safeLat) : '');
      setLngInput(safeLng !== 0 ? String(safeLng) : '');
      setPropAddress(found.address || '');
      setGmapsPropInput('');
      setPropParseStatus({ status: 'idle' });
      setCoordFeedback(null);
      if (safeLat !== 0 && safeLng !== 0) {
        centerMapOn(safeLat, safeLng, 16);
      } else {
        centerMapOn(-6.175392, 106.827153, 12);
      }
      return;
    }

    // SAME property updated from background (e.g. Supabase realtime or Admin re-render)
    setActiveProperty(found);

    // CRITICAL: If user is actively typing or editing, DO NOT reset their inputs or map location!
    if (isUserEditingRef.current) {
      return;
    }

    // If not editing, sync if DB coordinates actually changed
    const norm = normalizeCoordinatePair(found.lat, found.lng);
    const safeLat = norm ? norm.lat : (found.lat ? Number(found.lat) : 0);
    const safeLng = norm ? norm.lng : (found.lng ? Number(found.lng) : 0);

    if (
      !lastSavedCoordsRef.current ||
      Math.abs(lastSavedCoordsRef.current.lat - safeLat) > 0.000001 ||
      Math.abs(lastSavedCoordsRef.current.lng - safeLng) > 0.000001
    ) {
      lastSavedCoordsRef.current = { lat: safeLat, lng: safeLng };
      setPropLat(safeLat);
      setPropLng(safeLng);
      setLatInput(safeLat !== 0 ? String(safeLat) : '');
      setLngInput(safeLng !== 0 ? String(safeLng) : '');
      setPropAddress(found.address || '');
    }
  }, [selectedPropertyId, properties]);

  // Load amenities for selected property
  const loadAmenities = async (propId: number) => {
    setIsLoadingAmenities(true);
    const sanitizeUniqueAmenities = (list: NearbyAmenity[]) => {
      const seenIds = new Set<string>();
      return list.map((a, idx) => {
        let uid = a.id;
        if (!uid || seenIds.has(uid)) {
          uid = `${a.id || 'amenity'}-${propId}-${idx}`;
        }
        seenIds.add(uid);
        return { ...a, id: uid };
      });
    };

    try {
      const data = await database.fetchNearbyAmenities(propId);
      setAmenities(sanitizeUniqueAmenities(data || []));
    } catch (err: any) {
      console.error('[AdminMapCoordinateManager] Load amenities error:', err);
      setAmenities([]);
    } finally {
      setIsLoadingAmenities(false);
    }
  };

  useEffect(() => {
    if (selectedPropertyId) {
      loadAmenities(selectedPropertyId);
    }
  }, [selectedPropertyId]);

  // Handle Google Maps Smart Paste for Property
  const handleGmapsPropPaste = async (value: string) => {
    isUserEditingRef.current = true;
    setGmapsPropInput(value);
    setCoordFeedback(null);
    if (!value.trim()) {
      setPropParseStatus({ status: 'idle' });
      return;
    }

    // 1. Direct synchronous parse
    const parsed = parseGoogleMapsCoordinates(value);
    if (parsed) {
      setPropLat(parsed.lat);
      setPropLng(parsed.lng);
      setLatInput(String(parsed.lat));
      setLngInput(String(parsed.lng));
      setPropParseStatus({
        status: 'success',
        message: `Koordinat terdeteksi: Lat ${parsed.lat}, Lng ${parsed.lng}`
      });
      centerMapOn(parsed.lat, parsed.lng, 17);
      return;
    }

    // 2. If it is a web link (e.g. maps.app.goo.gl or goo.gl/maps or google.com/maps), resolve asynchronously
    const isUrl = value.trim().startsWith('http://') || value.trim().startsWith('https://') || value.includes('maps') || value.includes('goo.gl');
    if (isUrl) {
      setPropParseStatus({
        status: 'idle',
        message: 'Sedang membaca tautan Google Maps...'
      });

      const resolved = await resolveGoogleMapsLink(value.trim());
      if (resolved) {
        setPropLat(resolved.lat);
        setPropLng(resolved.lng);
        setLatInput(String(resolved.lat));
        setLngInput(String(resolved.lng));
        setPropParseStatus({
          status: 'success',
          message: `Link berhasil diterjemahkan: Lat ${resolved.lat}, Lng ${resolved.lng}`
        });
        centerMapOn(resolved.lat, resolved.lng, 17);
        return;
      }
    }

    setPropParseStatus({
      status: 'error',
      message: 'Format tidak dikenali. Paste link Google Maps (misal https://maps.app.goo.gl/... atau @-6.19,106.84) atau teks koordinat "-6.195621, 106.848815".'
    });
  };

  // Handle Google Maps Smart Paste for Amenity Form
  const handleGmapsAmenityPaste = async (value: string) => {
    setGmapsAmenityInput(value);
    if (!value.trim()) {
      setAmenityParseStatus({ status: 'idle' });
      return;
    }

    let parsed = parseGoogleMapsCoordinates(value);
    if (!parsed && (value.trim().startsWith('http') || value.includes('maps') || value.includes('goo.gl'))) {
      setAmenityParseStatus({ status: 'idle', message: 'Membaca tautan Google Maps...' });
      parsed = await resolveGoogleMapsLink(value.trim());
    }

    if (parsed) {
      const dist = calculateDistanceMeters(propLat, propLng, parsed.lat, parsed.lng);
      const walk = Math.max(1, Math.round(dist / 80)); // 80m / min
      const drive = Math.max(1, Math.round(dist / 350)); // 350m / min

      setAmenityForm(prev => ({
        ...prev,
        lat: parsed.lat,
        lng: parsed.lng,
        distanceMeters: dist,
        walkingTimeMinutes: walk,
        drivingTimeMinutes: drive
      }));

      setAmenityParseStatus({
        status: 'success',
        message: `Koordinat terdeteksi: Lat ${parsed.lat}, Lng ${parsed.lng} (Jarak: ${dist} m)`
      });

      centerMapOn(parsed.lat, parsed.lng, 17);
    } else {
      setAmenityParseStatus({
        status: 'error',
        message: 'Format link / koordinat tidak valid.'
      });
    }
  };

  // Handler for Latitude text input
  const handleLatInputChange = (val: string) => {
    isUserEditingRef.current = true;
    setLatInput(val);
    setCoordFeedback(null);

    // If user pasted combined string e.g. "-6.162249, 106.865001" or link into Latitude
    if (val.includes(',') || val.includes('@') || val.includes('http') || val.includes(';') || (val.includes(' ') && val.trim().split(/\s+/).length >= 2)) {
      const parsed = parseGoogleMapsCoordinates(val);
      if (parsed) {
        setPropLat(parsed.lat);
        setPropLng(parsed.lng);
        setLatInput(String(parsed.lat));
        setLngInput(String(parsed.lng));
        setCoordFeedback(`Koordinat ganda terdeteksi & dipisahkan: Lat ${parsed.lat}, Lng ${parsed.lng}`);
        centerMapOn(parsed.lat, parsed.lng, 17);
        return;
      }
    }

    const cleanStr = val.trim().replace(/[\u2212\u2013\u2014]/g, '-').replace(',', '.');
    const num = parseFloat(cleanStr);
    if (!isNaN(num) && isFinite(num) && num >= -90 && num <= 90 && cleanStr.length >= 4) {
      setPropLat(num);
    }
  };

  // Handler for Longitude text input
  const handleLngInputChange = (val: string) => {
    isUserEditingRef.current = true;
    setLngInput(val);
    setCoordFeedback(null);

    // If user pasted combined string e.g. "-6.162249, 106.865001" or link into Longitude
    if (val.includes(',') || val.includes('@') || val.includes('http') || val.includes(';') || (val.includes(' ') && val.trim().split(/\s+/).length >= 2)) {
      const parsed = parseGoogleMapsCoordinates(val);
      if (parsed) {
        setPropLat(parsed.lat);
        setPropLng(parsed.lng);
        setLatInput(String(parsed.lat));
        setLngInput(String(parsed.lng));
        setCoordFeedback(`Koordinat ganda terdeteksi & dipisahkan: Lat ${parsed.lat}, Lng ${parsed.lng}`);
        centerMapOn(parsed.lat, parsed.lng, 17);
        return;
      }
    }

    const cleanStr = val.trim().replace(/[\u2212\u2013\u2014]/g, '-').replace(',', '.');
    const num = parseFloat(cleanStr);
    if (!isNaN(num) && isFinite(num) && num >= -180 && num <= 180 && cleanStr.length >= 4) {
      setPropLng(num);
    }
  };

  // Coordinate normalizer on input blur
  const handleCoordBlur = () => {
    const cleanLat = latInput.trim().replace(/[\u2212\u2013\u2014]/g, '-').replace(',', '.');
    const cleanLng = lngInput.trim().replace(/[\u2212\u2013\u2014]/g, '-').replace(',', '.');
    
    if (cleanLat === '' && cleanLng === '') return;
    
    const norm = normalizeCoordinatePair(cleanLat, cleanLng);
    if (norm) {
      setPropLat(norm.lat);
      setPropLng(norm.lng);
      setLatInput(String(norm.lat));
      setLngInput(String(norm.lng));
      centerMapOn(norm.lat, norm.lng, 17);
    }
  };

  // Device GPS Location getter
  const handleUseCurrentLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      if (showToast) showToast('Browser tidak mendukung geolokasi GPS.', 'error');
      return;
    }
    isUserEditingRef.current = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = parseFloat(pos.coords.latitude.toFixed(6));
        const lng = parseFloat(pos.coords.longitude.toFixed(6));
        setPropLat(lat);
        setPropLng(lng);
        setLatInput(String(lat));
        setLngInput(String(lng));
        setCoordFeedback(`Koordinat GPS terdeteksi: Lat ${lat}, Lng ${lng}`);
        centerMapOn(lat, lng, 17);
        if (showToast) showToast(`Titik GPS terdeteksi: ${lat}, ${lng}`, 'success');
      },
      (err) => {
        if (showToast) showToast(`Gagal membaca GPS: ${err.message}`, 'error');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Copy coordinates string to clipboard
  const handleCopyCoords = () => {
    if (!latInput || !lngInput) return;
    navigator.clipboard.writeText(`${latInput}, ${lngInput}`);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
    if (showToast) showToast('Koordinat disalin ke papan klip.', 'success');
  };

  // Revert coordinates back to last saved database state (CRUD Revert)
  const handleRevertCoordinates = () => {
    if (!activeProperty) return;
    const savedLat = lastSavedCoordsRef.current?.lat ?? (activeProperty.lat ? Number(activeProperty.lat) : 0);
    const savedLng = lastSavedCoordsRef.current?.lng ?? (activeProperty.lng ? Number(activeProperty.lng) : 0);
    isUserEditingRef.current = false;
    setPropLat(savedLat);
    setPropLng(savedLng);
    setLatInput(savedLat !== 0 ? String(savedLat) : '');
    setLngInput(savedLng !== 0 ? String(savedLng) : '');
    setPropAddress(activeProperty.address || '');
    setGmapsPropInput('');
    setPropParseStatus({ status: 'idle' });
    setCoordFeedback('Perubahan dibatalkan. Koordinat dikembalikan ke data tersimpan.');
    if (savedLat !== 0 && savedLng !== 0) {
      centerMapOn(savedLat, savedLng, 16);
    } else {
      centerMapOn(-6.175392, 106.827153, 12);
    }
  };

  // Delete / Clear coordinates from property (CRUD Delete)
  const handleClearCoordinates = async () => {
    if (!activeProperty) return;
    if (!confirm(`Hapus titik koordinat untuk properti "${activeProperty.name}"? Pin lokasi akan dikosongkan.`)) return;

    isUserEditingRef.current = true;
    setPropLat(0);
    setPropLng(0);
    setLatInput('');
    setLngInput('');
    setGmapsPropInput('');
    setCoordFeedback('Koordinat dikosongkan. Klik "Simpan Titik Koordinat" untuk memperbarui data di database.');
    if (propertyMarkerRef.current && propertyLayerRef.current) {
      propertyLayerRef.current.clearLayers();
      propertyMarkerRef.current = null;
    }
  };

  // -------------------------------------------------------------
  // LEAFLET MAP INITIALIZATION & TILE LAYER (PURE OSM / ESRI)
  // -------------------------------------------------------------
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [propLat, propLng],
        zoom: 16,
        zoomControl: true,
        attributionControl: false
      });

      L.control.attribution({ position: 'bottomleft', prefix: false })
        .addAttribution(GOOGLE_ATTRIBUTION)
        .addTo(map);

      // Create base layers
      const googleRoadmap = createGoogleMapsRoadmapLayer(
        {},
        (hasError, msg) => setMapTileError(hasError ? (msg || 'Peta Google Maps gagal dimuat.') : null)
      );

      const googleHybrid = createGoogleMapsHybridLayer(
        {},
        (hasError, msg) => setMapTileError(hasError ? (msg || 'Peta satelit Google Maps gagal dimuat.') : null)
      );

      const osm = createOsmStandardTileLayer(
        {},
        (hasError, msg) => setMapTileError(hasError ? (msg || 'Peta gagal dimuat. Periksa koneksi.') : null)
      );

      const satellite = createSatelliteTileLayer(
        {},
        (hasError, msg) => setMapTileError(hasError ? (msg || 'Peta satelit gagal dimuat.') : null)
      );

      baseLayersRef.current = { 
        'google-roadmap': googleRoadmap, 
        'google-hybrid': googleHybrid, 
        'osm': osm, 
        'satellite': satellite 
      };

      const initialLayer = baseLayersRef.current[activeTileType] || googleRoadmap;
      initialLayer.addTo(map);

      // Initialize LayerGroups in order
      const propertyLayer = L.layerGroup().addTo(map);
      const amenityLayer = L.layerGroup().addTo(map);
      const tempMarkerLayer = L.layerGroup().addTo(map);

      propertyLayerRef.current = propertyLayer;
      amenityLayerRef.current = amenityLayer;
      tempMarkerLayerRef.current = tempMarkerLayer;
      mapRef.current = map;

      // Handle ResizeObserver for admin layout changes
      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => {
          try {
            map.invalidateSize();
          } catch (e) {}
        });
        ro.observe(mapContainerRef.current);
      }

      setTimeout(() => {
        try {
          map.invalidateSize();
        } catch (e) {}
      }, 150);

      // Click on map to update position
      map.on('click', (e: L.LeafletMouseEvent) => {
        const lat = parseFloat(e.latlng.lat.toFixed(6));
        const lng = parseFloat(e.latlng.lng.toFixed(6));

        // If currently adding/editing an amenity, set amenity position
        if (isAddingAmenity || editingAmenity) {
          setAmenityForm(prev => {
            const dist = calculateDistanceMeters(propLat, propLng, lat, lng);
            const walk = Math.max(1, Math.round(dist / 80));
            const drive = Math.max(1, Math.round(dist / 350));
            return {
              ...prev,
              lat,
              lng,
              distanceMeters: dist,
              walkingTimeMinutes: walk,
              drivingTimeMinutes: drive
            };
          });
        } else {
          // Relocate property marker
          isUserEditingRef.current = true;
          setPropLat(lat);
          setPropLng(lng);
          setLatInput(String(lat));
          setLngInput(String(lng));
          setCoordFeedback(`Titik dipilih dari peta: Lat ${lat}, Lng ${lng}`);
        }
      });
    }

    return () => {
      // Keep instance alive or clean on unmount
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch (e) {}
        mapRef.current = null;
        propertyLayerRef.current = null;
        amenityLayerRef.current = null;
        tempMarkerLayerRef.current = null;
        baseLayersRef.current = { osm: null, satellite: null };
      }
    };
  }, []);

  // Update Tile Layer when layer switch changed
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    (Object.keys(baseLayersRef.current) as AdminMapTileType[]).forEach((key) => {
      const layer = baseLayersRef.current[key];
      if (layer) {
        if (key === activeTileType) {
          if (!map.hasLayer(layer)) layer.addTo(map);
        } else {
          if (map.hasLayer(layer)) map.removeLayer(layer);
        }
      }
    });
  }, [activeTileType]);

  // Keep track of property ID for marker recreation
  const currentMarkerPropIdRef = useRef<number | null>(null);

  // Update Property Marker smoothly without destroying/recreating on every keystroke
  useEffect(() => {
    const propertyLayer = propertyLayerRef.current;
    if (!propertyLayer) return;

    // If coordinates are cleared (0, 0 or null), remove marker
    if (!propLat || !propLng || (Math.abs(propLat) < 0.0001 && Math.abs(propLng) < 0.0001)) {
      propertyLayer.clearLayers();
      propertyMarkerRef.current = null;
      return;
    }

    const propIdChanged = currentMarkerPropIdRef.current !== activeProperty?.id;

    // If marker already exists and property hasn't changed, smoothly update coordinates without destroying
    if (propertyMarkerRef.current && !propIdChanged) {
      propertyMarkerRef.current.setLatLng([propLat, propLng]);
      return;
    }

    // Recreate marker when property changes or initially mounts
    currentMarkerPropIdRef.current = activeProperty?.id || null;
    propertyLayer.clearLayers();
    propertyMarkerRef.current = null;

    const propIcon = L.divIcon({
      className: 'custom-property-admin-marker',
      html: `
        <div style="display:flex; flex-direction:column; align-items:center; cursor:grab;">
          <div style="background:#2E6F40; color:white; font-size:10px; font-weight:900; padding:4px 8px; border-radius:10px; box-shadow:0 4px 12px rgba(0,0,0,0.3); border:2px solid #E4B363; white-space:nowrap; display:flex; align-items:center; gap:4px;">
            <span>🏢</span>
            <span>${activeProperty?.name || 'Cabang Kos'}</span>
          </div>
          <div style="width:0; height:0; border-left:6px solid transparent; border-right:6px solid transparent; border-top:8px solid #2E6F40; margin-top:-1px;"></div>
          <div style="width:8px; height:8px; background:#E4B363; border-radius:50%; margin-top:1px; box-shadow:0 0 6px rgba(228,179,99,0.8);"></div>
        </div>
      `,
      iconSize: [120, 48],
      iconAnchor: [60, 48]
    });

    const marker = L.marker([propLat, propLng], {
      icon: propIcon,
      draggable: true,
      zIndexOffset: 1000
    }).addTo(propertyLayer);

    marker.on('dragend', (e) => {
      const position = e.target.getLatLng();
      const lat = parseFloat(position.lat.toFixed(6));
      const lng = parseFloat(position.lng.toFixed(6));
      isUserEditingRef.current = true;
      setPropLat(lat);
      setPropLng(lng);
      setLatInput(String(lat));
      setLngInput(String(lng));
      setCoordFeedback(`Marker digeser ke Lat ${lat}, Lng ${lng}`);
    });

    propertyMarkerRef.current = marker;
  }, [propLat, propLng, activeProperty?.id, activeProperty?.name]);

  // Update Amenity Markers on Map
  useEffect(() => {
    const amenityLayer = amenityLayerRef.current;
    const tempMarkerLayer = tempMarkerLayerRef.current;
    if (!amenityLayer || !tempMarkerLayer) return;

    // Clear old markers
    amenityLayer.clearLayers();
    tempMarkerLayer.clearLayers();
    amenityMarkersRef.current = {};

    amenities.forEach(amenity => {
      const catConfig = AMENITY_CATEGORIES.find(c => c.id === amenity.category) || AMENITY_CATEGORIES[0];
      const isSelected = editingAmenity?.id === amenity.id;

      const amenityIcon = L.divIcon({
        className: 'custom-amenity-admin-marker',
        html: `
          <div style="display:flex; flex-direction:column; align-items:center; cursor:pointer; transform:${isSelected ? 'scale(1.2)' : 'scale(1)'}; transition:transform 0.2s;">
            <div style="background:${catConfig.bgColor}; color:${catConfig.color}; border:1.5px solid ${catConfig.borderColor}; font-size:9px; font-weight:800; padding:2px 6px; border-radius:8px; box-shadow:0 2px 6px rgba(0,0,0,0.15); white-space:nowrap;">
              ${amenity.name} (${amenity.distanceMeters}m)
            </div>
            <div style="width:6px; height:6px; background:${catConfig.color}; border-radius:50%; border:1.5px solid white; margin-top:2px;"></div>
          </div>
        `,
        iconSize: [140, 36],
        iconAnchor: [70, 36]
      });

      const m = L.marker([amenity.lat, amenity.lng], { icon: amenityIcon })
        .addTo(amenityLayer)
        .on('click', () => {
          handleEditAmenity(amenity);
        });

      amenityMarkersRef.current[amenity.id] = m;
    });

    // If adding a new amenity or editing, show an active temporary pointer in tempMarkerLayer
    if (isAddingAmenity || editingAmenity) {
      const tempIcon = L.divIcon({
        className: 'custom-temp-amenity-marker',
        html: `
          <div style="display:flex; flex-direction:column; align-items:center; animation:bounce 1s infinite;">
            <div style="background:#EF4444; color:white; font-size:9px; font-weight:900; padding:3px 6px; border-radius:6px; border:2px solid white; box-shadow:0 0 10px rgba(239,68,68,0.8); white-space:nowrap;">
              🎯 Titik Baru (${amenityForm.distanceMeters}m)
            </div>
            <div style="width:0; height:0; border-left:5px solid transparent; border-right:5px solid transparent; border-top:6px solid #EF4444;"></div>
          </div>
        `,
        iconSize: [120, 30],
        iconAnchor: [60, 30]
      });

      const tempMarker = L.marker([amenityForm.lat, amenityForm.lng], {
        icon: tempIcon,
        draggable: true,
        zIndexOffset: 1200
      }).addTo(tempMarkerLayer);

      tempMarker.on('dragend', (e) => {
        const position = e.target.getLatLng();
        const lat = parseFloat(position.lat.toFixed(6));
        const lng = parseFloat(position.lng.toFixed(6));
        const dist = calculateDistanceMeters(propLat, propLng, lat, lng);
        const walk = Math.max(1, Math.round(dist / 80));
        const drive = Math.max(1, Math.round(dist / 350));

        setAmenityForm(prev => ({
          ...prev,
          lat,
          lng,
          distanceMeters: dist,
          walkingTimeMinutes: walk,
          drivingTimeMinutes: drive
        }));
      });

      amenityMarkersRef.current['__temp__'] = tempMarker;
    }
  }, [amenities, isAddingAmenity, editingAmenity, amenityForm.lat, amenityForm.lng, propLat, propLng]);

  // Center Map Utility
  const centerMapOn = (lat: number, lng: number, zoom = 16) => {
    if (mapRef.current) {
      mapRef.current.flyTo([lat, lng], zoom, { duration: 1 });
    }
  };

  // Reverse Geocoding with Nominatim OpenStreetMap
  const handleReverseGeocode = async (lat: number, lng: number) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=id,en`,
        { headers: { 'User-Agent': 'SamaraStay-AdminManager/1.0' } }
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.display_name) {
        setPropAddress(data.display_name);
        if (showToast) showToast('Alamat otomatis diperbarui dari OpenStreetMap.');
      }
    } catch (err) {
      console.warn('Reverse geocoding notice:', err);
    }
  };

  // Search Address or Landmark via Nominatim OpenStreetMap
  const handleSearchAddress = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&countrycodes=id&limit=5&accept-language=id,en`,
        { headers: { 'User-Agent': 'SamaraStay-AdminManager/1.0' } }
      );
      const data = await res.json();
      setSearchResults(data || []);
    } catch (err) {
      console.error('Search address error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSearchResult = (result: any) => {
    const lat = parseFloat(parseFloat(result.lat).toFixed(6));
    const lng = parseFloat(parseFloat(result.lon).toFixed(6));
    isUserEditingRef.current = true;
    setPropLat(lat);
    setPropLng(lng);
    setLatInput(String(lat));
    setLngInput(String(lng));
    setPropAddress(result.display_name);
    setSearchResults([]);
    setSearchQuery('');
    centerMapOn(lat, lng, 17);
  };

  // Save Property Coordinates & Address (CRUD Update / Create)
  const handleSavePropertyCoordinates = async () => {
    if (!activeProperty) return;
    setIsSavingProperty(true);

    try {
      const cleanLat = latInput.trim().replace(/[\u2212\u2013\u2014]/g, '-').replace(',', '.');
      const cleanLng = lngInput.trim().replace(/[\u2212\u2013\u2014]/g, '-').replace(',', '.');

      // Check if user explicitly cleared / deleted the coordinates
      if (cleanLat === '' || cleanLng === '' || (cleanLat === '0' && cleanLng === '0')) {
        const updated = await database.saveProperty({
          id: activeProperty.id,
          name: activeProperty.name,
          address: propAddress || activeProperty.address,
          lat: 0,
          lng: 0
        });
        isUserEditingRef.current = false;
        lastSavedCoordsRef.current = { lat: 0, lng: 0 };
        setPropLat(0);
        setPropLng(0);
        setLatInput('');
        setLngInput('');
        setCoordFeedback('Titik koordinat berhasil dikosongkan/dihapus.');
        clearFacilityCache(activeProperty.id);
        if (onPropertyUpdated) onPropertyUpdated(updated);
        if (showToast) showToast(`Titik koordinat untuk ${activeProperty.name} berhasil dikosongkan.`, 'success');
        return;
      }

      const norm = normalizeCoordinatePair(cleanLat, cleanLng) || normalizeCoordinatePair(propLat, propLng);
      if (!norm) {
        setCoordFeedback('Format koordinat tidak valid. Harap masukkan angka latitude dan longitude yang valid.');
        setIsSavingProperty(false);
        return;
      }
      const finalLat = norm.lat;
      const finalLng = norm.lng;

      const updated = await database.saveProperty({
        id: activeProperty.id,
        name: activeProperty.name,
        address: propAddress || activeProperty.address,
        lat: finalLat,
        lng: finalLng
      });

      // Update state with finalized values and reset editing guard
      isUserEditingRef.current = false;
      lastSavedCoordsRef.current = { lat: finalLat, lng: finalLng };
      setPropLat(finalLat);
      setPropLng(finalLng);
      setLatInput(String(finalLat));
      setLngInput(String(finalLng));
      setCoordFeedback(`Koordinat berhasil disimpan: Lat ${finalLat}, Lng ${finalLng}`);

      // Clear Overpass cache for this property
      clearFacilityCache(activeProperty.id);

      if (onPropertyUpdated) {
        onPropertyUpdated(updated);
      }

      if (showToast) {
        showToast(`Koordinat GPS untuk ${activeProperty.name} berhasil disimpan! (${finalLat}, ${finalLng})`, 'success');
      }
    } catch (err: any) {
      console.error('[AdminMapCoordinateManager] Save property coord error:', err);
      if (showToast) {
        showToast(err.message || 'Gagal menyimpan koordinat properti.', 'error');
      }
    } finally {
      setIsSavingProperty(false);
    }
  };

  // -------------------------------------------------------------
  // OPENSTREETMAP OVERPASS LIVE POI SCANNER & IMPORTER
  // -------------------------------------------------------------
  const handleScanOsmFacilities = async () => {
    setIsScanningOsm(true);
    setShowOsmScanModal(true);
    try {
      const results = await fetchNearbyAmenitiesFromOSM(
        selectedPropertyId,
        propLat,
        propLng,
        3000,
        true // Force fresh fetch
      );

      setOsmScanResults(results || []);
      // Select all by default
      const allIds = new Set((results || []).map(r => r.id));
      setSelectedOsmIds(allIds);

      if (results && results.length > 0 && showToast) {
        showToast(`Ditemukan ${results.length} fasilitas publik di sekitar properti dari OpenStreetMap!`);
      }
    } catch (err: any) {
      console.error('Scan OSM facilities error:', err);
      if (showToast) showToast('Gagal memindai data OpenStreetMap.', 'error');
    } finally {
      setIsScanningOsm(false);
    }
  };

  const handleToggleOsmItem = (id: string) => {
    setSelectedOsmIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllOsm = () => {
    if (selectedOsmIds.size === osmScanResults.length) {
      setSelectedOsmIds(new Set());
    } else {
      setSelectedOsmIds(new Set(osmScanResults.map(r => r.id)));
    }
  };

  const handleImportSelectedOsmAmenities = async () => {
    const toImport = osmScanResults.filter(r => selectedOsmIds.has(r.id));
    if (toImport.length === 0) {
      alert('Pilih minimal satu fasilitas untuk diimpor.');
      return;
    }

    setIsImportingOsm(true);
    try {
      // Map to proper Supabase payload
      const cleanedItems: NearbyAmenity[] = toImport.map((item, index) => ({
        id: `osm-${selectedPropertyId}-${Date.now()}-${index}`,
        propertyId: selectedPropertyId,
        name: item.name,
        category: item.category,
        distanceMeters: item.distanceMeters,
        walkingTimeMinutes: item.walkingTimeMinutes,
        drivingTimeMinutes: item.drivingTimeMinutes,
        lat: item.lat,
        lng: item.lng,
        description: item.description || '',
        address: item.address || '',
        icon: item.icon || 'MapPin'
      }));

      await database.batchSeedNearbyAmenities(cleanedItems);
      await loadAmenities(selectedPropertyId);
      clearFacilityCache(selectedPropertyId);

      setShowOsmScanModal(false);
      if (showToast) {
        showToast(`Berhasil mengimpor ${cleanedItems.length} fasilitas dari OpenStreetMap ke database!`);
      }
    } catch (err: any) {
      console.error('Import OSM facilities error:', err);
      if (showToast) showToast(err.message || 'Gagal mengimpor fasilitas.', 'error');
    } finally {
      setIsImportingOsm(false);
    }
  };

  // -------------------------------------------------------------
  // AMENITY CRUD HANDLERS
  // -------------------------------------------------------------
  const handleAddNewAmenity = () => {
    setIsAddingAmenity(true);
    setEditingAmenity(null);
    setGmapsAmenityInput('');
    setAmenityParseStatus({ status: 'idle' });

    // Place new amenity 200m offset from property
    const offsetLat = parseFloat((propLat + 0.0015).toFixed(6));
    const offsetLng = parseFloat((propLng + 0.0015).toFixed(6));
    const dist = calculateDistanceMeters(propLat, propLng, offsetLat, offsetLng);

    setAmenityForm({
      id: '',
      name: '',
      category: 'transit',
      lat: offsetLat,
      lng: offsetLng,
      distanceMeters: dist,
      walkingTimeMinutes: Math.max(1, Math.round(dist / 80)),
      drivingTimeMinutes: Math.max(1, Math.round(dist / 350)),
      description: '',
      address: ''
    });

    centerMapOn(offsetLat, offsetLng, 17);
  };

  const handleEditAmenity = (amenity: NearbyAmenity) => {
    setEditingAmenity(amenity);
    setIsAddingAmenity(false);
    setGmapsAmenityInput('');
    setAmenityParseStatus({ status: 'idle' });

    setAmenityForm({
      id: amenity.id,
      name: amenity.name,
      category: amenity.category,
      lat: amenity.lat,
      lng: amenity.lng,
      distanceMeters: amenity.distanceMeters,
      walkingTimeMinutes: amenity.walkingTimeMinutes,
      drivingTimeMinutes: amenity.drivingTimeMinutes || Math.max(1, Math.round(amenity.distanceMeters / 350)),
      description: amenity.description || '',
      address: amenity.address || ''
    });

    centerMapOn(amenity.lat, amenity.lng, 17);
  };

  const handleCancelAmenityForm = () => {
    setIsAddingAmenity(false);
    setEditingAmenity(null);
  };

  const handleSaveAmenity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amenityForm.name.trim()) {
      alert('Nama fasilitas wajib diisi.');
      return;
    }

    setIsSavingAmenity(true);
    try {
      const payload: NearbyAmenity = {
        id: editingAmenity ? editingAmenity.id : `amenity-${Date.now()}`,
        propertyId: selectedPropertyId,
        name: amenityForm.name.trim(),
        category: amenityForm.category,
        lat: amenityForm.lat,
        lng: amenityForm.lng,
        distanceMeters: amenityForm.distanceMeters,
        walkingTimeMinutes: amenityForm.walkingTimeMinutes,
        drivingTimeMinutes: amenityForm.drivingTimeMinutes,
        description: amenityForm.description.trim(),
        address: amenityForm.address.trim(),
        icon: amenityForm.category === 'transit' ? 'Train' : 'MapPin'
      };

      await database.saveNearbyAmenity(payload);

      await loadAmenities(selectedPropertyId);
      clearFacilityCache(selectedPropertyId);
      setIsAddingAmenity(false);
      setEditingAmenity(null);

      if (showToast) {
        showToast(`Fasilitas "${payload.name}" berhasil disimpan.`);
      }
    } catch (err: any) {
      console.error('[AdminMapCoordinateManager] Save amenity error:', err);
      if (showToast) {
        showToast(err.message || 'Gagal menyimpan fasilitas.', 'error');
      }
    } finally {
      setIsSavingAmenity(false);
    }
  };

  const handleDeleteAmenity = async (amenity: NearbyAmenity) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus fasilitas "${amenity.name}"?`)) return;

    try {
      await database.deleteNearbyAmenity(amenity.id);
      setAmenities(prev => prev.filter(a => a.id !== amenity.id));
      clearFacilityCache(selectedPropertyId);
      if (editingAmenity?.id === amenity.id) {
        setEditingAmenity(null);
      }
      if (showToast) showToast(`Fasilitas "${amenity.name}" berhasil dihapus.`);
    } catch (err: any) {
      console.error('[AdminMapCoordinateManager] Delete amenity error:', err);
      if (showToast) showToast(err.message || 'Gagal menghapus fasilitas.', 'error');
    }
  };

  return (
    <div className="space-y-6 font-sans text-slate-800 text-left">
      
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-200 pb-4 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-[#2E6F40] text-white rounded-xl shadow-xs">
              <Compass size={18} />
            </div>
            <div>
              <h2 className="text-xl font-black font-display text-slate-900 uppercase tracking-tight flex items-center gap-2">
                <span>Peta & Manajemen Titik Koordinat GPS</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-mono">
                  OpenStreetMap + Leaflet
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Atur koordinat latitude/longitude kos, tarik fasilitas publik otomatis dari OpenStreetMap (Overpass API), atau salin link Google Maps.
              </p>
            </div>
          </div>
        </div>

        {/* Property Switcher */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono shrink-0">
            Cabang:
          </label>
          <select
            value={selectedPropertyId}
            onChange={(e) => {
              const id = Number(e.target.value);
              setSelectedPropertyId(id);
              setIsAddingAmenity(false);
              setEditingAmenity(null);
            }}
            className="bg-slate-50 border border-slate-300 text-slate-900 text-xs font-bold rounded-xl px-3 py-2 outline-none focus:border-[#2E6F40] cursor-pointer w-full md:w-64"
          >
            {properties.map((prop) => (
              <option key={prop.id} value={prop.id}>
                {prop.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Grid: Interactive Map (Left) + Coordinate Control Panel (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ==================================================== */}
        {/* LEFT COLUMN: INTERACTIVE LEAFLET MAP */}
        {/* ==================================================== */}
        <div className="lg:col-span-7 space-y-3">
          
          <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            
            {/* Map Search Bar */}
            <form onSubmit={handleSearchAddress} className="flex gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari lokasi/alamat via OpenStreetMap Nominatim..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:bg-white focus:border-[#2E6F40] transition"
                />
              </div>
              <button
                type="submit"
                disabled={isSearching}
                className="px-4 py-2 bg-[#2E6F40] hover:bg-[#235531] text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 shrink-0 disabled:opacity-50"
              >
                {isSearching ? <RotateCw size={13} className="animate-spin" /> : <Search size={13} />}
                <span>Cari</span>
              </button>
            </form>

            {/* Search Results Dropdown */}
            {searchResults.length > 0 && (
              <div className="p-2 bg-slate-50 rounded-xl border border-slate-200 space-y-1 max-h-48 overflow-y-auto">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">
                  Hasil Pencarian Lokasi:
                </div>
                {searchResults.map((res, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectSearchResult(res)}
                    className="w-full text-left p-2 hover:bg-emerald-50 rounded-lg text-xs transition flex items-start gap-2 cursor-pointer"
                  >
                    <MapPin size={14} className="text-[#2E6F40] shrink-0 mt-0.5" />
                    <div className="flex-1 truncate">
                      <span className="font-bold text-slate-800 block truncate">{res.display_name}</span>
                      <span className="text-[10px] font-mono text-slate-500">{res.lat}, {res.lon}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Quick Layer Switcher */}
            <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-slate-100 text-xs">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Layers size={13} className="text-slate-500" />
                <span className="text-[11px] font-bold text-slate-500">Tampilan Peta:</span>
                <button
                  type="button"
                  onClick={() => setActiveTileType('google-roadmap')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                    activeTileType === 'google-roadmap' 
                      ? 'bg-[#2E6F40] text-white shadow-xs' 
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Google Maps (Resmi)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTileType('google-hybrid')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                    activeTileType === 'google-hybrid' 
                      ? 'bg-[#2E6F40] text-white shadow-xs' 
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Google Satelit
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTileType('osm')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                    activeTileType === 'osm' 
                      ? 'bg-[#2E6F40] text-white shadow-xs' 
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  OpenStreetMap
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTileType('satellite')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                    activeTileType === 'satellite' 
                      ? 'bg-[#2E6F40] text-white shadow-xs' 
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Satelit Esri
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => centerMapOn(propLat, propLng, 17)}
                  className="text-[10px] font-bold text-[#2E6F40] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Building2 size={11} />
                  <span>Fokus Properti</span>
                </button>
              </div>
            </div>

            {/* Leaflet Map DOM Container */}
            <div className="relative w-full h-[460px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
              <div ref={mapContainerRef} className="w-full h-full z-10" />

              {/* Error Banner */}
              {mapTileError && (
                <div className="absolute top-3 left-3 right-3 z-[500] bg-rose-600/90 text-white text-xs p-2.5 rounded-xl shadow-lg flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span className="flex-1">{mapTileError}</span>
                  <button onClick={() => setMapTileError(null)} className="text-white font-bold">✕</button>
                </div>
              )}

              {/* Interactive Helper Overlay */}
              <div className="absolute bottom-3 right-3 z-[400] bg-slate-900/85 text-white px-3 py-1.5 rounded-xl text-[10px] font-mono shadow-md backdrop-blur-xs flex items-center gap-2">
                <span>Lat: {propLat.toFixed(6)}, Lng: {propLng.toFixed(6)}</span>
              </div>
            </div>

            {/* Map Instruction Help Note */}
            <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-start gap-2">
              <Info size={15} className="text-[#2E6F40] shrink-0 mt-0.5" />
              <div className="text-[11px] leading-relaxed">
                <strong>Tips Navigasi Peta:</strong> Klik di peta atau geser (drag) penanda gedung 🏢 untuk memindahkan posisi properti secara realtime. Saat menambah/mengedit fasilitas publik, klik di peta untuk menaruh pin fasilitas tersebut.
              </div>
            </div>

          </div>

        </div>

        {/* ==================================================== */}
        {/* RIGHT COLUMN: PROPERTY & AMENITY CONTROLS */}
        {/* ==================================================== */}
        <div className="lg:col-span-5 space-y-5">
          
          {/* Card 1: Property Location Coordinates (CRUD Manager) */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            
            <div className="flex justify-between items-start flex-wrap gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black font-mono text-[#2E6F40] uppercase tracking-wider block">
                    TITIK KOORDINAT PROPERTI
                  </span>
                  {isDirty ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                      <span>Belum Disimpan</span>
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                      <Check size={10} className="text-emerald-700" />
                      <span>Tersimpan di Supabase</span>
                    </span>
                  )}
                </div>
                <h3 className="text-base font-extrabold text-slate-900 mt-0.5">
                  {activeProperty?.name || 'Cabang Kos'}
                </h3>
              </div>
              
              <div className="flex items-center gap-1.5">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${propLat},${propLng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] font-bold text-[#2E6F40] hover:underline flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded-lg border border-emerald-200 transition"
                  title="Buka titik koordinat di Google Maps tab baru"
                >
                  <span>Google Maps</span>
                  <ExternalLink size={10} />
                </a>
              </div>
            </div>

            {/* Real Properties Switcher & Device GPS */}
            <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-600 uppercase font-mono flex items-center gap-1">
                  <Building2 size={11} className="text-[#2E6F40]" />
                  <span>Pilih Cabang Properti:</span>
                </span>
                <button
                  type="button"
                  onClick={handleUseCurrentLocation}
                  className="text-[10px] font-bold text-[#2E6F40] hover:text-[#1e4b2a] flex items-center gap-1 bg-white hover:bg-emerald-50 px-2 py-0.5 rounded-md border border-slate-200 cursor-pointer shadow-2xs"
                  title="Gunakan posisi GPS perangkat saat ini"
                >
                  <Crosshair size={10} />
                  <span>GPS Saya</span>
                </button>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {properties.map(p => {
                  const isSelected = p.id === selectedPropertyId;
                  const hasCoords = Boolean(p.lat && p.lng && (p.lat !== 0 || p.lng !== 0));
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPropertyId(p.id)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer flex items-center gap-1.5 ${
                        isSelected 
                          ? 'bg-[#2E6F40] text-white shadow-xs'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      <Building2 size={10} className={isSelected ? 'text-white' : 'text-slate-500'} />
                      <span>{p.name}</span>
                      {hasCoords ? (
                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-emerald-200' : 'bg-emerald-500'}`} title="Koordinat terisi" />
                      ) : (
                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-amber-200' : 'bg-amber-400'}`} title="Koordinat belum diatur" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Google Maps Smart Paste Input */}
            <div className="space-y-1.5 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <ClipboardPaste size={13} className="text-[#2E6F40]" />
                  <span>Smart Paste (Link / Koordinat Google Maps)</span>
                </label>
                <div className="flex items-center gap-2">
                  {gmapsPropInput && (
                    <button
                      type="button"
                      onClick={() => {
                        setGmapsPropInput('');
                        setPropParseStatus({ status: 'idle' });
                      }}
                      className="text-[10px] text-slate-400 hover:text-slate-600 font-bold"
                    >
                      Bersihkan
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowGmapsGuide(!showGmapsGuide)}
                    className="text-[10px] text-[#2E6F40] font-bold hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <HelpCircle size={10} />
                    <span>Panduan</span>
                  </button>
                </div>
              </div>

              <input
                type="text"
                value={gmapsPropInput}
                onChange={(e) => handleGmapsPropPaste(e.target.value)}
                placeholder="Paste link https://maps.app.goo.gl/... atau koordinat -6.1956, 106.8488"
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 outline-none focus:border-[#2E6F40]"
              />

              {propParseStatus.status === 'success' && (
                <div className="text-[11px] text-emerald-700 font-bold flex items-center gap-1 pt-0.5">
                  <CheckCircle size={12} className="text-emerald-600 shrink-0" />
                  <span>{propParseStatus.message}</span>
                </div>
              )}
              {propParseStatus.status === 'error' && (
                <div className="text-[11px] text-rose-600 font-medium flex items-center gap-1 pt-0.5">
                  <AlertCircle size={12} className="text-rose-500 shrink-0" />
                  <span>{propParseStatus.message}</span>
                </div>
              )}

              {showGmapsGuide && (
                <div className="p-2.5 bg-white border border-slate-200 rounded-lg text-[10px] text-slate-600 space-y-1 leading-relaxed mt-2 animate-fade-in">
                  <p className="font-bold text-slate-800">Cara cepat ambil koordinat dari Google Maps:</p>
                  <ol className="list-decimal pl-4 space-y-0.5">
                    <li>Buka Google Maps di browser / HP, cari lokasi kos.</li>
                    <li>Klik kanan pada titik lokasi, klik angka koordinat paling atas untuk copy.</li>
                    <li>Atau salin (copy) link URL Google Maps dari address bar.</li>
                    <li>Tempel (paste) ke kotak di atas & koordinat akan otomatis terisi!</li>
                  </ol>
                </div>
              )}
            </div>

            {/* Latitude & Longitude Inputs */}
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[11px] font-bold text-slate-600 uppercase font-mono">
                      Latitude:
                    </label>
                    <span className="text-[9px] text-slate-400 font-mono">Contoh: -6.162249</span>
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={latInput}
                    onChange={(e) => handleLatInputChange(e.target.value)}
                    onBlur={handleCoordBlur}
                    placeholder="-6.162249"
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-800 outline-none focus:bg-white focus:border-[#2E6F40] transition"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[11px] font-bold text-slate-600 uppercase font-mono">
                      Longitude:
                    </label>
                    <span className="text-[9px] text-slate-400 font-mono">Contoh: 106.865001</span>
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={lngInput}
                    onChange={(e) => handleLngInputChange(e.target.value)}
                    onBlur={handleCoordBlur}
                    placeholder="106.865001"
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-800 outline-none focus:bg-white focus:border-[#2E6F40] transition"
                  />
                </div>
              </div>

              {/* Coordinate quick utility buttons */}
              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyCoords}
                    className="text-[10px] font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
                    title="Salin pasangan koordinat Lat, Lng"
                  >
                    {copiedCoords ? <ClipboardCheck size={11} className="text-emerald-600" /> : <Copy size={11} />}
                    <span>{copiedCoords ? 'Tersalin!' : 'Salin Koordinat'}</span>
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => centerMapOn(propLat, propLng, 17)}
                    className="text-[10px] font-bold text-[#2E6F40] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Navigation size={11} />
                    <span>Fokus Peta</span>
                  </button>
                </div>
              </div>

              {coordFeedback && (
                <div className="text-[10px] text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1 mt-1 border border-emerald-200">
                  <CheckCircle size={11} className="text-emerald-600 shrink-0" />
                  <span>{coordFeedback}</span>
                </div>
              )}
            </div>

            {/* Address Input */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[11px] font-bold text-slate-600 uppercase font-mono">
                  Alamat Lengkap:
                </label>
                <button
                  type="button"
                  onClick={() => handleReverseGeocode(propLat, propLng)}
                  className="text-[10px] text-[#2E6F40] font-bold hover:underline cursor-pointer flex items-center gap-1"
                >
                  <span>⚡ Deteksi Alamat Otomatis</span>
                </button>
              </div>
              <textarea
                rows={2}
                value={propAddress}
                onChange={(e) => {
                  isUserEditingRef.current = true;
                  setPropAddress(e.target.value);
                }}
                placeholder="Alamat fisik properti..."
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 outline-none focus:bg-white focus:border-[#2E6F40] transition"
              />
            </div>

            {/* CRUD Action Buttons */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleSavePropertyCoordinates}
                disabled={isSavingProperty}
                className="w-full py-2.5 bg-[#2E6F40] hover:bg-[#235531] text-white text-xs font-extrabold uppercase tracking-wider rounded-xl transition shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSavingProperty ? <RotateCw size={14} className="animate-spin" /> : <Check size={14} />}
                <span>{isSavingProperty ? 'Menyimpan ke Supabase...' : 'Simpan Titik Koordinat'}</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleRevertCoordinates}
                  disabled={!isDirty || isSavingProperty}
                  className="py-1.5 px-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 text-[11px] font-bold rounded-lg transition flex items-center justify-center gap-1 cursor-pointer"
                  title="Batalkan perubahan dan kembalikan ke data tersimpan di Supabase"
                >
                  <Undo2 size={12} />
                  <span>Batal / Reset</span>
                </button>

                <button
                  type="button"
                  onClick={handleClearCoordinates}
                  disabled={isSavingProperty || (!latInput && !lngInput)}
                  className="py-1.5 px-2 bg-rose-50 hover:bg-rose-100 disabled:opacity-40 text-rose-700 border border-rose-200 text-[11px] font-bold rounded-lg transition flex items-center justify-center gap-1 cursor-pointer"
                  title="Kosongkan koordinat untuk properti ini"
                >
                  <Trash2 size={12} />
                  <span>Kosongkan Pin</span>
                </button>
              </div>
            </div>

          </div>

          {/* Card 2: Nearby Amenities & OpenStreetMap Auto-Scan Engine */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div>
                <span className="text-[10px] font-black font-mono text-[#2E6F40] uppercase tracking-wider block">
                  FASILITAS UMUM SEKITAR
                </span>
                <h4 className="text-sm font-extrabold text-slate-900">
                  Daftar POI Terdekat ({amenities.length})
                </h4>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Auto Scan from OSM Overpass Button */}
                <button
                  type="button"
                  onClick={handleScanOsmFacilities}
                  disabled={isScanningOsm}
                  className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-extrabold transition flex items-center gap-1 cursor-pointer shadow-xs disabled:opacity-50"
                  title="Pindai POI publik sekitar kos dari OpenStreetMap"
                >
                  <Globe size={12} className={isScanningOsm ? 'animate-spin' : ''} />
                  <span>{isScanningOsm ? 'Memindai...' : 'Tarik dari OSM'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleAddNewAmenity}
                  className="px-2.5 py-1.5 bg-[#3A444D] hover:bg-slate-800 text-white rounded-xl text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={12} />
                  <span>Manual</span>
                </button>
              </div>
            </div>

            {/* Amenity Add/Edit Form Modal/Section */}
            {(isAddingAmenity || editingAmenity) && (
              <form onSubmit={handleSaveAmenity} className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-2xl space-y-3 animate-fade-in">
                <div className="flex justify-between items-center border-b border-emerald-200/60 pb-2">
                  <span className="text-xs font-black text-[#2E6F40] uppercase tracking-wide flex items-center gap-1.5">
                    <Edit2 size={12} />
                    {editingAmenity ? `Edit Fasilitas: ${editingAmenity.name}` : 'Tambah Titik Fasilitas Baru'}
                  </span>
                  <button
                    type="button"
                    onClick={handleCancelAmenityForm}
                    className="text-slate-400 hover:text-slate-600 font-bold text-xs"
                  >
                    ✕
                  </button>
                </div>

                {/* Smart Paste for Amenity */}
                <div className="space-y-1">
                  <input
                    type="text"
                    value={gmapsAmenityInput}
                    onChange={(e) => handleGmapsAmenityPaste(e.target.value)}
                    placeholder="Smart Paste Google Maps fasilitas..."
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 outline-none focus:border-[#2E6F40]"
                  />
                  {amenityParseStatus.status === 'success' && (
                    <div className="text-[10px] text-emerald-700 font-bold flex items-center gap-1">
                      <CheckCircle size={10} className="shrink-0" />
                      <span>{amenityParseStatus.message}</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">Nama Fasilitas:</label>
                    <input
                      type="text"
                      required
                      value={amenityForm.name}
                      onChange={(e) => setAmenityForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Contoh: Stasiun KRL / Kampus / Rumah Sakit"
                      className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 outline-none focus:border-[#2E6F40]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">Kategori:</label>
                    <select
                      value={amenityForm.category}
                      onChange={(e) => setAmenityForm(prev => ({ ...prev, category: e.target.value as AmenityCategory }))}
                      className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 outline-none focus:border-[#2E6F40] cursor-pointer"
                    >
                      {AMENITY_CATEGORIES.map(c => (
                        <option key={c.id} value={c.id}>{c.labelId}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">Jarak (Meter):</label>
                    <input
                      type="number"
                      value={amenityForm.distanceMeters}
                      onChange={(e) => setAmenityForm(prev => ({ ...prev, distanceMeters: Number(e.target.value) }))}
                      className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">Jalan Kaki (Mnt):</label>
                    <input
                      type="number"
                      value={amenityForm.walkingTimeMinutes}
                      onChange={(e) => setAmenityForm(prev => ({ ...prev, walkingTimeMinutes: Number(e.target.value) }))}
                      className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">Motor (Mnt):</label>
                    <input
                      type="number"
                      value={amenityForm.drivingTimeMinutes}
                      onChange={(e) => setAmenityForm(prev => ({ ...prev, drivingTimeMinutes: Number(e.target.value) }))}
                      className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-600 block mb-1">Deskripsi Singkat:</label>
                  <input
                    type="text"
                    value={amenityForm.description}
                    onChange={(e) => setAmenityForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Contoh: Akses KRL Commuter Line & TransJakarta..."
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 outline-none focus:border-[#2E6F40]"
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={isSavingAmenity}
                    className="flex-1 py-2 bg-[#2E6F40] hover:bg-[#235531] text-white text-xs font-extrabold uppercase rounded-lg transition cursor-pointer disabled:opacity-50"
                  >
                    {isSavingAmenity ? 'Menyimpan...' : 'Simpan Fasilitas'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelAmenityForm}
                    className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg transition cursor-pointer"
                  >
                    Batal
                  </button>
                </div>
              </form>
            )}

            {/* Amenity List Filter Pills */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer shrink-0 ${
                  selectedCategory === 'all' ? 'bg-[#3A444D] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Semua ({amenities.length})
              </button>
              {AMENITY_CATEGORIES.map(c => {
                const count = amenities.filter(a => a.category === c.id).length;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedCategory(c.id)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer shrink-0 ${
                      selectedCategory === c.id ? 'shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                    style={{
                      backgroundColor: selectedCategory === c.id ? c.bgColor : undefined,
                      color: selectedCategory === c.id ? c.color : undefined
                    }}
                  >
                    {c.labelId} ({count})
                  </button>
                );
              })}
            </div>

            {/* Amenity Items List */}
            <div className="space-y-2 max-h-72 overflow-y-auto divide-y divide-slate-100 pr-1">
              {amenities
                .filter(a => selectedCategory === 'all' || a.category === selectedCategory)
                .map(amenity => {
                  const catConfig = AMENITY_CATEGORIES.find(c => c.id === amenity.category) || AMENITY_CATEGORIES[0];
                  return (
                    <div
                      key={amenity.id}
                      className="pt-2 pb-1 flex justify-between items-start gap-2 hover:bg-slate-50 p-2 rounded-xl transition"
                    >
                      <div className="space-y-0.5 flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className="text-[9px] font-bold px-1.5 py-0.2 rounded"
                            style={{ backgroundColor: catConfig.bgColor, color: catConfig.color }}
                          >
                            {catConfig.labelId}
                          </span>
                          <span className="text-xs font-bold text-slate-900 truncate">
                            {amenity.name}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 truncate">
                          {amenity.description || amenity.address || '-'}
                        </p>
                        <div className="text-[10px] font-mono text-slate-400 flex items-center gap-2">
                          <span>📍 {amenity.distanceMeters}m</span>
                          <span>🚶‍♂️ {amenity.walkingTimeMinutes} mnt</span>
                          <span>🛵 {amenity.drivingTimeMinutes || 2} mnt</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleEditAmenity(amenity)}
                          className="p-1.5 hover:bg-slate-200 text-slate-600 rounded-lg transition"
                          title="Edit Fasilitas"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAmenity(amenity)}
                          className="p-1.5 hover:bg-rose-100 text-rose-600 rounded-lg transition"
                          title="Hapus Fasilitas"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}

              {amenities.length === 0 && !isLoadingAmenities && (
                <div className="p-6 text-center text-slate-400 text-xs">
                  Belum ada data fasilitas tersimpan. Klik "Tarik dari OSM" untuk memindai otomatis via OpenStreetMap.
                </div>
              )}
            </div>

          </div>

        </div>

      </div>

      {/* ==================================================== */}
      {/* OPENSTREETMAP SCAN & IMPORT MODAL */}
      {/* ==================================================== */}
      {showOsmScanModal && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[85vh] shadow-2xl flex flex-col overflow-hidden border border-slate-200 animate-scale-up">
            
            {/* Modal Header */}
            <div className="p-5 bg-[#3A444D] text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/20 rounded-xl text-emerald-400 border border-emerald-400/30">
                  <Globe size={18} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold">
                    Tarik Fasilitas dari OpenStreetMap (Overpass API)
                  </h3>
                  <p className="text-xs text-slate-300">
                    Radius 3 km di sekitar {activeProperty?.name} (Lat: {propLat.toFixed(4)}, Lng: {propLng.toFixed(4)})
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowOsmScanModal(false)}
                className="text-white/80 hover:text-white font-black text-sm p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              
              {isScanningOsm && (
                <div className="py-12 text-center space-y-3">
                  <RotateCw size={32} className="mx-auto text-emerald-600 animate-spin" />
                  <p className="text-xs font-bold text-slate-700">
                    Menghubungi server OpenStreetMap Overpass API...
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Memindai stasiun, kampus, rumah sakit, minimarket, dan kuliner di sekitar koordinat kos.
                  </p>
                </div>
              )}

              {!isScanningOsm && osmScanResults.length > 0 && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100 text-xs">
                    <span className="font-bold text-slate-700">
                      Ditemukan {osmScanResults.length} titik fasilitas. Pilih yang ingin disimpan ke database:
                    </span>
                    <button
                      type="button"
                      onClick={handleSelectAllOsm}
                      className="text-[11px] font-extrabold text-[#2E6F40] hover:underline cursor-pointer"
                    >
                      {selectedOsmIds.size === osmScanResults.length ? 'Batal Pilih Semua' : 'Pilih Semua'}
                    </button>
                  </div>

                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                    {osmScanResults.map(item => {
                      const isSelected = selectedOsmIds.has(item.id);
                      const catConfig = AMENITY_CATEGORIES.find(c => c.id === item.category) || AMENITY_CATEGORIES[0];

                      return (
                        <div
                          key={item.id}
                          onClick={() => handleToggleOsmItem(item.id)}
                          className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center gap-3 ${
                            isSelected
                              ? 'bg-emerald-50/70 border-emerald-400 shadow-xs'
                              : 'bg-white border-slate-200 hover:border-slate-300 opacity-70'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleOsmItem(item.id)}
                            className="w-4 h-4 rounded text-[#2E6F40] focus:ring-[#2E6F40] cursor-pointer"
                          />

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className="text-[9px] font-bold px-1.5 py-0.2 rounded"
                                style={{ backgroundColor: catConfig.bgColor, color: catConfig.color }}
                              >
                                {catConfig.labelId}
                              </span>
                              <span className="text-xs font-black text-slate-900 truncate">
                                {item.name}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                              {item.description || item.address}
                            </p>
                          </div>

                          <div className="text-right shrink-0 text-xs">
                            <span className="font-black font-mono text-[#2E6F40] block">
                              {item.distanceMeters < 1000 ? `${item.distanceMeters} m` : `${(item.distanceMeters / 1000).toFixed(1)} km`}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium">
                              🚶‍♂️ {item.walkingTimeMinutes} mnt
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {!isScanningOsm && osmScanResults.length === 0 && (
                <div className="py-10 text-center space-y-2">
                  <AlertCircle size={28} className="mx-auto text-amber-500" />
                  <p className="text-xs font-bold text-slate-700">Tidak ada POI yang ditemukan dalam radius 3 km</p>
                  <p className="text-[11px] text-slate-400">Pastikan koordinat properti akurat dan terisi dengan benar.</p>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center shrink-0">
              <span className="text-xs text-slate-500 font-medium">
                {selectedOsmIds.size} fasilitas dipilih
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowOsmScanModal(false)}
                  className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={handleImportSelectedOsmAmenities}
                  disabled={isImportingOsm || selectedOsmIds.size === 0}
                  className="px-5 py-2 bg-[#2E6F40] hover:bg-[#235531] text-white text-xs font-extrabold uppercase tracking-wider rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isImportingOsm ? <RotateCw size={13} className="animate-spin" /> : <DownloadCloud size={13} />}
                  <span>{isImportingOsm ? 'Mengimpor...' : 'Impor ke Database'}</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default AdminMapCoordinateManager;
