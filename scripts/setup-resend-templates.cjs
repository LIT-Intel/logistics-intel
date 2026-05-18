#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Creates (or reuses) all 13 LIT marketing drip-sequence templates in Resend
 * by parsing docs/marketing/resend-sequence-copy.md. Each ### N. RESEND_TPL_X
 * section becomes one Resend template, wrapped in the shared HTML shell
 * defined at the bottom of the same file.
 *
 * Idempotent — checks Resend for existing templates whose `name` matches
 * the env-var key and reuses the existing id instead of duplicating.
 *
 * USAGE:
 *   RESEND_API_KEY=re_... node scripts/setup-resend-templates.cjs
 *
 * Outputs:
 *   - Console: paste-ready env block for the 13 RESEND_TPL_* vars
 *   - File:    .env.templates.ready (gitignored)
 */

const fs = require("node:fs");
const path = require("node:path");

const RESEND_API = "https://api.resend.com";
const COPY_DOC = path.resolve(
  __dirname,
  "..",
  "docs",
  "marketing",
  "resend-sequence-copy.md",
);
const SHELL_MARKER = "<!-- BODY -->";

// Resend rate limit is 5 req/sec; we serialize with a tiny delay between
// creates so a 12-template run can't trip the cap.
const CREATE_DELAY_MS = 350;

const EXPECTED_TEMPLATES = [
  "RESEND_TPL_TRIAL_WELCOME",
  "RESEND_TPL_TRIAL_DAY_2",
  "RESEND_TPL_TRIAL_DAY_5",
  "RESEND_TPL_TRIAL_DAY_9",
  "RESEND_TPL_TRIAL_DAY_14",
  "RESEND_TPL_TOP_100_DELIVERY",
  "RESEND_TPL_TOP_100_DAY_3",
  "RESEND_TPL_TOP_100_DAY_7",
  "RESEND_TPL_PARTNER_RECEIVED",
  "RESEND_TPL_PARTNER_APPROVED",
  "RESEND_TPL_PARTNER_DAY_7",
  "RESEND_TPL_COMPARISON_WELCOME",
  "RESEND_TPL_COMPARISON_DAY_4",
];

function parseDoc(md) {
  // Pull the reusable shell first
  const shellMatch = md.match(/## Reusable HTML shell[\s\S]*?```html\n([\s\S]*?)\n```/);
  if (!shellMatch) {
    throw new Error("Could not find reusable HTML shell in copy doc");
  }
  const shell = shellMatch[1];
  if (!shell.includes(SHELL_MARKER)) {
    throw new Error(`Reusable HTML shell is missing the ${SHELL_MARKER} marker`);
  }

  // Strip everything from "## Reusable HTML shell" onwards so it doesn't
  // get re-parsed as a template section.
  const templatesSection = md.split(/^## Reusable HTML shell/m)[0];

  // Each template block:
  //   ### N. RESEND_TPL_NAME
  //   **Subject:** ...
  //   **Preview text:** ...    (optional)
  //   **Merge variables:** ... (optional)
  //   ```html
  //   <body html>
  //   ```
  const blockRe =
    /### \d+\.\s+(RESEND_TPL_[A-Z0-9_]+)\s*\n+(?:\*\*Subject:\*\*\s*([^\n]+)\s*\n)?(?:\*\*Preview text:\*\*\s*([^\n]+)\s*\n)?[\s\S]*?```html\n([\s\S]*?)\n```/g;

  const templates = [];
  let m;
  while ((m = blockRe.exec(templatesSection)) !== null) {
    const [, name, subject, preview, body] = m;
    templates.push({
      envVar: name,
      subject: (subject || `LIT — ${name}`).trim(),
      preview: (preview || "").trim(),
      body: body.trim(),
    });
  }
  return { shell, templates };
}

async function listTemplates(apiKey) {
  const r = await fetch(`${RESEND_API}/templates`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`list templates ${r.status}: ${text.slice(0, 300)}`);
  }
  const body = await r.json();
  return Array.isArray(body) ? body : body.data || [];
}

async function createTemplate(apiKey, payload) {
  const r = await fetch(`${RESEND_API}/templates`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`${r.status}: ${text.slice(0, 300)}`);
  }
  return r.json();
}

