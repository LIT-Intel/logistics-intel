-- Lead-CRM Phase 1 — Part 5: hardening.
-- (1) Pin search_path on the pure derive function.
-- (2) Revoke direct EXECUTE on the trigger functions (they must only run as triggers),
--     mirroring the existing CRM convention (crm_phase3_revoke_trigger_fn_public).

alter function public.lead_derived_stage(boolean, boolean, boolean, boolean) set search_path to 'public';

revoke all on function public.lit_admin_leads_log_activity() from public, anon, authenticated;
revoke all on function public.lit_lead_activity_touch()      from public, anon, authenticated;
