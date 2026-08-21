-- ─────────────────────────────────────────────────────────────────────────────
-- Project Harvey — Batch 6: EMAIL DISPATCH LOG
--
-- Applied by the orchestrator via MCP (mcp apply_migration). Do NOT apply by
-- hand; this file is written to be applied verbatim to prod, idempotently.
--
-- Builds on:
--   20260821000000_harvey_foundation.sql        (lit_agent_touch_updated_at()
--                                                 trigger fn, is_lead_crm_member())
--   20260821030000_harvey_writer_drafts.sql      (lit_agent_drafts)
--
-- What this creates:
--   public.lit_agent_send_log — one row per attempt by the harvey-email-dispatch
--   edge fn (service-role) to send an APPROVED Harvey draft. This is the
--   idempotency + audit ledger for the FIRST code path that can send real
--   email as Harvey.
--
--   The UNIQUE(draft_id) constraint IS the idempotency key: a draft can be
--   dispatched at most once. The dispatcher inserts the send-log row (or
--   catches the unique violation and treats the draft as already handled)
--   BEFORE / around the actual Gmail send so a concurrent tick can never
--   double-send the same draft.
--
--   status semantics:
--     'sent'     — a real Gmail send succeeded (provider_message_id captured)
--     'dry_run'  — a gate passed but dryRun/testMode replaced the real send
--                  with a logged no-op (NO email left the building)
--     'skipped'  — a per-draft gate blocked the send (see skip_reason)
--     'failed'   — the send was attempted and the provider returned an error
--
-- Soft reference: draft_id / lead_id are nullable soft refs (NO foreign keys)
-- so the append-only ledger outlives archival/deletion of a draft or lead and
-- the audit trail is never cascaded away.
--
-- Access model mirrors the Harvey foundation exactly:
--   - READ:  authenticated users passing public.is_lead_crm_member(auth.uid())
--   - WRITE: service-role only (no authenticated INSERT/UPDATE/DELETE policies)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.lit_agent_send_log (
  id                  uuid primary key default gen_random_uuid(),
  agent_name          text not null default 'harvey',
  draft_id            uuid,            -- soft ref to lit_agent_drafts; NO fk
  lead_id             uuid,            -- soft ref to lit_admin_leads; NO fk
  channel             text not null check (channel in ('email','linkedin')),
  -- linkedin action distinction (invite | message); null for email
  action_type         text,
  -- linkedin sender (Unipile account id); null for email
  unipile_account_id  text,
  provider_message_id text,            -- email: Gmail message id
  provider_id         text,            -- linkedin: Unipile provider/person id
  provider_event_id   text,            -- linkedin: invite/message event id
  provider_chat_id    text,            -- linkedin: chat id (messages)
  status              text not null check (status in ('sent','skipped','failed','dry_run')),
  skip_reason         text,            -- email dispatcher's skip reason
  reason              text,            -- linkedin dispatcher's skip/outcome reason
  dry_run             boolean not null default false,
  error               text,
  sent_at             timestamptz,
  created_at          timestamptz not null default now()
);

-- Idempotency key: a draft can be dispatched at most once. A concurrent second
-- insert for the same draft_id fails with a unique violation, which the
-- dispatcher treats as "already handled — do not send again".
create unique index if not exists lit_agent_send_log_draft_uidx
  on public.lit_agent_send_log (draft_id)
  where draft_id is not null;

-- Daily-cap counting + audit browsing: newest-first per agent.
create index if not exists lit_agent_send_log_agent_created_idx
  on public.lit_agent_send_log (agent_name, created_at desc);

alter table public.lit_agent_send_log enable row level security;

drop policy if exists lit_agent_send_log_member_read on public.lit_agent_send_log;
create policy lit_agent_send_log_member_read on public.lit_agent_send_log
  for select to authenticated
  using (public.is_lead_crm_member(auth.uid()));
-- Deliberately NO insert/update/delete policies: writes are service-role only.

comment on table public.lit_agent_send_log is
  'Project Harvey: idempotency + audit ledger for the harvey-email-dispatch edge fn. One row per attempt to send an APPROVED Harvey draft. UNIQUE(draft_id) enforces at-most-once send. status in (sent/dry_run/skipped/failed). Read: lead-CRM members. Write: service-role only.';
