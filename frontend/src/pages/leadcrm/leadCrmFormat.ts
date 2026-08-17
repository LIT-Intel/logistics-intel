/**
 * Shared formatting + visual-language helpers for the Lead-CRM workspace.
 * Reuses the app's badge/pill idiom (Space Grotesk labels, soft tinted pills)
 * so this standalone route matches the rest of the deck.
 */
import type React from "react";

export const FONT_HEAD = "'Space Grotesk', sans-serif";
export const FONT_BODY = "'DM Sans', sans-serif";
export const FONT_MONO = "'JetBrains Mono', monospace";

/* ────────────────────────────────────────────────────────────────────────
 * THEME SYSTEM
 * The Lead-CRM uses inline styles with hardcoded hex. To support a real
 * light/dark toggle we centralize every surface color into a token object.
 * Components read the ACTIVE theme via the `useLeadCrmTheme()` context hook
 * (see LeadCrmTheme.tsx) and style off `theme.<token>` instead of literal hex.
 *
 * Token vocabulary (semantic, palette-agnostic):
 *   bg        — the workspace canvas behind panels
 *   panel     — primary card / table / header surface
 *   panelAlt  — a secondary surface (sunken rows, footers, chips)
 *   panelMuted— subtle fills (avatars placeholders, empty-state circles)
 *   border    — hairline dividers + card borders
 *   borderStrong — inputs / stronger separators
 *   text      — primary text
 *   textMuted — secondary text
 *   textFaint — tertiary / placeholder text
 *   heading   — strongest headings
 *   accent    — brand blue (buttons, active nav)
 *   accentText— text/icon on an accent fill
 *   accentSoft— tinted accent background (active chips)
 *   accentSoftText — text on accentSoft
 *   hover     — row/nav hover fill
 *   inputBg   — form control background
 *   danger / dangerText / dangerSoft — destructive actions
 *   success   — positive (completed, subscriber)
 *   overlay   — modal / drawer scrim
 *   shadow    — box-shadow color
 *   sidebar / sidebarText / sidebarMuted / sidebarActiveBg / sidebarActiveText
 *             — the persistent left rail (dark in both themes for brand)
 * ──────────────────────────────────────────────────────────────────────── */

export type ThemeMode = "light" | "dark";

export type LeadCrmThemeTokens = {
  mode: ThemeMode;
  bg: string;
  panel: string;
  panelAlt: string;
  panelMuted: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  heading: string;
  accent: string;
  accentText: string;
  accentSoft: string;
  accentSoftText: string;
  accentBorder: string;
  hover: string;
  inputBg: string;
  danger: string;
  dangerText: string;
  dangerSoft: string;
  dangerBorder: string;
  success: string;
  successSoft: string;
  overlay: string;
  shadow: string;
  sidebar: string;
  sidebarText: string;
  sidebarMuted: string;
  sidebarActiveBg: string;
  sidebarActiveText: string;
  sidebarBorder: string;
};

const light: LeadCrmThemeTokens = {
  mode: "light",
  bg: "#F8FAFC",
  panel: "#FFFFFF",
  panelAlt: "#F8FAFC",
  panelMuted: "#F1F5F9",
  border: "#E5E7EB",
  borderStrong: "#CBD5E1",
  text: "#0F172A",
  textMuted: "#64748b",
  textFaint: "#94A3B8",
  heading: "#0F172A",
  accent: "#2563EB",
  accentText: "#FFFFFF",
  accentSoft: "rgba(59,130,246,0.08)",
  accentSoftText: "#1D4ED8",
  accentBorder: "#3B82F6",
  hover: "#F8FAFC",
  inputBg: "#FFFFFF",
  danger: "#dc2626",
  dangerText: "#FFFFFF",
  dangerSoft: "#FEF2F2",
  dangerBorder: "#FECACA",
  success: "#059669",
  successSoft: "#ECFDF5",
  overlay: "rgba(15,23,42,0.45)",
  shadow: "rgba(15,23,42,0.08)",
  sidebar: "#0F172A",
  sidebarText: "#E2E8F0",
  sidebarMuted: "#94A3B8",
  sidebarActiveBg: "rgba(59,130,246,0.18)",
  sidebarActiveText: "#FFFFFF",
  sidebarBorder: "rgba(255,255,255,0.08)",
};

