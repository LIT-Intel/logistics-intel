# Search Popup Modal - Test Verification Guide

## Quick Test Checklist

### Pre-Test Setup
- [ ] Backend Edge Function deployed (`importyeti-proxy` v2)
- [ ] Frontend rebuilt with all changes
- [ ] Browser DevTools open to Console tab
- [ ] Network tab monitoring Edge Function calls

---

## Simulation 1: Search Results → Popup Modal → KPIs Load

### Test Steps

**Step 1: Perform Search**
```
1. Navigate to /search
2. Search for "Tesla"
3. Click Search button
4. Wait for results to appear
```

**Expected Results:**
- [ ] Search returns 50+ companies
- [ ] Results display in grid view
- [ ] Country flags visible on desktop (not wrapped)
- [ ] Company names readable without flag pushing text

**Step 2: Open Company Modal**
```
1. Click "View Details" on first Tesla result
2. Wait for modal to load
```

**Expected Results:**
- [ ] Modal opens without errors
- [ ] Company header shows:
  - [ ] Company logo (or initials if missing)
  - [ ] Company name
  - [ ] Country flag emoji (🇺🇸 for USA)
  - [ ] Status badge (Active/Inactive)
- [ ] No "No data available" messages

**Step 3: Verify KPIs Load**
```
1. Wait 2-3 seconds for KPIs to load
2. Check if KPI cards populate
3. Scroll down to see charts
```

**Expected Results - KPIs Section:**
- [ ] "Logistics KPIs" heading visible
- [ ] Four KPI cards show actual numbers:
  - [ ] Total TEU: > 0 (not 0)
  - [ ] FCL: > 0 (not 0)
  - [ ] LCL: > 0 or 0 (both valid)
  - [ ] Est. Spend: $NN (formatted currency)
- [ ] No loading spinners remain after 3 seconds

**Expected Results - Trade Routes Section:**
- [ ] "Trade Routes" heading visible
- [ ] Two columns: Origins and Destinations
- [ ] Each shows numbered list of ports:
  - [ ] Port name with shipment counts
  - [ ] Format: "Shanghai, CN (12,450 shipments)"
  - [ ] At least 3 entries per column

**Expected Results - Address/Maps:**
- [ ] Address displays with MapPin icon
- [ ] Google Maps icon appears on hover
- [ ] Link is clickable

### Browser Console Verification

**Look for these logs:**
```
[KPI] BOL Response: { ok: true, rowCount: 30, sample: {...} }
[KPI] Computed KPIs: {
  teu: 1234,
  fclCount: 25,
  lclCount: 5,
  trend: 'up',
  topOriginPorts: ['Shanghai', ...],
  topDestinationPorts: ['Los Angeles', ...],
  ...
}
```

**Check Network Tab:**
- [ ] Edge Function call: `importyeti-proxy`
- [ ] Request body includes: `company_id: "tesla"` (slug only, no "company/" prefix)
- [ ] Response status: 200 OK
- [ ] Response includes: `source: "cache"` or `source: "importyeti"`
- [ ] Response snapshot contains KPI data

---

## Simulation 2: Command Center → Saved Company → Detail View

### Test Steps

**Step 1: Access Command Center**
```
1. Click "Command Center" in sidebar
2. Navigate to "Saved Companies" tab
3. Look for saved Tesla companies
```

**Expected Results:**
- [ ] Saved companies list displays
- [ ] Country flags visible next to names
- [ ] No rendering errors

**Step 2: Open Company Detail**
```
1. Click on any saved company
2. Company detail panel opens (right side or drawer)
```

**Expected Results - Drawer Header:**
- [ ] Company name displays
- [ ] Country flag emoji visible (🇺🇸)
- [ ] Company logo or avatar
- [ ] Status badge

**Step 3: Verify Shipments Panel**
```
1. Scroll down in detail panel
2. Check Shipments section
3. Verify KPI cards
```

**Expected Results:**
- [ ] Shipments table loads
- [ ] Shows recent shipments (not empty)
- [ ] KPI cards show data (Total TEU, FCL, LCL, Est. Spend)
- [ ] All numbers > 0

### Database Verification

Query snapshot cache:
```sql
SELECT company_id, total_shipments, total_teu, trend
FROM lit_importyeti_company_snapshot
WHERE company_id = 'tesla'
ORDER BY updated_at DESC
LIMIT 1;
```

**Expected Result:**
- [ ] Single row returned (no duplicates)
- [ ] company_id = `'tesla'` (lowercase, no "company/" prefix)
- [ ] total_shipments > 0
- [ ] total_teu > 0
- [ ] trend IN ('up', 'down', 'flat')

---

## Regression Testing

### Flag Display on All Devices

**Desktop (1920px+):**
- [ ] Flag emoji stays on same line as company name
- [ ] Flag doesn't push address or details off screen
- [ ] Flag size is consistent (text-lg md:text-xl)

