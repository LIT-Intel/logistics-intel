# Harvey × LIT Architecture Audit (Batch 1)

> **Project Harvey, Batch 1 — LIT-side audit.** Companion to
> [`docs/HARVEY_REFERENCE_REVIEW.md`](HARVEY_REFERENCE_REVIEW.md) (the reference-repo review).
> This doc maps Harvey's planned capabilities onto the **actual** LIT codebase: what exists, what is
> partial, what is missing, and the minimal new surface Batch 2 should create.
>
> Audited from code on 2026-08-20. No DB access was used — everything below is derived from
> `supabase/migrations/`, `supabase/functions/`, and `frontend/src/`. Items that could not be
> verified from code are marked **UNVERIFIED** with what to check.
> Repo root for all relative paths: `logistics-intel/`.

---

## 1. Exists / Partial / Missing matrix (16 audit areas)

| # | Area | Status | Summary |
|---|------|--------|---------|
| 1 | LEAD CRM (`/app/leads`) | **EXISTS (rich)** | `lit_admin_leads` + 5 sibling tables, ~40 SECURITY DEFINER RPCs, 6-stage pipeline, tasks, 7-source unified timeline, membership model (`lit_lead_crm_members` + `is_lead_crm_member()`), soft-delete hygiene, suppression-aware composer. |
| 2 | Campaign architecture | **EXISTS** | `lit_campaigns` / `lit_campaign_steps` / `lit_campaign_contacts` / `lit_sequences`; delays, wait steps, A/B subjects, conditional follow-ups (`lit_conditional_followups`), org-scoped RLS. Frontend builder in `frontend/src/features/outbound/`. |
| 3 | Campaign dispatch | **EXISTS** | `send-campaign-email` on a 1-minute pg_cron tick (`campaign-dispatcher-tick`), `LIT_CRON_SECRET` header auth, advisory-lock idempotency, consent + suppression + throttle/warmup gates, Resend/Gmail/Outlook transports, click/pixel tracking. |
| 4 | Canonical schema / identity | **EXISTS** | `lit_companies` keyed by `(source, source_company_key)`, `lit_contacts` by `(source, source_contact_key)`; dedup via `canonical_name.ts` + Claude `normalize-company`. No cross-source identity-merge table (dedup is per-source upsert). |
| 5 | Edge fn conventions | **EXISTS** | `_shared/auth.ts` (`requireUser`, `requireUserOrService`, `isUserAdmin`), `_shared/logger.ts` (`createLogger` + Sentry), `_shared/cron_auth.ts` (`verifyCronAuth`, `X-Internal-Cron`). ~150 functions follow the pattern. |
| 6 | Gmail/Outlook + inbox sync | **EXISTS** (stale memory said missing) | `sync-inbox` is a real engine: Gmail history-API incremental + Outlook delta query, 90-day backfill, idempotent upserts into `lit_email_threads`/`lit_email_messages`, 5-min cron + Gmail Pub/Sub push via `reply-receiver`. |
| 7 | Unipile implementation | **EXISTS (human-in-the-loop)** | Per-user LinkedIn connect via hosted auth (`unipile-account`), draft→approve→send in `unipile-outreach`, webhook ingestion (`unipile-webhook`), 6 tables, per-account daily caps, idempotency keys. Secrets server-side only. |
| 8 | LinkedIn ↔ campaign dispatch | **PARTIAL** | `lit_campaign_steps.channel='linkedin'` exists and the dispatcher pauses those steps at `approval_required`; nothing auto-drafts/auto-sends LinkedIn campaign steps — `unipile-outreach` is a separate manual-approval path. `phantombuster-linkedin` is legacy discovery. |
| 9 | Apollo | **EXISTS** | `apollo-contact-search` / `apollo-contact-enrich` / `apollo-job-postings` / `apollo-phone-webhook`; plan-based preview caps; 1 credit/email, 10/phone; primary provider in the enrichment waterfall. |
| 10 | Explorium | **MISSING** | Zero integration code. Only doc mentions (`CLAUDE.md`, operating brief) and a dead UI key in `frontend/src/pages/LeadProspecting.jsx:82`. Treat as not integrated. |
| 11 | Enrichment pipeline | **EXISTS** | `enrich-contact-orchestrator` waterfall (Apollo → Lemlist → Tier3 stub), `normalize-company` (Claude), `gemini-enrichment`/`gemini-brief`, `lusha-*`, `pulse-ai-enrich`; Lead-CRM wrapper `lead-crm-enrich-contacts` adds an AI qualification gate. |
| 12 | Timeline / reply tracking | **EXISTS** | `lit_outreach_history` (append-only, idempotent on `(provider, provider_event_id)`), `lit_lead_activity`, `lit_email_threads`/`lit_email_messages`, `lit_resend_events`, pixel/click fns. Stop-on-reply implemented (recipient → `replied`, `next_send_at=NULL`). |
| 13 | Usage ledger | **EXISTS** | `lit_usage_ledger` (feature quota) + `provider_usage_events` (provider cost) via `_shared/provider_ledger.ts` (`recordProviderUsage`, never-throws) and `_shared/provider_operations.ts` canonical constants; `provider_pricing` table. |
| 14 | Feature flags | **EXISTS** | `lit_feature_flags` table (per-plan / global scopes, `global_kill`, `rollout`), `lit_provider_flag(key)` RPC (fail-open), `lit_admin_set_flag()` superadmin-audited writes, `PROVIDER_FLAGS` constants. `harvey_internal_agent` should follow this. |
| 15 | Auth / RLS | **EXISTS** | `platform_admins` (platform) vs `org_members.role` (workspace) — never conflated; Lead CRM adds `is_lead_crm_member()`/`is_platform_admin()` SECURITY DEFINER helpers as the internal-only gating template. |
| 16 | Audit / job infra | **PARTIAL** | `security_audit_logs` (org actions), `lit_saved_company_refresh_runs`, `lit_ingestion_runs`, `contact_enrichment_jobs`, async start-and-poll in `company-relationship-intel` (`research_status` column). **No generic agent-run/decision-log table** — Harvey needs one. No `lit_events_audit` table found (UNVERIFIED against live DB). |

