/**
 * Overpass API Service for Real OpenStreetMap POI & Nearby Facilities Extraction
 * 100% Real OSM data with intelligent multi-endpoint failover, client caching, and Haversine distance calculations.
 */
import { NearbyAmenity, AmenityCategory } from '../types';
import { calculateDistanceMeters, isValidCoordinate } from '../utils/mapCoordinates';

// Public Overpass API Mirrors for high availability
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

const CACHE_PREFIX = 'samara_osm_facilities_v1_';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 Hours Cache

// In-Memory Fast Cache
const memoryCache = new Map<string, { timestamp: number; data: NearbyAmenity[] }>();

/**
 * Maps OpenStreetMap tags to Samara Stay Amenity Categories
 */
export function mapOsmTagsToCategory(tags: Record<string, string> = {}): { category: AmenityCategory; icon: string; specificType: string } {
  const amenity = (tags.amenity || '').toLowerCase();
  const shop = (tags.shop || '').toLowerCase();
  const leisure = (tags.leisure || '').toLowerCase();
  const highway = (tags.highway || '').toLowerCase();
  const railway = (tags.railway || '').toLowerCase();
  const building = (tags.building || '').toLowerCase();
  const religion = (tags.religion || '').toLowerCase();

  // 1. Healthcare / Rumah Sakit, Klinik, Apotek
  if (
    ['hospital', 'clinic', 'pharmacy', 'doctors', 'dentist'].includes(amenity) ||
    building === 'hospital' ||
    tags.healthcare
  ) {
    if (amenity === 'pharmacy') return { category: 'healthcare', icon: 'Pill', specificType: 'Apotek' };
    if (amenity === 'clinic') return { category: 'healthcare', icon: 'HeartPulse', specificType: 'Klinik' };
    return { category: 'healthcare', icon: 'Hospital', specificType: 'Rumah Sakit' };
  }

  // 2. Education / Kampus & Sekolah
  if (
    ['university', 'college', 'school', 'kindergarten'].includes(amenity) ||
    ['university', 'school'].includes(building)
  ) {
    if (amenity === 'university' || amenity === 'college') {
      return { category: 'education', icon: 'GraduationCap', specificType: 'Universitas / Kampus' };
    }
    return { category: 'education', icon: 'School', specificType: 'Sekolah' };
  }

  // 3. Transit & Transportasi (Stasiun, Halte, SPBU, Terminal)
  if (
    highway === 'bus_stop' ||
    ['station', 'subway_entrance', 'halt', 'tram_stop'].includes(railway) ||
    ['bus_station', 'ferry_terminal', 'fuel'].includes(amenity) ||
    tags.public_transport
  ) {
    if (amenity === 'fuel') return { category: 'transit', icon: 'Fuel', specificType: 'SPBU' };
    if (railway === 'station' || railway === 'subway_entrance') {
      return { category: 'transit', icon: 'Train', specificType: 'Stasiun Kereta / MRT / KRL' };
    }
    return { category: 'transit', icon: 'Bus', specificType: 'Halte / Terminal' };
  }

  // 4. Shopping / Belanja (Minimarket, Supermarket, Mall, Pasar)
  if (
    shop ||
    amenity === 'marketplace' ||
    building === 'supermarket'
  ) {
    if (shop === 'convenience') return { category: 'shopping', icon: 'Store', specificType: 'Minimarket' };
    if (shop === 'supermarket' || building === 'supermarket') return { category: 'shopping', icon: 'ShoppingBag', specificType: 'Supermarket' };
    if (shop === 'mall') return { category: 'shopping', icon: 'Building2', specificType: 'Mall / Pusat Belanja' };
    if (amenity === 'marketplace') return { category: 'shopping', icon: 'ShoppingBag', specificType: 'Pasar Tradisional' };
    return { category: 'shopping', icon: 'Store', specificType: 'Pertokoan' };
  }

  // 5. Dining / Kuliner (Restoran, Kafe, Food Court)
  if (['restaurant', 'cafe', 'fast_food', 'food_court', 'bar', 'pub', 'ice_cream'].includes(amenity)) {
    if (amenity === 'cafe') return { category: 'dining', icon: 'Coffee', specificType: 'Kafe / Warkop' };
    if (amenity === 'fast_food') return { category: 'dining', icon: 'Utensils', specificType: 'Makanan Cepat Saji' };
    return { category: 'dining', icon: 'Utensils', specificType: 'Restoran / Rumah Makan' };
  }

  // 6. Worship / Tempat Ibadah (Masjid, Musholla, Gereja)
  if (amenity === 'place_of_worship' || building === 'mosque' || building === 'church' || religion) {
    if (religion === 'muslim' || building === 'mosque' || (tags.name || '').toLowerCase().includes('masjid')) {
      return { category: 'worship', icon: 'Moon', specificType: 'Masjid / Tempat Ibadah' };
    }
    return { category: 'worship', icon: 'Church', specificType: 'Tempat Ibadah' };
  }

  // 7. Finance & Public Services (ATM, Bank, Polisi, SPBU, Olahraga)
  if (['atm', 'bank'].includes(amenity)) {
    if (amenity === 'atm') return { category: 'lifestyle', icon: 'CreditCard', specificType: 'ATM' };
    return { category: 'lifestyle', icon: 'Landmark', specificType: 'Bank' };
  }

  if (['police', 'fire_station', 'post_office'].includes(amenity)) {
    if (amenity === 'police') return { category: 'lifestyle', icon: 'Shield', specificType: 'Kantor Polisi' };
    return { category: 'lifestyle', icon: 'Building', specificType: 'Layanan Publik' };
  }

  if (
    ['park', 'fitness_centre', 'sports_centre', 'pitch', 'swimming_pool', 'stadium'].includes(leisure) ||
    amenity === 'gym'
  ) {
    return { category: 'lifestyle', icon: 'Dumbbell', specificType: 'Sarana Olahraga & Rekreasi' };
  }

  return { category: 'lifestyle', icon: 'MapPin', specificType: 'Fasilitas Umum' };
}

