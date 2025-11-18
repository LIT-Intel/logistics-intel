-- Params: @company_id STRING, @limit INT64, @offset INT64
WITH base AS (
  SELECT
    SAFE.CAST(date AS DATE) AS date,
    origin_country, dest_country, mode, hs_code,
    carrier, value_usd, gross_weight_kg
  FROM `lit.shipments_daily_part`
  WHERE company_id = @company_id
),
count_total AS (SELECT COUNT(*) AS total FROM base),
paged AS (
  SELECT * FROM base
  ORDER BY date DESC
  LIMIT @limit OFFSET @offset
)
SELECT (SELECT total FROM count_total) AS total,
       ARRAY_AGG(STRUCT(date, origin_country, dest_country, mode, hs_code, carrier, value_usd, gross_weight_kg)) AS shipments
FROM paged;


