-- CRM v2 handoff (2026-09-28): additive deal/task/step/reply/automation model.
-- Applied to prod via MCP apply_migration (crm_v2_deal_model) same day.
alter table lit_deals
  add column if not exists next_step_text text,
  add column if not exists next_step_due date,
  add column if not exists lost_reason text,
  add column if not exists source text not null default 'manual',
  add column if not exists source_campaign_id uuid,
  add column if not exists stage_entered_at timestamptz not null default now();
alter table lit_tasks
  add column if not exists task_type text not null default 'call',
  add column if not exists source text not null default 'manual',
  add column if not exists trigger_label text,
  add column if not exists snoozed_until date,
  add column if not exists outcome text;
alter table lit_campaign_steps
  add column if not exists variants jsonb,
  add column if not exists linkedin_action text,
  add column if not exists branch jsonb;
alter table lit_email_threads
  add column if not exists intent text,
  add column if not exists read_at timestamptz;
create table if not exists lit_deal_line_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  deal_id uuid not null references lit_deals(id) on delete cascade,
  lane_label text not null,
  origin_code text,
  teu numeric,
  rate_usd numeric,
  value_usd numeric not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_ldli_deal on lit_deal_line_items(deal_id);
create table if not exists lit_deal_committee (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  deal_id uuid not null references lit_deals(id) on delete cascade,
  contact_id uuid,
  name text,
  title text,
  role text not null default 'Influencer',
  created_at timestamptz not null default now()
);
create index if not exists idx_ldc_deal on lit_deal_committee(deal_id);
create table if not exists lit_automation_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  rule_key text not null,
  enabled boolean not null default true,
  run_count integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (org_id, rule_key)
);
alter table lit_deal_line_items enable row level security;
alter table lit_deal_committee enable row level security;
alter table lit_automation_rules enable row level security;
create policy ldli_select on lit_deal_line_items for select using (lit_is_org_member(org_id));
create policy ldli_write on lit_deal_line_items for all using (lit_is_org_member(org_id)) with check (lit_is_org_member(org_id));
create policy ldc_select on lit_deal_committee for select using (lit_is_org_member(org_id));
create policy ldc_write on lit_deal_committee for all using (lit_is_org_member(org_id)) with check (lit_is_org_member(org_id));
create policy lar_select on lit_automation_rules for select using (lit_is_org_member(org_id));
create policy lar_write on lit_automation_rules for all using (lit_is_org_member(org_id)) with check (lit_is_org_member(org_id));
notify pgrst, 'reload schema';
