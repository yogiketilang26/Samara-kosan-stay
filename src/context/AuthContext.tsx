import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { setCacheRoleScope, clearSensitiveLocalCache } from '../lib/queryBudget';

export interface UserProfile {
  id: string;
  email: string;
  role: 'super' | 'super_admin' | 'owner' | 'admin' | 'staff' | 'finance' | 'user' | 'tenant' | 'anak_owner' | 'anak owner';
  raw_role?: string;
  name: string;
  access?: string;
  property_id?: number | null;
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

  // Check backend & Supabase session on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        let savedToken = typeof window !== 'undefined'
          ? (localStorage.getItem('samara_access_token') || localStorage.getItem('sb-access-token'))
          : null;
        let savedRefreshToken = typeof window !== 'undefined'
          ? (localStorage.getItem('samara_refresh_token') || localStorage.getItem('sb-refresh-token'))
          : null;

        // Fallback to active Supabase SDK session if localStorage keys were not yet populated
        if (!savedToken) {
          try {
            const { data: sbSession } = await supabase.auth.getSession();
            if (sbSession?.session?.access_token) {
              savedToken = sbSession.session.access_token;
              savedRefreshToken = sbSession.session.refresh_token || savedRefreshToken;
            }
          } catch (e) {}
        }

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
              }).catch((e) => console.warn('[AUTH] Supabase session sync notice:', e?.message || e));
            }
            setCacheRoleScope(data.user.role || data.user.id || 'user');
            setUser(data.user);
          } else {
            setCacheRoleScope('public');
            setUser(null);
          }
        } else {
          setCacheRoleScope('public');
          setUser(null);
        }
      } catch (err: any) {
        console.warn('[AUTH] Current session check notice:', err?.message || err);
        setCacheRoleScope('public');
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
        // Clear any stale simulated role if the newly logged in user is not super/admin
        const loggedInRole = String(data.user.raw_role || data.user.role || '').toLowerCase();
        if (loggedInRole === 'anak_owner' || loggedInRole === 'anak owner') {
          localStorage.setItem('samara_simulated_role', 'anak_owner');
          window.dispatchEvent(new CustomEvent('samara-role-simulate', { detail: { role: 'anak_owner' } }));
        } else if (!['super', 'super_admin', 'admin'].includes(loggedInRole)) {
          localStorage.removeItem('samara_simulated_role');
          window.dispatchEvent(new CustomEvent('samara-role-simulate', { detail: { role: null } }));
        }
        setCacheRoleScope(data.user.role || data.user.id || 'user');
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
        setCacheRoleScope(data.user.role || data.user.id || 'user');
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
      localStorage.removeItem('samara_simulated_role');
      window.dispatchEvent(new CustomEvent('samara-role-simulate', { detail: { role: null } }));
    }
    setCacheRoleScope('public');
    clearSensitiveLocalCache();
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
