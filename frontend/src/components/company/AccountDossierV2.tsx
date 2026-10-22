import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { BarChart3, Globe2, Package, Ship, Plane, AlertCircle, ShieldCheck, TrendingUp, FileSearch } from "lucide-react";

/** Account Intelligence 2.0 — evidence-driven report, not AI-invented statistics.
 * Only mounted in the Pulse AI tab, so no additional Company Profile critical-path calls.
 * Historical monthly aggregate = full reported time series; all other rankings use
 * bounded BOL samples and explicitly declare their denominator.
 */
type MonthRow = { year:number; month:number; shipments:number|string|null; teu:number|string|null };
type DocRow = {
 bol_number:string|null; bol_date:string|null; shipper_name:string|null;
 origin_country:string|null; origin_port:string|null; destination_port:string|null;
 carrier_name:string|null; hs_code:string|null; product_description:string|null;
 transport_mode:string|null; teu:number|string|null;
};
type Rank = { name:string; count:number; teu:number };
export type BriefFacts = { companyKey:string; months:MonthRow[]; documents:DocRow[]; retrievedAt:string };
const n=(x:unknown)=> {const v=Number(x);return Number.isFinite(v)?v:0};
const fmt=(x:number)=>new Intl.NumberFormat("en-US",{maximumFractionDigits:1}).format(x);
const label=(s:string|null|undefined)=>String(s??"").trim();
const dateKey=(r:MonthRow)=>r.year*12+r.month;
const aggregate=(rows:DocRow[],field:keyof DocRow):Rank[]=>{
 const map=new Map<string,Rank>();
 for(const row of rows){const name=label(row[field] as string|null);if(!name)continue;
  const v=map.get(name)??{name,count:0,teu:0};v.count++;v.teu+=n(row.teu);map.set(name,v);}
 return [...map.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name)).slice(0,7);
};
export async function loadBriefFacts(companyKey:string):Promise<BriefFacts>{
 const key=companyKey.trim();
 if(!key || key.length>180)throw new Error("Valid shipment archive company key required");
 const [months,documents]=await Promise.all([
  supabase.from("lit_company_time_series_monthly").select("year,month,shipments,teu").eq("company_id",key).order("year").order("month").limit(600),
  supabase.from("lit_unified_shipments").select("bol_number,bol_date,shipper_name,origin_country,origin_port,destination_port,carrier_name,hs_code,product_description,transport_mode,teu")
  .eq("company_id",key).order("bol_date",{ascending:false}).limit(500),
 ]);
 if(months.error)throw new Error("Monthly source: "+months.error.message);
 if(documents.error)throw new Error("Document source: "+documents.error.message);
 return {companyKey:key,months:(months.data??[]) as MonthRow[],documents:(documents.data??[]) as DocRow[],retrievedAt:new Date().toISOString()};
}
export function useBriefFacts(companyKey:string|null|undefined){
 return useQuery({queryKey:["account-dossier-v2",companyKey],enabled:!!companyKey,
  queryFn:()=>loadBriefFacts(companyKey!),staleTime:5*60*1000,gcTime:15*60*1000,retry:1});
}
function Chart({months,metric}:{months:MonthRow[];metric:"teu"|"shipments"}){
 if(!months.length)return <p className="py-9 text-center text-xs text-slate-500">No monthly history available from this source.</p>;
 const values=months.map(m=>n(m[metric]));const max=Math.max(1,...values);
 const step=months.length>15?Math.ceil(months.length/12):1;
 const width=720,height=185,pl=10,pr=10,top=10,bottom=25,chartW=width-pl-pr,chartH=height-top-bottom;
 const coordinates=values.map((v,i)=>({x:pl+(i/(Math.max(1,values.length-1)))*chartW,y:top+chartH-(v/max)*chartH}));
 const line=coordinates.map((p,i)=>(i?"L":"M")+p.x.toFixed(1)+" "+p.y.toFixed(1)).join(" ");
 return <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={`Verified monthly ${metric} trend`}>
  {[0,.25,.5,.75,1].map(f=><line key={f} x1={pl} x2={width-pr} y1={top+chartH*f} y2={top+chartH*f} stroke="#e8edf3" strokeWidth="1"/>)}
  <path d={line} fill="none" stroke={metric==="teu"?"#099b9b":"#437df0"} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
  {coordinates.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={2.4} fill={metric==="teu"?"#099b9b":"#437df0"}/>)}
  {months.map((m,i)=>i%step===0?<text key={i} x={coordinates[i].x} y={height-4} fill="#72829a" fontSize="10" textAnchor="middle">{new Date(Date.UTC(m.year,m.month-1,1)).toLocaleDateString("en-US",{month:"short",year:"2-digit"})}</text>:null)}
 </svg>;
}
function Ranking({title,rows,total,empty}:{title:string;rows:Rank[];total:number;empty:string}){
 return <div className="rounded-xl border border-slate-200 p-4">
  <h4 className="text-[13px] font-semibold text-slate-900">{title}</h4>
  <p className="mt-1 text-[10px] text-slate-500">Shares of {total} sampled documents; not the full shipment universe</p>
  {!rows.length?<p className="py-7 text-xs text-slate-500">{empty}</p>:
   <div className="mt-4 space-y-3">{rows.map(row=>{
    const share=total?row.count/total*100:0;return <div key={row.name}>
     <div className="mb-1 flex justify-between gap-3 text-[11px]"><span className="max-w-[74%] truncate text-slate-700" title={row.name}>{row.name}</span><strong className="shrink-0 text-slate-700">{row.count} · {share.toFixed(0)}%</strong></div>
     <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-600" style={{width:`${Math.min(100,share)}%`}}/></div>
    </div>})}</div>}
 </div>;
}
function NumberTile({label,value,unit}:{label:string;value:string;unit?:string}){
 return <div className="rounded-lg border border-slate-200 bg-white px-4 py-3"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div><div className="mt-2 text-[25px] font-bold tracking-tight text-[#0e1e36]">{value}<span className="ml-1 text-xs font-normal text-slate-500">{unit}</span></div></div>;
}
function Section({id,index,title,sub,children}:{id:string;index:string;title:string;sub?:string;children:React.ReactNode}){
 return <section id={id} className="rounded-xl border border-slate-200 bg-white p-5">
 <div className="mb-4 flex items-center gap-2"><span className="rounded-md bg-teal-50 px-2 py-1 font-mono text-[11px] font-bold text-teal-700">{index}</span><div><h3 className="text-[16px] font-bold tracking-tight text-[#0e1e36]">{title}</h3>{sub&&<p className="text-[11px] text-slate-500">{sub}</p>}</div></div>{children}</section>;
}
const explain=(v:string)=> <span className="text-[11px] leading-5 text-slate-600">{v}</span>;
export default function AccountDossierV2({companyName,companyKey,report,tradeKpis,topRoutes,generatedAt}:{
 companyName:string;companyKey?:string|null;
 report?:{company_summary?:unknown;why_now?:unknown;web_sources?:Array<{title?:string;url?:string}>}|null;
 tradeKpis?:{shipments12m?:number|null;teu12m?:number|null;activeLanes?:number|null}|null;
 topRoutes?:Array<{route?:string|null;shipments?:number|null;teu?:number|null}>|null;
 generatedAt?:string|null;
}){
 const q=useBriefFacts(companyKey);
 const facts=q.data;
 const ranked=useMemo(()=>{
  const docs=facts?.documents??[];
  return {suppliers:aggregate(docs,"shipper_name"),origins:aggregate(docs,"origin_country"),ports:aggregate(docs,"destination_port"),carriers:aggregate(docs,"carrier_name"),commodities:aggregate(docs,"hs_code")};
 },[facts]);
 const ts=useMemo(()=>[...(facts?.months??[])].filter(m=>m.month>=1&&m.month<=12).sort((a,b)=>dateKey(a)-dateKey(b)),[facts]);
 const latest=ts.length?dateKey(ts[ts.length-1]):null;
 const recent=latest==null?[]:ts.filter(m=>dateKey(m)>latest-12);
 const previous=latest==null?[]:ts.filter(m=>dateKey(m)>latest-24&&dateKey(m)<=latest-12);
 const shipments=recent.reduce((sum,m)=>sum+n(m.shipments),0),teu=recent.reduce((sum,m)=>sum+n(m.teu),0);
 const prior=previous.reduce((sum,m)=>sum+n(m.shipments),0);
 const rate=prior>0?((shipments-prior)/prior*100):null;
 const docs=facts?.documents??[];
 const observedCarriers=ranked.carriers.length,air=docs.filter(d=>/^air(?:\s|$)/i.test(label(d.transport_mode))),unknown=docs.filter(d=>!label(d.transport_mode)).length;
 const topOrigin=ranked.origins[0]?.name??null;
 const summary=(()=>{
  const text=report?.company_summary;
  if(typeof text==="string")return text;
  if(text&&typeof text==="object"&&!Array.isArray(text)){
   const obj=text as Record<string,unknown>;return String(obj.summary??obj.body??obj.headline??"");
  }return "";
 })();
 const hasFacts=!!facts;
 return <div className="space-y-3 bg-[#f3f6fa] p-3 sm:p-5">
  <div className="rounded-xl bg-[#0d2039] p-5 text-white sm:p-7">
   <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal-300">LIT / ACCOUNT INTELLIGENCE DOSSIER</div>
   <h2 className="mt-3 text-[25px] font-bold tracking-tight sm:text-[30px]">{companyName}</h2>
   <p className="mt-2 text-xs text-slate-300">Verified customs intelligence · Evidence-backed analysis · {generatedAt?new Date(generatedAt).toLocaleDateString("en-US"):"Research date pending"}</p>
   <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/20 pt-4 sm:grid-cols-4">
    {[["SHIPMENTS / 12M",hasFacts&&recent.length?fmt(shipments):"—"],["TEU / 12M",hasFacts&&recent.length?fmt(teu):"—"],["OBSERVED DOCUMENTS",hasFacts?fmt(docs.length):"—"],["CHANGE VS PRIOR YEAR",rate===null?"—":`${rate>=0?"+":""}${rate.toFixed(1)}%`]].map(([name,value])=><div key={name}><div className="text-[9px] uppercase tracking-widest text-slate-400">{name}</div><div className="mt-1 text-[23px] font-bold">{value}</div></div>)}
   </div>
  </div>
  {q.isLoading?<div role="status" className="rounded-lg bg-white p-8 text-center text-sm text-slate-600">Loading stored shipment evidence…</div>:q.error?<div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Could not load this company’s archived intelligence. <button className="ml-2 underline" onClick={()=>void q.refetch()}>Retry</button></div>:null}
  <Section id="lit-dossier-executive" index="01" title="The short version" sub="Research synthesis with evidence limitations">
   <p className="text-[12px] leading-6 text-slate-700">{summary||"Company-specific written analysis will appear when verified research is generated."}</p>
   <div className="mt-4 grid gap-2 sm:grid-cols-2">
    <div className="rounded-lg bg-teal-50 p-3">{explain(recent.length?`Observed monthly customs records show ${fmt(shipments)} shipments and ${fmt(teu)} TEU in the latest 12 recorded months.`:"A complete monthly history is not available for this company.")}</div>
    <div className="rounded-lg bg-blue-50 p-3">{explain(topOrigin?`The leading origin among ${docs.length} available shipment documents is ${topOrigin}. Full-account origin share is not established by this sample.`:"The document sample does not establish a leading origin country.")}</div>
   </div>
  </Section>
  <Section id="lit-dossier-monthly" index="02" title="Shipment volume & cadence" sub="Historical monthly records; not the limited bill-of-lading sample">
   <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
    <NumberTile label="12M Shipments" value={recent.length?fmt(shipments):"—"}/><NumberTile label="12M TEU" value={recent.length?fmt(teu):"—"}/><NumberTile label="YoY shipments" value={rate===null?"—":`${rate.toFixed(1)}%`}/><NumberTile label="Months available" value={fmt(ts.length)}/>
   </div>
   <div className="grid gap-4 lg:grid-cols-2">
    <div><div className="mb-1 text-xs font-semibold text-slate-700">Monthly shipments</div><Chart months={ts.slice(-24)} metric="shipments"/></div>
    <div><div className="mb-1 text-xs font-semibold text-slate-700">Monthly TEU</div><Chart months={ts.slice(-24)} metric="teu"/></div>
   </div>
   <p className="mt-2 text-[11px] text-slate-500">Source: stored monthly company trade history. Latest period is determined by the most recent reported month; YoY compares equivalent available periods only.</p>
  </Section>
  <Section id="lit-dossier-sourcing" index="03" title="Suppliers, origins & commodities" sub="Measured in available detailed shipment documents">
   <div className="grid gap-3 lg:grid-cols-2">
    <Ranking title="Top listed suppliers" rows={ranked.suppliers} total={docs.length} empty="Supplier names are not available in this document sample."/>
    <Ranking title="Origin country distribution" rows={ranked.origins} total={docs.length} empty="Origin countries are not available."/>
    <Ranking title="Destination ports" rows={ranked.ports} total={docs.length} empty="Port-of-entry information is not available."/>
    <Ranking title="Product HS classifications" rows={ranked.commodities} total={docs.length} empty="No source-verified HS codes in the available records."/>
   </div>
  </Section>
  <Section id="lit-dossier-lanes" index="04" title="Observed trade lanes" sub="Real route records returned by LIT">
   {topRoutes?.length?<div className="space-y-3">{topRoutes.slice(0,8).map((r,i)=>{
    const max=Math.max(1,...topRoutes.map(x=>n(x.shipments)));
    return <div key={i}><div className="mb-1 flex justify-between gap-2 text-xs"><span className="text-slate-700">{r.route||"Route undisclosed"}</span><span className="shrink-0 font-semibold">{r.shipments==null?"—":fmt(n(r.shipments))} BOLs</span></div><div className="h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-500" style={{width:`${Math.min(100,n(r.shipments)/max*100)}%`}}/></div></div>})}</div>:<p className="text-xs text-slate-500">Verified route ranking is not available for this account.</p>}
   <p className="mt-3 text-[11px] text-slate-500">Bar lengths are relative to the largest listed route, not estimated market share.</p>
  </Section>
  <Section id="lit-dossier-carriers" index="05" title="Carrier & forwarder intelligence" sub="Carrier observations; avoid unsupported incumbent claims">
   <Ranking title="Carriers named in documents" rows={ranked.carriers} total={docs.length} empty="No confirmed carrier names are available in the document sample."/>
   <p className="mt-3 text-xs text-slate-600">{observedCarriers>0?`${observedCarriers} distinct named carriers are observed in the sample. Forwarder-controlled versus direct bookings cannot be inferred without broker/booking evidence.`:"Direct versus forwarder-managed bookings cannot be established from the available evidence."}</p>
  </Section>
  <Section id="lit-dossier-air" index="06" title="Air freight intelligence" sub="Separate documented air freight from unknown shipment modes">
   <div className="grid grid-cols-2 gap-2 sm:grid-cols-3"><NumberTile label="Verified air docs" value={fmt(air.length)}/><NumberTile label="Mode unspecified" value={fmt(unknown)}/><NumberTile label="Coverage" value={air.length?"Partial":"Not verified"}/></div>
   <p className="mt-3 text-xs leading-5 text-slate-600">Only documents explicitly labeled Air count as air activity. Unclassified ocean BOL records do not establish the presence or absence of air shipments.</p>
  </Section>
  <Section id="lit-dossier-assessment" index="07" title="Harvey's commercial assessment" sub="Observed facts distinguished from testable sales hypotheses">
   <div className="grid gap-3 sm:grid-cols-2">
    <div className="rounded-lg border border-teal-200 bg-teal-50 p-4"><div className="text-[11px] font-bold uppercase tracking-wider text-teal-800">Verified behavior</div><p className="mt-2 text-xs leading-5 text-slate-700">{recent.length?`${fmt(shipments)} shipments in the most recent 12 reported monthly periods. ${ranked.origins.length} countries represented in the ${docs.length}-document sample.`:"No complete monthly profile has been verified."}</p></div>
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4"><div className="text-[11px] font-bold uppercase tracking-wider text-blue-800">Next research question</div><p className="mt-2 text-xs leading-5 text-slate-700">Confirm the incumbent forwarder, booking control, and whether supplier routing decisions can be consolidated before presenting displacement or rate-saving claims.</p></div>
   </div>
  </Section>
  <div className="text-[11px] leading-5 text-slate-500"><ShieldCheck className="mr-1 inline h-3.5 w-3.5"/> Evidence: {facts?.months.length??0} monthly records and {docs.length} sampled BOL records. A sample is not the full account universe. External public research requires separate dated, attributable sources.</div>
 </div>;
}
