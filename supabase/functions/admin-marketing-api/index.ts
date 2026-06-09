// Reverse-engineered from deployed v22 of admin-marketing-api on 2026-06-09
// (drift audit found this function deployed in production with no git
// source — it powers the LIT super-admin marketing campaigns subsystem,
// including campaigns.send_test via Resend and the email-safe hero SVGs).
// Verified deployed EZBR sha256 against this output; no behavior changes.
// The CI gate in .github/workflows/edge-fn-drift-check.yml will prevent
// recurrence once the operator wires SUPABASE_ACCESS_TOKEN as a repo secret.
//
// admin-marketing-api v3 — super-admin gateway for the LIT marketing
// subsystem. v3 adds:
//   campaigns.delete                       — hard delete + cascade recipients/events
//   campaigns.send_test                    — fire one Resend send to a single email
//                                            (does NOT touch the recipient roster)
//   campaigns.create / update              — accept hero_animation
//
// Auth: JWT + email allowlist (super admin only).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPER_ADMIN_EMAILS = new Set([
  "vraymond@sparkfusiondigital.com",
  "support@logisticintel.com",
]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HERO_VALUES = new Set(["stack","broker","customs","nvocc","dashboard"]);
const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

function json(b: Record<string, unknown>, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
}

function renderTemplate(template: string | null, ctx: Record<string, string | null | undefined>): string {
  if (!template) return "";
  return template.replace(TOKEN_RE, (_m, k: string) => {
    const key = k.toLowerCase();
    const found = Object.keys(ctx).find((c) => c.toLowerCase() === key);
    const v = found ? ctx[found] : undefined;
    return v == null ? "" : String(v);
  });
}

