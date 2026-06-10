// redirect-click — public click-tracking redirect.
//
// URL shape: GET /functions/v1/redirect-click?l=<slug>
//
// Per request:
//   1. Look up lit_outreach_links by slug. If missing → 404 plain text.
//   2. Increment click_count, set first_clicked_at if null,
//      set last_clicked_at = now().
//   3. Insert a lit_outreach_history row event_type='clicked' (deduped
//      per recipient+step+slug so refreshes don't inflate the count).
//   4. 302 redirect to original_url.
//
// Recipient.status is intentionally NOT mutated — that field is the
// dispatcher's state machine. Engagement signals live in history.
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
      // Dedupe history rows on (recipient + step + link slug) so the
      // analytics count doesn't double-count refreshes / link previews.
      const { data: existing } = await admin
        .from("lit_outreach_history")
        .select("id")
        .eq("campaign_id", link.campaign_id)
        .eq("event_type", "clicked")
        .filter("metadata->>link_id", "eq", link.id)
        .limit(1)
        .maybeSingle();
      if (!existing) {
        // Look up the recipient row so the click history carries readable
        // attribution (recipient_email + company_id) in metadata instead
        // of NULL in the analytics activity feed.
        // Best-effort — falls through to NULL on lookup failure rather than
        // blocking the click.
        //
        // NOTE: contact_id is intentionally NOT set on the insert.
        // lit_outreach_history.contact_id FK targets lit_contacts.id, but
        // link.recipient_id is a lit_campaign_contacts.id — different table.
        // Setting it triggered lit_outreach_history_contact_id_fkey
        // violations on every click, silently breaking all click tracking.
        // Recipient attribution lives in metadata.recipient_id which the
        // engagement drill-in already uses.
        let recipientEmail: string | null = null;
        let companyId: string | null = null;
        try {
          const { data: contact } = await admin
            .from("lit_campaign_contacts")
            .select("id, email, company_id")
            .eq("id", link.recipient_id)
            .maybeSingle();
          if (contact) {
            recipientEmail = (contact.email as string | null) ?? null;
            companyId = (contact.company_id as string | null) ?? null;
          }
        } catch (lookupErr) {
          console.error("[redirect-click] contact lookup failed", lookupErr);
        }

        await admin
          .from("lit_outreach_history")
          .insert({
            user_id: link.user_id,
            campaign_id: link.campaign_id,
            campaign_step_id: link.campaign_step_id,
            company_id: companyId,
            channel: "email",
            event_type: "clicked",
            status: "clicked",
            provider: null,
            clicked_at: now,
            occurred_at: now,
            metadata: {
              link_id: link.id,
              recipient_id: link.recipient_id,
              recipient_email: recipientEmail,
              original_url: link.original_url,
              ua: req.headers.get("user-agent") ?? null,
            },
          })
          .throwOnError();
      }
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
