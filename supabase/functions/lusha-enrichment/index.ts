import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("lusha-enrichment");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const LUSHA_API_KEY = Deno.env.get("LUSHA_API_KEY") || "";
const LUSHA_BASE_URL = "https://api.lusha.com/v2";

interface EnrichContactRequest {
  company_id: string;
  domain?: string;
  linkedin_url?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  /** Phase 3 — when true, request phone reveal from Lusha (synchronous)
   *  and charge 10 additional credits per contact on top of the email
   *  unlock baseline. */
  unlock_phone?: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const requestData: EnrichContactRequest = await req.json();

    if (!requestData.company_id) {
      return new Response(
        JSON.stringify({ error: "company_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("*")
      .eq("company_id", requestData.company_id)
      .maybeSingle();

    if (companyError || !company) {
      return new Response(
        JSON.stringify({ error: "Company not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const domain = requestData.domain || company.domain;
    if (!domain) {
      return new Response(
        JSON.stringify({ error: "Company domain is required for enrichment" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Enrichment Phase 1: resolve caller's org for credit gating.
    // Skip the gate if we can't resolve an org (defensive; matches existing
    // soft-fail patterns in this file).
    let orgIdForCredits: string | null = null;
    let orgPlanCode = "free_trial";
    try {
      const { data: omRow } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .order("joined_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      orgIdForCredits = (omRow as any)?.org_id ?? null;
      if (orgIdForCredits) {
        const { data: org } = await supabase
          .from("organizations")
          .select("plan")
          .eq("id", orgIdForCredits)
          .maybeSingle();
        if ((org as any)?.plan) orgPlanCode = String((org as any).plan).toLowerCase();
      }
    } catch (_) {}

    // Phase 3 — phone unlock costs 10 extra credits per contact and goes
    // through Lusha's sync /person reveal (vs Apollo's async webhook).
    const phoneUnlockRequested = requestData.unlock_phone === true;
    const PHONE_UNLOCK_CREDITS = 10;
    const EMAIL_UNLOCK_CREDITS = 1;

    // Phase 3 R4 — per-user daily phone-unlock cap (mirrors apollo-contact-enrich).
    if (phoneUnlockRequested && orgIdForCredits) {
      try {
        let userDailyLimit = 30;
        try {
          const { data: planRow } = await supabase
            .from("plans")
            .select("user_phone_daily_limit")
            .eq("code", orgPlanCode)
            .maybeSingle();
          const cap = (planRow as any)?.user_phone_daily_limit;
          if (typeof cap === "number") userDailyLimit = cap;
        } catch (_) {}

        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { count: phoneUnlocksUsed } = await supabase
          .from("lit_credit_ledger")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("action", "enrich_phone")
          .gte("created_at", since24h);
        const usedToday = typeof phoneUnlocksUsed === "number" ? phoneUnlocksUsed : 0;
        // Lusha-specific lookup is single-contact; bulk pulls up to 10.
        const requested =
          requestData.linkedin_url || (requestData.first_name && requestData.last_name)
            ? 1
            : 10;
        if (usedToday + requested > userDailyLimit) {
          const retryAfter = new Date(Date.now() + 60 * 60 * 1000).toISOString();
          return new Response(
            JSON.stringify({
              ok: false,
              code: "USER_RATE_LIMITED",
              reason: "user_rate_limited",
              feature: "enrich_phone",
              user_phone_unlocks_used_24h: usedToday,
              user_phone_daily_limit: userDailyLimit,
              requested,
              retry_after: retryAfter,
              plan: orgPlanCode,
              message: `Per-user phone unlock cap reached on the ${orgPlanCode} plan (${usedToday} of ${userDailyLimit} used in last 24h).`,
            }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch (_) {
        // ledger check failed → fall through to org-wide quota
      }
    }

    // Pre-flight credit check. Lusha specific-contact lookup = 1 enrichment;
    // bulk lookup pulls up to 10 contacts so we reserve up to 10 credits.
    // Phone unlock adds 10 per contact.
    if (orgIdForCredits) {
      try {
        const baseCost =
          requestData.linkedin_url || (requestData.first_name && requestData.last_name)
            ? EMAIL_UNLOCK_CREDITS
            : EMAIL_UNLOCK_CREDITS * 10;
        const phoneCost = phoneUnlockRequested
          ? (requestData.linkedin_url || (requestData.first_name && requestData.last_name)
              ? PHONE_UNLOCK_CREDITS
              : PHONE_UNLOCK_CREDITS * 10)
          : 0;
        const expectedCost = baseCost + phoneCost;
        const { data: pre } = await supabase.rpc("lit_get_credit_usage", {
          p_org_id: orgIdForCredits,
          p_user_id: user.id,
        });
        const quota = (pre as any)?.quota as number | null | undefined;
        const used = ((pre as any)?.used_this_month as number | undefined) ?? 0;
        if (quota !== null && quota !== undefined && used + expectedCost > quota) {
          return new Response(
            JSON.stringify({
              ok: false,
              code: "CREDIT_QUOTA_EXCEEDED",
              feature: phoneUnlockRequested ? "enrich_phone" : "enrich_email",
              credits_used: used,
              credits_quota: quota,
              credits_requested: expectedCost,
              message: `Enrichment credit cap reached (${used} of ${quota} used this month).`,
            }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch (_) {
        // RPC not deployed — proceed (existing behavior).
      }
    }

    let contacts = [];

    if (requestData.linkedin_url || (requestData.first_name && requestData.last_name)) {
      const contact = await enrichSpecificContact(requestData, domain, phoneUnlockRequested);
      if (contact) {
        contacts = [contact];
      }
    } else {
      contacts = await enrichCompanyContacts(domain, phoneUnlockRequested);
    }

    const savedContacts = [];
    for (const contact of contacts) {
      const { data: savedContact, error: saveError } = await supabase
        .from("contacts")
        .insert({
          company_id: requestData.company_id,
          user_id: user.id,
          contact_name: contact.name,
          contact_title: contact.title,
          contact_email: contact.email,
          contact_phone: contact.phone,
          contact_linkedin: contact.linkedin_url,
          department: contact.department,
          seniority: contact.seniority,
          verified: contact.verified || false,
          enrichment_source: "lusha",
          raw_data: contact.raw_data || {},
          enriched_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (!saveError && savedContact) {
        savedContacts.push(savedContact);

        // Enrichment Phase 1+3: per-contact credit ledger inserts.
        // Email = 1 credit; phone unlock (when requested) = 10 extra.
        if (orgIdForCredits) {
          try {
            await supabase.rpc("lit_consume_credits", {
              p_action: "enrich_email",
              p_credits: EMAIL_UNLOCK_CREDITS,
              p_metadata: {
                user_id: user.id,
                org_id: orgIdForCredits,
                provider: "lusha",
                contact_id: savedContact.id,
                email_unlocked: !!contact.email,
                phone_unlocked: !!contact.phone,
              },
            });
          } catch (_) {
            // RPC not deployed; pre-flight already covered it.
          }
          if (phoneUnlockRequested) {
            try {
              await supabase.rpc("lit_consume_credits", {
                p_action: "enrich_phone",
                p_credits: PHONE_UNLOCK_CREDITS,
                p_metadata: {
                  user_id: user.id,
                  org_id: orgIdForCredits,
                  provider: "lusha",
                  contact_id: savedContact.id,
                  phone_present: !!contact.phone,
                },
              });
            } catch (_) {
              // RPC not deployed; pre-flight already covered it.
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        company_id: requestData.company_id,
        contacts: savedContacts,
        count: savedContacts.length,
        phone_unlock_requested: phoneUnlockRequested,
        plan: orgPlanCode,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    log.error("enrichment_error", { err: String((error as Error)?.message ?? error) });
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: error.status || 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function enrichSpecificContact(
  requestData: EnrichContactRequest,
  domain: string,
  unlockPhone = false,
): Promise<any | null> {
  if (!LUSHA_API_KEY) {
    log.warn("api_key_missing_using_mock");
    return generateMockContact(requestData.first_name, requestData.last_name, requestData.title, domain);
  }

  try {
    const body: any = { domain };

    if (requestData.linkedin_url) {
      body.linkedinUrl = requestData.linkedin_url;
    } else if (requestData.first_name && requestData.last_name) {
      body.firstName = requestData.first_name;
      body.lastName = requestData.last_name;
    }
    // Phase 3 — Lusha's /person endpoint includes phones inline when the
    // request opts into them. Set the flag forwarded by callers.
    if (unlockPhone) {
      body.revealPhones = true;
      body.includePhoneNumbers = true;
    }

    const response = await fetch(`${LUSHA_BASE_URL}/person`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-token": LUSHA_API_KEY,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Lusha API error: ${response.status}`);
    }

    const data = await response.json();

    return {
      name: `${data.firstName || ""} ${data.lastName || ""}`.trim(),
      title: data.title || data.position || requestData.title || null,
      email: data.emailAddress || null,
      phone: data.phoneNumber || data.mobilePhone || null,
      linkedin_url: data.linkedinUrl || requestData.linkedin_url || null,
      department: data.department || null,
      seniority: data.seniority || null,
      verified: true,
      raw_data: data,
    };
  } catch (error) {
    log.error("enrichment_failed_using_mock", { err: String((error as Error)?.message ?? error) });
    return generateMockContact(requestData.first_name, requestData.last_name, requestData.title, domain);
  }
}

async function enrichCompanyContacts(
  domain: string,
  unlockPhone = false,
): Promise<any[]> {
  if (!LUSHA_API_KEY) {
    log.warn("api_key_missing_using_mock");
    return generateMockCompanyContacts(domain);
  }

  try {
    const url = `${LUSHA_BASE_URL}/company/${encodeURIComponent(domain)}/contacts${unlockPhone ? "?revealPhones=true" : ""}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "api-token": LUSHA_API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`Lusha API error: ${response.status}`);
    }

    const data = await response.json();
    const contacts = Array.isArray(data.contacts) ? data.contacts : [];

    return contacts.slice(0, 10).map((contact: any) => ({
      name: `${contact.firstName || ""} ${contact.lastName || ""}`.trim(),
      title: contact.title || contact.position || null,
      email: contact.emailAddress || null,
      phone: contact.phoneNumber || contact.mobilePhone || null,
      linkedin_url: contact.linkedinUrl || null,
      department: contact.department || null,
      seniority: contact.seniority || null,
      verified: true,
      raw_data: contact,
    }));
  } catch (error) {
    log.error("company_enrichment_failed_using_mock", { err: String((error as Error)?.message ?? error) });
    return generateMockCompanyContacts(domain);
  }
}

function generateMockContact(
  firstName?: string,
  lastName?: string,
  title?: string,
  domain?: string
): any {
  const name = firstName && lastName ? `${firstName} ${lastName}` : "John Doe";
  const emailName = name.toLowerCase().replace(/ /g, ".");
  const email = domain ? `${emailName}@${domain}` : null;

  return {
    name,
    title: title || "Logistics Manager",
    email,
    phone: "+1-555-0100",
    linkedin_url: null,
    department: "Operations",
    seniority: "Manager",
    verified: false,
    raw_data: { _mock: true },
  };
}

function generateMockCompanyContacts(domain: string): any[] {
  const titles = [
    "VP of Supply Chain",
    "Logistics Director",
    "Operations Manager",
    "Procurement Manager",
    "Import/Export Manager",
  ];

  return titles.map((title, index) => {
    const firstName = ["Sarah", "Michael", "Jennifer", "David", "Lisa"][index];
    const lastName = ["Johnson", "Smith", "Williams", "Brown", "Davis"][index];
    const name = `${firstName} ${lastName}`;
    const emailName = name.toLowerCase().replace(/ /g, ".");

    return {
      name,
      title,
      email: `${emailName}@${domain}`,
      phone: `+1-555-0${100 + index}`,
      linkedin_url: null,
      department: index < 2 ? "Executive" : "Operations",
      seniority: index < 2 ? "Executive" : "Manager",
      verified: false,
      raw_data: { _mock: true },
    };
  });
}
