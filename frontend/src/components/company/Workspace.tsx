import React, { useEffect, useMemo, useState } from 'react';
import PreCallBriefing from '@/components/company/PreCallBriefing';
import { buildPreCallPrompt } from '@/lib/ai';
import {
  searchCompanies,
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
} from '@/lib/api';

const Pill = ({ children }: { children: React.ReactNode }) => (
  <span className='px-2 py-0.5 rounded-full text-xs bg-white/70 border border-white/60 shadow-sm'>{children}</span>
);

function CompanyCard({ c, active, onClick }: { c: any; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`w-full text-left rounded-2xl p-4 mb-3 transition shadow hover:shadow-lg border ${active ? 'border-slate-300 bg-white' : 'border-white/40 bg-gradient-to-br from-white/80 to-white/60 backdrop-blur'}`}>
      <div className='font-semibold'>{c.name}</div>
      <div className='text-xs text-slate-500'>Shipments 12M</div>
      <div className='text-lg font-extrabold'>{(c.kpis?.shipments12m ?? 0).toLocaleString()}</div>
      <div className='mt-1 text-[11px] text-slate-500'>Last: {c.kpis?.lastActivity || '—'}</div>
      <div className='mt-2 flex gap-1 flex-wrap'>{(c.kpis?.originsTop || []).slice(0, 3).map((x: string) => (<Pill key={x}>{x}</Pill>))}</div>
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
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter(c => String(c.name || '').toLowerCase().includes(q));
  }, [companies, query]);
  const active = useMemo(() => companies.find(c => c.id === activeId), [companies, activeId]);
  const [tab, setTab] = useState('Overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<any | null>(null);
  const [shipments, setShipments] = useState<any[]>([]);
  const [threads, setThreads] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [campaignName, setCampaignName] = useState('Follow-up Campaign');
  const [campaignChannel, setCampaignChannel] = useState<'email' | 'linkedin'>('email');

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

  return (
    <div className='w-full mx-auto flex flex-col lg:flex-row gap-5 px-5'>
      <aside className='w-full lg:w-[320px] xl:w-[360px] shrink-0'>
        <div className='rounded-3xl p-4 bg-white/80 backdrop-blur border border-white/50 shadow-xl'>
          <div className='mb-3 flex items-center justify-between gap-2'>
            <h2 className='text-sm font-semibold text-slate-700'>Companies</h2>
            <button onClick={onAdd} className='text-xs px-2 py-1 rounded-lg border bg-gradient-to-r from-blue-600 to-blue-500 text-white'>Add</button>
          </div>
          <div className='mb-3'>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder='Search companies…' className='w-full text-sm border rounded-lg px-3 py-2 bg-white/70' />
          </div>
          <div className='max-h-[70vh] overflow-auto pr-1'>
            {filtered.map(c => (
              <CompanyCard key={c.id} c={c} active={c.id === activeId} onClick={() => { setActiveId(c.id); setTab('Overview'); }} />
            ))}
            {filtered.length === 0 && (
              <div className='text-xs text-slate-500 py-6 text-center'>No companies match “{query}”.</div>
            )}
          </div>
        </div>
      </aside>
      <main className='min-w-0 flex-1 pr-5'>
        <div className='rounded-3xl p-5 md:p-6 bg-white/80 backdrop-blur border border-white/50 shadow-2xl'>
          {active ? (
            <>
              <div className='flex items-center justify-between gap-4 flex-wrap'>
                <div>
                  <h1 className='text-2xl font-black text-slate-900'>{active.name}</h1>
                  <div className='text-xs text-slate-500'>ID: {active.id}</div>
                </div>
                <div className='flex gap-2 text-xs'>
                  {(active.kpis?.destsTop || []).map((d: string) => (<Pill key={d}>Dest {d}</Pill>))}
                </div>
              </div>
              <div className='mt-4'>
                <Tabs tabs={["Overview", "Shipments", "Contacts", "Activity", "Campaigns", "Settings"]} value={tab} onChange={setTab} />
                {loading && (<div className='text-sm text-slate-600'>Loading…</div>)}
                {error && (<div className='text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3'>{error}</div>)}
                {!loading && !error && tab === 'Overview' && overview && (
                  <div className='mt-3'>
                    <PreCallBriefing company={{ name: overview.name, kpis: overview.kpis || overview.kpi || overview.k, charts: overview.charts, ai: overview.ai }} />
                  </div>
                )}
                {!loading && !error && tab === 'Shipments' && (
                  <div className='mt-3'>
                    {shipments.length === 0 ? (
                      <div className='text-sm text-slate-600'>No recent shipments.</div>
                    ) : (
                      <div className='overflow-auto rounded border'>
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
                  </div>
                )}
                {!loading && !error && tab === 'Contacts' && (
                  <div className='mt-3 text-sm text-slate-700'>
                    <div className='text-xs text-slate-500 mb-2'>Enrich contacts via Settings → Enrich Now. Contact management UI will be expanded in a follow-up.</div>
                    <div className='text-slate-600'>No contacts to show.</div>
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
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className='text-slate-500'>Select a company…</div>
          )}
        </div>
      </main>
    </div>
  );
}

