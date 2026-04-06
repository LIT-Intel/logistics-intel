import React, { useMemo, useState } from "react";
import AppLayout from "@/layout/lit/AppLayout.jsx";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Building2,
  FileText,
  Search,
  Users,
  Eye,
  Bookmark,
} from "lucide-react";

const monthlyTrendData = [
  { month: "Jan", companies: 6, contacts: 3 },
  { month: "Feb", companies: 8, contacts: 4 },
  { month: "Mar", companies: 7, contacts: 3 },
  { month: "Apr", companies: 11, contacts: 7 },
  { month: "May", companies: 13, contacts: 8 },
  { month: "Jun", companies: 12, contacts: 7 },
];

const topImportingCountries = [
  { name: "China", value: 34 },
  { name: "Germany", value: 22 },
  { name: "Vietnam", value: 18 },
  { name: "India", value: 14 },
  { name: "Mexico", value: 12 },
];

const topDestinations = [
  { name: "United States", value: 41 },
  { name: "Canada", value: 18 },
  { name: "Mexico", value: 15 },
  { name: "Brazil", value: 14 },
  { name: "Germany", value: 12 },
];

const totalShipmentsBreakdown = [
  { name: "Ocean FCL", value: 44 },
  { name: "Ocean LCL", value: 21 },
  { name: "Air", value: 19 },
  { name: "Rail", value: 9 },
  { name: "Truck", value: 7 },
];

const companiesTable = [
  {
    company: "Wal Mart",
    type: "Import/Export",
    location: "601 N Walton Blvd 7, US",
    shipments: "459,934",
    teu: 82,
    mode: "Ocean",
    lastShipment: "Mar 11, 2026",
    recency: "Recent",
    status: "High",
  },
  {
    company: "Walmart / 508 Sw 8Th St",
    type: "Import/Export",
    location: "Bentonville, US",
    shipments: "104,807",
    teu: 68,
    mode: "Ocean",
    lastShipment: "Mar 11, 2026",
    recency: "Recent",
    status: "High",
  },
  {
    company: "Walmart 601 N Walton Blvd",
    type: "Import/Export",
    location: "Bentonville, US",
    shipments: "22,481",
    teu: 51,
    mode: "Ocean",
    lastShipment: "Jul 17, 2025",
    recency: "Inactive",
    status: "High",
  },
  {
    company: "Walmart Global Logistics",
    type: "Import/Export",
    location: "508 Se 8Th St, US",
    shipments: "1,599",
    teu: 39,
    mode: "Ocean",
    lastShipment: "Mar 9, 2026",
    recency: "Recent",
    status: "High",
  },
  {
    company: "Walmart Puerto Rico",
    type: "Import/Export",
    location: "Carolina, US",
    shipments: "970",
    teu: 24,
    mode: "Air",
    lastShipment: "Mar 3, 2026",
    recency: "Recent",
    status: "Medium",
  },
  {
    company: "Sams Club Walmart Stores",
    type: "Import/Export",
    location: "601 N Walton Blvd 7, US",
    shipments: "587",
    teu: 17,
    mode: "Ocean",
    lastShipment: "Mar 10, 2026",
    recency: "Recent",
    status: "Medium",
  },
];

const activityFeed = [
  { type: "Search", name: "Walmart Global Logistics", when: "2 days ago" },
  { type: "Campaign", name: "Retail import outreach", when: "2 days ago" },
  { type: "Lead Prospect", name: "Maria Chen", when: "3 days ago" },
  { type: "RFP Generated", name: "Walmart Inbound 2026", when: "3 days ago" },
  { type: "Campaign Created", name: "Top Retailers Q2", when: "4 days ago" },
];

const pieColors = ["#2563eb", "#4f46e5", "#0ea5e9", "#22c55e", "#f59e0b"];

