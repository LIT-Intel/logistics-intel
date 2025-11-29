import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar,
} from "recharts";
import {
  BookmarkIcon,
  BookmarkSlashIcon,
  CubeIcon,
  CurrencyDollarIcon,
  GlobeAltIcon,
  PhoneIcon,
  Squares2X2Icon,
  SquaresPlusIcon,
  TruckIcon,
  ClockIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { getCompanyLogoUrl } from "@/lib/logo";
import {
  type IyShipperHit,
  type IyCompanyProfile,
  type IyRouteKpis,
  getFclShipments12m,
  getLclShipments12m,
} from "@/lib/api";

const numberFormatter = new Intl.NumberFormat("en-US");
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const formatNumber = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) return "—";
  return numberFormatter.format(value);
};

const formatCurrency = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) return "—";
  return currencyFormatter.format(value);
};

const formatDateLabel = (value: string | null | undefined) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
};

const normalizeWebsite = (value?: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const monthLabel = (value: string) => {
  if (!value) return "";
  const isoMatch = value.match(/^(\d{4})-(\d{2})/);
  if (isoMatch) {
    const date = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, 1);
    return date.toLocaleDateString(undefined, { month: "short" });
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString(undefined, { month: "short" });
  }
  return value;
};

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim();
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeEnrichmentList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") return entry.trim();
        if (entry && typeof entry === "object") {
          if ("text" in entry && typeof (entry as any).text === "string") {
            return ((entry as any).text as string).trim();
          }
          if ("value" in entry && typeof (entry as any).value === "string") {
            return ((entry as any).value as string).trim();
          }
          if ("description" in entry && typeof (entry as any).description === "string") {
            return ((entry as any).description as string).trim();
          }
          if ("title" in entry && typeof (entry as any).title === "string") {
            const title = ((entry as any).title as string).trim();
            const desc =
              typeof (entry as any).description === "string"
                ? (entry as any).description.trim()
                : "";
            return desc ? `${title} – ${desc}` : title;
          }
        }
        return "";
      })
      .filter((item) => item.length > 0);
  }
  if (typeof value === "string") {
    return value
      .split(/\n+/)
      .map((line) => line.replace(/^[*-]\s*/, "").trim())
      .filter((line) => line.length > 0);
  }
  return [];
}

function pickEnrichmentSummary(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  if (!value || typeof value !== "object") return null;
  const candidates = [
    (value as any).summary,
    (value as any).overview,
    (value as any).description,
    (value as any).narrative,
    (value as any).highlights,
    (value as any).ai_summary,
    (value as any)?.ai?.summary,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
}

const ChartTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const data = payload.reduce(
    (acc: Record<string, number>, item: any) => ({
      ...acc,
      [item.name]: item.value ?? 0,
    }),
    {},
  );
  return (
    <div className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-50 shadow-xl">
      <p className="font-semibold">Month: {label}</p>
      <p>FCL: {formatNumber(data.FCL ?? 0)}</p>
      <p>LCL: {formatNumber(data.LCL ?? 0)}</p>
    </div>
  );
};

const ACCENT_MAP: Record<string, string> = {
  indigo: "border-indigo-100 bg-indigo-50",
  blue: "border-blue-100 bg-blue-50",
  emerald: "border-emerald-100 bg-emerald-50",
  "indigo-strong": "border-indigo-200 bg-indigo-100",
  green: "border-green-100 bg-green-50",
  slate: "border-slate-200 bg-slate-50",
};

const ICON_CONTAINER_CLASS =
  "mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/5 text-slate-600";

type KpiTileProps = {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  accent: keyof typeof ACCENT_MAP;
};

const KpiTile: React.FC<KpiTileProps> = ({ label, value, icon: Icon, accent }) => (
  <div className={`flex flex-col gap-1 rounded-xl border px-4 py-3 ${ACCENT_MAP[accent]}`}>
    <div className={ICON_CONTAINER_CLASS}>
      <Icon className="h-3.5 w-3.5" />
    </div>
    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
      {label}
    </p>
    <p className="text-xl font-semibold text-slate-900 md:text-2xl">{value}</p>
  </div>
);

type ShipperDetailModalProps = {
  isOpen: boolean;
  shipper: IyShipperHit | null;
  loadingProfile: boolean;
  profile: IyCompanyProfile | null;
  routeKpis?: IyRouteKpis | null;
  enrichment: any | null;
  error: string | null;
  onClose: () => void;
  onSaveToCommandCenter: (opts: {
    shipper: IyShipperHit;
    profile: IyCompanyProfile | null;
  }) => void;
  saveLoading: boolean;
  isSaved?: boolean;
};

