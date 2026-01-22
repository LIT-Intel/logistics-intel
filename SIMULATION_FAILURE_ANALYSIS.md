# Simulation Failure Analysis Report

**Date:** 2026-01-22
**Purpose:** Document exact failure points in data flow without implementing fixes

---

## Simulation 1: KPI Display Flow in ShipperDetailModal

### Starting State
- User clicks on search result: "Solmax Geosynthetics"
- Search returns `IyShipperHit` with:
  - `key: "company/solmax-geosynthetics"`
  - `shipmentsLast12m: 250`
  - `teusLast12m: null` (not populated from search)
  - `estSpendLast12m: null` (not populated from search)

### Step-by-Step Flow

#### Step 1: fetchCompanySnapshot Called
**Location:** `/frontend/src/pages/Search.tsx:303`

```typescript
const result = await fetchCompanySnapshot(selectedCompany.importyeti_key);
```

**Action:** Calls Supabase Edge Function `importyeti-proxy` with:
```json
{
  "company_id": "solmax-geosynthetics"
}
```

---

#### Step 2: Edge Function Returns Parsed Snapshot
**Location:** `/supabase/functions/importyeti-proxy/index.ts:115-145`

**Processing:**
```typescript
const parsedSummary = parseCompanySnapshot(rawPayload);
```

**parseCompanySnapshot Output:**
```json
{
  "company_id": "company/solmax-geosynthetics",
  "company_name": "Solmax Geosynthetics",
  "total_shipments": 250,
  "total_teu": 3600,           // ✅ Computed from avg_teu_per_month["12m"] * 12
  "est_spend": 450000,         // ✅ From total_shipping_cost
  "fcl_count": 180,            // ✅ Counted from recent_bols where lcl=false
  "lcl_count": 70,             // ✅ Counted from recent_bols where lcl=true
  "last_shipment_date": "2025-11-15",
  "trend": "up",
  "monthly_volumes": {
    "2024-12": { "fcl": 15, "lcl": 6 },
    "2025-01": { "fcl": 18, "lcl": 5 },
    // ... only months with actual shipments
  },
  "shipments_last_12m": 250
}
```

**Edge Function Response:**
```json
{
  "ok": true,
  "source": "cache",
  "snapshot": { /* parsedSummary above */ },
  "raw": {
    "data": {
      "name": "Solmax Geosynthetics",
      "total_shipments": 250,
      "avg_teu_per_month": { "12m": 300 },
      "total_shipping_cost": 450000,
      "recent_bols": [ /* array of 250 BOLs */ ]
    }
  }
}
```

---

#### Step 3: Frontend Receives Response
**Location:** `/frontend/src/pages/Search.tsx:305-308`

```typescript
if (result && result.raw) {
  setRawData(result.raw);  // Stores: { snapshot: {...}, data: {...} }
}
```

**CRITICAL OBSERVATION:**
The frontend stores `result.raw`, which contains:
- `snapshot` (parsed summary with all KPIs)
- `data` (original ImportYeti payload)

**BUT:** ShipperDetailModal expects a `profile: IyCompanyProfile` object, which has:
- `routeKpis.teuLast12m`
- `routeKpis.estSpendUsd12m`
- `timeSeries[]` array

---

#### Step 4: ShipperDetailModal Tries to Render KPIs
**Location:** `/frontend/src/components/search/ShipperDetailModal.tsx:264-277`

```typescript
const resolvedRouteKpis = routeKpis ?? profile?.routeKpis ?? null;

// FAILURE POINT #1: profile is NULL
// The Search.tsx page does NOT construct an IyCompanyProfile from the snapshot

const teu12m =
  coerceNumber(resolvedRouteKpis?.teuLast12m) ??  // NULL (no routeKpis)
  coerceNumber(shipper.teusLast12m);             // NULL (search hit didn't have it)
```

**Fallback Chain Analysis:**

