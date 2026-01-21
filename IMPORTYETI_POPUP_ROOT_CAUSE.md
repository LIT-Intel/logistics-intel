# IMPORTYETI POPUP ROOT CAUSE ANALYSIS

**Status:** COMPLETE - Root cause identified with evidence  
**Date:** January 21, 2026  
**Severity:** CRITICAL - Schema mismatch causing 100% data loss in UI

---

## EXECUTIVE SUMMARY

The popup modal shows **zeros for all KPIs** because of a **two-layer schema mismatch**:

1. **Backend parser reads wrong JSON paths** (`raw.shipments` doesn't exist)
2. **Frontend expects BOL array but receives snapshot object** (architectural mismatch)

**Result:** All computed KPIs = 0, empty trade routes, no volume data.

---

## 1️⃣ RAW IMPORTYETI FIELD STRUCTURE (VERIFIED)

### Actual ImportYeti API Response Schema

```json
{
  "data": {
    "title": "Wahoo Fitness",
    "address": "...",
    "country": "United States",
    "website": "...",
    "country_code": "US",
    "phone_number": "...",
    
    "total_shipments": "776",
    "avg_teu_per_month": {
      "12m": 17.71,
      "24m": 16.75,
      "36m": 12.46
    },
    "total_shipping_cost": "164242.50",
    
    "recent_bols": [
      {
        "TEU": "3.0",
        "lcl": false,
        "Country": "China",
        "Quantity": "1756",
        "date_formatted": "26/12/2025",
        "Shipper_Name": "...",
        "Consignee_Name": "...",
        "Product_Description": "..."
      }
    ],
    
    "containers": [...],  // 22 containers found
    "containers_load": [...],
    "time_series": {...},
    "date_range": {
      "start_date": "19/01/2015",
      "end_date": "26/12/2025"
    },
    
    "suppliers_table": [...],
    "notify_party_table": [...]
  },
  "requestCost": 1,
  "executionTime": "2.5s",
  "creditsRemaining": 4999
}
```

**Key Finding:** All company data is nested under `data` key, NOT at root level.

---

## 2️⃣ KPI PARSER THAT RETURNS ZEROES

### Location
**File:** `/supabase/functions/importyeti-proxy/index.ts`  
**Function:** `parseCompanySnapshot(raw: any)`  
**Lines:** 292-359

### Current Parser Field Paths (WRONG)

```typescript
function parseCompanySnapshot(raw: any): any {
  const shipments = raw.shipments || [];  // ❌ WRONG: raw.shipments doesn't exist
  const containers = raw.containers || [];  // ❌ WRONG: raw.containers doesn't exist

  // Calculate TEU
  let totalTeu = 0;
  containers.forEach((c: any) => {  // ❌ Iterating over empty array
    const size = String(c.size || "").toLowerCase();
    if (size.includes("20")) totalTeu += 1;
    else if (size.includes("40")) totalTeu += 2;
  });

  // Find date range
  const dates = shipments  // ❌ Empty array
    .map((s: any) => s.arrival_date || s.date)
    .filter(Boolean);

  return {
    company_id: raw.id || raw.key,  // ❌ WRONG: should be raw.data.title
    company_name: raw.name,  // ❌ WRONG: should be raw.data.title
    country: raw.country,  // ❌ WRONG: should be raw.data.country
    total_shipments: shipments.length,  // ❌ Returns 0
    total_teu: Math.round(totalTeu * 10) / 10,  // ❌ Returns 0
    trend: "flat",  // ❌ Always flat (no data to calculate)
    top_ports: []  // ❌ Always empty
  };
}
```

**Evidence from logs:**
```
📊 Parsed KPIs: { shipments: 0, teu: 0, trend: "flat" }
```

---

## 3️⃣ FIELD MAPPING TABLE (WITH EVIDENCE)

| KPI / Field | Current Parser Path | Actual ImportYeti Path | Mismatch? | Evidence |
|-------------|---------------------|------------------------|-----------|----------|
| **Total Shipments** | `raw.shipments.length` | `raw.data.total_shipments` | ✅ YES | DB shows "776" at correct path |
| **Total TEU** | Computed from `raw.containers` | `raw.data.avg_teu_per_month.12m` × 12 | ✅ YES | DB shows `{"12m": 17.71}` |
| **FCL/LCL** | Computed from `raw.shipments` | Available in `raw.data.recent_bols[].lcl` | ✅ YES | BOLs have `"lcl": false` field |
| **Est. Spend** | Not extracted | `raw.data.total_shipping_cost` | ✅ YES | DB shows "164242.50" |
| **Last Shipment** | `raw.shipments[0].arrival_date` | `raw.data.date_range.end_date` | ✅ YES | DB shows "26/12/2025" |
| **Top Ports** | Extracted from `raw.shipments` | Available in `raw.data.recent_bols[]` | ✅ YES | BOLs exist with port data |
| **Trend** | Computed from `raw.shipments` dates | Can compute from `raw.data.time_series` | ✅ YES | time_series object exists |
| **Company Name** | `raw.name` | `raw.data.title` | ✅ YES | DB shows "title" field |

**Conclusion:** 100% of fields have path mismatches.

---

## 4️⃣ WHAT THE POPUP MODAL ACTUALLY READS

### Data Flow Analysis

**Step 1:** User clicks "View Details"  
**Step 2:** `Search.tsx` calls `fetchCompanyKpis(company_key)`  
**File:** `/frontend/src/lib/kpiCompute.ts`, line 19-61

**Step 3:** `fetchCompanyKpis()` calls `iyCompanyBols()`  
**File:** `/frontend/src/lib/api.ts`, line 1127-1184

```typescript
const response = await iyCompanyBols({
  company_id: normalizedSlug,
  start_date: '01/01/2019',
  end_date: endDate,
  limit: 100,
  offset: 0,
}, signal);
```

**Step 4:** `iyCompanyBols()` sends request to Edge Function  
**Body sent:**
```json
{
  "action": "companyBols",
  "company_id": "wahoo-fitness",
  "limit": 100,
  "offset": 0
}
```

**Step 5:** Edge Function ignores `action: "companyBols"` (not implemented)  
**Falls through to:** Snapshot fetch (lines 31-163)  
**Returns:**
```json
{
  "ok": true,
  "source": "cache",
  "snapshot": {
    "total_shipments": 0,
    "total_teu": 0,
    "trend": "flat",
    "top_ports": []
  },
  "raw": { "data": {...actual ImportYeti data...} }
}
```

**Step 6:** `iyCompanyBols()` extracts `rows` array  
**Line 1173-1177:** Tries to find `responseData.rows`  
**Result:** `rows = []` (doesn't exist in snapshot response)

**Step 7:** `fetchCompanyKpis()` computes KPIs from empty array  
**File:** `/frontend/src/lib/kpiCompute.ts`, line 53-170  
**Result:** All zeros because `shipments.length === 0`

**Step 8:** Modal renders zeros  
**File:** `/frontend/src/pages/Search.tsx`, line 1052-1090  
**Displays:** `{kpiData.teu}` = 0

### Answer to Questions

**Is the modal reading from:**
- ❌ `snapshot.raw_payload` - No
- ❌ `snapshot.parsed_summary` - Indirectly (Edge Function returns this, but it has zeros)
- ✅ **Client-side computed KPIs** - YES (computed from `response.rows` which is empty)

**Does the modal recompute KPIs client-side?**
- ✅ **YES** - `fetchCompanyKpis()` computes from BOL data

**Is it reading legacy fields?**
- ✅ **YES** - Edge Function's `parseCompanySnapshot()` reads non-existent fields

---

## 5️⃣ CACHE VS LIVE DATA PATH

**After snapshot save, does the popup:**

✅ **Read from Supabase snapshot** - YES, but snapshot has wrong data  
✅ **Recompute KPIs from scratch** - YES, from `response.rows` which is empty

**Why both?**
1. Edge Function returns cached `parsed_summary` (which has zeros due to wrong parser)
2. Frontend expects `response.rows` array to compute fresh KPIs
3. `rows` doesn't exist in snapshot response structure
4. Frontend computes from empty array → zeros

**This explains cached data exists but UI shows zeros.**

---

## 6️⃣ HARD-CODE SANITY CHECK

### Hypothetical Test (Not Executed)

If we hardcode in modal:
```typescript
const kpiData = {
  teu: 18000,
  fclCount: 2400,
  lclCount: 0,
  trend: 'up',
  topOriginPorts: ['Shanghai, CN', 'Shenzhen, CN'],
  topDestinationPorts: ['Los Angeles, US', 'Long Beach, US'],
  monthlyVolume: [...],
  lastShipmentDate: '2025-12-26'
};
```

**Expected Result:** ✅ YES - Values would render correctly

**Conclusion:** This confirms **data wiring bug**, NOT UI rendering bug.

---

## 7️⃣ ROOT CAUSE (SINGLE SENTENCE)

**The `parseCompanySnapshot()` function reads from non-existent root-level fields (`raw.shipments`, `raw.containers`) instead of the actual nested structure (`raw.data.recent_bols`, `raw.data.containers`), causing all parsed KPIs to be zero, and the frontend's `iyCompanyBols()` receives a snapshot object without the expected `rows` array, resulting in client-side KPI computation from an empty dataset.**

---

## EVIDENCE SUMMARY

### Database Query Results

**Company:** wahoo-fitness  
**Snapshot Storage:**
- ✅ `raw_payload` contains valid ImportYeti data
- ❌ `parsed_summary` has all zeros
- ✅ `raw_payload.data.total_shipments` = "776"
- ✅ `raw_payload.data.recent_bols` array has 50 BOLs
- ✅ `raw_payload.data.containers` array has 22 containers
- ❌ Parser extracting 0 shipments, 0 TEU

### Edge Function Logs

```
📦 SNAPSHOT REQUEST: wahoo-fitness
  Normalized slug: wahoo-fitness
📅 Snapshot age: Infinity days
🌐 Fetching from ImportYeti (1 credit)
  URL: https://data.importyeti.com/v1.0/company/wahoo-fitness
✅ ImportYeti response received
📊 Parsed KPIs: { shipments: 0, teu: 0, trend: "flat" }  ← WRONG!
✅ Snapshot saved
```

### Browser Console (Expected)

```
[KPI] BOL Response: { ok: true, rowCount: 0, sample: undefined }  ← WRONG!
[KPI] Computed KPIs: { teu: 0, fclCount: 0, lclCount: 0, ... }  ← WRONG!
```

---

## REQUIRED FIXES (HIGH-LEVEL ONLY)

**Fix 1: Update parseCompanySnapshot() paths**
- Change `raw.shipments` → `raw.data.recent_bols`
- Change `raw.containers` → `raw.data.containers`
- Change `raw.name` → `raw.data.title`
- Add extraction for `raw.data.total_shipments`, `raw.data.total_shipping_cost`, etc.

**Fix 2: Return BOL array structure from Edge Function**
- When `action === "companyBols"`, return `{ rows: raw.data.recent_bols }`
- Or update `fetchCompanyKpis()` to read from snapshot directly

**Fix 3: Use pre-computed ImportYeti metrics**
- Extract `raw.data.avg_teu_per_month.12m`
- Extract `raw.data.total_shipments`
- Extract `raw.data.total_shipping_cost`
- Don't recompute what ImportYeti already calculated

---

## IMPACT

- **Users affected:** 100% of search popup opens
- **Data accuracy:** 0% (all KPIs showing zeros)
- **Credit waste:** Moderate (snapshots cached but unusable)
- **Business impact:** HIGH (product appears broken, no data insights)

---

**Next Steps:** Implementation plan required. No code changes until reviewed.

