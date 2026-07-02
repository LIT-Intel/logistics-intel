-- Lemlist as an async enrichment provider in the existing enrichment system.

create table if not exists public.lit_contact_enrichment_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  requested_by uuid,
  provider text not null default 'lemlist',
  source_context text not null default 'unknown',
  source_entity_type text,
  source_entity_id text,
  status text not null default 'queued' check (status in ('queued','submitted','processing','completed','failed','cancelled')),
  workflows text[] not null default array['find_email','linkedin_enrichment']::text[],
  request_payload jsonb not null default '{}'::jsonb,
  provider_request_id text,
  result jsonb not null default '{}'::jsonb,
  error_message text,
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lit_contact_enrichment_jobs_org_idx on public.lit_contact_enrichment_jobs(org_id, created_at desc);
create index if not exists lit_contact_enrichment_jobs_provider_idx on public.lit_contact_enrichment_jobs(provider, status, created_at desc);
create unique index if not exists lit_contact_enrichment_jobs_provider_request_uidx
  on public.lit_contact_enrichment_jobs(provider, provider_request_id)
  where provider_request_id is not null;

alter table public.lit_contact_enrichment_jobs enable row level security;

drop policy if exists lit_contact_enrichment_jobs_org_read on public.lit_contact_enrichment_jobs;
create policy lit_contact_enrichment_jobs_org_read on public.lit_contact_enrichment_jobs
  for select to authenticated
  using (
    public.is_admin_caller()
    or exists (
      select 1 from public.org_members om
      where om.org_id = lit_contact_enrichment_jobs.org_id
        and om.user_id = auth.uid()
        and coalesce(om.status, 'active') = 'active'
    )
  );

drop policy if exists lit_contact_enrichment_jobs_org_insert on public.lit_contact_enrichment_jobs;
create policy lit_contact_enrichment_jobs_org_insert on public.lit_contact_enrichment_jobs
  for insert to authenticated
  with check (
    public.is_admin_caller()
    or exists (
      select 1 from public.org_members om
      where om.org_id = lit_contact_enrichment_jobs.org_id
        and om.user_id = auth.uid()
        and coalesce(om.status, 'active') = 'active'
    )
  );

drop policy if exists lit_contact_enrichment_jobs_admin_update on public.lit_contact_enrichment_jobs;
create policy lit_contact_enrichment_jobs_admin_update on public.lit_contact_enrichment_jobs
  for update to authenticated
  using (public.is_admin_caller())
  with check (public.is_admin_caller());

drop trigger if exists lit_contact_enrichment_jobs_touch_updated_at on public.lit_contact_enrichment_jobs;
create trigger lit_contact_enrichment_jobs_touch_updated_at
before update on public.lit_contact_enrichment_jobs
for each row execute function public.lit_acquisition_touch_updated_at();

alter table public.lit_contacts
  add column if not exists enrichment_provider text,
  add column if not exists enrichment_job_id uuid references public.lit_contact_enrichment_jobs(id) on delete set null,
  add column if not exists enrichment_result jsonb;

alter table public.lit_org_enrichment_settings
  alter column provider_order set default array['apollo','lusha','lemlist']::text[];

update public.lit_org_enrichment_settings
set provider_order = array_append(array_remove(provider_order, 'lemlist'), 'lemlist'),
    updated_at = now()
where 'lemlist' = any(provider_order);

comment on column public.lit_org_enrichment_settings.provider_order is
  'Ordered enrichment cascade. Valid values: apollo, lusha, lemlist, tier3. Apollo/Lusha return immediate contacts; Lemlist submits async enrichment jobs and should usually run after immediate providers.';
