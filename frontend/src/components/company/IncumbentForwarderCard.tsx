import { explicitForwarder } from "@/lib/intelEvidence";
import { useCompanyForwarderEvidence } from "@/lib/harvey/companyForwarderEvidence";
import type { ForwarderEvidence } from "@/lib/harvey/forwarderEvidence";

const roleLabel: Record<ForwarderEvidence["role"], string> = {
  freight_intermediary:"Forwarder / intermediary",
  ocean_carrier:"Ocean carrier",
  direct_to_carrier:"Direct booking (reported)",
  unclassified:"Provider (unclassified)",
};
function ProviderLine({entry}:{entry:ForwarderEvidence}){
  return <li className="flex items-start justify-between gap-2 border-b border-slate-100 py-2 last:border-0">
    <div className="min-w-0">
      <div className="break-words text-[12px] font-semibold text-slate-800">{entry.normalizedName}</div>
      <div className="mt-0.5 text-[10px] text-slate-500">{roleLabel[entry.role]} · {entry.classificationBasis==="unverified"?"Type unverified":"Reviewed label"}</div>
    </div>
    {entry.reportedPercent!==null?<span className="shrink-0 text-[11px] font-semibold text-slate-700">{entry.reportedPercent.toFixed(1)}%*</span>:null}
  </li>;
}
/** Display directory evidence and actual BOL evidence separately.
 * Never equate directory provider history with a named lane incumbent.
 */
export default function IncumbentForwarderCard({bols,companyName,website}:{
  bols:any[];companyName?:string;website?:string|null;
}){
  const q=useCompanyForwarderEvidence(companyName||"",website);
  const direct=new Map<string,number>();
  for(const bol of (bols||[])){
    const name=explicitForwarder(bol);
    if(name) direct.set(name,(direct.get(name)||0)+1);
  }
  const entries=q.data?.entries??[];
  return <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Forwarder and booking intelligence">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-slate-900">Forwarder & booking intelligence</h3>
      {entries.length>0?<span className="rounded bg-teal-50 px-2 py-1 text-[10px] font-semibold text-teal-800">Source-reported</span>:null}
    </div>
    {q.isPending&&companyName?<p role="status" className="mt-2 text-xs text-slate-500">Checking historical provider data…</p>:null}
    {q.isError?<p role="alert" className="mt-2 text-xs text-amber-700">Provider directory lookup unavailable. <button type="button" className="underline" onClick={()=>void q.refetch()}>Retry</button></p>:null}
    {entries.length>0?<>
      <p className="mt-2 text-[11px] leading-5 text-slate-500">Historical company-level service-provider mix from {q.data?.sourceFile||"LIT directory"}. Not independently verified for the current 12 months or a particular trade lane.</p>
      <ul className="mt-2">{entries.slice(0,6).map((e,i)=><ProviderLine key={e.name+"-"+i} entry={e}/>)}</ul>
      <p className="mt-2 text-[10px] leading-4 text-slate-500">* Provider-reported share. TEU volumes withheld while source integrity is under review. Entries marked “Ocean carrier” are not assumed freight forwarders.</p>
    </>:!q.isPending&&!q.isError?<p className="mt-2 text-xs leading-5 text-slate-500">No uniquely matched historical service-provider record for this company.</p>:null}
    {direct.size>0?<div className="mt-3 border-t border-slate-200 pt-3">
      <div className="text-[11px] font-bold text-slate-700">Explicit forwarders in detailed BOLs</div>
      <ul className="mt-1 space-y-1">{[...direct].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,count])=><li key={name} className="flex justify-between gap-2 text-[11px]"><span>{name}</span><span>{count} documents</span></li>)}</ul>
      <p className="mt-2 text-[10px] text-slate-500">Only BOL fields explicitly naming a forwarder count here. Carrier, shipper and notify-party names are not substituted.</p>
    </div>:null}
  </section>;
}
