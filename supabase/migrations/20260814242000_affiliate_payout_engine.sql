-- Affiliate payout engine
--
-- The affiliate ledger (affiliate_partners / affiliate_commissions /
-- affiliate_payouts) and the Stripe Connect onboarding layer already exist.
-- This migration closes the remaining gap so commissions can actually be paid:
--
--   1. Links a commission to the payout that settled it (affiliate_commissions.payout_id),
--      so the payout runner can stamp each paid commission and the ledger is auditable.
--   2. Adds platform-admin RLS read policies to the three affiliate money tables
--      (partners already have self-read policies; admins had none — they relied on
--      the service-role affiliate-admin edge fn. Adding explicit admin policies
--      makes direct admin reads safe without widening to `authenticated`).
--   3. Re-asserts least-privilege grants: revoke the accidental broad anon/authenticated
--      DML on affiliate_payouts (writes must go through the service-role runner).
--
-- Status vocabulary (affiliate_commissions.status check constraint):
--   pending -> earned -> paid   (voided / flagged are terminal side states)
-- 'earned' == matured & payable (the 30-day hold has elapsed). The payout runner
-- transfers positive sums of 'earned' commissions and moves them to 'paid'.

begin;

-- 1. Commission -> payout link (nullable; set when a payout settles the commission).
alter table public.affiliate_commissions
  add column if not exists payout_id uuid
    references public.affiliate_payouts(id) on delete set null;

create index if not exists affiliate_commissions_payout_id_idx
  on public.affiliate_commissions (payout_id);

-- Helps the payout runner's per-partner "positive sum of unpaid earned" scan.
create index if not exists affiliate_commissions_partner_status_idx
  on public.affiliate_commissions (partner_id, status);

-- 2. platform_admins helper predicate reused by policies.
--    (auth.uid() is in platform_admins)
do $$
begin
  -- affiliate_partners: admins can read all
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'affiliate_partners'
      and policyname = 'Platform admins can read all partners'
  ) then
    create policy "Platform admins can read all partners"
      on public.affiliate_partners for select to authenticated
      using (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()));
  end if;

  -- affiliate_commissions: admins can read all
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'affiliate_commissions'
      and policyname = 'Platform admins can read all commissions'
  ) then
    create policy "Platform admins can read all commissions"
      on public.affiliate_commissions for select to authenticated
      using (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()));
  end if;

  -- affiliate_payouts: admins can read all
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'affiliate_payouts'
      and policyname = 'Platform admins can read all payouts'
  ) then
    create policy "Platform admins can read all payouts"
      on public.affiliate_payouts for select to authenticated
      using (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()));
  end if;
end $$;

-- 3. Least-privilege grants.
--    All writes to the money tables happen via the service role (payout runner,
--    commission crediter, affiliate-admin). Reads are governed by RLS. Revoke the
--    accidental broad write grants; service_role bypasses RLS and keeps full DML.
revoke insert, update, delete, truncate on public.affiliate_payouts from anon, authenticated;
revoke insert, update, delete, truncate on public.affiliate_commissions from anon, authenticated;

grant select on public.affiliate_payouts to authenticated;
grant select on public.affiliate_commissions to authenticated;
grant select on public.affiliate_partners to authenticated;

grant all on public.affiliate_payouts to service_role;
grant all on public.affiliate_commissions to service_role;
grant all on public.affiliate_partners to service_role;

commit;
