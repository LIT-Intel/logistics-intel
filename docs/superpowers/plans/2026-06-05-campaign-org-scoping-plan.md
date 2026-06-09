# Campaign Org-Scoping + Platform-Admin Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `org_id` to `lit_campaigns`, rewrite RLS to enforce org boundaries with platform-admin bypass, and add a frontend `AdminScopeToggle` so platform admins default to their own org's view.

**Architecture:** Single migration adds `org_id` column + backfills from `org_members` + rewrites three RLS policies. Edge function `get-entitlements` adds `is_platform_admin` boolean. New `useAdminScope` hook reads localStorage state, defensively validates against `isPlatformAdmin`. `getCampaignsFromSupabase` adds `.eq('org_id', currentOrgId)` unless admin explicitly opts into all-orgs view. `AdminScopeToggle` renders only when `isPlatformAdmin === true`. Server-side RLS remains permissive for `platform_admins` per CLAUDE.md rule ("admin bypass is server-side only, frontend gating is UX hint").

**Tech Stack:** Postgres + Supabase RLS, Deno (edge function), React + TypeScript, TanStack Query, Vitest + React Testing Library, Tailwind, lucide-react.

**Branch:** `claude/review-dashboard-deploy-3AmMD` (active branch per CLAUDE.md branch lock — verified this workstream falls within it because it touches `get-entitlements` which is plan-limits adjacent).

**Spec:** [docs/superpowers/specs/2026-06-05-campaign-org-scoping-design.md](../specs/2026-06-05-campaign-org-scoping-design.md)

---

## File Structure

### Files to create

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260605120000_lit_campaigns_org_scoping.sql` | Add `org_id` column, backfill, NOT NULL constraint, index, rewrite RLS policies |
| `frontend/src/hooks/useAdminScope.ts` | Read/write `localStorage.lit.adminScope` with defensive validation against `isPlatformAdmin` |
| `frontend/src/hooks/__tests__/useAdminScope.test.ts` | Unit tests for the hook |
| `frontend/src/components/layout/AdminScopeToggle.tsx` | Header dropdown chip, conditional render |
| `frontend/src/components/layout/__tests__/AdminScopeToggle.test.tsx` | Component tests |

### Files to modify

| Path | Change |
|---|---|
| `supabase/functions/get-entitlements/index.ts` | Add `is_platform_admin` to response |
| `frontend/src/api/entitlements.ts` | Extend `EntitlementsSnapshot` + `GetEntitlementsResponse` types |
| `frontend/src/hooks/useEntitlements.ts` | Surface `isPlatformAdmin` from snapshot |
| `frontend/src/lib/supabase.ts` (lines 314-335) | `getCampaignsFromSupabase` accepts `{ orgId, adminScope }` params |
| `frontend/src/components/dashboard/LITDashboard.jsx` (line 67) | Pass org filter args to `getCampaignsFromSupabase` |
| `frontend/src/lib/apiDev.ts` (line 199) | Same — pass org filter args |
| `frontend/src/features/outbound/hooks/useCampaigns.ts` | If it calls `getCampaignsFromSupabase` directly, propagate args |
| `frontend/src/lib/api.ts` (campaign INSERT paths) | Set `org_id` from current user's primary org on every campaign insert |
| `frontend/src/layout/lit/AppHeader.jsx` (line ~229, before `<NotificationBell />`) | Mount `<AdminScopeToggle />` |
| `frontend/src/features/outbound/components/CampaignRow.tsx` | Add "Created by X · Yh ago" attribution line |

---

## Task 1: Add `org_id` column to `lit_campaigns` and backfill

**Files:**
- Create: `supabase/migrations/20260605120000_lit_campaigns_org_scoping.sql`

This migration is split into phases. Phase 1 (this task) adds the column nullable and backfills. NOT NULL is a separate task because if backfill leaves nulls, we want to fix them manually before constraining.

- [ ] **Step 1: Write the audit query to confirm starting state**

Run via Supabase MCP `execute_sql`:

```sql
SELECT
  count(*) AS total_campaigns,
  count(*) FILTER (WHERE user_id IS NULL) AS null_user_id,
  count(DISTINCT user_id) AS distinct_owners
  FROM public.lit_campaigns;
```

Expected: total ≥ 6, null_user_id = 0, distinct_owners ≥ 2. Record the baseline number so you can verify it doesn't change.

- [ ] **Step 2: Verify every campaign owner has an `org_members` row**

```sql
SELECT lc.user_id, count(*) AS campaigns_owned,
       (SELECT count(*) FROM public.org_members om
         WHERE om.user_id = lc.user_id AND om.status = 'active') AS active_org_memberships
  FROM public.lit_campaigns lc
 GROUP BY lc.user_id
 HAVING (SELECT count(*) FROM public.org_members om
          WHERE om.user_id = lc.user_id AND om.status = 'active') = 0;
```

Expected: zero rows. If any rows return, list them — those users own campaigns but aren't in any active org. Reassign or activate their membership in `org_members` before proceeding. Do NOT continue to step 3 with orphan owners.

- [ ] **Step 3: Write the migration file**

Create `supabase/migrations/20260605120000_lit_campaigns_org_scoping.sql`:

```sql
-- 20260605120000_lit_campaigns_org_scoping.sql
-- Phase 1: Add org_id column + backfill from owner's primary org.
-- Phase 2 (NOT NULL + index + RLS rewrite) is in a separate task,
-- gated on a zero-null audit so orphaned owners surface explicitly.

BEGIN;

ALTER TABLE public.lit_campaigns
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);

-- Backfill: each campaign's user_id → that user's primary org. Owner-role
-- first, earliest join second so an enterprise customer's first-created
-- workspace wins over later memberships.
UPDATE public.lit_campaigns lc
   SET org_id = (
     SELECT om.org_id
       FROM public.org_members om
      WHERE om.user_id = lc.user_id
        AND om.status = 'active'
      ORDER BY (om.role = 'owner') DESC, om.joined_at ASC
      LIMIT 1
   )
 WHERE org_id IS NULL;

