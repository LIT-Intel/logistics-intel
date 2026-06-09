# Conditional Sequences (Engagement-Driven Branching) — Architecture Spec

**Date:** 2026-06-09
**Sub-project:** G (Round 2 — major feature, architecture-only)
**Status:** Architecture spec ONLY. No implementation plan, no code, this turn.
**Why architecture-only:** This is a multi-week feature surface that competitors (Apollo, Outreach, Salesloft) charge enterprise tiers for. It deserves a real design discussion before plan + execute. Spec produced now so the next session can move directly to plan + execute or revisit decisions with fresh context.

---

## Problem

Today's sequences are linear: every recipient receives every step in order, with fixed time delays. From the user (2026-06-09):

> "Should't our sequences also include an action based on the user activity with the email? example, if the user open the email and never took an action then the a sequence email send a follow up based on that action same for click, opened 2 times or more etc. this allows us to run a clean funnel based on actual user actions."

**Three structural gaps in the current linear model**:

1. **No branching** — every recipient gets every step regardless of whether they opened/clicked/replied
2. **No exit conditions** — replied recipients still get follow-ups unless manually paused (creates spammy threads)
3. **No engagement-based escalation** — a recipient who clicked twice deserves a different cadence than one who never opened

This spec proposes a state-machine layer on top of the existing `lit_campaign_contacts` + `lit_outreach_history` plumbing. Designed to ship in 3 phases (each independently valuable) so the user can deliver value incrementally without a 2-week dark period.

---

## Vocabulary

