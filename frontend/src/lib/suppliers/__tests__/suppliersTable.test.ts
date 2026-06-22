// Tests for the rich ImportYeti suppliers_table parser. Fixture mirrors a real
// suppliers_table row shape (public/rawpayload.md).

import { describe, it, expect } from "vitest";
import {
  parseSuppliersTable,
  parseIyDateMs,
  computeSupplierTrend,
  looksLikeSuppliersTable,
} from "../suppliersTable";
import { aggregateSuppliers } from "../aggregate";

const NOW = Date.parse("2026-06-21T00:00:00Z");

const richRow = {
  key: "/supplier/bowker-vietnam-garment-factory",
  supplier_name: "Bowker Vietnam Garment Factory",
  country: "Vietnam",
  supplier_address_country: "Vietnam",
  country_code: "VN",
  vendor_address_country_code: "VN",
  supplier_address: "Lot K1 2 3 4 5 Road No 6 Dong An Industrial Park Binh Duong Vn",
  total_teus: 2986,
  shipments_12m: 200,
  total_shipments_supplier: 3012,
  first_shipment: "20/03/2022",
  most_recent_shipment: "09/09/2025",
  business_length: "3y 5m 20d",
  is_new_supplier: false,
  shipments_percents_company: 4.78,
  hs_code_chapters: [
    { chapter: "61", name: "Apparel-knitted", shipments: 150 },
    { chapter: "62", name: "Apparel-woven", shipments: 50 },
  ],
  supplier_time_series: {
    "01/01/2025": { shipments: 10, teu: 50 },
    "01/02/2025": { shipments: 10, teu: 50 },
    "01/08/2025": { shipments: 30, teu: 100 },
    "01/09/2025": { shipments: 30, teu: 100 },
  },
  top_companies: [
    { company_name: "Adidas Canada", shipments_12m: 150 },
    { company_name: "Puma USA", shipments_12m: 40 },
  ],
};

describe("parseIyDateMs", () => {
  it("parses DD/MM/YYYY (ImportYeti format)", () => {
    expect(parseIyDateMs("09/09/2025")).toBe(Date.UTC(2025, 8, 9));
    expect(parseIyDateMs("20/03/2022")).toBe(Date.UTC(2022, 2, 20));
  });
  it("parses ISO and rejects junk", () => {
    expect(parseIyDateMs("2025-09-09")).toBe(Date.parse("2025-09-09"));
    expect(parseIyDateMs("nope")).toBeNull();
    expect(parseIyDateMs(null)).toBeNull();
  });
});

describe("looksLikeSuppliersTable", () => {
  it("recognizes a real rich table", () => {
    expect(looksLikeSuppliersTable([richRow])).toBe(true);
  });
  it("rejects name-only / empty", () => {
    expect(looksLikeSuppliersTable(["Acme", "Beta"])).toBe(false);
    expect(looksLikeSuppliersTable([])).toBe(false);
    expect(looksLikeSuppliersTable(null)).toBe(false);
  });
});

describe("computeSupplierTrend", () => {
  const series = [
    { ms: Date.UTC(2025, 0, 1), shipments: 10, teu: 50 },
    { ms: Date.UTC(2025, 1, 1), shipments: 10, teu: 50 },
    { ms: Date.UTC(2025, 7, 1), shipments: 30, teu: 100 },
    { ms: Date.UTC(2025, 8, 1), shipments: 30, teu: 100 },
  ];
  it("growing when recent half exceeds prior", () => {
    expect(computeSupplierTrend(series, { isNew: false, dormant: false })).toBe("growing");
  });
  it("dormant short-circuits", () => {
    expect(computeSupplierTrend(series, { isNew: false, dormant: true })).toBe("dormant");
  });
  it("new short-circuits (when not dormant)", () => {
    expect(computeSupplierTrend(series, { isNew: true, dormant: false })).toBe("new");
  });
  it("null when not enough signal", () => {
    expect(computeSupplierTrend([], { isNew: false, dormant: false })).toBeNull();
  });
});

describe("parseSuppliersTable", () => {
  it("maps every real field, never fabricating", () => {
    const [row] = parseSuppliersTable([richRow], { now: NOW });
    expect(row.name).toBe("Bowker Vietnam Garment Factory");
    expect(row.country).toBe("Vietnam");
    expect(row.country_code).toBe("VN");
    expect(row.address).toContain("Binh Duong");
    expect(row.shipments).toBe(200);
    expect(row.total_shipments).toBe(3012);
    expect(row.total_teu).toBe(2986);
    expect(row.teu_12m).toBe(300); // 50+50+100+100 within trailing 12m of series
    expect(row.share).toBe(5); // round(4.78) from shipments_percents_company
    expect(row.first_shipment_date).toBe("2022-03-20");
    expect(row.last_shipment_date).toBe("2025-09-09");
    expect(row.business_length).toBe("3y 5m 20d");
    expect(row.recency).toBe("active"); // ~285 days before NOW
    expect(row.trend).toBe("growing");
    expect(row.hs_chapters?.[0]).toEqual({ chapter: "61", name: "Apparel-knitted", shipments: 150 });
    expect(row.other_buyers?.[0]).toEqual({ name: "Adidas Canada", shipments: 150 });
    expect(row.iy_key).toBe("/supplier/bowker-vietnam-garment-factory");
  });

  it("uses the real ImportYeti share %, not a recomputed one", () => {
    const [row] = parseSuppliersTable(
      [{ supplier_name: "X", shipments_12m: 44, shipments_percents_company: 4.78 }],
      { companyTotal: 1000, now: NOW },
    );
    expect(row.share).toBe(5); // from percents (round 4.78), not 44/1000
  });

  it("falls back to company-total share when percents absent", () => {
    const [row] = parseSuppliersTable(
      [{ supplier_name: "X", shipments_12m: 44 }],
      { companyTotal: 1000, now: NOW },
    );
    expect(row.share).toBe(4); // 44/1000
  });

  it("returns [] for empty/invalid input", () => {
    expect(parseSuppliersTable([], {})).toEqual([]);
    expect(parseSuppliersTable(null as any, {})).toEqual([]);
  });

  it("sorts by 12m shipments desc", () => {
    const out = parseSuppliersTable(
      [
        { supplier_name: "Small", shipments_12m: 5 },
        { supplier_name: "Big", shipments_12m: 100 },
      ],
      { now: NOW },
    );
    expect(out.map((r) => r.name)).toEqual(["Big", "Small"]);
  });
});

describe("aggregateSuppliers prefers the rich suppliers_table", () => {
  it("uses parseSuppliersTable when profile.suppliers_table is present", () => {
    const profile = { suppliers_table: [richRow] };
    const out = aggregateSuppliers(profile, [], { now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0].address).toContain("Binh Duong");
    expect(out[0].teu_12m).toBe(300);
    expect(out[0].trend).toBe("growing");
  });
});