COMMIT;
```

- [ ] **Step 4: Apply the migration via Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration` with `project_id: jkmrfiaefxwgbvftohrb`, `name: 20260605120000_lit_campaigns_org_scoping`, `query` = file contents.

- [ ] **Step 5: Verify backfill correctness**

```sql
SELECT
  count(*) AS total,
  count(*) FILTER (WHERE org_id IS NOT NULL) AS with_org,
  count(*) FILTER (WHERE org_id IS NULL) AS without_org,
  count(DISTINCT org_id) AS distinct_orgs
  FROM public.lit_campaigns;
```

Expected: `total = with_org`, `without_org = 0`. If `without_org > 0`, STOP — surface the user_ids of those campaigns and reassign their owners' org_members before re-running the backfill.

- [ ] **Step 6: Commit the migration file**

```bash
git add supabase/migrations/20260605120000_lit_campaigns_org_scoping.sql
git commit -m "feat(campaigns): add org_id column + backfill from org_members

Phase 1 of sub-project A (campaign org-scoping). Adds nullable
org_id column referencing organizations(id); backfills each
existing campaign from the owner's primary org (owner-role first,
earliest join second). NOT NULL constraint + RLS rewrite are
separate tasks gated on a zero-null audit."
```

---

## Task 2: Lock org_id NOT NULL + add index

**Files:**
- Modify (append): `supabase/migrations/20260605120000_lit_campaigns_org_scoping.sql` — NO. Use a separate file to keep the gate explicit.
- Create: `supabase/migrations/20260605120100_lit_campaigns_org_id_not_null.sql`

- [ ] **Step 1: Re-run the zero-null audit**

```sql
SELECT count(*) AS still_null FROM public.lit_campaigns WHERE org_id IS NULL;
```

Expected: `still_null = 0`. If non-zero, return to Task 1 step 5; do NOT proceed.

- [ ] **Step 2: Write the NOT NULL migration**

Create `supabase/migrations/20260605120100_lit_campaigns_org_id_not_null.sql`:

```sql
-- 20260605120100_lit_campaigns_org_id_not_null.sql
-- Phase 2: Lock org_id NOT NULL + add covering index for the RLS
-- predicate join (org_members.org_id lookups).

BEGIN;

ALTER TABLE public.lit_campaigns
  ALTER COLUMN org_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS lit_campaigns_org_id_idx
  ON public.lit_campaigns(org_id);

COMMIT;
```

- [ ] **Step 3: Apply the migration via Supabase MCP**

Use `apply_migration` with `name: 20260605120100_lit_campaigns_org_id_not_null`.

- [ ] **Step 4: Verify the constraint + index**

```sql
SELECT column_name, is_nullable
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='lit_campaigns' AND column_name='org_id';
-- Expected: is_nullable = 'NO'

SELECT indexname FROM pg_indexes
 WHERE schemaname='public' AND tablename='lit_campaigns' AND indexname='lit_campaigns_org_id_idx';
-- Expected: 1 row returned
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260605120100_lit_campaigns_org_id_not_null.sql
git commit -m "feat(campaigns): set lit_campaigns.org_id NOT NULL + index

Phase 2 of sub-project A. Backfill verified zero nulls; constraint
locks invariant going forward. Index covers the org_members ↔
lit_campaigns join in the new RLS policy."
```

---

## Task 3: Rewrite RLS policies on `lit_campaigns`

**Files:**
- Create: `supabase/migrations/20260605120200_lit_campaigns_rls_org_scoped.sql`

- [ ] **Step 1: Inspect existing policies + record them for rollback**

```sql
SELECT polname, polcmd,
       pg_get_expr(polqual, polrelid) AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS check_expr
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
 WHERE c.relname = 'lit_campaigns';
```

Save the output to a scratch file. The current SELECT policy is `lit_campaigns_select_owner_or_admin`; INSERT/UPDATE/DELETE policies key on `auth.uid() = user_id`.

- [ ] **Step 2: Write the RLS migration**

Create `supabase/migrations/20260605120200_lit_campaigns_rls_org_scoped.sql`:

```sql
-- 20260605120200_lit_campaigns_rls_org_scoped.sql
-- Phase 3: Org-scoped RLS. Replaces user-owned visibility with
-- "any active org member OR platform admin" for SELECT, and gates
-- INSERT/UPDATE to org membership.

BEGIN;

-- Drop legacy policies. Names below MUST match the polname recorded
-- in Task 3 step 1; adjust if the project has diverged.
DROP POLICY IF EXISTS lit_campaigns_select_owner_or_admin ON public.lit_campaigns;
DROP POLICY IF EXISTS lit_campaigns_insert_owner ON public.lit_campaigns;
DROP POLICY IF EXISTS lit_campaigns_update_owner ON public.lit_campaigns;
DROP POLICY IF EXISTS lit_campaigns_delete_owner ON public.lit_campaigns;

-- SELECT: org member OR platform admin
CREATE POLICY lit_campaigns_select ON public.lit_campaigns
  FOR SELECT
  USING (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
       WHERE om.user_id = auth.uid() AND om.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid()
    )
  );

-- INSERT: creator must be an active member of the org_id they're writing
CREATE POLICY lit_campaigns_insert ON public.lit_campaigns
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND org_id IN (
      SELECT om.org_id FROM public.org_members om
       WHERE om.user_id = auth.uid() AND om.status = 'active'
    )
  );

-- UPDATE: creator OR org owner/admin
CREATE POLICY lit_campaigns_update ON public.lit_campaigns
  FOR UPDATE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.org_members om
       WHERE om.org_id = public.lit_campaigns.org_id
         AND om.user_id = auth.uid()
         AND om.role IN ('owner', 'admin')
         AND om.status = 'active'
    )
  );

-- DELETE: same as UPDATE
CREATE POLICY lit_campaigns_delete ON public.lit_campaigns
  FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.org_members om
       WHERE om.org_id = public.lit_campaigns.org_id
         AND om.user_id = auth.uid()
         AND om.role IN ('owner', 'admin')
         AND om.status = 'active'
    )
  );

COMMIT;
```

