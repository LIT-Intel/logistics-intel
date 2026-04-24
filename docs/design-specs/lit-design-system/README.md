# LIT Design System
**Logistics Intel (LIT)** — Freight Revenue Intelligence Platform

## What is LIT?

LIT is the revenue intelligence platform for logistics companies — combining global shipment data, CRM workflows, and outbound automation into one unified platform. It enables logistics sales teams to **Discover → Understand → Organize → Engage → Close** high-value shippers faster than competitors.

**Category:** Freight Revenue Intelligence Platform  
**Not:** a CRM, a data tool, or an enrichment tool — it is the intelligence layer *above* all of that.

---

## Sources Used

| Source | Notes |
|---|---|
| GitHub: `LIT-Intel/logistics-intel` | Next.js 14 app, Tailwind CSS, early-stage scaffold |
| `uploads/lit-icon-master.png` / `.svg` | App icon — dark bg + neon cyan glow |
| `uploads/lit-logo-horizontal.svg` | Horizontal lockup: icon + "Logistic Intel" wordmark |

---

## Product Architecture

The platform maps to 5 pillars:

| Pillar | Description | UI Surface |
|---|---|---|
| **Discover** | Company search + import/export intel | Search page, filters |
| **Understand** | Company snapshot, KPIs, routes, spend | Intelligence Panel (drawer) |
| **Organize** | CRM pipeline management | Command Center |
| **Engage** | Campaigns, outreach, automation | Outbound Engine |
| **Close** | Quotes, RFPs, deal benchmarking | Deal Builder |

---

## CONTENT FUNDAMENTALS

### Voice & Tone
- **Direct.** No hedging, no passive voice. Say what it does.
- **Confident.** LIT is a category leader, not a tool. Write from authority.
- **Operator-first.** The reader is a logistics sales rep or freight broker — speak their language (TEUs, BOLs, carriers, lanes, shippers).
- **No fluff.** Every word earns its place. Compress relentlessly.

### Messaging Framework (apply to every page/feature)
1. **Outcome** — Lead with the business result: "Find high-value shippers before your competitors"
2. **Mechanism** — How it works: "Using real shipment data and AI-powered insights"
3. **Workflow** — The steps: "Search → Analyze → Save → Engage → Close"
4. **Proof** — Data that makes it real: shipment counts, TEU volumes, activity trends

### Casing
- Product pillars: Title Case (Discover, Command Center, Deal Builder)
- UI labels: Sentence case ("Save to CRM" → "Add to Command Center")
- CTAs: Title Case ("Start Free", "View Live Data")
- Body copy: Sentence case throughout
- No ALL CAPS in running copy; caps reserved for data labels/overlines only

### Power Language — Preferred Terminology

| Avoid | Use Instead |
|---|---|
| Search | Discover Companies |
| Company Modal | Intelligence Panel |
| Save to CRM | Add to Command Center |
| Campaigns | Outbound Engine |
| Quotes | Deal Builder |
| Data | Intelligence |
| Tool | Platform |

### Emoji
- **Never** in product UI or marketing copy.
- Only acceptable in informal internal docs or Slack.

### Pronouns
- Second person ("you", "your") in marketing: "Find shippers before *your* competitors"
- First person avoided in UI ("Add to Command Center" not "Add to my CRM")

---

## VISUAL FOUNDATIONS

### Color System
- **Dark UI always.** Background is near-black (`#020617`). No light-mode product UI.
- **Primary brand color:** Neon cyan `#00F0FF` — used for the logo glow, key KPIs, active states, highlights.
- **CTA / interactive color:** Electric blue `#3b82f6` — buttons, links, focus rings.
- **Surface hierarchy:** `#020617` → `#0f172a` → `#1e293b` — three levels of depth.
- **Text hierarchy:** `#f8fafc` (headings) → `#cbd5e1` (body) → `#94a3b8` (muted) → `#64748b` (disabled).

### Typography
- **Display / UI font:** Space Grotesk — geometric, technical, confident. Used for all headings and UI labels.
  - *Substitution note: original codebase used system-ui. Space Grotesk is the upgraded brand direction.*
- **Body font:** DM Sans — clean, readable at small sizes, slightly warm.
- **Mono / data font:** JetBrains Mono — used for company IDs, data values, code.
- Headlines are **large and bold** — never compressed small SaaS text. Min 30px for section headers.

### Backgrounds
- Solid dark surfaces only. No full-bleed background images.
- Subtle radial gradients from primary color allowed as ambient glow behind hero content (max 15% opacity).
- No gradient backgrounds as the primary design treatment.

