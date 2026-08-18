-- Lead CRM: each enabled CRM member owns their booking link.
-- The prior global setting was admin-only, which made the visible Save button
-- fail for reps and managers. Keep the public RPC names stable for the client.

create table if not exists public.lit_leadcrm_user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cal_url text,
  updated_at timestamptz not null default now()
);

alter table public.lit_leadcrm_user_settings enable row level security;

drop policy if exists lit_leadcrm_user_settings_select_own on public.lit_leadcrm_user_settings;
create policy lit_leadcrm_user_settings_select_own
  on public.lit_leadcrm_user_settings for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.lit_leadcrm_cal_config()
returns jsonb
language plpgsql security definer stable
set search_path to 'public'
as $$
declare v_url text;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;
  select cal_url into v_url
  from public.lit_leadcrm_user_settings where user_id = auth.uid();

  -- Preserve the old shared admin value as a fallback during migration.
  if v_url is null then
    select meta_value #>> '{}' into v_url
    from public.lit_internal_meta where meta_key = 'cal_booking_url';
  end if;

  return jsonb_build_object(
    'ok', true,
    'configured', v_url is not null and v_url <> '',
    'cal_url', v_url,
    'can_configure', true
  );
end;
$$;

create or replace function public.lit_admin_set_cal_url(p_url text)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare v_clean text;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;
  v_clean := nullif(trim(coalesce(p_url, '')), '');
  if v_clean is not null and v_clean !~* '^https://cal\.com/' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_url');
  end if;

  insert into public.lit_leadcrm_user_settings (user_id, cal_url, updated_at)
  values (auth.uid(), v_clean, now())
  on conflict (user_id) do update
    set cal_url = excluded.cal_url, updated_at = now();

  return jsonb_build_object('ok', true, 'cal_url', v_clean);
end;
$$;

revoke all on function public.lit_leadcrm_cal_config() from public;
revoke all on function public.lit_admin_set_cal_url(text) from public;
grant execute on function public.lit_leadcrm_cal_config() to authenticated;
grant execute on function public.lit_admin_set_cal_url(text) to authenticated;

