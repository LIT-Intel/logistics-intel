/*
  # LIT Platform Schema - Part 4: Helper Functions and Triggers

  Creates functions and triggers for automatic updates
*/

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_lit_companies_updated_at') THEN
    CREATE TRIGGER update_lit_companies_updated_at
    BEFORE UPDATE ON lit_companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_lit_saved_companies_updated_at') THEN
    CREATE TRIGGER update_lit_saved_companies_updated_at
    BEFORE UPDATE ON lit_saved_companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_lit_contacts_updated_at') THEN
    CREATE TRIGGER update_lit_contacts_updated_at
    BEFORE UPDATE ON lit_contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_lit_campaigns_updated_at') THEN
    CREATE TRIGGER update_lit_campaigns_updated_at
    BEFORE UPDATE ON lit_campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_lit_rfps_updated_at') THEN
    CREATE TRIGGER update_lit_rfps_updated_at
    BEFORE UPDATE ON lit_rfps
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Function to log activity events automatically
CREATE OR REPLACE FUNCTION log_saved_company_activity()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO lit_activity_events (user_id, event_type, company_id, metadata)
  VALUES (NEW.user_id, 'saved_company', NEW.company_id, jsonb_build_object('stage', NEW.stage));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'log_saved_company_insert') THEN
    CREATE TRIGGER log_saved_company_insert
    AFTER INSERT ON lit_saved_companies
    FOR EACH ROW EXECUTE FUNCTION log_saved_company_activity();
  END IF;
END $$;
