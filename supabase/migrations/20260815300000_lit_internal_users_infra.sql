-- Test-identity infra: dedicated, additive table + STABLE predicate helper.
-- Additive & non-destructive: no auth schema mutation. Flagged users are
-- EXCLUDED from every activation/funnel/economics metric (see next migration).

create table if not exists public.lit_internal_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  reason     text,
  created_at timestamptz not null default now()
);

comment on table public.lit_internal_users is
  'Production-safe internal/test identities. EXCLUDED from all activation, acquisition-funnel, campaign-funnel, retention-cohort, and provider-economics metrics via is_internal_user(). Additive; does not mutate auth schema.';

alter table public.lit_internal_users enable row level security;

-- Only platform admins may read/manage the internal-user list.
drop policy if exists lit_internal_users_admin_all on public.lit_internal_users;
create policy lit_internal_users_admin_all
  on public.lit_internal_users
  for all
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

-- STABLE predicate: is this user flagged internal/test?
create or replace function public.is_internal_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.lit_internal_users iu where iu.user_id = p_user_id
  );
$$;

comment on function public.is_internal_user(uuid) is
  'True when the user is a flagged internal/test identity. Use in metric RPCs to exclude test traffic from the scoreboard.';

-- Seed with the confirmed internal/owner identities.
--   79c81c33  vraymond@sparkfusiondigital.com : oldest owner account (Jan 2026),
--             platform_admin, sole "converted" row & sole active_paid_customer,
--             but enterprise/active with NO stripe_subscription_id and no listed
--             price => manually-granted comp, not a real paying customer. This is
--             THE flagged walk-the-journey test identity.
--   5a4b1690  evan@logisticintel.com          : platform_admin, @logisticintel.com internal.
--   6307d33c  vraymond@logisticintel.com      : @logisticintel.com owner/internal.
--   3474e8d7  info@logisticintel.com          : @logisticintel.com internal inbox.
-- NOTE: vraymond83@gmail.com (owner personal) is intentionally NOT seeded here --
--   it is an expired real free-trial and flagging it would hide a genuine trial.
insert into public.lit_internal_users (user_id, email, reason) values
  ('79c81c33-3321-4e56-a442-80c74bb887b8','vraymond@sparkfusiondigital.com','Owner original account; platform_admin; comp enterprise (no stripe sub) inflating converted + active_paid. Primary test identity.'),
  ('5a4b1690-2f79-4f98-899d-fd07dc8ee821','evan@logisticintel.com','Internal @logisticintel.com; platform_admin.'),
  ('6307d33c-fd4d-4ff0-a011-67fd9b712ea1','vraymond@logisticintel.com','Internal @logisticintel.com owner/staff account.'),
  ('3474e8d7-e87c-4824-a131-9a673eb61080','info@logisticintel.com','Internal @logisticintel.com inbox/test account.')
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- OWNER: to flag an ADDITIONAL test account later, run (as platform admin):
--   insert into public.lit_internal_users (user_id, email, reason)
--   select id, email, 'my test account' from auth.users where email = 'you@example.com'
--   on conflict (user_id) do nothing;
--   select public.refresh_user_activation();  -- reflect exclusion immediately
-- ---------------------------------------------------------------------------
