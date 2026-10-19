/** Coverage describes observed records; it never rescales them. */
export function laneCoverage(observed: number, reported: number | null) {
  return { observed, reported, missing: reported == null ? null : Math.max(0, reported - observed), conflict: reported != null && observed > reported };
}

export function explicitForwarder(bol: any): string | null {
  const value = [bol?.forwarder_name, bol?.forwarder, bol?.raw?.forwarder_name].find(v => typeof v === "string" && v.trim());
  return value ? value.trim() : null;
}

export function cadenceCounts(point: any) {
  const count = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
  const fcl = count(point?.fclShipments), lcl = count(point?.lclShipments);
  const total = typeof point?.shipments === "number" && Number.isFinite(point.shipments) && point.shipments >= 0 ? point.shipments : fcl + lcl;
  if (fcl + lcl > total) return { fcl: 0, lcl: 0, total, unknown: total };
  return { fcl, lcl, total, unknown: total - fcl - lcl };
}
