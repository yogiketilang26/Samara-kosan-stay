/**
 * Nearby Amenities dataset and utilities for Samara Stay Properties
 */
import { NearbyAmenity, AmenityCategory, Property } from '../types';
import { 
  calculateDistanceMeters, 
  sanitizePropertyCoordinates, 
  sanitizeAmenityCoordinates 
} from '../utils/mapCoordinates';
import { fetchNearbyAmenitiesFromOSM, clearFacilityCache } from '../services/overpassService';

export { calculateDistanceMeters, fetchNearbyAmenitiesFromOSM, clearFacilityCache };

export interface AmenityCategoryConfig {
  id: AmenityCategory;
  labelId: string;
  labelEn: string;
  color: string;
  bgColor: string;
  borderColor: string;
  iconName: string;
  markerColor: string;
}

export const AMENITY_CATEGORIES: AmenityCategoryConfig[] = [
  {
    id: 'transit',
    labelId: 'Transportasi & Transit',
    labelEn: 'Transit & Transport',
    color: '#0284C7',
    bgColor: '#E0F2FE',
    borderColor: '#BAE6FD',
    iconName: 'Train',
    markerColor: '#0284C7'
  },
  {
    id: 'education',
    labelId: 'Kampus & Pendidikan',
    labelEn: 'Campus & Education',
    color: '#7C3AED',
    bgColor: '#EDE9FE',
    borderColor: '#DDD6FE',
    iconName: 'GraduationCap',
    markerColor: '#7C3AED'
  },
  {
    id: 'healthcare',
    labelId: 'Kesehatan & RS',
    labelEn: 'Healthcare & Hospital',
    color: '#E11D48',
    bgColor: '#FFE4E6',
    borderColor: '#FECDD3',
    iconName: 'Hospital',
    markerColor: '#E11D48'
  },
  {
    id: 'shopping',
    labelId: 'Pusat Belanja & Mall',
    labelEn: 'Shopping & Malls',
    color: '#D97706',
    bgColor: '#FEF3C7',
    borderColor: '#FDE68A',
    iconName: 'ShoppingBag',
    markerColor: '#D97706'
  },
  {
    id: 'dining',
    labelId: 'Kuliner & Kafe',
    labelEn: 'Dining & Cafes',
    color: '#EA580C',
    bgColor: '#FFEDD5',
    borderColor: '#FED7AA',
    iconName: 'Coffee',
    markerColor: '#EA580C'
  },
  {
    id: 'worship',
    labelId: 'Tempat Ibadah',
    labelEn: 'Places of Worship',
    color: '#059669',
    bgColor: '#D1FAE5',
    borderColor: '#A7F3D0',
    iconName: 'Moon',
    markerColor: '#059669'
  },
  {
    id: 'lifestyle',
    labelId: 'Olahraga & Hiburan',
    labelEn: 'Lifestyle & Parks',
    color: '#0D9488',
    bgColor: '#CCFBF1',
    borderColor: '#99F6E4',
    iconName: 'Sparkles',
    markerColor: '#0D9488'
  }
];

// Empty initial amenities array - all data is loaded and persisted dynamically via Supabase
export const INITIAL_NEARBY_AMENITIES: NearbyAmenity[] = [];

/**
 * Get amenities for a specific property with accurate distance calculations
 * Strictly calculates true geographic distance and prevents dummy/faraway facilities from appearing.
 */
export function getAmenitiesForProperty(
  property: Property,
  customAmenities?: NearbyAmenity[],
  maxRadiusMeters: number = 3500
): NearbyAmenity[] {
  const pool = customAmenities && customAmenities.length > 0 ? customAmenities : [];
  const propCoords = sanitizePropertyCoordinates(property);

  // If property has invalid coordinates, fallback is empty
  if (!propCoords.lat || !propCoords.lng || pool.length === 0) {
    return [];
  }

  // Calculate true geographic distance for every candidate amenity
  const mapped = pool
    .map((amenity, idx) => {
      const amenCoords = sanitizeAmenityCoordinates(amenity, propCoords.lat, propCoords.lng);
      const dist = calculateDistanceMeters(propCoords.lat, propCoords.lng, amenCoords.lat, amenCoords.lng);
      const walkTime = Math.max(1, Math.round(dist / 80)); // ~80m per minute walking
      const driveTime = Math.max(1, Math.round(dist / 350)); // ~350m per min city driving
      return {
        ...amenity,
        id: amenity.id || `amenity-${property.id}-${idx}`,
        propertyId: property.id,
        lat: amenCoords.lat,
        lng: amenCoords.lng,
        distanceMeters: dist,
        walkingTimeMinutes: walkTime,
        drivingTimeMinutes: driveTime
      };
    })
    // Strictly filter out any items outside real radius (never show arbitrary far locations)
    .filter(a => a.distanceMeters <= maxRadiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  // STRICT DEDUPLICATION:
  // Ensure no duplicate IDs or duplicate places (by normalized name + category) can ever occur
  const seenIds = new Set<string>();
  const seenPlaces = new Set<string>();
  const deduplicated: NearbyAmenity[] = [];

  for (const item of mapped) {
    const normPlace = `${item.name.toLowerCase().trim()}_${item.category}`;
    if (!seenIds.has(item.id) && !seenPlaces.has(normPlace)) {
      seenIds.add(item.id);
      seenPlaces.add(normPlace);
      deduplicated.push(item);
    }
  }

  return deduplicated;
}

/**
 * Get all nearby amenities for a set of properties
 */
export function getAllAmenitiesForProperties(
  properties: Property[],
  customAmenities?: NearbyAmenity[]
): NearbyAmenity[] {
  const pool = customAmenities && customAmenities.length > 0 ? customAmenities : [];
  
  // Collect all amenities, deduplicating by ID
  const map = new Map<string, NearbyAmenity>();
  
  pool.forEach(a => {
    map.set(a.id, a);
  });

  return Array.from(map.values());
}
