-- Parameterized by @company_id, @limit, @offset
WITH base AS (
  SELECT * FROM `lit.shipments_daily_part`
  WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH)
    AND company_id = @company_id
)
SELECT
  date, origin_country, dest_country,
  origin_state, dest_state, origin_postal, dest_postal,
  mode, hs_code, carrier, value_usd, gross_weight_kg
FROM base
ORDER BY date DESC
LIMIT @limit OFFSET @offset;
