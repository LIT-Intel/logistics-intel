# Unipile + Outreach Agent integration

## Outcome

Add LinkedIn connection requests and direct messages to the existing LIT
campaign and internal Lead CRM workflows. The OpenAI outreach agent drafts
copy; a human explicitly approves every action; a deterministic Edge Function
performs the Unipile API call.

## Boundaries

- Campaigns remain organization-scoped through `lit_campaigns.org_id`.
- Lead CRM remains restricted by `is_lead_crm_member(auth.uid())` and uses the
  internal LIT organization.
- No API token is sent to the browser or stored in a user-readable table.
- No draft may be sent from `pending_approval` state.
- Apollo-origin leads must retain their current, qualified-company decision.
- Idempotency keys prevent duplicate drafts/sends for the same target + step.
- Replies pause the corresponding campaign recipient and enter the existing
  `lit_outreach_history` reporting stream.
- Provider 401/403/422/429 responses stop the action. There is no aggressive
  automated retry loop.

## Runtime configuration

`Unipile_API` accepts either:

```json
{
  "api_key": "...",
  "dsn": "https://apiX.unipile.com:12345",
  "webhook_secret": "a separate random webhook secret"
}
```

or a raw API key together with `UNIPILE_DSN` and
`UNIPILE_WEBHOOK_SECRET`. `Outreach_agent` is the OpenAI API key already used
by the qualification agent.

## User journeys

1. Settings → Integrations → Connect LinkedIn opens Unipile Hosted Auth.
2. Campaign builder edit mode shows a LinkedIn approval queue when the
   sequence contains LinkedIn steps.
3. Lead CRM → Communicate resolves the saved primary contact's LinkedIn URL,
   drafts a connection request or message, and exposes Approve & send.
4. Unipile message and new-relation webhooks update threads, messages,
   campaign status, lead activity, and outreach analytics.

## Acceptance checks

- Unauthenticated account/outreach calls return 401.
- Non-members cannot list or mutate another organization's account/actions.
- Hosted callback consumes a short-lived, one-time session and verifies the
  returned account against Unipile before persistence.
- Draft output respects the invitation length limit and human-tone policy.
- A direct send attempt without approved state returns `APPROVAL_REQUIRED`.
- Repeated approve/send returns the existing sent action and does not resend.
- Per-account daily caps block excess sends.
- Duplicate webhook deliveries are acknowledged without duplicate rows.
- Inbound replies create a LinkedIn message, a `replied` outreach event, and
  stop the recipient's remaining campaign steps.
