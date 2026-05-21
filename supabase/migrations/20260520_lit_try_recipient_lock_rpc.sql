-- supabase/migrations/20260520_lit_try_recipient_lock_rpc.sql
-- SECURITY DEFINER wrapper around pg_try_advisory_xact_lock so the
-- send-campaign-email dispatcher can acquire a per-recipient lock via
-- supabase-js RPC (PostgREST can't call pg_* built-ins directly).
--
-- Returns true if the lock was acquired (proceed with send) or false
-- if another transaction already holds it (skip this recipient on the
-- current tick). The lock auto-releases on transaction end.
--
-- Applied via Supabase MCP during Task 5 implementation. This migration
-- file is the canonical source for replayability across environments.

CREATE OR REPLACE FUNCTION public.lit_try_recipient_lock(p_key bigint)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT pg_try_advisory_xact_lock(p_key);
$function$;
