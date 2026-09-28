// outbound-reply-draft — customer-facing "Draft with Harvey" for the Outbound
// inbox. Given an email thread the caller can see (RLS-scoped via their JWT),
// returns a short suggested reply drafted by Claude. NEVER sends, NEVER writes.
//
// Deliberately SEPARATE from harvey-reply (Harvey's internal lead-CRM handler)
// to honor the CRM ↔ Command-Center separation rule: this is customer data,
// customer-scoped, no Harvey identity or lead-CRM tables involved.
//
// SELF-CONTAINED (MCP bundler can't ship ../_shared): inlined requireUser +
// a minimal Anthropic Messages call (ANTHROPIC_API_KEY, same key normalize-
// company uses).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const env = (k: string) => Deno.env.get(k) ?? "";

async function requireUser(req: Request) {
  const authz = req.headers.get("Authorization");
  if (!authz?.startsWith("Bearer ")) return null;
  const c = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authz } },
  });
  const { data } = await c.auth.getUser();
  return data?.user ? { user: data.user, client: c } : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const auth = await requireUser(req);
  if (!auth) return json({ ok: false, error: "unauthorized" }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid json" }, 400);
  }
  const threadId = String(body?.thread_id ?? "");
  if (!threadId) return json({ ok: false, error: "thread_id required" }, 400);

  // Read the thread + its messages through the CALLER's client so RLS scopes
  // it to their org — a customer can never draft on a thread they can't see.
  const { data: thread } = await auth.client
    .from("lit_email_threads")
    .select("id, subject, company_id, contact_id, campaign_id")
    .eq("id", threadId)
    .maybeSingle();
  if (!thread) return json({ ok: false, error: "not_found" }, 404);

  const { data: msgs } = await auth.client
    .from("lit_email_messages")
    .select("direction, body_text, body_html, snippet, message_date")
    .eq("thread_id", threadId)
    .order("message_date", { ascending: true })
    .limit(20);

  const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const transcript = (msgs ?? [])
    .map((m: any) => {
      const text = m.body_text || (m.body_html ? stripHtml(String(m.body_html)) : "") || m.snippet || "";
      return `${m.direction === "inbound" ? "PROSPECT" : "US"}: ${String(text).slice(0, 1200)}`;
    })
    .join("\n\n");

  const apiKey = env("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ ok: false, error: "drafting_unavailable" }, 503);

  const prompt =
    `You are a freight sales rep replying to a prospect who responded to an outbound email. ` +
    `Write a concise, warm, professional reply (120 words max) that moves toward a 15-minute call. ` +
    `Do not invent specifics; keep it adaptable. Subject: "${thread.subject ?? ""}".\n\n` +
    `Conversation so far:\n${transcript || "(no prior messages on file)"}\n\nReply:`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!r.ok) return json({ ok: false, error: "llm_error", status: r.status }, 502);
    const out = await r.json();
    const draft = (out?.content?.[0]?.text ?? "").trim();
    return json({ ok: true, draft });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 502);
  }
});
