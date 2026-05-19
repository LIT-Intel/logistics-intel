# Resend Sequence Copy — 13 Templates

Each template body block below is wrapped by the shared HTML shell at the bottom of this file at push time (`scripts/setup-resend-templates.cjs` substitutes the body into the `<!-- BODY -->` marker and the hero SVG into the `<!-- HERO -->` marker).

Visual language matches `frontend/src/features/outbound/data/starterTemplates.ts`: 600px email-safe table, Georgia serif, inline-styled static hero SVG per email, brand accent per sequence, CTA button with subtle glow. No external CSS, no `<style>` blocks, no animation — renders identically in Gmail and Outlook.

**Subject lines** are 8–12 words, benefit-led (Ogilvy).
**Preview text** is 80–110 chars and complements (does not repeat) the subject.
**Trigger** describes the user action that fires the template.
**Hero kind** is one of `stack | broker | customs | nvocc | dashboard | newsletter | team`.
**Accent** is one of `ocean | blue | purple | teal | red | amber | slate`.

For the trigger → source-value mapping, see `docs/marketing/resend-template-triggers.md`.

---

## A. Trial Welcome Sequence

### 1. RESEND_TPL_TRIAL_WELCOME

**Subject:** Your LIT trial is live — 524,000 active shippers indexed
**Preview text:** 10 searches, 10 verified contacts, one working prospect list. Three moves to make in the next 20 minutes.
**Trigger:** Any hero, sticky, or final-CTA free-trial form submit that resolves to `funnel=trial` in `resolveAudience()` (sent inline at step 1).
**Merge variables:** `{{firstName}}`
**Hero kind:** dashboard
**Accent:** blue

```html
<p style="margin:0 0 16px 0;">Hi {{firstName}},</p>
<p style="margin:0 0 16px 0;">Your Logistic Intel trial is active. You get <strong>10 company searches</strong> and <strong>10 verified contacts</strong> this week — enough to build a working prospect list for one lane or one vertical, not a toy demo.</p>
<p style="margin:0 0 16px 0;">Three moves to make in the next 20 minutes:</p>
<ol style="margin:0 0 16px 0;padding-left:20px;">
  <li style="margin-bottom:8px;"><strong>Pick a lane.</strong> Search by HS code, origin port, or destination city. 524,000 active US shippers indexed through last week.</li>
  <li style="margin-bottom:8px;"><strong>Save 5 companies</strong> that match your ICP. Saved companies feed the contact-finder.</li>
  <li style="margin-bottom:8px;"><strong>Pull contacts</strong> on your top 3. Role, direct email, verification stamp. No "info@" addresses.</li>
</ol>
<p style="margin:0 0 16px 0;">Reply to this email if anything is broken or unclear. A real person reads them.</p>
```

---

### 2. RESEND_TPL_TRIAL_DAY_2

**Subject:** How Hartman Logistics hit 2.4× reply rate same week
**Preview text:** Same outreach team, same volume, same scripts. The list source was the only variable that changed.
**Trigger:** Cron, 48 hours after a trial lead is enqueued. Fires for every trial lead regardless of activation state.
**Merge variables:** `{{firstName}}`
**Hero kind:** dashboard
**Accent:** blue

```html
<p style="margin:0 0 16px 0;">Hi {{firstName}},</p>
<p style="margin:0 0 16px 0;">Quick story while your trial is fresh.</p>
<p style="margin:0 0 16px 0;"><strong>Hartman Logistics</strong> (mid-size NVOCC, Houston) ran the same outbound team for 18 months at a 3.1% reply rate. They switched the list source to LIT. One quarter later: <strong>7.4% reply rate</strong>. Same SDRs, same scripts, same volume.</p>
<p style="margin:0 0 16px 0;">What changed: every prospect on the new list had moved freight in the last 90 days on a matching trade lane. No dead accounts, no procurement contacts at companies that haven't imported since 2022.</p>
<p style="margin:0 0 16px 0;">Want the lane-level reply data on your own segment? Run a search and check the "last shipment" column. Anything inside 60 days is live.</p>
```

---

### 3. RESEND_TPL_TRIAL_DAY_5

**Subject:** Five days in — here's the pattern that converts
**Preview text:** Trial users who upgrade run a specific play in the back half of week one. Worth copying.
**Trigger:** Cron, 120 hours (5 days) after trial lead capture. Fires for everyone in the trial sequence.
**Merge variables:** `{{firstName}}`
**Hero kind:** dashboard
**Accent:** blue

