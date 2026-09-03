-- ===================== Phase 1 — LIT Credits unified engine =====================
-- Coexists with the legacy lit_consume_credits enrichment counter. The legacy
-- funcs are patched to ignore new-engine rows (transaction_type is null), so
-- nothing that flows through the new engine can corrupt the live enrichment
-- quota until Phase 3 retires the legacy path. Balances are authoritative on
-- lit_credit_accounts (atomic FOR UPDATE); lit_credit_ledger is the audit trail.

-- 1) Central cost matrix (brief §8)
create table if not exists public.lit_credit_feature_costs (
  feature_key text primary key,
  credits integer not null,
  label text,
  category text,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.lit_credit_feature_costs (feature_key, credits, label, category) values
 ('company_unlock', 1, 'New company unlock', 'discovery'),
 ('company_export', 1, 'Company export', 'exports'),
 ('email_reveal', 3, 'Email reveal', 'contact'),
 ('phone_reveal', 5, 'Phone reveal', 'contact'),
 ('contact_enrichment', 5, 'Full contact enrichment', 'contact'),
 ('company_enrichment', 8, 'Full company enrichment', 'company'),
 ('pulse_search', 3, 'Pulse search', 'pulse'),
 ('pulse_brief', 10, 'Pulse brief', 'pulse'),
 ('confidence_refresh', 5, 'Confidence score refresh', 'intelligence'),
 ('harvey_research', 5, 'Harvey account research', 'harvey'),
 ('harvey_email', 1, 'Harvey email generation', 'harvey'),
 ('harvey_sequence', 3, 'Harvey sequence generation', 'harvey'),
 ('benchmark_lookup', 2, 'Benchmark lookup', 'benchmark'),
 ('tariff_lookup', 2, 'Tariff / API lookup', 'tariff')
on conflict (feature_key) do update set credits=excluded.credits, label=excluded.label, category=excluded.category, active=true, updated_at=now();

-- 2) Workspace credit accounts (authoritative balance)
create table if not exists public.lit_credit_accounts (
  org_id uuid primary key,
  plan_code text,
  included_quota integer not null default 0,
  included_used integer not null default 0,
  purchased_balance integer not null default 0,
  enterprise_unlimited boolean not null default false,
  cycle_start timestamptz not null default date_trunc('month', now()),
  cycle_end   timestamptz not null default (date_trunc('month', now()) + interval '1 month'),
  updated_at timestamptz not null default now()
);

-- 3) Extend the ledger (additive, nullable)
alter table public.lit_credit_ledger
  add column if not exists transaction_type text,
  add column if not exists feature text,
  add column if not exists entity_type text,
  add column if not exists entity_id text,
  add column if not exists balance_source text,
  add column if not exists reservation_id uuid,
  add column if not exists status text;
create index if not exists lit_credit_ledger_reservation_idx on public.lit_credit_ledger(reservation_id) where reservation_id is not null;

-- 4) Workspace unlocks (dedup, §7)
create table if not exists public.lit_workspace_unlocks (
  org_id uuid not null,
  entity_type text not null,
  entity_id text not null,
  unlocked_by uuid,
  unlocked_at timestamptz not null default now(),
  primary key (org_id, entity_type, entity_id)
);

-- 5) Per-user ceilings (§12)
create table if not exists public.lit_user_credit_limits (
  org_id uuid not null,
  user_id uuid not null,
  monthly_limit integer,
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- 6) Legacy-func guard: ignore new-engine rows so counters don't collide
create or replace function public.lit_get_credit_usage(p_org_id uuid, p_user_id uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $fn$
declare v_plan_code text; v_quota integer; v_used integer := 0;
  v_ps timestamptz := date_trunc('month', now()); v_pe timestamptz := date_trunc('month', now()) + interval '1 month';
begin
  v_plan_code := public.resolve_plan_code(p_org_id, p_user_id);
  select monthly_credit_quota into v_quota from plans where code = v_plan_code limit 1;
  if p_org_id is not null then
    select coalesce(sum(credits),0)::int into v_used from lit_credit_ledger
     where org_id = p_org_id and transaction_type is null
       and action not in ('manual_grant','rollback') and created_at >= v_ps and created_at < v_pe;
  end if;
  return jsonb_build_object('used_this_month', v_used, 'quota', v_quota,
    'remaining', case when v_quota is null then null else greatest(0, v_quota - v_used) end,
    'reset_at', v_pe, 'plan', v_plan_code);
end $fn$;

-- 7) ensure_account
create or replace function public.lit_credit_ensure_account(p_org_id uuid)
 returns public.lit_credit_accounts language plpgsql security definer set search_path to 'public' as $fn$
