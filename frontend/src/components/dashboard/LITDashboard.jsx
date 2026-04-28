import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import AppLayout from "@/layout/lit/AppLayout.jsx";
import { getSavedCompanies, getIyCompanyProfile } from "@/lib/api";
import { getCampaignsFromSupabase, supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";
// Phase B.18 — port of B.16 redesign into the actually-mounted dashboard.
// Logos reuse the shared CompanyAvatar + getCompanyLogoUrl cascade
// (logo.dev → Clearbit → Unavatar → gradient initials), the same path
// used by Search and Command Center. Globe lanes use canonicalizeLanes
// + laneStringToGlobeLane so duplicate / variant lane strings collapse
// to a single arc instead of stacking.
//
// Refresh strategy (future Edge Function): a scheduled job needs to
// populate `lit_saved_companies.kpis.activity_30d_current` and
// `activity_30d_previous` per saved company. Until that lands, the
// activity column renders "Pending refresh" — never a synthetic +0%.
// (Backend implementation is intentionally NOT in this phase.)
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { getCompanyLogoUrl } from "@/lib/logo";
import { formatSafeShipmentDate } from "@/lib/dateUtils";
import GlobeCanvas from "@/components/GlobeCanvas";
import { canonicalizeLanes, laneStringToGlobeLane } from "@/lib/laneGlobe";
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
  Activity,
  SearchCheck,
  Megaphone,
  UserRoundPlus,
  FileText,
  PlusCircle,
  Users2,
  ArrowRight,
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

// Globe data — coordinate lookup and country highlighting IDs
const GLOBE_COUNTRY_COORDS = {
  China: [104.2, 35.9], USA: [-95.7, 37.1], 'United States': [-95.7, 37.1],
  India: [78.9, 20.6], Germany: [10.5, 51.2], Japan: [138.3, 36.2],
  'South Korea': [127.8, 35.9], 'S.Korea': [127.8, 35.9], Korea: [127.8, 35.9],
  Vietnam: [108.3, 14.1], Mexico: [-102.6, 23.6], UK: [-1.5, 52.4],
  'United Kingdom': [-1.5, 52.4], Brazil: [-51.9, -14.2], Australia: [133.8, -25.3],
  Canada: [-96.8, 56.1], Netherlands: [5.3, 52.1], France: [2.3, 46.2],
  Italy: [12.6, 42.5], Spain: [-3.7, 40.4], Poland: [19.1, 51.9],
  Belgium: [4.5, 50.5], Singapore: [103.8, 1.3], Malaysia: [109.7, 4.2],
  Indonesia: [113.9, -0.8], Thailand: [100.5, 15.9], 'Hong Kong': [114.2, 22.3],
  Taiwan: [121.0, 23.7], 'South Africa': [25.1, -29.0], Morocco: [-7.1, 31.8],
  Egypt: [30.8, 26.8], Nigeria: [8.7, 9.1], Kenya: [37.9, 0.0],
  Argentina: [-65.0, -34.0], Chile: [-71.5, -35.7], Colombia: [-74.3, 4.6],
  Peru: [-75.0, -9.2], 'New Zealand': [172.5, -41.3],
};

const GLOBE_COUNTRY_IDS = {
  China: '156', USA: '840', 'United States': '840', India: '356',
  Germany: '276', Japan: '392', 'South Korea': '410', 'S.Korea': '410',
  Mexico: '484', UK: '826', 'United Kingdom': '826', Brazil: '076',
  Australia: '036', Vietnam: '704', Canada: '124',
  Netherlands: '528', France: '250', Italy: '380', Spain: '724',
  Poland: '616', Belgium: '056', Singapore: '702', Malaysia: '458',
  Indonesia: '360', Thailand: '764', 'Hong Kong': '344', Taiwan: '158',
  'South Africa': '710', Morocco: '504', Egypt: '818', Nigeria: '566',
  Kenya: '404', Argentina: '032', Chile: '152', Colombia: '170',
  Peru: '604', 'New Zealand': '554',
};

const STATIC_GLOBE_LANES = [
  { id: 'cn-us', from: 'China', to: 'USA', coords: [[104.2, 35.9], [-95.7, 37.1]], shipments: 42800, teu: '182K', trend: '+12%', up: true },
  { id: 'in-us', from: 'India', to: 'USA', coords: [[78.9, 20.6], [-95.7, 37.1]], shipments: 18400, teu: '76K', trend: '+8%', up: true },
  { id: 'de-us', from: 'Germany', to: 'USA', coords: [[10.5, 51.2], [-95.7, 37.1]], shipments: 12200, teu: '48K', trend: '+3%', up: true },
  { id: 'jp-us', from: 'Japan', to: 'USA', coords: [[138.3, 36.2], [-95.7, 37.1]], shipments: 9800, teu: '38K', trend: '-2%', up: false },
  { id: 'kr-us', from: 'South Korea', to: 'USA', coords: [[127.8, 35.9], [-95.7, 37.1]], shipments: 8400, teu: '31K', trend: '+5%', up: true },
  { id: 'vn-us', from: 'Vietnam', to: 'USA', coords: [[108.3, 14.1], [-95.7, 37.1]], shipments: 6900, teu: '26K', trend: '+22%', up: true },
  { id: 'us-mx', from: 'USA', to: 'Mexico', coords: [[-95.7, 37.1], [-102.6, 23.6]], shipments: 6200, teu: '22K', trend: '+18%', up: true },
];

// ISO code substitution map for shortening country names in route labels
const COUNTRY_NAME_TO_ISO = {
  'United States of America': 'US', 'United States': 'US', 'USA': 'US',
  'China': 'CN', 'Germany': 'DE', 'Japan': 'JP', 'South Korea': 'KR',
  'Vietnam': 'VN', 'Mexico': 'MX', 'United Kingdom': 'UK', 'Brazil': 'BR',
  'Australia': 'AU', 'Canada': 'CA', 'Netherlands': 'NL', 'France': 'FR',
  'Italy': 'IT', 'Spain': 'ES', 'Poland': 'PL', 'Belgium': 'BE',
  'Singapore': 'SG', 'Malaysia': 'MY', 'Indonesia': 'ID', 'Thailand': 'TH',
  'Hong Kong': 'HK', 'Taiwan': 'TW', 'South Africa': 'ZA', 'Morocco': 'MA',
  'Egypt': 'EG', 'Nigeria': 'NG', 'Kenya': 'KE', 'Argentina': 'AR',
  'Chile': 'CL', 'Colombia': 'CO', 'Peru': 'PE', 'New Zealand': 'NZ',
  'India': 'IN',
};

// Data viz palette for per-lane coloring (matches design system)
const LANE_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#f97316'];

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
  

  // Carrier — top carrier from any available field
  const carrier =
    companyData?.topCarrier ||
    companyData?.top_carrier ||
    companyData?.carrier ||
    enrichedProfile?.routeKpis?.topCarrier ||
    enrichedProfile?.routeKpis?.top_carrier ||
    company?.kpis?.top_carrier ||
    '—';

  // % change — compute from 3m vs 6m shipments if available, else null
  const s3m = Number(companyData?.shipments_3m ?? companyData?.shipmentsLast3m ?? 0);
  const s6m = Number(companyData?.shipments_6m ?? companyData?.shipmentsLast6m ?? 0);
  const rawChangePercent = companyData?.growth_rate ?? companyData?.yoy_change ?? companyData?.volume_change ?? null;
  let changePercent = null;
  if (rawChangePercent !== null) {
    changePercent = Math.round(Number(rawChangePercent));
  } else if (s3m > 0 && s6m > 0) {
    const prev = s6m / 2;
    changePercent = Math.round(((s3m - prev) / prev) * 100);
  }

  return {
    company: prettifyCompanyName(rawCompanyName),
    type: row?.stage ? titleCase(row.stage) : raw?.source ? titleCase(raw.source) : 'Saved Company',
    location,
    shipments: formatNumber(shipmentsValue),
    shipmentsValue,
    teu: teuValue,
    mode,
    lastShipment: formatDate(lastShipment),
    lastShipmentRaw: lastShipment,
    recency: lastShipment ? 'Recent' : 'Inactive',
    status: shipmentsValue >= 1000 ? 'High' : shipmentsValue >= 100 ? 'Medium' : 'Low',
    carrier,
    changePercent,
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

// Deterministic color for company avatar based on name
function companyInitialColor(name) {
  const palette = ['#3B82F6', '#F59E0B', '#10B981', '#8B5CF6', '#EF4444', '#06B6D4', '#F97316'];
  let hash = 0;
  const str = String(name || '');
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

// Relative date ("Today", "3 days ago", etc.)
function relativeDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diffDays < 0) return '—';
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}yr ago`;
}

// Phase B.18 — activity-delta display rule. `current_30d` and
// `previous_30d` come from `lit_saved_companies.kpis.activity_30d_current`
// and `activity_30d_previous`. Until a scheduled refresh job populates
// those columns, render "Pending refresh" — never a synthetic +0%.
function activitySignal(row) {
  const cur = row?.company?.kpis?.activity_30d_current;
  const prev = row?.company?.kpis?.activity_30d_previous;
  const curN = cur == null ? null : Number(cur);
  const prevN = prev == null ? null : Number(prev);
  if (
    curN == null ||
    prevN == null ||
    !Number.isFinite(curN) ||
    !Number.isFinite(prevN)
  ) {
    return <span className="text-slate-500">Pending refresh</span>;
  }
  if (prevN === 0 && curN > 0) {
    return <span className="text-emerald-700 font-semibold">New activity</span>;
  }
  if (curN > prevN) {
    const pct = Math.round(((curN - prevN) / Math.max(1, prevN)) * 100);
    return (
      <span className="text-emerald-700 font-semibold">↑ +{pct}%</span>
    );
  }
  if (curN < prevN) {
    const pct = Math.round(((prevN - curN) / Math.max(1, prevN)) * 100);
    return <span className="text-rose-600 font-semibold">↓ {pct}%</span>;
  }
  return <span className="text-slate-600">Flat</span>;
}

// Abbreviate country names to ISO 2-letter codes for compact display
function abbreviateCountryToken(token) {
  if (!token) return token;
  let result = String(token);
  // Replace longest names first to avoid partial overwrites
  const entries = Object.entries(COUNTRY_NAME_TO_ISO).sort((a, b) => b[0].length - a[0].length);
  for (const [name, iso] of entries) {
    result = result.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), iso);
  }
  return result;
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

// Helpers for building globe lanes from real trade route data
function findCoordsFromToken(token) {
  if (!token) return null;
  const normalized = String(token).trim();
  if (GLOBE_COUNTRY_COORDS[normalized]) return GLOBE_COUNTRY_COORDS[normalized];
  const lower = normalized.toLowerCase();
  for (const [key, coords] of Object.entries(GLOBE_COUNTRY_COORDS)) {
    if (key.toLowerCase() === lower) return coords;
  }
  for (const [key, coords] of Object.entries(GLOBE_COUNTRY_COORDS)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) return coords;
  }
  return null;
}

function buildGlobelanesFromRoutes(routes) {
  if (!routes || !routes.length) return [];
  const lanes = [];
  routes.forEach((route, i) => {
    const label = typeof route === 'string' ? route : route?.label;
    if (!label || !label.includes('→')) return;
    const [originToken, destToken] = label.split('→').map(s => s.trim());
    const originCoords = findCoordsFromToken(originToken);
    const destCoords = findCoordsFromToken(destToken);
    if (!originCoords || !destCoords) return;
    const count = typeof route === 'string' ? 1 : (route?.count || 1);
    lanes.push({
      id: `real-${i}`,
      from: originToken,
      to: destToken,
      coords: [originCoords, destCoords],
      shipments: Math.max(1, count) * 200,
      teu: `${count}K`,
      trend: '+0%',
      up: true,
    });
  });
  return lanes;
}

// D3 + TopoJSON canvas-based 3D globe with animated trade route arcs
function D3Globe({ selectedLane, size = 280, lanes, arcColor = '#3B82F6', hlColor = 'rgba(59,130,246,0.48)' }) {
  const canvasRef = useRef(null);
  const stateRef = useRef({
    world: null, rotation: [0, -25], targetRotation: null,
    spinning: true, animFrame: null, dashOffset: 0,
  });
  const lanesRef = useRef(lanes);
  const selectedRef = useRef(selectedLane);
  const arcColorRef = useRef(arcColor);
  const hlColorRef = useRef(hlColor);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { lanesRef.current = lanes; }, [lanes]);
  useEffect(() => { selectedRef.current = selectedLane; }, [selectedLane]);
  useEffect(() => { arcColorRef.current = arcColor; }, [arcColor]);
  useEffect(() => { hlColorRef.current = hlColor; }, [hlColor]);

  // Load D3 v7, TopoJSON, and world atlas topology
  useEffect(() => {
    let mounted = true;
    async function initDeps() {
      try {
        await loadScript('https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js');
        await loadScript('https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js');
        const resp = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
        const data = await resp.json();
        if (!mounted) return;
        stateRef.current.world = data;
        setLoaded(true);
      } catch {
        if (mounted) setLoaded(true);
      }
    }
    initDeps();
    return () => {
      mounted = false;
      if (stateRef.current.animFrame) cancelAnimationFrame(stateRef.current.animFrame);
    };
  }, []);

  // Rotate to focused lane midpoint when a lane is selected
  useEffect(() => {
    const s = stateRef.current;
    if (selectedLane) {
      const lane = lanesRef.current?.find(l => l.id === selectedLane);
      if (lane?.coords) {
        const midLon = (lane.coords[0][0] + lane.coords[1][0]) / 2;
        const midLat = (lane.coords[0][1] + lane.coords[1][1]) / 2;
        s.targetRotation = [-midLon, -midLat];
        s.spinning = false;
      }
    } else {
      s.spinning = true;
      s.targetRotation = null;
    }
  }, [selectedLane]);

  // Canvas animation loop
  useEffect(() => {
    if (!loaded) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const s = stateRef.current;

    function tick() {
      s.animFrame = requestAnimationFrame(tick);
      const d3g = window.d3;
      const topo = window.topojson;
      if (!d3g || !topo) return;

      if (s.targetRotation) {
        const [tr0, tr1] = s.targetRotation;
        s.rotation[0] += (tr0 - s.rotation[0]) * 0.035;
        s.rotation[1] += (tr1 - s.rotation[1]) * 0.035;
        if (Math.abs(s.rotation[0] - tr0) < 0.05 && Math.abs(s.rotation[1] - tr1) < 0.05) {
          s.rotation = [tr0, tr1];
          s.targetRotation = null;
        }
      } else if (s.spinning) {
        s.rotation[0] += 0.1;
      }
      s.dashOffset = (s.dashOffset + 0.4) % 24;

      const proj = d3g.geoOrthographic()
        .scale(size / 2 - 6)
        .translate([size / 2, size / 2])
        .rotate([s.rotation[0], s.rotation[1], 0])
        .clipAngle(90);
      const path = d3g.geoPath(proj, ctx);

      ctx.clearRect(0, 0, size, size);

      // Sphere gradient (blue-white)
      const grad = ctx.createRadialGradient(size * 0.42, size * 0.38, size * 0.05, size / 2, size / 2, size / 2 - 6);
      grad.addColorStop(0, '#F0F7FF');
      grad.addColorStop(1, '#DBEAFE');
      ctx.beginPath(); path({ type: 'Sphere' });
      ctx.fillStyle = grad; ctx.fill();
      ctx.strokeStyle = '#BFDBFE'; ctx.lineWidth = 1; ctx.stroke();

      // Graticule lines
      ctx.beginPath(); path(d3g.geoGraticule().step([30, 30])());
      ctx.strokeStyle = 'rgba(59,130,246,0.07)'; ctx.lineWidth = 0.5; ctx.stroke();

      // Read current arcColor/hlColor from refs so they update without remount
      const currentArcColor = arcColorRef.current;
      const currentHlColor = hlColorRef.current;

      // Country fills with optional highlight for active lane endpoints
      if (s.world) {
        const sel = selectedRef.current;
        const hlIds = new Set();
        if (sel) {
          const lane = lanesRef.current?.find(l => l.id === sel);
          if (lane) {
            [lane.from, lane.to].forEach(name => {
              const id = GLOBE_COUNTRY_IDS[name];
              if (id) hlIds.add(id);
            });
          }
        }
        topo.feature(s.world, s.world.objects.countries).features.forEach(f => {
          const isHl = hlIds.has(String(f.id));
          ctx.beginPath(); path(f);
          ctx.fillStyle = isHl ? currentHlColor : '#E2E8F0';
          ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.4; ctx.stroke();
        });
      }

      // Animated arc for selected trade lane
      const sel = selectedRef.current;
      if (sel) {
        const lane = lanesRef.current?.find(l => l.id === sel);
        if (lane?.coords) {
          const arc = { type: 'LineString', coordinates: [lane.coords[0], lane.coords[1]] };
          ctx.beginPath(); path(arc);
          ctx.strokeStyle = currentArcColor + '33'; ctx.lineWidth = 7;
          ctx.setLineDash([]); ctx.stroke();
          ctx.beginPath(); path(arc);
          ctx.strokeStyle = currentArcColor; ctx.lineWidth = 2.5;
          ctx.setLineDash([8, 4]); ctx.lineDashOffset = -s.dashOffset; ctx.stroke();
          ctx.setLineDash([]);
          // Endpoint dots with pulse rings
          lane.coords.forEach(coord => {
            const dist = d3g.geoDistance(coord, [-s.rotation[0] * Math.PI / 180, -s.rotation[1] * Math.PI / 180]);
            if (dist > Math.PI / 2) return;
            const pt = proj(coord);
            if (!pt) return;
            const [px, py] = pt;
            const pr = 7 + (s.dashOffset % 12) * 0.9;
            const alpha = Math.max(0, 0.45 - (s.dashOffset % 12) / 26);
            ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2);
            ctx.strokeStyle = currentArcColor + Math.round(alpha * 255).toString(16).padStart(2, '0');
            ctx.lineWidth = 1.5; ctx.stroke();
            ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2);
            ctx.fillStyle = currentArcColor; ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
          });
        }
      }
    }

    s.animFrame = requestAnimationFrame(tick);
    return () => { if (s.animFrame) cancelAnimationFrame(s.animFrame); };
  }, [loaded, size]);

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <canvas ref={canvasRef} style={{ display: 'block', borderRadius: '50%' }} />
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-[#EFF6FF]">
          <span className="font-display text-[11px] text-slate-400">Loading…</span>
        </div>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  note,
  change,
  changeClass = "text-emerald-600",
  icon: Icon,
  accent = "from-blue-600 to-indigo-600",
}) {
  return (
    <div className="group relative overflow-hidden rounded-[14px] border border-[#E5E7EB] bg-gradient-to-b from-white to-[#F8FAFC] p-5 shadow-[0_8px_30px_rgba(15,23,42,0.06)] transition-all duration-200 hover:border-[#CBD5E1] hover:shadow-[0_12px_32px_rgba(15,23,42,0.10)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            {title}
          </div>
          <div className="mt-3 flex items-end gap-2">
            <div className="lit-kpi-mono text-[24px]">{value}</div>
            {change ? <div className={`pb-1 text-sm font-semibold ${changeClass}`}>{change}</div> : null}
          </div>
          <div className="mt-2 text-sm text-slate-500">{note}</div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${accent} text-white shadow-sm`}>
            <Icon size={18} />
          </div>
          <span className="lit-live-pill">
            <span className="lit-live-dot" />
            Live
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
          <div className="font-display text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400">
            {eyebrow}
          </div>
        ) : null}
        <div className="font-display mt-1 text-sm font-bold text-[#0F172A]">{title}</div>
        {subtitle ? <div className="font-body mt-1 text-sm text-[#64748b]">{subtitle}</div> : null}
      </div>

      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${iconAccent} text-white shadow-sm`}>
        <Icon size={17} />
      </div>
    </div>
  );
}

function StatusPill({ value, tone = "green" }) {
  const styles = {
    green:  "bg-[#F0FDF4] text-[#15803d] border-[#BBF7D0]",
    yellow: "bg-[#FFFBEB] text-[#b45309] border-[#FDE68A]",
    blue:   "bg-[#EFF6FF] text-[#1d4ed8] border-[#BFDBFE]",
    slate:  "bg-[#F1F5F9] text-[#64748b] border-[#E2E8F0]",
  };

  return (
    <span className={`font-display inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${styles[tone]}`}>
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

function TradeMapPanel({ regionSummary }) {
  const [selectedLane, setSelectedLane] = useState(null);

  const globeLanes = useMemo(() => {
    const allRoutes = [
      ...(regionSummary?.activeTradeRoutes || []),
      ...Object.values(regionSummary?.regionRoutes || {}).flat(),
    ];
    const built = buildGlobelanesFromRoutes(allRoutes);
    return built.length ? built : STATIC_GLOBE_LANES;
  }, [regionSummary]);

  function handleLane(id) {
    setSelectedLane(prev => prev === id ? null : id);
  }

  const activeLane = globeLanes.find(l => l.id === selectedLane);
  const selectedIdx = selectedLane ? globeLanes.findIndex(l => l.id === selectedLane) : -1;
  const activeLaneColor = selectedIdx >= 0 ? LANE_COLORS[selectedIdx % LANE_COLORS.length] : '#3b82f6';
  // hlColor: lane color at ~48% opacity (hex)
  const activeLaneHlColor = activeLaneColor + '7a';

  return (
    <div className="rounded-[14px] border border-[#E5E7EB] bg-white shadow-[0_8px_30px_rgba(15,23,42,0.06)] overflow-hidden">
      {/* Header */}
      <div className="border-b border-[#F1F5F9] px-5 py-4 flex items-center justify-between">
        <div>
          <div className="font-display text-sm font-bold text-[#0F172A]">Top Active Trade Lanes</div>
          <div className="font-body mt-0.5 text-xs text-[#94A3B8]">Click a lane to focus the globe</div>
        </div>
        <Globe2 size={16} className="text-blue-500 flex-shrink-0" />
      </div>

      <div className="flex flex-col md:flex-row">
        {/* 3D Globe */}
        <div className="flex items-center justify-center bg-[#F8FAFC] md:border-r border-b md:border-b-0 border-[#F1F5F9] p-5">
          <D3Globe
            selectedLane={selectedLane}
            size={270}
            lanes={globeLanes}
            arcColor={activeLaneColor}
            hlColor={activeLaneHlColor}
          />
        </div>

        {/* Lane list */}
        <div className="flex-1 overflow-y-auto" style={{ maxHeight: 320 }}>
          {globeLanes.map((lane, idx) => {
            const isSelected = selectedLane === lane.id;
            const laneColor = LANE_COLORS[idx % LANE_COLORS.length];
            const fromLabel = abbreviateCountryToken(lane.from);
            const toLabel = abbreviateCountryToken(lane.to);
            return (
              <button
                key={lane.id}
                type="button"
                onClick={() => handleLane(lane.id)}
                style={isSelected ? { borderLeftColor: laneColor, background: laneColor + '10' } : {}}
                className={[
                  "w-full text-left px-4 py-3 border-b border-[#F1F5F9] transition-colors cursor-pointer border-l-2",
                  isSelected ? "" : "hover:bg-[#F8FAFC] border-l-transparent",
                ].join(" ")}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      style={isSelected ? { color: laneColor } : {}}
                      className={`font-mono text-[11px] font-semibold ${isSelected ? '' : 'text-[#374151]'}`}
                    >
                      {fromLabel}
                    </span>
                    <ArrowRight size={8} className="text-slate-300 flex-shrink-0" />
                    <span
                      style={isSelected ? { color: laneColor } : {}}
                      className={`font-mono text-[11px] font-semibold ${isSelected ? '' : 'text-[#374151]'}`}
                    >
                      {toLabel}
                    </span>
                  </div>
                  <span className={[
                    "font-display text-[10px] font-bold rounded-full px-1.5 py-px",
                    lane.up ? 'text-[#15803d] bg-[rgba(34,197,94,0.1)]' : 'text-[#b91c1c] bg-[rgba(239,68,68,0.1)]',
                  ].join(" ")}>
                    {lane.up ? '↑' : '↓'} {lane.trend}
                  </span>
                </div>
                <div className="flex gap-3">
                  <span className="font-mono text-[10px] text-[#94A3B8]">
                    {typeof lane.shipments === 'number' ? lane.shipments.toLocaleString() : lane.shipments} ships
                  </span>
                  <span className="font-mono text-[10px] text-[#94A3B8]">{lane.teu} TEU</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected lane detail bar */}
      {activeLane && (
        <div
          className="flex flex-wrap items-center gap-4 border-t px-5 py-2.5"
          style={{ borderTopColor: activeLaneColor + '40', background: activeLaneColor + '0d' }}
        >
          <span className="font-display text-xs font-semibold" style={{ color: activeLaneColor }}>
            {abbreviateCountryToken(activeLane.from)} → {abbreviateCountryToken(activeLane.to)}
          </span>
          <div className="ml-auto flex flex-wrap gap-4">
            <span className="font-body text-xs text-slate-500">
              Ships: <strong className="font-mono" style={{ color: activeLaneColor }}>
                {typeof activeLane.shipments === 'number' ? activeLane.shipments.toLocaleString() : activeLane.shipments}
              </strong>
            </span>
            <span className="font-body text-xs text-slate-500">
              TEU: <strong className="font-mono" style={{ color: activeLaneColor }}>{activeLane.teu}</strong>
            </span>
            <span className={`font-display text-xs font-bold ${activeLane.up ? 'text-[#15803d]' : 'text-[#b91c1c]'}`}>
              {activeLane.up ? '↑' : '↓'} {activeLane.trend}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function SavedContactsPanel({ contacts, loading }) {
  const header = (
    <div className="border-b border-slate-200 px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-slate-800">Saved Contacts</div>
          <div className="mt-1 text-sm text-slate-500">Enriched contacts from your saved companies</div>
        </div>
        <div className="hidden h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-600 to-blue-600 text-white shadow-sm md:flex">
          <Users2 size={18} />
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="rounded-[14px] border border-[#E5E7EB] bg-gradient-to-b from-white to-[#F8FAFC] shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
        {header}
        <div className="px-5 py-8 text-center text-sm text-slate-400">Loading contacts…</div>
      </div>
    );
  }

  if (!contacts.length) {
    return (
      <div className="rounded-[14px] border border-[#E5E7EB] bg-gradient-to-b from-white to-[#F8FAFC] shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
        {header}
        <div className="px-5 py-10 text-center">
          <Users2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="font-body text-sm text-[#475569] mb-3">No enriched contacts yet</p>
          <Link
            to="/app/command-center"
            className="inline-flex items-center gap-1 text-sm font-semibold font-display text-[#3b82f6] hover:text-[#2563eb]"
          >
            Go to Command Center <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[14px] border border-[#E5E7EB] bg-gradient-to-b from-white to-[#F8FAFC] shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
      {header}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Name</th>
              <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Title</th>
              <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Company</th>
              <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
              <tr key={contact.id} className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600">
                      <Users2 size={16} />
                    </div>
                    <span className="font-medium text-slate-900 text-sm">{contact.full_name || '—'}</span>
                  </div>
                </td>
                <td className="px-5 py-4 text-sm text-slate-600">{contact.title || '—'}</td>
                <td className="px-5 py-4 text-sm text-slate-700">{contact.company_name || '—'}</td>
                <td className="px-5 py-4">
                  <Link
                    to="/app/command-center"
                    className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
                  >
                    View <ArrowRight size={12} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function LITDashboard() {
  const navigate = useNavigate();
  const { user, fullName } = useAuth();
  const [savedCompaniesLive, setSavedCompaniesLive] = useState([]);
  const [campaignsLive, setCampaignsLive] = useState([]);
  const [profileRoutesByCompany, setProfileRoutesByCompany] = useState({});
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [savedContactsCount, setSavedContactsCount] = useState(null);
  const [searchCount, setSearchCount] = useState(null);
  const [savedContacts, setSavedContacts] = useState([]);
  const [activityEvents, setActivityEvents] = useState([]);

  const displayName =
    fullName ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "there";

  useEffect(() => {
    let cancelled = false;

    async function loadDashboardData() {
      try {
        const [savedRes, campaignsRes, contactsCountRes, searchRes, contactsRowsRes, activityRes] = await Promise.all([
          getSavedCompanies(),
          getCampaignsFromSupabase(),
          supabase.from('lit_contacts').select('id', { count: 'exact', head: true }),
          supabase.from('lit_activity_events').select('id', { count: 'exact', head: true }).eq('user_id', user?.id).eq('event_type', 'search'),
          supabase.from('lit_contacts').select('id, full_name, title, company_name, created_at').order('created_at', { ascending: false }).limit(8),
          supabase.from('lit_activity_events').select('event_type, metadata, created_at').eq('user_id', user?.id).order('created_at', { ascending: false }).limit(10),
        ]);

        if (cancelled) return;

        setSavedCompaniesLive(Array.isArray(savedRes?.rows) ? savedRes.rows : []);
        if (!contactsCountRes.error) setSavedContactsCount(contactsCountRes.count ?? 0);
        if (!searchRes.error) setSearchCount(searchRes.count ?? 0);
        if (!contactsRowsRes.error) setSavedContacts(contactsRowsRes.data || []);
        if (!activityRes.error) setActivityEvents(activityRes.data || []);
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

  // Phase B.18 — REAL saved companies only (never the fake `companiesTable`
  // fallback). Used to power the new Trade Lane row + What Matters Now table.
  // `savedCompaniesLive` is the raw RLS-scoped output of getSavedCompanies()
  // / listSavedCompanies(); each row exposes `row.company.{name, domain,
  // address, country_code, kpis}`.
  const realSavedCompanies = savedCompaniesLive;

  // Aggregate `kpis.top_route_12m` across saved companies. Empty array
  // when the user hasn't saved any companies — never a fabricated lane.
  const topAggregatedLanes = useMemo(() => {
    const counts = new Map();
    for (const row of realSavedCompanies) {
      const lane = row?.company?.kpis?.top_route_12m;
      if (!lane || typeof lane !== "string") continue;
      counts.set(lane, (counts.get(lane) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }, [realSavedCompanies]);

  // Convert the aggregated lane list into globe arcs. canonicalizeLanes
  // collapses variants (e.g. "China → United States" + "China → USA") so
  // the globe doesn't double-render the same arc.
  const globeLanesB18 = useMemo(() => {
    if (topAggregatedLanes.length === 0) return [];
    const raw = topAggregatedLanes.slice(0, 8).map((l) => ({
      lane: l.label,
      shipments: l.count,
      teu: 0,
      spend: null,
    }));
    const { canonical } = canonicalizeLanes(raw);
    return canonical
      .map((c, i) => laneStringToGlobeLane(c.displayLabel, i))
      .filter(Boolean);
  }, [topAggregatedLanes]);

  // Templated, deterministic insights. Every clause is grounded in real
  // saved-company aggregates — we never invoke an external AI service and
  // we never invent metrics.
  const tradeInsights = useMemo(() => {
    if (realSavedCompanies.length === 0) return [];
    const list = [];
    if (topAggregatedLanes.length >= 2) {
      const [a, b] = topAggregatedLanes;
      list.push(
        `Rising activity across ${a.label} and ${b.label} lanes among your saved accounts.`,
      );
    } else if (topAggregatedLanes.length === 1) {
      list.push(
        `${topAggregatedLanes[0].label} is the dominant lane in your saved set.`,
      );
    }
    const noContacts = realSavedCompanies.filter((r) => {
      const loaded = Number(r?.company?.kpis?.contacts_loaded || 0);
      const count = Number(r?.company?.kpis?.contacts_count || 0);
      return !(loaded > 0) && !(count > 0);
    }).length;
    if (noContacts > 0) {
      list.push(
        `${noContacts} of your saved ${noContacts === 1 ? "account has" : "accounts have"} no verified contacts yet — outreach pending enrichment.`,
      );
    }
    const recentActivity = realSavedCompanies.filter((r) => {
      const last = r?.company?.kpis?.last_activity;
      if (!last) return false;
      const t = new Date(last).getTime();
      if (!Number.isFinite(t)) return false;
      return Date.now() - t <= 30 * 24 * 60 * 60 * 1000;
    }).length;
    if (recentActivity > 0) {
      list.push(
        `${recentActivity} ${recentActivity === 1 ? "account" : "accounts"} shipped in the last 30 days — prioritize for outreach.`,
      );
    }
    return list;
  }, [realSavedCompanies, topAggregatedLanes]);

  // Saved companies ranked by latest shipment for the new What Matters Now
  // table. Pulls directly from realSavedCompanies (NOT displayedCompanies,
  // which falls back to the legacy `companiesTable` mock during loading).
  const whatMattersRows = useMemo(() => {
    return [...realSavedCompanies]
      .sort((a, b) => {
        const at =
          new Date(a?.company?.kpis?.last_activity || 0).getTime() || 0;
        const bt =
          new Date(b?.company?.kpis?.last_activity || 0).getTime() || 0;
        return bt - at;
      })
      .slice(0, 8);
  }, [realSavedCompanies]);

  const displayedActivity = activityEvents.length
    ? activityEvents.map((e) => ({
        type: titleCase((e.event_type || 'activity').replace(/_/g, ' ')),
        name: e.metadata?.company_name || e.metadata?.name || e.metadata?.query || '',
        when: formatDate(e.created_at) || 'Recently',
      }))
    : activityFeed;

  return (
    <AppLayout>
      <div className="min-h-full bg-[#F8FAFC] p-4 md:p-6 xl:p-8">
        <div className="mx-auto max-w-[1600px] space-y-6">
          <section>
            <div className="font-display text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400">
              Overview
            </div>
            <h1 className="font-display mt-1 text-3xl font-bold tracking-tight text-[#0F172A] md:text-4xl">
              Welcome back, {displayName}
            </h1>
            <p className="font-body mt-2 max-w-3xl text-sm leading-6 text-[#475569]">
              Real-time shipment intelligence and opportunity signals across your saved accounts.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => navigate('/app/search')}
                className="inline-flex items-center gap-2 rounded-[10px] bg-gradient-to-b from-[#3B82F6] to-[#2563EB] px-4 py-2 text-[13px] font-semibold font-display text-white shadow-[0_1px_4px_rgba(59,130,246,0.3)] hover:opacity-90 transition-opacity"
              >
                <SearchCheck size={14} /> Discover Companies
              </button>
              <button
                type="button"
                onClick={() => navigate('/app/campaigns')}
                className="inline-flex items-center gap-2 rounded-[10px] border border-[#E5E7EB] bg-white px-4 py-2 text-[13px] font-semibold font-display text-[#374151] hover:border-[#CBD5E1] transition-colors"
              >
                <PlusCircle size={14} /> New Campaign
              </button>
            </div>
          </section>

          {/* Phase B.18 — KPI tiles with honest empty-state copy.
              When the user has no saved companies / campaigns / contacts,
              the tile note explains the next action instead of bragging
              about a synthetic delta. */}
          <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <StatCard
              title="Saved Companies"
              value={dashboardLoading ? "—" : String(savedCompaniesCount)}
              change=""
              note={
                dashboardLoading
                  ? "Loading…"
                  : savedCompaniesCount > 0
                    ? "Live CRM count"
                    : "Save companies to start populating your dashboard."
              }
              icon={Building2}
              accent="from-blue-600 to-indigo-600"
              chip="CRM"
            />
            <StatCard
              title="Active Campaigns"
              value={dashboardLoading ? "—" : String(activeCampaignsCount)}
              note={
                dashboardLoading
                  ? "Loading…"
                  : activeCampaignsCount > 0
                    ? "Live campaign count"
                    : "Launch a campaign in Outbound to track engagement here."
              }
              change=""
              icon={Briefcase}
              accent="from-violet-600 to-indigo-600"
              chip="Outreach"
            />
            <StatCard
              title="Saved Contacts"
              value={dashboardLoading || savedContactsCount === null ? "—" : String(savedContactsCount)}
              note={
                savedContactsCount && savedContactsCount > 0
                  ? "Enriched contacts"
                  : "Verified contacts unlock once you save companies and run enrichment."
              }
              change=""
              icon={UserRoundPlus}
              accent="from-cyan-600 to-blue-600"
              chip="Contacts"
            />
            <StatCard
              title="Searches Used"
              value={dashboardLoading || searchCount === null ? "—" : String(searchCount)}
              note={
                searchCount && searchCount > 0
                  ? "All-time usage"
                  : "Run your first search to populate this metric."
              }
              change=""
              icon={TrendingUp}
              accent="from-sky-600 to-blue-500"
              chip="Usage"
            />
          </section>

          <TradeMapPanel regionSummary={regionSummary} />

          {/* Phase B.18 — Trade Lane Intelligence row.
              Left 1/4: top aggregated lanes from saved companies.
              Center 2/4: compact GlobeCanvas of those lanes.
              Right 1/4: templated AI Trade Insights (no external AI call).
              All three blocks render honest empty-state copy when the user
              has no saved companies — never fake data. */}
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 mb-3">
                Top Active Lanes
              </div>
              {topAggregatedLanes.length === 0 ? (
                <div className="text-sm text-slate-500">
                  {realSavedCompanies.length === 0
                    ? "Save companies to surface top lanes."
                    : "No lane data yet — pending refresh."}
                </div>
              ) : (
                <ul className="space-y-2">
                  {topAggregatedLanes.slice(0, 5).map((lane) => (
                    <li
                      key={lane.label}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="truncate font-medium text-slate-900">
                        {lane.label}
                      </span>
                      <span className="font-mono text-xs text-slate-500">
                        {lane.count}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm lg:col-span-2 flex items-center justify-center min-h-[260px]">
              {globeLanesB18.length > 0 ? (
                <GlobeCanvas size={220} lanes={globeLanesB18} />
              ) : (
                <div className="text-center text-sm text-slate-500">
                  <div className="font-semibold text-slate-700">
                    No globe data
                  </div>
                  <div className="mt-1">
                    Save companies with shipment lanes to see the map.
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-blue-50 p-5 shadow-sm">
              <div className="font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-700 mb-3">
                AI Trade Insights
              </div>
              {tradeInsights.length === 0 ? (
                <div className="text-sm text-slate-500">
                  Save companies to unlock trade insights.
                </div>
              ) : (
                <ul className="space-y-2 text-sm text-slate-700">
                  {tradeInsights.map((insight, i) => (
                    <li key={i} className="leading-relaxed">
                      {insight}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Phase B.18 — What Matters Now: saved companies only, scoped to
              the logged-in user via getSavedCompanies (Supabase RLS). Logo
              cascade reuses the shared CompanyAvatar + getCompanyLogoUrl
              helpers (logo.dev → Clearbit → Unavatar → gradient initials).
              Activity column renders "Pending refresh" until a backend
              edge function populates kpis.activity_30d_current/previous. */}
          <section className="rounded-[14px] border border-[#E5E7EB] bg-gradient-to-b from-white to-[#F8FAFC] shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
            <div className="border-b border-[#F1F5F9] px-5 py-4 flex items-start justify-between">
              <div>
                <div className="font-display text-sm font-bold text-[#0F172A]">What Matters Now</div>
                <div className="font-body mt-1 text-xs text-[#94A3B8]">Saved accounts ranked by latest shipment activity</div>
              </div>
              <span className="lit-live-pill"><span className="lit-live-dot" />Live</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="border-b border-[#F1F5F9]">
                    <th className="px-4 py-3 font-display text-left text-[9px] font-bold uppercase tracking-[0.12em] text-[#94A3B8]">Company</th>
                    <th className="px-4 py-3 font-display text-left text-[9px] font-bold uppercase tracking-[0.12em] text-[#94A3B8]">Shipments (12M)</th>
                    <th className="px-4 py-3 font-display text-left text-[9px] font-bold uppercase tracking-[0.12em] text-[#94A3B8]">Last Shipment</th>
                    <th className="px-4 py-3 font-display text-left text-[9px] font-bold uppercase tracking-[0.12em] text-[#94A3B8]">Top Lane</th>
                    <th className="px-4 py-3 font-display text-left text-[9px] font-bold uppercase tracking-[0.12em] text-[#94A3B8]">Activity</th>
                    <th className="px-4 py-3 font-display text-left text-[9px] font-bold uppercase tracking-[0.12em] text-[#94A3B8]">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {whatMattersRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-500">
                        No saved companies yet. Open Search to find your first prospect.
                      </td>
                    </tr>
                  ) : whatMattersRows.map((row, idx) => {
                    const co = row?.company || {};
                    const kpis = co?.kpis || {};
                    const name = co?.name || "Unknown";
                    const domain = co?.domain || co?.website || null;
                    const companyId = co?.company_id || co?.id || null;
                    const subtitle =
                      co?.address ||
                      co?.country_code ||
                      domain ||
                      "—";
                    const shipments = kpis?.shipments_12m;
                    const lastShipmentLabel = formatSafeShipmentDate(
                      kpis?.last_activity ||
                        co?.most_recent_shipment_date ||
                        co?.last_shipment_date ||
                        null,
                      "—",
                    );
                    const topLane =
                      kpis?.top_route_12m ||
                      kpis?.recent_route ||
                      co?.top_route_12m ||
                      "—";
                    return (
                      <tr
                        key={companyId || idx}
                        className="border-b border-[#F1F5F9] last:border-0 hover:bg-[#F8FAFC] transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <CompanyAvatar
                              name={name}
                              logoUrl={getCompanyLogoUrl(domain || undefined) || undefined}
                              size="sm"
                              domain={domain || undefined}
                            />
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-slate-900 text-sm">{name}</div>
                              <div className="truncate text-xs text-slate-500">{subtitle}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {Number.isFinite(Number(shipments)) && Number(shipments) > 0
                            ? Number(shipments).toLocaleString()
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">{lastShipmentLabel}</td>
                        <td
                          className="px-4 py-3 text-sm text-slate-700 truncate max-w-[200px]"
                          title={topLane}
                        >
                          {topLane}
                        </td>
                        <td className="px-4 py-3 text-sm">{activitySignal(row)}</td>
                        <td className="px-4 py-3 text-sm">
                          <button
                            type="button"
                            onClick={() =>
                              navigate(
                                companyId
                                  ? `/app/companies/${encodeURIComponent(String(companyId))}`
                                  : "/app/companies",
                              )
                            }
                            className="text-indigo-600 hover:text-indigo-700 font-semibold"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <SavedContactsPanel contacts={savedContacts} loading={dashboardLoading} />

        </div>
      </div>
    </AppLayout>
  );
}
