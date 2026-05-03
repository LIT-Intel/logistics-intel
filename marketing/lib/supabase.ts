import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client used by the agent fleet to read shipment
 * data and write programmatic-page snapshots. Marketing pages NEVER
 * read this client directly — they read from Sanity, which the agents
 * keep fresh. This keeps the public surface simple and means we can
 * change the underlying DB schema without breaking marketing pages.
 *
 * Returns null when env not set (Phase 1B works without Supabase —
 * agents are Phase 4 and gracefully no-op).
 */
let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

export function hasSupabase(): boolean {
  return Boolean(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY),
  );
}
