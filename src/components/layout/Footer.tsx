import React from 'react';
import { Building2, Instagram, MapPin } from 'lucide-react';

export const Footer: React.FC = () => {
  const handleScrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.location.hash = id;
    }
  };

  return (
    <footer className="bg-[#1A1D24] border-t border-slate-800 text-slate-300 py-12 px-6 select-none">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-8 text-left">
        
        {/* Brand identity & Social section */}
        <div className="md:col-span-4 space-y-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-white">
              <Building2 size={18} />
            </div>
            <span className="font-extrabold text-white font-display text-lg tracking-tight">SamaraStay</span>
          </div>
          
          <p className="text-xs text-slate-400 leading-relaxed max-w-sm">
            Platform manajemen hunian modern. Temukan kos terbaik di seluruh Indonesia dengan standar premium.
          </p>
          
          {/* Social Icons row */}
          <div className="flex items-center gap-3 pt-2">
            <a 
              href="https://instagram.com" 
              target="_blank" 
              rel="noreferrer"
              className="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-300 hover:text-white hover:border-[#0D9488] hover:bg-[#0D9488]/10 transition-all cursor-pointer"
            >
              <Instagram size={18} />
            </a>
            <a 
              href="https://tiktok.com" 
              target="_blank" 
              rel="noreferrer"
              className="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-300 hover:text-white hover:border-[#0D9488] hover:bg-[#0D9488]/10 transition-all cursor-pointer"
            >
              <svg className="w-4.5 h-4.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.02 1.59 4.23.83.99 1.95 1.7 3.2 2.11-.01 1.25-.01 2.51-.02 3.76-.9-.12-1.79-.47-2.56-1-.87-.6-1.56-1.43-1.99-2.39v7.7c.05 1.54-.36 3.12-1.19 4.41-.83 1.27-2.09 2.25-3.55 2.76-1.55.57-3.29.58-4.85.04-1.54-.52-2.88-1.55-3.72-2.94C1.94 17.06 1.5 15.17 1.71 13.3c.2-1.81 1.05-3.52 2.42-4.73 1.4-1.22 3.27-1.84 5.12-1.68.01 1.34 0 2.67-.01 4-.97-.24-2.01-.06-2.85.49-.78.53-1.28 1.42-1.35 2.37-.1 1.13.37 2.27 1.21 3.01.81.71 1.93.99 2.99.76 1.05-.21 1.96-.92 2.41-1.89.37-.77.44-1.63.43-2.47V0z"/>
              </svg>
            </a>
            <button 
              onClick={() => handleScrollTo('leaflet-map-container')}
              className="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-300 hover:text-white hover:border-[#0D9488] hover:bg-[#0D9488]/10 transition-all cursor-pointer"
            >
              <MapPin size={18} />
            </button>
          </div>
        </div>

        {/* Column 2: Perusahaan */}
        <div className="md:col-span-2 space-y-4">
          <h4 className="font-bold text-white text-sm tracking-wide">Perusahaan</h4>
          <ul className="space-y-2.5 text-xs">
            <li>
              <button 
                onClick={() => handleScrollTo('tentang-section')}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                Tentang Kami
              </button>
            </li>
            <li>
              <span className="text-slate-500 cursor-not-allowed">Karir</span>
            </li>
            <li>
              <span className="text-slate-500 cursor-not-allowed">Blog</span>
            </li>
          </ul>
        </div>

        {/* Column 3: Layanan */}
        <div className="md:col-span-3 space-y-4">
          <h4 className="font-bold text-white text-sm tracking-wide">Layanan</h4>
          <ul className="space-y-2.5 text-xs">
            <li>
              <button 
                onClick={() => handleScrollTo('cabang-samara-stay-section')}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                Cari Kamar
              </button>
            </li>
            <li>
              <button 
                onClick={() => handleScrollTo('cabang-samara-stay-section')}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                Semua Cabang
              </button>
            </li>
            <li>
              <button 
                onClick={() => handleScrollTo('faq-section')}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                FAQ
              </button>
            </li>
          </ul>
        </div>

        {/* Column 4: Legal */}
        <div className="md:col-span-3 space-y-4">
          <h4 className="font-bold text-white text-sm tracking-wide">Legal</h4>
          <ul className="space-y-2.5 text-xs">
            <li>
              <span className="text-slate-500 cursor-not-allowed">Kebijakan Privasi</span>
            </li>
            <li>
              <span className="text-slate-500 cursor-not-allowed">Syarat & Ketentuan</span>
            </li>
            <li>
              <button 
                onClick={() => handleScrollTo('kontak-section')}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer text-left"
              >
                Kontak
              </button>
            </li>
          </ul>
        </div>

      </div>

      {/* Footer bottom bar */}
      <div className="max-w-7xl mx-auto border-t border-slate-800/80 mt-10 pt-6 flex flex-col sm:flex-row justify-between items-center gap-4 text-slate-500 text-[11px] font-medium">
        <p>© 2026 SamaraStay. Seluruh hak cipta dilindungi undang-undang.</p>
        <div className="flex items-center gap-2">
          <span className="text-slate-600">Premium Kosan Ecosystem</span>
          <span className="text-[10px] text-[#0D9488]/70 font-bold font-mono">v1.3.2</span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

