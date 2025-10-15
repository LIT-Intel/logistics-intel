import { useEffect, useState } from "react";

export default function CampaignKpis() {
  const [kpi, setKpi] = useState<{ sends:number; opens:number; replies:number }|null>(null);
  const [loading, setLoading] = useState(false);
  const selected = (()=>{ try{return JSON.parse(localStorage.getItem("lit:selectedCompany")||"null");}catch{return null;} })();

  async function load() {
    if(!selected?.company_id) { setKpi(null); return; }
    setLoading(true);
    try{
      const r = await fetch(`/api/lit/public/campaignKpis?company_id=${encodeURIComponent(selected.company_id)}`);
      if(!r.ok) throw new Error(String(r.status));
      const data = await r.json();
      setKpi(data?.kpi || { sends:0, opens:0, replies:0 });
    } finally { setLoading(false); }
  }
  useEffect(()=>{ load(); },[]);
  useEffect(()=>{ const h=()=>load(); document.addEventListener("lit:campaign-kpi:refresh", h); return ()=>document.removeEventListener("lit:campaign-kpi:refresh", h); },[]);

  if(loading) return <div className="text-sm text-gray-500">Loading campaign KPIs…</div>;
  if(!kpi) return <div className="text-sm text-gray-500">Not in any campaign yet.</div>;
  return (
    <div className="grid grid-cols-3 gap-3">
      {[
        {label:"Sends", value:kpi.sends},
        {label:"Opens", value:kpi.opens},
        {label:"Replies", value:kpi.replies},
      ].map(i=> (
        <div key={i.label} className="rounded-2xl border p-3">
          <div className="text-xs text-slate-500">{i.label}</div>
          <div className="text-xl font-semibold">{Intl.NumberFormat().format(i.value)}</div>
        </div>
      ))}
    </div>
  );
}
