import React, { useState, useEffect, useRef } from 'react';
import { Room, Property } from '../../types';
import { compressImage } from '../../utils/imageCompressor';
import { UploadCloud, Trash2, Image } from 'lucide-react';

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
    facilitiesInput: '',
    is_daily_enabled: false,
    daily_price: 100000,
    image_url: ''
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

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
        facilitiesInput: room.facilities.join(', '),
        is_daily_enabled: room.is_daily_enabled || false,
        daily_price: room.daily_price || 100000,
        image_url: room.image_url || ''
      });
    } else {
      setFormData({
        property_id: properties[0]?.id || 1,
        room_number: '',
        room_type: 'Standard',
        price: 1500000,
        size_sqm: 15.0,
        floor: 1,
        status: 'available',
        facilitiesInput: '',
        is_daily_enabled: false,
        daily_price: 100000,
        image_url: ''
      });
    }
  }, [room, properties]);

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
    if (confirm("Apakah Anda yakin ingin menghapus gambar kamar ini?")) {
      setFormData(prev => ({
        ...prev,
        image_url: ''
      }));
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const facilitiesList = formData.facilitiesInput
      .split(',')
      .map(f => f.trim())
      .filter(f => f.length > 0);

    onSave({
      id: room?.id,
      property_id: Number(formData.property_id),
      room_number: formData.room_number,
      room_type: formData.room_type,
      price: Number(formData.price),
      size_sqm: Number(formData.size_sqm),
      floor: Number(formData.floor),
      status: formData.status,
      facilities: facilitiesList,
      is_daily_enabled: formData.is_daily_enabled,
      daily_price: formData.is_daily_enabled ? Number(formData.daily_price) : 0,
      image_url: formData.image_url
    });
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

      <div className="space-y-1">
        <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">Fasilitas Dalam Kamar (Pisahkan Koma)</label>
        <input 
          type="text" 
          value={formData.facilitiesInput}
          onChange={(e) => setFormData({ ...formData, facilitiesInput: e.target.value })}
          placeholder="Ac, WiFi, Kasur Springbed, Kamar Mandi Dalam"
          className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-slate-200 outline-none focus:border-amber-500"
        />
      </div>

      <div className="space-y-1">
        <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono block mb-1">Foto Kamar / Unit Gallery</label>
        
        {formData.image_url ? (
          <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 p-2 group">
            <img 
              src={formData.image_url} 
              alt="Pratinjau Kamar" 
              className="w-full h-36 object-cover rounded-xl animate-fade-in"
            />
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-1 px-2.5 bg-slate-850 hover:bg-slate-755 text-white rounded-xl text-[10px] font-bold font-mono transition shadow-lg cursor-pointer border border-slate-755"
              >
                Ganti Gambar
              </button>
              <button
                type="button"
                onClick={handleRemoveImage}
                className="p-1 px-2.5 bg-red-650 hover:bg-red-555 text-white rounded-xl text-[10px] font-bold font-mono transition shadow-lg flex items-center gap-1 cursor-pointer"
              >
                <Trash2 size={11} />
                Hapus
              </button>
            </div>
          </div>
        ) : (
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="border border-dashed border-slate-800 hover:border-amber-500/50 bg-slate-950 p-4 rounded-2xl text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-1.5 group font-sans"
          >
            <UploadCloud size={20} className="text-slate-500 group-hover:text-amber-500 transition-colors animate-pulse" />
            <div>
              <span className="text-slate-300 block font-bold text-[11px] group-hover:text-amber-500 transition-colors">Pilih & Upload Gambar Kamar</span>
              <span className="text-[8px] text-slate-500 font-mono block mt-0.5">Maksimal 5MB (PNG, JPG, JPEG)</span>
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
          onClick={onCancel}
          className="flex-1 py-1.5 rounded-xl border border-white/10 hover:bg-white/5 text-slate-305 font-bold transition-all cursor-pointer"
        >
          Batalkan
        </button>
        <button
          type="submit"
          className="flex-1 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-450 border border-amber-500 text-black font-extrabold transition-all cursor-pointer text-[11px]"
        >
          {room ? 'Simpan Perubahan' : 'Buat Baru'}
        </button>
      </div>
    </form>
  );
};

export default RoomForm;
