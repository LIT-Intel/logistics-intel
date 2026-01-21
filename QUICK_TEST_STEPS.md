# Quick Test Steps - Search Popup Modal Fix

## 🎯 Test Objective
Verify that search popup modals now display company data (KPIs, trade routes, charts) instead of showing empty states.

---

## ✅ Test 1: Desktop Search → Popup → KPIs Load

### Setup
- Open browser DevTools (F12)
- Go to Console tab
- Navigate to Search page

### Steps
1. **Search**
   ```
   Search for: "tesla"
   Click: Search button
   Expected: Results appear (grid view)
   Check: ✓ Country flags show without wrapping
   ```

2. **Open Modal**
   ```
   Click: "View Details" on first result
   Wait: 2-3 seconds for KPIs to load
   Expected: Modal appears with company data
   ```

3. **Verify Modal Header**
   ```
   Check: Company logo/avatar displays
   Check: Company name shows
   Check: Flag emoji visible (🇺🇸)
   Check: Status badge (Active/Inactive)
   ```

4. **Verify KPIs Load**
   ```
   Check: "Logistics KPIs" section populated
   Check: Total TEU shows number > 0
   Check: FCL shows number > 0
   Check: LCL shows number ≥ 0
   Check: Est. Spend shows formatted currency
   ```

5. **Verify Trade Routes**
   ```
   Check: "Trade Routes" section visible
   Check: Origins list shows ports with counts
   Example: "Shanghai, CN (12,450)"
   Check: Destinations list shows ports with counts
   Check: At least 3 ports in each list
   ```

6. **Verify Address & Maps**
   ```
   Check: Address shows with MapPin icon
   Hover: Over address
   Check: ExternalLink icon appears on hover
   Click: Address link
   Expected: Google Maps opens in new tab with location
   ```

### ✅ Success Criteria
- [ ] Modal opens without errors
- [ ] KPI numbers are real (not zeros)
- [ ] Trade routes display with port names and counts
- [ ] Charts render without errors
- [ ] No "No data available" messages
- [ ] Console has no red errors
- [ ] Flag emoji displays correctly (not wrapped)

### Console Log Check
```
✅ Should see:
[KPI] BOL Response: { ok: true, rowCount: 30, ... }
[KPI] Computed KPIs: { teu: 1234, fclCount: 25, ... }

❌ Should NOT see:
Cannot GET /v1.0/company/company/tesla
Snapshot fetch error
undefined is not an object
```

---

## ✅ Test 2: Mobile Search → Popup → KPIs Load

### Setup
- Open DevTools (F12)
- Toggle Device Toolbar (Ctrl+Shift+M or Cmd+Shift+M)
- Set device: iPhone 12 (390x844) or similar
- Navigate to Search page

### Steps
1. **Search** (same as desktop)
2. **Open Modal** (same as desktop)
3. **Verify Mobile Layout**
   ```
   Check: Modal responsive (fits screen)
   Check: No horizontal scroll needed
   Check: Flag emoji displays (THIS WAS BROKEN BEFORE)
   Check: All text readable
   Check: KPIs visible without scrolling
   Scroll: Down to see Trade Routes and Charts
   ```

### ✅ Success Criteria
- [ ] Modal responsive and readable
- [ ] Flag emoji displays (was missing before)
- [ ] All sections scrollable on mobile
- [ ] No text truncation beyond line-clamping
- [ ] Links clickable and tap-friendly

---

## ✅ Test 3: Saved Company in Command Center

### Setup
- Navigate to Command Center
- Ensure there are saved companies (or save one from search)

### Steps
1. **Open Saved Company**
   ```
   Click: "Saved Companies" tab
   Click: Any saved company in list
   Expected: Detail drawer/panel opens on right side
   ```

2. **Verify Company Header**
   ```
   Check: Company name displays
   Check: Flag emoji visible and NOT wrapped
   Check: Logo/avatar shows
   ```

3. **Verify Shipments Panel**
   ```
   Scroll: Down to find "Shipments" section
   Check: Table displays shipment rows
   Check: Columns visible (Date, Origin, Destination, etc.)
   ```

4. **Verify KPIs in Detail**
   ```
   Check: KPI cards show real numbers
   Check: No loading spinners after 2 seconds
   Check: All values populated
   ```

### ✅ Success Criteria
- [ ] Detail drawer opens without errors
- [ ] Company info displays correctly
- [ ] Shipments load and display
- [ ] KPIs show real data
- [ ] Flag emoji displays properly

---

## 🔍 Debug Checks

### Check 1: Verify Slug Normalization
**In Browser Console:**
```javascript
// Test normalization function
normalizeCompanyIdToSlug("company/Tesla Inc.")
// Should return: "tesla-inc"

normalizeCompanyIdToSlug("Wahoo-Fitness")
// Should return: "wahoo-fitness"
```

