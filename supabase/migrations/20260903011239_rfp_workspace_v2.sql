-- RFP Workspace v2
--
-- Additive only. This migration deliberately does not touch plans,
-- subscriptions, Stripe, credits, or entitlement resolution. Billing can add
-- the final `rfp` feature mapping after its current redesign lands.

begin;

alter table public.lit_rfps
  add column if not exists rfp_number text,
  add column if not exists owner_user_id uuid,
  add column if not exists due_date date,
  add column if not exists estimated_annual_value numeric not null default 0,
  add column if not exists primary_mode text,
  add column if not exists lane_count integer not null default 0;

create unique index if not exists lit_rfps_org_number_uq
  on public.lit_rfps(org_id, rfp_number)
  where rfp_number is not null;
create index if not exists lit_rfps_org_status_updated_idx
  on public.lit_rfps(org_id, status, updated_at desc);
create index if not exists lit_rfps_due_date_idx
  on public.lit_rfps(org_id, due_date)
  where due_date is not null;

create table if not exists public.lit_rfp_counters (
  org_id uuid not null references public.organizations(id) on delete cascade,
  year integer not null,
  seq integer not null default 0,
  primary key (org_id, year)
);

-- Called only by service-role Edge Functions. Keeping EXECUTE away from
-- client roles prevents users from burning or probing another org's sequence.
create or replace function public.assign_rfp_number(p_org uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer := extract(year from now())::integer;
  v_seq integer;
begin
  insert into public.lit_rfp_counters(org_id, year, seq)
  values (p_org, v_year, 1)
  on conflict (org_id, year)
  do update set seq = public.lit_rfp_counters.seq + 1
  returning seq into v_seq;

  return 'RFP-' || v_year || '-' || lpad(v_seq::text, 4, '0');
end;
$$;

revoke all on function public.assign_rfp_number(uuid) from public, anon, authenticated;
grant execute on function public.assign_rfp_number(uuid) to service_role;

create table if not exists public.lit_rfp_events (
  id uuid primary key default gen_random_uuid(),
  rfp_id uuid not null references public.lit_rfps(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null,
  event_payload jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists lit_rfp_events_rfp_created_idx
  on public.lit_rfp_events(rfp_id, created_at desc);

create table if not exists public.lit_rfp_documents (
  id uuid primary key default gen_random_uuid(),
  rfp_id uuid not null references public.lit_rfps(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  uploaded_by uuid not null,
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  document_type text not null default 'supporting',
  created_at timestamptz not null default now()
);
create index if not exists lit_rfp_documents_rfp_created_idx
  on public.lit_rfp_documents(rfp_id, created_at desc);

alter table public.lit_quotes
  add column if not exists rfp_id uuid references public.lit_rfps(id) on delete set null,
  add column if not exists revision_no integer not null default 1;
create index if not exists lit_quotes_rfp_revision_idx
  on public.lit_quotes(rfp_id, revision_no desc)
  where rfp_id is not null;

alter table public.lit_rfp_events enable row level security;
alter table public.lit_rfp_documents enable row level security;

drop policy if exists lit_rfp_events_select on public.lit_rfp_events;
drop policy if exists lit_rfp_events_insert on public.lit_rfp_events;
create policy lit_rfp_events_select on public.lit_rfp_events
  for select to authenticated
  using (
    org_id in (
      select om.org_id from public.org_members om
      where om.user_id = (select auth.uid()) and om.status = 'active'
    )
    or exists (
      select 1 from public.platform_admins pa
      where pa.user_id = (select auth.uid())
    )
  );
create policy lit_rfp_events_insert on public.lit_rfp_events
  for insert to authenticated
  with check (
    org_id in (
      select om.org_id from public.org_members om
      where om.user_id = (select auth.uid()) and om.status = 'active'
    )
    and (created_by is null or created_by = (select auth.uid()))
  );

drop policy if exists lit_rfp_documents_select on public.lit_rfp_documents;
drop policy if exists lit_rfp_documents_insert on public.lit_rfp_documents;
drop policy if exists lit_rfp_documents_delete on public.lit_rfp_documents;
create policy lit_rfp_documents_select on public.lit_rfp_documents
  for select to authenticated
  using (
    org_id in (
      select om.org_id from public.org_members om
      where om.user_id = (select auth.uid()) and om.status = 'active'
    )
    or exists (
      select 1 from public.platform_admins pa
      where pa.user_id = (select auth.uid())
    )
  );
create policy lit_rfp_documents_insert on public.lit_rfp_documents
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and org_id in (
      select om.org_id from public.org_members om
      where om.user_id = (select auth.uid()) and om.status = 'active'
    )
  );
create policy lit_rfp_documents_delete on public.lit_rfp_documents
  for delete to authenticated
  using (
    uploaded_by = (select auth.uid())
    or exists (
      select 1 from public.org_members om
      where om.org_id = lit_rfp_documents.org_id
        and om.user_id = (select auth.uid())
        and om.status = 'active'
        and om.role in ('owner', 'admin')
    )
  );

-- Existing update policy lacked WITH CHECK, allowing ownership/org columns to
-- be reassigned after a row was authorized. Preserve its intended access while
-- closing that boundary.
drop policy if exists lit_rfps_update on public.lit_rfps;
create policy lit_rfps_update on public.lit_rfps
  for update to authenticated
  using (
    (select auth.uid()) = user_id
    or exists (
      select 1 from public.org_members om
      where om.org_id = lit_rfps.org_id
        and om.user_id = (select auth.uid())
        and om.role in ('owner', 'admin')
        and om.status = 'active'
    )
  )
  with check (
    org_id in (
      select om.org_id from public.org_members om
      where om.user_id = (select auth.uid()) and om.status = 'active'
    )
    and (
      (select auth.uid()) = user_id
      or exists (
        select 1 from public.org_members om
        where om.org_id = lit_rfps.org_id
          and om.user_id = (select auth.uid())
          and om.role in ('owner', 'admin')
          and om.status = 'active'
      )
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rfp-documents',
  'rfp-documents',
  false,
  10485760,
  array[
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
)
on conflict (id) do nothing;

-- Storage paths are `{org_id}/{rfp_id}/{uuid}-{name}`. Membership in the
-- first path segment is the storage authorization boundary.
drop policy if exists lit_rfp_storage_select on storage.objects;
drop policy if exists lit_rfp_storage_insert on storage.objects;
drop policy if exists lit_rfp_storage_delete on storage.objects;
create policy lit_rfp_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'rfp-documents'
    and (storage.foldername(name))[1] in (
      select om.org_id::text from public.org_members om
      where om.user_id = (select auth.uid()) and om.status = 'active'
    )
  );
create policy lit_rfp_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'rfp-documents'
    and (storage.foldername(name))[1] in (
      select om.org_id::text from public.org_members om
      where om.user_id = (select auth.uid()) and om.status = 'active'
    )
  );
create policy lit_rfp_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'rfp-documents'
    and (storage.foldername(name))[1] in (
      select om.org_id::text from public.org_members om
      where om.user_id = (select auth.uid()) and om.status = 'active'
    )
  );

commit;
