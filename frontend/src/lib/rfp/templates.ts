import type { RfpRateCharge } from '@/types/rfp';

export type ModeKey = 'AIR'|'OCEAN_FCL'|'OCEAN_LCL'|'TRUCK_TL'|'TRUCK_DRAY';

export type TemplateCharges = {
  base: RfpRateCharge;
  accessorials: RfpRateCharge[];
};

export type RateTemplates = Record<ModeKey, TemplateCharges>;

export const defaultTemplates: RateTemplates = {
  AIR: {
    base: { name: 'Air Freight', uom: 'per_kg', rate: 6, min: 150, currency: 'USD' },
    accessorials: [
      { name: 'Fuel Surcharge', uom: 'per_kg', rate: 0.8, currency: 'USD' },
      { name: 'Security', uom: 'per_shpt', rate: 25, currency: 'USD' },
      { name: 'Documentation', uom: 'per_shpt', rate: 35, currency: 'USD' },
    ],
  },
  OCEAN_FCL: {
    base: { name: 'Ocean Freight (FCL)', uom: 'per_cnt', rate: 2500, currency: 'USD' },
    accessorials: [
      { name: 'BAF', uom: 'per_cnt', rate: 200, currency: 'USD' },
      { name: 'LSS', uom: 'per_cnt', rate: 50, currency: 'USD' },
      { name: 'THC Origin', uom: 'per_cnt', rate: 150, currency: 'USD' },
      { name: 'THC Dest', uom: 'per_cnt', rate: 200, currency: 'USD' },
      { name: 'Documentation', uom: 'per_shpt', rate: 45, currency: 'USD' },
    ],
  },
  OCEAN_LCL: {
    base: { name: 'Ocean Freight (LCL)', uom: 'per_cbm', rate: 55, min: 120, currency: 'USD' },
    accessorials: [
      { name: 'THC Origin', uom: 'per_shpt', rate: 35, currency: 'USD' },
      { name: 'THC Dest', uom: 'per_shpt', rate: 45, currency: 'USD' },
      { name: 'Documentation', uom: 'per_shpt', rate: 30, currency: 'USD' },
    ],
  },
  TRUCK_TL: {
    base: { name: 'Truck TL', uom: 'per_shpt', rate: 1200, currency: 'USD' },
    accessorials: [
      { name: 'Fuel Surcharge', uom: 'per_shpt', rate: 120, currency: 'USD' },
      { name: 'Stop Charge', uom: 'per_shpt', rate: 50, currency: 'USD' },
    ],
  },
  TRUCK_DRAY: {
    base: { name: 'Drayage', uom: 'per_shpt', rate: 450, currency: 'USD' },
    accessorials: [
      { name: 'Chassis', uom: 'per_shpt', rate: 40, currency: 'USD' },
      { name: 'Fuel Surcharge', uom: 'per_shpt', rate: 45, currency: 'USD' },
    ],
  },
};

export function pickTemplateKey(mode?: string, equipment?: string): ModeKey {
  const m = String(mode||'').toUpperCase();
  if (m === 'AIR') return 'AIR';
  if (m === 'OCEAN' && equipment && /20|40|HQ|GP|RF|OT/.test(equipment.toUpperCase())) return 'OCEAN_FCL';
  if (m === 'OCEAN') return 'OCEAN_LCL';
  if (m === 'TRUCK' && equipment && /DRAY|PORT|RAMP/.test(equipment.toUpperCase())) return 'TRUCK_DRAY';
  return 'TRUCK_TL';
}
