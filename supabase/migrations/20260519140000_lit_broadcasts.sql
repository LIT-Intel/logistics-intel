-- lit_broadcasts — audit history for Resend one-off broadcast sends.
--
-- Producer:  marketing/app/api/admin/broadcasts/route.ts — server proxy that
--            POSTs a composed message to the Resend /broadcasts endpoint and
--            writes one row here per save / queue / send action. Resend
--            owns dispatch + delivery telemetry; this table is the LIT-side
--            audit trail (who composed it, what audience, when it was
--            scheduled, what subject + html).
-- Consumer:  frontend/src/pages/AdminMarketingBroadcasts.tsx — admin UI that
--            lists past + draft broadcasts and seeds the composer when an
--            operator clicks "Duplicate" on a prior send.
--
-- All write traffic goes through the marketing-site server route, so the
-- production write path uses the service-role key and bypasses RLS. The
-- "admins manage broadcasts" policy is still here so authenticated admin
-- sessions (e.g. via the in-app Supabase client) can SELECT directly for
-- the history table without round-tripping through the marketing proxy.

create table if not exists public.lit_broadcasts (
  id uuid primary key default gen_random_uuid(),
  resend_broadcast_id text,
  name text not null,
  audience_id text not null,
  audience_name text,
  from_email text not null,
  reply_to_email text,
  subject text not null,
  preview_text text,
  html text not null,
  status text not null default 'draft',  -- draft / queued / sending / sent / failed
  scheduled_at timestamptz,
  sent_at timestamptz,
  sent_count int,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_lit_broadcasts_status_created
  on public.lit_broadcasts(status, created_at desc);

create index if not exists idx_lit_broadcasts_resend_id
  on public.lit_broadcasts(resend_broadcast_id);

alter table public.lit_broadcasts enable row level security;

drop policy if exists "admins manage broadcasts" on public.lit_broadcasts;
create policy "admins manage broadcasts"
  on public.lit_broadcasts
  for all
  to authenticated
  using (public.is_admin_caller())
  with check (public.is_admin_caller());

drop policy if exists "service role full access broadcasts" on public.lit_broadcasts;
create policy "service role full access broadcasts"
  on public.lit_broadcasts
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Touch updated_at on UPDATE.
create or replace function public.lit_broadcasts_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_lit_broadcasts_updated_at on public.lit_broadcasts;
create trigger trg_lit_broadcasts_updated_at
  before update on public.lit_broadcasts
  for each row
  execute function public.lit_broadcasts_touch_updated_at();