declare v_acct public.lit_credit_accounts; v_plan text; v_quota integer; v_cs timestamptz; v_ce timestamptz;
begin
  select * into v_acct from lit_credit_accounts where org_id = p_org_id;
  if found then return v_acct; end if;
  v_plan := public.resolve_plan_code(p_org_id, null);
  select coalesce(monthly_credit_quota_v2, monthly_credit_quota, 0) into v_quota from plans where code = v_plan limit 1;
  select current_period_start, current_period_end into v_cs, v_ce
    from subscriptions where organization_id = p_org_id order by updated_at desc limit 1;
  if v_cs is null then v_cs := date_trunc('month', now()); end if;
  if v_ce is null then v_ce := date_trunc('month', now()) + interval '1 month'; end if;
  insert into lit_credit_accounts (org_id, plan_code, included_quota, enterprise_unlimited, cycle_start, cycle_end)
  values (p_org_id, v_plan, coalesce(v_quota,0), (v_plan = 'enterprise'), v_cs, v_ce)
  returning * into v_acct;
  return v_acct;
end $fn$;

-- 8) cost + balance reads
create or replace function public.lit_credit_cost(p_feature text)
 returns integer language sql stable security definer set search_path to 'public' as $fn$
  select coalesce((select credits from lit_credit_feature_costs where feature_key = p_feature and active), 0);
$fn$;

create or replace function public.lit_credit_balance(p_org_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v public.lit_credit_accounts;
begin
  v := public.lit_credit_ensure_account(p_org_id);
  return jsonb_build_object('org_id', p_org_id, 'plan', v.plan_code, 'unlimited', v.enterprise_unlimited,
    'included_quota', v.included_quota, 'included_used', v.included_used,
    'included_remaining', greatest(0, v.included_quota - v.included_used),
    'purchased_remaining', v.purchased_balance,
    'total_remaining', greatest(0, v.included_quota - v.included_used) + v.purchased_balance,
    'cycle_start', v.cycle_start, 'cycle_end', v.cycle_end);
end $fn$;

create or replace function public.lit_workspace_has_unlocked(p_org_id uuid, p_entity_type text, p_entity_id text)
 returns boolean language sql stable security definer set search_path to 'public' as $fn$
  select exists(select 1 from lit_workspace_unlocks where org_id=p_org_id and entity_type=coalesce(p_entity_type,'company') and entity_id=p_entity_id);
$fn$;

-- 9) reserve (atomic heart, §15)
create or replace function public.lit_credit_reserve(
  p_org_id uuid, p_user_id uuid, p_feature text,
  p_entity_type text default null, p_entity_id text default null, p_metadata jsonb default '{}'::jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v_acct lit_credit_accounts; v_cost int; v_inc int:=0; v_pur int:=0; v_avail_inc int;
  v_res uuid := gen_random_uuid(); v_uu int; v_ul int;
begin
  if p_org_id is null then return jsonb_build_object('ok',false,'reason','no_org'); end if;
  perform public.lit_credit_ensure_account(p_org_id);
  select * into v_acct from lit_credit_accounts where org_id = p_org_id for update;
  if now() >= v_acct.cycle_end then
    update lit_credit_accounts set included_used=0, cycle_start=v_acct.cycle_end,
      cycle_end=v_acct.cycle_end + (v_acct.cycle_end - v_acct.cycle_start), updated_at=now()
      where org_id=p_org_id returning * into v_acct;
  end if;
  v_cost := public.lit_credit_cost(p_feature);
  if p_feature='company_unlock' and p_entity_id is not null
     and exists(select 1 from lit_workspace_unlocks where org_id=p_org_id and entity_type=coalesce(p_entity_type,'company') and entity_id=p_entity_id) then
    return jsonb_build_object('ok',true,'charged',0,'reservation_id',null,'already_owned',true);
  end if;
  if v_acct.enterprise_unlimited then
    insert into lit_credit_ledger(org_id,user_id,action,credits,metadata,transaction_type,feature,entity_type,entity_id,balance_source,reservation_id,status)
    values(p_org_id,p_user_id,p_feature,v_cost,coalesce(p_metadata,'{}'::jsonb),'RESERVE',p_feature,p_entity_type,p_entity_id,'unlimited',v_res,'reserved');
    return jsonb_build_object('ok',true,'charged',v_cost,'reservation_id',v_res,'unlimited',true);
  end if;
  if v_cost = 0 then return jsonb_build_object('ok',true,'charged',0,'reservation_id',null); end if;
  select monthly_limit into v_ul from lit_user_credit_limits where org_id=p_org_id and user_id=p_user_id;
  if v_ul is not null then
    select coalesce(sum(credits),0)::int into v_uu from lit_credit_ledger
      where org_id=p_org_id and user_id=p_user_id and transaction_type in ('RESERVE','DEBIT')
        and status in ('reserved','committed') and created_at >= v_acct.cycle_start;
    if v_uu + v_cost > v_ul then
      return jsonb_build_object('ok',false,'reason','user_limit_exceeded','user_used',v_uu,'user_limit',v_ul);
    end if;
  end if;
  v_avail_inc := greatest(0, v_acct.included_quota - v_acct.included_used);
  v_inc := least(v_cost, v_avail_inc);
  v_pur := v_cost - v_inc;
  if v_pur > v_acct.purchased_balance then
    return jsonb_build_object('ok',false,'reason','insufficient_credits','needed',v_cost,'available',v_avail_inc + v_acct.purchased_balance);
  end if;
  update lit_credit_accounts set included_used=included_used+v_inc, purchased_balance=purchased_balance-v_pur, updated_at=now() where org_id=p_org_id;
  insert into lit_credit_ledger(org_id,user_id,action,credits,metadata,transaction_type,feature,entity_type,entity_id,balance_source,reservation_id,status)
  values(p_org_id,p_user_id,p_feature,v_cost,
    coalesce(p_metadata,'{}'::jsonb) || jsonb_build_object('from_included',v_inc,'from_purchased',v_pur),
    'RESERVE',p_feature,p_entity_type,p_entity_id,
    case when v_pur>0 and v_inc>0 then 'mixed' when v_pur>0 then 'purchased' else 'included' end, v_res,'reserved');
  return jsonb_build_object('ok',true,'charged',v_cost,'reservation_id',v_res,'from_included',v_inc,'from_purchased',v_pur);
end $fn$;

-- 10) commit (finalize; register unlock ownership)
create or replace function public.lit_credit_commit(p_reservation_id uuid, p_metadata jsonb default '{}'::jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v_n int;
begin
  if p_reservation_id is null then return jsonb_build_object('ok',true,'noop',true); end if;
  update lit_credit_ledger set status='committed', transaction_type='DEBIT',
    metadata = coalesce(metadata,'{}'::jsonb) || coalesce(p_metadata,'{}'::jsonb)
    where reservation_id = p_reservation_id and status='reserved';
  get diagnostics v_n = row_count;
  insert into lit_workspace_unlocks(org_id, entity_type, entity_id, unlocked_by)
    select org_id, coalesce(entity_type,'company'), entity_id, user_id from lit_credit_ledger
     where reservation_id = p_reservation_id and feature='company_unlock' and entity_id is not null
  on conflict do nothing;
  return jsonb_build_object('ok', v_n > 0, 'committed', v_n);
end $fn$;

-- 11) refund (release the hold, §16)
create or replace function public.lit_credit_refund(p_reservation_id uuid, p_reason text default null)
 returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v lit_credit_ledger; v_inc int; v_pur int;
