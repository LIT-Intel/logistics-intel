import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_MODEL = "gemini-1.5-flash";

interface EnrichmentRequest {
  company_id: string;
  enrichment_types?: string[];
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

    const { company_id, enrichment_types = ["summary", "insights"] }: EnrichmentRequest = await req.json();

    if (!company_id) {
      return new Response(
        JSON.stringify({ error: "company_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("*")
      .eq("company_id", company_id)
      .maybeSingle();

    if (companyError || !company) {
      return new Response(
        JSON.stringify({ error: "Company not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const enrichments: Record<string, any> = {};

    for (const enrichmentType of enrichment_types) {
      try {
        const enrichmentData = await generateEnrichment(company, enrichmentType);
        enrichments[enrichmentType] = enrichmentData;

        await supabase
          .from("company_enrichment")
          .upsert({
            company_id,
            enrichment_type: enrichmentType,
            enrichment_data: enrichmentData,
            model_version: GEMINI_MODEL,
            enriched_at: new Date().toISOString(),
          }, { onConflict: "company_id,enrichment_type" });
      } catch (error: any) {
        console.error(`Error generating ${enrichmentType} enrichment:`, error);
        enrichments[enrichmentType] = { error: error.message };
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        company_id,
        enrichments,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Gemini enrichment error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: error.status || 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function generateEnrichment(company: any, enrichmentType: string): Promise<any> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  let prompt = "";

  switch (enrichmentType) {
    case "summary":
      prompt = `Generate a concise 2-3 sentence business summary for this company:

Company Name: ${company.company_name}
Domain: ${company.domain || "N/A"}
Country: ${company.country_code || "N/A"}
Annual Shipments: ${company.shipments_12m || 0}
Address: ${company.address || "N/A"}

Focus on their likely business operations, industry, and scale based on shipment data.`;
      break;

    case "insights":
      prompt = `Analyze this company's shipping patterns and provide 3-4 key business insights:

Company Name: ${company.company_name}
Annual Shipments: ${company.shipments_12m || 0}
Recent Activity: ${company.most_recent_shipment || "N/A"}
Top Suppliers: ${JSON.stringify(company.top_suppliers || [])}
Country: ${company.country_code || "N/A"}

Provide insights about:
1. Business scale and growth potential
2. Supply chain complexity
3. Potential logistics needs
4. Sales approach recommendations`;
      break;

    case "sales_pitch":
      prompt = `Create a compelling sales pitch opener for reaching out to this company about logistics services:

Company Name: ${company.company_name}
Annual Shipments: ${company.shipments_12m || 0}
Recent Activity: ${company.most_recent_shipment || "N/A"}

Make it personalized, data-driven, and value-focused. 2-3 sentences max.`;
      break;

    default:
      throw new Error(`Unknown enrichment type: ${enrichmentType}`);
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }],
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const result = await response.json();
  const text = result?.candidates?.[0]?.content?.parts?.[0]?.text || "";

  return {
    text: text.trim(),
    generated_at: new Date().toISOString(),
    model: GEMINI_MODEL,
  };
}
