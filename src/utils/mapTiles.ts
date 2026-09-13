/**
 * Map Basemap Tile Helpers & Providers for Samara Stay
 * Includes official Google Maps Roadmap, Hybrid, Satellite, and OpenStreetMap.
 */
import L from 'leaflet';

// Google Maps Raster Tiles with Indonesian Localization (hl=id)
export const GOOGLE_ROADMAP_TILE_URL = 'https://{s}.google.com/vt/lyrs=m&hl=id&x={x}&y={y}&z={z}';
export const GOOGLE_HYBRID_TILE_URL = 'https://{s}.google.com/vt/lyrs=y&hl=id&x={x}&y={y}&z={z}';
export const GOOGLE_SATELLITE_TILE_URL = 'https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}';
export const GOOGLE_TERRAIN_TILE_URL = 'https://{s}.google.com/vt/lyrs=p&hl=id&x={x}&y={y}&z={z}';
export const GOOGLE_SUBDOMAINS = ['mt0', 'mt1', 'mt2', 'mt3'];
export const GOOGLE_ATTRIBUTION = '&copy; <a href="https://www.google.com/maps" target="_blank" rel="noopener noreferrer">Google Maps</a>';

export const OSM_STANDARD_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

export const ESRI_SATELLITE_TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
export const ESRI_SATELLITE_ATTRIBUTION = 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community';

/**
 * Creates authentic Google Maps Roadmap Leaflet TileLayer with official roads, street names,
 * POIs, building footprints, and Indonesian typography.
 */
export function createGoogleMapsRoadmapLayer(
  options: L.TileLayerOptions = {},
  onError?: (hasError: boolean, message?: string) => void
): L.TileLayer {
  let consecutiveErrors = 0;
  let hasTriggeredError = false;

  const tileLayer = L.tileLayer(GOOGLE_ROADMAP_TILE_URL, {
    maxZoom: 20,
    minZoom: 3,
    subdomains: GOOGLE_SUBDOMAINS,
    attribution: GOOGLE_ATTRIBUTION,
    crossOrigin: true,
    keepBuffer: 4,
    updateWhenIdle: false,
    updateWhenZooming: true,
    ...options
  });

  tileLayer.on('tileerror', (e: any) => {
    consecutiveErrors++;
    console.warn('[MAP TILE ERROR] provider: Google Maps Roadmap, url:', e?.tile?.src || GOOGLE_ROADMAP_TILE_URL);
    if (consecutiveErrors >= 8 && !hasTriggeredError) {
      hasTriggeredError = true;
      if (onError) {
        onError(true, 'Gagal memuat tile Google Maps. Periksa koneksi internet.');
      }
    }
  });

  tileLayer.on('tileload', () => {
    if (consecutiveErrors > 0) consecutiveErrors = 0;
    if (hasTriggeredError) {
      hasTriggeredError = false;
      if (onError) onError(false);
    }
  });

  return tileLayer;
}

/**
 * Creates Google Maps Hybrid (Satellite Imagery + Street Labels) Leaflet TileLayer.
 */
export function createGoogleMapsHybridLayer(
  options: L.TileLayerOptions = {},
  onError?: (hasError: boolean, message?: string) => void
): L.TileLayer {
  let consecutiveErrors = 0;
  let hasTriggeredError = false;

  const tileLayer = L.tileLayer(GOOGLE_HYBRID_TILE_URL, {
    maxZoom: 20,
    minZoom: 3,
    subdomains: GOOGLE_SUBDOMAINS,
    attribution: GOOGLE_ATTRIBUTION,
    crossOrigin: true,
    keepBuffer: 4,
    updateWhenIdle: false,
    updateWhenZooming: true,
    ...options
  });

  tileLayer.on('tileerror', () => {
    consecutiveErrors++;
    if (consecutiveErrors >= 8 && !hasTriggeredError) {
      hasTriggeredError = true;
      if (onError) onError(true, 'Gagal memuat citra satelit Google Maps.');
    }
  });

  tileLayer.on('tileload', () => {
    if (consecutiveErrors > 0) consecutiveErrors = 0;
    if (hasTriggeredError) {
      hasTriggeredError = false;
      if (onError) onError(false);
    }
  });

  return tileLayer;
}

/**
 * Creates Google Maps Satellite-only Leaflet TileLayer.
 */
