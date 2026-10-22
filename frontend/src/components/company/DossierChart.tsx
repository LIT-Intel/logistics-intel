import { useId, useState } from "react";
type Month = { year:number; month:number; shipments:number|string|null; teu:number|string|null };
const val=(v:unknown):number|null=>{if(v===null||v===undefined||v==="")return null;const n=Number(v);return Number.isFinite(n)&&n>=0?n:null};
const monthly=(m:Month)=>new Date(Date.UTC(m.year,m.month-1,1)).toLocaleDateString("en-US",{month:"short",year:"numeric"});
/** A real-data SVG trend, with keyboard-accessible exact numbers on every point.
 * Stroke reveal is composited on mount; hover/focus feedback is instantaneous.
 */
export default function DossierChart({months,metric}:{months:Month[];metric:"shipments"|"teu"}){
 const [active,setActive]=useState<number|null>(null);
 const id=useId().replace(/:/g,"");
 if(!months.length)return <p className="py-7 text-xs text-slate-500">No source-backed monthly history available.</p>;
 const values=months.map(x=>val(x[metric])),max=Math.max(1,...values.filter((v):v is number=>v!==null));
 const W=720,H=198,left=20,right=18,top=18,bottom=33,cw=W-left-right,ch=H-top-bottom;
 const points=values.map((n,i)=>({x:left+cw*i/Math.max(1,values.length-1),y:top+ch*(1-(n??0)/max),value:n}));
 const d=points.map((p,i)=>p.value===null?"":((i&&points[i-1].value!==null)?"L":"M")+p.x.toFixed(2)+","+p.y.toFixed(2)).filter(Boolean).join(" ");
 const selected=active===null?null:points[active];
 const color=metric==="teu"?"#0c969c":"#437df0";
 const period=active===null?null:monthly(months[active]);
 return <div className="relative w-full">
 <style>{`
 @keyframes litDossierStroke{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
 @keyframes litDossierAppear{from{opacity:0}to{opacity:1}}
 .lit-dossier-stroke{stroke-dasharray:1;stroke-dashoffset:0;animation:litDossierStroke 550ms cubic-bezier(.23,1,.32,1) both}
 .lit-dossier-dot{animation:litDossierAppear 250ms ease-out 180ms both}
 @media(prefers-reduced-motion:reduce){.lit-dossier-stroke,.lit-dossier-dot{animation:none!important}}
 `}</style>
 <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Monthly ${metric} with exact data for each period. Focus or hover on a point to inspect the value.`}>
  <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".13"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
  {[0,.25,.5,.75,1].map(t=><line key={t} x1={left} x2={W-right} y1={top+ch*t} y2={top+ch*t} stroke="#e9eef5" strokeWidth="1"/>)}
  {/* Missing or quarantined TEU months are gaps, never zero-volume areas. */}
  <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lit-dossier-stroke" pathLength={1}/>
  {points.map((p,i)=>p.value===null?null:<g key={i}>
   <circle tabIndex={0} role="img" aria-label={`${monthly(months[i])}: ${p.value.toLocaleString()} ${metric}`} cx={p.x} cy={p.y} r={12} fill="transparent"
    onPointerEnter={()=>setActive(i)} onPointerLeave={()=>setActive(null)} onFocus={()=>setActive(i)} onBlur={()=>setActive(null)}/>
   <circle pointerEvents="none" cx={p.x} cy={p.y} r={active===i?5:3} fill={color} stroke="white" strokeWidth="1.5" className="lit-dossier-dot"/>
  </g>)}
  {months.map((m,i)=>i===0||i===months.length-1||i%Math.max(1,Math.ceil(months.length/7))===0?
   <text key={i} x={points[i].x} y={H-9} fontSize="10" fill="#64748b" textAnchor="middle">{new Date(Date.UTC(m.year,m.month-1,1)).toLocaleDateString("en-US",{month:"short",year:"2-digit"})}</text>:null)}
 </svg>
 {selected&&<div role="status" className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg" style={{left:`${Math.min(85,Math.max(15,100*selected.x/W))}%`,top:`${Math.max(0,selected.y/H*100-35)}%`}}>
  <div className="font-semibold text-slate-900">{period}</div><div className="text-slate-600">{selected.value===null?"Not verified":selected.value.toLocaleString()+" "+(metric==="teu"?"TEU":"shipments")}</div>
 </div>}
 <div className="sr-only">{months.map(m=>`${monthly(m)}: ${val(m[metric])===null?"unverified":val(m[metric])+" "+metric}`).join("; ")}</div>
 </div>;
}