---

## 2. Area-by-area detail

### 2.1 LEAD CRM — the internal sales CRM Harvey will operate

Frontend: `frontend/src/pages/leadcrm/` (13 files: `LeadCrmLayout.tsx`, `LeadsListPage.tsx`,
`FindLeadsPage.tsx`, `PipelinePage.tsx`, `TasksPage.tsx`, `TeamPage.tsx`, `ReportsPage.tsx`,
`LeadDetailDrawer.tsx`, `LeadCommunicationPanel.tsx`, `LeadCompanyPanels.tsx`, …), API client
`frontend/src/api/leadCrm.ts` (~1,700 lines of RPC wrappers), access hook
`frontend/src/hooks/useLeadCrmAccess.ts`, route guard `RequireLeadCrm` in
`frontend/src/pages/LeadProspecting.jsx`.

**Tables** (migrations `20260816000000` → `20260818013000`):

| Table | Purpose |
|---|---|
| `lit_admin_leads` | Core lead record. `email` (citext unique), `stage_id`, `status` (`open/converted/lost/nurture`), `lead_score`, `assigned_to`, funnel timestamps (`email_captured_at`, `signup_at`, `trial_started_at`, `converted_at`), company recognition columns (`company_id` → `lit_companies`, `source_company_key`, `company_domain`), soft `archived_at`/`deleted_at`, `merged_into_lead_id`. |
| `lit_lead_pipeline_stages` | 6 global stages: New → Contacted → Engaged → Trial → **Subscriber** (`is_won`) / **Lost** (`is_lost`), with `position`, `color`, `win_probability`. |
| `lit_lead_activity` | Immutable event log (`kind`, jsonb `body`, `actor_user_id` nullable = system, `source` ∈ magnet/product/email/demo/manual/system). Stage changes auto-logged by trigger `trg_lit_admin_leads_log_activity`. |
| `lit_lead_tasks` | Tasks; `lead_id` nullable since `20260816930000` (standalone tasks), `status` open/done, assignee. |
| `lit_lead_crm_members` | Explicit membership (`role` rep/manager); platform admins are implicit members. |
| `lit_lead_company_qualifications` | AI qualification cache, PK `(provider, provider_company_id)`, 30-day TTL, `status` qualified/disqualified/review, `confidence`. |

**RPCs** (all SECURITY DEFINER, gated on `is_lead_crm_member(auth.uid())`): the full CRUD +
pipeline surface — `lit_leadcrm_list_leads`, `lit_leadcrm_get_lead`, `lit_leadcrm_create_lead`,
`lit_leadcrm_create_lead_from_company`, `lit_leadcrm_update_lead`, `lit_leadcrm_set_stage`,
`lit_leadcrm_assign`, `lit_leadcrm_add_note`, `lit_leadcrm_log_touch`, `lit_leadcrm_lead_timeline`
(unions 7 sources), `lit_leadcrm_board`, `lit_leadcrm_pipeline_summary`,
`lit_leadcrm_report_funnel`, `lit_leadcrm_report_by_source`, `lit_leadcrm_lead_email`
(suppression-aware), `lit_leadcrm_add_to_campaign`, `lit_leadcrm_recognize_company`,
`lit_leadcrm_company_snapshot`, `lit_leadcrm_search_companies`, `lit_leadcrm_lead_contacts`,
task RPCs, archive/delete/restore/purge. Access RPC: `lit_my_lead_crm_access()`.

**Edge fns:** `lead-crm-send-email` (one-off Resend send → `lit_outreach_history` +
`lit_leadcrm_log_email_sent`), `lead-crm-enrich-contacts` (qualification gate → Apollo discovery →
`enrich-contact-orchestrator` → `lit_contacts`), `lead-crm-find-leads` (Apollo company search with
dup-detection against existing leads), `lead-crm-qualify-company` (OpenAI agent + web search,
`safe_to_enrich = qualified && confidence ≥ 0.75`), `lead-crm-attio-import`.

