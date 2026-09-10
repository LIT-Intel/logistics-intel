-- MX pedimento field normalization + name-variant merge (v3 profile RPC)
-- 1) New normalized columns on both declaration tables
-- 2) Backfill from raw_payload with numeric-regex guards
-- 3) BEFORE INSERT trigger to normalize future rows (none existed before)
-- 4) lit_mx_company_profile v3: RFC + punctuation-normalized name-variant merge,
--    plus regimes / name_variants / quantities rollups and richer declaration rows.

-- ============ 1. Columns ============
ALTER TABLE public.lit_mx_import_declarations
  ADD COLUMN IF NOT EXISTS hts_code text,
  ADD COLUMN IF NOT EXISTS quantity numeric,
  ADD COLUMN IF NOT EXISTS quantity_unit text,
  ADD COLUMN IF NOT EXISTS unit_value numeric,
  ADD COLUMN IF NOT EXISTS customs_value numeric,
  ADD COLUMN IF NOT EXISTS commercial_value numeric,
  ADD COLUMN IF NOT EXISTS custom_regime text,
  ADD COLUMN IF NOT EXISTS counterparty_state text,
  ADD COLUMN IF NOT EXISTS counterparty_address text,
  ADD COLUMN IF NOT EXISTS pedimento_number text;

ALTER TABLE public.lit_mx_export_declarations
  ADD COLUMN IF NOT EXISTS hts_code text,
  ADD COLUMN IF NOT EXISTS quantity numeric,
  ADD COLUMN IF NOT EXISTS quantity_unit text,
  ADD COLUMN IF NOT EXISTS unit_value numeric,
  ADD COLUMN IF NOT EXISTS customs_value numeric,
  ADD COLUMN IF NOT EXISTS commercial_value numeric,
  ADD COLUMN IF NOT EXISTS custom_regime text,
  ADD COLUMN IF NOT EXISTS counterparty_state text,
  ADD COLUMN IF NOT EXISTS counterparty_address text,
  ADD COLUMN IF NOT EXISTS pedimento_number text;

-- ============ 2. Backfill ============
UPDATE public.lit_mx_import_declarations SET
  hts_code            = COALESCE(hts_code, NULLIF(raw_payload->>'hts_code','')),
  quantity            = COALESCE(quantity,
                          CASE WHEN raw_payload->>'quantity' ~ '^[0-9]+(\.[0-9]+)?$' THEN (raw_payload->>'quantity')::numeric END,
                          CASE WHEN raw_payload->>'quantity_commercial' ~ '^[0-9]+(\.[0-9]+)?$' THEN (raw_payload->>'quantity_commercial')::numeric END),
  quantity_unit       = COALESCE(quantity_unit, NULLIF(raw_payload->>'quantity_unit_commercial','')),
  unit_value          = COALESCE(unit_value,
                          CASE WHEN raw_payload->>'unit_value' ~ '^[0-9]+(\.[0-9]+)?$' THEN (raw_payload->>'unit_value')::numeric END),
  customs_value       = COALESCE(customs_value,
                          CASE WHEN raw_payload->>'customs_value' ~ '^[0-9]+(\.[0-9]+)?$' THEN (raw_payload->>'customs_value')::numeric END),
  commercial_value    = COALESCE(commercial_value,
                          CASE WHEN raw_payload->>'commercial_value' ~ '^[0-9]+(\.[0-9]+)?$' THEN (raw_payload->>'commercial_value')::numeric END),
  custom_regime       = COALESCE(custom_regime, NULLIF(raw_payload->>'custom_regime','')),
  counterparty_state  = COALESCE(counterparty_state, NULLIF(raw_payload->>'supplier_state','')),
  counterparty_address= COALESCE(counterparty_address, NULLIF(raw_payload->>'supplier_address','')),
  pedimento_number    = COALESCE(pedimento_number, NULLIF(raw_payload->>'pedimento_number',''), NULLIF(raw_payload->>'declaration_number',''))
WHERE raw_payload IS NOT NULL;

