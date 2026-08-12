// marketing-cron-relay — lets pg_cron drive the marketing site's cron
// routes at sub-daily cadence (Vercel Hobby caps native crons at daily).
//
// Chain: pg_cron (vault LIT_CRON_SECRET, X-Internal-Cron header)
//   → this fn (verifies the secret; natively holds the service-role key)
//   → https://logisticintel.com/api/cron/<path> with x-lit-cron header
//   → route verifies x-lit-cron against its own SUPABASE_SERVICE_ROLE_KEY.
// No new secrets anywhere; both ends already hold the shared key.
//
// Body: { "path": "lead-sequence-dispatch" } — whitelisted paths only.

const ALLOWED_PATHS = new Set([
  "lead-sequence-dispatch",
  "weekly-nurture-enroll",
  "engagement-branch",
  "email-autogen",
]);

const MARKETING_BASE = "https://logisticintel.com/api/cron";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const cronSecret = Deno.env.get("LIT_CRON_SECRET");
  if (!cronSecret) return json({ error: "cron_secret_unset" }, 503);
  if (req.headers.get("x-internal-cron") !== cronSecret) {
    return json({ error: "unauthorized" }, 401);
  }

  let path = "";
  try {
    const body = await req.json();
    path = String(body?.path || "");
  } catch {
    /* empty body */
  }
  if (!ALLOWED_PATHS.has(path)) return json({ error: "unknown_path", path }, 400);

  try {
    // Forward the already-verified LIT_CRON_SECRET — the marketing route
    // compares it against its own LIT_CRON_SECRET env var.
    const res = await fetch(`${MARKETING_BASE}/${path}`, {
      method: "GET",
      headers: { "X-Internal-Cron": cronSecret },
      signal: AbortSignal.timeout(55000),
    });
    const text = await res.text();
    console.log(`[marketing-cron-relay] ${path} -> ${res.status} ${text.slice(0, 200)}`);
    return json({ ok: res.ok, path, upstream_status: res.status, upstream: text.slice(0, 500) }, res.ok ? 200 : 502);
  } catch (e) {
    console.error(`[marketing-cron-relay] ${path} failed`, String(e));
    return json({ ok: false, path, error: String(e).slice(0, 300) }, 502);
  }
});