| Fallback | Value | Reason |
|----------|-------|--------|
| `routeKpis?.teuLast12m` | `null` | No routeKpis object passed |
| `profile?.routeKpis?.teuLast12m` | `null` | Profile is null |
| `shipper.teusLast12m` | `null` | Search hit doesn't include TEU |

**Result:** `teu12m = null` → Renders as "—"

---

#### Step 5: Monthly Chart Rendering Fails
**Location:** `/frontend/src/components/search/ShipperDetailModal.tsx:298-308`

```typescript
const chartData = React.useMemo(
  () =>
    Array.isArray(profile?.timeSeries)
      ? profile.timeSeries.slice(-12).map((point) => ({
          monthLabel: monthLabel(point.month),
          fcl: coerceNumber(point.fclShipments) ?? 0,
          lcl: coerceNumber(point.lclShipments) ?? 0,
        }))
      : [],
  [profile?.timeSeries],
);
```

**FAILURE POINT #2:**
`profile` is null, so `profile?.timeSeries` is undefined.
Chart data becomes empty array `[]`.

**BUT:** The snapshot contains `monthly_volumes`:
```json
{
  "2024-12": { "fcl": 15, "lcl": 6 },
  "2025-01": { "fcl": 18, "lcl": 5 }
}
```

This data exists but is never accessed because:
1. It's in `snapshot.monthly_volumes` (object keyed by month)
2. Modal expects `profile.timeSeries` (array of objects)
3. No transformation happens between snapshot and profile

---

### Root Cause Summary

| Component | Expected Data | Actual Data | Why Mismatch? |
|-----------|---------------|-------------|---------------|
| ShipperDetailModal | `profile: IyCompanyProfile` with `routeKpis` nested object | `null` | Search.tsx never calls `normalizeCompanyProfile()` |
| KPI Display | `profile.routeKpis.teuLast12m` | `undefined` | Profile doesn't exist |
| Chart Display | `profile.timeSeries[]` array | `undefined` | Profile doesn't exist |
| Available Data | N/A | `rawData.snapshot.total_teu` | Exists but not transformed |
| Available Data | N/A | `rawData.snapshot.monthly_volumes{}` | Exists but wrong shape |

**Exact Failure:**
The edge function returns a flat `snapshot` object with snake_case fields (`total_teu`, `est_spend`), but the modal expects a nested `IyCompanyProfile` with camelCase and structured objects (`routeKpis.teuLast12m`).

**Missing Transformation:**
`/frontend/src/lib/api.ts:1497` has `normalizeCompanyProfile()` function that could transform snapshot → profile, but it's never called in Search.tsx.

---

## Simulation 2: Save Flow with api.ts (ShipperDetailModal)

### Starting State
User clicks "Save to Command Center" button in ShipperDetailModal.

### Step-by-Step Flow

#### Step 1: Modal Calls onSaveToCommandCenter
**Location:** `/frontend/src/components/search/ShipperDetailModal.tsx:435`

```typescript
onSaveToCommandCenter({ shipper, profile: profile ?? null });
```

**Passed Data:**
- `shipper`: `IyShipperHit` object from search results
- `profile`: `null` (because Search.tsx never populated it)

---

#### Step 2: saveIyCompanyToCrm Builds company_data
**Location:** `/frontend/src/lib/api.ts:2366-2383`

```typescript
const companyData = {
  source: "importyeti",
  source_company_key: "company/solmax-geosynthetics",
  name: shipper.companyName || shipper.title,          // ✅ "Solmax Geosynthetics"
  domain: shipper.domain,                               // ✅ "solmax.com"
  website: shipper.website,                             // ✅ "https://solmax.com"
  phone: shipper.phone,                                 // ✅ "+1-555-0100"
  country_code: shipper.countryCode,                    // ✅ "US"
  address_line1: shipper.address,                       // ✅ "123 Main St"
  city: shipper.city,                                   // ✅ "Houston"
  state: shipper.state,                                 // ✅ "TX"
  shipments_12m: shipper.totalShipments || 0,          // ✅ 250
  teu_12m: shipper.totalTEU,                           // ❌ undefined
  most_recent_shipment_date: shipper.lastShipmentDate, // ✅ "2025-11-15"
  primary_mode: shipper.primaryMode,                    // ❌ undefined
  raw_profile: null,                                    // ❌ NULL (profile not passed)
  raw_last_search: shipper,                             // ✅ Full search hit
};
```

