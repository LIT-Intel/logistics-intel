import { useMemo } from "react";
import {
  Building2,
  ExternalLink,
  Link2,
  Loader2,
  Sparkles,
  Store,
  Truck,
  Warehouse,
} from "lucide-react";
import LitSectionCard from "@/components/ui/LitSectionCard";
import {
  useRelationshipIntel,
  useResearchRelationshipIntel,
  type IntelFacility,
  type IntelRelationship,
} from "@/api/relationshipIntel";

/**
 * "Network & Relationships" — company-profile card surfacing the AI-researched
 * network picture from `lit_company_relationship_intel`:
 *   - company type (wholesaler/retailer/…) + confidence
 *   - 2-3 sentence freight-relevant summary
 *   - Outbound-FTL likelihood 0-100 (emerald >= 80 / amber 60-79 / slate < 60)
 *     + the model's rationale — "are they shipping FTL from their warehouses
 *     to their distributors?"
 *   - Web-corroborated facilities (warehouse/DC/HQ/plant/store) with sources
 *   - PUBLISHED client/distributor/retail-partner relationships, each with the
 *     citing URL and a supporting quote (shown on hover)
 *
 * Empty state: a "Research network (AI)" button that kicks off the edge fn
 * (~30-60s, Claude + web search; one refresh per company per 7 days).
 * Everything is data-driven — empty sections render nothing.
 */

const COMPANY_TYPE_LABELS: Record<string, string> = {
  wholesaler: "Wholesaler",
  retailer: "Retailer",
  manufacturer: "Manufacturer",
  distributor: "Distributor",
  "3pl": "3PL",
  other: "Other",
};

const FACILITY_KIND_LABELS: Record<string, string> = {
  warehouse: "Warehouse",
  dc: "DC",
  hq: "HQ",
  plant: "Plant",
  store: "Store",
};

const RELATIONSHIP_KIND_LABELS: Record<string, string> = {
  client: "Client",
  distributor: "Distributor",
  retail_partner: "Retail partner",
  carrier: "Carrier",
};

function ftlTone(v: number): { bar: string; badge: string; label: string } {
  if (v >= 80) {
    return {
      bar: "bg-emerald-500",
      badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
      label: "High",
    };
  }
  if (v >= 60) {
    return {
      bar: "bg-amber-500",
      badge: "border-amber-200 bg-amber-50 text-amber-700",
      label: "Moderate",
    };
  }
  return {
    bar: "bg-slate-400",
    badge: "border-slate-200 bg-slate-50 text-slate-600",
    label: "Low",
  };
}

function facilityIcon(kind: string) {
  if (kind === "store") return Store;
  if (kind === "hq") return Building2;
  return Warehouse;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function SourceLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      title={url}
      onClick={(e) => e.stopPropagation()}
      className="font-mono inline-flex shrink-0 items-center gap-0.5 text-[9.5px] text-slate-400 hover:text-[#2563EB]"
    >
      <ExternalLink className="h-2.5 w-2.5" aria-hidden />
      {hostOf(url)}
    </a>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-display mb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
      {children}
    </div>
  );
}

function FacilityRow({ f }: { f: IntelFacility }) {
  const Icon = facilityIcon(f.kind);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
      <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
      <span className="font-display min-w-0 flex-1 truncate text-[11.5px] font-semibold text-slate-900">
        {[f.city, f.state].filter(Boolean).join(", ")}
      </span>
      <span className="font-display shrink-0 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-[1px] text-[9px] font-bold text-slate-600">
        {FACILITY_KIND_LABELS[f.kind] ?? f.kind}
      </span>
      {f.source_url && <SourceLink url={f.source_url} />}
    </div>
  );
}

function RelationshipRow({ r }: { r: IntelRelationship }) {
  return (
    <div
      title={r.quote ? `“${r.quote}”` : undefined}
      className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2"
    >
      <Link2 className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
      <span className="font-display min-w-0 flex-1 truncate text-[11.5px] font-semibold text-slate-900">
        {r.name}
      </span>
      <span className="font-display shrink-0 rounded-full border border-blue-200 bg-blue-50 px-1.5 py-[1px] text-[9px] font-bold text-blue-700">
        {RELATIONSHIP_KIND_LABELS[r.kind] ?? r.kind}
      </span>
      {r.source_url && <SourceLink url={r.source_url} />}
    </div>
  );
}

