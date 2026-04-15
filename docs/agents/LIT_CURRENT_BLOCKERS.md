# LIT CURRENT BLOCKERS

## Purpose
This file tracks the live blockers preventing LIT from being launch-ready.
It should be updated daily by Control Tower and referenced by all specialist agents.

---

## Severity Levels
- P0 = launch blocker
- P1 = critical but not total blocker
- P2 = important, can proceed in parallel
- P3 = cleanup / polish

---

## Active Blockers

### B-001
**Severity:** P0  
**Title:** Billing page does not match Stripe  
**Owner:** Auth / Access / Billing / Admin  
**Status:** Open  

**Problem:**  
The billing page and plan logic do not reliably reflect real Stripe products, prices, or current subscription state.

**Impact:**  
- Users may see wrong pricing or plan state
- Feature limits cannot be trusted
- Entitlements are not commercially safe

**Needed to resolve:**  
- audit Stripe products and price ids
- define normalized subscriptions model in Supabase
- wire or fix Stripe webhook sync
- update billing page to use real plan state

**Dependencies:**  
- schema audit
- Stripe account mapping
- webhook implementation

---

### B-002
**Severity:** P0  
**Title:** Feature gating is not reliably enforced  
**Owner:** Auth / Access / Billing / Admin  
**Status:** Open  

**Problem:**  
Pages and premium actions are not consistently limited by subscription or usage.

**Impact:**  
- users can access features beyond plan
- API costs can spike
- billing model is not enforceable

**Needed to resolve:**  
- build plan entitlements model
- add shared entitlement helpers
- enforce route-level and action-level gating
- track remaining credits and usage

**Dependencies:**  
- billing truth
- subscriptions sync
- usage schema

---

### B-003
**Severity:** P0  
**Title:** Admin Dashboard depends on unstable or missing backend assumptions  
**Owner:** Auth / Access / Billing / Admin  
**Status:** Open  

**Problem:**  
Admin dashboard has depended on missing or mismatched backend expectations and is not yet a reliable control center.

**Impact:**  
- cannot manage users, orgs, billing, or subscriptions safely
- no centralized business control layer
- blocks launch operations

**Needed to resolve:**  
- remove fake dependencies
- point dashboard to real Supabase data or real backend endpoints
- split org-admin and superadmin surfaces cleanly
- ensure all critical tabs load with real data

**Dependencies:**  
- schema audit
- access model stabilization
- billing truth layer

---

### B-004
**Severity:** P0  
**Title:** Pulse search accuracy and cost control are not stable  
**Owner:** Backend / Edge Functions / Integrations  
**Status:** Open  

**Problem:**  
Pulse can return loose results, misread queries, and consume too many credits.

**Impact:**  
- low result trust
- expensive API burn
- weak conversion to value

**Needed to resolve:**  
- implement match-first logic where applicable
- tighten classification and filter derivation
- hard-limit page size and enrich lazily
- align result rendering to real provider fields

**Dependencies:**  
- provider contract review
- usage logging
- frontend rendering cleanup

---

### B-005
**Severity:** P1  
**Title:** Signup / invite / redirect flow still needs stabilization  
**Owner:** Auth / Access / Billing / Admin  
**Status:** Open  

**Problem:**  
Signup flow has shown redirect/runtime issues and still needs final validation.

**Impact:**  
- onboarding trust risk
- admin and invited user setup can fail or feel broken

**Needed to resolve:**  
- validate signup end-to-end
- validate invite acceptance end-to-end
- confirm redirect behavior for new users and org members
- ensure dashboard load path is stable after registration

**Dependencies:**  
- auth route audit
- QA test matrix

---

### B-006
**Severity:** P1  
**Title:** App UI consistency is not fully aligned to dashboard source-of-truth  
**Owner:** App Frontend  
**Status:** Open  

**Problem:**  
Some pages still drift visually from the dashboard design system.

**Impact:**  
- platform feels inconsistent
- weaker trust and polish

**Needed to resolve:**  
- audit all pages
- normalize cards, tables, spacing, buttons, typography, empty states, responsive behavior
- use dashboard visual language as source of truth

**Dependencies:**  
- frontend audit
- stable backend data contracts

---

### B-007
**Severity:** P1  
**Title:** Website architecture and CMS are not yet built  
**Owner:** Website / GTM / SEO  
**Status:** Planned  

**Problem:**  
Marketing site, CMS structure, and SEO engine are not implemented.

**Impact:**  
- no scalable acquisition engine
- no long-term content growth system

**Needed to resolve:**  
- finalize site architecture
- build Next.js + Sanity foundation
- implement SEO-ready content types
- prepare AI-assisted content ops

**Dependencies:**  
- positioning lock
- website design direction
- CMS schema

---

## Decision Log
Use this section for blocker-level decisions only.

- [ ] No decisions logged yet

---

## Resolved Blockers
Move resolved items here with date and resolution summary.

- None yet
