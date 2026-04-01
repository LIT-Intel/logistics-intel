import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthProvider';
import { assertFeatureAccess } from '../../lib/accessControl';

export default function ProtectedRoute({
  children,
  requireAuth = true,
  allowedRoles = [],
  feature = null,
  fallbackPath = '/login',
  upgradePath = '/settings?tab=billing',
  loadingFallback = null,
  unauthorizedFallback = null,
}) {
  const location = useLocation();
  const { user, authReady, role, plan, access } = useAuth();

  if (!authReady) {
    return loadingFallback ?? (
      <div className="flex min-h-[40vh] items-center justify-center px-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-medium text-slate-900">Loading access…</div>
          <p className="mt-2 text-sm text-slate-500">
            Checking your session and permissions.
          </p>
        </div>
      </div>
    );
  }

  if (requireAuth && !user) {
    return (
      <Navigate
        to={fallbackPath}
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    if (unauthorizedFallback) return unauthorizedFallback;

    return (
      <div className="flex min-h-[40vh] items-center justify-center px-6">
        <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <div className="text-sm font-semibold text-amber-900">Access denied</div>
          <p className="mt-2 text-sm text-amber-800">
            Your role does not have permission to view this page.
          </p>
        </div>
      </div>
    );
  }

  if (feature) {
    const featureCheck = assertFeatureAccess(
      {
        role,
        plan,
        usage: access?.usage ?? {},
      },
      feature
    );

    if (!featureCheck.allowed) {
      if (unauthorizedFallback) return unauthorizedFallback;

      const isUpgradeIssue =
        featureCheck.reason?.includes('not available on the') ||
        featureCheck.reason?.includes('limit reached');

      if (isUpgradeIssue) {
        return (
          <Navigate
            to={upgradePath}
            replace
            state={{
              from: location.pathname + location.search,
              deniedFeature: feature,
              deniedReason: featureCheck.reason,
            }}
          />
        );
      }

      return (
        <div className="flex min-h-[40vh] items-center justify-center px-6">
          <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
            <div className="text-sm font-semibold text-amber-900">Access restricted</div>
            <p className="mt-2 text-sm text-amber-800">{featureCheck.reason}</p>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
}
