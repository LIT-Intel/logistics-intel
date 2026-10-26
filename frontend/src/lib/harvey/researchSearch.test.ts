import { describe, expect, it, vi } from "vitest";
import { executeHarveyResearchSearch } from "../../../../supabase/functions/_shared/harvey_research_search.ts";

describe("Harvey structured provider research", () => {
  it("returns no invented ranking for unsupported air and lane requests", async () => {
    const client = { from: vi.fn(() => { throw new Error("No query should run"); }) };
    const result = await executeHarveyResearchSearch(client, "Rank DSV air shipments from Germany by TEU last year");
    expect(result.ok).toBe(false);
    expect(result.clarification).toBeTruthy();
    expect(client.from).not.toHaveBeenCalled();
  });
  it("validates missing questions without touching the database", async () => {
    const client = { from: vi.fn() };
    const result = await executeHarveyResearchSearch(client, "");
    expect(result).toMatchObject({ ok: false, error: "invalid_question" });
    expect(client.from).not.toHaveBeenCalled();
  });
  it("does not represent unsupported data as a current forwarder relationship", async () => {
    const query: any = {};
    for (const method of ["select", "contains", "order", "eq", "not", "neq"]) {
      query[method] = vi.fn().mockReturnValue(query);
    }
    query.limit = vi.fn().mockResolvedValue({ data: [{
      id: "1", company_name: "Example Importer", city: "Atlanta",
      state: "Georgia", vertical: "Retail",
      top_forwarders: [{ name: "DSV AIR & SEA INC. DBA. DSV OCEAN TRANSPORT" }],
      updated_at: "2026-09-01",
    }], count: 1, error: null });
    const result: any = await executeHarveyResearchSearch({ from: () => query }, "Find 25 Georgia companies using DSV");
    expect(result.ok).toBe(true);
    expect(result.result_count).toBe(1);
    expect(result.evidence.quality_status).toBe("historical_provider_label_only");
    expect(result.rows[0].relationship.lane_verified).toBe(false);
    expect(result.read_only).toBe(true);
  });
});
