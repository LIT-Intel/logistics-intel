-- Sub-project O — Sequence Exit Conditions
-- Adds org-wide exit settings, per-campaign override jsonb, and effective-rules
-- helper function. Five trigger paths (reply, bounce, unsubscribe, meeting,
-- attio-won) each flip recipient.status to a terminal value + null
-- next_send_at; the dispatcher's existing WHERE status IN ('queued','pending')
-- filter does the rest. No dispatcher code change required.

CREATE TABLE IF NOT EXISTS lit_org_exit_settings (
  org_id uuid PRIMARY KEY,
  exit_on_reply boolean NOT NULL DEFAULT true,
  exit_on_bounce boolean NOT NULL DEFAULT true,
  exit_on_unsubscribe boolean NOT NULL DEFAULT true,
  exit_on_meeting_booked boolean NOT NULL DEFAULT true,
  exit_on_attio_won boolean NOT NULL DEFAULT true,
  attio_won_stages text[] NOT NULL DEFAULT ARRAY['Won','Closed Won','Customer']::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE lit_campaigns
  ADD COLUMN IF NOT EXISTS exit_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION lit_effective_exit_rules(p_campaign_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  campaign_row lit_campaigns;
  org_rules jsonb;
  overrides jsonb;
BEGIN
  SELECT * INTO campaign_row FROM lit_campaigns WHERE id = p_campaign_id;
  IF campaign_row.id IS NULL THEN RETURN '{}'::jsonb; END IF;

  SELECT to_jsonb(s) INTO org_rules
  FROM lit_org_exit_settings s
  WHERE s.org_id = campaign_row.org_id;

  -- Lazy-create on first read
  IF org_rules IS NULL AND campaign_row.org_id IS NOT NULL THEN
    INSERT INTO lit_org_exit_settings (org_id) VALUES (campaign_row.org_id)
      ON CONFLICT (org_id) DO NOTHING;
    SELECT to_jsonb(s) INTO org_rules FROM lit_org_exit_settings s WHERE s.org_id = campaign_row.org_id;
  END IF;

  IF org_rules IS NULL THEN
    -- No org_id on campaign — return defaults so triggers still behave
    org_rules := jsonb_build_object(
      'exit_on_reply', true,
      'exit_on_bounce', true,
      'exit_on_unsubscribe', true,
      'exit_on_meeting_booked', true,
      'exit_on_attio_won', true,
      'attio_won_stages', ARRAY['Won','Closed Won','Customer']
    );
  END IF;

  overrides := COALESCE(campaign_row.exit_overrides, '{}'::jsonb);
  RETURN org_rules || overrides;  -- override wins via jsonb concat
END;
$$;

-- RLS on lit_org_exit_settings
ALTER TABLE lit_org_exit_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members read own exit settings" ON lit_org_exit_settings;
CREATE POLICY "org members read own exit settings"
  ON lit_org_exit_settings FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND status='active'));

DROP POLICY IF EXISTS "org owners write exit settings" ON lit_org_exit_settings;
CREATE POLICY "org owners write exit settings"
  ON lit_org_exit_settings FOR ALL
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner','admin') AND status='active'))
  WITH CHECK (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner','admin') AND status='active'));

-- Grant function execute to authenticated + service_role
GRANT EXECUTE ON FUNCTION lit_effective_exit_rules(uuid) TO authenticated, service_role;
