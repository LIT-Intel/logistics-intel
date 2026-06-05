import { normalizeSupplier, type Supplier } from "./supplier-normalize.ts";

Deno.test("normalizeSupplier — string input becomes name-only object", () => {
  const r = normalizeSupplier("Acme Industries");
  if (r.name !== "Acme Industries") throw new Error(`expected name='Acme Industries', got ${r.name}`);
  if (r.country !== null) throw new Error(`expected country=null, got ${r.country}`);
  if (r.country_code !== null) throw new Error(`expected country_code=null`);
  if (r.shipment_count !== null) throw new Error(`expected shipment_count=null`);
  if (r.last_shipment_date !== null) throw new Error(`expected last_shipment_date=null`);
});

Deno.test("normalizeSupplier — object input passes through with defaults", () => {
  const input = { name: "ACME", country: "China", country_code: "CN", shipment_count: 234, last_shipment_date: "2026-05-15" };
  const r = normalizeSupplier(input);
  if (r.name !== "ACME") throw new Error("name");
  if (r.country !== "China") throw new Error("country");
  if (r.country_code !== "CN") throw new Error("country_code");
  if (r.shipment_count !== 234) throw new Error("count");
  if (r.last_shipment_date !== "2026-05-15") throw new Error("date");
});

Deno.test("normalizeSupplier — object missing optional fields defaults to null", () => {
  const r = normalizeSupplier({ name: "X" });
  if (r.country !== null) throw new Error("country should default null");
  if (r.country_code !== null) throw new Error("country_code should default null");
  if (r.shipment_count !== null) throw new Error("shipment_count should default null");
  if (r.last_shipment_date !== null) throw new Error("last_shipment_date should default null");
});

Deno.test("normalizeSupplier — whitespace-only string returns empty name", () => {
  const r = normalizeSupplier("   ");
  if (r.name !== "") throw new Error(`expected name='', got '${r.name}'`);
});

Deno.test("normalizeSupplier — object without name returns empty name", () => {
  const r = normalizeSupplier({ country: "US" } as any);
  if (r.name !== "") throw new Error("name should be empty when missing");
  if (r.country !== "US") throw new Error("country should pass through");
});
