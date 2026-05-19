-- =============================================================================
-- lit_marketing_site_events
--
-- First-party event capture for the marketing site at logisticintel.com.
-- Mirrors what we send to Plausible (page_view, form_submit, cta_click,
-- exit_intent_shown, scroll_depth_75, outbound_click, time_on_page_30s)
-- so we can join events to lit_leads (by email) and reason about the
-- end-to-end funnel inside the LIT admin without depending on Plausible's
-- API.
--
-- The marketing client POSTs to /api/events which inserts here using the
-- service-role key. The anon-insert policy below is a defensive secondary
-- path; production traffic should go through the server route which
-- sanitizes and length-caps the payload.
--
-- RLS:
--   - anon: INSERT only (never read).
--   - service_role: full access (the admin dashboard reads via PostgREST
--     with the service role from server components).
-- =============================================================================

create table if not exists public.lit_marketing_site_events (
  id           uuid          primary key default gen_random_uuid(),
  event_name   text          not null,
  path         text,
  properties   jsonb         not null default '{}'::jsonb,
  session_id   text,
  lead_email   text,
  utm          jsonb         not null default '{}'::jsonb,
  referrer     text,
  user_agent   text,
  created_at   timestamptz   not null default now()
);

comment on table public.lit_marketing_site_events is
  'First-party marketing-site event capture (page_view, form_submit, cta_click, exit_intent_shown, scroll_depth_75, outbound_click, time_on_page_30s). Mirrors Plausible custom events for direct querying from the LIT admin dashboard.';

create index if not exists lit_marketing_site_events_name_created_idx
  on public.lit_marketing_site_events (event_name, created_at desc);

create index if not exists lit_marketing_site_events_lead_email_idx
  on public.lit_marketing_site_events (lower(lead_email))
  where lead_email is not null;

create index if not exists lit_marketing_site_events_session_idx
  on public.lit_marketing_site_events (session_id)
  where session_id is not null;

create index if not exists lit_marketing_site_events_created_idx
  on public.lit_marketing_site_events (created_at desc);

alter table public.lit_marketing_site_events enable row level security;

-- anon: insert-only (defensive — primary path is the server route)
drop policy if exists "anon_insert_marketing_events" on public.lit_marketing_site_events;
create policy "anon_insert_marketing_events"
  on public.lit_marketing_site_events
  for insert
  to anon
  with check (true);

-- service_role: full access for the admin dashboard
drop policy if exists "service_role_all_marketing_events" on public.lit_marketing_site_events;
create policy "service_role_all_marketing_events"
  on public.lit_marketing_site_events
  for all
  to service_role
  using (true)
  with check (true);
