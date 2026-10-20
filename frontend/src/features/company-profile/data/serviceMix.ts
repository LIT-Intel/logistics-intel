export type ServiceMix = { fcl: number; lcl: number; total: number };

/** containers_load is company-wide all-time evidence, never a monthly split. */
export function sourceServiceMix(loads: unknown): ServiceMix | null {
  if (!Array.isArray(loads)) return null;
  const counts = { fcl: 0, lcl: 0 };
  let found = false;
  for (const row of loads) {
    const mode = String(row?.load_type ?? '').toUpperCase();
    const count = row?.shipments;
    if ((mode !== 'FCL' && mode !== 'LCL') || count == null || count === '' || !Number.isFinite(Number(count)) || Number(count) < 0) continue;
    counts[mode === 'FCL' ? 'fcl' : 'lcl'] += Number(count);
    found = true;
  }
  const total = counts.fcl + counts.lcl;
  return found && total > 0 ? { ...counts, total } : null;
}

export function hasCompleteMonthlyModes(cadence: Array<{ services: { unknown: number } }>): boolean {
  return cadence.every(month => month.services.unknown === 0);
}
