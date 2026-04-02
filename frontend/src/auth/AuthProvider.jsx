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

const AuthCtx = createContext({
  user: null,
  loading: true,
  authReady: false,
  fullName: null,
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (user?.displayName) {
      try {
        localStorage.setItem("litName", user.displayName);
      } catch {
        // ignore storage failures
      }
    }
  }, [user?.displayName]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setAuthReady(true);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthReady(!!session);
    });

    const unsub = listenToAuth((u) => {
      if (u) {
        const adminEmails = new Set([
          "vraymond@sparkfusiondigital.com",
          "support@logisticintel.com",
        ]);

        let savedName = null;
        try {
          savedName =
            typeof window !== "undefined" ? localStorage.getItem("litName") : null;
        } catch {
          savedName = null;
        }

        const enrichedUser = {
          ...u,
          role: adminEmails.has(u.email)
            ? "admin"
            : (u.user_metadata?.role || "user"),
          plan: adminEmails.has(u.email)
            ? "enterprise"
            : (u.user_metadata?.plan || "free"),
          displayName:
            u.user_metadata?.full_name ||
            u.user_metadata?.display_name ||
            u.user_metadata?.name ||
            savedName ||
            u.email?.split("@")[0] ||
            "User",
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

  const value = useMemo(() => ({
    user,
    loading,
    authReady,
    signInWithGoogle,
    signInWithMicrosoft,
    signInWithEmailPassword,
    registerWithEmailPassword,
    logout,
    fullName: user?.displayName || null,
  }), [user, loading, authReady]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}