/**
 * Builds an optimized Overpass QL Query string for radius scanning
 */
function buildOverpassQuery(lat: number, lng: number, radiusMeters: number): string {
  const rad = Math.min(Math.max(radiusMeters, 500), 10000); // 500m to 10km safe range
  return `[out:json][timeout:15];
(
  node(around:${rad},${lat},${lng})["amenity"~"^(hospital|clinic|pharmacy|doctors|dentist|university|college|school|kindergarten|bus_station|fuel|marketplace|restaurant|cafe|fast_food|food_court|place_of_worship|atm|bank|police|fire_station|post_office)$"];
  node(around:${rad},${lat},${lng})["shop"~"^(supermarket|convenience|mall|department_store|bakery|greengrocer|laundry|chemist)$"];
  node(around:${rad},${lat},${lng})["leisure"~"^(park|fitness_centre|sports_centre|pitch|swimming_pool)$"];
  node(around:${rad},${lat},${lng})["railway"~"^(station|subway_entrance|halt|tram_stop)$"];
  node(around:${rad},${lat},${lng})["highway"="bus_stop"];
  
  way(around:${rad},${lat},${lng})["amenity"~"^(hospital|clinic|university|college|school|marketplace|place_of_worship|mall)$"];
  way(around:${rad},${lat},${lng})["shop"~"^(supermarket|mall|department_store)$"];
  way(around:${rad},${lat},${lng})["building"~"^(hospital|university|school|supermarket|train_station|mosque|church)$"];
);
out center tags 120;`;
}

/**
 * Fetches real nearby facilities from OpenStreetMap Overpass API for a given location.
 * Implements client-side caching (Memory + LocalStorage) and automatic failover across multiple Overpass mirrors.
 */
