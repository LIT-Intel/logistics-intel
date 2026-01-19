import { getGatewayBase } from "./env";

type Json = Record<string, any>;

/**
 * IMPORTANT
 * ----------
 * This file is SNAPSHOT-ONLY.
 *
 * ❌ No ImportYeti search
 * ❌ No BOL endpoints
 * ❌ No fan-out logic
 *
 * The ONLY allowed behavior:
 * - Fetch or return a company snapshot via Supabase Edge Function
 */

/**
 * Snapshot API
 * ------------
 * Calls Supabase Edge Function:
 *   POST /functions/v1/importyeti-proxy
 *
 * Credit behavior:
 * - 0 credits if cached (<30 days)
 * - 1 credit if refreshed
 */
export async function iyGetSnapshot(company_id: string) {
  if (!company_id) {
    throw new Error("iyGetSnapshot: company_id is required");
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error("Supabase env vars missing");
  }

  const url = `${supabaseUrl}/functions/v1/importyeti-proxy`;

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ company_id }),
  });

  const data = await r.json();

  if (!r.ok) {
    console.error("iyGetSnapshot error:", data);
    return {
      ok: false,
      error: data?.error || "Snapshot fetch failed",
    };
  }

  return {
    ok: true,
    snapshot: data.snapshot ?? data,
    source: data.source,
  };
}

/**
 * 🚫 HARD FAIL SAFEGUARDS
 * ----------------------
 * If any legacy function is accidentally imported,
 * we want the app to break loudly instead of silently burning credits.
 */

export function iySearchShippers(): never {
  throw new Error(
    "iySearchShippers is disabled. Use Supabase lit_company_index for search."
  );
}

export function iyCompanyBols(): never {
  throw new Error(
    "iyCompanyBols is disabled. Snapshot architecture does not support BOL lookups."
  );
}

export function iyBolLookup(): never {
  throw new Error(
    "iyBolLookup is disabled. Snapshot architecture does not support BOL lookups."
  );
}
