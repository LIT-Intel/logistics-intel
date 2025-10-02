import type { RfpPayload, RfpLane, RfpRate, RfpRateCharge, Mode } from '@/types/rfp';
import { SYN, REGEX_HINTS, UOM_CANON } from './dictionaries';

type Sheet = { name: string; rows: Record<string, any>[] };
type Score = { laneScore: number; rateScore: number };

const norm = (s: any) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const headerKey = (s: string) => norm(s).replace(/[^a-z0-9]+/g, ' ');

function colMatchScore(col: string, synonyms: string[]): number {
  const h = headerKey(col);
  let score = 0;
  for (const syn of synonyms) {
    if (h.includes(syn)) score += syn.length >= 4 ? 2 : 1;
  }
  return score;
}

function findBest(cols: string[], synonyms: string[]): string | undefined {
  let best: { col?: string; score: number } = { score: 0 };
  for (const c of cols) {
    const s = colMatchScore(c, synonyms);
    if (s > best.score) best = { col: c, score: s };
  }
  return best.score >= 2 ? best.col : undefined;
}

function detectMode(val: any): Mode | undefined {
  const v = norm(val);
  if (/ocean|sea|fcl|lcl/.test(v)) return /fcl/.test(v) ? 'FCL' : /lcl/.test(v) ? 'LCL' : 'OCEAN';
  if (/air|awb|iata/.test(v)) return 'AIR';
  if (/truck|road/.test(v)) return 'TRUCK';
  if (/rail/.test(v)) return 'RAIL';
  return undefined;
}

function canonUom(uomText: string): RfpRateCharge['uom'] {
  const t = norm(uomText);
  for (const u of UOM_CANON) {
    if (u.hints.some(h => t.includes(h))) return u.key as RfpRateCharge['uom'];
  }
  if (REGEX_HINTS.kg.test(t)) return 'per_kg';
  if (REGEX_HINTS.cbm.test(t)) return 'per_cbm';
  return 'flat';
}

function scoreSheet(cols: string[]): Score {
  const laneKeys = [ ...Object.values(SYN.lanes).flat() ];
  const rateKeys = [ ...Object.values(SYN.rates).flat() ];
  const laneScore = cols.reduce((acc, c) => acc + (laneKeys.some(k => headerKey(c).includes(k)) ? 2 : 0), 0);
  const rateScore = cols.reduce((acc, c) => acc + (rateKeys.some(k => headerKey(c).includes(k)) ? 2 : 0), 0);
  return { laneScore, rateScore };
}

