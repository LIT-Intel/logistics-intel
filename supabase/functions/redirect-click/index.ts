// redirect-click — public click-tracking redirect.
//
// URL shape: GET /functions/v1/redirect-click?l=<slug>
//
// Per request:
//   1. Look up lit_outreach_links by slug. If missing → 404 plain text.
//   2. Increment click_count, set first_clicked_at if null,
//      set last_clicked_at = now().
//   3. If link.recipient_id is set, advance the recipient's status to
//      'clicked' and write a lit_outreach_history row (event_type='clicked').
//   4. 302 redirect to original_url.
//
// Public — no JWT required. The slug is the auth token (12-char random).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

function plain(text: string, status = 200) {
  return new Response(text, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

serve(async (req) => {
  if (req.method !== "GET") return plain("method_not_allowed", 405);

  const url = new URL(req.url);
  const slug = url.searchParams.get("l")?.trim();
  if (!slug) return plain("missing_slug", 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return plain("server_misconfigured", 500);

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: link, error } = await admin
    .from("lit_outreach_links")
    .select("id, original_url, recipient_id, campaign_id, campaign_step_id, user_id, org_id, click_count, first_clicked_at")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !link) {
    return plain("not_found", 404);
  }

  // Best-effort updates. If any of these fail we still redirect — never
  // block the user's click on a tracking write.
  try {
    const now = new Date().toISOString();
    await admin
      .from("lit_outreach_links")
      .update({
        click_count: (link.click_count ?? 0) + 1,
        first_clicked_at: link.first_clicked_at ?? now,
        last_clicked_at: now,
      })
      .eq("id", link.id);

    if (link.recipient_id) {
      // Mark recipient as clicked. Don't wipe next_send_at — the campaign
      // continues per the sequence regardless of click; analytics treats
      // clicked as a "richer than opened" engagement signal.
      await admin
        .from("lit_campaign_contacts")
        .update({ status: "clicked", updated_at: now })
        .eq("id", link.recipient_id);

      await admin.from("lit_outreach_history").insert({
        user_id: link.user_id,
        campaign_id: link.campaign_id,
        campaign_step_id: link.campaign_step_id,
        company_id: null,
        contact_id: null,
        channel: "email",
        event_type: "clicked",
        status: "clicked",
        provider: null,
        clicked_at: now,
        occurred_at: now,
        metadata: {
          link_id: link.id,
          original_url: link.original_url,
          ua: req.headers.get("user-agent") ?? null,
        },
      });
    }
  } catch (e) {
    console.error("[redirect-click] write failure", e);
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: link.original_url,
      "Cache-Control": "private, no-store",
    },
  });
});
