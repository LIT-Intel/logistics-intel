import React from "react";
import {
  Bookmark,
  BookmarkCheck,
  Calendar,
  Globe,
  Loader2,
  MapPin,
  Package,
  TrendingUp,
} from "lucide-react";
import { motion } from "framer-motion";
import type { IyShipperHit } from "@/lib/api";
import { getCompanyLogoUrl } from "@/lib/logo";
import { CompanyAvatar } from "@/components/CompanyAvatar";

const formatNumber = (value: number | null | undefined) =>
  typeof value === "number" ? value.toLocaleString() : "—";

const formatDate = (value: string | null | undefined) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const buildAddress = (shipper: IyShipperHit) => {
  if (shipper.address) return shipper.address;
  const parts = [shipper.city, shipper.state, shipper.country]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : "Location unavailable";
};

const countryCodeToEmoji = (code?: string | null) => {
  if (!code) return null;
  const normalized = code.trim().slice(0, 2).toUpperCase();
  if (normalized.length !== 2) return null;
  return normalized
    .split("")
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
};

const normalizeWebsite = (value?: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const href = /^https?:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const label = trimmed.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  return { href, label };
};

type Props = {
  shipper: IyShipperHit;
  onViewDetails?: (shipper: IyShipperHit) => void;
  isSaved?: boolean;
  onToggleSaved?: (shipper: IyShipperHit) => void;
  saving?: boolean;
  index?: number;
};

export default function ShipperListItem({
  shipper,
  onViewDetails,
  isSaved = false,
  onToggleSaved,
  saving = false,
  index = 0,
}: Props) {
  const displayName = shipper.title || shipper.name || "LIT Search shipper";
  const flagEmoji = countryCodeToEmoji(shipper.countryCode);
  const address = buildAddress(shipper);
  const logoUrl = getCompanyLogoUrl(shipper.domain ?? shipper.website ?? undefined);
  const website = normalizeWebsite(shipper.website ?? shipper.domain ?? null);
  const topRoute =
    shipper.primaryRouteSummary ||
    (shipper as any).topRoute ||
    (shipper as any).mostRecentRoute ||
    "Route data available in profile";

  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.03 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-blue-300 hover:bg-blue-50/30 transition-all duration-200 group relative overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

      <motion.div
        whileHover={{ scale: 1.05 }}
        transition={{ type: "spring", stiffness: 300 }}
        className="relative flex-shrink-0"
      >
        <CompanyAvatar
          name={displayName}
          logoUrl={logoUrl ?? undefined}
          className="rounded-full"
          size="lg"
        />
      </motion.div>

      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-semibold text-slate-900 group-hover:text-blue-600 transition-colors truncate flex-1 min-w-0" title={displayName}>
                {displayName}
              </p>
              {flagEmoji && <span className="text-lg leading-none flex-shrink-0 whitespace-nowrap">{flagEmoji}</span>}
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.1 + index * 0.03 }}
                className="rounded-full bg-gradient-to-br from-violet-50 to-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700 border border-violet-200"
              >
                AI enriched
              </motion.span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3 text-slate-400 flex-shrink-0" />
                <span className="truncate">{address}</span>
              </span>
              {website && (
                <a
                  href={website.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Globe className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate max-w-[160px]">{website.label}</span>
                </a>
              )}
            </div>
          </div>

          {onToggleSaved && (
            <motion.button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                !saving && onToggleSaved(shipper);
              }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className={`flex-shrink-0 rounded-full border p-2 disabled:cursor-not-allowed disabled:opacity-60 transition-all ${
                isSaved
                  ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                  : "border-slate-200 bg-white text-slate-500 hover:border-blue-300 hover:text-blue-600"
              }`}
              aria-label={isSaved ? "Remove from saved" : "Save company"}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              ) : isSaved ? (
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 200 }}
                >
                  <BookmarkCheck className="h-4 w-4" />
                </motion.div>
              ) : (
                <Bookmark className="h-4 w-4" />
              )}
            </motion.button>
          )}
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-gradient-to-br from-blue-50 to-white px-3 py-2 group-hover:border-blue-200 transition-all">
            <Package className="h-4 w-4 text-blue-600 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase text-slate-500 truncate">Shipments</p>
              <p className="text-sm font-semibold text-slate-900 flex items-center gap-1">
                {formatNumber(shipper.totalShipments ?? shipper.shipmentsLast12m)}
                {isHovered && <TrendingUp className="w-3 h-3 text-green-600" />}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white px-3 py-2 group-hover:border-emerald-200 transition-all">
            <Calendar className="h-4 w-4 text-emerald-600 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase text-slate-500 truncate">Last Activity</p>
              <p className="text-sm font-medium text-slate-900 truncate">
                {formatDate(shipper.lastShipmentDate ?? shipper.mostRecentShipment)}
              </p>
            </div>
          </div>

          <div className="col-span-2 flex items-center gap-2 rounded-lg border border-amber-100 bg-gradient-to-br from-amber-50 to-white px-3 py-2 group-hover:border-amber-200 transition-all">
            <TrendingUp className="h-4 w-4 text-amber-600 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase text-slate-500 truncate">Top Route</p>
              <p className="text-sm font-semibold text-slate-900 truncate" title={topRoute}>
                {topRoute || "—"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-shrink-0">
        <motion.button
          type="button"
          onClick={() => onViewDetails?.(shipper)}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="inline-flex items-center gap-2 rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 hover:shadow-md transition-all"
        >
          View details
          <motion.span
            animate={{ x: isHovered ? 2 : 0 }}
            transition={{ duration: 0.2 }}
          >
            →
          </motion.span>
        </motion.button>
      </div>
    </motion.div>
  );
}
