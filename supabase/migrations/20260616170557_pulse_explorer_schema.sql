-- 2026MMDDHHMMSS_pulse_explorer_schema.sql
-- Pulse Explorer Phase 1 — schema additions.

-- 1. Opportunity score columns on lit_company_directory.
alter table lit_company_directory
  add column if not exists opportunity_consolidation_score numeric,
  add column if not exists opportunity_vulnerable_score numeric,
  add column if not exists opportunity_velocity_score numeric,
  add column if not exists opportunity_composite_score numeric,
  add column if not exists last_opportunity_recompute_at timestamptz;

create index if not exists lit_company_directory_composite_idx
  on lit_company_directory (opportunity_composite_score desc nulls last);

-- 2. Map Selections (saved views — filters + selection IDs + map state).
create table if not exists lit_pulse_map_selections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid references organizations(id) on delete cascade,
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  selection_ids text[] not null default '{}',
  map_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lit_pulse_map_selections_user_idx
  on lit_pulse_map_selections (user_id, updated_at desc);

alter table lit_pulse_map_selections enable row level security;

create policy "user reads own map selections"
  on lit_pulse_map_selections for select to authenticated
  using (user_id = auth.uid()
         or (org_id is not null and exists (
           select 1 from org_members om
           where om.organization_id = lit_pulse_map_selections.org_id
             and om.user_id = auth.uid())));

create policy "user inserts own map selections"
  on lit_pulse_map_selections for insert to authenticated
  with check (user_id = auth.uid());

create policy "user updates own map selections"
  on lit_pulse_map_selections for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "user deletes own map selections"
  on lit_pulse_map_selections for delete to authenticated
  using (user_id = auth.uid());

-- 3. ImportYeti per-user daily quota.
create table if not exists lit_user_importyeti_quota (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  calls_count int not null default 0,
  primary key (user_id, day)
);

alter table lit_user_importyeti_quota enable row level security;

create policy "user reads own quota"
  on lit_user_importyeti_quota for select to authenticated
  using (user_id = auth.uid());

-- Service role bypasses RLS (used by importyeti-proxy edge fn for increments).
