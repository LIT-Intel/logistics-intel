export const SYN = {
  meta: {
    bid_name: ['bid name', 'rfp name', 'project', 'tender', 'opportunity'],
    customer: ['customer', 'company', 'client', 'buyer'],
    valid_from: ['valid from', 'start date', 'effective from'],
    valid_to: ['valid to', 'end date', 'expires', 'validity end'],
    contact_name: ['contact', 'contact name', 'attn', 'attention'],
    contact_email: ['email', 'e-mail'],
    currency: ['currency', 'cur', 'iso currency'],
  },
  lanes: {
    mode: ['mode', 'transport mode', 'service mode'],
    incoterm: ['incoterm', 'terms'],
    origin_country: ['origin country', 'por country', 'pol country'],
    origin_city: ['origin city', 'city of origin', 'pickup city'],
    origin_port: ['pol', 'port of loading', 'origin port', 'origin port code', 'origin portcode'],
    origin_airport: ['origin airport', 'orig airport', 'iata origin'],
    dest_country: ['destination country', 'dest country', 'pod country'],
    dest_city: ['destination city', 'dest city', 'delivery city'],
    dest_port: ['pod', 'port of discharge', 'destination port', 'destination port code', 'dest port code'],
    dest_airport: ['dest airport', 'destination airport', 'iata dest'],
    service_level: ['service level', 'service', 'tier'],
    equipment: ['equipment', 'container', 'cntr type', 'uld'],
    weight_kg: ['weight', 'kg', 'avg kg', 'chargeable kg'],
    volume_cbm: ['cbm', 'volume', 'm3', 'avg cbm'],
    shipments_per_year: ['shipments per year', 'annual shipments', 'frequency', 'per year', 'py'],
  },
  rates: {
    charge_name: ['charge', 'surcharge', 'fee', 'component', 'line item', 'fsc', 'othc', 'dthc', 'cartage', 'documentation', 'doc fee', 'storage per diem', 'dem per diem'],
    uom: ['uom', 'per', 'unit', 'basis', 'calc basis', 'base per kg'],
    rate: ['rate', 'amount', 'price', 'cost'],
    min: ['min', 'minimum'],
    currency: ['currency', 'cur'],
    container_type: ['container', 'equipment', 'cntr'],
    origin_port: ['origin port', 'pol', 'origin port code', 'pol code'],
    dest_port: ['destination port', 'pod', 'destination port code', 'pod code'],
    origin_airport: ['origin airport'],
    dest_airport: ['destination airport'],
    mode: ['mode', 'transport mode'],
  },
};

export const REGEX_HINTS = {
  iata: /^[A-Z]{3}$/,
  iso2: /^[A-Z]{2}$/,
  hs4: /^\d{4}$/,
  kg: /(kg|kilogram)/i,
  cbm: /(cbm|m3|cubic)/i,
  currency: /(usd|eur|gbp|currency)/i,
  money: /^\$?\s?\d+([.,]\d+)?$/,
};

export const UOM_CANON = [
  { key: 'per_kg', hints: ['kg', '/kg', 'per kg'] },
  { key: 'per_cbm', hints: ['cbm', '/cbm', 'per cbm', 'm3'] },
  { key: 'per_cnt', hints: ['container', 'per cntr', '/cnt', 'per container'] },
  { key: 'per_shpt', hints: ['per shipment', '/shpt', 'shipment'] },
  { key: 'flat', hints: ['flat', 'lump sum'] },
] as const;
