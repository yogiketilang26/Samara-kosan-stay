/**
 * Nearby Amenities dataset and utilities for Samara Stay Properties
 */
import { NearbyAmenity, AmenityCategory, Property } from '../types';

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

// Curated amenities dataset for known Samara Stay locations
export const INITIAL_NEARBY_AMENITIES: NearbyAmenity[] = [
  // --- PROPERTY 1: SALEMBA / CENTRAL JAKARTA (approx -6.1950, 106.8480) ---
  {
    id: 'slb-1',
    propertyId: 1,
    name: 'Halte Transjakarta Salemba UI',
    category: 'transit',
    distanceMeters: 250,
    walkingTimeMinutes: 3,
    drivingTimeMinutes: 1,
    lat: -6.1956,
    lng: 106.8488,
    description: 'Koridor 5 (Kampung Melayu - Ancol) langsung terintegrasi.',
    address: 'Jl. Salemba Raya, Kenari, Senen, Jakarta Pusat',
    icon: 'Bus'
  },
  {
    id: 'slb-2',
    propertyId: 1,
    name: 'Stasiun KRL Cikini',
    category: 'transit',
    distanceMeters: 750,
    walkingTimeMinutes: 9,
    drivingTimeMinutes: 3,
    lat: -6.1985,
    lng: 106.8415,
    description: 'Jalur KRL Merah (Bogor - Jakarta Kota), commuter line akses cepat.',
    address: 'Jl. Pegangsaan Timur, Menteng, Jakarta Pusat',
    icon: 'Train'
  },
  {
    id: 'slb-3',
    propertyId: 1,
    name: 'Universitas Indonesia (Kampus Salemba - FK & FEB)',
    category: 'education',
    distanceMeters: 300,
    walkingTimeMinutes: 4,
    drivingTimeMinutes: 1,
    lat: -6.1963,
    lng: 106.8475,
    description: 'Fakultas Kedokteran & Program Pascasarjana UI Salemba.',
    address: 'Jl. Salemba Raya No.4, Kenari, Senen, Jakarta Pusat',
    icon: 'GraduationCap'
  },
  {
    id: 'slb-4',
    propertyId: 1,
    name: 'RSUPN Dr. Cipto Mangunkusumo (RSCM & Kencana)',
    category: 'healthcare',
    distanceMeters: 450,
    walkingTimeMinutes: 5,
    drivingTimeMinutes: 2,
    lat: -6.1978,
    lng: 106.8492,
    description: 'Rumah sakit rujukan nasional & paviliun kesehatan premium.',
    address: 'Jl. Pangeran Diponegoro No.71, Kenari, Senen, Jakarta Pusat',
    icon: 'Hospital'
  },
  {
    id: 'slb-5',
    propertyId: 1,
    name: 'RS St. Carolus Salemba',
    category: 'healthcare',
    distanceMeters: 350,
    walkingTimeMinutes: 4,
    drivingTimeMinutes: 2,
    lat: -6.1940,
    lng: 106.8495,
    description: 'Pelayanan medis terpadu & poliklinik 24 jam.',
    address: 'Jl. Salemba Raya No.41, Paseban, Senen, Jakarta Pusat',
    icon: 'Hospital'
  },
  {
    id: 'slb-6',
    propertyId: 1,
    name: 'Gramedia Matraman & Food Court',
    category: 'shopping',
    distanceMeters: 900,
    walkingTimeMinutes: 11,
    drivingTimeMinutes: 3,
    lat: -6.2025,
    lng: 106.8550,
    description: 'Toko buku terlengkap, coworking space, dan pilihan tenant kuliner.',
    address: 'Jl. Matraman Raya No.46-48, Matraman, Jakarta Timur',
    icon: 'ShoppingBag'
  },
  {
    id: 'slb-7',
    propertyId: 1,
    name: 'Kopi Kenangan & Indomaret Point 24 Jam',
    category: 'dining',
    distanceMeters: 120,
    walkingTimeMinutes: 2,
    drivingTimeMinutes: 1,
    lat: -6.1945,
    lng: 106.8475,
    description: 'Kafe kopi kekinian & minimarket lengkap 24 jam.',
    address: 'Jl. Salemba Tengah, Jakarta Pusat',
    icon: 'Coffee'
  },
  {
    id: 'slb-8',
    propertyId: 1,
    name: 'Masjid Jami Al-Falah Salemba',
    category: 'worship',
    distanceMeters: 180,
    walkingTimeMinutes: 2,
    drivingTimeMinutes: 1,
    lat: -6.1952,
    lng: 106.8470,
    description: 'Tempat ibadah bersih, nyaman, dan tenang untuk shalat berjamaah.',
    address: 'Paseban, Senen, Jakarta Pusat',
    icon: 'Moon'
  },

  // --- PROPERTY 2: ATIKAH KEMAYORAN (approx -6.1600, 106.8520) ---
  {
    id: 'kmy-1',
    propertyId: 2,
    name: 'Jakarta International Expo (JIExpo Kemayoran)',
    category: 'lifestyle',
    distanceMeters: 1200,
    walkingTimeMinutes: 15,
    drivingTimeMinutes: 4,
    lat: -6.1525,
    lng: 106.8525,
    description: 'Pusat konvensi, expo nasional, konser, dan festival musik akbar.',
    address: 'Arena PRJ Kemayoran, Kemayoran, Jakarta Pusat',
    icon: 'Sparkles'
  },
  {
    id: 'kmy-2',
    propertyId: 2,
    name: 'Stasiun KRL Kemayoran',
    category: 'transit',
    distanceMeters: 850,
    walkingTimeMinutes: 10,
    drivingTimeMinutes: 3,
    lat: -6.1615,
    lng: 106.8435,
    description: 'Akses KRL Commuter Line Loopline Cikarang-Jatinegara-Pasar Senen.',
    address: 'Jl. Garuda No.1, Kemayoran, Jakarta Pusat',
    icon: 'Train'
  },
  {
    id: 'kmy-3',
    propertyId: 2,
    name: 'RS Hermina Kemayoran',
    category: 'healthcare',
    distanceMeters: 650,
    walkingTimeMinutes: 8,
    drivingTimeMinutes: 2,
    lat: -6.1575,
    lng: 106.8550,
    description: 'Rumah sakit spesialis dan IGD 24 jam terpercaya.',
    address: 'Jl. Selangit B-10 Kav.4, Kemayoran, Jakarta Pusat',
    icon: 'Hospital'
  },
  {
    id: 'kmy-4',
    propertyId: 2,
    name: 'Halte Busway Kemayoran Landas Pacu',
    category: 'transit',
    distanceMeters: 400,
    walkingTimeMinutes: 5,
    drivingTimeMinutes: 2,
    lat: -6.1585,
    lng: 106.8540,
    description: 'Akses Transjakarta koridor 12 arah Pluit dan Tanjung Priok.',
    address: 'Jl. Landas Pacu Timur, Kemayoran, Jakarta Pusat',
    icon: 'Bus'
  },
  {
    id: 'kmy-5',
    propertyId: 2,
    name: 'Mega Glodok Kemayoran (MGK)',
    category: 'shopping',
    distanceMeters: 950,
    walkingTimeMinutes: 12,
    drivingTimeMinutes: 3,
    lat: -6.1555,
    lng: 106.8530,
    description: 'Pusat niaga terpadu, perkakas, otomotif, dan supermarket.',
    address: 'Jl. Angkasa Kav. B-6, Kemayoran, Jakarta Pusat',
    icon: 'ShoppingBag'
  },
  {
    id: 'kmy-6',
    propertyId: 2,
    name: 'Pusat Kuliner Pasar Senen & Kuliner Malam',
    category: 'dining',
    distanceMeters: 1400,
    walkingTimeMinutes: 18,
    drivingTimeMinutes: 5,
    lat: -6.1750,
    lng: 106.8450,
    description: 'Sentra aneka kue subuh legendaris dan kuliner khas nusantara.',
    address: 'Pasar Senen Blok III, Jakarta Pusat',
    icon: 'Coffee'
  },

  // --- PROPERTY 3: MARGONDA DEPOK / UI (approx -6.3680, 106.8320) ---
  {
    id: 'mgd-1',
    propertyId: 3,
    name: 'Universitas Indonesia (Gerbang Utama & Rektorat)',
    category: 'education',
    distanceMeters: 600,
    walkingTimeMinutes: 7,
    drivingTimeMinutes: 2,
    lat: -6.3650,
    lng: 106.8280,
    description: 'Kampus utama UI, perpustakaan Crystal of Knowledge, dan danau UI.',
    address: 'Jl. Margonda Raya, Pondok Cina, Beji, Depok',
    icon: 'GraduationCap'
  },
  {
    id: 'mgd-2',
    propertyId: 3,
    name: 'Stasiun KRL Pondok Cina (Pocin)',
    category: 'transit',
    distanceMeters: 450,
    walkingTimeMinutes: 5,
    drivingTimeMinutes: 2,
    lat: -6.3690,
    lng: 106.8335,
    description: 'Stasiun KRL tepat di belakang Margo City & Margonda Raya.',
    address: 'Pondok Cina, Beji, Kota Depok, Jawa Barat',
    icon: 'Train'
  },
  {
    id: 'mgd-3',
    propertyId: 3,
    name: 'Margo City Mall',
    category: 'shopping',
    distanceMeters: 550,
    walkingTimeMinutes: 6,
    drivingTimeMinutes: 2,
    lat: -6.3725,
    lng: 106.8340,
    description: 'Pusat perbelanjaan terbesar Depok: Bioskop XXI, Starbucks, Uniqlo.',
    address: 'Jl. Margonda Raya No.358, Kemiri Muka, Beji, Depok',
    icon: 'ShoppingBag'
  },
  {
    id: 'mgd-4',
    propertyId: 3,
    name: 'Rumah Sakit Universitas Indonesia (RSUI)',
    category: 'healthcare',
    distanceMeters: 900,
    walkingTimeMinutes: 11,
    drivingTimeMinutes: 3,
    lat: -6.3605,
    lng: 106.8305,
    description: 'RS Pendidikan bertaraf internasional dengan fasilitas modern canggih.',
    address: 'Kompleks UI Depok, Pondok Cina, Beji, Depok',
    icon: 'Hospital'
  },
  {
    id: 'mgd-5',
    propertyId: 3,
    name: 'Universitas Gunadarma (Kampus D Margonda)',
    category: 'education',
    distanceMeters: 400,
    walkingTimeMinutes: 5,
    drivingTimeMinutes: 1,
    lat: -6.3670,
    lng: 106.8340,
    description: 'Gedung perkuliahan utama & laboratorium komputer Gunadarma.',
    address: 'Jl. Margonda Raya No.100, Pondok Cina, Beji, Depok',
    icon: 'GraduationCap'
  },
  {
    id: 'mgd-6',
    propertyId: 3,
    name: 'Kopi Nako & Warung Pasta Margonda',
    category: 'dining',
    distanceMeters: 220,
    walkingTimeMinutes: 3,
    drivingTimeMinutes: 1,
    lat: -6.3675,
    lng: 106.8310,
    description: 'Tempat nongkrong & belajar asik dengan Wi-Fi kencang dan kopi segar.',
    address: 'Jl. Margonda Raya, Beji, Depok',
    icon: 'Coffee'
  },
  {
    id: 'mgd-7',
    propertyId: 3,
    name: 'Masjid Ukhuwah Islamiyah UI Depok',
    category: 'worship',
    distanceMeters: 800,
    walkingTimeMinutes: 10,
    drivingTimeMinutes: 3,
    lat: -6.3630,
    lng: 106.8270,
    description: 'Masjid agung ikonik di tepi danau UI.',
    address: 'Lingkungan Kampus UI, Beji, Depok',
    icon: 'Moon'
  },

  // --- PROPERTY 4: TEBET / KUNINGAN / JAKSEL (approx -6.2260, 106.8540) ---
  {
    id: 'tbt-1',
    propertyId: 4,
    name: 'Stasiun KRL Tebet',
    category: 'transit',
    distanceMeters: 500,
    walkingTimeMinutes: 6,
    drivingTimeMinutes: 2,
    lat: -6.2265,
    lng: 106.8580,
    description: 'Stasiun integrasi Mikrotrans dan Feeder Transjakarta Kuningan-Casablanca.',
    address: 'Jl. Tebet Timur Raya, Tebet, Jakarta Selatan',
    icon: 'Train'
  },
  {
    id: 'tbt-2',
    propertyId: 4,
    name: 'Kota Kasablanka (Kokas) Mall',
    category: 'shopping',
    distanceMeters: 1100,
    walkingTimeMinutes: 14,
    drivingTimeMinutes: 4,
    lat: -6.2240,
    lng: 106.8435,
    description: 'Mall favorit Jakarta Selatan dengan ratusan brand restoran dan hiburan.',
    address: 'Jl. Casablanca Raya Kav.88, Menteng Dalam, Tebet, Jaksel',
    icon: 'ShoppingBag'
  },
  {
    id: 'tbt-3',
    propertyId: 4,
    name: 'Tebet Eco Park',
    category: 'lifestyle',
    distanceMeters: 800,
    walkingTimeMinutes: 10,
    drivingTimeMinutes: 3,
    lat: -6.2370,
    lng: 106.8525,
    description: 'Taman terbuka hijau asri dengan jogging track dan jembatan ikonik.',
    address: 'Jl. Tebet Barat Raya, Tebet, Jakarta Selatan',
    icon: 'Sparkles'
  },
  {
    id: 'tbt-4',
    propertyId: 4,
    name: 'RS MMC (Metropolitan Medical Centre) Kuningan',
    category: 'healthcare',
    distanceMeters: 1500,
    walkingTimeMinutes: 19,
    drivingTimeMinutes: 5,
    lat: -6.2215,
    lng: 106.8320,
    description: 'Layanan medis spesialis dan rumah sakit swasta terdepan HR Rasuna Said.',
    address: 'Jl. HR Rasuna Said Kav. C-21, Kuningan, Setiabudi, Jaksel',
    icon: 'Hospital'
  },
  {
    id: 'tbt-5',
    propertyId: 4,
    name: 'Halte Busway Kuningan Timur / Gatot Subroto',
    category: 'transit',
    distanceMeters: 700,
    walkingTimeMinutes: 9,
    drivingTimeMinutes: 3,
    lat: -6.2320,
    lng: 106.8380,
    description: 'Akses cepat Transjakarta koridor 6 & 9 arah Semanggi dan Monas.',
    address: 'Jl. Gatot Subroto, Kuningan Barat, Mampang Prapatan, Jaksel',
    icon: 'Bus'
  },
  {
    id: 'tbt-6',
    propertyId: 4,
    name: 'Kawasan Kafe & Kuliner Tebet Timur Dalam',
    category: 'dining',
    distanceMeters: 300,
    walkingTimeMinutes: 4,
    drivingTimeMinutes: 1,
    lat: -6.2275,
    lng: 106.8530,
    description: 'Pusat nongkrong hits, coffee shop artisan, dan distro anak muda.',
    address: 'Jl. Tebet Timur Dalam Raya, Tebet, Jakarta Selatan',
    icon: 'Coffee'
  }
];

