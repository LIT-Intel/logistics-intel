-- P0: lit_extract_iy_snapshot_intel aborted EVERY snapshot upsert whenever
-- ImportYeti returned data.lane_permutations or data.other_addresses_contact_info
-- as a JSON OBJECT instead of an array ("cannot extract elements from an
-- object", SQLSTATE 22023). The `?` existence check does not guarantee shape.
-- Because the extraction runs in a BEFORE/AFTER INSERT trigger
-- (lit_iy_snapshot_extract on lit_importyeti_company_snapshot), the throw
-- rolled back the snapshot write itself → affected companies could NEVER
-- materialize a profile (owner repro 2026-09-10: amneal-pharmaceuticals,
-- american-global-logistics → permanent "Company"/Snapshot-pending page).
--
-- Fix (original fn: 20260819210000_lit_company_port_lanes_extraction.sql):
-- 1. lit_jsonb_elems(): yields elements for arrays AND values for keyed
--    objects (IY serializes some lists as {"0":{...},"1":{...}} maps), empty
--    set for anything else — never throws on shape.
-- 2. The whole extraction body is wrapped in an exception handler: derived
--    intel (port lanes, facilities) is best-effort and must NEVER block the
--    source-of-truth snapshot upsert. Failures raise a WARNING (visible in
--    Postgres logs) instead of aborting the transaction.

create or replace function public.lit_jsonb_elems(j jsonb)
returns setof jsonb
language sql
immutable
as $$
  select e from jsonb_array_elements(
    case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end) e
  union all
  select t.value from jsonb_each(
    case when jsonb_typeof(j) = 'object' then j else '{}'::jsonb end) t
$$;

create or replace function public.lit_extract_iy_snapshot_intel(p_company_id text, p_raw jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_raw is null or p_company_id is null then return; end if;

  -- Port-pair lanes.
  if jsonb_typeof(p_raw->'data'->'lane_permutations') in ('array', 'object') then
    delete from public.lit_company_port_lanes where company_id = p_company_id;
    insert into public.lit_company_port_lanes
      (company_id, exit_port, exit_port_country, entry_port, entry_port_region, shipments, weight_kg, teu)
    select
      p_company_id,
      btrim(l->>'exit_port'),
      nullif(btrim(l->>'exit_port_country'), ''),
      btrim(l->>'entry_port'),
      nullif(btrim(l->>'entry_port_region'), ''),
      coalesce((l->>'shipments')::bigint, 0),
      nullif(l->>'weight', '')::numeric,
      nullif(l->>'teu', '')::numeric
    from public.lit_jsonb_elems(p_raw->'data'->'lane_permutations') l
    where jsonb_typeof(l) = 'object'
      and coalesce(btrim(l->>'exit_port'), '') <> ''
      and coalesce(btrim(l->>'entry_port'), '') <> ''
    on conflict (company_id, exit_port, entry_port) do update
      set shipments = excluded.shipments, weight_kg = excluded.weight_kg,
          teu = excluded.teu, exit_port_country = excluded.exit_port_country,
          entry_port_region = excluded.entry_port_region, updated_at = now();
  end if;

  -- Facility network (addresses + recency + contacts). Dates are DD/MM/YYYY.
  if jsonb_typeof(p_raw->'data'->'other_addresses_contact_info') in ('array', 'object') then
    delete from public.lit_company_iy_facilities where company_id = p_company_id;
    insert into public.lit_company_iy_facilities
      (company_id, address, last_shipment_to, emails, phone_numbers)
    select distinct on (btrim(f->>'address'))
      p_company_id,
      btrim(f->>'address'),
      case when (f->>'most_recent_shipment_to') ~ '^\d{2}/\d{2}/\d{4}$'
           then to_date(f->>'most_recent_shipment_to', 'DD/MM/YYYY') end,
      coalesce(f->'contact_info_data'->'emails', '[]'::jsonb),
      coalesce(f->'contact_info_data'->'phone_numbers', '[]'::jsonb)
    from public.lit_jsonb_elems(p_raw->'data'->'other_addresses_contact_info') f
    where jsonb_typeof(f) = 'object'
      and coalesce(btrim(f->>'address'), '') <> ''
    on conflict (company_id, address) do update
      set last_shipment_to = excluded.last_shipment_to,
          emails = excluded.emails, phone_numbers = excluded.phone_numbers,
          updated_at = now();
  end if;
exception when others then
  -- Derived intel must never block the snapshot write.
  raise warning 'lit_extract_iy_snapshot_intel: skipped for % (%: %)',
    p_company_id, sqlstate, sqlerrm;
end;
$function$;
