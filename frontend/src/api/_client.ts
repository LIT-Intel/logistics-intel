/**
 * Shared client wrapper for Supabase Edge Function calls.
 *
 * This is the foundation of the api.ts split (CEO review item 7). New domain
 * code should live in `frontend/src/api/<domain>.ts` and use these helpers
 * instead of re-implementing auth-header threading + error normalization.
 *
 * Eventually `frontend/src/lib/api.ts` will be carved up domain by domain and
 * deleted. See `docs/superpowers/plans/2026-05-28-api-domain-split.md`.
 */
import { supabase } from "@/lib/supabase";

export interface EdgeError {
  ok: false;
  code: string;
  message: string;
  status?: number;
}

export class EdgeFunctionError extends Error {
  code: string;
  status: number | undefined;
  constructor(message: string, code = "EDGE_ERROR", status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * Call an edge function with the current Supabase user session attached.
 * Throws `EdgeFunctionError` on transport or non-2xx responses; returns the
 * decoded JSON body on success.
 *
 * Prefer this over `supabase.functions.invoke(...)` directly so error
 * normalization, auth-header threading, and (eventually) telemetry live in
 * one place.
 */
export async function invokeEdge<T = unknown>(
  name: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const msg = error.message || `Edge function "${name}" failed`;
    throw new EdgeFunctionError(msg, "INVOKE_FAILED");
  }
  // Edge functions in this repo return { ok: true, ... } on success and
  // { ok: false, error: "...", code: "..." } on application-level failure.
  if (data && typeof data === "object" && "ok" in data && (data as { ok: boolean }).ok === false) {
    const e = data as { error?: string; code?: string };
    throw new EdgeFunctionError(e.error ?? `${name} failed`, e.code ?? "OK_FALSE");
  }
  return data as T;
}

/**
 * Read the current Supabase access token. Returns null if there's no session.
 * For direct fetch() calls to APIs that need a Bearer token but aren't an
 * edge-function invoke (rare). Prefer `invokeEdge` whenever possible.
 */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}
