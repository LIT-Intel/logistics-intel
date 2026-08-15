-- Lead-CRM Phase 1 — Part 2: pipeline stages (global/shared), lead record, activity, tasks, triggers.

create extension if not exists citext;

-- Global, shared stages (NOT org-scoped).
create table if not exists public.lit_lead_pipeline_stages (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  position        int  not null,
  is_won          boolean not null default false,
  is_lost         boolean not null default false,
  color           text,
  win_probability numeric,
  created_at      timestamptz not null default now()
);

alter table public.lit_lead_pipeline_stages enable row level security;

drop policy if exists lit_lead_pipeline_stages_read on public.lit_lead_pipeline_stages;
create policy lit_lead_pipeline_stages_read on public.lit_lead_pipeline_stages
  for select using (public.is_lead_crm_member(auth.uid()));

drop policy if exists lit_lead_pipeline_stages_admin on public.lit_lead_pipeline_stages;
create policy lit_lead_pipeline_stages_admin on public.lit_lead_pipeline_stages
  for all using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

-- Seed exactly the 6 stages.
insert into public.lit_lead_pipeline_stages (name, position, is_won, is_lost, color, win_probability)
select * from (values
  ('New',        0, false, false, '#94a3b8', 5::numeric),
  ('Contacted',  1, false, false, '#38bdf8', 15),
  ('Engaged',    2, false, false, '#818cf8', 35),
  ('Trial',      3, false, false, '#f59e0b', 60),
  ('Subscriber', 4, true,  false, '#22c55e', 100),
  ('Lost',       5, false, true,  '#ef4444', 0)
) as s(name, position, is_won, is_lost, color, win_probability)
where not exists (select 1 from public.lit_lead_pipeline_stages);

-- Lead record.
create table if not exists public.lit_admin_leads (
  id                uuid primary key default gen_random_uuid(),
  email             citext unique not null,
  user_id           uuid references auth.users(id),
  anonymous_id      text,
  full_name         text,
  company_name      text,
  primary_source    text,
  magnet_slug       text,
  utm_source        text,
  utm_medium        text,
  utm_campaign      text,
  stage_id          uuid references public.lit_lead_pipeline_stages(id),
  status            text not null default 'open' check (status in ('open','converted','lost','nurture')),
  lead_score        int  not null default 0,
  assigned_to       uuid references auth.users(id),
  manual_override   boolean not null default false,
  first_seen_at     timestamptz,
  email_captured_at timestamptz,
  signup_at         timestamptz,
  trial_started_at  timestamptz,
  converted_at      timestamptz,
  last_activity_at  timestamptz,
  is_stale          boolean not null default false,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_lit_admin_leads_stage       on public.lit_admin_leads(stage_id);
create index if not exists idx_lit_admin_leads_assigned     on public.lit_admin_leads(assigned_to);
create index if not exists idx_lit_admin_leads_status       on public.lit_admin_leads(status);
create index if not exists idx_lit_admin_leads_last_act     on public.lit_admin_leads(last_activity_at desc);
create index if not exists idx_lit_admin_leads_user         on public.lit_admin_leads(user_id);

alter table public.lit_admin_leads enable row level security;

-- SHARED across the whole lead-CRM team: every member sees every lead.
drop policy if exists lit_admin_leads_member_all on public.lit_admin_leads;
create policy lit_admin_leads_member_all on public.lit_admin_leads
  for all using (public.is_lead_crm_member(auth.uid()))
  with check (public.is_lead_crm_member(auth.uid()));

-- Activity feed.
create table if not exists public.lit_lead_activity (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.lit_admin_leads(id) on delete cascade,
  kind          text,
  body          jsonb not null default '{}'::jsonb,
  actor_user_id uuid,               -- null = system/auto
  source        text,               -- magnet/product/email/demo/manual/system
  occurred_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists idx_lit_lead_activity_lead on public.lit_lead_activity(lead_id, occurred_at desc);

alter table public.lit_lead_activity enable row level security;

drop policy if exists lit_lead_activity_member_all on public.lit_lead_activity;
create policy lit_lead_activity_member_all on public.lit_lead_activity
  for all using (public.is_lead_crm_member(auth.uid()))
  with check (public.is_lead_crm_member(auth.uid()));

-- Tasks (table now; UI Phase 2).
create table if not exists public.lit_lead_tasks (
  id               uuid primary key default gen_random_uuid(),
  lead_id          uuid not null references public.lit_admin_leads(id) on delete cascade,
  title            text,
  due_date         date,
  status           text not null default 'open' check (status in ('open','done')),
  assignee_user_id uuid references auth.users(id),
  created_by       uuid references auth.users(id),
  completed_at     timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists idx_lit_lead_tasks_lead on public.lit_lead_tasks(lead_id);

alter table public.lit_lead_tasks enable row level security;

drop policy if exists lit_lead_tasks_member_all on public.lit_lead_tasks;
create policy lit_lead_tasks_member_all on public.lit_lead_tasks
  for all using (public.is_lead_crm_member(auth.uid()))
  with check (public.is_lead_crm_member(auth.uid()));

-- Trigger: log 'created' on insert, 'stage_change' on stage change (mirror lit_deals_log_activity).
create or replace function public.lit_admin_leads_log_activity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_new_name text; v_old_name text;
begin
  if TG_OP = 'INSERT' then
    select name into v_new_name from public.lit_lead_pipeline_stages where id = NEW.stage_id;
    insert into public.lit_lead_activity (lead_id, kind, body, actor_user_id, source)
    values (NEW.id, 'created',
            jsonb_build_object('stage', v_new_name, 'email', NEW.email::text, 'source', NEW.primary_source),
            auth.uid(), 'system');
  elsif TG_OP = 'UPDATE' and NEW.stage_id is distinct from OLD.stage_id then
    select name into v_new_name from public.lit_lead_pipeline_stages where id = NEW.stage_id;
    select name into v_old_name from public.lit_lead_pipeline_stages where id = OLD.stage_id;
    insert into public.lit_lead_activity (lead_id, kind, body, actor_user_id, source)
    values (NEW.id, 'stage_change',
            jsonb_build_object('from', v_old_name, 'to', v_new_name),
            auth.uid(), case when auth.uid() is null then 'system' else 'manual' end);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_lit_admin_leads_log_activity on public.lit_admin_leads;
create trigger trg_lit_admin_leads_log_activity
  after insert or update on public.lit_admin_leads
  for each row execute function public.lit_admin_leads_log_activity();

-- Trigger: bump lead.last_activity_at + clear stale on any activity (mirror lit_deal_activity_touch).
create or replace function public.lit_lead_activity_touch()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.lit_admin_leads
     set last_activity_at = greatest(coalesce(last_activity_at, NEW.occurred_at), NEW.occurred_at),
         is_stale = false,
         updated_at = now()
   where id = NEW.lead_id;
  return null;
end;
$$;

drop trigger if exists trg_lit_lead_activity_touch on public.lit_lead_activity;
create trigger trg_lit_lead_activity_touch
  after insert on public.lit_lead_activity
  for each row execute function public.lit_lead_activity_touch();
