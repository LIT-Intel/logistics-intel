-- Admin-gated read of per-member monthly credit caps, for the Workspace Members
-- settings control. Pairs with lit_credit_set_user_limit (write). Returns [] for
-- non-admins. SECURITY DEFINER so it can read lit_user_credit_limits under RLS.
create or replace function public.lit_credit_user_limits(p_org_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v_uid uuid := auth.uid(); v_admin boolean := false; v_res jsonb;
begin
  if p_org_id is null then return '[]'::jsonb; end if;
  select (role in ('owner','admin')) into v_admin from org_members where org_id=p_org_id and user_id=v_uid limit 1;
  if not coalesce(v_admin,false) then
    if exists(select 1 from platform_admins where user_id=v_uid) then v_admin := true; end if;
  end if;
  if not coalesce(v_admin,false) then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'monthly_limit', monthly_limit)), '[]'::jsonb)
    into v_res from lit_user_credit_limits where org_id = p_org_id;
  return v_res;
end $fn$;
grant execute on function public.lit_credit_user_limits(uuid) to authenticated, service_role;