| Term | Definition |
|---|---|
| **Step** | A single action in a sequence: email, LinkedIn touch, call task, wait |
| **Trigger** | A condition that, when true, advances/branches/exits a recipient |
| **Branch** | A non-linear path through the sequence based on a trigger (e.g. "if clicked, go to step 5; else go to step 3") |
| **Engagement signal** | A row in `lit_outreach_history` with `event_type ∈ {sent, opened, clicked, replied, bounced}` |
| **Path** | The ordered sequence of steps a specific recipient took (may differ from the campaign's master sequence) |
| **Goal** | A terminal state for a recipient (e.g. "replied", "meeting booked", "opted out") that exits them from further sends |

---

## Phase 1 — Exit triggers (smallest, biggest immediate value)

**Scope**: 4 hard exit conditions that pause a recipient from further sends in a campaign. No UI changes to the sequence editor; happens automatically via dispatcher pre-check.

| Exit trigger | Source | Behavior |
|---|---|---|
| **Replied** | `lit_outreach_history.event_type='replied'` (from `reply-receiver`) | Pause this recipient. Set `lit_campaign_contacts.status='exited_replied'`. Don't send remaining steps. |
| **Unsubscribed** | `lit_email_preferences.unsubscribed_all=true` | Already handled by existing suppression check. Add an explicit `exit_reason='unsubscribed'` audit row. |
| **Bounced** | `lit_outreach_history.event_type='bounced'` | Pause this recipient. Set `lit_campaign_contacts.status='exited_bounced'`. Don't waste sends on a bad address. |
| **Goal reached (manual)** | Admin marks recipient as "meeting booked" in CRM (Attio) | Pause this recipient. Set `lit_campaign_contacts.status='exited_goal_reached'`. Surfaces via Attio webhook → existing `attio-sync` infra. |

**Implementation surface**:
- New column `lit_campaign_contacts.exit_reason text NULL`
- Extend `lit_campaign_contacts.status` CHECK constraint to include the new exit states
- `send-campaign-email` dispatcher: before each send, check if the recipient has any exit-trigger row in their history (replied/bounced) — if so, mark exit + skip
- Attio webhook handler updates `lit_campaign_contacts.exit_reason='goal_reached'` when a meeting is booked

**Scope size**: ~1-2 days. One migration + dispatcher pre-check + Attio webhook extension. Ships independently.

---

## Phase 2 — Branching steps (sequence editor + engagement-driven path)

**Scope**: Sequence editor learns about "if/else" branches. Recipients fork down different paths based on engagement signals at branch points.

**New step types** (added to existing `lit_campaign_steps.step_type` enum):

| New step type | Behavior |
|---|---|
| `branch_on_open` | At this point in the sequence, branches recipients: opened any prior email → path A; else → path B |
| `branch_on_click` | Same shape but for click events |
| `branch_on_reply` | Same shape but for reply events (often combined with Phase 1 exit, this is a softer "did they engage at all" check) |
| `wait_for_engagement` | Hybrid: wait up to N days for an open/click; if it happens, advance to path A; if timeout expires without engagement, advance to path B |

**Data model**:
- `lit_campaign_steps` already has `step_order int` and `step_type text`. Add `branch_true_step_id uuid` and `branch_false_step_id uuid` (FKs to other steps in the same campaign). Linear steps leave both NULL → default behavior is "advance to step_order + 1".
- For `wait_for_engagement`: add `wait_for_event_type text` and `wait_for_max_days int` columns.

**Path tracking**:
- `lit_campaign_contacts.current_step_id` already exists — branch evaluator just sets it to the chosen branch_true/branch_false target
- New table `lit_campaign_contact_paths(contact_id uuid, step_id uuid, entered_at timestamptz, exited_at timestamptz, exit_reason text)` for audit — records every step a recipient hit, when, and why they left

**Sequence editor UI**:
- `TimelineCanvas` learns to render branches as a tree instead of a line: when a step has non-null `branch_true_step_id`, render two outgoing arrows ("if YES" / "if NO") leading to the respective target steps. Layout becomes a DAG, not a list.
- `StepInspector` gets new fields for branch step types: "Branch on what?" (open/click/reply), "If YES go to:" (dropdown of other steps), "If NO go to:" (dropdown).
- New step palette item: "Branching point" with the 3 condition types.

**Scope size**: ~5-7 days. Data model + dispatcher branch evaluator + editor UI (DAG rendering is the chunkiest piece). Depends on Phase 1.

---

## Phase 3 — Advanced engagement triggers (multi-event rules)

**Scope**: Triggers that fire based on aggregated/temporal engagement, not just single events.

| Trigger | Example use case |
|---|---|
| **Opened N or more times** | "Opened 2x but didn't click → send a more direct CTA email" |
| **Clicked specific link** | "Clicked the pricing page link → escalate to sales-rep call task" |
| **Inactive for X days** | "No engagement for 7 days → exit with `exit_reason='cold'`" |
| **Reply sentiment positive/negative** | "If reply contains 'interested' → mark engaged; if 'remove me' → exit. Needs LLM sentiment classification (cheap GPT-4o-mini call)." |
| **Multi-step composite** | "Opened email 1 AND clicked email 2 link → fast-track to step 7" |

**Data model**:
- Extend `lit_campaign_steps` with `trigger_rule jsonb` for advanced rules. Shape: `{ kind: 'opened_n_times', n: 2 }` or `{ kind: 'inactive_for_days', days: 7 }` etc.
- New `lit_engagement_rules_evaluator` Postgres function (or edge fn cron) that runs every ~5 minutes, evaluates triggers against `lit_outreach_history`, and advances/exits recipients accordingly.

**Sequence editor UI**:
- Branch nodes get a "Rule builder" panel with the trigger kinds + parameters. Visual rule chips: `[Opened ≥ 2x] AND [Last 7 days]`.

**Reply sentiment classification**:
- New edge fn `classify-reply-sentiment` that calls OpenAI `gpt-4o-mini` with the reply body, returns `{ sentiment: 'positive' | 'negative' | 'neutral', confidence: 0-1, reason: string }`. Stored on `lit_inbound_emails.sentiment` jsonb.
- Cost: ~$0.0005 per reply. For 100 replies/day = $0.05/day per org. Negligible.

**Scope size**: ~7-10 days. Most complex piece because of the multi-event rule evaluator + sentiment classification + DAG editor with conditional logic.

---

## Phased ship plan

| Phase | Scope | Estimated effort | Customer value |
|---|---|---|---|
| **1** | Exit triggers (replied/unsubscribed/bounced/goal-reached) | 1-2 days | High — stops spam-after-reply problem immediately |
| **2** | Branching steps (open/click/reply forks) | 5-7 days | Medium-high — enables true funnel-based outreach |
| **3** | Advanced engagement triggers (multi-event, sentiment) | 7-10 days | Premium — competitive parity with Apollo/Outreach |

**Total realistic effort**: ~2-3 weeks of focused work, broken into 3 shippable phases.

---

## Architectural decisions surfaced

1. **State machine vs. evaluator cron** — recommend evaluator cron. Easier to reason about, easier to debug, no per-event-write hot path concerns. Trade-off: 5-minute latency on triggers (acceptable for cold outreach cadence).

2. **DAG editor library** — recommend `react-flow` for the branching editor. Mature, accessible, MIT licensed. Alternative: hand-rolled SVG. Decision deferred to Phase 2 start.

3. **Reply sentiment classification** — recommend OpenAI gpt-4o-mini (already provisioned in this codebase). Fallback to "neutral" if API down. Trade-off: sentiment accuracy ~80-90%; false-negatives could exit warm leads incorrectly. Mitigate with a confidence threshold (e.g. only auto-exit on negative if confidence > 0.85).

4. **Per-recipient path tracking storage** — `lit_campaign_contact_paths` could grow large (one row per recipient per step). At 10k recipients × 10 steps = 100k rows per campaign. Acceptable for Postgres. If it becomes a problem, partition by campaign_id or archive completed campaigns.

5. **Backward compatibility with existing linear campaigns** — every existing `lit_campaign_steps` row has NULL `branch_true_step_id`/`branch_false_step_id`. Branch evaluator default: when both NULL, behave linearly (advance step_order). Zero migration risk.

---

## Out of scope (for all 3 phases)

- A/B variant testing within branches (separate workstream — A/B is orthogonal to branching)
- Recipient-level send-time optimization (when-to-send personalization)
- LinkedIn engagement signals (would require LinkedIn API + 3rd-party tools — out of scope)
- Cross-campaign engagement aggregation ("recipient engaged with campaign A → bump up cadence in campaign B")
- Visual workflow analytics ("what % of recipients went down path A vs B" — comes naturally once paths are tracked, but UI is separate)
- Mobile editor (DAG editor is desktop-only)

---

## Next steps (when ready to implement)

1. Re-read this spec with fresh context
2. Decide Phase 1 ship target (recommend: same week as Sub-project E lands)
3. Invoke `writing-plans` with this spec for Phase 1 only
4. Execute Phase 1 → ship → gather data → iterate
5. Re-spec Phase 2 with learnings from Phase 1 production usage
6. Repeat

This spec is intentionally NOT a plan. It's the architectural foundation. The actual phase-by-phase implementation plans should be authored when each phase begins.
