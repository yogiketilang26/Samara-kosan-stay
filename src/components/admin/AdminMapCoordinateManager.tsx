import React, { useState, useEffect, useRef } from 'react';
import { Property, NearbyAmenity, AmenityCategory } from '../../types';
import { database } from '../../lib/supabase';
import { AMENITY_CATEGORIES, AmenityCategoryConfig, INITIAL_NEARBY_AMENITIES } from '../../data/nearbyAmenities';
import { 
  MapPin, Compass, Search, Navigation, CheckCircle, 
  Trash2, Plus, Edit2, RotateCw, Sparkles, Building2, 
  ExternalLink, Layers, Info, Check, X, AlertCircle, ArrowUpRight
} from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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

  // Property Coordinate Form
  const [propLat, setPropLat] = useState<number>(-6.195621);
  const [propLng, setPropLng] = useState<number>(106.848815);
  const [propAddress, setPropAddress] = useState<string>('');
  const [isSavingProperty, setIsSavingProperty] = useState(false);

  // Amenities Data & State
  const [amenities, setAmenities] = useState<NearbyAmenity[]>([]);
  const [isLoadingAmenities, setIsLoadingAmenities] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isAddingAmenity, setIsAddingAmenity] = useState(false);
  const [editingAmenity, setEditingAmenity] = useState<NearbyAmenity | null>(null);
  const [isSavingAmenity, setIsSavingAmenity] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

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
  const amenityMarkersRef = useRef<{ [id: string]: L.Marker }>({});
  const activeTileLayerRef = useRef<L.TileLayer | null>(null);
  const [activeTileType, setActiveTileType] = useState<'streets' | 'satellite' | 'positron'>('positron');

  // Update active property when selected ID changes or properties list updates
  useEffect(() => {
    const found = properties.find(p => p.id === selectedPropertyId) || properties[0] || null;
    setActiveProperty(found);
    if (found) {
      setPropLat(found.lat || -6.195621);
      setPropLng(found.lng || 106.848815);
      setPropAddress(found.address || '');
    }
  }, [selectedPropertyId, properties]);

  // Fetch amenities from Supabase for current property
  const loadAmenities = async (propId: number) => {
    setIsLoadingAmenities(true);
    try {
      const data = await database.fetchNearbyAmenities(propId);
      setAmenities(data);
    } catch (err: any) {
      console.error('[AdminMapCoordinateManager] Load amenities error:', err);
      if (showToast) showToast('Gagal memuat titik fasilitas sekitar.', 'error');
    } finally {
      setIsLoadingAmenities(false);
    }
  };

  useEffect(() => {
    if (selectedPropertyId) {
      loadAmenities(selectedPropertyId);
    }
  }, [selectedPropertyId]);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [propLat, propLng],
        zoom: 16,
        zoomControl: true,
        attributionControl: false
      });

      // Default light tile layer
      const tile = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19
      }).addTo(map);

      activeTileLayerRef.current = tile;
      mapRef.current = map;

      // Click on map to update position
      map.on('click', (e: L.LeafletMouseEvent) => {
        const lat = parseFloat(e.latlng.lat.toFixed(6));
        const lng = parseFloat(e.latlng.lng.toFixed(6));

        // If currently adding/editing an amenity, set amenity position
        if (isAddingAmenity || editingAmenity) {
          setAmenityForm(prev => {
            const dist = calculateDistanceMeters(propLat, propLng, lat, lng);
            const walk = Math.max(1, Math.round(dist / 80));
            const drive = Math.max(1, Math.round(dist / 400));
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
          setPropLat(lat);
          setPropLng(lng);
        }
      });
    }

    return () => {
      // Don't destroy on every state, preserve instance
    };
  }, []);

  // Update Tile Layer
  useEffect(() => {
    if (!mapRef.current) return;
    if (activeTileLayerRef.current) {
      mapRef.current.removeLayer(activeTileLayerRef.current);
    }

    let url = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    if (activeTileType === 'satellite') {
      url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    } else if (activeTileType === 'streets') {
      url = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    }

    const tile = L.tileLayer(url, { maxZoom: 19 }).addTo(mapRef.current);
    activeTileLayerRef.current = tile;
  }, [activeTileType]);

  // Update Property Marker
  useEffect(() => {
    if (!mapRef.current) return;

    if (propertyMarkerRef.current) {
      propertyMarkerRef.current.remove();
      propertyMarkerRef.current = null;
    }

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
    }).addTo(mapRef.current);

    marker.on('dragend', (e: any) => {
      const pos = e.target.getLatLng();
      const lat = parseFloat(pos.lat.toFixed(6));
      const lng = parseFloat(pos.lng.toFixed(6));
      setPropLat(lat);
      setPropLng(lng);
    });

    marker.bindPopup(`
      <div style="font-family:sans-serif; font-size:11px; padding:4px;">
        <strong style="color:#2E6F40; font-size:12px; display:block;">${activeProperty?.name}</strong>
        <p style="margin:4px 0 0 0; color:#64748B;">Geser (drag) pin ini untuk mengubah titik koordinat secara akurat.</p>
        <div style="margin-top:6px; font-family:monospace; font-size:10px; background:#F1F5F9; padding:3px 6px; border-radius:4px;">
          LAT: ${propLat}<br/>LNG: ${propLng}
        </div>
      </div>
    `);

    propertyMarkerRef.current = marker;
  }, [propLat, propLng, activeProperty]);

  // Update Amenity Markers on Map
  useEffect(() => {
    if (!mapRef.current) return;

    // Clear old amenity markers
    (Object.values(amenityMarkersRef.current) as L.Marker[]).forEach(m => m.remove());
    amenityMarkersRef.current = {};

    const filtered = selectedCategory === 'all' 
      ? amenities 
      : amenities.filter(a => a.category === selectedCategory);

    filtered.forEach(amenity => {
      const catConfig = AMENITY_CATEGORIES.find(c => c.id === amenity.category) || AMENITY_CATEGORIES[0];
      const isBeingEdited = editingAmenity?.id === amenity.id;

      const markerHtml = `
        <div style="display:flex; flex-direction:column; align-items:center; cursor:${isBeingEdited ? 'grab' : 'pointer'};">
          <div style="background:${isBeingEdited ? '#F59E0B' : catConfig.color}; color:white; font-size:9px; font-weight:800; padding:2px 6px; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.25); border:1.5px solid white; white-space:nowrap;">
            ${amenity.name} (${amenity.distanceMeters}m)
          </div>
          <div style="width:0; height:0; border-left:4px solid transparent; border-right:4px solid transparent; border-top:6px solid ${isBeingEdited ? '#F59E0B' : catConfig.color};"></div>
        </div>
      `;

      const amenityIcon = L.divIcon({
        className: 'custom-amenity-marker',
        html: markerHtml,
        iconSize: [100, 36],
        iconAnchor: [50, 36]
      });

      const marker = L.marker([amenity.lat, amenity.lng], {
        icon: amenityIcon,
        draggable: isBeingEdited
      }).addTo(mapRef.current!);

      if (isBeingEdited) {
        marker.on('dragend', (e: any) => {
          const pos = e.target.getLatLng();
          const lat = parseFloat(pos.lat.toFixed(6));
          const lng = parseFloat(pos.lng.toFixed(6));
          const dist = calculateDistanceMeters(propLat, propLng, lat, lng);
          const walk = Math.max(1, Math.round(dist / 80));
          const drive = Math.max(1, Math.round(dist / 400));
          setAmenityForm(prev => ({
            ...prev,
            lat,
            lng,
            distanceMeters: dist,
            walkingTimeMinutes: walk,
            drivingTimeMinutes: drive
          }));
        });
      }

      marker.on('click', () => {
        if (!isAddingAmenity && !editingAmenity) {
          handleStartEditAmenity(amenity);
        }
      });

      amenityMarkersRef.current[amenity.id] = marker;
    });
  }, [amenities, selectedCategory, editingAmenity, isAddingAmenity, propLat, propLng]);

  // Center map on coordinates
  const centerMapOn = (lat: number, lng: number, zoom = 16) => {
    if (mapRef.current) {
      mapRef.current.flyTo([lat, lng], zoom, { duration: 1.2 });
    }
  };

  // Search Address or Landmarks via OpenStreetMap Nominatim
  const handleSearchLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const endpoint = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        searchQuery + ', Indonesia'
      )}&limit=5`;
      const res = await fetch(endpoint, {
        headers: {
          'Accept-Language': 'id,en',
          'User-Agent': 'SamaraStay-AdminMapManager/1.0'
        }
      });
      const data = await res.json();
      setSearchResults(data || []);
    } catch (err) {
      console.error('Nominatim search error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleApplySearchResult = (result: any) => {
    const lat = parseFloat(parseFloat(result.lat).toFixed(6));
    const lng = parseFloat(parseFloat(result.lon).toFixed(6));

    if (isAddingAmenity || editingAmenity) {
      const dist = calculateDistanceMeters(propLat, propLng, lat, lng);
      setAmenityForm(prev => ({
        ...prev,
        name: prev.name || result.display_name.split(',')[0],
        address: result.display_name,
        lat,
        lng,
        distanceMeters: dist,
        walkingTimeMinutes: Math.max(1, Math.round(dist / 80)),
        drivingTimeMinutes: Math.max(1, Math.round(dist / 400))
      }));
    } else {
      setPropLat(lat);
      setPropLng(lng);
      if (!propAddress) {
        setPropAddress(result.display_name);
      }
    }

    centerMapOn(lat, lng, 17);
    setSearchResults([]);
    setSearchQuery('');
    if (showToast) showToast('Lokasi berhasil ditemukan & diposisikan pada peta.');
  };

  // Device Geolocation
  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Browser tidak mendukung geolokasi GPS.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = parseFloat(pos.coords.latitude.toFixed(6));
        const lng = parseFloat(pos.coords.longitude.toFixed(6));
        if (isAddingAmenity || editingAmenity) {
          const dist = calculateDistanceMeters(propLat, propLng, lat, lng);
          setAmenityForm(prev => ({
            ...prev,
            lat,
            lng,
            distanceMeters: dist,
            walkingTimeMinutes: Math.max(1, Math.round(dist / 80)),
            drivingTimeMinutes: Math.max(1, Math.round(dist / 400))
          }));
        } else {
          setPropLat(lat);
          setPropLng(lng);
        }
        centerMapOn(lat, lng, 17);
        if (showToast) showToast('Koordinat GPS perangkat berhasil diambil.');
      },
      (err) => {
        console.warn('Geolocation error:', err);
        alert('Gagal mengambil lokasi GPS perangkat: ' + err.message);
      },
      { enableHighAccuracy: true }
    );
  };

  // Save Property Accurate Coordinates
  const handleSavePropertyCoordinates = async () => {
    if (!activeProperty) return;
    setIsSavingProperty(true);
    try {
      const updated = await database.saveProperty({
        ...activeProperty,
        lat: propLat,
        lng: propLng,
        address: propAddress || activeProperty.address
      });

      if (onPropertyUpdated) {
        onPropertyUpdated(updated);
      }
      if (showToast) showToast(`Titik koordinat ${activeProperty.name} berhasil disimpan ke Supabase!`);
    } catch (err: any) {
      console.error('[AdminMapCoordinateManager] Save property coord error:', err);
      if (showToast) showToast(err.message || 'Gagal menyimpan koordinat properti.', 'error');
    } finally {
      setIsSavingProperty(false);
    }
  };

  // Start Adding Amenity
  const handleStartAddAmenity = () => {
    const defaultLat = parseFloat((propLat + 0.0015).toFixed(6));
    const defaultLng = parseFloat((propLng + 0.0015).toFixed(6));
    const dist = calculateDistanceMeters(propLat, propLng, defaultLat, defaultLng);

    setAmenityForm({
      id: `amenity-${Date.now()}`,
      name: '',
      category: 'transit',
      lat: defaultLat,
      lng: defaultLng,
      distanceMeters: dist,
      walkingTimeMinutes: Math.max(1, Math.round(dist / 80)),
      drivingTimeMinutes: Math.max(1, Math.round(dist / 400)),
      description: '',
      address: ''
    });
    setEditingAmenity(null);
    setIsAddingAmenity(true);
    centerMapOn(defaultLat, defaultLng, 16);
  };

  // Start Editing Amenity
  const handleStartEditAmenity = (amenity: NearbyAmenity) => {
    setAmenityForm({
      id: amenity.id,
      name: amenity.name,
      category: amenity.category,
      lat: amenity.lat,
      lng: amenity.lng,
      distanceMeters: amenity.distanceMeters,
      walkingTimeMinutes: amenity.walkingTimeMinutes,
      drivingTimeMinutes: amenity.drivingTimeMinutes || Math.max(1, Math.round(amenity.distanceMeters / 400)),
      description: amenity.description || '',
      address: amenity.address || ''
    });
    setEditingAmenity(amenity);
    setIsAddingAmenity(false);
    centerMapOn(amenity.lat, amenity.lng, 17);
  };

  // Save Amenity to Supabase
  const handleSaveAmenity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amenityForm.name.trim()) {
      alert('Nama fasilitas wajib diisi.');
      return;
    }

    setIsSavingAmenity(true);
    try {
      const payload: Partial<NearbyAmenity> = {
        ...(editingAmenity ? { id: editingAmenity.id } : {}),
        propertyId: selectedPropertyId,
        name: amenityForm.name,
        category: amenityForm.category,
        distanceMeters: Number(amenityForm.distanceMeters),
        walkingTimeMinutes: Number(amenityForm.walkingTimeMinutes),
        drivingTimeMinutes: Number(amenityForm.drivingTimeMinutes || 0),
        lat: Number(amenityForm.lat),
        lng: Number(amenityForm.lng),
        description: amenityForm.description,
        address: amenityForm.address
      };

      const saved = await database.saveNearbyAmenity(payload);
      
      // Update local state
      if (editingAmenity) {
        setAmenities(prev => prev.map(a => a.id === saved.id ? saved : a));
      } else {
        setAmenities(prev => [...prev, saved]);
      }

      setIsAddingAmenity(false);
      setEditingAmenity(null);
      if (showToast) showToast(`Titik fasilitas ${saved.name} berhasil disimpan ke Supabase!`);
    } catch (err: any) {
      console.error('[AdminMapCoordinateManager] Save amenity error:', err);
      if (showToast) showToast(err.message || 'Gagal menyimpan fasilitas.', 'error');
    } finally {
      setIsSavingAmenity(false);
    }
  };

  // Delete Amenity
  const handleDeleteAmenity = async (amenity: NearbyAmenity) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus fasilitas "${amenity.name}"?`)) return;

    try {
      await database.deleteNearbyAmenity(amenity.id);
      setAmenities(prev => prev.filter(a => a.id !== amenity.id));
      if (editingAmenity?.id === amenity.id) {
        setEditingAmenity(null);
      }
      if (showToast) showToast(`Fasilitas "${amenity.name}" berhasil dihapus.`);
    } catch (err: any) {
      console.error('[AdminMapCoordinateManager] Delete amenity error:', err);
      if (showToast) showToast(err.message || 'Gagal menghapus fasilitas.', 'error');
    }
  };

  // Seed / Sync Default Amenities to Supabase
  const handleSeedDefaultAmenities = async () => {
    if (!confirm(`Sinkronisasi seluruh data kurasi awal fasilitas sekitar untuk ${activeProperty?.name} ke tabel Supabase?`)) {
      return;
    }

    setIsSeeding(true);
    try {
      const defaultForProp = INITIAL_NEARBY_AMENITIES.filter(a => a.propertyId === selectedPropertyId);
      if (defaultForProp.length === 0) {
        alert('Tidak ada template data default untuk properti ini.');
        return;
      }

      await database.batchSeedNearbyAmenities(defaultForProp);
      await loadAmenities(selectedPropertyId);
      if (showToast) showToast(`Berhasil menyinkronkan ${defaultForProp.length} titik fasilitas ke Supabase!`);
    } catch (err: any) {
      console.error('[AdminMapCoordinateManager] Seed error:', err);
      if (showToast) showToast(err.message || 'Gagal sinkronisasi data fasilitas.', 'error');
    } finally {
      setIsSeeding(false);
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
              <h2 className="text-xl font-black font-display text-slate-900 uppercase tracking-tight">
                Peta & Manajemen Titik Koordinat GPS
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Konfigurasi titik akurat Latitude / Longitude cabang kos dan fasilitas publik terdekat (transit, kampus, RS, kuliner) langsung ke Supabase.
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

      {/* Main Grid: Left Map + Right Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT: Live Interactive Leaflet Map Box (7 Cols) */}
        <div className="lg:col-span-7 space-y-3">
          
          {/* Map Top Bar: Search & Layer Toggle */}
          <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs space-y-2">
            
            {/* Search Landmark or Address Form */}
            <form onSubmit={handleSearchLocation} className="flex gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari gedung, jalan, stasiun, atau kampus di peta..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-[#2E6F40]"
                />
              </div>
              <button
                type="submit"
                disabled={isSearching}
                className="px-4 py-2 bg-[#2E6F40] hover:bg-[#235531] text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSearching ? <RotateCw size={12} className="animate-spin" /> : <Search size={12} />}
                <span>Cari</span>
              </button>
              <button
                type="button"
                onClick={handleGetCurrentLocation}
                title="Gunakan GPS Perangkat Saat Ini"
                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition cursor-pointer flex items-center justify-center border border-slate-200"
              >
                <Navigation size={14} className="text-[#2E6F40]" />
              </button>
            </form>

            {/* Search Autocomplete Results Dropdown */}
            {searchResults.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-2 max-h-48 overflow-y-auto space-y-1 z-30">
                <div className="text-[10px] font-bold text-slate-400 px-2 py-1 uppercase font-mono">
                  Hasil Pencarian Lokasi:
                </div>
                {searchResults.map((res, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleApplySearchResult(res)}
                    className="w-full text-left px-3 py-1.5 hover:bg-emerald-50 rounded-lg text-xs text-slate-700 flex items-start gap-2 transition"
                  >
                    <MapPin size={12} className="text-[#2E6F40] shrink-0 mt-0.5" />
                    <span className="truncate">{res.display_name}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Quick Layer Switcher and Info */}
            <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-slate-100 text-xs">
              <div className="flex items-center gap-1.5">
                <Layers size={13} className="text-slate-500" />
                <span className="text-[11px] font-bold text-slate-500">Tampilan Peta:</span>
                <button
                  type="button"
                  onClick={() => setActiveTileType('positron')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${
                    activeTileType === 'positron' 
                      ? 'bg-[#2E6F40] text-white shadow-xs' 
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Light Clean
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTileType('streets')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${
                    activeTileType === 'streets' 
                      ? 'bg-[#2E6F40] text-white shadow-xs' 
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  OSM Jalan
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTileType('satellite')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${
                    activeTileType === 'satellite' 
                      ? 'bg-[#2E6F40] text-white shadow-xs' 
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Satelit
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => centerMapOn(propLat, propLng, 17)}
                  className="text-[10px] font-bold text-[#2E6F40] hover:underline flex items-center gap-1"
                >
                  <Building2 size={11} />
                  Fokus Cabang
                </button>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${propLat},${propLng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1"
                >
                  <span>Google Maps</span>
                  <ArrowUpRight size={11} />
                </a>
              </div>
            </div>
          </div>

          {/* Leaflet Map Canvas Container */}
          <div className="w-full h-[460px] rounded-2xl overflow-hidden border border-slate-300 relative shadow-sm z-10 bg-slate-100">
            <div ref={mapContainerRef} className="w-full h-full" />
            
            {/* Guide overlay bottom left */}
            <div className="absolute bottom-3 left-3 z-[400] bg-white/90 backdrop-blur-xs border border-slate-300/80 px-3 py-1.5 rounded-xl shadow-md text-[10px] text-slate-700 font-medium flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>
                {isAddingAmenity || editingAmenity 
                  ? 'Klik peta / drag pin untuk memposisikan titik fasilitas.' 
                  : 'Geser (drag) pin hijau atau klik peta untuk menggeser lokasi properti.'}
              </span>
            </div>
          </div>

          {/* Live Coordinates Readout Banner */}
          <div className="bg-slate-900 text-white rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
            <div className="space-y-0.5 text-center sm:text-left">
              <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider block">
                Koordinat GPS Terpilih ({activeProperty?.name || 'Cabang'}):
              </span>
              <div className="font-mono text-xs sm:text-sm font-bold text-amber-400 flex items-center justify-center sm:justify-start gap-3">
                <span>LAT: {propLat}</span>
                <span>•</span>
                <span>LNG: {propLng}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={isSavingProperty}
              onClick={handleSavePropertyCoordinates}
              className="w-full sm:w-auto px-5 py-2.5 bg-[#2E6F40] hover:bg-[#235531] text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
            >
              {isSavingProperty ? (
                <>
                  <RotateCw size={14} className="animate-spin" />
                  <span>Menyimpan ke Supabase...</span>
                </>
              ) : (
                <>
                  <CheckCircle size={14} />
                  <span>Simpan Titik Properti</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* RIGHT: Detail Forms & Nearby Amenities Management (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* TAB 1: Property Location Details Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 font-mono flex items-center gap-1.5">
                <Building2 size={13} className="text-[#2E6F40]" />
                Data Koordinat Gedung Cabang
              </h3>
              <span className="text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md border border-emerald-200">
                ID: {selectedPropertyId}
              </span>
            </div>

            <div className="space-y-2.5">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase font-mono">Alamat Fisik Cabang</label>
                <textarea
                  rows={2}
                  value={propAddress}
                  onChange={(e) => setPropAddress(e.target.value)}
                  placeholder="Contoh: Jl. Salemba Raya No. 4, Jakarta Pusat"
                  className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl text-xs text-slate-800 outline-none focus:border-[#2E6F40] resize-none font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase font-mono">Latitude (Derajat)</label>
                  <input
                    type="number"
                    step="any"
                    value={propLat}
                    onChange={(e) => setPropLat(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl text-xs font-mono font-bold text-slate-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase font-mono">Longitude (Derajat)</label>
                  <input
                    type="number"
                    step="any"
                    value={propLng}
                    onChange={(e) => setPropLng(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl text-xs font-mono font-bold text-slate-900"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* TAB 2: Nearby Amenities (Fasilitas Sekitar) Manager */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 font-mono flex items-center gap-1.5">
                  <Sparkles size={13} className="text-amber-500" />
                  Fasilitas & Akses Sekitar ({amenities.length})
                </h3>
                <p className="text-[10px] text-slate-500">Halte, KRL, Kampus, RS, Minimarket, Kuliner.</p>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={isSeeding}
                  onClick={handleSeedDefaultAmenities}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-bold transition flex items-center gap-1 cursor-pointer border border-slate-200"
                  title="Sinkronkan data kurasi awal fasilitas ke Supabase"
                >
                  <RotateCw size={10} className={isSeeding ? 'animate-spin' : ''} />
                  <span>Sync Default</span>
                </button>
                <button
                  type="button"
                  onClick={handleStartAddAmenity}
                  className="px-3 py-1.5 bg-[#2E6F40] hover:bg-[#235531] text-white rounded-xl text-[10px] font-bold transition flex items-center gap-1 cursor-pointer shadow-xs"
                >
                  <Plus size={11} />
                  <span>Tambah Titik</span>
                </button>
              </div>
            </div>

            {/* ADD / EDIT AMENITY FORM */}
            {(isAddingAmenity || editingAmenity) && (
              <form onSubmit={handleSaveAmenity} className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-4 space-y-3 animate-fade-in text-left">
                <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
                  <h4 className="text-[11px] font-black uppercase text-emerald-900 font-mono flex items-center gap-1.5">
                    {editingAmenity ? <Edit2 size={12} /> : <Plus size={12} />}
                    {editingAmenity ? 'Edit Titik Fasilitas' : 'Tambah Titik Fasilitas Baru'}
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingAmenity(false);
                      setEditingAmenity(null);
                    }}
                    className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase text-slate-500 font-mono">Nama Tempat / Fasilitas</label>
                  <input
                    type="text"
                    required
                    value={amenityForm.name}
                    onChange={(e) => setAmenityForm({ ...amenityForm, name: e.target.value })}
                    placeholder="Contoh: Halte Transjakarta Salemba UI"
                    className="w-full bg-white border border-slate-300 p-2 rounded-xl text-xs font-semibold text-slate-900 outline-none focus:border-[#2E6F40]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase text-slate-500 font-mono">Kategori Fasilitas</label>
                    <select
                      value={amenityForm.category}
                      onChange={(e) => setAmenityForm({ ...amenityForm, category: e.target.value as any })}
                      className="w-full bg-white border border-slate-300 p-2 rounded-xl text-xs font-bold text-slate-800 outline-none cursor-pointer"
                    >
                      {AMENITY_CATEGORIES.map(cat => (
                        <option key={cat.id} value={cat.id}>
                          {cat.labelId}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase text-slate-500 font-mono">Jarak dari Kos (Meter)</label>
                    <input
                      type="number"
                      required
                      value={amenityForm.distanceMeters}
                      onChange={(e) => {
                        const dist = Number(e.target.value);
                        setAmenityForm({
                          ...amenityForm,
                          distanceMeters: dist,
                          walkingTimeMinutes: Math.max(1, Math.round(dist / 80)),
                          drivingTimeMinutes: Math.max(1, Math.round(dist / 400))
                        });
                      }}
                      className="w-full bg-white border border-slate-300 p-2 rounded-xl text-xs font-mono font-bold text-slate-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase text-slate-500 font-mono">Estimasi Jalan Kaki (Menit)</label>
                    <input
                      type="number"
                      value={amenityForm.walkingTimeMinutes}
                      onChange={(e) => setAmenityForm({ ...amenityForm, walkingTimeMinutes: Number(e.target.value) })}
                      className="w-full bg-white border border-slate-300 p-2 rounded-xl text-xs font-mono text-slate-900"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase text-slate-500 font-mono">Estimasi Kendaraan (Menit)</label>
                    <input
                      type="number"
                      value={amenityForm.drivingTimeMinutes}
                      onChange={(e) => setAmenityForm({ ...amenityForm, drivingTimeMinutes: Number(e.target.value) })}
                      className="w-full bg-white border border-slate-300 p-2 rounded-xl text-xs font-mono text-slate-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase text-slate-500 font-mono">Latitude GPS</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={amenityForm.lat}
                      onChange={(e) => setAmenityForm({ ...amenityForm, lat: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-white border border-slate-300 p-2 rounded-xl text-xs font-mono text-slate-900"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase text-slate-500 font-mono">Longitude GPS</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={amenityForm.lng}
                      onChange={(e) => setAmenityForm({ ...amenityForm, lng: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-white border border-slate-300 p-2 rounded-xl text-xs font-mono text-slate-900"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase text-slate-500 font-mono">Deskripsi Singkat / Akses</label>
                  <input
                    type="text"
                    value={amenityForm.description}
                    onChange={(e) => setAmenityForm({ ...amenityForm, description: e.target.value })}
                    placeholder="Contoh: Terintegrasi dengan koridor Transjakarta 5 & 5C"
                    className="w-full bg-white border border-slate-300 p-2 rounded-xl text-xs text-slate-800 outline-none focus:border-[#2E6F40]"
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingAmenity(false);
                      setEditingAmenity(null);
                    }}
                    className="flex-1 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingAmenity}
                    className="flex-1 py-2 bg-[#2E6F40] hover:bg-[#235531] text-white rounded-xl text-xs font-bold cursor-pointer transition flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
                  >
                    {isSavingAmenity ? (
                      <RotateCw size={12} className="animate-spin" />
                    ) : (
                      <Check size={12} />
                    )}
                    <span>Simpan Fasilitas</span>
                  </button>
                </div>
              </form>
            )}

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition whitespace-nowrap ${
                  selectedCategory === 'all'
                    ? 'bg-[#2E6F40] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Semua ({amenities.length})
              </button>
              {AMENITY_CATEGORIES.map(cat => {
                const count = amenities.filter(a => a.category === cat.id).length;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition whitespace-nowrap ${
                      selectedCategory === cat.id
                        ? 'bg-[#2E6F40] text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cat.labelId} ({count})
                  </button>
                );
              })}
            </div>

            {/* Amenity List Rows */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {isLoadingAmenities ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  <RotateCw size={16} className="animate-spin mx-auto mb-2 text-[#2E6F40]" />
                  Memuat data titik fasilitas dari Supabase...
                </div>
              ) : amenities.length === 0 ? (
                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 text-center space-y-2">
                  <p className="text-xs text-slate-500 font-medium">Belum ada titik fasilitas yang terdaftar untuk cabang ini.</p>
                  <button
                    type="button"
                    onClick={handleSeedDefaultAmenities}
                    className="text-xs font-bold text-[#2E6F40] hover:underline"
                  >
                    Klik di sini untuk sinkronisasi template fasilitas awal
                  </button>
                </div>
              ) : (
                (selectedCategory === 'all' 
                  ? amenities 
                  : amenities.filter(a => a.category === selectedCategory)
                ).map((item) => {
                  const catConfig = AMENITY_CATEGORIES.find(c => c.id === item.category) || AMENITY_CATEGORIES[0];
                  const isSelected = editingAmenity?.id === item.id;

                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                        isSelected 
                          ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-300' 
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div 
                        className="flex-1 cursor-pointer"
                        onClick={() => {
                          centerMapOn(item.lat, item.lng, 17);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="px-2 py-0.5 rounded-md text-[9px] font-bold"
                            style={{ backgroundColor: catConfig.bgColor, color: catConfig.color }}
                          >
                            {catConfig.labelId}
                          </span>
                          <h5 className="text-xs font-bold text-slate-900 truncate max-w-[200px]">
                            {item.name}
                          </h5>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1 font-mono">
                          {item.distanceMeters}m • ~{item.walkingTimeMinutes} mnt jalan kaki • ({item.lat}, {item.lng})
                        </p>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleStartEditAmenity(item)}
                          className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-slate-100 rounded-lg transition"
                          title="Edit Titik"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAmenity(item)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition"
                          title="Hapus Titik"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>
      </div>

    </div>
  );
};

export default AdminMapCoordinateManager;
