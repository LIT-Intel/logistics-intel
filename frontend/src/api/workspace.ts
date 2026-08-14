import { supabase } from "@/lib/supabase";

/**
 * Workspace-scoped dashboard data (CEO directive 2026-08-13, "Evan bug").
 *
 * The dashboard header reads "Workspace overview", but its data loaders
 * were user-scoped: `getSavedCompanies()` filters `user_id = auth.uid()`,
 * so an org member with zero personal saves saw an empty dashboard even
 * though their org had hundreds of shared accounts.
 *
 * `getWorkspaceSavedCompanies` intentionally omits the user_id filter and
 * lets `lit_saved_companies` RLS decide visibility: own rows always, plus
 * org rows when the org has `saved_sharing_enabled` (the org-scoped
 * sharing policy shipped in a19521c5). Solo users therefore get exactly
 * the same rows as before; org members get the workspace.
 *
 * `getWorkspaceKpis` calls the `get_workspace_kpis` SECURITY DEFINER RPC
 * (migration 20260813210000) which returns contact / pulse-brief /
 * outreach counts across the same workspace scope. It replaces the
 * user-scoped `dashboard-contact-metrics` edge call + two direct count
 * queries the dashboard used to make.
 */

export type WorkspaceKpis = {
  org_id: string | null;
  contacts: number;
  verified_emails: number;
  pulse_briefs_mtd: number;
  outreach_sent_mtd: number;
};

export async function getWorkspaceKpis(): Promise<WorkspaceKpis | null> {
  const { data, error } = await supabase.rpc("get_workspace_kpis");
  if (error) {
    console.error("getWorkspaceKpis error:", error);
    return null;
  }
  const d = (data || {}) as Record<string, unknown>;
  return {
    org_id: (d.org_id as string) ?? null,
    contacts: Number(d.contacts) || 0,
    verified_emails: Number(d.verified_emails) || 0,
    pulse_briefs_mtd: Number(d.pulse_briefs_mtd) || 0,
    outreach_sent_mtd: Number(d.outreach_sent_mtd) || 0,
  };
}

/**
 * Same row shape as `getSavedCompanies()` in lib/api.ts (company.kpis
 * envelope) so the dashboard's What-Matters table and lane aggregations
 * consume it unchanged — only the scoping differs (RLS-driven workspace
 * visibility instead of an explicit user_id filter).
 */
export async function getWorkspaceSavedCompanies(): Promise<{ rows: any[] }> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user) return { rows: [] };

    const { data, error } = await supabase
      .from("lit_saved_companies")
      .select(
        `
        *,
        lit_companies (
          id,
          source_company_key,
          name,
          domain,
          website,
          address_line1,
          city,
          state,
          country_code,
          shipments_12m,
          teu_12m,
          fcl_shipments_12m,
          lcl_shipments_12m,
          est_spend_12m,
          most_recent_shipment_date,
          top_route_12m,
          recent_route
        )
      `,
      )
      .order("last_viewed_at", { ascending: false });

    if (error) {
      console.error("getWorkspaceSavedCompanies error:", error);
      return { rows: [] };
    }

    // Workspace dedupe: the same company can be saved by several org
    // members. Keep the most recently viewed row per company so counts
    // ("saved accounts") mean distinct accounts, not membership rows.
    const seen = new Set<string>();
    const rows: any[] = [];
    for (const item of (data || []) as any[]) {
      const companyKey = String(
        item.lit_companies?.id || item.company_id || item.id,
      );
      if (seen.has(companyKey)) continue;
      seen.add(companyKey);
      rows.push({
        saved_id: item.id,
        company: {
          id: item.lit_companies?.id ?? null,
          company_id:
            item.lit_companies?.source_company_key || item.lit_companies?.id,
          name: item.lit_companies?.name || "Unknown Company",
          domain: item.lit_companies?.domain,
          website: item.lit_companies?.website || null,
          address:
            item.lit_companies?.address_line1 ||
            `${item.lit_companies?.city || ""}, ${item.lit_companies?.state || ""}`.trim(),
          country_code: item.lit_companies?.country_code,
          kpis: {
            shipments_12m: item.lit_companies?.shipments_12m ?? 0,
            teu_12m: item.lit_companies?.teu_12m ?? null,
            fcl_shipments_12m: item.lit_companies?.fcl_shipments_12m ?? null,
            lcl_shipments_12m: item.lit_companies?.lcl_shipments_12m ?? null,
            est_spend_12m: item.lit_companies?.est_spend_12m ?? null,
            top_route_12m: item.lit_companies?.top_route_12m || null,
            recent_route: item.lit_companies?.recent_route || null,
            last_activity:
              item.lit_companies?.most_recent_shipment_date ?? null,
          },
        },
        shipments: [],
        saved_at: item.created_at,
        stage: item.stage,
      });
    }

    return { rows };
  } catch (error) {
    console.error("getWorkspaceSavedCompanies error:", error);
    return { rows: [] };
  }
}
