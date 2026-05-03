-- Pulse Library digest — per-user email preferences.
--
-- Phase B of the auto-refresh inbox: users who opted in get a daily
-- (or weekly) email summarizing new matches across their lists. The
-- digest worker reads this table to know who to send to and how
-- often.
--
-- Default is opt-OUT. Users explicitly enable from the Pulse Library
-- toolbar.

CREATE TABLE IF NOT EXISTS public.pulse_digest_prefs (
  user_id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled        boolean NOT NULL DEFAULT false,
  cadence        public.pulse_refresh_cadence NOT NULL DEFAULT 'daily',
  last_digest_at timestamptz,
  -- Last status the worker stamped — surfaced in the UI so the user
  -- knows whether their last attempt actually went out.
  last_status    text,
  -- How many lists / matches were in the most recent digest.
  last_lists_count   integer NOT NULL DEFAULT 0,
  last_matches_count integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pulse_digest_prefs_enabled
  ON public.pulse_digest_prefs (enabled, last_digest_at)
  WHERE enabled = true;

-- ─────────── updated_at trigger ───────────

CREATE OR REPLACE FUNCTION public.touch_pulse_digest_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pulse_digest_prefs_updated_at ON public.pulse_digest_prefs;
CREATE TRIGGER trg_pulse_digest_prefs_updated_at
BEFORE UPDATE ON public.pulse_digest_prefs
FOR EACH ROW EXECUTE FUNCTION public.touch_pulse_digest_updated_at();

-- ─────────── RLS ───────────

ALTER TABLE public.pulse_digest_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pulse_digest_prefs_owner_all ON public.pulse_digest_prefs;
CREATE POLICY pulse_digest_prefs_owner_all
  ON public.pulse_digest_prefs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.pulse_digest_prefs TO authenticated;
