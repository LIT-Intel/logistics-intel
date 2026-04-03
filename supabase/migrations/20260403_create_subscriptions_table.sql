-- Create subscriptions table for user subscription tracking
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  plan_code text NOT NULL,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text DEFAULT 'incomplete' CHECK (status IN ('incomplete', 'active', 'past_due', 'canceled')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own subscription"
  ON subscriptions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "System can insert/update subscriptions"
  ON subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "System can update subscriptions"
  ON subscriptions FOR UPDATE
  TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
