# LIT Marketing Email — Screenshot Swap Spec

When real product screenshots are ready, swap the SVG placeholders in
`marketing/public/email-assets/` with the PNGs described below.
The email templates resolve to absolute URLs at insert time so no
code changes are needed in the templates themselves — only the asset
file and a one-line update to `ASSET_PATHS` in
`frontend/src/lib/emailAssets.ts`.

---

## File specifications

| Asset key | Current file | Target file | What to show |
|---|---|---|---|
| `company_intelligence` | `company-intelligence.svg` | `company-intelligence.png` | CompanyProfileV2 page for a known shipper. Show the trade activity panel with estimated annual spend visible, top lanes listed, and recent BOL count. Remove any PII — use a furniture/apparel importer with a publicly recognizable import profile (e.g. NorthBay Furniture or similar demo account). |
| `contact_discovery` | `contact-discovery.svg` | `contact-discovery.png` | Contact Discovery panel for the same or similar company. Show 3–4 enriched contacts with title, email (partially masked), and relevance score. Remove real personal emails. |
| `pulse_ai` | `pulse-ai-brief.svg` | `pulse-ai-brief.png` | Pulse AI Brief panel. Show the WHY NOW card, SALES ANGLE card, and at least two buying signals. The demo account should be the same as company_intelligence for visual continuity. |
| `pulse_workflow` | `pulse-workflow.svg` | `pulse-workflow.png` | The 5-step workflow diagram (Search → Trade Picture → Contacts → Outreach → CRM). Can be a designed graphic rather than a product screenshot — the SVG placeholder is already a reasonable stand-in. If replacing with a product screenshot, show the full left-nav workflow with all 5 sections highlighted. |
| `lane_signals` | `lane-signals.svg` | `lane-signals.png` | Lane Signals or Search results page. Show a filtered search for Vietnam → US West Coast with 3–5 shipper results, each showing TEU count, recent BOLs, and a "View account" CTA. |

---

## Dimensions and format

- **Dimensions:** 1200 × 750 px (or 1200 × 720 px — both work in the email table layout)
- **Format:** PNG (not JPEG — avoids compression artifacts on text/UI)
- **Color profile:** sRGB
- **Max file size:** 200 KB per asset (optimize with `pngquant` or `ImageOptim`)
- **Retina note:** Email clients do not reliably render @2x images. Use
  1200px wide at 72 dpi — this renders crisply on retina displays at the
  `width="600"` table cell without doubling the file size.

---

## Where to drop the files

```
marketing/public/email-assets/<filename>.png
```

Vercel rebuilds the marketing site on push. Files become live at:
```
https://www.logisticintel.com/email-assets/<filename>.png
```

---

## One-line update in emailAssets.ts

Open `frontend/src/lib/emailAssets.ts` and change the extension for
the relevant key(s) in `ASSET_PATHS`:

```ts
// Before:
company_intelligence: "/email-assets/company-intelligence.svg",

// After:
company_intelligence: "/email-assets/company-intelligence.png",
```

The `resolveEmailTemplateHtml()` function in `campaignEmailTemplates.ts`
reads from `EMAIL_ASSETS` which is derived from `ASSET_PATHS`, so this
one-line change propagates to all email templates automatically.

---

## No-PII checklist

Before committing any screenshot:
- [ ] No real email addresses visible (mask to `j.smith@…` format)
- [ ] No real phone numbers
- [ ] No names of real contacts unless they have consented to appear in demos
- [ ] Company names in screenshots are demo accounts or publicly known importers
- [ ] No internal Supabase IDs or API keys visible in network panels
