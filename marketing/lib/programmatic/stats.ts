/**
 * Pure aggregator helpers — take raw shipment rows from the app DB
 * (Supabase) and return display-ready KPIs, top shippers, carrier mix,
 * and monthly trend buckets.
 *
 * Kept separate from the Supabase client so unit tests can call them
 * with fixture data and so agents in other runtimes (cron jobs, batch
 * scripts) can re-use the same computations.
 */

export type Shipment = {
  shipper_name?: string | null;
  shipper_domain?: string | null;
  shipper_industry?: string | null;
  consignee_name?: string | null;
  consignee_domain?: string | null;
  origin_port?: string | null;
  destination_port?: string | null;
  carrier?: string | null;
  scac?: string | null;
  hs_code?: string | null;
  arrival_date?: string | null;
  teu?: number | null;
  shipment_count?: number | null;
};

export function topShippers(rows: Shipment[], limit = 25) {
  const map = new Map<string, { name: string; domain?: string | null; industry?: string | null; teu: number; shipments: number }>();
  for (const r of rows) {
    if (!r.shipper_name) continue;
    const key = r.shipper_name.toLowerCase();
    const existing = map.get(key) || {
      name: r.shipper_name,
      domain: r.shipper_domain,
      industry: r.shipper_industry,
      teu: 0,
      shipments: 0,
    };
    existing.teu += r.teu || 0;
    existing.shipments += r.shipment_count || 1;
    map.set(key, existing);
  }
  return Array.from(map.values())
    .sort((a, b) => b.teu - a.teu || b.shipments - a.shipments)
    .slice(0, limit)
    .map((s, i) => ({
      rank: i + 1,
      name: s.name,
      domain: s.domain || undefined,
      industry: s.industry || undefined,
      teu12m: Math.round(s.teu),
      shipments12m: s.shipments,
    }));
}

export function carrierMix(rows: Shipment[]) {
  const map = new Map<string, { carrier: string; scac?: string | null; teu: number }>();
  let total = 0;
  for (const r of rows) {
    if (!r.carrier) continue;
    const key = (r.scac || r.carrier).toUpperCase();
    const existing = map.get(key) || { carrier: r.carrier, scac: r.scac, teu: 0 };
    existing.teu += r.teu || 0;
    total += r.teu || 0;
    map.set(key, existing);
  }
  if (total === 0) return [];
  return Array.from(map.values())
    .sort((a, b) => b.teu - a.teu)
    .slice(0, 10)
    .map((c) => ({
      carrier: c.carrier,
      scac: c.scac || undefined,
      share: Number((c.teu / total).toFixed(4)),
    }));
}

export function monthlyTrend(rows: Shipment[], monthsBack = 12) {
  const buckets = new Map<string, { teu: number; shipments: number }>();
  // Pre-seed last N months so the chart never has gaps
  const now = new Date();
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, { teu: 0, shipments: 0 });
  }
  for (const r of rows) {
    if (!r.arrival_date) continue;
    const month = r.arrival_date.slice(0, 7);
    const b = buckets.get(month);
    if (!b) continue;
    b.teu += r.teu || 0;
    b.shipments += r.shipment_count || 1;
  }
  return Array.from(buckets.entries()).map(([month, v]) => ({
    month,
    teu: Math.round(v.teu),
    shipments: v.shipments,
  }));
}

export function laneKpis(rows: Shipment[]) {
  const totalTeu = rows.reduce((acc, r) => acc + (r.teu || 0), 0);
  const totalShipments = rows.reduce((acc, r) => acc + (r.shipment_count || 1), 0);
  const trend = monthlyTrend(rows, 24);
  const last12 = trend.slice(-12).reduce((a, b) => a + b.teu, 0);
  const prev12 = trend.slice(-24, -12).reduce((a, b) => a + b.teu, 0);
  const yoy = prev12 ? ((last12 - prev12) / prev12) * 100 : 0;
  const carriers = carrierMix(rows);
  const topCarrierShare = carriers[0]?.share || 0;
  return [
    { value: formatLargeNumber(totalTeu), label: "TEU last 12m" },
    { value: new Intl.NumberFormat("en-US").format(totalShipments), label: "Shipments" },
    {
      value: `${Math.round(topCarrierShare * 100)}%`,
      label: carriers[0]?.scac || carriers[0]?.carrier || "Top carrier",
    },
    { value: `${yoy >= 0 ? "+" : ""}${yoy.toFixed(1)}%`, label: "YoY change" },
  ];
}

export function formatLargeNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}
