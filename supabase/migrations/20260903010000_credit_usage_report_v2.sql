-- Credit Usage page (§24-30) — make it meaningful for EVERY org, including
-- Enterprise/unlimited plans and orgs where credit metering is still dark.
--
-- The v1 report only surfaced NEW-engine credit-ledger rows, so an Enterprise
-- workspace (unlimited → no reservations written) or any org before metering is
-- flipped on saw a completely empty page ("no data / no users / no usage").
--
-- v2 additionally returns, without conflating credits and raw action-counts:
--   • members       — the full team roster (always populated; not sensitive),
--                     so the Users tab is never empty.
--   • feature_usage — real activity from the live lit_usage_ledger (last 90d):
--                     per-feature use counts + distinct users. Lets the Features
--                     tab show genuine usage when the credit ledger is empty.
--   • usage_activity— recent raw usage-ledger events (admin sees all / a member
--                     sees only their own) for the Activity tab fallback.
-- The credit-based sections (by_feature / by_user / activity) are unchanged, so
-- existing consumers keep working.
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
  v_members jsonb;
  v_feature_usage jsonb;
  v_usage_activity jsonb;
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

  -- ── Credit-ledger sections (new engine) — unchanged from v1 ──────────────
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

  -- ── Team roster (always populated; membership is not sensitive) ──────────
  select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', m.user_id, 'user_email', coalesce(nullif(m.email, ''), au.email),
      'full_name', m.full_name, 'role', m.role, 'joined_at', m.joined_at
    ) order by m.joined_at asc nulls last), '[]'::jsonb)
    into v_members
  from org_members m
  left join auth.users au on au.id = m.user_id
  where m.org_id = p_org_id;

  -- ── Real feature activity from the live usage ledger (last 90 days) ──────
  select coalesce(jsonb_agg(jsonb_build_object('feature', feature_key, 'uses', q, 'users', users) order by q desc), '[]'::jsonb)
    into v_feature_usage
  from (
    select feature_key, sum(quantity)::int as q, count(distinct user_id) as users
    from lit_usage_ledger
    where org_id = p_org_id and created_at >= now() - interval '90 days' and feature_key is not null
    group by feature_key
  ) fu;

  -- ── Recent raw usage events (admin: all / member: own) ───────────────────
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'feature', feature_key, 'action', action_key, 'quantity', quantity,
      'user_email', user_email, 'created_at', created_at
    ) order by created_at desc), '[]'::jsonb)
    into v_usage_activity
  from (
    select u.id, u.feature_key, u.action_key, u.quantity, u.created_at,
           coalesce(nullif(m.email, ''), au.email) as user_email
    from lit_usage_ledger u
    left join org_members m on m.org_id = u.org_id and m.user_id = u.user_id
    left join auth.users au on au.id = u.user_id
    where u.org_id = p_org_id and (v_is_admin or u.user_id = v_uid)
    order by u.created_at desc limit 30
  ) ua;

  return jsonb_build_object('ok', true, 'is_admin', v_is_admin, 'balance', v_bal,
    'by_feature', v_by_feature, 'by_user', v_by_user, 'activity', v_activity,
    'members', v_members, 'feature_usage', v_feature_usage, 'usage_activity', v_usage_activity);
end $fn$;
grant execute on function public.lit_credit_usage_report(uuid) to authenticated, service_role;
