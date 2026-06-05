# Admin Dashboard rebuild against real data

**Date:** 2026-05-28
**Status:** PLAN — depends on items 6, 9, 11 of CEO upgrade path
**Branch lock:** `claude/review-dashboard-deploy-3AmMD`
**Owner:** Auth / Access / Billing / Admin
**Blocker resolved:** B-003 (admin dashboard depends on missing backend)

---

## Problem

`AdminDashboardV2.tsx` is the live admin surface (`AdminDashboard.jsx` was deleted on this branch). It depends on a mix of: a few real RPCs (`admin_*` migrations from 20260513), some direct Supabase reads, and historical fake data fallbacks. The brief says "Admin Dashboard depends on unstable or missing backend assumptions and is not yet a reliable control center."

Today's admin dashboard is necessary for: managing users, orgs, plan changes, seat enforcement, incident response, audit trail, and (per item 11) provider spend.

## Blocking dependencies

1. **Subscriptions org-keyed migration** (separate plan doc). Until subscriptions are org-keyed, the admin dashboard can't show "plan per org" accurately for invited members.
2. **Single entitlements source** (done — `get-entitlements`).
3. **Stripe webhook truth path** (done — `billing-webhook`).
4. **Service-role audit** (item 9). Admin surface should NOT use service-role keys from frontend; it should call `admin-api` which has the `platform_admins` check.
5. **Sentry + structured logs + spend dashboard** (item 11). Admin dashboard's "what's happening right now" view needs them.

Until at least #1 and #4 land, rebuilding admin surfaces just moves the rot around.

## Target surface (org admin vs platform admin)

Two distinct admins per `LIT_MASTER_OPERATING_BRIEF.md` rule 5 — keep them separate.

### Org admin (`/app/admin` — `org_members.role IN ('owner','admin')`)
- Workspace settings (name, branding, default sender)
- Members list — invite, role change, remove, resend invite
- Billing — current plan, seats used, payment method (read; mutations go to Stripe portal)
- Plan change — initiates Stripe checkout for upgrade/downgrade
- Org usage — current period: searches, saves, enrichment, pulse runs, campaigns sent
- Org-level audit log — last 90 days
- API tokens (future)

### Platform admin (`/app/superadmin` — `platform_admins` row)
- All orgs — search, filter by plan/status/trial-end, sort by spend
- Per-org drill-down — full snapshot
- Pause / unpause an org's edge function access
- Override plan (writes to `subscriptions.metadata_override` per migration 20260513160000)
- Spend per provider per period
- Failed Stripe webhooks queue
- Suspicious activity feed (from Sentry + spend alerts)
- User impersonation (audit-logged, time-boxed)
- Affiliate program admin (already partially built)
- Demo requests inbox (already built)

## Architecture

```
Frontend (/app/admin, /app/superadmin)
    │
    ▼
admin-api (edge fn) — has platform_admins gate at line 30-43, good.
    │
    ▼
- get_admin_org_summary(org_id) RPC
- get_admin_org_list({filter, sort, limit, offset}) RPC
- admin_change_member_role(org_id, member_id, role) RPC
- admin_override_plan(org_id, plan_code, expires_at, reason) RPC
- admin_pause_org(org_id, reason) RPC
- admin_get_spend({period, org_id?, provider?}) RPC — depends on item 11

All RPCs write to admin_action_log for audit trail.
```

Most RPCs already exist from migration 20260513140000 (`admin_action_rpcs`). Need to:
1. Audit each existing RPC for completeness against the target surface
2. Add the spend RPCs after item 11 ships
3. Add a unified "org snapshot" RPC that returns everything the drill-down needs in one shot
4. Migrate the frontend AdminDashboardV2 to call `admin-api` exclusively (no direct table reads)

## Migration sequence

**Phase 1 — verify existing RPCs (1 day)**
- Run each `admin_*` RPC against staging with a test org
- Document gaps (missing fields, broken queries, wrong joins)
- Patch SQL migrations as needed

**Phase 2 — frontend refactor (3-5 days)**
- AdminDashboardV2 calls `admin-api` for every read/write
- Delete every direct `.from('subscriptions')`, `.from('org_members')`, etc. from the admin pages
- Add proper loading/error/empty states (currently the dashboard renders blank on RPC failure)

**Phase 3 — superadmin surface (2 days)**
- New page `/app/superadmin` with platform-only views
- Per-org snapshot drill-down
- Spend dashboards (after item 11)
- Plan override flow

**Phase 4 — admin action audit trail UI (1 day)**
- View `admin_action_log` from the dashboard
- Filter by actor, action type, target org

## Acceptance criteria

- [ ] No frontend admin page queries Supabase tables directly
- [ ] Every admin write goes through `admin-api` + writes to `admin_action_log`
- [ ] Org admin and platform admin are visually + structurally distinct surfaces
- [ ] Every loading/error/empty state renders correctly with real RPC failures
- [ ] Spend per provider per org visible (depends on item 11)
- [ ] User impersonation is audit-logged and time-boxed (max 1 hour)
- [ ] No `is_admin` boolean in user metadata — always derived from `platform_admins` table

## Effort

| Phase | Human | CC |
|---|---|---|
| 1 — RPC audit + patch | 1d | 2h |
| 2 — Frontend refactor | 3-5d | 8h |
| 3 — Superadmin surface | 2d | 4h |
| 4 — Audit log UI | 1d | 2h |
| **Total** | **~1.5 weeks** | **~16h** |

## Risk

- Plan-override surface is high-trust — a bug here could give a customer the wrong plan. Test with staging first; add a 2-person approval flow for plan overrides in production.
- User impersonation must be loud — every impersonation session emits an admin event + an email to the impersonated user.
- This is a two-way door but customer-visible — bugs are reputational.
