# HANDOFF — Mexico Trade Intelligence sprint (2026-09-10 → 09-11)

Read this first in the next session. Companion context lives in auto-memory
(`lit-deep-analysis-2026-09`, `lit-credits-v2-program`). Repo:
`C:\Users\Mr. Raymond\OneDrive\Documents\logistic-intel 2.0\logistics-intel`.
Supabase project `jkmrfiaefxwgbvftohrb`. Last commit this sprint: `b1cebd92`.

## What shipped (all committed to main, deployed via Vercel)

1. **MX live search + profiles** (earlier arc): US|MX region toggle in
   Intelligence Explorer; `mx-company-search` edge fn **v12** (paid gate +
   add-on gate + credit metering + IY monthly cap + search/decl caching);
   MX companies materialize into `lit_companies` (`source='mx-pedimento'`)
   and render through the EXISTING CompanyProfileV2 via adapter
   (`api/mxProfile.ts`) — never a parallel profile page.
2. **Pricing model (owner-approved)**: ImportYeti costs VERIFIED
   (all PowerQuery = 1 credit/10 records; single decl 0.1; classic
   company/supplier search FREE; IY $/credit $0.090@1K → $0.035@100K).
   LIT model: **$99/mo "Mexico Trade Intelligence" add-on incl. 500 LIT
   credits/mo** (owner lowered from 1,000); metering **5 credits/MX search,
   10/open**, cached views free; Unlimited Logistics anchor $149/mo.
3. **Add-on fully live**: LIVE Stripe product `prod_VEeVJ7AiXyFMHH`, price
   `price_1UEBCB30nhNIomhFYVAnUZjn` ($99/mo), wired in `lit_addons`
   (`mx_trade`, included_credits=500). Purchase: BillingNew "Add-ons" card →
   `billing-checkout` **v92** (`{addon_key}` branch) → `billing-webhook`
   **v102** routes add-on events to `lit_org_addon_subscriptions` (base
   `subscriptions` is unique-per-user — add-ons must NEVER write there) +
   grants included credits idempotently. Webhook also fixed a live bug
   (credit-pack grants called undefined `supabase.rpc` → `affiliateAdmin.rpc`).
4. **Credit metering (DARK)**: `meterAction`/`_shared/credits.ts` rails;
   costs seeded in `lit_credit_feature_costs` (mx_company_search=5,
   mx_company_open=10). `credits_metering_enabled` flag is **OFF** → free
   until flipped. IY spend cap: `lit_internal_meta` key `iy_spend_YYYY-MM`
   vs `LIT_IY_MONTHLY_CAP` (default 2000), checked pre-fetch pre-debit.
