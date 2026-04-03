# Settings Page Debugging & Implementation Guide

## What's Been Fixed

### 1. SettingsPage Component Issues ✅
- **Fixed**: useAuth() destructuring - was trying to access `role`, `plan`, `access` directly from useAuth()
  - Solution: Extract `plan` and `role` from `user` object returned by useAuth()
  - Updated: Line 197-199 of SettingsPage.tsx

- **Fixed**: Table reference error - was querying "profiles" table which doesn't exist
  - Solution: Changed all queries to use "user_profiles" table (correct table name from migrations)
  - Updated: Lines 273 and 439 in SettingsPage.tsx

- **Fixed**: Missing access object check
  - Solution: Changed `access?.isAdmin` to check `role === 'admin' || role === 'owner'`

### 2. Database Migrations Created ✅
- **billing-checkout** function now has subscriptions table to store user subscriptions
- **billing-portal** edge function created for Stripe customer portal access
- **Organization setup** migration created to add user to organization as owner
- **Stripe pricing** migration template created for price IDs

### 3. Real Data Loading ✅
- Added `loadBillingData()` function that fetches real data from:
  - subscriptions table (user's plan and status)
  - token_ledger table (usage metrics)
- Updated billing UI to display:
  - Real next billing date (instead of hardcoded "May 2")
  - Real Stripe status (instead of hardcoded "Active")
  - Real usage metrics (instead of hardcoded 312/1840/47)

## What Still Needs Configuration

### 1. Stripe API Keys ⚠️
The edge functions require `STRIPE_SECRET_KEY` environment variable set in Supabase:

**Steps:**
1. Log into your Stripe dashboard at https://dashboard.stripe.com/apikeys
2. Copy your **Secret Key** (starts with `sk_test_` for testing or `sk_live_` for production)
3. Add to Supabase via CLI:
   ```bash
   supabase secrets set STRIPE_SECRET_KEY sk_test_xxxxx
   ```
   Or via Supabase Dashboard: Settings → Secrets → Add new secret

### 2. Stripe Products & Prices ⚠️
You must create products and prices in Stripe, then update the plans table:

**Steps:**
1. Create 4 products in Stripe Dashboard:
   - Free Trial (price: $0)
   - Standard (price: $49/month or $490/year)
   - Growth (price: $299/month or $2,990/year)
   - Enterprise (custom pricing)

2. Copy the **price IDs** for each product (format: `price_xxxxx`)

3. Update the plans table with these IDs:
   ```sql
   UPDATE plans 
   SET stripe_product_id = 'prod_xxxxx',
       stripe_price_id_monthly = 'price_xxxxx',
       stripe_price_id_yearly = 'price_xxxxx'
   WHERE code = 'standard';
   ```

   Or use the migration template and fill in actual values:
   ```bash
   # Edit this file with real Stripe IDs
   nano /home/user/logistics-intel/supabase/migrations/20260403_populate_stripe_prices.sql
   ```

### 3. User Organization Setup ⚠️
The user `vraymond83@gmail.com` needs to be in an organization for the invite feature to work.

**Status:** Migration created (`20260403_setup_user_organization.sql`) but needs to be applied.

**Manual alternative:** Execute this SQL in Supabase:
```sql
-- Get user ID
SELECT id FROM auth.users WHERE email = 'vraymond83@gmail.com';

-- Create organization (replace {USER_ID} with actual ID from above)
INSERT INTO organizations (id, owner_id, name, industry, region, timezone)
VALUES (gen_random_uuid(), '{USER_ID}', 'Logistics Intel Workspace', 'Logistics', 'US', 'America/New_York');

-- Add user to organization as owner
INSERT INTO org_members (org_id, user_id, role)
VALUES ('{ORG_ID}', '{USER_ID}', 'owner');

-- Create billing record
INSERT INTO org_billing (org_id, plan, status)
VALUES ('{ORG_ID}', 'free_trial', 'active');
```

## Testing Checklist

- [ ] Verify STRIPE_SECRET_KEY is set in Supabase Edge Function secrets
- [ ] Verify Stripe products are created with correct prices
- [ ] Verify plans table is populated with Stripe product/price IDs
- [ ] Verify user is in organization (check org_members table)
- [ ] Test upgrade button → should redirect to Stripe checkout
- [ ] Test invite team member → should accept email and create invite record
- [ ] Test manage subscription → should open Stripe customer portal
- [ ] Verify billing page shows real data (not hardcoded values)

## Troubleshooting

### "Missing STRIPE_SECRET_KEY" Error
- Check Supabase secrets: Project Settings → Secrets
- Verify exact name is `STRIPE_SECRET_KEY`
- Redeploy edge functions after adding secret:
  ```bash
  supabase functions deploy billing-checkout
  supabase functions deploy billing-portal
  ```

### "Plan not found" Error
- Verify plans table has records with `is_active = true`
- Check that `code` column matches requested plan (free_trial, standard, growth, enterprise)
- Verify `stripe_price_id_monthly` and `stripe_price_id_yearly` are not NULL

### "No organization found" Error
- User is not in org_members table
- Run organization setup migration or execute manual SQL above
- Verify user record exists: `SELECT * FROM auth.users WHERE email = 'vraymond83@gmail.com'`

### Upgrade Button Not Working
- Check browser network tab for error response
- Verify Stripe secret key is correctly set
- Verify plans table has Stripe price IDs
- Check Supabase Edge Function logs: Supabase Dashboard → Edge Functions → billing-checkout

### Stripe Portal Not Opening
- Verify billing-portal function is deployed
- Check that user has an active subscription (subscriptions table)
- Verify Stripe customer ID is valid

## Files Modified

- `frontend/src/pages/SettingsPage.tsx` - Fixed table refs, real data loading
- `frontend/src/auth/AuthProvider.jsx` - No changes needed (already provides user with plan/role)
- `supabase/functions/billing-checkout/index.ts` - No changes (works with subscriptions table)
- `supabase/functions/billing-portal/index.ts` - Created new
- `supabase/migrations/20260403_create_subscriptions_table.sql` - Created new
- `supabase/migrations/20260403_setup_user_organization.sql` - Created new
- `supabase/migrations/20260403_populate_stripe_prices.sql` - Created new

## Next Steps

1. **Get Stripe Product/Price IDs** from Stripe dashboard
2. **Update migrations** with real IDs
3. **Apply migrations** to Supabase database
4. **Set Stripe secret key** in Supabase secrets
5. **Deploy Edge Functions** to activate them
6. **Test all workflows** using the checklist above
