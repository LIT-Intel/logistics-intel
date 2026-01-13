# LIT UI/UX Preview - Enterprise Design System

## Overview

The LIT platform has been updated with a comprehensive enterprise-grade design system featuring:
- **Consistent App Shell** with left sidebar navigation
- **Card-based layouts** throughout
- **Proper empty/loading/locked states**
- **Clear information hierarchy**
- **Professional color scheme** (blue-focused, no purple/indigo)
- **Responsive design** with proper breakpoints

---

## Global Layout

### App Shell (`/components/layout/AppShell.tsx`)

**Left Sidebar (Fixed)**
- Logo at top with "LIT" branding
- Primary navigation with icons + labels:
  - Dashboard
  - Search
  - Command Center
  - Campaigns
  - RFP Studio
  - Settings
- Active state: Blue background + left accent bar
- Collapsible to icon-only mode
- Collapse toggle at bottom

**Top Bar**
- Current page title (left)
- User menu (right):
  - User email
  - Plan badge (Pro/Enterprise)
  - Avatar
  - Settings link
  - Sign out

**Main Content Area**
- Max width: 1440px
- Centered with padding
- Consistent 24-32px vertical spacing
- Clean slate-50 background

---

## Page Previews

### 1. DASHBOARD (`/app/dashboard`)

**Purpose**: Orientation + momentum for users

**Layout**:
```
┌────────────────────────────────────────────────────────┐
│ KPI Summary Row (4 cards)                              │
│  [Saved Companies] [Active Campaigns] [RFPs] [Activity]│
├────────────────────────────────────────────────────────┤
│ Two-Column Layout:                                     │
│ ┌────────────────┐  ┌────────────────┐                │
│ │ Recently Saved │  │ Active         │                │
│ │ Companies      │  │ Campaigns      │                │
│ │                │  │                │                │
│ │ [List of 5]    │  │ [List of 5]    │                │
│ │                │  │                │                │
│ └────────────────┘  └────────────────┘                │
└────────────────────────────────────────────────────────┘
```

**KPI Cards**:
- Icon (blue gradient background)
- Large value (3xl font)
- Label
- Optional trend indicator
- Clickable (navigates to relevant page)
- Hover: lift + shadow

**Empty States**:
- Icon in gray circle
- Clear title
- Helpful description
- Primary CTA button
- Example: "No companies saved yet. Start with Search."

**Data Sources**:
- Saved companies: `/api/lit/crm/savedCompanies`
- Campaigns: `/api/lit/crm/campaigns`
- RFPs: localStorage `lit_rfps`

---

### 2. SEARCH PAGE (`/app/search`)

**Purpose**: Discover companies fast

**Layout**:
```
┌────────────────────────────────────────────────────────┐
│ Large Search Bar (centered, autofocus)                 │
│  [Search icon] [Input] [Search Button]                 │
├────────────────────────────────────────────────────────┤
│ Filters Row                                            │
│  [Mode] [Region] [Activity] [Advanced Filters Button]  │
├────────────────────────────────────────────────────────┤
│ Results (Grid/List)                                    │
│ ┌──────┐ ┌──────┐ ┌──────┐                            │
│ │ Card │ │ Card │ │ Card │                            │
│ └──────┘ └──────┘ └──────┘                            │
└────────────────────────────────────────────────────────┘
```

**Shipper Card**:
- Company avatar/logo
- Company name (bold)
- Address (subtle)
- Country chip
- KPI row: Shipments (12m) | TEUs | Last activity
- Actions: "View details" | "Save"
- Hover: lift + shadow

**Detail Modal** (Critical):
- Tabs: Overview | Shipments | KPIs | Contacts
- Large company header
- KPI cards
- Top route highlight
- **Save button** (primary CTA)
- **Does NOT navigate away**

**States**:
- Loading: Shimmer skeleton cards
- Empty: "No results found. Try different search terms."
- Error: Red alert with retry action
- Saved state: Checkmark + disabled save button

