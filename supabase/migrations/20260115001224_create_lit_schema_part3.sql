/*
  # LIT Platform Schema - Part 3: Campaigns, RFPs, Activity

  Creates campaign, RFP, and activity tracking tables
*/

-- ============================================================================
-- 6. LIT_CAMPAIGNS - Campaign management
-- ============================================================================

CREATE TABLE IF NOT EXISTS lit_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  channel text,
  metrics jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lit_campaigns_user ON lit_campaigns(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_lit_campaigns_status ON lit_campaigns(user_id, status);

ALTER TABLE lit_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own campaigns"
  ON lit_campaigns FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own campaigns"
  ON lit_campaigns FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own campaigns"
  ON lit_campaigns FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own campaigns"
  ON lit_campaigns FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- 7. LIT_CAMPAIGN_COMPANIES - Campaign-company relationships
-- ============================================================================

CREATE TABLE IF NOT EXISTS lit_campaign_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES lit_campaigns(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES lit_companies(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_lit_campaign_companies_campaign ON lit_campaign_companies(campaign_id);
CREATE INDEX IF NOT EXISTS idx_lit_campaign_companies_company ON lit_campaign_companies(company_id);

ALTER TABLE lit_campaign_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their campaign companies"
  ON lit_campaign_companies FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM lit_campaigns
      WHERE lit_campaigns.id = campaign_id
      AND lit_campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their campaign companies"
  ON lit_campaign_companies FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM lit_campaigns
      WHERE lit_campaigns.id = campaign_id
      AND lit_campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their campaign companies"
  ON lit_campaign_companies FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM lit_campaigns
      WHERE lit_campaigns.id = campaign_id
      AND lit_campaigns.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 8. LIT_RFPS - RFP Studio tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS lit_rfps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid REFERENCES lit_companies(id) ON DELETE SET NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  payload jsonb,
  pdf_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lit_rfps_user ON lit_rfps(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_lit_rfps_status ON lit_rfps(user_id, status);
CREATE INDEX IF NOT EXISTS idx_lit_rfps_company ON lit_rfps(company_id) WHERE company_id IS NOT NULL;

ALTER TABLE lit_rfps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own RFPs"
  ON lit_rfps FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own RFPs"
  ON lit_rfps FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own RFPs"
  ON lit_rfps FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own RFPs"
  ON lit_rfps FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- 9. LIT_ACTIVITY_EVENTS - Activity timeline
-- ============================================================================

CREATE TABLE IF NOT EXISTS lit_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  company_id uuid REFERENCES lit_companies(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES lit_contacts(id) ON DELETE SET NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lit_events_user ON lit_activity_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lit_events_type ON lit_activity_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lit_events_company ON lit_activity_events(company_id, created_at DESC) WHERE company_id IS NOT NULL;

ALTER TABLE lit_activity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own activity events"
  ON lit_activity_events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own activity events"
  ON lit_activity_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
