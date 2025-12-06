import React from "react";
import { MapPin, Ship, Sparkles, TrendingUp } from "lucide-react";
import type { IyCompanyProfile, IyShipperHit } from "@/lib/api";
import { buildCompanySnapshot } from "@/components/common/companyViewModel";

const cn = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

type SearchResultCardProps = {
  shipper: IyShipperHit;
  isSaved: boolean;
  saving: boolean;
  isActive?: boolean;
  // allow the async handler from Search.tsx
  onToggleSave: () => void | Promise<void>;
  onOpenDetails: () => void;
  onSelect?: () => void;
  profile?: IyCompanyProfile | null;
};

const SearchResultCard: React.FC<SearchResultCardProps> = ({
  shipper,
  isSaved,
  saving,
  isActive = false,
  onToggleSave,
  onOpenDetails,
  onSelect,
  profile = null,
}) => {
  const companyKey =
    shipper.companyKey ||
    shipper.key ||
    shipper.companyId ||
    shipper.title ||
    shipper.name ||
    "";

  const fallbackPayload = {
    shipments_12m: shipper.shipmentsLast12m ?? shipper.totalShipments ?? null,
    teus_12m: shipper.teusLast12m ?? null,
    last_shipment_date:
      shipper.lastShipmentDate ?? shipper.mostRecentShipment ?? null,
    top_route_label:
      shipper.primaryRouteSummary ?? shipper.primaryRoute ?? null,
    address:
      shipper.address ??
      [shipper.city, shipper.state, shipper.country]
        .filter(Boolean)
        .join(", ") ??
      null,
    country: shipper.country ?? null,
    country_code: shipper.countryCode ?? null,
    domain: shipper.domain ?? shipper.website ?? null,
    website: shipper.website ?? null,
  };

  const snapshot = buildCompanySnapshot({
    profile,
    enrichment: null,
    fallback: {
      companyId: companyKey,
      name: shipper.title ?? shipper.name ?? "Company",
      payload: fallbackPayload,
    },
  });

  const shipmentsValue =
    snapshot.shipments12m ??
    shipper.totalShipments ??
    shipper.shipmentsLast12m ??
    null;

  const topRoute =
    snapshot.topRouteLabel ?? "Route data available in details";

  const activityLabel = formatLastActivity(
    snapshot.recentShipmentDate ??
      shipper.mostRecentShipment ??
      shipper.lastShipmentDate ??
      null,
  );

  const locationLabel =
    fallbackPayload.address || "Location unavailable";

  const subtitle = [
    shipper.key,
    shipper.domain ?? shipper.website ?? "No website",
  ]
    .filter(Boolean)
    .join(" • ");

  const initials =
    (shipper.title || shipper.name || "Company")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "CC";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyUp={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect?.();
        }
      }}
      className={cn(
        "flex h-full flex-col justify-between rounded-3xl border bg-white p-5 shadow-sm transition",
        isActive
          ? "border-indigo-500 shadow-xl shadow-indigo-100"
          : "border-slate-200 hover:border-indigo-300",
      )}
    >
      <div>
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#5C4DFF] to-[#7F5CFF] text-sm font-semibold text-white shadow-md">
            {initials}
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold text-slate-900">
              {shipper.title || shipper.name || "Company"}
            </h3>
            <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <Badge icon={<MapPin className="h-3 w-3" />}>
            {locationLabel}
          </Badge>
          <Badge icon={<Sparkles className="h-3 w-3" />}>
            AI enrichment ready
          </Badge>
        </div>

        <div className="mt-4 grid gap-3 text-xs text-slate-600">
          <MetricCard
            icon={<Ship className="h-4 w-4 text-indigo-500" />}
            label="Shipments (12m)"
            value={formatNumber(shipmentsValue)}
          />
          <MetricCard
            icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
            label="Activity"
            value={activityLabel}
          />
          <MetricCard
            icon={<Sparkles className="h-4 w-4 text-amber-500" />}
            label="Top route"
            value={topRoute}
          />
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void onToggleSave();
          }}
          disabled={saving}
          className={cn(
            "rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition",
            isSaved
              ? "bg-emerald-500 hover:bg-emerald-600"
              : "bg-indigo-600 hover:bg-indigo-700",
            saving && "cursor-not-allowed opacity-60",
          )}
        >
          {saving ? "Saving…" : isSaved ? "Saved" : "Save"}
        </button>

        <div className="flex items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-indigo-700">
            <Sparkles className="h-3 w-3" /> Ready
          </span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenDetails();
            }}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900"
          >
            Details →
          </button>
        </div>
      </div>
    </div>
  );
};

export default SearchResultCard;

const Badge: React.FC<{
  icon?: React.ReactNode;
  children: React.ReactNode;
}> = ({ icon, children }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-600">
    {icon}
    {children}
  </span>
);

const MetricCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
}> = ({ icon, label, value }) => (
  <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm">
      {icon}
    </span>
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  </div>
);

function formatNumber(value: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
  return Number(value).toLocaleString();
}

function formatLastActivity(value: string | null) {
  if (!value) return "No recent activity";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  const diffMs = Date.now() - parsed.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 30) return `${diffDays} days ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return "1 month ago";
  if (diffMonths < 12) return `${diffMonths} months ago`;
  const diffYears = Math.floor(diffMonths / 12);
  return diffYears === 1 ? "1 year ago" : `${diffYears} years ago`;
}
