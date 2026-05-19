-- lit_email_events — Resend webhook ingestion table.
--
-- Producer:  marketing/app/api/webhooks/resend/route.ts — Resend POSTs every
--            email lifecycle event (sent/delivered/opened/clicked/bounced/
--            complained/failed) here, signed via Svix HMAC-SHA256.
-- Consumer:  frontend/src/pages/AdminMarketingAnalytics.tsx — reads aggregate
--            KPIs (open rate, click rate, bounce rate, per-template and
--            per-sequence performance) for the in-app Marketing Analytics
--            admin dashboard.
--
-- Indexes cover the three primary query paths:
--   1. lookup-by-resend-email-id   (correlate multi-event timelines)
--   2. time-bucket by event_type   (KPI rollups for the dashboard)
--   3. lookup-by-recipient         (per-lead activity feed)
--   4. lookup-by-template          (per-template performance table)

create table if not exists public.lit_email_events (
  id bigserial primary key,
  resend_email_id text not null,
  event_type text not null,
  email_to text,
  template_id text,
  subject text,
  click_url text,
  user_agent text,
  ip text,
  raw jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_lit_email_events_email_id
  on public.lit_email_events(resend_email_id);

create index if not exists idx_lit_email_events_type_created
  on public.lit_email_events(event_type, created_at desc);

create index if not exists idx_lit_email_events_to
  on public.lit_email_events(lower(email_to));

create index if not exists idx_lit_email_events_template
  on public.lit_email_events(template_id);

alter table public.lit_email_events enable row level security;

-- Service-role webhook ingestion (the marketing-site webhook handler uses
-- SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS by default — this policy
-- is documentation + belt-and-suspenders for any non-service insert).
drop policy if exists "service role full access" on public.lit_email_events;
create policy "service role full access"
  on public.lit_email_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Authenticated read access for platform admins. We piggy-back on the
-- existing public.is_admin_caller() helper from the admin-dashboard
-- migration (20260513120000_admin_dashboard_tables.sql) — same gate the
-- rest of the admin UI uses. If a `is_super_admin()` SQL helper is added
-- later, swap this policy to call it instead.
drop policy if exists "admins can read events" on public.lit_email_events;
create policy "admins can read events"
  on public.lit_email_events
  for select
  to authenticated
  using (public.is_admin_caller());
