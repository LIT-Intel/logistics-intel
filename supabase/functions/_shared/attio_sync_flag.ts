// Phase 4 — Attio cutover kill-switch (shared).
//
// The single read-path for the operational "should we still push TO Attio?"
// flag. The owner flips it via lit_admin_set_attio_sync(bool); the three Attio
// PUSH functions (pulse-attio-sync, attio-activity-mirror, attio-stalled-deals-
// cron) call isAttioSyncEnabled() right after they build their service client
// and no-op when it returns false.
//
// Design invariant (mirrors _shared/provider_ledger.ts isProviderEnabled):
// this FAILS OPEN. If the RPC errors we return true so a flag-read bug never
// silently severs a sync the owner still wants running. The switch is a
// deliberate owner action, not an incidental failure mode.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Whether LIT should still push to Attio. Reads the SECURITY DEFINER RPC
 * `lit_attio_sync_enabled()` which resolves lit_internal_meta['attio_sync_enabled']
 * (default true when unset). Fails OPEN (returns true) on any error.
 */
export async function isAttioSyncEnabled(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("lit_attio_sync_enabled");
    if (error) return true; // fail open — never sever a wanted sync on a read error
    return data === false ? false : true;
  } catch {
    return true;
  }
}
