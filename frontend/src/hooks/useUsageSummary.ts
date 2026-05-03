import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";
import { PLAN_LIMITS, normalizePlan, type PlanCode } from "@/lib/planLimits";

/**
 * Map between the lit_usage_ledger.feature_key values the edge functions
 * write and the PLAN_LIMITS limit keys the catalog uses. The two namespaces
 * grew separately; this is the bridge.
 */
const FEATURE_TO_LIMIT_KEY: Record<string, keyof typeof PLAN_LIMITS["free_trial"]["limits"]> = {
  company_search: "searches_per_month",
  company_profile_view: "company_views_per_month",
  saved_company: "command_center_saves_per_month",
  pulse_ai_report: "pulse_runs_per_month",
  pulse_brief: "pulse_runs_per_month",
  contact_enrichment: "enrichment_credits_per_month",
};

export type UsageRow = {
  featureKey: string;
  label: string;
  used: number;
  limit: number | null;
  pctUsed: number | null;
};

export type UsageSummary = {
  loading: boolean;
  error: string | null;
  plan: PlanCode;
  /** Calendar-month window the usage was aggregated for. */
  periodStart: string;
  periodEnd: string;
  rows: UsageRow[];
};

const TRACKED_FEATURES: Array<{ key: string; label: string }> = [
  { key: "company_search", label: "Searches" },
  { key: "company_profile_view", label: "Company refreshes" },
  { key: "saved_company", label: "Saved companies" },
  { key: "pulse_ai_report", label: "Pulse AI runs" },
  { key: "contact_enrichment", label: "Contact enrichments" },
];

/**
 * Read the current calendar-month usage for the logged-in user from
 * lit_usage_ledger and zip it against the user's plan caps. Calendar month
 * is the rough proxy that the edge gates use for non-org accounts; for
 * org-billed accounts this still surfaces the right "this month" feel even
 * if the precise period_start/period_end can shift by a few days.
 */
export function useUsageSummary(): UsageSummary {
  const { user, plan } = useAuth();
  const planCode = normalizePlan(plan ?? "free_trial");
  const planConfig = PLAN_LIMITS[planCode];

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usedByFeature, setUsedByFeature] = useState<Record<string, number>>({});

  // Calendar-month bucket so the "this month" framing is consistent across
  // free trial + paid plans even when the underlying ledger period_starts
  // come from different sources.
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      setUsedByFeature({});
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { data, error: queryError } = await supabase
          .from("lit_usage_ledger")
          .select("feature_key, quantity")
          .eq("user_id", user.id)
          .gte("created_at", periodStart)
          .lt("created_at", periodEnd);
        if (cancelled) return;
        if (queryError) throw queryError;
        const sums: Record<string, number> = {};
        for (const row of data ?? []) {
          const key = String((row as any).feature_key || "");
          const qty = Number((row as any).quantity) || 0;
          sums[key] = (sums[key] || 0) + qty;
        }
        setUsedByFeature(sums);
      } catch (err: any) {
        if (cancelled) return;
        console.warn("[useUsageSummary] ledger read failed:", err);
        setError(err?.message || "Failed to load usage");
        setUsedByFeature({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, periodStart, periodEnd]);

  const rows: UsageRow[] = TRACKED_FEATURES.map(({ key, label }) => {
    const used = usedByFeature[key] || 0;
    const limitKey = FEATURE_TO_LIMIT_KEY[key];
    const limit = limitKey ? planConfig.limits[limitKey] : null;
    const pctUsed =
      limit != null && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : null;
    return { featureKey: key, label, used, limit, pctUsed };
  });

  return {
    loading,
    error,
    plan: planCode,
    periodStart,
    periodEnd,
    rows,
  };
}
