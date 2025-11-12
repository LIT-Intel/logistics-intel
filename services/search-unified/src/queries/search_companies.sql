-- Parameterized company search with optional filters + paging.
-- Params:
--   @q STRING, @origins ARRAY<STRING>, @dests ARRAY<STRING>,
--   @modes ARRAY<STRING>, @hs ARRAY<STRING>, @limit INT64, @offset INT64
WITH base AS (
  SELECT
    company_id,
    company_name,
    origin_country,
    dest_country,
    mode,
    hs_code,
    carrier,
    SAFE_CAST(date AS DATE) AS date
  FROM `lit.shipments_daily_part`
  WHERE TRUE
    AND (@q IS NULL OR @q = "" OR REGEXP_CONTAINS(LOWER(company_name), LOWER(@q)))
    AND (ARRAY_LENGTH(@origins) IS NULL OR ARRAY_LENGTH(@origins)=0 OR origin_country IN UNNEST(@origins))
    AND (ARRAY_LENGTH(@dests)   IS NULL OR ARRAY_LENGTH(@dests)=0   OR dest_country IN UNNEST(@dests))
    AND (ARRAY_LENGTH(@modes)   IS NULL OR ARRAY_LENGTH(@modes)=0   OR mode IN UNNEST(@modes))
    AND (ARRAY_LENGTH(@hs)      IS NULL OR ARRAY_LENGTH(@hs)=0      OR hs_code IN UNNEST(@hs))
),
agg AS (
  SELECT
    company_id,
    ANY_VALUE(company_name) AS company_name,
    COUNTIF(date >= DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH)) AS shipments_12m,
    MAX(date) AS last_activity,
    ARRAY(
      SELECT AS STRUCT CONCAT(origin_country, "→", dest_country) AS route, COUNT(*) AS cnt
      FROM base b2
      WHERE b2.company_id = b.company_id
      GROUP BY route
      ORDER BY cnt DESC
      LIMIT 3
    ) AS top_routes_struct,
    ARRAY(
      SELECT AS STRUCT carrier, COUNT(*) AS cnt
      FROM base b3
      WHERE b3.company_id = b.company_id AND carrier IS NOT NULL
      GROUP BY carrier
      ORDER BY cnt DESC
      LIMIT 3
    ) AS top_carriers_struct
  FROM base b
  GROUP BY company_id
),
total AS (
  SELECT COUNT(*) AS total FROM agg
),
paged AS (
  SELECT * FROM agg
  ORDER BY shipments_12m DESC, last_activity DESC, company_name
  LIMIT @limit OFFSET @offset
)
SELECT
  (SELECT total FROM total) AS total,
  ARRAY_AGG(STRUCT(
    company_id,
    company_name,
    shipments_12m,
    last_activity,
    (SELECT ARRAY(SELECT route FROM UNNEST(top_routes_struct))) AS top_routes,
    (SELECT ARRAY(SELECT carrier FROM UNNEST(top_carriers_struct))) AS top_carriers
  )) AS results
FROM paged;


