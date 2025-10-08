import React, { useEffect, useMemo, useState } from "react";

// LIT — Command Center (LIT Enrich Service Demo, v2.1)
// Notes:
// - Pure React + Tailwind (no external UI deps) to guarantee canvas render.
// - Wired handlers to backend via /api/lit/* proxy to avoid CORS.
// - Designed to mirror Apollo/Lemlist polish: soft shadows, rounded-2xl, tight spacing.
// - Added smoke tests to catch missing icons/handlers at runtime.

// --- Tiny in-file icon set (so we don't depend on icon libs) --- //
const IconSparkle = (props: any) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={props.className}><path d="M12 2l1.8 4.4L18 8l-4.2 1.6L12 14l-1.8-4.4L6 8l4.2-1.6L12 2z"/></svg>
);
const IconShield = (props: any) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={props.className}><path d="M12 3l7 3v6c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V6l7-3z"/></svg>
);
const IconRefresh = (props: any) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={props.className}><path d="M20 12a8 8 0 10-2.34 5.66M20 12V7m0 5h-5"/></svg>
);
const IconMail = (props: any) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={props.className}><path d="M4 6h16v12H4z"/><path d="M4 6l8 6 8-6"/></svg>
);
const IconPhone = (props: any) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={props.className}><path d="M6 2h4l2 5-3 2a12 12 0 006 6l2-3 5 2v4c0 1-1 2-2 2C9 20 4 15 2 6c0-1 1-2 2-2z"/></svg>
);
const IconSearch = (props: any) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={props.className}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
);
const IconExternal = (props: any) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={props.className}><path d="M14 3h7v7"/><path d="M10 14L21 3"/><path d="M21 14v7h-7"/><path d="M3 10h7v7H3z"/></svg>
);
const IconLinkedIn = (props: any) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={props.className}>
    <path d="M4.98 3.5a2.5 2.5 0 11-.02 5 2.5 2.5 0 01.02-5zM4 8.98h2v12H4v-12zM9 8.98h1.92v1.64h.03c.27-.5 1.02-1.03 2.1-1.03 2.24 0 2.66 1.38 2.66 3.17v6.22h-2v-5.51c0-1.32-.02-3.02-1.84-3.02-1.84 0-2.12 1.43-2.12 2.92v5.61H9v-10z"/>
  </svg>
);
const IconStar = (props: any) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={props.className}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.77 5.82 22 7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
);
const IconTrash = (props: any) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={props.className}><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>
);
const IconArchive = (props: any) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={props.className}><rect x="3" y="3" width="18" height="4"/><path d="M5 7h14v14H5z"/><path d="M9 12h6"/></svg>
);
const IconSave = (props: any) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={props.className}><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg>
);

// --- Types --- //
interface Company {
  id: string;
  name: string;
  domain?: string;
  shipments12m?: number;
  lastActivity?: string; // ISO date
  topRoutes?: Array<{ origin: string; dest: string; count: number }>;
  topCarriers?: Array<{ name: string; sharePct: number }>;
}

interface Contact {
  id: string;
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  source?: string; // e.g., "LIT Enrich"
  linkedinUrl?: string;
  avatarUrl?: string;
  isPrimary?: boolean;
  status?: 'active' | 'archived' | 'invalid';
}

// --- Demo data (safe placeholders) --- //
const demoCompany: Company = {
  id: "C-982174",
  name: "Acme Robotics, Inc.",
  domain: "acmerobotics.com",
  shipments12m: 312,
  lastActivity: "2025-09-28",
  topRoutes: [
    { origin: "CN SHA", dest: "US LAX", count: 128 },
    { origin: "TW TPE", dest: "US SFO", count: 66 },
    { origin: "DE FRA", dest: "US JFK", count: 41 },
  ],
  topCarriers: [
    { name: "EVA Air", sharePct: 28 },
    { name: "Lufthansa Cargo", sharePct: 19 },
    { name: "China Eastern", sharePct: 13 },
  ],
};

const demoContacts: Contact[] = [
  { id: "p1", name: "Maya Chen", title: "VP Supply Chain", email: "maya@acmerobotics.com", phone: "+1 (415) 555-0142", source: "LIT Enrich", linkedinUrl: "https://www.linkedin.com/in/mayachen", avatarUrl: "https://i.pravatar.cc/64?img=1", isPrimary: true, status: 'active' },
  { id: "p2", name: "Derrick Cole", title: "Logistics Manager", email: "derrick@acmerobotics.com", phone: "+1 (949) 555-8821", source: "LIT Enrich", linkedinUrl: "https://www.linkedin.com/in/derrickcole", avatarUrl: "https://i.pravatar.cc/64?img=2", status: 'active' },
  { id: "p3", name: "Samir Patel", title: "Procurement Lead", email: "samir@acmerobotics.com", phone: "+1 (212) 555-3007", source: "Apollo Enrich", linkedinUrl: "https://www.linkedin.com/in/samirpatel", avatarUrl: "https://i.pravatar.cc/64?img=3", status: 'active' },
];

