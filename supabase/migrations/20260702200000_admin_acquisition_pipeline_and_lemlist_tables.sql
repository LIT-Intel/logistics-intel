-- Admin acquisition pipeline + Lemlist activity storage.
-- Admin-only by RLS; subscriber-facing campaign pages do not read these tables.

create table if not exists public.lit_acquisition_opportunities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.lit_leads(id) on delete set null,
  org_id uuid references public.organizations(id) on delete set null,
  email text,
  contact_name text,
  company_name text,
  title text,
  source text not null default 'unknown',
  source_provider text not null default 'manual',
  source_campaign_id uuid,
  source_external_id text,
  stage text not null default 'lead' check (stage in ('lead','engaged','reply','meeting_booked','demo_completed','opportunity','customer','lost')),
  stage_changed_at timestamptz not null default now(),
  estimated_value numeric(12,2),
  actual_value numeric(12,2),
  currency text not null default 'USD',
  probability integer check (probability is null or (probability >= 0 and probability <= 100)),
  owner_user_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists lit_acquisition_opportunities_provider_external_uidx
  on public.lit_acquisition_opportunities(source_provider, source_external_id)
  where source_external_id is not null;
create index if not exists lit_acquisition_opportunities_email_idx on public.lit_acquisition_opportunities(lower(email));
create index if not exists lit_acquisition_opportunities_stage_idx on public.lit_acquisition_opportunities(stage, stage_changed_at desc);

