# Resend Lead-Magnet Automation — Operator Playbook

This is the end-to-end setup guide for the lead capture + nurture automation. Code is deployed by the engineering side. Your job is to provision Resend (domain, audiences, templates) and paste the resulting IDs into Vercel env vars.

Estimated time: 60–90 minutes for first run.

---

## 1. Resend account setup

### 1a. Domain auth

1. Open [resend.com/domains](https://resend.com/domains).
2. Confirm `logisticintel.com` is listed and shows **Verified** for DKIM, SPF, and DMARC. If any record is missing or pending, click into the domain and copy the DNS records into Cloudflare:
   - **DKIM**: `resend._domainkey` TXT record provided by Resend.
   - **SPF**: `v=spf1 include:amazonses.com ~all` on root (`@`). If you already use Google Workspace, append `include:_spf.google.com` to the same record. Do not create two SPF records.
   - **DMARC**: `_dmarc` TXT, value `v=DMARC1; p=quarantine; rua=mailto:dmarc@logisticintel.com`.
3. Wait until all three rows show green. DNS usually settles in under 10 minutes.
4. The send-from identity for this automation is `pulse@logisticintel.com`. No mailbox needed — Resend handles it. If you want replies, set up a forwarder in Cloudflare Email Routing pointing `pulse@` to the team inbox.

### 1b. API key

1. Resend dashboard → **API Keys** → **Create API Key**.
2. Name: `production-lead-automation`. Permission: **Full access** (this covers `audiences.write`, `emails.send`, and `contacts.write` — Resend does not split scopes finer for these).
3. Copy the key once. Paste it into Vercel as `RESEND_API_KEY` (see the env block in section 4).

---

## 2. Create the 4 Audiences

In Resend dashboard → **Audiences** → **Create Audience**. Name each one exactly as shown. After creation, click into the audience and copy the ID from the URL (`/audiences/<id>`) — that is the value for the env var.

| Audience name | Purpose | Triggered by | Env var |
|---|---|---|---|
| LIT Trial Leads | General free-trial signups | Hero, sticky, and final CTA forms on money pages | `RESEND_AUDIENCE_TRIAL_LEADS` |
| LIT Top-100 PDF Leads | Lead-magnet PDF requesters | Exit-intent modal, `offer="top-100-shippers-pdf"` | `RESEND_AUDIENCE_TOP_100_PDF` |
| LIT Partner Applicants | Partner program submissions | Any form where `source` starts with `partners-` | `RESEND_AUDIENCE_PARTNERS` |
| LIT Comparison Researchers | Mid-funnel competitor researchers | `source` starts with `vs-`, `alternatives-`, `best-`, or `customers-` | `RESEND_AUDIENCE_COMPARISON` |

---

## 3. Create the 13 Templates

In Resend dashboard → **Emails** → **Templates** → **Create Template**. Internal name should match the env-var stub so future operators can find them. Drafted copy lives in `docs/marketing/resend-sequence-copy.md` — paste the HTML body, subject, and preview text directly.

After saving, copy the template ID from the URL (`/templates/<id>`).

### A. Trial Welcome — Audience: LIT Trial Leads

| Step | Internal name | Subject | Send | Merge vars | Env var |
|---|---|---|---|---|---|
| 1 | trial-welcome | Your LIT trial is live — start here | Hour 0 (inline) | firstName | `RESEND_TPL_TRIAL_WELCOME` |
| 2 | trial-day-2 | How Hartman Logistics got 2.4× reply rate | Hour 48 | firstName | `RESEND_TPL_TRIAL_DAY_2` |
| 3 | trial-day-5 | 9 searches left on your trial | Hour 120 | firstName | `RESEND_TPL_TRIAL_DAY_5` |
| 4 | trial-day-9 | Want a 20-minute walkthrough? | Hour 216 | firstName | `RESEND_TPL_TRIAL_DAY_9` |
| 5 | trial-day-14 | Last day on the free trial | Hour 336 | firstName | `RESEND_TPL_TRIAL_DAY_14` |

Outline bullets per template are in the copy file.

### B. Top-100 PDF — Audience: LIT Top-100 PDF Leads

| Step | Internal name | Subject | Send | Merge vars | Env var |
|---|---|---|---|---|---|
| 1 | top100-delivery | Your Top 100 US Importers list (PDF) | Hour 0 (inline) | firstName | `RESEND_TPL_TOP_100_DELIVERY` |
| 2 | top100-day-3 | 6 ways our customers use the Top 100 | Hour 72 | firstName | `RESEND_TPL_TOP_100_DAY_3` |
| 3 | top100-day-7 | The list refreshes Mondays — see this week's | Hour 168 | firstName | `RESEND_TPL_TOP_100_DAY_7` |

### C. Partner Onboarding — Audience: LIT Partner Applicants

| Step | Internal name | Subject | Send | Merge vars | Env var |
|---|---|---|---|---|---|
| 1 | partner-received | Got your partner application | Hour 0 (inline) | firstName | `RESEND_TPL_PARTNER_RECEIVED` |
| 2 | partner-approved | You're in — your partner link is below | Hour 48 | firstName | `RESEND_TPL_PARTNER_APPROVED` |
| 3 | partner-day-7 | Best audiences to send + the tier-2 path | Hour 168 | firstName | `RESEND_TPL_PARTNER_DAY_7` |

### D. Comparison Nurture — Audience: LIT Comparison Researchers

| Step | Internal name | Subject | Send | Merge vars | Env var |
|---|---|---|---|---|---|
| 1 | comparison-welcome | LIT vs {{competitor}} — the honest version | Hour 0 (inline) | firstName, competitor | `RESEND_TPL_COMPARISON_WELCOME` |
| 2 | comparison-day-4 | Why teams leave {{competitor}} around month 6 | Hour 96 | firstName, competitor | `RESEND_TPL_COMPARISON_DAY_4` |

Note on `{{competitor}}`: the API route resolves this from the form `source` (e.g. `vs-importgenius` → "ImportGenius"). The template just renders the variable. If the variable is empty, the copy file includes a fallback string.

---

## 4. Vercel env vars — paste this block

Project → Settings → Environment Variables → **Production**. Add all 17 at once (Vercel supports bulk paste). Redeploy after saving.

```bash
# Resend core
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL="LIT <pulse@logisticintel.com>"

# Audiences (4)
RESEND_AUDIENCE_TRIAL_LEADS=aud_...
RESEND_AUDIENCE_TOP_100_PDF=aud_...
RESEND_AUDIENCE_PARTNERS=aud_...
RESEND_AUDIENCE_COMPARISON=aud_...

# Templates (13)
RESEND_TPL_TRIAL_WELCOME=tpl_...
RESEND_TPL_TRIAL_DAY_2=tpl_...
RESEND_TPL_TRIAL_DAY_5=tpl_...
RESEND_TPL_TRIAL_DAY_9=tpl_...
RESEND_TPL_TRIAL_DAY_14=tpl_...
RESEND_TPL_TOP_100_DELIVERY=tpl_...
RESEND_TPL_TOP_100_DAY_3=tpl_...
RESEND_TPL_TOP_100_DAY_7=tpl_...
RESEND_TPL_PARTNER_RECEIVED=tpl_...
RESEND_TPL_PARTNER_APPROVED=tpl_...
RESEND_TPL_PARTNER_DAY_7=tpl_...
RESEND_TPL_COMPARISON_WELCOME=tpl_...
RESEND_TPL_COMPARISON_DAY_4=tpl_...

# Cron auth
CRON_SECRET=<random 32-byte hex>
```

Generate `CRON_SECRET` with `openssl rand -hex 32` or `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

---

## 5. End-to-end test

Do this in production after the redeploy. Use a real inbox you control (Gmail filter alias works: `you+littest@gmail.com`).

1. **Submit the hero form** at `https://logisticintel.com/freight-leads`. First name `Test`, email `you+littest@gmail.com`, company `Acme Forwarding`.
2. **Supabase row check.** Open the `lit_leads` table → filter by email → confirm one row exists with `source=freight-leads-hero` and `status=captured`.
3. **Resend Audience check.** Resend dashboard → Audiences → **LIT Trial Leads** → confirm the contact is present with first name populated.
4. **Queue check.** Supabase → `lit_lead_sequence_queue` → filter by `lead_id` → confirm 4 rows for steps 2 through 5 with `send_at` set to +48h, +120h, +216h, +336h, `sent_at` null. Step 1 has already fired inline so it will either be absent or have `sent_at` populated.
5. **Inbox check.** The trial welcome email arrives within 60 seconds.
6. **Force a cron tick.** To avoid waiting 48 hours, manually trigger the cron:

   ```bash
   curl -X POST https://logisticintel.com/api/cron/lead-sequences \
     -H "Authorization: Bearer $CRON_SECRET"
   ```

   Before running, manually backdate one queue row in Supabase: `UPDATE lit_lead_sequence_queue SET send_at = now() - interval '1 minute' WHERE id = '<row id>';`. The cron will pick it up.
7. **Resend Logs.** Resend dashboard → Logs → confirm the second email shows `delivered`.
8. **Queue row updated.** Re-query the row in step 6 — `sent_at` is now populated.

If all eight steps pass, the chain works.

---

## 6. Failure modes + ops alerts

- **Resend API outage.** Lead capture still succeeds (Supabase insert is independent). Queued rows stay queued. Cron retries on the next tick. No action needed unless the outage exceeds 24 hours — in that case, monitor the `lit_lead_sequence_queue` row count manually.
- **Template ID missing.** The cron falls back to an inline HTML stub so the lead still gets a basic email. The stub is functional but off-brand. All 13 env vars should be set before launch.
- **Cron secret missing or wrong.** The cron route returns 401 and no emails fire. Symptom: queue grows but `sent_at` never populates. Fix: set `CRON_SECRET` in Vercel and confirm `vercel.json` cron config matches.
- **Audience ID missing.** The contact-add call is silently skipped. The email sequence still fires (it reads from the queue, not from the audience). Symptom: emails work but Resend Audiences look empty. Fix: set the 4 audience IDs and redeploy.
- **Bounce or hard fail.** Resend marks the contact. The queue keeps trying for that lead — set a Resend webhook (optional, future work) to auto-stop the sequence on hard bounce.

Monitor weekly: queue depth, send count vs Resend Logs, audience growth. If queue depth exceeds 500 unsent rows older than 1 hour, the cron is stuck — check Vercel cron logs.
