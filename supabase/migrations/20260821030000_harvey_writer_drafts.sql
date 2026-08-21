-- ─────────────────────────────────────────────────────────────────────────────
-- Project Harvey — Batch 4: WRITER DRAFTS
--
-- Applied by the orchestrator via MCP (mcp apply_migration). Do NOT apply by
-- hand; this file is written to be applied verbatim to prod, idempotently.
--
-- Builds on:
--   20260821000000_harvey_foundation.sql        (lit_agent_touch_updated_at()
--                                                 trigger fn, is_lead_crm_member())
--   20260821020000_harvey_outreach_training.sql  (outreach templates)
--
-- What this creates:
--   public.lit_agent_drafts — one row per Harvey-generated outreach DRAFT
--   (email or linkedin). The harvey-writer edge fn (service-role) writes these;
--   NOTHING is sent (sending is a later batch). A draft carries the generated
--   copy, the angle + facts_used the model claims to have relied on, a
--   confidence score, the review lifecycle (pending_approval → approved /
--   rejected / edited), and — on human edits — the corrected copy alongside the
--   original body so the original is never lost.
--
-- Soft reference: lead_id is a nullable soft ref to lit_admin_leads (NO foreign
-- key) so a draft can outlive/precede a lead row and archival/deletion of a
-- lead never cascades into the audit trail.
--
-- Access model mirrors the Harvey foundation exactly:
--   - READ:  authenticated users passing public.is_lead_crm_member(auth.uid())
--   - WRITE: service-role only (no authenticated INSERT/UPDATE/DELETE policies)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.lit_agent_drafts (
  id                uuid primary key default gen_random_uuid(),
  agent_name        text not null default 'harvey',
  lead_id           uuid,            -- soft ref to lit_admin_leads; NO fk
  contact_json      jsonb,
  channel           text not null check (channel in ('email','linkedin')),
  stage             text,
  intent            text,
  template_key      text,
  subject           text,
  body              text not null,
  angle             text,
  facts_used        jsonb,
  confidence        numeric,
  status            text not null default 'pending_approval'
                      check (status in ('draft','pending_approval','approved','rejected','edited','sent')),
  requires_approval boolean not null default true,
  edited_subject    text,
  edited_body       text,
  created_by        uuid references auth.users(id),
  reviewed_by       uuid references auth.users(id),
  reviewed_at       timestamptz,
  sent_at           timestamptz,
  metadata_json     jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists lit_agent_drafts_agent_status_created_idx
  on public.lit_agent_drafts (agent_name, status, created_at desc);

drop trigger if exists trg_lit_agent_drafts_touch on public.lit_agent_drafts;
create trigger trg_lit_agent_drafts_touch
  before update on public.lit_agent_drafts
  for each row execute function public.lit_agent_touch_updated_at();

alter table public.lit_agent_drafts enable row level security;

drop policy if exists lit_agent_drafts_member_read on public.lit_agent_drafts;
create policy lit_agent_drafts_member_read on public.lit_agent_drafts
  for select to authenticated
  using (public.is_lead_crm_member(auth.uid()));
-- Deliberately NO insert/update/delete policies: writes are service-role only.

comment on table public.lit_agent_drafts is
  'Project Harvey: one row per Harvey-generated outreach DRAFT (email/linkedin). Nothing is sent — the harvey-writer edge fn (service-role) writes these for human review (pending_approval -> approved/rejected/edited). Read: lead-CRM members. Write: service-role only.';
