-- 20260812200000_lit_fuel_index.sql
--
-- CEO trust P0 #3 — EIA diesel fuel index for the drayage cost model.
--
-- `_shared/drayage_cost.ts` previously hardcoded a flat 22% fuel surcharge.
-- This table stores the EIA weekly US on-highway diesel retail price so the
-- surcharge becomes diesel-indexed:
--   fuel/mile = (diesel_usd_gal − 1.20 peg) / 6.0 mpg
-- Refreshed weekly by the `fuel-index-refresh` edge function (pg_cron below);
-- estimator falls back to the flat 22% whenever this table is empty.

create table if not exists public.lit_fuel_index (
  week_of        date primary key,
  diesel_usd_gal numeric not null check (diesel_usd_gal > 0),
  source         text not null default 'EIA',
  created_at     timestamptz not null default now()
);

comment on table public.lit_fuel_index is
  'Weekly EIA US on-highway diesel retail price ($/gal). Written by the fuel-index-refresh edge fn (cron); read by _shared/drayage_cost.ts for the diesel-indexed drayage fuel surcharge.';

alter table public.lit_fuel_index enable row level security;

-- Read-only for signed-in users (rate transparency); writes go through the
-- service role only (fuel-index-refresh edge fn), no insert/update policies.
drop policy if exists "lit_fuel_index_read" on public.lit_fuel_index;
create policy "lit_fuel_index_read"
  on public.lit_fuel_index
  for select
  to authenticated
  using (true);

-- Seed with the current published value (EIA week ending 2026-08-10) so the
-- diesel-indexed formula works immediately, before the first cron run.
insert into public.lit_fuel_index (week_of, diesel_usd_gal, source)
values ('2026-08-10', 5.257, 'EIA')
on conflict (week_of) do update
  set diesel_usd_gal = excluded.diesel_usd_gal,
      source = excluded.source;

-- Weekly refresh — Tuesday 12:30 UTC (EIA publishes Monday afternoon ET).
-- Same vault-secret + net.http_post pattern as the other LIT cron jobs.
do $$
begin
  perform cron.unschedule('lit-fuel-index-weekly');
exception when others then
  null; -- job didn't exist yet
end $$;

select cron.schedule(
  'lit-fuel-index-weekly',
  '30 12 * * 2',
  $cron$
  select net.http_post(
    url := 'https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/fuel-index-refresh',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Cron', (select decrypted_secret from vault.decrypted_secrets where name = 'LIT_CRON_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 50000
  ) as request_id;
  $cron$
);
