import { useMemo, useState, type ReactNode } from "react";
import { Anchor, ArrowRight, Warehouse } from "lucide-react";
import LitSectionCard from "@/components/ui/LitSectionCard";
import {
  useCompanyIyFacilities,
  useInlandFreight,
  type InlandFacility,
  type InlandFlow,
  type IyFacility,
} from "@/api/inlandFreight";
import {
  dominantEntryPort,
  formatEntryPortLabel,
  useCompanyPortLanes,
} from "@/api/portLanes";

/** Inland CBP ports of entry — containers clear customs here AFTER railing
 *  from a seaport, so 'port of entry' must not read as an ocean port. Matched
 *  on the city token of the customs entry_port string. */
const INLAND_CBP_CITIES = new Set([
  "atlanta", "chicago", "dallas", "dallas/ft worth", "dallas-fort worth",
  "memphis", "st louis", "st. louis", "cleveland", "detroit", "cincinnati",
  "kansas city", "minneapolis-st. paul", "salt lake city", "charlotte",
  "nashville", "columbus", "louisville", "denver", "el paso", "laredo",
]);

/** True when the customs entry port is an inland rail-ramp CBP location. */
function isInlandCbpPort(entryPort: string): boolean {
  const city = entryPort.split(",")[0]?.trim().toLowerCase() ?? "";
  return INLAND_CBP_CITIES.has(city);
}

/**
 * "Domestic Freight (estimated)" — company-profile card surfacing the
 * MODELED inland truckload picture from `lit_company_inland_freight`:
 * headline ~TL/mo, receiving facilities, port-of-entry → city flows, and
 * (behind a toggle) modeled facility-to-facility transfers.
 *
 * Honesty rules (matches the map's "est. total shipments" convention):
 *   - "Estimated" pill on the header; footer states the data is modeled
 *     from import shipment records, not observed domestic freight.
 *   - Confidence gate: only items with confidence >= 80 show by default; a
 *     subtle "Show lower-confidence" toggle reveals the rest. When nothing
 *     passes the gate, the single highest-confidence item shows anyway
 *     (never an empty card when data exists) with its badge.
 *   - Transfers are always modeled → hidden behind "Show modeled flows"
 *     (default OFF), each row labeled "Modeled".
 *   - Zero/empty sections render nothing — no fake zeros.
 *
 * Renders nothing at all while loading, on error, or when the RPC has no
 * data for this company (same graceful-hide idiom as the lane-intel card).
 */

const HIGH_CONFIDENCE = 80;

/** A modeled facility + whether an ImportYeti address corroborates it. */
type FacilityView = InlandFacility & { iyVerified: boolean };

/**
 * IY-corroboration: a BOL-modeled facility counts as verified when its city
 * AND state both appear in at least one ImportYeti facility address string
 * (case-insensitive; the 2-letter state matches as a whole word so "Az"
 * can't hit inside "Plaza"). Addresses are messy free text — substring
 * matching is deliberately loose, and a miss just means no chip.
 */