**CRITICAL FIELDS MISSING:**

| Field | Value | Source | Impact |
|-------|-------|--------|--------|
| `teu_12m` | `undefined` | `shipper.totalTEU` doesn't exist | Database column nullable, stores NULL |
| `fcl_shipments_12m` | Not included | Not in companyData | Database column gets NULL |
| `lcl_shipments_12m` | Not included | Not in companyData | Database column gets NULL |
| `est_spend_12m` | Not included | Not in companyData | Database column gets NULL |
| `top_route_12m` | Not included | Not in companyData | Database column gets NULL |
| `recent_route` | Not included | Not in companyData | Database column gets NULL |
| `raw_profile` | `null` | profile was null | Rich snapshot data lost |

**These fields exist in snapshot but are never accessed:**
- `rawData.snapshot.total_teu` → should map to `teu_12m`
- `rawData.snapshot.fcl_count` → should map to `fcl_shipments_12m`
- `rawData.snapshot.lcl_count` → should map to `lcl_shipments_12m`
- `rawData.snapshot.est_spend` → should map to `est_spend_12m`

---

#### Step 3: Edge Function Receives Request
**Location:** `/supabase/functions/save-company/index.ts:37-38`

```typescript
const body: SaveCompanyRequest = await req.json();
const { company_id, source_company_key, company_data, stage } = body;
```

**Received Payload:**
```json
{
  "source_company_key": "company/solmax-geosynthetics",
  "company_data": {
    "source": "importyeti",
    "source_company_key": "company/solmax-geosynthetics",
    "name": "Solmax Geosynthetics",
    "domain": "solmax.com",
    "shipments_12m": 250,
    "teu_12m": null,           // ❌ MISSING
    "fcl_shipments_12m": null, // ❌ MISSING
    "lcl_shipments_12m": null, // ❌ MISSING
    "est_spend_12m": null,     // ❌ MISSING
    "raw_profile": null        // ❌ MISSING
  },
  "stage": "prospect"
}
```

**Validation:** ✅ Passes (required fields present)

---

#### Step 4: Database Insert
**Location:** `/supabase/functions/save-company/index.ts:68-99`

```sql
INSERT INTO lit_companies (
  source,
  source_company_key,
  name,
  domain,
  shipments_12m,
  teu_12m,               -- NULL
  fcl_shipments_12m,     -- NULL (column not in INSERT)
  lcl_shipments_12m,     -- NULL (column not in INSERT)
  est_spend_12m,         -- NULL (column not in INSERT)
  top_route_12m,         -- NULL (column not in INSERT)
  recent_route,          -- NULL (column not in INSERT)
  raw_profile            -- NULL
) VALUES (
  'importyeti',
  'company/solmax-geosynthetics',
  'Solmax Geosynthetics',
  'solmax.com',
  250,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
);
```

**Result:** Row created with incomplete KPIs.

---

#### Step 5: Saved Company Link Created
```sql
INSERT INTO lit_saved_companies (
  user_id,
  company_id,           -- FK to lit_companies.id
  stage,
  last_activity_at
) VALUES (
  'user-uuid',
  123,                  -- lit_companies.id
  'prospect',
  '2026-01-22T10:00:00Z'
);
```

**Result:** ✅ Save succeeds, but company record has incomplete KPIs.

---

### Save Flow Failure Summary

