/**
 * Entitlements domain — server-authoritative plan / feature / usage snapshot.
 *
 * Single source of truth for plan-gating UX. Server-side enforcement at
 * mutation points (e.g. save-company) remains the actual security boundary;
 * this layer drives UI affordances only.
 *
 * Worked example for the api.ts domain split. See _client.ts and CLAUDE.md.
 */
import { invokeEdge } from "./_client";
import { supabase } from "@/lib/supabase";
import type { FeatureKey, UsageLimitKey } from "@/lib/planLimits";
import { parseLimitExceeded, type LimitExceeded } from "@/lib/usage";

/**
 * Server feature-keys actually emitted by the get-entitlements snapshot's
 * `limits` / `used` maps. These are the canonical edge-function keys (e.g.
 * `export_pdf`, `saved_map_view`, `company_search`, `pulse_search`) — distinct
 * from the `_per_month` UI mirror keys in UsageLimitKey. Folding them in lets
 * UI gates (e.g. PulseExploreTab's saveViewAllowed, the Billing meters) address
 * them type-safely.
 */
export type SnapshotLimitKey =
  | UsageLimitKey
  | "company_search"
  | "company_profile_view"
  | "saved_company"
  | "saved_contact"
  | "contact_enrichment"
  | "pulse_brief"
  | "pulse_ai"
  | "pulse_search"
  | "saved_pulse_list"
  | "export_pdf"
  | "saved_map_view"
  | "campaign_send"
  | "ai_brief"
  | "team_invite";

/**
 * Enrichment credit snapshot (Phase 1).
 *
 * Tracks Apollo/Lusha enrichment spend in a margin-protecting credit ledger.
 * 1 credit = 1 email unlock (~$0.05-0.20 wholesale).
 * Phase 3 will charge 10 credits per phone unlock to match Apollo's pricing.
 *
 * - quota: NULL means unlimited (Enterprise).
 * - reset_at: ISO timestamp of the next month boundary.
 */
export interface CreditUsageSnapshot {
  used_this_month: number;
  quota: number | null;
  remaining: number | null;
  reset_at?: string | null;
  plan?: string;
}

export interface EntitlementsSnapshot {
  plan: string;
  plan_name?: string;
  reset_at?: string | null;
  features: Partial<Record<FeatureKey, boolean>>;
  limits: Partial<Record<SnapshotLimitKey, number | null>>;
  used: Partial<Record<SnapshotLimitKey, number>>;
  market_benchmark_enabled?: boolean;
  is_platform_admin?: boolean;
  /**
   * Enrichment credit usage snapshot (Phase 1). NULL when the credit RPC isn't
   * deployed in this env (graceful fallback).
   */
  credits?: CreditUsageSnapshot | null;
  /**
   * Folded from the top-level `org_id` on the get-entitlements response so
   * consumers (e.g. campaign query, save-company gating) have a single
   * place to read the user's primary org.
   */
  org_id?: string | null;
}

interface GetEntitlementsResponse {
  ok: true;
  entitlements: EntitlementsSnapshot;
  org_id: string | null;
  user_id: string;
  is_platform_admin?: boolean;
}

/**
 * Fetch the canonical entitlements snapshot for the current user. JWT-verified
 * server-side. Single call returns plan + features + limits + used.
 *
 * The edge fn returns `is_platform_admin` as a top-level field; fold it into
 * the snapshot if the snapshot itself didn't already carry it, so consumers
 * have one place to read it.
 */
export async function fetchEntitlementsSnapshot(): Promise<EntitlementsSnapshot | null> {
  const res = await invokeEdge<GetEntitlementsResponse>("get-entitlements", {});
  if (!res) return null;
  const snap = res.entitlements ?? null;
  if (snap && typeof res.is_platform_admin === "boolean" && snap.is_platform_admin === undefined) {
    snap.is_platform_admin = res.is_platform_admin;
  }
  if (snap && snap.org_id === undefined) {
    snap.org_id = res.org_id ?? null;
  }
  return snap;
}

/**
 * Result of a server-side PDF export-quota pre-flight.
 *  - { ok: true }                    → caller may generate the PDF.
 *  - { ok: false, limit }            → quota exceeded (export_pdf). Caller must
 *                                      surface the UpgradeModal and ABORT.
 */
export type ExportQuotaResult =
  | { ok: true }
  | { ok: false; limit: LimitExceeded };

/**
 * Server-side gate for CLIENT-SIDE PDF generation.
 *
 * The PDF surfaces (CompanyProfileV2 jsPDF export, Pulse Explorer report PDF)
 * render entirely in the browser, so a client-only entitlement hint can be
 * bypassed. This calls export-company-profile with intent='check', which runs
 * check_usage_limit('export_pdf') server-side and — on ok — consumes one unit.
 * The security boundary is the edge function (CLAUDE.md rule #6); this helper
 * is the client's way of honoring it before doing local work.
 *
 * Returns { ok:true } when generation is allowed (also fails OPEN on a
 * transport/infra error so a transient hiccup never blocks a paying user —
 * the edge fn returns a clean 403 for the real over-limit case). Returns
 * { ok:false, limit } only when the server explicitly reports LIMIT_EXCEEDED.
 *
 * Direct fetch (not invokeEdge) so we can read the 403 LIMIT_EXCEEDED body,
 * mirroring pulse-explore.js.
 */
export async function checkExportQuota(): Promise<ExportQuotaResult> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess?.session?.access_token;
  const baseUrl =
    (import.meta as ImportMeta & { env?: { VITE_SUPABASE_URL?: string } }).env
      ?.VITE_SUPABASE_URL ?? "";
  if (!token || !baseUrl) {
    // Can't reach the server — fail open rather than block on auth glitch.
    return { ok: true };
  }
  try {
    const res = await fetch(`${baseUrl}/functions/v1/export-company-profile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ intent: "check" }),
    });
    if (res.status === 403) {
      let payload: unknown = null;
      try {
        payload = await res.json();
      } catch {
        /* ignore */
      }
      const limit = parseLimitExceeded(payload);
      if (limit) return { ok: false, limit };
      // 403 without a parseable LIMIT_EXCEEDED — treat as blocked but
      // synthesize a payload so the modal still renders.
      return {
        ok: false,
        limit: {
          ok: false,
          code: "LIMIT_EXCEEDED",
          feature: "export_pdf",
          used: 0,
          limit: 0,
          plan: "free_trial",
          reset_at: null,
          upgrade_url: "/app/billing",
          message: "PDF exports are included on paid plans.",
        },
      };
    }
    // Any other status (200 ok, or a non-quota error) → allow generation.
    return { ok: true };
  } catch {
    // Network failure — fail open.
    return { ok: true };
  }
}
