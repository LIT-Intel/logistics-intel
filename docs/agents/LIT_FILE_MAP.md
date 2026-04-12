# LIT FILE MAP

## Purpose
This file maps the critical files, folders, and systems in the LIT codebase.
All agents should consult this before making changes to avoid duplicate work, wrong paths, and stale assumptions.

---

## Frontend App Structure

### Auth
- `src/auth/AuthProvider.jsx`
- `src/auth/supabaseAuthClient.ts`
- `src/lib/supabase.ts`

### Core App Pages
- `src/pages/Dashboard.jsx` or equivalent dashboard root
- `src/pages/Search.jsx` or equivalent search/import-export intelligence page
- `src/pages/LeadProspecting.jsx` or Pulse page
- `src/pages/SettingsPage.jsx`
- `src/pages/Billing.jsx` or equivalent billing page
- `src/pages/AdminDashboard.jsx`
- `src/pages/AcceptInvitePage.jsx`
- any auth callback routes

### API / Frontend Data Layer
- `src/api/functions.js`
- `src/api/pulse.js`
- `src/lib/api.ts` or equivalent legacy/shared API helper
- any entity adapters such as:
  - `@/api/entities`
  - company/contact helpers
  - save/import helpers

### Routing / Guards
- route config file(s)
- any `ProtectedRoute`, `AdminRoute`, layout guard, or sidebar permission file
- sidebar/nav rendering file
- page lazy imports

### Shared UI Components
- dashboard card components
- table/list components
- nav/sidebar components
- buttons, pills, badges, filters, modals

---

## Supabase Edge Functions

### Current / expected functions
- `supabase/functions/searchLeads/index.ts`
- billing / Stripe functions
- invite / org management functions
- enrichment / search helpers
- any admin backend utilities

### Important note
No frontend file should reference an Edge Function that does not actually exist.

---

## Billing / Stripe Layer

### Frontend
- billing page component
- checkout creation helper
- portal session helper

### Backend
- checkout Edge Function
- billing portal Edge Function
- Stripe webhook handler

---

## Database / Schema / SQL

### Migration folders
- Supabase migrations directory
- any SQL seed files
- policy files if separated

### Critical table groups
- organizations
- org_members
- subscriptions
- usage_events
- plan_entitlements
- affiliates
- affiliate_payouts
- audit_logs
- auth-linked profile or user tables

---

## Website (future / separate app)

### Planned stack
- Next.js
- Vercel
- Sanity CMS

### Planned directories
- `/website` or separate repo
- homepage
- product pages
- solutions pages
- pricing
- resources
- integrations
- CMS schemas

---

## File Ownership Guidance

### Auth / Access / Billing / Admin Agent
Primary files:
- auth provider
- login/signup/invite files
- billing page
- admin dashboard
- Stripe-related helpers
- route/admin gating files

### Backend / Edge Functions / Integrations Agent
Primary files:
- Supabase Edge Functions
- API integration helpers
- provider orchestration code
- usage logging code

### Data / Schema / Supabase Agent
Primary files:
- migrations
- schema docs
- views
- RLS policies

### App Frontend Agent
Primary files:
- page components
- shared UI
- layout
- responsive behavior
- page-level data rendering

### QA / Release / Debug Agent
Primary references:
- routes
- runtime logs
- deployment config
- screenshots
- reproducible scenarios

### Website / GTM / SEO Agent
Primary files:
- website app
- CMS config
- content models
- SEO metadata handling

---

## Notes
- Update this map when new critical files are added
- If multiple similar files exist, mark which one is live / canonical
- If a legacy file is no longer used, mark it explicitly as legacy
