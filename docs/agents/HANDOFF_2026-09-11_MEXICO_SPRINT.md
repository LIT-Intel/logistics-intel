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

- [ ] **Owner ran cleanup SQL?** Steps: UPDATE Augusta lit_companies key →
  `company/augusta-sportswear`; realign its lit_saved_companies rows; DELETE
  placeholder shells (`source_company_key='company/'`, name Company/Unknown)
  from lit_saved_companies (by company_id subquery — it has NO company_name
  column) then lit_companies. If not run, re-issue the SQL.
- [ ] **Browser verification**: (a) demo acct (Gabriel Knight) MX Market →
  $99 add-on modal, not results; (b) new company open from Companies search
  populates within ~20s (no "Company" shell); (c) Augusta Sportswear profile
  heals after SQL repair; (d) NA market map shows clustered city bubbles.
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

## Gotchas / constraints (hard-won this sprint)

- **IY credits**: ~100 on the account. DO NOT consume until Unlimited
  purchases (owner instruction). Demo on cached companies (Kysor Warren,
  Bimbo = $0). Each NEW company profile open costs ~1-2 IY credits.
- **Supabase MCP token death**: mid-session expiry does NOT self-heal even
  when settings show "Connected"; the session permanently loses the tools.
  Fallbacks that work: owner pastes SQL into dashboard SQL editor; or start
  a fresh session (fresh tokens). Consider getting a `SUPABASE_ACCESS_TOKEN`
  from the owner for CLI (`npx supabase`) independence.
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