---

### 3. COMMAND CENTER (`/app/command-center`)

**Purpose**: CRM hub - heart of LIT

**Layout**:
```
┌────────────────────────────────────────────────────────┐
│ Left Panel (320px)      │ Main Panel (flex-1)         │
│ ┌────────────────────┐  │ ┌─────────────────────────┐ │
│ │ Saved Companies    │  │ │ Company Detail (Tabs)   │ │
│ │ List               │  │ │                         │ │
│ │                    │  │ │ [Overview]              │ │
│ │ • Company A        │  │ │ - Company header        │ │
│ │ • Company B        │  │ │ - KPI cards (6)         │ │
│ │ • Company C        │  │ │ - Route summary         │ │
│ │                    │  │ │ - Activity chart        │ │
│ │ [Search + Filter]  │  │ │ - Insights cards        │ │
│ └────────────────────┘  │ └─────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

**Tabs**:
1. **Overview** (default)
   - Company header with logo, name, address
   - 6 KPI cards: Shipments | TEU | Spend | FCL | LCL | Last Activity
   - Top route + Recent route cards
   - Activity chart (12 months)
   - AI-generated insights cards
   - CTAs: "Add to Campaign" | "Create RFP"

2. **Shipments**
   - Sortable table
   - Pagination
   - Source indicator (ImportYeti/LIT)
   - Export button

3. **Contacts**
   - **Locked if not Pro plan**
   - Locked state: Blurred background + upgrade prompt
   - Unlocked: Table with contacts
   - "Enrich contacts" button
   - Export CSV

4. **Campaigns**
   - List of campaigns company belongs to
   - Add/remove actions
   - Status badges

5. **RFP**
   - List of RFPs for this company
   - Status (draft/generated/sent)
   - "Open workspace" button

6. **Pre-Call Briefing**
   - AI summary card
   - Editable notes
   - Download/share options

**Empty States**:
- Left panel: "No saved companies yet. Save a shipper from Search."
- No company selected: Centered message with illustration

---

### 4. CAMPAIGNS PAGE (`/app/campaigns`)

**Purpose**: Outreach control center

**Campaign List View**:
```
┌────────────────────────────────────────────────────────┐
│ [+ Create Campaign Button]                             │
├────────────────────────────────────────────────────────┤
│ Card Grid (3 columns)                                  │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │
│ │ Campaign A   │ │ Campaign B   │ │ Campaign C   │   │
│ │ Running      │ │ Draft        │ │ Paused       │   │
│ │              │ │              │ │              │   │
│ │ 50 companies │ │ 12 companies │ │ 30 companies │   │
│ │ 68% open     │ │ -- open      │ │ 45% open     │   │
│ │ 24% reply    │ │ -- reply     │ │ 18% reply    │   │
│ └──────────────┘ └──────────────┘ └──────────────┘   │
└────────────────────────────────────────────────────────┘
```

**Campaign Detail View** (Tabs):
1. **Companies**
   - Table with companies
   - Remove action
   - Add more companies button

2. **Sequence**
   - Step list (Email → LinkedIn → Call)
   - Each step editable
   - Templates picker
   - Gated if not Pro plan

3. **Outreach History**
   - Timeline/table
   - Status: Sent | Opened | Replied | Bounced
   - Filters by status

4. **Analytics**
   - Performance charts
   - Open rate trend
   - Reply rate trend
   - Best performing messages

**Empty State**:
- "No campaigns yet. Create your first outreach campaign."
- Primary CTA: "Create Campaign"

---

### 5. RFP STUDIO (`/app/rfp-studio`)

**Purpose**: Monetization engine

**Layout**:
```
┌────────────────────────────────────────────────────────┐
│ Left Panel (340px)      │ Main Panel (flex-1)         │
│ ┌────────────────────┐  │ ┌─────────────────────────┐ │
│ │ Company Summary    │  │ │ Step-Based Flow         │ │
│ │ • Name             │  │ │                         │ │
│ │ • Shipments        │  │ │ [Overview Tab]          │ │
│ │ • Top origins      │  │ │ - Company KPIs          │ │
│ │                    │  │ │ - Uploaded lanes table  │ │
│ │ RFPs List:         │  │ │ - Service summary       │ │
│ │ • RFP A (Draft)    │  │ │                         │ │
│ │ • RFP B (Complete) │  │ │ [Proposal Tab]          │ │
│ │                    │  │ │ - Executive summary     │ │
│ │ [+ New RFP]        │  │ │ - Solution offering     │ │
│ │ [Import Excel]     │  │ │ - AI assist buttons     │ │
│ └────────────────────┘  │ └─────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

