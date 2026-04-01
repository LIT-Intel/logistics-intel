import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/*
 * Supabase Edge Function: generate-brief
 *
 * This function generates a freight intelligence brief for a company using OpenAI's GPT model.
 * The caller should pass a JSON body containing:
 *   {
 *     companyName: string,
 *     shipments: number,
 *     teu: number,
 *     estSpendUsd: number,
 *     topRoute: string,
 *     recentRoute: string
 *   }
 *
 * The function builds a prompt summarising the company’s key metrics and asks the model
 * to produce a concise brief. It returns the generated brief as plain text.
 *
 * Secrets:
 *   OPENAI_API_KEY – should be stored in Supabase project secrets.
 */

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Missing OPENAI_API_KEY" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const {
      companyName,
      shipments,
      teu,
      estSpendUsd,
      topRoute,
      recentRoute,
    } = body || {};

    // Build a natural language prompt summarizing the company metrics
    const prompt = `Generate a concise but strong freight intelligence brief for this company.\n\nCompany: ${companyName}\nShipments (last 12 months): ${shipments}\nTEU (last 12 months): ${teu}\nEstimated Spend USD (last 12 months): ${estSpendUsd}\nTop Route: ${topRoute}\nMost Recent Route: ${recentRoute}\n\nReturn:\n1. Executive summary\n2. Key trade lane insight\n3. Commercial opportunity\n4. Risk flags\n5. Recommended outreach angle`; 

    // Call the OpenAI API
    const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4-turbo",
        messages: [
          {
            role: "system",
            content:
              "You are a freight intelligence analyst helping a logistics sales rep prepare for a prospect conversation.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 700,
      }),
    });

    const raw = await aiResp.text();
    if (!aiResp.ok) {
      return new Response(
        JSON.stringify({ error: "OpenAI request failed", status: aiResp.status, raw }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    let brief = "";
    try {
      const parsed = JSON.parse(raw);
      brief = parsed?.choices?.[0]?.message?.content || "";
    } catch {
      brief = raw;
    }

    return new Response(
      JSON.stringify({ brief }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
