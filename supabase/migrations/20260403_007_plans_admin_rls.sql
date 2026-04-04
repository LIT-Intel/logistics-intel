/*
  # Plans Table — Admin Write Policies

  The original migration only created a SELECT policy.
  AdminPricingEditor needs UPDATE access for known admin emails.
  INSERT/DELETE are also granted so admins can add or retire plans.

  auth.email() returns the JWT claim email for the current session.
*/

-- Allow ALL authenticated users to also see inactive plans (needed for admin editor)
-- Drop the old "only active" policy and replace with an unrestricted one for admins.

CREATE POLICY "Admins can select all plans"
  ON plans FOR SELECT
  TO authenticated
  USING (
    auth.email() IN ('vraymond@sparkfusiondigital.com', 'support@logisticintel.com')
  );

CREATE POLICY "Admins can insert plans"
  ON plans FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.email() IN ('vraymond@sparkfusiondigital.com', 'support@logisticintel.com')
  );

CREATE POLICY "Admins can update plans"
  ON plans FOR UPDATE
  TO authenticated
  USING (
    auth.email() IN ('vraymond@sparkfusiondigital.com', 'support@logisticintel.com')
  )
  WITH CHECK (
    auth.email() IN ('vraymond@sparkfusiondigital.com', 'support@logisticintel.com')
  );

CREATE POLICY "Admins can delete plans"
  ON plans FOR DELETE
  TO authenticated
  USING (
    auth.email() IN ('vraymond@sparkfusiondigital.com', 'support@logisticintel.com')
  );
