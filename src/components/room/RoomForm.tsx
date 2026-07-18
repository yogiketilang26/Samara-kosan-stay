import React, { useState, useEffect, useRef } from 'react';
import { Room, Property } from '../../types';
import { compressImage } from '../../utils/imageCompressor';
import { UploadCloud, Trash2, Image } from 'lucide-react';
import { PRESETS } from '../../utils/imagePresets';
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
    if (room) {
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
        image_url: room.image_url || '',
        images: room.images || []
      });
      setSelectedFacilityIds((room.facilities || []).map((f: any) => f.id));
    } else {
      setFormData({
        property_id: properties[0]?.id || 1,
        room_number: '',
        room_type: 'Standard',
        price: 1500000,
        size_sqm: 15.0,
        floor: 1,
        status: 'available',
        is_daily_enabled: false,
        daily_price: 100000,
        image_url: '',
        images: []
      });
      setSelectedFacilityIds([]);
    }
  }, [room, properties]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert("Ukuran gambar maksimal adalah 10MB!");
        return;
      }
      setIsUploadingMain(true);
      try {
        const compressedBase64 = await compressImage(file, 640, 480, 0.5);
        setFormData(prev => ({
          ...prev,
          image_url: compressedBase64
        }));
      } catch (err) {
        console.error(err);
        alert("Gagal memproses gambar!");
      } finally {
        setIsUploadingMain(false);
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
      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (file.size > 10 * 1024 * 1024) {
            alert("Ukuran gambar maksimal adalah 10MB!");
            continue;
          }
          const compressedBase64 = await compressImage(file, 640, 480, 0.5);
          newImages.push(compressedBase64);
        }
        setFormData(prev => ({
          ...prev,
          images: newImages.slice(0, 4) // max 4 images
        }));
      } catch (err) {
        console.error(err);
        alert("Gagal memproses gambar galeri!");
      } finally {
        setIsUploadingGallery(false);
        if (galleryInputRef.current) {
          galleryInputRef.current.value = '';
        }
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
      await onSave({
        id: room?.id,
        property_id: Number(formData.property_id),
        room_number: formData.room_number,
        room_type: formData.room_type,
        price: Number(formData.price),
        size_sqm: Number(formData.size_sqm),
        floor: Number(formData.floor),
        status: formData.status,
        facilities: selectedFacilityIds as any,
        is_daily_enabled: formData.is_daily_enabled,
        daily_price: formData.is_daily_enabled ? Number(formData.daily_price) : 0,
        image_url: formData.image_url,
        images: formData.images
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
            <option value="VVIPSuite">VVIP Suite</option>
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
          {formData.image_url ? (
            <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 p-2 group">
              <img 
                src={formData.image_url || null} 
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

        {/* Room Preset Selector */}
        <div className="mt-2.5 bg-slate-900 border border-slate-805 p-3 rounded-2xl space-y-2">
          <span className="text-[9px] font-bold text-slate-400 font-mono block uppercase">Gunakan Preset Kamar Premium (Offline & Cepat)</span>
          <div className="grid grid-cols-3 gap-2">
            {PRESETS.filter(p => p.category === 'room').map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setFormData({ ...formData, image_url: p.dataUrl })}
                className={`group relative rounded-xl overflow-hidden border transition-all text-left bg-slate-950 p-1 cursor-pointer outline-none ${
                  formData.image_url === p.dataUrl ? 'border-amber-500 ring-1 ring-amber-500/30' : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="relative h-12 rounded-lg overflow-hidden bg-slate-900">
                  <img src={p.dataUrl} alt={p.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-[8px] font-bold font-mono text-white bg-slate-950/80 px-1 py-0.5 rounded border border-slate-800">PILIH</span>
                  </div>
                </div>
                <span className="text-[8px] font-medium font-sans text-slate-350 block mt-1 truncate px-0.5 leading-none">{p.name.replace('Preset Kamar ', '')}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Additional Room Gallery (Multiple Images) */}
        <div className="mt-4 bg-slate-900 border border-slate-805 p-3 rounded-2xl space-y-2">
          <span className="text-[9px] font-bold text-slate-400 font-mono block uppercase">Foto Tambahan / Galeri Unit (Maksimal 4)</span>
          <div className="grid grid-cols-4 gap-2">
            {formData.images.map((img, idx) => (
              <div key={idx} className="relative group h-16 rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
                <img src={img || null} alt={`Galeri ${idx + 1}`} className="w-full h-full object-cover" />
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