begin
  select * into v from lit_credit_ledger where reservation_id = p_reservation_id and status='reserved' for update;
  if not found then return jsonb_build_object('ok',true,'noop',true); end if;
  v_inc := coalesce((v.metadata->>'from_included')::int,0);
  v_pur := coalesce((v.metadata->>'from_purchased')::int,0);
  if v.balance_source <> 'unlimited' then
    update lit_credit_accounts set included_used=greatest(0, included_used - v_inc),
      purchased_balance=purchased_balance + v_pur, updated_at=now() where org_id = v.org_id;
  end if;
  update lit_credit_ledger set status='refunded' where reservation_id = p_reservation_id;
  insert into lit_credit_ledger(org_id,user_id,action,credits,metadata,transaction_type,feature,balance_source,reservation_id,status)
  values(v.org_id,v.user_id,'refund',-v.credits, jsonb_build_object('reason',p_reason,'refund_of',p_reservation_id),
    'REFUND',v.feature,v.balance_source,p_reservation_id,'committed');
  return jsonb_build_object('ok',true,'refunded',v.credits);
end $fn$;

-- 12) purchase grant (idempotent, §32)
create or replace function public.lit_credit_grant_purchase(p_org_id uuid, p_credits integer, p_ref text, p_metadata jsonb default '{}'::jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v lit_credit_accounts;
begin
  if p_ref is not null and exists(select 1 from lit_credit_ledger where transaction_type='PURCHASE' and metadata->>'stripe_ref'=p_ref) then
    return jsonb_build_object('ok',true,'duplicate',true);
  end if;
  perform public.lit_credit_ensure_account(p_org_id);
  update lit_credit_accounts set purchased_balance=purchased_balance + p_credits, updated_at=now() where org_id=p_org_id returning * into v;
  insert into lit_credit_ledger(org_id,action,credits,metadata,transaction_type,feature,balance_source,status)
  values(p_org_id,'purchase',p_credits, coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('stripe_ref',p_ref),'PURCHASE','credit_pack','purchased','committed');
  return jsonb_build_object('ok',true,'purchased_balance',v.purchased_balance);
end $fn$;

-- 13) monthly allocation + admin knobs
create or replace function public.lit_credit_allocate_monthly(p_org_id uuid, p_cycle_start timestamptz default null, p_cycle_end timestamptz default null)
 returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v_plan text; v_quota int; v_cs timestamptz; v_ce timestamptz;
