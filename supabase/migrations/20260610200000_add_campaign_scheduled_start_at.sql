-- Sub-project J: persist campaign launch time
-- (1) Two columns on lit_campaigns
ALTER TABLE lit_campaigns
  ADD COLUMN IF NOT EXISTS scheduled_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS send_timezone text NOT NULL DEFAULT 'UTC';

COMMENT ON COLUMN lit_campaigns.scheduled_start_at IS
  'Absolute launch anchor. Step N send time = scheduled_start_at + cumulative step delays. NULL = launch immediately on click (legacy fallback).';
COMMENT ON COLUMN lit_campaigns.send_timezone IS
  'IANA TZ for display only. Persistence is always UTC.';

-- (2) Trigger: when scheduled_start_at changes, recompute next_send_at
--     for queued/pending recipients only (Q3=A — sent rows untouched).
CREATE OR REPLACE FUNCTION lit_recompute_pending_send_times()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.scheduled_start_at IS DISTINCT FROM OLD.scheduled_start_at THEN
    UPDATE lit_campaign_contacts cc
    SET next_send_at = NEW.scheduled_start_at
                       + COALESCE(s.delay_days, 0)    * interval '1 day'
                       + COALESCE(s.delay_hours, 0)   * interval '1 hour'
                       + COALESCE(s.delay_minutes, 0) * interval '1 minute',
        updated_at = now()
    FROM lit_campaign_steps s
    WHERE cc.campaign_id = NEW.id
      AND cc.status IN ('queued', 'pending')
      AND cc.current_step_id = s.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lit_campaigns_recompute_pending ON lit_campaigns;
CREATE TRIGGER lit_campaigns_recompute_pending
  AFTER UPDATE ON lit_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION lit_recompute_pending_send_times();