create table if not exists public.lit_acquisition_events (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references public.lit_acquisition_opportunities(id) on delete cascade,
  event_type text not null,
  provider text not null default 'manual',
  source_event_id text,
  campaign_id uuid,
  email text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists lit_acquisition_events_provider_event_uidx
  on public.lit_acquisition_events(provider, source_event_id)
  where source_event_id is not null;
create index if not exists lit_acquisition_events_opportunity_idx on public.lit_acquisition_events(opportunity_id, occurred_at desc);
create index if not exists lit_acquisition_events_provider_idx on public.lit_acquisition_events(provider, occurred_at desc);

create table if not exists public.lit_lemlist_campaigns (
  id uuid primary key default gen_random_uuid(),
  lemlist_campaign_id text unique,
  name text not null,
  status text not null default 'draft',
  audience_segment text not null default 'freight_broker_decision_makers',
  created_by uuid,
  launched_at timestamptz,
  last_synced_at timestamptz,
  stats jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lit_lemlist_leads (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.lit_lemlist_campaigns(id) on delete cascade,
  lemlist_lead_id text,
  email text not null,
  first_name text,
  last_name text,
  company_name text,
  title text,
  linkedin_url text,
  phone text,
  status text not null default 'queued',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(campaign_id, email)
);

create table if not exists public.lit_lemlist_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.lit_lemlist_campaigns(id) on delete set null,
  lead_id uuid references public.lit_lemlist_leads(id) on delete set null,
  lemlist_event_id text unique,
  event_type text not null,
  email text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists lit_lemlist_events_campaign_idx on public.lit_lemlist_events(campaign_id, occurred_at desc);
create index if not exists lit_lemlist_events_email_idx on public.lit_lemlist_events(lower(email));

alter table public.lit_acquisition_opportunities enable row level security;
alter table public.lit_acquisition_events enable row level security;
alter table public.lit_lemlist_campaigns enable row level security;
alter table public.lit_lemlist_leads enable row level security;
alter table public.lit_lemlist_events enable row level security;

drop policy if exists lit_acquisition_opportunities_admin_all on public.lit_acquisition_opportunities;
create policy lit_acquisition_opportunities_admin_all on public.lit_acquisition_opportunities
  for all to authenticated using (public.is_admin_caller()) with check (public.is_admin_caller());

drop policy if exists lit_acquisition_events_admin_all on public.lit_acquisition_events;
create policy lit_acquisition_events_admin_all on public.lit_acquisition_events
  for all to authenticated using (public.is_admin_caller()) with check (public.is_admin_caller());

drop policy if exists lit_lemlist_campaigns_admin_all on public.lit_lemlist_campaigns;
create policy lit_lemlist_campaigns_admin_all on public.lit_lemlist_campaigns
  for all to authenticated using (public.is_admin_caller()) with check (public.is_admin_caller());

drop policy if exists lit_lemlist_leads_admin_all on public.lit_lemlist_leads;
create policy lit_lemlist_leads_admin_all on public.lit_lemlist_leads
  for all to authenticated using (public.is_admin_caller()) with check (public.is_admin_caller());

drop policy if exists lit_lemlist_events_admin_all on public.lit_lemlist_events;
create policy lit_lemlist_events_admin_all on public.lit_lemlist_events
  for all to authenticated using (public.is_admin_caller()) with check (public.is_admin_caller());

create or replace function public.lit_acquisition_stage_rank(p_stage text)
returns integer language sql immutable set search_path = public as $$
  select case p_stage
    when 'lead' then 10 when 'engaged' then 20 when 'reply' then 30
    when 'meeting_booked' then 40 when 'demo_completed' then 50
    when 'opportunity' then 60 when 'customer' then 70 when 'lost' then 5
    else 0 end;
$$;

create or replace function public.lit_acquisition_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists lit_acquisition_opportunities_touch_updated_at on public.lit_acquisition_opportunities;
create trigger lit_acquisition_opportunities_touch_updated_at
before update on public.lit_acquisition_opportunities
for each row execute function public.lit_acquisition_touch_updated_at();

drop trigger if exists lit_lemlist_campaigns_touch_updated_at on public.lit_lemlist_campaigns;
create trigger lit_lemlist_campaigns_touch_updated_at
before update on public.lit_lemlist_campaigns
for each row execute function public.lit_acquisition_touch_updated_at();

drop trigger if exists lit_lemlist_leads_touch_updated_at on public.lit_lemlist_leads;
create trigger lit_lemlist_leads_touch_updated_at
before update on public.lit_lemlist_leads
for each row execute function public.lit_acquisition_touch_updated_at();

create or replace function public.lit_acquisition_upsert_event(
  p_email text, p_event_type text, p_stage text, p_provider text,
  p_source_event_id text default null, p_campaign_id uuid default null,
  p_occurred_at timestamptz default now(), p_contact_name text default null,
  p_company_name text default null, p_title text default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_opp_id uuid;
  v_current_stage text;
  v_next_stage text := coalesce(nullif(p_stage, ''), 'lead');
begin
  if v_email is null and p_source_event_id is null then return null; end if;

  select id, stage into v_opp_id, v_current_stage
  from public.lit_acquisition_opportunities
  where (v_email is not null and lower(email) = v_email)
     or (p_source_event_id is not null and source_provider = p_provider and source_external_id = p_source_event_id)
  order by updated_at desc
  limit 1;

  if v_opp_id is null then
    insert into public.lit_acquisition_opportunities (
      email, contact_name, company_name, title, source, source_provider, source_campaign_id,
      source_external_id, stage, stage_changed_at, metadata
    ) values (
      v_email, p_contact_name, p_company_name, p_title, coalesce(p_provider, 'manual'), coalesce(p_provider, 'manual'),
      p_campaign_id, p_source_event_id, v_next_stage, coalesce(p_occurred_at, now()), coalesce(p_metadata, '{}'::jsonb)
    ) returning id into v_opp_id;
  elsif public.lit_acquisition_stage_rank(v_next_stage) >= public.lit_acquisition_stage_rank(v_current_stage) then
    update public.lit_acquisition_opportunities
      set stage = v_next_stage,
          stage_changed_at = coalesce(p_occurred_at, now()),
          source_campaign_id = coalesce(p_campaign_id, source_campaign_id),
          contact_name = coalesce(nullif(p_contact_name, ''), contact_name),
          company_name = coalesce(nullif(p_company_name, ''), company_name),
          title = coalesce(nullif(p_title, ''), title),
          metadata = metadata || coalesce(p_metadata, '{}'::jsonb)
    where id = v_opp_id;
  end if;

  insert into public.lit_acquisition_events (
    opportunity_id, event_type, provider, source_event_id, campaign_id, email, occurred_at, metadata
  ) values (
    v_opp_id, p_event_type, coalesce(p_provider, 'manual'), p_source_event_id, p_campaign_id,
    v_email, coalesce(p_occurred_at, now()), coalesce(p_metadata, '{}'::jsonb)
  ) on conflict do nothing;

  return v_opp_id;
end;
$$;

revoke all on function public.lit_acquisition_upsert_event(text,text,text,text,text,uuid,timestamptz,text,text,text,jsonb) from public, anon, authenticated;

create or replace function public.lit_admin_acquisition_summary(p_start_at timestamptz default now() - interval '30 days')
returns table(stage text, count bigint, total_estimated_value numeric, total_actual_value numeric)
language sql stable security definer set search_path = public as $$
  select o.stage, count(*)::bigint, coalesce(sum(o.estimated_value),0), coalesce(sum(o.actual_value),0)
  from public.lit_acquisition_opportunities o
  where public.is_admin_caller()
    and o.created_at >= p_start_at
  group by o.stage;
$$;

revoke all on function public.lit_admin_acquisition_summary(timestamptz) from public, anon;
grant execute on function public.lit_admin_acquisition_summary(timestamptz) to authenticated;

insert into public.lit_lemlist_campaigns (name, status, audience_segment, metadata)
values (
  'LIT Freight Broker Acquisition - Owners and VPs',
  'draft',
  'freight_broker_decision_makers',
  '{"target_titles":["Owner","Founder","CEO","President","VP Sales","VP Operations","Director of Sales","Director of Operations"],"target_market":"freight brokers likely to subscribe to LIT","admin_only":true,"recommended_offer":"Pulse Explorer demo and freight lead intelligence workflow"}'::jsonb
)
on conflict do nothing;
