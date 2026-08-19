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

export interface OnboardingStatus {
  /** null => onboarding not yet completed (app must be gated). */
  completedAt: string | null;
  demoBooked: boolean;
}

/**
 * Read the caller's onboarding gate flag from their own profile row (RLS
 * self-select). Returns completedAt=null when the row can't be read or the
 * flag is unset — the guard treats that as "must onboard". On a hard backend
 * error we deliberately return completedAt as a sentinel so we never lock a
 * real user out of the app on a transient read failure (see guard).
 */
export async function fetchOnboardingStatus(): Promise<OnboardingStatus | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("onboarding_completed_at, demo_booked")
    .maybeSingle();
  if (error) return null; // caller decides how to treat an unreadable status
  return {
    completedAt: (data?.onboarding_completed_at as string | null) ?? null,
    demoBooked: Boolean(data?.demo_booked),
  };
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
