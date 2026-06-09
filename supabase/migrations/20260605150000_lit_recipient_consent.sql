-- 20260605150000_lit_recipient_consent.sql
-- Per-recipient consent attestation for Gmail API compliance.

BEGIN;

CREATE TABLE IF NOT EXISTS public.lit_recipient_consent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email text NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  attested_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  attested_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('saved_company_picker', 'manual_email_tab', 'csv_upload', 'crm_sync')),
  campaign_id uuid REFERENCES public.lit_campaigns(id) ON DELETE SET NULL,
  notes text,
  UNIQUE (recipient_email, org_id)
);

CREATE INDEX IF NOT EXISTS lit_recipient_consent_email_idx
  ON public.lit_recipient_consent(lower(recipient_email));
CREATE INDEX IF NOT EXISTS lit_recipient_consent_org_id_idx
  ON public.lit_recipient_consent(org_id);

ALTER TABLE public.lit_recipient_consent ENABLE ROW LEVEL SECURITY;

CREATE POLICY lit_recipient_consent_select ON public.lit_recipient_consent
  FOR SELECT USING (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
       WHERE om.user_id = auth.uid() AND om.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid()
    )
  );

CREATE POLICY lit_recipient_consent_insert ON public.lit_recipient_consent
  FOR INSERT WITH CHECK (
    auth.uid() = attested_by_user_id
    AND org_id IN (
      SELECT om.org_id FROM public.org_members om
       WHERE om.user_id = auth.uid() AND om.status = 'active'
    )
  );

CREATE OR REPLACE FUNCTION public.lit_recipients_with_consent(
  p_org_id uuid,
  p_emails text[]
) RETURNS TABLE (recipient_email text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT lower(c.recipient_email)
    FROM public.lit_recipient_consent c
   WHERE c.org_id = p_org_id
     AND lower(c.recipient_email) = ANY(SELECT lower(unnest(p_emails)));
$function$;

GRANT EXECUTE ON FUNCTION public.lit_recipients_with_consent(uuid, text[]) TO service_role;

COMMIT;