const dark: LeadCrmThemeTokens = {
  mode: "dark",
  bg: "#0B1220",
  panel: "#0F172A",
  panelAlt: "#111C31",
  panelMuted: "#1A2740",
  border: "#1E2A44",
  borderStrong: "#2B3A57",
  text: "#E5EDF9",
  textMuted: "#94A3B8",
  textFaint: "#64748B",
  heading: "#F1F5F9",
  accent: "#3B82F6",
  accentText: "#FFFFFF",
  accentSoft: "rgba(59,130,246,0.16)",
  accentSoftText: "#93C5FD",
  accentBorder: "#3B82F6",
  hover: "#16233B",
  inputBg: "#0B1220",
  danger: "#F87171",
  dangerText: "#FFFFFF",
  dangerSoft: "rgba(248,113,113,0.12)",
  dangerBorder: "rgba(248,113,113,0.4)",
  success: "#34D399",
  successSoft: "rgba(52,211,153,0.12)",
  overlay: "rgba(2,6,16,0.66)",
  shadow: "rgba(0,0,0,0.5)",
  sidebar: "#080E1A",
  sidebarText: "#E2E8F0",
  sidebarMuted: "#7C8AA5",
  sidebarActiveBg: "rgba(59,130,246,0.22)",
  sidebarActiveText: "#FFFFFF",
  sidebarBorder: "rgba(255,255,255,0.06)",
};

export const themes: Record<ThemeMode, LeadCrmThemeTokens> = { light, dark };

/** Resolve a theme object from a mode string (defaults to light). */
export function themeFor(mode: ThemeMode | null | undefined): LeadCrmThemeTokens {
  return mode === "dark" ? dark : light;
}

/**
 * asText — the single guard against React error #31 ("Objects are not valid as
 * a React child"). ANY value that (a) originates from an RPC / jsonb column and
 * (b) is placed directly as a React child MUST pass through this first. tsc does
 * NOT catch object-as-child, so this is a runtime-safety helper, not a type one.
 *
 *   string   → itself
 *   number   → String(n)   (NaN → "")
 *   boolean  → "Yes"/"No"
 *   null/undef → ""        (callers add their own "—" fallback when wanted)
 *   array    → each element as text, joined with " · "  (empty → "")
 *   object   → readable "key: value · key: value" of non-empty entries;
 *              nested objects/arrays are JSON-stringified so nothing renders raw.
 *
 * Never throws — a malformed value degrades to "" rather than crashing render.
 */
export function asText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) {
    return v
      .map((el) => asText(el))
      .filter((s) => s !== "")
      .join(" · ");
  }
  if (typeof v === "object") {
    try {
      return Object.entries(v as Record<string, unknown>)
        .filter(([, val]) => val != null && val !== "")
        .map(([k, val]) => {
          const label = k.replace(/_/g, " ");
          const inner =
            val != null && typeof val === "object" ? JSON.stringify(val) : asText(val);
          return `${label}: ${inner}`;
        })
        .join(" · ");
    } catch {
      return "";
    }
  }
  return String(v);
}

