// Behavior + snapshot tests for the supplier aggregator extracted from
// CDPSupplyChain.tsx (REGRESSION RULE — original was 200+ LOC in production
// with zero tests). The snapshot test locks the current production behavior
// against a realistic BOL fixture so future refactors are visible.
//
// Run: npm test --workspace frontend src/lib/suppliers

import { describe, it, expect } from "vitest";
import { aggregateSuppliers, supplierNameToSlug, type SupplierRow } from "../aggregate";

describe("aggregateSuppliers", () => {
  describe("structured serviceProviderMix.suppliers (has counts)", () => {
    it("uses provider counts and computes share% off the list total", () => {
      const profile = {
        serviceProviderMix: {
          suppliers: [
            { providerName: "ABC MFG", shipments: 50, countryCode: "CN" },
            { providerName: "XYZ Industrial", shipments: 30, countryCode: "VN" },
            { providerName: "MNO Trading", shipments: 20, countryCode: "CN" },
          ],
        },
      };
      const out = aggregateSuppliers(profile, []);
      expect(out).toEqual<SupplierRow[]>([
        { name: "ABC MFG", country: "CN", shipments: 50, share: 50 },
        { name: "XYZ Industrial", country: "VN", shipments: 30, share: 30 },
        { name: "MNO Trading", country: "CN", shipments: 20, share: 20 },
      ]);
    });

    it("sorts by shipments desc regardless of input order", () => {
      const profile = {
        serviceProviderMix: {
          suppliers: [
            { providerName: "Small", shipments: 5, countryCode: "VN" },
            { providerName: "Big", shipments: 100, countryCode: "CN" },
            { providerName: "Medium", shipments: 30, countryCode: "TW" },
          ],
        },
      };
      const out = aggregateSuppliers(profile, []);
      expect(out.map((r) => r.name)).toEqual(["Big", "Medium", "Small"]);
    });
  });

  describe("string-only topSuppliers list", () => {
    it("aggregates BOL counts when list matches recentBol suppliers", () => {
      const profile = { topSuppliers: ["Alpha Mfg", "Beta Industrial"] };
      const recentBols = [
        { supplier_name: "Alpha Mfg", supplier_country: "CN" },
        { supplier_name: "Alpha Mfg", supplier_country: "CN" },
        { supplier_name: "Alpha Mfg", supplier_country: "CN" },
        { supplier_name: "Beta Industrial", supplier_country: "VN" },
        { supplier_name: "Gamma Other", supplier_country: "TW" }, // not in list
      ];
      const out = aggregateSuppliers(profile, recentBols);
      expect(out).toEqual<SupplierRow[]>([
        { name: "Alpha Mfg", country: "CN", shipments: 3, share: 75 },
        { name: "Beta Industrial", country: "VN", shipments: 1, share: 25 },
      ]);
    });

    it("returns sentinel rows when string-only list has no BOL matches", () => {
      const profile = { topSuppliers: ["ShipperX", "ShipperY"] };
      const out = aggregateSuppliers(profile, []);
      expect(out).toEqual<SupplierRow[]>([
        { name: "ShipperX", country: "", shipments: -1, share: -1 },
        { name: "ShipperY", country: "", shipments: -1, share: -1 },
      ]);
    });
  });

  describe("no list, only recentBols", () => {
    it("aggregates fully from BOLs and caps to 6 by default", () => {
      const profile = {};
      const recentBols = Array.from({ length: 8 }, (_, i) => ({
        supplier_name: `Supplier${String.fromCharCode(65 + i)}`, // A..H
        supplier_country: "CN",
      }));
      const out = aggregateSuppliers(profile, recentBols);
      expect(out).toHaveLength(6);
      expect(out[0].share).toBeGreaterThan(0);
    });

    it("returns empty array when no list and no BOLs", () => {
      expect(aggregateSuppliers({}, [])).toEqual([]);
      expect(aggregateSuppliers(null, null as any)).toEqual([]);
    });

    it("ignores BOLs with missing supplier name", () => {
      const recentBols = [
        { supplier_name: "Real Co", supplier_country: "CN" },
        { supplier_name: "", supplier_country: "CN" },
        { supplier_name: "—", supplier_country: "CN" },
        { supplier_country: "CN" }, // no name
      ];
      const out = aggregateSuppliers({}, recentBols);
      expect(out).toEqual<SupplierRow[]>([
        { name: "Real Co", country: "CN", shipments: 1, share: 100 },
      ]);
    });
  });

  describe("limit option (F1 Suppliers sub-tab needs full list)", () => {
    it("respects custom limit", () => {
      const profile = {
        serviceProviderMix: {
          suppliers: Array.from({ length: 20 }, (_, i) => ({
            providerName: `S${i}`,
            shipments: 100 - i,
            countryCode: "CN",
          })),
        },
      };
      expect(aggregateSuppliers(profile, [], { limit: 3 })).toHaveLength(3);
      expect(aggregateSuppliers(profile, [], { limit: 10 })).toHaveLength(10);
    });

    it("limit=Infinity returns the full list", () => {
      const profile = {
        serviceProviderMix: {
          suppliers: Array.from({ length: 60 }, (_, i) => ({
            providerName: `S${i}`,
            shipments: 100 - i,
            countryCode: "CN",
          })),
        },
      };
      const out = aggregateSuppliers(profile, [], { limit: Infinity });
      expect(out).toHaveLength(60);
    });

    it("limit=0 also returns full list (caller wants 'all')", () => {
      const profile = {
        serviceProviderMix: {
          suppliers: Array.from({ length: 25 }, (_, i) => ({
            providerName: `S${i}`,
            shipments: 100 - i,
            countryCode: "CN",
          })),
        },
      };
      expect(aggregateSuppliers(profile, [], { limit: 0 })).toHaveLength(25);
    });
  });

  describe("Walmart-scale fixture (regression snapshot)", () => {
    // 200+ supplier fixture exercising the pagination path. The snapshot
    // locks current behavior so future refactors surface as test deltas.
    const profile = {
      serviceProviderMix: {
        suppliers: Array.from({ length: 200 }, (_, i) => ({
          providerName: `Supplier-${String(i).padStart(3, "0")}`,
          shipments: 200 - i,
          countryCode: i % 3 === 0 ? "CN" : i % 3 === 1 ? "VN" : "TH",
        })),
      },
    };

    it("matches the structural snapshot (top 5 + bottom 2 + counts)", () => {
      const all = aggregateSuppliers(profile, [], { limit: Infinity });
      expect(all).toHaveLength(200);
      expect(all.slice(0, 5)).toMatchInlineSnapshot(`
        [
          {
            "country": "CN",
            "name": "Supplier-000",
            "share": 1,
            "shipments": 200,
          },
          {
            "country": "VN",
            "name": "Supplier-001",
            "share": 1,
            "shipments": 199,
          },
          {
            "country": "TH",
            "name": "Supplier-002",
            "share": 1,
            "shipments": 198,
          },
          {
            "country": "CN",
            "name": "Supplier-003",
            "share": 1,
            "shipments": 197,
          },
          {
            "country": "VN",
            "name": "Supplier-004",
            "share": 1,
            "shipments": 196,
          },
        ]
      `);
      expect(all[199].name).toBe("Supplier-199");
      expect(all[199].shipments).toBe(1);
    });
  });
});

describe("supplierNameToSlug", () => {
  it("lowercases, replaces non-alnum with -, trims edges", () => {
    expect(supplierNameToSlug("ABC Manufacturing Co.")).toBe(
      "abc-manufacturing-co",
    );
  });

  it("strips diacritics", () => {
    expect(supplierNameToSlug("Münchner GmbH")).toBe("munchner-gmbh");
  });

  it("caps at 80 chars", () => {
    const long = "x".repeat(150);
    expect(supplierNameToSlug(long).length).toBe(80);
  });

  it("handles empty/nullish", () => {
    expect(supplierNameToSlug("")).toBe("");
    expect(supplierNameToSlug(null as any)).toBe("");
    expect(supplierNameToSlug(undefined as any)).toBe("");
  });
});
