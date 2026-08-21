-- ─────────────────────────────────────────────────────────────────────────────
-- Project Harvey — Batch 5: LEAD RESEARCH BRIEFS
--
-- Applied by the orchestrator via MCP (mcp apply_migration). Do NOT apply by
-- hand; this file is written to be applied verbatim to prod, idempotently.
--
-- Builds on:
--   20260821000000_harvey_foundation.sql        (lit_agent_touch_updated_at()
--                                                 trigger fn, is_lead_crm_member())
--   20260821030000_harvey_writer_drafts.sql      (same access-model conventions)
--
-- What this creates:
--   public.lit_agent_lead_research — one row per Harvey-generated per-lead
--   RESEARCH BRIEF. The harvey-research edge fn (service-role) writes these; they
--   are a DECISION-SUPPORT artifact for the sales team + the writer, NOT part of
--   Harvey's prompt-grounding knowledge base (kept deliberately OUT of
--   lit_agent_knowledge so unverified per-lead reasoning never grounds outreach
--   copy). A brief carries the structured fit assessment (fit_score + reasons),
--   the facts the model relied on (each with a source), the recommended angle /
--   channel / CTA, and any risk flags.
--
-- Soft reference: lead_id is a nullable soft ref to lit_admin_leads (NO foreign
-- key) so a brief can outlive/precede a lead row and archival/deletion of a
-- lead never cascades into the research/audit trail. company_id is likewise a
-- loose ref (no fk) so it can hold either a lit_companies uuid or be null.
--
-- Access model mirrors the Harvey foundation exactly:
--   - READ:  authenticated users passing public.is_lead_crm_member(auth.uid())
--   - WRITE: service-role only (no authenticated INSERT/UPDATE/DELETE policies)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.lit_agent_lead_research (
  id                   uuid primary key default gen_random_uuid(),
  agent_name           text not null default 'harvey',
  lead_id              uuid,            -- soft ref to lit_admin_leads; NO fk
  company_id           uuid,            -- loose ref (lit_companies.id); NO fk
  brief_json           jsonb not null,
  fit_score            int,
  confidence           numeric,
  recommended_channel  text,
  recommended_cta      text,
  risk_flags           jsonb,
  model                text,
  created_by           uuid references auth.users(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists lit_agent_lead_research_agent_lead_created_idx
  on public.lit_agent_lead_research (agent_name, lead_id, created_at desc);

drop trigger if exists trg_lit_agent_lead_research_touch on public.lit_agent_lead_research;
create trigger trg_lit_agent_lead_research_touch
  before update on public.lit_agent_lead_research
  for each row execute function public.lit_agent_touch_updated_at();

alter table public.lit_agent_lead_research enable row level security;

drop policy if exists lit_agent_lead_research_member_read on public.lit_agent_lead_research;
create policy lit_agent_lead_research_member_read on public.lit_agent_lead_research
  for select to authenticated
  using (public.is_lead_crm_member(auth.uid()));
-- Deliberately NO insert/update/delete policies: writes are service-role only.

comment on table public.lit_agent_lead_research is
  'Project Harvey: one row per Harvey-generated per-lead RESEARCH BRIEF. Decision-support only — deliberately kept OUT of the prompt-grounding knowledge base (lit_agent_knowledge). The harvey-research edge fn (service-role) writes these from facts actually present on the lead/company. Read: lead-CRM members. Write: service-role only.';
