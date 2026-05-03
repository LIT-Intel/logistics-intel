-- Pulse Lists v3 — auto-refresh + inbox.
--
-- Adds the machinery for cron-driven list refreshes that surface
-- new matches as a pending "inbox" instead of silently mutating
-- list membership. Cron-side runs are CACHE-ONLY against
-- lit_companies — Apollo (paid) discovery stays opt-in via the
-- manual Refresh button so we never burn credits on a schedule.
--
-- Additive: no changes to lit_companies, lit_saved_companies, or
-- any freight ingestion path. Builds on the v1+v2 pulse_lists
-- schema (20260502120000_pulse_saved_lists.sql,
-- 20260503100000_pulse_lists_sharing.sql).

-- ─────────────── Cron / async-HTTP extensions ───────────────
-- Required for the server-side scheduled refresh job to call
-- the pulse-refresh-lists edge function. Not invoked yet — the
-- cron.schedule() call lives outside this migration so we can
-- verify the edge fn manually before turning the schedule on.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─────────────── Auto-refresh fields on pulse_lists ───────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'pulse_refresh_cadence'
  ) THEN
    CREATE TYPE public.pulse_refresh_cadence AS ENUM ('off', 'daily', 'weekly');
  END IF;
END $$;

ALTER TABLE public.pulse_lists
  ADD COLUMN IF NOT EXISTS auto_refresh_cadence public.pulse_refresh_cadence
    NOT NULL DEFAULT 'off',
  ADD COLUMN IF NOT EXISTS last_auto_refresh_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_auto_refresh_status text,
  ADD COLUMN IF NOT EXISTS last_auto_refresh_added integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_pulse_lists_auto_refresh
  ON public.pulse_lists (auto_refresh_cadence, last_auto_refresh_at)
  WHERE auto_refresh_cadence <> 'off';

-- ─────────────── pulse_list_inbox ───────────────
-- Pending matches found by the cron job. The user accepts (move to
-- list) or dismisses each item. status is set on creation; the
-- worker upserts on (list_id, company_id) so re-runs don't pile
-- up duplicates.

CREATE TABLE IF NOT EXISTS public.pulse_list_inbox (
  list_id      uuid NOT NULL REFERENCES public.pulse_lists(id) ON DELETE CASCADE,
  company_id   uuid NOT NULL REFERENCES public.lit_companies(id) ON DELETE CASCADE,
  found_at     timestamptz NOT NULL DEFAULT now(),
  status       text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'dismissed')),
  resolved_at  timestamptz,
  resolved_by  uuid REFERENCES auth.users(id),
  -- Snapshot of what the cron found so the UI can render basic
  -- context even before the user clicks through. Capped to ~2KB.
  match_reason text,
  PRIMARY KEY (list_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_pulse_list_inbox_pending
  ON public.pulse_list_inbox (list_id, found_at DESC)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_pulse_list_inbox_company
  ON public.pulse_list_inbox (company_id);

-- ─────────────── RLS on inbox ───────────────
-- Same model as pulse_list_companies: visible to the parent list
-- owner OR an org member of a shared parent list. Mutation
-- (accept / dismiss) is owner-only.

ALTER TABLE public.pulse_list_inbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pulse_list_inbox_select ON public.pulse_list_inbox;
CREATE POLICY pulse_list_inbox_select
  ON public.pulse_list_inbox
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.pulse_lists pl
       WHERE pl.id = pulse_list_inbox.list_id
         AND (
           pl.user_id = auth.uid()
           OR (
             pl.is_shared = true
             AND pl.org_id IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM public.org_members om
                WHERE om.org_id = pl.org_id
                  AND om.user_id = auth.uid()
             )
           )
         )
    )
  );

DROP POLICY IF EXISTS pulse_list_inbox_write ON public.pulse_list_inbox;
CREATE POLICY pulse_list_inbox_write
  ON public.pulse_list_inbox
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.pulse_lists pl
       WHERE pl.id = pulse_list_inbox.list_id
         AND pl.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pulse_lists pl
       WHERE pl.id = pulse_list_inbox.list_id
         AND pl.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.pulse_list_inbox TO authenticated;