UPDATE public.lit_mx_export_declarations SET
  hts_code            = COALESCE(hts_code, NULLIF(raw_payload->>'hts_code','')),
  quantity            = COALESCE(quantity,
                          CASE WHEN raw_payload->>'quantity' ~ '^[0-9]+(\.[0-9]+)?$' THEN (raw_payload->>'quantity')::numeric END,
                          CASE WHEN raw_payload->>'quantity_commercial' ~ '^[0-9]+(\.[0-9]+)?$' THEN (raw_payload->>'quantity_commercial')::numeric END),
  quantity_unit       = COALESCE(quantity_unit, NULLIF(raw_payload->>'quantity_unit_commercial','')),
  unit_value          = COALESCE(unit_value,
                          CASE WHEN raw_payload->>'unit_value' ~ '^[0-9]+(\.[0-9]+)?$' THEN (raw_payload->>'unit_value')::numeric END),
  customs_value       = COALESCE(customs_value,
                          CASE WHEN raw_payload->>'customs_value' ~ '^[0-9]+(\.[0-9]+)?$' THEN (raw_payload->>'customs_value')::numeric END),
  commercial_value    = COALESCE(commercial_value,
                          CASE WHEN raw_payload->>'commercial_value' ~ '^[0-9]+(\.[0-9]+)?$' THEN (raw_payload->>'commercial_value')::numeric END),
  custom_regime       = COALESCE(custom_regime, NULLIF(raw_payload->>'custom_regime','')),
  counterparty_state  = COALESCE(counterparty_state, NULLIF(raw_payload->>'supplier_state','')),
  counterparty_address= COALESCE(counterparty_address, NULLIF(raw_payload->>'supplier_address','')),
  pedimento_number    = COALESCE(pedimento_number, NULLIF(raw_payload->>'pedimento_number',''), NULLIF(raw_payload->>'declaration_number',''))
WHERE raw_payload IS NOT NULL;

-- ============ 3. BEFORE INSERT trigger (no prior trigger existed on either table) ============
CREATE OR REPLACE FUNCTION public.lit_mx_extract_pedimento_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.raw_payload IS NULL THEN
    RETURN NEW;
  END IF;
  NEW.hts_code             := COALESCE(NEW.hts_code, NULLIF(NEW.raw_payload->>'hts_code',''));
  NEW.quantity             := COALESCE(NEW.quantity,
                                CASE WHEN NEW.raw_payload->>'quantity' ~ '^[0-9]+(\.[0-9]+)?$' THEN (NEW.raw_payload->>'quantity')::numeric END,
                                CASE WHEN NEW.raw_payload->>'quantity_commercial' ~ '^[0-9]+(\.[0-9]+)?$' THEN (NEW.raw_payload->>'quantity_commercial')::numeric END);
  NEW.quantity_unit        := COALESCE(NEW.quantity_unit, NULLIF(NEW.raw_payload->>'quantity_unit_commercial',''));
  NEW.unit_value           := COALESCE(NEW.unit_value,
                                CASE WHEN NEW.raw_payload->>'unit_value' ~ '^[0-9]+(\.[0-9]+)?$' THEN (NEW.raw_payload->>'unit_value')::numeric END);
  NEW.customs_value        := COALESCE(NEW.customs_value,
                                CASE WHEN NEW.raw_payload->>'customs_value' ~ '^[0-9]+(\.[0-9]+)?$' THEN (NEW.raw_payload->>'customs_value')::numeric END);
  NEW.commercial_value     := COALESCE(NEW.commercial_value,
                                CASE WHEN NEW.raw_payload->>'commercial_value' ~ '^[0-9]+(\.[0-9]+)?$' THEN (NEW.raw_payload->>'commercial_value')::numeric END);
  NEW.custom_regime        := COALESCE(NEW.custom_regime, NULLIF(NEW.raw_payload->>'custom_regime',''));
  NEW.counterparty_state   := COALESCE(NEW.counterparty_state, NULLIF(NEW.raw_payload->>'supplier_state',''));
  NEW.counterparty_address := COALESCE(NEW.counterparty_address, NULLIF(NEW.raw_payload->>'supplier_address',''));
  NEW.pedimento_number     := COALESCE(NEW.pedimento_number, NULLIF(NEW.raw_payload->>'pedimento_number',''), NULLIF(NEW.raw_payload->>'declaration_number',''));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lit_mx_import_extract_fields ON public.lit_mx_import_declarations;
CREATE TRIGGER trg_lit_mx_import_extract_fields
  BEFORE INSERT ON public.lit_mx_import_declarations
  FOR EACH ROW EXECUTE FUNCTION public.lit_mx_extract_pedimento_fields();

DROP TRIGGER IF EXISTS trg_lit_mx_export_extract_fields ON public.lit_mx_export_declarations;
CREATE TRIGGER trg_lit_mx_export_extract_fields
  BEFORE INSERT ON public.lit_mx_export_declarations
  FOR EACH ROW EXECUTE FUNCTION public.lit_mx_extract_pedimento_fields();

