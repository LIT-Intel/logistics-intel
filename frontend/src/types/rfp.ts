export type Mode = 'AIR' | 'OCEAN' | 'LCL' | 'FCL' | 'TRUCK' | 'RAIL';

export type RfpMeta = {
  bid_name?: string;
  customer?: string;
  valid_from?: string; // YYYY-MM-DD
  valid_to?: string;   // YYYY-MM-DD
  contact_name?: string;
  contact_email?: string;
  currency?: string;   // default USD
};

export type RfpLocation = {
  country?: string;
  city?: string;
  port?: string;
  airport?: string;
};

export type RfpLaneDemand = {
  shipments_per_year?: number;
  avg_weight_kg?: number;
  avg_volume_cbm?: number;
};

export type RfpLane = {
  mode?: Mode;
  incoterm?: string;
  origin?: RfpLocation;
  destination?: RfpLocation;
  service_level?: string;
  equipment?: string;
  demand?: RfpLaneDemand;
};

export type RfpRateCharge = {
  name: string;
  uom: 'per_kg'|'per_cbm'|'per_cnt'|'per_shpt'|'flat';
  rate: number;
  min?: number;
  currency?: string;
};

export type RfpRateScope = {
  mode?: Mode;
  origin_port?: string;
  dest_port?: string;
  origin_airport?: string;
  dest_airport?: string;
  equipment?: string;
};

export type RfpRate = {
  mode?: Mode;
  scope?: RfpRateScope;
  currency?: string;
  charges: RfpRateCharge[];
};

export type RfpPayload = {
  meta: RfpMeta;
  lanes: RfpLane[];
  rates: RfpRate[];
  __diagnostics?: {
    sheetRanks: { sheet: string; laneScore: number; rateScore: number }[];
    confidence: number;
    unmappedHeaders?: string[];
  };
};

export type PricedLineItem = {
  name: string;
  uom: RfpRateCharge['uom'];
  rate: number;
  qty: number;
  extended: number;
  minApplied?: boolean;
};

export type PricedLane = {
  laneIndex: number;
  mode: NonNullable<RfpLane['mode']>;
  equipment?: string;
  charges: PricedLineItem[];
  unitCost: number;     // per shipment
  annualCost: number;   // shipments_per_year * unitCost
};

export type PricedResult = {
  lanes: PricedLane[];
  totalAnnual: number;
};
