-- Email preference center storage.
--
-- One row per recipient email (case-folded lowercase). The four sequence
-- toggles default to true so a lead who never visited the preferences
-- page is treated as opted-in to the sequence they signed up for —
-- existing nurture rows enqueued in `lit_lead_sequence_queue` keep
-- flowing. A row only gets created the first time a recipient opens
-- /email-preferences and saves. `unsubscribed_all` is the master kill
-- switch — when true, NO marketing email goes out regardless of the
-- per-sequence flags.
--
-- RLS: service-role only. The marketing preference page and cron worker
-- both touch this table via SUPABASE_SERVICE_ROLE_KEY; anon must never
-- read other leads' preferences.

create table if not exists public.lit_email_preferences (
  email text primary key,
  trial_welcome boolean not null default true,
  top_100_followup boolean not null default true,
  partner_onboarding boolean not null default true,
  comparison_nurture boolean not null default true,
  unsubscribed_all boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.lit_email_preferences enable row level security;

drop policy if exists "service role manages preferences" on public.lit_email_preferences;
create policy "service role manages preferences"
  on public.lit_email_preferences
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Suppression check used by the cron dispatcher. Returns true if the
-- given email should NOT receive a send of the given sequence_key —
-- either because they opted out of ALL marketing or just that one
-- sequence. SECURITY DEFINER so the anon-keyed cron (or any other
-- caller) can invoke it without table-level SELECT grants on
-- lit_email_preferences (which is service-role-only by RLS).
create or replace function public.lit_email_is_unsubscribed(
  p_email text,
  p_sequence_key text
) returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (select unsubscribed_all from public.lit_email_preferences where email = lower(p_email)),
    false
  )
  or coalesce(
    (
      select case p_sequence_key
        when 'trial-welcome' then not trial_welcome
        when 'top-100-followup' then not top_100_followup
        when 'partner-onboarding' then not partner_onboarding
        when 'comparison-nurture' then not comparison_nurture
        else false
      end
      from public.lit_email_preferences where email = lower(p_email)
    ),
    false
  );
$$;

grant execute on function public.lit_email_is_unsubscribed(text, text) to anon, authenticated, service_role;
