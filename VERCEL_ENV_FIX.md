# CRITICAL: Fix Vercel Environment Variables

## Problem

The white screen is caused by **incorrect Vercel environment variables** that are making the frontend call the API Gateway directly instead of using the `/api/lit` proxy. This triggers CORS blocks.

## Root Cause

In your Vercel environment variables, these are set to the **full gateway URL**:
- `NEXT_PUBLIC_API_BASE`
- `VITE_API_BASE`

When these are set to `https://logistics-intel-gateway-2e68g4k3.uc.gateway.dev`, the browser tries to call the gateway directly, which causes CORS errors because the gateway doesn't allow direct browser calls.

## Solution

You need to **DELETE or UPDATE** these environment variables in Vercel:

### Option 1: DELETE (Recommended)
Delete these variables from Vercel completely:
- ❌ Delete: `NEXT_PUBLIC_API_BASE`
- ❌ Delete: `VITE_API_BASE`

The code will automatically default to `/api/lit`, which will route through Vercel's proxy correctly.

### Option 2: UPDATE (Alternative)
Change the values to the relative path:
- ✅ Set `NEXT_PUBLIC_API_BASE` = `/api/lit`
- ✅ Set `VITE_API_BASE` = `/api/lit`

## Step-by-Step Instructions

1. Go to your Vercel project dashboard
2. Click **Settings** → **Environment Variables**
3. Find `NEXT_PUBLIC_API_BASE` and either:
   - Click the **...** menu → **Delete**, OR
   - Click **Edit** → Change value to `/api/lit`
4. Find `VITE_API_BASE` and do the same
5. **Redeploy** the project (or wait for automatic deploy)
6. Hard refresh your browser (Ctrl+Shift+R / Cmd+Shift+R)

## Keep These Variables

These are correct and should stay:
- ✅ `NEXT_PUBLIC_LIT_GATEWAY_KEY` (for authentication)
- ✅ `VITE_LIT_GATEWAY_KEY` (for authentication)
- ✅ `VITE_FIREBASE_*` (all Firebase config)
- ✅ All other API keys and secrets

## How the Routing Should Work

```
CORRECT FLOW (after fix):
Browser → /api/lit/crm/savedCompanies
  ↓ (Vercel proxy from vercel.json)
  → https://logistics-intel-gateway-2e68g4k3.uc.gateway.dev/crm/savedCompanies
  ✅ No CORS issues!

INCORRECT FLOW (current problem):
Browser → https://logistics-intel-gateway-2e68g4k3.uc.gateway.dev/crm/savedCompanies
  ❌ Direct call blocked by CORS!
```

## After Making Changes

1. Trigger a new Vercel deployment (it will happen automatically if you save env changes)
2. Wait for deployment to complete
3. Open your site in a **new incognito window** (to avoid cache)
4. Check browser console - you should see:
   - ✅ No "CORS policy" errors
   - ✅ Successful API calls to `/api/lit/*`
   - ✅ No "Package is not defined" errors

## Quick Verification

After redeploying, open browser DevTools → Network tab and look for API calls:
- ✅ **GOOD**: Requests to `/api/lit/crm/savedCompanies`
- ❌ **BAD**: Requests to `https://logistics-intel-gateway-2e68g4k3.uc.gateway.dev/...`

If you still see the gateway URL in requests, the environment variables haven't been deleted/updated correctly.

---

## Why This Happens

The code in `lib/env.ts` checks for environment variables in this order:
1. `VITE_API_BASE`
2. `NEXT_PUBLIC_API_BASE`
3. Falls back to `/api/lit`

When Vercel injects `NEXT_PUBLIC_API_BASE=https://...`, it takes precedence and breaks the proxy routing.

The `getGatewayBase()` function tries to detect this and return `/api/lit` for browser contexts, but the `resolveApiBase()` function in `lib/api.ts` picks up the env vars before that check can happen.

---

## Contact for Help

If issues persist after following these steps:
- Check browser console for specific error messages
- Verify Vercel deployment logs show the env changes were applied
- Test in incognito mode to rule out caching
- Contact: support@logisticintel.com
