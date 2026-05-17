// Shared BOL field helpers (Phase 6, extracted from CDPSupplyChain).
//
// All accept the row OR the row.raw object and return a string fallback
// "—" / null when the field is genuinely missing. Never throw, never
// return "Invalid Date".
//
// Originally lived in frontend/src/components/company/CDPSupplyChain.tsx
// — pulled out so Pulse LIVE and CDP Supply Chain render BOL rows with
// identical field-resolution semantics.

export function getBolDate(bol: any): string | null {
  if (!bol) return null;
  return (
    bol?.shipmentDate ||
    bol?.shipment_date ||
    bol?.date_formatted ||
    bol?.dateFormatted ||
    bol?.Date ||
    bol?.bill_of_lading_date ||
    bol?.bill_of_lading_date_formatted ||
    bol?.arrival_date ||
    bol?.arrivalDate ||
    bol?.Arrival_Date ||
    bol?.entry_date ||
    bol?.entryDate ||
    bol?.bol_date ||
    bol?.bolDate ||
    bol?.bill_date ||
    bol?.billDate ||
    bol?.shipped_on ||
    bol?.shippedOn ||
    bol?.created_at ||
    bol?.last_shipment_date ||
    bol?.lastShipmentDate ||
    bol?.date ||
    bol?.raw?.bill_of_lading_date ||
    bol?.raw?.shipment_date ||
    bol?.raw?.arrival_date ||
    null
  );
}

