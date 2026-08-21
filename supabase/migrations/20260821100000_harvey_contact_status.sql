-- ============================================================================
-- Project Harvey — allow the 'harvey_active' contact status.
--
-- harvey-sequence-tick enrolls LEAD-CRM leads into the standing ICP campaigns as
-- lit_campaign_contacts with status='harvey_active'. This status is deliberately
-- OUTSIDE the set the customer campaign cron (send-campaign-email) processes
-- (pending/queued), so Harvey's contacts are driven ONLY by harvey-sequence-tick
-- and never double-sent. The existing status CHECK constraint did not include
-- it; extend the allowed set.
-- ============================================================================

alter table public.lit_campaign_contacts
  drop constraint if exists lit_campaign_contacts_status_check;

alter table public.lit_campaign_contacts
  add constraint lit_campaign_contacts_status_check
  check (status = any (array[
    'pending','queued','sent','delivered','opened','clicked','replied','bounced',
    'unsubscribed','failed','skipped','completed','meeting_booked','funnel_exited',
    'manual_exit','suppressed',
    'harvey_active'  -- Harvey-owned, in-sequence (customer cron ignores it)
  ]::text[]));
