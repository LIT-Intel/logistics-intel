import { useMemo } from "react";
import type { CompanyHit } from "@/lib/api";

type Props = {
  row: CompanyHit | Record<string, unknown>;
  onOpen?: (row: CompanyHit) => void;
  onSave?: (row: CompanyHit) => void | Promise<void>;
  saving?: boolean;
};

function normalizeRow(row: CompanyHit | Record<string, unknown>): CompanyHit {
  const coerceStringArray = (value: unknown): string[] =>
    Array.isArray(value)
      ? value
          .map((item) => {
            if (typeof item === "string") return item;
            if (item && typeof item === "object") {
              if ("route" in item && typeof (item as any).route === "string") return (item as any).route as string;
              if ("value" in item && typeof (item as any).value === "string") return (item as any).value as string;
              if ("carrier" in item && typeof (item as any).carrier === "string") return (item as any).carrier as string;
            }
            return null;
          })
          .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      : [];

  const companyId = typeof (row as any)?.company_id === "string" ? (row as any).company_id : String((row as any)?.id ?? "");
  const companyNameRaw =
    (row as any)?.company_name ??
    (row as any)?.name ??
    (row as any)?.company ??
    "—";
  const shipmentsRaw =
    (row as any)?.shipments_12m ??
    (row as any)?.shipments ??
    (row as any)?.kpis?.shipments_12m ??
    0;
  const lastActivityRaw =
    (row as any)?.last_activity ??
    (row as any)?.lastActivity ??
    (row as any)?.kpis?.last_activity ??
    "";

  return {
    company_id: companyId,
    company_name: typeof companyNameRaw === "string" && companyNameRaw.trim() ? companyNameRaw : "—",
    shipments_12m: Number.isFinite(Number(shipmentsRaw)) ? Number(shipmentsRaw) : 0,
    last_activity: typeof lastActivityRaw === "string" ? lastActivityRaw : "",
    top_routes: coerceStringArray((row as any)?.top_routes),
    top_carriers: coerceStringArray((row as any)?.top_carriers),
  };
}

function formatDate(value: string): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }).format(parsed);
}

function formatList(values: string[]): string {
  if (!values.length) return "—";
  return values.slice(0, 2).join(" · ");
}

export default function CompanyCard({ row, onOpen, onSave, saving = false }: Props) {
  const company = useMemo(() => normalizeRow(row), [row]);

  const shipmentsDisplay = Number.isFinite(company.shipments_12m)
    ? company.shipments_12m.toLocaleString()
    : "—";

  const topRoutes = useMemo(() => company.top_routes.filter(Boolean).slice(0, 2), [company.top_routes]);
  const topCarriers = useMemo(() => company.top_carriers.filter(Boolean).slice(0, 2), [company.top_carriers]);

  const initials = useMemo(() => {
    const name = company.company_name.trim();
    if (!name) return "•";
    const parts = name.split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }, [company.company_name]);

  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
            {initials}
          </div>
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Company</div>
            <div className="text-lg font-semibold leading-tight text-slate-900">{company.company_name}</div>
            <div className="text-xs text-slate-500">Last activity · {formatDate(company.last_activity)}</div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onOpen?.(company)}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!onOpen}
          >
            View Details
          </button>
          <button
            type="button"
            onClick={() => onSave?.(company)}
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
          <p className="mt-1 text-xl font-semibold text-slate-900">{shipmentsDisplay}</p>
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
            Save this company to Command Center to keep prospect notes and revisit activity history once additional data is
            available.
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
