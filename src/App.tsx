/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Navbar } from './components/layout/Navbar';
import MainRouter from './routes';
import Footer from './components/layout/Footer';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { CartProvider } from './context/CartContext';

export default function App() {
  const [viewState, setViewState] = useState<'user' | 'admin'>('user');
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  const handleRefreshData = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <AuthProvider>
      <ThemeProvider>
        <CartProvider>
          <div className="min-h-screen flex flex-col justify-between bg-[#09090b] text-slate-100 selection:bg-amber-500 selection:text-black antialiased font-sans transition-colors duration-300">
            
            {/* 1. Styled header switchers */}
            <Navbar 
              currentView={viewState} 
              setView={setViewState} 
              onRefresh={handleRefreshData} 
            />

            {/* 2. Page Router container with animation wrapper */}
            <div className="flex-1">
              <MainRouter 
                currentView={viewState}
                refreshTrigger={refreshTrigger}
                triggerAppRefresh={handleRefreshData}
              />
            </div>

            {/* 3. Global modular footer element */}
            <Footer />

          </div>
        </CartProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

