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

/**
 * Augment the bundle with the per-user `lit_saved_companies` row so the
 * UI has access to the canonical UUID for the `update_saved_company_stage`
 * RPC. The edge function currently sets `sources.saved.present` based on
 * the `lit_companies` row (canonical identity), not the user-specific
 * saved row — which means downstream consumers can't distinguish "company
 * exists in our system" from "this user has saved the company". This
 * augmentation reads `lit_saved_companies` for the current user and
 * overwrites `present`, `stage`, and the new `company_id` field with
 * what's actually persisted under that user.
 *
 * Falls back gracefully: if the user is not signed in, or the row does
 * not exist, the existing `sources.saved` values are left alone except
 * `present` which is set to false (since "saved by THIS user" is the
 * semantic the CRM stage selector relies on).
 */
async function augmentSavedRow(bundle: ProfileBundle): Promise<ProfileBundle> {
  try {
    const companyUuid = bundle?.identity?.id;
    if (!companyUuid) return bundle;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return bundle;
    const { data: saved } = await supabase
      .from("lit_saved_companies")
      .select("company_id, stage, notes, last_viewed_at, last_activity_at")
      .eq("user_id", user.id)
      .eq("company_id", companyUuid)
      .maybeSingle();
    if (!saved) {
      // Authoritatively mark not-saved for this user so the CRM stage
      // selector hides itself rather than rendering a static pill that
      // can't be edited.
      return {
        ...bundle,
        identity: {
          ...bundle.identity,
          sources: {
            ...bundle.identity.sources,
            saved: {
              ...bundle.identity.sources.saved,
              present: false,
              company_id: null,
              stage: null,
            },
          },
        },
      };
    }
    return {
      ...bundle,
      identity: {
        ...bundle.identity,
        sources: {
          ...bundle.identity.sources,
          saved: {
            ...bundle.identity.sources.saved,
            present: true,
            company_id: (saved as any).company_id ?? null,
            stage: (saved as any).stage ?? null,
            notes: (saved as any).notes ?? null,
            last_viewed_at: (saved as any).last_viewed_at ?? null,
            last_activity_at: (saved as any).last_activity_at ?? null,
          },
        },
      },
    };
  } catch {
    return bundle;
  }
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
        const augmented = await augmentSavedRow(fromEdge.data);
        if (reqId !== requestIdRef.current) return;
        setData(augmented);
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
      const augmented = await augmentSavedRow(fallback.data);
      if (reqId !== requestIdRef.current) return;
      setData(augmented);
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
