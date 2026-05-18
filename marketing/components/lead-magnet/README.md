# Lead-Magnet Components

Shared React component library for the LIT marketing site's "money page"
template. All components live under `marketing/components/lead-magnet/`
and are exported as named exports. TypeScript strict.

Brand tokens reused from `marketing/tailwind.config.ts` —
`brand-cyan` (`#00F0FF`), `brand-blue` / `brand-blue-600`, `dark-0` →
`dark-3`. No edits to `app/globals.css`; one-off treatments live in
`lead-magnet.module.css`.

All three lead-capture forms share `useLeadMagnetForm.ts`, which POSTs
JSON `{ email, source, offer? }` to `/api/leads/resend` and then
redirects to `/signup?email=…&source=…` (success and failure paths both
redirect — we never lose the lead).

---

## Components

### `StickyCTABar`

Fixed top bar, hidden until the hero scrolls off-screen via
`IntersectionObserver`. Dark backdrop-blur surface with cyan accent.
Hides the pitch text on mobile but keeps the form.

| Prop          | Type                          | Notes                                                          |
| ------------- | ----------------------------- | -------------------------------------------------------------- |
| `heroFormRef` | `RefObject<HTMLElement>` (opt) | Pass the hero form element — when it's in view, the bar hides. |

---

### `ExitIntentModal`

Triggers once per session:

- **Desktop:** `mouseleave` from the top edge (`clientY <= 0`).
- **Mobile:** 30s after load **and** user has scrolled past 50%.

Dedupes via `sessionStorage["lit-exit-shown"]`. Offer is hard-coded to
the "top 100 active shippers" PDF; the form posts with
`source="exit-intent"` and `offer="top-100-shippers-pdf"`.

No props.

---

### `LeadMagnetHero`

Two-column hero (copy/form left, slot right). Wrap a phrase in `<em>`
inside `headline` to get the cyan→blue gradient treatment.

| Prop         | Type                  | Notes                                              |
| ------------ | --------------------- | -------------------------------------------------- |
| `eyebrow`    | `string`              | Small pill above the headline.                     |
| `headline`   | `ReactNode`           | Pass a string or JSX with `<em>` for gradient.     |
| `lede`       | `string`              | Sub-headline paragraph.                            |
| `ctaLabel`   | `string`              | Submit button label.                               |
| `formSource` | `string`              | Hidden `source` field on the form POST.            |
| `formNote`   | `string` (opt)        | Small note under the form (e.g. "No credit card"). |
| `children`   | `ReactNode` (opt)     | Right column slot — typically a `LiveProductPreview`. |

---

### `LiveProductPreview`

Dark "browser chrome" frame for product mockups.

| Prop         | Type            | Notes                                                |
| ------------ | --------------- | ---------------------------------------------------- |
| `urlBarText` | `string`        | Text inside the faux URL bar.                        |
| `pulseLabel` | `string` (opt)  | Pulsing pill — e.g. `"LIVE"`, `"CBP · WEEKLY"`.      |
| `children`   | `ReactNode`     | Body content (your product mock).                    |

---

### `ProofStrip`

Logo cloud using the existing `LogoTile` component (logo.dev with
Google favicon fallback). Greyscale styling lives on the wrapper.

| Prop      | Type              | Notes                                         |
| --------- | ----------------- | --------------------------------------------- |
| `label`   | `string` (opt)    | Default: "Trusted by freight revenue teams at". |
| `domains` | `string[]` (opt)  | Default: C.H. Robinson, RXO, Echo, DHL, DSV, Expeditors. |

---

### `OutcomesBand`

3-up grid of gradient numbers + label + body + optional citation.

```ts
type Outcome = { num: string; label: string; body: string; cite?: string };
```

| Prop    | Type        |
| ------- | ----------- |
| `items` | `Outcome[]` |

---

### `MoneyPageFAQ`

Native `<details>` accordion. Server-renders `FAQPage` JSON-LD inline.

| Prop          | Type                                     | Notes                          |
| ------------- | ---------------------------------------- | ------------------------------ |
| `items`       | `{ question: string; answer: string }[]` | Required.                      |
| `emitJsonLd`  | `boolean` (default `true`)               | Set `false` to avoid dup schema. |

---

### `PulseDigestEmailMockup`

Static visual mockup of the LIT Pulse weekly digest. Rotated `-1deg`,
white card, three sections (volume changes, revenue opportunity,
trending pills). Sample data baked in. No props.

---

## Usage — `freight-leads/page.tsx`

```tsx
import { StickyCTABar } from "@/components/lead-magnet/StickyCTABar";
import { ExitIntentModal } from "@/components/lead-magnet/ExitIntentModal";
import { LeadMagnetHero } from "@/components/lead-magnet/LeadMagnetHero";
import { LiveProductPreview } from "@/components/lead-magnet/LiveProductPreview";
import { ProofStrip } from "@/components/lead-magnet/ProofStrip";
import { OutcomesBand } from "@/components/lead-magnet/OutcomesBand";
import { MoneyPageFAQ } from "@/components/lead-magnet/MoneyPageFAQ";
import { PulseDigestEmailMockup } from "@/components/lead-magnet/PulseDigestEmailMockup";

export default function FreightLeadsPage() {
  return (
    <>
      <StickyCTABar />

      <LeadMagnetHero
        eyebrow="Freight Lead Intelligence"
        headline={
          <>
            Find the <em>active shippers</em> in your lane this week.
          </>
        }
        lede="10 free searches and 10 verified contacts. Sourced from US CBP filings and verified weekly. No credit card."
        ctaLabel="Start free"
        formSource="freight-leads-hero"
        formNote="Free forever for the first 10 searches. SOC 2 · GDPR · CCPA."
      >
        <LiveProductPreview urlBarText="app.logisticintel.com/search" pulseLabel="LIVE">
          {/* drop a search-result mock here */}
        </LiveProductPreview>
      </LeadMagnetHero>

      <ProofStrip />

      <OutcomesBand
        items={[
          { num: "10x", label: "More qualified meetings", body: "Replace cold list buys with verified, in-market shippers.", cite: "Avg. customer, 90 days" },
          { num: "48hr", label: "From signup to first meeting", body: "Outreach drafts auto-built from the most recent shipment activity." },
          { num: "$480K", label: "Avg. pipeline lift / rep / qtr", body: "Tracked across 80+ freight revenue teams using LIT Pulse weekly briefs." },
        ]}
      />

      {/* dark wrapper supplies the contrast for the white digest card */}
      <section className="bg-dark-1 py-20">
        <div className="mx-auto max-w-content px-4 sm:px-6">
          <PulseDigestEmailMockup />
        </div>
      </section>

      <MoneyPageFAQ
        items={[
          { question: "Where does the shipment data come from?", answer: "US Customs and Border Protection (CBP) bill-of-lading filings, refreshed weekly." },
          { question: "Do I need a credit card?", answer: "No. The free tier includes 10 searches and 10 verified contacts. Upgrade only when you're ready." },
        ]}
      />

      <ExitIntentModal />
    </>
  );
}
```
