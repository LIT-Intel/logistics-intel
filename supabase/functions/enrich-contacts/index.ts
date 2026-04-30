import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return new Response(
        JSON.stringify({ ok: false, error: "Supabase env not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing Authorization header", code: "UNAUTHORIZED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: userData, error: authError } = await userClient.auth.getUser();
    if (authError || !userData?.user) {
      return new Response(
        JSON.stringify({ ok: false, error: "Unauthorized", code: "UNAUTHORIZED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const userId = userData.user.id;

    let orgId: string | null = null;
    try {
      const { data: orgRow } = await adminClient
        .from("org_members")
        .select("org_id")
        .eq("user_id", userId)
        .order("joined_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      orgId = orgRow?.org_id ?? null;
    } catch { /* ignore */ }

    const { data: gateData, error: gateError } = await adminClient.rpc("check_usage_limit", {
      p_org_id: orgId,
      p_user_id: userId,
      p_feature_key: "contact_enrichment",
      p_quantity: 1,
    });
    if (gateError) {
      console.error("[enrich-contacts] gate rpc failed", gateError);
    } else if (gateData && gateData.ok === false) {
      return new Response(JSON.stringify(gateData), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LUSHA_API_KEY = Deno.env.get("LUSHA_API_KEY");
    if (!LUSHA_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Missing LUSHA_API_KEY" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const { company_id, companyName: bodyCompanyName, companyDomain: bodyCompanyDomain } = body || {};
    if (!bodyCompanyName && !bodyCompanyDomain && !company_id) {
      return new Response(
        JSON.stringify({ error: "Missing companyName, companyDomain, or company_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Phase 5.1 v52 — domain override → normalize-company → raw fallback
    let companyName = bodyCompanyName;
    let canonicalDomain = bodyCompanyDomain;
    let normalization: any = null;
    let normalizationMethod: "override" | "ai" | "ai_cached" | "raw" | "none" =
      bodyCompanyDomain ? "raw" : "none";

    if (company_id) {
      // 1. Override table: hand-curated canonical domain wins
      try {
        const { data: company } = await adminClient
          .from("lit_companies")
          .select("source_company_key")
          .eq("id", company_id)
          .maybeSingle();
        const sck = company?.source_company_key;
        if (sck) {
          const { data: override, error: overrideErr } = await adminClient
            .from("lit_company_domain_overrides")
            .select("canonical_domain, override_reason")
            .eq("source_company_key", sck)
            .maybeSingle();
          if (overrideErr && overrideErr.code !== "PGRST116") {
            console.error("[enrich-contacts] override lookup failed", overrideErr);
          }
          if (override?.canonical_domain) {
            canonicalDomain = override.canonical_domain;
            normalizationMethod = "override";
            normalization = { canonicalDomain: override.canonical_domain, source: "override", reason: override.override_reason ?? null };
          }
        }
      } catch (overrideErr) {
        console.error("[enrich-contacts] override block failed", overrideErr);
      }

      // 2. AI normalization (only if no override)
      if (normalizationMethod !== "override") {
        try {
          const { data: norm } = await adminClient.functions.invoke("normalize-company", {
            body: { company_id },
          });
          if (norm) {
            normalization = norm;
            if (norm.isForwarder === true) {
              return new Response(
                JSON.stringify({ error: "Cannot enrich forwarder company", normalization: norm, normalization_method: "ai" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
              );
            }
            if (norm.canonicalDomain) {
              canonicalDomain = norm.canonicalDomain;
              normalizationMethod = norm.cached ? "ai_cached" : "ai";
            }
          }
        } catch (normErr) {
          console.error("[enrich-contacts] normalize-company failed", normErr);
        }
      }
    }
    const companyDomain = canonicalDomain;

    // Plan-based contact limit
    let maxContacts = 3;
    try {
      const { data: org } = await adminClient
        .from("organizations").select("plan").eq("id", orgId).maybeSingle();
      const planCode = String(org?.plan ?? "free_trial").toLowerCase();
      const { data: lim } = await adminClient
        .from("plan_contact_limits").select("max_contacts_per_company").eq("plan_code", planCode).maybeSingle();
      maxContacts = lim?.max_contacts_per_company ?? 3;
    } catch (planErr) {
      console.error("[enrich-contacts] plan limit lookup failed", planErr);
    }

    const lushaHeaders = {
      "Content-Type": "application/json",
      api_key: LUSHA_API_KEY,
    };

    let companyMatch: any = null;
    let contacts: any[] = [];
    let similarCompanies: any[] = [];
    const debug: Record<string, any> = {};

    try {
      const searchRes = await fetch(
        "https://api.lusha.com/prospecting/company/search",
        {
          method: "POST",
          headers: lushaHeaders,
          body: JSON.stringify({
            filters: {
              names: companyName ? [companyName] : undefined,
              domains: companyDomain ? [companyDomain] : undefined,
            },
          }),
        },
      );
      debug.companySearchStatus = searchRes.status;
      const raw = await searchRes.text();
      debug.companySearchRaw = raw;
      if (searchRes.ok) {
        try {
          const parsed = JSON.parse(raw);
          const rows = parsed?.data || parsed?.results || parsed?.companies || [];
          companyMatch = Array.isArray(rows) && rows.length ? rows[0] : null;
        } catch {}
      }
    } catch (err) {
      debug.companySearchError = String(err);
    }

    const contactFilters: Record<string, any> = {
      departments: ["supply chain", "logistics", "operations", "procurement", "purchasing"],
      seniorities: ["manager", "director", "vp", "c_level"],
    };
    if (companyName) contactFilters.companyNames = [companyName];
    if (companyDomain) contactFilters.companyDomains = [companyDomain];

    try {
      const contactRes = await fetch(
        "https://api.lusha.com/prospecting/contact/search",
        {
          method: "POST",
          headers: lushaHeaders,
          body: JSON.stringify({ filters: contactFilters, limit: maxContacts }),
        },
      );
      debug.contactStatus = contactRes.status;
      const raw = await contactRes.text();
      debug.contactRaw = raw;
      if (contactRes.ok) {
        try {
          const parsed = JSON.parse(raw);
          contacts = parsed?.data || parsed?.results || parsed?.contacts || [];
          if (contacts.length > maxContacts) contacts = contacts.slice(0, maxContacts);
        } catch {}
      }
      console.log(`[enrich-contacts] Lusha query: domain=${companyDomain}, limit=${maxContacts}, returned=${contacts.length}, normalization_method=${normalizationMethod}, confidence=${normalization?.confidence ?? "n/a"}`);
    } catch (err) {
      debug.contactError = String(err);
    }

    try {
      const similarRes = await fetch(
        "https://api.lusha.com/v3/lookalike/companies",
        {
          method: "POST",
          headers: lushaHeaders,
          body: JSON.stringify({
            companies: [
              {
                name: companyMatch?.name || companyName,
                domain: companyMatch?.domain || companyDomain,
                companyId: companyMatch?.companyId || companyMatch?.id || undefined,
              },
            ],
          }),
        },
      );
      debug.similarStatus = similarRes.status;
      const raw = await similarRes.text();
      debug.similarRaw = raw;
      if (similarRes.ok) {
        try {
          const parsed = JSON.parse(raw);
          similarCompanies =
            parsed?.companies || parsed?.lookalikes || parsed?.data || [];
        } catch {}
      }
    } catch (err) {
      debug.similarError = String(err);
    }

    if ((contacts && contacts.length > 0) || companyMatch) {
      try {
        await adminClient.rpc("consume_usage", {
          p_org_id: orgId,
          p_user_id: userId,
          p_feature_key: "contact_enrichment",
          p_quantity: Math.max(1, contacts?.length ?? 0),
          p_metadata: { contacts_returned: contacts?.length ?? 0, max_allowed: maxContacts },
        });
      } catch (consumeErr) {
        console.error("[enrich-contacts] consume_usage failed", consumeErr);
      }
    }

    let inserted_count = 0;
    if (company_id && Array.isArray(contacts) && contacts.length > 0) {
      try {
        const upsertRows = contacts.map((c: any) => {
          const fullName =
            (c.fullName ??
              (`${c.firstName ?? ""} ${c.lastName ?? ""}`.trim())) ||
            (typeof c.email === "string" ? c.email.split("@")[0] : null) ||
            (typeof c.emailAddress === "string" ? c.emailAddress.split("@")[0] : null) ||
            "Unknown";
          const sourceKey = `lusha:${c.id ?? c.contactId ?? crypto.randomUUID()}`;
          const linkedinUrl =
            c.linkedinUrl ??
            (c.linkedinSlug ? `https://www.linkedin.com/in/${c.linkedinSlug}` : null);
          const dept = Array.isArray(c.departments) ? c.departments[0] ?? null : null;
          return {
            company_id,
            source: "lusha",
            source_contact_key: sourceKey,
            full_name: fullName,
            first_name: c.firstName ?? null,
            last_name: c.lastName ?? null,
            title: c.jobTitle ?? c.title ?? null,
            department: dept,
            seniority: c.seniority ?? null,
            email: c.emailAddress ?? c.email ?? null,
            phone: c.phoneNumber ?? c.mobile ?? c.directPhone ?? null,
            linkedin_url: linkedinUrl,
            avatar_url: null,
            city: c.location?.city ?? null,
            state: c.location?.state ?? null,
            country_code: c.location?.country ?? null,
            verified_by_provider:
              c.emailStatus === "valid" || c.emailStatus === "catchAll",
            email_verified: c.emailStatus === "valid",
            email_verification_status: c.emailStatus ?? null,
            raw_payload: c,
          };
        });
        const { data: upserted, error: upsertError } = await adminClient
          .from("lit_contacts")
          .upsert(upsertRows, { onConflict: "source,source_contact_key" })
          .select("id");
        if (upsertError) {
          console.error("[enrich-contacts] lit_contacts upsert failed", upsertError);
        } else {
          inserted_count = upserted?.length ?? 0;
        }
      } catch (persistErr) {
        console.error("[enrich-contacts] persistence error", persistErr);
      }
    }

    return new Response(
      JSON.stringify({
        contacts,
        similarCompanies,
        inserted_count,
        normalization_method: normalizationMethod,
        normalization,
        debug,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});