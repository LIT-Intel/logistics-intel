-- Sub-project L — backfill orphan reply rows whose campaign_id is NULL.
--
-- Reply rows can land with campaign_id=NULL when reply-receiver can't
-- resolve message_id back to the send (e.g. inbound matched on subject
-- or thread headers that didn't carry our tracking ID).
--
-- Strategy: for each orphan reply, find a same-recipient 'sent' row that
-- happened within 7 days prior, and inherit its campaign_id.
--
-- lit_outreach_history has no org_id column — only campaign_id is copied.

UPDATE lit_outreach_history orphan
SET campaign_id = sent_row.campaign_id
FROM lit_outreach_history sent_row
WHERE orphan.campaign_id IS NULL
  AND orphan.status = 'replied'
  AND sent_row.event_type = 'sent'
  AND sent_row.campaign_id IS NOT NULL
  AND sent_row.metadata->>'recipient_email' = orphan.metadata->>'recipient_email'
  AND sent_row.occurred_at < orphan.occurred_at
  AND sent_row.occurred_at > orphan.occurred_at - interval '7 days';
