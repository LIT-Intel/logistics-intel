# UPDATE – AUTH SUPABASE USER LIFECYCLE

## Branch

Working branch: `claude/activate-all-tabs-k3kVM`
Deleted: `claude/reset-supabase-auth-z2CDy` (user to delete remotely if present)
Deleted: `claude/install-superpowers-rFCMO` (user to delete remotely if present)

---

## Root Cause — Invite Redirect Loop

When an invited user registered and clicked their email confirmation link, they were
permanently bounced between `/signup` and `/accept-invite` because:

1. `registerWithEmailPassword` had no `emailRedirectTo` → Supabase sent a generic
   confirmation link pointing at `/` (or no callback).
2. `AcceptInvitePage` saw `!user` and immediately redirected to `/signup`.
3. `AuthCallback.tsx` always redirected to `/app/dashboard`, ignoring any `?next=` param.
4. **Result**: user confirmed email, was redirected to dashboard, invite was never accepted.

---

## Fixes Applied

### Auth client (`frontend/src/auth/supabaseAuthClient.ts`)
- `registerWithEmailPassword` now accepts optional `emailRedirectTo` param and returns the full
  `data` object (not just `data.user`) so callers can detect `data.session !== null`
  (email confirmation disabled → immediate session).
- `signInWithGoogle` / `signInWithMicrosoft` accept a `redirectPath` param for invite flows.

### Login page (`frontend/src/components/layout/ModernLoginPage.tsx`)
- Removed all Clerk imports.
- Reads `?token=`, `?email=`, `?next=` query params.
- After login, redirects to `/accept-invite?token=X&email=Y` when invite params present, else
  to `nextParam || /app/dashboard`.
- Already-authenticated users are redirected on mount.
- Logo: replaced Zap icon with `<img src="/logo_horizontal.png" />`.

### Signup page (`frontend/src/components/layout/ModernSignupPage.tsx`)
- Removed all Clerk imports and test markers.
- For invite flow: passes `emailRedirectTo = origin/auth/callback?next=/accept-invite?token=X`
  to `registerWithEmailPassword`.
- If returned `data.session` is non-null → immediate navigate to accept-invite URL.
- If `data.session === null` → shows "check your inbox" with confirmation pending state.
- Logo: replaced Zap icon with `<img src="/logo_horizontal.png" />`.

### AuthCallback (`frontend/src/pages/AuthCallback.tsx`)
- Reads `?next=` param from URL before redirecting.
- If `?code=` is present → calls `auth.auth.exchangeCodeForSession(window.location.href)`
  to handle PKCE email confirmation flow.
- After session confirmed → navigates to `next || /app/dashboard`.

### main.jsx (`frontend/src/main.jsx`)
- Removed `ClerkProvider` and all Clerk imports.
- Fixed `/` redirect: was going to `/search` (non-existent route); now goes to `/app/dashboard`.

### App.jsx (`frontend/src/App.jsx`)
- Removed dead `Signup` lazy import (old Clerk-era file).
- Added `RequireSuperAdmin` wrapper component: redirects non-superadmin users to `/app/dashboard`.
- Applied `RequireSuperAdmin` to `/app/admin`, `/app/admin/settings`, `/app/cms`, `/app/agent`.

---

## Database Migrations

### `20260410_001_fix_org_invites_schema.sql`
Adds missing columns to `org_invites` that the codebase and edge functions depend on:
- `token uuid NOT NULL DEFAULT gen_random_uuid()` — unique invite token
- `invited_by_user_id uuid REFERENCES auth.users(id)` — tracks who sent the invite
- `email_sent_at timestamptz` — tracks when email was sent
- Unique index on `token`
- Backfill of `invited_by_user_id` from legacy `invited_by` column
- RLS policy: authenticated user can read their own pending invite by email

### `20260410_002_platform_admins.sql`
Creates `platform_admins` table for superadmin status:
- `user_id uuid PK REFERENCES auth.users`
- `granted_by uuid`, `granted_at timestamptz`
- RLS: user can read only their own row
- Bootstrap: inserts `vraymond@sparkfusiondigital.com` on first run

