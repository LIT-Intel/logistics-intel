# Logistic Intel Demo Checklist

## Env
- Project: logistics-intel
- Region: us-central1
- Gateway base: https://lit-caller-gw-2e68g4k3.uc.gateway.dev
- Cloud SQL: logistics-intel:us-central1:lit-sql (DB litcrm, user litapp)

## Deploy
- Build and deploy Cloud Run services (private):
  - search-unified
  - crm-api
- Grant roles/run.invoker to API Gateway SA: apigw-lit-backend@logistics-intel.iam.gserviceaccount.com
- Update API Gateway OpenAPI to map:
  - /public/getFilterOptions (GET)
  - /public/searchCompanies (POST)
  - /crm/* to crm-api (POST/GET)
  - Ensure CORS: GET/POST/OPTIONS allowed; allow headers Content-Type, Authorization
- Frontend (Vercel): set VITE_API_BASE to Gateway base

## Smoke via Gateway
```bash
# Search
curl -fsS "https://lit-caller-gw-2e68g4k3.uc.gateway.dev/public/getFilterOptions" | jq .
curl -fsS -H "content-type: application/json" \
  -d '{"q":"apple","mode":"air","limit":5}' \
  "https://lit-caller-gw-2e68g4k3.uc.gateway.dev/public/searchCompanies" | jq .

# CRM
curl -fsS -H "content-type: application/json" \
  -d '{"name":"Acme Logistics","website":"https://acme.com","plan":"Pro"}' \
  "https://lit-caller-gw-2e68g4k3.uc.gateway.dev/crm/companies" | jq .

curl -fsS "https://lit-caller-gw-2e68g4k3.uc.gateway.dev/crm/companies/1" | jq .
```

## Browser
- Open /app/search: filters populate; results load
- Open company: Save to CRM; see 200 and id; GET company shows empty contacts/outreach initially

## Notes
- Services are private; Gateway invokes with audience = exact service URL
- Feature flags load from /crm/feature-flags; gating is read-only