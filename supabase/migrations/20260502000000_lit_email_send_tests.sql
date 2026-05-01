-- ============================================================================
-- LIT_EMAIL_SEND_TESTS — outcome ledger for the Settings → Test Send button.
-- One row per attempt; the function writes here for both success and failure.
-- ============================================================================

CREATE TABLE IF NOT EXISTS lit_email_send_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email_account_id uuid REFERENCES lit_email_accounts(id) ON DELETE SET NULL,
  provider text NOT NULL,
  to_email text NOT NULL,
  from_email text,
  subject text,
  status text NOT NULL,           -- 'sent' | 'failed'
  message_id text,
  error_code text,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lit_email_send_tests_user
  ON lit_email_send_tests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lit_email_send_tests_account
  ON lit_email_send_tests(email_account_id, created_at DESC);

ALTER TABLE lit_email_send_tests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='lit_email_send_tests'
      AND policyname='Users can view their own test sends')
  THEN
    CREATE POLICY "Users can view their own test sends"
      ON lit_email_send_tests FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;
  -- No INSERT/UPDATE/DELETE policies — service role only writes (the
  -- send-test-email Edge Function uses the service-role key).
END $$;