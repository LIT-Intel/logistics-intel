import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

    let contacts = [];

    if (requestData.linkedin_url || (requestData.first_name && requestData.last_name)) {
      const contact = await enrichSpecificContact(requestData, domain);
      if (contact) {
        contacts = [contact];
      }
    } else {
      contacts = await enrichCompanyContacts(domain);
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
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        company_id: requestData.company_id,
        contacts: savedContacts,
        count: savedContacts.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Lusha enrichment error:", error);
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
  domain: string
): Promise<any | null> {
  if (!LUSHA_API_KEY) {
    console.warn("LUSHA_API_KEY not configured, using mock data");
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
    console.error("Lusha enrichment failed, using mock data:", error);
    return generateMockContact(requestData.first_name, requestData.last_name, requestData.title, domain);
  }
}

async function enrichCompanyContacts(domain: string): Promise<any[]> {
  if (!LUSHA_API_KEY) {
    console.warn("LUSHA_API_KEY not configured, using mock data");
    return generateMockCompanyContacts(domain);
  }

  try {
    const response = await fetch(`${LUSHA_BASE_URL}/company/${encodeURIComponent(domain)}/contacts`, {
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
    console.error("Lusha company enrichment failed, using mock data:", error);
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
