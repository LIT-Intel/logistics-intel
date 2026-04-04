# LIT × Apex/TailAdmin — Design Integration Assessment

**Date:** 2026-04-03  
**Branch:** `claude/audit-and-repair-Tz7gJ`  
**Scope:** Settings, Billing, User Profile, User Management pages only (Search + Command Center untouched)

---

## 1. Current LIT Design Inventory

### Sidebar (AppShell.jsx — live)
- Background: `bg-gradient-to-b from-slate-800 via-slate-700 to-slate-900`
- Active state: `bg-white/10 text-white`
- Inactive: `text-gray-300 hover:bg-white/5`
- Width: `w-64` (expanded) / `w-16` (collapsed)
- Logo: blue gradient `from-blue-600 to-blue-700` rounded badge
- **NON-NEGOTIABLE — keep this exactly**

### Top Header (AppShell.jsx)
- `bg-white/80 backdrop-blur-sm border-b border-gray-200 h-14`
- Search input, notification bell, user avatar

### Page Cards (SettingsSections.tsx — existing polished)
- `rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm ring-1 ring-black/[0.02]`
- Already matches TailAdmin card style closely

### Inputs
- `rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm`
- Focus: `focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100`

### Buttons
- Primary: `rounded-full bg-slate-900 px-6 py-2 text-sm font-semibold text-white`
- Secondary: `rounded-full border border-slate-200 px-6 py-2 text-sm`

### Labels / Section Headers
- `text-xs font-semibold uppercase tracking-[0.35em] text-slate-400`

### KPI Cards (SettingsPrimitives.tsx)
- Stat cards with icon, number, label, trend

### Toggle
- `h-6 w-11` pill with indigo-500 active state

---

## 2. Apex/TailAdmin Design Patterns to Adopt

### What LIT is MISSING vs Apex:

| Feature | Apex Pattern | LIT Current | Gap |
|---------|-------------|-------------|-----|
| Profile hero | Cover image + avatar overlap + name | Basic profile card | Missing cover photo zone, avatar upload |
| Stats banner | 4-stat bar under profile hero | Separate KPI cards | Should merge into cohesive hero unit |
| Breadcrumb | `Home / Settings / Profile` | Section title only | Missing breadcrumbs |
| Table rows | `hover:bg-slate-50` with avatar cells | Flat tables | Missing hover states, avatar chips |
| Status badges | Colored pill `bg-green-100 text-green-700` | Basic pills | Need semantic color coding |
| Empty states | Illustrated empty states | Hidden | Need empty state patterns |
| Tab navigation | Underline tabs (not sidebar) | Sidebar sections | Should use tabs on narrow pages |
| Plan cards | Tiered pricing cards with feature list | Flat list | Need pricing comparison card layout |
| Danger zone | Red-tinted danger section at bottom | None | Need danger/destructive section |
| File upload | Drag-drop zone with preview | None | Need avatar + logo upload |
| User table | Avatar + name + role + status + actions | Email-only rows | Need full user table design |

### What LIT ALREADY HAS (no change needed):
- `rounded-3xl` cards ✓
- Subtle ring shadows ✓  
- `tracking-[0.35em]` labels ✓
- `rounded-2xl` inputs ✓
- `rounded-full` buttons ✓
- Toggle components ✓

---

## 3. Page-by-Page Change Plan

### 3A. User Profile (Settings > Profile section)
**Changes:**
1. Add cover photo strip at top (slate-900 gradient default, uploadable)
2. Avatar: larger (20×20), circle, with upload overlay button
3. Hero name + role displayed below avatar (not inside card)
4. Stats bar: Saved Companies, Campaigns, RFPs count
5. Form grid: 2-col for name/title, phone/location; 1-col for bio
6. Add "Danger Zone" card at bottom (delete account, data export)
**APIs unchanged:** same Supabase `profiles` read/write

### 3B. Settings Layout
**Changes:**
1. Replace sidebar navigation with **horizontal tab bar** at top of content area
   - Keep `SettingsLayout.tsx` sidebar as a separate mobile variant
2. Add breadcrumb: `Settings / Profile`
3. Section intro: Icon + Pill + H2 pattern (already exists, keep)
4. Consistent save button placement: bottom of each section card
**APIs unchanged:** same Supabase saves

### 3C. Billing & Plans
**Changes:**
1. Plan comparison cards: 3-column grid (free/standard/growth), active plan highlighted with `ring-2 ring-slate-900`
2. Current subscription banner at top: plan name + price + renewal date + status badge
3. Payment method card: card type icon + last 4 + expiry
4. Invoice history: real table (previously hardcoded dummy rows, now "Manage in Stripe" CTA)
5. Upgrade CTA: larger, more prominent
**APIs unchanged:** same `loadBillingPlans()` + `loadSubscription()` + Stripe portal

### 3D. User Management / Team
**Changes:**
1. Team member table: avatar chip + name + email + role badge + status badge + actions
2. Role selector: dropdown replacing plain radio
3. Pending invites section with resend/cancel
4. Seat usage indicator: `X / Y seats used` progress bar
**APIs unchanged:** same `org_members` Supabase query

### 3E. Access & Roles (Admin only)
**Changes:**
1. Role definition cards (not just labels): each role has icon + name + permissions list
2. Admin section gated behind `isAdmin` check (same as today)
**APIs unchanged**

---

## 4. Mockup Files

| File | Page |
|------|------|
| `settings-profile.html` | Profile section with cover photo, avatar upload, stats bar |
| `billing.html` | Billing/subscriptions with plan cards, current plan banner, invoice table |
| `user-management.html` | Team management with user table, invite flow, seat usage |
| `settings-overview.html` | Full settings layout with tab navigation and all sections |

Open any `.html` file directly in a browser — they use Tailwind CDN and are fully self-contained.

---

## 5. Implementation Phases (After Mockup Approval)

### Phase 1 (Safe — layout/style only)
- `AppShell.tsx`: collapse animation, active state refinement, user menu
- `SettingsSections.tsx ProfileSection`: add cover photo strip + avatar upload UI + stats bar
- No API changes

### Phase 2 (Medium)
- `SettingsPage.tsx` billing tab: plan comparison cards, subscription banner
- Team section: user table with avatar chips + role badges
- No API changes

### Phase 3 (Polish)
- Breadcrumbs across all settings pages
- Empty states for team, billing history
- Danger zone section in Profile
- No API changes

### Phase 4 (Last — touch Search/Command Center UI only)
- Visual card refresh on Search results (not logic)
- Command Center header/filter bar polish (not logic)

---

## 6. Non-Negotiables Checklist

- [x] Sidebar gradient `from-slate-800 via-slate-700 to-slate-900` — kept
- [x] LIT menu names (Dashboard, Search, Command Center, Campaigns, RFP Studio, Settings) — kept
- [x] Search page functionality — untouched until Phase 4 visual-only
- [x] Command Center functionality — untouched until Phase 4 visual-only
- [x] Supabase API calls — no changes to queries or auth
- [x] Stripe checkout/portal flows — no changes
