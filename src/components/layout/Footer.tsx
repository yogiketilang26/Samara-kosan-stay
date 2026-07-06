import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-[#3A444D] border-t border-white/10 text-slate-200 py-8 px-4 text-center text-xs select-none">
      <div className="max-w-7xl mx-auto space-y-3">
        <div className="flex items-center justify-center gap-2 text-white">
          <span className="font-extrabold font-display text-sm tracking-widest">SAMARA STAY</span>
          <span className="text-[10px] text-emerald-400 font-bold font-mono">V1.3.2</span>
        </div>
        <p className="max-w-md mx-auto text-slate-300 leading-relaxed font-light">
          Ekosistem terintegrasi pengelolaan sewa hunian kost dan janji temu kovenan survey berbasis PostgreSQL, React App, & Midtrans Core API.
        </p>
        <p className="text-[10px] text-slate-400 font-mono pt-2">
          © 2026 Samara Stay. Seluruh hak cipta dilindungi undang-undang.
        </p>
      </div>
    </footer>
  );
};

export default Footer;
