-- Create plans table for billing integration with Stripe
CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  price_monthly numeric(10,2),
  price_yearly numeric(10,2),
  stripe_product_id text,
  stripe_price_id_monthly text,
  stripe_price_id_yearly text,
  max_companies integer,
  max_emails integer,
  max_rfps integer,
  enrichment_enabled boolean DEFAULT false,
  campaigns_enabled boolean DEFAULT false,
  is_active boolean DEFAULT true,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view active plans"
  ON plans FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Insert default plans (without Stripe IDs initially - these need to be populated from Stripe)
INSERT INTO plans (code, name, description, price_monthly, price_yearly, max_companies, max_emails, max_rfps, enrichment_enabled, campaigns_enabled, is_active, display_order)
VALUES
  ('free_trial', 'Free Trial', 'Get started with Logistics Intel', 0, 0, 10, 50, 5, false, false, true, 0),
  ('standard', 'Standard', 'For growing teams', 49.00, 490.00, 100, 500, 50, true, false, true, 1),
  ('growth', 'Growth', 'For scaling operations', 299.00, 2990.00, 500, 2500, 200, true, true, true, 2),
  ('enterprise', 'Enterprise', 'Custom for large organizations', null, null, null, null, null, true, true, true, 3)
ON CONFLICT (code) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_plans_code ON plans(code);
CREATE INDEX IF NOT EXISTS idx_plans_is_active ON plans(is_active);
CREATE INDEX IF NOT EXISTS idx_plans_stripe_product_id ON plans(stripe_product_id);
