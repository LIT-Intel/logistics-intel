# search-unified

Express service backing API Gateway public routes for Logistic Intel search. Queries BigQuery directly.

## Endpoints

- GET /public/getFilterOptions
- POST /public/searchCompanies
- GET /health

## Local dev

```bash
npm i
npm run dev
```

Environment variables (optional):
- PROJECT_ID=logistics-intel
- BQ_DATASET=lit
- DEFAULT_LOOKBACK_DAYS=180

## Build & run

```bash
npm run build
npm start
```

## Docker

```bash
docker build -t search-unified .
```

## Smoke via Gateway

```bash
curl -fsS "https://<gateway>/public/getFilterOptions"

curl -fsS -H "content-type: application/json" \
  -d '{"q":"apple","mode":"air","limit":5}' \
  "https://<gateway>/public/searchCompanies"
```

## Notes
- Cloud Run must be private; API Gateway SA invokes it.
- BigQuery timeouts left at default; adjust if needed via job settings.