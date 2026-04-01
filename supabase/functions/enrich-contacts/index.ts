import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/*
 * Supabase Edge Function: enrich-contacts
 *
 * This function enriches a company's contacts and retrieves similar companies by
 * querying the Lusha API. The caller should pass a JSON body with the shape:
 *   {
 *     companyName: string, // name of the company
 *     companyDomain: string, // domain of the company (optional)
 *     filters: {
 *       department?: string,
 *       city?: string,
 *       state?: string,
 *       country?: string,
 *       seniority?: string
 *     }
 *   }
 *
 * The function first performs a company search, then uses the returned
 * company information to search for contacts and similar companies. It
 * returns both contacts and similar companies arrays. This implementation
 * intentionally surfaces Lusha API errors in the response for easier
 * debugging during development. In production, you may want to hide
 * detailed error messages.
 *
 * Secrets:
 *   LUSHA_API_KEY – should be stored in Supabase project secrets.
 */

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const LUSHA_API_KEY = Deno.env.get("LUSHA_API_KEY");
    if (!LUSHA_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Missing LUSHA_API_KEY" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const { companyName, companyDomain, filters = {} } = body || {};
    if (!companyName && !companyDomain) {
      return new Response(
        JSON.stringify({ error: "Missing companyName or companyDomain" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Helper to build headers for Lusha API
    const lushaHeaders = {
      "Content-Type": "application/json",
      api_key: LUSHA_API_KEY,
    };

    // Initialize variables to accumulate results and debug info
    let companyMatch: any = null;
    let contacts: any[] = [];
    let similarCompanies: any[] = [];
    const debug: Record<string, any> = {};

    // --- Step 1: Company search ---
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

    // Build base filter arrays for contact search
    const contactFilters: Record<string, any> = {};
    if (companyName) contactFilters.companyNames = [companyName];
    if (companyDomain) contactFilters.companyDomains = [companyDomain];
    if (filters.department) contactFilters.departments = [filters.department];
    if (filters.seniority) contactFilters.seniorities = [filters.seniority];
    if (filters.city) contactFilters.cities = [filters.city];
    if (filters.state) contactFilters.states = [filters.state];
    if (filters.country) contactFilters.countries = [filters.country];

    // --- Step 2: Contact search ---
    try {
      const contactRes = await fetch(
        "https://api.lusha.com/prospecting/contact/search",
        {
          method: "POST",
          headers: lushaHeaders,
          body: JSON.stringify({ filters: contactFilters }),
        },
      );
      debug.contactStatus = contactRes.status;
      const raw = await contactRes.text();
      debug.contactRaw = raw;
      if (contactRes.ok) {
        try {
          const parsed = JSON.parse(raw);
          contacts = parsed?.data || parsed?.results || parsed?.contacts || [];
        } catch {}
      }
    } catch (err) {
      debug.contactError = String(err);
    }

    // --- Step 3: Similar companies ---
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

    return new Response(
      JSON.stringify({ contacts, similarCompanies, debug }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