**What Succeeds:**
- ✅ Authentication (Supabase session token)
- ✅ Company record creation in `lit_companies`
- ✅ Saved link in `lit_saved_companies`
- ✅ Activity event logged
- ✅ Basic fields (name, domain, shipments_12m)

**What Fails (Silent Data Loss):**
- ❌ `teu_12m` → NULL (should be 3600 from snapshot)
- ❌ `fcl_shipments_12m` → NULL (should be 180 from snapshot)
- ❌ `lcl_shipments_12m` → NULL (should be 70 from snapshot)
- ❌ `est_spend_12m` → NULL (should be 450000 from snapshot)
- ❌ `top_route_12m` → NULL
- ❌ `recent_route` → NULL
- ❌ `raw_profile` → NULL (entire snapshot lost)

**Root Cause:**
`saveIyCompanyToCrm()` only maps fields that exist on `IyShipperHit` (search result), not from the snapshot that was already fetched. The snapshot data exists in `rawData` state but is never passed to the save function.

---

## Simulation 3: Save Flow from Search.tsx (Direct)

### Hypothetical: If Search.tsx had its own save button

**Missing Implementation:**
Search.tsx does NOT have a "Save to Command Center" button on the main results page. Save is only available inside ShipperDetailModal.

**If it existed, the flow would be:**

```typescript
// Hypothetical code that doesn't exist:
const handleSaveCompany = async (company) => {
  // PROBLEM: Only has shipper hit, not snapshot
  await saveCompanyToCommandCenter({
    shipper: company,  // Only search hit data
    profile: null      // No profile constructed
  });
};
```

**Same failure as Simulation 2:**
Would save incomplete data because:
1. Only `IyShipperHit` available (not snapshot)
2. No profile object constructed
3. Snapshot data in `rawData` state not accessible from card

**Conclusion:** N/A - Save button doesn't exist at search result level.

---

## Simulation 4: Command Center Hydration After Save

### Starting State
Company "Solmax Geosynthetics" was saved via ShipperDetailModal with incomplete KPIs.

### Step-by-Step Flow

#### Step 1: User Opens Command Center Page
**Location:** `/frontend/src/pages/companies/index.tsx`

**Action:** Component mounts and queries database.

---

#### Step 2: Query lit_saved_companies JOIN lit_companies
**SQL Query:**
```sql
SELECT
  sc.id,
  sc.user_id,
  sc.company_id,
  sc.stage,
  sc.last_activity_at,
  c.id,
  c.source,
  c.source_company_key,
  c.name,
  c.domain,
  c.shipments_12m,
  c.teu_12m,              -- NULL
  c.fcl_shipments_12m,    -- NULL
  c.lcl_shipments_12m,    -- NULL
  c.est_spend_12m,        -- NULL
  c.top_route_12m,        -- NULL
  c.recent_route,         -- NULL
  c.raw_profile           -- NULL
FROM lit_saved_companies sc
JOIN lit_companies c ON sc.company_id = c.id
WHERE sc.user_id = 'user-uuid';
```

**Result Set:**
```json
[
  {
    "id": 1,
    "company_id": 123,
    "stage": "prospect",
    "company": {
      "id": 123,
      "name": "Solmax Geosynthetics",
      "domain": "solmax.com",
      "shipments_12m": 250,
      "teu_12m": null,            // ❌ MISSING
      "fcl_shipments_12m": null,  // ❌ MISSING
      "lcl_shipments_12m": null,  // ❌ MISSING
      "est_spend_12m": null,      // ❌ MISSING
      "top_route_12m": null,      // ❌ MISSING
      "recent_route": null,       // ❌ MISSING
      "raw_profile": null         // ❌ MISSING
    }
  }
]
```

---

#### Step 3: UI Renders KPI Cards

**Company Card Display:**

