import React, { useState, useEffect, useMemo } from 'react';
import { Property, NearbyAmenity } from '../../types';
import { database } from '../../lib/supabase';
import { 
  AMENITY_CATEGORIES, 
  fetchNearbyAmenitiesFromOSM 
} from '../../data/nearbyAmenities';
import { 
  sanitizePropertyCoordinates, 
  isValidCoordinate, 
  calculateDistanceMeters 
} from '../../utils/mapCoordinates';
import { getGoogleMapsDirectionsUrl } from '../../utils/mapTiles';
import { 
  MapPin, 
  Navigation, 
  Train, 
  Bus, 
  GraduationCap, 
  Hospital, 
  ShoppingBag, 
  Coffee, 
  Moon, 
  ExternalLink, 
  RotateCw, 
  Compass, 
  CheckCircle2, 
  Car,
  AlertCircle
} from 'lucide-react';

interface PropertyNearbyPlacesProps {
  property: Property;
  onOpenFullMap?: () => void;
  onSelectAmenity?: (amenity: NearbyAmenity) => void;
  selectedAmenityId?: string | null;
}

export const PropertyNearbyPlaces: React.FC<PropertyNearbyPlacesProps> = ({
  property,
  onOpenFullMap,
  onSelectAmenity,
  selectedAmenityId
}) => {
  const [dbAmenities, setDbAmenities] = useState<NearbyAmenity[]>([]);
  const [osmAmenities, setOsmAmenities] = useState<NearbyAmenity[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const propCoords = useMemo(() => sanitizePropertyCoordinates(property), [property]);
  const hasValidCoords = isValidCoordinate(propCoords.lat, propCoords.lng);

  // Fetch real amenities from Supabase and live OpenStreetMap
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    async function loadRealAmenities() {
      try {
        // 1. Fetch curated database amenities
        const dbItems = await database.fetchNearbyAmenities(property.id);
        if (isMounted) {
          setDbAmenities(dbItems || []);
        }

        // 2. If valid coordinates exist, scan live OpenStreetMap Overpass POIs around this kosan
        if (hasValidCoords) {
          const osmItems = await fetchNearbyAmenitiesFromOSM(
            property.id,
            propCoords.lat,
            propCoords.lng,
            2500 // 2.5km realistic radius
          );
          if (isMounted) {
            setOsmAmenities(osmItems || []);
          }
        }
      } catch (err) {
        console.error('[PropertyNearbyPlaces] Failed loading amenities:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadRealAmenities();

    return () => {
      isMounted = false;
    };
  }, [property.id, hasValidCoords, propCoords.lat, propCoords.lng]);

  // Merge and calculate exact real distances using Haversine
  const verifiedAmenities = useMemo(() => {
    if (!hasValidCoords) return [];

    const map = new Map<string, NearbyAmenity>();

    // Add DB items
    dbAmenities.forEach(a => {
      if (!isValidCoordinate(a.lat, a.lng)) return;
      const dist = calculateDistanceMeters(propCoords.lat, propCoords.lng, a.lat, a.lng);
      if (dist <= 0 || dist > 10000) return;

      map.set(`${a.name.toLowerCase().trim()}_${a.category}`, {
        ...a,
        lat: Number(a.lat),
        lng: Number(a.lng),
        distanceMeters: dist,
        walkingTimeMinutes: Math.max(1, Math.round(dist / 75)),
        drivingTimeMinutes: Math.max(1, Math.round(dist / 350))
      });
    });

    // Add OSM items
    osmAmenities.forEach(a => {
      if (!isValidCoordinate(a.lat, a.lng)) return;
      const dist = calculateDistanceMeters(propCoords.lat, propCoords.lng, a.lat, a.lng);
      if (dist <= 0 || dist > 10000) return;

      const key = `${a.name.toLowerCase().trim()}_${a.category}`;
      if (!map.has(key)) {
        map.set(key, {
          ...a,
          lat: Number(a.lat),
          lng: Number(a.lng),
          distanceMeters: dist,
          walkingTimeMinutes: Math.max(1, Math.round(dist / 75)),
          drivingTimeMinutes: Math.max(1, Math.round(dist / 350))
        });
      }
    });

    const items = Array.from(map.values());
    // Sort strictly closest first
    items.sort((a, b) => a.distanceMeters - b.distanceMeters);
    return items;
  }, [dbAmenities, osmAmenities, hasValidCoords, propCoords.lat, propCoords.lng]);

  // Filtered by category and search
  const filteredAmenities = useMemo(() => {
    return verifiedAmenities.filter(item => {
      const matchCat = selectedCategory === 'all' || item.category === selectedCategory;
      const matchSearch = searchQuery.trim() === '' || 
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.address && item.address.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchCat && matchSearch;
    });
  }, [verifiedAmenities, selectedCategory, searchQuery]);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'transit': return <Train size={13} className="text-blue-600" />;
      case 'education': return <GraduationCap size={13} className="text-purple-600" />;
      case 'healthcare': return <Hospital size={13} className="text-rose-600" />;
      case 'shopping': return <ShoppingBag size={13} className="text-amber-600" />;
      case 'dining': return <Coffee size={13} className="text-orange-600" />;
      case 'worship': return <Moon size={13} className="text-emerald-600" />;
      default: return <MapPin size={13} className="text-[#2E6F40]" />;
    }
  };

  const getCategoryBadgeClass = (category: string) => {
    switch (category) {
      case 'transit': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'education': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'healthcare': return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'shopping': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'dining': return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'worship': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      default: return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  if (!hasValidCoords) {
    return (
      <div className="bg-white border border-[#E2E8F0] p-6 rounded-[24px] shadow-xs text-left space-y-3">
        <div className="flex items-center gap-2 text-amber-600 border-b border-[#F1F5F9] pb-3">
          <AlertCircle size={18} />
          <h4 className="text-xs font-bold uppercase tracking-wider">Koordinat Properti Belum Ditetapkan</h4>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          Titik koordinat GPS untuk <strong>{property.name}</strong> belum dikonfigurasi di database. 
          Jarak fasilitas terdekat hanya dihitung secara presisi dan autentik jika titik lokasi kosan telah ditentukan.
        </p>
        <div className="pt-2">
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(property.address || property.name)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2E6F40] bg-[#EEF7F0] hover:bg-[#d8ebd8] border border-[#2E6F40]/20 px-3 py-1.5 rounded-xl transition"
          >
            <span>Cari Alamat di Google Maps</span>
            <ExternalLink size={12} />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E2E8F0] p-6 rounded-[24px] space-y-4 shadow-xs text-left">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-[#F1F5F9] pb-3">
        <div>
          <div className="text-xs text-[#2E6F40] font-black uppercase tracking-wider flex items-center gap-1.5">
            <Navigation size={13} className="text-[#2E6F40]" />
            <span>Fasilitas Terdekat (Real GPS & Jarak Riil)</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Dihitung langsung dari koordinat kosan ({propCoords.lat.toFixed(4)}, {propCoords.lng.toFixed(4)})
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-mono">
            {verifiedAmenities.length} Tempat Terverifikasi
          </span>
          {isLoading && (
            <RotateCw size={12} className="text-[#2E6F40] animate-spin" />
          )}
        </div>
      </div>

      {/* Category Filter Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[10px]">
        <button
          type="button"
          onClick={() => setSelectedCategory('all')}
          className={`px-2.5 py-1 rounded-lg font-bold transition shrink-0 cursor-pointer ${
            selectedCategory === 'all'
              ? 'bg-[#2E6F40] text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Semua ({verifiedAmenities.length})
        </button>
        {AMENITY_CATEGORIES.map(cat => {
          const count = verifiedAmenities.filter(a => a.category === cat.id).length;
          if (count === 0) return null;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-2 py-1 rounded-lg font-bold transition shrink-0 cursor-pointer flex items-center gap-1 ${
                selectedCategory === cat.id
                  ? 'bg-[#2E6F40] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>{cat.labelId}</span>
              <span className="opacity-75 font-mono text-[9px]">({count})</span>
            </button>
          );
        })}
      </div>

      {/* List of Verified Facilities */}
      <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
        {isLoading && verifiedAmenities.length === 0 ? (
          <div className="py-8 text-center space-y-2 text-slate-400">
            <RotateCw size={24} className="mx-auto text-[#2E6F40] animate-spin" />
            <p className="text-xs font-semibold">Memindai fasilitas sekitar kosan...</p>
          </div>
        ) : filteredAmenities.length === 0 ? (
          <div className="py-6 text-center space-y-1 text-slate-400">
            <p className="text-xs font-bold text-slate-600">Tidak ada fasilitas dalam kategori ini</p>
            <p className="text-[10px]">Coba pilih kategori lain atau gunakan tampilan peta lengkap.</p>
          </div>
        ) : (
          filteredAmenities.slice(0, 10).map((amenity) => {
            const isSelected = selectedAmenityId === amenity.id;
            const distLabel = amenity.distanceMeters < 1000 
              ? `${amenity.distanceMeters} m` 
              : `${(amenity.distanceMeters / 1000).toFixed(1)} km`;

            return (
              <div
                key={amenity.id}
                onClick={() => onSelectAmenity?.(amenity)}
                className={`p-2.5 rounded-xl border transition text-left flex justify-between items-start gap-2.5 cursor-pointer ${
                  isSelected 
                    ? 'bg-emerald-50/50 border-[#2E6F40] ring-1 ring-[#2E6F40]/30' 
                    : 'bg-slate-50/50 border-slate-100 hover:bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-start gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                    {getCategoryIcon(amenity.category)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {amenity.name}
                      </span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${getCategoryBadgeClass(amenity.category)}`}>
                        {AMENITY_CATEGORIES.find(c => c.id === amenity.category)?.labelId || amenity.category}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[10px] text-slate-500 mt-1 font-medium">
                      <span>🚶 ~{amenity.walkingTimeMinutes} mnt jalan kaki</span>
                      <span>🛵 ~{amenity.drivingTimeMinutes || 2} mnt motor</span>
                    </div>

                    {amenity.address && (
                      <p className="text-[10px] text-slate-400 truncate mt-0.5">
                        {amenity.address}
                      </p>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0 flex flex-col items-end gap-1">
                  <span className="font-mono font-black text-xs text-[#2E6F40] bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-md">
                    {distLabel}
                  </span>
                  <a
                    href={getGoogleMapsDirectionsUrl(amenity.lat, amenity.lng, propCoords.lat, propCoords.lng)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-[10px] font-bold text-slate-500 hover:text-[#2E6F40] flex items-center gap-1 hover:underline"
                    title="Buka rute navigasi dari kosan ke tempat ini di Google Maps"
                  >
                    <span>Rute</span>
                    <ExternalLink size={10} />
                  </a>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Navigation link to interactive map */}
      {onOpenFullMap && (
        <div className="pt-2 border-t border-[#F1F5F9] flex justify-between items-center text-xs">
          <span className="text-[11px] text-slate-400">
            Ingin eksplorasi radius lebih luas?
          </span>
          <button
            type="button"
            onClick={onOpenFullMap}
            className="font-extrabold text-[#2E6F40] hover:text-[#1e4b2a] flex items-center gap-1 cursor-pointer transition hover:underline"
          >
            <Compass size={13} />
            <span>Buka Peta Interaktif Lengkap ↗</span>
          </button>
        </div>
      )}
    </div>
  );
};
