-- Sub-project O — conditional follow-up triggers
-- A trigger row says: "at time T, evaluate condition against the recipients of
-- primary_campaign_id. For each match, enroll them in followup_campaign_id."
-- Currently supported condition kinds:
--   - clicked_url_no_meeting: recipient has a 'clicked' row with metadata.url
--     matching url_pattern (LIKE), and has NO 'meeting_booked' or
--     'meeting_rescheduled' row in lit_outreach_history for the same email.

CREATE TABLE IF NOT EXISTS public.lit_conditional_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_campaign_id uuid NOT NULL REFERENCES public.lit_campaigns(id) ON DELETE CASCADE,
  followup_campaign_id uuid NOT NULL REFERENCES public.lit_campaigns(id) ON DELETE CASCADE,
  condition jsonb NOT NULL,
  trigger_at timestamptz NOT NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.lit_conditional_followups IS
  'Sub-project O: conditional follow-up triggers. At trigger_at, the process-conditional-followups edge function evaluates `condition` against primary_campaign_id''s recipients and enrolls matches into followup_campaign_id. Idempotent — re-running will not double-enroll.';

CREATE INDEX IF NOT EXISTS lit_conditional_followups_pending_idx
  ON public.lit_conditional_followups (trigger_at)
  WHERE processed_at IS NULL;

ALTER TABLE public.lit_conditional_followups ENABLE ROW LEVEL SECURITY;

-- Only service role + platform admins can read/write directly. Edge fn uses service role.
CREATE POLICY "platform_admin_read_lit_conditional_followups"
  ON public.lit_conditional_followups
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
  );

CREATE POLICY "platform_admin_write_lit_conditional_followups"
  ON public.lit_conditional_followups
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
  );
