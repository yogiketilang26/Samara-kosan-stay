import React from 'react';
import Home from '../pages/Home';
import Admin from '../pages/Admin';
import ProtectedRoute from './ProtectedRoute';

interface MainRouterProps {
  currentView: 'user' | 'admin';
  refreshTrigger: number;
  triggerAppRefresh: () => void;
}

export const MainRouter: React.FC<MainRouterProps> = ({
  currentView,
  refreshTrigger,
  triggerAppRefresh
}) => {
  if (currentView === 'admin') {
    return (
      <ProtectedRoute>
        <Admin 
          refreshTrigger={refreshTrigger} 
          triggerAppRefresh={triggerAppRefresh} 
        />
      </ProtectedRoute>
    );
  }

  return (
    <Home 
      refreshTrigger={refreshTrigger} 
      triggerAppRefresh={triggerAppRefresh} 
    />
  );
};

export default MainRouter;
