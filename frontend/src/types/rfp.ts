export type RfpMeta = {
  bid_name: string;
  customer: string;
  valid_from: string; // YYYY-MM-DD
  valid_to: string;   // YYYY-MM-DD
  contact_name: string;
  contact_email: string;
  currency: string;   // e.g. USD
};

export type RfpLocation = {
  country?: string;
  city?: string;
  port?: string;
  airport?: string;
};

export type RfpLaneDemand = {
  shipments_per_year: number;
  avg_weight_kg?: number;
  avg_volume_cbm?: number;
};

export type RfpLane = {
  mode: 'AIR'|'OCEAN'|'LCL'|'FCL'|'TRUCK';
  incoterm?: string;
  origin: RfpLocation;
  destination: RfpLocation;
  service_level?: string;
  equipment?: string;
  demand: RfpLaneDemand;
};

export type RfpCharge = {
  name: string;
  uom: 'per_kg'|'per_cbm'|'per_cnt'|'per_shpt'|'flat';
  rate: number;
  min?: number;
};

export type RfpRateScope = {
  origin_port?: string;
  dest_port?: string;
  origin_airport?: string;
  dest_airport?: string;
  equipment?: string;
};

export type RfpRate = {
  mode: 'AIR'|'OCEAN'|'LCL'|'FCL'|'TRUCK';
  scope: RfpRateScope;
  currency: string;
  charges: RfpCharge[];
};

export type RfpPayload = {
  meta: RfpMeta;
  lanes: RfpLane[];
  rates: RfpRate[];
};

export type PricedLineItem = {
  name: string;
  uom: RfpCharge['uom'];
  rate: number;
  qty: number;
  extended: number;
  minApplied?: boolean;
};

export type PricedLane = {
  laneIndex: number;
  mode: RfpLane['mode'];
  equipment?: string;
  charges: PricedLineItem[];
  unitCost: number;     // per shipment
  annualCost: number;   // shipments_per_year * unitCost
};

export type PricedResult = {
  lanes: PricedLane[];
  totalAnnual: number;
};
