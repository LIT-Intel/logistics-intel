// frontend/src/auth/AuthProvider.jsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  signInWithGoogle,
  signInWithMicrosoft,
  signInWithEmailPassword,
  registerWithEmailPassword,
  listenToAuth,
  logout
} from "./supabaseAuthClient";

const AuthCtx = createContext({ user: null, loading: true });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = listenToAuth((u) => {
      if (u) {
        // Elevate admin for specific emails (temporary until roles are persisted server-side)
        const adminEmails = new Set(['vraymond@sparkfusiondigital.com','support@logisticintel.com']);

        // Enrich user object with metadata
        const enrichedUser = {
          ...u,
          role: adminEmails.has(u.email) ? 'admin' : (u.user_metadata?.role || 'user'),
          plan: adminEmails.has(u.email) ? 'enterprise' : (u.user_metadata?.plan || 'free'),
          displayName: u.user_metadata?.display_name || u.user_metadata?.full_name || u.email?.split('@')[0],
        };

        setUser(enrichedUser);
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    signInWithGoogle,
    signInWithMicrosoft,
    signInWithEmailPassword,
    registerWithEmailPassword,
    logout
  }), [user, loading]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}
