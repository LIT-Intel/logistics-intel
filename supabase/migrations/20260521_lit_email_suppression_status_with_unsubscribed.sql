-- supabase/migrations/20260521_lit_email_suppression_status_with_unsubscribed.sql
-- Extend the existing suppression-status RPC to also report cross-campaign
-- unsubscribes from lit_email_preferences.unsubscribed_all. The campaign
-- dispatcher already reads this RPC's columns; the new `unsubscribed`
-- column means recipients who one-click-unsub from one campaign will now
-- be blocked across all campaigns automatically.
--
-- Postgres requires DROP+CREATE when the return-row shape changes.
-- Callers using positional access keep the existing 3 booleans in the
-- same order; the new `unsubscribed` column is appended at the end.

DROP FUNCTION IF EXISTS public.lit_email_suppression_status(text);

CREATE FUNCTION public.lit_email_suppression_status(p_email text)
RETURNS TABLE(
  converted boolean,
  bounced boolean,
  complained boolean,
  unsubscribed boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select
    exists(
      select 1 from public.profiles
      where lower(email) = lower(p_email)
    ) as converted,
    exists(
      select 1 from public.lit_resend_events
      where lower(email_to) = lower(p_email)
        and event_type = 'bounced'
    ) as bounced,
    exists(
      select 1 from public.lit_resend_events
      where lower(email_to) = lower(p_email)
        and event_type = 'complained'
    ) as complained,
    exists(
      select 1 from public.lit_email_preferences
      where lower(email) = lower(p_email)
        and unsubscribed_all = true
    ) as unsubscribed;
$function$;
