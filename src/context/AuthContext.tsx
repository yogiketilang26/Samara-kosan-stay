import React, { createContext, useContext, useState, useEffect } from 'react';
import { database, supabase, isSupabaseConfigured } from '../lib/supabase';

export interface UserProfile {
  id: string;
  email: string;
  role: 'admin' | 'user';
  name: string;
}

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check local storage for persistent session
    const storedUser = localStorage.getItem('samara_auth_session');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        localStorage.removeItem('samara_auth_session');
      }
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setLoading(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanPassword = password.trim();

      // Standard / Sandbox secure default credentials
      if (
        (cleanEmail === 'admin@samarastay.co.id' || cleanEmail === 'yogiketilang33@gmail.com') && 
        cleanPassword === 'samarastay2026'
      ) {
        const adminUser: UserProfile = {
          id: cleanEmail === 'yogiketilang33@gmail.com' ? 'admin-root-01' : 'admin-001',
          name: cleanEmail === 'yogiketilang33@gmail.com' ? 'Super Admin Utama' : 'Samara Admin Operator',
          email: cleanEmail,
          role: 'admin'
        };
        setUser(adminUser);
        localStorage.setItem('samara_auth_session', JSON.stringify(adminUser));
        database.logActivity("System", "ADMIN_LOGIN", `Admin ${adminUser.name} berhasil masuk via Secure Auth`);
        return { success: true };
      }

      // If Supabase Auth is configured, let's also allow authenticating via real Supabase Auth
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: cleanPassword
        });

        if (!error && data.user) {
          // Check role from users table
          const { data: userData } = await supabase
            .from('users')
            .select('*')
            .eq('email', cleanEmail)
            .maybeSingle();

          const role = userData?.role === 'admin' || userData?.role === 'super' || userData?.role === 'finance' ? 'admin' : 'user';
          
          const profile: UserProfile = {
            id: data.user.id,
            name: userData?.full_name || data.user.email?.split('@')[0] || 'User',
            email: data.user.email || cleanEmail,
            role: role as 'admin' | 'user'
          };

          setUser(profile);
          localStorage.setItem('samara_auth_session', JSON.stringify(profile));
          database.logActivity("System", "ADMIN_LOGIN", `User ${profile.name} masuk via Supabase Auth`);
          return { success: true };
        } else if (error) {
          return { success: false, error: error.message };
        }
      }

      // If credentials do not match, return error
      return { 
        success: false, 
        error: 'Email atau password salah. Coba gunakan default: admin@samarastay.co.id / samarastay2026' 
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Terjadi kesalahan sistem' };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setUser(null);
    localStorage.removeItem('samara_auth_session');
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
    }
    database.logActivity("System", "LOGOUT", "Sesi aktif berhasil diakhiri");
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
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
