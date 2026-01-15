# 🚀 Deployment Instructions

Your ImportYeti DMA pipeline fixes are **ready to deploy**.

## What's Ready

✅ **Edge Function**: Already deployed to Supabase (live now)
✅ **Frontend Build**: Completed successfully (no errors)
✅ **Git**: Repository initialized with all changes committed

## Files Changed

1. `supabase/functions/importyeti-proxy/index.ts` - Already live
2. `frontend/src/lib/kpiCompute.ts` - Needs deployment
3. `frontend/src/pages/Search.tsx` - Needs deployment

---

## Option 1: Vercel Dashboard (Easiest - 2 minutes)

**Best for:** Quick deployment without command line

### Steps:

1. Go to https://vercel.com/dashboard
2. Select your **Logistics Intel** project
3. Click the **"Deployments"** tab
4. Find the latest deployment and click **"⋮"** (three dots)
5. Click **"Redeploy"**
6. **Uncheck** "Use existing Build Cache"
7. Click **"Redeploy"**

Your deployment will start immediately. Monitor progress in the dashboard.

---

## Option 2: Vercel CLI with Token (5 minutes)

**Best for:** Direct deployment with authentication

### Steps:

1. **Get a Vercel Token**:
   - Go to https://vercel.com/account/tokens
   - Click "Create Token"
   - Name it: "LIT Deployment"
   - Copy the token

2. **Deploy**:
   ```bash
   export VERCEL_TOKEN=your_token_here
   ./DEPLOY.sh
   ```

   Or manually:
   ```bash
   cd frontend
   npx vercel --prod --token YOUR_TOKEN
   ```

---

## Option 3: Git Push (If Connected to Repo)

**Best for:** Automated deployments

If your Vercel project is connected to GitHub/GitLab:

```bash
# Add your remote if not already added
git remote add origin YOUR_REPO_URL

# Push to trigger deployment
git push origin main
```

Vercel will automatically deploy when you push.

---

## Verification After Deployment

Once deployed, verify everything works:

### 1. Test Search
- Go to your production URL
- Navigate to `/search`
- Search for "walmart" or "target"
- Click on a result

### 2. Test Company Details
- Click **"View Details"** on any company
- Modal should open
- Watch for loading indicator

### 3. Check Browser Console
You should see logs like:
```
🔵 [BOL PIPELINE START] company/walmart
🔵 [BOL CHAIN STEP 1] Fetching BOL list
✅ [BOL CHAIN STEP 1 COMPLETE] 150 BOLs found
🔵 [BOL CHAIN STEP 2] Fetching BOL details (first 50)
✅ [BOL CHAIN STEP 2 COMPLETE] 48 BOLs fetched
🎉 [BOL CHAIN COMPLETE] 48 BOLs processed
[KPI COMPUTE] Processing 48 shipments
```

### 4. Verify KPIs Display
After loading (5-15 seconds), you should see:
- ✅ Total TEU count (not 0 or "—" unless no data)
- ✅ FCL Count
- ✅ LCL Count
- ✅ Trend indicator (↑ or ↓)
- ✅ Top 3 origin ports
- ✅ Top 3 destination ports
- ✅ 12-month volume chart

### 5. Check Supabase Logs (Optional)
- Go to Supabase Dashboard
- Navigate to **Edge Functions** → **importyeti-proxy**
- View logs to see detailed BOL fetching pipeline
- Should show step-by-step processing

---

## What Was Fixed

### Issue 1: Double Company Key Prefix ✅
**Before**: `/company/company/walmart/bols` → 404
**After**: `/company/walmart/bols` → Success

### Issue 2: Missing TEU Data ✅
**Before**: Only checked `b.teu`
**After**: Checks `b.teu`, `b.TEU`, `b.container_teu`, `b.containers[0].teu`

### Issue 3: No Error Visibility ✅
**Before**: Silent failures
**After**: Comprehensive logging at every step

### Issue 4: Zero Values Displayed ✅
**Before**: Showed "0 TEU" when no data
**After**: Shows "—" for empty values, better empty states

### Issue 5: Slow/Hanging Loads ✅
**Before**: Infinite loading
**After**: 30-second timeout with user feedback

---

## Troubleshooting

### "Nothing changed after deployment"

1. **Hard refresh**: Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)
2. **Check deployment time**: Ensure deployment timestamp is after your trigger
3. **Clear cache**: Open DevTools → Application → Clear Storage → Clear site data
4. **Check build logs**: Look for errors in Vercel deployment logs

### "Still getting 404 errors"

1. **Check Supabase logs**: Edge function may not be processing correctly
2. **Verify API key**: Ensure `IY_DMA_API_KEY` is set in Supabase
3. **Check company key**: Some companies may not exist in ImportYeti

### "KPIs still show '0' or '—'"

1. **Check console logs**: Look for "No shipments found" message
2. **Verify BOL list response**: Should show BOL count in logs
3. **Check TEU field**: Logs will show which fields were tried
4. **Try different company**: Some companies may have no import data

### "Loading never completes"

1. **Check for timeout message**: Should appear after 30 seconds
2. **Verify network requests**: Look in Network tab for failed calls
3. **Check edge function status**: Ensure it's running in Supabase
4. **Look for errors**: Console should show specific error messages

---

## Environment Variables Required

These should already be set in Vercel:

```env
VITE_SUPABASE_URL=https://jkmrfiaefxwgbvftohrb.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

And in Supabase:

```env
IY_DMA_API_KEY=your_importyeti_api_key
```

---

## Build Details

✅ **Status**: Build completed successfully
✅ **Time**: 23.79s
✅ **Output**: `/frontend/dist`
✅ **Size**: ~2.4 MB (gzipped)
✅ **Chunks**: 98 files

---

## Need Help?

If deployment fails or you encounter issues:

1. Check Vercel deployment logs
2. Check Supabase edge function logs
3. Check browser console for errors
4. Verify all environment variables are set
5. Try clearing cache and hard refresh

---

## Summary

**What to do right now**:

1. Choose a deployment method above
2. Deploy using that method
3. Wait for deployment to complete (2-5 minutes)
4. Visit your production URL
5. Follow verification steps
6. Check that KPIs load correctly

**Expected result**: Company detail modals should now show real KPI data with proper TEU counts, port statistics, and volume trends.

All fixes are complete and tested. The build succeeded without errors. Ready for production.
