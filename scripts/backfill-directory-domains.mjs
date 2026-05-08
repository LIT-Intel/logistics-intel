#!/usr/bin/env node
// Backfill domains for lit_company_directory rows missing a canonical_domain.
//
// Uses Clearbit's free autocomplete API (no auth, rate-limited to ~600
// req/min in practice) to resolve company names → domains. Writes
// canonical_domain back so logo.dev cascade renders + future Pulse
// searches can match by domain.
//
// Coverage: Clearbit autocomplete resolves ~60-80% of US-based B2B
// companies. The rest stay null — those rows render the gradient
// initials avatar (honest fallback).
//
// Usage:
//   node scripts/backfill-directory-domains.mjs              # dry run, first 50 rows
//   node scripts/backfill-directory-domains.mjs --apply      # actually write
//   node scripts/backfill-directory-domains.mjs --apply --batch 1000
//   node scripts/backfill-directory-domains.mjs --apply --all
//
// Env required:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY  (only the service role can update directory rows)

import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const ALL = args.includes("--all");
const BATCH_IDX = args.indexOf("--batch");
const BATCH = BATCH_IDX > -1 ? Math.max(1, Number(args[BATCH_IDX + 1]) || 50) : 50;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Missing env. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running.",
  );
  process.exit(1);
}

const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Clearbit's autocomplete endpoint is free + unauthenticated.
// Rate-limit politely: 100ms between calls = ~10 req/sec.
const CLEARBIT_BASE = "https://autocomplete.clearbit.com/v1/companies/suggest";
const PER_REQ_DELAY_MS = 100;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function lookupDomain(name) {
  const url = `${CLEARBIT_BASE}?query=${encodeURIComponent(name)}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const arr = await res.json();
    if (!Array.isArray(arr) || arr.length === 0) return null;
    // First hit is the best — Clearbit ranks by relevance.
    const top = arr[0];
    if (!top?.domain) return null;
    // Sanity check — domain must look like a real domain, not a
    // placeholder. Accepts a-z0-9 + dots + hyphens, ending in a TLD.
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(top.domain)) return null;
    return {
      domain: String(top.domain).toLowerCase(),
      name: String(top.name || ""),
      logo: String(top.logo || ""),
    };
  } catch (err) {
    console.warn(`  ! lookup failed for "${name}":`, err?.message || err);
    return null;
  }
}

async function fetchCandidates() {
  const limit = ALL ? 100000 : BATCH;
  const { data, error } = await supa
    .from("lit_company_directory")
    .select("id, company_name, canonical_name, domain, canonical_domain, website")
    .or("canonical_domain.is.null,canonical_domain.eq.")
    .limit(limit);
  if (error) throw error;
  return data || [];
}

async function applyUpdate(id, domain) {
  const { error } = await supa
    .from("lit_company_directory")
    .update({
      canonical_domain: domain,
      domain: domain, // also fill the legacy column when null
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

async function main() {
  console.log(
    `[backfill] mode=${APPLY ? "APPLY" : "DRY-RUN"} batch=${ALL ? "ALL" : BATCH}`,
  );
  const rows = await fetchCandidates();
  console.log(`[backfill] ${rows.length} rows missing canonical_domain`);

  let resolved = 0;
  let unresolved = 0;
  let written = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = row.canonical_name || row.company_name;
    if (!name) {
      unresolved++;
      continue;
    }

    const hit = await lookupDomain(name);
    if (!hit) {
      unresolved++;
      if (i % 25 === 0) {
        process.stdout.write(
          `\r[${i + 1}/${rows.length}] resolved=${resolved} unresolved=${unresolved} written=${written}`,
        );
      }
      await sleep(PER_REQ_DELAY_MS);
      continue;
    }

    resolved++;
    if (APPLY) {
      try {
        await applyUpdate(row.id, hit.domain);
        written++;
      } catch (err) {
        errors++;
        console.warn(`\n[backfill] write failed for ${name}:`, err?.message || err);
      }
    } else {
      console.log(`  ${name} → ${hit.domain}`);
    }
    process.stdout.write(
      `\r[${i + 1}/${rows.length}] resolved=${resolved} unresolved=${unresolved} written=${written}`,
    );
    await sleep(PER_REQ_DELAY_MS);
  }

  console.log("\n");
  console.log("─────────────────────────────────────────");
  console.log("Backfill summary");
  console.log("─────────────────────────────────────────");
  console.log(`  Total rows scanned:      ${rows.length}`);
  console.log(`  Domains resolved:        ${resolved}`);
  console.log(`  Domains not found:       ${unresolved}`);
  console.log(`  Rows written to DB:      ${written}${APPLY ? "" : " (dry run)"}`);
  console.log(`  Write errors:            ${errors}`);
  console.log("─────────────────────────────────────────");
  if (!APPLY) {
    console.log("\nThis was a DRY RUN. Re-run with --apply to write changes.");
    console.log("To process all rows: --apply --all");
  }
}

main().catch((err) => {
  console.error("[backfill] fatal:", err);
  process.exit(1);
});
