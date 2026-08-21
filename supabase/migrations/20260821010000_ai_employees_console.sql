-- ─────────────────────────────────────────────────────────────────────────────
-- AI Employees console — admin backend (Harvey + future agents).
--
-- Applied by the orchestrator via MCP (mcp apply_migration). Do NOT apply by
-- hand; this file is written to be applied verbatim to prod, idempotently.
--
-- Builds on 20260821000000_harvey_foundation.sql (which created
-- lit_agent_runs / lit_agent_knowledge / lit_agent_config + the
-- 'harvey_internal_agent' fail-closed feature flag and the
-- public.lit_agent_touch_updated_at() trigger fn).
--
-- What this adds (multi-agent from the start — agent_name keys every row):
--   1. lit_agent_chat_messages — the admin<->agent conversation log for the
--      "AI Employees" console. Read: lead-CRM members. Write: service-role
--      only (the ai-employee-console edge fn writes both user + assistant
--      turns; there are no client write policies).
--   2. lit_agent_tasks — human-assigned tasks queued for an agent. Read:
--      lead-CRM members. Write: service-role only. updated_at maintained by
--      the shared lit_agent_touch_updated_at trigger.
--   3. Adds a "profile" display object to the seeded 'harvey' config row so
--      the console UI has display metadata (name, role, avatar, accent,
--      capabilities). Idempotent merge — existing config keys are preserved.
--   4. Seeds a handful of approved lit_agent_knowledge rows for Harvey
--      (short, factual — LIT is a freight-intelligence + CRM SaaS; no
--      invented features). Each insert is guarded by a not-exists check on a
--      stable title so re-running is a no-op.
--
-- Access model mirrors the Harvey foundation exactly:
--   - READ:  authenticated users passing public.is_lead_crm_member(auth.uid())
--   - WRITE: service-role only (no authenticated INSERT/UPDATE/DELETE policies)
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. lit_agent_chat_messages — admin<->agent conversation log ──────────────
create table if not exists public.lit_agent_chat_messages (
  id            uuid primary key default gen_random_uuid(),
  agent_name    text not null,
  role          text not null check (role in ('user','assistant','system')),
  content       text not null,
  user_id       uuid references auth.users(id),
  metadata_json jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists lit_agent_chat_messages_agent_created_idx
  on public.lit_agent_chat_messages (agent_name, created_at);

alter table public.lit_agent_chat_messages enable row level security;

drop policy if exists lit_agent_chat_messages_member_read on public.lit_agent_chat_messages;
create policy lit_agent_chat_messages_member_read on public.lit_agent_chat_messages
  for select to authenticated
  using (public.is_lead_crm_member(auth.uid()));
-- Deliberately NO insert/update/delete policies: writes are service-role only
-- (the ai-employee-console edge fn writes both user and assistant turns).

comment on table public.lit_agent_chat_messages is
  'AI Employees console: admin<->agent chat log, one row per turn. Read: lead-CRM members. Write: service-role only.';

-- ─── 2. lit_agent_tasks — human-assigned agent tasks ─────────────────────────
create table if not exists public.lit_agent_tasks (
  id              uuid primary key default gen_random_uuid(),
  agent_name      text not null,
  title           text not null,
  instructions    text,
  status          text not null default 'queued'
                    check (status in ('queued','in_progress','done','cancelled','failed')),
  priority        int default 0,
  created_by      uuid references auth.users(id),
  assigned_run_id uuid,
  result_json     jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index if not exists lit_agent_tasks_agent_status_created_idx
  on public.lit_agent_tasks (agent_name, status, created_at desc);

drop trigger if exists trg_lit_agent_tasks_touch on public.lit_agent_tasks;
create trigger trg_lit_agent_tasks_touch
  before update on public.lit_agent_tasks
  for each row execute function public.lit_agent_touch_updated_at();

alter table public.lit_agent_tasks enable row level security;

drop policy if exists lit_agent_tasks_member_read on public.lit_agent_tasks;
create policy lit_agent_tasks_member_read on public.lit_agent_tasks
  for select to authenticated
  using (public.is_lead_crm_member(auth.uid()));
-- Writes are service-role only (no authenticated write policies).

comment on table public.lit_agent_tasks is
  'AI Employees console: human-assigned tasks queued for an agent. Read: lead-CRM members. Write: service-role only.';

-- ─── 3. Harvey config: add display "profile" (idempotent merge) ──────────────
-- Merge a profile object into the existing config jsonb, preserving all other
-- keys. Only writes when the profile is absent/changed so re-running is a
-- no-op (avoids a spurious updated_at bump on every apply).
update public.lit_agent_config
set config = config || jsonb_build_object(
  'profile', jsonb_build_object(
    'displayName', 'Harvey',
    'role',        'Sales Development Rep',
    'tagline',     'Finds freight prospects, researches them, and runs internal outreach.',
    'avatarKey',   'harvey',
    'accent',      '#2563EB',
    'capabilities', jsonb_build_array(
      'Prospecting', 'Research', 'Email', 'LinkedIn', 'Reply handling'
    )
  )
)
where agent_name = 'harvey'
  and config -> 'profile' is distinct from jsonb_build_object(
    'displayName', 'Harvey',
    'role',        'Sales Development Rep',
    'tagline',     'Finds freight prospects, researches them, and runs internal outreach.',
    'avatarKey',   'harvey',
    'accent',      '#2563EB',
    'capabilities', jsonb_build_array(
      'Prospecting', 'Research', 'Email', 'LinkedIn', 'Reply handling'
    )
  );

-- ─── 4. Seed approved Harvey knowledge (short, factual, idempotent) ──────────
-- No unique constraint exists on lit_agent_knowledge.title, so each insert is
-- guarded by a not-exists check on a stable title.
insert into public.lit_agent_knowledge (category, title, content, source, approved)
select 'product', 'What Logistics Intel is',
  'Logistics Intel (LIT) is a B2B SaaS that combines freight intelligence with a built-in CRM. It turns customs/bill-of-lading shipment data into a searchable view of who ships what, then lets sales teams save target companies, research them, and run outreach — all in one tool. Describe only capabilities that exist; never invent features.',
  'seed', true
where not exists (select 1 from public.lit_agent_knowledge where title = 'What Logistics Intel is');

insert into public.lit_agent_knowledge (category, title, content, source, approved)
select 'freight_sales', 'The freight-intelligence advantage',
  'LIT''s edge over generic prospecting tools is real shipment evidence: BOL/customs records reveal a company''s actual trade lanes, commodities, and shipping cadence. That lets a rep open with a specific, provable observation about the prospect''s freight instead of a generic pitch. Ground every claim in the shipment data you have; do not fabricate volumes or lanes.',
  'seed', true
where not exists (select 1 from public.lit_agent_knowledge where title = 'The freight-intelligence advantage');

insert into public.lit_agent_knowledge (category, title, content, source, approved)
select 'freight_sales', 'Ideal customer profile (ICP)',
  'Harvey''s ICP is freight-sales teams: freight brokers, 3PLs, NVOCCs, freight forwarders, and carrier sales/BDRs who sell transportation services and need to find and qualify shippers. Secondary fit: logistics-focused sales and RevOps teams. Prospects are typically the head of sales, BD, or a sales/BDR rep at those companies.',
  'seed', true
where not exists (select 1 from public.lit_agent_knowledge where title = 'Ideal customer profile (ICP)');

insert into public.lit_agent_knowledge (category, title, content, source, approved)
select 'email_style', 'Anti-AI-tell copy rules',
  'Write outreach that does not read as AI-generated. Keep it short (a few sentences). Lead with one specific, shipment-grounded observation about the prospect. Avoid filler openers ("I hope this email finds you well"), buzzwords ("leverage", "synergy", "revolutionary", "cutting-edge"), em-dash-heavy cadence, and over-formality. One clear ask; a plain, human sign-off. Never overstate what LIT does.',
  'seed', true
where not exists (select 1 from public.lit_agent_knowledge where title = 'Anti-AI-tell copy rules');

insert into public.lit_agent_knowledge (category, title, content, source, approved)
select 'compliance', 'Outreach compliance basics',
  'All outbound outreach must respect opt-outs and anti-spam law (CAN-SPAM / GDPR where applicable): honor unsubscribe/opt-out requests immediately, never obscure sender identity, and escalate any legal, hostile, or opt-out reply to a human rather than continuing to message. When unsure whether a claim or action is compliant, stop and defer to a human.',
  'seed', true
where not exists (select 1 from public.lit_agent_knowledge where title = 'Outreach compliance basics');
