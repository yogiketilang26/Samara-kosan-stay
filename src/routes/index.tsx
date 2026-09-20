import React from 'react';
import Home from '../pages/Home';
import Admin from '../pages/Admin';
import Owner from '../pages/Owner';
import StaffAdmin from '../pages/StaffAdmin';
import ProtectedRoute from './ProtectedRoute';

interface MainRouterProps {
  currentView: 'user' | 'admin' | 'owner' | 'staff';
}

export const MainRouter: React.FC<MainRouterProps> = ({ currentView }) => {
  if (currentView === 'admin') {
    return (
      <ProtectedRoute allowedRoles={['super', 'super_admin', 'admin', 'anak_owner', 'anak owner']} requiredPortal="admin">
        <Admin />
      </ProtectedRoute>
    );
  }

  if (currentView === 'staff') {
    return (
      <ProtectedRoute allowedRoles={['super', 'super_admin', 'admin', 'staff', 'anak_owner', 'anak owner']} requiredPortal="staff">
        <StaffAdmin />
      </ProtectedRoute>
    );
  }

  if (currentView === 'owner') {
    return (
      <ProtectedRoute allowedRoles={['owner']} requiredPortal="owner">
        <Owner />
      </ProtectedRoute>
    );
  }

  return (
    <Home />
  );
};

export default MainRouter;
