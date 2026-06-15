-- 20260611150000_backfill_orphan_outreach_history_attribution.sql
-- Sub-project L follow-up — backfill rows in lit_outreach_history whose
-- campaign_id is NULL but a prior 'sent' row to the same recipient (within
-- 7 days) DOES carry a campaign_id. Applies to both reply rows
-- (status='replied') and meeting_booked rows where the earlier
-- organizer-only backfill came up dry.
--
-- lit_outreach_history has no org_id column on this project, so this only
-- backfills campaign_id / contact_id / company_id (and stamps the
-- attribution_path on metadata for auditability).
--
-- Pairs with cal-webhook v4 which adds a booker_contact_match strategy so
-- future bookings won't need this kind of catch-up backfill.

WITH match_source AS (
  SELECT DISTINCT ON (orphan.id)
    orphan.id               AS orphan_id,
    sent_row.campaign_id    AS new_campaign_id,
    sent_row.contact_id     AS new_contact_id,
    sent_row.company_id     AS new_company_id,
    sent_row.metadata->>'recipient_id' AS new_recipient_id
  FROM lit_outreach_history orphan
  JOIN lit_outreach_history sent_row
    ON sent_row.event_type = 'sent'
   AND sent_row.campaign_id IS NOT NULL
   AND sent_row.metadata->>'recipient_email' = orphan.metadata->>'recipient_email'
   AND sent_row.occurred_at < orphan.occurred_at
   AND sent_row.occurred_at > orphan.occurred_at - interval '7 days'
  WHERE orphan.campaign_id IS NULL
    AND (
      orphan.status   = 'replied'
      OR orphan.event_type IN ('meeting_booked','meeting_rescheduled','meeting_cancelled')
    )
  ORDER BY orphan.id, sent_row.occurred_at DESC
)
UPDATE lit_outreach_history h
SET campaign_id = ms.new_campaign_id,
    contact_id  = COALESCE(h.contact_id, ms.new_contact_id),
    company_id  = COALESCE(h.company_id, ms.new_company_id),
    metadata    = COALESCE(h.metadata, '{}'::jsonb)
                || jsonb_build_object(
                     'recipient_id', COALESCE(h.metadata->>'recipient_id', ms.new_recipient_id),
                     'attribution_path', 'backfill_recipient_email_match',
                     'matched_via', 'backfill_recipient_email_match'
                   )
FROM match_source ms
WHERE h.id = ms.orphan_id;
