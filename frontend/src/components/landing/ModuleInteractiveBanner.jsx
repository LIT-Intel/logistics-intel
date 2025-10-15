import React, { useState } from 'react';

const tabs = [
  { key: 'search', label: 'Search Intelligence' },
  { key: 'cc', label: 'Command Center' },
  { key: 'campaigns', label: 'Campaigns' },
  { key: 'rfp', label: 'RFP Studio' },
];

function Panel({ title, subtitle, children }) {
  return (
    <div className="grid lg:grid-cols-2 gap-6 items-start">
      <div>
        <h3 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">{title}</h3>
        <p className="mt-2 text-slate-600 text-base leading-relaxed">{subtitle}</p>
        <div className="mt-4">
          <a href="/request-demo" className="inline-block px-5 py-2 rounded-xl bg-gradient-to-r from-[#3C4EF5] to-[#AB34F5] text-white font-semibold hover:brightness-110 transition-transform duration-200 hover:scale-105">Request Demo</a>
        </div>
      </div>
      <div className="rounded-2xl border shadow-sm bg-white/90 p-4 min-h-[220px]">
        {children}
      </div>
    </div>
  );
}

export default function ModuleInteractiveBanner() {
  const [active, setActive] = useState('search');
  return (
    <section className="py-16">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex border-b border-slate-200 space-x-4 mb-6">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className={`py-2 px-4 text-sm font-medium ${active===t.key ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative">
          {active === 'search' && (
            <Panel title="Search Intelligence" subtitle="Find shippers & receivers. Filter by origin/destination, HS, mode, and more.">
              <div className="grid gap-2">
                <div className="flex gap-2">
                  <input className="flex-1 border rounded-xl px-3 py-2 text-sm" placeholder="Search companies or HS code…" />
                  <button className="px-4 py-2 rounded-xl bg-slate-900 text-white hover:brightness-110">Search</button>
                </div>
                <div className="rounded-xl border p-3 text-sm">No results yet. Try searching for \"Dole\" or \"Acme\".</div>
              </div>
            </Panel>
          )}
          {active === 'cc' && (
            <Panel title="Command Center" subtitle="Company overview: KPIs, contacts, shipments, and actions.">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-slate-500">Shipments (12m)</div>
                  <div className="text-xl font-semibold">741</div>
                </div>
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-slate-500">Top Lane</div>
                  <div className="text-xl font-semibold">CN → US</div>
                </div>
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-slate-500">Last Activity</div>
                  <div className="text-xl font-semibold">2 days ago</div>
                </div>
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-slate-500">Contacts</div>
                  <div className="text-xl font-semibold">12</div>
                </div>
              </div>
            </Panel>
          )}
          {active === 'campaigns' && (
            <Panel title="Campaigns" subtitle="Create outreach sequences and track performance.">
              <div className="rounded-xl border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="font-medium">Outreach — Dole Food Company</div>
                  <button className="text-xs rounded-lg border px-2 py-1">View</button>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-lg bg-slate-50 p-2">Open: 48%</div>
                  <div className="rounded-lg bg-slate-50 p-2">Reply: 12%</div>
                  <div className="rounded-lg bg-slate-50 p-2">Meetings: 4</div>
                </div>
              </div>
            </Panel>
          )}
          {active === 'rfp' && (
            <Panel title="RFP Studio" subtitle="Draft and compare carrier quotes with real shipment data.">
              <div className="grid gap-2 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <input className="border rounded-lg px-2 py-1" placeholder="Origin (e.g., CN SHA)" />
                  <input className="border rounded-lg px-2 py-1" placeholder="Destination (e.g., US LAX)" />
                </div>
                <button className="px-3 py-2 rounded-lg bg-slate-900 text-white w-max">Generate Quote</button>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </section>
  );
}
