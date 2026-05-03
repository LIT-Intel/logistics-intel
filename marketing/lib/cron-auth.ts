import type { NextRequest } from "next/server";

/**
 * Verifies that a cron endpoint was hit either by Vercel's internal cron
 * runner OR by an authorized caller bearing the CRON_SECRET. Both paths
 * must work — Vercel sets a header, manual triggers use a Bearer token.
 *
 * Returns null on success, or a Response on failure (caller can return
 * directly: `const auth = checkCron(req); if (auth) return auth;`).
 */
export function checkCron(req: NextRequest): Response | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return new Response(JSON.stringify({ error: "cron_secret_unset" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }
  // Vercel cron sets `Authorization: Bearer ${process.env.CRON_SECRET}` on the
  // request automatically when the path is in vercel.json crons.
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${expected}`) return null;
  // Also allow ?secret= for ad-hoc triggers from a browser/curl
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret && secret === expected) return null;
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}
