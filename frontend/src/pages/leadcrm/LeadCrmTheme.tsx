"use client";

/**
 * Lead-CRM theme provider + hook.
 *
 * Stores the active mode ('light' | 'dark') in localStorage (key
 * `lit_leadcrm_theme`, default 'light') and exposes the resolved token object
 * (see `themes` in leadCrmFormat.ts) plus a toggle. Every leadcrm component
 * reads colors from `useLeadCrmTheme().theme.<token>` so both palettes stay in
 * sync from one source of truth. The provider also mirrors the mode onto a
 * `data-theme` attribute on its root wrapper so future CSS can hook in and so
 * native form controls (date pickers, select chevrons, scrollbars) adopt the
 * OS dark UI via `color-scheme`.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { themeFor, type LeadCrmThemeTokens, type ThemeMode } from "./leadCrmFormat";

const STORAGE_KEY = "lit_leadcrm_theme";

type ThemeContextValue = {
  mode: ThemeMode;
  theme: LeadCrmThemeTokens;
  toggle: () => void;
  setMode: (m: ThemeMode) => void;
};

const LeadCrmThemeContext = createContext<ThemeContextValue | null>(null);

function readInitialMode(): ThemeMode {
  if (typeof window === "undefined") return "light";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    /* ignore */
  }
  return "light";
}

export function LeadCrmThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readInitialMode);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    try {
      window.localStorage.setItem(STORAGE_KEY, m);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => {
    setModeState((prev) => {
      const next: ThemeMode = prev === "dark" ? "light" : "dark";
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, theme: themeFor(mode), toggle, setMode }),
    [mode, toggle, setMode],
  );

  return (
    <LeadCrmThemeContext.Provider value={value}>
      <div
        data-theme={mode}
        style={{ colorScheme: mode, minHeight: "100vh", background: value.theme.bg }}
      >
        {children}
      </div>
    </LeadCrmThemeContext.Provider>
  );
}

/**
 * Read the active theme. Safe outside a provider (falls back to light) so a
 * component rendered in isolation — e.g. a drawer opened from a non-wrapped
 * surface — never crashes.
 */
export function useLeadCrmTheme(): ThemeContextValue {
  const ctx = useContext(LeadCrmThemeContext);
  if (ctx) return ctx;
  return {
    mode: "light",
    theme: themeFor("light"),
    toggle: () => {},
    setMode: () => {},
  };
}
