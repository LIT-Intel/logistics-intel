import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider.jsx';

export default function PostAuthBounce() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { search } = useLocation();

  useEffect(() => {
    if (!loading) {
      const params = new URLSearchParams(search);
      const next = params.get('next');
      if (user) {
        navigate(next || '/app/dashboard', { replace: true });
      } else {
        navigate(`/login${ next ? `?next=${encodeURIComponent(next)}` : ''}`, { replace: true });
      }
    }
  }, [user, loading, navigate, search]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="animate-spin h-6 w-6 rounded-full border-2 border-t-transparent" />
    </div>
  );
}
