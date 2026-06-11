-- Fix P0 silent dispatcher bug introduced by 20260610200000.
--
-- The lit_recompute_pending_send_times trigger fired on every UPDATE to
-- lit_campaigns where scheduled_start_at IS DISTINCT FROM the prior value.
-- When the new value was NULL (or when a campaign was edited and the field
-- went from a value to NULL — e.g. updateCampaignBasics passing
-- scheduled_start_at: null to clear a previously-set schedule), the trigger
-- computed:
--     next_send_at = NULL + (delay_days||hours||minutes interval) = NULL
-- silently nulling next_send_at for every queued/pending recipient on that
-- campaign. The dispatcher filter is `lte('next_send_at', now())`, so rows
-- with NULL never get picked again — recipients silently fall off the
-- sequence after whatever step had most recently fired.
--
-- Symptom seen 2026-06-10 → 2026-06-11 on Test Campaign 1.2: step 2 fired
-- correctly via advance(), THEN the user edited the campaign at 21:37 UTC,
-- the trigger fired with NEW.scheduled_start_at = NULL, evan@'s next_send_at
-- got nulled, step 3 never fired the next morning at 07:57 UTC as scheduled.
--
-- A secondary correctness issue in the original trigger: the JOIN keyed
-- `cc.current_step_id = s.id` recomputes next_send_at using the step that
-- was just sent, not the next step to fire. Fixing the NULL guard plus
-- using the next step (current_step.step_order + 1) so the recompute
-- actually anchors to where the recipient is heading, not where they were.

CREATE OR REPLACE FUNCTION lit_recompute_pending_send_times()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Only act when scheduled_start_at actually changed.
  IF NEW.scheduled_start_at IS NOT DISTINCT FROM OLD.scheduled_start_at THEN
    RETURN NEW;
  END IF;

  -- Guard NULL anchor: clearing scheduled_start_at means "no scheduled
  -- launch anchor; use existing next_send_at as-is". Do not touch the
  -- recipient roster. This is the legacy fallback that
  -- queue-campaign-recipients uses (firstSendAtIso defaults to now() when
  -- the anchor is NULL).
  IF NEW.scheduled_start_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Recompute next_send_at for queued/pending recipients whose NEXT step
  -- (= current_step_id's step_order + 1, or step 1 if no step sent yet)
  -- still exists. Recipients who have replied, completed, failed, paused,
  -- or skipped are untouched. Recipients mid-sequence get their next
  -- pickup pushed to the new anchor + cumulative delays through the next
  -- step.
  --
  -- For recipients who have NOT yet sent a step (current_step_id IS NULL),
  -- the next step is step 1. For recipients mid-sequence, the next step
  -- is the row after current_step_id (ordered by step_order).
  WITH next_step AS (
    SELECT
      cc.id AS recipient_id,
      ns.delay_days,
      ns.delay_hours,
      ns.delay_minutes
    FROM lit_campaign_contacts cc
    LEFT JOIN lit_campaign_steps cur
      ON cur.id = cc.current_step_id
     AND cur.campaign_id = cc.campaign_id
    JOIN lit_campaign_steps ns
      ON ns.campaign_id = cc.campaign_id
     AND ns.step_order = COALESCE(cur.step_order, 0) + 1
    WHERE cc.campaign_id = NEW.id
      AND cc.status IN ('queued', 'pending')
  )
  UPDATE lit_campaign_contacts cc
  SET next_send_at = NEW.scheduled_start_at
                     + COALESCE(ns.delay_days, 0)    * interval '1 day'
                     + COALESCE(ns.delay_hours, 0)   * interval '1 hour'
                     + COALESCE(ns.delay_minutes, 0) * interval '1 minute',
      updated_at = now()
  FROM next_step ns
  WHERE cc.id = ns.recipient_id;

  RETURN NEW;
END;
$$;

-- Trigger definition itself is unchanged; the function body is replaced
-- in place via CREATE OR REPLACE above. Re-attach defensively in case a
-- previous deploy dropped it.
DROP TRIGGER IF EXISTS lit_campaigns_recompute_pending ON lit_campaigns;
CREATE TRIGGER lit_campaigns_recompute_pending
  AFTER UPDATE ON lit_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION lit_recompute_pending_send_times();
