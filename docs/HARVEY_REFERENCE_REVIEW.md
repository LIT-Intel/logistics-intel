# Harvey Reference Implementation — Full Review

> **Project Harvey, Batch 1.** Source-of-truth review of the open-source `harvey` reference repo
> (cloned at `harvey-reference/`, upstream `github.com/ethanplusai/harvey`, MIT).
> Every later Harvey implementation batch should cite this doc instead of re-reading the reference.
> Reference paths below are relative to `harvey-reference/`.

---

## Executive summary

The reference Harvey is a **single resident Python process** (`python -m harvey`) that runs an infinite
**heartbeat loop** (`harvey/main.py:heartbeat`): wake every N minutes (default 15) → check quiet hours →
check a self-tracked daily LLM-call budget → read pipeline counts from SQLite → pick exactly one
priority action via **deterministic rules, not an LLM** → run the matching sub-agent(s), some in
parallel → log the action → sleep. The priority order is hard-coded in `decide_next_action`:
**handle_replies > send_campaign > write_campaign > prospect > idle(analyze)** — replies always outrank
new outreach, and prospecting only runs when the "new" pool drops below 20.

Five sub-agents share one "Brain": **Scout** (Python does all web search/scraping; the LLM only scores
and personalizes), **Writer** (3-email sequences under a strict anti-AI-tell rulebook), **Sender**
(idempotent deploy to Instantly with persisted provider IDs and daily send caps), **Handler**
(reply classification with hard keyword guards for opt-out/legal that override the LLM, plus a stage
machine), and **Analyst** (pure-SQL analytics + threshold-based insights, zero LLM calls). The Brain
(`harvey/brain.py`) is a subprocess wrapper around `claude -p --dangerously-skip-permissions`; all
persona/product/behavior knowledge lives in `harvey.yaml` + markdown **prompt templates** and
**skill files** that are re-read every cycle, and a **Trainer** auto-generates the config and product
skills by crawling a website.

**Verdict:** the *control architecture* is excellent and carries over almost wholesale — deterministic
decision order, agent separation, idempotent sending, hard reply guards, markdown knowledge files,
SQL analytics, budget/quiet-hour/send caps. The *infrastructure* carries over almost not at all:
SQLite, Playwright LinkedIn login with stored passwords/cookies, Instantly as sender, the Claude CLI
subprocess, filesystem memory, and the parallel CRM/campaign schema must all be replaced with LIT's
Supabase/Postgres, Unipile, LIT's own Gmail/Outlook transport, the existing LIT campaign engine, the
LEAD CRM at `/app/leads`, and edge functions on cron.

---

## Repo map

| Path | Role |
|---|---|
| `harvey/main.py` | Heartbeat loop, deterministic decision, quiet hours, budget gate, backoff, signals |
| `harvey/brain.py` | Claude CLI subprocess wrapper, JSON extraction, prompt/skill loading, usage counter |
| `harvey/state.py` | SQLite state manager: schema migrations, dedup, all queries |
| `harvey/models/*.py` | Pydantic models: `Company`, `Prospect`, `Campaign`/`EmailStep`, `Conversation`/`Message`/`STAGES` |
| `harvey/agents/scout.py` | Prospecting (LinkedIn, web search, team-page scraping, email resolution, scoring) |
| `harvey/agents/writer.py` | Campaign sequence generation |
| `harvey/agents/sender.py` | Idempotent campaign deploy to Instantly |
| `harvey/agents/handler.py` | Reply classification, stage machine, auto-reply, opt-out/escalation guards |
| `harvey/agents/analyst.py` | SQL analytics + insight generation (no LLM) |
| `harvey/trainer.py` | Website crawl → auto-generate `harvey.yaml` + product/competitive skills |
| `harvey/integrations/instantly.py` | Instantly v2 API client (retry/backoff/redaction) |
| `harvey/integrations/linkedin.py` | Playwright LinkedIn automation (login, search, profile scrape) |
| `harvey/integrations/email_finder.py` | Email pattern generation + MX/SMTP/Hunter verification |
| `harvey/integrations/calendar.py` | Placeholder (not implemented) |
| `harvey/config.py`, `harvey.yaml`, `.env.example` | Pydantic-validated YAML config + env secrets |
| `harvey/cli.py`, `harvey/setup.py` | CLI (`install/setup/run/train/dashboard/status`) + interactive wizard |
| `harvey/dashboard.py` | FastAPI + single-file HTML dashboard, process start/stop, `.env` editor |
| `prompts/*.md` | 4 prompt templates: `system`, `scout`, `writer`, `handler` |
| `skills/*.md` | 8 hand-written + 2 auto-generated sales-knowledge files, per-agent mapping |
| `Dockerfile`, `docker-compose.yml` | VPS deployment; mounts `~/.claude` for Max-plan auth |
| `tests/` | pytest coverage of config, models, state (866 lines; no agent/integration tests) |

---

## 1. Heartbeat loop — `harvey/main.py`

**Purpose.** The orchestrator. One process, one loop: Wake → inspect pipeline → prioritized action →
execute agent(s) → record → sleep.

**How it works.**
- `decide_next_action(brain, state, config, summary)` is **pure rules over pipeline counts** — the
  docstring is explicit that this replaces an earlier LLM decision call:

  ```python
  if open_conversations > 0:   action = "handle_replies"
  elif draft_campaigns > 0:    action = "send_campaign"
  elif new_prospects > 0:      action = "write_campaign"
  elif new_prospects < 20:     action = "prospect"
  else:                        action = "idle"
  ```

- `heartbeat()` per cycle: (1) `in_quiet_hours(config)` — timezone-aware, handles midnight-crossing
  windows, sleeps until `seconds_until_quiet_hours_end`; (2) `brain.is_within_budget(max_calls)`
  where `max_calls = 200 * max_daily_claude_percent/100`, sleeps 1h if exhausted; (3) decide;
  (4) execute — builds a task list and runs it with `asyncio.gather(..., return_exceptions=True)` so
  one failing agent never kills the cycle. Handler and Analyst piggyback in parallel on prospect/write
  cycles (Analyst is free — no LLM calls). (5) `state.log_action(action_type=action, agent="main")`
  best-effort; (6) `_interruptible_sleep(interval, stop_event)` — a `wait_for(stop_event.wait())`
  so SIGINT/SIGTERM wake it instantly.
- Consecutive-failure exponential backoff: `60s * 2^(n-1)` capped at 900s.
- `_run_with_signals()` wires SIGINT/SIGTERM to a graceful "finish current work then stop" event;
  second signal exits immediately. `main()` auto-detects first-run (`_needs_setup()` checks for `.env`
  and placeholder `persona.company == "Your Company"`) and launches the setup wizard instead.

**Preserve.**
- **Deterministic pipeline-rules-before-LLM decision order.** This is the single most important idea
  in the repo: the "what should I do next" decision is fully derivable from counts, costs zero tokens,
  and can never be mis-parsed. Keep the exact priority: replies > send > write > prospect > idle.
