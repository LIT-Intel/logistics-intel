-- Sub-project L — backfill the 2 known orphan meeting_booked rows.
--
-- These bookings landed before cal-webhook v3 shipped, so they have
-- campaign_id=NULL. Both bookings are for sales@logisticintel.com on
-- the calendar owned by vraymond@sparkfusiondigital.com (user_id
-- 79c81c33-3321-4e56-a442-80c74bb887b8). The organizer's most-recent
-- active campaign is 'Test Campaign 1.2' (cdc8aaf6-79ef-4ead-8672-5d7941b31a03).
--
-- This is the same logic cal-webhook v3 now applies live: organizer_match
-- to the user's most-recent active|draft campaign. Stamps attribution_path
-- so the backfilled row is auditable.

UPDATE lit_outreach_history h
SET
  campaign_id = c.id,
  metadata = jsonb_set(
    jsonb_set(
      coalesce(h.metadata, '{}'::jsonb),
      '{attribution_path}', '"organizer_match_backfill"'::jsonb, true
    ),
    '{matched_via}', '"organizer_backfill"'::jsonb, true
  )
FROM lit_campaigns c
WHERE h.event_type = 'meeting_booked'
  AND h.campaign_id IS NULL
  AND h.user_id = '79c81c33-3321-4e56-a442-80c74bb887b8'
  AND c.user_id = h.user_id
  AND c.status IN ('active','draft')
  AND c.id = (
    SELECT id FROM lit_campaigns
    WHERE user_id = '79c81c33-3321-4e56-a442-80c74bb887b8'
      AND status IN ('active','draft')
    ORDER BY created_at DESC
    LIMIT 1
  );
