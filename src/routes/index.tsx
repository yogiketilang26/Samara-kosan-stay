import React from 'react';
import Home from '../pages/Home';
import Admin from '../pages/Admin';
import ProtectedRoute from './ProtectedRoute';

interface MainRouterProps {
  currentView: 'user' | 'admin';
}

export const MainRouter: React.FC<MainRouterProps> = ({ currentView }) => {
  if (currentView === 'admin') {
    return (
      <ProtectedRoute>
        <Admin 
           
           
        />
      </ProtectedRoute>
    );
  }

  return (
    <Home 
       
       
    />
  );
};

export default MainRouter;
