import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";

const teams = ["Sales", "Marketing", "Sales Leadership", "Product", "Operations", "Other"];
const services = ["Ocean FCL", "Ocean LCL", "Air freight", "Customs brokerage", "Cross-border trucking", "Drayage", "Domestic trucking", "Other"];
const types = ["Freight Forwarder", "Freight Broker", "3PL", "Customs Broker", "Shipper", "Carrier", "Other"];
const countries = ["United States","Canada","Mexico","United Kingdom","Germany","France","Netherlands","Belgium","Italy","Spain","Turkey","China","India","Japan","South Korea","Vietnam","Brazil","Australia","Other"];
export default function OnboardingPage() {
 const [params] = useSearchParams();
 const [step,setStep] = useState(1);
 const [signupGoal,setSignupGoal] = useState("");
 const [companyName,setCompanyName] = useState("");
 const [companyType,setCompanyType] = useState("");
 const [website,setWebsite] = useState("");
 const [team,setTeam] = useState("");
 const [title,setTitle] = useState("");
 const [selected,setSelected] = useState<string[]>([]);
 const [geographies,setGeographies] = useState<string[]>([]);
 const [countryQuery,setCountryQuery] = useState("");
 const [saving,setSaving] = useState(false);
 const [error,setError] = useState("");
 const next=params.get("next") || "";
 const destination=/^\/app(?:\/|$|\?)/.test(next)?next:"/app/search";
 useEffect(()=>{
  let active=true;
  supabase.auth.getUser().then(async ({data}:any)=>{
   if(!data?.user?.id)return;
   const {data:profile}=await supabase.from("profiles").select("company_name,company_type,onboarding_preferences").eq("id",data.user.id).maybeSingle();
   if(!active || !profile)return;
   setCompanyName(profile.company_name || "");
   setCompanyType(types.includes(profile.company_type)?profile.company_type:"");
   setWebsite(profile.onboarding_preferences?.company_website || "");
  }).catch(()=>{});
  return ()=>{active=false};
 },[]);
 const websiteValid = !website.trim() || /^(https:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/[^\s]*)?$/i.test(website.trim());
 const valid=step===1? companyName.trim().length>=2 && !!companyType && websiteValid : step===2?!!team && title.trim().length>=2 : step===3?selected.length>0:step===5?Boolean(signupGoal):true;
 async function finish(){
  if(saving||!companyName.trim()||!companyType||!team||title.trim().length<2||!selected.length||!websiteValid||!signupGoal)return;
  setSaving(true);setError("");
  try{
   const {data,error:rpcError}=await supabase.rpc("lit_complete_onboarding_v4",{
    p_company_name:companyName.trim(),p_company_type:companyType,
    p_website:website.trim(),p_team:team,p_title:title.trim(),
    p_services:selected,p_geographies:geographies,p_goal:signupGoal,
   });
   if(rpcError||!data?.ok)throw new Error(rpcError?.message||data?.reason||"We could not save your preferences.");
   window.location.assign(destination);
  }catch(e:any){setError(e.message||"Please try again.");setSaving(false);}
 }
 const toggle=(value:string,list:string[],set:(v:string[])=>void)=>set(list.includes(value)?list.filter(v=>v!==value):[...list,value]);
 const options=(values:string[],current:string,onPick:(v:string)=>void)=>(
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{values.map(v=><button key={v} type="button" aria-pressed={current===v} onClick={()=>onPick(v)} className={`rounded-xl border px-4 py-3 text-left text-sm transition ${current===v?"border-indigo-600 bg-indigo-50 text-indigo-900":"border-slate-200 hover:border-slate-400"}`}>{v}</button>)}</div>
 );
 return <main className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[3fr_2fr]">
  <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
   <div className="w-full max-w-xl">
    <div className="mb-8 flex gap-2" aria-label={`Step ${step} of 5`}>{[1,2,3,4,5].map(n=><div key={n} className={`h-1 flex-1 rounded ${n<=step?"bg-indigo-600":"bg-slate-200"}`}/>)}</div>
    <p className="mb-2 text-sm text-slate-500">Logistics Intel · Welcome · Step {step} of 5</p>
    <h1 className="mb-3 text-2xl font-bold text-slate-900">{step===1?"Tell us about your company":step===2?"What is your role?":step===3?"Which services do you sell?":step===4?"Where are your target customers?":"What brings you to Logistics Intel?"}</h1>
    <p className="mb-7 text-sm text-slate-600">{step===1?"We’ll use this information to tailor your freight intelligence workspace.":step===2?"Your team and job title help us personalize Harvey and your tools.":step===3?"Choose all the services you offer.":step===4?"Select your target countries, or leave this optional step blank.":"We’ll tailor your workspace around your primary goal."}</p>
    {error&&<p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {step===1&&<div className="space-y-5">
      <label className="block text-sm font-medium">Company name<input aria-label="Company name" className="mt-2 w-full rounded-xl border border-slate-200 p-3" maxLength={160} value={companyName} onChange={e=>setCompanyName(e.target.value)} autoComplete="organization"/></label>
      <div><p className="mb-2 text-sm font-medium">Company type</p>{options(types,companyType,setCompanyType)}</div>
      <label className="block text-sm font-medium">Company website (optional)<input aria-label="Company website" type="text" className="mt-2 w-full rounded-xl border border-slate-200 p-3" value={website} maxLength={253} placeholder="example-logistics.com" onChange={e=>setWebsite(e.target.value)} autoComplete="url"/></label>
      {!websiteValid&&<p className="text-xs text-red-600">Enter a valid website domain.</p>}
     </div>}
    {step===2&&<div className="space-y-5"><div><p className="mb-2 text-sm font-medium">Team</p>{options(teams,team,setTeam)}</div><label className="block text-sm font-medium">Job title<input aria-label="Job title" className="mt-2 w-full rounded-xl border border-slate-200 p-3" maxLength={120} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Sales Manager"/></label></div>}
    {step===3&&<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{services.map(v=><label key={v} className={`flex items-center gap-3 rounded-xl border p-3 text-sm ${selected.includes(v)?"border-indigo-600 bg-indigo-50":"border-slate-200"}`}><input type="checkbox" checked={selected.includes(v)} onChange={()=>toggle(v,selected,setSelected)}/>{v}</label>)}</div>}
    {step===4&&<div className="space-y-3"><label className="block text-sm font-medium">Search countries<input aria-label="Search countries" className="mt-2 w-full rounded-xl border border-slate-200 p-3" value={countryQuery} onChange={e=>setCountryQuery(e.target.value)} placeholder="Search target countries"/></label><div className="grid max-h-60 grid-cols-1 gap-2 overflow-auto sm:grid-cols-2">{countries.filter(c=>c.toLowerCase().includes(countryQuery.toLowerCase())).map(c=><label key={c} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm"><input type="checkbox" checked={geographies.includes(c)} onChange={()=>toggle(c,geographies,setGeographies)}/>{c}</label>)}</div><p className="text-xs text-slate-500">Optional · {geographies.length} selected</p></div>}
    {step===5&&<div><p className="mb-2 text-sm font-medium">Your main goal</p>{options(["Find new shippers","Research competitors and trade lanes","Manage outreach and CRM","Track existing accounts","Benchmark freight rates","Other"],signupGoal,setSignupGoal)}</div>}
    <div className="mt-8 flex gap-3">{step>1&&<button className="rounded-xl border px-4 py-3" type="button" disabled={saving} onClick={()=>{setStep(step-1);setError("")}}>Back</button>}<button type="button" disabled={!valid||saving} className="flex-1 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white disabled:opacity-40" onClick={()=>step<5?(setStep(step+1),setError("")):void finish()}>{saving?"Saving…":step===5?"Finish setup":"Continue"}</button></div>
    {step===4&&<button type="button" disabled={saving} className="mt-4 w-full text-sm text-slate-500" onClick={()=>{setGeographies([]);setStep(5)}}>Skip countries</button>}
   </div>
  </section>
  <aside className="relative hidden min-h-screen overflow-hidden bg-[#0c1424] text-white lg:flex lg:flex-col lg:justify-end" aria-label="Logistics Intel branding">
    <div className="absolute inset-0 bg-gradient-to-br from-[#164d6a] via-[#122941] to-[#090f1d]" />
    <div className="absolute -right-40 top-[-11%] h-[80%] w-[90%] rotate-[-20deg] rounded-[8rem] border border-cyan-400/20 bg-cyan-400/5 blur-3xl" />
    <div className="absolute left-[9%] right-[-15%] top-[17%] rotate-[-10deg] space-y-3" aria-hidden="true">
      {["SHIPMENT INTELLIGENCE","GLOBAL TRADE SIGNALS","YOUR NEXT OPPORTUNITY"].map((label,i)=><div key={label} className={`relative flex h-28 items-center overflow-hidden rounded-lg border-l-[9px] border-cyan-300/40 px-9 shadow-2xl ${i===1?"bg-[#173d57]":"bg-[#243749]"}`} style={{backgroundImage:"repeating-linear-gradient(90deg,transparent 0px,transparent 17px,rgba(0,0,0,.20) 18px,rgba(255,255,255,.04) 21px,transparent 24px)"}}>
       <span className="text-[13px] font-black tracking-[.2em] text-white/80">{label}</span>
      </div>)}
    </div>
    <div className="relative z-10 bg-gradient-to-t from-[#090f1d] via-[#090f1d]/95 to-transparent px-12 pb-14 pt-32">
      <img src="/lit-logo-horizontal.svg" alt="Logistics Intel" className="mb-7 h-9 w-auto max-w-[220px]" />
      <h2 className="max-w-md text-4xl font-bold leading-tight">From shipment signal to sales action.</h2>
      <p className="mt-5 max-w-sm text-sm leading-6 text-slate-300">Your next account is hiding in the data. Let's find it together.</p>
    </div>
  </aside>
 </main>;
}