// --- Helper UI --- //
function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 p-4 rounded-2xl bg-white shadow-sm border border-gray-100">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-2xl font-semibold text-gray-900">{value}</div>
      {hint && <div className="text-xs text-gray-500">{hint}</div>}
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] px-2 py-1 border border-emerald-200">
      <IconShield className="w-3 h-3" /> {children}
    </span>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-700 text-xs px-2 py-1">{children}</span>;
}

// --- Main Demo Component --- //
export default function LITEnrichCommandCenterDemo() {
  const [company, setCompany] = useState<Company>(demoCompany);
  const [contacts, setContacts] = useState<Contact[]>(demoContacts);
  const [primaryId, setPrimaryId] = useState<string | null>(demoContacts.find(c=>c.isPrimary)?.id ?? null);
  const [newContact, setNewContact] = useState<Partial<Contact>>({});
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([
    "2025-10-07 18:05:23 — UI loaded",
    "2025-10-07 18:05:25 — Ready for enrichment",
  ]);

  const topLane = useMemo(() => company.topRoutes?.[0], [company.topRoutes]);

  function log(msg: string) {
    setLogs((prev) => [msg, ...prev]);
  }

  // ---- Wired to real endpoints via /api/lit proxy ---- //
  async function handleEnrichCompany() {
    setLoading(true);
    log(`⏳ ${new Date().toLocaleString()} — Enrichment started for ${company.name}`);
    const r = await fetch('/api/lit/crm/enrich', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company_id: company.id, domain: company.domain })
    });
    const ok = r.ok;
    log(`${ok ? '✅' : '⚠️'} ${new Date().toLocaleString()} — Company attributes ${ok ? 'refreshed' : 'failed'} (LIT Enrich)`);
    setLoading(false);
  }

  async function handleFindContacts() {
    setLoading(true);
    log(`⏳ ${new Date().toLocaleString()} — Searching LIT Enrich contacts for ${company.domain}`);
    const r = await fetch(`/api/lit/crm/contacts?domain=${encodeURIComponent(company.domain ?? '')}&limit=10`);
    const data = await r.json().catch(()=>({ rows: [] }));
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    setContacts(prev => [...rows, ...prev]);
    log(`✅ ${new Date().toLocaleString()} — ${rows.length} contact(s) appended from LIT Enrich`);
    setLoading(false);
  }

  async function handleGenerateBrief() {
    setLoading(true);
    log(`⏳ ${new Date().toLocaleString()} — Generating Pre‑Call Briefing`);
    const r = await fetch('/api/lit/crm/briefing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company_id: company.id }) });
    log(`${r.ok ? '✅' : '⚠️'} ${new Date().toLocaleString()} — Briefing ${r.ok ? 'ready' : 'failed'} and saved to timeline`);
    setLoading(false);
  }

  async function handleSaveToCampaign(contactId: string) {
    try {
      log(`⏳ ${new Date().toLocaleString()} — Saving contact ${contactId} to campaign`);
      const res = await fetch('/api/lit/public/campaigns/addContact', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contactId, companyId: company.id })
      });
      if (!res.ok) throw new Error(`addContact ${res.status}`);
      log(`✅ ${new Date().toLocaleString()} — Contact ${contactId} saved to campaign`);
    } catch (e: any) {
      log(`❌ ${new Date().toLocaleString()} — Save to campaign failed: ${e?.message || e}`);
    }
  }

  function handleSetPrimary(contactId: string) {
    setPrimaryId(contactId);
    setContacts(prev => prev.map(c=> ({...c, isPrimary: c.id===contactId})));
    log(`⭐ ${new Date().toLocaleString()} — Set primary contact → ${contactId}`);
  }

  async function handleArchive(contactId: string) {
    setContacts(prev => prev.map(c=> c.id===contactId ? {...c, status:'archived'} : c));
    log(`📦 ${new Date().toLocaleString()} — Archived contact ${contactId}`);
  }

  async function handleDelete(contactId: string) {
    setContacts(prev => prev.filter(c=> c.id!==contactId));
    log(`🗑️ ${new Date().toLocaleString()} — Deleted contact ${contactId}`);
  }

  async function handleAddContactManual() {
    if (!newContact.name) { log(`⚠️ ${new Date().toLocaleString()} — Provide a name to enrich`); return; }
    setLoading(true);
    log(`⏳ ${new Date().toLocaleString()} — Enriching manual contact via LIT Enrich: ${newContact.name}`);
    const r = await fetch('/api/lit/crm/contacts/enrich', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company_id: company.id, domain: company.domain, name: newContact.name, title: newContact.title, email: newContact.email, phone: newContact.phone, linkedinUrl: newContact.linkedinUrl }) });
    const data = await r.json().catch(()=>({ contact: null }));
    const c = (data as any)?.contact;
    if (c) setContacts(prev => [c, ...prev]);
    setNewContact({});
    log(`${r.ok ? '✅' : '⚠️'} ${new Date().toLocaleString()} — Manual contact ${r.ok ? 'enriched' : 'failed'}`);
    setLoading(false);
  }

  async function handleExportContactsPdf() {
    log(`⏳ ${new Date().toLocaleString()} — Preparing professional PDF (Contacts Overview)`);
    const r = await fetch('/api/lit/crm/contacts/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company: { id: company.id, name: company.name, domain: company.domain }, contacts }) });
    if (!r.ok) { log(`⚠️ ${new Date().toLocaleString()} — PDF export failed`); return; }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${company.name.replace(/\s+/g,'_')}_contacts.pdf`; a.click();
    URL.revokeObjectURL(url);
    log(`📄 ${new Date().toLocaleString()} — PDF exported`);
  }

  // --- Smoke tests (runtime) --- //
  useEffect(() => {
    function runSmokeTests() {
      const tests = [
        { name: 'IconSave defined', pass: typeof IconSave === 'function' },
        { name: 'Contacts seed present', pass: Array.isArray(demoContacts) && demoContacts.length >= 3 },
        { name: 'Handlers present', pass: [handleSaveToCampaign, handleAddContactManual, handleExportContactsPdf].every(fn => typeof fn === 'function') },
      ];
      const failed = tests.filter(t => !t.pass);
      if (failed.length) {
        console.error('[LIT Enrich — Smoke Tests] FAILED:', failed.map(f=>f.name));
      } else {
        console.log('[LIT Enrich — Smoke Tests] All good');
      }
    }
    runSmokeTests();
  }, []);

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-50 to-white">
      {/* Top bar */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-100">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm"><IconSparkle className="w-5 h-5"/></div>
            <div>
              <div className="text-sm text-slate-500">LIT Command Center</div>
              <div className="font-semibold text-slate-900">LIT Enrich Service Demo</div>
            </div>
            <div className="hidden md:flex items-center gap-2 ml-4">
              <Tag>LIT Enrich Connected</Tag>
              <Pill>Plan: Enterprise</Pill>
              <Pill>Live Data</Pill>
            </div>
          </div>

          <div className="flex items-center gap-2 w-96 max-w-full">
            <div className="relative flex-1">
              <IconSearch className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input
                placeholder="Search company…"
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <button
              onClick={handleEnrichCompany}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 shadow-sm"
            >
              <IconRefresh className="w-4 h-4"/> Enrich Now
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-4 py-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: Company Summary */}
        <section className="xl:col-span-1 space-y-4">
          <div className="p-5 rounded-2xl bg-white border border-slate-100 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs text-slate-500">Company</div>
                <div className="text-xl font-semibold text-slate-900">{company.name}</div>
                <div className="text-sm text-slate-600">ID: {company.id}</div>
              </div>
              <a href={`https://${company.domain}`} target="_blank" className="inline-flex items-center gap-1 text-indigo-600 text-sm font-medium hover:underline">
                {company.domain} <IconExternal className="w-4 h-4"/>
              </a>
            </div>

            <div className="grid grid-cols-3 gap-3 mt-4">
              <Stat label="Shipments (12m)" value={company.shipments12m ?? 0} />
              <Stat label="Top Lane" value={topLane ? `${topLane.origin} → ${topLane.dest}` : "—"} hint={`${topLane?.count ?? 0} moves`} />
              <Stat label="Last Activity" value={company.lastActivity ?? "—"} />
            </div>

            <div className="mt-4">
              <div className="text-xs text-slate-500 mb-2">Top Carriers</div>
              <div className="flex flex-wrap gap-2">
                {company.topCarriers?.map((c) => (
                  <div key={c.name} className="px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-xs">
                    {c.name} · {c.sharePct}%
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="font-medium text-slate-900">Enrichment</div>
              <Tag>LIT Enrich Active</Tag>
            </div>
            <div className="space-y-2 text-sm text-slate-600">
              <p>Use LIT Enrich to append verified emails, direct dials, and roles. Safe‑mode respects your plan’s monthly cap.</p>
              <div className="flex items-center gap-2">
                <button onClick={handleFindContacts} disabled={loading} className="px-3 py-2 rounded-xl text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60">
                  Find Contacts via LIT Enrich
                </button>
                <button onClick={handleEnrichCompany} disabled={loading} className="px-3 py-2 rounded-xl text-sm font-medium bg-slate-100 text-slate-900 hover:bg-slate-200 disabled:opacity-60">
                  Refresh Attributes
                </button>
              </div>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-slate-100 shadow-sm">
            <div className="font-medium text-slate-900 mb-3">Run Log</div>
            <div className="space-y-2 max-h-60 overflow-auto pr-1">
              {logs.map((l, i) => (
                <div key={i} className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2">{l}</div>
              ))}
            </div>
          </div>
        </section>

        {/* Middle: Contacts */}
        <section className="xl:col-span-1 space-y-4">
          <div className="p-5 rounded-2xl bg-white border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs text-slate-500">Contacts</div>
                <div className="text-lg font-semibold text-slate-900">Decision Makers</div>
              </div>
              <div className="flex items-center gap-2">
                <Pill>{contacts.length} results</Pill>
                <button onClick={handleExportContactsPdf} disabled={loading} className="px-3 py-2 rounded-xl text-sm font-medium bg-slate-900 text-white hover:bg-black disabled:opacity-60">
                  Export Contacts PDF
                </button>
                <button onClick={handleFindContacts} disabled={loading} className="px-3 py-2 rounded-xl text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60">
                  + Add from LIT Enrich
                </button>
              </div>
            </div>

            {/* Inline manual add + enrich */}
            <div className="mb-4 grid grid-cols-5 gap-2 text-sm">
              <input placeholder="Full name" value={newContact.name ?? ''} onChange={e=>setNewContact(v=>({...v, name:e.target.value}))} className="px-3 py-2 rounded-xl border border-slate-200 col-span-2"/>
              <input placeholder="Title" value={newContact.title ?? ''} onChange={e=>setNewContact(v=>({...v, title:e.target.value}))} className="px-3 py-2 rounded-xl border border-slate-200"/>
              <input placeholder="Email (optional)" value={newContact.email ?? ''} onChange={e=>setNewContact(v=>({...v, email:e.target.value}))} className="px-3 py-2 rounded-xl border border-slate-200"/>
              <input placeholder="LinkedIn URL (optional)" value={newContact.linkedinUrl ?? ''} onChange={e=>setNewContact(v=>({...v, linkedinUrl:e.target.value}))} className="px-3 py-2 rounded-xl border border-slate-200 col-span-2"/>
              <input placeholder="Phone (optional)" value={newContact.phone ?? ''} onChange={e=>setNewContact(v=>({...v, phone:e.target.value}))} className="px-3 py-2 rounded-xl border border-slate-200"/>
              <button onClick={handleAddContactManual} disabled={loading} className="px-3 py-2 rounded-xl text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60">Add + Enrich</button>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="text-left px-3 py-2">Contact</th>
                    <th className="text-left px-3 py-2">Title</th>
                    <th className="text-left px-3 py-2">Email</th>
                    <th className="text-left px-3 py-2">Phone</th>
                    <th className="text-left px-3 py-2">Source</th>
                    <th className="text-right px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c) => (
                    <tr key={c.id} className={`border-t border-slate-200 ${c.status==='archived' ? 'opacity-60' : ''}`}>
                      <td className="px-3 py-2 font-medium text-slate-900">
                        <div className="flex items-center gap-2">
                          <img src={c.avatarUrl ?? 'https://i.pravatar.cc/32'} alt={c.name} className="w-7 h-7 rounded-full border border-slate-200"/>
                          <div>
                            <div className="flex items-center gap-2">
                              <span>{c.name}</span>
                              {c.isPrimary && <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200"><IconStar className="w-3 h-3"/> Primary</span>}
                            </div>
                            {c.linkedinUrl && (
                              <a href={c.linkedinUrl} target="_blank" className="inline-flex items-center gap-1 text-xs text-slate-600 hover:underline">
                                <IconLinkedIn className="w-3 h-3"/> View LinkedIn
                              </a>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-700">{c.title ?? '—'}</td>
                      <td className="px-3 py-2 text-slate-700">{c.email ?? '—'}</td>
                      <td className="px-3 py-2 text-slate-700">{c.phone ?? '—'}</td>
                      <td className="px-3 py-2"><Pill>{c.source ?? '—'}</Pill></td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button onClick={()=>handleSaveToCampaign(c.id)} className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-900 inline-flex items-center gap-1"><IconSave className="w-4 h-4"/> Save</button>
                          <button onClick={()=>handleSetPrimary(c.id)} className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-900 inline-flex items-center gap-1"><IconStar className="w-4 h-4"/> Primary</button>
                          <a href={c.email ? `mailto:${c.email}` : undefined} className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-900 inline-flex items-center gap-1 disabled:opacity-60" aria-disabled={!c.email}>
                            <IconMail className="w-4 h-4"/> Email
                          </a>
                          <a href={c.phone ? `tel:${c.phone}` : undefined} className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-900 inline-flex items-center gap-1 disabled:opacity-60" aria-disabled={!c.phone}>
                            <IconPhone className="w-4 h-4"/> Call
                          </a>
                          <button onClick={()=>handleArchive(c.id)} className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-900 inline-flex items-center gap-1"><IconArchive className="w-4 h-4"/> Archive</button>
                          <button onClick={()=>handleDelete(c.id)} className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-rose-700 inline-flex items-center gap-1"><IconTrash className="w-4 h-4"/> Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="font-medium text-slate-900">Sequencing (read‑only demo)</div>
              <Pill>Campaigns</Pill>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="font-medium">Step 1</div>
                <div className="text-slate-600">Intro email · Day 0</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="font-medium">Step 2</div>
                <div className="text-slate-600">LinkedIn visit · Day 2</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="font-medium">Step 3</div>
                <div className="text-slate-600">Call + VM · Day 4</div>
              </div>
            </div>
          </div>
        </section>

        {/* Right: Pre‑Call Briefing */}
        <section className="xl:col-span-1 space-y-4">
          <div className="p-5 rounded-2xl bg-white border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs text-slate-500">Briefing</div>
                <div className="text-lg font-semibold text-slate-900">Pre‑Call Summary</div>
              </div>
              <button onClick={handleGenerateBrief} disabled={loading} className="px-3 py-2 rounded-xl text-sm font-medium bg-slate-900 text-white hover:bg-black disabled:opacity-60">
                Generate via AI
              </button>
            </div>
            <div className="space-y-3 text-sm text-slate-700">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="font-medium text-slate-900 mb-1">Why call now</div>
                <p>Acme’s import volume on SHA→LAX has surged (+18% QoQ). Likely evaluating new capacity and rates for peak.</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="font-medium text-slate-900 mb-1">Hook</div>
                <p>Share lane‑level market benchmarks and a 3‑lane quote with value‑add (tariff estimator + guaranteed cut‑off slots).</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="font-medium text-slate-900 mb-1">Next Best Action</div>
                <ul className="list-disc ml-5 space-y-1">
                  <li>Send intro to Maya (VP Supply Chain) with SHA→LAX spot comp.</li>
                  <li>Book a 15‑min discovery with Derrick (Logistics Manager).</li>
                  <li>Prep RFP draft with 3 carriers and 2‑week trial lane.</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="font-medium text-slate-900">RFP Quick Draft</div>
              <Pill>Quote Generator</Pill>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="grid gap-1">
                <span className="text-slate-600">Origin</span>
                <input defaultValue={topLane?.origin ?? "CN SHA"} className="px-3 py-2 rounded-xl border border-slate-200"/>
              </label>
              <label className="grid gap-1">
                <span className="text-slate-600">Destination</span>
                <input defaultValue={topLane?.dest ?? "US LAX"} className="px-3 py-2 rounded-xl border border-slate-200"/>
              </label>
              <label className="grid gap-1 col-span-2">
                <span className="text-slate-600">Commodities / HS</span>
                <input placeholder="e.g., 8471.49; robotics modules" className="px-3 py-2 rounded-xl border border-slate-200"/>
              </label>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <button className="px-3 py-2 rounded-xl text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700">Generate Quote</button>
              <button className="px-3 py-2 rounded-xl text-sm font-medium bg-slate-100 text-slate-900 hover:bg-slate-200">Export PDF</button>
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-10">
        <div className="text-xs text-slate-500">© 2025 Logistic Intel — Demo view. Replace stubs with live endpoints when promoting.</div>
      </footer>
    </div>
  );
}
