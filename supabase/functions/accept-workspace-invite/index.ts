// supabase/functions/accept-workspace-invite/index.ts
//
// Accept a pending org_invites row for the authenticated user.
//
// Contract:
//   POST /functions/v1/accept-workspace-invite
//   Authorization: Bearer <user JWT>
//   body: { token: string, email?: string }
//
// Returns: { ok: true, org_id, role } on success, or
//          { ok: false, error, code } on any failure.
//
// Failure codes the frontend can render specifically:
//   INVITE_NOT_FOUND         token does not match any row
//   INVITE_EXPIRED           expires_at < now()
//   INVITE_ALREADY_USED      status != 'pending'
//   INVITE_EMAIL_MISMATCH    invite.email != auth user email
//   SEAT_LIMIT_EXCEEDED      org already at plan-included seat cap
//
// Spec rules enforced:
//   - Invited users join the existing org. Never creates a new org.
//   - Seat math counts only confirmed org_members (not pending invites)
//     per user instruction (2026-05-06).
//   - Once accepted, invite.status -> 'accepted' and used_at set.
//
// Plan seat cap source of truth:
//   plans.included_seats  for the org's owner subscription. If the org
//   has no owner subscription resolvable, falls back to free_trial cap.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ ok: false, error: "Server misconfigured" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ ok: false, error: "Missing Authorization header" }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: authData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authData?.user) return json({ ok: false, error: "Unauthorized" }, 401);
  const user = authData.user;

  const body = await req.json().catch(() => ({})) as { token?: string; email?: string };
  const token = String(body.token || "").trim();
  if (!token) return json({ ok: false, error: "Missing invite token", code: "INVITE_NOT_FOUND" }, 400);

  // 1) Locate the invite row. Service-role bypasses RLS so the user can
  //    accept regardless of whether their account email matches the
  //    table's RLS policy.
  const { data: invite, error: inviteErr } = await admin
    .from("org_invites")
    .select("id, org_id, email, role, status, token, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (inviteErr) {
    console.error("[accept-workspace-invite] invite lookup failed", inviteErr);
    return json({ ok: false, error: "Failed loading invite" }, 500);
  }
  if (!invite) {
    return json({ ok: false, error: "Invite not found.", code: "INVITE_NOT_FOUND" }, 404);
  }

  if (invite.status === "accepted") {
    return json({ ok: false, error: "Invite already used.", code: "INVITE_ALREADY_USED" }, 409);
  }
  if (invite.status === "revoked") {
    return json({ ok: false, error: "Invite was revoked.", code: "INVITE_ALREADY_USED" }, 409);
  }
  if (invite.status !== "pending") {
    return json({ ok: false, error: "Invite is not pending.", code: "INVITE_ALREADY_USED" }, 409);
  }

  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
    // Best-effort: mark the row expired so future lookups read the right state.
    await admin.from("org_invites").update({ status: "expired" }).eq("id", invite.id);
    return json({ ok: false, error: "Invite expired. Request a new invite.", code: "INVITE_EXPIRED" }, 410);
  }

  // 2) Email match. Treat case-insensitively. If the user's auth email
  //    differs from the invite email we refuse — prevents an attacker
  //    with the token from joining as an unrelated user.
  const userEmail = String(user.email || "").toLowerCase();
  const inviteEmail = String(invite.email || "").toLowerCase();
  if (!userEmail || userEmail !== inviteEmail) {
    return json({
      ok: false,
      error: `This invite was sent to ${invite.email}. Sign in with that email to accept.`,
      code: "INVITE_EMAIL_MISMATCH",
    }, 403);
  }

  // 3) Seat capacity. Resolve owner's plan via the canonical
  //    resolve_plan_code RPC; cap = plans.included_seats. Enterprise
  //    has included_seats but is custom — we still honor the cap so
  //    Settings can surface the right number; ops can update the row.
  const { data: ownerMember } = await admin
    .from("org_members")
    .select("user_id, role")
    .eq("org_id", invite.org_id)
    .in("role", ["owner", "admin"])
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let includedSeats: number | null = null;
  if (ownerMember?.user_id) {
    const { data: planRow } = await admin.rpc("resolve_plan_code", {
      p_org_id: invite.org_id,
      p_user_id: ownerMember.user_id,
    });
    const planCode = typeof planRow === "string" ? planRow : "free_trial";
    const { data: plan } = await admin
      .from("plans")
      .select("included_seats")
      .eq("code", planCode)
      .maybeSingle();
    includedSeats = plan?.included_seats ?? 1;
  }

  if (includedSeats !== null) {
    const { count } = await admin
      .from("org_members")
      .select("user_id", { count: "exact", head: true })
      .eq("org_id", invite.org_id);
    const used = count ?? 0;
    if (used >= includedSeats) {
      return json({
        ok: false,
        error: `Seat limit reached (${used}/${includedSeats}). Ask the workspace owner to add seats before accepting.`,
        code: "SEAT_LIMIT_EXCEEDED",
        used,
        limit: includedSeats,
      }, 409);
    }
  }

  // 4) Idempotent membership insert. If the user is already a member of
  //    this org we treat the accept as a no-op success.
  const { data: existing } = await admin
    .from("org_members")
    .select("id, role")
    .eq("org_id", invite.org_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) {
    const { error: insertErr } = await admin.from("org_members").insert({
      org_id: invite.org_id,
      user_id: user.id,
      role: invite.role || "member",
    });
    if (insertErr) {
      console.error("[accept-workspace-invite] member insert failed", insertErr);
      return json({ ok: false, error: "Failed adding you to the workspace" }, 500);
    }
  }

  // 5) Mark invite accepted. Try used_at first; fall back to plain
  //    status update if column doesn't exist on this env.
  const acceptedAt = new Date().toISOString();
  const { error: acceptErr } = await admin
    .from("org_invites")
    .update({ status: "accepted", used_at: acceptedAt })
    .eq("id", invite.id);
  if (acceptErr && /used_at/.test(acceptErr.message || "")) {
    await admin.from("org_invites").update({ status: "accepted" }).eq("id", invite.id);
  }

  return json({
    ok: true,
    org_id: invite.org_id,
    role: invite.role || "member",
  });
});
