# Harvey Contextual Copilot — Architecture

## Boundary

```text
Company Profile (customer/user context)
  -> harvey-copilot (verified user JWT, org resolved server-side)
     -> existing company-profile data + freight/Pulse/Apollo/CRM reads
     -> deterministic HarveyContext + grounded outputs
     -> drafts only

Internal Lead CRM member only
  -> Have Harvey Work This Lead
     -> existing Lead CRM identity
     -> existing Harvey research/writer/controller workflow

Existing harvey-controller remains internal-only and independently gated.
```

## Conversational replacement for Pulse Coach

The bottom-right assistant is Harvey across the application. Existing Pulse workspace aggregation still supplies proactive nudges, but user questions now call `harvey-copilot` with action `ask`; the old Pulse Coach answer endpoint is no longer used by the composer.

- On Company Profile, the request includes the active company identity and the server rebuilds `HarveyContext` under the caller's RLS session.
- On other pages, Harvey receives only the caller's tenant-scoped workspace summary and current route.
- The client includes at most eight recent user/assistant turns for follow-up questions.
- Structured output contains answer, classification, confidence, validated grounded claim IDs, inference notes, and an optional allow-listed LIT route.
- The question path is read-only. Sending outreach, changing CRM state, and internal autonomous work require their existing explicit endpoints and permission checks.
- Contact email addresses and phone numbers are deliberately omitted from model input; Harvey receives reachability booleans instead.
- Questions and retrieved data are treated as untrusted content and cannot override grounding, tenant, or secret-handling rules.

## Contracts

- `HarveyContext`: identity, tenant/caller, observed freight, modeled domestic opportunity, contacts, relationship/CRM state, source timestamps.
- `GroundedClaim`: `kind` (`FACT` or `INFERENCE`), statement, confidence, provenance entries, optional method.
- `HarveyAction`: typed enum + label/rationale/availability/required inputs.
- `HarveyCopilotOutput`: summary, claims, opportunity, recommended contacts, meeting brief, drafts, actions, capability/security metadata.

## Provenance rules

- FACT: direct persisted value or count; provenance names table/RPC and field.
- INFERENCE: calculation/model/heuristic; provenance lists its FACT inputs and `method` explains the transformation.
- Missing values produce no claim, never a zero-valued fiction.
- Modeled domestic freight is always labeled estimated/inferred.

## Feature flags

- `harvey_contextual_copilot`: customer-facing contextual surface; fail closed.
- `harvey_internal_agent`: autonomous internal engine; unchanged.

## Handoff semantics

The handoff endpoint never sends outreach. It verifies Lead CRM membership and resolves or creates the internal lead through the existing deduplicating Lead CRM RPC. That places the account in the same internal pipeline consumed by the existing Harvey controller on its next eligible run; the contextual endpoint does not bypass the controller's feature flag, quiet hours, caps, approval policy, or worker isolation. Non-members receive `403` without revealing Lead CRM state.
