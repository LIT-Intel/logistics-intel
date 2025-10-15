export type ShipmentRow = {
  date?: { value?: string } | string;
  shipment_date?: { value?: string };
  mode?: string;
  origin_country?: string;
  dest_country?: string;
  origin_port?: string;
  dest_port?: string;
  value_usd?: number | string | null;
  gross_weight_kg?: number | string | null;
  container_count?: number | null;
  carrier?: string | null;
  hs_code?: string | null;
  commodity_description?: string | null;
};

export type Kpi = {
  label: string;
  value: string | number;
  approx?: boolean;
};

function toNum(n: any): number { const x = Number(n); return Number.isFinite(x) ? x : 0; }
function fmt(n: number): string { return n.toLocaleString(); }
function lastDate(rows: ShipmentRow[]): string | null {
  let latest: string | null = null;
  for (const r of rows) {
    const v = typeof r.date === 'string' ? r.date : (r.shipment_date?.value || (r as any)?.date?.value || null);
    if (v && (!latest || v > latest)) latest = v;
  }
  return latest;
}

function inferTEUsSimple(desc: string | null | undefined, count: number | null | undefined): number | null {
  if (!count || count <= 0) return null;
  const d = (desc || '').toUpperCase();
  const has40 = /\b40(F|RF|HC|RC)?\b/.test(d) || / 40(RF|RC)/.test(d);
  const has20 = /\b20(F|RF|HC|RC)?\b/.test(d) || / 20(RF|RC)/.test(d);
  if (has40 && !has20) return count * 2;
  if (has20 && !has40) return count * 1;
  return Math.round(count * 1.5); // neutral estimate
}

export function computeKpis(rows: ShipmentRow[]): Kpi[] {
  const n = rows.length;
  const totalValue = rows.reduce((s, r) => s + toNum(r.value_usd), 0);
  const totalWeight = rows.reduce((s, r) => s + toNum(r.gross_weight_kg), 0);
  const totalContainers = rows.reduce((s, r) => s + (r.container_count || 0), 0);
  const totalTEU = rows.reduce((s, r) => s + (inferTEUsSimple(r.commodity_description, r.container_count) || 0), 0);
  const avgWeight = n ? totalWeight / n : 0;
  const avgValue = n ? totalValue / n : 0;

  const carrierCounts = new Map<string, number>();
  const routeCounts = new Map<string, number>();
  const hsCounts = new Map<string, number>();
  const origins = new Set<string>();
  const dests = new Set<string>();
  const ports = new Set<string>();
  for (const r of rows) {
    const c = (r.carrier || '—') as string;
    carrierCounts.set(c, (carrierCounts.get(c) || 0) + 1);
    const route = `${r.origin_country || '—'}→${r.dest_country || '—'}`;
    routeCounts.set(route, (routeCounts.get(route) || 0) + 1);
    const hs4 = (r.hs_code || '').toString().slice(0,4);
    if (hs4) hsCounts.set(hs4, (hsCounts.get(hs4) || 0) + 1);
    if (r.origin_country) origins.add(r.origin_country);
    if (r.dest_country) dests.add(r.dest_country);
    if (r.origin_port) ports.add(`o:${r.origin_port}`);
    if (r.dest_port) ports.add(`d:${r.dest_port}`);
  }
  function top(map: Map<string, number>): [string, number] | null {
    let best: [string, number] | null = null;
    for (const [k, v] of map) {
      if (!best || v > best[1]) best = [k, v];
    }
    return best;
  }
  const topCarrier = top(carrierCounts);
  const topRoute = top(routeCounts);
  const topHs = top(hsCounts);

  const approx = true; // all derived from current page/view
  const kpis: Kpi[] = [
    { label: 'Shipments (view)', value: fmt(n), approx },
    { label: 'Last activity', value: lastDate(rows) || '—', approx },
    { label: 'Top carrier', value: topCarrier ? `${topCarrier[0]} (${Math.round((topCarrier[1]/Math.max(n,1))*100)}%)` : '—', approx },
    { label: 'Top route', value: topRoute ? `${topRoute[0]} (${Math.round((topRoute[1]/Math.max(n,1))*100)}%)` : '—', approx },
    { label: 'Unique origins', value: origins.size, approx },
    { label: 'Unique destinations', value: dests.size, approx },
    { label: 'Total containers', value: fmt(totalContainers), approx },
    { label: 'Estimated TEUs*', value: fmt(totalTEU), approx },
    { label: 'Total weight (kg)', value: fmt(totalWeight), approx },
    { label: 'Total value (USD)', value: fmt(totalValue), approx },
    { label: 'Avg weight/shipment (kg)', value: fmt(Math.round(avgWeight)), approx },
    { label: 'Avg value/shipment (USD)', value: fmt(Math.round(avgValue)), approx },
    { label: 'Top HS-4', value: topHs ? `${topHs[0]} (${Math.round((topHs[1]/Math.max(n,1))*100)}%)` : '—', approx },
    { label: 'Unique ports', value: ports.size, approx },
  ];
  return kpis;
}