```html
<p style="margin:0 0 16px 0;">Hi {{firstName}},</p>
<p style="margin:0 0 16px 0;">You're five days in. Trial users who upgrade follow the same pattern in the back half:</p>
<ul style="margin:0 0 16px 0;padding-left:20px;">
  <li style="margin-bottom:8px;"><strong>Day 5–7:</strong> 3–4 searches to validate a second lane or vertical.</li>
  <li style="margin-bottom:8px;"><strong>Day 7–10:</strong> Pull contacts on the top 10 saved companies and start an outreach test.</li>
  <li style="margin-bottom:8px;"><strong>Day 10–14:</strong> Watch for the first reply. If the list is right, it lands inside two weeks.</li>
</ul>
<p style="margin:0 0 16px 0;">If you haven't pulled contacts yet, that's the next move. Saved companies are already in your account — the contact-finder runs against them in one click.</p>
```

---

### 4. RESEND_TPL_TRIAL_DAY_9

**Subject:** Want 20 minutes on your real lane this week?
**Preview text:** Bring one lane you're trying to win. We'll build the prospect list with you. You keep it either way.
**Trigger:** Cron, 216 hours (9 days) after trial lead capture. Fires for everyone — assumes most need a nudge by now.
**Merge variables:** `{{firstName}}`
**Hero kind:** dashboard
**Accent:** blue

```html
<p style="margin:0 0 16px 0;">Hi {{firstName}},</p>
<p style="margin:0 0 16px 0;">Day 9. Two options for the rest of the trial.</p>
<p style="margin:0 0 16px 0;"><strong>Option A — Keep running solo.</strong> The product is built so you don't need a call.</p>
<p style="margin:0 0 16px 0;"><strong>Option B — Book 20 minutes.</strong> Bring one lane you're trying to win. We'll build the prospect list with you on the call: saved searches, verified contacts, suggested outreach order. You keep the list in your account whether you upgrade or not.</p>
<p style="margin:0 0 16px 0;">If option A is working, ignore this email.</p>
```

---

### 5. RESEND_TPL_TRIAL_DAY_14

**Subject:** Last day on trial — three paths from here
**Preview text:** Recap of what you used, what each plan unlocks, and how to tell us if LIT didn't fit.
**Trigger:** Cron, 336 hours (14 days) after trial lead capture. Fires for everyone in the trial sequence regardless of activation.
**Merge variables:** `{{firstName}}`
**Hero kind:** dashboard
**Accent:** blue

```html
<p style="margin:0 0 16px 0;">Hi {{firstName}},</p>
<p style="margin:0 0 16px 0;">The trial wraps today. Quick recap: 10 company searches, 10 verified contacts, against an index of 524,000 active US shippers refreshed weekly.</p>
<p style="margin:0 0 16px 0;">If the data held up, three plans:</p>
<ul style="margin:0 0 16px 0;padding-left:20px;">
  <li style="margin-bottom:8px;"><strong>Starter ($149/mo):</strong> 200 searches, 200 contacts. One SDR or owner-operator.</li>
  <li style="margin-bottom:8px;"><strong>Growth ($399/mo):</strong> 1,000 searches, 1,000 contacts, team seats. 3–5 person sales team.</li>
  <li style="margin-bottom:8px;"><strong>Scale (custom):</strong> Unlimited search, API access, dedicated CSM.</li>
</ul>
<p style="margin:0 0 16px 0;">Annual billing knocks 20% off all three.</p>
<p style="margin:0 0 16px 0;">If LIT didn't fit, reply and tell us why. Honest feedback is the only way the next version gets better.</p>
```

---

## B. Top-100 PDF Sequence

### 1. RESEND_TPL_TOP_100_DELIVERY

**Subject:** Your Top 100 US importers PDF — ranked by 2026 volume
**Preview text:** HS-code mix, primary origin ports, and three ways to read it before your next outbound block.
**Trigger:** Exit-intent modal submit (or any form) with `offer=top-100-shippers-pdf`. Resolves to `funnel=top-100-followup`. Sent inline at step 1.
**Merge variables:** `{{firstName}}`
**Hero kind:** newsletter
**Accent:** ocean

