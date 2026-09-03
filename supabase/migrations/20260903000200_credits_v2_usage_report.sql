-- Credit Usage page data (§24-30). One call returns balance + per-feature +
-- per-user + recent activity for the current billing cycle. Membership-gated;
-- per-user data (Users tab) is admin/owner/platform-admin only — a member sees
-- only their own usage. SECURITY DEFINER so it can read auth.users for labels.
create or replace function public.lit_credit_usage_report(p_org_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_is_member boolean := false;
  v_bal jsonb;
  v_cycle_start timestamptz;
  v_by_feature jsonb;
  v_by_user jsonb;
  v_activity jsonb;
begin
  if p_org_id is null then return jsonb_build_object('ok', false, 'reason', 'no_org'); end if;

  select true, (role in ('owner','admin')) into v_is_member, v_is_admin
    from org_members where org_id = p_org_id and user_id = v_uid limit 1;
  if not coalesce(v_is_member, false) then
    if exists (select 1 from platform_admins where user_id = v_uid) then
      v_is_member := true; v_is_admin := true;
    end if;
  end if;
  if not coalesce(v_is_member, false) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  v_bal := public.lit_credit_balance(p_org_id);
  v_cycle_start := coalesce((v_bal->>'cycle_start')::timestamptz, date_trunc('month', now()));

  select coalesce(jsonb_agg(jsonb_build_object('feature', feature, 'credits', c) order by c desc), '[]'::jsonb)
    into v_by_feature
  from (
    select coalesce(feature, 'other') as feature, sum(credits)::int as c
    from lit_credit_ledger
    where org_id = p_org_id and transaction_type = 'DEBIT' and status = 'committed' and created_at >= v_cycle_start
    group by coalesce(feature, 'other')
  ) f;

  select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'user_email', user_email, 'credits', c) order by c desc), '[]'::jsonb)
    into v_by_user
  from (
    select l.user_id, max(au.email) as user_email, sum(l.credits)::int as c
    from lit_credit_ledger l
    left join auth.users au on au.id = l.user_id
    where l.org_id = p_org_id and l.transaction_type = 'DEBIT' and l.status = 'committed' and l.created_at >= v_cycle_start
      and (v_is_admin or l.user_id = v_uid)
    group by l.user_id
  ) u;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'user_id', user_id, 'user_email', user_email, 'feature', feature, 'action', action,
      'entity_type', entity_type, 'entity_id', entity_id, 'credits', credits,
      'transaction_type', transaction_type, 'created_at', created_at
    ) order by created_at desc), '[]'::jsonb)
    into v_activity
  from (
    select l.*, au.email as user_email
    from lit_credit_ledger l
    left join auth.users au on au.id = l.user_id
    where l.org_id = p_org_id and l.transaction_type in ('DEBIT','REFUND','PURCHASE')
      and (v_is_admin or l.user_id = v_uid)
    order by l.created_at desc limit 50
  ) a;

  return jsonb_build_object('ok', true, 'is_admin', v_is_admin, 'balance', v_bal,
    'by_feature', v_by_feature, 'by_user', v_by_user, 'activity', v_activity);
end $fn$;
grant execute on function public.lit_credit_usage_report(uuid) to authenticated, service_role;
