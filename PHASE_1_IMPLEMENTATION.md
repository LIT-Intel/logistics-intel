# Phase 1 Implementation Guide

## Overview
Phase 1 consolidates the subscription and entitlement system to have a single source of truth in the database, moving away from frontend-only validation.

## What's Implemented

### 1. Database Migrations ✅

#### Migration: `20260421_001_consolidate_plans.sql`
- Adds `features`, `usage_limits`, `seat_rules` columns to `plans` table
- Updates all 4 plan definitions with complete configuration
- Features: 11-feature matrix (dashboard, search, command_center, company_page, campaign_builder, pulse, enrichment, billing_admin, seat_management, credit_rating_ready, contact_intel_ready)
- Usage Limits: 5-limit tracking (searches_per_month, company_views_per_month, command_center_saves_per_month, enrichment_credits_per_month, pulse_runs_per_month)
- Seat Rules: min, max, default seats per plan
- Pricing: per_seat_pricing flag

#### Migration: `20260421_002_fix_subscription_sync.sql`
- Adds `seats`, `user_plan_override`, `stripe_price_id_*`, `billing_interval` to `subscriptions` table
- Adds `current_seats`, `max_seats` to `org_billing` table
- Creates `subscription_detail` view for unified user + org subscription data
- Adds trigger `sync_subscription_to_org_billing()` to keep org_billing in sync
- Enhanced RLS policies for org admin access

#### Migration: `20260421_003_add_plan_rls.sql`
- RLS policies for plans table (public read for active plans)
- Creates `plan_audit_log` table for immutable change tracking
- Trigger `log_plan_changes()` logs all plan modifications
- Constraints to ensure consistent plan codes

### 2. Server-Side Validation ✅

#### New File: `frontend/src/lib/serverEntitlements.ts`
Provides database-backed entitlement checking:

```typescript
// Get plan definition from database
const plan = await getPlanDefinition('growth');

// Check feature access
const check = await canAccessFeature('growth', 'enrichment', isAdmin);
// Result: { allowed: true, feature_available: true }

// Check usage limits
const usage = await checkUsageLimit('growth', 'searches_per_month', 45, isAdmin);
// Result: { allowed: true, usage_remaining: 455, usage_limit: 500 }

// Get complete entitlements
const entitlements = await getUserEntitlements('growth', currentUsage, isAdmin);
// Result: { plan, features: {...}, usage: {...}, can_upgrade: true }

// Invalidate cache after plan updates
invalidatePlanCache();
```

#### New Edge Function: `supabase/functions/check-entitlements/index.ts`
Server-side entitlement validation endpoint:

```bash
POST /functions/v1/check-entitlements
Content-Type: application/json

{
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "org_id": "550e8400-e29b-41d4-a716-446655440001",
  "feature": "enrichment",
  "limit_key": "searches_per_month",
  "current_usage": 45
}

# Response:
{
  "allowed": true,
  "plan": "growth",
  "feature_available": true,
  "usage_remaining": 455,
  "usage_limit": 500,
  "is_admin": false,
  "org_role": "member"
}
```

### 3. React Hook for Entitlements ✅

#### New File: `frontend/src/hooks/useEntitlements.ts`

```typescript
function MyComponent() {
  const { canAccessFeature, checkUsageLimit, invalidateCache, plan, isAdmin } = useEntitlements();

  async function handleSearch() {
    // Check feature availability
    const featureCheck = await canAccessFeature('search');
    if (!featureCheck.allowed) {
      showError(featureCheck.reason);
      return;
    }

    // Check usage limits
    const usageCheck = await checkUsageLimit('searches_per_month', currentUsage);
    if (!usageCheck.allowed) {
      showWarning(`${usageCheck.usage_remaining} searches remaining`);
      return;
    }

    // Perform the action
    await performSearch();

    // Invalidate cache if user limits changed
    invalidateCache();
  }

  return <button onClick={handleSearch}>Search</button>;
}
```

### 4. API Integration ✅

Updated `frontend/src/api/functions.js`:
- Added `checkEntitlements` function that calls the new edge function

### 5. RLS & Security ✅

- Plans table: Public read for authenticated users, admin-only write
- Subscriptions: User can view own, org admins can view org's
- org_billing: Org admins only
- plan_audit_log: Immutable append-only, admin read-only

## Plan Configuration

All plans now fully defined in database:

