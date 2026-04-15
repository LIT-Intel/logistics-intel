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
  if (authError || !user) return json({ error: "Unauthorized" }, 401);

  // Verify caller is a platform_admin
  const { data: adminRow } = await adminClient
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminRow) return json({ error: "Forbidden: superadmin access required" }, 403);

  const body = await req.json().catch(() => ({}));
  const { action, params = {} } = body as { action: string; params: Record<string, unknown> };

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

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("[admin-api] fatal error", err);
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
