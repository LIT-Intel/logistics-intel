#!/usr/bin/env bash
set -euo pipefail

GW="https://logistics-intel-gateway-2e68g4k3.uc.gateway.dev"

echo "GET /public/status"
curl -fsS "$GW/public/status" | jq '.ok,.bq_ok'

echo "GET /public/getFilterOptions"
curl -fsS "$GW/public/getFilterOptions" | jq '.modes | length'

echo "POST /search (limit 1)"
curl -fsS -X POST "$GW/search" -H 'content-type: application/json' \
  --data '{"limit":1,"offset":0}' | jq '.meta'

echo "POST /public/searchCompanies (limit 1)"
curl -fsS -X POST "$GW/public/searchCompanies" -H 'content-type: application/json' \
  --data '{"limit":1,"offset":0}' | jq '.data[0]|{company_id,company_name}'
