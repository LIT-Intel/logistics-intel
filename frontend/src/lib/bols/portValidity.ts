/**
 * Source-aware port semantics.
 * A destination country, inland consignee location, or delivery city must never
 * be presented as a verified ocean discharge port.
 * Snapshot source uses generic "destination" fields; only detailed history
 * records can support a specifically reported gateway.
 */
const invalid=new Set([
 "united states of america","united states","usa","u.s.a.","us",
 "canada","mexico","china","vietnam","viet nam","india","portugal",
 "south korea","korea","thailand","sri lanka","germany","france",
 "united kingdom","unknown","not available","n/a","—","-",
]);
const inland=new Set(["atlanta","brookhaven","conyers","marietta","smyrna","doraville"]);
export function normalizedDestination(value:unknown):string|null{
 if(typeof value!=="string")return null;
 const s=value.trim().replace(/\s+/g," ");
 if(!s||invalid.has(s.toLowerCase())||/^(united states|usa|u\.s\.a\.)\s*(of america)?$/i.test(s))return null;
 return s;
}
export function isVerifiedDischargePort(value:unknown,ingestSource:unknown):boolean{
 const name=normalizedDestination(value);
 return Boolean(name&&ingestSource==="history"&&!inland.has(name!.toLowerCase()));
}
export function hasOnlyGenericDestination(value:unknown):boolean{
 return normalizedDestination(value)===null;
}
