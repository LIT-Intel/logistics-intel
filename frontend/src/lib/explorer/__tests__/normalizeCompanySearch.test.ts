// T1 (eng-review): Origin → Destination must populate from the raw hit's
// route string (primaryRouteSummary / primaryRoute) and never fabricate a
// lane when the upstream value is missing.

import { describe, it, expect } from "vitest";
import {
  cleanLane,
  normalizeIyShipperHit,
} from "../normalizeCompanySearch";

describe("cleanLane", () => {
  it("passes through a well-formed arrow lane", () => {
    expect(cleanLane("Vietnam → United States")).toBe("Vietnam → United States");
  });

  it("normalises 'to' and ASCII arrows to ' → '", () => {
    expect(cleanLane("Shanghai to Los Angeles")).toBe("Shanghai → Los Angeles");
    expect(cleanLane("Ningbo -> Long Beach")).toBe("Ningbo → Long Beach");
  });

  it("collapses whitespace", () => {
    expect(cleanLane("  A   →   B ")).toBe("A → B");
  });

  it("returns null for missing / empty values (no fabricated lane)", () => {
    expect(cleanLane(null)).toBeNull();
    expect(cleanLane(undefined)).toBeNull();
    expect(cleanLane("")).toBeNull();
    expect(cleanLane("   ")).toBeNull();
  });
});

describe("normalizeIyShipperHit — lane mapping", () => {
  it("maps primaryRouteSummary into top_lane", () => {
    const row = normalizeIyShipperHit({
      name: "Acme Importers",
      key: "company/acme-importers",
      primaryRouteSummary: "Vietnam → California",
    } as any);
    expect(row.top_lane).toBe("Vietnam → California");
  });

  it("falls back to primaryRoute when summary is absent", () => {
    const row = normalizeIyShipperHit({
      name: "Acme Importers",
      key: "company/acme-importers",
      primaryRoute: "China to Los Angeles",
    } as any);
    expect(row.top_lane).toBe("China → Los Angeles");
  });

  it("leaves top_lane null when the hit carries no route (cell shows —)", () => {
    const row = normalizeIyShipperHit({
      name: "Acme Importers",
      key: "company/acme-importers",
    } as any);
    expect(row.top_lane).toBeNull();
  });
});
