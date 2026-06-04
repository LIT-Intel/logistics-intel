/**
 * Normalizes legacy string-shaped suppliers + new structured suppliers
 * into a single shape that downstream consumers (Suppliers tab UI,
 * Top Supplier widget, drayage rollup grouper) can consume uniformly.
 *
 * Legacy: parsed_summary.top_suppliers used to be `string[]`. New
 * snapshots from importyeti_fetch v2 (Task 3) emit object array. UI
 * sees both during the transition window — this helper bridges.
 */

export type Supplier = {
  name: string;
  country: string | null;
  country_code: string | null;
  shipment_count: number | null;
  last_shipment_date: string | null;
};

export function normalizeSupplier(input: string | Partial<Supplier> | unknown): Supplier {
  if (typeof input === "string") {
    return {
      name: input.trim(),
      country: null,
      country_code: null,
      shipment_count: null,
      last_shipment_date: null,
    };
  }
  if (input && typeof input === "object") {
    const obj = input as Partial<Supplier>;
    return {
      name: typeof obj.name === "string" ? obj.name.trim() : "",
      country: typeof obj.country === "string" ? obj.country : null,
      country_code: typeof obj.country_code === "string" ? obj.country_code.toUpperCase() : null,
      shipment_count: typeof obj.shipment_count === "number" ? obj.shipment_count : null,
      last_shipment_date: typeof obj.last_shipment_date === "string" ? obj.last_shipment_date : null,
    };
  }
  return { name: "", country: null, country_code: null, shipment_count: null, last_shipment_date: null };
}
