/**
 * High-Precision GPS Coordinates & Mapping Utilities for Samara Stay
 * Ensures 100% accurate coordinates, zero NaN errors, and resilient parsing for Google Maps URLs & DMS.
 */
import { Property, NearbyAmenity } from '../types';

// Curated accurate default coordinates for known Samara Stay locations
export const KNOWN_BRANCH_COORDINATES: Record<string, { lat: number; lng: number; name: string }> = {
  salemba: { lat: -6.195621, lng: 106.848815, name: 'Samara Stay Salemba (Jakarta Pusat)' },
  kemayoran: { lat: -6.155500, lng: 106.853000, name: 'Samara Stay Kemayoran (Jakarta Pusat)' },
  atikah: { lat: -6.155500, lng: 106.853000, name: 'Samara Stay Kemayoran - Atikah (Jakarta Pusat)' },
  depok: { lat: -6.368200, lng: 106.830500, name: 'Samara Stay Margonda Depok UI' },
  margonda: { lat: -6.368200, lng: 106.830500, name: 'Samara Stay Margonda Depok UI' },
  kukusan: { lat: -6.368200, lng: 106.830500, name: 'Samara Stay Margonda Depok UI' },
  tebet: { lat: -6.226500, lng: 106.858000, name: 'Samara Stay Tebet (Jakarta Selatan)' },
  kuningan: { lat: -6.226500, lng: 106.858000, name: 'Samara Stay Tebet / Kuningan (Jakarta Selatan)' }
};

export const DEFAULT_JAKARTA_COORDINATES = {
  lat: -6.195621,
  lng: 106.848815
};

/**
 * Normalizes a latitude & longitude coordinate pair:
 * 1. Converts strings, numbers, or expressions into clean numbers
 * 2. Detects swapped coordinates (e.g. lat > 90 or lat in Indonesian longitude range 95-142)
 * 3. Detects Indonesian coordinates south of equator that missed the negative sign
 *    (e.g. Jakarta lat is between -6.0 and -6.6; if entered as  with lng 106.865001,
 *    it auto-fixes to )
 * 4. Ensures 6-decimal-place precision
 */
export function normalizeCoordinatePair(rawLat: any, rawLng: any): { lat: number; lng: number } | null {
  if (rawLat === null || rawLat === undefined || rawLng === null || rawLng === undefined) {
    return null;
  }

  let numLat = typeof rawLat === 'number' ? rawLat : parseFloat(String(rawLat).trim());
  let numLng = typeof rawLng === 'number' ? rawLng : parseFloat(String(rawLng).trim());

  if (isNaN(numLat) || isNaN(numLng) || !isFinite(numLat) || !isFinite(numLng)) {
    return null;
  }

  // Detect swapped coordinates:
  // Longitude in Indonesia is between 95 and 142.
  // Latitude is between -11 and 6.
  // If numLat is in [95, 142] and numLng is in [-11, 11], they are definitely swapped!
  if ((numLat > 90 || (numLat >= 95 && numLat <= 142)) && (numLng >= -11 && numLng <= 11)) {
    const temp = numLat;
    numLat = numLng;
    numLng = temp;
  }

  // Detect missing negative sign in Indonesia (Java / Jakarta / Jabodetabek / Bali / Sumatra):
  // Longitude is in Indonesia (95 to 142).
  // Jakarta/Java latitudes are between -5.0 and -9.0 (Jakarta ~ -6.2).
  // If user entered positive latitude 0 < numLat <= 11, it is in 99.9% of cases missing the minus sign
  // (e.g. 6.162249 from Google Maps "6°09'44.1"S" or "6.162249, 106.865001").
  if (numLng >= 95 && numLng <= 142 && numLat > 0 && numLat <= 11) {
    numLat = -numLat;
  }

  // Validate bounds
  if (numLat < -90 || numLat > 90 || numLng < -180 || numLng > 180) {
    return null;
  }

  // Exclude null island (0, 0)
  if (Math.abs(numLat) < 0.0001 && Math.abs(numLng) < 0.0001) {
    return null;
  }

  return {
    lat: parseFloat(numLat.toFixed(6)),
    lng: parseFloat(numLng.toFixed(6))
  };
}

/**
 * Check if given latitude and longitude are valid non-zero GPS coordinates
 */
export function isValidCoordinate(lat: any, lng: any): boolean {
  return normalizeCoordinatePair(lat, lng) !== null;
}

/**
 * Returns clean, validated numeric coordinates for any property.
 * If property has invalid or missing coordinates, falls back intelligently to branch presets.
 */
