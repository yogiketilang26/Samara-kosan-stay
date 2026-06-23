import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { configureSupabaseDynamically } from './lib/supabase';

// Fetch runtime configuration from backend to ensure browser is always in sync with server-side credentials
fetch('/api/config')
  .then(res => res.json())
  .then(config => {
    if (config.supabaseUrl && config.supabaseAnonKey) {
      configureSupabaseDynamically(config.supabaseUrl, config.supabaseAnonKey);
    }
  })
  .catch(err => {
    console.warn('Could not load runtime environment configuration from server:', err);
  })
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
