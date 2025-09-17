import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider.jsx';

export default function AuthRedirectGate({ children }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { search } = useLocation();

  useEffect(() => {
    if (!loading && user) {
      const params = new URLSearchParams(search);
      const next = params.get('next');
      navigate(next || '/app/dashboard', { replace: true });
    }
  }, [user, loading, navigate, search]);

  // Let children render during hydration (no blank page)
  return <>{children}</>;
}
