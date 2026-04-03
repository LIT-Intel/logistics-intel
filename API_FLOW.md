# API Flow Documentation

## Billing Checkout API Flow

### 1. Frontend Call
```typescript
// SettingsPage.tsx - User clicks "Upgrade" button
const result = await createStripeCheckout({
  plan_code: "standard",
  interval: "month",
});
```

### 2. HTTP Client
```typescript
// api/functions.js
export const createStripeCheckout = httpCall('/functions/billing-checkout', { ok: false });

// Calls httpClient with endpoint: /functions/billing-checkout
// httpClient adds Bearer token to Authorization header
```

### 3. Network Request
```
POST /api/lit/functions/billing-checkout
Headers:
  Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  Content-Type: application/json
Body:
  {
    "plan_code": "standard",
    "interval": "month"
  }
```

### 4. Vite Proxy (Development)
```
Vite server intercepts request to /api/lit/*
Rewrites path: /api/lit/functions/billing-checkout → /functions/billing-checkout
Forwards to: ${API_GATEWAY_BASE}/functions/billing-checkout
```

### 5. API Gateway
```
Receives: POST /functions/billing-checkout
Routes to: Supabase Edge Functions
Endpoint: https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/billing-checkout
```

### 6. Supabase Edge Function
```typescript
// supabase/functions/billing-checkout/index.ts
- Receives request with Bearer token in Authorization header
- Validates user using Supabase auth
- Creates Stripe checkout session
- Stores subscription record
- Returns session URL
```

### 7. Frontend Response
```javascript
{
  ok: true,
  url: "https://checkout.stripe.com/pay/cs_test_...",
  sessionId: "cs_test_...",
  stripe_customer_id: "cus_...",
  plan_code: "standard",
  interval: "month"
}
```

### 8. Browser Redirect
```javascript
window.location.href = result.url;
// User is redirected to Stripe checkout page
```

## Required Configuration

### API Gateway Base
The vite.config.ts uses this priority for API gateway:
1. `API_GATEWAY_BASE` env variable
2. `VITE_API_BASE` env variable
3. `NEXT_PUBLIC_API_BASE` env variable
4. Default: `https://logistics-intel-gateway-2e68g4k3.uc.gateway.dev`

**Verify:** Check that your API gateway is configured to route `/functions/*` requests to:
```
https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/*
```

### Supabase Edge Functions
Edge functions need these environment variables:
```
STRIPE_SECRET_KEY=sk_test_... or sk_live_...
SUPABASE_URL=https://jkmrfiaefxwgbvftohrb.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Troubleshooting the API Flow

### Issue: 404 Not Found
- **Symptom:** API returns 404 when calling `/functions/billing-checkout`
- **Cause:** API gateway not routing correctly to Supabase edge functions
- **Solution:** Verify API gateway configuration routes `/functions/*` to Supabase

### Issue: 401 Unauthorized
- **Symptom:** API returns 401 "Unauthorized"
- **Cause:** Invalid or missing Authorization header
- **Solution:** 
  - Check that user is logged in (has valid session)
  - Verify Bearer token is correctly formatted
  - Check Supabase auth is working (test with a simple query)

### Issue: Missing STRIPE_SECRET_KEY
- **Symptom:** API returns error "Missing STRIPE_SECRET_KEY"
- **Cause:** Edge function environment variable not set
- **Solution:**
  ```bash
  supabase secrets set STRIPE_SECRET_KEY sk_test_...
  supabase functions deploy billing-checkout
  ```

### Issue: Plan not found
- **Symptom:** API returns "Active plan not found for code: standard"
- **Cause:** Plan doesn't exist or Stripe price IDs not set
- **Solution:**
  - Verify plans table has data
  - Update plans table with Stripe price IDs
  - Ensure plan has `is_active = true`

### Issue: Failed to persist subscription anchor
- **Symptom:** API returns error but URL is included
- **Cause:** subscriptions table doesn't exist or RLS policy blocks insert
- **Solution:**
  - Run migration: `20260403_create_subscriptions_table.sql`
  - Verify RLS policy allows authenticated users to insert

## API Response Formats

### Successful Checkout Session
```json
{
  "ok": true,
  "url": "https://checkout.stripe.com/pay/cs_test_abc123",
  "sessionId": "cs_test_abc123",
  "stripe_customer_id": "cus_test_123",
  "plan_code": "standard",
  "interval": "month"
}
```

### Error Response
```json
{
  "ok": false,
  "error": "Error message describing what went wrong",
  "details": "Additional error details from Stripe/Supabase"
}
```

## Testing with cURL

### Test API Endpoint
```bash
# Get your auth token first
TOKEN="your_supabase_session_access_token"

# Test checkout
curl -X POST http://localhost:8080/api/lit/functions/billing-checkout \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "plan_code": "standard",
    "interval": "month"
  }'
```

### Test Supabase Auth
```bash
# Check if Supabase auth is working
curl -X GET https://jkmrfiaefxwgbvftohrb.supabase.co/auth/v1/user \
  -H "Authorization: Bearer $TOKEN" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```
