import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Package as PackageIcon, Ship as ShipIcon, Newspaper, Linkedin as LinkedinIcon, TrendingUp, DollarSign, Sparkles } from 'lucide-react';
import PreCallBriefing from '../company/PreCallBriefing';
import { exportCompanyPdf } from '../pdf/exportCompanyPdf';
import { buildPreCallPrompt } from '../../lib/ai';
import {
  getCompanyShipments,
  kpiFrom,
  recallCompany,
  saveCampaign,
  saveCompanyToCrm,
  enrichCompany,
  createTask,
  createAlert,
  getEmailThreads,
  getCalendarEvents,
} from '../../lib/api';

function estimateSpend(shipments12m: number, mode: 'ocean'|'air') {
  const s = Math.max(0, Number(shipments12m||0));
  if (mode === 'ocean') {
    // rough: $1,200 per shipment placeholder
    return Math.round(s * 1200);
  }
  // air: $2.50/kg equivalent placeholder (assume 400kg avg)
  return Math.round(s * 2.5 * 400);
}

const Pill = ({ children }: { children: React.ReactNode }) => (
  <span className='px-2 py-0.5 rounded-full text-xs bg-white/70 border border-white/60 shadow-sm'>{children}</span>
);

function CompanyCard({ c, active, onClick, flags }: { c: any; active: boolean; onClick: () => void; flags?: { inRfp?: boolean; inCampaign?: boolean } }) {
  const city   = c.city || c.meta?.city || '—';
  const state  = c.state || c.meta?.state || '';
  const domain = c.domain || c.website || c.meta?.website || '';

  return (
    <button
      onClick={onClick}
      className={[
        'company-card',
        'w-full text-left rounded-xl p-3 mb-2 transition',
        'shadow-sm hover:shadow',
        'border',
        active ? 'active border-indigo-500 bg-[rgba(106,90,249,0.08)]' : 'border-gray-200 bg-white',
        'hover:-translate-y-[1px] relative'
      ].join(' ')}
    >
      {/* removed gradient accent bar */}
      <div className='flex items-center justify-between gap-2'>
        <div className='font-semibold text-[16px] text-[#1b1b3a] pr-1 tracking-tight'>{c.name}</div>
        <div className='flex items-center gap-1'>
          {flags?.inRfp && <span title='In RFP' className='inline-block w-2.5 h-2.5 rounded-full bg-violet-600' />}
          {flags?.inCampaign && <span title='In Campaign' className='inline-block w-2.5 h-2.5 rounded-full bg-blue-600' />}
        </div>
      </div>
      <div className='text-[11px] text-slate-500'>ID: {String(c.id || c.company_id || '—')}</div>
      <div className='mt-0.5 text-[11px] text-slate-600'>
        {city}{state ? `, ${state}` : ''}
      </div>
      {domain ? (
        <div className='mt-1.5'>
          <a
            href={domain.startsWith('http') ? domain : `https://${domain}`}
            target='_blank' rel='noreferrer'
            className='inline-flex items-center gap-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-700 hover:text-gray-900'
          >
            <span className='h-1.5 w-1.5 rounded-full bg-gray-400' />
            {domain.replace(/^https?:\/\//, '')}
          </a>
        </div>
      ) : null}
      <div className='mt-2 grid grid-cols-2 gap-2 text-[10px]'>
        <div className='text-slate-500'>Shipments 12M</div>
        <div className='text-right text-slate-900 font-semibold text-sm'>{(c.kpis?.shipments12m ?? 0).toLocaleString()}</div>
        <div className='text-slate-500'>Last</div>
        <div className='text-right text-slate-700'>{c.kpis?.lastActivity || '—'}</div>
      </div>
    </button>
  );
}

function Tabs({ tabs, value, onChange }: { tabs: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className='flex gap-2 border-b border-white/60 mb-4'>
      {tabs.map(t => (
        <button key={t} onClick={() => onChange(t)} className={`px-3 py-2 text-sm ${value === t ? 'border-b-2 border-slate-900 font-semibold' : 'text-slate-500'}`}>{t}</button>
      ))}
    </div>
  );
}

export default function Workspace({ companies, onAdd }: { companies: any[]; onAdd: () => void }) {
  const [activeId, setActiveId] = useState(companies[0]?.id);
  const aiVendor = (((import.meta as any)?.env?.VITE_AI_VENDOR) || ((typeof process !== 'undefined' && (process as any)?.env?.NEXT_PUBLIC_AI_VENDOR) ? (process as any).env.NEXT_PUBLIC_AI_VENDOR : '') ) as string;
  const aiEnabled = !!aiVendor;
  const [query, setQuery] = useState('');
  const [filterRfp, setFilterRfp] = useState(false);
  const [filterCampaign, setFilterCampaign] = useState(false);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let base = companies;
    if (q) base = base.filter(c => String(c.name || '').toLowerCase().includes(q));
    try {
      const rRaw = localStorage.getItem('lit_rfps');
      const rfps = rRaw ? JSON.parse(rRaw) : [];
      const rIds = new Set((Array.isArray(rfps) ? rfps : []).map((r:any)=> String(r.companyId||'')));
      const cRaw = localStorage.getItem('lit_campaigns_companies');
      const cIds = new Set(((cRaw ? JSON.parse(cRaw) : []) as string[]).map(x=> String(x)));
      if (filterRfp) base = base.filter(c => rIds.has(String(c.id)));
      if (filterCampaign) base = base.filter(c => cIds.has(String(c.id)));
    } catch {}
    return base;
  }, [companies, query, filterRfp, filterCampaign]);
  const active = useMemo(() => companies.find(c => c.id === activeId), [companies, activeId]);
  const [tab, setTab] = useState('Overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<any | null>(null);
  const [shipments, setShipments] = useState<any[]>([]);
  const [threads, setThreads] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [campaignName, setCampaignName] = useState('Follow-up Campaign');
  const [campaignChannel, setCampaignChannel] = useState<'email' | 'linkedin'>('email');

  // RFP lanes upload/editor bound to universal company id (Command Center)
  const rfpKey = useMemo(() => `lit_rfp_payload_${String(activeId || '')}`, [activeId]);
  const [rfpPayload, setRfpPayload] = useState<any | null>(null);

  function deriveKpisFromPayload(payload: any) {
    if (!payload || !Array.isArray(payload.lanes)) return null;
    const shipments12m = payload.lanes.reduce((s: number, ln: any) => s + (Number(ln?.demand?.shipments_per_year || 0)), 0);
    const origins = new Map<string, number>(); const dests = new Map<string, number>();
    for (const ln of payload.lanes) {
      const o = ln?.origin?.port || ln?.origin?.country; if (o) origins.set(o, (origins.get(o) || 0) + 1);
      const d = ln?.destination?.port || ln?.destination?.country; if (d) dests.set(d, (dests.get(d) || 0) + 1);
    }
    const originsTop = Array.from(origins.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);
    const destsTop = Array.from(dests.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);
    return { shipments12m, originsTop, destsTop };
  }

  useEffect(() => {
    // Ensure an active selection when companies load or change
    if (!activeId && companies && companies.length > 0) {
      setActiveId(companies[0].id);
    } else if (activeId && companies && companies.length > 0) {
      const exists = companies.some(c => String(c.id) === String(activeId));
      if (!exists) setActiveId(companies[0].id);
    }
  }, [companies]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      if (!activeId) return;
      setLoading(true);
      setError(null);
      try {
        // Fetch shipments
        try {
          const s = await getCompanyShipments({ company_id: String(activeId), limit: 20, offset: 0 });
          if (!ignore) setShipments(Array.isArray(s?.rows) ? s.rows : []);
        } catch {
          if (!ignore) setShipments([]);
        }

        // Try to find company via search for KPIs
        let match: any = null;
        try {
          const res = await searchCompanies({ limit: 50, offset: 0 });
          match = (res as any).items?.find((x: any) => String(x.company_id) === String(activeId)) || null;
        } catch {}

        const baseName = active?.name || match?.company_name || 'Company';
        const k = kpiFrom(match || ({} as any));
        // Merge KPIs from any uploaded lanes stored under this company id
        try {
          const raw = localStorage.getItem(rfpKey);
          if (raw) {
            const payload = JSON.parse(raw);
            setRfpPayload(payload);
            const dk = deriveKpisFromPayload(payload);
            if (dk) {
              k.shipments12m = dk.shipments12m || k.shipments12m;
              (k as any).destsTop = dk.destsTop || (k as any).destsTop;
              (k as any).originsTop = dk.originsTop || (k as any).originsTop;
            }
          } else {
            setRfpPayload(null);
          }
        } catch {}
        // Build charts placeholder and get AI recall
        const prompt = buildPreCallPrompt({
          company: {
            id: String(activeId),
            name: baseName,
            shipments12m: k.shipments12m || 0,
            lastActivity: (k.lastActivity as any) || null,
            originsTop: k.originsTop || [],
            destsTop: k.destsTop || [],
            carriersTop: k.carriersTop || [],
          },
          shipments: shipments || [],
        });
        let ai: any = { summary: 'Pending enrichment…', bullets: ['—'] };
        try {
          const r = await recallCompany({ company_id: String(activeId), questions: [prompt] });
          ai = { summary: r?.summary || ai.summary, bullets: Array.isArray(r?.bullets) ? r.bullets : ai.bullets };
        } catch {}

        const charts = {
          growth: [
            { y: 100, x: '2022' },
            { y: 120, x: '2023' },
            { y: 140, x: '2024' },
          ],
          ecosystem: [
            { label: 'Core', value: 40 },
            { label: 'New', value: 30 },
            { label: 'Other', value: 30 },
          ],
          competition: [
            { k: 'Scale', [baseName]: 7, Market: 7 },
            { k: 'Reliability', [baseName]: 8, Market: 7 },
            { k: 'Speed', [baseName]: 7, Market: 7 },
          ],
          sourcing: (k.originsTop || []).map((c: string, i: number) => ({ country: c, pct: [60, 25, 15, 10][i] || 10 })),
        };

        if (!ignore) setOverview({ name: baseName, kpis: k, charts, ai });

        // Activity fetch (best-effort)
        try {
          const t = await getEmailThreads(String(activeId));
          if (!ignore) setThreads(Array.isArray(t?.threads) ? t.threads : (Array.isArray(t) ? t : []));
        } catch {}
        try {
          const ev = await getCalendarEvents(String(activeId));
          if (!ignore) setEvents(Array.isArray(ev?.events) ? ev.events : (Array.isArray(ev) ? ev : []));
        } catch {}
      } catch (e: any) {
        if (!ignore) setError(String(e?.message ?? e));
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    return () => { ignore = true; };
  }, [activeId]);

  // Load contacts when Contacts tab is opened
  useEffect(() => {
    let cancel = false;
    async function loadContacts() {
      if (tab !== 'Contacts' || !activeId) return;
        try {
          const api = await import('../../lib/api');
          const c: any = await (api as any).listContacts(String(activeId));
          if (!cancel) setContacts(Array.isArray(c?.contacts) ? c.contacts : (Array.isArray(c) ? c : []));
        } catch {
        if (!cancel) setContacts([]);
      }
    }
    loadContacts();
    return () => { cancel = true; };
  }, [tab, activeId]);

  return (
    <div className='w-full mx-auto flex flex-col lg:flex-row gap-[5px] pl-[5px] pr-[5px]'>
      <aside className='w-[340px] shrink-0'>
        <div className='rounded-3xl p-4 bg-white/90 backdrop-blur border border-white/70 shadow-[0_10px_40px_-10px_rgba(30,64,175,0.25)]'>
          <div className='mb-3 flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white text-slate-900 border-b border-[#eee]'>
            <h2 className='text-sm font-semibold'>Command Center</h2>
            <button onClick={onAdd} className='text-xs px-2 py-1 rounded-lg border bg-white hover:bg-slate-50 transition'>Add</button>
          </div>
          <div className='mb-3'>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder='Search companies…' className='w-full text-sm border rounded-lg px-3 py-2 bg-white/70' />
            <div className='mt-2 flex items-center gap-3 text-xs text-slate-700'>
              <label className='flex items-center gap-1'><input type='checkbox' checked={filterRfp} onChange={e=> setFilterRfp(e.target.checked)} /> Has RFP</label>
              <label className='flex items-center gap-1'><input type='checkbox' checked={filterCampaign} onChange={e=> setFilterCampaign(e.target.checked)} /> In Campaign</label>
            </div>
          </div>
          <div className='max-h-[70vh] overflow-auto pr-1 sm:pr-2'>
            {filtered.map(c => {
              let inRfp=false, inCampaign=false;
              try {
                const rr = localStorage.getItem('lit_rfps'); const arr = rr? JSON.parse(rr):[]; inRfp = Array.isArray(arr) && arr.some((r:any)=> String(r.companyId||'')===String(c.id));
                const cc = localStorage.getItem('lit_campaigns_companies'); const carr = cc? JSON.parse(cc):[]; inCampaign = Array.isArray(carr) && carr.includes(String(c.id));
              } catch {}
              return (
                <CompanyCard key={c.id} c={c} active={c.id === activeId} onClick={() => { setActiveId(c.id); setTab('Overview'); }} flags={{ inRfp, inCampaign }} />
              );
            })}
            {filtered.length === 0 && (
              <div className='text-xs text-slate-500 py-6 text-center'>No companies match “{query}”.</div>
            )}
          </div>
        </div>
      </aside>
      <main className='flex-1 min-w-0 p-[5px] max-w-none'>
        <div className='company-detail rounded-3xl p-6 bg-white/90 backdrop-blur border border-slate-200 shadow-[0_10px_40px_-10px_rgba(2,6,23,0.08)]'>
          {active ? (
            <>
              <div className='flex items-center justify-between gap-4 flex-wrap'>
                <div>
          <h1 className='text-3xl md:text-3xl font-extrabold tracking-tight text-slate-900'>{active.name}</h1>
                  <div className='text-xs text-slate-500'>ID: {active.id}</div>
                </div>
                <div className='flex items-center gap-2'>
                  <button className='px-3 py-1.5 rounded border text-xs' onClick={async()=>{
                    try { await saveCompanyToCrm({ company_id: String(active.id), company_name: active.name, source:'companies' }); alert('Saved to CRM'); } catch(e:any){ alert('Save failed: '+ String(e?.message||e)); }
                  }}>Save</button>
                  <button className='rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:shadow-md px-3 py-1.5 text-xs' onClick={async()=>{
                    try { await enrichCompany({ company_id: String(active.id) }); alert('Enrichment queued'); } catch(e:any){ alert('Enrich failed: '+ String(e?.message||e)); }
                  }}>Enrich Now</button>
                  <button className='px-3 py-1.5 rounded border text-xs disabled:opacity-60' title={aiEnabled? 'AI Recall' : 'Connect AI in Settings → Providers'} disabled={!aiEnabled}
                    onClick={async()=>{
                    try { await recallCompany({ company_id: String(active.id) }); alert('AI Recall requested'); } catch(e:any){ alert('Recall failed: '+ String(e?.message||e)); }
                  }}>AI Recall</button>
                </div>
              </div>
              <div className='mt-4'>
                <Tabs tabs={["Overview", "Pre-Call", "Shipments", "Contacts", "Activity", "Campaigns", "Settings"]} value={tab} onChange={setTab} />
                {loading && (<div className='text-sm text-slate-600'>Loading…</div>)}
                {error && (<div className='text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3'>{error}</div>)}
                {!loading && !error && tab === 'Overview' && overview && (
                  <div className='mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-7'>
                    {/* Bio */}
                    <div className='rounded-2xl border bg-white p-5 shadow-[0_10px_30px_-12px_rgba(15,23,42,0.15)]'>
                      <h3 className='text-sm font-semibold text-slate-800 mb-2'>Company Bio</h3>
                      <div className='text-[16px] font-extrabold text-slate-900 mb-2'>{overview.name}</div>
                      <div className='text-sm text-slate-700 whitespace-pre-wrap'>{overview.ai?.summary || 'Bio coming soon.'}</div>
                    </div>
                    {/* Products */}
                    <div className='rounded-2xl border bg-white p-5 shadow-[0_10px_30px_-12px_rgba(15,23,42,0.15)]'>
                      <h3 className='text-sm font-semibold text-slate-800 mb-2'>Products</h3>
                      <ul className='space-y-2 text-sm text-slate-700'>
                        {((overview as any)?.products && Array.isArray((overview as any).products) && (overview as any).products.length > 0
                          ? (overview as any).products
                          : ['Product A', 'Product B', 'Product C']
                        ).map((p: string, i: number) => (
                          <li key={i} className='flex items-center gap-2'>
                            <PackageIcon className='h-4 w-4 text-slate-500' />
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    {/* Tradelanes */}
                    <div className='rounded-2xl border bg-white p-5 shadow-[0_10px_30px_-12px_rgba(15,23,42,0.15)]'>
                      <h3 className='text-sm font-semibold text-slate-800 mb-2'>Top Destinations</h3>
                      <ul className='text-sm list-disc pl-5'>
                        {(overview.kpis?.destsTop||[]).slice(0,5).map((d:string,i:number)=> (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                    </div>
                    {/* News */}
                    <div className='rounded-2xl border bg-white p-5 shadow-[0_10px_30px_-12px_rgba(15,23,42,0.15)]'>
                      <h3 className='text-sm font-semibold text-slate-800 mb-2'>Latest News</h3>
                      <div className='text-sm text-slate-700'>Coming soon.</div>
                    </div>
                    {/* LinkedIn */}
                    <div className='rounded-2xl border bg-white p-5 shadow-[0_10px_30px_-12px_rgba(15,23,42,0.15)]'>
                      <h3 className='text-sm font-semibold text-slate-800 mb-2'>LinkedIn</h3>
                      <a className='text-blue-600 underline text-sm' href={`https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(overview.name)}`} target='_blank' rel='noreferrer'>Search profile</a>
                    </div>
                    {/* Growth */}
                    <div className='rounded-2xl border bg-white p-5 shadow-[0_10px_30px_-12px_rgba(15,23,42,0.15)]'>
                      <h3 className='text-sm font-semibold text-slate-800 mb-2'>Historical Growth</h3>
                      <div className='text-sm text-slate-700'>Integrations for charts and financials to follow.</div>
                    </div>
                    {/* Spend */}
                    <div className='rounded-2xl border bg-white p-5 shadow-[0_10px_30px_-12px_rgba(15,23,42,0.15)]'>
                      <h3 className='text-sm font-semibold text-slate-800 mb-3'>Logistics Spend Estimator</h3>
                      <div className='grid grid-cols-1 md:grid-cols-3 gap-4 text-sm'>
                        <div className='rounded-lg border p-4 bg-white/95'>
                          <div className='text-slate-500'>Shipments (12M)</div>
                          <div className='text-lg font-bold text-slate-900'>{Number(overview.kpis?.shipments12m||0).toLocaleString()}</div>
                        </div>
                        <div className='rounded-lg border p-4 bg-white/95'>
                          <div className='text-slate-500'>Est. Ocean Spend</div>
                          <div className='text-lg font-bold text-slate-900'>${estimateSpend(overview.kpis?.shipments12m||0,'ocean').toLocaleString()}</div>
                        </div>
                        <div className='rounded-lg border p-4 bg-white/95'>
                          <div className='text-slate-500'>Est. Air Spend</div>
                          <div className='text-lg font-bold text-slate-900'>${estimateSpend(overview.kpis?.shipments12m||0,'air').toLocaleString()}</div>
                        </div>
                      </div>
                      <div className='mt-3 text-xs text-slate-500'>Benchmarks assumed: Ocean $1,200/TEU-equivalent; Air $2.50/kg-equivalent. Replace with live market rates in Phase 2.</div>
                      <div className='mt-3 flex gap-2'>
                        <button className='px-3 py-1.5 rounded border text-xs bg-gradient-to-r from-blue-600 to-violet-600 text-white' onClick={() => {
                          // Add to RFP using universal company id/name
                          try {
                            const key = 'lit_rfps';
                            const raw = localStorage.getItem(key);
                            const arr = raw ? JSON.parse(raw) : [];
                            const exists = Array.isArray(arr) && arr.some((r:any)=> String(r?.companyId) === String(activeId));
                            const name = overview?.name || 'Company';
                            if (!exists) {
                              const id = 'rfp_'+Math.random().toString(36).slice(2,8);
                              const rec = { id, name: `${name} — Opportunity`, client: name, companyId: String(activeId), status:'Draft', due:'TBD' };
                              localStorage.setItem(key, JSON.stringify([rec, ...arr]));
                              alert('Added to RFP');
                            } else {
                              alert('Already in RFP');
                            }
                          } catch { alert('Failed to add to RFP'); }
                        }}>Add to RFP</button>
                        <button className='px-3 py-1.5 rounded border text-xs bg-gradient-to-r from-blue-600 to-violet-600 text-white' onClick={async()=>{
                          try { await saveCampaign({ name: `${overview?.name||'Company'} — Outreach`, channel: 'email', company_ids: [String(activeId)] }); alert('Added to Campaigns'); } catch(e:any){ alert('Failed: '+ String(e?.message||e)); }
                        }}>Add to Campaign</button>
                      </div>
                    </div>
                  </div>
                )}
                {!loading && !error && tab === 'Pre-Call' && overview && (
                  <div className='mt-3'>
                    <div className='flex items-center justify-end gap-2'>
                      <button className='rounded border px-3 py-1.5 text-sm' onClick={async()=>{ try{ const pdf=await exportCompanyPdf('company-pdf-root','Company.pdf'); pdf.save('company.pdf'); }catch(e:any){ alert('PDF failed: '+ String(e?.message||e)); } }}>Save PDF</button>
                      <button className='rounded border px-3 py-1.5 text-sm' onClick={async()=>{ try{ const pdf=await exportCompanyPdf('company-pdf-root','Company.pdf'); const blob=pdf.output('blob'); const form=new FormData(); form.append('file', blob, 'company.pdf'); form.append('companyId', String(activeId)); await fetch('/api/emailPdf', { method:'POST', body:form }); alert('Email queued'); }catch(e:any){ alert('Email failed: '+ String(e?.message||e)); } }}>Email PDF</button>
                    </div>
                    <section id='company-pdf-root'>
                      <PreCallBriefing company={{ name: overview.name, kpis: overview.kpis || overview.kpi || overview.k, charts: overview.charts, ai: overview.ai }} />
                    </section>
                  </div>
                )}
                {!loading && !error && tab === 'Shipments' && (
                  <div className='mt-3'>
                    {shipments.length === 0 ? (
                      <div className='text-sm text-slate-600'>No recent shipments.</div>
                    ) : (
                      <div className='overflow-x-auto rounded border'>
                        <table className='w-full text-sm'>
                          <thead className='sticky top-0 bg-white'>
                            <tr className='[&>th]:py-2 [&>th]:text-left'>
                              <th>Date</th><th>Mode</th><th>Origin</th><th>Destination</th><th>Carrier</th><th>Value (USD)</th><th>Weight (kg)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {shipments.map((r: any, i: number) => (
                              <tr key={i} className='border-t'>
                                <td>{r.shipped_on || r.date || '—'}</td>
                                <td className='capitalize'>{String(r.mode || '').toLowerCase()}</td>
                                <td>{r.origin || r.origin_country || '—'}</td>
                                <td>{r.destination || r.dest_country || '—'}</td>
                                <td>{r.carrier || '—'}</td>
                                <td>{(r.value_usd ? Number(r.value_usd).toLocaleString() : '—')}</td>
                                <td>{(r.weight_kg ? Number(r.weight_kg).toLocaleString() : '—')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {/* RFP lanes upload/editor bound to Command Center company with manual overrides */}
                    <div className='mt-4 rounded border p-3'>
                      <div className='flex items-center gap-2 mb-3'>
                        <input id='cc-lanes-file' type='file' accept='.xlsx,.xls,.csv,application/json' className='hidden' onChange={async (e) => {
                          try {
                            const f = (e.target as HTMLInputElement).files && (e.target as HTMLInputElement).files![0]; if (!f) return;
                            const mod = await import('../../lib/rfp/ingest');
                            // @ts-ignore
                            const payload = await mod.ingestWorkbook(f);
                            setRfpPayload(payload);
                            try { localStorage.setItem(rfpKey, JSON.stringify(payload)); } catch {}
                            const dk = deriveKpisFromPayload(payload);
                            if (dk && overview) {
                              setOverview({ ...overview, kpis: { ...(overview.kpis||{}), shipments12m: dk.shipments12m, originsTop: dk.originsTop, destsTop: dk.destsTop } });
                            }
                            const el = document.getElementById('cc-lanes-file') as HTMLInputElement | null; if (el) el.value = '';
                          } catch { alert('Import failed'); }
                        }} />
                        <button className='px-3 py-1.5 rounded border text-xs' onClick={() => { const el = document.getElementById('cc-lanes-file') as HTMLInputElement | null; if (el) el.click(); }}>Import Lanes</button>
                        <button className='px-3 py-1.5 rounded border text-xs' onClick={() => { try { localStorage.setItem(rfpKey, JSON.stringify(rfpPayload || {})); alert('Saved'); } catch { alert('Save failed'); } }}>Save</button>
                        <button className='px-3 py-1.5 rounded border text-xs text-red-600' onClick={() => { try { localStorage.removeItem(rfpKey); } catch {} setRfpPayload(null); alert('Reset'); }}>Reset</button>
                      </div>
                      <div className='grid grid-cols-1 md:grid-cols-3 gap-3 mb-3'>
                        <div className='text-xs'>
                          <div className='mb-1 font-medium'>Shipments (12M) Override</div>
                          <input className='w-full border rounded px-2 py-1 text-sm' placeholder='e.g., 120' onChange={(e)=>{
                            const v = Number(e.target.value||0);
                            if (overview) setOverview({ ...overview, kpis: { ...(overview.kpis||{}), shipments12m: v } });
                          }} />
                        </div>
                        <div className='text-xs'>
                          <div className='mb-1 font-medium'>Total Air Revenue (USD)</div>
                          <input className='w-full border rounded px-2 py-1 text-sm' placeholder='e.g., 250000' onChange={(e)=>{ /* reserved for future charts */ }} />
                        </div>
                        <div className='text-xs'>
                          <div className='mb-1 font-medium'>Total Ocean Revenue (USD)</div>
                          <input className='w-full border rounded px-2 py-1 text-sm' placeholder='e.g., 500000' onChange={(e)=>{ /* reserved */ }} />
                        </div>
                        <div className='text-xs'>
                          <div className='mb-1 font-medium'>Total Trucking Revenue (USD)</div>
                          <input className='w-full border rounded px-2 py-1 text-sm' placeholder='e.g., 120000' onChange={(e)=>{ /* reserved */ }} />
                        </div>
                        <div className='text-xs'>
                          <div className='mb-1 font-medium'>Total Drayage Revenue (USD)</div>
                          <input className='w-full border rounded px-2 py-1 text-sm' placeholder='e.g., 80000' onChange={(e)=>{ /* reserved */ }} />
                        </div>
                      </div>
                      {rfpPayload && Array.isArray(rfpPayload.lanes) && rfpPayload.lanes.length > 0 ? (
                        <div className='overflow-auto'>
                          <table className='w-full text-sm border'>
                            <thead className='bg-slate-50'>
                              <tr><th className='p-2 border'>Service</th><th className='p-2 border'>Equipment</th><th className='p-2 border'>POL</th><th className='p-2 border'>POD</th><th className='p-2 border'>Origin Country</th><th className='p-2 border'>Dest Country</th><th className='p-2 border'>Shipments</th><th className='p-2 border'>Avg Kg</th><th className='p-2 border'>Avg CBM</th></tr>
                            </thead>
                            <tbody>
                              {rfpPayload.lanes.map((ln: any, i: number) => (
                                <tr key={i}>
                                  <td className='p-2 border'>{ln.mode || '—'}</td>
                                  <td className='p-2 border'>{ln.equipment || '—'}</td>
                                  <td className='p-2 border'>{ln.origin?.port || '—'}</td>
                                  <td className='p-2 border'>{ln.destination?.port || '—'}</td>
                                  <td className='p-2 border'>{ln.origin?.country || '—'}</td>
                                  <td className='p-2 border'>{ln.destination?.country || '—'}</td>
                                  <td className='p-2 border'>{ln.demand?.shipments_per_year || 0}</td>
                                  <td className='p-2 border'>{ln.demand?.avg_weight_kg || 0}</td>
                                  <td className='p-2 border'>{ln.demand?.avg_volume_cbm || 0}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className='text-xs text-slate-600'>No uploaded lanes for this company.</div>
                      )}
                    </div>
                  </div>
                )}
                {!loading && !error && tab === 'Contacts' && (
                  <div className='mt-3 text-sm text-slate-700'>
                    <div className='mb-2 flex items-center gap-2'>
                      <button className='px-3 py-1.5 rounded border text-xs' onClick={async()=>{
                        try {
                          const api = await import('../../lib/api');
                          await (api as any).enrichContacts(String(activeId));
                          alert('Contacts enrichment queued');
                          // refetch after a short delay
                          setTimeout(async()=>{
                            try {
                              const api = await import('../../lib/api');
                              const c: any = await (api as any).listContacts(String(activeId));
                              setContacts(Array.isArray(c?.contacts) ? c.contacts : (Array.isArray(c) ? c : []));
                            } catch {}
                          }, 1000);
                        } catch(e:any){ alert('Enrich contacts failed: '+ String(e?.message||e)); }
                      }}>Enrich Contacts</button>
                    </div>
                    {contacts.length === 0 ? (
                      <div className='text-slate-600'>No contacts to show.</div>
                    ) : (
                      <div className='overflow-auto rounded border'>
                        <table className='w-full text-sm'>
                          <thead className='sticky top-0 bg-white'><tr className='[&>th]:py-2 [&>th]:text-left'>
                            <th>Name</th><th>Title</th><th>Email</th><th>Dept</th>
                          </tr></thead>
                          <tbody>
                            {contacts.map((c:any, i:number)=> (
                              <tr key={i} className='border-t'>
                                <td>{c.name || c.full_name || '—'}</td>
                                <td>{c.title || '—'}</td>
                                <td>{c.email || '—'}</td>
                                <td>{c.dept || c.department || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
                {!loading && !error && tab === 'Activity' && (
                  <div className='mt-3 grid grid-cols-1 md:grid-cols-2 gap-3'>
                    <div className='rounded-lg border p-3'>
                      <div className='font-medium mb-2'>Email Threads</div>
                      {threads.length === 0 ? <div className='text-sm text-slate-600'>No recent threads.</div> : (
                        <ul className='text-sm list-disc pl-4'>{threads.slice(0,10).map((t:any,i:number)=>(<li key={i}>{t.subject || t.snippet || 'Thread'}</li>))}</ul>
                      )}
                    </div>
                    <div className='rounded-lg border p-3'>
                      <div className='font-medium mb-2'>Calendar Events</div>
                      {events.length === 0 ? <div className='text-sm text-slate-600'>No upcoming events.</div> : (
                        <ul className='text-sm list-disc pl-4'>{events.slice(0,10).map((e:any,i:number)=>(<li key={i}>{e.title || e.summary || 'Event'}</li>))}</ul>
                      )}
                    </div>
                  </div>
                )}
                {!loading && !error && tab === 'Campaigns' && (
                  <div className='mt-3 flex flex-col sm:flex-row gap-2 items-start'>
                    <input className='border rounded px-3 py-2 text-sm' value={campaignName} onChange={e=>setCampaignName(e.target.value)} placeholder='Campaign name' />
                    <select className='border rounded px-3 py-2 text-sm' value={campaignChannel} onChange={e=>setCampaignChannel(e.target.value as any)}>
                      <option value='email'>Email</option>
                      <option value='linkedin'>LinkedIn</option>
                    </select>
                    <button className='px-3 py-2 rounded bg-gradient-to-r from-blue-600 to-blue-500 text-white text-sm' onClick={async()=>{
                      try {
                        await saveCampaign({ name: campaignName, channel: campaignChannel, company_ids: [String(activeId)] });
                        alert('Campaign created');
                      } catch(e:any){ alert('Save failed: '+ String(e?.message||e)); }
                    }}>Create</button>
                  </div>
                )}
                {!loading && !error && tab === 'Settings' && (
                  <div className='mt-3 flex flex-wrap gap-2'>
                    <button className='px-3 py-2 rounded border text-sm' onClick={async()=>{ try{ await saveCompanyToCrm({ company_id: String(activeId), company_name: active?.name || 'Company', source:'companies' }); alert('Saved to CRM'); }catch(e:any){ alert('Save failed: '+ String(e?.message||e)); } }}>Save to CRM</button>
                    <button className='px-3 py-2 rounded border text-sm' onClick={async()=>{ try{ await enrichCompany({ company_id: String(activeId) }); alert('Enrichment queued'); }catch(e:any){ alert('Enrich failed: '+ String(e?.message||e)); } }}>Enrich Now</button>
                    <button className='px-3 py-2 rounded border text-sm' onClick={async()=>{ try{ await createTask({ company_id: String(activeId), title: 'Follow up', notes: 'Automated task' }); alert('Task created'); }catch(e:any){ alert('Task failed: '+ String(e?.message||e)); } }}>Create Task</button>
                    <button className='px-3 py-2 rounded border text-sm' onClick={async()=>{ try{ await createAlert({ company_id: String(activeId), type: 'info', message: 'Review KPIs' }); alert('Alert created'); }catch(e:any){ alert('Alert failed: '+ String(e?.message||e)); } }}>Create Alert</button>
                    {/* Archive / Delete / Remove from lists */}
                    <button className='px-3 py-2 rounded border text-sm text-amber-700' onClick={()=>{
                      try {
                        const key = 'lit_companies';
                        const raw = localStorage.getItem(key); const arr = raw? JSON.parse(raw):[];
                        const next = Array.isArray(arr)? arr.map((c:any)=> String(c?.id)===String(activeId)? { ...c, archived: true }: c): arr;
                        localStorage.setItem(key, JSON.stringify(next));
                        window.dispatchEvent(new StorageEvent('storage', { key }));
                        alert('Archived');
                      } catch { alert('Archive failed'); }
                    }}>Archive Company</button>
                    <button className='px-3 py-2 rounded border text-sm text-red-700' onClick={()=>{
                      if (!confirm('Remove this company from Command Center?')) return;
                      try {
                        const key = 'lit_companies';
                        const raw = localStorage.getItem(key); const arr = raw? JSON.parse(raw):[];
                        const next = Array.isArray(arr)? arr.filter((c:any)=> String(c?.id)!==String(activeId)) : arr;
                        localStorage.setItem(key, JSON.stringify(next));
                        window.dispatchEvent(new StorageEvent('storage', { key }));
                        // Remove related local data
                        try { localStorage.removeItem(`lit_rfp_payload_${String(activeId)}`); } catch {}
                        try {
                          const rr = localStorage.getItem('lit_rfps');
                          const rarr = rr? JSON.parse(rr):[];
                          localStorage.setItem('lit_rfps', JSON.stringify((Array.isArray(rarr)? rarr.filter((r:any)=> String(r?.companyId)!==String(activeId)) : rarr)));
                        } catch {}
                        try {
                          const cc = localStorage.getItem('lit_campaigns_companies');
                          const carr = cc? JSON.parse(cc):[];
                          localStorage.setItem('lit_campaigns_companies', JSON.stringify((Array.isArray(carr)? carr.filter((id:string)=> String(id)!==String(activeId)) : carr)));
                        } catch {}
                        alert('Removed');
                      } catch { alert('Remove failed'); }
                    }}>Remove Company</button>
                    <button className='px-3 py-2 rounded border text-sm' onClick={()=>{
                      // Remove from Campaign
                      try {
                        const cc = localStorage.getItem('lit_campaigns_companies'); const carr = cc? JSON.parse(cc):[];
                        const next = Array.isArray(carr)? carr.filter((id:string)=> String(id)!==String(activeId)) : carr;
                        localStorage.setItem('lit_campaigns_companies', JSON.stringify(next));
                        alert('Removed from Campaign list');
                      } catch { alert('Failed'); }
                    }}>Remove from Campaign</button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className='flex items-center justify-center min-h-[420px]'>
              <div className='relative text-center max-w-xl px-6'>
                <Sparkles className='absolute inset-0 m-auto w-48 h-48 text-indigo-300 opacity-15 pointer-events-none' />
                <p className='relative font-bold text-slate-900'>This is your COMPANY ENRICHMENT COMMAND CENTER — select a company on the left to view KPIs, shipments, contacts, and AI insights.</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

