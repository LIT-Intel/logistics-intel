/*
  # LIT Outbound Engine Schema — Phase A (additive)

  Creates the tables, indexes, RLS policies, and triggers required to
  support the Outbound Engine rebuild without touching any existing
  table. All objects use IF NOT EXISTS so the migration is safe to
  re-run.

  Tables created:
    - lit_sequences          named sequence templates
    - lit_campaign_steps     ordered steps attached to a campaign
    - lit_outreach_history   per-recipient send / open / reply events
    - lit_email_accounts     connected Gmail / Outlook / SMTP inboxes
    - lit_oauth_tokens       encrypted access/refresh tokens
                             (RLS blocks authenticated access —
                              service role only)

  NOT modified:
    lit_campaigns, lit_campaign_companies, lit_saved_companies,
    lit_saved_contacts, lit_companies, lit_contacts,
    lit_activity_events, ImportYeti tables, any Settings / Billing
    tables.

  Reuses update_updated_at_column() from part4_triggers.
*/

-- ============================================================================
-- 1. LIT_SEQUENCES — named multi-step sequences (templates)
-- ============================================================================

CREATE TABLE IF NOT EXISTS lit_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  channel text NOT NULL DEFAULT 'email',
  status text NOT NULL DEFAULT 'draft',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lit_sequences_user
  ON lit_sequences(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_lit_sequences_status
  ON lit_sequences(user_id, status);

ALTER TABLE lit_sequences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lit_sequences'
      AND policyname = 'Users can view their own sequences'
  ) THEN
    CREATE POLICY "Users can view their own sequences"
      ON lit_sequences FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lit_sequences'
      AND policyname = 'Users can insert their own sequences'
  ) THEN
    CREATE POLICY "Users can insert their own sequences"
      ON lit_sequences FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lit_sequences'
      AND policyname = 'Users can update their own sequences'
  ) THEN
    CREATE POLICY "Users can update their own sequences"
      ON lit_sequences FOR UPDATE TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lit_sequences'
      AND policyname = 'Users can delete their own sequences'
  ) THEN
    CREATE POLICY "Users can delete their own sequences"
      ON lit_sequences FOR DELETE TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================================================
-- 2. LIT_CAMPAIGN_STEPS — ordered steps inside a campaign
-- ============================================================================

CREATE TABLE IF NOT EXISTS lit_campaign_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES lit_campaigns(id) ON DELETE CASCADE,
  sequence_id uuid REFERENCES lit_sequences(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  step_order integer NOT NULL,
  channel text NOT NULL DEFAULT 'email',
  step_type text NOT NULL DEFAULT 'email',
  subject text,
  body text,
  delay_days integer NOT NULL DEFAULT 0,
  delay_hours integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_lit_campaign_steps_campaign
  ON lit_campaign_steps(campaign_id, step_order);
CREATE INDEX IF NOT EXISTS idx_lit_campaign_steps_user
  ON lit_campaign_steps(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_lit_campaign_steps_sequence
  ON lit_campaign_steps(sequence_id) WHERE sequence_id IS NOT NULL;

ALTER TABLE lit_campaign_steps ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lit_campaign_steps'
      AND policyname = 'Users can view their own campaign steps'
  ) THEN
    CREATE POLICY "Users can view their own campaign steps"
      ON lit_campaign_steps FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lit_campaign_steps'
      AND policyname = 'Users can insert their own campaign steps'
  ) THEN
    CREATE POLICY "Users can insert their own campaign steps"
      ON lit_campaign_steps FOR INSERT TO authenticated
      WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
          SELECT 1 FROM lit_campaigns
          WHERE lit_campaigns.id = lit_campaign_steps.campaign_id
            AND lit_campaigns.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lit_campaign_steps'
      AND policyname = 'Users can update their own campaign steps'
  ) THEN
    CREATE POLICY "Users can update their own campaign steps"
      ON lit_campaign_steps FOR UPDATE TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lit_campaign_steps'
      AND policyname = 'Users can delete their own campaign steps'
  ) THEN
    CREATE POLICY "Users can delete their own campaign steps"
      ON lit_campaign_steps FOR DELETE TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================================================
-- 3. LIT_OUTREACH_HISTORY — per-recipient send / open / reply events
-- ============================================================================

