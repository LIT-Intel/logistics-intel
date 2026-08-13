/**
 * Org-shared saved companies + collision awareness (CEO feature 2026-08-13).
 *
 * Data layer: lit_saved_companies SELECT RLS (migration
 * 20260813090000_org_saved_sharing_toggle) exposes
 *   - the viewer's own rows, always, and
 *   - org-mates' rows ONLY while organizations.saved_sharing_enabled is ON
 *     and the viewer is an active member of that org.
 * Every read here goes through the user-scoped supabase client, so these
 * helpers inherit that scoping — no client-side org filtering games.
 *
 * New domain module (not lib/api.ts) per CLAUDE.md: prefer dedicated
 * frontend/src/api/<domain>.ts files over growing the god-object.
 */

import { supabase } from "@/lib/supabase";

export type OrgSaveCollision = {
  savedRowId: string;
  saverUserId: string;
  saverName: string;
  saverTitle: string | null;
  savedAt: string | null;
  lastActivityAt: string | null;
  stage: string | null;
  /** Contacts already on file for this company (enrichment output). */
  contactCount: number;
  /** Additional org-mates (beyond the primary saver) who saved it too. */
  otherSaverCount: number;
};

export type OrgSharedSaveRow = {
  savedRowId: string;
  companyUuid: string;
  savedBy: { userId: string; name: string; title: string | null };
  stage: string | null;
  createdAt: string | null;
  lastActivityAt: string | null;
};

async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Resolve display names for a set of org members in one query. */
async function loadMemberDirectory(
  userIds: string[],
): Promise<Record<string, { name: string; title: string | null }>> {
  const out: Record<string, { name: string; title: string | null }> = {};
  if (!userIds.length) return out;
  try {
    const { data } = await supabase
      .from("org_members")
      .select("user_id, full_name, email, title")
      .in("user_id", Array.from(new Set(userIds)));
    for (const m of data ?? []) {
      if (!m?.user_id) continue;
      const name =
        (typeof m.full_name === "string" && m.full_name.trim()) ||
        (typeof m.email === "string" && m.email.includes("@") ? m.email.split("@")[0] : "") ||
        "Teammate";
      out[m.user_id] = { name, title: m.title ?? null };
    }
  } catch {
    /* directory lookup is cosmetic — fall through to "Teammate" labels */
  }
  return out;
}

/**
 * Collision probe for a company profile: is this company saved by an
 * org-mate (NOT the viewer)? Returns null when there is no visible
 * org-mate save — which is also the answer whenever sharing is OFF or the
 * viewer has no multi-member org, because RLS hides those rows entirely.
 */
export async function fetchOrgSaveCollision(
  companyUuid: string | null | undefined,
): Promise<OrgSaveCollision | null> {
  if (!companyUuid) return null;
  const uid = await currentUserId();
  if (!uid) return null;

  try {
    const { data: rows, error } = await supabase
      .from("lit_saved_companies")
      .select("id, user_id, org_id, created_at, last_activity_at, stage")
      .eq("company_id", companyUuid)
      .neq("user_id", uid)
      .order("last_activity_at", { ascending: false, nullsFirst: false });
    if (error || !rows?.length) return null;

    const top = rows[0];
    const [directory, contactCountRes] = await Promise.all([
      loadMemberDirectory([top.user_id]),
      supabase
        .from("lit_contacts")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyUuid),
    ]);

    const who = directory[top.user_id] ?? { name: "A teammate", title: null };
    return {
      savedRowId: top.id,
      saverUserId: top.user_id,
      saverName: who.name,
      saverTitle: who.title,
      savedAt: top.created_at ?? null,
      lastActivityAt: top.last_activity_at ?? top.created_at ?? null,
      stage: top.stage ?? null,
      contactCount: contactCountRes?.count ?? 0,
      otherSaverCount: rows.length - 1,
    };
  } catch {
    return null;
  }
}

/**
 * Org-mates' saved companies for the Command Center list. Distinguishable
 * from the viewer's own saves — callers render these with a "Saved by X"
 * chip, never silently merged. Excludes the viewer's own rows; RLS already
 * excludes other orgs and toggled-off workspaces.
 */
