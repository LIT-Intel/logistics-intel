import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { createLogger, requestId } from "../_shared/logger.ts";

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
  const log = createLogger("admin-api", { request_id: requestId() });
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseServiceRoleKey || !supabaseAnonKey) {
    return json({ error: "Missing Supabase environment variables" }, 500);
  }

  // Verify caller is authenticated
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    log.warn("unauthorized", { detail: authError?.message });
    return json({ error: "Unauthorized" }, 401);
  }

  // Verify caller is a platform_admin
  const { data: adminRow } = await adminClient
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminRow) {
    log.warn("forbidden_non_admin", { user_id: user.id });
    return json({ error: "Forbidden: superadmin access required" }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const { action, params = {} } = body as { action: string; params: Record<string, unknown> };
  log.info("admin_action", { user_id: user.id, action });

  try {
    // ── GET KPIs ─────────────────────────────────────────────────────────────
    if (action === "get_kpis") {
      // User count from org_members unique user IDs (proxy for auth.users count)
      const { data: memberRows } = await adminClient
        .from("org_members")
        .select("user_id");
      const uniqueUsers = new Set((memberRows || []).map((r: any) => r.user_id)).size;

      // Plan breakdown
      const { data: subRows } = await adminClient
        .from("subscriptions")
        .select("plan_code, status");
      const planBreakdown: Record<string, number> = {};
      for (const row of subRows || []) {
        if (row.status === "active") {
          planBreakdown[row.plan_code] = (planBreakdown[row.plan_code] || 0) + 1;
        }
      }

      // Invite funnel
      const { data: inviteRows } = await adminClient
        .from("org_invites")
        .select("status");
      const inviteCounts = { pending: 0, accepted: 0, expired: 0 };
      for (const row of inviteRows || []) {
        if (row.status in inviteCounts) {
          inviteCounts[row.status as keyof typeof inviteCounts] += 1;
        }
      }

      // Org count
      const { count: orgCount } = await adminClient
        .from("organizations")
        .select("id", { count: "exact", head: true });

      return json({
        ok: true,
        kpis: {
          totalUsers: uniqueUsers,
          totalOrgs: orgCount || 0,
          planBreakdown,
          inviteFunnel: inviteCounts,
        },
      });
    }

    // ── GET USERS ────────────────────────────────────────────────────────────
    if (action === "get_users") {
      const page = Number(params.page) || 1;
      const perPage = Number(params.perPage) || 25;
      const offset = (page - 1) * perPage;
      const search = String(params.search || "").trim();

      let query = adminClient
        .from("org_members")
        .select(`
          user_id,
          role,
          status,
          created_at,
          organizations(id, name),
          subscriptions(plan_code, status)
        `, { count: "exact" })
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .range(offset, offset + perPage - 1);

      const { data: members, count, error } = await query;
      if (error) return json({ error: error.message }, 500);

      // Enrich with auth user data via admin API
      const userIds = [...new Set((members || []).map((m: any) => m.user_id))];
      const userMap: Record<string, any> = {};
      for (const uid of userIds) {
        const { data: { user: u } } = await adminClient.auth.admin.getUserById(uid);
        if (u) userMap[uid] = { email: u.email, full_name: u.user_metadata?.full_name, created_at: u.created_at };
      }

      const rows = (members || []).map((m: any) => ({
        userId: m.user_id,
        email: userMap[m.user_id]?.email || null,
        fullName: userMap[m.user_id]?.full_name || null,
        orgId: m.organizations?.id,
        orgName: m.organizations?.name,
        orgRole: m.role,
        plan: m.subscriptions?.plan_code || "free_trial",
        subscriptionStatus: m.subscriptions?.status || null,
        createdAt: userMap[m.user_id]?.created_at || m.created_at,
      }));

      return json({ ok: true, users: rows, total: count || 0 });
    }

    // ── GET ORGS ─────────────────────────────────────────────────────────────
    if (action === "get_orgs") {
      const { data: orgs, error } = await adminClient
        .from("organizations")
        .select(`
          id, name, created_at,
          org_members(user_id, role, status),
          subscriptions(plan_code, status, started_at)
        `)
        .order("created_at", { ascending: false });

      if (error) return json({ error: error.message }, 500);

      const rows = (orgs || []).map((org: any) => ({
        id: org.id,
        name: org.name,
        createdAt: org.created_at,
        memberCount: (org.org_members || []).filter((m: any) => m.status === "active").length,
        plan: org.subscriptions?.[0]?.plan_code || "free_trial",
        subscriptionStatus: org.subscriptions?.[0]?.status || null,
      }));

      return json({ ok: true, orgs: rows });
    }

    // ── GET ORG MEMBERS ──────────────────────────────────────────────────────
    if (action === "get_org_members") {
      const orgId = String(params.orgId || "");
      if (!orgId) return json({ error: "orgId required" }, 400);

      const { data: members, error } = await adminClient
        .from("org_members")
        .select("id, user_id, role, status, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: true });

      if (error) return json({ error: error.message }, 500);

      const enriched = [];
      for (const m of members || []) {
        const { data: { user: u } } = await adminClient.auth.admin.getUserById(m.user_id);
        enriched.push({
          id: m.id,
          userId: m.user_id,
          email: u?.email || null,
          fullName: u?.user_metadata?.full_name || null,
          role: m.role,
          status: m.status,
          joinedAt: m.created_at,
        });
      }

      return json({ ok: true, members: enriched });
    }

    // ── UPDATE ORG PLAN ──────────────────────────────────────────────────────
    if (action === "update_org_plan") {
      const { orgId, plan: planCode } = params as { orgId: string; plan: string };
      if (!orgId || !planCode) return json({ error: "orgId and plan required" }, 400);

      const { error: subError } = await adminClient
        .from("subscriptions")
        .update({ plan_code: planCode })
        .eq("org_id", orgId);

      if (subError) return json({ error: subError.message }, 500);

      return json({ ok: true });
    }

    // ── UPDATE MEMBER ROLE ───────────────────────────────────────────────────
    if (action === "update_member_role") {
      const { memberId, role } = params as { memberId: string; role: string };
      if (!memberId || !role) return json({ error: "memberId and role required" }, 400);

      const { error } = await adminClient
        .from("org_members")
        .update({ role })
        .eq("id", memberId);

      if (error) return json({ error: error.message }, 500);

      return json({ ok: true });
    }

    // ── REMOVE MEMBER ────────────────────────────────────────────────────────
    if (action === "remove_member") {
      const { memberId } = params as { memberId: string };
      if (!memberId) return json({ error: "memberId required" }, 400);

      const { error } = await adminClient
        .from("org_members")
        .delete()
        .eq("id", memberId);

      if (error) return json({ error: error.message }, 500);

      return json({ ok: true });
    }

    // ── RUN REACTIVATION SEND (Phase 9) ──────────────────────────────────────
    // Proxies the platform-admin's "Send reactivation to Segment X now" click to
    // the gated lifecycle-nudge-tick dispatcher. Still a no-op unless the owner
    // has enabled lit_internal_meta['reactivation_enabled'] — the tick + the
    // pick-batch RPC both re-check the flag, and suppression/dedup are enforced
    // server-side. This handler only forwards; it holds no send logic itself.
    if (action === "run_reactivation") {
      const segment = String((params as { segment?: string }).segment || "").toUpperCase();
      if (!["A", "B", "C", "D"].includes(segment)) {
        return json({ error: "segment must be A, B, C, or D" }, 400);
      }
      const cronSecret = Deno.env.get("LIT_CRON_SECRET");
      if (!cronSecret) return json({ error: "LIT_CRON_SECRET not configured" }, 500);

      const resp = await fetch(`${supabaseUrl}/functions/v1/lifecycle-nudge-tick`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Cron": cronSecret,
        },
        body: JSON.stringify({ mode: "reactivation", segment }),
      });
      const result = await resp.json().catch(() => ({}));
      log.info("run_reactivation", { user_id: user.id, segment, result });
      return json({ ok: resp.ok, ...result });
    }

    // ── CREATE ORG (manual provisioning) ────────────────────────────────────
    // Platform-admin manual company creation for demo accounts. Mirrors the
    // handle_new_user_org_bootstrap() trigger: organizations row + an active
    // subscriptions row. Users are added separately via create_user.
    if (action === "create_org") {
      const { name, plan } = params as { name?: string; plan?: string };
      const orgName = String(name || "").trim();
      if (!orgName) return json({ error: "Organization name required" }, 400);

      const requestedPlan = String(plan || "free_trial").trim() || "free_trial";
      const { data: planRow } = await adminClient
        .from("plans")
        .select("code")
        .eq("code", requestedPlan)
        .maybeSingle();
      const planCode = planRow?.code || "free_trial";

      const { data: org, error: orgError } = await adminClient
        .from("organizations")
        .insert({ name: orgName, created_by: user.id })
        .select("id, name, created_at")
        .single();

      if (orgError || !org) {
        log.warn("create_org_failed", { user_id: user.id, detail: orgError?.message });
        return json({ error: orgError?.message || "Failed to create organization" }, 500);
      }

      const { error: subError } = await adminClient
        .from("subscriptions")
        .insert({
          org_id: org.id,
          user_id: user.id,
          plan_code: planCode,
          status: "active",
          started_at: new Date().toISOString(),
        });

      if (subError) {
        log.warn("create_org_sub_failed", { user_id: user.id, org_id: org.id, detail: subError.message });
        await adminClient.from("organizations").delete().eq("id", org.id);
        return json({ error: subError.message || "Failed creating subscription" }, 500);
      }

      log.info("create_org", { user_id: user.id, org_id: org.id, plan: planCode });
      return json({ ok: true, org: { id: org.id, name: org.name } });
    }

    // ── CREATE USER (manual provisioning, no invite) ─────────────────────────
    // Creates the auth user (email pre-confirmed, no confirmation email) and
    // adds them to the target org. The caller sets the password and shares it
    // with the demo user directly — no invite email is sent.
    // Mirrors signup-with-invite's createUser + org_members insert. The signup
    // bootstrap trigger is suppressed via a short-lived pending org_invites
    // row (the trigger's own skip path), removed again below in all paths.
    if (action === "create_user") {
      const { email, full_name, password, org_id, role, title } = params as {
        email?: string; full_name?: string; password?: string;
        org_id?: string; role?: string; title?: string;
      };
      const cleanEmail = String(email || "").trim().toLowerCase();
      const cleanName = String(full_name || "").trim();
      const cleanPassword = String(password || "");
      const orgId = String(org_id || "");
      const cleanRole = ["owner", "admin", "member"].includes(String(role)) ? String(role) : "member";

      if (!cleanEmail || !cleanEmail.includes("@")) return json({ error: "Valid email required" }, 400);
      if (!cleanName) return json({ error: "Full name required" }, 400);
      if (!cleanPassword || cleanPassword.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);
      if (!orgId) return json({ error: "org_id required" }, 400);

      const { data: org } = await adminClient
        .from("organizations")
        .select("id")
        .eq("id", orgId)
        .maybeSingle();
      if (!org) return json({ error: "Organization not found" }, 404);

      const suppressToken = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const { error: suppressError } = await adminClient.from("org_invites").insert({
        org_id: orgId,
        email: cleanEmail,
        role: cleanRole,
        title: String(title || "").trim() || null,
        token: suppressToken,
        status: "pending",
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        invited_by_user_id: user.id,
      });
      if (suppressError) {
        log.warn("create_user_suppress_failed", { user_id: user.id, detail: suppressError.message });
        return json({ error: "Failed preparing user creation" }, 500);
      }
      const clearSuppress = () =>
        adminClient.from("org_invites").delete().eq("token", suppressToken);

      const { data: newUserData, error: createErr } = await adminClient.auth.admin.createUser({
        email: cleanEmail,
        password: cleanPassword,
        email_confirm: true,
        user_metadata: {
          full_name: cleanName,
          display_name: cleanName,
          onboarding_completed: true,
        },
      });

      if (createErr || !newUserData?.user) {
        await clearSuppress();
        const msg = createErr?.message || "Failed to create account";
        const code = /already|exists|registered/i.test(msg) ? "USER_EXISTS" : "SIGNUP_FAILED";
        log.warn("create_user_failed", { user_id: user.id, detail: msg });
        return json({ error: msg, code }, code === "USER_EXISTS" ? 409 : 500);
      }

      const newUser = newUserData.user;

      const { error: memberErr } = await adminClient.from("org_members").insert({
        org_id: orgId,
        user_id: newUser.id,
        role: cleanRole,
        title: String(title || "").trim() || null,
        status: "active",
        email: cleanEmail,
        full_name: cleanName,
      });

      await clearSuppress();

      if (memberErr) {
        log.warn("create_user_member_failed", { user_id: user.id, detail: memberErr.message });
        await adminClient.auth.admin.deleteUser(newUser.id).catch(() => {});
        return json({ error: memberErr.message || "Failed adding user to organization" }, 500);
      }

      log.info("create_user", { user_id: user.id, new_user_id: newUser.id, org_id: orgId, role: cleanRole });
      return json({ ok: true, user: { id: newUser.id, email: cleanEmail }, org_id: orgId });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("[admin-api] fatal error", err);
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
