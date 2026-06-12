// tier3-enrichment — Tier-3 provider stub (Phase 4)
//
// Placeholder for a future ZoomInfo / Cognism integration. The
// orchestrator (`enrich-contact-orchestrator`) already calls this fn as
// the last step of the cascade when Apollo + Lusha both return no_match
// and the org has enabled tier-3 in `lit_org_enrichment_settings`.
//
// Today it returns `{ok: true, contacts: [], skipped: 'tier3_not_configured'}`
// so the cascade terminates cleanly. When credentials arrive:
//
//   1. Drop in the real client (ZoomInfo /search/contact or Cognism /contact).
//   2. Honor the same `unlock_phone` flag as the other providers.
//   3. Charge credits the same way (lit_consume_credits with
//      provider='tier3' in metadata).
//   4. Return the contacts in the same normalized shape as
//      apollo-contact-enrich so the orchestrator can persist them.
//
// No other component needs to change — the orchestrator already routes
// to this name.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("tier3-enrichment");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const TIER3_PROVIDER_KEY = Deno.env.get("TIER3_PROVIDER_API_KEY") || "";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing authorization header", code: "UNAUTHENTICATED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userError || !user) {
      return new Response(
        JSON.stringify({ ok: false, error: "Unauthorized", code: "UNAUTHENTICATED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Stub: until a real provider key is configured, always return empty.
    // The orchestrator interprets this as cascade-exhausted.
    if (!TIER3_PROVIDER_KEY) {
      log.info("tier3_not_configured", { user_id: user.id });
      return new Response(
        JSON.stringify({
          ok: true,
          provider: "tier3",
          contacts: [],
          count: 0,
          skipped: "tier3_not_configured",
          message: "Tier-3 provider (ZoomInfo / Cognism) is not yet configured. Set TIER3_PROVIDER_API_KEY to enable.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // When credentials arrive, the real call goes here. The orchestrator
    // forwards the same payload shape as apollo-contact-enrich:
    //   { contacts: [{ first_name, last_name, domain, ... }], unlock_phone, company_id }
    // Return shape must match:
    //   { ok: true, provider: 'tier3', contacts: [...normalized...], count }
    return new Response(
      JSON.stringify({
        ok: true,
        provider: "tier3",
        contacts: [],
        count: 0,
        skipped: "tier3_not_implemented",
        message: "Tier-3 provider stub — replace with ZoomInfo/Cognism client.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    log.error("tier3_unexpected_error", { err: String(error?.message ?? error) });
    return new Response(
      JSON.stringify({ ok: false, error: error?.message || "Internal server error", code: "INTERNAL_ERROR" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
