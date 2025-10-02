import type { RfpPayload, RfpLane, RfpRate, RfpCharge } from '@/types/rfp';

// Lightweight XLSX loader via dynamic import to avoid bundle bloat unless used
async function readWorkbook(file: File): Promise<any> {
  const XLSX = await import('xlsx');
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data);
  return wb;
}

type GuessMap = {
  lanes?: { sheet?: string; columns?: Record<string,string> };
  rates?: { sheet?: string; columns?: Record<string,string> };
};

async function loadGuessMap(): Promise<GuessMap> {
  try {
    const res = await fetch('/rfp_schema_guess.json', { cache: 'no-store' });
    if (res.ok) return res.json();
  } catch {}
  return {};
}

function toLane(row: Record<string,any>, map: Record<string,string>): RfpLane | null {
  const get = (k: string) => row[map[k] || k];
  const mode = String(get('mode') || '').toUpperCase();
  if (!mode) return null;
  const lane: RfpLane = {
    mode: (['AIR','OCEAN','LCL','FCL','TRUCK'].includes(mode) ? mode : 'OCEAN') as any,
    incoterm: String(get('incoterm')||'') || undefined,
    origin: {
      country: get('origin_country') || get('origin.country') || get('origin_country_name') || undefined,
      city: get('origin_city') || undefined,
      port: get('origin_port') || undefined,
      airport: get('origin_airport') || undefined,
    },
    destination: {
      country: get('destination_country') || get('destination.country') || get('dest_country') || undefined,
      city: get('destination_city') || undefined,
      port: get('destination_port') || undefined,
      airport: get('destination_airport') || undefined,
    },
    service_level: get('service_level') || undefined,
    equipment: get('equipment') || undefined,
    demand: {
      shipments_per_year: Number(get('shipments_per_year') || get('shipments/yr') || get('annual_shipments') || 0) || 0,
      avg_weight_kg: Number(get('avg_weight_kg') || get('avg_kg') || 0) || undefined,
      avg_volume_cbm: Number(get('avg_volume_cbm') || get('avg_cbm') || 0) || undefined,
    },
  };
  return lane;
}

function toRate(row: Record<string,any>, map: Record<string,string>): RfpRate | null {
  const get = (k: string) => row[map[k] || k];
  const mode = String(get('mode') || '').toUpperCase();
  if (!mode) return null;
  const charges: RfpCharge[] = [];
  const push = (name: string, uomKey: string, rateKey: string, minKey?: string) => {
    const rate = Number(get(rateKey));
    if (Number.isFinite(rate) && rate >= 0) {
      const uom = String(get(uomKey) || '').toLowerCase() as any;
      const min = minKey ? Number(get(minKey)) : undefined;
      charges.push({ name, uom, rate, min });
    }
  };
  // Try common charge fields; fallback: scan generic columns
  push('Base Freight','base_uom','base_rate','base_min');
  push('BAF','baf_uom','baf_rate');
  push('LSS','lss_uom','lss_rate');
  push('THC Origin','thc_o_uom','thc_o_rate');
  push('THC Dest','thc_d_uom','thc_d_rate');
  push('Doc Fee','doc_uom','doc_rate');

  const rateObj: RfpRate = {
    mode: (['AIR','OCEAN','LCL','FCL','TRUCK'].includes(mode) ? mode : 'OCEAN') as any,
    scope: {
      origin_port: get('origin_port') || undefined,
      dest_port: get('dest_port') || undefined,
      origin_airport: get('origin_airport') || undefined,
      dest_airport: get('dest_airport') || undefined,
      equipment: get('equipment') || undefined,
    },
    currency: String(get('currency') || 'USD'),
    charges,
  };
  return rateObj;
}

export async function ingestWorkbook(file: File): Promise<RfpPayload> {
  if (file.type === 'application/json' || file.name.endsWith('.json')) {
    const text = await file.text();
    const j = JSON.parse(text);
    // If already in contract format, return as-is
    if (j && j.meta && j.lanes && j.rates) return j as RfpPayload;
  }

  const guess = await loadGuessMap();
  const wb = await readWorkbook(file);
  const XLSX = await import('xlsx');

  function readSheet(name?: string) {
    const wsName = name || wb.SheetNames[0];
    const ws = wb.Sheets[wsName];
    return XLSX.utils.sheet_to_json(ws, { raw: true, defval: '' }) as Record<string,any>[];
  }

  const laneRows = readSheet(guess.lanes?.sheet);
  const rateRows = readSheet(guess.rates?.sheet);

  const lanes = laneRows.map(r => toLane(r, guess.lanes?.columns || {})).filter(Boolean) as RfpLane[];
  const rates = rateRows.map(r => toRate(r, guess.rates?.columns || {})).filter(Boolean) as RfpRate[];

  const payload: RfpPayload = {
    meta: {
      bid_name: 'Imported Bid',
      customer: 'Customer',
      valid_from: '2025-01-01',
      valid_to: '2025-12-31',
      contact_name: '',
      contact_email: '',
      currency: 'USD',
    },
    lanes,
    rates,
  };
  return payload;
}
