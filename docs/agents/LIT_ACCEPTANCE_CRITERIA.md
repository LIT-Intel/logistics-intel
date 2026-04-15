# LIT ACCEPTANCE CRITERIA

## Purpose
Defines what “done” means for each critical LIT workstream.
No task should be marked complete unless it meets the relevant criteria here.

---

## 1. Auth / Access

### Signup / Login / Logout
A task is done when:
- user can sign up successfully
- user can log in successfully
- user lands on correct post-auth route
- logout clears session and returns user safely
- no runtime import/chunk errors occur during auth redirect

### Invite Flow
A task is done when:
- invite can be created
- invite link resolves correctly
- invited user can register or login
- user is added to the correct org
- role is applied correctly
- post-accept redirect lands in expected app state

### Org Role Access
A task is done when:
- owner has owner-level access
- admin has admin-level access
- member/viewer restrictions are enforced
- org owner/admin can access workspace admin surfaces
- superadmin remains distinct where required

---

## 2. Billing / Stripe

### Billing Truth
A task is done when:
- billing page matches live Stripe products and prices
- current org plan matches Stripe subscription state
- current subscription status is visible correctly
- billing interval and period dates are accurate

### Webhook Sync
A task is done when:
- Stripe events update Supabase correctly
- org current plan updates correctly
- cancellations and failed payments are reflected correctly
- subscription row remains normalized and queryable

### Checkout / Portal
A task is done when:
- upgrade checkout session can be created successfully
- portal session can be created successfully
- post-checkout plan state syncs back to app correctly

---

## 3. Entitlements / Feature Gating

### Gating
A task is done when:
- at least one premium feature is blocked correctly by plan
- both frontend and backend enforce gating where needed
- credits and usage are checked before premium execution
- user receives clear upgrade / limit messaging

### Usage
A task is done when:
- usage events are written for premium actions
- org usage totals can be queried reliably
- credits remaining can be computed reliably

---

## 4. Admin Dashboard

A task is done when:
- admin dashboard loads without runtime error
- page does not depend on missing fake APIs
- overview tab shows real data
- users tab shows real data
- organizations tab shows real data
- billing/subscription data is real
- org admin access works where intended
- superadmin access works where intended
- role and plan changes, if enabled, write safely

---

## 5. Pulse

A task is done when:
- search returns results aligned to the query intent
- people queries return relevant people
- company queries return relevant companies
- mixed queries return appropriate grouped or separated results
- initial search does not overspend credits unnecessarily
- page size and requested quantity limits are respected
- results render in consistent LIT UI style
- save company / save contact actions work
- detail views or enrichments work when expected

---

## 6. Search / Command Center / Campaigns

### Search
Done when:
- shipment/company search returns stable results
- result views render correctly
- saved state works
- no broken components or blank pages

### Command Center
Done when:
- saved companies and contacts appear correctly
- org/user can manage records as intended
- data is consistent with upstream saves

### Campaigns
Done when:
- campaign builder loads correctly
- selected companies/contacts can move into campaign flow
- no placeholder-only flows remain in live path

---

## 7. App Frontend Consistency

A task is done when:
- page matches dashboard visual language
- cards, tables, spacing, typography, and colors are consistent
- mobile layout is usable
- tablet layout is usable
- no page looks like a different product

---

## 8. Website / SEO

A task is done when:
- site architecture is defined
- CMS schema is defined
- homepage and core pages are build-ready
- technical SEO structure is in place
- content can be updated without code edits
- website represents trade intelligence + buyer intelligence + campaign execution, not just one feature

---

## 9. QA / Release

A task is done when:
- reproducible test path exists
- expected outcome is defined
- actual outcome is validated
- no blocking regressions remain
- build passes
- deployment path is verified
- screenshots/logs are attached for any unresolved issue

---

## Global Rule
Nothing is “done” because code was written.

A task is only done when:
1. implementation is complete
2. dependent systems still work
3. acceptance criteria are met
4. QA has validated the flow
