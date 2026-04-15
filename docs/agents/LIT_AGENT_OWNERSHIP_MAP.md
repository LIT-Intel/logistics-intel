# LIT AGENT OWNERSHIP MAP

## Control Tower
Owns:
- priorities
- dependency tracking
- sprint coordination
- handoffs
- acceptance review
Does not own:
- deep implementation unless necessary

## App Frontend
Owns:
- app pages
- UI consistency
- responsive behavior
- page-level render logic
Does not own:
- schema design
- billing source logic

## Backend / Edge Functions / Integrations
Owns:
- supabase functions
- provider integrations
- orchestration
- stable API contracts
Does not own:
- page styling
- pricing decisions

## Auth / Access / Billing / Admin
Owns:
- login/signup/invite
- org roles
- stripe sync
- entitlements
- admin access logic
Does not own:
- general page styling
- unrelated provider integrations

## Data / Schema / Supabase
Owns:
- SQL migrations
- tables
- views
- RLS
- indexes
Does not own:
- frontend render behavior

## QA / Release / Debug
Owns:
- regression testing
- smoke tests
- deploy/runtime triage
- release readiness
Does not own:
- final architecture decisions

## Website / GTM / SEO
Owns:
- marketing site
- CMS model
- content structure
- SEO system
Does not own:
- internal app billing logic
