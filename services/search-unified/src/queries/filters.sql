-- DISTINCT facets from lit.shipments_daily_part
SELECT
  ARRAY(
    SELECT AS STRUCT origin_country
    FROM (SELECT DISTINCT origin_country FROM `lit.shipments_daily_part` WHERE origin_country IS NOT NULL)
    ORDER BY origin_country
    LIMIT 500
  ) AS origins,
  ARRAY(
    SELECT AS STRUCT dest_country
    FROM (SELECT DISTINCT dest_country FROM `lit.shipments_daily_part` WHERE dest_country IS NOT NULL)
    ORDER BY dest_country
    LIMIT 500
  ) AS destinations,
  ARRAY(
    SELECT AS STRUCT mode
    FROM (SELECT DISTINCT mode FROM `lit.shipments_daily_part` WHERE mode IS NOT NULL)
    ORDER BY mode
    LIMIT 10
  ) AS modes,
  ARRAY(
    SELECT AS STRUCT hs_code
    FROM (SELECT DISTINCT hs_code FROM `lit.shipments_daily_part` WHERE hs_code IS NOT NULL)
    ORDER BY hs_code
    LIMIT 2000
  ) AS hs;


