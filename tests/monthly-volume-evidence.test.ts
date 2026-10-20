import { expect, it } from 'vitest';
import { evidenceMonth, monthlyVolumeEvidence } from '../supabase/functions/_shared/monthly_volume_evidence';
it('preserves source totals and DD/MM months without extrapolating classifications', () => {
  const series = { '01/08/2026': { shipments: 1419, teu: 2300 }, '01/09/2026': { shipments: 0, teu: 0 } };
  const bols = [{ date: '05/08/2026', lcl: true }, { date: '06/08/2026', lcl: false }, { date: '07/08/2026' }];
  const months = monthlyVolumeEvidence(series, bols, new Date('2026-10-19'));
  expect(evidenceMonth('01/08/2026')).toBe('2026-08');
  expect(months['2026-08']).toMatchObject({ shipments: 1419, teu: 2300, fcl: 1, lcl: 1 });
  expect(months['2026-09'].shipments).toBe(0);
  expect(monthlyVolumeEvidence({ '2026-08': { shipments: 9, fcl: 4, lcl: 2 } }, bols, new Date('2026-10-19'))['2026-08']).toMatchObject({ fcl: 4, lcl: 2 });
});
