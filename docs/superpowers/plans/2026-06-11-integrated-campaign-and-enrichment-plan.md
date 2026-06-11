# Integrated Plan — Campaign Page Stabilization + Enrichment Modernization

**Date:** 2026-06-11
**Branch lock:** `claude/review-dashboard-deploy-3AmMD`
**Context:** Launch has been delayed 2 weeks on the campaign page. Today's session shipped 12+ fixes plus reviewed the entire campaign builder code and design surface, plus surfaced enrichment gaps blocking phone-number coverage. This plan captures everything shipped, everything pending, and the queued path to launch-ready.

---

## Section A — What shipped today (12 sub-projects on main)

Each landed on main after preview verification or low-risk additive analysis.

| # | Sub-project | Main SHA | What it solved |
|---|---|---|---|
| 1 | **I** — Tracking pipeline restoration | `7d6e74d5` | redirect-click FK silently rejecting clicks; orphan engagement backfill; FunnelStrip 200% denominator bug |
| 2 | **K** — Activity timeline drawer | `060d8d85` | Page-scroll regression from inline always-on timeline. Now slide-over with Activity (N) header button. |
| 3 | **J** — Schedule persistence | `cd7d3c2e` | `scheduled_start_at` column + LaunchSchedulePicker UI + ScheduleStrip anchor. Schedule no longer "resets to now" on re-login. |
| 4 | **J** layout fix | `11fdd33e` | Wide datetime picker pushed action cluster off layout. Collapsed to button+popover. |
| 5 | **N** — Recompute-trigger NULL guard | `b86265e6` | The trigger I designed in J had no NULL guard; any UPDATE on lit_campaigns with NEW.scheduled_start_at = NULL nulled `next_send_at` for queued recipients. P0. |
| 6 | **Q** — Sparkline fix | `d444b5fa` | 2-point degenerate sparkline rendered a stray blue line in SENT tile. Now gated on `length >= 4 AND variance > 0`. |
| 7 | **P** — 4-day campaign + click-no-book trigger | `cf78f751` | First test campaign for the user's morning send. Added `lit_conditional_followups` table + `process-conditional-followups` edge fn + cron. |
| 8 | Queue-fix hardening | `6aa8ddc1` | Explicit `current_step_id=NULL` at enrollment with inline docs so future refactors can't re-introduce the step-1-skip bug. |
| 9 | Disabled-gate fix | `08ce2e68` | LaunchSchedulePicker was disabled on active campaigns — defeated the entire N-trigger reschedule feature. Now only archived campaigns disable. |
| 10 | Top-bar layout fix | `72514671` | `min-w-[220px]` on title + `whitespace-nowrap` on meta chips + `lg:flex-nowrap` → `2xl:flex-nowrap` so action cluster wraps gracefully. |
| 11 | **IMPL** — Page scroll conversion | `9239011c` | Removed fixed-viewport `h-[calc(100vh-112px)] overflow-hidden`. Page now scrolls naturally; Audience+Composer sticky, Sequence flows with page. |
| 12 | **P0-DataLoss** | `554f6706` | (a) `getCampaignWithDetails` SELECT was missing `delay_minutes`, `subject_b`, `include_signature` → silent A/B + signature loss on edit-load. (b) `handleSave` callback missing `audiencePulseListId` + `senderAccountId` from deps → stale closure. |
| 13 | 5 PM Funnel-Trigger campaign | `1b3bb0f0` | Second campaign with 3 NEW conditional-followup trigger types: `meeting_booked`, `viewed_no_reply`, `not_viewed`. `process-conditional-followups` extended v1 → v2. All 4 smoke tests passed. |