export default function ShipperDetailModal({
  isOpen,
  shipper,
  loadingProfile,
  profile,
  routeKpis = null,
  enrichment,
  error,
  onClose,
  onSaveToCommandCenter,
  saveLoading,
  isSaved = false,
}: ShipperDetailModalProps) {
  if (!isOpen || !shipper) return null;

  const normalizedWebsite = React.useMemo(() => {
    const profileWebsite =
      profile?.website ||
      (profile?.domain ? `https://${profile.domain}` : null);
    const hitWebsite =
      shipper.website ||
      (shipper.domain ? `https://${shipper.domain}` : null);
    return normalizeWebsite(profileWebsite ?? hitWebsite ?? null);
  }, [profile?.website, profile?.domain, shipper.website, shipper.domain]);

  const normalizedPhone =
    profile?.phoneNumber ??
    profile?.phone ??
    shipper.phone ??
    ((shipper as any)?.contact?.phone ?? null);

  const companyId =
    profile?.key ??
    profile?.companyId ??
    shipper.key ??
    shipper.companyId ??
    "";
  const domain = profile?.domain ?? shipper.domain ?? shipper.website ?? null;
  const logoUrl = domain ? getCompanyLogoUrl(domain) : undefined;

  const resolvedRouteKpis = routeKpis ?? profile?.routeKpis ?? null;
  const shipments12m =
    coerceNumber(resolvedRouteKpis?.shipmentsLast12m) ??
    coerceNumber(profile?.totalShipments) ??
    coerceNumber(shipper.totalShipments) ??
    coerceNumber(shipper.shipmentsLast12m);
  const teu12m =
    coerceNumber(resolvedRouteKpis?.teuLast12m) ??
    coerceNumber(shipper.teusLast12m);
  const estSpend12m =
    coerceNumber(resolvedRouteKpis?.estSpendUsd12m) ??
    coerceNumber(profile?.estSpendUsd12m) ??
    coerceNumber(shipper.estSpendLast12m);
  const fclShipments12m = getFclShipments12m(profile);
  const lclShipments12m = getLclShipments12m(profile);
  const lastShipmentDate =
    profile?.lastShipmentDate ??
    shipper.lastShipmentDate ??
    shipper.mostRecentShipment ??
    null;
  const topRouteLast12m =
    resolvedRouteKpis?.topRouteLast12m ??
    shipper.primaryRouteSummary ??
    shipper.primaryRoute ??
    null;
  const mostRecentRoute =
    resolvedRouteKpis?.mostRecentRoute ??
    shipper.primaryRouteSummary ??
    shipper.primaryRoute ??
    null;
  const topRoutes = Array.isArray(resolvedRouteKpis?.topRoutesLast12m)
    ? resolvedRouteKpis.topRoutesLast12m.slice(0, 5)
    : [];

  const chartData = React.useMemo(
    () =>
      Array.isArray(profile?.timeSeries)
        ? profile.timeSeries.slice(-12).map((point) => ({
            monthLabel: monthLabel(point.month),
            fcl: coerceNumber(point.fclShipments) ?? 0,
            lcl: coerceNumber(point.lclShipments) ?? 0,
          }))
        : [],
    [profile?.timeSeries],
  );

  const supplierList = React.useMemo(() => {
    const list = profile?.topSuppliers ?? shipper.topSuppliers ?? [];
    if (!Array.isArray(list)) return [];
    return list
      .map((entry: any) =>
        typeof entry === "string"
          ? entry
          : entry?.name ?? entry?.supplier_name ?? entry?.company ?? "",
      )
      .filter((value: string) => Boolean(value))
      .slice(0, 6);
  }, [profile?.topSuppliers, shipper.topSuppliers]);

  const enrichmentSummary = React.useMemo(
    () => pickEnrichmentSummary(enrichment),
    [enrichment],
  );
  const enrichmentOpportunities = React.useMemo(
    () =>
      normalizeEnrichmentList(
        enrichment?.opportunities ??
          enrichment?.opportunityInsights ??
          enrichment?.opportunity_insights ??
          enrichment?.ai?.opportunities ??
          enrichment?.opportunityBullets,
      ),
    [enrichment],
  );
  const enrichmentRisks = React.useMemo(
    () =>
      normalizeEnrichmentList(
        enrichment?.risks ??
          enrichment?.riskInsights ??
          enrichment?.risk_insights ??
          enrichment?.watchouts ??
          enrichment?.ai?.risks,
      ),
    [enrichment],
  );
  const enrichmentTalkingPoints = React.useMemo(
    () =>
      normalizeEnrichmentList(
        enrichment?.talkingPoints ??
          enrichment?.recommendedTalkingPoints ??
          enrichment?.recommended_actions ??
          enrichment?.actions ??
          enrichment?.ai?.talkingPoints,
      ),
    [enrichment],
  );
  const enrichmentExtraSections = React.useMemo(() => {
    if (!Array.isArray(enrichment?.sections)) return [];
    return enrichment.sections
      .map((section: any) => {
        const label =
          typeof section?.title === "string"
            ? section.title
            : typeof section?.label === "string"
              ? section.label
              : null;
        const items = normalizeEnrichmentList(
          section?.items ??
            section?.bullets ??
            section?.points ??
            section?.content,
        );
        if (!label || items.length === 0) return null;
        return { label, items };
      })
      .filter(
        (entry): entry is { label: string; items: string[] } => Boolean(entry),
      );
  }, [enrichment]);

  const hasEnrichmentContent = Boolean(
    enrichmentSummary ||
      enrichmentOpportunities.length ||
      enrichmentRisks.length ||
      enrichmentTalkingPoints.length ||
      enrichmentExtraSections.length,
  );

  const showEnrichmentBanner = !enrichment && !loadingProfile;

  const kpiItems: KpiTileProps[] = [
    {
      label: "Shipments (12m)",
      value: formatNumber(shipments12m),
      icon: TruckIcon,
      accent: "indigo",
    },
    {
      label: "Estimated TEU (12m)",
      value: formatNumber(teu12m),
      icon: CubeIcon,
      accent: "blue",
    },
    {
      label: "Est. spend (12m)",
      value: formatCurrency(estSpend12m),
      icon: CurrencyDollarIcon,
      accent: "emerald",
    },
    {
      label: "FCL shipments",
      value: formatNumber(fclShipments12m),
      icon: Squares2X2Icon,
      accent: "indigo-strong",
    },
    {
      label: "LCL shipments",
      value: formatNumber(lclShipments12m),
      icon: SquaresPlusIcon,
      accent: "green",
    },
    {
      label: "Last shipment",
      value: formatDateLabel(lastShipmentDate),
      icon: ClockIcon,
      accent: "slate",
    },
  ];

  const handleSaveClick = () => {
    if (!shipper || saveLoading) return;
    onSaveToCommandCenter({ shipper, profile: profile ?? null });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/60 px-4 py-6">
      <div className="relative mt-6 mb-6 flex w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4 md:px-8">
          <div className="flex items-start gap-4">
            <CompanyAvatar name={shipper.title} logoUrl={logoUrl} size="lg" />
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                  {profile?.title || shipper.title || shipper.name || "Company"}
                </h2>
                {isSaved && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                    Saved
                  </span>
                )}
              </div>
              {companyId && (
                <p className="text-xs text-slate-500">{companyId}</p>
              )}
              <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                {normalizedWebsite && (
                  <a
                    href={normalizedWebsite}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
                  >
                    <GlobeAltIcon className="h-4 w-4" />
                    <span className="truncate max-w-[180px]">
                      {normalizedWebsite.replace(/^https?:\/\//i, "")}
                    </span>
                  </a>
                )}
                {normalizedPhone && (
                  <a
                    href={`tel:${normalizedPhone}`}
                    className="inline-flex items-center gap-1"
                  >
                    <PhoneIcon className="h-4 w-4" />
                    <span>{normalizedPhone}</span>
                  </a>
                )}
              </div>
              {showEnrichmentBanner && (
                <p className="text-xs text-amber-600">
                  AI enrichment not available for this company yet.
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveClick}
              disabled={saveLoading}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition ${
                isSaved
                  ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  : "bg-indigo-600 text-white hover:bg-indigo-500"
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {isSaved ? (
                <BookmarkSlashIcon className="h-4 w-4" />
              ) : (
                <BookmarkIcon className="h-4 w-4" />
              )}
              <span>
                {isSaved ? "Saved to Command Center" : saveLoading ? "Saving…" : "Save to Command Center"}
              </span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="max-h-[calc(100vh-8rem)] overflow-y-auto px-6 py-6 md:px-8">
          {(loadingProfile || error) && (
            <div className="mb-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {loadingProfile && <div>Loading company profile…</div>}
              {error && !loadingProfile && (
                <div className="text-rose-600">{error}</div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {kpiItems.map((item) => (
              <KpiTile key={item.label} {...item} />
            ))}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Top route (last 12m)
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {topRouteLast12m || "Not available yet"}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Most recent route
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {mostRecentRoute || "Not available yet"}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-3">
            <div className="space-y-4 md:col-span-2">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 md:px-6 md:py-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Activity last 12 months
                    </p>
                    <p className="text-xs text-slate-500">
                      Monthly shipments split between FCL and LCL services.
                    </p>
                  </div>
                  {loadingProfile && (
                    <p className="text-xs text-slate-400">Loading trend…</p>
                  )}
                </div>
                {chartData.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No lane-level trend data available yet for this shipper.
                  </p>
                ) : (
                  <div className="h-56 w-full">
                    <ResponsiveContainer>
                      <BarChart
                        data={chartData}
                        margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
                        barSize={12}
                      >
                        <defs>
                          <linearGradient id="fclGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#6C4DFF" stopOpacity={1} />
                            <stop offset="100%" stopColor="#4C8DFF" stopOpacity={0.9} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          dataKey="monthLabel"
                          tick={{ fontSize: 10, fill: "#64748b" }}
                          tickLine={false}
                        />
                        <YAxis tick={{ fontSize: 10, fill: "#64748b" }} allowDecimals={false} />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(15,23,42,0.04)" }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} verticalAlign="top" align="right" />
                        <Bar
                          dataKey="fcl"
                          name="FCL"
                          fill="url(#fclGradient)"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          dataKey="lcl"
                          name="LCL"
                          fill="#22c55e"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Top lanes (last 12m)
                </p>
                {topRoutes.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Lane-level shipment data is not available for this company yet.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5 text-xs text-slate-700">
                    {topRoutes.map((lane, idx) => (
                      <li key={`${lane.route}-${idx}`} className="flex items-center justify-between gap-2">
                        <span className="truncate">{lane.route}</span>
                        <span className="text-[11px] text-slate-500">
                          {formatNumber(lane.shipments ?? null)} shipments
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="space-y-4">
              {enrichment && (
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    AI insights
                  </p>
                  {hasEnrichmentContent ? (
                    <>
                      {enrichmentSummary && (
                        <p className="mt-2 text-sm text-slate-800 whitespace-pre-line">
                          {enrichmentSummary}
                        </p>
                      )}
                      {enrichmentOpportunities.length > 0 && (
                        <div className="mt-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Opportunities
                          </p>
                          <ul className="mt-1 space-y-1 text-xs text-slate-700">
                            {enrichmentOpportunities.map((item, idx) => (
                              <li key={`opp-${idx}`} className="flex items-start gap-2">
                                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-500" />
                                <span className="leading-snug">{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {enrichmentRisks.length > 0 && (
                        <div className="mt-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Risks
                          </p>
                          <ul className="mt-1 space-y-1 text-xs text-slate-700">
                            {enrichmentRisks.map((item, idx) => (
                              <li key={`risk-${idx}`} className="flex items-start gap-2">
                                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-rose-500" />
                                <span className="leading-snug">{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {enrichmentTalkingPoints.length > 0 && (
                        <div className="mt-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Recommended talking points
                          </p>
                          <ul className="mt-1 space-y-1 text-xs text-slate-700">
                            {enrichmentTalkingPoints.map((item, idx) => (
                              <li key={`talk-${idx}`} className="flex items-start gap-2">
                                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                <span className="leading-snug">{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {enrichmentExtraSections.map((section, sectionIdx) => (
                        <div className="mt-3" key={`${section.label}-${sectionIdx}`}>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            {section.label}
                          </p>
                          <ul className="mt-1 space-y-1 text-xs text-slate-700">
                            {section.items.map((item, idx) => (
                              <li
                                key={`${section.label}-${sectionIdx}-${idx}`}
                                className="flex items-start gap-2"
                              >
                                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-400" />
                                <span className="leading-snug">{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">
                      AI enrichment response available but no structured insights were returned.
                    </p>
                  )}
                </div>
              )}
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Top suppliers (sample)
                </p>
                {supplierList.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Supplier details will appear here once available from LIT Search data.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1 text-xs text-slate-700">
                    {supplierList.map((supplier) => (
                      <li key={supplier} className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                        <span className="truncate">{supplier}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-xs text-slate-500">
                <p className="font-medium text-slate-700">What you’re seeing</p>
                <p className="mt-1">
                  Cards and KPIs are based on ImportYeti DMA data. As we add more stats (lanes, vendor mix, service levels), they’ll show up here automatically.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
