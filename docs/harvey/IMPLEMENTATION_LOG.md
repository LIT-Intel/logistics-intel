# Harvey Contextual Copilot — Implementation Log

## 2026-08-26

- Confirmed GitHub access and cloned `LIT-Intel/logistics-intel`.
- Confirmed Supabase project `jkmrfiaefxwgbvftohrb` is `ACTIVE_HEALTHY` on Postgres 17.
- Reviewed current Supabase changelog and security guidance.
- Audited repository architecture, production Company Profile route, live tables, RLS policies, feature flags, deployed Harvey/Pulse/Apollo/CRM/Unipile functions, and advisor output.
- Corrected stale assumptions in earlier Harvey/company-profile documentation.
- Established separate contextual and autonomous Harvey boundaries.
- Added canonical `HarveyContext`, typed actions, grounded claims, deterministic opportunity/confidence logic, contact recommendations, meeting brief, and draft outputs.
- Added fail-closed `harvey_contextual_copilot` flag migration; left `harvey_internal_agent` unchanged.
- Added JWT-protected `harvey-copilot` Edge Function with server-derived org context and internal-only Lead CRM handoff.
- Embedded Harvey in Company Profile rather than adding a floating chat surface.
- Hardened `company-profile` to use the caller-scoped Supabase client for contacts/activity/Pulse reads.
- Verification: Harvey unit tests pass (4/4); production frontend build passes. The complete Vitest run executes 33 tests: 16 pass and 17 legacy text-snapshot assertions fail in the two pre-existing `snapshot-*-verification` suites. Full TypeScript parse remains blocked by pre-existing unmatched JSX tags in `frontend/src/pages/Resources.jsx`.
- Reworked the Company Profile presentation after product review: removed the full-width Harvey banner and moved account context, grounded claims, opportunity score, contact recommendation, drafts, meeting brief, and internal handoff into the existing bottom-right assistant. The floating Pulse Coach shell is now branded Harvey while retaining the established Pulse workspace nudge/composer data path outside company profiles.

## 2026-08-28

- Replaced the floating assistant's Pulse Coach question path with the authenticated `harvey-copilot` `ask` action while retaining the existing Pulse proactive workspace nudges.
- Reused the Supabase project's existing OpenAI API configuration; no credential is exposed to the browser.
- Added multi-turn follow-up context, company-aware suggested questions, general LIT/freight/sales/business answers, structured answer classification/confidence, and allow-listed in-app CTAs.
- Company Profile questions rebuild canonical tenant-scoped `HarveyContext` server-side and return only validated FACT/INFERENCE evidence claims.
- Added prompt-injection boundaries, input/history limits, safe logging, contact-data minimization, and a read-only question policy. The explicit internal Harvey handoff remains separate and unchanged.
- Verification: focused Harvey tests pass (4/4), focused frontend lint reports no errors (the files are outside the current ESLint match), and the production frontend build passes. Local Deno type-checking was unavailable because Deno is not installed; deployment compilation is the remaining Edge Function verification.
