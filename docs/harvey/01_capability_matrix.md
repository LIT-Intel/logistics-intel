# Harvey Contextual Copilot — Capability Matrix

Status is based on repository plus live Supabase inspection on 2026-08-26.

| Capability | Status | Evidence / implementation decision |
|---|---|---|
| Understand account | DATA AVAILABLE BUT UI MISSING | Company profile aggregator, directory, saved state, CRM, Pulse. Canonical `HarveyContext` is required. |
| Explain recent freight activity | DATA AVAILABLE BUT UI MISSING | ImportYeti snapshot, unified shipments, lane months. |
| Identify changes/trends | REQUIRES NEW BACKEND LOGIC | Monthly/recency data exists; grounded change calculations need a canonical builder. |
| Suggest opportunity areas | REQUIRES NEW BACKEND LOGIC | Opportunity scores and freight facts exist; recommendations need deterministic rules + provenance. |
| Identify relevant contacts | DATA AVAILABLE BUT UI MISSING | `lit_contacts` and previews exist; rank by freight-sales personas without triggering enrichment. |
| Prepare call brief | REQUIRES NEW BACKEND LOGIC | Inputs exist across company/freight/contact/activity; structured output is missing. |
| Generate email | DATA AVAILABLE BUT UI MISSING | Harvey writer/templates exist. Company Profile needs draft-only grounded output. |
| Generate LinkedIn message | DATA AVAILABLE BUT UI MISSING | Harvey writer + Unipile action model exist. Company Profile remains draft-only. |
| Generate call opener | REQUIRES NEW BACKEND LOGIC | Derived from top FACT/INFERENCE claims. |
| Prioritize search results | DATA AVAILABLE BUT UI MISSING | Composite opportunity and confidence exist; outside Company Profile MVP. |
| Recommend next action | REQUIRES NEW BACKEND LOGIC | CRM/freight/contact state exists; typed action policy is missing. |
| Review pipeline | LIVE DATA AVAILABLE | Internal Lead CRM and customer CRM both have pipeline/reporting APIs; contextual UI is later scope. |
| Detect stale opportunities | LIVE DATA AVAILABLE | CRM stale fields/automation exist; contextual explanation is later scope. |
| Suggest follow-ups | REQUIRES NEW BACKEND LOGIC | Timeline and draft infrastructure exist; contextual policy/output is missing. |
| Generate account summary | REQUIRES NEW BACKEND LOGIC | Data exists; FACT/INFERENCE structured summary is missing. |
| Explain domestic opportunity from international activity | REQUIRES NEW BACKEND LOGIC | Inland/drayage estimates are live; Harvey must label them as modeled inference and calculate confidence. |

## MVP boundary

Company Profile MVP implements account summary, recent freight activity, domestic opportunity + confidence, contact recommendations, meeting brief/call opener, email/LinkedIn drafts, next actions, and an internal-only handoff. Period-over-period trend detection, search ranking, and pipeline-wide review remain follow-on phases.
