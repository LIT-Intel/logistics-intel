# Resend Sequence Copy — 13 Templates

Paste each section into the matching Resend template. The HTML uses inline styles so it renders identically across clients. Brand spec: max-width 600px, system font stack, cyan top border (`#06b6d4`), brand-blue CTA (`#1e40af`), footer with unsubscribe.

A reusable HTML shell sits at the bottom of this file. Each template below shows the **body block** that goes inside the shell, plus subject and preview text.

---

## A. Trial Welcome Sequence

### 1. RESEND_TPL_TRIAL_WELCOME

**Subject:** Your LIT trial is live — start here
**Preview text:** 10 searches, 10 verified contacts, 524,000 active US shippers indexed. Here's what to run first.
**Merge variables:** `{{firstName}}`

```html
<p>Hi {{firstName}},</p>

<p>Your Logistic Intel trial is active. You get 10 company searches and 10 verified contacts this week. That's enough to build a working prospect list for one lane or one vertical, not a toy demo.</p>

<p>Three things to do in the next 20 minutes:</p>

<ol>
  <li><strong>Pick a lane.</strong> Search by HS code, origin port, or destination city. The index covers 524,000 active US shippers with shipment data through last week.</li>
  <li><strong>Save 5 companies</strong> that match your ICP. Saved companies feed the contact-finder.</li>
  <li><strong>Pull contacts</strong> on your top 3. You'll see role, direct email, and a verification stamp. No "info@" addresses.</li>
</ol>

<p style="text-align:center;margin:32px 0;">
  <a href="https://app.logisticintel.com/dashboard" style="background:#1e40af;color:#ffffff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">Open your dashboard</a>
</p>

<p>Reply to this email if anything is broken or unclear. A real person reads them.</p>

<p>— The LIT team</p>
```

---

### 2. RESEND_TPL_TRIAL_DAY_2

**Subject:** How Hartman Logistics got 2.4× reply rate
**Preview text:** Same outreach team, same volume. The difference was the list.
**Merge variables:** `{{firstName}}`

```html
<p>Hi {{firstName}},</p>

<p>Quick story while your trial is fresh.</p>

<p>Hartman Logistics (mid-size NVOCC, Houston) ran the same outbound team for 18 months with a 3.1% reply rate. They switched the list source to LIT and ran it for one quarter. Reply rate landed at 7.4%. Same SDRs, same scripts, same volume.</p>

<p>What changed: every prospect on the new list had moved freight in the last 90 days on a matching trade lane. No dead accounts, no procurement contacts at companies that haven't imported since 2022.</p>

<p>If you want the lane-level reply data for your own segment, run a search and check the "last shipment" column. Anything inside 60 days is live.</p>

<p style="text-align:center;margin:32px 0;">
  <a href="https://app.logisticintel.com/search" style="background:#1e40af;color:#ffffff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">Run a lane search</a>
</p>

<p>— The LIT team</p>
```

---

### 3. RESEND_TPL_TRIAL_DAY_5

**Subject:** 9 searches left on your trial
**Preview text:** Five days in. Here's how trial users who convert spend their last week.
**Merge variables:** `{{firstName}}`

```html
<p>Hi {{firstName}},</p>

<p>You're five days into the trial. Most users who upgrade follow a similar pattern in the back half:</p>

<ul>
  <li><strong>Day 5–7:</strong> Use 3 to 4 searches to validate a second lane or vertical.</li>
  <li><strong>Day 7–10:</strong> Pull contacts on the top 10 companies and start an outreach test.</li>
  <li><strong>Day 10–14:</strong> Watch for the first reply. If the list is right, it lands inside two weeks.</li>
</ul>

<p>If you haven't pulled contacts yet, that's the next move. Saved companies are already in your account — the contact-finder runs against them in one click.</p>

<p style="text-align:center;margin:32px 0;">
  <a href="https://app.logisticintel.com/contacts" style="background:#1e40af;color:#ffffff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">Find contacts on saved companies</a>
</p>

<p>— The LIT team</p>
```

---

### 4. RESEND_TPL_TRIAL_DAY_9

**Subject:** Want a 20-minute walkthrough?
**Preview text:** Bring a real lane. We'll build the list together and you keep it.
**Merge variables:** `{{firstName}}`

```html
<p>Hi {{firstName}},</p>

<p>Day 9. Two options for the rest of the trial.</p>

<p><strong>Option A:</strong> Keep running solo. The product is built so you don't need a call.</p>

<p><strong>Option B:</strong> Book 20 minutes with us. Bring one lane you're trying to win. We'll build the prospect list with you on the call — saved searches, verified contacts, suggested outreach order. You keep the list in your account whether you upgrade or not.</p>

<p style="text-align:center;margin:32px 0;">
  <a href="https://cal.com/logisticintel/trial-walkthrough" style="background:#1e40af;color:#ffffff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">Grab a 20-min slot</a>
</p>

<p>If option A is working, ignore this email.</p>

<p>— The LIT team</p>
```

