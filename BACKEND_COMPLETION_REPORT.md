# LIT Backend Completion Report

## Step 1: CRM Schema Verification (Cloud SQL) ✅ COMPLETE

### Tables Added to Cloud SQL (litcrm database)

All tables created with `CREATE TABLE IF NOT EXISTS` in `services/crm-api/src/db.ts`:

1. **saved_companies** - ImportYeti companies saved from Search to Command Center
   - `company_id` TEXT UNIQUE (primary key for ImportYeti companies)
   - `stage` TEXT (prospect/qualified/etc)
   - `provider` TEXT (importyeti/local/etc)
   - `payload` JSONB (full company + shipments data)
   - `user_id` TEXT
   - Indexes: stage, user_id

2. **campaigns** - Campaign metadata for outreach sequences
   - `id` BIGSERIAL PRIMARY KEY
   - `name` TEXT NOT NULL
   - `status` TEXT (draft/running/paused/complete)
   - `sequence` JSONB (email/LinkedIn steps)
   - `settings` JSONB (send limits, timing, etc)
   - `user_id` TEXT

3. **campaign_companies** - Many-to-many join for campaigns and companies
   - `id` BIGSERIAL PRIMARY KEY
   - `campaign_id` BIGINT FK → campaigns(id)
   - `company_id` TEXT (references saved_companies.company_id)
   - `contact_ids` JSONB
   - `status` TEXT (pending/sent/opened/replied)
   - UNIQUE(campaign_id, company_id) - prevents duplicate additions
   - Indexes: campaign_id, company_id

4. **rfps** - RFP workspace records and generation jobs
   - `id` BIGSERIAL PRIMARY KEY
   - `company_id` TEXT (references saved_companies.company_id)
   - `name` TEXT
   - `lanes` JSONB (shipment lanes for pricing)
   - `status` TEXT (draft/processing/complete/failed)
   - `files` JSONB (generated XLSX/PDF links)
   - `user_id` TEXT
   - Index: company_id

5. **user_settings** - Per-user settings for Settings page
   - `id` BIGSERIAL PRIMARY KEY
   - `user_id` TEXT UNIQUE
   - `settings` JSONB (feature flags, defaults, keys, etc)

### Existing Tables (Already Present)
- companies
- contacts
- outreach_history
- feature_flags
- audit_logs

---

## Step 2: CRM API Endpoints ✅ COMPLETE

### New Route Files Created

**`services/crm-api/src/routes/savedCompanies.ts`**
- POST `/crm/saveCompany` - Save ImportYeti company to Command Center
- GET `/crm/savedCompanies?stage=prospect` - List saved companies
- GET `/crm/companies/:company_id` - Get single company with enrichment
- POST `/crm/companies/:company_id/enrichContacts` - Trigger contact enrichment (stub)

**`services/crm-api/src/routes/campaigns.ts`**
- GET `/crm/campaigns` - List all campaigns with company counts
- POST `/crm/campaigns` - Create new campaign
- GET `/crm/campaigns/:campaign_id` - Get campaign detail + member companies
- POST `/crm/campaigns/:campaign_id/addCompany` - Add company to campaign

**`services/crm-api/src/routes/rfp.ts`**
- GET `/rfp/company/:company_id/context` - Get company data + shipments + existing RFPs
- POST `/rfp/generate` - Generate RFP (XLSX/PDF) async job
- POST `/rfp/workspace` - Create/open RFP workspace
- GET `/rfp/:rfp_id` - Get RFP status and files

### Updated Files
- `services/crm-api/src/index.ts` - Mounted new routes
- `services/crm-api/package.json` - Added express-rate-limit, body-parser

---

## Step 3: Gateway Configuration ✅ COMPLETE

### Added to `infra/gateway/openapi_v2.yaml`

All endpoints added with OPTIONS (CORS) + main method:

**CRM Endpoints:**
- `/crm/companies/{company_id}` - GET
- `/crm/companies/{company_id}/enrichContacts` - POST
- `/crm/campaigns` - GET, POST
- `/crm/campaigns/{campaign_id}` - GET
- `/crm/campaigns/{campaign_id}/addCompany` - POST

**RFP Endpoints:**
- `/rfp/company/{company_id}/context` - GET
- `/rfp/generate` - POST
- `/rfp/workspace` - POST

All routes use:
```yaml
x-google-backend: { address: __SERVICE_URL__, jwt_audience: __SERVICE_URL__ }
```

The `__SERVICE_URL__` placeholder will be replaced during deployment.

---

## ImportYeti Endpoints (Already Present) ✅ VERIFIED

### In `services/search-unified/src/routes/iy.ts`

All ImportYeti endpoints already implemented:

1. **POST `/public/iy/searchShippers`**
   - Searches companies via ImportYeti DMA API
   - Normalizes response to IyShipperHit[] format
   - Handles pagination (page, pageSize)

2. **POST `/public/iy/companyBols`** (Note: POST, not GET)
   - Fetches BOL list for company
   - Hydrates each BOL with /bol/{number} detail call
   - Returns normalized shipment rows with origin/dest/TEU