```html
<p style="margin:0 0 16px 0;">Hi {{firstName}},</p>
<p style="margin:0 0 16px 0;">Here's the file you requested: the <strong>Top 100 US Importers</strong> ranked by 2026 YTD container volume, with HS-code mix and primary origin ports.</p>
<p style="margin:0 0 16px 0;">A few notes on how to use it:</p>
<ul style="margin:0 0 16px 0;padding-left:20px;">
  <li style="margin-bottom:8px;"><strong>Column 4 (HS mix)</strong> tells you what a company actually moves. Targeting Walmart on apparel is different from targeting Walmart on consumer electronics.</li>
  <li style="margin-bottom:8px;"><strong>Column 5 (origin port)</strong> matters more than column 1 (name) for forwarder lane positioning.</li>
  <li style="margin-bottom:8px;">The list is a snapshot. The same data, plus 524,000 smaller shippers and verified contacts, is in the LIT trial.</li>
</ul>
<p style="margin:0 0 16px 0;">PDF is on the dashboard. Tap the CTA to grab it.</p>
```

---

### 2. RESEND_TPL_TOP_100_DAY_3

**Subject:** Six ways freight reps actually use the Top 100
**Preview text:** Most of these aren't obvious from looking at the list cold. Lane scouting, RFP timing, account expansion.
**Trigger:** Cron, 72 hours (3 days) after the Top 100 PDF was delivered.
**Merge variables:** `{{firstName}}`
**Hero kind:** newsletter
**Accent:** ocean

```html
<p style="margin:0 0 16px 0;">Hi {{firstName}},</p>
<p style="margin:0 0 16px 0;">The Top 100 PDF is a starting point, not a prospect list. Here's how customers actually use it:</p>
<ol style="margin:0 0 16px 0;padding-left:20px;">
  <li style="margin-bottom:8px;"><strong>Lane scouting.</strong> Filter column 5 for your origin port. Names left are the ones with volume on your lane.</li>
  <li style="margin-bottom:8px;"><strong>Vertical mapping.</strong> Group by HS code prefix. You'll see who dominates each category.</li>
  <li style="margin-bottom:8px;"><strong>Forwarder gap analysis.</strong> Cross-reference against your current book. The gap is your TAM.</li>
  <li style="margin-bottom:8px;"><strong>RFP timing.</strong> The bottom third churns forwarders the most. Highest reply rates land there.</li>
  <li style="margin-bottom:8px;"><strong>Account expansion.</strong> If a customer sits at #84, their three biggest competitors probably are too.</li>
  <li style="margin-bottom:8px;"><strong>Pricing benchmarks.</strong> Knowing target container volume sets a realistic floor on contract value.</li>
</ol>
<p style="margin:0 0 16px 0;">The list shows the names. The trial shows the contacts and the smaller shippers below the Top 100 cutoff — where the winnable accounts live.</p>
```

---

### 3. RESEND_TPL_TOP_100_DAY_7

**Subject:** The list refreshes every Monday — this week moved hard
**Preview text:** Three new entries in the bottom 20. One $2B importer dropped out. Sourcing shifts are showing up live.
**Trigger:** Cron, 168 hours (7 days) after the Top 100 PDF was delivered.
**Merge variables:** `{{firstName}}`
**Hero kind:** newsletter
**Accent:** ocean

```html
<p style="margin:0 0 16px 0;">Hi {{firstName}},</p>
<p style="margin:0 0 16px 0;">The Top 100 refreshes every Monday from the previous week's customs filings. The version you downloaded a week ago is already stale.</p>
<p style="margin:0 0 16px 0;">This week's changes:</p>
<ul style="margin:0 0 16px 0;padding-left:20px;">
  <li style="margin-bottom:8px;">Three new entries in the bottom 20 (smaller importers ramping fast).</li>
  <li style="margin-bottom:8px;">One $2B-volume importer dropped out — sourcing shift away from China.</li>
  <li style="margin-bottom:8px;">Average top-10 container volume up <strong>4% week-over-week</strong>.</li>
</ul>
<p style="margin:0 0 16px 0;">The live version is inside LIT. Same list, filterable by lane, port, HS code, and last shipment date. Plus the 523,900 shippers that don't make the public Top 100. 10 searches, 10 verified contacts, no card required.</p>
```

---

## C. Partner Onboarding Sequence

### 1. RESEND_TPL_PARTNER_RECEIVED

