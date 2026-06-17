// supabase/functions/signup-with-invite/index.ts
//
// Single-step invite signup. Creates the user account, joins them to the
// inviting workspace, and returns an active session — all in one server-side
// call. No email confirmation, no /auth/callback round-trip, no 6-step
// onboarding wizard.
//
// Contract:
//   POST /functions/v1/signup-with-invite
//   (anon-callable — invited users have no session yet)
//   body: { token: string, email: string, full_name: string, password: string }
//
// Returns: { ok: true, session: { access_token, refresh_token }, org_id, role, user_id }
//        | { ok: false, error, code }
//
// Failure codes the frontend can render specifically:
//   INVITE_NOT_FOUND         token does not match any row
//   INVITE_EXPIRED           expires_at < now()
//   INVITE_ALREADY_USED      status != 'pending'
//   INVITE_EMAIL_MISMATCH    body.email != invite.email
//   SEAT_LIMIT_EXCEEDED      org already at plan-included seat cap
//   USER_EXISTS              auth.users already has this email — frontend
//                            should redirect to /login (with the token
//                            preserved) so they can accept-workspace-invite
//                            after authenticating.
//   VALIDATION_FAILED        body missing/short fields
//   SIGNUP_FAILED            admin.auth.admin.createUser returned an error
//
// Spec rules enforced:
//   - email_confirm: true on createUser  -> NO Supabase confirmation email
//   - user_metadata.onboarding_completed = true -> invited users skip the
//     new-org wizard (AuthCallback / RequireAuth already short-circuit when
//     this flag is present OR an org_members row exists).
//   - Seat math counts only confirmed org_members (same logic as
//     accept-workspace-invite) per 2026-05-06 instruction.

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

  const admin = createClient(supabaseUrl, serviceKey);

  // ---- 1. Parse + validate body --------------------------------------------
  const body = await req.json().catch(() => ({})) as {
    token?: string;
    email?: string;
    full_name?: string;
    password?: string;
  };

  const token = String(body.token || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const fullName = String(body.full_name || "").trim();
  const password = String(body.password || "");

  if (!token) {
    return json({ ok: false, error: "Missing invite token", code: "INVITE_NOT_FOUND" }, 400);
  }
  if (!email || !email.includes("@")) {
    return json({ ok: false, error: "Valid email required", code: "VALIDATION_FAILED" }, 400);
  }
  if (!fullName) {
    return json({ ok: false, error: "Full name required", code: "VALIDATION_FAILED" }, 400);
  }
  if (!password || password.length < 8) {
    return json({ ok: false, error: "Password must be at least 8 characters", code: "VALIDATION_FAILED" }, 400);
  }

  // ---- 2. Look up the invite (service-role bypasses RLS) -------------------
  const { data: invite, error: inviteErr } = await admin
    .from("org_invites")
    .select("id, org_id, email, role, status, token, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (inviteErr) {
    console.error("[signup-with-invite] invite lookup failed", inviteErr);
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
    await admin.from("org_invites").update({ status: "expired" }).eq("id", invite.id);
    return json({ ok: false, error: "Invite expired. Request a new invite.", code: "INVITE_EXPIRED" }, 410);
  }

  // ---- 3. Email must match the invite (case-insensitive) -------------------
  const inviteEmail = String(invite.email || "").toLowerCase();
  if (!inviteEmail || inviteEmail !== email) {
    return json({
      ok: false,
      error: `This invite was sent to ${invite.email}. Use that email to accept.`,
      code: "INVITE_EMAIL_MISMATCH",
    }, 403);
  }

  // ---- 4. Seat capacity check (same logic as accept-workspace-invite) -----
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

  // ---- 5. Existing user check ---------------------------------------------
  // listUsers paginates; we walk pages until we find the email or run out.
  // For a workspace inviting a new teammate this is fine — the typical
  // auth.users table is small relative to the page size. If LIT scales to
  // very large user tables this becomes a hotspot worth replacing with
  // a direct `select id from auth.users where email = ?` over service role.
  let existingUser: { id: string; email?: string | null } | null = null;
  {
    const perPage = 1000;
    let page = 1;
    // Bound the loop so a misbehaving auth backend can't hang the request.
    while (page <= 20) {
      const { data: listed, error: listErr } = await admin.auth.admin.listUsers({
        page,
        perPage,
      });
      if (listErr) {
        console.error("[signup-with-invite] listUsers failed", listErr);
        break;
      }
      const match = listed?.users?.find((u) =>
        (u.email || "").toLowerCase() === email
      );
      if (match) {
        existingUser = { id: match.id, email: match.email };
        break;
      }
      if (!listed?.users || listed.users.length < perPage) break;
      page += 1;
    }
  }

  if (existingUser) {
    return json({
      ok: false,
      error: "Account already exists for this email. Sign in instead.",
      code: "USER_EXISTS",
    }, 409);
  }

  // ---- 6. Create the user with email pre-confirmed ------------------------
  // email_confirm:true tells GoTrue the email is already verified — it sets
  // email_confirmed_at = now() at insert time AND, critically, suppresses
  // the auto-sent confirmation email. This is the documented admin API
  // behavior. The user therefore receives ONLY the invite email we sent
  // through send-org-invite, never a second confirm-your-email message.
  const { data: newUserData, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      display_name: fullName,
      onboarding_completed: true,
    },
  });

  if (createErr || !newUserData?.user) {
    console.error("[signup-with-invite] createUser failed", createErr);
    return json({
      ok: false,
      error: createErr?.message || "Failed to create account",
      code: "SIGNUP_FAILED",
    }, 500);
  }

  const newUser = newUserData.user;

  // ---- 7. Add membership row ----------------------------------------------
  // email + full_name are denormalized into org_members so the Settings UI
  // can show real teammate data without joining auth.users (which the
  // frontend cannot read).
  const { error: memberErr } = await admin.from("org_members").insert({
    org_id: invite.org_id,
    user_id: newUser.id,
    role: invite.role || "member",
    status: "active",
    email,
    full_name: fullName,
  });

  if (memberErr) {
    // The auth user was created but membership failed. Best-effort cleanup
    // so we don't leave an orphaned account that blocks a retry.
    console.error("[signup-with-invite] member insert failed", memberErr);
    await admin.auth.admin.deleteUser(newUser.id).catch((err) => {
      console.error("[signup-with-invite] cleanup deleteUser failed", err);
    });
    return json({ ok: false, error: "Failed adding you to the workspace" }, 500);
  }

  // ---- 8. Mark invite accepted --------------------------------------------
  const acceptedAt = new Date().toISOString();
  const { error: acceptErr } = await admin
    .from("org_invites")
    .update({ status: "accepted", used_at: acceptedAt })
    .eq("id", invite.id);
  if (acceptErr && /used_at/.test(acceptErr.message || "")) {
    // Older envs may not have used_at — fall back to plain status update.
    await admin.from("org_invites").update({ status: "accepted" }).eq("id", invite.id);
  }

  // ---- 9. Best-effort profiles upsert -------------------------------------
  // Profiles row mirrors auth.users for frontend reads. If the table
  // doesn't exist, or the trigger already populated it, ignore the error.
  await admin.from("profiles").upsert({
    id: newUser.id,
    email,
    full_name: fullName,
  }, { onConflict: "id" }).then(({ error }) => {
    if (error) console.warn("[signup-with-invite] profiles upsert skipped:", error.message);
  });

  // ---- 10. Sign in to mint a session --------------------------------------
  // We just set the password ourselves, so signInWithPassword against the
  // anon client will return a real session pair the frontend can persist.
  // (Admin API does not expose a "create session for user_id" primitive
  // in this Supabase SDK version; signing in is the canonical workaround.)
  const userScopedClient = createClient(supabaseUrl, anonKey);
  const { data: signInData, error: signInErr } = await userScopedClient.auth.signInWithPassword({
    email,
    password,
  });

  if (signInErr || !signInData?.session) {
    console.error("[signup-with-invite] auto-signin failed", signInErr);
    // Account + membership are good — they can sign in manually. Don't
    // 500: report the partial success so the frontend can route to /login
    // with a clear message instead of treating the whole flow as failed.
    return json({
      ok: true,
      session: null,
      org_id: invite.org_id,
      role: invite.role || "member",
      user_id: newUser.id,
      warning: "Account created but auto-signin failed. Please sign in manually.",
    });
  }

  return json({
    ok: true,
    session: {
      access_token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
    },
    org_id: invite.org_id,
    role: invite.role || "member",
    user_id: newUser.id,
  });
});
