export interface PulseTrackedShipment {
  bol_number: string;
  scac: string | null;
  carrier: string | null;
  origin_port: string | null;
  destination_port: string | null;
  dest_city: string | null;
  dest_state: string | null;
  dest_zip: string | null;
  container_count: number | null;
  container_type: string | null;
  lcl: boolean | null;
  hs_code: string | null;
  shipper_name?: string | null;
  tracking_status: 'tracked' | 'unsupported' | 'no_match' | 'error' | 'pending' | null;
  tracking_eta: string | null;
  tracking_arrival_actual: string | null;
  tracking_last_event_code: string | null;
  tracking_last_event_at: string | null;
  bol_date: string | null;
  estimated_arrival_date: string | null;
  estimated_arrival_low: string | null;
  estimated_arrival_high: string | null;
}

export interface PulseDrayageEstimate {
  bol_number: string;
  destination_city: string | null;
  destination_state: string | null;
  miles: number;
  containers_eq: number;
  est_cost_usd: number;
  est_cost_low_usd: number;
  est_cost_high_usd: number;
}

export interface PulseLiveData {
  shipments: PulseTrackedShipment[];
  allBols: any[];
  drayage: PulseDrayageEstimate[];
  carrierMix: { carrier: string; bol_count: number; container_count: number; tracked: boolean }[];
  loading: boolean;
  error: string | null;
}
