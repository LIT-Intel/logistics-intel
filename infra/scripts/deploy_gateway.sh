#!/usr/bin/env bash
set -euo pipefail

PROJECT="logistics-intel"
REGION="us-central1"
API_ID="logistics-intel-api"
GATEWAY_ID="logistics-intel-gateway"
OPENAPI="./infra/gateway/openapi_v2.yaml"

# Create API if missing
gcloud api-gateway apis describe "$API_ID" --project "$PROJECT" >/dev/null 2>&1 || \
  gcloud api-gateway apis create "$API_ID" --project "$PROJECT"

CONFIG_ID="li-config-$(date +%Y%m%d%H%M%S)"
gcloud api-gateway api-configs create "$CONFIG_ID" \
  --api="$API_ID" \
  --openapi-spec="$OPENAPI" \
  --project="$PROJECT"

# Update gateway to new config
gcloud api-gateway gateways update "$GATEWAY_ID" \
  --api="$API_ID" \
  --api-config="$CONFIG_ID" \
  --location="$REGION" \
  --project="$PROJECT"

echo "CONFIG_ID: $CONFIG_ID"
