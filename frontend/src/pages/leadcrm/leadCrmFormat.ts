/**
 * Shared formatting + visual-language helpers for the Lead-CRM workspace.
 * Reuses the app's badge/pill idiom (Space Grotesk labels, soft tinted pills)
 * so this standalone route matches the rest of the deck.
 */
import type React from "react";

export const FONT_HEAD = "'Space Grotesk', sans-serif";
export const FONT_BODY = "'DM Sans', sans-serif";
export const FONT_MONO = "'JetBrains Mono', monospace";

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

export function sourceMeta(source: string | null | undefined) {
  const key = String(source ?? "").toLowerCase() as SourceKey;
  return SOURCE_META[key] ?? SOURCE_META.system;
}
