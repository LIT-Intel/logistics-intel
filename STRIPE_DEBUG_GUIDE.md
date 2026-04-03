# Stripe Integration Debug & Simulation Guide

## Critical Issues to Debug

### 1. Upgrade Button Not Opening Checkout
**Expected Flow:**
1. User clicks "Upgrade" button
2. Frontend calls `createStripeCheckout({plan_code, interval})`
3. API calls `/functions/billing-checkout` edge function
4. Edge function creates Stripe checkout session
5. Returns `{ok: true, url: "https://checkout.stripe.com..."}`
6. Browser redirects to Stripe checkout

**Current Status:** Button doesn't redirect to checkout
**Likely Causes:**
- STRIPE_SECRET_KEY not set in Supabase secrets
- plans table missing Stripe price IDs
- API gateway not routing to edge functions
- RLS policies blocking Stripe queries

### 2. Billing Portal Error "Failed to open billing portal"
**Expected Flow:**
1. User clicks "Manage in Stripe" button
2. Frontend calls `createStripePortalSession()`
3. API calls `/functions/billing-portal` edge function
4. Edge function queries subscriptions table for stripe_customer_id
5. Creates Stripe billing portal session
6. Returns portal URL

**Current Status:** Error message shown in modal
**Likely Causes:**
- subscriptions table empty (no subscription record for user)
- stripe_customer_id NULL
- Edge function not deployed

### 3. Save Settings Failing
**Expected Flow:**
1. User edits profile fields
2. Clicks "Save changes"
3. Upserts to user_profiles table
4. Shows success message

**Fixed:** Changed `id` → `user_id` in upsert

---

## Verification Checklist

### ✅ Database
```sql
-- Check 1: Verify subscriptions table exists
SELECT * FROM information_schema.tables WHERE table_name = 'subscriptions';

-- Check 2: Verify user_profiles table
SELECT * FROM information_schema.tables WHERE table_name = 'user_profiles';

-- Check 3: Check plans table has Stripe IDs
SELECT code, stripe_product_id, stripe_price_id_monthly FROM plans;
-- Expected: Non-null values for price_id columns

-- Check 4: Check if user has subscription record
SELECT * FROM subscriptions WHERE user_id = '{USER_ID}';
-- Expected: At least one record with stripe_customer_id
```

### ✅ Supabase Secrets
```bash
# Check if STRIPE_SECRET_KEY is set
supabase secrets list

# If not set, add it
supabase secrets set STRIPE_SECRET_KEY sk_test_xxxxx
```

### ✅ Edge Functions
```bash
# Check if functions are deployed
supabase functions list

# Should show:
# - billing-checkout
# - billing-portal

# Redeploy if missing
supabase functions deploy billing-checkout
supabase functions deploy billing-portal
```

### ✅ API Gateway
```bash
# Test if gateway routes to edge functions
curl -X POST https://your-api-gateway.com/functions/billing-checkout \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"plan_code": "standard", "interval": "month"}'

# Expected: Either success response or clear error message
# NOT: 404 or 403 from gateway
```

---

## Simulation Test 1: Full Checkout Flow

### Prerequisites
- ✅ STRIPE_SECRET_KEY configured
- ✅ plans table populated with Stripe price IDs
- ✅ User logged in
- ✅ User has organization

### Steps
1. **Open browser console**
   ```javascript
   // Check if API is callable
   fetch('/api/lit/functions/billing-checkout', {
     method: 'POST',
     headers: {
       'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token')}`,
       'Content-Type': 'application/json'
     },
     body: JSON.stringify({
       plan_code: 'standard',
       interval: 'month'
     })
   })
   .then(r => r.json())
   .then(data => console.log('Response:', data))
   ```

2. **Expected Response**
   ```json
   {
     "ok": true,
     "url": "https://checkout.stripe.com/pay/cs_test_...",
     "sessionId": "cs_test_...",
     "stripe_customer_id": "cus_...",
     "plan_code": "standard",
     "interval": "month"
   }
   ```

3. **If Error**: Check Supabase Edge Function logs
   ```bash
   supabase functions list --json
   # Then check specific function logs
   ```

---

## Simulation Test 2: Billing Portal Flow

### Prerequisites
- ✅ User has active subscription (stripe_customer_id)
- ✅ subscriptions table has record with stripe_customer_id

### Steps
1. **Check subscription record**
   ```sql
   SELECT stripe_customer_id FROM subscriptions 
   WHERE user_id = '${USER_ID}' LIMIT 1;
   ```

2. **Call billing portal API**
   ```javascript
   fetch('/api/lit/functions/billing-portal', {
     method: 'POST',
     headers: {
       'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token')}`,
       'Content-Type': 'application/json'
     }
   })
   .then(r => r.json())
   .then(data => console.log('Response:', data))
   ```

3. **Expected Response**
   ```json
   {
     "ok": true,
     "url": "https://billing.stripe.com/..."
   }
   ```

4. **If Error "No active subscription found"**
   - Problem: subscriptions table empty or stripe_customer_id is NULL
   - Solution: Create subscription via checkout flow first

---

## Common Errors & Solutions

### Error: "Missing STRIPE_SECRET_KEY"
- **Cause:** Secret not set in Supabase
- **Fix:** `supabase secrets set STRIPE_SECRET_KEY sk_test_xxxxx`
- **Verify:** `supabase secrets list`

### Error: "Active plan not found for code: standard"
- **Cause:** plans table missing or plan not marked active
- **Fix:** 
  ```sql
  UPDATE plans SET is_active = true WHERE code IN ('standard', 'growth', 'enterprise');
  ```

### Error: "Missing Stripe price id"
- **Cause:** plans table has NULL price_id columns
- **Fix:** Update with actual Stripe price IDs from Stripe dashboard

### Error: "Failed to persist subscription anchor"
- **Cause:** subscriptions table doesn't exist or RLS blocks insert
- **Fix:** Run migration 20260403_create_subscriptions_table.sql

### Error: "No active subscription found"
- **Cause:** User never completed checkout
- **Fix:** Create subscription via checkout flow, or manually insert test record

### Error: "404 from gateway"
- **Cause:** API gateway not routing `/functions/*` to Supabase
- **Fix:** Check API gateway configuration

---

## Testing Checklist

- [ ] Supabase secrets list shows STRIPE_SECRET_KEY
- [ ] `supabase functions list` shows billing-checkout and billing-portal
- [ ] plans table has non-null stripe_product_id and stripe_price_id_*
- [ ] Simulation Test 1 returns checkout URL
- [ ] User can see Stripe checkout page
- [ ] After checkout, subscriptions table has new record
- [ ] Simulation Test 2 returns portal URL
- [ ] User can open billing portal and manage subscription
- [ ] Save settings works without error
- [ ] Billing page shows real data (not mocks)

---

## Additional Resources

- Stripe API Docs: https://stripe.com/docs/api
- Supabase Edge Functions: https://supabase.com/docs/guides/functions
- API_FLOW.md: Detailed API request/response documentation
- SETTINGS_PAGE_DEBUG.md: Settings page troubleshooting
