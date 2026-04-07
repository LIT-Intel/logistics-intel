import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/layout/lit/AppLayout.jsx";
import { getSavedCompanies, getIyCompanyProfile } from "@/lib/api";
import { getCampaignsFromSupabase } from "@/lib/supabase";
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
  Ship,
  Plane,
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

const COUNTRY_CODE_LABELS = {
  US: 'United States', CA: 'Canada', MX: 'Mexico', PR: 'Puerto Rico',
  DE: 'Germany', NL: 'Netherlands', IT: 'Italy', FR: 'France', ES: 'Spain', BE: 'Belgium', PL: 'Poland', GB: 'United Kingdom',
  CN: 'China', IN: 'India', VN: 'Vietnam', JP: 'Japan', KR: 'South Korea', TH: 'Thailand', MY: 'Malaysia', ID: 'Indonesia', SG: 'Singapore', HK: 'Hong Kong', TW: 'Taiwan',
  BR: 'Brazil', AR: 'Argentina', CL: 'Chile', CO: 'Colombia', PE: 'Peru',
  ZA: 'South Africa', MA: 'Morocco', EG: 'Egypt', NG: 'Nigeria', KE: 'Kenya',
  AU: 'Australia', NZ: 'New Zealand', PG: 'Papua New Guinea',
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
  if (Number.isNaN(d.getTime())) return "—";
  const maxFuture = new Date();
  maxFuture.setDate(maxFuture.getDate() + 1);
  if (d > maxFuture) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function firstValidDate(...values) {
  const maxFuture = new Date();
  maxFuture.setDate(maxFuture.getDate() + 1);
  for (const value of values.flat()) {
    if (!value) continue;
    const d = new Date(value);
    if (!Number.isNaN(d.getTime()) && d <= maxFuture) return value;
  }
  return null;
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

function looksLikeOpaqueId(value) {
  const v = String(value || '').trim();
  if (!v) return false;
  return /^[a-f0-9]{24,}$/i.test(v) || /^[a-f0-9-]{24,}$/i.test(v);
}

function prettifyCompanyName(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'Unknown Company';
  if (raw.includes('/')) {
    const last = raw.split('/').pop();
    if (last) return titleCase(last);
  }
  if (looksLikeOpaqueId(raw)) return raw;
  return titleCase(raw);
}


function safeJsonParse(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractCountryCode(row, companyData = {}) {
  const candidates = [
    row?.country_code,
    row?.country,
    companyData?.countryCode,
    companyData?.country_code,
    companyData?.country,
    companyData?.address?.countryCode,
    companyData?.address?.country_code,
    companyData?.address?.country,
    companyData?.location?.countryCode,
    companyData?.location?.country_code,
    companyData?.location?.country,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const value = String(candidate).trim().toUpperCase();
    if (value.length === 2 || value.length === 3) {
      if (value === 'USA') return 'US';
      if (value === 'GBR') return 'GB';
      return value.slice(0, 2);
    }
  }

  const locationText = [companyData?.address, companyData?.location, row?.company_name]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();

  const inferred = inferCountryCodeFromText(locationText);
  return inferred || '';
}


function inferCountryCodeFromText(text) {
  const value = String(text || '').toUpperCase();
  if (value.includes('UNITED STATES') || value.includes(', US') || value.includes(' USA')) return 'US';
  if (value.includes('CANADA') || value.includes(', CA')) return 'CA';
  if (value.includes('MEXICO') || value.includes(', MX')) return 'MX';
  if (value.includes('GERMANY')) return 'DE';
  if (value.includes('NETHERLANDS')) return 'NL';
  if (value.includes('ITALY')) return 'IT';
  if (value.includes('FRANCE')) return 'FR';
  if (value.includes('CHINA')) return 'CN';
  if (value.includes('VIETNAM')) return 'VN';
  if (value.includes('INDIA')) return 'IN';
  if (value.includes('BRAZIL')) return 'BR';
  if (value.includes('AUSTRALIA')) return 'AU';
  if (value.includes('SOUTH AFRICA')) return 'ZA';
  return '';
}

function getRegionFlags(regionLabel) {
  switch (regionLabel) {
    case "North America":
      return ["🇺🇸", "🇨🇦", "🇲🇽"];
    case "Europe":
      return ["🇩🇪", "🇳🇱", "🇮🇹"];
    case "Asia":
      return ["🇨🇳", "🇻🇳", "🇮🇳"];
    case "South America":
      return ["🇧🇷", "🇨🇱", "🇨🇴"];
    case "Africa":
      return ["🇿🇦", "🇲🇦", "🇪🇬"];
    case "Oceania":
      return ["🇦🇺", "🇳🇿", "🇵🇬"];
    default:
      return [];
  }
}

function slugifyCompanyId(value) {
  if (!value) return '';
  return encodeURIComponent(String(value));
}

function getCommandCenterHref(row) {
  const params = new URLSearchParams();
  if (row?.companyId) params.set('companyId', row.companyId);
  if (row?.companyKey) params.set('companyKey', row.companyKey);
  if (row?.company) params.set('company', row.company);
  const query = params.toString();
  return query ? `/app/command-center?${query}` : '/app/command-center';
}

function cleanRouteLabel(value) {
  if (!value) return null;
  const normalized = String(value)
    .replace(/\s*->\s*/g, ' → ')
    .replace(/\s*-\s*/g, ' → ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized || normalized.length < 5) return null;
  return normalized;
}

function cityStateFromLocation(location) {
  const raw = String(location || '').trim();
  if (!raw || raw === '—') return null;
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]}, ${parts[1]}`;
  return parts[0] || null;
}

function extractRouteCandidate(candidate) {
  if (!candidate) return null;
  if (typeof candidate === 'string') return cleanRouteLabel(candidate);
  if (typeof candidate === 'object') {
    const direct = candidate.route || candidate.label || candidate.name || candidate.summary;
    if (direct) return cleanRouteLabel(direct);
    const origin = [candidate.origin_port, candidate.originPort, candidate.origin_city, candidate.originCity, candidate.origin_country, candidate.originCountry].filter(Boolean).join(', ');
    const dest = [candidate.destination_port, candidate.destinationPort, candidate.destination_city, candidate.destinationCity, candidate.destination_state, candidate.destinationState, candidate.destination_country, candidate.destinationCountry].filter(Boolean).join(', ');
    if (origin || dest) return cleanRouteLabel(`${origin} → ${dest}`);
  }
  return null;
}

function inferFallbackRoute(location) {
  const destination = cityStateFromLocation(location);
  if (!destination) return null;
  return `Lane data pending → ${destination}`;
}

function normalizeRouteToken(token) {
  const value = String(token || '').trim();
  if (!value) return '';
  const upper = value.toUpperCase();
  return COUNTRY_CODE_LABELS[upper] || value;
}

function enhanceRouteLabel(routeLabel, destinationLocation) {
  const clean = cleanRouteLabel(routeLabel);
  if (!clean) return null;
  const destination = cityStateFromLocation(destinationLocation) || destinationLocation || '';
  if (!clean.includes('→')) return clean;
  const [rawOrigin, rawDest] = clean.split('→').map((part) => part.trim());
  const origin = normalizeRouteToken(rawOrigin);
  const genericDestCodes = new Set(['US', 'USA', 'UNITED STATES', 'CA', 'CANADA', 'MX', 'MEXICO']);
  const genericDest = genericDestCodes.has(String(rawDest || '').trim().toUpperCase());
  const destinationLabel = genericDest && destination ? destination : normalizeRouteToken(rawDest);
  return cleanRouteLabel(`${origin} → ${destinationLabel}`);
}

function inferRouteRegion(routeLabel, companyRegion) {
  const route = String(routeLabel || '').toUpperCase();
  const destinationSegment = route.includes('→') ? route.split('→').pop()?.trim() || route : route;
  for (const [code, label] of Object.entries(COUNTRY_CODE_LABELS)) {
    if (destinationSegment.includes(label.toUpperCase()) || destinationSegment.includes(` ${code} `) || destinationSegment.endsWith(` ${code}`) || destinationSegment.includes(`, ${code}`)) {
      return COUNTRY_TO_REGION[code] || companyRegion || 'NA';
    }
  }
  for (const [code, label] of Object.entries(COUNTRY_CODE_LABELS)) {
    if (route.includes(label.toUpperCase()) || route.includes(` ${code} `) || route.endsWith(` ${code}`) || route.includes(`, ${code}`)) {
      return COUNTRY_TO_REGION[code] || companyRegion || 'NA';
    }
  }
  return companyRegion || 'NA';
}

function formatRouteText(origin, destination) {
  const o = String(origin || '').trim();
  const d = String(destination || '').trim();
  if (!o && !d) return null;
  if (!o) return d;
  if (!d) return o;
  return `${o} → ${d}`;
}

function extractProfileTradeRoutes(profile, fallbackLocation) {
  const routes = [];
  const push = (label, count = 1) => {
    const clean = cleanRouteLabel(label);
    if (!clean) return;
    const existing = routes.find((item) => item.label === clean);
    if (existing) {
      existing.count = Math.max(existing.count, Number(count) || 1);
      return;
    }
    routes.push({ label: clean, count: Number(count) || 1 });
  };

  const recent = Array.isArray(profile?.recentBols) ? profile.recentBols : Array.isArray(profile?.recent_bols) ? profile.recent_bols : [];
  recent.forEach((entry) => {
    const origin = entry?.origin_port || entry?.originPort || entry?.origin_city || entry?.originCity || entry?.port_of_lading || entry?.supplierCountry || entry?.shipper_country || entry?.supplier_country || entry?.origin_country || entry?.originCountry || null;
    const destination = entry?.destination_port || entry?.destinationPort || entry?.destination_city || entry?.destinationCity || entry?.port_of_unlading || fallbackLocation || entry?.destination || entry?.companyCountry || entry?.destination_country || entry?.destinationCountry || null;
    push(formatRouteText(origin, destination), entry?.containersCount || entry?.shipments || entry?.teu || 1);
  });

  const topRoutes = profile?.routeKpis?.topRoutesLast12m || profile?.routeKpis?.top_routes_last_12m || profile?.routeKpis?.top_routes || profile?.top_routes || [];
  (Array.isArray(topRoutes) ? topRoutes : []).forEach((entry) => {
    if (typeof entry === 'string') {
      push(entry, 1);
      return;
    }
    const label =
      entry?.route ||
      formatRouteText(
        entry?.origin_port || entry?.originPort || entry?.origin_city || entry?.originCity || entry?.origin_country || entry?.originCountry || entry?.origin,
        entry?.destination_port || entry?.destinationPort || entry?.destination_city || entry?.destinationCity || fallbackLocation || entry?.destination_country || entry?.destinationCountry || entry?.destination,
      );
    push(label, entry?.shipments || entry?.count || entry?.teu || 1);
  });

  push(profile?.routeKpis?.topRouteLast12m || profile?.routeKpis?.top_route_last_12m, 1);
  push(profile?.routeKpis?.mostRecentRoute || profile?.routeKpis?.most_recent_route, 1);

  return routes.slice(0, 5);
}
function normalizeSavedCompanyRow(row, enrichedProfile = null) {
  const company = row?.company || {};
  const raw = row?.raw || {};
  const companyData = row?.companyData || safeJsonParse(raw?.company_data) || {};

  const rawCompanyName =
    company?.name ||
    companyData?.name ||
    companyData?.title ||
    (!looksLikeOpaqueId(raw?.company_name) ? raw?.company_name : '') ||
    raw?.company_key?.split("/").pop()?.replace(/[-_]+/g, " ") ||
    raw?.company_name ||
    raw?.company_id ||
    "Unknown Company";

  const shipmentsValue = Number(
    company?.kpis?.shipments_12m ??
      companyData?.shipmentsLast12m ??
      companyData?.shipments_last_12m ??
      companyData?.totalShipments ??
      companyData?.shipments ??
      0,
  );

  const teuValue = Number(
    companyData?.teuLast12m ??
      companyData?.teu_last_12m ??
      companyData?.teu ??
      companyData?.total_teu ??
      0,
  );

  const lastShipment = firstValidDate(
    companyData?.lastShipmentDate,
    companyData?.last_shipment_date,
    company?.kpis?.last_activity,
    companyData?.mostRecentShipment,
    raw?.most_recent_shipment_date,
    raw?.saved_at,
    raw?.updated_at,
    raw?.created_at,
  );

  const mode =
    companyData?.mode ||
    companyData?.shipment_mode ||
    companyData?.transport_mode ||
    (teuValue > 0 || shipmentsValue > 0 ? "Ocean" : "—");

  const countryCode = extractCountryCode(raw, companyData) || company?.country_code || '';
  const location =
    company?.address ||
    companyData?.address ||
    companyData?.location ||
    [companyData?.city, companyData?.state, countryCode].filter(Boolean).join(', ') ||
    '—';

  const companyId = raw?.company_id || company?.internal_id || company?.company_id || raw?.company_key || '';
  const companyKey = raw?.company_key || company?.company_id || raw?.company_id || '';
  const commandCenterHref = getCommandCenterHref({ companyId, companyKey, company: rawCompanyName });
  const profileRoutes = extractProfileTradeRoutes(enrichedProfile, location);
  const rawRoutes = [
    raw?.top_route_12m,
    raw?.recent_route,
    companyData?.top_route_12m,
    companyData?.recent_route,
    companyData?.most_recent_route,
    companyData?.route_kpis?.top_route_last_12m,
    companyData?.route_kpis?.most_recent_route,
    ...(Array.isArray(companyData?.top_routes) ? companyData.top_routes : []),
  ]
    .map(extractRouteCandidate)
    .filter(Boolean)
    .map((label) => ({ label, count: 1 }));
  const fallbackRoute = inferFallbackRoute(location);
  const tradeRoutes = [];
  const candidateRouteItems = [...(profileRoutes || []), ...(rawRoutes || [])];
  if (!candidateRouteItems.length && fallbackRoute) candidateRouteItems.push({ label: fallbackRoute, count: 1 });

  candidateRouteItems.forEach((item) => {
    const label = typeof item === 'string' ? item : item?.label;
    const count = typeof item === 'string' ? 1 : item?.count || 1;
    const clean = enhanceRouteLabel(label, location);
    if (!clean) return;
    const existing = tradeRoutes.find((entry) => entry.label === clean);
    if (existing) existing.count = Math.max(existing.count, count);
    else tradeRoutes.push({ label: clean, count });
  });
  

  return {
    company: prettifyCompanyName(rawCompanyName),
    type: row?.stage ? titleCase(row.stage) : raw?.source ? titleCase(raw.source) : 'Saved Company',
    location,
    shipments: formatNumber(shipmentsValue),
    shipmentsValue,
    teu: teuValue,
    mode,
    lastShipment: formatDate(lastShipment),
    recency: lastShipment ? 'Recent' : 'Inactive',
    status: shipmentsValue >= 1000 ? 'High' : shipmentsValue >= 100 ? 'Medium' : 'Low',
    countryCode: countryCode || '',
    companyId,
    companyKey,
    commandCenterHref,
    tradeRoutes,
    raw: row,
  };
}

function buildMapScalesFromCompanies(companies) {
  const regionCountryCounts = { NA: {}, EU: {}, AS: {}, SA: {}, AF: {}, OC: {} };

  companies.forEach((company) => {
    const code = (company?.countryCode || "").toUpperCase();
    const region = COUNTRY_TO_REGION[code];
    if (!region || !code) return;
    regionCountryCounts[region][code] = (regionCountryCounts[region][code] || 0) + 1;
  });

  return regionCountryCounts;
}

function buildRegionSummary(companies) {
  const regionCounts = { NA: 0, EU: 0, AS: 0, SA: 0, AF: 0, OC: 0 };
  const countryCounts = {};
  const routesByRegion = { NA: [], EU: [], AS: [], SA: [], AF: [], OC: [] };

  companies.forEach((company) => {
    const code = (company?.countryCode || "").toUpperCase();
    const region = COUNTRY_TO_REGION[code] || 'NA';
    if (code) {
      regionCounts[region] += 1;
      countryCounts[code] = (countryCounts[code] || 0) + 1;
    }
    const tradeRoutes = Array.isArray(company?.tradeRoutes) ? company.tradeRoutes : [];
    tradeRoutes.forEach((route) => {
      const label = typeof route === 'string' ? route : route?.label;
      const count = typeof route === 'string' ? 1 : route?.count || 1;
      const routeRegion = inferRouteRegion(label, region);
      routesByRegion[routeRegion].push({ label, count });
    });
  });

  const topRegionEntry = Object.entries(regionCounts).sort((a, b) => b[1] - a[1])[0] || ["NA", 0];

  const aggregateRoutes = (routeList) => {
    const counts = new Map();
    routeList.forEach((route) => {
      const label = typeof route === 'string' ? route : route?.label;
      const count = typeof route === 'string' ? 1 : route?.count || 1;
      if (!label) return;
      counts.set(label, (counts.get(label) || 0) + count);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, count]) => ({ label, count }));
  };

  const regionRoutes = Object.fromEntries(Object.entries(routesByRegion).map(([key, value]) => [key, aggregateRoutes(value)]));
  const activeRoutes = regionRoutes[topRegionEntry[0]] || [];

  return {
    activeRegionKey: topRegionEntry[0],
    activeRegionLabel: REGION_LABELS[topRegionEntry[0]] || "North America",
    savedAccounts: companies.length,
    laneDensity: companies.length > 0 ? `${Math.min(100, Math.max(12, Math.round((topRegionEntry[1] / companies.length) * 100)))}%` : "0%",
    regionCounts,
    regionRoutes,
    activeTradeRoutes: activeRoutes,
    topCountries: Object.entries(countryCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([code]) => COUNTRY_CODE_LABELS[code] || code),
  };
}

function buildMapColorValues(mapCounts, selectedRegion) {
  const regionKey = Object.entries(REGION_LABELS).find(([, label]) => label === selectedRegion)?.[0] || 'NA';
  const selectedCounts = mapCounts?.[regionKey] || {};
  const values = {};
  const fallbackCodes = Object.keys(fallbackMapCountryScales[regionKey] || {});
  const entries = Object.entries(selectedCounts);
  const maxCount = Math.max(...entries.map(([, count]) => Number(count) || 0), 1);

  fallbackCodes.forEach((code) => {
    values[code] = 'tier2';
  });

  entries.forEach(([code, count]) => {
    const ratio = (Number(count) || 1) / maxCount;
    if (ratio >= 0.85) values[code] = 'tier5';
    else if (ratio >= 0.6) values[code] = 'tier4';
    else if (ratio >= 0.35) values[code] = 'tier3';
    else values[code] = 'tier2';
  });

  return values;
}

function buildTrendData(companies) {
  if (!companies.length) return monthlyTrendData;

  const monthBuckets = new Map();

  companies.forEach((company) => {
    const companyData = safeJsonParse(company?.raw?.company_data) || company?.raw?.company_data || {};
    const lastShipment = companyData?.lastShipmentDate ||
      companyData?.last_shipment_date ||
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
  const activeFlags = getRegionFlags(selectedRegion);
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
  const selectedRegionKey = active?.key || regionSummary?.activeRegionKey || "NA";
  const visibleRoutes = (regionSummary?.regionRoutes?.[selectedRegionKey] || []).slice(0, 5);

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
              fill: "#eef3f9",
              stroke: "#ffffff",
              strokeWidth: 1.25,
            },
            hover: {
              fill: "#2147c6",
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
                  tier1: '#eef3f9',
                  tier2: selectedRegionKey === 'NA' ? '#a8c6ff' : selectedRegionKey === 'EU' ? '#aae6bd' : selectedRegionKey === 'AS' ? '#cfbfff' : selectedRegionKey === 'SA' ? '#ffc98f' : selectedRegionKey === 'AF' ? '#a5e4ff' : '#ffb6df',
                  tier3: selectedRegionKey === 'NA' ? '#78a3ff' : selectedRegionKey === 'EU' ? '#76d497' : selectedRegionKey === 'AS' ? '#b39aff' : selectedRegionKey === 'SA' ? '#ffb25d' : selectedRegionKey === 'AF' ? '#67d0ff' : '#ff8dd0',
                  tier4: selectedRegionKey === 'NA' ? '#4f7eff' : selectedRegionKey === 'EU' ? '#4fc16f' : selectedRegionKey === 'AS' ? '#966eff' : selectedRegionKey === 'SA' ? '#ff9834' : selectedRegionKey === 'AF' ? '#2fb8ff' : '#ff66c0',
                  tier5: selectedRegionKey === 'NA' ? '#2f5bff' : selectedRegionKey === 'EU' ? '#34a853' : selectedRegionKey === 'AS' ? '#7c3aed' : selectedRegionKey === 'SA' ? '#f97316' : selectedRegionKey === 'AF' ? '#0ea5e9' : '#ec4899',
                },
                values: buildMapColorValues(mapScales, selectedRegion),
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
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100/90 p-2 md:p-3">
          <div ref={mapRef} className="h-[500px] md:h-[620px] w-full" style={{ filter: "contrast(1.05) brightness(0.92) saturate(1.06)" }} />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                Region Intelligence
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-800">Active Region</div>
              <div className="mt-1 text-sm text-slate-500">Regional concentration and saved-account coverage</div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-sm">
                <Ship size={18} />
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 text-slate-400 shadow-sm">
                <Plane size={18} />
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-700">
              Current Focus
            </div>
            <div className="mt-1 flex items-center gap-3">
              <div className="text-2xl font-semibold text-slate-900">{selectedRegion}</div>
              <div className="flex items-center gap-1.5">
                {activeFlags.map((flag) => (
                  <span
                    key={flag}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-blue-100 bg-white text-base shadow-sm"
                  >
                    {flag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm ring-1 ring-slate-200">
                  <Radar size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                    Top Trade Routes
                  </div>
                  <div className="mt-2 space-y-2">
                    {visibleRoutes.length ? visibleRoutes.map((route) => (
                      <div
                        key={route.label}
                        className="group flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 transition hover:border-blue-200 hover:bg-blue-50/60 sm:flex-row sm:items-center sm:justify-between"
                        title={`${route.label} • ${route.count} saved account${route.count === 1 ? '' : 's'}`}
                      >
                        <span className="font-medium leading-6 text-slate-700 group-hover:text-slate-900 break-words sm:pr-3">{route.label}</span>
                        <span className="ml-3 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-100 px-2 text-xs font-semibold text-slate-500 group-hover:bg-blue-100 group-hover:text-blue-700">{route.count}</span>
                      </div>
                    )) : (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-3 text-sm text-slate-500">
                        Trade routes will appear here as lane data becomes available.
                      </div>
                    )}
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
                  {visibleRoutes.length ? regionSummary?.laneDensity || "0%" : "—"}
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
  const navigate = useNavigate();
  const [savedCompaniesLive, setSavedCompaniesLive] = useState([]);
  const [campaignsLive, setCampaignsLive] = useState([]);
  const [profileRoutesByCompany, setProfileRoutesByCompany] = useState({});
  const [dashboardLoading, setDashboardLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboardData() {
      try {
        const [savedRes, campaignsRes] = await Promise.all([
          getSavedCompanies(),
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

  useEffect(() => {
    let cancelled = false;

    async function loadRouteProfiles() {
      if (!savedCompaniesLive.length) {
        if (!cancelled) setProfileRoutesByCompany({});
        return;
      }

      const targetRows = savedCompaniesLive.slice(0, 10);
      const results = await Promise.all(targetRows.map(async (row) => {
        const companyKey = row?.company?.company_id || row?.company?.companyId || row?.company_id || row?.companyKey || row?.company_key || '';
        if (!companyKey) return null;
        try {
          const data = await getIyCompanyProfile({ companyKey });
          return [companyKey, data?.companyProfile || null];
        } catch (error) {
          console.warn('Dashboard route profile fetch failed for', companyKey, error);
          return [companyKey, null];
        }
      }));

      if (cancelled) return;
      const next = {};
      results.forEach((entry) => {
        if (!entry) return;
        const [key, value] = entry;
        next[key] = value;
      });
      setProfileRoutesByCompany(next);
    }

    loadRouteProfiles();

    return () => {
      cancelled = true;
    };
  }, [savedCompaniesLive]);

  const normalizedCompanies = useMemo(() => {
    if (savedCompaniesLive.length > 0) {
      return savedCompaniesLive.map((row) => {
        const companyId = row?.company?.company_id || row?.company?.companyId || row?.company?.source_company_key || row?.company_id || row?.companyKey || row?.company_key || "";
        return normalizeSavedCompanyRow(row, companyId ? profileRoutesByCompany[companyId] || null : null);
      });
    }
    if (!dashboardLoading) return [];
    return companiesTable.slice(0, 10);
  }, [savedCompaniesLive, dashboardLoading, profileRoutesByCompany]);

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

  const displayedCompanies = [...normalizedCompanies]
    .sort((a, b) => new Date(b?.raw?.created_at || b?.raw?.saved_at || 0) - new Date(a?.raw?.created_at || a?.raw?.saved_at || 0))
    .slice(0, 10);
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
                  {displayedCompanies.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-10 text-center text-sm text-slate-500">
                      No saved companies yet
                    </td>
                  </tr>
                ) : displayedCompanies.map((row) => {
                    const commandCenterHref = row.commandCenterHref || getCommandCenterHref(row);
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
                              navigate(commandCenterHref);
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
