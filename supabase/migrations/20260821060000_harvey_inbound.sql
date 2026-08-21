-- ─────────────────────────────────────────────────────────────────────────────
-- Project Harvey — Batch 8: INBOUND REPLY LEDGER
--
-- Applied by the orchestrator via MCP (mcp apply_migration). Do NOT apply by
-- hand; this file is written to be applied verbatim to prod, idempotently.
--
-- Builds on:
--   20260821000000_harvey_foundation.sql        (lit_agent_touch_updated_at()
--                                                 trigger fn, is_lead_crm_member())
--   20260821030000_harvey_writer_drafts.sql      (lit_agent_drafts)
--   20260821050000_harvey_dispatch_log.sql       (send-log conventions mirrored here)
--
-- What this creates:
--   public.lit_agent_inbound — the idempotency + audit ledger for the
--   harvey-reply edge fn (service-role). One row per INBOUND message
--   (email or linkedin) Harvey has examined, so a reply is processed EXACTLY
--   once. The row records how the message was correlated to a Harvey lead,
--   the deterministic hard-guard / LLM intent classification, the action
--   Harvey took (suppressed / escalated / drafted / auto_replied / ignored /
--   error), and the draft/run it produced.
--
--   The UNIQUE(channel, source_message_id) constraint IS the idempotency key:
--   a given inbound provider message can be ledgered at most once. harvey-reply
--   inserts the ledger row (or catches the unique violation and treats the
--   message as already-handled) so a concurrent tick can never double-process,
--   double-draft, or double-suppress the same reply.
--
--   status semantics:
--     'processed' — the message was examined and an action recorded (see action)
--     'error'     — processing that specific message threw; captured in `error`
--                   so the run continues and the message is not re-scanned forever
--
--   action semantics (nullable; null only on an 'error' before an action was
--   decided):
--     'suppressed'   — opt-out hard-guard fired: recipient globally unsubscribed
--     'escalated'    — legal/compliance or risky reply parked for a human
--     'drafted'      — a suggested reply was drafted (pending_approval)
--     'auto_replied' — an auto-approved reply draft was produced (only possible
--                      when config.replies.autoReply=true — false today, so never)
--     'ignored'      — out-of-office autoresponder OR an inbound NOT correlated to
--                      Harvey's outreach (recorded so we don't re-scan it)
--
-- Soft reference: lead_id / source_row_id / draft_id / run_id are nullable soft
-- refs (NO foreign keys) so the append-only ledger outlives archival/deletion of
-- a lead, message, draft, or run and the audit trail is never cascaded away.
--
-- Access model mirrors the Harvey foundation exactly:
--   - READ:  authenticated users passing public.is_lead_crm_member(auth.uid())
--   - WRITE: service-role only (no authenticated INSERT/UPDATE/DELETE policies)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.lit_agent_inbound (
  id                  uuid primary key default gen_random_uuid(),
  agent_name          text not null default 'harvey',
  channel             text not null check (channel in ('email','linkedin')),
  -- The provider's own message id (Gmail message id / Unipile provider_message_id).
  -- This is the idempotency key together with `channel`.
  source_message_id   text not null,
  -- Our row id for the inbound message (lit_email_messages.id /
  -- lit_linkedin_messages.id). Soft ref; NO fk.
  source_row_id       uuid,
  lead_id             uuid,            -- soft ref to lit_admin_leads; NO fk
  from_email          text,           -- email channel: inbound from address (lower)
  from_provider_id    text,           -- linkedin channel: sender provider id
  thread_ref          text,           -- gmail provider_thread_id / linkedin chat id
  reply_message_id    text,           -- inbound RFC5322 Message-ID (email correlation)
  intent              text,           -- classified/guarded intent (see harvey-reply)
  classification_json jsonb,          -- full classifier output / hard-guard record
  action              text,           -- suppressed/escalated/drafted/auto_replied/ignored
  draft_id            uuid,           -- soft ref to lit_agent_drafts; NO fk
  run_id              uuid,           -- soft ref to lit_agent_runs; NO fk
  status              text not null default 'processed'
                        check (status in ('processed','error')),
  error               text,
  created_at          timestamptz not null default now(),
  -- Idempotency key: a given inbound provider message is ledgered at most once.
  constraint lit_agent_inbound_msg_uniq unique (channel, source_message_id)
);

-- Audit browsing + unprocessed scans: newest-first per agent.
create index if not exists lit_agent_inbound_agent_created_idx
  on public.lit_agent_inbound (agent_name, created_at desc);

alter table public.lit_agent_inbound enable row level security;

drop policy if exists lit_agent_inbound_member_read on public.lit_agent_inbound;
create policy lit_agent_inbound_member_read on public.lit_agent_inbound
  for select to authenticated
  using (public.is_lead_crm_member(auth.uid()));
-- Deliberately NO insert/update/delete policies: writes are service-role only.

comment on table public.lit_agent_inbound is
  'Project Harvey: idempotency + audit ledger for the harvey-reply edge fn. One row per inbound reply (email/linkedin) examined. UNIQUE(channel, source_message_id) enforces at-most-once processing. action in (suppressed/escalated/drafted/auto_replied/ignored). Read: lead-CRM members. Write: service-role only.';
