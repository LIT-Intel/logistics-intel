// Shared helpers for the affiliate edge functions.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-affiliate-review-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function getSupabaseEnv() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    throw new Error("Missing Supabase environment variables");
  }
  return { supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey };
}

export async function authenticate(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { error: json({ ok: false, error: "Missing Authorization header" }, 401) };
  }
  const { supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey } = getSupabaseEnv();
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user) {
    return { error: json({ ok: false, error: "Unauthorized" }, 401) };
  }
  return { user: data.user, userClient, adminClient };
}

export async function isPlatformAdmin(adminClient: SupabaseClient, userId: string) {
  const { data } = await adminClient
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

// ──────────────────────────────────────────────────────────────────────────
// ref_code generation. 8-char Crockford-base32-ish (no I/L/O/U) for human
// readability. ~33 bits of entropy plus a uniqueness check on insert.
// ──────────────────────────────────────────────────────────────────────────
const REF_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateRefCode(len = 8) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (let i = 0; i < len; i++) out += REF_ALPHABET[bytes[i] % REF_ALPHABET.length];
  return out;
}

export async function generateUniqueRefCode(
  adminClient: SupabaseClient,
  attempts = 6,
): Promise<string> {
  for (let i = 0; i < attempts; i++) {
    const code = generateRefCode(8);
    const { data, error } = await adminClient
      .from("affiliate_partners")
      .select("id")
      .eq("ref_code", code)
      .maybeSingle();
    if (error) throw error;
    if (!data) return code;
  }
  throw new Error("Unable to allocate unique ref_code");
}

export function nonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

export function trueFlag(v: unknown): boolean {
  return v === true || v === "true" || v === 1;
}

// ──────────────────────────────────────────────────────────────────────────
// Stripe Connect status mapping. Translates a Stripe Express account into
// our internal stripe_status enum.
// ──────────────────────────────────────────────────────────────────────────
export type StripeStatus =
  | "not_connected"
  | "onboarding_started"
  | "verification_required"
  | "restricted"
  | "payouts_enabled";

export function mapStripeAccountStatus(account: {
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  requirements?: {
    currently_due?: string[];
    past_due?: string[];
    disabled_reason?: string | null;
  };
}): StripeStatus {
  if (!account) return "not_connected";
  const reqs = account.requirements ?? {};
  const currentlyDue = reqs.currently_due?.length ?? 0;
  const pastDue = reqs.past_due?.length ?? 0;
  const disabled = reqs.disabled_reason;
  if (account.payouts_enabled && account.charges_enabled) {
    return "payouts_enabled";
  }
  if (disabled || pastDue > 0) return "restricted";
  if (account.details_submitted && currentlyDue > 0) return "verification_required";
  if (account.details_submitted) return "verification_required";
  return "onboarding_started";
}
