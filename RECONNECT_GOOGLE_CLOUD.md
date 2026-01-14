# Reconnecting to Google Cloud Backend

This document provides instructions for switching from development mode (Supabase + mock data) back to the production Google Cloud backend.

## Overview

During UI development, the application is configured to use:
- **Supabase** for data persistence (saved companies, contacts, campaigns)
- **Mock data** for search, company profiles, and shipment data
- **Local development** mode to bypass unavailable Google Cloud services

When the Google Cloud backend is ready, follow these steps to reconnect.

---

## Quick Reconnection (2 minutes)

### Step 1: Update Environment Variable

Edit `/tmp/cc-agent/62524342/project/.env` or your Vercel environment variables:

```bash
# Change this line:
VITE_USE_MOCK_DATA=true

# To:
VITE_USE_MOCK_DATA=false

# Uncomment the Google Cloud API endpoint:
VITE_API_BASE=https://lit-caller-gw-2e68g4k3.uc.gateway.dev
```

### Step 2: Deploy

```bash
# If deploying to Vercel
vercel env add VITE_USE_MOCK_DATA
# Enter: false

# Redeploy
vercel --prod

# Or commit and push to trigger automatic deployment
git add .env
git commit -m "Switch to Google Cloud backend"
git push
```

### Step 3: Verify

1. Open the application
2. Check browser console for log messages - should see NO `[DEV API]` logs
3. Test saving a company - should call `/api/lit/crm/saveCompany`
4. Test search - should return real ImportYeti data
5. Test Command Center - companies should persist to Google Cloud

---

## What Gets Switched

### Development Mode (Current State)

When `VITE_USE_MOCK_DATA=true`:

| Feature | Data Source |
|---------|-------------|
| Saved Companies | Supabase `lit_saved_companies` table |
| Search Results | Mock data (5 sample companies) |
| Company Profiles | Mock profiles (Apple, Walmart, Tesla, etc.) |
| Company Shipments | Generated mock BOLs |
| Contacts | Mock contacts (4 per company) |
| Campaigns | Supabase `lit_campaigns` table |
| RFP Generation | Mock file URLs |
| Filter Options | Static mock values |

### Production Mode (After Reconnection)

When `VITE_USE_MOCK_DATA=false`:

| Feature | Data Source |
|---------|-------------|
| Saved Companies | Google Cloud CRM API (`/crm/savedCompanies`) |
| Search Results | ImportYeti DMA API via Google Cloud Gateway |
| Company Profiles | ImportYeti company profiles |
| Company Shipments | Real BOL data from ImportYeti |
| Contacts | Lusha or enrichment service via backend |
| Campaigns | Google Cloud CRM API (`/crm/campaigns`) |
| RFP Generation | Real Excel/PDF generation via backend |
| Filter Options | BigQuery aggregated filter data |

---

## Files Modified for Development Mode

These files route to Supabase/mock data when in development mode:

### Core API Layer
- `/frontend/src/lib/api.ts` - Main API client with dev mode checks
- `/frontend/src/lib/apiDev.ts` - Development mode implementation
- `/frontend/src/lib/supabase.ts` - Supabase client and helpers

### Data Layer
- `/frontend/src/lib/mockData.ts` - Sample companies and profiles

### Database (Supabase)
- `supabase/migrations/create_lit_development_tables.sql` - Dev tables

### Configuration
- `/.env` - Development mode flag

---

## API Endpoints Affected

### Functions with Development Mode

These functions check `isDevMode()` and route accordingly:

```typescript
// Saved companies
listSavedCompanies()      // → devGetSavedCompanies() or Google Cloud
saveCompanyToCrm()        // → devSaveCompany() or Google Cloud

// Search
searchShippers()          // → devSearchShippers() or ImportYeti API
getIyCompanyProfile()     // → devGetCompanyProfile() or ImportYeti API

// Filters
getFilterOptions()        // → devGetFilterOptions() or BigQuery

// Campaigns
getCampaigns()            // → devGetCampaigns() or Google Cloud
```

### Development Mode Implementation

All dev functions are in `/frontend/src/lib/apiDev.ts`:

```typescript
export async function devGetSavedCompanies(stage = 'prospect')
export async function devSaveCompany(payload: any)
export async function devGetCompanyDetail(company_id: string)
export async function devSearchCompanies(payload: any)
export async function devGetCompanyProfile(companyKey: string)
export async function devGetCompanyBols(params: any)
export async function devSearchShippers(params: any)
export async function devEnrichContacts(company_id: string)
export async function devGetContacts(company_id: string)
export async function devGetCampaigns()
export async function devCreateCampaign(payload: any)
export async function devAddCompanyToCampaign(params: any)
export async function devGetRfpContext(company_id: string)
export async function devGenerateRfp(payload: any)
export async function devGetFilterOptions()
```

---