export async function listOrgSharedSaves(): Promise<OrgSharedSaveRow[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  try {
    const { data: rows, error } = await supabase
      .from("lit_saved_companies")
      .select("id, user_id, company_id, created_at, last_activity_at, stage")
      .neq("user_id", uid)
      .order("last_activity_at", { ascending: false, nullsFirst: false })
      .limit(500);
    if (error || !rows?.length) return [];

    const directory = await loadMemberDirectory(rows.map((r: any) => r.user_id));
    return rows
      .filter((r: any) => r?.company_id)
      .map((r: any) => ({
        savedRowId: r.id,
        companyUuid: r.company_id,
        savedBy: {
          userId: r.user_id,
          ...(directory[r.user_id] ?? { name: "Teammate", title: null }),
        },
        stage: r.stage ?? null,
        createdAt: r.created_at ?? null,
        lastActivityAt: r.last_activity_at ?? null,
      }));
  } catch {
    return [];
  }
}

/**
 * Org-mates' saves shaped like getSavedCompanies() rows so the Command
 * Center can append them to its list. Each record carries `shared_by`
 * (name/title of the org-mate) — the list renders these with a
 * "Saved by X" chip so shared saves are distinguishable from the
 * viewer's own, never silently merged.
 */
export async function listOrgSharedCompanyRecords(): Promise<any[]> {
  const shared = await listOrgSharedSaves();
  if (!shared.length) return [];

  // Dedupe by company (several org-mates may have saved the same company —
  // keep the most recently active row, which listOrgSharedSaves sorts first).
  const byCompany = new Map<string, OrgSharedSaveRow>();
  for (const row of shared) {
    if (!byCompany.has(row.companyUuid)) byCompany.set(row.companyUuid, row);
  }

  try {
    const { data: companies, error } = await supabase
      .from("lit_companies")
      .select(
        "id, source_company_key, name, domain, website, address_line1, city, state, country_code, shipments_12m, teu_12m, fcl_shipments_12m, lcl_shipments_12m, est_spend_12m, most_recent_shipment_date, top_route_12m, recent_route",
      )
      .in("id", Array.from(byCompany.keys()));
    if (error || !companies?.length) return [];

    return companies.map((c: any) => {
      const save = byCompany.get(c.id)!;
      return {
        saved_id: save.savedRowId,
        shared_by: save.savedBy,
        company: {
          id: c.id,
          company_id: c.source_company_key || c.id,
          name: c.name || "Unknown Company",
          domain: c.domain,
          website: c.website || null,
          address: c.address_line1 || `${c.city || ""}, ${c.state || ""}`.replace(/^, |, $/g, "").trim(),
          country_code: c.country_code,
          kpis: {
            shipments_12m: c.shipments_12m ?? 0,
            teu_12m: c.teu_12m ?? null,
            fcl_shipments_12m: c.fcl_shipments_12m ?? null,
            lcl_shipments_12m: c.lcl_shipments_12m ?? null,
            est_spend_12m: c.est_spend_12m ?? null,
            top_route_12m: c.top_route_12m || null,
            recent_route: c.recent_route || null,
            last_activity: c.most_recent_shipment_date ?? null,
          },
        },
        shipments: [],
        saved_at: save.createdAt,
        created_at: save.createdAt,
        stage: save.stage,
      };
    });
  } catch {
    return [];
  }
}

/**
 * "Request access" — notifies the org-mate who saved the company (in-app
 * lit_notifications row + best-effort email). Server-side function
 * re-verifies same-org membership and the sharing toggle.
 */
export async function requestCompanyAccess(
  companyUuid: string,
  message?: string,
): Promise<{ ok: boolean; notifiedName?: string; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("request-company-access", {
      body: { company_id: companyUuid, ...(message ? { message } : {}) },
    });
    if (error) {
      // supabase-js FunctionsHttpError hides the response body behind context.
      const ctx = (error as any)?.context;
      if (ctx && typeof ctx.json === "function") {
        try {
          const parsed = await ctx.clone().json();
          if (parsed?.error) return { ok: false, error: String(parsed.error) };
        } catch {
          /* fall through */
        }
      }
      return { ok: false, error: error.message || "Request failed" };
    }
    if (data?.ok) {
      return { ok: true, notifiedName: data?.notified?.name };
    }
    return { ok: false, error: data?.error || "Request failed" };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Request failed" };
  }
}
