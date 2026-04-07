import React, { useEffect, useMemo, useRef, useState } from "react";
import AppLayout from "@/layout/lit/AppLayout.jsx";
import { getSavedCompaniesFromSupabase, getCampaignsFromSupabase } from "@/lib/supabase";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  Building2,
  Eye,
  Bookmark,
  Globe2,
  TrendingUp,
  Briefcase,
  ShieldCheck,
  MapPinned,
  Radar,
  Sparkles,
  Activity,
  SearchCheck,
  Megaphone,
  UserRoundPlus,
  FileText,
  PlusCircle,
} from "lucide-react";

const monthlyTrendData = [
  { month: "Jan", companies: 6, contacts: 3 },
  { month: "Feb", companies: 8, contacts: 4 },
  { month: "Mar", companies: 7, contacts: 3 },
  { month: "Apr", companies: 11, contacts: 7 },
  { month: "May", companies: 13, contacts: 8 },
  { month: "Jun", companies: 12, contacts: 7 },
];

const companiesTable = [
  {
    company: "Wal Mart",
    type: "Import/Export",
    location: "601 N Walton Blvd 7, US",
    shipments: "459,934",
    shipmentsValue: 459934,
    teu: 82,
    mode: "Ocean",
    lastShipment: "Mar 11, 2026",
    recency: "Recent",
    status: "High",
    countryCode: "US",
  },
  {
    company: "Walmart / 508 Sw 8Th St",
    type: "Import/Export",
    location: "Bentonville, US",
    shipments: "104,807",
    shipmentsValue: 104807,
    teu: 68,
    mode: "Ocean",
    lastShipment: "Mar 11, 2026",
    recency: "Recent",
    status: "High",
    countryCode: "US",
  },
  {
    company: "Walmart 601 N Walton Blvd",
    type: "Import/Export",
    location: "Bentonville, US",
    shipments: "22,481",
    shipmentsValue: 22481,
    teu: 51,
    mode: "Ocean",
    lastShipment: "Jul 17, 2025",
    recency: "Inactive",
    status: "High",
    countryCode: "US",
  },
  {
    company: "Walmart Global Logistics",
    type: "Import/Export",
    location: "508 Se 8Th St, US",
    shipments: "1,599",
    shipmentsValue: 1599,
    teu: 39,
    mode: "Ocean",
    lastShipment: "Mar 9, 2026",
    recency: "Recent",
    status: "High",
    countryCode: "US",
  },
  {
    company: "Walmart Puerto Rico",
    type: "Import/Export",
    location: "Carolina, US",
    shipments: "970",
    shipmentsValue: 970,
    teu: 24,
    mode: "Air",
    lastShipment: "Mar 3, 2026",
    recency: "Recent",
    status: "Medium",
    countryCode: "US",
  },
  {
    company: "Sams Club Walmart Stores",
    type: "Import/Export",
    location: "601 N Walton Blvd 7, US",
    shipments: "587",
    shipmentsValue: 587,
    teu: 17,
    mode: "Ocean",
    lastShipment: "Mar 10, 2026",
    recency: "Recent",
    status: "Medium",
    countryCode: "US",
  },
];

const activityFeed = [
  { type: "Search", name: "Walmart Global Logistics", when: "2 days ago" },
  { type: "Campaign", name: "Retail import outreach", when: "2 days ago" },
  { type: "Lead Prospect", name: "Maria Chen", when: "3 days ago" },
  { type: "RFP Generated", name: "Walmart Inbound 2026", when: "3 days ago" },
  { type: "Campaign Created", name: "Top Retailers Q2", when: "4 days ago" },
];

const fallbackMapCountryScales = {
  NA: {
    US: "scale8",
    CA: "scale7",
    MX: "scale6",
    GT: "scale2",
    CR: "scale2",
    PA: "scale2",
    DO: "scale2",
  },
  EU: {
    DE: "scale8",
    NL: "scale7",
    IT: "scale7",
    FR: "scale7",
    ES: "scale5",
    BE: "scale5",
    PL: "scale5",
    GB: "scale6",
  },
  AS: {
    CN: "scale9",
    IN: "scale7",
    VN: "scale6",
    JP: "scale7",
    KR: "scale5",
    TH: "scale4",
    MY: "scale4",
    ID: "scale5",
    SG: "scale4",
  },
  SA: {
    BR: "scale7",
    AR: "scale4",
    CL: "scale4",
    CO: "scale4",
    PE: "scale3",
  },
  AF: {
    ZA: "scale4",
    MA: "scale3",
    EG: "scale4",
    NG: "scale4",
    KE: "scale2",
  },
  OC: {
    AU: "scale7",
    NZ: "scale4",
    PG: "scale1",
  },
};

