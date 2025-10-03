-- Source for /public/searchCompanies (12m summary)
WITH base AS (
  SELECT * FROM `lit.shipments_daily_part`
  WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH)
),
routes AS (
  SELECT company_id, origin_country AS o, dest_country AS d, COUNT(1) cnt
  FROM base GROUP BY 1,2,3
),
carriers AS (
  SELECT company_id, carrier, COUNT(1) cnt
  FROM base GROUP BY 1,2
),
agg AS (
  SELECT
    company_id,
    ANY_VALUE(company_name) AS company_name,
    COUNT(1) AS shipments_12m,
    MAX(date) AS last_activity
  FROM base
  GROUP BY company_id
)
SELECT
  a.company_id, a.company_name, a.shipments_12m, a.last_activity,
  ARRAY(
    SELECT AS STRUCT o, d, cnt FROM routes r
    WHERE r.company_id = a.company_id
    ORDER BY cnt DESC LIMIT 3
  ) AS top_routes,
  ARRAY(
    SELECT AS STRUCT carrier, cnt FROM carriers c
    WHERE c.company_id = a.company_id
    ORDER BY cnt DESC LIMIT 3
  ) AS top_carriers
FROM agg a
WHERE a.company_id IS NOT NULL;