5. **NA cross-border market dataset**: owner's Drive "Mexico Shipment"
   folder (6 Panjiva xlsx) = **55,403 shipments / 3,924 deduped US importers
   (2,364 from Mexico, 1,821 from Canada, 261 both)** loaded into ISOLATED
   `lit_na_import_shipments` + `lit_na_import_companies`. HS chapters
   classified for 15,380 rows (local regex port of `lit_hs_keyword_map`).
   MX region + Market mode = `lit_na_market_search` RPC ("Browse US
   companies importing from Mexico & Canada"); US market path untouched.
   Map: city-level coords via Pulse `lookupCoords`, clustered bubbles
   (labeledMarkers off for na: rows), golden-angle spiral for collisions.
6. **NA market gate (APPLIED)**: migration `20260911160000` run by owner in
   dashboard SQL editor. Table SELECT policies dropped; RPC raises
   `mx_addon_required` unless platform_admin OR (active/trialing/past_due
   org sub AND `lit_org_has_addon('mx_trade')`). Frontend maps the error to
   the add-on purchase modal.
7. **P0 empty-key bug (commit b1cebd92)**: `ensureCompanyKey('')` returned
   truthy `'company/'` → ALL keyless saves collided into one corrupt
   "Company"/company.com shell; snapshot could never attach. Fixed:
   empty → `''`, shared `iyKeyOfRow()` across all 4 open surfaces, keyless
   opens go through verified live-IY resolve (`resolveKeylessOpen`),
   keyless saves toast. Also: CompanyProfileV2 self-heal now runs for UUID
   route ids (was slug-only → permanent "Snapshot pending" for market opens).

## PENDING — verify first in next session

- [x] **Cleanup SQL — DONE (verified 2026-09-10 evening).** Owner's shell
  cleanup had run (0 shells, 0 orphaned saves). Remaining Augusta DUPLICATE
  found and merged via Management API: dead null-key row `6da3b4f5` deleted
  (its dup save removed — same user already had the good row saved; its 1
  activity event repointed), canonical row `19b1151d` keyed
  `company/augusta-sportswear`, 2 saves intact. DB-verified same session:
  lit_addons mx_trade ($99/500cr/live price id/active), metering flag OFF
  (global_kill, rollout 0), mx costs 5/10 active, addon subs 0, NA tables
  RLS-enabled with zero policies (default-deny), iy_spend_2026-09 = 1.
  No IY snapshot for Augusta yet — attaches on first profile open (~1-2 IY
  credits, owner's call per credit hold).
- [x] **(a) demo acct MX Market gate — VERIFIED 2026-09-10 22:38 UTC** via
  edge logs: Gabriel Knight's lit_na_market_search RPC returned 400 followed
  by lit_get_addon (the add-on modal fetch). Server gate works.
- [x] **(b) new-company opens — WAS BROKEN by a SECOND P0, now FIXED.**
  Owner repro (amneal-pharmaceuticals, american-global-logistics): every
  importyeti-proxy companyProfile 500'd with "snapshot_upsert_failed: cannot
  extract elements from an object". Root cause: lit_extract_iy_snapshot_intel
  (trigger on lit_importyeti_company_snapshot, from 20260819210000) called
  jsonb_array_elements() on data.lane_permutations /
  other_addresses_contact_info guarded only by `?` key-existence — IY returns
  these as OBJECTS for some companies, the trigger threw, and the throw
  ROLLED BACK the snapshot insert → those companies could never materialize
  (profile stuck as synthetic "Company"/Snapshot-pending; frontend was NOT
  at fault — the b1cebd92 fix is live and its heal+poll ran correctly).
  Fixed by migration 20260911010000 (APPLIED to prod + tested end-to-end):
  lit_jsonb_elems() handles array AND keyed-object shapes, and the whole
  extraction is exception-wrapped (derived intel can never block the
  snapshot write; failures raise WARNING). Re-open any affected company to
  confirm (~1-2 IY credits). NOTE: today's failed attempts still consumed
  IY credits upstream (fetch succeeded, persist failed).
- [ ] **Browser verification remaining**: (c) Augusta Sportswear profile
  heals after the dup-merge repair; (d) NA market map shows clustered city
  bubbles.
- [ ] **Dry-run add-on purchase** (owner, live card, then refund) — the only
  unwalked path in the purchase chain.

## Next steps (owner-approved order)

1. **At Unlimited Logistics signing**: they buy the add-on → owner adds
   2,500 IY credits → flip `credits_metering_enabled` flag → verify first
   real debits in `lit_credit_ledger`.
2. **"Load full trade history"** for MX companies: paginated `since` pulls,
   credit-estimate confirm dialog (50–150 LIT credits by size), monthly
   rollups feeding the existing Cadence chart. Blocked on IY top-up.
3. Backlog: MX supplier + broker rankings as prospect categories; US-export/
   Canada direction (`lit_us_export_bols` empty); freight-control scoring.
4. Minor issues spotted in edge logs 2026-09-10 (P3, not yet fixed):
   pulse-explore "freshness join failed: Invalid URL" — the snapshot
   freshness lookup builds an `in.(...)` URL from the full result set and
   overflows; chunk the id list. Also chronic
   "Deno.core.runMicrotasks() is not supported" event-loop noise from a cron
   fn (std@0.177.1 node shim) — cosmetic but log-polluting.

## Gotchas / constraints (hard-won this sprint)

- **IY credits**: ~100 on the account. DO NOT consume until Unlimited
  purchases (owner instruction). Demo on cached companies (Kysor Warren,
  Bimbo = $0). Each NEW company profile open costs ~1-2 IY credits.
- **Supabase MCP token death**: mid-session expiry does NOT self-heal even
  when settings show "Connected"; the session permanently loses the tools.
  SOLVED 2026-09-10: `SUPABASE_ACCESS_TOKEN` is now in the Windows USER env
  on this PC — run SQL directly via the Management API:
  `POST https://api.supabase.com/v1/projects/jkmrfiaefxwgbvftohrb/database/query`
  with `Authorization: Bearer $SUPABASE_ACCESS_TOKEN`, body `{"query":"..."}`.
  Multi-statement BEGIN/…/COMMIT batches work. The MCP connector is no
  longer a single point of failure.
- **claude.ai Stripe connector is the WRONG account**: it exposes an EMPTY
  livemode account (acct_1TQqce3NsgrEw9xv) — NOT LIT prod billing. Verify
  billing via the edge-env STRIPE_SECRET_KEY (temp fn) or owner dashboard.
- **Edge deploys**: CI broken for new fns — deploy via Supabase MCP
  `deploy_edge_function`, bundle `./_shared/` copies (auth/logger/sentry/
  credits), verify_jwt true.
- **Drive files**: >1MB reads truncate via MCP; files were link-shared →
  `curl drive.google.com/uc?export=download&id=<id>` works. Local parse
  (python openpyxl) + POST batches to a temp token-guarded edge fn (then
  neutralize to 410) is the proven bulk-load path. Temp fns used this
  sprint (`stripe-setup-tmp`, `na-import-ingest-tmp`) are ALL neutralized.
- **55K-row regex UPDATEs exceed the SQL timeout** (even 14K) — classify
  locally, patch back via set-based RPC (`lit_na_set_hs(jsonb)`).
- **Panjiva export quirk**: contains BOTH Mexico AND Canada origins; no HS
  column (classified from Goods Shipped); no carrier SCAC (vessel only).
- **Never** make a click's only feedback a toast; never build parallel
  profile pages ("inconsistent branding"); name-resolving ANY external data
  requires a same-company verification gate before display/navigation.
