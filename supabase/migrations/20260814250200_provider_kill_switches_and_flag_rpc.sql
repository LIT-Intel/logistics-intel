-- Phase 2A (data-economics): DB-controlled kill switches for provider access + background refresh.
-- Reuse existing lit_feature_flags (scope='global', global_kill toggles the switch).
-- A row present with global_kill=false => ENABLED. global_kill=true => killed. Absent => default enabled.
insert into public.lit_feature_flags (key, label, description, scope, global_kill, rollout, owner)
values
  ('IMPORTYETI_ENABLED',
   'ImportYeti provider enabled',
   'Global kill switch for all ImportYeti provider calls. Set global_kill=true to disable ImportYeti entirely. Checked by Phase 2B gateway via lit_provider_flag().',
   'global', false, 100, 'platform'),
  ('IMPORTYETI_BACKGROUND_REFRESH_ENABLED',
   'ImportYeti background refresh enabled',
   'Global kill switch for background/cron ImportYeti refresh (pulse_refresh, lane_refresh, company_refresh triggered by cron/background). Set global_kill=true to pause background spend without blocking user-initiated calls.',
   'global', false, 100, 'platform')
on conflict (key) do nothing;

-- Cheap SECURITY DEFINER helper for edge functions: returns TRUE unless the flag
-- row exists AND is killed. Defaults to TRUE when the key is unset (fail-open by design:
-- absence must not silently disable the provider).
create or replace function public.lit_provider_flag(p_key text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select not global_kill from public.lit_feature_flags where key = p_key),
    true
  );
$$;

comment on function public.lit_provider_flag(text) is
  'Phase 2A: returns TRUE if provider flag is enabled (or unset). global_kill=true => FALSE. Fail-open on missing key.';

revoke all on function public.lit_provider_flag(text) from public;
grant execute on function public.lit_provider_flag(text) to authenticated, service_role, anon;
