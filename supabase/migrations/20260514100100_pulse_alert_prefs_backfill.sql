-- Seed lit_user_alert_prefs for every existing auth.users row so the
-- pulse-alert-digest fn always finds a prefs row (or treats missing as defaults).
-- Also generate a hex unsubscribe token per user (48-char hex, URL-safe by default).
-- Note: 'hex' encoding used instead of 'base64url' (PG 18+ only) for PG 17 compat.

BEGIN;

INSERT INTO public.lit_user_alert_prefs (user_id, unsubscribe_token)
SELECT u.id, encode(gen_random_bytes(24), 'hex')
FROM auth.users u
LEFT JOIN public.lit_user_alert_prefs p ON p.user_id = u.id
WHERE p.user_id IS NULL;

-- Backfill any token-less existing rows.
UPDATE public.lit_user_alert_prefs
SET unsubscribe_token = encode(gen_random_bytes(24), 'hex')
WHERE unsubscribe_token IS NULL;

COMMIT;
