# Customer CRM vs Optimus freight-broker-CRM workflow — analysis + patch (2026-09-25)

CEO + product review, /apple-design applied. Compares LIT's customer-facing CRM to Optimus's
freight-broker-CRM workflow (getoptimus.ai/resources/freight-broker-crm).

## Clarification: LIT has TWO CRMs
- **Internal Lead-CRM** (`/app/leads`) — Attio-replacement Harvey (AI SDR) runs. Internal only.
- **Customer CRM** (what customers use): **Command Center** (accounts) + **Pipeline board** (deals/stages,
  `features/crm/PipelineBoard.tsx`, CreateDealModal, DealDetailDrawer) + **Tasks** (TasksView) +
  **Pipeline Reports** + the **CompanyProfileV2** integrated account view (Supply Chain / Trade Graph /
  Pulse LIVE / Contacts / Activity / Inbox / CRM+Revenue tabs).

The owner conflated the two; the customer CRM already exists and is substantial.

## Verdict: LIT already matches Optimus's workflow — and exceeds it in places
Optimus's page is a marketing buyer's checklist (light on actual product; it punts quotes/loads to "TMS").
Mapping its 10-step lead→won motion to LIT:

| Optimus step | LIT today |
|---|---|
| Define freight ICP | ✅ Intelligence Explorer (industry/geo/lane/commodity/volume) |
| Find matching accounts | ✅ Explorer results + map |
| Qualify with FIT EVIDENCE | ⚠️ Partial — raw KPIs (TEU/shipments/spend/lane), no explicit "why it fits" |
| Locate decision-maker | ✅ Contact Intelligence / enrichment |
| Prepare REASON TO CALL (freight hypothesis) | ❌ No dedicated capture field |
| Assign next action | ✅ Tasks — not surfaced as guided "next best action" |
| Conduct outreach | ✅ Campaigns + Harvey AI (exceeds Optimus) |
| Tag & track outcomes | ✅ Activity log |
| Create opportunity | ✅ Pipeline board + stages (Optimus punts to TMS) |
| Measure by source | ✅ Pipeline Reports/KPIs (source attribution thin) |

LIT is AHEAD of Optimus on: real drag pipeline + stages, tasks, AI outreach, single integrated account view.

## The correct patch (cohesion + 3 trust signals + Apple-design — not missing modules)
1. **Explicit lead→won motion** — pieces live in separate places (Explorer / Command Center / Pipeline);
   add a guided path + **"next best action"** per account. Biggest real gap vs Optimus's "one workflow".
2. **Fit evidence, not a bare score** — "340 TEU/yr on China→LA, ships monthly, no incumbent detected"
   in Command Center + profile header.
3. **Data provenance labels** — observed (customs) / inferred / estimated per datapoint. Cheap, high-trust,
   counters Optimus's "transparent evidence classes" pitch.
4. **"Reason to call" field** on the account (freight hypothesis) so outreach is context-first.

## Apple-design across the CRM (owner requirement)
- **Pipeline board:** spring card drag, 1:1 tracking, velocity handoff on drop, momentum projection to nearest
  column, interruptible; instant press feedback; rubber-band at column edges.
- **Command Center table:** instant row-press feedback, smooth sort transitions, translucent sticky header with
  scroll-edge fade (not a 1px divider), KPI numbers spring/count.
- **Deal drawer:** slide from source + dismiss to same edge (spatial consistency), translucent material + scrim,
  spring open/close.
- **prefers-reduced-motion + prefers-reduced-transparency** fallbacks baked in.

## Recommended sequencing (product initiative, not a one-shot edit)
- **Phase 1 (highest leverage + the Apple-design ask):** re-polish the Pipeline board with fluid drag/spring/materials.
- **Phase 2:** fit-evidence + provenance labels in Command Center + profile header.
- **Phase 3:** guided "next best action" tying Explorer → Command Center → Pipeline.

Status: analysis delivered; awaiting owner go-ahead to start Phase 1.