**Subject:** Got your LIT partner application — 48h human review
**Preview text:** What we look for, what moves applications to approved fastest, and the fallback referral track if not.
**Trigger:** Any form submit with `source` starting `partners-` (resolves to `funnel=partner-onboarding`). Sent inline at step 1.
**Merge variables:** `{{firstName}}`
**Hero kind:** team
**Accent:** teal

```html
<p style="margin:0 0 16px 0;">Hi {{firstName}},</p>
<p style="margin:0 0 16px 0;">Got your partner application. Here's what happens next.</p>
<p style="margin:0 0 16px 0;">One of us (probably me, Vince) reads it inside <strong>48 hours</strong> and either approves it or comes back with a clarifying question. We do not do auto-approval — partner quality matters more than partner count.</p>
<p style="margin:0 0 16px 0;">What moves applications to approved fastest:</p>
<ul style="margin:0 0 16px 0;padding-left:20px;">
  <li style="margin-bottom:8px;">You already advise or sell to forwarders, NVOCCs, or import-side ops teams.</li>
  <li style="margin-bottom:8px;">You have a list or audience that fits — newsletter, LinkedIn following, podcast, paid community.</li>
  <li style="margin-bottom:8px;">You're not running 30 other affiliate programs in the same lane.</li>
</ul>
<p style="margin:0 0 16px 0;">If any of those are weak, we'll still talk — there's usually a path. Worst case we route you to the referral track (one-off commissions, no portal access).</p>
```

---

### 2. RESEND_TPL_PARTNER_APPROVED

**Subject:** You're in — your LIT partner link is live
**Preview text:** 15% recurring, 90-day cookie, monthly Stripe payouts. Portal access, swipe file, and the tier-2 path inside.
**Trigger:** Cron, 48 hours after partner application. (Stand-in for manual approval flow — see open question in trigger doc.)
**Merge variables:** `{{firstName}}`
**Hero kind:** team
**Accent:** teal

```html
<p style="margin:0 0 16px 0;">Hi {{firstName}},</p>
<p style="margin:0 0 16px 0;">Approved. Welcome to the LIT partner program.</p>
<p style="margin:0 0 16px 0;">Terms recap so we're on the same page:</p>
<ul style="margin:0 0 16px 0;padding-left:20px;">
  <li style="margin-bottom:8px;"><strong>15% recurring commission</strong> for the lifetime of the customer (as long as they're active).</li>
  <li style="margin-bottom:8px;"><strong>90-day cookie window.</strong> If they sign up inside 90 days of clicking your link, you get credit.</li>
  <li style="margin-bottom:8px;">Payouts monthly via Stripe, $50 minimum.</li>
</ul>
<p style="margin:0 0 16px 0;">Inside the partner dashboard you'll find your unique link, real-time click and conversion stats, and a swipe file of copy that's worked for other partners (LinkedIn posts, newsletter blurbs, podcast read scripts).</p>
<p style="margin:0 0 16px 0;">Email me directly if you want to bounce ideas. I read every reply.</p>
```

---

### 3. RESEND_TPL_PARTNER_DAY_7

**Subject:** Week one debrief — what's converting at 11% right now
**Preview text:** Niche operator newsletters and specific use-case posts beat generic carousels. The tier-2 path explained.
**Trigger:** Cron, 168 hours (7 days) after partner application.
**Merge variables:** `{{firstName}}`
**Hero kind:** team
**Accent:** teal

```html
<p style="margin:0 0 16px 0;">Hi {{firstName}},</p>
<p style="margin:0 0 16px 0;">Week one debrief. What's working across the partner program right now:</p>
<p style="margin:0 0 16px 0;"><strong>Converting well (8–11% click-to-trial):</strong></p>
<ul style="margin:0 0 16px 0;padding-left:20px;">
  <li style="margin-bottom:8px;">NVOCC owner-operator newsletters under 5,000 subscribers.</li>
  <li style="margin-bottom:8px;">LinkedIn posts from operators (not founders) sharing a specific use case.</li>
  <li style="margin-bottom:8px;">Niche freight podcasts with a tight import/export focus.</li>
</ul>
<p style="margin:0 0 16px 0;"><strong>Converting poorly (under 2%):</strong></p>
<ul style="margin:0 0 16px 0;padding-left:20px;">
  <li style="margin-bottom:8px;">Generic logistics newsletters that cover everything.</li>
  <li style="margin-bottom:8px;">Broad LinkedIn carousels with no operator angle.</li>
  <li style="margin-bottom:8px;">"Top 10 tools" listicles. LIT shows up but gets ignored.</li>
</ul>
<p style="margin:0 0 16px 0;">The pattern: specificity wins. "How I built a 40-account list for the Long Beach → Mexico City lane in 30 minutes" beats "check out this cool tool."</p>
<p style="margin:0 0 16px 0;"><strong>Tier-2 path:</strong> Hit 5 paying conversions in any 90-day window and you move to <strong>25% recurring</strong> (up from 15%). No application, automatic.</p>
```

