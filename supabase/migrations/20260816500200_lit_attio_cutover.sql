-- Lead-CRM Phase 4 — Part 3: ATTIO CUTOVER kill-switch.
--
-- One config flag the owner flips to STOP pushing to Attio once migrated onto
-- LIT's own CRM. Stored in lit_internal_meta under key 'attio_sync_enabled'.
-- DEFAULT ENABLED — the three push functions (pulse-attio-sync,
-- attio-activity-mirror, attio-stalled-deals-cron) check this and no-op when
-- disabled. We do NOT disable the crons here; we only give the owner the switch.
--
-- Mirrors the Phase-2B provider kill-switch shape (a small SECURITY DEFINER
-- reader + a platform-admin setter), but on lit_internal_meta rather than
-- lit_feature_flags because this is an operational cutover flag, not a provider
-- cost gate.

-- Reader — used by the edge functions (via service role) AND the admin panel.
-- Returns TRUE (enabled) when the key is absent → fail-safe default is "keep
-- syncing" so nothing silently stops before the owner decides to cut over.
create or replace function public.lit_attio_sync_enabled()
returns boolean
language sql stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select (meta_value->>'enabled')::boolean
       from public.lit_internal_meta
      where meta_key = 'attio_sync_enabled'),
    true
  );
$$;

-- Platform-admin setter. Writes {enabled, updated_by, updated_at} to the meta row.
create or replace function public.lit_admin_set_attio_sync(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'not authorized'; end if;

  insert into public.lit_internal_meta (meta_key, meta_value, updated_at)
  values (
    'attio_sync_enabled',
    jsonb_build_object('enabled', coalesce(p_enabled, true),
                       'updated_by', auth.uid(),
                       'updated_at', now()),
    now()
  )
  on conflict (meta_key) do update
    set meta_value = excluded.meta_value,
        updated_at = now();

  return jsonb_build_object('ok', true, 'enabled', coalesce(p_enabled, true));
end;
$$;

-- Admin-facing status reader (returns enabled + last-updated metadata for the panel).
create or replace function public.lit_admin_attio_sync_status()
returns jsonb
language plpgsql stable
security definer
set search_path to 'public'
as $$
declare v_row record;
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'not authorized'; end if;
  select meta_value, updated_at into v_row
  from public.lit_internal_meta where meta_key = 'attio_sync_enabled';
  return jsonb_build_object(
    'ok', true,
    'enabled', coalesce((v_row.meta_value->>'enabled')::boolean, true),
    'updated_at', v_row.updated_at
  );
end;
$$;

revoke all on function public.lit_attio_sync_enabled()        from public;
revoke all on function public.lit_admin_set_attio_sync(boolean) from public;
revoke all on function public.lit_admin_attio_sync_status()   from public;

-- Reader is granted to authenticated + service_role (edge fns call it via service role).
grant execute on function public.lit_attio_sync_enabled()        to authenticated, service_role;
grant execute on function public.lit_admin_set_attio_sync(boolean) to authenticated;
grant execute on function public.lit_admin_attio_sync_status()   to authenticated;
