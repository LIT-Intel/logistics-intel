-- =============================================================================
-- lit_demo_requests
--
-- Mirror of demo-form submissions from logisticintel.com. The marketing
-- site's POST /api/demo-request fan-out writes here when
-- SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL are set on Vercel.
--
-- The Sanity `demoRequest` doc remains the source of truth (visible in
-- /studio under "Demo requests"). This table exists so the user can:
--   - subscribe to row inserts via Supabase Realtime for instant pings
--   - query lead history with SQL
--   - feed the rows into downstream automation (n8n, retool, dashboards)
--
-- RLS is on with no public policies — only the service-role key can write.
-- =============================================================================

create table if not exists public.lit_demo_requests (
  id            uuid          primary key default gen_random_uuid(),
  sanity_id     text          not null unique,
  name          text          not null,
  email         text          not null,
  company       text,
  domain        text,
  phone         text,
  use_case      text,
  team_size     text,
  primary_goal  text,
  source        text,
  submitted_at  timestamptz   not null,
  created_at    timestamptz   not null default now(),
  status        text          not null default 'new'
);

comment on table public.lit_demo_requests is
  'Marketing-site demo-form submissions mirrored from Sanity. Source of truth is the Sanity demoRequest doc (sanity_id column).';

-- Helpful indexes for the common admin queries: "show me last 50 leads" and
-- "look up by email" / "look up by company".
create index if not exists lit_demo_requests_created_idx
  on public.lit_demo_requests (created_at desc);
create index if not exists lit_demo_requests_email_idx
  on public.lit_demo_requests (lower(email));
create index if not exists lit_demo_requests_company_idx
  on public.lit_demo_requests (lower(company));

-- Lock the table down. Service role bypasses RLS so the API route can still
-- insert. No anon/authenticated read by default — add policies below if you
-- want users to read their own leads or expose a read-only dashboard.
alter table public.lit_demo_requests enable row level security;

-- Optional: uncomment to give super-org admins read access via the standard
-- LIT auth pattern. Requires the `is_super_admin()` helper to exist.
-- create policy "super_admins_read_demo_requests"
--   on public.lit_demo_requests for select
--   to authenticated
--   using (is_super_admin());
