// Client-side aggregates for the Top Insights rail. v1 derives directly
// from the rows already returned by pulse-explore — no extra server call.

import { useMemo } from 'react';

export function useExploreInsights(rows) {
  return useMemo(() => {
    if (!rows?.length) return null;
    const total = rows.length;
    const totalTeu = rows.reduce((a, r) => a + (r.teu ?? 0), 0);
    const totalShipments = rows.reduce((a, r) => a + (r.shipments ?? 0), 0);
    const avgOpp = rows.reduce((a, r) => a + (r.opportunity_composite_score ?? 0), 0) / total;

    const topBy = (key, n = 5) => {
      const counts = new Map();
      for (const r of rows) {
        const v = r[key]; if (!v) continue;
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      return [...counts.entries()]
        .sort((a, b) => b[1] - a[1]).slice(0, n)
        .map(([label, count]) => ({ label, count, pct: count / total }));
    };

    return {
      total,
      totalTeu,
      totalShipments,
      avgOpp,
      topIndustries: topBy('industry'),
      topCountries: topBy('country'),
      topMetros: topBy('city'),
    };
  }, [rows]);
}