3. **GET `/public/iy/companyProfile`**
   - Fetches company profile from ImportYeti
   - Returns full company data structure

4. **GET `/public/iy/companyStats`**
   - Legacy stats endpoint
   - Supports ?range=12m parameter

All already exposed in gateway's openapi_v2.yaml.

---

## Compilation Status ✅ PASS

```
npx tsc --noEmit
```
No TypeScript errors in crm-api service.

---

## Deployment Requirements

### Environment Variables Needed

**crm-api service:**
```env
INSTANCE_CONNECTION_NAME=logistics-intel:us-central1:lit-sql
DB_USER=litapp
DB_NAME=litcrm
DB_PASS=<secret>
USE_IAM=false
API_KEY=<optional-for-additional-security>
PORT=8080
```

**search-unified service:**
```env
IY_DMA_API_KEY=<ImportYeti-API-key>
IY_DMA_BASE_URL=https://data.importyeti.com/v1.0
PORT=8080
```

### Deployment Steps

1. **Deploy crm-api to Cloud Run:**
   ```bash
   cd services/crm-api
   gcloud run deploy crm-api \
     --source . \
     --region us-central1 \
     --platform managed \
     --allow-unauthenticated=false \
     --set-env-vars INSTANCE_CONNECTION_NAME=logistics-intel:us-central1:lit-sql,DB_USER=litapp,DB_NAME=litcrm
   ```

2. **Deploy search-unified to Cloud Run:**
   ```bash
   cd services/search-unified
   gcloud run deploy search-unified \
     --source . \
     --region us-central1 \
     --platform managed \
     --allow-unauthenticated=false \
     --set-env-vars IY_DMA_BASE_URL=https://data.importyeti.com/v1.0
   ```

3. **Update Gateway:**
   - Replace `__SERVICE_URL__` in openapi_v2.yaml with actual Cloud Run URLs
   - Or use deployment script that handles this automatically
   - Deploy gateway config: `gcloud api-gateway api-configs create ...`

4. **Schema Initialization:**
   - On first crm-api deployment, `initSchema()` will create all tables
   - Tables use `CREATE TABLE IF NOT EXISTS` so it's safe to redeploy

---

## Testing Endpoints (Step 2)

Once deployed, test each endpoint through the gateway:

### ImportYeti Endpoints
```bash
GATEWAY="https://logistics-intel-gateway-2e68g4k3.uc.gateway.dev"

# Search
curl -X POST "$GATEWAY/public/iy/searchShippers" \
  -H "Content-Type: application/json" \
  -d '{"q":"walmart","page":1,"pageSize":10}'

# Company Profile
curl "$GATEWAY/public/iy/companyProfile?company_id=company/walmart"

# Company BOLs
curl -X POST "$GATEWAY/public/iy/companyBols" \
  -H "Content-Type: application/json" \
  -d '{"company_id":"company/walmart","limit":25,"offset":0}'
```

### CRM Endpoints
```bash
# Save Company
curl -X POST "$GATEWAY/crm/saveCompany" \
  -H "Content-Type: application/json" \
  -d '{
    "company_id": "company/walmart",
    "stage": "prospect",
    "provider": "importyeti",
    "payload": {
      "shipper": {"title": "Walmart", "key": "company/walmart"},
      "shipments": []
    }
  }'

# List Saved Companies
curl "$GATEWAY/crm/savedCompanies?stage=prospect"

# Get Company Detail
curl "$GATEWAY/crm/companies/company%2Fwalmart"

# Enrich Contacts (stub)
curl -X POST "$GATEWAY/crm/companies/company%2Fwalmart/enrichContacts"
```

### Campaign Endpoints
```bash
# List Campaigns
curl "$GATEWAY/crm/campaigns"

# Create Campaign
curl -X POST "$GATEWAY/crm/campaigns" \
  -H "Content-Type: application/json" \
  -d '{"name":"Q1 Outreach","sequence":[],"settings":{}}'

# Add Company to Campaign
curl -X POST "$GATEWAY/crm/campaigns/1/addCompany" \
  -H "Content-Type: application/json" \
  -d '{"company_id":"company/walmart","contact_ids":[]}'
```

### RFP Endpoints
```bash
# Get RFP Context
curl "$GATEWAY/rfp/company/company%2Fwalmart/context"

# Generate RFP
curl -X POST "$GATEWAY/rfp/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "company_id": "company/walmart",
    "lanes": [{"origin":"CNYTN","destination":"USLAX"}],
    "owner": "john@example.com"
  }'
```

---

## Next Step: Frontend Wiring (Step 3)

With backend complete and tested, proceed to wire frontend pages:

1. **Search.tsx** → use real searchShippers, companyProfile, saveCompany
2. **CommandCenter.tsx** → use real savedCompanies, company detail endpoints
3. **Campaigns.jsx** → use real campaign endpoints
4. **RFPStudio.jsx** → use real RFP endpoints
5. **SettingsPage.tsx** → implement settings CRUD

All frontend API calls should use `/api/lit` prefix which proxies to gateway.
