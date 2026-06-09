-- Add expires_at to lit_outreach_safety_holds so operational holds
-- can't silently block production indefinitely.
BEGIN;
ALTER TABLE public.lit_outreach_safety_holds
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;
COMMENT ON COLUMN public.lit_outreach_safety_holds.expires_at IS
  'Optional auto-expire timestamp. NULL = no auto-expire. Dispatcher treats holds as cleared once expires_at < now().';
UPDATE public.lit_outreach_safety_holds
   SET expires_at = created_at + interval '24 hours'
 WHERE cleared_at IS NULL AND expires_at IS NULL;
COMMIT;
