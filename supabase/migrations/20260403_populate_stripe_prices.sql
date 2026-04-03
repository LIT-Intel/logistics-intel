-- Populate plans table with Stripe product and price IDs
-- NOTE: These values need to be updated with your actual Stripe product/price IDs
-- You can find them in your Stripe Dashboard under Products or via the Stripe API

-- Update Free Trial plan
UPDATE plans
SET
  stripe_product_id = 'prod_free_trial_placeholder',
  stripe_price_id_monthly = 'price_free_trial_monthly_placeholder',
  stripe_price_id_yearly = 'price_free_trial_yearly_placeholder'
WHERE code = 'free_trial';

-- Update Standard plan
UPDATE plans
SET
  stripe_product_id = 'prod_standard_placeholder',
  stripe_price_id_monthly = 'price_standard_monthly_placeholder',
  stripe_price_id_yearly = 'price_standard_yearly_placeholder'
WHERE code = 'standard';

-- Update Growth plan
UPDATE plans
SET
  stripe_product_id = 'prod_growth_placeholder',
  stripe_price_id_monthly = 'price_growth_monthly_placeholder',
  stripe_price_id_yearly = 'price_growth_yearly_placeholder'
WHERE code = 'growth';

-- Update Enterprise plan
UPDATE plans
SET
  stripe_product_id = 'prod_enterprise_placeholder',
  stripe_price_id_monthly = 'price_enterprise_monthly_placeholder',
  stripe_price_id_yearly = 'price_enterprise_yearly_placeholder'
WHERE code = 'enterprise';
