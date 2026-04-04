/*
  # Subscriptions Table

  User-centric billing record.  billing-checkout writes here after creating a
  Stripe checkout session.  billing-portal reads stripe_customer_id from here.

  One row per user (unique on user_id).  on_conflict=user_id upsert used by
  the edge function so older rows are updated in place.
*/

CREATE TABLE IF NOT EXISTS subscriptions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_code               text NOT NULL DEFAULT 'free_trial',
  stripe_customer_id      text,
  stripe_subscription_id  text,
  stripe_price_id         text,
  status                  text NOT NULL DEFAULT 'incomplete'
                            CHECK (status IN ('active', 'trialing', 'incomplete',
                                              'incomplete_expired', 'past_due',
                                              'canceled', 'unpaid', 'paused')),
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  cancel_at_period_end    boolean DEFAULT false,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can read their own subscription
CREATE POLICY "Users can view own subscription"
  ON subscriptions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can insert their own subscription row (billing-checkout runs as the user)
CREATE POLICY "Users can insert own subscription"
  ON subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update their own subscription
CREATE POLICY "Users can update own subscription"
  ON subscriptions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Service role (Stripe webhook handler) can do anything
-- (service_role bypasses RLS by default, no policy needed)

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
