# Comprehensive Debug Guide - 3 Pass Verification

## Overview
This guide walks through three passes of debugging to verify the fixes for:
1. Monthly Activity Chart data rendering (BOL data extraction)
2. Save to Command Center functionality
3. Saved company visual indicators

---

## DEBUG PASS 1: Monthly Activity Chart Data Flow

### What to Check
Verify that ImportYeti BOL data is correctly extracted and aggregated into monthly volumes.

### Steps

1. **Open the Search page** and search for a company (e.g., "home depot")
2. **Click on a company card** to open the detail modal
3. **Open Browser DevTools** (F12) and go to the **Console** tab
4. **Look for these logs** (in order):

```
[fetchCompanySnapshot] Fetching snapshot for: [company_key]
[fetchCompanySnapshot] Response: { ok: true, source: "...", hasSnapshot: true, hasRaw: true }
[RAW PAYLOAD] Full structure: { ... }
[RAW PAYLOAD] Top-level keys: [...]
[RAW PAYLOAD] Data keys: [...recent_bols, total_shipments, ...]
[RAW PAYLOAD] Recent BOLs count: [number]
[RAW PAYLOAD] Sample BOL: { date_formatted: "...", teu: ..., lcl: ... }
[computeMonthlyVolumes] Processing [N] BOLs
[computeMonthlyVolumes] BOL 0: { date: "...", monthKey: "YYYY-MM", teu: [N], isLcl: true/false, type: "FCL/LCL" }
[computeMonthlyVolumes] Final monthly data: { "2025-12": { fcl: ..., lcl: ... }, ... }
[computeMonthlyVolumes] Monthly data keys: ["2025-12", "2025-11", ...]
```

### Expected Outcomes

- ✅ **Data should flow**: The console should show BOL data being parsed and aggregated
- ✅ **Monthly keys format**: Should be "YYYY-MM" (e.g., "2025-12")
- ✅ **Bars should render**: The chart should display FCL and LCL bars for each month
- ✅ **No errors**: No red console errors related to date parsing

### Troubleshooting

| Issue | What to Check |
|-------|---------------|
| **No bars display** | Look for "[computeMonthlyVolumes] Final monthly data: {}" - if empty, BOLs aren't being parsed |
| **No BOLs counted** | Check "[RAW PAYLOAD] Recent BOLs count" - if 0, the API isn't returning BOL data |
| **Date parsing fails** | Look for warnings "[computeMonthlyVolumes] Unable to parse date" - date format mismatch |
| **Console shows error** | Expand error to see full stack trace and identify the issue |

### Debug Commands (Paste in Console)

```javascript
// Check last rawData state
document.querySelectorAll('*')[0].__reactProps || console.log("React internals not accessible")

// Monitor console.logs
const origLog = console.log;
const logs = [];
console.log = (...args) => {
  logs.push(args);
  origLog(...args);
};
// Then trigger search/detail view
// Then: logs.filter(l => l[0]?.includes?.('BOL'))
```

---

## DEBUG PASS 2: Save to Command Center Functionality

### What to Check
Verify that clicking "Save to Command Center" successfully saves the company and returns no errors.

### Steps

1. **From the detail modal** (after opening a company), scroll to the bottom
2. **Click the "Save to Command Center" button**
3. **Watch the Console** for these logs:

```
[saveToCommandCenter] Starting save for: [Company Name] Key: [company_key]
[saveToCommandCenter] Session check: { hasSession: true, hasToken: true, userId: "..." }
[saveToCommandCenter] Sending payload: { company_name: "...", company_key: "...", url: "..." }
[saveToCommandCenter] Response received: { status: 200, statusText: "OK", headers: {...} }
[saveToCommandCenter] Save successful: { success: true, companyId: "...", savedId: "..." }
[saveToCommandCenter] Updated savedCompanyIds: [..., "company_key"]
```

### Expected Outcomes

- ✅ **No errors**: No red console errors
- ✅ **Status 200**: Response status should be HTTP 200 (success)
- ✅ **Success flag**: `success: true` in response
- ✅ **Toast notification**: "Company saved" message appears briefly
- ✅ **Button changes**: Button text changes to "Saved to Command Center" with filled bookmark icon
- ✅ **Modal closes**: The detail modal closes after successful save
- ✅ **Card updates**: Returning to search results, the company card should show "Saved" badge

### Troubleshooting

| Issue | What to Check |
|-------|---------------|
| **Save button does nothing** | Check console for authentication errors or network issues |
| **Error: "No valid session"** | User needs to log in or session expired - refresh page |
| **HTTP 500 error** | Backend error - check Supabase function logs |
| **Error: "No valid response"** | Response isn't valid JSON - backend may have crashed |
| **Saved button doesn't change** | Check if company.importyeti_key is defined |

### Debug Commands (Paste in Console)

