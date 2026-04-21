import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '@/auth/supabaseAuthClient';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) {
      navigate('/login');
      return;
    }

    const handleCallback = async () => {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const code = searchParams.get('code');
        const nextParam = searchParams.get('next');

        // Handle PKCE email confirmation code exchange
        if (code) {
          const { error: exchangeError } = await auth.auth.exchangeCodeForSession(
            window.location.href
          );
          if (exchangeError) throw exchangeError;
        }

        // Confirm session exists after exchange (or if already set via implicit flow)
        const { data, error: sessionError } = await auth.auth.getSession();
        if (sessionError) throw sessionError;

        if (data.session) {
          const meta = data.session.user?.user_metadata || {};
          // New users have onboarding_completed=false written at registration
          const needsOnboarding = meta.onboarding_completed === false;
          const destination = nextParam || (needsOnboarding ? '/onboarding' : '/app/dashboard');
          navigate(destination, { replace: true });
        } else {
          navigate('/login', { replace: true });
        }
      } catch (err: any) {
        console.error('[AuthCallback] error:', err);
        setError(err?.message || 'Authentication failed');
        setTimeout(() => {
          navigate('/login', { replace: true });
        }, 3000);
      }
    };

    handleCallback();
  }, [navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-red-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Authentication Failed</h2>
          <p className="text-gray-600">{error}</p>
          <p className="text-sm text-gray-500">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 mx-auto">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
        </div>
        <h2 className="text-xl font-semibold text-gray-900">Completing sign in...</h2>
        <p className="text-gray-600">Please wait while we authenticate your account</p>
      </div>
    </div>
  );
}
