-- Extend lit_recipient_consent.source to allow legacy_pre_consent_wire.
BEGIN;
ALTER TABLE public.lit_recipient_consent
  DROP CONSTRAINT IF EXISTS lit_recipient_consent_source_check;
ALTER TABLE public.lit_recipient_consent
  ADD CONSTRAINT lit_recipient_consent_source_check
  CHECK (source IN ('saved_company_picker', 'manual_email_tab', 'csv_upload', 'crm_sync', 'legacy_pre_consent_wire'));
COMMIT;
