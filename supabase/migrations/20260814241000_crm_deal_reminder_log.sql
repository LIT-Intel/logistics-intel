-- Ledger for the crm-deal-reminders email digest edge fn.
--
-- One row per (owner, deal, alert kind) each time that deal is INCLUDED in a
-- reminder email. The edge fn checks this table before sending so a given deal
-- in a given at-risk state is not re-emailed within 24h (guards against the
-- daily cron double-firing / manual re-runs). It's a log, not a queue — the
-- edge fn writes a row per included deal after a successful send.
--
-- kind mirrors the notification kinds: 'deal_stale' | 'deal_closing_soon' |
-- 'deal_overdue'. Service-role only (written by the edge fn); no RLS grants to
-- authenticated — end users never read it.

BEGIN;

CREATE TABLE IF NOT EXISTS public.lit_crm_reminder_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  org_id      uuid,
  deal_id     uuid NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('deal_stale','deal_closing_soon','deal_overdue')),
  sent_at     timestamptz NOT NULL DEFAULT now()
);

-- Fast "did we already email this owner about this deal+kind recently?" lookup.
CREATE INDEX IF NOT EXISTS lit_crm_reminder_log_lookup_idx
  ON public.lit_crm_reminder_log (user_id, deal_id, kind, sent_at DESC);

ALTER TABLE public.lit_crm_reminder_log ENABLE ROW LEVEL SECURITY;
-- No policies => only service_role (which bypasses RLS) can read/write. The
-- edge fn runs with the service-role key.

COMMIT;
