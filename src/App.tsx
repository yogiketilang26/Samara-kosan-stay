/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/layout/Navbar';
import MainRouter from './routes';
import Footer from './components/layout/Footer';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { CartProvider } from './context/CartContext';
import { NotificationProvider } from './context/NotificationContext';

function getViewFromLocation(): 'user' | 'admin' | 'owner' {
  const pathname = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();

  if (pathname.startsWith('/admin') || hash === '#admin') {
    return 'admin';
  }
  if (pathname.startsWith('/owner') || hash === '#owner') {
    return 'owner';
  }
  return 'user';
}

export default function App() {
  const [viewState, setViewState] = useState<'user' | 'admin' | 'owner'>(getViewFromLocation);

  const updateView = useCallback((newView: 'user' | 'admin' | 'owner', pushHistory = true) => {
    setViewState(newView);
    if (pushHistory) {
      const targetPath = newView === 'admin' ? '/admin' : newView === 'owner' ? '/owner' : '/';
      if (window.location.pathname !== targetPath) {
        window.history.pushState({ view: newView }, '', targetPath);
      }
    }
  }, []);

  // Synchronize browser history popstate (Back/Forward buttons)
  useEffect(() => {
    const handlePopState = () => {
      const view = getViewFromLocation();
      setViewState(view);
    };

    const handleCustomNavigation = (e: any) => {
      if (e.detail?.view) {
        updateView(e.detail.view, true);
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('samara-navigate-portal', handleCustomNavigation);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('samara-navigate-portal', handleCustomNavigation);
    };
  }, [updateView]);

  const handleRefreshData = useCallback(() => {
    window.location.reload();
  }, []);

  return (
    <AuthProvider>
      <ThemeProvider>
        <CartProvider>
          <NotificationProvider>
            <div className="min-h-screen flex flex-col justify-between bg-[#F8F9FA] text-[#3A444D] selection:bg-[#2E6F40] selection:text-white antialiased font-sans transition-colors duration-300">
              
              {/* 1. Header Navigation with Strict Role-Based View Controls */}
              <Navbar 
                currentView={viewState} 
                setView={updateView} 
                onRefresh={handleRefreshData} 
              />

              {/* 2. Page Router container protected by RBAC gatekeeper */}
              <div className="flex-1">
                <MainRouter 
                  currentView={viewState}
                />
              </div>

              {/* 3. Global modular footer element */}
              <Footer />

            </div>
          </NotificationProvider>
        </CartProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
