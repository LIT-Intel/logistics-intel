import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  signInWithGoogle,
  signInWithMicrosoft,
  signInWithEmailPassword,
  registerWithEmailPassword,
  listenToAuth,
  logout as logoutClient,
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
  signInWithGoogle: async () => {},
  signInWithMicrosoft: async () => {},
  signInWithEmailPassword: async () => {},
  registerWithEmailPassword: async () => {},
  logout: async () => {},
});

function getDisplayName(u) {
  if (!u) return '';

  const meta = u.user_metadata || {};
  const joinedName = [meta.first_name, meta.last_name].filter(Boolean).join(' ').trim();

  return (
    meta.full_name ||
    meta.display_name ||
    meta.name ||
    joinedName ||
    (u.email?.split('@')[0] ?? '')
  );
}

function normalizeUser(u) {
  if (!u) return null;

  const email = (u.email || '').toLowerCase();
  const meta = u.user_metadata || {};
  const isAdmin = ADMIN_EMAILS.has(email);
  const role = isAdmin ? 'admin' : (meta.role || 'user');
  const plan = isAdmin ? 'unlimited' : (meta.plan || 'free_trial');

  return {
    ...u,
    role,
    plan,
    stripe_customer_id: meta.stripe_customer_id || null,
    subscription_status: meta.subscription_status || null,
    displayName: getDisplayName(u),
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsub = listenToAuth((u) => {
      if (u) {
        setUser(normalizeUser(u));
        setAuthReady(true);
      } else {
        setUser(null);
        setAuthReady(false);
      }
      setLoading(false);
    });

    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  const handleLogout = async () => {
    try {
      setLoading(true);
      setUser(null);
      setAuthReady(false);

      try {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('litName');
          localStorage.removeItem('supabase.auth.token');
        }
      } catch {
        // ignore storage cleanup issues
      }

      await logoutClient();
    } finally {
      setLoading(false);
    }
  };

  const value = useMemo(() => {
    const role = user?.role ?? null;
    const plan = user?.plan ?? null;

    const access = user
      ? {
          isAdmin: role === 'admin',
          canUpgrade: !['unlimited', 'enterprise'].includes(plan || ''),
          canManageBilling: role === 'admin',
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
      logout: handleLogout,
      fullName: user?.displayName || null,
    };
  }, [user, loading, authReady]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}
