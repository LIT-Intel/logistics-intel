import type { BriefFacts } from "./AccountDossierV2";

type Row = {route?:string|null;shipments?:number|null;teu?:number|null};
const numeric=(x:unknown)=>{const y=Number(x);return Number.isFinite(y)?y:0};
const f=(n:number)=>new Intl.NumberFormat("en-US",{maximumFractionDigits:1}).format(n);
const clean=(s:string)=>s.replace(/[^\x20-\x7e]/g,"-");
type Rank={name:string;count:number};
function rank(rows:BriefFacts["documents"],key:keyof BriefFacts["documents"][number]):Rank[]{
 const by=new Map<string,number>();
 for(const r of rows){const value=String(r[key]??"").trim();if(value)by.set(value,(by.get(value)??0)+1);}
 return [...by.entries()].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count).slice(0,9);
}
/** Dedicated vector PDF template. Does not screenshot the responsive HTML DOM. */
export async function exportAccountDossierPdf(args:{companyName:string;facts:BriefFacts;topRoutes?:Row[]|null;summary?:string}){
 const {jsPDF}=await import("jspdf");
 const doc=new jsPDF({orientation:"portrait",unit:"pt",format:"letter"});
 const W=612,H=792,L=46,R=566;let y=0,page=0;
 const navy:[number,number,number]=[12,30,54],teal:[number,number,number]=[10,145,150],gray:[number,number,number]=[77,94,114];
 function footer(){
  doc.setDrawColor(222,229,237);doc.line(L,746,R,746);
  doc.setFont("helvetica","normal");doc.setFontSize(8);doc.setTextColor(...gray);
  doc.text("LOGISTIC INTEL  /  INTERNAL RESEARCH DOSSIER",L,763);
  doc.text(String(page),R,763,{align:"right"});
 }
 function next(){
  if(page){footer();doc.addPage();}
  page++;y=59;doc.setFillColor(...navy);doc.rect(0,0,W,38,"F");
  doc.setFont("helvetica","bold");doc.setFontSize(10);doc.setTextColor(255,255,255);
  doc.text("LIT  /  ACCOUNT INTELLIGENCE",L,24);
  doc.setFont("helvetica","normal");doc.setFontSize(8);doc.text("VERIFIED DATA",R,24,{align:"right"});
 }
 function ensure(h:number){if(y+h>725)next();}
 function title(s:string){
  ensure(38);doc.setFont("helvetica","bold");doc.setFontSize(15);doc.setTextColor(...navy);doc.text(clean(s),L,y);y+=9;
  doc.setDrawColor(213,226,234);doc.line(L,y,R,y);y+=22;
 }
 function para(s:string,size=10){
  if(!s)return;doc.setFont("helvetica","normal");doc.setFontSize(size);doc.setTextColor(...gray);
  const lines=doc.splitTextToSize(clean(s),R-L) as string[];
  for(const l of lines){ensure(15);doc.text(l,L,y);y+=15;}y+=11;
 }
 function stats(items:[string,string][]) {
  ensure(82);const gap=8, w=(R-L-gap*(items.length-1))/items.length;
  items.forEach(([label,value],i)=>{
   const x=L+i*(w+gap);doc.setFillColor(245,248,251);doc.roundedRect(x,y,w,67,6,6,"F");
   doc.setFont("helvetica","bold");doc.setFontSize(8);doc.setTextColor(98,115,135);doc.text(clean(label.toUpperCase()),x+10,y+18);
   doc.setFontSize(21);doc.setTextColor(...navy);doc.text(clean(value),x+10,y+46);
  });y+=87;
 }
 function ranked(label:string,rows:Rank[],denom:number){
  ensure(43);doc.setFont("helvetica","bold");doc.setFontSize(11);doc.setTextColor(...navy);doc.text(label,L,y);y+=17;
  if(!rows.length){para("No source-verified records in available document sample.");return;}
  for(const row of rows){
   ensure(26);const pct=denom?row.count/denom:0;
   doc.setFont("helvetica","normal");doc.setFontSize(9);doc.setTextColor(...gray);
   const name=clean(row.name);doc.text(name.length>57?name.slice(0,54)+"...":name,L,y);
   doc.text(String(row.count)+"  ("+Math.round(pct*100)+"%)",R,y,{align:"right"});
   y+=7;doc.setFillColor(231,239,243);doc.roundedRect(L,y,R-L,5,2,2,"F");
   doc.setFillColor(...teal);doc.roundedRect(L,y,Math.max(1,pct*(R-L)),5,2,2,"F");
   y+=19;
  }
  y+=8;
 }
 function trend(metric:"shipments"|"teu"){
  const months=[...args.facts.months].filter(m=>m.month>=1&&m.month<=12).sort((a,b)=>(a.year*12+a.month)-(b.year*12+b.month)).slice(-24);
  ensure(125);
  doc.setFont("helvetica","bold");doc.setFontSize(11);doc.setTextColor(...navy);
  doc.text(metric==="teu"?"Monthly TEU":"Monthly shipments",L,y);y+=15;
  if(months.length<2){para("Monthly trend requires at least two available data points.");return;}
  const values=months.map(m=>numeric(m[metric]));const max=Math.max(1,...values);
  const x=L+3,yt=y+6,w=R-L-6,h=82;doc.setDrawColor(224,231,239);
  for(let i=0;i<4;i++)doc.line(x,yt+i*h/3,x+w,yt+i*h/3);
  doc.setDrawColor(...teal);doc.setLineWidth(2);
  for(let i=1;i<values.length;i++)doc.line(x+((i-1)/(values.length-1))*w,yt+h-(values[i-1]/max)*h,x+(i/(values.length-1))*w,yt+h-(values[i]/max)*h);
  doc.setLineWidth(1);y+=111;
  doc.setFontSize(8);doc.setFont("helvetica","normal");doc.setTextColor(...gray);
  doc.text(`From ${months[0].year}-${String(months[0].month).padStart(2,"0")} to ${months[months.length-1].year}-${String(months[months.length-1].month).padStart(2,"0")}`,L,y);y+=24;
 }
 next();
 doc.setFont("helvetica","bold");doc.setFontSize(23);doc.setTextColor(...navy);
 const nameLines=doc.splitTextToSize(clean(args.companyName),R-L) as string[];
 for(const line of nameLines){doc.text(line,L,y);y+=28;}y+=4;
 para("Evidence-led account brief  |  Data extracted "+new Date(args.facts.retrievedAt).toLocaleDateString("en-US"));
 const months=[...args.facts.months].sort((a,b)=>(a.year*12+a.month)-(b.year*12+b.month));
 const last=months.length?months[months.length-1].year*12+months[months.length-1].month:null;
 const last12=last==null?[]:months.filter(m=>m.year*12+m.month>last-12);
 const sumShip=last12.reduce((s,m)=>s+numeric(m.shipments),0),sumTeu=last12.reduce((s,m)=>s+numeric(m.teu),0);
 stats([["Shipments /12m",last12.length?f(sumShip):"-"],["TEU /12m",last12.length?f(sumTeu):"-"],["BOL sample",f(args.facts.documents.length)]]);
 title("01  Executive readout");
 para(args.summary||"This brief summarizes available LIT shipment history and documents. Commercial conclusions should be validated against named carriers, supplier relationships, and current public signals.");
 para(last12.length?`The latest 12 recorded monthly periods include ${f(sumShip)} shipments and ${f(sumTeu)} TEU. Detailed shipment rankings rely on ${args.facts.documents.length} sampled document records.`:"Full monthly history is not present for this account.");
 title("02  Monthly shipment intelligence");
 trend("shipments");trend("teu");
 next();title("03  Supplier, origin and commodity intelligence");
 para(`All rankings below are calculated only from ${args.facts.documents.length} accessible shipment documents; they do not imply full-year supplier or carrier market shares.`);
 ranked("Top listed suppliers",rank(args.facts.documents,"shipper_name"),args.facts.documents.length);
 ranked("Origin countries",rank(args.facts.documents,"origin_country"),args.facts.documents.length);
 ranked("HS product classifications",rank(args.facts.documents,"hs_code"),args.facts.documents.length);
 next();title("04  Gateway and carrier activity");
 ranked("Destination ports",rank(args.facts.documents,"destination_port"),args.facts.documents.length);
 ranked("Carriers named in documents",rank(args.facts.documents,"carrier_name"),args.facts.documents.length);
 title("05  Air intelligence");
 const air=args.facts.documents.filter(r=>/^air(?:\\s|$)/i.test(String(r.transport_mode??"").trim())).length;
 para(`${air} document records explicitly marked Air among ${args.facts.documents.length} sampled shipments. Absence of air records does not prove no air activity. No inferred air volumes or airports are included.`);
 title("06  Commercial assessment");
 para("Validate carrier booking control and supplier concentration before claiming any specific displacement opportunity. Compare observed lanes against current customer logistics priorities and use source-linked shipments in discovery.");
 title("07  Source & coverage notes");
 para("Monthly totals: lit_company_time_series_monthly. Document rankings: lit_unified_shipments. These datasets represent different coverage and may not share the same completeness. All metrics are sourced from records stored in Logistic Intel. Public web sources require separate verified research and have not been added to this export.");
 footer();
 doc.save(`LIT-Account-Intelligence-${args.companyName.toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,50)}.pdf`);
}
