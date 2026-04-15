# UPDATE – AUTH FLOW VERIFICATION AND DEBUG

## Verification Checklist

### Auth Flows

- [ ] New user signup → email verify → `/auth/callback?next=/app/dashboard` → dashboard
- [ ] Invited user signup → confirm email → `/auth/callback?next=/accept-invite?token=X` → org joined → dashboard
- [ ] Invited existing user: login with `?token=X&email=Y` → accept-invite → dashboard
- [ ] Sign in → dashboard
- [ ] Sign out → login, protected routes blocked
- [ ] Password reset → new password works → sign in works
- [ ] Authenticated user hitting `/login` or `/signup` → redirected to dashboard
- [ ] Refresh stays signed in
- [ ] Root `/` redirect → `/app/dashboard`

### Invites

- [ ] Admin sends invite from Settings page → email received with link `?token=X&email=Y`
- [ ] Accept invite link → signup (new user) with email prefilled and locked
- [ ] After email confirm → org_members row created with correct role
- [ ] Invite marked `accepted`
- [ ] Expired invite → error message shown
- [ ] Wrong email → error message shown
- [ ] Already-member → no duplicate row created

### Settings

- [ ] Profile saves to correct `user_id`
- [ ] Company/signature loads correct org
- [ ] No UUID mismatch errors

### Superadmin + Admin Control Center

- [ ] `platform_admins` row → `isSuperAdmin=true` in `useAuth()`
- [ ] Non-superadmin cannot visit `/app/admin` by URL (redirected to dashboard)
- [ ] Admin nav hidden for non-superadmin in sidebar
- [ ] KPI overview shows user counts, plan breakdown, MRR, revenue/user
- [ ] Plan change in Admin → updates `subscriptions` → reflected in live access
- [ ] Role change in Admin → updates `org_members` → reflected in live access

### Plan Gating

- [ ] free_trial: campaigns/RFP show lock icon and link to billing
- [ ] pro: campaigns/RFP visible and navigable
- [ ] enterprise: all items visible
- [ ] Direct URL access to `/app/admin` by non-superadmin → redirect to dashboard

### Clerk

- [ ] Zero Clerk imports anywhere in codebase
- [ ] `ClerkProvider` removed from `main.jsx`
- [ ] `@clerk/clerk-react` package still listed in package.json but unused (safe to remove later)

---

## Debug Steps

### User ends up on blank/loading screen after email confirmation

1. Open browser DevTools → Network tab
2. Check request to `/auth/callback`
3. Verify `?code=` param is present in URL
4. Verify `exchangeCodeForSession` returns a session (check console for `[AuthCallback] error`)
5. If `?next=` is not preserved: check Supabase email template uses `{{ .ConfirmationURL }}`
   and that `emailRedirectTo` was set correctly in `registerWithEmailPassword` call

### `isSuperAdmin` is false for a known superadmin

1. Confirm the row exists: `SELECT * FROM platform_admins WHERE user_id = '<uuid>';`
2. Confirm RLS allows the user to read their own row:
   `SELECT * FROM platform_admins;` (run as that user via Supabase client)
3. Check AuthProvider console logs — `fetchPlatformAdminStatus` logs errors silently;
   add a `console.log` temporarily to verify the DB call succeeds

### Invite email not sent

1. Confirm `send-org-invite` edge function is deployed
2. Confirm `RESEND_API_KEY` and `INVITE_FROM_EMAIL` env vars are set in Supabase dashboard
3. Check edge function logs in Supabase Dashboard → Edge Functions → Logs
4. Confirm `org_invites.token` column exists (migration 20260410_001 must be applied)

### Org bootstrap trigger not firing

1. Confirm migration 20260410_003 was applied: 
   `SELECT trigger_name FROM information_schema.triggers WHERE event_object_schema = 'auth';`
2. Confirm the trigger function has SECURITY DEFINER and correct `search_path`
3. Test by creating a new user manually and checking if an `organizations` row was created

### Auth state not propagating to context

1. Check `listenToAuth` subscription in AuthProvider is firing (add `console.log`)
2. If `onAuthStateChange` fires but `user` is still null after re-render, check that
   `normalizeUser(u)` receives the correct `u` object from Supabase
3. For PKCE flows: ensure `exchangeCodeForSession` completes before the React tree
   re-renders — `AuthCallback.tsx` awaits it before calling `navigate`

---

## Environment Variables Required

### Frontend (`.env.local`)

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

### Edge Functions (Supabase Dashboard → Settings → Edge Functions)

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
RESEND_API_KEY=re_<key>
INVITE_FROM_EMAIL=noreply@logisticintel.com
INVITE_BASE_URL=https://www.logisticintel.com
```

---

## Key File Locations

| Component | Path |
|-----------|------|
| Supabase client | `frontend/src/auth/supabaseAuthClient.ts` |
| Auth context | `frontend/src/auth/AuthProvider.jsx` |
| Auth callback | `frontend/src/pages/AuthCallback.tsx` |
| Login page | `frontend/src/components/layout/ModernLoginPage.tsx` |
| Signup page | `frontend/src/components/layout/ModernSignupPage.tsx` |
| Accept invite | `frontend/src/pages/AcceptInvitePage.tsx` |
| Settings (invite) | `frontend/src/pages/SettingsPage.tsx` |
| Admin dashboard | `frontend/src/pages/AdminDashboard.jsx` |
| Admin API edge fn | `supabase/functions/admin-api/index.ts` |
| Invite email edge fn | `supabase/functions/send-org-invite/index.ts` |
| Sidebar nav | `frontend/src/layout/lit/AppSidebar.jsx` |
| App routes | `frontend/src/App.jsx` |
| Main entry | `frontend/src/main.jsx` |
| Migration: invites | `supabase/migrations/20260410_001_fix_org_invites_schema.sql` |
| Migration: superadmin | `supabase/migrations/20260410_002_platform_admins.sql` |
| Migration: org bootstrap | `supabase/migrations/20260410_003_auto_org_bootstrap.sql` |