function StatCard({ title, value, note, change, changeClass = "text-green-600", icon: Icon }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
          {title}
        </div>
        {Icon ? (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <Icon size={18} />
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex items-end gap-2">
        <div className="text-3xl font-semibold text-slate-900">{value}</div>
        {change ? <div className={`text-sm font-semibold ${changeClass}`}>{change}</div> : null}
      </div>
      <div className="mt-2 text-sm text-slate-500">{note}</div>
    </div>
  );
}

function DonutCard({ title, subtitle, data }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-semibold text-slate-800">{title}</div>
      <div className="mt-1 text-sm text-slate-500">{subtitle}</div>

      <div className="mt-4 h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={58}
              outerRadius={84}
              paddingAngle={3}
              strokeWidth={0}
            >
              {data.map((entry, index) => (
                <Cell key={entry.name} fill={pieColors[index % pieColors.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 space-y-2">
        {data.map((item, index) => (
          <div key={item.name} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-slate-600">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: pieColors[index % pieColors.length] }}
              />
              {item.name}
            </div>
            <div className="font-medium text-slate-900">{item.value}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusPill({ value, tone = "green" }) {
  const styles = {
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    yellow: "bg-amber-50 text-amber-700 border-amber-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    slate: "bg-slate-50 text-slate-700 border-slate-200",
  };

  return (
    <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${styles[tone]}`}>
      {value}
    </span>
  );
}

function MiniProgress({ value }) {
  return (
    <div className="h-3 w-16 rounded-full bg-slate-200">
      <div
        className="h-3 rounded-full bg-slate-400"
        style={{ width: `${Math.max(8, Math.min(100, value))}%` }}
      />
    </div>
  );
}

function TradeMapPanel() {
  const [selectedRegion, setSelectedRegion] = useState("North America");

  const regionDetails = {
    "North America": {
      countries: "United States, Canada, Mexico",
      emphasis: "High search and CRM activity",
    },
    Europe: {
      countries: "Germany, Netherlands, Italy",
      emphasis: "Growing sourcing lanes",
    },
    Asia: {
      countries: "China, Vietnam, India",
      emphasis: "Top importing origins",
    },
    "South America": {
      countries: "Brazil, Chile, Colombia",
      emphasis: "Selective account expansion",
    },
    Africa: {
      countries: "South Africa, Morocco",
      emphasis: "Low but emerging coverage",
    },
    Oceania: {
      countries: "Australia, New Zealand",
      emphasis: "Low-frequency shipments",
    },
  };

  const active = regionDetails[selectedRegion];

  const regionButton = (label) =>
    [
      "rounded-xl border px-3 py-2 text-sm transition-colors",
      selectedRegion === label
        ? "border-blue-200 bg-blue-50 text-blue-700"
        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
    ].join(" ");

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-800">Global Trade Map</div>
          <div className="mt-1 text-sm text-slate-500">
            Interactive regional view of company activity and shipment footprint
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {Object.keys(regionDetails).map((region) => (
            <button key={region} type="button" className={regionButton(region)} onClick={() => setSelectedRegion(region)}>
              {region}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_.8fr]">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <svg viewBox="0 0 900 420" className="h-[320px] w-full">
            <rect x="0" y="0" width="900" height="420" rx="20" fill="#f8fafc" />
            <path
              d="M120 120 C95 80, 155 55, 205 75 C255 95, 285 125, 255 165 C225 205, 145 190, 120 120Z"
              fill={selectedRegion === "North America" ? "#3b82f6" : "#bfdbfe"}
              stroke="#ffffff"
              strokeWidth="3"
            />
            <path
              d="M235 220 C255 205, 285 225, 300 260 C318 300, 300 355, 275 380 C248 360, 228 320, 230 280 C232 255, 220 235, 235 220Z"
              fill={selectedRegion === "South America" ? "#3b82f6" : "#bfdbfe"}
              stroke="#ffffff"
              strokeWidth="3"
            />
            <path
              d="M385 95 C405 78, 450 82, 480 100 C495 118, 470 145, 432 142 C396 140, 370 118, 385 95Z"
              fill={selectedRegion === "Europe" ? "#3b82f6" : "#bfdbfe"}
              stroke="#ffffff"
              strokeWidth="3"
            />
            <path
              d="M430 155 C470 140, 535 150, 560 190 C585 230, 575 315, 520 355 C462 340, 430 285, 420 235 C412 200, 398 170, 430 155Z"
              fill={selectedRegion === "Africa" ? "#3b82f6" : "#dbeafe"}
              stroke="#ffffff"
              strokeWidth="3"
            />
            <path
              d="M520 90 C565 58, 675 58, 742 95 C808 132, 790 210, 722 225 C648 240, 612 195, 560 188 C522 180, 488 125, 520 90Z"
              fill={selectedRegion === "Asia" ? "#3b82f6" : "#93c5fd"}
              stroke="#ffffff"
              strokeWidth="3"
            />
            <path
              d="M725 292 C755 274, 812 284, 835 315 C812 348, 755 352, 725 332 C710 322, 710 302, 725 292Z"
              fill={selectedRegion === "Oceania" ? "#3b82f6" : "#bfdbfe"}
              stroke="#ffffff"
              strokeWidth="3"
            />

            <circle cx="185" cy="125" r="8" fill="#1d4ed8" />
            <circle cx="445" cy="110" r="8" fill="#1d4ed8" />
            <circle cx="645" cy="145" r="8" fill="#1d4ed8" />
            <circle cx="530" cy="225" r="8" fill="#1d4ed8" />
            <circle cx="275" cy="290" r="8" fill="#1d4ed8" />
            <circle cx="775" cy="320" r="8" fill="#1d4ed8" />
          </svg>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
            Active Region
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{selectedRegion}</div>

          <div className="mt-5 space-y-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                Top Countries
              </div>
              <div className="mt-1 text-sm text-slate-600">{active.countries}</div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                Coverage Note
              </div>
              <div className="mt-1 text-sm text-slate-600">{active.emphasis}</div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                Suggested Use
              </div>
              <div className="mt-2 text-sm text-slate-600">
                Use this panel to identify high-value sourcing regions and prioritize saved accounts by lane activity.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LITDashboard() {
  const totalShipments = useMemo(() => {
    return companiesTable
      .map((row) => Number(String(row.shipments).replace(/,/g, "")))
      .reduce((sum, value) => sum + value, 0)
      .toLocaleString();
  }, []);

  return (
    <AppLayout>
      <div className="min-h-full bg-slate-100 p-4 md:p-6 xl:p-8">
        <div className="mx-auto max-w-[1600px] space-y-6">
          <section>
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              Overview
            </div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
              Welcome back, Valesco
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              This dashboard is your command center for company intelligence,
              campaign activity, search usage, and product visibility.
            </p>
          </section>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Saved Companies"
              value="21"
              change="+12%"
              note="vs last month"
              icon={Building2}
            />
            <StatCard
              title="Active Campaigns"
              value="0"
              note="No campaigns yet"
              change=""
              icon={Users}
            />
            <StatCard
              title="Open RFPs"
              value="0"
              note="Create your first RFP"
              change=""
              icon={FileText}
            />
            <StatCard
              title="Searches Used"
              value="3"
              note="All-time usage"
              change=""
              icon={Search}
            />
          </section>

          <TradeMapPanel />

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="xl:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-800">
                    Performance Trends
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    Saved companies and enriched contacts over time
                  </div>
                </div>

                <div className="flex gap-6 text-sm">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                      Companies
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-slate-900">28</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                      Contacts
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-slate-900">13</div>
                  </div>
                </div>
              </div>

              <div className="mt-4 h-[320px] rounded-xl border border-slate-100 bg-slate-50 p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyTrendData} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="month"
                      tick={{ fill: "#64748b", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "#64748b", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip />
                    <Bar dataKey="companies" radius={[6, 6, 0, 0]} fill="#3b82f6" />
                    <Bar dataKey="contacts" radius={[6, 6, 0, 0]} fill="#6366f1" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm font-semibold text-slate-800">Activity Feed</div>
                <div className="mt-1 text-sm text-slate-500">
                  Recent actions and updates
                </div>

                <div className="mt-5 space-y-3">
                  {activityFeed.map((item) => (
                    <div
                      key={`${item.type}-${item.name}`}
                      className="rounded-xl border border-slate-200 px-4 py-3"
                    >
                      <div className="text-sm font-semibold text-slate-800">
                        {item.type}
                      </div>
                      <div className="mt-1 text-sm text-slate-600">{item.name}</div>
                      <div className="mt-1 text-xs text-slate-400">{item.when}</div>
                    </div>
                  ))}
                </div>
              </div>

              <DonutCard
                title="Top Importing Countries"
                subtitle="Breakdown from saved companies"
                data={topImportingCountries}
              />
              <DonutCard
                title="Top Destinations"
                subtitle="Most frequent destination countries"
                data={topDestinations}
              />
              <DonutCard
                title="Shipment Mix"
                subtitle={`Total saved-company shipments: ${totalShipments}`}
                data={totalShipmentsBreakdown}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="text-sm font-semibold text-slate-800">
                Saved Companies
              </div>
              <div className="mt-1 text-sm text-slate-500">
                Responsive company list with shipment intelligence
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                      Company
                    </th>
                    <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                      Location
                    </th>
                    <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                      Shipments (12M)
                    </th>
                    <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                      TEU
                    </th>
                    <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                      Mode
                    </th>
                    <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                      Last Shipment
                    </th>
                    <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                      Recency
                    </th>
                    <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                      Status
                    </th>
                    <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {companiesTable.map((row) => (
                    <tr key={row.company} className="border-b border-slate-100 align-top">
                      <td className="px-5 py-4">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                            <Building2 size={18} />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900">{row.company}</div>
                            <div className="text-sm text-slate-500">{row.type}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-700">{row.location}</td>
                      <td className="px-5 py-4 text-sm font-semibold text-slate-900">{row.shipments}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <MiniProgress value={row.teu} />
                          <span className="text-sm text-slate-600">{row.teu}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">{row.mode}</td>
                      <td className="px-5 py-4 text-sm text-slate-700">{row.lastShipment}</td>
                      <td className="px-5 py-4">
                        <StatusPill value={row.recency} tone={row.recency === "Recent" ? "green" : "yellow"} />
                      </td>
                      <td className="px-5 py-4">
                        <StatusPill
                          value={row.status}
                          tone={row.status === "High" ? "green" : row.status === "Medium" ? "yellow" : "slate"}
                        />
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3 text-slate-500">
                          <button type="button" className="hover:text-slate-800">
                            <Eye size={18} />
                          </button>
                          <button type="button" className="hover:text-slate-800">
                            <Bookmark size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
