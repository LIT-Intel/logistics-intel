-- 2026-06-10 — Backfill campaign_id on orphaned engagement rows.
-- Root cause: engagement-tracking writers (resend-webhook, reply-receiver,
-- track-open, etc.) historically wrote opened/clicked/replied/bounced rows
-- to lit_outreach_history but didn't backfill campaign_id from the
-- originating 'sent' row. The funnel view filters on h.campaign_id = c.id,
-- so every per-campaign KPI showed 0% engagement system-wide.
--
-- Joins on several keys because different writers populate different
-- attribution paths historically:
--   1. Top-level message_id column ↔ sent row's message_id
--   2. metadata->>'message_id' ↔ sent row's metadata->>'message_id'
--   3. metadata->>'link_id' ↔ lit_outreach_links.id (most reliable for clicks)
--   4. metadata->>'recipient_id' ↔ lit_campaign_contacts.id → campaign_id
--
-- Single transaction; each pass is idempotent (only updates where
-- campaign_id IS NULL after prior passes).
-- Note: lit_outreach_history has no org_id column — org attribution
-- lives via campaign_id → lit_campaigns.org_id.

BEGIN;

-- Pass 1: join by top-level message_id column
UPDATE public.lit_outreach_history e
   SET campaign_id = s.campaign_id
  FROM public.lit_outreach_history s
 WHERE e.campaign_id IS NULL
   AND e.event_type IN ('opened', 'clicked', 'replied', 'bounced')
   AND s.event_type = 'sent'
   AND s.campaign_id IS NOT NULL
   AND s.message_id IS NOT NULL
   AND e.message_id IS NOT NULL
   AND s.message_id = e.message_id;

-- Pass 2: join by metadata->>'message_id' for older writers
UPDATE public.lit_outreach_history e
   SET campaign_id = s.campaign_id
  FROM public.lit_outreach_history s
 WHERE e.campaign_id IS NULL
   AND e.event_type IN ('opened', 'clicked', 'replied', 'bounced')
   AND s.event_type = 'sent'
   AND s.campaign_id IS NOT NULL
   AND s.metadata ? 'message_id'
   AND e.metadata ? 'message_id'
   AND s.metadata->>'message_id' = e.metadata->>'message_id';

-- Pass 3: clicked rows carry metadata.link_id which maps to lit_outreach_links
UPDATE public.lit_outreach_history e
   SET campaign_id = l.campaign_id
  FROM public.lit_outreach_links l
 WHERE e.campaign_id IS NULL
   AND e.event_type = 'clicked'
   AND e.metadata ? 'link_id'
   AND l.campaign_id IS NOT NULL
   AND l.id::text = e.metadata->>'link_id';

-- Pass 4: most rows carry metadata.recipient_id which is a
-- lit_campaign_contacts.id → campaign_id
UPDATE public.lit_outreach_history e
   SET campaign_id = c.campaign_id
  FROM public.lit_campaign_contacts c
 WHERE e.campaign_id IS NULL
   AND e.event_type IN ('opened', 'clicked', 'replied', 'bounced')
   AND e.metadata ? 'recipient_id'
   AND c.campaign_id IS NOT NULL
   AND c.id::text = e.metadata->>'recipient_id';

COMMIT;