-- ============ 4. lit_mx_company_profile v3 (RFC + name-variant merge) ============
CREATE OR REPLACE FUNCTION public.lit_mx_company_profile(p_name text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH norm AS (
  SELECT regexp_replace(lower(p_name), '[^a-z0-9]', '', 'g') AS np
),
-- First pass: resolve p_name (raw prefix OR punctuation-normalized prefix) to RFC values
seed_rfcs AS (
  SELECT DISTINCT rfc FROM (
    SELECT i.importer_rfc AS rfc
    FROM lit_mx_import_declarations i, norm
    WHERE i.importer_name ILIKE p_name || '%'
       OR regexp_replace(lower(i.importer_name), '[^a-z0-9]', '', 'g') LIKE (SELECT np FROM norm) || '%'
    UNION ALL
    SELECT e.exporter_rfc
    FROM lit_mx_export_declarations e, norm
    WHERE e.exporter_name ILIKE p_name || '%'
       OR regexp_replace(lower(e.exporter_name), '[^a-z0-9]', '', 'g') LIKE (SELECT np FROM norm) || '%'
  ) s
  WHERE rfc IS NOT NULL AND btrim(rfc) <> ''
),
-- Second pass: include ALL rows matching by name prefix, normalized-name prefix, or shared RFC
imp AS (
  SELECT * FROM lit_mx_import_declarations i
  WHERE i.importer_name ILIKE p_name || '%'
     OR regexp_replace(lower(i.importer_name), '[^a-z0-9]', '', 'g') LIKE (SELECT np FROM norm) || '%'
     OR i.importer_rfc IN (SELECT rfc FROM seed_rfcs)
),
exp AS (
  SELECT * FROM lit_mx_export_declarations e
  WHERE e.exporter_name ILIKE p_name || '%'
     OR regexp_replace(lower(e.exporter_name), '[^a-z0-9]', '', 'g') LIKE (SELECT np FROM norm) || '%'
     OR e.exporter_rfc IN (SELECT rfc FROM seed_rfcs)
),
uni AS (
  SELECT declaration_date, transport_type,
         COALESCE(customs_office, NULLIF(raw_payload->>'departure_port',''), NULLIF(raw_payload->>'entry_port','')) AS customs_office,
         supplier_name AS counterparty, supplier_country AS counterparty_country,
         COALESCE(counterparty_state, NULLIF(raw_payload->>'supplier_state','')) AS counterparty_state,
         COALESCE(customs_broker_name, NULLIF(raw_payload->>'custom_broker','')) AS customs_broker_name,
         hs_code, product_description,
         COALESCE(hts_code, NULLIF(raw_payload->>'hts_code','')) AS hts_code,
         COALESCE(value_usd, CASE WHEN raw_payload->>'value_in_usd' ~ '^[0-9]+(\.[0-9]+)?$' THEN (raw_payload->>'value_in_usd')::numeric END) AS value_usd,
         COALESCE(weight_kg, CASE WHEN raw_payload->>'weight' ~ '^[0-9]+(\.[0-9]+)?$' THEN (raw_payload->>'weight')::numeric END) AS weight_kg,
         COALESCE(quantity,
                  CASE WHEN raw_payload->>'quantity' ~ '^[0-9]+(\.[0-9]+)?$' THEN (raw_payload->>'quantity')::numeric END,
                  CASE WHEN raw_payload->>'quantity_commercial' ~ '^[0-9]+(\.[0-9]+)?$' THEN (raw_payload->>'quantity_commercial')::numeric END) AS quantity,
         COALESCE(quantity_unit, NULLIF(raw_payload->>'quantity_unit_commercial','')) AS quantity_unit,
         COALESCE(unit_value, CASE WHEN raw_payload->>'unit_value' ~ '^[0-9]+(\.[0-9]+)?$' THEN (raw_payload->>'unit_value')::numeric END) AS unit_value,
         COALESCE(custom_regime, NULLIF(raw_payload->>'custom_regime','')) AS custom_regime,
         COALESCE(pedimento_number, NULLIF(raw_payload->>'pedimento_number',''), NULLIF(raw_payload->>'declaration_number','')) AS pedimento_number,
         NULLIF(raw_payload->>'incoterm','') AS incoterm,
         NULLIF(raw_payload->>'who_pays_freight','') AS who_pays_freight,
         'import' AS direction, importer_rfc AS rfc, importer_name AS matched_name
  FROM imp
  UNION ALL
  SELECT declaration_date, transport_type,
         COALESCE(customs_office, NULLIF(raw_payload->>'departure_port','')),
         consignee_name, consignee_country,
         COALESCE(counterparty_state, NULLIF(raw_payload->>'supplier_state','')),
         COALESCE(customs_broker_name, NULLIF(raw_payload->>'custom_broker','')),
         hs_code, product_description,
         COALESCE(hts_code, NULLIF(raw_payload->>'hts_code','')),
         COALESCE(value_usd, CASE WHEN raw_payload->>'value_in_usd' ~ '^[0-9]+(\.[0-9]+)?$' THEN (raw_payload->>'value_in_usd')::numeric END),
         COALESCE(weight_kg, CASE WHEN raw_payload->>'weight' ~ '^[0-9]+(\.[0-9]+)?$' THEN (raw_payload->>'weight')::numeric END),
         COALESCE(quantity,
                  CASE WHEN raw_payload->>'quantity' ~ '^[0-9]+(\.[0-9]+)?$' THEN (raw_payload->>'quantity')::numeric END,
                  CASE WHEN raw_payload->>'quantity_commercial' ~ '^[0-9]+(\.[0-9]+)?$' THEN (raw_payload->>'quantity_commercial')::numeric END),
         COALESCE(quantity_unit, NULLIF(raw_payload->>'quantity_unit_commercial','')),
         COALESCE(unit_value, CASE WHEN raw_payload->>'unit_value' ~ '^[0-9]+(\.[0-9]+)?$' THEN (raw_payload->>'unit_value')::numeric END),
         COALESCE(custom_regime, NULLIF(raw_payload->>'custom_regime','')),
         COALESCE(pedimento_number, NULLIF(raw_payload->>'pedimento_number',''), NULLIF(raw_payload->>'declaration_number','')),
         NULLIF(raw_payload->>'incoterm',''), NULLIF(raw_payload->>'who_pays_freight',''),
         'export', exporter_rfc, exporter_name
  FROM exp
),
agg AS (
  SELECT count(*) FILTER (WHERE direction='import') AS imports,
         count(*) FILTER (WHERE direction='export') AS exports,
         sum(value_usd) AS total_value_usd, sum(weight_kg) AS total_weight_kg,
         max(declaration_date) AS last_activity, min(declaration_date) AS first_activity,
         max(rfc) AS rfc
  FROM uni
),
top AS (
  SELECT
    (SELECT jsonb_agg(x) FROM (SELECT transport_type AS v, count(*) n, sum(value_usd) usd FROM uni WHERE transport_type IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 6) x) AS modes,
    (SELECT jsonb_agg(x) FROM (SELECT customs_office AS v, count(*) n FROM uni WHERE customs_office IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 6) x) AS gateways,
    (SELECT jsonb_agg(x) FROM (SELECT counterparty AS v, counterparty_country AS c, max(counterparty_state) AS state, count(*) n, sum(value_usd) usd FROM uni WHERE counterparty IS NOT NULL GROUP BY 1,2 ORDER BY n DESC LIMIT 8) x) AS counterparties,
    (SELECT jsonb_agg(x) FROM (SELECT customs_broker_name AS v, count(*) n FROM uni WHERE customs_broker_name IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 6) x) AS brokers,
    (SELECT jsonb_agg(x) FROM (SELECT hs_code AS v, max(product_description) label, count(*) n, sum(value_usd) usd FROM uni WHERE hs_code IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 8) x) AS products,
    (SELECT jsonb_agg(x) FROM (SELECT incoterm AS v, count(*) n FROM uni WHERE incoterm IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 5) x) AS incoterms,
    (SELECT jsonb_agg(x) FROM (SELECT who_pays_freight AS v, count(*) n FROM uni WHERE who_pays_freight IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 4) x) AS freight_control,
    (SELECT jsonb_agg(x) FROM (SELECT custom_regime AS v, count(*) n FROM uni WHERE custom_regime IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 8) x) AS regimes,
    (SELECT jsonb_agg(DISTINCT matched_name) FROM uni WHERE matched_name IS NOT NULL) AS name_variants,
    (SELECT jsonb_agg(x) FROM (SELECT quantity_unit AS unit, count(*) n, sum(quantity) total_qty, round(avg(unit_value), 4) avg_unit_value FROM uni WHERE quantity IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 6) x) AS quantities,
    (SELECT jsonb_agg(x) FROM (SELECT declaration_date AS d, direction, transport_type, customs_office, counterparty, hs_code, hts_code, left(product_description, 90) AS product, value_usd, weight_kg, quantity, unit_value, custom_regime, pedimento_number, incoterm, who_pays_freight FROM uni ORDER BY declaration_date DESC NULLS LAST LIMIT 30) x) AS declarations
)
SELECT jsonb_build_object(
  'name', p_name,
  'summary', (SELECT to_jsonb(agg) FROM agg),
  'modes', (SELECT modes FROM top), 'gateways', (SELECT gateways FROM top),
  'counterparties', (SELECT counterparties FROM top), 'brokers', (SELECT brokers FROM top),
  'products', (SELECT products FROM top), 'incoterms', (SELECT incoterms FROM top),
  'freight_control', (SELECT freight_control FROM top),
  'declarations', (SELECT declarations FROM top),
  'regimes', (SELECT regimes FROM top),
  'name_variants', (SELECT name_variants FROM top),
  'quantities', (SELECT quantities FROM top)
);
$function$;