export function detectFromSheets(sheets: Sheet[]): RfpPayload {
  const meta: RfpPayload['meta'] = { currency: 'USD' };
  const lanes: RfpLane[] = [];
  const rates: RfpRate[] = [];
  const sheetRanks: { sheet: string; laneScore: number; rateScore: number }[] = [];

  for (const sh of sheets) {
    const cols = Object.keys(sh.rows[0] ?? {}).filter(Boolean);
    const { laneScore, rateScore } = scoreSheet(cols);
    sheetRanks.push({ sheet: sh.name, laneScore, rateScore });

    if (sh.rows.length <= 10) {
      const firstRow = sh.rows.find(r => Object.values(r).some(Boolean)) ?? {};
      for (const [k, syns] of Object.entries(SYN.meta)) {
        const bestCol = findBest(cols, syns);
        if (bestCol && firstRow[bestCol] != null) (meta as any)[k] = String(firstRow[bestCol]).trim();
      }
    }

    if (laneScore >= 2 && sh.rows.length) {
      const colsL = Object.keys(sh.rows[0] ?? {});
      const pick = (key: keyof typeof SYN['lanes']) => findBest(colsL, SYN.lanes[key]);
      const c = {
        mode: pick('mode'),
        incoterm: pick('incoterm'),
        origin_country: pick('origin_country'),
        origin_city: pick('origin_city'),
        origin_port: pick('origin_port'),
        origin_airport: pick('origin_airport'),
        dest_country: pick('dest_country'),
        dest_city: pick('dest_city'),
        dest_port: pick('dest_port'),
        dest_airport: pick('dest_airport'),
        service_level: pick('service_level'),
        equipment: pick('equipment'),
        weight_kg: pick('weight_kg'),
        volume_cbm: pick('volume_cbm'),
        shipments_per_year: pick('shipments_per_year'),
      } as const;

      for (const row of sh.rows) {
        const lane: RfpLane = {
          mode: c.mode ? (detectMode(row[c.mode]) ?? undefined) : undefined,
          incoterm: c.incoterm ? String(row[c.incoterm] ?? '').trim() : undefined,
          origin: {
            country: c.origin_country ? String(row[c.origin_country] ?? '').trim() : undefined,
            city: c.origin_city ? String(row[c.origin_city] ?? '').trim() : undefined,
            port: c.origin_port ? String(row[c.origin_port] ?? '').trim() : undefined,
            airport: c.origin_airport ? String(row[c.origin_airport] ?? '').trim() : undefined,
          },
          destination: {
            country: c.dest_country ? String(row[c.dest_country] ?? '').trim() : undefined,
            city: c.dest_city ? String(row[c.dest_city] ?? '').trim() : undefined,
            port: c.dest_port ? String(row[c.dest_port] ?? '').trim() : undefined,
            airport: c.dest_airport ? String(row[c.dest_airport] ?? '').trim() : undefined,
          },
          service_level: c.service_level ? String(row[c.service_level] ?? '').trim() : undefined,
          equipment: c.equipment ? String(row[c.equipment] ?? '').trim() : undefined,
          demand: {
            shipments_per_year: c.shipments_per_year ? (Number(row[c.shipments_per_year] ?? '') || undefined) as number|undefined : undefined,
            avg_weight_kg: c.weight_kg ? (Number(row[c.weight_kg] ?? '') || undefined) as number|undefined : undefined,
            avg_volume_cbm: c.volume_cbm ? (Number(row[c.volume_cbm] ?? '') || undefined) as number|undefined : undefined,
          },
        };
        if (Object.values(lane.origin ?? {}).some(Boolean) || Object.values(lane.destination ?? {}).some(Boolean)) {
          lanes.push(lane);
        }
      }
    }

    if (rateScore >= 2 && sh.rows.length) {
      const colsL = Object.keys(sh.rows[0] ?? {});
      const pickR = (key: keyof typeof SYN['rates']) => findBest(colsL, SYN.rates[key]);
      const c = {
        mode: pickR('mode'),
        container_type: pickR('container_type'),
        uom: pickR('uom'),
        rate: pickR('rate'),
        min: pickR('min'),
        currency: pickR('currency'),
        origin_port: pickR('origin_port'),
        dest_port: pickR('dest_port'),
        origin_airport: pickR('origin_airport'),
        dest_airport: pickR('dest_airport'),
        charge_name: pickR('charge_name'),
      } as const;

      for (const row of sh.rows) {
        const scope = {
          mode: c.mode ? detectMode(row[c.mode]) : undefined,
          equipment: c.container_type ? String(row[c.container_type] ?? '').trim() : undefined,
          origin_port: c.origin_port ? String(row[c.origin_port] ?? '').trim() : undefined,
          dest_port: c.dest_port ? String(row[c.dest_port] ?? '').trim() : undefined,
          origin_airport: c.origin_airport ? String(row[c.origin_airport] ?? '').trim() : undefined,
          dest_airport: c.dest_airport ? String(row[c.dest_airport] ?? '').trim() : undefined,
        } as RfpRate['scope'];

        const chargeName = c.charge_name ? String(row[c.charge_name] ?? '').trim() : 'Base Freight';
        const uomText = c.uom ? String(row[c.uom] ?? '').trim() : '';
        const charge: RfpRateCharge = {
          name: chargeName || 'Base Freight',
          uom: canonUom(uomText),
          rate: c.rate ? Number(String(row[c.rate]).replace(/[^0-9.\-]/g, '')) || 0 : 0,
          min: c.min ? (Number(String(row[c.min]).replace(/[^0-9.\-]/g, '')) || undefined) : undefined,
          currency: (c.currency && String(row[c.currency] ?? '').trim()) || undefined,
        };

        const existing = rates.find(r =>
          (r.scope?.mode ?? '') === (scope?.mode ?? '') &&
          (r.scope?.equipment ?? '') === (scope?.equipment ?? '') &&
          (r.scope?.origin_port ?? '') === (scope?.origin_port ?? '') &&
          (r.scope?.dest_port ?? '') === (scope?.dest_port ?? '') &&
          (r.scope?.origin_airport ?? '') === (scope?.origin_airport ?? '') &&
          (r.scope?.dest_airport ?? '') === (scope?.dest_airport ?? '')
        );

        if (existing) {
          existing.charges.push(charge);
        } else {
          rates.push({ mode: scope?.mode, scope, currency: charge.currency, charges: [charge] });
        }
      }
    }
  }

  const laneHits = lanes.length > 0 ? 1 : 0;
  const rateHits = rates.length > 0 ? 1 : 0;
  const confidence = Math.min(1, 0.2 + 0.2 * sheetRanks.filter(s => s.laneScore >= 4).length + 0.2 * sheetRanks.filter(s => s.rateScore >= 4).length + 0.2 * laneHits + 0.2 * rateHits);

  return { meta, lanes, rates, __diagnostics: { sheetRanks, confidence } };
}
