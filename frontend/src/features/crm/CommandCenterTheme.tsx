"use client";

/**
 * Command Center (user CRM) light/dark theme.
 *
 * Mirrors the Lead-CRM theme system (see pages/leadcrm/LeadCrmTheme.tsx) so the
 * two CRMs feel consistent — SAME token palette (imported from leadCrmFormat.ts),
 * SAME UX (sun/moon toggle) and SAME persistence model, just a distinct
 * localStorage key (`lit_crm_theme`, default light).
 *
 * WHY a token-object context and not pure Tailwind `dark:` variants: the Command
 * Center surfaces (CommandCenter accounts table, PipelineBoard, DealDetailDrawer,
 * TasksView, PipelineReports, PipelineGate demo) are almost entirely INLINE-styled
 * with hardcoded hex — Tailwind `dark:` variants only affect className-styled
 * nodes. So components read colors from `useCrmTheme().theme.<token>` for their
 * inline styles, while the provider ALSO puts a `.dark` class on its root wrapper
 * so the handful of Tailwind-classed bits (KPI chips, mobile account cards) pick
 * up `dark:` variants. The `.dark` class is scoped to this wrapper only, so the
 * rest of the app is unaffected.
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { themeFor, type LeadCrmThemeTokens, type ThemeMode } from "@/pages/leadcrm/leadCrmFormat";

const STORAGE_KEY = "lit_crm_theme";

// Re-export the shared token type under a CRM-local alias so call sites read
// naturally without reaching into the leadcrm module.
export type CrmThemeTokens = LeadCrmThemeTokens;

type ThemeContextValue = {
  mode: ThemeMode;
  theme: CrmThemeTokens;
  toggle: () => void;
  setMode: (m: ThemeMode) => void;
};

const CrmThemeContext = createContext<ThemeContextValue | null>(null);

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

export function CommandCenterThemeProvider({ children }: { children: React.ReactNode }) {
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
    <CrmThemeContext.Provider value={value}>
      {/* `.dark` class is SCOPED here — only descendants get Tailwind dark:
          variants; the rest of the app is untouched. data-theme + colorScheme
          let native controls (selects, date pickers, scrollbars) adopt dark UI. */}
      <div
        className={mode === "dark" ? "dark" : undefined}
        data-theme={mode}
        style={{
          colorScheme: mode,
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: value.theme.bg,
        }}
      >
        {children}
      </div>
    </CrmThemeContext.Provider>
  );
}

/**
 * Read the active theme. Safe outside a provider (falls back to light) so a
 * child surface rendered in isolation never crashes.
 */
export function useCrmTheme(): ThemeContextValue {
  const ctx = useContext(CrmThemeContext);
  if (ctx) return ctx;
  return {
    mode: "light",
    theme: themeFor("light"),
    toggle: () => {},
    setMode: () => {},
  };
}

/**
 * Sun/moon toggle button. Themed off the active tokens so it reads correctly in
 * both modes. Drop it into the Command Center header.
 */
export function CrmThemeToggle({ className }: { className?: string }) {
  const { mode, toggle, theme } = useCrmTheme();
  const isDark = mode === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      className={className}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 34,
        height: 34,
        borderRadius: 10,
        border: `1.5px solid ${theme.borderStrong}`,
        background: theme.panel,
        color: theme.textMuted,
        cursor: "pointer",
        flexShrink: 0,
        transition: "background 120ms, border-color 120ms, color 120ms",
      }}
    >
      {isDark ? <Sun style={{ width: 16, height: 16 }} /> : <Moon style={{ width: 16, height: 16 }} />}
    </button>
  );
}