function corroborate(
  facilities: InlandFacility[],
  addresses: IyFacility[],
): FacilityView[] {
  if (facilities.length === 0) return [];
  const haystacks = addresses
    .map((a) => a.address.toLowerCase())
    .filter(Boolean);
  return facilities.map((f) => {
    const city = f.city.trim().toLowerCase();
    const state = f.state.trim();
    let iyVerified = false;
    if (city && state && haystacks.length > 0) {
      const stateRe = new RegExp(
        `\\b${state.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
        "i",
      );
      iyVerified = haystacks.some(
        (addr) => addr.includes(city) && stateRe.test(addr),
      );
    }
    return iyVerified
      ? { ...f, iyVerified, confidence: Math.min(100, f.confidence + 15) }
      : { ...f, iyVerified };
  });
}

function ConfidenceBadge({ value }: { value: number }) {
  const v = Math.round(Number(value) || 0);
  const high = v >= HIGH_CONFIDENCE;
  const med = !high && v >= 60;
  return (
    <span
      title={`Model confidence ${v}/100`}
      className={[
        "font-display inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-[1px] text-[9px] font-bold",
        high
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : med
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : "border-slate-200 bg-slate-50 text-slate-500",
      ].join(" ")}
    >
      {high ? "High" : med ? "Medium" : "Low"}
      <span className="font-mono font-semibold">{v}</span>
    </span>
  );
}

/**
 * Confidence gate: default = only items >= 80. If nothing passes but items
 * exist, surface the single highest-confidence item so the section is never
 * empty when data exists. `showLow` reveals everything.
 */
function gateByConfidence<T extends { confidence: number }>(
  items: T[],
  showLow: boolean,
): { visible: T[]; hiddenCount: number } {
  if (showLow || items.length === 0) return { visible: items, hiddenCount: 0 };
  const high = items.filter((i) => i.confidence >= HIGH_CONFIDENCE);
  if (high.length > 0)
    return { visible: high, hiddenCount: items.length - high.length };
  const top = [...items].sort((a, b) => b.confidence - a.confidence)[0];
  return { visible: [top], hiddenCount: items.length - 1 };
}

function formatMonth(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function formatTl(n: number): string {
  return n >= 10 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, "");
}

/** "Mar 12, 2026" from an ISO date, or null when absent/unparseable. */
function formatShortDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="font-display mb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
      {children}
    </div>
  );
}

function FacilityRow({ f }: { f: FacilityView }) {
  const last = formatMonth(f.last_seen);
  return (
    <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
      <Warehouse className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-display truncate text-[11.5px] font-semibold text-slate-900">
            {f.city}
            {f.state ? `, ${f.state}` : ""}
            {f.zip ? ` ${f.zip}` : ""}
          </span>
          <ConfidenceBadge value={f.confidence} />
          {f.iyVerified && (
            <span
              title="City + state matched an ImportYeti facility address on file"
              className="font-display shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-[1px] text-[9px] font-bold text-emerald-700"
            >
              ✓ IY-verified
            </span>
          )}
          {f.class === "3pl" && (
            <span className="font-display shrink-0 rounded-full border border-violet-200 bg-violet-50 px-1.5 py-[1px] text-[9px] font-bold text-violet-700">
              3PL-operated
            </span>
          )}
        </div>
        <div className="font-mono mt-0.5 text-[10px] text-slate-500">
          {f.bols.toLocaleString()} deliveries · {f.containers.toLocaleString()}{" "}
          containers
          {last && <> · last {last}</>}
        </div>
      </div>
    </div>
  );
}

function FlowRow({
  flow,
  entryPortLabel,
  viaRail,
}: {
  flow: InlandFlow;
  /** Real dominant customs entry port ("Savannah, GA") — null falls back to
   *  the generic label. The flow's own origin_port is polluted upstream and
   *  is never displayed. */
  entryPortLabel: string | null;
  viaRail: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
      <Anchor className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
      <div className="font-display flex min-w-0 flex-1 items-center gap-1.5 text-[11.5px] font-semibold text-slate-900">
        <span className="shrink-0 text-slate-500">
          {entryPortLabel ? `${entryPortLabel} (port)` : "Port of entry"}
        </span>
        <ArrowRight className="h-3 w-3 shrink-0 text-blue-500" aria-hidden />
        <span className="truncate">
          {flow.dest_city}
          {flow.dest_state ? `, ${flow.dest_state}` : ""}
        </span>
        {viaRail && (
          <span className="font-body shrink-0 text-[9.5px] font-medium text-slate-400">
            · via rail ramp
          </span>
        )}
      </div>
      {flow.est_tl_month > 0 && (
        <span className="font-mono shrink-0 text-[10.5px] font-semibold text-slate-700">
          ~{formatTl(flow.est_tl_month)} TL/mo
        </span>
      )}
      <ConfidenceBadge value={flow.confidence} />
    </div>
  );
}

export default function InlandFreightCard({
  companyId,
}: {
  /** ImportYeti slug (source_company_key) — same key as lane history. */
  companyId: string | null;
}) {
  const { data } = useInlandFreight(companyId);
  const { data: iyFacilities } = useCompanyIyFacilities(companyId);
  const { data: portLanes } = useCompanyPortLanes(companyId);
  const [showLow, setShowLow] = useState(false);
  const [showModeled, setShowModeled] = useState(false);

  // Real dominant customs entry port for the flow labels — 'Savannah, GA
  // (port) → Atlanta, GA', with a 'via rail ramp' note when the entry port is
  // an inland CBP location (containers cleared after railing from a seaport).
  const entryPort = useMemo(() => {
    const raw = dominantEntryPort(portLanes);
    if (!raw) return { label: null as string | null, viaRail: false };
    return { label: formatEntryPortLabel(raw), viaRail: isInlandCbpPort(raw) };
  }, [portLanes]);

  const facilities = data?.facilities ?? [];
  const flows = data?.flows ?? [];
  const transfers = data?.transfers ?? [];
  const totals = data?.totals ?? null;

  // IY corroboration BEFORE the confidence gate so a +15 boost can lift a
  // verified facility over the high-confidence bar.
  const facilityViews = useMemo(
    () => corroborate(facilities, iyFacilities ?? []),
    [facilities, iyFacilities],
  );
  const facilityGate = useMemo(
    () => gateByConfidence(facilityViews, showLow),
    [facilityViews, showLow],
  );
  const flowGate = useMemo(
    () => gateByConfidence(flows, showLow),
    [flows, showLow],
  );
  const hiddenTotal = facilityGate.hiddenCount + flowGate.hiddenCount;

  // Graceful hide: no RPC / error / not-ok / literally no data → no card.
  if (!data || !data.ok) return null;
  const hasAny =
    facilities.length > 0 ||
    flows.length > 0 ||
    transfers.length > 0 ||
    (totals?.est_tl_month ?? 0) > 0;
  if (!hasAny) return null;

  const ftl = totals?.ftl_bols ?? 0;
  const lcl = totals?.lcl_bols ?? 0;
  const estTl = totals?.est_tl_month ?? 0;

  return (
    <LitSectionCard
      title="Domestic Freight"
      sub="Inland truckload picture, modeled from import records"
      action={
        <span className="font-display rounded-full border border-blue-200 bg-blue-50 px-2 py-[2px] text-[9.5px] font-bold text-blue-700">
          Estimated
        </span>
      }
    >
      {/* Header stat row — mono figures, only when non-zero. */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {estTl > 0 && (
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-[20px] font-bold leading-none text-slate-900">
              ~{formatTl(estTl)}
            </span>
            <span className="font-display text-[11px] font-semibold text-slate-500">
              truckloads/mo
            </span>
          </div>
        )}
        {(ftl > 0 || lcl > 0) && (
          <span className="font-mono text-[11px] text-slate-600">
            {ftl > 0 && `${ftl.toLocaleString()} FTL`}
            {ftl > 0 && lcl > 0 && " · "}
            {lcl > 0 && `${lcl.toLocaleString()} LCL`}
            <span className="text-slate-400"> BOLs</span>
          </span>
        )}
        {facilities.length > 0 && (
          <span className="font-mono text-[11px] text-slate-600">
            {facilities.length}{" "}
            {facilities.length === 1 ? "facility" : "facilities"}
          </span>
        )}
      </div>

      {/* Facilities */}
      {facilityGate.visible.length > 0 && (
        <div className="mt-3.5">
          <SectionLabel>Receiving facilities</SectionLabel>
          <div className="flex flex-col gap-1.5">
            {facilityGate.visible.map((f, i) => (
              <FacilityRow key={`${f.city}-${f.state}-${f.zip ?? i}`} f={f} />
            ))}
          </div>
        </div>
      )}

      {/* IY facility network — observed addresses on file (subtle, data-
          driven: hidden entirely when the company has none). The hook
          returns rows most-recent-shipment first. */}
      {(iyFacilities?.length ?? 0) > 0 && (
        <div className="font-body mt-2.5 text-[10.5px] leading-snug text-slate-400">
          <span className="text-slate-500">
            Facility network: {iyFacilities!.length}{" "}
            {iyFacilities!.length === 1 ? "address" : "addresses"} on file
          </span>
          {iyFacilities!.slice(0, 3).map((a, i) => {
            const when = formatShortDate(a.last_shipment_to);
            return (
              <span key={`${a.address}-${i}`} className="block truncate">
                · {truncate(a.address, 64)}
                {when && <span className="text-slate-300"> — {when}</span>}
              </span>
            );
          })}
        </div>
      )}

      {/* Flows — "Port of entry → City, ST" (raw origin_port never shown). */}
      {flowGate.visible.length > 0 && (
        <div className="mt-3.5">
          <SectionLabel>Inland flows</SectionLabel>
          <div className="flex flex-col gap-1.5">
            {flowGate.visible.map((fl, i) => (
              <FlowRow
                key={`${fl.dest_city}-${fl.dest_state}-${i}`}
                flow={fl}
                entryPortLabel={entryPort.label}
                viaRail={entryPort.viaRail}
              />
            ))}
          </div>
        </div>
      )}

      {/* Toggles — subtle text buttons. */}
      {(hiddenTotal > 0 || showLow || transfers.length > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {(hiddenTotal > 0 || showLow) && (
            <button
              type="button"
              onClick={() => setShowLow((v) => !v)}
              className="font-display inline-flex min-h-[28px] items-center text-[10.5px] font-semibold text-slate-500 hover:text-slate-800 active:scale-[0.97] motion-reduce:active:scale-100"
            >
              {showLow
                ? "Hide lower-confidence"
                : `Show lower-confidence (${hiddenTotal})`}
            </button>
          )}
          {transfers.length > 0 && (
            <button
              type="button"
              onClick={() => setShowModeled((v) => !v)}
              className="font-display inline-flex min-h-[28px] items-center text-[10.5px] font-semibold text-slate-500 hover:text-slate-800 active:scale-[0.97] motion-reduce:active:scale-100"
            >
              {showModeled
                ? "Hide modeled flows"
                : `Show modeled flows (${transfers.length})`}
            </button>
          )}
        </div>
      )}

      {/* Transfers — modeled facility-to-facility moves, toggle-gated. */}
      {showModeled && transfers.length > 0 && (
        <div className="mt-2.5">
          <SectionLabel>Modeled transfers</SectionLabel>
          <div className="flex flex-col gap-1.5">
            {transfers.map((t, i) => (
              <div
                key={`${t.from_city}-${t.to_city}-${i}`}
                className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-2.5 py-2"
              >
                <div className="font-display flex min-w-0 flex-1 items-center gap-1.5 text-[11.5px] font-semibold text-slate-700">
                  <span className="truncate">
                    {t.from_city}
                    {t.from_state ? `, ${t.from_state}` : ""}
                  </span>
                  <ArrowRight className="h-3 w-3 shrink-0 text-slate-400" aria-hidden />
                  <span className="truncate">
                    {t.to_city}
                    {t.to_state ? `, ${t.to_state}` : ""}
                  </span>
                </div>
                <span className="font-display shrink-0 rounded-full border border-slate-200 bg-white px-1.5 py-[1px] text-[9px] font-bold text-slate-500">
                  Modeled
                </span>
                <ConfidenceBadge value={t.confidence} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Honest labeling — matches the map's "est. total shipments" idiom. */}
      <p className="font-body mt-3 border-t border-slate-100 pt-2 text-[10.5px] leading-snug text-slate-400">
        Modeled from import shipment records · not observed domestic freight
      </p>
    </LitSectionCard>
  );
}
