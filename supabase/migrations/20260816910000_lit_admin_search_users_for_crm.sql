-- Team-member picker: search existing LIT users by name/email so the owner
-- picks a person instead of pasting a UUID. Platform-admin gated.
create or replace function public.lit_admin_search_users(p_q text default null, p_limit int default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_rows jsonb;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not authorized';
  end if;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) into v_rows
  from (
    select
      p.id            as user_id,
      p.email         as email,
      p.full_name     as full_name,
      p.company_name  as company_name,
      exists(select 1 from public.lit_lead_crm_members m where m.user_id = p.id) as is_member,
      public.is_platform_admin(p.id) as is_platform_admin
    from public.profiles p
    where p.id is not null
      and coalesce(p.status,'') <> 'suspended'
      and (
        p_q is null or btrim(p_q) = ''
        or p.email ilike '%'||p_q||'%'
        or coalesce(p.full_name,'')    ilike '%'||p_q||'%'
        or coalesce(p.company_name,'') ilike '%'||p_q||'%'
      )
    order by
      (case when p.email ilike p_q||'%' or coalesce(p.full_name,'') ilike p_q||'%' then 0 else 1 end),
      p.full_name nulls last, p.email
    limit greatest(1, least(coalesce(p_limit,20), 50))
  ) t;

  return jsonb_build_object('ok', true, 'users', v_rows);
end;
$$;

revoke all on function public.lit_admin_search_users(text,int) from public, anon;
grant execute on function public.lit_admin_search_users(text,int) to authenticated, service_role;

comment on function public.lit_admin_search_users(text,int) is
  'Platform-admin user search (email/name/company) for the Lead-CRM Team picker — replaces pasting a UUID.';
