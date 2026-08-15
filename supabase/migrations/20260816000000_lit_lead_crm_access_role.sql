-- Lead-CRM Phase 1 — Part 1: access role (sales-rep, least-privilege)
-- Shared team pipeline. Members = platform admins (implicit) + explicitly added reps/managers.

create table if not exists public.lit_lead_crm_members (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'rep' check (role in ('rep','manager')),
  added_by   uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.lit_lead_crm_members enable row level security;

-- Platform admins manage; a user can read own row.
drop policy if exists lit_lead_crm_members_admin_all on public.lit_lead_crm_members;
create policy lit_lead_crm_members_admin_all on public.lit_lead_crm_members
  for all using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

drop policy if exists lit_lead_crm_members_read_own on public.lit_lead_crm_members;
create policy lit_lead_crm_members_read_own on public.lit_lead_crm_members
  for select using (user_id = auth.uid());

-- Membership helper: platform admins always have access; reps are explicitly added.
create or replace function public.is_lead_crm_member(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path to 'public'
as $$
  select public.is_platform_admin(p_user_id)
      or exists (select 1 from public.lit_lead_crm_members m where m.user_id = p_user_id);
$$;

revoke all on function public.is_lead_crm_member(uuid) from public;
grant execute on function public.is_lead_crm_member(uuid) to authenticated;

-- Frontend route gate: who am I in the lead-CRM?
create or replace function public.lit_my_lead_crm_access()
returns jsonb
language plpgsql
security definer
stable
set search_path to 'public'
as $$
declare
  v_uid   uuid := auth.uid();
  v_admin boolean;
  v_role  text;
begin
  if v_uid is null then
    return jsonb_build_object('is_member', false, 'role', null, 'is_platform_admin', false);
  end if;
  v_admin := public.is_platform_admin(v_uid);
  select m.role into v_role from public.lit_lead_crm_members m where m.user_id = v_uid;
  return jsonb_build_object(
    'is_member', (v_admin or v_role is not null),
    'role', coalesce(v_role, case when v_admin then 'manager' else null end),
    'is_platform_admin', v_admin
  );
end;
$$;

revoke all on function public.lit_my_lead_crm_access() from public;
grant execute on function public.lit_my_lead_crm_access() to authenticated;

-- Platform-admin gated: add/remove a rep.
create or replace function public.lit_admin_set_lead_crm_member(
  p_user_id uuid,
  p_enabled boolean,
  p_role    text default 'rep'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not authorized';
  end if;
  if p_role not in ('rep','manager') then
    raise exception 'invalid role: %', p_role;
  end if;

  if p_enabled then
    insert into public.lit_lead_crm_members (user_id, role, added_by)
    values (p_user_id, p_role, auth.uid())
    on conflict (user_id) do update set role = excluded.role;
  else
    delete from public.lit_lead_crm_members where user_id = p_user_id;
  end if;

  return jsonb_build_object('ok', true, 'user_id', p_user_id, 'enabled', p_enabled, 'role', p_role);
end;
$$;

revoke all on function public.lit_admin_set_lead_crm_member(uuid, boolean, text) from public;
grant execute on function public.lit_admin_set_lead_crm_member(uuid, boolean, text) to authenticated;

-- Platform-admin gated: list members with identity.
create or replace function public.lit_admin_list_lead_crm_members()
returns jsonb
language plpgsql
security definer
stable
set search_path to 'public'
as $$
declare v_rows jsonb;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not authorized';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', m.user_id,
           'role', m.role,
           'email', coalesce(p.email, u.email),
           'full_name', p.full_name,
           'added_by', m.added_by,
           'created_at', m.created_at
         ) order by m.created_at), '[]'::jsonb)
  into v_rows
  from public.lit_lead_crm_members m
  left join public.profiles p on p.id = m.user_id
  left join auth.users u on u.id = m.user_id;

  return jsonb_build_object('ok', true, 'members', v_rows);
end;
$$;

revoke all on function public.lit_admin_list_lead_crm_members() from public;
grant execute on function public.lit_admin_list_lead_crm_members() to authenticated;
