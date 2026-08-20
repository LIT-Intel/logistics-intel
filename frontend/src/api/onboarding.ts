/**
 * Post-signup onboarding (2026-08-19).
 *
 * Mandatory 3-step qualification flow every NEW user completes after signup +
 * email confirm, before the app unlocks. Anti-spam friction + sales data.
 *
 * The gating flag lives on `profiles.onboarding_completed_at` (see migration
 * 20260819130000). Reads go through the profiles self-select RLS policy;
 * the write goes through the SECURITY DEFINER RPC lit_complete_onboarding so
 * the frontend never writes qualification data to the table directly.
 */
import { supabase } from "@/lib/supabase";

export const COMPANY_TYPES = [
  "Freight Broker",
  "Freight Forwarder",
  "3PL",
  "Shipper",
  "Other",
] as const;

export type CompanyType = (typeof COMPANY_TYPES)[number];

// value stored in profiles.interests[] + human label shown in the UI.
export const INTEREST_OPTIONS: { value: string; label: string }[] = [
  { value: "finding_shippers", label: "Finding shippers & importers" },
  { value: "outreach", label: "Outreach & campaigns" },
  { value: "crm", label: "CRM & pipeline" },
  { value: "market_intel", label: "Market & trade intelligence" },
  { value: "competitor_lanes", label: "Competitor lanes" },
  { value: "other", label: "Other" },
];

export const DEMO_BOOKING_URL = "https://cal.com/logisticintel/30min";

/**
 * Gate launch date (2026-08-18). Profiles created before this predate the
 * mandatory onboarding flow and are grandfathered client-side — a
 * belt-and-braces check on top of the migration backfill (20260819130000
 * stamped onboarding_completed_at = now() for all pre-existing accounts).
 */
export const ONBOARDING_GATE_LAUNCH = "2026-08-18T00:00:00Z";

export interface OnboardingStatus {
  /** null => onboarding not yet completed (app must be gated). */
  completedAt: string | null;
  demoBooked: boolean;
  /** profiles.created_at — used for the grandfathering cutoff. */
  profileCreatedAt: string | null;
}

/**
 * Read the caller's onboarding gate flag from their own profile row,
 * explicitly scoped to the authed user's id.
 *
 * Returns null on ANY failure: no client, no session, PostgREST/RLS error,
 * or a missing profile row. Callers must FAIL CLOSED on null (treat as "must
 * onboard"). The previous fail-open contract ("error => pretend completed")
 * is exactly what let every new signup silently bypass the wizard when this
 * read failed in production. Re-showing the wizard to an already-onboarded
 * user on a transient error is safe — lit_complete_onboarding is idempotent
 * and preserves the original completion timestamp — while silently skipping
 * it for a new user defeats the gate entirely.
 */
export async function fetchOnboardingStatus(): Promise<OnboardingStatus | null> {
  if (!supabase) return null;
  try {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return null;
    const { data, error } = await supabase
      .from("profiles")
      .select("onboarding_completed_at, demo_booked, created_at")
      .eq("id", uid)
      .maybeSingle();
    if (error) {
      console.warn("[onboarding] status read failed:", error.message);
      return null;
    }
    if (!data) {
      // Profile row missing (handle_new_user_profile trigger failed?) —
      // fail closed: the wizard's completion RPC will surface the problem.
      console.warn("[onboarding] no profiles row for user", uid);
      return null;
    }
    return {
      completedAt: (data.onboarding_completed_at as string | null) ?? null,
      demoBooked: Boolean(data.demo_booked),
      profileCreatedAt: (data.created_at as string | null) ?? null,
    };
  } catch (err) {
    console.warn("[onboarding] status read threw:", err);
    return null;
  }
}

/**
 * True when the profile predates the gate launch — the user existed before
 * the mandatory onboarding shipped and must never be re-gated, even if the
 * migration backfill somehow missed their row.
 */
export function isGrandfathered(status: OnboardingStatus | null): boolean {
  if (!status?.profileCreatedAt) return false;
  const created = Date.parse(status.profileCreatedAt);
  return Number.isFinite(created) && created < Date.parse(ONBOARDING_GATE_LAUNCH);
}

export interface CompleteOnboardingInput {
  fullName: string;
  companyName: string;
  phone: string;
  companyType: CompanyType;
  interests: string[];
  demoBooked?: boolean;
}

/**
 * Persist onboarding answers and flip the completion flag via the SECURITY
 * DEFINER RPC. Returns { ok } — on ok=false the reason mirrors the server
 * validation codes (phone_required, company_type_invalid, interests_required…).
 */
export async function completeOnboarding(
  input: CompleteOnboardingInput,
): Promise<{ ok: true; completedAt: string } | { ok: false; reason: string }> {
  if (!supabase) return { ok: false, reason: "no_backend" };
  const { data, error } = await supabase.rpc("lit_complete_onboarding", {
    p_full_name: input.fullName,
    p_company_name: input.companyName,
    p_phone: input.phone,
    p_company_type: input.companyType,
    p_interests: input.interests,
    p_demo_booked: input.demoBooked ?? false,
  });
  if (error) return { ok: false, reason: error.message || "rpc_error" };
  const row = (data ?? {}) as { ok?: boolean; reason?: string; onboarding_completed_at?: string };
  if (!row.ok) return { ok: false, reason: row.reason || "unknown" };
  return { ok: true, completedAt: row.onboarding_completed_at as string };
}
