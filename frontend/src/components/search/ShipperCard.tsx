import { useEffect, useRef } from "react";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import type { IyCompanyContact, IyRouteKpis, IyShipperHit } from "@/lib/api";
import { Calendar, MapPin, Package, Target } from "lucide-react";
import { getCompanyLogoUrl } from "@/lib/logo";

function countryCodeToEmoji(countryCode?: string | null): string | null {
  if (!countryCode) return null;
  const cc = countryCode.toUpperCase();
  if (cc.length !== 2) return null;

  const codePoints = Array.from(cc).map((ch) => 127397 + ch.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

type ShipperCardProps = {
  shipper: IyShipperHit;
  contact?: IyCompanyContact | null;
  kpis?: IyRouteKpis | null;
  topRoute?: string | null;
  teus12m?: number | null;
  shipments12m?: number | null;
  onViewDetails?: () => void;
  onSave?: () => void;
  onPrefetchKpis?: () => void;
  isSaving?: boolean;
  isSaved?: boolean;
};

export default function ShipperCard({
  shipper,
  contact,
  kpis,
  topRoute,
  teus12m,
  shipments12m,
  onViewDetails,
  onSave,
  onPrefetchKpis,
  isSaving,
  isSaved,
}: ShipperCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!onPrefetchKpis || kpis || typeof window === "undefined") {
      return;
    }
    const element = cardRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            onPrefetchKpis();
            observer.disconnect();
          }
        });
      },
      { threshold: 0.25 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [kpis, onPrefetchKpis]);

  const countryCode =
    shipper.countryCode ??
    (shipper as any)?.country_code ??
    (shipper as any)?.country ??
    null;

  const website =
    contact?.website ??
    shipper.website ??
    (shipper as any)?.company_website ??
    (shipper as any)?.website ??
    null;

  const domain =
    contact?.domain ??
    shipper.domain ??
    (shipper as any)?.domain ??
    website ??
    (shipper as any)?.website ??
    undefined;
  const logoUrl = getCompanyLogoUrl(domain ?? null);
  const contactPhone =
    contact?.phone ??
    shipper.phone ??
    (shipper as any)?.company_main_phone_number ??
    (shipper as any)?.phone ??
    null;
  const contactWebsite = website;
  const contactEmail = contact?.email;
  const websiteLabel =
    contactWebsite?.replace(/^https?:\/\//i, "").replace(/\/$/, "") ?? null;

  const fallbackAddress = [
    shipper.address,
    (shipper as any)?.city,
    (shipper as any)?.state,
    (shipper as any)?.country,
  ]
    .filter((part) => typeof part === "string" && part.trim().length)
    .map((part) => String(part).trim());

  const displayAddress =
    shipper.address ??
    (fallbackAddress.length ? fallbackAddress.join(", ") : undefined);

  const shipmentsValue =
    kpis?.shipmentsLast12m ??
    shipments12m ??
    (typeof shipper.totalShipments === "number"
      ? shipper.totalShipments
      : null);
  const totalShipmentsLabel =
    typeof shipmentsValue === "number" ? shipmentsValue.toLocaleString() : "—";

  const lastShipmentLabel = shipper.mostRecentShipment || "—";
  const topRouteLabel =
    kpis?.topRouteLast12m ?? topRoute ?? "Top route data coming…";
  const teusValue =
    typeof kpis?.teuLast12m === "number"
      ? kpis.teuLast12m
      : typeof teus12m === "number"
        ? teus12m
        : null;
  const teusLabel =
    typeof teusValue === "number" ? teusValue.toLocaleString() : "—";
  const topRoutes =
    kpis?.topRoutesLast12m?.slice(0, 5).filter((route) => route.route) ?? [];
  const showContactRow = contactPhone || contactWebsite || contactEmail;

  const saveLabel = isSaved
    ? "Saved"
    : isSaving
      ? "Saving…"
      : "Save to Command Center";

  return (
    <div
      ref={cardRef}
      className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <CompanyAvatar
          name={shipper.title}
          size="md"
          className="shrink-0"
          logoUrl={logoUrl}
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-slate-900">
            {shipper.title}
          </h3>
          <div className="mt-1 text-xs text-slate-500 flex flex-wrap items-center gap-1">
            {countryCode && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-600 shrink-0">
                <span aria-hidden="true">
                  {countryCodeToEmoji(countryCode)}
                </span>
                <span>{countryCode}</span>
              </span>
            )}
            {displayAddress && (
              <span className="truncate">{displayAddress}</span>
            )}
          </div>
          {showContactRow && (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
              {contactPhone && <span>📞 {contactPhone}</span>}
              {contactEmail && (
                <a
                  href={`mailto:${contactEmail}`}
                  className="underline decoration-slate-300 hover:decoration-slate-500"
                >
                  {contactEmail}
                </a>
              )}
              {contactWebsite && (
                <a
                  href={
                    /^https?:\/\//i.test(contactWebsite)
                      ? contactWebsite
                      : `https://${contactWebsite}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-slate-300 hover:decoration-slate-500"
                >
                  {websiteLabel ?? contactWebsite}
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* KPI grid */}
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <Target className="h-3.5 w-3.5 text-indigo-500" />
            <span>Shipments (12m)</span>
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {totalShipmentsLabel}
          </p>
        </div>

        <div>
          <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <Calendar className="h-3.5 w-3.5 text-indigo-500" />
            <span>Last shipment</span>
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {lastShipmentLabel}
          </p>
        </div>

        <div>
          <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <MapPin className="h-3.5 w-3.5 text-indigo-500" />
            <span>Top route (12m)</span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-900">
            {topRouteLabel}
          </p>
        </div>

        <div>
          <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <Package className="h-3.5 w-3.5 text-indigo-500" />
            <span>TEUs (12m)</span>
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {teusLabel}
          </p>
        </div>
      </div>

      {/* Top routes */}
      <div className="mt-4">
        <p className="text-[11px] uppercase tracking-wide text-slate-500">
          Top routes (12m)
        </p>
        {topRoutes.length > 0 ? (
          <div className="mt-2 flex flex-col gap-1.5 text-xs text-slate-600">
            {topRoutes.map((route) => (
              <div
                key={`${shipper.key || shipper.title}-${route.route}`}
                className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/60 px-2 py-1"
              >
                <span className="line-clamp-1 pr-2 font-medium text-slate-700">
                  {route.route}
                </span>
                <span className="text-[11px] text-slate-500">
                  {route.shipments.toLocaleString()} shipments
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-400">
            ImportYeti route insights will appear once data loads.
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="mt-5 mt-auto flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onSave}
          className="inline-flex flex-1 items-center justify-center rounded-2xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!onSave || isSaving}
        >
          {saveLabel}
        </button>
        <button
          type="button"
          onClick={onViewDetails}
          className="inline-flex flex-1 items-center justify-center rounded-2xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!onViewDetails}
        >
          View details
        </button>
      </div>
    </div>
  );
}
