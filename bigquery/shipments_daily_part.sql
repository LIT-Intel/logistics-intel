-- Creates/refreshes the daily partitioned snapshot for shipments (12m rolling)
CREATE SCHEMA IF NOT EXISTS `lit`;

CREATE TABLE IF NOT EXISTS `lit.shipments_daily_part` (
  date DATE,
  origin_country STRING,
  dest_country STRING,
  origin_state STRING,
  dest_state STRING,
  origin_postal STRING,
  dest_postal STRING,
  mode STRING,
  hs_code STRING,
  company_id STRING,
  company_name STRING,
  carrier STRING,
  value_usd NUMERIC,
  gross_weight_kg NUMERIC
)
PARTITION BY date;

-- Idempotent refresh for today's partition from source view
DECLARE today DATE DEFAULT CURRENT_DATE();
DELETE FROM `lit.shipments_daily_part` WHERE date = today;

INSERT INTO `lit.shipments_daily_part`
SELECT
  CAST(date AS DATE) AS date,
  origin_country, dest_country,
  origin_state, dest_state, origin_postal, dest_postal,
  mode, hs_code, company_id, company_name, carrier,
  value_usd, gross_weight_kg
FROM `lit.v_shipments_resolved`
WHERE CAST(date AS DATE) = today;
