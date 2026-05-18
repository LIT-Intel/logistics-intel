# Resend Templates — Marketing Lead Capture

The marketing site's single lead-capture endpoint `POST /api/leads/resend`
(see `marketing/app/api/leads/resend/route.ts`) sends a transactional email
on every successful lead capture. Email send is best-effort — Supabase
`lit_leads` insert is the source of truth and runs first.

There are two templates, picked by the `offer` field on the inbound POST.

---

## 1. `lit-trial-welcome` (default)

**Used when:** `offer` is absent or any value other than `top-100-shippers-pdf`.

- **Template name (Resend dashboard):** `lit-trial-welcome`
- **Env var (template ID):** `RESEND_LIT_TRIAL_WELCOME_TEMPLATE_ID`
- **Subject:** `Your LIT trial is ready`
- **Primary CTA URL:** `https://app.logisticintel.com/onboarding` (sent as `{{ctaUrl}}`)
- **Required merge fields:**
  - `{{firstName}}` — derived from the email local-part (best-effort)
  - `{{source}}` — page slug or campaign tag that captured the lead
  - `{{ctaUrl}}` — onboarding link the CTA button should point at
- **Optional merge fields:**
  - `{{lane}}` — origin/destination lane if the capture form collected it

### Suggested copy outline

- H1: "Your trial is ready, {{firstName}}."
- Body: 1-2 sentence promise of value (shippers in lane, contacts, signals)
- CTA: "Start exploring →" → `{{ctaUrl}}`
- Footer: "Captured from {{source}}" (small, gray)

---

## 2. `lit-top-100-shippers`

**Used when:** `offer === "top-100-shippers-pdf"`.

- **Template name (Resend dashboard):** `lit-top-100-shippers`
- **Env var (template ID):** `RESEND_LIT_TOP_100_TEMPLATE_ID`
- **Subject:** `Top 100 active shippers in your lane`
- **Primary CTA URL:** value of `LIT_TOP_100_PDF_URL` env (fallback `https://logisticintel.com/lead-magnets/top-100-shippers.pdf`), sent as `{{pdfUrl}}`
- **Required merge fields:**
  - `{{firstName}}` — derived from the email local-part (best-effort)
  - `{{source}}` — page slug or campaign tag that captured the lead
  - `{{pdfUrl}}` — direct download URL for the PDF lead magnet
- **Optional merge fields:**
  - `{{lane}}` — origin/destination lane if the capture form collected it

### Suggested copy outline

- H1: "Here's your Top 100 shippers, {{firstName}}."
- Body: 1-2 sentence framing ("Refreshed from live customs filings…")
- CTA: "Download the PDF →" → `{{pdfUrl}}`
- Secondary: "Want to see contacts at these companies? Start a trial →"
- Footer: "Captured from {{source}}" (small, gray)

---

## Merge data shape

The route POSTs the template merge data both as a top-level `data` object
and as flattened top-level keys (for compatibility with whichever Resend
template binding style is used). Templates should reference variables by
name (`{{firstName}}`, `{{pdfUrl}}`, etc.).

Example payload sent to `https://api.resend.com/emails`:

```json
{
  "from": "Logistic Intel <hello@logisticintel.com>",
  "to": ["lead@example.com"],
  "subject": "Your LIT trial is ready",
  "template_id": "tmpl_xxx",
  "data": {
    "firstName": "lead",
    "source": "homepage-hero",
    "ctaUrl": "https://app.logisticintel.com/onboarding"
  },
  "firstName": "lead",
  "source": "homepage-hero",
  "ctaUrl": "https://app.logisticintel.com/onboarding"
}
```

---

## Required env vars for `/api/leads/resend`

| Variable                                | Purpose                                                                 | Required | Default |
|-----------------------------------------|-------------------------------------------------------------------------|----------|---------|
| `RESEND_API_KEY`                        | Resend account API key (already set for `marketing/lib/email.ts`)        | yes      | —       |
| `RESEND_LIT_TRIAL_WELCOME_TEMPLATE_ID`  | Resend template ID for the default trial-welcome email                   | yes      | —       |
| `RESEND_LIT_TOP_100_TEMPLATE_ID`        | Resend template ID for the top-100 lead-magnet email                     | yes      | —       |
| `RESEND_FROM_EMAIL`                     | From address (e.g. `Logistic Intel <hello@logisticintel.com>`)            | no       | `Logistic Intel <hello@logisticintel.com>` |
| `LIT_TOP_100_PDF_URL`                   | Direct download URL for the top-100 PDF                                 | no       | `https://logisticintel.com/lead-magnets/top-100-shippers.pdf` |
| `SUPABASE_URL` _or_ `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL — server-side write                          | yes      | —       |
| `SUPABASE_SERVICE_ROLE_KEY`             | Service-role key — bypasses RLS to insert into `public.lit_leads`        | yes      | —       |
| `NEXT_PUBLIC_APP_URL`                   | App URL used for the trial CTA (`{{ctaUrl}}`)                            | no       | `https://app.logisticintel.com` |

The Supabase env vars share names with the existing `marketing/lib/supabase.ts`
client — no rename needed.

---

## Reference

- Route: `marketing/app/api/leads/resend/route.ts`
- Supabase table: `public.lit_leads` (migration: `supabase/migrations/20260518120000_create_lit_leads.sql`)
- Supabase client: `marketing/lib/supabase.ts` (`getSupabase()`)
- Resend SDK helper: `marketing/lib/email.ts` (`sendEmail()`) — used as the inline fallback when a template ID is not yet configured
