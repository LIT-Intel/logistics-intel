/**
 * Referral loop (Phase 8) — member "invite a freight pro" surface.
 *
 * REUSE: the referral link uses the SAME /?ref=<code> capture + claim path as
 * the affiliate program (frontend/src/lib/affiliateRef.ts +
 * claim-affiliate-referral edge fn). This module only mints/returns the
 * caller's personal member ref_code via the lit_get_or_create_referral_code
 * RPC. Reward is intelligence credits, issued on the referred user's
 * ACTIVATION (first search or save), not on click/signup.
 */
import { supabase } from "@/lib/supabase";

// Base URL for the shareable link. Mirrors buildReferralLink in
// frontend/src/lib/affiliate.ts so partner + member links look identical.
const REFERRAL_BASE_URL =
  (import.meta as ImportMeta & { env?: { VITE_PUBLIC_APP_URL?: string } }).env
    ?.VITE_PUBLIC_APP_URL || "https://logisticintel.com";

export interface ReferralCodeState {
  loading: boolean;
  refCode: string | null;
  link: string | null;
  error: string | null;
}

export function buildMemberReferralLink(refCode: string | null): string | null {
  if (!refCode) return null;
  return `${REFERRAL_BASE_URL}/?ref=${refCode}`;
}

/**
 * Get (lazily minting on first call) the caller's personal referral code.
 * Idempotent server-side. Returns { refCode, link } or an error reason.
 */
export async function getOrCreateReferralCode(): Promise<
  { ok: true; refCode: string; link: string } | { ok: false; reason: string }
> {
  if (!supabase) return { ok: false, reason: "no_backend" };
  const { data, error } = await supabase.rpc("lit_get_or_create_referral_code");
  if (error) return { ok: false, reason: error.message || "rpc_error" };
  const row = (data ?? {}) as { ok?: boolean; ref_code?: string; reason?: string };
  if (!row.ok || !row.ref_code) {
    return { ok: false, reason: row.reason || "unavailable" };
  }
  return {
    ok: true,
    refCode: row.ref_code,
    link: buildMemberReferralLink(row.ref_code) as string,
  };
}

/** Rewards the caller has earned so far (read via RLS-scoped select). */
export interface ReferralRewardRow {
  id: string;
  status: "pending" | "activated" | "rewarded" | "void";
  credits: number;
  activated_at: string | null;
  rewarded_at: string | null;
  created_at: string;
}

export async function listMyReferralRewards(): Promise<ReferralRewardRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("lit_referral_rewards")
    .select("id, status, credits, activated_at, rewarded_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error || !data) return [];
  return data as ReferralRewardRow[];
}