CREATE TABLE IF NOT EXISTS lit_outreach_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES lit_campaigns(id) ON DELETE SET NULL,
  campaign_step_id uuid REFERENCES lit_campaign_steps(id) ON DELETE SET NULL,
  company_id uuid REFERENCES lit_companies(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES lit_contacts(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  channel text NOT NULL DEFAULT 'email',
  event_type text NOT NULL,
  status text,
  subject text,
  message_id text,
  provider text,
  provider_event_id text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lit_outreach_history_user
  ON lit_outreach_history(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_lit_outreach_history_campaign
  ON lit_outreach_history(campaign_id, occurred_at DESC)
  WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lit_outreach_history_step
  ON lit_outreach_history(campaign_step_id, occurred_at DESC)
  WHERE campaign_step_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lit_outreach_history_contact
  ON lit_outreach_history(contact_id, occurred_at DESC)
  WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lit_outreach_history_event
  ON lit_outreach_history(event_type, occurred_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lit_outreach_history_provider_event
  ON lit_outreach_history(provider, provider_event_id)
  WHERE provider IS NOT NULL AND provider_event_id IS NOT NULL;

ALTER TABLE lit_outreach_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lit_outreach_history'
      AND policyname = 'Users can view their own outreach history'
  ) THEN
    CREATE POLICY "Users can view their own outreach history"
      ON lit_outreach_history FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lit_outreach_history'
      AND policyname = 'Users can insert their own outreach events'
  ) THEN
    CREATE POLICY "Users can insert their own outreach events"
      ON lit_outreach_history FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
  -- No UPDATE / DELETE policies for authenticated users. Events are
  -- append-only from the app surface; webhook ingestion runs under
  -- service role and bypasses RLS.
END $$;

-- ============================================================================
-- 4. LIT_EMAIL_ACCOUNTS — connected Gmail / Outlook / SMTP inboxes
-- ============================================================================

CREATE TABLE IF NOT EXISTS lit_email_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL,
  email text NOT NULL,
  display_name text,
  status text NOT NULL DEFAULT 'disconnected',
  is_primary boolean NOT NULL DEFAULT false,
  scopes text[] NOT NULL DEFAULT '{}',
  connected_at timestamptz,
  last_synced_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, email)
);

CREATE INDEX IF NOT EXISTS idx_lit_email_accounts_user
  ON lit_email_accounts(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_lit_email_accounts_provider
  ON lit_email_accounts(user_id, provider, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lit_email_accounts_primary_per_user
  ON lit_email_accounts(user_id) WHERE is_primary = true;

ALTER TABLE lit_email_accounts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lit_email_accounts'
      AND policyname = 'Users can view their own email accounts'
  ) THEN
    CREATE POLICY "Users can view their own email accounts"
      ON lit_email_accounts FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lit_email_accounts'
      AND policyname = 'Users can insert their own email accounts'
  ) THEN
    CREATE POLICY "Users can insert their own email accounts"
      ON lit_email_accounts FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lit_email_accounts'
      AND policyname = 'Users can update their own email accounts'
  ) THEN
    CREATE POLICY "Users can update their own email accounts"
      ON lit_email_accounts FOR UPDATE TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lit_email_accounts'
      AND policyname = 'Users can delete their own email accounts'
  ) THEN
    CREATE POLICY "Users can delete their own email accounts"
      ON lit_email_accounts FOR DELETE TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================================================
-- 5. LIT_OAUTH_TOKENS — service-role-only OAuth material
-- ============================================================================
--
-- SECURITY: tokens are sensitive. RLS is enabled but NO policies are
-- created for the `authenticated` role. That means authenticated
-- requests cannot read, insert, update, or delete rows. Only
-- service-role callers (OAuth callback + dispatcher edge functions)
-- can touch this table. Application-level encryption of
-- access_token / refresh_token at rest is still required before
-- production send — flagged as a Phase E blocker.

CREATE TABLE IF NOT EXISTS lit_oauth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_account_id uuid NOT NULL REFERENCES lit_email_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  provider text NOT NULL,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  scopes text[] NOT NULL DEFAULT '{}',
  token_type text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lit_oauth_tokens_account
  ON lit_oauth_tokens(email_account_id);
CREATE INDEX IF NOT EXISTS idx_lit_oauth_tokens_user
  ON lit_oauth_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_lit_oauth_tokens_expiry
  ON lit_oauth_tokens(expires_at) WHERE expires_at IS NOT NULL;

ALTER TABLE lit_oauth_tokens ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies created: authenticated access is denied.

-- ============================================================================
-- 6. updated_at triggers (reuse update_updated_at_column from part4)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_lit_sequences_updated_at') THEN
    CREATE TRIGGER update_lit_sequences_updated_at
      BEFORE UPDATE ON lit_sequences
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_lit_campaign_steps_updated_at') THEN
    CREATE TRIGGER update_lit_campaign_steps_updated_at
      BEFORE UPDATE ON lit_campaign_steps
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_lit_email_accounts_updated_at') THEN
    CREATE TRIGGER update_lit_email_accounts_updated_at
      BEFORE UPDATE ON lit_email_accounts
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_lit_oauth_tokens_updated_at') THEN
    CREATE TRIGGER update_lit_oauth_tokens_updated_at
      BEFORE UPDATE ON lit_oauth_tokens
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
