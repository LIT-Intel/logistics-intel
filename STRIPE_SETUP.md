# Stripe Integration Setup Guide

This document explains how to configure Stripe for the Logistics Intel billing system.

## Overview

The billing system integrates with Stripe for:
- Checkout sessions for plan upgrades
- Subscription management
- Customer portal access
- Invoice tracking

## Prerequisites

1. **Stripe Account** - Create one at https://stripe.com
2. **API Keys** - Get your Secret Key from the Stripe dashboard
3. **Products & Prices** - Create products and prices in Stripe

## Step 1: Get Your Stripe Keys

1. Go to https://dashboard.stripe.com/apikeys
2. Copy your **Secret Key** (starts with `sk_`)
3. Keep this safe - it's sensitive!

## Step 2: Create Products and Prices in Stripe

You need to create 4 products in Stripe:

### Free Trial
- **Name:** Free Trial
- **Type:** Standard product
- **Prices:** 
  - Monthly: $0.00
  - Yearly: $0.00
- **Save the price IDs** (look like `price_xxx`)

### Standard Plan
- **Name:** Standard
- **Type:** Standard product
- **Prices:**
  - Monthly: $49.00 (USD)
  - Yearly: $490.00 (USD)
- **Save the price IDs**

### Growth Plan
- **Name:** Growth
- **Type:** Standard product
- **Prices:**
  - Monthly: $299.00 (USD)
  - Yearly: $2,990.00 (USD)
- **Save the price IDs**

### Enterprise Plan
- **Name:** Enterprise
- **Type:** Standard product
- **Prices:**
  - Monthly: Custom (contact sales)
  - Yearly: Custom (contact sales)
- **Save the price IDs**

## Step 3: Configure Supabase Environment Variables

Add your Stripe secret key to Supabase:

```bash
# Using Supabase CLI
supabase secrets set STRIPE_SECRET_KEY sk_test_... # or sk_live_...
```

Or via the Supabase Dashboard:
1. Go to Project Settings → Secrets
2. Add a new secret:
   - Name: `STRIPE_SECRET_KEY`
   - Value: Your secret key from Step 1

## Step 4: Update the Plans Table

In your database, update the plans table with your Stripe price IDs:

```sql
UPDATE plans 
SET 
  stripe_product_id = 'prod_xxx',
  stripe_price_id_monthly = 'price_xxx',
  stripe_price_id_yearly = 'price_xxx'
WHERE code = 'standard';

UPDATE plans 
SET 
  stripe_product_id = 'prod_xxx',
  stripe_price_id_monthly = 'price_xxx',
  stripe_price_id_yearly = 'price_xxx'
WHERE code = 'growth';

UPDATE plans 
SET 
  stripe_product_id = 'prod_xxx',
  stripe_price_id_monthly = 'price_xxx',
  stripe_price_id_yearly = 'price_xxx'
WHERE code = 'enterprise';
```

## Step 5: Configure Webhooks (For Production)

1. Go to https://dashboard.stripe.com/webhooks
2. Add endpoint:
   - URL: `https://your-domain.com/functions/v1/billing-webhook`
   - Events: `checkout.session.completed`, `customer.subscription.updated`
3. Copy the signing secret (starts with `whsec_`)
4. Add to Supabase secrets as `STRIPE_WEBHOOK_SECRET`

## Testing

### Test Mode
- Use Stripe test keys (starts with `pk_test_` or `sk_test_`)
- Use test credit cards: `4242 4242 4242 4242` (Visa)
- Expiry: Any future date
- CVC: Any 3 digits

### Production
- Switch to live keys (starts with `pk_live_` or `sk_live_`)
- Use real payment methods
- Customers will see real charges

## Troubleshooting

### "Missing STRIPE_SECRET_KEY" error
- Verify the secret is set in Supabase
- Make sure the exact name is `STRIPE_SECRET_KEY`
- Edge Functions redeploy after adding secrets

### "Plan not found" error
- Verify plans exist in the database with `is_active = true`
- Check that the requested plan code matches the database

### Payment checkout not starting
- Verify Stripe secret key is correct
- Check that price IDs are valid in Stripe
- Ensure customer has valid email

## Files Modified

- `/supabase/functions/billing-checkout/index.ts` - Handles checkout
- `/supabase/migrations/20260403_create_plans_table.sql` - Plans table schema
- `/frontend/src/pages/SettingsPage.tsx` - Billing UI

## API Endpoints

### Create Checkout Session
```
POST /functions/v1/billing-checkout
Headers: Authorization: Bearer <jwt>
Body: {
  "plan_code": "standard",
  "interval": "month"
}
```

### Create Portal Session
```
POST /functions/v1/billing-portal
Headers: Authorization: Bearer <jwt>
```

## Support

For Stripe-specific issues, see:
- Stripe Docs: https://stripe.com/docs
- Status: https://status.stripe.com
- Support: https://support.stripe.com
