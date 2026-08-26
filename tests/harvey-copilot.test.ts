import { describe, expect, it } from "vitest";
import { buildHarveyCopilotOutput, type HarveyContext } from "../supabase/functions/_shared/harvey_copilot";

const base: HarveyContext = {
  version: "1.0",
  generated_at: "2026-08-26T00:00:00.000Z",
  tenant: { org_id: "org-1", user_id: "user-1" },
  company: { id: "company-1", key: "company/acme", name: "Acme", domain: "acme.test", industry: "Retail", city: "Atlanta", state: "GA" },
  freight: { shipments_12m: 120, teu_12m: 240, last_shipment: "2026-08-20", top_route: "Shanghai → Savannah", opportunity_score: 72 },
  domestic: { estimated_truckloads_month: 18, facilities: 2, flows: 3, confidence: 0.82 },
  contacts: [{ id: "c1", full_name: "Jordan Lee", title: "VP Supply Chain", email: "jordan@example.test", phone: null, linkedin_url: "https://linkedin.com/in/jordan", verified: true }],
  relationship: { is_saved: true, stage: "lead", activity_count: 2, lead_crm_member: false, internal_lead_id: null },
};

describe("buildHarveyCopilotOutput", () => {
  it("separates direct facts from modeled domestic inference", () => {
    const out = buildHarveyCopilotOutput(base);
    expect(out.claims.some((c) => c.kind === "FACT" && c.id === "freight-shipments-12m")).toBe(true);
    const domestic = out.claims.find((c) => c.id === "domestic-opportunity");
    expect(domestic?.kind).toBe("INFERENCE");
    expect(domestic?.method).toContain("not observed domestic tender data");
  });

  it("keeps autonomous handoff unavailable to non-internal users", () => {
    const out = buildHarveyCopilotOutput(base);
    expect(out.actions.find((a) => a.type === "HAVE_HARVEY_WORK_LEAD")?.available).toBe(false);
  });

  it("offers handoff only after the server marks the caller as a Lead CRM member", () => {
    const out = buildHarveyCopilotOutput({
      ...base,
      relationship: { ...base.relationship, lead_crm_member: true },
    });
    const action = out.actions.find((a) => a.type === "HAVE_HARVEY_WORK_LEAD");
    expect(action).toMatchObject({ available: true, requires_internal_access: true });
  });

  it("does not invent zero-valued freight facts when data is missing", () => {
    const out = buildHarveyCopilotOutput({ ...base, freight: { shipments_12m: null, teu_12m: null, last_shipment: null, top_route: null, opportunity_score: null } });
    expect(out.claims.some((c) => c.id === "freight-shipments-12m")).toBe(false);
    expect(out.meeting_brief.risk_flags).toContain("No canonical 12-month shipment count is available.");
  });
});