**Tablet (768px - 1024px):**
- [ ] Flag emoji visible and not truncated
- [ ] Company name + flag fit in card width
- [ ] Modal responsive and readable

**Mobile (320px - 767px):**
- [ ] Flag emoji displays on mobile (was broken before)
- [ ] Modal scrollable for content
- [ ] All sections readable without horizontal scroll

### Google Maps Link

**Test:**
1. Hover over address in modal
2. External link icon appears
3. Click MapPin icon
4. Google Maps opens in new tab

**Expected:**
- [ ] Address clickable
- [ ] Opens correct location in Google Maps
- [ ] Address parameters correctly encoded (spaces as %20, etc.)

### No Double-Prefixed Keys

**Check logs for these patterns (WRONG):**
```
company/company/tesla  ❌ WRONG
/company/company/tesla ❌ WRONG
```

**Should only see (RIGHT):**
```
company_id: 'tesla'    ✅ CORRECT
/company/tesla         ✅ CORRECT
```

---

## Performance Verification

### Cache Hit/Miss Behavior

**First request (cache miss):**
```
✅ Should see: source: "importyeti"
✅ Should see: Snapshot saved in logs
✅ Response time: 2-5 seconds
```

**Second request (cache hit):**
```
✅ Should see: source: "cache"
✅ Should NOT make ImportYeti API call
✅ Response time: < 1 second
```

### KPI Loading States

**Before fix (WRONG):**
- KPIs showed 0 for all values
- Trade routes showed "No data available"
- Charts were empty

**After fix (RIGHT):**
- Loading skeleton appears while fetching
- Real KPI data loads within 2-3 seconds
- Charts populate with actual values
- No zero defaults until data loaded

---

## Error Cases to Test

### Scenario 1: Invalid Company Key
```
Search for: "invalid-company-xyz"
Expected: No results OR error message
Not expected: Hanging modal
```

### Scenario 2: Network Error During KPI Fetch
```
Block network for 5 seconds during modal load
Expected: Loading spinner visible
Expected: Error message after timeout
Not expected: Modal freezes
```

### Scenario 3: Missing Data
```
Search for company with minimal shipment history
Expected: KPIs still load (even if some are 0)
Expected: Graceful message if no trade routes
Not expected: Full modal failure
```

---

## Log Inspection Guide

### DevTools Console (F12)

**Search for these patterns:**

✅ **Good Logs:**
```
[KPI] BOL Response: { ok: true, rowCount: 30, sample: {...} }
SNAPSHOT REQUEST: tesla
Normalized slug: tesla
Cache lookup: company_id = 'tesla'
✅ Using cached snapshot (0 credits)
✅ ImportYeti response received
```

❌ **Bad Logs (fix not applied):**
```
Cannot GET /v1.0/company/company/tesla
Snapshot fetch error
SNAPSHOT REQUEST: company/company/tesla
company_id = 'company/tesla'
Invalid identifier format
```

### Edge Function Logs (Supabase Dashboard)

```
Deno.serve() Logs:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 SNAPSHOT REQUEST: company/tesla
  Normalized slug: tesla  ✅
  URL: https://data.importyeti.com/v1.0/company/tesla  ✅
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ ImportYeti response received
📊 Parsed KPIs: { shipments: 1234, teu: 567, trend: 'up' }
✅ Snapshot saved
✅ Search index updated
```

---

## Final Verification Checklist

### Core Functionality
- [ ] Search works and returns results
- [ ] Popup modal opens without errors
- [ ] KPIs load with real data (not zeros)
- [ ] Trade routes display correctly
- [ ] Charts render without errors
- [ ] No "No data available" messages

### UI/UX Fixes
- [ ] Flag emoji displays on desktop (not wrapped)
- [ ] Flag emoji displays on mobile
- [ ] Google Maps icon visible and clickable
- [ ] Modal responsive on all screen sizes
- [ ] Text readable with good contrast

### Backend Data Flow
- [ ] Company IDs normalized consistently
- [ ] Cache lookups use slug format
- [ ] Cache stores with slug key
- [ ] No double-prefixed keys in logs
- [ ] ImportYeti API calls use correct URL

### Performance
- [ ] Cache hits return data in < 1 second
- [ ] First requests complete in 2-5 seconds
- [ ] No API credit waste (proper caching)
- [ ] Loading states clear after data loads

---

## Sign-Off

**Ready for Production When:**
- [ ] Both simulations pass completely
- [ ] No console errors
- [ ] Cache is working (verified via logs)
- [ ] All UI elements display correctly
- [ ] Mobile/tablet/desktop all work

**QA Sign-Off:** _______________  **Date:** ___________

**Known Issues:** (if any)
-
-

---

**Next Phase After Fix Verified:**
1. Command Center feature completion
2. Lusha contact enrichment
3. Campaign management
4. RFP generation
5. Monetization features
