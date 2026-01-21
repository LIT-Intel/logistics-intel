import React from "react";
import {
  Bookmark,
  BookmarkCheck,
  Calendar,
  Globe,
  Loader2,
  MapPin,
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

export default function ShipperCard({
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
  // TODO: replace logo.dev lookup with Gemini 3 enrichment service for official logos.
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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className="flex h-full flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-lg hover:border-blue-300 hover:-translate-y-1 transition-all duration-200 group relative overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

      <div className="relative">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <motion.div
            whileHover={{ scale: 1.05 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <CompanyAvatar
              name={displayName}
              logoUrl={logoUrl ?? undefined}
              className="rounded-full"
              size="lg"
            />
          </motion.div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="max-w-full text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors flex-1" title={displayName}>
                {displayName}
              </p>
              {flagEmoji && <span className="text-lg leading-none flex-shrink-0 whitespace-nowrap">{flagEmoji}</span>}
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2 + index * 0.05 }}
                className="rounded-full bg-gradient-to-br from-violet-50 to-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700 border border-violet-200"
              >
                AI enriched
              </motion.span>
            </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3 text-slate-400" />
              <span className="truncate">{address}</span>
            </span>
            {website && (
              <a
                href={website.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex max-w-[160px] items-center gap-1 text-indigo-600 hover:underline"
              >
                <Globe className="h-3 w-3" />
                <span className="truncate">{website.label}</span>
              </a>
            )}
            </div>
          </div>
          {onToggleSaved && (
            <motion.button
              type="button"
              onClick={() => !saving && onToggleSaved(shipper)}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className={`ml-auto rounded-full border p-2 disabled:cursor-not-allowed disabled:opacity-60 transition-all ${
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
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 + index * 0.05 }}
        className="relative mt-4 grid gap-3 text-xs md:grid-cols-3"
      >
        <motion.div
          whileHover={{ scale: 1.02, y: -2 }}
          className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100 px-3 py-2 shadow-sm hover:shadow-md transition-all"
        >
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-blue-700">
            <Package className="h-3.5 w-3.5" />
            <span>Shipments</span>
          </p>
          <p className="mt-1 text-sm font-semibold text-blue-900 flex items-center gap-1">
            {formatNumber(shipper.totalShipments ?? shipper.shipmentsLast12m)}
            {isHovered && (
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 200 }}
              >
                <TrendingUp className="w-3 h-3 text-green-600" />
              </motion.div>
            )}
          </p>
        </motion.div>
        <motion.div
          whileHover={{ scale: 1.02, y: -2 }}
          className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-100 px-3 py-2 shadow-sm hover:shadow-md transition-all"
        >
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-emerald-700">
            <Calendar className="h-3.5 w-3.5" />
            <span>Last Activity</span>
          </p>
          <p className="mt-1 text-sm font-medium text-emerald-900">
            {formatDate(shipper.lastShipmentDate ?? shipper.mostRecentShipment)}
          </p>
        </motion.div>
        <motion.div
          whileHover={{ scale: 1.02, y: -2 }}
          className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100 px-3 py-2 shadow-sm hover:shadow-md transition-all"
        >
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-amber-700">
            <TrendingUp className="h-3.5 w-3.5" />
            <span>Top Route</span>
          </p>
          <p className="mt-1 text-sm font-semibold text-amber-900 truncate" title={topRoute}>
            {topRoute || "—"}
          </p>
        </motion.div>
      </motion.div>

      <div className="relative mt-4 flex items-center justify-between">
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
