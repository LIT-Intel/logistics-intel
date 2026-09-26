/**
 * Formatting + month-index helpers (port of the helpers in the handoff's
 * profile-data.js, parameterized on the dataset's firstYear instead of a
 * hardcoded 2023 anchor).
 */

export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const miLabel = (mi: number, firstYear: number): string =>
  MON[mi % 12] + " " + (firstYear + Math.floor(mi / 12));
export const miShort = (mi: number): string => MON[mi % 12];
export const miYear = (mi: number, firstYear: number): number => firstYear + Math.floor(mi / 12);
export const miOf = (d: Date, firstYear: number): number =>
  (d.getFullYear() - firstYear) * 12 + d.getMonth();

export const fmtNum = (v: number): string => Math.round(v).toLocaleString("en-US");
export const fmtMoney = (v: number): string =>
  v >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? "$" + Math.round(v / 1e3) + "K" : "$" + Math.round(v);
export const fmtDate = (ts: number): string => {
  const d = new Date(ts);
  return MON[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
};

/** "+18%" / "−7%" (true minus U+2212) / "—" when not computable. */
export const fmtDelta = (p: number | null | undefined): string =>
  p == null || !isFinite(p) ? "—" : (p >= 0 ? "+" : "−") + Math.abs(Math.round(p * 100)) + "%";

export interface DeltaTone {
  fg: string;
  bg: string;
  icon: "trending-up" | "trending-down" | "minus";
}

export const deltaTone = (p: number | null | undefined): DeltaTone => {
  const flat: DeltaTone = { fg: "#64748b", bg: "#F1F5F9", icon: "minus" };
  if (p == null || !isFinite(p)) return flat;
  if (p >= 0.005) return { fg: "#047857", bg: "rgba(16,185,129,0.12)", icon: "trending-up" };
  if (p <= -0.005) return { fg: "#b91c1c", bg: "rgba(239,68,68,0.12)", icon: "trending-down" };
  return flat;
};

/** Delta tone variants for values rendered on dark cards. */
export const deltaToneDark = (p: number | null | undefined): DeltaTone => {
  const t = deltaTone(p);
  if (t.icon === "trending-up") return { ...t, fg: "#34d399" };
  if (t.icon === "trending-down") return { ...t, fg: "#f87171" };
  return { ...t, fg: "#94a3b8", bg: "rgba(148,163,184,0.12)" };
};

export const PALETTE = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#f43f5e", "#00c8d4", "#64748b"];

export const CTYPE_COLOR: Record<string, string> = {
  "40HC": "#3b82f6",
  "40ST": "#8b5cf6",
  "20ST": "#00c8d4",
  "45HC": "#10b981",
  MIXED: "#8b5cf6",
  LCL: "#f59e0b",
};

/** Known ocean-carrier colors by SCAC; unknown carriers fall back to PALETTE by rank. */
export const CARRIER_COLOR: Record<string, string> = {
  CMDU: "#3b82f6",
  MEDU: "#8b5cf6",
  HLCU: "#f59e0b",
  COSU: "#f43f5e",
  ONEY: "#10b981",
  HDMU: "#00c8d4",
  MAEU: "#64748b",
  EGLV: "#6366f1",
  OOLU: "#ef4444",
  YMLU: "#0ea5e9",
  WHLC: "#a855f7",
  ZIMU: "#14b8a6",
};
