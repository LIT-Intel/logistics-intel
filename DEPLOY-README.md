# Deploy & Smoke (CI-only)

This repo deploys automatically on merge to `main` via GitHub Actions.

## One-time setup (GitHub OIDC / WIF)
Configure Workload Identity Federation for GitHub Actions to impersonate the deployer service account.

- Workload identity provider:
  `projects/187580267283/locations/global/workloadIdentityPools/github/providers/github`
- Deployer service account:
  `github-actions-deployer@logistics-intel.iam.gserviceaccount.com`

Add this repository secret:
- `PROXY_URL`: The Cloud Run URL of your private api-proxy service (e.g., `https://api-proxy-XXXXXXXX-uc.a.run.app`).

## What happens on merge
- Frontend builds and deploys to Firebase Hosting.
- Firebase Functions (Gen2) deploys the callable `searchCompanies_index` only.
- Smoke tests run against `PROXY_URL`:
  - POST `/public/getFilterOptions` with `{}` expects JSON with `modes`.
  - POST `/public/searchCompanies` with `{ q:"acme", pagination:{limit:1,offset:0} }` expects JSON.
  - Requests include an ID token (audience = `PROXY_URL`).

## Browser call path
- The SPA calls `/api/public/*` (see `frontend/firebase.json`).
- Firebase Hosting rewrites `/api/**` to the private Cloud Run `api-proxy` service.
- The proxy injects the secret header to API Gateway server-side. No secrets exist in client code.