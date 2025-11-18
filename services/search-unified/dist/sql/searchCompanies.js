export function buildSearchCompaniesSQL() {
    const sql = `
    WITH base AS (
      SELECT
        company_id,
        ANY_VALUE(company_name) AS company_name,
        COUNTIF(DATE(date) >= DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH)) AS shipments_12m,
        MAX(DATE(date)) AS last_activity,
        ARRAY_AGG(DISTINCT CONCAT(origin_country, '→', dest_country) IGNORE NULLS LIMIT 5) AS top_routes,
        ARRAY_AGG(DISTINCT carrier IGNORE NULLS LIMIT 5) AS top_carriers
      FROM \`logistics-intel.lit.shipments_daily_part\`
      WHERE 1=1
        AND ( @company_id     IS NULL OR company_id      = @company_id)
        AND ( @origin_country IS NULL OR origin_country  = @origin_country)
        AND ( @dest_country   IS NULL OR dest_country    = @dest_country)
        AND ( @mode           IS NULL OR mode            = @mode)
        AND ( @carrier        IS NULL OR carrier         = @carrier)
        AND ( @date_start     IS NULL OR DATE(date)      >= DATE( @date_start))
        AND ( @date_end       IS NULL OR DATE(date)      <= DATE( @date_end))
        AND ( ARRAY_LENGTH(@hs_codes) = 0 OR hs_code IN UNNEST(@hs_codes) )
      GROUP BY company_id
    )
    SELECT * FROM base
    ORDER BY shipments_12m DESC
    LIMIT @limit OFFSET @offset`;
    return sql;
}