```tsx
<div className="company-card">
  <h3>Solmax Geosynthetics</h3>
  <div className="kpi-row">
    <KpiCard
      label="Shipments (12m)"
      value={formatNumber(250)}    // ✅ Shows "250"
    />
    <KpiCard
      label="TEU (12m)"
      value={formatNumber(null)}    // ❌ Shows "—"
    />
    <KpiCard
      label="Est. Spend"
      value={formatCurrency(null)}  // ❌ Shows "—"
    />
  </div>
</div>
```

**Chart Component:**

```typescript
const chartData = React.useMemo(() => {
  // Try to load from raw_profile
  if (company.raw_profile?.timeSeries) {
    return company.raw_profile.timeSeries;
  }
  // Try to compute from raw_profile.snapshot
  if (company.raw_profile?.monthly_volumes) {
    return Object.entries(company.raw_profile.monthly_volumes).map(([month, data]) => ({
      month,
      fcl: data.fcl,
      lcl: data.lcl
    }));
  }
  // Fallback: empty
  return [];
}, [company]);

// RESULT: [] because raw_profile is NULL
```

**What User Sees:**
- ✅ Company name
- ✅ Shipments: "250"
- ❌ TEU: "—"
- ❌ Est. Spend: "—"
- ❌ FCL/LCL split: "—"
- ❌ Monthly chart: Empty state message
- ❌ Top routes: No data

---

#### Step 4: User Clicks Company to View Details

**If company detail page tries to fetch fresh snapshot:**

```typescript
useEffect(() => {
  if (company.source_company_key) {
    fetchCompanySnapshot(company.source_company_key)
      .then(result => {
        // ✅ Gets fresh snapshot with all KPIs
        // But database still has NULL values
      });
  }
}, [company.source_company_key]);
```

**Result:**
- Fresh snapshot loads with correct KPIs
- Database record still has NULLs
- Discrepancy between live data and saved data

---

### Command Center Failure Summary

**What's Missing in Display:**

| Field | Database Value | Should Be | Impact |
|-------|---------------|-----------|--------|
| `teu_12m` | NULL | 3600 | TEU card shows "—" |
| `fcl_shipments_12m` | NULL | 180 | Container split unknown |
| `lcl_shipments_12m` | NULL | 70 | Container split unknown |
| `est_spend_12m` | NULL | $450,000 | Spend card shows "—" |
| `top_route_12m` | NULL | "Houston → Shanghai" | Route info missing |
| `monthly_volumes` | NULL | {...} | Chart empty |
| `raw_profile` | NULL | Full snapshot | Can't reconstruct full view |

**Downstream Impacts:**

1. **Sorting/Filtering Broken:**
   ```sql
   -- Trying to sort by TEU:
   ORDER BY teu_12m DESC  -- All NULL, no sorting effect
   ```

2. **Analytics Inaccurate:**
   ```sql
   SELECT SUM(teu_12m) FROM lit_companies;
   -- Returns 0 or NULL (can't compute aggregate)
   ```

3. **Pipeline Reports Wrong:**
   - Total pipeline spend: Cannot calculate
   - Average company size: Skewed (missing TEU data)
   - Qualification scoring: Incomplete

---

## Simulation 5: Monthly Chart Rendering

### Starting State
ShipperDetailModal is open with snapshot data loaded.

### Step-by-Step Flow

#### Step 1: Snapshot Contains monthly_volumes
**Location:** Edge function response

```json
{
  "snapshot": {
    "monthly_volumes": {
      "2024-02": { "fcl": 12, "lcl": 3 },
      "2024-03": { "fcl": 15, "lcl": 5 },
      "2024-04": { "fcl": 18, "lcl": 4 },
      "2024-05": { "fcl": 20, "lcl": 6 },
      "2024-07": { "fcl": 14, "lcl": 5 },  // Note: June missing (no shipments)
      "2024-08": { "fcl": 22, "lcl": 7 },
      "2024-09": { "fcl": 19, "lcl": 6 },
      "2024-10": { "fcl": 21, "lcl": 5 },
      "2024-11": { "fcl": 17, "lcl": 8 },
      "2024-12": { "fcl": 15, "lcl": 6 },
      "2025-01": { "fcl": 18, "lcl": 5 }
    }
  }
}
```