### `20260410_003_auto_org_bootstrap.sql`
Trigger `on_new_user_org_bootstrap` on `auth.users` INSERT:
- Skips if user has a pending invite (invited users get org_members via AcceptInvitePage)
- Skips if user already has an org_members row
- Creates `organizations` + `org_members(role='owner')` + `subscriptions(plan_code='free_trial')`
- SECURITY DEFINER so it runs with elevated permissions

---

## AuthProvider (`frontend/src/auth/AuthProvider.jsx`)
- After auth state change, fetches `platform_admins` for `isSuperAdmin` flag.
- Fetches primary `org_members` row for `orgRole` and `orgId`.
- Exposes: `isSuperAdmin`, `orgRole`, `orgId`, `plan` in context.
- Legacy `role` (admin/user) preserved for backwards compatibility.

---

## AdminDashboard (`frontend/src/pages/AdminDashboard.jsx`)
Full replacement — superadmin only:
- Guard: non-superadmin users redirected to `/app/dashboard`
- **5 tabs:**
  - **Overview**: total users, orgs, active subscriptions, invite accept rate, plan breakdown chart, invite funnel
  - **Users**: paginated list with email, name, org, role, plan, joined date
  - **Organizations**: all orgs with plan, status, member count, plan override dropdown
  - **Memberships**: select org → see members, change role, remove member (owners protected)
  - **Billing**: plan override per org; manual changes take effect immediately

---

## Admin API Edge Function (`supabase/functions/admin-api/index.ts`)
New Deno edge function. Validates caller is in `platform_admins` before any data access.
Uses service-role key for platform-wide queries.

Actions: `get_kpis`, `get_users`, `get_orgs`, `get_org_members`,
`update_org_plan`, `update_member_role`, `remove_member`

---

## Sidebar (`frontend/src/layout/lit/AppSidebar.jsx`)
- Admin section (Admin Dashboard, CMS, Debug Agent) only rendered when `isSuperAdmin = true`
- Campaigns and RFP Studio show a lock icon and redirect to `/app/billing` when plan < `pro`

---

## AcceptInvitePage (`frontend/src/pages/AcceptInvitePage.tsx`)
- Before redirecting to signup, checks for active Supabase session. If session exists but user
  context hasn't populated yet (timing), retries up to 10× with 300ms delays.
- After successful invite acceptance, upserts a `profiles` row for the user (no-op if present).

---

## How Superadmin Is Determined

1. A row exists in `platform_admins` with `user_id = auth.uid()`.
2. `AuthProvider` fetches this on every auth state change.
3. `isSuperAdmin` is exposed in React context via `useAuth()`.
4. `RequireSuperAdmin` wrapper in `App.jsx` blocks non-superadmins from admin routes.
5. `AppSidebar.jsx` hides Admin section from non-superadmins.

To grant superadmin: `INSERT INTO platform_admins(user_id) VALUES ('<uuid>');`

---

## Tables Controlling Roles / Plans

| What | Table | Column |
|------|-------|--------|
| Org-level role | `org_members` | `role` (owner/admin/member/viewer) |
| Platform superadmin | `platform_admins` | `user_id` |
| Subscription plan | `subscriptions` | `plan_code` |
| Org plan label | `subscriptions` | `plan_code` (join via `org_id`) |

---

## Known Issues / Future Work

- `admin-api` `get_users` calls `auth.admin.getUserById` per user in a loop — acceptable for
  low volume but should be batched or replaced with a DB view for scale.
- `subscriptions` join in `fetchPrimaryOrgMembership` uses nested select that may need a
  separate query if Supabase join syntax differs in your schema.
- `?growth` plan alias: sidebar uses `planAtLeast` with `growth` at index 3; if your DB uses
  `pro` and not `growth`, adjust the `PLAN_ORDER` array in `AppSidebar.jsx`.
