-- Data-layer guard for P0-L deep-history rows.
--
-- The snapshot materializer (_shared/materialize_bols.ts) sweeps
-- lit_unified_shipments rows whose BOL fell out of the 50-row
-- parsed_summary.recent_bols window. Deep-history rows written by
-- company-history-ingest (ingest_source='history') are OUTSIDE that window by
-- design and must never be swept — the TS-side filter now excludes them, but
-- any stale deployed bundle (or future regression) would still delete them.
-- This BEFORE DELETE trigger makes the invariant deploy-order-independent:
-- history rows silently survive deletes unless the session opts in via
--   select set_config('lit.allow_history_delete', 'on', true);
-- (escape hatch for intentional cleanup/GDPR).

create or replace function public.lit_guard_history_shipment_delete()
returns trigger
language plpgsql
as $$
begin
  if old.ingest_source = 'history'
     and coalesce(current_setting('lit.allow_history_delete', true), '') <> 'on'
  then
    return null; -- skip this row's delete
  end if;
  return old;
end;
$$;

drop trigger if exists lit_unified_shipments_history_guard on public.lit_unified_shipments;
create trigger lit_unified_shipments_history_guard
  before delete on public.lit_unified_shipments
  for each row
  execute function public.lit_guard_history_shipment_delete();
