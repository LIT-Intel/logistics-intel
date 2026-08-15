-- 20260814290000_lit_admin_provider_flag_rpcs.sql
-- Admin Data Economics: read + toggle the ImportYeti provider kill switches from
-- the Admin Command Deck (Revenue -> Data Economics tab).
--
-- Model: `lit_feature_flags.global_kill = true` means the feature is KILLED.
-- The UI presents an "enabled" toggle, so enabled = NOT global_kill.
-- Setting enabled = true  -> global_kill = false
-- Setting enabled = false -> global_kill = true
--
-- Both functions are SECURITY DEFINER and self-gate on is_platform_admin(auth.uid())
-- as defense-in-depth (the surface is already admin-only in the UI).
-- Additive + non-destructive.

-- Read current enabled state for both provider flags.
create or replace function public.lit_admin_get_provider_flags()
returns table(key text, label text, enabled boolean, updated_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    f.key,
    f.label,
    (f.global_kill is not true) as enabled,
    f.updated_at
  from public.lit_feature_flags f
  where f.key in ('IMPORTYETI_ENABLED', 'IMPORTYETI_BACKGROUND_REFRESH_ENABLED')
    and public.is_platform_admin(auth.uid())
  order by f.key;
$function$;

-- Flip a provider kill switch. Returns the new enabled state for the key.
create or replace function public.lit_admin_set_provider_flag(p_key text, p_enabled boolean)
returns table(key text, label text, enabled boolean, updated_at timestamptz)
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not authorized';
  end if;

  if p_key not in ('IMPORTYETI_ENABLED', 'IMPORTYETI_BACKGROUND_REFRESH_ENABLED') then
    raise exception 'unknown provider flag: %', p_key;
  end if;

  update public.lit_feature_flags f
     set global_kill = (p_enabled is not true),
         updated_at  = now()
   where f.key = p_key;

  if not found then
    raise exception 'provider flag not found: %', p_key;
  end if;

  return query
    select f.key, f.label, (f.global_kill is not true) as enabled, f.updated_at
    from public.lit_feature_flags f
    where f.key = p_key;
end;
$function$;

revoke all on function public.lit_admin_get_provider_flags() from public, anon;
revoke all on function public.lit_admin_set_provider_flag(text, boolean) from public, anon;
grant execute on function public.lit_admin_get_provider_flags() to authenticated;
grant execute on function public.lit_admin_set_provider_flag(text, boolean) to authenticated;