```javascript
// Check current auth session
(async () => {
  const supabase = window.supabaseClient; // might not exist
  const { data: { session } } = await supabase?.auth.getSession?.();
  console.log("Auth Session:", session ? { user_id: session.user.id, hasToken: !!session.access_token } : "No session");
})();

// Manually test save endpoint
(async () => {
  const response = await fetch('[SUPABASE_URL]/functions/v1/save-company', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer [YOUR_TOKEN]'
    },
    body: JSON.stringify({
      company_data: { name: 'Test Company', source_company_key: 'test' },
      stage: 'prospect'
    })
  });
  const result = await response.json();
  console.log("Response:", response.status, result);
})();
```

---

## DEBUG PASS 3: Saved Company Visual Indicators

### What to Check
Verify that saved companies show persistent visual indicators and real-time updates.

### Steps

1. **Open Browser Console** and observe these logs when search page loads:

```
[Search] Loading saved companies for user: [user_id]
[Search] Loaded saved company keys: ["company_key1", "company_key2", ...]
[Search] Setting up real-time listener for saved companies
[Search] Subscription status: SUBSCRIBED
```

2. **Search for companies** and verify:
   - Companies you previously saved should show a **blue "Saved" badge** in the top-right
   - The badge should have a filled bookmark icon

3. **Save a new company** (from different browser tab or window):
   - In the original tab, the saved indicator should appear **immediately** (within 1-2 seconds)
   - Look for:
   ```
   [Search] Saved companies real-time update: { ... }
   [Search] Loaded saved company keys: [..., "newly_saved_key"]
   ```

4. **Refresh the page** and verify:
   - The saved badges should still be visible on previously saved companies
   - No warnings about failed loads

### Expected Outcomes

- ✅ **Initial load**: Saved companies load on page mount
- ✅ **Visual indicator**: Blue badge with filled bookmark appears on saved companies
- ✅ **Tooltip**: Hovering over badge shows "This company is saved to your Command Center"
- ✅ **Real-time updates**: Saved badge appears immediately when saving from another source
- ✅ **Persistence**: Saved badges remain after page refresh
- ✅ **No console errors**: All operations complete without errors

### Troubleshooting

| Issue | What to Check |
|-------|---------------|
| **No saved indicators appear** | Check "[Search] Loaded saved company keys" - should be non-empty array |
| **Indicators don't update in real-time** | Check subscription status - should be SUBSCRIBED, not FAILED |
| **Saved indicators disappear on refresh** | Verify query returns correct source_company_key values |
| **Wrong companies show as saved** | Check that company.importyeti_key matches values in savedCompanyIds array |

### Debug Commands (Paste in Console)

```javascript
// Check savedCompanyIds state (React component)
// This is difficult without React DevTools, but you can infer from what badges show

// Monitor real-time subscription
const logs = [];
const origLog = console.log;
console.log = (...args) => {
  if (args[0]?.includes?.('Subscription') || args[0]?.includes?.('real-time')) {
    logs.push(args);
  }
  origLog(...args);
};
// Keep console open and observe updates

// Manually test real-time listener
(async () => {
  const supabase = window.supabaseClient;
  const listener = supabase
    ?.from?.('lit_saved_companies')
    ?.on?.('*', (payload) => {
      console.log("Real-time event:", payload);
    });
  console.log("Listener attached. Make a change in another tab to test.");
})();
```

---

## Critical Logs Summary

### Log Prefixes to Search For

- `[fetchCompanySnapshot]` - API fetch and data retrieval
- `[RAW PAYLOAD]` - Raw ImportYeti response structure
- `[computeMonthlyVolumes]` - Monthly data aggregation
- `[saveToCommandCenter]` - Save operation flow
- `[Search]` - Search page lifecycle and real-time updates

### All Logs Should Include

1. **Action started**: Log when operation begins (with key parameters)
2. **Intermediate steps**: Log intermediate values for debugging
3. **Success/failure**: Log final result with status
4. **Errors**: Console.error with full context

### How to Filter Logs

In DevTools Console, use:
```
// Filter for chart issues
filter: "computeMonthlyVolumes"

// Filter for save issues
filter: "saveToCommandCenter"

// Filter for all LIT logs
filter: "\[Search\]|\[save\]|\[compute\]|\[fetch\]"
```

---

## Next Steps If Issues Persist

1. **Check Environment Variables**
   ```javascript
   console.log("VITE_SUPABASE_URL:", import.meta.env.VITE_SUPABASE_URL)
   console.log("Has value:", !!import.meta.env.VITE_SUPABASE_URL)
   ```

2. **Check Supabase Function Status**
   - Go to Supabase Dashboard > Edge Functions > save-company
   - Check if function is deployed and active
   - Check recent logs for errors

3. **Check Network Requests**
   - Open DevTools > Network tab
   - Filter for "save-company" requests
   - Check Response and Headers tabs for errors

4. **Test with Mock Data**
   - Search for a well-known company (Home Depot, Walmart)
   - Try saving it multiple times
   - Verify error messages are descriptive

---

## Summary Checklist

- [ ] **Pass 1**: Chart bars render with monthly data
- [ ] **Pass 2**: Save completes without errors and shows success
- [ ] **Pass 3**: Saved badges appear and persist correctly
- [ ] **All logs**: No unexpected error messages
- [ ] **All operations**: Complete within reasonable time (< 3 seconds)
- [ ] **User experience**: Smooth flow with clear feedback
