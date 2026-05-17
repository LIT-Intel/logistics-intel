// Shared cron-auth helper: verifies the X-Internal-Cron header against
// LIT_CRON_SECRET. Used by pulse-refresh-tick, pulse-alert-digest, and
// freightos-benchmark-sync (any edge fn invoked by pg_cron + pg_net).

export function verifyCronAuth(req: Request): { ok: true } | { ok: false; response: Response } {
  const expected = Deno.env.get("LIT_CRON_SECRET") || "";
  const provided = req.headers.get("X-Internal-Cron") || "";
  if (!expected) {
    console.error("[cron-auth] LIT_CRON_SECRET env var is not set");
    return { ok: false, response: new Response("server misconfigured", { status: 500 }) };
  }
  if (provided !== expected) {
    return { ok: false, response: new Response("forbidden", { status: 403 }) };
  }
  return { ok: true };
}
