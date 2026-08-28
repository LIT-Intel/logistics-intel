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
