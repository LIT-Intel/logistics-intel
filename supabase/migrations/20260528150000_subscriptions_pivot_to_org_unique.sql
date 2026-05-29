-- 20260528150000_subscriptions_pivot_to_org_unique.sql
--
-- Phase 6 of the subscriptions org-keyed migration. APPLY ONLY AFTER:
--
--   1. 20260528120000 (Phase 1 schema + backfill) has been applied AND
--      verified — `select count(*) from subscriptions where org_id is null`
--      returns 0 for all active subscriptions (test rows can be excluded).
--   2. 20260528130000 (lifecycle trigger fix) is live.
--   3. 20260528140000 (Phase 3 RLS) has been live for at least 7 days
--      WITHOUT incident in the billing surface.
--   4. billing-webhook has been writing org_id for 7+ days
--      (LIT_BILLING_WEBHOOK_WRITE_ORG_ID=true) so all new rows have org_id.
--   5. All read consumers (get-billing-status, subscription-email-cron,
--      admin-api, OnboardingFlow) prefer org_id over user_id.
--
-- This migration is the irreversible cutover. After it, a user with no
-- org has no subscription. The legacy "owner_user_id = my user_id" path
-- becomes invalid; org membership IS the access boundary.
--
-- Steps:
--   1. Drop the legacy SELECT policy (org members can already read via
--      the Phase 3 policy).
--   2. Make org_id NOT NULL.
--   3. Swap the UNIQUE constraint from user_id to org_id.
--      A single org can have only one active subscription row.
--
-- IF YOU NEED TO ROLL BACK: revert this migration first
-- (re-create the legacy policy, restore the user_id constraint, allow
-- org_id NULL). Then re-deploy edge functions that read from user_id.

begin;

-- 1. Drop the legacy user_id-scoped read policy. The org_id policy from
--    20260528140000 covers the same access in the org-keyed model.
DROP POLICY IF EXISTS "Users can read their own subscription" ON public.subscriptions;

-- 2. Make org_id NOT NULL. Any rows still NULL at this point indicate
--    incomplete backfill; surface the count via a fail-loud assertion.
DO $$
DECLARE
  null_count int;
BEGIN
  SELECT count(*) INTO null_count FROM public.subscriptions WHERE org_id IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION
      'Cannot pivot subscriptions to org-keyed: % rows have NULL org_id. Run backfill from 20260528120000 first.', null_count;
  END IF;
END
$$;

ALTER TABLE public.subscriptions ALTER COLUMN org_id SET NOT NULL;

-- 3. Drop the legacy UNIQUE on user_id and add UNIQUE on org_id. The
--    constraint name in the original migration is unspecified (Postgres
--    auto-named it as subscriptions_user_id_key). We detect it by column
--    rather than by name in case it drifted.
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'subscriptions'
    AND c.contype = 'u'
    AND (
      SELECT array_agg(a.attname ORDER BY u.ord)
      FROM unnest(c.conkey) WITH ORDINALITY AS u(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = u.attnum
    ) = ARRAY['user_id'];
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.subscriptions DROP CONSTRAINT %I', constraint_name);
  END IF;
END
$$;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_org_id_key UNIQUE (org_id);

commit;