// Static, email-safe SVGs that mirror the framer-motion illustrations on
// /l/<sector> landing pages. Animation is stripped (most email clients
// strip <animate> too). Modern webmail clients (Gmail web / Apple Mail /
// iOS Mail) render inline SVG. Outlook desktop will fall back gracefully
// (the wrapping <div> still renders the rest of the email).
function heroSvg(kind: string, accent: string): string {
  const w = 560;
  if (kind === "stack") {
    return `<div style="text-align:center;margin:0 0 16px 0;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 200" width="${w}" height="auto" role="img" aria-label="Container stack"><defs><linearGradient id="bgs" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#E0F2FE"/><stop offset="100%" stop-color="#FFFFFF"/></linearGradient></defs><rect x="0" y="0" width="360" height="200" rx="20" fill="url(#bgs)"/><rect x="40" y="170" width="280" height="6" rx="3" fill="#0F172A" opacity="0.18"/><rect x="56" y="128" width="52" height="36" rx="3" fill="#0F172A"/><rect x="116" y="128" width="52" height="36" rx="3" fill="${accent}"/><rect x="176" y="128" width="52" height="36" rx="3" fill="#64748B"/><rect x="236" y="128" width="52" height="36" rx="3" fill="${accent}"/><rect x="86" y="86" width="52" height="36" rx="3" fill="${accent}" opacity="0.92"/><rect x="146" y="86" width="52" height="36" rx="3" fill="${accent}" opacity="0.92"/><rect x="206" y="86" width="52" height="36" rx="3" fill="#0F172A" opacity="0.92"/><rect x="146" y="44" width="52" height="36" rx="3" fill="${accent}"/><line x1="172" y1="20" x2="172" y2="44" stroke="#0F172A" stroke-width="3"/><line x1="160" y1="20" x2="184" y2="20" stroke="#0F172A" stroke-width="3"/></svg></div>`;
  }
  if (kind === "broker") {
    return `<div style="text-align:center;margin:0 0 16px 0;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 240" width="${w}" height="auto" role="img" aria-label="Broker network"><defs><linearGradient id="bgb" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#DBEAFE"/><stop offset="100%" stop-color="#FFFFFF"/></linearGradient></defs><rect x="0" y="0" width="360" height="240" rx="20" fill="url(#bgb)"/><line x1="70" y1="80" x2="180" y2="125" stroke="${accent}" stroke-width="2" stroke-dasharray="6 4"/><line x1="70" y1="170" x2="180" y2="125" stroke="${accent}" stroke-width="2" stroke-dasharray="6 4"/><line x1="290" y1="80" x2="180" y2="125" stroke="${accent}" stroke-width="2" stroke-dasharray="6 4"/><line x1="290" y1="170" x2="180" y2="125" stroke="${accent}" stroke-width="2" stroke-dasharray="6 4"/><circle cx="180" cy="125" r="34" fill="${accent}"/><text x="180" y="131" text-anchor="middle" fill="#fff" font-family="ui-monospace,monospace" font-weight="700" font-size="14">YOU</text><circle cx="70" cy="80" r="20" fill="#fff" stroke="#0F172A" stroke-width="1.5"/><text x="70" y="85" text-anchor="middle" fill="#0F172A" font-family="ui-monospace,monospace" font-weight="700" font-size="13">S</text><circle cx="70" cy="170" r="20" fill="#fff" stroke="#0F172A" stroke-width="1.5"/><text x="70" y="175" text-anchor="middle" fill="#0F172A" font-family="ui-monospace,monospace" font-weight="700" font-size="13">S</text><circle cx="290" cy="80" r="20" fill="#fff" stroke="#0F172A" stroke-width="1.5"/><text x="290" y="85" text-anchor="middle" fill="#0F172A" font-family="ui-monospace,monospace" font-weight="700" font-size="13">C</text><circle cx="290" cy="170" r="20" fill="#fff" stroke="#0F172A" stroke-width="1.5"/><text x="290" y="175" text-anchor="middle" fill="#0F172A" font-family="ui-monospace,monospace" font-weight="700" font-size="13">C</text></svg></div>`;
  }
  if (kind === "customs") {
    return `<div style="text-align:center;margin:0 0 16px 0;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 220" width="${w}" height="auto" role="img" aria-label="Customs clearance"><defs><linearGradient id="bgc" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#EDE9FE"/><stop offset="100%" stop-color="#FFFFFF"/></linearGradient><marker id="a" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="${accent}"/></marker></defs><rect x="0" y="0" width="360" height="220" rx="20" fill="url(#bgc)"/><rect x="40" y="50" width="100" height="120" rx="6" fill="#fff" stroke="#0F172A" stroke-width="1.5"/><line x1="52" y1="70" x2="128" y2="70" stroke="#CBD5E1" stroke-width="2"/><line x1="52" y1="88" x2="128" y2="88" stroke="#CBD5E1" stroke-width="2"/><line x1="52" y1="106" x2="128" y2="106" stroke="#CBD5E1" stroke-width="2"/><line x1="52" y1="124" x2="128" y2="124" stroke="#CBD5E1" stroke-width="2"/><line x1="52" y1="142" x2="128" y2="142" stroke="#CBD5E1" stroke-width="2"/><path d="M 150 110 L 200 110" stroke="${accent}" stroke-width="3" marker-end="url(#a)" fill="none"/><g transform="translate(245,100) rotate(-15) translate(-245,-100)"><circle cx="245" cy="100" r="42" fill="none" stroke="${accent}" stroke-width="3"/><circle cx="245" cy="100" r="34" fill="none" stroke="${accent}" stroke-width="1.5" stroke-dasharray="3 2"/><text x="245" y="96" text-anchor="middle" fill="${accent}" font-family="ui-monospace,monospace" font-weight="800" font-size="11">CLEARED</text><text x="245" y="110" text-anchor="middle" fill="${accent}" font-family="ui-monospace,monospace" font-size="9">HS · ORIGIN</text></g><path d="M 280 165 l 10 10 l 22 -22" stroke="#16A34A" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`;
  }
  if (kind === "nvocc") {
    return `<div style="text-align:center;margin:0 0 16px 0;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 220" width="${w}" height="auto" role="img" aria-label="NVOCC pipeline"><defs><linearGradient id="bgn" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#CCFBF1"/><stop offset="100%" stop-color="#FFFFFF"/></linearGradient></defs><rect x="0" y="0" width="360" height="220" rx="20" fill="url(#bgn)"/><rect x="0" y="160" width="360" height="50" fill="${accent}" opacity="0.18"/><g><rect x="40" y="130" width="80" height="20" rx="3" fill="#0F172A"/><rect x="58" y="110" width="14" height="20" fill="${accent}"/><rect x="76" y="106" width="14" height="24" fill="${accent}"/><rect x="94" y="114" width="14" height="16" fill="${accent}"/><polygon points="40,150 30,160 130,160 120,150" fill="#0F172A"/></g><line x1="135" y1="138" x2="170" y2="138" stroke="${accent}" stroke-width="3"/><g><line x1="190" y1="90" x2="190" y2="160" stroke="#0F172A" stroke-width="3"/><line x1="190" y1="90" x2="220" y2="90" stroke="#0F172A" stroke-width="3"/><line x1="220" y1="90" x2="220" y2="110" stroke="#0F172A" stroke-width="2"/><rect x="210" y="110" width="20" height="14" fill="${accent}"/></g><line x1="240" y1="138" x2="270" y2="138" stroke="${accent}" stroke-width="3"/><g><rect x="280" y="120" width="50" height="30" rx="3" fill="#0F172A"/><rect x="280" y="110" width="22" height="14" fill="${accent}"/><circle cx="290" cy="156" r="6" fill="#0F172A"/><circle cx="320" cy="156" r="6" fill="#0F172A"/></g></svg></div>`;
  }
  if (kind === "dashboard") {
    return `<div style="text-align:center;margin:0 0 16px 0;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 220" width="${w}" height="auto" role="img" aria-label="Analytics dashboard"><defs><linearGradient id="bgd" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#FEE2E2"/><stop offset="100%" stop-color="#FFFFFF"/></linearGradient></defs><rect x="0" y="0" width="360" height="220" rx="20" fill="url(#bgd)"/><rect x="40" y="30" width="280" height="160" rx="12" fill="#fff" stroke="#0F172A" stroke-width="1.5"/><line x1="60" y1="160" x2="300" y2="160" stroke="#CBD5E1" stroke-width="1.5"/><rect x="70" y="122" width="24" height="38" rx="3" fill="#0F172A" opacity="0.85"/><rect x="108" y="98" width="24" height="62" rx="3" fill="#0F172A" opacity="0.85"/><rect x="146" y="110" width="24" height="50" rx="3" fill="#0F172A" opacity="0.85"/><rect x="184" y="72" width="24" height="88" rx="3" fill="#0F172A" opacity="0.85"/><rect x="222" y="88" width="24" height="72" rx="3" fill="#0F172A" opacity="0.85"/><rect x="260" y="50" width="24" height="110" rx="3" fill="${accent}"/><path d="M 82 122 Q 132 100 170 110 T 270 50" fill="none" stroke="${accent}" stroke-width="3" stroke-linecap="round"/><circle cx="270" cy="50" r="5" fill="${accent}"/></svg></div>`;
  }
  return "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("LIT_RESEND_API_KEY");
  const defaultFrom = Deno.env.get("LIT_RESEND_FROM_EMAIL") || "hello@updates.logisticintel.com";
  const defaultReplyTo = Deno.env.get("LIT_RESEND_REPLY_TO") || "hello@logisticintel.com";
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ ok: false, error: "server_misconfigured" }, 500);

  const auth = req.headers.get("Authorization");
  if (!auth) return json({ ok: false, error: "missing_auth" }, 401);
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json({ ok: false, error: "unauthorized" }, 401);
  const email = String(user.email || "").toLowerCase();
  if (!SUPER_ADMIN_EMAILS.has(email)) return json({ ok: false, error: "forbidden" }, 403);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  const action = String(body?.action || "");
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    switch (action) {
      case "personas.list": {
        const { data, error } = await admin.from("lit_marketing_sender_personas")
          .select("persona_key, display_name, from_email, reply_to, use_case, tone, is_default, is_active")
          .eq("is_active", true)
          .order("is_default", { ascending: false })
          .order("display_name");
        if (error) throw error;
        return json({ ok: true, data });
      }
      case "templates.list": {
        let q = admin.from("lit_marketing_email_templates")
          .select("id, template_key, name, sector, persona_key, subject, body_html, body_text, hero_animation, description, use_case, sort_order")
          .eq("is_active", true)
          .order("sort_order", { ascending: true });
        if (typeof body?.sector === "string" && body.sector) q = q.eq("sector", body.sector);
        const { data, error } = await q;
        if (error) throw error;
        return json({ ok: true, data });
      }
      case "audience.segments": {
        const { data: companies } = await admin.from("lit_marketing_audience_companies").select("target_segment");
        const { data: contacts } = await admin.from("lit_marketing_audience_contacts").select("target_segment, is_email_ready");
        const segMap = new Map<string, { companies: number; contacts: number; email_ready: number }>();
        for (const c of companies ?? []) {
          const k = (c as any).target_segment || "unknown";
          const cur = segMap.get(k) || { companies: 0, contacts: 0, email_ready: 0 };
          cur.companies += 1; segMap.set(k, cur);
        }
        for (const c of contacts ?? []) {
          const k = (c as any).target_segment || "unknown";
          const cur = segMap.get(k) || { companies: 0, contacts: 0, email_ready: 0 };
          cur.contacts += 1;
          if ((c as any).is_email_ready) cur.email_ready += 1;
          segMap.set(k, cur);
        }
        return json({ ok: true, data: Array.from(segMap.entries()).map(([k, v]) => ({ segment: k, ...v })) });
      }
      case "audience.contacts": {
        const segment = body?.segment ? String(body.segment) : null;
        const onlyEmailReady = body?.only_email_ready !== false;
        const limit = Math.min(Math.max(Number(body?.limit) || 25, 1), 200);
        const offset = Math.max(Number(body?.offset) || 0, 0);
        let q = admin.from("lit_marketing_audience_contacts")
          .select("id, email, first_name, last_name, contact_name, title, company_name, target_segment, is_email_ready, enrichment_status", { count: "exact" })
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);
        if (segment) q = q.eq("target_segment", segment);
        if (onlyEmailReady) q = q.eq("is_email_ready", true);
        const { data, error, count } = await q;
        if (error) throw error;
        return json({ ok: true, data, count: count ?? 0 });
      }
      case "campaigns.list": {
        const { data: camps, error } = await admin.from("lit_marketing_campaigns")
          .select("id, name, subject, status, sender_persona_key, daily_send_cap, segment_filter, scheduled_at, hero_animation, created_at, updated_at")
          .order("created_at", { ascending: false });
        if (error) throw error;
        const ids = (camps ?? []).map((c: any) => c.id);
        const counts = new Map<string, { queued: number; sent: number; failed: number; opens: number; clicks: number; replies: number; bounces: number }>();
        if (ids.length) {
          const { data: recRows } = await admin.from("lit_marketing_recipients").select("campaign_id, status").in("campaign_id", ids);
          for (const r of recRows ?? []) {
            const k = (r as any).campaign_id;
            const c = counts.get(k) || { queued: 0, sent: 0, failed: 0, opens: 0, clicks: 0, replies: 0, bounces: 0 };
            const s = (r as any).status as string;
            if (s === "queued") c.queued += 1;
            else if (["sent","delivered","opened","clicked","replied"].includes(s)) c.sent += 1;
            else if (s === "failed") c.failed += 1;
            counts.set(k, c);
          }
          const { data: evRows } = await admin.from("lit_marketing_events").select("campaign_id, event_type").in("campaign_id", ids);
          for (const e of evRows ?? []) {
            const k = (e as any).campaign_id;
            const c = counts.get(k) || { queued: 0, sent: 0, failed: 0, opens: 0, clicks: 0, replies: 0, bounces: 0 };
            const t = (e as any).event_type as string;
            if (t === "opened") c.opens += 1;
            else if (t === "clicked") c.clicks += 1;
            else if (t === "replied") c.replies += 1;
            else if (t === "bounced") c.bounces += 1;
            counts.set(k, c);
          }
        }
        const out = (camps ?? []).map((c: any) => ({ ...c, counts: counts.get(c.id) || { queued: 0, sent: 0, failed: 0, opens: 0, clicks: 0, replies: 0, bounces: 0 } }));
        return json({ ok: true, data: out });
      }
      case "campaigns.get": {
        const id = String(body?.id || "");
        if (!id) return json({ ok: false, error: "missing_id" }, 400);
        const { data: campaign, error } = await admin.from("lit_marketing_campaigns").select("*").eq("id", id).maybeSingle();
        if (error) throw error;
        if (!campaign) return json({ ok: false, error: "not_found" }, 404);
        return json({ ok: true, data: campaign });
      }
      case "campaigns.create": {
        const name = String(body?.name || "").trim();
        const subject = String(body?.subject || "").trim();
        if (!name || !subject) return json({ ok: false, error: "missing_name_or_subject" }, 400);
        const heroAnim = body?.hero_animation && HERO_VALUES.has(body.hero_animation) ? body.hero_animation : null;
        const { data, error } = await admin.from("lit_marketing_campaigns")
          .insert({
            name,
            subject,
            body_html: body?.body_html ?? null,
            body_text: body?.body_text ?? null,
            sender_persona_key: body?.sender_persona_key ?? "lit_team",
            daily_send_cap: Math.max(1, Math.min(2000, Number(body?.daily_send_cap) || 200)),
            segment_filter: body?.segment_filter && typeof body.segment_filter === "object" ? body.segment_filter : {},
            hero_animation: heroAnim,
            status: "draft",
            created_by: user.id,
          }).select("id").single();
        if (error) throw error;
        return json({ ok: true, data });
      }
      case "campaigns.update": {
        const id = String(body?.id || "");
        if (!id) return json({ ok: false, error: "missing_id" }, 400);
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (typeof body?.name === "string") patch.name = body.name.trim();
        if (typeof body?.subject === "string") patch.subject = body.subject.trim();
        if (typeof body?.body_html === "string" || body?.body_html === null) patch.body_html = body.body_html;
        if (typeof body?.body_text === "string" || body?.body_text === null) patch.body_text = body.body_text;
        if (typeof body?.sender_persona_key === "string") patch.sender_persona_key = body.sender_persona_key;
        if (typeof body?.daily_send_cap === "number") patch.daily_send_cap = Math.max(1, Math.min(2000, body.daily_send_cap));
        if (body?.segment_filter && typeof body.segment_filter === "object") patch.segment_filter = body.segment_filter;
        if (body?.hero_animation === null || (typeof body?.hero_animation === "string" && (HERO_VALUES.has(body.hero_animation) || body.hero_animation === ""))) {
          patch.hero_animation = body.hero_animation === "" ? null : body.hero_animation;
        }
        if (typeof body?.status === "string" && ["draft","scheduled","active","paused","completed"].includes(body.status)) {
          patch.status = body.status;
        }
        const { error } = await admin.from("lit_marketing_campaigns").update(patch).eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }
      case "campaigns.delete": {
        const id = String(body?.id || "");
        if (!id) return json({ ok: false, error: "missing_id" }, 400);
        // Cascade is on lit_marketing_recipients (FK on delete cascade) and
        // lit_marketing_events (FK on delete cascade), so a single delete
        // here removes everything tied to this campaign.
        const { error } = await admin.from("lit_marketing_campaigns").delete().eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }
      case "campaigns.send_test": {
        if (!resendApiKey) return json({ ok: false, error: "server_misconfigured:LIT_RESEND_API_KEY" }, 500);
        const id = String(body?.id || "");
        const toEmail = String(body?.to_email || "").trim().toLowerCase();
        if (!id) return json({ ok: false, error: "missing_id" }, 400);
        if (!EMAIL_RE.test(toEmail)) return json({ ok: false, error: "invalid_to_email" }, 400);

        const { data: campaign, error: campErr } = await admin.from("lit_marketing_campaigns")
          .select("id, name, subject, body_html, body_text, sender_persona_key, hero_animation").eq("id", id).maybeSingle();
        if (campErr) throw campErr;
        if (!campaign) return json({ ok: false, error: "campaign_not_found" }, 404);

        let persona: any = null;
        if (campaign.sender_persona_key) {
          const { data: p } = await admin.from("lit_marketing_sender_personas")
            .select("persona_key, display_name, from_email, reply_to")
            .eq("persona_key", campaign.sender_persona_key).eq("is_active", true).maybeSingle();
          persona = p;
        }
        const fromEmail = persona?.from_email || defaultFrom;
        const fromDisplay = persona?.display_name || "Logistic Intel";
        const replyTo = persona?.reply_to || defaultReplyTo;
        const ctx: Record<string, string> = {
          first_name: "Test",
          last_name: "Recipient",
          company_name: "Logistic Intel",
          email: toEmail,
        };
        const subject = `[TEST] ${renderTemplate(campaign.subject, ctx)}`;
        const heroHtml = campaign.hero_animation ? heroSvg(campaign.hero_animation, accentForHero(campaign.hero_animation)) : "";
        const html = renderTemplate(campaign.body_html, ctx);
        const text = renderTemplate(campaign.body_text, ctx);
        const finalHtml = html ? `${heroHtml}${html}` : (text ? null : null);
        if (!subject || (!finalHtml && !text)) return json({ ok: false, error: "empty_template" }, 400);

        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: `${fromDisplay} <${fromEmail}>`,
            to: [toEmail],
            reply_to: replyTo,
            subject,
            html: finalHtml ?? undefined,
            text: text ?? undefined,
            headers: { "X-LIT-Campaign-Id": campaign.id, "X-LIT-Test": "1" },
            tags: [{ name: "campaign_id", value: campaign.id }, { name: "send_kind", value: "test" }],
          }),
        });
        const respBody = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          const message = `resend_${resp.status}:${respBody?.message || respBody?.name || ""}`.slice(0, 500);
          return json({ ok: false, error: message }, 502);
        }
        return json({ ok: true, data: { message_id: respBody?.id ?? null, to: toEmail, from: fromEmail } });
      }
      case "recipients.list": {
        const id = String(body?.campaign_id || "");
        if (!id) return json({ ok: false, error: "missing_campaign_id" }, 400);
        const limit = Math.min(Math.max(Number(body?.limit) || 50, 1), 500);
        const offset = Math.max(Number(body?.offset) || 0, 0);
        const { data, error, count } = await admin.from("lit_marketing_recipients")
          .select("id, email, first_name, last_name, company_name, status, last_sent_at, provider_message_id, last_error, created_at", { count: "exact" })
          .eq("campaign_id", id)
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);
        if (error) throw error;
        return json({ ok: true, data, count: count ?? 0 });
      }
      case "recipients.add_from_segment": {
        const campaignId = String(body?.campaign_id || "");
        const segment = body?.segment ? String(body.segment) : null;
        const limit = Math.min(Math.max(Number(body?.limit) || 100, 1), 1000);
        if (!campaignId) return json({ ok: false, error: "missing_campaign_id" }, 400);
        let q = admin.from("lit_marketing_audience_contacts")
          .select("id, email, first_name, last_name, contact_name, company_name, target_segment, is_email_ready")
          .eq("is_email_ready", true).not("email", "is", null).limit(limit);
        if (segment) q = q.eq("target_segment", segment);
        const { data: aud, error: audErr } = await q;
        if (audErr) throw audErr;
        const { data: supRows } = await admin.from("lit_marketing_suppression_list").select("email");
        const suppressed = new Set((supRows ?? []).map((r: any) => String(r.email).toLowerCase()));
        const rows = (aud ?? [])
          .map((r: any) => ({
            email: String(r.email).trim().toLowerCase(),
            first_name: r.first_name ?? null,
            last_name: r.last_name ?? null,
            company_name: r.company_name ?? null,
            audience_contact_id: r.id,
          }))
          .filter((r: any) => EMAIL_RE.test(r.email) && !suppressed.has(r.email))
          .map((r: any) => ({
            campaign_id: campaignId,
            audience_contact_id: r.audience_contact_id,
            email: r.email,
            first_name: r.first_name,
            last_name: r.last_name,
            company_name: r.company_name,
            status: "queued",
            next_send_at: new Date().toISOString(),
          }));
        if (rows.length === 0) return json({ ok: true, data: { added: 0, skipped: aud?.length ?? 0 } });
        const { error: insErr, data: ins } = await admin.from("lit_marketing_recipients")
          .upsert(rows, { onConflict: "campaign_id,email", ignoreDuplicates: true }).select("id");
        if (insErr) throw insErr;
        return json({ ok: true, data: { added: ins?.length ?? 0, skipped: (aud?.length ?? 0) - (ins?.length ?? 0) } });
      }
      case "recipients.add_emails": {
        const campaignId = String(body?.campaign_id || "");
        if (!campaignId) return json({ ok: false, error: "missing_campaign_id" }, 400);
        const list = Array.isArray(body?.emails) ? body.emails : [];
        const rows = list
          .map((m: any) => ({
            email: String(m?.email || "").trim().toLowerCase(),
            first_name: m?.first_name ?? null,
            last_name: m?.last_name ?? null,
            company_name: m?.company_name ?? null,
          }))
          .filter((m: any) => EMAIL_RE.test(m.email))
          .map((m: any) => ({
            campaign_id: campaignId,
            audience_contact_id: null,
            ...m,
            status: "queued",
            next_send_at: new Date().toISOString(),
          }));
        if (rows.length === 0) return json({ ok: true, data: { added: 0 } });
        const { error, data } = await admin.from("lit_marketing_recipients")
          .upsert(rows, { onConflict: "campaign_id,email", ignoreDuplicates: true }).select("id");
        if (error) throw error;
        return json({ ok: true, data: { added: data?.length ?? 0 } });
      }
      case "events.summary": {
        const id = String(body?.campaign_id || "");
        if (!id) return json({ ok: false, error: "missing_campaign_id" }, 400);
        const { data: ev, error } = await admin.from("lit_marketing_events")
          .select("event_type, occurred_at, recipient_id, metadata")
          .eq("campaign_id", id)
          .order("occurred_at", { ascending: false }).limit(500);
        if (error) throw error;
        return json({ ok: true, data: ev });
      }
      default:
        return json({ ok: false, error: "unknown_action", action }, 400);
    }
  } catch (e: any) {
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});

function accentForHero(kind: string): string {
  if (kind === "stack") return "#0EA5E9";
  if (kind === "broker") return "#3B82F6";
  if (kind === "customs") return "#7C3AED";
  if (kind === "nvocc") return "#0F766E";
  if (kind === "dashboard") return "#DC2626";
  return "#0F172A";
}
