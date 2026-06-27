import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger, requestId } from "../_shared/logger.ts";
import { resolveOrg, numOrNull } from "../_shared/quote_helpers.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const MAX_IMAGE_CHARS = 700_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
  const log = createLogger("quote-settings-update", { request_id: requestId() });

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ ok: false, code: "UNAUTHORIZED" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const admin = createClient(url, svc);
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return json({ ok: false, code: "UNAUTHORIZED" }, 401);
  const userId = u.user.id;

  const orgId = await resolveOrg(admin, userId);
  if (!orgId) return json({ ok: false, code: "NO_ORG" }, 403);

  // Org branding is admin-only: caller must be an org owner/admin (active member
  // of THIS org) OR a platform admin. Inlined (instead of _shared/auth.ts's
  // isUserAdmin) to avoid crossing the supabase-js version boundary and to scope
  // the org-admin check to the resolved org rather than the user's primary row.
  const [platformAdmin, orgMember] = await Promise.all([
    admin.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle(),
    admin.from("org_members").select("role").eq("user_id", userId).eq("org_id", orgId).eq("status", "active").maybeSingle(),
  ]);
  const isPlatformAdmin = Boolean(platformAdmin.data);
  const isOrgAdmin = ["owner", "admin"].includes(orgMember.data?.role ?? "");
  if (!isOrgAdmin && !isPlatformAdmin) return json({ ok: false, code: "FORBIDDEN" }, 403);

  const body = await req.json().catch(() => ({}));
  const raw = body?.settings;
  // Reject arrays / null / non-objects — quote_defaults must be a plain object.
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return json({ ok: false, code: "INVALID_INPUT", message: "settings must be a plain object" }, 400);
  }
  const settings: Record<string, unknown> = { ...(raw as Record<string, unknown>) };

  // Cap base64 data-URI images so we don't bloat the row.
  for (const key of ["logo_url", "signature_url"]) {
    const v = settings[key];
    if (typeof v === "string" && v.length > MAX_IMAGE_CHARS) {
      return json({ ok: false, code: "IMAGE_TOO_LARGE", message: `${key} exceeds ${MAX_IMAGE_CHARS} chars` }, 413);
    }
  }

  // Numeric guard for fuel surcharge: empty string / NaN → omit.
  if ("default_fuel_surcharge_pct" in settings) {
    const n = numOrNull(settings.default_fuel_surcharge_pct);
    if (n === null) delete settings.default_fuel_surcharge_pct;
    else settings.default_fuel_surcharge_pct = n;
  }

  const { data: saved, error } = await admin.from("org_settings")
    .upsert({ org_id: orgId, quote_defaults: settings, updated_at: new Date().toISOString() }, { onConflict: "org_id" })
    .select("quote_defaults").single();
  if (error) { log.error("settings_upsert_failed", { err: error.message, org_id: orgId }); return json({ ok: false, code: "UPDATE_FAILED" }, 500); }

  return json({ ok: true, data: { settings: saved?.quote_defaults ?? settings } });
});
