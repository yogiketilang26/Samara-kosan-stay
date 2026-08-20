import React from 'react';
import Home from '../pages/Home';
import Admin from '../pages/Admin';
import Owner from '../pages/Owner';
import ProtectedRoute from './ProtectedRoute';

interface MainRouterProps {
  currentView: 'user' | 'admin' | 'owner';
}

export const MainRouter: React.FC<MainRouterProps> = ({ currentView }) => {
  if (currentView === 'admin') {
    return (
      <ProtectedRoute>
        <Admin />
      </ProtectedRoute>
    );
  }

  if (currentView === 'owner') {
    return (
      <Owner />
    );
  }

  return (
    <Home />
  );
};

export default MainRouter;
