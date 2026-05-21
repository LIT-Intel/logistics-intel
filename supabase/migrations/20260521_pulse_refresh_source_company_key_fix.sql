-- =============================================================================
-- pulse_refresh_source_company_key_fix
--
-- Root cause: the pulse-refresh-tick and pulse-alert-digest edge functions
-- filter and join `lit_saved_companies` on a `source_company_key text`
-- column (the bare ImportYeti slug, e.g. 'glovis-america'). That column
-- was specified in docs/superpowers/specs/2026-05-14-pulse-refresh-alert-
-- digest-design.md but the original migration at 20260514100000_pulse_
-- refresh_schema.sql only added refresh_status, refresh_status_updated_at,
-- and consecutive_refresh_failures — it forgot source_company_key.
--
-- Production impact (2026-05-14 → 2026-05-21):
--   - pg_cron job `pulse-refresh-tick-15min` (jobid 11) fired every 15
--     minutes for ~7 days but processed 0 companies on every tick because
--     pickStaleSnapshots() and pickNeverFetched() both filter on the
--     missing column. 251 active saves accumulated 0 refreshes.
--   - 251 saves but 281 snapshots existed from earlier paths (manual sync,
--     popup capture). The slugs lit_companies stores include a 'company/'
--     URL-prefix on 686 of 726 rows, while the snapshot table uses the
--     bare slug, so even a structural fix without normalization would not
--     have joined.
--
-- Fix (applied via Supabase MCP on 2026-05-21):
--   1. Add `source_company_key text` to lit_saved_companies.
--   2. Backfill from lit_companies via the company_id FK.
--   3. Strip the 'company/' prefix on both lit_companies and lit_saved_companies
--      so the join key matches lit_importyeti_company_snapshot.company_id.
--   4. Partial index for the cron's hot filter.
--   5. BEFORE-INSERT-OR-UPDATE trigger to (a) auto-populate from lit_companies
--      when callers don't set the column, and (b) defensively strip the
--      'company/' prefix even when explicitly provided.
--
-- This file is the canonical record of the fix so future fresh
-- environments and re-deploys preserve it. It is idempotent: every
-- statement uses IF NOT EXISTS / OR REPLACE / DROP IF EXISTS, and the
-- backfill UPDATE skips rows that already have a value.
-- =============================================================================

alter table public.lit_saved_companies
  add column if not exists source_company_key text;

-- Backfill from lit_companies → lit_saved_companies via company_id.
update public.lit_saved_companies sc
set source_company_key = lc.source_company_key
from public.lit_companies lc
where lc.id = sc.company_id
  and sc.source_company_key is null
  and lc.source_company_key is not null;

-- Normalize away the legacy 'company/' URL-prefix everywhere it appears.
-- The snapshot table never used the prefix, the ImportYeti API never used
-- the prefix, so callers that store 'company/<slug>' break the join.
update public.lit_companies
set source_company_key = substring(source_company_key from 9)
where source_company_key like 'company/%';

update public.lit_saved_companies
set source_company_key = substring(source_company_key from 9)
where source_company_key like 'company/%';

create index if not exists lit_saved_companies_source_company_key_idx
  on public.lit_saved_companies (source_company_key)
  where refresh_status = 'active' and source_company_key is not null;

-- Auto-populate + defensive prefix-strip on every insert/update.
create or replace function public.set_saved_company_source_key()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.source_company_key is null and new.company_id is not null then
    select source_company_key into new.source_company_key
    from public.lit_companies
    where id = new.company_id;
  end if;
  if new.source_company_key like 'company/%' then
    new.source_company_key := substring(new.source_company_key from 9);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_saved_company_source_key on public.lit_saved_companies;
create trigger trg_set_saved_company_source_key
  before insert or update of company_id on public.lit_saved_companies
  for each row
  execute function public.set_saved_company_source_key();

comment on column public.lit_saved_companies.source_company_key is
  'Bare ImportYeti slug (e.g. "glovis-america", no "company/" prefix). Joined against lit_importyeti_company_snapshot.company_id by pulse-refresh-tick and pulse-alert-digest. Auto-populated from lit_companies via the set_saved_company_source_key trigger.';