export function parseBolDate(value: string | null): Date | null {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  // v200 emits DD/MM/YYYY (e.g. "13/04/2026"). Try that first, then native Date.
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const y = Number(slash[3]);
    if (a >= 1 && a <= 31 && b >= 1 && b <= 12) {
      const d = new Date(Date.UTC(y, b - 1, a));
      if (!Number.isNaN(d.getTime())) return d;
    }
    if (a >= 1 && a <= 12 && b >= 1 && b <= 31) {
      const d = new Date(Date.UTC(y, a - 1, b));
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatBolDate(bol: any): string {
  const value = getBolDate(bol);
  const d = parseBolDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Country-name → ISO-2 code for common origin countries surfaced by ImportYeti.
// Used to render lane labels as "City, KR" instead of "City, Korea, Republic of".
const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  "korea, republic of": "KR",
  "south korea": "KR",
  "republic of korea": "KR",
  "china": "CN",
  "people's republic of china": "CN",
  "hong kong": "HK",
  "taiwan": "TW",
  "japan": "JP",
  "vietnam": "VN",
  "viet nam": "VN",
  "india": "IN",
  "thailand": "TH",
  "malaysia": "MY",
  "indonesia": "ID",
  "singapore": "SG",
  "philippines": "PH",
  "germany": "DE",
  "france": "FR",
  "italy": "IT",
  "spain": "ES",
  "netherlands": "NL",
  "belgium": "BE",
  "united kingdom": "GB",
  "great britain": "GB",
  "turkey": "TR",
  "mexico": "MX",
  "canada": "CA",
  "brazil": "BR",
  "united states": "US",
  "united states of america": "US",
  "usa": "US",
};

function toCountryCode(value: any): string | null {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (/^[A-Z]{2}$/.test(s)) return s;
  const lc = s.toLowerCase();
  return COUNTRY_NAME_TO_CODE[lc] || null;
}

export function getBolOrigin(bol: any): string {
  // v200: route="A → B"; if present, take left side
  if (typeof bol?.route === "string" && bol.route.includes("→")) {
    const left = bol.route.split("→")[0]?.trim();
    if (left) return left;
  }
  // Prefer "City, CC" when both pieces are available from the materialized row.
  const originCity =
    bol?.origin_city ||
    bol?.originCity ||
    bol?.supplier_address_location ||
    null;
  const originCountryRaw =
    bol?.origin_country_code ||
    bol?.originCountryCode ||
    bol?.origin_country ||
    bol?.originCountry ||
    bol?.supplier_address_country ||
    bol?.shipper_country ||
    bol?.supplier_country ||
    bol?.Country ||
    bol?.raw?.country ||
    null;
  const originCC = toCountryCode(originCountryRaw);
  if (originCity && originCC) return `${originCity}, ${originCC}`;

  return (
    // v200 raw BOL emits origin_port / destination_port directly.
    bol?.origin_port ||
    bol?.originPort ||
    bol?.Origin_Port ||
    bol?.origin_name ||
    bol?.origin ||
    bol?.foreign_port ||
    bol?.foreignPort ||
    bol?.from_port ||
    bol?.fromPort ||
    bol?.port_of_lading ||
    bol?.portOfLading ||
    bol?.place_of_receipt ||
    bol?.placeOfReceipt ||
    (originCity && !originCC ? originCity : null) ||
    (originCountryRaw ? String(originCountryRaw) : null) ||
    bol?.raw?.origin_port ||
    bol?.raw?.foreign_port ||
    bol?.raw?.origin ||
    "—"
  );
}

export function getBolDestination(bol: any): string {
  // v200: route="A → B"; if present, take right side
  if (typeof bol?.route === "string" && bol.route.includes("→")) {
    const right = bol.route.split("→")[1]?.trim();
    if (right) return right;
  }
  // For US destinations, "City, ST" from the parsed consignee address is the
  // most useful — surface it directly when both pieces are present.
  const destCity = bol?.dest_city || null;
  const destState = bol?.dest_state || null;
  if (destCity && destState) return `${destCity}, ${destState}`;

  // Non-US: prefer "City, CC" when both city + country are available.
  const fallbackCity =
    bol?.destination_city ||
    bol?.destinationCity ||
    bol?.company_address_location ||
    destCity ||
    null;
  const destCountryRaw =
    bol?.destination_country_code ||
    bol?.destinationCountryCode ||
    bol?.destination_country ||
    bol?.destinationCountry ||
    bol?.company_address_country ||
    bol?.consignee_country ||
    null;
  const destCC = toCountryCode(destCountryRaw);
  if (fallbackCity && destCC) return `${fallbackCity}, ${destCC}`;

  return (
    // v200 raw BOL emits origin_port / destination_port directly.
    bol?.destination_port ||
    bol?.destinationPort ||
    bol?.Destination_Port ||
    bol?.destination_name ||
    bol?.destination ||
    bol?.us_port ||
    bol?.usPort ||
    bol?.us_port_of_unlading ||
    bol?.usPortOfUnlading ||
    bol?.to_port ||
    bol?.toPort ||
    bol?.port_of_unlading ||
    bol?.portOfUnlading ||
    bol?.place_of_delivery ||
    bol?.placeOfDelivery ||
    (fallbackCity && !destCC ? fallbackCity : null) ||
    (destCountryRaw ? String(destCountryRaw) : null) ||
    bol?.raw?.destination_port ||
    bol?.raw?.us_port ||
    bol?.raw?.destination ||
    "—"
  );
}

export function getBolCarrierString(bol: any): string {
  return (
    bol?.carrierName ||
    bol?.carrier?.carrierName ||
    (typeof bol?.carrier === "string" ? bol.carrier : null) ||
    bol?.carrier_name ||
    bol?.normalized_carrier ||
    bol?.inferred_carrier ||
    bol?.steamship_line ||
    bol?.steamshipLine ||
    bol?.shipping_line ||
    bol?.shippingLine ||
    bol?.carrierCode ||
    bol?.carrier?.carrierCode ||
    bol?.scac ||
    bol?.master_bill_prefix ||
    bol?.mbl_prefix ||
    bol?.raw?.carrier_name ||
    bol?.raw?.shipping_line ||
    bol?.raw?.scac ||
    "—"
  );
}

export function getBolSupplier(bol: any): string {
  return (
    bol?.supplierName ||
    bol?.supplier_name ||
    bol?.Shipper_Name ||
    bol?.shipper_name ||
    bol?.shipperName ||
    bol?.shipper_basename ||
    bol?.topServiceProvider ||
    (typeof bol?.supplier === "string" ? bol.supplier : null) ||
    (typeof bol?.shipper === "string" ? bol.shipper : null) ||
    bol?.notify_party ||
    bol?.notifyParty ||
    bol?.notify_party_name ||
    bol?.Notify_Party_Name ||
    bol?.raw?.shipper_name ||
    bol?.raw?.supplier_name ||
    bol?.raw?.notify_party_name ||
    "—"
  );
}

export function getBolHs(bol: any): string {
  return (
    bol?.hsCode ||
    bol?.hs_code ||
    bol?.HS_Code ||
    bol?.hts_code ||
    bol?.htsCode ||
    bol?.HTS_Code ||
    bol?.commodity_code ||
    bol?.commodityCode ||
    bol?.raw?.hs_code ||
    bol?.raw?.hts_code ||
    "—"
  );
}

export function getBolDescription(bol: any): string {
  return (
    bol?.description ||
    bol?.product_description ||
    bol?.productDescription ||
    bol?.commodity ||
    bol?.commodity_description ||
    bol?.commodityDescription ||
    bol?.goods_description ||
    bol?.goodsDescription ||
    bol?.cargo_description ||
    bol?.cargoDescription ||
    bol?.raw?.product_description ||
    bol?.raw?.commodity_description ||
    ""
  );
}

export function readCarrier(
  bol: any,
): { name: string; inferred: boolean } | null {
  // v200 emits camelCase carrierName / nested carrier.carrierName as well
  // as the legacy snake_case carrier_name. Prefer string fields, fall
  // through to nested objects, then to inferred MBL prefix.
  const directCandidate =
    bol?.carrierName ||
    bol?.carrier_name ||
    bol?.normalized_carrier ||
    (typeof bol?.carrier === "string" ? bol.carrier : null) ||
    bol?.carrier?.carrierName ||
    bol?.carrier?.name ||
    bol?.shippingLine ||
    bol?.shipping_line ||
    bol?.steamshipLine ||
    bol?.steamship_line ||
    bol?.raw?.carrierName ||
    bol?.raw?.carrier_name ||
    bol?.raw?.shipping_line ||
    null;
  if (directCandidate && String(directCandidate).trim()) {
    return { name: String(directCandidate).trim(), inferred: false };
  }
  // No code-side normalization of MBL prefixes per design directive — we
  // surface the prefix verbatim so a future enrichment pass can map it to
  // a canonical carrier name.
  const mbl =
    bol?.master_bill_of_lading_number ||
    bol?.masterBillOfLadingNumber ||
    bol?.mbl ||
    bol?.raw?.master_bill_of_lading_number ||
    null;
  if (mbl) {
    const prefix = String(mbl).slice(0, 4).toUpperCase();
    if (/^[A-Z]{4}$/.test(prefix)) {
      return { name: prefix, inferred: true };
    }
  }
  return null;
}
