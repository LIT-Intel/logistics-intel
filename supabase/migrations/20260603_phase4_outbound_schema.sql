-- Phase 4 — Outbound FMCSA pipeline schema additions
-- Spec: docs/agents/LIT_PHASE_4_OUTBOUND_FMCSA_SPEC.md §5

-- Import run audit + idempotency for the monthly delta refresh
create table if not exists public.lit_fmcsa_import_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  triggered_by uuid not null references auth.users(id),
  dry_run boolean not null default false,
  mode text not null default 'initial' check (mode in ('initial','delta')),
  funnel jsonb,
  hot_count int not null default 0,
  cold_count int not null default 0,
  skipped jsonb,
  errors jsonb,
  status text not null default 'running'
    check (status in ('running','succeeded','failed','dry_run_complete'))
);

create index if not exists lit_fmcsa_import_runs_started_at_idx
  on public.lit_fmcsa_import_runs(started_at desc);

-- Per-row provenance: trace each queued send back to the run that created it
alter table public.lit_outreach_history
  add column if not exists source_run_id uuid
  references public.lit_fmcsa_import_runs(id);

-- Auto-halt registry. Dispatcher cron checks this; non-empty rows pause sends.
create table if not exists public.lit_outreach_safety_holds (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  reason text not null,
  trigger_metric text,
  trigger_value numeric,
  cleared_at timestamptz,
  cleared_by uuid references auth.users(id)
);

create index if not exists lit_outreach_safety_holds_active_idx
  on public.lit_outreach_safety_holds(created_at desc)
  where cleared_at is null;

-- Per-recipient pause flag. Dispatcher skips rows where paused_at is set.
alter table public.lit_lead_sequence_queue
  add column if not exists paused_at timestamptz;

-- RLS: platform_admins read everything, nobody else
alter table public.lit_fmcsa_import_runs enable row level security;
alter table public.lit_outreach_safety_holds enable row level security;

drop policy if exists "platform_admins_select_fmcsa_runs" on public.lit_fmcsa_import_runs;
create policy "platform_admins_select_fmcsa_runs"
  on public.lit_fmcsa_import_runs
  for select
  using (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()));

drop policy if exists "platform_admins_select_safety_holds" on public.lit_outreach_safety_holds;
create policy "platform_admins_select_safety_holds"
  on public.lit_outreach_safety_holds
  for select
  using (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()));