- Replies always outrank outreach (a waiting human beats a new cold email).
- Refill threshold ("prospect only when new < 20") — pipeline homeostasis, not endless scraping.
- Per-task exception isolation (`return_exceptions=True`) and failure backoff.
- Quiet hours + daily budget as *loop preconditions*, checked before any work.
- Action logging every cycle → complete audit trail.

**Reject.**
- The resident always-on Python process itself, PID files, signal handling, `asyncio` sleep loops.
  LIT has no VPS daemon; nothing should depend on in-process state surviving between cycles.
- Budget tracked as "number of subprocess invocations" proxy — LIT should meter real token/cost usage.

**LIT replacement.** A **Supabase Edge Function invoked by cron** (pg_cron / Supabase scheduled
functions) is the heartbeat: each invocation = one cycle. It reads pipeline counts via SQL (one
`harvey_pipeline_summary` view or RPC), applies the same deterministic priority rules, executes at
most one unit of work (or fans out to other edge functions), writes an `harvey_actions` audit row,
and exits. Quiet hours/budget become rows in a `harvey_settings`/workspace-config table checked at
the top of the function. Backoff = a `next_run_after` timestamp column instead of in-process sleep.

**Affected LIT components.** New edge function (e.g. `harvey-heartbeat`) + cron schedule; new tables
`harvey_actions`, `harvey_settings` (or reuse of existing workspace settings); admin visibility
surface — TODO(LIT-audit): decide whether Harvey status lives in `/app/leads` or a new `/app/harvey`
panel.

---

## 2. Brain — `harvey/brain.py`

**Purpose.** Single LLM gateway for every agent + loader for prompt templates and skill files.

**How it works.**
- `think(prompt, session_id, timeout=300, max_retries=2)` spawns
  `claude -p <prompt> --output-format text --dangerously-skip-permissions` via
  `asyncio.create_subprocess_exec`, with stdin=DEVNULL, hard timeout + kill, exponential-backoff
  retries, and a non-retryable pattern list ("not logged in", "invalid api key", …). Returns `""` on
  unrecoverable failure — every caller tolerates empty. Each successful call runs
  `state.increment_usage()` (a per-day counter row).
- `think_json()` appends "Respond ONLY with valid JSON…" and runs `_extract_json`: strip code fences
  → `json.loads` → fall back to locating the outermost `{...}`/`[...]` in surrounding prose.
- `load_prompt(name, **kwargs)` reads `prompts/<name>.md`, substitutes `{{key}}` variables, and
  **warns on leftover unfilled `{{vars}}`** so template mistakes surface before hitting the model.
- `load_skills_for_agent(agent_name)` concatenates a hard-coded `skill_map` (scout→4 skills,
  writer→5, handler→5, sender→2, linkedin→3) under a `## FOUNDATIONAL KNOWLEDGE` header injected
  into agent prompts.

**Preserve.**
- Single Brain abstraction: one place for retries, timeouts, usage accounting, and JSON coercion —
  agents never talk to the model directly.
- Defensive JSON extraction (fences + outermost-bracket fallback) and "empty string means fail,
  callers degrade" contract.
- The markdown **prompt-template + skill-file** pattern with variable substitution and the
  unfilled-variable warning. Editing behavior without code changes is a core product feature.
- Per-agent skill mapping (each agent only gets knowledge relevant to its job — smaller prompts,
  clearer behavior).
- Usage accounting recorded on every successful call, never allowed to break the response path.