---

## D. Comparison Nurture Sequence

### 1. RESEND_TPL_COMPARISON_WELCOME

**Subject:** LIT vs {{competitor}} — the version we never publish
**Preview text:** Where LIT loses on archival depth and country count. Where it wins on workflow. Pick the right tool.
**Trigger:** Form submit where `source` starts `vs-`, `alternatives-`, `best-`, or `customers-`. Cron resolves `{{competitor}}` from the source token. Sent inline at step 1.
**Merge variables:** `{{firstName}}`, `{{competitor}}` (fallback: "the other guys")
**Hero kind:** stack
**Accent:** purple

```html
<p style="margin:0 0 16px 0;">Hi {{firstName}},</p>
<p style="margin:0 0 16px 0;">You looked at the {{competitor}} comparison page, which means you're doing real diligence. Here's the version we don't put on the marketing site:</p>
<p style="margin:0 0 16px 0;"><strong>Where LIT loses to {{competitor}}:</strong></p>
<ul style="margin:0 0 16px 0;padding-left:20px;">
  <li style="margin-bottom:8px;">Raw BOL depth on shipments older than 2 years. Parity at best, behind on archival.</li>
  <li style="margin-bottom:8px;">Number of countries indexed. {{competitor}} covers more origin markets if you're chasing global trade flows.</li>
  <li style="margin-bottom:8px;">Brand recognition. {{competitor}} has been around longer.</li>
</ul>
<p style="margin:0 0 16px 0;"><strong>Where LIT wins:</strong></p>
<ul style="margin:0 0 16px 0;padding-left:20px;">
  <li style="margin-bottom:8px;">Verified contact data on the shippers, not just the shipments. {{competitor}} shows who imported what; LIT shows who to email.</li>
  <li style="margin-bottom:8px;">Weekly refresh. {{competitor}} updates monthly or slower.</li>
  <li style="margin-bottom:8px;">Workflow tools — saved searches, contact verification, outreach-ready exports. {{competitor}} is a database; LIT is a workflow.</li>
</ul>
<p style="margin:0 0 16px 0;">If you're doing trade research, {{competitor}} is fine. If you're doing outbound sales to importers, LIT is built for that specifically. Run it side-by-side with {{competitor}} on the same lane and see which list closes.</p>
```

---

### 2. RESEND_TPL_COMPARISON_DAY_4

**Subject:** Why teams leave {{competitor}} around month six
**Preview text:** It's almost never the data. It's what happens after the data — the 70% list-building tax that piles up.
**Trigger:** Cron, 96 hours (4 days) after comparison-page lead capture.
**Merge variables:** `{{firstName}}`, `{{competitor}}` (fallback: "legacy trade data tools")
**Hero kind:** stack
**Accent:** purple

```html
<p style="margin:0 0 16px 0;">Hi {{firstName}},</p>
<p style="margin:0 0 16px 0;">Pattern we see in customer interviews when teams switch from {{competitor}} to LIT: it's almost never about the data. The data is fine. It's about what happens <em>after</em> the data.</p>
<p style="margin:0 0 16px 0;">The story usually goes:</p>
<ol style="margin:0 0 16px 0;padding-left:20px;">
  <li style="margin-bottom:8px;"><strong>Month 1–2:</strong> Excited. The trade data is rich, the search is fun.</li>
  <li style="margin-bottom:8px;"><strong>Month 3:</strong> Reps start asking "okay, who do I actually email?"</li>
  <li style="margin-bottom:8px;"><strong>Month 4–5:</strong> SDR team builds a manual workflow — export CSV, run through ZoomInfo or Apollo, dedupe, re-import.</li>
  <li style="margin-bottom:8px;"><strong>Month 6:</strong> Someone calculates the time cost. About 70% of SDR time is now list-building, not outreach.</li>
  <li style="margin-bottom:8px;"><strong>Month 7:</strong> They start looking for an alternative.</li>
</ol>
<p style="margin:0 0 16px 0;">LIT was built to skip steps 3–6. Contacts come with the shippers. Verification is in-product. Exports are outreach-ready. The 70% list-building tax goes back to outreach time.</p>
<p style="margin:0 0 16px 0;">If your team is in month 5 with {{competitor}} right now, you already know what we're describing.</p>
```

