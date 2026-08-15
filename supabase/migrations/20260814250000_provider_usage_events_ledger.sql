-- Phase 2A (data-economics): provider cost ledger.
-- Written by the Phase 2B gateway (service-role only).
-- platform_admins may SELECT (provider-cost visibility is platform-admin-only per CLAUDE.md rule 5/6).
create table if not exists public.provider_usage_events (
  id                   uuid primary key default gen_random_uuid(),
  provider             text not null,
  operation            text not null,
  organization_id      uuid,
  user_id              uuid,
  company_id           uuid,
  saved_company_id     uuid,
  subscription_tier    text,
  request_id           text,
  provider_request_id  text,
  credits_consumed     numeric not null default 0,
  estimated_cost_usd   numeric not null default 0,
  status               text not null default 'success',
  cache_hit            boolean not null default false,
  trigger_type         text,
  source               text,
  metadata             jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now()
);

create index if not exists idx_provider_usage_events_org_created
  on public.provider_usage_events (organization_id, created_at desc);
create index if not exists idx_provider_usage_events_operation_created
  on public.provider_usage_events (operation, created_at desc);
create index if not exists idx_provider_usage_events_created
  on public.provider_usage_events (created_at desc);
create index if not exists idx_provider_usage_events_provider_created
  on public.provider_usage_events (provider, created_at desc);

alter table public.provider_usage_events enable row level security;

-- platform admins (platform-level ONLY, not org admins) may read
drop policy if exists provider_usage_events_admin_read on public.provider_usage_events;
create policy provider_usage_events_admin_read
  on public.provider_usage_events
  for select
  to authenticated
  using (public.is_platform_admin(auth.uid()));

-- No INSERT/UPDATE/DELETE policies for authenticated => writes are service-role only.

revoke all on public.provider_usage_events from public, anon;
grant select on public.provider_usage_events to authenticated;
grant select, insert, update, delete on public.provider_usage_events to service_role;

comment on table public.provider_usage_events is
  'Phase 2A cost ledger. Provider API cost/credit events. Written by Phase 2B gateway (service-role). platform_admins SELECT only.';
comment on column public.provider_usage_events.credits_consumed is 'Provider credits consumed by this call (numeric; deep_history is fractional).';
comment on column public.provider_usage_events.estimated_cost_usd is 'credits_consumed * provider_pricing.usd_cost_per_credit at call time.';
comment on column public.provider_usage_events.cache_hit is 'True when served from cache (no provider credits spent).';
comment on column public.provider_usage_events.trigger_type is 'One of provider_operations.ts TRIGGER_TYPES (user/cron/background/admin/system/retry).';