/** asText, but returns a supplied fallback (default "—") when the result is empty. */
export function textOr(v: unknown, fallback = "—"): string {
  const t = asText(v);
  return t === "" ? fallback : t;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Relative-ish "last activity" — falls back to absolute date. */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = Date.now() - t;
  if (diff < 0) return formatDate(iso);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function avatarColor(name: string | null | undefined): string {
  const palette = ["#6366F1", "#0EA5E9", "#8B5CF6", "#0891B2", "#4F46E5", "#2563EB"];
  if (!name) return palette[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

/** Best display label for a lead (name → email local part → "Lead"). */
export function leadDisplayName(
  fullName: string | null | undefined,
  email: string | null | undefined,
): string {
  if (fullName && fullName.trim()) return fullName.trim();
  if (email && email.includes("@")) return email.split("@")[0];
  return "Lead";
}

/** Stage badge style — honors the stage's own color, with a safe default. */
export function stageBadgeStyle(color: string | null | undefined): React.CSSProperties {
  const base = color && /^#?[0-9a-fA-F]{3,8}$/.test(color)
    ? (color.startsWith("#") ? color : `#${color}`)
    : "#64748b";
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "2px 9px",
    borderRadius: 999,
    background: hexToTint(base, 0.1),
    color: base,
    border: `1px solid ${hexToTint(base, 0.28)}`,
    fontFamily: FONT_HEAD,
    fontSize: 11,
    fontWeight: 700,
    whiteSpace: "nowrap",
  };
}

export function stageDot(color: string | null | undefined): string {
  return color && /^#?[0-9a-fA-F]{3,8}$/.test(color)
    ? (color.startsWith("#") ? color : `#${color}`)
    : "#94A3B8";
}

// Blend a hex color toward white by `amt` (0..1) for a soft pill tint. Falls
// back to a slate tint on any parse issue so pills never render transparent.
function hexToTint(hex: string, amt: number): string {
  try {
    let h = hex.replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if ([r, g, b].some((n) => Number.isNaN(n))) return `rgba(100,116,139,${amt})`;
    return `rgba(${r},${g},${b},${amt})`;
  } catch {
    return `rgba(100,116,139,${amt})`;
  }
}

// Source visual vocabulary for the timeline (magnet/product/email/demo/
// manual/system). Icon name maps to a lucide component in the drawer.
export type SourceKey = "magnet" | "product" | "email" | "demo" | "manual" | "system";

export const SOURCE_META: Record<SourceKey, { label: string; fg: string; bg: string; bd: string }> = {
  magnet: { label: "Magnet", fg: "#7C3AED", bg: "#F5F3FF", bd: "#DDD6FE" },
  product: { label: "Product", fg: "#1D4ED8", bg: "#EFF6FF", bd: "#BFDBFE" },
  email: { label: "Email", fg: "#0E7490", bg: "#ECFEFF", bd: "#A5F3FC" },
  demo: { label: "Demo", fg: "#B45309", bg: "#FFFBEB", bd: "#FDE68A" },
  manual: { label: "Manual", fg: "#047857", bg: "#ECFDF5", bd: "#A7F3D0" },
  system: { label: "System", fg: "#475569", bg: "#F1F5F9", bd: "#E2E8F0" },
};

// Dark-mode variants — brighter fg on translucent tinted fills so the badges
// stay legible on deep-slate panels.
const SOURCE_META_DARK: Record<SourceKey, { label: string; fg: string; bg: string; bd: string }> = {
  magnet: { label: "Magnet", fg: "#C4B5FD", bg: "rgba(124,58,237,0.18)", bd: "rgba(124,58,237,0.4)" },
  product: { label: "Product", fg: "#93C5FD", bg: "rgba(59,130,246,0.18)", bd: "rgba(59,130,246,0.4)" },
  email: { label: "Email", fg: "#67E8F9", bg: "rgba(14,116,144,0.2)", bd: "rgba(34,211,238,0.35)" },
  demo: { label: "Demo", fg: "#FCD34D", bg: "rgba(180,83,9,0.2)", bd: "rgba(245,158,11,0.35)" },
  manual: { label: "Manual", fg: "#6EE7B7", bg: "rgba(4,120,87,0.2)", bd: "rgba(16,185,129,0.35)" },
  system: { label: "System", fg: "#CBD5E1", bg: "rgba(148,163,184,0.16)", bd: "rgba(148,163,184,0.3)" },
};

export function sourceMeta(source: string | null | undefined, mode: ThemeMode = "light") {
  const key = String(source ?? "").toLowerCase() as SourceKey;
  const table = mode === "dark" ? SOURCE_META_DARK : SOURCE_META;
  return table[key] ?? table.system;
}

/**
 * Human-readable label for a timeline entry's `kind`. The Phase-3 comms actions
 * write snake_case kinds to lit_lead_activity (email_sent, demo_invite_sent,
 * added_to_campaign, call_booking_opened, call_booked, …); prettify them so the
 * timeline reads like sentences instead of raw column values. Falls back to a
 * title-cased version of any unknown kind so nothing renders as raw snake_case.
 */
const KIND_LABELS: Record<string, string> = {
  email_sent: "Email sent",
  email_received: "Email received",
  email_thread: "Email in thread",
  demo_invite_sent: "Demo invite sent",
  demo_sent: "Demo invite sent",
  added_to_campaign: "Added to campaign",
  call_booking_opened: "Booking link opened",
  call_booked: "Call booked",
  call_booking_cancelled: "Call cancelled",
  call_booking_rescheduled: "Call rescheduled",
  call_booking_update: "Call updated",
  note: "Note",
  touch: "Touch logged",
  assignment: "Assigned",
};

export function kindLabel(kind: string | null | undefined): string {
  const raw = asText(kind);
  if (raw === "") return "";
  const known = KIND_LABELS[raw.toLowerCase()];
  if (known) return known;
  // Title-case an unknown snake/colon kind (e.g. "search:company" → "Search Company").
  return raw
    .replace(/[:_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