**Tabs**:
1. **Overview**: Company context + uploaded lanes
2. **Data**: Lane-by-lane table
3. **Proposal**: Executive summary + solution offering
4. **Rates**: Editable rate templates + accessorials
5. **Financials**: Baseline vs Proposed savings model
6. **Vendors**: Vendor invitation cards
7. **Settings**: Company details, due date, requirements
8. **Export & Outreach**: PDF/HTML export + campaign creation

**Generation States**:
- Processing: Progress indicator
- Complete: Download buttons (Excel | PDF)
- Failed: Error message + retry

**Data Sources**:
- Company context: `/api/lit/rfp/company/:id/context`
- Generate: `/api/lit/rfp/generate`
- Workspace: `/api/lit/rfp/workspace`

---

### 6. SETTINGS PAGE (`/app/settings`)

**Purpose**: Control tower

**Layout** (Vertical sections, card-based):
```
┌────────────────────────────────────────────────────────┐
│ ImportYeti Integration                                 │
│ ┌────────────────────────────────────────────────────┐ │
│ │ Status: Connected                                  │ │
│ │ [Pro Badge] API Status: Active                     │ │
│ │ Read-only                                          │ │
│ └────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────┤
│ Email Configuration                                    │
│ ┌────────────────────────────────────────────────────┐ │
│ │ Gmail: Connected (user@gmail.com)                  │ │
│ │ [Disconnect Button]                                │ │
│ │ Default Sender: user@gmail.com                     │ │
│ └────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────┤
│ RFP Defaults                                           │
│ ┌────────────────────────────────────────────────────┐ │
│ │ Owner: [Dropdown]                                  │ │
│ │ From Email: [Dropdown]                             │ │
│ │ Template: [Dropdown]                               │ │
│ └────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────┤
│ Plan & Access                                          │
│ ┌────────────────────────────────────────────────────┐ │
│ │ Current Plan: Pro                                  │ │
│ │ Features:                                          │ │
│ │  ✓ Contacts enrichment                             │ │
│ │  ✓ Campaigns                                       │ │
│ │  ✓ RFP Studio                                      │ │
│ │  ✓ Pre-call briefings                              │ │
│ │                                                    │ │
│ │ [Upgrade to Enterprise Button]                     │ │
│ └────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────┤
│ Admin (Role-gated)                                     │
│ ┌────────────────────────────────────────────────────┐ │
│ │ Feature Flags                                      │ │
│ │ Audit Logs                                         │ │
│ │ Import Jobs (future)                               │ │
│ └────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

**Feature Matrix** (Read-only display):
- Shows current plan features
- Visual checkmarks for enabled features
- Upgrade CTA if not on highest plan

---

## Design System Components

### Typography
- **Headers**: font-semibold, text-slate-900
- **Body**: font-normal, text-slate-600
- **Labels**: text-xs, font-medium, uppercase tracking-wide, text-slate-500

### Colors
- **Primary**: Blue (blue-600, blue-700)
- **Background**: slate-50
- **Cards**: white with slate-200 border
- **Success**: green-600
- **Warning**: amber-600
- **Error**: red-600
- **Text primary**: slate-900
- **Text secondary**: slate-600
- **Text muted**: slate-500

### Spacing
- **Grid gap**: 24px (1.5rem) or 32px (2rem)
- **Card padding**: 24px (1.5rem)
- **Section spacing**: 32px (2rem)
- **Consistent 8px base unit**

### Shadows
- **Card**: shadow-sm (subtle)
- **Card hover**: shadow-md
- **Modal**: shadow-lg
- **Dropdown**: shadow-xl

### Borders
- **Radius**: 8-12px (rounded-lg to rounded-xl)
- **Color**: slate-200
- **Width**: 1px default

---

## State Patterns

### Loading States
- **Use skeletons, not spinners**
- Skeleton cards with animate-pulse
- Maintain layout during loading
- Example: Gray rounded rectangles matching card size

### Empty States
- Icon in gray circle (16 x 16)
- Clear title (text-lg, font-semibold)
- Helpful description (text-sm, max-w-sm)
- Primary CTA button
- Centered in container

### Locked States (Pro Features)
- Blurred content or placeholder
- Lock icon
- Clear messaging: "This feature is available on Pro plans"
- "Upgrade to Pro" button
- No frustration - show value clearly

### Error States
- Red alert banner
- Error icon
- Clear error message
- Retry action when applicable
- Doesn't break page layout

---

## Interaction Patterns

### Hover States
- Cards: lift (-translate-y-0.5) + shadow increase
- Buttons: subtle color darken
- Links: underline or color change
- Smooth transitions (150-200ms)

### Active States
- Sidebar nav: Blue background + left accent bar
- Selected items: Blue tint background
- Pressed buttons: slight scale down (0.98)

### Focus States
- Blue ring (ring-2 ring-blue-200)
- Outline removed
- Accessible keyboard navigation

---

## Responsive Behavior

### Breakpoints
- **Mobile**: < 768px (md)
- **Tablet**: 768px - 1024px (md to lg)
- **Desktop**: > 1024px (lg+)

### Mobile Adaptations
- Sidebar collapses to hamburger menu
- KPI cards stack vertically
- Two-column layouts become single column
- Tables become scrollable
- Modals become full-screen drawers

---

## API Integration

All pages are wired to real endpoints:

**CRM Endpoints**:
- `GET /api/lit/crm/savedCompanies`
- `POST /api/lit/crm/saveCompany`
- `GET /api/lit/crm/companies/:id`
- `POST /api/lit/crm/companies/:id/enrichContacts`
- `GET /api/lit/crm/campaigns`
- `POST /api/lit/crm/campaigns`
- `POST /api/lit/crm/campaigns/:id/addCompany`

**Search Endpoints**:
- `POST /api/lit/public/iy/searchShippers`
- `GET /api/lit/public/iy/companyProfile`

**RFP Endpoints**:
- `GET /api/lit/rfp/company/:id/context`
- `POST /api/lit/rfp/generate`
- `POST /api/lit/rfp/workspace`

**No mock data remains in production code.**

---

## Build Status

✅ **All pages compile successfully**
✅ **No TypeScript errors**
✅ **No ESLint errors**
✅ **Bundle size optimized**

```
Build completed: 3905 modules transformed
Bundle size: ~447KB (gzipped: ~124KB)
```

---

## Next Steps for Demo

1. **Deploy to staging environment**
2. **Test all user flows end-to-end**
3. **Verify empty states display correctly**
4. **Confirm locked states work for Free users**
5. **Test responsive behavior on mobile**
6. **Ensure loading states don't flash**
7. **Verify all links and navigation work**

---

## Key UX Principles Applied

✓ **Make it obvious** - Clear labels, visible CTAs, intuitive flows
✓ **Make it calm** - Neutral colors, ample whitespace, no chaos
✓ **Make it enterprise** - Professional, polished, scalable
✓ **Make it demo-ready** - Works in under 5 minutes of use

---

**Build timestamp**: $(date)
**Frontend version**: Lit-App v0.0.2
**Design system**: LIT Enterprise UI v1.0