---

### 5. RESEND_TPL_TRIAL_DAY_14

**Subject:** Last day on the free trial
**Preview text:** Here's what you used. Here's what comes next.
**Merge variables:** `{{firstName}}`

```html
<p>Hi {{firstName}},</p>

<p>The trial wraps today. Quick recap of what you got: 10 company searches and 10 verified contacts, against an index of 524,000 active US shippers refreshed weekly.</p>

<p>If the data held up, the upgrade is straightforward:</p>

<ul>
  <li><strong>Starter ($149/mo):</strong> 200 searches, 200 contacts. Right for one SDR or owner-operator.</li>
  <li><strong>Growth ($399/mo):</strong> 1,000 searches, 1,000 contacts, team seats. Right for a 3–5 person sales team.</li>
  <li><strong>Scale (custom):</strong> Unlimited search, API access, dedicated CSM.</li>
</ul>

<p>Annual billing knocks 20% off all three.</p>

<p style="text-align:center;margin:32px 0;">
  <a href="https://logisticintel.com/pricing" style="background:#1e40af;color:#ffffff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">Pick a plan</a>
</p>

<p>If LIT didn't fit, reply and tell us why. Honest feedback is the only way the next version gets better.</p>

<p>— The LIT team</p>
```

---

## B. Top-100 PDF Sequence

### 1. RESEND_TPL_TOP_100_DELIVERY

**Subject:** Your Top 100 US Importers list (PDF)
**Preview text:** Ranked by 2026 YTD container volume. Refreshed every Monday.
**Merge variables:** `{{firstName}}`

```html
<p>Hi {{firstName}},</p>

<p>Here's the file you requested: the Top 100 US Importers ranked by 2026 YTD container volume, with HS-code mix and primary origin ports.</p>

<p style="text-align:center;margin:32px 0;">
  <a href="https://logisticintel.com/downloads/top-100-us-importers.pdf" style="background:#1e40af;color:#ffffff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">Download the PDF</a>
</p>

<p>A few notes on how to use it:</p>

<ul>
  <li><strong>Column 4 (HS mix)</strong> tells you what a company actually moves. Targeting Walmart on apparel is different from targeting Walmart on consumer electronics.</li>
  <li><strong>Column 5 (origin port)</strong> matters more than column 1 (name) for forwarder lane positioning.</li>
  <li>The list is a snapshot. The same data, plus 524,000 smaller shippers and verified contacts, is in the LIT trial.</li>
</ul>

<p style="text-align:center;margin:32px 0;">
  <a href="https://logisticintel.com/free-trial" style="background:#06b6d4;color:#0a0a0a;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">Start the free trial</a>
</p>

<p>— The LIT team</p>
```

---

### 2. RESEND_TPL_TOP_100_DAY_3

**Subject:** 6 ways our customers use the Top 100
**Preview text:** Most of these aren't obvious from looking at the list cold.
**Merge variables:** `{{firstName}}`

```html
<p>Hi {{firstName}},</p>

<p>The Top 100 PDF is a starting point, not a prospect list. Here's how customers actually use it:</p>

<ol>
  <li><strong>Lane scouting.</strong> Filter column 5 for your origin port. The companies left are the ones with shipping volume on your lane.</li>
  <li><strong>Vertical mapping.</strong> Group by HS code prefix. You'll see who dominates each category.</li>
  <li><strong>Forwarder gap analysis.</strong> Cross-reference against your current book. The gap is your TAM.</li>
  <li><strong>RFP timing.</strong> The bottom third of the list churns forwarders the most. Highest reply rates land there.</li>
  <li><strong>Account expansion.</strong> If a customer is on the list at #84, their three biggest competitors probably are too.</li>
  <li><strong>Pricing benchmarks.</strong> Knowing a target's container volume sets a realistic floor on what a contract is worth.</li>
</ol>

<p>The list shows the names. The trial shows the contacts and the smaller shippers (everything below the Top 100 cutoff — that's where the winnable accounts live).</p>

<p style="text-align:center;margin:32px 0;">
  <a href="https://logisticintel.com/free-trial" style="background:#1e40af;color:#ffffff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">Try LIT free</a>
</p>

<p>— The LIT team</p>
```

---

### 3. RESEND_TPL_TOP_100_DAY_7

