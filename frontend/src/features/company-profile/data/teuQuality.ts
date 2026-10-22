/** Plausibility screening, not TEU correction.
 * Conservative threshold: 100 TEU per bill of lading in a monthly aggregate.
 * A BOL can represent many containers, so values exceeding the threshold are
 * flagged for verification rather than silently normalized or overwritten.
 */
export const MAX_UNVERIFIED_TEU_PER_SHIPMENT = 100;
export function isSuspiciousTeu(shipments: unknown, teu: unknown): boolean {
  if (teu === null || teu === undefined || teu === "") return false;
  const v = Number(teu);
  const s = Number(shipments);
  return !Number.isFinite(v) || v < 0 ||
    !Number.isFinite(s) || s < 0 ||
    (v > 0 && s <= 0) ||
    (s > 0 && v / s > MAX_UNVERIFIED_TEU_PER_SHIPMENT);
}
export function auditMonthlyTeu(rows: Array<{shipments: unknown;teu:unknown}>){
  const flagged = rows.filter(x=>isSuspiciousTeu(x.shipments,x.teu));
  return { valid:flagged.length===0, flaggedMonths:flagged.length };
}
