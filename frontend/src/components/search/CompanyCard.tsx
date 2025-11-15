import { useMemo } from "react";
import type { CompanyHit } from "@/lib/api";

type CompanyCardProps = {
  data: CompanyHit;
  onViewDetails?: (company: CompanyHit) => void;
  onSave?: (company: CompanyHit) => void | Promise<void>;
  saving?: boolean;
};

function formatDate(value: string): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(parsed);
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return Number(value).toLocaleString();
}

function formatList(values: string[]): string {
  if (!values.length) return "—";
  return values.slice(0, 2).join(" · ");
}

function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "•";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function CompanyCard({ data, onViewDetails, onSave, saving = false }: CompanyCardProps) {
  const topRoutes = useMemo(() => data.top_routes.filter(Boolean).slice(0, 2), [data.top_routes]);
  const topCarriers = useMemo(() => data.top_carriers.filter(Boolean).slice(0, 2), [data.top_carriers]);
  const initials = useMemo(() => getInitials(data.company_name), [data.company_name]);

  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
            {initials}
          </div>
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Company</div>
            <div className="text-lg font-semibold leading-tight text-slate-900" title={data.company_name}>
              {data.company_name}
            </div>
            <div className="text-xs text-slate-500">Last activity · {formatDate(data.last_activity)}</div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onViewDetails?.(data)}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!onViewDetails}
          >
            View Details
          </button>
          <button
            type="button"
            onClick={() => onSave?.(data)}
            className="rounded-full bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!onSave || saving}
          >
            {saving ? "Saving…" : "Save to Command Center"}
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Shipments (12m)</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{formatNumber(data.shipments_12m)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top Routes</p>
          <p className="mt-1 text-sm text-slate-700">{formatList(topRoutes)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top Carriers</p>
          <p className="mt-1 text-sm text-slate-700">{formatList(topCarriers)}</p>
        </div>
      </div>

      <div className="relative mt-5 overflow-hidden rounded-2xl border border-dashed border-slate-200 bg-slate-50">
        <div className="grid gap-3 p-4 text-sm text-slate-600">
          <div className="rounded-xl bg-white/80 p-3 shadow-sm">
            <p className="text-sm font-medium text-slate-700">Pro contact preview</p>
            <p className="mt-1 text-xs text-slate-500">
              Unlock verified contacts, enrichment, and outreach automations when you upgrade.
            </p>
          </div>
          <div className="rounded-xl bg-white/80 p-3 text-xs text-slate-500">
            Save this company to Command Center to keep prospect notes and revisit activity history once additional data is available.
          </div>
        </div>
        <div className="pointer-events-none absolute inset-0 backdrop-blur-[2px]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-white/95 px-4 py-3 text-xs text-slate-600">
          <span>Contacts are gated. Upgrade to Pro to unlock intros and workflows.</span>
          <button
            type="button"
            className="pointer-events-auto rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
          >
            Upgrade
          </button>
        </div>
      </div>
    </div>
  );
}
