import React, { useState, useEffect, useRef } from 'react';
import { RFPQuote, Company, Contact } from '@/api/entities';
import { User } from '@/api/entities';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Plus, Mail, Upload, BarChart3, DollarSign } from 'lucide-react';
import LitSidebar from '../components/ui/LitSidebar';
import LitPageHeader from '../components/ui/LitPageHeader';
import LitPanel from '../components/ui/LitPanel';
import LitWatermark from '../components/ui/LitWatermark';
import { rfpSearchCompanies, rfpGetCompanyShipments, rfpGetBenchmark, rfpExportHtml, rfpExportPdf, rfpAddToCampaign } from '@/lib/api.rfp';
import { ingestWorkbook } from '@/lib/rfp/ingest';
import { priceAll } from '@/lib/rfp/pricing';
import { defaultTemplates } from '@/lib/rfp/templates';
import { toHtml, toPdf } from '@/lib/rfp/export';

// existing builder/preview kept for future wiring

export default function RFPStudio() {
  const [activeTab, setActiveTab] = useState('overview');
  const [rfps, setRfps] = useState([
    { id: 'rfp_001', name: 'Pride Mobility — Ocean 2026', client: 'Pride Mobility', status: 'Draft', due: 'Dec 12' },
    { id: 'rfp_002', name: 'Shaw Industries — LCL Program', client: 'Shaw Industries', status: 'Active', due: 'Jan 08' },
    { id: 'rfp_003', name: 'Wahoo Fitness — Q1 Air', client: 'Wahoo Fitness', status: 'Outreach', due: 'Nov 30' }
  ]);
  const [activeId, setActiveId] = useState('rfp_001');
  const [quoteData, setQuoteData] = useState({
    quote_name: '',
    mode_combo: 'ocean',
    origin: '',
    destination: '',
    commodity: '',
    contact_email: '',
    contact_name: '',
    company_name: '',
    incoterm: 'FOB',
    valid_until: '',
    total_cost: 0,
    ocean_json: { rate: '', transit_time: '', notes: '' },
    air_json: { rate: '', transit_time: '', notes: '' },
    dray_json: { rate: '', transit_time: '', notes: '' },
    ftl_json: { rate: '', transit_time: '', notes: '' },
    notes: ''
  });
  
  const [isLoading, setIsLoading] = useState(false);

  const hasAccess = true;

  const [company, setCompany] = useState(null);
  const [lanes, setLanes] = useState([]);
  const [finModel, setFinModel] = useState(null);
  const [busy, setBusy] = useState(null);
  const fileRef = useRef(null);
  const [rfpPayload, setRfpPayload] = useState(null);
  const [priced, setPriced] = useState(null);
  const [proposalSummary, setProposalSummary] = useState('');
  const [proposalSolution, setProposalSolution] = useState('');

  useEffect(() => { setIsLoading(false); }, []);

  const loadSavedQuotes = async () => {};

  const handleSave = async () => {};

  const handleSendEmail = async () => {};

  const handleDownloadPDF = async () => {};

  const generateQuoteEmailHTML = (_quote) => '';

  if (isLoading) { return null; }

  // keep page accessible; gating can be added later

  async function loadKpisForActive() {
    try {
      setBusy('load');
      const r = rfps.find(x=> x.id===activeId);
      const q = (r && (r.client || (r.name && r.name.split('—')[0]))) || '';
      const s = await rfpSearchCompanies({ q, limit: 1, offset: 0 });
      const item = (Array.isArray(s?.items) && s.items[0]) || null;
      if (!item) { setCompany(null); setLanes([]); setFinModel(null); return; }
      const companyId = item.company_id || '';
      const shipments12m = Number(item.shipments12m || item.shipments || 0);
      const kpis = {
        companyId,
        companyName: item.company_name || 'Company',
        shipments12m,
        lastActivity: (item.lastActivity && item.lastActivity.value) ? item.lastActivity.value : (item.lastActivity || null) || undefined,
        originsTop: (item.originsTop || []).map((o)=> String((o && (o.v||o)) || '')),
        destsTop: (item.destsTop || []).map((d)=> String((d && (d.v||d)) || '')),
        carriersTop: (item.carriersTop || []).map((c)=> String((c && (c.v||c)) || '')),
      };
      setCompany(kpis);
      const g = await rfpGetCompanyShipments(companyId, 200, 0);
      const rows = Array.isArray(g?.rows) ? g.rows : [];
      const aggMap = new Map();
      for (const row of rows) {
        const key = `${row.origin_country||row.origin}=>${row.dest_country||row.destination}`;
        const prev = aggMap.get(key) || { origin_country: row.origin_country||row.origin, dest_country: row.dest_country||row.destination, shipments: 0, value_usd: 0 };
        prev.shipments += 1;
        const v = Number(row.value_usd||0);
        if (!Number.isNaN(v)) prev.value_usd = (prev.value_usd||0) + v;
        aggMap.set(key, prev);
      }
      const lanesAgg = Array.from(aggMap.values());
      setLanes(lanesAgg);
      const baseline = lanesAgg.reduce((sum, l)=> sum + (Number(l.value_usd||0)), 0) || (shipments12m * 8650);
      let proposed = baseline * 0.87;
      try {
        const bench = await rfpGetBenchmark({ mode: 'ocean', lanes: lanesAgg.map(l=> ({ o: l.origin_country, d: l.dest_country, vol: l.shipments })) });
        if (bench && typeof bench.proposedUsd === 'number') proposed = bench.proposedUsd;
      } catch {}
      const savings = Math.max(0, baseline - proposed);
      const pct = baseline > 0 ? (savings / baseline) : 0;
      setFinModel({ baseline, proposed, savings, pct });
    } finally {
      setBusy(null);
    }
  }

  useEffect(()=>{ if (activeId) loadKpisForActive(); }, [activeId]);

  return (
    <div className="relative px-2 md:px-5 py-3 min-h-screen">
      <div className="w-full flex gap-[5px]">
        <aside className="hidden md:block w-[340px] shrink-0">
          <LitSidebar title="RFPs">
              <div className="space-y-3">
                {rfps.map(r => (
                  <button key={r.id} onClick={()=>{ setActiveId(r.id); setActiveTab('overview'); }} className={`w-full text-left p-3 rounded-xl border ${activeId===r.id? 'bg-white ring-2 ring-violet-300 border-slate-200':'bg-white/90 border-slate-200 hover:bg-white'}`}>
                    <div className="text-sm font-semibold text-[#23135b] truncate">{r.name}</div>
                    <div className="mt-1 text-xs text-slate-600 flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">{r.status}</span>
                      <span className="text-slate-500">Due {r.due}</span>
                      {r.client && <span className="text-slate-700">• {r.client}</span>}
                    </div>
                  </button>
                ))}
              </div>
          </LitSidebar>
        </aside>

        <main className="flex-1 min-w-0 p-[5px] max-w-none">
          <LitWatermark />
          <LitPageHeader title={company?.companyName ? `RFP Studio — ${company.companyName}` : 'RFP Studio'}>
            <Button className="bg-gradient-to-r from-blue-600 to-blue-500 text-white" onClick={()=>{
              const name = prompt('RFP name','New RFP');
              if (!name) return;
              const client = prompt('Client name','DSV A/S') || '';
              const id = 'rfp_'+Math.random().toString(36).slice(2,8);
              const due = new Date(); due.setDate(due.getDate()+21);
              const dueStr = due.toLocaleDateString(undefined,{ month:'short', day:'2-digit'});
              const next = [{ id, name, client, status:'Draft', due: dueStr }, ...rfps];
              setRfps(next); setActiveId(id); setActiveTab('overview');
              setCompany(null); setLanes([]); setFinModel(null);
            }}><Plus className="w-4 h-4 mr-1"/> New RFP</Button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,application/json" className="hidden" onChange={async(e)=>{
              try {
                const f = e.target.files && e.target.files[0]; if (!f) return;
                const payload = await ingestWorkbook(f);
                setRfpPayload(payload);
                const pricedRes = priceAll(payload.lanes, payload.rates);
                setPriced(pricedRes);
                setActiveTab('proposal');
                if (fileRef.current) fileRef.current.value = '';
              } catch(err){ alert('Import failed'); }
            }} />
            <Button variant="outline" className="border-slate-200" onClick={()=> fileRef.current && fileRef.current.click()}><Upload className="w-4 h-4 mr-1"/> Import</Button>
            <Button variant="outline" className="border-slate-200" onClick={()=>{
              setActiveTab('proposal');
              setProposalSummary('Draft a proposal executive summary for DSV including quantified savings, capacity strategy, compliance, technology, sustainability.');
              setProposalSolution('Our solution provides dedicated capacity, compliance management, visibility tooling, and sustainability reporting.');
            }}><FileText className="w-4 h-4 mr-1"/> Templates</Button>
          </LitPageHeader>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="proposal">Proposal</TabsTrigger>
                <TabsTrigger value="rates">Rates</TabsTrigger>
                <TabsTrigger value="financials">Financials</TabsTrigger>
                <TabsTrigger value="vendors">Vendors</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="export">Export & Outreach</TabsTrigger>
              </TabsList>
              <TabsContent value="rates" className="mt-6 space-y-6">
                <LitPanel title="Proposed Rate Templates">
                  <div className="grid md:grid-cols-2 gap-4 text-sm">
                    {Object.entries(defaultTemplates).map(([k, v]) => (
                      <div key={k} className="rounded-xl border p-3 bg-white/95">
                        <div className="font-semibold text-slate-900 mb-2">{k}</div>
                        <div className="text-slate-700">Base: {v.base.name} — {v.base.uom} — ${v.base.rate}{v.base.min?` (min ${v.base.min})`:''}</div>
                        <div className="mt-2 text-slate-600">Accessorials:</div>
                        <ul className="list-disc pl-5 text-slate-600">
                          {v.accessorials.map((a,i)=>(<li key={i}>{a.name} — {a.uom} — ${a.rate}</li>))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </LitPanel>
                <div className="rounded-xl border border-slate-200 bg-white/90 p-3 text-xs text-slate-600">These templates are applied automatically when no explicit rates are uploaded. Edit this source later to customize per account.</div>
              </TabsContent>

              <TabsContent value="overview" className="mt-6 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  <LitPanel title="Company">
                    <div className="text-3xl font-black text-slate-900">{company?.companyName || '—'}</div>
                    <p className="text-xs text-slate-500 mt-1">ID: {company?.companyId || '—'}</p>
                  </LitPanel>
                  <LitPanel title="Shipments (12M)"><div className="text-3xl font-black text-slate-900">{(company?.shipments12m||0).toLocaleString()}</div></LitPanel>
                  <LitPanel title="Top Origins"><div className="text-sm text-slate-900">{(company?.originsTop||[]).slice(0,3).join(', ')||'—'}</div></LitPanel>
                  <LitPanel title="Top Carriers"><div className="text-sm text-slate-900">{(company?.carriersTop||[]).slice(0,3).join(', ')||'—'}</div></LitPanel>
                </div>
                <LitPanel title="Timeline">
                  <div className="h-40 flex items-center justify-center text-slate-500 text-sm">Timeline chart placeholder</div>
                </LitPanel>
              </TabsContent>

              <TabsContent value="proposal" className="mt-6 space-y-6">
                {rfpPayload?.__diagnostics && (
                  <div className="rounded-xl border border-slate-200 bg-white/90 p-3 text-sm text-slate-700">
                    Confidence: {(rfpPayload.__diagnostics.confidence*100).toFixed(0)}% — Sheets scanned: {rfpPayload.__diagnostics.sheetRanks.length}
                  </div>
                )}
                <LitPanel title="Executive Summary">
                  <textarea className="w-full h-40 p-3 border rounded-lg" placeholder="Draft your executive summary here..." value={proposalSummary} onChange={e=> setProposalSummary(e.target.value)} />
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" className="bg-violet-600 text-white"><BarChart3 className="w-4 h-4 mr-1"/> AI Assist</Button>
                    <Button size="sm" variant="outline">Refine with AI</Button>
                    <Button size="sm" variant="outline">Generate Talk Tracks</Button>
                  </div>
                </LitPanel>
                {priced && priced.lanes.length > 0 && (
                  <LitPanel title="Lane Pricing (Detected)">
                    <div className="text-sm text-slate-600 mb-2">Total Annual: ${priced.totalAnnual.toLocaleString()}</div>
                    <div className="space-y-3">
                      {priced.lanes.map((p, idx)=> (
                        <div key={idx} className="rounded-xl border p-3 bg-white/95">
                          <div className="flex items-center justify-between">
                            <div className="font-semibold text-slate-900">{p.mode}{p.equipment?(' / '+p.equipment):''}</div>
                            <div className="text-slate-900 font-bold flex items-center"><DollarSign className="w-4 h-4 mr-1"/>{p.unitCost.toFixed(2)} / shpt</div>
                          </div>
                          <div className="text-xs text-slate-600">Annual: ${p.annualCost.toLocaleString()}</div>
                        </div>
                      ))}
                    </div>
                  </LitPanel>
                )}
                {!priced || priced.lanes.length === 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 p-3 text-sm">
                    Upload detected, but lanes/rates were empty. Ensure your CSV has a lanes sheet (mode, origin/destination) and a rates sheet (charge, uom, rate). Try saving as XLSX if CSV headers are merged.
                  </div>
                ) : null}
                <LitPanel title="Solution Offering">
                  <textarea className="w-full h-32 p-3 border rounded-lg" placeholder="Describe your solution..." value={proposalSolution} onChange={e=> setProposalSolution(e.target.value)} />
                </LitPanel>
              </TabsContent>

              <TabsContent value="financials" className="mt-6 space-y-6">
                <LitPanel title="Savings Model">
                  {finModel ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                      <div className="rounded-lg border p-4 bg-white/95">
                        <div className="text-slate-500">Baseline</div>
                        <div className="text-2xl font-black text-slate-900">${finModel.baseline.toLocaleString()}</div>
                      </div>
                      <div className="rounded-lg border p-4 bg-white/95">
                        <div className="text-slate-500">Proposed</div>
                        <div className="text-2xl font-black text-slate-900">${finModel.proposed.toLocaleString()}</div>
                      </div>
                      <div className="rounded-lg border p-4 bg-white/95">
                        <div className="text-slate-500">Savings</div>
                        <div className="text-2xl font-black text-green-600">${finModel.savings.toLocaleString()} ({(finModel.pct*100).toFixed(1)}%)</div>
                      </div>
                    </div>
                  ) : (
                    <div className="h-48 flex items-center justify-center text-slate-500 text-sm">Baseline vs Proposed chart</div>
                  )}
                </LitPanel>
              </TabsContent>

              <TabsContent value="vendors" className="mt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {["MSC","MAERSK","CMA","HAPAG","ONE","HMM"].map((v)=>(
                    <LitPanel key={v} title={v}>
                      <div className="text-sm text-slate-600">Contacts: 2</div>
                      <div className="mt-2"><Button size="sm" className="bg-blue-600 text-white"><Mail className="w-4 h-4 mr-1"/> Invite</Button></div>
                    </LitPanel>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="timeline" className="mt-6">
                <LitPanel title="Milestones">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    {['Kickoff','Vendor Q&A','Proposal Draft','Submission'].map((m)=>(<div key={m} className="p-3 rounded-lg border">{m}</div>))}
                  </div>
                </LitPanel>
              </TabsContent>

              <TabsContent value="export" className="mt-6 space-y-4">
                <div className="flex gap-2">
                  <Button className="bg-blue-600 text-white" disabled={busy==='pdf'} onClick={async()=>{
                    try{
                      setBusy('pdf');
                      // Try server first
                      try {
                        const body={ company: company||{}, proposal:{ executiveSummary: proposalSummary, solutionOffering: proposalSolution}, financials: finModel||{} };
                        const r= await rfpExportPdf(body);
                        if(r?.pdfUrl){ window.open(r.pdfUrl,'_blank'); return; }
                      } catch {}
                      // Fallback to client-side export if we have payload
                      if (rfpPayload && priced) {
                        const html = toHtml(rfpPayload, priced);
                        const blob = await toPdf(html);
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a'); a.href=url; a.download = `${(rfps.find(x=>x.id===activeId)?.name||'proposal').replace(/\s+/g,'-')}.pdf`; a.click(); URL.revokeObjectURL(url);
                      } else {
                        alert('No priced payload to export. Upload an RFP workbook first.');
                      }
                    } finally { setBusy(null); }
                  }}>Export PDF</Button>
                  <Button variant="outline" disabled={busy==='html'} onClick={async()=>{
                    try{
                      setBusy('html');
                      try {
                        const body={ company: company||{}, proposal:{ executiveSummary: proposalSummary, solutionOffering: proposalSolution}, financials: finModel||{} };
                        const r= await rfpExportHtml(body);
                        if (r?.html) {
                          const blob = new Blob([r.html], { type:'text/html' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a'); a.href=url; a.download=`${(rfps.find(x=>x.id===activeId)?.name||'proposal').replace(/\s+/g,'-')}.html`; a.click(); URL.revokeObjectURL(url);
                          return;
                        }
                      } catch {}
                      if (rfpPayload && priced) {
                        const html = toHtml(rfpPayload, priced);
                        const blob = new Blob([html], { type:'text/html' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a'); a.href=url; a.download=`${(rfps.find(x=>x.id===activeId)?.name||'proposal').replace(/\s+/g,'-')}.html`; a.click(); URL.revokeObjectURL(url);
                      } else {
                        alert('No priced payload to export. Upload an RFP workbook first.');
                      }
                    } finally { setBusy(null); }
                  }}>Export HTML</Button>
                  <Button variant="outline" disabled={busy==='campaign'} onClick={async()=>{
                    try{ setBusy('campaign'); const html = '<h1>Proposal</h1>'; const title = `RFP: ${company?.companyName||'Company'}`; await rfpAddToCampaign({ companyId: company?.companyId||'', title, html }); alert('Draft campaign created'); } finally { setBusy(null); }
                  }}>Add to Campaign</Button>
                </div>
                <LitPanel title="Preview">
                  <div className="h-56 flex items-center justify-center text-slate-500 text-sm">Proposal preview placeholder</div>
                </LitPanel>
              </TabsContent>
            </Tabs>
        </main>
      </div>
    </div>
  );
}
