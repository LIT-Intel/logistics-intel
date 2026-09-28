/**
 * useOrgBranding — reads the caller's active-org white-label branding
 * (organizations.white_label_enabled + brand_name) once per session and
 * caches it via TanStack Query. Consumed by both app sidebars (AppShell +
 * lit/AppSidebar) to swap the top-left wordmark for the org's brand name,
 * and by the Branding settings panel as its initial value.
 *
 * Purely cosmetic — the security boundary for white-label lives server-side.
 * The plan gate on WRITE is enforced in the settings panel (UX hint) and
 * ultimately by RLS/plan checks; a spoofed brand_name only re-labels the
 * viewer's own sidebar.
 *
 * Org id resolves through resolveActiveOrgId (first active org_members row),
 * the same anchor the CRM + settings use, so all surfaces agree on "the org".
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { resolveActiveOrgId } from "@/api/crm";
import { useAuth } from "@/auth/AuthProvider";

export interface OrgBranding {
  orgId: string | null;
  whiteLabelEnabled: boolean;
  brandName: string | null;
}

const EMPTY: OrgBranding = { orgId: null, whiteLabelEnabled: false, brandName: null };

export const ORG_BRANDING_QUERY_KEY = ["org-branding"] as const;

async function fetchOrgBranding(): Promise<OrgBranding> {
  const orgId = await resolveActiveOrgId();
  if (!orgId) return EMPTY;
  const { data, error } = await supabase
    .from("organizations")
    .select("id, white_label_enabled, brand_name")
    .eq("id", orgId)
    .maybeSingle();
  if (error || !data) return { ...EMPTY, orgId };
  const row = data as {
    id: string;
    white_label_enabled: boolean | null;
    brand_name: string | null;
  };
  return {
    orgId: row.id,
    whiteLabelEnabled: Boolean(row.white_label_enabled),
    brandName: row.brand_name?.trim() ? row.brand_name.trim() : null,
  };
}

export function useOrgBranding() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ORG_BRANDING_QUERY_KEY,
    queryFn: fetchOrgBranding,
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ORG_BRANDING_QUERY_KEY });
  }, [queryClient]);

  const branding = data ?? EMPTY;
  // The wordmark only overrides the default when the org opted in AND set a
  // non-empty brand name. Otherwise callers fall back to "Logistics Intel".
  const wordmark =
    branding.whiteLabelEnabled && branding.brandName ? branding.brandName : null;

  return { branding, wordmark, isLoading, invalidate };
}