export default function RelationshipIntelCard({
  companyId,
}: {
  /** ImportYeti slug (source_company_key) — same key as lane history. */
  companyId: string | null;
}) {
  const { data: intel, isLoading } = useRelationshipIntel(companyId);
  const research = useResearchRelationshipIntel(companyId);

  const refreshed = useMemo(() => formatDate(intel?.refreshed_at ?? null), [intel?.refreshed_at]);

  // No key yet, or the read query is still in flight → render nothing (same
  // graceful-hide idiom as InlandFreightCard while data settles).
  if (!companyId || isLoading) return null;

  // ── Empty state: no research yet — offer the AI button ────────────────
  if (!intel) {
    return (
      <LitSectionCard
        title="Network & Relationships"
        sub="Company type, warehouse network & published partners"
      >
        <div className="flex flex-col items-start gap-2">
          <p className="font-body text-[11.5px] leading-snug text-slate-500">
            Research the public web for this company's type, warehouse/DC
            network, and published client &amp; distributor relationships —
            then score how likely they are to ship FTL outbound.
          </p>
          <button
            type="button"
            disabled={research.isPending}
            onClick={() => research.mutate()}
            className="font-display inline-flex min-h-[32px] items-center gap-1.5 rounded-lg bg-[#2563EB] px-3 py-1.5 text-[11.5px] font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {research.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Researching — 30-60s
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Research network (AI)
              </>
            )}
          </button>
          {research.isError && (
            <p className="font-body text-[10.5px] text-red-600">
              Research failed — try again in a moment.
            </p>
          )}
        </div>
      </LitSectionCard>
    );
  }

  // ── Loaded state ───────────────────────────────────────────────────────
  const typeLabel = intel.company_type
    ? COMPANY_TYPE_LABELS[intel.company_type] ?? intel.company_type
    : null;
  const ftl = intel.outbound_ftl_likelihood;
  const tone = ftl != null ? ftlTone(ftl) : null;

  return (
    <LitSectionCard
      title="Network & Relationships"
      sub="AI-researched from public web sources"
      action={
        typeLabel ? (
          <span className="font-display inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-[2px] text-[9.5px] font-bold text-blue-700">
            {typeLabel}
            {intel.company_type_confidence != null && (
              <span className="font-mono font-semibold text-blue-500">
                {intel.company_type_confidence}
              </span>
            )}
          </span>
        ) : undefined
      }
    >
      {/* Summary */}
      {intel.summary && (
        <p className="font-body text-[11.5px] leading-snug text-slate-600">{intel.summary}</p>
      )}

      {/* Outbound FTL likelihood gauge */}
      {ftl != null && tone && (
        <div className={intel.summary ? "mt-3.5" : ""}>
          <div className="flex items-center justify-between gap-2">
            <SectionLabel>
              <span className="inline-flex items-center gap-1">
                <Truck className="h-3 w-3 text-slate-400" aria-hidden />
                Outbound FTL likelihood
              </span>
            </SectionLabel>
            <span
              className={`font-display inline-flex items-center gap-1 rounded-full border px-1.5 py-[1px] text-[9px] font-bold ${tone.badge}`}
            >
              {tone.label}
              <span className="font-mono font-semibold">{ftl}</span>
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${tone.bar}`}
              style={{ width: `${Math.max(2, Math.min(100, ftl))}%` }}
            />
          </div>
          {intel.outbound_ftl_rationale && (
            <p className="font-body mt-1.5 text-[10.5px] leading-snug text-slate-500">
              {intel.outbound_ftl_rationale}
            </p>
          )}
        </div>
      )}

      {/* Facilities found on the web */}
      {intel.facilities.length > 0 && (
        <div className="mt-3.5">
          <SectionLabel>Facilities found</SectionLabel>
          <div className="flex flex-col gap-1.5">
            {intel.facilities.map((f, i) => (
              <FacilityRow key={`${f.city}-${f.state}-${f.kind}-${i}`} f={f} />
            ))}
          </div>
        </div>
      )}

      {/* Published relationships (source-cited only) */}
      {intel.relationships.length > 0 && (
        <div className="mt-3.5">
          <SectionLabel>Published relationships</SectionLabel>
          <div className="flex flex-col gap-1.5">
            {intel.relationships.map((r, i) => (
              <RelationshipRow key={`${r.name}-${i}`} r={r} />
            ))}
          </div>
        </div>
      )}

      {/* Sources footer — plain links, no favicons */}
      {intel.sources.length > 0 && (
        <div className="mt-3.5">
          <SectionLabel>Sources</SectionLabel>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {intel.sources.map((s, i) => (
              <a
                key={`${s.url}-${i}`}
                href={s.url}
                target="_blank"
                rel="noreferrer noopener"
                title={s.title ?? s.url}
                className="font-mono text-[10px] text-slate-400 underline-offset-2 hover:text-[#2563EB] hover:underline"
              >
                {hostOf(s.url)}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Provenance footer */}
      <p className="font-body mt-3 border-t border-slate-100 pt-2 text-[10.5px] leading-snug text-slate-400">
        AI-researched from public web sources
        {refreshed && <> · refreshed {refreshed}</>} · refreshes at most once
        per week
      </p>
    </LitSectionCard>
  );
}