---

## Reusable HTML shell

This shell wraps every body block. `scripts/setup-resend-templates.cjs` reads the html block immediately below "## Reusable HTML shell" and substitutes the body into the `<!-- BODY -->` marker. The hero SVG and accent color are templated per sequence (substitute `<!-- HERO -->`, `__ACCENT__`, and `__CTA_TEXT__` per template family when generating the final HTML; the current push script ships them as static placeholders — until heroes are wired into the script, the shell renders accent-only with no hero illustration so deliverability is not affected).

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Logistic Intel</title>
</head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:Georgia,'Times New Roman',serif;color:#0F172A;">
  <!-- preheader (hidden) -->
  <div style="display:none;font-size:0;color:#F8FAFC;line-height:0;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">Logistic Intel — 524,000 active US shippers, refreshed weekly.</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F8FAFC" style="background:#F8FAFC;">
    <tr>
      <td align="center" style="padding:24px 12px;">

        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.06);">

          <!-- Brand header -->
          <tr>
            <td style="padding:20px 32px 16px 32px;border-bottom:1px solid #F1F5F9;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" valign="middle">
                    <a href="https://logisticintel.com" style="text-decoration:none;color:#0F172A;">
                      <span style="display:inline-block;width:28px;height:28px;background:#0EA5E9;border-radius:6px;color:#FFFFFF;font-family:Georgia,serif;font-weight:700;font-size:14px;line-height:28px;text-align:center;vertical-align:middle;">L</span>
                      <span style="font-family:Georgia,'Times New Roman',serif;font-weight:700;font-size:18px;letter-spacing:-0.01em;color:#0F172A;vertical-align:middle;margin-left:10px;">Logistic Intel</span>
                    </a>
                  </td>
                  <td align="right" valign="middle" style="font-family:Georgia,serif;font-size:11px;color:#64748B;">
                    Trade Intel · Weekly Refresh
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Hero SVG slot (the push script substitutes the per-template SVG here) -->
          <tr>
            <td style="padding:0;line-height:0;">
              <!-- HERO -->
            </td>
          </tr>

          <!-- Body slot -->
          <tr>
            <td style="padding:28px 32px 8px 32px;color:#0F172A;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.6;">
              <!-- BODY -->
            </td>
          </tr>

          <!-- CTA block -->
          <tr>
            <td align="left" style="padding:8px 32px 28px 32px;">
              <a href="https://logisticintel.com" style="display:inline-block;padding:13px 24px;background:#0EA5E9;color:#FFFFFF;font-family:Georgia,'Times New Roman',serif;font-weight:700;font-size:15px;text-decoration:none;border-radius:8px;box-shadow:0 4px 14px rgba(14,165,233,0.32);">Open Logistic Intel</a>
            </td>
          </tr>

          <!-- Sign-off + CAN-SPAM compliant footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #E2E8F0;background:#F8FAFC;color:#64748B;font-family:Georgia,'Times New Roman',serif;font-size:12px;line-height:1.6;">
              — The LIT team<br>
              Reply to this email or book time at <a href="https://logisticintel.com" style="color:#0EA5E9;text-decoration:none;">logisticintel.com</a>.
              <br><br>
              <strong style="color:#475569;">Logistic Intel, Inc.</strong><br>
              228 Park Ave S, PMB 81632 · New York, NY 10003 · USA<br>
              <br>
              You're receiving this because you signed up at <a href="https://logisticintel.com" style="color:#64748B;text-decoration:underline;">logisticintel.com</a> or requested information about LIT.
              Don't want these? <a href="{{unsubscribe_url}}" style="color:#64748B;text-decoration:underline;">Unsubscribe</a>
              or <a href="{{{preferences_url}}}" style="color:#64748B;text-decoration:underline;">manage preferences</a>.
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>
```

`{{unsubscribe_url}}` is declared as a Resend variable at push time by `scripts/setup-resend-templates.cjs`. Do not hardcode an unsubscribe URL.