const REGION_LABELS = {
  NA: "North America",
  EU: "Europe",
  AS: "Asia",
  SA: "South America",
  AF: "Africa",
  OC: "Oceania",
};

const COUNTRY_TO_REGION = {
  US: "NA",
  CA: "NA",
  MX: "NA",
  GT: "NA",
  CR: "NA",
  PA: "NA",
  DO: "NA",
  PR: "NA",

  DE: "EU",
  NL: "EU",
  IT: "EU",
  FR: "EU",
  ES: "EU",
  BE: "EU",
  PL: "EU",
  GB: "EU",
  UK: "EU",

  CN: "AS",
  IN: "AS",
  VN: "AS",
  JP: "AS",
  KR: "AS",
  TH: "AS",
  MY: "AS",
  ID: "AS",
  SG: "AS",
  HK: "AS",
  TW: "AS",

  BR: "SA",
  AR: "SA",
  CL: "SA",
  CO: "SA",
  PE: "SA",

  ZA: "AF",
  MA: "AF",
  EG: "AF",
  NG: "AF",
  KE: "AF",

  AU: "OC",
  NZ: "OC",
  PG: "OC",
};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }

      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.loaded = "false";
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatNumber(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString();
}

function titleCase(value) {
  if (!value) return "—";
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeSavedCompanyRow(row) {
  const parsedCompanyData = safeJsonParse(row?.company_data) || {};
  const companyData = typeof parsedCompanyData === "object" && !Array.isArray(parsedCompanyData)
    ? parsedCompanyData
    : {};

  const companyName =
    row?.company_name ||
    companyData?.name ||
    companyData?.title ||
    companyData?.company_name ||
    row?.company_key?.split("/").pop()?.replace(/[-_]+/g, " ") ||
    row?.company_id ||
    "Unknown Company";

  const shipmentsValue = Number(
    companyData?.shipmentsLast12m ??
      companyData?.shipments_last_12m ??
      companyData?.totalShipments ??
      companyData?.total_shipments ??
      companyData?.shipments ??
      companyData?.stats?.shipmentsLast12m ??
      companyData?.snapshot?.shipmentsLast12m ??
      0,
  );

  const teuValue = Number(
    companyData?.teuLast12m ??
      companyData?.teu_last_12m ??
      companyData?.teu ??
      companyData?.total_teu ??
      companyData?.stats?.teuLast12m ??
      companyData?.snapshot?.teuLast12m ??
      0,
  );

  const lastShipment =
    companyData?.lastShipmentDate ||
    companyData?.last_shipment_date ||
    companyData?.mostRecentShipment ||
    companyData?.most_recent_shipment ||
    companyData?.stats?.lastShipmentDate ||
    companyData?.snapshot?.lastShipmentDate ||
    row?.updated_at ||
    row?.created_at ||
    null;

  const mode =
    companyData?.mode ||
    companyData?.shipment_mode ||
    companyData?.transport_mode ||
    companyData?.primary_mode ||
    companyData?.stats?.mode ||
    "—";

  const countryCode = extractCountryCode(row, companyData);
  const addressParts = [companyData?.city, companyData?.state, countryCode].filter(Boolean);
  const location =
    companyData?.address ||
    companyData?.location ||
    (addressParts.length ? addressParts.join(", ") : "—");

  return {
    company: titleCase(companyName),
    type: row?.source ? titleCase(row.source) : "Saved Company",
    location,
    shipments: formatNumber(shipmentsValue),
    shipmentsValue,
    teu: Number.isFinite(teuValue) ? teuValue : 0,
    mode: titleCase(mode),
    lastShipment: formatDate(lastShipment),
    recency: lastShipment ? "Recent" : "Inactive",
    status: shipmentsValue >= 1000 ? "High" : shipmentsValue >= 100 ? "Medium" : "Low",
    countryCode,
    companyId: row?.company_id || "",
    companyKey: row?.company_key || "",
    raw: row,
  };
}

function buildMapScalesFromCompanies(companies) {
  const regionCountryCounts = {
    NA: {},
    EU: {},
    AS: {},
    SA: {},
    AF: {},
    OC: {},
  };

  companies.forEach((company) => {
    const code = (company?.countryCode || "").toUpperCase();
    const region = COUNTRY_TO_REGION[code];
    if (!region || !code) return;
    regionCountryCounts[region][code] = (regionCountryCounts[region][code] || 0) + 1;
  });

  const toScaleBucket = (count) => {
    if (count >= 9) return "scale9";
    if (count >= 8) return "scale8";
    if (count >= 7) return "scale7";
    if (count >= 6) return "scale6";
    if (count >= 5) return "scale5";
    if (count >= 4) return "scale4";
    if (count >= 3) return "scale3";
    if (count >= 2) return "scale2";
    return "scale1";
  };

  const dynamic = Object.fromEntries(
    Object.entries(regionCountryCounts).map(([regionKey, countries]) => [
      regionKey,
      Object.fromEntries(
        Object.entries(countries).map(([code, count]) => [code, toScaleBucket(count)]),
      ),
    ]),
  );

  return Object.keys(dynamic).some((key) => Object.keys(dynamic[key]).length > 0)
    ? dynamic
    : fallbackMapCountryScales;
}

function buildRegionSummary(companies) {
  const regionCounts = {
    NA: 0,
    EU: 0,
    AS: 0,
    SA: 0,
    AF: 0,
    OC: 0,
  };

  const countryCounts = {};

  companies.forEach((company) => {
    const code = (company?.countryCode || "").toUpperCase();
    const region = COUNTRY_TO_REGION[code];
    if (!region) return;
    regionCounts[region] += 1;
    countryCounts[code] = (countryCounts[code] || 0) + 1;
  });

  const topRegionEntry = Object.entries(regionCounts).sort((a, b) => b[1] - a[1])[0] || ["NA", 0];
  const topCountries = Object.entries(countryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([code]) => code)
    .join(", ");

  return {
    activeRegionKey: topRegionEntry[0],
    activeRegionLabel: REGION_LABELS[topRegionEntry[0]] || "North America",
    savedAccounts: companies.length,
    laneDensity:
      companies.length > 0
        ? `${Math.min(100, Math.max(12, Math.round((topRegionEntry[1] / companies.length) * 100)))}%`
        : "0%",
    topCountries: topCountries || "—",
    coverageNote:
      companies.length > 0
        ? `Live coverage based on ${companies.length} saved account${companies.length === 1 ? "" : "s"}`
        : "No saved company coverage yet",
  };
}

function buildTrendData(companies) {
  if (!companies.length) return monthlyTrendData;

  const monthBuckets = new Map();

  companies.forEach((company) => {
    const lastShipment = company?.raw?.company_data?.lastShipmentDate ||
      company?.raw?.company_data?.last_shipment_date ||
      company?.raw?.updated_at ||
      company?.raw?.created_at;

    const date = new Date(lastShipment || Date.now());
    if (Number.isNaN(date.getTime())) return;

    const label = date.toLocaleDateString("en-US", { month: "short" });
    const current = monthBuckets.get(label) || { month: label, companies: 0, contacts: 0 };
    current.companies += 1;
    monthBuckets.set(label, current);
  });

  const orderedMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const data = orderedMonths
    .map((month) => monthBuckets.get(month))
    .filter(Boolean);

  return data.length ? data.slice(-6) : monthlyTrendData;
}

function StatCard({
  title,
  value,
  note,
  change,
  changeClass = "text-emerald-600",
  icon: Icon,
  accent = "from-blue-600 to-indigo-600",
  chip = "Intel",
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-violet-500" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            {title}
          </div>
          <div className="mt-3 flex items-end gap-2">
            <div className="text-3xl font-semibold tracking-tight text-slate-900">{value}</div>
            {change ? <div className={`pb-1 text-sm font-semibold ${changeClass}`}>{change}</div> : null}
          </div>
          <div className="mt-2 text-sm text-slate-500">{note}</div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${accent} text-white shadow-sm`}>
            <Icon size={20} />
          </div>
          <span className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-700">
            {chip}
          </span>
        </div>
      </div>
    </div>
  );
}

function SectionCardHeader({
  eyebrow,
  title,
  subtitle,
  icon: Icon,
  iconAccent = "from-blue-600 to-indigo-600",
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? (
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            {eyebrow}
          </div>
        ) : null}
        <div className="mt-1 text-sm font-semibold text-slate-800">{title}</div>
        {subtitle ? <div className="mt-1 text-sm text-slate-500">{subtitle}</div> : null}
      </div>

      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${iconAccent} text-white shadow-sm`}>
        <Icon size={18} />
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
        style={{ width: `${Math.max(8, Math.min(100, value || 0))}%` }}
      />
    </div>
  );
}

