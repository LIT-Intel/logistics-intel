import { Handshake, ShieldAlert } from "lucide-react";
import LitSectionCard from "@/components/ui/LitSectionCard";
import { useCompanyForwarders, type CompanyForwarder } from "@/api/tradeIntel";

/**
 * "Forwarders & Brokers" — who moves this company's freight, straight from the
 * notify-party field on its ocean BOLs. This is displacement intel: the top row
 * is the incumbent a rep is selling against. Real observed data (not modeled),
 * so no "estimated" hedging — the footer states the source instead.
 *
 * Graceful-hide idiom (matches InlandFreightCard): renders nothing while
 * loading, on error, or when the company has no notify-party rows.
 */

function fmtMonth(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** >18 months since the last shipment → the relationship may have lapsed. */
function isStale(f: CompanyForwarder): boolean {
  if (!f.last_shipment) return false;
  const last = new Date(f.last_shipment + "T00:00:00Z").getTime();
  return Date.now() - last > 548 * 24 * 60 * 60 * 1000;
}

function ForwarderRow({ f, rank }: { f: CompanyForwarder; rank: number }) {
  const stale = isStale(f);
  return (
    <li className="flex items-center gap-3 py-2">
      <span
        className={`font-mono grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[11px] font-bold ${
          rank === 0 ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"
        }`}
      >
        {rank + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-display truncate text-[13px] font-semibold text-slate-900">
            {f.forwarder_name}
          </span>
          {rank === 0 ? (
            <span className="shrink-0 rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-blue-700">
              Primary
            </span>
          ) : null}
          {stale ? (
            <span
              title="No shipments through this forwarder in over 18 months"
              className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-amber-700"
            >
              Lapsed
            </span>
          ) : null}
        </div>
        <div className="font-body mt-0.5 text-[11.5px] text-slate-500">
          {f.shipment_count.toLocaleString()} shipment{f.shipment_count === 1 ? "" : "s"}
          {" · last "}{fmtMonth(f.last_shipment)}
        </div>
        {/* Share bar — color carries meaning: solid blue = share of tracked volume */}
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-blue-500"
            style={{ width: `${Math.max(3, Math.min(100, f.share_pct))}%` }}
          />
        </div>
      </div>
      <span className="font-mono shrink-0 text-[11.5px] font-semibold tabular-nums text-slate-600">
        {f.share_pct}%
      </span>
    </li>
  );
}

export default function CDPForwarders({ companyId }: { companyId: string | null }) {
  const { data } = useCompanyForwarders(companyId);
  if (!data || data.length === 0) return null;

  return (
    <LitSectionCard
      title={
        <span className="inline-flex items-center gap-2">
          <Handshake className="h-4 w-4 text-blue-600" />
          Forwarders &amp; Brokers
        </span>
      }
    >
      <p className="font-body mb-1 text-[12px] leading-snug text-slate-500">
        Who moves their freight — the incumbent{data.length > 1 ? "s" : ""} you&apos;re selling against.
      </p>
      <ul className="divide-y divide-slate-100">
        {data.map((f, i) => (
          <ForwarderRow key={f.forwarder_name + i} f={f} rank={i} />
        ))}
      </ul>
      <p className="font-body mt-2 flex items-start gap-1.5 text-[10.5px] leading-snug text-slate-400">
        <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
        Observed from the notify-party field on this company&apos;s import bills of lading.
        Share is of shipments that name a notify party.
      </p>
    </LitSectionCard>
  );
}
