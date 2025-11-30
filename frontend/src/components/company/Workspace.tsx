import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Package as PackageIcon, Ship as ShipIcon, Newspaper, Linkedin as LinkedinIcon, TrendingUp, DollarSign, Sparkles } from 'lucide-react';
import PreCallBriefing from '../company/PreCallBriefing';
import CompanyFirmographics from './CompanyFirmographics';
import { exportCompanyPdf } from '../pdf/exportCompanyPdf';
import { buildPreCallPrompt } from '../../lib/ai';
import {
  getCompanyShipments,
  kpiFrom,
  recallCompany,
  saveCampaign,
  saveCompanyToCrm,
  enrichCompany,
  type IyCompanyProfile,
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
        <div className='font-semibold text-[16px] pr-1 tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-sky-400 to-violet-500'>{c.name}</div>
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

type WorkspaceProps = {
  companies: any[];
  onAdd: () => void;
  activeCompanyId?: string | null;
  onActiveCompanyChange?: (companyId: string | null) => void;
  companyProfile?: IyCompanyProfile | null;
  enrichment?: any | null;
  loading?: boolean;
  error?: string | null;
};

export default function Workspace({
  companies,
  onAdd,
  activeCompanyId,
  onActiveCompanyChange,
  companyProfile = null,
  enrichment = null,
  loading: profileLoading = false,
  error: profileError = null,
}: WorkspaceProps) {
  const [activeId, setActiveId] = useState<string | null>(companies[0]?.id ?? null);
  const aiVendor = (((import.meta as any)?.env?.VITE_AI_VENDOR) || '') as string;
  const aiEnabled = !!aiVendor;
  const [query, setQuery] = useState('');
  const [filterRfp, setFilterRfp] = useState(false);
  const [filterCampaign, setFilterCampaign] = useState(false);

  useEffect(() => {
    if (!activeCompanyId) return;
    if (activeCompanyId !== activeId) {
      setActiveId(activeCompanyId);
    }
  }, [activeCompanyId, activeId]);

  useEffect(() => {
    onActiveCompanyChange?.(activeId ?? null);
  }, [activeId, onActiveCompanyChange]);
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
  const primaryContact = useMemo(() => contacts.find((c: any) => c.isPrimary || c.is_primary), [contacts]);
  const [campaignName, setCampaignName] = useState('Follow-up Campaign');
  const [campaignChannel, setCampaignChannel] = useState<'email' | 'linkedin'>('email');

  const gemini = enrichment ?? {};
  const normalizedCompany = gemini?.normalized_company ?? null;
  const logisticsKpis = gemini?.logistics_kpis ?? null;
  const spendAnalysis = gemini?.spend_analysis ?? null;
  const ccEnrichment = gemini?.command_center_enrichment ?? null;
  const salesAssets = gemini?.sales_assets ?? null;
  const preCallBrief = salesAssets?.pre_call_brief ?? null;
  const crmSavePayload = gemini?.crm_save_payload ?? null;
  const predictiveInsights = gemini?.predictive_insights ?? null;

  const shipments12m =
    logisticsKpis?.shipments_12m ??
    companyProfile?.routeKpis?.shipmentsLast12m ??
    companyProfile?.totalShipments ??
    null;
  const teus12m =
    logisticsKpis?.teus_12m ??
    companyProfile?.routeKpis?.teuLast12m ??
    null;
  const estSpendTotal =
    spendAnalysis?.estimated_12m_spend_total ??
    companyProfile?.estSpendUsd12m ??
    null;

  const displayName =
    normalizedCompany?.name ??
    companyProfile?.title ??
    companyProfile?.name ??
    companies.find((c) => String(c.id) === String(activeId))?.name ??
    'Company';
  const displayWebsite =
    normalizedCompany?.website ??
    companyProfile?.website ??
    companyProfile?.rawWebsite ??
    null;
  const displayDomain =
    normalizedCompany?.domain ??
    companyProfile?.domain ??
    null;
  const displayCountry =
    normalizedCompany?.country ??
    companyProfile?.country ??
    companyProfile?.countryCode ??
    null;
  const locationLabel =
    normalizedCompany?.location ??
    (([normalizedCompany?.city ?? null, normalizedCompany?.state ?? null, displayCountry ?? null]
      .filter((value) => Boolean(value))
      .join(', ')) ||
      companyProfile?.address ||
      companyProfile?.country ||
      null);
  const primaryCompanyId =
    companyProfile?.companyId ??
    normalizedCompany?.company_id ??
    (activeId ? String(activeId) : null) ??
    '—';

  const quickSummary = ccEnrichment?.quick_summary ?? null;
  const recommendedPriority = ccEnrichment?.recommended_priority ?? null;
  const alerts = Array.isArray(ccEnrichment?.alerts) ? ccEnrichment.alerts : [];

  const crmPayload = useMemo(() => {
    const baseCompanyId =
      crmSavePayload?.company_id ??
      normalizedCompany?.company_id ??
      companyProfile?.companyId ??
      (activeId ? String(activeId) : null);

    return {
      company_id: baseCompanyId,
      stage: crmSavePayload?.stage ?? 'prospect',
      provider: crmSavePayload?.provider ?? 'importyeti+gemini',
      payload: {
        ...(crmSavePayload?.payload ?? {}),
        name: displayName,
        website: displayWebsite,
        domain: displayDomain,
        phone:
          normalizedCompany?.phone ??
          companyProfile?.phoneNumber ??
          null,
        country: displayCountry,
        city: normalizedCompany?.city ?? null,
        state: normalizedCompany?.state ?? null,
        total_shipments: companyProfile?.totalShipments ?? null,
        shipments_12m: shipments12m,
        teus_12m: teus12m,
        primary_trade_lanes: logisticsKpis?.top_lanes ?? [],
        tags: normalizedCompany?.tags ?? [],
        opportunity_score: predictiveInsights?.opportunity_score ?? null,
        rfp_likelihood_score:
          predictiveInsights?.rfp_likelihood_score ?? null,
        recommended_priority: recommendedPriority ?? null,
      },
    };
  }, [
    activeId,
    companyProfile,
    crmSavePayload,
    displayDomain,
    displayName,
    displayWebsite,
    displayCountry,
    logisticsKpis,
    normalizedCompany,
    predictiveInsights,
    recommendedPriority,
    shipments12m,
    spendAnalysis,
    teus12m,
  ]);

  const preCallData = useMemo(
    () => ({
      name: displayName,
      kpis: {
        ...(overview?.kpis || {}),
        shipments12m: shipments12m ?? overview?.kpis?.shipments12m,
        teus12m: teus12m ?? overview?.kpis?.teus12m,
        estSpendUsd12m: estSpendTotal ?? overview?.kpis?.estSpendUsd12m,
      },
      charts: overview?.charts,
      ai: {
        summary: preCallBrief?.summary ?? quickSummary ?? overview?.ai?.summary ?? '',
        bullets:
          (Array.isArray(preCallBrief?.bullets) && preCallBrief?.bullets) ||
          overview?.ai?.bullets ||
          [],
      },
    }),
    [displayName, overview, shipments12m, teus12m, estSpendTotal, preCallBrief, quickSummary],
  );

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
    if (activeCompanyId) return;
    if (!activeId && companies && companies.length > 0) {
      setActiveId(companies[0].id);
    } else if (activeId && companies && companies.length > 0) {
      const exists = companies.some(c => String(c.id) === String(activeId));
      if (!exists) setActiveId(companies[0].id);
    }
  }, [companies, activeCompanyId, activeId]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      if (!activeId) return;
      setLoading(true);
      setError(null);
      try {
        // Fetch shipments
        try {
          const s = await getCompanyShipments(String(activeId), { limit: 20, offset: 0 });
          if (!ignore) setShipments(Array.isArray(s?.rows) ? s.rows : []);
        } catch {
          if (!ignore) setShipments([]);
        }

        // Try to find company via search for KPIs (dynamic import to avoid build-time linkage)
        let match: any = null;
        try {
          const mod = await import('../../lib/api');
          if ((mod as any).searchCompanies) {
            const res = await (mod as any).searchCompanies({
              q: null,
              origin: null,
              dest: null,
              hs: null,
              limit: 50,
              offset: 0,
            });
            const items = Array.isArray((res as any)?.rows) ? (res as any).rows : [];
            match = items.find((x: any) => String(x?.company_id) === String(activeId)) || null;
          }
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
          const mod = await import('../../lib/api');
          if ((mod as any).getEmailThreads) {
            const t = await (mod as any).getEmailThreads(String(activeId));
            if (!ignore) setThreads(Array.isArray(t?.threads) ? t.threads : (Array.isArray(t) ? t : []));
          }
        } catch {}
        try {
          const mod = await import('../../lib/api');
          if ((mod as any).getCalendarEvents) {
            const ev = await (mod as any).getCalendarEvents(String(activeId));
            if (!ignore) setEvents(Array.isArray(ev?.events) ? ev.events : (Array.isArray(ev) ? ev : []));
          }
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

  if (profileLoading) {
    return <div className='p-4 text-sm text-slate-500'>Loading Command Center…</div>;
  }

  if (profileError) {
    return <div className='p-4 text-sm text-rose-500'>{profileError}</div>;
  }

  if (!companyProfile && !normalizedCompany) {
    return <div className='p-4 text-sm text-slate-500'>No company selected.</div>;
  }

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
            <h1 className='text-3xl md:text-3xl font-extrabold tracking-tight text-slate-900'>{displayName}</h1>
                    <div className='text-xs text-slate-500'>ID: {primaryCompanyId}</div>
                </div>
                <div className='flex items-center gap-2'>
                    <button className='px-3 py-1.5 rounded border text-xs' onClick={async()=>{
                      try {
                        if (crmPayload?.company_id) {
                          await saveCompanyToCrm({
                            company: {
                              company_id: crmPayload.company_id,
                              stage: crmPayload.stage,
                              provider: crmPayload.provider,
                              payload: crmPayload.payload,
                            },
                          });
                        } else {
                          await saveCompanyToCrm({
                            company_id: String(active?.company_id ?? active?.id ?? ''),
                            company_name: displayName,
                            source: 'companies',
                          });
                        }
                        alert('Saved to CRM');
                      } catch(e:any){
                        alert('Save failed: '+ String(e?.message||e));
                      }
                  }}>Save</button>
                  <button className='rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:shadow-md px-3 py-1.5 text-xs' onClick={async()=>{
                      try { await enrichCompany({ company_id: String(active?.company_id ?? active?.id ?? '') }); alert('Enrichment queued'); } catch(e:any){ alert('Enrich failed: '+ String(e?.message||e)); }
                  }}>Enrich Now</button>
                  <button className='px-3 py-1.5 rounded border text-xs disabled:opacity-60' title={aiEnabled? 'AI Recall' : 'Connect AI in Settings → Providers'} disabled={!aiEnabled}
                    onClick={async()=>{
                      try { await recallCompany({ company_id: String(active?.company_id ?? active?.id ?? '') }); alert('AI Recall requested'); } catch(e:any){ alert('Recall failed: '+ String(e?.message||e)); }
                  }}>AI Recall</button>
                </div>
              </div>
              <div className='mt-4'>
                <Tabs tabs={["Overview", "Pre-Call", "Contacts", "Shipments", "RFP", "Activity", "Campaigns", "Settings"]} value={tab} onChange={setTab} />
                {loading && (<div className='text-sm text-slate-600'>Loading…</div>)}
                {error && (<div className='text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3'>{error}</div>)}
                {!loading && !error && tab === 'Overview' && overview && (
                  <div className='mt-3 space-y-4'>
                    {alerts.length > 0 && (
                      <div className='rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800'>
                        <p className='font-semibold uppercase tracking-wide text-[10px] text-amber-600'>Alerts</p>
                        <ul className='mt-2 space-y-1'>
                          {alerts.map((alert, idx) => (
                            <li key={`alert-${idx}`}>{typeof alert === 'string' ? alert : alert?.message ?? ''}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {primaryContact && (
                      <FeaturedContact c={primaryContact} onSetPrimary={(id)=> setContacts(prev=> prev.map((c:any)=> ({...c, is_primary: String(c.id)===String(id), isPrimary: String(c.id)===String(id)})))} />
                    )}
                    <div className='grid gap-4 md:grid-cols-2'>
                      <CompanyFirmographics company={{ id: String(activeId), name: overview.name }} />
                      <RfpPanel primary={primaryContact || undefined} onAddCampaign={async()=>{
                        try { await saveCampaign({ name: `${overview?.name||'Company'} — Outreach`, channel: 'email', company_ids: [String(activeId)] }); alert('Added to Campaigns'); } catch(e:any){ alert('Failed: '+ String(e?.message||e)); }
                      }} />
                    </div>
                    <ContactsList rows={contacts as any} onSelect={()=>{}} onSetPrimary={(id)=> setContacts(prev=> prev.map((c:any)=> ({...c, is_primary: String(c.id)===String(id), isPrimary: String(c.id)===String(id)})))} />
                  </div>
                )}
                {!loading && !error && tab === 'Pre-Call' && overview && (
                  <div className='mt-3'>
                    <div className='flex items-center justify-end gap-2'>
                      <button className='rounded border px-3 py-1.5 text-sm' onClick={async()=>{ try{ const pdf=await exportCompanyPdf('company-pdf-root','Company.pdf'); pdf.save('company.pdf'); }catch(e:any){ alert('PDF failed: '+ String(e?.message||e)); } }}>Save PDF</button>
                      <button className='rounded border px-3 py-1.5 text-sm' onClick={async()=>{ try{ const pdf=await exportCompanyPdf('company-pdf-root','Company.pdf'); const data = pdf.output('datauristring'); await fetch('/api/lit/crm/emailPdf', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ data, filename:'company.pdf', to:'' }) }); alert('Email queued'); }catch(e:any){ alert('Email failed: '+ String(e?.message||e)); } }}>Email PDF</button>
                    </div>
                    <section id='company-pdf-root'>
                      <PreCallBriefing company={preCallData} />
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
                  <div className='mt-3'>
                    <div className='mb-3 flex items-center gap-2'>
                      <button className='px-3 py-1.5 rounded border text-xs' onClick={async()=>{
                        try {
                          const api = await import('../../lib/api');
                          await (api as any).enrichContacts(String(activeId));
                          setTimeout(async()=>{
                            try {
                              const c: any = await (api as any).listContacts(String(activeId));
                              setContacts(Array.isArray(c?.contacts) ? c.contacts : (Array.isArray(c) ? c : []));
                            } catch {}
                          }, 1200);
                        } catch(e:any){ alert('Enrich contacts failed: '+ String(e?.message||e)); }
                      }}>Enrich Contacts</button>
                    </div>
                    <div className='grid gap-4 md:grid-cols-2'>
                      {/* Featured primary contact */}
                      <div className='md:col-span-2'>
                        {Array.isArray(contacts) && contacts.find((c:any)=> c.is_primary || c.isPrimary) ? (
                          <div className='rounded-2xl border bg-white p-4'>
                            <div className='text-sm font-semibold mb-2'>Primary Contact</div>
                            <div className='flex items-center justify-between gap-3'>
                              <div className='min-w-0'>
                                <div className='font-medium truncate'>{(contacts.find((c:any)=> c.is_primary || c.isPrimary)?.full_name) || (contacts.find((c:any)=> c.is_primary || c.isPrimary)?.name) || '—'}</div>
                                <div className='text-xs text-slate-600'>{contacts.find((c:any)=> c.is_primary || c.isPrimary)?.title || '—'}</div>
                              </div>
                              <button className='px-3 py-1.5 rounded border text-xs' onClick={()=>{
                                const pid = contacts.find((c:any)=> c.is_primary || c.isPrimary)?.id;
                                if (!pid) return;
                                setContacts(prev=> prev.map((c:any)=> ({...c, is_primary: String(c.id)===String(pid), isPrimary: String(c.id)===String(pid)})));
                              }}>Set Primary</button>
                            </div>
                          </div>
                        ) : (
                          <div className='rounded-2xl border bg-white p-4 text-sm text-slate-600'>No primary contact yet.</div>
                        )}
                      </div>
                      {/* Contacts list */}
                      <div className='md:col-span-2'>
                        <div className='rounded-2xl border bg-white p-4'>
                          <div className='text-sm font-semibold mb-2'>All Contacts</div>
                          {contacts.length === 0 ? (
                            <div className='text-sm text-slate-600'>No contacts to show.</div>
                          ) : (
                            <div className='divide-y'>
                              {contacts.map((c:any, i:number)=> (
                                <div key={i} className='py-2 flex items-center justify-between gap-3'>
                                  <div className='min-w-0'>
                                    <div className='font-medium truncate'>{c.full_name || c.name || '—'}</div>
                                    <div className='text-xs text-slate-600 truncate'>{c.title || '—'}{c.department? ` • ${c.department}`: ''}{c.location? ` • ${c.location}`: ''}</div>
                                  </div>
                                  <div className='flex items-center gap-2'>
                                    <button className='px-2 py-1 rounded border text-xs' onClick={()=>{
                                      setContacts(prev=> prev.map((x:any)=> ({...x, is_primary: String(x.id)===String(c.id), isPrimary: String(x.id)===String(c.id)})));
                                    }}>Set Primary</button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
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
                {!loading && !error && tab === 'RFP' && (
                  <div className='mt-3'>
                    <RfpPanel primary={contacts.find(c=> c.isPrimary) || undefined} onAddCampaign={async()=>{
                      try { await saveCampaign({ name: `${overview?.name||'Company'} — Outreach`, channel: 'email', company_ids: [String(activeId)] }); alert('Added to Campaigns'); } catch(e:any){ alert('Failed: '+ String(e?.message||e)); }
                    }} />
                    <div className='mt-4 text-sm text-slate-600'>Assign this contact to the active campaign or RFP. Add sequencing later.</div>
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
                  <div className='mt-3 flex flex-col gap-4'>
                    <div className='rounded-xl border p-4 bg-white/95'>
                      <div className='grid grid-cols-1 md:grid-cols-2 gap-3 text-sm'>
                        <label className='block'>
                          <div className='text-slate-600 mb-1'>Company Name</div>
                          <input className='w-full border rounded px-3 py-2'
                            defaultValue={active?.name||''}
                            onBlur={(e)=>{
                              const v=e.target.value; if(!v) return; const key='lit_companies';
                              try{ const raw=localStorage.getItem(key); const arr=raw?JSON.parse(raw):[]; const next=Array.isArray(arr)? arr.map((c:any)=> String(c.id)===String(activeId)? { ...c, name:v }: c): arr; localStorage.setItem(key, JSON.stringify(next)); window.dispatchEvent(new StorageEvent('storage',{key})); }catch{}
                            }} />
                        </label>
                        <label className='block'>
                          <div className='text-slate-600 mb-1'>Website</div>
                          <input className='w-full border rounded px-3 py-2' defaultValue={(active as any)?.website||''}
                            onBlur={(e)=>{ const v=e.target.value; const key='lit_companies'; try{ const raw=localStorage.getItem(key); const arr=raw?JSON.parse(raw):[]; const next=Array.isArray(arr)? arr.map((c:any)=> String(c.id)===String(activeId)? { ...c, website:v }: c): arr; localStorage.setItem(key, JSON.stringify(next)); window.dispatchEvent(new StorageEvent('storage',{key})); }catch{} }} />
                        </label>
                        <label className='block'>
                          <div className='text-slate-600 mb-1'>Email</div>
                          <input className='w-full border rounded px-3 py-2' defaultValue={(active as any)?.email||''}
                            onBlur={(e)=>{ const v=e.target.value; const key='lit_companies'; try{ const raw=localStorage.getItem(key); const arr=raw?JSON.parse(raw):[]; const next=Array.isArray(arr)? arr.map((c:any)=> String(c.id)===String(activeId)? { ...c, email:v }: c): arr; localStorage.setItem(key, JSON.stringify(next)); window.dispatchEvent(new StorageEvent('storage',{key})); }catch{} }} />
                        </label>
                        <label className='block'>
                          <div className='text-slate-600 mb-1'>Phone</div>
                          <input className='w-full border rounded px-3 py-2' defaultValue={(active as any)?.phone||''}
                            onBlur={(e)=>{ const v=e.target.value; const key='lit_companies'; try{ const raw=localStorage.getItem(key); const arr=raw?JSON.parse(raw):[]; const next=Array.isArray(arr)? arr.map((c:any)=> String(c.id)===String(activeId)? { ...c, phone:v }: c): arr; localStorage.setItem(key, JSON.stringify(next)); window.dispatchEvent(new StorageEvent('storage',{key})); }catch{} }} />
                        </label>
                        <label className='block'>
                          <div className='text-slate-600 mb-1'>City</div>
                          <input className='w-full border rounded px-3 py-2' defaultValue={(active as any)?.city||''}
                            onBlur={(e)=>{ const v=e.target.value; const key='lit_companies'; try{ const raw=localStorage.getItem(key); const arr=raw?JSON.parse(raw):[]; const next=Array.isArray(arr)? arr.map((c:any)=> String(c.id)===String(activeId)? { ...c, city:v }: c): arr; localStorage.setItem(key, JSON.stringify(next)); window.dispatchEvent(new StorageEvent('storage',{key})); }catch{} }} />
                        </label>
                        <label className='block'>
                          <div className='text-slate-600 mb-1'>State</div>
                          <input className='w-full border rounded px-3 py-2' defaultValue={(active as any)?.state||''}
                            onBlur={(e)=>{ const v=e.target.value; const key='lit_companies'; try{ const raw=localStorage.getItem(key); const arr=raw?JSON.parse(raw):[]; const next=Array.isArray(arr)? arr.map((c:any)=> String(c.id)===String(activeId)? { ...c, state:v }: c): arr; localStorage.setItem(key, JSON.stringify(next)); window.dispatchEvent(new StorageEvent('storage',{key})); }catch{} }} />
                        </label>
                        <label className='block md:col-span-2'>
                          <div className='text-slate-600 mb-1'>Products (comma-separated)</div>
                          <input className='w-full border rounded px-3 py-2' defaultValue={(overview as any)?.products?.join(', ')||''}
                            onBlur={(e)=>{ const raw=e.target.value; const products = raw.split(',').map(s=>s.trim()).filter(Boolean); setOverview(prev => prev? { ...prev, products }: prev); }} />
                        </label>
                      </div>
                      <div className='mt-3 flex gap-2'>
                        <button className='px-3 py-2 rounded border text-sm' onClick={async()=>{ try{ await saveCompanyToCrm({ company_id: String(activeId), company_name: active?.name || 'Company', source:'companies' }); alert('Saved to CRM'); }catch(e:any){ alert('Save failed: '+ String(e?.message||e)); } }}>Save to CRM</button>
                        <button className='px-3 py-2 rounded border text-sm' onClick={async()=>{ try{ await enrichCompany({ company_id: String(activeId) }); alert('Enrichment queued'); }catch(e:any){ alert('Enrich failed: '+ String(e?.message||e)); } }}>Enrich Now</button>
                      </div>
                    </div>
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

