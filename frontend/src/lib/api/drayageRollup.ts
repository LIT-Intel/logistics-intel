// frontend/src/lib/api/drayageRollup.ts
// Fetches per-company drayage rollup from lit_drayage_estimates.
// Returns an array grouped by (pod_unloc, destination_city,
// destination_state) for the Revenue Opportunity tab. Replaces the
// $1,200 × FCL count hardcoded fallback.
//
// Schema note: lit_drayage_estimates uses source_company_key (matches
// lit_saved_companies.source_company_key — the ImportYeti slug), not
// the lit_companies UUID. Pass the slug, not the UUID.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type DrayageRollupRow = {
  pod_unloc: string | null;
  destination_city: string | null;
  destination_state: string | null;
  miles: number | null;
  containers_eq: number;
  est_cost_usd: number;
  est_cost_low_usd: number;
  est_cost_high_usd: number;
  bol_count: number;
};

export function useDrayageRollup(sourceCompanyKey: string | null | undefined): {
  rollup: DrayageRollupRow[] | null;
  loading: boolean;
  error: string | null;
} {
  const [rollup, setRollup] = useState<DrayageRollupRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sourceCompanyKey) {
      setRollup(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const { data, error: e } = await supabase
        .from("lit_drayage_estimates")
        .select(
          "pod_unloc, destination_city, destination_state, miles, containers_eq, est_cost_usd, est_cost_low_usd, est_cost_high_usd"
        )
        .eq("source_company_key", sourceCompanyKey)
        .order("computed_at", { ascending: false })
        .limit(500);

      if (cancelled) return;
      if (e) {
        setError(e.message);
        setRollup(null);
        setLoading(false);
        return;
      }

      // Group by (pod_unloc, destination_city, destination_state) and
      // aggregate cost + container counts per route.
      const groups = new Map<string, DrayageRollupRow>();
      for (const row of (data ?? [])) {
        const key = `${row.pod_unloc ?? ""}|${row.destination_city ?? ""}|${row.destination_state ?? ""}`;
        const existing = groups.get(key);
        if (!existing) {
          groups.set(key, {
            pod_unloc: row.pod_unloc,
            destination_city: row.destination_city,
            destination_state: row.destination_state,
            miles: row.miles,
            containers_eq: Number(row.containers_eq ?? 0),
            est_cost_usd: Number(row.est_cost_usd ?? 0),
            est_cost_low_usd: Number(row.est_cost_low_usd ?? 0),
            est_cost_high_usd: Number(row.est_cost_high_usd ?? 0),
            bol_count: 1,
          });
        } else {
          existing.containers_eq += Number(row.containers_eq ?? 0);
          existing.est_cost_usd += Number(row.est_cost_usd ?? 0);
          existing.est_cost_low_usd += Number(row.est_cost_low_usd ?? 0);
          existing.est_cost_high_usd += Number(row.est_cost_high_usd ?? 0);
          existing.bol_count += 1;
        }
      }
      const arr = Array.from(groups.values()).sort(
        (a, b) => b.est_cost_usd - a.est_cost_usd,
      );
      setRollup(arr);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [sourceCompanyKey]);

  return { rollup, loading, error };
}
