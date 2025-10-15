import type { RfpLane, RfpRate, RfpRateScope, RfpRateCharge, PricedLane, PricedLineItem, PricedResult } from '@/types/rfp';
import { defaultTemplates, pickTemplateKey, type RateTemplates } from './templates';

function matchesScope(lane: RfpLane, scope: RfpRateScope): boolean {
  const modeOk = true; // caller filters by mode already
  const eq = (a?: string, b?: string) => !a || !b || String(a).toUpperCase() === String(b).toUpperCase();
  const originOk = eq(scope.origin_port, lane.origin?.port) && eq(scope.origin_airport, lane.origin?.airport);
  const destOk   = eq(scope.dest_port, lane.destination?.port) && eq(scope.dest_airport, lane.destination?.airport);
  const equipOk  = eq(scope.equipment, lane.equipment);
  return modeOk && originOk && destOk && equipOk;
}

export function matchRate(lane: RfpLane, rates: RfpRate[]): RfpRate[] {
  const sameMode = rates.filter(r => r.mode === lane.mode);
  const exact = sameMode.filter(r => r.scope && matchesScope(lane, r.scope));
  if (exact.length) return exact;
  // Fallback: same mode, ignore equipment
  const relaxed = sameMode.filter(r => {
    const s: RfpRateScope = { ...(r.scope||{}), equipment: undefined };
    return matchesScope({ ...lane, equipment: undefined }, s);
  });
  return relaxed.length ? relaxed : sameMode;
}

function qtyForCharge(charge: RfpRateCharge, lane: RfpLane): number {
  const u = charge.uom;
  if (u === 'flat') return 1;
  if (u === 'per_shpt') return 1;
  if (u === 'per_kg') return Math.max(0, Number(lane.demand?.avg_weight_kg || 0));
  if (u === 'per_cbm') return Math.max(0, Number(lane.demand?.avg_volume_cbm || 0));
  if (u === 'per_cnt') return 1; // container/unit per shipment
  return 1;
}

export function priceLane(lane: RfpLane, rate: RfpRate): PricedLane {
  const items: PricedLineItem[] = [];
  for (const c of rate.charges || []) {
    const qty = qtyForCharge(c, lane);
    let extended = qty * c.rate;
    let minApplied = false;
    if (typeof c.min === 'number' && c.min > 0 && extended < c.min) {
      extended = c.min;
      minApplied = true;
    }
    items.push({ name: c.name, uom: c.uom, rate: c.rate, qty, extended, minApplied });
  }
  const unitCost = items.reduce((s, i) => s + (Number(i.extended) || 0), 0);
  const shipments = Math.max(0, Number(lane.demand?.shipments_per_year || 0));
  const annualCost = unitCost * shipments;
  return { laneIndex: -1, mode: (lane.mode || 'OCEAN') as NonNullable<RfpLane['mode']>, equipment: lane.equipment, charges: items, unitCost, annualCost };
}

export function priceAll(lanes: RfpLane[], rates: RfpRate[], templates?: RateTemplates): PricedResult {
  const priced: PricedLane[] = [];
  for (let i=0; i<lanes.length; i++) {
    const lane = lanes[i];
    let candidates = matchRate(lane, rates);
    let chosen = candidates[0] || null;
    // If no explicit rates, synthesize from templates
    if (!chosen) {
      const key = pickTemplateKey(lane.mode, lane.equipment);
      const tmpl = (templates || defaultTemplates)[key];
      const synthetic: RfpRate = {
        mode: lane.mode,
        scope: { equipment: lane.equipment },
        currency: tmpl.base.currency || 'USD',
        charges: [tmpl.base, ...tmpl.accessorials],
      };
      chosen = synthetic;
    }
    const pl = priceLane(lane, chosen);
    pl.laneIndex = i;
    priced.push(pl);
  }
  const totalAnnual = priced.reduce((s, p) => s + p.annualCost, 0);
  return { lanes: priced, totalAnnual };
}