**Real-world acceptance proof:**
- Morning 4-Day Sample Series: evan received Day 1 at exactly 15:00:04 UTC (11:00 AM EDT)
- 5 PM Funnel-Trigger Series: evan received Day 1 at exactly 21:00:02 UTC (5:00 PM EDT)
- Both step advances correctly populated (`next_step_order` increment, `next_send_at` set to next step's anchor)

---

## Section B — Pending dispatched work (status unknown)

These agents were dispatched earlier today and have not yet returned:

| Agent | Mandate | Risk if it never returns |
|---|---|---|
| **L** — Cal.com attendee matching + reply orphan fix | Match meeting bookings via organizer email when attendee doesn't match a sent recipient. Backfill 2 known orphan `meeting_booked` rows. Backfill 1 orphan `replied` row. | KPIs already show Meetings=3 for the test campaign — partial work landed. The L agent may have died mid-flight without a final report. **Action:** assume the visible state is the work-product. Mark complete with the caveat. |
| **M** — Open tracking gap (no `opened` events since May 6) | Investigate why zero opens land in lit_outreach_history. Likely culprit: `send-campaign-email` not requesting Resend tracking, OR webhook silently dropping `email.opened`. | Open rate stays 0% until fixed. Not a launch blocker (the system works without it) but materially degrades the KPI hero. **Action:** dispatch a fresh M agent in week-2. |

---

## Section C — Queued work, in priority order (from user decisions)

### C1 — Sub-project O: Sequence Exit Conditions

**Status:** spec + plan committed at [678f79a3](docs/superpowers/specs/2026-06-11-sequence-exit-conditions-design.md). User-locked picks: org defaults + per-campaign override (Q1=C), Attio webhook push (Q3=A). 11 tasks. **Task 10 simulation matrix is a hard gate** — 7 test scenarios all must PASS or the agent reports BLOCKED.

**Files:** 1 migration, 6 edge fns (3 new: unsubscribe, attio-webhook, recipient-exit-manual; 3 modified: cal-webhook, reply-receiver, resend-events-webhook), 1 send-campaign-email mod, 5 frontend files.

**Implements:** reply/bounce/unsubscribe always-on; meeting-booked + Attio Won-stage default-on togglable; per-campaign override.

### C2 — Enrichment Phase 1: Credit-based plan model (1-2 days)

**Why first:** Apollo phone unlocks are 10× the cost of email unlocks (~$0.50-$2.00 per phone). A $199/mo Growth customer doing 100 phone enriches/day blows through $1,500/mo on Apollo alone — loss-making by ~7×. Phones can't go on until billing reflects the cost.

**Scope:**
- Add a credit ledger column (or extend the existing `plan_caps` model) — credits per enrichment action
- Charge 1 credit for email-only enrichment, 10 credits for email+phone
- Modify `consume_usage` to charge differentially
- Surface remaining credits in the UI
- Plan-cap enforcement at server side prevents accidental phone unlocks

**Files:** 1 migration (credit ledger), `consume_usage` edge fn extension, `useEntitlements` hook + display, billing-webhook integration.

### C3 — Enrichment Phase 2: "Edit Company" affordance (1-2 days)

**Why second:** The actual "can't enrich after updating name/URL" failure mode is that the user's typed corrections in the Apollo panel are **local React state only — never persisted back to `lit_companies`**. Confirmed by grep: zero `lit_companies.update(...)` writing name/domain/website anywhere in the frontend.

**Scope:**
- New `update-company` edge fn (RLS-checked PATCH)
- Editable name/website/industry/headcount fields in `CompanyProfileV2.tsx` header
- "Save these to company profile" button on the Apollo search panel (writes back when the user corrects company data while searching)
- New `lit_activity_events` log entry for company updates (audit trail)

**Files:** 1 edge fn, 1 frontend page modification, 1 component refactor.

### C4 — Enrichment Phase 3: Apollo async phone + Lusha sync fallback (1-2 days)

**Why third:** depends on C2 (credit model) being in place so phones don't bleed money. The technical work:

**Scope:**
- Modify `apollo-contact-enrich` to send `reveal_phone_number: true`
- Handle Apollo's async response shape (`{ status: "queued", request_id }` instead of `{ person }`)
- New `apollo-phone-webhook` edge fn to receive async phone delivery
- Update the `lit_contacts` row by `apollo_person_id` when the webhook fires
- UI: "Phone pending" pill that flips to the number when the webhook lands
- Wire `lusha-enrichment` edge fn (currently orphaned, queries non-existent tables — needs rewrite) as a Tier-2 fallback when Apollo returns no_match OR no phone
- Charge 10 credits per phone unlock (per C2 model)

**Files:** 1 new edge fn (apollo-phone-webhook), 2 edge fn rewrites (apollo-contact-enrich, lusha-enrichment), 1 frontend UI update.

### C5 — Sub-project J.2: Step-level time-of-day + weekday-skip (deferred from J)

**Scope:** Add `time_of_day_local` + `weekdays_only` columns to `lit_campaign_steps`. Step 2 "Day 2 at 9 AM" is currently expressed as cumulative-offset delays — works but cumbersome. This makes it native.

---

## Section D — Code review backlog (from CR agent — beyond what we fixed today)

P0s NOT yet fixed (the data-loss ones in Section A #12 are done):

- **P0-2:** `localId` collision with DB UUID — separate `localId` (uid) from `dbId` (DB id) in BuilderStep model
- **P0-3:** Save flow is non-transactional — wrap in `save-campaign-draft` edge fn that returns atomic ok/err
- **P0-4:** `localInputToUtcIso` (LaunchSchedulePicker) is wrong across DST — replace custom TZ math with `date-fns-tz` or `luxon`
- **P0-6:** useEffect hydration deps include `details` object — refactor to id-keyed ref

P1s (10 surfaced, ranked by impact):

1. **P1-1** — Fixed-viewport layout — DONE (Section A #11)
2. **P1-2** — Auto-save on drawer close silently swallows errors
3. **P1-3** — Manual recipient validation runs at Launch only, not Save
4. **P1-4** — EngagementDrillIn always-mounted → background queries even when closed
5. **P1-5** — useCampaignActivityTimeline fetches unconditionally
6. **P1-6** — Esc doesn't close launch-confirm modal
7. **P1-7** — Fallback open/click/reply rates above realistic B2B numbers (40% open vs. real ~20-25%)
8. **P1-8** — PreviewModal iframe `allow-same-origin` is permissive
9. **P1-9** — senderAccounts filter hides expired accounts entirely
10. **P1-10** — manualEmails stored as freeform JSONB — should be a real table

**Plus hardening:** `eslint-plugin-react-hooks` is installed but NOT wired in `frontend/.eslintrc.js`. Wiring `react-hooks/exhaustive-deps` would have caught P0-1 + likely others at lint time.

---

## Section E — Design review backlog (from DR agent)

DR's "do this week" 3-move list:

- **DR Move 1** — Slim the top bar (1 day): keep only Title + Save + Schedule + Launch; move Preview/Test send/Activity into the StepInspector footer; move industry/tone/persona into PersonaPanel; metadata breadcrumb into its own thin row.
- **DR Move 2** — Kill `overflow-hidden`, page scroll — DONE (Section A #11)
- **DR Move 3** — One semantic palette + one chip primitive + one button primitive (1 day): create `<Chip variant>` and `<ToolbarButton variant>`, kill 5 chip variants + 4 button shapes, kill rainbow sequence rail, kill cyan PersonaPanel glow.

Plus next-week:
- **DR Move 4** — Draft-mode KPI hero rewrite (0.5 day): when status=draft, replace 6 fallback-estimate tiles with one hero card
- **DR Move 5** — Type ramp (0.5 day): collapse 9 text sizes to a 5-step scale (11/12/14/16/22)

---

## Section F — Verification gates (live tomorrow)

These trigger automatically based on `next_send_at`. I will query the DB after each to confirm:

| When (UTC) | What fires | Acceptance |
|---|---|---|
| 2026-06-12 13:00 | 5 PM Campaign Day 2 to evan + vraymond | Both `last_sent_at` populated; both advanced to step 3 with `next_send_at = 2026-06-12 19:00 UTC` |
| 2026-06-12 15:00 | Original 4-Day Series Day 2 to evan (next_send_at from morning enrollment + 1d delay) | `last_sent_at` populated; advance to step 3 |
| 2026-06-12 19:00 | 5 PM Campaign Day 3 to evan + vraymond | Both advance to step 4 with `next_send_at = 2026-06-13 14:00 UTC` |
| 2026-06-13 14:00 | 5 PM Campaign Day 4 to evan + vraymond | Final step; status=completed after send |
| Anytime evan books a Cal.com meeting | meeting_booked trigger enrolls in "Meeting Confirmation" follow-up | New recipient row in follow-up campaign |
| 2026-06-12 21:00 | viewed_no_reply trigger evaluates 5 PM Campaign recipients | If evan opened but didn't reply → enrolled in Soft Re-engage |
| 2026-06-13 21:00 | not_viewed trigger evaluates 5 PM Campaign recipients | If recipient never opened → enrolled in Subject Line Retry |

---

## Section G — Sequencing for the next 5 working days

| Day | Work |
|---|---|
| **Today (rest of day)** | Standby on Section F gates as they fire |
| **Day +1 (tomorrow)** | Dispatch Sub-project O (C1). Verify Section F's tomorrow gates. |
| **Day +2** | If O passes simulation matrix, merge. Dispatch Enrichment Phase 1 (C2). |
| **Day +3** | Enrichment Phase 1 finishes. Dispatch Phase 2 (C3). |
| **Day +4** | Phase 2 finishes. Dispatch Phase 3 (C4). |
| **Day +5** | Phase 3 finishes. Review the CR/DR backlogs and pick next week's work. |

**Launch readiness target:** end of Day +5. By then:
- Sequence exit conditions live (C1)
- Phone numbers in enrichment with credit-based billing (C2+C3+C4)
- All P0-DataLoss bugs fixed
- Page-scroll layout shipped
- Tracking pipeline + drawer + persistence all verified in real-world sends

---

## Section H — What I am NOT proposing

To prevent scope creep before launch:

- **No campaign builder refactor** to .tsx + useReducer (P2-3, P2-3). CR flagged it as right-direction; it's a 1-2 week project. Do it AFTER launch.
- **No multi-provider enrichment orchestrator** (CR/Enrichment Tier-3). Apollo + Lusha + cost-gating is enough for launch.
- **No mobile responsive design pass.** The page below 1024px is not designed for; this is acceptable for an enterprise B2B tool. Address only if real user feedback demands.
- **No real-time collaborative editing.** Stage gates are good enough.
- **No analytics SDK migration.** Sentry covers what we need today.

---

## Section I — Risks I want flagged in CEO review

1. **The dispatcher dry-run sent a real email to vraymond@logisticintel.com 23 minutes before the intended 5 PM send.** The agent chose not to reset (would have caused a duplicate). vraymond's day-1 send is now ~23min off-cadence. Not a regression but a real-world artifact of the verification pattern.
2. **0 opens have been recorded in lit_outreach_history since May 6.** Until Sub-project M ships, Open Rate KPI is structurally 0% — a credibility leak in the dashboard.
3. **There is no test coverage on CampaignBuilder.jsx.** The save flow most likely to regress has zero automated tests. Recommend the highest-ROI Vitest+RTL test (create-mode → fill step → save → assert API sequence) as the first thing after launch.
4. **`eslint-plugin-react-hooks` is installed but not wired.** Both P0s in Section A #12 would have been caught at lint time if it was configured. Wiring it should be a P0 hardening task.
5. **The schedule edit semantic** (changing scheduled_start_at on an active campaign shifts the WHOLE sequence) does not match the user's mental model ("fire the next step at this new time"). This is a UX gap — needs a UI affordance and/or documentation.

---

## Acceptance

- [ ] CEO review (this plan) approves the sequencing in Section G
- [ ] Sub-project O simulation matrix all-7-pass before merge
- [ ] Phase 1 (credits) ships before Phase 3 (phones) — protects margins
- [ ] Section F real-world gates all fire correctly
- [ ] No further direct-to-main commits without preview-deploy verification
