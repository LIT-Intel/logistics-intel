# Deploy & Smoke (CI-only)

This repo deploys automatically on merge to `main` via GitHub Actions.

## One-time setup (GitHub Secrets)
Add these in GitHub → Settings → Secrets and variables → Actions:

- `FIREBASE_SERVICE_ACCOUNT`: JSON for a GCP service account with roles:
  - Firebase Admin
  - Firebase Hosting Admin
  - Cloud Functions Admin
  - Cloud Run Admin
  - Service Account User
  - IAM Service Account Token Creator
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