- [ ] **Step 3: Apply the migration via Supabase MCP**

Use `apply_migration` with `name: 20260605120200_lit_campaigns_rls_org_scoped`.

- [ ] **Step 4: Verify policy state**

```sql
SELECT polname, polcmd FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
 WHERE c.relname = 'lit_campaigns' ORDER BY polname;
-- Expected: 4 rows — lit_campaigns_delete, lit_campaigns_insert,
-- lit_campaigns_select, lit_campaigns_update.
```

- [ ] **Step 5: Smoke-test SELECT visibility for a non-admin user**

Pick a non-platform-admin user from `org_members`. Use Supabase MCP `execute_sql` and impersonate by setting the JWT claim:

```sql
-- Manually verify by querying as a real user via the frontend after deploy.
-- SQL-side check: count campaigns visible to ematt@mattinglyind.com
SELECT count(*) AS visible_to_ematt
  FROM public.lit_campaigns lc
 WHERE lc.org_id IN (
   SELECT org_id FROM public.org_members
    WHERE user_id = (SELECT id FROM auth.users WHERE email = 'ematt@mattinglyind.com')
      AND status = 'active'
 );
-- Cross-check: total campaigns
SELECT count(*) AS total FROM public.lit_campaigns;
```

Expected: visible_to_ematt < total (he should NOT see Logistic Intel campaigns).

- [ ] **Step 6: Smoke-test platform_admin visibility**

```sql
SELECT count(*) AS visible_to_valesco_as_admin
  FROM public.lit_campaigns
 WHERE EXISTS (
   SELECT 1 FROM public.platform_admins pa
    WHERE pa.user_id = (SELECT id FROM auth.users WHERE email = 'vraymond@sparkfusiondigital.com')
 );
```

Expected: visible_to_valesco_as_admin = total. Platform admin can see everything (RLS permissive; frontend will scope by default).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260605120200_lit_campaigns_rls_org_scoped.sql
git commit -m "feat(campaigns): rewrite RLS to org-member + platform-admin visibility

Phase 3 of sub-project A. SELECT permits any active org_member OR
platform_admin. INSERT requires creator be active org member.
UPDATE/DELETE permits creator OR org owner/admin. Per CLAUDE.md,
admin bypass stays server-side; frontend will default to org-scope."
```

---

## Task 4: Expose `is_platform_admin` from `get-entitlements`

**Files:**
- Modify: `supabase/functions/get-entitlements/index.ts`

- [ ] **Step 1: Read the current edge fn structure**

The current handler at `supabase/functions/get-entitlements/index.ts:70-93` calls `adminClient.rpc("get_entitlements", { p_org_id, p_user_id })` and returns `{ ok, entitlements, org_id, user_id }`. We need to add `is_platform_admin: boolean` alongside `entitlements`.

- [ ] **Step 2: Modify the handler**

Edit `supabase/functions/get-entitlements/index.ts`. After the existing `data` fetch at line 86 and before the return at line 92, add the platform_admin lookup:

```ts
// In the serve handler, after `if (error) { ... return ... }` and
// BEFORE the final `return json({ ok: true, entitlements: data, ... })`:

const { data: paRow } = await adminClient
  .from("platform_admins")
  .select("user_id")
  .eq("user_id", user.id)
  .maybeSingle();
const isPlatformAdmin = paRow !== null;

return json({
  ok: true,
  entitlements: data,
  org_id: orgId,
  user_id: user.id,
  is_platform_admin: isPlatformAdmin,
});
```

- [ ] **Step 3: Deploy the edge function**

Use Supabase MCP `mcp__claude_ai_Supabase__deploy_edge_function` with `project_id: jkmrfiaefxwgbvftohrb`, `function_slug: get-entitlements`, files = current index.ts content. Preserve existing `verify_jwt` setting (check first via `get_edge_function`).

- [ ] **Step 4: Verify via pg_net invoke**

```sql
SELECT net.http_post(
  url := 'https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/get-entitlements',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer <a-real-user-jwt>'
  ),
  body := '{}'::jsonb
) AS req_id;
-- Wait ~5s
SELECT status_code, substr(content::text, 1, 400)
  FROM net._http_response WHERE id = <req_id>;
```

Expected: JSON body includes `"is_platform_admin": true` for Valesco, `false` for ematt.

If sourcing a real JWT is awkward, skip this step and rely on the frontend integration test in Task 5.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/get-entitlements/index.ts
git commit -m "feat(entitlements): expose is_platform_admin in snapshot

Adds boolean to get-entitlements response derived from platform_admins
table. Frontend useEntitlements will surface this to enable the
AdminScopeToggle conditional render."
```

---

## Task 5: Extend EntitlementsSnapshot type + surface `isPlatformAdmin`

**Files:**
- Modify: `frontend/src/api/entitlements.ts`
- Modify: `frontend/src/hooks/useEntitlements.ts`
- Test: `frontend/src/hooks/__tests__/useEntitlements.isPlatformAdmin.test.ts` (NEW)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/hooks/__tests__/useEntitlements.isPlatformAdmin.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEntitlements } from "../useEntitlements";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1" }, plan: "scale", orgRole: "owner" }),
}));

vi.mock("@/api/entitlements", () => ({
  fetchEntitlementsSnapshot: vi.fn(),
}));

