-- fix(campaigns): close the admin-only campaign visibility leak
--
-- Root cause: migration 20260513180000_admin_read_rls_policies.sql added
-- `lit_campaigns_admin_read` which uses `is_admin_caller()`. That function
-- grants access to any authenticated user who is an org_members row with
-- role IN ('admin','owner','superadmin') — i.e. all 18 workspace owners —
-- not just platform superadmins. PostgreSQL ORs same-command RLS policies,
-- so ANY passing policy wins. `lit_campaigns_admin_read` was overriding the
-- `is_admin_only` gate introduced alongside `lit_campaigns_select_owner_or_admin`.
--
-- Fix: drop the overly-broad `lit_campaigns_admin_read` policy. The correct
-- policy `lit_campaigns_select_owner_or_admin` already handles both cases:
--   • non-admin callers: (auth.uid() = user_id AND is_admin_only = false)
--   • platform superadmins: EXISTS (SELECT 1 FROM platform_admins ...)
--
-- Edge functions that use the service role (send-campaign-email cron,
-- admin-api) bypass RLS entirely and are unaffected by this change.

drop policy if exists lit_campaigns_admin_read on public.lit_campaigns;
