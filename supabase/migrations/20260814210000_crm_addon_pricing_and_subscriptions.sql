-- CRM per-seat paid add-on: pricing config + org-level subscription state.
--
-- The CRM (Command Center Pipeline/Tasks/Reports) becomes a paid add-on sold
-- via an embedded Stripe checkout on the Pipeline page. This migration adds:
--
--   1. lit_crm_addon_pricing  — the plan_code -> Stripe price mapping + seat
--      policy. NO price IDs are hardcoded in app code; crm-checkout reads them
--      here at runtime (CLAUDE.md rule #3: Stripe is source of truth, prices
--      live in the DB).
--
--   2. lit_crm_subscriptions  — the org-level CRM add-on subscription state,
--      written ONLY by the (service-role) billing-webhook and read by
--      get-entitlements to derive crm_enabled / crm_seats.
--
-- Stripe product for the add-on: prod_V4aTX3Q8s58UwQ ("LIT CRM").
-- Per-seat MONTHLY prices (given):
--   Starter    price_1U4RIX30nhNIomhFcULM4Zyx  $25  (also free_trial / no-plan)
--   Growth     price_1U4RJv30nhNIomhFCHEWLFKK  $20
--   Scale      price_1U4RL030nhNIomhF5fHK68Zg  $15
--   Enterprise reuses the Scale price ($15) until a dedicated one exists.
--
-- Seats mirror plans.included_seats and are FORCED for growth/scale/enterprise
-- (adjustable_quantity is disabled in checkout when forced_seats is set).

-- ─────────────────────────────────────────────────────────────────────
-- 1. Pricing config
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lit_crm_addon_pricing (
  plan_code        text PRIMARY KEY,
  stripe_price_id  text NOT NULL,
  per_seat_cents   integer NOT NULL,
  forced_seats     integer,           -- NULL = quantity is buyer-adjustable
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.lit_crm_addon_pricing IS
  'Per-plan CRM add-on pricing. Read by crm-checkout at runtime; never hardcode price IDs in app code.';

-- Seed. per_seat_cents is informational (UI banner uses it as a fallback);
-- Stripe is authoritative for the actual charge. forced_seats mirrors
-- plans.included_seats for growth/scale/enterprise (and 1 for starter/free).
INSERT INTO public.lit_crm_addon_pricing (plan_code, stripe_price_id, per_seat_cents, forced_seats) VALUES
  ('free_trial', 'price_1U4RIX30nhNIomhFcULM4Zyx', 2500, 1),
  ('starter',    'price_1U4RIX30nhNIomhFcULM4Zyx', 2500, 1),
  ('growth',     'price_1U4RJv30nhNIomhFCHEWLFKK', 2000, 3),
  ('scale',      'price_1U4RL030nhNIomhF5fHK68Zg', 1500, 5),
  ('enterprise', 'price_1U4RL030nhNIomhF5fHK68Zg', 1500, 10)
ON CONFLICT (plan_code) DO UPDATE
  SET stripe_price_id = EXCLUDED.stripe_price_id,
      per_seat_cents  = EXCLUDED.per_seat_cents,
      forced_seats    = EXCLUDED.forced_seats,
      updated_at      = now();

ALTER TABLE public.lit_crm_addon_pricing ENABLE ROW LEVEL SECURITY;

-- Pricing is non-sensitive catalog data — any authenticated user may read it
-- (the Pipeline banner shows "$X/seat"). Writes are service-role only (RLS
-- denies authenticated by default since no write policy exists).
DROP POLICY IF EXISTS lit_crm_addon_pricing_select ON public.lit_crm_addon_pricing;
CREATE POLICY lit_crm_addon_pricing_select ON public.lit_crm_addon_pricing
  FOR SELECT TO authenticated
  USING (true);

GRANT SELECT ON public.lit_crm_addon_pricing TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Org-level CRM add-on subscription state
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lit_crm_subscriptions (
  org_id                 uuid PRIMARY KEY
                           REFERENCES public.organizations(id) ON DELETE CASCADE,
  status                 text NOT NULL DEFAULT 'inactive',
  stripe_subscription_id text,
  stripe_customer_id     text,
  seats                  integer NOT NULL DEFAULT 1,
  current_period_end     timestamptz,
  updated_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.lit_crm_subscriptions IS
  'Org-level CRM add-on subscription. Written only by billing-webhook (service role); read by get-entitlements to derive crm_enabled/crm_seats.';

CREATE INDEX IF NOT EXISTS lit_crm_subscriptions_sub_id_idx
  ON public.lit_crm_subscriptions (stripe_subscription_id);

ALTER TABLE public.lit_crm_subscriptions ENABLE ROW LEVEL SECURITY;

-- Members of an org may READ their org's CRM subscription (UX hint only; the
-- security boundary is get-entitlements). No write policy => authenticated
-- cannot write; only the service-role webhook writes it.
DROP POLICY IF EXISTS lit_crm_subscriptions_select ON public.lit_crm_subscriptions;
CREATE POLICY lit_crm_subscriptions_select ON public.lit_crm_subscriptions
  FOR SELECT TO authenticated
  USING (
    public.lit_is_org_member(org_id)
    OR EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
  );

GRANT SELECT ON public.lit_crm_subscriptions TO authenticated;
