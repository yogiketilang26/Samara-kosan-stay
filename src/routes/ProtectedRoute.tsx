import React from 'react';
import { useAuth } from '../hooks/useAuth';
import Loader from '../components/common/Loader';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading, loginAsAdmin } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <Loader label="Memeriksa Otorisasi Sesi.." />
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center text-center p-6 space-y-4 font-sans text-slate-300">
        <h3 className="text-sm font-bold uppercase tracking-widest text-[#f5a623] font-display">AKSES TERBATAS OPERATOR</h3>
        <p className="text-xs text-slate-400 max-w-sm">
          Sesi aktif Anda tidak memiliki hak otorisasi Admin. Silakan login sebagai pengurus kos menggunakan tombol di bawah ini.
        </p>
        <button
          onClick={loginAsAdmin}
          className="px-4 py-2 bg-[#f5a623] text-black font-extrabold uppercase rounded-xl hover:scale-95 transition-all text-[10px] cursor-pointer"
        >
          Masuk Sebagai Admin Operator
        </button>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
