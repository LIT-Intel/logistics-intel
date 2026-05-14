-- Phase 3B fix — admins read every row.
--
-- Root cause of the wrong KPI counts: every user-scoped RLS policy
-- filtered SELECT to (user_id = auth.uid()), which meant the admin
-- dashboard client (running with the admin's own JWT) only saw the
-- admin's own rows. Trial users, MRR, subscriber list, campaign
-- monitor, outreach history — all under-reported.
--
-- Fix: layer an additional admin-read policy on each affected table
-- so is_admin_caller() bypasses the user-scope filter. PostgreSQL
-- RLS ORs policies of the same command, so this is purely additive —
-- non-admin users still see only their own rows.
--
-- Write access is unchanged. Admins go through the SECURITY DEFINER
-- RPCs (lit_admin_*) which audit every mutation.

DROP POLICY IF EXISTS profiles_admin_read ON public.profiles;
CREATE POLICY profiles_admin_read ON public.profiles
  FOR SELECT TO authenticated USING (public.is_admin_caller());

DROP POLICY IF EXISTS subscriptions_admin_read ON public.subscriptions;
CREATE POLICY subscriptions_admin_read ON public.subscriptions
  FOR SELECT TO authenticated USING (public.is_admin_caller());

DROP POLICY IF EXISTS lit_campaigns_admin_read ON public.lit_campaigns;
CREATE POLICY lit_campaigns_admin_read ON public.lit_campaigns
  FOR SELECT TO authenticated USING (public.is_admin_caller());

DROP POLICY IF EXISTS lit_outreach_history_admin_read ON public.lit_outreach_history;
CREATE POLICY lit_outreach_history_admin_read ON public.lit_outreach_history
  FOR SELECT TO authenticated USING (public.is_admin_caller());

DROP POLICY IF EXISTS lit_campaign_contacts_admin_read ON public.lit_campaign_contacts;
CREATE POLICY lit_campaign_contacts_admin_read ON public.lit_campaign_contacts
  FOR SELECT TO authenticated USING (public.is_admin_caller());

DROP POLICY IF EXISTS lit_contacts_admin_read ON public.lit_contacts;
CREATE POLICY lit_contacts_admin_read ON public.lit_contacts
  FOR SELECT TO authenticated USING (public.is_admin_caller());