begin
  perform public.lit_credit_ensure_account(p_org_id);
  v_plan := public.resolve_plan_code(p_org_id, null);
  select coalesce(monthly_credit_quota_v2, monthly_credit_quota, 0) into v_quota from plans where code=v_plan limit 1;
  v_cs := coalesce(p_cycle_start, date_trunc('month', now()));
  v_ce := coalesce(p_cycle_end, v_cs + interval '1 month');
  update lit_credit_accounts set plan_code=v_plan, included_quota=coalesce(v_quota,0), included_used=0,
    enterprise_unlimited=(v_plan='enterprise'), cycle_start=v_cs, cycle_end=v_ce, updated_at=now() where org_id=p_org_id;
  insert into lit_credit_ledger(org_id,action,credits,metadata,transaction_type,feature,status)
  values(p_org_id,'monthly_allocation',coalesce(v_quota,0),jsonb_build_object('cycle_start',v_cs,'cycle_end',v_ce,'plan',v_plan),'MONTHLY_ALLOCATION','allocation','committed');
  return jsonb_build_object('ok',true,'plan',v_plan,'included_quota',coalesce(v_quota,0));
end $fn$;

create or replace function public.lit_credit_set_user_limit(p_org_id uuid, p_user_id uuid, p_limit integer)
 returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
begin
  insert into lit_user_credit_limits(org_id,user_id,monthly_limit,updated_at) values(p_org_id,p_user_id,p_limit,now())
  on conflict (org_id,user_id) do update set monthly_limit=excluded.monthly_limit, updated_at=now();
  return jsonb_build_object('ok',true,'org_id',p_org_id,'user_id',p_user_id,'monthly_limit',p_limit);
end $fn$;

-- 14) RLS: read-own-workspace; mutations via SECURITY DEFINER RPCs only
alter table public.lit_credit_feature_costs enable row level security;
drop policy if exists lcfc_read on public.lit_credit_feature_costs;
create policy lcfc_read on public.lit_credit_feature_costs for select to authenticated using (active = true);

alter table public.lit_credit_accounts enable row level security;
drop policy if exists lca_read on public.lit_credit_accounts;
create policy lca_read on public.lit_credit_accounts for select to authenticated
  using (org_id in (select org_id from org_members where user_id = auth.uid()));

alter table public.lit_workspace_unlocks enable row level security;
drop policy if exists lwu_read on public.lit_workspace_unlocks;
create policy lwu_read on public.lit_workspace_unlocks for select to authenticated
  using (org_id in (select org_id from org_members where user_id = auth.uid()));

alter table public.lit_user_credit_limits enable row level security;
drop policy if exists lucl_read on public.lit_user_credit_limits;
create policy lucl_read on public.lit_user_credit_limits for select to authenticated
  using (org_id in (select org_id from org_members where user_id = auth.uid()));

-- 15) grants
grant execute on function public.lit_credit_cost(text) to authenticated, service_role;
grant execute on function public.lit_credit_balance(uuid) to authenticated, service_role;
grant execute on function public.lit_workspace_has_unlocked(uuid,text,text) to authenticated, service_role;
grant execute on function public.lit_credit_ensure_account(uuid) to service_role;
grant execute on function public.lit_credit_reserve(uuid,uuid,text,text,text,jsonb) to service_role;
grant execute on function public.lit_credit_commit(uuid,jsonb) to service_role;
grant execute on function public.lit_credit_refund(uuid,text) to service_role;
grant execute on function public.lit_credit_grant_purchase(uuid,integer,text,jsonb) to service_role;
grant execute on function public.lit_credit_allocate_monthly(uuid,timestamptz,timestamptz) to service_role;
grant execute on function public.lit_credit_set_user_limit(uuid,uuid,integer) to service_role;