**Observation:** Only 11 months present (June 2024 had no shipments).

---

#### Step 2: Modal Expects timeSeries Array
**Location:** `/frontend/src/components/search/ShipperDetailModal.tsx:298-308`

```typescript
const chartData = React.useMemo(
  () =>
    Array.isArray(profile?.timeSeries)  // ❌ profile is null
      ? profile.timeSeries.slice(-12).map((point) => ({
          monthLabel: monthLabel(point.month),
          fcl: coerceNumber(point.fclShipments) ?? 0,
          lcl: coerceNumber(point.lclShipments) ?? 0,
        }))
      : [],
  [profile?.timeSeries],
);
```

**Expected Shape:**
```typescript
timeSeries: [
  { month: "2024-02", fclShipments: 12, lclShipments: 3 },
  { month: "2024-03", fclShipments: 15, lclShipments: 5 },
  // ... 12 entries (one per month, with 0s for missing months)
]
```

**Actual Shape (in snapshot):**
```typescript
monthly_volumes: {
  "2024-02": { fcl: 12, lcl: 3 },
  "2024-03": { fcl: 15, lcl: 5 },
  // ... only months with activity
}
```

---

#### Step 3: Chart Component Receives Data
**Location:** `/frontend/src/components/search/ShipperDetailModal.tsx:575-611`

```tsx
{chartData.length === 0 ? (
  <p className="text-xs text-slate-500">
    No lane-level trend data available yet for this shipper.
  </p>
) : (
  <BarChart data={chartData}>
    <Bar dataKey="fcl" name="FCL" />
    <Bar dataKey="lcl" name="LCL" />
  </BarChart>
)}
```

**Result:**
`chartData = []` → Shows "No data available" message.

**BUT:** Data exists in `rawData.snapshot.monthly_volumes`.

---

#### Step 4: Missing Month Handling

**If monthly_volumes was converted to timeSeries:**

```typescript
// This transformation doesn't happen anywhere:
const timeSeries = Object.entries(snapshot.monthly_volumes)
  .map(([month, volumes]) => ({
    month,
    fclShipments: volumes.fcl,
    lclShipments: volumes.lcl
  }))
  .sort((a, b) => a.month.localeCompare(b.month));

// Result: 11 entries (June missing)
```

**Chart would render with gap:**
```
FCL |     ▇ ▇ ▇ ▇   ▇ ▇ ▇ ▇ ▇ ▇
    | Jan Feb Mar Apr May     Jun Jul Aug Sep Oct Nov Dec
          ^
          Gap where June should be
```

**Proper Fix Would Require:**
1. Get last 12 months array from current date
2. Map each month to volumes (default to 0 if missing)
3. Ensure exactly 12 entries

```typescript
const now = new Date();
const last12Months = Array.from({ length: 12 }, (_, i) => {
  const d = new Date(now);
  d.setMonth(d.getMonth() - i);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}).reverse();

const chartData = last12Months.map(month => ({
  monthLabel: formatMonth(month),
  fcl: snapshot.monthly_volumes[month]?.fcl || 0,
  lcl: snapshot.monthly_volumes[month]?.lcl || 0
}));
```

---

### Chart Failure Summary

**What's Wrong:**

1. **Shape Mismatch:**
   - Snapshot: `monthly_volumes: Record<string, {fcl, lcl}>`
   - Modal expects: `timeSeries: Array<{month, fclShipments, lclShipments}>`

2. **Missing Months:**
   - Snapshot only includes active months
   - Chart needs all 12 months (with 0s for inactive)

