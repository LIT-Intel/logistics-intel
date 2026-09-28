-- Share portal for the trade-lanes map (design handoff #2 §4.6).
-- Tokens are ≥128-bit random; excluded fields are redacted SERVER-side in
-- the share-map edge function — they never reach the viewer.
create table if not exists public.lit_share_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  org_id uuid,
  company_id text not null,          -- source_company_key slug
  company_uuid uuid,
  company_name text,
  created_by uuid not null,
  created_by_name text,
  access text not null default 'link' check (access in ('link','invite')),
  invite_emails text[] not null default '{}',
  expires_at timestamptz,            -- null = never
  include jsonb not null default '{"spend":true,"bols":true,"suppliers":true,"carriers":true}'::jsonb,
  initial_state jsonb not null default '{}'::jsonb,
  revoked_at timestamptz,
  view_count integer not null default 0,
  last_viewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.lit_share_links enable row level security;

-- Owners manage their own links; the public viewer path goes through the
-- share-map edge function with the service role (token-validated), so no
-- anon policy exists on purpose.
drop policy if exists lit_share_links_owner_all on public.lit_share_links;
create policy lit_share_links_owner_all on public.lit_share_links
  for all to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create index if not exists lit_share_links_token_idx on public.lit_share_links (token);
create index if not exists lit_share_links_creator_idx on public.lit_share_links (created_by, created_at desc);
create index if not exists lit_share_links_company_idx on public.lit_share_links (company_id, created_at desc);