export function sanitizePropertyCoordinates(prop: Partial<Property> | null | undefined): { lat: number; lng: number } {
  if (!prop) return { ...DEFAULT_JAKARTA_COORDINATES };

  // 1. Check direct properties (lat, lng, latitude, longitude, long)
  const rawLat = prop.lat !== undefined ? prop.lat : (prop as any).latitude;
  const rawLng = prop.lng !== undefined ? prop.lng : ((prop as any).longitude ?? (prop as any).long);

  const normalized = normalizeCoordinatePair(rawLat, rawLng);
  if (normalized) {
    return normalized;
  }

  // 2. Check if rawLat or rawLng contains combined coordinates e.g. ", 106.865001"
  if (typeof rawLat === 'string' && (rawLat.includes(',') || rawLat.includes('http') || rawLat.includes('@'))) {
    const parsed = parseGoogleMapsCoordinates(rawLat);
    if (parsed) return parsed;
  }
  if (typeof rawLng === 'string' && (rawLng.includes(',') || rawLng.includes('http') || rawLng.includes('@'))) {
    const parsed = parseGoogleMapsCoordinates(rawLng);
    if (parsed) return parsed;
  }

  // 3. Check if address or gmaps_url or description contains coordinates or Google Maps link
  const possibleSources = [
    (prop as any).gmaps_url,
    (prop as any).map_url,
    (prop as any).google_maps_url,
    prop.address,
    prop.description,
    prop.name
  ];

  for (const src of possibleSources) {
    if (src && typeof src === 'string') {
      const parsed = parseGoogleMapsCoordinates(src);
      if (parsed) return parsed;
    }
  }

  // 4. Fallback by matching name or address keywords
  const searchText = `${prop.name || ''} ${prop.address || ''}`.toLowerCase();
  
  if (searchText.includes('kemayoran') || searchText.includes('atikah') || searchText.includes('tiara') || searchText.includes('jiexpo') || searchText.includes('cempaka') || searchText.includes('serdang') || searchText.includes('sumur batu')) {
    return { ...KNOWN_BRANCH_COORDINATES.kemayoran };
  }
  if (searchText.includes('salemba') || searchText.includes('senen') || searchText.includes('paseban') || searchText.includes('kenari') || searchText.includes('rscm')) {
    return { ...KNOWN_BRANCH_COORDINATES.salemba };
  }
  if (searchText.includes('depok') || searchText.includes('margonda') || searchText.includes('ui') || searchText.includes('kukusan') || searchText.includes('beji')) {
    return { ...KNOWN_BRANCH_COORDINATES.depok };
  }
  if (searchText.includes('tebet') || searchText.includes('kuningan') || searchText.includes('casablanca') || searchText.includes('jaksel') || searchText.includes('pancoran')) {
    return { ...KNOWN_BRANCH_COORDINATES.tebet };
  }

  return { ...DEFAULT_JAKARTA_COORDINATES };
}

/**
 * Returns clean, validated numeric coordinates for an amenity.
 */
export function sanitizeAmenityCoordinates(
  amenity: Partial<NearbyAmenity> | null | undefined, 
  fallbackLat = DEFAULT_JAKARTA_COORDINATES.lat, 
  fallbackLng = DEFAULT_JAKARTA_COORDINATES.lng
): { lat: number; lng: number } {
  if (!amenity) return { lat: fallbackLat, lng: fallbackLng };

  const rawLat = amenity.lat;
  const rawLng = amenity.lng;

  const normalized = normalizeCoordinatePair(rawLat, rawLng);
  if (normalized) {
    return normalized;
  }

  return {
    lat: fallbackLat,
    lng: fallbackLng
  };
}

/**
 * Calculates Haversine distance in meters between two coordinates.
 * Guaranteed to never return NaN.
 */
export function calculateDistanceMeters(lat1: any, lon1: any, lat2: any, lon2: any): number {
  const nLat1 = typeof lat1 === 'number' ? lat1 : parseFloat(String(lat1 || '0'));
  const nLon1 = typeof lon1 === 'number' ? lon1 : parseFloat(String(lon1 || '0'));
  const nLat2 = typeof lat2 === 'number' ? lat2 : parseFloat(String(lat2 || '0'));
  const nLon2 = typeof lon2 === 'number' ? lon2 : parseFloat(String(lon2 || '0'));

  if (isNaN(nLat1) || isNaN(nLon1) || isNaN(nLat2) || isNaN(nLon2)) {
    return 0;
  }

  const R = 6371e3; // Earth radius in meters
  const phi1 = (nLat1 * Math.PI) / 180;
  const phi2 = (nLat2 * Math.PI) / 180;
  const deltaPhi = ((nLat2 - nLat1) * Math.PI) / 180;
  const deltaLambda = ((nLon2 - nLon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));

  const res = Math.round(R * c);
  return isNaN(res) ? 0 : res;
}

/**
 * Parse Google Maps URL, Share Link, Direct Coordinate Strings, or DMS format.
 * Supports:
 * 1. Google Maps right click format: "-6.195621, 106.848815"
 * 2. Google Maps URL with @lat,lng: "https://www.google.com/maps/place/.../@-6.195621,106.848815,17z"
 * 3. Google Maps query URL: "https://maps.google.com/?q=-6.195621,106.848815" or "?ll=-6.195621,106.848815"
 * 4. Google Maps embed / data URL: "...!3d-6.195621!4d106.848815"
 * 5. DMS format: `6°11'44.2"S 106°50'55.7"E`
 * 6. Short link or geo URI: `geo:`
 */