3. **No Transformation:**
   - Data exists but is never transformed
   - Modal looks for `profile.timeSeries` which is null

4. **Backup Path Missing:**
   - Search.tsx has `computeMonthlyVolumes()` function
   - ShipperDetailModal doesn't have equivalent

**Result:**
Chart shows "No data available" despite having 11 months of shipping data.

---

## Cross-Cutting Failure Patterns

### Pattern 1: Profile Object Never Created
**Locations:** All modals/pages using snapshot data

**Problem:**
`normalizeCompanyProfile()` exists in `/frontend/src/lib/api.ts:1497` but is never called.

**Expected Usage:**
```typescript
const snapshotResponse = await fetchCompanySnapshot(key);
const profile = normalizeCompanyProfile(snapshotResponse.snapshot, key);
// Now profile.routeKpis.teuLast12m is accessible
```

**Actual Usage:**
```typescript
const snapshotResponse = await fetchCompanySnapshot(key);
setRawData(snapshotResponse.raw);
// Profile never created, data stays in flat snapshot shape
```

---

### Pattern 2: Field Name Inconsistencies

**Snapshot (Backend):**
- `total_teu` (snake_case, flat)
- `est_spend` (snake_case, flat)
- `monthly_volumes` (object)

**IyCompanyProfile (Frontend):**
- `routeKpis.teuLast12m` (camelCase, nested)
- `routeKpis.estSpendUsd12m` (camelCase, nested)
- `timeSeries` (array)

**No Transformer Called:**
`normalizeCompanyProfile()` would handle this but isn't used.

---

### Pattern 3: Data Duplication Without Sync

**Locations:**
1. **Edge function cache:** `lit_importyeti_company_snapshot.parsed_summary`
2. **Database:** `lit_companies.{teu_12m, fcl_shipments_12m, ...}`
3. **Frontend state:** `rawData.snapshot`

**Problem:**
- Snapshot is authoritative source
- Database stores denormalized copy
- No sync mechanism when snapshot refreshes
- Stale data in database never updates

**Example:**
1. Company saved: Database has NULL KPIs
2. Snapshot fetched later: Fresh data shows 3600 TEU
3. Database still shows NULL
4. Command Center displays wrong data

---

### Pattern 4: Silent Data Loss on Save

**What Gets Lost:**
- TEU calculations
- FCL/LCL split
- Estimated spend
- Monthly trends
- Route information
- Full snapshot context

**Why It Happens:**
- `saveIyCompanyToCrm()` only maps from `IyShipperHit`
- Snapshot exists in `rawData` but not passed to save function
- Edge function only receives partial data
- Database insert succeeds (NULL is valid)

**No Validation:**
- No check for "did we already fetch snapshot?"
- No warning "KPIs will be incomplete"
- No UI indication of data quality

---

## Exact Failure Points Summary

### 1. KPI Display Failures

| Component | Field Accessed | Actual Value | Should Be | Fix Required |
|-----------|---------------|--------------|-----------|--------------|
| ShipperDetailModal | `profile.routeKpis.teuLast12m` | undefined | 3600 | Create profile from snapshot |
| ShipperDetailModal | `profile.routeKpis.estSpendUsd12m` | undefined | 450000 | Create profile from snapshot |
| ShipperDetailModal | `profile.timeSeries` | undefined | Array[11] | Transform monthly_volumes → timeSeries |
| ShipperDetailModal | `profile.containers.fclShipments12m` | undefined | 180 | Create profile from snapshot |

---

### 2. Save Flow Failures

| Field in DB | Value Saved | Should Be | Source Available |
|-------------|-------------|-----------|------------------|
| `teu_12m` | NULL | 3600 | `rawData.snapshot.total_teu` |
| `fcl_shipments_12m` | NULL | 180 | `rawData.snapshot.fcl_count` |
| `lcl_shipments_12m` | NULL | 70 | `rawData.snapshot.lcl_count` |
| `est_spend_12m` | NULL | 450000 | `rawData.snapshot.est_spend` |
| `raw_profile` | NULL | Full snapshot | `rawData` |

