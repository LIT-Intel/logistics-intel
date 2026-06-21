// T2: coverage diagnostic over the Company Search intelligence overlay.

import { describe, it, expect } from "vitest";
import { summarizeOverlayCoverage } from "../overlayCoverage";

describe("summarizeOverlayCoverage", () => {
  it("reports 0% for an empty key set without dividing by zero", () => {
    const cov = summarizeOverlayCoverage([], {});
    expect(cov).toEqual({
      total: 0,
      matched: 0,
      missing: 0,
      coveragePct: 0,
      fields: { industry: 0, vertical: 0, revenue: 0, opportunity_composite_score: 0 },
    });
  });

  it("counts a key matched when it has any non-empty field", () => {
    const keys = ["a", "b", "c"];
    const overlay = {
      a: { industry: "Retail", vertical: "Big Box", revenue: 5_000_000, opportunity_composite_score: 72 },
      b: { industry: "Manufacturing" }, // partial match
      // c: absent → unmatched
    };
    const cov = summarizeOverlayCoverage(keys, overlay);
    expect(cov.total).toBe(3);
    expect(cov.matched).toBe(2);
    expect(cov.missing).toBe(1);
    expect(cov.coveragePct).toBe(67); // round(2/3*100)
    expect(cov.fields).toEqual({
      industry: 2,
      vertical: 1,
      revenue: 1,
      opportunity_composite_score: 1,
    });
  });

  it("treats null / empty-string fields as not present (data-coverage gap)", () => {
    const cov = summarizeOverlayCoverage(["a"], {
      a: { industry: null, vertical: "", revenue: undefined, opportunity_composite_score: null },
    });
    expect(cov.matched).toBe(0);
    expect(cov.coveragePct).toBe(0);
    expect(cov.fields.industry).toBe(0);
  });

  it("ignores falsy keys in the input list", () => {
    const cov = summarizeOverlayCoverage(["a", "", null as any], { a: { industry: "X" } });
    expect(cov.total).toBe(1);
    expect(cov.matched).toBe(1);
  });
});
