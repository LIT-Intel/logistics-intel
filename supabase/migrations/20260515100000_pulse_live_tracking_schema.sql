-- 20260515100000_pulse_live_tracking_schema.sql
-- Pulse LIVE Task B1 (revised for Option 2):
-- Creates lit_unified_shipments materialized BOL table + lit_bol_tracking_events.

BEGIN;

CREATE TABLE IF NOT EXISTS public.lit_unified_shipments (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               text NOT NULL,
  bol_number               text NOT NULL,
  master_bol               text,
  bol_date                 timestamptz,
  scac                     text,
  carrier_name             text,
  shipper_name             text,
  consignee_name           text,
  origin_country           text,
  origin_country_code      text,
  destination_country      text,
  destination_country_code text,
  origin_port              text,
  destination_port         text,
  dest_city                text,
  dest_state               text,
  hs_code                  text,
  product_description      text,
  container_count          integer,
  teu                      numeric,
  weight_kg                numeric,
  lcl                      boolean,
  load_type                text,
  shipping_cost_usd        numeric,
  raw_payload              jsonb,
  tracking_status          text,
  tracking_eta             timestamptz,
  tracking_arrival_actual  timestamptz,
  tracking_last_event_code text,
  tracking_last_event_at   timestamptz,
  tracking_refreshed_at    timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS lit_unified_shipments_bol_unique
  ON public.lit_unified_shipments (company_id, bol_number);
CREATE INDEX IF NOT EXISTS lit_unified_shipments_company_date_idx
  ON public.lit_unified_shipments (company_id, bol_date DESC);
CREATE INDEX IF NOT EXISTS lit_unified_shipments_scac_idx
  ON public.lit_unified_shipments (scac);
CREATE INDEX IF NOT EXISTS lit_unified_shipments_dest_idx
  ON public.lit_unified_shipments (destination_port);
CREATE INDEX IF NOT EXISTS lit_unified_shipments_hs_idx
  ON public.lit_unified_shipments (hs_code);
CREATE INDEX IF NOT EXISTS lit_unified_shipments_tracking_refresh_idx
  ON public.lit_unified_shipments (tracking_refreshed_at NULLS FIRST)
  WHERE tracking_arrival_actual IS NULL;

ALTER TABLE public.lit_unified_shipments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lit_unified_shipments_service_role_all"
  ON public.lit_unified_shipments FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY "lit_unified_shipments_read_authenticated"
  ON public.lit_unified_shipments FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.lit_bol_tracking_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bol_number        text NOT NULL,
  scac              text NOT NULL,
  carrier           text NOT NULL,
  event_code        text NOT NULL,
  event_classifier  text,
  event_timestamp   timestamptz NOT NULL,
  location_name     text,
  location_unloc    text,
  vessel_name       text,
  voyage_number     text,
  container_number  text,
  raw_payload       jsonb,
  fetched_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS lit_bol_tracking_events_dedup
  ON public.lit_bol_tracking_events (bol_number, event_code, event_timestamp, coalesce(container_number, ''));
CREATE INDEX IF NOT EXISTS lit_bol_tracking_events_bol_idx
  ON public.lit_bol_tracking_events (bol_number, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS lit_bol_tracking_events_scac_idx
  ON public.lit_bol_tracking_events (scac, fetched_at DESC);

ALTER TABLE public.lit_bol_tracking_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lit_bol_tracking_events_service_role_all"
  ON public.lit_bol_tracking_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY "lit_bol_tracking_events_read_authenticated"
  ON public.lit_bol_tracking_events FOR SELECT TO authenticated USING (true);

COMMIT;
