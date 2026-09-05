-- Extract the "hidden" BOL fields from raw_payload into real, queryable columns.
--
-- Sept-2026 deep audit found these fields present in raw_payload on nearly every
-- row but never materialized (so nothing could filter/aggregate on them):
--   Consignee_Address  99.7%  — facility-level delivery address (domestic story)
--   Shipper_Address    99.5%  — supplier facility address
--   Notify_Party_Name  22.0%  — the importer's forwarder / customs broker
--                                (Flexport, Edray, …) = incumbent-3PL intel
--   house_bill_of_lading 63.7% — links house→master consolidation chains
--   shipping_route     84.5%  — trade-lane tags
--   Quantity/Unit      99.8%  — cartons etc.
--
-- Additive only. Backfills existing 23k rows from raw_payload; the ingest
-- mapper (_shared/materialize_bols.ts buildRow) populates them going forward.

ALTER TABLE public.lit_unified_shipments
  ADD COLUMN IF NOT EXISTS consignee_address    text,
  ADD COLUMN IF NOT EXISTS shipper_address      text,
  ADD COLUMN IF NOT EXISTS notify_party_name    text,
  ADD COLUMN IF NOT EXISTS notify_party_address text,
  ADD COLUMN IF NOT EXISTS house_bol            text,
  ADD COLUMN IF NOT EXISTS shipping_route       text,
  ADD COLUMN IF NOT EXISTS quantity             numeric,
  ADD COLUMN IF NOT EXISTS quantity_unit        text;

UPDATE public.lit_unified_shipments SET
  consignee_address    = COALESCE(consignee_address,    NULLIF(raw_payload->>'Consignee_Address','')),
  shipper_address      = COALESCE(shipper_address,      NULLIF(raw_payload->>'Shipper_Address','')),
  notify_party_name    = COALESCE(notify_party_name,    NULLIF(raw_payload->>'Notify_Party_Name','')),
  notify_party_address = COALESCE(notify_party_address, NULLIF(raw_payload->>'Notify_Party_Address','')),
  house_bol            = COALESCE(house_bol,            NULLIF(raw_payload->>'house_bill_of_lading','')),
  shipping_route       = COALESCE(shipping_route,       NULLIF(raw_payload->>'shipping_route','')),
  quantity             = COALESCE(quantity, CASE WHEN raw_payload->>'Quantity' ~ '^[0-9]+(\.[0-9]+)?$'
                                                 THEN (raw_payload->>'Quantity')::numeric END),
  quantity_unit        = COALESCE(quantity_unit,        NULLIF(raw_payload->>'Quantity_Unit',''))
WHERE raw_payload IS NOT NULL;

-- Forwarder aggregation + graph joins
CREATE INDEX IF NOT EXISTS idx_lus_notify_party
  ON public.lit_unified_shipments (notify_party_name) WHERE notify_party_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lus_company_notify
  ON public.lit_unified_shipments (company_id, notify_party_name) WHERE notify_party_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lus_shipper
  ON public.lit_unified_shipments (shipper_name) WHERE shipper_name IS NOT NULL;