**Subject:** The list refreshes Mondays — see this week's
**Preview text:** Three new entries this week. One $2B importer fell out.
**Merge variables:** `{{firstName}}`

```html
<p>Hi {{firstName}},</p>

<p>The Top 100 refreshes every Monday from the previous week's customs filings. The version you downloaded a week ago is already stale.</p>

<p>This week's changes:</p>

<ul>
  <li>Three new entries in the bottom 20 (smaller importers ramping fast).</li>
  <li>One $2B-volume importer dropped out — sourcing shift away from China.</li>
  <li>Average top-10 container volume up 4% week-over-week.</li>
</ul>

<p>The live version is inside LIT. Same list, filterable by lane, port, HS code, and last shipment date. Plus the 523,900 shippers that don't make the public Top 100.</p>

<p style="text-align:center;margin:32px 0;">
  <a href="https://logisticintel.com/free-trial" style="background:#1e40af;color:#ffffff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">Start the free trial</a>
</p>

<p>10 searches, 10 verified contacts, no card required.</p>

<p>— The LIT team</p>
```

---

## C. Partner Onboarding Sequence

### 1. RESEND_TPL_PARTNER_RECEIVED

**Subject:** Got your partner application
**Preview text:** Quick review on our end. 48 hours, real human.
**Merge variables:** `{{firstName}}`

```html
<p>Hi {{firstName}},</p>

<p>Got your partner application. Here's what happens next.</p>

<p>One of us (probably me, Vince) reads it inside 48 hours and either approves it or comes back with a clarifying question. We do not do auto-approval — partner quality matters more than partner count.</p>

<p>While you wait, the things that move applications to "approved" fastest:</p>

<ul>
  <li>You already advise or sell to forwarders, NVOCCs, or import-side ops teams.</li>
  <li>You have a list or audience that fits — newsletter, LinkedIn following, podcast, paid community.</li>
  <li>You're not running 30 other affiliate programs in the same lane.</li>
</ul>

<p>If any of those are weak, we'll still talk — there's usually a path. Worst case we route you to the referral track (one-off commissions, no portal access).</p>

<p>Talk soon.</p>

<p>— Vince and the LIT team</p>
```

---

### 2. RESEND_TPL_PARTNER_APPROVED

**Subject:** You're in — your partner link is below
**Preview text:** 15% recurring, 90-day cookie. Portal access too.
**Merge variables:** `{{firstName}}`

```html
<p>Hi {{firstName}},</p>

<p>Approved. Welcome to the LIT partner program.</p>

<p>Terms recap so we're on the same page:</p>

<ul>
  <li><strong>15% recurring commission</strong> for the lifetime of the customer (as long as they're active).</li>
  <li><strong>90-day cookie window.</strong> If they sign up inside 90 days of clicking your link, you get credit.</li>
  <li>Payouts monthly via Stripe, $50 minimum.</li>
</ul>

<p>Your partner link and dashboard:</p>

<p style="text-align:center;margin:32px 0;">
  <a href="https://logisticintel.com/partners/dashboard" style="background:#1e40af;color:#ffffff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">Open your partner dashboard</a>
</p>

<p>Inside you'll find your unique link, real-time click and conversion stats, and a swipe file of copy that's worked for other partners (LinkedIn posts, newsletter blurbs, podcast read scripts).</p>

<p>Email me directly if you want to bounce ideas. I read every reply.</p>

<p>— Vince</p>
```

---

### 3. RESEND_TPL_PARTNER_DAY_7

**Subject:** Best audiences to send + the tier-2 path
**Preview text:** What's converting at 11%, what's converting at 1%, and how to unlock 25% recurring.
**Merge variables:** `{{firstName}}`

```html
<p>Hi {{firstName}},</p>

<p>Week one debrief. Here's what's working across the partner program right now:</p>

<p><strong>Converting well (8–11% click-to-trial):</strong></p>
<ul>
  <li>NVOCC owner-operator newsletters under 5,000 subscribers.</li>
  <li>LinkedIn posts from operators (not founders) sharing a specific use case.</li>
  <li>Niche freight podcasts with a tight import/export focus.</li>
</ul>

<p><strong>Converting poorly (under 2%):</strong></p>
<ul>
  <li>Generic logistics newsletters that cover everything.</li>
  <li>Broad LinkedIn carousels with no operator angle.</li>
  <li>"Top 10 tools" listicles. LIT shows up but gets ignored.</li>
</ul>

<p>The pattern: specificity wins. "Here's how I built a 40-account prospect list for the Long Beach → Mexico City lane in 30 minutes" beats "check out this cool tool."</p>

<p><strong>Tier-2 path.</strong> Hit 5 paying conversions in any 90-day window and you move to 25% recurring (up from 15%). No application, automatic.</p>

<p>— Vince</p>
```

