import React, { useState, useEffect, useMemo } from 'react';
import { 
  Compass, Search, Image as ImageIcon, Grid, Filter, 
  ArrowLeft, ArrowRight, X, ExternalLink, Layers, CheckCircle 
} from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { Room, Property } from '../../types';
import { motion, AnimatePresence } from 'motion/react';

interface RoomGalleryProps {
  rooms: Room[];
  properties: Property[];
}

interface GalleryItem {
  id: string;
  url: string;
  source: 'supabase_storage' | 'database_preset' | 'database_uploaded';
  title: string;
  subtitle: string;
  propertyId?: number;
  roomType?: string;
  roomNumber?: string;
}

export default function RoomGallery({ rooms, properties }: RoomGalleryProps) {
  const [storageImages, setStorageImages] = useState<GalleryItem[]>([]);
  const [loadingStorage, setLoadingStorage] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState<number | 'all'>('all');
  const [selectedRoomType, setSelectedRoomType] = useState<string | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Lightbox Modal state
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // 1. Fetch images from Supabase Storage on load
  useEffect(() => {
    async function fetchStorageImages() {
      if (!isSupabaseConfigured || !supabase) return;
      setLoadingStorage(true);
      try {
        console.log('[ROOM GALLERY] Fetching images from Supabase Storage...');
        const storageItems: GalleryItem[] = [];

        // Check bucket 'room-images'
        const { data: listData, error: listError } = await supabase.storage
          .from('room-images')
          .list('', { limit: 50 });

        if (!listError && listData) {
          listData.forEach(file => {
            const isImg = /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name);
            if (isImg) {
              const { data: publicUrlData } = supabase.storage
                .from('room-images')
                .getPublicUrl(file.name);
              
              if (publicUrlData?.publicUrl) {
                storageItems.push({
                  id: `storage-room-images-${file.id || file.name}`,
                  url: publicUrlData.publicUrl,
                  source: 'supabase_storage',
                  title: file.name.split('.')[0].replace(/[-_]/g, ' '),
                  subtitle: 'Uploaded: room-images'
                });
              }
            }
          });
        }

        // Check bucket 'rooms'
        const { data: roomsBucketData, error: roomsBucketError } = await supabase.storage
          .from('rooms')
          .list('', { limit: 50 });

        if (!roomsBucketError && roomsBucketData) {
          roomsBucketData.forEach(file => {
            const isImg = /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name);
            if (isImg) {
              const { data: publicUrlData } = supabase.storage
                .from('rooms')
                .getPublicUrl(file.name);
              
              if (publicUrlData?.publicUrl) {
                storageItems.push({
                  id: `storage-rooms-${file.id || file.name}`,
                  url: publicUrlData.publicUrl,
                  source: 'supabase_storage',
                  title: file.name.split('.')[0].replace(/[-_]/g, ' '),
                  subtitle: 'Uploaded: rooms'
                });
              }
            }
          });
        }

        setStorageImages(storageItems);
      } catch (err) {
        console.warn('[ROOM GALLERY] Error fetching from Supabase Storage:', err);
      } finally {
        setLoadingStorage(false);
      }
    }

    fetchStorageImages();
  }, []);

  // 2. Synthesize all image assets available
  const allGalleryItems = useMemo(() => {
    const items: GalleryItem[] = [];
    const processedUrls = new Set<string>();

    // Helper to safely push items without duplicates
    const pushSafe = (item: GalleryItem) => {
      if (!item.url || processedUrls.has(item.url)) return;
      processedUrls.add(item.url);
      items.push(item);
    };

    // Add Supabase Storage images
    storageImages.forEach(img => pushSafe(img));

    // Add Room main images and room image lists from database
    rooms.forEach(room => {
      const prop = properties.find(p => p.id === room.property_id);
      const propName = prop ? prop.name : 'Samara stay';
      
      if (room.image_url) {
        pushSafe({
          id: `room-main-${room.id}`,
          url: room.image_url,
          source: room.image_url.startsWith('data:') ? 'database_preset' : 'database_uploaded',
          title: `Unit ${room.room_number}`,
          subtitle: `${propName} — Kamar ${room.room_type}`,
          propertyId: room.property_id,
          roomType: room.room_type,
          roomNumber: room.room_number
        });
      }

      if (Array.isArray(room.images)) {
        room.images.forEach((imgUrl, index) => {
          pushSafe({
            id: `room-extra-${room.id}-${index}`,
            url: imgUrl,
            source: imgUrl.startsWith('data:') ? 'database_preset' : 'database_uploaded',
            title: `Unit ${room.room_number} (Interior ${index + 1})`,
            subtitle: `${propName} — Kamar ${room.room_type}`,
            propertyId: room.property_id,
            roomType: room.room_type,
            roomNumber: room.room_number
          });
        });
      }
    });

    // Add Property eksterior images and property lists
    properties.forEach(prop => {
      if (prop.image_url) {
        pushSafe({
          id: `property-main-${prop.id}`,
          url: prop.image_url,
          source: prop.image_url.startsWith('data:') ? 'database_preset' : 'database_uploaded',
          title: `Eksterior ${prop.name}`,
          subtitle: prop.address,
          propertyId: prop.id,
          roomType: 'Eksterior'
        });
      }

      if (Array.isArray(prop.images)) {
        prop.images.forEach((imgUrl, index) => {
          pushSafe({
            id: `property-extra-${prop.id}-${index}`,
            url: imgUrl,
            source: imgUrl.startsWith('data:') ? 'database_preset' : 'database_uploaded',
            title: `${prop.name} (Perspektif ${index + 1})`,
            subtitle: prop.address,
            propertyId: prop.id,
            roomType: 'Eksterior'
          });
        });
      }
    });

    return items;
  }, [rooms, properties, storageImages]);

  // 3. Filter items dynamically based on selection state
  const filteredItems = useMemo(() => {
    return allGalleryItems.filter(item => {
      // Filter by Property
      if (selectedPropertyId !== 'all' && item.propertyId !== selectedPropertyId) {
        return false;
      }

      // Filter by Room Type
      if (selectedRoomType !== 'all') {
        if (selectedRoomType === 'Eksterior') {
          if (item.roomType !== 'Eksterior') return false;
        } else {
          if (item.roomType !== selectedRoomType) return false;
        }
      }

      // Filter by Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(query);
        const matchesSubtitle = item.subtitle.toLowerCase().includes(query);
        const matchesRoomNo = item.roomNumber?.toLowerCase().includes(query);
        if (!matchesTitle && !matchesSubtitle && !matchesRoomNo) {
          return false;
        }
      }

      return true;
    });
  }, [allGalleryItems, selectedPropertyId, selectedRoomType, searchQuery]);

  // Lightbox handlers
  const openLightbox = (index: number) => {
    setLightboxIndex(index);
  };

  const closeLightbox = () => {
    setLightboxIndex(null);
  };

  const showNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (lightboxIndex !== null && filteredItems.length > 0) {
      setLightboxIndex((lightboxIndex + 1) % filteredItems.length);
    }
  };

  const showPrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (lightboxIndex !== null && filteredItems.length > 0) {
      setLightboxIndex((lightboxIndex - 1 + filteredItems.length) % filteredItems.length);
    }
  };

  const currentLightboxItem = lightboxIndex !== null ? filteredItems[lightboxIndex] : null;

  return (
    <div className="space-y-8" id="room-gallery-section">
      
      {/* Gallery Header and Search Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 bg-brand-beige/10 border border-brand-beige/20 px-3 py-1 rounded-full text-[11px] font-semibold text-brand-beige tracking-wider uppercase mb-2">
            <Layers size={12} />
            Visual Exploration Gallery
          </div>
          <h2 className="text-xl md:text-2xl font-bold font-display text-white">Galeri Visual Unit Eksklusif</h2>
          <p className="text-xs text-slate-400 mt-1">Jelajahi keindahan arsitektur, detail tata ruang interior, dan kenyamanan unit Samara Stay.</p>
        </div>

        {/* Search bar input */}
        <div className="relative w-full md:w-72">
          <span className="absolute inset-y-0 left-3 flex items-center text-slate-400">
            <Search size={14} />
          </span>
          <input 
            type="text" 
            placeholder="Cari kamar, nomor, gedung..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-brand-primary/80 border border-brand-steel/30 rounded-xl py-2 pl-9 pr-4 text-xs text-slate-100 placeholder-slate-500 focus:outline focus:outline-brand-beige focus:ring-1 focus:ring-brand-beige"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-white"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Interactive Filters Controls */}
      <div className="bg-brand-primary/40 border border-brand-steel/20 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
        
        {/* Dropdown Property filter */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <span className="text-slate-400 text-xs font-mono font-bold flex items-center gap-1">
            <Filter size={13} className="text-brand-beige/80" /> PROPERTI:
          </span>
          <select
            value={selectedPropertyId}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedPropertyId(val === 'all' ? 'all' : Number(val));
            }}
            className="bg-brand-darker border border-brand-steel/30 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-beige"
          >
            <option value="all">Semua Properti (Gedung)</option>
            {properties.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Room Type horizontal buttons */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          <span className="text-slate-400 text-xs font-mono font-bold mr-1 shrink-0">KATEGORI:</span>
          {[
            { label: 'Semua Kamar', value: 'all' },
            { label: 'Standard', value: 'Standard' },
            { label: 'Deluxe', value: 'Deluxe' },
            { label: 'Premium', value: 'Premium' },
            { label: 'Eksterior', value: 'Eksterior' }
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setSelectedRoomType(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all whitespace-nowrap ${
                selectedRoomType === opt.value
                  ? 'bg-brand-beige text-brand-darker font-bold'
                  : 'bg-brand-darker/60 text-slate-400 hover:text-white border border-brand-steel/10'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

      </div>

      {/* Supabase Storage Sync indicator if active */}
      {isSupabaseConfigured && (
        <div className="flex items-center gap-2 text-[10px] text-emerald-400 font-mono bg-emerald-500/5 border border-emerald-500/10 rounded-xl px-3 py-2 w-fit">
          <CheckCircle size={12} className="shrink-0" />
          <span>Realtime Sync: Terkoneksi ke Supabase Storage (Membaca asset dinamis)</span>
        </div>
      )}

      {/* 4. Responsive Masonry Grid */}
      {loadingStorage ? (
        <div className="py-20 flex flex-col items-center justify-center gap-2">
          <div className="w-8 h-8 border-2 border-brand-steel border-t-brand-beige rounded-full animate-spin" />
          <p className="text-xs text-slate-400 font-mono">Sinkronisasi asset media...</p>
        </div>
      ) : filteredItems.length > 0 ? (
        <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-5 space-y-5" id="masonry-grid-container">
          {filteredItems.map((item, index) => (
            <motion.div
              key={item.id}
              layoutId={`gallery-card-${item.id}`}
              className="break-inside-avoid relative bg-brand-primary/80 border border-brand-steel/20 rounded-2xl overflow-hidden group shadow-lg cursor-pointer flex flex-col hover:border-brand-beige/50 transition-colors shadow-black/5"
              onClick={() => openLightbox(index)}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.4) }}
            >
              {/* Image element with required referrerPolicy */}
              <div className="relative overflow-hidden select-none">
                <img 
                  src={item.url || null} 
                  alt={item.title}
                  className="w-full h-auto object-cover opacity-90 group-hover:scale-105 group-hover:opacity-100 transition-all duration-500 rounded-t-2xl"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-brand-darker/90 via-brand-darker/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                  <div className="flex items-center justify-between text-white">
                    <span className="text-[10px] bg-brand-beige text-brand-darker font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider font-mono">
                      Zoom In
                    </span>
                    <ExternalLink size={12} className="text-slate-300" />
                  </div>
                </div>
              </div>

              {/* Card Meta Content */}
              <div className="p-4 space-y-1 bg-brand-primary">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-bold text-white font-sans tracking-tight truncate flex-1">{item.title}</h4>
                  
                  {/* Source indicator tag */}
                  <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-md ${
                    item.source === 'supabase_storage'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : item.source === 'database_uploaded'
                        ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                        : 'bg-brand-beige/10 text-brand-beige/80 border border-brand-beige/20'
                  }`}>
                    {item.source === 'supabase_storage' ? 'STORAGE' : 'DB'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 truncate">{item.subtitle}</p>
              </div>

            </motion.div>
          ))}
        </div>
      ) : (
        <div className="py-16 text-center text-slate-500 space-y-2 border border-dashed border-brand-steel/20 rounded-2xl bg-brand-primary/20">
          <ImageIcon className="mx-auto text-brand-steel" size={32} />
          <p className="text-xs font-medium">Tidak ada gambar yang cocok dengan filter aktif.</p>
        </div>
      )}

      {/* 5. Animated Lightbox Modal */}
      <AnimatePresence>
        {currentLightboxItem && (
          <div 
            className="fixed inset-0 bg-black/95 backdrop-blur-md flex items-center justify-center z-[120] p-4 select-none"
            onClick={closeLightbox}
          >
            {/* Close trigger */}
            <button 
              onClick={closeLightbox}
              className="absolute top-4 right-4 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/15 p-2 rounded-xl text-xs cursor-pointer z-10"
            >
              <X size={18} />
            </button>

            {/* Left selector */}
            <button
              onClick={showPrev}
              className="absolute left-4 md:left-8 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/15 p-3 rounded-2xl cursor-pointer transition-all active:scale-95"
            >
              <ArrowLeft size={18} />
            </button>

            {/* Image Container with smooth layout animations */}
            <motion.div 
              layoutId={`gallery-card-${currentLightboxItem.id}`}
              className="relative max-w-4xl max-h-[80vh] w-full flex flex-col items-center gap-4 focus:outline-none"
              onClick={(e) => e.stopPropagation()}
            >
              <img 
                src={currentLightboxItem.url || null} 
                alt={currentLightboxItem.title}
                className="max-h-[70vh] max-w-full rounded-2xl object-contain border border-brand-steel/30 shadow-2xl"
                referrerPolicy="no-referrer"
              />

              {/* Meta Description Banner */}
              <div className="bg-brand-primary border border-brand-steel/30 rounded-2xl p-4 w-full text-left space-y-1">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs font-bold text-white font-sans">{currentLightboxItem.title}</span>
                  <span className="text-[10px] font-mono text-brand-beige">
                    Item {lightboxIndex !== null ? lightboxIndex + 1 : 0} of {filteredItems.length}
                  </span>
                </div>
                <p className="text-xs text-slate-400">{currentLightboxItem.subtitle}</p>
                <div className="flex gap-2 pt-2">
                  <span className="text-[9px] font-mono font-bold bg-brand-darker px-2 py-1 rounded-md border border-brand-steel/20 text-slate-300">
                    Source: {currentLightboxItem.source.replace(/_/g, ' ').toUpperCase()}
                  </span>
                  {currentLightboxItem.roomType && (
                    <span className="text-[9px] font-mono font-bold bg-brand-darker px-2 py-1 rounded-md border border-brand-steel/20 text-slate-300">
                      Tipe: {currentLightboxItem.roomType}
                    </span>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Right selector */}
            <button
              onClick={showNext}
              className="absolute right-4 md:right-8 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/15 p-3 rounded-2xl cursor-pointer transition-all active:scale-95"
            >
              <ArrowRight size={18} />
            </button>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
