# Harvey Contextual Copilot — Capability Matrix

Status is based on repository plus live Supabase inspection on 2026-08-26.

| Capability | Status | Evidence / implementation decision |
|---|---|---|
| Understand account | LIVE DATA AVAILABLE | Company Profile builds canonical `HarveyContext`; the floating Harvey assistant receives the active account context. |
| Explain recent freight activity | LIVE DATA AVAILABLE | Grounded company freight claims are available to both the compact account brief and conversational `ask` action. |
| Identify changes/trends | REQUIRES NEW BACKEND LOGIC | Monthly/recency data exists; grounded change calculations need a canonical builder. |
| Suggest opportunity areas | LIVE DATA AVAILABLE | Deterministic opportunity/confidence output and grounded conversational explanation are live. |
| Identify relevant contacts | LIVE DATA AVAILABLE | Tenant-visible contacts are ranked by freight-sales relevance without triggering enrichment. |
| Prepare call brief | LIVE DATA AVAILABLE | Structured meeting objective, opener, talking points, discovery questions, and risks are live. |
| Generate email | LIVE DATA AVAILABLE | Compact panel and conversational Harvey generate draft-only, grounded email copy. |
| Generate LinkedIn message | LIVE DATA AVAILABLE | Compact panel and conversational Harvey generate draft-only LinkedIn copy; no automatic send. |
| Generate call opener | LIVE DATA AVAILABLE | Generated from the grounded account context and available FACT/INFERENCE claims. |
| Prioritize search results | DATA AVAILABLE BUT UI MISSING | Composite opportunity and confidence exist; outside Company Profile MVP. |
| Recommend next action | LIVE DATA AVAILABLE | Typed actions and validated in-app conversational CTAs are live. |
| Review pipeline | LIVE DATA AVAILABLE | Internal Lead CRM and customer CRM both have pipeline/reporting APIs; contextual UI is later scope. |
| Detect stale opportunities | LIVE DATA AVAILABLE | CRM stale fields/automation exist; contextual explanation is later scope. |
| Suggest follow-ups | LIVE DATA AVAILABLE | Harvey can recommend and draft follow-ups; execution remains an explicit separate action. |
| Generate account summary | LIVE DATA AVAILABLE | Structured summary and grounded conversational account answers are live. |
| Explain domestic opportunity from international activity | LIVE DATA AVAILABLE | Inland/drayage estimates are labeled INFERENCE with method, provenance, and confidence. |

## MVP boundary

Company Profile MVP implements account summary, recent freight activity, domestic opportunity + confidence, contact recommendations, meeting brief/call opener, email/LinkedIn drafts, next actions, multi-turn questions, and an internal-only handoff. Period-over-period trend detection and contextual search ranking remain follow-on phases. Pipeline questions continue to use the existing tenant-scoped pipeline summary path.
