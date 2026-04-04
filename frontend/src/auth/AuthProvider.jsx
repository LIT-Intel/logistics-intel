import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  signInWithGoogle,
  signInWithMicrosoft,
  signInWithEmailPassword,
  registerWithEmailPassword,
  listenToAuth,
  logout,
} from './supabaseAuthClient';

// Admin emails — keep in sync with billing-checkout normalizePlanCode admin check.
const ADMIN_EMAILS = new Set([
  'vraymond@sparkfusiondigital.com',
  'support@logisticintel.com',
]);

const AuthCtx = createContext({
  user: null,
  loading: true,
  authReady: false,
  fullName: null,
  role: null,
  plan: null,
  access: null,
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  // Persist the last known displayName so it survives page reloads
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (user?.displayName) {
      try { localStorage.setItem('litName', user.displayName); } catch { /* ignore */ }
    }
  }, [user?.displayName]);

  useEffect(() => {
    // Single subscription via listenToAuth (which uses the ONE shared GoTrueClient).
    // This replaces the previous duplicate supabase.auth.onAuthStateChange call that
    // caused "Multiple GoTrueClient instances detected" warnings.
    const unsub = listenToAuth((u) => {
      if (u) {
        let savedName = null;
        try {
          if (typeof window !== 'undefined') savedName = localStorage.getItem('litName');
        } catch { /* ignore */ }

        const isAdmin = ADMIN_EMAILS.has(u.email);
        const role = isAdmin ? 'admin' : (u.user_metadata?.role || 'user');
        const plan = isAdmin ? 'enterprise' : (u.user_metadata?.plan || 'free_trial');

        const enrichedUser = {
          ...u,
          role,
          plan,
          stripe_customer_id: u.user_metadata?.stripe_customer_id || null,
          subscription_status: u.user_metadata?.subscription_status || null,
          displayName:
            u.user_metadata?.full_name ||
            u.user_metadata?.display_name ||
            savedName ||
            (u.email?.split('@')[0] ?? ''),
        };
        setUser(enrichedUser);
        setAuthReady(true);
      } else {
        setUser(null);
        setAuthReady(false);
      }
      setLoading(false);
    });

    return () => { unsub(); };
  }, []);

  const value = useMemo(() => {
    const role = user?.role ?? null;
    const plan = user?.plan ?? null;
    // access object — consumed by SettingsPage and other feature-gated components
    const access = user
      ? {
          isAdmin: role === 'admin',
          canUpgrade: plan === 'free_trial' || plan === 'free',
          canManageBilling: true,
          plan,
          role,
        }
      : null;

    return {
      user,
      loading,
      authReady,
      role,
      plan,
      access,
      signInWithGoogle,
      signInWithMicrosoft,
      signInWithEmailPassword,
      registerWithEmailPassword,
      logout,
      fullName: user?.displayName || null,
    };
  }, [user, loading, authReady]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}
