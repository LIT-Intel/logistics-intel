import { explicitForwarder } from "@/lib/intelEvidence";
import { useCompanyForwarderEvidence } from "@/lib/harvey/companyForwarderEvidence";
import type { ForwarderEvidence } from "@/lib/harvey/forwarderEvidence";

const roleLabel:Record<ForwarderEvidence["role"],string>={
  direct_to_carrier:"Reported direct booking",
  freight_intermediary:"Forwarder / NVOCC",
  ocean_carrier:"Ocean carrier",
  unclassified:"Provider · role unverified",
};

export default function IncumbentForwarderCard({
  bols,companyName,website,
}: {
  bols:any[];
  companyName:string;
  website?:string|null;
}) {
  const { data, isLoading, isError, refetch }=useCompanyForwarderEvidence(companyName,website);
  const counts=new Map<string,number>();
  for (const bol of bols) {
    const name=explicitForwarder(bol);
    if(name)counts.set(name,(counts.get(name)||0)+1);
  }
  const entries=data?.entries??[];
  const hasEvidence=entries.length>0||counts.size>0;
  return <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Freight forwarders and booking relationships">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-slate-900">Forwarders & booking relationships</h3>
      {data?.sourceUpdatedAt&&<span className="text-[10px] text-slate-500">Directory updated {new Date(data.sourceUpdatedAt).toLocaleDateString("en-US")}</span>}
    </div>
    {isLoading&&<p role="status" className="mt-3 text-xs text-slate-500">Checking existing provider records…</p>}
    {isError&&<div role="alert" className="mt-3 text-xs text-amber-700">Provider history could not be loaded. <button type="button" className="underline" onClick={()=>void refetch()}>Retry</button></div>}
    {entries.length>0&&<div className="mt-3">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Company-level historical provider data</p>
      <div className="space-y-2">{entries.map((entry,i)=><div key={entry.name+"-"+i} className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
        <div className="flex justify-between gap-3">
          <span className="min-w-0 text-[12px] font-semibold text-slate-800">{entry.normalizedName}</span>
          <span className="shrink-0 text-[10px] font-semibold text-slate-600">{entry.role==="direct_to_carrier"?"Direct label":entry.role==="unclassified"?"Unverified role":roleLabel[entry.role]}</span>
        </div>
        {entry.normalizedName!==entry.name&&<p className="mt-1 text-[10px] text-slate-500">As reported: {entry.name}</p>}
        <p className="mt-1 text-[11px] text-slate-600">{entry.reportedPercent!=null?`Source share ${entry.reportedPercent.toFixed(1)}%`:"Source share unavailable"}
          {entry.reportedTeu!=null?" · Provider-reported "+entry.reportedTeu.toLocaleString()+" TEU":""}
        </p>
      </div>)}</div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        Source: {data?.sourceFile||"company directory"}, stored in LIT. Figures are provider-reported history with an unspecified reporting window, not verified last-12-month or specific-lane shares. TEU figures are not cleared for analytics or ranking until data-quality checks pass. Labels do not independently prove current booking control.
      </p>
    </div>}
    {counts.size>0&&<div className="mt-4 border-t border-slate-100 pt-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Explicit forwarder fields in available BOLs</p>
      <ul className="mt-2 space-y-2 text-[11px]">{[...counts].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,count])=>
        <li key={name} className="flex justify-between gap-2"><span>{name}</span><strong>{count} sampled BOLs</strong></li>)}</ul>
      <p className="mt-2 text-[10px] text-slate-500">Only explicitly labeled forwarder fields; notify parties and shippers are not assumed to be forwarders.</p>
    </div>}
    {!isLoading&&!isError&&!hasEvidence&&<p className="mt-3 text-xs leading-relaxed text-slate-500">No matching company-level provider record or BOL-confirmed forwarder is available. This is not evidence that the company books direct.</p>}
  </section>;
}
