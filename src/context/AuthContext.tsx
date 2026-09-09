import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface UserProfile {
  id: string;
  email: string;
  role: 'super' | 'super_admin' | 'owner' | 'admin' | 'staff' | 'finance' | 'user' | 'tenant';
  raw_role?: string;
  name: string;
}

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (email: string, password: string, fullName: string, portal?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Check backend session on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        const savedToken = typeof window !== 'undefined'
          ? (localStorage.getItem('samara_access_token') || localStorage.getItem('sb-access-token'))
          : null;
        const savedRefreshToken = typeof window !== 'undefined'
          ? (localStorage.getItem('samara_refresh_token') || localStorage.getItem('sb-refresh-token'))
          : null;

        const headers: Record<string, string> = {};
        if (savedToken) {
          headers['Authorization'] = `Bearer ${savedToken}`;
          headers['x-access-token'] = savedToken;
        }
        if (savedRefreshToken) {
          headers['x-refresh-token'] = savedRefreshToken;
        }

        const res = await fetch('/api/auth/me', {
          headers,
          credentials: 'include'
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.user) {
            if (data.access_token) {
              localStorage.setItem('samara_access_token', data.access_token);
              localStorage.setItem('sb-access-token', data.access_token);
            }
            if (data.refresh_token) {
              localStorage.setItem('samara_refresh_token', data.refresh_token);
              localStorage.setItem('sb-refresh-token', data.refresh_token);
            }
            if (data.access_token && data.refresh_token) {
              await supabase.auth.setSession({
                access_token: data.access_token,
                refresh_token: data.refresh_token
              }).catch((e) => console.error('[AUTH] Failed to set client-side supabase session on mount:', e));
            }
            setUser(data.user);
          } else {
            setUser(null);
          }
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error('[AUTH] Failed to fetch current session:', err);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email: email.trim(),
          password: password.trim()
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Email atau password salah.' };
      }

      if (data.user) {
        if (data.access_token) {
          localStorage.setItem('samara_access_token', data.access_token);
          localStorage.setItem('sb-access-token', data.access_token);
        }
        if (data.refresh_token) {
          localStorage.setItem('samara_refresh_token', data.refresh_token);
          localStorage.setItem('sb-refresh-token', data.refresh_token);
        }
        if (data.access_token && data.refresh_token) {
          await supabase.auth.setSession({
            access_token: data.access_token,
            refresh_token: data.refresh_token
          }).catch((e) => console.error('[AUTH] Failed to set client-side supabase session during login:', e));
        }
        setUser(data.user);
        return { success: true };
      }

      return { success: false, error: 'Format respon dari server tidak valid' };
    } catch (err: any) {
      console.error('[AUTH] Login exception:', err);
      return { success: false, error: err.message || 'Terjadi kesalahan jaringan' };
    }
  };

  const signup = async (email: string, password: string, fullName: string, portal?: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email: email.trim(),
          password: password.trim(),
          fullName: fullName.trim(),
          portal: portal
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Pendaftaran gagal.' };
      }

      if (data.user) {
        if (data.access_token) {
          localStorage.setItem('samara_access_token', data.access_token);
          localStorage.setItem('sb-access-token', data.access_token);
        }
        if (data.refresh_token) {
          localStorage.setItem('samara_refresh_token', data.refresh_token);
          localStorage.setItem('sb-refresh-token', data.refresh_token);
        }
        if (data.access_token && data.refresh_token) {
          await supabase.auth.setSession({
            access_token: data.access_token,
            refresh_token: data.refresh_token
          }).catch((e) => console.error('[AUTH] Failed to set client-side supabase session during signup:', e));
        }
        setUser(data.user);
        return { success: true };
      }

      return { 
        success: true, 
        error: data.message || 'Pendaftaran berhasil! Silakan masuk menggunakan email dan password tersebut.' 
      };
    } catch (err: any) {
      console.error('[AUTH] Register exception:', err);
      return { success: false, error: err.message || 'Terjadi kesalahan jaringan' };
    }
  };

  const logout = async () => {
    try {
      const savedToken = typeof window !== 'undefined' ? localStorage.getItem('samara_access_token') : null;
      const headers: Record<string, string> = {};
      if (savedToken) {
        headers['Authorization'] = `Bearer ${savedToken}`;
      }
      await fetch('/api/auth/logout', { method: 'POST', headers, credentials: 'include' }).catch(() => {});
      await supabase.auth.signOut().catch(() => {});
    } catch (e) {
      console.error('[AUTH] Logout request error:', e);
    }
    if (typeof window !== 'undefined') {
      localStorage.removeItem('samara_access_token');
      localStorage.removeItem('samara_refresh_token');
      localStorage.removeItem('sb-access-token');
      localStorage.removeItem('sb-refresh-token');
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return context;
};