### Cards
- Background: `#0f172a` (surface), border: `#334155` (1px solid).
- Border radius: `12px` (lg) for cards, `8px` (md) for inner elements, `4px` (sm) for tags/badges.
- Subtle box-shadow: `0 4px 12px rgba(0,0,0,0.5)`.
- On hover: border transitions to `#00F0FF` at 40% opacity; subtle background lift to `#1e293b`.

### Hover & Press States
- Hover: border color shift toward brand, bg lightens one level in the surface stack.
- Press: scale `0.97` + opacity `0.9`.
- Transitions: `200ms cubic-bezier(0.16, 1, 0.3, 1)` (ease-out) for all interactive states.
- Active nav items: left or bottom border in `#00F0FF` with glow.

### Iconography
See ICONOGRAPHY section below.

### Glow / Neon Effects
- Reserved for the logo, primary KPI numbers, active nav, and CTA button glows.
- Implementation: `box-shadow: 0 0 12px rgba(0,240,255,0.35)` or `text-shadow` equivalent.
- Do not overuse — glow is for emphasis, not decoration.

### Animation
- Easing: `cubic-bezier(0.16, 1, 0.3, 1)` — fast-out, snappy feel.
- Durations: 120ms (micro), 200ms (default), 350ms (panel/drawer open).
- No bounce animations. No dramatic enter/exit effects on data tables.
- Drawers/panels: slide in from the right, `350ms ease-out`.
- Skeleton loaders preferred over spinners for data-heavy views.

### Spacing
- Dense but not cramped. Card padding: `24px`. Section padding: `40–64px`.
- More whitespace than a typical data tool — "confident space" not anxious compression.

### Corner Radius
- `4px` — badges, tags, input fields
- `8px` — buttons, small cards
- `12px` — main cards
- `16–20px` — modals, large panels
- `9999px` — pills (status badges)

### Borders & Dividers
- Card borders: 1px `#334155`
- Dividers inside panels: 1px `#1e293b`
- No harsh separators — prefer spacing over lines where possible

### Imagery & Color Vibe
- Product screenshots: dark UI framed in darker container with subtle border + shadow.
- No lifestyle photography. No stock photos of freight/ships.
- Data visualizations: muted dark bg, neon cyan/blue lines/bars, minimal gridlines.

---

## ICONOGRAPHY

### Icon System
The codebase does not include a dedicated icon font or SVG sprite. The recommended system is **Lucide Icons** (CDN available), matching the clean stroke-weight style of the LIT logo letterforms.

- **Style:** Stroke-based, 1.5px stroke weight, rounded linecaps — matches brand logo geometry.
- **Size:** 16px (inline), 20px (UI actions), 24px (nav), 32px (feature icons).
- **Color:** `var(--color-fg-3)` default; `var(--color-primary)` for active/highlighted states.
- CDN: `https://unpkg.com/lucide@latest/dist/umd/lucide.min.js`
- **No emoji** as icons in product UI.
- **No unicode** substitutions for icons.

### Brand Assets
| File | Usage |
|---|---|
| `assets/lit-icon-master.png` | App icon, favicons, social avatars |
| `assets/lit-icon-master.svg` | Scalable app icon |
| `assets/lit-logo-horizontal.svg` | Horizontal lockup for nav, marketing headers |

---

## File Index

```
README.md                     ← This file
SKILL.md                      ← Agent skill definition
colors_and_type.css           ← All CSS design tokens

assets/
  lit-icon-master.png         ← App icon (PNG)
  lit-icon-master.svg         ← App icon (SVG)
  lit-logo-horizontal.svg     ← Horizontal logo lockup

preview/                      ← Design system cards (registered in Design System tab)
  colors-brand.html
  colors-surface.html
  colors-semantic.html
  colors-data-viz.html
  type-scale.html
  type-specimens.html
  type-fonts.html
  spacing-tokens.html
  radius-shadow.html
  components-buttons.html
  components-cards.html
  components-badges.html
  components-inputs.html
  components-nav.html
  brand-logo.html

ui_kits/
  app/
    README.md                 ← App UI kit notes
    index.html                ← Main app prototype (Search → Intelligence Panel → Command Center)
    Sidebar.jsx
    SearchBar.jsx
    CompanyCard.jsx
    IntelligencePanel.jsx
    CommandCenter.jsx
    KPIWidget.jsx
    TopNav.jsx
```
