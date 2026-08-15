-- Lead-CRM Phase 2 — Part 1: company-recognition columns on lit_admin_leads.
--
-- Every lead/opportunity should auto-recognize its company and cache the
-- resolved identity (logo domain, location, ImportYeti snapshot key) directly
-- on the lead row so the list + drawer can render without a per-row lookup.
--
-- REUSE, do not rebuild: the recognizer (next migration) matches against the
-- existing lit_companies / lit_company_directory data and the logo domain is
-- resolved from the same domain the marketing/app logo.dev helper consumes.
-- No provider credits are spent — these are cached reads only.

alter table public.lit_admin_leads
  add column if not exists company_id            uuid references public.lit_companies(id) on delete set null,
  add column if not exists source_company_key    text,   -- ImportYeti snapshot key (bare slug, no 'company/' prefix)
  add column if not exists company_domain         text,
  add column if not exists company_logo_url       text,
  add column if not exists company_country        text,
  add column if not exists company_city           text,
  add column if not exists company_state          text,
  add column if not exists company_recognized_at  timestamptz;

create index if not exists idx_lit_admin_leads_company_id on public.lit_admin_leads(company_id);
create index if not exists idx_lit_admin_leads_source_company_key on public.lit_admin_leads(source_company_key);

comment on column public.lit_admin_leads.company_id is
  'Resolved lit_companies.id when the lead''s company was confidently recognized (null = not recognized).';
comment on column public.lit_admin_leads.source_company_key is
  'Bare ImportYeti snapshot slug (e.g. "the-home-depot") when a snapshot exists for the recognized company.';
comment on column public.lit_admin_leads.company_logo_url is
  'logo.dev resolved logo URL (from company_domain). Same resolution the app/marketing logo helper uses.';