**Reject (hard).**
- **Claude CLI subprocess with `--dangerously-skip-permissions`.** Unsafe (no permission sandbox),
  unbillable, unportable, depends on a logged-in Max-plan CLI on the host. LIT must use the Anthropic
  API (or LIT's existing LLM gateway) with proper keys, model pinning, and structured outputs.
- `--session-id` UUID juggling — meaningless for one-shot `-p` calls even in the reference.
- Skills/prompts loaded from the local filesystem as the canonical copy.

**LIT replacement.** A shared `harveyBrain` module inside edge functions calling the Anthropic
Messages API (JSON mode / tool-use for structured outputs, which removes most of `_extract_json`).
Prompts and skills live in **Postgres tables** (`harvey_prompts`, `harvey_skills`) with versioning,
seeded from markdown files kept in-repo for review; usage logged to a `harvey_llm_usage` table with
real token counts. TODO(LIT-audit): confirm whether LIT already has a central LLM client
(`pulse-ai-enrich` uses one) to reuse rather than a new wrapper.

**Affected LIT components.** All Harvey edge functions; existing AI edge functions
(`pulse-ai-enrich`) as prior art for the API client; new prompt/skill tables + admin editor
(TODO: where skills are edited in the UI).

---

## 3. State manager — `harvey/state.py` (+ `harvey/models/*.py`)

**Purpose.** All of Harvey's memory: companies, prospects, campaigns, conversations, feedback,
actions, usage, processed replies.

**How it works.**
- SQLite (`data/harvey.db`) via `aiosqlite`, WAL mode + busy timeout so the dashboard can read while
  the agent writes. **Linear idempotent migrations** tracked with `PRAGMA user_version` (v1 base
  schema; v2 normalizes emails/domains to lowercase, dedups existing rows, adds partial unique
  indexes `uq_prospects_email`, `uq_prospects_linkedin`, `uq_companies_domain`, and hot-path indexes).
- **Dedup is enforced at the DB level**: `add_prospect`/`add_company` use `INSERT OR IGNORE` and on
  conflict resolve to and return the *existing* row's id. `prospect_exists()` checks email →
  linkedin_url → (first, last, company) case-insensitively.
- Dynamic updates are whitelist-guarded: `_CAMPAIGN_COLUMNS` / `_CONVERSATION_COLUMNS` frozensets
  prevent SQL injection through kwargs.
- `processed_replies(reply_id PRIMARY KEY)` — the idempotency ledger for reply handling.
- Analytics are **computed in SQL**: `get_campaign_stats()` does one LEFT JOIN pass with
  `SUM(CASE WHEN v.intent = 'interested' ...)` per campaign; `get_intent_distribution()`,
  `get_stage_distribution()`, `count_prospects_by_status()` are single GROUP BYs.
- `get_state_summary()` returns the exact dict the heartbeat decision consumes:
  `{prospects: {status: n}, draft_campaigns, active_campaigns, open_conversations, usage_today}`.
- Models: `Prospect` (status: new/queued/contacted/replied/opted_out/lost/…, `score`,
  `personalization_notes`, `email_verified`, normalizing validators, `is_valid()` = name+title),
  `Campaign` (+`instantly_campaign_id`, `sequence` of `EmailStep{step,subject,body,delay_days}`,
  JSON round-trip helpers tolerating corrupt data), `Conversation` (+`thread` of `Message`, `intent`,
  `stage`, `status`), `STAGES` list of 8 pipeline stages.

**Preserve.**
- Identity normalization + **DB-level uniqueness** for dedup keys (lowercased email, normalized
  LinkedIn URL, domain) — Postgres unique partial indexes, same idea.
- The `processed_replies` idempotency ledger pattern.
- Column whitelisting for any dynamic update path (or better: no dynamic SQL at all in LIT — use RPCs).
- SQL-computed analytics (one indexed pass; no LLM, no app-side aggregation loops).
- The compact `get_state_summary()` contract feeding the decision function.
- Linear, append-only, idempotent migrations (LIT already works this way in `supabase/migrations`).
- Status vocabularies: prospect statuses (`new → queued → contacted → replied / opted_out / lost`)
  and the 8-stage conversation ladder are a good starting taxonomy.

**Reject (hard).**
- **SQLite as the database** and the local filesystem as canonical memory (`data/harvey.db`,
  `data/analytics.json`, `data/linkedin_*.json`). Single-machine, no RLS, no multi-tenant.
- **A second CRM.** Harvey's `companies`/`prospects` tables duplicate what LIT already has. Harvey
  must read/write LIT's LEAD CRM entities, not maintain a shadow copy.
- **A second campaign engine.** `campaigns` + `EmailStep` + Instantly IDs duplicate LIT's campaign
  schema.

**LIT replacement.** Supabase/Postgres. Companies/contacts = the LEAD CRM tables behind `/app/leads`
(TODO(LIT-audit): exact table names and RPCs). Campaigns/sequences = LIT's existing campaign engine
tables. New Harvey-specific tables only where LIT has no equivalent: `harvey_actions` (audit),
`harvey_processed_replies` (or reuse inbox message IDs), `harvey_llm_usage`, conversation
`intent`/`stage` columns (extend LIT conversation/inbox entities or add a `harvey_conversation_state`
table). All with RLS scoped to the workspace.

**Affected LIT components.** LEAD CRM schema + RPCs at `/app/leads`; campaign engine tables;
inbox/email message tables (pending sync engine — see `lit-inbox-sync-pending`); new migrations in
`supabase/migrations`.

---

## 4. Scout — `harvey/agents/scout.py`

**Purpose.** Fill the pipeline with ICP-matching prospects without paid data tools.

**How it works.**
- **Key architectural rule (stated in the module docstring): "Python does ALL web searching/scraping.
  Claude only analyzes, scores, and personalizes data that Python already found"** — deliberately
  avoids model refusals on "research real people" and keeps the LLM out of the data-acquisition path.
- Three isolated strategies per cycle (one failing never aborts the others):
  1. `_prospect_via_linkedin` — Playwright search per ICP title×industry (see §10).
  2. `_prospect_via_profile_search` — web search `site:linkedin.com/in "<title>" "<industry>" "<geo>"`,
     parse names from snippet (`"First Last - Title at Company"` regex) or URL slug.
  3. `_prospect_via_company_discovery` — find companies via search + directory scraping
     (g2/clutch queries), scrape `/team`,`/about`,`/leadership`… pages with a defensive card-selector
     heuristic, filter titles by ICP, resolve emails, then batch-score.
- Hardened HTTP layer `_fetch()`: timeouts, retries with exponential backoff + jitter, rotating
  desktop user-agents, `_looks_blocked()` captcha/challenge detection, never raises.
- Budget knobs: `MAX_QUERIES_PER_CYCLE=3`, `MAX_COMPANIES_PER_CYCLE=10`, `MAX_PROSPECTS_PER_CYCLE=25`,
  jittered delays between searches. Search backends in fallback order: Serper API → DuckDuckGo HTML →
  Bing → Google.
- Dedup at three layers: in-cycle `_seen_prospect_keys` (stable key = email > normalized LinkedIn URL
  > name+company), DB `prospect_exists`, and DB unique indexes.
- `_score_contacts()`: every contact first gets a deterministic `_heuristic_score` (base 40, +25 title
  match, +5..20 seniority, +10 industry, +2/+5 email/verified email), then one batched LLM call
  returns `[{index, score, personalization}]`; LLM failure falls back to heuristics — **scoring never
  blocks prospecting**. Contacts below score 30 are dropped; results sorted desc.
- `_resolve_email` wraps `find_email` (§11) and only marks `email_verified` when the domain actually
  has MX records.
- Utility heuristics: `_infer_seniority` (c_suite/vp/director/manager/individual from title),
  `_guess_domain` (strip Inc/LLC → try `.com/.io/.co` with HEAD), `_is_noise_domain` blocklist
  (~50 social/review/jobboard domains), `_domain_to_name`.

**Preserve.**
- **"Deterministic acquisition, LLM only for judgment"** — LIT already has real data (shipment BOLs,
  company DB, `pulse-explore`), so this becomes: SQL/API queries produce candidates; the LLM only
  scores and writes personalization notes.
- Heuristic-baseline-then-LLM-refine scoring with graceful fallback; batch scoring (one call per
  batch, not per prospect); `personalization_notes` persisted on the contact and threaded all the way
  into email merge variables.
- Per-cycle caps and strategy isolation.
- Seniority inference + ICP title matching as cheap pre-filters before spending LLM budget.

**Reject.**
- **All search-engine and website scraping** (DuckDuckGo/Bing/Google HTML scraping, UA rotation,
  block evasion, directory scraping, team-page scraping, domain guessing). Legally gray, brittle, and
  unnecessary: LIT's core asset *is* a prospect database. Scraping Google SERPs from Supabase edge
  functions is also a non-starter operationally.
- LinkedIn scraping via Playwright (see §10 — replaced by Unipile).

**LIT replacement.** Scout becomes a **query planner over LIT's own data**: pull candidate companies
from LIT search/`pulse-explore` (shipment activity, trade lanes, ICP filters), pull/enrich contacts
via LIT's existing enrichment path (`pulse-ai-enrich`) and Unipile for LinkedIn profile data, then
run the preserved score-and-personalize step and upsert into the LEAD CRM. ICP config comes from the
workspace's Harvey settings instead of `harvey.yaml`.

**Affected LIT components.** `pulse-explore` and `pulse-ai-enrich` edge functions (lead-magnet reuse
map already exists); LEAD CRM upsert RPCs; company/shipment search indexes. TODO(LIT-audit): exact
enrichment/contact-finding capabilities currently shipped.

---

## 5. Writer — `harvey/agents/writer.py` (+ `prompts/writer.md`)

**Purpose.** Turn "new" prospects into draft campaigns with a 3-email sequence.

**How it works.**
- Pulls `get_prospects_by_status("new")`, keeps only those with emails, groups them into batches by
  industry (`f"{industry}-outreach"`, capped at 50/batch — Instantly best practice).
- Builds the prompt from `prompts/writer.md` (persona, product, pricing, benefits variables) +
  injected writer skills + a sample of 5 prospects with their personalization notes, and demands a
  JSON array of exactly 3 steps: Email 1 <75 words observation+question **no pitch**, Email 2 <75
  words new angle + proof point (delay 3d), Email 3 <40 words gracious break-up (delay 4d).
- `_parse_sequence()` never raises: unwraps `{"emails": [...]}` wrapper dicts, drops invalid steps,
  clamps delays, forces `steps[0].delay_days = 0`, caps at 5 steps.
- Creates `Campaign(status="draft")` and flips prospects to `queued` so they're never picked twice;
  logs the action.
- `prompts/writer.md` is the **crown jewel of the writing quality**: 17 strict rules (never em dashes,
  never "I'd love to"/"hope this finds you well", never start with I/We, one CTA exactly, lowercase
  2-5-word subjects, word counts "count them"), a spam-filter word ban list, personalization
  requirements ("at least ONE specific verifiable detail", "NEVER fabricate details"), honesty and
  deliverability rules ("Every claim must trace back to the product info or skills provided"), and
  merge-variable discipline.

**Preserve.**
- **Writer as a separate agent that produces *drafts*, never sends.** Write and send are different
  actions with different failure modes and (in LIT) different review points.
- The entire `prompts/writer.md` rulebook — port nearly verbatim; it encodes hard-won cold-email
  craft and compliance (truthful subjects, no fabrication, spam-word bans).
- Batching by segment, batch caps, sample-based prompting (describe 5, apply to 50) with merge
  variables `{{first_name}}`, `{{company}}`, `{{title}}` + personalization notes.
- Never-raise LLM output parsing; status flip `new → queued` as the "don't double-write" latch.
- 3-step sequence shape (observation → proof → break-up) with delay days.

**Reject.**
- Writing sequences into Harvey's own `campaigns` table — must create drafts in **LIT's campaign
  engine** instead.
- Word-count and rule enforcement by prompt alone. LIT should add a cheap deterministic post-check
  (word counts, banned strings, em-dash scan) and regenerate on violation.

**LIT replacement.** A `harvey-writer` edge function that reads queued Harvey leads from the LEAD
CRM, calls the Brain with the ported writer prompt + skills, validates output deterministically, and
creates a **draft campaign in LIT's campaign engine** with the sequence steps and audience attached.
Optionally gated: drafts require owner approval in the UI before Sender may touch them (recommended
for launch). TODO(LIT-audit): campaign-engine draft schema + merge-variable syntax used by LIT
templates.

**Affected LIT components.** LIT campaign engine (draft creation API/tables); campaign UI for
review/approval; dead-campaign-code cleanup noted in the maps/UI audit (`lit-maps-and-ui-audit`).

---

## 6. Sender — `harvey/agents/sender.py` (+ `harvey/integrations/instantly.py`)

**Purpose.** Deploy draft campaigns to the sending platform, safely and idempotently.

**How it works.** `_deploy_campaign` is a carefully ordered idempotent state machine:
1. Validate the sequence locally (`_validate_sequence`: non-empty subject/body, non-negative delays)
   — a broken campaign is marked `failed` before any network call.
2. Create the provider campaign **only if `campaign.instantly_campaign_id` is empty**, and persist
   the returned ID **immediately**: *"Persist the ID immediately so a crash mid-deploy resumes this
   campaign instead of creating a second one (double-send guard)."*
3. Push the email sequence.
4. Build the lead list with hard filters: regex-valid email, per-campaign email dedup, and
   `SENDABLE_STATUSES = {"new", "queued"}` — *"we never re-send to someone already contacted,
   replied, opted out, or lost."* A retry path detects leads already staged (`status == "contacted"`)
   and jumps straight to activation.
5. Enforce the remaining daily send budget (`max_daily_sends` minus `_count_sends_today`, which
   counts prospects flipped to `contacted` today) and truncate the lead list to fit.
6. **Mark prospects `contacted` BEFORE activation** — "Better to under-count than double-send."
7. Activate; on failure, leads stay staged and activation retries next cycle.
8. Update local campaign → `active`, log action.

`InstantlyClient` is a clean async HTTP client: retry/backoff with jitter, honors `Retry-After`,
distinguishes retryable (429/5xx) from non-retryable 4xx, redacts the API key from all logs, and
normalizes list responses (`_extract_items`).

**Preserve (this is the most safety-critical file).**
- **Idempotent sending with persisted provider IDs** — persist the external ID before doing anything
  else with it; resume, never recreate.
- **Sendable-status whitelist** — the positive-list (not blocklist) guarantee against re-contacting
  replied/opted-out/lost people.
- **Pessimistic status flip before activation** (under-count > double-send).
- Daily send cap enforced at deploy time with truncation, and validation-before-network.
- Resumable multi-step deploy: every step is a checkpoint; any step can fail and be retried next
  cycle without side effects.
- API-client hygiene: secret redaction, Retry-After, retryable-status discrimination.

**Reject (hard).**
- **Instantly as the sender.** LIT's whole model is sending through the *user's own* connected
  Gmail/Outlook mailboxes with LIT's campaign engine, warmup, and deliverability posture. A second
  third-party sender fragments reputation, billing, and the inbox story.
- `_count_sends_today`'s raw-SQLite `LIKE 'today%'` timestamp hack — use proper timestamptz queries.

**LIT replacement.** Sender becomes a thin `harvey-sender` step that transitions an approved Harvey
draft campaign to **scheduled/active in LIT's campaign engine**, which already owns throttling,
mailbox rotation, and actual SMTP/Gmail/Outlook dispatch. The idempotency invariants transfer as:
persisted LIT campaign ID on the Harvey record, sendable-status whitelist on CRM lead status, daily
caps read from Harvey settings, and DB transactions replacing the ordered-write choreography.
TODO(LIT-audit): the campaign engine's activation API and existing send-cap mechanics.

**Affected LIT components.** Campaign engine send pipeline; connected-mailbox management
(Gmail/Outlook OAuth); CRM lead status fields; suppression list (see §7).

---

## 7. Handler — `harvey/agents/handler.py` (+ `prompts/handler.md`)

**Purpose.** Read every reply, classify intent, advance the conversation, auto-respond or stop.

**How it works.**
- Polls Instantly replies per active campaign. Each reply: extract `lead_email`, `body`, `uuid`;
  skip if `state.is_reply_processed(uuid)`; process; and in a `finally:` block **always**
  `mark_reply_processed(uuid)` — even on early exits — so a reply can never be double-handled.
- **Hard keyword guards run BEFORE the LLM and override it:**

  ```python
  if any(p in text_lower for p in OPT_OUT_PATTERNS):      intent = "unsubscribe"
  elif any(p in text_lower for p in ESCALATION_PATTERNS): intent = "escalate"
  else:                                                   intent = await self._classify_intent(...)
  ```

  `OPT_OUT_PATTERNS` = 15 phrases ("unsubscribe", "remove me", "stop emailing", "delete my data"…);
  `ESCALATION_PATTERNS` = 14 ("lawyer", "cease and desist", "gdpr", "spam complaint"…).
- LLM classification into 8 labels (`interested, objection, not_interested, ooo, wrong_person,
  question, unsubscribe, escalate`) with tie-break instructions biased to safety ("when in doubt …
  choose unsubscribe / escalate"). If the classifier returns nothing → **`escalate`, never
  auto-reply blind**. Unknown label → `question` (a safe, non-committal auto-reply intent).
- Routing: `unsubscribe` → conversation closed, prospect `opted_out`, **no reply ever, logged**;
  `escalate` → conversation `needs_human`, logged, no reply; `not_interested` → closed_lost, "One no
  is enough"; `ooo` → leave open, no action; only `AUTO_REPLY_INTENTS = {interested, objection,
  question, wrong_person}` get a generated response.
- `_determine_stage()` is a deterministic stage machine over the 8 `STAGES`: e.g. interested +
  meeting words ("schedule", "calendar", "free on") → `closing`; engaged + pricing words →
  `presenting`; objections early → `qualifying`.
- `_generate_response()` builds from `prompts/handler.md` (stage-specific behavior, "NEVER FABRICATE",
  "no AI tells") + skills + last-6-message history + optional pre-configured objection response from
  `config.product.objection_responses` keyed by trigger substring. Guards against meta-text output
  (`"i can't"`, `"as an ai"` → discard). Sends via `instantly.send_reply(reply_uuid, body)` and
  appends to the stored thread.

**Preserve (the compliance heart of the system).**
- **Hard reply guard: deterministic opt-out/escalation keyword checks that run first and override the
  LLM.** Non-negotiable to port as-is (extend the phrase lists).
- Always-mark-processed-in-`finally` idempotency.
- Fail-safe defaults: classifier failure → escalate; unknown intent → no risky auto-reply path.
- The auto-reply *whitelist* (only 4 intents may generate a reply) — everything else stops or goes
  to a human.
- `needs_human` as a first-class conversation status surfaced to the owner.
- The deterministic stage machine + last-N-message context windowing + configured objection
  responses.
- Meta-text output guard before sending anything.
- Opt-out = permanent suppression at the *person* level (status `opted_out` excluded from
  `SENDABLE_STATUSES` forever).

**Reject.**
- Polling Instantly for replies. Replies must come from **LIT's own inbox** (Gmail/Outlook sync —
  currently pending, see `lit-inbox-sync-pending`); reply IDs are provider message IDs.
- Auto-replying with **zero human oversight** as the launch default. Port the machinery, but LIT
  should launch with draft-for-approval mode (Harvey drafts the reply into the inbox/CRM; owner
  clicks send) with a per-workspace toggle to full-auto later.

**LIT replacement.** A `harvey-handler` edge function triggered by inbox sync events (or cron over
unprocessed inbound messages tied to Harvey campaigns): dedup on provider message ID → hard guards →
LLM classify → update CRM lead status + conversation stage → either queue a draft reply in the LIT
inbox/campaign reply flow or auto-send via the user's mailbox per workspace setting. Opt-outs write
to LIT's suppression mechanism (TODO(LIT-audit): does the campaign engine have a suppression table?).

**Affected LIT components.** Inbox sync engine (prerequisite — not yet built); Gmail/Outlook send
API; LEAD CRM conversation/timeline at `/app/leads`; campaign engine suppression/unsubscribe
handling; notification surface for `needs_human` escalations.

---

## 8. Analyst — `harvey/agents/analyst.py`

**Purpose.** Idle-cycle performance analysis. **Zero LLM calls** — pure SQL + threshold rules.

**How it works.** Builds a report dict (`pipeline` status counts, `campaigns` via
`get_campaign_stats()`, `intents`, `stages`) and writes it atomically (temp file + rename) to
`data/analytics.json` for the dashboard. `_generate_insights()` emits **actionable, prescriptive
strings** where every insight "names the metric, the threshold it crossed, and the specific file or
config to change": reply rate <5% → rewrite email 1 in `prompts/writer.md`; opt-out rate >2% →
"URGENT … risks blacklisting. Pause sending, tighten ICP"; any escalations → "HUMAN NEEDED"; >40%
objections → add to `objection_responses`; best-vs-worst campaign comparison ("reuse the winner's
angle; pause the loser"); pipeline bottleneck checks (queued-but-nothing-sent → check API key;
engaged-but-no-closing → change closing guidance; empty pool → broaden ICP).

**Preserve.**
- SQL-computed analytics running on idle/parallel cycles at zero LLM cost.
- **Prescriptive threshold insights** — metric + threshold + specific corrective action. The 2%
  opt-out deliverability alarm and the winner/loser campaign comparison are directly reusable.
- Atomic report writes (in LIT: a table upsert, so this becomes trivial).

**Reject.** `analytics.json` on disk — replace with a `harvey_insights` table or a materialized
view + insight rows the UI reads.

**LIT replacement.** SQL views/RPCs over LIT campaign + CRM + Harvey tables; an insight-generation
step in the heartbeat writing `harvey_insights` rows; surfaced on the Harvey/CRM dashboard. Insights
reference LIT surfaces ("edit the Harvey writer skill", "tighten ICP in Harvey settings") instead of
file paths.

**Affected LIT components.** Reporting views; `/app/leads` or Harvey dashboard UI; possibly existing
campaign analytics queries.

---

## 9. Trainer — `harvey/trainer.py`

**Purpose.** "Give Harvey a URL and it learns everything about the product": crawl → LLM-extract →
generate `harvey.yaml` + `skills/product_knowledge.md` + `skills/competitive_intel.md`.

**How it works.** Two crawlers — `CloudflareCrawler` (Browser Rendering `/crawl` API: JS rendering,
sitemap discovery, markdown output, job polling with cursor pagination) and `FallbackCrawler`
(recursive httpx+BeautifulSoup over ~20 priority paths then discovered internal links). Then four
LLM extraction passes over concatenated page content (capped ~60k chars): `_extract_product_info`
(name, pricing, benefits, differentiators, competitors, tone…), `_extract_icp` (industries, titles,
pain points, buying triggers, **disqualifiers**), `_extract_competitive_intel` (per-competitor
`how_we_win` / `their_weakness` / `migration_angle`), `_generate_objections` (8-12 objection→response
pairs). `_build_config` assembles the full YAML; `_generate_product_knowledge` and
`_generate_battle_cards` render the two markdown skills.

**Preserve.**
- The **train-once, inject-everywhere knowledge pipeline**: product knowledge and battle cards as
  generated *documents* that every agent prompt consumes. The extraction JSON schemas (especially
  ICP with pain points/triggers/disqualifiers, and the battle-card triple) are directly reusable.
- Structured multi-pass extraction rather than one mega-prompt.

**Reject.**
- Writing `harvey.yaml` and skill files to disk as the config store.
- The DIY crawlers as-is (Cloudflare crawl is fine as a service; SERP-style scraping is not needed
  for this use case). For LIT-for-LIT (Harvey selling LIT itself), most of this is a one-time
  curation task, not a crawler feature.

**LIT replacement.** An onboarding/"training" step that generates `harvey_skills` rows
(product_knowledge, competitive_intel) and workspace Harvey settings (ICP, persona, offer) — for the
internal use case, hand-curate LIT's own product knowledge and battle cards (vs ImportYeti/Panjiva
etc.) once, stored in the skills table with an admin editor. Keep the trainer concept for a future
customer-facing Harvey.

**Affected LIT components.** Harvey settings/skills tables; admin/settings UI. TODO: whether a
crawl-based trainer is ever exposed to LIT customers.

---

## 10. LinkedIn integration — `harvey/integrations/linkedin.py`

**Purpose.** Prospect on LinkedIn via a real browser.

**How it works.** Playwright Chromium, `login()` fills `#username`/`#password` with the user's real
LinkedIn credentials from `.env`, saves **session cookies to `data/linkedin_cookies.json`**
(chmod 600), detects checkpoint/challenge pages. `search_people()` scrapes people-search result
cards by CSS selector; `extract_profile()` scrapes profile pages. Safety layer: persisted daily
activity caps (`MAX_DAILY_SEARCH_PAGES=20`, `MAX_DAILY_PROFILE_VIEWS=40`, stored in
`data/linkedin_activity.json` so restarts don't reset), humanlike randomized delays with occasional
long "reading" pauses, incremental scrolling, fixed browser fingerprint, password redaction in logs.
The setup wizard explicitly warns this **violates LinkedIn ToS** and can get the account banned.

**Preserve (concepts only).**
- **Persisted per-day, per-channel activity caps that survive restarts** — port to a Postgres
  counter table for any rate-limited channel (LinkedIn actions via Unipile, email sends).
- Channel enable/disable + per-channel daily limits in config.
- Credential/secret redaction discipline in logs.

**Reject (hard — do not copy any of this).**
- **Playwright LinkedIn login, storing the user's LinkedIn password in `.env` and session cookies on
  disk.** ToS-violating, account-endangering, credential-hoarding, and impossible in a serverless
  environment. This is the single most dangerous component in the reference.
- All LinkedIn DOM scraping (selectors are already stale-prone; the reference itself needs fallback
  selectors).

**LIT replacement.** **Unipile** for everything LinkedIn: OAuth-style account connection (no
passwords held by LIT), people/profile data, connection requests, and messaging via API, with
LIT-side daily caps mirroring the reference's conservative numbers (≤20 connections, ≤10 messages/day
per the reference's channel config). TODO(LIT-audit): current state of any Unipile integration in
LIT.

**Affected LIT components.** New/existing Unipile integration; account-connection settings UI;
`harvey_channel_activity` counter table.

---

## 11. Email finder — `harvey/integrations/email_finder.py`

**Purpose.** Find/verify a prospect's email without paid tools.

**How it works.** `generate_patterns()` (10 patterns, `first.last@` as canonical best guess, sanitized
so non-ASCII names can't crash), `get_mx_host()` with an in-memory MX cache (failures cached as None),
`verify_email_smtp()` (VRFY then MAIL FROM/RCPT TO probe on port 25 — noting catch-alls make
negatives unreliable), `verify_email_hunter()` (optional Hunter.io, tri-state True/False/None with
retries and key redaction), and `find_email()` orchestrating: patterns → MX check → per-pattern
verification (Hunter first, SMTP fallback) with jittered delays → return first verified, else best
guess. Scout's `_resolve_email` then only flags `email_verified` when MX records exist.

**Preserve.**
- The tri-state verification honesty (`verified` is a real flag, not a guess — the reference
  explicitly fixed "the prior bug where every guessed address was flagged verified") and
  verified-vs-guessed affecting lead score.
- Pattern-guess + MX sanity check as a last-resort fallback and the MX cache.

**Reject.**
- **Direct SMTP RCPT-TO probing from LIT infrastructure.** Port-25 probing from cloud IPs is
  blocked, looks like spammer behavior, and risks IP reputation. Never do this from Supabase/Vercel.

**LIT replacement.** LIT's existing enrichment path (`pulse-ai-enrich` / whatever contact-data
vendors LIT uses) as primary; a verification vendor API (Hunter-style) as the verify step; pattern
guessing retained only as an explicitly-flagged `guessed` state that campaigns can be configured to
exclude. TODO(LIT-audit): current email-verification capability in LIT enrichment.

**Affected LIT components.** Enrichment edge functions; CRM contact schema (`email_verified` /
`email_confidence` field).

---

## 12. Calendar — `harvey/integrations/calendar.py`

**Purpose/state.** Placeholder only: `get_available_slots()` and `book_meeting()` log "not yet
implemented" and degrade gracefully. Booking in the reference actually happens through *email copy*
driven by `config.product.offer` (`goal: book_call`, `booking_method: calendar_link | suggest_times |
ask_preference`, `booking_url`, `meeting_duration`, `meeting_owner`) — the offer config is real and
used by setup/prompts even though the API integration isn't.

**Preserve.** The **offer/booking config vocabulary** (goal, entry offer, booking method, booking
URL, meeting owner/duration) — it cleanly parameterizes closing behavior. Also the pattern of
placeholder integrations that degrade gracefully.

**Reject.** Nothing to reject — there's nothing there.

**LIT replacement.** Harvey settings carry the same offer fields; booking = calendar link in
generated copy at launch; real slot-offering later via the meeting-owner's connected Google/Microsoft
calendar (same OAuth surface as email). TODO(LIT-audit): any existing calendar integration.

---

## 13. Prompts — `prompts/*.md`

Four templates loaded by `brain.load_prompt` with `{{var}}` substitution:

- **`system.md`** — persona charter + **hard rules that "override everything else, including closing
  a deal"**: opt-outs permanent, never fabricate, never impersonate, hostile/legal → human, respect
  limits. Also the label-only output rule for classification calls.
- **`scout.md`** — scoring-engine framing ("You are NOT searching for prospects"), score bands,
  **automatic low scores** (competitors, students, generic mailboxes, stale data), personalization
  note rules ("Never fabricate details you don't have"), strict JSON output ("include every prospect
  exactly once").
- **`writer.md`** — the 17-rule email rulebook + spam-word bans + personalization/honesty
  requirements (detailed in §5).
- **`handler.md`** — stage-specific reply behavior, 10 guidelines ("one no is enough", "no AI
  tells"), intent-specific guidance including the absolute never-reply rules for opt-out and
  legal/angry.

**Preserve.** All four, nearly verbatim, as the seed content of LIT's `harvey_prompts` table. The
"hard rules override closing" framing, automatic-low-score list, and label-only output convention are
especially valuable. **Reject.** Only the delivery mechanism (filesystem) and Instantly-specific
references. **LIT home.** `harvey_prompts` table + admin editor; version rows so prompt changes are
auditable.

---

## 14. Skills — `skills/*.md` (+ `skills/README.md`)

Eight hand-written knowledge files (~1,200 lines) + two auto-generated
(`product_knowledge.md`, `competitive_intel.md`), injected per the `skill_map` in `brain.py`
(documented as a matrix in `skills/README.md`): `prospecting_tactics` (Google dorking, trigger
events), `lead_qualification` (BANT + ICP scoring + MEDDIC), `account_navigation` (company-first,
multi-contact/multi-threading rules), `email_frameworks` (compliance-overrides-style section:
truthful subjects, real identity, working opt-out + physical address, EU/UK legitimate-interest note;
then banned patterns and 5 frameworks — AIDA/PAS/BAB/QVC/3Ps), `sales_methodology` (ABC loop, tone
calibration, ethics), `offer_strategy` (offer ladder by engagement level, closing mechanics),
`objection_handling` (LAARC + 4 objection categories), `linkedin_outreach` (ToS-risk preamble,
connection strategy with acceptance-rate data, rate limits as "ceilings, not targets").

**Preserve.** The whole system: **markdown skill/knowledge files, editable without code changes,
mapped per-agent, hot-reloaded each cycle** — this is the reference's answer to "how do you tune the
agent's selling behavior," and it's the right one. Content-wise, `email_frameworks`' compliance
section, `objection_handling`, `offer_strategy`, and `account_navigation` (companies vs contacts,
create company first — matches LIT's CRM model) port with light edits; `prospecting_tactics` and
`linkedin_outreach` need rewrites since their tactics (dorking, browser automation) are rejected —
keep only their qualification/ethics content. **Reject.** Filesystem storage; skills that teach
scraping tactics LIT won't perform. **LIT home.** `harvey_skills` table seeded from files kept in the
LIT repo (e.g. `docs/harvey-skills/` or `supabase/seed`), per-agent mapping in a column, editable in
an admin UI, freighted with LIT-specific product knowledge (logistics ICP, freight-forwarder
objections, ImportYeti/Panjiva battle cards).

---

## 15. Config — `harvey/config.py`, `harvey.yaml`, `.env.example`

**How it works.** Pydantic-validated YAML: `persona` (name/company/role/email/tone), `product`
(description, pricing, key_benefits, `objection_responses` map, `offer` block), `icp`
(industries/company_size/titles/geography), `channels` (email: enabled/provider/max_daily_sends;
linkedin: enabled/max_daily_connections/max_daily_messages), `usage` (max_daily_claude_percent,
heartbeat_interval_minutes, quiet_hours with IANA-timezone validation). Validators produce
actionable messages ("Use 24h HH:MM format, e.g. '22:00'"). `.env` holds secrets only
(INSTANTLY_API_KEY, LINKEDIN_EMAIL/PASSWORD, CLOUDFLARE_*, HUNTER_API_KEY, SERPER_API_KEY), each
documented with where-to-get-it and cost notes.

**Preserve.** The config *shape* — clean separation of persona / product / ICP / channels / usage
with per-channel enables and caps — becomes the schema of LIT's per-workspace Harvey settings.
Strict validation with actionable errors. Secrets separated from behavior config. **Reject.** YAML
files on disk; `.env`-stored third-party passwords; the `provider: "instantly"` field. **LIT home.**
`harvey_settings` (JSONB or columns) per workspace + Supabase secrets/vault for API keys; settings
UI under the Harvey admin surface.

---

## 16. CLI, setup wizard, dashboard, packaging — `cli.py`, `setup.py`, `dashboard.py`, `Dockerfile`, `docker-compose.yml`, `tests/`

**How they work.**
- `cli.py`: `harvey install|setup|run|train|dashboard|status`, friendly error surfacing for
  `ConfigError`.
- `setup.py`: 6-step conversational wizard (checks Claude CLI + headless test with a "HARVEY_READY"
  probe, Instantly key with live test, LinkedIn with an **explicit ToS warning** defaulting to No,
  Cloudflare, product training via trainer-or-manual Q&A including the offer/booking questions,
  behavior settings with a deliverability warning at >200 sends/day). Writes `.env` chmod 600
  preserving untouched keys, and a final compliance checklist (dedicated sending domain,
  SPF/DKIM/DMARC, warmup, CAN-SPAM unsubscribe + postal address).
- `dashboard.py` (1,726 lines, mostly inline HTML/JS): FastAPI on localhost:5555. Read-only pipeline
  views (stats, companies→contacts drilldown, prospects, campaigns with rendered sequences,
  conversation threads, activity feed), a setup checklist API that live-tests the Instantly key, an
  `.env` editor with masked keys and newline-injection stripping, feedback comments on any entity,
  and **process control**: start/stop Harvey as a subprocess with PID file + SIGTERM-then-SIGKILL,
  and a 64KB log tail viewer. `query_db` never raises (empty install → empty lists, no 500s).
- Docker: python-slim + Playwright Chromium, non-root user, Claude CLI installed in-image,
  **bind-mounts `~/.claude`** for Max auth, healthcheck = "db file modified within 2h".
- Tests cover config validation, model round-trips, and state manager behavior (dedup, migrations,
  whitelists) — no agent or integration tests.

**Preserve.** The **setup-completeness checklist** pattern (each requirement: done flag + specific
remediation help + live key tests) for LIT's Harvey onboarding; the guided-wizard question set
(especially the offer/booking questions and compliance checklist) as the script for LIT's settings
UI; never-500 read paths; feedback-on-any-entity; the test discipline around dedup/state invariants.
**Reject.** The entire process-management layer (PID files, subprocess start/stop, log tailing),
localhost dashboard, `.env` editing over HTTP, Docker/VPS deployment, `~/.claude` mounting — all
artifacts of the resident-process model. **LIT home.** Harvey admin panel inside the LIT app
(TODO: route — likely alongside `/app/leads`); "running" status = recent `harvey_actions` rows +
cron health, not a PID.

---

## Concept-by-concept carryover table

| Concept | Verdict | Why | LIT home |
|---|---|---|---|
| Heartbeat loop (wake → inspect → act → record → sleep) | **Adapt** | Right control model; wrong runtime (resident process) | `harvey-heartbeat` edge function on cron |
| Deterministic priority rules before any LLM (replies > send > write > prospect > idle) | **Adopt** | Zero-cost, unbreakable decisioning; the repo's best idea | Heartbeat function, rules over a SQL pipeline-summary RPC |
| Prospect-pool refill threshold (new < 20 → prospect) | **Adopt** | Pipeline homeostasis, prevents runaway scraping/spend | Heartbeat rules + Harvey settings |
| Quiet hours + daily LLM budget + daily send caps as loop preconditions | **Adopt** | Cost & deliverability safety rails | `harvey_settings`; checked at top of heartbeat |
| Per-agent isolation (one failing agent never kills the cycle) | **Adopt** | Resilience | Separate edge-function steps / try-catch per step |
| Brain: single LLM gateway with retries, timeouts, JSON coercion, usage metering | **Adapt** | Abstraction is right; transport is wrong | Shared module in edge functions → Anthropic API (structured outputs) |
| Claude CLI subprocess + `--dangerously-skip-permissions` + `~/.claude` mount | **Reject** | Unsafe, unbillable, unportable | Anthropic API keys in Supabase secrets |
| Markdown prompt templates with `{{var}}` substitution + unfilled-var warning | **Adopt** | Behavior editable without code; template-error detection | `harvey_prompts` table, seeded from repo files |
| Markdown skill files, per-agent mapping, hot-reload | **Adopt** | The tuning surface for selling behavior | `harvey_skills` table + admin editor |
| Trainer (crawl site → product knowledge + battle cards + ICP config) | **Adapt** | Knowledge-generation pipeline is good; file outputs & DIY crawler aren't; internal case is one-time curation | Onboarding step writing skills/settings rows; hand-curated for LIT itself |
| SQLite + local filesystem as canonical memory | **Reject** | Single-machine, no RLS, no multi-tenant | Supabase/Postgres with RLS |
| DB-level dedup (normalized keys + unique partial indexes, resolve-to-existing-id) | **Adopt** | Correct place to enforce identity | LEAD CRM tables / Postgres unique indexes |
| Shadow CRM (`companies`/`prospects` tables) | **Reject** | LIT already has a CRM; two copies = drift | LEAD CRM at `/app/leads` |
| Shadow campaign engine (`campaigns` + Instantly IDs) | **Reject** | Duplicates LIT's campaign engine | LIT campaign engine tables |
| Prospect status vocabulary (new→queued→contacted→replied/opted_out/lost) | **Adapt** | Good taxonomy; map onto/extend LIT lead statuses | CRM lead status fields |
| Scout: "Python acquires, LLM only judges" | **Adopt** | Keeps LLM out of data acquisition; avoids refusals and hallucinated leads | Harvey scout step querying LIT data + enrichment |
| SERP/DDG/Bing/Google scraping, directory & team-page scraping, domain guessing | **Reject** | Brittle, legally gray, unnecessary given LIT's data | LIT search + `pulse-explore` + enrichment |
| Heuristic-baseline-then-LLM batch scoring with fallback; personalization notes on the contact | **Adopt** | Scoring never blocks; notes power personalization end-to-end | Scout step + CRM contact fields |
| Playwright LinkedIn login, `.env` password, cookie files | **Reject** | ToS-violating, credential-hoarding, serverless-impossible; most dangerous component | **Unipile** |
| Persisted per-day channel activity caps surviving restarts | **Adopt** | Account-protection pattern for any rate-limited channel | `harvey_channel_activity` counter table |
| Instantly as email sender | **Reject** | LIT sends via users' own Gmail/Outlook through its campaign engine | LIT campaign engine + connected mailboxes |
| Idempotent deploy: persist provider ID first, resume never recreate | **Adopt** | The double-send guard | Harvey↔campaign-engine linkage columns |
| Sendable-status whitelist (only new/queued may be added as leads) | **Adopt** | Positive-list guarantee against re-contacting replied/opted-out people | Sender step over CRM statuses |
| Mark contacted *before* activation (under-count > double-send) | **Adopt** | Pessimistic ordering; in LIT, a DB transaction | Campaign activation flow |
| Writer as separate draft-producing agent; 3-email sequence shape; segment batching | **Adopt** | Separation of write/send; review point | `harvey-writer` step → draft campaigns |
| `writer.md` rulebook (anti-AI-tells, spam-word bans, no-fabrication, truthful subjects) | **Adopt** | Encodes craft + CAN-SPAM compliance | `harvey_prompts` (writer), + deterministic post-validation |
| Hard reply guard: opt-out/legal keyword checks override the LLM | **Adopt** | Compliance must not depend on a model | `harvey-handler` step, verbatim pattern lists (extended) |
| Reply idempotency ledger (mark processed in `finally`) | **Adopt** | Never double-handle/double-reply | Processed-message table keyed on provider message ID |
| Fail-safe classification defaults (no result → escalate; unknown → no risky reply) | **Adopt** | Errs toward humans | Handler step |
| Auto-reply intent whitelist + `needs_human` escalation status | **Adopt** | Only 4 intents may auto-respond; humans own the rest | Handler + CRM conversation status + owner notifications |
| Fully autonomous reply sending (no approval) | **Adapt** | Machinery is sound; launch default should be draft-for-approval with a full-auto toggle | Workspace setting in `harvey_settings` |
| Deterministic conversation stage machine (8 stages) | **Adopt** | Cheap, predictable pipeline tracking | CRM conversation/deal stage fields |
| Reply polling from the sending platform | **Reject** | Replies must come from LIT's own inbox | Inbox sync engine (prerequisite build) |
| Analyst: SQL-computed analytics, zero LLM | **Adopt** | Free, accurate, fast | SQL views/RPCs + heartbeat idle step |
| Prescriptive threshold insights (metric + threshold + specific fix; 2% opt-out alarm) | **Adopt** | Turns analytics into actions | `harvey_insights` table + dashboard |
| `analytics.json` on disk | **Reject** | Filesystem artifact | `harvey_insights` / views |
| Email pattern-guessing + tri-state verification honesty (`verified` ≠ guessed) | **Adapt** | Honesty flag is great; keep vendor verification, drop guessing to last resort | Enrichment path + CRM `email_verified`/confidence |
| Direct SMTP RCPT-TO probing | **Reject** | Blocked from cloud IPs; spammer-signature behavior | Verification vendor API |
| Offer/booking config (goal, entry offer, booking method/URL, meeting owner) | **Adopt** | Clean parameterization of closing behavior | `harvey_settings` offer block |
| Calendar integration | **Adapt** | Placeholder in reference; LIT can do it properly later | Connected Google/Microsoft calendar (post-launch) |
| Config shape: persona / product / ICP / channels / usage with validation | **Adopt** | Right schema for per-workspace settings | `harvey_settings` + settings UI |
| YAML/.env files as config store; `.env` editor over HTTP | **Reject** | Filesystem + secret-handling anti-patterns for a SaaS | Postgres settings + Supabase secrets |
| Setup wizard question script + live key tests + compliance checklist (SPF/DKIM/DMARC, warmup, CAN-SPAM) | **Adopt** | Best-in-class onboarding content | Harvey onboarding flow in LIT UI |
| Dashboard read views (pipeline, sequences, threads, activity feed, never-500 reads) | **Adapt** | Views are useful; LIT rebuilds them in-app on real tables | Harvey panel near `/app/leads` (TODO route) |
| Dashboard process control (PID files, start/stop subprocess, log tail) | **Reject** | Resident-process artifact | Cron status + `harvey_actions` recency |
| Docker/VPS deployment | **Reject** | LIT is Vercel + Supabase | Edge functions + cron |
| Action audit log for every cycle/agent action | **Adopt** | Observability + trust | `harvey_actions` table |
| Tests over state invariants (dedup, migrations, whitelists) | **Adopt** | The invariants worth testing transfer directly | LIT test suite for Harvey RPCs/functions |

---

*End of review. Batch 2+ should treat the “Adopt/Adapt” rows above as requirements and the “Reject”
rows as explicit non-goals; TODO(LIT-audit) markers are to be resolved by the LIT-side audit doc.*
