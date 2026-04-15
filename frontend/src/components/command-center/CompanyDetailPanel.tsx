import React, { useMemo, useState, useEffect } from "react";
import {
  Boxes,
  CalendarClock,
  DollarSign,
  Globe,
  Package,
  Phone,
  Ship,
  TrendingUp,
  MapPin,
  Truck,
  Users,
  Briefcase,
  Building2,
  ArrowUpRight,
  Waves,
  BarChart3,
  Container,
} from "lucide-react";
import {
  buildCommandCenterDetailModel,
  buildYearScopedProfile,
  getCommandCenterAvailableYears,
} from "@/lib/api";
import type { IyCompanyProfile, IyRouteKpis } from "@/lib/api";
import type { CommandCenterRecord } from "@/types/importyeti";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CompanyActivityChart from "./CompanyActivityChart";
import CommandCenterInsights from "./CommandCenterInsights";
import { supabase } from "@/lib/supabase";
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

const buildCleanRoute = (origin?: string | null, destination?: string | null) => {
  const from = normalizeLocationLabel(origin);
  const to = normalizeLocationLabel(destination);
  if (from && to) return `${from} → ${to}`;
  return from || to || "Unknown route";
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

const normalizeContainerTypeLabel = (value?: string | null) => {
  const text = cleanDisplayText(value);
  if (!text) return "";
  return text
    .replace(/container/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
};

const extractContainerTypes = (shipment: any) => {
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

const aggregateRouteRows = (shipments: NormalizedShipment[]) => {
  const map = new Map<string, { shipments: number; teu: number; spend: number }>();
  shipments.forEach((shipment) => {
    if (!shipment.route || shipment.route === "—") return;
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
      return;
    }

    if (shipment.loadType !== "UNKNOWN") {
      map.set(shipment.loadType, (map.get(shipment.loadType) || 0) + 1);
    }
  });

  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
};

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
  return `${firstName} ${lastName}`.trim() || contact.name || contact.fullName || "Unknown";
};

const getContactTitle = (contact: any) =>
  contact.title || contact.role || contact.position || "";

const isSupplyChainContact = (contact: any) => {
  const title = getContactTitle(contact).toLowerCase();
  if (!title) return false;

  return (
    title.includes("vp of supply chain") ||
    title.includes("vice president supply chain") ||
    title.includes("director of supply chain") ||
    title.includes("supply chain director") ||
    title.includes("logistics manager") ||
    title.includes("supply chain manager") ||
    title.includes("vp logistics") ||
    title.includes("director logistics") ||
    title.includes("head of logistics") ||
    title.includes("head of supply chain")
  );
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

const SmallMetric = ({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}) => (
  <div className="min-h-[96px] rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
      <Icon className="h-3.5 w-3.5 text-indigo-500" />
      <span>{label}</span>
    </div>
    <div className="mt-2 text-lg font-semibold tracking-tight text-slate-950">{value}</div>
  </div>
);

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

  const activeSeries = profileSeries.length >= routeSeries.length ? profileSeries : routeSeries;

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

  const sortedByDate = [...filteredShipments].sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : 0;
    const db = b.date ? new Date(b.date).getTime() : 0;
    return da - db;
  });

  let topRoutes = safeArray(rawRouteKpis?.topRoutesLast12m)
    .map((route: any) => ({
      lane: buildRouteLabel(route?.route || route?.lane),
      shipments: toNumber(route?.shipments),
      teu: toNumber(route?.teu),
      spend: toNumber(pickFirst(route?.estSpendUsd, route?.estSpendUsd12m)) || null,
    }))
    .filter((row: any) => row.lane && row.lane !== "—");

  if (!topRoutes.length) topRoutes = aggregateRouteRows(filteredShipments);

  if (!topRoutes.length) {
    topRoutes = safeArray(rawProfile?.topRoutes)
      .map((route: any) => ({
        lane: buildRouteLabel(route?.label || route?.route),
        shipments: toNumber(route?.shipments),
        teu: toNumber(route?.teu),
        spend: toNumber(route?.estSpendUsd) || null,
      }))
      .filter((row: any) => row.lane && row.lane !== "—");
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
      rawProfile?.lastShipmentDate ??
      rawProfile?.last_shipment_date ??
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

    const resolvedShipments = Math.max(
      Number(baseModel?.shipments ?? 0),
      Number(scopedProfile?.totalShipments ?? 0),
      Number(scopedRouteKpis?.shipmentsLast12m ?? 0),
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
            .map((point: any) => ({
              period: point.month || point.period,
              fcl: Number(point.fcl || 0),
              lcl: Number(point.lcl || 0),
            }))
            .filter((point: any) => (point.fcl || point.lcl) > 0)
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

  const [suppliersPage, setSuppliersPage] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const [productsPage, setProductsPage] = useState(0);
  const [selectedLane, setSelectedLane] = useState<string | null>(null);
  const activeLane = selectedLane || detail.topRoutes[0]?.lane || null;

  const [lushaContacts, setLushaContacts] = useState<any[]>([]);
  const [lushaSimilarCompanies, setLushaSimilarCompanies] = useState<any[]>([]);
  const [selectedContact, setSelectedContact] = useState<any | null>(null);
  const [contactsLoading, setContactsLoading] = useState(false);

  useEffect(() => {
    const companyName =
      (record as any)?.company?.name ||
      (record as any)?.company?.company_name ||
      (rawProfile as any)?.companyName ||
      (rawProfile as any)?.company_name;

    const companyDomain =
      (record as any)?.company?.domain ||
      (rawProfile as any)?.domain ||
      (rawProfile as any)?.companyDomain;

    if (!companyName && !companyDomain) {
      setLushaContacts([]);
      setLushaSimilarCompanies([]);
      return;
    }

    setContactsLoading(true);

    supabase.functions
      .invoke("enrich-contacts", {
        body: {
          companyName: companyName || null,
          companyDomain: companyDomain || null,
          filters: {
            department: "supply chain",
            seniority: "manager",
          },
        },
      })
      .then(({ data, error }) => {
        if (error) {
          console.error("Lusha enrichment error", error);
          setLushaContacts([]);
          setLushaSimilarCompanies([]);
        } else {
          const contacts = Array.isArray((data as any)?.contacts) ? (data as any).contacts : [];
          const filtered = contacts.filter(isSupplyChainContact);

          setLushaContacts(filtered);
          setLushaSimilarCompanies(
            Array.isArray((data as any)?.similarCompanies) ? (data as any).similarCompanies : [],
          );
          if (filtered.length && !selectedContact) {
            setSelectedContact(filtered[0]);
          }
        }
      })
      .catch((err) => {
        console.error("Lusha enrichment fetch error", err);
        setLushaContacts([]);
        setLushaSimilarCompanies([]);
      })
      .finally(() => {
        setContactsLoading(false);
      });
  }, [record, rawProfile]);

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

  const strategicInsights = [
    detail.topRouteLabel && detail.topRouteLabel !== "—"
      ? {
          title: "Trade lane signal",
          body: `Primary lane for ${effectiveSelectedYear ?? "the selected year"} is ${detail.topRouteLabel}. Position DSV around lane resilience, capacity optionality, and routing control.`,
        }
      : null,
    detail.latestShipmentDate
      ? {
          title: "Recency risk",
          tone: "warning" as const,
          body: `Latest visible movement is ${formatDate(detail.latestShipmentDate)}. Use this to frame urgency, renewal timing, and outbound sequencing.`,
        }
      : null,
    detail.shipments
      ? {
          title: "Volume profile",
          tone: "highlight" as const,
          body: `Selected-year activity shows ${formatNumber(detail.shipments)} shipments and ${formatNumber(detail.teu, 1)} TEUs. This account supports a real logistics intelligence conversation, not a generic sales pitch.`,
        }
      : null,
    freightosBenchmark
      ? {
          title: "Market benchmark matched",
          body: `${freightosBenchmark.code} aligns to the company’s dominant lane. Use it as market context, not company-specific contract pricing.`,
        }
      : null,
  ].filter(Boolean) as Array<{
    title: string;
    body: string;
    tone?: "default" | "warning" | "highlight";
  }>;

  const avgTeu = (rawProfile as any)?.avg_teu_per_month;
  const teu12m = avgTeu?.["12m"] ?? avgTeu?.["12m_avg"] ?? null;
  const teu12_24m = avgTeu?.["12_24m"] ?? null;
  const trendPct =
    teu12m != null && teu12_24m != null && teu12_24m > 0
      ? ((teu12m - teu12_24m) / teu12_24m) * 100
      : null;
  const trendArrow = trendPct == null ? null : trendPct > 5 ? "↑" : trendPct < -5 ? "↓" : "→";
  const trendColor =
    trendPct == null
      ? "text-slate-600"
      : trendPct > 5
      ? "text-emerald-600"
      : trendPct < -5
      ? "text-rose-600"
      : "text-amber-600";

  const suppliersRawCount = safeArray((rawProfile as any)?.suppliers_table).length;
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

  const contactOverviewRows = lushaContacts.slice(0, 4);

  if (!key) {
    return <CommandCenterEmptyState />;
  }

  const suppliersRaw: any[] = safeArray((rawProfile as any)?.suppliers_table);
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

  return (
    <section className="w-full rounded-[30px] border border-slate-200 bg-slate-50 p-5 shadow-sm">
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

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex h-auto min-h-[44px] w-full flex-wrap items-stretch gap-2 overflow-visible rounded-[26px] border border-slate-200 bg-white p-3 shadow-sm">
          <TabsTrigger
            value="overview"
            className="inline-flex min-h-[36px] items-center justify-center rounded-2xl px-4 py-2 text-xs font-semibold leading-none md:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#7F3DFF] data-[state=active]:to-[#A97EFF] data-[state=active]:text-white"
          >
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="products"
            className="inline-flex min-h-[36px] items-center justify-center rounded-2xl px-4 py-2 text-xs font-semibold leading-none md:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#7F3DFF] data-[state=active]:to-[#A97EFF] data-[state=active]:text-white"
          >
            Products
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="inline-flex min-h-[36px] items-center justify-center rounded-2xl px-4 py-2 text-xs font-semibold leading-none md:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#7F3DFF] data-[state=active]:to-[#A97EFF] data-[state=active]:text-white"
          >
            Shipment History
          </TabsTrigger>
          <TabsTrigger
            value="credit"
            className="inline-flex min-h-[36px] items-center justify-center rounded-2xl px-4 py-2 text-xs font-semibold leading-none md:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#7F3DFF] data-[state=active]:to-[#A97EFF] data-[state=active]:text-white"
          >
            Credit Rating
          </TabsTrigger>
          <TabsTrigger
            value="suppliers"
            className="inline-flex min-h-[36px] items-center justify-center rounded-2xl px-4 py-2 text-xs font-semibold leading-none md:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#7F3DFF] data-[state=active]:to-[#A97EFF] data-[state=active]:text-white"
          >
            Suppliers
          </TabsTrigger>
          <TabsTrigger
            value="contacts"
            className="inline-flex min-h-[36px] items-center justify-center rounded-2xl px-4 py-2 text-xs font-semibold leading-none md:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#7F3DFF] data-[state=active]:to-[#A97EFF] data-[state=active]:text-white"
          >
            Contact Intel
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            <SmallMetric
              label="Avg TEU / shipment"
              value={formatNumber(detail.avgTeuPerShipment, 2)}
              icon={TrendingUp}
            />
            <SmallMetric
              label="Oldest shipment"
              value={formatDate(detail.oldestShipmentDate)}
              icon={CalendarClock}
            />
            <SmallMetric
              label="Latest shipment"
              value={formatDate(detail.latestShipmentDate)}
              icon={CalendarClock}
            />
            <SmallMetric
              label="Volume trend (YoY)"
              value={
                trendArrow ? (
                  <span className={trendColor}>
                    {trendArrow} {Math.abs(trendPct || 0).toFixed(1)}%
                  </span>
                ) : (
                  "—"
                )
              }
              icon={BarChart3}
            />
          </div>

          <div className="grid gap-4 items-stretch xl:grid-cols-[minmax(0,1fr)_minmax(340px,1fr)]">
            <div className="flex h-full min-h-[420px] flex-col rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">
                Peak seasonality index
              </div>
              <p className="mb-4 text-xs text-slate-500">
                Monthly shipment profile for actual active months in {effectiveSelectedYear ?? "the selected year"}.
              </p>
              <div className="min-h-[320px]">
                <CompanyActivityChart data={detail.monthlySeries} />
              </div>
              <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <span className="font-semibold text-indigo-600">Observation:</span>{" "}
                This chart only renders real active months from the selected year. No future-month placeholders.
              </div>
            </div>

            <div className="flex h-full min-h-[420px] flex-col rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">
                    {freightosBenchmark?.title || "Market Rate Benchmark"}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Matched to the company’s primary trade lane
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                  <Waves className="h-3.5 w-3.5 text-indigo-500" />
                  Freightos
                </div>
              </div>

              {freightosBenchmark ? (
                <div className="mt-5 space-y-4">
                  <div className="rounded-3xl border border-indigo-200 bg-indigo-50/60 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-700">
                      Benchmark matched
                    </div>
                    <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                      {freightosBenchmark.code}
                    </div>
                    <div className="mt-2 text-sm font-medium text-slate-700">
                      {freightosBenchmark.lane}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      <Ship className="h-3.5 w-3.5 text-cyan-500" />
                      Why this index
                    </div>
                    <div className="mt-2 text-sm text-slate-700">
                      The company’s route intelligence aligns best to {freightosBenchmark.code}. Use this as market
                      benchmark context beside shipment activity and lane concentration.
                    </div>
                  </div>

                  <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Live rate feed
                    </div>
                    <div className="mt-2 text-sm text-slate-700">
                      UI is ready. Current benchmark values will appear here once the Freightos feed is connected
                      server-side.
                    </div>
                    <div className="mt-3 text-xs text-slate-500">
                      Benchmark spot rate for 40 ft containers, not company-specific contract pricing.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-5 rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                  No high-confidence Freightos benchmark match found from current route intelligence.
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 items-stretch xl:grid-cols-[minmax(0,1fr)_minmax(340px,1fr)]">
            <div className="flex h-full min-h-[420px] flex-col rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">
                    Trade lane intelligence
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Strongest lanes by shipment count, TEU, and estimated spend
                  </p>
                </div>
                <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                  {detail.topRoutes.length} lanes
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs uppercase tracking-[0.18em] text-slate-500">
                        <th className="px-3 py-2 font-semibold">#</th>
                        <th className="px-3 py-2 font-semibold">Lane</th>
                        <th className="px-3 py-2 text-right font-semibold">Shipments</th>
                        <th className="px-3 py-2 text-right font-semibold">TEU</th>
                        <th className="px-3 py-2 text-right font-semibold">Est. Spend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.topRoutes.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-500">
                            No trade lane data available yet.
                          </td>
                        </tr>
                      ) : (
                        detail.topRoutes.map((route, i) => (
                          <tr
                            key={i}
                            onClick={() => setSelectedLane(selectedLane === route.lane ? null : route.lane)}
                            className={`cursor-pointer border-b border-slate-50 last:border-b-0 transition-colors ${
                              route.lane === activeLane
  ? "bg-indigo-50 ring-1 ring-indigo-200"
  : "hover:bg-slate-50/70"
                            }`}
                          >
                            <td className="px-3 py-3 text-xs font-semibold text-slate-400">{i + 1}</td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2">
                                <span
                                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                                  style={{
  backgroundColor:
    route.lane === activeLane
      ? TEU_BAR_PRIMARY
      : CHART_COLORS[i % CHART_COLORS.length],
}}
                                />
                                <span className="max-w-[260px] truncate font-semibold text-slate-900">
                                  {route.lane}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right font-semibold text-indigo-600">
                              {formatNumber(route.shipments)}
                            </td>
                            <td className="px-3 py-3 text-right text-slate-700">
                              {formatNumber(route.teu, 1)}
                            </td>
                            <td className="px-3 py-3 text-right text-slate-700">
                              {formatCurrency(route.spend)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">
                    TEU ranking
                  </div>
                  {detail.topRoutes.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
                      No chart data yet.
                    </div>
                  ) : (
                    <div className="h-[280px]">
                      <RechartContainer width="100%" height="100%">
                        <BarChart
                          data={detail.topRoutes.slice(0, 6).map((route) => ({
                            name: route.lane.length > 24 ? `${route.lane.slice(0, 24)}…` : route.lane,
                            teu: route.teu,
                          }))}
                          layout="vertical"
                          margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis type="number" tick={{ fontSize: 11 }} />
                          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                          <RechartTooltip />
                                                    <Bar dataKey="teu" radius={[0, 6, 6, 0]}>
                            {detail.topRoutes.slice(0, 6).map((_, index) => (
                              <Cell
                                key={`teu-cell-${index}`}
                                fill={
  detail.topRoutes.slice(0, 6)[index]?.lane === activeLane
    ? TEU_BAR_PRIMARY
    : TEU_BAR_SECONDARY
}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </RechartContainer>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex h-full min-h-[420px] flex-col rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4">
                <div className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">
                  Equipment intelligence
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Load split, container mix, and equipment footprint
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    <Container className="h-3.5 w-3.5 text-indigo-500" />
                    Load type split
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 px-3 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-widest text-indigo-500">FCL</div>
                      <div className="mt-1 text-lg font-semibold text-slate-900">
                        {formatNumber(detail.fclShipments)}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-cyan-100 bg-cyan-50/60 px-3 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-widest text-cyan-600">LCL</div>
                      <div className="mt-1 text-lg font-semibold text-slate-900">
                        {formatNumber(detail.lclShipments)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    <Boxes className="h-3.5 w-3.5 text-violet-500" />
                    Container type mix
                  </div>

                  {detail.containerMix.length === 0 ? (
                    <div className="mt-4 rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                      Container type data unavailable.
                    </div>
                  ) : (
                    <>
                      <div className="mt-4 h-[220px]">
                        <RechartContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={detail.containerMix}
                              cx="50%"
                              cy="50%"
                              innerRadius="44%"
                              outerRadius="68%"
                              paddingAngle={2}
                              dataKey="value"
                            >
                              {detail.containerMix.map((_, i) => (
                                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                              ))}
                            </Pie>
                            <RechartTooltip formatter={(v: number) => formatNumber(v)} />
                          </PieChart>
                        </RechartContainer>
                      </div>
                      <div className="mt-3 space-y-1">
                        {detail.containerMix.map((ct, i) => (
                          <div
                            key={ct.name}
                            className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-1.5 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                              />
                              <span className="font-medium text-slate-700">{ct.name}</span>
                            </div>
                            <span className="font-semibold text-indigo-600">{formatNumber(ct.value)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,.9fr)]">
            <CommandCenterInsights insights={strategicInsights} />

            <div className="flex h-full min-h-[420px] flex-col rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">
                    AI contact intelligence
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Auto-enriched supply chain and logistics decision makers
                  </p>
                </div>
                <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                  {contactsLoading ? "Enriching…" : `${lushaContacts.length} found`}
                </div>
              </div>

              {contactsLoading ? (
                <div className="space-y-3">
                  {[0, 1, 2].map((idx) => (
                    <div key={idx} className="animate-pulse rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="h-4 w-1/3 rounded bg-slate-200" />
                      <div className="mt-3 h-3 w-1/2 rounded bg-slate-200" />
                    </div>
                  ))}
                </div>
              ) : contactOverviewRows.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                  No high-confidence supply chain or logistics contacts found yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {contactOverviewRows.map((contact: any, index: number) => {
                    const fullName = getContactFullName(contact);
                    const title = getContactTitle(contact);
                    const email = contact.email || contact.email_address || "";
                    const phone = contact.phone || contact.phone_number || "";
                    return (
                      <div
                        key={`${fullName}-${index}`}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-950">{fullName}</div>
                            <div className="mt-1 truncate text-sm text-indigo-600">{title || "Role unavailable"}</div>
                          </div>
                          <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                            Verified
                          </span>
                        </div>
                        <div className="mt-3 space-y-2 text-sm text-slate-600">
                          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                            {email || "Email unavailable"}
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                            {phone || "Phone unavailable"}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                    These contacts are displayed in Overview first. Persistent save into the Contact Intel source is the next backend step.
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="suppliers" className="space-y-4">
          <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">
                  Supplier Intelligence
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {suppliersRaw.length > 0
                    ? `${suppliersRaw.length} verified suppliers across all shipment history`
                    : "Supplier data sourced from verified bill-of-lading records"}
                </p>
              </div>
              {suppliersPageCount > 1 && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>
                    {suppliersPage * supplierPageSize + 1}–
                    {Math.min((suppliersPage + 1) * supplierPageSize, suppliersRaw.length)} of {suppliersRaw.length}
                  </span>
                  <button
                    disabled={suppliersPage === 0}
                    onClick={() => setSuppliersPage((p) => Math.max(0, p - 1))}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <button
                    disabled={suppliersPage >= suppliersPageCount - 1}
                    onClick={() => setSuppliersPage((p) => Math.min(suppliersPageCount - 1, p + 1))}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>

            {suppliersRaw.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                No supplier data available. Supplier intelligence is populated from verified BOL records.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs uppercase tracking-[0.18em] text-slate-500">
                      <th className="px-3 py-3 font-semibold">Supplier</th>
                      <th className="px-3 py-3 font-semibold">Country</th>
                      <th className="px-3 py-3 font-semibold text-right">12m Shpmt</th>
                      <th className="px-3 py-3 font-semibold text-right">Total TEU</th>
                      <th className="px-3 py-3 font-semibold">Recent</th>
                      <th className="px-3 py-3 font-semibold">Tenure</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppliersSlice.map((sup: any, idx: number) => (
                      <tr key={idx} className="border-b border-slate-50 last:border-b-0 hover:bg-slate-50/60">
                        <td className="px-3 py-3 align-top">
                          <div className="max-w-[220px] truncate text-sm font-semibold text-slate-900">
                            {sup.supplier_name || "—"}
                          </div>
                          {sup.supplier_address && (
                            <div className="mt-0.5 max-w-[220px] truncate text-xs text-slate-400">
                              {sup.supplier_address}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 align-top text-sm text-slate-600">
                          {sup.country || sup.supplier_address_country || "—"}
                        </td>
                        <td className="px-3 py-3 align-top text-right text-sm font-semibold text-indigo-600">
                          {formatNumber(sup.shipments_12m)}
                        </td>
                        <td className="px-3 py-3 align-top text-right text-sm text-slate-700">
                          {formatNumber(sup.total_teus, 1)}
                        </td>
                        <td className="px-3 py-3 align-top text-xs text-slate-500">
                          {sup.most_recent_shipment ? formatDate(sup.most_recent_shipment) : "—"}
                        </td>
                        <td className="px-3 py-3 align-top text-xs text-slate-500">
                          {sup.business_length || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="products" className="space-y-4">
          <div className="space-y-3">
            {prodPageCount > 1 && (
              <div className="flex items-center justify-end gap-2 text-xs text-slate-500">
                <span>
                  {productsPage * productsPageSize + 1}–
                  {Math.min((productsPage + 1) * productsPageSize, totalProducts)} of {totalProducts}
                </span>
                <button
                  disabled={productsPage === 0}
                  onClick={() => setProductsPage((p) => Math.max(0, p - 1))}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  disabled={productsPage >= prodPageCount - 1}
                  onClick={() => setProductsPage((p) => Math.min(prodPageCount - 1, p + 1))}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <MetricList
                title={`Product mix — HS codes (${totalProducts})`}
                items={hsSlice.map((row) => ({
                  label: row.hsCode,
                  value: formatNumber(row.count),
                  meta: row.description,
                }))}
              />
              <MetricList
                title="Top products"
                items={prodSlice.map((row) => ({
                  label: String(row.product),
                  value: row.volumeShare,
                  meta: `HS ${row.hsCode}`,
                }))}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <div className="space-y-3">
            {histPageCount > 1 && (
              <div className="flex items-center justify-end gap-2 text-xs text-slate-500">
                <span>
                  {historyPage * historyPageSize + 1}–
                  {Math.min((historyPage + 1) * historyPageSize, totalRows)} of {totalRows} shipments
                </span>
                <button
                  disabled={historyPage === 0}
                  onClick={() => setHistoryPage((p) => Math.max(0, p - 1))}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  disabled={historyPage >= histPageCount - 1}
                  onClick={() => setHistoryPage((p) => Math.min(histPageCount - 1, p + 1))}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}

            <DataTable
              title={`Verified shipment ledger — ${totalRows} records`}
              columns={[
                "Arrival Date",
                "Master BOL",
                "House BOL",
                "Importer ID",
                "Importer Name",
                "Consignee Name",
                "Consignee Address",
                "Shipper",
                "Shipper Address",
                "Carrier Code",
                "Carrier Name",
                "Forwarder Code",
                "Forwarder Name",
                "Notify Party",
                "Port Of Unlading ID",
                "Port Of Unlading",
                "Port Of Lading ID",
                "Port Of Lading",
                "Container Types",
                "Route",
                "Vessel",
                "Voyage Number",
                "TEU",
                "Weight (kg)",
                "Gross Weight",
                "Volume",
                "Cargo Description",
                "Product",
                "HS Code",
              ]}
              rows={histSlice}
            />
          </div>
        </TabsContent>

        <TabsContent value="credit" className="space-y-4">
          <div className="flex min-h-[200px] items-center justify-center rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="relative w-full text-center">
              <div className="pointer-events-none absolute inset-0 flex select-none items-center justify-center opacity-10">
                <span className="text-6xl font-extrabold uppercase tracking-widest">Credit Rating</span>
              </div>
              <div className="relative p-4">
                <p className="text-sm text-slate-500">
                  Financial data and credit ratings for publicly traded companies will appear here once the
                  FinancialModelingPrep and related APIs are integrated.
                </p>
                <p className="mt-2 text-xs italic text-slate-400">Integration pending – placeholder only.</p>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="contacts" className="space-y-4">
          <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">
                  Contact intelligence
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Enriched contacts sourced from Lusha. Persistent contact save is the next backend step.
                </p>
              </div>
            </div>

            {contactsLoading ? (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                Loading contacts…
              </div>
            ) : lushaContacts.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                No contacts found. Adjust enrichment filters in the backend step or try another company.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
                <div className="space-y-2">
                  {lushaContacts.map((contact: any, index: number) => {
                    const fullName = getContactFullName(contact);
                    const title = getContactTitle(contact);
                    const initials =
                      fullName
                        .split(" ")
                        .slice(0, 2)
                        .map((part: string) => part[0])
                        .join("")
                        .toUpperCase() || "CT";
                    const isActive = selectedContact === contact;

                    return (
                      <button
                        key={`${fullName}-${index}`}
                        onClick={() => setSelectedContact(contact)}
                        className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left ${
                          isActive ? "border-indigo-300 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <div className="rounded-2xl bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          {initials}
                        </div>
                        <div className="flex-1">
                          <div className="truncate text-sm font-semibold text-slate-950">{fullName}</div>
                          {title && <div className="truncate text-xs text-slate-500">{title}</div>}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div>
                  {selectedContact ? (
                    (() => {
                      const fullName = getContactFullName(selectedContact);
                      const title = getContactTitle(selectedContact);
                      const email = selectedContact.email || selectedContact.email_address || "";
                      const phone = selectedContact.phone || selectedContact.phone_number || "";
                      const initials =
                        fullName
                          .split(" ")
                          .slice(0, 2)
                          .map((part: string) => part[0])
                          .join("")
                          .toUpperCase() || "CT";

                      return (
                        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                          <div className="mb-3 flex items-start justify-between gap-3">
                            <div className="rounded-2xl bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
                              {initials}
                            </div>
                            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                              Verified
                            </span>
                          </div>
                          <div className="text-lg font-semibold text-slate-950">{fullName}</div>
                          {title && <div className="mt-1 text-sm font-medium text-indigo-600">{title}</div>}
                          <div className="mt-4 space-y-2 text-sm text-slate-600">
                            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                              {email || "Email unavailable"}
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                              {phone || "Phone unavailable"}
                            </div>
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                      Select a contact to view details.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}
