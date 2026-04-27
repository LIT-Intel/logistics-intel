import React, { useMemo, useState, useEffect } from "react";

import {
  Boxes,
  CalendarClock,
  DollarSign,
  Globe,
  Layers,
  Package,
  Phone,
  Ship,
  TrendingUp,
  MapPin,
  Truck,
  UserRound,
  Users,
  Briefcase,
  Building2,
  ArrowUpRight,
  ArrowRight,
  BarChart3,
  Container,
  Search,
  Save,
  CheckCircle2,
  Mail,
  Linkedin,
} from "lucide-react";
import {
  buildCommandCenterDetailModel,
  buildYearScopedProfile,
  getCommandCenterAvailableYears,
  resolveLitCompanyUuid,
} from "@/lib/api";
import type { IyCompanyProfile, IyRouteKpis } from "@/lib/api";
import type { CommandCenterRecord } from "@/types/importyeti";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CompanyActivityChart from "./CompanyActivityChart";
import GlobeCanvas, { type GlobeLane } from "@/components/GlobeCanvas";
import {
  canonicalizeLanes,
  laneStringToGlobeLane,
  resolveEndpoint,
  type CanonicalLane,
  type NonCanonicalLane,
  type ResolvedEndpoint,
} from "@/lib/laneGlobe";
import {
  CANONICAL_CONTAINER_CODES,
  canonicalContainerLabel,
  normalizeContainerTypeLabel,
} from "@/lib/containerUtils";
import { supabase } from "@/lib/supabase";
import {
  capFutureDate,
  formatSafeShipmentDate,
  latestValidPastDate,
} from "@/lib/dateUtils";
import CommandCenterEmptyState from "./CommandCenterEmptyState";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartTooltip,
  ResponsiveContainer as RechartContainer,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

const CHART_COLORS = [
  "#6366f1",
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
];

const TEU_BAR_PRIMARY = "#6366f1";
const TEU_BAR_SECONDARY = "#cbd5e1";
const CONTACT_PREVIEW_LIMIT = 6;

/**
 * Temporary frontend plan limits.
 * Final source of truth should come from Stripe/Supabase entitlements.
 */
const CONTACT_SEARCH_LIMITS_BY_PLAN: Record<string, number> = {
  free: 6,
  trial: 10,
  pro: 25,
  enterprise: 100,
};

const DEFAULT_CONTACT_SEARCH_LIMIT = CONTACT_SEARCH_LIMITS_BY_PLAN.free;

type CompanyDetailPanelProps = {
  record: CommandCenterRecord | null;
  profile: IyCompanyProfile | null;
  routeKpis: IyRouteKpis | null;
  loading: boolean;
  error: string | null;
  selectedYear?: number | null;
  onGenerateBrief?: () => void;
  onExportPDF?: () => void;
};

type ActivityPoint = {
  period: string;
  fcl: number;
  lcl: number;
};

type TableRow = Record<string, React.ReactNode>;

type NormalizedShipment = {
  source: any;
  raw: any;
  id: string;
  masterBol: string;
  houseBol: string;
  importerName: string;
  importerId: string;
  consigneeName: string;
  consigneeAddress: string;
  shipper: string;
  shipperAddress: string;
  carrierCode: string;
  carrier: string;
  forwarderCode: string;
  forwarderName: string;
  notifyParty: string;
  portOfUnladingId: string;
  portOfUnlading: string;
  portOfLadingId: string;
  portOfLading: string;
  date: string | null;
  year: number | null;
  monthIndex: number | null;
  teu: number;
  weightKg: string;
  grossWeight: string;
  volume: string;
  spend: number | null;
  loadType: "FCL" | "LCL" | "UNKNOWN";
  vessel: string;
  voyageNumber: string;
  containerNumbers: string;
  containerTypes: string;
  cargoDescription: string;
  marksAndNumbers: string;
  origin: string;
  destination: string;
  route: string;
  product: string;
  hsCode: string;
};

type DetailModel = {
  years: number[];
  selectedYear: number | null;
  filteredShipments: NormalizedShipment[];
  monthlySeries: ActivityPoint[];
  allTimeShipments: number | null;
  shipments: number;
  teu: number;
  spend: number | null;
  fclShipments: number;
  lclShipments: number;
  avgTeuPerShipment: number | null;
  avgShipmentsPerMonth: number | null;
  oldestShipmentDate: string | null;
  latestShipmentDate: string | null;
  topRouteLabel: string;
  recentRouteLabel: string;
  topRoutes: Array<{ lane: string; shipments: number; teu: number; spend: number | null }>;
  carriers: Array<{ carrier: string; shipments: number; teu: number }>;
  origins: Array<{ label: string; count: number }>;
  destinations: Array<{ label: string; count: number }>;
  hsRows: Array<{ hsCode: string; description: string; count: number }>;
  productRows: Array<{ product: string; hsCode: string; volumeShare: string }>;
  shipmentTableRows: TableRow[];
  pivotRows: TableRow[];
  containerMix: Array<{ name: string; value: number }>;
};

type FreightosBenchmark = {
  code: "FBX01" | "FBX03" | "FBX11";
  title: string;
  lane: string;
  confidence: "high" | "medium";
};

const formatNumber = (value: number | null | undefined, digits = 0) => {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: digits,
  });
};

const formatCurrency = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
};

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const FUTURE_DATE_TOLERANCE_DAYS = 2;

const isValidPastOrCurrentDate = (value?: string | null) => {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  const maxAllowed = new Date();
  maxAllowed.setDate(maxAllowed.getDate() + FUTURE_DATE_TOLERANCE_DAYS);
  return parsed.getTime() <= maxAllowed.getTime();
};

/**
 * Stricter clamp used at KPI display points only. Returns the original
 * value when it parses as a date at or before "now"; otherwise returns
 * null so the caller can render "—". Does not mutate any source data.
 *
 * Phase B.5 — delegates to the shared `capFutureDate` helper from
 * `@/lib/dateUtils` so every shipment-date render path (Search cards,
 * Command Center table, Company hero, this panel) shares one cap rule.
 * Kept as a local symbol so existing imports inside this file (which
 * already reference `capDateAtToday` at multiple points) continue to
 * work without a sweeping rename.
 */
const capDateAtToday = (value?: string | null): string | null =>
  capFutureDate(value ?? null);

const getDateTime = (value?: string | null) => {
  if (!value) return 0;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 0;
  return parsed.getTime();
};

const normalizeText = (value?: string | null) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .replace(/Ã¢â‚¬â€œ|â†’|â†|Ã†/g, " → ")
    .replace(/Ã/g, "")
    .trim();

const isMeaningfulText = (value?: string | null) => {
  const cleaned = normalizeText(value).toLowerCase();
  return Boolean(
    cleaned &&
      cleaned !== "—" &&
      cleaned !== "null" &&
      cleaned !== "undefined" &&
      cleaned !== "n/a" &&
      cleaned !== "na" &&
      cleaned !== "unknown",
  );
};

const cleanDisplayText = (value?: string | null) =>
  isMeaningfulText(value) ? normalizeText(value) : "";

const toNumber = (value: unknown): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const safeArray = (value: any): any[] => (Array.isArray(value) ? value : []);

const getRecordKey = (record: CommandCenterRecord | null) =>
  record?.company?.company_id ?? record?.company?.name ?? null;

const getNested = (obj: any, path: string[]) => {
  let current = obj;
  for (const key of path) {
    if (current == null) return undefined;
    current = current[key];
  }
  return current;
};

const pickFirst = (...values: any[]) => {
  for (const value of values) {
    if (value == null) continue;
    if (typeof value === "string" && !normalizeText(value)) continue;
    return value;
  }
  return null;
};

const getShipmentValue = (shipment: any, ...paths: string[][]) => {
  const candidates = [shipment, shipment?.raw, shipment?.raw?.shipment, shipment?.raw?.data];
  for (const candidate of candidates) {
    if (!candidate) continue;
    for (const path of paths) {
      const value = getNested(candidate, path);
      if (value != null && !(typeof value === "string" && !normalizeText(value))) {
        return value;
      }
    }
  }
  return null;
};

const normalizeCountry = (value?: string | null) => {
  const text = cleanDisplayText(value);
  if (!text) return "";
  if (text === "United States of America") return "United States";
  return text;
};

const US_STATE_MAP: Record<string, string> = {
  Alabama: "AL",
  Alaska: "AK",
  Arizona: "AZ",
  Arkansas: "AR",
  California: "CA",
  Colorado: "CO",
  Connecticut: "CT",
  Delaware: "DE",
  Florida: "FL",
  Georgia: "GA",
  Hawaii: "HI",
  Idaho: "ID",
  Illinois: "IL",
  Indiana: "IN",
  Iowa: "IA",
  Kansas: "KS",
  Kentucky: "KY",
  Louisiana: "LA",
  Maine: "ME",
  Maryland: "MD",
  Massachusetts: "MA",
  Michigan: "MI",
  Minnesota: "MN",
  Mississippi: "MS",
  Missouri: "MO",
  Montana: "MT",
  Nebraska: "NE",
  Nevada: "NV",
  "New Hampshire": "NH",
  "New Jersey": "NJ",
  "New Mexico": "NM",
  "New York": "NY",
  "North Carolina": "NC",
  "North Dakota": "ND",
  Ohio: "OH",
  Oklahoma: "OK",
  Oregon: "OR",
  Pennsylvania: "PA",
  "Rhode Island": "RI",
  "South Carolina": "SC",
  "South Dakota": "SD",
  Tennessee: "TN",
  Texas: "TX",
  Utah: "UT",
  Vermont: "VT",
  Virginia: "VA",
  Washington: "WA",
  "West Virginia": "WV",
  Wisconsin: "WI",
  Wyoming: "WY",
};

const toStateAbbreviation = (value?: string | null) => {
  const text = cleanDisplayText(value);
  if (!text) return "";
  if (text.length === 2) return text.toUpperCase();
  return US_STATE_MAP[text] || text;
};

const splitLocationParts = (value?: string | null) => {
  const text = cleanDisplayText(value);
  if (!text) {
    return { city: "", region: "", country: "" };
  }
  const parts = text
    .split(",")
    .map((part) => normalizeText(part))
    .filter(Boolean);

  if (parts.length === 1) {
    return { city: parts[0], region: "", country: "" };
  }
  if (parts.length === 2) {
    return { city: parts[0], region: "", country: parts[1] };
  }
  return {
    city: parts[0],
    region: parts[1],
    country: parts[parts.length - 1],
  };
};

const formatLocationLabel = ({
  city,
  region,
  country,
}: {
  city?: string | null;
  region?: string | null;
  country?: string | null;
}) => {
  const safeCity = cleanDisplayText(city);
  const safeRegion = cleanDisplayText(region);
  const safeCountry = normalizeCountry(country);

  if (safeCountry === "United States") {
    const state = toStateAbbreviation(safeRegion);
    if (safeCity && state) return `${safeCity}, ${state}`;
    if (safeCity) return `${safeCity}, US`;
    if (state) return state;
    return "United States";
  }

  if (safeCity && safeCountry) return `${safeCity}, ${safeCountry}`;
  if (safeCity && safeRegion) return `${safeCity}, ${safeRegion}`;
  if (safeCity) return safeCity;
  if (safeRegion && safeCountry) return `${safeRegion}, ${safeCountry}`;
  return safeCountry || safeRegion || "";
};

const normalizeLocationLabel = (value?: string | null) => {
  const parts = splitLocationParts(value);
  return formatLocationLabel(parts);
};

const isUnknownRoute = (value?: string | null) => {
  const text = normalizeText(value).toLowerCase();
  return (
    !text ||
    text === "—" ||
    text === "unknown" ||
    text === "unknown route" ||
    text.includes("unknown →") ||
    text.includes("→ unknown")
  );
};

const buildCleanRoute = (origin?: string | null, destination?: string | null) => {
  const from = normalizeLocationLabel(origin);
  const to = normalizeLocationLabel(destination);
  if (from && to) return `${from} → ${to}`;
  if (from || to) return from || to;
  return "";
};

const buildRouteLabel = (value?: string | null) => {
  const cleaned = cleanDisplayText(value);
  if (!cleaned) return "—";
  if (cleaned.includes("→")) {
    const [left, right] = cleaned.split("→");
    return buildCleanRoute(left, right);
  }
  return normalizeLocationLabel(cleaned) || cleaned;
};

const monthKey = (value?: string | null) => {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  }
  return String(value).slice(0, 7) || "Unknown";
};

