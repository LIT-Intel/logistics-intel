export interface ImportYetiHistoricalLane {
 origin_country: string;
 destination_country: string;
 origin_port: string | null;
 destination_port: string | null;
 shipments: number;
 teu: number | null;
 scope: "historical_all_time";
}
/** lane_permutations are cumulative over the source date_range, NEVER 12M or YTD. */
export function parseHistoricalLanePermutations(raw: unknown): ImportYetiHistoricalLane[] {
 if (!Array.isArray(raw)) return [];
 const rows: ImportYetiHistoricalLane[] = [];
 const clean = (v: unknown) => typeof v === "string" && v.trim() ? v.trim().slice(0,180) : null;
 for(const item of raw) {
  if (!item || typeof item !== "object") continue;
  const r=item as Record<string,unknown>;
  const shipments=Number(r.shipments),teu=Number(r.teu);
  if (!Number.isSafeInteger(shipments)||shipments<=0||shipments>100000000) continue;
  const origin=clean(r.exit_port_country),dest=clean(r.entry_port_country);
  if (!origin||!dest) continue;
  rows.push({origin_country:origin,destination_country:dest,
   origin_port:clean(r.exit_port),destination_port:clean(r.entry_port),
   shipments,teu:Number.isFinite(teu)&&teu>=0?teu:null,
   scope:"historical_all_time"});
 }
 return rows.sort((a,b)=>b.shipments-a.shipments);
}
