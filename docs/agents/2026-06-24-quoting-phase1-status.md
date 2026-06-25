# Quoting (Phase 1) — build status

**Date:** 2026-06-24 · **Branch:** `feat/quoting-phase1` (off `main`)
**Spec:** [docs/superpowers/specs/2026-06-24-quoting-design.md](../superpowers/specs/2026-06-24-quoting-design.md)
**Plan:** [docs/superpowers/plans/2026-06-24-quoting-module-phase1.md](../superpowers/plans/2026-06-24-quoting-module-phase1.md)

Renames the discontinued RFP concept to **Quoting** — LIT's revenue execution layer (create → edit → PDF → send-as-secure-link → track).

## New surfaces

**DB migration** `supabase/migrations/20260624140000_quoting_phase1.sql`
- Tables: `lit_quotes`, `lit_quote_line_items` (generated `total_*`), `lit_quote_events`, `lit_quote_counters`.
- `assign_quote_number(org)` → `Q-YYYY-NNNN` sequential per org.
- `org_settings.quote_defaults jsonb`.
- RLS: 4-policy org pattern mirroring `lit_campaigns` (`plan_entitlements` keyed by `plan_id`).
- Feature key `quoting` → enabled for growth/scale/enterprise.

**Edge functions** (`supabase/functions/quote-*`): `quote-create`, `quote-update`, `quote-list`, `quote-detail`, `quote-status-update`, `quote-generate-pdf`, `quote-send`, `quote-view` (PUBLIC), `quote-dashboard-metrics`, `quote-company-metrics`. Shared: `_shared/quote_helpers.ts` (totals math + gating), `_shared/quote_email.ts` (Gmail/Outlook single-recipient send). All mutations gate on `quoting` + org-scope every query; totals recomputed server-side.

**Frontend**
- `src/api/quoting.ts` typed client (coerces PostgREST numeric strings → numbers).
- `src/lib/quoting/` — `modeFields.ts` (mode-aware fields), `totals.ts`, `exportQuotePdf.ts` (client jsPDF).
- `src/features/quoting/` — `QuotingDashboard.tsx`, `QuoteBuilder.tsx` + components.
- `src/features/company/CompanyQuotesTab.tsx` (Company Profile "Quotes" tab).
- Routes `/app/quoting`, `/app/quoting/new`, `/app/quoting/:quoteId`; `/app/rfp*` redirects → `/quoting`; nav in both sidebars; dashboard revenue KPI; marketing `/rfp`→`/quoting`.

## Domain rule
Ocean/Air = forwarding (ports/airports + incoterms); Drayage = port logistics; **FTL/LTL = domestic brokerage (City/State/ZIP + miles, NO ports, NO incoterms)**. Enforced via `modeFields.ts` `USES_PORTS`/`USES_INCOTERMS` in the builder and PDF.

## DEPLOY GATE (not yet done — requires prod actions)
1. Apply the migration to the shared Supabase DB.
2. Deploy all 10 `quote-*` edge functions.
3. **`quote-view` must deploy with `--no-verify-jwt`** (public secure-link endpoint; secured by unguessable `share_token`).
4. Buckets/env already present: `company-exports` bucket, Gmail/Outlook OAuth, `check_usage_limit`.

## Known follow-ups (Phase 1 acceptable)
- `quote-update` line-item replace is delete-then-insert (not atomic) — wrap in an RPC later.
- `quote-create` does not yet persist `pallet_count`/`volume_cbm`/`hazmat`/`temp_controlled` (update does); add to create when needed.
- Org `quote_defaults` prefill + PDF logo/signature pending an org-settings read endpoint.
- 1:1 `quote-send` intentionally bypasses campaign consent/suppression gates (user-triggered send).
