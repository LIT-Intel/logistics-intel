-- ─────────────────────────────────────────────────────────────────────────────
-- Project Harvey — Batch 2 FOUNDATION (internal-only autonomous AI sales agent)
--
-- Applied by the orchestrator via MCP (mcp apply_migration). Do NOT apply by
-- hand; this file is written to be applied verbatim to prod, idempotently.
--
-- What this creates:
--   1. lit_agent_runs       — the agent decision/audit log. One row per
--                             controller invocation (Harvey is unauditable
--                             without it — HARVEY_LIT_ARCHITECTURE.md §5.7).
--   2. lit_agent_knowledge  — approved sales/product/persona knowledge the
--                             agent's prompts consume. Rows are only usable
--                             when approved=true (approval is a human act).
--   3. lit_agent_config     — one config row per agent. Seeds the 'harvey'
--                             row with enabled=false + testMode=true, so the
--                             agent is created OFF at the config layer.
--   4. lit_feature_flags row 'harvey_internal_agent' — created KILLED
--                             (global_kill=true, rollout=0). NOTE: the
--                             existing lit_provider_flag() RPC fails OPEN
--                             (missing row ⇒ enabled) and must NOT be used
--                             for this flag. Harvey code checks the flag
--                             fail-CLOSED via _shared/agent.ts
--                             isAgentFlagEnabled(): the row must EXIST with
--                             global_kill=false to count as enabled.
--
-- Access model (internal-only, mirrors the Lead CRM template):
--   - READ:  authenticated users passing is_lead_crm_member(auth.uid())
--            (SECURITY DEFINER helper from 20260816000000; platform admins
--            are implicit members). Customers are not members ⇒ no access.
--   - WRITE: service-role only. No INSERT/UPDATE/DELETE policies exist for
--            authenticated, so RLS denies all client writes; only edge
--            functions holding the service-role key can write.
--
-- Kill-switch semantics (fail closed, two independent gates):
--   gate 1: lit_feature_flags['harvey_internal_agent'] must exist AND have
--           global_kill=false  (missing row = OFF)
--   gate 2: lit_agent_config['harvey'].config->>'enabled' must be 'true'
--   Both ship OFF. Turning Harvey on is two explicit owner actions
--   (lit_admin_set_flag + a service-role config update).
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── shared updated_at trigger fn (self-contained; do not rely on the
--     un-migrated public.touch_updated_at) ───────────────────────────────────
create or replace function public.lit_agent_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ─── 1. lit_agent_runs — decision/audit log ──────────────────────────────────
create table if not exists public.lit_agent_runs (
  id              uuid primary key default gen_random_uuid(),
  agent_name      text not null,
  trigger_type    text not null check (trigger_type in ('cron','webhook','manual','test')),
  status          text not null default 'pending'
                    check (status in ('pending','running','ok','error','skipped')),
  priority        int,
  decision        text,
  decision_reason text,
  input_json      jsonb,
  output_json     jsonb,
  error_json      jsonb,
  test_mode       boolean not null default false,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists lit_agent_runs_agent_created_idx
  on public.lit_agent_runs (agent_name, created_at desc);
create index if not exists lit_agent_runs_active_idx
  on public.lit_agent_runs (status)
  where status in ('pending','running');

alter table public.lit_agent_runs enable row level security;

-- Lead-CRM members (incl. platform admins) may read the audit log.
drop policy if exists lit_agent_runs_member_read on public.lit_agent_runs;
create policy lit_agent_runs_member_read on public.lit_agent_runs
  for select to authenticated
  using (public.is_lead_crm_member(auth.uid()));
-- Deliberately NO insert/update/delete policies: writes are service-role only.

comment on table public.lit_agent_runs is
  'Project Harvey: one row per agent controller invocation — decision, probe counts, errors. Read: lead-CRM members. Write: service-role only.';

-- ─── 2. lit_agent_knowledge — approved agent knowledge base ──────────────────
create table if not exists public.lit_agent_knowledge (
  id            uuid primary key default gen_random_uuid(),
  category      text not null check (category in (
                  'product','pricing','feature','competitor','persona',
                  'objection','sales_methodology','freight_sales',
                  'email_style','linkedin_style','qualification',
                  'compliance','case_study','security','billing')),
  title         text not null,
  content       text not null,
  source        text,
  approved      boolean not null default false,
  approved_by   uuid references auth.users(id),
  valid_from    timestamptz default now(),
  valid_until   timestamptz,
  metadata_json jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists lit_agent_knowledge_category_approved_idx
  on public.lit_agent_knowledge (category)
  where approved;

drop trigger if exists trg_lit_agent_knowledge_touch on public.lit_agent_knowledge;
create trigger trg_lit_agent_knowledge_touch
  before update on public.lit_agent_knowledge
  for each row execute function public.lit_agent_touch_updated_at();

alter table public.lit_agent_knowledge enable row level security;

drop policy if exists lit_agent_knowledge_member_read on public.lit_agent_knowledge;
create policy lit_agent_knowledge_member_read on public.lit_agent_knowledge
  for select to authenticated
  using (public.is_lead_crm_member(auth.uid()));
-- Writes are service-role only (no authenticated write policies).

comment on table public.lit_agent_knowledge is
  'Project Harvey: curated sales/product/persona knowledge injected into agent prompts. Only approved=true rows are usable. Read: lead-CRM members. Write: service-role only.';

-- ─── 3. lit_agent_config — one row per agent ─────────────────────────────────
create table if not exists public.lit_agent_config (
  agent_name text primary key,
  config     jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

drop trigger if exists trg_lit_agent_config_touch on public.lit_agent_config;
create trigger trg_lit_agent_config_touch
  before update on public.lit_agent_config
  for each row execute function public.lit_agent_touch_updated_at();

alter table public.lit_agent_config enable row level security;

drop policy if exists lit_agent_config_member_read on public.lit_agent_config;
create policy lit_agent_config_member_read on public.lit_agent_config
  for select to authenticated
  using (public.is_lead_crm_member(auth.uid()));
-- Writes are service-role only (no authenticated write policies).

comment on table public.lit_agent_config is
  'Project Harvey: per-agent config (mode, sender identity, limits, approvals, quiet hours). enabled=false ⇒ the controller records a skipped run and does nothing. Read: lead-CRM members. Write: service-role only.';

-- Seed the Harvey config. Created DISABLED (enabled=false) and in testMode.
-- mode 'assisted' = every outward action requires human approval once enabled.
insert into public.lit_agent_config (agent_name, config)
values (
  'harvey',
  '{
    "enabled": false,
    "mode": "assisted",
    "testMode": true,
    "sender": {
      "emailAccount": "harvey@logisticintel.com",
      "linkedinAccountId": null
    },
    "prospecting": {
      "enabled": true,
      "targetInventory": 100,
      "minimumScore": 70
    },
    "sending": {
      "emailDailyLimit": 30,
      "linkedinInviteDailyLimit": 15,
      "linkedinMessageDailyLimit": 25
    },
    "approval": {
      "firstTouch": false,
      "pricing": true,
      "enterprise": true,
      "legal": true,
      "security": true
    },
    "quietHours": {
      "timezone": "America/New_York",
      "start": "19:00",
      "end": "08:00"
    }
  }'::jsonb
)
on conflict (agent_name) do nothing;

-- ─── 4. Feature flag — created KILLED ────────────────────────────────────────
-- Row shape matches lit_feature_flags (20260513150000): key/label/description/
-- scope/global_kill/rollout/owner. global_kill=true + rollout=0 ⇒ OFF.
-- Do NOT read this via lit_provider_flag() (fail-open); Harvey code queries the
-- row directly and treats missing-or-killed as disabled (fail closed).
insert into public.lit_feature_flags (key, label, description, scope, global_kill, rollout, owner)
values (
  'harvey_internal_agent',
  'Harvey internal SDR agent',
  'Master kill switch for the internal-only Harvey autonomous sales agent. Fail-CLOSED consumer: the harvey-controller edge fn requires this row to exist with global_kill=false. Flip via lit_admin_set_flag(''harvey_internal_agent'',''global_kill'',''false'') only after Batch-2 verification.',
  'global',
  true,
  0,
  'growth'
)
on conflict (key) do nothing;
