-- Auto-generated nurture emails (2026-08-12, applied to prod via MCP).
-- The email-autogen cron (Fridays) has Claude write a brand-new "LIT
-- Signals" play, stores the structured EmailDef here, and enqueues sends
-- whose template_id is 'gen:<id>'. The dispatcher renders the def
-- per-recipient through the same house layout as hand-written plays.

create table if not exists public.lit_generated_emails (
  id uuid primary key default gen_random_uuid(),
  sequence_key text not null default 'lit-weekly-gen',
  subject text not null,
  def jsonb not null,
  model text,
  created_at timestamptz not null default now()
);

alter table public.lit_generated_emails enable row level security;
drop policy if exists generated_emails_internal_select on public.lit_generated_emails;
create policy generated_emails_internal_select on public.lit_generated_emails
  for select to authenticated
  using (exists (
    select 1 from public.org_members om
    join public.organizations o on o.id = om.org_id
    where om.user_id = auth.uid() and o.is_internal = true
  ));
