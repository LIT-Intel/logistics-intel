export type OppCategory = "velocity" | "consolidation" | "vulnerable" | "defend";

export type Industry =
  | "manufacturing"
  | "retail"
  | "automotive"
  | "electronics"
  | "food"
  | "pharma"
  | "energy"
  | "apparel"
  | "chemicals"
  | "furniture"
  | "tech"
  | "construction"
  | "aerospace"
  | "other";

export type PulseCity = {
  name: string;
  lon: number;
  lat: number;
  n: number;
  cat: OppCategory;
  score: number;
  industry: Industry;
};

/**
 * 17 US metros with plausible dominant-industry assignments. Real data
 * would split each metro into per-industry bubbles; for the marketing
 * mock we color the bubble by the dominant industry so the page tells
 * a clear story at a glance. Assignments roughly track real economic
 * geography (Detroit→auto, Houston→energy, Boston→pharma, etc).
 */
export const PULSE_CITIES: readonly PulseCity[] = [
  { name: "Los Angeles", lon: -118.2, lat: 34.0, n: 484, cat: "velocity", score: 96, industry: "retail" },
  { name: "San Francisco", lon: -122.4, lat: 37.8, n: 231, cat: "velocity", score: 92, industry: "tech" },
  { name: "Seattle", lon: -122.3, lat: 47.6, n: 70, cat: "vulnerable", score: 84, industry: "tech" },
  { name: "Phoenix", lon: -112.1, lat: 33.4, n: 43, cat: "consolidation", score: 78, industry: "manufacturing" },
  { name: "Denver", lon: -105.0, lat: 39.7, n: 73, cat: "defend", score: 71, industry: "energy" },
  { name: "Dallas", lon: -96.8, lat: 32.8, n: 211, cat: "velocity", score: 95, industry: "electronics" },
  { name: "Houston", lon: -95.4, lat: 29.8, n: 192, cat: "consolidation", score: 100, industry: "energy" },
  { name: "Chicago", lon: -87.6, lat: 41.9, n: 553, cat: "velocity", score: 98, industry: "manufacturing" },
  { name: "Detroit", lon: -83.0, lat: 42.3, n: 365, cat: "vulnerable", score: 90, industry: "automotive" },
  { name: "Minneapolis", lon: -93.3, lat: 45.0, n: 138, cat: "defend", score: 76, industry: "retail" },
  { name: "Kansas City", lon: -94.6, lat: 39.1, n: 94, cat: "consolidation", score: 73, industry: "food" },
  { name: "Atlanta", lon: -84.4, lat: 33.7, n: 220, cat: "velocity", score: 93, industry: "retail" },
  { name: "Miami", lon: -80.2, lat: 25.8, n: 104, cat: "vulnerable", score: 81, industry: "apparel" },
  { name: "New York", lon: -74.0, lat: 40.7, n: 576, cat: "velocity", score: 99, industry: "apparel" },
  { name: "Boston", lon: -71.0, lat: 42.4, n: 99, cat: "defend", score: 85, industry: "pharma" },
  { name: "Charlotte", lon: -80.8, lat: 35.2, n: 192, cat: "consolidation", score: 88, industry: "manufacturing" },
  { name: "Nashville", lon: -86.8, lat: 36.2, n: 73, cat: "vulnerable", score: 79, industry: "furniture" },
] as const;

export const MAX_N = 576;

export type OppMeta = { label: string; color: string; tint: string };

export const OPP: Record<OppCategory, OppMeta> = {
  velocity: { label: "High-velocity", color: "#0891b2", tint: "rgba(8,145,178,0.12)" },
  consolidation: { label: "Consolidation", color: "#8b5cf6", tint: "rgba(139,92,246,0.14)" },
  vulnerable: { label: "Vulnerable", color: "#f59e0b", tint: "rgba(245,158,11,0.14)" },
  defend: { label: "Defend", color: "#10b981", tint: "rgba(16,185,129,0.14)" },
};

export type IndustryMeta = {
  label: string;
  /** Bubble fill anchor + legend chip border. Dark enough to carry
   *  white centered count text legibly. */
  color: string;
  /** Lighter inner gradient stop for the radial-gradient highlight. */
  light: string;
  /** Pale background for legend chip / tint surfaces. */
  tint: string;
};

/**
 * Industry → color map. Anchor colors picked to be visually distinct
 * against an OSM basemap (beige roads, green parks, blue water) and
 * to reserve the brand cyan/blue/violet for product-UI use. Pairs
 * with the canonical INDUSTRY_PALETTE used in the live Pulse Explorer
 * (frontend/src/features/pulse/explore/bubblePalettes.js) so the
 * marketing page reads as the SAME product.
 */
export const INDUSTRY: Record<Industry, IndustryMeta> = {
  manufacturing: { label: "Manufacturing", color: "#1d4ed8", light: "#3b82f6", tint: "rgba(29,78,216,0.10)" },
  retail: { label: "Retail", color: "#ec4899", light: "#f472b6", tint: "rgba(236,72,153,0.10)" },
  automotive: { label: "Automotive", color: "#475569", light: "#64748b", tint: "rgba(71,85,105,0.10)" },
  electronics: { label: "Electronics", color: "#0d9488", light: "#14b8a6", tint: "rgba(13,148,136,0.10)" },
  food: { label: "Food & Beverage", color: "#f59e0b", light: "#fbbf24", tint: "rgba(245,158,11,0.10)" },
  pharma: { label: "Pharma / Healthcare", color: "#dc2626", light: "#ef4444", tint: "rgba(220,38,38,0.10)" },
  energy: { label: "Energy / Oil & Gas", color: "#0f172a", light: "#334155", tint: "rgba(15,23,42,0.10)" },
  apparel: { label: "Apparel & Textiles", color: "#c026d3", light: "#d946ef", tint: "rgba(192,38,211,0.10)" },
  chemicals: { label: "Chemicals", color: "#65a30d", light: "#84cc16", tint: "rgba(101,163,13,0.10)" },
  furniture: { label: "Furniture & Home", color: "#b45309", light: "#d97706", tint: "rgba(180,83,9,0.10)" },
  tech: { label: "Tech / Software", color: "#4f46e5", light: "#6366f1", tint: "rgba(79,70,229,0.10)" },
  construction: { label: "Construction", color: "#78716c", light: "#a8a29e", tint: "rgba(120,113,108,0.10)" },
  aerospace: { label: "Aerospace & Defense", color: "#0369a1", light: "#0284c7", tint: "rgba(3,105,161,0.10)" },
  other: { label: "Other / Mixed", color: "#94a3b8", light: "#cbd5e1", tint: "rgba(148,163,184,0.10)" },
};

/** Unique industries actually present in PULSE_CITIES, in stable order.
 *  Drives the bottom-left legend so we don't render unused chips. */
export const PRESENT_INDUSTRIES: ReadonlyArray<Industry> = Array.from(
  new Set(PULSE_CITIES.map((c) => c.industry)),
);
