# Base44 App


This app was created automatically by Base44.
It's a Vite+React app that communicates with the Base44 API.

## Running the app

```bash
npm install
npm run dev
```

Environment:

```
VITE_PROXY_BASE=/api/public
NEXT_PUBLIC_API_BASE=https://logistics-intel-gateway-2e68g4k3.uc.gateway.dev
NEXT_PUBLIC_ENABLE_ADVANCED_FILTERS=false # optional, keep off until advanced filters launch
```

Notes:
- The browser calls `/api/public/*` only.
- Firebase Hosting rewrites `/api/**` to the private Cloud Run `api-proxy` service in `us-central1`, which injects the required header to API Gateway.
- No secrets are present in client code.

## Building the app

```bash
npm run build
```

For more information and support, please contact Base44 support at app@base44.com.