function getActivityIcon(type) {
  switch (type) {
    case "Search":
      return SearchCheck;
    case "Campaign":
      return Megaphone;
    case "Lead Prospect":
      return UserRoundPlus;
    case "RFP Generated":
      return FileText;
    case "Campaign Created":
      return PlusCircle;
    default:
      return Activity;
  }
}

function TradeMapPanel({ mapScales, regionSummary }) {
  const [selectedRegion, setSelectedRegion] = useState(
    regionSummary?.activeRegionLabel || "North America",
  );
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  useEffect(() => {
    if (regionSummary?.activeRegionLabel) {
      setSelectedRegion(regionSummary.activeRegionLabel);
    }
  }, [regionSummary?.activeRegionLabel]);

  const regionDetails = {
    "North America": {
      countries: "United States, Canada, Mexico",
      emphasis: "Regional account coverage",
      key: "NA",
    },
    Europe: {
      countries: "Germany, Netherlands, Italy",
      emphasis: "Regional account coverage",
      key: "EU",
    },
    Asia: {
      countries: "China, Vietnam, India",
      emphasis: "Regional account coverage",
      key: "AS",
    },
    "South America": {
      countries: "Brazil, Chile, Colombia",
      emphasis: "Regional account coverage",
      key: "SA",
    },
    Africa: {
      countries: "South Africa, Morocco",
      emphasis: "Regional account coverage",
      key: "AF",
    },
    Oceania: {
      countries: "Australia, New Zealand",
      emphasis: "Regional account coverage",
      key: "OC",
    },
  };

  const active = regionDetails[selectedRegion];

  useEffect(() => {
    let mounted = true;

    async function initMap() {
      try {
        await loadScript(
          "https://cdn.jsdelivr.net/npm/jsvectormap@1.5.3/dist/js/jsvectormap.min.js",
        );
        await loadScript(
          "https://cdn.jsdelivr.net/npm/jsvectormap@1.5.3/dist/maps/world.js",
        );

        if (!mounted || !mapRef.current || !window.jsVectorMap) return;

        if (mapInstanceRef.current) {
          mapInstanceRef.current.destroy();
        }

        mapRef.current.innerHTML = "";

        mapInstanceRef.current = new window.jsVectorMap({
          selector: mapRef.current,
          map: "world",
          backgroundColor: "transparent",
          zoomOnScroll: false,
          zoomButtons: false,
          selectedMarkers: [],
          markersSelectable: false,
          regionStyle: {
            initial: {
              fill: "#dbeafe",
              stroke: "#ffffff",
              strokeWidth: 1.25,
            },
            hover: {
              fill: "#60a5fa",
            },
            selected: {
              fill: "#2563eb",
            },
          },
          series: {
            regions: [
              {
                attribute: "fill",
                scale: {
                  scale1: "#dbeafe",
                  scale2: "#cfe2ff",
                  scale3: "#bfd8ff",
                  scale4: "#a9c8ff",
                  scale5: "#8cb5ff",
                  scale6: "#6fa0fa",
                  scale7: "#4f87ef",
                  scale8: "#346fe1",
                  scale9: "#2158ca",
                },
                values: mapScales?.[active.key] || fallbackMapCountryScales[active.key] || {},
              },
            ],
          },
          onRegionTipShow(event, tooltip) {
            const countryLabel = tooltip.text();
            tooltip.html(
              `${countryLabel}<div style="font-size:11px;color:#64748b;margin-top:4px;">${selectedRegion} activity</div>`,
            );
          },
        });
      } catch (error) {
        console.error("Failed to initialize vector map", error);
      }
    }

    initMap();

    return () => {
      mounted = false;
    };
  }, [active.key, selectedRegion, mapScales]);

  useEffect(() => {
    const handleResize = () => {
      if (mapInstanceRef.current?.updateSize) {
        mapInstanceRef.current.updateSize();
      }
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const regionButton = (label) =>
    [
      "rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
      selectedRegion === label
        ? "border-blue-200 bg-blue-50 text-blue-700 shadow-sm"
        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
    ].join(" ");

  const showingLiveRegion = selectedRegion === regionSummary?.activeRegionLabel;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Globe2 size={16} className="text-blue-600" />
            Global Trade Map
          </div>
          <div className="mt-1 text-sm text-slate-500">
            Live regional visibility based on saved company coverage
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {Object.keys(regionDetails).map((region) => (
            <button
              key={region}
              type="button"
              className={regionButton(region)}
              onClick={() => setSelectedRegion(region)}
            >
              {region}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.5fr_.9fr]">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div ref={mapRef} className="h-[320px] w-full" />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <SectionCardHeader
            eyebrow="Region Intelligence"
            title="Active Region"
            subtitle="Regional concentration and saved-account coverage"
            icon={MapPinned}
            iconAccent="from-blue-600 to-indigo-600"
          />

          <div className="mt-5 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-700">
              Current Focus
            </div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">
              {selectedRegion}
            </div>
          </div>

          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm ring-1 ring-slate-200">
                  <Globe2 size={16} />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                    Top Countries
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {showingLiveRegion ? regionSummary?.topCountries || "—" : active.countries}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200">
                  <Radar size={16} />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                    Coverage Note
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {showingLiveRegion ? regionSummary?.coverageNote || "No saved company coverage yet" : active.emphasis}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm ring-1 ring-slate-200">
                    <Activity size={15} />
                  </div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                    Lane Density
                  </div>
                </div>
                <div className="mt-3 text-xl font-semibold text-slate-900">
                  {showingLiveRegion ? regionSummary?.laneDensity || "0%" : "—"}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-violet-600 shadow-sm ring-1 ring-slate-200">
                    <Building2 size={15} />
                  </div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                    Saved Accounts
                  </div>
                </div>
                <div className="mt-3 text-xl font-semibold text-slate-900">
                  {regionSummary?.savedAccounts ?? 0}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-cyan-600 shadow-sm ring-1 ring-slate-200">
                  <Sparkles size={16} />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                    Suggested Use
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    Use this panel to identify high-value sourcing regions and prioritize saved accounts by live CRM coverage.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LITDashboard() {
  const [savedCompaniesLive, setSavedCompaniesLive] = useState([]);
  const [campaignsLive, setCampaignsLive] = useState([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboardData() {
      try {
        const [savedRes, campaignsRes] = await Promise.all([
          getSavedCompaniesFromSupabase("prospect"),
          getCampaignsFromSupabase(),
        ]);

        if (cancelled) return;

        setSavedCompaniesLive(Array.isArray(savedRes?.rows) ? savedRes.rows : []);
        setCampaignsLive(Array.isArray(campaignsRes) ? campaignsRes : []);
      } catch (error) {
        console.error("Dashboard load error:", error);
        if (!cancelled) {
          setSavedCompaniesLive([]);
          setCampaignsLive([]);
        }
      } finally {
        if (!cancelled) {
          setDashboardLoading(false);
        }
      }
    }

    loadDashboardData();

    return () => {
      cancelled = true;
    };
  }, []);

  const normalizedCompanies = useMemo(() => {
    if (savedCompaniesLive.length > 0) {
      return savedCompaniesLive.map(normalizeSavedCompanyRow);
    }
    return companiesTable;
  }, [savedCompaniesLive]);

  const mapScales = useMemo(
    () => buildMapScalesFromCompanies(normalizedCompanies),
    [normalizedCompanies],
  );

  const regionSummary = useMemo(
    () => buildRegionSummary(normalizedCompanies),
    [normalizedCompanies],
  );

  const trendData = useMemo(
    () => buildTrendData(normalizedCompanies),
    [normalizedCompanies],
  );

  const displayedCompanies = normalizedCompanies.slice(0, 10);
  const savedCompaniesCount = normalizedCompanies.length;
  const activeCampaignsCount = campaignsLive.length;

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
              value={dashboardLoading ? "—" : String(savedCompaniesCount)}
              change=""
              note="Live CRM count"
              icon={Building2}
              accent="from-blue-600 to-indigo-600"
              chip="CRM"
            />
            <StatCard
              title="Active Campaigns"
              value={dashboardLoading ? "—" : String(activeCampaignsCount)}
              note="Live campaign count"
              change=""
              icon={Briefcase}
              accent="from-violet-600 to-indigo-600"
              chip="Outreach"
            />
            <StatCard
              title="Open RFPs"
              value="0"
              note="Create your first RFP"
              change=""
              icon={ShieldCheck}
              accent="from-cyan-600 to-blue-600"
              chip="Studio"
            />
            <StatCard
              title="Searches Used"
              value="3"
              note="All-time usage"
              change=""
              icon={TrendingUp}
              accent="from-sky-600 to-blue-500"
              chip="Usage"
            />
          </section>

          <TradeMapPanel mapScales={mapScales} regionSummary={regionSummary} />

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-slate-800">
                    Saved Companies
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    Showing the 10 most recent saved accounts with live CRM data
                  </div>
                </div>

                <div className="hidden h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-sm md:flex">
                  <Building2 size={18} />
                </div>
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
                  {displayedCompanies.map((row) => {
                    const commandCenterHref = buildCommandCenterHref(row);
                    return (
                    <tr key={`${row.company}-${row.location}`} className="border-b border-slate-100 align-top">
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
                          <MiniProgress value={row.teu || 0} />
                          <span className="text-sm text-slate-600">{row.teu || 0}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">{row.mode}</td>
                      <td className="px-5 py-4 text-sm text-slate-700">{row.lastShipment}</td>
                      <td className="px-5 py-4">
                        <StatusPill
                          value={row.recency}
                          tone={row.recency === "Recent" ? "green" : "yellow"}
                        />
                      </td>
                      <td className="px-5 py-4">
                        <StatusPill
                          value={row.status}
                          tone={
                            row.status === "High"
                              ? "green"
                              : row.status === "Medium"
                                ? "yellow"
                                : "slate"
                          }
                        />
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3 text-slate-500">
                          <button
                            type="button"
                            onClick={() => {
                              window.location.href = commandCenterHref;
                            }}
                            className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                            title="Open in Command Center"
                          >
                            <Eye size={18} />
                          </button>
                          <button
                            type="button"
                            className="rounded-lg bg-blue-50 p-1 text-blue-600 ring-1 ring-blue-200"
                            title="Already saved"
                            aria-label="Already saved"
                          >
                            <Bookmark size={18} fill="currentColor" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.75fr)_minmax(340px,.95fr)]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionCardHeader
                eyebrow="Trend Intelligence"
                title="Performance Trends"
                subtitle="Saved companies and enriched contacts over time"
                icon={TrendingUp}
                iconAccent="from-sky-600 to-blue-500"
              />

              <div className="mt-5 flex gap-6 text-sm">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                    Companies
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-slate-900">{dashboardLoading ? "—" : savedCompaniesCount}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                    Contacts
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-slate-900">13</div>
                </div>
              </div>

              <div className="mt-4 h-[320px] rounded-xl border border-slate-100 bg-slate-50 p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData} barCategoryGap="20%">
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

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionCardHeader
                eyebrow="Timeline"
                title="Activity Feed"
                subtitle="Recent actions and updates"
                icon={Activity}
                iconAccent="from-violet-600 to-indigo-600"
              />

              <div className="mt-5 space-y-3">
                {activityFeed.map((item) => {
                  const ItemIcon = getActivityIcon(item.type);

                  return (
                    <div
                      key={`${item.type}-${item.name}`}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm ring-1 ring-slate-200">
                          <ItemIcon size={16} />
                        </div>

                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-800">
                            {item.type}
                          </div>
                          <div className="mt-1 text-sm text-slate-600">
                            {item.name}
                          </div>
                          <div className="mt-1 text-xs text-slate-400">
                            {item.when}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