export async function fetchNearbyAmenitiesFromOSM(
  propertyId: number,
  lat: number,
  lng: number,
  radiusMeters: number = 3000,
  forceRefresh: boolean = false
): Promise<NearbyAmenity[]> {
  if (!isValidCoordinate(lat, lng)) {
    return [];
  }

  const cacheKey = `${CACHE_PREFIX}${propertyId}_${lat.toFixed(4)}_${lng.toFixed(4)}_${radiusMeters}`;

  // 1. Check In-Memory Cache
  if (!forceRefresh) {
    const memCached = memoryCache.get(cacheKey);
    if (memCached && Date.now() - memCached.timestamp < CACHE_TTL_MS) {
      return memCached.data;
    }

    // 2. Check LocalStorage Cache
    try {
      const localCachedStr = localStorage.getItem(cacheKey);
      if (localCachedStr) {
        const parsed = JSON.parse(localCachedStr);
        if (parsed && parsed.timestamp && Date.now() - parsed.timestamp < CACHE_TTL_MS && Array.isArray(parsed.data)) {
          memoryCache.set(cacheKey, parsed);
          return parsed.data;
        }
      }
    } catch {
      // Ignore localStorage read error
    }
  }

  const query = buildOverpassQuery(lat, lng, radiusMeters);

  // Try each mirror endpoint sequentially
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 seconds timeout per endpoint

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Accept': 'application/json'
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        continue; // Try next endpoint on HTTP error
      }

      const json = await response.json();
      if (!json || !Array.isArray(json.elements)) {
        continue;
      }

      const rawElements = json.elements;
      const seenNames = new Set<string>();
      const processedAmenities: NearbyAmenity[] = [];

      for (const el of rawElements) {
        const tags = el.tags || {};
        const rawName = tags.name || tags['name:id'] || tags['name:en'] || tags.brand || tags.operator;
        
        // Skip unnamed POIs or those with empty generic names unless specific facility
        if (!rawName || typeof rawName !== 'string' || rawName.trim().length === 0) {
          continue;
        }

        const cleanName = rawName.trim();
        const dedupeKey = `${cleanName.toLowerCase()}_${tags.amenity || tags.shop || tags.railway || ''}`;
        if (seenNames.has(dedupeKey)) {
          continue;
        }
        seenNames.add(dedupeKey);

        const nodeLat = el.lat ?? el.center?.lat;
        const nodeLng = el.lon ?? el.center?.lon;

        if (!isValidCoordinate(nodeLat, nodeLng)) {
          continue;
        }

        const distanceMeters = calculateDistanceMeters(lat, lng, nodeLat, nodeLng);
        // Exclude if outside radius
        if (distanceMeters > radiusMeters + 100) {
          continue;
        }

        const { category, icon, specificType } = mapOsmTagsToCategory(tags);
        const walkingMinutes = Math.max(1, Math.round(distanceMeters / 75)); // ~4.5 km/h walking speed
        const drivingMinutes = Math.max(1, Math.round(distanceMeters / 350)); // ~21 km/h in city traffic

        const addressParts = [
          tags['addr:street'] ? `${tags['addr:street']} ${tags['addr:housenumber'] || ''}`.trim() : '',
          tags['addr:city'] || '',
          tags['addr:suburb'] || ''
        ].filter(Boolean).join(', ');

        processedAmenities.push({
          id: `osm-${el.type}-${el.id}`,
          propertyId,
          name: cleanName,
          category,
          distanceMeters,
          walkingTimeMinutes: walkingMinutes,
          drivingTimeMinutes: drivingMinutes,
          lat: parseFloat(Number(nodeLat).toFixed(6)),
          lng: parseFloat(Number(nodeLng).toFixed(6)),
          description: specificType,
          address: addressParts || `${distanceMeters < 1000 ? `${distanceMeters} m` : `${(distanceMeters / 1000).toFixed(1)} km`} dari properti`,
          icon
        });
      }

      // Sort nearest to farthest (distance ASC)
      processedAmenities.sort((a, b) => a.distanceMeters - b.distanceMeters);

      // Save to Cache
      const cachePayload = { timestamp: Date.now(), data: processedAmenities };
      memoryCache.set(cacheKey, cachePayload);
      try {
        localStorage.setItem(cacheKey, JSON.stringify(cachePayload));
      } catch {
        // Ignore localStorage quota errors
      }

      return processedAmenities;
    } catch (err) {
      console.warn(`[OverpassService] Mirror ${endpoint} failed or timed out:`, err);
      // Fall through to try next endpoint
    }
  }

  // If all live Overpass endpoints fail, check if we have any stale cache
  try {
    const staleCache = localStorage.getItem(cacheKey);
    if (staleCache) {
      const parsed = JSON.parse(staleCache);
      if (parsed && Array.isArray(parsed.data) && parsed.data.length > 0) {
        return parsed.data;
      }
    }
  } catch {
    // Ignore
  }

  return [];
}

/**
 * Clear cached facilities for a property when its coordinates are updated
 */
export function clearFacilityCache(propertyId?: number) {
  memoryCache.clear();
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) {
        if (!propertyId || k.includes(`${CACHE_PREFIX}${propertyId}_`)) {
          keysToRemove.push(k);
        }
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch {
    // Ignore
  }
}