---

## D. Comparison Nurture Sequence

### 1. RESEND_TPL_COMPARISON_WELCOME

**Subject:** LIT vs {{competitor}} — the honest version
**Preview text:** Where LIT wins, where it loses, and which one to pick based on what you're actually doing.
**Merge variables:** `{{firstName}}`, `{{competitor}}` (fallback: "the other guys")

```html
<p>Hi {{firstName}},</p>

<p>You looked at the {{competitor}} comparison page, which means you're doing real diligence. Here's the version we don't put on the marketing site:</p>

<p><strong>Where LIT loses to {{competitor}}:</strong></p>
<ul>
  <li>Raw BOL depth on shipments older than 2 years. Parity with ImportGenius at best, behind on archival.</li>
  <li>Number of countries indexed. {{competitor}} covers more origin markets if you're chasing global trade flows.</li>
  <li>Brand recognition. {{competitor}} has been around longer.</li>
</ul>

<p><strong>Where LIT wins:</strong></p>
<ul>
  <li>Verified contact data on the shippers, not just the shipments. {{competitor}} shows you who imported what; LIT shows you who to email.</li>
  <li>Weekly refresh. {{competitor}} updates monthly or slower.</li>
  <li>Workflow tools — saved searches, contact verification, outreach-ready exports. {{competitor}} is a database; LIT is a workflow.</li>
</ul>

<p>If you're doing trade research, {{competitor}} is fine. If you're doing outbound sales to importers, LIT is built for that specifically.</p>

<p style="text-align:center;margin:32px 0;">
  <a href="https://logisticintel.com/free-trial" style="background:#1e40af;color:#ffffff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">Try LIT free for 14 days</a>
</p>

<p>10 searches, 10 verified contacts. Run it side-by-side with {{competitor}} on the same lane and see which list closes.</p>

<p>— The LIT team</p>
```

---

### 2. RESEND_TPL_COMPARISON_DAY_4

**Subject:** Why teams leave {{competitor}} around month 6
**Preview text:** It's almost always the same reason. Worth knowing before you sign.
**Merge variables:** `{{firstName}}`, `{{competitor}}` (fallback: "legacy trade data tools")

```html
<p>Hi {{firstName}},</p>

<p>Pattern we see in customer interviews when teams switch from {{competitor}} to LIT: it's almost never about the data. The data is fine. It's about what happens after the data.</p>

<p>The story usually goes:</p>

<ol>
  <li>Month 1–2: Excited. The trade data is rich, the search is fun.</li>
  <li>Month 3: Reps start asking "okay, who do I actually email?"</li>
  <li>Month 4–5: SDR team builds a manual workflow — export CSV, run through ZoomInfo or Apollo, dedupe, re-import.</li>
  <li>Month 6: Someone calculates the time cost. About 70% of SDR time is now list-building, not outreach.</li>
  <li>Month 7: They start looking for an alternative.</li>
</ol>

<p>LIT was built to skip steps 3–6. Contacts come with the shippers. Verification is in-product. Exports are outreach-ready. The 70% list-building tax goes back to outreach time.</p>

<p>If your team is in month 5 with {{competitor}} right now, you already know what we're describing.</p>

<p style="text-align:center;margin:32px 0;">
  <a href="https://logisticintel.com/free-trial" style="background:#1e40af;color:#ffffff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">Run the side-by-side</a>
</p>

<p>— The LIT team</p>
```

---

## Reusable HTML shell

Wrap every body block above in this shell when pasting into Resend. The body blocks slot into the `<!-- BODY -->` marker.

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Logistic Intel</title>
</head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-top:4px solid #06b6d4;border-radius:8px;box-shadow:0 1px 3px rgba(15,23,42,0.06);">
          <tr>
            <td style="padding:32px 40px 8px 40px;">
              <a href="https://logisticintel.com" style="text-decoration:none;color:#0f172a;font-weight:700;font-size:18px;letter-spacing:-0.01em;">Logistic Intel</a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 40px 32px 40px;font-size:15px;line-height:1.6;">
              <!-- BODY -->
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;line-height:1.5;">
              Logistic Intel · 524,000 active US shippers, refreshed weekly.<br>
              You're getting this because you signed up at logisticintel.com.<br>
              <a href="{{unsubscribe_url}}" style="color:#64748b;text-decoration:underline;">Unsubscribe</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

`{{unsubscribe_url}}` is Resend's built-in token. Do not hardcode an unsubscribe link.
