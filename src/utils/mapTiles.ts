/**
 * OpenStreetMap Basemap Tile Helpers & Providers for Samara Stay
 * Zero API keys required. 100% pure OpenStreetMap standard and Esri satellite imagery.
 */
import L from 'leaflet';

export const OSM_STANDARD_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

export const ESRI_SATELLITE_TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
export const ESRI_SATELLITE_ATTRIBUTION = 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community';

/**
 * Creates an OpenStreetMap standard Leaflet TileLayer with resilient tile loading,
 * CORS configuration, and clean error callbacks.
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
    if (consecutiveErrors > 0) {
      consecutiveErrors = 0;
    }
    if (hasTriggeredError) {
      hasTriggeredError = false;
      if (onError) {
        onError(false);
      }
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
        onError(true, 'Gagal memuat citra satelit Esri. Coba beralih ke peta standar OpenStreetMap.');
      }
    }
  });

  tileLayer.on('tileload', () => {
    if (consecutiveErrors > 0) {
      consecutiveErrors = 0;
    }
    if (hasTriggeredError) {
      hasTriggeredError = false;
      if (onError) {
        onError(false);
      }
    }
  });

  return tileLayer;
}

