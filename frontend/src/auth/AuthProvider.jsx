// frontend/src/auth/AuthProvider.jsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { auth, signInWithGoogle, listenToAuth, logout } from "./firebaseClient";

const AuthCtx = createContext({ user: null, loading: true });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = listenToAuth((u) => {
      // Elevate admin for specific emails (temporary until roles are persisted server-side)
      const adminEmails = new Set(['vraymond@sparkfusiondigital.com','support@logisticintel.com']);
      if (u && adminEmails.has(u.email)) {
        u.role = 'admin';
        u.plan = 'enterprise';
      }
      setUser(u ?? null);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const value = useMemo(() => ({ user, loading, signInWithGoogle, logout }), [user, loading]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}
