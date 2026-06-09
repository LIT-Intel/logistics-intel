# Campaign Org-Scoping + Platform-Admin Toggle — Design Spec

**Date:** 2026-06-05
**Sub-project:** A (of A/B/C decomposition)
**Status:** Approved architecture, pending implementation plan
**Lands first because:** Foundation for B (tracking pipeline must respect org boundaries) and fixes a customer-trust gap (`lit_campaigns` currently has no `org_id` column at all — enterprise teammates can't see each other's campaigns; platform admins see every org's campaigns with no way to scope back).

---

## Problem

Three concrete gaps discovered via investigation (agent `ace1e96dc8d92201e`):

1. **No `org_id` on `lit_campaigns`.** Every campaign is owned by a single `user_id`. There is no team/workspace scoping. An enterprise customer's teammates cannot see the customer's campaigns even after being added to `org_members`.
2. **Platform-admin sees all by design.** RLS policy `lit_campaigns_select_owner_or_admin` fuses admin-bypass into the row policy with no opt-in. Per CLAUDE.md: "Admin bypass is server-side only. Frontend gating is UX hint." That rule is violated — superadmins have no way to scope back to their own org.
3. **Frontend has no defense-in-depth.** `getCampaignsFromSupabase` does `from('lit_campaigns').select('*')` with zero filter, so the moment the policy widens (as it does for platform admins), the dashboard widens with it.

User-reported symptom: Valesco (super-admin) sees "Boss Man" campaign created by `ematt@mattinglyind.com` in a different org. That's working as designed but the design is wrong.

---

## Architecture

### Data model

Add to `lit_campaigns`:
```sql
ALTER TABLE lit_campaigns ADD COLUMN org_id uuid REFERENCES organizations(id);
```

**Backfill** (each existing campaign's `user_id` → that user's primary org):
```sql
UPDATE lit_campaigns lc
   SET org_id = (
     SELECT om.org_id FROM org_members om
      WHERE om.user_id = lc.user_id
        AND om.status = 'active'
      ORDER BY (om.role = 'owner') DESC, om.joined_at ASC
      LIMIT 1
   );
```

Hard-fail on any remaining NULL org_id rows — surface for manual reassignment rather than auto-bucket into a synthetic org.

```sql
-- Only after zero NULLs verified
ALTER TABLE lit_campaigns ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX lit_campaigns_org_id_idx ON lit_campaigns(org_id);
```

### RLS rewrite

Drop the old policy and create three new ones (SELECT, INSERT, UPDATE/DELETE):

```sql
DROP POLICY IF EXISTS lit_campaigns_select_owner_or_admin ON lit_campaigns;

CREATE POLICY lit_campaigns_select ON lit_campaigns FOR SELECT USING (
  org_id IN (
    SELECT om.org_id FROM org_members om
     WHERE om.user_id = auth.uid() AND om.status = 'active'
  )
  OR EXISTS (
    SELECT 1 FROM platform_admins pa WHERE pa.user_id = auth.uid()
  )
);

CREATE POLICY lit_campaigns_insert ON lit_campaigns FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND org_id IN (
    SELECT om.org_id FROM org_members om
     WHERE om.user_id = auth.uid() AND om.status = 'active'
  )
);

CREATE POLICY lit_campaigns_update ON lit_campaigns FOR UPDATE USING (
  auth.uid() = user_id  -- creator can always edit
  OR EXISTS (           -- OR org owner/admin can edit teammate's campaigns
    SELECT 1 FROM org_members om
     WHERE om.org_id = lit_campaigns.org_id
       AND om.user_id = auth.uid()
       AND om.role IN ('owner', 'admin')
       AND om.status = 'active'
  )
);

-- DELETE: same logic as UPDATE
```

### Admin scope = frontend UX choice (not RLS)

Per CLAUDE.md: server-side bypass stays permissive for `platform_admins`. The default-to-your-org behavior lives in the frontend.

- `useEntitlements()` exposes `isPlatformAdmin: boolean` (read from server-snapshot, not client state)
- `useAdminScope()` reads `localStorage.lit.adminScope` (default `'org'`); validates against `isPlatformAdmin` on every read and resets to `'org'` if mismatch
- `getCampaignsFromSupabase()` reads `adminScope` + `currentOrgId`:
  - `adminScope === 'org'` → adds `.eq('org_id', currentOrgId)`
  - `adminScope === 'all'` AND `isPlatformAdmin === true` → drops the filter
  - `adminScope === 'all'` AND `isPlatformAdmin === false` → drops the setting, scopes to org (defensive)

### Admin toggle UI

Header dropdown shown ONLY when `isPlatformAdmin === true`:

```
[ Logistic Intel ▼ ]   ← chip in top header, between search and notifications
  ├─ Logistic Intel (my org)
  └─ All Orgs (Platform Admin)
```

When "All Orgs" is selected: chip changes to amber background `bg-amber-50 text-amber-700` with text "All Orgs (Admin)" to make scope-state unmistakable in screenshots/demos.

### Audit trail

Display attribution on every campaign card: "Created by Emily M. · 2h ago".
- Backed by existing `user_id` column joined to `auth.users.email` (or `profiles.full_name` if available)
- No new column needed

---

## Components (files to touch)

| File | Change |
|---|---|
| `supabase/migrations/20260605_lit_campaigns_org_scoping.sql` | NEW — column, backfill, NOT NULL, drop old policy, create 3 new policies, index |
| `supabase/functions/get-entitlements/index.ts` | Add `is_platform_admin` boolean to response |
| `frontend/src/hooks/useEntitlements.ts` | Surface `isPlatformAdmin` |
| `frontend/src/hooks/useAdminScope.ts` | NEW — reads `localStorage.lit.adminScope`, validates against `isPlatformAdmin` |
| `frontend/src/components/layout/AdminScopeToggle.tsx` | NEW — header dropdown chip, rendered conditionally |
| `frontend/src/layout/lit/AppHeader.tsx` | Mount `<AdminScopeToggle />` between search bar and notifications |
| `frontend/src/lib/supabase.ts:314-335` | Update `getCampaignsFromSupabase` to apply org filter conditionally |
| `frontend/src/lib/api.ts` (campaign create paths — locate via grep `from\("lit_campaigns"\).insert`) | Set `org_id` on insert from current user's primary org |
| `frontend/src/features/outbound/components/CampaignRow.tsx` | Add "Created by X · Yh ago" attribution line |

---

## Data flow

1. User opens `/app/campaigns`
2. `useEntitlements()` returns `{ currentOrgId, isPlatformAdmin }`
3. `useAdminScope()` returns `'org'` by default; `'all'` only if user explicitly toggled AND `isPlatformAdmin === true`
4. `useCampaigns()` calls `getCampaignsFromSupabase({ orgId, adminScope })`
5. Query: `from('lit_campaigns').select('*, created_by:auth.users!user_id(email)').order(...)`. Adds `.eq('org_id', orgId)` unless `adminScope === 'all'`
6. RLS server-side enforces the union: `org_member OR platform_admin`
7. Render: each row shows campaign + "Created by X" attribution

---

## Error handling + edge cases

| Case | Behavior |
|---|---|
| Backfill finds user with zero `org_members` | Hard-fail migration; surface the user_ids for manual reassignment. Reasoning: silent assignment to a synthetic org corrupts the audit trail and confuses customer support |
| User belongs to multiple orgs | Backfill picks owner-role first, earliest `joined_at` second. If still ambiguous (multiple owner roles, same join date), fail and surface |
| Campaign creator loses org membership after creation | RLS just stops returning the row; campaign still exists for audit. Org owner can reassign via a future "transfer ownership" admin action (out of scope here) |
| Platform admin in `adminScope='all'` then loses admin role | `useAdminScope()` validates against `isPlatformAdmin` on every read, resets to `'org'` automatically |
| User in `adminScope='all'` who never was a platform admin | Defensive guard in `useAdminScope()` ignores the localStorage value |
| Race: `useEntitlements()` returns stale `isPlatformAdmin` for a user just demoted | Worst case: one cached query returns all-orgs. RLS still permits (they're still admin in the snapshot). Acceptable for 60-second TanStack cache TTL |

---

## Testing

| Test | Scope |
|---|---|
| Migration backfill correctness | All existing campaigns get a non-null `org_id` matching their owner's primary org |
| RLS — non-admin org member sees only own org's campaigns | Integration test against staging |
| RLS — platform admin sees all when query unfiltered | Integration test |
| Frontend — `adminScope='org'` adds `.eq('org_id', ...)` | Unit test on `getCampaignsFromSupabase` |
| Frontend — `adminScope='all'` for non-admin is ignored | Unit test on `useAdminScope` |
| Frontend — `AdminScopeToggle` only renders when `isPlatformAdmin === true` | Component test |
| E2E — log in as Valesco, default view = Logistic Intel only, toggle shows Boss Man | Cypress / Playwright |
| E2E — log in as ematt, see only Mattingly Industries campaigns | Cypress / Playwright |

---

## Out of scope

- "Transfer campaign ownership" admin action (separate workstream)
- Org switching for users in multiple orgs (separate workstream)
- Audit log of who saw what (separate workstream)
- Schema cleanup of unused `public.campaigns` table (separate cleanup)
