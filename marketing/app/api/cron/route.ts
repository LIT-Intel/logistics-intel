import { NextRequest } from "next/server";
import { checkCron } from "@/lib/cron-auth";
import { hasClaude } from "@/lib/anthropic";
import { hasSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * /api/cron — admin index. Lists every agent endpoint and the env
 * dependencies it has. Hitting this with a valid CRON_SECRET returns a
 * status snapshot you can watch from a dashboard or terminal:
 *
 *     curl -H "Authorization: Bearer $CRON_SECRET" \
 *       https://lit-marketing.vercel.app/api/cron
 */
export async function GET(req: NextRequest) {
  const auth = checkCron(req);
  if (auth) return auth;

  const status = {
    timestamp: new Date().toISOString(),
    runtime: {
      anthropicKey: hasClaude(),
      supabase: hasSupabase(),
      sanityWriteToken: Boolean(process.env.SANITY_API_WRITE_TOKEN),
      cronSecret: Boolean(process.env.CRON_SECRET),
    },
    agents: [
      { name: "trade-lane-refresh", schedule: "daily 02:00 UTC", deps: ["supabase", "sanity-write"] },
      { name: "blog-drafter", schedule: "Mondays 06:00 UTC", deps: ["claude", "sanity-write"] },
      { name: "glossary-expander", schedule: "Wednesdays 06:00 UTC", deps: ["claude", "sanity-write"] },
      { name: "news-watcher", schedule: "daily (was hourly on Pro)", deps: ["claude", "sanity-write"] },
      { name: "internal-linking", schedule: "daily 03:00 UTC", deps: ["sanity-write"] },
      { name: "seo-audit", schedule: "Sundays 06:00 UTC", deps: ["sanity-write"] },
      { name: "comparison-refresh", schedule: "1st of month 08:00 UTC", deps: ["claude", "sanity-write"] },
      { name: "press-citations", schedule: "daily 04:00 UTC", deps: ["sanity-write"] },
    ],
    note:
      "Hobby plan blocks <daily crons. Trigger manually: curl -H 'Authorization: Bearer $CRON_SECRET' https://lit-marketing.vercel.app/api/cron/<agent-name>",
  };
  return new Response(JSON.stringify(status, null, 2), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
