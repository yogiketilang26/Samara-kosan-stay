import React, { createContext, useContext, useState, useEffect } from 'react';
import { database } from '../lib/supabase';

export interface UserProfile {
  id: string;
  email: string;
  role: 'admin' | 'user';
  name: string;
}

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  loginAsAdmin: () => void;
  loginAsUser: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>({
    id: 'user-001',
    name: 'Yogi Atmaja',
    email: 'yogiatmaja26@gmail.com',
    role: 'user'
  }); // Direct mock logged user matching seed
  const [loading, setLoading] = useState(false);

  const loginAsAdmin = () => {
    setUser({
      id: 'admin-001',
      name: 'Samara Admin Operator',
      email: 'admin@samarastay.co.id',
      role: 'admin'
    });
    database.logActivity("System", "ADMIN_LOGIN", "Masuk sebagai Admin Operator");
  };

  const loginAsUser = () => {
    setUser({
      id: 'user-001',
      name: 'Yogi Atmaja',
      email: 'yogiatmaja26@gmail.com',
      role: 'user'
    });
  };

  const logout = () => {
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginAsAdmin, loginAsUser, logout }}>
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
