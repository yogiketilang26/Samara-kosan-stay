import React, { useState, useEffect, useRef } from 'react';
import { Property } from '../../types';
import { compressImage } from '../../utils/imageCompressor';
import { Button } from '../common/Button';
import { UploadCloud, Trash2, Image, RotateCw } from 'lucide-react';
import { PRESETS } from '../../utils/imagePresets';
import { database } from '../../lib/supabase';
import * as LucideIcons from 'lucide-react';

const renderIcon = (iconName: string) => {
  const IconComponent = (LucideIcons as any)[iconName] || LucideIcons.HelpCircle;
  return <IconComponent size={12} className="shrink-0" />;
};

interface PropertyFormProps {
  property?: Property | null;
  onSave: (prop: Partial<Property>) => void;
  onCancel: () => void;
  isSaving?: boolean;
}

export const PropertyForm: React.FC<PropertyFormProps> = ({
  property,
  onSave,
  onCancel,
  isSaving = false
}) => {
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    price: 1500000,
    type: 'campur' as 'putra' | 'putri' | 'campur',
    image_url: '',
    images: [] as string[],
    lat: -6.2,
    lng: 106.8,
    description: '',
    additional_rules: '',
    policies: '',
    terms: '',
    regulations: ''
  });

  const [masterFacilities, setMasterFacilities] = useState<any[]>([]);
  const [selectedFacilityIds, setSelectedFacilityIds] = useState<number[]>([]);

  useEffect(() => {
    async function loadMasterFacilities() {
      try {
        const facs = await database.fetchMasterFacilities();
        setMasterFacilities(facs);
      } catch (err) {
        console.error('Error loading master facilities in PropertyForm:', err);
      }
    }
    loadMasterFacilities();
  }, []);

  useEffect(() => {
    if (property) {
      setFormData({
        name: property.name,
        address: property.address,
        price: property.price,
        type: property.type,
        image_url: property.image_url,
        images: property.images || [],
        lat: property.lat || -6.2,
        lng: property.lng || 106.8,
        description: property.description || '',
        additional_rules: property.additional_rules || '',
        policies: property.policies || '',
        terms: property.terms || '',
        regulations: property.regulations || ''
      });
      setSelectedFacilityIds((property.facilities || []).map((f: any) => f.id));
    } else {
      setSelectedFacilityIds([]);
    }
  }, [property]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert("Ukuran gambar maksimal adalah 10MB!");
        return;
      }
      try {
        const compressedBase64 = await compressImage(file, 640, 480, 0.5);
        setFormData(prev => ({
          ...prev,
          image_url: compressedBase64
        }));
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleRemoveImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (confirm("Apakah Anda yakin ingin menghapus gambar utama properti ini?")) {
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
      const newImages = [...formData.images];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > 10 * 1024 * 1024) {
          alert("Ukuran gambar maksimal adalah 10MB!");
          continue;
        }
        try {
          const compressedBase64 = await compressImage(file, 640, 480, 0.5);
          newImages.push(compressedBase64);
        } catch (err) {
          console.error(err);
        }
      }
      setFormData(prev => ({
        ...prev,
        images: newImages.slice(0, 4) // max 4 images
      }));
      if (galleryInputRef.current) {
        galleryInputRef.current.value = '';
      }
    }
  };

  const handleRemoveGalleryImage = (index: number) => {
    if (confirm("Apakah Anda yakin ingin menghapus foto galeri ini?")) {
      setFormData(prev => ({
        ...prev,
        images: prev.images.filter((_, idx) => idx !== index)
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    onSave({
      id: property?.id,
      name: formData.name,
      address: formData.address,
      price: Number(formData.price),
      type: formData.type,
      facilities: selectedFacilityIds as any,
      image_url: formData.image_url,
      images: formData.images,
      lat: Number(formData.lat),
      lng: Number(formData.lng),
      description: formData.description,
      additional_rules: formData.additional_rules,
      policies: formData.policies,
      terms: formData.terms,
      regulations: formData.regulations
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 font-sans text-xs text-slate-300">
      <div className="space-y-1">
        <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">Nama Kosan Properti</label>
        <input 
          type="text" 
          required
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Contoh: Samara Premium Ciputra"
          className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-200 outline-none focus:border-amber-500 uppercase font-semibold text-[11px]"
        />
      </div>

      <div className="space-y-1">
        <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">Alamat Fisik Lengkap</label>
        <input 
          type="text" 
          required
          value={formData.address}
          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          placeholder="Jl. Ciputra Raya No. 45, Jakarta Selatan"
          className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-200 outline-none focus:border-amber-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">Tarif Mulai (IDR / Bulan)</label>
          <input 
            type="number" 
            required
            value={formData.price}
            onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
            className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-200 font-mono text-[11px]"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">Kategori Penghuni Kos</label>
          <select 
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
            className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-200 outline-none font-bold uppercase cursor-pointer"
          >
            <option value="campur">CAMPUR</option>
            <option value="putra">PUTRA</option>
            <option value="putri">PUTRI</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">Fasilitas Properti (Pilih Master Fasilitas)</label>
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

      <div className="space-y-1 font-sans">
        <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono block mb-1">Foto Sampul Utama / Gallery Properti</label>
        
        {formData.image_url ? (
          <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 p-2 group">
            <img 
              src={formData.image_url || null} 
              alt="Pratinjau Sampul" 
              className="w-full h-40 object-cover rounded-xl"
            />
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2 bg-slate-850 hover:bg-slate-750 text-white rounded-xl text-xs font-bold font-mono transition shadow-lg cursor-pointer border border-slate-755"
              >
                Ganti Gambar
              </button>
              <button
                type="button"
                onClick={handleRemoveImage}
                className="p-2 bg-red-650 hover:bg-red-550 text-white rounded-xl text-xs font-bold font-mono transition shadow-lg flex items-center gap-1 cursor-pointer"
              >
                <Trash2 size={12} />
                Hapus
              </button>
            </div>
          </div>
        ) : (
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="border border-dashed border-slate-800 hover:border-amber-500/50 bg-slate-950 p-6 rounded-2xl text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 group"
          >
            <UploadCloud size={24} className="text-slate-500 group-hover:text-amber-500 transition-colors animate-pulse" />
            <div>
              <span className="text-slate-300 block font-bold text-xs font-sans group-hover:text-amber-500 transition-colors">Pilih & Upload Gambar Utama</span>
              <span className="text-[9px] text-slate-500 font-mono block mt-1">Ekstensi PNG, JPG, JPEG (Maksimal 5MB)</span>
            </div>
          </div>
        )}
        <input 
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          className="hidden"
        />

        {/* Preset Selector */}
        <div className="mt-3 bg-slate-900 border border-slate-805 p-3 rounded-2xl space-y-2">
          <span className="text-[9px] font-bold text-slate-400 font-mono block uppercase">Gunakan Preset Hunian Premium (Offline & Cepat)</span>
          <div className="grid grid-cols-3 gap-2">
            {PRESETS.filter(p => p.category === 'property').map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setFormData({ ...formData, image_url: p.dataUrl })}
                className={`group relative rounded-xl overflow-hidden border transition-all text-left bg-slate-950 p-1 cursor-pointer outline-none ${
                  formData.image_url === p.dataUrl ? 'border-amber-500 ring-1 ring-amber-500/30' : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="relative h-14 rounded-lg overflow-hidden bg-slate-900">
                  <img src={p.dataUrl} alt={p.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-[8px] font-bold font-mono text-white bg-slate-950/80 px-1.5 py-0.5 rounded border border-slate-800">PILIH</span>
                  </div>
                </div>
                <span className="text-[8px] font-medium font-sans text-slate-350 block mt-1 truncate px-0.5 leading-none">{p.name.replace('Preset Samara ', '')}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-1.5 font-sans">
        <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono block">Foto Galeri Pendukung / Foto Konten (Maksimal 4 Gambar)</label>
        
        {/* Existing gallery images grid */}
        <div className="grid grid-cols-4 gap-2">
          {formData.images.map((img, idx) => (
            <div key={idx} className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950 aspect-video group">
              <img 
                src={img || null} 
                alt={`Galeri ${idx + 1}`} 
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => handleRemoveGalleryImage(idx)}
                  className="p-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors cursor-pointer"
                  title="Hapus Foto"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}

          {formData.images.length < 4 && (
            <div 
              onClick={() => galleryInputRef.current?.click()}
              className="border border-dashed border-slate-800 hover:border-amber-500/50 bg-slate-950 rounded-xl aspect-video flex flex-col items-center justify-center cursor-pointer transition group"
            >
              <UploadCloud size={16} className="text-slate-500 group-hover:text-amber-500 transition-colors animate-pulse" />
              <span className="text-[9px] text-slate-400 mt-1 font-bold group-hover:text-amber-500 transition-colors">Tambah Foto</span>
            </div>
          )}
        </div>
        
        {formData.images.length < 4 && (
          <div className="mt-2 bg-slate-900 border border-slate-805 p-2 rounded-xl space-y-1.5">
            <span className="text-[8px] font-bold text-slate-400 font-mono block uppercase">Gunakan Preset untuk Galeri:</span>
            <div className="flex gap-2.5 overflow-x-auto pb-1 no-scrollbar">
              {PRESETS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    if (formData.images.length < 4) {
                      setFormData({ ...formData, images: [...formData.images, p.dataUrl] });
                    }
                  }}
                  className="shrink-0 relative w-16 h-10 rounded-lg overflow-hidden border border-slate-800 hover:border-slate-650 bg-slate-950 cursor-pointer p-0.5 group outline-none"
                >
                  <img src={p.dataUrl} alt={p.name} className="w-full h-full object-cover rounded" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-[7px] font-bold text-white bg-slate-950/80 px-1 py-0.5 rounded">+ ADD</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
        
        <input 
          type="file"
          ref={galleryInputRef}
          onChange={handleGalleryFileChange}
          accept="image/*"
          multiple
          className="hidden"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">Latitude GPS Map</label>
          <input 
            type="number" 
            step="any"
            value={formData.lat}
            onChange={(e) => setFormData({ ...formData, lat: Number(e.target.value) })}
            className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-200 font-mono"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">Longitude GPS Map</label>
          <input 
            type="number" 
            step="any"
            value={formData.lng}
            onChange={(e) => setFormData({ ...formData, lng: Number(e.target.value) })}
            className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-200 font-mono"
          />
        </div>
      </div>

      <div className="space-y-2 border-t border-slate-800/60 pt-4">
        <h3 className="text-slate-300 font-bold font-display text-[11px] uppercase tracking-wider text-amber-500">Metadata Tambahan & Informasi Detail</h3>
        
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">Deskripsi Properti</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Deskripsi detail properti..."
            rows={3}
            className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-200 outline-none focus:border-amber-500 resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">Aturan Tambahan Penghuni</label>
            <textarea
              value={formData.additional_rules}
              onChange={(e) => setFormData({ ...formData, additional_rules: e.target.value })}
              placeholder="1. Aturan satu..."
              rows={3}
              className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-200 outline-none focus:border-amber-500 text-[10px] leading-relaxed resize-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">Kebijakan Hunian</label>
            <textarea
              value={formData.policies}
              onChange={(e) => setFormData({ ...formData, policies: e.target.value })}
              placeholder="Kebijakan pembatalan, pembayaran..."
              rows={3}
              className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-200 outline-none focus:border-amber-500 text-[10px] leading-relaxed resize-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">Ketentuan Sewa</label>
            <textarea
              value={formData.terms}
              onChange={(e) => setFormData({ ...formData, terms: e.target.value })}
              placeholder="Ketentuan deposit, denda..."
              rows={3}
              className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-200 outline-none focus:border-amber-500 text-[10px] leading-relaxed resize-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">Tata Tertib Hunian</label>
            <textarea
              value={formData.regulations}
              onChange={(e) => setFormData({ ...formData, regulations: e.target.value })}
              placeholder="Tata tertib jam malam, fasilitas..."
              rows={3}
              className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-200 outline-none focus:border-amber-500 text-[10px] leading-relaxed resize-none"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          disabled={isSaving}
          onClick={onCancel}
          className="flex-1 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-slate-300 font-bold transition-all duration-200 cursor-pointer disabled:opacity-50"
        >
          Batalkan
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-450 border border-amber-500 text-black font-extrabold transition-all duration-200 cursor-pointer text-[11px] disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {isSaving ? (
            <>
              <RotateCw className="animate-spin animate-infinite" size={14} />
              <span>Menyimpan...</span>
            </>
          ) : (
            property ? 'Simpan Perubahan' : 'Buat Baru'
          )}
        </button>
      </div>
    </form>
  );
};

export default PropertyForm;