### Free Trial
- Features: dashboard, search, command_center (limited)
- Limits: 10 searches/mo, 10 saved companies/mo
- Seats: 1 (fixed)
- Price: $0

### Standard/Starter
- Features: + company_page, billing_admin
- Limits: 100 searches/mo, 50 company views/mo
- Seats: 1 (fixed)
- Price: $49/mo or $490/yr

### Growth
- Features: + campaigns, pulse, enrichment, seat_management, contact_intel
- Limits: 500 searches/mo, 200 company views/mo, 100 enrichment credits/mo
- Seats: 3-7 per seat at $129/mo
- Price: $129/seat/mo or $1290/seat/yr

### Enterprise
- Features: All features enabled, credit_rating access
- Limits: Unlimited everything
- Seats: 6+ per seat
- Price: Custom (null in database)

## How to Use

### 1. Check Entitlements in React Components

```typescript
import { useEntitlements } from '@/hooks/useEntitlements';

export function SearchComponent() {
  const { canAccessFeature, checkUsageLimit } = useEntitlements();
  const [isLoading, setIsLoading] = useState(false);

  async function performSearch() {
    // Validate feature access
    const featureOk = await canAccessFeature('search');
    if (!featureOk.allowed) {
      return toast.error(featureOk.reason);
    }

    // Validate usage limits
    const usageOk = await checkUsageLimit('searches_per_month', userSearchCount);
    if (!usageOk.allowed) {
      return toast.error(usageOk.reason);
    }

    // Proceed with search
    await search();
  }
}
```

### 2. Direct API Calls

```typescript
import { checkEntitlements } from '@/api/functions';

const result = await checkEntitlements({
  user_id: currentUser.id,
  org_id: currentOrg.id,
  feature: 'enrichment',
  limit_key: 'enrichment_credits_per_month',
  current_usage: 85,
});

if (!result.allowed) {
  showUpgradeModal(result.reason);
}
```

### 3. Accessing Plan Data Directly

```typescript
import { getPlanDefinition } from '@/lib/serverEntitlements';

const plan = await getPlanDefinition('growth');
console.log(plan.features);      // { search: true, enrichment: true, ... }
console.log(plan.usage_limits);  // { searches_per_month: 500, ... }
console.log(plan.seat_rules);    // { min: 3, max: 7, default: 3 }
```

## Migration Path

### For existing frontend code using `planLimits.ts`:

OLD:
```typescript
import { getPlanConfig } from '@/lib/planLimits';
const config = getPlanConfig('growth');
```

NEW (with backward compatibility):
```typescript
import { getPlanDefinition } from '@/lib/serverEntitlements';
const plan = await getPlanDefinition('growth');
// Same structure, but fetched from database
```

### For existing access control using `accessControl.ts`:

OLD:
```typescript
import { canAccessFeature } from '@/lib/accessControl';
const allowed = canAccessFeature('growth', 'enrichment');
```

NEW:
```typescript
import { canAccessFeature } from '@/lib/serverEntitlements';
const check = await canAccessFeature('growth', 'enrichment');
// Now server-side validated
```

## Next Steps (Phase 2)

After Phase 1 is complete:
1. Deprecate frontend-only validation in `planLimits.ts` and `accessControl.ts`
2. Update all feature gates to use `useEntitlements` hook
3. Add usage tracking calls to usage-limited features
4. Build onboarding flow with plan selection

## Testing Checklist

- [ ] Verify all 4 plans load correctly from database
- [ ] Test feature access checks for each plan
- [ ] Test usage limit calculations
- [ ] Verify admin bypass works (isAdmin=true allows overrides)
- [ ] Test org_billing sync trigger
- [ ] Verify RLS policies work (users can only see own data)
- [ ] Check plan audit logging
- [ ] Test cache invalidation
- [ ] Verify Stripe webhook still updates subscriptions

## Troubleshooting

### Plans not loading
```sql
SELECT code, name, is_active, features, usage_limits FROM plans;
```

### Subscription sync issues
```sql
SELECT user_id, plan_code, seats FROM subscriptions;
SELECT org_id, plan, current_seats FROM org_billing;
SELECT * FROM subscription_detail;
```

### RLS blocking access
Check auth context:
```typescript
const { data: { user } } = await supabase.auth.getUser();
console.log(user.id); // Should match in RLS policies
```
