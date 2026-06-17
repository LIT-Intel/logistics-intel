# Design Brief — Pulse Explorer (LIT) Banners + Hero

**Audience:** Claude Design (banner generation) + future marketing-site rebuild
**Date:** 2026-06-17
**Owner:** Spark
**Status:** Ready to design — implementation pending brainstorming sign-off

---

## What we're designing

Banner + hero artwork for the rebuilt `/pulse` marketing page on logisticintel.com. The current page describes the OLD Pulse (a generic NL search box + account briefs). The shipped product is **Pulse Explorer** — a map-first sales intelligence surface modeled on DSV's Sales Explorer V6 / Revenue Vessel, fused with our existing Pulse AI natural-language search. The page rebrand needs banner art that sells the new product, not the old one.

Required banner artifacts:
1. **Hero banner** — full-width, top of `/pulse`. ~1920×800 desktop, ~750×500 mobile.
2. **Feature card backgrounds** — 6 cards in a feature grid. Each ~600×400 with one accent illustration per card (icon-driven, not screenshot-driven).
3. **OG / social share image** — 1200×630. Critical for LinkedIn + Twitter previews.
4. **Footer CTA banner** — full-width 1920×400 "Start prospecting" / "Book a demo".

---

## Brand system

- **Primary background:** LIT navy `#020617` (slate-950). Used for the dark hero, feature card frames, and CTA banner.
- **Accent / "neon":** Electric cyan `#00E0FF` (used in the app's Pulse mark + EKG waveform). Use for hairlines, eyebrows, key highlights, the pulse waveform motif, and the cyan KPI emphasis numbers.
- **Marketing-site cyan token:** `#00F0FF` (Tailwind `brand.cyan`). **Note:** the app uses `#00E0FF` and marketing uses `#00F0FF`. For banner art, **use `#00E0FF`** (the app's value) so banners visually match the in-product experience. The marketing token can be updated to match in a follow-up.
- **Secondary blue:** `#3b82f6` (Tailwind blue-500). For chart bars + secondary fills.
- **Surfaces:** Off-white `#F8FAFC` (slate-50) for the lighter banner variant; pure white `#FFFFFF` for floating cards over dark backgrounds.
- **Type:** Space Grotesk (display) for headlines, Inter (UI) for body. Display weight 600–700 for H1s; body 400.
- **Pulse mark:** `public/pulse-icon-master.svg` (rounded-square navy bg + neon-cyan EKG waveform + dot). The EKG waveform is the brand motif — incorporate it into hero art as a horizontal pulse line crossing the composition. **Add this SVG to `marketing/public/` — it currently only exists in `frontend/public/`.**

---

## Key features to communicate (in priority order)

These are the features the banners must convey. **The hero should evoke #1 and #2; the feature-grid cards each get one of #3–#8.**

### 1. Map-first sales intelligence (HERO)
What it is: A live US map showing 78K+ shipper accounts as colored bubbles, with heat-map and region-cluster modes. Pan, zoom, and the bubbles re-cluster.
Visual cues: A stylized US silhouette filled with cyan-and-blue dot clusters of varying size, denser around major ports (LA/Long Beach, Houston, Savannah, Newark, Seattle). Soft glow on dense regions. The Pulse EKG waveform threads horizontally across the map.

### 2. Opportunity scoring built for freight sales (HERO supporting element)
What it is: Every account is scored 0–100 on four sales angles — **Consolidation**, **Vulnerable incumbent**, **High-velocity**, **Defend & grow**. Sales reps prioritize by score.
Visual cues: Four floating pill-chips with score numbers next to the map ("Vulnerable 87", "Consolidation 72", "Velocity 64", "Defend 58"). Each chip uses the score's semantic color: vulnerable=red-50, consolidation=amber, velocity=emerald, defend=cyan.

### 3. Pulse Coach — AI grounded in your map view (CARD)
What it is: Chat panel inside the Explorer. Ask "which accounts here are most vulnerable to switching carriers?" and the coach answers using ONLY the current filtered view's data.
Visual cues: A chat bubble UI floating over a faded map background, with a question in cyan and a markdown-formatted answer below. Sparkle icon for the AI cue. Avoid generic "chatbot avatar" iconography — this is a freight analyst, not a chatbot.

### 4. Branded PDF reports — download or email (CARD)
What it is: Every coach answer can be exported as a branded PDF (LIT navy header, neon cyan accent, KPI table, top accounts). One-click download or email-to-recipient via Resend.
Visual cues: A stylized PDF mock with the LIT pulse mark in the header, a KPI table, and a "send to email" arrow. Optional: show the PDF being rendered live with a download cursor + an email envelope.

### 5. Natural-language search that understands freight (CARD)
What it is: Type "automotive companies in the west coast and southeast above 5000 TEU" — the parser extracts industry + multi-region + size filters and runs the query.
Visual cues: A search bar with a parsed query, the extracted filter chips appearing below it ("Manufacturing", "Region: West Coast", "Region: Southeast", "TEU > 5000"). Show the chip-extraction motion with a subtle arrow.

### 6. Lasso + Select-in-view + Saved map views (CARD)
What it is: Drag a rectangle over the map to select every account in that region. Or "Select all in view" by viewport. Save the entire map state (filters + zoom + color + size mode) as a named view to revisit later.
Visual cues: A cyan dashed rectangle being drawn over a cluster of map dots. Or a "Saved Views" library card showing 3 named views ("West Coast Apparel Importers", "Southeast Vulnerable", "Top 100 Q4").

### 7. Mobile-first responsive (CARD)
What it is: Same map intel on a phone — tool panels become bottom sheets, account list becomes a card stack.
Visual cues: A phone silhouette with a map fragment + a bottom-sheet panel sliding up from below. Show the panel handle (small rounded rectangle) at the top of the sheet.

### 8. Saved Command Center contacts merged in (CARD)
What it is: When a company is in your CRM, its DCS consignee contact (email + phone) shows directly in the Explorer's QuickCard — no clicking through to the Command Center.
Visual cues: A floating QuickCard with a "Contact" section showing a mailto + tel link with the cyan accent. Subtle "synced from Command Center" badge.

---

## Hero composition (more detail)

The hero banner is the most important asset — it sells the entire page. Design intent:

**Headline (right-aligned text block, left half of canvas):**
> Map every shipper. Score every opportunity. Brief every account in seconds.

(Alternate, shorter: **"Sales intelligence on a map."** — use whichever the design supports.)

**Subhead:**
> Pulse Explorer turns 12 months of US import data into a live map of accounts, scored for the sales angle that actually fits — consolidation, vulnerability, velocity, defend.

**CTAs:** "Start free trial" (primary, cyan-filled button) + "Book a demo" (secondary, outlined).

**Visual (right half of canvas):**
A stylized US map (top-down or slight 15° axonometric) covered in cyan/blue bubble clusters. Heaviest density at Los Angeles, Long Beach, Houston, Savannah, Newark, Seattle, Miami. Soft cyan glow under the densest clusters. The Pulse EKG waveform threads through the composition horizontally, peaking over the most active region. Four opportunity-score chips float around the map's edges (vulnerable 87, consolidation 72, velocity 64, defend 58) with thin connecting lines pointing to specific clusters.

**Background treatment:** Deep navy `#020617`. Subtle grid lines in `#0F1828` (slate-900 with low opacity). Optional faint radial gradient from upper-right (cyan glow) suggesting depth without being aggressive.

**Do NOT include:**
- Generic "AI" iconography (no neural-net brain diagrams, no robot icons).
- Stock-photo logistics imagery (no cargo ships, no warehouses, no shipping containers).
- Generic dashboard mocks. The hero leads with the map, not a screenshot.
- The DSV brand or any DSV-derived language.

---

## Feature-grid card layout

6 cards in a 3×2 grid on desktop, 2×3 on tablet, 1×6 on mobile. Each card:
- ~600×400 desktop, ~340×320 mobile
- Dark navy background `#020617` with a 1px cyan hairline border `#00E0FF` at 20% opacity
- Eyebrow line at top in cyan (`#00E0FF`, 11px, uppercase tracked) — name of the feature
- Headline below in white (Space Grotesk 600, ~22px)
- Body copy in slate-300 (~14px, 2–3 lines)
- Small illustrative element bottom-right (~40% of card area) — see per-card visual cues in the feature list above

Cards 3, 4, 5, 6, 7, 8 map to the feature list above (one per card).

---

## OG / social share image (1200×630)

Must work as a thumbnail at 600×315 in a LinkedIn feed. Simplify the hero:
- Left half: LIT navy with the Pulse mark + "Pulse Explorer" wordmark + tagline ("Sales intelligence on a map") below
- Right half: a tight crop of the US map covered in bubble clusters with the EKG waveform threading through
- Bottom-right corner: "LIT · logisticintel.com" in cyan, small

No additional copy — must read at a glance.

---

## Footer CTA banner (1920×400)

Edge-to-edge LIT navy. Center-aligned:
- Headline: **"Stop searching. Start finding."** (Space Grotesk 700, white, ~64px)
- Subhead: "78K US importers, scored and mapped." (slate-300, ~20px)
- CTA pair: "Start free trial" (cyan) + "Book a demo" (outlined cyan)
- Subtle EKG waveform animation traveling across the bottom 30% of the banner

---

## Constraints

- All artwork must export both as SVG (preferred for hero/cards) AND as 1× + 2× PNG fallbacks.
- Total banner asset payload (post-optimization) under 800 KB to keep the page in Lighthouse Performance 90+.
- Color contrast: white headlines on `#020617` clear AA. Cyan on navy needs at least 4.5:1 — check `#00E0FF` against `#020617` (it passes, but verify any tints used for body text).
- No animations on first paint — animations are progressive enhancement (EKG waveform pulse, score-chip count-up) and must not block LCP.
- Mobile hero must work without the side-by-side composition — stack the headline above a tighter map crop.

---

## Deliverables checklist

- [ ] Hero banner (desktop SVG + mobile SVG + 1×/2× PNG fallbacks)
- [ ] 6 feature-card backgrounds (SVG each)
- [ ] OG / social share image (1200×630 PNG + 2x retina)
- [ ] Footer CTA banner (SVG)
- [ ] Pulse mark adapted for marketing (copy from `frontend/public/pulse-icon-master.svg` into `marketing/public/`)
- [ ] Color-token Figma swatch confirming the `#00E0FF` vs `#00F0FF` resolution
- [ ] Lighthouse spot-check on a built version with banners loaded — must hit 90+ Performance

---

## Out of scope (for this brief)

- Full page IA / copy. That's covered in the `/pulse` rebrand spec (separate brainstorming flow).
- Banner copy variants beyond the headlines above. Copy lives in the page itself.
- Solving the `#00E0FF` vs `#00F0FF` token mismatch globally. For now: banner art uses `#00E0FF` (app value).