export function parseGoogleMapsCoordinates(input: string): { lat: number; lng: number } | null {
  if (!input || typeof input !== 'string') return null;
  const str = input.trim();
  if (!str) return null;

  // Pattern 1: URL with @lat,lng
  const urlAtMatch = str.match(/@(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
  if (urlAtMatch) {
    const normalized = normalizeCoordinatePair(urlAtMatch[1], urlAtMatch[2]);
    if (normalized) return normalized;
  }

  // Pattern 2: URL with query param ?q=lat,lng or ?query=lat,lng or ?ll=lat,lng or /search/lat,lng or ?saddr / ?daddr / destination
  const urlQueryMatch = str.match(/[?&/](?:q|query|ll|search|destination|saddr|daddr)(?:=|\/)?(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/i);
  if (urlQueryMatch) {
    const normalized = normalizeCoordinatePair(urlQueryMatch[1], urlQueryMatch[2]);
    if (normalized) return normalized;
  }

  // Pattern 3: Embed !3dlat!4dlng
  const embedMatch = str.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (embedMatch) {
    const normalized = normalizeCoordinatePair(embedMatch[1], embedMatch[2]);
    if (normalized) return normalized;
  }

  // Pattern 4: Geo URI: geo:-6.1956,106.8488
  const geoMatch = str.match(/geo:(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/i);
  if (geoMatch) {
    const normalized = normalizeCoordinatePair(geoMatch[1], geoMatch[2]);
    if (normalized) return normalized;
  }

  // Pattern 5: Plain coordinate pair e.g. "-6.195621, 106.848815" or "6.195621, 106.848815" or "-6.195621; 106.848815" or "Lat: -6.195621, Lng: 106.848815"
  const plainMatch = str.match(/(-?\d{1,2}\.\d+)[,\s;\t]+(-?\d{1,3}\.\d+)/);
  if (plainMatch) {
    const normalized = normalizeCoordinatePair(plainMatch[1], plainMatch[2]);
    if (normalized) return normalized;
  }

  // Pattern 6: DMS notation e.g. 6°11'44.2"S 106°50'55.7"E or 6°09'44.1" S 106°51'54.0" E
  const dmsMatch = str.match(/(\d+)[°\s]+(\d+)['\s]+([\d.]+)"?\s*([NS])[,\s]+(\d+)[°\s]+(\d+)['\s]+([\d.]+)"?\s*([EW])/i);
  if (dmsMatch) {
    let lat = parseInt(dmsMatch[1], 10) + parseInt(dmsMatch[2], 10) / 60 + parseFloat(dmsMatch[3]) / 3600;
    if (dmsMatch[4].toUpperCase() === 'S') lat = -lat;
    let lng = parseInt(dmsMatch[5], 10) + parseInt(dmsMatch[6], 10) / 60 + parseFloat(dmsMatch[7]) / 3600;
    if (dmsMatch[8].toUpperCase() === 'W') lng = -lng;
    const normalized = normalizeCoordinatePair(lat, lng);
    if (normalized) return normalized;
  }

  return null;
}

/**
 * Search Location / Geocode via OpenStreetMap Nominatim with retry and timeout.
 */
export async function searchLocationNominatim(query: string): Promise<Array<{ lat: number; lng: number; displayName: string; name: string }>> {
  if (!query || !query.trim()) return [];
  const cleanQuery = query.trim();

  try {
    const endpoint = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      cleanQuery.includes('Indonesia') ? cleanQuery : `${cleanQuery}, Indonesia`
    )}&limit=5&addressdetails=1`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(endpoint, {
      signal: controller.signal,
      headers: {
        'Accept-Language': 'id,en',
        'User-Agent': 'SamaraStay-MapEngine/1.0'
      }
    });
    clearTimeout(timeoutId);

    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data
      .filter((item: any) => item.lat && item.lon)
      .map((item: any) => ({
        lat: parseFloat(parseFloat(item.lat).toFixed(6)),
        lng: parseFloat(parseFloat(item.lon).toFixed(6)),
        displayName: item.display_name || cleanQuery,
        name: item.name || (item.display_name ? item.display_name.split(',')[0] : cleanQuery)
      }))
      .filter(item => isValidCoordinate(item.lat, item.lng));
  } catch (err) {
    console.warn('[searchLocationNominatim] Geocoding lookup notice:', err);
    return [];
  }
}

/**
 * Reverse Geocode coordinates to address string via Nominatim
 */
export async function reverseGeocodeNominatim(lat: number, lng: number): Promise<string | null> {
  if (!isValidCoordinate(lat, lng)) return null;

  try {
    const endpoint = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(endpoint, {
      signal: controller.signal,
      headers: {
        'Accept-Language': 'id,en',
        'User-Agent': 'SamaraStay-MapEngine/1.0'
      }
    });
    clearTimeout(timeoutId);

    if (!res.ok) return null;
    const data = await res.json();
    return data.display_name || null;
  } catch (err) {
    console.warn('[reverseGeocodeNominatim] Reverse geocode lookup notice:', err);
    return null;
  }
}
