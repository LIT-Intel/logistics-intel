# ImportYeti Proxy - Phase 0-7 Implementation

## Overview

The ImportYeti proxy edge function has been completely rebuilt to support both DMA and legacy API schemes with proper caching, parsing, and error handling.

## Phases Completed

### PHASE 0: Stop the Bleeding
✅ Edge Function now cannot crash due to env mismatch
✅ Supports both DMA and legacy schemes
✅ Falls back gracefully if one scheme is incomplete

### PHASE 1: Fix DMA Search Call
✅ Proxy accepts `action: "search"` with `q` parameter
✅ Constructs proper URL to ImportYeti DMA search endpoint
✅ Returns standardized response: `{ results: [...], page, pageSize }`

### PHASE 2: Snapshot Storage
✅ Uses table `lit_importyeti_company_snapshot`
✅ Stores both `raw_payload` and `parsed_summary`
✅ Never crashes search if DB write fails
✅ DB errors logged but don't break request flow

### PHASE 3: Parsing Matches Raw Payload
✅ Parser extracts:
  - `routeKpis.teuLast12m` (total TEU from last 12 months)
  - `routeKpis.shipmentsLast12m` (count)
  - `routeKpis.topRoutesLast12m[]` (top 10 routes)
  - `containers.fclShipments12m` (FCL count)
  - `containers.lclShipments12m` (LCL count)
  - `timeSeries[]` (monthly breakdown, YYYY-MM format)
  - `lastShipmentDate` (most recent shipment date)

✅ Full array returned, never truncated
✅ All 12 months included in timeSeries (populated from timeSeries normalization in frontend)

### PHASE 4: First-Open Delay Fixed
✅ Cache hit check validates `parsed_summary` is complete
✅ If incomplete, treats as cache miss and fetches fresh
✅ Fresh fetch results stored in same request

### PHASE 5: KPI Tables Untouched
✅ No changes to `lit_company_kpis_monthly`
✅ No changes to `lit_company_index`
✅ No changes to `lit_importyeti_cache`
✅ Data flows only through snapshot table

### PHASE 6: Integration Points
✅ Frontend `searchShippers()` calls: `{ action: "search", q, page, pageSize }`
✅ Frontend `fetchCompanySnapshot()` calls: `{ action: "companySnapshot", company_id }`
✅ Both return complete normalized data

### PHASE 7: Deliverables Complete

## Environment Variables Required

Set these in Supabase project settings (Functions → Secrets):

### Required (choose one scheme):

**DMA Scheme (Preferred)**
```
IY_DMA_SEARCH_URL = https://data.importyeti.com/v1.0/company/search
IY_DMA_API_KEY = <your-importyeti-api-key>
IY_DMA_COMPANY_BOLS_URL = https://data.importyeti.com/v1.0/company/{company}/bols
```

**OR Legacy Scheme (Fallback)**
```
IY_API_KEY = <your-importyeti-api-key>
IY_BASE_URL = https://data.importyeti.com/v1.0  (optional, defaults to this)
```

### Proxy chooses:
1. DMA scheme if both `IY_DMA_SEARCH_URL` and `IY_DMA_API_KEY` exist
2. Legacy scheme if `IY_API_KEY` exists
3. Returns error if neither scheme is valid

## Frontend Changes

### File: `frontend/src/lib/api.ts`

✅ Updated `fetchCompanySnapshot()` to include `action: "companySnapshot"`
✅ `searchShippers()` already has `action: "search"`

Both functions now properly call the edge function with correct action parameter.

## Data Flow

```
Search Flow:
User types query → searchShippers() 
  → POST /functions/v1/importyeti-proxy 
     { action: "search", q, page, pageSize }
  → Edge function validates env
  → Calls ImportYeti DMA /company/search?q=...
  → Returns { results, page, pageSize }
  → coerceIySearchResponse() normalizes format
  → Frontend displays search results

Snapshot Flow:
User clicks company → getIyCompanyProfile()
  → fetchCompanySnapshot() 
    → POST /functions/v1/importyeti-proxy 
       { action: "companySnapshot", company_id }
    → Edge function checks cache
    → Cache HIT: returns { snapshot: parsed_summary, raw: raw_payload }
    → Cache MISS: fetches fresh, stores, returns fresh
  → normalizeIyCompanyProfile() processes raw payload
  → Returns IyCompanyProfile with all KPI fields populated
  → Frontend renders popup with 12-month chart + routes + shipment data
```

## Testing Checklist

### Phase 6 Tests (must all pass):

1. **Search Works**
   - POST to function with `{ action: "search", q: "tesla" }`
   - Expect: `{ results: [...], page: 1, pageSize: 25 }`
   - Results should be non-empty for known companies

2. **Snapshot Works**
   - POST to function with `{ action: "companySnapshot", company_id: "home-depot-usa" }`
   - Expect: `{ ok: true, snapshot: {...}, raw: {...} }`
   - `snapshot.routeKpis.teuLast12m > 0` (for major shippers)
   - `snapshot.timeSeries.length >= 6` (if data exists)

3. **No Missing Env Crash**
   - If only `IY_BASE_URL` exists (no keys), search still works via fallback
   - If key exists, uses it to make requests

4. **Cache Works**
   - First company load: `source: "fresh"`
   - Second company load (same): `source: "cache"`
   - Cache expires after 30 days

## Troubleshooting

### "Missing ImportYeti env vars"
- Check that at least one valid scheme is configured
- DMA requires both `IY_DMA_SEARCH_URL` and `IY_DMA_API_KEY`
- Legacy requires at least `IY_API_KEY`

### Search returns empty
- Verify `IY_DMA_SEARCH_URL` or `IY_BASE_URL` is correct
- Try query: "walmart", "tesla", "fedex" (known large companies)
- Check ImportYeti API key is valid

### Snapshot shows zeros first open
- This indicates cache was hit with incomplete data
- Second open should show data (fresh fetch completed)
- If persistent, check ImportYeti API returns non-empty shipments

### Database write failures
- Logged but don't break search/snapshot
- Check `lit_importyeti_company_snapshot` table permissions
- Check `SUPABASE_SERVICE_ROLE_KEY` is set in functions

## Files Modified

1. **supabase/functions/importyeti-proxy/index.ts**
   - Complete rewrite with env handling, caching, parsing
   - Deployed to Supabase

2. **frontend/src/lib/api.ts**
   - Updated `fetchCompanySnapshot()` to include action parameter
   - Added proper action field to edge function call

## Next Steps

1. Ensure all required env vars are set in Supabase
2. Test search with common queries
3. Test snapshot loading for a saved company
4. Verify 12-month chart displays properly in popup
5. Monitor edge function logs for any errors