### Check 2: Verify Cache Working
**In Network Tab:**
1. Open modal for "Tesla"
2. Check Edge Function response
3. Should show: `source: "importyeti"` (first time)
4. Open another company
5. Come back to Tesla
6. Should show: `source: "cache"` (second time)

### Check 3: Verify No Double-Prefix
**In Network Tab → importyeti-proxy → Request:**
```json
{
  "action": "company",
  "company_id": "tesla"  ✅ CORRECT (slug only)
}
```

**NOT:**
```json
{
  "company_id": "company/tesla"  ❌ WRONG
}
```

### Check 4: Database Verification
**In Supabase SQL Editor:**
```sql
SELECT company_id, total_shipments, total_teu
FROM lit_importyeti_company_snapshot
WHERE company_id LIKE 'tesla%'
ORDER BY updated_at DESC
LIMIT 5;
```

**Expected:**
```
company_id                | total_shipments | total_teu
--------------------------|-----------------|----------
tesla                      | 1234            | 567
tesla-inc                  | 890             | 345
tesla-energy               | 456             | 123
```

**NOT Expected:**
```
company/tesla              | 1234            | 567  ❌ WRONG
company/company/tesla      | ???             | ???  ❌ VERY WRONG
```

---

## 📋 Test Results Sheet

### Test 1: Desktop Search → Popup
| Item | Expected | Result | Pass |
|------|----------|--------|------|
| Search returns results | Yes | ? | [ ] |
| Modal opens | Yes | ? | [ ] |
| Flag displays | Yes | ? | [ ] |
| KPIs show numbers | Yes, > 0 | ? | [ ] |
| Trade routes load | Yes | ? | [ ] |
| Charts display | Yes | ? | [ ] |
| No errors in console | Yes | ? | [ ] |

### Test 2: Mobile Search → Popup
| Item | Expected | Result | Pass |
|------|----------|--------|------|
| Modal responsive | Yes | ? | [ ] |
| Flag displays on mobile | Yes | ? | [ ] |
| Text readable | Yes | ? | [ ] |
| All sections scrollable | Yes | ? | [ ] |
| No horizontal scroll | Yes | ? | [ ] |

### Test 3: Command Center
| Item | Expected | Result | Pass |
|------|----------|--------|------|
| Detail drawer opens | Yes | ? | [ ] |
| Company info displays | Yes | ? | [ ] |
| Shipments load | Yes | ? | [ ] |
| KPIs show data | Yes | ? | [ ] |
| Flag displays | Yes | ? | [ ] |

### Debug Checks
| Item | Expected | Result | Pass |
|------|----------|--------|------|
| Slug normalization | "tesla-inc" | ? | [ ] |
| Cache working | source: "cache" | ? | [ ] |
| No double-prefix | company_id: "tesla" | ? | [ ] |
| DB has slug format | company_id = 'tesla' | ? | [ ] |

---

## 🚀 Quick Troubleshooting

### Problem: Modal still empty
```
1. Check browser console for red errors
2. Check Network tab → importyeti-proxy response
3. Is response showing real data or error?
4. Check Supabase logs for snapshot fetch errors
```

### Problem: Flags still wrapping on desktop
```
1. Zoom to 100% (Ctrl+0 or Cmd+0)
2. Maximize browser window
3. Check if CSS applied: inspect element
4. Should have classes: flex-shrink-0 whitespace-nowrap
```

### Problem: KPIs showing zeros
```
1. Wait 5 seconds (sometimes slow)
2. Hard refresh: Ctrl+Shift+R (or Cmd+Shift+R on Mac)
3. Check console logs for BOL response
4. If still empty, data might not exist in ImportYeti
```

### Problem: Google Maps link doesn't work
```
1. Check URL in browser DevTools (Network tab)
2. Should have: google.com/maps/search/
3. Address should be URL-encoded
4. Try clicking again (might be blocked by popup blocker)
```

---

## 📊 Performance Expectations

### First Company View
- Time to modal open: ~1 second
- Time to KPIs appear: 2-5 seconds
- Total: ~5 seconds (normal)

### Second Company View
- Time to modal open: ~1 second
- Time to KPIs appear: <1 second
- Total: <2 seconds (cache working)

### Cache Efficiency
- If all recent companies loaded from cache: ✅ GOOD
- If Edge Function called every time: ⚠️ Check cache settings

---

## ✅ Final Checklist

Before marking as complete:
- [ ] Test 1 passed on desktop
- [ ] Test 2 passed on mobile
- [ ] Test 3 passed in Command Center
- [ ] Debug checks all verified
- [ ] No console errors
- [ ] All KPIs showing real data
- [ ] Flag displays correctly everywhere
- [ ] Google Maps link works

---

**Status:** Ready for QA testing
**Estimated time:** 15-20 minutes per tester
**Required environment:** Staging or production
**Success criteria:** All 3 tests pass with no errors
