/*
  # LIT Platform Schema - Part 2: User Data Tables

  Creates saved companies, contacts, and related tables
*/

-- ============================================================================
-- 3. LIT_SAVED_COMPANIES - User's Command Center
-- ============================================================================

CREATE TABLE IF NOT EXISTS lit_saved_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES lit_companies(id) ON DELETE CASCADE,

  -- CRM fields
  stage text NOT NULL DEFAULT 'prospect',
  status text NOT NULL DEFAULT 'active',
  notes text,
  assigned_to text,
  last_activity_at timestamptz,
  last_viewed_at timestamptz,

  -- Pre-call / Insights (Gemini outputs)
  gemini_brief jsonb,
  gemini_brief_updated_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_lit_saved_user ON lit_saved_companies(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_lit_saved_stage ON lit_saved_companies(user_id, stage);
CREATE INDEX IF NOT EXISTS idx_lit_saved_status ON lit_saved_companies(user_id, status);
CREATE INDEX IF NOT EXISTS idx_lit_saved_activity ON lit_saved_companies(user_id, last_activity_at DESC);

ALTER TABLE lit_saved_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own saved companies"
  ON lit_saved_companies FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own saved companies"
  ON lit_saved_companies FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own saved companies"
  ON lit_saved_companies FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own saved companies"
  ON lit_saved_companies FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- 4. LIT_CONTACTS - Canonical contact records
-- ============================================================================

CREATE TABLE IF NOT EXISTS lit_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity / Matching
  source text NOT NULL DEFAULT 'lusha',
  source_contact_key text,
  company_id uuid REFERENCES lit_companies(id) ON DELETE SET NULL,

  full_name text NOT NULL,
  first_name text,
  last_name text,
  title text,
  department text,
  seniority text,

  email text,
  phone text,
  linkedin_url text,
  avatar_url text,

  city text,
  state text,
  country_code text,

  buying_intent jsonb,
  raw_payload jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (source, source_contact_key)
);

CREATE INDEX IF NOT EXISTS idx_lit_contacts_company ON lit_contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_lit_contacts_filters ON lit_contacts USING gin (
  to_tsvector('english', coalesce(full_name,'') || ' ' || coalesce(title,'') || ' ' || coalesce(department,''))
);
CREATE INDEX IF NOT EXISTS idx_lit_contacts_email ON lit_contacts(email) WHERE email IS NOT NULL;

ALTER TABLE lit_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contacts are viewable by authenticated users"
  ON lit_contacts FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- 5. LIT_SAVED_CONTACTS - User's saved contacts
-- ============================================================================

CREATE TABLE IF NOT EXISTS lit_saved_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  contact_id uuid NOT NULL REFERENCES lit_contacts(id) ON DELETE CASCADE,
  company_id uuid REFERENCES lit_companies(id) ON DELETE SET NULL,

  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_lit_saved_contacts_user ON lit_saved_contacts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lit_saved_contacts_company ON lit_saved_contacts(user_id, company_id);

ALTER TABLE lit_saved_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own saved contacts"
  ON lit_saved_contacts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own saved contacts"
  ON lit_saved_contacts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own saved contacts"
  ON lit_saved_contacts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own saved contacts"
  ON lit_saved_contacts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
