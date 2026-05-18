-- =============================================================================
-- lit_leads
--
-- Marketing-site lead capture from the new "money pages" template. The single
-- POST /api/leads/resend endpoint writes a row here, then fires a Resend
-- transactional email as a best-effort follow-up.
--
-- Distinct from `lit_demo_requests` (high-intent live-demo form). `lit_leads`
-- is the lighter-weight capture used by hero CTAs, lead magnets (e.g. the
-- "Top 100 active shippers" PDF), and trial-start flows. One row per submission.
--
-- `consumed_at` is reserved for downstream flows (e.g. when the lead magnet
-- is delivered, the trial begins, or the lead is converted into a Sanity
-- demoRequest). The API route leaves it null on insert.
--
-- RLS is on with no public policies — only the service-role key can write.
-- =============================================================================

create table if not exists public.lit_leads (
  id           uuid         primary key default gen_random_uuid(),
  email        text         not null,
  source       text,
  offer        text,
  created_at   timestamptz  not null default now(),
  consumed_at  timestamptz
);

comment on table public.lit_leads is
  'Marketing-site lead captures from /api/leads/resend (hero CTAs, lead magnets, trial starts). Distinct from lit_demo_requests (high-intent demo form).';

create index if not exists lit_leads_created_idx
  on public.lit_leads (created_at desc);
create index if not exists lit_leads_email_idx
  on public.lit_leads (lower(email));
create index if not exists lit_leads_offer_idx
  on public.lit_leads (offer) where offer is not null;

alter table public.lit_leads enable row level security;

-- Optional: uncomment to give super-org admins read access via the standard
-- LIT auth pattern. Requires the `is_super_admin()` helper to exist.
-- create policy "super_admins_read_leads"
--   on public.lit_leads for select
--   to authenticated
--   using (is_super_admin());
