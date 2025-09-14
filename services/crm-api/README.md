# crm-api

Private CRM API behind API Gateway. Connects to Cloud SQL (Postgres) via Connector.

## Env
- INSTANCE_CONNECTION_NAME=logistics-intel:us-central1:lit-sql
- DB_NAME=litcrm
- DB_USER=litapp
- USE_IAM=true|false
- DB_PASS=... (when USE_IAM=false)
- API_KEY=... (optional)

## Dev
```bash
npm i
npm run dev
```

## Build
```bash
npm run build
npm start
```

## Routes (via Gateway)
- POST /crm/companies
- GET  /crm/companies/:id
- POST /crm/contacts
- POST /crm/outreach
- GET  /crm/feature-flags
- GET  /admin/audit

## Docker
```bash
docker build -t crm-api .
```