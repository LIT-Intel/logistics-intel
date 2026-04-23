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
        const code       = searchParams.get('code');
        const tokenHash  = searchParams.get('token_hash');
        const otpType    = searchParams.get('type') as any;
        const nextParam  = searchParams.get('next');

        // PKCE flow: ?code=xxx (Supabase JS v2 default for browser)
        if (code) {
          const { error: exchangeError } = await auth.auth.exchangeCodeForSession(
            window.location.href
          );
          if (exchangeError) throw exchangeError;
        }
        // OTP/token_hash flow: ?token_hash=xxx&type=signup (newer Supabase email templates)
        else if (tokenHash && otpType) {
          const { error: verifyError } = await auth.auth.verifyOtp({
            token_hash: tokenHash,
            type: otpType,
          });
          if (verifyError) throw verifyError;
        }
        // Implicit/hash flow: #access_token=xxx — Supabase client auto-processes via onAuthStateChange
        // Give it a moment to settle before calling getUser()
        else if (window.location.hash.includes('access_token')) {
          await new Promise((res) => setTimeout(res, 600));
        }

        // getUser() makes a live server call — guarantees fresh user_metadata
        // (getSession() returns JWT-cached data which may lag after signUp)
        const { data: userData, error: userError } = await auth.auth.getUser();
        if (userError || !userData?.user) {
          navigate('/login', { replace: true });
          return;
        }

        const user = userData.user;
        const meta = user.user_metadata || {};

        // Primary: flag written at registration via signUp options.data
        // Secondary: account < 30 min old = first confirmation click
        const createdAt = new Date(user.created_at || 0);
        const accountAgeMinutes = (Date.now() - createdAt.getTime()) / 60_000;
        const isFreshSignup = accountAgeMinutes < 30;

        const needsOnboarding =
          meta.onboarding_completed === false ||
          (meta.onboarding_completed !== true && isFreshSignup);

        // Write the flag so RequireAuth sees it on subsequent navigations
        if (needsOnboarding && meta.onboarding_completed !== false) {
          await auth.auth.updateUser({ data: { onboarding_completed: false } });
        }

        const destination = nextParam || (needsOnboarding ? '/onboarding' : '/app/dashboard');
        navigate(destination, { replace: true });
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