## Data Migration (Optional)

If you want to migrate development data to Google Cloud:

### Export Companies from Supabase

```sql
-- Run in Supabase SQL Editor
SELECT
  company_id,
  company_key,
  company_name,
  company_data,
  stage,
  source,
  created_at
FROM lit_saved_companies
ORDER BY created_at DESC;
```

### Import to Google Cloud

Use the CRM API to bulk import:

```javascript
const companies = /* exported data */;

for (const company of companies) {
  await fetch('https://lit-caller-gw-2e68g4k3.uc.gateway.dev/crm/saveCompany', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      company_id: company.company_id,
      stage: company.stage,
      provider: company.source,
      payload: company.company_data,
    }),
  });
}
```

---

## Cleanup (Optional)

After successful reconnection, you can optionally:

### Remove Development Files

```bash
# Optional: Remove dev-only files
rm frontend/src/lib/apiDev.ts
rm frontend/src/lib/supabase.ts

# Optional: Remove dev mode checks from api.ts
# (search for "isDevMode()" and remove conditional branches)
```

### Remove Supabase Tables

```sql
-- Optional: Clean up Supabase dev tables
DROP TABLE IF EXISTS lit_campaign_companies CASCADE;
DROP TABLE IF EXISTS lit_campaigns CASCADE;
DROP TABLE IF EXISTS lit_contacts CASCADE;
DROP TABLE IF EXISTS lit_saved_companies CASCADE;
```

### Keep for Future Development

**Recommended**: Keep all development infrastructure for future use:
- Enables quick UI iteration without backend
- Useful for demos and testing
- Provides fallback if backend issues occur
- Simply toggle `VITE_USE_MOCK_DATA` to switch modes

---

## Testing Checklist

After reconnection, test these workflows:

### Search Flow
- [ ] Search for a company by name
- [ ] Results show real ImportYeti data
- [ ] Click on a company to view details
- [ ] Company profile loads from ImportYeti

### Save Flow
- [ ] Click "Save to Command Center" on a search result
- [ ] Company saves to Google Cloud CRM
- [ ] Navigate to Command Center
- [ ] Saved company appears in the list

### Command Center
- [ ] List of saved companies loads from Google Cloud
- [ ] Click on a company to view details
- [ ] Company data displays correctly
- [ ] Shipments tab shows real BOL data

### Contacts
- [ ] Click "Enrich Contacts" on a company
- [ ] Contacts load from enrichment service (Lusha)
- [ ] Contact details display correctly

### Campaigns
- [ ] Create a new campaign
- [ ] Campaign saves to Google Cloud
- [ ] Add companies to campaign
- [ ] Campaign list shows all campaigns

### RFP
- [ ] Open RFP workspace for a company
- [ ] Generate RFP document
- [ ] Download Excel/PDF files
- [ ] Files contain real company data

---

## Troubleshooting

### Issue: Still seeing mock data

**Check:**
1. Environment variable is actually `false` (not "false" in quotes)
2. Application was restarted/redeployed after env change
3. Browser cache was cleared
4. Check browser console for `[DEV API]` logs (should be absent)

**Solution:**
```bash
# Hard reload browser
Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)

# Clear localStorage
localStorage.clear()
location.reload()
```

### Issue: 503 errors from Google Cloud

**This means the backend is still unavailable.**

**Temporary solution:**
1. Switch back to development mode: `VITE_USE_MOCK_DATA=true`
2. Continue UI development
3. Retry reconnection when backend is restored

**Permanent solution:**
1. Verify Google Cloud services are running:
   - `search-unified` Cloud Run service
   - API Gateway is responding
   - BigQuery dataset is accessible
2. Check API Gateway logs for errors
3. Test endpoints directly with curl/Postman

### Issue: Data inconsistencies

**If some data is in Supabase and some is expected from Google Cloud:**

**Solution:**
1. Export important data from Supabase (see Data Migration section)
2. Switch to production mode
3. Import data using bulk API calls
4. Verify all features work with production data

---

## Support

If you encounter issues during reconnection:

1. Check Google Cloud Console logs
2. Verify API Gateway is responding
3. Test backend endpoints directly
4. Review browser console for API errors
5. Check network tab for failed requests

---

## Summary

**To switch back to Google Cloud:**
1. Set `VITE_USE_MOCK_DATA=false` in `.env`
2. Uncomment `VITE_API_BASE=https://lit-caller-gw-2e68g4k3.uc.gateway.dev`
3. Redeploy the application
4. Test all major workflows
5. Verify data persists to Google Cloud

**To switch back to development:**
1. Set `VITE_USE_MOCK_DATA=true` in `.env`
2. Comment out `VITE_API_BASE`
3. Redeploy the application
4. Continue UI development unblocked

The development infrastructure is designed to be toggled on/off easily, allowing you to switch between modes as needed.
