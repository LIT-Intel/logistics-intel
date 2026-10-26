# Logistics Intel - Engineering Handoff
Date: 2026-10-26
Language: English

## Harvey 3.0 - Paused
- Draft PR #197: agent architecture, 1,000 scenario fixtures, evaluation scorer.
- Draft PR #201: general natural-language intent planner. Not deployed.
- Pending: real shipment-data tools, source-grounded company analysis, multi-turn context, unified Map/List research results, authenticated evaluation.
- Preserve the existing Map.
- Defer the separate air-waybill source investigation until application priorities are completed.

## Current priority - Signup and company-email policy
- New accounts must use company/work email; personal and disposable email services are not permitted.
- Existing customers are not automatically removed by this new-signup policy.
- The Supabase before-insert authentication trigger is enabled.
- Password and invite forms call the work-email preflight; the server-side trigger is the final enforcement point for password, OAuth, and invite creation.
- Domain denylisting is not definitive proof of company ownership. Review custom-domain edge cases and any manual-exception mechanism.
- Validate signup, Google and Microsoft OAuth, invitation, admin-created user, and friendly rejection messages in controlled tests.
- Do not create real accounts or change production settings merely to test this policy.

## Release discipline
- Confirm preview build, regression tests, Supabase deployment state, and authenticated behavior separately.
- Do not label draft code as live.
- No additional Harvey deployments while signup auditing is the agreed workstream.