import { fetchEntitlementsSnapshot } from "@/api/entitlements";

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe("useEntitlements.isPlatformAdmin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("surfaces isPlatformAdmin=true when snapshot includes it", async () => {
    (fetchEntitlementsSnapshot as any).mockResolvedValue({
      plan: "scale", features: {}, limits: {}, used: {},
      is_platform_admin: true,
    });
    const { result } = renderHook(() => useEntitlements(), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isPlatformAdmin).toBe(true));
  });

  it("defaults isPlatformAdmin=false when snapshot omits the field", async () => {
    (fetchEntitlementsSnapshot as any).mockResolvedValue({
      plan: "scale", features: {}, limits: {}, used: {},
    });
    const { result } = renderHook(() => useEntitlements(), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isPlatformAdmin).toBe(false));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/hooks/__tests__/useEntitlements.isPlatformAdmin.test.ts
```

Expected: FAIL — `result.current.isPlatformAdmin` is `undefined`.

- [ ] **Step 3: Update the TypeScript type for the snapshot**

Edit `frontend/src/api/entitlements.ts`. Modify the `EntitlementsSnapshot` interface (lines 13-21):

```ts
export interface EntitlementsSnapshot {
  plan: string;
  plan_name?: string;
  reset_at?: string | null;
  features: Partial<Record<FeatureKey, boolean>>;
  limits: Partial<Record<UsageLimitKey, number | null>>;
  used: Partial<Record<UsageLimitKey, number>>;
  market_benchmark_enabled?: boolean;
  is_platform_admin?: boolean;
}
```

Modify the `GetEntitlementsResponse` interface (lines 23-28):

```ts
interface GetEntitlementsResponse {
  ok: true;
  entitlements: EntitlementsSnapshot;
  org_id: string | null;
  user_id: string;
  is_platform_admin?: boolean;
}
```

Modify `fetchEntitlementsSnapshot` (lines 34-37) to fold `is_platform_admin` from the top-level response into the snapshot if not already present there:

```ts
export async function fetchEntitlementsSnapshot(): Promise<EntitlementsSnapshot | null> {
  const res = await invokeEdge<GetEntitlementsResponse>("get-entitlements", {});
  if (!res) return null;
  const snap = res.entitlements ?? null;
  if (snap && typeof res.is_platform_admin === "boolean") {
    snap.is_platform_admin = res.is_platform_admin;
  }
  return snap;
}
```

- [ ] **Step 4: Expose `isPlatformAdmin` in the hook return**

Edit `frontend/src/hooks/useEntitlements.ts`. After line 33 add:

```ts
const isPlatformAdmin = Boolean(entitlements?.is_platform_admin);
```

(Note: `entitlements` is declared further down in the existing file via `useQuery`. The variable is referenced after it's declared. If TypeScript complains about temporal-dead-zone, move the declaration after the `useQuery` call. For maintainers: the existing `isAdmin` uses `orgRole` which IS available immediately from `useAuth()`, so it's safe at line 33. The new `isPlatformAdmin` depends on the query result, so place it AFTER the `useQuery` block.)

Concretely, after the existing `useQuery({...})` block (around line 44) add:

```ts
const isPlatformAdmin = Boolean(entitlements?.is_platform_admin);
```

Then at the return block (lines 121-130), add `isPlatformAdmin` to the returned object:

```ts
return {
  canAccessFeature,
  checkUsageLimit,
  invalidateCache,
  isChecking,
  plan,
  isAdmin,
  isPlatformAdmin,
  entitlements,
};
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/hooks/__tests__/useEntitlements.isPlatformAdmin.test.ts
```

Expected: PASS — both test cases green.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/entitlements.ts frontend/src/hooks/useEntitlements.ts frontend/src/hooks/__tests__/useEntitlements.isPlatformAdmin.test.ts
git commit -m "feat(entitlements): surface isPlatformAdmin from useEntitlements

Extends EntitlementsSnapshot type with is_platform_admin?: boolean,
folds it from top-level response if present, exposes derived
isPlatformAdmin on the hook return. Backed by Vitest cases for both
true and undefined-defaults-to-false."
```

---

## Task 6: Create `useAdminScope` hook

**Files:**
- Create: `frontend/src/hooks/useAdminScope.ts`
- Create: `frontend/src/hooks/__tests__/useAdminScope.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/hooks/__tests__/useAdminScope.test.ts`:

```ts
import { describe, expect, it, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/hooks/useEntitlements", () => ({
  useEntitlements: vi.fn(),
}));

import { useEntitlements } from "@/hooks/useEntitlements";
import { useAdminScope } from "../useAdminScope";

describe("useAdminScope", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("defaults to 'org' for a regular user", () => {
    (useEntitlements as any).mockReturnValue({ isPlatformAdmin: false });
    const { result } = renderHook(() => useAdminScope());
    expect(result.current.scope).toBe("org");
  });

  it("defaults to 'org' for a platform admin who never toggled", () => {
    (useEntitlements as any).mockReturnValue({ isPlatformAdmin: true });
    const { result } = renderHook(() => useAdminScope());
    expect(result.current.scope).toBe("org");
  });

  it("respects 'all' for a platform admin who toggled", () => {
    localStorage.setItem("lit.adminScope", "all");
    (useEntitlements as any).mockReturnValue({ isPlatformAdmin: true });
    const { result } = renderHook(() => useAdminScope());
    expect(result.current.scope).toBe("all");
  });

  it("ignores 'all' from localStorage for a non-admin (defensive)", () => {
    localStorage.setItem("lit.adminScope", "all");
    (useEntitlements as any).mockReturnValue({ isPlatformAdmin: false });
    const { result } = renderHook(() => useAdminScope());
    expect(result.current.scope).toBe("org");
  });

  it("setScope persists to localStorage", () => {
    (useEntitlements as any).mockReturnValue({ isPlatformAdmin: true });
    const { result } = renderHook(() => useAdminScope());
    act(() => result.current.setScope("all"));
    expect(localStorage.getItem("lit.adminScope")).toBe("all");
    expect(result.current.scope).toBe("all");
  });

  it("setScope to 'all' for non-admin is no-op", () => {
    (useEntitlements as any).mockReturnValue({ isPlatformAdmin: false });
    const { result } = renderHook(() => useAdminScope());
    act(() => result.current.setScope("all"));
    expect(localStorage.getItem("lit.adminScope")).toBe(null);
    expect(result.current.scope).toBe("org");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/hooks/__tests__/useAdminScope.test.ts
```

Expected: FAIL — hook doesn't exist.

- [ ] **Step 3: Implement the hook**

Create `frontend/src/hooks/useAdminScope.ts`:

```ts
/**
 * useAdminScope — localStorage-backed admin scope toggle.
 *
 * Returns `'org'` (default) or `'all'` for platform_admins who have
 * explicitly opted into cross-org visibility. Per CLAUDE.md, admin bypass
 * is server-side only; this hook controls a UX hint. Defensive guards
 * ignore any 'all' value when the user is not a platform admin so a
 * stale localStorage entry from a demoted user can't widen the view.
 */
import { useCallback, useEffect, useState } from "react";
import { useEntitlements } from "@/hooks/useEntitlements";

export type AdminScope = "org" | "all";

const STORAGE_KEY = "lit.adminScope";

function readStored(): AdminScope {
  if (typeof window === "undefined") return "org";
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === "all" ? "all" : "org";
}

export function useAdminScope() {
  const { isPlatformAdmin } = useEntitlements();
  const [scope, setScopeState] = useState<AdminScope>(() => readStored());

  // Defensive: a non-admin should never compute scope='all', even if
  // localStorage was left over from a prior admin session.
  const effectiveScope: AdminScope = isPlatformAdmin ? scope : "org";

  // Re-read on admin status change (e.g. role was promoted/demoted mid-session)
  useEffect(() => {
    setScopeState(readStored());
  }, [isPlatformAdmin]);

  const setScope = useCallback(
    (next: AdminScope) => {
      if (!isPlatformAdmin && next === "all") return; // no-op for non-admins
      window.localStorage.setItem(STORAGE_KEY, next);
      setScopeState(next);
    },
    [isPlatformAdmin],
  );

  return { scope: effectiveScope, setScope, isPlatformAdmin };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/hooks/__tests__/useAdminScope.test.ts
```

Expected: PASS — all 6 cases green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useAdminScope.ts frontend/src/hooks/__tests__/useAdminScope.test.ts
git commit -m "feat(admin): add useAdminScope hook (localStorage + defensive guard)

Returns 'org' (default) or 'all' for platform_admins who opted in.
Non-admin localStorage values are ignored. setScope is a no-op when
non-admin tries to widen scope. Covered by 6 Vitest cases."
```

---

## Task 7: Create `AdminScopeToggle` component

**Files:**
- Create: `frontend/src/components/layout/AdminScopeToggle.tsx`
- Create: `frontend/src/components/layout/__tests__/AdminScopeToggle.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/layout/__tests__/AdminScopeToggle.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/hooks/useAdminScope", () => ({
  useAdminScope: vi.fn(),
}));
vi.mock("@/hooks/useEntitlements", () => ({
  useEntitlements: vi.fn(),
}));