/**
 * Calculates distance between two coordinates in meters using Haversine formula
 */
export function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

/**
 * Get amenities for a specific property with accurate distance calculations
 */
export function getAmenitiesForProperty(
  property: Property,
  customAmenities?: NearbyAmenity[]
): NearbyAmenity[] {
  const pool = customAmenities && customAmenities.length > 0 ? customAmenities : INITIAL_NEARBY_AMENITIES;
  
  // First match directly by propertyId
  const directMatches = pool.filter(a => a.propertyId === property.id);
  
  if (directMatches.length > 0) {
    return directMatches.sort((a, b) => a.distanceMeters - b.distanceMeters);
  }

  // If no direct propertyId matches (e.g. newly created property), calculate dynamic distance
  const propLat = property.lat || -6.368;
  const propLng = property.lng || 106.83;

  return pool
    .map(amenity => {
      const dist = calculateDistanceMeters(propLat, propLng, amenity.lat, amenity.lng);
      const walkTime = Math.max(1, Math.round(dist / 80)); // approx 80m per minute walking
      const driveTime = Math.max(1, Math.round(dist / 350)); // approx 350m per min city speed
      return {
        ...amenity,
        propertyId: property.id,
        distanceMeters: dist,
        walkingTimeMinutes: walkTime,
        drivingTimeMinutes: driveTime
      };
    })
    .filter(a => a.distanceMeters <= 5000) // Within 5km radius
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}

/**
 * Get all nearby amenities for a set of properties
 */
export function getAllAmenitiesForProperties(
  properties: Property[],
  customAmenities?: NearbyAmenity[]
): NearbyAmenity[] {
  const pool = customAmenities && customAmenities.length > 0 ? customAmenities : INITIAL_NEARBY_AMENITIES;
  
  // Collect all amenities, deduplicating by ID
  const map = new Map<string, NearbyAmenity>();
  
  pool.forEach(a => {
    map.set(a.id, a);
  });

  return Array.from(map.values());
}
