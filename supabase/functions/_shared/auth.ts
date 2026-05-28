// Shared auth + CORS + JSON helpers for Supabase edge functions.
//
// Most LIT edge functions hand-rolled their own auth check, which is how
// `check-entitlements` shipped unauthenticated and how `normalize-company` +
// `apollo-job-postings` shipped open to anyone holding the anon key.
//
// New functions and any function being touched should use these helpers
// instead of duplicating the pattern. See CLAUDE.md.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function handlePreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return null;
}

function getEnv() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    throw new Error("Missing Supabase env (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)");
  }
  return { supabaseUrl, anonKey, serviceKey };
}

export interface AuthContext {
  /** Verified user (from JWT). Always present on a successful return. */
  user: { id: string; email?: string | null; created_at?: string };
  /** Admin (service-role) Supabase client — bypasses RLS. Use for cross-tenant reads. */
  admin: SupabaseClient;
  /** User-scoped Supabase client — enforces RLS as the authenticated user. */
  userClient: SupabaseClient;
}

/**
 * Verify the caller's JWT. Returns either an `AuthContext` (caller is a real
 * end-user) or a 401 `Response` ready to return. Caller pattern:
 *
 *   const auth = await requireUser(req);
 *   if (auth instanceof Response) return auth;
 *   // ...auth.user.id is safe to use as auth.uid()
 */
export async function requireUser(req: Request): Promise<AuthContext | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return json({ ok: false, error: "Missing Authorization header" }, 401);
  }
  const env = getEnv();
  const userClient = createClient(env.supabaseUrl, env.anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(env.supabaseUrl, env.serviceKey);
  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }
  return { user: data.user, admin, userClient };
}

/**
 * Like `requireUser`, but ALSO accepts a request bearing the service-role key
 * directly (for cron jobs, server-to-server callers). When the service-role
 * key is presented, `user` is undefined and `mode` is `"service"`.
 */
export async function requireUserOrService(
  req: Request,
): Promise<({ mode: "user"; admin: SupabaseClient; user: AuthContext["user"]; userClient: SupabaseClient } |
            { mode: "service"; admin: SupabaseClient }) | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return json({ ok: false, error: "Missing Authorization header" }, 401);
  }
  const env = getEnv();
  const token = authHeader.slice(7).trim();
  const admin = createClient(env.supabaseUrl, env.serviceKey);
  // Service-role token presented? Trust it.
  if (token === env.serviceKey) return { mode: "service", admin };
  // Otherwise validate as a user JWT.
  const userClient = createClient(env.supabaseUrl, env.anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }
  return { mode: "user", user: data.user, admin, userClient };
}

/**
 * Resolve a user's primary org membership. Returns null if the user has no
 * org. Used for entitlement checks and for org-keyed reads.
 */
export async function resolveUserOrg(
  admin: SupabaseClient,
  userId: string,
): Promise<{ orgId: string | null; role: string | null }> {
  const { data } = await admin
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return { orgId: data?.org_id ?? null, role: data?.role ?? null };
}

/**
 * True iff the user is an org-level admin (owner or admin role on their
 * primary org) OR is a platform admin.
 */
export async function isUserAdmin(
  admin: SupabaseClient,
  userId: string,
): Promise<{ isOrgAdmin: boolean; isPlatformAdmin: boolean }> {
  const [orgMember, platformAdmin] = await Promise.all([
    admin.from("org_members").select("role").eq("user_id", userId).maybeSingle(),
    admin.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle(),
  ]);
  const isOrgAdmin = ["owner", "admin"].includes(orgMember.data?.role ?? "");
  const isPlatformAdmin = Boolean(platformAdmin.data);
  return { isOrgAdmin, isPlatformAdmin };
}