import { useAdminScope } from "@/hooks/useAdminScope";
import { useEntitlements } from "@/hooks/useEntitlements";
import { AdminScopeToggle } from "../AdminScopeToggle";

describe("AdminScopeToggle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders nothing when user is not a platform admin", () => {
    (useAdminScope as any).mockReturnValue({ scope: "org", setScope: vi.fn(), isPlatformAdmin: false });
    (useEntitlements as any).mockReturnValue({ entitlements: { plan: "scale" } });
    const { container } = render(<AdminScopeToggle currentOrgName="Logistic Intel" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the org name chip for platform admin in org scope", () => {
    (useAdminScope as any).mockReturnValue({ scope: "org", setScope: vi.fn(), isPlatformAdmin: true });
    render(<AdminScopeToggle currentOrgName="Logistic Intel" />);
    expect(screen.getByText(/Logistic Intel/)).toBeInTheDocument();
  });

  it("renders 'All Orgs (Admin)' chip in amber when scope=all", () => {
    (useAdminScope as any).mockReturnValue({ scope: "all", setScope: vi.fn(), isPlatformAdmin: true });
    render(<AdminScopeToggle currentOrgName="Logistic Intel" />);
    const chip = screen.getByText(/All Orgs/);
    expect(chip).toBeInTheDocument();
    // Amber background class for unmistakable scope state
    expect(chip.closest("button")?.className).toMatch(/amber/);
  });

  it("calls setScope('all') when admin clicks the 'All Orgs' menu option", () => {
    const setScope = vi.fn();
    (useAdminScope as any).mockReturnValue({ scope: "org", setScope, isPlatformAdmin: true });
    render(<AdminScopeToggle currentOrgName="Logistic Intel" />);
    fireEvent.click(screen.getByRole("button", { name: /Logistic Intel/ }));
    fireEvent.click(screen.getByText(/All Orgs/));
    expect(setScope).toHaveBeenCalledWith("all");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/components/layout/__tests__/AdminScopeToggle.test.tsx
```

Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement the component**

Create `frontend/src/components/layout/AdminScopeToggle.tsx`:

```tsx
/**
 * AdminScopeToggle — header chip rendered only for platform_admins.
 *
 * Default state: "My Org" chip. Toggled state: amber-tinted "All Orgs
 * (Admin)" chip so scope state is unmistakable in screenshots/demos.
 * Per CLAUDE.md, this is a UX hint — backend RLS remains permissive
 * for platform_admins. The frontend choice is what scopes the query.
 */
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Shield, Building2 } from "lucide-react";
import { useAdminScope } from "@/hooks/useAdminScope";

interface Props {
  currentOrgName?: string;
}

export function AdminScopeToggle({ currentOrgName }: Props) {
  const { scope, setScope, isPlatformAdmin } = useAdminScope();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!isPlatformAdmin) return null;

  const label = scope === "all"
    ? "All Orgs (Admin)"
    : (currentOrgName ?? "My Org");
  const Icon = scope === "all" ? Shield : Building2;
  const chipClass = scope === "all"
    ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex h-11 items-center gap-2 rounded-2xl border px-3 text-sm font-medium shadow-sm transition ${chipClass}`}
      >
        <Icon size={14} />
        <span className="hidden sm:inline">{label}</span>
        <ChevronDown size={14} className={`transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Viewing as
          </div>
          <button
            type="button"
            onClick={() => { setScope("org"); setOpen(false); }}
            className={`flex w-full items-center gap-2 px-3 py-2.5 text-sm hover:bg-slate-50 ${scope === "org" ? "bg-slate-50 font-semibold" : ""}`}
          >
            <Building2 size={14} className="text-slate-500" />
            {currentOrgName ?? "My Org"}
          </button>
          <button
            type="button"
            onClick={() => { setScope("all"); setOpen(false); }}
            className={`flex w-full items-center gap-2 px-3 py-2.5 text-sm hover:bg-amber-50 ${scope === "all" ? "bg-amber-50 font-semibold text-amber-800" : ""}`}
          >
            <Shield size={14} className="text-amber-600" />
            All Orgs (Platform Admin)
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/components/layout/__tests__/AdminScopeToggle.test.tsx
```

Expected: PASS — all 4 cases green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/AdminScopeToggle.tsx frontend/src/components/layout/__tests__/AdminScopeToggle.test.tsx
git commit -m "feat(admin): AdminScopeToggle header chip (conditional render)

Renders nothing for non-platform-admins. Default 'My Org' chip in
neutral slate; switches to amber 'All Orgs (Admin)' chip when toggled
so scope state is unmistakable. Dropdown lets admin switch between
the two scopes; selection persists via useAdminScope."
```

---

## Task 8: Mount `AdminScopeToggle` in `AppHeader`

**Files:**
- Modify: `frontend/src/layout/lit/AppHeader.jsx`

- [ ] **Step 1: Read the AppHeader desktop control-cluster region**

The desktop control cluster is at lines 216-247 of `frontend/src/layout/lit/AppHeader.jsx`. Order today: search pill → `<NotificationBell />` → mobile menu button → profile dropdown. We want the toggle between search and NotificationBell.

- [ ] **Step 2: Add the import + the mount**

Edit `frontend/src/layout/lit/AppHeader.jsx`. Add to imports (line 23 area):

```jsx
import { AdminScopeToggle } from "@/components/layout/AdminScopeToggle";
```

Inside `useAuth()` destructuring (line 101), also pull whatever org-name source you have. The simplest is via `useEntitlements()` which already returns `entitlements` (we don't have a clean org name there yet — fall back to a passed string or the current org id). For v1, accept that the chip says "My Org" when no name is wired.

After line 227 (the search pill closing `</div>`) and before line 229 (`<NotificationBell />`), insert:

```jsx
<AdminScopeToggle currentOrgName={null /* TODO wire from useEntitlements snapshot when org name available */} />
```

If `useEntitlements()` returns an `entitlements.org_name` already (check at implementation time), pass it. Otherwise pass `null` and the chip will read "My Org" — acceptable for v1.

- [ ] **Step 3: Visual smoke test**

Start the dev server and load the app. Sign in as Valesco (`vraymond@sparkfusiondigital.com`).

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173/app/dashboard`. Expected: chip appears between search and bell. Sign in as a non-platform-admin user (any account NOT in `platform_admins`). Expected: chip is absent.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/layout/lit/AppHeader.jsx
git commit -m "feat(admin): mount AdminScopeToggle in AppHeader

Renders between the search pill and NotificationBell. Conditional
on isPlatformAdmin so the chip is invisible to regular users.
currentOrgName is passed null for v1; will wire from entitlements
snapshot in a follow-up once an org_name field is added."
```

---

## Task 9: Update `getCampaignsFromSupabase` to apply org filter

**Files:**
- Modify: `frontend/src/lib/supabase.ts` (lines 314-335)
- Modify: `frontend/src/components/dashboard/LITDashboard.jsx` (line 67)
- Modify: `frontend/src/lib/apiDev.ts` (line 199)
- Test: `frontend/src/lib/__tests__/supabase.getCampaigns.test.ts` (NEW)

- [ ] **Step 1: Confirm all call sites**

```bash
grep -rnE "getCampaignsFromSupabase" frontend/src/ --include="*.ts" --include="*.tsx" --include="*.jsx"
```

Expected callers: `LITDashboard.jsx:67`, `apiDev.ts:199`. Any other hit needs the same args update.

- [ ] **Step 2: Write the failing test**

Create `frontend/src/lib/__tests__/supabase.getCampaigns.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const eqSpy = vi.fn().mockReturnThis();
const orderSpy = vi.fn().mockResolvedValue({ data: [], error: null });
const selectSpy = vi.fn(() => ({ eq: eqSpy, order: orderSpy }));
const fromSpy = vi.fn(() => ({ select: selectSpy }));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { from: fromSpy },
  supabaseError: null,
}));

import { getCampaignsFromSupabase } from "../supabase";

describe("getCampaignsFromSupabase", () => {
  beforeEach(() => {
    eqSpy.mockClear();
    orderSpy.mockClear();
    selectSpy.mockClear();
    fromSpy.mockClear();
  });

  it("adds .eq('org_id', orgId) when scope='org'", async () => {
    await getCampaignsFromSupabase({ orgId: "org-123", adminScope: "org" });
    expect(eqSpy).toHaveBeenCalledWith("org_id", "org-123");
  });

  it("omits .eq() when scope='all'", async () => {
    await getCampaignsFromSupabase({ orgId: "org-123", adminScope: "all" });
    expect(eqSpy).not.toHaveBeenCalled();
  });

  it("defaults to org-scope when args omitted (no orgId → returns [])", async () => {
    const result = await getCampaignsFromSupabase();
    // No orgId → can't safely query; return empty rather than leak everything
    expect(result).toEqual([]);
    expect(fromSpy).not.toHaveBeenCalled();
  });
});
```

NOTE: the test imports from `@/lib/supabaseClient`. If the actual `supabase` is imported differently in `supabase.ts` (e.g. `from "./supabaseClient"` or inline), adjust the mock path to match. Check the top of `frontend/src/lib/supabase.ts` to confirm.

- [ ] **Step 3: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/lib/__tests__/supabase.getCampaigns.test.ts
```

Expected: FAIL — function doesn't accept args; doesn't gate on orgId.

- [ ] **Step 4: Implement the parameter changes**

Edit `frontend/src/lib/supabase.ts:314-335`. Replace `getCampaignsFromSupabase` with:

```ts
export interface GetCampaignsOptions {
  orgId?: string | null;
  adminScope?: "org" | "all";
}

export async function getCampaignsFromSupabase(opts: GetCampaignsOptions = {}) {
  try {
    if (supabaseError) {
      return [];
    }
    const { orgId = null, adminScope = "org" } = opts;

    // Safety: if scope is 'org' but no orgId, return empty rather than
    // leak every campaign. The new RLS would block it anyway, but be loud.
    if (adminScope === "org" && !orgId) {
      return [];
    }

    let q = supabase
      .from("lit_campaigns")
      .select("*");
    if (adminScope === "org" && orgId) {
      q = q.eq("org_id", orgId);
    }
    const { data, error } = await q.order("created_at", { ascending: false });

    if (error) {
      console.warn("[Supabase] Error fetching campaigns:", error);
      return [];
    }
    return data || [];
  } catch (error) {
    console.warn("[Supabase] Exception fetching campaigns:", error);
    return [];
  }
}
```

- [ ] **Step 5: Update the two callers**

Edit `frontend/src/components/dashboard/LITDashboard.jsx` around line 67. Find the call (likely `getCampaignsFromSupabase()`) and add the args. The component already has access to `useEntitlements()` somewhere upstream; if not, import + use it:

```jsx
import { useEntitlements } from "@/hooks/useEntitlements";
import { useAdminScope } from "@/hooks/useAdminScope";

// inside the component:
const { entitlements } = useEntitlements();
const { scope: adminScope } = useAdminScope();
const orgId = (entitlements as any)?.org_id ?? null;
// then:
getCampaignsFromSupabase({ orgId, adminScope })
```

Edit `frontend/src/lib/apiDev.ts:199` to similarly pass `{ orgId, adminScope }`. Since `apiDev.ts` is not a React component (can't use hooks), this caller needs `orgId`/`adminScope` passed in as args by its callers. Update the function signature one level up if needed.

- [ ] **Step 6: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/lib/__tests__/supabase.getCampaigns.test.ts
```

Expected: PASS — all 3 cases green.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/supabase.ts frontend/src/components/dashboard/LITDashboard.jsx frontend/src/lib/apiDev.ts frontend/src/lib/__tests__/supabase.getCampaigns.test.ts
git commit -m "feat(campaigns): scope campaigns query by org_id + adminScope

getCampaignsFromSupabase now accepts { orgId, adminScope }. When
scope='org', adds .eq('org_id', orgId); when 'all', drops the
filter so platform admins can opt into cross-org visibility. Safety:
scope='org' with no orgId returns [] rather than leak. LITDashboard
+ apiDev callers updated."
```

---

## Task 10: Set `org_id` on every campaign INSERT

**Files:**
- Modify: `frontend/src/lib/api.ts` (campaign create paths — locate via grep)

- [ ] **Step 1: Locate all campaign insert sites**

```bash
grep -rnE "from\(['\"]lit_campaigns['\"]\)\.insert|from\(['\"]lit_campaigns['\"]\)\.upsert" frontend/src/ --include="*.ts" --include="*.tsx" --include="*.jsx"
```

Record every match. Each one needs `org_id` set in the payload.

- [ ] **Step 2: Add the org_id payload to each insert**

For each insert/upsert site, ensure the payload includes `org_id` derived from the user's primary org. Pattern:

```ts
// Resolve org_id once at the call site (component or service)
const { data: om } = await supabase
  .from("org_members")
  .select("org_id")
  .eq("user_id", currentUser.id)
  .eq("status", "active")
  .order("joined_at", { ascending: true })
  .limit(1)
  .maybeSingle();
const orgId = om?.org_id;
if (!orgId) throw new Error("No active org membership; cannot create campaign");

// Then in the insert:
await supabase.from("lit_campaigns").insert({
  user_id: currentUser.id,
  org_id: orgId,
  // ...rest of payload
});
```

If multiple insert sites exist, factor the org lookup into a helper in `frontend/src/lib/api.ts` (e.g. `resolveActiveOrgId(userId: string): Promise<string>`).

- [ ] **Step 3: Manual smoke test**

Start dev server, log in as any user, create a new campaign via the UI. Verify:

```sql
SELECT id, name, user_id, org_id FROM public.lit_campaigns ORDER BY created_at DESC LIMIT 1;
```

Expected: the newest row has `org_id` matching the creator's `org_members.org_id`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(campaigns): set org_id on every lit_campaigns INSERT

Resolves creator's active org via org_members lookup; sets org_id
on the insert payload so new campaigns are immediately scoped to
the creator's workspace. Hard-fails if user has no active org
membership rather than write a null (NOT NULL constraint would
reject it anyway — fail with a clearer message)."
```

---

## Task 11: Add "Created by X" attribution to CampaignRow

**Files:**
- Modify: `frontend/src/features/outbound/components/CampaignRow.tsx`

- [ ] **Step 1: Read the current CampaignRow to find the right spot**

```bash
grep -n "name\|created" frontend/src/features/outbound/components/CampaignRow.tsx | head -20
```

Locate where the campaign name + meta line renders. We want the attribution chip immediately below the name.

- [ ] **Step 2: Extend the query to fetch creator email/name**

The `getCrmCampaigns` query in `frontend/src/lib/api.ts:4992-5011` does `from('lit_campaigns').select('*')`. Update the select to embed the creator:

```ts
.select('*, creator:auth.users!user_id(email, raw_user_meta_data)')
```

If `profiles` table exists with `full_name`, prefer that join instead:

```ts
.select('*, creator:profiles!user_id(full_name, email)')
```

Confirm which exists via:

```sql
SELECT table_name FROM information_schema.tables
 WHERE table_schema='public' AND table_name IN ('profiles');
```

- [ ] **Step 3: Render the attribution line**

In `CampaignRow.tsx`, add below the campaign name:

```tsx
{(c.creator?.full_name || c.creator?.email) && (
  <div className="mt-0.5 text-xs text-slate-500">
    Created by {c.creator?.full_name ?? c.creator?.email?.split("@")[0]}
    {c.created_at && <> · {formatRelativeShort(c.created_at)}</>}
  </div>
)}
```

`formatRelativeShort` is the helper already used in SuppliersView (Task C). If not exported from a shared module yet, import from wherever it lives or duplicate the function inline:

```ts
function formatRelativeShort(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}
```

- [ ] **Step 4: Visual smoke test**

Start dev server, open `/app/campaigns`, verify each row shows "Created by [name] · [time] ago" below the campaign name.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/outbound/components/CampaignRow.tsx frontend/src/lib/api.ts
git commit -m "feat(campaigns): attribution line on every campaign row

Embeds creator email/name via the supabase select, renders 'Created
by X · Yh ago' beneath the campaign name. Helps team-shared mode
make ownership obvious without losing visibility."
```

---

## Task 12: E2E acceptance verification

**Files:**
- None (pure verification)

This task is the human/manual acceptance gate before the sub-project is done.

- [ ] **Step 1: Verify Valesco's default view is org-scoped**

Log in as `vraymond@sparkfusiondigital.com`. Open `/app/campaigns`. Expected: see only Logistic Intel campaigns. "Boss Man" is NOT visible.

- [ ] **Step 2: Verify Valesco can toggle to all-orgs view**

Click the AdminScopeToggle chip in the header. Select "All Orgs (Platform Admin)". Expected: "Boss Man" appears alongside Logistic Intel campaigns. Chip changes to amber "All Orgs (Admin)".

- [ ] **Step 3: Verify ematt sees only his org**

Log in as `ematt@mattinglyind.com`. Open `/app/campaigns`. Expected: see only Mattingly Industries campaigns. AdminScopeToggle chip is NOT rendered (not a platform admin).

- [ ] **Step 4: Verify campaign creation sets org_id**

Still as ematt, create a new test campaign. Verify via SQL:

```sql
SELECT name, org_id, user_id FROM public.lit_campaigns
 WHERE name LIKE '%test%' AND user_id = (SELECT id FROM auth.users WHERE email = 'ematt@mattinglyind.com')
 ORDER BY created_at DESC LIMIT 1;
```

Expected: `org_id` matches the Mattingly org UUID.

- [ ] **Step 5: Verify org-member visibility (if a second Mattingly account exists)**

If ematt has invited a teammate to Mattingly's org via `org_members`, log in as that teammate and confirm the test campaign created above is visible. (If no teammate exists, skip — this is org-sharing verification.)

- [ ] **Step 6: Verify localStorage tamper resistance**

Open DevTools as ematt (non-admin) → Application → Local Storage → set `lit.adminScope` to `"all"` manually → reload `/app/campaigns`. Expected: still scoped to Mattingly. Setting is ignored because `isPlatformAdmin === false`.

- [ ] **Step 7: Document acceptance + close out**

```bash
git commit --allow-empty -m "chore(campaigns): sub-project A acceptance verified

Per docs/superpowers/specs/2026-06-05-campaign-org-scoping-design.md.
All 6 E2E acceptance criteria pass. Ready for B (tracking pipeline)
on top of this foundation."
```

---

## Self-Review

**Spec coverage:**

| Spec section | Covered by |
|---|---|
| Data model — add org_id, backfill, NOT NULL, index | Tasks 1, 2 |
| RLS rewrite — SELECT/INSERT/UPDATE/DELETE policies | Task 3 |
| Admin scope = frontend UX choice | Tasks 5, 6, 7, 9 |
| isPlatformAdmin in get-entitlements | Tasks 4, 5 |
| useAdminScope hook | Task 6 |
| AdminScopeToggle component | Tasks 7, 8 |
| Frontend query filter | Task 9 |
| Set org_id on INSERT | Task 10 |
| Creator attribution | Task 11 |
| Testing checklist (migration backfill, RLS, hook, component, E2E) | Tasks 1, 3, 5, 6, 7, 9, 12 |
| Error handling: orphan owners hard-fail | Task 1 step 2 + Task 2 step 1 |
| Error handling: defensive non-admin guard | Task 6 step 3 + Task 9 step 4 |

No gaps.

**Placeholder scan:** Scanned for "TODO" / "TBD" / "implement later" / "add appropriate" / "similar to". One annotated `TODO wire from useEntitlements snapshot when org name available` in Task 8 step 2 — intentional, called out as a known v1 limitation in the spec's "Out of scope" section, with clear fallback behavior.

**Type consistency:** `AdminScope` type defined in Task 6 (`'org' | 'all'`) used consistently in Tasks 7 and 9. `EntitlementsSnapshot.is_platform_admin?: boolean` added in Task 5, consumed via `isPlatformAdmin` getter in Tasks 6 and 7. `GetCampaignsOptions` defined in Task 9 used by callers in same task. No drift.

---

## Out of scope (deferred to follow-up workstreams)

- Wiring `currentOrgName` from a server-side org name field — placeholder `null` for v1 (chip reads "My Org")
- "Transfer campaign ownership" admin action
- Org switching for users with multiple org memberships
- Audit log of admin-scope view events
- Schema cleanup of the unused `public.campaigns` table
