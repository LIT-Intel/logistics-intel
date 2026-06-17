export type OppCategory = "velocity" | "consolidation" | "vulnerable" | "defend";

export type PulseCity = {
  name: string;
  lon: number;
  lat: number;
  n: number;
  cat: OppCategory;
  score: number;
};

export const PULSE_CITIES: readonly PulseCity[] = [
  { name: "Los Angeles", lon: -118.2, lat: 34.0, n: 484, cat: "velocity", score: 96 },
  { name: "San Francisco", lon: -122.4, lat: 37.8, n: 231, cat: "velocity", score: 92 },
  { name: "Seattle", lon: -122.3, lat: 47.6, n: 70, cat: "vulnerable", score: 84 },
  { name: "Phoenix", lon: -112.1, lat: 33.4, n: 43, cat: "consolidation", score: 78 },
  { name: "Denver", lon: -105.0, lat: 39.7, n: 73, cat: "defend", score: 71 },
  { name: "Dallas", lon: -96.8, lat: 32.8, n: 211, cat: "velocity", score: 95 },
  { name: "Houston", lon: -95.4, lat: 29.8, n: 192, cat: "consolidation", score: 100 },
  { name: "Chicago", lon: -87.6, lat: 41.9, n: 553, cat: "velocity", score: 98 },
  { name: "Detroit", lon: -83.0, lat: 42.3, n: 365, cat: "vulnerable", score: 90 },
  { name: "Minneapolis", lon: -93.3, lat: 45.0, n: 138, cat: "defend", score: 76 },
  { name: "Kansas City", lon: -94.6, lat: 39.1, n: 94, cat: "consolidation", score: 73 },
  { name: "Atlanta", lon: -84.4, lat: 33.7, n: 220, cat: "velocity", score: 93 },
  { name: "Miami", lon: -80.2, lat: 25.8, n: 104, cat: "vulnerable", score: 81 },
  { name: "New York", lon: -74.0, lat: 40.7, n: 576, cat: "velocity", score: 99 },
  { name: "Boston", lon: -71.0, lat: 42.4, n: 99, cat: "defend", score: 85 },
  { name: "Charlotte", lon: -80.8, lat: 35.2, n: 192, cat: "consolidation", score: 88 },
  { name: "Nashville", lon: -86.8, lat: 36.2, n: 73, cat: "vulnerable", score: 79 },
] as const;

export const MAX_N = 576;

export type OppMeta = { label: string; color: string; tint: string };

export const OPP: Record<OppCategory, OppMeta> = {
  velocity: { label: "High-velocity", color: "#0891b2", tint: "rgba(8,145,178,0.12)" },
  consolidation: { label: "Consolidation", color: "#8b5cf6", tint: "rgba(139,92,246,0.14)" },
  vulnerable: { label: "Vulnerable", color: "#f59e0b", tint: "rgba(245,158,11,0.14)" },
  defend: { label: "Defend", color: "#10b981", tint: "rgba(16,185,129,0.14)" },
};