async function updateTemplate(apiKey, id, payload) {
  const r = await fetch(`${RESEND_API}/templates/${id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`update ${r.status}: ${text.slice(0, 300)}`);
  }
  return r.json();
}

async function main() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("ERROR: RESEND_API_KEY env var is not set.");
    process.exit(1);
  }

  console.log("→ Reading copy doc:", COPY_DOC);
  const md = fs.readFileSync(COPY_DOC, "utf8");
  const { shell, templates } = parseDoc(md);
  console.log(`  Parsed ${templates.length} template body blocks.\n`);

  // Sanity-check that we got the 13 expected templates.
  const parsedNames = new Set(templates.map((t) => t.envVar));
  const missing = EXPECTED_TEMPLATES.filter((e) => !parsedNames.has(e));
  if (missing.length > 0) {
    console.error("✗ Parser missed these expected templates:");
    missing.forEach((m) => console.error("   -", m));
    process.exit(2);
  }

  console.log("→ Fetching existing templates...");
  const existing = await listTemplates(apiKey);
  const byName = new Map(existing.map((t) => [t.name, t]));
  console.log(`  Found ${existing.length} existing template(s).\n`);

  // Despite the docs implying {{{unsubscribe_url}}} is a built-in, Resend's
  // template create endpoint requires it (and any other token) to be
  // declared in the variables array. The value is still auto-populated by
  // Resend at send time when the template ships via /emails — declaration
  // here is purely a schema requirement.
  const results = [];
  for (const tpl of templates) {
    const merged = shell.replace(SHELL_MARKER, tpl.body);
    // Resend requires triple-brace Mustache syntax ({{{var}}}) for merge
    // variables, not the double-brace {{var}} the copy doc uses. Convert in
    // both html body AND subject. Idempotent: {{{x}}} stays {{{x}}}.
    const tripleBrace = (s) =>
      s.replace(/(?<!\{)\{\{(?!\{)([a-zA-Z0-9_]+)\}\}(?!\})/g, "{{{$1}}}");
    const subject = tripleBrace(tpl.subject);
    const html = tripleBrace(merged);

    // Scan for {{{var}}} references and declare them, except built-ins.
    const varRe = /\{\{\{([a-zA-Z0-9_]+)\}\}\}/g;
    const foundVars = new Set();
    let varMatch;
    while ((varMatch = varRe.exec(subject + " " + html)) !== null) {
      foundVars.add(varMatch[1]);
    }
    const variables = Array.from(foundVars).map((key) => ({ key, type: "string" }));

    const payload = {
      name: tpl.envVar,
      subject,
      html,
      ...(variables.length > 0 ? { variables } : {}),
    };

    const found = byName.get(tpl.envVar);
    if (found && found.id) {
      try {
        await updateTemplate(apiKey, found.id, payload);
        console.log(`  ◇ updated [${tpl.envVar}]  →  ${found.id}`);
        results.push({ envVar: tpl.envVar, id: found.id, status: "updated" });
      } catch (e) {
        console.error(`  ✗ FAILED  [${tpl.envVar}]: ${e.message}`);
        results.push({ envVar: tpl.envVar, id: found.id, status: "failed", error: e.message });
      }
    } else {
      try {
        const created = await createTemplate(apiKey, payload);
        const id = created.id || created.data?.id;
        console.log(`  + created [${tpl.envVar}]  →  ${id}`);
        results.push({ envVar: tpl.envVar, id, status: "created" });
      } catch (e) {
        console.error(`  ✗ FAILED  [${tpl.envVar}]: ${e.message}`);
        results.push({ envVar: tpl.envVar, id: null, status: "failed", error: e.message });
      }
    }
    await new Promise((r) => setTimeout(r, CREATE_DELAY_MS));
  }

  // Emit env block
  const lines = [];
  lines.push("# Resend Template IDs - generated by scripts/setup-resend-templates.cjs");
  lines.push(`# Generated at ${new Date().toISOString()}`);
  lines.push("");
  lines.push("# Trial Welcome sequence (5 steps: 0h, 48h, 120h, 216h, 336h)");
  for (const k of ["RESEND_TPL_TRIAL_WELCOME","RESEND_TPL_TRIAL_DAY_2","RESEND_TPL_TRIAL_DAY_5","RESEND_TPL_TRIAL_DAY_9","RESEND_TPL_TRIAL_DAY_14"]) {
    const r = results.find((x) => x.envVar === k);
    lines.push(`${k}=${r?.id ?? "<FAILED-RECREATE-MANUALLY>"}`);
  }
  lines.push("");
  lines.push("# Top-100 PDF follow-up (3 steps: 0h, 72h, 168h)");
  for (const k of ["RESEND_TPL_TOP_100_DELIVERY","RESEND_TPL_TOP_100_DAY_3","RESEND_TPL_TOP_100_DAY_7"]) {
    const r = results.find((x) => x.envVar === k);
    lines.push(`${k}=${r?.id ?? "<FAILED-RECREATE-MANUALLY>"}`);
  }
  lines.push("");
  lines.push("# Partner onboarding (3 steps: 0h, 48h, 168h)");
  for (const k of ["RESEND_TPL_PARTNER_RECEIVED","RESEND_TPL_PARTNER_APPROVED","RESEND_TPL_PARTNER_DAY_7"]) {
    const r = results.find((x) => x.envVar === k);
    lines.push(`${k}=${r?.id ?? "<FAILED-RECREATE-MANUALLY>"}`);
  }
  lines.push("");
  lines.push("# Comparison nurture (2 steps: 0h, 96h)");
  for (const k of ["RESEND_TPL_COMPARISON_WELCOME","RESEND_TPL_COMPARISON_DAY_4"]) {
    const r = results.find((x) => x.envVar === k);
    lines.push(`${k}=${r?.id ?? "<FAILED-RECREATE-MANUALLY>"}`);
  }
  lines.push("");

  const block = lines.join("\n");
  console.log("\n→ Paste this into Vercel → Project → Settings → Environment Variables\n");
  console.log(block);

  const outPath = path.resolve(process.cwd(), ".env.templates.ready");
  fs.writeFileSync(outPath, block + "\n", "utf8");
  console.log(`\n→ Also written to: ${outPath}\n`);

  const created = results.filter((r) => r.status === "created").length;
  const updated = results.filter((r) => r.status === "updated").length;
  const failed = results.filter((r) => r.status === "failed").length;
  console.log("→ Summary");
  console.log(`  created: ${created}`);
  console.log(`  updated: ${updated}`);
  console.log(`  failed:  ${failed}\n`);
  if (failed > 0) process.exit(2);
}

main().catch((e) => {
  console.error("FATAL:", e?.message || e);
  process.exit(1);
});
