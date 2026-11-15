import React, { useState, useEffect, useRef } from 'react';
import { Room, Property } from '../../types';
import { compressImage } from '../../utils/imageCompressor';
import { uploadToSupabaseStorage } from '../../utils/storageUploader';
import { UploadCloud, Trash2, Image, Loader2 } from 'lucide-react';
import { database } from '../../lib/supabase';
import * as LucideIcons from 'lucide-react';

const renderIcon = (iconName: string) => {
  const IconComponent = (LucideIcons as any)[iconName] || LucideIcons.HelpCircle;
  return <IconComponent size={12} className="shrink-0" />;
};

interface RoomFormProps {
  room?: Room | null;
  properties: Property[];
  onSave: (room: Partial<Room>) => void;
  onCancel: () => void;
}

export const RoomForm: React.FC<RoomFormProps> = ({
  room,
  properties,
  onSave,
  onCancel
}) => {
  const [formData, setFormData] = useState({
    property_id: properties[0]?.id || 1,
    room_number: '',
    room_type: 'Standard',
    price: 1500000,
    size_sqm: 15.0,
    floor: 1,
    status: 'available' as 'available' | 'occupied' | 'reserved' | 'maintenance',
    is_daily_enabled: false,
    daily_price: 100000,
    is_airbnb_enabled: false,
    airbnb_url: '',
    image_url: '',
    images: [] as string[]
  });

  const [masterFacilities, setMasterFacilities] = useState<any[]>([]);
  const [selectedFacilityIds, setSelectedFacilityIds] = useState<number[]>([]);
  const [isUploadingMain, setIsUploadingMain] = useState(false);
  const [isUploadingGallery, setIsUploadingGallery] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function loadMasterFacilities() {
      try {
        const facs = await database.fetchMasterFacilities();
        setMasterFacilities(facs);
      } catch (err) {
        console.error('Error loading master facilities in RoomForm:', err);
      }
    }
    loadMasterFacilities();
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (room && room.id) {
      setFormData({
        property_id: room.property_id,
        room_number: room.room_number,
        room_type: room.room_type,
        price: room.price,
        size_sqm: room.size_sqm,
        floor: room.floor,
        status: room.status as any,
        is_daily_enabled: room.is_daily_enabled || false,
        daily_price: room.daily_price || 100000,
        is_airbnb_enabled: Boolean(room.is_airbnb_enabled || room.airbnb_url),
        airbnb_url: room.airbnb_url || '',
        image_url: room.image_url || '',
        images: room.images || []
      });
      setSelectedFacilityIds((room.facilities || []).map((f: any) => typeof f === 'number' ? f : (f?.id || f?.facility_id)).filter(Boolean));
    } else {
      const targetPropId = room?.property_id || properties[0]?.id || 1;
      const targetProp = properties.find(p => p.id === targetPropId);
      setFormData({
        property_id: targetPropId,
        room_number: '',
        room_type: 'Standard',
        price: targetProp?.price || 1500000,
        size_sqm: 15.0,
        floor: 1,
        status: 'available',
        is_daily_enabled: false,
        daily_price: 100000,
        is_airbnb_enabled: Boolean(targetProp?.is_airbnb_enabled || targetProp?.airbnb_url),
        airbnb_url: targetProp?.airbnb_url || '',
        image_url: '',
        images: []
      });
      setSelectedFacilityIds([]);
    }
  }, [room, properties]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 20 * 1024 * 1024) {
        alert("Ukuran gambar maksimal adalah 20MB!");
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      setIsUploadingMain(true);
      try {
        // Fast local compression for instant UI display
        const compressedBase64 = await compressImage(file, 1280, 960, 0.85);
        setFormData(prev => ({
          ...prev,
          image_url: compressedBase64
        }));

        // Attempt storage upload in background for permanent storage URL
        try {
          const result = await uploadToSupabaseStorage(
            file,
            'room-images',
            `room_${formData.room_number || 'main'}`,
            { maxLongestSide: 1920, quality: 0.92 }
          );
          if (result.publicUrl) {
            setFormData(prev => ({
              ...prev,
              image_url: result.publicUrl
            }));
          }
        } catch (storageErr) {
          console.info('[RoomForm] Storage upload notice, using compressed image Base64 data URL.');
        }
      } catch (err: any) {
        console.error('[RoomForm] Upload main image error:', err);
        alert("Gagal memproses gambar kamar.");
      } finally {
        setIsUploadingMain(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    }
  };

  const handleRemoveImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (confirm("Apakah Anda yakin ingin menghapus gambar utama kamar ini?")) {
      setFormData(prev => ({
        ...prev,
        image_url: ''
      }));
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleGalleryFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setIsUploadingGallery(true);
      const newImages = [...formData.images];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > 20 * 1024 * 1024) {
          alert("Ukuran gambar maksimal adalah 20MB!");
          continue;
        }
        try {
          const compressedBase64 = await compressImage(file, 1280, 960, 0.85);
          newImages.push(compressedBase64);
          
          // Attempt storage upload
          uploadToSupabaseStorage(
            file,
            'room-images',
            `room_gal_${formData.room_number || 'gallery'}`,
            { maxLongestSide: 1920, quality: 0.92 }
          ).then(result => {
            if (result.publicUrl) {
              setFormData(prev => ({
                ...prev,
                images: prev.images.map(img => img === compressedBase64 ? result.publicUrl : img)
              }));
            }
          }).catch(() => {});
        } catch (compressErr) {
          console.error('[RoomForm] Gallery image compression failed:', compressErr);
        }
      }
      setFormData(prev => ({
        ...prev,
        images: newImages.slice(0, 4) // max 4 images
      }));
      setIsUploadingGallery(false);
      if (galleryInputRef.current) {
        galleryInputRef.current.value = '';
      }
    }
  };

  const handleRemoveGalleryImage = (index: number) => {
    if (confirm("Apakah Anda yakin ingin menghapus foto galeri kamar ini?")) {
      setFormData(prev => ({
        ...prev,
        images: prev.images.filter((_, idx) => idx !== index)
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    try {
      let finalImageUrl = formData.image_url;
      if (finalImageUrl && finalImageUrl.startsWith('data:')) {
        try {
          const result = await uploadToSupabaseStorage(
            finalImageUrl,
            'room-images',
            `room_${formData.room_number || 'main'}`,
            { maxLongestSide: 1920, quality: 0.92 }
          );
          if (result.publicUrl) finalImageUrl = result.publicUrl;
        } catch (e) {
          console.warn('[RoomForm] Image storage upload before save warning:', e);
        }
      }

      let finalImages = formData.images;
      if (finalImages && finalImages.some(img => img.startsWith('data:'))) {
        finalImages = await Promise.all(
          finalImages.map(async (img, idx) => {
            if (!img.startsWith('data:')) return img;
            try {
              const result = await uploadToSupabaseStorage(
                img,
                'room-images',
                `room_gal_${formData.room_number || 'gallery'}_${idx}`,
                { maxLongestSide: 1920, quality: 0.92 }
              );
              return result.publicUrl || img;
            } catch (e) {
              console.warn('[RoomForm] Gallery image upload before save warning:', e);
              return img;
            }
          })
        );
      }

      await onSave({
        id: room?.id,
        property_id: Number(formData.property_id),
        room_number: formData.room_number,
        room_type: formData.room_type as 'Standard' | 'Deluxe' | 'Premium' | 'Premium Plus',
        price: Number(formData.price),
        size_sqm: Number(formData.size_sqm),
        floor: Number(formData.floor),
        status: formData.status,
        facilities: selectedFacilityIds as any,
        is_daily_enabled: formData.is_daily_enabled,
        daily_price: formData.is_daily_enabled ? Number(formData.daily_price) : 0,
        is_airbnb_enabled: Boolean(formData.is_airbnb_enabled || formData.airbnb_url.trim()),
        airbnb_url: formData.airbnb_url.trim() || null,
        image_url: finalImageUrl,
        images: finalImages
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 font-sans text-xs text-slate-350">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">Pilih Komplek Properti</label>
          <select
            value={formData.property_id}
            onChange={(e) => setFormData({ ...formData, property_id: Number(e.target.value) })}
            className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-200 outline-none font-semibold cursor-pointer"
          >
            {properties.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">Nomor Kamar</label>
          <input 
            type="text" 
            required
            value={formData.room_number}
            onChange={(e) => setFormData({ ...formData, room_number: e.target.value })}
            placeholder="Contoh: R101, F205"
            className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-200 font-bold uppercase placeholder-slate-600 outline-none focus:border-amber-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">Tipe Kelas Kamar</label>
          <select
            value={formData.room_type}
            onChange={(e) => setFormData({ ...formData, room_type: e.target.value })}
            className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-200 font-semibold cursor-pointer"
          >
            <option value="Standard">Standard</option>
            <option value="Deluxe">Deluxe</option>
            <option value="Premium">Premium</option>
            <option value="Premium Plus">Premium Plus</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">Status Kamar</label>
          <select
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
            className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-200 font-semibold cursor-pointer text-amber-500"
          >
            <option value="available">Tersedia (Available)</option>
            <option value="occupied">Terisi (Occupied)</option>
            <option value="reserved">Dipesan (Reserved)</option>
            <option value="maintenance">Perawatan (Maintenance)</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">Tarif Sewa Bulanan</label>
          <input 
            type="number" 
            required
            value={formData.price}
            onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
            className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-200 font-mono text-[11px]"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">Luas Unit (m²)</label>
          <input 
            type="number" 
            step="0.1"
            required
            value={formData.size_sqm}
            onChange={(e) => setFormData({ ...formData, size_sqm: Number(e.target.value) })}
            className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-200 font-mono text-[11px]"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">Posisi Lantai</label>
          <input 
            type="number" 
            required
            value={formData.floor}
            onChange={(e) => setFormData({ ...formData, floor: Number(e.target.value) })}
            className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-200 font-mono text-[11px]"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">Fasilitas Kamar (Pilih Master Fasilitas)</label>
        {masterFacilities.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-slate-950/45 rounded-2xl border border-slate-900 max-h-48 overflow-y-auto">
            {masterFacilities.map((fac) => {
              const isSelected = selectedFacilityIds.includes(fac.id);
              return (
                <button
                  key={fac.id}
                  type="button"
                  onClick={() => {
                    if (isSelected) {
                      setSelectedFacilityIds(prev => prev.filter(id => id !== fac.id));
                    } else {
                      setSelectedFacilityIds(prev => [...prev, fac.id]);
                    }
                  }}
                  className={`flex items-center gap-2 p-2 rounded-xl text-[10px] font-semibold border transition-all cursor-pointer text-left ${
                    isSelected
                      ? 'bg-[#0D9488]/20 text-[#0D9488] border-[#0D9488]/50 shadow-sm'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="shrink-0">{renderIcon(fac.icon)}</div>
                  <div className="truncate">
                    <div className="font-bold">{fac.name}</div>
                    <div className="text-[8px] opacity-60 truncate">{fac.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-slate-500 text-[10px] italic font-mono p-3 bg-slate-950/45 rounded-2xl border border-slate-900">
            Memuat daftar master fasilitas...
          </div>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono block mb-1">Foto Kamar / Unit Gallery</label>
        
        <div className="relative">
          {formData.image_url && formData.image_url.trim() !== '' ? (
            <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 p-2 group">
              <img 
                src={formData.image_url} 
                alt="Pratinjau Kamar" 
                className="w-full h-36 object-cover rounded-xl animate-fade-in"
              />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button
                  type="button"
                  disabled={isUploadingMain || isSaving}
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1 px-2.5 bg-slate-850 hover:bg-slate-755 text-white rounded-xl text-[10px] font-bold font-mono transition shadow-lg cursor-pointer border border-slate-755 disabled:opacity-50"
                >
                  Ganti Gambar
                </button>
                <button
                  type="button"
                  disabled={isUploadingMain || isSaving}
                  onClick={handleRemoveImage}
                  className="p-1 px-2.5 bg-red-650 hover:bg-red-555 text-white rounded-xl text-[10px] font-bold font-mono transition shadow-lg flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 size={11} />
                  Hapus
                </button>
              </div>
            </div>
          ) : (
            <div 
              onClick={() => !isUploadingMain && !isSaving && fileInputRef.current?.click()}
              className="border border-dashed border-slate-800 hover:border-amber-500/50 bg-slate-950 p-4 rounded-2xl text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-1.5 group font-sans"
            >
              <UploadCloud size={20} className="text-slate-500 group-hover:text-amber-500 transition-colors animate-pulse" />
              <div>
                <span className="text-slate-300 block font-bold text-[11px] group-hover:text-amber-500 transition-colors">Pilih & Upload Gambar Kamar</span>
                <span className="text-[8px] text-slate-500 font-mono block mt-0.5">Maksimal 10MB (PNG, JPG, JPEG)</span>
              </div>
            </div>
          )}

          {/* Main Image Upload Loading Overlay */}
          {isUploadingMain && (
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center gap-2 z-10 animate-fade-in">
              <LucideIcons.Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
              <span className="text-[10px] font-bold text-amber-500 uppercase font-mono tracking-wider">Mengompres & Memuat...</span>
            </div>
          )}
        </div>

        <input 
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          className="hidden"
        />

        {/* Additional Room Gallery (Multiple Images) */}
        <div className="mt-4 bg-slate-900 border border-slate-805 p-3 rounded-2xl space-y-2">
          <span className="text-[9px] font-bold text-slate-400 font-mono block uppercase">Foto Tambahan / Galeri Unit (Maksimal 4)</span>
          <div className="grid grid-cols-4 gap-2">
            {formData.images.filter(img => typeof img === 'string' && img.trim() !== '').map((img, idx) => (
              <div key={idx} className="relative group h-16 rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
                <img 
                  src={img} 
                  alt={`Galeri ${idx + 1}`} 
                  className="w-full h-full object-cover" 
                />
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => handleRemoveGalleryImage(idx)}
                  className="absolute inset-0 bg-red-650/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white cursor-pointer disabled:opacity-50"
                  title="Hapus gambar ini"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {isUploadingGallery && (
              <div className="h-16 rounded-xl border border-dashed border-amber-500/50 bg-slate-950/90 flex flex-col items-center justify-center text-amber-500 animate-pulse">
                <LucideIcons.Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-[7px] font-bold mt-1 uppercase font-mono">Memuat...</span>
              </div>
            )}
            {formData.images.length < 4 && !isUploadingGallery && (
              <button
                type="button"
                disabled={isSaving}
                onClick={() => galleryInputRef.current?.click()}
                className="h-16 rounded-xl border border-dashed border-slate-800 hover:border-amber-500/50 bg-slate-950 flex flex-col items-center justify-center text-slate-500 hover:text-amber-500 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <UploadCloud size={16} />
                <span className="text-[8px] font-bold mt-1 font-sans">Tambah</span>
              </button>
            )}
          </div>
          <input 
            type="file"
            ref={galleryInputRef}
            onChange={handleGalleryFileChange}
            accept="image/*"
            multiple
            className="hidden"
          />
        </div>
      </div>

      <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-850/80 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h5 className="text-[11px] font-bold text-white uppercase font-mono">Sewa Harian (Daily rent scheme)</h5>
            <p className="text-[9px] text-slate-500 mt-0.5">Aktifkan agar kamar ini bisa disewa transit harian.</p>
          </div>
          <input 
            type="checkbox"
            checked={formData.is_daily_enabled}
            onChange={(e) => setFormData({ ...formData, is_daily_enabled: e.target.checked })}
            className="w-4 h-4 accent-amber-500 cursor-pointer"
          />
        </div>

        {formData.is_daily_enabled && (
          <div className="space-y-1 animate-fade-in">
            <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">Tarif Sewa Harian (IDR / Hari)</label>
            <input 
              type="number" 
              required
              value={formData.daily_price}
              onChange={(e) => setFormData({ ...formData, daily_price: Number(e.target.value) })}
              className="w-full bg-slate-900 border border-slate-800 p-2 rounded-xl text-slate-250 font-mono text-[11px]"
            />
          </div>
        )}
      </div>

      {/* Pemesanan ke Airbnb & Link Airbnb Kamar */}
      <div className="bg-[#FF385C]/10 p-4 rounded-2xl border border-[#FF385C]/30 space-y-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-[#FF385C] text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
              <svg className="w-4 h-4 fill-current" viewBox="0 0 32 32">
                <path d="M16 1c2.008 0 3.463.963 4.751 3.269l.533 1.025c1.954 3.83 6.114 12.54 7.1 14.836l.145.353c.667 1.591.91 2.472.96 3.396l.011.315c0 4.298-3.322 7.806-7.5 7.806-3.13 0-5.836-1.956-6.953-4.758l-.147-.384-.131-.383C13.782 29.28 11.027 31.25 7.8 31.25 3.522 31.25.2 27.742.2 23.444c0-1.127.283-2.222.844-3.332l.272-.505c1.036-1.84 5.37-10.824 7.382-14.814l.551-1.058C10.537 1.963 11.992 1 14 1zm0 2c-1.11 0-2.072.585-3.082 2.387l-.46.884c-1.97 3.908-6.241 12.782-7.243 14.562l-.213.394c-.426.84-.602 1.623-.602 2.217 0 3.197 2.483 5.806 5.6 5.806 2.502 0 4.678-1.637 5.385-4.084l.113-.424.113-.424C12.392 20.355 13.9 18.5 16 18.5s3.608 1.855 4.194 5.815l.113.424.113.424c.707 2.447 2.883 4.084 5.385 4.084 3.117 0 5.6-2.609 5.6-5.806 0-.594-.176-1.377-.602-2.217l-.213-.394c-1.002-1.78-5.273-10.654-7.243-14.562l-.46-.884C21.072 3.585 20.11 3 19 3zm0 17.5c-1.105 0-2 .895-2 2s.895 2 2 2 2-.895 2-2-.895-2-2-2z" />
              </svg>
            </div>
            <div>
              <h5 className="text-[11px] font-extrabold text-white uppercase font-mono tracking-wide">
                Jadikan Pemesanan ke Airbnb
              </h5>
              <p className="text-[9px] text-slate-300 mt-0.5 leading-relaxed">
                Aktifkan jika unit kamar ini bisa dipesan melalui Airbnb dan tambahkan link listing Airbnb kamar.
              </p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={formData.is_airbnb_enabled}
            onChange={(e) => setFormData({ ...formData, is_airbnb_enabled: e.target.checked })}
            className="w-4 h-4 accent-[#FF385C] cursor-pointer shrink-0"
          />
        </div>

        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between">
            <label className="text-[10px] uppercase font-bold tracking-wider text-rose-300 font-mono">
              Link Listing Airbnb Kamar (URL)
            </label>
            {formData.airbnb_url.trim() && (
              <a
                href={formData.airbnb_url.trim().startsWith('http') ? formData.airbnb_url.trim() : `https://${formData.airbnb_url.trim()}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[9px] font-bold text-[#FF385C] hover:underline flex items-center gap-1 font-mono"
              >
                <span>Tes Buka Link Airbnb ↗</span>
              </a>
            )}
          </div>
          <input
            type="url"
            value={formData.airbnb_url}
            onChange={(e) => {
              const val = e.target.value;
              setFormData(prev => ({
                ...prev,
                airbnb_url: val,
                is_airbnb_enabled: val.trim() ? true : prev.is_airbnb_enabled
              }));
            }}
            placeholder="https://www.airbnb.co.id/rooms/..."
            className="w-full bg-slate-950 border border-[#FF385C]/40 focus:border-[#FF385C] p-2.5 rounded-xl text-slate-100 placeholder-slate-500 outline-none font-mono text-[11px]"
          />
          <span className="text-[9px] text-slate-400 block">
            Tempelkan tautan kamar di Airbnb. Tombol "Pesan via Airbnb" akan otomatis muncul pada kartu kamar ini untuk pengunjung.
          </span>
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          disabled={isSaving}
          onClick={onCancel}
          className="flex-1 py-1.5 rounded-xl border border-white/10 hover:bg-white/5 text-slate-305 font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Batalkan
        </button>
        <button
          type="submit"
          disabled={isSaving || isUploadingMain || isUploadingGallery}
          className="flex-1 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-450 border border-amber-500 text-black font-extrabold transition-all cursor-pointer text-[11px] flex items-center justify-center gap-1.5 disabled:bg-amber-500/50 disabled:border-amber-500/30 disabled:cursor-not-allowed"
        >
          {isSaving ? (
            <>
              <LucideIcons.Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Menyimpan...</span>
            </>
          ) : (
            room ? 'Simpan Perubahan' : 'Buat Baru'
          )}
        </button>
      </div>
    </form>
  );
};

export default RoomForm;
