-- ============================================================================
-- Project Harvey — never append the mailbox owner's signature.
--
-- Harvey's campaign steps must NOT append the sender's saved signature: he signs
-- in-body as "— Harvey, Logistic Intel". The customer sender (send-campaign-email)
-- appends lit_email_preferences.signature_* when a step's include_signature is
-- not false — and because Harvey's contacts carry user_id = the platform owner,
-- that pulled the OWNER's signature ("Valesco Raymond / Founder Of LIT") onto
-- Harvey's cold emails. Force include_signature=false on every Harvey step.
--
-- (Belt-and-suspenders: send-campaign-email is also patched to skip campaigns
-- tagged metrics.internal_agent='harvey' entirely, and Harvey's own dispatcher
-- never appends a signature.)
-- ============================================================================

update public.lit_campaign_steps set include_signature = false
where campaign_id in (
  'c0a1efab-0000-4000-8000-000000000001',
  'c0a1efab-0000-4000-8000-000000000002',
  'c0a1efab-0000-4000-8000-000000000003'
) and coalesce(include_signature, true) is distinct from false;
