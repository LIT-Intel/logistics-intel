#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="logistics-intel"
POOL_ID="gh-oidc"
PROVIDER_ID="github"
SA_EMAIL="apigw-lit-caller@${PROJECT_ID}.iam.gserviceaccount.com"
REPO="LIT-Intel/logistics-intel" # org/repo

# Create pool + provider (if not already)
gcloud iam workload-identity-pools create "$POOL_ID" \
  --project "$PROJECT_ID" --location="global" --display-name="GitHub OIDC" || true

gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
  --project "$PROJECT_ID" --location="global" --workload-identity-pool="$POOL_ID" \
  --display-name="GitHub" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --issuer-uri="https://token.actions.githubusercontent.com" || true

# Allow the GitHub repo to impersonate the SA
WIF="projects/$(gcloud iam workload-identity-pools describe $POOL_ID --project $PROJECT_ID --location=global --format='value(name)')/providers/$PROVIDER_ID"
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --project "$PROJECT_ID" \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/${WIF}/attribute.repository/${REPO}"

# Make sure SA has needed roles
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member "serviceAccount:${SA_EMAIL}" \
  --role roles/apigateway.admin
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member "serviceAccount:${SA_EMAIL}" \
  --role roles/serviceusage.serviceUsageConsumer
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member "serviceAccount:${SA_EMAIL}" \
  --role roles/run.viewer
