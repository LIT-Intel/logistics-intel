-- Sub-project O — extend lit_campaign_contacts.status CHECK to include
-- the new exit-status taxonomy: meeting_booked, funnel_exited, manual_exit.
-- Also adds 'suppressed' which has been used by email-unsubscribe but was
-- not in the original CHECK (an existing latent bug; fixed here).
ALTER TABLE lit_campaign_contacts DROP CONSTRAINT IF EXISTS lit_campaign_contacts_status_check;
ALTER TABLE lit_campaign_contacts ADD CONSTRAINT lit_campaign_contacts_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text, 'queued'::text, 'sent'::text, 'delivered'::text,
    'opened'::text, 'clicked'::text, 'replied'::text, 'bounced'::text,
    'unsubscribed'::text, 'failed'::text, 'skipped'::text, 'completed'::text,
    -- Sub-project O exit statuses
    'meeting_booked'::text, 'funnel_exited'::text, 'manual_exit'::text,
    -- Pre-existing latent: used by email-unsubscribe but missing from CHECK
    'suppressed'::text
  ]));
