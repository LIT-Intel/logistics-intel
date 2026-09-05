import { Truck, BadgeCheck, MapPin } from "lucide-react";
import LitSectionCard from "@/components/ui/LitSectionCard";
import { useFmcsaFleet, type FmcsaMatch } from "@/api/tradeIntel";

/**
 * "Domestic Fleet (FMCSA)" — REAL observed domestic trucking data from the
 * federal motor-carrier census: does this company run its own trucks, how
 * many, how many drivers, and how many miles last year. Sourced free from
 * FMCSA's public census (updated monthly); every row shows its USDOT number
 * so the claim is auditable. Graceful-hide when no registration matches.
 */

const OPERATION_LABEL: Record<string, string> = {
  A: "Interstate",
  B: "Intrastate (hazmat)",
  C: "Intrastate",
};

function fmtMiles(m: number | null): string | null {
  if (m == null || m <= 0) return null;
  if (m >= 1_000_000) return `${(m / 1_000_000).toFixed(1)}M mi`;
  if (m >= 1_000) return `${Math.round(m / 1_000)}K mi`;
  return `${m} mi`;
}

function FleetRow({ m }: { m: FmcsaMatch }) {
  const miles = fmtMiles(m.recent_mileage);
  return (
    <li className="py-2.5">
      <div className="flex items-center gap-2">
        <span className="font-display min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-900">
          {m.legal_name}
          {m.dba_name ? <span className="font-body ml-1 text-[11px] font-normal text-slate-400">dba {m.dba_name}</span> : null}
        </span>
        <a
          href={`https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${m.dot_number}`}
          target="_blank"
          rel="noreferrer"
          title="View on FMCSA SAFER"
          className="font-mono shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 transition hover:bg-blue-50 hover:text-blue-700"
        >
          DOT {m.dot_number}
        </a>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {m.private_fleet ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
            <BadgeCheck size={10} /> Private fleet
          </span>
        ) : null}
        {m.authorized_for_hire ? (
          <span className="rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
            For-hire authority
          </span>
        ) : null}
        {m.power_units != null && m.power_units > 0 ? (
          <span className="rounded-full bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">
            {m.power_units.toLocaleString()} truck{m.power_units === 1 ? "" : "s"}
          </span>
        ) : null}
        {m.drivers != null && m.drivers > 0 ? (
          <span className="rounded-full bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">
            {m.drivers.toLocaleString()} driver{m.drivers === 1 ? "" : "s"}
          </span>
        ) : null}
        {miles ? (
          <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
            {miles}{m.recent_mileage_year ? ` (${m.recent_mileage_year})` : ""}
          </span>
        ) : null}
        {m.carrier_operation && OPERATION_LABEL[m.carrier_operation] ? (
          <span className="rounded-full bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-200">
            {OPERATION_LABEL[m.carrier_operation]}
          </span>
        ) : null}
        {m.phy_city && m.phy_state ? (
          <span className="inline-flex items-center gap-0.5 text-[10.5px] text-slate-400">
            <MapPin size={9} /> {m.phy_city}, {m.phy_state}
          </span>
        ) : null}
      </div>
    </li>
  );
}

export default function DomesticFleetCard({ companyName }: { companyName: string | null }) {
  const { data } = useFmcsaFleet(companyName);
  const matches = (data ?? []).filter((m) => (m.power_units ?? 0) > 0 || (m.drivers ?? 0) > 0);
  if (matches.length === 0) return null;

  return (
    <LitSectionCard
      title={
        <span className="inline-flex items-center gap-2">
          <Truck className="h-4 w-4 text-blue-600" />
          Domestic Fleet
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700">
            FMCSA
          </span>
        </span>
      }
    >
      <p className="font-body mb-1 text-[12px] leading-snug text-slate-500">
        Registered motor-carrier operations matching this company — real federal data, not modeled.
      </p>
      <ul className="divide-y divide-slate-100">
        {matches.slice(0, 3).map((m) => <FleetRow key={m.dot_number} m={m} />)}
      </ul>
      <p className="font-body mt-2 text-[10.5px] leading-snug text-slate-400">
        FMCSA motor-carrier census (updated monthly). Name-matched — click a DOT number to verify
        on SAFER before relying on it.
      </p>
    </LitSectionCard>
  );
}
