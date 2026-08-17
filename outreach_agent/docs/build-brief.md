# Outreach Agent Build Brief

## Confirmed

- LIT uses React/Vite, Supabase, Supabase Edge Functions, and separate customer Campaigns and internal Lead CRM workspaces.
- Apollo enriches companies and contacts.
- Unipile will execute and synchronize LinkedIn activity.
- The dedicated OpenAI secret is named `Outreach_agent`.
- Human-sounding communication is a launch blocker.
- Campaigns require sequences, approval before launch, analytics, user isolation, daily caps, and reply tracking.

## Agent contract

- Goal: produce a grounded, human draft or a safe stop/escalation decision.
- Input: typed company, contact, campaign, history, workspace, channel, and approval state.
- Output: typed decision, draft, evidence, confidence, next step, approval and compliance flags.
- Tools: channel policy and approval policy only in v1; no send capability.
- State: Supabase remains authoritative; the agent receives a bounded snapshot.
- Approval: every v1 draft requires human review.
- Deployment: standalone Python HTTP service with `/health` and `/v1/draft`.

## Deliberate exclusions

- No autonomous sending.
- No direct Unipile credential or API access.
- No fine-tuning before trace/eval evidence.
- No web browsing by the runtime agent.
- No cross-workspace memory.

