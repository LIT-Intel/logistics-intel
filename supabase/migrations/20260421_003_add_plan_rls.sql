/*
  # Add RLS Policies for Plan Access (Phase 1)

  Ensures:
  1. Plans table is publicly readable for authenticated users
  2. Subscriptions sync with billing records
  3. Audit trail for plan changes
*/

-- Ensure plans table has proper RLS
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Everyone can view active plans" ON plans;

-- Everyone can view active plans
CREATE POLICY "Everyone can view active plans"
  ON plans FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Only super admin can update plans
DROP POLICY IF EXISTS "Super admin can update plans" ON plans;
CREATE POLICY "Super admin can update plans"
  ON plans FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT user_id FROM org_members
      WHERE org_id = (
        SELECT id FROM organizations
        WHERE owner_id = auth.uid()
      )
      AND role = 'owner'
    )
    OR EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
      AND email IN ('vraymond@sparkfusiondigital.com', 'support@logisticintel.com')
    )
  );

-- Create audit table for plan changes (immutable)
CREATE TABLE IF NOT EXISTS plan_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_code text NOT NULL,
  change_type text NOT NULL CHECK (change_type IN ('created', 'updated', 'deleted')),
  old_values jsonb,
  new_values jsonb,
  changed_by uuid,
  changed_at timestamptz DEFAULT now()
);

ALTER TABLE plan_audit_log ENABLE ROW LEVEL SECURITY;

-- Admins can view plan audit logs
CREATE POLICY "Admins can view plan audit"
  ON plan_audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
      AND email IN ('vraymond@sparkfusiondigital.com', 'support@logisticintel.com')
    )
  );

-- System can insert audit records
CREATE POLICY "System can create plan audit"
  ON plan_audit_log FOR INSERT
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_plan_audit_log_plan_code ON plan_audit_log(plan_code);
CREATE INDEX IF NOT EXISTS idx_plan_audit_log_changed_at ON plan_audit_log(changed_at);

-- Trigger to log plan changes
CREATE OR REPLACE FUNCTION log_plan_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO plan_audit_log (plan_code, change_type, old_values, new_values, changed_by)
    VALUES (NEW.code, 'updated', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO plan_audit_log (plan_code, change_type, new_values, changed_by)
    VALUES (NEW.code, 'created', to_jsonb(NEW), auth.uid());
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO plan_audit_log (plan_code, change_type, old_values, changed_by)
    VALUES (OLD.code, 'deleted', to_jsonb(OLD), auth.uid());
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS plan_changes_trigger ON plans;
CREATE TRIGGER plan_changes_trigger
  BEFORE INSERT OR UPDATE OR DELETE ON plans
  FOR EACH ROW
  EXECUTE FUNCTION log_plan_changes();

-- Ensure org_billing has consistent plan codes with subscriptions
ALTER TABLE org_billing
ADD CONSTRAINT fk_org_billing_plan
CHECK (plan IN ('free_trial', 'standard', 'growth', 'enterprise'));

ALTER TABLE subscriptions
ADD CONSTRAINT fk_subscriptions_plan
CHECK (plan_code IN ('free_trial', 'standard', 'growth', 'enterprise'));
