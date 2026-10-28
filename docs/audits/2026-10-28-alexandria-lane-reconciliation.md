# Company profile lane-volume reconciliation — 2026-10-28

## Alexandria International Trade (live verified)
- `lit_company_time_series_monthly` Nov 2025–Oct 2026: **668 shipments**, **2,049 TEU**.
- `lit_unified_shipments` in that period: 50 BOL documents; 32 identified as Turkey origin.
- `lit_company_lane_months` in that period: **zero rows**.
- `lit_importyeti_company_snapshot.raw_payload.data.lane_permutations`: 76 historical port-to-port records; sum **4,028 shipments**; Turkey-origin subset **651 shipments**.
- ImportYeti `date_range`: Jan 5, 2015–Oct 26, 2026; lifetime company total **4,311 shipments**, so lane permutations are not a complete lifetime population either.
- These lane permutations include source-reported exit/entry port names such as Istanbul → Savannah, but **no per-lane dates**, so they cannot be divided into YTD/last-12-month totals.
- ImportYeti `time_series` entries provide total monthly shipments/TEU and China-specific totals, but no general Turkey/other origin-country monthly key.
- Port fields in 50 archived BOLs contain mixed semantic locations (countries, inland destinations, ports); do not treat any value as verified ocean port without validation.
- The screenshot's 2,849 TEU disagrees with 2,049 stored monthly TEU and needs source lineage validation.

## Non-negotiable display contracts
1. All-time origin-country/port lanes: may use historical `lane_permutations` only with explicit all-time time scope and evidence attribution.
2. 12M / YTD origin-country lanes: require period-scoped upstream aggregates or complete dated BOL archive; **cannot** be inferred from 50 BOL proportions or cumulative undated lane permutations.
3. Where exact period lane totals are unavailable, show observed sample plus missing coverage, never a confidently labeled total lane volume.
4. Share-map public endpoint independently loads monthly/BOL/lane records. It must receive the same validated lane sources and disclosure metadata without leaking raw source JSON or private records.
5. TEU: reconcile stored rollups against source time series, reject largest-of-candidates heuristic as source-of-truth without provenance.
6. Port normalization: preserve source-reported original values and separately mark port-validated vs locality/country/inland destination.

## Work completed in PR #205
- Corrected observed-sample language in the Overview and fullscreen Trade Lanes map; added coverage banner.
- Introduced strict historical lane parser and scope-safety tests.
- Not production deployed. Pending: expose historical aggregates through authorized bounded API, connect to map/list and public share, validate import-source period query capabilities, port and TEU audits, test with real account in browser.
