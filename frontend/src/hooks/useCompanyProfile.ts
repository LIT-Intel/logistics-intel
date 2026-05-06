/**
 * Phase 1 — useCompanyProfile hook
 *
 * One hook. Calls the `company-profile` edge function and exposes per-section
 * state. Falls back gracefully (returns null sections + an error) if the
 * edge function is not yet deployed, so the new container can render an
 * honest "Aggregator pending deploy" state during Phase 1.
 *
 * Does NOT replace any existing fetch in Company.jsx. Phase 2 decides
 * whether to migrate Company.jsx to consume this hook.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { resolveCompany } from "@/lib/companyResolver";
import type {
  ProfileBundle,
  ProfileFetchResult,
  ResolveCompanyError,
} from "@/lib/companyProfile.types";

type IncludeKey = "identity" | "shipments" | "contacts" | "activity" | "pulse";

export type UseCompanyProfileOptions = {
  hints?: {
    domain?: string | null;
    name?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
  };
  include?: IncludeKey[];
  /** Set false to skip auto-fetch (e.g. for opt-in sections like pulse). */
  enabled?: boolean;
};

export type UseCompanyProfileResult = {
  data: ProfileBundle | null;
  loading: boolean;
  error: ResolveCompanyError | null;
  refetch: () => Promise<void>;
  /** True when the edge fn returned 404 and we fell back to in-browser resolver. */
  usedFallback: boolean;
};

async function callAggregatorEdgeFunction(
  id: string | null,
  hints: UseCompanyProfileOptions["hints"],
  include: IncludeKey[],
): Promise<ProfileFetchResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke("company-profile", {
      body: { id, hints, include },
    });
    if (error) {
      const status = (error as any)?.context?.status ?? null;
      if (status === 404 || status === null) return null;
      const ctx = (error as any)?.context;
      if (ctx && typeof ctx.json === "function") {
        try {
          const body = await ctx.clone().json();
          if (body?.error) return { ok: false, error: body.error };
        } catch {
          /* fall through */
        }
      }
      return {
        ok: false,
        error: { code: "INTERNAL_ERROR", message: String(error.message ?? error) },
      };
    }
    if (data?.ok && data?.data) return { ok: true, data: data.data };
    if (data?.ok === false && data?.error) return { ok: false, error: data.error };
    return null;
  } catch {
    return null;
  }
}

async function resolveInBrowser(
  id: string | null,
  hints: UseCompanyProfileOptions["hints"],
): Promise<ProfileFetchResult> {
  const result = await resolveCompany(supabase as any, { id, hints });
  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    data: {
      identity: result.entity,
      shipments: null,
      contacts: null,
      activity: null,
      pulse: null,
    },
  };
}

export function useCompanyProfile(
  id: string | null | undefined,
  options: UseCompanyProfileOptions = {},
): UseCompanyProfileResult {
  const enabled = options.enabled !== false;
  const include = useMemo<IncludeKey[]>(
    () => options.include ?? ["identity", "shipments", "contacts", "activity"],
    [options.include],
  );
  const hints = options.hints;

  const [data, setData] = useState<ProfileBundle | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled && !!id);
  const [error, setError] = useState<ResolveCompanyError | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const requestIdRef = useRef(0);

  const fetchProfile = useCallback(async () => {
    if (!id || !enabled) return;
    const reqId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    const fromEdge = await callAggregatorEdgeFunction(id, hints, include);
    if (reqId !== requestIdRef.current) return;

    if (fromEdge) {
      if (fromEdge.ok) {
        setData(fromEdge.data);
        setUsedFallback(false);
      } else {
        setData(null);
        setError(fromEdge.error);
        setUsedFallback(false);
      }
      setLoading(false);
      return;
    }

    const fallback = await resolveInBrowser(id, hints);
    if (reqId !== requestIdRef.current) return;
    if (fallback.ok) {
      setData(fallback.data);
      setError(null);
    } else {
      setData(null);
      setError(fallback.error);
    }
    setUsedFallback(true);
    setLoading(false);
  }, [id, enabled, include, hints]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return { data, loading, error, refetch: fetchProfile, usedFallback };
}
