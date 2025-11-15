DECLARE q STRING DEFAULT IFNULL(TRIM(@q), '');
DECLARE lim INT64 DEFAULT IFNULL(@limit, 25);
DECLARE off INT64 DEFAULT IFNULL(@offset, 0);
DECLARE origins ARRAY<STRING> DEFAULT IFNULL(@origins, []);
DECLARE destinations ARRAY<STRING> DEFAULT IFNULL(@destinations, []);
DECLARE modes ARRAY<STRING> DEFAULT IFNULL(@modes, []);
DECLARE hsCodes ARRAY<STRING> DEFAULT IFNULL(@hsCodes, []);
DECLARE carriers ARRAY<STRING> DEFAULT IFNULL(@carriers, []);

WITH base AS (
  SELECT
    COALESCE(
      NULLIF(TRIM(company_id), ''),
      TO_HEX(SHA256(LOWER(REGEXP_REPLACE(COALESCE(company_name, party_name, consignee_name, shipper_name), r'\s+', ' '))))
    ) AS company_id,
    COALESCE(company_name, party_name, consignee_name, shipper_name) AS company_name,
    DATE(date) AS shipment_date,
    NULLIF(TRIM(carrier), '') AS carrier,
    NULLIF(TRIM(mode), '') AS mode,
    NULLIF(TRIM(origin_country), '') AS origin_country,
    NULLIF(TRIM(dest_country), '') AS dest_country,
    NULLIF(TRIM(hs_code), '') AS hs_code,
    LOWER(COALESCE(company_name, party_name, consignee_name, shipper_name)) AS name_lower
  FROM `logistics-intel.lit.shipments_daily_part`
  WHERE DATE(date) >= DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH)
    AND COALESCE(company_name, party_name, consignee_name, shipper_name) IS NOT NULL
    AND (
      ARRAY_LENGTH(IFNULL(origins, [])) = 0
      OR origin_country IN UNNEST(IFNULL(origins, []))
    )
    AND (
      ARRAY_LENGTH(IFNULL(destinations, [])) = 0
      OR dest_country IN UNNEST(IFNULL(destinations, []))
    )
    AND (
      ARRAY_LENGTH(IFNULL(modes, [])) = 0
      OR UPPER(mode) IN UNNEST(IFNULL(modes, []))
    )
    AND (
      ARRAY_LENGTH(IFNULL(hsCodes, [])) = 0
      OR hs_code IN UNNEST(IFNULL(hsCodes, []))
    )
    AND (
      ARRAY_LENGTH(IFNULL(carriers, [])) = 0
      OR carrier IN UNNEST(IFNULL(carriers, []))
    )
),
filtered AS (
  SELECT *
  FROM base
  WHERE q = '' OR name_lower LIKE CONCAT('%', LOWER(q), '%')
),
agg AS (
  SELECT
    company_id,
    ANY_VALUE(company_name) AS company_name,
    COUNT(*) AS shipments_12m,
    MAX(shipment_date) AS last_activity
  FROM filtered
  GROUP BY company_id
),
routes AS (
  SELECT
    company_id,
    ARRAY_AGG(STRUCT(route, shipments) ORDER BY shipments DESC LIMIT 3) AS top_routes
  FROM (
    SELECT
      company_id,
      CONCAT(origin_country, ' -> ', dest_country) AS route,
      COUNT(*) AS shipments
    FROM filtered
    WHERE origin_country IS NOT NULL
      AND dest_country IS NOT NULL
      AND CONCAT(origin_country, ' -> ', dest_country) IS NOT NULL
    GROUP BY company_id, route
  )
  GROUP BY company_id
),
carrier_stats AS (
  SELECT
    company_id,
    ARRAY_AGG(STRUCT(carrier, shipments) ORDER BY shipments DESC LIMIT 3) AS top_carriers
  FROM (
    SELECT
      company_id,
      carrier,
      COUNT(*) AS shipments
    FROM filtered
    WHERE carrier IS NOT NULL
    GROUP BY company_id, carrier
  )
  GROUP BY company_id
),
final AS (
  SELECT
    agg.company_id,
    agg.company_name,
    agg.shipments_12m,
    CAST(agg.last_activity AS STRING) AS last_activity,
    COALESCE(routes.top_routes, []) AS top_routes,
    COALESCE(carrier_stats.top_carriers, []) AS top_carriers
  FROM agg
  LEFT JOIN routes USING (company_id)
  LEFT JOIN carrier_stats USING (company_id)
)
SELECT
  company_id,
  company_name,
  shipments_12m,
  last_activity,
  top_routes,
  top_carriers,
  COUNT(*) OVER() AS total_count
FROM final
ORDER BY shipments_12m DESC, company_name
LIMIT lim OFFSET off;


