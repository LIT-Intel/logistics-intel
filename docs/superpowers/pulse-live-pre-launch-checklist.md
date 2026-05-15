# Pulse LIVE Pre-Launch Checklist

**Status as of 2026-05-14:** All 22 plan tasks implemented and committed. Backfill ran on prod (1055 BOLs materialized across 24 saved companies). Edge functions and cron jobs deployed; cron jobs scheduled but will produce 500 / 401 errors until the env vars below are set on the dashboard.

## Required dashboard work (no MCP path)

These env vars must be set on each Supabase edge function via the Supabase Dashboard → Edge Functions → [function] → Secrets tab. The MCP API has no env-var setter — this is the only path.

### `pulse-unified-shipments-backfill` (new, v1 deployed)
- `LIT_CRON_SECRET` = `4ea6077a8f2e72c0aac25a72f8102dd8ef599b7c589b7153e2fe2240c9fd2188`
- *(Note: this fn was already invoked successfully once with the secret in the header; if env var is missing it will reject future runs. Backfill is one-off — only re-run if data corruption occurs.)*

### `pulse-bol-tracking-tick` (new, v1 deployed, scheduled daily 06:00 UTC)
- `LIT_CRON_SECRET` = `4ea6077a8f2e72c0aac25a72f8102dd8ef599b7c589b7153e2fe2240c9fd2188`
- `MAERSK_CLIENT_ID` = *get from developer.maersk.com after creating a Track & Trace Plus app*
- `MAERSK_CLIENT_SECRET` = *same source*
- `HAPAG_CLIENT_ID` = *get from api-portal.hlag.com after onboarding*
- `HAPAG_CLIENT_SECRET` = *same source*

Until these are set, the daily 06:00 UTC tick will run, route SCACs, but every Maersk/Hapag fetch will return `maersk_token_401` / `hapag_token_401`, BOLs will get `tracking_status='error'`. No data harm — just no tracking data populated.

### `pulse-drayage-recompute` (new, v1 deployed, scheduled daily 07:00 UTC)
- `LIT_CRON_SECRET` = `4ea6077a8f2e72c0aac25a72f8102dd8ef599b7c589b7153e2fe2240c9fd2188`

Drayage formula has no external API dependency (uses OSRM public demo + in-DB cache + 2026 industry coefficients). Will run as soon as `LIT_CRON_SECRET` is set.

## Carrier API credentials — how to get them

### Maersk Track & Trace Plus
1. Go to https://developer.maersk.com → "Sign up" → create company account
2. Subscribe to "Track & Trace Plus" product (free tier; "may charge later" disclaimer)
3. Create an OAuth2 client → grab `client_id` + `client_secret`
4. Test with curl per Maersk docs before pasting into Supabase

### Hapag-Lloyd DCSA T&T 2.0
1. Go to https://api-portal.hlag.com → register
2. Apply for "Track & Trace 2.0" API access (DCSA-compliant, free)
3. Provision OAuth2 credentials
4. Test before pasting

Both vendors usually take 1-3 business days to approve.

## Verification commands (run after env vars are set)

```bash
# Manual tracking tick — should return tracked/unsupported/errors counts
curl -sS -X POST \
  -H "X-Internal-Cron: 4ea6077a8f2e72c0aac25a72f8102dd8ef599b7c589b7153e2fe2240c9fd2188" \
  -H "Content-Type: application/json" \
  -d '{}' --max-time 300 \
  "https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/pulse-bol-tracking-tick"

# Manual drayage recompute — should return computed/missing_coords counts
curl -sS -X POST \
  -H "X-Internal-Cron: 4ea6077a8f2e72c0aac25a72f8102dd8ef599b7c589b7153e2fe2240c9fd2188" \
  -H "Content-Type: application/json" \
  -d '{}' --max-time 180 \
  "https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/pulse-drayage-recompute"
```

```sql
-- Verify tracking events landing
SELECT carrier, count(*) FROM lit_bol_tracking_events GROUP BY carrier;

-- Verify tracking status on lit_unified_shipments
SELECT tracking_status, count(*) FROM lit_unified_shipments
WHERE tracking_refreshed_at IS NOT NULL
GROUP BY tracking_status;

-- Verify drayage estimates
SELECT count(*) AS estimates,
       sum(est_cost_usd) AS total_opportunity_usd,
       count(DISTINCT source_company_key) AS companies
FROM lit_drayage_estimates;
```

## Production cron jobs registered

| Job | Schedule | Function |
|---|---|---|
| `pulse-bol-tracking-daily` | `0 6 * * *` UTC | `pulse-bol-tracking-tick` |
| `pulse-drayage-recompute-daily` | `0 7 * * *` UTC | `pulse-drayage-recompute` |

Existing pulse-refresh-tick (every 15 min) now also runs the `rematerializeCompanyBols()` hook after each snapshot upsert (v3 deployed).

## Frontend UI live URL

`app.logisticintel.com` — the "Pulse LIVE" tab is mounted in the company drawer between Shipments and RFP. Will load empty data until tracking ticks run (and is honest about it via the coverage banner).

PDF + Excel download buttons render client-side; no env vars needed.

## Known accepted limitations

- **~30-40% carrier coverage.** Only Maersk family (MAEU/SUDU/SAFM/MCPU) + Hapag-Lloyd (HLCU/HLXU) have live tracking. CarrierMix view honestly shows the gap.
- **Drayage formula ±25%.** Disclosed in UI and PDF footer.
- **Port + city coord maps are minimal** (10 US ports, 10 inland cities). Add to `PORT_COORDS` / `CITY_COORDS` in `pulse-drayage-recompute/index.ts` as new corridors appear in the data.
- **Backfill processed 1055/(1055+244)=81% of BOLs.** The 244 errors are BOLs without a usable BOL number in the JSONB (no `bolNumber`, `Bill_of_Lading`, or master fields). These will be retried automatically as ImportYeti updates flow through.

## Future scope acknowledged (separate brainstorm)

- Sub-project **G**: Overview-page redesign with rich KPI charts (TEU/FCL/LCL time-series, top routes, carrier mix, HS-code breakdown). Now unblocked by the materialized `lit_unified_shipments` table. Should get its own spec + plan after Pulse LIVE 1.0 hits real users.
- Vizion or Terminal49 paid tracking — defer until carrier-coverage gap is painful in production.