---

### 3. Command Center Display Failures

| UI Element | Query Result | Display | Should Display |
|------------|--------------|---------|----------------|
| TEU Card | `teu_12m: null` | "—" | "3,600" |
| Spend Card | `est_spend_12m: null` | "—" | "$450,000" |
| Container Split | `fcl/lcl: null` | "—" | "180 / 70" |
| Monthly Chart | `raw_profile: null` | Empty | 11-month bar chart |
| Route List | `top_route_12m: null` | "No data" | "Houston → Shanghai" |

---

### 4. Chart Rendering Failures

| Issue | Current State | Expected State |
|-------|---------------|----------------|
| Data Source | Looks for `profile.timeSeries` (doesn't exist) | Should use `snapshot.monthly_volumes` |
| Missing Months | N/A (no data loaded) | Should fill gaps with 0s |
| Month Count | 0 entries | 12 entries (Feb 2024 - Jan 2025) |
| Labels | N/A | "Feb", "Mar", ..., "Jan" |

---

## Impact Severity by Workflow

### Critical (Blocks Core Functionality)
1. **KPI Display in Modal:** Users see "—" instead of real data
2. **Chart Empty:** No visual trends available
3. **Save Loses Data:** 60% of KPI fields stored as NULL

### High (Degrades User Experience)
1. **Command Center KPIs Wrong:** Sorting/filtering broken
2. **Pipeline Reports Inaccurate:** Can't compute aggregate metrics
3. **Stale Data Never Refreshes:** Database diverges from snapshots

### Medium (Workaround Available)
1. **Re-fetch on Detail View:** Fresh snapshot loads correct data
2. **Search Results Usable:** Basic info (name, shipments) works

---

## Testing Verification Steps

### To Reproduce KPI Display Failure:
1. Search for "solmax" on /search page
2. Click any result card
3. Observe modal KPIs:
   - Shipments (12m): Shows number ✅
   - Estimated TEU: Shows "—" ❌
   - Est. spend: Shows "—" ❌
   - FCL/LCL: Shows "—" ❌
4. Check browser console:
   - Find log: `[fetchCompanySnapshot] Response`
   - Verify `hasSnapshot: true`
   - Verify `snapshot.total_teu` has value
5. Open React DevTools:
   - Find `ShipperDetailModal` component
   - Check props: `profile` = null ❌

### To Reproduce Save Data Loss:
1. Open ShipperDetailModal (steps above)
2. Click "Save to Command Center"
3. Open Supabase Studio
4. Query:
   ```sql
   SELECT * FROM lit_companies
   WHERE source_company_key = 'company/solmax-geosynthetics';
   ```
5. Verify columns:
   - `teu_12m`: NULL ❌
   - `fcl_shipments_12m`: NULL ❌
   - `est_spend_12m`: NULL ❌
   - `raw_profile`: NULL ❌

### To Reproduce Command Center Display Failure:
1. Navigate to /companies (Command Center)
2. Find saved company
3. Observe KPI cards all show "—"
4. Click to open details
5. See fresh snapshot loads → KPIs appear
6. Go back to list → KPIs disappear again

---

## Architecture Gaps

### Missing Transformers
1. `snapshot → IyCompanyProfile` (function exists, not called)
2. `monthly_volumes (object) → timeSeries (array)` (no function exists)
3. `snapshot → company_data (complete)` (partial implementation)

### Missing Sync Logic
1. Database → Snapshot (no update on snapshot refresh)
2. Snapshot → Database (only on save, but incomplete)
3. Frontend state → Modal props (no profile construction)

### Missing Validation
1. No check if snapshot was fetched before save
2. No warning when saving incomplete data
3. No UI indication of data completeness

---

**End of Simulation Report**
