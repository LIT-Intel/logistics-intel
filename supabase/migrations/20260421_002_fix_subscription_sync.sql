/*
  # Fix Subscription Sync (Phase 1)

  Reconciles user-level (subscriptions) and org-level (org_billing) subscription tracking.

  Strategy:
  1. Add seat_count to subscriptions table
  2. Add user_plan_override to allow user-specific customization
  3. Create view for unified subscription data
  4. Add sync triggers for subscription/billing changes
*/

-- Add missing columns to subscriptions table
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS seats integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS user_plan_override text,
ADD COLUMN IF NOT EXISTS stripe_price_id_monthly text,
ADD COLUMN IF NOT EXISTS stripe_price_id_yearly text,
ADD COLUMN IF NOT EXISTS billing_interval text DEFAULT 'monthly' CHECK (billing_interval IN ('monthly', 'yearly'));

-- Ensure org_billing has seat tracking
ALTER TABLE org_billing
ADD COLUMN IF NOT EXISTS current_seats integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS max_seats integer;

-- Create unified subscription view (org + user)
CREATE OR REPLACE VIEW subscription_detail AS
SELECT
  s.id as subscription_id,
  s.user_id,
  COALESCE(om.org_id, (SELECT owner_id FROM organizations WHERE owner_id = s.user_id LIMIT 1)) as org_id,
  COALESCE(s.plan_code, ob.plan, 'free_trial') as plan_code,
  s.status as user_status,
  ob.status as org_status,
  s.stripe_customer_id,
  s.stripe_subscription_id,
  COALESCE(s.seats, ob.current_seats, 1) as total_seats,
  ob.max_seats,
  s.current_period_start,
  s.current_period_end,
  s.cancel_at_period_end,
  s.billing_interval,
  ob.token_limit_monthly,
  s.created_at,
  s.updated_at
FROM subscriptions s
LEFT JOIN org_members om ON om.user_id = s.user_id AND om.role = 'owner'
LEFT JOIN org_billing ob ON ob.org_id = COALESCE(om.org_id, (SELECT owner_id FROM organizations WHERE owner_id = s.user_id LIMIT 1));

-- Trigger to sync subscription plan to org_billing when org_members changes
CREATE OR REPLACE FUNCTION sync_subscription_to_org_billing()
RETURNS TRIGGER AS $$
BEGIN
  -- When user is added as owner/admin, ensure org_billing has matching plan
  IF NEW.role IN ('owner', 'admin') THEN
    INSERT INTO org_billing (org_id, plan, current_seats)
    SELECT NEW.org_id, COALESCE(s.plan_code, 'free_trial'), COALESCE(s.seats, 1)
    FROM subscriptions s
    WHERE s.user_id = NEW.user_id
    ON CONFLICT (org_id) DO UPDATE SET
      plan = COALESCE(EXCLUDED.plan, org_billing.plan),
      current_seats = COALESCE(EXCLUDED.current_seats, org_billing.current_seats);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_subscription_on_member_add ON org_members;
CREATE TRIGGER sync_subscription_on_member_add
  AFTER INSERT OR UPDATE ON org_members
  FOR EACH ROW
  EXECUTE FUNCTION sync_subscription_to_org_billing();

-- Ensure subscriptions table has proper RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Update existing RLS policies
DROP POLICY IF EXISTS "Users can view own subscription" ON subscriptions;
CREATE POLICY "Users can view own subscription"
  ON subscriptions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Org admins can view their org's subscription details
CREATE POLICY "Org admins can view org subscription"
  ON subscriptions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members om
      JOIN subscriptions sub ON true
      WHERE om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
      AND sub.user_id = (SELECT owner_id FROM organizations WHERE id = om.org_id)
    )
  );

-- Create indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_code ON subscriptions(plan_code);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_billing_interval ON subscriptions(billing_interval);