export function createGoogleMapsSatelliteLayer(
  options: L.TileLayerOptions = {},
  onError?: (hasError: boolean, message?: string) => void
): L.TileLayer {
  return L.tileLayer(GOOGLE_SATELLITE_TILE_URL, {
    maxZoom: 20,
    minZoom: 3,
    subdomains: GOOGLE_SUBDOMAINS,
    attribution: GOOGLE_ATTRIBUTION,
    crossOrigin: true,
    keepBuffer: 4,
    ...options
  });
}

/**
 * Creates an OpenStreetMap standard Leaflet TileLayer.
 */
export function createOsmStandardTileLayer(
  options: L.TileLayerOptions = {},
  onError?: (hasError: boolean, message?: string) => void
): L.TileLayer {
  let consecutiveErrors = 0;
  let hasTriggeredError = false;

  const tileLayer = L.tileLayer(OSM_STANDARD_TILE_URL, {
    maxZoom: 19,
    minZoom: 3,
    attribution: OSM_ATTRIBUTION,
    crossOrigin: true,
    keepBuffer: 4,
    updateWhenIdle: false,
    updateWhenZooming: true,
    ...options
  });

  tileLayer.on('tileerror', (e: any) => {
    consecutiveErrors++;
    console.warn('[MAP TILE ERROR] provider: OpenStreetMap, url:', e?.tile?.src || OSM_STANDARD_TILE_URL);
    if (consecutiveErrors >= 6 && !hasTriggeredError) {
      hasTriggeredError = true;
      if (onError) {
        onError(true, 'Gagal memuat tile peta OpenStreetMap. Periksa koneksi internet.');
      }
    }
  });

  tileLayer.on('tileload', () => {
    if (consecutiveErrors > 0) consecutiveErrors = 0;
    if (hasTriggeredError) {
      hasTriggeredError = false;
      if (onError) onError(false);
    }
  });

  return tileLayer;
}

/**
 * Creates an Esri Satellite Imagery Leaflet TileLayer as an aerial view alternative.
 */
export function createSatelliteTileLayer(
  options: L.TileLayerOptions = {},
  onError?: (hasError: boolean, message?: string) => void
): L.TileLayer {
  let consecutiveErrors = 0;
  let hasTriggeredError = false;

  const tileLayer = L.tileLayer(ESRI_SATELLITE_TILE_URL, {
    maxZoom: 19,
    minZoom: 3,
    attribution: ESRI_SATELLITE_ATTRIBUTION,
    crossOrigin: true,
    keepBuffer: 4,
    updateWhenIdle: false,
    updateWhenZooming: true,
    ...options
  });

  tileLayer.on('tileerror', (e: any) => {
    consecutiveErrors++;
    console.warn('[MAP TILE ERROR] provider: Esri World Imagery, url:', e?.tile?.src || ESRI_SATELLITE_TILE_URL);
    if (consecutiveErrors >= 6 && !hasTriggeredError) {
      hasTriggeredError = true;
      if (onError) {
        onError(true, 'Gagal memuat citra satelit Esri.');
      }
    }
  });

  tileLayer.on('tileload', () => {
    if (consecutiveErrors > 0) consecutiveErrors = 0;
    if (hasTriggeredError) {
      hasTriggeredError = false;
      if (onError) onError(false);
    }
  });

  return tileLayer;
}

/**
 * Default base tile layer for all application maps (Google Maps by default for precision).
 */
export function createDefaultBaseTileLayer(
  options: L.TileLayerOptions = {},
  onError?: (hasError: boolean, message?: string) => void
): L.TileLayer {
  return createGoogleMapsRoadmapLayer(options, onError);
}

/**
 * Generates official Google Maps search URL for coordinates
 */
export function getGoogleMapsSearchUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

/**
 * Generates official Google Maps directions URL to coordinates, optionally with origin
 */
export function getGoogleMapsDirectionsUrl(destLat: number, destLng: number, originLat?: number, originLng?: number): string {
  if (originLat !== undefined && originLng !== undefined && !isNaN(originLat) && !isNaN(originLng) && (originLat !== 0 || originLng !== 0)) {
    return `https://www.google.com/maps/dir/?api=1&origin=${originLat},${originLng}&destination=${destLat},${destLng}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}`;
}

/**
 * Generates official Google Street View URL
 */
export function getGoogleStreetViewUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
}


