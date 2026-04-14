import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthProvider';
import { canAccessFeature } from '@/lib/planLimits';

export default function ProtectedRoute({
  children,
  requireAuth = true,
  requireAdmin = false,
  feature = null,
  redirectTo = '/login',
  fallback = null,
}) {
  const location = useLocation();
  const {
    user,
    authReady,
    loadingProfile,
    canAccessAdmin,
    plan,
  } = useAuth();

  if (!authReady || loadingProfile) {
    return fallback || (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
      </div>
    );
  }

  if (requireAuth && !user) {
    return <Navigate to={redirectTo} replace state={{ from: location }} />;
  }

  if (requireAdmin && !canAccessAdmin) {
    return <Navigate to="/app/dashboard" replace />;
  }

  if (feature) {
    const allowed = canAccessFeature(plan, feature);

    if (!allowed) {
      return <Navigate to="/app/billing" replace />;
    }
  }

  return children;
}
