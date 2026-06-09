// Reverse-engineered from deployed v21 of save-signature on 2026-06-09
// (drift audit found this function deployed in production with no git
// source — it's the authoritative server-side sanitizer + upsert for
// the per-user email signature, with a strict tag/attribute allowlist
// and 32 KB cap). Verified deployed EZBR sha256 against this output;
// no behavior changes. The CI gate in
// .github/workflows/edge-fn-drift-check.yml will prevent recurrence
// once the operator wires SUPABASE_ACCESS_TOKEN as a repo secret.
//
// save-signature — authoritative server-side sanitizer + upsert for the
// per-user email signature.
//
// POST { signature_html: string, signature_text?: string, default_timezone?: string }
// Returns { ok, signature_html, signature_text }.
//
// Sanitization: strict allowlist for tags + per-tag attribute whitelist.
// Blocks <script|style|iframe|object|embed|link|meta|form|input|button>,
// every event handler (on*), javascript: / vbscript: URIs, and data:
// URIs except data:image/(png|jpeg|gif|webp|svg+xml). All comments
// stripped. Output capped at 32 KB.
//
// Plain-text fallback is derived from the sanitized HTML when not
// supplied: tags stripped, entities decoded, whitespace collapsed.
//
// Hard rules:
//  - Never trust client sanitization alone. Re-sanitize every save.
//  - Never inline <style>; outbound mail readers (Gmail/Outlook) reject
//    or strip them anyway, and they're a vector for content-spoof.
//  - Inline styles via the `style` attribute ARE allowed but cleaned to
//    a small property allowlist (see ALLOW_STYLE_PROPS below).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_HTML_BYTES = 32 * 1024; // 32 KB after sanitization
const MAX_TEXT_BYTES = 8 * 1024;

const ALLOW_TAGS = new Set([
  "a", "b", "br", "div", "em", "hr", "i", "img", "li", "ol",
  "p", "small", "span", "strong", "sub", "sup",
  "table", "tbody", "td", "tfoot", "th", "thead", "tr",
  "u", "ul",
]);

const ALLOW_VOID_TAGS = new Set(["br", "hr", "img"]);

// Per-tag attribute allowlist. Anything not listed is dropped.
const ALLOW_ATTRS: Record<string, string[]> = {
  a:     ["href", "title", "target", "rel", "style"],
  img:   ["src", "alt", "width", "height", "style"],
  table: ["border", "cellpadding", "cellspacing", "width", "style"],
  td:    ["align", "valign", "width", "colspan", "rowspan", "style"],
  th:    ["align", "valign", "width", "colspan", "rowspan", "style"],
  tr:    ["align", "valign", "style"],
  div:   ["style"],
  p:     ["style"],
  span:  ["style"],
  strong:["style"],
  em:    ["style"],
  b:     ["style"],
  i:     ["style"],
  u:     ["style"],
  hr:    ["style"],
  br:    ["style"],
  ol:    ["style"],
  ul:    ["style"],
  li:    ["style"],
  small: ["style"],
  sub:   ["style"],
  sup:   ["style"],
  thead: ["style"],
  tbody: ["style"],
  tfoot: ["style"],
};

// Inline `style` properties that survive sanitization. Anything else is
// dropped — this prevents tricks like `expression()`, `behavior:`, or
// position-based phishing UI.
const ALLOW_STYLE_PROPS = new Set([
  "color", "background-color", "font-family", "font-size", "font-weight",
  "font-style", "text-align", "text-decoration", "line-height",
  "margin", "margin-top", "margin-bottom", "margin-left", "margin-right",
  "padding", "padding-top", "padding-bottom", "padding-left", "padding-right",
  "width", "height", "max-width", "max-height", "min-width", "min-height",
  "border", "border-top", "border-bottom", "border-left", "border-right",
  "border-color", "border-style", "border-width", "border-radius",
  "display", "vertical-align",
]);

function json(b: Record<string, unknown>, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
}

// Decode a small set of HTML entities for the plain-text fallback. Not
// exhaustive — only the ones most likely to show up in a copy/paste.
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

function encodeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normaliseUrl(raw: string, isImg = false): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  // Block dangerous URI schemes outright.
  if (/^(javascript|vbscript|file):/i.test(trimmed)) return null;
  // Allow relative + http(s) + mailto + tel + (data:image/* only on img).
  if (/^(https?:|mailto:|tel:|#|\/)/i.test(trimmed)) return trimmed;
  if (isImg && /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(trimmed)) {
    return trimmed;
  }
  return null;
}

function cleanStyle(raw: string): string {
  // "color: red; font-weight:bold; expression(alert(1))" → only the
  // allowlisted props survive, with each value scrubbed for url(...).
  const out: string[] = [];
  for (const decl of raw.split(";")) {
    const idx = decl.indexOf(":");
    if (idx < 0) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const val = decl.slice(idx + 1).trim();
    if (!ALLOW_STYLE_PROPS.has(prop)) continue;
    // Strip url(...) and any javascript-y values to be safe.
    if (/url\s*\(/i.test(val) || /expression\s*\(/i.test(val) || /behavior\s*:/i.test(val)) continue;
    if (val.length === 0 || val.length > 120) continue;
    out.push(`${prop}: ${val.replace(/[<>"']/g, "")}`);
  }
  return out.join("; ");
}

// Tokenise HTML into open / close / void tags and text. Then re-emit
// only the tokens that survive the allowlists. This is a lightweight
// parser — sufficient for signature-sized content (32 KB max) and
// avoids pulling DOMPurify into Deno.
function sanitizeHtml(input: string): string {
  if (!input) return "";
  // Strip comments and CDATA.
  let html = input.replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  // Drop entire <script>, <style>, <iframe>, etc. blocks including content.
  html = html.replace(
    /<\s*(script|style|iframe|object|embed|link|meta|form|input|button|svg|math|template)\b[\s\S]*?<\s*\/\s*\1\s*>/gi,
    "",
  );
  // Drop self-closing / opening forms of those banned tags too.
  html = html.replace(
    /<\s*(script|style|iframe|object|embed|link|meta|form|input|button|svg|math|template)\b[^>]*\/?>/gi,
    "",
  );

  const TAG_RE = /<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\s*([^>]*?)\/?\s*>/g;
  const out: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_RE.exec(html)) !== null) {
    const [full, slash, rawName, rawAttrs] = match;
    const name = rawName.toLowerCase();
    const before = html.slice(lastIndex, match.index);
    if (before) out.push(before); // text already-html-encoded by the user; leave as-is and rely on later validation
    lastIndex = match.index + full.length;

    if (!ALLOW_TAGS.has(name)) continue; // drop the tag entirely (text passes through)

    if (slash) {
      out.push(`</${name}>`);
      continue;
    }

    // Parse attributes into a key/value list.
    const allowedAttrs = ALLOW_ATTRS[name] || [];
    const attrPairs: string[] = [];
    const attrRe = /([a-zA-Z_][a-zA-Z0-9_:-]*)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/g;
    let am: RegExpExecArray | null;
    while ((am = attrRe.exec(rawAttrs)) !== null) {
      const aname = am[1].toLowerCase();
      let aval = am[2];
      if ((aval.startsWith('"') && aval.endsWith('"')) || (aval.startsWith("'") && aval.endsWith("'"))) {
        aval = aval.slice(1, -1);
      }
      // Hard-block all event handlers regardless of tag.
      if (aname.startsWith("on")) continue;
      if (!allowedAttrs.includes(aname)) continue;
      // URL attributes: validate scheme.
      if (aname === "href") {
        const ok = normaliseUrl(aval, false);
        if (!ok) continue;
        aval = ok;
      }
      if (aname === "src") {
        const ok = normaliseUrl(aval, true);
        if (!ok) continue;
        aval = ok;
      }
      if (aname === "target" && aval !== "_blank" && aval !== "_self") continue;
      if (aname === "rel") {
        // Only allow harmless rel tokens.
        const tokens = aval.split(/\s+/).filter((t) => /^(nofollow|noopener|noreferrer|external)$/i.test(t));
        if (tokens.length === 0) continue;
        aval = tokens.join(" ");
      }
      if (aname === "style") {
        const cleaned = cleanStyle(aval);
        if (!cleaned) continue;
        aval = cleaned;
      }
      attrPairs.push(`${aname}="${encodeAttr(aval)}"`);
    }
    // Force rel='noopener noreferrer' on any anchor that opens a new tab.
    if (name === "a") {
      const hasTarget = attrPairs.some((p) => /^target=/.test(p));
      const hasRel = attrPairs.some((p) => /^rel=/.test(p));
      if (hasTarget && !hasRel) attrPairs.push('rel="noopener noreferrer"');
    }
    if (ALLOW_VOID_TAGS.has(name)) {
      out.push(`<${name}${attrPairs.length ? " " + attrPairs.join(" ") : ""} />`);
    } else {
      out.push(`<${name}${attrPairs.length ? " " + attrPairs.join(" ") : ""}>`);
    }
  }
  if (lastIndex < html.length) out.push(html.slice(lastIndex));
  let result = out.join("");
  // Trim noise.
  result = result.replace(/\s{2,}/g, " ").trim();
  return result;
}

function htmlToPlainText(html: string): string {
  if (!html) return "";
  const text = decodeEntities(
    html
      .replace(/<\/?(p|div|br|tr|li|h[1-6])[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/[ \t]+/g, " "),
  )
    .split("\n")
    .map((s) => s.trim())
    .filter((s, i, arr) => !(s === "" && arr[i - 1] === ""))
    .join("\n")
    .trim();
  return text;
}

function byteLen(s: string): number {
  return new TextEncoder().encode(s).length;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ ok: false, error: "server_misconfigured" }, 500);

  const auth = req.headers.get("Authorization");
  if (!auth) return json({ ok: false, error: "missing_auth" }, 401);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json({ ok: false, error: "unauthorized" }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }

  const rawHtml = String(body?.signature_html ?? "").slice(0, MAX_HTML_BYTES * 4); // bound input before sanitize
  const rawText = body?.signature_text != null ? String(body.signature_text).slice(0, MAX_TEXT_BYTES * 2) : null;
  const tz = body?.default_timezone ? String(body.default_timezone).slice(0, 64) : null;

  let signatureHtml = sanitizeHtml(rawHtml);
  if (byteLen(signatureHtml) > MAX_HTML_BYTES) {
    return json({ ok: false, error: "signature_too_large", limit_bytes: MAX_HTML_BYTES }, 413);
  }

  let signatureText = rawText != null && rawText.trim() ? rawText.slice(0, MAX_TEXT_BYTES) : htmlToPlainText(signatureHtml);
  if (byteLen(signatureText) > MAX_TEXT_BYTES) signatureText = signatureText.slice(0, MAX_TEXT_BYTES);

  const admin = createClient(supabaseUrl, serviceKey);
  const { error: upsertErr } = await admin
    .from("lit_user_preferences")
    .upsert({
      user_id: user.id,
      signature_html: signatureHtml || null,
      signature_text: signatureText || null,
      ...(tz ? { default_timezone: tz } : {}),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
  if (upsertErr) return json({ ok: false, error: upsertErr.message }, 500);

  return json({ ok: true, signature_html: signatureHtml, signature_text: signatureText });
});