const normalizeDateValue = (value: any): string | null => {
  if (!value) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const ddmmyyyy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (ddmmyyyy) {
      const [, dd, mm, yyyy] = ddmmyyyy;
      const parsed = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
      return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString();
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString();
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return null;
};

const extractDate = (shipment: any) =>
  normalizeDateValue(
    pickFirst(
      getShipmentValue(
        shipment,
        ["bill_of_lading_date"],
        ["bill_of_lading_date_formatted"],
        ["date"],
        ["arrival_date"],
        ["shipment_date"],
        ["estimated_arrival"],
      ),
      shipment?.date,
      shipment?.dateObj,
    ),
  );

const extractTeu = (shipment: any) =>
  toNumber(
    pickFirst(
      getShipmentValue(
        shipment,
        ["teu"],
        ["TEU"],
        ["container_teu"],
        ["metrics", "teu"],
        ["stats", "teu"],
      ),
      0,
    ),
  );

const extractLoadType = (shipment: any): "FCL" | "LCL" | "UNKNOWN" => {
  const lclFlag = pickFirst(
    getShipmentValue(shipment, ["lcl"], ["is_lcl"], ["lcl_flag"]),
    shipment?.lcl,
    shipment?.raw?.lcl,
  );
  if (lclFlag === true || String(lclFlag).toLowerCase() === "true") return "LCL";
  if (lclFlag === false || String(lclFlag).toLowerCase() === "false") return "FCL";

  const raw = cleanDisplayText(
    String(
      pickFirst(
        getShipmentValue(
          shipment,
          ["load_type"],
          ["loadType"],
          ["container_type"],
          ["containerType"],
          ["shipment_type"],
          ["mode"],
        ),
        "",
      ),
    ).toUpperCase(),
  );
  if (raw.includes("FCL") || raw.includes("FULL")) return "FCL";
  if (raw.includes("LCL") || raw.includes("LESS")) return "LCL";

  const teu = extractTeu(shipment);
  if (teu >= 1) return "FCL";
  if (teu > 0 && teu < 1) return "LCL";
  return "UNKNOWN";
};

const extractSpend = (shipment: any) => {
  const explicitSpend = toNumber(
    pickFirst(
      getShipmentValue(
        shipment,
        ["estSpendUsd"],
        ["est_spend_usd"],
        ["estimated_spend_usd"],
        ["spend_usd"],
        ["metrics", "spendUsd"],
      ),
      NaN,
    ),
  );
  if (explicitSpend > 0) return explicitSpend;
  const teu = extractTeu(shipment);
  if (teu <= 0) return null;
  const isLcl = extractLoadType(shipment) === "LCL";
  return teu * (isLcl ? 850 : 1850);
};

const extractCarrier = (shipment: any) =>
  cleanDisplayText(
    String(
      pickFirst(
        getShipmentValue(
          shipment,
          ["carrier"],
          ["carrier_name"],
          ["carrierName"],
          ["shipping_line"],
          ["shippingLine"],
          ["steamship_line"],
          ["steamshipLine"],
          ["vessel_operator"],
          ["vesselOperator"],
          ["line"],
          ["ocean_carrier"],
          ["ocean_carrier_name"],
          ["manifest_carrier_name"],
          ["carrier_scac"],
          ["carrier_code"],
        ),
        "",
      ),
    ),
  );

const extractProduct = (shipment: any) =>
  cleanDisplayText(
    String(
      pickFirst(
        getShipmentValue(
          shipment,
          ["Product_Description"],
          ["product_description"],
          ["description"],
          ["product_name"],
          ["commodity"],
          ["product"],
        ),
        "",
      ),
    ),
  );

const extractHsCode = (shipment: any) =>
  cleanDisplayText(
    String(
      pickFirst(
        getShipmentValue(
          shipment,
          ["HS_Code"],
          ["hsCode"],
          ["hs_code"],
          ["product_hs_code"],
          ["hs"],
        ),
        "",
      ),
    ),
  );

const extractMasterBol = (shipment: any) =>
  cleanDisplayText(
    String(
      pickFirst(
        getShipmentValue(
          shipment,
          ["master_bol_number"],
          ["masterBolNumber"],
          ["master_bill_of_lading"],
          ["bill_of_lading"],
          ["bol_number"],
          ["number"],
        ),
        "",
      ),
    ),
  );

const extractHouseBol = (shipment: any) =>
  cleanDisplayText(
    String(
      pickFirst(
        getShipmentValue(
          shipment,
          ["house_bol_number"],
          ["houseBolNumber"],
          ["house_bill_of_lading"],
          ["house_bol"],
        ),
        "",
      ),
    ),
  );

const extractImporterId = (shipment: any) =>
  cleanDisplayText(
    String(
      pickFirst(getShipmentValue(shipment, ["importer_id"], ["importerId"]), ""),
    ),
  );

const extractImporterName = (shipment: any) =>
  cleanDisplayText(
    String(
      pickFirst(
        getShipmentValue(
          shipment,
          ["importer_name"],
          ["importerName"],
          ["company_name"],
          ["companyName"],
        ),
        "",
      ),
    ),
  );

const extractConsigneeName = (shipment: any) =>
  cleanDisplayText(
    String(
      pickFirst(
        getShipmentValue(
          shipment,
          ["consignee_name"],
          ["consigneeName"],
          ["Consignee_Name"],
          ["notify_party_name"],
        ),
        "",
      ),
    ),
  );

const extractConsigneeAddress = (shipment: any) =>
  cleanDisplayText(
    String(
      pickFirst(
        getShipmentValue(
          shipment,
          ["consignee_address"],
          ["consigneeAddress"],
          ["Consignee_Address"],
        ),
        "",
      ),
    ),
  );

const extractShipperName = (shipment: any) =>
  cleanDisplayText(
    String(
      pickFirst(
        getShipmentValue(
          shipment,
          ["shipper"],
          ["shipper_name"],
          ["shipperName"],
          ["supplier_name"],
        ),
        "",
      ),
    ),
  );

const extractShipperAddress = (shipment: any) =>
  cleanDisplayText(
    String(
      pickFirst(
        getShipmentValue(
          shipment,
          ["shipper_address"],
          ["shipperAddress"],
          ["supplier_address"],
        ),
        "",
      ),
    ),
  );

const extractCarrierCode = (shipment: any) =>
  cleanDisplayText(
    String(
      pickFirst(
        getShipmentValue(
          shipment,
          ["carrier_code"],
          ["carrierCode"],
          ["carrier_scac"],
          ["Carrier_Code"],
        ),
        "",
      ),
    ),
  );

const extractForwarderCode = (shipment: any) =>
  cleanDisplayText(
    String(
      pickFirst(
        getShipmentValue(
          shipment,
          ["forwarder_scac_code"],
          ["forwarderScacCode"],
          ["forwarder_code"],
        ),
        "",
      ),
    ),
  );

const extractForwarderName = (shipment: any) =>
  cleanDisplayText(
    String(
      pickFirst(
        getShipmentValue(
          shipment,
          ["forwarder_name"],
          ["forwarderName"],
          ["forwarder"],
        ),
        "",
      ),
    ),
  );

const extractNotifyParty = (shipment: any) =>
  cleanDisplayText(
    String(
      pickFirst(
        getShipmentValue(
          shipment,
          ["notify_party"],
          ["notifyParty"],
          ["notify_party_name"],
        ),
        "",
      ),
    ),
  );

const extractPortOfUnladingId = (shipment: any) =>
  cleanDisplayText(
    String(
      pickFirst(getShipmentValue(shipment, ["port_of_unlading_id"], ["portOfUnladingId"]), ""),
    ),
  );

const extractPortOfLadingId = (shipment: any) =>
  cleanDisplayText(
    String(
      pickFirst(getShipmentValue(shipment, ["port_of_lading_id"], ["portOfLadingId"]), ""),
    ),
  );

const extractWeightKg = (shipment: any) =>
  cleanDisplayText(
    String(
      pickFirst(
        getShipmentValue(
          shipment,
          ["weight_kg"],
          ["weightKg"],
          ["weight"],
          ["gross_weight_kg"],
        ),
        "",
      ),
    ),
  );

const extractGrossWeight = (shipment: any) =>
  cleanDisplayText(
    String(
      pickFirst(
        getShipmentValue(
          shipment,
          ["gross_weight"],
          ["grossWeight"],
          ["Gross_Weight"],
        ),
        "",
      ),
    ),
  );

const extractVolume = (shipment: any) =>
  cleanDisplayText(
    String(
      pickFirst(
        getShipmentValue(
          shipment,
          ["volume"],
          ["cbm"],
          ["volume_cbm"],
          ["cubic_meters"],
        ),
        "",
      ),
    ),
  );

const extractVessel = (shipment: any) =>
  cleanDisplayText(
    String(
      pickFirst(
        getShipmentValue(
          shipment,
          ["vessel"],
          ["vessel_name"],
          ["vesselName"],
        ),
        "",
      ),
    ),
  );

const extractVoyageNumber = (shipment: any) =>
  cleanDisplayText(
    String(
      pickFirst(
        getShipmentValue(
          shipment,
          ["voyage_number"],
          ["voyageNumber"],
          ["voyage"],
        ),
        "",
      ),
    ),
  );

const extractContainerNumbers = (shipment: any) => {
  const direct = cleanDisplayText(
    String(
      pickFirst(
        getShipmentValue(
          shipment,
          ["container_numbers"],
          ["containerNumbers"],
          ["containers"],
        ),
        "",
      ),
    ),
  );
  if (direct) return direct;

  const containerArray = pickFirst(
    getShipmentValue(shipment, ["container_number_list"], ["containerNumberList"], ["container_details"]),
    [],
  );

  if (Array.isArray(containerArray)) {
    const numbers = containerArray
      .map((item) =>
        cleanDisplayText(
          item?.container_number || item?.number || item?.containerNumber || "",
        ),
      )
      .filter(Boolean);
    if (numbers.length) return numbers.join(", ");
  }

  return "";
};

const extractContainerTypes = (shipment: any) => {
  // Phase H P1 fix — upstream returns `container_type_descriptions` as
  // either a comma-joined string OR an array of short codes. Previously
  // we stringified the array (e.g. "40HC,40GP") and ran the whole thing
  // through normalizeContainerTypeLabel, which collapsed the distinct
  // types into one garbled token. Now we check for the array form first
  // and map each element through the normalizer individually.
  const rawDescriptions = pickFirst(
    getShipmentValue(
      shipment,
      ["container_type_descriptions"],
      ["containerTypeDescriptions"],
      ["container_types"],
      ["containerTypes"],
    ),
    null,
  );
  if (Array.isArray(rawDescriptions)) {
    const types = rawDescriptions
      .map((item: any) =>
        normalizeContainerTypeLabel(
          typeof item === "string"
            ? item
            : item?.container_type ||
                item?.type ||
                item?.equipment_type ||
                item?.equipmentType ||
                item?.description ||
                "",
        ),
      )
      .filter(Boolean);
    if (types.length) {
      return [...new Set(types)].join(", ");
    }
  }

  const direct = normalizeContainerTypeLabel(
    String(
      pickFirst(
        getShipmentValue(
          shipment,
          ["container_types"],
          ["containerTypes"],
          ["container_type_descriptions"],
          ["containerTypeDescriptions"],
          ["container_type"],
          ["containerType"],
          ["equipment_type"],
          ["equipmentType"],
        ),
        "",
      ),
    ),
  );
  if (direct) return direct;

  const containerArray = pickFirst(
    getShipmentValue(shipment, ["container_details"], ["containers_detail"], ["containerDetail"]),
    [],
  );

  if (Array.isArray(containerArray)) {
    const types = containerArray
      .map((item) =>
        normalizeContainerTypeLabel(
          item?.container_type ||
            item?.type ||
            item?.equipment_type ||
            item?.equipmentType ||
            "",
        ),
      )
      .filter(Boolean);
    if (types.length) {
      return [...new Set(types)].join(", ");
    }
  }

  const loadType = extractLoadType(shipment);
  if (loadType === "FCL") return "FCL";
  if (loadType === "LCL") return "LCL";
  return "";
};

const extractCargoDescription = (shipment: any) =>
  cleanDisplayText(
    String(
      pickFirst(
        getShipmentValue(
          shipment,
          ["cargo_description"],
          ["cargoDescription"],
          ["Product_Description"],
          ["description"],
          ["product_description"],
        ),
        "",
      ),
    ),
  );

const extractMarksAndNumbers = (shipment: any) =>
  cleanDisplayText(
    String(
      pickFirst(
        getShipmentValue(shipment, ["marks_and_numbers"], ["marksAndNumbers"]),
        "",
      ),
    ),
  );

const extractLocationObject = (shipment: any, kind: "origin" | "destination") => {
  const city = cleanDisplayText(
    String(
      pickFirst(
        kind === "origin"
          ? getShipmentValue(
              shipment,
              ["origin_city"],
              ["supplier_city"],
              ["port_of_lading_city"],
              ["loading_city"],
              ["pol_city"],
            )
          : getShipmentValue(
              shipment,
              ["destination_city"],
              ["company_city"],
              ["port_of_unlading_city"],
              ["discharge_city"],
              ["pod_city"],
            ),
        "",
      ),
    ),
  );

  const region = cleanDisplayText(
    String(
      pickFirst(
        kind === "origin"
          ? getShipmentValue(
              shipment,
              ["origin_state"],
              ["origin_region"],
              ["supplier_state"],
              ["supplier_region"],
              ["port_of_lading_state"],
              ["port_of_lading_region"],
            )
          : getShipmentValue(
              shipment,
              ["destination_state"],
              ["destination_region"],
              ["company_state"],
              ["company_region"],
              ["port_of_unlading_state"],
              ["port_of_unlading_region"],
            ),
        "",
      ),
    ),
  );

  const country = cleanDisplayText(
    String(
      pickFirst(
        kind === "origin"
          ? getShipmentValue(
              shipment,
              ["origin_country"],
              ["origin_country_name"],
              ["supplier_address_country"],
              ["port_of_lading_country"],
            )
          : getShipmentValue(
              shipment,
              ["destination_country"],
              ["destination_country_name"],
              ["company_address_country"],
              ["port_of_unlading_country"],
            ),
        "",
      ),
    ),
  );

  return { city, region, country };
};

const extractPortOfLading = (shipment: any) => {
  const loc = extractLocationObject(shipment, "origin");
  const formatted = formatLocationLabel(loc);
  if (formatted) return formatted;

  return normalizeLocationLabel(
    String(
      pickFirst(
        getShipmentValue(
          shipment,
          ["port_of_lading_name"],
          ["portOfLadingName"],
          ["port_of_lading"],
          ["origin_port"],
          ["origin_port_name"],
          ["loading_port"],
          ["pol"],
        ),
        "",
      ),
    ),
  );
};

const extractPortOfUnlading = (shipment: any) => {
  const loc = extractLocationObject(shipment, "destination");
  const formatted = formatLocationLabel(loc);
  if (formatted) return formatted;

  return normalizeLocationLabel(
    String(
      pickFirst(
        getShipmentValue(
          shipment,
          ["port_of_unlading_name"],
          ["portOfUnladingName"],
          ["port_of_unlading"],
          ["destination_port"],
          ["destination_port_name"],
          ["discharge_port"],
          ["pod"],
          ["place_of_delivery"],
        ),
        "",
      ),
    ),
  );
};

const extractOrigin = (shipment: any) => extractPortOfLading(shipment);

const extractDestination = (shipment: any) => extractPortOfUnlading(shipment);

const deriveRouteFromShipment = (shipment?: any) => {
  if (!shipment) return null;
  const origin = extractOrigin(shipment);
  const destination = extractDestination(shipment);
  return buildCleanRoute(origin, destination);
};

const normalizeShipment = (shipment: any, index: number): NormalizedShipment => {
  const date = extractDate(shipment);
  const parsedDate = date ? new Date(date) : null;
  const year = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.getFullYear() : null;
  const monthIndex =
    parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.getMonth() : null;

  const origin = extractOrigin(shipment) || "—";
  const destination = extractDestination(shipment) || "—";

  const route = buildRouteLabel(
    pickFirst(
      getShipmentValue(shipment, ["route"], ["lane"], ["trade_lane"]),
      origin !== "—" || destination !== "—" ? `${origin} → ${destination}` : null,
    ) as string | null,
  );

  return {
    source: shipment,
    raw: shipment?.raw ?? shipment ?? null,
    id: String(
      pickFirst(
        getShipmentValue(shipment, ["bill_of_lading"], ["bol_id"], ["id"], ["number"]),
        `shipment-${index}`,
      ),
    ),
    masterBol: extractMasterBol(shipment) || "—",
    houseBol: extractHouseBol(shipment) || "—",
    importerName: extractImporterName(shipment) || "—",
    importerId: extractImporterId(shipment) || "—",
    consigneeName: extractConsigneeName(shipment) || "—",
    consigneeAddress: extractConsigneeAddress(shipment) || "—",
    shipper: extractShipperName(shipment) || "—",
    shipperAddress: extractShipperAddress(shipment) || "—",
    carrierCode: extractCarrierCode(shipment) || "—",
    carrier: extractCarrier(shipment) || "—",
    forwarderCode: extractForwarderCode(shipment) || "—",
    forwarderName: extractForwarderName(shipment) || "—",
    notifyParty: extractNotifyParty(shipment) || "—",
    portOfUnladingId: extractPortOfUnladingId(shipment) || "—",
    portOfUnlading: extractPortOfUnlading(shipment) || destination || "—",
    portOfLadingId: extractPortOfLadingId(shipment) || "—",
    portOfLading: extractPortOfLading(shipment) || origin || "—",
    date: typeof date === "string" ? date : null,
    year,
    monthIndex,
    teu: extractTeu(shipment),
    weightKg: extractWeightKg(shipment) || "—",
    grossWeight: extractGrossWeight(shipment) || "—",
    volume: extractVolume(shipment) || "—",
    spend: extractSpend(shipment),
    loadType: extractLoadType(shipment),
    vessel: extractVessel(shipment) || "—",
    voyageNumber: extractVoyageNumber(shipment) || "—",
    containerNumbers: extractContainerNumbers(shipment) || "—",
    containerTypes: extractContainerTypes(shipment) || "—",
    cargoDescription: extractCargoDescription(shipment) || "—",
    marksAndNumbers: extractMarksAndNumbers(shipment) || "—",
    origin,
    destination,
    route,
    product: extractProduct(shipment) || "—",
    hsCode: extractHsCode(shipment) || "—",
  };
};

const groupTop = <T extends string>(
  values: T[],
  top = 8,
): Array<{ label: string; count: number }> => {
  const map = new Map<string, number>();
  values.forEach((value) => {
    const label = normalizeText(value);
    if (!label || label === "—") return;
    map.set(label, (map.get(label) || 0) + 1);
  });
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, top);
};

const aggregateCarrierRows = (shipments: NormalizedShipment[]) => {
  const map = new Map<string, { shipments: number; teu: number }>();
  shipments.forEach((shipment) => {
    if (!shipment.carrier || shipment.carrier === "—") return;
    const current = map.get(shipment.carrier) || { shipments: 0, teu: 0 };
    current.shipments += 1;
    current.teu += shipment.teu;
    map.set(shipment.carrier, current);
  });

  return [...map.entries()]
    .map(([carrier, stats]) => ({ carrier, shipments: stats.shipments, teu: stats.teu }))
    .sort((a, b) => b.shipments - a.shipments || b.teu - a.teu)
    .slice(0, 10);
};

/**
 * Canonical lane row consumed by both the Trade Lanes table/globe and the
 * hero's Top/Recent route pills.
 *
 * `resolvable` = both endpoints resolve through `resolveEndpoint`. Only
 * resolvable rows feed the globe arc array. Non-resolvable real-name rows
 * (e.g. "Chengalpattu district, India → United States of America") still
 * render in the table — they're not "Unknown".
 */
type SafeLane = {
  lane: string;
  shipments: number;
  teu: number;
  spend: number | null;
  resolvable: boolean;
};

const looksLikeRealLane = (label: string) => {
  if (!label) return false;
  const cleaned = label.trim();
  if (!cleaned || cleaned === "—") return false;
  if (isUnknownRoute(cleaned)) return false;
  // Reject if either side is the literal "Unknown".
  const parts = cleaned.split(/→|->|>/).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return false;
  return !parts.some((part) => /^unknown$/i.test(part));
};

const dedupeLanes = (rows: SafeLane[]): SafeLane[] => {
  const map = new Map<string, SafeLane>();
  rows.forEach((row) => {
    const key = row.lane.toLowerCase();
    const existing = map.get(key);
    if (!existing) {
      map.set(key, row);
      return;
    }
    map.set(key, {
      lane: existing.lane,
      shipments: Math.max(existing.shipments, row.shipments),
      teu: Math.max(existing.teu, row.teu),
      spend: existing.spend ?? row.spend,
      resolvable: existing.resolvable || row.resolvable,
    });
  });
  return [...map.values()];
};

/**
 * Build a single canonical lane list for the Trade Lanes panel + the hero
 * pills. Priority chain: detail.topRoutes → routeKpis.topRoutesLast12m →
 * synthesised single rows from KPI fields → profile fallbacks → BOL
 * aggregation. Each row is filtered through `looksLikeRealLane`. Resolvable
 * rows are surfaced first so the globe arc still picks the strongest
 * resolvable lane even when raw-name lanes outrank it numerically.
 */
const safeRouteList = (
  detail: { topRoutes: Array<{ lane: string; shipments: number; teu: number; spend: number | null }> },
  routeKpis: any,
  profile: any,
  normalizedShipments: NormalizedShipment[],
): SafeLane[] => {
  const collected: SafeLane[] = [];

  const pushLane = (
    rawLane: string | null | undefined,
    stats?: { shipments?: number; teu?: number; spend?: number | null },
  ) => {
    const lane = buildRouteLabel(rawLane);
    if (!looksLikeRealLane(lane)) return;
    const parts = lane.split(/→|->|>/).map((s) => s.trim());
    const fromMeta = resolveEndpoint(parts[0]);
    const toMeta = resolveEndpoint(parts[1]);
    collected.push({
      lane,
      shipments: Math.max(0, Number(stats?.shipments ?? 0) || 0),
      teu: Math.max(0, Number(stats?.teu ?? 0) || 0),
      spend: stats?.spend ?? null,
      resolvable: Boolean(fromMeta && toMeta),
    });
  };

  // 1. Already-built detail.topRoutes from buildDetailModel.
  detail.topRoutes.forEach((row) =>
    pushLane(row.lane, { shipments: row.shipments, teu: row.teu, spend: row.spend }),
  );

  // 2. routeKpis.topRoutesLast12m raw rows.
  safeArray(routeKpis?.topRoutesLast12m).forEach((row: any) =>
    pushLane(row?.route || row?.lane, {
      shipments: toNumber(row?.shipments),
      teu: toNumber(row?.teu),
      spend: toNumber(pickFirst(row?.estSpendUsd, row?.estSpendUsd12m)) || null,
    }),
  );

  // 3. Synthesised single-row from `topRouteLast12m` / `mostRecentRoute`.
  pushLane(routeKpis?.topRouteLast12m);
  pushLane(routeKpis?.mostRecentRoute);

  // 4. Profile-level fallbacks.
  pushLane(profile?.topRouteLast12m);
  pushLane(profile?.top_route);
  pushLane(profile?.kpis?.top_route_12m);
  pushLane(profile?.mostRecentRoute);
  pushLane(profile?.recent_route);
  pushLane(profile?.kpis?.recent_route);

  safeArray(profile?.topRoutes).forEach((row: any) =>
    pushLane(row?.label || row?.route, {
      shipments: toNumber(row?.shipments),
      teu: toNumber(row?.teu),
      spend: toNumber(row?.estSpendUsd) || null,
    }),
  );

  // 5. Aggregate from raw recent_bols (origin + destination pairs).
  const bolRows = safeArray(
    profile?.recent_bols || profile?.recentBols || profile?.bols,
  );
  const bolMap = new Map<string, { shipments: number; teu: number }>();
  bolRows.forEach((shipment: any) => {
    const origin = pickFirst(
      shipment?.origin,
      shipment?.port_of_lading,
      shipment?.portOfLading,
      shipment?.port_of_origin,
      shipment?.shipper_country,
    );
    const dest = pickFirst(
      shipment?.destination,
      shipment?.port_of_unlading,
      shipment?.portOfUnlading,
      shipment?.port_of_destination,
      shipment?.consignee_country,
    );
    const lane = buildCleanRoute(
      typeof origin === "string" ? origin : null,
      typeof dest === "string" ? dest : null,
    );
    if (!looksLikeRealLane(lane)) return;
    const current = bolMap.get(lane) || { shipments: 0, teu: 0 };
    current.shipments += 1;
    current.teu += toNumber(pickFirst(shipment?.teu, shipment?.TEU));
    bolMap.set(lane, current);
  });
  bolMap.forEach((stats, lane) =>
    pushLane(lane, { shipments: stats.shipments, teu: stats.teu }),
  );

  // 6. Aggregate from normalisedShipments (origin/destination strings).
  const shipMap = new Map<string, { shipments: number; teu: number }>();
  normalizedShipments.forEach((shipment) => {
    if (!looksLikeRealLane(shipment.route)) return;
    const current = shipMap.get(shipment.route) || { shipments: 0, teu: 0 };
    current.shipments += 1;
    current.teu += shipment.teu;
    shipMap.set(shipment.route, current);
  });
  shipMap.forEach((stats, lane) =>
    pushLane(lane, { shipments: stats.shipments, teu: stats.teu }),
  );

  const deduped = dedupeLanes(collected);

  // Resolvable lanes win the sort tiebreak so the globe-eligible lane
  // ranks first when shipment counts are equal. Non-resolvable real-name
  // lanes still surface (they go to the table even if not the globe).
  return deduped.sort((a, b) => {
    if (a.resolvable !== b.resolvable) return a.resolvable ? -1 : 1;
    if (b.shipments !== a.shipments) return b.shipments - a.shipments;
    return b.teu - a.teu;
  });
};

