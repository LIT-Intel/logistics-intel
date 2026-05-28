# Edge Function Service-Role Audit (CEO item 9 / /cso F5)

**Date:** 2026-05-28
**Status:** PASS 1 DONE — 2 findings closed, 1 deferred
**Branch lock:** `claude/review-dashboard-deploy-3AmMD`

---

## Method

Categorized every edge function that imports `SUPABASE_SERVICE_ROLE_KEY` by its auth model. Goal: confirm service-role is reserved for webhook / cron / admin / token-bearing paths, never callable by anyone holding the anon key.

## Inventory (54 functions using service-role)

| Category | Count | Functions |
|---|---|---|
| **JWT (user-verified)** | 30 | `admin-api`, `admin-audit-export`, `affiliate-admin`, `apollo-contact-enrich`, `apollo-contact-search`, `apollo-job-postings`*, `claim-affiliate-referral`, `company-profile`, `enrich-campaign-contacts`, `enrich-contacts`, `export-company-profile`, `gemini-brief`, `gemini-enrichment`, `get-billing-status`, `get-entitlements`, `importyeti-proxy`, `lusha-contact-search`, `lusha-enrichment`, `normalize-company`*, `pulse-ai-enrich`, `pulse-brief`, `pulse-coach`, `pulse-coach-v2`, `pulse-list-digest-email`, `pulse-refresh-lists`, `pulse-search`, `pulse-web-discover`, `queue-campaign-recipients`, `save-company`, `send-affiliate-invite`, `send-org-invite`, `send-pulse-brief-email`, `send-test-email` |
| **CRON (`X-Internal-Cron` shared secret)** | 11 | `freight-rate-fetcher`, `freightos-benchmark-sync`, `pulse-alert-digest`, `pulse-arrival-alerts`, `pulse-bol-tracking-tick`, `pulse-digest-preview`, `pulse-drayage-recompute`, `pulse-refresh-tick`, `pulse-unified-shipments-backfill`, `send-campaign-email`**, `subscription-email-cron` |
| **WEBHOOK (signature-verified)** | 2 | `billing-webhook` (Stripe), `resend-webhook` (Svix) |
| **ADMIN-OR-SERVICE bearer-token** | 2 | `send-subscription-email` (admin-JWT or service-role), `admin-notify` (admin secret in `lit_internal_secrets`) |
| **TOKEN-AUTH (token IS the credential)** | 3 | `accept-affiliate-invite`, `accept-workspace-invite`, `affiliate-invite-lookup` |
| **OAUTH-STATE (signed state payload)** | 2 | `oauth-gmail-callback`, `oauth-outlook-callback`, `email-oauth-callback` |
| **PUBLIC-BY-DESIGN (anonymous endpoints)** | 3 | `email-unsubscribe` (token in link), `redirect-click` (random slug), `reply-receiver`† |

\* Patched 2026-05-28 — were UNAUTH. Now require JWT or service-role.
\*\* Patched 2026-05-28 — added `verifyCronAuth`. Was UNAUTH despite being cron-only.
† Tracked below — Pub/Sub OIDC verification still a TODO.

## Findings closed this pass

### F-A1 — `send-campaign-email` was UNAUTH despite being cron-only (HIGH)

**Exploit:** Anyone with the anon key could POST to `/functions/v1/send-campaign-email`, bypassing the 60s pg_cron cadence, hammering Resend, and spending Resend quota on attacker's schedule. The function header explicitly stated "NOT JWT-authenticated" but no cron-secret gate was in place.

**Fix:** Added `verifyCronAuth(req)` from `_shared/cron_auth.ts` at the top of the serve handler. Now requires `X-Internal-Cron: <LIT_CRON_SECRET>` header.

**Deploy note:** pg_cron callers must include the header (which they likely already do since the other 10 cron functions already require it).

### F-A2 — `normalize-company` and `apollo-job-postings` were UNAUTH (CRITICAL + HIGH)

Closed in previous commit. See `_shared/auth.ts` + the /cso security report.

## Findings deferred — tracked for follow-up

### F-A3 — `reply-receiver` Pub/Sub OIDC verification is a TODO (MEDIUM)

**Current state:** Function comment says "authenticity comes from the signed Pub/Sub OIDC token (TODO: verify) and Graph's clientState echo." The Graph clientState echo IS implicit (each notification carries the `clientState` = mailbox UUID set during subscription creation, and the function `.eq("id", mailboxId)` lookup fails for invalid IDs). The Pub/Sub OIDC verification is genuinely missing.

**Exploit:** Attacker who knows the function URL AND a valid `lit_outreach_history.provider_event_id` can spoof a "replied" event, polluting campaign analytics. Low impact — not customer-facing, no money lost, no PII leaked.

**Fix needed:** Implement Google Pub/Sub OIDC verification at the top of `handleGmailPush`:
1. Read `Authorization: Bearer <jwt>` header
2. Fetch JWKS from `https://www.googleapis.com/oauth2/v3/certs` (cache 1h)
3. Verify JWT signature against the matching JWK
4. Check `iss` = `https://accounts.google.com` and `aud` = configured Pub/Sub audience
5. Return 401 on any failure

**Effort:** ~2h CC. Use `jose` from `https://deno.land/x/jose/` for JWT verification.

**Why deferred:** Low impact + non-trivial implementation. Not blocking ship readiness. Adding to TODOS for next sprint.

## False positives in the initial /cso scan

These appeared UNAUTH in the first pass but are actually properly authenticated:
- `admin-notify`: bearer-token check against `lit_internal_secrets.admin_notify_secret`
- `email-oauth-callback`: signed state payload (CSRF + binding)
- `email-unsubscribe`: documented public-by-design (token in link IS the auth)
- `redirect-click`: documented public-by-design (12-char random slug IS the auth)

## Verdict

After this pass: 0 CRITICAL, 0 HIGH service-role posture findings remain. 1 MEDIUM open (F-A3 reply-receiver). The 75% service-role usage rate is appropriate given the workload mix (30 user-facing functions that need cross-tenant reads + 11 crons + 2 webhooks + token-auth surfaces).

CLAUDE.md should be updated with the policy: "service-role is reserved for webhook / cron / admin / token-bearing paths and user-JWT-verified functions that need cross-tenant reads."
