/** ImportYeti dates are DD/MM/YYYY. Counts retain their source scope. */
export function evidenceMonth(value: unknown): string | null {
  const text = String(value ?? '').trim();
  const iso = text.match(/^(\d{4})-(\d{2})(?:$|-)/);
  const dma = text.match(/^\d{1,2}\/(\d{1,2})\/(\d{4})$/);
  const year = Number(iso?.[1] ?? dma?.[2]);
  const month = Number(iso?.[2] ?? dma?.[1]);
  return year >= 1900 && month >= 1 && month <= 12 ? `${year}-${String(month).padStart(2, '0')}` : null;
}

export type EvidenceMonth = { shipments: number; teu: number; weight: number; fcl: number; lcl: number };
const nonnegative = (v: unknown): number | null => v != null && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null;

/** Full monthly totals plus observed classifications; never scale a BOL sample. */
export function monthlyVolumeEvidence(series: any, bols: any[] = [], now = new Date()): Record<string, EvidenceMonth> {
  const months: Record<string, EvidenceMonth> = {};
  const explicit = new Set<string>();
  const currentMonth = now.toISOString().slice(0, 7);
  const entries = Array.isArray(series)
    ? series.map(row => [row?.month ?? row?.date ?? row?.period ?? row?.label, row])
    : Object.entries(series ?? {});
  for (const [key, row] of entries) {
    const month = evidenceMonth(key);
    if (!month || month > currentMonth) continue;
    const fcl = nonnegative(row?.fcl_count ?? row?.fclShipments ?? row?.fcl);
    const lcl = nonnegative(row?.lcl_count ?? row?.lclShipments ?? row?.lcl);
    const shipments = nonnegative(row?.shipments ?? row?.total_shipments ?? row?.count) ?? (fcl ?? 0) + (lcl ?? 0);
    const validSplit = (fcl ?? 0) + (lcl ?? 0) <= shipments;
    months[month] = { shipments, teu: nonnegative(row?.teu ?? row?.total_teu) ?? 0, weight: nonnegative(row?.weight ?? row?.total_weight) ?? 0,
      fcl: validSplit ? fcl ?? 0 : 0, lcl: validSplit ? lcl ?? 0 : 0 };
    if (fcl != null || lcl != null) explicit.add(month);
  }
  const splits = new Map<string, { fcl: number; lcl: number }>();
  const seen = new Set<string>();
  for (const bol of Array.isArray(bols) ? bols : []) {
    const month = evidenceMonth(bol?.date_formatted ?? bol?.date ?? bol?.shipped_on ?? bol?.arrival_date);
    if (!month || !months[month] || explicit.has(month)) continue;
    const id = bol?.bol_number ?? bol?.bill_of_lading ?? bol?.id;
    if (id && seen.has(String(id))) continue;
    if (id) seen.add(String(id));
    const split = splits.get(month) ?? { fcl: 0, lcl: 0 };
    if (bol?.lcl === true) split.lcl++;
    else if (bol?.lcl === false) split.fcl++;
    splits.set(month, split);
  }
  for (const [month, split] of splits) {
    if (split.fcl + split.lcl <= months[month].shipments) Object.assign(months[month], split);
  }
  return months;
}
