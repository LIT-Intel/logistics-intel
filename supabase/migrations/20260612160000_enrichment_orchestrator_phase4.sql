-- Enrichment Phase 4 — multi-provider orchestrator schema
--
-- Adds:
--   1. lit_org_enrichment_settings        Per-org provider order + Tier-3 enable flag.
--   2. lit_contacts.source_provider       Which provider yielded the row (apollo / lusha / tier3).
--
-- The orchestrator edge fn (`enrich-contact-orchestrator`) reads
-- `provider_order` to decide cascade order and writes `source_provider`
-- onto each persisted contact so analytics can attribute credits + match
-- rates per provider.

-- ── 1. Org-level enrichment settings ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lit_org_enrichment_settings (
  org_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  provider_order text[] NOT NULL DEFAULT ARRAY['apollo','lusha']::text[],
  enable_tier3 boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE lit_org_enrichment_settings IS
  'Phase 4 — per-org enrichment orchestrator config. Controls which providers run and in what order.';
COMMENT ON COLUMN lit_org_enrichment_settings.provider_order IS
  'Ordered cascade. First provider attempted first; later providers only run when earlier ones return no_match. Valid values: apollo, lusha, tier3.';
COMMENT ON COLUMN lit_org_enrichment_settings.enable_tier3 IS
  'Toggle to include the Tier-3 stub (future ZoomInfo / Cognism). Even when ''tier3'' is in provider_order, the orchestrator skips it unless this flag is true.';

ALTER TABLE lit_org_enrichment_settings ENABLE ROW LEVEL SECURITY;

-- Owner/admin can read + write their org row; members can read only.
DROP POLICY IF EXISTS lit_org_enrichment_settings_select ON lit_org_enrichment_settings;
CREATE POLICY lit_org_enrichment_settings_select
  ON lit_org_enrichment_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = lit_org_enrichment_settings.org_id
        AND org_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS lit_org_enrichment_settings_write ON lit_org_enrichment_settings;
CREATE POLICY lit_org_enrichment_settings_write
  ON lit_org_enrichment_settings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = lit_org_enrichment_settings.org_id
        AND org_members.user_id = auth.uid()
        AND lower(org_members.role) IN ('owner','admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = lit_org_enrichment_settings.org_id
        AND org_members.user_id = auth.uid()
        AND lower(org_members.role) IN ('owner','admin')
    )
  );

-- Touch updated_at on UPDATE so the panel can show "Saved at …".
CREATE OR REPLACE FUNCTION lit_org_enrichment_settings_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lit_org_enrichment_settings_touch ON lit_org_enrichment_settings;
CREATE TRIGGER trg_lit_org_enrichment_settings_touch
  BEFORE UPDATE ON lit_org_enrichment_settings
  FOR EACH ROW EXECUTE FUNCTION lit_org_enrichment_settings_touch_updated_at();

-- ── 2. Attribute every contact to the provider that yielded it ───────────────
ALTER TABLE lit_contacts
  ADD COLUMN IF NOT EXISTS source_provider text;

COMMENT ON COLUMN lit_contacts.source_provider IS
  'Which provider yielded this contact: apollo, lusha, tier3, or NULL for legacy rows enriched before Phase 4.';

CREATE INDEX IF NOT EXISTS lit_contacts_source_provider_idx
  ON lit_contacts(source_provider);
