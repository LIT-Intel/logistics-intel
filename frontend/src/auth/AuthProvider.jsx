import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  signInWithGoogle,
  signInWithMicrosoft,
  signInWithEmailPassword,
  registerWithEmailPassword,
  listenToAuth,
  logout
} from "./supabaseAuthClient";
import { supabase } from "@/lib/supabase";

// Extend the default context to include a fullName helper
const AuthCtx = createContext({ user: null, loading: true, authReady: false, fullName: null });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  // Persist the last known displayName so it survives page reloads
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (user?.displayName) {
      try {
        localStorage.setItem('litName', user.displayName);
      } catch {
        // Ignore storage exceptions
      }
    }
  }, [user?.displayName]);

  useEffect(() => {
    // On mount, determine if a session exists to set the authReady flag
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setAuthReady(true);
      }
    });

    // Listen for auth state changes from Supabase
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setAuthReady(!!session);
      }
    );

    // Local subscription to our auth client so we can enrich user object
    const unsub = listenToAuth((u) => {
      if (u) {
        // Temporary admin email check until roles are persisted server‑side
        const adminEmails = new Set([
          'vraymond@sparkfusiondigital.com',
          'support@logisticintel.com',
        ]);

        // Attempt to retrieve a previously saved name from local storage
        let savedName: string | null = null;
        try {
          savedName = typeof window !== 'undefined' ? localStorage.getItem('litName') : null;
        } catch {
          savedName = null;
        }

        // Build an enriched user object with role, plan and display name
        const enrichedUser = {
          ...u,
          role: adminEmails.has(u.email) ? 'admin' : (u.user_metadata?.role || 'user'),
          plan: adminEmails.has(u.email) ? 'enterprise' : (u.user_metadata?.plan || 'free'),
          // Prefer full_name, then display_name, then previously stored name, then derive from email
          displayName:
            u.user_metadata?.full_name ||
            u.user_metadata?.display_name ||
            savedName ||
            (u.email?.split('@')[0] ?? ''),
        };

        setUser(enrichedUser);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => {
      unsub();
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      authReady,
      signInWithGoogle,
      signInWithMicrosoft,
      signInWithEmailPassword,
      registerWithEmailPassword,
      logout,
      // Expose a fullName alias so consumers can access a consistent display name
      fullName: user?.displayName || null,
    }),
    [user, loading, authReady]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}