const aggregateRouteRows = (shipments: NormalizedShipment[]) => {
  const map = new Map<string, { shipments: number; teu: number; spend: number }>();
  shipments.forEach((shipment) => {
    if (!shipment.route || shipment.route === "—" || isUnknownRoute(shipment.route)) return;
    const current = map.get(shipment.route) || { shipments: 0, teu: 0, spend: 0 };
    current.shipments += 1;
    current.teu += shipment.teu;
    current.spend += shipment.spend ?? 0;
    map.set(shipment.route, current);
  });

  return [...map.entries()]
    .map(([lane, stats]) => ({
      lane,
      shipments: stats.shipments,
      teu: stats.teu,
      spend: stats.spend > 0 ? stats.spend : null,
    }))
    .sort((a, b) => b.shipments - a.shipments || b.teu - a.teu)
    .slice(0, 10);
};

const aggregateContainerMix = (shipments: NormalizedShipment[]) => {
  const map = new Map<string, number>();

  shipments.forEach((shipment) => {
    const rawTypes = shipment.containerTypes
      .split(",")
      .map((item) => normalizeContainerTypeLabel(item))
      .filter(Boolean);

    if (rawTypes.length) {
      rawTypes.forEach((type) => {
        map.set(type, (map.get(type) || 0) + 1);
      });
    }
    // No FCL/LCL loadType fallback — container mix shows equipment labels only
  });

  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
};

function aggregateCanonicalContainerMix(
  shipments: NormalizedShipment[],
): Array<{ code: string; count: number; details: string[] }> {
  const map = new Map<string, { count: number; details: Set<string> }>();

  for (const shipment of shipments) {
    const parts = String(shipment.containerTypes || "")
      .split(",")
      .map((piece) => piece.trim())
      .filter(Boolean);

    for (const part of parts) {
      const { code, detail } = canonicalContainerLabel(part);
      if (!code) continue;
      const entry = map.get(code) || { count: 0, details: new Set<string>() };
      entry.count += 1;
      if (detail && detail !== code) entry.details.add(detail);
      map.set(code, entry);
    }
  }

  return [...map.entries()]
    .map(([code, { count, details }]) => ({
      code,
      count,
      details: [...details].slice(0, 5),
    }))
    .sort((a, b) => {
      // Keep canonical codes first, then anything else by count desc.
      const aCanonical = (CANONICAL_CONTAINER_CODES as readonly string[]).includes(a.code);
      const bCanonical = (CANONICAL_CONTAINER_CODES as readonly string[]).includes(b.code);
      if (aCanonical !== bCanonical) return aCanonical ? -1 : 1;
      return b.count - a.count;
    });
}

const getAvailableYears = (
  shipments: NormalizedShipment[],
  profile?: IyCompanyProfile | null,
  routeKpis?: IyRouteKpis | null,
) => {
  const years = new Set<number>();
  shipments.forEach((shipment) => {
    if (shipment.year) years.add(shipment.year);
  });

  safeArray((profile as any)?.timeSeries).forEach((point: any) => {
    const rawValue = pickFirst(point?.year, point?.month, point?.date, point?.monthLabel);
    if (!rawValue) return;
    const parsed = new Date(String(rawValue));
    if (!Number.isNaN(parsed.getTime())) years.add(parsed.getFullYear());
    const match = String(rawValue).match(/\b(20\d{2})\b/);
    if (match) years.add(Number(match[1]));
  });

  safeArray((routeKpis as any)?.monthlySeries).forEach((point: any) => {
    const rawValue = pickFirst(point?.year, point?.month, point?.monthLabel);
    if (!rawValue) return;
    const parsed = new Date(String(rawValue));
    if (!Number.isNaN(parsed.getTime())) years.add(parsed.getFullYear());
    const match = String(rawValue).match(/\b(20\d{2})\b/);
    if (match) years.add(Number(match[1]));
  });

  return [...years].sort((a, b) => b - a);
};

const getStatusLabel = (shipments: number, teu: number) => {
  if (shipments >= 50 || teu >= 100) return "High volume shipper";
  if (shipments >= 20 || teu >= 40) return "Active shipper";
  return "Tracked account";
};

const getContactFullName = (contact: any) => {
  const firstName = contact.firstName || contact.first_name || contact.given_name || "";
  const lastName = contact.lastName || contact.last_name || contact.family_name || "";

  return (
    `${firstName} ${lastName}`.trim() ||
    contact.full_name ||
    contact.name ||
    contact.fullName ||
    "Unknown contact"
  );
};

const getContactTitle = (contact: any) =>
  contact.title || contact.role || contact.position || contact.jobTitle || "";

// Phase B.6 — broaden field mappers to cover every Lusha / generic
// provider response shape we've observed. Previously we only checked
// `email` / `email_address`, which left valid emails (e.g. `work_email`,
// `emails: [...]` arrays) reading as missing on the UI.
const getContactEmail = (contact: any) =>
  contact?.email ||
  contact?.email_address ||
  contact?.emailAddress ||
  contact?.work_email ||
  contact?.businessEmail ||
  (Array.isArray(contact?.emails) ? contact.emails[0] : "") ||
  "";

const getContactPhone = (contact: any) =>
  contact?.phone ||
  contact?.phone_number ||
  contact?.phoneNumber ||
  contact?.directDial ||
  contact?.work_phone ||
  contact?.mobile_phone ||
  (Array.isArray(contact?.phones) ? contact.phones[0] : "") ||
  "";

const getContactLinkedIn = (contact: any) =>
  contact?.linkedin ||
  contact?.linkedinUrl ||
  contact?.linkedin_url ||
  contact?.linkedInUrl ||
  contact?.profileUrl ||
  contact?.url ||
  contact?.social?.linkedin ||
  "";

/**
 * Phase B.6 — explicit predicate for "this contact has zero contact-method
 * fields". Used to render the "Details require enrichment." copy under the
 * title for shallow-Lusha records where only name+title made it through.
 * Honest signal: the user can see we found a person but not their reach
 * details, and we don't pretend with empty <a> tags or empty pills.
 */
const contactHasNoDetails = (contact: any): boolean => {
  return !getContactEmail(contact) && !getContactPhone(contact) && !getContactLinkedIn(contact);
};

/**
 * Phase B.3 — strict verification gate. Returns true ONLY when an upstream
 * provider explicitly flagged the contact's email as verified. Falsy /
 * absent fields all collapse to false so we don't slap a green "Verified"
 * pill on every Lusha row by default. Anything else renders as "Found".
 */
const isContactVerified = (contact: any): boolean => {
  if (!contact) return false;
  if (contact.email_verified === true) return true;
  if (contact.source_provider_verified === true) return true;
  const status = String(contact.email_status || "").toLowerCase().trim();
  return status === "verified";
};

  const getContactLocation = (contact: any) =>
  contact.location ||
  [contact.city, contact.state, contact.country].filter(Boolean).join(", ") ||
  "";

const getContactAvatarUrl = (contact: any) =>
  contact.photo_url ||
  contact.photoUrl ||
  contact.profile_image_url ||
  contact.profileImageUrl ||
  contact.avatar_url ||
  contact.avatarUrl ||
  contact.image_url ||
  contact.imageUrl ||
  contact.picture ||
  contact.pictureUrl ||
  contact.raw_contact?.photo_url ||
  contact.raw_contact?.photoUrl ||
  contact.raw_contact?.profile_image_url ||
  contact.raw_contact?.profileImageUrl ||
  "";

const getContactSearchText = (contact: any) =>
  [
    getContactFullName(contact),
    getContactTitle(contact),
    getContactEmail(contact),
    getContactPhone(contact),
    getContactLocation(contact),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const isTargetContact = (contact: any) => {
  const title = getContactTitle(contact).toLowerCase();

  if (!title) return true;

  const targetTerms = [
    "supply chain",
    "logistics",
    "procurement",
    "operations",
    "transportation",
    "import",
    "export",
    "global sourcing",
    "distribution",
    "warehouse",
    "fulfillment",
    "shipping",
    "trade compliance",
  ];

  return targetTerms.some((term) => title.includes(term));
};

const normalizeReturnedContacts = (contacts: any[]) => {
  const seen = new Set<string>();

  return contacts
    .filter(Boolean)
    .filter(isTargetContact)
    .filter((contact) => {
      const key = [
        getContactEmail(contact),
        getContactLinkedIn(contact),
        getContactFullName(contact),
        getContactTitle(contact),
      ]
        .filter(Boolean)
        .join("|")
        .toLowerCase();

      if (!key) return false;
      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    });
};

const detectFreightosBenchmark = ({
  topRoute,
  recentRoute,
  topRoutes,
  shipments,
}: {
  topRoute?: string | null;
  recentRoute?: string | null;
  topRoutes?: Array<{ lane: string; shipments: number }>;
  shipments?: NormalizedShipment[];
}): FreightosBenchmark | null => {
  const candidates = [
    topRoute,
    recentRoute,
    ...(topRoutes || []).map((route) => route.lane),
    ...(shipments || []).slice(0, 40).map((shipment) => shipment.route),
  ]
    .map((item) => cleanDisplayText(item))
    .filter(Boolean)
    .join(" | ")
    .toLowerCase();

  if (!candidates) return null;

  const eastAsiaHit =
    candidates.includes("china") ||
    candidates.includes("east asia") ||
    candidates.includes("shanghai") ||
    candidates.includes("ningbo") ||
    candidates.includes("shenzhen") ||
    candidates.includes("xiamen") ||
    candidates.includes("yantian") ||
    candidates.includes("huanghe") ||
    candidates.includes("bangkok") ||
    candidates.includes("ho chi minh") ||
    candidates.includes("hong kong") ||
    candidates.includes("busan");

  if (!eastAsiaHit) return null;

  const westCoastHit =
    candidates.includes("los angeles") ||
    candidates.includes("long beach") ||
    candidates.includes("oakland") ||
    candidates.includes("seattle") ||
    candidates.includes("tacoma") ||
    candidates.includes("west coast");

  if (westCoastHit) {
    return {
      code: "FBX01",
      title: "Market Rate Benchmark",
      lane: "China/East Asia → North America West Coast",
      confidence: "high",
    };
  }

  const eastCoastHit =
    candidates.includes("new york") ||
    candidates.includes("newark") ||
    candidates.includes("savannah") ||
    candidates.includes("norfolk") ||
    candidates.includes("charleston") ||
    candidates.includes("miami") ||
    candidates.includes("houston") ||
    candidates.includes("montvale") ||
    candidates.includes("englewood cliffs") ||
    candidates.includes("new jersey") ||
    candidates.includes("east coast");

  if (eastCoastHit) {
    return {
      code: "FBX03",
      title: "Market Rate Benchmark",
      lane: "China/East Asia → North America East Coast",
      confidence: "high",
    };
  }

  const europeHit =
    candidates.includes("north europe") ||
    candidates.includes("northern europe") ||
    candidates.includes("rotterdam") ||
    candidates.includes("hamburg") ||
    candidates.includes("antwerp") ||
    candidates.includes("bremerhaven") ||
    candidates.includes("felixstowe");

  if (europeHit) {
    return {
      code: "FBX11",
      title: "Market Rate Benchmark",
      lane: "China/East Asia → North Europe",
      confidence: "high",
    };
  }

  return null;
};

const InfoChip = ({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
}) => (
  <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
    <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
    <span className="truncate">{label}</span>
  </span>
);

/**
 * Phase B.4 — SmallMetric now supports an `emptyHint`. When set AND the
 * passed `value` is null/undefined/empty/em-dash, the card renders the hint
 * as a small italic explanatory line ("Not enough history") instead of a
 * bare em-dash. Card chrome is unchanged so the row never shifts.
 */
const SmallMetric = ({
  label,
  value,
  icon: Icon,
  emptyHint,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  emptyHint?: string;
}) => {
  const isEmpty =
    value == null ||
    value === "" ||
    value === "—" ||
    (typeof value === "string" && value.trim() === "—");
  return (
    <div className="min-h-[96px] rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
        <Icon className="h-3.5 w-3.5 text-indigo-500" />
        <span>{label}</span>
      </div>
      {isEmpty && emptyHint ? (
        <div className="mt-2 text-sm italic text-slate-500">{emptyHint}</div>
      ) : (
        <div className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
          {isEmpty ? "—" : value}
        </div>
      )}
    </div>
  );
};

const MetricList = ({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; value: React.ReactNode; meta?: React.ReactNode }>;
}) => (
  <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">
      {title}
    </div>
    <div className="space-y-3">
      {items.length ? (
        items.map((item) => (
          <div
            key={String(item.label)}
            className="flex items-start justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900">{item.label}</div>
              {item.meta ? <div className="mt-1 text-xs text-slate-500">{item.meta}</div> : null}
            </div>
            <div className="shrink-0 text-sm font-semibold text-indigo-600">{item.value}</div>
          </div>
        ))
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
          No data available yet.
        </div>
      )}
    </div>
  </div>
);

