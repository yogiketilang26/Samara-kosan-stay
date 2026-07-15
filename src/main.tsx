import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { configureSupabaseDynamically } from './lib/supabase';

// Fetch runtime configuration from backend to ensure browser is always in sync with server-side credentials
fetch('/api/config')
  .then(res => {
    if (!res.ok) {
      throw new Error(`Server returned status: ${res.status}`);
    }
    return res.json();
  })
  .then(config => {
    if (config.supabaseUrl && config.supabaseAnonKey && config.supabaseUrl !== 'undefined' && config.supabaseAnonKey !== 'undefined') {
      const configured = configureSupabaseDynamically(config.supabaseUrl, config.supabaseAnonKey);
      if (!configured) {
        throw new Error('Supabase client failed to initialize with provided config values.');
      }
    } else {
      throw new Error('Supabase credentials missing or invalid in backend environment config.');
    }
    
    // Success: Render standard App
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch(err => {
    console.error('FATAL STARTUP ERROR:', err);
    // Render high-quality error page to fail loud and clear
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA] px-4 py-12 font-sans">
          <div className="w-full max-w-md p-8 bg-white rounded-xl shadow-lg border border-red-100 text-center">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Inisialisasi Sistem Gagal</h1>
            <p className="text-sm text-gray-600 mb-6">
              Aplikasi Samara Stay gagal memuat karena konfigurasi runtime database Supabase tidak ditemukan atau tidak valid.
            </p>
            <div className="p-3 bg-red-50 rounded-lg text-left text-xs font-mono text-red-700 break-all mb-6">
              {err.message || String(err)}
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-2.5 px-4 text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity"
              style={{ backgroundColor: '#2E6F40' }}
            >
              Coba Muat Ulang
            </button>
          </div>
        </div>
      </StrictMode>
    );
  });