**Harvey relevance:** this is Harvey's CRM substrate, essentially complete. Harvey can operate it
entirely through the existing RPCs with a service-role client (SECURITY DEFINER fns check
`auth.uid()` — a service-role caller bypasses RLS but RPCs raising on `is_lead_crm_member(null)`
means Harvey should either (a) run as a dedicated "Harvey" user added to `lit_lead_crm_members`,
or (b) write via service-role direct table access + explicit activity rows. **(a) is cleaner** —
every activity row then carries `actor_user_id = harvey_user_id`.

### 2.2–2.3 Campaigns + dispatch

Schema: `supabase/migrations/20260424000000_create_lit_outbound_schema.sql` plus phase migrations
(`20260504200000` roster, `20260504220000` throttle/suppression, `20260504230000` click/AB,
`20260519130000` email prefs, `20260605120200` org RLS, `20260611141500` conditionals).

- `lit_campaigns` (`org_id`, `user_id`, `status`, `channel`, `send_timezone`, `metrics` jsonb —
  `metrics.sender_account_id` overrides the sending mailbox).
- `lit_campaign_steps` (`step_order` unique per campaign, `channel`/`step_type` email|wait|linkedin|call,
  `subject_b` for A/B, `delay_days/hours/minutes`, `time_of_day_local`, `weekdays_only`).
- `lit_campaign_contacts` (unique `(campaign_id, email)`, `current_step_id`, `next_send_at`,
  `merge_vars`, status lifecycle `pending→queued→sent→delivered→opened→clicked→replied|bounced|unsubscribed|failed|skipped|completed`,
  hot index `lit_campaign_contacts_due_idx`).
- `lit_conditional_followups` (jsonb `condition`, e.g. `clicked_url_no_meeting`, processed by
  `process-conditional-followups` every minute).

**Dispatcher** `supabase/functions/send-campaign-email/index.ts` (cron `campaign-dispatcher-tick`,
`* * * * *`, `20260520_campaign_dispatcher_cron.sql`): batch ≤25 due recipients →
`pg_try_advisory_xact_lock` per recipient (double-send guard) → **consent gate**
(`lit_recipient_consent`) → **suppression gate** (`lit_email_suppression_list`,
`lit_email_preferences`, `lit_email_suppression_status` RPC; reasons incl. `converted` = already a
customer) → sender resolution (campaign override → primary mailbox → newest connected; Resend
restricted to a super-admin allowlist) → **throttle/warmup** (`_shared/outreach-throttle.ts`,
30-day ramp 10→150/day) → click-URL rewrite (`lit_outreach_links` slugs → `redirect-click`) →
A/B pick → merge vars (`_shared/merge-vars.ts`) → pixel inject → send (Resend | Gmail API |
MS Graph via `_shared/mailbox_tokens.ts`) → append `lit_outreach_history` (unique
`(provider, provider_event_id)`) → advance cursor via `_shared/step_schedule.ts` (DST-aware
local-time snapping). `DISPATCH_DRY_RUN` env walks the whole pipeline without provider calls —
**ideal for Harvey testing**.

LinkedIn steps: dispatcher writes `event_type='approval_required'` and parks the recipient at
`pending_approval`; a human approves via the `LinkedInApprovalQueue` UI / `unipile-outreach`.

Frontend: `frontend/src/features/outbound/` — builder (`PlayCard`, `StepCard`, `StepInspector`,
`LaunchButton`), enrollment (`AudiencePickerDrawer` + `ConsentAttestationCheckbox` — writes
`lit_recipient_consent`), analytics (`CampaignKpiHero` over `lit_campaign_funnel_v`), exit rules
(`ExitConditionsPanel`, `lit_effective_exit_rules` RPC), `LinkedInApprovalQueue`.

### 2.4 Canonical schema & identity

- `lit_companies` (`20260115001152_create_lit_schema_part1.sql`): identity = unique
  `(source, source_company_key)`; canonical fields `name`, `normalized_name`, `domain`, `website`,
  Claude output in `enrichment_params` jsonb.
- `lit_contacts` (`20260115001208_create_lit_schema_part2.sql`): identity = unique
  `(source, source_contact_key)`; `company_id` FK; `apollo_person_id`, email/phone/linkedin/title.
- Dedup: `_shared/canonical_name.ts` (legal-suffix stripping), Claude `normalize-company`
  (domain/HQ inference), per-source upsert in enrichment fns. **No cross-source merge table** —
  the same real-world company can exist once per source; `lit_admin_leads.company_id` +
  `source_company_key` is the practical join point. Harvey should key its dedup/suppression on
  **email (citext) and domain**, mirroring `lit_admin_leads` and `lit_email_suppression_list`.

### 2.5 Edge-function conventions (Harvey must follow)

- `_shared/auth.ts`: `requireUser(req)` → `{user, admin, userClient} | 401`;
  `requireUserOrService(req)` → user JWT **or** bare service-role key;
  `isUserAdmin(admin, userId)` → `{isOrgAdmin, isPlatformAdmin}` (checks `org_members.role` and
  `platform_admins`); `resolveUserOrg`.
- `_shared/logger.ts`: `createLogger(fnName)` — `error` always → Sentry, `warn` with `err` field → Sentry;
  tags `user_id/org_id/request_id`. No-op without `SENTRY_DSN`.
- `_shared/cron_auth.ts`: `verifyCronAuth(req)` — `X-Internal-Cron` header must equal
  `LIT_CRON_SECRET` (stored in Supabase Vault, injected by pg_cron `net.http_post` calls).

### 2.6 Gmail/Outlook + inbox

Two OAuth generations exist: `email-oauth-start`/`email-oauth-callback` (older) and
`oauth-gmail-start/callback` + `oauth-outlook-start/callback` (current, HMAC-signed state via
`_shared/oauth-state.ts`). Accounts → `lit_email_accounts` (per-user, `is_primary`, warmup + cap
columns); tokens → `lit_oauth_tokens` (**service-role-only RLS, but plain-text at rest — flagged
Phase E hardening item** in the 20260424 migration). Refresh in `_shared/mailbox_tokens.ts`
(`getMailboxAccessToken`, marks account `error` on `invalid_grant`).

**`sync-inbox` is a real sync engine** (contrary to older memory notes): cron every 5 min
(`20260504250000_inbox_cron_5min.sql`) + user "Sync now"; Gmail incremental via
`users.history` from stored `gmail_history_id` (90-day first backfill, ≤150 msgs/mailbox/run);
Outlook delta query (`metadata.graph_delta_link`); idempotent upserts into `lit_email_threads`
(unique `(email_account_id, provider_thread_id)`) and `lit_email_messages` (unique
`(email_account_id, provider_message_id)`); tags threads campaign/reply/direct by correlating
`lit_outreach_history.provider_event_id` and RFC-5322 `In-Reply-To`/`References`
(`_shared/reply-correlate.ts`); associates `company_id` via `lit_contacts.email`.

Push path: `reply-receiver` handles **Gmail Pub/Sub** push (OIDC token verified against
`LIT_PUBSUB_AUDIENCE` via `_shared/pubsub_oidc.ts`); a pg_cron job (`email-subscription-renewal`,
`0 */6 * * *`) hits `reply-receiver?action=renew` to renew Gmail watch / Graph subscriptions.
Resend events: `resend-webhook` (Svix HMAC, 5-min replay window; bounce → suppression + recipient
exit) and `resend-inbound-webhook`.

### 2.7–2.8 Unipile / LinkedIn

Migrations `20260817220000_unipile_linkedin_outreach.sql` +
`20260819120000_unipile_linkedin_per_user_scope.sql`; doc
`docs/2026-08-17-unipile-outreach-integration.md`; shared client `_shared/unipile.ts`
(env: `Unipile_API` JSON `{api_key, dsn, webhook_secret}` or `UNIPILE_DSN` +
`UNIPILE_WEBHOOK_SECRET`; **no passwords anywhere — hosted-auth only**).

Tables: `lit_unipile_accounts` (`owner_user_id`-scoped RLS, `use_for_campaigns` /
`use_for_lead_crm` flags, `daily_invite_cap` ≤40 / `daily_message_cap` ≤80),
`lit_unipile_auth_sessions` (15-min HMAC sessions), `lit_linkedin_outreach_actions`
(draft→`pending_approval`→`approved`→`sending`→`sent`, unique `idempotency_key`),
`lit_linkedin_threads`, `lit_linkedin_messages`, `lit_unipile_webhook_events` (unique
`event_key`, durable replay).

**Works today:** per-user connect (hosted link), AI drafting (5 tones via OpenAI Agents SDK in
`unipile-outreach`), human approve, send invite/message via Unipile API, webhook ingestion
(reply → recipient `replied` + halt; relation accepted → `connected`; account status sync).
**Missing:** any *automatic* dispatcher for `channel='linkedin'` campaign steps — the campaign
engine only parks them for approval. Harvey's LinkedIn path = create
`lit_linkedin_outreach_actions` rows (status `pending_approval` initially; auto-approve later
behind a flag) against a designated Harvey-owned `lit_unipile_accounts` row.

### 2.9–2.11 Apollo / Explorium / enrichment

- **Apollo:** `apollo-contact-search` (`/api/v1/mixed_people/api_search`, plan-based preview caps
  5–50), `apollo-contact-enrich` (`people/match` + `bulk_match`, 1 credit/email, 10/phone, gated by
  `lit_consume_credits` RPC), `apollo-job-postings`, `apollo-phone-webhook` (async phone reveal,
  optional HMAC). Env `APOLLO_API_KEY`.
- **Explorium: not integrated.** Only doc references and a dead constant
  (`frontend/src/pages/LeadProspecting.jsx:82`). Any Harvey plan claiming Explorium data is wrong
  until an integration is built.
- **Enrichment:** `enrich-contact-orchestrator` waterfall `["apollo","lemlist"]` (+`tier3-enrichment`
  stub awaiting credentials); `lemlist-enrichment` async jobs (`contact_enrichment_jobs`);
  `lusha-enrichment`/`lusha-contact-search`; `normalize-company` (Claude, `ANTHROPIC_API_KEY`);
  `gemini-enrichment`/`gemini-brief` (`GEMINI_API_KEY`); `pulse-ai-enrich`;
  `enrich-campaign-contacts` (merge-var fill at enrollment). All write `lit_contacts` /
  `lit_companies` and meter via `provider_usage_events`.
- Lead-CRM path adds the **qualification gate** (`lead-crm-qualify-company`) before any credit spend.

### 2.12 Timeline / conversation / reply records

| Table | Records |
|---|---|
| `lit_outreach_history` | Every outbound/engagement event: `sent/opened/clicked/replied/bounced/complaint/unsubscribed/failed/skipped/consent_missing/suppressed/approval_required/…`; append-only; idempotent on `(provider, provider_event_id)`. |
| `lit_lead_activity` | Lead-CRM native activities (stage_change, note, touch, email_sent, added_to_campaign, …). |
| `lit_email_threads` / `lit_email_messages` | Full inbound+outbound conversation bodies per connected mailbox. |
| `lit_resend_events`, `email_webhook_events` | Provider webhook raw events (folded into the lead timeline RPC). |
| `lit_linkedin_threads` / `lit_linkedin_messages` | LinkedIn conversations via Unipile. |

`lit_leadcrm_lead_timeline(p_lead_id)` unions all of the above (plus `lit_usage_ledger`,
`lit_activity_events`, `lit_demo_invites`, `lit_lead_magnet_events`) — Harvey's conversation agent
can read one RPC to get full context per lead.

### 2.13 Usage ledger

- `lit_usage_ledger` (`20260427100000_usage_enforcement.sql`): `org_id, user_id, feature_key,
  action_key='consume', quantity, period_start/end, metadata` — plan-quota accounting, service-role
  writes, `check_usage_limit`/`get_entitlements` SQL fns read it.
- `provider_usage_events` (`20260814250000`): `provider, operation, status, credits_consumed,
  estimated_cost_usd (from provider_pricing), cache_hit, trigger_type, source, metadata` — cost
  accounting. API: `recordProviderUsage()` in `_shared/provider_ledger.ts` (never throws).
- **Harvey metering:** every Harvey op should call `recordProviderUsage` with
  `trigger_type: TRIGGER_TYPES.SYSTEM` (or a new `AGENT` constant) and `source: "harvey"`, plus a
  per-run LLM-token counter on the run row (see §5). Add Harvey operations to
  `PROVIDER_OPERATIONS` in `_shared/provider_operations.ts`.

### 2.14 Feature flags

`lit_feature_flags` (`20260513150000`): `key PK, scope ('per-plan'|'global'), free/growth/scale/enterprise
booleans, global_kill, rollout 0-100, owner, metadata`. Read RPC `lit_provider_flag(p_key)`
(`20260814250200`): `coalesce(not global_kill, true)` — **fails OPEN** (missing row ⇒ enabled).
Writes: `lit_admin_set_flag()` (superadmin, audited). Constants pattern: `PROVIDER_FLAGS` in
`_shared/provider_operations.ts`; helper `isProviderEnabled()` in `_shared/provider_ledger.ts`
(also fails open).

**For `harvey_internal_agent` the fail-open semantics are wrong** (an internal autonomous sender
must default OFF). Convention-compliant fix: insert the flag row with `global_kill=true` in the
same migration that creates it, and have the Harvey controller do an explicit
`select global_kill from lit_feature_flags where key='harvey_internal_agent'` (or a small
fail-closed helper `isInternalAgentEnabled()`), treating *missing row = disabled*.

### 2.15 Auth / RLS / internal-only gating

- Platform level: `platform_admins` table; `isUserAdmin()` in `_shared/auth.ts`.
- Workspace level: `org_members` (`role owner|admin|member`, `status`), org-scoped RLS via
  `EXISTS (select 1 from org_members where org_id = … and user_id = auth.uid())`.
- **Internal-only template = the Lead CRM model:** membership table + `is_lead_crm_member()` /
  `is_platform_admin()` SECURITY DEFINER helpers, RLS `USING (is_lead_crm_member(auth.uid()))`,
  edge fns re-check membership after `requireUser`. Harvey admin surfaces should reuse exactly
  this (`is_lead_crm_member` gate for read, `is_platform_admin` for control actions).

### 2.16 Audit / jobs / cron

- Audit: `security_audit_logs` (org-scoped actions). `admin-audit-export` fn exists in the tree
  (**UNVERIFIED** whether wired/deployed). No global `lit_events_audit` table found in migrations.
- Run-style tables (precedents to copy): `lit_saved_company_refresh_runs`
  (`started_at/finished_at/processed_count/error_count/credits_used/notes`), `lit_ingestion_runs`,
  `contact_enrichment_jobs`, and the **async start-and-poll pattern** in
  `company-relationship-intel` (`lit_company_relationship_intel.research_status`
  `ok|pending|error`, 5-min pending-staleness guard, 7-day cache, UI polls).
- pg_cron inventory (from migrations; names/schedules verified where listed):
  `campaign-dispatcher-tick` (`* * * * *`), `conditional-followups-tick` (`* * * * *`),
  inbox sync (`*/5 * * * *`), mailbox daily/hourly counter resets (`0 0 * * *` / `0 * * * *`),
  `email-subscription-renewal` (`0 */6 * * *` → reply-receiver renew), `pulse-refresh-tick-daily`
  (`0 3 * * *`), `pulse-bol-tracking-daily` (`0 6 * * *`), `lit-supplier-aggregates-rebuild`
  (`30 3 * * *`), `lit-admin-leads-sync-15m` (`*/15 * * * *`), plus pulse digest/drayage,
  attio-stalled-deals, crm-deal-reminders, lifecycle-nudge, subscription-email crons
  (schedules **UNVERIFIED** — confirm with `select jobname, schedule, command from cron.job` on prod).

---

## 3. ASCII diagrams — Harvey mapped onto LIT

### 3.1 Control loop (heartbeat → Supabase)

```
 pg_cron: harvey-heartbeat (*/15 * * * *)
      │  net.http_post + X-Internal-Cron: LIT_CRON_SECRET
      ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ edge fn: harvey-controller            (NEW)                 │
 │  1. flag gate: lit_feature_flags['harvey_internal_agent']   │
 │     (fail CLOSED — missing row = off)                       │
 │  2. quiet-hours + daily budget check (lit_agent_runs sums)  │
 │  3. read pipeline counts:                                   │
 │       lit_admin_leads by stage, unread lit_email_messages,  │
 │       due lit_campaign_contacts, pending linkedin actions   │
 │  4. DETERMINISTIC priority (from reference Harvey):         │
 │       handle_replies > send > write_campaign > prospect     │
 │       > idle/analyze                                        │
 │  5. insert lit_agent_runs (status='running')                │
 │  6. invoke worker fn (harvey-worker) or inline sub-agent    │
 │  7. finish run row: status, counts, tokens, cost, log jsonb │
 └───────┬─────────────────────────────────────────────────────┘
         │ writes only through EXISTING surfaces:
         ▼
   lead-crm RPCs · lit_campaigns/steps/contacts · unipile actions
         ▲                                   ▲
  webhooks (async inputs):            5-min sync-inbox +
  resend-webhook · unipile-webhook    reply-receiver (Pub/Sub)
```

### 3.2 Lead sourcing flow (reuse: lead-crm-find-leads path)

```
 harvey-controller (action=prospect)
   │
   ├─► Apollo search        supabase/functions/lead-crm-find-leads (logic reuse)
   │     APOLLO_API_KEY, mixed_people/api_search, dup-check vs lit_admin_leads
   ├─► Qualification gate   lead-crm-qualify-company
   │     lit_lead_company_qualifications cache (30d TTL)
   │     only proceed when status='qualified' AND confidence ≥ 0.75
   ├─► Create lead          rpc lit_leadcrm_create_lead / _from_company
   │     (as Harvey user → activity actor_user_id = harvey)
   ├─► Enrich contacts      lead-crm-enrich-contacts → enrich-contact-orchestrator
   │     Apollo → Lemlist → (tier3 stub); writes lit_contacts
   └─► Meter                recordProviderUsage(source:'harvey') + lit_agent_runs counters
```

### 3.3 Research flow

```
 harvey-controller (per new lead)
   ├─ lit_leadcrm_company_snapshot(lead)      ← cached shipment intel, 0 credits
   ├─ lit_leadcrm_recognize_company(lead)     ← 0 credits
   ├─ company-relationship-intel (async)      ← start-and-poll: research_status pending→ok
   ├─ gemini-brief / generate-brief           ← talking points
   └─ persist digest → lit_agent_knowledge (NEW) + lit_leadcrm_add_note(lead)
```

### 3.4 Campaign creation via the EXISTING engine (internal scope marker)

```
 harvey-controller (action=write_campaign)
   │  LLM writes sequence (anti-AI-tell rulebook from HARVEY_REFERENCE_REVIEW)
   ▼
 insert lit_campaigns   { org_id: LIT internal org, user_id: harvey_user,
                          metadata: { internal_agent:'harvey' } }   ◄── scope marker
 insert lit_campaign_steps (email steps + delays; linkedin steps allowed but park at approval)
 insert lit_campaign_contacts (email unique per campaign; merge_vars filled)
 upsert lit_recipient_consent (source:'harvey_internal')  ◄── REQUIRED or dispatcher skips
   │
   ▼  no new dispatcher needed — campaign-dispatcher-tick picks it up next minute
```

### 3.5 Email dispatch path (100% existing)

```
 pg_cron * * * * * → send-campaign-email
   ├─ advisory lock per recipient (no double-send)
   ├─ consent gate (lit_recipient_consent)
   ├─ suppression gate (lit_email_suppression_list, lit_email_preferences,
   │                    lit_email_suppression_status: unsub/bounce/complaint/converted)
   ├─ sender = harvey mailbox (lit_email_accounts row owned by harvey_user;
   │           campaign.metrics.sender_account_id pins it)
   ├─ throttle + 30-day warmup ramp (outreach-throttle.ts)
   ├─ click rewrite → lit_outreach_links → redirect-click
   ├─ pixel → email-pixel
   ├─ send: Gmail API (harvey@logisticintel.com OAuth) or Resend (allowlist)
   └─ lit_outreach_history(sent) → advance next_send_at (step_schedule.ts)
```

### 3.6 LinkedIn dispatch path (Unipile)

```
 harvey-controller (linkedin step due / connect target)
   │
   ▼
 insert lit_linkedin_outreach_actions
   { unipile_account_id: HARVEY-owned lit_unipile_accounts row,
     action_type: invite|message, status: 'pending_approval',
     idempotency_key: lead/step UUID }
   │
   ├─ Phase A (launch): human approves in LinkedInApprovalQueue → unipile-outreach?action=send
   ├─ Phase B (later, flag-gated): harvey auto-approves within daily_invite_cap/daily_message_cap
   ▼
 Unipile API send → unipile-webhook: reply → lit_linkedin_messages +
 lit_outreach_history(replied) + campaign recipient halted
```

### 3.7 Reply handling (stop-on-reply) — existing, Harvey consumes

```
 inbound email ──► reply-receiver (Gmail Pub/Sub, OIDC aud=LIT_PUBSUB_AUDIENCE)
              └──► sync-inbox (5-min cron, Gmail history / Graph delta)
                      │ reply-correlate.ts: In-Reply-To/References ↔
                      │ lit_outreach_history.provider_event_id
                      ▼
        lit_email_messages(direction='inbound') + thread tagged 'reply'
        lit_campaign_contacts.status='replied', next_send_at=NULL   ◄── sequence halts
                      │
                      ▼
 harvey-controller next tick (action=handle_replies):
   unprocessed inbound msgs on harvey mailbox →
   HARD keyword guards first (opt-out/legal → suppress + never LLM-override)
   → LLM classify (interested / question / not_now / negative)
   → draft reply (send via Gmail API) OR escalate: lit_leadcrm_create_task(owner)
   → lit_leadcrm_set_stage(lead,'Engaged') + add_note
```

### 3.8 CRM stage movement

```
 signal                                  actor        mechanism
 ─────────────────────────────────────   ──────────   ─────────────────────────────
 first outbound sent                     harvey       lit_leadcrm_set_stage → Contacted
 reply received / meaningful click       harvey       set_stage → Engaged
 trial signup (lit_admin_leads.user_id   existing     lit-admin-leads-sync-15m cron +
   linked, trial_started_at)             backfill     funnel timestamps
 subscription active                     existing     stage Subscriber (is_won → status
                                                      'converted'; dispatcher suppresses
                                                      'converted' emails automatically)
 opt-out / disqualified                  harvey       set_stage → Lost + suppression row
 every transition: trg_lit_admin_leads_log_activity logs {from,to} immutably
```

### 3.9 Analytics

```
 pure-SQL, no LLM (Analyst pattern from reference):
   lit_leadcrm_pipeline_summary() / report_funnel(30) / report_by_source(30)
   lit_outreach_history rollups (open/click/reply per campaign, ab_variant in metadata)
   lit_agent_runs (NEW): actions/day, tokens, $ cost, error rate
        │
        ▼
   surfaced in /app/leads ReportsPage + a small "Harvey" admin card;
   optional daily digest email via existing Resend send helpers
```

---

## 4. Schema dependency map (per Harvey capability)

| Harvey capability | REUSES (existing) | NEW needed |
|---|---|---|
| Control loop / heartbeat | pg_cron + `net.http_post` + Vault secret pattern (`20260520_campaign_dispatcher_cron.sql` as template), `verifyCronAuth`, `createLogger` | `harvey-controller` fn, `lit_agent_runs` table, cron migration |
| Prospecting | `lead-crm-find-leads` logic, `apollo-contact-search`, `lit_admin_leads` dedup on citext email/domain, `lit_lead_company_qualifications` gate | none (maybe extract shared Apollo helper) |
| Research / knowledge | `lit_leadcrm_company_snapshot`, `company-relationship-intel` (async pattern), `gemini-brief`, `lit_lead_activity` notes | `lit_agent_knowledge` (persona/product/skill docs + per-lead research digests) — check first: no equivalent exists (`lit_internal_meta` is key-value, too small) |
| Campaign writing | `lit_campaigns/steps/sequences`, merge-vars, A/B columns | none; scope marker = `lit_campaigns.metadata.internal_agent='harvey'` |
| Email sending | entire dispatcher stack (§3.5), `lit_email_accounts` + `lit_oauth_tokens` for harvey mailbox, `lit_recipient_consent`, warmup/throttle | none |
| Suppression | **exists — do NOT create new**: `lit_email_suppression_list`, `lit_email_preferences`, `lit_unsubscribed_emails`/`lit_bounced_emails`/`lit_complaint_emails` via `lit_email_suppression_status()`, `email-unsubscribe` fn | none (Harvey writes `lit_email_suppression_list` rows with `source:'harvey_optout'`) |
| LinkedIn | `lit_unipile_accounts` (add Harvey-owned row), `lit_linkedin_outreach_actions` (+ idempotency_key), `unipile-outreach`, `unipile-webhook`, caps | none for tables; later a flag-gated auto-approve branch in `unipile-outreach` |
| Reply handling | `sync-inbox`, `reply-receiver`, `lit_email_threads/messages`, `reply-correlate.ts`, stop-on-reply, `lit_leadcrm_lead_timeline` | `harvey-worker` reply-classifier branch; a `processed_by_agent_at` marker (column on `lit_email_messages` **or** tracked in `lit_agent_runs.log`) |
| CRM ops | all `lit_leadcrm_*` RPCs as a dedicated Harvey user in `lit_lead_crm_members` | none |
| Metering / budget | `recordProviderUsage` (`source:'harvey'`), `provider_pricing`, `lit_usage_ledger` | LLM token/cost columns on `lit_agent_runs`; new `PROVIDER_OPERATIONS` entries |
| Gating | `lit_feature_flags` + `lit_admin_set_flag`, `platform_admins`, `is_lead_crm_member` template | `harvey_internal_agent` flag row (default killed) + fail-closed check helper |
| Audit | `lit_lead_activity` (per-lead), `lit_outreach_history` (per-send) | `lit_agent_runs.log` jsonb = per-decision audit (LIT has no global agent decision log) |

**Minimal new surface: 2 tables, 1–2 edge fns, 1 flag, 1 cron.**

Proposed `lit_agent_runs` (mirrors `lit_saved_company_refresh_runs` + `research_status` pattern):
`id uuid pk, agent text default 'harvey', action text (handle_replies|send|write_campaign|prospect|analyze),
status text (running|ok|error|skipped), started_at, finished_at, leads_touched int, emails_sent int,
replies_handled int, li_actions int, llm_calls int, llm_tokens int, est_cost_usd numeric,
error text, log jsonb` — RLS: `is_lead_crm_member()` read, service-role write.

Proposed `lit_agent_knowledge`:
`id uuid pk, agent text, kind text (persona|product|skill|lead_research|insight), ref_lead_id uuid null,
slug text, title text, body_md text, metadata jsonb, updated_at` — unique `(agent, kind, slug)`;
RLS `is_lead_crm_member()` read, `is_platform_admin()` write.

---

## 5. Key risks / blockers

1. **Harvey mailbox not connected.** `harvey@logisticintel.com` (or equivalent) must exist as a
   `lit_email_accounts` + `lit_oauth_tokens` row (Gmail OAuth flow) before any email dispatch;
   warmup ramp then throttles it to 10/day for the first 3 days by design. Owner action; cannot be
   done from code. Note `lit_oauth_tokens` are plain-text at rest (pre-existing Phase E risk that
   Harvey inherits and increases exposure of).
2. **No "internal Harvey sender" concept in Unipile.** All `lit_unipile_accounts` are
   `owner_user_id`-scoped humans. Harvey needs a designated account (a real LinkedIn identity —
   likely the founder's or a company page operator) connected under the Harvey user, plus a policy
   decision on whose LinkedIn identity the agent operates. Auto-approve of
   `lit_linkedin_outreach_actions` does not exist and should stay human-gated at launch.
3. **Fail-open flag RPC.** `lit_provider_flag()` returns *enabled* for missing rows. Using it
   verbatim for `harvey_internal_agent` would turn the agent ON by default in any environment where
   the migration hasn't run. Must use a fail-closed check.
4. **Harvey needs a real auth.users identity.** Lead-CRM RPCs are SECURITY DEFINER on
   `auth.uid()`; the campaign dispatcher and consent/ownership columns all expect a `user_id`.
   Create a dedicated Harvey user, add to `lit_lead_crm_members` (role manager) — do NOT add to
   `platform_admins`. Without it, everything must go service-role-direct and loses actor
   attribution.
5. **Consent gate will silently skip Harvey's recipients** unless Harvey upserts
   `lit_recipient_consent` rows at enrollment (dispatcher hard-skips with
   `event_type='consent_missing'`). Also confirm the internal LIT org row Harvey campaigns will
   live under (org-scoped RLS on `lit_campaigns`).
6. **Explorium does not exist** — any sourcing plan must rely on Apollo (+ Lemlist waterfall) and
   LIT's own shipment/company directory (`lit_leadcrm_search_companies` over the 78k
   broker/forwarder directory — a zero-credit sourcing asset).
7. **No global agent decision log** — `lit_agent_runs` must land in Batch 2 before any autonomous
   action, or Harvey is unauditable.
8. **UNVERIFIED items to check against the live DB before build:** live pg_cron job list
   (`select * from cron.job`), whether `admin-audit-export` is deployed, `lit_ingestion_runs`
   columns, whether the older `email-oauth-*` fn pair is still referenced anywhere, and actual
   Resend-allowlist membership for the Harvey user.

---

## 6. Recommended Batch-2 foundation plan

All items follow existing conventions (fn naming, `_shared` helpers, `verifyCronAuth`, RLS via
`is_lead_crm_member`/`is_platform_admin`, flag via `lit_feature_flags`). No dispatcher, campaign,
or CRM changes required.

**Migrations (one file each, `2026XXXX_harvey_foundation*.sql`):**
1. `lit_agent_runs` + `lit_agent_knowledge` (shapes in §4) + RLS + indexes
   (`started_at desc`, `(agent, kind, slug)` unique).
2. `lit_feature_flags` row: `('harvey_internal_agent','Harvey internal SDR agent', …,
   scope='global', global_kill=TRUE, rollout=0, owner='growth')` — **created killed**.
3. Seed Harvey identity plumbing doc-side only (user creation is an owner action in Supabase Auth;
   the migration adds the `lit_lead_crm_members` row keyed by a `lit_internal_meta`
   `harvey_user_id` entry once known).
4. pg_cron `harvey-heartbeat` (`*/15 * * * *` → `harvey-controller`, Vault
   `LIT_CRON_SECRET` header) — ship this migration LAST, after the controller deploys.

**Edge functions:**
5. `supabase/functions/harvey-controller/index.ts` — `verifyCronAuth` OR
   `requireUser`+`isPlatformAdmin` (manual trigger); fail-closed flag check; deterministic
   `decide_next_action` (handle_replies > send > write_campaign > prospect > analyze); budget +
   quiet-hours from `lit_agent_knowledge` config; opens/closes `lit_agent_runs`;
   `createLogger("harvey-controller")`.
6. `supabase/functions/harvey-worker/index.ts` (or inline in controller for v1) — sub-agent
   implementations calling ONLY existing surfaces: leadcrm RPCs, `lead-crm-qualify-company`,
   `enrich-contact-orchestrator`, campaign-table inserts + `lit_recipient_consent`,
   `lit_linkedin_outreach_actions` inserts, Gmail send via `getMailboxAccessToken`.
   Meter everything via `recordProviderUsage(source:'harvey')`.
7. `_shared/agent.ts` — tiny helper: fail-closed flag check, run open/close, budget query.

**Constants:** add `HARVEY` operations to `PROVIDER_OPERATIONS` and an `AGENT` trigger type in
`_shared/provider_operations.ts`.

**Owner actions (blocking, sequence-ordered):** create Harvey auth user → connect
`harvey@logisticintel.com` Gmail via `oauth-gmail-start` → (optional now) connect a Harvey
LinkedIn identity via `unipile-account` → verify warmup config → flip `global_kill=false` via
`lit_admin_set_flag('harvey_internal_agent', …)` only after a `DISPATCH_DRY_RUN` rehearsal.

**Launch posture:** email steps live behind warmup caps; LinkedIn strictly human-approved;
stop-on-reply and suppression are inherited from the existing engine on day one.