const DataTable = ({
  title,
  columns,
  rows,
}: {
  title: string;
  columns: string[];
  rows: TableRow[];
}) => (
  <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">{title}</div>
      <div className="text-xs text-slate-400">{rows.length} rows</div>
    </div>
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-xs uppercase tracking-[0.18em] text-slate-500">
            {columns.map((column) => (
              <th key={column} className="px-3 py-3 font-semibold">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, index) => (
              <tr key={index} className="border-b border-slate-50 last:border-b-0">
                {columns.map((column) => (
                  <td key={column} className="px-3 py-3 align-top text-slate-700">
                    {row[column] ?? "—"}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-sm text-slate-500">
                No data available yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
);

const parseYearFromPoint = (point: any): number | null => {
  const explicitYear = toNumber(point?.year);
  if (explicitYear >= 2000) return explicitYear;
  const rawValue = String(
    pickFirst(point?.month, point?.monthLabel, point?.period, point?.date, point?.label, ""),
  );
  const match = rawValue.match(/\b(20\d{2})\b/);
  if (match) return Number(match[1]);
  const parsed = new Date(rawValue);
  if (!Number.isNaN(parsed.getTime())) return parsed.getFullYear();
  return null;
};

const getPointShipmentCount = (point: any) => {
  const direct = toNumber(
    pickFirst(
      point?.shipments,
      point?.totalShipments,
      point?.shipmentCount,
      point?.count,
      0,
    ),
  );

  if (direct > 0) return direct;

  const fcl =
    toNumber(point?.fclShipments) +
    toNumber(point?.shipmentsFcl) +
    toNumber(point?.fcl) +
    toNumber(point?.fclCount);

  const lcl =
    toNumber(point?.lclShipments) +
    toNumber(point?.shipmentsLcl) +
    toNumber(point?.lcl) +
    toNumber(point?.lclCount);

  return fcl + lcl;
};

const buildDetailModel = (
  normalizedShipments: NormalizedShipment[],
  selectedYear: number | null,
  rawProfile: any,
  rawRouteKpis: any,
): DetailModel => {
  const parseSeriesMonthIndex = (point: any) => {
    const rawValue = String(
      pickFirst(point?.month, point?.monthLabel, point?.period, point?.date, point?.label, ""),
    );
    if (/^\d{4}-\d{2}$/.test(rawValue)) return Number(rawValue.slice(5, 7)) - 1;
    if (/^\d{4}-\d{2}-\d{2}/.test(rawValue)) return Number(rawValue.slice(5, 7)) - 1;
    const parsed = new Date(rawValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed.getMonth();
  };

  const parseSeriesYear = (point: any) => {
    const explicitYear = toNumber(point?.year);
    if (explicitYear) return explicitYear;
    const rawValue = String(
      pickFirst(point?.month, point?.monthLabel, point?.period, point?.date, point?.label, ""),
    );
    const match = rawValue.match(/\b(20\d{2})\b/);
    if (match) return Number(match[1]);
    const parsed = new Date(rawValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed.getFullYear();
  };

  const normalizeSeriesPoint = (point: any) => ({
    year: parseSeriesYear(point),
    monthIndex: parseSeriesMonthIndex(point),
    shipments: toNumber(pickFirst(point?.shipments, point?.totalShipments, point?.shipmentCount, point?.count)),
    fclShipments: toNumber(pickFirst(point?.fclShipments, point?.shipmentsFcl, point?.fcl, point?.fclCount)),
    lclShipments: toNumber(pickFirst(point?.lclShipments, point?.shipmentsLcl, point?.lcl, point?.lclCount)),
    teu: toNumber(pickFirst(point?.teu, point?.totalTeu, point?.teus)),
    estSpendUsd: toNumber(pickFirst(point?.estSpendUsd, point?.est_spend_usd, point?.spendUsd, point?.spend)),
  });

  const profileSeries = safeArray(rawProfile?.timeSeries)
    .map(normalizeSeriesPoint)
    .filter((point) => (selectedYear ? point.year === selectedYear : true));

  const routeSeries = safeArray(rawRouteKpis?.monthlySeries)
    .map(normalizeSeriesPoint)
    .filter((point) => (selectedYear ? point.year === selectedYear : true));

  // Prefer profileSeries (authoritative normalized data) when it has year-scoped data;
  // fall back to routeSeries only when profileSeries is empty for the selected year.
  const activeSeries = profileSeries.length > 0 ? profileSeries : routeSeries;

  const filteredShipments = selectedYear
    ? normalizedShipments.filter((shipment) => shipment.year === selectedYear)
    : normalizedShipments;

  const monthMap = new Map<number, { period: string; fcl: number; lcl: number }>();

  if (activeSeries.length) {
    activeSeries.forEach((point) => {
      if (point.monthIndex == null || point.monthIndex < 0 || point.monthIndex > 11) return;
      const label = new Date(2000, point.monthIndex, 1).toLocaleDateString(undefined, {
        month: "short",
      });
      const current = monthMap.get(point.monthIndex) || { period: label, fcl: 0, lcl: 0 };
      const fcl = toNumber(point.fclShipments);
      const lcl = toNumber(point.lclShipments);
      const shipments = toNumber(point.shipments);
      current.fcl += fcl;
      current.lcl += lcl;
      if (fcl + lcl === 0 && shipments > 0) current.fcl += shipments;
      monthMap.set(point.monthIndex, current);
    });
  } else {
    filteredShipments.forEach((shipment) => {
      if (shipment.monthIndex == null || shipment.monthIndex < 0 || shipment.monthIndex > 11) return;
      const label = new Date(2000, shipment.monthIndex, 1).toLocaleDateString(undefined, {
        month: "short",
      });
      const current = monthMap.get(shipment.monthIndex) || { period: label, fcl: 0, lcl: 0 };
      if (shipment.loadType === "LCL") current.lcl += 1;
      else current.fcl += 1;
      monthMap.set(shipment.monthIndex, current);
    });
  }

  const monthlySeries = [...monthMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, value]) => value);

  const seriesShipments = activeSeries.reduce((sum, point) => {
    const shipments = toNumber(point.shipments);
    if (shipments > 0) return sum + shipments;
    return sum + toNumber(point.fclShipments) + toNumber(point.lclShipments);
  }, 0);

  const seriesTeu = activeSeries.reduce((sum, point) => sum + toNumber(point.teu), 0);
  const seriesSpend = activeSeries.reduce((sum, point) => sum + toNumber(point.estSpendUsd), 0);
  const seriesFcl = activeSeries.reduce((sum, point) => sum + toNumber(point.fclShipments), 0);
  const seriesLcl = activeSeries.reduce((sum, point) => sum + toNumber(point.lclShipments), 0);

  const shipmentCount = filteredShipments.length;
  const shipmentTeu = filteredShipments.reduce((sum, shipment) => sum + shipment.teu, 0);
  const directSpend = filteredShipments.reduce((sum, shipment) => sum + (shipment.spend ?? 0), 0);
  const inferredFclCount = filteredShipments.filter((shipment) => shipment.loadType === "FCL").length;
  const inferredLclCount = filteredShipments.filter((shipment) => shipment.loadType === "LCL").length;

  const fallbackShipments = toNumber(
    pickFirst(
      rawRouteKpis?.shipmentsLast12m,
      rawProfile?.shipmentsLast12m,
      rawProfile?.shipments_last_12m,
      rawProfile?.totalShipments,
    ),
  );

  const fallbackTeu = toNumber(
    pickFirst(rawRouteKpis?.teuLast12m, rawProfile?.teuLast12m, rawProfile?.teu_last_12m),
  );

  const fallbackSpend = toNumber(
    pickFirst(
      rawRouteKpis?.estSpendUsd12m,
      rawRouteKpis?.estSpendUsd,
      rawProfile?.estSpendUsd12m,
      rawProfile?.estSpendUsd,
      rawProfile?.marketSpend,
      rawProfile?.est_spend,
    ),
  );

  const fallbackFcl = toNumber(
    pickFirst(
      rawProfile?.containers?.fclShipments12m,
      rawProfile?.containers?.fcl,
      safeArray(rawProfile?.containersLoad).find(
        (item: any) => String(item?.load_type || "").toUpperCase() === "FCL",
      )?.shipments,
      rawProfile?.fcl_shipments_12m,
    ),
  );

  const fallbackLcl = toNumber(
    pickFirst(
      rawProfile?.containers?.lclShipments12m,
      rawProfile?.containers?.lcl,
      safeArray(rawProfile?.containersLoad).find(
        (item: any) => String(item?.load_type || "").toUpperCase() === "LCL",
      )?.shipments,
      rawProfile?.lcl_shipments_12m,
    ),
  );

  const shipments = seriesShipments > 0 ? seriesShipments : shipmentCount > 0 ? shipmentCount : fallbackShipments;
  const teu = seriesTeu > 0 ? seriesTeu : shipmentTeu > 0 ? shipmentTeu : fallbackTeu;
  const spend =
    seriesSpend > 0 ? seriesSpend : fallbackSpend > 0 ? fallbackSpend : directSpend > 0 ? directSpend : null;
  const fclShipments = seriesFcl > 0 ? seriesFcl : fallbackFcl > 0 ? fallbackFcl : inferredFclCount;
  const lclShipments = seriesLcl > 0 ? seriesLcl : fallbackLcl > 0 ? fallbackLcl : inferredLclCount;

  const validDatedShipments = filteredShipments.filter((shipment) =>
    isValidPastOrCurrentDate(shipment.date),
  );

  const sortedByDate = [...validDatedShipments].sort(
    (a, b) => getDateTime(a.date) - getDateTime(b.date),
  );

  const profileLatestDate = normalizeDateValue(
    pickFirst(rawProfile?.lastShipmentDate, rawProfile?.last_shipment_date),
  );

  const safeProfileLatestDate = isValidPastOrCurrentDate(profileLatestDate)
    ? profileLatestDate
    : null;

  let topRoutes = safeArray(rawRouteKpis?.topRoutesLast12m)
    .map((route: any) => ({
      lane: buildRouteLabel(route?.route || route?.lane),
      shipments: toNumber(route?.shipments),
      teu: toNumber(route?.teu),
      spend: toNumber(pickFirst(route?.estSpendUsd, route?.estSpendUsd12m)) || null,
    }))
    .filter((row: any) => row.lane && row.lane !== "—" && !isUnknownRoute(row.lane));

  if (!topRoutes.length) topRoutes = aggregateRouteRows(filteredShipments);

  if (!topRoutes.length) {
    topRoutes = safeArray(rawProfile?.topRoutes)
      .map((route: any) => ({
        lane: buildRouteLabel(route?.label || route?.route),
        shipments: toNumber(route?.shipments),
        teu: toNumber(route?.teu),
        spend: toNumber(route?.estSpendUsd) || null,
      }))
      .filter((row: any) => row.lane && row.lane !== "—" && !isUnknownRoute(row.lane));
  }

  topRoutes = topRoutes.sort((a, b) => b.shipments - a.shipments || b.teu - a.teu).slice(0, 10);

  let carriers = aggregateCarrierRows(filteredShipments).filter((item) => isMeaningfulText(item.carrier));

  if (!carriers.length) {
    const carrierCounts = new Map<string, { shipments: number; teu: number }>();
    filteredShipments.forEach((shipment) => {
      const rawCarrier = cleanDisplayText(
        String(
          pickFirst(
            shipment.raw?.carrier,
            shipment.raw?.carrier_name,
            shipment.raw?.carrierName,
            shipment.raw?.shipping_line,
            shipment.raw?.shippingLine,
            shipment.raw?.vessel_operator,
            shipment.raw?.manifest_carrier_name,
            shipment.raw?.line,
            "",
          ),
        ),
      );
      if (!isMeaningfulText(rawCarrier)) return;
      const current = carrierCounts.get(rawCarrier) || { shipments: 0, teu: 0 };
      current.shipments += 1;
      current.teu += shipment.teu;
      carrierCounts.set(rawCarrier, current);
    });
    carriers = [...carrierCounts.entries()]
      .map(([carrier, stats]) => ({ carrier, shipments: stats.shipments, teu: stats.teu }))
      .sort((a, b) => b.shipments - a.shipments || b.teu - a.teu)
      .slice(0, 10);
  }

  let origins = groupTop(filteredShipments.map((shipment) => shipment.origin), 8);
  let destinations = groupTop(filteredShipments.map((shipment) => shipment.destination), 8);

  if (!origins.length && topRoutes.length) {
    origins = groupTop(
      topRoutes.map((route) => route.lane.split("→")[0]?.trim() || "").filter(Boolean) as string[],
      8,
    );
  }

  if (!destinations.length && topRoutes.length) {
    destinations = groupTop(
      topRoutes.map((route) => route.lane.split("→")[1]?.trim() || "").filter(Boolean) as string[],
      8,
    );
  }

  const hsMap = new Map<string, { description: string; count: number }>();
  filteredShipments.forEach((shipment) => {
    const key = shipment.hsCode !== "—" ? shipment.hsCode : shipment.product;
    if (!key || key === "—") return;
    const current = hsMap.get(key) || { description: shipment.product, count: 0 };
    current.count += 1;
    if (!current.description || current.description === "—") current.description = shipment.product;
    hsMap.set(key, current);
  });

  const hsRows = [...hsMap.entries()]
    .map(([hsCode, stats]) => ({ hsCode, description: stats.description || "—", count: stats.count }))
    .sort((a, b) => b.count - a.count);

  const productRows = hsRows.map((row) => ({
    product: row.description,
    hsCode: row.hsCode,
    volumeShare: `${row.count}`,
  }));

  const shipmentTableRows = [...filteredShipments]
    .sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return db - da;
    })
    .map((shipment) => ({
      "Arrival Date": formatDate(shipment.date),
      "Master BOL": shipment.masterBol,
      "House BOL": shipment.houseBol,
      "Importer ID": shipment.importerId,
      "Importer Name": shipment.importerName,
      "Consignee Name": shipment.consigneeName,
      "Consignee Address": shipment.consigneeAddress,
      "Shipper": shipment.shipper,
      "Shipper Address": shipment.shipperAddress,
      "Carrier Code": shipment.carrierCode,
      "Carrier Name": shipment.carrier,
      "Forwarder Code": shipment.forwarderCode,
      "Forwarder Name": shipment.forwarderName,
      "Notify Party": shipment.notifyParty,
      "Port Of Unlading ID": shipment.portOfUnladingId,
      "Port Of Unlading": shipment.portOfUnlading,
      "Port Of Lading ID": shipment.portOfLadingId,
      "Port Of Lading": shipment.portOfLading,
      "Container Types": shipment.containerTypes,
      Route: shipment.route,
      Vessel: shipment.vessel,
      "Voyage Number": shipment.voyageNumber,
      TEU: formatNumber(shipment.teu, 1),
      "Weight (kg)": shipment.weightKg,
      "Gross Weight": shipment.grossWeight,
      Volume: shipment.volume,
      "Cargo Description": shipment.cargoDescription,
      Product: shipment.product,
      "HS Code": shipment.hsCode,
    }));

  const pivotRows = monthlySeries.map((point) => ({
    Month: point.period,
    Shipments: formatNumber(point.fcl + point.lcl),
    TEU: "—",
  }));

    const topRouteLabel =
    topRoutes[0]?.lane ||
    buildRouteLabel(rawRouteKpis?.topRouteLast12m) ||
    buildRouteLabel(rawProfile?.topRouteLast12m) ||
    buildRouteLabel(rawProfile?.top_route) ||
    buildRouteLabel(rawProfile?.kpis?.top_route_12m) ||
    "—";

  const recentRouteLabel =
    [...filteredShipments].sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return db - da;
    })[0]?.route ||
    buildRouteLabel(rawRouteKpis?.mostRecentRoute) ||
    buildRouteLabel(rawProfile?.mostRecentRoute) ||
    buildRouteLabel(rawProfile?.recent_route) ||
    buildRouteLabel(rawProfile?.kpis?.recent_route) ||
    "—";

  return {
    years: [],
    selectedYear,
    filteredShipments,
    monthlySeries,
    allTimeShipments: null,
    shipments,
    teu,
    spend,
    fclShipments,
    lclShipments,
    avgTeuPerShipment: shipments > 0 ? teu / shipments : null,
    avgShipmentsPerMonth: shipments > 0 ? shipments / Math.max(monthlySeries.length, 1) : null,
    oldestShipmentDate: sortedByDate[0]?.date ?? rawProfile?.firstShipmentDate ?? null,
    latestShipmentDate:
      sortedByDate[sortedByDate.length - 1]?.date ??
      safeProfileLatestDate ??
      null,
    topRouteLabel,
    recentRouteLabel,
    topRoutes,
    carriers,
    origins,
    destinations,
    hsRows,
    productRows,
    shipmentTableRows,
    pivotRows,
    containerMix: aggregateContainerMix(filteredShipments),
  };
};

export default function CompanyDetailPanel({
  record,
  profile,
  routeKpis,
  loading,
  error,
  selectedYear,
}: CompanyDetailPanelProps) {
  const key = getRecordKey(record);
  const rawProfile = profile as any;
  const rawRouteKpis = routeKpis as any;

  const recentBols = useMemo(() => {
    const items =
      rawProfile?.recentBols || rawProfile?.recent_bols || rawProfile?.bols || rawProfile?.shipments || [];
    return Array.isArray(items) ? items : [];
  }, [rawProfile]);

  const normalizedShipments = useMemo(
    () => recentBols.map((shipment, index) => normalizeShipment(shipment, index)),
    [recentBols],
  );

  const availableYears = useMemo(() => {
    const apiYears = getCommandCenterAvailableYears(profile);
    return apiYears.length ? apiYears : getAvailableYears(normalizedShipments, profile, routeKpis);
  }, [normalizedShipments, profile, routeKpis]);

  const effectiveSelectedYear = selectedYear ?? availableYears[0] ?? null;

  const detail = useMemo(() => {
    const activeYear = effectiveSelectedYear || new Date().getFullYear();
    const scopedProfile = buildYearScopedProfile(profile, activeYear) || profile;
    const scopedRouteKpis = (scopedProfile as any)?.routeKpis ?? routeKpis;
    const baseModel = buildCommandCenterDetailModel(scopedProfile, scopedRouteKpis, activeYear) as any;
    const fallbackModel = buildDetailModel(
      normalizedShipments,
      activeYear,
      scopedProfile as any,
      (scopedProfile as any)?.routeKpis ?? rawRouteKpis,
    );

    // All-time total — never mix with 12m or current-year series
    const allTimeShipments = toNumber(
      pickFirst(scopedProfile?.totalShipments, rawProfile?.totalShipments),
    );

    // Year-scoped display shipments: series wins, then baseModel, then fallback model
    // Do NOT include shipmentsLast12m — that is a 12m metric, not a year-scoped metric
    const resolvedShipments = Math.max(
      Number(baseModel?.shipments ?? 0),
      Number(fallbackModel.shipments ?? 0),
    );

    const resolvedTeu = Math.max(
      Number(baseModel?.teu ?? 0),
      Number(scopedRouteKpis?.teuLast12m ?? 0),
      Number((scopedProfile as any)?.teuLast12m ?? 0),
      Number(fallbackModel.teu ?? 0),
    );

    const resolvedSpendCandidates = [
      Number(baseModel?.marketSpendUsd ?? 0),
      Number(scopedRouteKpis?.estSpendUsd12m ?? 0),
      Number((scopedProfile as any)?.estSpendUsd12m ?? 0),
      Number((scopedProfile as any)?.marketSpend ?? 0),
      Number(fallbackModel.spend ?? 0),
    ].filter((value) => Number.isFinite(value) && value > 0);

    const resolvedSpend: number | null =
      resolvedSpendCandidates.length > 0 ? Math.max(...resolvedSpendCandidates) : null;

    const resolvedFcl = Math.max(
      Number(baseModel?.fclShipments ?? 0),
      Number((scopedProfile as any)?.containers?.fclShipments12m ?? 0),
      Number(fallbackModel.fclShipments ?? 0),
    );

    const resolvedLcl = Math.max(
      Number(baseModel?.lclShipments ?? 0),
      Number((scopedProfile as any)?.containers?.lclShipments12m ?? 0),
      Number(fallbackModel.lclShipments ?? 0),
    );

    const latestDate =
      baseModel?.latestShipmentDate ?? fallbackModel.latestShipmentDate ?? scopedProfile?.lastShipmentDate ?? null;

    const monthlySeriesBase =
      Array.isArray(baseModel?.activitySeries) && baseModel.activitySeries.length
        ? baseModel.activitySeries
            .map((point: any) => {
              const fcl = Number(point.fcl || 0);
              const lcl = Number(point.lcl || 0);
              const total = Number(point.shipments || 0);
              // If a month has shipments but no FCL/LCL breakdown, bucket into FCL
              return {
                period: point.month || point.period,
                fcl: fcl > 0 || lcl > 0 ? fcl : total,
                lcl,
              };
            })
            .filter((point: any) => point.period && (point.fcl || point.lcl) > 0)
        : fallbackModel.monthlySeries;

    const topRoutes =
      Array.isArray(baseModel?.tradeLanes) && baseModel.tradeLanes.length
        ? baseModel.tradeLanes.map((lane: any) => ({
            lane: buildRouteLabel(lane.label),
            shipments: Number(lane.count || 0),
            teu: Number(lane.teu || 0),
            spend: lane.spend ?? null,
          }))
        : fallbackModel.topRoutes;

    const carriers =
      Array.isArray(baseModel?.carriers) && baseModel.carriers.length
        ? baseModel.carriers
            .map((carrier: any) => ({
              carrier: carrier.label || carrier.carrier,
              shipments: Number(carrier.count || carrier.shipments || 0),
              teu: Number(carrier.teu || 0),
            }))
            .filter((row: any) => isMeaningfulText(row.carrier))
        : fallbackModel.carriers;

    return {
      ...fallbackModel,
      years: availableYears,
      selectedYear: activeYear,
      allTimeShipments: allTimeShipments > 0 ? allTimeShipments : null,
      shipments: resolvedShipments,
      teu: resolvedTeu,
      spend: resolvedSpend,
      fclShipments: Math.min(resolvedFcl, resolvedShipments || resolvedFcl),
      lclShipments: resolvedLcl,
      avgTeuPerShipment:
        resolvedShipments > 0
          ? resolvedTeu / resolvedShipments
          : baseModel?.avgTeuPerShipment ?? fallbackModel.avgTeuPerShipment ?? null,
      avgShipmentsPerMonth:
        resolvedShipments > 0 ? resolvedShipments / Math.max(monthlySeriesBase.length, 1) : null,
      oldestShipmentDate: baseModel?.oldestShipmentDate ?? fallbackModel.oldestShipmentDate ?? null,
      latestShipmentDate: latestDate,
      monthlySeries: monthlySeriesBase,
      topRoutes,
      carriers,
      origins:
        Array.isArray(baseModel?.locations?.origins) && baseModel.locations.origins.length
          ? baseModel.locations.origins.map((item: any) => ({
              label: normalizeLocationLabel(item.label),
              count: Number(item.count || 0),
            }))
          : fallbackModel.origins,
      destinations:
        Array.isArray(baseModel?.locations?.destinations) && baseModel.locations.destinations.length
          ? baseModel.locations.destinations.map((item: any) => ({
              label: normalizeLocationLabel(item.label),
              count: Number(item.count || 0),
            }))
          : fallbackModel.destinations,
    };
  }, [normalizedShipments, effectiveSelectedYear, rawProfile, rawRouteKpis, availableYears, profile, routeKpis]);

  // Phase B.8 — tabs restored to 5 per the executive Company Profile rework.
  // Trade Lane Intelligence pulled out of Overview into its own tab so the
  // globe + canonical lane table get the full panel width (and the
  // origin/destination flag pills stop overflowing on 1024-1280 viewports).
  // Shipments tab restored as a real BOL ledger view backed by the same
  // normalizedShipments memo that already powers Overview previews — no new
  // fetches.
  const [activeTab, setActiveTab] = useState<
    "overview" | "shipments" | "trade-lanes" | "equipment" | "contacts" | "market-benchmark"
  >("overview");
  // Phase B.10 — Market Benchmark tab uses an iframe to embed the Freight
  // Right Rate Index. The native <iframe> does not fire `onError` for
  // CSP / X-Frame-Options blocks, so we run a 6s onLoad watchdog: if the
  // iframe never reports `load`, we assume it is blocked at the
  // browser/CDN layer and render a clean honest fallback card.
  const [benchmarkIframeStatus, setBenchmarkIframeStatus] = useState<
    "pending" | "loaded" | "blocked"
  >("pending");
  useEffect(() => {
    if (activeTab !== "market-benchmark") return;
    if (benchmarkIframeStatus !== "pending") return;
    const t = window.setTimeout(() => {
      setBenchmarkIframeStatus((s) => (s === "pending" ? "blocked" : s));
    }, 6000);
    return () => window.clearTimeout(t);
  }, [activeTab, benchmarkIframeStatus]);
  const [suppliersPage, setSuppliersPage] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const [productsPage, setProductsPage] = useState(0);
  const [shipmentsPage, setShipmentsPage] = useState(0);
  const [selectedLane, setSelectedLane] = useState<string | null>(null);

  // Build the canonical lane list once. Phase B.3 — all consumers (hero
  // pill, Trade Lane Intelligence table, globe arc, Overview previews) read
  // from the same canonicalizeLanes() output so "Italy → United States of
  // America US" and "Italy → USA" merge into one row labelled
  // "🇮🇹 Italy → 🇺🇸 USA". `combinedLanes` keeps the raw list around so
  // unresolved rows still show in the table.
  const safeLanes = useMemo(
    () => safeRouteList(detail, rawRouteKpis, rawProfile, normalizedShipments),
    [detail, rawRouteKpis, rawProfile, normalizedShipments],
  );

  const { canonical: canonicalLanes, nonCanonical: nonCanonicalLanes } = useMemo(
    () =>
      canonicalizeLanes(
        safeLanes.map((row) => ({
          lane: row.lane,
          shipments: row.shipments,
          teu: row.teu,
          spend: row.spend,
        })),
      ),
    [safeLanes],
  );

  const combinedLanes: Array<CanonicalLane | NonCanonicalLane> = useMemo(
    () => [...canonicalLanes, ...nonCanonicalLanes],
    [canonicalLanes, nonCanonicalLanes],
  );

  // Globe / lane-summary key — the canonical displayLabel. Unresolved rows
  // never feed the globe arc array (they have no coords).
  const firstResolvableLane = useMemo(
    () => canonicalLanes[0]?.displayLabel ?? null,
    [canonicalLanes],
  );

  // Default-select the first canonical (resolvable) lane on mount / when the
  // company changes. We only auto-pick if the user has not chosen a lane yet
  // (or their selection is no longer valid for the current company).
  useEffect(() => {
    if (!firstResolvableLane) {
      if (selectedLane) setSelectedLane(null);
      return;
    }
    if (
      !selectedLane ||
      !canonicalLanes.some((l) => l.displayLabel === selectedLane)
    ) {
      setSelectedLane(firstResolvableLane);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstResolvableLane, canonicalLanes]);

  const activeLane = selectedLane || firstResolvableLane;
  const activeLaneMeta = useMemo(
    () => canonicalLanes.find((l) => l.displayLabel === activeLane) || null,
    [canonicalLanes, activeLane],
  );
  const activeFromMeta: ResolvedEndpoint | null = activeLaneMeta?.fromMeta ?? null;
  const activeToMeta: ResolvedEndpoint | null = activeLaneMeta?.toMeta ?? null;

  // Responsive globe size — clamp to viewport width minus ~64px of horizontal
  // padding so the canvas never overflows on a 390px mobile viewport.
  const [globeSize, setGlobeSize] = useState<number>(268);
  useEffect(() => {
    const update = () => {
      if (typeof window === "undefined") return;
      const w = window.innerWidth || 0;
      // Container padding ≈ 32px (panel) + 32px (card) + 16px (block) ≈ 80px.
      const next = Math.max(180, Math.min(268, w - 80));
      setGlobeSize(next);
    };
    update();
    if (typeof window !== "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    return undefined;
  }, []);

  const [phantomContacts, setPhantomContacts] = useState<any[]>([]);
  const [selectedContact, setSelectedContact] = useState<any | null>(null);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactSlideOpen, setContactSlideOpen] = useState(false);
  const [slideContact, setSlideContact] = useState<any | null>(null);
  const [contactFetchTrigger, setContactFetchTrigger] = useState(0);
  const [contactPreviewSource, setContactPreviewSource] = useState<"cache" | "lusha" | null>(null);
  const [contactMessage, setContactMessage] = useState<string | null>(null);
  const [contactDebug, setContactDebug] = useState<any | null>(null);
  // Phase B.2 G — when the enrich-contacts edge function returns a 5xx
  // / non-2xx (rate limited, provider down, etc.) we store the raw error
  // here and render the friendly "Contact enrichment unavailable" copy.
  // The raw text only shows up inside a collapsed `<details>` toggle.
  const [contactError, setContactError] = useState<string | null>(null);
  const [savedContactKeys, setSavedContactKeys] = useState<Set<string>>(new Set());
  const [contactSearchQuery, setContactSearchQuery] = useState("");
  // Phase B.3 Contact Intel: department/role filter chip state. Default "all"
  // matches the leading FILTER_CHIPS entry. The chip's `matcher` runs against
  // each contact's title; the helper handles missing titles safely.
  const [contactDeptFilter, setContactDeptFilter] = useState<string>("all");

  useEffect(() => {
    const companyId =
  (record as any)?.company?.company_id ||
  (record as any)?.company?.source_company_key ||
  (record as any)?.company?.key ||
  (record as any)?.company?.id ||
  (rawProfile as any)?.company_id ||
  (rawProfile as any)?.source_company_key ||
  (rawProfile as any)?.companyKey ||
  (rawProfile as any)?.key ||
  null;

    const companyName =
      (record as any)?.company?.name ||
      (record as any)?.company?.company_name ||
      (rawProfile as any)?.companyName ||
      (rawProfile as any)?.company_name;

  const companyDomain =
  (record as any)?.company?.domain ||
  (record as any)?.company?.website ||
  (record as any)?.company?.company_domain ||
  (rawProfile as any)?.domain ||
  (rawProfile as any)?.website ||
  (rawProfile as any)?.companyDomain ||
  (rawProfile as any)?.company_domain ||
  null;

    if (!companyId && !companyName && !companyDomain) {
  setPhantomContacts([]);
  setContactPreviewSource(null);
  setContactMessage("Company details are missing, so contact search cannot run yet.");
  return;
}

if (!companyDomain && companyName) {
  setContactMessage(`Searching contacts by company name: ${companyName}`);
}

    let cancelled = false;

    const run = async () => {
      setContactsLoading(true);
      setContactError(null);

      try {
        if (companyId) {
          const cached = await loadCachedContactPreview(String(companyId));
          if (!cancelled && cached && Array.isArray(cached.contacts) && cached.contacts.length > 0) {
            setPhantomContacts(cached.contacts.slice(0, DEFAULT_CONTACT_SEARCH_LIMIT));
            setContactPreviewSource(cached.source === "lusha" ? "lusha" : "cache");
            if (!selectedContact) {
              setSelectedContact(cached.contacts[0]);
            }
            return;
          }
        }

        const { data: enrichData, error: enrichError } = await supabase.functions.invoke(
          "enrich-contacts",
          {
  body: {
  companyId: companyId ? String(companyId) : undefined,
  companyName: companyName ? String(companyName) : undefined,
  companyDomain: companyDomain ? String(companyDomain) : undefined,
  limit: DEFAULT_CONTACT_SEARCH_LIMIT,
},
          },
        );

        if (enrichError) throw enrichError;

        const enrichContacts = Array.isArray(enrichData?.contacts) ? enrichData.contacts : [];
        const prioritized = enrichContacts.filter(isTargetContact);
        const finalContacts = prioritized.length
  ? prioritized.slice(0, DEFAULT_CONTACT_SEARCH_LIMIT)
  : enrichContacts.slice(0, DEFAULT_CONTACT_SEARCH_LIMIT);

        if (!cancelled) {
          setContactMessage(enrichData?.message || null);
          setContactDebug(enrichData?.debug || null);
        }

        if (!cancelled && finalContacts.length > 0) {
  setPhantomContacts(finalContacts);
  setContactPreviewSource("lusha");

  await saveContactPreviewCache({
    companyId: companyId ? String(companyId) : null,
    companyName: companyName ? String(companyName) : null,
    companyDomain: companyDomain ? String(companyDomain) : null,
    sourceProvider: "lusha",
    contacts: finalContacts,
  });

  if (!selectedContact) {
    setSelectedContact(finalContacts[0]);
  }

  return;
}

        // Provider returned no contacts or is currently locked/rate-limited.
if (!cancelled) {
  setPhantomContacts((current) => current);
  setContactPreviewSource((current) => current);
  setContactMessage(enrichData?.message || "No contacts found via Lusha for this company.");
  setContactDebug(enrichData?.debug || null);
}
      } catch (err) {
  console.error("Contact preview fetch error", err);

  if (!cancelled) {
    const rawMessage =
      err instanceof Error
        ? err.message
        : typeof err === "string"
        ? err
        : "Contact enrichment failed.";

    setPhantomContacts((current) => current);
    setContactPreviewSource((current) => current);
    // Phase B.2 G — never leak raw "Edge Function returned a non-2xx
    // status code." into the primary UI copy. We store the raw error
    // separately so it can be expanded inside a collapsed `<details>`.
    setContactError(rawMessage);
    setContactMessage(null);
  }
} finally {
        if (!cancelled) {
          setContactsLoading(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [record, rawProfile, contactFetchTrigger]);
    
  const freightosBenchmark = useMemo(
    () =>
      detectFreightosBenchmark({
        topRoute: detail.topRouteLabel,
        recentRoute: detail.recentRouteLabel,
        topRoutes: detail.topRoutes,
        shipments: detail.filteredShipments,
      }),
    [detail],
  );

  // Trade lane signal, Recency risk, and Volume profile cards removed per UX cleanup.
  // Only Contact Intelligence remains in the bottom overview section.

  // Phase B.4 — track BOTH the trend % AND whether prior-year data exists
  // separately. The KPI card uses `priorYearMissing` to show the
  // "Not enough history" hint instead of a bare em-dash when the prior
  // year has zero shipments.
  const { trendPct, priorYearMissing } = (() => {
    const activeYear = effectiveSelectedYear || new Date().getFullYear();
    const series = safeArray(rawProfile?.timeSeries);
    const byYear = new Map<number, number>();

    series.forEach((point: any) => {
      const yr = parseYearFromPoint(point);
      if (!yr) return;
      const count = getPointShipmentCount(point);
      if (!count) return;
      byYear.set(yr, (byYear.get(yr) || 0) + count);
    });

    if (!byYear.size && normalizedShipments.length) {
      normalizedShipments.forEach((shipment) => {
        if (!shipment.year) return;
        byYear.set(shipment.year, (byYear.get(shipment.year) || 0) + 1);
      });
    }

    const thisYear = byYear.get(activeYear) ?? null;
    const priorYear = byYear.get(activeYear - 1) ?? null;
    const missing = !priorYear || priorYear === 0;
    if (!thisYear || missing) {
      return { trendPct: null as number | null, priorYearMissing: missing };
    }
    return {
      trendPct: ((thisYear - (priorYear as number)) / (priorYear as number)) * 100,
      priorYearMissing: false,
    };
  })();
  const trendArrow = trendPct == null ? null : trendPct > 5 ? "↑" : trendPct < -5 ? "↓" : "→";
  const trendColor =
    trendPct == null
      ? "text-slate-600"
      : trendPct > 5
      ? "text-emerald-600"
      : trendPct < -5
      ? "text-rose-600"
      : "text-amber-600";

  // Phase H P1 fix — the proxy's buildSnapshotFromCompanyData emits
  // `top_suppliers` but never `suppliers_table`. The panel was reading
  // only `suppliers_table` and getting nothing. We now fall through to
  // top_suppliers (snake_case, canonical from proxy) and topSuppliers
  // (camelCase, legacy variant) so suppliers populate in production.
  const rawSuppliersSource =
    (rawProfile as any)?.suppliers_table ||
    (rawProfile as any)?.top_suppliers ||
    (rawProfile as any)?.topSuppliers ||
    [];
  // Mirror the same filter the render sites apply so the diversity score
  // doesn't include empty / "—" rows.
  const suppliersRawCount = safeArray(rawSuppliersSource).filter((sup: any) => {
    const candidate = String(sup?.supplier_name || sup?.name || "").trim();
    if (!candidate) return false;
    const lower = candidate.toLowerCase();
    return !(lower === "—" || lower === "unknown" || lower === "n/a" || lower === "na");
  }).length;
  const diversityScore =
    suppliersRawCount === 0
      ? null
      : suppliersRawCount <= 2
      ? 1
      : suppliersRawCount <= 5
      ? 2
      : suppliersRawCount <= 10
      ? 3
      : suppliersRawCount <= 20
      ? 4
      : 5;

  const loadCachedContactPreview = async (companyIdentifier: string) => {
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(
      companyIdentifier,
    );

  let query = supabase
    .from("lit_company_contact_previews")
    .select("preview_contacts, expires_at, source_provider");

  query = isUuid
    ? query.eq("company_id", companyIdentifier)
    : query.eq("source_company_key", companyIdentifier);

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error("Contact preview cache read error", error);
    return null;
  }

  if (!data) return null;

  const expiresAt = data.expires_at ? new Date(data.expires_at) : null;

  if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    return null;
  }

  return {
    contacts: Array.isArray(data.preview_contacts) ? data.preview_contacts : [],
    source: data.source_provider || "cache",
  };
};
        
  const saveContactPreviewCache = async ({
  companyId,
  companyName,
  companyDomain,
  sourceProvider,
  contacts,
}: {
  companyId?: string | null;
  companyName?: string | null;
  companyDomain?: string | null;
  sourceProvider: "lusha";
  contacts: any[];
}) => {
    const isUuid =
    !!companyId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(
      companyId,
    );

  const payload = {
  company_id: isUuid ? companyId : null,
  source_company_key: companyId && !isUuid ? companyId : null,
  company_name: companyName || null,
  company_domain: companyDomain || null,
  source_provider: sourceProvider,
  preview_contacts: contacts.slice(0, DEFAULT_CONTACT_SEARCH_LIMIT),
  total_contacts_found: Array.isArray(contacts) ? contacts.length : 0,
  fetched_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  updated_at: new Date().toISOString(),
};

    const conflictTarget = isUuid ? "company_id" : "source_company_key";

    const { error } = await supabase
    .from("lit_company_contact_previews")
    .upsert(payload, { onConflict: conflictTarget });

    if (error) {
      console.error("Contact preview cache write error", error);
    }
  };

  const getContactKey = (contact: any) => {
    const linkedin =
      contact.linkedin || contact.linkedinUrl || contact.profileUrl || contact.url || "";
    const name = getContactFullName(contact);
    const title = getContactTitle(contact);
    return [linkedin, name, title].join("|").toLowerCase();
  };

  // Phase B.6 — schema-true save. The pre-B.6 payload sent five columns
  // that don't exist on `lit_contacts` (company_name, company_domain,
  // source_provider, raw_contact, updated_at) plus an `onConflict` against
  // a unique index that doesn't exist (company_id,linkedin_url). The
  // confirmed live schema (supabase/migrations/20260115001208_create_lit
  // _schema_part2.sql lines 66–97) is:
  //   id (uuid, default), source (NOT NULL, default 'lusha'),
  //   source_contact_key, company_id (uuid FK lit_companies.id),
  //   full_name (NOT NULL), first_name, last_name, title, department,
  //   seniority, email, phone, linkedin_url, avatar_url, city, state,
  //   country_code, buying_intent, raw_payload, created_at, updated_at.
  // Unique constraint: (source, source_contact_key) — NOT
  // (company_id, linkedin_url).
  //
  // RLS: only a SELECT policy ("Contacts are viewable by authenticated
  // users") is granted. There is no INSERT policy for `authenticated`,
  // so this insert will be denied with code 42501 until a follow-up
  // migration adds one. We surface the user-facing copy
  //   "Contact saving is not enabled for your account yet."
  // exactly as briefed and never expose raw RLS / schema wording.
  //
  // We also resolve the lit_companies UUID (record.company.id) rather
  // than the source_company_key slug (record.company.company_id) so the
  // FK to lit_companies(id) holds. Slug-as-UUID was producing 23503 FK
  // violations on the few companies that were seeded into lit_companies
  // with a real UUID.
  const saveContactToSupabase = async (contact: any) => {
    // Phase B.7: resolve the lit_companies UUID via the shared helper. When
    // opened from Command Center the UUID is already on record.company.id;
    // when opened via deep-link/Search we only have the slug, so the helper
    // queries lit_companies by source_company_key to fetch the UUID.
    const companyUuid = await resolveLitCompanyUuid({ record, rawProfile });

    if (!companyUuid) {
      setContactMessage(
        "Save needs a saved company. Add this company to Command Center first.",
      );
      return;
    }

    const linkedinUrl =
      contact?.linkedin ||
      contact?.linkedinUrl ||
      contact?.linkedin_url ||
      contact?.profileUrl ||
      contact?.url ||
      null;

    const sourceContactKey =
      contact?.id ||
      contact?.contactId ||
      contact?.contact_id ||
      contact?.lushaId ||
      contact?.lusha_id ||
      // Fall back to the linkedin URL as a stable per-(source,key) handle so
      // the (source, source_contact_key) unique index still triggers a
      // 23505 on duplicates instead of letting the row sneak in twice.
      linkedinUrl ||
      null;

    const payload = {
      source: "lusha",
      source_contact_key: sourceContactKey,
      company_id: companyUuid,
      full_name: getContactFullName(contact) || "Unknown",
      first_name: contact?.firstName || contact?.first_name || null,
      last_name: contact?.lastName || contact?.last_name || null,
      title: getContactTitle(contact) || null,
      department: contact?.department || contact?.dept || null,
      seniority: contact?.seniority || contact?.seniorityLevel || null,
      email: getContactEmail(contact) || null,
      phone: getContactPhone(contact) || null,
      linkedin_url: linkedinUrl,
    };

    // Plain insert (no upsert) — the live unique index is on
    // (source, source_contact_key), so any duplicate raises 23505 and we
    // surface the friendly "Contact already saved." copy below.
    const { error } = await supabase.from("lit_contacts").insert(payload);

    if (error) {
      console.error("Save contact error", error);
      // Honest, non-technical error mapping by Postgres SQLSTATE code.
      if ((error as any)?.code === "23505") {
        setContactMessage("Contact already saved.");
        // Treat as locally-saved so the row stops re-prompting the save.
        setSavedContactKeys((prev) => {
          const next = new Set(prev);
          next.add(getContactKey(contact));
          return next;
        });
        return;
      }
      if ((error as any)?.code === "42501") {
        // RLS denial — no INSERT policy on lit_contacts for authenticated.
        setContactMessage("Contact saving is not enabled for your account yet.");
        return;
      }
      if ((error as any)?.code === "23503") {
        // FK violation — companyUuid not in lit_companies.
        setContactMessage(
          "Save needs a saved company. Add this company to Command Center first.",
        );
        return;
      }
      setContactMessage("Could not save contact. Try again or contact support.");
      return;
    }

    setSavedContactKeys((prev) => {
      const next = new Set(prev);
      next.add(getContactKey(contact));
      return next;
    });
    setContactMessage("Contact saved.");
  };

  const contactOverviewRows = phantomContacts.slice(0, CONTACT_PREVIEW_LIMIT);
  const filteredContacts = useMemo(() => {
  const query = contactSearchQuery.trim().toLowerCase();

  if (!query) return phantomContacts;

  return phantomContacts.filter((contact) =>
    getContactSearchText(contact).includes(query),
  );
}, [phantomContacts, contactSearchQuery]);

  if (!key) {
    return <CommandCenterEmptyState />;
  }

  // Phase H P1 fix — same fallback chain as above so the Suppliers tab
  // and Overview mini card both render real rows from top_suppliers
  // when suppliers_table is absent (which is the case for every real
  // company today per the proxy output).
  //
  // Phase B.2 F — drop rows that have no usable name AT ALL. Previously
  // suppliers with neither `supplier_name` nor `name` rendered as
  // "— / 0", which read as a real row but carried zero signal. The
  // canonical filter is: trim → reject empty / "—" / "unknown".
  const suppliersRawAll: any[] = safeArray(
    (rawProfile as any)?.suppliers_table ||
      (rawProfile as any)?.top_suppliers ||
      (rawProfile as any)?.topSuppliers ||
      [],
  );
  const suppliersRaw: any[] = suppliersRawAll.filter((sup: any) => {
    const candidate = String(sup?.supplier_name || sup?.name || "").trim();
    if (!candidate) return false;
    const lower = candidate.toLowerCase();
    if (lower === "—" || lower === "unknown" || lower === "n/a" || lower === "na") {
      return false;
    }
    return true;
  });
  const supplierPageSize = 25;
  const suppliersPageCount = Math.ceil(suppliersRaw.length / supplierPageSize);
  const suppliersSlice = suppliersRaw.slice(
    suppliersPage * supplierPageSize,
    (suppliersPage + 1) * supplierPageSize,
  );

  const productsPageSize = 25;
  const totalProducts = detail.hsRows.length;
  const prodPageCount = Math.ceil(totalProducts / productsPageSize);
  const hsSlice = detail.hsRows.slice(
    productsPage * productsPageSize,
    (productsPage + 1) * productsPageSize,
  );
  const prodSlice = detail.productRows.slice(
    productsPage * productsPageSize,
    (productsPage + 1) * productsPageSize,
  );

  const historyPageSize = 25;
  const totalRows = detail.shipmentTableRows.length;
  const histPageCount = Math.ceil(totalRows / historyPageSize);
  const histSlice = detail.shipmentTableRows.slice(
    historyPage * historyPageSize,
    (historyPage + 1) * historyPageSize,
  );

  // Phase B.9 — floating KPI bridge values. The page-shell hero no longer
  // renders a KPI strip (the dark navy 4-up was demoted in favor of a
  // light hero with a glossy blue action zone). KPIs now sit in a
  // standalone bridge row between the hero and the tabs panel. We compute
  // the values here because `detail`, `canonicalLanes`, `phantomContacts`,
  // and `isContactVerified` already live in this panel's scope — no new
  // data fetches, no fake values.
  const bridgeShipments = Number(detail.shipments) || 0;
  const bridgeTeu = Number(detail.teu) || 0;
  const bridgeSpend = detail.spend;
  const bridgeActiveLaneCount = canonicalLanes.filter(
    (l) => l.shipments > 0,
  ).length;
  const bridgeContactCount = phantomContacts.length;
  const bridgeVerifiedContactCount = phantomContacts.filter(
    isContactVerified,
  ).length;

  return (
    <div className="space-y-6">
      {/* Phase B.9 — floating KPI bridge row. Sits between the hero and
          the tabs section so the page reads as three distinct executive
          zones: identity hero → snapshot KPIs → deep tabs. Real values
          only — anything missing renders as "—" with an honest helper. */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Shipments 12M
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
              <Package className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
            {bridgeShipments > 0 ? formatNumber(bridgeShipments) : "—"}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {bridgeShipments > 0
              ? "Trailing 12-month BOL count"
              : "No verified data yet"}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              TEU 12M
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600 ring-1 ring-cyan-100">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
            {bridgeTeu > 0 ? formatNumber(bridgeTeu, 1) : "—"}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {bridgeTeu > 0
              ? "Twenty-foot equivalents"
              : "No verified data yet"}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Est. Freight Spend
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
            {bridgeSpend != null && bridgeSpend > 0
              ? formatCurrency(bridgeSpend)
              : "—"}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {bridgeSpend != null && bridgeSpend > 0
              ? "Modeled from FCL/LCL mix"
              : "No verified data yet"}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Active Trade Lanes
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
              <Globe className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
            {bridgeActiveLaneCount > 0
              ? formatNumber(bridgeActiveLaneCount)
              : "—"}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {bridgeActiveLaneCount > 0
              ? "Resolvable canonical lanes"
              : "No resolvable lanes yet"}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Contacts
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600 ring-1 ring-violet-100">
              <UserRound className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
            {bridgeContactCount > 0
              ? `${formatNumber(bridgeContactCount)} found · ${formatNumber(
                  bridgeVerifiedContactCount,
                )} verified`
              : "—"}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {bridgeContactCount > 0
              ? "Lusha enrichment scope"
              : "No verified data yet"}
          </div>
        </div>
      </section>

      <section className="w-full rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      {loading ? (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
          Loading company profile…
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {/* Phase B.9 — the panel-local "Company Intelligence · 12-month
          window" KPI strip was removed in B.5 and the floating KPI bridge
          row above (rendered as a sibling section) is the single source of
          truth for the snapshot KPIs. The thin divider below preserves
          breathing room before the tabs. */}
      <div className="mb-3 border-b border-slate-200" aria-hidden />

      <Tabs
        value={activeTab}
        onValueChange={(v: string) => setActiveTab(v as typeof activeTab)}
        className="space-y-4"
      >
        {/* Phase B.8 — 3 → 5 tabs. Shipments restored as a real BOL ledger
            (no new fetches; reads normalizedShipments). Trade Lanes pulled
            back out of Overview so the globe + canonical lane table get
            full panel width and the flag pills stop overflowing on
            1024-1280 viewports. */}
        <TabsList className="flex h-auto w-full gap-0 overflow-x-auto rounded-none border-0 border-b border-slate-200 bg-white p-0 shadow-none">
          <TabsTrigger
            value="overview"
            className="h-auto rounded-none border-b-2 border-transparent px-4 py-2.5 text-slate-500 transition-all data-[state=active]:border-blue-500 data-[state=active]:bg-transparent data-[state=active]:text-blue-700 data-[state=active]:shadow-none"
            style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}
          >
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="shipments"
            className="h-auto rounded-none border-b-2 border-transparent px-4 py-2.5 text-slate-500 transition-all data-[state=active]:border-blue-500 data-[state=active]:bg-transparent data-[state=active]:text-blue-700 data-[state=active]:shadow-none"
            style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}
          >
            Shipments
          </TabsTrigger>
          <TabsTrigger
            value="trade-lanes"
            className="h-auto rounded-none border-b-2 border-transparent px-4 py-2.5 text-slate-500 transition-all data-[state=active]:border-blue-500 data-[state=active]:bg-transparent data-[state=active]:text-blue-700 data-[state=active]:shadow-none"
            style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}
          >
            Trade Lanes
          </TabsTrigger>
          <TabsTrigger
            value="equipment"
            className="h-auto rounded-none border-b-2 border-transparent px-4 py-2.5 text-slate-500 transition-all data-[state=active]:border-blue-500 data-[state=active]:bg-transparent data-[state=active]:text-blue-700 data-[state=active]:shadow-none"
            style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}
          >
            Equipment
          </TabsTrigger>
          <TabsTrigger
            value="contacts"
            className="h-auto rounded-none border-b-2 border-transparent px-4 py-2.5 text-slate-500 transition-all data-[state=active]:border-blue-500 data-[state=active]:bg-transparent data-[state=active]:text-blue-700 data-[state=active]:shadow-none"
            style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}
          >
            Contact Intel
          </TabsTrigger>
          <TabsTrigger
            value="market-benchmark"
            className="h-auto rounded-none border-b-2 border-transparent px-4 py-2.5 text-slate-500 transition-all data-[state=active]:border-blue-500 data-[state=active]:bg-transparent data-[state=active]:text-blue-700 data-[state=active]:shadow-none"
            style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}
          >
            Market Benchmark
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Phase B.9 — executive 60/40 Overview. The Phase B.5 secondary
              KPI grid was removed because the floating KPI bridge above
              now owns those numbers (Shipments / TEU / Spend / Active
              Lanes / Contacts). Overview leads with a Strategic Brief +
              Trade Intelligence Summary + Peak Seasonality on the LEFT
              and a polished honest Action Panel (Top Contacts / Campaign
              Status / Engagement History) on the RIGHT. The duplicate
              full Contact Intelligence block was removed — Contacts has
              its own tab and the Top Contacts card on the right links
              there. */}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.48fr)_minmax(360px,0.9fr)]">
            <div className="space-y-6">
              {/* Strategic Brief — visual anchor. Templated assembly from
                  real fields only. Forbidden language ("savings",
                  "AI-generated", "risk index", etc.) is NOT used. */}
              {(() => {
                const companyDisplayName: string =
                  ((record as any)?.company?.name as string | undefined) ||
                  ((record as any)?.company?.company_name as string | undefined) ||
                  ((rawProfile as any)?.companyName as string | undefined) ||
                  ((rawProfile as any)?.company_name as string | undefined) ||
                  "This company";

                const shipmentsCount = Number(detail.shipments) || 0;
                const teuCount = Number(detail.teu) || 0;
                const spend = detail.spend;
                const topLane = canonicalLanes[0];
                const topRouteLabelClause = (() => {
                  if (!topLane || !topLane.displayLabel) return "";
                  return `, with ${topLane.displayLabel} as the strongest lane`;
                })();
                const spendClause =
                  spend != null && spend > 0
                    ? `, valued at an estimated ${formatCurrency(spend)} in market spend`
                    : "";

                const laneCount = canonicalLanes.filter((l) => l.shipments > 0).length;
                const countrySet = new Set<string>();
                for (const lane of canonicalLanes) {
                  if (lane.fromMeta?.canonicalKey) countrySet.add(lane.fromMeta.canonicalKey);
                  if (lane.toMeta?.canonicalKey) countrySet.add(lane.toMeta.canonicalKey);
                }
                const countryCount = countrySet.size;

                const verifiedContactCount = phantomContacts.filter(isContactVerified).length;
                const contactStatement = (() => {
                  if (phantomContacts.length === 0) return "";
                  return ` ${formatNumber(phantomContacts.length)} contact${
                    phantomContacts.length === 1 ? "" : "s"
                  } loaded${
                    verifiedContactCount > 0
                      ? ` (${formatNumber(verifiedContactCount)} verified)`
                      : ""
                  }.`;
                })();

                const hasShipmentSignal = shipmentsCount > 0 || teuCount > 0;

                const headline = (() => {
                  if (topLane && topLane.displayLabel) {
                    return `${topLane.displayLabel} is the strongest visible lane`;
                  }
                  if (shipmentsCount > 0) {
                    return `${companyDisplayName} · 12-month shipment profile`;
                  }
                  return `${companyDisplayName} · Snapshot in progress`;
                })();

                const briefBody = !hasShipmentSignal ? (
                  <p className="text-sm leading-relaxed text-indigo-50">
                    This snapshot does not yet have shipment volume data. Run an ImportYeti refresh to populate the brief.
                  </p>
                ) : (
                  <p className="text-sm leading-relaxed text-indigo-50">
                    {`${companyDisplayName} ran ${formatNumber(shipmentsCount)} shipment${
                      shipmentsCount === 1 ? "" : "s"
                    } over the trailing 12 months${
                      teuCount > 0 ? `, totaling ${formatNumber(teuCount, 1)} TEU` : ""
                    }${topRouteLabelClause}${spendClause}.`}
                    {laneCount > 0
                      ? ` ${formatNumber(laneCount)} resolvable trade lane${
                          laneCount === 1 ? "" : "s"
                        }${
                          countryCount > 0
                            ? ` across ${formatNumber(countryCount)} ${
                                countryCount === 1 ? "country" : "countries"
                              }`
                            : ""
                        }.`
                      : ""}
                    {contactStatement}
                  </p>
                );

                return (
                  <div className="overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-950 via-slate-950 to-blue-950 p-6 text-white shadow-lg">
                    <div className="text-cyan-300 tracking-[0.22em] text-[10px] font-semibold uppercase">
                      STRATEGIC BRIEF
                    </div>
                    <h3 className="mt-2 text-2xl font-bold tracking-[-0.02em] text-white">
                      {headline}
                    </h3>
                    <div className="mt-3">{briefBody}</div>
                    <div className="mt-4">
                      <span className="inline-flex items-center rounded-full border border-cyan-300/30 bg-cyan-400/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200/70">
                        Based on current snapshot fields only
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Trade Intelligence Summary — top 3 lanes only, no globe.
                  Globe lives in the Trade Lanes tab. */}
              {(() => {
                const topLanes = canonicalLanes.slice(0, 3);
                const topShipments = topLanes[0]?.shipments || 0;
                const activeLaneCount = canonicalLanes.filter(
                  (l) => l.shipments > 0,
                ).length;
                return (
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          TOP VISIBLE LANES
                        </div>
                        <h3 className="mt-1 text-base font-bold text-slate-950">
                          Trade Intelligence Summary
                        </h3>
                      </div>
                      <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-indigo-700">
                        {activeLaneCount} active
                      </span>
                    </div>
                    {topLanes.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500">
                        No resolvable trade lanes yet.
                      </div>
                    ) : (
                      <ul className="space-y-3">
                        {topLanes.map((lane) => {
                          const shipPct = topShipments > 0
                            ? Math.max(6, Math.round((lane.shipments / topShipments) * 100))
                            : 0;
                          return (
                            <li key={lane.displayLabel}>
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0 truncate text-sm font-semibold text-slate-900">
                                  {lane.displayLabel}
                                </div>
                                <div className="shrink-0 text-xs text-slate-500">
                                  <span className="font-semibold text-slate-700">
                                    {formatNumber(lane.shipments)}
                                  </span>{" "}
                                  ship · TEU{" "}
                                  <span className="font-semibold text-slate-700">
                                    {Number(lane.teu) > 0 ? formatNumber(lane.teu, 1) : "—"}
                                  </span>
                                </div>
                              </div>
                              <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-100">
                                <div
                                  className="h-1.5 rounded-full bg-indigo-500/70"
                                  style={{ width: `${shipPct}%` }}
                                />
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {canonicalLanes.length > 0 ? (
                      <div className="mt-4">
                        <button
                          type="button"
                          onClick={() => setActiveTab("trade-lanes")}
                          className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
                        >
                          View all trade lanes <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })()}

              {/* Peak Seasonality — kept on the LEFT column. YTD framing
                  for the current calendar year, per Phase B.5. */}
              {(() => {
                const now = new Date();
                const currentYear = now.getFullYear();
                const currentMonth = now.getMonth();
                const isYtd =
                  effectiveSelectedYear != null &&
                  effectiveSelectedYear === currentYear;

                const PERIOD_TO_MONTH: Record<string, number> = {};
                for (let m = 0; m < 12; m++) {
                  const label = new Date(2000, m, 1).toLocaleDateString(undefined, {
                    month: "short",
                  });
                  PERIOD_TO_MONTH[label] = m;
                }

                const seasonalitySeries = isYtd
                  ? detail.monthlySeries.filter((p) => {
                      const idx = PERIOD_TO_MONTH[p.period];
                      return typeof idx === "number" && idx <= currentMonth;
                    })
                  : detail.monthlySeries;

                const subtitle = isYtd
                  ? `${currentYear} year-to-date · Monthly shipment profile for active months year-to-date.`
                  : `Monthly shipment profile for active months in ${effectiveSelectedYear ?? "the selected year"}.`;

                const badgeLabel = isYtd
                  ? `${seasonalitySeries.length} active month${seasonalitySeries.length === 1 ? "" : "s"} YTD`
                  : `${seasonalitySeries.length} active month${seasonalitySeries.length === 1 ? "" : "s"}`;

                return (
                  <div className="flex h-full min-h-[360px] flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          PEAK SEASONALITY INDEX
                        </div>
                        <h3 className="mt-1 text-base font-bold text-slate-950">
                          Monthly shipment cadence
                        </h3>
                      </div>
                      {seasonalitySeries.length > 0 ? (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                          {badgeLabel}
                        </span>
                      ) : null}
                    </div>
                    <p className="mb-4 text-xs text-slate-500">{subtitle}</p>
                    <div className="flex-1 min-h-[260px]">
                      <CompanyActivityChart data={seasonalitySeries} />
                    </div>
                    <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                      <span className="font-semibold text-indigo-600">Observation:</span>{" "}
                      {isYtd
                        ? "Only active months through today are rendered — no future-month placeholders."
                        : "This chart only renders real active months from the selected year. No future-month placeholders."}
                    </div>
                  </div>
                );
              })()}
            </div>

            <aside className="space-y-6">
              {/* Right Action Panel — three honest cards. */}

              {/* Top Contacts */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-700">
                  TOP CONTACTS
                </div>
                {phantomContacts.length > 0 ? (
                  <h3 className="mt-1 text-base font-bold text-slate-950">
                    {formatNumber(phantomContacts.length)} found ·{" "}
                    {formatNumber(bridgeVerifiedContactCount)} verified
                  </h3>
                ) : (
                  <h3 className="mt-1 text-base font-bold text-slate-950">
                    No verified contacts yet
                  </h3>
                )}
                {phantomContacts.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {phantomContacts.slice(0, 3).map((c, idx) => {
                      const fullName = getContactFullName(c) || "—";
                      const title = getContactTitle(c);
                      const initials =
                        fullName
                          .split(" ")
                          .slice(0, 2)
                          .map((p: string) => p[0])
                          .join("")
                          .toUpperCase() || "CT";
                      return (
                        <li
                          key={`${fullName}-${idx}`}
                          className="flex items-center gap-2.5"
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-semibold text-indigo-700 ring-1 ring-indigo-200">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-900">
                              {fullName}
                            </div>
                            {title ? (
                              <div className="truncate text-xs text-slate-500">
                                {title}
                              </div>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">
                    Run enrichment or add a contact to begin outreach.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setActiveTab("contacts")}
                  className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  View Contact Intel <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Campaign Status */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-700">
                  CAMPAIGN STATUS
                </div>
                <h3 className="mt-1 text-base font-bold text-slate-950">
                  Not in campaign
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  Add this company to a campaign after contact enrichment is complete.
                </p>
              </div>

              {/* Engagement History */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-700">
                  ENGAGEMENT HISTORY
                </div>
                <h3 className="mt-1 text-base font-bold text-slate-950">
                  No activity yet
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  Outreach history will appear here once engagement logging is available.
                </p>
              </div>
            </aside>
          </div>

          {/* Demoted blocks — Top Suppliers + Recent Shipments + Market
              Benchmark sit BELOW the 60/40 grid. The full Contact
              Intelligence overview block from Phase B.8 was removed; a
              right-column Top Contacts card and the Contact Intel tab
              cover that surface honestly. */}
          <div className="grid gap-6 md:grid-cols-2">
            {(() => {
              const topSuppliers = suppliersRaw.slice(0, 3);
              return (
                <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        TOP SUPPLIERS
                      </div>
                      <h3 className="mt-1 text-base font-bold text-slate-950">
                        Verified BOL counterparties
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {suppliersRaw.length > 0
                          ? `Top 3 of ${suppliersRaw.length} verified suppliers`
                          : "From verified BOL records"}
                      </p>
                    </div>
                  </div>
                  {topSuppliers.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500">
                      No supplier data yet
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {topSuppliers.map((sup: any, idx: number) => {
                        const name = sup.supplier_name || sup.name || "—";
                        const shipments =
                          Number(sup.shipments_12m ?? sup.shipments ?? 0) || 0;
                        const country = sup.supplier_country || sup.country || null;
                        return (
                          <li
                            key={`${name}-${idx}`}
                            className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-900">
                                {name}
                              </div>
                              {country ? (
                                <div className="mt-0.5 truncate text-xs text-slate-500">
                                  {country}
                                </div>
                              ) : null}
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                12m
                              </div>
                              <div className="text-sm font-semibold text-indigo-600">
                                {formatNumber(shipments)}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })()}

            {(() => {
              const recentShipments = [...normalizedShipments]
                .sort((a, b) => {
                  const da = a.date ? new Date(a.date).getTime() : 0;
                  const db = b.date ? new Date(b.date).getTime() : 0;
                  return db - da;
                })
                .slice(0, 3);
              return (
                <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        RECENT SHIPMENTS
                      </div>
                      <h3 className="mt-1 text-base font-bold text-slate-950">
                        Latest BOL records
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {normalizedShipments.length > 0
                          ? `Latest 3 of ${normalizedShipments.length} BOL records`
                          : "From verified bill-of-lading records"}
                      </p>
                    </div>
                    {normalizedShipments.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setActiveTab("shipments")}
                        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50/40 hover:text-indigo-700"
                      >
                        View all <ArrowUpRight className="h-3 w-3" />
                      </button>
                    ) : null}
                  </div>
                  {recentShipments.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500">
                      No shipment records yet
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {recentShipments.map((s, idx) => (
                        <li
                          key={s.id || idx}
                          className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-900">
                              {s.route || "—"}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 truncate text-xs text-slate-500">
                              <span>{formatDate(capDateAtToday(s.date))}</span>
                              {s.containerTypes && s.containerTypes !== "—" ? (
                                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                  {s.containerTypes}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                              TEU
                            </div>
                            <div className="text-sm font-semibold text-cyan-700">
                              {formatNumber(s.teu, 1)}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Phase B.10 — the compact "Market benchmark / Needs rate source"
              banner that lived here since Phase B.5 has been removed. The
              full benchmark experience now lives in its own dedicated
              "Market Benchmark" tab (Freight Right Rate Index iframe). The
              `pb-8` keeps a clean breathing-room gutter at the bottom of
              Overview after Top Suppliers + Recent Shipments. */}
          <div className="pb-8" aria-hidden="true" />
        </TabsContent>

        {/* Phase B.8 — Shipments tab. Real BOL ledger sourced from the
            already-computed normalizedShipments memo. No new fetches.
            Summary cards on top + paginated ledger below. */}
        <TabsContent value="shipments" className="space-y-4">
          {(() => {
            const totalShipments = normalizedShipments.length;
            const totalTeu = normalizedShipments.reduce(
              (sum, row) => sum + (Number(row.teu) || 0),
              0,
            );
            const hasTeu = normalizedShipments.some(
              (row) => Number(row.teu) > 0,
            );
            const fclCount = normalizedShipments.filter(
              (row) => row.loadType === "FCL",
            ).length;
            const lclCount = normalizedShipments.filter(
              (row) => row.loadType === "LCL",
            ).length;

            // Date range — from valid past-or-current shipments only.
            const datedShipments = normalizedShipments
              .filter((row) => row.date && isValidPastOrCurrentDate(row.date))
              .map((row) => ({
                ...row,
                _t: new Date(row.date as string).getTime(),
              }))
              .sort((a, b) => a._t - b._t);
            const oldestDate = datedShipments[0]?.date ?? null;
            const newestDate =
              datedShipments[datedShipments.length - 1]?.date ?? null;

            const pageSize = 25;
            const pageCount = Math.max(1, Math.ceil(totalShipments / pageSize));
            const safePage = Math.min(shipmentsPage, pageCount - 1);
            // Sort newest-first for display ledger.
            const sortedForLedger = [...normalizedShipments].sort((a, b) => {
              const da = a.date ? new Date(a.date).getTime() : 0;
              const db = b.date ? new Date(b.date).getTime() : 0;
              return db - da;
            });
            const slice = sortedForLedger.slice(
              safePage * pageSize,
              (safePage + 1) * pageSize,
            );

            if (totalShipments === 0) {
              return (
                <div className="rounded-[2rem] border border-dashed border-slate-200 bg-white p-10 text-center">
                  <Ship className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                  <p className="text-sm text-slate-600">
                    No shipment ledger rows are available for this company snapshot.
                  </p>
                </div>
              );
            }

            return (
              <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                {/* Phase B.9 — Shipments tab polish: outer rounded-[2rem]
                    wrap + executive header (uppercase tracking + h3 +
                    subtitle), summary cards reuse the floating-bridge KPI
                    chrome for consistency, table rows breathe with py-3
                    and `hover:bg-slate-50`. */}
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      SHIPMENT LEDGER
                    </div>
                    <h3 className="mt-1 text-base font-bold text-slate-950">
                      Bill-of-lading history
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Verified bill-of-lading records from this snapshot.
                    </p>
                  </div>
                  <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                    {formatNumber(totalShipments)} {totalShipments === 1 ? "row" : "rows"}
                  </div>
                </div>

                {/* Top summary card row — chrome matches floating KPI bridge. */}
                <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Total Shipments
                      </div>
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
                        <Package className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
                      {formatNumber(totalShipments)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Total TEU
                      </div>
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600 ring-1 ring-cyan-100">
                        <Layers className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
                      {hasTeu ? formatNumber(totalTeu, 1) : "—"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        FCL / LCL Split
                      </div>
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                        <Container className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="mt-2 text-base font-bold tracking-tight text-slate-950">
                      {fclCount > 0 || lclCount > 0
                        ? `${formatNumber(fclCount)} FCL / ${formatNumber(lclCount)} LCL`
                        : "—"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Date Range
                      </div>
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                        <CalendarClock className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="mt-2 text-xs font-semibold text-slate-900">
                      {oldestDate && newestDate ? (
                        <>
                          {formatDate(capDateAtToday(oldestDate))}
                          <span className="mx-1 text-slate-400">→</span>
                          {formatDate(capDateAtToday(newestDate))}
                        </>
                      ) : (
                        "—"
                      )}
                    </div>
                  </div>
                </div>

                {/* Ledger */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

                  <div className="overflow-x-auto">
                    <table
                      className="w-full text-left text-sm"
                      style={{ minWidth: 1024 }}
                    >
                      <thead>
                        <tr className="border-b border-slate-100 text-xs uppercase tracking-[0.18em] text-slate-500">
                          <th className="px-3 py-2 font-semibold">Date</th>
                          <th className="px-3 py-2 font-semibold">Origin</th>
                          <th className="px-3 py-2 font-semibold">Destination</th>
                          <th className="px-3 py-2 font-semibold">Supplier</th>
                          <th className="px-3 py-2 font-semibold">Consignee</th>
                          <th className="px-3 py-2 text-right font-semibold">TEU</th>
                          <th className="px-3 py-2 font-semibold">Load</th>
                          <th className="px-3 py-2 font-semibold">BOL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {slice.map((row, i) => {
                          const supplier =
                            row.shipper && row.shipper !== "—"
                              ? row.shipper
                              : row.importerName && row.importerName !== "—"
                              ? row.importerName
                              : "—";
                          const consignee =
                            row.consigneeName && row.consigneeName !== "—"
                              ? row.consigneeName
                              : "—";
                          const bol =
                            row.masterBol && row.masterBol !== "—"
                              ? row.masterBol
                              : row.houseBol && row.houseBol !== "—"
                              ? row.houseBol
                              : "—";
                          const cappedDate = capDateAtToday(row.date ?? null);
                          return (
                            <tr
                              key={row.id || `ship-${i}`}
                              className="border-b border-slate-50 last:border-b-0 hover:bg-slate-50"
                            >
                              <td className="px-3 py-3 text-slate-700">
                                {cappedDate ? formatDate(cappedDate) : "—"}
                              </td>
                              <td className="px-3 py-3 text-slate-700">
                                <span className="block max-w-[200px] truncate" title={row.origin || undefined}>
                                  {row.origin && row.origin !== "—" ? row.origin : "—"}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-slate-700">
                                <span className="block max-w-[200px] truncate" title={row.destination || undefined}>
                                  {row.destination && row.destination !== "—" ? row.destination : "—"}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-slate-700">
                                <span className="block max-w-[180px] truncate" title={supplier}>
                                  {supplier}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-slate-700">
                                <span className="block max-w-[180px] truncate" title={consignee}>
                                  {consignee}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-right font-mono text-xs text-slate-700">
                                {Number(row.teu) > 0 ? formatNumber(row.teu, 1) : "—"}
                              </td>
                              <td className="px-3 py-3">
                                {row.loadType === "FCL" ? (
                                  <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                                    FCL
                                  </span>
                                ) : row.loadType === "LCL" ? (
                                  <span className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-700">
                                    LCL
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="px-3 py-3 font-mono text-xs text-slate-600">
                                <span className="block max-w-[140px] truncate" title={bol}>
                                  {bol}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {pageCount > 1 ? (
                    <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                      <div>
                        Page {safePage + 1} of {pageCount}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={safePage === 0}
                          onClick={() => setShipmentsPage((p) => Math.max(0, p - 1))}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          disabled={safePage >= pageCount - 1}
                          onClick={() =>
                            setShipmentsPage((p) => Math.min(pageCount - 1, p + 1))
                          }
                          className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>
            );
          })()}
        </TabsContent>

        {/* Phase B.8 — Trade Lanes tab. Pulled out of Overview so the
            globe + canonical lane table get the full panel width and the
            origin/destination flag pills sit ABOVE the lg:grid-cols-2
            row (no longer nested inside the globe column → no more
            overflow on 1024-1280 viewports). */}
        <TabsContent value="trade-lanes" className="space-y-4">
          {/* Phase B.9 — outer wrap upgraded to `rounded-[2rem]` to match
              the unified visual language across the executive workspace.
              Globe LEFT / lane table RIGHT (lg:grid-cols-2) and full-width
              flag pills above were already correct from Phase B.8. */}
          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  TRADE LANE INTELLIGENCE
                </div>
                <h3 className="mt-1 text-base font-bold text-slate-950">
                  Strongest visible lanes
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Strongest lanes by shipment count, TEU, and estimated spend.
                </p>
              </div>
              <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                {canonicalLanes.length} active {canonicalLanes.length === 1 ? "lane" : "lanes"}
              </div>
            </div>

            {(() => {
              const globeLanes: GlobeLane[] = canonicalLanes
                .slice(0, 6)
                .map((l) => ({
                  id: l.displayLabel,
                  from: l.fromMeta.canonicalKey,
                  to: l.toMeta.canonicalKey,
                  coords: [l.fromMeta.coords, l.toMeta.coords],
                  fromMeta: l.fromMeta,
                  toMeta: l.toMeta,
                  shipments: l.shipments,
                }));
              const hasResolvable = globeLanes.length > 0;

              return (
                <>
                  {/* Phase B.10 — Origin / Destination flag pills.
                      Diagnosis of the desktop-flags-missing report: in
                      B.9 the container used a base `grid grid-cols-2`
                      that switched to `md:flex md:flex-row` at md+. The
                      flag pills WERE in the DOM at all viewports; the
                      regression was visual rather than structural —
                      empty `hidden md:block` placeholder slots, plain
                      white cards that blended into the white panel
                      background, and an inconsistent `display` cascade
                      on some Tailwind builds. The fix is layout-stable:
                      `flex` from the base breakpoint with `flex-wrap`
                      so two cards stack on narrow viewports without a
                      grid → flex breakpoint flip, paired with the new
                      gradient card treatment from Task 5. The block
                      sits ABOVE the `lg:grid-cols-2` globe + lane-table
                      grid so it spans the full panel width. */}
                  {hasResolvable && ((activeFromMeta && activeFromMeta.flag) || (activeToMeta && activeToMeta.flag)) && (
                    <div className="mb-4 flex w-full flex-wrap items-stretch justify-center gap-3 md:flex-nowrap md:items-center md:gap-4">
                      {activeFromMeta && activeFromMeta.flag ? (
                        <div className="relative flex flex-1 min-w-[140px] max-w-[260px] flex-col items-center justify-center gap-2 rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-blue-50 p-4 shadow-sm">
                          <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-indigo-300 to-transparent" />
                          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-indigo-600">
                            ORIGIN
                          </span>
                          <span
                            role="img"
                            aria-label={activeFromMeta.countryName || "Origin country flag"}
                            className="text-4xl leading-none xl:text-5xl"
                          >
                            {activeFromMeta.flag}
                          </span>
                          <span className="truncate text-base font-semibold text-slate-900" title={activeFromMeta.countryName}>
                            {activeFromMeta.countryName}
                          </span>
                          {activeFromMeta.countryCode ? (
                            <span className="rounded-full bg-white/80 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-600 ring-1 ring-slate-200">
                              {activeFromMeta.countryCode}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-base font-semibold text-slate-400 shadow-sm md:flex">
                        <ArrowRight className="h-5 w-5" aria-hidden />
                      </div>
                      {activeToMeta && activeToMeta.flag ? (
                        <div className="relative flex flex-1 min-w-[140px] max-w-[260px] flex-col items-center justify-center gap-2 rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-slate-50 p-4 shadow-sm">
                          <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-blue-300 to-transparent" />
                          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-blue-600">
                            DESTINATION
                          </span>
                          <span
                            role="img"
                            aria-label={activeToMeta.countryName || "Destination country flag"}
                            className="text-4xl leading-none xl:text-5xl"
                          >
                            {activeToMeta.flag}
                          </span>
                          <span className="truncate text-base font-semibold text-slate-900" title={activeToMeta.countryName}>
                            {activeToMeta.countryName}
                          </span>
                          {activeToMeta.countryCode ? (
                            <span className="rounded-full bg-white/80 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-600 ring-1 ring-slate-200">
                              {activeToMeta.countryCode}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* Selected lane summary strip — sits above the globe +
                      lane-table grid so it spans the full panel width.
                      Phase B.10: backdrop-blur slate tint replaces the
                      flat slate-50 banner. */}
                  {hasResolvable && activeLaneMeta ? (
                    <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
                      <span className="font-semibold text-slate-900">
                        {activeLaneMeta.displayLabel}
                      </span>
                      <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-slate-600">
                        <span>Shipments {formatNumber(activeLaneMeta.shipments)}</span>
                        <span>TEU {formatNumber(activeLaneMeta.teu, 1)}</span>
                        <span>
                          Est. Spend {activeLaneMeta.spend != null ? formatCurrency(activeLaneMeta.spend) : "—"}
                        </span>
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-4 lg:grid-cols-2">
                    {/* Globe LEFT */}
                    <div
                      style={{
                        background:
                          "linear-gradient(180deg, #EEF2FF 0%, #F8FAFC 60%, #F1F5F9 100%)",
                        borderRadius: 24,
                        border: "1px solid #E2E8F0",
                        padding: 16,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 10,
                        minWidth: 0,
                      }}
                    >
                      {hasResolvable ? (
                        <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
                          <GlobeCanvas
                            lanes={globeLanes}
                            selectedLane={activeLane ?? null}
                            size={globeSize}
                            theme="dark"
                          />
                        </div>
                      ) : (
                        <div
                          className="flex h-full w-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/70 p-6 text-center text-xs text-slate-500"
                          style={{ minHeight: 200 }}
                        >
                          <Globe className="mb-2 h-6 w-6 text-slate-300" />
                          Route map unavailable because this shipment data does not include resolvable origin/destination locations.
                        </div>
                      )}
                    </div>

                    {/* Table RIGHT */}
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 text-xs uppercase tracking-[0.18em] text-slate-500">
                            <th className="px-3 py-2 font-semibold">#</th>
                            <th className="px-3 py-2 font-semibold">Lane</th>
                            <th className="px-3 py-2 text-right font-semibold">Shipments</th>
                            <th className="px-3 py-2 text-right font-semibold">TEU</th>
                            <th className="px-3 py-2 text-right font-semibold">Trend</th>
                          </tr>
                        </thead>
                        <tbody>
                          {combinedLanes.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-500">
                                No trade lane data available yet.
                              </td>
                            </tr>
                          ) : (
                            combinedLanes.map((lane, i) => {
                              const isActive =
                                lane.resolvable && lane.displayLabel === activeLane;
                              const spendTitle =
                                lane.spend != null ? `Est. Spend: ${formatCurrency(lane.spend)}` : undefined;
                              const trendNode =
                                lane.shipments > 0 && lane.resolvable ? (
                                  <span className="text-emerald-600">↑</span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                );
                              return (
                                <tr
                                  key={`lane-${i}`}
                                  onClick={() => {
                                    if (lane.resolvable) setSelectedLane(lane.displayLabel);
                                  }}
                                  title={spendTitle}
                                  className={`border-b border-slate-50 last:border-b-0 transition-colors ${
                                    lane.resolvable ? "cursor-pointer" : "cursor-default"
                                  } ${
                                    isActive
                                      ? "bg-indigo-50 border-l-2 border-l-indigo-500 ring-1 ring-inset ring-indigo-200"
                                      : "hover:bg-slate-50/70"
                                  }`}
                                >
                                  <td className="px-3 py-3 text-xs font-semibold text-slate-400">{i + 1}</td>
                                  <td className="px-3 py-3">
                                    <div className="flex items-center gap-2">
                                      <span
                                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                                        style={{
                                          backgroundColor: isActive
                                            ? TEU_BAR_PRIMARY
                                            : CHART_COLORS[i % CHART_COLORS.length],
                                        }}
                                      />
                                      <span className="max-w-[260px] truncate font-semibold text-slate-900">
                                        {lane.displayLabel}
                                      </span>
                                    </div>
                                    {lane.aliases.length > 1 ? (
                                      <div className="mt-0.5 truncate text-xs text-slate-500">
                                        Includes {lane.aliases.slice(0, 2).join("; ")}
                                        {lane.aliases.length > 2
                                          ? `; +${lane.aliases.length - 2} more`
                                          : ""}
                                      </div>
                                    ) : null}
                                  </td>
                                  <td className="px-3 py-3 text-right font-semibold text-indigo-600">
                                    {formatNumber(lane.shipments)}
                                  </td>
                                  <td className="px-3 py-3 text-right text-slate-700">
                                    {formatNumber(lane.teu, 1)}
                                  </td>
                                  <td className="px-3 py-3 text-right">{trendNode}</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              );
            })()}
          </section>
        </TabsContent>

        <TabsContent value="equipment" className="space-y-4">
          {(() => {
            // Canonical mix derived from detail.filteredShipments (BOL-backed).
            // detail.containerMix already exists from parsed_summary flow; we
            // reuse its counts but re-label into canonical codes + detail.
            const canonicalMix = aggregateCanonicalContainerMix(detail.filteredShipments);
            const loadLines = Array.isArray((rawProfile as any)?.containers_load)
              ? (rawProfile as any).containers_load
              : [];
            const fclPct = (() => {
              const row = loadLines.find(
                (r: any) => String(r?.load_type || "").toUpperCase() === "FCL",
              );
              return row && row.shipments_perc != null ? Number(row.shipments_perc) : null;
            })();
            const lclPct = (() => {
              const row = loadLines.find(
                (r: any) => String(r?.load_type || "").toUpperCase() === "LCL",
              );
              return row && row.shipments_perc != null ? Number(row.shipments_perc) : null;
            })();

            const hasLoadSplit =
              (detail.fclShipments || 0) > 0 ||
              (detail.lclShipments || 0) > 0 ||
              fclPct != null ||
              lclPct != null;
            const hasContainerMix = canonicalMix.length > 0;

            return (
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,1fr)]">
                <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-4">
                    <div className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">
                      Load type split
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      FCL vs LCL from containers_load / BOL load type
                    </p>
                  </div>

                  {hasLoadSplit ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 to-white p-4">
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-600">
                          <Container className="h-3.5 w-3.5" /> FCL
                        </div>
                        <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                          {formatNumber(detail.fclShipments)}
                        </div>
                        {fclPct != null ? (
                          <div className="mt-1 text-xs text-slate-500">{fclPct.toFixed(1)}% of shipments</div>
                        ) : null}
                      </div>
                      <div className="rounded-3xl border border-cyan-100 bg-gradient-to-br from-cyan-50/80 to-white p-4">
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-700">
                          <Container className="h-3.5 w-3.5" /> LCL
                        </div>
                        <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                          {formatNumber(detail.lclShipments)}
                        </div>
                        {lclPct != null ? (
                          <div className="mt-1 text-xs text-slate-500">{lclPct.toFixed(1)}% of shipments</div>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                      Load split unavailable
                    </div>
                  )}
                </div>

                <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">
                        Container type mix
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Canonical sizes with raw vendor detail in tooltip
                      </p>
                    </div>
                    {hasContainerMix ? (
                      <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                        {canonicalMix.length} {canonicalMix.length === 1 ? "type" : "types"}
                      </div>
                    ) : null}
                  </div>

                  {hasContainerMix ? (
                    <div className="space-y-2">
                      {canonicalMix.map((entry, i) => (
                        <div
                          key={entry.code}
                          title={entry.details.length ? `Raw: ${entry.details.join(" · ")}` : undefined}
                          className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-2.5"
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span
                              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                            />
                            <span className="truncate font-semibold text-slate-900">
                              {entry.code}
                            </span>
                            {entry.details.length > 0 && entry.details[0] !== entry.code ? (
                              <span className="truncate text-xs text-slate-500">
                                {entry.details.join(" · ")}
                              </span>
                            ) : null}
                          </div>
                          <span className="shrink-0 font-semibold text-indigo-600">
                            {formatNumber(entry.count)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                      Container type unavailable
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </TabsContent>
        <TabsContent value="contacts" className="space-y-4">
          {/* Phase B.3 Contact Intel rebuild — search bar, filter chips,
              honest verification gate, 2-column card grid. The Lusha
              enrichment fetch is unchanged; this tab just consumes its
              `phantomContacts` output more honestly. */}
          {(() => {
            const FILTER_CHIPS: Array<{ id: string; label: string; matcher: (c: any) => boolean }> = [
              { id: "all", label: "All", matcher: () => true },
              {
                id: "operations",
                label: "Operations",
                matcher: (c) => /operation|logistic|supply chain|warehouse|fulfillment/i.test(getContactTitle(c)),
              },
              {
                id: "procurement",
                label: "Procurement",
                matcher: (c) => /procure|sourcing|buyer|purchas/i.test(getContactTitle(c)),
              },
              {
                id: "vp",
                label: "VP",
                matcher: (c) => /\b(vp|vice president)\b/i.test(getContactTitle(c)),
              },
              {
                id: "director",
                label: "Director",
                matcher: (c) => /\bdirector\b/i.test(getContactTitle(c)),
              },
            ];

            const filtered = phantomContacts.filter((c) => {
              const matchesChip =
                FILTER_CHIPS.find((chip) => chip.id === contactDeptFilter)?.matcher(c) ?? true;
              if (!matchesChip) return false;
              const q = contactSearchQuery.trim().toLowerCase();
              if (!q) return true;
              const text = [
                getContactFullName(c),
                getContactTitle(c),
                getContactEmail(c),
                getContactLocation(c),
              ].filter(Boolean).join(" ").toLowerCase();
              return text.includes(q);
            });

            const verifiedCount = filtered.filter(isContactVerified).length;

            return (
              <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">
                      Contact Intel
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Enriched contacts sourced from Lusha. "Verified" labels appear ONLY when the provider explicitly verified the email address.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { setContactFetchTrigger((n) => n + 1); }}
                      disabled={contactsLoading}
                      className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-50"
                    >
                      {contactsLoading ? "Searching…" : "Enrich Contacts"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setContactFetchTrigger((n) => n + 1); }}
                      disabled={contactsLoading}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-50"
                    >
                      Refresh contacts
                    </button>
                  </div>
                </div>

                {/* Search bar */}
                <div className="mb-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-slate-400" />
                    <input
                      value={contactSearchQuery}
                      onChange={(e) => setContactSearchQuery(e.target.value)}
                      placeholder="Search contacts"
                      className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                    />
                  </div>
                </div>

                {/* Filter chips — single-select. */}
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {FILTER_CHIPS.map((chip) => {
                    const active = contactDeptFilter === chip.id;
                    return (
                      <button
                        key={chip.id}
                        type="button"
                        onClick={() => setContactDeptFilter(chip.id)}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                          active
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {chip.label}
                      </button>
                    );
                  })}
                </div>

                {/* Count line */}
                <div className="mb-4 text-xs text-slate-500">
                  {contactsLoading
                    ? "Enriching contacts…"
                    : `${filtered.length} contacts found · ${verifiedCount} verified`}
                </div>

                {contactsLoading ? (
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                    Loading contacts…
                  </div>
                ) : filtered.length === 0 ? (
                  contactError ? (
                    <div className="rounded-3xl border border-amber-200 bg-amber-50/60 p-6">
                      <div className="text-sm font-semibold text-amber-900">
                        Contact enrichment unavailable
                      </div>
                      <p className="mt-1 text-xs text-amber-800">
                        The contact provider did not return contacts for this company. Try again or connect a provider in Admin.
                      </p>
                      <details className="mt-3 text-[11px] text-amber-700">
                        <summary className="cursor-pointer select-none rounded px-1 py-0.5 hover:bg-amber-100">
                          Details
                        </summary>
                        <pre className="mt-2 max-w-full overflow-auto rounded-lg border border-amber-200 bg-white px-3 py-2 font-mono text-[10px] text-amber-800">
                          {contactError}
                        </pre>
                      </details>
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                      {contactMessage || "No contacts match this filter."}
                    </div>
                  )
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {filtered.map((contact: any, index: number) => {
                      const fullName = getContactFullName(contact);
                      const title = getContactTitle(contact);
                      const email = getContactEmail(contact);
                      const location = getContactLocation(contact);
                      const linkedin = getContactLinkedIn(contact);
                      const avatarUrl = getContactAvatarUrl(contact);
                      const department =
                        contact.department ||
                        contact.dept ||
                        (FILTER_CHIPS.find((c) => c.id !== "all" && c.matcher(contact))?.label ?? null);
                      const verified = isContactVerified(contact);
                      const initials =
                        fullName.split(" ").slice(0, 2).map((p: string) => p[0]).join("").toUpperCase() || "CT";

                      return (
                        <div
                          key={`${fullName}-${index}`}
                          className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                              {avatarUrl ? (
                                <img
                                  src={avatarUrl}
                                  alt={fullName}
                                  className="h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-slate-200"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700 ring-1 ring-indigo-200">
                                  {initials}
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-sm font-semibold text-slate-950">
                                    {fullName}
                                  </span>
                                  {verified ? (
                                    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                                      Verified
                                    </span>
                                  ) : (
                                    <span
                                      className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-700"
                                      title="Provider sourced — email not verified"
                                    >
                                      Found
                                    </span>
                                  )}
                                </div>
                                <div className="mt-0.5 truncate text-xs text-indigo-600">
                                  {title || "Role unavailable"}
                                </div>
                                {location ? (
                                  <div className="mt-0.5 truncate text-xs text-slate-500">
                                    {location}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {department ? (
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                                {department}
                              </span>
                            ) : null}
                            {email ? (
                              <span className="truncate rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-mono text-slate-600">
                                {email}
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                            <a
                              href={linkedin || undefined}
                              target={linkedin ? "_blank" : undefined}
                              rel={linkedin ? "noreferrer" : undefined}
                              aria-disabled={!linkedin}
                              title={linkedin ? "Open LinkedIn profile" : "LinkedIn URL unavailable"}
                              className={`inline-flex h-8 w-8 items-center justify-center rounded-full border ${
                                linkedin
                                  ? "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                                  : "pointer-events-none border-slate-200 bg-slate-50 text-slate-400"
                              }`}
                            >
                              <Linkedin className="h-4 w-4" />
                            </a>
                            <button
                              type="button"
                              onClick={() => saveContactToSupabase(contact)}
                              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                            >
                              {savedContactKeys.has(getContactKey(contact)) ? (
                                <>
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Saved
                                </>
                              ) : (
                                <>
                                  <Save className="h-3.5 w-3.5" /> Save contact
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
        </TabsContent>

        {/* Phase B.10 — Market Benchmark tab. Embeds Freight Right's
            public Rate Index dashboard via Domo. The native <iframe>
            does not fire `onError` for CSP / X-Frame-Options blocks,
            so we run a 6-second `onLoad` watchdog (in the parent
            component scope) and flip into a clean honest fallback
            card if the embed never reports `load`. No app-side CSP
            was found in `frontend/index.html` or `frontend/vercel.json`,
            so iframe rendering depends on Domo's runtime
            X-Frame-Options policy — verify in the browser after
            deploy. */}
        <TabsContent value="market-benchmark" className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-200 px-6 py-4">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">
                Market Benchmark
              </p>
              <h3 className="mt-2 text-xl font-black text-slate-950">
                Freight Right Rate Index
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                External market index for freight rate context.
              </p>
            </div>
            <div className="relative h-[720px] w-full overflow-hidden bg-slate-50">
              {benchmarkIframeStatus === "blocked" ? (
                <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm">
                    <Globe className="h-5 w-5" aria-hidden />
                  </div>
                  <h4 className="text-base font-semibold text-slate-900">
                    Benchmark embed unavailable
                  </h4>
                  <p className="max-w-md text-sm text-slate-500">
                    Freight Right rate index could not load. This may be due to a CSP frame-src restriction or the embed being unavailable.
                  </p>
                  <button
                    type="button"
                    onClick={() => setBenchmarkIframeStatus("pending")}
                    className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <iframe
                  src="https://embed.domo.com/embed/pages/XroQm"
                  title="Freight Right Rate Index"
                  width="100%"
                  height="1620"
                  frameBorder="0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  className="block h-[1620px] w-full border-0"
                  onLoad={() => setBenchmarkIframeStatus("loaded")}
                />
              )}
            </div>
            <div className="border-t border-slate-200 px-6 py-3 text-center text-sm text-slate-500">
              <a
                href="https://www.freightright.com/freight-right-rate-index"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-blue-600 hover:text-blue-700"
              >
                Powered by Freight Right
              </a>
            </div>
          </div>
        </TabsContent>
      </Tabs>
      </section>
    </div>
  );
}
