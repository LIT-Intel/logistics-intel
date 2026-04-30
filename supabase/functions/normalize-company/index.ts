import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResp({ error: "Method not allowed" }, 405);
  }
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const company_id: string | undefined = body?.company_id;
    if (!company_id) return jsonResp({ error: "Missing company_id" }, 400);

    // Load company + latest snapshot
    const { data: company } = await admin
      .from("lit_companies")
      .select("*")
      .eq("id", company_id)
      .maybeSingle();
    if (!company) return jsonResp({ error: "Company not found" }, 404);

    // Cache hit — return early if confidence high
    const cached = company.enrichment_params as any;
    if (cached && cached.confidence === "high" && !body?.force_refresh) {
      return jsonResp({ ok: true, cached: true, ...cached });
    }

    if (!anthropicKey) {
      return jsonResp({ error: "ANTHROPIC_API_KEY not configured" }, 500);
    }

    const sourceKey = company.source_company_key as string | null;
    let snapshot: any = null;
    if (sourceKey) {
      const slug = sourceKey.startsWith("company/") ? sourceKey.slice(8) : sourceKey;
      const { data } = await admin
        .from("lit_importyeti_company_snapshot")
        .select("parsed_summary")
        .eq("company_id", slug)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      snapshot = data?.parsed_summary ?? null;
    }

    const aliases = Array.isArray(snapshot?.also_known_names) ? snapshot.also_known_names.slice(0, 8) : [];
    const hsChapters = Array.isArray(snapshot?.hs_profile?.chapters)
      ? snapshot.hs_profile.chapters.slice(0, 6).map((c: any) => c?.code ?? c)
      : [];

    const prompt = `You normalize B2B company data for contact enrichment. Given import/export records, infer canonical domain + HQ + firmographics.

Input:
- Name: ${company.name ?? ""}
- Website: ${company.website ?? company.domain ?? ""}
- Address: ${company.address ?? ""}
- Aliases: ${JSON.stringify(aliases)}
- Industry hints (HS chapters): ${JSON.stringify(hsChapters)}

Rules:
1. Canonical domain: root domain only (sony.com not am.sony.com).
2. Detect forwarders: dhl, kuehne, dsv, geodis, expeditors, ceva, db schenker, flexport, nippon express, yusen → isForwarder=true.
3. HQ: ignore warehouses/ports, use corporate address.
4. Industry: map HS codes to business category.
5. Revenue/headcount: rough estimates from shipment volume.

Return JSON only (no prose, no code fences):
{
  "canonicalDomain": "...",
  "hqLocation": {"city":"...","state":"...","country":"..."},
  "confidence": "high|medium|low",
  "isForwarder": false,
  "firmographics": {
    "industry": "...",
    "estimatedRevenue": "...",
    "estimatedHeadcount": "..."
  }
}`;

    const aRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!aRes.ok) {
      const t = await aRes.text();
      return jsonResp({ error: "Anthropic API failed", status: aRes.status, detail: t }, 500);
    }

    const aData = await aRes.json();
    const text = aData?.content?.[0]?.text ?? "";
    let parsed: any;
    try {
      const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      parsed = JSON.parse(cleaned);
    } catch {
      return jsonResp({ error: "Anthropic returned non-JSON", text }, 500);
    }

    const firm = parsed?.firmographics ?? {};
    await admin
      .from("lit_companies")
      .update({
        enrichment_params: parsed,
        industry: firm.industry ?? null,
        revenue: firm.estimatedRevenue ?? null,
        headcount: firm.estimatedHeadcount ?? null,
      })
      .eq("id", company_id);

    return jsonResp({ ok: true, cached: false, ...parsed });
  } catch (err) {
    return jsonResp({ error: "Internal error", detail: String(err) }, 500);
  }
});